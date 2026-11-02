// Fitness and Chat's "Send to a friend": what the server keeps for it, and only this, each in the account's own rows.
//
// fx_shares: a session sent to friends from Chat (made when Send is tapped, never before: functions/_share.js POST
//   fit-share), so a friend's Chat can say whether it got done. Only what that look needs: whose, which day (in which
//   zone) and which sport. No workout's name, id or length, no letter, no friend. Kept 72 hours past the end of its day,
//   then deleted as the next is made; all of an account's go with it (functions/_fitness.js dropFitness).
// fx_offers: plans agreed in Chat (a Yes to a ride or run together), each person's own Fitness inbox: put in by their
//   own Chat (POST fit-offer), shown in Fitness, which adds it to the plan only when the person says so there. Nothing
//   here ever edits a Fitness record (fx_state). Kept until 12 hours after the plan's end.
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
// (what's done in a window: in Fitness, and waiting to come in from Garmin or Strava, whose tables may not be made yet)
const doneQs = (D, userId, start, end) => [
  D.prepare("SELECT id, start, sport, name, sum FROM fx_acts WHERE user_id = ?1 AND start >= ?2 AND start < ?3 ORDER BY start DESC LIMIT 5").bind(userId, start, end),
  D.prepare("SELECT id, start, name FROM fx_garmin_new WHERE user_id = ?1 AND start >= ?2 AND start < ?3 ORDER BY start DESC LIMIT 5").bind(userId, start, end),
  D.prepare("SELECT id, start, name, sport FROM fx_strava_new WHERE user_id = ?1 AND start >= ?2 AND start < ?3 ORDER BY start DESC LIMIT 5").bind(userId, start, end),
];
const rowsOf = ([acts, garmin, strava]) => [
  ...(acts || []).map((a) => { const s = sumOf(a.sum); return { name: a.name || "Activity", sport: a.sport || null, start: a.start, secs: num(s.secs), dist: num(s.dist), tss: num(s.tss), from: "fitness" }; }),
  ...(garmin || []).map((g) => ({ name: g.name || "Activity", sport: null, start: g.start, secs: null, dist: null, tss: null, from: "garmin" })),
  ...(strava || []).map((a) => ({ name: a.name || "Activity", sport: a.sport || null, start: a.start, secs: null, dist: null, tss: null, from: "strava" })),
].sort((a, b) => b.start - a.start);
// Several windows' queries in one trip (a friend's look at several sessions); where Garmin's or Strava's table isn't made
// yet, Fitness's own in one, and the others each where it is. → for each window, [acts, garmin, strava] rows
async function doneMany(D, wins) {
  if (!wins.length) return [];
  const qs = wins.flatMap((w) => doneQs(D, w.userId, w.start, w.end));
  try {
    const r = await D.batch(qs);
    return wins.map((_, i) => [0, 1, 2].map((j) => r[i * 3 + j]?.results || []));
  } catch (_) {
    const part = async (j) => { try { return (await D.batch(qs.filter((_, k) => k % 3 === j))).map((x) => x.results || []); } catch (e) { if (j === 0) throw e; return wins.map(() => []); } };
    const a = await part(0), g = await part(1), s = await part(2);
    return wins.map((_, i) => [a[i], g[i], s[i]]);
  }
}
// Everything done in a window, newest first: { name, sport, start, secs, dist, tss, from } (null where not known), as
// InFlite Today's Fitness card shows it (functions/_todayfit.js)
export async function donesIn(env, userId, start, end) {
  const D = await fitdb(env), [acts, garmin, strava] = doneQs(D, userId, start, end);
  return rowsOf(await Promise.all([acts.all().then((r) => r.results || []), garmin.all().then((r) => r.results || []).catch(() => []), strava.all().then((r) => r.results || []).catch(() => [])]));
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

// ---- plans from Chat ----
const text = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
// An offer put in the account's own Fitness, as its Chat sends it: { id, start, stop, tz, sport, wid, name, secs, who,
// role, far, dry }, checked as an invite's plan is (functions/_share.js POST fit-offer). The same id again changes
// nothing (one answered stays answered); 20 waiting at most.
export async function addOffer(env, userId, offer) {
  const o = offer && typeof offer === "object" ? offer : {}, t = Date.now();
  const plan = normPlan({ sport: o.sport, wid: o.wid, name: o.name, secs: o.secs, start: o.start, end: o.stop, tz: o.tz, dry: o.dry === true, far: o.far === true });
  const id = typeof o.id === "string" ? o.id.toLowerCase() : "", who = text(o.who, 40), role = ["asked", "answered"].includes(o.role) ? o.role : null;
  if (!plan || !plan.tz || !UUID_RE.test(id) || !who || !role) throw new HttpError(400, "Bad request.");
  if (plan.end <= t) throw new HttpError(409, "That time has passed.");
  const D = await offersDb(env);
  const [, ins] = await D.batch([
    D.prepare("DELETE FROM fx_offers WHERE until < ?").bind(t),
    D.prepare(`INSERT OR IGNORE INTO fx_offers (user_id, id, start, stop, tz, sport, wid, name, secs, who, role, far, dry, state, made, until)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'new', ?14, ?15
      WHERE (SELECT COUNT(*) FROM fx_offers WHERE user_id = ?1 AND state = 'new' AND until > ?14) < ${OFFERS_MAX}`)
      .bind(userId, id, plan.start, plan.end, plan.tz, plan.sport, plan.wid, plan.name, plan.secs, who, role, plan.far ? 1 : 0, plan.dry ? 1 : 0, t, plan.end + OFFER_KEEP),
  ]);
  if (ins?.meta?.changes) return;
  if (await D.prepare("SELECT 1 FROM fx_offers WHERE user_id = ? AND id = ?").bind(userId, id).first()) return;
  throw new HttpError(409, "Fitness has 20 plans waiting already.");
}
const offerView = (r) => ({ id: r.id, start: r.start, stop: r.stop, sport: r.sport, wid: r.wid, name: r.name, secs: r.secs, who: r.who, role: r.role, far: !!r.far, dry: !!r.dry, state: r.state });
// The account's offers for Fitness to show: waiting (new) and agreed (yes), not past their time; read only (nothing's
// deleted on a read)
export async function offersFor(env, userId) {
  try {
    const D = await fitdb(env);
    const { results } = await D.prepare("SELECT id, start, stop, sport, wid, name, secs, who, role, far, dry, state FROM fx_offers WHERE user_id = ? AND until > ? AND state IN ('new', 'yes') ORDER BY start, id LIMIT 50").bind(userId, Date.now()).all();
    return (results || []).map(offerView);
  } catch (_) { return []; }
}
// Fitness's answer to one: "yes" (added to the plan there) or "no". → whether it was there
export async function answerOffer(env, userId, id, answer) {
  if (!["yes", "no"].includes(answer) || typeof id !== "string" || !UUID_RE.test(id)) throw new HttpError(400, "Bad request.");
  const D = await offersDb(env), t = Date.now();
  const [, r] = await D.batch([
    D.prepare("DELETE FROM fx_offers WHERE until < ?").bind(t),
    // only a plan still waiting is answered (the same answer again changes nothing): a no never comes back as a yes
    D.prepare("UPDATE fx_offers SET state = ? WHERE user_id = ? AND id = ? AND until > ? AND (state = 'new' OR state = ?)").bind(answer, userId, id, t, answer),
  ]);
  return !!r?.meta?.changes;
}

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
