// Holding a person's notifications while they ride (Today First, spec §8.7). Only an explicit ride holds anything
// (functions/_fittimes.js: every fx_times row, and an fx_offers row matching EXPLICIT_OFFER), from 10 minutes before its
// start until an activity of theirs since 40 minutes before it (fx_acts, fx_garmin_new, fx_strava_new), or its cap
// (start + the longer of 2 hours and its length + 30 minutes). Its level is the account's holdRide rule (td_rules; no
// row, or no table: do): at do friends and apps are held, at suggest apps only, at quiet nothing. Warnings always pass.
//   busyMap(D, userIds, t) → Map(userId → { until, level, rideStart }), in one statement, for those busy at t
//   busyNow(env, userId, t) → { until, level, rideStart } or null
//   heldCount(env, userId, since, { t }) → how many notifications are being held for the account, of those that came
//     since then (Chat's messages, group messages and reactions still waiting, Markets' alerts and wrap held)
//   heldAdd(env, userId, n) → nothing (td_rules.held counted up: the hold rule's record, "Held 14")
// And for the senders (functions/_notify.js, _streaks.js, _wxpush.js, _markets.js):
//   holdsFor(busy, kind) → whether a busy entry holds that kind: "friends" (Chat's: at do) or "apps" (at do or suggest)
//   holdsAt(D, t) → a tick's view of who's riding: load(ids) (one statement for those not asked yet), holds(id, kind),
//     rode(id, at, kind) (whether a moment fell inside a ride of theirs that held that kind and has ended: what's told
//     now was held, "while you rode")
// The tables it reads may not all be made yet (Fitness's waiting rows, its ride times, Today's rules): the whole statement
// is tried first, and where it fails, the tables and columns there are looked up and the statement made without the rest
// (as functions/_fitshare.js doneMany does). Time is always passed in, never read here.
import { EXPLICIT_OFFER } from "./_fittimes.js";
import { tddb } from "./_today.js";

const MIN = 60e3, HOUR = 60 * MIN;
// held from 10 minutes before the start; an activity since 40 minutes before it ends the hold; the cap: the start and the
// longer of 2 hours and the ride's length and half an hour
export const HOLD_EARLY = 10 * MIN, HOLD_DONE = 40 * MIN, CAP_LEAST = 2 * HOUR, CAP_MORE = 30 * MIN;
// (how far back a ride's start is looked for: the longest a ride can be, 6 hours, and its half hour, and some)
const BACK = 8 * HOUR;
// (and a ride that's ended, for what's told now it has: one that started in the day before)
const RODE_BACK = 24 * HOUR;
const LEVELS = ["do", "suggest", "quiet"];
// (D1 takes 100 bound values a statement: the time, and the accounts 90 at a time)
const PER = 90;

export const holdsFor = (b, kind = "friends") => !!b && (kind === "apps" ? b.level === "do" || b.level === "suggest" : b.level === "do");

