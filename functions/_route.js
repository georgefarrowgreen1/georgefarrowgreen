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
         "o"  following the coast, rather than over open sea (name: the country)
         "m"  over the mountains (a fast pigeon, high enough not to need a pass)
         "b"  by ship (standard pigeons across an ocean: boarding, the lane, landing;
              name: the port), each point after boarding reached at a ship's pace
     none     it turned here, because the person it's flying to moved
   Everything that follows a flight (the map, near misses, flyovers, the
   passport and postmarks) already walks these timed points, so a bent route
   is simply followed. */
import { haversineKm, gcPoint, HOUR, PIGEONS, SPEED_KMH, RISKY_LOSS } from "./_pigeon.js";
import { windsAlong, skyAtPoints, paceAt, pointsFor, isSevere, altOf, JET_KMH } from "./_weather.js";
import { placeName, countryNear } from "./_where.js";
import { SHIP_KMH, portsNear, lane } from "./_ships.js";
import { placeAt } from "./_placegrid.js";
import { isSea } from "./_passport.js";
import { ISLES } from "./_islands.data.js";
import { PASSES } from "./_mountains.js";
import { elevAt } from "./_elevgrid.js";
import { LANDMARKS, marksAlong } from "./_landmarks.js";
import { staminaOf } from "./_birds.js";
import { nearestPlace } from "../pigeon/places.js";

const R = 6371, rad = Math.PI / 180, deg = 180 / Math.PI;
export const round5 = (x) => Math.round(x * 1e5) / 1e5;
export const round2 = (x) => Math.round(x * 100) / 100;
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
const MIN_BEND_KM = 150;                     // a short hop just goes straight
const WIND_GAIN = 0.04;                      // riding the wind: only for a way at least 4% quicker

// Plan the way from `from` to `to` ([lat, lon] each). With weather, the sky
// across the route is looked at, in one request, as a lattice of points either
// side of the straight line (latticeOf), each as the forecast has it when the
// pigeon (leaving at `start`, at `kmh`) would get there, and the quickest way
// through it found (bestWay): a pigeon that would fly into storms takes the
// quickest way that keeps out of them; otherwise, if the wind along another
// way gets it there clearly sooner, it rides the wind (longer, but quicker).
// Over high ground it goes through a pass. With `hop` (a
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
export async function planRoute(env, { from, to, weather = true, hop = false, style = null, start = Date.now(), kmh = SPEED_KMH, ceiling = HIGH }) {
  let path = [from, to], w = { wind: null, f: 1, wx: null };
  // a pigeon that hops (a standard one) keeps to the coast rather than cross open sea: a sea too
  // short to need an island, or with none to rest on (an ocean: it takes a ship instead)
  const run = hop && style !== "scenic" ? seaRun(from, to) : null;
  const coast = !!run && run.km >= COAST_RUN && run.km <= SHIP_KM && !(run.km > HOP_KM && restIsland(from, to, run));
  if (weather) {
    const lat = latticeOf(from, to, { dense: true }), sky = lat ? await skyAtPoints(env, lat.pts, start + (lat.km / kmh) * HOUR * 1.5).catch(() => null) : null;
    if (sky) {
      const found = bestWay(lat, (i, when) => sky.at(i, when), start, kmh, { wind: style !== "scenic", coast });
      path = found.path; w = found.w;
    } else {
      [w] = await windsAlong(env, [{ path: [from, to], start, kmh }]);   // a short hop (or no forecast): the straight way, as the sky is
      if (coast && lat) path = bestWay(lat, () => null, start, kmh, { wind: false, coast }).path;        // (but along the coast all the same)
    }
  } else if (coast) { const lat = latticeOf(from, to, { dense: true }); if (lat) path = bestWay(lat, () => null, start, kmh, { wind: false, coast }).path; }
  if (style === "scenic") path = scenic(path);
  path = finish(path, { hop, style, ceiling });
  return { way: path.slice(1, -1), km: flownKm(path), w };
}

