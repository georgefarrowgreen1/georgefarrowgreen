/* ---------- what the admin sees of how Chat is used ----------
   Counts only: how many people use it and come back, how many pigeons fly, which kinds and features, and whether
   pigeons are landing on time. Never who sent what to whom, never a word, a place or a route: every figure is
   a total over everyone (and the admin panel is the site owner's alone).

   Days are London days. "Active" on a day is anyone who sent a pigeon or opened one that day; "active" over a
   stretch (today, this week) is anyone whose app checked in (pg_users.seen_at, or a session's). "Came back after
   a week" is an account whose last visit was at least a week after it was made, of those made more than 8 days
   ago. A message is in pg_msgs / pg_gmsgs until 30 days after it lands, then one line per pigeon in pg_flights
   (functions/_retention.js), so the last 30 days are the live tables plus anything already moved over. */
import { DAY, MIN, londonOffset } from "./_pigeon.js";

export const SPAN = 30;           // days of history shown
export async function insights(env, D, t = Date.now()) {
  const off = londonOffset(t), today = Math.floor((t + off) / DAY), first = today - (SPAN - 1);
  // London midnight, SPAN - 1 days ago (by the offset then: the clocks may have changed since)
  const offThen = londonOffset(first * DAY - off), from = first * DAY - offThen;
  // the moment the clocks changed in between, if they did (found to the minute), so each row is put on its own
  // London day: before it by the old offset, after it by the new
  let lo = from, hi = t;
  if (offThen !== off) while (hi - lo > MIN) { const mid = Math.floor((lo + hi) / 2); if (londonOffset(mid) === offThen) lo = mid; else hi = mid; }
  const day = (col) => `CAST((${col} + CASE WHEN ${col} < ?4 THEN ?2 ELSE ?3 END) / ${DAY} AS INTEGER)`;
  const seen = `MAX(COALESCE(u.seen_at, 0), COALESCE((SELECT MAX(s.seen_at) FROM pg_sessions s WHERE s.user_id = u.id), 0))`;
  const kindOf = `COALESCE(pigeon, CASE WHEN swift = 1 THEN 'swift' ELSE 'standard' END)`;
  const q = (sql, ...a) => D.prepare(sql).bind(...a);
  const [people, cohorts, sends, active, joins, kinds, solo, grp, adopt, health] = (await D.batch([
    q(`SELECT COUNT(*) AS n, SUM(ls >= ?1 - ${DAY}) AS d1, SUM(ls >= ?1 - ${7 * DAY}) AS d7, SUM(ls >= ?1 - ${30 * DAY}) AS d30,
         SUM(created_at <= ?1 - ${8 * DAY}) AS old, SUM(created_at <= ?1 - ${8 * DAY} AND ls >= created_at + ${7 * DAY}) AS back
       FROM (SELECT u.created_at, ${seen} AS ls FROM pg_users u)`, t),
    // by the week they joined (1 = 7–13 days ago … 6), how many came back a week on; and, for those who joined
    // since days used were first noted (pg_active), how many used it in their second week (days 7 to 13)
    q(`SELECT CAST((?1 - created_at) / ${7 * DAY} AS INTEGER) AS wk, COUNT(*) AS n, SUM(ls >= created_at + ${7 * DAY}) AS back,
         SUM(jd >= (SELECT MIN(day) FROM pg_active)) AS known, SUM(jd >= (SELECT MIN(day) FROM pg_active) AND EXISTS (SELECT 1 FROM pg_active a WHERE a.user_id = id AND a.day BETWEEN jd + 7 AND jd + 13)) AS wk2
       FROM (SELECT u.id, u.created_at, ${seen} AS ls, CAST((u.created_at + ?2) / ${DAY} AS INTEGER) AS jd FROM pg_users u
         WHERE u.created_at <= ?1 - ${7 * DAY} AND u.created_at > ?1 - ${49 * DAY}) GROUP BY wk ORDER BY wk`, t, off),
    // pigeons sent each day (a group pigeon counts once), and by how many people
    q(`SELECT ${day("sent_at")} AS d, COUNT(*) AS n, COUNT(DISTINCT sender) AS who FROM (
         SELECT sender, sent_at FROM pg_msgs WHERE sent_at >= ?1
         UNION ALL SELECT sender, sent_at FROM pg_gmsgs WHERE sent_at >= ?1
         UNION ALL SELECT sender, sent_at FROM pg_flights WHERE sent_at >= ?1 AND grp = 0
         UNION ALL SELECT sender, MIN(sent_at) FROM pg_flights WHERE sent_at >= ?1 AND grp = 1 GROUP BY msg_id) GROUP BY d`, from, offThen, off, hi),
    // people active each day: opened the app (pg_active, from when it began to be noted), sent a pigeon, or opened one
    q(`SELECT d, COUNT(DISTINCT u) AS n FROM (
         SELECT day AS d, user_id AS u FROM pg_active WHERE day >= ?5
         UNION SELECT d, u FROM (                       -- (nested: D1 allows five parts to one compound)
         SELECT ${day("sent_at")} AS d, sender AS u FROM pg_msgs WHERE sent_at >= ?1
         UNION SELECT ${day("read_at")}, recipient FROM pg_msgs WHERE read_at >= ?1
         UNION SELECT ${day("sent_at")}, sender FROM pg_gmsgs WHERE sent_at >= ?1
         UNION SELECT ${day("read_at")}, user_id FROM pg_gdeliv WHERE read_at >= ?1
         UNION SELECT ${day("sent_at")}, sender FROM pg_flights WHERE sent_at >= ?1)) GROUP BY d`, from, offThen, off, hi, first),
    q(`SELECT ${day("created_at")} AS d, COUNT(*) AS n FROM pg_users WHERE created_at >= ?1 GROUP BY d`, from, offThen, off, hi),
    q(`SELECT k, COUNT(*) AS n FROM (SELECT ${kindOf} AS k FROM pg_msgs WHERE sent_at >= ?1
         UNION ALL SELECT pigeon FROM pg_gmsgs WHERE sent_at >= ?1
         UNION ALL SELECT COALESCE(pigeon, 'standard') FROM pg_flights WHERE sent_at >= ?1 AND grp = 0
         UNION ALL SELECT MIN(COALESCE(pigeon, 'standard')) FROM pg_flights WHERE sent_at >= ?1 AND grp = 1 GROUP BY msg_id) GROUP BY k ORDER BY n DESC`, from),
    q(`SELECT COUNT(*) AS n, SUM(photo != 0) AS photo, SUM(COALESCE(mystery, 0) != 0) AS mystery, SUM(sched IS NOT NULL) AS sched, SUM(via IS NOT NULL) AS via,
         SUM(cheer_by IS NOT NULL) AS cheered, SUM(moon IS NOT NULL) AS space, SUM(COALESCE(recalled, 0) = 1) AS recalled, SUM(lost_at IS NOT NULL AND COALESCE(recalled, 0) = 0) AS lost,
         SUM(COALESCE(vanish, 0) > 0) AS vanish, SUM(style IS NOT NULL) AS styled, SUM(COALESCE(risky, 0) = 1) AS risky FROM pg_msgs WHERE sent_at >= ?1`, from),
    q(`SELECT COUNT(*) AS n, SUM(photo != 0) AS photo, SUM(COALESCE(mystery, 0) != 0) AS mystery, SUM(COALESCE(vanish, 0) > 0) AS vanish,
         SUM(style IS NOT NULL) AS styled, SUM(COALESCE(risky, 0) = 1) AS risky FROM pg_gmsgs WHERE sent_at >= ?1`, from),
    q(`SELECT (SELECT COUNT(DISTINCT user_id) FROM pg_passkeys) AS passkey, (SELECT COUNT(DISTINCT user_id) FROM pg_push) AS push,
         (SELECT COUNT(*) FROM pg_users WHERE email_ok IS NOT NULL) AS email, (SELECT COUNT(*) FROM pg_users WHERE COALESCE(risky, 0) = 1) AS risky,
         (SELECT COUNT(*) FROM pg_users WHERE COALESCE(loc_approx, 0) = 1) AS approx, (SELECT COUNT(*) FROM pg_users WHERE moon IS NOT NULL) AS space,
         (SELECT COUNT(DISTINCT owner) FROM pg_birds) AS birds,
         (SELECT COUNT(*) FROM pg_users u WHERE EXISTS (SELECT 1 FROM pg_links l WHERE l.status = 'ok' AND (l.a = u.id OR l.b = u.id))) AS friends,
         (SELECT COUNT(DISTINCT x) FROM (SELECT created_by AS x FROM pg_groups UNION SELECT user_id FROM pg_gdeliv)) AS groups`),
    // pigeons landing on time: in the air now, landed and lost today, and any landed 15+ minutes ago whose
    // landing nobody has been told of yet (the tick should do that within a minute or two)
    q(`SELECT (SELECT COUNT(*) FROM pg_msgs WHERE deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1) AND sent_at <= ?1)
           + (SELECT COUNT(*) FROM pg_gdeliv WHERE deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)) AS flying,
         (SELECT COUNT(*) FROM pg_msgs WHERE deliver_at BETWEEN ?1 - ${DAY} AND ?1 AND lost_at IS NULL) + (SELECT COUNT(*) FROM pg_gdeliv WHERE deliver_at BETWEEN ?1 - ${DAY} AND ?1 AND lost_at IS NULL) AS landed,
         (SELECT COUNT(*) FROM pg_msgs WHERE lost_at BETWEEN ?1 - ${DAY} AND ?1 AND COALESCE(recalled, 0) = 0)
           + (SELECT COUNT(*) FROM pg_gdeliv WHERE lost_at BETWEEN ?1 - ${DAY} AND ?1 AND COALESCE(recalled, 0) = 0) AS lost,
         (SELECT COUNT(*) FROM pg_msgs WHERE notified_at IS NULL AND lost_at IS NULL AND deliver_at BETWEEN ?1 - ${2 * DAY} AND ?1 - ${15 * MIN})
           + (SELECT COUNT(*) FROM pg_gdeliv WHERE notified_at IS NULL AND lost_at IS NULL AND deliver_at BETWEEN ?1 - ${2 * DAY} AND ?1 - ${15 * MIN}) AS late`, t),
  ])).map((r) => r.results || []);

  // one entry per day, oldest first, with the days nothing happened as 0
  const series = (rows, k = "n") => { const m = new Map(rows.map((r) => [r.d, r[k] || 0])); return Array.from({ length: SPAN }, (_, i) => m.get(first + i) || 0); };
  const P = people[0] || {}, S = solo[0] || {}, G = grp[0] || {}, A = adopt[0] || {}, H = health[0] || {};
  const sum = (a, b) => (a || 0) + (b || 0);
  return {
    at: t, span: SPAN, firstDay: from, people: { total: P.n || 0, today: P.d1 || 0, week: P.d7 || 0, month: P.d30 || 0 },
    retention: { old: P.old || 0, back: P.back || 0,
      // (secondWeek: only for a second week that's over, for everyone in it)
      weeks: cohorts.map((c) => ({ weeksAgo: c.wk, joined: c.n, back: c.back || 0, ...(c.wk >= 2 && c.known === c.n ? { secondWeek: c.wk2 || 0 } : {}) })) },
    days: { sent: series(sends), senders: series(sends, "who"), active: series(active), joined: series(joins) },
    kinds: kinds.map((k) => ({ kind: k.k || "standard", n: k.n })),
    features: { total: sum(S.n, G.n), group: G.n || 0, photo: sum(S.photo, G.photo), mystery: sum(S.mystery, G.mystery), sched: S.sched || 0, via: S.via || 0,
      cheered: S.cheered || 0, space: S.space || 0, recalled: S.recalled || 0, vanish: sum(S.vanish, G.vanish), styled: sum(S.styled, G.styled), risky: sum(S.risky, G.risky), lost: S.lost || 0 },
    adoption: { passkey: A.passkey || 0, push: A.push || 0, email: A.email || 0, risky: A.risky || 0, approx: A.approx || 0, space: A.space || 0, birds: A.birds || 0, friends: A.friends || 0, groups: A.groups || 0 },
    health: { flying: H.flying || 0, landed: H.landed || 0, lost: H.lost || 0, late: H.late || 0 },
  };
}
