// Fitness (fitness/), at its own address (fitness.<site>), signed in only, with the site's one account: signed out,
// just what it is and Sign in (on the account's page, handed back); signed up to InFlight in a browser, Fitness there is
// signed in already. Files come in (a Wahoo's FIT ride, a GPX, a ZWO workout, a zip as Garmin Connect's "Export
// original" makes it, and one it can't read), and each ride's kept with the account, its file as it came; another device
// signed in has them, each opened from its file, and out again as FIT with every sample. A plan chosen on one device and
// a workout built on the other, each from the same version, are put together. A ride renamed or deleted on one is so on
// the other. The account's page has Fitness among your apps. Signing out goes back to the start, and the API answers
// only signed in, and only at Fitness's own address. Nothing scrolls sideways on a small phone.
// The site's addresses are stood in for by gfg.test (chat., fitness. and account.), mapped to this machine, so the
// browser shares the sign-in between them as it would between georgefarrowgreen.com's.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { createServer } from 'node:http';
import { readFit, writeFit } from '../../fitness/fit.js';
import { zwoFromWorkout, gpxFromActivity, crc32 } from '../../fitness/formats.js';
import { workoutById } from '../../fitness/workouts.js';
import { demo, samples, PROFILE } from '../../fitness/sample.js';
import { joinInFlight, onAccountPage } from './join.mjs';

