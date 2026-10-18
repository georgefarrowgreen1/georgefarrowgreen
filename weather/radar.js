// The rain radar: the last two hours of radar, every ten minutes, from
// RainViewer's free mosaic of the world's weather radars, over OpenStreetMap's
// own map, turned dark to sit with the app (a filter in styles.css).
// RainViewer's free tiles go to zoom 7 (about a county across a tile), so
// closer in, they're enlarged.
//
// Leaflet (vendor/leaflet.js: 1.9.4, BSD-2-Clause, checked against npm's
// integrity hash) is loaded only when the card first comes into view.

const FRAMES = "https://api.rainviewer.com/public/weather-maps.json";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR_MAP = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ATTR_RADAR = 'Radar <a href="https://www.rainviewer.com/">RainViewer</a>';
const NATIVE = 7, SHOW = 0.78, STEP = 650, HOLD = 2000;

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

/**
 * The radar, in `card` (#radar): .radar-map, and the controls (play, a slider, the time, full screen).
 * time(t) formats a real UTC time (ms) as the place's own clock.
 * Returns { place(lat, lon), refresh() }.
 */
export function radar(card, { lat, lon, time }) {
  const el = card.querySelector(".radar-map"), play = card.querySelector(".radar-play"), slider = card.querySelector(".radar-slider");
  const label = card.querySelector(".radar-time"), full = card.querySelector(".radar-full"), status = card.querySelector(".radar-status");
  let L = null, map = null, dot = null, frames = [], layers = [], i = 0, timer = null, playing = false, fetched = 0, here = { lat, lon };
  const touch = matchMedia("(pointer: coarse)").matches;

  const show = (k) => {
    if (!layers.length) return;
    i = (k + layers.length) % layers.length;
    layers.forEach((l, j) => l.setOpacity(j === i ? SHOW : 0));
    slider.value = String(i);
    const t = frames[i].time * 1000, ago = Math.round((Date.now() - t) / 60e3);
    label.textContent = `${time(t)} · ${i === layers.length - 1 ? "latest" : `${ago} min ago`}`;
  };
  const stop = () => { playing = false; clearTimeout(timer); play.setAttribute("aria-label", "Play"); play.dataset.on = "0"; };
  const run = () => {
    playing = true; play.setAttribute("aria-label", "Pause"); play.dataset.on = "1";
    const next = () => { if (!playing) return; show(i + 1); timer = setTimeout(next, i === layers.length - 1 ? HOLD : STEP); };
    clearTimeout(timer); timer = setTimeout(next, STEP);
  };
  async function load() {
    const r = await fetch(FRAMES, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`radar ${r.status}`);
    const j = await r.json(), list = [...(j.radar?.past || []), ...(j.radar?.nowcast || [])];
    if (!list.length) throw new Error("no frames");
    layers.forEach((l) => map.removeLayer(l));
    frames = list;
    layers = list.map((f) => L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, zIndex: 300, maxNativeZoom: NATIVE, maxZoom: 10, attribution: ATTR_RADAR, crossOrigin: false }).addTo(map));
    slider.max = String(layers.length - 1);
    fetched = Date.now();
    show(layers.length - 1);
    status.textContent = "";
  }
  async function start() {
    try {
      L = await loadLeaflet();
      map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, dragging: !touch, tap: false, minZoom: 3, maxZoom: 10, zoomSnap: 1 }).setView([here.lat, here.lon], NATIVE);
      map.attributionControl.setPrefix(false);
      L.tileLayer(OSM, { maxZoom: 19, attribution: ATTR_MAP, className: "base-tiles" }).addTo(map);
      dot = L.circleMarker([here.lat, here.lon], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#3B8BE0", fillOpacity: 1, interactive: false }).addTo(map);
      await load();
      run();
    } catch (e) {
      status.textContent = "The radar isn't available right now.";
    }
  }
  play.addEventListener("click", () => (playing ? stop() : run()));
  slider.addEventListener("input", () => { stop(); show(Number(slider.value)); });
  full.addEventListener("click", () => {
    const on = !card.classList.contains("radar-big");
    card.classList.toggle("radar-big", on);
    document.body.classList.toggle("no-scroll", on);
    full.setAttribute("aria-label", on ? "Close full screen" : "Full screen");
    full.dataset.on = on ? "1" : "0";
    if (map) { map.invalidateSize(); if (touch) on ? map.dragging.enable() : map.dragging.disable(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && card.classList.contains("radar-big")) full.click(); });
  // start once it's on screen; pause while it's off it
  const io = new IntersectionObserver((es) => {
    const vis = es.some((x) => x.isIntersecting);
    if (vis && !map) start();
    else if (vis && map && Date.now() - fetched > 10 * 60e3) load().catch(() => {});
    if (!vis && playing) stop();
  }, { rootMargin: "120px" });
  io.observe(card);
  return {
    place(lat2, lon2) { here = { lat: lat2, lon: lon2 }; if (map) { map.setView([lat2, lon2], Math.min(map.getZoom(), 8)); dot.setLatLng([lat2, lon2]); } },
    refresh() { if (map && Date.now() - fetched > 5 * 60e3) load().catch(() => {}); },
  };
}
