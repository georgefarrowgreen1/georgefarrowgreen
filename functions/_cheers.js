/* ---------- cheer it on ----------
   Anyone in a chat can cheer a pigeon in the air: each cheer takes a little
   off the time it has left (CHEER_CUT of it, CHEER_MOST at most: a little
   tailwind, not a shortcut across the world), up to CHEER_EACH cheers from
   each person and CHEER_MAX in all. Where it is now becomes a point on its
   path (marked "c", so the map doesn't draw it as a turn), so it doesn't jump
   ahead: it just flies on faster. In a group, the sender can cheer on every
   pigeon the message is still flying, and each member the one flying to them
   (all they can see). Whoever's on the other end is told. */
import { MIN, HOUR, PHOTO_TTL, HttpError, json, db, body, limit, requireUser, UUID_RE } from "./_pigeon.js";
import { posAt, renear } from "./_moments.js";
import { cheeredNote } from "./_notify.js";
import { refly, reflyGroup } from "./_flyover.js";

export const CHEER_CUT = 0.04, CHEER_MOST = 15 * MIN, CHEER_EACH = 3, CHEER_MAX = 12;
const coarse = (x) => (x == null ? x : Math.round(x * 2) / 2);
const byOf = (row) => { try { return JSON.parse(row.cheer_by || "{}") || {}; } catch (_) { return {}; } };

// The flight from now on, cheered: lands sooner, from where it is now.
function plan(start, row, t) {
  let legs = []; try { legs = row.legs ? JSON.parse(row.legs) : []; } catch (_) {}
  const stops = [start, ...legs, [row.to_lat, row.to_lon, row.deliver_at]];
  const left = row.deliver_at - t, cut = Math.round(Math.min(left * CHEER_CUT, CHEER_MOST)), deliver = row.deliver_at - cut;
  const [lat, lon] = posAt(stops, t);
  legs.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, t, "c"]);
  // a doomed pigeon is still lost the same share of the way along
  const lostAt = row.lost_at == null || row.lost_at <= t ? row.lost_at : Math.round(t + ((row.lost_at - t) * (deliver - t)) / left);
  return { cut, deliver, legs: JSON.stringify(legs), lostAt };
}
// Can this person cheer this pigeon now? (throws why not)
function check(row, by, me, t, sentAt) {
  if (t < sentAt) throw new HttpError(409, "It hasn’t taken off yet.");
  if (t >= row.deliver_at || (row.lost_at != null && t >= row.lost_at)) throw new HttpError(409, "Too late: it’s already landed.");
  if (row.via && t < row.via_off) throw new HttpError(409, "It’s stopping with a friend. Cheer it on once it flies on.");
  if ((by[me] || 0) >= CHEER_EACH) throw new HttpError(409, "You’ve cheered this one on all you can.");
  if (Object.values(by).reduce((a, n) => a + n, 0) >= CHEER_MAX) throw new HttpError(409, "It’s had all the cheering it can take.");
  if (row.deliver_at - t < 60e3) throw new HttpError(409, "It’s nearly there!");
}

async function cheer({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "cheer:" + u.id, 120, HOUR);
  const b = await body(request), id = String(b.id || ""), D = await db(env);
  if (!UUID_RE.test(id)) throw new HttpError(400, "That pigeon wasn’t found.");
  for (let k = 0; k < 4; k++) {
    const t = Date.now(), m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
    if (!m || (m.sender !== u.id && m.recipient !== u.id)) throw new HttpError(404, "That pigeon wasn’t found.");
    if (m.from_lat == null || m.to_lat == null) throw new HttpError(409, "This pigeon can’t be cheered on.");
    const by = byOf(m); check(m, by, u.id, t, m.sent_at);
    const p = plan([m.from_lat, m.from_lon, m.sent_at], m, t); by[u.id] = (by[u.id] || 0) + 1;
    // only if no one else cheered it (or it changed course) at the same moment
    const r = await D.prepare(`UPDATE pg_msgs SET deliver_at = ?1, legs = ?2, lost_at = ?3, cheer_by = ?4, cheer_ms = COALESCE(cheer_ms, 0) + ?5,
      expires_at = CASE WHEN photo = 1 THEN ?6 ELSE expires_at END WHERE id = ?7 AND deliver_at = ?8 AND cheer_by IS ?9 AND legs IS ?10`)
      .bind(p.deliver, p.legs, p.lostAt, JSON.stringify(by), p.cut, (p.lostAt ?? p.deliver) + PHOTO_TTL, id, m.deliver_at, m.cheer_by, m.legs).run();
    if (!r.meta.changes) continue;
    waitUntil(renear(D, id, t).catch(() => {}));                    // the pigeons it will pass, at its new pace
    waitUntil(refly(D, id, t).catch(() => {}));                     // and when it's over friends
    const other = m.sender === u.id ? m.recipient : m.sender;
    waitUntil(cheeredNote(env, other, u, { mine: m.sender === u.id, chat: u.id, deliverAt: p.deliver, cut: p.cut, tag: "cheer-" + id }).catch(() => {}));
    return json({ ok: true, cut: p.cut, deliverAt: p.deliver });
  }
  throw new HttpError(409, "Lots of cheering at once. Try again.");
}

