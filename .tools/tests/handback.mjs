// Signing in to InFlight from a test's own requests, as a phone does it now: on the account's page (account.localhost
// beside InFlight run locally), which hands the sign-in back to InFlight with a code and the word only the asking tab
// has (functions/_handback.js). For the tests that drive InFlight's API directly.
//   acctCall(path, body, { cookie, ip })   the account's API, from its page: { s, j, cookie (the sign-in it gave) }
//   inflightFrom(cookie, { ip })           that sign-in handed to InFlight: InFlight's answer { s, j: { token, me, vault, … } }
//   madeIn(signupBody, { ip })             an account made on the account's page and signed in to InFlight: { s, j }
//   signedIn({ email, proof }, { ip })     an account signed in to on the account's page, then InFlight: { s, j }
import http from 'http';
import { createHash, randomBytes } from 'crypto';
const PORT = Number((process.env.TEST_BASE || 'http://localhost:8788').match(/:(\d+)\/?$/)?.[1] || 8788);
function post(host, path, body, { cookie, ip } = {}) {
  const data = JSON.stringify(body || {});
  return new Promise((done, no) => {
    const q = http.request({ host: '127.0.0.1', port: PORT, path, method: 'POST', headers: { Host: `${host}:${PORT}`, Origin: `http://${host}:${PORT}`, 'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data), ...(cookie ? { Cookie: cookie } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}) } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {}
        const c = (res.headers['set-cookie'] || []).map((x) => x.split(';')[0]).find((x) => /^(__Secure-)?account=./.test(x));
        done({ s: res.statusCode, j, cookie: c || null });
      });
    });
    q.on('error', no); q.end(data);
  });
}
export const acctCall = (path, body, opts) => post('account.localhost', '/api/account/' + path, body, opts);
export async function inflightFrom(cookie, { ip } = {}) {
  const word = randomBytes(32).toString('base64url'), ask = createHash('sha256').update(word).digest('base64url');
  const made = await acctCall('handback', { app: 'inflight', ask, box: 'x'.repeat(48) }, { cookie, ip });
  if (made.s !== 200) return made;
  return post('localhost', '/api/pigeon/handback', { code: made.j.code, verifier: word }, { ip });
}
export async function madeIn(signup, { ip } = {}) {
  const made = await acctCall('signup', signup, { ip });
  return made.s === 201 && made.cookie ? inflightFrom(made.cookie, { ip }) : made;
}
export async function signedIn({ email, proof }, { ip } = {}) {
  const r = await acctCall('signin/password', { email, proof }, { ip });
  return r.s === 200 && r.cookie ? inflightFrom(r.cookie, { ip }) : r;
}
