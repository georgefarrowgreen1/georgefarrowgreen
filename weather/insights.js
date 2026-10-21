// The insights: what the numbers mean for your day, in words.
//
// Everything here is pure (no page, no network), so the same reasoning can be
// tested on its own (.tools/tests/unit/wxinsights.test.mjs). It takes the
// forecast as data.js shapes it (`wx`), the time now in the place's own wall
// time (`now`), and a formatter for your units (format.js `makeFormat`).
//
//   headline(wx, now, f)        the next day or so, in a sentence or two
//   nowcast(wx, now, f)         rain starting or stopping in the next few hours
//   describeDay(wx, key, f)     a day in words, part by part
//   insights(wx, now, f, opts)  the cards: warnings, tips and things worth knowing, most important first
//   windows(wx, now, f)         the best times for a run, a ride, the washing, the stars and the sunset
//   confidence(wx)              how sure the forecast is, day by day (the models and the ensemble)
//   dayScore(day)               how nice a day looks, 0 to 100
//   changes(prev, wx, now, f)   what's changed in the forecast since you last looked

import { codeInfo, rank, isWetCode } from "./codes.js";
import { HOUR, DAY, dayStart, keyOf, hourOf, compassWord } from "./format.js";
import { climateOn, rankIn, extremes } from "./climate.js";
import { skyDay, moonAt, offsetFor } from "./sky.js";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// "a 39%", but "an 80%" (as the number's said)
const aPct = (n) => `${/^(8|11|18|8\d)$/.test(String(n)) ? "an" : "a"} ${n}%`;
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
// the tile whose sheet says more about an insight
const MORE = { umbrella: "rain", heavyrain: "rain", storm: "rain", snow: "rain", wetweek: "rain", dryweek: "rain", wind: "wind", frost: "feels", ice: "feels",
  heat: "feels", bitter: "feels", warmnight: "feels", wear: "feels", fog: "visibility", uv: "uv", air: "air", pollen: "air", pressure: "pressure" };
// an insight's short line (its row folded): the fullest of these that fits beside its icon on a phone, about 32 letters
const fit = (...xs) => xs.find((x) => x.length <= 32) ?? xs[xs.length - 1];
// a day named mid-sentence: "from tomorrow", not "from Tomorrow" (the days of the week keep their capitals)
const mid = (s) => s.replace(/^(Today|Tomorrow|Yesterday)\b/, (m) => m.toLowerCase());
const max = (a, k) => a.reduce((m, h) => (h[k] != null && (m == null || h[k] > m) ? h[k] : m), null);
const min = (a, k) => a.reduce((m, h) => (h[k] != null && (m == null || h[k] < m) ? h[k] : m), null);
const avg = (a, k) => { const v = a.map((h) => h[k]).filter((x) => x != null); return v.length ? sum(v) / v.length : null; };
const argmax = (a, k) => a.reduce((b, h) => (h[k] != null && (!b || h[k] > b[k]) ? h : b), null);
const argmin = (a, k) => a.reduce((b, h) => (h[k] != null && (!b || h[k] < b[k]) ? h : b), null);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// thresholds (metric)
export const T = {
  WET_MM: 0.1, HEAVY_MMH: 4, VERY_HEAVY_MMH: 8, HEAVY_DAY: 20,
  WINDY: 50, GALE: 62, DAMAGING: 80,        // gusts, km/h
  HOT: 27, VERY_HOT: 32, TROPICAL_NIGHT: 20, BITTER: -5,
  FOG_M: 1000, UV_HIGH: 6, UV_SUN: 3,
  AQI_POOR: 60, AQI_VERY_POOR: 80,
};

// The thresholds for warnings here: the fixed ones above, which are what's hard on anyone, and where the place's own
// thirty years are in, what's unusual here too (climate.js extremes), so a summer's ordinary heat in the south of France
// isn't a warning every day, nor a Canadian winter's cold, nor a monsoon's daily downpour; somewhere cooler, wetter or
// milder, the fixed ones. hot, veryHot: the air temperatures to reach as well (or null); warmNight, bitter, heavyDay
export function limitsHere(wx) {
  const x = wx?.climate ? extremes(wx.climate) : null, half = (v) => Math.round(v * 2) / 2;
  return {
    hot: x && x.hot > T.HOT ? half(x.hot) : null, veryHot: x && x.veryHot > T.VERY_HOT ? half(x.veryHot) : null,
    warmNight: x ? Math.max(T.TROPICAL_NIGHT, half(x.warmNight)) : T.TROPICAL_NIGHT,
    bitter: x ? Math.min(T.BITTER, half(x.bitter)) : T.BITTER,
    heavyDay: Math.max(T.HEAVY_DAY + 5, x?.heavyDay != null ? Math.round(x.heavyDay) : 0),
  };
}

/* ---------- the hours ---------- */
export const isWet = (h) => h && ((h.precip ?? 0) >= T.WET_MM || (isWetCode(h.code) && (h.pop ?? 0) >= 40));
// (straight to it, the hours being an hour apart: this is asked thousands of times a drawing; a step or two
// either way where the clocks change and an hour is repeated or skipped)
export const hourAt = (wx, w) => {
  const hs = wx.hourly, n = hs.length;
  if (!n) return null;
  let i = Math.min(n - 1, Math.max(0, Math.floor((w - hs[0].t) / HOUR)));
  while (i > 0 && hs[i].t > w) i--;
  while (i < n - 1 && hs[i].t + HOUR <= w) i++;
  return hs[i].t <= w && w < hs[i].t + HOUR ? hs[i] : null;
};
// the hours from the one we're in, for n hours
export function hoursFrom(wx, w, n) {
  const i = wx.hourly.findIndex((h) => h.t + HOUR > w);
  return i < 0 ? [] : wx.hourly.slice(i, i + n);
}
export const hoursBetween = (wx, a, b) => wx.hourly.filter((h) => h.t >= a && h.t < b);
// The chance (0 to 1) it stays dry from a to b: the share of the ensembles' runs dry the whole time (data.js keeps which
// are wet each hour), which over a long stretch is less than any one hour's own chance says. Each system that reaches
// right through the stretch has its say (data.js ENSEMBLES); null where none does, or the ensembles aren't in yet
const runsAt = new WeakMap();
const ones = (v) => { let k = 0; for (; v; k++) v &= v - 1; return k; };
export function dryChance(wx, a, b) {
  const ens = wx?.ensemble, sys = ens?.systems;
  if (!ens?.hourly?.length || !sys?.length || !(b > a)) return null;
  let at = runsAt.get(ens);
  if (!at) { at = new Map(ens.hourly.filter((e) => e.m).map((e) => [e.t, e])); runsAt.set(ens, at); }
  // each system's runs wet at some hour of it so far (false: a system that doesn't reach right through)
  const wet = sys.map(() => null);
  for (let t = Math.floor(a / HOUR) * HOUR; t < b; t += HOUR) {
    const e = at.get(t);
    if (!e) return null;
    sys.forEach((_, k) => {
      if (wet[k] === false) return;
      const m = e.m[k];
      wet[k] = !m ? false : wet[k] ? wet[k].map((v, i) => v | m[i]) : m.slice();
    });
  }
  let say = 0, dry = 0;
  sys.forEach((s, k) => { if (!wet[k]) return; say += s.say; dry += s.say * (1 - wet[k].reduce((x, v) => x + ones(v), 0) / s.n); });
  return say ? dry / say : null;
}
// The chance (0 to 1) of rain at some point from a to b, as the page tells it: the hours the radar leads (agree.js) by
// their own chances, the rest counted run by run across the ensembles (dryChance); null where neither reaches
export function rainChance(wx, a, b) {
  const from = Math.floor(a / HOUR) * HOUR;
  let dry = 1, t = from;
  for (const h of wx?.hourly || []) if (h.led != null && h.t >= from && h.t < b) { dry *= 1 - (h.pop ?? 0) / 100; t = Math.max(t, h.t + HOUR); }
  if (t >= b) return t > from ? 1 - dry : null;
  const rest = dryChance(wx, t, b);
  return rest == null ? null : 1 - dry * rest;
}
export const dayOf = (wx, w) => wx.daily.find((d) => d.key === keyOf(w)) || null;
const dayIndex = (wx, w) => wx.daily.findIndex((d) => d.key === keyOf(w));

// The kind of wet weather in some hours: storm, snow, sleet, showers, drizzle or rain
function wetKind(hours) {
  const wet = hours.filter(isWet);
  if (!wet.length) return null;
  const kinds = wet.map((h) => codeInfo(h.code).kind);
  if (kinds.includes("storm")) return "thunderstorms";
  const n = (k) => kinds.filter((x) => x === k).length;
  if (n("snow") >= wet.length / 2 || sum(wet.map((h) => h.snow)) > 0.5) return "snow";
  if (n("sleet") >= wet.length / 2) return "sleet";
  const heavy = wet.some((h) => (h.precip ?? 0) >= T.HEAVY_MMH);
  if (n("showers") >= wet.length / 2) return heavy ? "heavy showers" : "showers";
  if (n("drizzle") === wet.length && sum(wet.map((h) => h.precip)) < 1.5) return "drizzle";
  return heavy ? "heavy rain" : "rain";
}
// How cloudy some dry hours are, in a word (by day: sunny; by night: clear)
function skyWord(hours) {
  if (!hours.length) return "dry";
  if (hours.filter((h) => codeInfo(h.code).kind === "fog").length >= Math.max(1, hours.length / 3)) return "foggy";
  // (by day only if most of it is: sunny until 21:00 isn't, with the sun down at 19:00)
  const c = avg(hours, "cloud") ?? 50, day = hours.filter((h) => h.isDay).length > hours.length / 2;
  if (c < 20) return day ? "sunny" : "clear";
  if (c < 45) return day ? "mostly sunny" : "mostly clear";
  if (c < 75) return day ? "sunny spells" : "partly cloudy";
  if (c < 90) return "mostly cloudy";
  return day ? "cloudy" : "cloudy";
}
// A stretch of hours in words: "sunny spells", "rain", "cloudy, chance of a shower"
export function phrase(hours) {
  if (!hours.length) return "";
  const wet = hours.filter(isWet), kind = wetKind(hours), share = wet.length / hours.length;
  const sky = skyWord(hours.filter((h) => !isWet(h)));
  if (kind && share >= 0.5) return kind;
  if (kind === "showers" || kind === "heavy showers") return hours.some((h) => h.isDay) && sky !== "cloudy" && sky !== "mostly cloudy" ? `${sky === "sunny" ? "sunny spells" : sky} and ${kind}` : kind;
  if (kind === "thunderstorms") return `${sky} with a risk of thunderstorms`;
  if (kind) return `${sky} with ${kind === "drizzle" ? "some drizzle" : kind === "snow" ? "some snow" : kind === "sleet" ? "some sleet" : kind === "heavy rain" ? "some heavy rain" : "some rain"}`;
  const pop = max(hours, "pop") ?? 0;
  if (pop >= 35) return `${sky} with a chance of a shower`;
  return sky;
}

