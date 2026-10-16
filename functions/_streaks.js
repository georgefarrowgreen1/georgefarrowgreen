// Flight streaks: how many days in a row a pigeon has taken off between two
// friends, either way. Days are UTC days, the same for both of you wherever you
// are; a streak is still alive the day after its last pigeon, and ends at the
// midnight after that. Three hours before then, both of you hear about it once.
//
// Stored per pair (a < b): the day the run started, its latest day, the best run.

import { DAY, HOUR } from "./_pigeon.js";
import { pushTo, prefsOf, isQuiet } from "./_notify.js";
import { ensureFeathers, earn, STREAK_FEATHERS } from "./_feathers.js";

export const STREAK_MIN = 3;            // a flame from three days in a row
const WARN = 3 * HOUR;                  // the reminder: this long before it ends
export const dayOf = (t) => Math.floor(t / DAY);
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "Someone";

// Streaks from before this existed, worked out once from every pigeon so far
// (runs of consecutive days per pair; each pair keeps its latest and its best).
let ready = false;
export async function ensureStreaks(D) { return ensure(D); }
async function ensure(D) {
  if (ready) return;
  if (!(await D.prepare("SELECT 1 FROM pg_meta WHERE k = 'streaks_v1'").first())) {
    await D.prepare(`WITH d AS (SELECT DISTINCT MIN(sender, recipient) AS a, MAX(sender, recipient) AS b, sent_at / ${DAY} AS day FROM pg_msgs WHERE sent_at <= ?1),
      r AS (SELECT a, b, day, day - ROW_NUMBER() OVER (PARTITION BY a, b ORDER BY day) AS g FROM d),
      i AS (SELECT a, b, MIN(day) AS s, MAX(day) AS l, COUNT(*) AS n FROM r GROUP BY a, b, g)
      INSERT OR IGNORE INTO pg_streaks (a, b, start, last, best)
      SELECT a, b, s, l, (SELECT MAX(n) FROM i AS j WHERE j.a = i.a AND j.b = i.b) FROM i WHERE l = (SELECT MAX(l) FROM i AS j WHERE j.a = i.a AND j.b = i.b)`).bind(Date.now()).run();
    await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('streaks_v1', '1')").run();
  }
  ready = true;
}

// A pigeon took off between x and y: today joins the run, or starts a new one.
// (SQLite reads the old row for every SET, so these all see the run as it was.)
export async function bumpStreak(D, x, y, t) {
  await ensure(D);
  const [a, b] = pair(x, y), d = dayOf(t);
  await D.prepare(`INSERT INTO pg_streaks (a, b, start, last, best) VALUES (?1, ?2, ?3, ?3, 1)
    ON CONFLICT(a, b) DO UPDATE SET
      start = CASE WHEN last >= ?3 - 1 THEN start ELSE ?3 END,
      best = MAX(best, CASE WHEN last >= ?3 - 1 THEN MAX(last, ?3) - start + 1 ELSE 1 END),
      last = MAX(last, ?3)`).bind(a, b, d).run();
  // a week, a month, a hundred days: feathers for you both
  const r = await D.prepare("SELECT start, last FROM pg_streaks WHERE a = ? AND b = ?").bind(a, b).first(), n = r ? r.last - r.start + 1 : 0;
  if (STREAK_FEATHERS[n] && r.last === d) {
    await ensureFeathers(D);
    await D.batch([a, b].map((x) => earn(D, x, `s:${a}:${b}:${r.start}:${n}`, STREAK_FEATHERS[n], "streak:" + n, t)));
  }
}

// What the app shows: the run (0 once it's over), whether today is done, when it ends, the best
export function streakView(r, t) {
  if (!r) return null;
  const today = dayOf(t), alive = r.last >= today - 1, n = alive ? r.last - r.start + 1 : 0;
  return { n, today: r.last >= today, endsAt: (r.last + 2) * DAY, best: Math.max(r.best || 0, n) };
}
export async function streaksFor(D, uid, t) {
  await ensure(D);
  const { results } = await D.prepare("SELECT * FROM pg_streaks WHERE a = ?1 OR b = ?1").bind(uid).all();
  return new Map(results.map((r) => [r.a === uid ? r.b : r.a, streakView(r, t)]));
}
export async function streakBetween(D, x, y, t) {
  const [a, b] = pair(x, y);
  return streakView(await D.prepare("SELECT * FROM pg_streaks WHERE a = ? AND b = ?").bind(a, b).first(), t);
}

// Three hours before a streak of three or more ends with nothing sent today: tell you both, once
export async function streakTick(env, D, t) {
  await ensure(D);
  const today = dayOf(t);
  if (env.PIGEON_STREAK_ANYTIME !== "1" && t < (today + 1) * DAY - WARN) return 0;     // (PIGEON_STREAK_ANYTIME: local testing only)
  let pushes = 0;
  const { results } = await D.prepare(`SELECT s.*, ua.name AS a_name, ua.notify_prefs AS a_prefs, ub.name AS b_name, ub.notify_prefs AS b_prefs
    FROM pg_streaks s JOIN pg_users ua ON ua.id = s.a JOIN pg_users ub ON ub.id = s.b
    WHERE s.last = ?1 AND s.last - s.start + 1 >= ?2 AND COALESCE(s.warned, -1) < s.last LIMIT 200`).bind(today - 1, STREAK_MIN).all();
  for (const r of results) {
    const claimed = await D.prepare("UPDATE pg_streaks SET warned = ?1 WHERE a = ?2 AND b = ?3 AND COALESCE(warned, -1) < ?1").bind(r.last, r.a, r.b).run();
    if (!claimed.meta.changes) continue;
    const friends = await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(r.a, r.b).first();
    if (!friends) continue;
    const n = r.last - r.start + 1, hrs = Math.max(1, Math.round(((today + 1) * DAY - t) / HOUR));
    for (const [me, them, themName, prefs] of [[r.a, r.b, r.b_name, r.a_prefs], [r.b, r.a, r.a_name, r.b_prefs]]) {
      const p = prefsOf({ notify_prefs: prefs }); if (!p.streaks || isQuiet(p, t)) continue;
      pushes += await pushTo(env, me, { title: "Keep your streak going",
        body: p.names ? `Your ${n}-day streak with ${firstName(themName)} ends in ${hrs} hour${hrs === 1 ? "" : "s"}. Send a pigeon to keep it alive.` : `One of your ${n}-day streaks ends in ${hrs} hour${hrs === 1 ? "" : "s"}. Send a pigeon to keep it alive.`,
        tag: "streak-" + them, url: `/pigeon/#open=${them}` });
    }
  }
  return pushes;
}
