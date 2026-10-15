/* ---------- the way a pigeon goes ----------
   A pigeon used to fly the straight line (the great circle) from you to your
   friend. Now its way is planned when it leaves: around storms, along the
   wind, and so on. A route is the points it passes through, each with the time
   it's there, kept in a message's `legs` as [lat, lon, at, tag, name]:
     tag "s"  bending around storms        (name: where the storms are)
         "w"  following the wind
         "i"  resting on an island          (two points: landing, taking off)
         "p"  through a mountain pass       (name: the pass)
         "v"  past a landmark (scenic)       (name: the landmark)
         "c"  cheered on here (not a turn; see _cheers.js)
     none     it turned here, because the person it's flying to moved
   Everything that follows a flight (the map, near misses, flyovers, the
   passport and postmarks) already walks these timed points, so a bent route
   is simply followed. */
import { haversineKm, gcPoint, HOUR, PIGEONS, SPEED_KMH } from "./_pigeon.js";
import { windsAlong } from "./_weather.js";
import { placeName } from "./_where.js";
import { placeAt } from "./_placegrid.js";
import { isSea } from "./_passport.js";
import { ISLES } from "./_islands.data.js";
import { PASSES } from "./_mountains.js";
import { elevAt } from "./_elevgrid.js";
import { LANDMARKS, marksAlong } from "./_landmarks.js";

const R = 6371, rad = Math.PI / 180, deg = 180 / Math.PI;
export const round5 = (x) => Math.round(x * 1e5) / 1e5;
export const pathKm = (path) => { let k = 0; for (let i = 0; i < path.length - 1; i++) k += haversineKm(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]); return k; };
// where you get to going d km from (lat, lon) on a bearing (degrees)
function dest(lat, lon, brg, d) {
  const a = d / R, p1 = lat * rad, l1 = lon * rad, b = brg * rad;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * Math.sin(p2));
  return [p2 * deg, ((l2 * deg + 540) % 360) - 180];
}
function bearing(aLat, aLon, bLat, bLon) {
  const y = Math.sin((bLon - aLon) * rad) * Math.cos(bLat * rad);
  const x = Math.cos(aLat * rad) * Math.sin(bLat * rad) - Math.sin(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLon - aLon) * rad);
  return (Math.atan2(y, x) * deg + 360) % 360;
}
// The longest leg of a path bent out to one side by a share of its length: a
// smooth arc (three points along a curve, furthest out in the middle)
function bent(path, share, tag) {
  let i = 0, best = -1;
  for (let k = 0; k < path.length - 1; k++) { const d = haversineKm(path[k][0], path[k][1], path[k + 1][0], path[k + 1][1]); if (d > best) { best = d; i = k; } }
  const [a, b] = [path[i], path[i + 1]];
  const arc = [0.25, 0.5, 0.75].map((f) => {
    const [mLat, mLon] = gcPoint(a[0], a[1], b[0], b[1], f), side = bearing(mLat, mLon, b[0], b[1]) + (share > 0 ? 90 : -90);
    const [lat, lon] = dest(mLat, mLon, side, Math.abs(share) * best * Math.sin(f * Math.PI));
    return [lat, lon, tag];
  });
  return [...path.slice(0, i + 1), ...arc, ...path.slice(i + 1)];
}
const BENDS = [0.12, -0.12, 0.25, -0.25];
const MIN_BEND_KM = 150;                     // a short hop just goes straight
const WIND_GAIN = 0.04;                      // riding the wind: only for a way at least 4% quicker

