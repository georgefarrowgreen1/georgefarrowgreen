// Fitness and Chat's "Send to a friend": what the server keeps for it, and only this, each in the account's own rows.
//
// fx_shares: a session sent to friends from Chat (made when Send is tapped, never before: functions/_share.js POST
//   fit-share), so a friend's Chat can say whether it got done. Only what that look needs: whose, which day (in which
//   zone) and which sport. No workout's name, id or length, no letter, no friend. Kept 72 hours past the end of its day,
//   then deleted as the next is made; all of an account's go with it (functions/_fitness.js dropFitness).
// fx_offers: plans agreed in Chat (a Yes to a ride or run together), each person's own Fitness inbox: put in by their
//   own Chat (POST fit-offer), shown in Fitness, which adds it to the plan only when the person says so there. Nothing
//   here ever edits a Fitness record (fx_state). Kept until 12 hours after the plan's end. Since Today First (spec §5.2):
//   the friend's id (with_id, sent by the phone and checked as a friend by the caller); taken (a person's tap kept it:
//   Take or Keep on Today, Add in Fitness); an inviter's own row written as the invite goes, before any answer (state
//   'pending', with the other times it offered, opts; never shown, kept until its last offered end); and Today's own
//   habit rides (role 'today', who ''), shown in Fitness only when it asks for them.
//
// A friend's look at a session (fitNowMany) names no letter: it's answered only for a friend who's had a letter from the
// session's owner since the share was made, landed (not lost, not called back, not gone), within 48 hours of landing,
// and says only done or not, with the time, distance and stress where they're known. Never when it was started.

import { HttpError, db, randomToken, UUID_RE } from "./_pigeon.js";
import { fitdb, tablesOnce } from "./_fitness.js";
import { normPlan, zoneOk } from "../pigeon/cards.js";

const HOUR = 3600e3, DAY = 24 * HOUR;
// a share's look lasts this long past the end of its day; a friend can look for this long after a letter lands
export const SHARE_KEEP = 72 * HOUR, LOOK_MS = 48 * HOUR;
// an offer's kept this long past its end; this many waiting at most
export const OFFER_KEEP = 12 * HOUR, OFFERS_MAX = 20;
// an account's invites waiting for an answer (pending), and Today's own rides waiting, at most
export const PENDING_MAX = 20, TODAY_OFFERS_MAX = 10;
export const SHARE_SPORTS = ["ride", "run", "swim", "walk", "row", "strength"];
export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
const DAYKEY = /^\d{4}-\d\d-\d\d$/;

