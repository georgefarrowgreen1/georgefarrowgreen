// Checks for the security and privacy fixes, straight against the API.
import http from 'http';
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
// An account, made where accounts are made (the account's page: account.localhost beside InFlight run locally, its API
// answering only there and only from its own page), then signed in to InFlight's API with the same password proof
const acctPost = (path, data, ipAddr) => new Promise((done, no) => {
  const q = http.request({ host: '127.0.0.1', port: 8788, path: '/api/account/' + path, method: 'POST',
    headers: { Host: 'account.localhost:8788', Origin: 'http://account.localhost:8788', 'Content-Type': 'application/json', 'CF-Connecting-IP': ipAddr } }, (res) => {
    const parts = []; res.on('data', (c) => parts.push(c));
    res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString()); } catch (_) {} done({ s: res.statusCode, j }); });
  });
  q.on('error', no); q.end(JSON.stringify(data));
});
async function signup(name, handle) {
  ip++;
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey), proof = b64u(rnd(32)), email = handle + '@example.com';
  const made = await acctPost('signup', { name, handle, email, salt: b64u(rnd(16)), proof, vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, '10.0.0.' + ip);
  if (made.s !== 201) return made;
  return call(null, 'login', { body: { email, proof } });
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
// bad base64 is a 400, not a 500
const r400 = await call(null, 'login', { body: { email: 'alice@example.com', proof: '***' } }); ok(r400.s === 400 || r400.s === 401, 'malformed proof is not a server error', r400.s);
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
const burst = await Promise.all(Array.from({ length: 25 }, () => call(null, 'login', { ip: '10.9.9.9', body: { email: 'nobody@example.com', proof: b64u(rnd(32)) } })));
const passed = burst.filter((r) => r.s === 401).length;
ok(passed <= 10, 'a burst of 25 logins from one IP lets at most 10 through', passed);
// owner login: burst
const ob = await Promise.all(Array.from({ length: 30 }, () => fetch('http://localhost:8788/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.8.8.8' }, body: JSON.stringify({ password: 'nope' }) }).then((r) => r.status)));
ok(ob.filter((s) => s === 401).length <= 20, 'owner login burst is capped', ob.filter((s) => s === 401).length);
ok((await fetch('http://localhost:8788/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.8.8.7' }, body: JSON.stringify({ password: 'owner-test-pass' }) })).status === 200, 'owner can still sign in from elsewhere');
// reset links point at the real site unless local
console.log('FAILS', fails);
