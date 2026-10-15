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
import { haversineKm, gcPoint } from "./_pigeon.js";
import { windsFor } from "./_weather.js";
import { placeName } from "./_where.js";

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

// Plan the way from `from` to `to` ([lat, lon] each). With weather (when it
// leaves), the sky along the straight line and a few gentle arcs is looked at
// together, in one request: a pigeon that would fly into storms takes the arc
// that misses them (the quickest that does); otherwise, if the wind along an
// arc gets it there clearly sooner, it rides the wind (a longer way, but quicker).
// Returns { way: the points between (each [lat, lon, tag, name?]), km, w: the
// weather along it, as windsFor gives it }.
export async function planRoute(env, { from, to, weather = true }) {
  const straight = [from, to];
  if (!weather) return { way: [], km: pathKm(straight), w: { wind: null, f: 1, wx: null } };
  const long = pathKm(straight) >= MIN_BEND_KM;
  const paths = [straight, ...(long ? BENDS.map((s) => bent(straight, s, "s")) : [])];
  const ws = await windsFor(env, paths.map((p) => p.map((q) => [q[0], q[1]])));
  const time = (k) => pathKm(paths[k]) / (ws[k].f || 1);
  let pick = 0, why = null;
  // storms on the straight line: the quickest way that keeps out of them (or has fewest)
  if (ws[0].storms > 0 && paths.length > 1) {
    const order = paths.map((_, k) => k).sort((a, b) => ws[a].storms - ws[b].storms || time(a) - time(b));
    if (ws[order[0]].storms < ws[0].storms) { pick = order[0]; why = "s"; }
  }
  // no storms in the way: an arc the wind blows along gets there sooner, though it's further (only if it's worth it)
  if (!why && paths.length > 1) {
    const best = paths.map((_, k) => k).filter((k) => ws[k].storms <= ws[0].storms).sort((a, b) => time(a) - time(b))[0];
    if (best && time(best) < time(0) * (1 - WIND_GAIN)) { pick = best; why = "w"; }
  }
  const path = paths[pick], way = path.slice(1, -1).map((q) => [q[0], q[1], why || q[2]]);
  if (why === "s" && ws[0].storm) for (const q of way) q[3] = safeName(ws[0].storm.lat, ws[0].storm.lon);
  return { way, km: pathKm(path), w: ws[pick] };
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
