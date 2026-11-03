// What Mail tells InFlite (One roof, stage 4, S4-D8–D10; the inflite repo's email/, beside this one), through Mail's
// Worker against a real database (node:sqlite as D1, Mail's own schema), the account standing in: Today's card by the
// shared key alone (missing, wrong, none set: refused), numbers only; a notice's words for People (or an address that
// notifies for Updates, or a conversation back from Later), 120 characters at most, even when the 12-hour check is due;
// searches in a request's body giving what the address form gives, without moving the mailbox's version on; and Mail's
// own notices only when the account says it isn't telling anyone: !on || (will === 0 && !held), or, unanswered, only when
// the last answer heard was off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as roof from './fixtures/roof.mjs';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = roof.mailSkip || (!existsSync(new URL('src/connect.js', MAIL)) && 'the inflite repo beside has no InFlite side to Mail’s Worker yet (email/src/connect.js): its live branch, while this repo goes live first');
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
const asked = [];
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => (asked.push(q), sql.prepare(q).get(...val(a)) ?? null),
  all: async () => (asked.push(q), { results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => (asked.push(q), { meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const DB = { prepare: (q) => st(q), batch: async (list) => { const out = []; for (const s of list) out.push(await s.all()); return out; } };
const R2 = { put: async () => {}, get: async () => null, delete: async () => {} };
const KEY = 'mail-test-key-0123456789';
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai', HUB_ORIGIN: 'https://inflite.ai', HUB_API: '1', MAIL_KEY: KEY,
  ASSETS: { fetch: async () => new Response('') } };
const later = [];
const ctx = { waitUntil: (p) => later.push(Promise.resolve(p).catch(() => {})) };

// (the account: who's signed in, and what it says to a notice)
let view = { signedIn: true, admin: true, passkey: true, fresh: true, name: 'George' };
let noticeAnswer = () => new Response(JSON.stringify({ on: false, will: 0, held: false }));
const told = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  const s = String(u);
  if (s === `${env.ACCOUNT_ORIGIN}/api/account/mail/notice`) { told.push({ init, body: JSON.parse(init.body) }); return noticeAnswer(init); }
  if (s.startsWith(env.ACCOUNT_ORIGIN)) return new Response(JSON.stringify(view), { headers: { 'Content-Type': 'application/json' } });
  return realFetch(u, init);
};
const ask = async (path, { method = 'GET', headers = {}, body, cookie = true, hub = true } = {}) => {
  const { default: worker } = await load('src/index.js');
  const h = { ...(cookie && { Cookie: `account=${'c'.repeat(24)}${Math.random().toString(36).slice(2, 8)}` }), ...(hub && { Origin: 'https://inflite.ai', 'Sec-Fetch-Site': 'same-site' }), ...headers };
  if (body !== undefined) Object.assign(h, { 'Content-Type': 'application/json', 'X-Inflite': '1' });
  const res = await worker.fetch(new Request(`https://email.inflite.ai${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
};
const msg = (id, x) => { const r = { id, folder: 'inbox', thread_id: id, mailbox: 'hello@inflite.ai', from_name: 'Pat Smith', from_email: 'pat@example.com', subject: `About ${id}`, snippet: 'hi', date: Date.now() - 60e3, unread: 1, category: 'people', ...x };
  sql.prepare(`INSERT INTO messages (${Object.keys(r).join(', ')}) VALUES (${Object.keys(r).map(() => '?').join(', ')})`).run(...val(Object.values(r))); };
let seeded = false;
async function seed() {
  if (seeded) return;
  seeded = true;
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  msg('p1', {});
  msg('p2', { unread: 0, subject: 'Re: ' + 'Long words '.repeat(30), from_name: 'N'.repeat(200) });
  msg('u1', { category: 'updates', from_name: 'Shop', subject: 'Sale' });
  msg('u2', { category: 'updates', mailbox: 'alerts@inflite.ai', from_name: 'Bank', subject: 'Statement' });
  msg('l1', { snooze_until: Date.now() + 3 * 3600e3, subject: 'Later one' });
  msg('w1', { category: 'updates', subject: 'Re: Woken', bumped_at: Date.now() - 1000, date: Date.now() - 864e5 });
  sql.prepare(`INSERT INTO addresses (email, name, color, category, notify, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('hello@inflite.ai', '', 'blue', null, 1, 1, 1);
  sql.prepare(`INSERT INTO addresses (email, name, color, category, notify, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('alerts@inflite.ai', '', 'blue', 'updates', 1, 0, 2);
  sql.prepare(`INSERT INTO contacts (email, name, count, last_used) VALUES (?, ?, ?, ?)`).run('pat@example.com', 'Pat Smith', 3, Date.now());
}

test('Today’s card: by the shared key alone, compared in constant time; numbers only, never a word of mail', { skip }, async () => {
  await seed();
  for (const [h, why] of [[{}, 'no key'], [{ Authorization: 'Bearer wrong' }, 'a wrong key'], [{ Authorization: `Bearer ${KEY}x` }, 'one longer'], [{ Authorization: KEY }, 'not Bearer'], [{ Authorization: `Basic ${KEY}` }, 'Basic']]) {
    const r = await ask('/api/connector/card', { headers: h, hub: false });
    assert.equal(r.status, 401, why);
    assert.ok(!('people' in (r.data || {})), why);
  }
  assert.equal((await ask('/api/connector/card', { cookie: true, hub: true })).status, 401, 'a sign-in is no key');
  const saved = env.MAIL_KEY;
  delete env.MAIL_KEY;
  assert.equal((await ask('/api/connector/card', { headers: { Authorization: 'Bearer ' }, hub: false, cookie: false })).status, 401, 'no key set: no one');
  assert.equal((await ask('/api/connector/card', { headers: { Authorization: 'Bearer undefined' }, hub: false, cookie: false })).status, 401);
  env.MAIL_KEY = saved;
  view = { signedIn: false };
  const r = await ask('/api/connector/card', { headers: { Authorization: `Bearer ${KEY}` }, hub: false, cookie: false });
  view = { signedIn: true, admin: true, passkey: true, fresh: true, name: 'George' };
  assert.equal(r.status, 200, 'no cookie needed, whoever is or isn’t signed in');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(r.data).sort(), ['later', 'people', 'updates']);
  assert.deepEqual(Object.keys(r.data.later).sort(), ['n', 'next']);
  assert.equal(r.data.people, 1, 'unread from people');
  assert.equal(r.data.updates, 3, 'unread Updates');
  assert.equal(r.data.later.n, 1);
  assert.ok(Number.isInteger(r.data.later.next) && r.data.later.next > Date.now());
  assert.doesNotMatch(JSON.stringify(r.data), /Pat|About|Later one|example/, 'numbers only');
  // (compared by digest, byte by byte: never the key itself with ===)
  const src = readFileSync(new URL('src/connect.js', MAIL), 'utf8');
  assert.match(src, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(src, /d \|= x\[i\] \^ y\[i\]/);
  assert.doesNotMatch(src, /(MAIL_KEY|key)\s*===?\s*m\[1\]|m\[1\]\s*===?\s*key/);
});

test('a notice’s words: People, an address that notifies for Updates, or back from Later; 120 characters; even at the 12-hour check', { skip }, async () => {
  await seed();
  const p1 = await ask('/api/notice/p1');
  assert.equal(p1.status, 200);
  assert.deepEqual(p1.data, { title: 'Pat Smith', body: 'About p1' });
  assert.equal(p1.headers.get('cache-control'), 'no-store');
  assert.equal(p1.headers.get('access-control-allow-origin'), 'https://inflite.ai', 'InFlite’s root worker reads it by CORS');
  const p2 = await ask('/api/notice/p2');
  assert.ok(p2.data.title.length <= 120 && p2.data.body.length <= 120, 'cut to 120');
  assert.equal((await ask('/api/notice/u1')).status, 404, 'Updates: no notice was due');
  assert.deepEqual((await ask('/api/notice/u2')).data, { title: 'Bank', body: 'Statement' }, 'an address set to Updates that notifies');
  assert.deepEqual((await ask('/api/notice/w1')).data, { title: 'Pat Smith', body: 'Back from Later: Woken' }, 'back from Later');
  assert.equal((await ask('/api/notice/nope')).status, 404);
  assert.equal((await ask('/api/notice/a.b')).status, 404, 'not an id');
  view = { signedIn: true, admin: true, passkey: true, fresh: false, name: 'George' };
  assert.equal((await ask('/api/notice/p1')).status, 200, 'the 12-hour check due: still the words');
  assert.equal((await ask('/api/counts')).status, 401, 'but nothing else');
  view = { signedIn: false };
  assert.equal((await ask('/api/notice/p1')).status, 401, 'signed out: none');
  view = { signedIn: true, admin: false, passkey: true, fresh: true };
  assert.equal((await ask('/api/notice/p1')).status, 401, 'not the admin: none');
  view = { signedIn: true, admin: true, passkey: true, fresh: true, name: 'George' };
});

test('searches in a request’s body: what the address form finds, a count too; 300 characters at most; the mailbox’s version unmoved', { skip }, async () => {
  await seed();
  const own = { hub: false, headers: { 'Sec-Fetch-Site': 'same-origin' } };
  for (const q of [{ q: 'about', view: 'all' }, { q: 'from:pat', category: 'people' }, { q: 'sale' }, { q: '', view: 'later' }, { view: 'all', address: 'alerts@inflite.ai' }]) {
    const sp = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
    const viaGet = await ask(`/api/threads?${sp}`, own);
    const viaPost = await ask('/api/threads/search', { method: 'POST', body: q });
    assert.equal(viaPost.status, 200);
    assert.deepEqual(viaPost.data.threads.map((t) => t.id), viaGet.data.threads.map((t) => t.id), JSON.stringify(q));
    const n = await ask('/api/threads/search', { method: 'POST', body: { ...q, count: true } });
    assert.equal(n.data.count, (await ask(`/api/threads?${sp}&count=1`, own)).data.count, `${JSON.stringify(q)}: count`);
  }
  assert.ok((await ask('/api/threads/search', { method: 'POST', body: { q: 'about' } })).data.threads.every((t) => typeof t.latestId === 'string'), 'each with its newest message');
  assert.equal((await ask('/api/threads/search', { method: 'POST', body: { q: 'x'.repeat(301) } })).status, 400);
  assert.equal((await ask('/api/threads/search', { method: 'POST', body: { q: 'x'.repeat(300) } })).status, 200);
  const c = await ask('/api/contacts/find', { method: 'POST', body: { q: 'pat' } });
  assert.deepEqual(c.data, (await ask('/api/contacts?q=pat', own)).data);
  assert.equal(c.data.contacts[0].email, 'pat@example.com');
  while (later.length) await later.shift();
  asked.length = 0;
  await ask('/api/threads/search', { method: 'POST', body: { q: 'about' } });
  await ask('/api/contacts/find', { method: 'POST', body: { q: 'pat' } });
  while (later.length) await later.shift();
  assert.ok(!asked.some((q) => /k, v\) VALUES \('v'/.test(q)), 'a search changes nothing');
});

test('Mail’s own notice only when the account isn’t telling anyone; unanswered, only when the last answer was off; no key, as before', { skip }, async () => {
  await seed();
  const { noticeInflite } = await load('src/push.js');
  const cases = [
    [{ on: false, will: 0, held: false }, true],
    [{ on: false, will: 2, held: false }, true],
    [{ on: true, will: 2, held: false }, false],
    [{ on: true, will: 0, held: false }, true],
    [{ on: true, will: 0, held: true }, false],
  ];
  for (const [a, own] of cases) {
    noticeAnswer = () => new Response(JSON.stringify(a));
    told.length = 0;
    assert.equal(await noticeInflite(env, { kind: 'new', threadId: 'p1' }), own, JSON.stringify(a));
    const { init, body } = told[0];
    assert.deepEqual(body, { kind: 'new', thread: 'p1' }, 'the id alone, no words');
    assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(init.headers['X-Inflite'], '1');
    assert.ok(init.signal instanceof AbortSignal, 'not waited on for ever');
    assert.equal(sql.prepare(`SELECT v FROM meta WHERE k = 'inflite_on'`).get().v, a.on ? '1' : '0', 'its on kept');
  }
  // (unanswered, or answered with nonsense: by the last on heard)
  for (const fail of [() => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), () => new Response('nope', { status: 500 }), () => new Response(JSON.stringify({ on: 'yes' }))]) {
    noticeAnswer = () => new Response(JSON.stringify({ on: true, will: 1, held: false }));
    await noticeInflite(env, { kind: 'new', threadId: 'p1' });
    noticeAnswer = fail;
    assert.equal(await noticeInflite(env, { kind: 'later', threadId: 'p1' }), false, 'last on: a miss rather than a double');
    noticeAnswer = () => new Response(JSON.stringify({ on: false, will: 0, held: false }));
    await noticeInflite(env, { kind: 'new', threadId: 'p1' });
    noticeAnswer = fail;
    assert.equal(await noticeInflite(env, { kind: 'later', threadId: 'p1' }), true, 'last off: Mail’s own');
  }
  sql.prepare(`DELETE FROM meta WHERE k = 'inflite_on'`).run();
  assert.equal(await noticeInflite(env, { kind: 'new', threadId: 'p1' }), true, 'never heard: the choice starts off');
  told.length = 0;
  assert.equal(await noticeInflite({ ...env, MAIL_KEY: undefined }, { kind: 'new', threadId: 'p1' }), true, 'no key: as before');
  assert.equal(told.length, 0, 'and the account not asked');
});

test('the call sites: back from Later and new mail push Mail’s own only as noticeInflite says', { skip }, async () => {
  await seed();
  const { default: worker } = await load('src/index.js');
  sql.prepare(`INSERT INTO meta (k, v) VALUES ('tidy_day', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(new Date().toISOString().slice(0, 10));
  const pushes = () => asked.filter((q) => /FROM push_subs/.test(q)).length;
  for (const [a, n] of [[{ on: true, will: 1, held: false }, 0], [{ on: true, will: 0, held: true }, 0], [{ on: false, will: 0, held: false }, 1]]) {
    msg(`wake${n}${a.held}`, { snooze_until: Date.now() - 60e3 });
    noticeAnswer = () => new Response(JSON.stringify(a));
    told.length = 0;
    asked.length = 0;
    await worker.scheduled({}, env, ctx);
    assert.deepEqual(told.map((t) => t.body.kind), ['later'], 'the account told, as Later');
    assert.equal(pushes(), n, JSON.stringify(a));
  }
  // (new mail: the same rule gates Mail's own notice, receive.js)
  const src = readFileSync(new URL('src/receive.js', MAIL), 'utf8');
  assert.match(src, /noticeInflite\(env, \{ kind: "new", threadId \}\)\.then\(async \(own\) =>\s+own &&\s+pushAll\(/);
});
