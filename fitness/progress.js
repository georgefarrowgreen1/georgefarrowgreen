// Progress's figures, from your activities' rows alone (their figures as kept: no files read here). Each activity is
// { id, name, start, sport, sum }, sum as load.js summarise has it (moving, dist, tss, np, iF, avgHr, curve, zones,
// hrZones), and as the phone adds to it (drift, late20).

import { DAY, startOfDay, mondayOf, addDays } from "./workouts.js";

// the lengths records are kept for: seconds, short, and in words
export const LENGTHS = [[5, "5 s", "5 seconds"], [60, "1 min", "1 minute"], [300, "5 min", "5 minutes"], [1200, "20 min", "20 minutes"], [3600, "1 h", "an hour"]];
// the curve's lengths, for drawing it (load.js CURVE)
export const CURVE_AT = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

// Your best at each length between two days: { seconds: { w, id, start, name } }
export function bests(acts, from = -Infinity, to = Infinity) {
  const out = {};
  for (const a of acts) {
    if (a.sport !== "ride" || a.start < from || a.start >= to || !a.sum?.curve) continue;
    for (const [k, w] of Object.entries(a.sum.curve)) if (w > (out[k]?.w || 0)) out[k] = { w, id: a.id, start: a.start, name: a.name };
  }
  return out;
}

// how an activity's time split between easy (zones 1–2), in between (3) and hard (4 and up), by power where there's
// power, else by heart rate; null where it has neither
function split(sum) {
  const z = sum?.zones?.length === 7 ? sum.zones : null, hz = !z && sum?.hrZones?.length === 5 ? sum.hrZones : null, v = z || hz;
  if (!v) return null;
  const tot = v.reduce((a, b) => a + b, 0);
  if (!tot) return null;
  return { easy: (v[0] + v[1]) / tot, mid: v[2] / tot, hard: v.slice(3).reduce((a, b) => a + b, 0) / tot };
}

// Week by week, the last n Mondays to this one: time (and how it split), training stress, and how many
export function weekly(acts, today, n = 26) {
  const first = addDays(mondayOf(today), -7 * (n - 1)), weeks = Array.from({ length: n }, (_, i) => ({ mon: addDays(first, 7 * i), secs: 0, tss: 0, count: 0, easy: 0, mid: 0, hard: 0, unknown: 0 }));
  for (const a of acts) {
    const i = Math.round((mondayOf(a.start) - first) / (7 * DAY));
    if (i < 0 || i >= n) continue;
    const w = weeks[i], secs = a.sum?.moving || 0, sp = split(a.sum);
    w.secs += secs; w.tss += a.sum?.tss || 0; w.count++;
    if (sp) { w.easy += secs * sp.easy; w.mid += secs * sp.mid; w.hard += secs * sp.hard; } else w.unknown += secs;
  }
  return weeks;
}

// Each day's training stress, the last n days to today
export function daily(acts, today, n = 182) {
  const from = addDays(today, -(n - 1)), out = new Array(n).fill(0);
  for (const a of acts) { const i = Math.round((startOfDay(a.start) - from) / DAY); if (i >= 0 && i < n) out[i] += a.sum?.tss || 0; }
  return { from, tss: out };
}

// How hard, since a day: the shares of easy, in between and hard, of the time that says
export function intensity(acts, from) {
  let e = 0, m = 0, hd = 0;
  for (const a of acts) { if (a.start < from) continue; const sp = split(a.sum), secs = a.sum?.moving || 0; if (sp) { e += secs * sp.easy; m += secs * sp.mid; hd += secs * sp.hard; } }
  const t = e + m + hd;
  return t ? { easy: e / t, mid: m / t, hard: hd / t, secs: t } : null;
}

// Weeks in a row riding at least twice: the run to now (this week counted once it has two), and the longest
export function streak(weeks) {
  let best = 0, run = 0;
  for (const w of weeks) { run = w.count >= 2 ? run + 1 : 0; best = Math.max(best, run); }
  let now = 0;
  for (let i = weeks.length - 1; i >= 0; i--) { if (weeks[i].count >= 2) now++; else if (i === weeks.length - 1) continue; else break; }
  return { now, best };
}

// a straight line through points: { slope, at(x) }
export function line(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  return { slope, at: (x) => my + slope * (x - mx) };
}

// Aerobic efficiency: normalized power over heart rate on each steady ride since a day (45 minutes or more, not hard),
// the line through them, and what it comes to: the watts more (or fewer) at your usual heart rate, start to end
export function efficiency(acts, from) {
  const pts = acts.filter((a) => a.sport === "ride" && a.start >= from && a.sum?.np > 0 && a.sum?.avgHr > 0 && (a.sum.moving || 0) >= 2700 && (a.sum.iF == null || a.sum.iF < 0.85))
    .map((a) => ({ t: a.start, ef: a.sum.np / a.sum.avgHr, hr: a.sum.avgHr })).sort((a, b) => a.t - b.t);
  if (pts.length < 4) return { pts, enough: false };
  const l = line(pts.map((p) => p.t), pts.map((p) => p.ef)), hr = Math.round(pts.map((p) => p.hr).sort((a, b) => a - b)[pts.length >> 1]);
  const e0 = l.at(pts[0].t), e1 = l.at(pts.at(-1).t);
  return { pts, enough: true, line: l, hr, from: e0, to: e1, pct: ((e1 - e0) / e0) * 100, watts: Math.round((e1 - e0) * hr) };
}

