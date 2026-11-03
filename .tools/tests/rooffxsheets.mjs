// Fitness's sheets on InFlite's framework, before Today is on it (One roof stage 2, spec §9.2 FXB, S2-D7, S2-D13, S2-D22):
// the kit page (roofkit/serve.mjs) with ?module=/fitness/roof/fitness.js&apps=weather,fitness, then /fitness/ through the frame,
// MAIN's fitness/ and the inflite repo's today/public/ from disk, Fitness's API (/api/fitness/*) stood in here with one
// ride as a GPX file (fitness/sample.js's, written by formats.js), Strava's page and OpenFreeMap's tiles stood in.
// Selectors from roofhooks.mjs (and, inside FXB's own sheets, FXB's own markup: data-k, data-go, data-page). Checked:
//   Activities (lazy): the ride's row; its act sheet with its figures, Share (a pushed page drawing the picture), Rename
//   (a pushed page, PATCH acts/<id> with the new name), the route on a real map from Show on Map, opened to explore in a
//   pushed page; once the sheet closes, no map left in the page (S2-D22);
//   Progress (lazy): Fitness and Form from its tile ([data-sheet=form]); Power, Training and Engine;
//   the plan sheets (lazy): Rhythm set up from Today's card, page by page ([data-sheet=rhythm-setup], Next to Start
//   Rhythm, PUT /api/fitness/me with the rhythm); then a day's session or workout from Today's agenda ("Step by step");
//   Fitness Settings (lazy) from the header's Fitness Settings: every page at [data-page], a Units choice saves only
//   prefs.units in PUT /api/fitness/me (the rest of the record as it came, a key this build doesn't know with it);
//   Strava from a real click: the Devices page's a[data-k=strava] opens Strava's page in a window of its own, at the
//   address POST strava/connect gave; the kit page stays where it was (S2-D13, RI6);
//   no page error, no CSP violation, nothing fetched from /fitness/roof/ that isn't Fitness's.
//   node .tools/tests/rooffxsheets.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as H from './roofhooks.mjs';
import { gpxFromActivity, activityFromGpx } from '../../fitness/formats.js';
import { demo, samples, PROFILE } from '../../fitness/sample.js';
import { summarise } from '../../fitness/load.js';

const [,, S = new URL('./.state', import.meta.url).pathname, OUT = `${S}/out/rooffxsheets`] = process.argv;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const note = (l) => console.log(`NOTE  ${l}`);
const MAIN = new URL('../../', import.meta.url).pathname, IFL = new URL('../../../inflite/', import.meta.url).pathname;
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });

