// Checks for the security and privacy fixes, straight against the API.
import { madeIn, acctCall } from './handback.mjs';
import http from 'http';
import { writeFileSync } from 'fs';
const [,, S] = process.argv;
const BASE = 'http://localhost:8788/api/pigeon/';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x !== '' ? ' — ' + x : ''}`); if (!c) fails++; };
const b64u = (u) => Buffer.from(u).toString('base64url');
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
let ip = 1;
async function call(tok, path, opt = {}) {
  const headers = { 'CF-Connecting-IP': opt.ip || '10.0.0.' + ip, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) };
  let body = opt.body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method: opt.method || (body ? 'POST' : 'GET'), headers, body });
  const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch (_) {}
  return { s: r.status, j, h: r.headers };
}
// An account, made where accounts are made (the account's page: account.localhost beside Chat run locally, its API
// answering only there and only from its own page), and signed in to Chat from there, as a phone is (handback.mjs)
async function signup(name, handle) {
  ip++;
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey), proof = b64u(rnd(32)), email = handle + '@example.com';
  return madeIn({ name, handle, email, salt: b64u(rnd(16)), proof, vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.0.0.' + ip });
}
const A = await signup('Alice Smith', 'alice'), B = await signup('Bob Jones', 'bob'), C = await signup('Carol Stranger', 'carol');
ok(A.s === 200 && B.s === 200 && C.s === 200, 'three accounts');
const [a, bt, c] = [A.j.token, B.j.token, C.j.token];
const bad = await signup('www.evil-login.com', 'evil1'); ok(bad.s === 400 && bad.j.field === 'name', 'a web address as a name is refused', bad.j.error);
const bad2 = await call(a, 'me', { method: 'PATCH', body: { name: 'Bob @ http://x' } }); ok(bad2.s === 400, 'renaming to a link is refused');
const fine = await call(a, 'me', { method: 'PATCH', body: { name: "Alice O'Neil-Smith" } }); ok(fine.s === 200, 'ordinary names still fine');
for (const t of [a, bt, c]) await call(t, 'me', { method: 'PATCH', body: { lat: 51.5, lon: -0.12, place: 'London' } });
// Carol asks Bob; until he says yes she sees nothing of him
await call(bt, 'avatar', { method: 'POST', body: undefined });
const jpg = new Uint8Array(400); jpg[0] = 0xff; jpg[1] = 0xd8; jpg[2] = 0xff;
const up = await fetch(BASE + 'avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + bt }, body: jpg }); ok(up.status === 200, 'Bob sets a picture');
const upc = await fetch(BASE + 'avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + c }, body: jpg }); ok(upc.status === 200, 'Carol sets a picture');
await call(c, 'friends', { body: { handle: 'bob' } });
const cs = await call(c, 'sync');
ok(cs.j.outgoing.length === 1 && cs.j.outgoing[0].name === null && cs.j.outgoing[0].avatarAt === null, 'a sent request shows no name or picture', JSON.stringify(cs.j.outgoing[0]));
ok((await call(c, 'avatar/' + B.j.me.id)).s === 404, "the asker can't fetch their picture");
ok((await call(bt, 'avatar/' + C.j.me.id)).s === 200, 'the one asked can see who is asking');
const bs = await call(bt, 'sync'); ok(bs.j.incoming[0]?.name === 'Carol Stranger', 'the one asked sees the name');
await call(bt, 'friends-respond', { body: { id: C.j.me.id, accept: true } });
ok((await call(c, 'avatar/' + B.j.me.id)).s === 200, 'once friends, pictures show both ways');
// Alice and Bob are friends
await call(a, 'friends', { body: { handle: 'bob' } }); await call(bt, 'friends-respond', { body: { id: A.j.me.id, accept: true } });
// headers
const s1 = await call(a, 'sync'); ok(s1.h.get('x-content-type-options') === 'nosniff', 'API replies carry nosniff');
// bad base64 is a 400, not a 500 (signing in is the account's page's, for every app)
const r400 = await acctCall('signin/password', { email: 'alice@example.com', proof: '***' }, { ip: '10.0.0.99' }); ok(r400.s === 400 || r400.s === 401, 'malformed proof is not a server error', r400.s);
// (and Chat's own sign-in, from before, says where it is now)
const gone = await call(null, 'login', { body: { email: 'alice@example.com', proof: b64u(rnd(32)) } });
ok(gone.s === 410 && /account\.inflite\.ai/.test(gone.j.error), 'Chat’s own sign-in is gone: it says to sign in on the account’s page', `${gone.s} ${gone.j.error}`);
// a photo message, and a second send with the same id
const id = crypto.randomUUID();
const fd = () => { const f = new FormData(); f.set('meta', JSON.stringify({ id, to: B.j.me.id, ct: 'x'.repeat(40), pigeon: 'rocket', once: false })); f.set('photo', new Blob([rnd(2000)])); return f; };
const m1 = await call(a, 'messages', { body: fd() }); ok(m1.s === 200, 'photo pigeon sent');
ok(m1.j.message.expiresAt === null, 'its photo expiry stays hidden while it flies');
const m2 = await call(a, 'messages', { body: fd() }); ok(m2.s === 409, 'same id again is refused', m2.s);
const ph = await fetch(BASE + 'photo/' + id, { headers: { Authorization: 'Bearer ' + a } }); ok(ph.status === 200 && (await ph.arrayBuffer()).byteLength === 2000, 'the original photo is still there');
// two swift sends at once can't share the last pigeon
const sends = await Promise.all(Array.from({ length: 12 }, () => call(a, 'messages', { body: { id: crypto.randomUUID(), to: B.j.me.id, ct: 'y'.repeat(40), pigeon: 'swift' } })));
const okN = sends.filter((r) => r.s === 200).length;
const left = (await call(a, 'sync')).j.me.swift;
ok(okN + left === 9 && okN <= 9, 'parallel sends never spend more swift pigeons than the loft held', `${okN} sent, ${left} left`);
// rate limits hold under a burst
const burst = await Promise.all(Array.from({ length: 45 }, () => acctCall('signin/password', { email: 'nobody@example.com', proof: b64u(rnd(32)) }, { ip: '10.9.9.9' })));
const passed = burst.filter((r) => r.s === 401).length;
ok(passed <= 30, 'a burst of 45 logins from one IP lets at most 30 through', passed);
// a body sent in pieces with no Content-Length is still held to its cap (refused as it passes it, not read whole first)
const PORT = Number(new URL(BASE).port);
const raw = (host, method, path, { body, chunks, cookie } = {}) => new Promise((done) => {
  const headers = { Host: `${host}:${PORT}`, Origin: `http://${host}:${PORT}`, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': '10.0.7.7' };
  if (body !== undefined) headers['Content-Length'] = Buffer.byteLength(body);
  const q = http.request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
    const parts = []; res.on('data', (c) => parts.push(c));
    res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {} done({ s: res.statusCode, j }); });
  });
  q.on('error', (e) => done({ s: 0, j: { error: e.message } }));
  if (chunks) { (async () => { for (const c of chunks) { if (q.destroyed) return; q.write(c); await new Promise((r) => setTimeout(r, 2)); } q.end(); })(); } else q.end(body);
});
const piece = '{"email":"' + 'x'.repeat(16 * 1024);
const salt1 = await raw('account.localhost', 'POST', '/api/account/signin/salt', { chunks: Array(8).fill(piece) });
ok(salt1.s === 413, 'the account’s salt: a body past 64 KB sent in pieces, with no length, is refused', `${salt1.s} ${salt1.j.error}`);
const salt2 = await raw('localhost', 'POST', '/api/pigeon/salt', { chunks: Array(40).fill(piece) });
ok(salt2.s === 413, 'Chat’s: one past 512 KB, the same', `${salt2.s} ${salt2.j.error}`);
const salt3 = await raw('account.localhost', 'POST', '/api/account/signin/salt', { chunks: ['{"email":', '"alice@example.com"}'] });
ok(salt3.s === 200 && salt3.j.salt, 'a small one sent in pieces is read as it was sent', `${salt3.s} ${JSON.stringify(salt3.j)}`);

