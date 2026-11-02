// Chat in real time, without a socket: an open app asks "what's changed?" every few seconds (POST pulse), and the
// server answers from a small change feed (pg_pulse: who's told which chat changed, and when), marks what that phone
// now has as delivered, gives the unread counts, and says who's typing.
//
// Typing is never written to the database: it's held for a few seconds in the memory of a Durable Object (workers/live,
// the Typing class: one per reader for one-to-one chats, "u:<id>", and one per group, "g:<id>"), reached through the
// TYPING binding. With no binding (or TYPING_OFF=1) typing is simply off: no dots, and nothing stored instead.
//
// Every write that changes a chat pokes it (pokes(): one statement, in the same batch as the write, or right after), so
// a later live line (a socket) need only change pokes() itself.

import { HttpError, json, db, body, requireUser, UUID_RE, chunks } from "./_pigeon.js";

export const TYPING_WAIT = 1500;          // how long a call to the typing object may take before it's taken as "no typing"
const FAST = 1000;                        // a pulse closer than this to the last from the same sign-in is refused, unread
const BASE_MS = 3000;                     // the pace with a chat open (PULSE_MS changes it for everyone, without a release)

// Who to tell that a chat changed: [[userId, chatKey], ...] → the statements (none for none), each stamped with the time
// it's built, right before the batch that carries it (never a request's or the tick's start time: a reader who has
// asked since then would miss it). 30 pairs to a statement (90 parameters).
export function pokes(D, list) {
  const at = Date.now(), pairs = (list || []).filter((p) => p && p[0] && p[1]);
  return chunks(pairs, 30).map((part) => D.prepare(`INSERT INTO pg_pulse (user_id, chat, at) VALUES ${part.map(() => "(?, ?, ?)").join(", ")}
    ON CONFLICT(user_id, chat) DO UPDATE SET at = MAX(at, excluded.at)`).bind(...part.flatMap(([u, c]) => [u, c, at])));
}

// The same, for things that came due while their notification is held (quiet hours, or the chat open on that phone):
// [[userId, chatKey, dueAt], ...] → statements that poke only where nothing has poked that chat since it came due, so the
// tick can offer every held row each time it runs and each is poked once, when it first comes due (its notification,
// when it goes, pokes again). 200 to a statement (one parameter: the list).
export function pokesAfter(D, list) {
  const at = Date.now(), rows = (list || []).filter((p) => p && p[0] && p[1] && Number.isFinite(p[2]));
  return chunks(rows, 200).map((part) => D.prepare(`INSERT INTO pg_pulse (user_id, chat, at)
    SELECT DISTINCT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), ?2 FROM json_each(?1) j
    WHERE NOT EXISTS (SELECT 1 FROM pg_pulse p WHERE p.user_id = json_extract(j.value, '$[0]') AND p.chat = json_extract(j.value, '$[1]')
      AND p.at >= json_extract(j.value, '$[2]'))
    ON CONFLICT(user_id, chat) DO UPDATE SET at = MAX(at, excluded.at)`).bind(JSON.stringify(part), at));
}

// Delivered: everything that has reached this person's Chat (letters too, so older Chats mark it as well) → 2 to 4
// statements. The senders of instant messages are poked so their ticks turn, unless this person hides when they're
// online (then the sender's tick turns on their next ordinary refresh, never at the moment the app was opened).
export function deliveredQs(D, u, t) {
  const now = Date.now(), out = [];
  if (!u.hide_online) out.push(
    D.prepare(`INSERT INTO pg_pulse (user_id, chat, at) SELECT DISTINCT sender, recipient, ?3 FROM pg_msgs
      WHERE recipient = ?1 AND got_at IS NULL AND deliver_at <= ?2 AND sent_at <= ?2 AND lost_at IS NULL AND instant = 1
      ON CONFLICT(user_id, chat) DO UPDATE SET at = MAX(at, excluded.at)`).bind(u.id, t, now),
    D.prepare(`INSERT INTO pg_pulse (user_id, chat, at) SELECT DISTINCT m.sender, m.group_id, ?3 FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id
      WHERE d.user_id = ?1 AND d.got_at IS NULL AND d.deliver_at <= ?2 AND d.lost_at IS NULL AND m.sender != ?1 AND m.instant = 1
      ON CONFLICT(user_id, chat) DO UPDATE SET at = MAX(at, excluded.at)`).bind(u.id, t, now));
  out.push(
    D.prepare("UPDATE pg_msgs SET got_at = ?2 WHERE recipient = ?1 AND got_at IS NULL AND deliver_at <= ?2 AND sent_at <= ?2 AND lost_at IS NULL").bind(u.id, t),
    D.prepare("UPDATE pg_gdeliv SET got_at = ?2 WHERE user_id = ?1 AND got_at IS NULL AND deliver_at <= ?2 AND lost_at IS NULL").bind(u.id, t));
  return out;
}

