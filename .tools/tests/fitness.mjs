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

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${CHAT},${FIT},${ACCT}`] });
// a browser: its own cookies and storage (a laptop, a phone: both, to InFlight, a phone, as it opens only on one)
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const pages = [];
async function browser(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', isMobile: true, hasTouch: true, userAgent: IPHONE, acceptDownloads: true });
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
ok(/^Fitness Training, riding first/.test(welcome.text) && /InFlight and Weather/.test(welcome.text) && welcome.btns.join() === 'Sign in' && welcome.tabs === 'none',
  'signed out: what Fitness is, and only Sign in (no tabs, no rides)', `${welcome.text.slice(0, 90)} | ${welcome.btns.join()} | tabs ${welcome.tabs}`);
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
ok(/0 rides of your own/.test(await L.p.innerText('#sheet')) && /Showing only your rides/.test(await L.p.innerText('#sheet')), 'no example rides: only your own (none yet)');
await done(L);

// ---- 3. Files in on the laptop: each ride kept with the account, its file as it came ----
await tab(L, 4);
ok(await L.p.locator('.card.first .btn').innerText() === 'Upload a file' && !(await L.p.$('main .seg')), 'none yet: one button to upload, and where the files are (no filters for nothing)');
await L.p.screenshot({ path: `${out}/first.png` });
await L.p.setInputFiles('#files', FILES);
await L.p.waitForSelector('#sheet[open] .sheet-top', { timeout: 60000 }); await settle(L);
// (first, what's in them, each with what it was, before anything's kept)
const review = await L.p.evaluate(() => [...document.querySelectorAll('#sheet .row.up')].map((r) => `${r.querySelector('b').textContent}=${r.querySelector('select').value}${r.classList.contains('guess') ? '?' : ''}`));
ok(await L.p.locator('#sheet .sheet-top h1').innerText() === '3 activities' && review.join() === 'Morning ride=ride?,Afternoon ride=ride,Indoor ride=ride' && !acts(sam).length,
  'three activities (one from the zip) to check before they\'re kept: each one\'s sport from its file, or worked out and marked to check', review.join());
ok(await L.p.locator('#sheet').getByText(/notes\.txt: Fitness reads FIT/).count() === 1 && await L.p.locator('#sheet').getByText(/Hills\.zwo: a workout, not an activity/).count() === 1, 'a workout file and one it can\'t read: left out, by name, with why');
await L.p.screenshot({ path: `${out}/upload.png` });
await L.p.selectOption('#sheet .row.up.guess select', 'run');
await L.p.locator('#sheet .btn', { hasText: 'Upload 3 activities' }).click();
await L.p.waitForSelector('#sheet[open]', { state: 'detached', timeout: 60000 }).catch(() => {});
await L.p.waitForFunction(() => !document.querySelector('#sheet[open]'), null, { timeout: 60000 }); await settle(L);
const kept = acts(sam);
ok(kept.find((a) => a.name === 'Morning ride')?.sport === 'run', 'the one changed: kept as a run', JSON.stringify(kept.map((a) => [a.name, a.sport])));
ok(kept.length === 3 && kept.map((a) => a.type).join() === 'fit,fit,gpx' && kept.find((a) => a.type === 'gpx')?.size === Buffer.byteLength(gpx) && kept.find((a) => a.file === 'wahoo.fit')?.size === wahoo.length,
  'each ride kept with the account: its file as it came (the zip\'s ride as its FIT)', JSON.stringify(kept.map((a) => [a.file, a.type, a.size])));
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
await tab(P, 4);
const listed = await P.p.locator('.head .sub').innerText();
ok(/^3 activities/.test(listed) && await P.p.getByText('Wahoo ELEMNT BOLT', { exact: false }).count() >= 1, 'the phone has the laptop\'s three rides', listed);
await P.p.locator('.row', { hasText: 'Wahoo ELEMNT BOLT' }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P, 1200);
const stats = await P.p.locator('#sheet .stat').allInnerTexts();
ok(stats.some((s) => /Normalized Power/.test(s)) && stats.some((s) => /Distance/.test(s)) && await P.p.locator('#sheet .map svg .route').count() > 0, 'opened on the phone, from its file: its figures and its route', `${stats.length} figures`);
ok(!(await P.p.locator('#sheet .section', { hasText: 'Export' }).count()), 'no export on a ride you uploaded: it\'s kept as it came');
await done(P);
await tab(P, 3);

// ---- 5. Rhythm set up on the phone (your week), and a new FTP on the laptop from the version before it: put together ----
await tab(P, 2);
ok(!(await P.p.getByText('Or train for an event').count()), 'the Plan tab: Rhythm alone, no event plans');
await P.p.locator('main .btn', { hasText: 'Set up Rhythm' }).click(); await settle(P, 800);
await P.p.getByRole('button', { name: 'More on Monday' }).click();
await P.p.locator('#sheet .seg[aria-label="A run a week"] button', { hasText: 'Yes' }).click();
await P.p.locator('#sheet .btn', { hasText: 'Save' }).click(); await settle(P, 900);
const planSub = await P.p.locator('.head .sub').innerText();
const st2 = await waitFor(() => { const s = state(sam); return s?.rhythm ? s : null; });
ok(/^Rhythm · Aerobic block · week 1 of 4/.test(planSub) && st2?.rhythm?.days?.[0] === 45 && st2.rhythm.run === true, 'Rhythm set up on the phone: your week kept with the account', `${planSub} | ${JSON.stringify(st2?.rhythm)}`);
await you(L);
await L.p.locator('#sheet .row', { hasText: 'FTP' }).first().click(); await settle(L, 600);
await L.p.getByRole('button', { name: 'More FTP' }).click(); await settle(L, 300);
await L.p.getByRole('button', { name: 'More FTP' }).click();
const st3 = await waitFor(() => { const s = state(sam); return s?.profile?.ftp ? s : null; });
ok(st3?.rhythm?.run === true && st3.profile.ftp === PROFILE.ftp + 10, 'a new FTP on the laptop, which hadn\'t heard of Rhythm: both kept', JSON.stringify(st3 && { rhythm: !!st3.rhythm, ftp: st3.profile.ftp }));
await done(L); await done(L);
await tab(L, 2);
ok(/^Rhythm · /.test(await L.p.locator('.head .sub').innerText()), 'and the laptop has the phone\'s Rhythm now', await L.p.locator('.head .sub').innerText());
// (miles, chosen on the phone: the laptop's in miles too, next it's opened)
await you(P);
await P.p.locator('#sheet .row', { hasText: 'Units' }).click(); await settle(P, 400);
await done(P);
await waitFor(() => state(sam)?.prefs?.units === 'imperial');
await L.p.reload(); await L.p.waitForSelector('.head .round.me'); await you(L);
ok(/Miles/.test(await L.p.locator('#sheet .row', { hasText: 'Units' }).innerText()), 'miles, chosen on the phone: the laptop\'s in miles too');
await done(L);

// ---- 6. A ride renamed on the phone, and another deleted: so on the laptop ----
await tab(P, 4);
await P.p.locator('.row', { hasText: 'Morning ride' }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P);
await P.p.locator('#sheet').getByRole('button', { name: 'Rename' }).click(); await settle(P);
await P.p.fill('#sheet input.field', 'Saturday loop');
await P.p.getByRole('button', { name: 'Save' }).click(); await settle(P, 800);
await done(P);
await P.p.locator('.row', { hasText: 'Garmin' }).first().click();
await P.p.waitForSelector('#sheet[open] .stat', { timeout: 30000 }); await settle(P);
await P.p.locator('#sheet .row', { hasText: 'Delete' }).click(); await settle(P, 300);
await P.p.locator('#sheet .row', { hasText: 'Delete' }).click(); await settle(P, 1200);
const left = acts(sam);
ok(left.length === 2 && left.some((a) => a.name === 'Saturday loop') && !left.some((a) => a.file === '123_ACTIVITY.fit'), 'renamed and deleted with the account', JSON.stringify(left.map((a) => a.name)));
await tab(L, 4);
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
const weekRows = await L.p.locator('.section', { hasText: 'This week' }).first().locator('.row').count();
ok(weekRows === 7 && await L.p.locator('.section', { hasText: 'Coming up' }).count() === 1, 'this week day by day, and the days coming up', String(weekRows));
await L.p.screenshot({ path: `${out}/rhythm-plan.png`, fullPage: true });
await tab(L, 1);
const todayCard = await L.p.locator('.session').first().innerText();
ok(/Why today:|Rest, and let it sink in/.test(todayCard), 'Today: the session Rhythm chose, and why (or rest, and why)', todayCard.replace(/\s+/g, ' ').slice(0, 160));
await L.p.screenshot({ path: `${out}/rhythm-today.png` });

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
