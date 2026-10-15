/* ---------- live weather ----------
   A pigeon in the air keeps an eye on the sky ahead. Every LIVE_EVERY, each
   flight with more than LIVE_LEFT still to go looks again at the forecast
   along the rest of its way (each stretch for when it'll get there), and its
   pace changes with it: what's still ahead is retimed, so it lands sooner or
   later. Small changes aren't worth it. A landing made much later by the
   weather is told, as at take-off (wx_at: see wxTick in _notify.js).
   And it changes course when that's better: if storms have got into its way
   since it left, it takes the quickest way around them it can find from where
   it is now (the straight line on, or a gentle arc either side, through the
   passes and resting on islands as it would have); with none in the way, if
   the wind along another way would now get it there at least LIVE_GAIN
   sooner, it rides that instead (a scenic pigeon doesn't chase the wind). The
   point where it turned is kept ("r", and why), its plan from there replaced.
   At most one such turn an hour. Its sender and recipient are told (in a
   group, the recipient).
   And it waits out storms it can't get around: resting on an island with
   storms on the way on, it shelters there until the first hour it could
   leave and meet none (up to MAX_HOLD); a safe pigeon in the air over land,
   with storms ahead and no way around them, comes down where it is and
   does the same. Kept as a rest ("h", where), and told.
   Run from the tick; every flight checked in one go shares one look at the
   sky (the same squares of it as ever: never who's flying). */
import { MIN, HOUR, DAY, SPEED_KMH, PIGEONS, RISKY_SPEED, PHOTO_TTL, MAX_FLIGHT, chunks } from "./_pigeon.js";
import { skyAlong, skyAtPoints, pointsFor } from "./_weather.js";
import { stopsOf, posAt, renear } from "./_moments.js";
import { squeeze, passed, pathKm, round5, round2, latticeOf, bestWay, finish, timeWay, restOf, hopsFor, tire, tiredOf } from "./_route.js";
import { placeName } from "./_where.js";
import { placeAt } from "./_placegrid.js";
import { isSea } from "./_passport.js";
import { refly, reflyGroup } from "./_flyover.js";

export const LIVE_EVERY = 30 * MIN, LIVE_LEFT = HOUR, LIVE_EACH = 40;
const LIVE_POINTS = 500;                          // points of sky asked about in one go, at most (Open-Meteo counts each); the rest wait for the next tick
const LIVE_STEP = 0.03, LIVE_MS = 5 * MIN;        // a change smaller than this share of what's left (and this long) isn't made
const WX_TELL = 15 * MIN;                         // later by this much more: told again
const LIVE_GAIN = 0.05, TURN_EVERY = HOUR, MAX_HOLD = 12 * HOUR;        // a better way must be this much quicker; and no more than one weather turn an hour
// the latest it may land: its longest flight, and a day on top for resting and sheltering on the way
const latestOf = (r) => r.sent_at + MAX_FLIGHT / (PIGEONS[r.pigeon]?.speed ?? 1) / (r.risky ? RISKY_SPEED : 1) + DAY;
const coarse = (x) => (x == null ? x : Math.round(x * 2) / 2);
const kmhOf = (r) => SPEED_KMH * (PIGEONS[r.pigeon]?.speed ?? 1) * (r.risky ? RISKY_SPEED : 1);
const legsOf = (r) => { try { return r.legs ? JSON.parse(r.legs) : []; } catch (_) { return []; } };
// a rest: two points at the same spot, one when it lands, one when it's off again (on an island, sheltering, or a breather)
const restPair = (a, b) => !!a[3] && (a[3] === "i" || a[3] === "h" || a[3] === "t") && b[3] === a[3] && a[0] === b[0] && a[1] === b[1];
// time still to spend resting, from t
function restLeft(legs, t) {
  let ms = 0;
  for (let i = 0; i < legs.length - 1; i++) if (restPair(legs[i], legs[i + 1]) && legs[i + 1][2] > t) ms += legs[i + 1][2] - Math.max(t, legs[i][2]);
  return ms;
}
// the rest of its way from time t: where it is now, the points still ahead, where it lands
function aheadOf(stops, legs, t) {
  const [lat, lon] = posAt(stops, t), end = stops[stops.length - 1];
  return [[lat, lon], ...legs.filter((l) => l[2] > t).map((l) => [l[0], l[1]]), [end[0], end[1]]];
}

