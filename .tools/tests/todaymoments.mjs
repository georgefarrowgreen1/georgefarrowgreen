// needs: hub
// InFlite's day, the six moments of milestone 1 on real data (Today First, spec §4.1, §14.3, §14.4): George at the hub
// (ifl.test:8788, the inflite repo's Worker: one window, Today first), Pat, Mira and Leo on chat.ifl.test as Chat's own
// installs, all on one database. Nothing is a fixture: every card is worked out by the account's server from the rows the
// apps' own routes write (Ride At, Chat's time-offer and fit-offer, Fitness's day, Markets' holding and alert, Weather's
// place), and the words come from the stand-ins for the weather and the markets.
//   (1) morning: the plan joined up; the clash moved at do, with Undo (18:00 back, the rule at suggest in You); the habit
//       ride added with Undo (the offer no, hidden at once); the morning push saying the act, without Mira's name
//   (2) midday: the weather you'll ride in; Pat's two messages, her name from the server and her words from Chat's engine
//       on the phone, with a Tesco chip from the first; neither message's words anywhere they mustn't be
//   (3) send: the weather to Pat from Today, in the engine's sheet over Today; you stay on Today; live in Pat's chat
//   (4) preride: a ride 30 minutes ahead (Ride At): the ride card; Radar in the window; then riding: a message to George
//       gives no push while a MeteoAlarm warning does; Chats' held row
//   (5) after: a waiting Garmin row with time and distance (not fx_acts): the honest card; then the ride in fx_acts as
//       Fitness's import puts it, and Today again: Stress and Fitness up; Mira wrote while you rode, with her words; the
//       held message released "while you rode"; Send to Leo in one tap, live in Leo's chat
//   (6) evening, quiet hours on: Tesco past its alert, the day closed, tomorrow first; a message arrives with no push
// Every request URL and body from every frame of every phone is recorded (ctx.route), and every push opened with the
// keys the test holds: none of the words typed (Pat's two messages, Mira's, Pat's at night) is in any of them, nor in
// Today's storage at the hub.
// The time of day (§14.4, layer 3): real time, the data placed relative to now, and the account's zone chosen with zoneAt
// so now is the moment's hour there: on the account (Today's morning, PUT /api/morning {tz}, and the account's
// notifications, PATCH /api/notify {quiet: {tz}}) and on the phone. George's phone is one browser profile, opened again in
// each moment's zone (a context's zone is fixed once it's made, and Chat, as it opens, sets the account's notifications
// to the phone's own zone, which Today goes by: so the phone's zone and the account's must agree), keeping everything it
// had (Chat's key in IndexedDB, the cookie, the root worker and its subscription). Each moment puts its own rows in for
// its own hour; the after moment follows the preride's ride in the same zone (an activity's phase outranks the clock's).
// Weather's cell moves a little each moment (still London, inside the warning's area), so the server's copy of a cell's
// forecast is never last moment's.
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { kit } from './lib.mjs';
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { makeAccount, joinChat, onAccountPage } from './join.mjs';
import { hostCall } from './handback.mjs';
import * as F from './mocks/wxappdata.mjs';
import * as OW from './mocks/wxwarnings.mjs';

