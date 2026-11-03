// What Today does for you, with Undo, and the rules it does it by (Today First, spec §7.5). Each rule has a level on
// the account (td_rules: do, suggest or quiet) and a record; every act is a td_acts row kept for Undo; the day's plan
// runs once per account and local day (td_plans, claimed first with INSERT OR IGNORE, so the morning's tick and a page
// read never both act). The rules in milestone 1: moveRide (a clash moved), addRide (a habit ride added, holding nothing
// until a tap keeps it), holdRide (functions/_busy.js), and rideThen (an offer, not a rule). Writes never touch
// fx_state: a move changes fx_times or an offer's times, an add is an fx_offers row (functions/_fitshare.js).
//   planDay(env, u, t, deps = {}) → { acts }: claims the day, tallies, then the clash, Ride Then and the habit (deps:
//     stand-ins for pastWet, hoursAt and bestWindow, for tests)
//   actTake(env, u, { id }, { t }) → { act, rule: { rule, level, line } }       (POST today/act: Take, or Keep)
//   actUndo(env, u, { id }, { t }) → { act, rule, said }                         (POST today/act/undo; restores only
//     what's unchanged since, in one guarded batch, else says "You’ve changed it since, so nothing was undone.")
//   rulesGet(env, u, { t }) → { rules: [{ rule, name, level, setBy, record, line, soon? }] }   (GET today/rules)
//   rulesPut(env, u, { rule, level }, { t }) → { rule, level, setBy: "you", line }            (PUT today/rules)
//   actsFor(env, userId, day) → the day's acts: [{ id, rule, kind, state, level, said, undoUntil, target, was, now, day }]
//     (those planned that day, and a ride Today added for that day on an earlier one, so its day can Keep it)
//   planned(env, userId, day) → whether the day's plan has run (its td_plans row)
//   ruleLevel(env, userId, rule) → "do" | "suggest" | "quiet" (no row, or no table yet: "do")
//   levelOf(rec, t, { undo }) → { level, changed }: a rule's level from its record (below); clashOf(ride, timed) → the
//     first timed thing a ride runs into, or null; habitRide(env, u, t, tz, deps) → the habit ride to add, or null;
//     pushLine(act, { names, tz, today }) → what the morning notification says of an act, or null
// Every act and rule is the account's own; another account's is never found (404).
// The tables are functions/_today.js's (td_acts, td_plans, td_rules, made in its setup).
//
// An act's state: done (Today did it, at do: Undo until undo_until), offered (a button, at suggest, until undo_until),
// taken (an offer tapped), kept (Keep tapped on an added ride, or a done or taken act past undo_until), undone, ignored
// (offered and left past undo_until), or said: a line only, no button (a clash at quiet, an agreed ride with a friend,
// which is never moved, or no clear time to move a ride to: level "none"). Its target says what it's about
// ("time:<day>": the day's fx_times row; "offer:<id>": an fx_offers row; "day:<day>": the day a ride from habit is
// added to), and was and now (JSON) what that was before and after: a time row { day, start, stop, tz, sport, source },
// an offer { offer, day, start, stop, state }, a ride added { offer, day, start, stop, state, secs, k, n } with was
// { planned: "rest" | "none" }; a move's now has why: { kind, who, start }, what it cleared.
import { HttpError } from "./_http.js";
import { tddb, todayPrefs, morningTz } from "./_today.js";
import { timeFor, setTimeQ, dropTimeQ, explicitRide } from "./_fittimes.js";
import { offersFor, addTodayOffer, setOfferTimesQ, takeOffer, answerOffer, answerOfferQ } from "./_fitshare.js";
import { timesFor } from "./_times.js";
import { pastWet as realPastWet, hoursAt as realHoursAt } from "./_fitwx.js";
import { snapshotOf } from "./_fittoday.js";
import { kept as weatherKept } from "./_wxacct.js";
import { fitdb } from "./_fitness.js";
import { bestWindow as realBestWindow, isWet, LIMITS } from "../fitness/besttime.js";
import { workoutById } from "../fitness/workouts.js";

export const LEVELS = ["do", "suggest", "quiet"];
// the rules You shows, in its order, with their names; the last two come in later milestones
export const RULE_NAMES = { moveRide: "Move a ride around a clash", addRide: "Add a ride from habit", holdRide: "Hold messages while you ride",
  later: "Deliver when a friend is free", arrange: "Arrange group rides" };
