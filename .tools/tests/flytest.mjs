// Flyover waves, end to end against the local stack.
// Push goes to a stand-in push service (PIGEON_PUSH_URL); this script plays the
// phone: it makes the subscription keys and decrypts what arrives (RFC 8291).
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { joinChat } from './join.mjs';
const [,, S, out] = process.argv;
const BASE = 'http://localhost:8788', URL = BASE + '/pigeon/';
const AUDIT = new Function('return (' + readFileSync(`${S}/wr/audit.mjs`, 'utf8').match(/const AUDIT = (\(\) => \{[\s\S]*?\n\});/)[1] + ')')();
// the local database is a file shared with the running server; retry if it's busy
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const pushes = () => readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errs = []; let fails = 0; process.on('exit', () => console.log('errs-at-exit', errs));
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const wc = globalThis.crypto.subtle;
const b64u = (u) => Buffer.from(u).toString('base64url'), unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

// ---- a "phone" with push keys we control ----
async function makeKeys() {
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { kp, pub: new Uint8Array(await wc.exportKey('raw', kp.publicKey)), auth: globalThis.crypto.getRandomValues(new Uint8Array(16)) };
}
async function hkdf(salt, ikm, info, len) { const k = await wc.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await wc.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8)); }
const te = new TextEncoder();
async function decrypt(keys, body) {
  const buf = new Uint8Array(Buffer.from(body, 'base64'));
  const salt = buf.slice(0, 16), idlen = buf[20], asPub = buf.slice(21, 21 + idlen), ct = buf.slice(21 + idlen);
  const asKey = await wc.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await wc.deriveBits({ name: 'ECDH', public: asKey }, keys.kp.privateKey, 256));
  const ikm = await hkdf(keys.auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...keys.pub, ...asPub]), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await wc.decrypt({ name: 'AES-GCM', iv: nonce }, await wc.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  if (pt[end] !== 2) throw new Error('bad padding delimiter');
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}
async function vapidOk(h) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.authorization || ''); if (!m) return false;
  const [hd, cl, sig] = m[1].split('.');
  const key = await wc.importKey('raw', unb64u(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const good = await wc.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(sig), te.encode(`${hd}.${cl}`));
  const claims = JSON.parse(Buffer.from(cl, 'base64url'));
  return good && claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000;
}

