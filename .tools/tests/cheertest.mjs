// Cheer it on, end to end against the local stack.
// Push goes to a stand-in push service (PIGEON_PUSH_URL); this script plays the
// phone: it makes the subscription keys and decrypts what arrives (RFC 8291).
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
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
async function signup(ph, name, handle, email, city) {
  await ph.p.waitForSelector('.welcome'); await ph.p.click('[data-act=to][data-id=signup]');
  await ph.p.fill('#f-name', name); await ph.p.fill('#f-handle', handle); await ph.p.fill('#f-email', email); await ph.p.fill('#f-password', 'a long test password');
  await ph.p.click('[data-form=signup] .btn'); await ph.p.waitForSelector('#city', { state: 'attached', timeout: 20000 });
  await ph.p.selectOption('#city', city); await ph.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
  await ph.p.waitForSelector('[data-act=pkadd]'); await ph.p.click('[data-act=onbdone]'); await ph.p.waitForSelector('.tabs');
}
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
await pushOn(G); await pushOn(R);
for (const ph of [G, R, P]) { await ph.p.reload(); await ph.p.waitForSelector('.tabs'); }
const row = (id) => one(`SELECT id, sent_at, deliver_at, legs, cheer_by, cheer_ms, lost_at FROM pg_msgs WHERE id = '${id}'`)[0];
const pushesTo = async (keys, who, since) => Promise.all(pushes().filter((x) => x.at > since && x.headers['x-endpoint'].includes(who)).map((x) => decrypt(keys, x.body)));
const waitPush = async (keys, who, since, re) => { for (let k = 0; k < 20; k++) { const ps = await pushesTo(keys, who, since); const hit = ps.find((n) => re.test(n.title + ' ' + n.body)); if (hit) return hit; await G.p.waitForTimeout(300); } return null; };

