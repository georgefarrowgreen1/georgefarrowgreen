// The best time for today's ride (or run), from the hour-by-hour weather where you ride (functions/_fitwx.js), as
// Weather has its Best times (weather/insights.js windows): each daylight hour scored 0 to 1 for how comfortable it'll
// feel, the wind and gusts, and whether it's dry; the best unbroken stretch as long as the session wins, held back by
// its worst hour. Weather's own limits for a ride and a run. Pure: no page, no network.

export const LIMITS = {
  ride: { tmin: 9, tmax: 22, windMax: 20, gustMax: 45, from: 6, to: 20 },
  run: { tmin: 6, tmax: 16, windMax: 25, gustMax: 45, from: 6, to: 21 },
};
const HOUR = 3600e3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isWet = (h) => (h.rain ?? 0) >= 0.2 || (h.code != null && h.code >= 51);
const comfort = (f, lo, hi) => (f == null ? 0.5 : f < lo ? clamp(1 - (lo - f) * 0.09, 0, 1) : f > hi ? clamp(1 - (f - hi) * 0.1, 0, 1) : 1);
const dryOf = (h) => { if (isWet(h)) return 0; const p = h.pop ?? 0; return p < 15 ? 1 : p < 30 ? 0.8 : p < 50 ? 0.55 : 0.3; };

// how good one hour is, 0 to 1
export function hourScore(h, prev, a) {
  let s = comfort(h.feels ?? h.temp, a.tmin, a.tmax);
  const w = h.wind ?? 0;
  if (w > a.windMax) s *= clamp(1 - (w - a.windMax) / 15, 0.2, 1);
  if ((h.gust ?? 0) > a.gustMax) s *= 0.5;
  s *= dryOf(h) * (prev && isWet(prev) ? 0.85 : 1);
  return clamp(s, 0, 1);
}
export const ratingOf = (s) => (s >= 0.8 ? "Great" : s >= 0.6 ? "Good" : s >= 0.4 ? "Fair" : "Poor");
// the wind in words: "a light westerly", from the direction it comes from
export function windWords(kmh, deg) {
  const dirs = ["northerly", "north-easterly", "easterly", "south-easterly", "southerly", "south-westerly", "westerly", "north-westerly"];
  const d = deg == null ? null : dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  const how = kmh == null ? null : kmh < 6 ? "calm" : kmh < 15 ? "a light" : kmh < 25 ? "a fresh" : kmh < 38 ? "a strong" : "a gale-force";
  if (how === "calm" || !how) return "little wind";
  return d ? `${how} ${d}` : `${how} wind`;
}

