// Fitness (fitness/), at its own address (fitness.<site>), signed in only, with the site's one account: signed out,
// just what it is and Sign in (on the account's page, handed back); signed up to InFlight in a browser, Fitness there is
// signed in already. Files come in (a Wahoo's FIT ride, a GPX, a ZWO workout, a zip as Garmin Connect's "Export
// original" makes it, and one it can't read), and each ride's kept with the account, its file as it came; another device
// signed in has them, each opened from its file, and out again as FIT with every sample. A plan chosen on one device and
// a workout built on the other, each from the same version, are put together. A ride renamed or deleted on one is so on
// the other. The account's page has Fitness among your apps. Signing out goes back to the start, and the API answers
// only signed in, and only at Fitness's own address. Nothing scrolls sideways on a small phone.
// The apps' addresses are stood in for by ifl.test (the home page's by gfg.test) (chat., fitness. and account.), mapped to this machine, so the
// browser shares the sign-in between them as it would between georgefarrowgreen.com's.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFit, writeFit } from '../../fitness/fit.js';
import { zwoFromWorkout, gpxFromActivity, crc32 } from '../../fitness/formats.js';
import { workoutById } from '../../fitness/workouts.js';
import { demo, samples, PROFILE } from '../../fitness/sample.js';
import { joinInFlight, onAccountPage } from './join.mjs';

const [,, S, out] = process.argv;
const CHAT = 'http://chat.ifl.test:8788', FIT = 'http://fitness.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', PW = 'a long test password';
const sql0 = (q) => execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q}"`, { cwd: process.env.APP_ROOT, stdio: 'pipe' }).toString();
const sql = (q) => { for (let i = 0; ; i++) { try { return sql0(q); } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr) + e.message)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
const rows = (q) => { const o = sql(q), m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : []; };
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
// (a step that throws still says what the pages said first)
process.on('uncaughtException', async (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); for (const x of pages) await x.p.screenshot({ path: `${out}/failed-${x.name}.png` }).catch(() => {}), console.log(`${x.name}: ${x.p.url()}`); if (errs.length) console.log('page errors: ' + errs.join(' | ')); console.log(`FAILS ${fails + 1}`); process.exit(0); });

// the files to import: a ride as a Wahoo ELEMNT BOLT writes it, two days ago; the same ride the next day as GPX; a
// workout as Zwift's; and a zip of a ride as Garmin Connect gives it (deflated), three days ago
const D = demo(Date.now()), ride = samples(D.history.find((x) => x.workout === 'endurance-90' && !x.indoor));
const t0 = Math.round(Date.now() / 1000 / 3600) * 3600 - 86400 * 2;
const wahoo = writeFit([['fileId', { type: 4, manufacturer: 32, product: 31, serial: 4242, created: t0 }],
  ['deviceInfo', { timestamp: t0, deviceIndex: 0, manufacturer: 32, product: 31, productName: 'ELEMNT BOLT' }],
  ...ride.s.t.map((t, i) => ['record', { timestamp: t0 + t, lat: ride.s.lat[i], lon: ride.s.lon[i], altitude: ride.s.ele[i], heartRate: ride.s.hr[i], cadence: ride.s.cad[i], distance: ride.s.dist[i], speed: ride.s.spd[i], power: ride.s.pwr[i] }]),
  ['session', { timestamp: t0 + ride.s.t.at(-1), startTime: t0, sport: 2, subSport: 7, elapsed: ride.s.t.at(-1), timer: ride.s.t.at(-1) }]]);
// (a GPX that doesn't say what it was, as some apps write it: worked out from how it went, a ride, then said to be a run)
const gpx = gpxFromActivity({ ...ride, start: (t0 + 86400) * 1000, name: 'Morning ride' }).replace(/<type>[^<]*<\/type>/, '');
const garmin = writeFit([['fileId', { type: 4, manufacturer: 1, product: 3843, serial: 99, created: t0 - 86400 }],
  ...Array.from({ length: 1800 }, (_, i) => ['record', { timestamp: t0 - 86400 + i, heartRate: 130 + (i % 20), power: 180 + (i % 40), cadence: 85 }]),
  ['session', { timestamp: t0 - 86400 + 1799, startTime: t0 - 86400, sport: 2, subSport: 6, elapsed: 1800, timer: 1800 }]]);
const zipOf = (name, data) => {
  const n = Buffer.from(name), packed = deflateRawSync(data), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(packed.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(packed.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + packed.length, 16);
  return Buffer.concat([lh, n, packed, cd, n, end]);
};
const FILES = [
  { name: 'wahoo.fit', mimeType: 'application/octet-stream', buffer: Buffer.from(wahoo) },
  { name: 'ride.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) },
  { name: 'Hills.zwo', mimeType: 'application/xml', buffer: Buffer.from(zwoFromWorkout({ ...workoutById('hill-6x3'), name: 'Hills from Zwift' })) },
  { name: 'activity_123.zip', mimeType: 'application/zip', buffer: zipOf('123_ACTIVITY.fit', Buffer.from(garmin)) },
  { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
];

// Garmin Connect's Personal API, stood in for (GARMIN_API in server.sh): the key swapped for a token, the activities
// listed, and each one's file as a zip of its FIT file. A ride this morning, and the Wahoo's ride again (as the same
// ride, recorded on both, would be): the first kept, the second not twice.
// (the token as Garmin gives it: a JWT, as text, its life in its exp)
const GKEY = 'test-garmin-personal-api-key-0123456789', b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const GTOKEN = `${b64u({ alg: 'RS256' })}.${b64u({ sub: 'me', exp: Math.round(Date.now() / 1000) + 86400 })}.sig`;
const gride = (start, secs) => writeFit([['fileId', { type: 4, manufacturer: 1, product: 3843, serial: 7, created: start }],
  ...Array.from({ length: secs }, (_, i) => ['record', { timestamp: start + i, heartRate: 128 + (i % 15), power: 190 + (i % 30), cadence: 88, speed: 8.5, distance: i * 8.5 }]),
  ['session', { timestamp: start + secs - 1, startTime: start, sport: 2, subSport: 7, elapsed: secs, timer: secs }]]);
const gAt = Math.round(Date.now() / 1000) - 5 * 3600, gTimes = (t) => new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' ');
const GACTS = [{ activityId: 9001, activityName: 'Morning gravel', startTimeGMT: gTimes(gAt), file: zipOf('9001_ACTIVITY.fit', Buffer.from(gride(gAt, 2400))) },
  { activityId: 9002, activityName: 'Cycling', startTimeGMT: gTimes(t0), file: zipOf('9002_ACTIVITY.fit', Buffer.from(wahoo)) }];
const glog = [];
createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), auth = req.headers.authorization || '';
  glog.push(`${req.method} ${u.pathname}`);
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  if (u.pathname === '/personalapitoken-service/personal-api/personal-api-key/token') return req.headers.accept === 'application/json' ? send(406, '') : auth === `ApiKey ${GKEY}` ? send(200, GTOKEN, 'text/plain') : send(401, '');
  if (auth !== `Bearer ${GTOKEN}`) return send(401, {});
  // (between its dates, as Garmin's does: all your history is asked for a window at a time)
  if (u.pathname === '/activitylist-service/activities/search/activities') { const sd = u.searchParams.get('startDate') || '0', ed = u.searchParams.get('endDate') || '9';
    return send(200, Number(u.searchParams.get('start')) ? [] : GACTS.filter((a) => a.startTimeGMT.slice(0, 10) >= sd && a.startTimeGMT.slice(0, 10) <= ed).map(({ file, ...a }) => a)); }
  // (your nights: last night's HRV low against its range, a resting heart rate, seven hours' sleep; each as Garmin's own
  // client has them, a day's figures by its calendarDate)
  const gDay = new Date(Date.now() - 2 * 3600e3).toISOString().slice(0, 10);
  if (u.pathname.startsWith('/hrv-service/hrv/daily/')) return send(200, { hrvSummaries: [{ calendarDate: gDay, lastNightAvg: 41, baseline: { balancedLow: 52, balancedUpper: 70 } }] });
  if (u.pathname === '/sleep-service/sleep/dailySleepSummariesByDate') return send(200, [{ calendarDate: gDay, sleepTimeSeconds: 25200, sleepScores: { overall: { value: 78 } } }]);
  if (u.pathname === '/usersummary-service/v2/dailysummaries') return send(200, [{ calendarDate: gDay, restingHeartRate: 49 }]);
  const m = /^\/download-service\/files\/activity\/(\d+)$/.exec(u.pathname), a = m && GACTS.find((x) => String(x.activityId) === m[1]);
  return a ? send(200, a.file, 'application/zip') : send(404, {});
}).listen(8793, '127.0.0.1');
// Strava, stood in for (STRAVA_API in server.sh): its page to say yes on (straight back, yes), its tokens, the athlete's
// activities (a ride indoors this lunchtime, a run two days ago, one typed in by hand, and an old ride for all your
// history), each one's streams, the webhook's subscription, and disconnecting
const SAT = Math.round(Date.now() / 1000), sIso = (t) => new Date(t * 1000).toISOString().replace('.000Z', 'Z');
const SACTS = [{ id: 7001, name: 'Lunch ride', sport_type: 'VirtualRide', trainer: true, start_date: sIso(SAT - 3 * 3600 - 17 * 60), device_name: 'Zwift', secs: 1800, w: 210 },
  { id: 7002, name: 'Evening run', sport_type: 'Run', start_date: sIso(SAT - 2 * 86400 - 41 * 60), secs: 1500, ll: true },
  { id: 7003, name: 'Typed in', sport_type: 'Ride', manual: true, start_date: sIso(SAT - 3 * 86400) },
  { id: 7005, name: 'Old ride', sport_type: 'Ride', start_date: sIso(SAT - 400 * 86400 - 13 * 60), secs: 1200, w: 170, ll: true, old: true }];
