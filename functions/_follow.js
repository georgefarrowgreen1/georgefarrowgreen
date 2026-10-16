/* ---------- following someone to another world ----------
   When someone moves off the Earth, back to it, or between the Moon and Mars, the pigeons already
   on their way to them follow (a friend's, as on Earth; in a group, anyone's but a blocked sender's):
   - an Earth pigeon in the air is handed to a space pigeon wherever it is, and goes on from there
     (a lunar pigeon for the Moon, a laser one for Mars). One still in its loft takes off as one.
   - a space pigeon can't turn round in space: it carries on to where they were, and is relayed
     on from there (laser if Mars is either end, else lunar).
   - a new spot on the same world: it heads there instead (an orbit picks its pass again).
   An Earth pigeon to someone moving about on Earth is reroute's ([[path]].js, _groups.js).

   A handed-off pigeon becomes a space flight like any other (no Earth places on its row), its
   leg starting when it was handed on (moon.t0). A relayed one keeps the leg it was on as
   moon.prev, so the trip can still be drawn from the start (pigeon/space.js legOf). */
import { MIN, RISKY_SPEED, haversineKm } from "./_pigeon.js";
import { spaceFlight } from "./_moon.js";
import { stopsOf, posAt, dropNear } from "./_moments.js";
import { placeName } from "./_where.js";
import { bodyOf } from "../pigeon/space.js";
import { pigeonFollowed, followingYou } from "./_notify.js";
import { dropFly, reflyGroup } from "./_flyover.js";

const coarse = (x) => Math.round(x * 2) / 2;
const legKind = (a, b) => (bodyOf(a) === "mars" || bodyOf(b) === "mars" ? "laser" : bodyOf(a) === "earth" && bodyOf(b) === "earth" ? "orbital" : "lunar");
const speedOf = (kind, risky) => (risky && kind.startsWith("lunar") ? RISKY_SPEED : 1);
const bare = ({ km, ms, ...way }) => way;
// (a doomed pigeon is still lost, as far along its new way as it was going to be on the old one)
const relost = (p, t, deliver) => {
  if (p.lost_at == null) return null;
  const base = Math.max(t, p.sent_at);
  return Math.round(base + ((p.lost_at - base) / Math.max(1, p.deliver_at - base)) * (deliver - base));
};
const near = (a, b) => a.b === b.b && (a.b === "earth" ? haversineKm(a.lat, a.lon, b.lat, b.lon) < 1 : Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05);

// What becomes of one pigeon on its way to `end` (where they are now): { moon, deliver, km, lostAt }, or
// null when it lands where it was going after all. p: its row (a group delivery joined with its message).
export function followOne(p, end, t) {
  let mn = null; try { mn = p.moon ? JSON.parse(p.moon) : null; } catch (_) { return null; }
  // an Earth pigeon, to someone who's left the Earth: handed on from where it is (or, still in its loft, from home)
  if (!mn) {
    if (end.b === "earth" || p.to_lat == null) return null;
    // (still in its loft: from home when it takes off; resting with a friend: from theirs when it would fly on)
    const waiting = t < p.sent_at, resting = !waiting && p.via && t < p.via_off, t0 = waiting ? p.sent_at : resting ? p.via_off : t;
    const [la, lo] = waiting ? [p.from_lat, p.from_lon] : posAt(stopsOf(p), t0);
    const from = { b: "earth", lat: coarse(la), lon: coarse(lo), place: placeName(la, lo) || null };
    const kind = legKind(from, end), f = spaceFlight(kind, from, end, t0, speedOf(kind, p.risky)), deliver = t0 + f.ms;
    const flown = waiting ? 0 : (p.km || 0) * Math.min(1, (t0 - p.sent_at) / Math.max(1, p.deliver_at - p.sent_at));
    // the way it flew on Earth first, so its passport still gets the countries it crossed (to 0.01°)
    const r2 = (x) => Math.round(x * 100) / 100, st = stopsOf(p);
    const ground = waiting ? null : [...st.slice(0, -1).filter((s) => s[2] < t0).map((s) => [r2(s[0]), r2(s[1]), s[2]]), [r2(la), r2(lo), t0]];
    return { how: "hand", moon: { ...bare(f), from, to: end, t0, pk: kind, hand: 1, ...(resting ? { rested: 1 } : {}), ...(ground && ground.length > 1 ? { ground } : {}) },
      deliver, km: Math.round(flown + f.km), lostAt: relost(p, t, deliver) };
  }
  const kind = mn.pk || p.pigeon, t0 = mn.t0 ?? p.sent_at;
  // the same world: it heads for the new spot, from where its leg began
  if (bodyOf(mn.to) === end.b) {
    if (near(mn.to, end)) return null;
    const was = spaceFlight(kind, mn.from, mn.to, t0, speedOf(kind, p.risky)), f = spaceFlight(kind, mn.from, end, t0, speedOf(kind, p.risky));
    const deliver = Math.max(t + MIN, t0 + f.ms);
    return { how: "same", moon: { ...mn, ...bare(f), to: end }, deliver, km: Math.max(0, Math.round((p.km || 0) - was.km + f.km)), lostAt: relost(p, t, deliver) };
  }
  // another world. Still on the leg before a relay: the relay goes on from where that leg ends instead
  if (mn.prev && t < mn.t0) {
    const k2 = legKind(mn.from, end), f = spaceFlight(k2, mn.from, end, mn.t0, speedOf(k2, p.risky)), deliver = mn.t0 + f.ms;
    const was = spaceFlight(kind, mn.from, mn.to, mn.t0, speedOf(kind, p.risky));
    return { how: "relay", moon: { ...bare(f), from: mn.from, to: end, t0: mn.t0, pk: k2, prev: mn.prev }, deliver, km: Math.max(0, Math.round((p.km || 0) - was.km + f.km)), lostAt: relost(p, t, deliver) };
  }
  // on its way through space: it gets there, then it's relayed on
  const { prev: _drop, ...leg } = mn, k2 = legKind(mn.to, end), f = spaceFlight(k2, mn.to, end, p.deliver_at, speedOf(k2, p.risky)), deliver = p.deliver_at + f.ms;
  return { how: "relay", moon: { ...bare(f), from: mn.to, to: end, t0: p.deliver_at, pk: k2, prev: { ...leg, t0 } }, deliver, km: Math.round((p.km || 0) + f.km), lostAt: relost(p, t, deliver) };
}

