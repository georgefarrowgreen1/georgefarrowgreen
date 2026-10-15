// Islands from Natural Earth's 10 m land (world-atlas): each one's middle and size, named.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const topo = require('topojson-client');
const { placeAt } = await import(new URL('../../functions/_placegrid.js', import.meta.url));
const { isSea } = await import(new URL('../../functions/_passport.js', import.meta.url));
const { ISLANDS } = await import(new URL('../../functions/_islands.js', import.meta.url));
const { haversineKm } = await import(new URL('../../functions/_pigeon.js', import.meta.url));
const land = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const geo = topo.feature(land, land.objects.land);
const polys = geo.features.flatMap((f) => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
const R = 6371, rad = Math.PI / 180;
// area (km², spherical excess approximation) and centroid of an outer ring
function ringStats(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    a += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
    cx += x1; cy += y1;
  }
  return { km2: Math.abs((a * R * R) / 2), lat: cy / (ring.length - 1), lon: cx / (ring.length - 1) };
}
const isl = [];
for (const p of polys) {
  const s = ringStats(p[0]);
  if (s.km2 < 3 || s.km2 > 150000) continue;                         // not specks; not continents (Iceland and Ireland are in)
  // out at sea (or a big island): not a lake island, nor part of the coast
  if (!isSea(placeAt(s.lat, s.lon)) && s.km2 < 2000) continue;
  // sea all round it, just beyond its outline (not a piece of a continent)
  let [w, e, so, n] = [180, -180, 90, -90];
  for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); }
  const m = 0.5, mx = (w + e) / 2, my = (so + n) / 2, wrap = (x) => ((x + 540) % 360) - 180;
  const around = [[n + m, mx], [so - m, mx], [my, wrap(e + m)], [my, wrap(w - m)], [n + m, wrap(e + m)], [n + m, wrap(w - m)], [so - m, wrap(e + m)], [so - m, wrap(w - m)]];
  if (e - w > 180 || w <= -179.9 || e >= 179.9 || around.filter(([y, x]) => isSea(placeAt(Math.max(-89, Math.min(89, y)), x))).length < 6) continue;
  isl.push(s);
}
// one per group: the biggest within 40 km
isl.sort((a, b) => b.km2 - a.km2);
const kept = [];
for (const s of isl) if (!kept.some((k) => haversineKm(k.lat, k.lon, s.lat, s.lon) < 40)) kept.push(s);
// names: the curated name within 150 km; else the sea it's in, or the country it belongs to
// countries that are an island (or nearly): named as themselves
const WHOLE = new Set(['Ireland', 'Iceland', 'Cuba', 'Sri Lanka', 'Jamaica', 'Madagascar', 'Taiwan', 'Cyprus', 'Malta', 'Mauritius', 'Singapore', 'Bahrain', 'Puerto Rico', 'Trinidad and Tobago', 'Barbados', 'New Caledonia', 'Fiji', 'Samoa', 'Tonga', 'Vanuatu']);
const named = kept.map((s) => {
  const near = ISLANDS.map(([n, la, lo]) => [n, haversineKm(la, lo, s.lat, s.lon)]).sort((a, b) => a[1] - b[1])[0];
  const where = placeAt(s.lat, s.lon);
  // the country whose land is nearest it, within about 300 km (looking out all round)
  const seen = {};
  for (let b = 0; b < 360; b += 30) for (const d of [100, 200, 300]) {
    const y = s.lat + (d / 111) * Math.cos(b * Math.PI / 180), x = s.lon + (d / (111 * Math.max(0.2, Math.cos(s.lat * Math.PI / 180)))) * Math.sin(b * Math.PI / 180);
    const p = placeAt(Math.max(-89, Math.min(89, y)), ((x + 540) % 360) - 180);
    if (p && p !== 'land' && !isSea(p)) seen[p] = (seen[p] || 0) + 1 / d;
  }
  const c = Object.entries(seen).sort((a, b) => b[1] - a[1])[0]?.[0];
  const land = where && where !== 'land' && !isSea(where);
  const name = near && near[1] < 250 ? near[0] : WHOLE.has(where) ? where : land ? `an island of ${where}` : c ? `an island off ${c}` : `an island in ${isSea(where) ? where : 'the ocean'}`;
  return [name, Math.round(s.lat * 100) / 100, Math.round(s.lon * 100) / 100];
});

console.log("islands", polys.length, '->', isl.length, '->', kept.length);
console.log(named.slice(0, 8), named.filter((n) => /^an island in/.test(n[0])).length, named.filter((n) => /^an island off/.test(n[0])).length);
fs.writeFileSync(process.argv[3], JSON.stringify(named));
