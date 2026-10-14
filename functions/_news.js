/* ---------- friends' news ----------
   What your friends' pigeons have been up to lately, built from what the
   server already keeps (never anything anyone wrote, and never where anyone
   is): a new country in their passport, a landmark postmark, a named pigeon
   rising a rank or being named, a streak reaching a week, a month or a
   hundred days, an accessory bought, a seasonal look kept.
   Two weeks of it, newest first. Anyone can stop sharing theirs (Privacy →
   Share My News); like being online, that works both ways. */
import { json, db, requireUser, DAY, haversineKm } from "./_pigeon.js";
import { isSea } from "./_passport.js";
import { countryNear } from "./_where.js";
import { landmark } from "./_landmarks.js";
import { itemView } from "./_feathers.js";
import { SEASONS } from "./_seasons.js";

const SPAN = 14 * DAY, MAX = 40;
const STREAK_MARKS = [7, 30, 100];
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "Someone";

export async function newsFor(D, u, t) {
  if (u.hide_news) return [];
  const since = t - SPAN;
  const { results: fr } = await D.prepare(`SELECT p.id, p.name, p.lat, p.lon, p.avatar_at FROM pg_links l JOIN pg_users p ON p.id = CASE WHEN l.a = ?1 THEN l.b ELSE l.a END
    WHERE (l.a = ?1 OR l.b = ?1) AND l.status = 'ok' AND COALESCE(p.hide_news, 0) = 0`).bind(u.id).all();
  if (!fr.length) return [];
  const who = new Map(fr.map((p) => [p.id, p])), ids = [...who.keys()];
  const inFriends = `IN (${ids.map(() => "?").join(",")})`;
  const q = async (sql, ...args) => (await D.prepare(sql).bind(...args, ...ids).all()).results;
  const out = [];
  const add = (uid, at, kind, text, extra = {}) => { const p = who.get(uid); if (p) out.push({ at, kind, who: { id: p.id, name: p.name, avatarAt: p.avatar_at || null }, text, ...extra }); };
  // Where their pigeons landed is where someone else lives: news never says. So a
  // country or landmark only counts here if it was on the way, not where it ended.
  const places = await q(`SELECT user_id, place, first_at, first_id FROM pg_passport WHERE first_at > ? AND first_at <= ? AND user_id ${inFriends} ORDER BY first_at, first_ord`, since, t);
  const marks = await q(`SELECT user_id, mark, first_at, first_id FROM pg_postmarks WHERE first_at > ? AND first_at <= ? AND user_id ${inFriends}`, since, t);
  const ends = await endsOf(D, [...new Set([...places, ...marks].map((r) => r.first_id).filter(Boolean))]);
  const landedIn = (id, place) => (ends.get(id) || []).some(([la, lo]) => countryNear(la, lo) === place);
  const landedBy = (id, l) => (ends.get(id) || []).some(([la, lo]) => haversineKm(la, lo, l[2], l[3]) < 80);
  const byFlight = new Map();
  for (const r of places) {
    const p = who.get(r.user_id); if (isSea(r.place) || (p.lat != null && countryNear(p.lat, p.lon) === r.place) || !ends.has(r.first_id) || landedIn(r.first_id, r.place)) continue;
    const k = r.user_id + "|" + r.first_id; byFlight.set(k, { ...(byFlight.get(k) || { uid: r.user_id, at: r.first_at, list: [] }), at: r.first_at }); byFlight.get(k).list.push(r.place);
  }
  const and = (a) => (a.length > 3 ? `${a.slice(0, 3).join(", ")} and ${a.length - 3} more` : a.length > 2 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a.join(" and "));
  for (const x of byFlight.values()) add(x.uid, x.at, "country", `’s pigeons flew over ${and(x.list)} for the first time`);
  // landmarks passed on the way
  for (const r of marks) {
    const l = landmark(r.mark); if (l && ends.has(r.first_id) && !landedBy(r.first_id, l)) add(r.user_id, r.first_at, "postmark", `’s pigeon flew past ${l[1]}`, { mark: { id: r.mark, kind: l[5] } });
  }
  // named pigeons: a new rank (as the flight that earned it landed), a new name
  const ranks = [...await q(`SELECT sender, bird_name, bird_up, deliver_at AS at FROM pg_msgs WHERE bird_up IS NOT NULL AND deliver_at > ? AND deliver_at <= ? AND sender ${inFriends}`, since, t),
    ...await q(`SELECT m.sender, m.bird_name, m.bird_up, d.deliver_at AS at FROM pg_gmsgs m JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = m.bird_to
      WHERE m.bird_up IS NOT NULL AND d.deliver_at > ? AND d.deliver_at <= ? AND m.sender ${inFriends}`, since, t)];
  for (const r of ranks) add(r.sender, r.at, "rank", `’s pigeon ${r.bird_name} became ${/^[AEIOU]/.test(r.bird_up) ? "an" : "a"} ${r.bird_up}`, { bird: r.bird_name });
  for (const r of await q(`SELECT owner, name, created_at FROM pg_birds WHERE created_at > ? AND created_at <= ? AND owner ${inFriends}`, since, t))
    add(r.owner, r.created_at, "named", ` named a new pigeon: ${r.name}`, { bird: r.name });
  // streaks reaching a week, a month, a hundred days (with you: both of you)
  const sdays = (await q(`SELECT a, b, start, last FROM pg_streaks WHERE last >= ? AND (a ${inFriends} OR b ${inFriends.replace(/\?/g, () => "?")})`, Math.floor(since / DAY), ...ids));
  const seen = new Set();
  for (const r of sdays) {
    for (const n of STREAK_MARKS) {
      const day = r.start + n - 1, at = day * DAY + DAY / 2; if (day > r.last || at <= since || at > t) continue;
      if (r.a === u.id || r.b === u.id) { const o = r.a === u.id ? r.b : r.a; add(o, at, "streak", "", { n, withYou: true }); continue; }
      for (const x of [r.a, r.b]) if (who.has(x) && !seen.has(x + n + r.start)) { seen.add(x + n + r.start); add(x, at, "streak", ` reached a ${n}\u2011day flight streak`, { n }); }
    }
  }
  // the shop, and seasonal looks kept
  for (const r of await q(`SELECT user_id, item, at FROM pg_kit WHERE at > ? AND at <= ? AND user_id ${inFriends}`, since, t)) {
    if (r.item.startsWith("skin:")) { const s = SEASONS.find((x) => x[0] === r.item.slice(5)); if (s) add(r.user_id, r.at, "season", ` kept the ${s[1]} look`, { skin: s[0] }); continue; }
    const it = itemView(r.item); if (it) add(r.user_id, r.at, "item", ` got ${/^[aeiou]/i.test(it.name) ? "an" : "a"} ${it.name.toLowerCase()} for their pigeons`, { emoji: it.emoji });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX).map((x) => ({ ...x, text: x.withYou ? `You and ${first(x.who.name)} reached a ${x.n}\u2011day flight streak` : `${first(x.who.name)}${x.text}` }));
}
// Where each flight (or each pigeon of a group message) landed
async function endsOf(D, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90), list = `(${part.map(() => "?").join(",")})`;
    const { results } = await D.prepare(`SELECT id, to_lat AS la, to_lon AS lo FROM pg_msgs WHERE id IN ${list} AND to_lat IS NOT NULL
      UNION ALL SELECT msg_id, to_lat, to_lon FROM pg_gdeliv WHERE msg_id IN ${list} AND to_lat IS NOT NULL`).bind(...part, ...part).all();
    for (const r of results) out.set(r.id, [...(out.get(r.id) || []), [r.la, r.lo]]);
  }
  return out;
}
async function news({ request, env }) {
  const u = await requireUser(request, env), t = Date.now();
  return json({ news: await newsFor(await db(env), u, t), sharing: !u.hide_news });
}
export const NEWS_ROUTES = { "GET news": news };
