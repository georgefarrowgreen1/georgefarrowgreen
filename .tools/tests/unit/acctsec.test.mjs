// The account's sign-in and getting back in, run as they are against a database of their own (Node's own SQLite in
// memory, standing in for D1, with the site's schema): a reset link's server key stays the same however often the link's
// opened; a sign-in an app handed over to a browser signed in to nothing is the account page's alone until it's shown
// it's you; and guessing a password from many networks at once holds the account back, but not on a device that's
// signed in to it before (or made it), for each account it has, while its password is the one it was given with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { db, hex, sha256, b64url, createReset, findReset, resetKx, keyProofOk, issueSession } from '../../../functions/_pigeon.js';
import { passwordUser, cookieUser, withKnown } from '../../../functions/_account.js';
import { onRequest as accountApi } from '../../../functions/api/account/[[path]].js';
import { E2E } from '../../../pigeon/crypto.js';

// D1, as much of it as the server uses: prepare, bind, first, all, run, and batch (all or nothing)
function d1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { prepare: (sql) => st(sql), async batch(list) { s.exec('BEGIN'); try { const r = list.map((x) => x.now()); s.exec('COMMIT'); return r; } catch (e) { s.exec('ROLLBACK'); throw e; } } };
}
const env = { DB: d1() };
const D = await db(env);
const proofOf = (pw) => b64url(new Uint8Array(32).fill(pw.length)).slice(0, 43);
async function account(handle, pw) {
  const id = crypto.randomUUID(), t = Date.now(), { pub } = await E2E.newIdentity();
  await D.prepare(`INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 3, ?, ?)`)
    .bind(id, handle, handle, `${handle}@example.com`, JSON.stringify(pub), E2E.newSalt(), hex(await sha256(new Uint8Array(32).fill(pw.length))), 'v'.repeat(40), t, t).run();
  return D.prepare('SELECT * FROM pg_users WHERE id = ?').bind(id).first();
}
const ACCT = 'http://account.localhost:8788', req = (path, { cookie, ip = '198.51.100.1' } = {}, host = ACCT) =>
  new Request(host + path, { headers: { Origin: host, 'CF-Connecting-IP': ip, ...(cookie ? { Cookie: cookie } : {}) } });

test('a reset link keeps one server key for its life: opened again elsewhere, the first tab still keeps the key', async () => {
  const u = await account('kim', 'a long test password'), id = await E2E.newIdentity();
  await D.prepare('UPDATE pg_users SET pub = ? WHERE id = ?').bind(JSON.stringify(id.pub), u.id).run();
  const token = await createReset(env, u.id, 'user', 3600e3);
  const first = await resetKx(env, (await findReset(env, token)).reset);
  const again = await resetKx(env, (await findReset(env, token)).reset);
  assert.deepEqual(again, first, 'the same key, however often the link is checked');
  assert.deepEqual(Object.keys(first).sort(), ['crv', 'kty', 'x', 'y'], 'and only its public half');
  // the first tab's proof, made with the key it was given, still checks out
  const { reset } = await findReset(env, token);
  const proof = await E2E.keyProof(await E2E.importPriv(id.privJwk), first, 'reset|' + reset.hash);
  assert.equal(await keyProofOk(reset, JSON.stringify(id.pub), proof), true);
  // (a new link has a key of its own)
  const other = await resetKx(env, (await findReset(env, await createReset(env, u.id, 'user', 3600e3))).reset);
  assert.notDeepEqual(other, first);
});

test('a sign-in handed over to a browser signed in to nothing: the account page’s alone until it’s shown it’s you', async () => {
  const u = await account('lou', 'a long test password');
  const from = hex(await sha256(await issueSession(env, u.id, req('/api/weather/me'))));
  const hash = hex(await sha256(await issueSession(env, u.id, req('/api/account/handoff')))), site = 'h'.repeat(43);
  await D.prepare('UPDATE pg_sessions SET auth_at = 0, parent = ?, handed = 1, site_hash = ? WHERE hash = ?').bind(from, hex(await sha256(site)), hash).run();
  const cookie = `account=${site}`;
  const here = await cookieUser(req('/api/account/me', { cookie }), env);
  assert.equal(here?.id, u.id, 'on the account’s page: signed in');
  assert.equal(here.handed, true);
  for (const path of ['/api/weather/me', '/api/pigeon/resume', '/api/me', '/api/me/photo'])
    assert.equal(await cookieUser(req(path, { cookie }), env), null, `${path}: signed out`);
  assert.equal((await D.prepare('SELECT parent FROM pg_sessions WHERE hash = ?').bind(hash).first()).parent, from, 'and still part of the app’s sign-in it came from');
  // shown it's you (functions/api/account reauth): the browser's own from then on
  await D.prepare('UPDATE pg_sessions SET auth_at = ?, handed = NULL WHERE hash = ?').bind(Date.now(), hash).run();
  assert.equal((await cookieUser(req('/api/weather/me', { cookie }), env))?.id, u.id);
});

