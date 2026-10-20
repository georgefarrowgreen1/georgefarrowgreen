// The rain radar: the last two hours of radar, every ten minutes, from RainViewer's free mosaic of the world's
// weather radars, then the next two hours as the weather models see them (Open-Meteo's 15-minute rain on a 9 × 9
// grid about 220 km across around the place, painted in the radar's own colours), on a map: OpenFreeMap's vector
// map, drawn on the phone in the app's own style (mapgl.js), or where the phone can't draw it, OpenStreetMap's own
// turned dark (mapleaf.js). Either is driven the same way from here.
// RainViewer's free tiles go to zoom 7's detail (about a county across a tile),
// which its 512-pixel tiles at zoom 6 carry too, with a quarter of the requests
// (it asks apps to keep them few); closer in, they're enlarged: smoothly, read
// back into reflectivity and blended (rainmap.js resample), rather than as squares.
//
// The map's code is loaded only as the card comes near (the vector map's, a screen ahead: it's a megabyte).

import { grid, paint, timeline, LEGEND, decode, resample, ramp, squareAt, driftOf, radarAt } from "./rainmap.js";

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
  try { localStorage.setItem(key, JSON.stringify(out)); } catch (_) {}
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
// How the radar is smoothed (rainmap.js resample): crisp edges in the radar's own bands, soft edges with
// colours that flow, or (as here) clean edges with flowing colour
const LOOKS = { contours: { edge: [0.22, 0.45], soft: 0.4 }, gradient: { edge: [0.04, 0.6], soft: 2.5 }, both: { edge: [0.16, 0.5], soft: 1.4 } };
const LOOK = LOOKS.both;
// The smoothing, a few tiles at a time so the page keeps moving, the frame on show first
const jobs = [];
let working = false;
function work() {
  const until = performance.now() + 12;
  while (jobs.length && performance.now() < until) {
    const k = Math.max(0, jobs.findIndex((j) => j.shown()));
    const job = jobs.splice(k, 1)[0];
    try { job.run(); } catch (_) { job.fail?.(); }        // (one tile's trouble mustn't stop the rest)
  }
  working = jobs.length > 0;
  if (working) setTimeout(work, 0);
}
function queue(job) { jobs.push(job); if (!working) { working = true; setTimeout(work, 0); } }
// One tile of a radar frame (c: { z, x, y }, a 256-pixel tile's), smoothed: drawn from the radar's own (512 pixels, a
// zoom below, at most zoom 6: as fine as zoom 7's; base: the frame's address up to their size). For the next two
// hours (cast: { vx, vy, lead }), the latest radar carried along its own track: drawn from where its rain was lead
// minutes before, vx, vy zoom-7 pixels a minute behind, fading a little the further ahead. Its pixels (ImageData),
// or null where it's dry, or when it's no longer wanted by its turn (gone.aborted: scrolled away, or the frame
// replaced). shown(): its frame is the one on show (its tiles come first).
function radarTile(base, cast, c, shown, gone) {
  // (sz: the zoom of the tiles drawn from, each SRC pixels; one of their pixels is a zoom-(sz + 1) 256-tile's)
  const sz = Math.max(0, Math.min(c.z, NATIVE) - 1), f = 2 ** (c.z - sz), span = SRC / f, n = 2 ** sz;
  const px = Math.floor(c.x / f), py = Math.floor(c.y / f), x0 = (c.x - px * f) * span, y0 = (c.y - py * f) * span;
  const url = (x, y) => `${base}/${sz}/${((x % n) + n) % n}/${y}/2/1_1.png`;
  const per = cast ? cast.lead / 2 ** (NATIVE - sz - 1) : 0, sx = cast ? cast.vx * per : 0, sy = cast ? cast.vy * per : 0;
  // the tiles its pixels come from: its own, and its neighbours' where the blend (or the track) reaches over
  const need = [];
  for (let oy = Math.floor((y0 - sy - 3) / SRC); oy <= Math.floor((y0 + span - sy + 3) / SRC); oy++) {
    for (let ox = Math.floor((x0 - sx - 3) / SRC); ox <= Math.floor((x0 + span - sx + 3) / SRC); ox++) if (py + oy >= 0 && py + oy < n) need.push([ox, oy]);
  }
  return Promise.all(need.map(([ox, oy]) => tileCodes(url(px + ox, py + oy), shown))).then((got) => new Promise((ok) => queue({
    shown,
    fail: () => ok(null),
    run: () => {
      if (gone.aborted || !got.some(Boolean)) return ok(null);
      const from = new Map(need.map(([ox, oy], i) => [`${ox},${oy}`, got[i]]));
      let lx = null, ly = null, lt = null;
      const code = (x, y) => {
        const u = Math.round(x - sx), v = Math.round(y - sy), ox = Math.floor(u / SRC), oy = Math.floor(v / SRC);
        if (ox !== lx || oy !== ly) { lx = ox; ly = oy; lt = from.get(`${ox},${oy}`); }
        return lt ? lt[(v - oy * SRC) * SRC + (u - ox * SRC)] : 0;
      };
      let wet = false;
      for (let y = Math.floor(y0) - 2; y < y0 + span + 2 && !wet; y++) for (let x = Math.floor(x0) - 2; x < x0 + span + 2; x++) if (code(x, y)) { wet = true; break; }
      if (!wet) return ok(null);
      const img = new ImageData(256, 256);
      resample(img.data, 256, code, x0, y0, span, LOOK);
      if (cast) { const fade = 1 - 0.3 * Math.min(1, cast.lead / 120); for (let i = 3; i < img.data.length; i += 4) img.data[i] *= fade; }
      ok(img);
    },
  })));
}
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
// a round distance, the longest of 1, 2, 3, 5 or 10 to a power of ten no more than n
const round = (n) => { const p = 10 ** Math.floor(Math.log10(n)), d = n / p; return p * (d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1); };

