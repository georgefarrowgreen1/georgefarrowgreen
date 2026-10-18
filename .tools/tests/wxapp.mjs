// Weather (weather/, served at weather.localhost here): the app opens on a place, explains the
// weather in words, warns about what matters, compares the models, puts the day against thirty
// years of climate, shows the radar, scores each model against the nearest airport's reports and
// tunes the forecast with it, plans your own activities, sends rain alerts and a morning briefing
// (pushed, encrypted, and read back here), and answers only at its own address. Open-Meteo, the
// radar, the map and the airport reports are stood in for (mocks/wxappdata.mjs, and below).
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import http from 'http';
import { deflateSync, crc32 } from 'zlib';
import * as F from './mocks/wxappdata.mjs';
const [,, S, out] = process.argv;
const H = 3600e3, D = 864e5;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// a radar tile: 256 × 256, a checkerboard of 30 dBZ rain (the radar's own blue) and clear, 32 pixels a square,
// so wherever the map is zoomed in to, there's rain on screen and edges to soften
const RADAR_PNG = (() => {
  const raw = Buffer.alloc(256 * (1 + 256 * 4));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (((x >> 5) + (y >> 5)) % 2 === 0) raw.set([0x00, 0x55, 0x88, 0xff], y * 1025 + 1 + x * 4);
  const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([len, Buffer.from(type), data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();
// the same day every day at the airport: 5° at 3am, 15° at 3pm
const curve = (h) => 10 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
// what each model said a day ahead: ECMWF half a degree warm, GFS two degrees warm, GEM two and a half cold…
const LEAN = { ecmwf_ifs025: 0.5, ukmo_seamless: -0.8, gfs_seamless: 2, icon_seamless: -1.5, meteofrance_seamless: 1, gem_seamless: -2.5 };
function previousRuns(url) {
  const back = Number(new URL(url).searchParams.get('past_days') || 10), start = Math.floor(Date.now() / D) * D - back * D, h = { time: [] };
  for (let t = start; t < start + (back + 1) * D; t += H) h.time.push(new Date(t).toISOString().slice(0, 16));
  for (const [id, lean] of Object.entries(LEAN)) {
    h[`temperature_2m_previous_day1_${id}`] = h.time.map((x) => curve(+x.slice(11, 13)) + lean);
    h[`temperature_2m_previous_day3_${id}`] = h.time.map((x) => curve(+x.slice(11, 13)) + lean * 1.5);
  }
  return { latitude: 51.5, longitude: 0.05, timezone: 'UTC', utc_offset_seconds: 0, hourly: h };
}
// the models' next two hours of rain on the radar's 9 × 9 grid: a band of rain over the western half
function modelGrid(url) {
  const n = new URL(url).searchParams.get('latitude').split(',').length, q0 = Math.floor(Date.now() / 900e3) * 900e3;
  const time = Array.from({ length: 9 }, (_, k) => new Date(q0 + k * 900e3).toISOString().slice(0, 16));
  return Array.from({ length: n }, (_, i) => ({ minutely_15: { time, precipitation: time.map((_, k) => (i % 9 < 4 ? 0.3 + k * 0.1 : 0)), snowfall: time.map(() => 0) } }));
}
// the stand-in for Open-Meteo (the server's notifications) and the Aviation Weather Center (its airport reports)
let wxScenario = { rainIn: 30 };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/forecast') { const n = (u.searchParams.get('latitude') || '').split(',').length, one = F.forecast(Date.now(), wxScenario); return send(n > 1 ? Array(n).fill(one) : one); }
  if (u.pathname === '/api/data/stationinfo') return send([{ icaoId: 'EGLC', site: 'London City Arpt', lat: 51.505, lon: 0.055, siteType: ['METAR', 'TAF'] }, { icaoId: 'EGKB', site: 'London/Biggin Hill Arpt', lat: 51.33, lon: 0.033, siteType: ['METAR'] }]);
  if (u.pathname === '/api/data/metar') {
    const reports = [], t0 = Math.floor(Date.now() / H) * H;
    for (let k = 0; k < 9 * 24; k++) { const t = t0 - k * H; reports.push({ icaoId: 'EGLC', obsTime: t / 1000, temp: Math.round(curve(new Date(t).getUTCHours())) }); }
    return send(reports);
  }
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');
const tiles = { radar: 0, map: 0 };
const HOST = 'http://weather.localhost:8788', SITE = 'http://localhost:8788';
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const now = Date.now();
async function open(sc = {}, { locale = 'en-GB', url = `${HOST}/?lat=51.5072&lon=-0.1276&name=London`, push = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale, serviceWorkers: push ? 'allow' : 'block', bypassCSP: !!sc.axe, isMobile: true, hasTouch: true });
  if (push) {
    await ctx.grantPermissions(['notifications'], { origin: HOST });
    // headless Chromium has no push service: a subscription with keys this test holds (as InFlight's tests do)
    await ctx.addInitScript(({ endpoint, p256dh, auth }) => {
      const make = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
      PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakesub') ? make() : null; };
      PushManager.prototype.subscribe = async function () { localStorage.setItem('fakesub', '1'); return make(); };
    }, push);
  }
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.route(/open-meteo\.com|bigdatacloud/, (r) => {
    const u = r.request().url(), j = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.includes('ensemble-api')) return j(F.ensemble(now));
    if (u.includes('air-quality')) return j(F.air(now));
    if (u.includes('archive-api')) return j(F.archive(now));
    if (u.includes('geocoding')) return j({ results: [{ name: 'Edinburgh', latitude: 55.95, longitude: -3.19, country: 'United Kingdom', admin1: 'Scotland', country_code: 'GB' }] });
    if (u.includes('bigdatacloud')) return j({ city: 'London', locality: 'Soho', principalSubdivision: 'England', countryName: 'United Kingdom', countryCode: 'GB' });
    if (u.includes('previous-runs-api')) return j(previousRuns(u));
    if (u.includes('forecast_minutely_15=9')) return j(modelGrid(u));
    if (u.includes('models=')) return j(F.models(now));
    return j(F.forecast(now, sc));
  });
  // the radar's frames and tiles, and the map's
  await p.route(/api\.rainviewer\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: Math.floor(now / 600e3) * 600 - (12 - k) * 600, path: `/v2/radar/f${k}` })), nowcast: [] } }) }));
  await p.route(/tilecache\.rainviewer\.com|tile\.openstreetmap\.org/, (r) => { const rv = /rainviewer/.test(r.request().url()); tiles[rv ? 'radar' : 'map']++; r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: rv && !sc.dryRadar ? RADAR_PNG : PNG }); });
  const res = await p.goto(url);
  await p.waitForSelector('.day-row', { timeout: 20000 });
  // everything in: the last to arrive is the thirty years of climate
  await p.waitForFunction(() => /warmer than/i.test(document.querySelector('#climate-body').textContent), null, { timeout: 20000 });
  await p.waitForSelector('#accuracy-body table', { timeout: 20000 });
  await p.waitForTimeout(300);
  return { ctx, p, res };
}

