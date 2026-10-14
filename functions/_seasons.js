/* ---------- seasonal pigeons ----------
   A few weeks a year each season has its own look for your pigeons, there
   for anyone to wear while it lasts. Send ten pigeons during the season and
   it's yours to keep (with its badge); otherwise it goes when the season does,
   and comes back next year. Dates are UTC days, the same everywhere. */

// [id, look, badge id, badge name, from [month, day], to [month, day]] (winter runs over New Year)
export const SEASONS = [
  ["spring", "Blossom", "migration", "Spring Migration", [3, 20], [4, 30]],
  ["summer", "Sunny", "summer", "Summer Flyer", [6, 21], [8, 31]],
  ["autumn", "Russet", "autumn", "Autumn Leaves", [10, 1], [11, 15]],
  ["winter", "Frosty", "winter", "Winter Wings", [12, 1], [1, 6]],
];
export const SEASON_GOAL = 10;
const DAY = 864e5;
// The stretch of a season that a moment falls in (or null): its start, its end (exclusive), and a key for that year's
function windowOf(s, t) {
  const y = new Date(t).getUTCFullYear(), [, , , , [fm, fd], [tm, td]] = s;
  for (const sy of [y - 1, y]) {
    const from = Date.UTC(sy, fm - 1, fd), to = Date.UTC(tm < fm ? sy + 1 : sy, tm - 1, td) + DAY;
    if (t >= from && t < to) return { from, to, key: `${s[0]}:${sy}` };
  }
  return null;
}
// The season on now, if any
export function seasonAt(t) {
  for (const s of SEASONS) { const w = windowOf(s, t); if (w) return { id: s[0], look: s[1], badge: s[2], badgeName: s[3], ...w }; }
  return null;
}
// When a season next starts (for "back in spring")
export function nextStart(id, t) {
  const s = SEASONS.find((x) => x[0] === id), y = new Date(t).getUTCFullYear();
  for (const sy of [y, y + 1]) { const from = Date.UTC(sy, s[4][0] - 1, s[4][1]); if (from > t) return from; }
  return null;
}
// For the badges: from the times your pigeons left, the most sent in any one of each season
export function seasonCounts(times) {
  const best = {}, per = {};
  for (const t of times) for (const s of SEASONS) { const w = windowOf(s, t); if (w) per[w.key] = (per[w.key] || 0) + 1; }
  for (const [k, n] of Object.entries(per)) { const id = k.split(":")[0]; best[id] = Math.max(best[id] || 0, n); }
  return { best, per };
}
// Sent one during a season: at ten, its look is yours for good
export async function noteSeason(D, uid, t) {
  const s = seasonAt(t); if (!s) return;
  const n = (await D.prepare(`SELECT (SELECT COUNT(*) FROM pg_msgs WHERE sender = ?1 AND sent_at >= ?2 AND sent_at < ?3)
    + (SELECT COUNT(*) FROM pg_gmsgs m JOIN pg_gdeliv d ON d.msg_id = m.id WHERE m.sender = ?1 AND m.sent_at >= ?2 AND m.sent_at < ?3) AS n`).bind(uid, s.from, Math.min(s.to, t + 1)).first()).n;
  if (n >= SEASON_GOAL) await D.prepare("INSERT OR IGNORE INTO pg_kit (user_id, item, at) VALUES (?, ?, ?)").bind(uid, "skin:" + s.id, t).run();
}
// A seasonal look: on now, or kept
export async function seasonOpen(D, uid, id, t) {
  if (seasonAt(t)?.id === id) return true;
  return !!(await D.prepare("SELECT 1 FROM pg_kit WHERE user_id = ? AND item = ?").bind(uid, "skin:" + id).first());
}
export const isSeasonSkin = (id) => SEASONS.some((s) => s[0] === id);
// The look a pigeon of theirs flies with now: a seasonal one that's gone (and wasn't kept) isn't worn
export async function skinNow(D, u, t) {
  if (!u.skin || !isSeasonSkin(u.skin)) return u.skin || null;
  return (await seasonOpen(D, u.id, u.skin, t)) ? u.skin : null;
}