/**
 * The radar, in `card` (#radar). time(t) formats a real UTC time (ms) as the place's own clock;
 * miles: show the scale in miles. Returns { place(lat, lon), refresh(), note(text) }.
 *
 * The map it's drawn on (mapgl.js, or mapleaf.js) is driven through: frames([{ draw(z, x, y, gone) } | { canvas,
 * bounds }]), show(k, opacity), box(bounds | null | undefined, opacity), dot(lat, lon), clear([{ x, y, w, h }]), view(lat, lon, smooth),
 * zoomBy(±1), explore(on), resize(), state() → { zoom, min, max, mpp }, on("move" | "tap", fn), and credit (its
 * sources' names). Zooms are 256-pixel tiles' (as Leaflet counts them).
 */
export function radar(card, { lat, lon, time, miles = false, credits = null, rainSoon = () => true }) {
  const q = (s) => card.querySelector(s);
  const el = q(".radar-map"), wrap = q(".radar-wrap"), play = q(".radar-play"), slider = q(".radar-slider"), label = q(".radar-time"), full = q(".radar-full");
  const status = q(".radar-status"), chip = q(".radar-chip"), hint = q(".radar-hint"), scale = q(".radar-scale"), legend = q(".radar-legend");
  let map = null, starting = null, credit = null, dry = null, told = false, frames = [], nowAt = 0, i = 0, timer = null, playing = false, fetched = 0, here = { lat, lon }, g = null;
  const touch = matchMedia("(pointer: coarse)").matches, calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the legend: one bar in the colours the radar's drawn in (rainmap.js ramp), light to extreme, then snow's
  const bar = (snow, from, to) => {
    const r = ramp(snow, LOOK.soft), stops = [];
    for (let d = from; d <= to; d += 2) { const q = (d + 10) * 16; stops.push(`rgba(${r[q]},${r[q + 1]},${r[q + 2]},${(r[q + 3] / 255).toFixed(2)}) ${(((d - from) / (to - from)) * 100).toFixed(1)}%`); }
    const i = document.createElement("i"); i.className = "rl-bar"; i.style.background = `linear-gradient(90deg, ${stops.join(", ")})`; return i;
  };
  const words = document.createElement("div"); words.className = "rl-words";
  for (const [text, dbz] of [["Light", 12], ["Heavy", 40], ["Extreme", 62]]) {
    const w = document.createElement("span"); w.textContent = text; w.style.left = `${((dbz - 8) / 56) * 100}%`;
    const x = LEGEND.reduce((a, l) => (Math.abs(l.dbz - dbz) < Math.abs(a.dbz - dbz) ? l : a));
    w.title = `About ${x.mmh < 1 ? x.mmh.toFixed(1) : Math.round(x.mmh)} mm an hour`; words.append(w);
  }
  const rain = document.createElement("div"); rain.className = "rl-rain"; rain.append(bar(false, 8, 64), words);
  const snowKey = document.createElement("div"); snowKey.className = "rl-snow"; snowKey.append(bar(true, 5, 45), Object.assign(document.createElement("span"), { textContent: "Snow" }));
  legend.replaceChildren(rain, snowKey);

  const show = (k) => {
    if (!frames.length) return;
    i = (k + frames.length) % frames.length;
    map.show(i, SHOW);
    const f = frames[i], mins = Math.round((f.t - Date.now()) / 60e3);
    slider.value = String(i);
    slider.style.setProperty("--f", String(i / Math.max(1, frames.length - 1)));
    const when = f.kind === "model" ? `in ${Math.max(0, mins)} min · forecast` : i === nowAt ? "latest radar" : ago(-mins);
    const b = document.createElement("b"), rel = document.createElement("span");
    b.textContent = time(f.t); rel.textContent = ` · ${when}`; rel.className = f.kind === "model" ? "rt-rel ahead" : "rt-rel";
    label.replaceChildren(b, rel);
    slider.setAttribute("aria-valuetext", `${time(f.t)} · ${when}`);
    chipTo(f.kind);
    map.box(undefined, f.kind === "model" ? 0.45 : 0);
  };
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
  const stop = () => { playing = false; clearTimeout(timer); play.setAttribute("aria-label", "Play"); play.dataset.on = "0"; };
  // playing: from now through the next two hours, again and again (the hours gone are a drag back; played from there,
  // it runs on through them too)
  const run = () => {
    playing = true; play.setAttribute("aria-label", "Pause"); play.dataset.on = "1";
    const from = i < nowAt ? 0 : nowAt;
    const next = () => { if (!playing) return; show(i >= frames.length - 1 ? from : i + 1); timer = setTimeout(next, i === frames.length - 1 ? HOLD : i === nowAt ? AT_NOW : STEP); };
    clearTimeout(timer); timer = setTimeout(next, i === nowAt ? AT_NOW : STEP);
  };
  // under the slider: where the radar ends and the forecast begins
  function drawScale() {
    scale.replaceChildren();
    if (frames.length < 2) return;
    const at = (k) => `${(k / (frames.length - 1)) * 100}%`, mark = (k, text, cls) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; s.style.left = at(k); scale.append(s); };
    slider.style.setProperty("--nowf", String(nowAt / (frames.length - 1)));
    const span = (t) => { const m = Math.round(Math.abs(t - Date.now()) / 60e3); return m >= 90 ? `${Math.round(m / 60)} h` : `${Math.round(m / 10) * 10} min`; };
    mark(0, `${span(frames[0].t)} ago`, "rs-l rs-start");
    mark(nowAt, "Now", "rs-l rs-now");
    if (frames.length - 1 > nowAt) mark(frames.length - 1, `+${span(frames[frames.length - 1].t)}`, "rs-l rs-end");
  }
  async function load() {
    g = grid(here.lat, here.lon);
    const rv = await framesNow().catch(() => null);
    const host = rv?.host, past = rv?.radar?.past || [];
    // the next two hours, always: the latest radar carried along its own track, every 10 minutes; where there's no
    // track to follow (no radar here, or too little rain to tell) but rain's about on the radar or expected here soon,
    // the models' rain on the grid instead (81 places' forecasts: not asked for to show a dry map); and where it's dry
    // all about, the latest radar as it is (nothing coming: no more to ask for)
    const drift = past.length >= 3 ? await driftAt(host, past, here.lat, here.lon).catch(() => null) : null;
    const last = past.length ? past[past.length - 1].time * 1000 : 0;
    const wetAbout = !drift && past.length ? !!(await squareAt(here.lat, here.lon, (x, y) => tileCodes(`${host}${past[past.length - 1].path}/${SRC}/${NATIVE - 1}/${x}/${y}/2/1_1.png`)).catch(() => null))?.some(Boolean) : false;
    const model = drift || (past.length && !rainSoon() && !wetAbout) ? null : await modelRain(g).catch(() => null);
    if (!past.length && !model) throw new Error("nothing");
    const held = !drift && !model && past.length > 0 && !rainSoon() && !wetAbout;
    const ahead = drift || held ? Array.from({ length: 12 }, (_, k) => last + (k + 1) * 600e3) : model ? model.times : [];
    const tl = timeline(past.map((f) => f.time * 1000), ahead);
    frames = tl.frames; nowAt = past.length ? tl.now : 0;
    const box = [[g.south, g.west], [g.north, g.east]];
    map.frames(frames.map((f, j) => {
      const shown = () => i === j, from = (k) => `${host}${past[k].path}/${SRC}`;
      if (f.kind === "radar") return { draw: (z, x, y, gone) => radarTile(from(f.k), null, { z, x, y }, shown, gone) };
      if (drift || held) return { draw: (z, x, y, gone) => radarTile(from(past.length - 1), { vx: drift?.vx ?? 0, vy: drift?.vy ?? 0, lead: (f.t - last) / 60e3 }, { z, x, y }, shown, gone) };
      return { canvas: canvasFor(g, model.rain[f.k], model.snow[f.k]), bounds: box };
    }));
    map.box(model ? box : null);
    // (nothing on the radar about here, and nothing coming: said on the map, so an empty map isn't a puzzle)
    dry.hidden = !held;
    credited([...map.credit, past.length ? "RainViewer" : "Open-Meteo"]);      // (the rest are in the credits)
    // (a line only when something's missing)
    status.textContent = !past.length ? "The radar isn't available right now: showing the forecast's rain." : !drift && !model && !held ? "The next two hours aren't available right now: showing the radar." : "";
    slider.max = String(frames.length - 1);
    fetched = Date.now();
    drawScale();
    show(nowAt);
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
      const [n, unit, m] = miles ? (most >= 1609.344 ? [round(most / 1609.344), "mi", 1609.344] : [round(most * 3.2808), "ft", 0.3048]) : most >= 1000 ? [round(most / 1000), "km", 1000] : [round(most), "m", 1];
      ruler.textContent = `${n} ${unit}`;
      ruler.style.width = `${Math.round((n * m) / s.mpp)}px`;
    };
    map.on("move", moved); moved();
    // the names step aside from all that's over the map (as from the place's dot), measured again once any of it, or
    // the map, has changed size (a little room round each; not every frame of the © folding away)
    const over = [top, ruler, credit, hint, chip];
    let settle = 0;
    const clear = () => {
      const b = el.getBoundingClientRect();
      map.clear(over.map((x) => x.getBoundingClientRect()).filter((r) => r.width && r.height)
        .map((r) => ({ x: r.left - b.left - 4, y: r.top - b.top - 4, w: r.width + 8, h: r.height + 8 })));
    };
    const sizes = new ResizeObserver(() => { clearTimeout(settle); settle = setTimeout(clear, 100); });
    for (const x of [el, ...over]) sizes.observe(x);
    credited([...map.credit, "RainViewer"]);
    setTimeout(() => { credit.classList.add("folded"); told = true; hint.hidden = !touch || card.classList.contains("radar-big"); }, 5000);
  }
  async function start() {
    try {
      const at = here;
      map = await mapIn(el, { lat: at.lat, lon: at.lon, zoom: VIEW, min: 3, max: CLOSEST, touch, calm });
      if (here !== at) { map.view(here.lat, here.lon); map.dot(here.lat, here.lon); }
      controls();
      // on a phone, the page scrolls past the map; a tap opens it full screen to explore
      map.on("tap", () => { if (touch && !card.classList.contains("radar-big")) grow(true); });
      await load();
      if (!calm) run();
    } catch (e) {
      status.textContent = "The radar isn't available right now.";
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
  slider.addEventListener("input", () => { stop(); show(Number(slider.value)); });
  full.addEventListener("click", () => grow(!card.classList.contains("radar-big")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && card.classList.contains("radar-big")) grow(false); });
  // the vector map's code fetched a screen ahead; the radar started once it's on screen, and paused while it's off it
  const near = new IntersectionObserver((es) => {
    if (!es.some((x) => x.isIntersecting)) return;
    near.disconnect();
    vectorLib().then((v) => v.able() && v.preload()).catch(() => {});
  }, { rootMargin: "100% 0px" });
  near.observe(card);
  const io = new IntersectionObserver((es) => {
    const vis = es.some((x) => x.isIntersecting);
    if (vis && !starting) starting = start();
    else if (vis && map && Date.now() - fetched > 10 * 60e3) load().catch(() => {});
    if (!vis && playing) stop();
  }, { rootMargin: "120px" });
  io.observe(card);
  return {
    place(lat2, lon2) {
      const moved = Math.abs(lat2 - here.lat) > 0.05 || Math.abs(lon2 - here.lon) > 0.05;
      here = { lat: lat2, lon: lon2 };
      if (!map) return;
      map.view(lat2, lon2); map.dot(lat2, lon2);
      if (moved) load().catch(() => {});        // (the forecast's grid goes with the place)
    },
    refresh() { if (map && Date.now() - fetched > 5 * 60e3) load().catch(() => {}); },
    note(text) { q(".radar-note").textContent = text || ""; },
  };
}
