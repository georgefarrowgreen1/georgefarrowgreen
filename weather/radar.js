// The rain radar: the last two hours of radar, every ten minutes, from RainViewer's free mosaic of the world's
// weather radars, then the next two hours as the weather models see them (Open-Meteo's 15-minute rain on a 9 × 9
// grid about 220 km across around the place, painted in the radar's own colours), on a map: OpenFreeMap's vector
// map, drawn on the phone in the app's own style (mapgl.js), or where the phone can't draw it, OpenStreetMap's own
// turned dark (mapleaf.js). Either is driven the same way from here.
// RainViewer's free tiles go to zoom 7's detail (about a county across a tile),
// which its 512-pixel tiles at zoom 6 carry too, with a quarter of the requests
// (it asks apps to keep them few); closer in, they're enlarged: smoothly, read
// back into reflectivity and blended (rainmap.js rainValues), rather than as squares.
//
// The map's code is loaded only as the card comes near (the vector map's, a screen ahead: it's a megabyte).

import { grid, paint, timeline, LEGEND, decode, rainValues, colour, ramp, squareAt, driftOf, rainSaid, radarAt, partsAt, tileOf, cornerOf, paintField, fieldAt, gridAt, tint, mmhOf, MIN_RATE, TEMP_STOPS, WIND_STOPS } from "./rainmap.js";
import { glMix } from "./radarmix.js";

const FRAMES = "https://api.rainviewer.com/public/weather-maps.json";
const MODEL = "https://api.open-meteo.com/v1/forecast";
// NATIVE: the radar's finest detail, as a zoom of 256-pixel tiles; SRC: the size of the tiles
// asked for (512, a zoom below, as fine as NATIVE's)
const NATIVE = 7, SRC = 512, SHOW = 0.8, STEP = 600, HOLD = 1800, AT_NOW = 1200, PX = 200, MODEL_TTL = 15 * 60e3;
// the map's zoom as it opens (about 10 miles to its scale's bar: the place and the rain about it, the radar smoothed), and
// the closest it goes (two steps in: no closer than the radar's worth seeing)
const VIEW = 9, CLOSEST = 11, FIELD_ZOOM = 7;
const svg = (d, w = 1.8) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CENTRE = svg('<path d="M20.2 3.8 3.9 10.6c-.7.3-.6 1.3.1 1.5l6.6 1.3 1.3 6.6c.2.7 1.2.8 1.5.1l6.8-16.3z" fill="currentColor" stroke-width="1.2"/>');
const PLUS = svg('<path d="M12 5v14M5 12h14"/>', 2), MINUS = svg('<path d="M5 12h14"/>', 2);
// (the map's layers: a stack of sheets)
const LAYERS = svg('<path d="m12 4 8.5 4.3L12 12.6 3.5 8.3z"/><path d="m3.5 12.2 8.5 4.3 8.5-4.3M3.5 16 12 20.3l8.5-4.3"/>', 1.7);
// The map's layers, as Apple's Weather map has them: the rain (the radar's, then the models'), or the models' temperature,
// wind, air quality or UV index over a grid of their own; kept as chosen
const KINDS = { rain: "Precipitation", temp: "Temperature", wind: "Wind", aq: "Air quality", uv: "UV index" };
// (the UV index's bands, in the WHO's colours: low green, moderate yellow, high orange, very high red, extreme violet)
const UV_STOPS = [[0, [76, 175, 80]], [2.5, [139, 195, 74]], [3, [255, 214, 0]], [5.5, [255, 193, 7]], [6, [255, 140, 0]], [7.5, [244, 109, 0]], [8, [229, 57, 53]], [10.5, [198, 40, 40]], [11, [156, 39, 176]], [14, [106, 27, 154]]];
const UV_WORDS = ["Low", "Moderate", "High", "Very high", "Extreme"], uvWord = (v) => UV_WORDS[v < 3 ? 0 : v < 6 ? 1 : v < 8 ? 2 : v < 11 ? 3 : 4];
// the European air quality index's bands (as the page says it), in the European Environment Agency's colours
const AQ_STOPS = [[0, [80, 240, 230]], [20, [80, 204, 170]], [40, [240, 230, 65]], [60, [255, 80, 80]], [80, [150, 0, 50]], [100, [125, 33, 129]], [140, [90, 20, 100]]];
const AQ_WORDS = ["Good", "Fair", "Moderate", "Poor", "Very poor", "Extremely poor"];

