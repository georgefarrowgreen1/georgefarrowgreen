/* ---------- named pigeons ----------
   Up to five pigeons of your own, each with a name and a career. When you send,
   one of them carries it (the one that's rested longest, or the one you pick),
   and it's credited with the miles when it lands. With the miles come stamina
   (it needs less rest between flights) and rank, from Fledgling to Legend:
   once around the world. A Legend can retire to your Hall of Fame. With Pigeon
   Death on, a named pigeon can be lost, and it's remembered there too. Everyone
   it flies to sees its name and rank; only you see its career.
   For a message to a group, your named pigeon flies the longest of its routes. */
import { HttpError, json, db, body, limit, requireUser, UUID_RE, HOUR } from "./_pigeon.js";
import { stopsOf, posAt } from "./_moments.js";
import { placeName } from "./_where.js";

export const BIRDS_MAX = 5;
// rank: from how far it has flown (km); a Legend has flown once around the world
export const RANKS = [["Fledgling", 0], ["Courier", 500], ["Navigator", 2000], ["Veteran", 8000], ["Ace", 20000], ["Legend", 40075]];
export const rankOf = (km) => RANKS.reduce((r, x) => (km >= x[1] ? x : r), RANKS[0])[0];
// stamina (20 to 100) grows with miles; rest after a flight shrinks with it
export const staminaOf = (km) => Math.round(20 + 80 * Math.min(1, km / 40075) ** 0.6);
export const restMs = (flight, km) => Math.round(Math.max(0, flight) * (0.5 - (0.4 * staminaOf(km)) / 100));

// A name: letters (any language), numbers, spaces, ' and -, up to 20 characters.
function cleanName(s) {
  const n = String(s ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
  if (!n) throw new HttpError(400, "Give your pigeon a name.");
  if ([...n].length > 20) throw new HttpError(400, "Pigeon names are up to 20 characters.");
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’.-]*$/u.test(n)) throw new HttpError(400, "Pigeon names use letters, numbers, spaces, hyphens and apostrophes.");
  return n;
}

// What its owner sees. flight: its trip in the air right now, if any ({ off, land }).
function birdView(b, t, flight) {
  const rank = rankOf(b.km), i = RANKS.findIndex((r) => r[0] === rank), next = RANKS[i + 1];
  const state = b.lost_at ? "lost" : b.retired_at ? "retired" : flight ? (t < flight.off ? "waiting" : "flying") : t < (b.busy_until ?? 0) ? "resting" : "ready";
  return {
    id: b.id, name: b.name, km: Math.round(b.km), flights: b.flights, longest: Math.round(b.longest), rank, stamina: staminaOf(b.km),
    next: next ? { rank: next[0], km: next[1] } : null, state, busyUntil: flight ? null : b.busy_until ?? null, landAt: flight?.land ?? null,
    lastAt: b.last_at ?? null, wear: b.wear || null, createdAt: b.created_at, retiredAt: b.retired_at ?? null, lostAt: b.lost_at ?? null, lostPlace: b.lost_place ?? null,
  };
}
// Its flights not yet settled: in the air (or booked), as their pigeons fly now (found from your pigeons, five at most,
// each only ever carrying your pigeons: so nothing to look through for someone with none)
const flightsQ = (D, uid) => D.prepare(`SELECT m.bird, m.sent_at AS off, m.deliver_at AS land, m.lost_at AS lost FROM pg_birds b
    JOIN pg_msgs m ON m.bird = b.id AND m.bird_done IS NULL WHERE b.owner = ?1
  UNION ALL SELECT m.bird, m.sent_at, d.deliver_at, d.lost_at FROM pg_birds b JOIN pg_gmsgs m ON m.bird = b.id AND m.bird_done IS NULL
    JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = m.bird_to WHERE b.owner = ?1`).bind(uid);
