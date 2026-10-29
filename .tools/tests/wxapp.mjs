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
import * as OW from './mocks/wxwarnings.mjs';
const [,, S, out] = process.argv;
const H = 3600e3, D = 864e5;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// a PNG, w × h, from px(x, y): [r, g, b, a], or null for clear
function pngOf(w, h, px) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = px(x, y); if (c) raw.set(c, y * (1 + w * 4) + 1 + x * 4); }
  const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([len, Buffer.from(type), data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const BLUE = [0x00, 0x55, 0x88, 0xff];      // (30 dBZ, in the radar's own colours: about 2.7 mm an hour)
// a radar tile: 512 × 512 (the size the app asks for), a checkerboard of 30 dBZ rain and clear, 64 pixels a square, so
// wherever the map is zoomed in to, there's rain on screen and edges to soften
const RADAR_PNG = pngOf(512, 512, (x, y) => (((x >> 6) + (y >> 6)) % 2 === 0 ? BLUE : null));
// the radar's coverage where it sees (clear: anywhere else, as PNG's tint, it doesn't)
const SEEN_PNG = pngOf(1, 1, () => null);
// the radar about London, seeing: a block of rain 80 of zoom 7's pixels wide (about 60 km) and 160 tall, coming east
// at 2 pixels a minute, its front 60 pixels west of the place in the latest of the 13 frames (here half an hour on)
const HERE = (() => { const la = (51.5072 * Math.PI) / 180; return { x: ((-0.1276 + 180) / 360) * 32768, y: ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * 32768 }; })();
// (for the server's radar, read as PNGs rather than drawn: whole 512-pixel tiles, seen and not)
const SEEN_512 = pngOf(512, 512, () => null), UNSEEN_512 = pngOf(512, 512, () => [0, 0, 0, 0xff]);
const blocks = new Map();
const blockTile = (k, tx, ty) => {
  const key = `${k}/${tx}/${ty}`, front = HERE.x - 60 - 20 * (12 - k);
  if (!blocks.has(key)) blocks.set(key, pngOf(512, 512, (x, y) => { const X = tx * 512 + x, Y = ty * 512 + y; return X >= front - 80 && X < front && Math.abs(Y - HERE.y) < 80 ? BLUE : null; }));
  return blocks.get(key);
};
// the same day every day at the airport: 5° at 3am, 15° at 3pm
const curve = (h) => 10 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
// what each model said a day ahead: ECMWF half a degree warm, GFS two degrees warm, GEM two and a half cold…
const LEAN = { ecmwf_ifs: 0.5, ukmo_seamless: -0.8, gfs_seamless: 2, icon_seamless: -1.5, meteofrance_seamless: 1, gem_seamless: -2.5 };
function previousRuns(url) {
  const q = new URL(url).searchParams, back = Number(q.get('past_days') || 10), start = Math.floor(Date.now() / D) * D - back * D, h = { time: [] };
  for (let t = start; t < start + (back + 1) * D; t += H) h.time.push(new Date(t).toISOString().slice(0, 16));
  // the forecast the page shows (no models asked for), a day ahead: a degree warm through the night, a degree too
  // humid, and the wind too light (15 km/h against the airport's 10 knots)
  if (!q.get('models')) {
    const hr = (x) => +x.slice(11, 13);
    Object.assign(h, { temperature_2m_previous_day1: h.time.map((x) => curve(hr(x)) + (hr(x) < 6 || hr(x) >= 21 ? 1 : 0)), dew_point_2m_previous_day1: h.time.map(() => 7),
      wind_speed_10m_previous_day1: h.time.map(() => 15), wind_gusts_10m_previous_day1: h.time.map(() => 30) });
    return { latitude: 51.5, longitude: 0.05, timezone: 'UTC', utc_offset_seconds: 0, hourly: h };
  }
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
// the air quality on the field's grid, by the hour: fair, a little worse to the east
function aqGrid(url) {
  const n = new URL(url).searchParams.get('latitude').split(',').length, side = Math.round(Math.sqrt(n)), h0 = Math.floor(Date.now() / H) * H - 3 * H;
  const time = Array.from({ length: 16 }, (_, k) => new Date(h0 + k * H).toISOString().slice(0, 16));
  return Array.from({ length: n }, (_, i) => ({ hourly: { time, european_aqi: time.map(() => 22 + (i % side) * 2) } }));
}
// the models' hours of rain on the radar's grid, from this hour on: none for the first four, then a band over the western half
function hoursGrid(url) {
  const n = new URL(url).searchParams.get('latitude').split(',').length, h0 = Math.floor(Date.now() / H) * H;
  const time = Array.from({ length: 14 }, (_, k) => new Date(h0 + k * H).toISOString().slice(0, 16));
  return Array.from({ length: n }, (_, i) => ({ hourly: { time, precipitation: time.map((_, k) => (i % 9 < 4 && k >= 4 ? 1.6 : 0)), snowfall: time.map(() => 0) } }));
}
// the models' temperature and wind on the radar's 9 × 9 grid, by the hour: warmer to the south and east, the wind
// stronger to the west, from the south-west
function fieldGrid(url) {
  const n = new URL(url).searchParams.get('latitude').split(',').length, side = Math.round(Math.sqrt(n)), h0 = Math.floor(Date.now() / H) * H - 3 * H;
  const time = Array.from({ length: 16 }, (_, k) => new Date(h0 + k * H).toISOString().slice(0, 16));
  return Array.from({ length: n }, (_, i) => ({ hourly: { time, temperature_2m: time.map((_, k) => 6 + Math.floor(i / side) + (i % side) * 0.5 + k * 0.3), wind_speed_10m: time.map(() => 10 + (side - 1 - (i % side)) * 4), wind_gusts_10m: time.map(() => 20 + (side - 1 - (i % side)) * 6), wind_direction_10m: time.map(() => 225), uv_index: time.map(() => 1 + (i % side) * 0.8) } }));
}
// the stand-in for Open-Meteo (the server's notifications), the Aviation Weather Center (its airport reports), and
// MeteoAlarm, the National Weather Service and the Environment Agency (official warnings: mocks/wxwarnings.mjs)
let wxScenario = { rainIn: 30 }, radarScenario = null, warnExtra = false;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/forecast') { const n = (u.searchParams.get('latitude') || '').split(',').length, one = F.forecast(Date.now(), wxScenario); return send(n > 1 ? Array(n).fill(one) : one); }
  // RainViewer, for the server's rain alerts: its frames, and their tiles, none of it seen by the radar unless
  // radarScenario says rain's on it coming this way (the browser's stand-in's radarHere block)
  if (u.pathname === '/public/weather-maps.json') return send({ host: 'http://127.0.0.1:8794', radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: Math.floor(Date.now() / 600e3) * 600 - (12 - k) * 600, path: `/v2/radar/f${k}` })) } });
  const rf = /^\/v2\/radar\/f(\d+)\/512\/6\/(\d+)\/(\d+)\//.exec(u.pathname), cover = u.pathname.startsWith('/v2/coverage/');
  if (rf || cover) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(cover ? (radarScenario ? SEEN_512 : UNSEEN_512) : radarScenario ? blockTile(+rf[1], +rf[2], +rf[3]) : SEEN_512); }
  if (u.pathname === '/api/data/stationinfo') return send([{ icaoId: 'EGLC', site: 'London City Arpt', lat: 51.505, lon: 0.055, siteType: ['METAR', 'TAF'] }, { icaoId: 'EGKB', site: 'London/Biggin Hill Arpt', lat: 51.33, lon: 0.033, siteType: ['METAR'] }]);
  if (u.pathname === '/api/v1/warnings/feeds-united-kingdom') return send(OW.ukFeed(Date.now(), { extra: warnExtra }));
  if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
  if (u.pathname === '/flood-monitoring/id/floods') return send(OW.eaFloods(+u.searchParams.get('lat'), +u.searchParams.get('long'), Date.now()));
  const ea = /^\/flood-monitoring\/id\/floodAreas\/([\w-]+)\/polygon$/.exec(u.pathname);
  if (ea) { const g = OW.eaOutline(ea[1]); if (g) return send(g); res.writeHead(404); return res.end(); }
  if (u.pathname === '/alerts/active') { if (u.searchParams.get('point') === OW.NEW_YORK) return send(OW.nwsAlerts(Date.now())); res.writeHead(400); return res.end('{"title":"out of bounds"}'); }
  if (u.pathname === '/api/data/metar') {
    const reports = [], t0 = Math.floor(Date.now() / H) * H;
    for (let k = 0; k < 9 * 24; k++) { const t = t0 - k * H; reports.push({ icaoId: 'EGLC', obsTime: t / 1000, temp: Math.round(curve(new Date(t).getUTCHours())), dewp: 6, wspd: 10 }); }
    return send(reports);
  }
  res.writeHead(404); res.end();
}).listen(8794, '127.0.0.1');
const tiles = { radar: 0, map: 0, tilejson: 0, vector: 0, relief: 0, grid: 0 }, asked = { forecast: 0 };
// the radar chip's word: the one it shows (the other lies over it, out of sight)
const chipSays = (pg) => pg.evaluate(() => [...document.querySelectorAll('#radar .radar-chip .rc-l')].filter((x) => getComputedStyle(x).position !== 'absolute').map((x) => x.textContent).join('|'));
const HOST = 'http://weather.localhost:8788', SITE = 'http://localhost:8788';
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const now = Date.now();
async function open(sc = {}, { locale = 'en-GB', url = `${HOST}/?lat=51.5072&lon=-0.1276&name=London`, push = null, settle = true, sw = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale, serviceWorkers: push || sw ? 'allow' : 'block', bypassCSP: !!sc.axe, isMobile: true, hasTouch: true });
  if (push) {
    await ctx.grantPermissions(['notifications'], { origin: HOST });
    // headless Chromium has no push service: a subscription with keys this test holds (as Chat's tests do)
    await ctx.addInitScript(({ endpoint, p256dh, auth }) => {
      const make = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fakesub'); return true; } });
      PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fakesub') ? make() : null; };
      PushManager.prototype.subscribe = async function () { localStorage.setItem('fakesub', '1'); return make(); };
    }, push);
  }
  // what the radar draws: each tile it hands the vector map, and each picture of the models' rain (and, as a phone
  // without WebGL 2, none of it on the vector map)
  await ctx.addInitScript((noGL) => {
    window.__tiles = []; window.__pictures = [];
    const look = (d) => { let rain = 0, soft = 0, blue = 0, top = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] > top) top = d[i]; if (d[i] > 200) { rain++; if (d[i - 1] > d[i - 3]) blue++; } else if (d[i] > 0) soft++; } return { rain, soft, blue, top }; };
    const bitmap = window.createImageBitmap;
    window.createImageBitmap = function (src, ...a) { if (src instanceof ImageData && src.width === 256) __tiles.push(look(src.data)); return bitmap.call(this, src, ...a); };
    window.__mixes = [];
    const ctxOf = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) { const c = ctxOf.call(this, t, o); if (t === 'webgl' && o?.preserveDrawingBuffer) window.__glmix = this; return c; };
    // (its rain: solid where it's most of the way there, faint where it's half there or less; where the solid's middle is)
    window.__glread = () => {
      const g = window.__glmix; if (!g) return null;
      const c = document.createElement('canvas'); c.width = g.width; c.height = g.height; const x = c.getContext('2d'); x.drawImage(g, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let solid = 0, faint = 0, cx = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 150) { solid++; cx += ((i - 3) / 4) % c.width; } else if (d[i] > 30) faint++; }
      return { solid, faint, x: solid ? Math.round(cx / solid) : null, w: c.width };
    };
    const drawImg = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) { if (this.globalCompositeOperation === 'lighter') { window.__mix = this.canvas; __mixes.push({ alpha: Math.round(this.globalAlpha * 1000) / 1000, x: a[0], y: a[1] }); if (__mixes.length > 2000) __mixes.splice(0, 1000); } return drawImg.call(this, img, ...a); };
    const put = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (img, ...a) { if (img.width === 200) __pictures.push(look(img.data)); return put.call(this, img, ...a); };
    // (and the page turning between places: what it animates in a view transition)
    window.__turns = []; const animate = Element.prototype.animate;
    Element.prototype.animate = function (k, o) { if (o && /view-transition/.test(o.pseudoElement || '')) __turns.push(o.pseudoElement); return animate.call(this, k, o); };
    if (noGL) { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : get.call(this, t, ...a); }; }
  }, !!sc.noGL);
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());   // (a shared link to a place not in your list: added, as if said yes)
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.route(/open-meteo\.com|bigdatacloud/, (r) => {
    const u = r.request().url(), j = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.includes('ensemble-api')) return j(F.ensemble(now, sc));
    if (u.includes('air-quality') && u.includes('past_hours')) { tiles.aq = (tiles.aq || 0) + 1; return j(aqGrid(u)); }
    if (u.includes('air-quality')) return j(F.air(now));
    if (u.includes('marine-api')) return j(F.marine(now, u));
    if (u.includes('archive-api')) return j(F.archive(now));
    if (u.includes('geocoding')) return j({ results: [{ name: 'Edinburgh', latitude: 55.95, longitude: -3.19, country: 'United Kingdom', admin1: 'Scotland', country_code: 'GB' }] });
    if (u.includes('bigdatacloud')) return j({ city: 'London', locality: 'Soho', principalSubdivision: 'England', countryName: 'United Kingdom', countryCode: 'GB' });
    if (u.includes('previous-runs-api')) return j(previousRuns(u));
    if (u.includes('forecast_minutely_15=9')) { tiles.grid++; return j(modelGrid(u)); }
    if (u.includes('hourly=temperature_2m&past_hours')) { tiles.fine = (tiles.fine || 0) + 1; return j(fieldGrid(u)); }
    if (u.includes('hourly=precipitation%2Csnowfall')) { tiles.hours = (tiles.hours || 0) + 1; return j(hoursGrid(u)); }
    if (u.includes('hourly=temperature_2m%2Cwind_speed_10m%2Cwind_direction_10m')) { tiles.field = (tiles.field || 0) + 1; return j(fieldGrid(u)); }
    if (u.includes('models=')) return j(F.models(now, sc));
    if (u.includes('daily=')) asked.forecast++;
    return j(F.forecast(now, sc));
  });
  // the radar's frames and tiles, and the map's
  await p.route(/api\.rainviewer\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: Math.floor(now / 600e3) * 600 - (12 - k) * 600, path: `/v2/radar/f${k}` })), nowcast: [] } }) }));
  await p.route(/tilecache\.rainviewer\.com|tile\.openstreetmap\.org/, (r) => {
    const u = r.request().url(), rv = /rainviewer/.test(u), f = /\/v2\/radar\/f(\d+)\/512\/6\/(\d+)\/(\d+)\//.exec(u);
    tiles[rv ? 'radar' : 'map']++;
    // (where the radar sees: nowhere, unless it's the radar's own say on the next hours being tried)
    const body = !rv ? PNG : /\/v2\/coverage\//.test(u) ? (sc.radarHere ? SEEN_PNG : PNG) : sc.radarHere && f ? blockTile(+f[1], +f[2], +f[3]) : sc.clearRadar ? SEEN_PNG : sc.dryRadar ? PNG : RADAR_PNG;
    r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });
  // OpenFreeMap's: where its tiles are, then the tiles (empty: the map's drawn in its land colour, nothing on it), and
  // its shaded relief (and its fonts, if anything needed naming)
  await ctx.route(/tiles\.openfreemap\.org/, (r) => {
    const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*' };
    if (/\/planet$/.test(u)) { tiles.tilejson++; return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) }); }
    const png = /\.png$/.test(u); tiles[png ? 'relief' : 'vector']++;
    return r.fulfill({ status: 200, contentType: png ? 'image/png' : 'application/x-protobuf', headers: cors, body: png ? PNG : Buffer.alloc(0) });
  });
  const res = await p.goto(url);
  await p.waitForSelector('.day-row', { timeout: 20000 });
  if (!settle) return { ctx, p, res };
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
// an app, not a page: its words can't be selected, copied or dragged off, and no menu comes up for them; what's typed
// into still takes it all
{
  const c = await p.evaluate(() => {
    const fire = (el, type) => { const e = new Event(type, { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
    const brief = document.getElementById('brief'), search = document.getElementById('search');
    getSelection().removeAllRanges(); const r = document.createRange(); r.selectNodeContents(brief); getSelection().addRange(r);
    const copied = getSelection().toString(); getSelection().removeAllRanges();
    return { select: getComputedStyle(brief).userSelect, field: getComputedStyle(search).userSelect, menu: fire(brief, 'contextmenu'), copy: fire(brief, 'copy'), start: fire(brief, 'selectstart'),
      fieldMenu: fire(search, 'contextmenu'), fieldCopy: fire(search, 'copy'), fieldPaste: fire(search, 'paste'), copied };
  });
  ok(c.select === 'none' && c.menu && c.copy && c.start && !c.copied, 'its words: not selectable, no copying them, no menu', JSON.stringify(c));
  ok(c.field === 'text' && !c.fieldMenu && !c.fieldCopy && !c.fieldPaste, 'but the search box takes copying and pasting as ever', JSON.stringify(c));
}
// (the first ten, the rest under a line; a tap and they rise in where it was, the first of them with focus)
ok((await p.locator('.day-row').count()) === 10 && (await p.textContent('#daily-n')) === '16-day' && (await p.textContent('#daily .days-more')) === 'Show 6 more days', '16 days: the first ten, then "Show 6 more days"');
await p.locator('#daily .days-more').evaluate((e) => e.click());
ok((await p.locator('.day-row').count()) === 16 && !(await p.locator('#daily .days-more').count()) && await p.evaluate(() => document.activeElement === document.querySelectorAll('.day-row')[10]), 'and a tap shows the other six, the first of them with focus');
// the days by rain or by wind, as iOS 27's Weather has them: the view the weather calls for (rain due within the hour:
// rain), the 48 hours and the days alike, from either switch
{
  const sel = (id) => `document.querySelector('#${id} [aria-selected="true"]').dataset.mode`;
  const v = await p.evaluate(() => ({ days: document.getElementById('days').className, hourly: document.querySelector('#hourly-seg [aria-selected="true"]').dataset.mode, own: document.querySelector('#days-seg [aria-selected="true"]').dataset.mode, bars: document.querySelector('#days .day-row .dr')?.querySelectorAll('rect').length, val: document.querySelector('#days .d-val')?.textContent }));
  ok(v.days === 'days v-rain' && v.hourly === 'rain' && v.own === 'rain' && v.bars >= 20 && /^\d+%/.test(v.val), 'rain due within the hour: the rain view, the 48 hours and the days alike (each day its hours as bars, its chance and how much)', JSON.stringify(v));
  await p.locator('#days-seg [data-mode="wind"]').evaluate((e) => e.click()); await p.waitForTimeout(400);
  const w = await p.evaluate(() => ({ days: document.getElementById('days').className, hourly: document.querySelector('#hourly-seg [aria-selected="true"]').dataset.mode, line: !!document.querySelector('#days .dw .line'), val: document.querySelector('#days .d-val')?.textContent }));
  ok(w.days === 'days v-wind' && w.hourly === 'wind' && w.line && /gusts \d+/.test(w.val), 'the days\' own switch: wind (a line, the gusts a band), and the 48 hours\' switch with it', JSON.stringify(w));
  await p.locator('#hourly-seg [data-mode="temp"]').evaluate((e) => e.click()); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.getElementById('days').className === 'days v-temp' && !!document.querySelector('#days .d-hi')), 'and back to temperatures from the other switch');
}
// a word about the alerts, once: put away, it stays away
{
  const n = await p.evaluate(() => { const b = document.getElementById('nudge'); return { shown: !b.hidden, text: b.textContent }; });
  ok(n.shown && /Get rain alerts/.test(n.text) && /Turn on/.test(n.text), 'a word about the rain alerts, with a way to them', n.text.slice(0, 90));
  await p.locator('#nudge .link').evaluate((e) => e.click());
  // (it folds away first, the cards under it moving up, and then it's hidden)
  await p.waitForFunction(() => document.getElementById('nudge').hidden, null, { timeout: 2000 }).catch(() => {});
  ok(await p.evaluate(() => document.getElementById('nudge').hidden && !!localStorage.getItem('wx:nudge')), 'and "Not now" puts it away (for good: a row in Settings instead)');
}
const nc = await p.textContent('#nowcast-text');
// (rain from 30 minutes on: said from the start of the quarter hour it starts in)
ok(await p.isVisible('#nowcast') && /starting in about (15|20|25|30) min/.test(nc), 'the next four hours: rain on its way', nc);
ok(!(await p.isVisible('#nowcast-src')), 'the models\' timing, where the radar has no say: not said to be the radar\'s');
ok(/on the way from about/.test(await p.textContent('#brief')), 'the briefing says so too', await p.textContent('#brief'));
const sw = await p.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 390, 'nothing wider than the phone (it would zoom the page out)', `${sw}px`);
const warn = await p.locator('#alerts .ins h3').allTextContents();
// (icy patches instead of frost when the shower falls in the evening before the freezing night)
ok(warn.some((t) => /Frost|Icy patches/.test(t)) && warn.some((t) => /Gales/.test(t)), 'warnings: frost and gales', warn.join(' · '));
// several at once: one banner straight under the temperature, saying what they are (the most severe first), that opens
// to them all
{
  // (straight under it: nothing between them but a script, the warnings first in the cards' column and the temperature
  // last before it, in the scroller that has the places either side of it)
  const sum = await p.evaluate(() => { const b = document.querySelector('#alerts .warn-sum'); return b && { title: b.querySelector('.ins-open').textContent, line: b.querySelector('p').textContent,
    open: b.querySelector('.ins-open').getAttribute('aria-expanded'), hidden: document.getElementById('warn-all').hidden,
    first: (() => { for (let n = document.getElementById('alerts'); n && n !== document.body;) { const s = n.previousElementSibling; if (!s) { n = n.parentElement; continue; } n = s; if (!n.matches('script')) return n.matches('.hero, .pager:has(> .hero)'); } return false; })() }; });
  // (the official ones first, worst first; the app's own after, in either order)
  ok(sum && sum.title === '4 warnings' && /^Amber thunderstorm, Yellow rain, (Gales, (Frost|Icy patches)|(Frost|Icy patches), Gales)$/.test(sum.line) && sum.open === 'false' && sum.hidden && sum.first,
    'several warnings: one banner under the temperature, saying what they are, worst first', JSON.stringify(sum));
  await p.locator('#alerts .warn-sum .ins-open').click();
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => !document.getElementById('warn-all').hidden && document.querySelector('#alerts .warn-sum .ins-open').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('#warn-all > .ins').length === 4),
    'and tapped, it opens to all four');
}
// official warnings (the Met Office's, through MeteoAlarm's feed, stood in for): worst first, above the app's own
{
  const off = await p.locator('#warn-all .official').evaluateAll((as) => as.map((a) => ({ colour: a.dataset.colour, tag: a.querySelector('.tag')?.textContent, title: a.querySelector('.ins-open').textContent, from: a.querySelector('.ins-from').textContent })));
  ok(off.length === 2 && off[0].colour === 'amber' && off[0].tag === 'Amber' && off[0].title === 'Thunderstorm warning' && off[0].from === 'Met Office · Tomorrow 12:00 to 21:00'
    && off[1].colour === 'yellow' && off[1].tag === 'Yellow' && off[1].title === 'Rain warning' && /^Met Office · Until (tomorrow )?\d\d:\d\d$/.test(off[1].from),
    'official warnings: the Met Office\'s, worst first (none over, green, cancelled, replaced or without a drawn area)', JSON.stringify(off));
  const order = await p.locator('#warn-all > *').evaluateAll((es) => es.map((e) => (e.matches('.official') ? 'official' : 'own')));
  ok(order.join(',').startsWith('official,official,own'), 'above the app\'s own warnings', order.join(','));
  await p.locator('#warn-all .official .ins-open').nth(1).click();
  await p.waitForSelector('#warning[open]');
  await p.waitForTimeout(600);
  const sheet = await p.evaluate(() => ({ title: document.getElementById('warning-title').textContent, badge: document.querySelector('#warning .warn-badge')?.textContent,
    impacts: document.querySelectorAll('#warning .warn-list li').length, link: document.querySelector('#warning .warn-link a')?.href, text: document.getElementById('warning-body').textContent }));
  ok(sheet.title === 'Rain warning' && sheet.badge === 'Yellow' && sheet.impacts === 2 && /^https:\/\/www\.metoffice\.gov\.uk\//.test(sheet.link) && /What to do/.test(sheet.text) && /Check road conditions before you travel\./.test(sheet.text) && /Issued by the Met Office, through MeteoAlarm/.test(sheet.text),
    'tapped, the whole of it in a sheet: what to expect, the details, what to do, and the Met Office\'s page', JSON.stringify({ ...sheet, text: sheet.text.slice(0, 100) }));
  await p.screenshot({ path: `${out}/wx-warning.png` });
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.getElementById('warning').open);
}
// the app's own insights, in one card: the first three, a title and a line each, the rest under "N more"; each line
// its own short one, whole (not the start of all it says, cut off), and a tap opens the row to all of it
{
  const rows = await p.locator('#insights .ins-row').count(), more = await p.textContent('#insights-card .ins-more').catch(() => '');
  ok(await p.isVisible('#insights-card') && rows === 3 && /^\d+ more$/.test(more.trim()), 'insights in one card: three, then the rest under "N more"', `${rows} rows, "${more.trim()}"`);
  const lines = await p.evaluate(() => [...document.querySelectorAll('#insights .ins-row')].map((r) => { const l = r.querySelector('.ins-short') || r.querySelector('.ins-line'); return { text: l.textContent, whole: l.scrollHeight <= l.clientHeight + 1 }; }));
  ok(lines.every((l) => l.whole), 'each row\'s line whole, none of it cut off', lines.map((l) => `${l.text}${l.whole ? '' : ' (cut)'}`).join(' | '));
  // (the rows as tall as they are, nothing between them: no stray margin from another rule's class)
  const gaps = await p.evaluate(() => { const l = document.getElementById('insights'); return Math.round(l.getBoundingClientRect().height - [...l.children].reduce((a, r) => a + r.getBoundingClientRect().height, 0)); });
  ok(Math.abs(gaps) <= 2, 'the rows sit one under the other, no gaps between them', `${gaps}px of gaps`);
  const row = p.locator('#insights .ins-row.has-short').first();
  const tall = () => row.evaluate((r) => r.getBoundingClientRect().height), says = () => row.evaluate((r) => [...r.querySelectorAll('.ins-short, .ins-line')].filter((x) => x.offsetHeight).map((x) => x.className).join());
  const shut = await tall(), shutSays = await says();
  // (tapped where it is, not scrolled to: the radar, further up, starts as it's first scrolled to, below)
  await row.locator('.ins-head').evaluate((e) => e.click());
  await p.waitForTimeout(600);
  ok(shutSays === 'ins-short' && await row.locator('.ins-head').getAttribute('aria-expanded') === 'true' && (await tall()) > shut + 8 && await says() === 'ins-line', 'a row opens from its short line to all it says', `${Math.round(shut)} → ${Math.round(await tall())}px, ${shutSays} → ${await says()}`);
  // and on from there, to its day or its hours
  const goLabel = await row.locator('.ins-go').textContent().catch(() => '');
  if (goLabel) { await row.locator('.ins-go').evaluate((e) => e.click()); await p.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {}); }
  const sheet = await p.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? `${d.id}: ${(d.querySelector('#detail-title, #day-title, h2')?.textContent || '').trim()}` : ''; });
  ok(/hour by hour|in full|Sunrise/.test(goLabel) && sheet, 'and on from there to its day or its hours', `${goLabel} → ${sheet}`);
  if (sheet) { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('dialog[open]')); await p.waitForTimeout(300); }
  await row.locator('.ins-head').evaluate((e) => e.click());
  await p.waitForTimeout(600);
  ok(await row.locator('.ins-head').getAttribute('aria-expanded') === 'false' && Math.abs((await tall()) - shut) < 1 && await says() === 'ins-short', 'and closes again to its short line');
}
if (await p.locator('#insights-card .ins-more').count()) await p.locator('#insights-card .ins-more').evaluate((e) => e.click());
const cards = await p.locator('#insights .ins-title').allTextContents();
ok(cards.some((t) => /is uncertain$/.test(t)), 'the day the models disagree is called uncertain', cards.join(' · '));
// (an umbrella only when it's needed or might be: the unit tests have which; nothing to say on a dry day)
ok(!cards.some((t) => /No umbrella|much the same|Shorter days|Longer days|Confident forecast|No big changes|Fresh air/.test(t)), 'only what\'s worth knowing: nothing to say there\'s nothing to say', cards.join(' · '));
// (a high UV today said by its tile, today's peak and when, whatever the time of day: so not again in the highlights)
{
  const uv = await p.textContent('#tiles [data-kind="uv"] .sub').catch(() => '');
  ok(/^Peaks at 7 \(high\) around \d\d:\d\d\.$/.test(uv) && !cards.some((t) => /UV/.test(t)), 'high UV today: its tile says so (and the highlights don\'t again)', `${uv} | ${cards.join(' · ')}`);
}
ok(/^Warmer than \d+% of days here since \d{4}\./.test(await p.textContent('#climate-body')), 'today against thirty years', (await p.textContent('#climate-body')).slice(0, 90));
// (those not worth it, named in a line under the rest; a tap shows them too, faded)
{
  const rated = await p.locator('#win-grid .win-rate').allTextContents(), line = await p.textContent('#win-poor').catch(() => null);
  ok(!rated.includes('Poor') && (line === null || /^(Not looking good|Nothing looking good today or tomorrow): \w/.test(line)), 'best times: only those worth it as tiles, the rest named in a line', `${rated.join(', ')} | ${line}`);
  if (line !== null) {
    await p.locator('#win-poor').evaluate((e) => e.click());
    ok(!(await p.locator('#win-poor').count()) && (await p.locator('#win-grid .win.poor').count()) > 0, 'which shows them, faded');
  }
}
ok((await p.locator('#win-grid .win').count()) >= 5, 'best times for a run, a walk, a ride, the washing, the stars or the sunset');
const wins = await p.locator('#win-grid .win').evaluateAll((ws) => ws.map((w) => [...w.children].map((c) => c.className).join(' ') + (w.querySelector('.win-day .win-rate') ? ' +rate' : '')));
ok(wins.every((x) => /^win-name win-day (win-time )?win-text \+rate$/.test(x)), 'each card the same lines (what, when and how good, the hours, why), so they line up', wins[0]);
{
  // (the chance the whole stretch stays dry, from the ensembles' runs pooled: ten of ECMWF's 51 and six of GFS's 31 wet
  // throughout the next three days, each system its say: 81%)
  const why = await p.locator('#windows .win-text').allTextContents();
  ok(why.filter((t) => /^81% chance it stays dry, /.test(t)).length >= 3, 'the best times give the chance the whole stretch stays dry', why.slice(0, 3).join(' | '));
}
// the briefing: what's coming first, in bold
{
  const lead = await p.textContent('#brief b'), all = await p.textContent('#brief');
  ok(/\.$/.test(lead) && all.startsWith(lead) && all.length > lead.length, 'the briefing\'s first sentence in bold, the rest after it', lead);
}
// the page in its usual order: the warnings, the next 4 hours, the next 48, right now, the 16 days, the radar, then the
// highlights and the rest; each tile drawn as well as said, and each opening to its hours in a sheet of its own (tapped
// where they are: not scrolled to, as the radar starts once it's scrolled to)
{
  const order = await p.evaluate(() => { const ids = ['alerts', 'nowcast', 'hourly', 'right-now', 'daily', 'radar', 'insights-card', 'windows', 'accuracy', 'climate'], els = ids.map((x) => document.getElementById(x));
    return { inOrder: els.every((e, i) => !i || !!(els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)), title: document.getElementById('insights-title').textContent }; });
  ok(order.inOrder && order.title === 'Highlights', 'the page in order: warnings, the next 4 hours, the next 48, right now, the 16 days, the radar, then the highlights and the rest', JSON.stringify(order));
  const drawn = await p.evaluate(() => ['feels .thermo', 'wind .compass', 'humidity .fbar i', 'rain .rbars rect', 'pressure .dial', 'visibility .meter.clear', 'uv .meter'].filter((s) => { const k = s.split(' ')[0]; return !document.querySelector(`#tiles [data-kind="${k}"] ${s.slice(k.length + 1)}`); }));
  ok(!drawn.length, 'feels like, humidity, rain, pressure and visibility drawn too: a thermometer, a bar, the next day\'s rain, a dial, a scale', drawn.join(', ') || 'all there');
  ok(!(await p.locator('#tiles [data-kind="sea"]').count()), 'inland (London): no sea tile (the nearest sea cell is too far out to be its sea)');
  // the Sun and the Moon: side by side, each a tile like the rest, opening to its times today and the week's
  const sm = await p.evaluate(() => { const [a, b] = ['sun', 'moon'].map((k) => document.querySelector(`#tiles [data-kind="${k}"]`)); const ra = a?.getBoundingClientRect(), rb = b?.getBoundingClientRect();
    return a && b && { side: Math.abs(ra.top - rb.top) < 2 && ra.right < rb.left, arc: !!a.querySelector('.sunarc'), sun: a.querySelector('.big').textContent, moon: b.querySelector('.big').textContent, tall: Math.round(Math.max(ra.height, rb.height)) }; });
  ok(sm?.side && sm.arc && /^\d\d:\d\d(Sunset|Sunrise)$/.test(sm.sun) && /^\d+%$/.test(sm.moon) && sm.tall < 220, 'the Sun and the Moon side by side, as tiles: when it next sets or rises, its path, how much of the Moon is lit', JSON.stringify(sm));
  for (const [kind, want] of [['sun', /Sunrise.*Morning golden hour.*Evening golden hour.*Sunset.*Dark by.*Daylight/], ['moon', /Moonrise.*Moonset.*Lit.*Full Moon/]]) {
    await p.locator(`#tiles [data-kind="${kind}"] .tile-open`).evaluate((e) => e.click());
    await p.waitForSelector('#detail[open]'); await p.waitForTimeout(400);
    const sheet = await p.evaluate(() => ({ title: document.getElementById('detail-title').textContent, kv: [...document.querySelectorAll('#detail-body .kv dt')].map((x) => x.textContent).join(' '), dd: [...document.querySelectorAll('#detail-body .kv dd')].map((x) => x.textContent), week: [...document.querySelectorAll('#detail-body .day-section')].some((x) => x.textContent === 'The week ahead') }));
    ok(want.test(sheet.kv) && sheet.week && !sheet.dd.includes('–') && sheet.dd.length >= 10, `${sheet.title}: its sheet, today's times (never just a dash) and the week's`, `${sheet.kv.slice(0, 120)} | ${sheet.dd.slice(0, 4).join(', ')}`);
    // (the sunset against yesterday's: said here, not in the highlights)
    if (kind === 'sun') ok(sheet.dd.some((x) => /^\d\d:\d\d \(\d+ min (earlier|later)\)$/.test(x)), 'the sunset, and how much earlier or later than yesterday\'s', sheet.dd.slice(0, 7).join(', '));
    await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.getElementById('detail').open);
  }
  for (const [kind, title] of [['wind', 'Wind'], ['pressure', 'Pressure'], ['uv', 'UV index']]) {
    await p.locator(`#tiles [data-kind="${kind}"] .tile-open`).evaluate((e) => e.click());
    await p.waitForSelector('#detail[open]');
    await p.waitForTimeout(500);
    const sheet = await p.evaluate(() => ({ title: document.getElementById('detail-title').textContent, now: !!document.querySelector('#detail .detail-now .big'), chart: !!document.querySelector('#detail-body .chart svg'), about: document.querySelector('#detail .detail-about')?.textContent || '', ways: document.querySelectorAll('#detail .way').length }));
    ok(sheet.title === title && sheet.now && sheet.chart && sheet.about.length > 20 && (kind !== 'wind' || sheet.ways === 8), `${title}: a tap opens its own sheet (now, its hours on a chart, what it means${kind === 'wind' ? ', which way every 3 hours' : ''})`, JSON.stringify(sheet).slice(0, 160));
    if (kind === 'wind') {
      // one tile's sheet to the next, sideways (or with the arrow keys), its dot moving along
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(400);
      const next = await p.evaluate(() => ({ title: document.getElementById('detail-title').textContent, dots: document.querySelectorAll('#detail-dots i').length, on: [...document.querySelectorAll('#detail-dots i')].findIndex((i) => i.classList.contains('on')) }));
      ok(next.title === 'Humidity' && next.dots >= 7 && next.on === 2, 'and on to the next tile\'s sheet, sideways, its dot along', JSON.stringify(next));
    }
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.getElementById('detail').open);
  }
}
const rows = await p.locator('.day-row').evaluateAll((rs) => rs.map((r) => Math.round(r.getBoundingClientRect().height)));
ok(new Set(rows).size === 1, 'the 16 days, every row the same height (rain chance or not)', [...new Set(rows)].join(', '));
await p.screenshot({ path: `${out}/wx-top.png` });
await p.screenshot({ path: `${out}/wx-full.png`, fullPage: true });
// a day, in full: the six models side by side
await p.locator('.day-row').nth(4).evaluate((e) => e.click());      // (the page redraws as the last of the forecast arrives)
await p.waitForSelector('#day[open]');
ok((await p.evaluate(() => document.activeElement?.id)) === 'day-title', 'the sheet opens on its title (said first, no ring on the close button)', await p.evaluate(() => document.activeElement?.id));
ok((await p.locator('#day table.models tr').count()) === 8, 'the day compares six models, and the tuned blend', String(await p.locator('#day table.models tr').count()));
ok(/^Tuned for here · forecast alone \d+° \/ \d+°$/.test(await p.textContent('#day .tuned-note')), 'and says it\'s tuned', await p.textContent('#day .tuned-note'));
{
  // (the hours tuned with it: the day's chart peaks at the high it gives, not the forecast's own)
  await p.waitForFunction(() => document.querySelector('#day .day-section + div text.c-label'), null, { timeout: 5000 }).catch(() => {});
  const hl = /High (-?\d+°) · Low (-?\d+°)/.exec(await p.textContent('#day .dt-sub')) || [];
  const labels = await p.evaluate(() => { const s = [...document.querySelectorAll('#day h3.day-section')].find((x) => x.textContent === 'Temperature'); return [...(s?.nextElementSibling?.querySelectorAll('text.c-label') || [])].map((t) => t.textContent); });
  ok(hl[1] && labels[0] === hl[1] && labels.includes(hl[2]), 'and its hours with it: the day\'s chart peaks at the tuned high and bottoms at the tuned low', `${labels.join(', ')} · ${hl.slice(1).join(' / ')}`);
}
ok(!/High \d+°, low/.test(await p.textContent('#day .day-desc')), 'in words that don\'t repeat the high and low beside them', await p.textContent('#day .day-desc'));
const likely = await p.locator('#day .stat span').allTextContents();
ok(likely.includes('Likely high') && likely.includes('Likely low') && likely.includes('Gusts'), 'the ensemble\'s likely high and low as facts, not a sentence', likely.join(' · '));
ok(/Low/.test(await p.textContent('#day .conf')), 'and says how sure it is', await p.textContent('#day .conf'));
await p.screenshot({ path: `${out}/wx-day.png` });
// the days along its top: another day without closing it (a tap, the arrow keys, a swipe sideways)
const title0 = await p.textContent('#day-title');
ok((await p.locator('#day-strip .ds-day').count()) === 16 && (await p.locator('#day-strip .ds-day[aria-current]').count()) === 1, 'the sheet has the days along its top, the one shown marked');
await p.locator('#day-strip .ds-day').nth(5).evaluate((e) => e.click());
const title1 = await p.textContent('#day-title');
await p.locator('#day-title').focus(); await p.keyboard.press('ArrowRight');
const title2 = await p.textContent('#day-title');
ok(title1 !== title0 && title2 !== title1 && (await p.evaluate(() => document.getElementById('day').open)), 'another day from the strip, then the next with the arrow key, the sheet staying open', `${title0} → ${title1} → ${title2}`);
{
  const cdp = await p.context().newCDPSession(p), box = await p.locator('#day .day-desc').boundingBox();
  const at = (x) => [{ x, y: box.y + box.height / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(box.x + 280) });
  for (const x of [240, 190, 130]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(box.x + x) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForFunction((t) => document.getElementById('day-title').textContent !== t, title2, { timeout: 1500 }).catch(() => {});
  ok((await p.textContent('#day-title')) !== title2 && (await p.evaluate(() => document.getElementById('day').open)), 'and a swipe to the left moves on a day (the sheet staying open: sideways isn\'t down)', `${title2} → ${await p.textContent('#day-title')}`);
  // the day follows the finger, and from a short swipe springs back
  const box2 = await p.locator('#day .day-desc').boundingBox(), at2 = (x) => [{ x, y: box2.y + box2.height / 2 }], title3 = await p.textContent('#day-title');
  await p.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at2(box2.x + 200) });
  for (const x of [215, 230, 250, 262]) { await p.waitForTimeout(16); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at2(box2.x + x) }); }
  await p.waitForTimeout(60);
  const dayShift = await p.evaluate(() => { const t = getComputedStyle(document.getElementById('day-body')).translate; return t === 'none' ? 0 : Math.round(parseFloat(t)); });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(600);
  ok(dayShift === 32 && (await p.textContent('#day-title')) === title3 && (await p.evaluate(() => getComputedStyle(document.getElementById('day-body')).translate)) === 'none', 'the day follows the finger, and from a short swipe springs back', `${dayShift} px for 32 px`);
}
await p.keyboard.press('Escape');
// the forecast's track record here, and tuned by it
const acc = await p.locator('#accuracy-body tr').allTextContents();
ok(acc.length === 7 && /^ECMWFBest±0\.5°/.test(acc[1]) && /GEM.*2\.5° cold/.test(acc[6]), 'each model scored against the nearest airport, best first', acc.slice(1, 3).join(' | '));
ok(/^London City Airport \(\d+(\.\d)? mi\) · last \d+ days/.test(await p.textContent('#accuracy-body')), 'named, with how far away it is (in miles, as the wind\'s in mph)', (await p.textContent('#accuracy-body')).slice(0, 50));
ok(!/null/.test(await p.textContent('#accuracy-body')), 'with nothing stray under it', (await p.textContent('#accuracy-body')).slice(-60));
{
  // (the forecast shown had been a degree warm through the night, a degree too humid, and the wind too light)
  const also = await p.textContent('#accuracy-body .chart-note:last-child').catch(() => '');
  ok(/^Also tuned here: nights 0\.\d° cooler, dew point 0\.\d° lower, wind \d+% stronger\.$/.test(also), 'and what else the airport\'s reports have the hours tuned for', also);
}
// the design carries it, not notes: no captions under the charts, the next 4 hours on a light, moderate and heavy scale
ok(!(await p.locator('#nowcast .chart-note, #hourly .chart-note, #daily .chart-note').count()), 'no notes under the charts');
const bands = await p.locator('#nowcast-chart text.c-in').allTextContents();
ok(bands.join(',') === 'Light,Moderate,Heavy', 'the next 4 hours on a scale of light, moderate and heavy, in place of mm an hour', bands.join(','));
{
  // (each in a margin of its own: no column runs under one)
  const clear = await p.evaluate(() => { const r = (s) => [...document.querySelectorAll(`#nowcast-chart ${s}`)].map((x) => x.getBoundingClientRect()); return Math.round(Math.min(...r('text.c-in').map((x) => x.left)) - Math.max(...r('.c-col').map((x) => x.right))); });
  ok(clear >= 4, 'and those words clear of the columns', `${clear} px apart`);
}
ok((await p.textContent('#days .far-note')) === 'Less certain', 'the far days under a slim divider', await p.textContent('#days .far-note'));
ok(!cards.some((t) => /^Most accurate here/.test(t)) && /^ECMWFBest/.test(acc[1]), 'which model to trust: in the accuracy card, not again in the highlights', `${acc[1]} | ${cards.join(' · ')}`);
// every source in one window, from one line at the foot of the page
ok(!(await p.locator('.foot a').count()) && /^Learn more about weather data and map data\.$/.test((await p.textContent('.foot-note')).replace(/\s+/g, ' ').trim()), 'the footer: one line, to the credits', await p.textContent('.foot-note'));
await p.locator('.foot-note [data-credits="weather"]').evaluate((e) => e.click());
await p.waitForSelector('#credits[open]');
const links = await p.locator('#credits .credits a').evaluateAll((as) => as.map((a) => `${a.href} ${a.target} ${a.rel}`));
ok(links.length === 19 && ['open-meteo.com', 'metoffice.gov.uk', 'climate.copernicus.eu', 'atmosphere.copernicus.eu', 'marine.copernicus.eu', 'meteoalarm.org', 'weather.gov/', 'environment.data.gov.uk', 'aviationweather.gov', 'rainviewer.com', 'openfreemap.org', 'openmaptiles.org', 'openstreetmap.org/copyright', 'naturalearthdata.com', 'maplibre.org', 'leafletjs.com', 'bigdatacloud.com', 'nominatim.org', 'geonames.org'].every((x) => links.some((l) => l.includes(x))) && links.every((l) => / _blank noopener$/.test(l)),
  'a credits window: every source, each linked out', `${links.length} links`);