/* ---------- a day, part by part ---------- */
const PARTS = [["morning", 6, 12], ["afternoon", 12, 18], ["evening", 18, 24], ["overnight", 24, 30]];
export function dayParts(wx, key) {
  const d = wx.daily.find((x) => x.key === key);
  if (!d) return [];
  return PARTS.map(([name, a, b]) => {
    const hours = hoursBetween(wx, d.date + a * HOUR, d.date + b * HOUR);
    if (!hours.length) return null;
    const worst = hours.reduce((w, h) => (rank(h.code) > rank(w.code) ? h : w), hours[0]);
    const mid = hours[Math.floor(hours.length / 2)];
    // (its chance of rain: at some point in it, as a day's is, where the ensembles reach; else its likeliest hour's)
    const rc = rainChance(wx, hours[0].t, hours[hours.length - 1].t + HOUR);
    return {
      name, hours, phrase: phrase(hours), code: isWet(worst) || rank(worst.code) >= 3 ? worst.code : mid.code, isDay: mid.isDay,
      tmin: min(hours, "temp"), tmax: max(hours, "temp"), feels: avg(hours, "feels"), pop: rc != null ? Math.round(rc * 100) : max(hours, "pop"),
      precip: sum(hours.map((h) => h.precip)), gust: max(hours, "gust"), wind: avg(hours, "wind"), dir: mid.dir,
    };
  }).filter(Boolean);
}

// "Sunny spells in the morning, then rain from the afternoon. Around 6 mm of rain, mostly in the evening. Breezy at times."
// (not the high and low: they're beside it already; only how the high will feel, when that's different)
export function describeDay(wx, key, f) {
  const d = wx.daily.find((x) => x.key === key);
  if (!d) return "";
  const parts = dayParts(wx, key).filter((p) => p.name !== "overnight");
  const out = [];
  if (parts.length) {
    const segs = [];
    for (const p of parts) { const last = segs[segs.length - 1]; if (last && last.phrase === p.phrase) last.names.push(p.name); else segs.push({ phrase: p.phrase, names: [p.name] }); }
    if (segs.length === 1) out.push(`${cap(segs[0].phrase)} ${parts.length === 1 ? `in the ${parts[0].name}` : "all day"}.`);
    else {
      const bits = segs.map((s, i) => {
        const span = s.names.length === 1 ? `in the ${s.names[0]}` : i === segs.length - 1 ? `from the ${s.names[0]}` : `in the ${s.names.join(" and ")}`;
        // "mostly cloudy in the afternoon, then mostly cloudy with some drizzle" → "…, then some drizzle"
        const prev = segs[i - 1]?.phrase, ph = prev && s.phrase.startsWith(prev + " with ") ? s.phrase.slice(prev.length + 6) : s.phrase;
        return `${i === 0 ? cap(ph) : (i === segs.length - 1 ? "then " : "") + ph} ${span}`;
      });
      out.push(`${bits.join(", ")}.`);
    }
  }
  if ((d.precip ?? 0) >= 1) {
    // when most of it falls: the parts above, or the small hours before them (which they don't cover)
    const early = { name: "small hours", precip: sum(hoursBetween(wx, d.date, d.date + 6 * HOUR).map((h) => h.precip ?? 0)) };
    const wettest = [...parts, early].reduce((w, p) => (p.precip > (w?.precip ?? 0) ? p : w), null);
    const where = wettest && (parts.length > 1 || wettest === early) ? `, ${wettest.precip >= d.precip * 0.9 ? "" : "mostly "}in the ${wettest.name}` : "";
    const snow = (d.snow ?? 0) >= 0.5;
    out.push(snow ? `Around ${f.snow ? f.snow(d.snow) : `${Math.round(d.snow)} cm`} of snow${where}.` : `Around ${f.precip(d.precip)} of rain${where}.`);
  } else if ((d.popMax ?? 0) >= 30) out.push(`${Math.round(d.popMax)}% chance of a shower.`);
  if ((d.gustMax ?? 0) >= T.GALE) out.push(`Very windy, gusts up to ${f.wind(d.gustMax)}.`);
  else if ((d.gustMax ?? 0) >= T.WINDY) out.push(`Windy, gusts up to ${f.wind(d.gustMax)}.`);
  else if ((d.gustMax ?? 0) >= 38) out.push(`Breezy at times.`);
  if (d.fmax != null && d.tmax - d.fmax >= 3) out.push(`The high feels more like ${f.temp(d.fmax)}.`);
  else if (d.fmax != null && d.fmax - d.tmax >= 3) out.push(`The high feels like ${f.temp(d.fmax)} in the humidity.`);
  return out.join(" ");
}

/* ---------- the headline ---------- */
// Rain spells in some hours, allowing a dry hour inside one: [{ start, end (exclusive), hours }] (an hour's rain is the
// hour up to its time, as Open-Meteo gives it: a wet 16:00 is rain from 15:00)
export function spells(hours) {
  const out = [];
  let cur = null, gap = 0;
  for (const h of hours) {
    if (isWet(h)) { if (!cur) cur = { start: h.t - HOUR, end: h.t, hours: [] }; cur.hours.push(h); cur.end = h.t; gap = 0; }
    else if (cur && ++gap > 1) { out.push(cur); cur = null; gap = 0; }
  }
  if (cur) out.push(cur);
  return out;
}
export function headline(wx, now, f) {
  const hours = hoursFrom(wx, now, 18);
  if (!hours.length) return "";
  // (the first of the hours can be all past: its rain's the hour up to now)
  const end = hours[hours.length - 1].t, wets = spells(hours).filter((x) => x.end > now);
  const nc = nowcast(wx, now, f), out = [], ncKind = nc?.kind.endsWith("snow") ? "snow" : "rain";
  // the quarter-hours, where there are any, know better than the hours whether it's raining yet (the radar's, where
  // it sees: app.js); and rain they see coming that the hours don't is a spell of its own
  const quarters = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now).length >= 4;
  if (quarters && nc && !nc.now && nc.startsAt) {
    const until = nc.endsAt ?? nc.startsAt + HOUR;
    if (!wets.some((x) => x.start < until && x.end > nc.startsAt)) { wets.push({ start: nc.startsAt, end: until, hours: [], kind: ncKind }); wets.sort((x, y) => x.start - y.start); }
  }
  const rainingNow = quarters ? !!nc?.now : !!(wets[0] && wets[0].start <= now);
  const kindOf = (s) => s.kind || wetKind(s.hours) || "rain";
  const skyAfter = (t) => phrase(hoursBetween(wx, t, t + 4 * HOUR).filter((h) => !isWet(h))) || "drier";
  if (rainingNow) {
    const s = wets[0] && wets[0].start <= now + HOUR ? wets[0] : null, k = s ? kindOf(s) : ncKind;
    const stop = nc?.now && nc.endsAt ? nc.endsAt : s && s.end < end ? s.end : null;
    if (stop) out.push(`${cap(k)} easing ${stop - now <= 45 * 60e3 ? "soon" : `around ${f.said(Math.round(stop / 900e3) * 900e3)}`}, then ${skyAfter(stop)}.`);
    else out.push(`${cap(k)} for the next several hours.`);
    const next = wets.find((x) => x.start > (stop || end));
    if (next) out.push(`More ${kindOf(next)} ${f.when(next.start, now)}.`);
  } else if (wets.length) {
    // spells close together are one wet spell, on and off
    const cl = [wets[0]];
    for (const x of wets.slice(1)) { if (x.start - cl[cl.length - 1].end <= 3 * HOUR) cl.push(x); else break; }
    const first = cl[0], last = cl[cl.length - 1], k = cl.length > 1 ? wetKind(cl.flatMap((x) => x.hours)) || "rain" : kindOf(first);
    const sky = phrase(hoursBetween(wx, now - HOUR, first.start).filter((h) => !isWet(h)));
    // when it starts: by the quarter hour if the nowcast sees it coming, else by the hour
    const byQuarter = nc && !nc.now && nc.startsAt && nc.startsAt >= first.start - HOUR && nc.startsAt <= first.end;
    // (and when it stops, by the quarter hour too, where it's one spell and they see that)
    const stopAt = nc && !nc.now && nc.endsAt && cl.length === 1 && Math.abs(nc.endsAt - last.end) <= HOUR ? nc.endsAt : last.end;
    const len = (stopAt - first.start) / HOUR, startAt = Math.max(byQuarter ? nc.startsAt : first.start, Math.ceil(now / 900e3) * 900e3);
    const soon = first.start - now <= 90 * 60e3, q = (t) => f.said(Math.round(t / 900e3) * 900e3);
    const lead = soon ? `${cap(k)} on the way from about ${q(startAt)}` : `${cap(sky || "dry")} until about ${q(byQuarter ? nc.startsAt : first.start)}, then ${k}`;
    const onoff = cl.length > 1 ? `${soon ? "," : ""} on and off` : "";
    const dur = last.end >= end ? `, lasting into ${f.when(end - HOUR, now)}` : len <= 2 && !onoff ? `${soon ? "," : ""} for an hour or two` : ` until around ${q(stopAt)}`;
    out.push(`${lead}${onoff}${dur}.`);
    const next = wets[cl.length];
    if (next) { const w = f.when(next.start, now); out.push(`More ${kindOf(next)} ${w === f.when(last.start, now) ? "later " : ""}${w}.`); }
  } else {
    // (in the small hours, before the sun's up, the day's all to come: "today", its daylight, not "the rest of the day")
    const today = dayOf(wx, now), sunset = today?.sunset ?? dayStart(now) + 18 * HOUR, early = today?.sunrise != null && now < today.sunrise;
    const dayHours = hours.filter((h) => h.t < sunset && (!early || h.t + HOUR > today.sunrise)), night = hours.filter((h) => h.t >= sunset && h.t < sunset + 10 * HOUR);
    const a = dayHours.length >= 2 ? phrase(dayHours) : "", b = night.length ? phrase(night) : "", rest = early ? "today" : "for the rest of the day";
    if (a && b && a !== b) out.push(`Dry, ${a} ${rest} and ${b} tonight.`);
    else if (a) out.push(`Dry and ${a} ${rest}.`);
    else out.push(`Dry${b ? ` and ${b}` : ""} tonight.`);
  }
  // the temperature to come
  const h = hourOf(now), today = dayOf(wx, now), tomorrow = dayOf(wx, now + DAY);
  if (h < 15 && today) out.push(`High ${f.temp(Math.max(today.tmax, max(hours.slice(0, 1), "temp") ?? -99))}.`);
  else {
    const low = min(hoursBetween(wx, now, dayStart(now) + 33 * HOUR), "temp");
    if (low != null) out.push(`Down to ${f.temp(low)} tonight.`);
    if (h >= 18 && tomorrow) {
      const p = dayParts(wx, tomorrow.key).filter((x) => x.name === "morning" || x.name === "afternoon");
      const ph = p.length ? (p[0].phrase === p[p.length - 1].phrase ? p[0].phrase : `${p[0].phrase}, then ${p[p.length - 1].phrase}`) : "";
      out.push(`Tomorrow: ${ph ? ph + ", " : ""}${f.temp(tomorrow.tmax)}.`);
    }
  }
  return out.join(" ");
}

