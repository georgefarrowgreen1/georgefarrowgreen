// Check the shipping lanes (functions/_ships.js) keep to open water: for each lane, the points along it
// that the coastline grid says are land. A few near a port are expected (ports are on the coast); more
// mid-lane means it cuts across land, so add a point at sea for it to go round by.
//   node .tools/geo/lanes.mjs
import { NODES, LANES } from '../../functions/_ships.js';
import { placeAt } from '../../functions/_placegrid.js';
import { isSea } from '../../functions/_passport.js';
import { gcPoint, haversineKm } from '../../functions/_pigeon.js';
const by = new Map(NODES.map((n) => [n[0], n])), canals = new Set(['PSD-SUZ', 'BAL-COL']);
for (const l of LANES) {
  if (canals.has(l)) continue;
  const [a, b] = l.split('-').map((x) => by.get(x)), d = haversineKm(a[2], a[3], b[2], b[3]), n = Math.max(4, Math.ceil(d / 15)), land = [];
  for (let k = 1; k < n; k++) { const [lat, lon] = gcPoint(a[2], a[3], b[2], b[3], k / n), p = placeAt(lat, lon); if (!isSea(p)) land.push(`${lat.toFixed(1)},${lon.toFixed(1)} ${p}`); }
  if (land.length) console.log(l.padEnd(10), `${land.length}/${n - 1}`.padEnd(8), land.slice(0, 3).join(' | '));
}
