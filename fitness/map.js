// A route on a real map: MapLibre GL JS (Weather's copy, weather/vendor: 6.12.0, BSD-3-Clause) drawing OpenFreeMap's
// vector map in Fitness's own style (mapstyle.js), the route over it, coloured as it was ridden (each stretch its power
// zone), in a white edge, with where it began and ended, and a marker that follows the ride's chart. It needs WebGL 2;
// without it, the app keeps its own drawing of the route (charts.js route).

import { routeStyle } from "./mapstyle.js";

let ml = null;
function load() {
  if (ml) return ml;
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = new URL("../weather/vendor/maplibre-gl.css", import.meta.url).href;
  const styled = new Promise((ok) => { css.onload = css.onerror = ok; });
  document.head.append(css);
  ml = Promise.all([import("../weather/vendor/maplibre-gl.mjs"), styled]).then(([m]) => m);
  ml.catch(() => { ml = null; });
  return ml;
}

let canGl;
export function able() {
  if (canGl !== undefined) return canGl;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return (canGl = !!gl);
  } catch (_) { return (canGl = false); }
}

// the line's colours along it: one every few hundredths of the way, by distance (each sample the colour of the point
// there), so each zone's stretch is its own colour
function gradient(coords, colours) {
  if (!colours) return null;
  const d = [0];
  for (let i = 1; i < coords.length; i++) { const [a, b] = [coords[i - 1], coords[i]], k = Math.cos((b[1] * Math.PI) / 180); d.push(d[i - 1] + Math.hypot((b[0] - a[0]) * k, b[1] - a[1])); }
  const total = d.at(-1) || 1, N = 240, stops = [];
  for (let k = 0, j = 0; k <= N; k++) { const at = (k / N) * total; while (j < d.length - 1 && d[j + 1] <= at) j++; stops.push(k / N, colours[j]); }
  return ["interpolate", ["linear"], ["line-progress"], ...stops];
}

// Every map made: one whose place has left the page (another activity picked, a sheet closed, the screen drawn again)
// is let go, its WebGL context with it, before the next is made, and when sweep() is asked (a browser keeps only so many)
const live = new Set();
export function sweep() { for (const g of live) if (!g.el.isConnected) g.remove(); }

// The map in `el`: coords [[lon, lat], ...]; colours, one a point (or none: the app's blue); light: the day style;
// explore: the map can be moved and zoomed (else the page scrolls past it). → { at([lon, lat] | null), remove() }
export async function routeMap(el, { coords, colours = null, light = true, explore = false, tint = "#0a84ff" }) {
  const m = await load();
  sweep();
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of coords) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const map = new m.Map({
    container: el, style: routeStyle(light), bounds: [[w, s], [e, n]], fitBoundsOptions: { padding: explore ? 60 : 34, maxZoom: 16 },
    attributionControl: false, interactive: explore, dragRotate: false, pitchWithRotate: false, touchPitch: false, rollEnabled: false,
    boxZoom: false, keyboard: explore, cooperativeGestures: false, maxZoom: 18, fadeDuration: 150, locale: { "Map.Title": "The route on a map" },
  });
  if (explore) { map.touchZoomRotate.disableRotation(); }
  map.on("error", () => {});
  const grad = gradient(coords, colours);
  // (a loop, back where it began: the start alone, not the end over it)
  const [a, b] = [coords[0], coords.at(-1)], apart = Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 111e3;
  const ends = { type: "FeatureCollection", features: [{ type: "Feature", properties: { k: "start" }, geometry: { type: "Point", coordinates: a } },
    ...(apart > 60 ? [{ type: "Feature", properties: { k: "end" }, geometry: { type: "Point", coordinates: b } }] : [])] };
  const none = { type: "FeatureCollection", features: [] };
  const ready = new Promise((ok) => map.on("load", () => {
    map.addSource("route", { type: "geojson", lineMetrics: true, data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
    map.addSource("ends", { type: "geojson", data: ends });
    map.addSource("here", { type: "geojson", data: none });
    const width = (k) => ["interpolate", ["linear"], ["zoom"], 8, 3 * k, 13, 5 * k, 17, 9 * k];
    map.addLayer({ id: "route-shadow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "rgba(0, 0, 0, 0.22)", "line-width": width(2.2), "line-blur": 4, "line-translate": [0, 2] } });
    map.addLayer({ id: "route-edge", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": width(1.75) } });
    map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": width(1.1), ...(grad ? { "line-gradient": grad } : { "line-color": tint }) } });
    map.addLayer({ id: "ends", type: "circle", source: "ends", paint: { "circle-radius": 7, "circle-color": ["match", ["get", "k"], "start", "#30d158", "#ff453a"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
    map.addLayer({ id: "here-halo", type: "circle", source: "here", paint: { "circle-radius": 14, "circle-color": tint, "circle-opacity": 0.22 } });
    map.addLayer({ id: "here", type: "circle", source: "here", paint: { "circle-radius": 7, "circle-color": tint, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
    ok();
  }));
  const g = {
    map, el,
    async at(p) { await ready; map.getSource("here")?.setData(p ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } } : none); },
    remove() { if (!live.delete(g)) return; try { map.remove(); } catch (_) {} },
  };
  live.add(g);
  return g;
}