/* ---------- the next few hours, by the quarter hour ---------- */
// { now: raining now?, startsAt, endsAt, peak (mm/h), kind, text } or null if it's dry throughout
export function nowcast(wx, now, f) {
  const m = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now);
  if (m.length < 4) return null;
  const wet = (x) => (x.precip ?? 0) >= 0.05;     // per 15 minutes: 0.2 mm/h
  const nowWet = wet(m[0]) || (wx.current?.precip ?? 0) > 0.05 && wet(m[1] || {});
  const peak = Math.max(...m.map((x) => (x.precip ?? 0) * 4));
  if (!nowWet && !m.some(wet)) return null;
  const strength = peak >= T.HEAVY_MMH ? "heavy " : peak < 0.6 ? "light " : "";
  const snow = m.some((x) => codeInfo(x.code).kind === "snow");
  const what = snow ? "snow" : `${strength}rain`, span = m.length * 15;
  const mins = (t) => Math.max(0, Math.round((t - now) / 60e3 / 5) * 5);
  if (nowWet) {
    // when it stops: the first dry half hour
    let endsAt = null;
    for (let i = 1; i < m.length - 1; i++) if (!wet(m[i]) && !wet(m[i + 1])) { endsAt = m[i].t; break; }
    if (endsAt == null) return { now: true, endsAt: null, peak, kind: what, text: `${cap(what)} for at least the next ${Math.round(span / 60) === 1 ? "hour" : `${Math.round(span / 60)} hours`}.` };
    const again = m.findIndex((x, i) => x.t > endsAt + 15 * 60e3 && wet(x) && i > 0);
    // (an hour or more in hours: "in about 3h", not "in about 175 min")
    const about = (n) => (n < 60 ? `${n} min` : f.dur(Math.round(n / 15) * 15 * 60));
    const back = again > 0 ? ` Starting again in about ${about(mins(m[again].t))}.` : "";
    return { now: true, endsAt, peak, kind: what, text: `${cap(what)} stopping in about ${about(Math.max(5, mins(endsAt)))}.${back}` };
  }
  const i = m.findIndex(wet), startsAt = m[i].t;
  let j = i; while (j < m.length && (wet(m[j]) || (m[j + 1] && wet(m[j + 1])))) j++;
  const endsAt = j < m.length ? m[j].t : null, lasting = endsAt ? Math.round((endsAt - startsAt) / 60e3) : null;
  const dur = lasting == null ? "" : lasting <= 30 ? ", a short burst" : lasting < 60 ? `, lasting about ${lasting} min` : lasting <= 75 ? ", lasting about an hour" : `, lasting about ${f.dur(lasting * 60)}`;
  const inMin = mins(startsAt), lead = inMin <= 5 ? "starting any minute" : inMin < 60 ? `starting in about ${inMin} min` : `starting in about ${f.dur(Math.round(inMin / 15) * 15 * 60)}`;
  return { now: false, startsAt, endsAt, peak, kind: what, inMin, text: `${cap(what)} ${lead}${dur}.` };
}

/* ---------- how sure the forecast is ---------- */
// Where a day's high and low most likely land: the middle 80% of the ensembles' runs, moved as far as the day's high
// and low were steadied and tuned for here (the same lean taken off), so a high isn't shown outside its own likely range.
// { hi: [from, to], lo: [from, to] | null }, or null without the ensemble
export function likely(d, ens) {
  if (!ens || ens.tmaxP10 == null || ens.tmaxP90 == null) return null;
  // (as far as the day's moved from the latest run: steadied (skill.js steady), tuned, or both)
  const base = d?.latest || d?.raw, up = base ? d.tmax - base.tmax : 0, down = base ? d.tmin - base.tmin : 0;
  return { hi: [ens.tmaxP10 + up, ens.tmaxP90 + up], lo: ens.tminP10 == null || ens.tminP90 == null ? null : [ens.tminP10 + down, ens.tminP90 + down] };
}
// Per day: the ensembles' spread (their runs pooled: data.js ENSEMBLES) and whether the big models agree.
// { [key]: { score 5..98, level: high | medium | low, tLo, tHi, wetModels, nModels, ensWet, why } }
export function confidence(wx) {
  const out = {};
  wx.daily.forEach((d, i) => {
    const ens = wx.ensemble?.days?.[d.key], mod = wx.models?.days?.[d.key]?.filter((m) => m.tmax != null) || [];
    const lead = Math.max(0, i - 1);
    let score = 96 - lead * 5.5, why = [];
    let tLo = null, tHi = null, wetModels = null, nModels = null, ensWet = null;
    if (ens && ens.tmaxP90 != null) {
      const spread = ens.tmaxP90 - ens.tmaxP10;
      [tLo, tHi] = likely(d, ens).hi; ensWet = ens.wet;
      score = 100 - Math.max(0, spread - 1) * 9;
      if (ensWet != null) score -= (1 - Math.abs(2 * ensWet - 1)) * 30;
    }
    if (mod.length >= 3) {
      // (each model's high with its usual lean here taken off, where that's known: one that always runs cold isn't
      // disagreeing with the others)
      const lean = wx.skill?.skill?.byId || {}, ts = mod.map((m) => m.tmax - (lean[m.id]?.hiBias ?? 0)), range = Math.max(...ts) - Math.min(...ts);
      // (of those with a rain figure)
      const said = mod.filter((m) => m.precip != null);
      wetModels = said.filter((m) => m.precip >= 1).length; nModels = said.length || null;
      const agree = said.length ? Math.abs(2 * wetModels / said.length - 1) : 1;
      const mScore = 100 - Math.max(0, range - 1.5) * 8 - (1 - agree) * 30;
      score = ens && ens.tmaxP90 != null ? (score * 0.6 + mScore * 0.4) : mScore - lead * 2;
      if (tLo == null) { tLo = Math.min(...ts); tHi = Math.max(...ts); }
      if (range >= 4) why.push("temperature");
      if (agree < 0.5) why.push("rain");
    } else if (ensWet != null && ensWet > 0.3 && ensWet < 0.7) why.push("rain");
    score = Math.round(clamp(score, 5, 98));
    out[d.key] = { score, level: score >= 70 ? "high" : score >= 45 ? "medium" : "low", tLo, tHi, wetModels, nModels, ensWet, why };
  });
  return out;
}

/* ---------- how nice a day looks ---------- */
export function dayScore(d) {
  if (!d) return 0;
  const sun = d.daylight ? clamp((d.sunshine ?? 0) / d.daylight, 0, 1) : 0.5;
  const dry = 1 - clamp((d.precip ?? 0) / 10, 0, 1) * 0.6 - clamp((d.precipHours ?? 0) / 12, 0, 1) * 0.4;
  const calm = 1 - clamp(((d.gustMax ?? 0) - 25) / 50, 0, 1);
  const comfort = 1 - clamp(Math.abs((d.fmax ?? d.tmax ?? 18) - 21) / 16, 0, 1);
  return Math.round(100 * (0.3 * sun + 0.4 * clamp(dry, 0, 1) + 0.15 * calm + 0.15 * comfort));
}

/* ---------- day-by-day UTC offsets (for the Sun and Moon, which run on real time) ---------- */
// (kept: working out a day's sky takes a couple of milliseconds, and it's asked for many times a drawing)
const skies = new Map();
export function skyFor(wx, key) {
  const d = wx.daily.find((x) => x.key === key);
  if (!d) return null;
  const id = `${wx.place.lat},${wx.place.lon},${key},${d.sunrise},${wx.place.offset ?? 0}`;
  if (skies.has(id)) return skies.get(id);
  // (that day's own clock: just this day's, not every day's)
  const off = offsetFor(d.sunrise, wx.place.lat, wx.place.lon, wx.place.offset ?? 0) ?? wx.place.offset ?? 0;
  const toWall = (t) => (t == null ? null : t + off * 1000);
  const s = skyDay(d.date - off * 1000, wx.place.lat, wx.place.lon), w = {};
  for (const [k, v] of Object.entries(s)) w[k] = Array.isArray(v) ? v.map(toWall) : typeof v === "number" && v > 1e11 ? toWall(v) : v;
  w.offset = off;
  skies.set(id, Object.freeze(w));
  if (skies.size > 120) skies.delete(skies.keys().next().value);
  return w;
}