// The map: the vector one where the phone has WebGL 2, else Leaflet's (and Leaflet's if the vector one won't start)
let vector = null;
const vectorLib = () => (vector ||= import("./mapgl.js").catch((e) => { vector = null; throw e; }));
async function mapIn(el, opts) {
  try {
    const v = await vectorLib();
    if (v.able()) return await v.glMap(el, opts);
  } catch (_) { el.replaceChildren(); el.className = "radar-map"; }
  return (await import("./mapleaf.js")).leafMap(el, opts);
}
// The models' next two hours of rain on the grid (kept for 15 minutes): { times (ms), rain[k][point] (mm/h), snow[k][point] }
async function modelRain(g) {
  const key = `radarfc:${g.id}`;
  try { const kept = JSON.parse(localStorage.getItem(key) || "null"); if (kept && Date.now() - kept.at < MODEL_TTL) return kept; } catch (_) {}
  const q = new URLSearchParams({ latitude: g.lats.join(","), longitude: g.lons.join(","), minutely_15: "precipitation,snowfall", forecast_minutely_15: "9", timezone: "GMT" });
  const r = await fetch(`${MODEL}?${q}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`model ${r.status}`);
  const j = await r.json(), list = Array.isArray(j) ? j : [j], m0 = list[0]?.minutely_15;
  if (!m0?.time || list.length !== g.n * g.n) throw new Error("model shape");
  // (each quarter hour's rain is the 15 minutes up to its time: shown at their middle)
  const out = { at: Date.now(), times: m0.time.map((t) => Date.parse(`${t}Z`) - 450e3), rain: [], snow: [] };
  m0.time.forEach((_, k) => {
    out.rain.push(list.map((o) => Math.round((o.minutely_15?.precipitation?.[k] ?? 0) * 4 * 100) / 100));
    out.snow.push(list.map((o) => ((o.minutely_15?.snowfall?.[k] ?? 0) > 0 ? 1 : 0)));
  });
  try {
    // (and those kept for elsewhere that have gone stale cleared away: one for each part of the map looked at would pile up)
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("radarfc:") || k === key) continue;
      let at = 0; try { at = JSON.parse(localStorage.getItem(k))?.at ?? 0; } catch (_) {}
      if (Date.now() - at >= MODEL_TTL) localStorage.removeItem(k);
    }
    localStorage.setItem(key, JSON.stringify(out));
  } catch (_) {}
  return out;
}
// The models' rain on the grid by the hour, from this hour to twelve or so on (kept for half an hour), for after the next
// two hours: { times (ms: each hour's middle, its rain being the hour up to its time), rain[k][point] (mm/h), snow[k][point] }
async function modelHours(g) {
  const key = `radarhr:${g.id}`;
  try { const kept = JSON.parse(localStorage.getItem(key) || "null"); if (kept && Date.now() - kept.at < 2 * MODEL_TTL && kept.rain?.[0]?.length === g.n * g.n) return kept; } catch (_) {}
  const q = new URLSearchParams({ latitude: g.lats.join(","), longitude: g.lons.join(","), hourly: "precipitation,snowfall", forecast_hours: "14", timezone: "GMT" });
  const r = await fetch(`${MODEL}?${q}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`hours ${r.status}`);
  const j = await r.json(), list = Array.isArray(j) ? j : [j], h0 = list[0]?.hourly;
  if (!h0?.time || list.length !== g.n * g.n) throw new Error("hours shape");
  const out = { at: Date.now(), times: h0.time.map((t) => Date.parse(`${t}Z`) - 1800e3), rain: [], snow: [] };
  h0.time.forEach((_, k) => {
    out.rain.push(list.map((o) => Math.round((o.hourly?.precipitation?.[k] ?? 0) * 100) / 100));
    out.snow.push(list.map((o) => ((o.hourly?.snowfall?.[k] ?? 0) > 0 ? 1 : 0)));
  });
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("radarhr:") && k !== key) localStorage.removeItem(k); localStorage.setItem(key, JSON.stringify(out)); } catch (_) {}
  return out;
}
// The models' temperature and wind on the grid, by the hour, from three hours ago to twelve on (kept for half an hour):
// { times (ms), temp[k][point] (°C), wind[k][point], gust[k][point] (km/h), dir[k][point] (degrees, whence it blows), uv[k][point] }
async function modelField(g) {
  const key = `radarfld:${g.id}`;
  try { const kept = JSON.parse(localStorage.getItem(key) || "null"); if (kept && Date.now() - kept.at < 2 * MODEL_TTL && kept.temp?.[0]?.length === g.n * g.n && kept.gust && kept.uv) return kept; } catch (_) {}
  const q = new URLSearchParams({ latitude: g.lats.join(","), longitude: g.lons.join(","), hourly: "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index", past_hours: "3", forecast_hours: "13", wind_speed_unit: "kmh", timezone: "GMT" });
  const r = await fetch(`${MODEL}?${q}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`field ${r.status}`);
  const j = await r.json(), list = Array.isArray(j) ? j : [j], h0 = list[0]?.hourly;
  if (!h0?.time || list.length !== g.n * g.n) throw new Error("field shape");
  const col = (name, k) => list.map((o) => o.hourly?.[name]?.[k] ?? null);
  const out = { at: Date.now(), times: h0.time.map((t) => Date.parse(`${t}Z`)), temp: [], wind: [], gust: [], dir: [], uv: [] };
  h0.time.forEach((_, k) => { out.temp.push(col("temperature_2m", k)); out.wind.push(col("wind_speed_10m", k)); out.gust.push(col("wind_gusts_10m", k)); out.dir.push(col("wind_direction_10m", k)); out.uv.push(col("uv_index", k)); });
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("radarfld:") && k !== key) localStorage.removeItem(k); localStorage.setItem(key, JSON.stringify(out)); } catch (_) {}
  return out;
}
// The same hours on a grid from another of Open-Meteo's (the air quality's, the finer temperature's), kept for half an
// hour under key: { at, times (ms), [name][k][point] }
async function hourlyGrid(g, key, url, vars) {
  try { const kept = JSON.parse(localStorage.getItem(key) || "null"); if (kept && Date.now() - kept.at < 2 * MODEL_TTL && kept[vars[0][1]]?.[0]?.length === g.n * g.n) return kept; } catch (_) {}
  const q = new URLSearchParams({ latitude: g.lats.join(","), longitude: g.lons.join(","), hourly: vars.map(([v]) => v).join(","), past_hours: "3", forecast_hours: "13", timezone: "GMT" });
  const r = await fetch(`${url}?${q}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${key} ${r.status}`);
  const j = await r.json(), list = Array.isArray(j) ? j : [j], h0 = list[0]?.hourly;
  if (!h0?.time || list.length !== g.n * g.n) throw new Error(`${key} shape`);
  const out = { at: Date.now(), times: h0.time.map((t) => Date.parse(`${t}Z`)) };
  for (const [v, name] of vars) out[name] = h0.time.map((_, k) => list.map((o) => o.hourly?.[v]?.[k] ?? null));
  try { const pre = key.split(":")[0]; for (const k of Object.keys(localStorage)) if (k.startsWith(`${pre}:`) && k !== key) localStorage.removeItem(k); localStorage.setItem(key, JSON.stringify(out)); } catch (_) {}
  return out;
}
// the air quality (the European index) over the field's grid; the temperature over a finer one about the place (13 ×
// 13 points about 220 km across, about 18 km apart: the lie of the land shows in it, close in)
const modelAir = (g) => hourlyGrid(g, `radaraq:${g.id}`, "https://air-quality-api.open-meteo.com/v1/air-quality", [["european_aqi", "aq"]]);
const modelFine = (g) => hourlyGrid(g, `radarfine:${g.id}`, MODEL, [["temperature_2m", "temp"]]);
const canvasFor = (g, rates, snow) => {
  const c = document.createElement("canvas"); c.width = PX; c.height = PX;
  const ctx = c.getContext("2d"), img = ctx.createImageData(PX, PX);
  paint(img.data, PX, PX, g, rates, snow); ctx.putImageData(img, 0, 0);
  return c;
};
// A radar tile's pixels, read back into reflectivity once (the last 120 kept). Asked for six at a time, the frame
// on show first; a tile that doesn't come isn't kept (it's asked for again next time it's wanted)
const codes = new Map(), asks = [];
let asking = 0;
function next() {
  while (asking < 6 && asks.length) {
    const k = Math.max(0, asks.findIndex((a) => a.shown()));
    const a = asks.splice(k, 1)[0];
    asking++;
    a.go();
  }
}
function tileCodes(url, shown = () => true) {
  if (codes.has(url)) return codes.get(url);
  const p = new Promise((ok) => {
    asks.push({ shown, go: () => {
      const img = new Image(), end = (v) => { asking--; ok(v); next(); };
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = c.height = SRC;
          const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, SRC, SRC);
          end(decode(x.getImageData(0, 0, SRC, SRC).data));
        } catch (_) { end(null); }
      };
      img.onerror = () => { if (codes.get(url) === p) codes.delete(url); end(null); };
      img.src = url;
    } });
    next();
  });
  codes.set(url, p);
  if (codes.size > 120) codes.delete(codes.keys().next().value);
  return p;
}
// How the radar is smoothed (rainmap.js rainValues): crisp edges in the radar's own bands, soft edges with
// colours that flow, or (as here) clean edges with flowing colour
const LOOKS = { contours: { edge: [0.22, 0.45], soft: 0.4 }, gradient: { edge: [0.04, 0.6], soft: 2.5 }, both: { edge: [0.16, 0.5], soft: 1.4 } };
const LOOK = LOOKS.both;
// The smoothing, the frame on show first: off the page's own thread where it can be (radarwork.js, a few at once), so
// the map keeps moving under a finger while it's done; on it, a few tiles at a time, where it can't. Each job's made
// ready here (prep: its codes stitched, or done with if it's dry or no longer wanted), its rain worked out there
const jobs = [], pool = [];
let working = false, pooled = false;
const blank = () => new Uint8ClampedArray(256 * 256 * 4);
function workers() {
  if (pooled) return pool;
  pooled = true;
  try {
    const n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL("./radarwork.js", import.meta.url), { type: "module" });
      w.onmessage = ({ data }) => { const j = w.job; w.job = null; j?.job.done(data.vals, j.ready.partial); kick(); };
      // (one that won't start, or fails: what they had in hand done here, and everything here from then on)
      w.onerror = (e) => { e.preventDefault?.(); retire(); };
      pool.push(w);
    }
  } catch (_) { retire(); }
  return pool;
}
function retire() {
  for (const w of pool.splice(0)) {
    const j = w.job; w.job = null;
    try { w.terminate(); } catch (_) {}
    if (j) { try { j.job.done(rainValues(blank(), 256, j.ready.src, j.job.x0, j.job.y0, j.job.span, LOOK), j.ready.partial); } catch (_) { j.job.fail(); } }
  }
  kick();
}
function work() {
  working = false;
  const until = performance.now() + 12, ws = workers();
  while (jobs.length && performance.now() < until) {
    const free = ws.find((w) => !w.job);
    if (ws.length && !free) break;
    const job = jobs.splice(Math.max(0, jobs.findIndex((j) => j.shown())), 1)[0];
    // (one tile's trouble mustn't stop the rest)
    let ready = null;
    try { ready = job.prep(); } catch (_) { job.fail(); }
    if (!ready) continue;
    if (free) { free.job = { job, ready }; free.postMessage({ src: ready.src, x0: job.x0, y0: job.y0, span: job.span, look: LOOK }); }
    else { try { job.done(rainValues(blank(), 256, ready.src, job.x0, job.y0, job.span, LOOK), ready.partial); } catch (_) { job.fail(); } }
  }
  // (more to do, and a thread free for it: on again; all of them busy, each that's done starts the next)
  if (jobs.length && (!ws.length || ws.some((w) => !w.job))) kick();
}
function kick() { if (!working && jobs.length) { working = true; setTimeout(work, 0); } }
function queue(job) { jobs.push(job); kick(); }
// the codes about a square stitched into one array, for rainValues (from: the tiles it reaches over, by "ox,oy", each SRC
// across, counted from the first's corner; a couple of pixels round it, as far as the smoothing reaches); null if dry
function stitch(from, x0, y0, span) {
  const ox = Math.floor(x0) - 2, oy = Math.floor(y0) - 2, w = Math.ceil(x0 + span + 2) - ox, h = Math.ceil(y0 + span + 2) - oy, data = new Uint8Array(w * h);
  let wet = false;
  for (let y = 0; y < h; y++) {
    const yy = y + oy, ty = Math.floor(yy / SRC), row = (yy - ty * SRC) * SRC;
    for (let x = 0; x < w;) {
      const xx = x + ox, tx = Math.floor(xx / SRC), n = Math.min(w - x, (tx + 1) * SRC - xx), t = from.get(`${tx},${ty}`);
      if (t) {
        const seg = t.subarray(row + xx - tx * SRC, row + xx - tx * SRC + n);
        data.set(seg, y * w + x);
        if (!wet) for (let q = 0; q < n; q++) if (seg[q]) { wet = true; break; }
      }
      x += n;
    }
  }
  return wet ? { data, w, h, ox, oy } : null;
}
// One tile of a radar frame (c: { z, x, y }, a 256-pixel tile's), smoothed: drawn from the radar's own (512 pixels, a
// zoom below, at most zoom 6: as fine as zoom 7's; base: the frame's address up to their size), as rain rather than
// colour (rainmap.js rainValues: RGBA-sized bytes). Null where it's dry; GONE when it's no longer wanted by its turn
// (gone.aborted: scrolled away, or the frame replaced); undefined where none of the radar it's drawn from came, and
// marked partial where some didn't (neither kept: asked for again next time). shown(): its frame is the one on show
// (its tiles come first). (The next two hours carried on from the radar are the minutes between's: below)
// Heavy work (the map's code, read in, and the map itself, made) once the page has come to rest: not in the middle of
// a flick, where it would hold the scrolling up for a moment
function whenStill(fn) {
  let t = 0;
  const go = () => { removeEventListener("scroll", on); if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 500 }); else setTimeout(fn, 0); };
  const on = () => { clearTimeout(t); t = setTimeout(go, 180); };
  addEventListener("scroll", on, { passive: true }); on();
}
const GONE = Symbol("gone");
function radarTile(base, c, shown, gone) {
  // (sz: the zoom of the tiles drawn from, each SRC pixels; one of their pixels is a zoom-(sz + 1) 256-tile's)
  const sz = Math.max(0, Math.min(c.z, NATIVE) - 1), f = 2 ** (c.z - sz), span = SRC / f, n = 2 ** sz;
  const px = Math.floor(c.x / f), py = Math.floor(c.y / f), x0 = (c.x - px * f) * span, y0 = (c.y - py * f) * span;
  const url = (x, y) => `${base}/${sz}/${((x % n) + n) % n}/${y}/2/1_1.png`;
  // the tiles its pixels come from: its own, and its neighbours' where the blend reaches over
  const need = [];
  for (let oy = Math.floor((y0 - 3) / SRC); oy <= Math.floor((y0 + span + 3) / SRC); oy++) {
    for (let ox = Math.floor((x0 - 3) / SRC); ox <= Math.floor((x0 + span + 3) / SRC); ox++) if (py + oy >= 0 && py + oy < n) need.push([ox, oy]);
  }
  return Promise.all(need.map(([ox, oy]) => tileCodes(url(px + ox, py + oy), shown))).then((got) => new Promise((ok) => queue({
    shown, x0, y0, span,
    fail: () => ok(undefined),
    prep: () => {
      if (gone.aborted) { ok(GONE); return null; }
      if (!got.some(Boolean)) { ok(undefined); return null; }
      const partial = got.some((x) => !x), src = stitch(new Map(need.map(([ox, oy], i) => [`${ox},${oy}`, got[i]])), x0, y0, span);
      if (!src) { ok(partial ? undefined : null); return null; }
      return { src, partial };
    },
    done: (vals, partial) => { if (partial) vals.partial = true; ok(vals); },
  })));
}
// A frame's tile as it is (radarTile, not carried on), drawn once and kept, as rain (rainmap.js rainValues), to be drawn
// again (the last 160): the frame's own layer on the map (coloured as it's asked for: rgbaOf) and the minutes either
// side of it (below) both draw from it. Wanted by more than one at once, it's drawn once, and given up only when none
// of them want it any more. → a promise of { vals } (null where it's dry), or of null when it's no longer wanted (kept
// only once it's whole: radarTile)
const kept = new Map(), KEEP = 220;
let keptZ = 0;          // (the zoom last asked for: tiles of others are let go first)
const rgbaOf = (vals) => { const img = new ImageData(256, 256); colour(vals, img.data, LOOK.soft); return img; };
// (and as a picture, for drawing the minutes between without the graphics chip's help)
const drawable = (img) => {
  if (self.createImageBitmap) return createImageBitmap(img, { premultiplyAlpha: "premultiply" });
  const c = document.createElement("canvas"); c.width = c.height = 256; c.getContext("2d").putImageData(img, 0, 0);
  return Promise.resolve(c);
};
const bitmapOf = (e) => (e.bmpP ||= drawable(rgbaOf(e.vals)).then((b) => (e.bmp = b), () => { e.bmpP = null; }));
// (warm: asked for ahead, a zoom out say: not the zoom that's kept)
function keptTile(base, c, shown, gone, warm = false) {
  const key = `${base}|${c.z}|${c.x}|${c.y}`;
  if (!warm) keptZ = c.z;
  let e = kept.get(key);
  if (e?.done) { kept.delete(key); kept.set(key, e); return Promise.resolve(e); }       // (kept longest: wanted last)
  if (!e) {
    const box = e = { users: [], shows: [], done: false, vals: null };
    const all = { get aborted() { return box.users.every((g) => g.aborted); } };
    const drop = () => { if (kept.get(key) === box) kept.delete(key); return null; };
    // (given up as no one wanted it by its turn, but wanted again since: drawn after all)
    const draw = () => radarTile(base, c, () => box.shows.some((f) => f()), all).then((vals) => {
      if (vals === GONE) return all.aborted ? drop() : draw();
      // (one with some of its radar missing is shown, but not kept)
      if (vals ? vals.partial : vals !== null) { drop(); return vals ? { vals } : null; }
      box.vals = vals; box.done = true;
      // (no more than KEEP: the oldest let go, those of another zoom first, never those the minutes between are drawing)
      for (const other of [true, false]) for (const [k, x] of kept) {
        if (kept.size <= KEEP) break;
        if (x.done && !(x.pin && !x.pin.aborted) && (!other || !k.includes(`|${keptZ}|`))) kept.delete(k);
      }
      return box;
    }, drop);
    box.p = draw();
    kept.set(key, box);
  }
  e.users.push(gone); e.shows.push(shown);
  return e.p;
}
const keptNow = (base, z, x, y) => kept.get(`${base}|${z}|${x}|${y}`);

// RainViewer's list of frames, kept a few minutes (the card and the next hours' words both ask for it)
let frameList = null;
function framesNow() {
  if (frameList && Date.now() - frameList.at < 3 * 60e3) return frameList.p;
  const p = fetch(FRAMES, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`radar ${r.status}`))));
  frameList = { at: Date.now(), p };
  p.catch(() => { if (frameList?.p === p) frameList = null; });
  return p;
}
// How the rain about a place is moving (rainmap.js driftOf), from the latest radar frame and the one 20 minutes before
async function driftAt(host, past, lat, lon) {
  const a = past[past.length - 3], b = past[past.length - 1], tile = (fr) => (x, y) => tileCodes(`${host}${fr.path}/${SRC}/${NATIVE - 1}/${x}/${y}/2/1_1.png`);
  const [A, B] = await Promise.all([squareAt(lat, lon, tile(a)), squareAt(lat, lon, tile(b))]);
  return driftOf(A, B, (b.time - a.time) / 60);
}
// The rain here over the next two hours, from the radar, for the next few hours' words and chart (app.js, with the
// models' after it: rainmap.js blend): rainmap.js radarAt, on the card's own tiles (kept, so it then has them to hand)
export async function rainAt(lat, lon) {
  return radarAt(lat, lon, await framesNow(), (url) => tileCodes(url), Date.now());
}

const ago = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min ` : ""}ago` : `${min} min ago`);
const until = (min) => (min >= 60 ? `in ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `in ${min} min`);
// a round distance, the longest of 1, 2, 3, 5 or 10 to a power of ten no more than n
const round = (n) => { const p = 10 ** Math.floor(Math.log10(n)), d = n / p; return p * (d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1); };

/**
 * The radar, in `card` (#radar). time(t) formats a real UTC time (ms) as the place's own clock;
 * miles(): whether to show the scale in miles. Returns { place(lat, lon), refresh(), note(text) }.
 *
 * The map it's drawn on (mapgl.js, or mapleaf.js) is driven through: frames([{ draw(z, x, y, gone) } | { canvas,
 * bounds }]), show(k, opacity), box(bounds | null | undefined, opacity), dot(lat, lon), clear([{ x, y, w, h }]), view(lat, lon, smooth),
 * zoomBy(±1), explore(on), resize(), state() → { zoom, min, max, mpp }, on("move" | "tap", fn), and credit (its
 * sources' names). Zooms are 256-pixel tiles' (as Leaflet counts them).
 */