// Your pigeons and your Hall of Fame: the two questions (a sync asks them in its own one trip: functions/api/pigeon),
// then what they say, a flight that has ended since settled first (the tick settles them too, but not to the minute)
export const birdQs = (D, uid) => [D.prepare("SELECT * FROM pg_birds WHERE owner = ? ORDER BY created_at").bind(uid), flightsQ(D, uid)];
export async function birdsFrom(D, uid, t, [birds, flights]) {
  if (!birds.length) return { birds: [], hall: [] };
  if (flights.some((f) => f.land <= t || (f.lost != null && f.lost <= t))) {
    await settleBirds(D, t, uid);
    [birds, flights] = (await D.batch(birdQs(D, uid))).map((r) => r.results);
  }
  const fl = new Map(flights.map((r) => [r.bird, r]));
  const all = birds.map((b) => birdView(b, t, fl.get(b.id)));
  return { birds: all.filter((b) => b.state !== "lost" && b.state !== "retired"), hall: all.filter((b) => b.state === "lost" || b.state === "retired").sort((a, b) => (b.retiredAt || b.lostAt) - (a.retiredAt || a.lostAt)) };
}
export async function birdsFor(D, uid, t) {
  return birdsFrom(D, uid, t, (await D.batch(birdQs(D, uid))).map((r) => r.results));
}

// The pigeon you asked to carry this one, if it can fly now; it's busy until
// it lands and has rested. (If it can't, the message flies unnamed.)
export async function claimBird(D, uid, id, t, flight, land) {
  if (!id || !UUID_RE.test(String(id))) return null;
  await settleBirds(D, t, uid);
  const b = await D.prepare("SELECT * FROM pg_birds WHERE id = ? AND owner = ? AND retired_at IS NULL AND lost_at IS NULL").bind(id, uid).first();
  if (!b || (b.busy_until ?? 0) > t) return null;
  const r = await D.prepare(`UPDATE pg_birds SET busy_until = ?1, last_at = ?2 WHERE id = ?3 AND COALESCE(busy_until, 0) <= ?2
    AND NOT EXISTS (SELECT 1 FROM pg_msgs WHERE bird = ?3 AND bird_done IS NULL) AND NOT EXISTS (SELECT 1 FROM pg_gmsgs WHERE bird = ?3 AND bird_done IS NULL)`)
    .bind(land + restMs(flight, b.km), t, id).run();
  return r.meta.changes ? { id: b.id, name: b.name, rank: rankOf(b.km), wear: b.wear || null } : null;
}
// A booked pigeon that never left: its named pigeon is free again
export const freeBird = (D, id, t) => (id ? D.prepare("UPDATE pg_birds SET busy_until = ? WHERE id = ?").bind(t, id).run() : null);

// Flights that have ended since: miles and rank for those that landed, a trip
// home for those called back, the Hall of Fame for those lost.
export async function settleBirds(D, t, owner = null) {
  const by = owner ? "AND sender = ?2" : "", args = owner ? [t, owner] : [t];
  const { results: one } = await D.prepare(`SELECT * FROM pg_msgs WHERE bird IS NOT NULL AND bird_done IS NULL
    AND (deliver_at <= ?1 OR (lost_at IS NOT NULL AND lost_at <= ?1)) ${by} LIMIT 100`).bind(...args).all();
  for (const m of one) await settle(D, t, "pg_msgs", m);
  const { results: grp } = await D.prepare(`SELECT m.id, m.bird, m.sent_at, m.from_lat, m.from_lon, d.km, d.deliver_at, d.lost_at, d.recalled, d.legs, d.to_lat, d.to_lon
    FROM pg_gmsgs m JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = m.bird_to WHERE m.bird IS NOT NULL AND m.bird_done IS NULL
    AND (d.deliver_at <= ?1 OR (d.lost_at IS NOT NULL AND d.lost_at <= ?1)) ${by.replace("sender", "m.sender")} LIMIT 100`).bind(...args).all();
  for (const m of grp) await settle(D, t, "pg_gmsgs", m);
}
async function settle(D, t, table, m) {
  const c = await D.prepare(`UPDATE ${table} SET bird_done = ? WHERE id = ? AND bird_done IS NULL`).bind(t, m.id).run();
  if (!c.meta.changes) return;
  const b = await D.prepare("SELECT * FROM pg_birds WHERE id = ?").bind(m.bird).first(); if (!b) return;
  const lost = m.lost_at != null && m.lost_at < m.deliver_at;
  if (lost && m.recalled) {          // called back: it flies home again, then rests
    await D.prepare("UPDATE pg_birds SET busy_until = ? WHERE id = ?").bind(m.lost_at + (m.lost_at - m.sent_at), b.id).run();
    return;
  }
  if (lost) {                        // Pigeon Death
    let place = null; try { place = m.from_lat != null && m.to_lat != null ? placeName(...posAt(stopsOf(m), m.lost_at)) : null; } catch (_) {}
    await D.prepare("UPDATE pg_birds SET lost_at = ?, lost_place = ?, busy_until = NULL WHERE id = ?").bind(m.lost_at, place, b.id).run();
    return;
  }
  const km = Math.max(0, m.km || 0), before = rankOf(b.km), after = rankOf(b.km + km);
  await D.prepare("UPDATE pg_birds SET km = km + ?1, flights = flights + 1, longest = MAX(longest, ?1), busy_until = ?2 WHERE id = ?3")
    .bind(km, m.deliver_at + restMs(m.deliver_at - m.sent_at, b.km), b.id).run();
  if (after !== before) await D.prepare(`UPDATE ${table} SET bird_up = ? WHERE id = ?`).bind(after, m.id).run();
}

