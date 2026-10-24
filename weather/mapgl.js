// The radar's map, drawn by MapLibre GL JS (vendor/maplibre-gl*.mjs: 6.12.0, BSD-3-Clause, checked against npm's
// integrity hash) on the phone's graphics chip: OpenFreeMap's vector map in the app's own style (mapstyle.js), the
// radar's frames as layers under the place names, so the names read through the rain. A frame's tiles are drawn by
// radar.js as the map asks for them (rv://, an address of the app's own, handed to the frame's function). It needs
// WebGL 2; without it, mapleaf.js draws the radar on Leaflet instead. Same shape as that one: see radar.js.

import { mapStyle, ABOVE_RAIN, boxColour } from "./mapstyle.js";

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

// WebGL 2, without keeping the context it's asked for (asked once: making a context is a long moment's work)
let canGl;
export function able() {
  if (canGl !== undefined) return canGl;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return (canGl = !!gl);
  } catch (_) { return (canGl = false); }
}

// The map in `el`, at the place (zoom: in 256-pixel tiles' zooms, as Leaflet counts them; MapLibre's are a zoom
// below); touch: the page scrolls past it, until it's opened to explore; calm: no animation; light: the day style
// (mapstyle.js); pin: the element that marks the place (radar.js). (Each of the radar's
// 25 frames keeps its own tiles: only a screen's worth each once they're out of sight, as Leaflet keeps them.)
export async function glMap(el, { lat, lon, zoom, min, max, touch, calm, light = false, pin = null }) {
  const m = await preload();
  const map = new m.Map({
    container: el, style: mapStyle(light), center: [lon, lat], zoom: zoom - 1, minZoom: min - 1, maxZoom: max - 1,
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
  map.addLayer({ id: "box", type: "line", source: "box", paint: { "line-color": boxColour(light), "line-width": 1, "line-dasharray": [4, 5], "line-opacity": 0, "line-opacity-transition": { duration: fade } } }, ABOVE_RAIN);
  // areas drawn over it (official warnings: areas()), each in its colour, under the names and over the radar's and the
  // models' pictures (put in under them: UNDER)
  map.addSource("areas", { type: "geojson", data: NONE });
  // (one still to come: hardly filled, and dashed)
  map.addLayer({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": ["get", "colour"], "fill-opacity": ["case", ["get", "soon"], 0.05, light ? 0.16 : 0.13] } }, ABOVE_RAIN);
  map.addLayer({ id: "areas-line", type: "line", source: "areas", filter: ["!", ["get", "soon"]], paint: { "line-color": ["get", "colour"], "line-width": 1.6, "line-opacity": 0.9 } }, ABOVE_RAIN);
  map.addLayer({ id: "areas-soon", type: "line", source: "areas", filter: ["get", "soon"], paint: { "line-color": ["get", "colour"], "line-width": 1.8, "line-opacity": 0.95, "line-dasharray": [2, 2] } }, ABOVE_RAIN);
  const UNDER = "areas-fill";
  // the place: its bubble (radar.js; else a dot), with room kept round it that names step aside from: the bubble
  // above it and its name below
  const mark = pin || Object.assign(document.createElement("div"), { className: "map-pin" });
  const dot = new m.Marker({ element: mark, anchor: "center" }).setLngLat([lon, lat]).addTo(map);
  const spot = (la, lo) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lo, la] } });
  map.addImage("room", { width: 64, height: 136, data: new Uint8Array(64 * 136 * 4) });
  map.addSource("here", { type: "geojson", data: spot(lat, lon) });
  map.addLayer({ id: "here", type: "symbol", source: "here", layout: { "icon-image": "room", "icon-allow-overlap": true, "icon-ignore-placement": false } });
  // (and as wide as its name where the name is, just under the dot: room(); not beside the bubble, which is narrower)
  let roomW = 64;
  map.addImage("nameroom", { width: roomW, height: 20, data: new Uint8Array(roomW * 20 * 4) });
  map.addLayer({ id: "here-name", type: "symbol", source: "here", layout: { "icon-image": "nameroom", "icon-offset": [0, 16], "icon-allow-overlap": true, "icon-ignore-placement": false } });
  // and room kept the same way where the map's own controls are over it (radar.js), so no name is half under one: each
  // a clear picture its size (to the next 8 pixels), at the point under its middle, put back there as the map moves
  let rooms = [];
  map.addSource("clear", { type: "geojson", data: NONE });
  map.addLayer({ id: "clear", type: "symbol", source: "clear", layout: { "icon-image": ["get", "room"], "icon-allow-overlap": true, "icon-ignore-placement": false } });
  const keep = () => map.getSource("clear").setData({ type: "FeatureCollection", features: rooms.map((r) => {
    const at = map.unproject([r.x + r.w / 2, r.y + r.h / 2]);
    return { type: "Feature", properties: { room: r.id }, geometry: { type: "Point", coordinates: [at.lng, at.lat] } };
  }) });
  map.on("move", keep);
  // and room kept the same way about the markers radar.js puts on it (the other saved places: marker()), each as big as
  // it says, so the map's own names don't print over theirs
  const marks = new Map();
  let markN = 0;
  map.addSource("marks", { type: "geojson", data: NONE });
  map.addLayer({ id: "marks", type: "symbol", source: "marks", layout: { "icon-image": ["get", "room"], "icon-offset": ["get", "off"], "icon-allow-overlap": true, "icon-ignore-placement": false } });
  const markRooms = () => map.getSource("marks").setData({ type: "FeatureCollection", features: [...marks.values()].filter((x) => x.room).map((x) => ({ type: "Feature", properties: { room: x.room, off: [0, x.dy] }, geometry: { type: "Point", coordinates: [x.lon, x.lat] } })) });

  // (the map's own canvas is the region a screen reader names, in place of its frame's)
  el.removeAttribute("role"); el.removeAttribute("aria-label");

  let layers = [], on = -1, mix = null, mixAt = "", mixOf = null, mixCorners = null, was = null, wasFade = 0, flow = null, flowAt = "";
  // (the fields' layers, by slot: "field", the region's; "fine", a finer one about the place over it)
  const fields = new Map();
  const corners = ([[s, w], [n, e]]) => [[w, n], [e, n], [e, s], [w, s]];
  // (a layer's opacity, at once, or faded to it over a quarter of a second)
  const INSTANT = { duration: 0, delay: 0 }, GENTLY = { duration: calm ? 0 : 260, delay: 0 }, SLOWLY = { duration: calm ? 0 : 400, delay: 0 };
  // (each told only when it changes: not again every frame the radar plays)
  const told = new Map();
  // (soft: faded; "slow", over a little longer)
  const opacity = (id, v, soft = false) => {
    const was = told.get(id);
    if (was && was[0] === v && was[1] === soft) return;
    told.set(id, [v, soft]);
    map.setPaintProperty(id, "raster-opacity-transition", soft === "slow" ? SLOWLY : soft ? GENTLY : INSTANT); map.setPaintProperty(id, "raster-opacity", v);
  };
  const unmix = (soft = false) => { if (mix) opacity("mix", 0, soft); };
  // the picture over the map as it is, kept a moment on top of what comes next and faded away (blend draws over the
  // one canvas: so it's copied first)
  const wasCanvas = document.createElement("canvas");
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
        map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 0, delay: 0 }, "raster-fade-duration": fade } }, UNDER);
        return id;
      });
    },
    // (soft: faded from the one to the other, as another layer's chosen or the rain's back)
    show(k, value, soft = false) {
      unmix(soft);
      if (layers[on]) opacity(layers[on], 0, soft);
      if (layers[k]) opacity(layers[k], value, soft);
      on = k;
    },
    // what's over the map now, faded away over what's drawn next
    fadeOut() {
      if (!mix || !mixOf || !mixCorners || calm) return;
      wasCanvas.width = mixOf.width; wasCanvas.height = mixOf.height;
      wasCanvas.getContext("2d").drawImage(mixOf, 0, 0);
      if (!was) {
        map.addSource("was", { type: "canvas", canvas: wasCanvas, coordinates: mixCorners, animate: false });
        map.addLayer({ id: "was", type: "raster", source: "was", paint: { "raster-opacity": 0, "raster-opacity-transition": INSTANT, "raster-fade-duration": 0 } }, UNDER);
        was = map.getSource("was");
      } else was.setCoordinates(mixCorners);
      was.play(); was.pause();
      opacity("was", map.getPaintProperty("mix", "raster-opacity") ?? 0);
      // (on the next frame, once it's shown as it was: faded from there)
      cancelAnimationFrame(wasFade);
      wasFade = requestAnimationFrame(() => requestAnimationFrame(() => opacity("was", 0, true)));
    },
    // a picture over bounds in place of the frames (the minutes between them: radar.js), drawn again as it changes;
    // null: none
    // (fade: the frame shown before it faded away under it, not cut; soft: it fades in itself, the rain back again)
    blend(canvas, bounds, value, fade = false, soft = false) {
      if (!canvas) return unmix(soft);
      const c = corners(bounds), key = c.join();
      mixCorners = c;
      // (a picture on another canvas: its layer made again for it)
      if (mix && mixOf !== canvas) { map.removeLayer("mix"); map.removeSource("mix"); mix = null; }
      if (!mix) {
        told.delete("mix");
        map.addSource("mix", { type: "canvas", canvas, coordinates: c, animate: false });
        map.addLayer({ id: "mix", type: "raster", source: "mix", paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 0, delay: 0 }, "raster-fade-duration": 0 } }, UNDER);
        mix = map.getSource("mix"); mixAt = key; mixOf = canvas;
      } else if (key !== mixAt) { mix.setCoordinates(c); mixAt = key; }
      // (its picture sent on to the screen: pausing it uploads it)
      mix.play(); mix.pause(); map.triggerRepaint();
      if (layers[on]) opacity(layers[on], 0, fade || soft);
      on = -1;
      opacity("mix", value, soft);
    },
    // temperature or wind over the map, in place of the rain (radar.js, its layers): a picture over bounds, drawn again
    // as it changes; null: none
    // (slot: "field", or "fine", a finer picture about the place, over it; put away, it fades, as it came)
    field(canvas, bounds, value = 1, slot = "field") {
      let f = fields.get(slot);
      if (!canvas) { if (f) opacity(slot, 0, true); return; }
      const c = corners(bounds), key = c.join();
      if (f && f.of !== canvas) { map.removeLayer(slot); map.removeSource(slot); f = null; }
      if (!f) {
        told.delete(slot);
        map.addSource(slot, { type: "canvas", canvas, coordinates: c, animate: false });
        map.addLayer({ id: slot, type: "raster", source: slot, paint: { "raster-opacity": 0, "raster-opacity-transition": INSTANT, "raster-fade-duration": 0, "raster-resampling": "linear" } }, UNDER);
        // (the finer over the region's)
        if (slot === "field" && map.getLayer("fine")) map.moveLayer("fine", UNDER);
        f = { src: map.getSource(slot), at: key, of: canvas }; fields.set(slot, f);
      } else if (key !== f.at) { f.src.setCoordinates(c); f.at = key; }
      f.src.play(); f.src.pause(); map.triggerRepaint();
      opacity(slot, value, true);
    },
    // the wind's flow: a picture of what's in sight, drawn into the map under its names as it changes (null: none);
    // faded in as it starts and out as it's put away, rather than there and gone
    flow(canvas, bounds) {
      if (!canvas) { if (flow) opacity("flow", 0, "slow"); return; }
      const c = corners(bounds), key = c.join();
      if (!flow) {
        map.addSource("flow", { type: "canvas", canvas, coordinates: c, animate: false });
        map.addLayer({ id: "flow", type: "raster", source: "flow", paint: { "raster-opacity": 0, "raster-opacity-transition": INSTANT, "raster-fade-duration": 0, "raster-resampling": "linear" } }, ABOVE_RAIN);
        flow = map.getSource("flow"); flowAt = key;
      } else if (key !== flowAt) { flow.setCoordinates(c); flowAt = key; }
      flow.play(); flow.pause(); map.triggerRepaint();
      opacity("flow", 1, "slow");
    },
    // room kept under the place's bubble, where its name is, that names step aside from: as wide as the name
    room(w) {
      const W = Math.max(64, Math.ceil((w + 12) / 8) * 8);
      if (W === roomW) return;
      roomW = W;
      map.removeImage("nameroom"); map.addImage("nameroom", { width: W, height: 20, data: new Uint8Array(W * 20 * 4) });
    },
    box(bounds, opacity = 0) {
      if (bounds !== undefined) {
        const r = bounds && corners(bounds);
        map.getSource("box").setData(r ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...r, r[0]] } } : NONE);
      }
      map.setPaintProperty("box", "line-opacity", opacity);
    },
    dot(la, lo) { dot.setLngLat([lo, la]); map.getSource("here").setData(spot(la, lo)); },
    // an element of radar.js's own at a place (another saved place, a reading): → { at(lat, lon), remove() }
    // (room: the space it takes, w × h pixels, its middle dy below the place, kept clear of the map's own names)
    marker(elm, la, lo) {
      const mk = new m.Marker({ element: elm, anchor: "center" }).setLngLat([lo, la]).addTo(map), id = ++markN;
      marks.set(id, { lat: la, lon: lo, room: null, dy: 0 });
      return {
        at: (a, b) => { mk.setLngLat([b, a]); Object.assign(marks.get(id) || {}, { lat: a, lon: b }); markRooms(); },
        room: (w, h, dy = 0) => {
          const W = Math.ceil(w / 8) * 8, H = Math.ceil(h / 8) * 8, room = `room-${W}x${H}`;
          if (!map.hasImage(room)) map.addImage(room, { width: W, height: H, data: new Uint8Array(W * H * 4) });
          Object.assign(marks.get(id) || {}, { room, dy }); markRooms();
        },
        remove: () => { mk.remove(); marks.delete(id); markRooms(); },
      };
    },
    // areas: [{ rings: [[lat, lon, lat, lon, …], …], colour, soon (not in force yet) }]
    areas(list) {
      map.getSource("areas").setData({ type: "FeatureCollection", features: list.map((a) => ({ type: "Feature", properties: { colour: a.colour, soon: !!a.soon },
        geometry: { type: "MultiPolygon", coordinates: a.rings.map((r) => { const ring = []; for (let i = 0; i + 1 < r.length; i += 2) ring.push([r[i + 1], r[i]]); return [ring]; }) } })) });
    },
    // the names kept clear of these: [{ x, y, w, h }], pixels from the map's top left
    clear(rects) {
      rooms = rects.map(({ x, y, w, h }) => {
        const W = Math.ceil(w / 8) * 8, H = Math.ceil(h / 8) * 8, id = `room-${W}x${H}`;
        if (!map.hasImage(id)) map.addImage(id, { width: W, height: H, data: new Uint8Array(W * H * 4) });
        return { x, y, w, h, id };
      });
      keep();
    },
    view(la, lo, smooth = false) {
      const to = { center: [lo, la], zoom: zoom - 1 };
      smooth && !calm ? map.easeTo({ ...to, duration: 650 }) : map.jumpTo(to);
    },
    zoomBy(d) { map.easeTo({ zoom: Math.round(map.getZoom()) + d, duration: calm ? 0 : 300 }); },
    zoomTo(z) { map.easeTo({ zoom: z - 1, duration: calm ? 0 : 600 }); },
    // full screen: dragged and pinched, and zoomed with a wheel
    explore(yes) {
      if (touch) for (const h of [map.dragPan, map.touchZoomRotate]) yes ? h.enable() : h.disable();
      yes ? map.scrollZoom.enable() : map.scrollZoom.disable();
    },
    resize() { map.resize(); },
    // what's in sight: [[south, west], [north, east]]
    bounds() { const b = map.getBounds(); return [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]; },
    // where it is: its zoom (as Leaflet counts), the range, and how many metres a pixel spans at its middle
    state() {
      const z = map.getZoom() + 1, c = map.getCenter();
      return { zoom: z, min, max, mpp: (40075016.686 * Math.cos((c.lat * Math.PI) / 180)) / (256 * 2 ** z) };
    },
    // (a tap says where: { lat, lon })
    on(type, fn) { map.on(type === "tap" ? "click" : type, (e) => fn(e?.lngLat ? { lat: e.lngLat.lat, lon: e.lngLat.lng } : undefined)); },
  };
}