// ---- the statement ----
const FULL = { times: true, offers: true, acts: true, garmin: true, strava: true, rules: true };
// (have: which of the tables are there to read)
function holdSql(n, have, back) {
  const ids = Array.from({ length: n }, (_, i) => `?${i + 2}`).join(", ");
  const near = (a) => `${a}.start <= ?1 + ${HOLD_EARLY} AND ${a}.start > ?1 - ${back}`;
  const src = [];
  if (have.times) src.push(`SELECT x.user_id, x.start, x.stop - x.start AS len FROM fx_times x WHERE x.user_id IN (${ids}) AND ${near("x")}`);
  // (an offer's length: its session's, but never past its window, which is the most a plan can be)
  if (have.offers) src.push(`SELECT o.user_id, o.start, MIN(o.secs * 1000, o.stop - o.start) AS len FROM fx_offers o WHERE o.user_id IN (${ids}) AND ${EXPLICIT_OFFER} AND ${near("o")}`);
  if (!src.length) return null;
  const done = [have.acts && "fx_acts", have.garmin && "fx_garmin_new", have.strava && "fx_strava_new"].filter(Boolean)
    .map((tb) => `EXISTS (SELECT 1 FROM ${tb} a WHERE a.user_id = w.user_id AND a.start >= w.start - ${HOLD_DONE} AND a.start <= ?1)`);
  const level = have.rules ? "COALESCE((SELECT r.level FROM td_rules r WHERE r.user_id = w.user_id AND r.rule = 'holdRide'), 'do')" : "'do'";
  return `WITH w AS (SELECT user_id, start, start + MAX(${CAP_LEAST}, len + ${CAP_MORE}) AS cap FROM (${src.join(" UNION ALL ")}))
    SELECT w.user_id AS uid, w.start, w.cap, ${level} AS level, ${done.length ? `(${done.join(" OR ")})` : "0"} AS done FROM w WHERE w.start - ${HOLD_EARLY} <= ?1`;
}
// Which tables (and fx_offers' taken, which EXPLICIT_OFFER reads) are there: { times, offers, acts, garmin, strava, rules }
async function shapeOf(D) {
  const tabs = ["fx_times", "fx_offers", "fx_acts", "fx_garmin_new", "fx_strava_new", "td_rules"];
  const got = await D.batch(tabs.map((tb) => D.prepare(`PRAGMA table_info("${tb}")`)));
  const cols = got.map((r) => new Set((r?.results || []).map((c) => c.name)));
  const has = (i, ...need) => need.every((c) => cols[i].has(c));
  return { times: has(0, "user_id", "start", "stop"), offers: has(1, "user_id", "start", "stop", "secs", "state", "role", "taken"), acts: has(2, "user_id", "start"),
    garmin: has(3, "user_id", "start"), strava: has(4, "user_id", "start"), rules: has(5, "user_id", "rule", "level") };
}
// (the whole statement first; where it fails, the tables there looked up and the statement made of those: so a table made
// since, Fitness's first ride time, say, is read from the next time on)
async function ridesOf(D, ids, t, back) {
  const out = [];
  for (let i = 0; i < ids.length; i += PER) {
    const part = ids.slice(i, i + PER);
    const run = (have) => { const sql = holdSql(part.length, have, back); return sql ? D.prepare(sql).bind(t, ...part).all().then((r) => r.results || []) : Promise.resolve([]); };
    let rows;
    try { rows = await run(FULL); }
    catch (e) { rows = await run(await shapeOf(D)); }
    out.push(...rows);
  }
  return out.map((r) => ({ uid: r.uid, start: Number(r.start), cap: Number(r.cap), level: LEVELS.includes(r.level) ? r.level : "do", done: !!r.done }));
}
const idsOf = (userIds) => [...new Set((Array.isArray(userIds) ? userIds : [...(userIds || [])]).filter((id) => typeof id === "string" && id))];
const need = (t, what) => { if (!Number.isFinite(t)) throw new TypeError(`${what}: pass t, the time`); return t; };
// (a ride counts at t while start − 10 min ≤ t < cap and nothing's come in since 40 minutes before its start)
const riding = (r, t) => !r.done && t < r.cap && r.start - HOLD_EARLY <= t;
function busyOf(rows, t) {
  const busy = new Map();
  for (const r of rows) {
    if (!riding(r, t)) continue;
    const was = busy.get(r.uid);
    // (two at once: held till the later one's done)
    if (!was || r.cap > was.until) busy.set(r.uid, { until: r.cap, level: r.level, rideStart: r.start });
  }
  return busy;
}

export async function busyMap(D, userIds, t) {
  need(t, "busyMap");
  const ids = idsOf(userIds);
  if (!ids.length || !D) return new Map();
  return busyOf(await ridesOf(D, ids, t, BACK), t);
}
export async function busyNow(env, userId, t) {
  need(t, "busyNow");
  if (!env?.DB || typeof userId !== "string" || !userId) return null;
  return (await busyMap(env.DB, [userId], t)).get(userId) || null;
}

