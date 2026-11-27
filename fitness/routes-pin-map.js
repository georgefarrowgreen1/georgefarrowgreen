// The editable map owns its camera and markers. The planner owns the itinerary
// and supplies only geometry returned by the routing service.
import { able, loadMapLibre } from './map.js';
import { routeStyle } from './mapstyle.js';

const COURSE = 'fitness-pin-course';
const SNAPS = 'fitness-pin-snaps';
const UK = [[-8.5, 49.6], [2.1, 61.1]];
const unavailable = 'Street map unavailable. You can still enter coordinates.';

function routeData(coords) {
  if (!Array.isArray(coords) || coords.length < 2 || !coords.every(validPoint)) return { type: 'FeatureCollection', features: [] };
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(([lng, lat]) => [lng, lat]) } };
}

function validPoint(p) {
  return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}
function snapData({ start, pins, snaps }) {
  const features = [];
  if (start && snaps?.length) [start, ...(pins || [])].forEach((point, index) => {
    const snap = snaps[index];
    if (!validPoint(snap) || !validPoint(point)) return;
    const dx = (snap[0] - point[0]) * Math.cos(point[1] * Math.PI / 180);
    if (Math.hypot(dx, snap[1] - point[1]) * 111195 < 15) return;
    const arrival = snap.slice(0, 2);
    features.push(
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [point.slice(0, 2), arrival] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: arrival } }
    );
  });
  return { type: 'FeatureCollection', features };
}

const position = ({ lng, lat }) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))];

export async function mountPinMap(el, options) {
  const { light = true, onTap, onMove, onReady, onError, signal } = options;
  signal?.throwIfAborted();
  if (!able()) throw new Error(unavailable);
  const lib = await loadMapLibre();
  signal?.throwIfAborted();
  const style = routeStyle(light);
  style.sources[COURSE] = { type: 'geojson', data: routeData(options.coords) };
  style.sources[SNAPS] = { type: 'geojson', data: snapData(options) };
  style.layers.push({
    id: SNAPS + '-offset', type: 'line', source: SNAPS, filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': light ? '#4e504f' : '#ededea', 'line-width': 2, 'line-dasharray': [1, 2] }
  });
  for (const [suffix, color, width] of [['edge', '#ffffff', 7], ['line', light ? '#b64724' : '#ff966a', 4]]) {
    style.layers.push({
      id: COURSE + '-' + suffix, type: 'line', source: COURSE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width }
    });
  }
  style.layers.push({
    id: SNAPS + '-arrival', type: 'circle', source: SNAPS, filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-color': '#9c3f22' }
  });
  const map = new lib.Map({
    container: el, style, bounds: UK, fitBoundsOptions: { padding: 18 },
    dragRotate: false, touchPitch: false, pitchWithRotate: false, renderWorldCopies: false,
    minZoom: 3, maxZoom: 19, attributionControl: { compact: true },
    locale: { 'Map.Title': 'Cycling route map. Use arrow keys to pan and Enter to place a pin at the centre.' }
  });
  map.touchZoomRotate.disableRotation();
  map.doubleClickZoom.disable();
  map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');

  let state = options, line = options.coords, destroyed = false, ready = false;
  const markers = [];
  const abort = new AbortController();
  const canvas = map.getCanvas();
  // Enter provides the same placement behavior as a tap for keyboard users.
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.repeat && ready) {
      event.preventDefault();
      onTap(position(map.getCenter()));
    }
  }, { signal: abort.signal });
  map.on('click', event => {
    if (ready && !event.originalEvent.target?.closest?.('.fr-pin-marker')) onTap(position(event.lngLat));
  });

  function update(next) {
    if (destroyed) return;
    state = next;
    const points = [next.start, ...(next.pins || [])];
    while (markers.length > points.length) markers.pop()?.remove();
    points.forEach((point, index) => {
      if (!validPoint(point)) {
        markers[index]?.remove();
        markers[index] = null;
        return;
      }
      if (!markers[index]) {
        const badge = el.ownerDocument.createElement('div');
        badge.className = 'fr-pin-marker';
        badge.dataset.pinIndex = String(index);
        badge.textContent = index ? String(index) : 'S';
        badge.setAttribute('role', 'img');
        badge.setAttribute('aria-label', index ? 'Pin ' + index : 'Starting point');
        const marker = new lib.Marker({ element: badge, draggable: true, anchor: 'center' }).setLngLat(point).addTo(map);
        marker.on('dragend', () => {
          if (destroyed || markers[index] !== marker) return;
          onMove(index, position(marker.getLngLat()));
          // A rejected edit (e.g. outside UK coverage) must restore the marker.
          const current = index ? state.pins[index - 1] : state.start;
          if (current) marker.setLngLat(current);
        });
        markers[index] = marker;
      } else {
        markers[index].setLngLat(point);
      }
    });
    if (map.getSource(COURSE) && line !== next.coords) {
      map.getSource(COURSE).setData(routeData(next.coords));
      line = next.coords;
    }
    map.getSource(SNAPS)?.setData(snapData(next));
  }

  function center(point) {
    if (!destroyed && point) map.jumpTo({ center: point, zoom: Math.max(map.getZoom(), 13) });
  }
  function fit() {
    if (destroyed) return;
    const points = [state.start, ...(state.pins || []), ...(state.coords || [])].filter(validPoint);
    if (!points.length) return;
    if (points.length === 1) return center(points[0]);
    const bounds = new lib.LngLatBounds();
    for (const [lng, lat] of points) bounds.extend([lng, lat]);
    map.fitBounds(bounds, { padding: 36, maxZoom: 16, duration: 0 });
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(timer);
    abort.abort();
    signal?.removeEventListener('abort', destroy);
    for (const marker of markers) marker?.remove();
    markers.length = 0;
    map.remove();
  }
  function failed() {
    if (destroyed) return;
    destroy();
    onError?.(unavailable);
  }
  const timer = setTimeout(failed, 15000);
  signal?.addEventListener('abort', destroy, { once: true });
  map.on('error', event => {
    // A failed glyph or individual tile can recover as the map is moved.
    // A rejected TileJSON request leaves a blank background at every zoom.
    if (event.error?.url === style.sources.map.url) failed();
  });
  map.once('load', () => {
    if (destroyed) return;
    clearTimeout(timer);
    ready = true;
    update(state);
    onReady?.();
  });
  update(options);
  fit();
  return { update, fit, center, destroy };
}