const [,, S, out] = process.argv;
const CHAT = 'http://chat.gfg.test:8788', FIT = 'http://fitness.gfg.test:8788', ACCT = 'http://account.gfg.test:8788', PW = 'a long test password';
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
  if (u.pathname === '/activitylist-service/activities/search/activities') return send(200, Number(u.searchParams.get('start')) ? [] : GACTS.map(({ file, ...a }) => a));
  const m = /^\/download-service\/files\/activity\/(\d+)$/.exec(u.pathname), a = m && GACTS.find((x) => String(x.activityId) === m[1]);
  return a ? send(200, a.file, 'application/zip') : send(404, {});
}).listen(8793, '127.0.0.1');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${FIT},${ACCT}`] });
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
const api = (x, path, init = {}) => x.p.evaluate(async ([path, init]) => { const r = await fetch(path, { credentials: 'same-origin', ...init }); return { status: r.status, body: await r.text() }; }, [path, init]);

// ---- 1. Signed out: what Fitness is, and Sign in; nothing else ----
const P = await browser('phone');
await P.p.goto(`${FIT}/`);
await P.p.waitForSelector('.welcome #sign-in', { timeout: 20000 });
const welcome = await P.p.evaluate(() => ({ text: document.querySelector('main').innerText.replace(/\s+/g, ' '), tabs: getComputedStyle(document.querySelector('.tabbar')).display, btns: [...document.querySelectorAll('main button')].map((x) => x.textContent) }));
ok(/^Training that fits your week Sign in New here\? Create your account$/.test(welcome.text.trim()) && welcome.btns.join() === 'Sign in,Create your account' && welcome.tabs === 'none',
  'signed out: its mark and a line, Sign in, and a way in for someone new (no tabs, no rides)', `${welcome.text.slice(0, 90)} | ${welcome.btns.join()} | tabs ${welcome.tabs}`);
await P.p.setInputFiles('#files', FILES.slice(0, 1)); await settle(P, 800);
ok(!(await P.p.$('#sheet[open]')) && await P.p.$('.welcome #sign-in'), 'a file given it signed out: nothing read, nothing kept');
const outMe = await api(P, '/api/fitness/me'), outPut = await api(P, '/api/fitness/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"base":0,"data":{}}' });
const outFile = await api(P, '/api/fitness/acts/i123');
ok(JSON.parse(outMe.body).signedIn === false && outPut.status === 401 && outFile.status === 401, 'its API, signed out: who\'s signed in (no one), and nothing else', `${outMe.body} ${outPut.status} ${outFile.status}`);
await P.p.screenshot({ path: `${out}/welcome.png` });
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
ok(/Sam Taylor/.test(card) && /@sam · georgefarrowgreen\.com/.test(card) && (await L.p.textContent('#sheet .row.action.danger')) === 'Sign out', 'You: the account\'s card, and Sign out', card.replace(/\s+/g, ' '));
ok(!/Example rides/.test(await L.p.innerText('#sheet')), 'no example rides to turn on: only your own');
await done(L);

// ---- 3. Files in on the laptop: each ride kept with the account, its file as it came ----
await tab(L, 3);
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
ok(kept.find((a) => a.name === 'Morning ride')?.sport === 'run', 'the one changed: kept as a run', JSON.stringify(kept.map((a) => [a.name, a.sport])));
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
const said = await toastSays(P);
await P.p.waitForSelector('.head .round.me', { timeout: 20000 });
ok(/Signed in as Sam/.test(said) && !/signin=/.test(P.p.url()), 'Sign in, on the account\'s page, and back in Fitness signed in (the code out of the address)', `${said} ${P.p.url()}`);
await tab(P, 3);
const listed = await P.p.locator('.head .sub').innerText();
ok(/^3 activities/.test(listed) && await P.p.getByText('Wahoo ELEMNT BOLT', { exact: false }).count() >= 1, 'the phone has the laptop\'s three rides', listed);
await P.p.locator('.row', { hasText: 'Wahoo ELEMNT BOLT' }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P, 1200);
const stats = await P.p.locator('#sheet .stat').allInnerTexts();
ok(stats.some((s) => /Normalized Power/.test(s)) && stats.some((s) => /Distance/.test(s)) && await P.p.locator('#sheet .map svg .route').count() > 0, 'opened on the phone, from its file: its figures and its route', `${stats.length} figures`);
ok(!(await P.p.locator('#sheet .section', { hasText: 'Export' }).count()), 'no export on a ride you uploaded: it\'s kept as it came');
await done(P);

// ---- 5. Rhythm set up on the phone (your week), and a new FTP on the laptop from the version before it: put together ----
await tab(P, 2);
ok(!(await P.p.getByText('Or train for an event').count()), 'the Plan tab: Rhythm alone, no event plans');
ok(/Rhythm · not set up/.test(await P.p.locator('.head .sub').innerText()) && await P.p.locator('.rh-ex-bars > div').count() === 7, 'before it starts: an example week, and Set up Rhythm');
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
await P.p.locator('#sheet .rh-next').click(); await settle(P, 900);
const firstWeek = await P.p.locator('#sheet .group .row').count();
ok(firstWeek === 7 && /Your first week/.test(await P.p.locator('#sheet .sheet-top h1').innerText()), 'step 4: the first week, before anything is kept', String(firstWeek));
await P.p.screenshot({ path: `${out}/rhythm-first-week.png` });
await P.p.locator('#sheet .rh-next', { hasText: 'Start Rhythm' }).click(); await settle(P, 900);
const planSub = await P.p.locator('.head .sub').innerText();
const st2 = await waitFor(() => { const s = state(sam); return s?.rhythm ? s : null; });
ok(/^Aerobic block · week 1 of 4/.test(planSub) && st2?.rhythm?.days?.[0] === 60 && st2.rhythm.run === true && st2.rhythm.level === 'regular', 'Rhythm set up on the phone: your week kept with the account', `${planSub} | ${JSON.stringify(st2?.rhythm)}`);
await you(L);
await L.p.locator('#sheet .row', { hasText: 'FTP' }).first().click(); await settle(L, 600);
const ftpWas = parseInt(await L.p.locator('#sheet .stepper output').first().innerText(), 10);
await L.p.getByRole('button', { name: 'More FTP' }).click(); await settle(L, 300);
await L.p.getByRole('button', { name: 'More FTP' }).click();
const st3 = await waitFor(() => { const s = state(sam); return s?.profile?.ftp === ftpWas + 10 ? s : null; });
ok(st3?.rhythm?.run === true && st3.profile.ftp === ftpWas + 10 && st3.profile.set?.includes('ftp'), 'a new FTP on the laptop, which hadn\'t heard of Rhythm: both kept', JSON.stringify(st3 && { rhythm: !!st3.rhythm, ftp: st3.profile.ftp }));
await done(L); await done(L);
await tab(L, 2);
ok(/ block · /.test(await L.p.locator('.head .sub').innerText()), 'and the laptop has the phone\'s Rhythm now', await L.p.locator('.head .sub').innerText());
// (units: kilometres at first, from the browsers' region (en-GB); miles, chosen on the phone: the laptop's in miles too,
// next it's opened)
await you(P);
const unitsFirst = await P.p.locator('#sheet .row', { hasText: 'Units' }).innerText();
await P.p.locator('#sheet .row', { hasText: 'Units' }).click(); await settle(P, 400);
await done(P);
await waitFor(() => state(sam)?.prefs?.units === 'imperial');
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await you(L);
const unitsThen = await L.p.locator('#sheet .row', { hasText: 'Units' }).innerText();
ok(/Kilometres/.test(unitsFirst) && /From your region/.test(unitsFirst) && /Miles/.test(unitsThen) && !/From your region/.test(unitsThen), 'units from your region at first; miles, chosen on the phone: the laptop\'s in miles too', `${unitsFirst} | ${unitsThen}`.replace(/\s+/g, ' '));
await done(L);

// ---- 6. A ride renamed on the phone, and another deleted: so on the laptop ----
await tab(P, 3);
await P.p.locator('.row', { hasText: 'Morning ride' }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P);
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
await tab(L, 3);
await L.p.reload(); await L.p.waitForSelector('.head .round.me');
ok(/^2 activities/.test(await L.p.locator('.head .sub').innerText()) && await L.p.getByText('Saturday loop').count() >= 1, 'and on the laptop: two rides, one renamed', await L.p.locator('.head .sub').innerText());

// ---- 7. The account's page: Fitness among your apps ----
await L.p.goto(`${ACCT}/`);
await L.p.waitForSelector('main .apps', { timeout: 30000 }); await settle(L, 800);
const appCard = await L.p.locator('main .apps > .app', { hasText: 'Fitness' }).innerText().catch(() => '');
ok(/Fitness/.test(appCard) && /2 activities/.test(appCard), 'the account\'s page: Fitness among your apps, with your rides', appCard.replace(/\s+/g, ' '));

// ---- 8. Signing out on the phone: back to the start, its copies gone; the laptop still signed in ----
await P.p.goto(`${FIT}/`); await P.p.waitForSelector('.head .round.me');
await you(P);
await P.p.click('#sheet .row.action.danger');
await P.p.waitForSelector('.welcome #sign-in', { timeout: 20000 });
const cached = await P.p.evaluate(() => new Promise((res) => { const r = indexedDB.open('fitness'); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').count(); q.onsuccess = () => res(q.result); }; r.onerror = () => res(-1); }));
ok(/Signed out\./.test(await P.p.innerText('main')) && cached === 0 && JSON.parse((await api(P, '/api/fitness/me')).body).signedIn === false, 'signed out on the phone: back to Sign in, and no copies of your files left on it', `cached ${cached}`);
await P.p.reload(); await P.p.waitForSelector('.welcome #sign-in');
ok(true, 'and still signed out after a reload');
await L.p.goto(`${FIT}/#activities`); await L.p.waitForSelector('.head .round.me', { timeout: 20000 });
ok(/^2 activities/.test(await L.p.locator('.head .sub').innerText()), 'the laptop, another browser: still signed in');

