// InFlight groups: the server half.
//
// A group message is sealed on the sender's phone under its own random key.
// The server stores that sealed body once, plus the key sealed separately for
// each member (with the pair key the sender shares with them). It can't read
// either. Each member gets their own pigeon (a "delivery"): its own distance,
// landing time, Pigeon Death roll and read receipt. Members who aren't friends
// see each other's names, never each other's locations.

import {
  HttpError, json, body, db, limit, requireUser, haversineKm, flightMs, loft, PIGEONS, RISKY_SPEED, RISKY_LOSS,
  UUID_RE, PHOTO_TTL, gcPoint, MAX_FLIGHT, MIN_FLIGHT, SPEED_KMH, REROUTE_KM, groupPhotoKey,
} from "./_pigeon.js";
import { groupSent, groupRerouted, groupAdded } from "./_notify.js";

export const GROUP_MAX = 12;
const MAX_BODY = 70000, MAX_PHOTO = 8 * 1024 * 1024;
const TURN_EVERY = 10 * 60e3;

const lostBy = (d, t) => d.lost_at != null && t >= d.lost_at;
const landedFor = (d, t) => t >= d.deliver_at && d.lost_at == null;
const inAir = (d, t) => t < d.deliver_at && !lostBy(d, t);

// Group names show on lock screens and in emails, so no web addresses.
function cleanGroupName(v) {
  const name = String(v || "").normalize("NFC").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) throw new HttpError(400, "Give the group a name.", "gname");
  if (/[@/\\:<>]|\.\S|www\./i.test(name)) throw new HttpError(400, "Group names can’t include web addresses or symbols like @ / :", "gname");
  return name;
}

async function friendIds(D, uid) {
  const { results } = await D.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'ok' AND (a = ?1 OR b = ?1)").bind(uid).all();
  return new Set(results.map((r) => r.id));
}
async function membersOf(D, gid) {
  const { results } = await D.prepare("SELECT * FROM pg_group_members WHERE group_id = ? ORDER BY joined_at").bind(gid).all();
  return results;
}
// The group, if this person is in it.
async function groupFor(D, u, gid) {
  const g = UUID_RE.test(String(gid || "")) && await D.prepare("SELECT g.*, m.muted FROM pg_groups g JOIN pg_group_members m ON m.group_id = g.id AND m.user_id = ? WHERE g.id = ?").bind(u.id, gid).first();
  if (!g) throw new HttpError(404, "That group isn’t there any more.");
  return g;
}

/* ---------------- what each member sees ---------------- */
// Your own message: how each pigeon is getting on (friends' routes only).
function ownView(m, dels, friends, t) {
  const flock = dels.map((d) => {
    const lost = lostBy(d, t), friend = friends.has(d.user_id);
    return { to: d.user_id, deliverAt: d.deliver_at, flying: inAir(d, t), lost, lostAt: lost ? d.lost_at : null, km: d.km, readAt: d.read_at,
      legs: friend && d.legs ? JSON.parse(d.legs) : [], route: friend && d.to_lat != null && m.from_lat != null ? [m.from_lat, m.from_lon, d.to_lat, d.to_lon] : null,
      toPlace: friend ? d.to_place : null };
  });
  const live = flock.filter((x) => !x.lost);
  return { ...baseView(m), flock, deliverAt: Math.max(0, ...(live.length ? live : flock).map((x) => x.deliverAt)), flying: flock.some((x) => x.flying),
    lost: flock.length > 0 && flock.every((x) => x.lost), fromPlace: m.from_place, body: m.body, key: m.sender_key, expiresAt: m.expires_at };
}
// Someone else's: your pigeon only. Its contents and key once it has landed;
// where it came from only if the sender is your friend.
function theirView(m, d, friends, t) {
  const lost = lostBy(d, t), flying = !lost && t < d.deliver_at, friend = friends.has(m.sender), open = !flying && !lost;
  return { ...baseView(m), deliverAt: d.deliver_at, flying, lost, lostAt: lost ? d.lost_at : null, km: d.km, readAt: d.read_at,
    legs: friend && d.legs ? JSON.parse(d.legs) : [], route: friend && d.to_lat != null && m.from_lat != null ? [m.from_lat, m.from_lon, d.to_lat, d.to_lon] : null,
    fromPlace: friend ? m.from_place : null, toPlace: d.to_place,
    body: open ? m.body : null, key: open ? d.wrap : null, expiresAt: open ? m.expires_at : null };
}
const baseView = (m) => ({ id: m.id, gid: m.group_id, from: m.sender, pigeon: m.pigeon, risky: !!m.risky, sentAt: m.sent_at, photo: m.photo, photoSize: m.photo_size });

