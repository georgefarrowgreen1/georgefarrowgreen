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