const OWN = ["moveRide", "addRide", "holdRide"], SOON = ["later", "arrange"];
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY, MONTH = 30 * DAY;
// (acts are kept this long, for Undo and for a rule going quiet: its record is counts, on td_rules)
const KEEP_ACTS = 60 * DAY;
// (a ride's acted on only when it starts at least this far off; a clash is a timed thing within this of a ride)
const AHEAD = HOUR, NEAR = 15 * MIN;
const DAYKEY = /^\d{4}-\d\d-\d\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const parsed = (s) => { if (s == null) return null; try { return JSON.parse(s); } catch (_) { return null; } };
// (the moment, passed in by the route or the tick: never the clock read down here)
const need = (t, what) => { if (!Number.isFinite(t)) throw new TypeError(`${what}: pass { t }, the route's time`); return t; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// ---- time where the account is ----
const FMT = new Map();
const fmt = (tz) => FMT.get(tz) || FMT.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })).get(tz);
const zoneOk = (tz) => { if (typeof tz !== "string" || !tz || tz.length > 64) return false; try { fmt(tz); return true; } catch (_) { return false; } };
const zoneOf = (tz) => (zoneOk(tz) ? tz : "Europe/London");
const partsAt = (tz, t) => Object.fromEntries(fmt(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
const dayIn = (tz, t) => { const p = partsAt(tz, t); return `${p.year}-${p.month}-${p.day}`; };
const minsIn = (tz, t) => { const p = partsAt(tz, t); return Number(p.hour) * 60 + Number(p.minute); };
const offsetAt = (tz, t) => { const p = partsAt(tz, t); return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000; };
// (a wall time there, mins after the day's midnight → ms; a minute the clocks jump past is the moment as far on)
function wallAt(tz, day, mins) {
  const [y, m, d] = day.split("-").map(Number), wall = Date.UTC(y, m - 1, d) + mins * MIN;
  return wall - offsetAt(tz, wall - offsetAt(tz, wall));
}
const dayAfter = (day, n = 1) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekdayNo = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const spanOf = (tz, day) => ({ start: wallAt(tz, day, 0), end: wallAt(tz, dayAfter(day), 0) });
const hhmm = (tz, t) => { const p = partsAt(zoneOf(tz), t); return `${p.hour}:${p.minute}`; };
const NUMBERS = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
const lower = (s) => s.toLowerCase();

// ---- levels and records ----
// A rule's level from its record (after the month demo): rec is its td_rules row ({ level, set_by, level_at,
// kept_since }), with, for a rule at suggest, lastTake (when a suggestion of it was last taken) and ignoredSince (its
// suggestions left untaken since then, or since the level last changed, whichever's later).
// - An Undo drops it one level at once ({ undo: true }), even a level set by hand.
// - Ten acts kept since the level last changed, and at least 7 days since it, climb one level.
// - A suggestion offered and left untaken for 30 days goes quiet.
// - Nothing climbs or goes quiet more than once in 7 days; a level set by hand isn't, for 30 days.
// → { level, changed }
export function levelOf(rec, t, { undo = false } = {}) {
  const level = LEVELS.includes(rec?.level) ? rec.level : "do", i = LEVELS.indexOf(level), stay = { level, changed: false };
  if (undo) return i < 2 ? { level: LEVELS[i + 1], changed: true } : stay;
  const at = Number(rec?.level_at) || 0, byYou = rec?.set_by === "you";
  if (t - at < WEEK || (byYou && t - at < MONTH)) return stay;
  if (i > 0 && (Number(rec?.kept_since) || 0) >= 10) return { level: LEVELS[i - 1], changed: true };
  if (level === "suggest" && (Number(rec?.ignoredSince) || 0) > 0 && t - Math.max(at, Number(rec?.lastTake) || 0) >= MONTH) return { level: "quiet", changed: true };
  return stay;
}
// The habit's strength caps addRide's level: rides on 6 of 8 dry weeks may act, 4 of 8 only suggest, fewer do nothing.
// strength: out of 8 → "do" | "suggest" | null
export const capOf = (strength) => (strength >= 6 ? "do" : strength >= 4 ? "suggest" : null);
// a level held to a cap (the lower of the two), or null where the cap is nothing
export const cappedLevel = (level, cap) => (cap ? LEVELS[Math.max(LEVELS.indexOf(LEVELS.includes(level) ? level : "do"), LEVELS.indexOf(cap))] : null);
// The record's words: "Moved 3 · kept 3", "Added 2 · kept 2 · undone 1", "Held 14"
const VERBS = { moveRide: "Moved", addRide: "Added" };
export function recordLine(rule, r = {}) {
  if (SOON.includes(rule)) return "Coming in a later version";
  if (rule === "holdRide") return `Held ${r.held || 0}`;
  return [`${VERBS[rule] || "Done"} ${r.done || 0}`, `kept ${r.kept || 0}`, r.undone ? `undone ${r.undone}` : null].filter(Boolean).join(" · ");
}
// what an Undo says when it drops a rule to a level
const DROPPED = {
  moveRide: { suggest: "Moves are suggested now, not made", quiet: "Clashes are only mentioned now" },
  addRide: { suggest: "Rides are suggested now, not added", quiet: "Rides from habit aren’t suggested now" },
};
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ruleRow = (rule, r) => ({ rule, level: LEVELS.includes(r?.level) ? r.level : "do", set_by: r?.set_by === "you" ? "you" : "auto", done: n0(r?.done), kept: n0(r?.kept),
  undone: n0(r?.undone), ignored: n0(r?.ignored), held: n0(r?.held), kept_since: n0(r?.kept_since), level_at: n0(r?.level_at) });
async function rulesOf(D, uid) {
  const { results } = await D.prepare("SELECT rule, level, set_by, done, kept, undone, ignored, held, kept_since, level_at FROM td_rules WHERE user_id = ?").bind(uid).all();
  const have = new Map((results || []).map((r) => [r.rule, r]));
  return new Map([...OWN, ...SOON].map((rule) => [rule, ruleRow(rule, have.get(rule))]));
}
const ruleView = (r) => ({ rule: r.rule, level: r.level, line: recordLine(r.rule, r) });

export async function rulesGet(env, u, { t } = {}) {
  need(t, "rulesGet");
  const D = await tddb(env), have = await rulesOf(D, u.id);
  return { rules: [...OWN, ...SOON].map((rule) => {
    const r = have.get(rule), soon = SOON.includes(rule);
    return { rule, name: RULE_NAMES[rule], level: soon ? "do" : r.level, setBy: soon ? "auto" : r.set_by,
      record: { done: r.done, kept: r.kept, undone: r.undone, ignored: r.ignored, held: r.held }, line: recordLine(rule, r), ...(soon ? { soon: true } : {}) };
  }) };
}
// A level set by hand in You: held for 30 days from automatic changes (an Undo still drops it); its kept count starts again
export async function rulesPut(env, u, b, { t } = {}) {
  need(t, "rulesPut");
  const rule = b?.rule, level = b?.level;
  if (SOON.includes(rule)) throw new HttpError(400, "That rule comes in a later version.");
  if (!OWN.includes(rule) || !LEVELS.includes(level)) throw new HttpError(400, "Choose Do, Suggest or Quiet.");
  const D = await tddb(env);
  await D.prepare(`INSERT INTO td_rules (user_id, rule, level, set_by, level_at) VALUES (?1, ?2, ?3, 'you', ?4)
    ON CONFLICT(user_id, rule) DO UPDATE SET level = ?3, set_by = 'you', level_at = ?4, kept_since = 0`).bind(u.id, rule, level, t).run();
  const r = (await rulesOf(D, u.id)).get(rule);
  return { rule, level: r.level, setBy: "you", line: recordLine(rule, r) };
}

// ---- acts ----
const ACT_COLS = "id, rule, day, kind, state, level, said, undo_until, target, was, now";
const actOf = (r) => ({ id: r.id, rule: r.rule, kind: r.kind, state: r.state, level: r.level, said: r.said, undoUntil: r.undo_until,
  target: r.target, was: parsed(r.was), now: parsed(r.now), day: r.day });
export async function actsFor(env, userId, day) {
  if (typeof day !== "string" || !DAYKEY.test(day)) return [];
  const D = await tddb(env);
  // (those of one plan in the order it made them: the clash, Ride Then, the habit)
  const { results } = await D.prepare(`SELECT ${ACT_COLS} FROM td_acts WHERE user_id = ?1 AND (day = ?2 OR (rule = 'addRide' AND target = ?3))
    ORDER BY made, CASE rule WHEN 'moveRide' THEN 0 WHEN 'rideThen' THEN 1 WHEN 'addRide' THEN 2 ELSE 3 END, id`)
    .bind(userId, day, `day:${day}`).all();
  return (results || []).map(actOf);
}
export async function planned(env, userId, day) {
  if (typeof day !== "string" || !DAYKEY.test(day)) return false;
  const D = await tddb(env);
  return !!(await D.prepare("SELECT 1 AS ok FROM td_plans WHERE user_id = ? AND day = ?").bind(userId, day).first());
}
export async function ruleLevel(env, userId, rule) {
  try {
    const D = await tddb(env), r = await D.prepare("SELECT level FROM td_rules WHERE user_id = ? AND rule = ?").bind(userId, String(rule ?? "")).first();
    return LEVELS.includes(r?.level) ? r.level : "do";
  } catch (_) { return "do"; }
}
// (what the target is now, as SQL, for the guarded writes: an fx_times row or an offer just as an act left it; ?n on)
function targetIs(uid, x, n) {
  if (x?.offer) return { sql: `EXISTS (SELECT 1 FROM fx_offers WHERE user_id = ?${n} AND id = ?${n + 1} AND start = ?${n + 2} AND stop = ?${n + 3} AND state = ?${n + 4})`,
    args: [uid, x.offer, x.start, x.stop, x.state] };
  if (x?.source) return { sql: `EXISTS (SELECT 1 FROM fx_times WHERE user_id = ?${n} AND day = ?${n + 1} AND start = ?${n + 2} AND stop = ?${n + 3} AND source = ?${n + 4})`,
    args: [uid, x.day, x.start, x.stop, x.source] };
  return null;
}
// (a new act's row, made only where cond holds (the write before it in the batch done), and never a second for the same
// rule, day and target)
function actInsert(D, a, cond = null) {
  const c = cond ? { ...cond } : null;
  return D.prepare(`INSERT OR IGNORE INTO td_acts (id, user_id, rule, day, target, kind, state, level, was, now, said, made, undo_until)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13${c ? ` WHERE ${c.sql}` : ""}`)
    .bind(a.id, a.uid, a.rule, a.day, a.target, a.kind, a.state, a.level, a.was == null ? null : JSON.stringify(a.was), a.now == null ? null : JSON.stringify(a.now),
      String(a.said || "").slice(0, 300), a.made, a.undoUntil, ...(c ? c.args : []));
}
const timeRowOf = (x) => ({ day: x.day, start: x.start, stop: x.stop, tz: x.tz, sport: x.sport || "ride", source: x.source });

// ---- the plan for a day ----
// (what a step needs, each read once: the account's offers (Today's own too), its Weather place and that place's week,
// Fitness's days)
function contextFor(env, u, t, tz, day, deps, D) {
  const memo = new Map(), once = (k, f) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };
  const ctx = { env, u, uid: u.id, t, tz, day, d: deps, D, acts: [] };
  ctx.offers = () => once("offers", () => offersFor(env, u.id, { today: true, t }));
  ctx.snap = () => once("snap", () => snapshotOf(env, u.id).catch(() => null));
  ctx.home = () => once("home", async () => {
    if (deps.home !== undefined) return deps.home;
    const p = (await weatherKept(env, u.id).catch(() => null))?.data?.places?.[0];
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon } : null;
  });
  ctx.wx = () => once("wx", async () => { const h = await ctx.home(); return h ? deps.hoursAt(env, h.lat, h.lon).catch(() => null) : null; });
  ctx.hh = (ms) => hhmm(tz, ms);
  return ctx;
}
const withDeps = (deps) => ({ pastWet: realPastWet, hoursAt: realHoursAt, bestWindow: realBestWindow, ...deps });

