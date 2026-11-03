// A planned ride's time of day (Today First, spec §5.1, §5.2): fx_times, kept outside fx_state, so an older Fitness
// saving its record whole loses nothing. Every row is one a person chose: Ride At in Fitness (set), Ride Then on Today
// (today), or one of those moved by Today's clash rule (moved). Nothing writes a row here without a tap, so every
// fx_times row counts as an explicit ride. And the one place that says what an explicit ride is: every fx_times row,
// and an fx_offers row with state 'yes' that a person's tap put there (Fitness's Add on an asked or answered offer, or
// Today's Take or Keep on one of its own, taken = 1). An agreed plan still 'new' is a known ride, not an explicit one.
//   timeFor(env, userId, day) → { day, start, stop, tz, sport, source } or null
//   timesOf(env, userId, fromDay, toDay) → [{ day, start, stop, tz, sport, source }], each day from fromDay to toDay
//     (both kept), in order
//   setTime(env, userId, { day, start, stop, tz, sport = "ride", source }, { t, expect } = {}) → the row as kept (one a
//     day: a second for the same day replaces it). Checked: day a real "YYYY-MM-DD", the day start falls on in tz (a
//     zone the clocks know); source set, today or moved; sport a word; start on the five minutes; 15 minutes to 6 hours
//     long. Each write first drops the account's rows that ended over 8 days ago. { t } is needed (the route's time).
//     With expect ({ start, stop, source }: Undo putting a moved ride back), only the day's row that's still just that
//     is changed, and none is made: → the row, or null where it's been changed since (or isn't there)
//   setTimeQ(env, userId, row, { t, expect }) → the same write as one statement, for the caller's own D.batch (Undo puts
//     the ride back and its act's row in one); the old rows' tidy-up is setTime's alone
//   dropTime(env, userId, day, { expect } = {}) → whether a row went; with expect ({ start, stop, source }: Undo of Ride
//     Then), only while the day's row is still just that
//   dropTimeQ(env, userId, day, { expect }) → the same as one statement, for the caller's own D.batch
//   timesReady(env) → the database, fx_times made in it (for a caller reading it with its own SQL)
//   EXPLICIT_OFFER: the SQL condition for an explicit offer, written against the alias o
//   explicitRide(row) → whether an fx_times row (the one with source) or an fx_offers row is an explicit ride
// (Made by B0, then batch F's, which adds timesExport and dropTimes; the names and arguments stay.)
import { HttpError } from "./_http.js";
import { tablesOnce } from "./_fitness.js";
import { zoneOk } from "../pigeon/cards.js";

export const EXPLICIT_OFFER = "o.state = 'yes' AND (o.role IN ('asked','answered') OR o.taken = 1)";
export const explicitRide = (r) => r.source != null || (r.state === "yes" && (r.role === "asked" || r.role === "answered" || Number(r.taken) === 1));

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// a row's kept this long past its end; a ride this long at the least and the most
const KEEP = 8 * DAY, SHORTEST = 15 * MIN, LONGEST = 6 * HOUR;
export const TIME_SOURCES = ["set", "today", "moved"];
const SPORT = /^[a-z]{2,16}$/;

async function makeTimes(D) {
  await D.batch([
    // (day: YYYY-MM-DD in tz; source: set | today | moved)
    D.prepare(`CREATE TABLE IF NOT EXISTS fx_times (user_id TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL,
      sport TEXT NOT NULL DEFAULT 'ride', source TEXT NOT NULL, made INTEGER NOT NULL, PRIMARY KEY (user_id, day))`),
    D.prepare("CREATE INDEX IF NOT EXISTS fx_times_start ON fx_times (start)"),
  ]);
}
const timesDb = (env) => tablesOnce(env, "times", makeTimes);

// ---- days ----
const DAYKEY = /^\d{4}-\d\d-\d\d$/;
const dayOk = (s) => { if (typeof s !== "string" || !DAYKEY.test(s)) return false; const [y, m, d] = s.split("-").map(Number), x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d && y >= 2020 && y <= 2100; };
const DAYS = new Map();
const dayIn = (tz, t) => (DAYS.get(tz) || DAYS.set(tz, new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })).get(tz)).format(new Date(t));

const COLS = "day, start, stop, tz, sport, source";
const rowOf = (r) => ({ day: r.day, start: r.start, stop: r.stop, tz: r.tz, sport: r.sport, source: r.source });

