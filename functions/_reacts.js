// Reactions (a heart, a laugh…) fly back on a tiny pigeon at rocket speed:
// free, and they never use anyone's turn. Like everything else they're sealed
// on the phone (one to one: with the pair key; in a group: sealed once, with
// its key sealed for each member), so the server can't see which one it was.
// One reaction per person per message; sending another replaces it.

import { HttpError, json, body, db, limit, requireUser, haversineKm, flightMs, UUID_RE } from "./_pigeon.js";

const SPEED = 9;                     // as fast as a rocket pigeon
const lostBy = (x, t) => x.lost_at != null && t >= x.lost_at;

// Who a reaction to this message flies to, and how far: the message's author
// (or, reacting to your own message, the person it went to).
async function target(D, u, msgId, group) {
  const t = Date.now();
  if (!group) {
    const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(msgId).first();
    if (!m || (m.sender !== u.id && m.recipient !== u.id)) throw new HttpError(404, "That message isn’t there any more.");
    const other = m.sender === u.id ? m.recipient : m.sender;
    if (!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(u.id, other).first())) throw new HttpError(403, "You can only react in your flock.");
    if (m.recipient === u.id && (t < m.deliver_at || lostBy(m, t))) throw new HttpError(409, "You can react once it has landed.");
    if (lostBy(m, t)) throw new HttpError(409, "That pigeon never arrived.");
    if (t < m.sent_at) throw new HttpError(409, "That pigeon hasn’t taken off yet.");
    return { other, msg: m };
  }
  const m = await D.prepare("SELECT * FROM pg_gmsgs WHERE id = ?").bind(msgId).first();
  if (!m || !(await D.prepare("SELECT 1 FROM pg_group_members WHERE group_id = ? AND user_id = ?").bind(m.group_id, u.id).first())) throw new HttpError(404, "That message isn’t there any more.");
  if (m.sender !== u.id) {
    const d = await D.prepare("SELECT * FROM pg_gdeliv WHERE msg_id = ? AND user_id = ?").bind(msgId, u.id).first();
    if (!d || t < d.deliver_at || lostBy(d, t)) throw new HttpError(409, "You can react once it has landed.");
  }
  return { other: m.sender === u.id ? null : m.sender, msg: m, group: m.group_id };
}

async function react({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "react:" + u.id, 240, 60 * 60e3);
  const b = await body(request), D = await db(env), t = Date.now();
  const id = String(b.id || ""), msgId = String(b.msg || ""), group = !!b.group;
  if (!UUID_RE.test(id) || !UUID_RE.test(msgId)) throw new HttpError(400, "That reaction was malformed.");
  const tg = await target(D, u, msgId, group);
  let sealed, keys = null;
  if (group) {
    sealed = String(b.body || "");
    const members = (await D.prepare("SELECT user_id FROM pg_group_members WHERE group_id = ?").bind(tg.group).all()).results.map((r) => r.user_id);
    const k = b.keys && typeof b.keys === "object" ? b.keys : {};
    if (Object.keys(k).length !== members.length || members.some((m) => typeof k[m] !== "string" || k[m].length < 20 || k[m].length > 2000)) throw new HttpError(409, "Someone joined or left the group. Try again.");
    keys = JSON.stringify(k);
  } else sealed = String(b.ct || "");
  if (sealed.length < 20 || sealed.length > 2000) throw new HttpError(400, "That reaction was malformed.");
  // it flies to the person reacted to (in a group, everyone sees it land then)
  const to = tg.other && await D.prepare("SELECT lat, lon FROM pg_users WHERE id = ?").bind(tg.other).first();
  const km = to?.lat != null && u.lat != null ? haversineKm(u.lat, u.lon, to.lat, to.lon) : 0;
  const deliver = t + flightMs(km, SPEED);
  await D.batch([
    D.prepare("DELETE FROM pg_reacts WHERE msg_id = ? AND sender = ?").bind(msgId, u.id),
    D.prepare("INSERT INTO pg_reacts (id, msg_id, group_id, sender, recipient, ct, keys, sent_at, deliver_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, msgId, tg.group || null, u.id, tg.other, sealed, keys, t, deliver),
  ]);
  const row = await D.prepare("SELECT * FROM pg_reacts WHERE id = ?").bind(id).first();
  return json({ react: reactView(u.id, row, t) });
}
async function unreact({ request, env }) {
  const u = await requireUser(request, env);
  const msgId = String((await body(request)).msg || "");
  await (await db(env)).prepare("DELETE FROM pg_reacts WHERE msg_id = ? AND sender = ?").bind(msgId, u.id).run();
  return json({ ok: true });
}

// What one person sees of a reaction: its contents once it has landed (always, if it's theirs).
function reactView(me, r, t) {
  const flying = t < r.deliver_at, open = r.sender === me || !flying;
  const keys = r.keys ? JSON.parse(r.keys) : null;
  return { id: r.id, msg: r.msg_id, from: r.sender, to: r.recipient, sentAt: r.sent_at, deliverAt: r.deliver_at, flying,
    ...(keys ? { body: open ? r.ct : null, key: open ? keys[me] || null : null } : { ct: open ? r.ct : null }) };
}
// Reactions to these messages, for someone looking at them.
export async function reactsFor(env, me, ids) {
  if (!ids.length) return [];
  const D = await db(env), t = Date.now(), out = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await D.prepare(`SELECT * FROM pg_reacts WHERE msg_id IN (${part.map(() => "?").join(",")})`).bind(...part).all();
    for (const r of results) out.push(reactView(me, r, t));
  }
  return out;
}
// When an account goes, or a group's last member leaves.
export async function dropReacts(env, { user, group }) {
  const D = await db(env);
  if (user) await D.prepare("DELETE FROM pg_reacts WHERE sender = ?1 OR recipient = ?1 OR msg_id IN (SELECT id FROM pg_msgs WHERE sender = ?1 OR recipient = ?1)").bind(user).run();
  if (group) await D.prepare("DELETE FROM pg_reacts WHERE group_id = ?").bind(group).run();
}

export const REACT_ROUTES = { "POST react": react, "DELETE react": unreact };