const [,, S, out] = process.argv;
// (instant chats, as new accounts have them on the site: PIGEONS=0, the database kept; instant.mjs does the same)
execSync(`${S}/restartkeep.sh`, { env: { ...process.env, PIGEONS: '0' }, stdio: 'ignore' });
const K = await kit(S, out);
const { ok, one, sql, api, HUB, errs } = K;
const CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const MIN = 60e3, H = 3600e3, DAY = 864e5;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000, step = 400) => { const end = Date.now() + ms; for (;;) { const v = await Promise.resolve().then(f).catch(() => null); if (v || Date.now() > end) return v; await wait(step); } };
const esc = (s) => String(s).replace(/'/g, "''");
// (anything, said in a line for a check's note, cut short: undefined too)
const js = (x, n = 200) => String(JSON.stringify(x) ?? x).slice(0, n);
// (an SQL error said in a line: wrangler's own words after ERROR, without its colours or its warnings)
const sqlErr = (e) => (String(e.stderr || e.message).replace(/\x1b\[[0-9;]*m/g, '').match(/ERROR\]?\s*(.+)/)?.[1] || String(e.message)).slice(0, 200);
// (lib.mjs hands the statement to wrangler inside the shell's double quotes: those, $, ` and \ in it kept as they are)
const shell = (q) => q.replace(/(["$`\\])/g, '\\$1');
const rows = (q) => { try { return one(shell(q)); } catch (e) { console.log('SQL', sqlErr(e)); return []; } };
const run = (q, quiet = false) => { try { sql(shell(q)); return true; } catch (e) { if (!quiet) console.log('SQL', sqlErr(e)); return false; } };
const step = (n, title, secs) => console.log(`\n---- (${n}) ${title}  [spec ${secs}] ----`);
const shot = (ph, name) => ph.p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});

// The words typed on the friends' phones: each must stay in Chat's sealed letters, and nowhere else (§3.7, §7.4)
const SAID = { pat1: 'Did you see Tesco this week?', pat2: 'Dinner Friday?', mira: 'Still on for later? Might be five minutes late', night: 'Night night, speak tomorrow' };

// ---- time and zones (spec §14.4) ----
const zoneAt = (hh, t = Date.now()) => { const off = ((hh - new Date(t).getUTCHours() + 36) % 24) - 12;
  return off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`; };   // Etc/GMT-5 is UTC+5
// (a zone's offset from UTC in hours, now: Etc/GMT-5 is +5; any other zone as Intl has it)
const offOf = (tz, t = Date.now()) => {
  if (/^Etc\/GMT([+-]\d+)?$/.test(tz)) return tz === 'Etc/GMT' ? 0 : -Number(tz.slice(7));
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / MIN) * MIN) / 3600e3);
};
const local = (tz, t) => new Date(t + offOf(tz) * H);
const dayIn = (tz, t) => local(tz, t).toISOString().slice(0, 10);
const hm = (tz, t) => local(tz, t).toISOString().slice(11, 16);
const minsIn = (tz, t) => { const d = local(tz, t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const wall = (tz, day, hh, mm = 0) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d, hh, mm) - offOf(tz) * H; };
const dayAfter = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
const step5 = (t) => Math.ceil(t / (5 * MIN)) * 5 * MIN, q15 = (t) => Math.ceil(t / (15 * MIN)) * 15 * MIN;

// ---- the stand-in for Open-Meteo (Weather's forecast, a ride's hours, the past weeks) and MeteoAlarm, on :8794 ----
// Every day where George is: dry, but rain from 15:00 to 18:00 his time, heaviest at 17:00; 14°, feeling 11°; light
// wind; light from 06:00 to 20:00 his time. MeteoAlarm says nothing until a moment asks for its warning (WX.warn).
// (the place's clock is George's: Open-Meteo answers in the place's own zone, and George's place is where he is)
const WX = { tz: zoneAt(7), warn: false };
const RAIN = { 15: 0.6, 16: 1.2, 17: 2.5 };
const byHour = (lh) => { const p = RAIN[lh] || 0;
  return { precip: p, code: p ? (p > 2 ? 65 : 63) : 2, pop: p ? 90 : 5, temp: 14, feels: 11, wind: 9, gust: 18, day: lh >= 6 && lh < 20 ? 1 : 0 }; };
const at = (t) => byHour(local(WX.tz, t).getUTCHours());          // (a real moment)
const atWall = (w) => byHour(new Date(w).getUTCHours());           // (a moment on the place's clock)
// Weather's whole forecast (functions/_todaywx.js, as Weather's own): the tests' usual one (mocks/wxappdata.mjs), made
// on the place's clock (its times, days, now and quarter hours all local, utc_offset_seconds George's), with the day's
// weather above put in
function weatherForecast(now) {
  const off = offOf(WX.tz), wallNow = now + off * H, f = F.forecast(wallNow, {}), hs = f.hourly, wall = (s) => Date.parse(s.length === 16 ? s + 'Z' : s);
  Object.assign(f, { timezone: WX.tz, timezone_abbreviation: WX.tz, utc_offset_seconds: off * 3600 });
  hs.time.forEach((s, i) => { const w = atWall(wall(s));
    hs.precipitation[i] = hs.rain[i] = w.precip; hs.weather_code[i] = w.code; hs.precipitation_probability[i] = w.pop; hs.temperature_2m[i] = w.temp;
    hs.apparent_temperature[i] = w.feels; hs.wind_speed_10m[i] = w.wind; hs.wind_gusts_10m[i] = w.gust; hs.is_day[i] = w.day; hs.cloud_cover[i] = w.precip ? 100 : 40; });
  // (each quarter's rain is the 15 minutes up to its time)
  const mq = f.minutely_15;
  mq.time.forEach((s, i) => { const w = atWall(wall(s) - 1); mq.precipitation[i] = w.precip / 4; mq.weather_code[i] = w.code; });
  const w = atWall(wallNow);
  Object.assign(f.current, { temperature_2m: w.temp, apparent_temperature: w.feels, weather_code: w.code, precipitation: w.precip / 4, is_day: w.day, wind_speed_10m: w.wind, wind_gusts_10m: w.gust });
  for (let i = 0; i < f.daily.time.length; i++) { f.daily.precipitation_sum[i] = f.daily.rain_sum[i] = 4.3; f.daily.precipitation_hours[i] = 3; f.daily.precipitation_probability_max[i] = 90; f.daily.weather_code[i] = 65; }
  return f;
}
const RIDE_COLS = { temperature_2m: (w) => w.temp, apparent_temperature: (w) => w.feels, precipitation_probability: (w) => w.pop, precipitation: (w) => w.precip, weather_code: (w) => w.code,
  wind_speed_10m: (w) => w.wind, wind_gusts_10m: (w) => w.gust, wind_direction_10m: () => 250, is_day: (w) => w.day, rain: (w) => w.precip, cloud_cover: (w) => (w.precip ? 100 : 40) };
function hoursForecast(u) {
  const past = Number(u.searchParams.get('past_days') || 0), unix = u.searchParams.get('timeformat') === 'unixtime', now = Date.now();
  const from = Math.floor((now - past * DAY) / DAY) * DAY - DAY, time = [];
  for (let t = from; t < from + (past + 9) * DAY; t += H) time.push(t);
  const want = (u.searchParams.get('hourly') || '').split(',').filter((k) => RIDE_COLS[k]);
  return { latitude: +u.searchParams.get('latitude'), longitude: +u.searchParams.get('longitude'), utc_offset_seconds: offOf(WX.tz) * 3600, timezone: WX.tz,
    hourly: { time: time.map((t) => (unix ? t / 1000 : new Date(t + offOf(WX.tz) * H).toISOString().slice(0, 16))), ...Object.fromEntries(want.map((k) => [k, time.map((t) => RIDE_COLS[k](at(t)))])) } };
}
const asked = [];
http.createServer((req, res) => { try { answer(req, res); } catch (e) { console.log('weather stand-in:', e.message); res.writeHead(500); res.end(); } }).listen(8794, '127.0.0.1');
function answer(req, res) {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  asked.push(u.pathname + (u.searchParams.get('daily') ? '?daily' : u.searchParams.get('past_days') > 1 ? '?past' : u.searchParams.get('timeformat') ? '?unix' : ''));
  if (u.pathname === '/v1/forecast') {
    // (Weather's whole forecast asks for days as well as hours; a ride's hours, Fitness's hoursAt, and the past weeks,
    // pastWet, ask for hours alone)
    if (!u.searchParams.get('daily')) return send(hoursForecast(u));
    const n = (u.searchParams.get('latitude') || '').split(',').length, f = weatherForecast(Date.now());
    return send(n > 1 ? Array(n).fill(f) : f);
  }
  if (u.pathname === '/api/v1/warnings/feeds-united-kingdom') return send(WX.warn ? OW.ukFeed(Date.now()) : { warnings: [] });
  if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
  if (u.pathname === '/flood-monitoring/id/floods') return send({ items: [] });
  if (u.pathname === '/api/data/stationinfo') return send([]);
  res.writeHead(404); res.end();
}
// (the site's schedulers, as workers/ticker calls them)
const tickAt = (path, host = 'localhost') => new Promise((done) => {
  const q = http.request({ host: '127.0.0.1', port: 8788, path, method: 'POST', agent: false, headers: { Host: host, Authorization: 'Bearer tick-test-secret' } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (_) {} done({ s: res.statusCode, j }); });
  });
  q.on('error', (e) => done({ s: 0, j: { error: e.message } })); q.end();
});
const chatTick = () => K.tick();
const todayTick = () => tickAt('/api/today/tick');
const weatherTick = () => tickAt('/api/weather/tick');
const marketsMode = (m) => fetch('http://127.0.0.1:8801/mode', { method: 'POST', body: JSON.stringify(m) }).catch(() => {});

// ---- the recorders: every request from every frame of every phone, and every push, opened ----
const REC = [];
async function record(ctx, who) {
  await ctx.route('**/*', async (route) => {
    const q = route.request();
    let body = null;
    try { const b = q.postDataBuffer(); body = b ? b.toString('utf8') : null; } catch (_) {}
    REC.push({ who, method: q.method(), url: q.url(), body });
    await route.continue().catch(() => {});
  });
}
const KEYS = {};
const opened = async () => {
  const all = [];
  for (const p of K.pushes()) {
    const name = /\/send\/([a-z]+)-device$/.exec(p.headers['x-endpoint'] || '')?.[1];
    if (!name || !KEYS[name]) continue;
    all.push({ name, at: p.at, ...(await K.decrypt(KEYS[name], p.body).catch(() => ({ undecrypted: true }))) });
  }
  return all;
};
const pushesSince = async (name, since) => (await opened()).filter((x) => x.name === name && x.at > since);

// ---- the phones ----
const b64u = (u) => Buffer.from(u).toString('base64url');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
// A friend's phone: Chat on its own (chat.ifl.test), as installed before InFlite was one app, with push keys this test holds
async function chatPhone(name) {
  const keys = KEYS[name] = await K.makeKeys();
  const ctx = await (await K.hubBrowser()).newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/London', userAgent: ANDROID });
  await ctx.grantPermissions(['notifications'], { origin: CHAT });
  await ctx.addInitScript(({ endpoint, p256dh, auth }) => {
    const make = (key) => ({ endpoint, options: { applicationServerKey: key }, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
    const toB = (u8) => btoa(String.fromCharCode(...u8)), fromB = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    PushManager.prototype.getSubscription = async function () { const k = localStorage.getItem('fakesub'); return k ? make(fromB(k)) : null; };
    PushManager.prototype.subscribe = async function (o) { const k = new Uint8Array(o.applicationServerKey.buffer || o.applicationServerKey); localStorage.setItem('fakesub', toB(k)); return make(k.buffer); };
  }, { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-device`, p256dh: b64u(keys.pub), auth: b64u(keys.auth) });
  await record(ctx, name);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e}`));
  await p.goto(CHAT + '/');
  return { p, ctx, name };
}
// Chat's session where a page is (IndexedDB inflight, at that page's origin), never making the database where there's none
const sessAt = (page) => page.evaluate(() => new Promise((res) => {
  try {
    const r = indexedDB.open('inflight');
    r.onupgradeneeded = () => { r.transaction.abort(); res(null); };
    r.onerror = () => res(null);
    r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result?.token ? { token: g.result.token, id: g.result.me?.id } : null); g.onerror = () => res(null); } catch (_) { res(null); } };
  } catch (_) { res(null); }
})).catch(() => null);
const sentBy = (id) => Number(rows(`SELECT COUNT(*) AS n FROM pg_msgs WHERE sender = '${id}'`)[0]?.n || 0);
async function write(ph, to, text) {
  const n0 = sentBy(ph.id);
  await K.openChat(ph, to);
  await ph.p.fill('#msg', text); await ph.p.click('.send');
  await until(async () => sentBy(ph.id) > n0, 15000);
  return rows(`SELECT id, deliver_at FROM pg_msgs WHERE sender = '${ph.id}' AND recipient = '${to}' ORDER BY sent_at DESC LIMIT 1`)[0] || {};
}

// George at the hub: an iPhone with InFlite on its Home Screen, as lib.mjs hubPhone makes one (standalone, its window.open
// noted, push with keys this test holds, the hub's address mapped to its Worker), but kept as one browser profile on disk
// and opened again in each moment's zone (georgeIn): the same phone, its clock moved. One window throughout: any page
// opened beside the first in any of them is counted (G.extra)
const gKeys = KEYS.george = await K.makeKeys();
const PROFILE = `${S}/george-profile`;
const SECURE = ['', 'auth.', 'account.', 'chat.', 'email.', 'weather.', 'fitness.', 'finance.'].map((h) => `http://${h}ifl.test:8788`).join(',');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const G = { name: 'george', p: null, ctx: null, pages: [], tz: null, extra: 0, id: null };
const navs = [];
async function georgeIn(tz) {
  if (G.tz === tz && G.ctx) return;
  if (G.ctx) await G.ctx.close().catch(() => {});
  const ctx = await chromium.launchPersistentContext(PROFILE, { executablePath: process.env.CHROMIUM || undefined,
    args: ['--host-resolver-rules=MAP ifl.test:8788 127.0.0.1:8787, MAP email.ifl.test:8788 127.0.0.1:8806, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1, MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1',
      `--unsafely-treat-insecure-origin-as-secure=${SECURE}`],
    viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: tz, locale: 'en-GB', serviceWorkers: 'allow', userAgent: IPHONE });
  await ctx.grantPermissions(['notifications'], { origin: HUB });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } : mm(q));
    window.__opened = []; const open = window.open;
    window.open = function (...a) { window.__opened.push(String(a[0] ?? '')); return open.apply(window, a); };
    // (as mapopen.mjs does for every other context: no passkey offered in the keyboard)
    const P = window.PublicKeyCredential, can = P?.isConditionalMediationAvailable?.bind(P);
    if (can) P.isConditionalMediationAvailable = async () => !!window.__autofill && can();
  });
  await ctx.addInitScript(({ endpoint, p256dh, auth }) => {
    const make = (key) => ({ endpoint, options: { applicationServerKey: key }, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
    const toB = (u8) => btoa(String.fromCharCode(...u8)), fromB = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    PushManager.prototype.getSubscription = async function () { const k = localStorage.getItem('fakesub'); return k ? make(fromB(k)) : null; };
    PushManager.prototype.subscribe = async function (o) { const k = new Uint8Array(o.applicationServerKey.buffer || o.applicationServerKey); localStorage.setItem('fakesub', toB(k)); return make(k.buffer); };
  }, { endpoint: 'https://fcm.googleapis.com/fcm/send/george-device', p256dh: b64u(gKeys.pub), auth: b64u(gKeys.auth) });
  await record(ctx, 'george');
  const p = ctx.pages()[0] || await ctx.newPage(), pages = [p];
  ctx.on('page', (pg) => { if (!pages.includes(pg)) { pages.push(pg); G.extra++; } });
  p.on('pageerror', (e) => errs.push(`george: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`george: ${m.text()}`); });
  p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
  Object.assign(G, { ctx, p, pages, tz });
  await p.goto(HUB + '/');
}
await georgeIn(zoneAt(7));
// (a request from George's page as the page itself makes it: same origin, the cookie, X-Inflite on Today's writes)
const hubCall = (method, path, body) => G.p.evaluate(async ({ method, path, body }) => {
  const h = { Accept: 'application/json' };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (method !== 'GET' && !/^\/api\/(pigeon|weather|fitness|markets)\//.test(path)) h['X-Inflite'] = '1';
  try {
    const r = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { s: r.status, j };
  } catch (e) { return { s: 0, j: { error: String(e) } }; }
}, { method, path, body });
const textOf = (sel) => G.p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const toastSaid = (re, ms = 8000) => until(() => G.p.evaluate((src) => [...document.querySelectorAll('.ifl-toast, .toast')].map((t) => t.innerText.replace(/\s+/g, ' ')).find((t) => new RegExp(src).test(t)) || null, re.source), ms);
const engine = () => G.p.evaluate(() => { try { return document.querySelector('iframe[name=ifl-chat]')?.contentWindow?.IFLChat?.state || null; } catch (_) { return null; } }).catch(() => null);
// Today, opened (or opened again): its day drawn for the phase wanted
async function today(phase, hash = '') {
  await G.p.goto(HUB + '/' + hash, { waitUntil: 'load' });
  const drawn = await G.p.waitForSelector(`#today[data-phase="${phase}"] #top .day-top`, { timeout: 30000 }).then(() => true, () => false);
  if (!drawn) console.log('DEBUG today', phase, await G.p.evaluate(() => ({ phase: document.querySelector('#today')?.dataset.phase, top: document.querySelector('#top')?.innerText.slice(0, 300), out: !document.querySelector('#out')?.hidden })));
  return drawn;
}
const topText = () => textOf('#top .day-top');

// ======================================================================================================================
// Setting up: George's account (made on the account's page) and Chats at the hub signed in by the one trip; Pat, Mira
// and Leo on Chat's own address; friends; George's apps (a Weather place, Tesco with a 3% alert, Fitness's days); every
// app's notifications on George's phone, from his taps in You
// ======================================================================================================================
step(0, 'George at the hub, his friends on Chat', '§11.1, §11.3, §14.5');
await makeAccount(G.p, `${ACCT}/`, { name: 'George Farrow', handle: 'george', email: 'george@example.com' });
// Chats signed in by the one trip, Chat first (§11.1): /chats/#signin-start&then=/ goes to the account's page and back,
// and Chat's key is kept at the hub's own address (a Chat from before the hub has its welcome's Sign In instead)
async function chatsSignIn() {
  await G.p.goto(`${HUB}/chats/#signin-start&then=/`);
  const first = await Promise.race([
    G.p.waitForURL((u) => /^(account|auth)\./.test(u.hostname), { timeout: 30000 }).then(() => 'account'),
    G.p.waitForSelector('.welcome [data-act=acctsignin]', { state: 'visible', timeout: 30000 }).then(() => 'welcome'),
  ]).catch(() => null);
  if (first === 'welcome') await G.p.click('.welcome [data-act=acctsignin]');
  await onAccountPage(G.p, { email: 'george@example.com' }).catch((e) => console.log('DEBUG sign-in', e.message));
  await G.p.waitForURL((u) => u.host === 'ifl.test:8788', { timeout: 60000 }).catch(() => {});
  // (Chat's first sign-in here may ask where you are and offer a passkey: answered as joinChat does)
  if (await G.p.waitForSelector('#city, [data-act=onbdone]', { state: 'attached', timeout: 6000 }).catch(() => null)) {
    if (await G.p.$('#city')) await G.p.selectOption('#city', 'London').catch(() => {});
    await G.p.click('[data-act=onbdone]', { timeout: 10000 }).catch(() => {});
  }
  const got = await until(() => sessAt(G.p), 30000);
  // (wherever a sign-in that couldn't finish left the window, back at the hub for what follows)
  if (!got && new URL(G.p.url()).host !== 'ifl.test:8788') await G.p.goto(`${HUB}/`).catch(() => {});
  return got;
}
// (where Chats couldn't be signed in at the hub, and that's failed already: Chat's own sign-in for its API, handed back by
// the account from this phone's cookie as hubserve.mjs does, so the steps after it still run and say what they find)
async function bearerFromCookie() {
  const jar = (await G.ctx.cookies()).find((c) => c.name === 'account' || c.name === '__Secure-account');
  if (!jar) return null;
  const word = randomBytes(32).toString('base64url');
  const code = await hostCall('auth.ifl.test', '/api/account/handback', { app: 'inflight', ask: createHash('sha256').update(word).digest('base64url'), box: 'x'.repeat(48) }, { cookie: `${jar.name}=${jar.value}` });
  const r = code.s === 200 ? await hostCall('chat.ifl.test', '/api/pigeon/handback', { code: code.j.code, verifier: word }) : null;
  console.log('(Chats not signed in at the hub: Chat’s API from here with a sign-in the account handed back from the cookie)', code.s, r?.s);
  return r?.j?.token ? { token: r.j.token, id: r.j.me?.id } : null;
}
let gs = await chatsSignIn();
ok(!!gs?.token && new URL(G.p.url()).host === 'ifl.test:8788', 'George: Chats signed in at the hub by the one trip, Chat’s key kept at the hub’s address', G.p.url());
if (!gs?.token) gs = await bearerFromCookie();
const GID = gs?.id || rows("SELECT id FROM pg_users WHERE handle = 'george'")[0]?.id;
G.id = GID;
const [P, M, L] = await Promise.all(['pat', 'mira', 'leo'].map((n) => chatPhone(n)));
await Promise.all([[P, 'Pat Reed', 'pat', 'London'], [M, 'Mira Okafor', 'mira', 'Norwich'], [L, 'Leo Marsh', 'leo', 'London']].map(([ph, name, handle, city]) => joinChat(ph.p, CHAT + '/', { name, handle, email: `${handle}@example.com`, city })));
for (const ph of [P, M, L]) { const s = await sessAt(ph.p); ph.token = s?.token; ph.id = s?.id; }
ok(!!(P.id && M.id && L.id), 'Pat, Mira and Leo: Chat on its own address, as they always had it', JSON.stringify([P.id, M.id, L.id]));
for (const ph of [P, M, L]) {
  await api(gs.token, 'friends', { handle: ph.name });
  await api(ph.token, 'friends-respond', { id: GID, accept: true });
}
ok(rows(`SELECT COUNT(*) AS n FROM pg_links WHERE status = 'ok' AND (a = '${GID}' OR b = '${GID}')`)[0]?.n === 3, 'George is friends with all three');
for (const ph of [P, M, L]) await ph.p.reload().catch(() => {});

// George's apps, each through its own route at the hub (spoken for as the app by the Worker)
const CELLS = [[51.45, -0.15], [51.5, -0.15], [51.55, -0.15], [51.6, -0.15], [51.4, -0.15], [51.65, -0.1]];
// (set up at a cell of its own: the moments' cells are 0 to 3, each asked for first in its own moment)
const HOME = { name: 'London', lat: CELLS[5][0], lon: CELLS[5][1] };
let r = await hubCall('GET', '/api/weather/me');
r = await hubCall('PUT', '/api/weather/me', { base: r.j?.ver || 0, data: { places: [HOME], settings: {}, notify: { places: [{ ...HOME, rain: true, warn: true }], brief: null, briefAt: '07:00' } } });
ok(r.s === 200, 'George’s Weather: London, its rain and warnings wanted (Weather’s own route, at /api/weather/)', `${r.s} ${js(r.j, 120)}`);
for (const h of [{ symbol: 'TSCO.L', qty: 120 }, { symbol: 'RR.L', qty: 80 }]) {
  r = await hubCall('PUT', '/api/markets/holding', h);
  if (r.s !== 200) ok(false, `Markets: ${h.symbol} held`, `${r.s} ${js(r.j, 120)}`);
}
r = await hubCall('PUT', '/api/markets/alert', { symbol: 'TSCO.L', on: true, pct: 3 });
ok(r.s === 200 && rows(`SELECT pct FROM mk_alerts WHERE user_id = '${GID}' AND symbol = 'TSCO.L'`)[0]?.pct === 3, 'Markets: Tesco held, with an alert at 3% (Markets’ own routes)', `${r.s}`);
// (Fitness's tables made as Fitness makes them, by asking it; the ride times' as B0's module makes them, for the one
// place below that puts a row in by hand where Ride At's route isn't there)
r = await hubCall('GET', '/api/fitness/me');
ok(r.s === 200, 'Fitness at the hub knows George (GET /api/fitness/me)', `${r.s}`);
run(`CREATE TABLE IF NOT EXISTS fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day))`);

// Every app's notifications here, from his taps in You (§10, §11.3): This Phone on (Today's morning), then Get Every
// App's Notifications Here
await G.p.goto(`${HUB}/#you`);
await G.p.waitForSelector('#you #youPhone', { timeout: 30000 }).catch(() => {});
await G.p.click('#you #youPhoneRow').catch(() => G.p.click('#you #youPhone').catch(() => {}));
const tdPush = await until(() => rows(`SELECT endpoint FROM td_push WHERE user_id = '${GID}' AND endpoint LIKE '%/george-device'`)[0], 15000);
ok(!!tdPush, 'This Phone on: Today’s morning to this phone (td_push)');
await G.p.waitForSelector('#you #youEvery', { timeout: 15000 }).catch(() => {});
await G.p.click('#you #youEvery').catch(() => {});
await G.p.waitForSelector('#sh-every #evGo', { state: 'visible', timeout: 10000 }).catch(() => {});
await G.p.click('#sh-every #evGo').catch(() => {});
// (each row the device route made, via the hub: never one an app made of its own accord)
const fanned = await until(() => rows(`SELECT endpoint FROM pg_push WHERE user_id = '${GID}' AND endpoint LIKE '%/george-device' AND via = 'hub'`)[0], 15000);
const wxDev = rows(`SELECT d.dev FROM wx_devs d JOIN wx_subs s ON s.dev = d.dev WHERE d.endpoint LIKE '%/george-device' AND d.via = 'hub' AND s.warn = 1`)[0];
const mkDev = rows(`SELECT endpoint FROM mk_push WHERE endpoint LIKE '%/george-device' AND via = 'hub'`)[0];
ok(!!fanned && !!wxDev && !!mkDev, 'Get Every App’s Notifications Here: Chats, Markets and Weather (its warnings) to this phone too, via the hub', js({ fanned, wxDev, mkDev }));
await shot(G, '0-you');

// Pick a moment's hour: the account's zone (Today's morning and its notifications), Weather's cell, Fitness's days, the
// stand-in's clock; and the day's plan made already unless the moment is the morning's (§7.5: once a day)
const SESSION = { state: 'session', id: 'rh:endurance:75', sport: 'ride', name: 'Endurance 75', kind: 'Endurance', secs: 4500, tss: 62, hard: false, why: 'An easy aerobic ride.', steps: [[4500, 0.65, 0.7]] };
let Z = null;
// (morningAt: minutes after midnight there, or 'now': the morning due at this minute, to the five)
async function moment(hh, cell, { morningAt = 420, planned = true, quiet = false, rest = null } = {}) {
  const tz = zoneAt(hh);
  await georgeIn(tz);
  // (a page of the hub's that isn't Today, while the moment's rows go in: Today open would read, and plan, the day first)
  await G.p.goto(`${HUB}/robots.txt`);
  const t = Date.now(), D = dayIn(tz, t);
  WX.tz = tz;
  Z = { tz, D, t, hh };
  console.log(`zone ${tz}: ${D} ${hm(tz, t)} there`);
  const mAt = morningAt === 'now' ? Math.floor(minsIn(tz, t) / 5) * 5 : morningAt;
  const m = await hubCall('PUT', '/api/morning', { on: true, at: mAt, tz, lines: { weather: true, fitness: true, chat: true, markets: true } });
  const q = await hubCall('PATCH', '/api/notify', { quiet: { on: quiet, from: 21, to: 6, tz } });
  if (m.s !== 200 || q.s !== 200) ok(false, `the account’s zone set to ${tz}`, `${m.s} ${q.s} ${js(q.j, 160)}`);
  const kept = rows(`SELECT data FROM wx_accts WHERE user_id = '${GID}'`)[0];
  const data = kept ? JSON.parse(kept.data) : { settings: {}, notify: { places: [], brief: null, briefAt: '07:00' } };
  data.places = [{ name: 'London', lat: CELLS[cell][0], lon: CELLS[cell][1] }];
  run(`UPDATE wx_accts SET data = '${esc(JSON.stringify(data))}', ver = ver + 1 WHERE user_id = '${GID}'`);
  const days = { [D]: SESSION, [dayAfter(D, 1)]: { state: 'none' }, [dayAfter(D, 2)]: { state: rest === 2 ? 'rest' : 'none', why: '' }, [dayAfter(D, 3)]: { state: 'none' } };
  const f = await hubCall('POST', '/api/fitness/today', { tz, units: 'metric', days });
  if (f.s !== 200) ok(false, 'Fitness’s days sent, as Fitness sends them', `${f.s} ${js(f.j, 120)}`);
  if (planned) run(`INSERT OR IGNORE INTO td_plans (user_id, day, at) VALUES ('${GID}', '${D}', ${t})`);
  return Z;
}
// Ride At, as Fitness's own button sends it (§6.2: PUT /api/fitness/time through the hub); the row put in by hand only
// where the route isn't there, so the moments after still run (and the test has failed already)
async function rideAt(start, stop, why) {
  const body = { day: dayIn(Z.tz, start), start, stop, tz: Z.tz };
  const a = await hubCall('PUT', '/api/fitness/time', body);
  ok(a.s === 200 && a.j?.time?.start === start && a.j.time.source === 'set', `Ride At ${hm(Z.tz, start)}–${hm(Z.tz, stop)}: ${why} (fx_times, source set)`, `${a.s} ${js(a.j, 160)}`);
  if (a.s !== 200) run(`INSERT OR REPLACE INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES ('${GID}', '${body.day}', ${start}, ${stop}, '${Z.tz}', 'ride', 'set', ${Date.now()})`);
}
// A call with Mira agreed in Chat (§8.4): George's Chat sends the invite with his own pending row, Mira's Yes turns it
// yes on the server, his phone shut (POST time-offer, as Chat's client sends it; chats.mjs drives the invite itself)
async function callWithMira(start, mins = 30) {
  run(`DELETE FROM td_times WHERE user_id IN ('${GID}', '${M.id}')`);
  const id = crypto.randomUUID();
  const [a] = await api(gs.token, 'time-offer', { id, kind: 'call', start, stop: start + mins * MIN, tz: Z.tz, with: M.id, role: 'asked', state: 'pending' });
  const [y] = await api(M.token, 'time-offer', { id, kind: 'call', start, stop: start + mins * MIN, tz: Z.tz, with: GID, role: 'answered' });
  const row = rows(`SELECT state, start, who FROM td_times WHERE user_id = '${GID}' AND id = '${id}'`)[0];
  ok(a === 200 && y === 200 && row?.state === 'yes' && row.start === start, `a call with Mira at ${hm(Z.tz, start)}, agreed in Chat (td_times yes)`, `${a} ${y} ${JSON.stringify(row)}`);
  return id;
}

// ======================================================================================================================
// (1) morning, 07:00: the plan joined up, a clash fixed with Undo, a habit ride added with Undo, the morning push
// ======================================================================================================================
step(1, 'morning: the plan joined up, the clash moved and the habit ride added, each with Undo; the morning push', '§4.1, §7.3, §7.5, §14.3');
{
  const t0 = Date.now();
  const { tz, D } = await moment(7, 0, { morningAt: 'now', planned: false, rest: 2 });
  // (today not planned yet, whatever opening You did meanwhile; and Today 1.09 on George's phone since yesterday, which
  // planned that day: the morning acts only for an account whose Today has planned a day itself, T2's hasPlanned)
  run(`DELETE FROM td_plans WHERE user_id = '${GID}'`); run(`DELETE FROM td_acts WHERE user_id = '${GID}'`);
  run(`DELETE FROM fx_offers WHERE user_id = '${GID}' AND role = 'today'`); run(`DELETE FROM fx_times WHERE user_id = '${GID}'`);
  run(`INSERT INTO td_plans (user_id, day, at) VALUES ('${GID}', '${dayAfter(D, -1)}', ${t0 - DAY})`);
  // the habit: rides on the weekday two days on, at 10:00 there, in six of the last eight weeks (outdoors, from his watch
  // into Fitness), and that day a rest day in Fitness's plan
  const TARGET = dayAfter(D, 2), WD = WEEKDAYS[weekday(TARGET)];
  const weeks = Array.from({ length: 8 }, (_, i) => dayAfter(TARGET, -7 * (i + 1))).filter((_, i) => i !== 2 && i !== 5);
  run(weeks.map((d, i) => `INSERT OR REPLACE INTO fx_acts (user_id, id, start, sport, indoor, name, type, size, sum, added) VALUES ('${GID}', 'habit-${i}', ${wall(tz, d, 10)}, 'ride', 0, '${WD} ride', 'fit', 1, '${esc(JSON.stringify({ secs: 6300, dist: 41000, tss: 74 }))}', ${t0})`).join('; '));
  // the ride at 18:00 for 1:15 (Ride At), and Mira's call at 18:30, agreed in Chat: a clash
  const RIDE = { start: wall(tz, D, 18), stop: wall(tz, D, 19, 15) };
  await rideAt(RIDE.start, RIDE.stop, 'the evening’s ride');
  const CALL = wall(tz, D, 18, 30);
  await callWithMira(CALL);
  // the morning's turn: the day planned first (planDay), then the push composed and sent (§7.5)
  const since = Date.now();
  const tick = await todayTick();
  ok(tick.s === 200 && tick.j.sent >= 1, 'the scheduler’s morning: George’s day planned and his morning sent', `${tick.s} ${JSON.stringify(tick.j)}`);
  const acts = rows(`SELECT id, rule, state, level, said, now, was FROM td_acts WHERE user_id = '${GID}' ORDER BY made`).map((a) => ({ ...a, now: JSON.parse(a.now || 'null'), was: JSON.parse(a.was || 'null') }));
  const mv = acts.find((a) => a.rule === 'moveRide'), add = acts.find((a) => a.rule === 'addRide');
  const moved = rows(`SELECT start, stop, source FROM fx_times WHERE user_id = '${GID}' AND day = '${D}'`)[0];
  ok(mv?.state === 'done' && mv.level === 'do' && moved?.source === 'moved' && moved.stop - moved.start === RIDE.stop - RIDE.start && (moved.stop + 15 * MIN <= CALL || moved.start >= CALL + 45 * MIN),
    `the clash moved at do: the ride now ${moved ? hm(tz, moved.start) : '?'}, as long, clear of the call (fx_times source moved, a td_acts row)`, JSON.stringify({ mv, moved }));
  const NEW = moved ? hm(tz, moved.start) : '??:??';
  ok(new RegExp(`^Moved your ride to ${NEW}, clear of Mira[’']s call`).test(mv?.said || ''), `“Moved your ride to ${NEW}, clear of Mira’s call”`, mv?.said);
  const offer = add ? rows(`SELECT id, role, state, taken, start, stop FROM fx_offers WHERE user_id = '${GID}' AND id = '${esc(add.now?.offer || '')}'`)[0] : null;
  ok(add?.state === 'done' && offer?.role === 'today' && offer.state === 'yes' && offer.taken === 0 && offer.start === wall(tz, TARGET, 10), `the habit ride added at do: ${WD} 10:00 (fx_offers role today, yes, taken 0)`, JSON.stringify({ add, offer }));
  ok(new RegExp(`^Added: a ride on ${WD} at 10:00 · Six of the last eight dry ${WD}s\\. ${WD}[’']s dry`).test(add?.said || ''), `“Added: a ride on ${WD} at 10:00 · Six of the last eight dry ${WD}s. ${WD}’s dry”`, add?.said);
  // the morning push: the act in its Fitness line, no name (Chat's Names on the Lock Screen is off)
  const morning = (await pushesSince('george', since)).find((x) => x.app === 'today');
  ok(!!morning && morning.body?.includes(`Moved your ride to ${NEW} to clear your 18:30 call. Undo on Today.`), 'the morning push says the act in its Fitness line', js(morning, 300));
  ok(!!morning && !/Mira/.test(JSON.stringify(morning)), 'and names no one: Names on the Lock Screen is off');

  // Today, at the morning: the plan joined up
  ok(await today('morning'), 'Today opens on the morning (phaseOf: morning)');
  const top = await topText();
  ok(new RegExp(`Today: rain from 15:00[^.]*your ride at ${NEW} before Mira[’']s call at 18:30\\.`).test(top), `the top card: “Today: rain from 15:00, your ride at ${NEW} before Mira’s call at 18:30.”`, top);
  ok(top.includes(`Moved your ride to ${NEW}, clear of Mira`) && !!(await G.p.$(`#top [data-do=undo][data-id="${mv?.id}"]`)), 'the move said, with Undo', top);
  ok(new RegExp(`Added: a ride on ${WD} at 10:00`).test(top) && !!(await G.p.$(`#top [data-do=undo][data-id="${add?.id}"]`)), 'the habit ride said, with Undo');
  const coming = await textOf('#coming');
  ok(/15:00[^]*Rain[^]*heaviest[^]*17:00/i.test(coming), 'Coming Up: the rain at 15:00, with its heaviest hour', coming);
  ok(new RegExp(`${NEW}[^]*Ride`).test(coming) && /18:30[^]*Mira/.test(coming) && /habit/i.test(coming), 'Coming Up: the ride, Mira’s call and Thursday’s ride from habit', coming);
  ok(await G.p.locator('#coming .dc-row').count() >= 4, 'Coming Up: rain, the markets’ close, the ride, the call and the habit ride', String(await G.p.locator('#coming .dc-row').count()));
  await shot(G, '1-morning');

  // Undo the move: 18:00 back, and the rule drops to suggest (§7.5)
  await G.p.click(`#top [data-do=undo][data-id="${mv?.id}"]`).catch(() => {});
  const said1 = await toastSaid(/Undone/);
  const back = await until(() => { const x = rows(`SELECT start, source FROM fx_times WHERE user_id = '${GID}' AND day = '${D}'`)[0]; return x?.start === RIDE.start ? x : null; }, 10000);
  ok(!!back && back.source === 'set' && rows(`SELECT state FROM td_acts WHERE id = '${mv?.id}'`)[0]?.state === 'undone', 'Undo: the ride back at 18:00, the act undone', JSON.stringify(back));
  ok(/Undone\. Moves are suggested now, not made/.test(said1 || ''), '“Undone. Moves are suggested now, not made”', said1);
  // Undo the habit ride: the offer no, the toast, and Today hides the ride at once
  await G.p.click(`#top [data-do=undo][data-id="${add?.id}"]`).catch(() => {});
  const said2 = await toastSaid(/Rides are suggested now/);
  ok(/Undone\. Rides are suggested now, not added/.test(said2 || ''), '“Undone. Rides are suggested now, not added”', said2);
  ok(await until(() => rows(`SELECT state FROM fx_offers WHERE id = '${esc(offer?.id || '')}'`)[0]?.state === 'no', 8000), 'the habit ride’s offer set to no');
  const hidden = await until(async () => { const c = await textOf('#coming'), tp = await topText(); return !/habit/i.test(c) && !/Added: a ride/.test(tp) ? c : null; }, 10000);
  ok(!!add && !!hidden, 'and Today hides it at once (Coming Up, the top card)', await textOf('#coming'));
  await shot(G, '1-morning-undone');
  // the rule at suggest, in You (and as You's own route says it)
  const rules = await hubCall('GET', '/api/rules');
  ok(rules.j?.rules?.find((x) => x.rule === 'moveRide')?.level === 'suggest' && rules.j.rules.find((x) => x.rule === 'addRide')?.level === 'suggest', 'You’s rules: moving a ride and adding one each at Suggest now', JSON.stringify(rules.j?.rules?.map((x) => [x.rule, x.level])));
  await G.p.goto(`${HUB}/#you`);
  const pressed = await G.p.waitForSelector('#youRules [data-rule="moveRide"] [data-level="suggest"][aria-pressed="true"]', { timeout: 15000 }).then(() => true, () => false);
  ok(pressed, 'and in You: Moving a Ride shows Suggest');
  await shot(G, '1-you-rules');
}

// ======================================================================================================================
// (2) midday, 12:30: the weather you'll ride in, and who's waiting (her name from the server, her words from the engine)
// ======================================================================================================================
step(2, 'midday: the weather you’ll ride in; Pat waiting, her words from Chat’s engine on the phone alone', '§4.1, §7.3, §7.4, §14.3');
let PAT_AT = 0;
{
  const { tz, D } = await moment(12, 1);
  await rideAt(wall(tz, D, 16, 45), wall(tz, D, 18), 'the afternoon’s ride');
  await callWithMira(wall(tz, D, 18, 30));
  // Leo agrees a ride on Thursday with George in Chat (an agreed plan, still new: Riding with you Thursday, §5.2)
  const THU = dayAfter(D, 3), inv = crypto.randomUUID(), plan = { tz, sport: 'ride', wid: 'free-ride', name: 'Ride how you like', secs: 7200, far: false, dry: true };
  run(`DELETE FROM fx_offers WHERE user_id IN ('${GID}', '${L.id}') AND role IN ('asked', 'answered')`);
  const [a1] = await api(gs.token, 'fit-offer', { ...plan, id: inv, start: wall(tz, THU, 10), stop: wall(tz, THU, 12), who: 'Leo', role: 'asked', with: L.id, state: 'pending' });
  const [a2] = await api(L.token, 'fit-offer', { ...plan, id: crypto.randomUUID(), start: wall(tz, THU, 10), stop: wall(tz, THU, 12), who: 'George', role: 'answered', with: GID, re: inv });
  const lo = rows(`SELECT state, with_id FROM fx_offers WHERE user_id = '${GID}' AND id = '${inv}'`)[0];
  ok(a1 === 200 && a2 === 200 && lo?.state === 'new' && lo.with_id === L.id, `Leo agrees a ride on ${WEEKDAYS[weekday(THU)]} in Chat: George’s row new, with Leo’s id`, `${a1} ${a2} ${JSON.stringify(lo)}`);
  // Pat writes twice, from her phone
  await write(P, GID, SAID.pat1);
  const m2 = await write(P, GID, SAID.pat2);
  PAT_AT = m2.deliver_at;
  ok(!!m2.id, 'Pat writes twice: “Did you see Tesco this week?”, then “Dinner Friday?”');

  ok(await today('midday'), 'Today at midday (phaseOf: midday)');
  const top = await topText();
  ok(/14°/.test(top) && /Dry until 15:00/.test(top), 'the top card: “14° · Dry until 15:00”', top);
  ok(/heaviest at 17:00/.test(top), '“then rain, heaviest at 17:00”', top);
  ok(/Your ride at 16:45 (catches|is) /.test(top), '“your ride at 16:45 catches …” (hoursAt across the ride, isWet)', top);
  // Waiting for You: Pat's name and the time from the server; her words from the engine, faded in a moment later
  const row = `#waiting .dw-row[data-wid="${P.id}"]`;
  ok(await G.p.waitForSelector(row, { timeout: 10000 }).then(() => true, () => false) && /Pat/.test(await textOf(row)), 'Waiting for You: Pat, named by the server', await textOf('#waiting'));
  ok(await until(async () => (await engine()) === 'ready', 30000), 'Chat’s engine ready on Today (iframe ifl-chat, IFLChat.state ready)', String(await engine()));
  const words = await until(async () => { const w = await textOf(`${row} .dw-words`); return /Dinner Friday\?/.test(w) ? w : null; }, 20000);
  ok(!!words, 'her words beside her name, from the engine on this phone', words || await textOf(row));
  const chip = await until(async () => { const c = await textOf(`${row} .dw-chips`); return /Tesco/.test(c) ? c : null; }, 8000);
  ok(!!chip, 'and a Tesco chip, from the first of her two messages (digest topics)', chip || await textOf(row));
  await shot(G, '2-midday');
  // neither message's words in any request yet, nor in Today's storage (§7.4)
  const leak = REC.filter((x) => [SAID.pat1, SAID.pat2].some((s) => (x.url + (x.body || '')).includes(s) || (x.url + (x.body || '')).includes(encodeURIComponent(s))));
  ok(!leak.length, 'neither of Pat’s messages in any request URL or body from any phone', js(leak.slice(0, 2), 300));
  const stored = await G.p.evaluate(() => JSON.stringify([localStorage, sessionStorage].flatMap((s) => Object.keys(s).filter((k) => /^today/i.test(k)).map((k) => s.getItem(k)))));
  ok(![SAID.pat1, SAID.pat2, 'Tesco this week'].some((s) => stored.includes(s)), 'nor in Today’s storage at the hub (today:*)');
}

// ======================================================================================================================
// (3) send, 12:32: the weather to Pat from Today, in Chat's own sheet over Today; you stay on Today
// ======================================================================================================================
step(3, 'send: the weather to Pat from Today; you stay on Today', '§4.1, §8.2, §8.3, §14.3');
{
  const pages0 = G.pages.length, url0 = G.p.url(), n0 = sentBy(GID);
  await G.p.click('#top .day-top [data-send]', { timeout: 10000 }).catch((e) => console.log('DEBUG send', e.message));
  const sheet = G.p.frameLocator('iframe[name="ifl-chat"]');
  const pick = sheet.locator(`.sheet [data-act=sendpick][data-id="${P.id}"]`);
  ok(await pick.waitFor({ timeout: 10000 }).then(() => true, () => false), 'Send opens Chat’s own sheet, in the engine over Today', G.p.url());
  await pick.click().catch(() => {});
  await sheet.locator('.sheet [data-act=sendgo]').click().catch(() => {});
  const said = await toastSaid(/Sent to Pat/, 20000);
  ok(/Sent to Pat\. You[’']re still here/.test(said || ''), '“Sent to Pat. You’re still here”', said);
  ok(G.p.url() === url0 && G.pages.length === pages0 && new URL(G.p.url()).pathname === '/', 'still on Today: the same page, no new window', `${G.p.url()} ${G.pages.length}`);
  ok(await until(async () => sentBy(GID) > n0, 10000), 'the letter sent, sealed (pg_msgs)');
  await shot(G, '3-sent');
  await K.openChat(P, GID);
  const card = await until(async () => { const c = (await P.p.locator('.msgs .cd-card').last().textContent().catch(() => '')).replace(/\s+/g, ' '); return /When sent/.test(c) && /Now/.test(c) ? c : null; }, 20000);
  ok(!!card, 'live in Pat’s chat: “When sent · …” and “Now · …”', card || await P.p.locator('.msgs').innerText().catch(() => ''));
  await P.p.screenshot({ path: `${out}/3-pat.png` }).catch(() => {});
  // (wherever Send took the window, back to the hub for what follows)
  if (new URL(G.p.url()).origin !== HUB) await G.p.goto(HUB + '/');
}

// ======================================================================================================================
// (4) preride, 16:05: forty minutes before, Today becomes the ride; then riding, notifications held
// ======================================================================================================================
step(4, 'preride: a ride 30 minutes ahead becomes Today; riding: held but for warnings; Chats’ held row', '§4.1, §7.3, §8.7, §14.3');
let RIDE4 = null, MIRA_AT = 0;
{
  const { tz } = await moment(16, 2);
  const start = step5(Date.now() + 30 * MIN), stop = start + 75 * MIN;
  await rideAt(start, stop, 'a ride half an hour from now');
  const CALL = q15(stop + 15 * MIN);
  await callWithMira(CALL);
  ok(await today('preride'), 'Today is the ride now: preride, 40 minutes before (phaseOf: preride)');
  const top = await topText();
  ok(new RegExp(`Endurance 75 at ${hm(tz, start)}`).test(top) && /In \d+ minutes/.test(top), `the ride card: “In … minutes · Endurance 75 at ${hm(tz, start)}”`, top);
  ok(/Time\s*1:15/.test(top) && /Out in\s*11°/.test(top) && /Roads\s*Wet/.test(top), '“Time 1:15 · Out in 11° · Roads Wet”', top);
  ok(/A jacket for the first half hour/.test(top), '“A jacket for the first half hour”', top);
  ok(/Messages are held while you ride, except warnings/.test(top), '“Messages are held while you ride, except warnings”', top);
  ok(new RegExp(`Done before Mira[’']s call at ${hm(tz, CALL)}`).test(top), `“Done before Mira’s call at ${hm(tz, CALL)}”`, top);
  ok(!(await G.p.isVisible('#waiting')) && !(await G.p.isVisible('#rest')), 'nothing beside the ride (no Waiting, no Rest of Today)');
  const radar = await G.p.getAttribute('#top a[data-do=open]:has-text("Radar")', 'href').catch(() => null), sess = await G.p.getAttribute('#top a[data-do=open]:has-text("The Session")', 'href').catch(() => null);
  ok(radar === '/weather/#radar' && sess === '/fitness/#today', 'Radar and The Session, at the hub’s own addresses', `${radar} ${sess}`);
  await shot(G, '4-preride');
  await G.p.click('#top a[data-do=open]:has-text("Radar")').catch(() => {});
  ok(await G.p.waitForURL(`${HUB}/weather/#radar`, { timeout: 15000 }).then(() => true, () => false) && G.pages.length === 1, 'Radar opens in the window: /weather/#radar', G.p.url());
  await G.p.goto(HUB + '/');

  // riding: the ride began a quarter of an hour ago (Ride At moved), so the hold is on (start − 10 min, §8.7)
  // (begun after Pat's messages at midday where it can be, so who wrote while he rode is Mira, as the story has it)
  const s0 = Math.floor((Date.now() - 15 * MIN) / (5 * MIN)) * 5 * MIN, s1 = Math.ceil((PAT_AT + MIN) / (5 * MIN)) * 5 * MIN;
  RIDE4 = { start: s1 <= Date.now() - 2 * MIN ? Math.max(s0, s1) : s0 };
  RIDE4.stop = RIDE4.start + 75 * MIN;
  await rideAt(RIDE4.start, RIDE4.stop, 'the ride under way');
  await callWithMira(q15(RIDE4.stop + 15 * MIN));
  let since = Date.now();
  const mm = await write(M, GID, SAID.mira);
  MIRA_AT = mm.deliver_at;
  await chatTick(); await wait(1500);
  const chat = (await pushesSince('george', since)).filter((x) => x.app === 'chat');
  ok(!!mm.id && !chat.length, 'Mira writes while George rides: no push (held at do)', js(chat, 200));
  // a MeteoAlarm warning passes the hold (Weather's turn once with none, as each new place's first turn learns its clock;
  // then the warning)
  run(`UPDATE wx_subs SET told = '{}', last_rain = ${Date.now()} WHERE dev IN (SELECT dev FROM wx_devs WHERE user_id = '${GID}')`);
  await weatherTick();
  WX.warn = true; since = Date.now();
  const wt = await weatherTick();
  const warned = await until(async () => (await pushesSince('george', since)).find((x) => x.app === 'weather' && /warning/i.test(`${x.title} ${x.body}`)), 10000);
  ok(!!warned, 'a MeteoAlarm warning still gets through, as Weather’s (app: weather)', `${js(wt.j, 160)} ${js(warned, 200)}`);
  WX.warn = false;
  // Chats' held row
  await G.p.goto(`${HUB}/chats/`);
  const held = await until(async () => { const t = (await G.p.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' '); return /Riding · messages held/.test(t) ? t : null; }, 20000);
  ok(!!held, 'Chats: “Riding · messages held”');
  await shot(G, '4-chats-held');
}

// ======================================================================================================================
// (5) after, 18:05: the ride from the watch, honest until Fitness has it; who wrote; held released; Send to Leo
// ======================================================================================================================
step(5, 'after: the honest card from a waiting Garmin row, then Fitness’s figures; Mira’s words; released; Send to Leo', '§4.1, §7.3, §8.7, §14.3, §14.4');
{
  // the ride as it arrives from the watch (a waiting Garmin row with its time and distance, ended 5 minutes ago; after
  // Mira wrote): never fx_acts first (§14.4)
  const end = Math.max(Date.now() - 5 * MIN, MIRA_AT + 30e3);
  if (end > Date.now() - 5e3) await wait(end - Date.now() + 5e3);
  const secs = Math.round((end - RIDE4.start) / 1000), dist = 36049;
  run(`CREATE TABLE IF NOT EXISTS fx_garmin_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, added INTEGER NOT NULL, PRIMARY KEY (user_id, id))`);
  for (const c of ['sport TEXT', 'secs INTEGER', 'dist REAL']) run(`ALTER TABLE fx_garmin_new ADD COLUMN ${c}`, true);
  run(`INSERT OR REPLACE INTO fx_garmin_new (user_id, id, start, name, added, sport, secs, dist) VALUES ('${GID}', 'g-ride-1', ${RIDE4.start}, 'Endurance 75', ${end}, 'ride', ${secs}, ${dist})`);
  ok(!rows(`SELECT id FROM fx_acts WHERE user_id = '${GID}' AND start = ${RIDE4.start}`).length, 'the ride waiting from the watch, not in Fitness yet (fx_garmin_new, not fx_acts)');
  // the held message released, once, "while you rode"
  const since = Date.now();
  await chatTick();
  const freed = await until(async () => (await pushesSince('george', since)).find((x) => x.app === 'chat'), 10000);
  ok(!!freed && /while you rode/.test(freed.body || '') && !(JSON.stringify(freed).includes(SAID.mira)), 'the held message released: “… while you rode”, no words', js(freed, 200));

  ok(await today('after'), 'Today after the ride (phaseOf: after, on arrival)');
  let top = await topText();
  ok(/From your watch/.test(top) && /Stress and fitness once Fitness has it/.test(top) && !/Stress\s*\d/.test(top), 'the honest card: “From your watch”, “Stress and fitness once Fitness has it”, no Stress', top);
  ok(/Time\s*\d+:\d\d/.test(top) && /Distance\s*36\.0 km|Distance\s*22\.4 mi/.test(top), 'Time and Distance, as the watch gave them', top);
  ok(/Mira(?:, \w+)*(?: and \w+)? wrote while you rode/.test(top), '“Mira wrote while you rode” (the server: who)', top);
  const words = await until(async () => { const w = await textOf(`#top .dt-said[data-wid="${M.id}"]`); return w.includes(SAID.mira) ? w : null; }, 20000);
  ok(!!words, 'and her words, from the engine on this phone', words);
  const to = await textOf('#top .dt-to');
  ok(/^Leo · Riding with you (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|today|tomorrow)$/i.test(to), '“Leo · Riding with you <the day you agreed>”', to);
  ok(!!(await G.p.$(`#top [data-do=sendto][data-to="${L.id}"]`)), 'Send to Leo, a button for one tap (sendTo)', await G.p.evaluate(() => document.querySelector('#top .tc-foot')?.innerHTML.slice(0, 300)).catch(() => ''));
  const fit = await G.p.$('#top a[data-do=open]:has-text("Open Fitness")');
  ok(!!fit && (await fit.getAttribute('href')) === '/fitness/#activities', 'Open Fitness, at /fitness/#activities');
  await shot(G, '5-after-honest');
  // Open Fitness, which reads the waiting ride in; the ride in fx_acts as Fitness's import puts it; back on Today
  await fit?.click().catch(() => {});
  ok(await G.p.waitForURL(`${HUB}/fitness/#activities`, { timeout: 15000 }).then(() => true, () => false) && G.pages.length === 1, 'Open Fitness: in the window', G.p.url());
  run(`INSERT OR REPLACE INTO fx_acts (user_id, id, start, sport, indoor, name, type, size, sum, added) VALUES ('${GID}', 'garmin-g-ride-1', ${RIDE4.start}, 'ride', 0, 'Endurance 75', 'fit', 1, '${esc(JSON.stringify({ secs, dist, tss: 68 }))}', ${Date.now()})`);
  await G.p.goBack({ waitUntil: 'load' }).catch(() => {});
  if (new URL(G.p.url()).origin !== HUB || new URL(G.p.url()).pathname !== '/') await G.p.goto(HUB + '/');
  const figures = await until(async () => { const t = await topText(); return /Stress\s*68/.test(t) && /Fitness\s*\d+ ↑/.test(t) ? t : null; }, 20000);
  ok(!!figures, 'back on Today, fetched again: “Stress 68 · Fitness … ↑”', await topText());
  await shot(G, '5-after-figures');
  // Send to Leo, in one tap
  const n0 = sentBy(GID);
  await G.p.click(`#top [data-do=sendto][data-to="${L.id}"]`).catch(() => {});
  const said = await toastSaid(/Sent to Leo/, 20000);
  ok(!!said && G.pages.length === 1 && new URL(G.p.url()).pathname === '/', 'Send to Leo: one tap, sent, still on Today', said);
  ok(await until(async () => sentBy(GID) > n0, 10000), 'the finished ride sent to Leo, sealed');
  await K.openChat(L, GID);
  const card = await until(async () => { const c = (await L.p.locator('.msgs .cd-card').last().textContent().catch(() => '')).replace(/\s+/g, ' '); return /Endurance 75|Done/.test(c) ? c : null; }, 20000);
  ok(!!card, 'live in Leo’s chat: the finished ride', card);
  await L.p.screenshot({ path: `${out}/5-leo.png` }).catch(() => {});
}

// ======================================================================================================================
// (6) evening, 21:00: the day closed, tomorrow's first thing; quiet hours on, a message with no push
// ======================================================================================================================
step(6, 'evening: the day closed, Tesco past its alert, tomorrow first; quiet hours, a message with no push', '§4.1, §7.3, §8.1, §14.3');
{
  await marketsMode({ bump: { 'TSCO.L': 3.4 } });
  const { tz } = await moment(21, 3, { quiet: true });
  const n = await hubCall('GET', '/api/notify');
  ok(n.j?.quiet?.on === true && n.j.quiet.from === 21 && n.j.quiet.to === 6, 'quiet hours on, 21:00 to 06:00 (You’s route)', JSON.stringify(n.j?.quiet));
  ok(await today('evening'), 'Today in the evening (phaseOf: evening)');
  const top = await topText();
  ok(/The day closed/.test(top), 'the day closed', top);
  ok(/Tesco[^,]* finished \+3\.4%, past your 3% alert/.test(top), '“Tesco finished +3.4%, past your 3% alert”', top);
  ok(/Tomorrow first: .+ at 07:00/.test(top), '“Tomorrow first: … at 07:00”', top);
  ok(/Quiet hours until 06:00/.test(top), '“Quiet hours until 06:00”', top);
  await shot(G, '6-evening');
  const since = Date.now();
  await write(P, GID, SAID.night);
  await chatTick(); await wait(1500);
  const chat = (await pushesSince('george', since)).filter((x) => x.app === 'chat');
  ok(!chat.length, 'Pat writes at 21:00: no push (quiet hours)', js(chat, 200));
  await G.p.goto(`${HUB}/chats/`);
  const held = await until(async () => { const t = (await G.p.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' '); return /Quiet hours until 06:00 · Warnings still get through/.test(t) ? t : null; }, 20000);
  ok(!!held, 'Chats: “Quiet hours until 06:00 · Warnings still get through”');
  await shot(G, '6-chats-quiet');
}

// ======================================================================================================================
// What never left the phones: none of the words typed in any request, any push, or Today's storage (§3.7, §7.4)
// ======================================================================================================================
step(7, 'the words typed, nowhere but sealed', '§3.7, §7.4, §14.3');
{
  const all = Object.values(SAID), enc = (s) => [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)];
  const inRec = REC.filter((x) => all.some((s) => enc(s).some((e) => x.url.includes(e) || (x.body || '').includes(e))));
  ok(REC.length > 50 && !inRec.length, `none of the words typed in any of the ${REC.length} requests recorded from every frame of every phone (URLs and bodies)`, js(inRec.slice(0, 2), 300));
  const pushes = await opened();
  const inPush = pushes.filter((x) => all.some((s) => JSON.stringify(x).includes(s)));
  ok(pushes.length > 0 && !pushes.some((x) => x.undecrypted) && !inPush.length, `none in any of the ${pushes.length} pushes, each opened with its phone’s keys`, js(inPush.slice(0, 2), 300));
  await G.p.goto(HUB + '/');
  const stored = await G.p.evaluate(() => JSON.stringify([localStorage, sessionStorage].flatMap((s) => Object.keys(s).filter((k) => /^today/i.test(k)).map((k) => [k, s.getItem(k)]))));
  ok(!all.some((s) => stored.includes(s)), 'none in Today’s storage at the hub (today:*)');
  const dbRows = rows(`SELECT ct FROM pg_msgs WHERE sender IN ('${P.id}', '${M.id}') LIMIT 20`);
  ok(dbRows.length >= 4 && !dbRows.some((x) => all.some((s) => String(x.ct).includes(s))), 'and in the database only sealed (pg_msgs.ct)');
  // one window throughout
  ok(!G.extra && G.pages.length === 1 && !(await G.p.evaluate(() => window.__opened?.length || 0)), 'one window throughout: nothing opened beside it, in any moment', `${G.extra} extra`);
  const away = navs.filter((u) => /^https?:/.test(u)).filter((u) => { const h = new URL(u).host; return h !== 'ifl.test:8788' && !/^(auth|account)\.ifl\.test:8788$/.test(h); });
  ok(!away.length, 'every page George saw was the hub’s (or the account’s, signing in)', JSON.stringify(away.slice(0, 3)));
  console.log('weather stand-in asked:', JSON.stringify([...new Set(asked)]));
}

console.log('notes (page errors, for the batches):', JSON.stringify(errs.slice(0, 8)));
// (George's requests, for whoever reads a failure: method, address and the start of each body)
try { writeFileSync(`${out}/requests.jsonl`, REC.filter((x) => x.who === 'george').map((x) => JSON.stringify({ m: x.method, u: x.url, b: (x.body || '').slice(0, 300) })).join('\n') + '\n'); } catch (_) {}
for (const ph of [G, P, M, L]) await ph.ctx.close().catch(() => {});
await (await K.hubBrowser()).close().catch(() => {});
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