/* ---------- the best times ---------- */
// Each activity scores each daylight hour 0..1; the best stretch of a couple of hours wins.
function comfortOf(feels, lo, hi) { return feels == null ? 0.5 : feels < lo ? clamp(1 - (lo - feels) * 0.09, 0, 1) : feels > hi ? clamp(1 - (feels - hi) * 0.1, 0, 1) : 1; }
function dryOf(h) { if (isWet(h)) return 0; const p = h.pop ?? 0; return p < 15 ? 1 : p < 30 ? 0.8 : p < 50 ? 0.55 : 0.3; }
// Activities, each with its own limits (yours to change in Settings; all metric):
//   tmin–tmax   the feels-like range it's best in        windMin–windMax   km/h (sailing needs some)
//   gustMax     km/h                                     rain   "dry" | "light" (drizzle and showers are fine) | "any"
//   hours       how long you'll be out                   from–to   the hours of the day it can happen in
export const ACTIVITIES = {
  run: { name: "Run", icon: "run", tmin: 6, tmax: 16, windMin: 0, windMax: 25, gustMax: 45, rain: "dry", hours: 1, from: 6, to: 21 },
  walk: { name: "Walk", icon: "walk", tmin: 10, tmax: 22, windMin: 0, windMax: 30, gustMax: 50, rain: "dry", hours: 2, from: 7, to: 20 },
  cycle: { name: "Ride", icon: "bike", tmin: 9, tmax: 22, windMin: 0, windMax: 20, gustMax: 45, rain: "dry", hours: 2, from: 6, to: 20 },
  golf: { name: "Golf", icon: "flag", tmin: 10, tmax: 24, windMin: 0, windMax: 25, gustMax: 40, rain: "dry", hours: 4, from: 7, to: 19 },
  sail: { name: "Sailing", icon: "sail", tmin: 12, tmax: 26, windMin: 12, windMax: 35, gustMax: 45, rain: "light", hours: 3, from: 8, to: 19 },
  garden: { name: "Gardening", icon: "leaf", tmin: 8, tmax: 25, windMin: 0, windMax: 30, gustMax: 50, rain: "dry", hours: 2, from: 8, to: 19 },
  tennis: { name: "Tennis", icon: "tennis", tmin: 10, tmax: 28, windMin: 0, windMax: 20, gustMax: 35, rain: "dry", hours: 1, from: 7, to: 21 },
  hike: { name: "Hike", icon: "mountain", tmin: 5, tmax: 20, windMin: 0, windMax: 35, gustMax: 55, rain: "light", hours: 4, from: 7, to: 19 },
  bbq: { name: "Barbecue", icon: "flame", tmin: 15, tmax: 30, windMin: 0, windMax: 25, gustMax: 40, rain: "dry", hours: 3, from: 16, to: 22, anyLight: true },
  swim: { name: "Outdoor swim", icon: "swim", tmin: 18, tmax: 32, windMin: 0, windMax: 25, gustMax: 40, rain: "light", hours: 1, from: 7, to: 20 },
};
export const DEFAULT_ACTIVITIES = ["run", "walk", "cycle"].map((id) => ({ id, on: true, ...ACTIVITIES[id] }));
// How good one hour is for an activity, 0 to 1 (joint: the stretch's chance of staying dry is reckoned with apart,
// from the ensemble's runs, so an hour's own chance of rain isn't counted here as well; a wet hour still is)
export function activityScore(h, prev, a, joint = false) {
  let s = comfortOf(h.feels ?? h.temp, a.tmin, a.tmax);
  const w = h.wind ?? 0;
  if (a.windMin > 0 && w < a.windMin) s *= clamp(w / a.windMin, 0.1, 1);
  if (w > a.windMax) s *= clamp(1 - (w - a.windMax) / 15, 0.2, 1);
  if ((h.gust ?? 0) > a.gustMax) s *= 0.5;
  if (a.rain === "dry") s *= (joint ? (isWet(h) ? 0 : 1) : dryOf(h)) * (prev && isWet(prev) ? 0.85 : 1);
  else if (a.rain === "light") s *= isWet(h) ? ((h.precip ?? 0) < 1 && codeInfo(h.code).wet < 3 ? 0.75 : 0.2) : 1;
  if (a.id === "run" && (h.uv ?? 0) > 6) s *= 0.85;
  // by the sea (data.js shapeMarine): a swim in it as warm as the water, and calm enough; sailing in waves not too big
  if (a.id === "swim" && h.sst != null) s *= h.sst >= 17 ? 1 : h.sst >= 14 ? 0.8 : h.sst >= 11 ? 0.55 : 0.3;
  if (a.id === "swim" && (h.wave ?? 0) > 0.8) s *= clamp(1 - (h.wave - 0.8) / 1.2, 0.3, 1);
  if (a.id === "sail" && (h.wave ?? 0) > 2) s *= clamp(1 - (h.wave - 2) / 1.5, 0.2, 1);
  return clamp(s, 0, 1);
}
const rateOf = (s) => (s >= 0.8 ? "Great" : s >= 0.6 ? "Good" : s >= 0.4 ? "Fair" : "Poor");
// limits in words: "6–16°, wind under 25 mph, dry"
export function limitsText(a, f) {
  const wind = a.windMin > 0 ? `wind ${f.wind(a.windMin).replace(/ \S+$/, "")}–${f.wind(a.windMax)}` : `wind under ${f.wind(a.windMax)}`;
  return `${f.temp(a.tmin)}–${f.temp(a.tmax)}, ${wind}, ${a.rain === "dry" ? "dry" : a.rain === "light" ? "light rain is fine" : "any weather"}, ${a.hours} h`;
}
// opts.activities: your list (Settings); opts.extras: { laundry, stars, sunset } on or off
export function windows(wx, now, f, opts = {}) {
  const out = [], acts = (opts.activities || DEFAULT_ACTIVITIES).filter((a) => a.on !== false);
  const horizon = hoursFrom(wx, now, 48).filter((h) => h.t >= now - 30 * 60e3);
  const describe = (hs, dry, a) => {
    const t = avg(hs, "temp"), w = avg(hs, "wind"), pop = max(hs, "pop") ?? 0;
    const wind = w < 12 ? "light winds" : w < 25 ? "a breeze" : "windy";
    const rain = dry != null && !hs.some(isWet) ? (dry >= 0.9 ? "Dry" : `${Math.round(dry * 100)}% chance it stays dry`) : pop < 20 ? "Dry" : `${Math.round(pop)}% chance of rain`;
    // (by the sea: the water's warmth for a swim, the waves for sailing)
    const sst = avg(hs.filter((h) => h.sst != null), "sst"), wave = max(hs.filter((h) => h.wave != null), "wave");
    const sea = a.id === "swim" && sst != null ? `, sea ${f.temp(sst)}` : a.id === "sail" && wave != null ? `, waves ${f.height(wave)}` : "";
    return `${rain}, ${f.temp(t)}, ${wind}${sea}`;
  };
  for (const a of acts) {
    const len = Math.max(1, Math.min(8, Math.round(a.hours || 1)));
    const ok = horizon.filter((h) => { const hh = hourOf(h.t); return hh >= a.from && hh + 1 <= Math.max(a.from + 1, a.to) && (h.isDay || a.anyLight); });
    let best = null;
    for (let i = 0; i + len <= ok.length; i++) {
      const hs = ok.slice(i, i + len);
      if (hs[hs.length - 1].t - hs[0].t !== (len - 1) * HOUR) continue;     // a stretch without a gap (the night)
      // the stretch is as good as its average, held back by its worst hour, and by its chance of rain at any time in it
      // (where the ensemble's in: how many of its runs stay dry throughout, for what needs it dry or will take light rain)
      const rc = a.rain === "any" ? null : rainChance(wx, hs[0].t, hs[hs.length - 1].t + HOUR), dry = rc == null ? null : 1 - rc;
      const each = hs.map((h) => activityScore(h, hourAt(wx, h.t - HOUR), a, dry != null));
      const s = (0.7 * (sum(each) / each.length) + 0.3 * Math.min(...each)) * (dry == null ? 1 : a.rain === "dry" ? 0.3 + 0.7 * dry : 0.8 + 0.2 * dry);
      // sooner is better, a little: today beats tomorrow at the same score
      const adj = s - (hs[0].t - now) / DAY * 0.04;
      if (!best || adj > best.adj) best = { adj, s, hs, dry };
    }
    out.push(best ? { id: a.id, name: a.name, icon: a.icon, start: best.hs[0].t, end: best.hs[best.hs.length - 1].t + HOUR, score: best.s, rating: rateOf(best.s), text: describe(best.hs, best.dry, a) }
      : { id: a.id, name: a.name, icon: a.icon, start: null, end: null, score: 0, rating: "Poor", text: "No time in its hours in the next two days" });
  }
  const x = opts.extras || {};
  const dry = x.laundry !== false && drying(wx, now, f); if (dry) out.push(dry);
  const st = x.stars !== false && stargazing(wx, now, f); if (st) out.push(st);
  const sun = x.sunset !== false && sunsets(wx, now, f); if (sun) out.push(sun);
  return out;
}
// Drying the washing outside: the longest dry daytime stretch, scored by how thirsty the air is (VPD), the breeze and the sun
function drying(wx, now, f) {
  let best = null;
  for (const d of [dayOf(wx, now), dayOf(wx, now + DAY)].filter(Boolean)) {
    const hs = hoursBetween(wx, Math.max(d.date + 8 * HOUR, Math.ceil(now / HOUR) * HOUR), d.date + 19 * HOUR).filter((h) => h.isDay);
    let run = [];
    const flush = () => {
      if (run.length >= 3) {
        const vpd = avg(run, "vpd") ?? 0.5, wind = avg(run, "wind") ?? 10, sunny = avg(run, "sun") ?? 1800;
        const s = clamp(vpd / 1.2, 0, 1) * 0.45 + clamp(wind / 20, 0, 1) * 0.25 + clamp(sunny / 3600, 0, 1) * 0.3;
        const long = clamp(run.length / 6, 0.5, 1), score = s * long;
        if (!best || score > best.score) best = { score, run: run.slice() };
      }
      run = [];
    };
    for (const h of hs) { if (!isWet(h) && (h.pop ?? 0) < 35) run.push(h); else flush(); }
    flush();
  }
  if (!best) return { id: "laundry", name: "Washing out", icon: "shirt", start: null, end: null, score: 0, rating: "Poor", text: "No dry spell long enough today or tomorrow" };
  const r = best.run, score = clamp(best.score * 1.15, 0, 1);
  return { id: "laundry", name: "Washing out", icon: "shirt", start: r[0].t, end: r[r.length - 1].t + HOUR, score,
    rating: score >= 0.7 ? "Great" : score >= 0.5 ? "Good" : score >= 0.3 ? "Fair" : "Poor",
    text: `${r.length} dry hours, ${(avg(r, "vpd") ?? 0) >= 0.8 ? "dry air" : "damp air"}${(avg(r, "wind") ?? 0) >= 10 ? ", a breeze" : ""}${(avg(r, "sun") ?? 0) >= 1800 ? ", sunshine" : ""}` };
}
// The best of the next three nights for the stars: dark, clear, and the Moon out of the way
export function stargazing(wx, now, f) {
  let best = null;
  for (let k = 0; k < 3; k++) {
    const d = dayOf(wx, now + k * DAY); if (!d) continue;
    const sky = skyFor(wx, d.key), next = skyFor(wx, keyOf(d.date + DAY));
    const from = sky?.darkStart ?? sky?.dusk ?? d.date + 21 * HOUR, to = next?.darkEnd ?? next?.dawn ?? d.date + 30 * HOUR;
    const hs = hoursBetween(wx, Math.max(from, now), Math.min(to, d.date + 26 * HOUR + HOUR));
    if (hs.length < 2) continue;
    const off = sky.offset;
    for (let i = 0; i + 2 <= hs.length; i++) {
      const pair = hs.slice(i, i + 2);
      const cloud = avg(pair, "cloud") ?? 100;
      if (pair.some(isWet)) continue;
      const mid = pair[0].t + HOUR, moonAlt = moonAt(mid - off * 1000, wx.place.lat, wx.place.lon).alt;
      const lit = sky.phase.lit, moonCost = moonAlt > 0 ? lit * 0.6 : 0;
      const s = clamp(1 - cloud / 60, 0, 1) * (1 - moonCost) * ((avg(pair, "vis") ?? 20000) < 10000 ? 0.7 : 1);
      if (!best || s > best.score + 0.02) best = { score: s, start: pair[0].t, end: pair[1].t + HOUR, cloud, lit, moonUp: moonAlt > 0 };
    }
  }
  if (!best) return null;
  const r = best.score;
  return { id: "stars", name: "Stargazing", icon: "stars", start: best.start, end: best.end, score: r,
    rating: r >= 0.75 ? "Great" : r >= 0.5 ? "Good" : r >= 0.25 ? "Fair" : "Poor",
    text: `${best.cloud < 15 ? "Clear skies" : best.cloud < 40 ? "Mostly clear" : "Some cloud"}, Moon ${Math.round(best.lit * 100)}% lit${best.moonUp ? " and up" : " and down"}` };
}
// Will tonight's (or the next) sunset light up? High and mid cloud catch the colour; low cloud and rain block it.
export function sunsetScore(h) {
  if (!h) return null;
  if (isWet(h)) return 0.05;
  const lo = (h.cloudLow ?? 0) / 100, mid = (h.cloudMid ?? 0) / 100, hi = (h.cloudHigh ?? 0) / 100;
  const canvas = clamp(hi * 1.1 + mid * 0.7, 0, 1), shape = canvas < 0.15 ? 0.45 : canvas > 0.85 ? 0.55 : 1;
  return clamp((0.35 + 0.65 * Math.min(1, canvas * 1.6)) * shape * (1 - lo * 0.9), 0, 1);
}
function sunsets(wx, now, f) {
  const cands = [];
  for (let k = 0; k < 2; k++) {
    const d = dayOf(wx, now + k * DAY); if (!d) continue;
    for (const [what, t] of [["Sunrise", d.sunrise], ["Sunset", d.sunset]]) {
      if (t == null || t < now - 20 * 60e3) continue;
      const h = hourAt(wx, t - 30 * 60e3) || hourAt(wx, t);
      const s = sunsetScore(h); if (s == null) continue;
      cands.push({ what, t, s, h });
    }
  }
  if (!cands.length) return null;
  const best = cands.slice(0, 3).reduce((b, c) => (c.s > b.s + 0.1 ? c : b), cands[0]);
  const s = best.s, h = best.h;
  const why = isWet(h) ? "rain in the way" : (h.cloudLow ?? 0) > 60 ? "low cloud in the way" : ((h.cloudHigh ?? 0) + (h.cloudMid ?? 0)) < 20 ? "clear sky, gentle colours" : "high cloud to catch the light";
  return { id: "sunset", name: best.what === "Sunset" ? "Sunset colour" : "Sunrise colour", icon: best.what === "Sunset" ? "sunset" : "sunrise", start: best.t, end: null, score: s,
    rating: s >= 0.75 ? "Great" : s >= 0.5 ? "Good" : s >= 0.3 ? "Fair" : "Poor", text: cap(why) };      // (the card shows the day and time above it)
}