// The day's plan, for an account (u: { id, notify_prefs }), at t: claims the day first (another run that has it already
// leaves this one nothing to do), tallies what's kept and ignored, steps the rules' levels, then acts: the clash, Ride
// Then and the habit. Idempotent besides (an act a rule, day and target). One that fails part way gives the day back, so
// a later run (the next tick, the next read) does what's left. → { acts } (the acts made)
export async function planDay(env, u, t, deps = {}) {
  need(t, "planDay");
  const D = await tddb(env), row = await todayPrefs(env, u.id), tz = zoneOf(morningTz(u, row)), day = dayIn(tz, t);
  const claim = await D.prepare("INSERT OR IGNORE INTO td_plans (user_id, day, at) VALUES (?, ?, ?)").bind(u.id, day, t).run();
  if (!claim.meta?.changes) return { acts: [] };
  const ctx = contextFor(env, u, t, tz, day, withDeps(deps), D);
  try {
    await tally(ctx);
    await moveRides(ctx);
    await rideThen(ctx);
    await addRide(ctx);
    return { acts: ctx.acts };
  } catch (e) {
    await D.prepare("DELETE FROM td_plans WHERE user_id = ? AND day = ? AND at = ?").bind(u.id, day, t).run().catch(() => {});
    throw e;
  }
}