const slog = [];
let sTok = 'sa1';
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), auth = req.headers.authorization || '';
  let body = ''; for await (const c of req) body += c;
  slog.push(`${req.method} ${u.pathname}${u.search}`);
  const send = (code, b, head = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...head }); res.end(b == null ? '' : JSON.stringify(b)); };
  if (u.pathname === '/oauth/authorize') { const back = new URL(u.searchParams.get('redirect_uri')); back.search = new URLSearchParams({ state: u.searchParams.get('state'), code: 'good-code', scope: 'read,activity:read_all' }); return send(302, null, { Location: back.href }); }
  if (u.pathname === '/oauth/token') { const b = JSON.parse(body || '{}'); if (b.client_secret !== 'test-strava-secret-for-local-tests') return send(401, {});
    if (b.grant_type === 'authorization_code' && b.code === 'good-code') return send(200, { access_token: 'sa1', refresh_token: 'sr1', expires_at: SAT + 21600, athlete: { id: 555, firstname: 'Sam', lastname: 'Taylor' } });
    if (b.grant_type === 'refresh_token' && b.refresh_token === 'sr1') { sTok = 'sa2'; return send(200, { access_token: 'sa2', refresh_token: 'sr2', expires_at: Math.round(Date.now() / 1000) + 21600 }); }
    return send(400, {}); }
  if (u.pathname === '/oauth/deauthorize') return send(200, {});
  if (u.pathname === '/api/v3/push_subscriptions') return req.method === 'GET' ? send(200, []) : send(201, { id: 77 });
  if (auth !== `Bearer ${sTok}`) return send(401, {});
  if (u.pathname === '/api/v3/athlete/activities') { const after = Number(u.searchParams.get('after')), before = Number(u.searchParams.get('before'));
    const t = (a) => Date.parse(a.start_date) / 1000;
    return send(200, SACTS.filter((a) => (after ? t(a) > after && !a.old : true) && (before ? t(a) < before : true)).map(({ secs, w, ll, old, ...a }) => a)); }
  const m = /^\/api\/v3\/activities\/(\d+)\/streams$/.exec(u.pathname), a = m && SACTS.find((x) => String(x.id) === m[1]);
  if (!a || a.manual) return send(404, {});
  const n = a.secs, at = (f) => ({ data: Array.from({ length: n }, (_, i) => f(i)) });
  return send(200, { time: at((i) => i), distance: at((i) => i * (a.w ? 9 : 3)), heartrate: at((i) => 130 + (i % 20)), ...(a.w ? { watts: at((i) => a.w + (i % 30)), cadence: at(() => 90) } : {}),
    ...(a.ll ? { latlng: at((i) => [51.4 + i * 1e-4, -2.5 + i * 1e-4]), altitude: at((i) => 30 + (i % 40)) } : {}), velocity_smooth: at(() => (a.w ? 9 : 3)) });
}).listen(8800, '127.0.0.1');
// (a stand-in for Open-Meteo: today's hours, wet till 11, fine after)
const wxlog = [];
createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); wxlog.push(u.pathname + u.search);
  const d0 = Math.floor(Date.now() / 86400e3) * 86400, time = Array.from({ length: 48 }, (_, i) => d0 + i * 3600), hr = (i) => i % 24;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ utc_offset_seconds: 0, hourly: { time, temperature_2m: time.map((_, i) => (hr(i) < 11 ? 8 : 15)), apparent_temperature: time.map((_, i) => (hr(i) < 11 ? 6 : 15)),
    precipitation_probability: time.map((_, i) => (hr(i) < 11 ? 80 : 5)), precipitation: time.map((_, i) => (hr(i) < 11 ? 1.2 : 0)), weather_code: time.map((_, i) => (hr(i) < 11 ? 61 : 2)),
    wind_speed_10m: time.map(() => 11), wind_gusts_10m: time.map(() => 22), wind_direction_10m: time.map(() => 260), is_day: time.map((_, i) => (hr(i) >= 7 && hr(i) < 19 ? 1 : 0)) } }));
}).listen(8794, '127.0.0.1');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${FIT},${ACCT}`] });
// a browser: its own cookies and storage (a laptop, a phone: both, to InFlight, a phone, as it opens only on one)
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const pages = [];
async function browser(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, acceptDownloads: true });
  // (the day's check-in, asked as the app opens, left for the step that tests it: as if already asked today)
  await ctx.addInitScript(() => { try { const d = new Date(); d.setHours(0, 0, 0, 0); localStorage.setItem('fitness:asked', String(d.getTime())); localStorage.setItem('fitness:welcomed', 'true'); } catch (_) {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[13]|Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
  pages.push({ p, name });
  return { ctx, p, name };
}
const settle = (x, ms = 600) => x.p.waitForTimeout(ms);
const tab = async (x, n) => { await x.p.click(`.tab:nth-child(${n})`); await settle(x); };
const you = async (x) => { await x.p.click('.head .round.me'); await x.p.waitForSelector('#sheet[open] .acct'); await settle(x, 500); };
const done = async (x) => { await x.p.keyboard.press('Escape'); await settle(x, 700); };
const toastSays = (x) => x.p.waitForFunction(() => document.querySelector('#toast.on')?.textContent || null, null, { timeout: 15000 }).then((v) => v.jsonValue(), () => '');
const download = async (x, click) => { const [d] = await Promise.all([x.p.waitForEvent('download'), click()]); return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) }; };
const userId = (handle) => rows(`SELECT id FROM pg_users WHERE handle = '${handle}'`)[0]?.id;
const acts = (uid) => rows(`SELECT id, name, sport, file, type, size FROM fx_acts WHERE user_id = '${uid}' ORDER BY start`);
const state = (uid) => { const r = rows(`SELECT data, ver FROM fx_state WHERE user_id = '${uid}'`)[0]; return r ? { ver: r.ver, ...JSON.parse(r.data) } : null; };
// (the time given counted only while this script is free: reading the database holds every page's requests meanwhile)
const waitFor = async (fn, ms = 10000) => { for (let free = 0; ; free += 300) { const v = await fn(); if (v || free > ms) return v; await new Promise((r) => setTimeout(r, 300)); } };
// (a sheet of the app's opened by itself: those set up on the account's page now, as the welcome still has them)
const openIn = (x, name) => x.p.evaluate(async (n) => { const m = await import('./app.js'); if (n === 'healthView') m.healthView.key = null; m.openSheet(m[n]); }, name);
const api = (x, path, init = {}) => x.p.evaluate(async ([path, init]) => { const r = await fetch(path, { credentials: 'same-origin', ...init }); return { status: r.status, body: await r.text() }; }, [path, init]);

// ---- 1. Signed out: what Fitness is, and Sign in; nothing else ----
const P = await browser('phone');
await P.p.goto(`${FIT}/`);
await P.p.waitForSelector('.welcome #sign-in', { timeout: 20000 });
const welcome = await P.p.evaluate(() => ({ text: document.querySelector('main').innerText.replace(/\s+/g, ' '), tabs: getComputedStyle(document.querySelector('.tabbar')).display, btns: [...document.querySelectorAll('main button')].map((x) => x.textContent) }));
ok(/^Fitness Training that fits your week Sign in New here\? Create your account$/.test(welcome.text.trim()) && welcome.btns.join() === 'Sign in,Create your account' && welcome.tabs === 'none',
  'signed out: its mark and a line, Sign in, and a way in for someone new (no tabs, no rides)', `${welcome.text.slice(0, 90)} | ${welcome.btns.join()} | tabs ${welcome.tabs}`);
await P.p.setInputFiles('#files', FILES.slice(0, 1)); await settle(P, 800);
ok(!(await P.p.$('#sheet[open]')) && await P.p.$('.welcome #sign-in'), 'a file given it signed out: nothing read, nothing kept');
const outMe = await api(P, '/api/fitness/me'), outPut = await api(P, '/api/fitness/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"base":0,"data":{}}' });
const outFile = await api(P, '/api/fitness/acts/i123');
ok(JSON.parse(outMe.body).signedIn === false && outPut.status === 401 && outFile.status === 401, 'its API, signed out: who\'s signed in (no one), and nothing else', `${outMe.body} ${outPut.status} ${outFile.status}`);
await settle(P, 3600); await P.p.screenshot({ path: `${out}/welcome.png` });
// (the site's own address, and a preview's, open it at /fitness/: no sign-in there, so it says where)
const L = await browser('laptop');
await L.p.goto('http://localhost:8788/fitness/');
await L.p.waitForSelector('.welcome #sign-in', { timeout: 20000 });
ok(await L.p.$eval('#sign-in', (x) => x.disabled) && /Signing in is at fitness\.georgefarrowgreen\.com/.test(await L.p.innerText('main')), 'away from its own address: Sign in off, and where it is');
const elsewhere = await api(L, '/api/fitness/me');
ok(elsewhere.status === 404, 'and its API answers only at its own address', String(elsewhere.status));

// ---- 2. Signed up to InFlight on a laptop: Fitness in the same browser is signed in already ----
await joinInFlight(L.p, `${CHAT}/`, { name: 'Sam Taylor', handle: 'sam', email: 'sam@example.com', password: PW, city: 'London' });
const sam = userId('sam');
await L.p.goto(`${FIT}/`);
await L.p.waitForSelector('.head .round.me', { timeout: 20000 });
ok(!(await L.p.$('.welcome')) && (await L.p.textContent('.head .round.me')).trim() === 'S' && await L.p.isVisible('.tabbar'), 'Fitness in the same browser: signed in already, as Sam (no sign-in of its own)');
await you(L);
const card = await L.p.innerText('#sheet .acct');
ok(/Sam Taylor/.test(card) && /@sam/.test(card) && !/georgefarrowgreen\.com/.test(card) && (await L.p.textContent('#sheet .row.action.danger')) === 'Sign out', 'You: the account\'s card, and Sign out', card.replace(/\s+/g, ' '));
ok(!/Example rides/.test(await L.p.innerText('#sheet')), 'no example rides to turn on: only your own');
await done(L);

// ---- 3. Files in on the laptop: each ride kept with the account, its file as it came ----
await tab(L, 2);
const choices = await L.p.locator('.card.first .choice').allInnerTexts();
ok(choices.length === 2 && /^Connect Garmin\s*Best/i.test(choices[0]) && /^Upload files/.test(choices[1]) && !(await L.p.$('main .seg')), 'none yet: Garmin, or files (no filters for nothing)', choices.join(' | ').replace(/\s+/g, ' '));
await L.p.screenshot({ path: `${out}/first.png` });
await L.p.locator('.card.first .choice', { hasText: 'Upload files' }).click(); await L.p.waitForSelector('#sheet[open] .drop-zone'); await settle(L, 500);
const filesSheet = await L.p.locator('#sheet').innerText();
ok(/Choose files/.test(filesSheet) && /Wahoo/.test(filesSheet) && /Strava/.test(filesSheet) && /Zwift/.test(filesSheet) && /Connect it instead/.test(filesSheet), 'Upload files: choose them, where each app keeps them, and Garmin connected instead', filesSheet.replace(/\s+/g, ' ').slice(0, 120));
await L.p.screenshot({ path: `${out}/upload-files.png` });
await done(L);
await L.p.setInputFiles('#files', FILES);
await L.p.waitForSelector('#sheet[open] .sheet-top', { timeout: 60000 }); await settle(L);
// (first, what's in them, each with what it was, before anything's kept)
const review = await L.p.evaluate(() => [...document.querySelectorAll('#sheet .row.up')].map((r) => `${r.querySelector('b').textContent}=${r.querySelector('select').value}${r.classList.contains('guess') ? '?' : ''}`));
ok(await L.p.locator('#sheet .sheet-top h1').innerText() === '3 activities' && /^Morning ride=ride\?,(Morning|Afternoon|Evening|Night) ride=ride,Indoor ride=ride$/.test(review.join()) && !acts(sam).length,
  'three activities (one from the zip) to check before they\'re kept: each one\'s sport from its file, or worked out and marked to check', review.join());
ok(await L.p.locator('#sheet').getByText(/notes\.txt: Fitness reads FIT/).count() === 1 && await L.p.locator('#sheet').getByText(/Hills\.zwo: a workout, not an activity/).count() === 1, 'a workout file and one it can\'t read: left out, by name, with why');
await L.p.screenshot({ path: `${out}/upload.png` });
await L.p.selectOption('#sheet .row.up.guess select', 'run');
await L.p.locator('#sheet .btn', { hasText: 'Upload 3 activities' }).click();
await L.p.waitForSelector('#sheet[open]', { state: 'detached', timeout: 60000 }).catch(() => {});
await L.p.waitForFunction(() => !document.querySelector('#sheet[open]'), null, { timeout: 60000 }); await settle(L);
const kept = acts(sam);
ok(kept.some((a) => a.sport === 'run' && / run$/.test(a.name)) && kept.filter((a) => a.sport === 'ride').length === 2, 'the one changed: kept as a run (and named for it)', JSON.stringify(kept.map((a) => [a.name, a.sport])));
const gzOf = (uid) => rows(`SELECT id, gz FROM fx_acts WHERE user_id = '${uid}'`);
ok(kept.length === 3 && kept.every((a) => a.type === 'fit') && kept.find((a) => a.file === 'ride.fit')?.size < Buffer.byteLength(gpx) / 4 && kept.find((a) => a.file === 'wahoo.fit')?.size < wahoo.length
  && gzOf(sam).every((r) => r.gz === 1), 'each ride kept with the account, in less space: the GPX written as FIT, every file gzipped', JSON.stringify(kept.map((a) => [a.file, a.type, a.size])) + ` (GPX ${Buffer.byteLength(gpx)}, FIT ${wahoo.length})`);
await L.p.screenshot({ path: `${out}/imported.png` });
await done(L);
await L.p.setInputFiles('#files', FILES.slice(0, 1));
await L.p.waitForSelector('#sheet[open] .sheet-top', { timeout: 30000 }); await settle(L);
ok(/^1 activity is here already$/.test(await L.p.locator('#sheet .sheet-top .sub').innerText()) && acts(sam).length === 3, 'the same ride again: already here, not kept twice', await L.p.locator('#sheet .sheet-top .sub').innerText());
await done(L);

// ---- 4. The phone signs in on the account's page, handed back: the laptop's rides are there ----
await P.p.goto(`${FIT}/`);
await P.p.waitForSelector('.welcome #sign-in');
await P.p.click('#sign-in');
await onAccountPage(P.p, { email: 'sam@example.com', password: PW });
await P.p.waitForURL((u) => u.hostname.startsWith('fitness.'), { timeout: 30000 });
// (coming back: the account page's sky and you over Fitness, then clearing to it; a frame of each)
await P.p.screenshot({ path: `${out}/arrive-1.png` }).catch(() => {});
await P.p.waitForTimeout(450); await P.p.screenshot({ path: `${out}/arrive-2.png` }).catch(() => {});
const said = await toastSays(P);
await P.p.waitForSelector('.head .round.me', { timeout: 20000 });
ok(/Signed in as Sam/.test(said) && !/signin=/.test(P.p.url()), 'Sign in, on the account\'s page, and back in Fitness signed in (the code out of the address)', `${said} ${P.p.url()}`);
await tab(P, 2);
const listed = await P.p.locator('.head .sub').innerText();
ok(/^3 activities/i.test(listed) && await P.p.getByText('Wahoo ELEMNT BOLT', { exact: false }).count() >= 1, 'the phone has the laptop\'s three rides', listed);
await P.p.locator('.row', { hasText: 'Wahoo ELEMNT BOLT' }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P, 1200);
const stats = await P.p.locator('#sheet .stat').allInnerTexts();
ok(stats.some((s) => /Normalized Power/.test(s)) && stats.some((s) => /Distance/.test(s)) && await P.p.locator('#sheet .map svg .route, #sheet .map .map-gl').count() > 0, 'opened on the phone, from its file: its figures and its route (on a map, or drawn where there\'s no WebGL)', `${stats.length} figures`);
ok(!(await P.p.locator('#sheet .section', { hasText: 'Export' }).count()), 'no export on a ride you uploaded: it\'s kept as it came');
await done(P);

// ---- 5. Rhythm set up on the phone (your week), and a new FTP on the laptop from the version before it: put together ----
await tab(P, 1);
ok(await P.p.locator('.tab').count() === 3 && !(await P.p.getByText('Or train for an event').count()), 'three tabs, Plan gone into Today: Rhythm alone, no event plans');
ok(await P.p.locator('main .rhythm-intro').count() === 1 && await P.p.locator('.rh-ex-bars > div').count() === 7, 'before it starts, on Today: an example week, and Set up Rhythm');
await P.p.locator('main .btn', { hasText: 'Set up Rhythm' }).click(); await settle(P, 800);
// (1. your days: Monday, a rest day, tapped to a ride day; 2. a run a week; 3. build; 4. the first week, then Start)
ok(await P.p.locator('#sheet .rh-day .track').count() === 7 && /^When do you ride\?/.test(await P.p.locator('#sheet .sheet-top h1').innerText()), 'step 1: a bar for each day');
// (Monday, a rest day, tapped and made an hour a quarter at a time)
await P.p.locator('#sheet .rh-day .track').first().click(); await settle(P, 300);
for (let i = 0; i < 3; i++) { await P.p.getByRole('button', { name: '15 minutes more' }).click(); await settle(P, 150); }
const dayStep = await P.p.locator('#sheet .rh-daystep').innerText();
ok(/Monday/.test(dayStep) && /\b1 h\b/.test(dayStep), 'a day tapped, and its time set with − and +', dayStep.replace(/\s+/g, ' '));
await P.p.locator('#sheet .rh-next').click(); await settle(P, 700);
// (only a few rides uploaded: where you've been riding lately, for Rhythm to start from)
ok(/How much have you been riding/.test(await P.p.locator('#sheet .sheet-top h1').innerText()), 'little riding uploaded: asked how much you’ve been riding lately');
await P.p.locator('#sheet .rh-choice', { hasText: 'Most weeks, regularly' }).click(); await settle(P, 300);
await P.p.locator('#sheet .rh-next').click(); await settle(P, 700);
// (your numbers: worked out from your rides till you set them)
const numStep = await P.p.locator('#sheet').innerText();
ok(/Your numbers/.test(numStep) && /FTP/.test(numStep) && /Estimated from \d+ ride|A starting guess/.test(numStep), 'setting up: your numbers asked, each marked worked out or a guess', numStep.replace(/\s+/g, ' ').slice(0, 160));
await P.p.locator('#sheet .rh-next').click(); await settle(P, 700);
await P.p.locator('#sheet .rh-tile', { hasText: 'A run a week' }).click(); await settle(P, 300);
await P.p.locator('#sheet .rh-next').click(); await settle(P, 700);
ok(await P.p.locator('#sheet .rh-goal.on', { hasText: 'Keep building' }).count() === 1, 'step 3: building, unless you say hold');
await P.p.locator('#sheet .rh-next').click(); await settle(P, 700);
// (riding towards something: nothing in particular, unless you say; a kind chosen asks its day before going on)
ok(await P.p.locator('#sheet .rh-choice.on', { hasText: 'Nothing in particular' }).count() === 1, 'step 3b: no event, unless you choose one');
await P.p.locator('#sheet .rh-choice', { hasText: 'A sportive' }).click(); await settle(P, 400);
await P.p.locator('#sheet .rh-next').click(); await settle(P, 500);
const askedDay = await P.p.locator('#sheet .ev-when').count() === 1 && /Choose its date/.test(await P.p.locator('#toast').innerText().catch(() => ''));
await P.p.locator('#sheet .rh-choice', { hasText: 'Nothing in particular' }).click(); await settle(P, 400);
ok(askedDay && !(await P.p.locator('#sheet .ev-when').count()), 'a sportive chosen: its day asked for before going on; back to nothing in particular');
await P.p.locator('#sheet .rh-next').click(); await settle(P, 900);
const firstWeek = await P.p.locator('#sheet .group .row').count();
ok(firstWeek === 7 && /Your first week/.test(await P.p.locator('#sheet .sheet-top h1').innerText()), 'step 4: the first week, before anything is kept', String(firstWeek));
await P.p.screenshot({ path: `${out}/rhythm-first-week.png` });
await P.p.locator('#sheet .rh-next', { hasText: 'Start Rhythm' }).click(); await settle(P, 900);
const planSub = await P.p.locator('.head .sub').innerText();
const st2 = await waitFor(() => { const s = state(sam); return s?.rhythm ? s : null; });
ok(/^Aerobic block · week 1 of 4/i.test(planSub) && st2?.rhythm?.days?.[0] === 60 && st2.rhythm.run === true && st2.rhythm.level === 'regular', 'Rhythm set up on the phone: your week kept with the account', `${planSub} | ${JSON.stringify(st2?.rhythm)}`);
await you(L);
await L.p.locator('#sheet .row', { hasText: 'FTP' }).first().click(); await settle(L, 600);
const ftpWas = parseInt(await L.p.locator('#sheet .stepper output').first().innerText(), 10);
await L.p.getByRole('button', { name: 'More FTP' }).click(); await settle(L, 300);
await L.p.getByRole('button', { name: 'More FTP' }).click();
const st3 = await waitFor(() => { const s = state(sam); return s?.profile?.ftp === ftpWas + 10 ? s : null; });
ok(st3?.rhythm?.run === true && st3.profile.ftp === ftpWas + 10 && st3.profile.set?.includes('ftp'), 'a new FTP on the laptop, which hadn\'t heard of Rhythm: both kept', JSON.stringify(st3 && { rhythm: !!st3.rhythm, ftp: st3.profile.ftp }));
await done(L); await done(L);
await tab(L, 1);
ok(/ block · /i.test(await L.p.locator('.head .sub').innerText()), 'and the laptop has the phone\'s Rhythm now', await L.p.locator('.head .sub').innerText());
// (units: kilometres at first, from the browsers' region (en-GB); miles, chosen on the account's page, from Fitness
// Settings on the phone, and back: the laptop's in miles too, next it's opened)
await you(P);
const unitsFirst = await P.p.locator('#sheet .row', { hasText: 'Fitness settings' }).innerText();
await P.p.locator('#sheet .row', { hasText: 'Fitness settings' }).click();
await P.p.waitForURL(/account\.gfg\.test/, { timeout: 20000 });
await P.p.waitForSelector('#sheet[open] .seg', { timeout: 30000 }); await settle(P, 600);
const fxSheet = await P.p.locator('#sheet').innerText();
ok(/Fitness/.test(await P.p.locator('#sheet .toapp').innerText().catch(() => '')) && /From your phone’s region/.test(fxSheet) && /Ask how I am/.test(fxSheet) && /Export everything/.test(fxSheet) && !(await P.p.locator('#sheet .row', { hasText: 'Appearance' }).count())
  && /Sources/i.test(fxSheet) && /Garmin Connect/.test(fxSheet) && /Apple Health/.test(fxSheet) && /Ride maps/i.test(fxSheet),
  'Fitness Settings opens its sheet on the account\'s page, with the way back: where your rides come from, maps, units, the morning check-in and the export', fxSheet.replace(/\s+/g, ' ').slice(0, 200));
await P.p.screenshot({ path: `${out}/account-fitness.png` });
await P.p.locator('#sheet .seg button', { hasText: /^mi$/ }).click();
await waitFor(() => state(sam)?.prefs?.units === 'imperial');
await P.p.locator('#sheet .toapp').click();
await P.p.waitForURL(/fitness\.gfg\.test/, { timeout: 20000 }); await P.p.waitForSelector('.head .round.me');
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await L.p.waitForSelector('body[data-fresh]', { state: 'attached' }); await you(L);
const unitsThen = await L.p.locator('#sheet .row', { hasText: 'Fitness settings' }).innerText();
ok(/Kilometres/.test(unitsFirst) && /Miles/.test(unitsThen) && state(sam)?.rhythm?.run === true, 'kilometres at first; miles, chosen on the account\'s page: the laptop\'s in miles too, the rest of the record as it was', `${unitsFirst} | ${unitsThen}`.replace(/\s+/g, ' '));
await done(L);

// ---- 6. A ride renamed on the phone, and another deleted: so on the laptop ----
await tab(P, 2);
// (the ride from the GPX, named for its time of day, whichever: the run beside it is named a run now)
await P.p.locator('.row', { hasText: /(Morning|Afternoon|Evening|Night) ride/ }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P);
// (shared as a picture first: drawn, shown, then the share sheet's, or saved)
await P.p.locator('#sheet .act-links button', { hasText: 'Share' }).click();
const shared = await P.p.waitForSelector('#sheet .share-img.in', { timeout: 15000 }).then(() => P.p.evaluate(() => { const i = document.querySelector('#sheet .share-img'); return [i.naturalWidth, i.naturalHeight]; })).catch(() => null);
ok(shared && shared[0] === 1080 && shared[1] === 1350 && !(await P.p.locator('#sheet .btn[disabled]').count()), 'a ride shared: its picture drawn, 1080 by 1350, ready to share', JSON.stringify(shared));
await P.p.screenshot({ path: `${out}/share-ride.png` });
await P.p.locator('#sheet .back, #sheet button', { hasText: 'Back' }).first().click(); await settle(P, 600);
await P.p.locator('#sheet').getByRole('button', { name: 'Rename' }).click(); await settle(P);
await P.p.fill('#sheet input.field', 'Saturday loop');
await P.p.getByRole('button', { name: 'Save' }).click(); await settle(P, 800);
await done(P);
await P.p.locator('.row', { hasText: 'Indoor ride' }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P);
await P.p.locator('#sheet .row', { hasText: 'Delete' }).click(); await settle(P, 300);
await P.p.locator('#sheet .row', { hasText: 'Delete' }).click(); await settle(P, 1200);
const left = acts(sam);
ok(left.length === 2 && left.some((a) => a.name === 'Saturday loop') && !left.some((a) => a.file === '123_ACTIVITY.fit'), 'renamed and deleted with the account', JSON.stringify(left.map((a) => a.name)));
await tab(L, 2);
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await L.p.waitForSelector('body[data-fresh]', { state: 'attached' });
ok(/^2 activities/i.test(await L.p.locator('.head .sub').innerText()) && await L.p.getByText('Saturday loop').count() >= 1, 'and on the laptop: two rides, one renamed', await L.p.locator('.head .sub').innerText());

// ---- 7. The account's page: Fitness among your apps ----
await L.p.goto(`${ACCT}/`);
await L.p.waitForSelector('main .apps', { timeout: 30000 }); await settle(L, 800);
const appCard = await L.p.locator('main .apps > .app', { hasText: 'Fitness' }).innerText().catch(() => '');
ok(/Fitness/.test(appCard) && /2 activities/.test(appCard), 'the account\'s page: Fitness among your apps, with your rides', appCard.replace(/\s+/g, ' '));
// (its settings, from its card: the morning check-in off; and everything exported, each activity's file in one zip)
await L.p.locator('main .apps > .app', { hasText: 'Fitness' }).scrollIntoViewIfNeeded(); await L.p.screenshot({ path: `${out}/account-fitness-card.png` });
await L.p.click('main .apps > .app:has-text("Fitness") .app-set'); await L.p.waitForSelector('#sheet[open] #fx-ask', { timeout: 20000 }); await settle(L, 500);
await L.p.locator('#sheet label:has(#fx-ask)').click();
await waitFor(() => state(sam)?.prefs?.ask === false);
ok(state(sam)?.prefs?.ask === false && state(sam)?.prefs?.units === 'imperial', 'its settings from its card: the morning check-in off, kept with the record', JSON.stringify(state(sam)?.prefs));
const [dl] = await Promise.all([L.p.waitForEvent('download', { timeout: 60000 }), L.p.locator('#sheet .row', { hasText: 'Export everything' }).click()]);
const zipped = readFileSync(await dl.path()), names = [...zipped.toString('latin1').matchAll(/PK\x01\x02[\s\S]{42}([^\x00-\x1f]+?\.(?:fit|gpx|tcx|zwo))/g)].map((m) => m[1]);
ok(dl.suggestedFilename() === 'Fitness export.zip' && names.filter((n) => n.startsWith('activities/')).length === 2, 'and everything exported: each activity\'s file, in one zip', `${dl.suggestedFilename()}: ${names.join(', ')}`);
await L.p.keyboard.press('Escape'); await settle(L, 600);

// ---- 8. Signing out on the phone: back to the start, its copies gone; the laptop still signed in ----
await P.p.goto(`${FIT}/`); await P.p.waitForSelector('.head .round.me');
await you(P);
await P.p.click('#sheet .row.action.danger');
await P.p.waitForTimeout(700); await P.p.screenshot({ path: `${out}/dusk.png` }).catch(() => {});
await P.p.waitForSelector('.welcome #sign-in', { timeout: 20000 });
await P.p.waitForTimeout(1500); await P.p.screenshot({ path: `${out}/welcome-again.png` });
const cached = await P.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('fitness'); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').count(); q.onsuccess = () => res(q.result); }; r.onerror = () => res(-1); }));
ok(/Signed out\./.test(await P.p.innerText('main')) && cached === 0 && JSON.parse((await api(P, '/api/fitness/me')).body).signedIn === false, 'signed out on the phone: back to Sign in, and no copies of your files left on it', `cached ${cached}`);
await P.p.reload(); await P.p.waitForSelector('.welcome #sign-in');
ok(true, 'and still signed out after a reload');
await L.p.goto(`${FIT}/#activities`); await L.p.waitForSelector('.head .round.me', { timeout: 20000 }); await L.p.waitForSelector('body[data-fresh]', { state: 'attached' });
ok(/^2 activities/i.test(await L.p.locator('.head .sub').innerText()), 'the laptop, another browser: still signed in');