// Everything on its way to u, after they moved (end: their new end, as endOf gives it). Off the Earth,
// Earth pigeons are handed on too; on it, only space pigeons are looked at (reroute has the rest).
export async function followMe(env, D, u, end, t, waitUntil, friends, blocked) {
  if (!end) return;
  const away = end.b !== "earth"; let n = 0;
  const { results: one } = await D.prepare(`SELECT * FROM pg_msgs WHERE recipient = ?1 AND deliver_at > ?2 AND (lost_at IS NULL OR lost_at > ?2)
    AND (moon IS NOT NULL ${away ? "OR to_lat IS NOT NULL" : ""})`).bind(u.id, t).all();
  for (const m of one) {
    if (!friends.has(m.sender)) continue;                       // (only a friend's follows you, as on Earth)
    const x = followOne(m, end, t); if (!x) continue;
    const r = await D.prepare(`UPDATE pg_msgs SET moon = ?, deliver_at = ?, km = ?, lost_at = ?, to_place = ?, moon_told = NULL,
      from_lat = NULL, from_lon = NULL, to_lat = NULL, to_lon = NULL, legs = NULL, wx = NULL, wx_ms = NULL, wx_at = NULL, ship_told = NULL,
      expires_at = CASE WHEN photo = 1 THEN ? ELSE expires_at END WHERE id = ? AND deliver_at = ?`)
      .bind(JSON.stringify(x.moon), x.deliver, x.km, x.lostAt, end.place, (x.lostAt ?? x.deliver) + PHOTO_TTL_MS, m.id, m.deliver_at).run();
    if (!r.meta.changes) continue;
    if (!m.moon) { waitUntil(dropNear(D, m.id, -Infinity).catch(() => {})); waitUntil(dropFly(D, m.id, -Infinity).catch(() => {})); }
    waitUntil(pigeonFollowed(env, m.sender, { ...u, place: end.place }, end, x).catch(() => {})); n++;
  }
  const { results: grp } = await D.prepare(`SELECT d.*, m.sender, m.sent_at, m.from_lat, m.from_lon, m.pigeon, m.risky, m.group_id, m.photo FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
    WHERE d.user_id = ?1 AND d.deliver_at > ?2 AND (d.lost_at IS NULL OR d.lost_at > ?2) AND (d.moon IS NOT NULL ${away ? "OR d.to_lat IS NOT NULL" : ""})`).bind(u.id, t).all();
  for (const d of grp) {
    if (blocked.has(d.sender)) continue;                        // (a move isn't followed, so isn't told, across a block)
    const x = followOne(d, end, t); if (!x) continue;
    const r = await D.prepare(`UPDATE pg_gdeliv SET moon = ?, deliver_at = ?, km = ?, lost_at = ?, to_place = ?, to_lat = NULL, to_lon = NULL, legs = NULL, wx = NULL, wx_ms = NULL, wx_at = NULL, ship_told = NULL
      WHERE msg_id = ? AND user_id = ? AND deliver_at = ?`).bind(JSON.stringify(x.moon), x.deliver, x.km, x.lostAt, end.place, d.msg_id, u.id, d.deliver_at).run();
    if (!r.meta.changes) continue;
    if (d.photo === 1) await D.prepare("UPDATE pg_gmsgs SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?").bind((x.lostAt ?? x.deliver) + PHOTO_TTL_MS, d.msg_id).run();
    if (!d.moon) waitUntil(reflyGroup(D, d.msg_id, t).catch(() => {}));
    if (friends.has(d.sender)) waitUntil(pigeonFollowed(env, d.sender, { ...u, place: end.place }, end, x, d.group_id).catch(() => {}));
    n++;
  }
  // and they hear that what was on its way is coming too (once, however many)
  if (n && end.b !== "earth") waitUntil(followingYou(env, u.id, n, end).catch(() => {}));
}
const PHOTO_TTL_MS = 24 * 3600e3;