// Messages this person can see in a group, oldest first: theirs, and ones with a pigeon to them.
async function visible(D, uid, gid, max = 300) {
  const { results } = await D.prepare(`SELECT * FROM (
      SELECT m.*, d.wrap, d.km, d.deliver_at, d.lost_at, d.read_at, d.to_lat, d.to_lon, d.to_place, d.legs, d.user_id
      FROM pg_gmsgs m LEFT JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = ?1
      WHERE m.group_id = ?2 AND (m.sender = ?1 OR d.user_id IS NOT NULL) ORDER BY m.sent_at DESC LIMIT ?3) ORDER BY sent_at`).bind(uid, gid, max).all();
  return results;
}
async function deliveriesOf(D, ids) {
  const by = new Map(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await D.prepare(`SELECT * FROM pg_gdeliv WHERE msg_id IN (${part.map(() => "?").join(",")})`).bind(...part).all();
    for (const d of results) by.get(d.msg_id).push(d);
  }
  return by;
}
async function views(D, uid, rows, friends, t) {
  const mine = rows.filter((m) => m.sender === uid).map((m) => m.id);
  const dels = await deliveriesOf(D, mine);
  return rows.map((m) => (m.sender === uid ? ownView(m, dels.get(m.id), friends, t) : theirView(m, m, friends, t)));
}

// Standard pigeons wait their turn: you can send one once something someone
// else sent has landed for you since your own last message.
async function turnIn(D, uid, gid, t) {
  const mine = await D.prepare("SELECT id, sent_at FROM pg_gmsgs WHERE group_id = ? AND sender = ? ORDER BY sent_at DESC LIMIT 1").bind(gid, uid).first();
  const inbound = !!(await D.prepare(`SELECT 1 FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE m.group_id = ?1 AND d.user_id = ?2
    AND d.deliver_at > ?3 AND (d.lost_at IS NULL OR d.lost_at > ?3) LIMIT 1`).bind(gid, uid, t).first());
  if (!mine) {
    const any = await D.prepare(`SELECT 1 FROM pg_gmsgs m JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = ?2 WHERE m.group_id = ?1 LIMIT 1`).bind(gid, uid).first();
    return { free: true, state: inbound ? "inbound" : any ? "sill" : "fresh" };
  }
  const { results: dels } = await D.prepare("SELECT deliver_at, lost_at FROM pg_gdeliv WHERE msg_id = ?").bind(mine.id).all();
  if (dels.length && dels.every((d) => lostBy(d, t))) return { free: true, state: "lost" };
  const heard = await D.prepare(`SELECT 1 FROM pg_gmsgs m JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = ?2
    WHERE m.group_id = ?1 AND m.sender != ?2 AND m.sent_at > ?3 AND d.deliver_at <= ?4 AND d.lost_at IS NULL LIMIT 1`).bind(gid, uid, mine.sent_at, t).first();
  if (heard) return { free: true, state: "sill" };
  if (dels.some((d) => inAir(d, t))) return { free: false, state: "outbound" };
  return { free: false, state: inbound ? "inbound" : "theirs" };
}

