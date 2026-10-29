// Solar: when the sun's coming out on your panels today, and how long for. Open-Meteo's sunlight on a surface at your
// roof's pitch, facing its way (global tilted irradiance, W/m², each hour's the hour up to its time); a sunny spell is
// an hour or more with at least half the day's best on the roof, and enough to be worth it (MIN_W, about a fifth of
// what panels are rated at). Said from two hours before the spell until it ends; nothing otherwise. Pure, like
// insights.js, but for the fetch.

import { HOUR, dayStart } from "./format.js";

// the way a roof faces, as Open-Meteo has it: degrees from south, west positive
export const FACES = [["S", "South", 0], ["SW", "South-west", 45], ["W", "West", 90], ["NW", "North-west", 135], ["N", "North", 180], ["NE", "North-east", -135], ["E", "East", -90], ["SE", "South-east", -45]];
export const PITCHES = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];
export const MIN_W = 200;
const LEAD = 2 * HOUR;

export const solarQuery = (lat, lon, faces = "S", pitch = 35) =>
  new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: "global_tilted_irradiance", tilt: String(pitch), azimuth: String((FACES.find((x) => x[0] === faces) || FACES[0])[2]), forecast_days: "2", timezone: "auto" }).toString();
// [{ t (wall ms, the hour's end), w (W/m²) }]
export function shapeSolar(j, parseWall) {
  const h = j?.hourly || {};
  return (h.time || []).map((t, i) => ({ t: parseWall(t), w: h.global_tilted_irradiance?.[i] ?? 0 }));
}

// Today's spell still to come or under way, if it's to be said yet (lead: how long before it starts; the whole day's,
// for the morning briefing): { start, end, peak (the middle of its best hour), on (under way), hours (today's daylight
// ones, each { t, v: share of the day's best }), best } or null
export function sunSpell(hours, now, lead = LEAD) {
  const d0 = dayStart(now), today = hours.filter((x) => x.t > d0 && x.t <= d0 + 24 * HOUR);
  const best = Math.max(0, ...today.map((x) => x.w));
  if (best < MIN_W) return null;
  const cut = Math.max(MIN_W, best / 2), runs = [];
  for (const x of today) {
    if (x.w < cut) continue;
    const r = runs[runs.length - 1];
    if (r && r.end === x.t - HOUR) { r.end = x.t; r.hours.push(x); } else runs.push({ start: x.t - HOUR, end: x.t, hours: [x] });
  }
  const r = runs.find((x) => x.end > now);
  if (!r || now < r.start - lead) return null;
  const top = r.hours.reduce((a, x) => (x.w > a.w ? x : a));
  const lit = today.filter((x) => x.w > 5);
  return { start: r.start, end: r.end, peak: top.t - HOUR / 2, on: now >= r.start, best,
    hours: lit.map((x) => ({ t: x.t, v: x.w / best, in: x.t > r.start && x.t <= r.end })) };
}

// The card's words: { title, text }
export function solarSay(s, now, f) {
  if (s.on) {
    const text = Math.abs(now - s.peak) <= HOUR ? "Your panels are near their best for today." : now < s.peak ? `At their best around ${f.time(s.peak)}.` : "A good time to use power.";
    return { title: `Sunny now, until about ${f.said(s.end)}`, text };
  }
  return { title: `Sun coming out from about ${f.time(s.start)}`, text: `Your panels should work well until about ${f.said(s.end)}, at their best around ${f.time(s.peak)}. A good time for the washing machine.` };
}

/* ---------- zones ---------- */
// A zone: a set of panels with its own way and pitch (and place, and size in kW if it's known: a bigger one counts for
// more where they're put together). Up to MAX_ZONES; each its own colour on the card's chart
export const MAX_ZONES = 6;
export const ZONE_COLOURS = ["#ffc23d", "#ff8a3d", "#ffe27a", "#ff6b6b", "#7fd3ff", "#c9a2ff"];
export const facesName = (k) => (FACES.find((x) => x[0] === k) || FACES[0])[1];
// "Faces east · 30° · 2 kW"
export const zoneSaid = (z) => `Faces ${facesName(z.faces).toLowerCase()} · ${z.pitch ? `${z.pitch}°` : "flat"}${z.kw ? ` · ${z.kw} kW` : ""}`;