// ---- 8b. Rhythm on the laptop: the days, then a session or rest each day, with its reason ----
await tab(L, 1);
const strip = await L.p.locator('.strip-days .sday').count(), bal = await L.p.locator('.week-card .bal').getAttribute('aria-label').catch(() => '');
await L.p.locator('.strip-all').click(); await settle(L, 500);
const agRows = await L.p.locator('.agenda .ag-row').count();
ok(strip === 7 && await L.p.locator('main .session').count() === 1 && agRows === 14 && /% easy/.test(bal), 'Today has the plan: the week in the strip, today first, and both weeks a tap away', `${strip} ${agRows} ${bal}`);
// (tomorrow, looked at: and a day that isn't the day for it, rest instead, Rhythm taking it in)
await L.p.locator('.agenda .ag-row.today + .ag-row, .agenda .ag-row.today ~ .ag-row').first().click(); await settle(L, 600);
const tmText = await L.p.locator('main .session').first().innerText();
ok(/^Tomorrow$/.test(await L.p.locator('.head h1').innerText()) && !(await L.p.locator('.agenda').count()), 'tomorrow, tapped: its day on the page', tmText.replace(/\s+/g, ' ').slice(0, 100));
if (await L.p.locator('.day-change .chip-btn', { hasText: /^Rest$/ }).count()) {
  await L.p.locator('.day-change .chip-btn', { hasText: /^Rest$/ }).click(); await settle(L, 900);
  const st5 = await waitFor(() => { const s = state(sam); return s && Object.values(s.swaps || {}).includes(null) ? s : null; });
  ok(!!st5 && /Rest/.test(await L.p.locator('main .session').first().innerText()), 'a day changed to rest, there on its card: kept with the account, and the plan takes it in', JSON.stringify(st5?.swaps));
} else ok(/Rest/.test(tmText), 'a rest day: why', tmText.slice(0, 80));
await L.p.screenshot({ path: `${out}/rhythm-plan.png`, fullPage: true });
await tab(L, 1);
ok(/^Today$/.test(await L.p.locator('.head h1').innerText()), 'Today, tapped again: back to today');
const todayCard = await L.p.locator('.session').first().innerText();
ok(/Why today:|Rest, and let it sink in/.test(todayCard), 'Today: the session Rhythm chose, and why (or rest, and why)', todayCard.replace(/\s+/g, ' ').slice(0, 160));
// (a ride today: the best time for it, from the weather where you ride, while there's daylight left)
if (/^(Ride|Run) ·/m.test(todayCard) && new Date().getUTCHours() < 17) {
  await L.p.waitForSelector('.session .best-time', { timeout: 8000 }).catch(() => {});
  const bt = await L.p.locator('.session .best-time').innerText().catch(() => '');
  ok(/^Best .+ to .+/.test(bt) && wxlog.some((x) => x.startsWith('/v1/forecast')), 'a ride or run today: the best time for it, from the forecast where you ride', bt.replace(/\s+/g, ' ') + ' | ' + wxlog.length);
}
await L.p.screenshot({ path: `${out}/rhythm-today.png` });
// (today's session in full: every step with the clock, its watts and how it should feel)
if (await L.p.locator('.session .pill', { hasText: 'Details' }).count()) {
  await L.p.locator('.session .pill', { hasText: 'Details' }).click(); await L.p.waitForSelector('#sheet[open] .ss-step'); await settle(L, 600);
  const stepsN = await L.p.locator('#sheet .ss-step').count(), firstAt = await L.p.locator('#sheet .ss-at').first().innerText();
  ok(stepsN >= 1 && firstAt === '0:00' && /Step by step/i.test(await L.p.innerText('#sheet')), 'Details: the session step by step, from 0:00', `${stepsN} steps`);
  await L.p.screenshot({ path: `${out}/rhythm-session.png` });
  await done(L);
}

