// The account's emails as they're sent (functions/_account.js, functions/api/account, functions/_retention.js,
// functions/_status.js, functions/_desk.js), against a database of their own (Node's SQLite in memory, standing in for
// D1, with the site's schema) and Resend stood in for: a sign-in is told only from a device the account hasn't seen,
// with "This wasn't me" on it; that link signs out every device, removes a passkey added since, sends a reset link, and
// works once; a new email can be undone from the old address; an unused account has three reminders, then a last email
// once it's gone; the owner's incident emails come from "InFlite Status" with the Desk's own page; someone who reported a
// bug while signed in is told once when it's fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { db, hex, sha256, b64url, issueSession } from '../../../functions/_pigeon.js';
import { tellSignIn, withKnown, oneLink, whereFrom } from '../../../functions/_account.js';
import { onRequest as accountApi } from '../../../functions/api/account/[[path]].js';
import { idleAccounts } from '../../../functions/_retention.js';
import { incidentMail } from '../../../functions/_status.js';
import { codeState } from '../../../functions/_desk.js';
import { table as bugsTable } from '../../../functions/_bugs.js';
import { emailFrom } from '../../../functions/_email.js';

function d1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async (col) => { const r = s.prepare(sql).get(...args) ?? null; return col && r ? r[col] ?? null : r; },
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { prepare: (sql) => st(sql), async batch(list) { s.exec('BEGIN'); try { const r = list.map((x) => x.now()); s.exec('COMMIT'); return r; } catch (e) { s.exec('ROLLBACK'); throw e; } } };
}
// (Resend, stood in for: every email kept as it was asked to be sent)
const RESEND = 'http://resend.test/emails', sent = [], real = globalThis.fetch;
globalThis.fetch = async (url, o) => {
  if (String(url) !== RESEND) return real(url, o);
  sent.push(JSON.parse(o.body));
  return new Response('{"id":"1"}', { status: 200 });
};
const env = { DB: d1(), RESEND_API_KEY: 'test', RESEND_API_URL: RESEND, PIGEON_FROM: 'noreply@georgefarrowgreen.com', ACCOUNT_HOST: 'account.localhost' };
const D = await db(env);
const ACCT = 'http://account.localhost:8788';
const req = (path, { cookie, ip = '198.51.100.1', ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' } = {}) =>
  new Request(ACCT + path, { headers: { Origin: ACCT, 'CF-Connecting-IP': ip, 'User-Agent': ua, ...(cookie ? { Cookie: cookie } : {}) } });
async function account(handle, extra = {}) {
  const id = crypto.randomUUID(), t = Date.now();
  await D.prepare(`INSERT INTO pg_users (id, handle, name, email, email_ok, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?, ?, ?, ?, ?, '{}', 'a2:AAAAAAAAAAAAAAAAAAAAAA', 'x', 'v', 3, ?, ?)`)
    .bind(id, handle, `${handle} Test`, `${handle}@example.com`, t, t, extra.created_at ?? t).run();
  return D.prepare('SELECT * FROM pg_users WHERE id = ?').bind(id).first();
}
async function onPage(path, data, { cookie, ip = '198.51.100.50' } = {}) {
  const later = [], request = new Request(`${ACCT}/api/account/${path}`, { method: 'POST',
    headers: { Origin: ACCT, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
  const res = await accountApi({ request, env, params: { path: path.split('/') }, waitUntil: (p) => later.push(p) });
  await Promise.allSettled(later);
  return res;
}
const tokenIn = (html, kind) => (new RegExp(`#${kind}=([A-Za-z0-9_-]{40,50})`).exec(html) || [])[1];

test('a sign-in is told only from a device the account hasn’t seen, with “This wasn’t me” on it', async () => {
  const u = await account('nia');
  sent.length = 0;
  assert.equal(await tellSignIn(env, u, req('/api/account/signin/passkey'), 'Passkey', ACCT, false, 'weather'), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, 'InFlite Account <account@georgefarrowgreen.com>');
  assert.match(sent[0].subject, /^New sign-in on iPhone/);
  assert.ok(tokenIn(sent[0].html, 'secure'), 'with its link');
  assert.match(sent[0].html, /This wasn’t me/); assert.match(sent[0].html, /Weather/);
  // (a device given the account's word as it signed in: not again)
  const word = (await withKnown(new Response('{}'), req('/api/account/signin/passkey'), env, u)).headers.getSetCookie()[0].split(';')[0];
  sent.length = 0;
  assert.equal(await tellSignIn(env, u, req('/api/account/signin/passkey', { cookie: word }), 'Passkey', ACCT, false), false);
  assert.equal(sent.length, 0, 'your own device: nothing');
  assert.equal(whereFrom(req('/')), 'iPhone', 'where: the device, and the place where Cloudflare says it');
});

test('“This wasn’t me”: every device out, a passkey added since removed, a reset link sent; once', async () => {
  const u = await account('oti'), t = Date.now();
  await issueSession(env, u.id, req('/api/account/me')); await issueSession(env, u.id, req('/api/account/me', { ip: '203.0.113.9' }));
  await D.prepare("INSERT INTO pg_passkeys (id, user_id, public_key, alg, label, created_at, sign_count) VALUES ('old', ?, 'k', -7, 'Mine', ?, 0), ('new', ?, 'k', -7, 'Theirs', ?, 0)")
    .bind(u.id, t - 30 * 864e5, u.id, t).run();
  await D.prepare('UPDATE pg_users SET email_new = ?, email_new_code = ?, email_new_at = ? WHERE id = ?').bind('thief@example.com', 'c', t, u.id).run();
  const token = await oneLink(env, u, 'secure');
  sent.length = 0;
  const res = await onPage('secure', { token });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal((await res.json()).email, 'o••@example.com');
  assert.equal((await D.prepare('SELECT COUNT(*) AS n FROM pg_sessions WHERE user_id = ?').bind(u.id).first()).n, 0, 'every device signed out');
  assert.deepEqual((await D.prepare('SELECT id FROM pg_passkeys WHERE user_id = ?').bind(u.id).all()).results.map((r) => r.id), ['old'], 'the one added since: gone');
  assert.equal((await D.prepare('SELECT email_new FROM pg_users WHERE id = ?').bind(u.id).first()).email_new, null, 'a new email waiting: called off');
  assert.equal(sent.length, 1); assert.equal(sent[0].to, u.email); assert.ok(tokenIn(sent[0].html, 'reset'), 'a reset link, to the account’s own address');
  assert.match(sent[0].html, /Asked from/);
  assert.equal((await onPage('secure', { token })).status, 400, 'once');
  assert.equal((await onPage('secure', { token: 'x'.repeat(43) })).status, 400, 'and not a made-up one');
});

test('a new email: the old address told, with a link that puts it back (and signs everyone out)', async () => {
  const u = await account('pip'), token = 'p'.repeat(43);
  await D.prepare('UPDATE pg_users SET email_new = ?, email_new_code = ?, email_new_at = ? WHERE id = ?').bind('pip.new@example.com', hex(await sha256(token)), Date.now(), u.id).run();
  sent.length = 0;
  assert.equal((await onPage('email/change-confirm', { token })).status, 200);
  const note = sent.find((m) => m.to === 'pip@example.com');
  assert.ok(note, 'to the old address'); assert.match(note.html, /Undo this change/);
  await issueSession(env, u.id, req('/api/account/me'));
  sent.length = 0;
  const res = await onPage('email/undo', { token: tokenIn(note.html, 'undo') });
  assert.equal(res.status, 200, await res.clone().text());
  const now = await D.prepare('SELECT email, email_ok FROM pg_users WHERE id = ?').bind(u.id).first();
  assert.equal(now.email, 'pip@example.com'); assert.ok(now.email_ok, 'back, and confirmed');
  assert.equal((await D.prepare('SELECT COUNT(*) AS n FROM pg_sessions WHERE user_id = ?').bind(u.id).first()).n, 0);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'pip@example.com'); assert.ok(tokenIn(sent[0].html, 'reset'));
  assert.equal((await onPage('email/undo', { token: tokenIn(note.html, 'undo') })).status, 400, 'once');
});

test('a passkey removed is told, with “This wasn’t me”; a password’s storage upgraded isn’t', async () => {
  const u = await account('quin'), site = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await D.prepare('UPDATE pg_sessions SET site_hash = ?, auth_at = ? WHERE hash = ?').bind(hex(await sha256(site)), Date.now(), hex(await sha256(await issueSession(env, u.id, req('/api/account/me'))))).run();
  await D.prepare("INSERT INTO pg_passkeys (id, user_id, public_key, alg, label, provider, created_at, sign_count) VALUES ('pk1', ?, 'k', -7, 'Mac', 'iCloud Keychain', ?, 0)").bind(u.id, Date.now()).run();
  sent.length = 0;
  const res = await onPage('passkeys/remove', { id: 'pk1' }, { cookie: `account=${site}` });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(sent.length, 1); assert.equal(sent[0].subject, 'A passkey was removed from your account');
  assert.match(sent[0].html, /iCloud Keychain/); assert.ok(tokenIn(sent[0].html, 'secure'));
});

test('an unused account: reminders 30 days, 7 days and a day before, then a last email once it’s gone', async () => {
  const DAY = 864e5, t0 = Date.now(), long = t0 - 340 * DAY;
  const u = await account('rue', { created_at: long });
  await D.prepare('UPDATE pg_users SET seen_at = ? WHERE id = ?').bind(long, u.id).run();
  await D.prepare('DELETE FROM pg_sessions WHERE user_id = ?').bind(u.id).run();
  const mine = () => sent.filter((m) => m.to === 'rue@example.com').map((m) => m.subject);
  sent.length = 0;
  await idleAccounts(env, D, t0, ACCT);
  const due = (await D.prepare('SELECT idle_due FROM pg_users WHERE id = ?').bind(u.id).first()).idle_due;
  assert.ok(Math.abs(due - (t0 + 30 * DAY)) < 60e3, 'the day it goes: never sooner than 30 days after the first email (a year unused was sooner)');
  assert.equal(mine().length, 1); assert.match(mine()[0], /^Your account will be deleted on /);
  await idleAccounts(env, D, t0 + DAY, ACCT);
  assert.equal(mine().length, 1, 'nothing more for now');
  await idleAccounts(env, D, due - 7 * DAY + 60e3, ACCT);
  assert.deepEqual(mine().slice(1), ['Your account will be deleted in 7 days']);
  await idleAccounts(env, D, due - DAY + 60e3, ACCT);
  assert.deepEqual(mine().slice(2), ['Your account will be deleted tomorrow']);
  await idleAccounts(env, D, due - DAY + 120e3, ACCT);
  assert.equal(mine().length, 3, 'each once');
  await idleAccounts(env, D, due + 60e3, ACCT);
  assert.equal(await D.prepare('SELECT 1 FROM pg_users WHERE id = ?').bind(u.id).first(), null, 'gone on its day');
  assert.deepEqual(mine().slice(3), ['Your account has been deleted']);
});

test('the owner’s incident emails: from InFlite Status, with the Incident Desk’s own page for it', () => {
  const t = Date.UTC(2026, 10, 5, 21, 5), down = incidentMail(env, { open: true, id: 'i42', title: 'Market alerts not running', svcs: ['mkttick'], text: 'Market alerts isn’t running: two checks in a row failed.', started: t });
  assert.equal(down.subject, 'Down: Market alerts not running');
  assert.match(down.html, /#admin=incident:i42/); assert.match(down.html, /Open in Incident Desk/); assert.match(down.html, /Since 21:05/);
  const up = incidentMail(env, { open: false, id: 'i42', title: 'Market alerts not running', svcs: ['mkttick'], text: 'Market alerts is working again.', started: t, ended: t + 25 * 60e3, said: 2 });
  assert.equal(up.subject, 'Resolved: Market alerts (down 25 minutes)'); assert.match(up.html, /Write it up/);
  assert.equal(emailFrom({ CF_EMAIL_TOKEN: 't', CF_ACCOUNT_ID: 'a' }, 'status'), 'InFlite Status <status@inflite.ai>');
});

test('someone who reported a bug while signed in is told once when it’s marked fixed', async () => {
  const u = await account('sky'), B = await bugsTable(env);
  await B.prepare("INSERT INTO pg_bugs (id, code, app, kind, at, version, user_id) VALUES ('b1', 'IF-T-RMS1H', 'today', 'manual', ?, '1.67', ?), ('b2', 'IF-T-RMS1H', 'today', 'manual', ?, '1.67', NULL)")
    .bind(Date.now() - 864e5, u.id, Date.now()).run();
  sent.length = 0;
  await codeState(env, { code: 'IF-T-RMS1H', state: 'fixed' });
  const told = sent.filter((m) => m.to === 'sky@example.com');
  assert.equal(told.length, 1); assert.equal(told[0].subject, 'Fixed: the problem you reported (IF-T-RMS1H)');
  assert.match(told[0].html, /#IF-T-RMS1H/); assert.match(told[0].html, /Today 1\.67/);
  assert.equal(sent.length, 1, 'only those signed in when they sent it');
  await codeState(env, { code: 'IF-T-RMS1H', state: 'fixed' });
  assert.equal(sent.length, 1, 'once');
});

// ---- the Emails page: each kind of Chat's emails its own, kept as the page sends them; its link turns off just its kind ----
const { onRequest: pigeonApi } = await import('../../../functions/api/pigeon/[[path]].js');
const { chatEmails, unsubToken } = await import('../../../functions/_notify.js');
async function signedInHere(u) {
  const site = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await D.prepare('UPDATE pg_sessions SET site_hash = ? WHERE hash = ?').bind(hex(await sha256(site)), hex(await sha256(await issueSession(env, u.id, req('/api/account/me'))))).run();
  return `account=${site}`;
}
async function patchNotify(cookie, data) {
  const request = new Request(`${ACCT}/api/account/notify`, { method: 'PATCH', headers: { Origin: ACCT, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
  const res = await accountApi({ request, env, params: { path: ['notify'] }, waitUntil: () => {} });
  return { s: res.status, j: await res.json() };
}
const row = (id) => D.prepare('SELECT * FROM pg_users WHERE id = ?').bind(id).first();

test('the Emails page: each of Chat’s emails its own switch, Chat’s emails on while any is; the fixed-report email too', async () => {
  const u = await account('tam'), cookie = await signedInHere(u);
  assert.deepEqual(chatEmails(await row(u.id)), { messages: false, landed: false, requests: false, weekly: false }, 'Chat’s emails off: none of them');
  let r = await patchNotify(cookie, { chat: { emails: { requests: true } } });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.chat.emails, { messages: false, landed: false, requests: true, weekly: false }, 'turned on from off: just that one');
  assert.equal((await row(u.id)).notify_email, 1);
  r = await patchNotify(cookie, { chat: { email: true } });
  assert.deepEqual(r.j.chat.emails, { messages: true, landed: true, requests: true, weekly: true }, 'all at once, as Chat’s own switch does it');
  r = await patchNotify(cookie, { chat: { emails: { messages: false, landed: false, requests: false, weekly: false } } });
  assert.equal(r.j.chat.email, false, 'every kind off: Chat’s emails off'); assert.equal((await row(u.id)).notify_email, 0);
  assert.equal((await patchNotify(cookie, { chat: { emails: { nonsense: true } } })).s, 400);
  assert.equal(r.j.account.fixed, true, 'the fixed-report email: on unless turned off');
  r = await patchNotify(cookie, { account: { fixed: false } });
  assert.equal(r.j.account.fixed, false);
});

test('an email’s link turns off just its kind (a GET only asks); one without a kind, all of Chat’s', async () => {
  const u = await account('uma'), cookie = await signedInHere(u);
  await patchNotify(cookie, { chat: { email: true } });
  const tok = await unsubToken(env, u.id), at = (k) => `http://chat.localhost:8788/api/pigeon/unsubscribe?u=${u.id}&t=${tok}${k ? `&k=${k}` : ''}`;
  const hit = (method, url) => pigeonApi({ request: new Request(url, { method }), env, params: { path: ['unsubscribe'] }, waitUntil: () => {} });
  const ask = await (await hit('GET', at('weekly'))).text();
  assert.match(ask, /Turn off week in flight emails\?/); assert.match(ask, /Turn Off All Chat Emails/);
  assert.equal(chatEmails(await row(u.id)).weekly, true, 'asking changes nothing');
  assert.match(await (await hit('POST', at('weekly'))).text(), /Notifications → Emails/);
  assert.deepEqual(chatEmails(await row(u.id)), { messages: true, landed: true, requests: true, weekly: false }, 'just that kind off');
  await hit('POST', at(null));
  assert.equal((await row(u.id)).notify_email, 0, 'without a kind: all of Chat’s');
});
