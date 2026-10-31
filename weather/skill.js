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

import { keyOf, HOUR } from "./format.js";

export const MODELS = [
  // (ECMWF's own 9 km model, hourly for the first days: open since October 2025, and finer than the 0.25°, 3-hourly
  // one, whose daily highs came out low)
  ["ecmwf_ifs", "ECMWF", "Europe's model, usually the most accurate"],
  ["ukmo_seamless", "Met Office", "The UK Met Office's global and UK models"],
  ["gfs_seamless", "GFS", "NOAA's American model"],
  ["icon_seamless", "ICON", "Germany's DWD model"],
  ["meteofrance_seamless", "Météo-France", "France's ARPEGE and AROME models"],
  ["gem_seamless", "GEM", "Environment Canada's model"],
  // (ECMWF's AI model: learned from decades of the weather rather than worked out from physics, and as good or better
  // on temperature; its forecasts are kept as the others' are, so it's judged here alike)
  ["ecmwf_aifs025_single", "ECMWF AI", "ECMWF's AI model, AIFS"],
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

// Steadier days ahead. A day three or more days off can swing from one run of the models to the next (15°, then 12°,
// then 15° again); its high and low here are what the page says of it now blended with what it said of it a day and
// two days ago (app.js keeps that, as it was before this steadying: so it doesn't feed on itself), now counting most:
// 60%, 30% and 10% for the days three and four days off, 50%, 30% and 20% beyond. On average that's a little closer as
// well as steadier. (Open-Meteo's archive of earlier runs only reaches as far as the hours just ahead.) The days' hours
// move with them. past: { 1: days, 2: days }, each { "YYYY-MM-DD": [tmax, tmin] } or null. Each steadied day keeps
// what it was as `latest`.
export const STEADY_FROM = 2;
const LAG_W = (lead) => (lead >= 4 ? [0.5, 0.3, 0.2] : [0.6, 0.3, 0.1]);
function steadied(lead, now, past) {
  const w = LAG_W(lead);
  let sw = w[0], hi = w[0] * now.tmax, lo = w[0] * now.tmin;
  for (const k of [1, 2]) { const p = past[k]; if (!p) continue; sw += w[k]; hi += w[k] * p[0]; lo += w[k] * p[1]; }
  return sw > w[0] ? { tmax: hi / sw, tmin: Math.min(lo / sw, hi / sw) } : null;
}
export function steady(wx, past, todayKey) {
  const today = wx?.daily?.find((d) => d.key === todayKey);
  if (!past || (!past[1] && !past[2]) || !today) return wx;
  let changed = false;
  const daily = wx.daily.map((d) => {
    const lead = Math.round((d.date - today.date) / 864e5);
    const s = lead >= STEADY_FROM ? steadied(lead, d, { 1: past[1]?.[d.key], 2: past[2]?.[d.key] }) : null;
    if (!s) return d;
    changed = true;
    const up = s.tmax - d.tmax, down = s.tmin - d.tmin;
    return { ...d, tmax: s.tmax, tmin: s.tmin, fmax: d.fmax == null ? d.fmax : d.fmax + up, fmin: d.fmin == null ? d.fmin : d.fmin + down, latest: { tmax: d.tmax, tmin: d.tmin }, steadied: true };
  });
  return changed ? { ...wx, daily, hourly: shiftHours(wx.hourly, daily, (d) => d.steadied) } : wx;
}
// What a page said of the days ahead, to keep for steadying with: { "YYYY-MM-DD": [tmax, tmin] }
export const daysSaid = (wx, todayKey) => Object.fromEntries(wx.daily.filter((d) => d.key >= todayKey).slice(0, 11).map((d) => [d.key, [Math.round(d.tmax * 10) / 10, Math.round(d.tmin * 10) / 10]]));
// From those kept (newest last: [{ at (ms), days }]), what it said about a day and two days before now (the nearest
// to each, within nine hours): { 1: days | null, 2: days | null }
export function saidBefore(kept, now) {
  const near = (ago) => (kept || []).reduce((best, k) => { const off = Math.abs(now - ago - k.at); return off <= 9 * HOUR && (!best || off < best.off) ? { off, days: k.days } : best; }, null)?.days || null;
  return { 1: near(24 * HOUR), 2: near(48 * HOUR) };
}

// The hours of tuned days, moved with them: each day's warmest hour by as much as its high was tuned, its coldest by
// as much as its low, and the hours between by a share of each, by how near they are (so tonight eases from today's
// own hours to tomorrow's tuned low). None goes past its day's tuned high or low. Today's hours stay as they are, as
// do those of a day too far out for the models to tune. (Feeling like moves with them; the ensemble's spread is drawn
// about whatever's shown.)
export function shiftHours(hourly, daily, moved = (d) => d.tuned) {
  const byKey = new Map();
  for (const h of hourly) { const k = keyOf(h.t); byKey.has(k) ? byKey.get(k).push(h) : byKey.set(k, [h]); }
  const marks = [], tuned = new Map();
  for (const d of daily) {
    const hs = byKey.get(d.key);
    if (!hs) continue;
    const hi = hs.reduce((a, h) => (h.temp > a.temp ? h : a)), lo = hs.reduce((a, h) => (h.temp < a.temp ? h : a));
    marks.push({ t: hi.t, by: moved(d) ? d.tmax - hi.temp : 0 }, { t: lo.t, by: moved(d) ? d.tmin - lo.temp : 0 });
    if (moved(d)) tuned.set(d.key, d);
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

// What the forecast the page shows (Open-Meteo's best match) got wrong here a day ahead, hour by hour, against the
// airport's reports (obsDays, with their hours): the temperature by time of day (eight three-hour blocks), the dew
// point, and how strong the wind and the gusts run against it. Each eased towards none where there's little to go on
// (a few days count for less than many), and kept within bounds. prev: Open-Meteo's past forecasts (hourly:
// temperature_2m, dew_point_2m, wind_speed_10m and wind_gusts_10m, each _previous_day1, best match).
// → { days, temp: [8 errors, °C, forecast less what happened], dew (°C, likewise), wind (×), gust (×) } or null
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function localSkill(prev, obs) {
  const h = prev?.hourly; if (!h?.time || !obs) return null;
  const col = (v) => h[`${v}_previous_day1_best_match`] || h[`${v}_previous_day1`] || null;
  const T = col("temperature_2m"), Dp = col("dew_point_2m"), Ws = col("wind_speed_10m"), Gs = col("wind_gusts_10m");
  if (!T) return null;
  const at = new Map(h.time.map((t, i) => [t, i]));
  const blocks = Array.from({ length: 8 }, () => ({ s: 0, n: 0, days: new Set() })), days = new Set(), gusts = [];
  let dS = 0, dN = 0, wO = 0, wF = 0;
  for (const [day, o] of Object.entries(obs)) {
    if (!Array.isArray(o.hours)) continue;
    let gO = null, gF = null;
    o.hours.forEach((x, hr) => {
      const i = x ? at.get(`${day}T${String(hr).padStart(2, "0")}:00`) : null;
      if (i == null) return;
      const [ot, od, ow, og] = x;
      if (ot != null && T[i] != null) { const b = blocks[Math.floor(hr / 3)]; b.s += T[i] - ot; b.n++; b.days.add(day); days.add(day); }
      if (od != null && Dp?.[i] != null) { dS += Dp[i] - od; dN++; }
      // (the wind where the forecast had some: the share's what counts, and calm hours say little of it)
      if (ow != null && Ws?.[i] != null && Ws[i] >= 5) { wO += ow; wF += Ws[i]; }
      if (og != null) gO = Math.max(gO ?? 0, og);
      if (Gs?.[i] != null) gF = Math.max(gF ?? 0, Gs[i]);
    });
    // (a day's strongest gust against the forecast's, on days gusty enough for the airport to report them)
    if (gO != null && gF) gusts.push(gO / gF);
  }
  if (days.size < MIN_DAYS) return null;
  const ease = (v, n) => (v * n) / (n + 3);
  return {
    days: days.size,
    temp: blocks.map((b) => (b.days.size >= MIN_DAYS ? clamp(ease(b.s / b.n, b.days.size), -3, 3) : 0)),
    dew: dN >= 12 * MIN_DAYS ? clamp(ease(dS / dN, days.size), -3, 3) : 0,
    wind: wF > 0 ? clamp(1 + ease(wO / wF - 1, days.size), 0.75, 1.35) : 1,
    gust: gusts.length >= MIN_DAYS ? clamp(1 + ease(gusts.reduce((a, v) => a + v, 0) / gusts.length - 1, gusts.length), 0.8, 1.3) : 1,
  };
}
// The hours from now on as the airport has found the forecast here (localSkill): each time of day's usual error off
// the temperature (on days not tuned: the tuning has their highs and lows, and the hours between with them), the dew
// point's off it (the humidity worked out again from the two), the wind and gusts in proportion; eased in over the
// first three hours from what it's like now. The days follow their hours: their highs and lows as far as their warmest
// and coldest hours moved, their strongest wind and gusts in proportion.
const rhOf = (t, d) => 100 * Math.exp((17.625 * d) / (243.04 + d) - (17.625 * t) / (243.04 + t));
export function refine(wx, local, now) {
  if (!local || !wx?.hourly?.length) return wx;
  const tuned = new Set(wx.daily.filter((d) => d.tuned).map((d) => d.key)), k = (t) => clamp((t - now) / (3 * HOUR), 0, 1);
  const hourly = wx.hourly.map((h) => {
    if (h.t <= now || h.temp == null) return h;
    const e = k(h.t), dt = tuned.has(keyOf(h.t)) ? 0 : -local.temp[Math.floor(new Date(h.t).getUTCHours() / 3)] * e, temp = h.temp + dt;
    const dew = h.dew == null ? h.dew : Math.min(temp, h.dew - local.dew * e);
    return { ...h, temp, feels: h.feels == null ? h.feels : h.feels + dt, dew, rh: dew == null ? h.rh : Math.round(clamp(rhOf(temp, dew), 1, 100)),
      wind: h.wind == null ? h.wind : h.wind * (1 + (local.wind - 1) * e), gust: h.gust == null ? h.gust : h.gust * (1 + (local.gust - 1) * e) };
  });
  const byDay = (hs) => { const m = new Map(); for (const h of hs) { const key = keyOf(h.t); m.has(key) ? m.get(key).push(h) : m.set(key, [h]); } return m; };
  const was = byDay(wx.hourly), now2 = byDay(hourly);
  const ext = (hs, f) => (hs?.length ? f(...hs.map((h) => h.temp)) : null);
  const daily = wx.daily.map((d) => {
    const a = was.get(d.key), b = now2.get(d.key);
    if (!a || !b || d.date + 864e5 <= now) return d;
    const up = ext(b, Math.max) - ext(a, Math.max), down = ext(b, Math.min) - ext(a, Math.min);
    const scale = (v, f) => (v == null ? v : v * f), part = d.date > now ? 1 : 0.5;
    return { ...d, tmax: d.tmax + up, tmin: d.tmin + down, fmax: d.fmax == null ? d.fmax : d.fmax + up, fmin: d.fmin == null ? d.fmin : d.fmin + down,
      windMax: scale(d.windMax, 1 + (local.wind - 1) * part), gustMax: scale(d.gustMax, 1 + (local.gust - 1) * part) };
  });
  return { ...wx, hourly, daily, refined: local };
}

// METAR reports → daily highs and lows, in local time, and each hour of the day's temperature, dew point and wind (their
// means, km/h) and strongest gust (km/h; null where none was reported, as there's none in calm air):
// { "YYYY-MM-DD": { tmax, tmin, n, hours: [[temp, dew, wind, gust] | null] × 24 } }
// Only days with enough reports to have caught the warmest and coldest of it. offset: seconds from UTC, or the offset in
// force at a moment (ms → seconds: zoneOffset), so a fortnight's reports either side of the clocks changing each go in
// the hour they were there, as Open-Meteo's past forecasts have them, not all an hour out on one side.
const KT = 1.852, r1 = (v) => Math.round(v * 10) / 10;
export function obsDays(reports, offset, now = Date.now()) {
  const off = typeof offset === "function" ? offset : () => offset;
  const days = {}, today = new Date(now + off(now) * 1000).toISOString().slice(0, 10), fin = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  for (const r of reports || []) {
    const t = typeof r.obsTime === "number" ? r.obsTime * 1000 : Date.parse(r.reportTime);
    const v = fin(r.temp);
    if (!Number.isFinite(t) || v == null) continue;
    const local = new Date(t + off(t) * 1000), d = local.toISOString().slice(0, 10), hr = local.getUTCHours();
    if (d >= today) continue;            // not over yet
    const x = days[d] || (days[d] = { tmax: -99, tmin: 99, n: 0, by: [] });
    x.tmax = Math.max(x.tmax, v); x.tmin = Math.min(x.tmin, v); x.n++;
    const b = x.by[hr] || (x.by[hr] = { t: 0, n: 0, d: 0, dn: 0, w: 0, wn: 0, g: null });
    b.t += v; b.n++;
    const dp = fin(r.dewp), ws = fin(r.wspd), wg = fin(r.wgst);
    if (dp != null) { b.d += dp; b.dn++; }
    if (ws != null) { b.w += ws * KT; b.wn++; }
    if (wg != null) b.g = Math.max(b.g ?? 0, wg * KT);
  }
  const out = {};
  for (const [d, x] of Object.entries(days)) {
    if (x.by.filter(Boolean).length < 18) continue;
    out[d] = { tmax: x.tmax, tmin: x.tmin, n: x.n, hours: Array.from({ length: 24 }, (_, h) => { const b = x.by[h]; return b ? [r1(b.t / b.n), b.dn ? r1(b.d / b.dn) : null, b.wn ? r1(b.w / b.wn) : null, b.g != null ? r1(b.g) : null] : null; }) };
  }
  return out;
}
// A time zone's offset from UTC at a moment (ms → seconds), summer time and all, for obsDays; null for one that isn't
// known ("Europe/London": 3600 in August, 0 in December)
export function zoneOffset(tz) {
  if (typeof tz !== "string" || !tz) return null;
  let fmt;
  try { fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (_) { return null; }
  return (t) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60e3) * 60e3) / 1000;
  };
}