ok((await p.evaluate(() => document.querySelector('#credits .sheet-body').scrollTop)) === 0 && /national weather service/.test(await p.textContent('#credits .credits-note')), 'open at the weather data, with a notice at its foot');
{
  // (Open-Meteo's credit, as it asks for it, at the top of the weather data, in sight as it opens: linked to it and to
  // the licence; measured within the sheet, which may still be sliding up)
  const lead = await p.evaluate(() => { const l = document.querySelector('#cr-weather + .credits-lead'); return l && { text: l.textContent.replace(/\s+/g, ' ').trim(), links: [...l.querySelectorAll('a')].map((a) => `${a.href} ${a.target} ${a.rel}`), seen: (() => { const b = l.closest('.sheet-body'); return l.getBoundingClientRect().bottom - b.getBoundingClientRect().top < b.clientHeight; })() }; });
  ok(lead?.text === 'Weather data by Open-Meteo.com (CC BY 4.0).' && lead.seen && lead.links.length === 2 && /^https:\/\/open-meteo\.com\/ _blank noopener$/.test(lead.links[0]) && /creativecommons\.org\/licenses\/by\/4\.0\/ _blank noopener$/.test(lead.links[1]), 'Open-Meteo\'s credit at the top of the weather data, linked', JSON.stringify(lead));
}
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/wx-credits.png` });
await p.keyboard.press('Escape');
await p.waitForFunction(() => !document.getElementById('credits').open);
// the bar at the top: the place as tall as the buttons beside it (a finger's width); warnings under a heading of their own
ok(Math.round((await p.locator('#place-btn').boundingBox()).height) >= 44, 'the place button is a finger tall', String((await p.locator('#place-btn').boundingBox()).height));
ok(/^Warnings?$/.test(await p.textContent('#alerts h2.sr-only')), 'warnings under their own heading (not read as part of the card before)');
ok((await p.getAttribute('meta[name="theme-color"]', 'content')) !== '#2b5d96' || (await p.evaluate(() => document.body.dataset.sky)) === 'partly-day', 'the browser\'s own colour follows the sky', await p.getAttribute('meta[name="theme-color"]', 'content'));
// pull past the top and let go: it refreshes (the page's scroll below zero, as an iPhone's goes when pulled)
{
  const n0 = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => /api\.open-meteo\.com\/v1\/forecast/.test(r.name)).length);
  await p.evaluate(() => scrollTo(0, 0));
  await p.evaluate(async () => {
    const t = (type) => { const touch = new Touch({ identifier: 1, target: document.body, clientX: 200, clientY: 300 }); window.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true })); };
    const real = Object.getOwnPropertyDescriptor(window, 'scrollY');
    t('touchstart');
    Object.defineProperty(window, 'scrollY', { get: () => -110, configurable: true }); window.dispatchEvent(new Event('scroll'));
    t('touchend');
    if (real) Object.defineProperty(window, 'scrollY', real); else delete window.scrollY;
    window.dispatchEvent(new Event('scroll'));
  });
  await p.waitForFunction((n0) => performance.getEntriesByType('resource').filter((r) => /api\.open-meteo\.com\/v1\/forecast/.test(r.name)).length > n0, n0, { timeout: 8000 }).then(() => true, () => false)
    .then((x) => ok(x, 'pulled down past the top and let go, it fetches the forecast again'));
}
// its spinner: only until the forecast's in (not everything behind it), gone if the page is scrolled on meanwhile,
// and no longer than 15 seconds whatever happens
{
  const { ctx: c4, p } = await open({ rainIn: 30 }, { settle: false });
  await p.waitForTimeout(1500);
  const pull = () => p.evaluate(() => {
    const t = (type) => { const touch = new Touch({ identifier: 1, target: document.body, clientX: 200, clientY: 300 }); window.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true })); };
    const real = Object.getOwnPropertyDescriptor(window, 'scrollY');
    t('touchstart');
    Object.defineProperty(window, 'scrollY', { get: () => -110, configurable: true }); window.dispatchEvent(new Event('scroll'));
    t('touchend');
    if (real) Object.defineProperty(window, 'scrollY', real); else delete window.scrollY;
    window.dispatchEvent(new Event('scroll'));
  });
  const ring = () => p.evaluate(() => { const r = document.querySelector('.ptr'), pg = document.querySelector('.page'); return { busy: r.classList.contains('busy'), seen: +getComputedStyle(r).opacity > 0.05, held: Math.round(new DOMMatrix(getComputedStyle(pg).transform).m42) }; });
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
  // the forecast a second and a half in coming, the ensemble 20 seconds: it spins until the forecast's in, not the ensemble
  const slowEnsemble = async (r) => { await wait(20000); r.fulfill({ status: 404, body: '{}', headers: { 'Access-Control-Allow-Origin': '*' } }).catch(() => {}); };
  const soonForecast = async (r) => { await wait(1500); r.fallback().catch(() => {}); };
  await p.route(/ensemble-api/, slowEnsemble);
  await p.route(/api\.open-meteo\.com\/v1\/forecast\?.*current=/, soonForecast);
  const t0 = Date.now();
  await pull(); await p.waitForTimeout(600);
  const spinning = await ring();
  await p.waitForFunction(() => !document.querySelector('.ptr').classList.contains('busy'), null, { timeout: 8000 }).catch(() => {});
  const took = Date.now() - t0;
  await p.waitForTimeout(700);
  const after = await ring();
  ok(spinning.busy && spinning.seen && took < 6000 && !after.seen && /^Updated just now/.test(await p.textContent('#updated')), 'pulled to refresh: it spins until the forecast\'s in, then goes (not waiting on everything else, here the ensemble)', `${JSON.stringify([spinning, after])}; ${took} ms`);
  ok(spinning.held === 56 && after.held === 0, 'and meanwhile the page is held open at its top, the spinner in the gap, then glides back up', `${spinning.held} px, then ${after.held}`);
  await p.unroute(/ensemble-api/, slowEnsemble);
  await p.unroute(/api\.open-meteo\.com\/v1\/forecast\?.*current=/, soonForecast);
  // the forecast 4 seconds in coming, and the page scrolled on meanwhile: the spinner goes with it, and back at the top it's there
  const slowForecast = async (r) => { await wait(4000); r.fallback().catch(() => {}); };
  await p.route(/api\.open-meteo\.com\/v1\/forecast\?.*current=/, slowForecast);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  await pull(); await p.waitForTimeout(300);
  await p.evaluate(() => scrollTo(0, 700)); await p.waitForTimeout(700);
  const scrolled = await ring();
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
  const back = await ring();
  await p.waitForFunction(() => !document.querySelector('.ptr').classList.contains('busy'), null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(500);
  ok(scrolled.busy && !scrolled.seen && !scrolled.held && back.busy && !back.seen && !back.held && !(await ring()).seen, 'scrolled on while it spins, the gap closes and it goes (and stays gone: the page doesn\'t jump back down)', JSON.stringify([scrolled, back, await ring()]));
  await p.unroute(/api\.open-meteo\.com\/v1\/forecast\?.*current=/, slowForecast);
  // let go of short of refreshing: it goes, and nothing's fetched
  {
    const n0 = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => /api\.open-meteo\.com\/v1\/forecast\?.*current=/.test(r.name)).length);
    await p.evaluate(() => {
      const t = (type) => { const touch = new Touch({ identifier: 1, target: document.body, clientX: 200, clientY: 300 }); window.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true })); };
      const real = Object.getOwnPropertyDescriptor(window, 'scrollY');
      t('touchstart'); Object.defineProperty(window, 'scrollY', { get: () => -45, configurable: true }); window.dispatchEvent(new Event('scroll'));
      window.__half = +getComputedStyle(document.querySelector('.ptr')).opacity;
      t('touchend'); if (real) Object.defineProperty(window, 'scrollY', real); else delete window.scrollY; window.dispatchEvent(new Event('scroll'));
    });
    await p.waitForTimeout(700);
    const n1 = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => /api\.open-meteo\.com\/v1\/forecast\?.*current=/.test(r.name)).length);
    ok(await p.evaluate(() => window.__half) > 0.3 && !(await ring()).seen && !(await ring()).busy && n1 === n0, 'pulled only part way: some of the spinner shows, and let go, it goes without refreshing', `${await p.evaluate(() => window.__half)}; ${n1 - n0} fetched`);
  }
  // and whatever happens, no more than 15 seconds
  const never = async () => {};
  await p.route(/api\.open-meteo\.com\/v1\/forecast\?.*current=/, never);
  await pull(); await p.waitForTimeout(300);
  const stuck = (await ring()).busy;
  await p.waitForFunction(() => !document.querySelector('.ptr').classList.contains('busy'), null, { timeout: 17000 }).catch(() => {});
  ok(stuck && !(await ring()).busy, 'and an answer that never comes keeps it spinning no more than 15 seconds');
  await c4.close();
}
// the radar, on the vector map: OpenFreeMap's, drawn with WebGL in the app's own style, the radar under its names
await p.locator('#radar').scrollIntoViewIfNeeded();
await p.waitForSelector('#radar .maplibregl-canvas', { timeout: 20000 });
// as it appears: its credits in full, in two lines (four names don't fit in one), clear of the scale; nothing else at its foot yet
await p.waitForSelector('#radar .radar-credit', { timeout: 20000 });
const foot0 = await p.evaluate(() => {
  const r = (s) => document.querySelector(`#radar ${s}`).getBoundingClientRect(), t = document.querySelector('#radar .rc-t'), c = r('.rc-t'), sc = r('.map-scale');
  return { folded: document.querySelector('#radar .radar-credit').classList.contains('folded'), whole: t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1, lines: t.textContent.split('\n').length, clear: c.left >= sc.right + 4, hint: document.querySelector('#radar .radar-hint').hidden };
});
ok(!foot0.folded && foot0.whole && foot0.lines === 2 && foot0.clear && foot0.hint, 'as the map appears: its credits in full (two lines, none of it cut off, clear of the scale), nothing else at its foot yet', JSON.stringify(foot0));
await p.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 });
ok(/starting in about/.test(await p.textContent('#radar .radar-note')) && !(await p.isVisible('#radar .radar-note')), 'with the next few hours in a line above it, for full screen (the card above says it otherwise)', await p.textContent('#radar .radar-note'));
ok((await p.locator('#radar .radar-legend .rl-bar').count()) === 2 && /Light.*Heavy.*Extreme/.test(await p.textContent('#radar .rl-words')) && /Now/.test(await p.textContent('#radar .radar-scale')), 'a legend (the radar\'s colours, light to extreme, and snow\'s), and a timeline marked Now');
await p.waitForFunction(() => document.querySelector('#radar .radar-map').classList.contains('drawn'), null, { timeout: 8000 }).catch(() => {});
ok(tiles.tilejson > 0 && tiles.vector > 0 && tiles.map === 0 && await p.evaluate(() => document.querySelector('#radar .radar-map').classList.contains('drawn')),
  'the vector map: OpenFreeMap\'s tiles (and none of OpenStreetMap\'s own)', JSON.stringify(tiles));
