// The rain radar: the last two hours of radar, every ten minutes, from
// RainViewer's free mosaic of the world's weather radars, then the next two
// hours as the weather models see them (Open-Meteo's 15-minute rain on a 9 × 9
// grid about 220 km across around the place, painted in the radar's own colours), over
// OpenStreetMap's map turned dark to sit with the app (a filter in styles.css).
// RainViewer's free tiles go to zoom 7 (about a county across a tile), so
// closer in, they're enlarged: smoothly, read back into reflectivity and
// blended (rainmap.js resample), rather than as squares.
//
// Leaflet (vendor/leaflet.js: 1.9.4, BSD-2-Clause, checked against npm's
// integrity hash) is loaded only when the card first comes into view.

import { grid, paint, timeline, LEGEND, hexFor, decode, resample, motion, ramp } from "./rainmap.js";

const FRAMES = "https://api.rainviewer.com/public/weather-maps.json";
const MODEL = "https://api.open-meteo.com/v1/forecast";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const NATIVE = 7, SHOW = 0.8, STEP = 600, HOLD = 1800, AT_NOW = 1200, PX = 200, MODEL_TTL = 15 * 60e3;
const CENTRE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';

let loading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!loading) loading = new Promise((ok, no) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "./vendor/leaflet.css"; document.head.append(css);
    const s = document.createElement("script"); s.src = "./vendor/leaflet.js"; s.onload = () => ok(window.L); s.onerror = () => { loading = null; no(new Error("map")); };
    document.head.append(s);
  });
  return loading;
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
  const out = { at: Date.now(), times: m0.time.map((t) => Date.parse(`${t}Z`)), rain: [], snow: [] };
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
  return c.toDataURL("image/png");
};
// A radar tile's pixels, read back into reflectivity once (a few hundred kept)
const codes = new Map();
function tileCodes(url) {
  if (codes.has(url)) return codes.get(url);
  const p = new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
        ok(decode(x.getImageData(0, 0, 256, 256).data));
      } catch (_) { ok(null); }
    };
    img.onerror = () => ok(null);
    img.src = url;
  });
  codes.set(url, p);
  if (codes.size > 400) codes.delete(codes.keys().next().value);
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
    try { jobs.splice(k, 1)[0].run(); } catch (_) { /* one tile's trouble mustn't stop the rest */ }
  }
  working = jobs.length > 0;
  if (working) setTimeout(work, 0);
}
function queue(job) { jobs.push(job); if (!working) { working = true; setTimeout(work, 0); } }
// The radar, smoothed: each tile drawn from the radar's own (zoom 7 at most). For the next two hours
// (cast: { vx, vy, lead }), the latest radar carried along its own track: drawn from where its rain was
// lead minutes before, vx, vy zoom-7 pixels a minute behind, and fading a little the further ahead it is.
function smoothRadar(L, base, look, opts, cast = null) {
  const Layer = L.GridLayer.extend({
    createTile(c, done) {
      const tile = document.createElement("canvas"); tile.width = tile.height = 256;
      const nz = Math.min(c.z, NATIVE), f = 2 ** (c.z - nz), span = 256 / f, n = 2 ** nz;
      const px = Math.floor(c.x / f), py = Math.floor(c.y / f), x0 = (c.x - px * f) * span, y0 = (c.y - py * f) * span;
      const url = (x, y) => `${base}/${nz}/${((x % n) + n) % n}/${y}/2/1_1.png`;
      const sx = cast ? (cast.vx * cast.lead) / 2 ** (NATIVE - nz) : 0, sy = cast ? (cast.vy * cast.lead) / 2 ** (NATIVE - nz) : 0;
      // the tiles its pixels come from: its own, and its neighbours' where the blend (or the track) reaches over
      const need = [];
      for (let oy = Math.floor((y0 - sy - 3) / 256); oy <= Math.floor((y0 + span - sy + 3) / 256); oy++) {
        for (let ox = Math.floor((x0 - sx - 3) / 256); ox <= Math.floor((x0 + span - sx + 3) / 256); ox++) if (py + oy >= 0 && py + oy < n) need.push([ox, oy]);
      }
      Promise.all(need.map(([ox, oy]) => tileCodes(url(px + ox, py + oy)))).then((got) => queue({
        shown: () => this.options.opacity > 0,
        run: () => {
          if (!this._map) return;          // (its frame was replaced: the radar reloaded)
          const from = new Map(need.map(([ox, oy], i) => [`${ox},${oy}`, got[i]]));
          // (gone already, scrolled away; or nothing to draw)
          if (got.some(Boolean) && tile.isConnected) {
            let lx = null, ly = null, lt = null;
            const code = (x, y) => {
              const u = Math.round(x - sx), v = Math.round(y - sy), ox = Math.floor(u / 256), oy = Math.floor(v / 256);
              if (ox !== lx || oy !== ly) { lx = ox; ly = oy; lt = from.get(`${ox},${oy}`); }
              return lt ? lt[(v - oy * 256) * 256 + (u - ox * 256)] : 0;
            };
            let wet = false;
            for (let y = Math.floor(y0) - 2; y < y0 + span + 2 && !wet; y++) for (let x = Math.floor(x0) - 2; x < x0 + span + 2; x++) if (code(x, y)) { wet = true; break; }
            if (wet) {
              const ctx = tile.getContext("2d"), img = ctx.createImageData(256, 256);
              resample(img.data, 256, code, x0, y0, span, look);
              if (cast) { const fade = 1 - 0.3 * Math.min(1, cast.lead / 120); for (let i = 3; i < img.data.length; i += 4) img.data[i] *= fade; }
              ctx.putImageData(img, 0, 0);
            }
          }
          done(null, tile);
        },
      }));
      return tile;
    },
  });
  return new Layer(opts);
}
const ago = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min ` : ""}ago` : `${min} min ago`);

