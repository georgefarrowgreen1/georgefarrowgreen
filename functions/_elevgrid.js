/* ---------- how high the land is ----------
   The average height of each half-degree square (functions/_elevgrid.data.js,
   from open terrain data: see .tools/geo), in metres, to 150 m. The sea is 0. */
import { STEP, STEP_M, DATA } from "./_elevgrid.data.js";

const W = Math.round(360 / STEP), H = Math.round(180 / STEP);
let rows = null;
const cache = new Map();
function row(r) {
  let a = cache.get(r);
  if (a) return a;
  rows ||= DATA.split(";");
  a = new Uint8Array(W);
  let c = 0;
  for (const run of rows[r].split(",")) { const [v, n] = run.split("."); const k = n ? parseInt(n, 36) : 1; a.fill(parseInt(v, 36), c, c + k); c += k; }
  cache.set(r, a);
  return a;
}
// the land's height at a point (m)
export function elevAt(lat, lon) {
  const r = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / STEP)));
  const c = ((Math.floor((lon + 180) / STEP) % W) + W) % W;
  return row(r)[c] * STEP_M;
}