// A done or taken act past undo_until is kept (kept, and kept since the level's last change, counted); one offered and
// left past it is ignored (counted). Then each rule's level stepped, where its record says so. Acts older than 60 days go.
async function tally({ D, uid, t, day }) {
  const due = "a.user_id = td_rules.user_id AND a.rule = td_rules.rule AND a.undo_until <= ?2";
  await D.batch([
    D.prepare("INSERT OR IGNORE INTO td_rules (user_id, rule) VALUES (?1, 'moveRide'), (?1, 'addRide'), (?1, 'holdRide')").bind(uid),
    D.prepare(`UPDATE td_rules SET kept = kept + (SELECT COUNT(*) FROM td_acts a WHERE ${due} AND a.state IN ('done', 'taken')),
      kept_since = kept_since + (SELECT COUNT(*) FROM td_acts a WHERE ${due} AND a.state IN ('done', 'taken')),
      ignored = ignored + (SELECT COUNT(*) FROM td_acts a WHERE ${due} AND a.state = 'offered') WHERE user_id = ?1`).bind(uid, t),
    D.prepare("UPDATE td_acts SET state = CASE state WHEN 'offered' THEN 'ignored' ELSE 'kept' END WHERE user_id = ?1 AND state IN ('done', 'taken', 'offered') AND undo_until <= ?2").bind(uid, t),
    D.prepare("DELETE FROM td_acts WHERE user_id = ? AND made < ?").bind(uid, t - KEEP_ACTS),
    D.prepare("DELETE FROM td_plans WHERE user_id = ? AND day < ?").bind(uid, dayAfter(day, -60)),
  ]);
  const rules = await rulesOf(D, uid);
  for (const rule of ["moveRide", "addRide"]) {
    const r = { ...rules.get(rule) };
    // (whether its suggestions have gone untaken for a month: read only where it could)
    if (r.level === "suggest" && t - r.level_at >= MONTH) {
      const { results } = await D.prepare("SELECT state, made FROM td_acts WHERE user_id = ? AND rule = ? AND made >= ?").bind(uid, rule, r.level_at).all();
      r.lastTake = Math.max(0, ...(results || []).filter((x) => x.state === "taken" || x.state === "kept").map((x) => x.made));
      r.ignoredSince = (results || []).filter((x) => x.state === "ignored" && x.made > Math.max(r.level_at, r.lastTake)).length;
    }
    const next = levelOf(r, t);
    if (next.changed) await D.prepare("UPDATE td_rules SET level = ?, level_at = ?, kept_since = 0, set_by = 'auto' WHERE user_id = ? AND rule = ? AND level = ? AND level_at = ?")
      .bind(next.level, t, uid, rule, r.level, r.level_at).run();
  }
}
// (one act a rule, day and target; a ride from habit, one for its day whenever it was planned)
async function actExists(ctx, rule, target, { anyDay = false } = {}) {
  return !!(await ctx.D.prepare(`SELECT 1 AS ok FROM td_acts WHERE user_id = ? AND rule = ? AND target = ?${anyDay ? "" : " AND day = ?"}`)
    .bind(ctx.uid, rule, target, ...(anyDay ? [] : [ctx.day])).first());
}
async function sayOnly(ctx, a) {
  const act = { id: crypto.randomUUID(), uid: ctx.uid, day: ctx.day, made: ctx.t, undoUntil: ctx.t, state: "said", ...a };
  const r = await actInsert(ctx.D, act).run();
  if (r.meta?.changes) ctx.acts.push(act);
}

// ---- the clash (moveRide) ----
// The first timed thing (a call or meeting agreed in Chat, td_times; an agreed ride with a friend) a ride's window runs
// into, 15 minutes either side: ride { start, stop }, timed [{ start, stop, kind, who }] → the soonest such, or null
export function clashOf(ride, timed) {
  if (!ride || !Number.isFinite(ride.start) || !Number.isFinite(ride.stop)) return null;
  const s = ride.start - NEAR, e = ride.stop + NEAR;
  return (Array.isArray(timed) ? timed : []).filter((x) => x && Number.isFinite(x.start) && Number.isFinite(x.stop) && x.start < e && s < x.stop)
    .sort((a, b) => a.start - b.start)[0] || null;
}
// (what a ride runs into, in words: named, or by its time where the account's Chat doesn't name people)
function whatOf(x, names, hh) {
  const who = typeof x?.who === "string" ? x.who.trim() : "", named = names && who;
  if (x?.kind === "meet") return named ? `meeting ${who}` : `your ${hh(x.start)} meeting`;
  if (x?.kind === "ride") return named ? `your ride with ${who}` : `your ${hh(x.start)} ride with a friend`;
  return named ? `${who}’s call` : `your ${hh(x.start)} call`;
}
// An explicit own ride of today's (the day's fx_times row, or a kept ride of Today's own), starting at least an hour
// from now, that runs into a call, a meeting or an agreed ride: at do, moved to the best free time today (the same
// length; daylight; earlier preferred), with Undo; at suggest, offered; at quiet, the line alone. No clear time: said
// so, at no level. An agreed ride with a friend is never moved: the line alone.
async function moveRides(ctx) {
  const { env, uid, t, tz, day } = ctx, span = spanOf(tz, day), offers = await ctx.offers();
  const own = [], time = await timeFor(env, uid, day);
  if (time && time.start >= t + AHEAD) own.push({ kind: "time", start: time.start, stop: time.stop, sport: time.sport, was: timeRowOf(time), target: `time:${day}` });
  for (const o of offers) if (o.role === "today" && o.taken && o.state === "yes" && o.start >= span.start && o.start < span.end && o.start >= t + AHEAD)
    own.push({ kind: "offer", start: o.start, stop: o.stop, sport: o.sport, was: { offer: o.id, day, start: o.start, stop: o.stop, state: "yes" }, target: `offer:${o.id}` });
  const agreed = offers.filter((o) => (o.role === "asked" || o.role === "answered") && o.stop > span.start && o.start < span.end);
  if (!own.length && !agreed.length) return;
  const calls = (await timesFor(env, uid, span.start, span.end, { t })).map((c) => ({ kind: c.kind, start: c.start, stop: c.stop, who: c.who, id: `time:${c.id}` }));
  const timed = [...calls, ...agreed.map((o) => ({ kind: "ride", start: o.start, stop: o.stop, who: o.who, id: `offer:${o.id}` }))];
  if (!timed.length) return;
  let level = null;
  for (const ride of own.sort((a, b) => a.start - b.start)) {
    const clash = clashOf(ride, timed);
    if (!clash || await actExists(ctx, "moveRide", ride.target)) continue;
    level ??= await ruleLevel(env, uid, "moveRide");
    await moveOne(ctx, ride, clash, timed, own, level);
  }
  for (const o of agreed) {
    const clash = o.start >= t + AHEAD && clashOf(o, calls), target = `offer:${o.id}`;
    if (!clash || await actExists(ctx, "moveRide", target)) continue;
    await sayOnly(ctx, { rule: "moveRide", target, kind: "move", level: "none", was: null, now: { offer: o.id, day, start: o.start, stop: o.stop, state: o.state, why: { kind: clash.kind, who: clash.who || "", start: clash.start } },
      said: `Your ride with ${o.who} at ${ctx.hh(o.start)} runs into ${whatOf(clash, true, ctx.hh)} at ${ctx.hh(clash.start)}` });
  }
}
// The best free time today for a ride: clear of every timed thing by 15 minutes, of the day's other rides, and of the
// next hour → { start } | { none: true } (no clear time) | { unknown: true } (no place, or its weather not to be had)
async function freeTime(ctx, ride, timed, own) {
  const { t } = ctx, wx = await ctx.wx();
  if (!wx?.hours?.length) return { unknown: true };
  const avoid = [[t - DAY, t + AHEAD], ...timed.map((x) => [x.start - NEAR, x.stop + NEAR]), ...own.filter((o) => o !== ride).map((o) => [o.start, o.stop])];
  const len = ride.stop - ride.start;
  const w = ctx.d.bestWindow(wx, { secs: Math.round(len / 1000), now: t, sport: ride.sport === "run" ? "run" : "ride", avoid });
  const start = w?.start, tz = ride.was?.tz || ctx.tz;
  if (!Number.isFinite(start) || start < t + AHEAD || start % (5 * MIN) || dayIn(zoneOf(tz), start) !== ctx.day || clashOf({ start, stop: start + len }, timed)) return { none: true };
  return { start };
}
async function moveOne(ctx, ride, clash, timed, own, level) {
  const { env, D, uid, t, day } = ctx, hh = ctx.hh, why = { kind: clash.kind, who: clash.who || "", start: clash.start };
  const line = `Your ride at ${hh(ride.start)} runs into ${whatOf(clash, true, hh)} at ${hh(clash.start)}`;
  const base = { rule: "moveRide", target: ride.target, kind: "move", was: ride.was };
  if (level === "quiet") return sayOnly(ctx, { ...base, level: "quiet", now: { ...ride.was, why }, said: line });
  const free = await freeTime(ctx, ride, timed, own);
  if (!free.start) return sayOnly(ctx, { ...base, level: "none", now: { ...ride.was, why }, said: free.none ? `${line}, and there’s no clear time left today to move it to` : line });
  const start = free.start, stop = start + (ride.stop - ride.start);
  const now = ride.kind === "time" ? { ...ride.was, start, stop, source: "moved", why } : { ...ride.was, start, stop, why };
  const act = { ...base, id: crypto.randomUUID(), uid, day, now, made: t, undoUntil: Math.max(t + NEAR, Math.min(start, ride.start) - HOUR) };
  if (level === "suggest") {
    const r = await actInsert(D, { ...act, state: "offered", level, said: `${line}; ${hh(start)} is clear` }).run();
    if (r.meta?.changes) ctx.acts.push({ ...act, state: "offered", level });
    return;
  }
  // at do: the ride moved only while it's still as read, the act made only where it moved, the record with it
  const write = ride.kind === "time"
    ? await setTimeQ(env, uid, timeRowOf(now), { t, expect: { start: ride.was.start, stop: ride.was.stop, source: ride.was.source } })
    : await setOfferTimesQ(env, uid, ride.was.offer, start, stop, { t, expect: { start: ride.was.start, stop: ride.was.stop, state: "yes" } });
  const [, ins] = await D.batch([write, actInsert(D, { ...act, state: "done", level: "do", said: `Moved your ride to ${hh(start)}, clear of ${whatOf(clash, true, hh)}` }, targetIs(uid, now, 14)),
    D.prepare("UPDATE td_rules SET done = done + 1 WHERE user_id = ? AND rule = 'moveRide' AND EXISTS (SELECT 1 FROM td_acts WHERE id = ?)").bind(uid, act.id)]);
  if (ins?.meta?.changes) ctx.acts.push({ ...act, state: "done", level: "do" });
}