test('guessing from many networks holds the account back, but not on a device that’s signed in to it before', async () => {
  const u = await account('max', 'a long test password'), right = { email: u.email, proof: proofOf('a long test password') };
  // a device signs in, and keeps the word that it has
  const res = await withKnown(new Response('{}'), req('/api/account/signin/password'), env, u);
  const word = res.headers.get('Set-Cookie');
  assert.match(word, /^known-[0-9a-f]{8}=[0-9a-f]{32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
  const known = word.split(';')[0];
  // 300 wrong passwords, ten from each of 30 networks
  for (let n = 1; n <= 30; n++) for (let i = 0; i < 10; i++)
    await assert.rejects(passwordUser(env, req('/api/account/signin/password', { ip: `203.0.113.${n}` }), { email: u.email, proof: 'x'.repeat(43) }), { status: 401 });
  await assert.rejects(passwordUser(env, req('/api/account/signin/password', { ip: '198.51.100.7' }), right), { status: 429, message: /for this account.*passkey/ },
    'a new device, even with the right password: held back');
  assert.equal((await passwordUser(env, req('/api/account/signin/password', { ip: '198.51.100.8', cookie: known }), right)).id, u.id, 'the device that knows it: in');
  // (its own wrong tries count against it alone, ten an hour, not the account)
  for (let i = 0; i < 10; i++) await assert.rejects(passwordUser(env, req('/api/account/signin/password', { ip: `192.0.2.${i}`, cookie: known }), { email: u.email, proof: 'y'.repeat(43) }), { status: 401 });
  await assert.rejects(passwordUser(env, req('/api/account/signin/password', { ip: '192.0.2.99', cookie: known }), right), { status: 429, message: /^Too many tries\. Wait/ });
  // a word that isn't the server's, or is another account's, counts for nothing
  const other = await account('ned', 'another test password'), theirs = (await withKnown(new Response('{}'), req('/'), env, other)).headers.get('Set-Cookie').split(';')[0];
  const forged = known.replace(/\.[^.]+$/, '.' + 'A'.repeat(32));
  for (const cookie of [forged, theirs]) await assert.rejects(passwordUser(env, req('/api/account/signin/password', { ip: '198.51.100.9', cookie }), right), { status: 429, message: /for this account/ });
});

// (the account's own hold filled, as by guessing from 30 networks at once)
const heldBack = async (u) => D.prepare('INSERT OR REPLACE INTO pg_limits (key, count, reset_at) VALUES (?, 300, ?)')
  .bind('loginacct:' + hex(await sha256(u.email)).slice(0, 32), Date.now() + 3600e3).run();
const wordFor = async (u) => (await withKnown(new Response('{}'), req('/api/account/signin/password'), env, u)).headers.get('Set-Cookie').split(';')[0];
const signIn = (u, pw, cookie, ip = '198.51.100.30') => passwordUser(env, req('/api/account/signin/password', { ip, cookie }), { email: u.email, proof: proofOf(pw) });

test('a word for each account: signing in to another on the same device doesn’t take the first one’s place', async () => {
  const a = await account('ola', 'a long test password'), b = await account('pip', 'another test password');
  const wa = await wordFor(a), wb = await wordFor(b);
  assert.notEqual(wa.split('=')[0], wb.split('=')[0], 'each under a name of its own');
  await heldBack(a); await heldBack(b);
  const both = `${wa}; ${wb}`;
  assert.equal((await signIn(a, 'a long test password', both)).id, a.id);
  assert.equal((await signIn(b, 'another test password', both)).id, b.id);
});

test('a word’s good only for the password it was given with, and the account it was given for', async () => {
  const u = await account('rue', 'a long test password'), old = await wordFor(u);
  await heldBack(u);
  assert.equal((await signIn(u, 'a long test password', old)).id, u.id, 'known: in');
  // a new password (or a reset): every word from before counts for nothing, and the next sign-in gives a new one
  await D.prepare('UPDATE pg_users SET proof_hash = ?, pw_at = ? WHERE id = ?').bind(hex(await sha256(new Uint8Array(32).fill('a newer password'.length))), Date.now(), u.id).run();
  const now = await D.prepare('SELECT * FROM pg_users WHERE id = ?').bind(u.id).first();
  await assert.rejects(signIn(u, 'a newer password', old), { status: 429, message: /for this account/ }, 'the old word, with the new password: held back');
  assert.equal((await signIn(u, 'a newer password', await wordFor(now))).id, u.id, 'a word given since: in');
  // the account deleted, and its email used for a new one: not that one's word either
  const fresh = await wordFor(now);
  await D.prepare('DELETE FROM pg_users WHERE id = ?').bind(u.id).run();
  const again = await account('rue2', 'a newer password');
  await D.prepare('UPDATE pg_users SET email = ?, pw_at = ? WHERE id = ?').bind(u.email, now.pw_at, again.id).run();
  await assert.rejects(signIn({ email: u.email }, 'a newer password', fresh), { status: 429, message: /for this account/ });
});

test('an account made here: the device it was made on is known to it from the start', async () => {
  const id = await E2E.newIdentity(), later = [], ACCT_ENV = { ...env, PIGEON_OPEN_SIGNUP: '1', ACCOUNT_HOST: 'account.localhost' };
  const request = new Request(ACCT + '/api/account/signup', { method: 'POST', headers: { Origin: ACCT, 'CF-Connecting-IP': '198.51.100.40', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sol', handle: 'sol', email: 'sol@example.com', salt: E2E.newSalt(), proof: proofOf('a long test password'), vault: 'v'.repeat(40), pub: id.pub }) });
  const res = await accountApi({ request, env: ACCT_ENV, params: { path: ['signup'] }, waitUntil: (p) => later.push(p) });
  await Promise.allSettled(later);
  assert.equal(res.status, 201, await res.clone().text());
  const word = res.headers.getSetCookie().find((c) => c.startsWith('known-'))?.split(';')[0];
  assert.ok(word, 'given a word with its sign-in');
  const u = await D.prepare('SELECT * FROM pg_users WHERE handle = ?').bind('sol').first();
  await heldBack(u);
  assert.equal((await signIn(u, 'a long test password', word)).id, u.id);
});