// the page, and what it says
const { ctx, p, res } = await open({ rainIn: 30, frost: true, gust: 70, uv: 7 });
ok(/default-src 'self'/.test(res.headers()['content-security-policy'] || '') && /geolocation=\(self\)/.test(res.headers()['permissions-policy'] || ''), 'its own security headers, location allowed');
ok((await p.textContent('#place-name')) === 'London', 'opens on the place in the link');
ok((await p.locator('.day-row').count()) === 16 && (await p.textContent('#daily-n')) === '16-day', '16 days');
const nc = await p.textContent('#nowcast-text');
ok(await p.isVisible('#nowcast') && /starting in about (30|35|40|45) min/.test(nc), 'the next four hours: rain on its way', nc);
ok(/on the way from about/.test(await p.textContent('#brief')), 'the briefing says so too', await p.textContent('#brief'));
const sw = await p.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 390, 'nothing wider than the phone (it would zoom the page out)', `${sw}px`);
const warn = await p.locator('#alerts .ins h3').allTextContents();
// (icy patches instead of frost when the shower falls in the evening before the freezing night)
ok(warn.some((t) => /Frost|Icy patches/.test(t)) && warn.some((t) => /Gales/.test(t)), 'warnings: frost and gales', warn.join(' · '));
if (await p.locator('#insights .more-btn').count()) await p.locator('#insights .more-btn').evaluate((e) => e.click());
const cards = await p.locator('#insights .ins h3').allTextContents();
ok(cards.some((t) => /is uncertain$/.test(t)), 'the day the models disagree is called uncertain', cards.join(' · '));
ok(cards.some((t) => /umbrella/i.test(t)), 'an umbrella tip');
if (new Date(now).getUTCHours() < 13) ok(cards.some((t) => /High UV/.test(t)), 'high UV today');
ok(/^Warmer than \d+% of days here since \d{4}\./.test(await p.textContent('#climate-body')), 'today against thirty years', (await p.textContent('#climate-body')).slice(0, 90));
ok((await p.locator('#win-grid .win').count()) >= 5, 'best times for a run, a walk, a ride, the washing, the stars or the sunset');
await p.screenshot({ path: `${out}/wx-top.png` });
await p.screenshot({ path: `${out}/wx-full.png`, fullPage: true });
// a day, in full: the six models side by side
await p.locator('.day-row').nth(4).evaluate((e) => e.click());      // (the page redraws as the last of the forecast arrives)
await p.waitForSelector('#day[open]');
ok((await p.locator('#day table.models tr').count()) === 8, 'the day compares six models, and the tuned blend', String(await p.locator('#day table.models tr').count()));
ok(/^Tuned for here · forecast alone \d+° \/ \d+°$/.test(await p.textContent('#day .tuned-note')), 'and says it\'s tuned', await p.textContent('#day .tuned-note'));
ok(!/High \d+°, low/.test(await p.textContent('#day .day-desc')), 'in words that don\'t repeat the high and low beside them', await p.textContent('#day .day-desc'));
const likely = await p.locator('#day .stat span').allTextContents();
ok(likely.includes('Likely high') && likely.includes('Likely low') && likely.includes('Gusts'), 'the ensemble\'s likely high and low as facts, not a sentence', likely.join(' · '));
ok(/Low/.test(await p.textContent('#day .conf')), 'and says how sure it is', await p.textContent('#day .conf'));
await p.screenshot({ path: `${out}/wx-day.png` });
await p.keyboard.press('Escape');
// the forecast's track record here, and tuned by it
const acc = await p.locator('#accuracy-body tr').allTextContents();
ok(acc.length === 7 && /^ECMWFBest±0\.5°/.test(acc[1]) && /GEM.*2\.5° cold/.test(acc[6]), 'each model scored against the nearest airport, best first', acc.slice(1, 3).join(' | '));
ok(/^London City Airport \(\d+ km\) · last \d+ days/.test(await p.textContent('#accuracy-body')), 'named, with how far away it is', (await p.textContent('#accuracy-body')).slice(0, 50));
ok(!/null/.test(await p.textContent('#accuracy-body')), 'with nothing stray under it', (await p.textContent('#accuracy-body')).slice(-60));
// the design carries it, not notes: no captions under the charts, the next 4 hours on a light, moderate and heavy scale
ok(!(await p.locator('#nowcast .chart-note, #hourly .chart-note, #daily .chart-note').count()), 'no notes under the charts');
const bands = await p.locator('#nowcast-chart text.c-in').allTextContents();
ok(bands.join(',') === 'Light,Moderate,Heavy', 'the next 4 hours on a scale of light, moderate and heavy, in place of mm an hour', bands.join(','));
ok((await p.textContent('#days .far-note')) === 'Less certain', 'the far days under a slim divider', await p.textContent('#days .far-note'));
ok(cards.some((t) => t === 'Most accurate here: ECMWF'), 'and an insight says which model to trust');
// every source in one window, from one line at the foot of the page
ok(!(await p.locator('.foot a').count()) && (await p.textContent('.foot-note')).trim() === 'Learn more about weather data and map data.', 'the footer: one line, no list of credits', await p.textContent('.foot-note'));
await p.locator('.foot-note [data-credits="weather"]').evaluate((e) => e.click());
await p.waitForSelector('#credits[open]');
const links = await p.locator('#credits .credits a').evaluateAll((as) => as.map((a) => `${a.href} ${a.target} ${a.rel}`));
ok(links.length === 10 && ['open-meteo.com', 'climate.copernicus.eu', 'atmosphere.copernicus.eu', 'aviationweather.gov', 'rainviewer.com', 'openstreetmap.org/copyright', 'leafletjs.com', 'bigdatacloud.com', 'nominatim.org', 'geonames.org'].every((x) => links.some((l) => l.includes(x))) && links.every((l) => / _blank noopener$/.test(l)),
  'a credits window: every source, each linked out', `${links.length} links`);
