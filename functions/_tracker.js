/* ---------- the live tracker: every pigeon in the air, for anyone, with no one in it ----------
   chat.georgefarrowgreen.com/tracker (pigeon/tracker.js) draws this on a world map.
   It's public, so nothing here may lead back to a person:

   - No names, handles, places, messages, times, routes or ids. Each pigeon is only
     roughly where it is, which way it's heading, what kind it is and what it's over.
   - Never near either end: not within NEAR_HOME km of where it set off or where it's
     going (more on a long flight), nor of anywhere it stops (a friend on the way, an
     island, a port), and not while it's resting. A pigeon only shows out in the open.
   - Only roughly: snapped to a GRID° grid (about 55 km) and the nearest of 8 headings.
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

export const NEAR_HOME = 150, SHORT = 300, GRID = 0.5, FRESH = 60e3;
const KINDS = new Set(["standard", "swift", "turbo", "rocket"]);
const HEADINGS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

const snap = (x) => Math.round(x / GRID) * GRID;
function bearing(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, y = Math.sin((bLon - aLon) * r) * Math.cos(bLat * r);
  const x = Math.cos(aLat * r) * Math.sin(bLat * r) - Math.sin(aLat * r) * Math.cos(bLat * r) * Math.cos((bLon - aLon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

// One pigeon as the tracker may show it, or null when it mustn't be shown (yet).
export function trackerView(f, t) {
  if (!(f.sent_at <= t && t < f.deliver_at) || (f.lost_at != null && f.lost_at <= t)) return null;
  const stops = stopsOf(f), from = stops[0], to = stops.at(-1);
  if (from[0] == null || to[0] == null) return null;
  const trip = haversineKm(from[0], from[1], to[0], to[1]);
  if (trip < SHORT) return null;
  const here = posAt(stops, t), ahead = posAt(stops, t + 10 * 60e3);
  if (haversineKm(here[0], here[1], ahead[0], ahead[1]) < 1) return null;          // resting, or waiting for a ship
  // clear of both ends (a long flight keeps further away, up to 400 km) and of every stop on the way
  const keep = Math.max(NEAR_HOME, Math.min(400, trip * 0.1));
  if (haversineKm(here[0], here[1], from[0], from[1]) < keep || haversineKm(here[0], here[1], to[0], to[1]) < keep) return null;
  for (let i = 1; i < stops.length - 1; i++) {
    const [a, b] = [stops[i], stops[i + 1]];
    if (haversineKm(a[0], a[1], b[0], b[1]) < 1 && haversineKm(here[0], here[1], a[0], a[1]) < NEAR_HOME) return null;
  }
  const lat = snap(here[0]), lon = snap(((here[1] + 540) % 360) - 180);
  const h = Math.round(bearing(here[0], here[1], ahead[0], ahead[1]) / 45) % 8;
  return { lat, lon, h: HEADINGS[h], k: f.mystery ? "mystery" : KINDS.has(f.pigeon) ? f.pigeon : "standard", over: placeName(lat, lon) };
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

export async function trackerSnapshot(D, t) {
  const all = await inTheAir(D, t);
  const shown = [];
  for (const f of all) { if (f.hidden) continue; const v = trackerView(f, t); if (v) shown.push(v); }
  // shuffled, so the order says nothing either
  for (let i = shown.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shown[i], shown[j]] = [shown[j], shown[i]]; }
  return { at: Math.floor(t / FRESH) * FRESH, inAir: all.length, pigeons: shown };
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