async function phone(name, keys) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, timezoneId: 'Europe/London',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  if (keys) await ctx.addInitScript(({ endpoint, p256dh, auth }) => {
    // headless Chromium has no real push service; stand in for one with keys the test holds
    // like a real browser, the subscription survives reloads
    const make = (key) => ({ endpoint, options: { applicationServerKey: key }, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
    const toB = (u8) => btoa(String.fromCharCode(...u8)), fromB = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    PushManager.prototype.getSubscription = async function () { const k = localStorage.getItem('fakesub'); return k ? make(fromB(k)) : null; };
    PushManager.prototype.subscribe = async function (o) { const k = new Uint8Array(o.applicationServerKey.buffer || o.applicationServerKey); localStorage.setItem('fakesub', toB(k)); return make(k.buffer); };
  }, { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-device`, p256dh: b64u(keys.pub), auth: b64u(keys.auth) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  await p.goto(URL);
  return { p, ctx, name };
}
const txt = async (ph, s) => (await ph.p.locator(s).first().innerText()).replace(/\s+/g, ' ');
// (made on the account's own page, then Chat signed in to: join.mjs)
const signup = (ph, name, handle, email, city) => joinChat(ph.p, URL, { name, handle, email, city });
// (retry once: the local server can drop an idle keep-alive connection while sql() runs)
const tick = async (secret = 'tick-test-secret') => { const go = () => fetch(BASE + '/api/pigeon/notify-tick', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } });
  let r; try { r = await go(); } catch (_) { r = await go(); } return { status: r.status, ...(await r.json()) }; };
const lastPush = async (keys, since) => { const ps = pushes().filter((x) => x.at > since); return ps.length ? { ...ps.at(-1), msg: await decrypt(keys, ps.at(-1).body) } : null; };
const idOf = (ph) => ph.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result.me.id); }; }));
const sess = (ph) => ph.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; }));
const fetchRetry = async (...a) => { for (let i = 0; ; i++) { try { return await fetch(...a); } catch (e) { if (i > 3) throw e; await new Promise((r) => setTimeout(r, 300)); } } };
const api = (tk, path, body) => fetchRetry(BASE + '/api/pigeon/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);
const one = (q) => { const o = sql(q); const m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
const openChat = async (ph, id) => {
  for (let k = 0; k < 4; k++) {
    await ph.p.evaluate((id) => { history.replaceState(null, '', location.pathname); location.hash = '#open=' + id; }, id);
    if (await ph.p.waitForSelector('#msg', { timeout: 3000 }).then(() => true).catch(() => false)) break;
  }
  await ph.p.waitForSelector('#msg'); await ph.p.waitForTimeout(700);
};
// the pigeon is chosen in How It Flies, opened from the pigeon at the start of the message box
const pickKind = async (p, kind) => {
  for (let k = 0; k < 30; k++) {
    await p.waitForSelector('.compose .kind:not([hidden])', { timeout: 15000 }); await p.click('.compose .kind');
    const row = p.locator(`.sheet [data-act=pigeon][data-id=${kind}]`); await row.waitFor();
    const off = await row.isDisabled();
    if (!off) await row.click();
    await p.click('.sheet header [data-act=close]'); await p.waitForTimeout(450);
    if (!off) return;
  }
  throw new Error(`no ${kind} pigeon to pick`);
};
const sentCount = () => Number(one("SELECT COUNT(*) AS n FROM pg_msgs")[0].n);
const send = async (ph, kind, text) => {
  const n0 = sentCount();
  for (let k = 0; k < 2; k++) {
    await pickKind(ph.p, kind);
    await ph.p.fill('#msg', text); await ph.p.click('.send');
    for (let w = 0; w < 10 && sentCount() === n0; w++) await ph.p.waitForTimeout(400);
    if (sentCount() > n0) return;
    await ph.p.screenshot({ path: `${out}/send-fail-${ph.name}-${k}.png` });
    console.log('DEBUG send', ph.name, k, await ph.p.evaluate(() => ({ toast: document.querySelector('.toast')?.innerText, layer: document.querySelector('.layer')?.innerText.slice(0, 200), pop: document.querySelector('.poplayer')?.innerText.slice(0, 200), msg: document.querySelector('#msg')?.value })));
  }
};
async function pushOn(ph) {
  await ph.p.click('[data-act=tab][data-id=account]'); await ph.p.waitForTimeout(700);
  await ph.p.click('.chead .ifh-me'); await ph.p.click('.ifm-pop [data-k=pushtoggle]'); await ph.p.waitForSelector('.ifm-pop [data-k=pushtoggle][aria-checked=true]', { timeout: 10000 }); await ph.p.keyboard.press('Escape'); await ph.p.waitForTimeout(400);
  // (whether Mid-air Moments is on: the account's, as Chat has it from its sync)
  return ph.p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('inflight'); r.onerror = () => res(null);
    r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onerror = () => res(null);
      g.onsuccess = () => fetch('/api/pigeon/sync', { headers: { Authorization: 'Bearer ' + g.result?.token } }).then((x) => x.json()).then((d) => res(String(!!d.me?.notify?.moments)), () => res(null)); };
  }));
}
const fetchR = async (...a) => { for (let i = 0; ; i++) { try { return await fetch(...a); } catch (e) { if (i > 3) throw e; await new Promise((r) => setTimeout(r, 300)); } } };
await fetch('http://127.0.0.1:8798/mode', { method: 'POST', body: '201' });
const gKeys = await makeKeys(), nKeys = await makeKeys(), rKeys = await makeKeys();
const G = await phone('george', gKeys), N = await phone('nia', nKeys), R = await phone('reuben', rKeys), P = await phone('sam'), J = await phone('jo');
await signup(G, 'George Farrow-Green', 'george', 'george@example.com', 'Norwich');
await signup(R, 'Reuben Hart', 'reuben', 'reuben@example.com', 'Singapore');
await signup(N, 'Nia Brooks', 'nia', 'nia@example.com', 'London');
await signup(P, 'Sam Okafor', 'sam', 'sam@example.com', 'New York');
await signup(J, 'Jo Tan', 'jotan', 'jo@example.com', 'Singapore');
sql("UPDATE pg_users SET notify_prefs = json_object('names', json('true'))");   // (names on: lock-screen names are off unless chosen)
const [gs, rs, ns, ps, js] = [await sess(G), await sess(R), await sess(N), await sess(P), await sess(J)];
for (const x of [rs, ns, ps, js]) { await api(gs.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: gs.me.id, accept: true }); }
// Nia lives under the way from Norwich to Singapore (a third of the way: by the Volga, between the rocket's way over the mountains of India and a slower one's by the Shipki La pass)
const patch = (tk, b) => fetchR(BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.status);
ok(await patch(ns.token, { lat: 48.85, lon: 47.46, place: 'Volgograd' }) === 200, 'Nia moves to under the route');
await pushOn(G); await pushOn(N); await pushOn(R);
for (const ph of [G, N, R]) { await ph.p.reload(); await ph.p.waitForSelector('.tabs'); }
const flies = (q = '') => one(`SELECT msg_id, user_id, sender, at, km, place, told, waved FROM pg_flyover ${q}`);
const pushesTo = async (keys, who, since) => Promise.all(pushes().filter((x) => x.at > since && x.headers['x-endpoint'].includes(who)).map((x) => decrypt(keys, x.body)));
const waitPush = async (keys, who, since, re) => { for (let k = 0; k < 20; k++) { const ps = await pushesTo(keys, who, since); const hit = ps.find((n) => re.test(n.title + ' ' + n.body)); if (hit) return hit; await G.p.waitForTimeout(300); } return null; };

// ---- George sends a rocket to Reuben ----
await openChat(G, rs.me.id); await send(G, 'rocket', 'On my way');
let rows = [];
for (let k = 0; k < 20 && !rows.length; k++) { await G.p.waitForTimeout(500); rows = flies(); }
const msg = one(`SELECT id, sent_at, deliver_at FROM pg_msgs WHERE sender = '${gs.me.id}'`)[0];
const frac = rows[0] ? (rows[0].at - msg.sent_at) / (msg.deliver_at - msg.sent_at) : null;
ok(rows.length === 1 && rows[0].user_id === ns.me.id && rows[0].km < 40 && frac > 0.25 && frac < 0.35, 'the server sees it will fly over Nia, about a third of the way (not Sam, off the route, or Jo, where it lands)', JSON.stringify([rows, frac]));
let [st, res] = await api(ns.token, `messages?with=${gs.me.id}`);
ok(st === 200 && Array.isArray(res.fly) && res.fly.length === 0, 'Nia knows nothing of it before it gets to her', JSON.stringify(res.fly));
// ---- it flies over: the flight moves back so it has just gone over ----
const x = rows[0].at - Date.now() + 20000, t0 = Date.now() - 1000;
sql(`UPDATE pg_msgs SET sent_at = sent_at - ${x}, deliver_at = deliver_at - ${x} WHERE id = '${msg.id}'`); sql(`UPDATE pg_flyover SET at = at - ${x}`);
await tick(); await G.p.waitForTimeout(600);
const np = await pushesTo(nKeys, 'nia', t0);
ok(np.length === 1 && np[0].title === 'Look up!' && np[0].body === 'George’s pigeon just flew over you. Wave hello?' && np[0].url === `/pigeon/#open=${gs.me.id}`, 'Nia is told as it flies over her', JSON.stringify(np));
ok((await pushesTo(gKeys, 'george', t0)).length === 0 && (await pushesTo(rKeys, 'reuben', t0)).length === 0, 'no one else hears of it');
await tick(); ok((await pushesTo(nKeys, 'nia', t0)).length === 1, 'and she’s told once');
// what Nia can see: whose pigeon, when. Not who it's for, or where it's going
[st, res] = await api(ns.token, `messages?with=${gs.me.id}`);
ok(res.fly.length === 1 && !res.fly[0].mine && res.fly[0].id === msg.id && res.fly[0].place === null && !JSON.stringify(res).includes(rs.me.id) && !/Singapore/.test(JSON.stringify(res)), 'Nia’s chat with George has it, and nothing of Reuben', JSON.stringify(res.fly));
// ---- Nia waves ----
await N.p.reload(); await N.p.waitForSelector('.tabs'); await openChat(N, gs.me.id);
const line0 = await txt(N, '.sysline.fly');
ok(/^George’s pigeon flew over you · \d\d:\d\d ?Wave$/.test(line0), 'her chat says so, with a Wave button', line0);
await N.p.screenshot({ path: `${out}/fly-nia.png` });
const t1 = Date.now();
await N.p.click('.sysline.fly .wavebtn'); await N.p.waitForTimeout(300);
await N.p.screenshot({ path: `${out}/fly-nia-waved.png` });
await N.p.waitForTimeout(900);
const line1 = await txt(N, '.sysline.fly'), toast1 = await txt(N, '.toast').catch(() => '');
ok(/^George’s pigeon flew over you · you waved · \d\d:\d\d$/.test(line1) && /You waved\. George will see it\./.test(toast1), 'she waves: the line says so', JSON.stringify([line1, toast1]));
ok(flies(`WHERE user_id = '${ns.me.id}'`)[0].waved > 0, 'the wave is kept');
const gp = await waitPush(gKeys, 'george', t1, /waved/);
ok(gp && gp.title === 'Nia waved' && gp.body === 'Nia waved at your pigeon as it flew over Volgograd.' && gp.url === `/pigeon/#open=${ns.me.id}`, 'George is told Nia waved', JSON.stringify(gp));
[st, res] = await api(ns.token, 'wave', { id: msg.id }); ok(st === 409, 'once is enough', JSON.stringify([st, res]));
[st, res] = await api(ps.token, 'wave', { id: msg.id }); ok(st === 404, 'Sam can’t wave at a pigeon that didn’t fly over him', JSON.stringify([st, res]));
// ---- George's side ----
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ns.me.id);
const gl = await txt(G, '.sysline.fly');
ok(/^Nia waved at your pigeon over Volgograd · \d\d:\d\d$/.test(gl), 'George’s chat with Nia: she waved', gl);
await G.p.screenshot({ path: `${out}/fly-george-chat.png` });
await openChat(G, rs.me.id); await G.p.click(`.b[data-act=flymenu][data-id="${msg.id}"]`); await G.p.waitForSelector('.menu-pop'); await G.p.click('.menu-pop [data-act=map]');
await G.p.waitForSelector('.sheet .map'); await G.p.waitForTimeout(1500);
const card = await txt(G, '.mapcard .flyover').catch(() => '');
ok(card === 'Nia waved from Volgograd', 'and his pigeon’s map', card);
await G.p.screenshot({ path: `${out}/fly-george-map.png` });
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
// Reuben, who it's flying to, sees none of it
[st, res] = await api(rs.token, `messages?with=${gs.me.id}`);
ok(st === 200 && res.fly.length === 0 && res.messages.every((m) => !m.fly) && !JSON.stringify(res).includes(ns.me.id), 'Reuben hears nothing of Nia', JSON.stringify(res.fly));
// ---- called back: the friends it would have flown over aren't told ----
await openChat(G, rs.me.id); await send(G, 'turbo', 'Another');
const turbo = one(`SELECT id FROM pg_msgs WHERE sender = '${gs.me.id}' AND pigeon = 'turbo'`)[0].id;
rows = []; for (let k = 0; k < 20 && !rows.length; k++) { await G.p.waitForTimeout(500); rows = flies(`WHERE msg_id = '${turbo}'`); }
[st] = await api(gs.token, 'recall', { id: turbo });
ok(rows.length === 1 && st === 200 && flies(`WHERE msg_id = '${turbo}'`).length === 0, 'calling it back takes its flyover away', JSON.stringify([rows.length, st]));
// ---- a group pigeon flies over her too ----
const [, cg] = await api(gs.token, 'groups', { name: 'Book Club', members: [rs.me.id, ps.me.id] });
const keys = Object.fromEntries([gs, rs, ps].map((s) => [s.me.id, 'k'.repeat(40)])), gid = crypto.randomUUID();
[st] = await api(gs.token, 'group-messages', { id: gid, group: cg.group.id, body: 'x'.repeat(40), keys, pigeon: 'swift' });
rows = []; for (let k = 0; k < 20 && !rows.length; k++) { await G.p.waitForTimeout(500); rows = flies(`WHERE msg_id = '${gid}'`); }
ok(st === 200 && rows.length === 1 && rows[0].user_id === ns.me.id, 'a group pigeon to Singapore flies over Nia too (she isn’t in the group)', JSON.stringify(rows));
// a member who's a friend doesn't get one for another member's pigeon: they're in on it
const [, cg2] = await api(gs.token, 'groups', { name: 'Volga', members: [rs.me.id, ns.me.id] }), gid2 = crypto.randomUUID();
await api(gs.token, 'group-messages', { id: gid2, group: cg2.group.id, body: 'x'.repeat(40), keys: Object.fromEntries([gs, rs, ns].map((s) => [s.me.id, 'k'.repeat(40)])), pigeon: 'swift' });
await G.p.waitForTimeout(2500);
ok(flies(`WHERE msg_id = '${gid2}'`).length === 0, 'none for a member of the group');
// ---- no longer friends: their flyovers go ----
const had = flies(`WHERE user_id = '${ns.me.id}'`).length;
const unfriend = () => fetchR(BASE + '/api/pigeon/friends', { method: 'DELETE', headers: { Authorization: 'Bearer ' + ns.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: gs.me.id }) });
await unfriend().catch(() => unfriend());
ok(had >= 2 && flies(`WHERE user_id = '${ns.me.id}'`).length === 0, 'no longer friends: what George’s pigeons flew over of hers goes', String(had));
console.log('errors', errs); console.log('FAILS', fails); await b.close();