export async function timeFor(env, userId, day) {
  if (!dayOk(day)) return null;
  const D = await timesDb(env), r = await D.prepare(`SELECT ${COLS} FROM fx_times WHERE user_id = ? AND day = ?`).bind(userId, day).first();
  return r ? rowOf(r) : null;
}
export async function timesOf(env, userId, fromDay, toDay) {
  if (!dayOk(fromDay) || !dayOk(toDay) || fromDay > toDay) return [];
  const D = await timesDb(env);
  const { results } = await D.prepare(`SELECT ${COLS} FROM fx_times WHERE user_id = ? AND day >= ? AND day <= ? ORDER BY day LIMIT 400`).bind(userId, fromDay, toDay).all();
  return (results || []).map(rowOf);
}
// (Undo's check: { start, stop, source }, all three, or none)
function expectOf(expect) {
  if (expect == null) return null;
  const ex = { start: expect.start, stop: expect.stop, source: expect.source };
  if (!Number.isSafeInteger(ex.start) || !Number.isSafeInteger(ex.stop) || !TIME_SOURCES.includes(ex.source)) throw new HttpError(400, "Bad request.");
  return ex;
}
// (the time, passed in by the route: never the clock read down here)
const need = (t, what) => { if (!Number.isFinite(t)) throw new TypeError(`${what}: pass { t }, the route's time`); return t; };
function timeRow(row) {
  const r = row && typeof row === "object" ? row : {}, sport = r.sport ?? "ride";
  const { day, start, stop, tz, source } = r;
  if (!dayOk(day) || !zoneOk(tz) || !TIME_SOURCES.includes(source) || typeof sport !== "string" || !SPORT.test(sport)
    || !Number.isSafeInteger(start) || !Number.isSafeInteger(stop) || start % (5 * MIN) || stop - start < SHORTEST || stop - start > LONGEST
    || dayIn(tz, start) !== day) throw new HttpError(400, "Choose a time.");
  return { day, start, stop, tz, sport, source };
}
const writeQ = (D, userId, x, t, ex) => (ex
  ? D.prepare("UPDATE fx_times SET start = ?3, stop = ?4, tz = ?5, sport = ?6, source = ?7, made = ?8 WHERE user_id = ?1 AND day = ?2 AND start = ?9 AND stop = ?10 AND source = ?11")
    .bind(userId, x.day, x.start, x.stop, x.tz, x.sport, x.source, t, ex.start, ex.stop, ex.source)
  : D.prepare(`INSERT INTO fx_times (user_id, day, start, stop, tz, sport, source, made) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(user_id, day) DO UPDATE SET start = ?3, stop = ?4, tz = ?5, sport = ?6, source = ?7, made = ?8`).bind(userId, x.day, x.start, x.stop, x.tz, x.sport, x.source, t));
export async function setTime(env, userId, row, { t, expect } = {}) {
  need(t, "setTime");
  const x = timeRow(row), ex = expectOf(expect), D = await timesDb(env);
  const [, w] = await D.batch([D.prepare("DELETE FROM fx_times WHERE user_id = ? AND stop < ?").bind(userId, t - KEEP), writeQ(D, userId, x, t, ex)]);
  return ex && !w?.meta?.changes ? null : x;
}
export async function setTimeQ(env, userId, row, { t, expect } = {}) {
  need(t, "setTime");
  const x = timeRow(row), ex = expectOf(expect), D = await timesDb(env);
  return writeQ(D, userId, x, t, ex);
}
const dropQ = (D, userId, day, ex) => D.prepare(`DELETE FROM fx_times WHERE user_id = ? AND day = ?${ex ? " AND start = ? AND stop = ? AND source = ?" : ""}`)
  .bind(userId, day, ...(ex ? [ex.start, ex.stop, ex.source] : []));
export async function dropTime(env, userId, day, { expect } = {}) {
  const ex = expectOf(expect);
  if (!dayOk(day)) return false;
  const D = await timesDb(env);
  return !!(await dropQ(D, userId, day, ex).run()).meta?.changes;
}
export async function dropTimeQ(env, userId, day, { expect } = {}) {
  const ex = expectOf(expect);
  if (!dayOk(day)) throw new HttpError(400, "Bad request.");
  return dropQ(await timesDb(env), userId, day, ex);
}
export const timesReady = (env) => timesDb(env);