// ---- the way through the weather ----
// The sky across a route, as a lattice: LATTICE_OFF of its length either side
// of the straight line (furthest in the middle, none at the ends), at a row of
// stages along it (one every LATTICE_KM, 3 to 9). The quickest way through,
// from stage to stage, a step sideways at most each time, with each stretch
// at the pace the forecast gives it when the pigeon gets there, and storms
// costing STORM_H hours each so it keeps out of them when it can.
// Planning before it leaves looks finer (dense): more stages, more points across, up to two
// steps sideways a stage; a look in the air (light) is coarser, so more flights share one look.
const LATTICE = {
  light: { off: [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3], km: 300, most: 9, step: 1 },
  dense: { off: [-0.36, -0.3, -0.24, -0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.36], km: 220, most: 13, step: 2 },
};
const STORM_H = 2;
// keeping to the coast: open sea costs this much more than land (as hours of flying), and a way must
// keep this much less over open sea (km) to be worth it
const COAST_W = 0.8, COAST_MIN = 80, COAST_RUN = 100;
const SMOOTH_KM = 12;                         // a bend this close to the line between its neighbours isn't one
// The lattice for a route (null for a short hop): its points (from, the stages' points row by row, to)
export function latticeOf(from, to, { dense = false } = {}) {
  const L = dense ? LATTICE.dense : LATTICE.light, km = haversineKm(from[0], from[1], to[0], to[1]);
  if (km < MIN_BEND_KM) return null;
  const S = Math.min(L.most, Math.max(3, Math.round(km / L.km))), pts = [[from[0], from[1]]];
  for (let s = 1; s <= S; s++) {
    const f = s / (S + 1), [mLat, mLon] = gcPoint(from[0], from[1], to[0], to[1], f), [nLat, nLon] = gcPoint(from[0], from[1], to[0], to[1], Math.min(1, f + 0.01));
    const side = bearing(mLat, mLon, nLat, nLon) + 90;
    for (const o of L.off) pts.push(o ? dest(mLat, mLon, side, o * km * Math.sin(f * Math.PI)) : [mLat, mLon]);
  }
  pts.push([to[0], to[1]]);
  // and the straight line's own points, every ~200 km as ever, so a small storm on it isn't missed between stages
  const line = pointsFor(km), lineAt = pts.length;
  for (const f of line) pts.push(gcPoint(from[0], from[1], to[0], to[1], f));
  return { from, to, km, S, pts, toAt: lineAt - 1, line, lineAt, off: L.off, mid: L.off.indexOf(0), step: L.step };
}
// the point index of stage s (0: from, S+1: to), offset o
const nodeOf = (lat, s, o) => (s === 0 ? 0 : s === lat.S + 1 ? lat.toAt : 1 + (s - 1) * lat.off.length + o);
// how far a point is from the great circle through a and b (km)
function offLine(a, b, p) {
  const d13 = haversineKm(a[0], a[1], p[0], p[1]) / R, t13 = bearing(a[0], a[1], p[0], p[1]) * rad, t12 = bearing(a[0], a[1], b[0], b[1]) * rad;
  return Math.abs(Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * R);
}
// The best way through a lattice, given the sky (skyAt(point index, when)):
// { path (from … to, each bend tagged why), why ("s", "w", "o" or null: straight),
//   w: its weather as windsFor gives it, hours, straight: the straight line's hours }
// Each stretch is judged by the sky when the pigeon would really get there (the
// time it has taken to that point, on that way, as the wind has let it): so a
// way can wait for the wind to turn, or keep ahead of a storm. With `coast`, open
// sea costs more than land, and it keeps to the coast where it can.
export function bestWay(lat, skyAt, start, kmh, { wind = true, coast = false } = {}) {
  const { S, pts } = lat, K = lat.off.length, MID = lat.mid, high = kmh >= JET_KMH;   // (a rocket: up to the jet stream)
  // storms the straight line's own points see, by the stretch between stages they fall in
  const head = bearing(lat.from[0], lat.from[1], lat.to[0], lat.to[1]), lineStorms = new Map();
  let firstStorm = null, firstK = null;
  lat.line.forEach((f, k) => {
    const sk = paceAt(skyAt(lat.lineAt + k, start + ((f * lat.km) / kmh) * HOUR), head, high)?.k;
    if (!isSevere(sk)) return;
    const s = Math.floor(f * (S + 1)); lineStorms.set(s, (lineStorms.get(s) || 0) + 1);
    if (!firstStorm) { firstStorm = pts[lat.lineAt + k]; firstK = sk; }
  });
  const seaOf = (a, b, d) => { if (!coast) return 0; let n = 0; for (const f of [0.125, 0.375, 0.625, 0.875]) { const q = gcPoint(a[0], a[1], b[0], b[1], f); if (isSea(placeAt(q[0], q[1]))) n++; } return (n / 4) * d; };
  const legs = new Map();
  const leg = (s1, o1, s2, o2, t0) => {
    const a = pts[nodeOf(lat, s1, o1)], b = pts[nodeOf(lat, s2, o2)], d = haversineKm(a[0], a[1], b[0], b[1]), head = bearing(a[0], a[1], b[0], b[1]);
    const pa = paceAt(skyAt(nodeOf(lat, s1, o1), t0), head, high), pb = paceAt(skyAt(nodeOf(lat, s2, o2), t0 + (d / kmh) * HOUR), head, high);
    // (a stretch along the straight line, or leaving or joining it, meets the storms its points saw)
    const onLine = (s1 === 0 || o1 === MID) || (s2 === S + 1 || o2 === MID);
    const f = pa && pb ? 2 / (1 / pa.f + 1 / pb.f) : (pa || pb || { f: 1 }).f, storms = (isSevere(pb?.k) ? 1 : 0) + (s1 === 0 && isSevere(pa?.k) ? 1 : 0) + (onLine ? lineStorms.get(s1) || 0 : 0);
    const sk = isSevere(pb?.k) ? pb.k : isSevere(pa?.k) ? pa.k : null, hours = d / (kmh * f);
    const k = `${s1}.${o1}.${s2}.${o2}`; let sea = legs.get(k); if (sea == null) { sea = seaOf(a, b, d); legs.set(k, sea); }
    return { d, f, tail: ((pa?.tail ?? 0) + (pb?.tail ?? 0)) / (pa && pb ? 2 : 1), storms, sk, sea, hours, cost: hours + storms * STORM_H + (sea / kmh) * COAST_W, at: b, pace: pb };
  };
  // stage by stage: the cheapest way to each point, and when it gets there
  let cost = [{ c: 0, t: start, chain: [] }];                         // stage 0: just `from`
  for (let s = 1; s <= S + 1; s++) {
    const n = s === S + 1 ? 1 : K, next = [];
    for (let o = 0; o < n; o++) {
      let best = null;
      cost.forEach((prev, po) => {
        if (!prev || (s > 1 && s <= S && Math.abs(po - o) > lat.step)) return;   // a step or two sideways at most
        const l = leg(s - 1, s === 1 ? 0 : po, s, s === S + 1 ? 0 : o, prev.t), c = prev.c + l.cost;
        if (!best || c < best.c) best = { c, t: prev.t + l.hours * HOUR, chain: [...prev.chain, { o: s === S + 1 ? null : o, l }] };
      });
      next.push(best);
    }
    cost = next;
  }
  const chainOf = (os) => { let t = start; return os.map((o, k) => { const l = leg(k, k ? os[k - 1] : 0, k + 1, k + 1 === S + 1 ? 0 : o, t); t += l.hours * HOUR; return { o, l }; }); };
  const sum = (chain) => {
    const km = chain.reduce((a, x) => a + x.l.d, 0), hours = chain.reduce((a, x) => a + x.l.hours, 0), storms = chain.reduce((a, x) => a + x.l.storms, 0);
    const sea = chain.reduce((a, x) => a + x.l.sea, 0), c = chain.reduce((a, x) => a + x.l.cost, 0);
    const f = hours ? km / (kmh * hours) : 1, wind = Math.round(chain.reduce((a, x) => a + x.l.tail * x.l.d, 0) / (km || 1));
    const stormL = chain.find((x) => x.l.storms)?.l, stormAt = stormL?.at || null;
    // the spot that did most of it (as windsFor says it)
    const worst = chain.filter((x) => x.l.pace).sort((a, b) => (f < 1 ? a.l.pace.f - b.l.pace.f : b.l.pace.f - a.l.pace.f))[0];
    const wk = worst && (worst.l.pace.f >= 1 ? "tailwind" : worst.l.pace.k || "headwind");
    const wx = worst && Math.abs(Math.log(worst.l.pace.f)) >= 0.05 ? { k: wk, lat: worst.l.at[0], lon: worst.l.at[1], at: (chain.indexOf(worst) + 0.5) / chain.length, ...altOf({ k: wk, alt: worst.l.pace.alt }) } : null;   // (how far along: the middle of that stretch)
    return { km, hours, storms, sea, c, w: { wind, f: Math.round(Math.min(1.6, Math.max(0.6, f)) * 1e4) / 1e4, wx, storms, storm: stormAt ? { lat: stormAt[0], lon: stormAt[1], at: 0.5, k: stormL.sk || firstK || "storms" } : null } };
  };
  const straight = sum(chainOf([...Array(S).fill(MID), 0])), best = sum(cost[0].chain);
  let why = null;
  if (straight.storms > 0 && best.storms < straight.storms) why = "s";
  else if (wind && best.hours < straight.hours * (1 - WIND_GAIN) && best.storms <= straight.storms) why = "w";
  else if (coast && best.storms <= straight.storms && straight.sea - best.sea > COAST_MIN && best.c < straight.c) why = "o";
  if (!why) return { path: [lat.from, lat.to], why: null, w: straight.w, hours: straight.hours, straight: straight.hours };
  const stormPt = firstStorm || (straight.w.storm && [straight.w.storm.lat, straight.w.storm.lon]);
  if (firstStorm) straight.w.storm = { lat: firstStorm[0], lon: firstStorm[1], at: 0.5, k: firstK };
  const sk = firstK || straight.w.storm?.k || "storms";
  const name = why === "s" && stormPt ? safeName(stormPt[0], stormPt[1]) : null;
  let bends = cost[0].chain.slice(0, -1).map((x, k) => [round5(pts[nodeOf(lat, k + 1, x.o)][0]), round5(pts[nodeOf(lat, k + 1, x.o)][1]), why, ...(name ? [name] : [])]);
  // the bends that hardly bend go: a smoother way, the same way
  for (let i = 0; i < bends.length && bends.length > 1;) {
    const prev = i ? bends[i - 1] : lat.from, next = i < bends.length - 1 ? bends[i + 1] : lat.to;
    if (offLine(prev, next, bends[i]) < SMOOTH_KM) bends.splice(i, 1); else i++;
  }
  // following the coast: whose coast
  if (why === "o") bends = bends.map((b) => [b[0], b[1], "o", coastOf(b[0], b[1])]);
  // (the first bend around storms says where they were, for the map to draw them, and what they were if not thunderstorms: hail, or icing)
  if (why === "s" && stormPt && bends.length) bends[0] = [bends[0][0], bends[0][1], why, name ?? null, { storm: [round2(stormPt[0]), round2(stormPt[1])], ...(sk !== "storms" ? { k: sk } : {}) }];
  return { path: [lat.from, ...bends, lat.to], why, w: best.w, hours: best.hours, straight: straight.hours };
}
// the country whose coast a point is by
const coastOf = (lat, lon) => { try { const p = placeAt(lat, lon); return p && !isSea(p) ? p : countryNear(lat, lon) || null; } catch (_) { return null; } };
// A way, through the passes, and resting on islands if it hops
export function finish(path, { hop = false, style = null, ceiling = HIGH } = {}) {
  let p = hop ? shipped(path) : path;                                // (an ocean: by ship, first)
  p = throughPasses(p, ceiling);
  return hop || style === "safe" ? hopped(p) : p;
}
// How high a pigeon flies: below this it goes over the top, above it through a pass.
// A standard or swift pigeon looks for a pass over any high ground; a turbo goes
// over all but the high ranges, a rocket over everything but the very highest.
export const ceilingFor = (kind) => { const sp = PIGEONS[kind]?.speed ?? 1; return sp >= 9 ? 4500 : sp >= 3 ? 2600 : HIGH; };

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
function throughPasses(path, ceiling = HIGH) {
  const out = [...path];
  for (let i = 0, n = 0; i < out.length - 1 && n < PASSES_MOST; i++) {
    if (out[i + 1].sail || (out[i][2] === "b" && out[i + 1][2] === "b")) continue;     // (at sea, by ship)
    // (worked out the same whichever way it's flying, so pigeons each way take the same pass)
    const [p, q] = out[i][0] < out[i + 1][0] || (out[i][0] === out[i + 1][0] && out[i][1] <= out[i + 1][1]) ? [out[i], out[i + 1]] : [out[i + 1], out[i]];
    const pt = passFor(p, q, ceiling);
    if (pt) { out.splice(i + 1, 0, pt); n++; i++; }
  }
  return out;
}
// The pass from p to q, if the way between goes over high ground (null if not)
function passFor(p, q, ceiling = HIGH) {
  const top = highest(p, q);
  if (top.m < HIGH || elevAt(p[0], p[1]) >= top.m - LOWER || elevAt(q[0], q[1]) >= top.m - LOWER) return null;
  // high enough to fly over: no pass, it just goes over the top (kept, so the card can say so)
  if (top.m < ceiling) return [round5(top.at[0]), round5(top.at[1]), "m", overName(top.at)];
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
// Mountains it flew over: "the mountains of Switzerland"
const overName = ([lat, lon]) => { const p = placeAt(lat, lon); return p && !isSea(p) ? `the mountains of ${p}` : "the mountains"; };

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
    if (out[i + 1].sail || (out[i][2] === "b" && out[i + 1][2] === "b")) { i++; continue; }      // (by ship)
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

// By ship: a stretch of open sea longer than SHIP_KM (an ocean, too long to hop
// across) is crossed on a ship along the shipping lanes (_ships.js), from the
// port that suits best near where the sea starts to one near where it ends. It
// waits BOARD for its ship, then each point of the lane is reached at the
// ship's pace (`sail` ms, in place of flying), and it flies on from the port.
export const SHIP_KM = 1200;
const BOARD = HOUR;
function shipped(path) {
  const out = [...path];
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i + 1].sail) continue;
    const run = seaRun(out[i], out[i + 1]); if (!run || run.km <= SHIP_KM) continue;
    let best = null;
    for (const [A, da] of portsNear(run.a[0], run.a[1])) for (const [B, db] of portsNear(run.b[0], run.b[1])) {
      if (A === B) continue;
      const l = lane(A[0], B[0]); if (!l) continue;
      const score = da + db + l.km * (SPEED_KMH / SHIP_KMH);           // (the time it takes: a ship is slower than flying)
      if (!best || score < best.score) best = { A, B, l, score };
    }
    if (!best) continue;
    const ns = best.l.nodes, pts = [Object.assign([ns[0][2], ns[0][3], "b", ns[0][1]], { rest: BOARD })];
    for (let k = 1; k < ns.length; k++) pts.push(Object.assign([ns[k][2], ns[k][3], "b", k === ns.length - 1 ? ns[k][1] : null], { sail: Math.round((haversineKm(ns[k - 1][2], ns[k - 1][3], ns[k][2], ns[k][3]) / SHIP_KMH) * HOUR) }));
    out.splice(i + 1, 0, ...pts); i += pts.length;
  }
  return out;
}
// How far it flies (km): the way, but not the stretches it's carried by ship
export function flownKm(path) {
  let k = 0;
  for (let i = 0; i < path.length - 1; i++) if (!path[i + 1].sail) k += haversineKm(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
  return k;
}

// The planned points with their times: flying `flight` ms (resting where a
// point asks to, `rest` ms) from `start` at `from`. Returns legs and when it lands.
export function timeWay(from, way, to, start, flight) {
  const pts = [from, ...way, to], seg = [];
  for (let i = 0; i < pts.length - 1; i++) seg.push(haversineKm(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  const total = seg.reduce((a, b, i) => a + (way[i]?.sail ? 0 : b), 0) || 1;      // (by ship: its own pace, not the flight's)
  const legs = []; let t = start;
  way.forEach((q, i) => {
    t += q.sail ? q.sail : (flight * seg[i]) / total;
    const leg = [round5(q[0]), round5(q[1]), Math.round(t), q[2] || "w", ...(q[3] || q[4] ? [q[3] ?? null] : []), ...(q[4] ? [q[4]] : [])];   // ([4]: its name; [5]: more, for the map)
    legs.push(leg);
    if (q.rest) { t += q.rest; legs.push([leg[0], leg[1], Math.round(t), leg[3], ...(q[3] ? [q[3]] : [])]); }
  });
  return { legs, land: Math.round(t + (flight * seg[seg.length - 1]) / total) };
}
// how long it rests along the way, all told (and sails, by ship: not flying either)
export const restOf = (way) => way.reduce((a, q) => a + (q.rest || 0) + (q.sail || 0), 0);

// Pigeon Death's odds on a way (with Pigeon Death on): 1 in 100 for an ordinary
// flight; more for a long stretch of open sea with nowhere to rest (half as
// much again past 500 km, double past 1,500), for severe weather it couldn't get
// around, and past falcon country (where raptors gather: the narrow crossings
// birds of prey migrate over, and the Gulf, where falconry is a tradition);
// halved the safe way. { p, sea: its longest open sea (km), storms, hawk: where }
export const HAWKS = [["the Strait of Gibraltar", 36.0, -5.6, 120], ["the Bosphorus", 41.1, 29.0, 120], ["the Gulf", 25.5, 52.5, 500],
  ["the Isthmus of Panama", 9.0, -79.6, 200], ["the Sinai", 29.5, 34.5, 200], ["the Strait of Messina", 38.2, 15.6, 80], ["Falsterbo", 55.4, 12.8, 80], ["Veracruz", 19.2, -96.1, 150]];
const RISK_STEP = 50;
export function riskOf(path, storms = 0, style = null) {
  let sea = 0, run = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], d = haversineKm(a[0], a[1], b[0], b[1]), n = Math.max(1, Math.ceil(d / RISK_STEP));
    if (i > 0 && (a.rest || a[2] === "i" || a[2] === "t" || a[2] === "h")) run = 0;              // (it rested there)
    if (b.sail) { run = 0; continue; }                                                          // (on a ship: safe)
    for (let k = 0; k < n; k++) { const q = gcPoint(a[0], a[1], b[0], b[1], (k + 0.5) / n); if (isSea(placeAt(q[0], q[1]))) { run += d / n; sea = Math.max(sea, run); } else run = 0; }
  }
  const near = (lat, lon, r) => path.some((q, i) => i < path.length - 1 && [0, 0.25, 0.5, 0.75, 1].some((f) => { const x = gcPoint(q[0], q[1], path[i + 1][0], path[i + 1][1], f); return haversineKm(x[0], x[1], lat, lon) <= r; }));
  const hawk = HAWKS.find(([, lat, lon, r]) => near(lat, lon, r));
  let p = RISKY_LOSS * (sea > 1500 ? 2 : sea > 500 ? 1.5 : 1) * (1 + Math.min(1.5, 0.5 * storms)) * (hawk ? 1.3 : 1) * (style === "safe" ? 0.5 : 1);
  p = Math.min(0.03, Math.max(0.003, p));
  return { p: Math.round(p * 1e5) / 1e5, sea: Math.round(sea), storms, hawk: hawk ? hawk[0] : null };
}

// Stamina: a named pigeon gets tired on a long flight, and comes down on land
// for a breather ("t", a rest like an island's) every so many hours of flying.
// The more miles it has flown (staminaOf: its career), the longer it goes
// between rests and the shorter they are: a Fledgling every 5 hours or so for
// about 40 minutes, a Legend every 16 for 15. Not over the sea (it waits for
// land), not within an hour of landing, and a rest on the way (an island, or
// sheltering) counts.
export const tiredOf = (km) => { const s = staminaOf(km); return { every: (2 + s * 0.14) * HOUR, rest: Math.round((50 - s * 0.35) * 60e3) }; };
export function tire(from, way, to, kmh, { every, rest }) {
  const pts = [from, ...way, to], out = [], hours = (a, b) => (haversineKm(a[0], a[1], b[0], b[1]) / kmh) * HOUR;
  const left = (i) => { let ms = 0; for (let k = i; k < pts.length - 1; k++) ms += hours(pts[k], pts[k + 1]); return ms; };
  let flown = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], seg = hours(a, b);
    if (i > 0) { out.push(pts[i]); if (pts[i].rest) flown = 0; }
    if (b.sail) { flown = 0; continue; }                                 // (on a ship: resting all the way)
    let done = 0;                                            // how far along this stretch (ms of flying)
    while (flown + (seg - done) > every) {
      let at = done + (every - flown), spot = null;
      // the first land from there on along this stretch (25 km at a time)
      for (; at < seg; at += (25 / kmh) * HOUR) { const q = gcPoint(a[0], a[1], b[0], b[1], at / seg); if (!isSea(placeAt(q[0], q[1]))) { spot = q; break; } }
      if (!spot) break;                                      // sea all the rest of this stretch: the next land, then
      if (left(i) - at < HOUR) break;                        // nearly there: it flies on
      const name = nearestPlace(spot[0], spot[1]);
      out.push(Object.assign([round5(spot[0]), round5(spot[1]), "t", name.startsWith("near ") ? name : `near ${name}`], { rest }));
      done = at; flown = 0;
    }
    flown += seg - done;
  }
  return out;
}

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
