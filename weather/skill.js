// How good each model has been here, and a forecast tuned by it.
//
// What each model said a day (and three days) ahead comes from Open-Meteo's
// archive of past forecasts; what actually happened comes from the nearest
// airport's weather reports (METAR), which the server collects and keeps
// (functions/_wxobs.js), so the record grows the more the app is used.
// Both are daily highs and lows from hourly values, so they compare fairly.
//
// The tuned high (and low) for a day is each model's forecast with its usual
// error here taken off, weighted by how close it has been; and the hours follow it.

import { keyOf } from "./format.js";

export const MODELS = [
  // (ECMWF's own 9 km model, hourly for the first days: open since October 2025, and finer than the 0.25°, 3-hourly
  // one, whose daily highs came out low)
  ["ecmwf_ifs", "ECMWF", "Europe's model, usually the most accurate"],
  ["ukmo_seamless", "Met Office", "The UK Met Office's global and UK models"],
  ["gfs_seamless", "GFS", "NOAA's American model"],
  ["icon_seamless", "ICON", "Germany's DWD model"],
  ["meteofrance_seamless", "Météo-France", "France's ARPEGE and AROME models"],
  ["gem_seamless", "GEM", "Environment Canada's model"],
];
export const MIN_DAYS = 5, TUNE_DAYS = 7;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
// Open-Meteo's past forecasts (hourly, local time) → { modelId: { "YYYY-MM-DD": { hi1, lo1, hi3, lo3 } } }
// Several models' columns are named variable_model ("temperature_2m_previous_day1_ecmwf_ifs"); one model's, just the variable.
export function shapePrevious(j, models = MODELS) {
  const h = j?.hourly; if (!h?.time) return null;
  const col = (v, id) => [`${v}_${id}`, models.length === 1 ? v : null].find((k) => k && Array.isArray(h[k])) || null;
  const out = {};
  for (const [id] of models) {
    const c1 = col("temperature_2m_previous_day1", id), c3 = col("temperature_2m_previous_day3", id);
    if (!c1) continue;
    const days = {};
    h.time.forEach((t, i) => {
      const d = t.slice(0, 10), x = days[d] || (days[d] = { a: [], b: [] });
      if (h[c1][i] != null) x.a.push(h[c1][i]);
      if (c3 && h[c3][i] != null) x.b.push(h[c3][i]);
    });
    const m = {};
    for (const [d, x] of Object.entries(days)) {
      if (x.a.length < 20) continue;          // only whole days
      m[d] = { hi1: Math.max(...x.a), lo1: Math.min(...x.a), hi3: x.b.length >= 20 ? Math.max(...x.b) : null, lo3: x.b.length >= 20 ? Math.min(...x.b) : null };
    }
    if (Object.keys(m).length) out[id] = m;
  }
  return Object.keys(out).length ? out : null;
}

// prev (above) against obs { "YYYY-MM-DD": { tmax, tmin } } →
// { days, from, to, models: [{ id, name, n, hiMae, loMae, hiBias, loBias, hiMae3, score }], best, byId }
export function skillFrom(prev, obs, models = MODELS) {
  if (!prev || !obs) return null;
  const list = [];
  for (const [id, name] of models) {
    const p = prev[id]; if (!p) continue;
    const hi = [], lo = [], hi3 = [];
    for (const [d, o] of Object.entries(obs)) {
      const f = p[d]; if (!f) continue;
      if (o.tmax != null) hi.push(f.hi1 - o.tmax);
      if (o.tmin != null) lo.push(f.lo1 - o.tmin);
      if (o.tmax != null && f.hi3 != null) hi3.push(f.hi3 - o.tmax);
    }
    if (hi.length < MIN_DAYS) continue;
    const abs = (a) => mean(a.map(Math.abs));
    const m = { id, name, n: hi.length, hiMae: abs(hi), loMae: lo.length ? abs(lo) : null, hiBias: mean(hi), loBias: lo.length ? mean(lo) : 0, hiMae3: hi3.length >= MIN_DAYS ? abs(hi3) : null };
    m.score = m.hiMae + (m.loMae ?? m.hiMae);
    list.push(m);
  }
  if (!list.length) return null;
  list.sort((a, b) => a.score - b.score);
  const dates = Object.keys(obs).filter((d) => list.some((m) => prev[m.id]?.[d])).sort();
  return { days: Math.max(...list.map((m) => m.n)), from: dates[0], to: dates[dates.length - 1], models: list, best: list[0].id, byId: Object.fromEntries(list.map((m) => [m.id, m])) };
}