// Plan the way from `from` to `to` ([lat, lon] each). With weather, the sky
// along the straight line and a few gentle arcs is looked at together, in one
// request, each stretch as the forecast has it when the pigeon (leaving at
// `start`, at `kmh`) would get there: a pigeon that would fly into storms takes the arc
// that misses them (the quickest that does); otherwise, if the wind along an
// arc gets it there clearly sooner, it rides the wind (a longer way, but quicker).
// Over the great mountain ranges it goes through a pass. With `hop` (a
// standard pigeon), it rests on islands on the way across a
// long stretch of sea.
// Its sender can pick the route's style: "fastest" (all the above), "scenic"
// (it doesn't chase the wind, but bends past up to two landmarks for their
// postmarks, a little further) or "safe" (every pigeon rests on islands
// rather than cross long seas; the sender also halves Pigeon Death's risk).
// Returns { way: the points between (each [lat, lon, tag, name?], with `rest`
// ms where it rests), km, w: the weather along it, as windsFor gives it }.
export const STYLES = ["fastest", "scenic", "safe"];
export const styleOf = (x) => (STYLES.includes(x) && x !== "fastest" ? x : null);    // as kept (fastest: null)
export async function planRoute(env, { from, to, weather = true, hop = false, style = null, start = Date.now(), kmh = SPEED_KMH }) {
  const straight = [from, to];
  let path = straight, w = { wind: null, f: 1, wx: null };
  if (weather) {
    const paths = arcsOf(from, to);
    const ws = await windsAlong(env, paths.map((p) => ({ path: p.map((q) => [q[0], q[1]]), start, kmh })));
    const time = (k) => pathKm(paths[k]) / (ws[k].f || 1);
    let pick = 0, why = null;
    // storms on the straight line: the quickest way that keeps out of them (or has fewest)
    if (ws[0].storms > 0 && paths.length > 1) {
      const order = paths.map((_, k) => k).sort((a, b) => ws[a].storms - ws[b].storms || time(a) - time(b));
      if (ws[order[0]].storms < ws[0].storms) { pick = order[0]; why = "s"; }
    }
    // no storms in the way: an arc the wind blows along gets there sooner, though it's further (only if it's worth it)
    if (!why && paths.length > 1 && style !== "scenic") {
      const best = paths.map((_, k) => k).filter((k) => ws[k].storms <= ws[0].storms).sort((a, b) => time(a) - time(b))[0];
      if (best && time(best) < time(0) * (1 - WIND_GAIN)) { pick = best; why = "w"; }
    }
    const name = why === "s" && ws[0].storm ? safeName(ws[0].storm.lat, ws[0].storm.lon) : null;
    path = paths[pick].map((q, k, all) => (k && k < all.length - 1 ? [q[0], q[1], why || q[2], ...(name ? [name] : [])] : q));
    w = ws[pick];
  }
  if (style === "scenic") path = scenic(path);
  path = finish(path, { hop, style });
  return { way: path.slice(1, -1), km: pathKm(path), w };
}
// The straight way and, if it's long enough, the gentle arcs either side of it
export const arcsOf = (from, to) => [[from, to], ...(pathKm([from, to]) >= MIN_BEND_KM ? BENDS.map((s) => bent([from, to], s, "s")) : [])];
// A way, through the passes, and resting on islands if it hops
export function finish(path, { hop = false, style = null } = {}) {
  const through = throughPasses(path);
  return hop || style === "safe" ? hopped(through) : through;
}