async function groupCheer({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "cheer:" + u.id, 120, HOUR);
  const b = await body(request), id = String(b.id || ""), D = await db(env);
  if (!UUID_RE.test(id)) throw new HttpError(400, "That pigeon wasn’t found.");
  const m = await D.prepare("SELECT m.* FROM pg_gmsgs m JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = ? WHERE m.id = ?").bind(u.id, id).first();
  if (!m) throw new HttpError(404, "That pigeon wasn’t found.");
  const mine = m.sender === u.id;
  // the sender: every one still flying; anyone else: the one to them
  const { results } = await D.prepare(`SELECT * FROM pg_gdeliv WHERE msg_id = ?1 ${mine ? "" : "AND user_id = ?2"}`).bind(...(mine ? [id] : [id, u.id])).all();
  const friends = new Set((await D.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'ok' AND (a = ?1 OR b = ?1)").bind(m.sender).all()).results.map((r) => r.id));
  let t = Date.now(), cut = 0, done = [], why = null;
  for (const d0 of results) {
    if (d0.to_lat == null || m.from_lat == null) continue;
    for (let k = 0; k < 4; k++) {
      t = Date.now();
      const d = k ? await D.prepare("SELECT * FROM pg_gdeliv WHERE msg_id = ? AND user_id = ?").bind(id, d0.user_id).first() : d0;
      const by = byOf(d);
      try { check(d, by, u.id, t, m.sent_at); } catch (e) { why = why || e; break; }
      // (where a sender who isn't the recipient's friend starts from, as the recipient's map draws it)
      const fr = friends.has(d.user_id), start = [fr ? m.from_lat : coarse(m.from_lat), fr ? m.from_lon : coarse(m.from_lon), m.sent_at];
      const p = plan(start, d, t); by[u.id] = (by[u.id] || 0) + 1;
      const r = await D.prepare(`UPDATE pg_gdeliv SET deliver_at = ?1, legs = ?2, lost_at = ?3, cheer_by = ?4, cheer_ms = COALESCE(cheer_ms, 0) + ?5
        WHERE msg_id = ?6 AND user_id = ?7 AND deliver_at = ?8 AND cheer_by IS ?9 AND legs IS ?10`)
        .bind(p.deliver, p.legs, p.lostAt, JSON.stringify(by), p.cut, id, d.user_id, d.deliver_at, d.cheer_by, d.legs).run();
      if (!r.meta.changes) continue;
      cut = Math.max(cut, p.cut); done.push({ to: d.user_id, deliverAt: p.deliver, cut: p.cut });
      break;
    }
  }
  if (!done.length) throw why || new HttpError(409, "There’s nothing in the air to cheer on.");
  waitUntil(reflyGroup(D, id, t).catch(() => {}));
  // (a group photo keeps its day after the last one lands as it was: never sooner)
  for (const x of done) if (mine) waitUntil(cheeredNote(env, x.to, u, { mine: true, chat: m.group_id, group: m.group_id, deliverAt: x.deliverAt, cut: x.cut, tag: "cheer-" + id }).catch(() => {}));
  if (!mine) waitUntil(cheeredNote(env, m.sender, u, { mine: false, chat: m.group_id, group: m.group_id, deliverAt: done[0].deliverAt, cut: done[0].cut, tag: "cheer-" + id }).catch(() => {}));
  return json({ ok: true, cut, n: done.length });
}

export const CHEER_ROUTES = { "POST cheer": cheer, "POST group-cheer": groupCheer };
