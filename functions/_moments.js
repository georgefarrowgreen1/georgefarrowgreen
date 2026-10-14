/* ---------- mid-air moments: near misses ----------
   Two pigeons in the air at once that someone can see both of (one each way
   in a chat, or two of your pigeons in different chats) and that come within
   NEAR_KM of each other in mid-air: they passed each other, or one overtook
   the other. Worked out when a pigeon takes off, and again whenever its flight
   changes (it turns for someone who moved, or is called back), and kept as the
   moment, the spot and its name. Each person only ever hears of moments
   between pigeons they could already see. */
import { MIN, gcPoint, haversineKm, chunks } from "./_pigeon.js";
import { placeName } from "./_where.js";

export const NEAR_KM = 50;
const APART_KM = 150;          // and they must have come from, and gone on to, well apart: not flying together

// A pigeon's path: where it was when (take-off, each turn or rest, landing). It
// flies each stretch along the great circle at an even pace.
export function stopsOf(m) {
  let legs = []; try { legs = m.legs ? JSON.parse(m.legs) : []; } catch (_) {}
  return [[m.from_lat, m.from_lon, m.sent_at], ...legs, [m.to_lat, m.to_lon, m.deliver_at]];
}
export function posAt(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [aLat, aLon, aT] = stops[i], [bLat, bLon, bT] = stops[i + 1];
    if (t <= bT || i === stops.length - 2) return gcPoint(aLat, aLon, bLat, bLon, bT > aT ? Math.min(1, Math.max(0, (t - aT) / (bT - aT))) : 1);
  }
  return [stops[0][0], stops[0][1]];
}
const endOf = (m) => Math.min(m.deliver_at, m.lost_at ?? Infinity);
const dist = (a, b) => haversineKm(a[0], a[1], b[0], b[1]);

// Where and when two pigeons come closest, if that's a near miss.
export function closest(m, n, from = -Infinity) {
  const t0 = Math.max(m.sent_at, n.sent_at, from), t1 = Math.min(endOf(m), endOf(n));
  if (!(t1 - t0 > 2 * MIN)) return null;
  const sm = stopsOf(m), sn = stopsOf(n), d = (t) => dist(posAt(sm, t), posAt(sn, t));
  const N = 360; let best = t0, bd = Infinity;
  for (let i = 0; i <= N; i++) { const t = t0 + ((t1 - t0) * i) / N, x = d(t); if (x < bd) { bd = x; best = t; } }
  if (bd > NEAR_KM * 4) return null;
  // closer in on the best moment
  let lo = Math.max(t0, best - (t1 - t0) / N), hi = Math.min(t1, best + (t1 - t0) / N);
  for (let k = 0; k < 40; k++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (d(a) < d(b)) hi = b; else lo = a; }
  const at = Math.round((lo + hi) / 2), km = d(at);
  if (km > NEAR_KM || d(t0) < km + APART_KM || d(t1) < km + APART_KM) return null;
  const pa = posAt(sm, at), pb = posAt(sn, at);
  if (Math.abs(pa[1] - pb[1]) > 180) pb[1] += pa[1] > pb[1] ? 360 : -360;
  const lat = (pa[0] + pb[0]) / 2, lon = ((((pa[1] + pb[1]) / 2) + 540) % 360) - 180;
  // heading the same way: one overtook the other (the quicker one); else they passed
  const step = (s, p) => { const q = posAt(s, Math.min(at + MIN, t1)); return [q[0] - p[0], (q[1] - p[1]) * Math.cos((p[0] * Math.PI) / 180), dist(p, q)]; };
  const [ya, xa, va] = step(sm, pa), [yb, xb, vb] = step(sn, pb);
  const cos = (xa * xb + ya * yb) / Math.max(1e-9, Math.hypot(xa, ya) * Math.hypot(xb, yb));
  const overtake = cos > 0.5;
  return { at, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, km: Math.round(km * 10) / 10, kind: overtake ? "overtake" : "pass", lead: overtake ? (va >= vb ? m.id : n.id) : null };
}

// A pigeon's near misses with every other it could meet (in the air at the same
// time, sharing someone), kept. from: only moments after then (it has just turned).
export async function findNear(D, m, from = -Infinity) {
  if (!m || m.from_lat == null || m.to_lat == null || m.recalled) return 0;
  const start = Math.max(m.sent_at, from), end = endOf(m);
  if (end <= start) return 0;
  const { results } = await D.prepare(`SELECT * FROM pg_msgs WHERE id != ?1 AND (sender IN (?2, ?3) OR recipient IN (?2, ?3))
    AND deliver_at > ?4 AND sent_at < ?5 AND (lost_at IS NULL OR lost_at > ?4) AND from_lat IS NOT NULL AND to_lat IS NOT NULL LIMIT 300`)
    .bind(m.id, m.sender, m.recipient, start, end).all();
  const found = [];
  for (const n of results) {
    const c = closest(m, n, start); if (!c) continue;
    const [a, b] = m.id < n.id ? [m.id, n.id] : [n.id, m.id];
    found.push({ a, b, ...c, place: placeName(c.lat, c.lon) });
  }
  for (const part of chunks(found, 40)) await D.batch(part.map((x) => D.prepare(`INSERT OR REPLACE INTO pg_near (a, b, at, lat, lon, km, place, kind, lead, told, coarse)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`).bind(x.a, x.b, x.at, x.lat, x.lon, x.km, x.place, x.kind, x.lead)));
  return found.length;
}
// Its flight changed: the moments still ahead of it no longer hold.
export const dropNear = (D, id, t) => D.prepare("DELETE FROM pg_near WHERE (a = ?1 OR b = ?1) AND at > ?2").bind(id, t).run();
// It changed course at t: what's ahead of it, again.
export async function renear(D, id, t) {
  await dropNear(D, id, t);
  const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
  return findNear(D, m, t);
}

// The moments that have happened to these messages, as each is seen by me:
// only those between two pigeons I could see both of.
export async function nearViews(D, me, ids, t) {
  const out = new Map();
  for (const part of chunks([...new Set(ids)], 40)) {
    const q = part.map(() => "?").join(",");
    const { results } = await D.prepare(`SELECT n.*, ma.sender AS a_from, ma.recipient AS a_to, ma.pigeon AS a_kind, ma.swift AS a_swift,
      mb.sender AS b_from, mb.recipient AS b_to, mb.pigeon AS b_kind, mb.swift AS b_swift
      FROM pg_near n JOIN pg_msgs ma ON ma.id = n.a JOIN pg_msgs mb ON mb.id = n.b
      WHERE n.at <= ?1 AND (n.a IN (${q}) OR n.b IN (${q}))`).bind(t, ...part, ...part).all();
    for (const r of results) {
      if (![r.a_from, r.a_to].includes(me) || ![r.b_from, r.b_to].includes(me)) continue;
      const side = (x) => ({ id: r[x], from: r[x + "_from"], to: r[x + "_to"], pigeon: r[x + "_kind"] || (r[x + "_swift"] ? "swift" : "standard") });
      for (const [mine, other] of [["a", "b"], ["b", "a"]]) {
        if (!part.includes(r[mine])) continue;
        const list = out.get(r[mine]) || [];
        list.push({ at: r.at, lat: r.lat, lon: r.lon, place: r.place, kind: r.kind, lead: r.lead == null ? null : r.lead === r[mine] ? "this" : "other", other: side(other) });
        out.set(r[mine], list);
      }
    }
  }
  return out;
}