// Everything the Messages list needs about each of this person's groups.
export async function groupsForSync(env, u, t) {
  const D = await db(env);
  const { results: gs } = await D.prepare("SELECT g.*, m.muted FROM pg_groups g JOIN pg_group_members m ON m.group_id = g.id AND m.user_id = ? ORDER BY g.created_at").bind(u.id).all();
  if (!gs.length) return [];
  const friends = await friendIds(D, u.id), out = [];
  for (const g of gs) {
    const { results: mem } = await D.prepare(`SELECT gm.user_id, gm.added_by, u.handle, u.name, u.pub, u.avatar_at, u.lat, u.lon, u.place, u.loc_at, u.seen_at
      FROM pg_group_members gm JOIN pg_users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY gm.joined_at`).bind(g.id).all();
    const members = mem.map((p) => {
      const friend = p.user_id === u.id || friends.has(p.user_id);
      return { id: p.user_id, handle: p.handle, name: p.name, avatarAt: p.avatar_at || null, pub: JSON.parse(p.pub), friend, addedBy: p.added_by,
        ...(friend ? { lat: p.lat, lon: p.lon, place: p.place, locAt: p.loc_at || null, seenAt: p.seen_at || null }
          : { km: u.lat != null && p.lat != null ? Math.round(haversineKm(u.lat, u.lon, p.lat, p.lon) / 10) * 10 : null }) };   // rough distance, no spot
    });
    const last = (await visible(D, u.id, g.id, 1))[0];
    const unread = await D.prepare(`SELECT COUNT(*) AS n FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
      WHERE m.group_id = ? AND d.user_id = ? AND d.read_at IS NULL AND d.deliver_at <= ? AND d.lost_at IS NULL`).bind(g.id, u.id, t).first();
    out.push({ id: g.id, name: g.name, createdAt: g.created_at, muted: !!g.muted, members,
      last: last ? (await views(D, u.id, [last], friends, t))[0] : null, unread: unread.n, turn: await turnIn(D, u.id, g.id, t) });
  }
  return out;
}

/* ---------------- routes ---------------- */
async function cleanMembers(D, u, ids, current) {
  const have = new Set(current.map((m) => m.user_id));
  const out = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => id !== u.id && !have.has(id));
  if (!out.length) throw new HttpError(400, "Choose at least one friend.");
  const friends = await friendIds(D, u.id);
  if (out.some((id) => !friends.has(id))) throw new HttpError(403, "You can only add your own friends.");
  if ((current.length || 1) + out.length > GROUP_MAX) throw new HttpError(400, `Groups can have up to ${GROUP_MAX} people.`);
  return out;
}
async function groupView(env, u, gid) {
  return (await groupsForSync(env, u, Date.now())).find((g) => g.id === gid);
}

async function createGroup({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "group:" + u.id, 20, 24 * 3600e3);
  const b = await body(request), D = await db(env), t = Date.now();
  const name = cleanGroupName(b.name), ids = await cleanMembers(D, u, b.members, []);
  const id = crypto.randomUUID();
  await D.batch([
    D.prepare("INSERT INTO pg_groups (id, name, created_by, created_at) VALUES (?, ?, ?, ?)").bind(id, name, u.id, t),
    ...[u.id, ...ids].map((m) => D.prepare("INSERT INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES (?, ?, ?, ?)").bind(id, m, u.id, t)),
  ]);
  waitUntil(groupAdded(env, u, ids, { id, name }).catch(() => {}));
  return json({ group: await groupView(env, u, id) });
}
async function addMembers({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "groupadd:" + u.id, 60, 24 * 3600e3);
  const b = await body(request), D = await db(env), g = await groupFor(D, u, b.id), t = Date.now();
  const ids = await cleanMembers(D, u, b.members, await membersOf(D, g.id));
  await D.batch(ids.map((m) => D.prepare("INSERT OR IGNORE INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES (?, ?, ?, ?)").bind(g.id, m, u.id, t)));
  waitUntil(groupAdded(env, u, ids, g).catch(() => {}));
  return json({ group: await groupView(env, u, g.id) });
}
// Leaving takes you out; the last one out takes the group, its messages and photos with them.
export async function leaveGroup(env, uid, gid) {
  const D = await db(env);
  await D.prepare("DELETE FROM pg_group_members WHERE group_id = ? AND user_id = ?").bind(gid, uid).run();
  if (await D.prepare("SELECT 1 FROM pg_group_members WHERE group_id = ?").bind(gid).first()) return;
  const { results } = await D.prepare("SELECT id FROM pg_gmsgs WHERE group_id = ? AND photo = 1").bind(gid).all();
  if (env.BIO_R2) for (let i = 0; i < results.length; i += 900) await env.BIO_R2.delete(results.slice(i, i + 900).map((r) => groupPhotoKey(r.id)));
  await D.batch([
    D.prepare("DELETE FROM pg_gdeliv WHERE msg_id IN (SELECT id FROM pg_gmsgs WHERE group_id = ?)").bind(gid),
    D.prepare("DELETE FROM pg_gmsgs WHERE group_id = ?").bind(gid),
    D.prepare("DELETE FROM pg_groups WHERE id = ?").bind(gid),
  ]);
}
async function leave({ request, env }) {
  const u = await requireUser(request, env);
  const D = await db(env), g = await groupFor(D, u, (await body(request)).id);
  await leaveGroup(env, u.id, g.id);
  return json({ ok: true });
}
async function mute({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env), g = await groupFor(D, u, b.id);
  await D.prepare("UPDATE pg_group_members SET muted = ? WHERE group_id = ? AND user_id = ?").bind(b.muted ? 1 : 0, g.id, u.id).run();
  return json({ ok: true, muted: !!b.muted });
}
async function rename({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "grename:" + u.id, 30, 24 * 3600e3);
  const b = await body(request), D = await db(env), g = await groupFor(D, u, b.id);
  await D.prepare("UPDATE pg_groups SET name = ? WHERE id = ?").bind(cleanGroupName(b.name), g.id).run();
  return json({ group: await groupView(env, u, g.id) });
}
async function listMessages({ request, env }) {
  const u = await requireUser(request, env);
  const D = await db(env), g = await groupFor(D, u, new URL(request.url).searchParams.get("id")), t = Date.now();
  const friends = await friendIds(D, u.id);
  const rows = await visible(D, u.id, g.id);
  return json({ now: t, messages: await views(D, u.id, rows, friends, t), turn: await turnIn(D, u.id, g.id, t) });
}

