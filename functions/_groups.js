// InFlight groups: the server half.
//
// A group message is sealed on the sender's phone under its own random key.
// The server stores that sealed body once, plus the key sealed separately for
// each member (with the pair key the sender shares with them). It can't read
// either. Each member gets their own pigeon (a "delivery"): its own distance,
// landing time, Pigeon Death roll and read receipt. Members who aren't friends
// see each other's names, never each other's locations.

import { newStamps } from "./_passport.js";
import { marksFor, markView } from "./_landmarks.js";
import { noteSeason, skinNow } from "./_seasons.js";
import { vanishOk } from "./_vanish.js";
import { isOnce, serveOnce, drawMystery, MYSTERY,
  HttpError, json, body, db, limit, requireUser, chunks, haversineKm, flightMs, loft, PIGEONS, RISKY_SPEED, RISKY_LOSS,
  UUID_RE, PHOTO_TTL, gcPoint, DAY, MAX_FLIGHT, MIN_FLIGHT, SPEED_KMH, REROUTE_KM, groupPhotoKey, spendSwift, wxView, wxOf, claimId, idTaken, cheerView, birdOn,
} from "./_pigeon.js";
import { groupSent, groupRerouted, groupAdded } from "./_notify.js";
import { windsAlong } from "./_weather.js";
import { planRoute, timeWay, restOf, passed, turnsOf, pathKm, round5, hopsFor, styleOf, riskOf, ceilingFor } from "./_route.js";
import { stopsOf, posAt } from "./_moments.js";
import { findGroupFly, dropFly, reflyGroup } from "./_flyover.js";
import { claimBird } from "./_birds.js";
import { reactsFor, dropReacts } from "./_reacts.js";
import { endOf, spaceFlight, spaceKinds, isSpace } from "./_moon.js";

export const GROUP_MAX = 12;
const GROUPS_EACH = 50;            // groups one person can be in
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
// People in a group who aren't friends never learn where each other are: no
// distances, no weather spot (a point on the line between you), and the times
// their pigeons take come from coarse places (half-degree cells, ~50 km), so
// even those give away only roughly where.
export const coarse = (x) => (x == null ? x : Math.round(x * 2) / 2);
const wxFor = (d, friend) => { const w = wxView(d); return friend || !w.delay ? w : { delay: w.delay }; };
// a pigeon to or from the Moon: its two ends (functions/_moon.js); between people who aren't friends, no place names
function moonOf(d, friend) {
  let mn = null; try { mn = d.moon ? JSON.parse(d.moon) : null; } catch (_) {}
  if (!mn) return {};
  // (someone who isn't a friend: no place names, no spot on Earth at all, however rough, and on the Moon or Mars
  // only the region, to 5°: enough to draw the trip, not to name the crater)
  const five = (x) => (x == null ? x : Math.round(x / 5) * 5);
  const strip = (e) => (e.b === "earth" ? { b: "earth", lat: null, lon: null, place: null } : { ...e, lat: five(e.lat), lon: five(e.lon), place: null });
  const leg = ({ ground, ...x }) => ({ ...x, from: strip(x.from), to: strip(x.to) });
  return { moon: friend ? mn : { ...leg(mn), ...(mn.prev ? { prev: leg(mn.prev) } : {}) } };
}
// Your own message: how each pigeon is getting on (friends' routes only).
function ownView(m, dels, friends, t) {
  const flock = dels.map((d) => {
    const lost = lostBy(d, t), friend = friends.has(d.user_id);
    return { to: d.user_id, deliverAt: d.deliver_at, flying: inAir(d, t), lost, lostAt: lost ? d.lost_at : null, viewedAt: d.viewed_at || null, recalled: lost && !!d.recalled, wind: d.wind ?? null, ...wxFor(d, friend), km: friend ? d.km : null, readAt: d.read_at, ...cheerView(d, m.sender),
      liveAt: d.live_at ?? null, legs: friend && d.legs ? JSON.parse(d.legs) : [], route: friend && d.to_lat != null && m.from_lat != null ? [m.from_lat, m.from_lon, d.to_lat, d.to_lon] : null,
      toPlace: friend ? d.to_place : null, ...moonOf(d, friend) };
  });
  const live = flock.filter((x) => !x.lost);
  return { ...baseView(m), ...birdOn(m, m.sender), flock, cheered: Math.max(0, ...flock.filter((x) => x.flying).map((x) => x.cheered || 0)), deliverAt: Math.max(0, ...(live.length ? live : flock).map((x) => x.deliverAt)), flying: flock.some((x) => x.flying),
    lost: flock.length > 0 && flock.every((x) => x.lost), recalled: flock.some((x) => x.recalled), fromPlace: m.from_place, body: m.body, key: m.sender_key, expiresAt: flock.some((x) => x.flying) ? null : m.expires_at };
}
// Someone else's: your pigeon only. Its contents and key once it has landed;
// where it came from only if the sender is your friend.
function theirView(m, d, friends, t) {
  const lost = lostBy(d, t), flying = !lost && t < d.deliver_at, friend = friends.has(m.sender), open = !flying && !lost;
  return { ...baseView(m), ...birdOn(m, d.user_id), deliverAt: d.deliver_at, flying, lost, lostAt: lost ? d.lost_at : null, recalled: lost && !!d.recalled, wind: d.wind ?? null, ...wxFor(d, friend), km: friend ? d.km : null, readAt: d.read_at, ...cheerView(d, d.user_id),
    liveAt: d.live_at ?? null, legs: friend && d.legs ? JSON.parse(d.legs) : [], route: friend && d.to_lat != null && m.from_lat != null ? [m.from_lat, m.from_lon, d.to_lat, d.to_lon] : null,
    fromPlace: friend ? m.from_place : null, toPlace: d.to_place, ...moonOf(d, friend),
    body: open ? m.body : null, key: open ? d.wrap : null, expiresAt: open ? m.expires_at : null, viewedAt: d.viewed_at || null };
}
const baseView = (m) => ({ id: m.id, gid: m.group_id, from: m.sender, vanish: m.vanish || null, pigeon: m.pigeon, mystery: !!m.mystery, style: m.style || null, ...(m.photo ? { once: m.once !== 0 } : {}), risky: !!m.risky, sentAt: m.sent_at, photo: m.photo === 1 && m.expires_at != null && m.expires_at <= Date.now() ? 2 : m.photo, photoSize: m.photo_size, skin: m.skin || null });

