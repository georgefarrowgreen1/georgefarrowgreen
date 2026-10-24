/* ---------- the passport ----------
   Every country and sea your pigeons have flown over: stamped the first time,
   counted every time after. Each flight is stamped once, when it has landed,
   along the way it really flew (great circles, any turns and stopovers),
   naming a point every 20 km from a quarter-degree map of the same names the
   app's map uses (functions/_placegrid.js), so it costs next to nothing.
   Where it set off and where it landed are the country nearest (people live
   on land, even where the map's coastline is a little rough).

   What counts: your own pigeons that landed. In a group, only those to your
   friends: a pigeon to someone who isn't would say roughly where they are. */
import { json, db, requireUser, gcPoint, haversineKm } from "./_pigeon.js";
import { stopsOf } from "./_moments.js";
import { countryNear } from "./_where.js";
import { placeAt } from "./_placegrid.js";
import { marksAlong } from "./_landmarks.js";
import { ensureFeathers, earn, flightFeathers } from "./_feathers.js";
import { SEAS } from "../pigeon/countries.js";
import { spaceMarks } from "../pigeon/space.js";
import { spacePlace } from "./_moon.js";

const EVERY_KM = 20;
// the seas and oceans (the rest are countries)
const SEA = new Set([...SEAS.map((s) => s[0]), "the Arctic Ocean", "the Southern Ocean", "the North Atlantic", "the South Atlantic", "the Indian Ocean", "the North Pacific", "the South Pacific"]);
export const isSea = (p) => SEA.has(p);
// the stamps from off the Earth (or round it): in the passport, but not countries
const OFF_WORLD = new Set(["the Moon", "Mars", "Low Earth Orbit"]);

// the places along a pigeon's way, in order, each once
export function placesAlong(stops) {
  const out = [], add = (p) => { if (p && p !== "land" && !out.includes(p)) out.push(p); };
  add(countryNear(stops[0][0], stops[0][1]));
  for (let i = 0; i < stops.length - 1; i++) {
    const [aLat, aLon] = stops[i], [bLat, bLon] = stops[i + 1];
    const n = Math.max(1, Math.ceil(haversineKm(aLat, aLon, bLat, bLon) / EVERY_KM));
    for (let k = 1; k < n; k++) { const [la, lo] = gcPoint(aLat, aLon, bLat, bLon, k / n); add(placeAt(la, lo)); }
  }
  const end = stops[stops.length - 1];
  add(countryNear(end[0], end[1]));
  return out;
}