// a rate limit says how long to wait, in hours and minutes once it's more than an hour
const held = burst.find((r) => r.s === 429)?.j.error;
ok(/^Too many tries\. Try again in \d+ minutes?\.$/.test(held || ''), 'a limit says how many minutes are left', held);

// The account's emails: one that can't be sent is said, not said to be on its way (and a new email asked for then
// isn't left waiting); and after "Sign out everywhere else" or a new password the account is as it now is
const dproof = b64u(rnd(32)), dkp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), dpub = await crypto.subtle.exportKey('jwk', dkp.publicKey);
const D = await acctCall('signup', { name: 'Dana Wells', handle: 'dana', email: 'dana@example.com', salt: b64u(rnd(16)), proof: dproof, vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: dpub.x, y: dpub.y } }, { ip: '10.0.7.1' });
const dc = { cookie: D.cookie, ip: '10.0.7.1' }, now = () => acctCall('password/checked', { proof: dproof, leaked: false }, dc).then((r) => r.j);
const first = await acctCall('email/change', { email: 'dana.first@example.com' }, dc);
ok(D.s === 201 && first.s === 200 && first.j.emailNew === 'dana.first@example.com', 'a new email asked for, its link sent', `${D.s} ${first.s} ${first.j.error || ''}`);
writeFileSync(`${S}/mockmode`, 'fail');
const unsent = [await acctCall('email/confirm-send', {}, dc), await acctCall('email/change', { email: 'dana.second@example.com' }, dc)];
writeFileSync(`${S}/mockmode`, 'ok');
ok(unsent.every((r) => r.s === 502 && /couldn’t be sent/.test(r.j.error)), 'with email failing: a confirm link and a new email\'s link each say they couldn’t be sent', JSON.stringify(unsent.map((r) => [r.s, r.j.error])));
ok((await now()).emailNew === 'dana.first@example.com', 'and the new email waiting before is still the one waiting');
const others = await acctCall('devices/end', { others: true }, dc);
ok(others.s === 200 && others.j.emailNew === null, '"Sign out everywhere else" calls the change off, and says so in its answer', JSON.stringify(others.j.emailNew));
await acctCall('email/change', { email: 'dana.third@example.com' }, dc);
const t0 = Date.now(), pw = await acctCall('password', { oldProof: dproof, salt: b64u(rnd(16)), proof: b64u(rnd(32)), vault: 'y'.repeat(40) }, dc);
ok(pw.s === 200 && pw.j.emailNew === null && pw.j.password.setAt >= t0, 'a new password: the change called off and the password\'s date, in its answer', JSON.stringify({ s: pw.s, emailNew: pw.j.emailNew, setAt: pw.j.password?.setAt, t0 }));
// (the confirm link's day-long limit: three a day, the one that failed among them)
const links = [await acctCall('email/confirm-send', {}, dc), await acctCall('email/confirm-send', {}, dc), await acctCall('email/confirm-send', {}, dc)];
ok(links[0].s === 200 && links[1].s === 200 && links[2].s === 429 && /^Too many tries\. Try again in (2[34]h \d+m|24 hours)\.$/.test(links[2].j.error), 'the fourth confirm link in a day: try again in hours and minutes', JSON.stringify(links.map((r) => [r.s, r.j.error])));

// Chat's notification settings changed twice at once, on the account's page: both kept
const two = await Promise.all([raw('account.localhost', 'PATCH', '/api/account/inflight', { body: JSON.stringify({ notify: { reactions: false } }), cookie: D.cookie }),
  raw('account.localhost', 'PATCH', '/api/account/inflight', { body: JSON.stringify({ notify: { moments: false } }), cookie: D.cookie })]);
const nset = (await raw('account.localhost', 'GET', '/api/account/inflight', { cookie: D.cookie })).j.notify || {};
ok(two.every((r) => r.s === 200) && nset.reactions === false && nset.moments === false && nset.landed === true, 'two notification switches changed at once: both kept', JSON.stringify(nset));
// (the home page's own owner password is gone: its owner is the admin account, home.mjs)
// reset links point at the real site unless local
console.log('FAILS', fails);