// ---- Ride Then (an offer, not a rule) ----
// Today's session with no time (Fitness's plan for the day, a ride or a run; no fx_times row and no explicit ride):
// offered, as Ride Then, for the day; taken, it's set to the best time then (actTake)
async function rideThen(ctx) {
  const { env, uid, day, tz } = ctx, s = (await ctx.snap())?.days?.[day];
  if (s?.state !== "session" || !["ride", "run"].includes(s.sport)) return;
  const span = spanOf(tz, day);
  if (await timeFor(env, uid, day)) return;
  if ((await ctx.offers()).some((o) => explicitRide(o) && o.start < span.end && o.stop > span.start)) return;
  if (await actExists(ctx, "rideThen", `time:${day}`)) return;
  const secs = clamp(Math.round(Number(s.secs) || 3600), 900, 6 * 3600), name = typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 60) : "Today’s session";
  const act = { id: crypto.randomUUID(), uid, rule: "rideThen", day, target: `time:${day}`, kind: "time", state: "offered", level: "suggest", was: null,
    now: { day, sport: s.sport, secs, name }, said: `${name} has no time yet`, made: ctx.t, undoUntil: span.end };
  const r = await actInsert(ctx.D, act).run();
  if (r.meta?.changes) ctx.acts.push(act);
}