export function radar(card, { lat, lon, time, day = () => "", miles = () => false, credits = null, rainSoon = () => true, temp = (c) => `${Math.round(c)}°`, tempUnit = () => "°C", windNum = (k) => Math.round(k), windUnit = () => "km/h" }) {
  const q = (s) => card.querySelector(s);
  const el = q(".radar-map"), said = q("#radar-said"), wrap = q(".radar-wrap"), play = q(".radar-play"), slider = q(".radar-slider"), label = q(".radar-time"), full = q(".radar-full");
  const status = q(".radar-status"), chip = q(".radar-chip"), hint = q(".radar-hint"), scale = q(".radar-scale"), legend = q(".radar-legend");
  let map = null, starting = null, credit = null, dry = null, told = false, frames = [], i = 0, playing = false, fetched = 0, here = { lat, lon }, g = null, loads = 0;
  const touch = matchMedia("(pointer: coarse)").matches, calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // (what changes on the card changing where it is: new words rising in from faint, as the page's do (app.js swap); with
  // Reduce Motion, a quick dissolve)
  const GLIDE = "cubic-bezier(0.32, 0.72, 0, 1)", EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  const rise = (x, from = 0.2) => x.animate(calm ? [{ opacity: from }, { opacity: 1 }] : [{ opacity: from, translate: "0 3px" }, { opacity: 1, translate: "0 0" }], { duration: calm ? 150 : 240, easing: calm ? EASE_OUT : GLIDE });
  // a line of the card's (the next hours above the map, what's missing under it): its words put in, the line opening for
  // them; put away, it folds shut with them still in it, and they're let go once it has (styles.css .off)
  const line = (p, text) => {
    const s = p?.firstElementChild; if (!s) return;
    clearTimeout(p._off);
    if (text) { s.textContent = text; p.classList.remove("off"); return; }
    if (!s.textContent) return;
    p.classList.add("off");
    p._off = setTimeout(() => { s.textContent = ""; p.classList.remove("off"); }, 400);
  };
  // the map light or dark as the phone is (as Apple's Weather map is), its controls to match (styles.css)
  const light = matchMedia("(prefers-color-scheme: light)").matches;
  card.classList.toggle("light-map", light);
  // the place on the map: its temperature in a bubble over it, and its name under it (mark: once the page has them)
  const pin = document.createElement("div"); pin.className = "map-pin"; pin.setAttribute("aria-hidden", "true");
  // (the names on the map keep clear of all of it, its name however long: mapgl.js room)
  const fitRoom = () => requestAnimationFrame(() => { const n = pin.querySelector(".mp-name"); if (map && n?.offsetWidth) map.room?.(n.offsetWidth); });
  pin.innerHTML = '<span class="mp-bubble"><span class="mp-dir"></span><b class="mp-t"></b><span class="mp-u"></span><span class="mp-i"></span></span><span class="mp-dot"></span><span class="mp-name"></span>';

  // the legend: one bar in the colours the radar's drawn in (rainmap.js ramp), light to extreme, then snow's; along
  // under the map in the card, and up the side of it full screen, as Apple's Weather map has it (styles.css: its
  // colours --stops, each word's place along it --at)
  const bar = (snow, from, to) => {
    const r = ramp(snow, LOOK.soft), stops = [];
    for (let d = from; d <= to; d += 2) { const q = (d + 10) * 16; stops.push(`rgba(${r[q]},${r[q + 1]},${r[q + 2]},${(r[q + 3] / 255).toFixed(2)}) ${(((d - from) / (to - from)) * 100).toFixed(1)}%`); }
    const i = document.createElement("i"); i.className = "rl-bar"; i.style.setProperty("--stops", stops.join(", ")); return i;
  };
  const words = document.createElement("div"); words.className = "rl-words";
  for (const [text, dbz] of [["Light", 14], ["Moderate", 30], ["Heavy", 44], ["Extreme", 57]]) {
    const w = document.createElement("span"); w.textContent = text; w.style.setProperty("--at", `${(((dbz - 8) / 54) * 100).toFixed(1)}%`);
    const x = LEGEND.reduce((a, l) => (Math.abs(l.dbz - dbz) < Math.abs(a.dbz - dbz) ? l : a));
    w.title = `About ${x.mmh < 1 ? x.mmh.toFixed(1) : Math.round(x.mmh)} mm an hour`; words.append(w);
  }
  const rain = document.createElement("div"); rain.className = "rl-rain"; rain.append(bar(false, 8, 62), words);
  const snowKey = document.createElement("div"); snowKey.className = "rl-snow"; snowKey.append(bar(true, 0, 45), Object.assign(document.createElement("span"), { textContent: "Snow" }));
  // (the temperature's, or the wind's: its colours, from stops, a few of its values along it, said in the units chosen)
  const fieldKey = (stops, lo, hi, marks, say) => {
    const box = document.createElement("div"), i = document.createElement("i"), ws = document.createElement("div");
    box.className = "rl-rain"; i.className = "rl-bar"; ws.className = "rl-words";
    i.style.setProperty("--stops", stops.filter(([v]) => v >= lo - 5 && v <= hi + 5).map(([v, c]) => `rgb(${c.join(",")}) ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(", "));
    for (const v of marks) { const w = document.createElement("span"); w.textContent = say(v); w.style.setProperty("--at", `${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`); ws.append(w); }
    box.append(i, ws); return box;
  };
  // (round numbers in the units chosen: °C or °F; mph, km/h, m/s or knots, as Apple's has 0 to 75 mph)
  const drawLegend = () => {
    const title = Object.assign(document.createElement("b"), { className: "rl-title", textContent: kind === "rain" ? KINDS.rain : kind === "aq" ? "Air quality (European index)" : kind === "uv" ? "UV index" : `${named()} (${kind === "temp" ? tempUnit() : windUnit()})` });
    if (kind === "temp") {
      const marks = tempUnit() === "°F" ? [14, 32, 50, 68, 86].map((f) => ((f - 32) * 5) / 9) : [-10, 0, 10, 20, 30];
      legend.replaceChildren(title, fieldKey(TEMP_STOPS, marks[0] - 5, marks.at(-1) + 5, marks, temp));
    } else if (kind === "aq") {
      legend.replaceChildren(title, fieldKey(AQ_STOPS, 0, 100, [10, 30, 50, 70, 90], (v) => AQ_WORDS[Math.floor(v / 20)]));
    } else if (kind === "uv") {
      legend.replaceChildren(title, fieldKey(UV_STOPS, 0, 13, [1.2, 4.5, 7, 9.5, 12], uvWord));
    } else if (kind === "wind") {
      const per = windNum(1000) / 1000, step = { mph: 25, "km/h": 40, "m/s": 10, kn: 20 }[windUnit()] || 25, marks = [0, 1, 2, 3].map((k) => (k * step) / per);
      const key = fieldKey(WIND_STOPS, 0, marks[3], marks, (k) => String(Math.round(k * per)));
      key.setAttribute("role", "img"); key.setAttribute("aria-label", SAID.wind);
      legend.replaceChildren(title, key, gustSwitch());
    } else legend.replaceChildren(title, rain, snowKey);
    // (the wind's has buttons in it, so its colours alone are the picture)
    if (kind === "wind") { legend.removeAttribute("role"); legend.removeAttribute("aria-label"); }
    else { legend.setAttribute("role", "img"); legend.setAttribute("aria-label", SAID[kind]); }
  };
  // the wind's, or its gusts' (kept as chosen): the colours, the flow, the bubble and the words all of the one chosen
  let gusts = false;
  try { gusts = localStorage.getItem("wx:mapgusts") === "1"; } catch (_) {}
  const named = () => (kind === "wind" && gusts ? "Wind gusts" : KINDS[kind]);
  const gustSwitch = () => {
    const box = document.createElement("div"); box.className = "rl-switch"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Show the wind or its gusts");
    for (const [on, name] of [[false, "Wind"], [true, "Gusts"]]) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = name; b.setAttribute("aria-pressed", String(gusts === on));
      b.addEventListener("click", () => { if (gusts === on) return; gusts = on; try { localStorage.setItem("wx:mapgusts", on ? "1" : "0"); } catch (_) {}
        fieldMin = null; winds = null; minute = null; drawLegend(); legend.querySelector(`.rl-switch button:nth-child(${on ? 2 : 1})`)?.focus({ preventScroll: true }); show(at); drawPin(); });
      box.append(b);
    }
    return box;
  };
  // (what its colours are, for a screen reader: the rain's as the page has it)
  const SAID = { rain: legend.getAttribute("aria-label") || "", temp: "Colours: cold purple and blue, mild green, warm yellow and orange, hot red",
    wind: "Colours: calm deep blue, lighter the stronger, a gale near white; the wind's flow drawn over it",
    aq: "Colours: good teal, fair green, moderate yellow, poor red, very poor dark red, extremely poor purple",
    uv: "Colours: low green, moderate yellow, high orange, very high red, extreme violet" };
  // (the rain on show till the map's made and the one chosen is to hand: setKind)
  let kind = "rain", want = "rain";
  try { const k = localStorage.getItem("wx:maplayer"); if (KINDS[k]) want = k; } catch (_) {}
  // (the card's title says which: "Rain radar", "Temperature", "Wind"; another chosen, its words rising in: moved, true)
  const retitle = (moved = false) => {
    const t = card.querySelector(".card-title"); if (!t) return;
    let w = t.querySelector(".ct-words");
    if (!w && t.lastChild?.nodeType === 3) { w = Object.assign(document.createElement("span"), { className: "ct-words", textContent: t.lastChild.textContent }); t.lastChild.replaceWith(w); }
    const text = kind === "rain" ? "Rain radar" : KINDS[kind];
    if (!w || w.textContent === text) return;
    w.textContent = text;
    if (moved) rise(w, 0);
  };
  card.dataset.layer = kind;
  drawLegend(); retitle();

  // where the slider is: at (ms), from t0 (the first frame) to tEnd (the last); tNow now, as the clock has it (where it
  // opens, and the past turns to the forecast), tLast the latest radar frame's time (always a little before: it's 5 to
  // 15 minutes coming), and seen how far on the radar counts as seen (up to now, it carried on along its track meanwhile;
  // but not if it's been away a while: then only as far as its latest); the frame nearest at (i), drawn as it is where
  // the minutes between can't be (zoomed far out, or its tiles still coming)
  let t0 = 0, tEnd = 0, tNow = 0, tLast = 0, seen = 0, at = 0, minute = null, layer = -1, layerAt = () => 0, holding = 0;
  // the slider: a step a minute up to split (the radar's two hours and the next two), then a step every three minutes over
  // the models' hours after (PER_H a hour), so the radar's minutes keep their room on it (none after: split, Infinity)
  let split = Infinity;
  const PER_H = 20;
  const uOf = (t) => (t <= split ? (t - t0) / 60e3 : (split - t0) / 60e3 + ((t - split) / 3600e3) * PER_H);
  const tOf = (u) => { const a = (split - t0) / 60e3; return u <= a ? t0 + u * 60e3 : split + Math.round(((u - a) / PER_H) * 60) * 60e3; };
  const lengthen = () => { slider.max = String(Math.round(uOf(tEnd))); slider.dataset.split = split < tEnd ? String(Math.round(uOf(split))) : ""; };
  // fade: what's on the map fades into what's next, rather than cutting to it (a jump from frame to frame, or round
  // to the start again; not a drag along the timeline, which moves it on minute by minute anyway)
  const show = (t, fade = false) => {
    if (!frames.length || !Number.isFinite(t)) return;
    at = Math.min(tEnd, Math.max(t0, t));
    let k = 0;
    for (let j = 1; j < frames.length; j++) if (Math.abs(frames[j].t - at) < Math.abs(frames[k].t - at)) k = j;
    i = k;
    // (the temperature or the wind in place of the rain: its own picture, the rain's put away: setKind)
    const drew = kind !== "rain" ? (drawField(at), "field") : paintAt(at, fade || holding > 0 || layer >= 0);
    if (drew === "field") holding = 0;
    else if (drew === true) { layer = -1; holding = 0; }
    // (its tiles still coming: the last picture held in its place on the map till they're in, then faded into it, rather
    // than the nearest frame as it is in the meantime: a different picture, there and gone again; but not for more than
    // a couple of seconds (one that doesn't come, say): then the frame as it is)
    else if (drew === "wait" && mixed && (!holding || performance.now() - holding < 2500)) holding ||= performance.now();
    else if (layer !== layerAt(i)) { layer = layerAt(i); map.show(layer, SHOW, softIn); softIn = false; mixed = false; holding = 0; }
    slider.style.setProperty("--f", String(tEnd > t0 ? uOf(at) / uOf(tEnd) : 1));
    // (its words, to the minute)
    const m = Math.round((at - t0) / 60e3);
    if (m === minute) return;
    minute = m;
    // (how long ago or ahead of Now as it's marked (kept to the clock: clockOn); the latest radar's said as such; and
    // what's to come, forecast, or what's been worked out since a radar that's been away a while, estimated)
    // (as Apple's Weather map says it: what it is, over the day and the time, here with how long ago or ahead)
    const tm = Math.min(tEnd, t0 + m * 60e3), ahead = tm > (kind === "rain" ? seen : tNow) + 30e3, mins = Math.round((tm - tNow) / 60e3), had = src?.past.length > 0;
    const what = kind !== "rain" ? named() : had && Math.abs(tm - tLast) < 30e3 ? "Latest radar" : !ahead ? "Radar" : !had || tm > tNow + 30e3 ? "Forecast" : "Estimated";
    const when = `${day(tm)} ${time(tm)} · ${mins > 0 ? until(mins) : mins === 0 ? "now" : ago(-mins)}`.trim();
    slider.value = String(Math.round(uOf(tm)));
    // ("No rain nearby": of the next two hours; not of the models' hours after, if they've rain)
    dryShown = dryNow && !(tm > split && !dryLater); onMap();
    // (what it is, kept: Radar to Forecast, its word rising in as it changes, rather than snapping; when, to the minute)
    let b = label.querySelector(".rt-k"), rel = label.querySelector(".rt-rel");
    if (!b || !rel) { b = document.createElement("b"); rel = document.createElement("span"); b.className = "rt-k"; label.replaceChildren(b, " ", rel); }
    if (b.textContent !== what) { const had = b.textContent; b.textContent = what; if (had) rise(b); }
    rel.textContent = when; rel.className = ahead ? "rt-rel ahead" : "rt-rel";
    slider.setAttribute("aria-valuetext", `${what}, ${when}`);
    drawAreas(tm); sayReading();
    chipTo(ahead ? "model" : "radar");
    map.box(undefined, ahead && kind === "rain" && (src?.model || tm > split) ? 0.45 : 0);
  };
  // The temperature or the wind (kind) at a time, over a grid of its own (the models', 11 × 11 points about 750 km
  // across, so it fills the map zoomed out to the region, as it is for them: FIELD_ZOOM): the models' hours eased between (rainmap.js paintField), on a small
  // picture made large (it's smooth anyway, and quick to make each minute it plays). The wind's flowing over it (flow)
  let field = null, fieldMin = null, fieldT = 0, fg = null, air = null, fine = null;
  const FS = 120, FB = 480, fsmall = document.createElement("canvas"), fcv = document.createElement("canvas");
  fsmall.width = fsmall.height = FS; fcv.width = fcv.height = FB;
  const fsx = fsmall.getContext("2d"), fsimg = fsx.createImageData(FS, FS), fcx = fcv.getContext("2d");
  // (and the finer temperature's own: over the region's, about the place)
  const nsmall = document.createElement("canvas"), ncv = document.createElement("canvas");
  nsmall.width = nsmall.height = FS; ncv.width = ncv.height = FB;
  const nsx = nsmall.getContext("2d"), nsimg = nsx.createImageData(FS, FS), ncx = ncv.getContext("2d");
  const mercY = (la) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360));
  const fieldGrid = () => grid(here.lat, here.lon, 11, 3.5, 6), fineGrid = () => grid(here.lat, here.lon, 13, 1, 1.8);
  // what the layer's colours are of, at a time: [series, times, grid] for each that has it (the finer first)
  const sources = () => kind === "temp" ? [fine && [fine.temp, fine.times, fine.g], field && [field.temp, field.times, fg]].filter(Boolean)
    : kind === "aq" ? (air ? [[air.aq, air.times, fg]] : []) : kind === "uv" && field ? [[field.uv, field.times, fg]] : kind === "wind" && field ? [[gusts ? field.gust : field.wind, field.times, fg]] : [];
  // the layer's value at a place, at the time on show (null where none of its grids reach)
  const valueAt = (lat, lon) => { for (const [series, times, gg] of sources()) { const v = gridAt(gg, fieldAt(times, series, fieldT), lat, lon); if (v != null) return v; } return null; };
  const stopsOf = () => (kind === "temp" ? TEMP_STOPS : kind === "aq" ? AQ_STOPS : kind === "uv" ? UV_STOPS : WIND_STOPS);
  const paintInto = (img, sx, cv, cx, gg, vals) => {
    paintField(img.data, FS, FS, gg, vals, stopsOf(), kind === "wind" ? 175 : 150);
    sx.putImageData(img, 0, 0);
    cx.clearRect(0, 0, FB, FB); cx.imageSmoothingQuality = "high"; cx.drawImage(sx.canvas, 0, 0, FB, FB);
  };
  function drawField(t) {
    const src = sources();
    if (!src.length || !fg || !map?.field) return false;
    const m = `${kind}|${gusts}|${!!fine}|${Math.round(t / 60e3)}`;
    if (m === fieldMin) return true;
    // (the region's: the region's own grid, the last of them)
    const [series, times, gg] = src.at(-1), vals = fieldAt(times, series, t);
    if (!vals) return false;
    fieldMin = m; fieldT = t;
    paintInto(fsimg, fsx, fcv, fcx, gg, vals);
    map.field(fcv, [[gg.south, gg.west], [gg.north, gg.east]], 1);
    // (the finer about the place, over it, fading into it at its edges)
    const fv = kind === "temp" && fine ? fieldAt(fine.times, fine.temp, t) : null;
    if (fv) { paintInto(nsimg, nsx, ncv, ncx, fine.g, fv); map.field(ncv, [[fine.g.south, fine.g.west], [fine.g.north, fine.g.east]], 1, "fine"); }
    else map.field(null, null, 0, "fine");
    winds = null; drawPin(); sayOthers(); if (calm) arrows();
    return true;
  }
  // the wind at each of the grid's points, at the time on show, as east and north (km/h: the way it's going), eased
  // between the hours as such (so a way between two is fair, as a direction alone can't be halved)
  let winds = null;
  const windsNow = () => {
    if (winds) return winds;
    const parts = (k) => { const sp = (gusts ? field.gust : field.wind)[k], d = field.dir[k]; return [d.map((x, j) => (x == null || sp[j] == null ? 0 : -sp[j] * Math.sin((x * Math.PI) / 180))), d.map((x, j) => (x == null || sp[j] == null ? 0 : -sp[j] * Math.cos((x * Math.PI) / 180)))]; };
    const ts = field.times, t = Math.min(ts.at(-1), Math.max(ts[0], fieldT));
    let k = 1; while (k < ts.length - 1 && ts[k] < t) k++;
    const f = ts.length > 1 ? Math.min(1, Math.max(0, (t - ts[k - 1]) / (ts[k] - ts[k - 1]))) : 0, [u0, v0] = parts(k - 1), [u1, v1] = parts(Math.min(k, ts.length - 1));
    return (winds = { u: u0.map((x, j) => x + (u1[j] - x) * f), v: v0.map((x, j) => x + (v1[j] - x) * f) });
  };
  // the wind where a point on the screen is (vw: the map's bounds and size, as it is) → [east, north, how far in from the
  // grid's edges (0 to 1)], or null outside the grid
  let vw = null;
  // (and the place's bubble and name, which it keeps clear of: they're under it)
  const viewNow = () => {
    const [[s0, w0], [n0, e0]] = map.bounds(), v = { w0, e0, yN: mercY(n0), yS: mercY(s0), w: el.clientWidth, h: el.clientHeight };
    const x = ((here.lon - w0) / (e0 - w0)) * v.w, y = ((v.yN - mercY(here.lat)) / (v.yN - v.yS)) * v.h, nw = (pin.querySelector(".mp-name")?.offsetWidth || 60) / 2 + 4;
    v.clear = (px, py) => (px > x - 31 && px < x + 31 && py > y - 72 && py < y + 6) || (px > x - nw && px < x + nw && py >= y + 6 && py < y + 26);
    return v;
  };
  function windAt(x, y) {
    const n = fg.n, my = vw.yN + ((vw.yS - vw.yN) * y) / vw.h, la = (360 / Math.PI) * Math.atan(Math.exp(my)) - 90;
    const fy = ((fg.north - la) / (fg.north - fg.south)) * (n - 1), lo = vw.w0 + ((vw.e0 - vw.w0) * x) / vw.w, fx = ((lo - fg.west) / (fg.east - fg.west)) * (n - 1);
    if (!(fx >= 0 && fy >= 0 && fx <= n - 1 && fy <= n - 1)) return null;
    const r0 = Math.min(n - 2, Math.floor(fy)), c0 = Math.min(n - 2, Math.floor(fx)), ty = fy - r0, tx = fx - c0, W = windsNow();
    const at = (a) => (a[r0 * n + c0] * (1 - tx) + a[r0 * n + c0 + 1] * tx) * (1 - ty) + (a[(r0 + 1) * n + c0] * (1 - tx) + a[(r0 + 1) * n + c0 + 1] * tx) * ty;
    return [at(W.u), at(W.v), Math.min(1, Math.min(fx, fy, n - 1 - fx, n - 1 - fy) / ((n - 1) * 0.1))];
  }
  // The wind as it flows, as Apple's Weather map has it (and earth.nullschool before it): specks carried along by the wind
  // where they are on the screen, each leaving a trail that fades, quicker and brighter where it's stronger, started
  // again somewhere else as it ages or leaves the map; the same pace on the screen however close in it is, and carried
  // on over the map as it moves. Only while it's the layer and in sight, and held under a sheet. With Reduce Motion,
  // still arrows instead (arrows)
  const flowCv = document.createElement("canvas"); flowCv.className = "wind-flow"; flowCv.setAttribute("aria-hidden", "true"); flowCv.hidden = true;
  const fx2 = flowCv.getContext("2d");
  let specks = [], flowRaf = 0, flowPrev = 0, flowDue = 0, inSight = true;
  const sizeFlow = () => {
    // (drawn into the vector map, at one pixel to the screen's point: it's sent to the graphics chip every picture, and
    // its specks are soft anyway)
    const dpr = map?.flow ? 1 : Math.min(2, devicePixelRatio || 1), w = el.clientWidth, h = el.clientHeight;
    if (flowCv.width !== Math.round(w * dpr) || flowCv.height !== Math.round(h * dpr)) { flowCv.width = Math.round(w * dpr); flowCv.height = Math.round(h * dpr); }
    fx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  };
  // (each speck: where it is, and where it's been, the last TRAIL pictures, newest first: its trail; dying: it's stopped,
  // and its trail drawn in after it)
  const TRAIL = 18;
  // (started anywhere a little beyond the edges too, so the side the wind comes from isn't left bare)
  const EDGE = 40;
  const speck = (w, h, s = { hx: new Float32Array(TRAIL), hy: new Float32Array(TRAIL) }) =>
    Object.assign(s, { x: Math.random() * (w + 2 * EDGE) - EDGE, y: Math.random() * (h + 2 * EDGE) - EDGE, n: 0, age: 0, life: 35 + Math.random() * 55, dying: false });
  const flowing = () => kind === "wind" && !!field && !!fg && !!map;
  function flowRestart() {
    if (!flowing()) { flowCv.hidden = true; map?.flow?.(null); return; }
    flowCv.hidden = false;
    if (calm) return arrows();
    const [w, h] = sizeFlow();
    vw = viewNow();
    fx2.clearRect(0, 0, w, h);
    // (half as many on a phone: the flow's the costliest thing on the screen, and a phone's is small)
    const many = Math.min(1000, Math.round(((w + 2 * EDGE) * (h + 2 * EDGE)) / (touch ? 900 : 450)));
    while (specks.length < many) specks.push(speck(w, h));
    specks.length = many;
    for (const p of specks) { speck(w, h, p); p.age = Math.random() * p.life; }
    if (!flowRaf) { flowPrev = flowDue = 0; flowRaf = requestAnimationFrame(flowStep); }
  }
  // (as the map moves under them: the trails cleared, the specks carried on where they are)
  function flowMoved() {
    if (!flowing()) return;
    if (calm) return arrows();
    const [w, h] = sizeFlow();
    if (!vw || vw.w !== w || vw.h !== h) return flowRestart();
    vw = viewNow(); fx2.clearRect(0, 0, w, h); intoMap();
    for (const p of specks) p.n = 0;
    if (!flowRaf) { flowPrev = flowDue = 0; flowRaf = requestAnimationFrame(flowStep); }
  }
  function flowStep(ts) {
    flowRaf = 0;
    if (!flowing() || calm || !inSight) return;
    flowRaf = requestAnimationFrame(flowStep);
    // (held under a sheet, as the radar is: unseen, and each picture would have the sheet's glass blurred afresh)
    if (document.body.classList.contains("sheet-up")) { flowPrev = flowDue = 0; return; }
    // (about 24 pictures a second, however fast the screen: each once its time's come, the next a 24th of a second after
    // that one was due, so they keep to it on average)
    if (flowDue && ts < flowDue - 6) return;
    flowDue = flowDue && ts - flowDue < 100 ? flowDue + 1000 / 24 : ts + 1000 / 24;
    const dt = flowPrev ? Math.min(0.1, (ts - flowPrev) / 1000) : 1 / 24; flowPrev = ts;
    const w = vw.w, h = vw.h;
    // (each speck on along the wind, its trail with it; one that's aged, or gone off the map or under the bubble, stops,
    // its trail drawn in after it, and then it starts again somewhere else)
    const head = (p, x, y) => { p.hx.copyWithin(1, 0, TRAIL - 1); p.hy.copyWithin(1, 0, TRAIL - 1); p.hx[0] = x; p.hy[0] = y; p.n = Math.min(TRAIL, p.n + 1); };
    for (const p of specks) {
      if (p.dying) { if (--p.n < 2) speck(w, h, p); continue; }
      const a = windAt(p.x, p.y);
      if (!a) { p.dying = true; continue; }
      const speed = Math.min(90, Math.hypot(a[0], a[1])), k = (2.2 * dt * speed) / Math.max(0.5, Math.hypot(a[0], a[1]));       // (at 20 km/h, 44 pixels a second)
      const nx = p.x + a[0] * k, ny = p.y - a[1] * k;
      if (!p.n) head(p, p.x, p.y);
      if (++p.age > p.life || nx < -EDGE || ny < -EDGE || nx > w + EDGE || ny > h + EDGE || speed < 0.5 || vw.clear(nx, ny)) { p.dying = true; continue; }
      p.x = nx; p.y = ny; p.s = speed; p.e = a[2]; head(p, nx, ny);
    }
    // (drawn afresh each picture, in a few strokes: the stronger, the brighter; each trail fading along its length, and
    // faded in at the grid's edges)
    fx2.clearRect(0, 0, w, h);
    const BANDS = 4, AGES = 4, paths = Array.from({ length: BANDS * AGES }, () => new Path2D());
    for (const p of specks) {
      if (p.n < 2) continue;
      const band = Math.max(0, Math.min(BANDS - 1, Math.floor((0.7 + (p.s || 0) / 25) * (p.e ?? 1) * 1.3)));
      for (let j = 0; j < p.n - 1; j++) { const path = paths[band * AGES + Math.floor((j * AGES) / (TRAIL - 1))]; path.moveTo(p.hx[j], p.hy[j]); path.lineTo(p.hx[j + 1], p.hy[j + 1]); }
    }
    fx2.lineCap = "round";
    paths.forEach((path, q) => {
      const b = Math.floor(q / AGES), g = q % AGES;
      fx2.lineWidth = 1.5 - g * 0.18; fx2.strokeStyle = `rgba(240, 248, 255, ${(([0.42, 0.62, 0.82, 0.97][b]) * (1 - g / AGES)).toFixed(3)})`; fx2.stroke(path);
    });
    intoMap();
  }
  // (the vector map takes it as a picture of its own, under its names: the canvas itself then isn't shown over it)
  const intoMap = () => { if (map?.flow) { flowCv.classList.add("in-map"); map.flow(flowCv, map.bounds()); } };
  // (still, for Reduce Motion: an arrow every so often, pointing the way it blows, longer the stronger)
  function arrows() {
    if (!(kind === "wind" && field && fg && map && calm)) return;
    flowCv.hidden = false;
    const [w, h] = sizeFlow(); vw = viewNow();
    fx2.clearRect(0, 0, w, h); fx2.lineCap = "round"; fx2.lineJoin = "round";
    for (let y = 29; y < h; y += 58) for (let x = 29; x < w; x += 58) {
      const a = vw.clear(x, y) ? null : windAt(x, y); if (!a) continue;
      const speed = Math.hypot(a[0], a[1]); if (speed < 1) continue;
      const dx = a[0] / speed, dy = -a[1] / speed, L = 12 + Math.min(16, speed / 4), x2 = x + (dx * L) / 2, y2 = y + (dy * L) / 2, hx = -dy * 4, hy = dx * 4;
      fx2.globalAlpha = a[2]; fx2.beginPath(); fx2.moveTo(x - (dx * L) / 2, y - (dy * L) / 2); fx2.lineTo(x2, y2);
      fx2.moveTo(x2 - dx * 5.5 + hx, y2 - dy * 5.5 + hy); fx2.lineTo(x2, y2); fx2.lineTo(x2 - dx * 5.5 - hx, y2 - dy * 5.5 - hy);
      fx2.strokeStyle = "rgba(255, 255, 255, 0.92)"; fx2.lineWidth = 1.8; fx2.stroke();
    }
    fx2.globalAlpha = 1;
    intoMap();
  }
  // The place's bubble, as the layer has it: the forecast's temperature and sky (mark, from the page) on the rain; on the
  // temperature, the temperature there at the time on show, in its colour; on the wind, which way it's from and how
  // strong, as Apple's has it ("WSW 14 MPH")
  const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  let marked = null;
  function drawPin() {
    const m = marked; if (!m) return;
    const c = fg ? (fg.n * fg.n - 1) / 2 : 0, tEl = pin.querySelector(".mp-t");
    const v = kind === "temp" || kind === "aq" || kind === "uv" ? valueAt(here.lat, here.lon) : null;
    pin.dataset.kind = kind === "wind" && field ? "wind" : v != null ? "temp" : "";
    if (pin.dataset.kind !== "wind") pin.querySelector(".mp-dir").textContent = pin.querySelector(".mp-u").textContent = "";
    if (pin.dataset.kind === "temp") { tEl.textContent = kind === "aq" || kind === "uv" ? String(Math.round(v)) : temp(v); pin.style.setProperty("--pin", `rgb(${tint(v, stopsOf()).join(",")})`); return; }
    if (pin.dataset.kind === "wind") {
      const W = windsNow(), speed = Math.hypot(W.u[c], W.v[c]), from = ((Math.atan2(-W.u[c], -W.v[c]) * 180) / Math.PI + 360) % 360;
      pin.querySelector(".mp-dir").textContent = speed < 1 ? "Calm" : POINTS[Math.round(from / 22.5) % 16];
      tEl.textContent = String(windNum(speed)); pin.querySelector(".mp-u").textContent = windUnit().toUpperCase();
      return;
    }
    tEl.textContent = m.temp || "";
    pin.style.setProperty("--pin", m.colour || "#3f72c6");
  }
  // The other saved places (others(), from the page), as Apple's map has them: a small bubble each, with the layer's say
  // there (on the rain, its temperature now, as the page has it; on the temperature or the wind, the models' at the time
  // on show, where it's on their grid), its name under it; a tap on one goes to it (on a phone, in the card, a tap opens
  // the map full screen first, as anywhere on it does)
  let others = [], otherMarks = [], othersKey = "";
  function drawOthers() {
    const key = others.map((o) => `${o.name}|${o.lat}|${o.lon}`).join(";");
    if (!map || (key === othersKey && otherMarks.length === others.length)) { sayOthers(); return; }
    othersKey = key;
    for (const x of otherMarks) x.mark.remove();
    otherMarks = others.map((o) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "map-other";
      b.innerHTML = '<span class="mo-b"><span class="mo-d"></span><b class="mo-v"></b></span><span class="mo-dot"></span><span class="mo-n"></span>';
      b.querySelector(".mo-n").textContent = o.name;
      b.addEventListener("click", (e) => { e.stopPropagation(); if (touch && !card.classList.contains("radar-big")) grow(true); else o.go(); });
      return { o, b, mark: map.marker(b, o.lat, o.lon) };
    });
    sayOthers();
    // (and room kept about each, its bubble above and its name below, that the map's own names step aside from)
    requestAnimationFrame(() => { for (const { b, mark } of otherMarks) { const n = b.querySelector(".mo-n"); if (n?.offsetWidth) mark.room?.(Math.max(44, n.offsetWidth + 8), 72, -12); } });
  }
  function sayOthers() {
    for (const { o, b } of otherMarks) {
      let v = o.temp || "", colour = o.colour || "#3f72c6", dir = "", k = "";
      if (kind === "temp" || kind === "aq" || kind === "uv") {
        const c = valueAt(o.lat, o.lon);
        if (c != null) { v = kind === "temp" ? temp(c) : String(Math.round(c)); colour = `rgb(${tint(c, stopsOf()).join(",")})`; }
        else if (kind !== "temp") v = "";
      } else if (kind === "wind" && field) {
        const W = windsNow(), u = gridAt(fg, W.u, o.lat, o.lon), w = gridAt(fg, W.v, o.lat, o.lon);
        k = "wind";
        if (u == null || w == null) v = "";
        else { const sp = Math.hypot(u, w); v = String(windNum(sp)); dir = sp < 1 ? "" : POINTS[Math.round((((Math.atan2(-u, -w) * 180) / Math.PI + 360) % 360) / 22.5) % 16]; }
      }
      b.dataset.kind = k; b.dataset.empty = v ? "" : "1";
      b.querySelector(".mo-v").textContent = v; b.querySelector(".mo-d").textContent = dir;
      b.style.setProperty("--pin", colour);
      b.setAttribute("aria-label", `${o.name}${v ? `: ${dir ? `${dir} ` : ""}${v}${k === "wind" ? ` ${windUnit()}` : ""}` : ""}. Show it`);
    }
  }
  // Official warnings' areas (warnings(), from the page): each in its colour, while it's in force at the time on show
  const WARN_HUE = { yellow: "#ffd60a", amber: "#ff9f0a", orange: "#ff9f0a", red: "#ff453a" };
  let warns = [], areasKey = null, warnsKey = "";
  const inForceAt = (w, t) => !(Date.parse(w.onset) > t) && (w.open || !(Date.parse(w.expires) <= t));
  // (one starting within a day and a half of the time on show: drawn dashed till then)
  const soonAt = (w, t) => Date.parse(w.onset) > t && Date.parse(w.onset) - t < 36 * 3600e3;
  function drawAreas(t = at, force = false) {
    if (!map?.areas) return;
    const on = warns.filter((w) => w.rings?.length && (inForceAt(w, t) || soonAt(w, t))), key = on.map((w) => `${w.id}${inForceAt(w, t) ? "" : "~"}`).join("|");
    if (key === areasKey && !force) return;
    areasKey = key;
    map.areas(on.map((w) => ({ rings: w.rings, colour: WARN_HUE[w.colour] || WARN_HUE.yellow, soon: !inForceAt(w, t) })));
  }
  const insideRing = (lat, lon, r) => {
    let inside = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const yi = r[i], xi = r[i + 1], yj = r[j], xj = r[j + 1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // A reading where the map's tapped (full screen, or with a mouse): the layer's say there at the time on show, and any
  // warning it's in, in a label at the spot, said again as the time moves on; a tap on it puts it away
  // (another tap somewhere else: the one there fades away where it was as a new one comes in at the new spot; put away,
  // it goes as it came, a little quicker, styles.css read-in)
  let reading = null, readMark = null, readEl = null;
  const newRead = () => {
    const b = document.createElement("button"); b.type = "button"; b.className = "map-read";
    b.innerHTML = '<span class="mr-b"><span class="mr-v"></span><span class="mr-w"></span></span><span class="mr-dot"></span>';
    b.addEventListener("click", (e) => { e.stopPropagation(); unread(); });
    return b;
  };
  function readAt(pt) {
    unread();
    reading = pt; readEl = newRead(); readMark = map.marker(readEl, pt.lat, pt.lon);
    sayReading();
  }
  function unread() {
    reading = null;
    const mk = readMark, b = readEl?.querySelector(".mr-b");
    readMark = readEl = null;
    if (!mk) return;
    if (!b) { mk.remove(); return; }
    b.closest(".map-read").inert = true;
    b.getAnimations().forEach((a) => a.cancel());
    b.animate(calm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, translate: "0 0", scale: 1 }, { opacity: 0, translate: "0 4px", scale: 0.94 }], { duration: 150, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" })
      .finished.then(() => mk.remove(), () => mk.remove());
  }
  // (the rain there: the radar's frames as they're drawn, read back to how hard it's falling, or the models' rates; how
  // hard and whether it's snow, in words, as the legend has them)
  function rainHere(lat, lon) {
    if (!src) return null;
    const v = view(), parts = partsAt(src, at).filter((p) => p.alpha > 0.002);
    let sum = 0, wsum = 0, snow = 0;
    for (const p of parts) {
      let mmh = 0, sn = 0;
      if (p.rates) {
        mmh = gridAt(g, p.rates, lat, lon) ?? 0; sn = (gridAt(g, p.snow, lat, lon) ?? 0) > 0.5 ? 1 : 0;
      } else {
        if (!v) return null;
        const scale = 2 ** (v.Z - 7), [tx, ty] = tileOf(lat, lon, v.Z), gx = tx * 256 - p.dx * scale, gy = ty * 256 - p.dy * scale;
        const X = Math.floor(gx / 256), Y = Math.floor(gy / 256), e = keptNow(`${src.host}${src.past[p.k].path}/${SRC}`, v.Z, wrapX(X, v.n), Y);
        if (!e?.done) return null;
        if (e.vals) {
          const o = ((Math.floor(gy) - Y * 256) * 256 + (Math.floor(gx) - X * 256)) * 4, c = e.vals[o + 1];
          if (c > 60) { mmh = mmhOf((e.vals[o] / c) * 75 - 10); sn = e.vals[o + 2] * 2 > c ? 1 : 0; }
        }
      }
      sum += p.alpha * mmh; snow += p.alpha * sn; wsum += p.alpha;
    }
    if (!wsum) return { mmh: 0, snow: false };
    return { mmh: sum / wsum, snow: snow / wsum > 0.5 };
  }
  const rainWords = ({ mmh, snow }) => {
    if (mmh < MIN_RATE) return snow ? "No snow" : "No rain";
    const band = [...LEGEND].reverse().find((l) => mmh >= l.mmh * 0.999) || LEGEND[0];
    return band.label === "Drizzle" ? (snow ? "Light snow" : "Drizzle") : `${band.label} ${snow ? "snow" : "rain"}`;
  };
  // (over its spot, unless it would cover a bubble or a name there (the place's own, or another saved place's): then
  // beside it, on whichever side's clear, or under it; the first of those that covers none, and stays on the map)
  function placeReading() {
    if (!reading || !map || !readEl) return;
    const v = viewNow(), at0 = (la, lo) => [((lo - v.w0) / (v.e0 - v.w0)) * v.w, ((v.yN - mercY(la)) / (v.yN - v.yS)) * v.h];
    const box = readEl.querySelector(".mr-b"), lw = box.offsetWidth || 150, lh = box.offsetHeight || 40, [rx, ry] = at0(reading.lat, reading.lon);
    // (what it mustn't cover: each bubble, and each name under its dot; [left, top, right, bottom])
    const taken = [], mark = (la, lo, bw, bh, nameEl) => {
      const [x, y] = at0(la, lo), half = (nameEl?.offsetWidth || 60) / 2;
      taken.push([x - bw / 2, y - bh - 11, x + bw / 2, y - 6], [x - half, y + 6, x + half, y + 24]);
    };
    mark(here.lat, here.lon, 58, 58, pin.querySelector(".mp-name"));
    for (const { o, b } of otherMarks) if (b.dataset.empty !== "1") mark(o.lat, o.lon, 40, 38, b.querySelector(".mo-n"));
    // (where it could go, in order: over the spot, beside it either side, over it moved along, then under it; each
    // scored by how much of a bubble or name it covers, and of itself off the map: the first that scores nothing, else
    // the least)
    const along = Math.max(0, lw / 2 - 26), spots = [["", 0], ["side", 0], ["side-l", 0], ["", along], ["", -along], ["below", 0], ["below", along], ["below", -along]].map(([cls, dx]) => {
      const t = cls === "below" ? ry + 30 : cls === "" ? ry - 12 - lh : ry - lh / 2;
      // (beside the spot, and the place's name there too: out past the name)
      const [nl, nt, nr, nb] = taken[1], byName = t < nb + 3 && nt - 3 < t + lh;
      const l = cls === "side" ? Math.max(rx + 14, byName && nl < rx + 14 + lw ? nr + 6 : 0) : cls === "side-l" ? Math.min(rx - 14, byName && nr > rx - 14 - lw ? nl - 6 : Infinity) - lw : rx - lw / 2 + dx;
      return { cls, dx: cls === "side" ? l - (rx + 14) : cls === "side-l" ? l + lw - (rx - 14) : dx, r: [l, t, l + lw, t + lh] };
    });
    const cut = (a, b2) => Math.max(0, Math.min(a[2], b2[2] + 3) - Math.max(a[0], b2[0] - 3)) * Math.max(0, Math.min(a[3], b2[3] + 3) - Math.max(a[1], b2[1] - 3));
    const score = ({ r }) => taken.reduce((n, x) => n + cut(r, x), 0) + 2 * (lw * lh - cut(r, [6, 4, v.w - 6, v.h - 4]));
    let best = spots[0], least = Infinity;
    for (const sp of spots) { const n = score(sp); if (n < least) { least = n; best = sp; } if (!n) break; }
    for (const k of ["side", "side-l", "below"]) readEl.classList.toggle(k, best.cls === k);
    readEl.style.setProperty("--dx", `${Math.round(best.dx)}px`);
  }
  function sayReading() {
    if (!reading || !readEl) return;
    const { lat, lon } = reading;
    let v = "";
    if (kind === "temp" || kind === "aq" || kind === "uv") {
      const c = valueAt(lat, lon);
      v = c == null ? "No forecast here" : kind === "aq" ? `${AQ_WORDS[Math.min(5, Math.floor(c / 20))]} air (${Math.round(c)})` : kind === "uv" ? `UV ${Math.round(c)}, ${uvWord(Math.round(c)).toLowerCase()}` : temp(c);
    }
    else if (kind === "wind" && field) {
      const W = windsNow(), u = gridAt(fg, W.u, lat, lon), w = gridAt(fg, W.v, lat, lon);
      if (u == null || w == null) v = "No forecast here";
      else { const sp = Math.hypot(u, w), d = POINTS[Math.round((((Math.atan2(-u, -w) * 180) / Math.PI + 360) % 360) / 22.5) % 16]; v = `${gusts ? "Gusts " : ""}${sp < 1 ? "Calm" : `${d} ${windNum(sp)} ${windUnit()}`}`; }
    } else { const r = rainHere(lat, lon); v = r ? rainWords(r) : "…"; }
    const inIt = (x) => x.rings?.some((r) => insideRing(lat, lon, r));
    const w = warns.find((x) => inForceAt(x, at) && inIt(x)) || warns.find((x) => soonAt(x, at) && inIt(x));
    const said = !w ? "" : inForceAt(w, at) ? w.title : `${w.title} from ${day(Date.parse(w.onset))} ${time(Date.parse(w.onset))}`.replace(/\s+/g, " ");
    readEl.querySelector(".mr-v").textContent = v;
    readEl.querySelector(".mr-w").textContent = said;
    readEl.dataset.warn = w ? w.colour : "";
    readEl.setAttribute("aria-label", `${v}${w ? `. ${said}` : ""}. Put away`);
    placeReading();
  }
  // Each layer its own span of time: the rain's, the radar's last two hours and the next two (load); the temperature's
  // and the wind's, by the hour, from two hours ago to twelve on, as Apple's has them
  let rainSpan = null, dryNow = false, dryLater = true;
  const hourly = () => { const hr = Math.floor(Date.now() / 3600e3) * 3600e3; return [hr - 2 * 3600e3, hr + 12 * 3600e3, Infinity]; };
  function span() {
    [t0, tEnd, split] = kind === "rain" ? rainSpan || [t0, tEnd, split] : hourly();
    lengthen();
    minute = null; clockOn(); drawScale();
  }
  // The layer shown, chosen (and kept): the rain's put away for the temperature's or the wind's, once they're to hand
  // (asked for once a half hour; meanwhile the rain stays, and it's said they're coming), or back again; where they
  // can't be had, it stays on the rain, and says so. (want: the one last chosen; kind: the one on show)
  async function setKind(k) {
    if (!KINDS[k]) return;
    want = k; menuSync?.();
    try { localStorage.setItem("wx:maplayer", k); } catch (_) {}
    if (!map || !g) return;
    // (the temperature and the wind over the region's grid; the air quality over the same, from its own service; and
    // the finer temperature about the place, once it's in, without waiting for it)
    const fresh = fieldGrid(), stale = (x) => !x || x.id !== fresh.id || Date.now() - x.at > 2 * MODEL_TTL;
    const needs = k === "aq" ? stale(air) : k !== "rain" && (stale(field) || (k === "uv" && !field.uv));
    if (needs) {
      // (said on the map meanwhile, in its pill, rather than in a line under it that would come and go, the card's foot
      // moving with it; what can't be had, said under it)
      getting = `Getting the ${{ temp: "temperatures", wind: "wind", aq: "air quality", uv: "UV index" }[k]}…`; onMap();
      try {
        if (k === "aq") air = { ...(await modelAir(fresh)), id: fresh.id };
        else field = { ...(await modelField(fresh)), id: fresh.id };
        fg = fresh;
      } catch (_) {
        if (want === k) { getting = ""; onMap(); line(status, `${k === "aq" ? "Air quality" : "Temperature and wind"} ${k === "aq" ? "isn't" : "aren't"} available right now: showing the rain.`); want = "rain"; menuSync?.(); }
        return;
      }
      if (want !== k) return;
      getting = ""; onMap(); line(status, "");
    }
    if (k === "temp") {
      const fgr = fineGrid();
      if (!fine || fine.id !== fgr.id || Date.now() - fine.at > 2 * MODEL_TTL) modelFine(fgr).then((f) => { fine = { ...f, id: fgr.id, g: fgr }; if (kind === "temp") { fieldMin = null; show(at); sayOthers(); sayReading(); } }, () => {});
    }
    const was = kind, again = playing, z = map.state().zoom;
    if (again) stop();
    kind = k; card.dataset.layer = k; drawLegend(); retitle(was !== k);
    // (its colours and words coming in where the last layer's were, rather than snapping)
    if (was !== k) for (const x of legend.children) rise(x, 0);
    minute = null; fieldMin = null; winds = null;
    // (the one going fading away as the one coming fades in: the field put away, the rain eased back in, softIn; or the
    // rain eased away under the field)
    if (k === "rain") { map.field?.(null); map.field?.(null, null, 0, "fine"); flowCv.hidden = true; layer = -1; mixed = false; softIn = true; }
    else { map.show(-1, 0, true); map.box(undefined, 0); layer = -1; mixed = false; holding = 0; }
    // (a span of its own: from Now, as it opens, the timeline easing there and its marks fading in anew; and the map out
    // to the region for them, as Apple's has it, then back in again for the rain, unless it's been moved in or out
    // meanwhile)
    if ((was === "rain") !== (k === "rain")) {
      jump(); span(); at = tNow;
      if (!calm) scale.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: EASE_OUT });
      if (k !== "rain" && z > FIELD_ZOOM + 0.5) { zoomWas = z; map.zoomTo?.(FIELD_ZOOM); }
      else if (k === "rain" && zoomWas != null) { if (Math.abs(z - FIELD_ZOOM) < 0.3) map.zoomTo?.(zoomWas); zoomWas = null; }
    }
    show(at); drawPin(); sayOthers(); sayReading(); flowRestart();
    if (again) run();
  }
  let menuSync = null, zoomWas = null, softIn = false, getting = "", dryShown = false, jumpT = 0;
  // What's said on the map, in its pill (styles.css .radar-dry): the layer chosen still being fetched, or, on the rain,
  // that there's none about; faded in and out (.off), its words kept as it goes
  function onMap() {
    if (!dry) return;
    const text = getting || (kind === "rain" && dryShown ? "No rain nearby" : "");
    if (text) dry.textContent = text;
    dry.classList.toggle("off", !text);
  }
  // (the timeline moved on all at once, not by a finger nor as it plays: its fill and Now eased there, styles.css .jump)
  function jump() { if (calm) return; slider.classList.add("jump"); clearTimeout(jumpT); jumpT = setTimeout(() => slider.classList.remove("jump"), 420); }

  // The minutes between the frames (rainmap.js partsAt), on one picture over the tiles in sight: the radar's tiles,
  // each drawn once and kept (keptTile), moved and faded into each other; the models' rain painted blended. So a
  // minute on is a picture moved and faded, not the radar drawn again. (Added together, "lighter": two faded frames
  // make one whole, where they overlap as where they don't.)
  const mix = document.createElement("canvas"), mx = mix.getContext("2d");
  const fc = document.createElement("canvas"); fc.width = fc.height = PX;
  const fx = fc.getContext("2d"), fimg = fx.createImageData(PX, PX);
  let src = null, mixed = false, sight = "", wanted = { aborted: false }, lostAt = new Map(), joined = new Set(), watched = new Set();
  // the tiles in sight: zoom Z's (as the map's own layers have them), no more than 10 across
  const view = () => {
    const st = map.state(), b = map.bounds?.();
    if (!b) return null;
    const Z = Math.max(st.min, Math.min(st.max, Math.round(st.zoom))), n = 2 ** Z;
    const [[s, w], [no, e]] = b, [x0, y0] = tileOf(no, w, Z), [x1, y1] = tileOf(s, e, Z);
    const v = { Z, n, x0: Math.floor(x0), y0: Math.max(0, Math.floor(y0)), x1: Math.floor(x1), y1: Math.min(n - 1, Math.floor(y1)) };
    if (v.x1 < v.x0 || v.y1 < v.y0 || v.x1 - v.x0 > 9 || v.y1 - v.y0 > 9) return null;
    v.key = `${Z}/${v.x0}/${v.y0}/${v.x1}/${v.y1}`;
    return v;
  };
  // between two of the radar's frames: the rain's own way between those two (rainmap.js driftOf, over the same square
  // about the place as the latest's), steadied with the pairs either side (half its own, a quarter each of theirs), so
  // the rain doesn't change pace at every frame; worked out as each is first wanted (until then, the latest's way)
  const raw = new Map();
  const pairOwn = (k) => {
    if (raw.has(k) || k < 0 || k >= src.past.length - 1) return raw.get(k) ?? null;
    raw.set(k, null);
    const mine = src, { host, past } = src, tile = (fr) => (x, y) => tileCodes(`${host}${fr.path}/${SRC}/${NATIVE - 1}/${x}/${y}/2/1_1.png`);
    Promise.all([squareAt(here.lat, here.lon, tile(past[k])), squareAt(here.lat, here.lon, tile(past[k + 1]))])
      .then(([A, B]) => driftOf(A, B, (past[k + 1].time - past[k].time) / 60), () => null)
      .then((d) => { if (d && src === mine) { raw.set(k, d); if (!playing) show(at); } });
    return null;
  };
  const pairDrift = (k) => {
    let vx = 0, vy = 0, w = 0;
    for (const [j, wj] of [[k - 1, 1], [k, 2], [k + 1, 1]]) { const d = pairOwn(j); if (d) { vx += d.vx * wj; vy += d.vy * wj; w += wj; } }
    return w ? { vx: vx / w, vy: vy / w } : null;
  };
  const wrapX = (x, n) => ((x % n) + n) % n;       // (a tile's x round the world)
  let gl;       // (the graphics chip's blender, radarmix.js: made when first wanted; null where there's none)
  // → true (drawn), "wait" (its tiles still coming) or false (it can't be drawn so: zoomed far out, say)
  let warmed = "";
  function paintAt(t, fade = false) {
    if (!src || !map.blend) return false;
    const v = view();
    if (!v) return false;
    if (v.key !== sight) { sight = v.key; wanted.aborted = true; wanted = { aborted: false }; lostAt = new Map(); joined = new Set(); watched = new Set(); }
    const scale = 2 ** (v.Z - 7), W = (v.x1 - v.x0 + 1) * 256, H = (v.y1 - v.y0 + 1) * 256, base = (k) => `${src.host}${src.past[k].path}/${SRC}`;
    const parts = partsAt(src, t).filter((p) => p.alpha > 0.002).map((p) => {
      if (p.rates) return p;
      // (the tiles it's drawn from: those that, moved, cover the ones in sight)
      const sx = p.dx * scale, sy = p.dy * scale, tiles = [];
      for (let y = Math.max(0, Math.floor((v.y0 * 256 - sy) / 256)); y <= Math.min(v.n - 1, Math.floor(((v.y1 + 1) * 256 - sy - 1) / 256)); y++) {
        for (let x = Math.floor((v.x0 * 256 - sx) / 256); x <= Math.floor(((v.x1 + 1) * 256 - sx - 1) / 256); x++) tiles.push([x, y]);
      }
      return { ...p, base: base(p.k), sx, sy, tiles };
    });
    if (gl === undefined) gl = glMix(LOOK.soft);
    // (the graphics chip's blend for the radar's frames; the models' rain, or no chip, drawn here)
    const onChip = !!gl?.ok() && parts.every((p) => p.base);
    // all in hand? if not, asked for, and the nearest frame shown as it is until they are; and those it'll want next asked
    // for too (a tile further round each, and the frames either side), so the next minutes are ready. A tile is asked
    // for whenever it isn't kept or coming (let go to make room, say), but one whose radar didn't come only a few
    // seconds on, not every frame; those it's drawing now are kept while it's this view
    // (one already coming, asked for by the view before this one or ahead, is wanted by this view too, once: so it
    // isn't given up as no longer wanted; and once it's wanted now, waited for, once)
    const want = wanted, entry = (b, x, y) => keptNow(b, v.Z, wrapX(x, v.n), y);
    const ask = (list, now, later = false) => {
      const fresh = [], waits = [];
      for (const [b, x, y] of list) {
        const k = `${b}|${x}|${y}`, e = entry(b, x, y);
        if (!e) { if (!(Date.now() - (lostAt.get(k) ?? -1e9) < 3000)) fresh.push([b, x, y]); }
        else if (!e.done && !joined.has(k)) fresh.push([b, x, y]);
        else if (!e.done && now && !watched.has(k)) { watched.add(k); e.pin = want; waits.push(e.p); }
      }
      if (!fresh.length && !waits.length) return;
      const got = fresh.map(([b, x, y]) => {
        const k = `${b}|${x}|${y}`, p = keptTile(b, { z: v.Z, x: wrapX(x, v.n), y }, later ? () => false : () => !want.aborted, want);
        joined.add(k);
        if (now) { watched.add(k); entry(b, x, y).pin = want; }
        return p;
      });
      Promise.all([...got, ...waits]).then(() => {
        const lost = fresh.filter(([b, x, y]) => !entry(b, x, y)?.done);
        lost.forEach(([b, x, y]) => lostAt.set(`${b}|${x}|${y}`, Date.now()));
        if (lost.length && now) setTimeout(() => { if (!want.aborted && !playing) show(at); }, 3100);
        if (now && !want.aborted && !playing) show(at);
      });
    };
    const missing = [], soon = [], ks = new Set();
    for (const p of parts) {
      if (!p.base) continue;
      ks.add(p.k - 1).add(p.k).add(p.k + 1);
      for (const [x, y] of p.tiles) {
        const e = entry(p.base, x, y);
        if (e) e.pin = want;
        if (!e?.done) missing.push([p.base, x, y]);
        // (drawn here, each as a picture: those made as they're wanted)
        else if (!onChip && e.vals && !e.bmp) { missing.push([p.base, x, y]); bitmapOf(e).then(() => { if (!want.aborted && !playing) show(at); }); }
      }
    }
    for (const k of ks) if (k >= 0 && k < src.past.length) for (let y = Math.max(0, v.y0 - 1); y <= Math.min(v.n - 1, v.y1 + 1); y++) for (let x = v.x0 - 1; x <= v.x1 + 1; x++) soon.push([base(k), x, y]);
    ask(missing, true); ask(soon, false);
    if (missing.length) return "wait";
    let canvas = mix;
    if (onChip) {
      // each frame's tiles side by side, a tile further round than it needs (put in as they're in), then blended
      const drawn = parts.map((p) => {
        const xs = p.tiles.map(([x]) => x), ys = p.tiles.map(([, y]) => y);
        const x0 = Math.min(...xs) - 1, y0 = Math.max(0, Math.min(...ys) - 1), x1 = Math.max(...xs) + 1, y1 = Math.min(v.n - 1, Math.max(...ys) + 1);
        const atlas = gl.atlas(`${p.base}|${v.Z}|${x0},${y0},${x1},${y1}`, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        if (!atlas) return null;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const e = entry(p.base, x, y); if (e?.done && e.vals && !atlas.has(x, y)) atlas.put(x, y, e.vals); }
        return { atlas, ox: (x0 - v.x0) * 256, oy: (y0 - v.y0) * 256, sx: p.sx, sy: p.sy, w: Math.min(1, p.alpha) };
      });
      if (drawn.some((d) => !d)) return false;
      if (fade && mixed) map.fadeOut?.();
      gl.draw(W, H, drawn);
      canvas = gl.canvas;
    } else {
      if (fade && mixed) map.fadeOut?.();
      if (mix.width !== W || mix.height !== H) { mix.width = W; mix.height = H; } else mx.clearRect(0, 0, W, H);
      mx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        mx.globalAlpha = Math.min(1, p.alpha);
        if (p.base) {
          for (const [x, y] of p.tiles) { const b = entry(p.base, x, y).bmp; if (b) mx.drawImage(b, (x - v.x0) * 256 + p.sx, (y - v.y0) * 256 + p.sy); }
        } else {
          // the models' rain, painted over the grid's box
          paint(fimg.data, PX, PX, g, p.rates, p.snow); fx.putImageData(fimg, 0, 0);
          const [ax, ay] = tileOf(g.north, g.west, v.Z), [bx, by] = tileOf(g.south, g.east, v.Z);
          mx.drawImage(fc, (ax - v.x0) * 256, (ay - v.y0) * 256, (bx - ax) * 256, (by - ay) * 256);
        }
      }
      mx.globalAlpha = 1; mx.globalCompositeOperation = "source-over";
    }
    const [n, w] = cornerOf(v.x0, v.y0, v.Z), [s2, e] = cornerOf(v.x1 + 1, v.y1 + 1, v.Z);
    map.blend(canvas, [[s2, w], [n, e]], SHOW, fade, softIn);
    softIn = false; mixed = true;
    // once it's drawn and still: the rest of the radar's frames for this view worked out meanwhile, nearest in time
    // first (as many as are kept), so playing, or dragging along the timeline, doesn't wait on them; and the frame on
    // show a zoom out, so zooming out has its rain to hand rather than a bare edge
    const near = parts.find((p) => p.base)?.k, key = `${v.key}|${src.past.at(-1)?.path}`;
    if (!playing && near != null && warmed !== key) {
      warmed = key;
      // (the zoom out first: a handful of tiles, where the frames are many)
      if (v.Z - 1 >= map.state().min) {
        const n2 = v.n / 2;
        for (let y = Math.max(0, Math.floor(v.y0 / 2) - 1); y <= Math.min(n2 - 1, Math.floor(v.y1 / 2) + 1); y++) {
          for (let x = Math.floor(v.x0 / 2) - 1; x <= Math.floor(v.x1 / 2) + 1; x++) keptTile(base(near), { z: v.Z - 1, x: wrapX(x, n2), y }, () => false, want, true);
        }
      }
      const per = (v.x1 - v.x0 + 1) * (v.y1 - v.y0 + 1), fit = Math.max(0, Math.floor((KEEP - 40) / per) - 3), list = [];
      for (const k of src.past.map((_, k) => k).sort((a, b) => Math.abs(a - near) - Math.abs(b - near)).slice(0, fit)) {
        for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) list.push([base(k), x, y]);
      }
      ask(list, false, true);
    }
    return true;
  }
  // the chip's state, Radar or Forecast (said in the dock now, where its word changes: show; the chip itself isn't
  // shown, styles.css, so it isn't measured)
  const chipTo = (k) => { if (chip.dataset.kind !== k) chip.dataset.kind = k; };
  // playing: from now through the next two hours, again and again, minute by minute (ten minutes to every STEP ms; a
  // moment at now, and at the end); the hours gone are a drag back, and played from there, it runs on through them too
  const SPEED = 600e3 / STEP;
  let raf = 0, resting = 0;
  const stop = () => { playing = false; cancelAnimationFrame(raf); clearTimeout(resting); play.setAttribute("aria-label", "Play"); play.dataset.on = "0"; };
  const run = () => {
    playing = true; play.setAttribute("aria-label", "Pause"); play.dataset.on = "1";
    const from = at < tNow - 30e3 ? t0 : tNow, rest = (t) => (Math.abs(t - tNow) < 30e3 ? AT_NOW : 0);
    if (at >= tEnd - 30e3) at = from;
    let prev = 0, wait = rest(at), end = false;
    const tick = (ts) => {
      if (!playing) return;
      // (held where it is under a sheet: unseen there, and each picture would have the sheet's glass blurred afresh;
      // looked at again a few times a second, not every frame, so the screen isn't kept busy for nothing)
      if (document.body.classList.contains("sheet-up")) { prev = 0; raf = 0; resting = setTimeout(() => { if (playing) raf = requestAnimationFrame(tick); }, 300); return; }
      raf = requestAnimationFrame(tick);
      // (about 30 pictures a second, however fast the screen: as smooth to the eye, for less of the battery)
      if (prev && ts - prev < 30) return;
      const dt = prev ? Math.min(100, ts - prev) : 0; prev = ts;
      if (wait > 0) wait -= dt;
      else if (end) { end = false; show(from, true); wait = rest(from); }
      else { show(at + dt * SPEED * (kind === "rain" && at < split ? 1 : 6)); if (at >= tEnd) { end = true; wait = HOLD; } }
    };
    cancelAnimationFrame(raf); clearTimeout(resting);
    show(at);
    raf = requestAnimationFrame(tick);
  };
  // Now kept to the clock (to the slider's minute, between the latest radar and the end), and so the radar counted as
  // seen up to it, if it's no more than 20 minutes behind; true if it's moved on
  function clockOn() {
    const was = tNow;
    tNow = Math.min(tEnd, Math.max(tLast, t0 + Math.round((Date.now() - t0) / 60e3) * 60e3));
    seen = !src?.past.length ? -Infinity : tNow - tLast <= 20 * 60e3 ? tNow : tLast;
    return tNow !== was;
  }
  // under the slider: where the radar ends and the forecast begins
  // (drawn again as its width changes: the half hours, and what's too near Now, go by it)
  let scaleW = 0;
  if (typeof ResizeObserver === "function") new ResizeObserver(() => { const w = scale.clientWidth; if (Math.abs(w - scaleW) > 8 && frames.length) drawScale(); }).observe(scale);
  function drawScale() {
    scaleW = scale.clientWidth;
    scale.replaceChildren();
    if (tEnd <= t0) return;
    const pos = (t) => `${(uOf(t) / uOf(tEnd)) * 100}%`, mark = (t, text, cls) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; s.style.left = pos(t); scale.append(s); return s; };
    slider.style.setProperty("--nowf", String(uOf(tNow) / uOf(tEnd)));
    // (a tick on the track at each frame that's the radar's own, or the models': the minutes between them are worked out)
    if (kind !== "rain") return hoursScale(pos, mark);
    for (const f of frames) if (f.kind === "radar" || (f.kind === "model" && src.model)) mark(f.t, "", "rs-t");
    // (and after the split, the models' hours: a tick at each)
    if (split < tEnd) for (let t = Math.ceil(split / 3600e3) * 3600e3; t <= tEnd; t += 3600e3) mark(t, "", "rs-t rs-h");
    // (and where they begin: a hairline across the track, "Hourly" over it)
    if (split < tEnd) { mark(split, "", "rs-div"); mark(split, "Hourly", "rs-hourly"); }
    // and under it, as Apple's has it, the clock: Now, and the hours (the half hours too, where there's room; every two or
    // three hours over the models' hours), none so near Now, the ends or each other that they'd crowd
    const nowAt = mark(tNow, "Now", "rs-l rs-now"), b = nowAt.getBoundingClientRect();
    const w = scale.clientWidth || 300, full = uOf(tEnd), perA = (60 * w) / full, perB = (PER_H * w) / full;
    const stepA = perA >= 110 ? 1800e3 : 3600e3, stepB = ([1, 2, 3, 4, 6].find((h) => h * perB >= 46) || 6) * 3600e3, ends = 0.04 * full;
    const times = [];
    for (let t = Math.ceil(t0 / stepA) * stepA; t <= Math.min(split, tEnd); t += stepA) times.push(t);
    if (split < tEnd) for (let t = Math.ceil((split + 1) / stepB) * stepB; t <= tEnd; t += stepB) times.push(t);
    let last = null;
    for (const t of times) {
      if (uOf(t) < ends || full - uOf(t) < ends) continue;
      const s = mark(t, time(t), "rs-l rs-at"), a = s.getBoundingClientRect();
      const clash = (r) => r && r.width && a.left < r.right + 10 && r.left < a.right + 10;
      if (a.width ? clash(b) || clash(last) : (Math.abs(uOf(t) - uOf(tNow)) / full) * w < 45) s.remove(); else last = a;
    }
  }
  // (the temperature's and the wind's: a tick each hour, and under them Now and the hours, every two or three as fit)
  function hoursScale(pos, mark) {
    for (let t = t0; t <= tEnd; t += 3600e3) mark(t, "", "rs-t");
    const nowAt = mark(tNow, "Now", "rs-l rs-now"), w = scale.clientWidth || 300, per = (3600e3 * w) / (tEnd - t0);
    const every = [1, 2, 3, 4, 6].find((h) => h * per >= 46) || 6, b = nowAt.getBoundingClientRect();
    let last = null;
    for (let t = Math.ceil(t0 / (every * 3600e3)) * every * 3600e3; t <= tEnd; t += every * 3600e3) {
      if (t - t0 < 0.04 * (tEnd - t0) || tEnd - t < 0.04 * (tEnd - t0)) continue;
      const s = mark(t, time(t), "rs-l rs-at"), a = s.getBoundingClientRect();
      const clash = (r) => r && r.width && a.left < r.right + 8 && r.left < a.right + 8;
      if (a.width ? clash(b) || clash(last) : Math.abs(t - tNow) / (tEnd - t0) * w < 40) s.remove(); else last = a;
    }
  }
  async function load() {
    // (where it was asked for, throughout; and if it's been asked for again meanwhile, somewhere else say, this one's dropped)
    const my = ++loads, spot = here, rg = grid(spot.lat, spot.lon);
    if (said) said.textContent = "";
    // (the models' hours asked for meanwhile; not waited for long: if they come later, it's drawn again with them)
    let waited = false;
    const hoursP = modelHours(rg).catch(() => null), soon = new Promise((ok) => setTimeout(ok, 3000));
    const rv = await framesNow().catch(() => null);
    const host = rv?.host, past = rv?.radar?.past || [];
    // the next two hours, always: the latest radar carried along its own track, every 10 minutes; where there's no
    // track to follow (no radar here, or too little rain to tell) but rain's about on the radar or expected here soon,
    // the models' rain on the grid instead (81 places' forecasts: not asked for to show a dry map); and where it's dry
    // all about, the latest radar as it is (nothing coming: no more to ask for)
    const drift = past.length >= 3 ? await driftAt(host, past, spot.lat, spot.lon).catch(() => null) : null;
    const last = past.length ? past[past.length - 1].time * 1000 : 0;
    const wetAbout = !drift && past.length ? !!(await squareAt(spot.lat, spot.lon, (x, y) => tileCodes(`${host}${past[past.length - 1].path}/${SRC}/${NATIVE - 1}/${x}/${y}/2/1_1.png`)).catch(() => null))?.some(Boolean) : false;
    const model = drift || (past.length && !rainSoon() && !wetAbout) ? null : await modelRain(rg).catch(() => null);
    const hours = await Promise.race([hoursP, soon.then(() => { waited = true; return null; })]);
    if (!past.length && !model && !hours) throw new Error("nothing");
    const held = !drift && !model && past.length > 0 && !rainSoon() && !wetAbout;
    // (and the same, in words, for a screen reader: rainmap.js rainSaid)
    if (past.length) Promise.all([squareAt(spot.lat, spot.lon, (x, y) => tileCodes(`${host}${past[past.length - 1].path}/${SRC}/${NATIVE - 1}/${x}/${y}/2/1_1.png`)),
      squareAt(spot.lat, spot.lon, (x, y) => tileCodes(`${host}/v2/coverage/0/${SRC}/${NATIVE - 1}/${x}/${y}/0/0_0.png`))])
      .then(([sq, cover]) => { if (said && my === loads) said.textContent = rainSaid(sq, cover, spot.lat, drift); }, () => {});
    const ahead = drift || held ? Array.from({ length: 12 }, (_, k) => last + (k + 1) * 600e3) : model ? model.times : [];
    if (my !== loads) return;
    g = rg;
    const tl = timeline(past.map((f) => f.time * 1000), ahead, Date.now(), 2 * 3600e3, hours ? hours.times : []);
    frames = tl.frames;
    const box = [[g.south, g.west], [g.north, g.east]];
    // (the radar's frames and the models' have layers of their own on the map, shown as they are where the minutes
    // between can't be drawn; the next two hours carried on from the radar have none: the minutes between draw them,
    // from the latest's tiles, and where they can't, it's the latest as it is)
    // (and the models' hours, each a layer of its own)
    const lay = [], mine = frames.filter((f, j) => (f.kind === "radar" || f.kind === "hour" || model ? (lay[j] = lay.filter((x) => x != null).length, true) : false));
    const latest = lay[past.length - 1] ?? 0;
    layerAt = (j) => lay[j] ?? latest;
    map.frames(mine.map((f) => {
      // (a frame's own tiles first while it's the one on show; not while the minutes either side of it are)
      const j = frames.indexOf(f), shown = () => layerAt(i) === lay[j] && !mixed, from = (k) => `${host}${past[k].path}/${SRC}`;
      if (f.kind === "radar") return { draw: (z, x, y, gone) => keptTile(from(f.k), { z, x, y }, shown, gone).then((e) => (e?.vals ? rgbaOf(e.vals) : null)) };
      const m = f.kind === "hour" ? hours : model;
      return { canvas: canvasFor(g, m.rain[f.k], m.snow[f.k]), bounds: box };
    }));
    // (what the minutes between are drawn from: rainmap.js partsAt)
    raw.clear();
    src = { host, past, drift, model, models: model ? frames.filter((f) => f.kind === "model") : [], driftOf: pairDrift,
      hours, hourly: frames.filter((f) => f.kind === "hour"), split: tl.split };
    t0 = frames[0].t; tEnd = frames[frames.length - 1].t; tLast = past.length ? last : t0; tNow = 0;
    split = src.hourly.length ? tl.split : Infinity;
    rainSpan = [t0, tEnd, split];
    if (kind !== "rain") [t0, tEnd, split] = hourly();
    clockOn();
    sight = ""; minute = null; layer = -1; mixed = false;
    map.box(model || src.hourly.length ? box : null);
    // (nothing on the radar about here, and nothing coming: said on the map, so an empty map isn't a puzzle; not over
    // the models' hours, if they've rain somewhere)
    dryNow = held; dryLater = !hours || hours.rain.every((r) => r.every((x) => x < 0.1));
    dryShown = held; onMap();
    credited([...map.credit, past.length ? "RainViewer" : "Open-Meteo"]);      // (the rest are in the credits)
    // (a line only when something's missing)
    line(status, !past.length ? "The radar isn't available right now: showing the forecast's rain." : !drift && !model && !held ? "The next two hours aren't available right now: showing the radar." : "");
    lengthen();
    fetched = Date.now();
    drawScale();
    show(tNow);
    // (the models' hours come late: drawn again with them, where it's still this place)
    if (waited) hoursP.then((h) => { if (h && my === loads) load().catch(() => {}); });
    // (the temperature or the wind, if that's the layer chosen: for here)
    if (want !== "rain") setKind(want);
  }
  // the map's controls, on it: zoom in and out, and back to the place (top left); its scale, a bracket drawn on the
  // map as Maps draws it (bottom left); and its credits, in full as it first appears, then folded into a © that opens
  // all of them (bottom right), when "Tap to explore" comes in between them (on a phone)
  function controls() {
    const button = (cls, name, html) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.title = name; b.setAttribute("aria-label", name); b.innerHTML = html; return b; };
    const zin = button("map-in", "Zoom in", PLUS), zout = button("map-out", "Zoom out", MINUS), back = button("radar-centre", "Back to the place", CENTRE);
    const zoom = document.createElement("div"); zoom.className = "map-zoom"; zoom.append(zin, zout);
    const layersBtn = button("map-layers", "Map layers", LAYERS);
    layersBtn.setAttribute("aria-haspopup", "true"); layersBtn.setAttribute("aria-expanded", "false");
    const layerWrap = document.createElement("div"); layerWrap.className = "layer-wrap";
    const top = document.createElement("div"); top.className = "map-ctl"; top.append(zoom, back, layerWrap);
    // the layers to choose from, in glass by the button (as Apple's map has them): the rain, the temperature, the wind
    const menu = document.createElement("div"); menu.className = "layer-menu"; menu.hidden = true; menu.setAttribute("role", "group"); menu.setAttribute("aria-label", "Map layers");
    for (const [k, name] of Object.entries(KINDS)) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.kind = k; b.textContent = name;
      b.addEventListener("click", () => { setKind(k); shut(); layersBtn.focus({ preventScroll: true }); });
      menu.append(b);
    }
    layerWrap.append(layersBtn, menu);
    menuSync = () => { for (const b of menu.children) b.setAttribute("aria-pressed", String(b.dataset.kind === want)); };
    menuSync();
    // (it closes the way it opened, a little quicker, from wherever it had got to, and is hidden once it has; opened again
    // meanwhile, it comes back from there)
    let closing = null;
    const now = () => { const cs = getComputedStyle(menu); return { opacity: cs.opacity, transform: cs.transform }; };
    const shut = () => {
      layersBtn.setAttribute("aria-expanded", "false");
      if (menu.hidden || closing) return;
      const from = now();
      menu.getAnimations().forEach((a) => a.cancel());
      closing = menu.animate([from, { opacity: 0, transform: calm ? from.transform : "scale(0.94)" }], { duration: calm ? 120 : 160, easing: GLIDE, fill: "forwards" });
      closing.finished.then(() => { menu.hidden = true; closing?.cancel(); closing = null; }, () => {});
    };
    const open = () => {
      if (closing) { const from = now(); closing.cancel(); closing = null; menu.animate([from, { opacity: 1, transform: "none" }], { duration: 200, easing: GLIDE }); }
      else menu.hidden = false;
      layersBtn.setAttribute("aria-expanded", "true");
      menu.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    };
    layersBtn.addEventListener("click", (e) => { e.stopPropagation(); if (menu.hidden || closing) open(); else shut(); });
    document.addEventListener("click", (e) => { if (!menu.hidden && !closing && !menu.contains(e.target)) shut(); });
    menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); shut(); layersBtn.focus(); } });
    const ruler = document.createElement("div"); ruler.className = "map-scale"; ruler.setAttribute("aria-hidden", "true");
    credit = button("radar-credit", "Map data", '<span class="rc-c" aria-hidden="true">©</span><span class="rc-t" aria-hidden="true"></span>');
    credit.removeAttribute("title");
    zin.addEventListener("click", () => map.zoomBy(1));
    zout.addEventListener("click", () => map.zoomBy(-1));
    back.addEventListener("click", () => map.view(here.lat, here.lon, true));
    credit.addEventListener("click", () => credits?.());
    dry = document.createElement("span"); dry.className = "radar-dry off";
    wrap.append(flowCv, top, ruler, credit, dry);
    const moved = () => {
      const s = map.state(), most = s.mpp * 90;
      zin.disabled = s.zoom >= s.max - 0.01; zout.disabled = s.zoom <= s.min + 0.01;
      // the longest round distance that fits in 90 pixels
      const [n, unit, m] = miles() ? (most >= 1609.344 ? [round(most / 1609.344), "mi", 1609.344] : [round(most * 3.2808), "ft", 0.3048]) : most >= 1000 ? [round(most / 1000), "km", 1000] : [round(most), "m", 1];
      ruler.textContent = `${n} ${unit}`;
      ruler.style.width = `${Math.round((n * m) / s.mpp)}px`;
    };
    map.on("move", moved); moved();
    // (the wind's flow kept to the map as it moves: once a frame)
    let flowAt = 0;
    map.on("move", () => { if (kind === "wind") flowAt ||= requestAnimationFrame(() => { flowAt = 0; flowMoved(); }); });
    // the names step aside from all that's over the map (as from the place's dot), measured again once any of it, or
    // the map, has changed size (a little room round each; not every frame of the © folding away)
    const over = [top, menu, ruler, credit, hint, chip], words = credit.querySelector(".rc-t");
    let settle = 0;
    const clear = () => {
      const b = el.getBoundingClientRect();
      map.clear((credit.classList.contains("folded") ? over : [...over, words]).map((x) => x.getBoundingClientRect()).filter((r) => r.width && r.height)
        .map((r) => ({ x: r.left - b.left - 4, y: r.top - b.top - 4, w: r.width + 8, h: r.height + 8 })));
    };
    const sizes = new ResizeObserver(() => { clearTimeout(settle); settle = setTimeout(clear, 100); });
    for (const x of [el, ...over, words]) sizes.observe(x);
    credited([...map.credit, "RainViewer"]);
    // (folded, the names may have the space its words had again)
    setTimeout(() => { credit.classList.add("folded"); told = true; hint.hidden = !touch || card.classList.contains("radar-big"); setTimeout(clear, 650); }, 5000);
  }
  async function start() {
    try {
      const from = here;
      map = await mapIn(el, { lat: from.lat, lon: from.lon, zoom: VIEW, min: 3, max: CLOSEST, touch, calm, light, pin });
      if (here !== from) { map.view(here.lat, here.lon); map.dot(here.lat, here.lon); }
      controls();
      fitRoom();
      drawOthers(); drawAreas(at, true);
      // (the minutes between drawn again for what's in sight as the map's moved: once a frame, and not while it plays,
      // which draws them anyway)
      let moving = 0;
      map.on("move", () => { if (!playing && frames.length && !moving) moving = requestAnimationFrame(() => { moving = 0; show(at); placeReading(); }); });
      // on a phone, the page scrolls past the map; a tap opens it full screen to explore
      // (full screen, or with a mouse, a tap reads the weather there)
      map.on("tap", (pt) => { if (touch && !card.classList.contains("radar-big")) grow(true); else if (pt) readAt(pt); });
      await load();
      if (!calm) run();
    } catch (e) {
      line(status, "The radar isn't available right now.");
      if (!map) starting = null;
    }
  }
  function credited(names) {
    if (!credit) return;
    // (more than two names in two lines: four don't fit in one across a phone's map)
    const one = names.length > 2 ? Math.ceil(names.length / 2) : names.length;
    credit.querySelector(".rc-t").textContent = ` ${names.slice(0, one).join(", ")}${one < names.length ? `,\n ${names.slice(one).join(", ")}` : ""}`;
    credit.setAttribute("aria-label", `Map data © ${names.join(", ")}: all the credits`);
  }
  // (while it fills the screen, a space of its height holds its place, so the page under it doesn't move up)
  let held = null;
  function big(on) {
    if (on && !held) { held = document.createElement("div"); held.className = "radar-held"; held.style.height = `${card.offsetHeight}px`; card.after(held); }
    else if (!on && held) { held.remove(); held = null; }
    card.classList.toggle("radar-big", on);
    document.body.classList.toggle("no-scroll", on);
    full.setAttribute("aria-label", on ? "Close full screen" : "Full screen");
    full.dataset.on = on ? "1" : "0";
    hint.hidden = on || !touch || !told;
    if (map) { map.resize(); map.explore(on); flowRestart(); }
    // (the timeline's clock times again for its new width)
    if (frames.length) drawScale();
  }
  // full screen and back, the card growing to fill the screen (and shrinking back into its place), where the browser
  // can morph one into the other (a view transition); at once otherwise, or with reduced motion
  function grow(on) {
    if (!document.startViewTransition || calm) return big(on);
    card.style.viewTransitionName = "radar";
    // (once it has grown, the map measured again and filled to its new edges: measured mid-way, it can leave gaps)
    document.startViewTransition(() => big(on)).finished.finally(() => { card.style.viewTransitionName = ""; map?.resize(); });
  }
  play.addEventListener("click", () => (playing ? stop() : run()));
  slider.addEventListener("input", () => { stop(); show(tOf(Number(slider.value))); });
  // (a minute an arrow key; Page Up and Page Down to the next and the last of the real frames)
  slider.addEventListener("keydown", (e) => {
    if ((e.key !== "PageUp" && e.key !== "PageDown") || !frames.length) return;
    e.preventDefault(); stop();
    const real = frames.filter((f) => f.kind === "radar" || f.kind === "hour" || src?.model).map((f) => f.t).concat(tNow, tEnd).sort((a, b) => a - b);
    const to = e.key === "PageUp" ? real.find((t) => t > at + 30e3) ?? tEnd : [...real].reverse().find((t) => t < at - 30e3) ?? t0;
    jump(); show(Math.round((to - t0) / 60e3) * 60e3 + t0, true);
  });
  full.addEventListener("click", () => grow(!card.classList.contains("radar-big")));
  // (Escape in a sheet opened from it, the credits say, closes the sheet, not this)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && card.classList.contains("radar-big") && !document.querySelector("dialog[open]")) grow(false); });
  // the vector map's code fetched as the page is scrolled towards it, half a screen ahead: not as the page opens, where
  // it would only hold up the forecast (in sight as it opens, a wide screen say, it's fetched as the map's made); the
  // radar started once it's on screen, and paused while it's off it
  const near = new IntersectionObserver((es) => {
    if (!es.some((x) => x.isIntersecting)) return;
    near.disconnect();
    whenStill(() => vectorLib().then((v) => v.able() && v.preload()).catch(() => {}));
  }, { rootMargin: "50% 0px" });
  addEventListener("scroll", () => near.observe(card), { once: true, passive: true });
  // (in sight, as the page comes to rest: the map made then; scrolled on past it meanwhile, it waits to be seen again)
  let inView = false;
  const io = new IntersectionObserver((es) => {
    const vis = es.some((x) => x.isIntersecting);
    inView = vis; inSight = vis;
    if (vis && kind === "wind") flowRestart();
    if (vis && !starting) starting = new Promise((ok) => whenStill(() => { if (inView) ok(start()); else { starting = null; ok(); } }));
    else if (vis && map && Date.now() - fetched > 10 * 60e3) load().catch(() => {});
    if (!vis && playing) stop();
  }, { rootMargin: "120px" });
  io.observe(card);
  return {
    place(lat2, lon2) {
      // (the same place, its forecast refreshed: the map left where it's been moved to)
      if (lat2 === here.lat && lon2 === here.lon) return;
      const moved = Math.abs(lat2 - here.lat) > 0.05 || Math.abs(lon2 - here.lon) > 0.05;
      const near = Math.abs(lat2 - here.lat) < 3 && Math.abs(lon2 - here.lon) < 5;
      here = { lat: lat2, lon: lon2 };
      if (!map) return;
      unread();
      // (in sight and not far: the map glides over to it, rather than jumping; else it's just there)
      map.view(lat2, lon2, inView && near); map.dot(lat2, lon2);
      if (moved) load().catch(() => {});        // (the forecast's grid goes with the place)
    },
    refresh() {
      // (a map that couldn't start, its code not to hand, say: tried again)
      if (!map && !starting) starting = start();
      else if (map && Date.now() - fetched > 5 * 60e3) load().catch(() => {});
      // (and as the minutes go by, Now with them, and what's said of the time on show; left at Now, it stays there)
      else if (frames.length) {
        const was = tNow, hr = t0;
        if (kind !== "rain") [t0, tEnd] = hourly();
        if (!clockOn() && hr === t0) return;
        if (hr !== t0) lengthen();
        drawScale();
        if (!playing) { minute = null; show(Math.abs(at - was) < 30e3 ? tNow : at); }
      }
    },
    note(text) { line(q(".radar-note"), text || ""); },
    // the other saved places: [{ name, lat, lon, temp ("12°"), colour, go() }]
    others(list) { others = list || []; drawOthers(); },
    // official warnings with their areas: [{ id, title, colour (yellow, amber, orange, red), onset, expires, open, rings }]
    warnings(list) {
      const key = (list || []).map((w) => `${w.id}:${w.rings?.length}:${w.onset}:${w.expires}`).join("|");
      if (key === warnsKey) return;
      warnsKey = key; warns = list || []; drawAreas(at, true); if (reading) sayReading();
    },
    // the place's bubble: { temp ("10°"), icon (an svg), name, colour (its temperature's) }
    mark({ temp, icon, name, colour }) {
      marked = { temp, colour };
      pin.dataset.on = temp ? "1" : "0";
      const i = pin.querySelector(".mp-i"); if (i.dataset.icon !== icon) { i.innerHTML = icon || ""; i.dataset.icon = icon || ""; }
      pin.querySelector(".mp-name").textContent = name || "";
      drawPin();
      fitRoom();
    },
  };
}