// What kind of rider: your bests against your FTP, each against what's usual for riders of any FTP (5 s about 3.9×,
// 1 min about 1.9×, 5 min about 1.2×), and the one that stands out most; none without all four
const USUAL = { 5: 3.9, 60: 1.9, 300: 1.2 };
export function riderType(best, ftp) {
  if (!ftp || !best[5]?.w || !best[60]?.w || !best[300]?.w) return null;
  const s = { sprint: best[5].w / ftp / USUAL[5], minute: best[60].w / ftp / USUAL[60], five: best[300].w / ftp / USUAL[300] };
  const top = Math.max(s.sprint, s.minute, s.five);
  // (nothing short above what's usual: strongest at threshold)
  s.ftp = Math.max(0.85, 2 - top);
  const kind = top < 1 ? "ftp" : top === s.sprint ? "sprint" : top === s.minute ? "minute" : "five";
  return { scores: s, kind, ...{
    sprint: { name: "Sprinter", said: "Explosive: town signs, sprints and short kicks suit you." },
    minute: { name: "Puncheur", said: "Strongest for a minute or so: short sharp climbs and hard surges suit you." },
    five: { name: "Climber", said: "Strongest over a few minutes: climbs of three to ten minutes, and VO₂ max efforts, suit you." },
    ftp: { name: "Diesel", said: "Steady and strong: long climbs, time trials and the hard tempo of a long day suit you." },
  }[kind] };
}

// Staying power since a day: heart rate's drift on long steady rides (the first few, and the last few), and your best
// 20 minutes after two hours against your best 20 minutes fresh
export function stayingPower(acts, from, best20) {
  const long = acts.filter((a) => a.start >= from && a.sum?.drift != null && (a.sum.iF == null || a.sum.iF < 0.85)).sort((a, b) => a.start - b.start);
  const med = (xs) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
  const k = Math.min(5, Math.floor(long.length / 2));
  const drift = long.length ? { now: med(long.slice(-Math.max(1, k)).map((a) => a.sum.drift)), was: k ? med(long.slice(0, k).map((a) => a.sum.drift)) : null, n: long.length } : null;
  const late = Math.max(0, ...acts.filter((a) => a.start >= from && a.sum?.late20).map((a) => a.sum.late20));
  return { drift, late20: late || null, ofFresh: late && best20 ? late / best20 : null };
}

// ---- your history: year against year, all-time bests, the seasons' peaks, a year in review ----
export const yearOf = (t) => new Date(t).getFullYear();
const dayOfYear = (t) => Math.floor((startOfDay(t) - startOfDay(new Date(yearOf(t), 0, 1, 12).getTime())) / DAY + 0.5);
// A year's distance (metres) and time (seconds) added up day by day: [day of year (0 on 1 January), distance, time],
// to `upTo` (that year's last day, or today), every activity of every sport
export function cumulative(acts, year, upTo = Infinity) {
  const end = Math.min(upTo, new Date(year, 11, 31, 12).getTime()), n = Math.max(0, dayOfYear(end)) + 1, dd = new Float64Array(n), ss = new Float64Array(n);
  for (const a of acts) { if (yearOf(a.start) !== year || a.start > end + DAY) continue; const i = dayOfYear(a.start); if (i < n) { dd[i] += a.sum?.dist || 0; ss[i] += a.sum?.moving || 0; } }
  const out = []; let d = 0, s = 0;
  for (let i = 0; i < n; i++) { d += dd[i]; s += ss[i]; out.push([i, d, s]); }
  return out;
}
// Your best at each of LENGTHS, ever, and this year's: [{ secs, short, ever: { w, start, name }, year: { w, start } | null, isBest }]
export function allTime(acts, today) {
  const ever = bests(acts), now = bests(acts, new Date(yearOf(today), 0, 1).getTime());
  return LENGTHS.map(([secs, short]) => ({ secs, short, ever: ever[secs] || null, year: now[secs] || null, isBest: !!(ever[secs] && now[secs] && now[secs].id === ever[secs].id) })).filter((x) => x.ever);
}
// Fitness's peak in each year: { year: { ctl, day } }, from fitness, day by day (load.js fitness)
export function peaks(series) {
  const out = {};
  for (const p of series) { const y = yearOf(p.day); if (!out[y] || p.ctl > out[y].ctl) out[y] = { ctl: p.ctl, day: p.day }; }
  return out;
}
// A year in review: how many, how far, how long, how high, how hard; the longest, the biggest week, the best 20
// minutes, the days out, month by month, and fitness's peak
export function yearReview(acts, year, series = []) {
  const xs = acts.filter((a) => yearOf(a.start) === year);
  if (!xs.length) return null;
  const sum = (k) => xs.reduce((t, a) => t + (a.sum?.[k] || 0), 0), months = Array(12).fill(0), weeks = new Map();
  for (const a of xs) { months[new Date(a.start).getMonth()] += a.sum?.moving || 0; const m = mondayOf(a.start); weeks.set(m, (weeks.get(m) || 0) + (a.sum?.moving || 0)); }
  const longest = xs.reduce((b, a) => ((a.sum?.moving || 0) > (b?.sum?.moving || 0) ? a : b), null), big = [...weeks].sort((p, q) => q[1] - p[1])[0];
  const b20 = bests(xs)[1200] || null, pk = peaks(series)[year] || null;
  return { year, count: xs.length, rides: xs.filter((a) => a.sport === "ride").length, dist: sum("dist"), secs: sum("moving"), ascent: sum("ascent"), tss: sum("tss"),
    days: new Set(xs.map((a) => startOfDay(a.start))).size, months, longest: longest && { name: longest.name, start: longest.start, secs: longest.sum?.moving || 0, dist: longest.sum?.dist || 0 },
    bigWeek: big ? { mon: big[0], secs: big[1] } : null, best20: b20, peak: pk };
}