// ---- the habit (addRide) ----
// Rides by weekday and start hour (±1 h): rides [{ start, secs }] (the last 56 days' outdoor rides, ms) in tz, today
// ("YYYY-MM-DD" there), past ({ day: { hour: wet } }, or null where the weather then isn't known: every day dry) → for
// each weekday with rides, its best hour: { weekday (0 Sunday), hour (the bucket's median start, to the hour), k (dry
// weeks of the last 8 it was ridden), n (the weeks it could have been: dry, or ridden all the same), strength (k of n,
// out of 8; 0 with fewer than 4 such weeks), cap, secs (the median length) }
export function habitBuckets(rides, { today, tz, past = null }) {
  const zone = zoneOf(tz), dates = Array.from({ length: 56 }, (_, i) => dayAfter(today, -(i + 1))), byDate = new Map();
  for (const r of Array.isArray(rides) ? rides : []) {
    if (!Number.isFinite(r?.start)) continue;
    const x = dayIn(zone, r.start);
    if (!byDate.has(x)) byDate.set(x, []);
    byDate.get(x).push({ start: r.start, secs: Number.isFinite(r.secs) && r.secs > 0 ? r.secs : null, mins: minsIn(zone, r.start) });
  }
  const out = [], { from, to } = LIMITS.ride;
  for (let wd = 0; wd < 7; wd++) {
    const ds = dates.filter((x) => weekdayNo(x) === wd), all = ds.flatMap((x) => byDate.get(x) || []);
    if (!all.length) continue;
    const mid = median(all.map((r) => r.mins / 60));
    let best = null;
    for (let h = from; h < to; h++) {
      let k = 0, n = 0;
      const used = [];
      for (const x of ds) {
        const hit = (byDate.get(x) || []).filter((r) => Math.abs(Math.floor(r.mins / 60) - h) <= 1).sort((a, b) => Math.abs(a.mins - h * 60) - Math.abs(b.mins - h * 60))[0];
        if (hit) { k++; n++; used.push(hit); } else if (past?.[x]?.[h] !== true) n++;
      }
      if (k && (!best || k > best.k || (k === best.k && Math.abs(h - mid) < Math.abs(best.h - mid)))) best = { h, k, n, used };
    }
    if (!best) continue;
    const strength = best.n >= 4 ? (best.k * 8) / best.n : 0, secs = median(best.used.map((r) => r.secs));
    out.push({ weekday: wd, hour: clamp(Math.round(median(best.used.map((r) => r.mins)) / 60), from, to - 1), k: best.k, n: best.n, strength, cap: capOf(strength),
      secs: clamp(Math.round(secs ?? 7200), 1800, 6 * 3600) });
  }
  return out;
}
// (the last 56 days' outdoor rides: Fitness's own, and those waiting to come in from Strava; one start once)
async function ridesIn(env, uid, from, to) {
  const F = await fitdb(env);
  const acts = (await F.prepare("SELECT start, sum FROM fx_acts WHERE user_id = ? AND sport = 'ride' AND indoor = 0 AND start >= ? AND start < ? ORDER BY start LIMIT 400")
    .bind(uid, from, to).all()).results || [];
  const waiting = await F.prepare("SELECT start, secs FROM fx_strava_new WHERE user_id = ? AND sport = 'ride' AND indoor = 0 AND start >= ? AND start < ? ORDER BY start LIMIT 200")
    .bind(uid, from, to).all().then((r) => r.results || []).catch(() => F.prepare("SELECT start FROM fx_strava_new WHERE user_id = ? AND sport = 'ride' AND indoor = 0 AND start >= ? AND start < ? ORDER BY start LIMIT 200")
      .bind(uid, from, to).all().then((r) => r.results || [], () => []));
  const out = [];
  for (const a of acts) { let s = null; try { s = Number(JSON.parse(a.sum || "{}")?.secs); } catch (_) {} out.push({ start: a.start, secs: Number.isFinite(s) ? s : null }); }
  for (const w of waiting) if (Number.isFinite(w.start) && !out.some((r) => Math.abs(r.start - w.start) < 10 * MIN)) out.push({ start: w.start, secs: Number.isFinite(w.secs) ? w.secs : null });
  return out;
}
// The habit ride to add (spec §7.5): from the habit's buckets, the next such weekday within 3 days (today's too, an hour
// or more off) whose Fitness day is none or rest, dry at that hour where you ride (the Weather place's week), with no
// ride time or offer that day, and no ride from habit there already (one undone isn't put back). In Fitness's zone.
// → { day, start, stop, tz, secs, weekday, dd (days from today), k, n, strength, cap, planned } or null
export async function habitRide(env, u, t, tz, deps = {}) {
  need(t, "habitRide");
  const d = withDeps(deps), zone = zoneOf(tz);
  return habitIn(contextFor(env, u, t, zone, dayIn(zone, t), d, await tddb(env)));
}
async function habitIn(ctx) {
  const { env, uid, t } = ctx, snap = await ctx.snap(), tz = zoneOk(snap?.tz) ? snap.tz : ctx.tz, today = dayIn(tz, t);
  const rides = await ridesIn(env, uid, wallAt(tz, dayAfter(today, -56), 0), wallAt(tz, today, 0));
  if (rides.length < 4) return null;
  const home = await ctx.home();
  if (!home) return null;
  const past = await Promise.resolve().then(() => ctx.d.pastWet(env, home.lat, home.lon, t)).catch(() => null);
  const live = habitBuckets(rides, { today, tz, past }).filter((b) => b.cap);
  for (let dd = 0; dd <= 3 && live.length; dd++) {
    const day = dayAfter(today, dd), b = live.find((x) => x.weekday === weekdayNo(day));
    if (!b) continue;
    const start = wallAt(tz, day, b.hour * 60), stop = start + clamp(Math.ceil(b.secs / 3600), 1, 6) * HOUR, planned = snap?.days?.[day]?.state;
    if (start < t + AHEAD || !["none", "rest"].includes(planned)) continue;
    if (await timeFor(env, uid, day)) continue;
    const span = spanOf(tz, day);
    if ((await ctx.offers()).some((o) => o.start < span.end && o.stop > span.start)) continue;
    if (await actExists(ctx, "addRide", `day:${day}`, { anyDay: true })) continue;
    const hours = (await ctx.wx())?.hours || [], during = hours.filter((h) => h.t + HOUR > start && h.t < stop);
    if (during.length < (stop - start) / HOUR || during.some(isWet)) continue;
    return { day, start, stop, tz, secs: b.secs, weekday: b.weekday, dd, k: b.k, n: b.n, strength: b.strength, cap: b.cap, planned };
  }
  return null;
}
// (when, in words: "today", "tomorrow", "on Thursday"; and to begin a sentence)
const whenOf = (dd, weekday) => (dd === 0 ? "today" : dd === 1 ? "tomorrow" : `on ${WEEKDAYS[weekday]}`);
const WhenOf = (dd, weekday) => (dd === 0 ? "Today" : dd === 1 ? "Tomorrow" : WEEKDAYS[weekday]);
// A ride from habit: at do, added (Today's own offer, agreed and holding nothing until Keep); at suggest, offered; at
// quiet, or where the habit isn't strong enough, nothing
async function addRide(ctx) {
  const { env, D, uid, t, day } = ctx, level = await ruleLevel(env, uid, "addRide");
  if (level === "quiet") return;
  const h = await habitIn(ctx);
  const at = cappedLevel(level, h?.cap);
  if (!h || !at || at === "quiet") return;
  const name = workoutById("free-ride")?.name || "Ride how you like", state = at === "do" ? "yes" : "new";
  const offer = await addTodayOffer(env, uid, { start: h.start, stop: h.stop, tz: h.tz, sport: "ride", wid: "free-ride", name, secs: h.secs, dry: true, state, was: { planned: h.planned } }, { t })
    .catch((e) => { if (e instanceof HttpError) return null; throw e; });
  if (!offer) return;
  const W = WEEKDAYS[h.weekday], hh = hhmm(h.tz, h.start);
  const why = `${NUMBERS[h.k]} of the last ${lower(NUMBERS[h.n])} dry ${W}s. ${h.dd === 0 ? "It’s dry then" : `${WhenOf(h.dd, h.weekday)}’s dry`}`;
  const act = { id: crypto.randomUUID(), uid, rule: "addRide", day, target: `day:${h.day}`, kind: "add", state: at === "do" ? "done" : "offered", level: at,
    was: { planned: h.planned }, now: { offer, day: h.day, start: h.start, stop: h.stop, state, secs: h.secs, k: h.k, n: h.n },
    said: at === "do" ? `Added: a ride ${whenOf(h.dd, h.weekday)} at ${hh} · ${why}` : `A ride ${whenOf(h.dd, h.weekday)} at ${hh} · ${why}`,
    made: t, undoUntil: Math.max(t + NEAR, h.start - HOUR) };
  let ins = null;
  try {
    [ins] = await D.batch([actInsert(D, act), ...(at === "do" ? [D.prepare("UPDATE td_rules SET done = done + 1 WHERE user_id = ? AND rule = 'addRide' AND EXISTS (SELECT 1 FROM td_acts WHERE id = ?)").bind(uid, act.id)] : [])]);
  } finally {
    // (no act for it, no ride: Fitness would add one Today can't undo)
    if (!ins?.meta?.changes) await answerOffer(env, uid, offer, "no", { t }).catch(() => {});
  }
  if (ins?.meta?.changes) ctx.acts.push(act);
}

