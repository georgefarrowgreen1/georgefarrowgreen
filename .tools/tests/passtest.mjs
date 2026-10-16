// Named pigeons with careers, end to end against the local stack.
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

// ---- the passport ----
const G = await phone('george'), R = await phone('reuben'), N = await phone('nia'), Q = await phone('quinn');
await signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await signup(R, 'Reuben Tan', 'roobs', 'reuben@example.com', 'Singapore');
await signup(N, 'Nia Brooks', 'nia', 'nia@example.com', 'New York');
await signup(Q, 'Quinn Alves', 'quinn', 'quinn@example.com', 'Rio de Janeiro');
const [gs, rs, ns, qs] = [await sess(G), await sess(R), await sess(N), await sess(Q)];
for (const x of [rs, ns]) { await api(gs.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: gs.me.id, accept: true }); }
await api(ns.token, 'friends', { handle: qs.me.handle }); await api(qs.token, 'friends-respond', { id: ns.me.id, accept: true });
const say = async (ph, kind, text) => { await pickKind(ph.p, kind); await ph.p.fill('#msg', text); await ph.p.click('.send'); await ph.p.waitForTimeout(1500); };
const landMsgs = (q = '1=1') => sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000} WHERE deliver_at > ${Date.now()} AND ${q}`);   // (sent_at kept, so whose turn it is stays right)
const pass = (id) => one(`SELECT place, first_at, first_id, n FROM pg_passport WHERE user_id = '${id}' ORDER BY first_at, place`);
// George sends a rocket to Singapore; until it lands, nothing is stamped
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id);
await say(G, 'rocket', 'Off to Singapore');
const m1 = one(`SELECT id FROM pg_msgs WHERE sender = '${gs.me.id}'`)[0].id;
await tick();
ok(pass(gs.me.id).length === 0, 'in the air: no stamps yet');
landMsgs(); await tick();
let pp = pass(gs.me.id), names = pp.map((x) => x.place);
ok(['the United Kingdom', 'the North Sea', 'Kazakhstan', 'India', 'the Bay of Bengal', 'Singapore'].every((n) => names.includes(n)) && pp.every((x) => x.n === 1 && x.first_id === m1),
  'it lands: a stamp for every country and sea on the way, from home to Singapore', names.join(', '));
const stamped = one(`SELECT id, places FROM pg_stamped`);
ok(stamped.length === 1 && JSON.parse(stamped[0].places)[0] === 'the United Kingdom' && JSON.parse(stamped[0].places).at(-1) === 'Singapore', 'in the order it flew them', stamped[0]?.places);
await tick(); await tick();
ok(pass(gs.me.id).every((x) => x.n === 1), 'each flight is stamped once, however often the tick runs');
// the same way again: counted, not stamped again
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, gs.me.id); await R.p.waitForTimeout(800);
await say(R, 'standard', 'Got it'); landMsgs(); await tick();
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await G.p.waitForTimeout(800);
await say(G, 'standard', 'And again'); landMsgs(); await tick();
const m2 = one(`SELECT id FROM pg_msgs WHERE sender = '${gs.me.id}' ORDER BY sent_at DESC`)[0].id;
pp = pass(gs.me.id);
ok(pp.find((x) => x.place === 'Kazakhstan')?.n === 2 && pp.find((x) => x.place === 'Kazakhstan').first_id === m1, 'flying it again counts it again, and keeps the day it was first stamped');
ok(pass(rs.me.id).some((x) => x.place === 'Singapore') && pass(rs.me.id).some((x) => x.place === 'the United Kingdom'), 'Reuben’s pigeon stamps his own passport');
// a lost pigeon stamps nothing
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await G.p.waitForTimeout(600);
await say(G, 'swift', 'Lost one');
const m3 = one(`SELECT id FROM pg_msgs WHERE sender = '${gs.me.id}' ORDER BY sent_at DESC`)[0].id;
sql(`UPDATE pg_msgs SET lost_at = ${Date.now() - 120000}, deliver_at = ${Date.now() - 60000} WHERE id = '${m3}'`); await tick();
ok(!one(`SELECT id FROM pg_stamped WHERE id = '${m3}'`).length, 'a pigeon lost on the way stamps nothing');
// a group: only the pigeons to friends count
const [, cg] = await api(gs.token, 'groups', { name: 'Clan', members: [ns.me.id] });
await api(ns.token, 'group-add', { id: cg.group.id, members: [qs.me.id] });
const keys = Object.fromEntries([gs, ns, qs].map((x) => [x.me.id, 'k'.repeat(40)])), gid = crypto.randomUUID();
const [gst] = await api(gs.token, 'group-messages', { id: gid, group: cg.group.id, body: 'x'.repeat(40), keys, pigeon: 'swift' });
sql(`UPDATE pg_gdeliv SET deliver_at = ${Date.now() - 60000} WHERE msg_id = '${gid}'`); await tick();
const gstamped = one(`SELECT id FROM pg_stamped WHERE id LIKE '${gid}%'`).map((x) => x.id);
ok(gst === 200 && gstamped.length === 1 && gstamped[0] === `${gid}:${ns.me.id}`, 'in a group: the pigeon to Nia (a friend) is stamped, the one to Quinn (not a friend) isn’t', JSON.stringify(gstamped));
pp = pass(gs.me.id);
ok(pp.some((x) => x.place === 'the North Atlantic' && x.first_id === gid) && !pp.some((x) => /Brazil/.test(x.place)), 'so the Atlantic is in George’s passport, and nowhere near Quinn', pp.filter((x) => x.first_id === gid).map((x) => x.place).join(', '));
// the API and the Flight Log
let [st, res] = await api(gs.token, 'passport');
ok(st === 200 && res.countries + res.seas === res.places.length && res.places.every((p) => typeof p.sea === 'boolean') && res.places.find((p) => p.name === 'the North Sea')?.sea === true && res.places.find((p) => p.name === 'India')?.sea === false,
  'GET passport: each place, sea or country, and the counts', JSON.stringify([res.countries, res.seas]));
[st, res] = await api(gs.token, 'flight-log');
const gt = res.badges.find((b) => b.id === 'globetrotter');
ok(st === 200 && res.passport?.places.length && gt && gt.n === res.passport.countries && gt.of === 25, 'the Flight Log has the passport, and Globetrotter counts countries towards 25', JSON.stringify(gt));
// a flight that landed before the passport existed is stamped as you open it
const old = one(`SELECT COUNT(*) AS n FROM pg_stamped`)[0].n;
sql(`DELETE FROM pg_stamped WHERE id = '${m2}'`); sql(`UPDATE pg_passport SET n = n - 1 WHERE user_id = '${gs.me.id}' AND place = 'Kazakhstan'`);
[st, res] = await api(gs.token, 'passport');
ok(one(`SELECT COUNT(*) AS n FROM pg_stamped`)[0].n === old && res.places.find((p) => p.name === 'Kazakhstan').n === 2, 'older flights get stamped when you open your passport');
// in the app
await G.p.evaluate(() => localStorage.setItem('inflight-theme', 'dark'));
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await G.p.waitForTimeout(1500);
const line = await G.p.locator('.sysline.stamps').allInnerTexts();
ok(line.length >= 1 && line.every((l) => /^New in your passport: .+$/.test(l.trim())) && /^New in your passport: .+ and \d+ more$/.test(line[0].trim()), 'the chat marks each flight that collected new stamps', JSON.stringify(line));
await G.p.screenshot({ path: `${out}/pass-chat.png` });
await G.p.click('.sysline.stamps'); await G.p.waitForSelector('.sheet .ppbook', { timeout: 15000 }); await G.p.waitForTimeout(1200);
// it opens as a book, at the page that flight stamped
const lbl = await txt(G, '.sheet .pplbl');
ok(/^Page 1 of \d+$/.test(lbl), 'tap it: the passport opens at the page that flight stamped', lbl);
const p1 = await G.p.evaluate(() => { const pg = document.querySelector('.ppage[data-i="1"] svg'); return { stamps: [...pg.querySelectorAll('[data-act=stampinfo]')].map((g) => g.dataset.id), outlines: pg.querySelectorAll('path.pf').length, head: pg.querySelector('.ppjr')?.textContent }; });
ok(p1.stamps.length >= 6 && p1.outlines >= 3 && /\d+ [A-Z]{3} · NORWICH → SINGAPORE/.test(p1.head || ''), 'its visa page: stamps with the countries’ outlines, and the journey at the top', JSON.stringify(p1));
await G.p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await G.p.waitForTimeout(300);
await G.p.screenshot({ path: `${out}/pass-page-dark.png` });
// turn every page: every place has its stamp, once
const seen = new Set(p1.stamps);
for (let k = 0; k < 40; k++) {
  if (await G.p.locator('.sheet .ppnext').isDisabled()) break;
  await G.p.click('.sheet .ppnext'); await G.p.waitForTimeout(700);
  const at = await G.p.evaluate(() => { const b = document.querySelector('.ppbook'); return Math.round(b.scrollLeft / b.clientWidth); });
  (await G.p.evaluate((i) => [...document.querySelectorAll(`.ppage[data-i="${i}"] [data-act=stampinfo]`)].map((g) => g.dataset.id), at)).forEach((x) => seen.add(x));
}
ok(seen.size === res.places.length, 'every country and sea has its stamp in the book', `${seen.size} of ${res.places.length}`);
// back to the photo page
for (let k = 0; k < 40 && !(await G.p.locator('.sheet [data-act=ppturn][data-id="-1"]').isDisabled()); k++) { await G.p.click('.sheet [data-act=ppturn][data-id="-1"]'); await G.p.waitForTimeout(450); }
const photo = await G.p.evaluate(() => ({ lbl: document.querySelector('.pplbl')?.textContent, name: [...document.querySelectorAll('.ppdata .ppf b')].map((b) => b.textContent), mrz: document.querySelector('.ppmrz')?.textContent }));
ok(photo.lbl.startsWith('Photo page') && photo.name[0] === 'FARROW-GREEN' && photo.name[1] === 'GEORGE' && /^P<IFLFARROW<GREEN<<GEORGE</.test(photo.mrz) && photo.name.some((x) => /^\d+ OF 195$/.test(x)), 'the photo page: you, your loft and how far your pigeons have flown', JSON.stringify(photo));
await G.p.screenshot({ path: `${out}/pass-photo-dark.png` });
// tap a stamp: when, and how often since
for (let k = 0; k < 20; k++) { const h = await G.p.$('.ppage [data-act=stampinfo][data-id="Kazakhstan"]'); if (h) { await h.click(); break; } await G.p.click('.sheet .ppnext'); await G.p.waitForTimeout(700); }
await G.p.waitForTimeout(400);
ok(/^Kazakhstan: first flown over \d+ \w+ \d{4}, and 1 flight since\.$/.test(await txt(G, '.toast')), 'tap a stamp: when, and how often since', await txt(G, '.toast'));
await G.p.evaluate(() => localStorage.setItem('inflight-theme', 'light')); await G.p.evaluate(() => document.documentElement.dataset.theme = 'light'); await G.p.waitForTimeout(300);
await G.p.screenshot({ path: `${out}/pass-page-light.png` });
// the Flight Log: your passport, closed, and what's in it; open it from there, and Back goes back
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(500);
await G.p.evaluate(() => { location.hash = '#flightlog'; });
await G.p.waitForSelector('.sheet .ppcard', { timeout: 10000 }); await G.p.locator('.sheet .ppcard').scrollIntoViewIfNeeded(); await G.p.waitForTimeout(500);
const card = await txt(G, '.sheet .ppcard');
ok(/George’s Passport ?\d+ journeys? · \d+ pages? stamped ?Last stamp: .+, \d+ \w{3} ?Open Passport/.test(card), 'the Flight Log: your passport, closed, and what’s in it', card);
await G.p.screenshot({ path: `${out}/pass-log-light.png` });
await G.p.click('.sheet .ppcard'); await G.p.waitForSelector('.sheet .ppbook'); await G.p.waitForTimeout(600);
ok(await G.p.locator('.sheet header [data-act=flightlogback]').count() === 1, 'opened from the Flight Log: Back goes back to it');
await G.p.click('.sheet header [data-act=flightlogback]'); await G.p.waitForSelector('.sheet .ppcard'); await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(500);
// the group chat has its line too
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(500); await openChat(G, cg.group.id); await G.p.waitForTimeout(1200);
const gl = await G.p.locator('.sysline.stamps').allInnerTexts(), [, gml] = await api(gs.token, `group-messages?id=${cg.group.id}`);
ok(gl.length === 1 && /^New in your passport: .+, the Irish Sea and \d+ more$|^New in your passport: the Irish Sea, Ireland and \d+ more$/.test(gl[0].trim()) && gml.messages.find((m) => m.id === gid)?.stamps?.includes('the North Atlantic'), 'and so does the group chat, in the order it flew them', `${gl.join(' | ')} | ${JSON.stringify(gml.messages.find((m) => m.id === gid)?.stamps)}`);
// Nia's own view of George's pigeon says nothing about his passport
let [, nl] = await api(ns.token, `group-messages?id=${cg.group.id}`);
ok(nl.messages.every((m) => !m.stamps), 'only you see your stamps');
console.log('errors', errs); console.log('FAILS', fails); await b.close();
