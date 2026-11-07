// Shared calculations for generated routes. No sample catalog, network or account state.
const MAX_POINTS = 12e3;
const pointOK = (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number" && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) < 85;
function metresBetween(a, b) {
  const r = Math.PI / 180, dlat = (b[1] - a[1]) * r, dlon = (b[0] - a[0]) * r;
  const q = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dlon / 2) ** 2;
  return 12742e3 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
}
function destination(p, metres, bearing) {
  const r = Math.PI / 180, a = metres / 6371e3, b = bearing * r, lat = p[1] * r, lon = p[0] * r;
  const y = Math.asin(Math.sin(lat) * Math.cos(a) + Math.cos(lat) * Math.sin(a) * Math.cos(b));
  const x = lon + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(lat), Math.cos(a) - Math.sin(lat) * Math.sin(y));
  return [(x / r + 540) % 360 - 180, y / r].map((n) => Number(n.toFixed(6)));
}
function trackStats(coords) {
  let metres = 0, ascent = 0, anchor = coords[0]?.[2], elevation = Number.isFinite(anchor);
  for (let i = 1; i < coords.length; i++) {
    metres += metresBetween(coords[i - 1], coords[i]);
    const z = coords[i][2];
    if (!Number.isFinite(z)) {
      elevation = false;
      continue;
    }
    if (Number.isFinite(anchor) && Math.abs(z - anchor) >= 3) {
      if (z > anchor) ascent += z - anchor;
      anchor = z;
    }
  }
  return { metres: Math.round(metres), ascent: elevation ? Math.round(ascent) : null, elevation };
}
function cleanRoute(r) {
  if (!r || typeof r.id !== "string" || !/^r-[a-zA-Z0-9_-]{8,64}$/.test(r.id) || typeof r.name !== "string" || !r.name.trim() || r.name.length > 90 || !["road", "mixed"].includes(r.surface) || !pointOK(r.start) || !Array.isArray(r.coords) || r.coords.length < 10 || r.coords.length > MAX_POINTS) return null;
  const coords = [];
  for (const c of r.coords) {
    if (!pointOK(c) || c.length > 3 || c[2] != null && (!Number.isFinite(c[2]) || c[2] < -500 || c[2] > 1e4)) return null;
    coords.push([c[0], c[1], Number.isFinite(c[2]) ? c[2] : null]);
  }
  const stats = trackStats(coords), snap = metresBetween(r.start, coords[0]);
  if (stats.metres < 1e3 || stats.metres > 22e4 || metresBetween(coords[0], coords.at(-1)) > 25 || snap > 250) return null;
  for (let i = 1; i < coords.length; i++) if (metresBetween(coords[i - 1], coords[i]) > 2500) return null;
  return { id: r.id, name: r.name.trim(), surface: r.surface, start: r.start.slice(0, 2), coords, ...stats, snap: Math.round(snap), provider: "BRouter / OpenStreetMap", generatedAt: Number.isSafeInteger(r.generatedAt) ? r.generatedAt : 0 };
}
const shapes = /* @__PURE__ */ new WeakMap();
function geometry(route) {
  if (shapes.has(route)) return shapes.get(route);
  const coords = route.coords, distances = [0];
  for (let i = 1; i < coords.length; i++) distances.push(distances.at(-1) + metresBetween(coords[i - 1], coords[i]));
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length * Math.PI / 180;
  const xs = coords.map((c) => ((c[0] - route.start[0] + 540) % 360 - 180) * Math.cos(lat)), ys = coords.map((c) => -c[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), dx = Math.max(...xs) - minX, dy = Math.max(...ys) - minY, scale = 264 / Math.max(dx, dy, 1e-9), ox = (300 - dx * scale) / 2, oy = (300 - dy * scale) / 2;
  const positions = xs.map((x, i) => [ox + (x - minX) * scale, oy + (ys[i] - minY) * scale]);
  const out = { coords, distances, positions, path: positions.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(""), metres: distances.at(-1) };
  shapes.set(route, out);
  return out;
}
function estimate(route, speed = 22) {
  return Math.max(1, Math.round(route.metres / 1e3 / Math.min(40, Math.max(10, Number(speed) || 22)) * (route.surface === "mixed" ? 1.2 : 1) * 60 + (route.ascent || 0) / 30 + 5));
}
function profile(route) {
  const g = geometry(route), z = g.coords.map((c) => c[2] ?? 0), lo = Math.min(...z), hi = Math.max(...z), span = Math.max(20, hi - lo);
  return { lo, hi, path: z.map((v, i) => `${i ? "L" : "M"}${(g.distances[i] / g.metres * 600).toFixed(2)},${(112 - (v - lo) / span * 92).toFixed(2)}`).join("") };
}
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
function toGPX(route) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="InFlite Fitness" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(route.name)}</name><desc>Cycling route calculated by BRouter using OpenStreetMap contributors (ODbL). Access and conditions can change.</desc></metadata><trk><name>${xml(route.name)}</name><trkseg>${route.coords.map(([lon, lat, ele]) => `<trkpt lat="${lat}" lon="${lon}">${ele == null ? "" : `<ele>${ele}</ele>`}</trkpt>`).join("")}</trkseg></trk></gpx>`;
}
export {
  MAX_POINTS,
  cleanRoute,
  destination,
  estimate,
  geometry,
  metresBetween,
  pointOK,
  profile,
  toGPX,
  trackStats
};
