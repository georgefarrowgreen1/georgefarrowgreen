// Your flight log: what your pigeons have done. Built only from what the server
// already keeps (distances, times, kinds, fates), never what anyone wrote.
// Every pigeon counts once: a message to a group of four is three pigeons.

import { json, db, requireUser } from "./_pigeon.js";

async function flightLog({ request, env }) {
  const u = await requireUser(request, env);
  const D = await db(env), t = Date.now();
  // one row per pigeon you've sent: one to one, and each of your group pigeons
  const { results: sent } = await D.prepare(`
    SELECT pigeon, km, sent_at, deliver_at, lost_at, recalled, wind, to_place FROM pg_msgs WHERE sender = ?1
    UNION ALL
    -- (no place names for group pigeons: one could be someone who isn't your friend)
    SELECT m.pigeon, d.km, m.sent_at, d.deliver_at, d.lost_at, d.recalled, d.wind, NULL FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE m.sender = ?1`).bind(u.id).all();
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
  return json({
    sent: sent.length, landed: landed.length, received: received.n,
    flying: sent.filter((p) => p.deliver_at > t && !(p.lost_at != null && p.lost_at <= t)).length,
    lost: sent.filter((p) => p.lost_at != null && p.lost_at <= t && !p.recalled).length,
    recalled: sent.filter((p) => p.recalled).length,
    km: landed.reduce((n, p) => n + p.km, 0),
    hours: landed.reduce((n, p) => n + dur(p), 0) / 3600e3,
    longest: longest ? { km: longest.km, place: longest.to_place || null } : null,
    fastest: fastest ? { kmh: pace(fastest), kind: fastest.pigeon || "standard" } : null,
    tailwind: windiest && windiest.wind > 0 ? windiest.wind : null,
    kinds, since: sent.length ? Math.min(...sent.map((p) => p.sent_at)) : null,
  });
}

export const STATS_ROUTES = { "GET flight-log": flightLog };
