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

const EVERY_KM = 20;
// the seas and oceans (the rest are countries)
const SEA = new Set([...SEAS.map((s) => s[0]), "the Arctic Ocean", "the Southern Ocean", "the North Atlantic", "the South Atlantic", "the Indian Ocean", "the North Pacific", "the South Pacific"]);
export const isSea = (p) => SEA.has(p);

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
  const flights = [...one, ...grp].sort((a, b) => a.deliver_at - b.deliver_at).slice(0, max);
  if (flights.length) await ensureFeathers(D);         // (everyone's feathers so far, before any more are earned)
  for (const f of flights) {
    let places = [], marks = [];
    try { const st = stopsOf(f); places = placesAlong(st); marks = marksAlong(st); } catch (_) {}
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
// Your passport: each place, when your pigeons first flew over it, and how often since
export async function passportFor(D, uid, t) {
  const { results } = await D.prepare("SELECT place, first_at, n FROM pg_passport WHERE user_id = ? AND first_at <= ? ORDER BY first_at DESC, first_ord").bind(uid, t).all();
  const places = results.map((r) => ({ name: r.place, at: r.first_at, n: r.n, sea: isSea(r.place) }));
  return { places, countries: places.filter((p) => !p.sea).length, seas: places.filter((p) => p.sea).length };
}
// For a chat: the stamps each of your flights there was the first to collect, in the order it flew them
export async function newStamps(D, uid, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await D.prepare(`SELECT first_id, place FROM pg_passport WHERE user_id = ? AND first_id IN (${part.map(() => "?").join(",")}) ORDER BY first_at, first_ord`).bind(uid, ...part).all();
    for (const r of results) out.set(r.first_id, [...(out.get(r.first_id) || []), r.place]);
  }
  return out;
}

async function passport({ request, env }) {
  const u = await requireUser(request, env), D = await db(env), t = Date.now();
  await stampPassports(D, t, u.id, 20);
  return json(await passportFor(D, u.id, t));
}
export const PASSPORT_ROUTES = { "GET passport": passport };