// Stamp flights that have landed and aren't stamped yet: one person's (as
// they open their passport), or anyone's (from the tick). Oldest first, a few
// at a time (a long flight takes up to a millisecond, and a request has only
// so much time), so older flights fill in over a few runs; a flight is only
// ever stamped once, even if two of these run together.
export async function stampPassports(D, t, uid = null, max = 12) {
  const mine = uid ? "AND m.sender = ?2" : "", args = uid ? [t, uid] : [t];
  const { results: one } = await D.prepare(`SELECT m.id, m.sender, m.km, m.from_lat, m.from_lon, m.to_lat, m.to_lon, m.sent_at, m.deliver_at, m.legs FROM pg_msgs m
    WHERE m.deliver_at <= ?1 AND m.lost_at IS NULL AND m.from_lat IS NOT NULL AND m.to_lat IS NOT NULL ${mine}
    AND NOT EXISTS (SELECT 1 FROM pg_stamped s WHERE s.id = m.id) ORDER BY m.deliver_at LIMIT ${max}`).bind(...args).all();
  const { results: grp } = await D.prepare(`SELECT m.id || ':' || d.user_id AS id, m.sender, d.km, m.from_lat, m.from_lon, d.to_lat, d.to_lon, m.sent_at, d.deliver_at, d.legs
    FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
    WHERE d.deliver_at <= ?1 AND d.lost_at IS NULL AND m.from_lat IS NOT NULL AND d.to_lat IS NOT NULL ${mine}
    AND EXISTS (SELECT 1 FROM pg_links l WHERE l.status = 'ok' AND ((l.a = m.sender AND l.b = d.user_id) OR (l.a = d.user_id AND l.b = m.sender)))
    AND NOT EXISTS (SELECT 1 FROM pg_stamped s WHERE s.id = m.id || ':' || d.user_id) ORDER BY d.deliver_at LIMIT ${max}`).bind(...args).all();
  // off the Earth or round it (functions/_moon.js): no countries or seas on the way, just the Moon, Mars or
  // Low Earth Orbit, and the postmarks of where it landed (or bounded past)
  const { results: lunar } = await D.prepare(`SELECT m.id, m.sender, m.km, m.sent_at, m.deliver_at, m.moon FROM pg_msgs m
    WHERE m.deliver_at <= ?1 AND m.lost_at IS NULL AND m.moon IS NOT NULL ${mine}
    AND NOT EXISTS (SELECT 1 FROM pg_stamped s WHERE s.id = m.id) ORDER BY m.deliver_at LIMIT ${max}`).bind(...args).all();
  const { results: glunar } = await D.prepare(`SELECT m.id || ':' || d.user_id AS id, m.sender, d.km, m.sent_at, d.deliver_at, d.moon
    FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
    WHERE d.deliver_at <= ?1 AND d.lost_at IS NULL AND d.moon IS NOT NULL ${mine}
    AND EXISTS (SELECT 1 FROM pg_links l WHERE l.status = 'ok' AND ((l.a = m.sender AND l.b = d.user_id) OR (l.a = d.user_id AND l.b = m.sender)))
    AND NOT EXISTS (SELECT 1 FROM pg_stamped s WHERE s.id = m.id || ':' || d.user_id) ORDER BY d.deliver_at LIMIT ${max}`).bind(...args).all();
  const flights = [...one, ...grp, ...[...lunar, ...glunar].map((f) => ({ ...f, lunar: true }))].sort((a, b) => a.deliver_at - b.deliver_at).slice(0, max);
  if (flights.length) await ensureFeathers(D);         // (everyone's feathers so far, before any more are earned)
  for (const f of flights) {
    let places = [], marks = [];
    if (f.lunar) {
      try {
        // (one that followed someone off the Earth: the countries and seas it crossed before it was handed on, then space)
        const mn = JSON.parse(f.moon), legs = mn.prev ? [mn.prev, mn] : [mn], ground = legs.find((l) => l.ground)?.ground;
        places = [...new Set([...(ground ? placesAlong(ground) : []), ...legs.map(spacePlace)])]; marks = [...new Set([...(ground ? marksAlong(ground) : []), ...legs.flatMap(spaceMarks)])];
      } catch (_) {}
    }
    else try { const st = stopsOf(f); places = placesAlong(st); marks = marksAlong(st); } catch (_) {}
    const r = await D.prepare("INSERT OR IGNORE INTO pg_stamped (id, user_id, at, places, marks) VALUES (?, ?, ?, ?, ?)").bind(f.id, f.sender, f.deliver_at, JSON.stringify(places), marks.length ? JSON.stringify(marks) : null).run();
    if (!r.meta.changes) continue;
    // feathers: for the flight, each country or sea new to the passport, each new postmark
    const had = async (table, col, list) => (list.length ? new Set((await D.prepare(`SELECT ${col} AS k FROM ${table} WHERE user_id = ? AND ${col} IN (${list.map(() => "?").join(",")})`).bind(f.sender, ...list).all()).results.map((x) => x.k)) : new Set());
    const [oldP, oldM] = [await had("pg_passport", "place", places), await had("pg_postmarks", "mark", marks)];
    await D.batch([earn(D, f.sender, "f:" + f.id, flightFeathers(f.km), "flight", f.deliver_at),
      ...places.filter((p) => !oldP.has(p)).map((p) => earn(D, f.sender, "p:" + p, 3, "place", f.deliver_at)),
      ...marks.filter((k) => !oldM.has(k)).map((k) => earn(D, f.sender, "l:" + k, 10, "mark", f.deliver_at))]);
    // the landmarks it flew past: postmarks on the letter, and in its sender's collection
    if (marks.length) await D.batch(marks.map((k) => D.prepare(`INSERT INTO pg_postmarks (user_id, mark, first_at, first_id, n) VALUES (?1, ?2, ?3, ?4, 1)
      ON CONFLICT (user_id, mark) DO UPDATE SET n = n + 1, first_id = CASE WHEN excluded.first_at < first_at THEN excluded.first_id ELSE first_id END,
        first_at = MIN(first_at, excluded.first_at)`).bind(f.sender, k, f.deliver_at, f.id.split(":")[0])));
    if (!places.length) continue;
    // (first_id: the message, for a group whichever of its pigeons; first_ord: where on its way)
    await D.batch(places.map((p, i) => D.prepare(`INSERT INTO pg_passport (user_id, place, first_at, first_id, first_ord, n) VALUES (?1, ?2, ?3, ?4, ?5, 1)
      ON CONFLICT (user_id, place) DO UPDATE SET n = n + 1,
        first_id = CASE WHEN excluded.first_at < first_at THEN excluded.first_id ELSE first_id END,
        first_ord = CASE WHEN excluded.first_at < first_at THEN excluded.first_ord ELSE first_ord END, first_at = MIN(first_at, excluded.first_at)`).bind(f.sender, p, f.deliver_at, f.id.split(":")[0], i)));
  }
  return flights.length;
}
// Your passport: each place, when your pigeons first flew over it, and how often since,
// and the journey that stamped it (trip: its message, ord: where on its way), so the
// passport's pages can be filled journey by journey; trips: each journey's ends (yours,
// so nothing you don't know), and whether it crossed an ocean by ship
export async function passportFor(D, uid, t) {
  const { results } = await D.prepare("SELECT place, first_at, first_id, first_ord, n FROM pg_passport WHERE user_id = ? AND first_at <= ? ORDER BY first_at DESC, first_ord").bind(uid, t).all();
  const places = results.map((r) => ({ name: r.place, at: r.first_at, n: r.n, sea: isSea(r.place), trip: r.first_id || null, ord: r.first_ord ?? 0 }));
  const ids = [...new Set(places.map((p) => p.trip).filter(Boolean))], trips = {};
  const sailed = (legs) => { try { return JSON.parse(legs || "[]").some((l) => l[3] === "b"); } catch (_) { return false; } };
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90), q = part.map(() => "?").join(",");
    const { results: one } = await D.prepare(`SELECT id, from_place, to_place, legs FROM pg_msgs WHERE sender = ? AND id IN (${q})`).bind(uid, ...part).all();
    for (const m of one) trips[m.id] = { from: m.from_place || null, to: m.to_place || null, ship: sailed(m.legs) };
    const { results: grp } = await D.prepare(`SELECT m.id, m.from_place, g.name AS to_place, (SELECT d.legs FROM pg_gdeliv d WHERE d.msg_id = m.id AND d.legs LIKE '%"b"%' LIMIT 1) AS legs
      FROM pg_gmsgs m LEFT JOIN pg_groups g ON g.id = m.group_id WHERE m.sender = ? AND m.id IN (${q})`).bind(uid, ...part).all();
    for (const m of grp) trips[m.id] = { from: m.from_place || null, to: m.to_place || null, ship: sailed(m.legs) };
    // (a journey whose message has gone, after a month: its line, kept)
    const { results: kept } = await D.prepare(`SELECT f.msg_id, f.from_place, CASE WHEN f.grp = 1 THEN g.name ELSE f.to_place END AS to_place, MAX(f.ship) AS ship
      FROM pg_flights f LEFT JOIN pg_groups g ON g.id = f.group_id WHERE f.sender = ? AND f.msg_id IN (${q}) GROUP BY f.msg_id`).bind(uid, ...part).all();
    for (const m of kept) trips[m.msg_id] ||= { from: m.from_place || null, to: m.to_place || null, ship: !!m.ship };
  }
  return { places, countries: places.filter((p) => !p.sea && !OFF_WORLD.has(p.name)).length, seas: places.filter((p) => p.sea).length, trips };
}
// For a chat: the stamps each of your flights there was the first to collect, in the order it flew them
export async function newStamps(D, uid, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const { results } = await D.prepare("SELECT first_id, place FROM pg_passport WHERE user_id = ? AND first_id IN (SELECT value FROM json_each(?)) ORDER BY first_at, first_ord").bind(uid, JSON.stringify(ids)).all();
  for (const r of results) out.set(r.first_id, [...(out.get(r.first_id) || []), r.place]);
  return out;
}

async function passport({ request, env }) {
  const u = await requireUser(request, env), D = await db(env), t = Date.now();
  await stampPassports(D, t, u.id, 20);
  return json(await passportFor(D, u.id, t));
}
export const PASSPORT_ROUTES = { "GET passport": passport };