// A day's tuned high and low from the models' forecasts for it ([{ id, tmax, tmin }]), or null
// if there isn't enough to go on. Each model's usual error comes off; the closer it's been, the more it counts.
export function tuneDay(skill, dayModels) {
  if (!skill || skill.days < TUNE_DAYS || !dayModels) return null;
  const use = dayModels.filter((m) => m.tmax != null && m.tmin != null && skill.byId[m.id]);
  if (use.length < 3) return null;
  const blend = (val, mae, bias) => {
    let w = 0, s = 0;
    for (const m of use) { const k = skill.byId[m.id], e = k[mae] ?? k.hiMae, wt = 1 / (e * e + 0.3); w += wt; s += wt * (m[val] - (k[bias] ?? 0)); }
    return s / w;
  };
  return { tmax: blend("tmax", "hiMae", "hiBias"), tmin: blend("tmin", "loMae", "loBias"), n: use.length };
}

// The forecast with its highs and lows tuned, from tomorrow on (today's own hours know best how today is going),
// and its hours with them (shiftHours). Each tuned day keeps what it said before as `raw`.
export function applyTuning(wx, skill, todayKey) {
  if (!wx?.models || !skill || skill.days < TUNE_DAYS) return wx;
  let changed = false;
  const daily = wx.daily.map((d) => {
    if (d.key <= todayKey) return d;
    const t = tuneDay(skill, wx.models.days[d.key]);
    if (!t) return d;
    changed = true;
    const tmin = Math.min(t.tmin, t.tmax), up = t.tmax - d.tmax, down = tmin - d.tmin;
    return { ...d, tmax: t.tmax, tmin, fmax: d.fmax == null ? d.fmax : d.fmax + up, fmin: d.fmin == null ? d.fmin : d.fmin + down,
      raw: { tmax: d.tmax, tmin: d.tmin, fmax: d.fmax, fmin: d.fmin }, tuned: true };
  });
  return changed ? { ...wx, daily, hourly: shiftHours(wx.hourly, daily), tunedBy: skill } : wx;
}

// The hours of tuned days, moved with them: each day's warmest hour by as much as its high was tuned, its coldest by
// as much as its low, and the hours between by a share of each, by how near they are (so tonight eases from today's
// own hours to tomorrow's tuned low). None goes past its day's tuned high or low. Today's hours stay as they are, as
// do those of a day too far out for the models to tune. (Feeling like moves with them; the ensemble's spread is drawn
// about whatever's shown.)
export function shiftHours(hourly, daily) {
  const byKey = new Map();
  for (const h of hourly) { const k = keyOf(h.t); byKey.has(k) ? byKey.get(k).push(h) : byKey.set(k, [h]); }
  const marks = [], tuned = new Map();
  for (const d of daily) {
    const hs = byKey.get(d.key);
    if (!hs) continue;
    const hi = hs.reduce((a, h) => (h.temp > a.temp ? h : a)), lo = hs.reduce((a, h) => (h.temp < a.temp ? h : a));
    marks.push({ t: hi.t, by: d.tuned ? d.tmax - hi.temp : 0 }, { t: lo.t, by: d.tuned ? d.tmin - lo.temp : 0 });
    if (d.tuned) tuned.set(d.key, d);
  }
  if (!marks.some((m) => m.by)) return hourly;
  marks.sort((a, b) => a.t - b.t);
  let j = 0;
  return hourly.map((h) => {
    while (j < marks.length - 1 && marks[j + 1].t <= h.t) j++;
    const a = marks[j], b = marks[j + 1];
    const by = h.t <= a.t || !b ? a.by : a.by + ((b.by - a.by) * (h.t - a.t)) / (b.t - a.t);
    if (!by) return h;
    const d = tuned.get(keyOf(h.t)), temp = d ? Math.min(d.tmax, Math.max(d.tmin, h.temp + by)) : h.temp + by;
    return { ...h, temp, feels: h.feels == null ? h.feels : h.feels + by };
  });
}

// METAR reports → daily highs and lows, in local time (offset in seconds): { "YYYY-MM-DD": { tmax, tmin, n } }
// Only days with enough reports to have caught the warmest and coldest of it.
export function obsDays(reports, offsetSec, now = Date.now()) {
  const days = {}, today = new Date(now + offsetSec * 1000).toISOString().slice(0, 10);
  for (const r of reports || []) {
    const t = typeof r.obsTime === "number" ? r.obsTime * 1000 : Date.parse(r.reportTime);
    const v = Number(r.temp);
    if (!Number.isFinite(t) || r.temp == null || !Number.isFinite(v)) continue;
    const d = new Date(t + offsetSec * 1000).toISOString().slice(0, 10);
    if (d >= today) continue;            // not over yet
    const x = days[d] || (days[d] = { tmax: -99, tmin: 99, n: 0, hours: new Set() });
    x.tmax = Math.max(x.tmax, v); x.tmin = Math.min(x.tmin, v); x.n++; x.hours.add(new Date(t + offsetSec * 1000).getUTCHours());
  }
  const out = {};
  for (const [d, x] of Object.entries(days)) if (x.hours.size >= 18) out[d] = { tmax: x.tmax, tmin: x.tmin, n: x.n };
  return out;
}