// ---- 8b. Rhythm on the laptop: the days, then a session or rest each day, with its reason ----
await tab(L, 2);
const circles = await L.p.locator('.rh-circles button').count(), comingUp = await L.p.locator('.section', { hasText: 'Coming up' }).locator('.row:not(.action)').count();
ok(circles === 7 && await L.p.locator('.rh-today').count() === 1 && comingUp === 3 && /% easy/.test(await L.p.locator('.rh-balance .bar').getAttribute('aria-label')), 'the Plan tab: the week at a glance, today first, the next three days', `${circles} ${comingUp}`);
// (a day that isn't the day for it: rest instead, and Rhythm takes it in)
const tomorrowRow = L.p.locator('.section', { hasText: 'Coming up' }).locator('.row:not(.action)').first();
await tomorrowRow.click(); await L.p.waitForSelector('#sheet[open] .sheet-top'); await settle(L, 500);
const dayText = await L.p.locator('#sheet').innerText();
if (/Rest today/.test(dayText)) {
  await L.p.locator('#sheet .row', { hasText: 'Rest today' }).click(); await settle(L, 900);
  const st5 = await waitFor(() => { const s = state(sam); return s && Object.values(s.swaps || {}).includes(null) ? s : null; });
  ok(!!st5, 'a day changed to rest: kept with the account, and the plan takes it in', JSON.stringify(st5?.swaps));
} else ok(/Why/.test(dayText), 'a rest day: why', dayText.slice(0, 80));
await L.p.screenshot({ path: `${out}/rhythm-plan.png`, fullPage: true });
await tab(L, 1);
const todayCard = await L.p.locator('.session').first().innerText();
ok(/Why today:|Rest, and let it sink in/.test(todayCard), 'Today: the session Rhythm chose, and why (or rest, and why)', todayCard.replace(/\s+/g, ' ').slice(0, 160));
await L.p.screenshot({ path: `${out}/rhythm-today.png` });
// (today's session in full: every step with the clock, its watts and how it should feel)
if (await L.p.locator('.session .pill', { hasText: 'Details' }).count()) {
  await L.p.locator('.session .pill', { hasText: 'Details' }).click(); await L.p.waitForSelector('#sheet[open] .ss-step'); await settle(L, 600);
  const stepsN = await L.p.locator('#sheet .ss-step').count(), firstAt = await L.p.locator('#sheet .ss-at').first().innerText();
  ok(stepsN > 2 && firstAt === '0:00' && /Step by step/i.test(await L.p.innerText('#sheet')), 'Details: the session step by step, from 0:00', `${stepsN} steps`);
  await L.p.screenshot({ path: `${out}/rhythm-session.png` });
  await done(L);
}

