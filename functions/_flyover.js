/* ---------- flyover waves ----------
   When your pigeon flies over a friend's town on its way to someone else, that
   friend hears of it as it happens ("George's pigeon just flew over you") and
   can wave; you hear of the wave. They're only ever told that it was yours and
   that it flew over them: never who it was flying to, or where. Worked out
   when a pigeon takes off and again whenever its flight changes (it turns, is
   cheered on, or is called back), like near misses (functions/_moments.js). */
import { HOUR, HttpError, json, db, body, limit, requireUser, UUID_RE, haversineKm, chunks } from "./_pigeon.js";
import { stopsOf } from "./_moments.js";
import { wavedNote } from "./_notify.js";

export const OVER_KM = 40;            // this close to where they are: over them
const ENDS_KM = 100;                  // and well away from where it set off and where it lands: flying past, not leaving or arriving
export const WAVE_FOR = 12 * HOUR;    // how long after it flew over a wave still makes sense
const EARTH_KM = 6371.0088, RAD = Math.PI / 180;

function bearing(aLat, aLon, bLat, bLon) {
  const p1 = aLat * RAD, p2 = bLat * RAD, dl = (bLon - aLon) * RAD;
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
}
// How close a pigeon's path comes to a spot, and when it's there (each stretch
// a great circle at an even pace, as the map draws it).
export function nearest(stops, lat, lon) {
  let best = null;
  for (let i = 0; i < stops.length - 1; i++) {
    const [aLat, aLon, aT] = stops[i], [bLat, bLon, bT] = stops[i + 1], d12 = haversineKm(aLat, aLon, bLat, bLon) / EARTH_KM;
    let f = 0, km = haversineKm(aLat, aLon, lat, lon);
    if (d12 > 1e-9) {
      const d13 = km / EARTH_KM, th = bearing(aLat, aLon, lat, lon) - bearing(aLat, aLon, bLat, bLon);
      const xt = Math.asin(Math.sin(d13) * Math.sin(th));                                       // off to the side
      const along = Math.acos(Math.min(1, Math.max(-1, Math.cos(d13) / Math.cos(xt)))) * Math.sign(Math.cos(th));
      if (along >= d12) { f = 1; km = haversineKm(bLat, bLon, lat, lon); }
      else if (along > 0) { f = along / d12; km = Math.abs(xt) * EARTH_KM; }
    }
    if (!best || km < best.km) best = { km, at: Math.round(aT + (bT - aT) * f) };
  }
  return best;
}

