// Times agreed in Chat (Today First, spec §5.1, §6.3, §8.4): a call or a meeting offered or agreed with a friend, each
// person's own td_times row, never any words. The inviter's phone writes a 'pending' row as it sends the invite (with
// the other times it offered, opts); the friend's Yes, from their own phone, writes their own 'yes' row and turns the
// inviter's 'yes' at the chosen time in the same batch. Only 'yes' rows are ever read by Today.
//   timesFor(env, userId, from, to, { t }) → [{ id, kind, start, stop, tz, withId, who, role }]: the 'yes' rows that
//     overlap from to to (ms), not past their keep (until > t), soonest first. { t } is needed: the route's time, never
//     the clock read down here (a test's fixed day, or X-Today-At's), so one left out throws a TypeError at once
//   timesAround(env, userId, t, ms) → the 'yes' rows that overlap t − ms to t + ms, not past their keep (Today's clash
//     rule), soonest first (t needed, as above)
//   timesExport(env, userId) → [{ kind, start, stop, tz, who, role, state }]: every row of the account's, for its
//     export (no ids: neither the letter's nor the friend's)
//   dropTimes(env, userId) → nothing (the account's rows gone, with the account; the table needn't be made yet)
//   addTime(env, u, row, { t }) → { promoted }: the caller's own row written (functions/_share.js POST time-offer), row
//     { id, kind, start, stop, tz, withId, who, role, state?, opts? }, its friend (withId) already checked as one by
//     the caller (pg_links 'ok') and who that friend's first name:
//     - role "asked", state "pending": the inviter's own row as the invite goes, with its other times (opts, at most 3,
//       those already past left out), never read by Today, kept until the last time it offered ends; 20 at most;
//     - role "answered": the friend's Yes, their own 'yes' row, and in the same batch the inviter's pending row made
//       'yes' at the time chosen (promoteTime; promoted says whether it was);
//     - role "asked" without state: the inviter's phone drawing the Yes later (an invite sent from an older Chat, or
//       one whose pending row came after the Yes): the row made 'yes', or its own pending row for that friend made
//       'yes' where the time is one it offered, of the same kind; changing nothing where it's 'yes' already.
//     A pending row that comes after the friend's Yes (the inviter's phone offline as the invite went) is made 'yes' at
//     once, at the time they chose, where it's one it offered (promoted then says so). The same id again changes
//     nothing more. Each time starts on a quarter hour, lasts 15 minutes to 4 hours, and a 'yes' one starts after t (a
//     pending one: its last offered end after t). { t } is needed
//   promoteTime(env, inviterId, id, answererId, start, stop, { t, kind }) → whether the inviter's pending row (id) for
//     that friend alone (with_id the answerer), at its own time or one of its opts (and of that kind, where given),
//     became 'yes' at the time chosen, kept 12 hours past it; never once that time's begun. { t } is needed
//   promoteTimeQ(…the same) → that UPDATE alone, for the caller's own D.batch (addTime's)
//   timesForQ(env, userId, from, to, { t }) → timesFor's read as the statement alone, for the caller's own D.batch
//     (Chat's sync), each row then through timeView
// The table is made on first use, its setup fingerprinted as functions/_today.js tddb's is (td_meta 'times_fp'), so a
// change to it is run once more everywhere.
// (Made by B0, the table and the reads in full; then batch CS's, which writes addTime and promoteTime; the names and
// arguments stay.)
import { HttpError } from "./_http.js";
import { zoneOk } from "../pigeon/cards.js";

export const TIME_KINDS = ["call", "meet"];
// a 'yes' row's kept this long past its end
export const TIME_KEEP = 12 * 3600e3;
// a time starts on a quarter hour and lasts this long; an invite offers this many other times at most; an account has
// this many invites waiting for an answer (pending), and this many rows still to come or kept, at most
const MIN = 60e3, QUARTER = 15 * MIN;
export const TIME_SHORTEST = 15 * MIN, TIME_LONGEST = 240 * MIN, TIME_OPTS = 3, TIMES_PENDING_MAX = 20, TIMES_MAX = 200;

let ready = null;
async function timesDb(env) {
  if (!env.DB) throw new HttpError(503, "Not set up.");
  if (!ready) ready = (async () => {
    if ((await env.DB.prepare("SELECT v FROM td_meta WHERE k = 'times_fp'").first().catch(() => null))?.v === TIMES_FP) return;
    await setup(env);
    await env.DB.prepare("INSERT OR REPLACE INTO td_meta (k, v) VALUES ('times_fp', ?)").bind(TIMES_FP).run();
  })().catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}