ok((await p.evaluate(() => document.querySelector('#credits .sheet-body').scrollTop)) === 0 && /national weather service/.test(await p.textContent('#credits .credits-note')), 'open at the weather data, with a notice at its foot');
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/wx-credits.png` });
await p.keyboard.press('Escape');
await p.waitForFunction(() => !document.getElementById('credits').open);
// the radar
await p.locator('#radar').scrollIntoViewIfNeeded();
await p.waitForSelector('#radar .leaflet-container', { timeout: 15000 });
await p.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 });
ok(/starting in about/.test(await p.textContent('#radar .radar-note')) && !(await p.isVisible('#radar .radar-note')), 'with the next few hours in a line above it, for full screen (the card above says it otherwise)', await p.textContent('#radar .radar-note'));
ok((await p.locator('#radar .radar-legend .rl-bar').count()) === 2 && /Light.*Heavy.*Extreme/.test(await p.textContent('#radar .rl-words')) && /Now/.test(await p.textContent('#radar .radar-scale')), 'a legend (the radar\'s colours, light to extreme, and snow\'s), and a timeline marked Now');
ok(await p.locator('#radar .radar-centre').count() === 1 && await p.locator('#radar .leaflet-control-scale').count() === 1, 'a button back to the place, and a scale');
// its credits: in full as it appears, then folded into a © that opens them all, at the map's
const credit = await p.getAttribute('#radar .radar-credit', 'aria-label');
ok(/^Map data © OpenStreetMap, RainViewer/.test(credit) && !(await p.locator('#radar .leaflet-control-attribution').count()), 'the map credited, on the map', credit);
await p.waitForFunction(() => document.querySelector('#radar .radar-credit').classList.contains('folded'), null, { timeout: 8000 }).then(() => true, () => false).then((x) => ok(x, 'folding into a © after a few seconds'));
await p.locator('#radar .radar-credit').evaluate((e) => e.click());
await p.waitForSelector('#credits[open]');
const at = await p.evaluate(() => { const b = document.querySelector('#credits .sheet-body'), want = document.getElementById('cr-map').offsetTop - b.offsetTop - 12; return { top: b.scrollTop, want: Math.min(want, b.scrollHeight - b.clientHeight) }; });
ok(at.top > 0 && Math.abs(at.top - at.want) <= 2 && !(await p.evaluate(() => document.getElementById('radar').classList.contains('radar-big'))), 'which opens the credits at the map\'s (not the map full screen)', JSON.stringify(at));
await p.keyboard.press('Escape');
await p.waitForFunction(() => !document.getElementById('credits').open);
const was = await p.getAttribute('#radar .radar-play', 'data-on');
await p.click('#radar .radar-play');
ok(was === '1' && (await p.getAttribute('#radar .radar-play', 'data-on')) === '0', 'it plays by itself, and pauses');
await p.evaluate(() => { const s = document.querySelector('#radar .radar-slider'); s.value = '12'; s.dispatchEvent(new Event('input')); });
ok(/latest radar$/.test(await p.textContent('#radar .radar-time')) && (await p.textContent('#radar .radar-chip')) === 'Radar' && tiles.radar > 0 && tiles.map > 0, 'the radar: two hours of frames over the map, up to the latest', `${tiles.radar} radar tiles, ${tiles.map} map tiles; ${await p.textContent('#radar .radar-time')}`);
// closer in than the radar's tiles go, it's smoothed: drawn in its own blue, with an edge that fades rather than steps
await p.click('#radar .leaflet-control-zoom-in'); await p.click('#radar .leaflet-control-zoom-in');
const smoothed = () => [...document.querySelectorAll('#radar .rv-tiles canvas.leaflet-tile')].some((c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 200));
await p.waitForFunction(smoothed, null, { timeout: 15000, polling: 250 }).catch(() => {});
await p.waitForTimeout(500);
const drawn = await p.evaluate(() => {
  let rain = 0, soft = 0, blue = 0;
  for (const c of document.querySelectorAll('#radar .rv-tiles canvas.leaflet-tile')) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) { if (d[i] > 200) { rain++; if (d[i - 1] > d[i - 3]) blue++; } else if (d[i] > 0) soft++; }
  }
  return { rain, soft, blue, tiles: document.querySelectorAll('#radar .rv-tiles canvas').length };
});
ok(drawn.rain > 1000 && drawn.blue > drawn.rain * 0.9 && drawn.soft > 100, 'enlarged, the radar is smoothed: rain in its own blue, with soft edges', JSON.stringify(drawn));;
// the next two hours: the latest radar carried along its own track (here it isn't moving), marked as forecast
await p.evaluate(() => { const s = document.querySelector('#radar .radar-slider'); s.value = s.max; s.dispatchEvent(new Event('input')); });
ok((await p.textContent('#radar .radar-chip')) === 'Forecast' && /in \d+ min · forecast$/.test(await p.textContent('#radar .radar-time')) && await p.locator('#radar .fc-frame').count() === 0 && await p.locator('#radar .rv-tiles').count() >= 24,
  'then the radar carried on two hours, marked as forecast', `${await p.textContent('#radar .radar-time')}; ${await p.locator('#radar .rv-tiles').count()} frames`);
ok(!(await p.isVisible('#radar .radar-status')), 'with no note under it (only when something\'s missing)', await p.textContent('#radar .radar-status'));
await p.waitForFunction(() => { const l = [...document.querySelectorAll('#radar .rv-tiles')].pop(); return [...l.querySelectorAll('canvas')].some((c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 150)); }, null, { timeout: 15000, polling: 250 }).then(() => true, () => false).then((x) => ok(x, 'the last forecast frame drawn from the radar, in its colours'));
await p.click('#radar .radar-full');
ok(await p.evaluate(() => document.getElementById('radar').classList.contains('radar-big')), 'full screen');
await p.screenshot({ path: `${out}/wx-radar.png` });
await p.keyboard.press('Escape');
ok(!(await p.evaluate(() => document.getElementById('radar').classList.contains('radar-big'))), 'and back');
// with no rain on the radar to follow, the next two hours come from the models instead, inside a box
{
  const { ctx: c2, p: p2 } = await open({ rainIn: 30, dryRadar: true });
  await p2.locator('#radar').scrollIntoViewIfNeeded();
  await p2.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 }).catch(() => {});
  const fc = await p2.evaluate(() => { const img = [...document.querySelectorAll('#radar .fc-frame')].pop(); return { n: document.querySelectorAll('#radar .fc-frame').length, painted: !!img && img.src.startsWith('data:image/png') && img.src.length > 500 }; });
  ok(fc.n >= 7 && fc.painted, 'no rain on the radar to follow: the models\' rain, painted in the radar\'s colours', JSON.stringify(fc));
  await c2.close();
}
// your own activities
await p.click('#settings-btn');
await p.selectOption('#act-add', 'golf');
ok((await p.locator('#acts-list .act').count()) === 4, 'golf added to the list');
await p.locator('#acts-list .act').first().locator('button').click();
await p.fill('.act-edit input[name="tmax"]', '20');
await p.click('.act-edit .pill-btn');
ok(/^6°–20°/.test(await p.locator('#acts-list .act-lim').first().textContent()), 'a run\'s limits changed', await p.locator('#acts-list .act-lim').first().textContent());
await p.screenshot({ path: `${out}/wx-settings.png` });
await p.keyboard.press('Escape');
ok((await p.locator('#win-grid .win-name').allTextContents()).includes('Golf'), 'and golf has its best time');
// units, kept
await p.click('#settings-btn'); await p.click('input[name="temp"][value="f"]'); await p.keyboard.press('Escape');
ok(/^\d+°$/.test(await p.textContent('#now-temp')) && Number((await p.textContent('#now-temp')).slice(0, -1)) > 32, 'switches to °F');
await p.reload(); await p.waitForSelector('.day-row');
ok(Number((await p.textContent('#now-temp')).slice(0, -1)) > 32, 'and remembers it');
// search and save a place
await p.click('#place-btn'); await p.fill('#search', 'Edin'); await p.waitForSelector('#results .row-btn'); await p.click('#results .row-btn');
await p.waitForTimeout(600);
ok((await p.textContent('#place-name')) === 'Edinburgh', 'a place found by search');
await p.click('#place-btn');
ok((await p.locator('#saved li').count()) === 2, 'both places saved');
await p.keyboard.press('Escape');
await ctx.close();

// accessibility (axe), with nothing alarming going on
{
  const { ctx, p } = await open({ axe: true });
  await p.addScriptTag({ content: readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
  const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`));
  ok(!v.length, 'no accessibility violations', v.join('; '));
  ok(!(await p.isVisible('#nowcast')), 'no rain on the way: no nowcast card');
  await p.locator('.foot-note [data-credits="map"]').evaluate((e) => e.click());
  await p.waitForSelector('#credits[open]'); await p.waitForTimeout(700);
  const v2 = await p.evaluate(async () => (await axe.run('#credits', { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`));
  ok(!v2.length, 'nor in the credits window', v2.join('; '));
  await ctx.close();
}
// its own address only (asked of the local server directly, by name)
const get = (host, path) => new Promise((done, fail) => http.get({ host: '127.0.0.1', port: 8788, path, headers: { Host: host } }, (r) => {
  let body = ''; r.on('data', (c) => (body += c)); r.on('end', () => done({ status: r.statusCode, body }));
}).on('error', fail));
const W = 'weather.localhost', L = 'localhost';
ok((await get(W, '/api/content')).status === 404 && (await get(W, '/pigeon/')).status === 404 && (await get(W, '/nothing-here')).status === 404, 'nothing of the site or InFlight at the weather address');
ok((await get(W, '/weather/app.js')).status === 301 && (await get(L, '/weather')).status === 301 && (await get(L, '/weather/')).status === 200, 'the app\'s old and preview addresses');
const where = JSON.parse((await get(W, '/api/weather/where')).body || '{}');
ok(Number.isFinite(where.lat) && Number.isFinite(where.lon), 'roughly where you are, from the connection', JSON.stringify(where));

// rain alerts and the morning briefing: turned on, sent by the tick, encrypted to the phone, read back here
{
  const wc = globalThis.crypto.subtle, b64u = (u) => Buffer.from(u).toString('base64url'), te = new TextEncoder();
  const kp = await wc.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await wc.exportKey('raw', kp.publicKey)), authK = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const endpoint = 'https://fcm.googleapis.com/fcm/send/weather-test-device';
  const hkdf = async (salt, ikm, info, len) => new Uint8Array(await wc.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await wc.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
  async function decrypt(body) {
    const buf = new Uint8Array(Buffer.from(body, 'base64')), salt = buf.slice(0, 16), idlen = buf[20], asPub = buf.slice(21, 21 + idlen), ct = buf.slice(21 + idlen);
    const shared = new Uint8Array(await wc.deriveBits({ name: 'ECDH', public: await wc.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, kp.privateKey, 256));
    const ikm = await hkdf(authK, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...pub, ...asPub]), 32);
    const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
    const pt = new Uint8Array(await wc.decrypt({ name: 'AES-GCM', iv: nonce }, await wc.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
    let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
    return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
  }
  const mine = async () => Promise.all(readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.headers['x-endpoint'] === endpoint).map((x) => decrypt(x.body)));
  const tick = () => new Promise((done, fail) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/tick', method: 'POST', headers: { Host: 'localhost', Authorization: 'Bearer tick-test-secret' } }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => done({ status: res.statusCode, ...JSON.parse(t || '{}') })); }); r.on('error', fail); r.end(); });
  const { ctx, p } = await open({}, { push: { endpoint, p256dh: b64u(pub), auth: b64u(authK) } });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.click('#settings-btn');
  const at = new Date(Date.now() - 5 * 60e3), hhmm = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
  await p.fill('input[name="briefAt"]', hhmm);
  await p.check('input[name="brief"]');
  await p.check('input[name="rain"]');
  await p.waitForFunction(() => /^On: rain alerts and a briefing/.test(document.getElementById('notify-status').textContent), null, { timeout: 10000 });
  ok(/For London\./.test(await p.textContent('#notify-place')), 'notifications on, for London', await p.textContent('#notify-status'));
  const quiet = (() => { const h = new Date().getUTCHours(); return h >= 22 || h < 7; })();
  const t1 = await tick();
  ok(t1.status === 200 && t1.subs === 1 && t1.brief === 1 && t1.rain === (quiet ? 0 : 1), 'the tick sends what\'s due', JSON.stringify(t1));
  const got = await mine();
  const brief = got.find((n) => n.tag === 'brief'), rain = got.find((n) => n.tag === 'rain');
  ok(brief && /^London · \d+° \/ \d+°$/.test(brief.title) && /on the way from about/.test(brief.body), 'the briefing, decrypted', brief && `${brief.title} — ${brief.body}`);
  if (!quiet) ok(rain && /^Rain in about \d+ min$/.test(rain.title) && /^London: Rain starting in about/.test(rain.body), 'the rain alert, decrypted', rain && `${rain.title} — ${rain.body}`);
  const t2 = await tick();
  ok(t2.rain === 0 && t2.brief === 0, 'and neither again straight away', JSON.stringify(t2));
  await p.uncheck('input[name="rain"]'); await p.uncheck('input[name="brief"]');
  await p.waitForFunction(() => document.getElementById('notify-status').textContent === 'Off.', null, { timeout: 10000 });
  ok((await tick()).subs === 0, 'turned off: the server forgets the phone');
  await ctx.close();
}

ok(!errs.length, 'no errors on the page', errs.join('; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