// The flights to look at now: in the air, a while to go, not looked at lately
async function due(D, t) {
  const one = (await D.prepare(`SELECT * FROM pg_msgs WHERE notified_at IS NULL AND deliver_at > ?1 AND sent_at <= ?2 AND (lost_at IS NULL OR lost_at > ?2)
    AND from_lat IS NOT NULL AND to_lat IS NOT NULL AND (via IS NULL OR via_off <= ?2) AND COALESCE(live_at, sent_at) <= ?3
    ORDER BY COALESCE(live_at, sent_at) LIMIT ?4`).bind(t + LIVE_LEFT, t, t - LIVE_EVERY, LIVE_EACH).all()).results;
  const grp = (await D.prepare(`SELECT d.*, m.sender, m.sent_at, m.from_lat, m.from_lon, m.pigeon, m.risky, m.style, m.photo, m.group_id,
      EXISTS (SELECT 1 FROM pg_links l WHERE l.status = 'ok' AND ((l.a = m.sender AND l.b = d.user_id) OR (l.a = d.user_id AND l.b = m.sender))) AS fr
    FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE d.notified_at IS NULL AND d.deliver_at > ?1 AND m.sent_at <= ?2 AND (d.lost_at IS NULL OR d.lost_at > ?2)
    AND d.to_lat IS NOT NULL AND m.from_lat IS NOT NULL AND COALESCE(d.live_at, m.sent_at) <= ?3 ORDER BY COALESCE(d.live_at, m.sent_at) LIMIT ?4`).bind(t + LIVE_LEFT, t, t - LIVE_EVERY, LIVE_EACH).all()).results
    // (where a sender who isn't the recipient's friend starts from, as the planner had it)
    .map((d) => (d.fr ? d : { ...d, from_lat: coarse(d.from_lat), from_lon: coarse(d.from_lon) }));
  return [...one.map((r) => ({ r, group: false })), ...grp.map((r) => ({ r, group: true }))];
}