// ---- Take, Keep and Undo ----
async function ownAct(env, u, b) {
  const id = typeof b?.id === "string" ? b.id.toLowerCase() : "";
  if (!UUID.test(id)) throw new HttpError(400, "Bad request.");
  const D = await tddb(env), r = await D.prepare(`SELECT ${ACT_COLS} FROM td_acts WHERE id = ? AND user_id = ?`).bind(id, u.id).first();
  if (!r) throw new HttpError(404, "Not found.");
  return { D, a: actOf(r) };
}
const reread = async (D, a) => actOf(await D.prepare(`SELECT ${ACT_COLS} FROM td_acts WHERE id = ?`).bind(a.id).first());
async function ruleFor(D, uid, a) {
  if (!OWN.includes(a.rule)) return { rule: a.rule, level: a.level, line: "" };
  return ruleView((await rulesOf(D, uid)).get(a.rule));
}

// Take (Move It, Add Thursday's Ride, Ride Then: an offered act done now, on your word) or Keep (a ride Today added, kept
// with a tap, so it counts as a ride you chose). → { act, rule: { rule, level, line } }
export async function actTake(env, u, b, { t, deps = {} } = {}) {
  need(t, "actTake");
  const { D, a } = await ownAct(env, u, b);
  if (a.state === "offered") {
    if (a.undoUntil <= t) throw new HttpError(409, "That’s passed now.");
    if (a.rule === "moveRide") await takeMove(env, D, u.id, a, t);
    else if (a.rule === "addRide") await takeAdd(env, D, u.id, a, t);
    else if (a.rule === "rideThen") await takeThen(env, D, u, a, t, withDeps(deps));
    else throw new HttpError(409, "That’s been done already.");
  } else if (a.kind === "add" && (a.state === "done" || a.state === "kept")) await keep(env, D, u.id, a, t);
  else throw new HttpError(409, "That’s been done already.");
  const act = await reread(D, a);
  return { act, rule: await ruleFor(D, u.id, act) };
}
// (the act's row and its rule's record changed together, only while the act is as it was read and its target as
// cond says; and the write last, under the same check, so either all three happen or none)
const recordQ = (D, uid, a, set, cond) => D.prepare(`UPDATE td_rules SET ${set} WHERE user_id = ?1 AND rule = ?2
    AND EXISTS (SELECT 1 FROM td_acts WHERE id = ?3 AND state = ?4)${cond ? ` AND ${cond.sql}` : ""}`).bind(uid, a.rule, a.id, a.state, ...(cond ? cond.args : []));
const stateQ = (D, a, to, cond, more = {}) => {
  const sets = ["state = ?3", ...Object.keys(more).map((k, i) => `${k} = ?${4 + i}`)], vals = Object.values(more), n = 4 + vals.length;
  const c = cond ? targetShift(cond, n) : null;
  return D.prepare(`UPDATE td_acts SET ${sets.join(", ")} WHERE id = ?1 AND state = ?2${c ? ` AND ${c.sql}` : ""}`).bind(a.id, a.state, to, ...vals, ...(c ? c.args : []));
};
// (a target check renumbered from ?n)
const targetShift = (cond, n) => ({ sql: cond.sql.replace(/\?(\d+)/g, (_, k) => `?${Number(k) - cond.from + n}`), args: cond.args });
const condAt = (uid, x, n) => { const c = targetIs(uid, x, n); return c ? { ...c, from: n } : null; };

