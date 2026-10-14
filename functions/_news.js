/* ---------- friends' news ----------
   What your friends' pigeons have been up to lately, built from what the
   server already keeps (never anything anyone wrote, and never where anyone
   is): a new country in their passport, a landmark postmark, a named pigeon
   rising a rank or being named, a streak reaching a week, a month or a
   hundred days, an accessory bought, a seasonal look kept.
   Two weeks of it, newest first. Anyone can stop sharing theirs (Privacy →
   Share My News); like being online, that works both ways. */
import { json, db, requireUser, limit, DAY, haversineKm } from "./_pigeon.js";
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
  // your friends who share theirs (a subquery, so any number of friends: ?1 you, ?2 since, ?3 now)
  const FR = `(SELECT p.id FROM pg_links l JOIN pg_users p ON p.id = CASE WHEN l.a = ?1 THEN l.b ELSE l.a END
    WHERE (l.a = ?1 OR l.b = ?1) AND l.status = 'ok' AND COALESCE(p.hide_news, 0) = 0)`;
  const q = async (sql) => { const n = Math.max(...[...sql.matchAll(/\?(\d)/g)].map((m) => +m[1])); return (await D.prepare(sql).bind(...[u.id, since, t].slice(0, n)).all()).results; };   // (only the values it uses)
  const fr = await q(`SELECT id, name, lat, lon, avatar_at FROM pg_users WHERE id IN ${FR}`);
  if (!fr.length) return [];
  const who = new Map(fr.map((p) => [p.id, p])), mine = new Set([u.id, ...who.keys()]);
  const out = [];
  // (to the day: an exact time, set against when it left, would give away how far it flew)
  const add = (uid, at, kind, text, extra = {}) => { const p = who.get(uid); if (p) out.push({ at: Math.floor(at / DAY) * DAY, kind, who: { id: p.id, name: p.name, avatarAt: p.avatar_at || null }, text, ...extra }); };
  // Where their pigeons go is where other people live. So places and landmarks
  // are only named for flights to you or your own friends (whose whereabouts you
  // already know), never where one landed or stopped over, and never closer than that.
  const places = await q(`SELECT user_id, place, first_at, first_id FROM pg_passport WHERE first_at > ?2 AND first_at <= ?3 AND user_id IN ${FR} ORDER BY first_at, first_ord`);
  const marks = await q(`SELECT user_id, mark, first_at, first_id FROM pg_postmarks WHERE first_at > ?2 AND first_at <= ?3 AND user_id IN ${FR}`);
  const fl = await flightsOf(D, [...new Set([...places, ...marks].map((r) => r.first_id).filter(Boolean))]);
  const known = (id) => { const f = fl.get(id); return !!f && f.to.every((x) => mine.has(x)); };
  const stoppedIn = (id, place) => fl.get(id).stops.some(([la, lo]) => countryNear(la, lo) === place);
  const stoppedBy = (id, l) => fl.get(id).stops.some(([la, lo]) => haversineKm(la, lo, l[2], l[3]) < l[4] + 50);
  const byFlight = new Map(), counts = new Map();
  for (const r of places) {
    const p = who.get(r.user_id); if (isSea(r.place) || (p.lat != null && countryNear(p.lat, p.lon) === r.place) || !fl.has(r.first_id) || stoppedIn(r.first_id, r.place)) continue;
    const k = r.user_id + "|" + r.first_id;
    if (!known(r.first_id)) { counts.set(k, { uid: r.user_id, at: r.first_at, n: (counts.get(k)?.n || 0) + 1 }); continue; }   // just how many
    if (!byFlight.has(k)) byFlight.set(k, { uid: r.user_id, at: r.first_at, list: [] });
    byFlight.get(k).list.push(r.place);
  }
  const and = (a) => (a.length > 3 ? `${a.slice(0, 3).join(", ")} and ${a.length - 3} more` : a.length > 2 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a.join(" and "));
  for (const x of byFlight.values()) add(x.uid, x.at, "country", `’s pigeons flew over ${and(x.list)} for the first time`);
  for (const x of counts.values()) add(x.uid, x.at, "country", `’s pigeons flew over ${x.n === 1 ? "a new country" : `${x.n} new countries`}`);
  // landmarks passed on the way
  for (const r of marks) {
    const l = landmark(r.mark); if (l && known(r.first_id) && !stoppedBy(r.first_id, l)) add(r.user_id, r.first_at, "postmark", `’s pigeon flew past ${l[1]}`, { mark: { id: r.mark, kind: l[5] } });
  }
  // named pigeons: a new rank (as the flight that earned it landed), a new name
  const ranks = [...await q(`SELECT sender, bird_name, bird_up, deliver_at AS at FROM pg_msgs WHERE bird_up IS NOT NULL AND deliver_at > ?2 AND deliver_at <= ?3 AND sender IN ${FR}`),
    ...await q(`SELECT m.sender, m.bird_name, m.bird_up, d.deliver_at AS at FROM pg_gmsgs m JOIN pg_gdeliv d ON d.msg_id = m.id AND d.user_id = m.bird_to
      WHERE m.bird_up IS NOT NULL AND d.deliver_at > ?2 AND d.deliver_at <= ?3 AND m.sender IN ${FR}`)];
  for (const r of ranks) add(r.sender, r.at, "rank", `’s pigeon ${r.bird_name} became ${/^[AEIOU]/.test(r.bird_up) ? "an" : "a"} ${r.bird_up}`, { bird: r.bird_name });
  for (const r of await q(`SELECT owner, name, created_at FROM pg_birds WHERE created_at > ?2 AND created_at <= ?3 AND owner IN ${FR}`))
    add(r.owner, r.created_at, "named", ` named a new pigeon: ${r.name}`, { bird: r.name });
  // streaks reaching a week, a month, a hundred days: only yours with them (anyone else's would say who writes to whom)
  for (const r of await q(`SELECT a, b, start, last FROM pg_streaks WHERE last >= ?2 / ${DAY} AND (a = ?1 OR b = ?1)`)) {
    const o = r.a === u.id ? r.b : r.a; if (!who.has(o)) continue;
    for (const n of STREAK_MARKS) { const day = r.start + n - 1, at = day * DAY; if (day <= r.last && at + DAY > since && at <= t) add(o, at, "streak", "", { n, withYou: true }); }
  }
  // the shop, and seasonal looks kept
  for (const r of await q(`SELECT user_id, item, at FROM pg_kit WHERE at > ?2 AND at <= ?3 AND user_id IN ${FR}`)) {
    if (r.item.startsWith("skin:")) { const s = SEASONS.find((x) => x[0] === r.item.slice(5)); if (s) add(r.user_id, r.at, "season", ` kept the ${s[1]} look`, { skin: s[0] }); continue; }
    const it = itemView(r.item); if (it) add(r.user_id, r.at, "item", ` got ${/^[aeiou]/i.test(it.name) ? "an" : "a"} ${it.name.toLowerCase()} for their pigeons`, { emoji: it.emoji });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX).map((x) => ({ ...x, text: x.withYou ? `You and ${first(x.who.name)} reached a ${x.n}\u2011day flight streak` : `${first(x.who.name)}${x.text}` }));
}
// Each flight (or each pigeon of a group message): who it went to, and everywhere it came down or turned
async function flightsOf(D, ids) {
  const out = new Map();
  const at = (id) => { if (!out.has(id)) out.set(id, { to: [], stops: [] }); return out.get(id); };
  for (let i = 0; i < ids.length; i += 45) {                    // (each id is bound twice: 90 a query, under D1's 100)
    const part = ids.slice(i, i + 45), list = `(${part.map(() => "?").join(",")})`;
    const { results } = await D.prepare(`SELECT id, recipient AS who, to_lat AS la, to_lon AS lo, legs, via FROM pg_msgs WHERE id IN ${list}
      UNION ALL SELECT msg_id, user_id, to_lat, to_lon, legs, NULL FROM pg_gdeliv WHERE msg_id IN ${list}`).bind(...part, ...part).all();
    for (const r of results) {
      const f = at(r.id); f.to.push(r.who); if (r.via) f.to.push(r.via);
      if (r.la != null) f.stops.push([r.la, r.lo]);
      try { for (const l of JSON.parse(r.legs || "[]")) f.stops.push([l[0], l[1]]); } catch (_) {}
    }
  }
  return out;
}
async function news({ request, env }) {
  const u = await requireUser(request, env), t = Date.now();
  await limit(env, "news:" + u.id, 120, 3600e3);
  return json({ news: await newsFor(await db(env), u, t), sharing: !u.hide_news });
}
export const NEWS_ROUTES = { "GET news": news };
