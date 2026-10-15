// Your flight log: what your pigeons have done. Built only from what the server
// already keeps (distances, times, kinds, fates), never what anyone wrote.
// Every pigeon counts once: a message to a group of four is three pigeons.

import { stampPassports, passportFor } from "./_passport.js";
import { postmarksFor } from "./_landmarks.js";
import { SEASONS, SEASON_GOAL, seasonAt, seasonCounts, seasonOpen, nextStart } from "./_seasons.js";
import { json, db, requireUser } from "./_pigeon.js";

// Rare pigeons: a look for your pigeons, each unlocked by an achievement.
// Only the look changes; the colour still says what kind it is.
export const SKINS = {
  golden: { name: "Golden", badge: "fleet" },
  midnight: { name: "Midnight", badge: "longhaul" },
  storm: { name: "Storm", badge: "tailwind" },
  ember: { name: "Ember", badge: "daredevil" },
  comet: { name: "Comet", badge: "rocket" },
  rainbow: { name: "Rainbow", badge: "world" },
  // seasonal: anyone's while the season lasts, yours to keep after ten pigeons in it
  ...Object.fromEntries(SEASONS.map((s) => [s[0], { name: s[1], badge: s[2], season: true }])),
};
async function flightLog({ request, env }) {
  const u = await requireUser(request, env);
  const D = await db(env), t = Date.now();
  await stampPassports(D, t, u.id, 20);                     // any of yours that landed since: stamped first
  const log = await logFor(D, u.id, t);
  const earned = new Set(log.badges.filter((b) => b.earned).map((b) => b.id));
  const now = seasonAt(t), skins = [];
  for (const [id, k] of Object.entries(SKINS)) {
    if (!k.season) { skins.push({ id, name: k.name, badge: k.badge, open: earned.has(k.badge) }); continue; }
    const on = now?.id === id, kept = earned.has(k.badge), b = log.badges.find((x) => x.id === k.badge);
    if (!on && !kept) continue;                 // out of season and not kept: back next year
    skins.push({ id, name: k.name, badge: k.badge, open: await seasonOpen(D, u.id, id, t), season: { on, kept, until: on ? now.to : null, n: b?.n ?? 0, of: SEASON_GOAL } });
  }
  return json({ ...log, passport: await passportFor(D, u.id, t), postmarks: await postmarksFor(D, u.id), skin: u.skin || null, skins,
    season: now ? { id: now.id, look: now.look, badge: now.badgeName, from: now.from, until: now.to } : null });
}
// Is this look yours to use?
export async function skinOpen(env, uid, skin) {
  if (!Object.hasOwn(SKINS, skin)) return false;
  if (SKINS[skin].season) return seasonOpen(await db(env), uid, skin, Date.now());
  const log = await logFor(await db(env), uid, Date.now());
  return log.badges.some((b) => b.id === SKINS[skin].badge && b.earned);
}
// Everything in the log, as it stood at time t (the weekly note compares two).
export async function logFor(D, uid, t) {
  const u = { id: uid };
  // one row per pigeon you've sent: one to one, and each of your group pigeons
  const { results: sent } = await D.prepare(`
    SELECT pigeon, km, sent_at, deliver_at, lost_at, recalled, wind, to_place, risky, from_lon, to_lon, 0 AS grp, legs, wx_ms FROM pg_msgs WHERE sender = ?1 AND sent_at <= ?2
    UNION ALL
    -- (no place names for group pigeons: one could be someone who isn't your friend)
    SELECT m.pigeon, d.km, m.sent_at, d.deliver_at, d.lost_at, d.recalled, d.wind, NULL, m.risky, m.from_lon, d.to_lon, 1, d.legs, d.wx_ms FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE m.sender = ?1 AND m.sent_at <= ?2`).bind(u.id, t).all();
  const received = await D.prepare(`SELECT
      (SELECT COUNT(*) FROM pg_msgs WHERE recipient = ?1 AND deliver_at <= ?2 AND lost_at IS NULL) +
      (SELECT COUNT(*) FROM pg_gdeliv WHERE user_id = ?1 AND deliver_at <= ?2 AND lost_at IS NULL) AS n`).bind(u.id, t).first();
  const landed = sent.filter((p) => p.deliver_at <= t && p.lost_at == null);
  const kinds = {};
  for (const p of sent) kinds[p.pigeon || "standard"] = (kinds[p.pigeon || "standard"] || 0) + 1;
  const longest = landed.reduce((a, p) => (!a || p.km > a.km ? p : a), null);
  // fastest: the best average speed of a whole flight (short hops count from their 5-minute minimum)
  const dur = (p) => Math.max(5 * 60e3, p.deliver_at - p.sent_at);        // no flight is shorter than 5 minutes
  const pace = (p) => p.km / (dur(p) / 3600e3);
  const fastest = landed.reduce((a, p) => (!a || pace(p) > pace(a) ? p : a), null);
  const windiest = sent.filter((p) => p.wind != null).reduce((a, p) => (!a || p.wind > a.wind ? p : a), null);
  const km = landed.reduce((n, p) => n + p.km, 0);
  // the weather's part: flights that went around storms (planned, or changing course on the way), hours spent
  // sheltering from them, and the most a wind brought one in early
  const legsOf = (p) => { try { return p.legs ? JSON.parse(p.legs) : []; } catch (_) { return []; } };
  const dodged = sent.filter((p) => legsOf(p).some((l) => l[3] === "s" || (l[3] === "r" && l[4] === "s"))).length;
  const sheltered = sent.reduce((ms, p) => { const ls = legsOf(p); for (let i = 0; i < ls.length - 1; i++) if (ls[i][3] === "h" && ls[i + 1][3] === "h" && ls[i][0] === ls[i + 1][0]) ms += ls[i + 1][2] - ls[i][2]; return ms; }, 0) / 3600e3;
  const early = Math.max(0, ...landed.filter((p) => p.wind > 0).map((p) => -(p.wx_ms || 0)));
  // Achievements: earned, or how close you are (0-1)
  const atlantic = (p) => p.from_lon != null && p.to_lon != null && ((p.from_lon < -40 && p.to_lon > -20) || (p.to_lon < -40 && p.from_lon > -20));
  const has = (k) => sent.some((p) => p.pigeon === k);
  const badge = (id, name, desc, n, of = 1) => ({ id, name, desc, earned: n >= of, progress: Math.min(1, n / of), ...(of > 1 ? { n: Math.min(n, of), of } : {}) });
  const badges = [
    badge("first", "First Flight", "Your first pigeon lands", landed.length),
    badge("frequent", "Frequent Flyer", "Send 50 pigeons", sent.length, 50),
    badge("penpal", "Pen Pal", "Receive 25 pigeons", received.n, 25),
    badge("longhaul", "Long Haul", "A single flight over 5,000 km", landed.some((p) => p.km >= 5000) ? 1 : 0),
    badge("atlantic", "Transatlantic", "A pigeon crosses the Atlantic", landed.some(atlantic) ? 1 : 0),
    badge("world", "Around the World", "Fly 40,075 km in all", Math.round(km), 40075),
    badge("rocket", "Rocket Mail", "A rocket pigeon lands", landed.some((p) => p.pigeon === "rocket") ? 1 : 0),
    badge("tailwind", "Tailwind Rider", "Catch a 30 mph tailwind", sent.some((p) => p.wind >= 48) ? 1 : 0),
    badge("daredevil", "Daredevil", "10 Pigeon Death pigeons survive", landed.filter((p) => p.risky).length, 10),
    badge("homing", "Second Thoughts", "Call a pigeon back", sent.some((p) => p.recalled && p.lost_at <= t) ? 1 : 0),
    badge("flock", "Flock Leader", "Send a pigeon to a group", sent.some((p) => p.grp) ? 1 : 0),
    badge("fleet", "Fleet", "Fly every kind: standard, swift, turbo and rocket", ["standard", "swift", "turbo", "rocket"].filter(has).length, 4),
    badge("globetrotter", "Globetrotter", "Your pigeons fly over 25 countries", (await passportFor(D, uid, t)).countries, 25),
    badge("stormdodger", "Storm Dodger", "Go around storms 5 times", dodged, 5),
    badge("weathered", "Weathered It", "Shelter from storms for 12 hours in all", Math.floor(sheltered), 12),
    badge("jetstream", "Rode the Jet Stream", "Land 2 hours early on the wind", early >= 2 * 3600e3 ? 1 : 0),
  ];
  // seasonal: ten pigeons in one season (while it's on, how many so far this time)
  const sc = seasonCounts(sent.map((p) => p.sent_at)), now = seasonAt(t);
  for (const [id, , bid, bname] of SEASONS) {
    const cur = now?.id === id ? sc.per[now.key] || 0 : 0, best = sc.best[id] || 0, done = best >= SEASON_GOAL;
    if (!done && now?.id !== id) continue;          // shown while it's on, and once earned
    badges.push(badge(bid, bname, `Send ${SEASON_GOAL} pigeons in ${id === "spring" ? "spring migration season" : id}`, done ? best : cur, SEASON_GOAL));
  }
  return {
    badges,
    sent: sent.length, landed: landed.length, received: received.n,
    flying: sent.filter((p) => p.sent_at <= t && p.deliver_at > t && !(p.lost_at != null && p.lost_at <= t)).length,
    lost: sent.filter((p) => p.lost_at != null && p.lost_at <= t && !p.recalled).length,
    recalled: sent.filter((p) => p.recalled).length,
    km,
    hours: landed.reduce((n, p) => n + dur(p), 0) / 3600e3,
    longest: longest ? { km: longest.km, place: longest.to_place || null } : null,
    fastest: fastest ? { kmh: pace(fastest), kind: fastest.pigeon || "standard" } : null,
    tailwind: windiest && windiest.wind > 0 ? windiest.wind : null,
    dodged, sheltered, early: early || null,
    kinds, since: sent.length ? Math.min(...sent.map((p) => p.sent_at)) : null,
  };
}

export const STATS_ROUTES = { "GET flight-log": flightLog };
