/* ---------- the live tracker: every pigeon in the air, for anyone, with no one in it ----------
   chat.georgefarrowgreen.com/tracker (pigeon/tracker.js) draws this on a world map.
   It's public, so nothing here may lead back to a person:

   - No names, handles, places, messages, times, routes or ids. Each pigeon is only
     roughly where it is, which way it's heading, what kind it is and what it's over.
   - Never near either end: not within NEAR_HOME km of where it set off or where it's
     going (more on a long flight), nor of anywhere it stops (a friend on the way, an
     island, a port), and not while it's resting. A pigeon only shows out in the open.
   - Only roughly: snapped to a GRID° grid (about 55 km) and the nearest of 8 headings,
     with a short trail of where it was (TRAIL), every point under these same rules.
     The snapping is the same every time, so watching longer doesn't sharpen it.
   - Short flights (under SHORT km) never show: both ends would be too near.
   - No ids, in a shuffled order: nothing links a dot now to a dot a minute ago.
   - Anyone can keep their pigeons off it (Privacy & Security → Live Tracker), and a
     pigeon shows only when both whoever sent it and whoever it's flying to allow it.
   - One answer for everyone, worked out at most once every FRESH ms and kept at the
     edge, so asking more often learns nothing and costs the database nothing. Nothing
     about who asked is kept: no sign-in, no cookies, no addresses. */
import { json, db, haversineKm } from "./_pigeon.js";
import { stopsOf, posAt } from "./_moments.js";
import { placeName } from "./_where.js";
import { placeAt } from "./_placegrid.js";
import { isSea } from "./_passport.js";

export const NEAR_HOME = 150, SHORT = 300, GRID = 0.5, FRESH = 60e3;
const KINDS = new Set(["standard", "swift", "turbo", "rocket"]);
const HEADINGS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