async function makeShares(D) {
  await D.batch([
    D.prepare(`CREATE TABLE IF NOT EXISTS fx_shares (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL, tz TEXT NOT NULL, sport TEXT NOT NULL,
      made INTEGER NOT NULL, until INTEGER NOT NULL)`),
    D.prepare("CREATE INDEX IF NOT EXISTS fx_shares_user ON fx_shares (user_id)"),
    D.prepare("CREATE INDEX IF NOT EXISTS fx_shares_until ON fx_shares (until)"),
  ]);
}
async function makeOffers(D) {
  await D.batch([
    D.prepare(`CREATE TABLE IF NOT EXISTS fx_offers (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, tz TEXT NOT NULL,
      sport TEXT NOT NULL, wid TEXT NOT NULL, name TEXT NOT NULL, secs INTEGER NOT NULL, who TEXT NOT NULL, role TEXT NOT NULL,
      far INTEGER NOT NULL DEFAULT 0, dry INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'new', made INTEGER NOT NULL, until INTEGER NOT NULL,
      PRIMARY KEY (user_id, id))`),
    D.prepare("CREATE INDEX IF NOT EXISTS fx_offers_until ON fx_offers (until)"),
  ]);
  // (Today First: the friend's id; whether a person's tap kept it; an invite's other times, JSON [[start, stop], …], at
  // most 3, pending rows only. Each added once, to a table made before them)
  await D.prepare("ALTER TABLE fx_offers ADD COLUMN with_id TEXT").run().catch(() => {});
  await D.prepare("ALTER TABLE fx_offers ADD COLUMN taken INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  await D.prepare("ALTER TABLE fx_offers ADD COLUMN opts TEXT").run().catch(() => {});
}
const sharesDb = (env) => tablesOnce(env, "shares", makeShares);
const offersDb = (env) => tablesOnce(env, "offers", makeOffers);

// ---- days in a zone ----
const WALL = new Map();
const wallOf = (tz) => WALL.get(tz) || WALL.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })).get(tz);
const offsetAt = (tz, t) => { const p = Object.fromEntries(wallOf(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000; };
const keyIn = (tz, t) => { const p = Object.fromEntries(wallOf(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
// (the first moment of a day there: its midnight by the zone's clocks, or where they jump past it, the moment they do)
function startIn(tz, day) {
  const [y, m, d] = day.split("-").map(Number), wall = Date.UTC(y, m - 1, d), once = wall - offsetAt(tz, wall), twice = wall - offsetAt(tz, once);
  const ok = [once, twice].filter((s) => keyIn(tz, s) === day);
  return ok.length ? Math.min(...ok) : twice;
}
// a day key's start and end in a zone (a day the clocks change on is 23 or 25 hours)
export function daySpan(day, tz) {
  const zone = zoneOk(tz) ? tz : "Europe/London", [y, m, d] = day.split("-").map(Number), next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: startIn(zone, day), end: startIn(zone, next) };
}
const dayOk = (s) => { if (typeof s !== "string" || !DAYKEY.test(s)) return false; const [y, m, d] = s.split("-").map(Number), x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d && y >= 2020 && y <= 2100; };

// ---- shares ----
// A new share for a session being sent (a new id each time): { day, tz, sport } as the card has them. → id
// (a day that starts more than two days from now is refused: a card's day is today's, or one gone by, so a share's never
// kept much past three days from when it's made, and every one is swept)
export async function shareFor(env, userId, { day, tz, sport }) {
  if (!dayOk(day) || !zoneOk(tz) || !SHARE_SPORTS.includes(sport)) throw new HttpError(400, "Bad request.");
  const t = Date.now(), span = daySpan(day, tz);
  if (span.start > t + 2 * DAY) throw new HttpError(400, "Bad request.");
  const D = await sharesDb(env), id = randomToken(16), until = Math.max(span.end, t) + SHARE_KEEP;
  await D.batch([
    D.prepare("DELETE FROM fx_shares WHERE until < ?").bind(t),
    D.prepare("INSERT INTO fx_shares (id, user_id, day, tz, sport, made, until) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, userId, day, tz, sport, t, until),
  ]);
  return id;
}
// One of the account's own shares taken back (every letter of its send failed): never anyone else's
export async function dropShare(env, userId, id) {
  if (typeof id !== "string" || !SHARE_ID.test(id)) return;
  const D = await sharesDb(env);
  await D.prepare("DELETE FROM fx_shares WHERE id = ? AND user_id = ?").bind(id, userId).run();
}

// ---- done ----
const sumOf = (s) => { try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch (_) { return {}; } };
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
// (what's done in a window: in Fitness, and waiting to come in from Garmin or Strava, whose tables may not be made yet,
// or made before the waiting rows' figures were added to them: then the narrower select, as before them)
const WINDOW = " WHERE user_id = ?1 AND start >= ?2 AND start < ?3 ORDER BY start DESC LIMIT 5";
const WAITING = [
  ["SELECT id, start, name, sport, secs, dist FROM fx_garmin_new", "SELECT id, start, name FROM fx_garmin_new"],
  ["SELECT id, start, name, sport, secs, dist FROM fx_strava_new", "SELECT id, start, name, sport FROM fx_strava_new"],
];
const doneQs = (D, userId, start, end, narrow = false) => [
  D.prepare("SELECT id, start, sport, name, sum FROM fx_acts" + WINDOW).bind(userId, start, end),
  ...WAITING.map((w) => D.prepare(w[narrow ? 1 : 0] + WINDOW).bind(userId, start, end)),
];
const rowsOf = ([acts, garmin, strava]) => [
  ...(acts || []).map((a) => { const s = sumOf(a.sum); return { name: a.name || "Activity", sport: a.sport || null, start: a.start, secs: num(s.secs), dist: num(s.dist), tss: num(s.tss), from: "fitness" }; }),
  ...(garmin || []).map((g) => ({ name: g.name || "Activity", sport: g.sport || null, start: g.start, secs: num(g.secs), dist: num(g.dist), tss: null, from: "garmin" })),
  ...(strava || []).map((a) => ({ name: a.name || "Activity", sport: a.sport || null, start: a.start, secs: num(a.secs), dist: num(a.dist), tss: null, from: "strava" })),
].sort((a, b) => b.start - a.start);
// Several windows' queries in one trip (a friend's look at several sessions); where Garmin's or Strava's table isn't made
// yet (or hasn't its figures yet), Fitness's own in one, and the others each where it is. → for each window, [acts,
// garmin, strava] rows
async function doneMany(D, wins) {
  if (!wins.length) return [];
  const qs = (narrow) => wins.flatMap((w) => doneQs(D, w.userId, w.start, w.end, narrow));
  try {
    const r = await D.batch(qs(false));
    return wins.map((_, i) => [0, 1, 2].map((j) => r[i * 3 + j]?.results || []));
  } catch (_) {
    const part = async (j) => {
      for (const narrow of j === 0 ? [false] : [false, true]) {
        try { return (await D.batch(qs(narrow).filter((_, k) => k % 3 === j))).map((x) => x.results || []); } catch (e) { if (j === 0) throw e; }
      }
      return wins.map(() => []);
    };
    const a = await part(0), g = await part(1), s = await part(2);
    return wins.map((_, i) => [a[i], g[i], s[i]]);
  }
}
// Everything done in a window, newest first: { name, sport, start, secs, dist, tss, from } (null where not known), as
// InFlite Today's Fitness card shows it (functions/_todayfit.js); a row waiting from Garmin or Strava with the sport,
// time and distance it came with, where it did
export async function donesIn(env, userId, start, end) {
  const D = await fitdb(env), [acts, ...wide] = doneQs(D, userId, start, end), [, ...narrow] = doneQs(D, userId, start, end, true);
  const rows = (q) => q.all().then((r) => r.results || []);
  const waiting = (i) => rows(wide[i]).catch(() => rows(narrow[i])).catch(() => []);
  return rowsOf(await Promise.all([rows(acts), waiting(0), waiting(1)]));
}
// The one that says a session's done: without a sport, the newest of any (Today's card); with one, the newest of that
// sport, and only where none of that sport is there, one waiting from Garmin (which says no sport, and may be it)
function pick(rows, sport) {
  if (!sport) return rows[0] || null;
  return rows.find((r) => r.from !== "garmin" && r.sport === sport) || rows.find((r) => r.from === "garmin") || null;
}
const figures = (r) => { const o = {}; for (const k of ["secs", "dist", "tss"]) if (r[k] != null) o[k] = r[k]; return o; };
// → { secs?, dist?, tss?, sport, start } (each figure only when known) or null
export async function doneIn(env, userId, start, end, sport = null) {
  const r = pick(await donesIn(env, userId, start, end), sport);
  return r ? { ...figures(r), sport: r.sport ?? null, start: r.start } : null;
}

// ---- a friend's look ----
const GONE = Object.freeze({ gone: true });
// (each (share, asker)'s answer kept a minute in this copy of the server; FITNOW_MEMO_MS: tests only)
const memo = new Map(), MEMO_MAX = 500;
// One answer for each share, in order: { done: false }, { done: true, secs?, dist?, tss? }, or { gone: true } for every
// refusal alike (no share, out of date, not a friend, no letter that would let them look)
export async function fitNowMany(env, shares, asker) {
  const t = Date.now(), keep = env.FITNOW_MEMO_MS != null ? Number(env.FITNOW_MEMO_MS) : 60e3;
  const list = Array.isArray(shares) ? shares : [], out = list.map(() => GONE);
  const want = [];
  list.forEach((id, i) => {
    if (typeof id !== "string" || !SHARE_ID.test(id) || !asker) return;
    const m = memo.get(`${id}|${asker}`);
    if (m && t - m.at < keep) out[i] = m.v; else want.push(i);
  });
  if (!want.length) return out.map((v) => ({ ...v }));
  const D = await sharesDb(env), ids = [...new Set(want.map((i) => list[i]))];
  const rows = new Map((await D.prepare(`SELECT id, user_id, day, tz, sport, made FROM fx_shares WHERE id IN (${ids.map(() => "?").join(", ")}) AND until > ?`).bind(...ids, t).all()).results.map((r) => [r.id, r]));
  // the gates, for others' shares: friends, and a landed letter from the owner since it was made (one trip)
  const others = [...rows.values()].filter((r) => r.user_id !== asker);
  const ok = new Set([...rows.values()].filter((r) => r.user_id === asker).map((r) => r.id));
  if (others.length) {
    const P = await db(env);
    const gates = await P.batch(others.map((r) => P.prepare(`SELECT 1 AS ok FROM pg_links l WHERE l.status = 'ok' AND ((l.a = ?1 AND l.b = ?2) OR (l.a = ?2 AND l.b = ?1))
      AND EXISTS (SELECT 1 FROM pg_msgs m WHERE m.sender = ?1 AND m.recipient = ?2 AND m.sent_at >= ?3 AND m.deliver_at <= ?4 AND m.deliver_at > ?5
        AND m.recalled = 0 AND m.lost_at IS NULL AND m.gone_at IS NULL) LIMIT 1`).bind(r.user_id, asker, r.made - 60e3, t, t - LOOK_MS)));
    others.forEach((r, i) => { if (gates[i]?.results?.length) ok.add(r.id); });
  }
  // whether each one let through got done, on its day in its zone, of its sport (one trip)
  const open = [...rows.values()].filter((r) => ok.has(r.id)), F = await fitdb(env);
  const got = await doneMany(F, open.map((r) => ({ userId: r.user_id, ...daySpan(r.day, r.tz) })));
  const ans = new Map(open.map((r, i) => { const d = pick(rowsOf(got[i]), r.sport); return [r.id, d ? { done: true, ...figures(d) } : { done: false }]; }));
  for (const i of want) {
    const v = ans.get(list[i]) || GONE;
    out[i] = v;
    memo.delete(`${list[i]}|${asker}`); memo.set(`${list[i]}|${asker}`, { at: t, v });
    if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
  }
  return out.map((v) => ({ ...v }));
}
export async function fitNow(env, { share, asker }) { return (await fitNowMany(env, [share], asker))[0]; }

// ---- plans from Chat, and Today's own ----
const text = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
const MIN = 60e3;
// (a time an offer may be at, as an invite's plan has it: pigeon/cards.js normPlan, whole hours, the workout's own length)
const planOf = (o, start, stop) => normPlan({ sport: o.sport, wid: o.wid, name: o.name, secs: o.secs, start, end: stop, tz: o.tz, dry: o.dry === true, far: o.far === true });
// (an invite's other times: [[start, stop], …] (or { start, end } each), at most 3, each checked as the main time is, those
// already past left out → [[start, stop], …], or null where one isn't a time the plan could be at)
function optsOf(o, t) {
  if (o.opts == null) return [];
  if (!Array.isArray(o.opts) || o.opts.length > 3) return null;
  const out = [];
  for (const x of o.opts) {
    const [s, e] = Array.isArray(x) ? x : x && typeof x === "object" ? [x.start, x.end ?? x.stop] : [];
    const p = planOf(o, s, e);
    if (!p) return null;
    if (p.end > t) out.push([p.start, p.end]);
  }
  return out;
}
// (the same ride with the same friend, new or agreed: by the friend's id where the row has one, else the name)
const SAME = "start = ? AND stop = ? AND state IN ('new', 'yes') AND (with_id = ? OR who = ?)";
// (the moment a write or a read for Today is at: passed in by its route, never the clock read down here; one left out
// fails at once, rather than quietly being another moment: a test's fixed day, or X-Today-At's)
const need = (t, what) => { if (!Number.isFinite(t)) throw new TypeError(`${what}: pass { t }, the route's time`); return t; };
// (Undo's check, expect: { start, stop } (or [start, stop]), and state where it's given: the row only while it's just
// that; null without one)
function expectOf(expect) {
  if (expect == null) return null;
  const ex = Array.isArray(expect) ? { start: expect[0], stop: expect[1] } : { start: expect.start, stop: expect.stop ?? expect.end, state: expect.state };
  if (!Number.isSafeInteger(ex.start) || !Number.isSafeInteger(ex.stop) || (ex.state != null && !["new", "yes", "no"].includes(ex.state))) throw new HttpError(400, "Bad request.");
  return ex;
}
const expectSql = (ex, n) => (ex ? ` AND start = ?${n} AND stop = ?${n + 1}${ex.state != null ? ` AND state = ?${n + 2}` : ""}` : "");
const expectArgs = (ex) => (ex ? [ex.start, ex.stop, ...(ex.state != null ? [ex.state] : [])] : []);
// An offer put in the account's own Fitness, as its Chat sends it: { id, start, stop, tz, sport, wid, name, secs, who,
// role, far, dry }, checked as an invite's plan is (functions/_share.js POST fit-offer), and since Today First, only from
// a caller that says so ({ checked: true }: it built these from fields it checked itself; a raw request's are ignored, as
// every other field it didn't know always was):
// - withId: the friend's id, already checked as a friend by the caller (pg_links 'ok'), stored as it is;
// - state: "pending" (role "asked" only): the inviter's own row, written as the invite goes, never shown; 20 such at
//   most (not counted with the plans waiting), kept until the last time it offered ends; with
// - opts: the invite's other times, [[start, stop], …], at most 3, each checked as the main time is (kept only on a
//   pending row; one already past left out).
// The same id again changes nothing (one answered stays answered); 20 waiting at most (Today's own not counted). An
// asked one that isn't pending isn't added where the same ride with the same friend is there already, new or agreed
// (the inviter's phone drawing the Yes after the server made it from the pending row: promoteOffer).
export async function addOffer(env, userId, offer, { t = Date.now(), checked = false } = {}) {
  const raw = offer && typeof offer === "object" ? offer : {}, o = checked === true ? raw : { ...raw, withId: undefined, state: undefined, opts: undefined };
  const plan = planOf(o, o.start, o.stop), opts = optsOf(o, t), pending = o.state === "pending", withId = o.withId ?? null;
  const id = typeof o.id === "string" ? o.id.toLowerCase() : "", who = text(o.who, 40), role = ["asked", "answered"].includes(o.role) ? o.role : null;
  if (!plan || !plan.tz || !UUID_RE.test(id) || !who || !role || !opts || (pending && role !== "asked")
    || (withId !== null && (typeof withId !== "string" || !withId || withId.length > 64))) throw new HttpError(400, "Bad request.");
  if (plan.end <= t) throw new HttpError(409, "That time has passed.");
  const D = await offersDb(env), once = role === "asked" && !pending;
  const until = pending ? Math.max(plan.end, ...opts.map((x) => x[1])) : plan.end + OFFER_KEEP;
  const room = pending
    ? `(SELECT COUNT(*) FROM fx_offers WHERE user_id = ?1 AND state = 'pending' AND until > ?14) < ${PENDING_MAX}`
    : `(SELECT COUNT(*) FROM fx_offers WHERE user_id = ?1 AND state = 'new' AND role != 'today' AND until > ?14) < ${OFFERS_MAX}`;
  const [, ins] = await D.batch([
    D.prepare("DELETE FROM fx_offers WHERE until < ?").bind(t),
    D.prepare(`INSERT OR IGNORE INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, far, dry, state, made, until, with_id, opts)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?18, ?14, ?15, ?16, ?17
      WHERE ${room}${once ? " AND NOT EXISTS (SELECT 1 FROM fx_offers WHERE user_id = ?1 AND start = ?3 AND stop = ?4 AND state IN ('new', 'yes') AND (with_id = ?16 OR who = ?10))" : ""}`)
      .bind(userId, id, plan.start, plan.end, plan.tz, plan.sport, plan.wid, plan.name, plan.secs, who, role, plan.far ? 1 : 0, plan.dry ? 1 : 0, t, until,
        withId, pending && opts.length ? JSON.stringify(opts) : null, pending ? "pending" : "new"),
  ]);
  if (ins?.meta?.changes) return;
  if (await D.prepare("SELECT 1 FROM fx_offers WHERE user_id = ? AND id = ?").bind(userId, id).first()) return;
  if (once && await D.prepare(`SELECT 1 FROM fx_offers WHERE user_id = ? AND ${SAME}`).bind(userId, plan.start, plan.end, withId, who).first()) return;
  throw new HttpError(409, pending ? "Chat has 20 invites waiting for an answer already." : "Fitness has 20 plans waiting already.");
}
// A ride Today adds (its habit rule at do: state "yes", taken 0, holding nothing until a tap keeps it) or offers (at
// suggest: state "new"), in the account's own Fitness: { start, stop, tz, sport, wid, name, secs, dry?, state }, the
// times as an invite's plan has them; role "today", who "". (was, what the day had before, is the act's, kept by the
// caller in td_acts: nothing of it here.) 10 of Today's waiting at most. { t } is needed. → its new id
export async function addTodayOffer(env, uid, o, { t } = {}) {
  need(t, "addTodayOffer");
  const x = o && typeof o === "object" ? o : {}, plan = planOf(x, x.start, x.stop), state = ["yes", "new"].includes(x.state) ? x.state : null;
  if (!plan || !plan.tz || !state) throw new HttpError(400, "Bad request.");
  if (plan.end <= t) throw new HttpError(409, "That time has passed.");
  const D = await offersDb(env), id = crypto.randomUUID();
  const [, ins] = await D.batch([
    D.prepare("DELETE FROM fx_offers WHERE until < ?").bind(t),
    D.prepare(`INSERT INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, far, dry, state, made, until, taken)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '', 'today', 0, ?10, ?11, ?12, ?13, 0
      WHERE (SELECT COUNT(*) FROM fx_offers WHERE user_id = ?1 AND role = 'today' AND state IN ('new', 'yes') AND until > ?12) < ${TODAY_OFFERS_MAX}`)
      .bind(uid, id, plan.start, plan.end, plan.tz, plan.sport, plan.wid, plan.name, plan.secs, plan.dry ? 1 : 0, state, t, plan.end + OFFER_KEEP),
  ]);
  if (!ins?.meta?.changes) throw new HttpError(409, "Today has 10 rides waiting already.");
  return id;
}
// One of Today's own rides moved (its clash rule, or Undo putting it back): only a role "today" row still new or agreed,
// and with expect ({ start, stop }, or [start, stop]; and state, where given) only while it's still just that (Undo's
// check: changed in Fitness since, it isn't touched). 15 minutes to 6 hours long. { t } is needed. → whether it changed
export async function setOfferTimes(env, uid, id, start, stop, { expect, t } = {}) {
  return !!(await (await setOfferTimesQ(env, uid, id, start, stop, { expect, t })).run()).meta?.changes;
}
// (the same, as the statement alone, for the caller's own D.batch: Undo puts the ride back and its act's row in one)
export async function setOfferTimesQ(env, uid, id, start, stop, { expect, t } = {}) {
  need(t, "setOfferTimes");
  const key = typeof id === "string" ? id.toLowerCase() : "";
  if (!UUID_RE.test(key) || !Number.isSafeInteger(start) || !Number.isSafeInteger(stop) || stop - start < 15 * MIN || stop - start > 6 * HOUR) throw new HttpError(400, "Bad request.");
  const ex = expectOf(expect), D = await offersDb(env);
  return D.prepare(`UPDATE fx_offers SET start = ?1, stop = ?2, until = ?3 WHERE user_id = ?4 AND id = ?5 AND role = 'today' AND state IN ('new', 'yes') AND until > ?6${expectSql(ex, 7)}`)
    .bind(start, stop, stop + OFFER_KEEP, uid, key, t, ...expectArgs(ex));
}
// Take (a suggested ride) or Keep (one added at do), on Today: a role "today" row still new or agreed, agreed now and
// kept by a tap (taken 1). { t } is needed. → whether it was there
export async function takeOffer(env, uid, id, { t } = {}) {
  need(t, "takeOffer");
  const key = typeof id === "string" ? id.toLowerCase() : "";
  if (!UUID_RE.test(key)) throw new HttpError(400, "Bad request.");
  const D = await offersDb(env);
  const r = await D.prepare("UPDATE fx_offers SET state = 'yes', taken = 1 WHERE user_id = ? AND id = ? AND role = 'today' AND state IN ('new', 'yes') AND until > ?")
    .bind(uid, key, t).run();
  return !!r.meta?.changes;
}
// The friend's Yes to an invite, from their own phone (functions/_share.js POST fit-offer with re): the inviter's pending
// row (id re) for that friend alone (with_id the answerer), at its own time or one of its opts, becomes a plan waiting
// in their Fitness (new) at the time chosen, kept 12 hours past it, with the inviter's phone shut. Not where the same
// ride with the same friend is there already; never once its time has passed. { t } is needed. → whether it changed
// (bad input: false)
export async function promoteOffer(env, inviterId, re, answererId, start, stop, { t } = {}) {
  need(t, "promoteOffer");
  const id = typeof re === "string" ? re.toLowerCase() : "";
  if (!UUID_RE.test(id) || typeof answererId !== "string" || !answererId || !Number.isSafeInteger(start) || !Number.isSafeInteger(stop) || stop <= start) return false;
  const D = await offersDb(env);
  const r = await D.prepare(`UPDATE fx_offers SET state = 'new', start = ?4, stop = ?5, until = ?6, opts = NULL
    WHERE user_id = ?1 AND id = ?2 AND state = 'pending' AND with_id = ?3 AND until > ?7 AND ?5 > ?7
      AND ((start = ?4 AND stop = ?5) OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(fx_offers.opts) THEN fx_offers.opts ELSE '[]' END) j
        WHERE json_extract(j.value, '$[0]') = ?4 AND json_extract(j.value, '$[1]') = ?5))
      AND NOT EXISTS (SELECT 1 FROM fx_offers d WHERE d.user_id = ?1 AND d.id != ?2 AND d.start = ?4 AND d.stop = ?5 AND d.state IN ('new', 'yes')
        AND (d.with_id = ?3 OR d.who = fx_offers.who))`).bind(inviterId, id, answererId, start, stop, stop + OFFER_KEEP, t).run();
  return !!r.meta?.changes;
}
// (an offer as Fitness has always been sent it; and as Today reads it, and Fitness when it asks for Today's: with whether
// a tap kept it, and the friend's id)
const offerView = (r) => ({ id: r.id, start: r.start, stop: r.stop, sport: r.sport, wid: r.wid, name: r.name, secs: r.secs, who: r.who, role: r.role, far: !!r.far, dry: !!r.dry, state: r.state });
const offerViewToday = (r) => ({ ...offerView(r), taken: !!r.taken, withId: r.with_id ?? null });
// The account's offers for Fitness to show: waiting (new) and agreed (yes), not past their time, never one pending, each
// exactly as Fitness has always had them. With today: true (Today's reads, and Fitness's ?today=1), Today's own (role
// "today") too, each with taken and withId; then { t } is needed. Read only (nothing's deleted on a read)
export async function offersFor(env, userId, { today = false, t } = {}) {
  const at = today ? need(t, "offersFor") : Number.isFinite(t) ? t : Date.now();
  try {
    const D = await offersDb(env);
    const { results } = await D.prepare(`SELECT id, start, stop, sport, wid, name, secs, who, role, far, dry, state, taken, with_id FROM fx_offers
      WHERE user_id = ? AND until > ? AND state IN ('new', 'yes')${today ? "" : " AND role != 'today'"} ORDER BY start, id LIMIT 50`).bind(userId, at).all();
    return (results || []).map(today ? offerViewToday : offerView);
  } catch (_) { return []; }
}
// (an answer's UPDATE: only a plan still waiting is answered (the same answer again changes nothing): a no never comes
// back as a yes, and a yes is a no only for one of Today's own (Undo, in Fitness); a pending row is never answered here;
// with expect, only while the row is still just that)
function answerSql(D, userId, id, answer, t, ex) {
  return D.prepare(`UPDATE fx_offers SET state = ?1, taken = CASE WHEN ?1 = 'yes' THEN 1 ELSE taken END
      WHERE user_id = ?2 AND id = ?3 AND until > ?4 AND (state = 'new' OR state = ?1 OR (role = 'today' AND state = 'yes' AND ?1 = 'no'))${expectSql(ex, 5)}`)
    .bind(answer, userId, id, t, ...expectArgs(ex));
}
const answerOk = (id, answer) => { if (!["yes", "no"].includes(answer) || typeof id !== "string" || !UUID_RE.test(id)) throw new HttpError(400, "Bad request."); };
// Fitness's answer to one: "yes" (added to the plan there, a tap: taken) or "no"; with expect ({ start, stop, state }),
// only while the row is still just that (Today's Undo of a ride it added: changed in Fitness since, it isn't touched).
// → whether it was there (and changed)
export async function answerOffer(env, userId, id, answer, { t = Date.now(), expect } = {}) {
  answerOk(id, answer);
  const ex = expectOf(expect), D = await offersDb(env);
  const [, r] = await D.batch([D.prepare("DELETE FROM fx_offers WHERE until < ?").bind(t), answerSql(D, userId, id, answer, t, ex)]);
  return !!r?.meta?.changes;
}
// (the same, as the statement alone, for the caller's own D.batch; { t } is needed)
export async function answerOfferQ(env, userId, id, answer, { t, expect } = {}) {
  need(t, "answerOffer");
  answerOk(id, answer);
  const ex = expectOf(expect), D = await offersDb(env);
  return answerSql(D, userId, id, answer, t, ex);
}
// fx_offers made, and its Today First columns there, before a caller reads them with its own SQL (EXPLICIT_OFFER,
// with_id, taken). → the database
export const offersReady = (env) => offersDb(env);

// ---- the account's export, and an account gone ----
export async function sharesOf(env, userId) {
  try {
    const D = await fitdb(env);
    return ((await D.prepare("SELECT day, sport, until FROM fx_shares WHERE user_id = ? ORDER BY made").bind(userId).all()).results || []).map((r) => ({ day: r.day, sport: r.sport, until: r.until }));
  } catch (_) { return []; }
}
export async function offersOf(env, userId) {
  try {
    const D = await fitdb(env);
    return ((await D.prepare("SELECT start, name, who, state FROM fx_offers WHERE user_id = ? ORDER BY start").bind(userId).all()).results || []).map((r) => ({ start: r.start, name: r.name, who: r.who, state: r.state }));
  } catch (_) { return []; }
}
export async function dropShares(env, userId) {
  const D = await fitdb(env);
  for (const t of ["fx_shares", "fx_offers"]) await D.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId).run().catch(() => {});
}