// (the day's check-in: heavy legs and a poor night ease today, and tomorrow too)
await L.p.locator('.checkin .pill', { hasText: 'Check in' }).click(); await L.p.waitForSelector('#sheet[open] .checkin-q'); await settle(L, 400);
for (const [k, v] of [['sleep', 'Poorly'], ['legs', 'Heavy'], ['mood', 'Low']]) await L.p.locator(`#sheet .seg[aria-label="${k}"] button`, { hasText: v }).click();
await L.p.locator('#sheet .btn', { hasText: 'Done' }).click(); await settle(L, 900);
const checked = await L.p.locator('.checkin.done').innerText().catch(() => '');
ok(/Rhythm has eased today|Tomorrow eased/.test(checked) && /Slept poorly\s+Heavy legs\s+Low motivation/.test(checked), 'checked in: what you said, and what Rhythm changed', checked.replace(/\s+/g, ' '));
await L.p.locator('.checkin.done').screenshot({ path: `${out}/checkin.png` });

// ---- 8c. Garmin Connect on the laptop: a key Garmin won't take, then yours; the morning's ride comes in, the
// Wahoo's ride (on Garmin too) isn't kept twice; one recorded later is fetched by the scheduler and read as the app opens ----
await you(L);
await L.p.locator('#sheet .row', { hasText: 'Garmin Connect' }).click(); await L.p.waitForSelector('#sheet #garmin-key'); await settle(L, 500);
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
await you(L);
await L.p.locator('#sheet .row', { hasText: 'Garmin Connect' }).click(); await L.p.waitForSelector('#sheet .sheet-top'); await settle(L, 500);
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
await L.p.reload(); await L.p.waitForSelector('.head .round.me');
const gRun = await waitFor(() => acts(sam).find((a) => a.id === 'g9003'), 15000);
ok(gRun?.sport === 'run' && gRun.name === 'Evening run' && !rows(`SELECT id FROM fx_garmin_new WHERE user_id = '${sam}'`).length, 'opened: the run read and kept, nothing waiting', JSON.stringify(gRun));
const noLeak = await api(L, '/api/fitness/me');
ok(!noLeak.body.includes(GKEY) && !noLeak.body.includes(GTOKEN), 'the key and Garmin’s token never sent to the page');

// ---- 8d. One kept before files were made smaller (a GPX, as it came): made smaller as the app opens, its figures kept ----
const oldAt = (t0 - 86400 * 9) * 1000, oldGpx = gpxFromActivity({ ...ride, start: oldAt, name: 'Old ride' });
const oldUp = await L.p.evaluate(async ([gpx, at]) => { const f = new FormData(); f.append('meta', JSON.stringify({ id: `i${at}`, start: at, sport: 'ride', name: 'Old ride', file: 'old.gpx', type: 'gpx', sum: { secs: 5400, tss: 70 } }));
  f.append('file', new Blob([gpx]), 'old.gpx'); const r = await fetch('/api/fitness/acts', { method: 'POST', body: f }); return r.status; }, [oldGpx, oldAt]);
await L.p.reload(); await L.p.waitForSelector('.head .round.me');
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
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await you(L);
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
await tab(L, 4);
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
for (const i of [1, 2, 3, 4]) { await tab(L, i); if (await L.p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(i); }
await P.p.setViewportSize({ width: 320, height: 640 }); await settle(P);
if (await P.p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push('welcome');
ok(!wide.length, 'at 320 px wide, no screen scrolls sideways', wide.join(','));
await L.p.screenshot({ path: `${out}/small.png` });
ok(!errs.length, 'no errors on the pages', errs.slice(0, 3).join(' | '));

await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