// (a press on one of the map's buttons that the card keeps out of sight on a phone: there for full screen)
const press = (pg, sel) => pg.evaluate((sel) => document.querySelector(sel).click(), sel);
{
  const card = await p.evaluate(() => { const v = (s) => { const e = document.querySelector(`#radar ${s}`); if (!e) return 'none'; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    return { zoomIn: v('.map-in'), centre: v('.radar-centre'), layers: v('.map-layers'), coarse: matchMedia('(pointer: coarse)').matches, cls: document.getElementById('radar').className }; });
  // (as the browser says its pointer is: a finger, the layers button alone, a tap opening the map full screen; a mouse, all
  // of them, as it zooms and pans in the card)
  ok(card.layers === true && (card.coarse ? card.zoomIn === false && card.centre === false : card.zoomIn === true && card.centre === true),
    'in the card, the layers button alone with a finger (a tap opens it full screen), all of them with a mouse', JSON.stringify(card));
}
ok(await p.locator('#radar .map-zoom button').count() === 2 && await p.locator('#radar .radar-centre').count() === 1 && /^\d+ mi$/.test(await p.textContent('#radar .map-scale')),
  'buttons to zoom in and out and back to the place, and a scale (in miles, as the wind is)', await p.textContent('#radar .map-scale'));
ok(await p.evaluate(() => { const c = document.querySelector('#radar .maplibregl-canvas'); return document.querySelectorAll('[role="region"][aria-label="Rain radar map"]').length === 1 && c.getAttribute('aria-label') === 'Rain radar map'; }), 'named once for a screen reader (its canvas, not its frame too)');
// its credits: in full as it appears, then folded into a © that opens them all, at the map's
const credit = await p.getAttribute('#radar .radar-credit', 'aria-label');
ok(/^Map data © OpenFreeMap, OpenMapTiles, OpenStreetMap, RainViewer/.test(credit) && !(await p.locator('#radar .maplibregl-ctrl-attrib').count()), 'the map credited, on the map', credit);
await p.waitForFunction(() => document.querySelector('#radar .radar-credit').classList.contains('folded'), null, { timeout: 8000 }).then(() => true, () => false).then((x) => ok(x, 'folding into a © after a few seconds'));
// then "Tap to explore" comes in at the map's foot, between the scale and the ©: as far in as the ©, and as tall
await p.waitForFunction(() => !document.querySelector('#radar .radar-hint').hidden, null, { timeout: 3000 }).catch(() => {});
await p.waitForTimeout(800);
const foot = await p.evaluate(() => {
  const r = (s) => document.querySelector(`#radar ${s}`).getBoundingClientRect(), m = r('.radar-map'), h = r('.radar-hint'), c = r('.radar-credit'), sc = r('.map-scale');
  return { hint: Math.round(m.bottom - h.bottom), credit: Math.round(m.bottom - c.bottom), tall: [Math.round(h.height), Math.round(c.height)], off: Math.round(Math.abs((h.left + h.right) / 2 - (m.left + m.right) / 2)), clear: h.left > sc.right && h.right < c.left };
});
ok(foot.hint === 10 && foot.credit === 10 && foot.tall[0] === 26 && foot.tall[1] === 26 && foot.off <= 1 && foot.clear,
  'then "Tap to explore" at the map\'s foot: in the middle, as far in as the © and as tall, clear of it and the scale', JSON.stringify(foot));
await p.locator('#radar .radar-credit').evaluate((e) => e.click());
await p.waitForSelector('#credits[open]');
const at = await p.evaluate(() => { const b = document.querySelector('#credits .sheet-body'), want = document.getElementById('cr-map').offsetTop - b.offsetTop - 12; return { top: b.scrollTop, want: Math.min(want, b.scrollHeight - b.clientHeight) }; });
ok(at.top > 0 && Math.abs(at.top - at.want) <= 2 && !(await p.evaluate(() => document.getElementById('radar').classList.contains('radar-big'))), 'which opens the credits at the map\'s (not the map full screen)', JSON.stringify(at));
await p.keyboard.press('Escape');
await p.waitForFunction(() => !document.getElementById('credits').open);
// playing: on minute by minute, as smoothly as the screen goes (not ten minutes a step)
{
  // (over the radar's hours and the next two: after those, the models' hours go a step every three minutes, an hour a beat)
  const seen = await p.evaluate(async () => { const s = document.querySelector('#radar .radar-slider'), out = []; for (let k = 0; k < 80; k++) { out.push(Number(s.value)); await new Promise((r) => setTimeout(r, 50)); } return out; });
  const split = Number(await p.getAttribute('#radar .radar-slider', 'data-split')) || Infinity;
  const steps = seen.slice(1).map((v, k) => (v <= split ? v - seen[k] : 0)).filter((d) => d > 0);
  ok(steps.length >= 10 && steps.every((d) => d <= 4), 'playing, it runs on minute by minute', `${steps.length} moves, the largest ${Math.max(...steps)} min`);
}
const was = await p.getAttribute('#radar .radar-play', 'data-on');
await p.click('#radar .radar-play');
ok(was === '1' && (await p.getAttribute('#radar .radar-play', 'data-on')) === '0', 'it plays by itself, and pauses');
// (the slider counts minutes from the first of the radar's 13 frames, ten minutes apart: the latest's is 120; Now is
// where it's marked, the clock's own time, a few minutes after: the radar's always a little behind)
const toMinute = (pg, back = 0) => pg.evaluate((back) => { const s = document.querySelector('#radar .radar-slider'); s.value = String(120 - back); s.dispatchEvent(new Event('input')); }, back);
const toNow = (pg, on = 0) => pg.evaluate((on) => { const s = document.querySelector('#radar .radar-slider'); s.value = String(Math.round(s.max * parseFloat(s.style.getPropertyValue('--nowf'))) + on); s.dispatchEvent(new Event('input')); }, on);
{
  const gapOf = await p.evaluate(() => { const s = document.querySelector('#radar .radar-slider'); return Math.round(s.max * parseFloat(s.style.getPropertyValue('--nowf'))) - 120; });
  // (set and read in one go: the clock moving on to the next minute in between would move Now under it)
  const atNow = (on) => p.evaluate((on) => {
    const s = document.querySelector('#radar .radar-slider'); s.value = String(Math.round(s.max * parseFloat(s.style.getPropertyValue('--nowf'))) + on); s.dispatchEvent(new Event('input'));
    return [document.querySelector('#radar .radar-time').textContent, [...document.querySelectorAll('#radar .radar-chip .rc-l')].filter((x) => getComputedStyle(x).position !== 'absolute').map((x) => x.textContent).join('|')];
  }, on);
  const [now, nowChip] = await atNow(0), [next, nextChip] = await atNow(1);
  ok(/^(Latest radar|Radar) [A-Z][a-z]+day \d\d:\d\d · now$/.test(now) && nowChip === 'Radar' && /^Forecast [A-Z][a-z]+day \d\d:\d\d · in 1 min$/.test(next) && nextChip === 'Forecast',
    'Now is now: the radar up to it (carried on from its latest meanwhile), the forecast after it', `${now} (${nowChip}) | ${next} (${nextChip}); now ${gapOf} min after the latest radar`);
  await toMinute(p, -1); const gap = await p.textContent('#radar .radar-time'), gapChip = await chipSays(p);
  ok(gapOf < 2 || (/^Radar [A-Z][a-z]+day \d\d:\d\d · \d+ min ago$/.test(gap) && gapChip === 'Radar'), 'a minute after the latest radar, before now: so many minutes ago, never "forecast"', `${gap} (${gapChip}); now ${gapOf} min after it`);
}
await toMinute(p);
ok(/^Latest radar [A-Z][a-z]+day \d\d:\d0 · (\d+ min ago|now)$/.test(await p.textContent('#radar .radar-time')) && (await chipSays(p)) === 'Radar' && tiles.radar > 0, 'the radar: two hours of frames over the map, up to the latest (said how long ago it was)', `${tiles.radar} radar tiles; ${await p.textContent('#radar .radar-time')}`);
// to the minute: five minutes before the latest, between two of its frames, blended on the graphics chip (the frames'
// rain the same, here: the blend the same rain); a tick under each of the radar's frames; Page Up and Down from frame to frame
{
  await toMinute(p, 5);
  await p.waitForFunction(() => (window.__glread?.()?.solid ?? 0) > 1000, null, { timeout: 10000 }).catch(() => {});
  const mid = await p.evaluate(() => ({ label: document.querySelector('#radar .radar-time').textContent, gl: __glread(), step: document.querySelector('#radar .radar-slider').step, ticks: document.querySelectorAll('#radar .rs-t:not(.rs-h)').length }));
  ok(/^Radar [A-Z][a-z]+day \d\d:\d5 · \d+ min ago$/.test(mid.label) && mid.gl?.solid > 1000 && mid.gl.w % 256 === 0 && mid.step === '1' && mid.ticks === 13,
    'the slider to the minute: between two frames, blended on the graphics chip, a tick under each of the radar\'s 13 frames', JSON.stringify(mid));
  await p.focus('#radar .radar-slider');
  await p.keyboard.press('PageDown'); const back = await p.textContent('#radar .radar-time');
  await p.keyboard.press('PageUp'); const on = await p.textContent('#radar .radar-time');
  ok(/^Radar [A-Z][a-z]+day \d\d:\d0 · \d+ min ago$/.test(back) && /^Latest radar /.test(on), 'Page Down to the frame before, Page Up on to the next ones', `${back} | ${on}`);
  await toMinute(p);
}
// closer in than the radar's tiles go, it's smoothed: drawn in its own blue, with an edge that fades rather than steps
const scale0 = await p.textContent('#radar .map-scale');
ok(scale0 === '10 mi', 'it opens close in: 10 miles to the scale', scale0);
await press(p, '#radar .map-in'); await p.waitForTimeout(450);
await p.waitForFunction(() => __tiles.filter((t) => t.rain > 1000).length >= 4, null, { timeout: 15000, polling: 250 }).catch(() => {});
const drawn = await p.evaluate(() => __tiles.reduce((a, t) => ({ rain: a.rain + t.rain, soft: a.soft + t.soft, blue: a.blue + t.blue, tiles: a.tiles + 1 }), { rain: 0, soft: 0, blue: 0, tiles: 0 }));
ok(drawn.rain > 1000 && drawn.blue > drawn.rain * 0.9 && drawn.soft > 100, 'enlarged, the radar is smoothed: rain in its own blue, with soft edges', JSON.stringify(drawn));
ok(await p.textContent('#radar .map-scale') !== scale0 && !(await p.isDisabled('#radar .map-in')) && !(await p.isDisabled('#radar .map-out')), 'zoomed in a step, the scale shorter', `${scale0} → ${await p.textContent('#radar .map-scale')}`);
await press(p, '#radar .map-in'); await p.waitForTimeout(450);
ok(await p.isDisabled('#radar .map-in'), 'and a step more, no closer than the radar\'s worth seeing (zoom in greys out)');
await press(p, '#radar .radar-centre'); await p.waitForTimeout(900);
ok(await p.textContent('#radar .map-scale') === scale0, 'back to the place at its own zoom', await p.textContent('#radar .map-scale'));
await p.waitForTimeout(600);
const after = await p.evaluate(() => ({ label: document.querySelector('#radar .radar-time').textContent, gl: __glread() }));
ok(/^Latest radar [A-Z][a-z]+day \d\d:\d\d · (\d+ min ago|now)$/.test(after.label) && after.gl?.solid > 1000, 'moved and zoomed while paused: the same time, still drawn', JSON.stringify(after));
// the next two hours: the latest radar carried along its own track (here it isn't moving), marked as forecast
await p.evaluate(() => { const s = document.querySelector('#radar .radar-slider'); s.value = s.dataset.split || s.max; s.dispatchEvent(new Event('input')); });
ok((await chipSays(p)) === 'Forecast' && /^Forecast [A-Z][a-z]+day \d\d:\d\d · in (\d+ h( \d+ min)?|\d+ min)$/.test(await p.textContent('#radar .radar-time')) && tiles.grid === 0 && Number(await p.getAttribute('#radar .radar-slider', 'max')) >= 230,
  'then the radar carried on two hours, marked as forecast (not the models\' grid: never asked for)', `${await p.textContent('#radar .radar-time')}; ${tiles.grid} grid requests`);
ok(!(await p.isVisible('#radar .radar-status')), 'with no note under it (only when something\'s missing)', await p.textContent('#radar .radar-status'));
// (two hours on, the latest radar carried on, faded to 70%: a strongest pixel of about 0.7 of the radar's: its 30 dBZ
// is drawn a little see-through, as Apple's map draws it, at about 200 of 255)
await p.waitForFunction(() => { const g = window.__glmix; if (!g) return false; const c = document.createElement('canvas'); c.width = g.width; c.height = g.height; const x = c.getContext('2d'); x.drawImage(g, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let top = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > top) top = d[i]; window.__top = top; return top >= 120 && top <= 165; }, null, { timeout: 15000, polling: 250 })
  .then(() => true, () => false).then(async (x) => ok(x, 'the last forecast minutes drawn from the radar, in its colours, fading the further ahead', `strongest ${await p.evaluate(() => window.__top)}`));
// every icon sits in its button's middle (one wrapped in a span used to sit high: the room a line of text keeps for descenders)
const offMiddle = await p.evaluate(() => [...document.querySelectorAll('#radar .icon-btn, .top .icon-btn, .radar-centre, #radar .map-zoom button')].map((b) => {
  const s = [...b.querySelectorAll('svg')].find((x) => getComputedStyle(x.closest('span') || x).opacity !== '0'); if (!s) return null;
  const r = b.getBoundingClientRect(), q = s.getBoundingClientRect(); return Math.round(Math.abs((q.top + q.height / 2) - (r.top + r.height / 2)) * 10) / 10;
}).filter((x) => x != null));
ok(offMiddle.length >= 6 && offMiddle.every((d) => d < 0.6), 'every icon in its button\'s middle (play, full screen, the map\'s, the bar\'s)', offMiddle.join(', '));
await p.click('#radar .radar-full');
// (growing into it: the switch comes a frame later, once the page as it was has been captured to morph from)
ok(await p.waitForFunction(() => document.getElementById('radar').classList.contains('radar-big'), null, { timeout: 3000 }).then(() => true, () => false), 'full screen');
await p.waitForTimeout(700);
const fills = await p.evaluate(() => { const m = document.querySelector('#radar .radar-map').getBoundingClientRect(), c = document.querySelector('#radar .maplibregl-canvas').getBoundingClientRect(); return Math.abs(m.width - c.width) < 1 && Math.abs(m.height - c.height) < 1 && m.height > 500; });
ok(fills, 'the map filling it, edge to edge');
await p.screenshot({ path: `${out}/wx-radar.png` });
// (the page under it out of reach meanwhile: Tab goes round the map's own controls, never to a card hidden under it)
const tabbed = [];
for (let k = 0; k < 14; k++) { await p.keyboard.press('Tab'); tabbed.push(await p.evaluate(() => { const a = document.activeElement; return a === document.body ? 'body' : a?.closest('#radar') ? 'map' : `${a?.tagName}.${a?.className}`; })); }
ok(tabbed.includes('map') && tabbed.every((t) => t === 'map' || t === 'body'), 'full screen, Tab stays on the map', tabbed.join(', '));
await p.keyboard.press('Escape');
ok(await p.waitForFunction(() => !document.getElementById('radar').classList.contains('radar-big'), null, { timeout: 3000 }).then(() => true, () => false), 'and back');
const closedFocus = await p.evaluate(() => ({ on: !!document.activeElement?.matches('#radar .radar-full'), foot: document.querySelector('.foot').inert, pv: document.querySelector('.pv-prev').inert }));
ok(closedFocus.on && !closedFocus.foot && closedFocus.pv, 'focus on its × again, and the page in reach again (the places either side\'s pages still not)', JSON.stringify(closedFocus));
// the map's layers, as Apple's: the wind, flowing, its bubble saying which way and how strong, by the hour from two hours
// ago to twelve on; the temperature, its bubble the temperature there; and back to the rain, each kept as chosen
{
  const st = () => p.evaluate(() => { const c = document.getElementById('radar'), pin = document.querySelector('.map-pin'); return { layer: c.dataset.layer, title: c.querySelector('.card-title').textContent.trim(),
    legend: c.querySelector('.rl-title')?.textContent, kind: pin?.dataset.kind || '', bubble: pin?.querySelector('.mp-bubble').textContent, max: c.querySelector('.radar-slider').max, label: c.querySelector('.radar-time').textContent,
    flow: !c.querySelector('.wind-flow')?.hidden, inMap: !!c.querySelector('.wind-flow.in-map'), ticks: c.querySelectorAll('.rs-t').length, kept: localStorage.getItem('wx:maplayer'), pressed: c.querySelector('.layer-menu [aria-pressed="true"]')?.dataset.kind }; });
  const pick = async (k) => { await p.click('#radar .map-layers'); await p.click(`#radar .layer-menu [data-kind="${k}"]`); };
  await p.evaluate(() => { const b = document.querySelector('#radar .radar-play'); if (b.dataset.on === '1') b.click(); });
  await p.click('#radar .map-layers');
  ok(await p.isVisible('#radar .layer-menu') && (await p.getAttribute('#radar .map-layers', 'aria-expanded')) === 'true' && (await p.locator('#radar .layer-menu button').allTextContents()).join() === 'Precipitation,Temperature,Wind,Air quality,UV index',
    'the layers button opens its menu: precipitation, temperature, wind, air quality, UV index');
  await p.keyboard.press('Escape');
  // (it closes the way it opened, a little quicker, and is hidden once it has)
  await p.waitForFunction(() => document.querySelector('#radar .layer-menu').hidden, null, { timeout: 2000 }).catch(() => {});
  ok(!(await p.isVisible('#radar .layer-menu')), 'and Escape closes it');
  const asked = tiles.field || 0;
  await pick('wind');
  const wind = await p.waitForFunction(() => document.getElementById('radar').dataset.layer === 'wind' && document.querySelector('.map-pin')?.dataset.kind === 'wind', null, { timeout: 15000 }).then(st, st);
  ok(wind.layer === 'wind' && wind.title === 'Wind' && wind.legend === 'Wind (mph)' && /^[NESW]{1,3}\d+MPH$/.test(wind.bubble) && wind.flow && wind.inMap && wind.max === '840' && wind.ticks === 15 && /^Wind [A-Z][a-z]+day \d\d:\d\d · now$/.test(wind.label) && wind.kept === 'wind' && wind.pressed === 'wind' && (tiles.field || 0) === asked + 1,
    'the wind: flowing over the map, its bubble which way and how strong, by the hour two hours back to twelve on, and kept', JSON.stringify(wind));
  // and its gusts, chosen beside its colours (and kept): the colours, the bubble and the words of them
  await p.click('#radar .rl-switch button:nth-child(2)');
  const gust = await p.evaluate(() => ({ legend: document.querySelector('#radar .rl-title').textContent, label: document.querySelector('#radar .radar-time .rt-k').textContent, bubble: document.querySelector('.map-pin .mp-t').textContent,
    pressed: document.querySelector('#radar .rl-switch [aria-pressed="true"]')?.textContent, kept: localStorage.getItem('wx:mapgusts'), focus: document.activeElement?.textContent }));
  ok(gust.legend === 'Wind gusts (mph)' && gust.label === 'Wind gusts' && Number(gust.bubble) > Number(wind.bubble.match(/\d+/)[0]) && gust.pressed === 'Gusts' && gust.kept === '1' && gust.focus === 'Gusts',
    'its gusts, chosen beside its colours: stronger, and said as such', JSON.stringify(gust));
  await p.click('#radar .rl-switch button:nth-child(1)');
  await pick('temp');
  const temp = await p.waitForFunction(() => document.querySelector('.map-pin')?.dataset.kind === 'temp', null, { timeout: 5000 }).then(st, st);
  ok(temp.layer === 'temp' && temp.title === 'Temperature' && /^Temperature \(°[CF]\)$/.test(temp.legend) && /^-?\d+°$/.test(temp.bubble) && !temp.flow && temp.max === '840' && (tiles.field || 0) === asked + 1,
    'the temperature: its bubble the temperature there, from the same models\' grid (not asked for again)', JSON.stringify(temp));
  for (let k = 0; k < 25 && !tiles.fine; k++) await p.waitForTimeout(200);
  ok((tiles.fine || 0) >= 1, 'and a finer grid of it about the place, over the region\'s', `${tiles.fine} asked`);
  await pick('aq');
  const aq = await p.waitForFunction(() => document.getElementById('radar').dataset.layer === 'aq' && document.querySelector('.map-pin')?.dataset.kind === 'temp', null, { timeout: 8000 }).then(st, st);
  const words = await p.textContent('#radar .rl-words');
  ok(aq.title === 'Air quality' && aq.legend === 'Air quality (European index)' && words === 'GoodFairModeratePoorVery poor' && /^\d+$/.test(aq.bubble) && !aq.flow && aq.max === '840' && /^Air quality [A-Z][a-z]+day \d\d:\d\d · now$/.test(aq.label) && (tiles.aq || 0) === 1,
    'air quality: the European index over the region by the hour, its bubble the index there', JSON.stringify({ ...aq, words }));
  // the UV index, from the same models' grid as the temperature and wind (not asked for again), in the WHO's bands
  await pick('uv');
  const uv = await p.waitForFunction(() => document.getElementById('radar').dataset.layer === 'uv' && document.querySelector('.map-pin')?.dataset.kind === 'temp', null, { timeout: 8000 }).then(st, st);
  const uvWords = await p.textContent('#radar .rl-words');
  ok(uv.title === 'UV index' && uv.legend === 'UV index' && uvWords === 'LowModerateHighVery highExtreme' && /^\d+$/.test(uv.bubble) && !uv.flow && /^UV index [A-Z][a-z]+day \d\d:\d\d · now$/.test(uv.label) && (tiles.field || 0) === asked + 1,
    'the UV index: low to extreme, its bubble the index there, from the grid already asked for', JSON.stringify({ ...uv, uvWords }));
  await pick('rain');
  const rain = await p.waitForFunction(() => document.getElementById('radar').dataset.layer === 'rain', null, { timeout: 5000 }).then(st, st);
  // the rain about the place in words, for a screen reader, is the map's description: nothing where the radar doesn't
  // see the place (as here; where it does, below)
  const said = await p.evaluate(() => [document.querySelector('#radar .radar-map').getAttribute('aria-describedby'), document.getElementById('radar-said').textContent]);
  ok(said[0] === 'radar-said' && said[1] === '', 'the rain in words is the map\'s description, and says nothing where the radar doesn\'t see', JSON.stringify(said));
  ok(rain.title === 'Rain radar' && rain.legend === 'Precipitation' && rain.kind === '' && !rain.flow && Number(rain.max) >= 230 && rain.kept === 'rain' && /^(Latest radar|Radar|Forecast|Estimated) /.test(rain.label),
    'and back to the rain, as it was', JSON.stringify(rain));
  // the rain on to twelve hours or so ahead: after the next two hours, the models' hours (a step every three minutes
  // over them, so the radar's minutes keep their room), drawn from their grid
  const tl = await p.evaluate(() => { const s = document.querySelector('#radar .radar-slider'); return { max: Number(s.max), split: Number(s.dataset.split) }; });
  await p.evaluate(() => { const s = document.querySelector('#radar .radar-slider'); s.value = s.max; s.dispatchEvent(new Event('input')); });
  const end = await p.textContent('#radar .radar-time');
  await p.evaluate(() => { __mixes.length = 0; const s = document.querySelector('#radar .radar-slider'); s.value = String(Number(s.dataset.split) + 120); s.dispatchEvent(new Event('input')); });
  await p.waitForFunction(() => __mixes.length > 0, null, { timeout: 8000 }).catch(() => {});
  const later = await p.evaluate(() => { if (!window.__mix) return 0; const d = __mix.getContext('2d').getImageData(0, 0, __mix.width, __mix.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 60) n++; return n; });
  const hourlyMark = await p.evaluate(() => [document.querySelectorAll('#radar .rs-div').length, document.querySelector('#radar .rs-hourly')?.textContent]);
  ok(hourlyMark[0] === 1 && hourlyMark[1] === 'Hourly', 'where the models\' hours begin, marked on the timeline', JSON.stringify(hourlyMark));
  ok(tl.split >= 230 && tl.max - tl.split >= 180 && /^Forecast [A-Z][a-z]+day \d\d:\d\d · in 1[12] h( \d+ min)?$/.test(end) && (tiles.hours || 0) >= 1 && later > 2000,
    'the rain on to twelve hours ahead: the models\' hours after the next two, drawn from their grid', `${JSON.stringify(tl)}; ${end}; ${tiles.hours} asked; ${later} pixels of rain six hours on`);
  // full screen, a tap reads the weather there (at the time on show), and the warning it's in; a tap on that puts it away
  await p.evaluate(() => { const s = document.querySelector('#radar .radar-slider'); s.value = String(Math.round(s.max * parseFloat(s.style.getPropertyValue('--nowf')))); s.dispatchEvent(new Event('input')); });
  await p.click('#radar .radar-full');
  await p.waitForFunction(() => document.getElementById('radar').classList.contains('radar-big'), null, { timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(800);
  const pin = await p.locator('.map-pin .mp-dot').boundingBox();
  await p.mouse.click(pin.x + pin.width / 2 + 3, pin.y + pin.height / 2 + 30);
  const read = await p.waitForFunction(() => document.querySelector('.map-read')?.textContent, null, { timeout: 3000 }).then((h) => h.jsonValue(), () => '');
  const placed = await p.evaluate(() => { const r = document.querySelector('.map-read .mr-b').getBoundingClientRect(), b = document.querySelector('.map-pin .mp-bubble').getBoundingClientRect(), n = document.querySelector('.map-pin .mp-name').getBoundingClientRect();
    const hit = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom; return { bubble: hit(r, b), name: hit(r, n), cls: document.querySelector('.map-read').className, inside: r.left >= 0 && r.right <= innerWidth }; });
  ok(!placed.bubble && !placed.name && placed.inside && /side|below/.test(placed.cls), 'tapped just under the place, the reading keeps clear of its bubble and name', JSON.stringify(placed));
  ok(/^(No rain|Drizzle|(Light|Moderate|Heavy|Very heavy|Extreme) rain)Yellow rain warning$/.test(read), 'full screen, a tap reads the rain there, and the warning it\'s in (its area drawn)', read);
  await p.click('.map-read .mr-b');
  // (it goes as it came, a little quicker, and then it's gone from the map)
  await p.waitForFunction(() => !document.querySelector('.map-read'), null, { timeout: 2000 }).catch(() => {});
  ok(!(await p.locator('.map-read').count()), 'and a tap on it puts it away');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.getElementById('radar').classList.contains('radar-big'), null, { timeout: 3000 }).catch(() => {});
}
// on a phone the page scrolls past the map in its card, and a tap opens it full screen, to pan and pinch
{
  await p.locator('#radar').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  const touch = () => p.evaluate(() => getComputedStyle(document.querySelector('#radar .maplibregl-canvas')).touchAction);
  const inCard = await touch(), box = await p.locator('#radar .radar-map').boundingBox();
  await p.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.35);
  const opened = await p.waitForFunction(() => document.getElementById('radar').classList.contains('radar-big'), null, { timeout: 3000 }).then(() => true, () => false);
  await p.waitForTimeout(600);
  ok(inCard !== 'none' && opened && await touch() === 'none', 'on a phone: the page scrolls past the map; a tap opens it full screen, where it takes the finger', `${inCard} → ${await touch()}`);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.getElementById('radar').classList.contains('radar-big'), null, { timeout: 3000 }).catch(() => {});
}
// with no rain on the radar to follow, the next two hours come from the models instead, inside a box
{
  const { ctx: c2, p: p2 } = await open({ rainIn: 30, dryRadar: true });
  await p2.locator('#radar').scrollIntoViewIfNeeded();
  await p2.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 }).catch(() => {});
  const fc = await p2.evaluate(() => ({ n: __pictures.length, painted: __pictures.filter((x) => x.rain + x.soft > 500).length }));
  ok(fc.n >= 7 && fc.painted >= 7, 'no rain on the radar to follow: the models\' rain, painted in the radar\'s colours', JSON.stringify(fc));
  await c2.close();
}
// the radar's own say on the next hours, where it sees: rain on it coming this way that the models don't have
{
  const { ctx: c5, p: p5 } = await open({ radarHere: true });
  await p5.waitForFunction(() => /starting/.test(document.getElementById('nowcast-text')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const said = await p5.textContent('#nowcast-text'), brief = await p5.textContent('#brief');
  ok(/^Rain starting (in about (5|10|15|20|25|30) min|any minute)/.test(said) && /^Rain on the way from about \d\d:\d\d/.test(brief),
    'the next hours from the radar, where it sees: rain coming that the models don\'t have', `${said} | ${brief.slice(0, 60)}`);
  ok(await p5.isVisible('#nowcast-src') && (await p5.textContent('#nowcast-src')).trim() === 'Radar', 'and the card says it\'s the radar\'s timing');
  // and where the radar sees, the rain about here in words: the block to the west, coming east, and when it might be here
  await p5.locator('#radar').scrollIntoViewIfNeeded();
  await p5.waitForFunction(() => document.getElementById('radar-said').textContent !== '', null, { timeout: 15000 }).catch(() => {});
  const words = await p5.textContent('#radar-said');
  ok(/^Moderate rain about \d+ km to the west, moving east at about \d+ km\/h: it could be here in about (\d+ minutes|an hour)\.$/.test(words), 'where the radar sees: the rain about here in words, for a screen reader', words);
  // the minutes between, where the rain's moving (here a block of it, coming east two of zoom 7's pixels a minute): moved
  // along its way and blended, it's one block half way along, as solid as in the frames, not two faint ones (zoomed out to
  // see it whole)
  await p5.locator('#radar').scrollIntoViewIfNeeded();
  await p5.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 }).catch(() => {});
  await p5.evaluate(() => { const b = document.querySelector('#radar .radar-play'); if (b.dataset.on === '1') b.click(); });
  await press(p5, '#radar .map-out'); await p5.waitForTimeout(400); await press(p5, '#radar .map-out'); await p5.waitForTimeout(800);
  // (each read once it's drawn afresh: its rain somewhere other than the last one read)
  const seen = async (back, was = null) => {
    await toMinute(p5, back);
    await p5.waitForFunction((was) => { const r = __glread(); return r && r.solid > 500 && r.x !== was; }, was, { timeout: 8000 }).catch(() => {});
    await p5.waitForTimeout(300);
    return p5.evaluate(() => __glread());
  };
  await seen(10); await seen(5);
  const A = await seen(10), M = await seen(5, A?.x), B = await seen(0, M?.x), ratio = (r) => r.faint / r.solid;
  ok(A && M && B && A.x < M.x && M.x < B.x && Math.abs(M.x - (A.x + B.x) / 2) <= 4 && Math.abs(M.solid - A.solid) / A.solid < 0.15 && ratio(M) <= ratio(A) * 1.5 + 0.05,
    'moving rain, to the minute: moved along its way, one block half way along, as solid as in the frames (not two faint ones)', JSON.stringify({ A, M, B }));
  await c5.close();
}
// the days ahead steadied with what the page said of them a day and two days ago: kept on the phone as it goes
{
  const { ctx: c8, p: p8 } = await open({});
  const highs = () => p8.locator('.day-row .d-hi').allTextContents().then((xs) => xs.map((x) => parseInt(x.replace('−', '-'), 10)));
  const before = await highs();
  // (what it said a day and two days ago, three degrees warmer every day, as if kept then)
  const kept = await p8.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('wx:said:')), list = JSON.parse(localStorage.getItem(k) || '[]'), now = Date.now();
    const warmer = (days) => Object.fromEntries(Object.entries(days).map(([d, [hi, lo]]) => [d, [hi + 3, lo + 3]]));
    if (!list.length) return null;
    const days = list[list.length - 1].days;
    localStorage.setItem(k, JSON.stringify([{ at: now - 48 * 3600e3, days: warmer(days) }, { at: now - 24 * 3600e3, days: warmer(days) }, ...list]));
    return Object.keys(days).length;
  });
  await p8.reload(); await p8.waitForSelector('.day-row', { timeout: 20000 }); await p8.waitForTimeout(800);
  const after = await highs(), up = after.map((v, i) => v - before[i]);
  // (today and tomorrow as they are; from the third day, 1.2° warmer (30% and 10% of 3°), to 1.5° beyond (30% and 20%))
  ok(kept >= 8 && up[0] === 0 && up[1] === 0 && up.slice(2, 8).every((d) => d === 1 || d === 2), 'the days ahead steadied with what it said of them a day and two days ago (kept on the phone), not today or tomorrow', `${kept} days kept; ${up.join(' ')}`);
  await c8.close();
}
// somewhere with no airport station near to check the forecast against: no accuracy card at all (nothing to say)
{
  const { ctx: c7, p: p7 } = await open({}, { url: `${HOST}/?lat=55.95&lon=-3.19&name=Edinburgh`, settle: false });
  await p7.waitForSelector('.day-row', { timeout: 20000 });
  await p7.waitForTimeout(2500);
  ok(await p7.evaluate(() => document.getElementById('accuracy').hidden) && await p7.isVisible('#climate'), 'no station near: no accuracy card (the rest as ever)');
  await c7.close();
}
// the next two hours are always there: no rain anywhere on the radar and none expected, the latest radar held (and no
// models' grid asked for); rain about on the radar but too scattered to follow, the models' grid, though none's expected here
for (const [sc, grid, what] of [[{ clearRadar: true }, false, 'dry all about: the next two hours still there, the radar as it is (no models\' grid asked for)'],
  [{ dryRadar: true }, true, 'rain about but too little to follow: the next two hours from the models\' grid, though none\'s expected here']]) {
  const before = tiles.grid, { ctx: c6, p: p6 } = await open(sc);
  await p6.locator('#radar').scrollIntoViewIfNeeded();
  await p6.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 }).catch(() => {});
  await p6.evaluate(() => { const b = document.querySelector('#radar .radar-play'); if (b.dataset.on === '1') b.click(); const s = document.querySelector('#radar .radar-slider'); s.value = s.dataset.split || s.max; s.dispatchEvent(new Event('input')); });
  const max = Number(await p6.getAttribute('#radar .radar-slider', 'max')), chip = await chipSays(p6), end = await p6.textContent('#radar .radar-time').catch(() => '');
  ok(max >= 180 && chip === 'Forecast' && /^Forecast /.test(end) && (tiles.grid > before) === grid && !(await p6.textContent('#radar .radar-status')), what, `${max} minutes, ${chip}, ${end}, ${tiles.grid - before} grid`);
  if (grid) {
    // and between the models' quarter hours, the two blended: their rain there, not a blank map
    await press(p6, '#radar .map-out'); await p6.waitForTimeout(600);
    await p6.evaluate(() => { __mixes.length = 0; const s = document.querySelector('#radar .radar-slider'); s.value = String(Number(s.dataset.split || s.max) - 7); s.dispatchEvent(new Event('input')); });
    await p6.waitForFunction(() => __mixes.length > 0, null, { timeout: 8000 }).catch(() => {});
    const rain = await p6.evaluate(() => { if (!window.__mix) return 0; const d = __mix.getContext('2d').getImageData(0, 0, __mix.width, __mix.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 60) n++; return n; });
    ok(rain > 2000, 'and between the models\' quarter hours, the two blended: their rain there', `${rain} pixels of rain`);
  }
  await c6.close();
}
// a phone that can't draw the vector map (no WebGL 2): the radar on OpenStreetMap's own map, turned dark, with the same controls
{
  const before = tiles.map;
  const { ctx: c3, p: p3 } = await open({ rainIn: 30, noGL: true });
  await p3.locator('#radar').scrollIntoViewIfNeeded();
  await p3.waitForSelector('#radar .leaflet-container', { timeout: 15000 });
  await p3.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 }).catch(() => {});
  ok(!(await p3.locator('#radar .maplibregl-canvas').count()) && tiles.map > before && await p3.locator('#radar .map-zoom button').count() === 2 && await p3.locator('#radar .radar-centre').count() === 1 && /^\d+ mi$/.test(await p3.textContent('#radar .map-scale')),
    'no WebGL 2: OpenStreetMap\'s map instead, with the same controls', `${tiles.map - before} map tiles`);
  ok(/^Map data © OpenStreetMap, RainViewer/.test(await p3.getAttribute('#radar .radar-credit', 'aria-label')), 'credited as such', await p3.getAttribute('#radar .radar-credit', 'aria-label'));
  await p3.evaluate(() => { const b = document.querySelector('#radar .radar-play'); if (b.dataset.on === '1') b.click(); });
  await toMinute(p3);
  await press(p3, '#radar .map-in'); await p3.waitForTimeout(400); await press(p3, '#radar .map-in');
  const smoothed = () => [...document.querySelectorAll('#radar .rv-tiles canvas.leaflet-tile')].some((c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 150));
  await p3.waitForFunction(smoothed, null, { timeout: 15000, polling: 250 }).catch(() => {});
  await p3.waitForTimeout(500);
  const d3 = await p3.evaluate(() => {
    let rain = 0, soft = 0, blue = 0;
    for (const c of document.querySelectorAll('#radar .rv-tiles canvas.leaflet-tile')) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 150) { rain++; if (d[i - 1] > d[i - 3]) blue++; } else if (d[i] > 0) soft++; }
    }
    return { rain, soft, blue, frames: document.querySelectorAll('#radar .rv-tiles').length };
  });
  ok(d3.rain > 1000 && d3.blue > d3.rain * 0.9 && d3.soft > 100 && d3.frames >= 13, 'and the radar on it, smoothed the same', JSON.stringify(d3));
  // and to the minute the same way: the two frames either side faded into each other, on a picture over the map
  await p3.evaluate(() => { __mixes.length = 0; }); await toMinute(p3, 5);
  await p3.waitForFunction(() => __mixes.some((m) => m.alpha === 0.5), null, { timeout: 10000 }).catch(() => {});
  const lm = await p3.evaluate(() => { const c = document.querySelector('#radar canvas.rv-mix'); return { on: !!c && getComputedStyle(c).opacity === '0.8', alphas: [...new Set(__mixes.map((m) => m.alpha))], layers: [...document.querySelectorAll('#radar .rv-tiles')].filter((l) => getComputedStyle(l).opacity !== '0').length }; });
  ok(lm.on && lm.alphas.includes(0.5) && lm.layers === 0, 'and to the minute: the frames either side faded into each other over it (in place of the frames)', JSON.stringify(lm));
  await c3.close();
}
// Settings: a short list of folders, each with what's in it said beside it (fetched as it's first opened: settings.js)
await p.click('#settings-btn');
await p.waitForSelector('#settings[open]'); await p.waitForTimeout(300);
{
  const list = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#settings .folder')].filter((b) => !b.closest('li')?.hidden).map((b) => `${b.querySelector('.f-k').textContent}: ${b.querySelector('.f-v').textContent}`),
    hidden: [...document.querySelectorAll('#settings .set-page:not([data-page="root"])')].every((x) => x.hidden), back: document.getElementById('set-back').hidden, title: document.getElementById('settings-title').textContent }));
  ok(list.title === 'Settings' && list.back && list.hidden && list.rows.join() === 'Get rain alertsA heads-up here before rain starts: Turn on,Notifications: Off,Commute: Off,Solar: Off,Best times: Run, Walk, Ride,Units: °C, mph, mm,Appearance: Standard,Arrange your page: As usual,Forecast: Tuned',
    'Settings opens on its list of folders, each saying what\'s in it', JSON.stringify(list));
  ok(await p.isVisible('#alerts-row'), 'the word about the alerts, put away on the page, a row at the top of Settings instead');
}
// your own activities
await p.click('[data-go="acts"]');
ok(await p.textContent('#settings-title') === 'Best times' && !(await p.isHidden('#set-back')) && await p.getAttribute('#set-back', 'aria-label') === 'Back to Settings', 'a folder opens over the list, with a way back');
await p.selectOption('#act-add', 'golf');
ok((await p.locator('#acts-list .act').count()) === 4, 'golf added to the list');
await p.locator('#acts-list .act').first().locator('button').click();
ok(await p.textContent('#settings-title') === 'Run' && await p.getAttribute('#set-back', 'aria-label') === 'Back to Best times', 'an activity has a page of its own, in Best times');
{
  // (the temperatures with a keyboard that has a minus, below zero being one: an iPhone's numeric keypad hasn't; the rest the keypad)
  const modes = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.act-edit input[type="number"]')].map((x) => [x.name, x.getAttribute('inputmode')])));
  ok(modes.tmin === null && modes.tmax === null && modes.windMax === 'numeric' && modes.hours === 'numeric', 'its temperatures can be typed below zero (no digits-only keypad)', JSON.stringify(modes));
}
await p.fill('.act-edit input[name="tmax"]', '20');
await p.click('.act-edit .pill-btn');
ok(/^6°–20°/.test(await p.locator('#acts-list .act-lim').first().textContent()) && await p.textContent('#settings-title') === 'Best times', 'a run\'s limits changed, and back in Best times', await p.locator('#acts-list .act-lim').first().textContent());
await p.locator('#acts-list .act').first().locator('button').click();
await p.fill('.act-edit input[name="tmin"]', '5'); await p.click('#set-back');
ok(/^5°–20°/.test(await p.locator('#acts-list .act-lim').first().textContent()), 'and changed by just going back, as iOS keeps them', await p.locator('#acts-list .act-lim').first().textContent());
await p.screenshot({ path: `${out}/wx-settings.png` });
await p.click('#set-back');
ok(await p.textContent('#settings-title') === 'Settings' && await p.isHidden('#set-back') && await p.textContent('#fv-acts') === 'Run, Walk, Ride, Golf', 'and back to the list, which says the new one', await p.textContent('#fv-acts'));
await p.keyboard.press('Escape');
ok((await p.locator('#win-grid .win-name').allTextContents()).includes('Golf') || /Golf/.test(await p.textContent('#win-poor').catch(() => '')), 'and golf has its best time');
// none of them chosen: no Best times card at all, back as soon as one is
{
  // (one at a time, found afresh: each switch draws the list again)
  const flip = (on) => p.evaluate((on) => { for (let k = 0; k < 20; k++) { const i = [...document.querySelectorAll('#acts-list .act input[type="checkbox"], #settings-form input[name^="x_"]')].find((x) => x.checked !== on); if (!i) break; i.click(); } }, on);
  await p.click('#settings-btn'); await p.waitForSelector('#settings[open]'); await flip(false); await p.waitForTimeout(300);
  const gone = await p.evaluate(() => document.getElementById('windows').hidden && !document.getElementById('windows').offsetHeight);
  await flip(true); await p.waitForTimeout(300);
  const back = await p.evaluate(() => !document.getElementById('windows').hidden && document.querySelectorAll('#win-grid .win, #win-poor').length > 0);
  await p.keyboard.press('Escape');
  ok(gone && back, 'nothing chosen for the best times: no card for them (and back when one is)', JSON.stringify({ gone, back }));
}
// a choice of one: a lens glides to the chosen one (two choices, or four), and nothing on the page behind is blurred or
// moving while the sheet's up (the sheet glides over a still page)
await p.click('#settings-btn'); await p.click('[data-go="units"]');
await p.click('input[name="wind"][value="kn"]'); await p.waitForTimeout(700);
const lens = await p.evaluate(() => ['temp', 'wind'].map((k) => {
  const c = document.querySelector(`.choice:has(input[name="${k}"])`), chosen = c.querySelector('input:checked').closest('label');
  const tx = new DOMMatrix(getComputedStyle(c, '::before').transform).m41, w = parseFloat(getComputedStyle(c, '::before').width);
  return { k, off: Math.round(Math.abs(3 + tx - chosen.offsetLeft)), dw: Math.round(Math.abs(w - chosen.offsetWidth)) };
}));
ok(lens.every((x) => x.off <= 2 && x.dw <= 2), 'the lens sits under the chosen one (°C of two; knots, the last of four)', JSON.stringify(lens));
// (what moves by the clock, that is: not what the scroller of places leads as it's swiped, the cards, the pages either
// side and their skies, which move only as it does: styles.css --cur)
const still = await p.evaluate(() => {
  const ticking = document.getAnimations().filter((a) => !(a.timeline instanceof ScrollTimeline)), bar = getComputedStyle(document.querySelector('.top'), '::before');
  const sky = ticking.filter((a) => a.effect?.target?.closest?.('.sky')), page = ticking.filter((a) => a.effect?.target?.closest?.('.page'));
  return { blur: bar.backdropFilter, sky: sky.every((a) => a.playState !== 'running'), page: page.filter((a) => a.playState === 'running' && !(a instanceof CSSTransition)).map((a) => a.animationName) };
});
ok(still.blur === 'none' && still.sky && !still.page.length, 'under a sheet the page holds still: its glass unblurred, nothing moving on it or in the sky', JSON.stringify(still));
await p.click('input[name="wind"][value="mph"]');
// the times to choose, said as the clock's set: 07:00, or 7am (not the browser's own 12-hour box), the label on one line
{
  const said = () => p.evaluate(() => ({ brief: document.querySelector('select[name="briefAt"]').selectedOptions[0]?.textContent, pm: document.querySelector('select[name="pm"]').selectedOptions[0]?.textContent,
    n: document.querySelector('select[name="briefAt"]').options.length }));
  const h24 = await said();
  await p.click('input[name="clock"][value="12"]'); await p.waitForTimeout(300);
  const h12 = await said();
  await p.click('input[name="clock"][value="24"]'); await p.waitForTimeout(300);
  await p.click('#set-back'); await p.click('[data-go="notify"]'); await p.waitForTimeout(500);
  const line = await p.evaluate(() => Math.round(document.querySelector('input[name="brief"]').closest('label').getBoundingClientRect().height));
  ok(h24.brief === '07:00' && h24.pm === '17:30' && h12.brief === '7am' && h12.pm === '5:30pm' && h24.n === 96 && line === 52, 'the briefing\'s and the commute\'s times said as the clock is set, every quarter hour; "Morning briefing" on one line', JSON.stringify({ h24, h12, line }));
}
await p.keyboard.press('Escape');
await p.waitForFunction(() => !document.getElementById('settings').open && !document.body.classList.contains('sheet-up'), null, { timeout: 3000 }).catch(() => {});
// (the top bar's: the cards' glass is tinted, not blurred: styles.css)
const back = await p.evaluate(() => getComputedStyle(document.querySelector('.top'), '::before').backdropFilter);
ok(/blur/.test(back), 'and its glass back once the sheet\'s gone', back);
// scrolled on past the top, the sky behind the cards holds still too (and moves again back at the top)
{
  // (by the clock: not the next place's sky, which comes in only as the page is swiped)
  const skyRunning = () => p.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('.sky') && a instanceof CSSAnimation && !(a.timeline instanceof ScrollTimeline)).map((a) => a.playState));
  // (as it was at the top before: at dusk, dawn or under a clear sky its clouds are still anyway)
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
  const before = await skyRunning();
  await p.evaluate(() => scrollTo(0, 1800)); await p.waitForTimeout(400);
  const deep = await skyRunning();
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
  const top = await skyRunning();
  ok(deep.every((x) => x !== 'running') && top.join() === before.join(), 'scrolled on, the sky pauses (and moves again at the top)', `${before.join(',')} / ${deep.join(',')} / ${top.join(',')}`);
}
// units, kept
await p.click('#settings-btn'); await p.click('[data-go="units"]'); await p.click('input[name="temp"][value="f"]'); await p.keyboard.press('Escape');
ok(/^\d+°$/.test(await p.textContent('#now-temp')) && Number((await p.textContent('#now-temp')).slice(0, -1)) > 32, 'switches to °F');
await p.reload(); await p.waitForSelector('.day-row');
ok(Number((await p.textContent('#now-temp')).slice(0, -1)) > 32, 'and remembers it');
// the glass, as clear or as tinted as you like (iOS 27's slider, in three steps)
{
  const tint = () => p.evaluate(() => ({ glass: document.body.dataset.glass, tint: getComputedStyle(document.querySelector('.card')).backgroundColor }));
  const was = await tint();
  await p.click('#settings-btn'); await p.click('[data-go="look"]'); await p.click('input[name="glass"][value="tinted"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const now = await tint();
  const alpha = (c) => Number((/rgba\([^)]*,\s*([\d.]+)\)/.exec(c) || [])[1] ?? 1);
  ok(was.glass === 'standard' && now.glass === 'tinted' && alpha(now.tint) > alpha(was.tint) * 1.5, 'the glass tinted when asked: the cards darker behind their words', `${was.tint} → ${now.tint}`);
  await p.click('#settings-btn'); await p.click('[data-go="look"]'); await p.click('input[name="glass"][value="standard"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
}
// search and save a place (the sheet the same height with results as without: it doesn't jump as they come)
await p.click('#place-btn'); await p.waitForTimeout(600);
const tall0 = await p.evaluate(() => document.getElementById('places').getBoundingClientRect().height);
await p.fill('#search', 'Edin'); await p.waitForSelector('#results .row-btn', { timeout: 8000 }).catch(() => {});
const tall1 = await p.evaluate(() => document.getElementById('places').getBoundingClientRect().height);
ok(tall0 > 600 && Math.abs(tall1 - tall0) < 1, 'places: the same height before and with results', `${Math.round(tall0)} → ${Math.round(tall1)}`);
await p.press('#search', 'Enter');
await p.waitForFunction(() => document.getElementById('place-name').textContent === 'Edinburgh', null, { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(600);
ok((await p.textContent('#place-name')) === 'Edinburgh' && !(await p.evaluate(() => document.getElementById('places').open)), 'a place found by search: Enter takes the first found (even before they\'re back)');
// and the place it was is on the map too, a small bubble (its temperature now, as the list of places has it) that goes to it
// (once the map's made: the radar in sight)
{
  await p.locator('#radar').scrollIntoViewIfNeeded();
  const other = await p.waitForFunction(() => document.querySelector('.map-other')?.getAttribute('aria-label'), null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
  ok(/^London: -?\d+°\. Show it$/.test(other || '') && (await p.locator('.map-other').count()) === 1, 'the other saved place on the map, a bubble with its temperature', other);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
}
await p.click('#place-btn');
ok((await p.locator('#saved li').count()) === 2, 'both places saved');
// each a card in its own sky (iOS's list): its name, clock and weather, its temperature and the day's high and low;
// swiped left, a Delete behind it
{
  const cards = await p.evaluate(() => [...document.querySelectorAll('#saved .place-card')].map((c) => ({ sky: c.dataset.sky, name: c.querySelector('.pc-name').textContent.trim(), sub: c.querySelector('.pc-sub')?.textContent, temp: c.querySelector('.pc-temp')?.textContent, hl: c.querySelector('.pc-hl')?.textContent, on: c.getAttribute('aria-current') })));
  ok(cards.length === 2 && cards.every((c) => c.sky && /\d\d:\d\d/.test(c.sub) && /°/.test(c.temp) && /^H .+ L .+/.test(c.hl)) && cards.filter((c) => c.on === 'true').length === 1, 'each place a card in its own sky: its clock, its weather, the day\'s high and low', JSON.stringify(cards).slice(0, 220));
  await p.waitForTimeout(700);      // (the sheet up, and still)
  const b = await p.locator('#saved .place-card').nth(1).boundingBox(), cdp = await p.context().newCDPSession(p), y = b.y + b.height / 2;
  const t = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x == null ? [] : [{ x, y }] });
  await t('touchStart', b.x + b.width - 30); for (const dx of [20, 50, 90, 130]) { await p.waitForTimeout(16); await t('touchMove', b.x + b.width - 30 - dx); } await t('touchEnd'); await p.waitForTimeout(500);
  await p.waitForTimeout(400);
  const sw = await p.evaluate(() => { const li = document.querySelectorAll('#saved li')[1], c = li.querySelector('.place-card'), n = c.querySelector('.pc-name'), d = li.querySelector('.pc-del'), r = (e) => e.getBoundingClientRect();
    return { swiped: li.classList.contains('swiped'), sameLeft: Math.abs(r(c).left - r(li).left) < 1, nameIn: r(n).left >= r(c).left && r(n).width > 0, room: Math.round(r(li).right - r(c).right), del: getComputedStyle(d).opacity, apart: r(d).left - r(c).right }; });
  ok(sw.swiped && sw.sameLeft && sw.nameIn && sw.room >= 90 && sw.del === '1' && sw.apart >= 4, 'swiped left, it narrows (nothing on it cut off) for a Delete beside it', JSON.stringify(sw));
}
await p.keyboard.press('Escape');
// swipe across the top of the page to the next or previous place: the page follows the finger, and turns to it (a
// view transition, the page carried off as the next comes in), or gives at the ends, or springs back from a short one
{
  await p.waitForFunction(() => !document.getElementById('places').open && !document.body.classList.contains('sheet-up'), null, { timeout: 3000 }).catch(() => {});
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
  const cdp = await p.context().newCDPSession(p), box = await p.locator('.hero').boundingBox(), y = box.y + 60;
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x == null ? [] : [{ x, y }] });
  const drag = async (xs) => { await touch('touchStart', xs[0]); for (const x of xs.slice(1)) { await p.waitForTimeout(16); await touch('touchMove', x); } await p.waitForTimeout(60); };
  // (the page's columns follow the finger, both together)
  const shift = () => p.evaluate(() => { const [a, b] = [...document.querySelectorAll('#main > .col')].map((c) => { const t = getComputedStyle(c).translate; return t === 'none' ? 0 : Math.round(parseFloat(t)); }); return a === b ? a : NaN; });
  const name = () => p.textContent('#place-name');
  // Edinburgh's the last: leftwards (190 px of swipe) it goes no further, and is left as it was. (The swipe is the
  // scroller's own, so its give at the end is the browser's, as iOS's scrollers give, not moving what's in it; held
  // there, not handed on to the browser to go back or forward with: contain. Headless Chromium's scrollers don't give)
  await drag([300, 290, 270, 240, 200, 160, 120, 80]);
  const gave = await shift(), ends = await p.evaluate(() => getComputedStyle(document.getElementById('pager')).overscrollBehaviorX);
  await touch('touchEnd'); await p.waitForTimeout(700);
  ok(gave === 0 && ends === 'contain' && (await name()) === 'Edinburgh' && (await shift()) === 0, 'swiped on past the last place: the page goes no further (giving there as the browser\'s scrollers do) and stays', `${gave} px for 190 px, ${ends}`);
  // a short swipe the other way: the page with the finger from where the browser took it for a scroll (not jumping
  // the way it took to tell: less than the 52 px gone), then pixel for pixel with it (20 px more); then back
  await drag([100, 110, 125, 140, 152]);
  const told = await shift();
  await touch('touchMove', 172); await p.waitForTimeout(100);
  const followed = await shift() - told;
  await touch('touchEnd'); await p.waitForTimeout(700);
  const back = { name: await name(), shift: await shift() };
  ok(told > 0 && told < 52 && Math.abs(followed - 20) <= 1 && back.name === 'Edinburgh' && back.shift === 0, 'a short swipe: the page follows the finger exactly, from where it was told from a scroll, and springs back', `${told} px for 52 px, ${followed} px for 20 more, then ${JSON.stringify(back)}`);
  // far enough: London, the page turning to it
  await drag([60, 90, 130, 180, 230, 280, 320]);
  await touch('touchEnd');
  const turning = await p.waitForFunction(() => __turns.includes('::view-transition-old(page)') && __turns.includes('::view-transition-new(page)'), null, { timeout: 2000 }).then(() => true, () => false);
  await p.waitForFunction(() => document.getElementById('place-name').textContent === 'London', null, { timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(800);
  const after = await p.evaluate(() => { const m = document.getElementById('main'); return { clean: !m.style.height && !m.style.overflow && !m.style.viewTransitionName && !m.classList.contains('paging'), lit: [...document.querySelectorAll('#dots i')].findIndex((d) => d.classList.contains('on')) }; });
  ok(turning && (await name()) === 'London' && (await shift()) === 0 && after.clean && after.lit === 0, 'swiped far enough: the page turns to the previous place (carried off as it comes in), its dot lit, nothing left over', JSON.stringify({ turning, ...after }));
}
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
// motion: a new chart draws in once it's on screen; and with Reduce Motion, nothing moves at all
{
  const { ctx, p } = await open({ rainIn: 30 });
  await p.locator('#hourly-seg [data-mode="rain"]').evaluate((e) => e.click());
  const before = await p.locator('#hourly-chart svg.c-enter').count();
  await p.locator('#hourly-chart').scrollIntoViewIfNeeded();
  await p.waitForSelector('#hourly-chart svg.c-enter', { timeout: 3000 }).catch(() => {});
  ok(!before && await p.locator('#hourly-chart svg.c-enter').count() === 1, 'a new chart draws in (columns growing, a line traced), once it\'s on screen', `before ${before}`);
  // each spell's rain said over it, clear of every column (not printed over them)
  const spells = await p.evaluate(() => {
    const box = (e) => e.getBBox(), cols = [...document.querySelectorAll('#hourly-chart .c-col')].map(box);
    return [...document.querySelectorAll('#hourly-chart text.c-label')].map((t) => { const b = box(t); return { text: t.textContent, on: cols.filter((c) => c.x < b.x + b.width && b.x < c.x + c.width && c.y < b.y + b.height).length }; });
  });
  ok(spells.length >= 1 && spells.every((x) => /mm$/.test(x.text) && !x.on), 'the rain chart: each spell\'s rain over it, on no column', JSON.stringify(spells));
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.reload(); await p.waitForSelector('.day-row');
  await p.waitForFunction(() => /warmer than/i.test(document.querySelector('#climate-body').textContent), null, { timeout: 20000 });
  for (let y = 0; y < 7000; y += 700) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.locator('#hourly-seg [data-mode="wind"]').evaluate((e) => e.click());
  await p.locator('.day-row').nth(2).evaluate((e) => e.click()); await p.waitForSelector('#day[open]'); await p.waitForTimeout(300);
  // (what the scroller of places leads as it's swiped, moving only as it does, here only fading, or out of sight: the
  // cards and the next place's sky crossfading, the pages either side hidden; styles.css --cur)
  const moving = await p.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.playState === 'running'
    && !(a.timeline instanceof ScrollTimeline && (getComputedStyle(a.effect.target).visibility === 'hidden' || a.effect.getKeyframes().every((k) => !['translate', 'transform', 'scale', 'rotate'].some((x) => x in k)))))
    .map((a) => `${a.animationName} on ${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className}`));
  ok(!moving.length, 'with Reduce Motion, nothing moves: no drawing in, no settling, no sky', moving.slice(0, 5).join('; '));
  ok(!(await p.locator('.pre, svg.c-enter').count()), 'and nothing is left waiting to move (all drawn in full)');
  await p.locator('#radar').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => Number(document.querySelector('#radar .radar-slider').max) >= 18, null, { timeout: 15000 }).catch(() => {});
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#radar .maplibregl-canvas')).transitionDuration === '0s' && document.querySelector('#radar .radar-play').dataset.on === '0'), 'the radar doesn\'t play by itself, and its map doesn\'t fade in');
  await ctx.close();
}
// an official wind warning in force (over Bristol): the app's own gales warning stands aside for it
{
  const { ctx, p } = await open({ gust: 70 }, { url: `${HOST}/?lat=51.45&lon=-2.59&name=Bristol`, settle: false });
  await p.waitForSelector('#alerts .official', { timeout: 20000 });
  const t = await p.locator('#alerts .ins h3').allTextContents();
  ok(t.some((x) => /^Yellow\s*Wind warning$/.test(x)) && !t.some((x) => /Gales|Damaging gusts|Windy/.test(x)), 'an official wind warning: the app\'s own gales warning stands aside', t.join(' · '));
  await ctx.close();
}
// by the sea (Bacton, on the Norfolk coast): the Environment Agency's flood warning for it, and the sea's own tile: how
// warm, the waves, the tide's next day as a curve, and a sheet of the tide and the waves for two days
{
  const { ctx, p } = await open({}, { url: `${HOST}/?lat=52.86&lon=1.47&name=Bacton`, settle: false });
  await p.waitForSelector('#alerts .official', { timeout: 20000 });
  const cards = await p.locator('#alerts .official:not(.warn-sum)').evaluateAll((es) => es.map((e) => ({ title: e.querySelector('h3').textContent, from: e.querySelector('.ins-from').textContent, colour: e.dataset.colour, line: e.querySelector('p:last-child').textContent })));
  ok(cards.length === 1 && cards[0].title === 'Flood warning' && cards[0].from === 'Environment Agency · In force' && cards[0].colour === 'amber' && /act now/.test(cards[0].line),
    'a flood warning from the Environment Agency, amber, in force (not the alert for an area 10 km off)', JSON.stringify(cards));
  await p.locator('#alerts').screenshot({ path: `${out}/wx-flood.png` });
  await p.locator('#alerts .official:not(.warn-sum) .ins-open').evaluate((e) => e.click());
  await p.waitForSelector('#warning[open]'); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/wx-flood-sheet.png` });
  const warn = await p.evaluate(() => ({ text: document.getElementById('warning-body').textContent, link: document.querySelector('#warning .warn-link a')?.href }));
  ok(/Avoid the sea front/.test(warn.text) && /Issued by the Environment Agency, and shown as issued/.test(warn.text) && warn.link === 'https://check-for-flooding.service.gov.uk/target-area/054FWCBACTN', 'its sheet: the Agency\'s message, and a link to its page for the area', JSON.stringify(warn).slice(0, 200));
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.getElementById('warning').open);
  await p.waitForSelector('#tiles [data-kind="sea"]', { timeout: 20000 });
  const sea = await p.evaluate(() => { const t = document.querySelector('#tiles [data-kind="sea"]'); return { wide: t.classList.contains('wide'), text: t.textContent.replace(/\s+/g, ' '), curve: !!t.querySelector('.tidec .tc-line'), here: !!t.querySelector('.tidec .tc-here'), marks: t.querySelectorAll('.tidec .tc-mark').length, before: t.previousElementSibling?.dataset.kind }; });
  ok(sea.wide && /14° ?Cold/.test(sea.text) && /Waves \d\.\d m, from the north-east/.test(sea.text) && /(Rising|Falling): (High|Low) [^,]+, (high|low) /.test(sea.text) && sea.curve && sea.here && sea.marks >= 3 && sea.before === 'air',
    'by the sea, a tile of it: how warm, the waves and which way, the next high and low tides, the next day\'s tide drawn', JSON.stringify(sea).slice(0, 220));
  await p.locator('#tiles [data-kind="sea"] .tile-open').evaluate((e) => e.click());
  await p.waitForSelector('#detail[open]'); await p.waitForTimeout(500);
  const sheet = await p.evaluate(() => ({ title: document.getElementById('detail-title').textContent, charts: document.querySelectorAll('#detail-body .chart svg').length, sections: [...document.querySelectorAll('#detail-body .day-section')].map((x) => x.textContent), tides: document.querySelectorAll('#detail .kv.tides dt').length, labels: document.querySelectorAll('#detail-body .chart .c-label').length, about: document.querySelector('#detail .detail-about')?.textContent || '', dots: document.querySelectorAll('#detail-dots i').length }));
  ok(sheet.title === 'Sea' && sheet.charts === 2 && sheet.sections.join('|') === 'Tide, next 48 hours (m)|Waves, next 48 hours (m)' && sheet.tides >= 2 && sheet.labels >= 7 && /not for navigation/.test(sheet.about) && /(10 km|6\.2 mi) offshore/.test(sheet.about) && sheet.dots === 11,
    'its sheet: two days of the tide (its turns marked and listed) and of the waves, and what it is: a model, not a tide table', JSON.stringify(sheet).slice(0, 260));
  await ctx.close();
}
// a notification for My Location tapped (its link is just where it was, to two decimal places): My Location shown, not
// offered as a place to add; a link to near there from someone else still asked about
{
  const { ctx, p } = await open({}, { settle: false });
  let asked = 0; p.on('dialog', () => asked++);
  const soho = { name: 'Soho', region: 'London, England', lat: 51.5136, lon: -0.1357, gps: true };
  const seed = (notify) => p.evaluate(([soho, notify]) => {
    localStorage.setItem('wx:places', JSON.stringify([soho, { name: 'Paris', region: 'France', lat: 48.8566, lon: 2.3522 }]));
    localStorage.setItem('wx:cur', '1');
    localStorage.setItem('wx:settings', JSON.stringify({ notify }));
  }, [soho, notify]);
  await seed({ places: [{ ...soho, rain: true, warn: false }], brief: null });
  await p.goto(`${HOST}/?lat=51.51&lon=-0.14&name=Soho`); await p.waitForSelector('.day-row', { timeout: 20000 }); await p.waitForTimeout(500);
  const shown = await p.evaluate(() => ({ name: document.getElementById('place-name').textContent, places: JSON.parse(localStorage.getItem('wx:places')).length, cur: JSON.parse(localStorage.getItem('wx:cur')) }));
  ok(!asked && shown.name === 'Soho' && shown.places === 2 && shown.cur === 0, 'a notification for My Location, tapped: My Location shown, and nothing asked or added', JSON.stringify({ asked, ...shown }));
  // (and My Location as an earlier version kept it, to four decimal places, kept to three from the start, its
  // notification's too, though the phone's not been asked where it is)
  const kept = await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('wx:places'))[0], e = JSON.parse(localStorage.getItem('wx:settings')).notify.places[0]; return [g.lat, g.lon, e.lat, e.lon]; });
  ok(JSON.stringify(kept) === JSON.stringify([51.514, -0.136, 51.514, -0.136]), 'My Location kept from before, to three decimal places from the start, and its notification', JSON.stringify(kept));
  await seed({ places: [], brief: null });
  await p.goto(`${HOST}/?lat=51.51&lon=-0.14&name=Soho`); await p.waitForSelector('.day-row', { timeout: 20000 });
  ok(asked === 1, 'a link to near there that isn\'t one of its own notifications: asked about, as any shared link is', `${asked} asked`);
  await ctx.close();
}
// the strip behind an iPhone's status bar: it takes the page's theme-color as the page arrives, and no notice of it changed
// after; so the sky's colour is kept, and the app's own worker writes it into the page as it gives it (sw.js tinted)
{
  const { ctx, p } = await open({}, { sw: true, settle: false });
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await p.reload(); await p.waitForSelector('.day-row', { timeout: 20000 });
  await p.waitForFunction(async () => !!(await (await caches.open('wx-tint')).match(new URL('./tint', location.href))), null, { timeout: 10000, polling: 200 }).catch(() => {});
  const top = await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
  const r = await p.reload(); await p.waitForSelector('.day-row', { timeout: 20000 });
  const sent = /<meta name="theme-color" content="([^"]*)"/.exec(await r.text())?.[1];
  ok(r.fromServiceWorker() && sent === top && top !== '#2b5d96', 'the page arrives with the sky\'s colour as its theme-color, written in by its worker', `${sent} (the sky's ${top})`);
  await ctx.close();
}
// fresh whenever it's opened: brought back to the front, it asks again for what's due (and only that), and checks for a
// new version of the app, starting on it straight away (or, if it came while a sheet was open, the next time it's opened)
{
  const { ctx, p } = await open({}, { sw: true, settle: false });
  // (the second time in, the app's own worker has it)
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await p.reload(); await p.waitForSelector('.day-row', { timeout: 20000 });
  await p.waitForFunction(() => document.getElementById('status').textContent === '' && /Updated just now/.test(document.getElementById('updated').textContent), null, { timeout: 20000 });
  await p.evaluate(() => { const u = ServiceWorkerRegistration.prototype.update; window.__updates = 0; ServiceWorkerRegistration.prototype.update = function () { window.__updates++; return u.call(this); }; });
  const away = (ms = 60) => p.evaluate(async (ms) => {
    const set = (v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
    set('hidden'); await new Promise((r) => setTimeout(r, ms)); set('visible');
  }, ms);
  // back after a moment: nothing's due, nothing asked for (but the app checked for a new version)
  await p.waitForTimeout(5500);
  let before = asked.forecast;
  await away(); await p.waitForTimeout(1500);
  ok(asked.forecast === before && await p.evaluate(() => window.__updates) === 1, 'back in a moment: the forecast isn\'t asked for again (nothing due), but a new version of the app is looked for', `${asked.forecast - before} asked, ${await p.evaluate(() => window.__updates)} checks`);
  // back after a while (the forecast kept 20 minutes ago, as if the phone had been put away): asked again, and said so
  // (what's kept is read once a session, then held in memory as it's written: so the page is told it's changed, as it
  // is when another tab changes it, data.js keptRaw)
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('wx:') && !k.startsWith('wx:s')) { const v = JSON.parse(localStorage.getItem(k)); if (v?.forecast) { v.forecast.at -= 20 * 60e3; localStorage.setItem(k, JSON.stringify(v)); dispatchEvent(new StorageEvent('storage', { key: k, storageArea: localStorage })); } } });
  await p.evaluate(() => { document.getElementById('updated').textContent = 'Updated 20 min ago'; });
  await p.waitForTimeout(5500);
  before = asked.forecast;
  await away();
  await p.waitForFunction(() => /Updated just now/.test(document.getElementById('updated').textContent), null, { timeout: 15000 }).catch(() => {});
  ok(asked.forecast === before + 1 && /Updated just now/.test(await p.textContent('#updated')), 'back after a while: the forecast asked for again as it\'s opened, and the page updated', `${asked.forecast - before} asked; ${await p.textContent('#updated')}`);
  // a new version of the app, arriving just as it's opened: it starts on it there and then
  await p.evaluate(() => { window.__same = 1; });
  await away(); await p.waitForTimeout(300);
  await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await p.waitForFunction(() => !window.__same, null, { timeout: 10000 }).catch(() => {});
  await p.waitForSelector('.day-row', { timeout: 20000 });
  ok(await p.evaluate(() => !window.__same), 'a new version arriving as it\'s opened: it starts again on it');
  // one arriving with a sheet open: left until the next time it's opened
  await p.evaluate(() => { window.__same = 1; });
  await p.locator('#settings-btn').evaluate((e) => e.click()); await p.waitForSelector('dialog[open]');
  await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await p.waitForTimeout(1500);
  const stayed = await p.evaluate(() => window.__same === 1);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('dialog[open]'));
  await away();
  await p.waitForFunction(() => !window.__same, null, { timeout: 10000 }).catch(() => {});
  ok(stayed && await p.evaluate(() => !window.__same), 'one arriving while a sheet\'s open: not then, but the next time it\'s opened', `stayed ${stayed}`);
  await ctx.close();
}
// the API turns away what isn't real: made-up keys, a place left out, a body that isn't an object
{
  const call = (method, path, body, origin = 'http://weather.localhost:8788') => new Promise((done, fail) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port: 8788, path, method, headers: { Host: 'weather.localhost:8788', Origin: origin, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: t }));
    });
    r.on('error', fail); if (data) r.write(data); r.end();
  });
  const fake = await call('POST', '/api/weather/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/made-up', keys: { p256dh: 'AAAA', auth: 'AAAA' } }, place: { lat: 51.5, lon: -0.1, name: 'X' }, rain: true });
  ok(fake.status === 400 && /keys/i.test(fake.body), 'a subscription with made-up keys is turned away', `${fake.status} ${fake.body}`);
  const port = await call('POST', '/api/weather/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com:8443/fcm/send/x', keys: { p256dh: 'AAAA', auth: 'AAAA' } }, place: { lat: 51.5, lon: -0.1 }, rain: true });
  ok(port.status === 400, 'and one to a push service on another port', `${port.status}`);
  const arr = await call('POST', '/api/weather/unsubscribe', []);
  ok(arr.status === 400, 'a body that isn\'t an object: a 400, not a 500', `${arr.status}`);
  // official warnings: the National Weather Service's for a point in the US; none where no feed draws its areas
  const ny = JSON.parse((await call('GET', `/api/weather/warnings?lat=40.71&lon=-74.01`, null)).body || '{}');
  ok(ny.warnings?.length === 1 && ny.warnings[0].issuer === 'National Weather Service' && ny.warnings[0].event === 'Wind Advisory' && /^https:\/\/forecast\.weather\.gov\/MapClick\.php\?lat=40\.71&lon=-74\.01$/.test(ny.warnings[0].url),
    'official warnings in the US, from the National Weather Service (none over, cancelled or a test)', JSON.stringify(ny).slice(0, 160));
  const bac = JSON.parse((await call('GET', '/api/weather/warnings?lat=52.86&lon=1.47', null)).body || '{}'), w0 = bac.warnings?.[0] || {};
  ok(bac.warnings?.length === 1 && w0.issuer === 'Environment Agency' && w0.event === 'Flood warning' && w0.level === 3 && w0.open === true && w0.expires === null && Date.parse(w0.checked) > Date.now() - 60e3 && w0.url === 'https://check-for-flooding.service.gov.uk/target-area/054FWCBACTN' && !('floodArea' in w0),
    'flood warnings in England, from the Environment Agency: those whose area takes the place in (not one 10 km off, nor one no longer in force)', JSON.stringify(bac).slice(0, 200));
  const berlin = await call('GET', '/api/weather/warnings?lat=52.52&lon=13.40', null);
  ok(berlin.status === 200 && berlin.body === '{"warnings":[]}', 'none for Berlin (Germany\'s service names regions by code, not drawn areas)', berlin.body);
  const badWarn = await call('GET', '/api/weather/warnings?lat=abc&lon=1', null);
  ok(badWarn.status === 400, 'and a place that isn\'t one is turned away', `${badWarn.status}`);
  const noPlace = await call('GET', '/api/weather/obs', null);
  ok(noPlace.status === 400, 'the airport reports need a place (not 0, 0)', `${noPlace.status}`);
  const other = await call('POST', '/api/weather/subscribe', {}, 'https://evil.example');
  ok(other.status === 403, 'another site can\'t sign phones up', `${other.status}`);
  ok(/default-src 'none'/.test(noPlace.headers['content-security-policy'] || '') && noPlace.headers['cross-origin-resource-policy'] === 'same-origin', 'the API\'s answers carry their own locks', JSON.stringify([noPlace.headers['content-security-policy'], noPlace.headers['cross-origin-resource-policy']]));
}
// its own address only (asked of the local server directly, by name)
const get = (host, path) => new Promise((done, fail) => http.get({ host: '127.0.0.1', port: 8788, path, headers: { Host: host } }, (r) => {
  let body = ''; r.on('data', (c) => (body += c)); r.on('end', () => done({ status: r.statusCode, body }));
}).on('error', fail));
const W = 'weather.localhost', L = 'localhost';
ok((await get(W, '/api/content')).status === 404 && (await get(W, '/pigeon/')).status === 404 && (await get(W, '/nothing-here')).status === 404, 'nothing of the site or Chat at the weather address');
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
  const mine = async (to = endpoint) => Promise.all(readFileSync(`${S}/pushbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.headers['x-endpoint'] === to).map((x) => decrypt(x.body)));
  const tick = () => new Promise((done, fail) => { const r = http.request({ host: '127.0.0.1', port: 8788, path: '/api/weather/tick', method: 'POST', headers: { Host: 'localhost', Authorization: 'Bearer tick-test-secret' } }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => done({ status: res.statusCode, ...JSON.parse(t || '{}') })); }); r.on('error', fail); r.end(); });
  const { ctx, p } = await open({}, { push: { endpoint, p256dh: b64u(pub), auth: b64u(authK) } });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.click('#settings-btn'); await p.click('[data-go="notify"]');
  // (the times to choose are a quarter of an hour apart: the one just gone)
  const at = new Date(Math.floor((Date.now() - 5 * 60e3) / 900e3) * 900e3), hhmm = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
  await p.selectOption('select[name="briefAt"]', hhmm);
  await p.check('input[name="brief"]');
  await p.waitForFunction(() => /^On: a briefing/.test(document.getElementById('notify-status').textContent), null, { timeout: 10000 });
  await p.click('#notify-places .np-row[data-key="51.51,-0.13"] .np-chip[data-k="rain"]');
  await p.waitForFunction(() => /^On: rain alerts for London and a briefing at \d\d:\d\d for London\.$/.test(document.getElementById('notify-status').textContent), null, { timeout: 10000 }).catch(() => {});
  ok(/^On: rain alerts for London and a briefing at \d\d:\d\d for London\.$/.test(await p.textContent('#notify-status')) && await p.inputValue('select[name="briefFor"]') === '51.51,-0.13', 'notifications on, for London: its rain alerts from its own row, and the briefing for it', await p.textContent('#notify-status'));
  const quiet = (() => { const h = new Date().getUTCHours(); return h >= 22 || h < 7; })();
  const t1 = await tick();
  ok(t1.status === 200 && t1.subs === 1 && t1.brief === 1 && t1.rain === (quiet ? 0 : 1), 'the tick sends what\'s due', JSON.stringify(t1));
  const got = await mine();
  const brief = got.find((n) => n.tag === 'brief'), rain = got.find((n) => n.tag === 'rain'), hello = got.filter((n) => n.tag === 'wx-on');
  ok(hello.length === 1 && hello[0].title === 'Notifications on' && /^A briefing at \d\d:\d\d for London\.$/.test(hello[0].body), 'turning them on sends one "Notifications on" first (only a real phone can take it)', hello.map((n) => `${n.title} — ${n.body}`).join(' | '));
  ok(brief && /^London · \d+° \/ \d+°$/.test(brief.title) && /on the way from about/.test(brief.body) && /Met Office: yellow rain warning until (tomorrow )?\d\d:\d\d\./.test(brief.body), 'the briefing, decrypted, with the Met Office\'s warning in force', brief && `${brief.title} — ${brief.body}`);
  if (!quiet) ok(rain && /^Rain in about \d+ min$/.test(rain.title) && /^London: Rain starting in about/.test(rain.body), 'the rain alert, decrypted', rain && `${rain.title} — ${rain.body}`);
  const t2 = await tick();
  ok(t2.rain === 0 && t2.brief === 0, 'and neither again straight away', JSON.stringify(t2));
  await p.click('#notify-places .np-row[data-key="51.51,-0.13"] .np-chip[data-k="rain"]');
  await p.waitForFunction(() => /^On: a briefing/.test(document.getElementById('notify-status').textContent), null, { timeout: 10000 });
  await p.uncheck('input[name="brief"]');
  await p.waitForFunction(() => document.getElementById('notify-status').textContent === 'Off.', null, { timeout: 10000 });
  ok((await tick()).subs === 0, 'turned off: the server forgets the phone');
  await ctx.close();
  // the radar's say, where it sees, as the app has it: the models dry here, and rain on the radar coming this way (a
  // second phone, so the first's three hours' wait doesn't stand in the way)
  if (!quiet) {
    wxScenario = {}; radarScenario = 'coming';
    const second = 'https://fcm.googleapis.com/fcm/send/weather-test-device-2';
    const { ctx: c2, p: p2 } = await open({}, { push: { endpoint: second, p256dh: b64u(pub), auth: b64u(authK) } });
    await p2.evaluate(() => navigator.serviceWorker.ready);
    await p2.click('#settings-btn'); await p2.click('[data-go="notify"]'); await p2.click('#notify-places .np-row[data-key="51.51,-0.13"] .np-chip[data-k="rain"]');
    await p2.waitForFunction(() => /^On: rain alerts/.test(document.getElementById('notify-status').textContent), null, { timeout: 10000 });
    const t3 = await tick(), alert = (await mine(second)).find((n) => n.tag === 'rain');
    ok(t3.radar === 1 && t3.rain === 1 && alert && /^Rain in (about \d+ min|a few minutes)$/.test(alert.title) && /^London: Rain starting (in about \d+ min|any minute)/.test(alert.body),
      'the rain alert from the radar, where it sees: rain coming that the models don\'t have', `${JSON.stringify(t3)} ${alert ? `${alert.title} — ${alert.body}` : 'none'}`);
    await p2.click('#notify-places .np-row[data-key="51.51,-0.13"] .np-chip[data-k="rain"]');
    await p2.waitForFunction(() => document.getElementById('notify-status').textContent === 'Off.', null, { timeout: 10000 });
    await c2.close();
    wxScenario = { rainIn: 30 }; radarScenario = null;
  }
  // official warnings as they're issued: turned on, those in force already aren't sent (they're on the page); one newly
  // issued is, once; at any hour if it's amber
  {
    const third = 'https://fcm.googleapis.com/fcm/send/weather-test-device-3';
    const { ctx: c3, p: p3 } = await open({}, { push: { endpoint: third, p256dh: b64u(pub), auth: b64u(authK) } });
    await p3.evaluate(() => navigator.serviceWorker.ready);
    await p3.click('#settings-btn'); await p3.click('[data-go="notify"]'); await p3.click('#notify-places .np-row[data-key="51.51,-0.13"] .np-chip[data-k="warn"]');
    await p3.waitForFunction(() => /^On: official warnings for London\.$/.test(document.getElementById('notify-status').textContent), null, { timeout: 10000 });
    const hello = (await mine(third)).find((n) => n.tag === 'wx-on');
    const w1 = await tick(), w2 = await tick();
    warnExtra = true;
    const w3 = await tick(), w4 = await tick();
    const sent = (await mine(third)).filter((n) => n.tag === 'warn');
    ok(hello?.body === 'Official warnings for London.' && w1.warn === 0 && w2.warn === 0 && w3.warn === 1 && w4.warn === 0 && sent.length === 1 && sent[0].title === 'Amber wind warning' && /^London: Met Office · Until (tomorrow )?\d\d:\d\d\. Gusts of 60 to 70 mph are likely\.$/.test(sent[0].body),
      'official warnings: none for those in force as they\'re turned on, then one newly issued, once', `${hello?.body} | ${[w1, w2, w3, w4].map((t) => t.warn).join(',')} | ${sent.map((n) => `${n.title} — ${n.body}`).join(' / ')}`);
    warnExtra = false;
    await p3.click('#notify-places .np-row[data-key="51.51,-0.13"] .np-chip[data-k="warn"]');
    await p3.waitForFunction(() => document.getElementById('notify-status').textContent === 'Off.', null, { timeout: 10000 });
    await c3.close();
  }
}

ok(!errs.length, 'no errors on the page', errs.join('; '));
console.log(`FAILS ${fails}`);
await b.close();
process.exit(0);
