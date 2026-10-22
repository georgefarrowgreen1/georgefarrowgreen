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

import { grid, paint, timeline, LEGEND, decode, rainValues, colour, ramp, squareAt, driftOf, radarAt, partsAt, tileOf, cornerOf } from "./rainmap.js";
import { glMix } from "./radarmix.js";

const FRAMES = "https://api.rainviewer.com/public/weather-maps.json";
const MODEL = "https://api.open-meteo.com/v1/forecast";
// NATIVE: the radar's finest detail, as a zoom of 256-pixel tiles; SRC: the size of the tiles
// asked for (512, a zoom below, as fine as NATIVE's)
const NATIVE = 7, SRC = 512, SHOW = 0.8, STEP = 600, HOLD = 1800, AT_NOW = 1200, PX = 200, MODEL_TTL = 15 * 60e3;
// the map's zoom as it opens (about 10 miles to its scale's bar: the place and the rain about it, the radar smoothed), and
// the closest it goes (two steps in: no closer than the radar's worth seeing)
const VIEW = 9, CLOSEST = 11;
const svg = (d, w = 1.8) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CENTRE = svg('<path d="M20.2 3.8 3.9 10.6c-.7.3-.6 1.3.1 1.5l6.6 1.3 1.3 6.6c.2.7 1.2.8 1.5.1l6.8-16.3z" fill="currentColor" stroke-width="1.2"/>');
const PLUS = svg('<path d="M12 5v14M5 12h14"/>', 2), MINUS = svg('<path d="M5 12h14"/>', 2);

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
export function radar(card, { lat, lon, time, day = () => "", miles = () => false, credits = null, rainSoon = () => true }) {
  const q = (s) => card.querySelector(s);
  const el = q(".radar-map"), wrap = q(".radar-wrap"), play = q(".radar-play"), slider = q(".radar-slider"), label = q(".radar-time"), full = q(".radar-full");
  const status = q(".radar-status"), chip = q(".radar-chip"), hint = q(".radar-hint"), scale = q(".radar-scale"), legend = q(".radar-legend");
  let map = null, starting = null, credit = null, dry = null, told = false, frames = [], i = 0, playing = false, fetched = 0, here = { lat, lon }, g = null, loads = 0;
  const touch = matchMedia("(pointer: coarse)").matches, calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // the map light or dark as the phone is (as Apple's Weather map is), its controls to match (styles.css)
  const light = matchMedia("(prefers-color-scheme: light)").matches;
  card.classList.toggle("light-map", light);
  // the place on the map: its temperature in a bubble over it, and its name under it (mark: once the page has them)
  const pin = document.createElement("div"); pin.className = "map-pin"; pin.setAttribute("aria-hidden", "true");
  // (the names on the map keep clear of all of it, its name however long: mapgl.js room)
  const fitRoom = () => requestAnimationFrame(() => { const n = pin.querySelector(".mp-name"); if (map && n?.offsetWidth) map.room?.(n.offsetWidth); });
  pin.innerHTML = '<span class="mp-bubble"><b class="mp-t"></b><span class="mp-i"></span></span><span class="mp-dot"></span><span class="mp-name"></span>';

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
  legend.replaceChildren(Object.assign(document.createElement("b"), { className: "rl-title", textContent: "Precipitation" }), rain, snowKey);

  // where the slider is: at (ms), from t0 (the first frame) to tEnd (the last); tNow now, as the clock has it (where it
  // opens, and the past turns to the forecast), tLast the latest radar frame's time (always a little before: it's 5 to
  // 15 minutes coming), and seen how far on the radar counts as seen (up to now, it carried on along its track meanwhile;
  // but not if it's been away a while: then only as far as its latest); the frame nearest at (i), drawn as it is where
  // the minutes between can't be (zoomed far out, or its tiles still coming)
  let t0 = 0, tEnd = 0, tNow = 0, tLast = 0, seen = 0, at = 0, minute = null, layer = -1, layerAt = () => 0, holding = 0;
  // fade: what's on the map fades into what's next, rather than cutting to it (a jump from frame to frame, or round
  // to the start again; not a drag along the timeline, which moves it on minute by minute anyway)
  const show = (t, fade = false) => {
    if (!frames.length || !Number.isFinite(t)) return;
    at = Math.min(tEnd, Math.max(t0, t));
    let k = 0;
    for (let j = 1; j < frames.length; j++) if (Math.abs(frames[j].t - at) < Math.abs(frames[k].t - at)) k = j;
    i = k;
    const drew = paintAt(at, fade || holding > 0 || layer >= 0);
    if (drew === true) { layer = -1; holding = 0; }
    // (its tiles still coming: the last picture held in its place on the map till they're in, then faded into it, rather
    // than the nearest frame as it is in the meantime: a different picture, there and gone again; but not for more than
    // a couple of seconds (one that doesn't come, say): then the frame as it is)
    else if (drew === "wait" && mixed && (!holding || performance.now() - holding < 2500)) holding ||= performance.now();
    else if (layer !== layerAt(i)) { layer = layerAt(i); map.show(layer, SHOW); mixed = false; holding = 0; }
    slider.style.setProperty("--f", String(tEnd > t0 ? (at - t0) / (tEnd - t0) : 1));
    // (its words, to the minute)
    const m = Math.round((at - t0) / 60e3);
    if (m === minute) return;
    minute = m;
    // (how long ago or ahead of Now as it's marked (kept to the clock: clockOn); the latest radar's said as such; and
    // what's to come, forecast, or what's been worked out since a radar that's been away a while, estimated)
    // (as Apple's Weather map says it: what it is, over the day and the time, here with how long ago or ahead)
    const tm = Math.min(tEnd, t0 + m * 60e3), ahead = tm > seen + 30e3, mins = Math.round((tm - tNow) / 60e3), had = src?.past.length > 0;
    const what = had && Math.abs(tm - tLast) < 30e3 ? "Latest radar" : !ahead ? "Radar" : !had || tm > tNow + 30e3 ? "Forecast" : "Estimated";
    const when = `${day(tm)} ${time(tm)} · ${mins > 0 ? until(mins) : mins === 0 ? "now" : ago(-mins)}`.trim();
    slider.value = String(m);
    const b = document.createElement("b"), rel = document.createElement("span");
    b.className = "rt-k"; b.textContent = what; rel.textContent = when; rel.className = ahead ? "rt-rel ahead" : "rt-rel";
    label.replaceChildren(b, " ", rel);
    slider.setAttribute("aria-valuetext", `${what}, ${when}`);
    chipTo(ahead ? "model" : "radar");
    map.box(undefined, ahead ? 0.45 : 0);
  };

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
    map.blend(canvas, [[s2, w], [n, e]], SHOW, fade);
    mixed = true;
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
  // the chip over the map, Radar or Forecast: its width springing from the one word's to the other's (the words
  // crossing, and its colour, are styles.css's)
  let morph = null;
  const chipTo = (kind) => {
    if (chip.dataset.kind === kind) return;
    const from = chip.getBoundingClientRect().width;
    morph?.cancel();
    chip.dataset.kind = kind;
    const to = chip.getBoundingClientRect().width;
    if (!calm && from && Math.abs(to - from) > 0.5) morph = chip.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 550, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)" });
  };
  // playing: from now through the next two hours, again and again, minute by minute (ten minutes to every STEP ms; a
  // moment at now, and at the end); the hours gone are a drag back, and played from there, it runs on through them too
  const SPEED = 600e3 / STEP;
  let raf = 0;
  const stop = () => { playing = false; cancelAnimationFrame(raf); play.setAttribute("aria-label", "Play"); play.dataset.on = "0"; };
  const run = () => {
    playing = true; play.setAttribute("aria-label", "Pause"); play.dataset.on = "1";
    const from = at < tNow - 30e3 ? t0 : tNow, rest = (t) => (Math.abs(t - tNow) < 30e3 ? AT_NOW : 0);
    if (at >= tEnd - 30e3) at = from;
    let prev = 0, wait = rest(at), end = false;
    const tick = (ts) => {
      if (!playing) return;
      raf = requestAnimationFrame(tick);
      // (held where it is under a sheet: unseen there, and each picture would have the sheet's glass blurred afresh)
      if (document.body.classList.contains("sheet-up")) { prev = 0; return; }
      // (about 30 pictures a second, however fast the screen: as smooth to the eye, for less of the battery)
      if (prev && ts - prev < 30) return;
      const dt = prev ? Math.min(100, ts - prev) : 0; prev = ts;
      if (wait > 0) wait -= dt;
      else if (end) { end = false; show(from, true); wait = rest(from); }
      else { show(at + dt * SPEED); if (at >= tEnd) { end = true; wait = HOLD; } }
    };
    cancelAnimationFrame(raf);
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
    const pos = (t) => `${((t - t0) / (tEnd - t0)) * 100}%`, mark = (t, text, cls) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; s.style.left = pos(t); scale.append(s); return s; };
    slider.style.setProperty("--nowf", String((tNow - t0) / (tEnd - t0)));
    // (a tick on the track at each frame that's the radar's own, or the models': the minutes between them are worked out)
    for (const f of frames) if (f.kind === "radar" || src.model) mark(f.t, "", "rs-t");
    // and under it, as Apple's has it, the clock: Now, and the hours (the half hours too, where there's room), none so
    // near Now or the ends that they'd crowd
    const nowAt = mark(tNow, "Now", "rs-l rs-now");
    const w = scale.clientWidth || 300, step = (3600e3 * w) / (tEnd - t0) >= 110 ? 1800e3 : 3600e3;
    // (too near: less than 10 pixels between it and Now, as they're drawn; where they aren't yet, about 45 pixels apart)
    const near = (s, t) => {
      const a = s.getBoundingClientRect(), b = nowAt.getBoundingClientRect();
      return a.width && b.width ? a.left < b.right + 10 && b.left < a.right + 10 : (Math.abs(t - tNow) / (tEnd - t0)) * w < 45;
    };
    for (let t = Math.ceil(t0 / step) * step; t <= tEnd; t += step) {
      if (t - t0 > 0.05 * (tEnd - t0) && tEnd - t > 0.05 * (tEnd - t0)) { const s = mark(t, time(t), "rs-l rs-at"); if (near(s, t)) s.remove(); }
    }
  }
  async function load() {
    // (where it was asked for, throughout; and if it's been asked for again meanwhile, somewhere else say, this one's dropped)
    const my = ++loads, spot = here, want = grid(spot.lat, spot.lon);
    const rv = await framesNow().catch(() => null);
    const host = rv?.host, past = rv?.radar?.past || [];
    // the next two hours, always: the latest radar carried along its own track, every 10 minutes; where there's no
    // track to follow (no radar here, or too little rain to tell) but rain's about on the radar or expected here soon,
    // the models' rain on the grid instead (81 places' forecasts: not asked for to show a dry map); and where it's dry
    // all about, the latest radar as it is (nothing coming: no more to ask for)
    const drift = past.length >= 3 ? await driftAt(host, past, spot.lat, spot.lon).catch(() => null) : null;
    const last = past.length ? past[past.length - 1].time * 1000 : 0;
    const wetAbout = !drift && past.length ? !!(await squareAt(spot.lat, spot.lon, (x, y) => tileCodes(`${host}${past[past.length - 1].path}/${SRC}/${NATIVE - 1}/${x}/${y}/2/1_1.png`)).catch(() => null))?.some(Boolean) : false;
    const model = drift || (past.length && !rainSoon() && !wetAbout) ? null : await modelRain(want).catch(() => null);
    if (!past.length && !model) throw new Error("nothing");
    const held = !drift && !model && past.length > 0 && !rainSoon() && !wetAbout;
    const ahead = drift || held ? Array.from({ length: 12 }, (_, k) => last + (k + 1) * 600e3) : model ? model.times : [];
    if (my !== loads) return;
    g = want;
    const tl = timeline(past.map((f) => f.time * 1000), ahead);
    frames = tl.frames;
    const box = [[g.south, g.west], [g.north, g.east]];
    // (the radar's frames and the models' have layers of their own on the map, shown as they are where the minutes
    // between can't be drawn; the next two hours carried on from the radar have none: the minutes between draw them,
    // from the latest's tiles, and where they can't, it's the latest as it is)
    const lay = [], mine = frames.filter((f, j) => (f.kind === "radar" || model ? (lay[j] = lay.filter((x) => x != null).length, true) : false));
    const latest = lay[past.length - 1] ?? 0;
    layerAt = (j) => lay[j] ?? latest;
    map.frames(mine.map((f) => {
      // (a frame's own tiles first while it's the one on show; not while the minutes either side of it are)
      const j = frames.indexOf(f), shown = () => layerAt(i) === lay[j] && !mixed, from = (k) => `${host}${past[k].path}/${SRC}`;
      if (f.kind === "radar") return { draw: (z, x, y, gone) => keptTile(from(f.k), { z, x, y }, shown, gone).then((e) => (e?.vals ? rgbaOf(e.vals) : null)) };
      return { canvas: canvasFor(g, model.rain[f.k], model.snow[f.k]), bounds: box };
    }));
    // (what the minutes between are drawn from: rainmap.js partsAt)
    raw.clear();
    src = { host, past, drift, model, models: model ? frames.filter((f) => f.kind === "model") : [], driftOf: pairDrift };
    t0 = frames[0].t; tEnd = frames[frames.length - 1].t; tLast = past.length ? last : t0; tNow = 0;
    clockOn();
    sight = ""; minute = null; layer = -1; mixed = false;
    map.box(model ? box : null);
    // (nothing on the radar about here, and nothing coming: said on the map, so an empty map isn't a puzzle)
    dry.hidden = !held;
    credited([...map.credit, past.length ? "RainViewer" : "Open-Meteo"]);      // (the rest are in the credits)
    // (a line only when something's missing)
    status.textContent = !past.length ? "The radar isn't available right now: showing the forecast's rain." : !drift && !model && !held ? "The next two hours aren't available right now: showing the radar." : "";
    slider.max = String(Math.round((tEnd - t0) / 60e3));
    fetched = Date.now();
    drawScale();
    show(tNow);
  }
  // the map's controls, on it: zoom in and out, and back to the place (top left); its scale, a bracket drawn on the
  // map as Maps draws it (bottom left); and its credits, in full as it first appears, then folded into a © that opens
  // all of them (bottom right), when "Tap to explore" comes in between them (on a phone)
  function controls() {
    const button = (cls, name, html) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.title = name; b.setAttribute("aria-label", name); b.innerHTML = html; return b; };
    const zin = button("map-in", "Zoom in", PLUS), zout = button("map-out", "Zoom out", MINUS), back = button("radar-centre", "Back to the place", CENTRE);
    const zoom = document.createElement("div"); zoom.className = "map-zoom"; zoom.append(zin, zout);
    const top = document.createElement("div"); top.className = "map-ctl"; top.append(zoom, back);
    const ruler = document.createElement("div"); ruler.className = "map-scale"; ruler.setAttribute("aria-hidden", "true");
    credit = button("radar-credit", "Map data", '<span class="rc-c" aria-hidden="true">©</span><span class="rc-t" aria-hidden="true"></span>');
    credit.removeAttribute("title");
    zin.addEventListener("click", () => map.zoomBy(1));
    zout.addEventListener("click", () => map.zoomBy(-1));
    back.addEventListener("click", () => map.view(here.lat, here.lon, true));
    credit.addEventListener("click", () => credits?.());
    dry = document.createElement("span"); dry.className = "radar-dry"; dry.textContent = "No rain nearby"; dry.hidden = true;
    wrap.append(top, ruler, credit, dry);
    const moved = () => {
      const s = map.state(), most = s.mpp * 90;
      zin.disabled = s.zoom >= s.max - 0.01; zout.disabled = s.zoom <= s.min + 0.01;
      // the longest round distance that fits in 90 pixels
      const [n, unit, m] = miles() ? (most >= 1609.344 ? [round(most / 1609.344), "mi", 1609.344] : [round(most * 3.2808), "ft", 0.3048]) : most >= 1000 ? [round(most / 1000), "km", 1000] : [round(most), "m", 1];
      ruler.textContent = `${n} ${unit}`;
      ruler.style.width = `${Math.round((n * m) / s.mpp)}px`;
    };
    map.on("move", moved); moved();
    // the names step aside from all that's over the map (as from the place's dot), measured again once any of it, or
    // the map, has changed size (a little room round each; not every frame of the © folding away)
    const over = [top, ruler, credit, hint, chip], words = credit.querySelector(".rc-t");
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
      // (the minutes between drawn again for what's in sight as the map's moved: once a frame, and not while it plays,
      // which draws them anyway)
      let moving = 0;
      map.on("move", () => { if (!playing && frames.length && !moving) moving = requestAnimationFrame(() => { moving = 0; show(at); }); });
      // on a phone, the page scrolls past the map; a tap opens it full screen to explore
      map.on("tap", () => { if (touch && !card.classList.contains("radar-big")) grow(true); });
      await load();
      if (!calm) run();
    } catch (e) {
      status.textContent = "The radar isn't available right now.";
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
    if (map) { map.resize(); map.explore(on); }
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
  slider.addEventListener("input", () => { stop(); show(t0 + Number(slider.value) * 60e3); });
  // (a minute an arrow key; Page Up and Page Down to the next and the last of the real frames)
  slider.addEventListener("keydown", (e) => {
    if ((e.key !== "PageUp" && e.key !== "PageDown") || !frames.length) return;
    e.preventDefault(); stop();
    const real = frames.filter((f) => f.kind === "radar" || src?.model).map((f) => f.t).concat(tNow, tEnd).sort((a, b) => a - b);
    const to = e.key === "PageUp" ? real.find((t) => t > at + 30e3) ?? tEnd : [...real].reverse().find((t) => t < at - 30e3) ?? t0;
    show(Math.round((to - t0) / 60e3) * 60e3 + t0, true);
  });
  full.addEventListener("click", () => grow(!card.classList.contains("radar-big")));
  // (Escape in a sheet opened from it, the credits say, closes the sheet, not this)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && card.classList.contains("radar-big") && !document.querySelector("dialog[open]")) grow(false); });
  // the vector map's code fetched a screen ahead; the radar started once it's on screen, and paused while it's off it
  const near = new IntersectionObserver((es) => {
    if (!es.some((x) => x.isIntersecting)) return;
    near.disconnect();
    whenStill(() => vectorLib().then((v) => v.able() && v.preload()).catch(() => {}));
  }, { rootMargin: "100% 0px" });
  near.observe(card);
  // (in sight, as the page comes to rest: the map made then; scrolled on past it meanwhile, it waits to be seen again)
  let inView = false;
  const io = new IntersectionObserver((es) => {
    const vis = es.some((x) => x.isIntersecting);
    inView = vis;
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
      here = { lat: lat2, lon: lon2 };
      if (!map) return;
      map.view(lat2, lon2); map.dot(lat2, lon2);
      if (moved) load().catch(() => {});        // (the forecast's grid goes with the place)
    },
    refresh() {
      // (a map that couldn't start, its code not to hand, say: tried again)
      if (!map && !starting) starting = start();
      else if (map && Date.now() - fetched > 5 * 60e3) load().catch(() => {});
      // (and as the minutes go by, Now with them, and what's said of the time on show; left at Now, it stays there)
      else if (frames.length) {
        const was = tNow;
        if (!clockOn()) return;
        drawScale();
        if (!playing) { minute = null; show(Math.abs(at - was) < 30e3 ? tNow : at); }
      }
    },
    note(text) { q(".radar-note").textContent = text || ""; },
    // the place's bubble: { temp ("10°"), icon (an svg), name, colour (its temperature's) }
    mark({ temp, icon, name, colour }) {
      pin.dataset.on = temp ? "1" : "0";
      pin.querySelector(".mp-t").textContent = temp || "";
      const i = pin.querySelector(".mp-i"); if (i.dataset.icon !== icon) { i.innerHTML = icon || ""; i.dataset.icon = icon || ""; }
      pin.querySelector(".mp-name").textContent = name || "";
      pin.style.setProperty("--pin", colour || "#3f72c6");
      fitRoom();
    },
  };
}