if (!existsSync(`${IFL}today/public/roof/frame.js`)) { ok(false, 'the inflite repo, with the framework, is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
for (const f of ['fitness.js', 'actsview.js', 'progview.js', 'planview.js', 'fxsettings.js']) {
  const { readFileSync } = await import('node:fs');
  if (/^export const STUB = true;/m.test(readFileSync(`${MAIN}fitness/roof/${f}`, 'utf8'))) { console.log(`NOTE  part skipped: fitness/roof/${f} is still B0's stub`); console.log('SKIPPED'); console.log(`FAILS ${fails}`); process.exit(0); }
}
let serveKit, KIT;
try { ({ serveKit, KIT } = await import('./roofkit/serve.mjs')); } catch (e) { ok(false, 'the kit page is here (.tools/tests/roofkit/serve.mjs)', e.message); console.log(`FAILS ${fails}`); process.exit(0); }

// ---- the account: one ride yesterday (its file a GPX, gzipped as the account keeps it), no Rhythm yet, prefs with a key
// this build doesn't know ----
const now = Date.now(), DAY = 86400e3;
const D = demo(now), h0 = D.history.find((x) => x.workout === 'endurance-90' && !x.indoor), ride = samples(h0);
const start = Math.floor((now - DAY) / 3600e3) * 3600e3;
const GPX = gpxFromActivity({ ...ride, start, name: 'Morning Ride' });
const back = activityFromGpx(GPX, 'morning.gpx'), SUM = summarise(back, PROFILE);
const ACT = { id: 'i' + start, start, sport: 'ride', indoor: false, name: 'Morning Ride', device: 'Wahoo ELEMNT BOLT', file: 'morning.gpx', type: 'gpx', gz: true, sum: SUM };
const RECORD = { profile: { ftp: 240, weight: 72, lthr: 158, maxHr: 186, set: ['ftp', 'weight'] }, plan: null, rhythm: null, swaps: {}, feel: {}, workouts: [],
  prefs: { units: 'metric', maps: 'tap', examples: false, onboarded: true, zzz: { kept: 1 } }, extra: { kept: true } };
const STRAVA = 'https://www.strava.com/oauth/authorize?client_id=1&state=kit';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark', locale: 'en-GB', timezoneId: 'Europe/London' });
const st = { puts: [], patches: [], ver: 3, record: JSON.parse(JSON.stringify(RECORD)), errors: [], strava: 0 };
const kit = await serveKit(ctx, { main: MAIN, ifl: IFL });
const j = (r, o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
await ctx.route(/tiles\.openfreemap\.org/, (r) => {
  const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*' };
  if (/\/planet$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
  if (/\.json$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({}) });
  return r.fulfill({ status: 200, contentType: /\.png$/.test(u) ? 'image/png' : 'application/x-protobuf', headers: cors, body: /\.png$/.test(u) ? PNG : Buffer.alloc(0) });
});
await ctx.route(/www\.strava\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Strava</title><h1>STRAVA STAND-IN</h1>' }));
await ctx.route(`${KIT}/api/**`, async (r) => {
  const req = r.request(), u = new URL(req.url()), p = u.pathname.replace(/^\/api\/fitness\//, '');
  if (u.pathname === '/api/session') return j(r, { signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } });
  if (!u.pathname.startsWith('/api/fitness/')) return j(r, {}, 404);
  if (p === 'me' && req.method() === 'PUT') { const body = JSON.parse(req.postData() || '{}'); st.puts.push(body); st.ver++; st.record = body.data; return j(r, { ver: st.ver, data: body.data }); }
  if (p === 'me') return j(r, { signedIn: true, id: 'u-kit-0001', name: 'Sam Taylor', handle: 'sam', ver: st.ver, data: st.record, acts: [ACT], more: false,
    garmin: { on: false }, strava: { on: false, ready: true }, health: { on: false }, times: [], offers: [] });
  if (p === `acts/${ACT.id}` && req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: gzipSync(Buffer.from(GPX)) });
  if (p === `acts/${ACT.id}` && req.method() === 'PATCH') { const body = JSON.parse(req.postData() || '{}'); st.patches.push(body); return j(r, { ok: true }); }
  if (p === 'strava/connect') { st.strava++; return j(r, { url: STRAVA }); }
  if (p === 'today' || p === 'weather' || p === 'push-key') return j(r, {});
  return j(r, {});
});
const p = await ctx.newPage();
p.on('pageerror', (e) => st.errors.push(String(e.message || e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) st.errors.push(m.text()); });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {});
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { try { if (await fn()) return true; } catch (_) {} if (Date.now() - t0 > ms) return false; await p.waitForTimeout(100); } };
const visible = (sel) => p.locator(sel).first().isVisible();
const sheet = (name) => `dialog.ifl-sheet[open][data-sheet=${name}]`;
const closeSheets = async () => { for (let i = 0; i < 4 && await p.locator('dialog.ifl-sheet[open]').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(400); } };

// (the kit page with Fitness's real module and its switch on, then Fitness's address through the framework, as a tap would)
await p.goto(`${KIT}/?module=/fitness/roof/fitness.js&apps=weather,fitness`);
await until(() => p.evaluate(() => !!window.kit?.ready), 10000);
await p.evaluate(() => window.kit.F.nav.go('/fitness/'));
ok(await until(() => visible(`${H.M_FITNESS} ${H.fxSec('today')}`), 20000), 'Fitness mounted on the kit page, Today showing', st.errors.slice(0, 3).join(' | '));
await shot('today');

// ---- Activities: the ride, its sheet, Share, Rename, the map ----
await p.locator(`#hd [role=tab][data-sec=activities]`).first().click();
ok(await until(() => visible(H.fxAct(ACT.id)), 15000), 'Activities (lazy) lists the ride, as .m-fitness [data-k=act][data-id]');
await shot('activities');
await p.locator(H.fxAct(ACT.id)).first().click();
ok(await until(() => visible(`${sheet('act')} .stats`), 15000), 'the ride’s sheet (data-sheet=act): its file read, its figures drawn');
ok(await visible(H.FX_ACT_MAP) && await visible(H.FX_ACT_SHARE), 'its route ([data-k=map]) and Share ([data-k=share])');
await shot('act');
await p.locator(H.FX_ACT_SHARE).first().click();
ok(await until(() => visible(`${sheet('act')} [data-page=share] .share-img`)), 'Share: a pushed page with the picture');
ok(await until(() => p.locator(`${sheet('act')} [data-page=share] .share-img`).evaluate((i) => /^blob:/.test(i.src)), 8000), 'the picture drawn (a blob: image)');
await shot('act-share');
await p.locator(`${sheet('act')} [data-back]`).first().click();
await p.locator(`${sheet('act')} [data-k=rename]`).first().click();
ok(await until(() => visible(`${sheet('act')} [data-page=rename] input[data-k=name]`)), 'Rename: a pushed page with the name');
await p.locator(`${sheet('act')} [data-page=rename] input[data-k=name]`).fill('Hill Loop');
await p.locator(`${sheet('act')} [data-page=rename] [data-k=save]`).click();
ok(await until(() => st.patches.some((x) => x.name === 'Hill Loop')), 'renamed: PATCH acts/<id> { name }', JSON.stringify(st.patches));
ok(await until(() => p.locator(H.fxAct(ACT.id)).first().textContent().then((t) => /Hill Loop/.test(t))), 'the row says the new name');
// the map, from a tap; then the whole sheet to explore; once closed, none left
const mapBtn = p.locator(`${H.FX_ACT_MAP} .map-show`);
if (await mapBtn.count()) {
  await mapBtn.first().click();
  ok(await until(() => p.locator(`${H.FX_ACT_MAP} .map-gl`).count().then((n) => n > 0), 8000), 'Show on Map: the route on a real map');
  ok(await until(() => p.locator(`${H.FX_ACT_MAP} .maplibregl-canvas`).count().then((n) => n > 0), 15000), 'MapLibre drew it (from /weather/vendor/, a NET file)');
  await p.locator(`${H.FX_ACT_MAP} .map-gl`).first().click();
  ok(await until(() => visible(`${sheet('act')} [data-page=map] .map-gl.big`), 8000), 'opened to explore: a pushed page, the whole sheet');
  await shot('act-map');
} else note('this browser can’t draw WebGL 2: the route stays Fitness’s own drawing (no Show on Map)');
await closeSheets();
ok(await until(() => p.evaluate(() => document.querySelectorAll('.maplibregl-canvas, .maplibregl-map').length === 0), 5000), 'the sheet closed, no map left in the page (S2-D22)');

// ---- Progress: Fitness and Form, Power, Training, Engine ----
await p.locator(`#hd [role=tab][data-sec=progress]`).first().click();
ok(await until(() => visible(`${H.fxSec('progress')} .p-tiles`), 15000), 'Progress (lazy) drawn');
await shot('progress');
await p.locator(`${H.fxSec('progress')} .p-form`).first().click();
ok(await until(() => visible(`${sheet('form')} .fband`)), 'Fitness and Form from its tile (data-sheet=form)');
await closeSheets();
for (const [i, name] of ['power', 'training', 'engine'].entries()) {
  await p.locator(`${H.fxSec('progress')} .p-more .row`).nth(i).click();
  ok(await until(() => visible(sheet(name))), `${name[0].toUpperCase() + name.slice(1)} (data-sheet=${name})`);
  await closeSheets();
}

// ---- Rhythm set up from Today, page by page; then a session (or workout) from Today ----
await p.locator(`#hd [role=tab][data-sec=today]`).first().click();
const setUp = p.locator(`${H.fxSec('today')} button`, { hasText: 'Set up Rhythm' });
if (ok(await until(() => setUp.first().isVisible(), 10000), 'Today offers Set up Rhythm (no Rhythm yet)')) {
  await setUp.first().click();
  ok(await until(() => visible(sheet('rhythm-setup'))), 'Rhythm’s setup (data-sheet=rhythm-setup)');
  await shot('rhythm-days');
  const pages = [];
  for (let i = 0; i < 10; i++) {
    const startBtn = p.locator(`${sheet('rhythm-setup')} [data-k=start]:visible`);
    if (await startBtn.count()) { await startBtn.first().click(); break; }
    const next = p.locator(`${sheet('rhythm-setup')} .rh-next:visible`).last();
    await next.click();
    await p.waitForTimeout(300);
    pages.push(await p.locator(`${sheet('rhythm-setup')} .ifs-page:visible`).last().getAttribute('data-page').catch(() => null));
  }
  ok(pages.includes('preview'), 'page by page to the first week ([data-page] each)', pages.join(' › '));
  ok(await until(() => st.puts.some((x) => x.data?.rhythm?.days?.length === 7), 6000), 'Start Rhythm: PUT /api/fitness/me with the rhythm', JSON.stringify(st.puts.map((x) => Object.keys(x.data || {}))));
  ok(await until(() => p.locator('dialog.ifl-sheet[open]').count().then((n) => n === 0)), 'the sheet closed');
  const step = p.locator(`${H.fxSec('today')} button`, { hasText: /^(Step by step|Details)$/ });
  if (await until(() => step.first().isVisible(), 8000)) {
    await step.first().click();
    ok(await until(() => visible(sheet('session')) || visible(sheet('workout'))), 'a day’s session (data-sheet=session) or workout from Today');
    await shot('session');
    await closeSheets();
  } else note('no session in Today’s days just now (all rest): the session sheet not reached from Today');
}

// ---- Fitness Settings: every page; Units saves only prefs.units; Strava from a real click ----
await p.locator(H.HD_SETTINGS).first().click();
ok(await until(() => visible(sheet('fxsettings'))), 'Fitness Settings from the header (data-sheet=fxsettings)');
await shot('settings');
for (const pg of ['numbers', 'units', 'nights', 'devices']) {
  await p.locator(`${sheet('fxsettings')} [data-go=${pg}]`).first().click();
  ok(await until(() => visible(H.fxSettingsPage(pg))), `${pg}: its page (${H.fxSettingsPage(pg)})`);
  if (pg === 'units') {
    const n = st.puts.length;
    await p.locator(`${H.fxSettingsPage('units')} [data-key=units] button[data-value=imperial]`).click();
    ok(await until(() => st.puts.length > n, 6000), 'a Units choice is saved (PUT /api/fitness/me, a moment later)');
    const put = st.puts.at(-1)?.data || {};
    ok(put.prefs?.units === 'imperial' && put.prefs?.maps === undefined && put.prefs?.onboarded === true, 'only prefs.units changed in the record sent', JSON.stringify(put.prefs));
    ok(JSON.stringify(put.prefs?.zzz) === '{"kept":1}' && JSON.stringify(put.extra) === '{"kept":true}', 'a key this build doesn’t know sent back as it came', JSON.stringify({ zzz: put.prefs?.zzz, extra: put.extra }));
    ok(put.profile?.ftp === 240 && put.rhythm?.days?.length === 7, 'the rest of the record as it was (numbers, Rhythm)');
  }
  if (pg === 'devices') {
    const link = p.locator(H.FX_STRAVA).first();
    ok(await until(() => link.getAttribute('href').then((h) => h === STRAVA), 8000), 'Connect Strava: a real link to the address POST strava/connect gave', await link.getAttribute('href').catch(() => 'none'));
    ok(await link.getAttribute('target') === '_blank' && await link.getAttribute('rel') === 'noopener', 'target=_blank rel=noopener');
    await p.waitForTimeout(400);
    ok(st.strava === 1, 'POST strava/connect asked once as Devices opened, not again on each redraw', String(st.strava));
    await shot('settings-devices');
    const before = p.url();
    const [win] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), link.click()]);
    ok(!!win, 'a real click opens Strava in a window of its own (S2-D13)');
    if (win) { await win.waitForLoadState().catch(() => {}); ok(win.url() === STRAVA, 'at Strava’s page', win.url()); await win.close(); }
    ok(p.url() === before, 'the kit page stays where it was (never navigated)', p.url());
  }
  await p.locator(`${sheet('fxsettings')} [data-back]`).first().click();
  await p.waitForTimeout(250);
}
await closeSheets();

// ---- nothing amiss ----
const csp = await p.evaluate(() => window.kit?.state?.csp || []);
ok(csp.length === 0, 'no CSP violation', csp.join(' | '));
ok(st.errors.length === 0, 'no page error', st.errors.slice(0, 5).join(' | '));
const asked = kit.log.filter((x) => /^\/fitness\/roof\//.test(x)).map((x) => x.replace(/\?.*$/, ''));
ok(asked.every((x) => /^\/fitness\/roof\/(fitness|connector|core|idb|fxui|fxcalc|x|todayview|offers|actsview|progview|planview|fxsettings)\.(js|css)$|^\/fitness\/roof\/(fitness|fxviews)\.css$/.test(x)), 'only Fitness’s own module files asked for', [...new Set(asked)].join(' '));
ok(['actsview', 'progview', 'planview', 'fxsettings'].every((f) => asked.includes(`/fitness/roof/${f}.js`)), 'each of FXB’s lazy files fetched as it was first needed');

await b.close();
console.log(`FAILS ${fails}`);
