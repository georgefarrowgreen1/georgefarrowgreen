// Every quarter-degree square of land, named by the country whose border it's in
// (Natural Earth 50 m, from world-atlas), so a spot near a border is named for the
// side it's on, not for whichever country's middle is nearest. Writes
// functions/_countrygrid.data.js; then regenerate the place grid (see functions/_placegrid.js).
//   node .tools/geo/countries.mjs countries-50m.json
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const topo = require('topojson-client');
const { onLand, countryNear } = await import(new URL('../../functions/_where.js', import.meta.url));
const { COUNTRIES, EDGES } = await import(new URL('../../pigeon/countries.js', import.meta.url));
const STEP = 0.25, W = 360 / STEP, H = 180 / STEP;
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const feats = topo.feature(src, src.objects.countries).features;
// Natural Earth's short names, as the app says them
const ALIAS = { 'United States of America': 'United States', 'Dem. Rep. Congo': 'DR Congo', 'United Arab Emirates': 'UAE', 'Dominican Rep.': 'Dominican Republic',
  "Côte d'Ivoire": 'Ivory Coast', 'S. Sudan': 'South Sudan', 'Bosnia and Herz.': 'Bosnia', Macedonia: 'North Macedonia', 'N. Cyprus': 'Cyprus', Somaliland: 'Somalia',
  'W. Sahara': 'Western Sahara', eSwatini: 'Eswatini', 'Eq. Guinea': 'Equatorial Guinea', 'St. Vin. and Gren.': 'St Vincent and the Grenadines', 'St. Kitts and Nevis': 'St Kitts and Nevis',
  'Antigua and Barb.': 'Antigua and Barbuda', 'S. Geo. and the Is.': 'South Georgia', 'Br. Indian Ocean Ter.': 'the Chagos Islands', 'Fr. S. Antarctic Lands': 'the French Southern Lands',
  'Fr. Polynesia': 'French Polynesia', 'Heard I. and McDonald Is.': 'Heard Island', 'Indian Ocean Ter.': 'Christmas Island', 'Ashmore and Cartier Is.': 'Ashmore Reef', 'Siachen Glacier': 'Kashmir',
  'St-Martin': 'Saint-Martin', 'St-Barthélemy': 'Saint-Barthélemy', 'St. Pierre and Miquelon': 'Saint-Pierre and Miquelon', 'Wallis and Futuna Is.': 'Wallis and Futuna',
  'Faeroe Is.': 'the Faroe Islands', 'N. Mariana Is.': 'the Northern Mariana Islands', 'U.S. Virgin Is.': 'the US Virgin Islands', Vatican: 'Vatican City', Macao: 'Macau',
  Gambia: 'the Gambia', Bahamas: 'the Bahamas', Maldives: 'the Maldives', Seychelles: 'the Seychelles', Comoros: 'the Comoros' };
const app = new Set([...COUNTRIES, ...EDGES].map((x) => x[0]));
const the = (n) => (/^(United|Netherlands|Philippines|Central|Dominican|UAE)/.test(n) ? 'the ' + n : n);
const nameOf = (n) => { const a = ALIAS[n] || (/ Is\.$/.test(n) ? 'the ' + n.replace(/ Is\.$/, ' Islands') : n); return app.has(a) ? the(a) : a; };
const names = [''], idx = new Map(), grid = new Uint16Array(W * H);
const id = (n) => { if (!idx.has(n)) { idx.set(n, names.length); names.push(n); } return idx.get(n); };
// fill each polygon's squares, row by row (even-odd across its rings, so lakes and enclaves are holes)
for (const f of feats) {
  const v = id(nameOf(f.properties.name)), polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const rings of polys) {
    let s = 90, n = -90; for (const r of rings) for (const [, y] of r) { s = Math.min(s, y); n = Math.max(n, y); }
    for (let row = Math.max(0, Math.floor((90 - n) / STEP)); row <= Math.min(H - 1, Math.floor((90 - s) / STEP)); row++) {
      const lat = 90 - (row + 0.5) * STEP, xs = [];
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > lat) !== (yj > lat)) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let c = Math.ceil((xs[k] + 180) / STEP - 0.5); c <= Math.floor((xs[k + 1] + 180) / STEP - 0.5); c++) grid[row * W + ((c % W) + W) % W] = v;
      }
    }
  }
}
// the map's own coastline decides land and sea; land the borders miss (the coastline is coarser) takes the nearest country's square
const out = new Uint16Array(W * H);
let filled = 0, near = 0, far = 0;
for (let row = 0; row < H; row++) for (let c = 0; c < W; c++) {
  const lat = 90 - (row + 0.5) * STEP, lon = -180 + (c + 0.5) * STEP;
  if (!onLand(lat, lon)) continue;
  let v = grid[row * W + c];
  if (v) { filled++; } else {
    for (let d = 1; d <= 16 && !v; d++) for (let dr = -d; dr <= d && !v; dr++) for (const dc of Math.abs(dr) === d ? Array.from({ length: 2 * d + 1 }, (_, i) => i - d) : [-d, d]) {
      const rr = row + dr; if (rr < 0 || rr >= H) continue;
      const g = grid[rr * W + (((c + dc) % W) + W) % W]; if (g) { v = g; break; }
    }
    if (v) near++; else { v = id(countryNear(lat, lon)); far++; }
  }
  out[row * W + c] = v;
}
const run = (v, n) => v.toString(36) + (n > 1 ? '.' + n.toString(36) : '');
const rows = [];
for (let row = 0; row < H; row++) {
  const runs = []; let cur = -1, len = 0;
  for (let c = 0; c < W; c++) { const v = out[row * W + c]; if (v === cur) len++; else { if (len) runs.push(run(cur, len)); cur = v; len = 1; } }
  runs.push(run(cur, len)); rows.push(runs.join(','));
}
fs.writeFileSync(new URL('../../functions/_countrygrid.data.js', import.meta.url), `// Generated by .tools/geo/countries.mjs from Natural Earth's borders: don't edit by hand.\nexport const STEP = ${STEP};\nexport const NAMES = ${JSON.stringify(names)};\nexport const DATA = ${JSON.stringify(rows.join(';'))};\n`);
console.log({ countries: names.length - 1, filled, near, far });
