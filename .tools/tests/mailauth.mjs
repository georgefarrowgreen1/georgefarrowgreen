// Mail (email.inflite.ai, the inflite repo's Worker) asks the account's address who the browser is and whether they may
// open it: the site's admin, with a passkey, shown it's them in the last 12 hours (functions/_mailapp.js). Signing in is
// the account's page's, handed back to Mail with a code good once, and only with Mail's word for it; Mail's server
// passes on the browser's cookie and Origin, which must be Mail's for a change. Straight against the API, as Mail's
// server asks it. (The site's addresses stood in for by ifl.test: Mail at email.ifl.test.)
import http from 'http';
import { execSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { acctCall } from './handback.mjs';
const [,, S] = process.argv;
const ACCT = 'account.ifl.test:8788', MAIL = 'http://email.ifl.test:8788';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x !== '' ? ' — ' + x : ''}`); if (!c) fails++; };
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const b64u = (u) => Buffer.from(u).toString('base64url');
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

// (a request to the account's address as Mail's server makes it: the browser's cookie and Origin passed on)
function mail(method, path, { cookie, origin, body } = {}) {
  const data = body ? JSON.stringify(body) : '';
  return new Promise((done, no) => {
    const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/account/mail/' + path, method, agent: false, headers: { Host: ACCT,
      ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {}
        const set = (res.headers['set-cookie'] || []).find((x) => /^account=/.test(x)) || null;
        done({ s: res.statusCode, j, set, cookie: set ? set.split(';')[0] : null });
      });
    });
    q.on('error', no); q.end(data);
  });
}
async function signup(name, handle, email) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const r = await acctCall('signup', { name, handle, email, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } },
    { ip: '10.0.9.' + (handle.length + 10) });
  if (r.s !== 201 || !r.cookie) throw new Error(`signup ${handle}: ${r.s} ${JSON.stringify(r.j)}`);
  return r.cookie;
}
const idOf = (h) => sql(`SELECT id FROM pg_users WHERE handle = '${h}'`).match(/"id": "([^"]+)"/)[1];
const word = () => { const w = randomBytes(32).toString('base64url'); return { w, ask: createHash('sha256').update(w).digest('base64url') }; };

// ---- 1. Who's asking: no one, someone, and the admin (the owner's email, PIGEON_ADMIN_EMAIL, once confirmed) ----
let r = await mail('GET', 'me');
ok(r.s === 200 && r.j.signedIn === false, 'no cookie: signed out', JSON.stringify(r.j));
const pat = await signup('Pat Reed', 'pat', 'pat@example.com');
r = await mail('GET', 'me', { cookie: pat });
ok(r.j.signedIn && r.j.admin === false && r.j.email === null, 'another account: signed in, not the admin, and no email given', JSON.stringify(r.j));
const gail = await signup('Gail Admin', 'gail', 'owner@example.com'), gid = idOf('gail');
r = await mail('GET', 'me', { cookie: gail });
ok(r.j.signedIn && r.j.admin === false, 'the owner’s email, not yet confirmed: not the admin', JSON.stringify(r.j));
sql(`UPDATE pg_users SET email_ok = ${Date.now()} WHERE id = '${gid}'`);
r = await mail('GET', 'me', { cookie: gail });
ok(r.j.admin === true && r.j.passkey === false && r.j.fresh === true && r.j.email === 'owner@example.com', 'confirmed: the admin, without a passkey yet, just signed in', JSON.stringify(r.j));
sql(`INSERT INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('pk-test-gail', '${gid}', 'x', -7, ${Date.now()})`);
r = await mail('GET', 'me', { cookie: gail });
ok(r.j.admin && r.j.passkey === true, 'with a passkey on it', JSON.stringify(r.j));
sql(`UPDATE pg_sessions SET auth_at = ${Date.now() - 13 * 3600e3} WHERE user_id = '${gid}'`);
r = await mail('GET', 'me', { cookie: gail });
ok(r.j.admin && r.j.fresh === false, 'shown it’s them 13 hours ago: not fresh (Mail asks again)', JSON.stringify(r.j));
sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = '${gid}'`);

