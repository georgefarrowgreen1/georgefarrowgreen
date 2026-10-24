// Plan around the weather, end to end against the local stack (the weather stand-in on :8796).
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
  await ph.p.click('[data-act=tab][data-id=account]'); await ph.p.waitForTimeout(700);
  await ph.p.click('#screen > main.view [data-act=pushtoggle]'); await ph.p.waitForSelector('#screen > main.view [data-act=pushtoggle][aria-checked=true]', { timeout: 10000 });
  // (whether Mid-air Moments is on: the account's, as InFlight has it from its sync)
  return ph.p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('inflight'); r.onerror = () => res(null);
    r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onerror = () => res(null);
      g.onsuccess = () => fetch('/api/pigeon/sync', { headers: { Authorization: 'Bearer ' + g.result?.token } }).then((x) => x.json()).then((d) => res(String(!!d.me?.notify?.moments)), () => res(null)); };
  }));
}
const fetchR = async (...a) => { for (let i = 0; ; i++) { try { return await fetch(...a); } catch (e) { if (i > 3) throw e; await new Promise((r) => setTimeout(r, 300)); } } };
const mode = (m) => fetchR('http://127.0.0.1:8796/mode', { method: 'POST', body: JSON.stringify(m) });
const wxlog = () => readFileSync(`${S}/weatherlog.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
// storms over the Alps for the next six hours, then clear; still air
await mode({ speed: 0, from: 270, down: false, pattern: 'alps-storm', clearAfter: 6 });
const G = await phone('george'), R = await phone('rosa'), P = await phone('nia');
await signup(G, 'George Farrow-Green', 'george', 'george@example.com', 'London');
await signup(R, 'Rosa Bianchi', 'rosa', 'rosa@example.com', 'Rome');
await signup(P, 'Nia Brooks', 'nia', 'nia@example.com', 'New York');
const [gs, rs, ps] = [await sess(G), await sess(R), await sess(P)];
await api(gs.token, 'friends', { handle: 'rosa' }); await api(rs.token, 'friends-respond', { id: gs.me.id, accept: true });
await G.p.reload(); await G.p.waitForSelector('.tabs');
// ---- the server's forecast ----
const log0 = wxlog().length;
let [st, res] = await api(gs.token, `wx-plan?with=${rs.me.id}`);
const h0 = Math.floor(Date.now() / 3600e3) * 3600e3;
ok(st === 200 && res.now.f < 0.9 && res.now.wx?.k === 'storms' && res.hours.length === 24 && res.hours[0].at === h0 && res.hours[5].f < 0.9 && res.hours[6].f === 1 && res.hours[6].wx === null,
  'the forecast along the way: storms now, clear from six hours on', JSON.stringify([st, res.now, res.hours.slice(4, 8)]));
const asked = wxlog().slice(log0).find((x) => x.q.hourly);
ok(asked && asked.q.forecast_hours === '24' && asked.q.timeformat === 'unixtime' && Object.keys(asked.q).every((k) => ['latitude', 'longitude', 'hourly', 'forecast_hours', 'minutely_15', 'forecast_minutely_15', 'timeformat', 'wind_speed_unit'].includes(k)) && asked.q.latitude.split(',').every((x) => Number(x) * 4 === Math.round(Number(x) * 4)),
  'Open-Meteo is only asked about squares of sky along the way', JSON.stringify(asked?.q));
[st] = await api(ps.token, `wx-plan?with=${rs.me.id}`); ok(st === 403, 'only for a friend', String(st));
// ---- the composer says so ----
await openChat(G, rs.me.id); await G.p.waitForSelector('.wxplan:not([hidden])', { timeout: 8000 }).catch(() => {});
let plan = await txt(G, '.wxplan').catch(() => '');
ok(/^Storms over .+: about \d+h \d+m slower than in calm air\. Clear by \d\d:00( tomorrow)?: a swift pigeon leaving then lands (today|tomorrow) at \d\d:\d\d\. ?Swift at \d\d:00$/.test(plan), 'a standard pigeon: slower in this weather, and a swift one could leave when it clears', plan);
await G.p.screenshot({ path: `${out}/wx-standard.png` });
const hh = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' }).format(new Date(h0 + 6 * 3600e3));
ok(plan.includes(`Clear by ${hh}:00`), 'clear from the hour the forecast clears', hh);
// pick swift: the same, for this pigeon
await pickKind(G.p, 'swift');
plan = await txt(G, '.wxplan');
ok(/: about \d+h \d+m slower than in calm air\. Clear by \d\d:00( tomorrow)?: leave then and it lands (today|tomorrow) at \d\d:\d\d\. ?Leave at \d\d:00$/.test(plan), 'a swift pigeon: leave then', plan);
// ---- leave when it clears ----
await G.p.click('.wxplan .wxwait'); await G.p.waitForTimeout(400);
const booked = [await txt(G, '.compose .kind'), await G.p.locator('.compose .kind .ico').count(), await G.p.getAttribute('#msg', 'placeholder')], hidden = await G.p.locator('.wxplan').isHidden();
ok(booked[0] === 'Swift' && booked[1] === 2 && /^Lands ((tomorrow|Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?\d\d:\d\d$/.test(booked[2]) && hidden, 'it’s booked to land then (a clock on the pigeon, the time as the hint); the weather note steps aside', JSON.stringify(booked));
await G.p.screenshot({ path: `${out}/wx-booked.png` });
const n0 = Number(one('SELECT COUNT(*) AS n FROM pg_msgs')[0].n);
await G.p.fill('#msg', 'When the storms pass'); await G.p.click('.send');
for (let k = 0; k < 20 && Number(one('SELECT COUNT(*) AS n FROM pg_msgs')[0].n) === n0; k++) await G.p.waitForTimeout(300);
const m = one(`SELECT pigeon, sched, sent_at, deliver_at, wx_ms, wind_f FROM pg_msgs WHERE sender = '${gs.me.id}'`)[0];
ok(m && m.pigeon === 'swift' && m.sched === 1 && Math.abs(m.sent_at - (h0 + 6 * 3600e3)) < 2 * 60e3 && Math.abs(m.wx_ms) < 60e3 && m.wind_f === 1,
  'it takes off as the skies clear, and flies through clear skies', JSON.stringify(m));
// ---- a tailwind ----
await mode({ speed: 40, from: 270, down: false, pattern: '' });
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id);
await G.p.click('.compose .kind'); await G.p.waitForSelector('.sheet .kinds'); if (await G.p.locator('.sheet [data-act=pigeon][data-id=standard]').isEnabled()) await G.p.click('.sheet [data-act=pigeon][data-id=standard]'); await G.p.click('.sheet header [data-act=close]'); await G.p.waitForTimeout(450);
await G.p.waitForSelector('.wxplan:not([hidden])', { timeout: 8000 }).catch(() => {});
plan = await txt(G, '.wxplan').catch(() => '');
ok(/^A tailwind today: about (\d+h )?\d+m sooner than in calm air\.$/.test(plan) && await G.p.locator('.wxplan.early').count() === 1, 'a strong tailwind gets a word', plan);
await G.p.screenshot({ path: `${out}/wx-tailwind.png` });
// ---- calm: nothing to say; and no forecast: nothing either ----
await mode({ speed: 0, from: 270, down: false, pattern: '' });
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await G.p.waitForTimeout(1500);
ok(await G.p.locator('.wxplan').isHidden(), 'calm skies: no note');
await mode({ speed: 0, from: 270, down: true, metDown: true, pattern: '' });
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, rs.me.id); await G.p.waitForTimeout(1500);
ok(await G.p.locator('.wxplan').isHidden() && await G.p.locator('.compose .note').isHidden() && /^Lands /.test(await G.p.getAttribute('#msg', 'placeholder')), 'the forecast down: no note, and sending carries on');
await mode({ speed: 0, from: 270, down: false, pattern: '' });
console.log('errors', errs); console.log('FAILS', fails); await b.close();