// The best stretch today, from now: wx { offset, hours }, secs the session's length. → { start, end, score, rating,
// temp, wind, gust, dir, pop, dry } (start, end: ms), or null where there's no daylight left today in its hours.
export function bestWindow(wx, { secs, now = Date.now(), sport = "ride" } = {}) {
  const a = LIMITS[sport] || LIMITS.ride, off = (wx?.offset || 0) * 1000, hours = wx?.hours || [];
  const local = (t) => new Date(t + off), dayOf = (t) => local(t).toISOString().slice(0, 10), hourOf = (t) => local(t).getUTCHours();
  const today = dayOf(now), len = clamp(Math.ceil((secs || 3600) / 3600), 1, 6);
  const ok = hours.filter((h) => h.t + HOUR > now && dayOf(h.t) === today && h.day && hourOf(h.t) >= a.from && hourOf(h.t) + 1 <= a.to);
  let best = null;
  for (let i = 0; i + len <= ok.length; i++) {
    const hs = ok.slice(i, i + len);
    if (hs.at(-1).t - hs[0].t !== (len - 1) * HOUR) continue;
    const each = hs.map((h) => hourScore(h, hours.find((x) => x.t === h.t - HOUR), a));
    const s = 0.7 * (each.reduce((x, y) => x + y, 0) / each.length) + 0.3 * Math.min(...each);
    // (sooner is better, a little)
    const adj = s - ((hs[0].t - now) / (24 * HOUR)) * 0.04;
    if (!best || adj > best.adj) best = { adj, s, hs };
  }
  if (!best) return null;
  const hs = best.hs, avg = (k) => { const v = hs.map((h) => h[k]).filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  return { start: Math.max(hs[0].t, Math.floor(now / HOUR) * HOUR), end: hs.at(-1).t + HOUR, score: best.s, rating: ratingOf(best.s),
    temp: avg("temp"), wind: avg("wind"), gust: Math.max(0, ...hs.map((h) => h.gust ?? 0)), dir: hs[Math.floor(hs.length / 2)].dir,
    pop: Math.max(0, ...hs.map((h) => h.pop ?? 0)), dry: !hs.some(isWet) };
}
// when on the place's own clock: { hour, minute } for a time (ms), to say it as the place has it
export const localClock = (t, offset) => { const d = new Date(t + (offset || 0) * 1000); return { h: d.getUTCHours(), m: d.getUTCMinutes() }; };
// The wet days ahead, for Rhythm (fitness/rhythm.js: a wet day suits the trainer's intervals, a dry one the long ride):
// a day is wet where half or more of its riding hours, 8 to 6 on the place's clock, look wet or likely so (60% or more).
// → { "YYYY-MM-DD": true }
export function wetDays(wx) {
  const off = (wx?.offset || 0) * 1000, by = {};
  for (const h of wx?.hours || []) {
    const d = new Date(h.t + off), hr = d.getUTCHours();
    if (hr < 8 || hr >= 18) continue;
    const k = d.toISOString().slice(0, 10), x = (by[k] ||= [0, 0]);
    x[0]++; if (isWet(h) || (h.pop ?? 0) >= 60) x[1]++;
  }
  return Object.fromEntries(Object.entries(by).filter(([, [n, w]]) => n >= 6 && w / n >= 0.5).map(([k]) => [k, true]));
}

// The best times for two people at once (Chat's "Make it a plan", through the together route): a: yours, b: theirs,
// each { offset, hours } as functions/_fitwx.js hoursAt gives them. An hour counts where both places have it (within
// half an hour of each other, else it's left out), it's light at both, and it's within each place's own riding (or
// running) hours on its own clock; it scores the worse of the two. A window is `len` whole hours in a row, none
// starting before `after`, over the next `days` days: 0.7 of its mean and 0.3 of its worst hour, less 0.04 a day ahead;
// dry where no hour is wet at either place. → { windows: [{ start, end, rating, dry, me: { temp, pop }, them: { temp,
// pop } }] (best first, not overlapping, Fair or better, at most `top`), hours: [{ t, me, them }] ("dry" | "wet" | "off":
// the best window's day, at most 14 hours, for the strip) }
export function bestTogether(a, b, { len = 1, sport = "ride", now = Date.now(), after = now, days = 3, top = 3 } = {}) {
  const lim = LIMITS[sport] || LIMITS.ride, n = clamp(Math.ceil(Number(len) || 1), 1, 6);
  const offA = (a?.offset || 0) * 1000, offB = (b?.offset || 0) * 1000;
  const ha = (a?.hours || []).filter((h) => Number.isFinite(h?.t)).slice().sort((x, y) => x.t - y.t);
  const hb = (b?.hours || []).filter((h) => Number.isFinite(h?.t)).slice().sort((x, y) => x.t - y.t);
  const hourOf = (t, off) => new Date(t + off).getUTCHours(), dayNo = (t, off) => Math.floor((t + off) / (24 * HOUR));
  const inHours = (t, off) => hourOf(t, off) >= lim.from && hourOf(t, off) + 1 <= lim.to;
  // b's hour for each of a's (within half an hour: a place on a half-hour clock, Mumbai's or Adelaide's, has its hours at
  // :30, so exactly half an hour out still lines up, with the nearer, else the earlier), with the hour before it at
  // each place (for hourScore)
  const near = (t) => { let best = null; for (const h of hb) { const d = Math.abs(h.t - t); if (d <= 30 * 60e3 && (!best || d < Math.abs(best.t - t))) best = h; } return best; };
  const prevOf = (list, h) => list.find((x) => x.t === h.t - HOUR);
  const pairs = ha.map((x) => ({ t: x.t, a: x, b: near(x.t) }));
  const ok = (p) => p.b && p.a.day && p.b.day && inHours(p.a.t, offA) && inHours(p.b.t, offB);
  const until = now + days * 24 * HOUR;
  const cands = [];
  for (let i = 0; i + n <= pairs.length; i++) {
    const ps = pairs.slice(i, i + n);
    if (ps[0].t < after || ps[0].t >= until || ps.at(-1).t - ps[0].t !== (n - 1) * HOUR || !ps.every(ok)) continue;
    const each = ps.map((p) => Math.min(hourScore(p.a, prevOf(ha, p.a), lim), hourScore(p.b, prevOf(hb, p.b), lim)));
    const raw = 0.7 * (each.reduce((x, y) => x + y, 0) / each.length) + 0.3 * Math.min(...each);
    const score = raw - 0.04 * Math.max(0, dayNo(ps[0].t, offA) - dayNo(now, offA));
    if (score < 0.4) continue;
    const avg = (k, w) => { const v = ps.map((p) => p[w][k]).filter((x) => x != null); return v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null; };
    const most = (w) => Math.max(0, ...ps.map((p) => p[w].pop ?? 0));
    cands.push({ start: ps[0].t, end: ps.at(-1).t + HOUR, score, rating: ratingOf(score), dry: !ps.some((p) => isWet(p.a) || isWet(p.b)),
      me: { temp: avg("temp", "a"), pop: most("a") }, them: { temp: avg("temp", "b"), pop: most("b") } });
  }
  cands.sort((x, y) => y.score - x.score || x.start - y.start);
  const picked = [];
  for (const c of cands) { if (picked.length >= top) break; if (!picked.some((p) => c.start < p.end && p.start < c.end)) picked.push(c); }
  const windows = picked.map(({ score, ...w }) => w);
  let hours = [];
  if (windows.length) {
    const w = windows[0], dn = dayNo(w.start, offA);
    const state = (h, off) => (!h || !h.day || !inHours(h.t, off) ? "off" : isWet(h) ? "wet" : "dry");
    const day = pairs.filter((p) => dayNo(p.t, offA) === dn && hourOf(p.t, offA) >= lim.from && hourOf(p.t, offA) + 1 <= lim.to);
    // (at most 14, keeping the window in view)
    let from = 0;
    if (day.length > 14) { const wi = day.findIndex((p) => p.t === w.start); from = clamp(wi + n - 14, 0, day.length - 14); from = Math.min(from, Math.max(0, wi)); }
    hours = day.slice(from, from + 14).map((p) => ({ t: p.t, me: state(p.a, offA), them: state(p.b, offB) }));
  }
  return { windows, hours };
}