/* ---------- the cards ---------- */
// Each: { id, level: alert | warn | tip | good | info, icon, title, text, score (higher first) }
export function insights(wx, now, f, opts = {}) {
  const cards = [], add = (c) => c && cards.push(c);
  const next48 = hoursFrom(wx, now, 48), next24 = next48.slice(0, 24);
  const today = dayOf(wx, now), ti = dayIndex(wx, now);
  if (!today) return cards;

  /* warnings */
  // thunderstorms
  const storm = next48.find((h) => codeInfo(h.code).kind === "storm" || ((h.cape ?? 0) >= 800 && (h.li ?? 0) <= -2 && (h.pop ?? 0) >= 40));
  if (storm) add({ id: "storm", level: "warn", icon: "storm", title: "Thunderstorms possible", short: fit(`${cap(f.when(storm.t, now))}, from ${f.time(storm.t)}`, cap(f.when(storm.t, now))), text: `${cap(f.when(storm.t, now))}, from around ${f.time(storm.t)}. Lightning, downpours and gusty winds are possible.`, score: 95 });
  // heavy rain
  const L = limitsHere(wx), wettest = argmax(next48, "precip"), sum24 = sum(next24.map((h) => h.precip));
  if (wettest && (wettest.precip >= T.VERY_HEAVY_MMH || sum24 >= L.heavyDay)) {
    add({ id: "heavyrain", level: sum24 >= L.heavyDay * 1.6 ? "alert" : "warn", icon: "rain", title: "Heavy rain", short: fit(`${f.precip(sum24)}, most ${f.when(wettest.t, now)}`, `${f.precip(sum24)} in 24 hours`), text: `${f.precip(sum24)} in the next 24 hours, heaviest ${f.when(wettest.t, now)} (${f.rate(wettest.precip)}). Surface water and spray on the roads.`, score: 90 });
  }
  // wind
  const gusty = argmax(next48, "gust");
  if (gusty && gusty.gust >= T.WINDY) {
    const lvl = gusty.gust >= T.DAMAGING ? "alert" : gusty.gust >= T.GALE ? "warn" : "tip";
    add({ id: "wind", level: lvl, icon: "wind", title: gusty.gust >= T.DAMAGING ? "Damaging gusts" : gusty.gust >= T.GALE ? "Gales" : "Windy", short: fit(`Gusts ${f.wind(gusty.gust)} ${f.when(gusty.t, now)}`, `Gusts up to ${f.wind(gusty.gust)}`), text: `Gusts up to ${f.wind(gusty.gust)} ${f.when(gusty.t, now)}, from the ${compassWord(gusty.dir ?? 0)}.${gusty.gust >= T.GALE ? " Secure loose things outside." : ""}`, score: lvl === "alert" ? 92 : lvl === "warn" ? 85 : 60 });
  }
  // snow
  const snow48 = sum(next48.map((h) => h.snow));
  if (snow48 >= 0.5) {
    const first = next48.find((h) => (h.snow ?? 0) > 0.1);
    add({ id: "snow", level: snow48 >= 5 ? "alert" : "warn", icon: "snow", title: snow48 >= 5 ? "Heavy snow" : "Snow", short: fit(`${f.snow ? f.snow(snow48) : `${Math.round(snow48)} cm`} from ${f.when(first.t, now)}`, `About ${f.snow ? f.snow(snow48) : `${Math.round(snow48)} cm`}`), text: `About ${f.snow ? f.snow(snow48) : `${Math.round(snow48)} cm`} in the next two days, starting ${f.when(first.t, now)}.`, score: 88 });
  }
  // ice: freezing with wet ground (rain in the six hours before, or falling)
  const icy = next48.find((h, i) => (h.temp ?? 9) <= 0.5 && (isWet(h) || next48.slice(Math.max(0, i - 6), i).some((p) => (p.precip ?? 0) >= 0.2)));
  if (icy) add({ id: "ice", level: "warn", icon: "ice", title: "Icy patches", short: fit(`Down to ${f.temp(icy.temp)} ${f.when(icy.t, now)}`, `Down to ${f.temp(icy.temp)}`), text: `Down to ${f.temp(icy.temp)} on wet ground ${f.when(icy.t, now)}. Pavements and untreated roads could be slippery.`, score: 87 });
  // frost (tonight, or the next night), unless nearly every night freezes at this time of year here
  const nights = next48.filter((h) => !h.isDay);
  const cold = argmin(nights, "temp"), usual = cold && wx.climate && (climateOn(wx.climate, cold.t)?.frost ?? 0) >= 0.8;
  if (cold && !icy && !usual) {
    const near = nights.filter((h) => Math.abs(h.t - cold.t) <= 6 * HOUR && h.temp <= cold.temp + 1.5);    // the coldest hours
    const clear = (avg(near, "cloud") ?? 100) < 35, calm = (avg(near, "wind") ?? 20) < 10;
    if (cold.temp <= 0) add({ id: "frost", level: "warn", icon: "frost", title: "Frost", short: fit(`Down to ${f.temp(cold.temp)} ${f.when(cold.t, now)}`, `Down to ${f.temp(cold.temp)}`), text: `Down to ${f.temp(cold.temp)} ${f.when(cold.t, now)}. Leave time to de-ice the car, and bring tender plants in.`, score: 80 });
    else if (cold.temp <= 3 && clear && calm) add({ id: "frost", level: "tip", icon: "frost", title: "Ground frost possible", short: fit(`${f.temp(cold.temp)} ${f.when(cold.t, now)}, clear and calm`, `${f.temp(cold.temp)} ${f.when(cold.t, now)}`), text: `${f.temp(cold.temp)} ${f.when(cold.t, now)} under clear, calm skies: grass and car roofs could freeze.`, score: 62 });
  }
  // fog
  const foggy = next24.find((h) => codeInfo(h.code).kind === "fog" || ((h.vis ?? 1e5) < T.FOG_M && !isWet(h)));
  if (foggy) {
    const run = next24.filter((h) => h.t >= foggy.t && h.t < foggy.t + 8 * HOUR && (codeInfo(h.code).kind === "fog" || (h.vis ?? 1e5) < T.FOG_M));
    const vis = min(run, "vis");
    add({ id: "fog", level: "warn", icon: "fog", title: "Fog", short: fit(`${cap(f.when(foggy.t, now))}, from ${f.time(foggy.t)}`, cap(f.when(foggy.t, now))), text: `Likely ${f.when(foggy.t, now)}, from about ${f.time(foggy.t)}${vis != null && vis < T.FOG_M ? `, visibility down to ${f.dist(Math.max(50, Math.round(vis / 50) * 50))}` : ""}. Allow extra time on the roads.`, score: 78 });
  }
  // heat and cold
  // (feeling like the fixed thresholds, and where summers here are hotter, as hot as their warmest days too)
  const hot = argmax(next48, "feels"), peak = max(next48, "temp") ?? -99;
  const veryHot = hot && hot.feels >= T.VERY_HOT && (L.veryHot == null || peak >= L.veryHot);
  if (hot && hot.feels >= T.HOT && (veryHot || L.hot == null || peak >= L.hot)) {
    const here = veryHot ? (L.veryHot != null ? ", as hot as summer gets here" : "") : L.hot != null ? ", hotter than most summer days here" : "";
    add({ id: "heat", level: veryHot ? "warn" : "tip", icon: "heat", title: veryHot ? "Very hot" : "Hot", short: fit(`Feels like ${f.temp(hot.feels)} ${f.when(hot.t, now)}`, `Feels ${f.temp(hot.feels)} ${f.when(hot.t, now)}`, `Feels like ${f.temp(hot.feels)}`), text: `Feels like ${f.temp(hot.feels)} ${f.when(hot.t, now)}${here}. Drink plenty, find shade around midday, and check on anyone vulnerable.`, score: veryHot ? 84 : 66 });
  }
  const warmNight = nights.length && min(nights.slice(0, 12), "temp");
  if (warmNight != null && warmNight >= L.warmNight) add({ id: "warmnight", level: "tip", icon: "moon", title: "Warm night", short: `No lower than ${f.temp(warmNight)} tonight`, text: `It won't drop below ${f.temp(warmNight)} tonight${L.warmNight > T.TROPICAL_NIGHT ? ", warmer than most summer nights here" : ""}. Open windows on the shady side early, close them as it warms.`, score: 58 });
  const bitter = argmin(next48, "feels");
  if (bitter && bitter.feels <= L.bitter) add({ id: "bitter", level: "warn", icon: "cold", title: "Bitterly cold", short: fit(`Feels like ${f.temp(bitter.feels)} ${f.when(bitter.t, now)}`, `Feels ${f.temp(bitter.feels)} ${f.when(bitter.t, now)}`, `Feels like ${f.temp(bitter.feels)}`), text: `Feels like ${f.temp(bitter.feels)} ${f.when(bitter.t, now)}${L.bitter < T.BITTER ? ", colder than most winter nights here" : ""}. Hat, gloves and layers.`, score: 79 });
  // UV
  const uvHours = next24.filter((h) => h.t < dayStart(now) + DAY && (h.uv ?? 0) >= T.UV_SUN);
  const uvPeak = argmax(next24.filter((h) => h.t < dayStart(now) + DAY), "uv");
  if (uvPeak && Math.round(uvPeak.uv) >= T.UV_HIGH) {      // (by the number it says: "UV 6" is high)
    const burn = Math.round(167 / uvPeak.uv / 5) * 5;
    add({ id: "uv", level: Math.round(uvPeak.uv) >= 8 ? "warn" : "tip", icon: "uv", title: `${Math.round(uvPeak.uv) >= 8 ? "Very high" : "High"} UV`, short: `UV ${Math.round(uvPeak.uv)} around ${f.time(uvPeak.t)}: sunscreen`, text: `UV ${Math.round(uvPeak.uv)} around ${f.time(uvPeak.t)}: fair skin can burn in about ${burn} minutes. Sunscreen from ${f.time(uvHours[0].t)} to ${f.time(uvHours[uvHours.length - 1].t + HOUR)}.`, score: 70 });
  }
  // air and pollen
  if (wx.air) {
    const aqiH = (wx.air.hourly || []).filter((h) => h.t >= now - HOUR && h.t < now + DAY);
    const worst = argmax(aqiH, "eaqi");
    if (worst && worst.eaqi >= T.AQI_POOR) add({ id: "air", level: worst.eaqi >= T.AQI_VERY_POOR ? "warn" : "tip", icon: "air", title: worst.eaqi >= T.AQI_VERY_POOR ? "Very poor air quality" : "Poor air quality", short: fit(`Index ${Math.round(worst.eaqi)} ${f.when(worst.t, now)}`, `Index ${Math.round(worst.eaqi)}`), text: `Air quality index ${Math.round(worst.eaqi)} ${f.when(worst.t, now)}${worst.pm25 != null ? ` (fine particles ${Math.round(worst.pm25)} µg/m³)` : ""}. Take it easier outdoors if you have asthma or a heart condition.`, score: 75 });
    const pollen = pollenToday(aqiH);
    if (pollen && pollen.level >= 2) add({ id: "pollen", level: pollen.level >= 3 ? "warn" : "tip", icon: "pollen", title: `${pollen.level >= 3 ? "Very high" : "High"} ${pollen.name} pollen`, short: `Peaks around ${f.time(pollen.t)}`, text: `${cap(pollen.name)} pollen peaks around ${f.time(pollen.t)} (${Math.round(pollen.v)} grains/m³). Hay fever sufferers: take antihistamines early, keep windows shut.`, score: 64 });
  }

  /* tips for your day */
  const waking = wakingHours(wx, now);
  if (waking.hours.length) {
    const whenDay = waking.tomorrow ? "tomorrow" : "today";
    const wetH = waking.hours.filter(isWet), popMax = max(waking.hours, "pop") ?? 0;
    // (the chance of rain at some point while you're up and about: from the ensembles' runs where they're in (and the
    // radar's where it leads), which over a whole day can be well above any one hour's chance; else the likeliest hour's)
    const any = rainChance(wx, waking.hours[0].t, waking.hours[waking.hours.length - 1].t + HOUR);
    const pct = (p) => Math.round(p * 100);
    // (the day it's about, for one row with the week's worst day when that's the same day: below)
    const on = keyOf(waking.hours[0].t);
    if (wetH.length || popMax >= 50) {
      const first = wetH[0] || argmax(waking.hours, "pop");
      // (when it starts: by the quarter hour, as the briefing has it, where the next few hours' rain sees it coming
      // sooner than the hours do (the radar's, where it leads); else the first wet hour)
      const nc = waking.tomorrow ? null : nowcast(wx, now, f), end = waking.hours[waking.hours.length - 1].t + HOUR;
      const from = nc?.now ? now : nc?.startsAt && nc.startsAt < end && (!wetH[0] || nc.startsAt < wetH[0].t) ? nc.startsAt : wetH[0] ? wetH[0].t - HOUR : null;
      // (by the odds it gives: a coin toss is a maybe)
      add({ id: "umbrella", on, kind: cap(wetKind(waking.hours) || "rain"), from, odds: Math.round(popMax), level: "tip", icon: "umbrella", title: !popMax || popMax >= 60 ? "Take an umbrella" : "Maybe an umbrella", short: fit(`${cap(wetKind(waking.hours) || "rain")} ${f.when(first.t, now)}${popMax ? ` (${Math.round(popMax)}%)` : ""}`, `${cap(wetKind(waking.hours) || "rain")} ${f.when(first.t, now)}`, `${cap(wetKind(waking.hours) || "rain")} likely`), text: `${cap(wetKind(waking.hours) || "rain")} likely ${f.when(first.t, now)}${popMax ? ` (${Math.round(popMax)}% chance)` : ""}${wetH.length ? `, about ${f.precip(sum(waking.hours.map((h) => h.precip)))} in all` : ""}.`, score: 72 });
    } else if (any != null && any >= 0.7) add({ id: "umbrella", on, kind: cap(wetKind(waking.hours) || "showers"), odds: pct(any), level: "tip", icon: "umbrella", title: "Take an umbrella", short: fit(`${cap(wetKind(waking.hours) || "showers")} likely ${whenDay} (${pct(any)}%)`, `${cap(wetKind(waking.hours) || "showers")} likely ${whenDay}`), text: `${cap(wetKind(waking.hours) || "showers")} likely at some point ${whenDay} (${aPct(pct(any))} chance), though most of it stays dry.`, score: 70 });
    else if (any != null ? any >= 0.3 : popMax >= 25) add({ id: "umbrella", on, kind: cap(wetKind(waking.hours) || "showers"), odds: any != null ? pct(any) : Math.round(popMax), level: "tip", icon: "umbrella", title: "Maybe an umbrella", short: `${cap(aPct(any != null ? pct(any) : Math.round(popMax)))} chance of a shower`, text: any != null ? `${cap(aPct(pct(any)))} chance of a shower at some point; most of ${whenDay} stays dry.` : `${cap(aPct(Math.round(popMax)))} chance of a shower ${f.when(argmax(waking.hours, "pop").t, now)}; most of ${whenDay} stays dry.`, score: 45 });
    add(wear(waking, now, f));
  }
  // your commute
  if (opts.commute?.on) add(commute(wx, now, f, opts.commute));

  /* context */
  // vs yesterday (or tomorrow vs today, in the evening)
  const evening = hourOf(now) >= 17, a = evening ? today : wx.daily[ti - 1], b = evening ? wx.daily[ti + 1] : today;
  if (a && b && a.tmax != null && b.tmax != null) {
    const dt = b.tmax - a.tmax, who = evening ? "Tomorrow" : "Today";
    if (Math.abs(dt) >= 2) add({ id: "vs", day: b.key, level: "info", icon: dt > 0 ? "up" : "down", title: `${who}: ${dt > 0 ? "warmer" : "cooler"}`, short: `Peaks at ${f.temp(b.tmax)}, ${f.delta(dt)} ${dt > 0 ? "warmer" : "cooler"}`, text: `Peaks at ${f.temp(b.tmax)}, ${f.delta(dt)} ${dt > 0 ? "warmer" : "cooler"} than ${evening ? "today" : "yesterday"}${Math.abs((b.fmax ?? b.tmax) - (a.fmax ?? a.tmax)) >= 2 ? `, and feels ${f.delta((b.fmax ?? b.tmax) - (a.fmax ?? a.tmax))} ${(b.fmax ?? b.tmax) > (a.fmax ?? a.tmax) ? "warmer" : "colder"}` : ""}.`, score: 50 });
  }
  // this time of year
  for (const c of climateCards(wx, now, f)) add(c);
  // how sure
  add(confidenceCard(wx, now, f));
  // trend
  add(trend(wx, now, f));
  // pressure
  add(pressure(wx, now, f));
  // the week
  for (const c of weekCards(wx, now, f)) add(c);
  // what's changed since you last looked
  if (opts.prev) add(changes(opts.prev, wx, now, f));

  // one row a thing: the umbrella and the week's worst day, when that's the same wet day, as one ("Tomorrow: wet and
  // windy"), keeping what to do for the morning briefing (alerts.js)
  const u = cards.find((c) => c.id === "umbrella"), w = cards.find((c) => c.id === "worstday");
  if (u && w && w.wet && u.on === w.day) {
    // (its gusts too, unless they've a row of their own)
    const d = wx.daily.find((x) => x.key === w.day), windy = (d.gustMax ?? 0) >= 45 && !cards.some((c) => c.id === "wind");
    // (its line not the day again: "Rain from 07:00 (50%)")
    const lead = u.from == null ? `${u.kind} likely` : u.from <= now ? `${u.kind} now` : `${u.kind} from ${f.time(u.from)}`;
    cards.splice(cards.indexOf(w), 1);
    cards[cards.indexOf(u)] = { ...u, day: w.day, act: u.title, title: `${f.day(d.date, now)}: ${windy ? "wet and windy" : "a wet day"}`,
      short: windy ? fit(`${lead}, gusts ${f.wind(d.gustMax)}`, lead) : u.odds ? fit(`${lead} (${u.odds}%)`, lead) : lead,
      text: `${u.text}${windy ? ` Gusts to ${f.wind(d.gustMax)}.` : ""} The worst day of the week: one to plan indoors.`, score: Math.max(u.score, w.score) };
  }
  // (where to read more: a day's own sheet, or the tile whose hours it's about: app.js)
  return cards.map((c) => (c.day || !MORE[c.id] ? c : { ...c, tile: MORE[c.id] })).sort((x, y) => y.score - x.score);
}