async function send({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "send:" + u.id, 120, 60 * 60e3);
  if (Number(request.headers.get("Content-Length")) > MAX_PHOTO + MAX_BODY * 2 + GROUP_MAX * 4096) throw new HttpError(413, "That photo is too large. Try a smaller one.");
  let meta, photo = null;
  if ((request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) {
    const f = await request.formData();
    try { meta = JSON.parse(f.get("meta")); } catch (_) { throw new HttpError(400, "That message was malformed."); }
    const p = f.get("photo");
    if (p && typeof p !== "string") photo = p;
  } else meta = await body(request);
  const id = String(meta.id || ""), sealed = String(meta.body || ""), keys = meta.keys && typeof meta.keys === "object" ? meta.keys : {};
  if (!UUID_RE.test(id)) throw new HttpError(400, "That message was malformed.");
  if (sealed.length < 20 || sealed.length > MAX_BODY) throw new HttpError(400, "That message is too long.");
  if (photo && photo.size > MAX_PHOTO) throw new HttpError(413, "That photo is too large. Try a smaller one.");
  if (photo && !env.BIO_R2) throw new HttpError(503, "Photos aren’t set up on this server yet.");
  const D = await db(env), t = Date.now(), g = await groupFor(D, u, meta.group);
  if (u.lat == null) throw new HttpError(409, "Set your location in Account before sending pigeons.");
  if (await D.prepare("SELECT 1 FROM pg_gmsgs WHERE id = ?").bind(id).first()) throw new HttpError(409, "That message was already sent.");
  // everyone in the group right now, you included, needs their own sealed copy of the key
  const members = await membersOf(D, g.id);
  const want = members.map((m) => m.user_id);
  if (Object.keys(keys).length !== want.length || want.some((m) => typeof keys[m] !== "string" || keys[m].length < 20 || keys[m].length > 2000))
    throw new HttpError(409, "Someone joined or left the group. Try again.");

  const tn = await turnIn(D, u.id, g.id, t);
  const kind = Object.hasOwn(PIGEONS, meta.pigeon) ? meta.pigeon : tn.free ? "standard" : "swift";
  if (PIGEONS[kind].waits && !tn.free) throw new HttpError(409, "It isn’t your turn yet. Send a swift, turbo or rocket pigeon to write now.");
  if (PIGEONS[kind].max) {                 // one special pigeon covers the whole group
    const p = PIGEONS[kind], l = loft(u, kind, t);
    if (l.count <= 0) throw new HttpError(409, `No ${kind} pigeons left.`);
    const [n, at] = l.count >= p.max ? [l.count - 1, t] : [l.count - 1, l.at + l.hatched * p.every];
    const r = await D.prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ? AND ${p.col} IS ? AND ${p.atCol} IS ?`).bind(n, at, u.id, u[p.col], u[p.atCol]).run();
    if (!r.meta.changes) throw new HttpError(409, "Another pigeon just left. Try again.");
  }
  const risky = u.risky ? 1 : 0, speed = PIGEONS[kind].speed * (risky ? RISKY_SPEED : 1);
  const others = want.filter((m) => m !== u.id);
  const { results: to } = others.length ? await D.prepare(`SELECT id, lat, lon, place FROM pg_users WHERE id IN (${others.map(() => "?").join(",")})`).bind(...others).all() : { results: [] };
  const dels = to.map((r) => {
    const km = r.lat != null ? haversineKm(u.lat, u.lon, r.lat, r.lon) : 500, at = t + flightMs(km, speed);
    // Pigeon Death: each pigeon takes its own chance
    const roll = crypto.getRandomValues(new Uint32Array(2));
    const lostAt = risky && roll[0] / 2 ** 32 < RISKY_LOSS ? Math.round(t + (0.15 + 0.7 * (roll[1] / 2 ** 32)) * (at - t)) : null;
    return { to: r.id, km, at, lostAt, r };
  });
  const last = Math.max(t, ...dels.map((d) => d.lostAt ?? d.at));
  await D.batch([
    D.prepare(`INSERT INTO pg_gmsgs (id, group_id, sender, body, sender_key, photo, photo_size, pigeon, risky, sent_at, expires_at, from_lat, from_lon, from_place)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, g.id, u.id, sealed, keys[u.id], photo ? 1 : 0, photo ? photo.size : null, kind, risky, t,
      photo ? last + PHOTO_TTL : null, u.lat, u.lon, u.place),
    ...dels.map((d) => D.prepare(`INSERT INTO pg_gdeliv (msg_id, user_id, wrap, km, deliver_at, lost_at, to_lat, to_lon, to_place) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, d.to, keys[d.to], d.km, d.at, d.lostAt, d.r.lat, d.r.lon, d.r.place)),
  ]);
  if (photo) await env.BIO_R2.put(groupPhotoKey(id), photo.stream(), { httpMetadata: { contentType: "application/octet-stream" } });
  waitUntil(groupSent(env, u, g, dels.map((d) => ({ to: d.to, at: d.at })), kind).catch(() => {}));
  const m = await D.prepare("SELECT * FROM pg_gmsgs WHERE id = ?").bind(id).first();
  return json({ message: (await views(D, u.id, [m], await friendIds(D, u.id), t))[0] });
}

async function markRead({ request, env }) {
  const u = await requireUser(request, env);
  const D = await db(env), g = await groupFor(D, u, (await body(request)).id), t = Date.now();
  await D.prepare(`UPDATE pg_gdeliv SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL AND deliver_at <= ?1 AND lost_at IS NULL
    AND msg_id IN (SELECT id FROM pg_gmsgs WHERE group_id = ?3)`).bind(t, u.id, g.id).run();
  return json({ ok: true });
}

async function getPhoto({ request, env }, id) {
  const u = await requireUser(request, env);
  if (!UUID_RE.test(id || "")) throw new HttpError(404, "No such photo.");
  const D = await db(env), t = Date.now();
  const m = await D.prepare("SELECT * FROM pg_gmsgs WHERE id = ?").bind(id).first();
  const d = m && m.sender !== u.id ? await D.prepare("SELECT * FROM pg_gdeliv WHERE msg_id = ? AND user_id = ?").bind(id, u.id).first() : null;
  if (!m || (m.sender !== u.id && !d)) throw new HttpError(404, "No such photo.");
  if (!(await D.prepare("SELECT 1 FROM pg_group_members WHERE group_id = ? AND user_id = ?").bind(m.group_id, u.id).first())) throw new HttpError(404, "No such photo.");
  if (m.photo !== 1 || t >= m.expires_at) throw new HttpError(410, "This photo has flown away.");
  if (d && lostBy(d, t)) throw new HttpError(410, "This photo was lost with its pigeon.");
  if (d && t < d.deliver_at) throw new HttpError(425, "This photo is still in flight.");
  const obj = env.BIO_R2 && (await env.BIO_R2.get(groupPhotoKey(id)));
  if (!obj) throw new HttpError(410, "This photo has flown away.");
  return new Response(obj.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

// Someone moved: their group pigeons turn too, the same way as one-to-one ones.
// Senders hear about it only if they're friends (the new place is theirs to know).
export async function rerouteGroups(env, u, p, t, waitUntil) {
  const D = await db(env);
  const { results } = await D.prepare(`SELECT d.*, m.sender, m.sent_at, m.from_lat, m.from_lon, m.pigeon, m.risky, m.group_id, m.photo FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
    WHERE d.user_id = ?1 AND d.deliver_at > ?2 AND d.to_lat IS NOT NULL AND (d.lost_at IS NULL OR d.lost_at > ?2)`).bind(u.id, t).all();
  if (!results.length) return;
  const friends = await friendIds(D, u.id);
  for (const d of results) {
    const legs = d.legs ? JSON.parse(d.legs) : [];
    if (haversineKm(d.to_lat, d.to_lon, p.lat, p.lon) <= REROUTE_KM) continue;
    if (legs.length && t - legs[legs.length - 1][2] < TURN_EVERY) continue;
    const [sLat, sLon, sAt] = legs.length ? legs[legs.length - 1] : [d.from_lat, d.from_lon, d.sent_at];
    const f = Math.min(1, Math.max(0, (t - sAt) / (d.deliver_at - sAt)));
    const [pLat, pLon] = gcPoint(sLat, sLon, d.to_lat, d.to_lon, f);
    const ahead = haversineKm(pLat, pLon, p.lat, p.lon), speed = PIGEONS[d.pigeon].speed * (d.risky ? RISKY_SPEED : 1);
    const deliver = Math.max(t + MIN_FLIGHT / speed / 5, Math.min(d.sent_at + MAX_FLIGHT / speed, t + (ahead / SPEED_KMH) * 3600e3 / speed));
    const km = Math.max(0, d.km - haversineKm(pLat, pLon, d.to_lat, d.to_lon)) + ahead;
    legs.push([Math.round(pLat * 1e5) / 1e5, Math.round(pLon * 1e5) / 1e5, t]);
    const lostAt = d.lost_at == null ? null : d.lost_at < deliver ? d.lost_at : t + (deliver - t) / 2;
    const r = await D.prepare(`UPDATE pg_gdeliv SET to_lat = ?, to_lon = ?, to_place = ?, deliver_at = ?, km = ?, legs = ?, lost_at = ? WHERE msg_id = ? AND user_id = ? AND deliver_at > ?`)
      .bind(p.lat, p.lon, p.place, deliver, km, JSON.stringify(legs), lostAt, d.msg_id, u.id, t).run();
    if (!r.meta.changes) continue;
    // a photo stays until 24 hours after its last pigeon lands
    if (d.photo === 1) await D.prepare("UPDATE pg_gmsgs SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?").bind((lostAt ?? deliver) + PHOTO_TTL, d.msg_id).run();
    if (friends.has(d.sender)) waitUntil(groupRerouted(env, d.sender, { ...u, place: p.place }, d.group_id, deliver).catch(() => {}));
  }
}

// When an account is deleted: out of every group, and their messages with them.
export async function removeFromGroups(env, uid) {
  const D = await db(env);
  const { results: photos } = await D.prepare("SELECT id FROM pg_gmsgs WHERE sender = ? AND photo = 1").bind(uid).all();
  if (env.BIO_R2 && photos.length) for (let i = 0; i < photos.length; i += 900) await env.BIO_R2.delete(photos.slice(i, i + 900).map((r) => groupPhotoKey(r.id)));
  await D.batch([
    D.prepare("DELETE FROM pg_gdeliv WHERE user_id = ? OR msg_id IN (SELECT id FROM pg_gmsgs WHERE sender = ?)").bind(uid, uid),
    D.prepare("DELETE FROM pg_gmsgs WHERE sender = ?").bind(uid),
  ]);
  const { results: gs } = await D.prepare("SELECT group_id FROM pg_group_members WHERE user_id = ?").bind(uid).all();
  for (const g of gs) await leaveGroup(env, uid, g.group_id);
}

export const GROUP_ROUTES = {
  "POST groups": createGroup, "POST group-add": addMembers, "POST group-leave": leave, "POST group-mute": mute, "POST group-name": rename,
  "GET group-messages": listMessages, "POST group-messages": send, "POST group-read": markRead, "GET group-photo": getPhoto,
};
