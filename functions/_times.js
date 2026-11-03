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
//   addTime(env, u, row) → the caller's own row written ('pending' or 'yes')                (POST time-offer, batch CS)
//   promoteTime(env, inviterId, id, answererId, start, stop) → the inviter's pending row made 'yes' at the chosen time,
//     only for that friend and only at a time the invite offered
// The table is made on first use, its setup fingerprinted as functions/_today.js tddb's is (td_meta 'times_fp'), so a
// change to it is run once more everywhere.
// (Made by B0, the table and the reads in full; then batch CS's, which writes addTime and promoteTime; the names and
// arguments stay.)
import { HttpError } from "./_http.js";

export const TIME_KINDS = ["call", "meet"];
// a 'yes' row's kept this long past its end
export const TIME_KEEP = 12 * 3600e3;

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
const viewOf = (r) => ({ id: r.id, kind: r.kind, start: r.start, stop: r.stop, tz: r.tz, withId: r.with_id, who: r.who, role: r.role });
const at = (v, or) => (Number.isFinite(v) ? Math.round(v) : or);

// (the time, passed in by the route)
const need = (t, what) => { if (!Number.isFinite(t)) throw new TypeError(`${what}: pass { t }, the route's time`); return t; };
export async function timesFor(env, userId, from, to, { t } = {}) {
  need(t, "timesFor");
  const D = await timesDb(env);
  const { results } = await D.prepare(`SELECT ${COLS} FROM td_times WHERE user_id = ? AND state = 'yes' AND until > ? AND stop > ? AND start < ? ORDER BY start, id LIMIT 100`)
    .bind(userId, t, at(from, 0), at(to, Number.MAX_SAFE_INTEGER)).all();
  return (results || []).map(viewOf);
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

export async function addTime(env, u, row) {
  throw new HttpError(501, "Not built yet.");
}
export async function promoteTime(env, inviterId, id, answererId, start, stop) {
  throw new HttpError(501, "Not built yet.");
}