// Mountain passes: where a way goes over high ground (the land's height, from
// open terrain data: _elevgrid.js), it goes through a pass instead. A known
// pass near where it's highest, the one that adds least; if none is near, the
// lowest way across it can find either side, if that's well lower. Not when it
// starts or ends up in the mountains (it's going there). At most PASSES_MOST.
const PASS_STEP = 20, PASS_MOST = 1.35, PASS_KM = 400, HIGH = 1100, LOWER = 300, PASS_NEAR = 400, PASSES_MOST = 3;
const SIDE_KM = [25, 50, 75, 100, 150, 200, 300];
// the highest point of the way from a to b (and where)
function highest(a, b) {
  const d = haversineKm(a[0], a[1], b[0], b[1]), n = Math.max(2, Math.ceil(d / PASS_STEP));
  let top = { m: -1, at: a };
  for (let k = 1; k < n; k++) { const at = gcPoint(a[0], a[1], b[0], b[1], k / n), m = elevAt(at[0], at[1]); if (m > top.m) top = { m, at }; }
  return top;
}
function throughPasses(path) {
  const out = [...path];
  for (let i = 0, n = 0; i < out.length - 1 && n < PASSES_MOST; i++) {
    // (worked out the same whichever way it's flying, so pigeons each way take the same pass)
    const [p, q] = out[i][0] < out[i + 1][0] || (out[i][0] === out[i + 1][0] && out[i][1] <= out[i + 1][1]) ? [out[i], out[i + 1]] : [out[i + 1], out[i]];
    const pt = passFor(p, q);
    if (pt) { out.splice(i + 1, 0, pt); n++; i++; }
  }
  return out;
}
// The pass from p to q, if the way between goes over high ground (null if not)
function passFor(p, q) {
  const top = highest(p, q);
  if (top.m < HIGH || elevAt(p[0], p[1]) >= top.m - LOWER || elevAt(q[0], q[1]) >= top.m - LOWER) return null;
  const base = haversineKm(p[0], p[1], q[0], q[1]), most = Math.min(base * PASS_MOST, base + PASS_KM);
  const via = (x) => haversineKm(p[0], p[1], x[0], x[1]) + haversineKm(x[0], x[1], q[0], q[1]);
  // a known pass near the top, the one that adds least
  let best = null;
  for (const [name, lat, lon] of PASSES) {
    if (haversineKm(lat, lon, top.at[0], top.at[1]) > PASS_NEAR) continue;
    const km = via([lat, lon]); if (km <= most && (!best || km < best.km)) best = { km, pt: [lat, lon, "p", name] };
  }
  if (best) return best.pt;
  // else the lowest way across, either side of the top
  const side = bearing(p[0], p[1], q[0], q[1]);
  let low = null;
  for (const d of SIDE_KM) for (const s of [90, -90]) {
    const x = dest(top.at[0], top.at[1], side + s, d), km = via(x); if (km > most) continue;
    const m = Math.max(highest(p, x).m, highest(x, q).m), score = m + (km - base) * 2;
    if (m <= top.m - LOWER && (!low || score < low.score)) low = { score, km, x };
  }
  return low ? [round5(low.x[0]), round5(low.x[1]), "p", passName(low.x)] : null;
}
// A pass of no known name: "a pass in Norway"
const passName = ([lat, lon]) => { const p = placeAt(lat, lon); return p && !isSea(p) ? `a pass in ${p}` : "a pass"; };

// The scenic way: past the landmark it can see for least extra (and then
// another), so long as the whole way is no more than SCENIC_MORE further.
// Not the ones it'll see anyway, nor any by where it starts or lands.
const SCENIC_MORE = 0.15, SCENIC_MARKS = 2, SCENIC_ENDS = 20;
function scenic(path) {
  const out = [...path], most = pathKm(path) * (1 + SCENIC_MORE), [a, b] = [path[0], path[path.length - 1]];
  for (let n = 0; n < SCENIC_MARKS; n++) {
    const seen = new Set(marksAlong(out));
    let best = null;
    for (const [id, name, lat, lon, r] of LANDMARKS) {
      if (seen.has(id) || haversineKm(a[0], a[1], lat, lon) <= r + SCENIC_ENDS || haversineKm(b[0], b[1], lat, lon) <= r + SCENIC_ENDS) continue;
      for (let i = 0; i < out.length - 1; i++) {
        const p = out[i], q = out[i + 1], more = haversineKm(p[0], p[1], lat, lon) + haversineKm(lat, lon, q[0], q[1]) - haversineKm(p[0], p[1], q[0], q[1]);
        if (!best || more < best.more) best = { more, i, pt: [lat, lon, "v", name] };
      }
    }
    if (!best || pathKm(out) + best.more > most) break;
    out.splice(best.i + 1, 0, best.pt);
  }
  return out;
}

