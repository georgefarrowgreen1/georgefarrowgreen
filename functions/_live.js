/* ---------- live weather ----------
   A pigeon in the air keeps an eye on the sky ahead. Every LIVE_EVERY, each
   flight with more than LIVE_LEFT still to go looks again at the forecast
   along the rest of its way (each stretch for when it'll get there), and its
   pace changes with it: what's still ahead is retimed, so it lands sooner or
   later. Small changes aren't worth it. A landing made much later by the
   weather is told, as at take-off (wx_at: see wxTick in _notify.js).
   Run from the tick; every flight checked in one go shares one look at the
   sky (the same squares of it as ever: never who's flying). */
import { MIN, HOUR, SPEED_KMH, PIGEONS, RISKY_SPEED, PHOTO_TTL, MAX_FLIGHT } from "./_pigeon.js";
import { skyAlong } from "./_weather.js";
import { stopsOf, posAt, renear } from "./_moments.js";
import { squeeze } from "./_route.js";
import { refly, reflyGroup } from "./_flyover.js";

export const LIVE_EVERY = 30 * MIN, LIVE_LEFT = HOUR, LIVE_EACH = 40;
const LIVE_STEP = 0.03, LIVE_MS = 5 * MIN;        // a change smaller than this share of what's left (and this long) isn't made
const WX_TELL = 15 * MIN;                         // later by this much more: told again
const coarse = (x) => (x == null ? x : Math.round(x * 2) / 2);
const kmhOf = (r) => SPEED_KMH * (PIGEONS[r.pigeon]?.speed ?? 1) * (r.risky ? RISKY_SPEED : 1);
const legsOf = (r) => { try { return r.legs ? JSON.parse(r.legs) : []; } catch (_) { return []; } };
// a rest: two points at the same spot, one when it lands, one when it's off again
const restPair = (a, b) => !!a[3] && (a[3] === "i" || a[3] === "h") && b[3] === a[3] && a[0] === b[0] && a[1] === b[1];
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

export async function liveTick(env, D, t) {
  const list = await due(D, t);
  if (!list.length) return 0;
  for (const x of list) {
    const legs = legsOf(x.r), stops = stopsOf(x.r);
    Object.assign(x, { legs, rest: restLeft(legs, t), kmh: kmhOf(x.r), path: aheadOf(stops, legs, t) });
  }
  const until = Math.max(...list.map((x) => x.r.deliver_at));
  const sky = await skyAlong(env, list.map((x) => x.path), until).catch(() => null);
  let changed = 0;
  for (const [i, x] of list.entries()) {
    const ok = sky ? await retime(env, D, t, x, sky.at(i, t + x.rest, x.kmh)).catch((e) => { console.error("pigeon live", e && e.message); return false; }) : false;
    if (ok) changed++;
    else await mark(D, x, t);
  }
  return changed;
}
const mark = (D, x, t) => (x.group
  ? D.prepare("UPDATE pg_gdeliv SET live_at = ? WHERE msg_id = ? AND user_id = ?").bind(t, x.r.msg_id, x.r.user_id)
  : D.prepare("UPDATE pg_msgs SET live_at = ? WHERE id = ?").bind(t, x.r.id)).run();

// Its pace from now on, with the weather ahead as it is now: true if it changed
async function retime(env, D, t, x, w) {
  const r = x.r, left = r.deliver_at - t, flying = Math.max(0, left - x.rest), was = r.wind_f || 1;
  if (!w || w.wind == null) return false;
  const latest = r.sent_at + MAX_FLIGHT / (PIGEONS[r.pigeon]?.speed ?? 1) / (r.risky ? RISKY_SPEED : 1);
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
  if (x.group) {
    if (r.photo === 1) await D.prepare("UPDATE pg_gmsgs SET expires_at = MAX(COALESCE(expires_at, 0), ?) WHERE id = ?").bind((lostAt ?? deliver) + PHOTO_TTL, r.msg_id).run();
    await reflyGroup(D, r.msg_id, t).catch(() => {});
  } else {
    await renear(D, r.id, t).catch(() => {}); await refly(D, r.id, t).catch(() => {});
  }
  return true;
}