// Returns what it did: { changed, turns: [{ group, r, why, where, deliver }] } (turns are told, by the tick)
export async function liveTick(env, D, t) {
  const list = await due(D, t), turns = [];
  if (!list.length) return { changed: 0, turns };
  const paths = [], pts = [], take = [];
  // the named pigeons carrying them: how often they need a breather, on a way it turns to
  const ids = list.filter((x) => !x.group && x.r.bird).map((x) => x.r.bird), kms = new Map();
  for (const part of chunks(ids, 50)) for (const b of (await D.prepare(`SELECT id, km FROM pg_birds WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results) kms.set(b.id, b.km);
  for (const x of list) {
    if (!x.group && kms.has(x.r.bird)) x.tired = tiredOf(kms.get(x.r.bird));
    const legs = legsOf(x.r), stops = stopsOf(x.r), last = legs.filter((l) => l[3] === "r").at(-1);
    Object.assign(x, { legs, rest: restLeft(legs, t), kmh: kmhOf(x.r), path: aheadOf(stops, legs, t) });
    const ri = legs.findIndex((l, i) => restPair(l, legs[i + 1] || []) && l[2] <= t && legs[i + 1][2] > t);
    x.restAt = ri < 0 ? null : ri;
    // the sky across the rest of its way, to find a better one (not while it's resting, nor just after it turned for the weather)
    x.lat = x.restAt != null || (last && t - last[2] < TURN_EVERY) ? null : latticeOf(x.path[0], x.path[x.path.length - 1]);
    const n = pointsFor(pathKm(x.path)).length + (x.lat ? x.lat.pts.length : 0);
    if (take.length && pts.length + paths.length * 8 + n > LIVE_POINTS) break;         // enough for one look: the rest next time
    x.at = paths.push(x.path) - 1;
    if (x.lat) { x.latAt = pts.length; pts.push(...x.lat.pts); }
    take.push(x);
  }
  const until = Math.max(...take.map((x) => x.r.deliver_at)) + MAX_HOLD;
  const [sky, grid] = await Promise.all([skyAlong(env, paths, until).catch(() => null), pts.length ? skyAtPoints(env, pts, until).catch(() => null) : null]);
  let changed = 0;
  for (const x of take) {
    let did = false;
    if (sky) try {
      const w = sky.at(x.at, t + x.rest, x.kmh), stormy = w && w.storms > 0;
      const ev = (e) => { if (e) { turns.push(e); did = true; } };
      if (stormy && x.restAt != null) ev(await shelter(D, t, x, w, sky));                  // on an island: wait them out
      const better = did || !grid ? null : pick(x, w, (i, when) => grid.at(x.latAt + i, when), t);
      if (better) ev(await turnFor(D, t, x, better, w));                                 // a way around (or a better wind)
      if (!did && stormy && x.r.style === "safe" && x.restAt == null && !isSea(placeAt(x.path[0][0], x.path[0][1]))) ev(await shelter(D, t, x, w, sky));   // safe, over land: come down
      if (!did) did = await retime(env, D, t, x, w);
    } catch (e) { console.error("pigeon live", e && e.message); }
    if (did) changed++;
    else await mark(D, x, t);
  }
  return { changed, turns };
}
const mark = (D, x, t) => (x.group
  ? D.prepare("UPDATE pg_gdeliv SET live_at = ? WHERE msg_id = ? AND user_id = ?").bind(t, x.r.msg_id, x.r.user_id)
  : D.prepare("UPDATE pg_msgs SET live_at = ? WHERE id = ?").bind(t, x.r.id)).run();
// how long a way takes (hours) with its weather, and its rests
const hoursOf = (path, w, rest, kmh) => pathKm(path) / (kmh * (w?.f || 1)) + rest / HOUR;
// A better way from here, if there is one: { way: { p, rest }, w, why: "s" (around storms) or "w" (the wind) }.
// The quickest way through the sky ahead (bestWay), through the passes and resting on islands as it would.
function pick(x, w, skyAt, t) {
  if (!x.lat || !w) return null;
  const found = bestWay(x.lat, skyAt, t, x.kmh, { wind: x.r.style !== "scenic" });
  let p = finish(found.path, { hop: hopsFor(x.r.pigeon), style: x.r.style });
  if (x.tired) p = [p[0], ...tire(p[0], p.slice(1, -1), p[p.length - 1], x.kmh * (found.w.f || 1), x.tired), p[p.length - 1]];
  const way = { p, rest: restOf(p.slice(1, -1)) };
  // storms in its way now: a way that keeps out of them (the straight line from here, if that does)
  if (w.storms > 0 && found.w.storms < w.storms) return { way, w: found.w, why: "s" };
  if (w.storms > 0 || found.why !== "w") return null;
  // a better wind: only if clearly quicker than the way it's going
  return hoursOf(p, found.w, way.rest, x.kmh) < hoursOf(x.path, w, x.rest, x.kmh) * (1 - LIVE_GAIN) ? { way, w: found.w, why: "w" } : null;
}
// It changes course for the weather: from where it is now, the better way.
async function turnFor(D, t, x, better, wasW) {
  const r = x.r, way = better.way, w = better.w, [pLat, pLon] = x.path[0], end = x.path[x.path.length - 1];
  const where = better.why === "s" && wasW.storm ? safeName(wasW.storm.lat, wasW.storm.lon) : null;
  // the bends it makes are for this reason; passes and islands stay what they are
  const pts = way.p.slice(1, -1).map((q) => Object.assign(q[2] === "s" || q[2] === "w" ? [q[0], q[1], better.why, ...(where && better.why === "s" ? [where] : [])] : [...q], q.rest ? { rest: q.rest } : {}));
  const latest = latestOf(r);
  const flying = Math.round((pathKm(way.p) / (x.kmh * w.f)) * HOUR), deliver = Math.min(latest, t + flying + way.rest);
  const done = passed(x.legs, t);
  // the turn keeps the way it was going (and where the storms were), for the map
  const was = x.path.slice(1).filter((q, i, a) => !i || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]).slice(-12).map((q) => [round2(q[0]), round2(q[1])]);
  const sk = wasW.storm?.k || "storms";                             // (storms, hail or icing)
  const more = { was, ...(wasW.storm && better.why === "s" ? { storm: [round2(wasW.storm.lat), round2(wasW.storm.lon)], ...(sk !== "storms" ? { k: sk } : {}) } : {}) };
  const legs = JSON.stringify([...done, [round5(pLat), round5(pLon), t, "r", better.why, more], ...timeWay([pLat, pLon], pts, end, t, Math.max(0, deliver - t - way.rest)).legs]);
  const km = pathKm([[r.from_lat, r.from_lon], ...done, [pLat, pLon]]) + pathKm(way.p), left = r.deliver_at - t, change = deliver - r.deliver_at;
  const lostAt = r.lost_at == null || r.lost_at <= t ? r.lost_at : Math.round(t + ((r.lost_at - t) * (deliver - t)) / left);
  // the weather's part: going around storms, the time it costs is theirs (and the turn's notice has said so already)
  const storm = better.why === "s" && wasW.storm ? { k: sk, lat: wasW.storm.lat, lon: wasW.storm.lon } : null;
  const spot = storm || (w.wx ? (({ at, ...s }) => s)(w.wx) : null);
  const wx = spot ? JSON.stringify(spot) : r.wx, wxAt = spot ? t : r.wx_at, wxMs = (r.wx_ms || 0) + change;
  const q = x.group
    ? D.prepare(`UPDATE pg_gdeliv SET deliver_at = ?1, legs = ?2, lost_at = ?3, wind = ?4, wind_f = ?5, wx = ?6, wx_ms = ?7, wx_at = ?8, wx_told = ?9, live_at = ?9, km = ?10
        WHERE msg_id = ?11 AND user_id = ?12 AND deliver_at = ?13 AND legs IS ?14`).bind(deliver, legs, lostAt, w.wind, w.f, wx, wxMs, wxAt, t, km, r.msg_id, r.user_id, r.deliver_at, r.legs)
    : D.prepare(`UPDATE pg_msgs SET deliver_at = ?1, legs = ?2, lost_at = ?3, wind = ?4, wind_f = ?5, wx = ?6, wx_ms = ?7, wx_at = ?8, wx_told = ?9, live_at = ?9, km = ?10,
        expires_at = CASE WHEN photo = 1 THEN ?11 ELSE expires_at END WHERE id = ?12 AND deliver_at = ?13 AND legs IS ?14`)
      .bind(deliver, legs, lostAt, w.wind, w.f, wx, wxMs, wxAt, t, km, (lostAt ?? deliver) + PHOTO_TTL, r.id, r.deliver_at, r.legs);
  if (!(await q.run()).meta.changes) return null;
  await after(D, t, x, lostAt ?? deliver);
  return { group: x.group, r, why: better.why, where, deliver, k: sk };
}
// It shelters from the storms ahead: where it's resting (or, over land, where
// it is) until the first hour it could leave and meet none on the way.
async function shelter(D, t, x, w, sky) {
  const r = x.r, onIsle = x.restAt != null, from = onIsle ? x.legs[x.restAt + 1][2] : t;
  let until = null;
  for (let k = 1; k * HOUR <= MAX_HOLD && !until; k++) { const wk = sky.at(x.at, from + k * HOUR, x.kmh); if (wk && wk.storms === 0) until = from + k * HOUR; }
  if (!until) return null;                                            // not clearing soon: it flies on (slowly)
  const hold = until - from, latest = latestOf(r), sk = w.storm?.k || "storms", kx = sk !== "storms" ? [{ k: sk }] : [];
  if (r.deliver_at + hold > latest) return null;
  const later = (l) => [l[0], l[1], l[2] + hold, ...l.slice(3)];
  let legs, where;
  if (onIsle) {
    const isle = x.legs[x.restAt][4]; where = isle ? `on ${isle}` : null;
    const h = (l, at) => [l[0], l[1], at, "h", ...(where || kx.length ? [where] : []), ...kx];
    legs = x.legs.map((l, i) => (i < x.restAt ? l : i === x.restAt ? h(l, l[2]) : i === x.restAt + 1 ? h(l, l[2] + hold) : later(l)));
  } else {
    const [lat, lon] = x.path[0], place = safeName(lat, lon); where = place ? `in ${place}` : null;
    const h = (at) => [round5(lat), round5(lon), at, "h", ...(where || kx.length ? [where] : []), ...kx];
    legs = [...passed(x.legs, t), h(t), h(t + hold), ...x.legs.filter((l) => l[2] > t).map(later)];
  }
  const deliver = r.deliver_at + hold, lostAt = r.lost_at == null || r.lost_at <= t ? r.lost_at : r.lost_at + hold;
  const wx = w.storm ? JSON.stringify({ k: sk, lat: w.storm.lat, lon: w.storm.lon }) : r.wx, wxMs = (r.wx_ms || 0) + hold, json = JSON.stringify(legs);
  const q = x.group
    ? D.prepare(`UPDATE pg_gdeliv SET deliver_at = ?1, legs = ?2, lost_at = ?3, wx = ?4, wx_ms = ?5, wx_at = ?6, wx_told = ?6, live_at = ?6
        WHERE msg_id = ?7 AND user_id = ?8 AND deliver_at = ?9 AND legs IS ?10`).bind(deliver, json, lostAt, wx, wxMs, t, r.msg_id, r.user_id, r.deliver_at, r.legs)
    : D.prepare(`UPDATE pg_msgs SET deliver_at = ?1, legs = ?2, lost_at = ?3, wx = ?4, wx_ms = ?5, wx_at = ?6, wx_told = ?6, live_at = ?6,
        expires_at = CASE WHEN photo = 1 THEN ?7 ELSE expires_at END WHERE id = ?8 AND deliver_at = ?9 AND legs IS ?10`)
      .bind(deliver, json, lostAt, wx, wxMs, t, (lostAt ?? deliver) + PHOTO_TTL, r.id, r.deliver_at, r.legs);
  if (!(await q.run()).meta.changes) return null;
  await after(D, t, x, lostAt ?? deliver);
  return { group: x.group, r, why: "h", where, until, deliver, k: sk };
}
const safeName = (lat, lon) => { try { return placeName(lat, lon); } catch (_) { return null; } };
// A flight changed: the pigeons it'll pass, and the friends it'll fly over, again
async function after(D, t, x, end) {
  if (x.group) {
    if (x.r.photo === 1) await D.prepare("UPDATE pg_gmsgs SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?").bind(end + PHOTO_TTL, x.r.msg_id).run();
    await reflyGroup(D, x.r.msg_id, t).catch(() => {});
  } else {
    await renear(D, x.r.id, t).catch(() => {}); await refly(D, x.r.id, t).catch(() => {});
  }
}

// Its pace from now on, with the weather ahead as it is now: true if it changed
async function retime(env, D, t, x, w) {
  const r = x.r, left = r.deliver_at - t, flying = Math.max(0, left - x.rest), was = r.wind_f || 1;
  if (!w || w.wind == null) return false;
  const latest = latestOf(r);
  const deliver = Math.min(latest, Math.round(t + x.rest + (flying * was) / w.f)), change = deliver - r.deliver_at;
  if (Math.abs(change) < Math.max(LIVE_MS, LIVE_STEP * left)) return false;
  const legs = JSON.stringify(squeeze(x.legs, t, r.deliver_at, deliver));
  const lostAt = r.lost_at == null || r.lost_at <= t ? r.lost_at : Math.round(t + ((r.lost_at - t) * (deliver - t)) / left);
  // the weather's part: what it has cost (or saved) all told, and the worst of it ahead, told once it gets there
  const wxMs = (r.wx_ms || 0) + change, spot = w.wx ? (({ at, ...s }) => s)(w.wx) : null;
  const wx = spot ? JSON.stringify(spot) : r.wx;
  const wxAt = spot ? Math.round(t + x.rest + (w.wx.at ?? 0.5) * (deliver - t - x.rest)) : r.wx_at;
  const retell = change >= WX_TELL;                                  // much later than it was: say so again
  const q = x.group
    ? D.prepare(`UPDATE pg_gdeliv SET deliver_at = ?1, legs = ?2, lost_at = ?3, wind = ?4, wind_f = ?5, wx = ?6, wx_ms = ?7, wx_at = ?8, wx_told = CASE WHEN ?9 THEN NULL ELSE wx_told END, live_at = ?10
        WHERE msg_id = ?11 AND user_id = ?12 AND deliver_at = ?13 AND legs IS ?14`).bind(deliver, legs, lostAt, w.wind, w.f, wx, wxMs, wxAt, retell ? 1 : 0, t, r.msg_id, r.user_id, r.deliver_at, r.legs)
    : D.prepare(`UPDATE pg_msgs SET deliver_at = ?1, legs = ?2, lost_at = ?3, wind = ?4, wind_f = ?5, wx = ?6, wx_ms = ?7, wx_at = ?8, wx_told = CASE WHEN ?9 THEN NULL ELSE wx_told END, live_at = ?10,
        expires_at = CASE WHEN photo = 1 THEN ?11 ELSE expires_at END WHERE id = ?12 AND deliver_at = ?13 AND legs IS ?14`)
      .bind(deliver, legs, lostAt, w.wind, w.f, wx, wxMs, wxAt, retell ? 1 : 0, t, (lostAt ?? deliver) + PHOTO_TTL, r.id, r.deliver_at, r.legs);
  const res = await q.run();
  if (!res.meta.changes) return false;
  await after(D, t, x, lostAt ?? deliver);
  return true;
}
