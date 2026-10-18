// The rain radar: the last two hours of radar, every ten minutes, from
// RainViewer's free mosaic of the world's weather radars, then the next two
// hours as the weather models see them (Open-Meteo's 15-minute rain on a 9 × 9
// grid about 220 km across around the place, painted in the radar's own colours), over
// OpenStreetMap's map turned dark to sit with the app (a filter in styles.css).
// RainViewer's free tiles go to zoom 7 (about a county across a tile), so
// closer in, they're enlarged.
//
// Leaflet (vendor/leaflet.js: 1.9.4, BSD-2-Clause, checked against npm's
// integrity hash) is loaded only when the card first comes into view.

import { grid, paint, timeline, LEGEND, hexFor, decode, resample } from "./rainmap.js";

const FRAMES = "https://api.rainviewer.com/public/weather-maps.json";
const MODEL = "https://api.open-meteo.com/v1/forecast";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR_MAP = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ATTR_RADAR = '<a href="https://www.rainviewer.com/">RainViewer</a>';
const ATTR_MODEL = '<a href="https://open-meteo.com/">Open-Meteo</a>';
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
// (proposals: how the radar is drawn closer in than its tiles go)
const LOOK = new URLSearchParams(location.search).get("radarlook") || "smooth";
const LOOKS = { smooth: { edge: [0.22, 0.45], soft: 0.4 }, glow: { edge: [0.04, 0.6], soft: 2.5 } };
// The radar, smoothed: each tile drawn from the radar's own (zoom 7 at most), blended (rainmap.js resample)
function smoothRadar(L, base, look, opts) {
  const Layer = L.GridLayer.extend({
    createTile(c, done) {
      const tile = document.createElement("canvas"); tile.width = tile.height = 256;
      const nz = Math.min(c.z, NATIVE), f = 2 ** (c.z - nz), span = 256 / f, n = 2 ** nz;
      const px = Math.floor(c.x / f), py = Math.floor(c.y / f), x0 = (c.x - px * f) * span, y0 = (c.y - py * f) * span;
      const url = (x, y) => `${base}/${nz}/${((x % n) + n) % n}/${y}/2/1_1.png`;
      // its own pixels, and its neighbours' where the blend reaches over the edge
      const edge = { "-1": [x0 < 2, y0 < 2], 1: [x0 + span > 254, y0 + span > 254] }, need = [[0, 0]];
      for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
        if ((dx || dy) && (!dx || edge[dx][0]) && (!dy || edge[dy][1]) && py + dy >= 0 && py + dy < n) need.push([dx, dy]);
      }
      Promise.all(need.map(([dx, dy]) => tileCodes(url(px + dx, py + dy)))).then((got) => {
        const own = got[0], next = new Map(need.map(([dx, dy], i) => [dx * 3 + dy, got[i]]));
        if (own) {
          const code = (x, y) => {
            const dx = x < 0 ? -1 : x > 255 ? 1 : 0, dy = y < 0 ? -1 : y > 255 ? 1 : 0, t = dx || dy ? next.get(dx * 3 + dy) : own;
            return t ? t[(y - dy * 256) * 256 + (x - dx * 256)] : own[Math.min(255, Math.max(0, y)) * 256 + Math.min(255, Math.max(0, x))];
          };
          const ctx = tile.getContext("2d"), img = ctx.createImageData(256, 256);
          resample(img.data, 256, code, x0, y0, span, look);
          ctx.putImageData(img, 0, 0);
        }
        done(null, tile);
      });
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
export function radar(card, { lat, lon, time, miles = false }) {
  const q = (s) => card.querySelector(s);
  const el = q(".radar-map"), play = q(".radar-play"), slider = q(".radar-slider"), label = q(".radar-time"), full = q(".radar-full");
  const status = q(".radar-status"), chip = q(".radar-chip"), hint = q(".radar-hint"), scale = q(".radar-scale"), legend = q(".radar-legend");
  let L = null, map = null, dot = null, box = null, frames = [], layers = [], nowAt = 0, i = 0, timer = null, playing = false, fetched = 0, here = { lat, lon }, g = null;
  const touch = matchMedia("(pointer: coarse)").matches, calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the legend: the radar's colours, and what they mean
  legend.replaceChildren(...LEGEND.map((x) => {
    const s = document.createElement("span"), sw = document.createElement("i");
    sw.style.background = hexFor(x.dbz); s.append(sw, x.label);
    s.title = `About ${x.mmh < 1 ? x.mmh.toFixed(1) : Math.round(x.mmh)} mm an hour`;
    return s;
  }));
  const snowKey = document.createElement("span"), snowSw = document.createElement("i");
  snowSw.style.background = `linear-gradient(90deg, ${hexFor(10, true)}, ${hexFor(40, true)})`; snowKey.append(snowSw, "Snow"); legend.append(snowKey);

  const show = (k) => {
    if (!layers.length) return;
    i = (k + layers.length) % layers.length;
    layers.forEach((l, j) => l.setOpacity(j === i ? SHOW : 0));
    const f = frames[i], mins = Math.round((f.t - Date.now()) / 60e3);
    slider.value = String(i);
    slider.style.setProperty("--pct", `${(i / Math.max(1, layers.length - 1)) * 100}%`);
    slider.setAttribute("aria-valuetext", label.textContent = f.kind === "model" ? `${time(f.t)} · in ${Math.max(0, mins)} min · forecast` : i === nowAt ? `${time(f.t)} · latest radar` : `${time(f.t)} · ${ago(-mins)}`);
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
    const fut = document.createElement("i"); fut.className = "rs-future"; fut.style.left = at(nowAt); fut.style.right = "0"; scale.append(fut);
    const span = (t) => { const m = Math.round(Math.abs(t - Date.now()) / 60e3); return m >= 90 ? `${Math.round(m / 60)} h` : `${Math.round(m / 10) * 10} min`; };
    mark(0, `${span(frames[0].t)} ago`, "rs-l rs-start");
    mark(nowAt, "Now", "rs-l rs-now");
    if (frames.length - 1 > nowAt) mark(frames.length - 1, `+${span(frames[frames.length - 1].t)}`, "rs-l rs-end");
  }
  async function load() {
    g = grid(here.lat, here.lon);
    const [rv, fc] = await Promise.allSettled([
      fetch(FRAMES, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`radar ${r.status}`)))),
      modelRain(g),
    ]);
    const past = rv.status === "fulfilled" ? [...(rv.value.radar?.past || []), ...(rv.value.radar?.nowcast || [])] : [];
    const model = fc.status === "fulfilled" ? fc.value : null;
    if (!past.length && !model) throw new Error("nothing");
    layers.forEach((l) => map.removeLayer(l));
    const tl = timeline(past.map((f) => f.time * 1000), model ? model.times : []);
    frames = tl.frames; nowAt = past.length ? tl.now : 0;
    layers = frames.map((f) => (f.kind === "radar"
      ? (LOOKS[LOOK] ? smoothRadar(L, `${rv.value.host}${past[f.k].path}/256`, LOOKS[LOOK], { opacity: 0, zIndex: 300, maxZoom: 10, attribution: ATTR_RADAR, className: "rv-tiles" })
        : L.tileLayer(`${rv.value.host}${past[f.k].path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, zIndex: 300, maxNativeZoom: NATIVE, maxZoom: 10, attribution: ATTR_RADAR, className: `rv-tiles rv-${LOOK}` }))
      : L.imageOverlay(canvasFor(g, model.rain[f.k], model.snow[f.k]), [[g.south, g.west], [g.north, g.east]], { opacity: 0, interactive: false, className: "fc-frame", attribution: ATTR_MODEL })).addTo(map));
    if (box) map.removeLayer(box);
    box = L.rectangle([[g.south, g.west], [g.north, g.east]], { color: "#ffffff", weight: 1, dashArray: "4 5", fill: false, opacity: 0, interactive: false }).addTo(map);
    slider.max = String(frames.length - 1);
    fetched = Date.now();
    drawScale();
    show(nowAt);
    status.textContent = !past.length ? "The radar isn't available right now: showing the forecast's rain." : !model ? "The forecast's next two hours aren't available right now: showing the radar." : "";
  }
  async function start() {
    try {
      L = await loadLeaflet();
      map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, dragging: !touch, tap: false, minZoom: 3, maxZoom: 10, zoomSnap: 1 }).setView([here.lat, here.lon], NATIVE);
      map.attributionControl.setPrefix(false);
      L.tileLayer(OSM, { maxZoom: 19, attribution: ATTR_MAP, className: "base-tiles" }).addTo(map);
      L.control.scale({ position: "bottomleft", metric: !miles, imperial: miles, maxWidth: 90 }).addTo(map);
      const Centre = L.Control.extend({ options: { position: "topleft" }, onAdd() {
        const b = L.DomUtil.create("button", "radar-centre leaflet-bar");
        b.type = "button"; b.title = b.ariaLabel = "Back to the place"; b.setAttribute("aria-label", "Back to the place"); b.innerHTML = CENTRE;
        L.DomEvent.disableClickPropagation(b); b.addEventListener("click", () => map.setView([here.lat, here.lon], NATIVE));
        return b;
      } });
      new Centre().addTo(map);
      dot = L.circleMarker([here.lat, here.lon], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#3B8BE0", fillOpacity: 1, interactive: false }).addTo(map);
      // on a phone, the page scrolls past the map; a tap opens it full screen to explore
      map.on("click", () => { if (touch && !card.classList.contains("radar-big")) big(true); });
      await load();
      if (!calm) run();
    } catch (e) {
      status.textContent = "The radar isn't available right now.";
    }
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