// (the day's check-in: heavy legs and a poor night ease today, and tomorrow too)
// (three taps, there on Today's card: no sheet)
for (const [k, v] of [['Sleep', 'Poor'], ['Legs', 'Heavy'], ['Motivation', 'Low']]) { await L.p.locator(`.checkin .seg3[aria-label="${k}"] button`, { hasText: v }).click(); await settle(L, 300); }
await settle(L, 600);
const checked = await L.p.locator('.checkin.done').innerText().catch(() => '');
ok(/Rhythm has eased today|Tomorrow eased/.test(checked) && /Slept poorly · heavy legs · low motivation/.test(checked), 'checked in: what you said, and what Rhythm changed', checked.replace(/\s+/g, ' '));
await L.p.locator('.checkin.done').screenshot({ path: `${out}/checkin.png` });

// ---- 8c. Garmin Connect on the laptop: a key Garmin won't take, then yours; the morning's ride comes in, the
// Wahoo's ride (on Garmin too) isn't kept twice; one recorded later is fetched by the scheduler and read as the app opens ----
await openIn(L, 'garminView'); await L.p.waitForSelector('#sheet #garmin-key'); await settle(L, 500);
await L.p.fill('#garmin-key', 'not-the-right-key-0123456789');
await L.p.locator('#sheet .btn', { hasText: 'Connect' }).click();
const refused = await waitFor(async () => { const t = await toastSays(L); return /Garmin/.test(t) && t; }, 15000);
ok(/Garmin didn’t take that key/.test(refused) && !rows(`SELECT user_id FROM fx_garmin WHERE user_id = '${sam}'`).length, 'a key Garmin won’t take: said so, and not kept', refused);
await L.p.screenshot({ path: `${out}/garmin-connect.png` });
await L.p.fill('#garmin-key', GKEY);
await L.p.locator('#sheet .btn', { hasText: 'Connect' }).click();
const joined = await waitFor(async () => (await toastSays(L)).match(/Connected.*/)?.[0], 20000);
await settle(L, 600);
ok(!(await L.p.$('#sheet[open]')) && /Activities/.test(await L.p.locator('.head h1').innerText()) && !(await L.p.$('.card.bringing')), 'connected: back on Activities, the six months in', joined);
await openIn(L, 'garminView'); await L.p.waitForSelector('#sheet .sheet-top'); await settle(L, 500);
const gKept = acts(sam), gRow = rows(`SELECT apikey, ok FROM fx_garmin WHERE user_id = '${sam}'`)[0];
ok(gKept.some((a) => a.id === 'g9001' && a.name === 'Morning gravel' && a.type === 'fit') && !gKept.some((a) => a.id === 'g9002') && gKept.length === 3,
  'connected: the morning’s ride in, by its Garmin name; the Wahoo’s ride, on Garmin too, not kept twice', `${joined} | ${gKept.map((a) => a.id + ':' + a.name).join(', ')}`);