// (td_meta is Today's, made here too where this comes first. id: the invite letter's UUID; kind: call | meet; who: the
// friend's first name; role: asked | answered; state: pending | yes; opts: JSON [[start, stop], …], at most 3, pending
// only; until: stop + 12 hours, a pending row's its last offered stop)
async function setup(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS td_meta (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS td_times (user_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL,
      tz TEXT NOT NULL, with_id TEXT NOT NULL, who TEXT NOT NULL, role TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'yes', opts TEXT,
      made INTEGER NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (user_id, id))`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS td_times_until ON td_times (until)"),
  ]);
}
const fingerprint = (text) => { let h = 2166136261; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return "m" + h.toString(36); };
const TIMES_FP = fingerprint(setup.toString());

const COLS = "id, kind, start, stop, tz, with_id, who, role";
export const timeView = (r) => ({ id: r.id, kind: r.kind, start: r.start, stop: r.stop, tz: r.tz, withId: r.with_id, who: r.who, role: r.role });
const at = (v, or) => (Number.isFinite(v) ? Math.round(v) : or);

// (the time, passed in by the route)
const need = (t, what) => { if (!Number.isFinite(t)) throw new TypeError(`${what}: pass { t }, the route's time`); return t; };
export async function timesFor(env, userId, from, to, { t } = {}) {
  const { results } = await (await timesForQ(env, userId, from, to, { t })).all();
  return (results || []).map(timeView);
}
export async function timesForQ(env, userId, from, to, { t } = {}) {
  need(t, "timesFor");
  const D = await timesDb(env);
  return D.prepare(`SELECT ${COLS} FROM td_times WHERE user_id = ? AND state = 'yes' AND until > ? AND stop > ? AND start < ? ORDER BY start, id LIMIT 100`)
    .bind(userId, t, at(from, 0), at(to, Number.MAX_SAFE_INTEGER));
}
export async function timesAround(env, userId, t, ms) {
  const now = Math.round(need(t, "timesAround")), w = Math.max(0, at(ms, 0));
  return timesFor(env, userId, now - w, now + w, { t: now });
}
export async function timesExport(env, userId) {
  const D = await timesDb(env);
  const { results } = await D.prepare("SELECT kind, start, stop, tz, who, role, state FROM td_times WHERE user_id = ? ORDER BY start, id").bind(userId).all();
  return (results || []).map((r) => ({ kind: r.kind, start: r.start, stop: r.stop, tz: r.tz, who: r.who, role: r.role, state: r.state }));
}
export async function dropTimes(env, userId) {
  if (!env.DB) return;
  await env.DB.prepare("DELETE FROM td_times WHERE user_id = ?").bind(userId).run().catch(() => {});
}

// (a time as an invite has it: a whole millisecond count on a quarter hour, 15 minutes to 4 hours long → [start, stop],
// or null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function spanOf(start, stop) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(stop) || start % QUARTER || stop % MIN) return null;
  const len = stop - start;
  return len >= TIME_SHORTEST && len <= TIME_LONGEST ? [start, stop] : null;
}
// (an invite's other times: [[start, stop], …] (or { start, stop | end } each), at most 3, each checked as the main time
// is, those already past left out → [[start, stop], …], or null where one isn't a time)
function optsOf(opts, t) {
  if (opts == null) return [];
  if (!Array.isArray(opts) || opts.length > TIME_OPTS) return null;
  const out = [];
  for (const x of opts) {
    const [s, e] = Array.isArray(x) ? x : x && typeof x === "object" ? [x.start, x.stop ?? x.end] : [];
    const w = spanOf(s, e);
    if (!w) return null;
    if (w[1] > t && !out.some((o) => o[0] === w[0] && o[1] === w[1])) out.push(w);
  }
  return out;
}
// (the time given, s to e (SQL), as td_times' row offered it: its own time or one of its other times, opts)
const offered = (s, e) => `((td_times.start = ${s} AND td_times.stop = ${e}) OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(td_times.opts) THEN td_times.opts ELSE '[]' END) j
        WHERE json_extract(j.value, '$[0]') = ${s} AND json_extract(j.value, '$[1]') = ${e}))`;
const text = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, n);

