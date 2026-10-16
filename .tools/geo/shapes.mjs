// Each country's outline, for the passport's stamps: Natural Earth 50 m (from
// world-atlas), its far-flung bits dropped (France without Guiana), fitted to a
// 100 × 100 box and simplified to whole numbers. Named as the app names places
// (the same names as countries.mjs). Writes pigeon/shapes.js.
//   node .tools/geo/shapes.mjs countries-50m.json
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const topo = require('topojson-client');
const { COUNTRIES, EDGES } = await import(new URL('../../pigeon/countries.js', import.meta.url));
const here = fs.readFileSync(new URL('./countries.mjs', import.meta.url), 'utf8');
const ALIAS = (0, eval)('(' + here.slice(here.indexOf('const ALIAS = ') + 14, here.indexOf('};', here.indexOf('const ALIAS = ')) + 1) + ')');
const app = new Set([...COUNTRIES, ...EDGES].map((x) => x[0]));
const the = (n) => (/^(United|Netherlands|Philippines|Central|Dominican|UAE)/.test(n) ? 'the ' + n : n);
const nameOf = (n) => { const a = ALIAS[n] || (/ Is\.$/.test(n) ? 'the ' + n.replace(/ Is\.$/, ' Islands') : n); return app.has(a) ? the(a) : a; };
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const area = (r) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const box = (r) => r.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
const TOL = 1.1;                 // (in the 100 box: a stamp shows a country 30 to 40 px across)
// Douglas-Peucker
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i], [x1, y1] = pts[a], [x2, y2] = pts[b], L = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
      const d = Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / L; if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; st.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const out = {};
for (const f of topo.feature(src, src.objects.countries).features) {
  const name = nameOf(f.properties.name); if (!f.geometry) continue;
  let polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((p) => p[0]);
  polys.sort((a, b) => area(b) - area(a));
  const main = box(polys[0]), mw = main[2] - main[0], mh = main[3] - main[1], mc = [(main[0] + main[2]) / 2, (main[1] + main[3]) / 2];
  polys = polys.filter((p, i) => { if (!i) return true; const b = box(p), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    return Math.abs(c[0] - mc[0]) < mw * 1.6 + 2 && Math.abs(c[1] - mc[1]) < mh * 1.6 + 2 && area(p) > area(polys[0]) * 0.012; }).slice(0, 8);
  const k = Math.cos((mc[1] * Math.PI) / 180), rings = polys.map((r) => r.map(([x, y]) => [x * k, -y]));
  const b = box(rings.flat()), s = 100 / Math.max(b[2] - b[0], b[3] - b[1], 1e-6), ox = (100 - (b[2] - b[0]) * s) / 2, oy = (100 - (b[3] - b[1]) * s) / 2;
  const d = rings.map((r) => { const P = r.map(([x, y]) => [(x - b[0]) * s + ox, (y - b[1]) * s + oy]), h = Math.floor(P.length / 2);
    // (a closed ring in two halves: its ends are the same point)
    const pts = [...simplify(P.slice(0, h + 1), TOL), ...simplify(P.slice(h), TOL).slice(1)].map(([x, y]) => [Math.round(x), Math.round(y)]);
    const q = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    // (as small steps from point to point: "M12 40l3-2 1 4…z", half the size)
    return q.length > 2 ? `M${q[0][0]} ${q[0][1]}l` + q.slice(1).map((p, i) => [p[0] - q[i][0], p[1] - q[i][1]].map((v, j) => (j && v >= 0 ? ' ' : v >= 0 && i ? ' ' : '') + v).join('')).join('') + 'z' : ''; }).join('');
  if (d && !out[name]) out[name] = d;
}
fs.writeFileSync(new URL('../../pigeon/shapes.js', import.meta.url), `// Each country's outline for the passport's stamps (Natural Earth 50 m, public domain;
// made by .tools/geo/shapes.mjs): an SVG path in a 100 × 100 box, by the app's name for the country.
export const SHAPES = ${JSON.stringify(out)};\n`);
console.log(Object.keys(out).length, 'shapes', fs.statSync(new URL('../../pigeon/shapes.js', import.meta.url)).size, 'bytes');