/* ---------------- typing, held in memory (workers/live) ---------------- */
const typingOn = (env) => !!env.TYPING && env.TYPING_OFF !== "1";
// One call to a typing object (name: "u:<reader>" or "g:<group>"; body: { set?, clear?, read? }) → its answer, or null
// (no binding, turned off, an error, or no answer within TYPING_WAIT)
export async function typingCall(env, name, b) {
  if (!typingOn(env)) return null;
  let timer;
  try {
    const late = new Promise((ok) => { timer = setTimeout(() => ok(null), TYPING_WAIT); });
    const ask = (async () => {
      const stub = env.TYPING.get(env.TYPING.idFromName(name));
      const r = await stub.fetch("https://typing/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return r && r.ok ? await r.json() : null;
    })().catch(() => null);
    return await Promise.race([ask, late]);
  } catch (_) { return null; }
  finally { clearTimeout(timer); }
}
// Typing cleared at once (a friendship ended, a block, leaving a group): [[name, fromId], ...]; never fails
export async function typingClear(env, pairs) {
  if (!typingOn(env) || !pairs?.length) return;
  await Promise.all(pairs.map(([name, from]) => typingCall(env, name, { clear: from }))).catch(() => {});
}

/* ---------------- POST pulse ---------------- */
// (per copy of the server: when each sign-in last asked; a pulse sooner than FAST after it is refused without a look at
// the database. Not limit(): that would be a write to the database every few seconds for everyone. Only what could be a
// sign-in is kept, and never more than KEEP_MAX of them: forgetting one can only let an extra pulse through)
const lastPulse = new Map(), SIGN_IN = /^Bearer [A-Za-z0-9_-]{20,200}$/, KEEP_MAX = 20000;
let prunedAt = 0;
// clears: a pulse that only says the chat's closed or typing's stopped (going away, or back to the list). It's never
// tried again, so it goes through even then, once: two of them within FAST, the second is refused as any other
export function tooFast(auth, t, clears = false) {
  if (!SIGN_IN.test(auth)) return 0;
  const was = lastPulse.get(auth);
  if (was && t - was.at < FAST && !(clears && !was.clears)) return FAST - (t - was.at);
  lastPulse.set(auth, { at: t, clears });
  if (lastPulse.size > 5000 && (t - prunedAt > 10e3 || lastPulse.size > KEEP_MAX)) {
    prunedAt = t;
    for (const [k, v] of lastPulse) if (t - v.at > 60e3) lastPulse.delete(k);
    if (lastPulse.size > KEEP_MAX) lastPulse.clear();
  }
  return 0;
}
export const pulsesKept = () => lastPulse.size;
const isKey = (v) => typeof v === "string" && UUID_RE.test(v);
async function pulse({ request, env }) {
  const t = Date.now(), auth = request.headers.get("Authorization") || "";
  const b = await body(request, 1024);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "Bad request.");
  const has = (k) => b[k] !== undefined && b[k] !== null;
  if (has("open") && b.open !== "" && !isKey(b.open)) throw new HttpError(400, "Bad request.");
  if ((has("typing") && !isKey(b.typing)) || (has("stop") && !isKey(b.stop)) || (has("typing") && has("stop"))) throw new HttpError(400, "Bad request.");
  const wait = tooFast(auth, t, !has("typing") && (b.open === "" || has("stop")));
  if (wait) return json({ error: "Too fast.", retry: wait }, 429);
  const u = await requireUser(request, env), D = await db(env), me = u.id;
  const since = typeof b.since === "number" && Number.isFinite(b.since) ? b.since : t;
  const open = has("open") ? b.open : undefined, typing = has("typing") ? b.typing : null, stop = has("stop") ? b.stop : null;
  const tk = typing || stop || "", available = typingOn(env), canRead = available && !u.hide_typing;
  // one batch: what the keys are, who I'm blocked with, the chat on screen, delivered, what's changed, the unread counts
  const qs = [], at = {};
  if (tk || open) at.keys = qs.push(D.prepare(`SELECT EXISTS (SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))) AS pal,
      EXISTS (SELECT 1 FROM pg_group_members WHERE group_id = ?2 AND user_id = ?1) AS grp,
      EXISTS (SELECT 1 FROM pg_group_members WHERE group_id = ?3 AND user_id = ?1) AS opengrp`).bind(me, tk, open || "")) - 1;
  if (canRead) at.cut = qs.push(D.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'blocked' AND (a = ?1 OR b = ?1)").bind(me)) - 1;
  if (open !== undefined) qs.push(D.prepare(`UPDATE pg_users SET open_chat = NULLIF(?2, ''), open_at = ?3 WHERE id = ?1
    AND (open_chat IS NOT NULLIF(?2, '') OR open_at IS NULL OR open_at < ?3 - 20000)`).bind(me, open, t));
  qs.push(...deliveredQs(D, u, t));
  at.feed = qs.push(D.prepare("SELECT chat, at FROM pg_pulse WHERE user_id = ?1 AND at > ?2").bind(me, since - 2000)) - 1;
  at.unread = qs.push(D.prepare(`SELECT sender, COUNT(*) AS n FROM pg_msgs WHERE recipient = ?1 AND read_at IS NULL AND deliver_at <= ?2 AND sent_at <= ?2
    AND lost_at IS NULL AND gone_at IS NULL GROUP BY sender`).bind(me, t)) - 1;
  const res = await D.batch(qs);
  const keys = at.keys != null ? res[at.keys].results[0] || {} : {}, cut = new Set(at.cut != null ? res[at.cut].results.map((r) => r.id) : []);
  const changed = res[at.feed].results.map((r) => ({ chat: r.chat, at: r.at }));
  const unread = Object.fromEntries(res[at.unread].results.map((r) => [r.sender, r.n]));
  // typing: my own (start, or stop) to the reader's object or the group's, and what's for me to see, all at once
  let said = null;
  if (available) {
    said = {};
    const where = (k) => (keys.pal ? "u:" + k : keys.grp ? "g:" + k : null);
    const calls = new Map();       // name → body
    const add = (name, part) => { if (name) calls.set(name, { ...(calls.get(name) || {}), ...part }); };
    if (typing && !u.hide_typing) add(where(typing), { set: me });
    if (stop) add(where(stop), { clear: me });
    if (canRead) { add("u:" + me, { read: true }); if (open && keys.opengrp) add("g:" + open, { read: true }); }
    const names = [...calls.keys()], got = await Promise.all(names.map((n) => typingCall(env, n, calls.get(n))));
    const of = (n) => { const i = names.indexOf(n); return i >= 0 && Array.isArray(got[i]?.typing) ? got[i].typing.filter((x) => typeof x === "string") : []; };
    if (canRead) {
      for (const id of of("u:" + me)) if (id !== me && !cut.has(id)) said[id] = [id];
      if (open && keys.opengrp) { const ids = of("g:" + open).filter((x) => x !== me && !cut.has(x)); if (ids.length) said[open] = ids; }
    }
  }
  const base = Number(env.PULSE_MS) || BASE_MS;
  const lively = !!open && ((said && Object.keys(said).length > 0) || changed.some((c) => c.chat === open));
  const next = open ? (lively ? Math.max(2000, Math.round(base * 2 / 3)) : base) : Math.round(base * 10 / 3);
  return json({ now: t, next, changed, unread, typing: said });
}

export const PULSE_ROUTES = { "POST pulse": pulse };