async function create({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "birds:" + u.id, 30, HOUR);
  const name = cleanName((await body(request)).name), D = await db(env), t = Date.now();
  const { results } = await D.prepare("SELECT name FROM pg_birds WHERE owner = ? AND retired_at IS NULL AND lost_at IS NULL").bind(u.id).all();
  if (results.length >= BIRDS_MAX) throw new HttpError(409, `You can have ${BIRDS_MAX} named pigeons at once. Retire a Legend to make room.`);
  if (results.some((b) => b.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `You already have a pigeon called ${name}.`);
  await D.prepare("INSERT INTO pg_birds (id, owner, name, created_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), u.id, name, t).run();
  return json(await birdsFor(D, u.id, t));
}
async function rename({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "birds:" + u.id, 30, HOUR);
  const b = await body(request), id = String(b.id || ""), name = cleanName(b.name), D = await db(env), t = Date.now();
  if (!UUID_RE.test(id)) throw new HttpError(404, "That pigeon wasn’t found.");
  const dup = await D.prepare("SELECT 1 FROM pg_birds WHERE owner = ? AND id != ? AND LOWER(name) = LOWER(?) AND retired_at IS NULL AND lost_at IS NULL").bind(u.id, id, name).first();
  if (dup) throw new HttpError(409, `You already have a pigeon called ${name}.`);
  const r = await D.prepare("UPDATE pg_birds SET name = ? WHERE id = ? AND owner = ? AND retired_at IS NULL AND lost_at IS NULL").bind(name, id, u.id).run();
  if (!r.meta.changes) throw new HttpError(404, "That pigeon wasn’t found.");
  return json(await birdsFor(D, u.id, t));
}
async function retire({ request, env }) {
  const u = await requireUser(request, env);
  const id = String((await body(request)).id || ""), D = await db(env), t = Date.now();
  const all = await birdsFor(D, u.id, t), b = all.birds.find((x) => x.id === id);
  if (!b) throw new HttpError(404, "That pigeon wasn’t found.");
  if (b.rank !== "Legend") throw new HttpError(409, `Only Legends retire. ${b.name} has ${Math.ceil((40075 - b.km) * 0.621371).toLocaleString("en-GB")} miles to go.`);
  if (b.state === "flying" || b.state === "waiting") throw new HttpError(409, `${b.name} is still flying. Retire it once it lands.`);
  await D.prepare("UPDATE pg_birds SET retired_at = ? WHERE id = ? AND owner = ? AND retired_at IS NULL").bind(t, id, u.id).run();
  return json(await birdsFor(D, u.id, t));
}
async function list({ request, env }) {
  const u = await requireUser(request, env);
  return json(await birdsFor(await db(env), u.id, Date.now()));
}

export const BIRD_ROUTES = { "GET birds": list, "POST birds": create, "POST bird-name": rename, "POST bird-retire": retire };