// ---- a rocket each way, an hour into their flights ----
await openChat(G, rs.me.id); await send(G, 'rocket', 'On my way');
await openChat(R, gs.me.id); await send(R, 'rocket', 'Mine too');
let near = [];
for (let k = 0; k < 20 && !near.length; k++) { await G.p.waitForTimeout(500); near = one("SELECT a, b, at FROM pg_near"); }
sql(`UPDATE pg_msgs SET sent_at = sent_at - 3600000, deliver_at = deliver_at - 3600000`); sql(`UPDATE pg_near SET at = at - 3600000`);
for (const x of one(`SELECT id, legs FROM pg_msgs WHERE legs IS NOT NULL`)) sql(`UPDATE pg_msgs SET legs = '${JSON.stringify(JSON.parse(x.legs).map((l) => [l[0], l[1], l[2] - 3600000, ...l.slice(3)])).replace(/"/g, '\\"')}' WHERE id = '${x.id}'`);   // (its planned way too: a pass)
const own = (legs) => legs.filter((l) => !l[3] || l[3] === 'c');   // cheers and turns (not the planned way)
const gm = one(`SELECT id FROM pg_msgs WHERE sender = '${gs.me.id}'`)[0].id, rm = one(`SELECT id FROM pg_msgs WHERE sender = '${rs.me.id}'`)[0].id;
const nearAt0 = one("SELECT at FROM pg_near")[0]?.at;
// the menu on your pigeon in the air has it
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id);
await G.p.click(`[data-act=flymenu][data-id="${gm}"]`); await G.p.waitForSelector('.menu-pop');
ok(/^Cheer It On\s+It lands a little sooner$/.test(await G.p.locator('.menu-pop [data-act=cheer]').innerText().then((s) => s.trim())), 'the menu on a pigeon in the air: Cheer It On', await G.p.locator('.menu-pop [data-act=cheer]').innerText());
await G.p.click('.menu-pop [data-act=map]'); await G.p.waitForSelector('.sheet .map'); await G.p.waitForTimeout(1200);
ok((await txt(G, '.mapcard .cheerbtn')).trim() === 'Cheer It On' && await G.p.locator('.mapcard .cheerbtn').isEnabled(), 'its map card has the button too');
const before = row(gm), t0 = Date.now();
await G.p.click('.mapcard .cheerbtn'); await G.p.waitForTimeout(450);
await G.p.screenshot({ path: `${out}/cheer-gust.png` });
await G.p.waitForSelector('.toast'); const toastTxt = await txt(G, '.toast');
const after = row(gm), cut = before.deliver_at - after.deliver_at, leftThen = before.deliver_at - t0;
const legs = own(JSON.parse(after.legs || '[]'));
const want = Math.min(0.04 * leftThen, 15 * 60e3);
ok(Math.abs(cut - want) < 0.003 * leftThen, 'cheering takes 4% off the time it has left, 15 minutes at most', JSON.stringify([cut, leftThen]));
ok(legs.length === 1 && legs[0][3] === 'c' && Math.abs(legs[0][2] - t0) < 5000, 'and marks where it was when it sped up (not a turn)', after.legs);
ok(/^A little tailwind: it lands \d+ minutes? sooner\.$/.test(toastTxt), 'it says how much sooner', toastTxt);
await G.p.waitForTimeout(1500);
const card = await txt(G, '.mapcard');
ok(/Cheered on once · \d+ minutes? sooner/.test(card), 'the card says it was cheered on, and by how much', card);
ok((await txt(G, '.mapcard .cheerbtn')).trim() === 'Cheer It On · 2 left', 'and how many cheers you have left', await txt(G, '.mapcard .cheerbtn'));
await G.p.screenshot({ path: `${out}/cheer-card.png` });
// Reuben hears of it
const rp = await waitPush(rKeys, 'reuben', t0, /A little tailwind/);
ok(rp && /^George cheered on their pigeon to you\. It lands (\d+ min|\dh \d+m) sooner\.$/.test(rp.body) && rp.url === `/pigeon/#open=${gs.me.id}`, 'Reuben is told: it lands sooner', JSON.stringify(rp));
// the meeting in mid-air moves with it
const nearAt1 = one("SELECT at FROM pg_near")[0]?.at;
ok(nearAt0 && nearAt1 && nearAt1 < nearAt0, 'the near miss ahead moves to when the faster pigeon now meets the other', JSON.stringify([nearAt0, nearAt1]));
// three each
for (let k = 0; k < 2; k++) { await G.p.waitForSelector('.mapcard .cheerbtn:not([disabled])', { timeout: 8000 }); await G.p.click('.mapcard .cheerbtn'); await G.p.waitForTimeout(1600); }
await G.p.waitForTimeout(800);
ok((await txt(G, '.mapcard .cheerbtn')).trim() === 'Cheered On' && !(await G.p.locator('.mapcard .cheerbtn').isEnabled()), 'after three, the button says Cheered On and rests', await txt(G, '.mapcard .cheerbtn'));
let [st, res] = await api(gs.token, 'cheer', { id: gm });
ok(st === 409 && /all you can/.test(res.error), 'a fourth cheer from George is turned down', JSON.stringify([st, res]));
const three = row(gm);
ok(own(JSON.parse(three.legs)).length === 3 && own(JSON.parse(three.legs)).every((l) => l[3] === 'c') && JSON.parse(three.cheer_by)[gs.me.id] === 3, 'three cheers: three points it sped up at', three.legs);
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(600);
await G.p.click(`[data-act=flymenu][data-id="${gm}"]`); await G.p.waitForSelector('.menu-pop'); const meta = await txt(G, '.menu-pop [data-act=map] small'); await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
ok(/cheered on ×3/.test(meta) && !/changed course/.test(meta), 'its menu says it was cheered on, not that it changed course', meta);
await openChat(G, rs.me.id); await G.p.click(`[data-act=flymenu][data-id="${gm}"]`); await G.p.waitForSelector('.menu-pop');
ok(await G.p.locator('.menu-pop [data-act=cheer]').count() === 0, 'and the menu stops offering it');
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
// ---- Reuben cheers on the one flying to him ----
const t1 = Date.now();
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, gs.me.id);
await R.p.click(`[data-act=map][data-id="${gm}"]`); await R.p.waitForSelector('.sheet .map'); await R.p.waitForTimeout(1200);
ok((await txt(R, '.mapcard .cheerbtn')).trim() === 'Cheer It On', 'Reuben can cheer on the pigeon flying to him', await txt(R, '.mapcard'));
await R.p.click('.mapcard .cheerbtn'); await R.p.waitForTimeout(1500);
const four = row(gm), by = JSON.parse(four.cheer_by);
ok(by[gs.me.id] === 3 && by[rs.me.id] === 1 && four.deliver_at < three.deliver_at, 'his cheer counts on its own', four.cheer_by);
ok(/Cheered on 4 times/.test(await txt(R, '.mapcard')), 'both cards count every cheer', await txt(R, '.mapcard'));
const gp = await waitPush(gKeys, 'george', t1, /A little tailwind/);
ok(gp && /^Reuben cheered on your pigeon\. It lands .+ sooner\.$/.test(gp.body) && gp.url === `/pigeon/#open=${rs.me.id}`, 'George is told Reuben cheered his pigeon on', JSON.stringify(gp));
await R.p.screenshot({ path: `${out}/cheer-reuben.png` });
await R.p.keyboard.press('Escape');
// ---- who can't ----
[st, res] = await api(ps.token, 'cheer', { id: gm }); ok(st === 404, 'Nia can’t cheer on a pigeon that isn’t hers to see', JSON.stringify([st, res]));
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000} WHERE id = '${rm}'`);
[st, res] = await api(gs.token, 'cheer', { id: rm }); ok(st === 409 && /already landed/.test(res.error), 'too late once it has landed', JSON.stringify([st, res]));
// ---- moving still turns it: a cheer is no turn ----
await fetch(BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + rs.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 3.14, lon: 101.69, place: 'Kuala Lumpur' }) });
const turned = own(JSON.parse(row(gm).legs));
ok(turned.length === 5 && turned[4][3] !== 'c', 'Reuben moves: it turns for him, though it was just cheered on', JSON.stringify(turned));
// ---- a group: George cheers the flock; Nia her own ----
const [, cg] = await api(gs.token, 'groups', { name: 'Book Club', members: [rs.me.id, ps.me.id] });
const keys = Object.fromEntries([gs, rs, ps].map((s) => [s.me.id, 'k'.repeat(40)])), gid = crypto.randomUUID();
[st] = await api(gs.token, 'group-messages', { id: gid, group: cg.group.id, body: 'x'.repeat(40), keys, pigeon: 'standard' });
sql(`UPDATE pg_gmsgs SET sent_at = sent_at - 1800000 WHERE id = '${gid}'`);
const gd = () => Object.fromEntries(one(`SELECT user_id, deliver_at, legs, cheer_by FROM pg_gdeliv WHERE msg_id = '${gid}'`).map((d) => [d.user_id, d]));
const g0 = gd();
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, cg.group.id);
await G.p.click(`[data-act=flymenu][data-id="${gid}"]`); await G.p.waitForSelector('.menu-pop');
ok(/^Cheer Them On\s+They land a little sooner$/.test(await G.p.locator('.menu-pop [data-act=cheer]').innerText().then((s) => s.trim())), 'in a group, the sender cheers them all on', await G.p.locator('.menu-pop [data-act=cheer]').innerText());
await G.p.click('.menu-pop [data-act=cheer]'); await G.p.waitForTimeout(1500);
const g1 = gd();
ok([rs, ps].every((s) => g1[s.me.id].deliver_at < g0[s.me.id].deliver_at && JSON.parse(g1[s.me.id].cheer_by)[gs.me.id] === 1), 'every pigeon of the flock lands sooner', JSON.stringify([g0, g1]));
const np = await waitPush(rKeys, 'reuben', t1, /A little tailwind/);
ok(np && /^George cheered on their pigeon to you\. It lands 15 min sooner\.$/.test(np.body) && np.url === `/pigeon/#open=${cg.group.id}`, 'and each member is told, into the group (a long flight: 15 minutes at most)', JSON.stringify(np));
[st, res] = await api(ps.token, 'group-cheer', { id: gid });
const g2 = gd();
ok(st === 200 && res.n === 1 && g2[ps.me.id].deliver_at < g1[ps.me.id].deliver_at && g2[rs.me.id].deliver_at === g1[rs.me.id].deliver_at, 'Nia cheers on only the one flying to her', JSON.stringify([st, res]));
await G.p.click(`[data-act=flymenu][data-id="${gid}"]`).catch(() => {}); await G.p.keyboard.press('Escape');
await G.p.click(`[data-act=flymenu][data-id="${gid}"]`); await G.p.waitForSelector('.menu-pop'); await G.p.click('.menu-pop [data-act=map]'); await G.p.waitForSelector('.sheet .map'); await G.p.waitForTimeout(1200);
ok(/Cheer Them On · 2 left/.test(await txt(G, '.mapcard .cheerbtn')), 'the flock’s card counts George’s cheers', await txt(G, '.mapcard'));
await G.p.screenshot({ path: `${out}/cheer-flock.png` });
console.log('errors', errs); console.log('FAILS', fails); await b.close();