export async function addTime(env, u, row, { t } = {}) {
  need(t, "addTime");
  const r = row && typeof row === "object" ? row : {}, userId = u?.id;
  const id = typeof r.id === "string" && UUID.test(r.id) ? r.id.toLowerCase() : "", kind = TIME_KINDS.includes(r.kind) ? r.kind : null;
  const span = spanOf(r.start, r.stop), role = ["asked", "answered"].includes(r.role) ? r.role : null, pending = r.state === "pending";
  const withId = typeof r.withId === "string" && r.withId && r.withId.length <= 64 ? r.withId : null, who = text(r.who, 40);
  const opts = pending ? optsOf(r.opts, t) : [];
  if (typeof userId !== "string" || !userId || !id || !kind || !span || !zoneOk(r.tz) || !role || !withId || withId === userId || !who || !opts
    || (r.state != null && !pending) || (pending && role !== "asked")) throw new HttpError(400, "Bad request.");
  const [start, stop] = span;
  // (a pending invite lasts until the last time it offered ends; a 'yes' one, kept 12 hours past its end, must be to come)
  const until = pending ? Math.max(stop, ...opts.map((o) => o[1])) : stop + TIME_KEEP;
  if (pending ? until <= t : start <= t) throw new HttpError(409, "That time has passed.");
  const D = await timesDb(env), state = pending ? "pending" : "yes";
  const room = `(SELECT COUNT(*) FROM td_times WHERE user_id = ?1 AND until > ?12) < ${TIMES_MAX}`
    + (pending ? ` AND (SELECT COUNT(*) FROM td_times WHERE user_id = ?1 AND state = 'pending' AND until > ?12) < ${TIMES_PENDING_MAX}` : "");
  // (asked without state, the inviter's backstop: its own pending row for that friend made 'yes', but only at a time it
  // offered and of the same kind (as the friend's Yes is held to), one 'yes' already left)
  const backstop = role === "asked" && !pending;
  const write = D.prepare(`INSERT INTO td_times (user_id, id, kind, start, stop, tz, with_id, who, role, state, opts, made, until)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13 WHERE ${room}
      ON CONFLICT (user_id, id) DO ${backstop ? `UPDATE SET state = 'yes', start = excluded.start, stop = excluded.stop, tz = excluded.tz, opts = NULL, until = excluded.until
        WHERE td_times.state = 'pending' AND td_times.with_id = excluded.with_id AND td_times.kind = excluded.kind AND ${offered("excluded.start", "excluded.stop")}` : "NOTHING"}`)
    .bind(userId, id, kind, start, stop, r.tz, withId, who, role, state, pending && opts.length ? JSON.stringify(opts) : null, t, until);
  // (the friend's Yes, then: in the same batch, the inviter's pending row made 'yes'. And a pending row coming after the
  // friend's Yes did (the inviter's phone offline as the invite went): made 'yes' at once from their answered row for this
  // invite, at the time they chose, where it's one this offered and of the same kind; never once that time's begun)
  const promote = role === "answered" ? await promoteTimeQ(env, withId, id, userId, start, stop, { t, kind })
    : pending ? D.prepare(`WITH a AS (SELECT x.start, x.stop FROM td_times x WHERE x.user_id = ?2 AND x.id = ?3 AND x.with_id = ?1 AND x.kind = ?4
          AND x.role = 'answered' AND x.state = 'yes' AND x.start > ?5)
        UPDATE td_times SET state = 'yes', start = (SELECT start FROM a), stop = (SELECT stop FROM a), until = (SELECT stop FROM a) + ${TIME_KEEP}, opts = NULL
        WHERE user_id = ?1 AND id = ?3 AND state = 'pending' AND with_id = ?2 AND kind = ?4 AND until > ?5
          AND EXISTS (SELECT 1 FROM a WHERE ${offered("a.start", "a.stop")})`).bind(userId, withId, id, kind, t)
    : null;
  const [, w, p] = await D.batch([D.prepare("DELETE FROM td_times WHERE until < ?").bind(t), write, ...(promote ? [promote] : [])]);
  const promoted = !!p?.meta?.changes;
  if (w?.meta?.changes) return { promoted };
  // (nothing written: the same id already there (one answered, or a 'yes', stays as it is), or no room for another)
  if (await D.prepare("SELECT 1 FROM td_times WHERE user_id = ? AND id = ?").bind(userId, id).first()) return { promoted };
  throw new HttpError(409, pending ? "Chat has 20 invites waiting for an answer already." : "Chat is keeping as many times as it can already.");
}
export async function promoteTime(env, inviterId, id, answererId, start, stop, { t, kind } = {}) {
  const q = await promoteTimeQ(env, inviterId, id, answererId, start, stop, { t, kind });
  return !!(q && (await q.run()).meta?.changes);
}
// (null on input that can't be a promotion: nothing to run)
export async function promoteTimeQ(env, inviterId, id, answererId, start, stop, { t, kind } = {}) {
  need(t, "promoteTime");
  const key = typeof id === "string" && UUID.test(id) ? id.toLowerCase() : "";
  if (!key || typeof inviterId !== "string" || !inviterId || typeof answererId !== "string" || !answererId || inviterId === answererId
    || !spanOf(start, stop) || (kind != null && !TIME_KINDS.includes(kind))) return null;
  const D = await timesDb(env);
  return D.prepare(`UPDATE td_times SET state = 'yes', start = ?4, stop = ?5, until = ?6, opts = NULL
    WHERE user_id = ?1 AND id = ?2 AND state = 'pending' AND with_id = ?3 AND until > ?7 AND ?4 > ?7${kind != null ? " AND kind = ?8" : ""}
      AND ${offered("?4", "?5")}`)
    .bind(inviterId, key, answererId, start, stop, stop + TIME_KEEP, t, ...(kind != null ? [kind] : []));
}