/**
 * The radar, in `card` (#radar). time(t) formats a real UTC time (ms) as the place's own clock;
 * miles: show the scale in miles. Returns { place(lat, lon), refresh(), note(text) }.
 */
export function radar(card, { lat, lon, time, miles = false, credits = null }) {
  const q = (s) => card.querySelector(s);
  const el = q(".radar-map"), play = q(".radar-play"), slider = q(".radar-slider"), label = q(".radar-time"), full = q(".radar-full");
  const status = q(".radar-status"), chip = q(".radar-chip"), hint = q(".radar-hint"), scale = q(".radar-scale"), legend = q(".radar-legend");
  let L = null, map = null, dot = null, box = null, credit = null, frames = [], layers = [], nowAt = 0, i = 0, timer = null, playing = false, fetched = 0, here = { lat, lon }, g = null;
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
    if (!layers.length) return;
    i = (k + layers.length) % layers.length;
    layers.forEach((l, j) => l.setOpacity(j === i ? SHOW : 0));
    const f = frames[i], mins = Math.round((f.t - Date.now()) / 60e3);
    slider.value = String(i);
    slider.style.setProperty("--f", String(i / Math.max(1, layers.length - 1)));
    const when = f.kind === "model" ? `in ${Math.max(0, mins)} min · forecast` : i === nowAt ? "latest radar" : ago(-mins);
    const b = document.createElement("b"), rel = document.createElement("span");
    b.textContent = time(f.t); rel.textContent = ` · ${when}`; rel.className = f.kind === "model" ? "rt-rel ahead" : "rt-rel";
    label.replaceChildren(b, rel);
    slider.setAttribute("aria-valuetext", `${time(f.t)} · ${when}`);
    chip.textContent = f.kind === "model" ? "Forecast" : "Radar";
    chip.dataset.kind = f.kind;
    if (box) box.setStyle({ opacity: f.kind === "model" ? 0.45 : 0 });
  };
  const stop = () => { playing = false; clearTimeout(timer); play.setAttribute("aria-label", "Play"); play.dataset.on = "0"; };
  const run = () => {
    playing = true; play.setAttribute("aria-label", "Pause"); play.dataset.on = "1";
    const next = () => { if (!playing) return; show(i + 1); timer = setTimeout(next, i === layers.length - 1 ? HOLD : i === nowAt ? AT_NOW : STEP); };
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
  // How the rain here is moving, in zoom-7 pixels a minute, from the latest radar frame and the one 20 minutes
  // before (over the 3 × 3 tiles around the place, about 550 km across), or null with too little rain to tell
  async function driftOf(host, past) {
    const n = 2 ** NATIVE, la = (here.lat * Math.PI) / 180, cx = Math.floor(((here.lon + 180) / 360) * n);
    const cy = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
    const field = async (fr) => {
      const tiles = await Promise.all([-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => tileCodes(`${host}${fr.path}/256/${NATIVE}/${(((cx + dx) % n) + n) % n}/${cy + dy}/2/1_1.png`))));
      if (tiles.some((t) => !t)) return null;
      const out = new Uint8Array(768 * 768);
      tiles.forEach((t, k) => { const ox = (k % 3) * 256, oy = Math.floor(k / 3) * 256; for (let y = 0; y < 256; y++) out.set(t.subarray(y * 256, y * 256 + 256), (oy + y) * 768 + ox); });
      return out;
    };
    const a = past[past.length - 3], b = past[past.length - 1], mins = (b.time - a.time) / 60;
    const [A, B] = await Promise.all([field(a), field(b)]);
    const m = A && B && mins > 0 ? motion(A, B, 768, 768) : null;
    return m && m.score >= 0.35 ? { vx: m.dx / mins, vy: m.dy / mins } : null;
  }
  async function load() {
    g = grid(here.lat, here.lon);
    const rv = await fetch(FRAMES, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`radar ${r.status}`)))).catch(() => null);
    const host = rv?.host, past = rv ? [...(rv.radar?.past || []), ...(rv.radar?.nowcast || [])] : [];
    // the next two hours: the latest radar carried along its own track, every 10 minutes; where there's no
    // track to follow (no radar here, or too little rain to tell), the models' rain on the grid instead
    const drift = past.length >= 3 ? await driftOf(host, past).catch(() => null) : null;
    const last = past.length ? past[past.length - 1].time * 1000 : 0;
    const model = drift ? null : await modelRain(g).catch(() => null);
    if (!past.length && !model) throw new Error("nothing");
    layers.forEach((l) => map.removeLayer(l));
    const ahead = drift ? Array.from({ length: 12 }, (_, k) => last + (k + 1) * 600e3) : model ? model.times : [];
    const tl = timeline(past.map((f) => f.time * 1000), ahead);
    frames = tl.frames; nowAt = past.length ? tl.now : 0;
    const opt = { opacity: 0, zIndex: 300, maxZoom: 10, className: "rv-tiles" };
    layers = frames.map((f) => (f.kind === "radar" ? smoothRadar(L, `${host}${past[f.k].path}/256`, LOOK, opt)
      : drift ? smoothRadar(L, `${host}${past[past.length - 1].path}/256`, LOOK, opt, { vx: drift.vx, vy: drift.vy, lead: (f.t - last) / 60e3 })
      : L.imageOverlay(canvasFor(g, model.rain[f.k], model.snow[f.k]), [[g.south, g.west], [g.north, g.east]], { opacity: 0, interactive: false, className: "fc-frame" })).addTo(map));
    if (box) map.removeLayer(box);
    box = model ? L.rectangle([[g.south, g.west], [g.north, g.east]], { color: "#ffffff", weight: 1, dashArray: "4 5", fill: false, opacity: 0, interactive: false }).addTo(map) : null;
    credited(["OpenStreetMap", past.length ? "RainViewer" : "Open-Meteo"]);      // (the rest are in the credits)
    // (a line only when something's missing)
    status.textContent = !past.length ? "The radar isn't available right now: showing the forecast's rain." : !drift && !model ? "The next two hours aren't available right now: showing the radar." : "";
    slider.max = String(frames.length - 1);
    fetched = Date.now();
    drawScale();
    show(nowAt);
  }
  async function start() {
    try {
      L = await loadLeaflet();
      map = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: false, dragging: !touch, tap: false, minZoom: 3, maxZoom: 10, zoomSnap: 1 }).setView([here.lat, here.lon], NATIVE);
      L.tileLayer(OSM, { maxZoom: 19, className: "base-tiles" }).addTo(map);
      L.control.scale({ position: "bottomleft", metric: !miles, imperial: miles, maxWidth: 90 }).addTo(map);
      const Centre = L.Control.extend({ options: { position: "topleft" }, onAdd() {
        const b = L.DomUtil.create("button", "radar-centre leaflet-bar");
        b.type = "button"; b.title = b.ariaLabel = "Back to the place"; b.setAttribute("aria-label", "Back to the place"); b.innerHTML = CENTRE;
        L.DomEvent.disableClickPropagation(b); b.addEventListener("click", () => map.setView([here.lat, here.lon], NATIVE));
        return b;
      } });
      new Centre().addTo(map);
      // the map's credits: in full as it first appears, then folded into a © that opens all of them
      const Credit = L.Control.extend({ options: { position: "bottomright" }, onAdd() {
        const b = L.DomUtil.create("button", "radar-credit");
        b.type = "button"; b.innerHTML = '<span class="rc-c" aria-hidden="true">©</span><span class="rc-t" aria-hidden="true"></span>';
        L.DomEvent.disableClickPropagation(b); b.addEventListener("click", () => credits?.());
        return b;
      } });
      credit = new Credit().addTo(map).getContainer();
      credited(["OpenStreetMap", "RainViewer"]);
      setTimeout(() => credit.classList.add("folded"), 5000);
      dot = L.circleMarker([here.lat, here.lon], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#3B8BE0", fillOpacity: 1, interactive: false }).addTo(map);
      // on a phone, the page scrolls past the map; a tap opens it full screen to explore
      map.on("click", () => { if (touch && !card.classList.contains("radar-big")) big(true); });
      await load();
      if (!calm) run();
    } catch (e) {
      status.textContent = "The radar isn't available right now.";
    }
  }
  function credited(names) {
    if (!credit) return;
    credit.querySelector(".rc-t").textContent = ` ${names.join(", ")}`;
    credit.setAttribute("aria-label", `Map data © ${names.join(", ")}: all the credits`);
  }
  function big(on) {
    card.classList.toggle("radar-big", on);
    document.body.classList.toggle("no-scroll", on);
    full.setAttribute("aria-label", on ? "Close full screen" : "Full screen");
    full.dataset.on = on ? "1" : "0";
    hint.hidden = on || !touch;
    if (map) {
      map.invalidateSize();
      if (touch) on ? map.dragging.enable() : map.dragging.disable();
      on ? map.scrollWheelZoom.enable() : map.scrollWheelZoom.disable();
    }
  }
  hint.hidden = !touch;
  play.addEventListener("click", () => (playing ? stop() : run()));
  slider.addEventListener("input", () => { stop(); show(Number(slider.value)); });
  full.addEventListener("click", () => big(!card.classList.contains("radar-big")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && card.classList.contains("radar-big")) big(false); });
  // start once it's on screen; pause while it's off it
  const io = new IntersectionObserver((es) => {
    const vis = es.some((x) => x.isIntersecting);
    if (vis && !map) start();
    else if (vis && map && Date.now() - fetched > 10 * 60e3) load().catch(() => {});
    if (!vis && playing) stop();
  }, { rootMargin: "120px" });
  io.observe(card);
  return {
    place(lat2, lon2) {
      const moved = Math.abs(lat2 - here.lat) > 0.05 || Math.abs(lon2 - here.lon) > 0.05;
      here = { lat: lat2, lon: lon2 };
      if (!map) return;
      map.setView([lat2, lon2], NATIVE); dot.setLatLng([lat2, lon2]);
      if (moved) load().catch(() => {});        // the forecast's grid goes with the place
    },
    refresh() { if (map && Date.now() - fetched > 5 * 60e3) load().catch(() => {}); },
    note(text) { q(".radar-note").textContent = text || ""; },
  };
}