// the hours you're likely up and about: what's left of today (7am to 10pm), or tomorrow's, late in the evening
function wakingHours(wx, now) {
  const h = hourOf(now), base = dayStart(now), tomorrow = h >= 20;
  const from = tomorrow ? base + DAY + 7 * HOUR : Math.max(now, base + 7 * HOUR), to = (tomorrow ? base + DAY : base) + 22 * HOUR;
  return { hours: hoursBetween(wx, Math.floor(from / HOUR) * HOUR, to), tomorrow };
}
function wear(waking, now, f) {
  const lo = min(waking.hours, "feels"), hi = max(waking.hours, "feels");
  if (lo == null) return null;
  const pick = (t) => (t < 0 ? "a heavy coat, hat and gloves" : t < 6 ? "a warm coat" : t < 11 ? "a jacket or a warm jumper" : t < 16 ? "a light jacket or a jumper" : t < 21 ? "a light layer" : t < 25 ? "T-shirt weather" : "shorts and something cool");
  const wet = waking.hours.some(isWet), windy = (max(waking.hours, "gust") ?? 0) >= 45;
  const cold = pick(lo), warm = pick(hi);
  let text = `Feels like ${f.temp(lo)}${Math.round(hi - lo) >= 3 ? ` to ${f.temp(hi)}` : ""}: ${cold}${cold !== warm && hi - lo >= 5 ? `, then ${warm.replace(/^a /, "just a ").replace("T-shirt weather", "a T-shirt")} later` : ""}.`;
  if (wet && windy) text += " Waterproof and windproof if you can.";
  else if (wet) text += " Something waterproof.";
  else if (windy) text += " Something windproof.";
  return { id: "wear", level: "tip", icon: "shirt", title: "What to wear", short: cap(cold), text, score: 40 };
}
function commute(wx, now, f, c) {
  const times = [c.am, c.pm].filter(Boolean).map((s) => s.split(":").map(Number));
  const days = c.days || [1, 2, 3, 4, 5];
  for (let k = 0; k < 2; k++) {
    const base = dayStart(now) + k * DAY;
    if (!days.includes(new Date(base).getUTCDay())) continue;
    for (const [hh, mm] of times) {
      const t = base + hh * HOUR + (mm || 0) * 60e3;
      if (t < now - 15 * 60e3 || t > now + 20 * HOUR) continue;
      const h = hourAt(wx, t); if (!h) continue;
      const bits = [];
      if (isWet(h)) bits.push(`${wetKind([h]) || "rain"} (${f.precip(h.precip)})`);
      else if ((h.pop ?? 0) >= 30) bits.push(`${Math.round(h.pop)}% chance of rain`);
      else bits.push("dry");
      bits.push(`${f.temp(h.temp)}${Math.abs((h.feels ?? h.temp) - h.temp) >= 3 ? `, feels ${f.temp(h.feels)}` : ""}`);
      if ((h.gust ?? 0) >= 45) bits.push(`gusts ${f.wind(h.gust)}`);
      if ((h.vis ?? 1e5) < T.FOG_M) bits.push("fog");
      const bad = isWet(h) || (h.pop ?? 0) >= 50 || (h.gust ?? 0) >= 55 || (h.vis ?? 1e5) < T.FOG_M;
      return { id: "commute", level: bad ? "tip" : "good", icon: "commute", title: `${k ? "Tomorrow's" : "Your"} ${f.time(t)} commute`, short: fit(cap(bits.slice(0, 2).join(", ")), cap(bits[0])), text: `${cap(bits.join(", "))}.`, score: bad ? 74 : 35 };
    }
  }
  return null;
}
function pollenToday(hours) {
  const KINDS = [["grass", [30, 80, 200]], ["birch", [20, 100, 400]], ["alder", [20, 100, 400]], ["olive", [20, 100, 400]], ["ragweed", [10, 50, 200]], ["mugwort", [10, 50, 200]]];
  let best = null;
  for (const [k, lv] of KINDS) {
    const h = argmax(hours, k); if (!h) continue;
    const level = h[k] >= lv[2] ? 3 : h[k] >= lv[1] ? 2 : h[k] >= lv[0] ? 1 : 0;
    if (!best || level > best.level || (level === best.level && h[k] > best.v)) best = { name: k, level, v: h[k], t: h.t };
  }
  return best;
}
// the forecast against thirty years of this time of year
function climateCards(wx, now, f) {
  const out = [];
  if (!wx.climate) return out;
  const yrs = `${wx.climate.years[0]}–${wx.climate.years[1]}`;
  const ti = dayIndex(wx, now), evening = hourOf(now) >= 17;
  const focus = wx.daily[evening ? ti + 1 : ti];
  if (focus) {
    const c = climateOn(wx.climate, focus.date);
    if (c?.tmax) {
      const p = rankIn(c.tmax.sorted, focus.tmax), anom = focus.tmax - c.tmax.mean, who = evening ? "Tomorrow" : "Today";
      const nth = (x) => { const r = Math.round(x); return `${r}${r % 10 === 1 && r !== 11 ? "st" : r % 10 === 2 && r !== 12 ? "nd" : r % 10 === 3 && r !== 13 ? "rd" : "th"}`; };
      let title, text, short, level = "info", score = 35;
      if (p >= 90) { title = `${who}: unusually warm`; short = `${f.temp(focus.tmax)}, ${f.delta(anom)} above normal`; text = `${f.temp(focus.tmax)} is ${f.delta(anom)} above normal, warmer than ${Math.round(p)}% of days at this time of year (${yrs}).`; level = "good"; score = 58; }
      else if (p <= 10) { title = `${who}: unusually cold`; short = `${f.temp(focus.tmax)}, ${f.delta(anom)} below normal`; text = `${f.temp(focus.tmax)} is ${f.delta(anom)} below normal, colder than ${Math.round(100 - p)}% of days at this time of year (${yrs}).`; score = 58; }
      else if (Math.abs(anom) >= 1.5) { title = `${who}: ${anom > 0 ? "warmer" : "cooler"} than normal`; short = `${f.temp(focus.tmax)} against a normal ${f.temp(c.tmax.mean)}`; text = `${f.temp(focus.tmax)} against a normal high of ${f.temp(c.tmax.mean)} for ${f.dateLong(focus.date)} (the ${nth(p)} percentile, ${yrs}).`; score = 38; }
      else title = null;          // (normal for the time of year: not news)
      if (c.recordHigh && focus.tmax >= c.recordHigh.v - 0.5) { title = `${who}: near-record warmth`; short = fit(`${f.temp(focus.tmax)}, the record ${f.temp(c.recordHigh.v)} (${c.recordHigh.year})`, `${f.temp(focus.tmax)}, the record ${f.temp(c.recordHigh.v)}`); text = `${f.temp(focus.tmax)} would ${focus.tmax > c.recordHigh.v ? "beat" : "challenge"} the record for ${f.dateLong(focus.date)}: ${f.temp(c.recordHigh.v)} in ${c.recordHigh.year} (since ${wx.climate.years[0]}).`; level = "warn"; score = 82; }
      if (c.recordLow && focus.tmin <= c.recordLow.v + 0.5) { out.push({ id: "reclow", day: focus.key, level: "warn", icon: "cold", title: `${who}: near-record cold night`, short: fit(`Low ${f.temp(focus.tmin)}, the record ${f.temp(c.recordLow.v)} (${c.recordLow.year})`, `Low ${f.temp(focus.tmin)}, the record ${f.temp(c.recordLow.v)}`), text: `A low of ${f.temp(focus.tmin)} would ${focus.tmin < c.recordLow.v ? "beat" : "challenge"} the record for ${f.dateLong(focus.date)}: ${f.temp(c.recordLow.v)} in ${c.recordLow.year}.`, score: 80 }); }
      if (title) out.push({ id: "normal", day: focus.key, level, icon: "chart", title, short, text, score, detail: { p, anom, normal: c.tmax.mean, lo: c.tmax.p10, hi: c.tmax.p90, record: c.recordHigh } });
    }
  }
  // anything exceptional in the week ahead
  for (let i = ti + 2; i < Math.min(wx.daily.length, ti + 8); i++) {
    const d = wx.daily[i], c = climateOn(wx.climate, d.date);
    if (!c?.tmax) continue;
    const p = rankIn(c.tmax.sorted, d.tmax);
    if (p >= 97 || p <= 3) {
      out.push({ id: "extreme", day: d.key, level: "info", icon: p >= 97 ? "up" : "down", title: `${f.day(d.date, now)}: exceptionally ${p >= 97 ? "warm" : "cold"}`, short: `${f.temp(d.tmax)}: ${p >= 97 ? "warmer" : "colder"} than ${Math.round(p >= 97 ? p : 100 - p)}% of days`, text: `${f.temp(d.tmax)} would be ${p >= 97 ? "warmer" : "colder"} than ${Math.round(p >= 97 ? p : 100 - p)}% of days at this time of year since ${wx.climate.years[0]}${c.recordHigh && d.tmax >= c.recordHigh.v ? `, a new record for ${f.dateLong(d.date)}` : ""}.`, score: 55 });
      break;
    }
  }
  // the week's rain against normal
  const week = wx.daily.slice(ti, ti + 7);
  if (week.length === 7) {
    const rain = sum(week.map((d) => d.precip)), normal = sum(week.map((d) => climateOn(wx.climate, d.date)?.rainMean ?? 0));
    if (normal > 0) {
      const ratio = rain / normal;
      if (ratio >= 1.8 && rain >= 10) out.push({ id: "wetweek", level: "info", icon: "rain", title: "A wet week ahead", short: fit(`${f.precip(rain)} in 7 days, ${ratio >= 2.5 ? Math.round(ratio) + " times" : "twice"} the usual`, `${f.precip(rain)} in 7 days: ${ratio >= 2.5 ? Math.round(ratio) + "×" : "2×"} normal`), text: `${f.precip(rain)} of rain in the next 7 days, about ${ratio >= 2.5 ? Math.round(ratio) + " times" : "twice"} the usual ${f.precip(normal)} for the time of year.`, score: 48 });
      else if (ratio <= 0.35 && normal >= 6) out.push({ id: "dryweek", level: "good", icon: "sun", title: "A dry week ahead", short: rain < 0.05 ? "No rain in 7 days" : `Only ${f.precip(rain)} in 7 days`, text: `${rain < 0.05 ? "No rain" : `Only ${f.precip(rain)} of rain`} in the next 7 days, against ${f.precip(normal)} normally at this time of year.`, score: 46 });
    }
  }
  return out;
}
// a day in the next five the models can't agree on
function confidenceCard(wx, now, f) {
  const conf = confidence(wx), ti = dayIndex(wx, now);
  if (!wx.models && !wx.ensemble) return null;
  const ahead = wx.daily.slice(ti + 1, ti + 6);
  const shaky = ahead.find((d) => conf[d.key]?.level === "low");
  if (shaky) {
    const c = conf[shaky.key], bits = [];
    if (c.tLo != null && c.tHi - c.tLo >= 3) bits.push(`highs anywhere from ${f.temp(c.tLo)} to ${f.temp(c.tHi)}`);
    if (c.nModels && c.wetModels != null && c.wetModels > 0 && c.wetModels < c.nModels) bits.push(`${c.wetModels} of ${c.nModels} models bring rain`);
    else if (c.ensWet != null && c.ensWet > 0.25 && c.ensWet < 0.75) bits.push(`${Math.round(c.ensWet * 100)}% of ensemble runs bring rain`);
    return { id: "confidence", day: shaky.key, level: "info", icon: "dice", title: `${f.day(shaky.date, now)} is uncertain`, short: fit(cap(bits[0] || "the models disagree"), "The models disagree"), text: `${cap(bits.length ? list(bits) : "the models disagree")}. Check back nearer the time.`, score: 52 };
  }
  // (and nothing when they agree: that's what a forecast should be)
  return null;
}
// a big change in temperature coming: the largest step between the three days before and after any day in the next nine
function trend(wx, now, f) {
  const ti = dayIndex(wx, now), ds = wx.daily.slice(ti, ti + 10);
  let best = null;
  for (let i = 2; i <= ds.length - 2; i++) {
    const before = ds.slice(Math.max(0, i - 3), i), after = ds.slice(i, i + 3);
    const d = avg(after, "tmax") - avg(before, "tmax");
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { d, i, before, after };
  }
  if (!best || Math.abs(best.d) < 4) return null;
  const up = best.d > 0, from = ds[best.i];
  return { id: "trend", day: from.key, level: "info", icon: up ? "up" : "down", title: up ? "Warming up" : "Turning colder", short: fit(`Highs ${f.temp(avg(best.before, "tmax"))} → ${f.temp(avg(best.after, "tmax"))} from ${mid(f.day(from.date, now))}`, `Highs ${f.temp(avg(best.before, "tmax"))} → ${f.temp(avg(best.after, "tmax"))}`), text: `From ${f.day(from.date, now)}, highs ${up ? "climb" : "drop"} from around ${f.temp(avg(best.before, "tmax"))} to ${f.temp(avg(best.after, "tmax"))}.`, score: 56 };
}
// the barometer: the last three hours, and the next twelve
function pressure(wx, now, f) {
  const at = (w) => hourAt(wx, w)?.pressure;
  const p0 = at(now), pm3 = at(now - 3 * HOUR), p12 = at(now + 12 * HOUR);
  if (p0 == null) return null;
  const past = pm3 != null ? p0 - pm3 : null, next = p12 != null ? p12 - p0 : null;
  if (past != null && past <= -3 || next != null && next <= -6) {
    const fast = (past ?? 0) <= -4 || (next ?? 0) <= -8;
    return { id: "pressure", level: "info", icon: "gauge", title: fast ? "Pressure falling fast" : "Pressure falling", short: past != null && past <= -1 ? `Down ${f.pressureDelta(past)} in 3 hours` : `Down ${f.pressureDelta(next)} over 12 hours`, text: `${past != null && past <= -1 ? `Down ${f.pressureDelta(past)} in 3 hours` : `Down ${f.pressureDelta(next)} over the next 12 hours`}: unsettled weather on the way, with wind and rain more likely.`, score: fast ? 54 : 34 };
  }
  if (past != null && past >= 3 || next != null && next >= 6) return { id: "pressure", level: "good", icon: "gauge", title: "Pressure rising", short: past != null && past >= 1 ? `Up ${f.pressureDelta(past)} in 3 hours` : `Up ${f.pressureDelta(next)} over 12 hours`, text: `${past != null && past >= 1 ? `Up ${f.pressureDelta(past)} in 3 hours` : `Up ${f.pressureDelta(next)} over the next 12 hours`}: things are settling down.`, score: 30 };
  return null;
}
// the best and worst days of the week, and the weekend
function weekCards(wx, now, f) {
  const out = [], ti = dayIndex(wx, now), week = wx.daily.slice(ti, ti + 7);
  if (week.length < 5) return out;
  const scored = week.map((d) => ({ d, s: dayScore(d) }));
  const best = scored.reduce((b, x) => (x.s > b.s ? x : b)), worst = scored.reduce((b, x) => (x.s < b.s ? x : b));
  const words = (d) => { const p = dayParts(wx, d.key).find((x) => x.name === "afternoon") || dayParts(wx, d.key)[0]; return p ? p.phrase : ""; };
  if (best.s >= 55 && best.s - worst.s >= 12) out.push({ id: "bestday", day: best.d.key, level: "good", icon: "star", title: `Best day: ${f.day(best.d.date, now)}`, short: fit(`${cap(words(best.d))}, ${f.temp(best.d.tmax)}`, `${f.temp(best.d.tmax)}${(best.d.precip ?? 0) < 0.5 ? " and dry" : ""}`), text: `${cap(words(best.d))}, ${f.temp(best.d.tmax)}${(best.d.gustMax ?? 0) < 35 ? ", light winds" : ""}${(best.d.precip ?? 0) < 0.5 ? ", dry" : ""}. The pick of the next 7 days for getting outside.`, score: 44 });
  if (worst.s <= 40 && best.s - worst.s >= 12) {
    const bits = [];
    if ((worst.d.precip ?? 0) >= 1) bits.push(`${f.precip(worst.d.precip)} of rain`);
    if ((worst.d.gustMax ?? 0) >= 45) bits.push(`gusts to ${f.wind(worst.d.gustMax)}`);
    if (!bits.length) bits.push(words(worst.d));
    out.push({ id: "worstday", day: worst.d.key, wet: (worst.d.precip ?? 0) >= 1, level: "info", icon: "cloud", title: `Worst day: ${f.day(worst.d.date, now)}`, short: fit(cap(bits.join(", ")), cap(bits[0])), text: `${cap(list(bits))}. One to plan indoors.`, score: 36 });
  }
  // the weekend, from Monday to Thursday, unless the week's best day is one of its two (said already)
  const dow = new Date(now).getUTCDay(), picked = out.find((c) => c.id === "bestday")?.day;
  if (dow >= 1 && dow <= 4) {
    const sat = wx.daily.find((d) => new Date(d.date).getUTCDay() === 6 && d.date > now), sun = sat && wx.daily.find((d) => d.date === sat.date + DAY);
    const better = sat && sun && (dayScore(sat) - dayScore(sun) >= 15 ? "Saturday" : dayScore(sun) - dayScore(sat) >= 15 ? "Sunday" : null);
    if (sat && sun && picked !== sat.key && picked !== sun.key) out.push({ id: "weekend", day: sat.key, level: "info", icon: "calendar", title: "The weekend", short: better ? `${better}'s the better day` : `Saturday ${f.temp(sat.tmax)}, Sunday ${f.temp(sun.tmax)}`, text: `Saturday: ${words(sat)}, ${f.temp(sat.tmax)}. Sunday: ${words(sun)}, ${f.temp(sun.tmax)}.${dayScore(sat) - dayScore(sun) >= 15 ? " Saturday's the better day." : dayScore(sun) - dayScore(sat) >= 15 ? " Sunday's the better day." : ""}`, score: 42 });
  }
  return out;
}
/* ---------- since you last looked ---------- */
// prev: { at (wall ms), daily: [{ key, tmax, tmin, popMax, precip }] } — a snapshot kept from an earlier visit
export function snapshot(wx, now) {
  return { at: now, daily: wx.daily.filter((d) => d.date >= dayStart(now)).slice(0, 10).map((d) => ({ key: d.key, tmax: d.tmax, tmin: d.tmin, popMax: d.popMax, precip: d.precip })) };
}
export function changes(prev, wx, now, f) {
  if (!prev?.daily?.length || now - prev.at < 2 * HOUR) return null;
  const found = [];
  for (const p of prev.daily) {
    const d = wx.daily.find((x) => x.key === p.key);
    if (!d || d.date < dayStart(now)) continue;
    const dt = (d.tmax ?? 0) - (p.tmax ?? 0), dp = (d.popMax ?? 0) - (p.popMax ?? 0), dr = (d.precip ?? 0) - (p.precip ?? 0);
    const weight = Math.max(Math.abs(dt) / 2, Math.abs(dp) / 30, Math.abs(dr) / 5);
    if (weight < 1) continue;
    let what;
    if (Math.abs(dp) / 30 >= Math.abs(dt) / 2 && p.popMax != null && d.popMax != null) what = `${mid(f.day(d.date, now))} looks ${dp < 0 ? "drier" : "wetter"} (rain chance ${Math.round(p.popMax)}% → ${Math.round(d.popMax)}%)`;
    else if (Math.abs(dr) / 5 >= Math.abs(dt) / 2) what = `${mid(f.day(d.date, now))} looks ${dr < 0 ? "drier" : "wetter"} (${f.precip(p.precip)} → ${f.precip(d.precip)})`;
    else what = `${mid(f.day(d.date, now))} is now ${f.delta(dt)} ${dt > 0 ? "warmer" : "cooler"} (${f.temp(p.tmax)} → ${f.temp(d.tmax)})`;
    // (and in a few words, for its line: "Saturday drier: 70% → 20%")
    const brief = /rain chance/.test(what) ? `${f.day(d.date, now)} ${dp < 0 ? "drier" : "wetter"}: ${Math.round(p.popMax)}% → ${Math.round(d.popMax)}%`
      : /looks/.test(what) ? `${f.day(d.date, now)} ${dr < 0 ? "drier" : "wetter"}: ${f.precip(p.precip)} → ${f.precip(d.precip)}` : `${f.day(d.date, now)}: ${f.temp(p.tmax)} → ${f.temp(d.tmax)}`;
    found.push({ weight, what, brief, key: d.key });
  }
  // (by the calendar: last looked on Monday evening, it's "yesterday" all Tuesday, and "2 days ago" on Wednesday morning)
  const dd = Math.round((dayStart(now) - dayStart(prev.at)) / DAY), since = dd <= 0 ? `earlier today (${f.time(prev.at)})` : dd === 1 ? "yesterday" : `${dd} days ago`;
  if (!found.length) return null;
  found.sort((x, y) => y.weight - x.weight);
  return { id: "changes", level: "info", icon: "refresh", title: "Since you last looked", day: found[0].key, short: found[0].brief, text: `Compared with ${since}: ${list(found.slice(0, 3).map((x) => x.what))}.`, score: 60 };
}
