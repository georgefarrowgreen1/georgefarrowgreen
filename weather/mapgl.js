// The radar's map, drawn by MapLibre GL JS (vendor/maplibre-gl*.mjs: 6.12.0, BSD-3-Clause, checked against npm's
// integrity hash) on the phone's graphics chip: OpenFreeMap's vector map in the app's own style (mapstyle.js), the
// radar's frames as layers under the place names, so the names read through the rain. A frame's tiles are drawn by
// radar.js as the map asks for them (rv://, an address of the app's own, handed to the frame's function). It needs
// WebGL 2; without it, mapleaf.js draws the radar on Leaflet instead. Same shape as that one: see radar.js.

import { mapStyle, ABOVE_RAIN } from "./mapstyle.js";

let ml = null;
const drawers = new Map();         // each frame's tiles, by its address: (z, x, y, signal) => Promise<ImageData | null>
let made = 0;

export function preload() {
  if (ml) return ml;
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "./vendor/maplibre-gl.css";
  const styled = new Promise((ok) => { css.onload = css.onerror = ok; });
  document.head.append(css);
  ml = Promise.all([import("./vendor/maplibre-gl.mjs"), styled]).then(([m]) => {
    // (the radar asks for its tiles in its own order, the frame on show first: radar.js)
    m.setMaxParallelImageRequests(256);
    m.addProtocol("rv", async ({ url }, abort) => {
      const [, id, z, x, y] = /^rv:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(url) || [];
      const draw = drawers.get(id);
      if (!draw) throw new Error("gone");
      const img = await draw(+z, +x, +y, abort.signal);
      // (a dry tile is nothing at all; one with rain, its pixels as they are)
      return { data: img && !abort.signal.aborted ? await createImageBitmap(img, { premultiplyAlpha: "premultiply" }) : null };
    });
    return m;
  });
  ml.catch(() => { ml = null; });
  return ml;
}

// WebGL 2, without keeping the context it's asked for
export function able() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch (_) { return false; }
}

// The map in `el`, at the place (zoom: in 256-pixel tiles' zooms, as Leaflet counts them; MapLibre's are a zoom
// below); touch: the page scrolls past it, until it's opened to explore; calm: no animation. (Each of the radar's
// 25 frames keeps its own tiles: only a screen's worth each once they're out of sight, as Leaflet keeps them.)
export async function glMap(el, { lat, lon, zoom, min, max, touch, calm }) {
  const m = await preload();
  const map = new m.Map({
    container: el, style: mapStyle(), center: [lon, lat], zoom: zoom - 1, minZoom: min - 1, maxZoom: max - 1,
    attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, rollEnabled: false,
    scrollZoom: false, dragPan: !touch, touchZoomRotate: !touch, boxZoom: false, fadeDuration: calm ? 0 : 200,
    maxTileCacheZoomLevels: 1, reduceMotion: calm, locale: { "Map.Title": "Rain radar map" },
  });
  map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation();
  // (a tile that doesn't come is just left out; the frames replaced as they're drawn say "gone")
  map.on("error", () => {});
  try {
    await new Promise((ok, no) => { map.once("style.load", ok); map.once("error", (e) => (map.style?._loaded ? null : no(e.error))); });
  } catch (e) { map.remove(); throw e; }
  // (shown once the country's in, or after a few seconds whatever's come: styles.css)
  const drawn = () => { el.classList.add("drawn"); map.off("sourcedata", check); };
  const check = (e) => { if (e.sourceId === "map" && map.isSourceLoaded("map")) drawn(); };
  map.on("sourcedata", check); setTimeout(drawn, 4000);

  const fade = calm ? 0 : 250, NONE = { type: "FeatureCollection", features: [] };
  map.addSource("box", { type: "geojson", data: NONE });
  map.addLayer({ id: "box", type: "line", source: "box", paint: { "line-color": "#ffffff", "line-width": 1, "line-dasharray": [4, 5], "line-opacity": 0, "line-opacity-transition": { duration: fade } } }, ABOVE_RAIN);
  // the place: a dot (styles.css), with room kept round it that names step aside from (above or below it), not under it
  const pin = document.createElement("div"); pin.className = "map-dot";
  const dot = new m.Marker({ element: pin }).setLngLat([lon, lat]).addTo(map);
  const spot = (la, lo) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lo, la] } });
  map.addImage("room", { width: 20, height: 20, data: new Uint8Array(20 * 20 * 4) });
  map.addSource("here", { type: "geojson", data: spot(lat, lon) });
  map.addLayer({ id: "here", type: "symbol", source: "here", layout: { "icon-image": "room", "icon-allow-overlap": true, "icon-ignore-placement": false } });

  // (the map's own canvas is the region a screen reader names, in place of its frame's)
  el.removeAttribute("role"); el.removeAttribute("aria-label");

  let layers = [], on = -1;
  const corners = ([[s, w], [n, e]]) => [[w, n], [e, n], [e, s], [w, s]];
  return {
    kind: "gl",
    credit: ["OpenFreeMap", "OpenMapTiles", "OpenStreetMap"],
    // the frames: { draw(z, x, y, signal) } drawn tile by tile, or { canvas, bounds } a picture over the place
    frames(list) {
      for (const id of layers) { map.removeLayer(id); map.removeSource(id); drawers.delete(id.slice(1)); }
      on = -1;
      layers = list.map((f) => {
        const n = String(++made), id = `f${n}`;
        if (f.draw) {
          drawers.set(n, f.draw);
          map.addSource(id, { type: "raster", tiles: [`rv://${n}/{z}/{x}/{y}`], tileSize: 256, maxzoom: max });
        } else map.addSource(id, { type: "canvas", canvas: f.canvas, coordinates: corners(f.bounds), animate: false });
        map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: fade, delay: 0 }, "raster-fade-duration": fade } }, ABOVE_RAIN);
        return id;
      });
    },
    show(k, opacity) {
      if (layers[on]) map.setPaintProperty(layers[on], "raster-opacity", 0);
      if (layers[k]) map.setPaintProperty(layers[k], "raster-opacity", opacity);
      on = k;
    },
    box(bounds, opacity = 0) {
      if (bounds !== undefined) {
        const r = bounds && corners(bounds);
        map.getSource("box").setData(r ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...r, r[0]] } } : NONE);
      }
      map.setPaintProperty("box", "line-opacity", opacity);
    },
    dot(la, lo) { dot.setLngLat([lo, la]); map.getSource("here").setData(spot(la, lo)); },
    view(la, lo, smooth = false) {
      const to = { center: [lo, la], zoom: zoom - 1 };
      smooth && !calm ? map.easeTo({ ...to, duration: 650 }) : map.jumpTo(to);
    },
    zoomBy(d) { map.easeTo({ zoom: Math.round(map.getZoom()) + d, duration: calm ? 0 : 300 }); },
    // full screen: dragged and pinched, and zoomed with a wheel
    explore(yes) {
      if (touch) for (const h of [map.dragPan, map.touchZoomRotate]) yes ? h.enable() : h.disable();
      yes ? map.scrollZoom.enable() : map.scrollZoom.disable();
    },
    resize() { map.resize(); },
    // where it is: its zoom (as Leaflet counts), the range, and how many metres a pixel spans at its middle
    state() {
      const z = map.getZoom() + 1, c = map.getCenter();
      return { zoom: z, min, max, mpp: (40075016.686 * Math.cos((c.lat * Math.PI) / 180)) / (256 * 2 ** z) };
    },
    on(type, fn) { map.on(type === "tap" ? "click" : type, () => fn()); },
  };
}
