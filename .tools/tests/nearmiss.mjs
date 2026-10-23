// InFlight notifications, end to end against the local stack.
// Push goes to a stand-in push service (PIGEON_PUSH_URL); this script plays the
// phone: it makes the subscription keys and decrypts what arrives (RFC 8291).
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { joinInFlight } from './join.mjs';
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
// (made on the account's own page, then InFlight signed in to: join.mjs)
const signup = (ph, name, handle, email, city) => joinInFlight(ph.p, URL, { name, handle, email, city });
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
  await ph.p.click('[data-act=tab][data-id=account]'); await ph.p.waitForTimeout(700); await ph.p.click('#screen > main.view [data-act=notifysheet]'); await ph.p.waitForSelector('[data-act=pushtoggle]');
  await ph.p.click('[data-act=pushtoggle]'); await ph.p.waitForSelector('[data-act=pushtoggle][aria-checked=true]', { timeout: 10000 });
  const sw = await ph.p.locator('[role=switch][data-id=moments]').getAttribute('aria-checked').catch(() => null);
  await ph.p.keyboard.press('Escape'); await ph.p.waitForTimeout(400); await ph.p.keyboard.press('Escape'); await ph.p.waitForTimeout(400);
  return sw;
}
await fetch('http://127.0.0.1:8798/mode', { method: 'POST', body: '201' });
const gKeys = await makeKeys(), rKeys = await makeKeys();
const G = await phone('george', gKeys), R = await phone('reuben', rKeys), P = await phone('nia');
await signup(G, 'George Farrow-Green', 'george', 'george@example.com', 'Norwich');
await signup(R, 'Reuben Hart', 'reuben', 'reuben@example.com', 'Singapore');
await signup(P, 'Nia Brooks', 'nia', 'nia@example.com', 'New York');
sql("UPDATE pg_users SET notify_prefs = json_object('names', json('true'))");   // (names on: lock-screen names are off unless chosen)
const [gs, rs, ps] = [await sess(G), await sess(R), await sess(P)];
for (const x of [rs, ps]) { await api(gs.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: gs.me.id, accept: true }); }
ok(await pushOn(G) === 'true', 'Notifications has a Mid-air Moments switch, on to start with');
await pushOn(R);
for (const ph of [G, R, P]) { await ph.p.reload(); await ph.p.waitForSelector('.tabs'); }
// ---- one each way between Norwich and Singapore: they pass in the middle ----
await openChat(G, rs.me.id); await send(G, 'rocket', 'On my way');
await openChat(R, gs.me.id); await send(R, 'rocket', 'Mine too');
let rows = [];
for (let k = 0; k < 20 && !rows.length; k++) { await G.p.waitForTimeout(500); rows = one("SELECT a, b, at, place, kind, km, lead FROM pg_near"); }
console.log('flights', JSON.stringify(one("SELECT sender, recipient, pigeon, sent_at, deliver_at FROM pg_msgs")));
const pass = rows.find((x) => x.kind === 'pass');
ok(rows.length === 1 && pass && pass.km < 50 && !/land/.test(pass.place), 'a pigeon each way: the server finds where they’ll pass, and names the place', JSON.stringify(rows));
const flights = one(`SELECT id, sender, sent_at, deliver_at FROM pg_msgs`);
const mid = flights.reduce((a, m) => a + (m.sent_at + m.deliver_at) / 2, 0) / flights.length;
ok(pass && Math.abs(pass.at - mid) < 20 * 60e3, 'about halfway, as they set off together and fly at the same speed', JSON.stringify([pass?.at, mid]));
// ---- to New York: a swift pigeon with a two-hour start, then a turbo after it (both fly straight over: a standard one would hop between islands) ----
await openChat(G, ps.me.id); await send(G, 'swift', 'Slow one');
sql(`UPDATE pg_msgs SET sent_at = sent_at - 7200000, deliver_at = deliver_at - 7200000 WHERE recipient = '${ps.me.id}'`);
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ps.me.id); await send(G, 'turbo', 'Fast one');
rows = [];
for (let k = 0; k < 20 && !rows.length; k++) { await G.p.waitForTimeout(500); rows = one("SELECT a, b, at, place, kind, lead FROM pg_near WHERE kind = 'overtake'"); }
const ov = rows[0], fast = one(`SELECT id FROM pg_msgs WHERE recipient = '${ps.me.id}' AND pigeon = 'turbo'`)[0];
ok(rows.length === 1 && ov.lead === fast?.id, 'a turbo after a swift pigeon: the server sees it overtake, turbo first', JSON.stringify([rows, fast]));
// ---- each moment happens: the flights move back in time so it's just gone by ----
const now = Date.now(); let t0 = now - 1000;
for (const r of one("SELECT a, b, at FROM pg_near")) { const x = r.at - now + 20000; sql(`UPDATE pg_msgs SET sent_at = sent_at - ${x}, deliver_at = deliver_at - ${x} WHERE id IN ('${r.a}', '${r.b}')`); sql(`UPDATE pg_near SET at = at - ${x} WHERE a = '${r.a}' AND b = '${r.b}'`); }
await tick(); await G.p.waitForTimeout(800);
const gp = await Promise.all(pushes().filter((x) => x.at > t0 && x.headers['x-endpoint'].includes('george')).map((x) => decrypt(gKeys, x.body)));
const rp = await Promise.all(pushes().filter((x) => x.at > t0 && x.headers['x-endpoint'].includes('reuben')).map((x) => decrypt(rKeys, x.body)));
ok(gp.some((n) => n.title === 'Near miss' && /^Your pigeon and Reuben’s just passed each other over /.test(n.body) && n.url === `/pigeon/#open=${rs.me.id}`), 'George is told as they pass', JSON.stringify(gp));
ok(rp.some((n) => /^Your pigeon and George’s just passed each other over /.test(n.body)), 'and so is Reuben, from his side', JSON.stringify(rp));
ok(gp.some((n) => /^Your turbo pigeon just overtook your swift one/.test(n.body)), 'George hears his turbo overtook his swift pigeon', JSON.stringify(gp));
await tick(); ok(pushes().filter((x) => x.at > t0).length === gp.length + rp.length, 'each moment is told once');
// ---- the chats ----
const line = async (ph, id) => { await ph.p.reload(); await ph.p.waitForSelector('.tabs'); await openChat(ph, id); await ph.p.waitForTimeout(600); return (await ph.p.locator('.sysline.moment').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ')); };
let l = await line(G, rs.me.id); ok(l.length === 1 && /^Your pigeon and Reuben’s passed each other over .+ · \d\d:\d\d$/.test(l[0]), 'George’s chat with Reuben says so', JSON.stringify(l));
await G.p.screenshot({ path: `${out}/near-chat.png` });
l = await line(R, gs.me.id); ok(l.length === 1 && /^Your pigeon and George’s passed each other over /.test(l[0]), 'and Reuben’s, from his side', JSON.stringify(l));
l = await line(G, ps.me.id); ok(l.length === 1 && /^Your turbo pigeon overtook your swift one/.test(l[0]), 'George’s chat with Nia: the overtake', JSON.stringify(l));
l = await line(P, gs.me.id); ok(l.length === 1 && /^George’s turbo pigeon overtook their swift one/.test(l[0]), 'Nia sees it too, from her side', JSON.stringify(l));
// tap it: the map, with the moment on the card
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await G.p.click('.sysline.moment'); await G.p.waitForSelector('.sheet .map'); await G.p.waitForTimeout(1500);
const nrows = (await G.p.locator('.mapcard .fctl li.near').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(nrows.length === 1 && /^\d\d:\d\d Passed Reuben’s pigeon Over .+$/.test(nrows[0]), 'tapping it opens the map, whose timeline has it once, as a row like the others', JSON.stringify(nrows));
await G.p.screenshot({ path: `${out}/near-map.png` });
const nb = await G.p.locator('.mapcard .fctl li.near').boundingBox();
await G.p.screenshot({ path: `${out}/near-row.png`, clip: { x: 0, y: Math.max(0, nb.y - 120), width: 390, height: nb.height + 240 } });
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(500);
// ---- called back: its moments go ----
await openChat(G, rs.me.id); await send(G, 'turbo', 'Another');
await openChat(R, gs.me.id); await send(R, 'turbo', 'Another back');
const before = one("SELECT COUNT(*) AS n FROM pg_near")[0].n;
const turbo = one(`SELECT id FROM pg_msgs WHERE sender = '${gs.me.id}' AND recipient = '${rs.me.id}' AND pigeon = 'turbo'`)[0];
const ahead = one(`SELECT COUNT(*) AS n FROM pg_near WHERE (a = '${turbo.id}' OR b = '${turbo.id}') AND at > ${Date.now()}`)[0].n;
const [st] = await api(gs.token, 'recall', { id: turbo.id });
const after = one("SELECT COUNT(*) AS n FROM pg_near")[0].n, left = one(`SELECT COUNT(*) AS n FROM pg_near WHERE a = '${turbo.id}' OR b = '${turbo.id}'`)[0].n;
ok(ahead >= 1 && st === 200 && after === before - ahead && left === 0, 'calling a pigeon back takes away the near misses it would have had', JSON.stringify([before, ahead, st, after, left]));
// ---- a pigeon each way can't be seen by anyone else ----
const [, pl] = await api(ps.token, `messages?with=${gs.me.id}`);
ok(pl.messages.every((m) => (m.near || []).every((n) => n.other.to === ps.me.id || n.other.from === ps.me.id)), 'Nia only hears of moments between pigeons she could see');
console.log('errors', errs); console.log('FAILS', fails); await b.close();