// The sender's friends each of these flights passes over (the first time, if
// more than one does), kept. skip: who's in on it already.
async function flyFor(D, sender, id, skip, paths) {
  if (!paths.length) return 0;
  const { results } = await D.prepare(`SELECT u.id, u.lat, u.lon, u.place FROM pg_links l JOIN pg_users u ON u.id = CASE WHEN l.a = ?1 THEN l.b ELSE l.a END
    WHERE l.status = 'ok' AND (l.a = ?1 OR l.b = ?1) AND u.lat IS NOT NULL LIMIT 2000`).bind(sender).all();
  const found = [];
  for (const f of results) {
    if (skip.has(f.id)) continue;
    let best = null;
    for (const p of paths) {
      const s = p.stops[0], e = p.stops[p.stops.length - 1];
      if (haversineKm(s[0], s[1], f.lat, f.lon) < ENDS_KM || haversineKm(e[0], e[1], f.lat, f.lon) < ENDS_KM) continue;
      const n = nearest(p.stops, f.lat, f.lon);
      if (n && n.km <= OVER_KM && n.at > p.from && n.at < p.end && (!best || n.at < best.at)) best = n;
    }
    if (best) found.push({ ...f, ...best });
  }
  // (one it has already flown over keeps its moment)
  for (const part of chunks(found, 40)) await D.batch(part.map((x) => D.prepare(`INSERT INTO pg_flyover (msg_id, user_id, sender, at, km, lat, lon, place) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (msg_id, user_id) DO UPDATE SET at = excluded.at, km = excluded.km, lat = excluded.lat, lon = excluded.lon, place = excluded.place WHERE pg_flyover.told IS NULL`)
    .bind(id, x.id, sender, x.at, Math.round(x.km * 10) / 10, x.lat, x.lon, x.place)));
  return found.length;
}
const endOf = (r) => Math.min(r.deliver_at, r.lost_at ?? Infinity);
// One-to-one: from = only after then (its flight just changed).
export async function findFly(D, m, from = -Infinity) {
  if (!m || m.from_lat == null || m.to_lat == null || m.recalled) return 0;
  return flyFor(D, m.sender, m.id, new Set([m.sender, m.recipient, m.via].filter(Boolean)), [{ stops: stopsOf(m), from: Math.max(m.sent_at, from), end: endOf(m) }]);
}
// A group message: every pigeon of it, each from where its recipient's map
// starts it (a sender who isn't their friend: the coarse place).
export async function findGroupFly(D, id, from = -Infinity) {
  const m = await D.prepare("SELECT * FROM pg_gmsgs WHERE id = ?").bind(id).first();
  if (!m || m.from_lat == null) return 0;
  const { results: dels } = await D.prepare("SELECT * FROM pg_gdeliv WHERE msg_id = ?").bind(id).all();
  const { results: mem } = await D.prepare("SELECT user_id FROM pg_group_members WHERE group_id = ?").bind(m.group_id).all();
  const friends = new Set((await D.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'ok' AND (a = ?1 OR b = ?1)").bind(m.sender).all()).results.map((r) => r.id));
  const coarse = (x) => Math.round(x * 2) / 2;
  const paths = dels.filter((d) => d.to_lat != null && !d.recalled).map((d) => {
    const fr = friends.has(d.user_id); let legs = []; try { legs = d.legs ? JSON.parse(d.legs) : []; } catch (_) {}
    return { stops: [[fr ? m.from_lat : coarse(m.from_lat), fr ? m.from_lon : coarse(m.from_lon), m.sent_at], ...legs, [d.to_lat, d.to_lon, d.deliver_at]], from: Math.max(m.sent_at, from), end: endOf(d) };
  });
  return flyFor(D, m.sender, id, new Set([m.sender, ...mem.map((x) => x.user_id), ...dels.map((d) => d.user_id)]), paths);
}
// Its flight changed at t: the flyovers still ahead of it, again (or none, called back).
export const dropFly = (D, id, t) => D.prepare("DELETE FROM pg_flyover WHERE msg_id = ? AND at > ? AND told IS NULL").bind(id, t).run();
export async function refly(D, id, t) {
  await dropFly(D, id, t);
  return findFly(D, await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first(), t);
}
export async function reflyGroup(D, id, t) { await dropFly(D, id, t); return findGroupFly(D, id, t); }

// In a chat with a friend: their pigeons that flew over you, and yours that flew over them.
export async function flyViews(D, me, other) {
  const { results } = await D.prepare(`SELECT msg_id, sender, user_id, at, place, waved FROM pg_flyover WHERE told IS NOT NULL
    AND ((sender = ?1 AND user_id = ?2) OR (sender = ?2 AND user_id = ?1)) ORDER BY at DESC LIMIT 100`).bind(me, other).all();
  return results.reverse().map((r) => ({ id: r.msg_id, at: r.at, mine: r.sender === me, place: r.sender === me ? r.place : null, waved: r.waved || null }));
}
// On your own pigeons: who they flew over (for the map).
export async function flyOnMine(D, me, ids) {
  const out = new Map();
  for (const part of chunks([...new Set(ids)], 40)) {
    const { results } = await D.prepare(`SELECT msg_id, user_id, at, place, waved FROM pg_flyover WHERE sender = ? AND told IS NOT NULL AND msg_id IN (${part.map(() => "?").join(",")}) ORDER BY at`).bind(me, ...part).all();
    for (const r of results) { const l = out.get(r.msg_id) || []; l.push({ who: r.user_id, at: r.at, place: r.place, waved: r.waved || null }); out.set(r.msg_id, l); }
  }
  return out;
}

// Wave at a pigeon that flew over you: its sender hears of it.
async function wave({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "wave:" + u.id, 60, HOUR);
  const b = await body(request), id = String(b.id || ""), D = await db(env), t = Date.now();
  if (!UUID_RE.test(id)) throw new HttpError(400, "That pigeon wasn’t found.");
  const r = await D.prepare("SELECT * FROM pg_flyover WHERE msg_id = ? AND user_id = ? AND told IS NOT NULL").bind(id, u.id).first();
  if (!r) throw new HttpError(404, "That pigeon hasn’t flown over you.");
  if (!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(u.id, r.sender).first())) throw new HttpError(403, "You can only wave at friends’ pigeons.");
  if (r.waved) throw new HttpError(409, "You’ve already waved at this one.");
  if (t - r.at > WAVE_FOR) throw new HttpError(409, "It’s long gone. Wave at the next one.");
  const ok = await D.prepare("UPDATE pg_flyover SET waved = ? WHERE msg_id = ? AND user_id = ? AND waved IS NULL").bind(t, id, u.id).run();
  if (!ok.meta.changes) throw new HttpError(409, "You’ve already waved at this one.");
  waitUntil(wavedNote(env, r.sender, u, { id, place: r.place }).catch(() => {}));
  return json({ ok: true, waved: t });
}

export const FLY_ROUTES = { "POST wave": wave };