ok(gRow && gRow.ok === 1 && gRow.apikey.startsWith('w1:') && !gRow.apikey.includes(GKEY) && !rows(`SELECT id FROM fx_garmin_new WHERE user_id = '${sam}'`).length,
  'the key kept locked, and nothing left waiting', gRow?.apikey?.slice(0, 6));
const gSheet = await L.p.locator('#sheet').innerText();
ok(/Connected/.test(gSheet) && /Last checked/.test(gSheet) && /Check now/.test(gSheet) && /Disconnect/.test(gSheet), 'its sheet: connected, when it last looked, Check now and Disconnect', gSheet.replace(/\s+/g, ' ').slice(0, 160));
await L.p.screenshot({ path: `${out}/garmin-connected.png` });
await done(L);
// (a run this evening, recorded after: the scheduler's turn fetches it, and the app reads it as it opens)
const gLater = gAt + 3 * 3600;
GACTS.push({ activityId: 9003, activityName: 'Evening run', startTimeGMT: gTimes(gLater), file: zipOf('9003_ACTIVITY.fit', Buffer.from(writeFit([['fileId', { type: 4, manufacturer: 1, product: 3843, serial: 7, created: gLater }],
  ...Array.from({ length: 1500 }, (_, i) => ['record', { timestamp: gLater + i, heartRate: 150, speed: 3.2, distance: i * 3.2 }]),
  ['session', { timestamp: gLater + 1499, startTime: gLater, sport: 1, elapsed: 1500, timer: 1500 }]]))) });