async function takeMove(env, D, uid, a, t) {
  const was = a.was, now = a.now;
  if (!was || !now) throw new HttpError(409, "That’s been done already.");
  const write = now.offer
    ? await setOfferTimesQ(env, uid, now.offer, now.start, now.stop, { t, expect: { start: was.start, stop: was.stop, state: "yes" } })
    : await setTimeQ(env, uid, timeRowOf({ ...now, source: "moved" }), { t, expect: { start: was.start, stop: was.stop, source: was.source } });
  const r = await D.batch([recordQ(D, uid, a, "done = done + 1", condAt(uid, was, 5)), stateQ(D, a, "taken", condAt(uid, was, 1)), write]);
  if (!r[1]?.meta?.changes && (await reread(D, a)).state === "offered") throw new HttpError(409, "Your ride has changed since, so it wasn’t moved.");
}
async function takeAdd(env, D, uid, a, t) {
  if (!a.now?.offer || !(await takeOffer(env, uid, a.now.offer, { t }))) throw new HttpError(409, "That ride has changed in Fitness since.");
  await D.batch([recordQ(D, uid, a, "done = done + 1", null), stateQ(D, a, "taken", null, { now: JSON.stringify({ ...a.now, state: "yes" }) })]);
}
async function takeThen(env, D, u, a, t, d) {
  const uid = u.id, now = a.now || {}, day = now.day;
  if (!DAYKEY.test(String(day)) || await timeFor(env, uid, day)) throw new HttpError(409, "Your ride has a time already.");
  const tz = zoneOf(morningTz(u, await todayPrefs(env, uid)));
  const ctx = contextFor(env, u, t, tz, day, d, D), span = spanOf(tz, day);
  const timed = [...(await timesFor(env, uid, span.start, span.end, { t })), ...(await ctx.offers()).filter((o) => o.role === "asked" || o.role === "answered")];
  const wx = await ctx.wx(), len = clamp(Math.ceil((Number(now.secs) || 3600) / 300) * 300, 900, 6 * 3600) * 1000;
  const w = wx?.hours?.length ? d.bestWindow(wx, { secs: len / 1000, now: t, sport: now.sport === "run" ? "run" : "ride", avoid: [[t - DAY, t + NEAR], ...timed.map((x) => [x.start - NEAR, x.stop + NEAR])] }) : null;
  const start = w?.start;
  if (!Number.isFinite(start) || start < t || start % (5 * MIN) || dayIn(tz, start) !== day) throw new HttpError(409, "There’s no good time left today.");
  const row = { day, start, stop: start + len, tz, sport: now.sport === "run" ? "run" : "ride", source: "today" };
  const write = await setTimeQ(env, uid, row, { t });
  const r = await D.batch([stateQ(D, a, "taken", null, { now: JSON.stringify(row), said: `Riding at ${hhmm(tz, start)}`, undo_until: Math.max(t + NEAR, start - HOUR) }), write]);
  if (!r[0]?.meta?.changes && (await reread(D, a)).state === "offered") throw new HttpError(409, "That’s been done already.");
}
async function keep(env, D, uid, a, t) {
  if (!a.now?.offer || !(await takeOffer(env, uid, a.now.offer, { t }))) throw new HttpError(409, "That ride has changed in Fitness since.");
  // (one kept already, past its Undo, counted: only its tap kept now)
  if (a.state === "kept") return;
  await D.batch([recordQ(D, uid, a, "kept = kept + 1, kept_since = kept_since + 1", null), stateQ(D, a, "kept", null)]);
}

// Undo (spec §7.5): only while it's still as Today left it (the ride's time row, or the offer's times and state, equal to
// the act's now) is it put back (the row as it was, or none; the offer turned no), the act undone and the rule dropped
// a level, in one batch with that check in each statement's WHERE, so two Undos never both restore. Changed by hand
// since: nothing restored, the act and the level as they were. → { act, rule: { rule, level, line }, said }
export async function actUndo(env, u, b, { t } = {}) {
  need(t, "actUndo");
  const { D, a } = await ownAct(env, u, b), uid = u.id;
  if (a.state === "undone") return { act: a, rule: await ruleFor(D, uid, a), said: "That’s undone already." };
  if (!["done", "taken", "kept"].includes(a.state) || !a.now) throw new HttpError(409, "There’s nothing to undo.");
  if (a.undoUntil <= t) throw new HttpError(409, "It’s too late to undo that now.");
  const now = a.now, was = a.was;
  let restore;
  if (a.rule === "addRide") restore = await answerOfferQ(env, uid, now.offer, "no", { t, expect: { start: now.start, stop: now.stop, state: now.state } });
  else if (a.rule === "rideThen") restore = await dropTimeQ(env, uid, now.day, { expect: { start: now.start, stop: now.stop, source: now.source } });
  else if (now.offer) restore = await setOfferTimesQ(env, uid, now.offer, was.start, was.stop, { t, expect: { start: now.start, stop: now.stop, state: now.state } });
  else restore = await setTimeQ(env, uid, timeRowOf(was), { t, expect: { start: now.start, stop: now.stop, source: now.source } });
  const rules = OWN.includes(a.rule) ? await rulesOf(D, uid) : null, r0 = rules?.get(a.rule), next = r0 ? levelOf(r0, t, { undo: true }) : null;
  const less = a.state === "kept" ? ", kept = MAX(0, kept - 1), kept_since = MAX(0, kept_since - 1)" : "";
  const set = `undone = undone + 1${less}${next?.changed ? `, level = '${next.level}', level_at = ${Math.round(t)}, kept_since = 0, set_by = 'auto'` : ""}`;
  const r = await D.batch([...(r0 ? [recordQ(D, uid, a, set, condAt(uid, now, 5))] : []), stateQ(D, a, "undone", condAt(uid, now, 3)), restore]);
  const act = await reread(D, a), rule = await ruleFor(D, uid, act);
  if (!r[r0 ? 1 : 0]?.meta?.changes) return { act, rule, said: act.state === "undone" ? "That’s undone already." : "You’ve changed it since, so nothing was undone." };
  const said = a.rule === "rideThen" ? "Undone. Your ride has no time again." : next?.changed ? `Undone. ${DROPPED[a.rule]?.[next.level] || "It’s suggested now"}` : "Undone.";
  return { act, rule, said };
}

// ---- the morning notification's words for an act (functions/_todaymorning.js) ----
// Only what Today did or offers this morning (done, offered; never Ride Then, which the Fitness line already has the
// best time for). names: Chat's "Names on the Lock Screen" (notify_prefs.names): a friend named only where it's on.
// tz: the account's zone; today: its day there. → the sentence, or null
export function pushLine(act, { names = false, tz = "Europe/London", today = null } = {}) {
  const n = act?.now, hh = (ms) => hhmm(tz, ms);
  if (!n || !Number.isFinite(n.start) || !["done", "offered"].includes(act.state)) return null;
  if (act.rule === "moveRide" && n.why && Number.isFinite(act.was?.start)) {
    const what = whatOf(n.why, !!names, hh);
    return act.state === "done" ? `Moved your ride to ${hh(n.start)} to clear ${what}. Undo on Today.`
      : `Your ride at ${hh(act.was.start)} runs into ${what}. Move it to ${hh(n.start)} on Today.`;
  }
  if (act.rule === "addRide" && DAYKEY.test(String(n.day))) {
    const from = DAYKEY.test(String(today)) ? today : dayIn(zoneOf(tz), n.start);
    const dd = Math.round((Date.parse(`${n.day}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY), wd = weekdayNo(n.day);
    const when = dd >= 0 && dd <= 1 ? whenOf(dd, wd) : `on ${WEEKDAYS[wd]}`, When = dd >= 0 && dd <= 1 ? WhenOf(dd, wd) : WEEKDAYS[wd];
    return act.state === "done" ? `Added a ride ${when} at ${hh(n.start)}. Undo on Today.` : `${When} at ${hh(n.start)} looks good for your usual ride. Add it on Today.`;
  }
  return null;
}
