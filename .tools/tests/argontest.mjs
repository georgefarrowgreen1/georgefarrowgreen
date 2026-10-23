// Argon2id: new accounts use it; an account from before (PBKDF2) moves on at its next password sign-in.
import { kit } from './lib.mjs';
import http from 'http';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api } = K;
const { E2E, b64url } = await import(process.env.APP_ROOT + '/pigeon/crypto.js');
const PW = 'an older test password';
// ---- an account as made before: PBKDF2, a bare salt ----
const id = await E2E.newIdentity(), salt = crypto.getRandomValues(new Uint8Array(16));
const old = await E2E.fromPassword(PW, salt);
// (made where accounts are made: the account's page, account.localhost beside InFlight run locally; its API answers only there)
const acctPost = (path, data) => new Promise((done, no) => {
  const q = http.request({ host: '127.0.0.1', port: 8788, path, method: 'POST', headers: { Host: 'account.localhost:8788', Origin: 'http://account.localhost:8788', 'Content-Type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => done({ status: res.statusCode })); });
  q.on('error', no); q.end(data);
});
const r = await acctPost('/api/account/signup', JSON.stringify({ name: 'Olive Old', handle: 'olive', email: 'olive@example.com', salt: b64url(salt), proof: old.proof, vault: await E2E.lock(old.lockKey, { ecdh: id.privJwk }), pub: id.pub }));
ok(r.status === 201, 'an account from before (PBKDF2): made as it was (on the account\'s page now)', String(r.status));
K.sql("UPDATE pg_users SET lat = 52.63, lon = 1.29, place = 'Norwich' WHERE handle = 'olive'");
const before = one("SELECT salt, proof_hash FROM pg_users WHERE handle = 'olive'")[0];
ok(!before.salt.startsWith('a2:'), 'stored with a bare salt');
// ---- it signs in on a phone ----
const O = await K.phone('olive');
await O.p.waitForSelector('.welcome'); await O.p.click('[data-act=to][data-id=signin]'); await O.p.fill('#f-email', 'olive@example.com'); await O.p.fill('#f-password', PW);
await O.p.click('[data-form=signin] .btn');
ok(await O.p.waitForSelector('.tabs', { timeout: 20000 }).then(() => true, () => false), 'it signs in with its password (PBKDF2)');
let after = before; for (let k = 0; k < 30 && !after.salt.startsWith('a2:'); k++) { await O.p.waitForTimeout(300); after = one("SELECT salt, proof_hash FROM pg_users WHERE handle = 'olive'")[0]; }
ok(after.salt.startsWith('a2:') && after.proof_hash !== before.proof_hash, 'and moves on to Argon2id quietly', after.salt.slice(0, 6));
// ---- and signs in again, now with Argon2id, on another phone ----
const O2 = await K.phone('olive2');
await O2.p.waitForSelector('.welcome'); await O2.p.click('[data-act=to][data-id=signin]'); await O2.p.fill('#f-email', 'olive@example.com'); await O2.p.fill('#f-password', PW);
const t0 = Date.now(); await O2.p.click('[data-form=signin] .btn');
ok(await O2.p.waitForSelector('.tabs', { timeout: 20000 }).then(() => true, () => false), 'it signs in again with Argon2id, and its key unlocks', `${Date.now() - t0} ms`);
const pubAfter = await O2.p.evaluate(() => new Promise((res) => { const q = indexedDB.open('inflight'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result?.pub?.x); }; }));
ok(pubAfter === id.pub.x, 'the same key as before (nothing was lost)');
// wrong password still refused (Argon2id path)
const O3 = await K.phone('olive3'); await O3.p.waitForSelector('.welcome'); await O3.p.click('[data-act=to][data-id=signin]'); await O3.p.fill('#f-email', 'olive@example.com'); await O3.p.fill('#f-password', 'not the password at all');
await O3.p.click('[data-form=signin] .btn');
ok(await O3.p.waitForSelector('.ferr:not([hidden])', { timeout: 20000 }).then(() => true, () => false) && !(await O3.p.$('.tabs')), 'a wrong password is refused');
// ---- a new account is Argon2id from the start ----
const N = await K.phone('nell'); await K.signup(N, 'Nell New', 'nell', 'nell@example.com', 'London');
ok(one("SELECT salt FROM pg_users WHERE handle = 'nell'")[0].salt.startsWith('a2:'), 'a new account uses Argon2id');
// ---- someone with no account gets an Argon2id salt too (it says nothing about who has one) ----
const fake = await fetch(K.BASE + '/api/pigeon/salt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.com' }) }).then((x) => x.json());
const fake2 = await fetch(K.BASE + '/api/pigeon/salt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.com' }) }).then((x) => x.json());
// (most in Argon2id's form, as most accounts are; some in the older one, as an account from before still has)
const fakes = await Promise.all(Array.from({ length: 24 }, (_, i) => fetch(K.BASE + '/api/pigeon/salt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `nobody${i}@example.com` }) }).then((x) => x.json()).then((x) => x.salt)));
ok(/^(a2:)?[A-Za-z0-9_-]{22}$/.test(fake.salt) && fake2.salt === fake.salt && fakes.filter((x) => x.startsWith('a2:')).length >= 12,
  'an unknown email gets a salt of a real one\'s form, the same each time (it says nothing about who has one)', `${fake.salt.slice(0, 4)} ${fakes.filter((x) => x.startsWith('a2:')).length}/24`);
// ---- the upgrade can't be used to set a weaker or someone else's password ----
const os = await K.sess(O2);
const [st] = await api(os.token, 'password-upgrade', { oldProof: 'x'.repeat(43), salt: E2E.newSalt(), proof: 'y'.repeat(43), vault: 'z'.repeat(40) });
ok(st === 200 && one("SELECT salt FROM pg_users WHERE handle = 'olive'")[0].salt === after.salt, 'once moved on, the upgrade does nothing more');
console.log(`FAILS ${K.fails()}`); process.exit(0);