// ---- 2. Handed back to Mail: a code for Mail, swapped only with Mail's word, from Mail's own page, once ----
let { w, ask } = word();
let made = await acctCall('handback', { app: 'mail', ask }, { cookie: gail });
ok(made.s === 200 && made.j.code, 'the account’s page makes a code for Mail', JSON.stringify(made.j));
r = await mail('POST', 'handback', { origin: 'http://weather.ifl.test:8788', body: { code: made.j.code, verifier: w } });
ok(r.s === 403 && !r.cookie, 'from another app’s page: refused, and no sign-in given', `${r.s} ${JSON.stringify(r.j)}`);
r = await mail('POST', 'handback', { origin: MAIL, body: { code: made.j.code, verifier: word().w } });
ok(r.s === 400 && !r.cookie, 'with the wrong word: refused (and the code used up)', `${r.s} ${JSON.stringify(r.j)}`);
({ w, ask } = word());
made = await acctCall('handback', { app: 'mail', ask }, { cookie: gail });
r = await mail('POST', 'handback', { origin: MAIL, body: { code: made.j.code, verifier: w } });
ok(r.s === 200 && r.cookie && r.j.admin && r.j.passkey && r.j.fresh, 'Mail’s own word, from Mail’s page, in a browser with no sign-in (a Home Screen app): a sign-in of its own, for the whole site', `${r.s} ${JSON.stringify(r.j)}`);
ok(/Domain=ifl\.test/.test(r.set || '') && /HttpOnly/.test(r.set || '') && /SameSite=Lax/.test(r.set || ''), 'given as the site’s cookie (every address on it, HttpOnly, SameSite=Lax)', r.set);
const homeScreen = r.cookie;
const again = await mail('POST', 'handback', { origin: MAIL, body: { code: made.j.code, verifier: w } });
ok(again.s === 400 && !again.cookie, 'the same code again: refused', `${again.s} ${JSON.stringify(again.j)}`);
r = await mail('GET', 'me', { cookie: homeScreen });
ok(r.j.admin && r.j.fresh, 'that sign-in opens Mail', JSON.stringify(r.j));
({ w, ask } = word());
made = await acctCall('handback', { app: 'mail', ask }, { cookie: gail });
r = await mail('POST', 'handback', { origin: MAIL, cookie: gail, body: { code: made.j.code, verifier: w } });
ok(r.s === 200 && r.cookie === gail, 'in a browser that shares the site’s sign-in: the same one, renewed', `${r.s} ${r.cookie === gail}`);
made = await acctCall('handback', { app: 'nope', ask: word().ask }, { cookie: gail });
ok(made.s === 400, 'a code for an app that isn’t one: refused', `${made.s}`);

// ---- 3. A sign-in handed over to a browser signed in to nothing is the account's page's alone: not Mail's ----
const hs = sql(`SELECT hash FROM pg_sessions WHERE user_id = '${gid}' ORDER BY created_at DESC LIMIT 1`).match(/"hash": "([^"]+)"/)[1];
sql(`UPDATE pg_sessions SET handed = 1 WHERE hash = '${hs}'`);
r = await mail('GET', 'me', { cookie: homeScreen });
ok(r.j.signedIn === false, 'handed over and not yet shown it’s you on the account’s page: not signed in to Mail', JSON.stringify(r.j));
sql(`UPDATE pg_sessions SET handed = NULL WHERE hash = '${hs}'`);

// ---- 4. Signing out from Mail: only from Mail's page; it ends the site's sign-in ----
r = await mail('POST', 'signout', { origin: 'http://chat.ifl.test:8788', cookie: gail, body: {} });
ok(r.s === 403, 'from another page: refused', `${r.s}`);
r = await mail('POST', 'signout', { origin: MAIL, cookie: gail, body: {} });
ok(r.s === 200 && /Max-Age=0/.test(r.set || ''), 'from Mail: signed out, and the cookie cleared', `${r.s} ${r.set}`);
r = await mail('GET', 'me', { cookie: gail });
ok(r.j.signedIn === false, 'that sign-in has ended everywhere', JSON.stringify(r.j));
r = await mail('GET', 'me', { cookie: homeScreen });
ok(r.j.admin === true, 'the Home Screen app’s own sign-in carries on', JSON.stringify(r.j));

console.log(`FAILS ${fails}`);
process.exit(0);
