// The radar's map where the phone can't draw the vector one (no WebGL 2: mapgl.js): Leaflet (vendor/leaflet.js:
// 1.9.4, BSD-2-Clause, checked against npm's integrity hash) over OpenStreetMap's own map, turned dark to sit with
// the app (a filter in styles.css). Same shape as mapgl.js: see radar.js.

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

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

export async function leafMap(el, { lat, lon, zoom, min, max, touch, calm, pin = null }) {
  const L = await loadLeaflet();
  const map = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, dragging: !touch, tap: false, minZoom: min, maxZoom: max, zoomSnap: 1, fadeAnimation: !calm, zoomAnimation: !calm })
    .setView([lat, lon], zoom);
  // (a map tile that doesn't come is asked for once more, a moment later: a phone's connection drops the odd one)
  L.tileLayer(OSM, { maxZoom: 19, className: "base-tiles" }).on("tileerror", ({ tile }) => {
    if (tile.dataset.again) return;
    tile.dataset.again = "1";
    setTimeout(() => { tile.src = `${tile.src}${tile.src.includes("?") ? "&" : "?"}again=1`; }, 1500);
  }).addTo(map);
  const dot = L.marker([lat, lon], { icon: L.divIcon({ className: "map-pin-at", html: pin || '<div class="map-pin"><span class="mp-dot"></span></div>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(map);
  // (areas over the radar, under the markers: areas())
  map.createPane("areas").style.zIndex = "450";
  let areas = null;
  // a frame drawn tile by tile: each tile's pixels from its function, once it's in place (none where it's dry)
  const Drawn = L.GridLayer.extend({
    createTile(c, done) {
      const tile = document.createElement("canvas"); tile.width = tile.height = 256;
      const gone = { get aborted() { return !tile.isConnected; } };
      this.options.draw(c.z, c.x, c.y, gone).then((img) => {
        if (!this._map) return;          // (its frame was replaced: the radar reloaded)
        if (img && tile.isConnected) img instanceof ImageData ? tile.getContext("2d").putImageData(img, 0, 0) : tile.getContext("2d").drawImage(img, 0, 0);
        done(null, tile);
      });
      return tile;
    },
  });
  // a canvas over the map, as its pictures are (the minutes between the frames: radar.js)
  const Canvas = L.ImageOverlay.extend({
    _initImage() {
      const el = this._image = this._url;
      L.DomUtil.addClass(el, "leaflet-image-layer");
      if (this._zoomAnimated) L.DomUtil.addClass(el, "leaflet-zoom-animated");
      if (this.options.className) L.DomUtil.addClass(el, this.options.className);
      el.onselectstart = L.Util.falseFn; el.onmousemove = L.Util.falseFn;
    },
  });
  let layers = [], box = null, on = -1, mix = null, mixAt = "", mixOf = null, was = null;
  const fields = new Map();
  return {
    kind: "leaflet",
    credit: ["OpenStreetMap"],
    frames(list) {
      layers.forEach((l) => map.removeLayer(l));
      on = -1;
      layers = list.map((f) => (f.draw ? new Drawn({ draw: f.draw, opacity: 0, zIndex: 300, maxZoom: max, className: "rv-tiles" })
        : L.imageOverlay(f.canvas.toDataURL("image/png"), f.bounds, { opacity: 0, interactive: false, className: "fc-frame" })).addTo(map));
    },
    show(k, opacity) {
      mix?.setOpacity(0);
      layers[on]?.setOpacity(0);
      layers[k]?.setOpacity(opacity);
      on = k;
    },
    // what's over the map now, faded away over what's drawn next (styles.css .rv-was)
    fadeOut() {
      if (!mix || !mixOf || calm) return;
      const snap = document.createElement("canvas"); snap.width = mixOf.width; snap.height = mixOf.height;
      snap.getContext("2d").drawImage(mixOf, 0, 0);
      if (was) map.removeLayer(was);
      was = new Canvas(snap, mix.getBounds(), { opacity: mix.options.opacity, interactive: false, className: "rv-was" }).addTo(map);
      const it = was;
      requestAnimationFrame(() => requestAnimationFrame(() => { it.setOpacity(0); setTimeout(() => { if (was === it) { map.removeLayer(it); was = null; } }, 400); }));
    },
    blend(canvas, bounds, opacity) {
      if (!canvas) { mix?.setOpacity(0); return; }
      const key = bounds.join();
      if (mix && mixOf !== canvas) { map.removeLayer(mix); mix = null; }
      if (!mix) { mix = new Canvas(canvas, bounds, { opacity: 0, interactive: false, className: "rv-mix" }).addTo(map); mixAt = key; mixOf = canvas; }
      else if (key !== mixAt) { mix.setBounds(L.latLngBounds(bounds)); mixAt = key; }
      layers[on]?.setOpacity(0);
      on = -1;
      mix.setOpacity(opacity);
    },
    // temperature or wind over the map, in place of the rain (radar.js, its layers); null: none
    field(canvas, bounds, opacity = 1, slot = "field") {
      let f = fields.get(slot);
      if (!canvas) { f?.layer.setOpacity(0); return; }
      const key = bounds.join();
      if (f && f.of !== canvas) { map.removeLayer(f.layer); f = null; }
      if (!f) { f = { layer: new Canvas(canvas, bounds, { opacity: 0, interactive: false, className: `rv-field rv-${slot}` }).addTo(map), at: key, of: canvas }; fields.set(slot, f); }
      else if (key !== f.at) { f.layer.setBounds(L.latLngBounds(bounds)); f.at = key; }
      if (slot === "fine") f.layer.bringToFront();
      f.layer.setOpacity(opacity);
    },
    bounds() { const b = map.getBounds(); return [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]; },
    box(bounds, opacity = 0) {
      if (bounds !== undefined) {
        if (box) map.removeLayer(box);
        box = bounds ? L.rectangle(bounds, { color: "#ffffff", weight: 1, dashArray: "4 5", fill: false, opacity: 0, interactive: false }).addTo(map) : null;
      }
      box?.setStyle({ opacity });
    },
    dot(la, lo) { dot.setLatLng([la, lo]); },
    marker(elm, la, lo) {
      L.DomEvent.disableClickPropagation(elm);
      const mk = L.marker([la, lo], { icon: L.divIcon({ className: "map-pin-at", html: elm, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(map);
      return { at: (a, b) => mk.setLatLng([a, b]), room() {}, remove: () => mk.remove() };
    },
    areas(list) {
      if (areas) map.removeLayer(areas);
      areas = L.layerGroup(list.map((a) => L.polygon(a.rings.map((r) => { const ring = []; for (let i = 0; i + 1 < r.length; i += 2) ring.push([r[i], r[i + 1]]); return ring; }),
        { pane: "areas", color: a.colour, weight: a.soon ? 1.8 : 1.6, opacity: 0.9, dashArray: a.soon ? "5 5" : null, fillColor: a.colour, fillOpacity: a.soon ? 0.05 : 0.13, interactive: false }))).addTo(map);
    },
    // (its names are in its pictures: nothing to keep clear)
    clear() {},
    view(la, lo, smooth = false) { map.setView([la, lo], zoom, { animate: smooth && !calm }); },
    zoomBy(d) { d > 0 ? map.zoomIn() : map.zoomOut(); },
    zoomTo(z) { map.setZoom(z); },
    explore(yes) {
      if (touch) yes ? map.dragging.enable() : map.dragging.disable();
      yes ? map.scrollWheelZoom.enable() : map.scrollWheelZoom.disable();
    },
    // (measured, then drawn to its new edges: measured mid-way through growing, it can leave gaps)
    resize() { map.invalidateSize({ animate: false }); map.fire("moveend"); },
    state() {
      const z = map.getZoom(), c = map.getCenter();
      return { zoom: z, min, max, mpp: (40075016.686 * Math.cos((c.lat * Math.PI) / 180)) / (256 * 2 ** z) };
    },
    on(type, fn) { map.on(type === "tap" ? "click" : type, (e) => fn(e?.latlng ? { lat: e.latlng.lat, lon: e.latlng.lng } : undefined)); },
  };
}