// Messages this person can see in a group, oldest first: theirs, and ones with a pigeon to them.
async function visible(D, uid, gid, max = 300) {
  const { results } = await D.prepare(`SELECT * FROM (
      SELECT m.*, d.wrap, d.km, d.live_at, d.deliver_at, d.lost_at, d.recalled, d.wind, d.wx, d.wx_ms, d.read_at, d.to_lat, d.to_lon, d.to_place, d.legs, d.user_id, d.moon
      FROM pg_gmsgs m LEFT JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = ?1
      WHERE m.group_id = ?2 AND (m.sender = ?1 OR d.user_id IS NOT NULL) AND m.gone_at IS NULL ORDER BY m.sent_at DESC LIMIT ?3) ORDER BY sent_at`).bind(uid, gid, max).all();
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
  // read receipts go both ways: anyone with them off (you included) shows none
  const ids = [...new Set([uid, ...[...dels.values()].flat().map((d) => d.user_id)])];
  const off = new Set();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    for (const r of (await D.prepare(`SELECT id FROM pg_users WHERE no_receipts = 1 AND id IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results) off.add(r.id);
  }
  return rows.map((m) => {
    if (m.sender !== uid) return theirView(m, m, friends, t);
    const v = ownView(m, dels.get(m.id), friends, t);
    for (const x of v.flock) if (off.has(uid) || off.has(x.to)) { x.readAt = null; x.viewedAt = null; }
    return v;
  });
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
  const { results: dels } = await D.prepare("SELECT deliver_at, lost_at, recalled FROM pg_gdeliv WHERE msg_id = ?").bind(mine.id).all();
  if (dels.length && dels.every((d) => lostBy(d, t))) return { free: true, state: dels.some((d) => d.recalled) ? "recalled" : "lost" };
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
  // anyone either of you has blocked, in a group you share: their name stays (so you know who wrote), nothing else of them
  const blocked = new Set((await D.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'blocked' AND (a = ?1 OR b = ?1)").bind(u.id).all()).results.map((r) => r.id));
  // everyone in all your groups, and what's unread in each: one query each, however many groups
  const { results: allMem } = await D.prepare(`SELECT gm.group_id, gm.user_id, gm.added_by, u.handle, u.name, u.pub, u.avatar_at, u.lat, u.lon, u.place, u.moon, u.loc_at, u.seen_at, u.hide_online
    FROM pg_group_members gm JOIN pg_users u ON u.id = gm.user_id
    WHERE gm.group_id IN (SELECT group_id FROM pg_group_members WHERE user_id = ?1) ORDER BY gm.joined_at`).bind(u.id).all();
  const { results: unreads } = await D.prepare(`SELECT m.group_id, COUNT(*) AS n FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
    WHERE d.user_id = ?1 AND d.read_at IS NULL AND d.deliver_at <= ?2 AND d.lost_at IS NULL GROUP BY m.group_id`).bind(u.id, t).all();
  const unreadIn = new Map(unreads.map((r) => [r.group_id, r.n]));
  for (const g of gs) {
    const mem = allMem.filter((p) => p.group_id === g.id);
    const members = mem.map((p) => {
      const friend = p.user_id === u.id || friends.has(p.user_id);
      if (blocked.has(p.user_id)) return { id: p.user_id, handle: p.handle, name: p.name, avatarAt: null, pub: JSON.parse(p.pub), friend: false, addedBy: p.added_by, km: null };
      return { id: p.user_id, handle: p.handle, name: p.name, avatarAt: p.avatar_at || null, pub: JSON.parse(p.pub), friend, addedBy: p.added_by,
        onMoon: !!p.moon, offEarth: p.moon ? (/"b":"mars"/.test(p.moon) ? "mars" : "moon") : null,    // off the Earth, and on what (where on it, only to friends)
        ...(friend ? { lat: p.lat, lon: p.lon, place: p.place, moon: p.moon ? JSON.parse(p.moon) : null, locAt: p.loc_at || null, seenAt: u.hide_online || p.hide_online ? null : p.seen_at || null }
          : { km: u.lat != null && p.lat != null ? Math.max(50, Math.round(haversineKm(coarse(u.lat), coarse(u.lon), coarse(p.lat), coarse(p.lon)) / 50) * 50) : null }) };   // rough distance, no spot
    });
    const last = (await visible(D, u.id, g.id, 1))[0];
    out.push({ id: g.id, name: g.name, createdAt: g.created_at, muted: !!g.muted, members, vanish: g.vanish ? { ms: g.vanish, by: g.vanish_by } : null,
      last: last ? (await views(D, u.id, [last], friends, t))[0] : null, unread: unreadIn.get(g.id) || 0, turn: await turnIn(D, u.id, g.id, t) });
  }
  return out;
}

// A line in the group's chat for each change to who's in it (and its name).
// The server can't add anyone without it showing to everyone.
function event(D, gid, t, kind, actor, target = null) {
  return D.prepare(`INSERT INTO pg_gevents (group_id, at, kind, actor, actor_name, target, target_name)
    SELECT ?1, ?2, ?3, ?4, a.name, ?5, ${said(kind) ? "?6" : "(SELECT name FROM pg_users WHERE id = ?5)"} FROM pg_users a WHERE a.id = ?4`)
    .bind(...[gid, t, kind, actor.id || actor, said(kind) ? null : target].concat(said(kind) ? [target] : []));
}
// (a new name, or how long messages last: words, not someone)
const said = (kind) => kind === "rename" || kind === "vanish";
// Disappearing messages for the group: anyone in it can set it, and everyone sees who did.
async function setVanish({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "gvanish:" + u.id, 30, 24 * 3600e3);
  const b = await body(request), D = await db(env), g = await groupFor(D, u, b.id), ms = Number(b.ms);
  if (!vanishOk(ms)) throw new HttpError(400, "Choose off, 1 day, 7 days or 30 days.");
  if ((g.vanish || 0) !== ms) await D.batch([D.prepare("UPDATE pg_groups SET vanish = ?, vanish_by = ? WHERE id = ?").bind(ms || null, u.id, g.id), event(D, g.id, Date.now(), "vanish", u, String(ms))]);
  return json({ group: await groupView(env, u, g.id) });
}

/* ---------------- routes ---------------- */
async function cleanMembers(D, u, ids, current) {
  const have = new Set(current.map((m) => m.user_id));
  const out = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => id !== u.id && !have.has(id));
  if (!out.length) throw new HttpError(400, "Choose at least one friend.");
  const friends = await friendIds(D, u.id);
  if (out.some((id) => !friends.has(id))) throw new HttpError(403, "You can only add your own friends.");
  // never into a group with someone who has blocked them, or whom they've blocked (nor two new members who have)
  const all = [...new Set([...have, ...out])], ph = (a) => a.map(() => "?").join(",");
  if (all.length > 1 && await D.prepare(`SELECT 1 FROM pg_links WHERE status = 'blocked' AND a IN (${ph(all)}) AND b IN (${ph(all)}) AND (a IN (${ph(out)}) OR b IN (${ph(out)})) LIMIT 1`)
    .bind(...all, ...all, ...out, ...out).first()) throw new HttpError(403, "Someone you chose can’t be added to this group.");
  if ((current.length || 1) + out.length > GROUP_MAX) throw new HttpError(400, `Groups can have up to ${GROUP_MAX} people.`);
  if (await D.prepare(`SELECT 1 FROM pg_group_members WHERE user_id IN (${ph(out)}) GROUP BY user_id HAVING COUNT(*) >= ${GROUPS_EACH} LIMIT 1`).bind(...out).first())
    throw new HttpError(409, `Someone you chose is already in ${GROUPS_EACH} groups, the most anyone can be in.`);
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
    event(D, id, t, "create", u), ...ids.map((m) => event(D, id, t, "add", u, m)),
  ]);
  waitUntil(groupAdded(env, u, ids, { id, name }).catch(() => {}));
  return json({ group: await groupView(env, u, id) });
}
async function addMembers({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "groupadd:" + u.id, 60, 24 * 3600e3);
  const b = await body(request), D = await db(env), g = await groupFor(D, u, b.id), t = Date.now();
  const ids = await cleanMembers(D, u, b.members, await membersOf(D, g.id));
  await D.batch(ids.flatMap((m) => [D.prepare("INSERT OR IGNORE INTO pg_group_members (group_id, user_id, added_by, joined_at) VALUES (?, ?, ?, ?)").bind(g.id, m, u.id, t),
    event(D, g.id, t, "add", u, m)]));
  waitUntil(groupAdded(env, u, ids, g).catch(() => {}));
  return json({ group: await groupView(env, u, g.id) });
}
// Leaving takes you out; the last one out takes the group, its messages and photos with them.
export async function leaveGroup(env, uid, gid) {
  const D = await db(env);
  const out = await D.prepare("DELETE FROM pg_group_members WHERE group_id = ? AND user_id = ?").bind(gid, uid).run();
  if (await D.prepare("SELECT 1 FROM pg_group_members WHERE group_id = ?").bind(gid).first()) {
    if (out.meta.changes) await event(D, gid, Date.now(), "leave", uid).run();
    return;
  }
  const { results } = await D.prepare("SELECT id FROM pg_gmsgs WHERE group_id = ? AND photo = 1").bind(gid).all();
  if (env.BIO_R2) for (let i = 0; i < results.length; i += 900) await env.BIO_R2.delete(results.slice(i, i + 900).map((r) => groupPhotoKey(r.id)));
  await dropReacts(env, { group: gid });
  await D.batch([
    D.prepare("DELETE FROM pg_gdeliv WHERE msg_id IN (SELECT id FROM pg_gmsgs WHERE group_id = ?)").bind(gid),
    D.prepare("DELETE FROM pg_gmsgs WHERE group_id = ?").bind(gid),
    D.prepare("DELETE FROM pg_groups WHERE id = ?").bind(gid),
    D.prepare("DELETE FROM pg_gevents WHERE group_id = ?").bind(gid),
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
  const name = cleanGroupName(b.name);
  if (name !== g.name) await D.batch([D.prepare("UPDATE pg_groups SET name = ? WHERE id = ?").bind(name, g.id), event(D, g.id, Date.now(), "rename", u, name)]);
  return json({ group: await groupView(env, u, g.id) });
}
async function listMessages({ request, env }) {
  const u = await requireUser(request, env);
  const D = await db(env), g = await groupFor(D, u, new URL(request.url).searchParams.get("id")), t = Date.now();
  const friends = await friendIds(D, u.id);
  const rows = await visible(D, u.id, g.id);
  // the group's changes since you joined
  const { results: ev } = await D.prepare(`SELECT e.at, e.kind, e.actor, e.actor_name, e.target, e.target_name FROM pg_gevents e
    JOIN pg_group_members me ON me.group_id = e.group_id AND me.user_id = ?2 WHERE e.group_id = ?1 AND e.at >= me.joined_at ORDER BY e.at LIMIT 500`).bind(g.id, u.id).all();
  const events = ev.map((e) => ({ at: e.at, kind: e.kind, by: { id: e.actor, name: e.actor_name },
    ...(said(e.kind) ? { name: e.target_name } : e.target ? { who: { id: e.target, name: e.target_name } } : {}) }));
  const vs = await views(D, u.id, rows, friends, t), stamps = await newStamps(D, u.id, rows.filter((m) => m.sender === u.id).map((m) => m.id));
  for (const v of vs) if (stamps.has(v.id)) v.stamps = stamps.get(v.id);      // the passport's new stamps (yours only)
  // postmarks: on yours, every landmark any of its pigeons passed; on theirs, the ones the pigeon to you did
  const marks = await marksFor(D, rows.filter((m) => m.sender !== u.id).map((m) => `${m.id}:${u.id}`));
  const mine = new Set(rows.filter((m) => m.sender === u.id).map((m) => m.id));
  if (mine.size) {
    // (looked up by this chat's own pigeons, each delivery's id: "<message>:<member>")
    const dids = [];
    for (const part of chunks([...mine])) dids.push(...(await D.prepare(`SELECT msg_id || ':' || user_id AS id FROM pg_gdeliv WHERE msg_id IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results.map((r) => r.id));
    const results = [];
    for (const part of chunks(dids)) results.push(...(await D.prepare(`SELECT id, at, marks FROM pg_stamped WHERE marks IS NOT NULL AND id IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results);
    for (const r of results) {
      const mid = r.id.split(":")[0]; if (!mine.has(mid)) continue;
      const have = marks.get(mid) || [];
      try { for (const k of JSON.parse(r.marks)) if (!have.some((x) => x.id === k)) { const v = markView(k, r.at); if (v) have.push(v); } } catch (_) {}
      marks.set(mid, have);
    }
  }
  for (const v of vs) { const k = marks.get(v.from === u.id ? v.id : `${v.id}:${u.id}`); if (k?.length) v.postmarks = k; }
  return json({ now: t, messages: vs, events, reacts: await reactsFor(env, u.id, rows.map((m) => m.id)), turn: await turnIn(D, u.id, g.id, t) });
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
  if (u.lat == null && !u.moon) throw new HttpError(409, "Set your location in Account before sending pigeons.");
  if (await idTaken(D, id)) throw new HttpError(409, "That message was already sent.");
  if (isSpace(meta.pigeon)) throw new HttpError(409, "In a group, pigeons to and from the Moon or Mars go as space pigeons by themselves. Choose any pigeon.");
  // everyone in the group right now, you included, needs their own sealed copy of the key
  const members = await membersOf(D, g.id);
  const want = members.map((m) => m.user_id);
  if (Object.keys(keys).length !== want.length || want.some((m) => typeof keys[m] !== "string" || keys[m].length < 20 || keys[m].length > 2000))
    throw new HttpError(409, "Someone joined or left the group. Try again.");

  const tn = await turnIn(D, u.id, g.id, t);
  const mystery = meta.pigeon === "mystery";
  const kind = mystery ? drawMystery() : Object.hasOwn(PIGEONS, meta.pigeon) ? meta.pigeon : tn.free ? "standard" : "swift";
  if (!mystery && PIGEONS[kind].waits && !tn.free) throw new HttpError(409, "It isn’t your turn yet. Send a swift, turbo or rocket pigeon to write now.");
  const from = mystery ? "mystery" : PIGEONS[kind].max ? kind : null;
  if (from) {                 // one special pigeon covers the whole group
    const p = mystery ? MYSTERY : PIGEONS[kind], l = loft(u, from, t);
    if (l.count <= 0) throw new HttpError(409, `No ${from} pigeons left.`);
    const [n, at] = l.count >= p.max ? [l.count - 1, t] : [l.count - 1, l.at + l.hatched * p.every];
    const r = await D.prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ? AND ${p.col} IS ? AND ${p.atCol} IS ?`).bind(n, at, u.id, u[p.col], u[p.atCol]).run();
    if (!r.meta.changes) throw new HttpError(409, "Another pigeon just left. Try again.");
  }
  const risky = u.risky ? 1 : 0, speed = PIGEONS[kind].speed * (risky ? RISKY_SPEED : 1), style = styleOf(meta.route);
  // no pigeon to anyone you've blocked, or who has blocked you (from a group made before the block)
  const cut = new Set((await D.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'blocked' AND (a = ?1 OR b = ?1)").bind(u.id).all()).results.map((r) => r.id));
  const others = want.filter((m) => m !== u.id && !cut.has(m)), mine = await friendIds(D, u.id);
  const { results: rows } = others.length ? await D.prepare(`SELECT id, lat, lon, place, moon FROM pg_users WHERE id IN (${others.map(() => "?").join(",")})`).bind(...others).all() : { results: [] };
  // between people who aren't friends: coarse places at both ends (the stored destination too)
  const to = rows.map((r) => (mine.has(r.id) ? { ...r, from: [u.lat, u.lon] } : { ...r, place: null, lat: coarse(r.lat), lon: coarse(r.lon), from: [coarse(u.lat), coarse(u.lon)] }))
    // to or from the Moon: it goes as a lunar pigeon, whatever the rest of the group's is (functions/_moon.js)
    .map((r) => (u.moon || r.moon ? { ...r, lunar: true } : r));
  // each one's way (passes; islands, for a standard pigeon), then the weather each will meet along it, all in one look
  const plans = new Map(await Promise.all(to.filter((r) => r.lat != null && !r.lunar).map(async (r) => [r.id, await planRoute(env, { from: r.from, to: [r.lat, r.lon], weather: false, hop: hopsFor(kind), style, ceiling: ceilingFor(kind) })])));
  const placed = to.filter((r) => plans.has(r.id));
  const winds = await windsAlong(env, placed.map((r) => ({ path: [r.from, ...plans.get(r.id).way, [r.lat, r.lon]].map((q) => [q[0], q[1]]), start: t, kmh: SPEED_KMH * speed })));
  const windOf = new Map(placed.map((r, i) => [r.id, winds[i]]));
  const me = endOf(u);
  const dels = await Promise.all(to.map(async (r) => {
    if (r.lunar) {
      // (a lunar one to or from the Moon, a laser one to or from Mars)
      const end = endOf(r), sk = end && me ? spaceKinds(me, end)?.[0] : null, f = sk ? spaceFlight(sk, me, end, t, risky && sk === "lunar" ? RISKY_SPEED : 1) : null, at = t + (f ? f.ms : 3 * DAY);
      const roll = crypto.getRandomValues(new Uint32Array(2)), lostAt = risky && roll[0] / 2 ** 32 < RISKY_LOSS ? Math.round(t + (0.15 + 0.7 * (roll[1] / 2 ** 32)) * (at - t)) : null;
      return { to: r.id, km: f ? f.km : 0, at, lostAt, r: { ...r, lat: null, lon: null, place: end?.place ?? null }, w: { wind: null, f: 1 }, wx: { wx: null, ms: 0, reach: null }, legs: null,
        moon: f ? JSON.stringify({ ...((({ km, ms, ...w }) => w)(f)), from: me, to: end }) : null };
    }
    const w = windOf.get(r.id) || { wind: null, f: 1 };
    const plan = plans.get(r.id) || null, rest = plan ? restOf(plan.way) : 0;
    const km = plan ? plan.km : 500, at = Math.round(t + flightMs(km / w.f, speed) + rest), wx = wxOf([w], flightMs(km, speed) + rest, at - t);
    const legs = plan?.way.length ? JSON.stringify(timeWay(r.from, plan.way, [r.lat, r.lon], t, at - t - rest).legs) : null;
    // Pigeon Death: each pigeon takes its own chance
    const roll = crypto.getRandomValues(new Uint32Array(2));
    const odds = plan ? riskOf([r.from, ...plan.way, [r.lat, r.lon]], w.storms || 0, style).p : RISKY_LOSS * (style === "safe" ? 0.5 : 1);     // (its own way's odds)
    const lostAt = risky && roll[0] / 2 ** 32 < odds ? Math.round(t + (0.15 + 0.7 * (roll[1] / 2 ** 32)) * (at - t)) : null;
    return { to: r.id, km, at, lostAt, r, w, wx, legs };
  }));
  const last = Math.max(t, ...dels.map((d) => d.lostAt ?? d.at));
  await D.batch([
    claimId(D, id, "g", t),
    D.prepare(`INSERT INTO pg_gmsgs (id, group_id, sender, body, sender_key, photo, photo_size, pigeon, risky, sent_at, expires_at, from_lat, from_lon, from_place, skin, style)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, g.id, u.id, sealed, keys[u.id], photo ? 1 : 0, photo ? photo.size : null, kind, risky, t,
      photo ? last + PHOTO_TTL : null, u.lat, u.lon, u.place, await skinNow(D, u, t), style),
    ...dels.map((d) => D.prepare(`INSERT INTO pg_gdeliv (msg_id, user_id, wrap, km, deliver_at, lost_at, to_lat, to_lon, to_place, wind, wind_f, wx, wx_ms, wx_at, legs, moon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, d.to, keys[d.to], d.km, d.at, d.lostAt, d.r.lat, d.r.lon, d.r.place, d.w.wind, d.w.f, d.wx.wx, d.wx.ms, d.wx.reach == null ? null : t + d.wx.reach, d.legs, d.moon ?? null)),
  ]);
  if (photo) await env.BIO_R2.put(groupPhotoKey(id), photo.stream(), { httpMetadata: { contentType: "application/octet-stream" } });
  if (g.vanish) await D.prepare("UPDATE pg_gmsgs SET vanish = ? WHERE id = ?").bind(g.vanish, id).run();
  // one of your named pigeons leads: it flies the longest route
  const lead = dels.filter((d) => d.r.lat != null && !d.moon).sort((a, b) => b.km - a.km)[0];
  const bird = lead && kind !== "dumb" ? await claimBird(D, u.id, meta.bird, t, lead.at - t, lead.at) : null;
  if (bird) await D.prepare("UPDATE pg_gmsgs SET bird = ?, bird_name = ?, bird_rank = ?, bird_to = ?, bird_wear = ? WHERE id = ?").bind(bird.id, bird.name, bird.rank, lead.to, bird.wear, id).run();
  waitUntil(groupSent(env, u, g, dels.map((d) => ({ to: d.to, at: d.at })), kind).catch(() => {}));
  waitUntil(findGroupFly(D, id).catch((e) => console.error("pigeon flyover", e && e.message)));     // the sender's friends it flies over
  if (mystery) await D.prepare("UPDATE pg_gmsgs SET mystery = 1 WHERE id = ?").bind(id).run();
  if (photo) await D.prepare("UPDATE pg_gmsgs SET once = ? WHERE id = ?").bind(meta.once === false ? 0 : 1, id).run();
  await noteSeason(D, u.id, t).catch((e) => console.error("pigeon season", e && e.message));
  const m = await D.prepare("SELECT * FROM pg_gmsgs WHERE id = ?").bind(id).first();
  return json({ message: (await views(D, u.id, [m], await friendIds(D, u.id), t))[0] });
}

// Call back a group message: every pigeon of it still in the air turns for home
// (ones that already landed stay). If none had landed, its contents go too.
async function recall({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "recall:" + u.id, 30, 60 * 60e3);
  const id = String((await body(request)).id || ""), D = await db(env), t = Date.now();
  const m = UUID_RE.test(id) && await D.prepare("SELECT * FROM pg_gmsgs WHERE id = ? AND sender = ?").bind(id, u.id).first();
  if (!m) throw new HttpError(404, "That pigeon isn’t yours to call back.");
  await groupFor(D, u, m.group_id);
  const flying = await D.prepare("SELECT 1 FROM pg_gdeliv WHERE msg_id = ?1 AND deliver_at > ?2 AND (lost_at IS NULL OR lost_at > ?2) LIMIT 1").bind(id, t).first();
  if (!flying) throw new HttpError(409, "Too late: those pigeons have already landed.");
  await spendSwift(D, u, t);
  const r = await D.prepare(`UPDATE pg_gdeliv SET lost_at = ?1, recalled = 1, notified_at = ?1 WHERE msg_id = ?2 AND deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)`).bind(t, id).run();
  if (!r.meta.changes) throw new HttpError(409, "Too late: those pigeons have already landed.");
  await dropFly(D, id, t);
  const landed = await D.prepare("SELECT 1 FROM pg_gdeliv WHERE msg_id = ? AND deliver_at <= ? AND lost_at IS NULL LIMIT 1").bind(id, t).first();
  if (!landed) {
    await D.prepare("UPDATE pg_gmsgs SET body = '', photo = CASE WHEN photo = 1 THEN 2 ELSE photo END WHERE id = ?").bind(id).run();
    if (m.photo === 1 && env.BIO_R2) await env.BIO_R2.delete(groupPhotoKey(id));
  }
  const fresh = await D.prepare("SELECT * FROM pg_gmsgs WHERE id = ?").bind(id).first();
  return json({ message: (await views(D, u.id, [fresh], await friendIds(D, u.id), t))[0] });
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
  // view once: each member downloads it once, its sender never again; gone once no one else still may
  if (isOnce(m) && !(m.once == null && !d)) {
    if (!d) throw new HttpError(403, "A view-once photo can only be opened by who it was sent to.");
    const c = await D.prepare("UPDATE pg_gdeliv SET viewed_at = ? WHERE msg_id = ? AND user_id = ? AND viewed_at IS NULL").bind(t, id, u.id).run();
    if (!c.meta.changes) throw new HttpError(410, "You’ve already opened this photo.");
    const left = await D.prepare("SELECT COUNT(*) AS n FROM pg_gdeliv WHERE msg_id = ? AND viewed_at IS NULL AND (lost_at IS NULL OR lost_at > ?)").bind(id, t).first();
    return serveOnce(env, groupPhotoKey(id), left.n > 0);
  }
  const obj = env.BIO_R2 && (await env.BIO_R2.get(groupPhotoKey(id)));
  if (!obj) throw new HttpError(410, "This photo has flown away.");
  return new Response(obj.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

// Someone moved: their group pigeons turn too, the same way as one-to-one ones.
// Senders hear about it only if they're friends (the new place is theirs to know).
// The Skies: group pigeons in the air that are yours, or flying to you.
export async function groupSkies(D, uid, t) {
  const friends = await friendIds(D, uid);
  const { results: rows } = await D.prepare(`
    SELECT m.*, d.wrap, d.km, d.live_at, d.deliver_at, d.lost_at, d.recalled, d.wind, d.wx, d.wx_ms, d.read_at, d.to_lat, d.to_lon, d.to_place, d.legs, d.user_id
      FROM pg_gmsgs m JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = ?1
      WHERE d.deliver_at > ?2 AND (d.lost_at IS NULL OR d.lost_at > ?2)
    UNION ALL
    SELECT m.*, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM pg_gmsgs m
      WHERE m.sender = ?1 AND EXISTS (SELECT 1 FROM pg_gdeliv d WHERE d.msg_id = m.id AND d.deliver_at > ?2 AND (d.lost_at IS NULL OR d.lost_at > ?2))
    LIMIT 100`).bind(uid, t).all();
  return views(D, uid, rows, friends, t);
}
export async function rerouteGroups(env, u, p, t, waitUntil) {
  const D = await db(env);
  const { results } = await D.prepare(`SELECT d.*, m.sender, m.sent_at, m.from_lat, m.from_lon, m.pigeon, m.risky, m.group_id, m.photo, m.style FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
    WHERE d.user_id = ?1 AND d.deliver_at > ?2 AND d.to_lat IS NOT NULL AND (d.lost_at IS NULL OR d.lost_at > ?2)`).bind(u.id, t).all();
  if (!results.length) return;
  const friends = await friendIds(D, u.id);
  const { results: bl } = await D.prepare("SELECT a, b FROM pg_links WHERE status = 'blocked' AND (a = ?1 OR b = ?1)").bind(u.id).all();
  const blocked = new Set(bl.map((r) => (r.a === u.id ? r.b : r.a)));
  for (const d0 of results) {
    if (blocked.has(d0.sender)) continue;                              // (a move isn't followed, so isn't told, across a block)
    const legs = d0.legs ? JSON.parse(d0.legs) : [];
    // a sender who isn't your friend only ever knew your coarse place
    const nf = !friends.has(d0.sender), d = nf ? { ...d0, from_lat: coarse(d0.from_lat), from_lon: coarse(d0.from_lon) } : d0;
    const pp = nf ? { ...p, lat: coarse(p.lat), lon: coarse(p.lon) } : p;
    if (haversineKm(d.to_lat, d.to_lon, pp.lat, pp.lon) <= REROUTE_KM) continue;
    const turned = turnsOf(legs).at(-1);                             // (planned bends and cheers aren't turns)
    if (turned && t - turned[2] < TURN_EVERY) continue;
    const speed = PIGEONS[d.pigeon].speed * (d.risky ? RISKY_SPEED : 1), ship = legs.filter((l) => l[3] === "b"), ashore = ship.at(-1);
    let deliver, km;
    if (ashore && ship[0][2] <= t && ashore[2] > t) {
      // on its way by ship: the ship sails on, and it turns from where it comes ashore
      const keep = legs.filter((l) => l[2] <= ashore[2]), was = pathKm([[ashore[0], ashore[1]], ...legs.filter((l) => l[2] > ashore[2]), [d.to_lat, d.to_lon]]);
      const plan = await planRoute(env, { from: [ashore[0], ashore[1]], to: [pp.lat, pp.lon], weather: false, hop: hopsFor(d.pigeon), style: d.style, ceiling: ceilingFor(d.pigeon) }), rest = restOf(plan.way);
      deliver = ashore[2] + (plan.km / (SPEED_KMH * (d.wind_f || 1))) * 3600e3 / speed + rest;
      km = d.km - was + plan.km;
      legs.length = 0;
      legs.push(...keep, ...timeWay([ashore[0], ashore[1]], plan.way, [pp.lat, pp.lon], ashore[2], deliver - ashore[2] - rest).legs);
    } else {
      const [pLat, pLon] = posAt(stopsOf(d), t);                          // where it is now, on the way it was going
      const done = passed(legs, t), flown = pathKm([[d.from_lat, d.from_lon], ...done, [pLat, pLon]]);
      const plan = await planRoute(env, { from: [pLat, pLon], to: [pp.lat, pp.lon], weather: false, hop: hopsFor(d.pigeon), style: d.style, ceiling: ceilingFor(d.pigeon) }), ahead = plan.km, rest = restOf(plan.way);
      const sails = plan.way.some((q) => q.sail);                          // (a voyage on the new way: days more, not a flight's)
      deliver = Math.max(t + MIN_FLIGHT / speed / 5, Math.min(d.sent_at + MAX_FLIGHT / speed + (sails ? 7 * DAY : 0), t + (ahead / (SPEED_KMH * (d.wind_f || 1))) * 3600e3 / speed + rest));
      km = flown + ahead;
      legs.length = 0;
      legs.push(...done, [round5(pLat), round5(pLon), t], ...timeWay([pLat, pLon], plan.way, [pp.lat, pp.lon], t, deliver - t - rest).legs);
    }
    const lostAt = d.lost_at == null ? null : d.lost_at < deliver ? d.lost_at : t + (deliver - t) / 2;
    const r = await D.prepare(`UPDATE pg_gdeliv SET wx = NULL, wx_ms = NULL, wx_at = NULL, to_lat = ?, to_lon = ?, to_place = ?, deliver_at = ?, km = ?, legs = ?, lost_at = ? WHERE msg_id = ? AND user_id = ? AND deliver_at > ?`)
      .bind(pp.lat, pp.lon, pp.place, deliver, km, JSON.stringify(legs), lostAt, d.msg_id, u.id, t).run();
    if (!r.meta.changes) continue;
    // a photo stays until 24 hours after its last pigeon lands
    if (d.photo === 1) await D.prepare("UPDATE pg_gmsgs SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?").bind((lostAt ?? deliver) + PHOTO_TTL, d.msg_id).run();
    waitUntil(reflyGroup(D, d.msg_id, t).catch(() => {}));
    if (friends.has(d.sender)) waitUntil(groupRerouted(env, d.sender, { ...u, place: p.place }, d.group_id, deliver).catch(() => {}));
  }
}

// When an account is deleted: out of every group, and their messages with them.
export async function removeFromGroups(env, uid) {
  const D = await db(env);
  const { results: photos } = await D.prepare("SELECT id FROM pg_gmsgs WHERE sender = ? AND photo = 1").bind(uid).all();
  if (env.BIO_R2 && photos.length) for (let i = 0; i < photos.length; i += 900) await env.BIO_R2.delete(photos.slice(i, i + 900).map((r) => groupPhotoKey(r.id)));
  await D.batch([
    // a named pigeon leading a flight to them comes home now (it's settled through their delivery, about to go)
    D.prepare("UPDATE pg_gmsgs SET bird_done = ? WHERE bird_to = ? AND bird_done IS NULL").bind(Date.now(), uid),
    D.prepare("DELETE FROM pg_gdeliv WHERE user_id = ? OR msg_id IN (SELECT id FROM pg_gmsgs WHERE sender = ?)").bind(uid, uid),
    D.prepare("DELETE FROM pg_gmsgs WHERE sender = ?").bind(uid),
  ]);
  const { results: gs } = await D.prepare("SELECT group_id FROM pg_group_members WHERE user_id = ?").bind(uid).all();
  for (const g of gs) await leaveGroup(env, uid, g.group_id);
}

export const GROUP_ROUTES = {
  "POST groups": createGroup, "POST group-add": addMembers, "POST group-leave": leave, "POST group-mute": mute, "POST group-name": rename, "POST group-vanish": setVanish,
  "GET group-messages": listMessages, "POST group-messages": send, "POST group-read": markRead, "GET group-photo": getPhoto, "POST group-recall": recall,
};