const snap = (x) => Math.round(x / GRID) * GRID;
function bearing(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, y = Math.sin((bLon - aLon) * r) * Math.cos(bLat * r);
  const x = Math.cos(aLat * r) * Math.sin(bLat * r) - Math.sin(aLat * r) * Math.cos(bLat * r) * Math.cos((bLon - aLon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

// Where a pigeon may be shown at time t, as [lat, lon] snapped, or null where it mustn't be.
function spot(f, stops, trip, t) {
  if (!(f.sent_at <= t && t < f.deliver_at) || (f.lost_at != null && f.lost_at <= t)) return null;
  const from = stops[0], to = stops.at(-1), here = posAt(stops, t), ahead = posAt(stops, t + 10 * 60e3);
  if (haversineKm(here[0], here[1], ahead[0], ahead[1]) < 1) return null;          // resting, or waiting for a ship
  // clear of both ends (a long flight keeps further away, up to 400 km) and of every stop on the way
  const keep = Math.max(NEAR_HOME, Math.min(400, trip * 0.1));
  if (haversineKm(here[0], here[1], from[0], from[1]) < keep || haversineKm(here[0], here[1], to[0], to[1]) < keep) return null;
  for (let i = 1; i < stops.length - 1; i++) {
    const [a, b] = [stops[i], stops[i + 1]];
    if (haversineKm(a[0], a[1], b[0], b[1]) < 1 && haversineKm(here[0], here[1], a[0], a[1]) < NEAR_HOME) return null;
    // where it turned for someone who moved: it may have been nearly at their old home
    if (!a[3] && haversineKm(here[0], here[1], a[0], a[1]) < NEAR_HOME) return null;
  }
  return { here, ahead, at: [snap(here[0]), snap(((here[1] + 540) % 360) - 180)] };
}

// One pigeon as the tracker may show it, or null when it mustn't be shown (yet). Its trail is
// where it was over the last couple of hours (up to TRAIL_KM back), each point under the same
// rules: snapped, and only where it could have been shown then, so a trail never reaches home.
export const TRAIL = [15, 30, 45, 60, 90, 120].map((m) => m * 60e3), TRAIL_KM = 600;
export function trackerView(f, t) {
  const stops = stopsOf(f), from = stops[0], to = stops.at(-1);
  if (from[0] == null || to[0] == null) return null;
  const trip = haversineKm(from[0], from[1], to[0], to[1]);
  if (trip < SHORT) return null;
  const now = spot(f, stops, trip, t); if (!now) return null;
  const [lat, lon] = now.at, h = Math.round(bearing(now.here[0], now.here[1], now.ahead[0], now.ahead[1]) / 45) % 8;
  const tr = [], turned = Math.max(-Infinity, ...stops.slice(1, -1).filter((l) => !l[3]).map((l) => l[2]));
  for (const ago of TRAIL) {
    if (t - ago < turned) break;                                                   // (nor back along the way it was going before a turn)
    const was = spot(f, stops, trip, t - ago); if (!was) break;
    if (haversineKm(lat, lon, was.at[0], was.at[1]) > TRAIL_KM) break;
    const last = tr.at(-1) || [lat, lon]; if (was.at[0] !== last[0] || was.at[1] !== last[1]) tr.push(was.at);
  }
  return { lat, lon, h: HEADINGS[h], k: f.mystery ? "mystery" : KINDS.has(f.pigeon) ? f.pigeon : "standard", over: placeName(lat, lon), tr };
}

// every pigeon in the air (one to one, and each member's in a group), with whether both ends allow it
async function inTheAir(D, t) {
  const one = await D.prepare(`SELECT m.from_lat, m.from_lon, m.to_lat, m.to_lon, m.sent_at, m.deliver_at, m.lost_at, m.legs, m.pigeon, m.mystery,
      (COALESCE(a.hide_tracker, 0) + COALESCE(b.hide_tracker, 0)) AS hidden
    FROM pg_msgs m JOIN pg_users a ON a.id = m.sender JOIN pg_users b ON b.id = m.recipient
    WHERE m.sent_at <= ?1 AND m.deliver_at > ?1 AND (m.lost_at IS NULL OR m.lost_at > ?1) LIMIT 5000`).bind(t).all();
  const grp = await D.prepare(`SELECT g.from_lat, g.from_lon, d.to_lat, d.to_lon, g.sent_at, d.deliver_at, d.lost_at, d.legs, g.pigeon, g.mystery,
      (COALESCE(a.hide_tracker, 0) + COALESCE(b.hide_tracker, 0)) AS hidden
    FROM pg_gdeliv d JOIN pg_gmsgs g ON g.id = d.msg_id JOIN pg_users a ON a.id = g.sender JOIN pg_users b ON b.id = d.user_id
    WHERE g.sent_at <= ?1 AND d.deliver_at > ?1 AND (d.lost_at IS NULL OR d.lost_at > ?1) LIMIT 5000`).bind(t).all();
  return [...one.results, ...grp.results];
}

// Today (since midnight UTC), as totals only: pigeons landed, distance flown, seas crossed.
// Like the map, it leaves out anyone who keeps their pigeons off the tracker.
async function today(D, t) {
  const day0 = Math.floor(t / 864e5) * 864e5;
  const cols = "sent_at, deliver_at, lost_at, km, legs";
  const one = await D.prepare(`SELECT m.from_lat, m.from_lon, m.to_lat, m.to_lon, m.${cols.split(", ").join(", m.")}
    FROM pg_msgs m JOIN pg_users a ON a.id = m.sender JOIN pg_users b ON b.id = m.recipient
    WHERE m.sent_at <= ?1 AND m.deliver_at >= ?2 AND (m.lost_at IS NULL OR m.lost_at >= ?2) AND COALESCE(a.hide_tracker, 0) = 0 AND COALESCE(b.hide_tracker, 0) = 0 LIMIT 20000`).bind(t, day0).all();
  const grp = await D.prepare(`SELECT g.from_lat, g.from_lon, d.to_lat, d.to_lon, g.sent_at, d.deliver_at, d.lost_at, d.km, d.legs
    FROM pg_gdeliv d JOIN pg_gmsgs g ON g.id = d.msg_id JOIN pg_users a ON a.id = g.sender JOIN pg_users b ON b.id = d.user_id
    WHERE g.sent_at <= ?1 AND d.deliver_at >= ?2 AND (d.lost_at IS NULL OR d.lost_at >= ?2) AND COALESCE(a.hide_tracker, 0) = 0 AND COALESCE(b.hide_tracker, 0) = 0 LIMIT 20000`).bind(t, day0).all();
  let landed = 0, km = 0, budget = 20000; const seas = new Map();      // (at most 20,000 points named in all: a busy day stays quick)
  for (const f of [...one.results, ...grp.results]) {
    const end = Math.min(f.deliver_at, f.lost_at ?? Infinity), a = Math.max(f.sent_at, day0), b = Math.min(t, end);
    if (f.deliver_at <= t && f.deliver_at >= day0 && (f.lost_at == null || f.lost_at > f.deliver_at)) landed++;
    if (!(b > a) || f.from_lat == null || f.to_lat == null) continue;
    const frac = (b - a) / (f.deliver_at - f.sent_at || 1); km += (f.km || 0) * frac;
    // where it flew today: a point every ~100 km of it (at most 40), named from the passport's grid
    if (budget <= 0) continue;
    const stops = stopsOf(f), n = Math.min(40, budget, Math.max(2, Math.ceil(((f.km || 0) * frac) / 100))); budget -= n + 1;
    const seen = new Set();
    for (let i = 0; i <= n; i++) { const [la, lo] = posAt(stops, a + ((b - a) * i) / n), p = placeAt(la, ((lo + 540) % 360) - 180); if (p && isSea(p)) seen.add(p); }
    for (const p of seen) seas.set(p, (seas.get(p) || 0) + 1);
  }
  return { landed, km: Math.round(km / 10) * 10, seas: [...seas].sort((x, y) => y[1] - x[1]).map(([p]) => p) };
}

// Pigeons out in space, to the Moon or Mars or round the Earth (functions/_moon.js): only how many
// (where on Earth they left from or are going is someone's home), and only those both ends allow
async function toTheMoon(D, t) {
  const ok = "COALESCE(a.hide_tracker, 0) = 0 AND COALESCE(b.hide_tracker, 0) = 0";
  const r = await D.prepare(`SELECT
      (SELECT COUNT(*) FROM pg_msgs m JOIN pg_users a ON a.id = m.sender JOIN pg_users b ON b.id = m.recipient
        WHERE m.moon IS NOT NULL AND m.sent_at <= ?1 AND m.deliver_at > ?1 AND (m.lost_at IS NULL OR m.lost_at > ?1) AND ${ok}) +
      (SELECT COUNT(*) FROM pg_gdeliv d JOIN pg_gmsgs g ON g.id = d.msg_id JOIN pg_users a ON a.id = g.sender JOIN pg_users b ON b.id = d.user_id
        WHERE d.moon IS NOT NULL AND g.sent_at <= ?1 AND d.deliver_at > ?1 AND (d.lost_at IS NULL OR d.lost_at > ?1) AND ${ok}) AS n`).bind(t).first();
  return r?.n || 0;
}

export async function trackerSnapshot(D, t) {
  const all = await inTheAir(D, t);
  const shown = [];
  for (const f of all) { if (f.hidden) continue; const v = trackerView(f, t); if (v) shown.push(v); }
  // shuffled, so the order says nothing either
  for (let i = shown.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shown[i], shown[j]] = [shown[j], shown[i]]; }
  return { at: Math.floor(t / FRESH) * FRESH, inAir: all.length, pigeons: shown, moon: await toTheMoon(D, t), today: await today(D, t) };
}

// (one copy per server, while it's fresh; and the edge keeps it for everyone near it)
let last = null;
async function tracker({ request, env, waitUntil }) {
  const key = new Request(new URL("/api/pigeon/tracker", request.url).href);     // the same for everyone: any query is ignored
  const cache = globalThis.caches?.default;
  const hit = cache && (await cache.match(key).catch(() => null));
  if (hit) return hit;
  const t = Date.now();
  if (!last || t - last.t >= FRESH) last = { t, body: trackerSnapshot(await db(env), t) };
  const body = await last.body.catch((e) => { last = null; throw e; });
  const res = json(body, 200, { "Cache-Control": `public, max-age=${FRESH / 1000}`, "Referrer-Policy": "no-referrer" });
  if (cache) waitUntil?.(cache.put(key, res.clone()).catch(() => {}));
  return res;
}

export const TRACKER_ROUTES = { "GET tracker": tracker };