sql(`UPDATE fx_garmin SET last = 0 WHERE user_id = '${sam}'`);
const tickNo = await api(L, '/api/fitness/garmin-tick', { method: 'POST' });
const tickYes = await api(L, '/api/fitness/garmin-tick', { method: 'POST', headers: { Authorization: 'Bearer tick-test-secret' } });
ok(tickNo.status === 401 && JSON.parse(tickYes.body).asked === 1 && rows(`SELECT id FROM fx_garmin_new WHERE user_id = '${sam}'`).map((r) => r.id).join() === '9003',
  'the scheduler’s turn (with its secret only): the evening’s run fetched, waiting', `${tickNo.status} ${tickYes.body}`);
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await L.p.waitForSelector('body[data-fresh]', { state: 'attached' });
const gRun = await waitFor(() => acts(sam).find((a) => a.id === 'g9003'), 15000);
ok(gRun?.sport === 'run' && gRun.name === 'Evening run' && !rows(`SELECT id FROM fx_garmin_new WHERE user_id = '${sam}'`).length, 'opened: the run read and kept, nothing waiting', JSON.stringify(gRun));
// ---- all your history: a ride from over a year ago, not in the six months; brought in when asked for ----
const gOld = gAt - 400 * 86400;
GACTS.push({ activityId: 9004, activityName: 'Old gravel', startTimeGMT: gTimes(gOld), file: zipOf('9004_ACTIVITY.fit', Buffer.from(gride(gOld, 1800))) });
await openIn(L, 'garminView'); await L.p.waitForSelector('#sheet .sheet-top'); await settle(L, 500);
const gAllSheet = await L.p.locator('#sheet').innerText();
await L.p.locator('#sheet .btn', { hasText: 'Bring in all your rides' }).click();
const gAll = await waitFor(() => acts(sam).find((a) => a.id === 'g9004'), 30000);
await waitFor(() => !rows(`SELECT back FROM fx_garmin WHERE user_id = '${sam}' AND back = 1`).length, 30000);
await settle(L, 1500);
ok(/All your rides/i.test(gAllSheet) && gAll?.name === 'Old gravel' && acts(sam).filter((a) => a.id.startsWith('g9001')).length === 1 && !rows(`SELECT back FROM fx_garmin WHERE user_id = '${sam}' AND back = 1`).length,
  'all your rides: one from over a year ago brought in, nothing twice, and done once it’s caught up', `${JSON.stringify(gAll)} | ${acts(sam).map((a) => a.id).join(',')}`);
await L.p.screenshot({ path: `${out}/garmin-all.png` });
// (and your nights, with the activities: kept, and the page told)
const gWell = rows(`SELECT day, hrv, hrv_lo, rhr, sleep, score FROM fx_well WHERE user_id = '${sam}'`), meWell = JSON.parse((await api(L, '/api/fitness/me')).body).garmin?.well || [];
ok(gWell.length === 1 && gWell[0].hrv === 41 && gWell[0].hrv_lo === 52 && gWell[0].rhr === 49 && gWell[0].sleep === 25200 && gWell[0].score === 78 && meWell.length === 1 && glog.some((l) => l.includes('/hrv-service/hrv/daily/')),
  'Garmin: your night’s HRV, resting heart rate and sleep kept, and the page told', JSON.stringify({ gWell, meWell }));
// ---- Apple Health, by a Shortcut: a key made in Fitness, and the morning's post with it (no cookie: from Shortcuts) ----
await openIn(L, 'healthView'); await L.p.waitForSelector('#sheet .sheet-top'); await settle(L, 400);
await L.p.locator('#sheet .btn', { hasText: 'Make my key' }).click(); await L.p.waitForSelector('#sheet .hk-key'); await settle(L, 400);
const hAddr = (await L.p.locator('#sheet .hk-key').first().innerText()).replace(/\s+/g, ''), hKey = hAddr.split('/').pop(), hSteps = await L.p.locator('#sheet').innerText();
ok(hAddr === `${FIT}/api/fitness/health/${hKey}` && /^fxh_[A-Za-z0-9_-]{30,}$/.test(hKey) && /Get Contents of URL/.test(hSteps) && !/Authorization/.test(hSteps), 'Apple Health: an address of your own (the key in it, nothing else to copy), and the Shortcut’s steps', hAddr.slice(0, 60));
await L.p.screenshot({ path: `${out}/health-key.png` });
const shortcut = (headers, b, path = '/api/fitness/health') => api(L, path, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(b) });
const hNo = await shortcut({}, { hrv: 50 }), hBad = await shortcut({ Authorization: 'Bearer fxh_' + 'x'.repeat(40) }, { hrv: 50 });
// (as Shortcuts writes them: samples a line each, with their units; sleep as each stretch's length)
// (and with the key as a header to the plain address, and the body as a form, as Shortcuts can send it too)
const hDay0 = new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10);
const hForm = await api(L, '/api/fitness/health', { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${hKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `hrv=50&hrv=53&rhr=52&sleep=7.5&day=${hDay0}` });
const hFormRow = rows(`SELECT hrv, rhr, sleep FROM fx_health WHERE user_id = '${sam}' AND day = '${hDay0}'`)[0];
const hYes = await shortcut({}, { hrv: '48 ms\n52 ms\n55 ms', rhr: '51 count/min', sleep: '2 hr 10 min\n3 hr 5 min\n1 hr 45 min' }, `/api/fitness/health/${hKey}`);
const hRow = rows(`SELECT hrv, rhr, sleep FROM fx_health WHERE user_id = '${sam}' AND day != '${hDay0}'`)[0];
ok(hNo.status === 401 && hBad.status === 401 && hYes.status === 200 && /Fitness has it: HRV 51.7 ms, resting 51 bpm, 7 h 0 min asleep/.test(hYes.body) && hRow?.hrv === 51.7 && hRow.rhr === 51 && hRow.sleep === 25200,
  'the Shortcut’s morning: nothing without the key; to your address, last night read as Shortcuts writes it, and kept', `${hNo.status} ${hBad.status} ${hYes.body} ${JSON.stringify(hRow)}`);
ok(hForm.status === 200 && hFormRow?.hrv === 51.5 && hFormRow.rhr === 52 && hFormRow.sleep === 27000, 'and as a form, with the key as a header', `${hForm.status} ${hForm.body}`);
await done(L); await openIn(L, 'healthView'); await L.p.waitForSelector('#sheet .sheet-top'); await settle(L, 400);
await L.p.locator('#sheet .btn', { hasText: 'Check again' }).click(); await L.p.waitForFunction(() => /Last morning/.test(document.querySelector('#sheet .sheet-top')?.textContent || '')); await settle(L, 400);
ok(/Last morning: HRV 51.7 ms, resting heart rate 51, 7 h 0 min asleep/.test(await L.p.locator('#sheet .sheet-top').innerText()), 'and Fitness shows what came', await L.p.locator('#sheet .sheet-top').innerText());
// (a day ahead isn't taken as said: it'd never be pruned; and a key that can't be one, turned away unread)
const hAhead = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);
const hFut = await shortcut({}, { hrv: 49, day: hAhead }, `/api/fitness/health/${hKey}`), hOdd = await shortcut({}, { hrv: 50 }, '/api/fitness/health/not-a-key');
ok(hFut.status === 200 && !rows(`SELECT day FROM fx_health WHERE user_id = '${sam}' AND day = '${hAhead}'`).length && [401, 404].includes(hOdd.status),
  'a night dated ahead is kept as today’s, and a key that can’t be Fitness’s is refused', `${hFut.status} ${hOdd.status}`);
await L.p.screenshot({ path: `${out}/health-on.png` });
await done(L);
const noLeak = await api(L, '/api/fitness/me');
ok(!noLeak.body.includes(GKEY) && !noLeak.body.includes(GTOKEN), 'the key and Garmin’s token never sent to the page');

// ---- the older activities, a page at a time (a phone new to the account has the newest first): all of them, in order ----
const byStart = rows(`SELECT id, start FROM fx_acts WHERE user_id = '${sam}' ORDER BY start DESC, id DESC`);
const olderGot = JSON.parse((await api(L, `/api/fitness/me/older?start=${byStart[0].start}&id=${encodeURIComponent(byStart[0].id)}`)).body);
const olderBad = await api(L, '/api/fitness/me/older?start=x&id=../y');
ok(byStart.length > 1 && olderGot.acts.map((a) => a.id).join() === byStart.slice(1).map((a) => a.id).join() && olderGot.more === false && olderBad.status === 400,
  'the activities older than one the phone has: every one, newest first; a bad ask refused', `${byStart.length} ${olderGot.acts?.length} ${olderBad.status}`);