// which pigeons hop from island to island (the faster ones fly straight over)
export const hopsFor = (kind) => (PIGEONS[kind]?.speed ?? 1) <= 1;
// Island hopping: a stretch of open sea longer than HOP_KM gets a rest on an
// island part way over (the one that splits it most evenly, if one's near
// enough the way: any island out at sea, from Natural Earth's 10 m coastline,
// _islands.data.js), HOP_REST each, HOPS at most.
const HOP_KM = 450, HOP_PART = 200, HOP_REST = HOUR, HOPS = 4, SEA_STEP = 25;
function hopped(path) {
  const out = [...path];
  for (let i = 0, n = 0; i < out.length - 1 && n < HOPS;) {
    const run = seaRun(out[i], out[i + 1]), isle = run && run.km > HOP_KM ? restIsland(out[i], out[i + 1], run) : null;
    if (!isle) { i++; continue; }
    out.splice(i + 1, 0, isle); n++;                                 // (and look again at the way to it)
  }
  return out;
}
// the longest stretch of open sea from a to b: where it starts and ends, and how long
function seaRun(a, b) {
  const d = haversineKm(a[0], a[1], b[0], b[1]), n = Math.max(1, Math.ceil(d / SEA_STEP)), at = (k) => gcPoint(a[0], a[1], b[0], b[1], k / n);
  let best = null, start = null;
  for (let k = 0; k <= n; k++) {
    const [lat, lon] = at(k), sea = isSea(placeAt(lat, lon));
    if (sea && start == null) start = k;
    if (start != null && (!sea || k === n)) {
      const end = sea ? k : k - 1, km = ((end - start) / n) * d;
      if (!best || km > best.km) best = { a: at(start), b: at(end), km };
      start = null;
    }
  }
  return best;
}
function restIsland(p, q, run) {
  const base = haversineKm(p[0], p[1], q[0], q[1]), most = Math.min(0.2 * run.km, 900);
  let best = null, score = run.km * 0.85;
  for (const [name, lat, lon] of ISLES) {
    if (name === p[3] || name === q[3]) continue;                     // not another of the islands it's just rested on
    const a = haversineKm(run.a[0], run.a[1], lat, lon), b = haversineKm(lat, lon, run.b[0], run.b[1]);
    const pa = haversineKm(p[0], p[1], lat, lon), qb = haversineKm(lat, lon, q[0], q[1]);
    if (Math.min(a, b, pa, qb) < HOP_PART) continue;                // part way over, not just off either end
    const detour = pa + qb - base;
    const s = Math.max(a, b) + detour / 2;
    if (detour <= most && s < score) { score = s; best = Object.assign([lat, lon, "i", name], { rest: HOP_REST }); }
  }
  return best;
}
const safeName = (lat, lon) => { try { return placeName(lat, lon); } catch (_) { return null; } };

// The planned points with their times: flying `flight` ms (resting where a
// point asks to, `rest` ms) from `start` at `from`. Returns legs and when it lands.
export function timeWay(from, way, to, start, flight) {
  const pts = [from, ...way, to], seg = [];
  for (let i = 0; i < pts.length - 1; i++) seg.push(haversineKm(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  const legs = []; let t = start;
  way.forEach((q, i) => {
    t += (flight * seg[i]) / total;
    const leg = [round5(q[0]), round5(q[1]), Math.round(t), q[2] || "w", ...(q[3] ? [q[3]] : [])];
    legs.push(leg);
    if (q.rest) { t += q.rest; legs.push([leg[0], leg[1], Math.round(t), leg[3], ...(q[3] ? [q[3]] : [])]); }
  });
  return { legs, land: Math.round(t + (flight * seg[seg.length - 1]) / total) };
}
// how long it rests along the way, all told
export const restOf = (way) => way.reduce((a, q) => a + (q.rest || 0), 0);

// A flight changing pace from time t (cheered on): the points still ahead keep
// their places, their times squeezed to land at `end` instead of `was`.
export function squeeze(legs, t, was, end) {
  const k = (end - t) / Math.max(1, was - t);
  return legs.map((l) => (l[2] > t ? [l[0], l[1], Math.round(t + (l[2] - t) * k), ...l.slice(3)] : l));
}
// The points already passed by time t (a flight changing course drops the rest of its plan)
export const passed = (legs, t) => legs.filter((l) => l[2] <= t);
// Turns made because someone moved (planned bends, cheers and rests aren't turns)
export const turnsOf = (legs) => legs.filter((l) => !l[3]);
