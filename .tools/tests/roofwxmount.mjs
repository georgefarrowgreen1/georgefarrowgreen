// Weather's real module on InFlite's framework, before Today is on it (One roof, spec §5, §7.1, §9.4 WX): FW's kit page
// (roofkit/serve.mjs) at http://kit.test with ?module=/weather/roof/weather.js, MAIN's weather/ and the inflite repo's
// today/public/ from disk, the third parties stood in as wxhub.mjs does (mocks/wxappdata.mjs), and Weather's own API
// (/api/weather/where, warnings, obs, me) and /api/session by a small stand-in here. Selectors only from roofhooks.mjs
// (and, inside WX's own Places sheet and radar card, WX's own markup). Checked:
//   the module mounts, its four sections show (B0's view stubs until WV's land), the address follows the section;
//   the header: the place as title, its compact title, the line; ▾ opens Places: one-tap rows with the current one ticked
//   and each with its temperature, switching, Find a place (stood-in geocoding), Edit (Move Up with the live line,
//   Delete), Use My Location with a granted (stood-in) position;
//   a link's place (?lat&lon&name): one you have, or one in the account's (wx:acct), switches with no question; a new one
//   asks (Just Look shows it unsaved; Add keeps it);
//   a settings change sends PUT /api/weather/me with the body app.js would send, glass kept;
//   a 401 from /api/weather/me while the session's still signed in: nobody signed out, "Couldn’t sync with your account";
//   Radar, on a phone (hasTouch, isMobile): html.ifl-fill, a drag and a pinch move and zoom the map (its state()), a tap
//   gives a reading, the window never scrolls; under data-theme="dark" on a light phone, the map's dark style, and set
//   light while it shows, made again in the day style with its listeners not doubled; offline before the first Radar,
//   "Radar needs a connection"; after 5 minutes out of sight (the page's clock stood in) the map let go, made afresh;
//   unmount (the frame's destroy) leaves no window or document listener the module added (instrumented
//   addEventListener/removeEventListener; the reused files' own listeners from their first import, one each of
//   charts.js's resize, data.js's storage and radarrain.js's visibilitychange, are theirs, not the mount's).
//   (pull's { signedIn: false } and the PUT body against app.js's mine() are roofwxcore's unit cases.)
// Loading on open (stage 2 §4.5, part 1b): Now's first open fetches none of days, warnings, places, wxsettings and
//   wxdetail; each is fetched once when first wanted; Weather Settings (a page, a Units change) through lazy wxsettings.js;
//   a cold #settings address opens it too. A slow file: a skeleton (a section) or a skeleton sheet; two quick taps open one
//   sheet; one closed while it waits, or asked for just before the person left Weather, never opens. A failing file: Try
//   Again asks for it afresh (?retry=<n>, j0's frame), a sheet's toast, the next tap opens it.
// And two parts that run once their files are real (no STUB export), else say "part skipped: <file> is still B0's stub":
//   the views part (WV: now.js, days.js, warnings.js, wxui.js): Now's hero, the warnings slot, the credits sheet; 16 Days
//   with Days by and a day's sheet; Warnings and a warning's sheet, and both empty states; a detail sheet from a tile;
//   the settings part (WS: wxsettings.js): Weather Settings opened at every page through §3.14's hooks, a Units change
//   saved, glass kept in the PUT body, the Notifications row to You.
//   node .tools/tests/roofwxmount.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as H from './roofhooks.mjs';
import * as WXF from './mocks/wxappdata.mjs';

const [,, S = new URL('./.state', import.meta.url).pathname, OUT = `${S}/out/roofwxmount`] = process.argv;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const note = (l) => console.log(`NOTE  ${l}`);
const MAIN = new URL('../../', import.meta.url).pathname, IFL = process.env.ROOF_IFL ? process.env.ROOF_IFL.replace(/\/?$/, '/') : new URL('../../../inflite/', import.meta.url).pathname;
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });

if (!existsSync(`${IFL}today/public/roof/frame.js`)) { ok(false, 'the inflite repo, with the framework, is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
let serveKit, KIT;
try { ({ serveKit, KIT } = await import('./roofkit/serve.mjs')); } catch (e) { ok(false, 'FW’s kit page is here (.tools/tests/roofkit/serve.mjs)', e.message); console.log(`FAILS ${fails}`); process.exit(0); }

const now = Date.now();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const SYNCED = ['temp', 'wind', 'precip', 'pressure', 'clock', 'glass', 'tune', 'commute', 'extras', 'activities', 'layout', 'solar'];
const MODULE = '/weather/roof/weather.js';
const PLACES = [{ name: 'London', region: 'England, United Kingdom', lat: 51.5072, lon: -0.1276 }, { name: 'Leeds', region: 'England, United Kingdom', lat: 53.8, lon: -1.55 }, { name: 'Bath', region: 'England, United Kingdom', lat: 51.38, lon: -2.36 }];
const WARNING = (lat, lon) => ({ id: 'mo-1', src: 'meteoalarm', via: 'MeteoAlarm', issuer: 'Met Office', level: 2, type: 1, event: 'Yellow wind warning', headline: 'Strong winds', description: 'Gusts of 50 to 60 mph.',
  onset: new Date(now - 3600e3).toISOString(), expires: new Date(now + 20 * 3600e3).toISOString(), areas: [[lat - 0.5, lon - 0.5, lat - 0.5, lon + 0.5, lat + 0.5, lon + 0.5, lat + 0.5, lon - 0.5, lat - 0.5, lon - 0.5]] });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--unsafely-treat-insecure-origin-as-secure=${KIT}`] });
// (kit.test counted as secure, as inflite.ai is: My Location's position is only given to a secure page)

// ---- a phone at the kit: Weather's third parties and API stood in, its listeners counted ----
async function phone({ colorScheme = 'dark', theme = null, saveData = false, geo = { latitude: 55.953, longitude: -3.188 } } = {}) {
  // Saved-place scenarios start without location permission. Grant it explicitly
  // in the My Location scenario: Weather now requests it automatically on open.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme, permissions: [], geolocation: geo, locale: 'en-GB', timezoneId: 'Europe/London' });
  // (me: 'down' till the links are done, so the account's copy in wx:acct keeps York, as an account would that has it;
  // then 'ok'; '401' for the sign-in that's gone at Weather's end)
  const st = { puts: [], me: 'down', ver: 1, errors: [], geocode: 0 };
  if (saveData) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }); });
  await ctx.addInitScript(({ places, theme }) => {
    try {
      if (!localStorage.getItem('wx:places')) {
        localStorage.setItem('wx:places', JSON.stringify(places)); localStorage.setItem('wx:cur', '0');
        localStorage.setItem('wx:settings', JSON.stringify({ glass: 'clear', temp: 'c' }));
        localStorage.setItem('wx:acct', JSON.stringify({ id: 'u-kit-0001', name: 'Sam Taylor', handle: 'sam', email: '', emailOk: false, photoAt: null, devices: [], ver: 1,
          snap: { places: ['51.51,-0.13', '53.80,-1.55', '51.38,-2.36', '53.96,-1.08'], settings: 'null', notify: null } }));
      }
      if (theme) localStorage.setItem('today:appearance', theme);
    } catch (_) {}
    // every window and document listener, with where it was added from (a module's: a /weather/ file in its stack)
    const live = (window.__wxListeners = []);
    for (const [who, target] of [['window', window], ['document', document]]) {
      const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
      target.addEventListener = function (type, fn, o) {
        const from = (new Error().stack || '').split('\n').slice(2).map((l) => (/(\/weather\/[\w/.-]+\.js)/.exec(l) || [])[1]).filter(Boolean);
        if (from.length && !(o && o.once)) live.push({ who, type, fn, from: from[0], at: from.join(' < ') });
        return add(type, fn, o);
      };
      target.removeEventListener = function (type, fn, o) { const i = live.findIndex((x) => x.who === who && x.type === type && x.fn === fn); if (i >= 0) live.splice(i, 1); return remove(type, fn, o); };
    }
  }, { places: PLACES, theme });
  await serveKit(ctx, { main: MAIN, ifl: IFL });
  const j = (r, o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
  await ctx.route(/open-meteo\.com|bigdatacloud|nominatim/, (r) => {
    const u = r.request().url();
    if (u.includes('ensemble-api')) return j(r, WXF.ensemble(now, { rainIn: 90 }));
    if (u.includes('air-quality')) return j(r, WXF.air(now));
    if (u.includes('marine-api')) return j(r, WXF.marine(now, u));
    if (u.includes('archive-api')) return j(r, WXF.archive(now));
    if (u.includes('geocoding')) { st.geocode++; return j(r, { results: /name=Par/.test(u) ? [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, country: 'France', country_code: 'FR', admin1: 'Île-de-France' }] : [] }); }
    if (u.includes('bigdatacloud')) return j(r, { city: 'Edinburgh', locality: 'Edinburgh', countryCode: 'GB', principalSubdivision: 'Scotland' });
    if (u.includes('nominatim')) return j(r, { address: { city: 'Edinburgh', country_code: 'gb', state: 'Scotland' } });
    if (u.includes('models=')) return j(r, WXF.models(now, { rainIn: 90 }));
    if (u.includes('previous-runs-api') || u.includes('past_hours') || u.includes('forecast_minutely_15=9') || u.includes('hourly=precipitation%2Csnowfall') || u.includes('hourly=temperature_2m%2Cwind')) return r.fulfill({ status: 503, body: '' });
    if (u.includes('current=temperature_2m%2Cweather_code%2Cis_day')) { const n = (new URL(u).searchParams.get('latitude') || '').split(',').length; const one = { current: { temperature_2m: 11, weather_code: 3, is_day: 1 }, utc_offset_seconds: 0 }; return j(r, n > 1 ? Array.from({ length: n }, () => one) : one); }
    return j(r, WXF.forecast(now, { rainIn: 90 }));
  });
  await ctx.route(/api\.rainviewer\.com/, (r) => j(r, { host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: Math.floor(now / 600e3) * 600 - (12 - k) * 600, path: `/v2/radar/f${k}` })), nowcast: [] } }));
  await ctx.route(/tilecache\.rainviewer\.com|tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG }));
  await ctx.route(/tiles\.openfreemap\.org/, (r) => {
    const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*' };
    if (/\/planet$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
    if (/\.json$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({}) });
    return r.fulfill({ status: 200, contentType: /\.png$/.test(u) ? 'image/png' : 'application/x-protobuf', headers: cors, body: /\.png$/.test(u) ? PNG : Buffer.alloc(0) });
  });
  // Weather's own API, as the hub forwards it, and the session
  await ctx.route(`${KIT}/api/**`, async (r) => {
    const req = r.request(), u = new URL(req.url()), p = u.pathname;
    if (p === '/api/session') return j(r, { signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } });
    if (p === '/api/weather/where') return j(r, { name: 'London', region: 'England', lat: 51.5072, lon: -0.1276 });
    if (p === '/api/weather/obs') return j(r, {}, 404);
    if (p === '/api/weather/warnings') {
      const lat = Number(u.searchParams.get('lat')), lon = Number(u.searchParams.get('lon'));
      if (Math.abs(lat - 51.38) < 0.05) return j(r, {}, 404);                    // (Bath: no official feed answers: null)
      if (Math.abs(lat - 51.51) < 0.05) return j(r, { warnings: [WARNING(lat, lon)] });
      return j(r, { warnings: [] });
    }
    if (p === '/api/weather/me') {
      if (st.me === '401') return j(r, { error: 'Sign in first.' }, 401);
      if (st.me === 'down') return j(r, { error: 'Try again later.' }, 503);
      const data = { places: PLACES.concat([{ name: 'York', region: 'England', lat: 53.96, lon: -1.08 }]).map(({ name, region, lat, lon }) => ({ name, region, lat, lon })), settings: {}, notify: { places: [], brief: null, briefAt: '07:00', email: { warn: false, brief: false } } };
      if (req.method() === 'PUT') { const body = JSON.parse(req.postData() || '{}'); st.puts.push(body); st.ver++; return j(r, { ver: st.ver, data: body.data }); }
      return j(r, { signedIn: true, id: 'u-kit-0001', name: 'Sam Taylor', handle: 'sam', ver: st.ver, data: st.lastData || data, devices: [] });
    }
    return j(r, {}, 404);
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => st.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebGL|GPU stall|swiftshader/i.test(m.text())) st.errors.push(m.text()); });
  return { ctx, p, st };
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (_) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((ok) => setTimeout(ok, 100)); } };
const text = (p, sel) => p.locator(sel).first().textContent({ timeout: 3000 }).catch(() => '');
const go = (p, path) => p.evaluate((path) => window.kit.F.nav.go(path), path);
const stored = (p, k) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), k);
async function openWeather(p, path = '/weather/') {
  await p.goto(`${KIT}/?module=${MODULE}`);
  await until(() => p.evaluate(() => !!window.kit?.ready), 10000);
  await go(p, path);
  return until(() => visible(p, `${H.M_WEATHER} ${H.wxSec('now')}`) || visible(p, `${H.M_WEATHER} ${H.WX_SEC}:not([hidden])`), 15000);
}
async function sheetClosed(p, sel) { return until(async () => !(await visible(p, `${sel}[open]`)), 4000); }
async function revealDetails(p) {
  const summary = p.locator(`${H.wxSec('now')} [data-card="right-now"] details:not([open]) > summary`);
  if (await summary.count()) await summary.first().click();
}

// ===================== 1. mount, sections, header, Places, links, settings, 401 =====================
{
  const { p, st, ctx } = await phone();
  ok(await openWeather(p), 'the module mounts in main#m-weather and Now shows (§5.1)');
  ok(await p.locator(`${H.M_WEATHER} ${H.WX_SEC}`).count() === 4, 'four sections: Now, 16 Days, Radar, Warnings');
  const stubs = await p.evaluate(async () => Object.fromEntries(await Promise.all(['now', 'days', 'warnings', 'wxui', 'wxsettings'].map(async (f) => [f, (await import(`/weather/roof/${f}.js`)).STUB === true]))));
  note(`B0 stubs still in: ${Object.entries(stubs).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
  ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'London'), 'the header’s title is the place', await text(p, H.HD_TITLE));
  ok(await until(async () => /\d+°/.test(await text(p, H.HD_LINE))), 'the header’s line: the temperature and what it’s doing', await text(p, H.HD_LINE));
  for (const id of ['days', 'radar', 'warnings', 'now']) {
    await p.locator(H.hdSec(id)).click();
    ok(await until(() => visible(p, H.wxSec(id))), `section ${id} shows`);
    ok(await until(async () => (await p.evaluate(() => location.pathname + location.hash)) === (id === 'now' ? '/weather/' : `/weather/#${id}`)), `the address follows: ${id}`);
    // Radar keeps the header at its entering size (header.js's fill contract).
    if (id === 'radar') ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'London' && await p.evaluate(() => document.documentElement.classList.contains('ifl-fill'))), 'Radar preserves the entering title and fills its viewport', await text(p, H.HD_TITLE));
  }
  await shot(p, '1-now');

  // ---- Places ----
  await p.locator(H.HD_PICK).click();
  ok(await until(() => visible(p, H.PLACES_SHEET)), 'the title’s ▾ opens Places');
  ok(await p.locator(H.PLACE_ROW).count() === 3, 'your places as rows, three of them');
  ok(await p.locator(H.PLACE_CURRENT).getAttribute('data-place') === '0', 'the current one ticked (aria-current)');
  ok(await until(async () => (await p.locator(H.PLACE_ROW).allTextContents()).filter((t) => /-?\d+°/.test(t)).length === 3), 'each with its temperature', (await p.locator(H.PLACE_ROW).allTextContents()).join(' | '));
  await shot(p, '2-places');
  await p.locator(H.placeRow(1)).click();
  ok(await sheetClosed(p, H.PLACES_SHEET) && await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Leeds'), 'one tap: the sheet goes and Leeds shows');
  ok((await stored(p, 'wx:cur')) === 1, 'wx:cur kept');
  await p.locator(H.HD_PICK).click(); await until(() => visible(p, H.PLACES_SHEET));
  ok(await p.locator(H.PLACE_CURRENT).getAttribute('data-place') === '1', 'Leeds ticked now');
  await p.locator(H.PLACES_FIND).fill('Paris');
  ok(await until(() => visible(p, H.PLACES_FOUND)), 'Find a place: the stand-in’s Paris found');
  await p.locator(H.PLACES_FOUND).first().click();
  ok(await sheetClosed(p, H.PLACES_SHEET) && await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Paris'), 'chosen: Paris shows');
  ok((await stored(p, 'wx:places')).map((x) => x.name).join() === 'London,Leeds,Bath,Paris', 'and is kept with your places');
  // Edit: Move Up with the live line, Delete
  await p.locator(H.HD_PICK).click(); await until(() => visible(p, H.PLACES_SHEET));
  await p.locator(H.PLACES_EDIT).click();
  await p.locator(`${H.placeRow(3)} ${H.PLACE_UP}`).click();
  ok((await stored(p, 'wx:places')).map((x) => x.name).join() === 'London,Leeds,Paris,Bath', 'Move Up: Paris above Bath');
  ok(/Paris moved to 3 of 4/.test(await p.locator(`${H.PLACES_SHEET} [aria-live]`).first().textContent()), 'said in the live line', await p.locator(`${H.PLACES_SHEET} [aria-live]`).first().textContent());
  ok(await p.locator(H.PLACE_CURRENT).getAttribute('data-place') === '2', 'the one on show still ticked where it went');
  await p.locator(`${H.placeRow(3)} ${H.PLACE_DELETE}`).click();
  ok((await stored(p, 'wx:places')).map((x) => x.name).join() === 'London,Leeds,Paris', 'Delete: Bath gone');
  await p.locator(H.PLACES_EDIT).click();
  // My Location (a granted, stood-in position: Edinburgh)
  await ctx.grantPermissions(['geolocation'], { origin: KIT });
  await p.locator(H.PLACES_LOCATE).click();
  ok(await sheetClosed(p, H.PLACES_SHEET, 8000), 'Use My Location: the sheet goes once it’s found');
  ok(await until(async () => (await stored(p, 'wx:places'))[0]?.gps === true), 'My Location first in the list', JSON.stringify(await stored(p, 'wx:places')));
  ok(await until(async () => /Edinburgh|My Location/.test(await text(p, H.HD_TITLE))), 'and shown', await text(p, H.HD_TITLE));

  // ---- a link's place ----
  const confirmUp = () => visible(p, H.CONFIRM_SHEET);
  await go(p, '/weather/?lat=53.801&lon=-1.551&name=Leeds#days');
  ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Leeds') && !(await confirmUp()), 'a link to a place you have switches to it, asking nothing');
  ok(await until(() => visible(p, H.wxSec('days'))), 'at the section it named');
  await go(p, '/weather/?lat=53.96&lon=-1.08&name=York');
  ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'York') && !(await confirmUp()), 'one of the account’s places (wx:acct) switches too, asking nothing');
  await go(p, '/weather/?lat=40.4168&lon=-3.7038&name=Madrid');
  ok(await until(confirmUp), 'a new place asks: Add “Madrid” to your places?');
  ok(/Madrid/.test(await text(p, `${H.CONFIRM_SHEET} h2`)), 'the sheet names it', await text(p, `${H.CONFIRM_SHEET} h2`));
  await shot(p, '3-confirm');
  await p.locator(H.CONFIRM_LOOK).click();
  ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Madrid'), 'Just Look: Madrid shows');
  ok(!(await stored(p, 'wx:places')).some((x) => x.name === 'Madrid'), 'and isn’t kept');
  await go(p, '/weather/?lat=59.91&lon=10.75&name=Oslo');
  ok(await until(confirmUp), 'another new one asks');
  await p.locator(H.CONFIRM_ADD).click();
  ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Oslo') && (await stored(p, 'wx:places')).some((x) => x.name === 'Oslo'), 'Add: Oslo shows and is kept');

  // ---- settings: the PUT app.js would send, glass kept ----
  st.me = 'ok';
  const before = st.puts.length;
  await p.evaluate(async () => (await import('/weather/roof/core.js')).saveSettings({ temp: 'f' }));
  ok(await until(() => st.puts.length > before, 6000), 'a settings change sends PUT /api/weather/me');
  const put = st.puts.at(-1) || {};
  ok(put.data && JSON.stringify(Object.keys(put.data.settings || {})) === JSON.stringify(SYNCED), 'its settings are app.js’s SYNCED keys, in order', JSON.stringify(Object.keys(put.data?.settings || {})));
  ok(put.data?.settings?.glass === 'clear' && put.data.settings.temp === 'f', 'glass kept as "clear", the change in it', JSON.stringify(put.data?.settings));
  const want = (await stored(p, 'wx:places')).filter((x) => !x.gps && !x.approx && !x.standin).map(({ name, region, lat, lon }) => ({ name, region: region || '', lat, lon }));
  ok(JSON.stringify(put.data?.places) === JSON.stringify(want), 'its places: yours, without My Location', JSON.stringify(put.data?.places));
  ok(put.data?.notify && 'briefAt' in put.data.notify && Number.isFinite(put.base), 'notify and the base version, as app.js sends them');
  ok((await stored(p, 'wx:settings'))?.glass === 'clear', 'wx:settings keeps glass', JSON.stringify(await stored(p, 'wx:settings')));
  // (the PUT body key for key against app.js's own mine() is roofwxcore's unit case)
  if (!stubs.wxsettings) {
    // ===================== the settings part (WS) =====================
    for (const page of H.WX_PAGES) {
      await p.locator(H.HD_SETTINGS).click();
      const up = await until(() => visible(p, H.WXSETTINGS));
      await p.locator(H.wxGo(page)).click().catch(() => {});
      ok(up && await until(() => visible(p, H.wxPage(page))), `Weather Settings: the ${page} page opens`);
      if (page === 'units') {
        const n = st.puts.length;
        await p.locator(`${H.wxSetting('temp')} ${H.segValue('c')}`).click().catch(() => {});
        ok(await until(() => st.puts.length > n, 6000), 'a Units change saved (PUT /api/weather/me)');
        ok(st.puts.at(-1)?.data?.settings?.temp === 'c' && st.puts.at(-1)?.data?.settings?.glass === 'clear', 'with glass kept', JSON.stringify(st.puts.at(-1)?.data?.settings));
      }
      await p.keyboard.press('Escape'); await sheetClosed(p, H.WXSETTINGS);
    }
    await p.locator(H.HD_SETTINGS).click(); await until(() => visible(p, H.WXSETTINGS));
    ok(await p.locator(H.WX_NOTIFY_ROW).count() === 1, 'the Notifications row goes to You’s Weather Notifications');
    await shot(p, '6-settings');
    await p.keyboard.press('Escape'); await sheetClosed(p, H.WXSETTINGS);
  } else console.log('NOTE  part skipped: weather/roof/wxsettings.js is still B0’s stub');

  // ---- a 401 while the session's still signed in ----
  st.me = '401';
  const checks = await p.evaluate(() => window.kit.state.checks);
  await p.evaluate(async () => (await import('/weather/roof/core.js')).saveSettings({ wind: 'kmh' }));
  ok(await until(async () => /Couldn’t sync with your account/.test(await p.locator(H.TOAST).allTextContents().then((a) => a.join(' ')).catch(() => '')), 8000), 'a 401 from /api/weather/me: “Couldn’t sync with your account”');
  ok(await p.evaluate(() => window.kit.state.lost) === 0, 'and nobody signed out (fw.session.lost asked the session first)');
  ok(await p.evaluate(() => window.kit.state.checks) > checks, 'the session was asked');
  ok(await p.evaluate(async () => (await import('/weather/roof/core.js')).S.error) === 'Couldn’t sync with your account', 'core’s error says so too');
  st.me = 'ok';
  ok(st.errors.length === 0, 'no page errors', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ===================== 1b. loading on open (stage 2 S2-D5, §4.5, C4) =====================
// With Save Data, Now's first open fetches none of the lazy five (days, warnings, places, wxsettings, wxdetail); each is fetched once,
// the first time it's wanted (16 Days, Warnings, the ▾'s Places, a Right now tile and then the credits line, Weather
// Settings), and never again; the settings part opens through lazy wxsettings.js. (Nothing here imports a module file
// itself: the counts are the module's own asks.)
{
  const { p, st, ctx } = await phone({ saveData: true });
  const LAZY = ['days', 'warnings', 'places', 'wxsettings', 'wxdetail'], asked = {};
  p.on('request', (r) => { const m = /\/weather\/roof\/(\w+)\.js$/.exec(new URL(r.url()).pathname); if (m) asked[m[1]] = (asked[m[1]] || 0) + 1; });
  const n = (f) => asked[f] || 0;
  ok(await openWeather(p), 'Weather mounts (loading on open)');
  ok(await until(() => visible(p, `${H.wxSec('now')} ${H.WX_HERO}`)), 'Now’s hero drawn');
  await until(() => visible(p, H.DETAIL_TILE), 8000);
  await p.waitForTimeout(1500);
  ok(LAZY.every((f) => n(f) === 0), 'first open: none of days, warnings, places, wxsettings, wxdetail fetched', JSON.stringify(asked));
  ok(['weather', 'now', 'wxui', 'wxwarn', 'core', 'radarview'].every((f) => n(f) === 1), 'the static graph once each (wxwarn.js among it)', JSON.stringify(asked));
  // 16 Days: days.js once, its rows drawn; there and back, not again
  await p.locator(H.hdSec('days')).click();
  ok(await until(async () => (await p.locator(H.DAY_ROW).count()) >= 10), '16 Days drawn once its file is in', String(await p.locator(H.DAY_ROW).count()));
  ok(n('days') === 1, 'days.js fetched once, on 16 Days’ first show', JSON.stringify(asked));
  await p.locator(H.DAY_ROW).nth(1).click();
  ok(await until(() => visible(p, `${H.DAY_SHEET}[open]`)), 'a day’s sheet (openDay through the same file)');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.DAY_SHEET);
  // Warnings: warnings.js once, a warning in full through it
  await p.locator(H.hdSec('warnings')).click();
  ok(await until(() => visible(p, H.warningRow(0))), 'Warnings drawn once its file is in (London’s in force)');
  await p.locator(H.warningRow(0)).click();
  ok(await until(() => visible(p, `${H.WARNING_SHEET}[open]`)), 'a warning opens in full');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.WARNING_SHEET);
  ok(n('warnings') === 1, 'warnings.js fetched once', JSON.stringify(asked));
  for (const id of ['now', 'days', 'warnings', 'now']) { await p.locator(H.hdSec(id)).click(); await until(() => visible(p, H.wxSec(id))); }
  ok(n('days') === 1 && n('warnings') === 1, 'there and back again: neither fetched again', JSON.stringify(asked));
  // Places: places.js on the ▾'s first tap, not the second
  for (let k = 0; k < 2; k++) {
    await p.locator(H.HD_PICK).click();
    ok(await until(() => p.locator(H.PLACE_ROW).count().then((c) => c === 3)), `Places opens with your places (${k ? 'again' : 'first time'})`);
    await p.keyboard.press('Escape'); await sheetClosed(p, H.PLACES_SHEET);
  }
  ok(n('places') === 1, 'places.js fetched once', JSON.stringify(asked));
  // a Right now tile, then the credits line: wxdetail.js once for both
  await revealDetails(p);
  await p.locator(H.DETAIL_TILE).first().click();
  ok(await until(() => p.locator(`${H.DETAIL_SHEET}[open] .wx-detail`).count().then((c) => c === 1)), 'a Right now tile opens its detail sheet');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.DETAIL_SHEET);
  await p.locator(H.WX_CREDITS).first().scrollIntoViewIfNeeded().catch(() => {});
  await p.locator(H.WX_CREDITS).first().click();
  ok(await until(() => p.locator(`${H.CREDITS_SHEET}[open] .wx-credits-sheet`).count().then((c) => c === 1)), 'the credits line opens the credits sheet');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.CREDITS_SHEET);
  await p.locator(H.DETAIL_TILE).nth(1).click();
  ok(await until(() => visible(p, `${H.DETAIL_SHEET}[open]`)), 'another tile’s sheet');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.DETAIL_SHEET);
  ok(n('wxdetail') === 1, 'wxdetail.js fetched once, for the detail and the credits sheets', JSON.stringify(asked));
  // Weather Settings, through lazy wxsettings.js: a page and a Units change saved
  ok(n('wxsettings') === 0, 'wxsettings.js not fetched till Weather Settings is wanted', JSON.stringify(asked));
  st.me = 'ok';
  await p.locator(H.HD_SETTINGS).click();
  ok(await until(() => visible(p, H.WXSETTINGS)), 'Weather Settings opens (its file through fw.lazy)');
  await p.locator(H.wxGo('units')).click().catch(() => {});
  ok(await until(() => visible(p, H.wxPage('units'))), 'its Units page');
  const before = st.puts.length;
  await p.locator(`${H.wxSetting('temp')} ${H.segValue('f')}`).click().catch(() => {});
  ok(await until(() => st.puts.length > before, 6000), 'a Units change saved (PUT /api/weather/me)');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.WXSETTINGS);
  await p.locator(H.HD_SETTINGS).click(); await until(() => visible(p, H.WXSETTINGS));
  await p.keyboard.press('Escape'); await sheetClosed(p, H.WXSETTINGS);
  ok(n('wxsettings') === 1, 'wxsettings.js fetched once', JSON.stringify(asked));
  ok(LAZY.every((f) => n(f) === 1), 'each of the lazy five fetched exactly once', JSON.stringify(asked));
  await shot(p, '1b-lazy');
  ok(st.errors.length === 0, 'no page errors (loading on open)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}
// (a slow file: a section shows a skeleton till it's in; a sheet, a skeleton sheet of its name, swapped for the real one;
// two quick taps, one sheet; one closed while it waits, or asked for just before the person left Weather, nothing opens)
{
  // Keep this a cold-load case: the module otherwise warms sections during idle time before this tap.
  const { p, st, ctx } = await phone({ saveData: true });
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  for (const f of ['days', 'wxdetail', 'places', 'wxsettings']) await p.route(`${KIT}/weather/roof/${f}.js`, async (r) => { await sleep(1200); r.fallback(); });
  await openWeather(p);
  await revealDetails(p);
  await until(() => visible(p, H.DETAIL_TILE), 8000);
  const sawDaysLoading = p.locator(`${H.wxSec('days')} .ifl-skeleton`).waitFor({ state: 'visible', timeout: 6000 }).then(() => true, () => false);
  await p.locator(H.hdSec('days')).click();
  ok(await sawDaysLoading, '16 Days, its file slow: a skeleton in the section');
  ok(await until(async () => (await p.locator(H.DAY_ROW).count()) >= 10, 6000), 'then its rows, once it’s in');
  ok(await p.locator(`${H.wxSec('days')} .ifl-skeleton`).count() === 0, 'the skeleton gone');
  await p.locator(H.hdSec('now')).click(); await until(() => visible(p, H.wxSec('now')));
  // (two taps on the tile before anything modal is up: the second gets the first's promise)
  await p.evaluate((sel) => { const t = document.querySelector(sel); t.click(); t.click(); }, H.DETAIL_TILE);
  ok(await until(() => p.locator(`${H.DETAIL_SHEET}[open] .ifl-skeleton`).count().then((c) => c === 1), 1000), 'a tile tapped twice, wxdetail.js slow: one skeleton sheet (data-sheet=detail) at once');
  ok(await until(() => p.locator(`${H.DETAIL_SHEET}[open] .wx-detail`).count().then((c) => c === 1), 6000), 'swapped for the real sheet once it’s in');
  await p.waitForTimeout(600);
  ok(await p.locator(`${H.DETAIL_SHEET}[open]`).count() === 1, 'two quick taps: exactly one detail sheet open, not two', String(await p.locator(`${H.DETAIL_SHEET}[open]`).count()));
  await p.keyboard.press('Escape'); await sheetClosed(p, H.DETAIL_SHEET);
  await p.locator(H.HD_PICK).click();
  ok(await until(() => visible(p, `${H.PLACES_SHEET}[open]`), 1000), 'Places, places.js slow: its skeleton sheet');
  await p.keyboard.press('Escape');
  await sheetClosed(p, H.PLACES_SHEET);
  await p.waitForTimeout(1800);
  ok(!(await visible(p, `${H.PLACES_SHEET}[open]`)), 'closed while it waited: Places doesn’t open after all');
  await p.locator(H.HD_PICK).click();
  ok(await until(() => p.locator(H.PLACE_ROW).count().then((c) => c === 3)), 'the next tap: Places, at once');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.PLACES_SHEET);
  // (Weather Settings asked for, then Today at once, before its skeleton sheet: it never opens over Today, nor on the way back)
  await p.evaluate((sel) => { document.querySelector(sel).click(); window.kit.F.nav.go('/'); }, H.HD_SETTINGS);
  await p.waitForTimeout(1800);
  ok(!(await visible(p, `${H.WXSETTINGS}[open]`)), 'left Weather while wxsettings.js came: Weather Settings doesn’t open over Today');
  await go(p, '/weather/'); await until(() => visible(p, H.wxSec('now')));
  await p.waitForTimeout(400);
  ok(!(await visible(p, `${H.WXSETTINGS}[open]`)), 'nor once back in Weather');
  await p.locator(H.HD_SETTINGS).click();
  ok(await until(() => visible(p, `${H.WXSETTINGS}[open]`), 3000), 'the next tap: Weather Settings, at once');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.WXSETTINGS);
  ok(st.errors.length === 0, 'no page errors (slow files)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}
// (a file that fails: the section says so with Try Again, which fetches it afresh (fw.lazy's ?retry=); a sheet's opener
// says so in a toast, and the next tap opens it)
{
  const { p, st, ctx } = await phone();
  const failing = new Set(['days', 'wxdetail']), urls = [];
  // (fw.lazy's ?retry= is j0's frame's; stage 1's frame asks for the same address again)
  const retries = /\?retry=/.test(readFileSync(`${IFL}today/public/roof/frame.js`, 'utf8'));
  p.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/weather/roof/')) urls.push(u.pathname + u.search); });
  for (const f of failing) await p.route(new RegExp(`${KIT}/weather/roof/${f}\\.js(\\?.*)?$`), (r) => (failing.has(f) ? r.fulfill({ status: 503, body: '' }) : r.fallback()));
  await openWeather(p);
  await revealDetails(p);
  await until(() => visible(p, H.DETAIL_TILE), 8000);
  await p.locator(H.hdSec('days')).click();
  ok(await until(() => visible(p, `${H.wxSec('days')} .ifl-error [data-act=retry]`), 6000), 'days.js failing: 16 Days says so, with Try Again');
  failing.delete('days');
  const at = urls.length;
  await p.locator(`${H.wxSec('days')} .ifl-error [data-act=retry]`).click();
  ok(await until(async () => (await p.locator(H.DAY_ROW).count()) >= 10, 8000), 'Try Again: the file fetched again and the days drawn');
  const again = urls.slice(at).filter((u) => u.startsWith('/weather/roof/days.js'));
  if (retries) ok(again.some((u) => /^\/weather\/roof\/days\.js\?retry=[1-9]\d*$/.test(u)), 'Try Again asked for days.js?retry=<n>, afresh (fw.lazy)', JSON.stringify(again));
  else { ok(again.length >= 1, 'Try Again asked for days.js again', JSON.stringify(again)); note('stage 1’s frame: no ?retry= to check'); }
  await p.locator(H.hdSec('now')).click(); await until(() => visible(p, H.wxSec('now')));
  await p.locator(H.DETAIL_TILE).first().click();
  ok(await until(async () => /didn’t open|needs a connection/.test(await p.locator(H.TOAST).allTextContents().then((a) => a.join(' ')).catch(() => '')), 6000), 'wxdetail.js failing: a tile says so in a toast');
  ok(!(await visible(p, `${H.DETAIL_SHEET}[open]`)), 'and no sheet is left open');
  failing.delete('wxdetail');
  await p.locator(H.DETAIL_TILE).first().click();
  ok(await until(() => p.locator(`${H.DETAIL_SHEET}[open] .wx-detail`).count().then((c) => c === 1), 8000), 'the next tap: the detail sheet');
  await p.keyboard.press('Escape'); await sheetClosed(p, H.DETAIL_SHEET);
  // (the failed files' console errors are the module's own, said once each; nothing thrown)
  ok(st.errors.every((e) => /Failed to fetch dynamically imported module|error loading dynamically imported module/.test(e)), 'no page errors but the failed fetches (failing files)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}
// (the settings route: a cold #settings address opens Weather Settings once wxsettings.js is in)
{
  const { p, st, ctx } = await phone();
  await openWeather(p, '/weather/#settings');
  ok(await until(() => visible(p, `${H.WXSETTINGS}[open]`), 10000), 'a #settings address opens Weather Settings through its lazy file');
  ok(st.errors.length === 0, 'no page errors (#settings)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ===================== 2. the views part (WV) =====================
{
  const { p, st, ctx } = await phone();
  await openWeather(p);
  const stubs = await p.evaluate(async () => Object.fromEntries(await Promise.all(['now', 'days', 'warnings', 'wxui', 'wxwarn', 'wxdetail'].map(async (f) => [f, (await import(`/weather/roof/${f}.js`)).STUB === true]))));
  const still = Object.entries(stubs).filter(([, v]) => v).map(([k]) => `weather/roof/${k}.js`);
  if (still.length) console.log(`NOTE  part skipped: ${still.join(', ')} ${still.length > 1 ? 'are' : 'is'} still B0’s stub`);
  else {
    ok(await until(() => visible(p, `${H.wxSec('now')} ${H.WX_HERO}`)), 'Now: the hero');
    ok(await until(() => visible(p, `${H.wxSec('now')} ${H.WX_ALERTS}`)), 'the warnings slot under it (London has one in force)');
    ok(await p.locator(H.NOW_SEND).count() === 0, 'Now: no Send to a friend button');
    await revealDetails(p);
    if (await visible(p, H.DETAIL_TILE)) {
      await p.locator(H.DETAIL_TILE).first().click();
      ok(await until(() => visible(p, `${H.DETAIL_SHEET}[open]`)), 'a Right now tile opens its detail sheet');
      await p.keyboard.press('Escape'); await sheetClosed(p, H.DETAIL_SHEET);
    } else ok(false, 'a Right now tile ([data-detail]) on Now');
    await p.locator(H.WX_CREDITS).first().scrollIntoViewIfNeeded().catch(() => {});
    await p.locator(H.WX_CREDITS).first().click();
    ok(await until(() => visible(p, `${H.CREDITS_SHEET}[open]`)), 'the credits line opens the credits sheet');
    await p.keyboard.press('Escape'); await sheetClosed(p, H.CREDITS_SHEET);
    await shot(p, '4-now-views');
    await p.locator(H.hdSec('days')).click();
    ok(await until(async () => (await p.locator(H.DAY_ROW).count()) >= 10), '16 Days: a row per day', String(await p.locator(H.DAY_ROW).count()));
    await p.locator(`${H.DAYS_BY} ${H.segValue('rain')}`).click();
    ok(await p.locator(`${H.DAYS_BY} ${H.segValue('rain')}`).getAttribute('aria-checked') === 'true', 'Days by: Rain');
    await p.locator(H.DAY_ROW).nth(1).click();
    ok(await until(() => visible(p, `${H.DAY_SHEET}[open]`)), 'a day opens its sheet');
    await p.keyboard.press('Escape'); await sheetClosed(p, H.DAY_SHEET);
    await p.locator(H.hdSec('warnings')).click();
    ok(await until(() => visible(p, H.warningRow(0))), 'Warnings: London’s in force');
    await p.locator(H.warningRow(0)).click();
    ok(await until(() => visible(p, `${H.WARNING_SHEET}[open]`)), 'a warning opens in full');
    await p.keyboard.press('Escape'); await sheetClosed(p, H.WARNING_SHEET);
    await shot(p, '5-warnings');
    await go(p, '/weather/?lat=53.8&lon=-1.55&name=Leeds#warnings');
    ok(await until(() => visible(p, H.warningsEmpty('none'))), 'none in force (official []): the “No warnings for Leeds” empty state');
    await go(p, '/weather/?lat=51.38&lon=-2.36&name=Bath#warnings');
    ok(await until(() => visible(p, H.warningsEmpty('unavailable'))), 'no official feed (official null): the “aren’t available” empty state');
  }
  ok(st.errors.length === 0, 'no page errors (views)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ===================== 3. Radar on a phone, and unmount =====================
{
  const { p, st, ctx } = await phone();
  await openWeather(p, '/weather/#radar');
  ok(await until(() => visible(p, H.wxSec('radar'))), 'Radar shows');
  ok(await until(() => p.locator(H.HTML_FILL).count().then((n) => n === 1)), 'html.ifl-fill: the map fills the window');
  const made = await until(() => p.evaluate(() => !!document.querySelector('.wx-radar')?.radar?.state()), 20000);
  ok(made, 'the radar’s map is made (its stack through fw.lazy)');
  await p.waitForTimeout(800);
  await shot(p, '7-radar');
  const box = await p.locator(H.RADAR_MAP).boundingBox();
  ok(box && box.height > 300, 'the map is tall: the window between the header and the tab bar', JSON.stringify(box));
  const state = () => p.evaluate(() => document.querySelector('.wx-radar').radar.state());
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  if (made && box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const s0 = await state();
    await touch('touchStart', [[cx, cy]]);
    for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx - 12 * k, cy - 8 * k]]); await p.waitForTimeout(16); }
    await touch('touchEnd', []);
    await p.waitForTimeout(700);
    const s1 = await state();
    ok(s0?.centre && s1?.centre && (Math.abs(s1.centre.lat - s0.centre.lat) > 1e-4 || Math.abs(s1.centre.lon - s0.centre.lon) > 1e-4), 'a drag moves the map (its centre)', JSON.stringify([s0?.centre, s1?.centre]));
    ok(await p.evaluate(() => window.scrollY) === 0, 'and the window doesn’t scroll');
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx - 30 - 10 * k, cy], [cx + 30 + 10 * k, cy]]); await p.waitForTimeout(16); }
    await touch('touchEnd', []);
    await p.waitForTimeout(800);
    const s2 = await state();
    ok(s2 && s1 && s2.zoom > s1.zoom + 0.2, 'a pinch zooms it in', JSON.stringify([s1?.zoom, s2?.zoom]));
    await p.touchscreen.tap(cx + 40, cy + 60);
    ok(await until(() => p.locator(`${H.RADAR_MAP} .map-read`).count().then((n) => n > 0), 4000), 'a tap gives a reading there');
    ok(await p.evaluate(() => window.scrollY) === 0, 'still no scroll');
    await shot(p, '8-radar-read');
  }
  ok(!(await p.evaluate(() => document.querySelector('.wx-radar')?.classList.contains('light-map'))), 'a dark phone: the dark map');
  // unmount: the frame's destroy (sign-out) leaves no listener the module added
  const during = await p.evaluate(() => window.__wxListeners.map((x) => `${x.who}:${x.type} ${x.at}`));
  note(`listeners from /weather/ files while mounted: ${during.length}`);
  await p.evaluate(() => window.kit.F.destroy());
  await p.waitForTimeout(300);
  // (the reused files' own, from their first import, are theirs: exactly one each of charts.js's window resize, data.js's
  // window storage and radarrain.js's document visibilitychange; any other, or a second, is the mount's)
  const left = await p.evaluate(() => {
    const first = { 'charts.js': 'window:resize', 'data.js': 'window:storage', 'radarrain.js': 'document:visibilitychange' }, had = new Set();
    return window.__wxListeners.filter((x) => {
      const f = x.from.split('/').pop(), sig = `${x.who}:${x.type}`;
      if (x.from === `/weather/${f}` && first[f] === sig && !had.has(f)) { had.add(f); return false; }
      return true;
    }).map((x) => `${x.who}:${x.type} ${x.at}`);
  });
  ok(left.length === 0, 'unmount leaves no window or document listener the module added (only charts.js’s resize, data.js’s storage and radarrain.js’s visibilitychange, once each, from their first import)', left.join(' | '));
  ok(st.errors.length === 0, 'no page errors (radar)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ===================== 4. the dark map on a light phone set dark =====================
{
  const { p, st, ctx } = await phone({ colorScheme: 'light', theme: 'dark' });
  await openWeather(p, '/weather/#radar');
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'data-theme="dark" on a light phone');
  ok(await until(() => p.evaluate(() => !!document.querySelector('.wx-radar')?.radar), 20000) && !(await p.evaluate(() => document.querySelector('.wx-radar').classList.contains('light-map'))), 'the map in its dark style (fw.theme() first)');
  await shot(p, '9-radar-dark-on-light');
  // the theme changed while Radar shows (fw.on("theme")): the radar made again in the day style, once, its listeners
  // not doubled
  const radarListeners = () => p.evaluate(() => window.__wxListeners.filter((x) => /\/weather\/(radar|mapgl|mapleaf)\.js$/.test(x.from)).map((x) => `${x.who}:${x.type}`).sort().join());
  const had = await radarListeners();
  ok(had.length > 0, 'the radar has window or document listeners to count', had);
  await p.evaluate(() => { window.__oldRadar = document.querySelector('.wx-radar')?.radar; document.documentElement.dataset.theme = 'light'; });
  ok(await until(() => p.evaluate(() => { const c = document.querySelector('.wx-radar'); return !!c?.radar && c.radar !== window.__oldRadar && c.classList.contains('light-map'); }), 20000), 'set light while Radar shows: the radar made again, in the day style');
  ok(await p.locator('.wx-radar').count() === 1, 'one radar card, not two');
  await until(async () => (await radarListeners()) === had, 4000);
  ok((await radarListeners()) === had, 'the radar’s window and document listeners as they were, not doubled', `${had} → ${await radarListeners()}`);
  await shot(p, '9b-radar-light-after-change');
  ok(st.errors.length === 0, 'no page errors (theme change)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
  const l = await phone({ colorScheme: 'light' });
  await openWeather(l.p, '/weather/#radar');
  ok(await until(() => l.p.evaluate(() => !!document.querySelector('.wx-radar')?.radar), 20000) && await l.p.evaluate(() => document.querySelector('.wx-radar').classList.contains('light-map')), 'and a light phone, not set: the day style');
  await shot(l.p, '10-radar-light');
  ok(st.errors.length === 0 && l.st.errors.length === 0, 'no page errors (themes)', [...st.errors, ...l.st.errors].slice(0, 3).join(' | '));
  await l.ctx.close();
}

// ===================== 5. offline before the first Radar; let go after 5 minutes out of sight =====================
{
  const { p, st, ctx } = await phone();
  await openWeather(p);
  await ctx.setOffline(true);
  await p.locator(H.hdSec('radar')).click();
  ok(await until(() => visible(p, H.wxSec('radar'))), 'Radar shows, offline');
  ok(await until(async () => (await visible(p, '.wx-radar-off')) && /Radar needs a connection/.test(await text(p, '.wx-radar-off'))), 'offline with no map yet: “Radar needs a connection”', await text(p, '.wx-radar-off'));
  ok(!(await p.evaluate(() => !!document.querySelector('.wx-radar')?.radar)), 'and no radar made');
  await shot(p, '11-radar-offline');
  await ctx.setOffline(false);
  await p.locator(H.hdSec('now')).click();
  await p.locator(H.hdSec('radar')).click();
  ok(await until(() => p.evaluate(() => !!document.querySelector('.wx-radar')?.radar?.state()), 20000), 'back online, the next show makes it');
  ok(!(await visible(p, '.wx-radar-off')), 'the offline line gone');
  ok(st.errors.length === 0, 'no page errors (offline)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}
{
  // (the page's clock stood in from the start, so five minutes can pass at once)
  const { p, st, ctx } = await phone();
  await p.clock.install();
  await openWeather(p, '/weather/#radar');
  ok(await until(() => p.evaluate(() => !!document.querySelector('.wx-radar')?.radar?.state()), 20000), 'Radar made (the page’s clock stood in)');
  await p.evaluate(() => { window.__firstRadar = document.querySelector('.wx-radar').radar; });
  await p.locator(H.hdSec('now')).click();
  await until(() => visible(p, H.wxSec('now')));
  await p.clock.fastForward('04:30');
  ok(await p.evaluate(() => document.querySelector('.wx-radar')?.radar === window.__firstRadar), 'out of sight under 5 minutes: kept');
  await p.clock.fastForward('00:45');
  ok(await until(() => p.evaluate(() => !document.querySelector('.wx-radar')), 4000), 'after 5 minutes out of sight: the map let go (its card gone)');
  await p.locator(H.hdSec('radar')).click();
  ok(await until(() => p.evaluate(() => { const c = document.querySelector('.wx-radar'); return !!c?.radar && c.radar !== window.__firstRadar; }), 20000), 'and made afresh on the next show');
  ok(st.errors.length === 0, 'no page errors (5 minutes away)', st.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await b.close();
console.log(`FAILS ${fails}`);