// ---- offline: the app's files kept by its service worker, so it opens with no network, from this phone's copy ----
await L.p.evaluate(async () => { await navigator.serviceWorker.ready; });
await L.p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
await L.ctx.setOffline(true);
await L.p.reload(); await L.p.waitForSelector('.tabs .tab', { timeout: 20000 }).catch(() => {}); await settle(L, 800);
const offTxt = await L.p.innerText('main');
await L.ctx.setOffline(false);
await L.p.reload(); await L.p.waitForSelector('.tabs .tab'); await settle(L, 800);
ok(/Today|Activities|Progress/.test(offTxt) && !/needs JavaScript|You’re offline. Fitness will be here/.test(offTxt) && /Today|Activities|Progress/.test(await L.p.innerText('main')), 'with no network, the app still opens, from this phone’s copy', offTxt.slice(0, 160));

// ---- 8d½. Someone new: the welcome, the whole screen, a step at a time, then Today ----
// (a phone as the others, but never welcomed: the welcome's for it)
const O = await browser('new'), OC = O.ctx;
await OC.addInitScript(() => { try { localStorage.removeItem('fitness:welcomed'); } catch (_) {} });
await joinInFlight(O.p, `${CHAT}/`, { name: 'Jo Bloggs', handle: 'jobloggs', email: 'jo@example.com', password: PW, city: 'York' }).catch(async (e) => { await O.p.screenshot({ path: `${out}/onb-join-fail.png` }); console.log('JOINFAIL', O.p.url(), e.message.split('\n')[0]); throw e; });
await O.p.goto(`${FIT}/`);
const oOpen = await O.p.waitForSelector('dialog.sheet.full[open] .onb-title', { timeout: 30000 }).then(() => true, () => false);
const oHi = oOpen ? await O.p.locator('.onb-title').innerText() : '';
await O.p.screenshot({ path: `${out}/onb-1-welcome.png` });
const oStep = async (sel, text, shot) => { await O.p.locator(sel, text ? { hasText: text } : {}).first().click(); await settle(O, 700); if (shot) await O.p.screenshot({ path: `${out}/onb-${shot}.png` }); };
await oStep('#sheet .rh-next', 'Get started', '2-rides');
const oRides = await O.p.locator('#sheet .sheet-body').innerText();
await oStep('#sheet .onb-choice', 'just starting out', '3-week');
await oStep('#sheet .rh-next', 'Next', '3b-level');
await oStep('#sheet .rh-next', 'Next', '4-goal');
await oStep('#sheet .onb-goal', 'Go further');
await oStep('#sheet .rh-next', 'Next', '5-mornings');
await oStep('#sheet .rh-next', 'Next', '6-first-week');
const oWeek = await O.p.locator('#sheet .sheet-top h1').innerText();
await oStep('#sheet .rh-next', 'Start training'); await settle(O, 1500);
await O.p.screenshot({ path: `${out}/onb-7-today.png` });
const oState = JSON.parse(rows(`SELECT data FROM fx_state WHERE user_id = '${userId('jobloggs')}'`)[0]?.data || '{}');
await O.p.reload(); await O.p.waitForSelector('.tabs .tab'); await settle(O, 1500);
const oAgain = await O.p.$('dialog.sheet.full[open]');
ok(oOpen && /Hi Jo\. Training that fits your week\./.test(oHi) && /Bring your rides in/.test(oRides) && /Strava/.test(oRides) && /Garmin Connect/.test(oRides) && /Your first week/.test(oWeek)
  && oState.prefs?.onboarded === true && oState.rhythm?.lean === 'endurance' && oState.rhythm?.mode === 'build' && !oAgain && /Today/.test(await O.p.innerText('main')),
  'someone new: the welcome, their rides, their week, what they’re riding for, their mornings, their first week; then Today, and not again', `${oHi} | ${oWeek} | ${JSON.stringify(oState.prefs)} ${oState.rhythm?.lean}`);
await OC.close();

// ---- 8e. Strava: connected on its own page, and back; its activities in by themselves, as Garmin's are ----
await openIn(L, 'stravaView'); await L.p.waitForSelector('#sheet .btn.strava'); await settle(L, 400);
await L.p.screenshot({ path: `${out}/strava-off.png` });
await L.p.click('#sheet .btn.strava');
const sIn = await L.p.waitForFunction(async () => { const { S } = await import('./app.js'); return S.own.some((a) => a.id === 's7001') && S.own.some((a) => a.id === 's7002'); }, null, { timeout: 60000, polling: 500 }).then(() => true, () => false);
await settle(L, 800);
await L.p.screenshot({ path: `${out}/strava-in.png` });
const sRows = rows(`SELECT id, sport, indoor, name, device FROM fx_acts WHERE user_id = '${sam}' AND id LIKE 's%' ORDER BY id`), sTokRow = rows(`SELECT access, refresh FROM fx_strava WHERE user_id = '${sam}'`)[0];
const sMe = (await api(L, '/api/fitness/me')).body, sLeft = rows(`SELECT id FROM fx_strava_new WHERE user_id = '${sam}'`).length;
ok(sIn && sRows.length === 2 && sRows[0].id === 's7001' && sRows[0].sport === 'ride' && sRows[0].indoor === 1 && sRows[0].name === 'Lunch ride' && sRows[0].device === 'Zwift'
  && sRows[1].id === 's7002' && sRows[1].sport === 'run' && /^w1:/.test(sTokRow?.access) && /^w1:/.test(sTokRow?.refresh) && !/"s[ar]1"/.test(sMe) && slog.some((x) => x.startsWith('POST /api/v3/push_subscriptions')) && sLeft === 0,
  'Strava: yes on its page, and back; the ride (indoors, its name and device) and the run come in, the one typed in by hand doesn’t; its tokens locked, never sent to the page', `${sIn} ${JSON.stringify(sRows)} ${sTokRow?.access?.slice(0, 6)}`);
// (the ride's sheet links back to it on Strava)
await L.p.evaluate(async () => { const { S } = await import('./app.js'), { openAct } = await import('./activities.js'); await openAct(S.own.find((a) => a.id === 's7001')); });
const sLink = await L.p.waitForSelector('#sheet a.link.strava', { timeout: 15000 }).then((e) => e.getAttribute('href'), () => null);
await done(L);
ok(sLink === 'https://www.strava.com/activities/7001', 'and its sheet says “View on Strava”, to it there', sLink);
ok(slog.some((x) => x.startsWith('GET /oauth/authorize') && x.includes('approval_prompt=force')) && rows(`SELECT name FROM fx_strava WHERE user_id = '${sam}'`)[0]?.name === 'Sam Taylor',
  'Strava always shows its own page (so you see whose Strava it is), and Fitness says whose it is');