// A tick's view, for every pass of it: who's riding now, and the rides that held and have ended (for what's told now)
export function holdsAt(D, t) {
  need(t, "holdsAt");
  const busy = new Map(), rode = new Map(), asked = new Set();
  return {
    busy,
    async load(userIds) {
      const want = idsOf(userIds).filter((id) => !asked.has(id));
      if (!want.length || !D) return;
      for (const id of want) asked.add(id);
      // (a failure holds nothing: notifications go as they did before rides were held)
      let rows = [];
      try { rows = await ridesOf(D, want, t, RODE_BACK); } catch (e) { console.error("busy", e && e.message); return; }
      for (const [k, v] of busyOf(rows, t)) busy.set(k, v);
      for (const r of rows) if (!riding(r, t) && r.start - HOLD_EARLY <= t) {
        if (!rode.has(r.uid)) rode.set(r.uid, []);
        rode.get(r.uid).push({ from: r.start - HOLD_EARLY, to: r.cap, level: r.level });
      }
    },
    holds: (uid, kind = "friends") => holdsFor(busy.get(uid), kind),
    rode: (uid, at, kind = "friends") => !busy.has(uid) && (rode.get(uid) || []).some((w) => w.from <= at && at < w.to && holdsFor(w, kind)),
  };
}

// ---- what's held, counted ----
// (Markets' held alert or wrap carries when it was first held: "held:<its day>@<ms>", functions/_markets.js)
export const heldMark = (day, t) => `held:${day}@${t}`;
const MARK_AT = (col) => `CAST(SUBSTR(${col}, INSTR(${col}, '@') + 1) AS INTEGER)`;
// (t: the caller's time, for what's come by then; its contract has no t, so a caller that doesn't pass one gets now)
export async function heldCount(env, userId, since, { t = Date.now() } = {}) {
  if (!env?.DB || typeof userId !== "string" || !userId || !Number.isFinite(since)) return 0;
  const D = env.DB, n = (q, ...a) => D.prepare(q).bind(...a).first().then((r) => Number(r?.n) || 0, () => 0);
  const parts = await Promise.all([
    n(`SELECT COUNT(*) AS n FROM pg_msgs WHERE recipient = ?1 AND notified_at IS NULL AND read_at IS NULL AND lost_at IS NULL AND gone_at IS NULL
      AND deliver_at >= ?2 AND deliver_at <= ?3`, userId, since, t),
    n(`SELECT COUNT(*) AS n FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = d.user_id AND gm.muted = 0
      WHERE d.user_id = ?1 AND d.notified_at IS NULL AND d.read_at IS NULL AND d.lost_at IS NULL AND m.gone_at IS NULL AND d.deliver_at >= ?2 AND d.deliver_at <= ?3`, userId, since, t),
    n("SELECT COUNT(*) AS n FROM pg_reacts WHERE recipient = ?1 AND notified_at IS NULL AND deliver_at >= ?2 AND deliver_at <= ?3", userId, since, t),
    n(`SELECT COUNT(*) AS n FROM mk_alerts WHERE user_id = ?1 AND fired LIKE 'held:%' AND ${MARK_AT("fired")} >= ?2`, userId, since),
    n(`SELECT COUNT(*) AS n FROM mk_wrap WHERE user_id = ?1 AND sent LIKE 'held:%' AND ${MARK_AT("sent")} >= ?2`, userId, since),
  ]);
  return parts.reduce((a, b) => a + b, 0);
}
export async function heldAdd(env, userId, n) {
  const k = Math.floor(Number(n));
  if (!(k > 0) || typeof userId !== "string" || !userId || !env?.DB) return;
  // (never in the way of a notification: a count that can't be kept isn't)
  try {
    const D = await tddb(env);
    await D.prepare("INSERT INTO td_rules (user_id, rule, held) VALUES (?1, 'holdRide', ?2) ON CONFLICT(user_id, rule) DO UPDATE SET held = held + ?2").bind(userId, k).run();
  } catch (e) { console.error("busy held", e && e.message); }
}