// The zones at a place together (zs: [{ zone, hours }], each zone's sunlight as above), if they're to be said yet: each
// zone's own spell for the rest of the day (by the same rule as one roof's), and from two hours before the first starts
// until the last ends, the lot: { start, end, on, peak (the middle of the hour all of them, by size, give most), best
// (the hours they give at least 85% of that, where more than one zone; else null), zones: [{ zone, i, sp }] in the order
// the sun reaches them (i: its place in zs, for its colour), hours: today's lit ones, each { t, parts: [v by zone] (its
// share of the best hour's total), in } } or null
export function zonesSpell(zs, now, lead = LEAD) {
  const each = zs.map((z, i) => ({ zone: z.zone, i, sp: z.hours ? sunSpell(z.hours, now, Infinity) : null }));
  const lit = each.filter((x) => x.sp).sort((a, b) => a.sp.start - b.sp.start);
  if (!lit.length) return null;
  const start = Math.min(...lit.map((x) => x.sp.start)), end = Math.max(...lit.map((x) => x.sp.end));
  if (now < start - lead) return null;
  // (the day's hours, each zone's sunlight there by its size: an unknown size counts as 1)
  const d0 = dayStart(now), at = new Map();
  zs.forEach((z, i) => { for (const x of z.hours || []) if (x.t > d0 && x.t <= d0 + 24 * HOUR) { const row = at.get(x.t) || zs.map(() => 0); row[i] = x.w * (z.zone.kw || 1); at.set(x.t, row); } });
  const hrs = [...at.entries()].sort((a, b) => a[0] - b[0]), sum = (r) => r.reduce((a, v) => a + v, 0);
  const top = hrs.reduce((a, h) => (sum(h[1]) > sum(a[1]) ? h : a), hrs[0]), most = sum(top[1]) || 1;
  let best = null;
  if (zs.length > 1) {
    let a = hrs.indexOf(top), b = a;
    while (a > 0 && sum(hrs[a - 1][1]) >= most * 0.85) a--;
    while (b < hrs.length - 1 && sum(hrs[b + 1][1]) >= most * 0.85) b++;
    best = { from: hrs[a][0] - HOUR, to: hrs[b][0] };
  }
  return { start, end, on: now >= start, peak: top[0] - HOUR / 2, best, zones: lit,
    hours: hrs.filter((h) => sum(h[1]) > 5 * zs.length).map(([t, r]) => ({ t, parts: r.map((v) => v / most), in: t > start && t <= end })) };
}

// The card's words for the zones together: { title, text }. One zone says it as one roof does
export function zonesSay(s, now, f) {
  if (s.zones.length < 2 && !s.best) return solarSay({ ...s, ...s.zones[0].sp, on: s.on }, now, f);
  const order = s.zones.map((x, k) => (k ? `${x.zone.name} from ${f.time(x.sp.start)}` : `${x.zone.name} first`)).join(", ");
  const best = s.best && s.best.to > now ? (s.best.from <= now ? ` A good time to use power now, until about ${f.said(s.best.to)}.` : ` A good time for the washing machine: ${f.time(s.best.from)} to ${f.said(s.best.to)}, when they’re all working.`) : "";
  if (s.on) return { title: `Sunny now, until about ${f.said(s.end)}`, text: `${s.zones.length > 1 && s.zones.some((x) => x.sp.start > now) ? `${order}.` : "On all your panels."}${best}` };
  return { title: `Sun on your panels from about ${f.time(s.start)} until about ${f.said(s.end)}`, text: `${s.zones.length > 1 ? `${order}.` : `${s.zones[0].zone.name}.`}${best}` };
}