// ---- one person's Strava and Garmin, one Fitness account: another account can't take them, nor their rides ----
const X = await browser('second');
await joinInFlight(X.p, `${CHAT}/`, { name: 'Alex Reed', handle: 'alex', email: 'alex@example.com', password: PW, city: 'Leeds' });
await X.p.goto(`${FIT}/`); await X.p.waitForSelector('.head .round.me', { timeout: 30000 }); await settle(X, 1500);
const alex = rows("SELECT id FROM pg_users WHERE handle = 'alex'")[0]?.id;
const xGo = JSON.parse((await api(X, '/api/fitness/strava/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).body).url;
await X.p.goto(xGo); await X.p.waitForSelector('.tabs .tab', { timeout: 30000 }); await settle(X, 1500);
const xToast = await X.p.evaluate(() => document.querySelector('#toast')?.textContent || '');
const xGarmin = await api(X, '/api/fitness/garmin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: GKEY }) });
ok(!rows(`SELECT user_id FROM fx_strava WHERE user_id = '${alex}'`).length && rows(`SELECT user_id FROM fx_strava WHERE user_id = '${sam}'`).length === 1 && /another Fitness account/.test(xToast)
  && xGarmin.status === 409 && /another Fitness account/.test(xGarmin.body) && !rows(`SELECT id FROM fx_acts WHERE user_id = '${alex}'`).length,
  'another account connecting the same Strava, or pasting the same Garmin key: refused, said so, and nothing of Sam’s comes to it', `${xToast} ${xGarmin.status}`);
await X.ctx.close();
// Strava's word: its check (with our token only), a rename, a new one, and someone else's subscription ignored
const sVerify = createHash('sha256').update('fitness-strava-hook|test-strava-secret-for-local-tests').digest('hex').slice(0, 32);
const sCheck = await api(L, `/api/fitness/strava/hook?hub.mode=subscribe&hub.verify_token=${sVerify}&hub.challenge=abc123`), sCheckBad = await api(L, '/api/fitness/strava/hook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc123');
const hook = (e) => api(L, '/api/fitness/strava/hook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
await hook({ object_type: 'activity', object_id: 7001, aspect_type: 'update', owner_id: 555, subscription_id: 78, updates: { title: 'Not ours' } });
await hook({ object_type: 'activity', object_id: 7001, aspect_type: 'update', owner_id: 555, subscription_id: 77, updates: { title: 'Lunch ride, renamed' } });
await hook({ object_type: 'activity', object_id: 7006, aspect_type: 'create', owner_id: 555, subscription_id: 77 });
const sAfter = rows(`SELECT name FROM fx_acts WHERE user_id = '${sam}' AND id = 's7001'`)[0], sDue = rows(`SELECT due FROM fx_strava WHERE user_id = '${sam}'`)[0];
ok(sCheck.status === 200 && JSON.parse(sCheck.body)['hub.challenge'] === 'abc123' && sCheckBad.status === 403 && sAfter?.name === 'Lunch ride, renamed' && sDue?.due === 1,
  'Strava’s webhook: its check answered only with our token; renamed there, renamed here; a new one asked for; another subscription’s word ignored', `${sCheck.status} ${sCheckBad.status} ${sAfter?.name} ${sDue?.due}`);
// all your history: back past the six months, to the old ride
const sAll = await api(L, '/api/fitness/strava/all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
const sWait = rows(`SELECT id FROM fx_strava_new WHERE user_id = '${sam}'`).map((r) => r.id);
ok(sAll.status === 200 && sWait.join() === '7005', 'all your Strava history: the old ride found, waiting to be read (and only it)', `${sAll.status} ${JSON.stringify(sWait)}`);
// disconnected on Strava: the tokens and what's waiting go here; what's in Fitness stays
await hook({ object_type: 'athlete', object_id: 555, aspect_type: 'update', owner_id: 555, subscription_id: 77, updates: { authorized: 'false' } });
ok(!rows(`SELECT user_id FROM fx_strava WHERE user_id = '${sam}'`).length && !rows(`SELECT id FROM fx_strava_new WHERE user_id = '${sam}'`).length && rows(`SELECT id FROM fx_acts WHERE user_id = '${sam}' AND id LIKE 's%'`).length === 2,
  'disconnected on Strava: its tokens and the files waiting gone; the activities already in Fitness stay');
// and what it brought in, removed, where asked (not yours, say): the activities and their files
const sDrop = await api(L, '/api/fitness/strava?acts=1', { method: 'DELETE' });
ok(sDrop.status === 200 && JSON.parse(sDrop.body).gone === 2 && !rows(`SELECT id FROM fx_acts WHERE user_id = '${sam}' AND id LIKE 's%'`).length && rows(`SELECT id FROM fx_acts WHERE user_id = '${sam}'`).length > 0,
  'removing what Strava brought in: its activities go, the rest stay', sDrop.body);
await L.p.reload(); await L.p.waitForSelector('.tabs .tab'); await settle(L, 600);

// ---- 8d. One kept before files were made smaller (a GPX, as it came): made smaller as the app opens, its figures kept ----
const oldAt = (t0 - 86400 * 9) * 1000, oldGpx = gpxFromActivity({ ...ride, start: oldAt, name: 'Old ride' });
const oldUp = await L.p.evaluate(async ([gpx, at]) => { const f = new FormData(); f.append('meta', JSON.stringify({ id: `i${at}`, start: at, sport: 'ride', name: 'Old ride', file: 'old.gpx', type: 'gpx', sum: { secs: 5400, tss: 70 } }));
  f.append('file', new Blob([gpx]), 'old.gpx'); const r = await fetch('/api/fitness/acts', { method: 'POST', body: f }); return r.status; }, [oldGpx, oldAt]);
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await L.p.waitForSelector('body[data-fresh]', { state: 'attached' });
const squashed = await waitFor(() => rows(`SELECT type, file, size, gz, sum FROM fx_acts WHERE user_id = '${sam}' AND id = 'i${oldAt}'`).find((r) => r.gz === 1), 20000);
ok(oldUp === 200 && squashed?.type === 'fit' && squashed.file === 'old.fit' && squashed.size < Buffer.byteLength(oldGpx) / 4 && JSON.parse(squashed.sum).tss === 70,
  'one kept before: written as FIT and gzipped as the app opens, its figures as they were', `${oldUp} ${JSON.stringify(squashed)} (GPX ${Buffer.byteLength(oldGpx)})`);
const oldBack = await L.p.evaluate(async (id) => { const m = await import('./account.js'); const b = await m.fileOf(id); return [b.length, String.fromCharCode(b[8], b[9], b[10], b[11])]; }, `i${oldAt}`);
ok(oldBack[1] === '.FIT', 'and back, unpacked, as a FIT file', JSON.stringify(oldBack));

// ---- 8e. The morning reminder on the laptop: turned on for 07:30; its week's words kept; sent once, when its time
// comes (the scheduler's turn), and not again that day ----
const pk = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const pushPub = Buffer.from(await crypto.subtle.exportKey('raw', pk.publicKey)).toString('base64url'), pushAuth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
await L.ctx.grantPermissions(['notifications'], { origin: FIT });
await L.ctx.addInitScript(({ endpoint, p256dh, auth }) => {
  // (headless Chromium has no push service: one stood in for, with keys the test holds)
  const make = (key) => ({ endpoint, options: { applicationServerKey: key }, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
  PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakesub') ? make(null) : null; };
  PushManager.prototype.subscribe = async function () { localStorage.setItem('fakesub', '1'); return make(null); };
}, { endpoint: 'https://fcm.googleapis.com/fcm/send/fitness-laptop', p256dh: pushPub, auth: pushAuth });
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await L.p.waitForSelector('body[data-fresh]', { state: 'attached' }); await you(L);
await L.p.locator('#sheet .row', { hasText: 'Morning reminder' }).click(); await settle(L, 600);
const preview = await L.p.locator('#sheet .note-preview').innerText().catch(() => '');
await L.p.locator('#sheet .times .pill', { hasText: '07:30' }).click(); await settle(L, 300);
await L.p.locator('#sheet .btn', { hasText: 'Turn on' }).click();
const mrow = await waitFor(() => rows(`SELECT at, tz, days FROM fx_push WHERE user_id = '${sam}'`)[0], 15000);
const mdays = mrow ? JSON.parse(mrow.days) : {};
ok(mrow?.at === 450 && Object.keys(mdays).length >= 7 && Object.values(mdays).every((d) => /^(Today: |Rest day)/.test(d.title)) && /^(Today: |Rest day)/.test(preview),
  'the morning reminder on: at 07:30, and the week’s words with it', `${JSON.stringify(mrow && { at: mrow.at, tz: mrow.tz })} | ${preview.replace(/\s+/g, ' ')}`);
await L.p.screenshot({ path: `${out}/morning.png` });
await done(L); await done(L);
// (its time come: sent by the scheduler's turn; a second turn the same day sends nothing)
const nowMins = (() => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: mrow.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return Number(p.hour) * 60 + Number(p.minute); })();
sql(`UPDATE fx_push SET at = ${Math.max(0, nowMins - 1)}, sent = NULL WHERE user_id = '${sam}'`);
const pushedBefore = readFileSync(`${S}/pushbox.jsonl`, 'utf8').split('\n').filter((l) => l.includes('fitness-laptop')).length;
const t1 = JSON.parse((await api(L, '/api/fitness/garmin-tick', { method: 'POST', headers: { Authorization: 'Bearer tick-test-secret' } })).body);
const t2 = JSON.parse((await api(L, '/api/fitness/garmin-tick', { method: 'POST', headers: { Authorization: 'Bearer tick-test-secret' } })).body);
const pushedAfter = readFileSync(`${S}/pushbox.jsonl`, 'utf8').split('\n').filter((l) => l.includes('fitness-laptop')).length;
ok(t1.morning?.sent === 1 && t2.morning?.sent === 0 && pushedAfter === pushedBefore + 1, 'its time come: sent once, and not again that day', `${JSON.stringify(t1.morning)} ${JSON.stringify(t2.morning)} ${pushedBefore}→${pushedAfter}`);

// ---- 8f. Progress on the laptop: the story (fitness, tiles), and Power's records from the rides ----
await tab(L, 3);
await L.p.waitForSelector('.p-hero', { timeout: 20000 }); await settle(L, 800);
const prog = await L.p.locator('main').innerText();
ok(/Progress/.test(prog) && /\d+\s*fitness/.test(prog) && /FTP/.test(prog) && /Form/.test(prog) && await L.p.locator('.p-cal-grid i').count() === 182, 'Progress: fitness and where it\'s heading, the tiles, and every day', prog.replace(/\s+/g, ' ').slice(0, 140));
await L.p.screenshot({ path: `${out}/progress.png` });
await L.p.locator('main .row', { hasText: 'Power' }).first().click(); await L.p.waitForSelector('#sheet[open] .p-curve'); await settle(L, 600);
const recs = await L.p.locator('#sheet .p-record').count();
await L.p.locator('#sheet .p-lens button', { hasText: '20 min' }).click(); await settle(L, 300);
ok(recs >= 3 && /Your best for 20 minutes/i.test(await L.p.locator('#sheet .p-kick').first().innerText()), 'Power: records from the rides, and a length tapped', String(recs));
await done(L);
for (const t of ['Training', 'Engine']) { await L.p.locator('main .row', { hasText: t }).click(); await L.p.waitForSelector('#sheet[open] .card'); await settle(L, 500); await done(L); }

// ---- 9. Nothing scrolls sideways on a small phone ----
await L.p.setViewportSize({ width: 320, height: 640 }); await settle(L);
const wide = [];
for (const i of [1, 2, 3]) { await tab(L, i); if (await L.p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(i); }
await P.p.setViewportSize({ width: 320, height: 640 }); await settle(P);
if (await P.p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push('welcome');
ok(!wide.length, 'at 320 px wide, no screen scrolls sideways', wide.join(','));
await L.p.screenshot({ path: `${out}/small.png` });
ok(!errs.length, 'no errors on the pages', errs.slice(0, 3).join(' | '));

await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
