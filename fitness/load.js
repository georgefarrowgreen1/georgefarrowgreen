// How hard a ride was, and what the weeks of them add up to.
//
// A ride's figures (summarise): its distance, moving time, climbing, power (average, Normalized Power, the most it held
// for 5 seconds to an hour), heart rate, and how long in each zone. Its training stress (TSS) from power where there is
// power (an hour at FTP is 100); from heart rate where there isn't (an hour at threshold heart rate is 100, as
// TrainingPeaks' hrTSS has it), so long as it was heard for most of it; and else, for a run or a swim, from its pace
// against your threshold pace or CSS (a swim's cubed, as swimming's own stress score has it, the water's drag rising
// with the cube of speed).
//
// Fitness, fatigue and form (fitness): your training stress day by day, averaged over six weeks (fitness, CTL) and over
// one (fatigue, ATL), as exponentially weighted averages; form (TSB) is yesterday's fitness less yesterday's fatigue.
// Positive is fresh; −10 to −30 is where training does its work; below that, tired.

import { ZONES, HR_ZONES, zoneOf, DAY, startOfDay } from "./workouts.js";

export const CURVE = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

// The samples as one a second (each held until the next, as long as it's not a pause of more than 10 s)
export function perSecond(a) {
  // (two days at most: anything longer is a file's fault, not a ride)
  const s = a.s, n = s.t.length, end = Math.min(2 * 86400, Math.floor(s.t[n - 1]));
  // (moving: the wheels turning, or the pedals, or the feet; where nothing says how fast (an indoor trainer with no speed,
  // a pool swim), whenever it's recording)
  const fast = s.spd && s.spd.some((v) => v > 0.5), thr = a.sport === "ride" ? 1 : 0.5;
  const keys = ["pwr", "hr", "cad", "spd", "ele", "dist"].filter((k) => s[k]);
  const out = Object.fromEntries(keys.map((k) => [k, new Float64Array(end + 1).fill(NaN)]));
  out.moving = new Uint8Array(end + 1);
  for (let i = 0; i < n; i++) {
    const from = Math.ceil(s.t[i]), to = i + 1 < n ? Math.ceil(s.t[i + 1]) : from + 1, gap = i + 1 < n ? s.t[i + 1] - s.t[i] : 1;
    for (const k of keys) {
      const v = s[k][i];
      if (v == null) continue;
      // (power and cadence through a long gap are zero: the pedals stopped)
      const hold = gap > 10 && (k === "pwr" || k === "cad") ? 0 : v;
      for (let x = from; x < Math.min(to, end + 1); x++) out[k][x] = x === from ? v : hold;
    }
    const moved = gap <= 10 && (!fast || a.sport === "swim" || (s.spd[i] ?? 0) > thr || (s.pwr?.[i] || 0) > 0 || (s.cad?.[i] || 0) > 0);
    for (let x = from; x < Math.min(to, end + 1); x++) out.moving[x] = moved ? 1 : 0;
  }
  return out;
}

// A ride's figures, for your FTP and threshold heart rate
export function summarise(a, { ftp = 250, lthr = 165, maxHr = 190, runPace = 260, css = 108 } = {}) {
  const s = a.s, n = s.t.length, ps = perSecond(a), secs = ps.moving.length;
  const moving = ps.moving.reduce((x, m) => x + m, 0);
  // (distance: as far as it got from where it started, which a device's reset mid-file can't make less than nothing)
  let dist = 0;
  if (s.dist) { const first = s.dist.find((v) => v != null) ?? 0; for (const v of s.dist) if (v != null && v - first > dist) dist = v - first; }
  // climbing: rises in the smoothed height, counted once they pass 2 m (so a GPS's wobble isn't counted as hills)
  let ascent = 0;
  if (s.ele) {
    let base = null;
    for (let i = 0; i < n; i++) {
      const v = s.ele[i];
      if (v == null) continue;
      if (base == null || v < base) base = v;
      else if (v - base >= 2) { ascent += v - base; base = v; }
    }
  }
  // (and the numbers it was worked out with, so it can be worked out again for new ones without the file: rescale)
  const out = { secs: s.t[n - 1], moving, dist, ascent: Math.round(ascent), ftp, lthr, runPace, css, kind: s.pwr ? "power" : null };
  const avg = (arr, onlyMoving) => { let t = 0, c = 0; for (let i = 0; i < arr.length; i++) if (Number.isFinite(arr[i]) && (!onlyMoving || ps.moving[i])) { t += arr[i]; c++; } return c ? t / c : null; };
  const max = (arr) => { let m = -Infinity; for (const v of arr) if (Number.isFinite(v) && v > m) m = v; return m === -Infinity ? null : m; };
  if (ps.pwr) {
    const p = ps.pwr.map((v) => (Number.isFinite(v) ? v : 0));
    out.avgPwr = Math.round(avg(p)); out.maxPwr = Math.round(max(p));
    out.kj = Math.round(p.reduce((x, v) => x + v, 0) / 1000);
    // Normalized Power: 30-second rolling averages, raised to the fourth power, averaged, rooted
    let sum = 0, roll = 0, k = 0;
    for (let i = 0; i < p.length; i++) { roll += p[i]; if (i >= 30) roll -= p[i - 30]; if (i >= 29) { sum += (roll / 30) ** 4; k++; } }
    out.np = Math.round(k ? (sum / k) ** 0.25 : out.avgPwr);
    out.iF = Math.round((out.np / ftp) * 1000) / 1000;
    out.tss = Math.round(((secs * out.np * out.iF) / (ftp * 3600)) * 100);
    out.curve = bestEfforts(p);
    out.zones = ZONES.map(() => 0);
    for (let i = 0; i < p.length; i++) if (ps.moving[i] || p[i] > 0) out.zones[zoneOf(p[i] / ftp).n - 1]++;
  }
  if (ps.hr) {
    out.avgHr = Math.round(avg(ps.hr, true) ?? avg(ps.hr)); out.maxHr = Math.round(max(ps.hr));
    out.hrZones = HR_ZONES.map(() => 0);
    let hrs = 0, heard = 0;
    for (let i = 0; i < ps.hr.length; i++) {
      const v = ps.hr[i];
      if (!Number.isFinite(v)) continue;
      out.hrZones[(HR_ZONES.find((z) => v / lthr < z.top) || HR_ZONES[4]).n - 1]++;
      if (ps.moving[i]) { hrs += (v / lthr) ** 2; heard++; }
    }
    if (out.tss == null && heard > moving / 2) { out.tss = Math.round((hrs / 3600) * 100); out.kind = "hr"; }
  }
  if (out.tss == null && dist > 0 && moving > 0 && (a.sport === "run" || a.sport === "walk" || a.sport === "swim")) {
    const iF = dist / moving / (a.sport === "swim" ? 100 / css : 1000 / runPace);
    out.tss = Math.round((moving / 3600) * iF ** (a.sport === "swim" ? 3 : 2) * 100); out.kind = "pace";
  }
  if (ps.cad) out.avgCad = Math.round(avg(ps.cad.map((v) => (v > 0 ? v : NaN))));
  if (ps.spd) out.maxSpd = max(ps.spd);
  out.avgSpd = moving ? dist / moving : null;
  out.kcal = out.kj != null ? out.kj : Math.round((moving / 3600) * 600);   // (a kilojoule of work is near enough a kilocalorie burned)
  return out;
}

// A ride's figures for new numbers (a new FTP, threshold heart rate or pace), from the ones it was worked out with:
// training stress goes with the square of intensity (a swim's with its cube), and intensity is power over FTP, heart
// rate over threshold, or pace against threshold pace. (Its time in each zone waits for the ride to be opened.)
export function rescale(sum, p, sport) {
  if (!sum) return sum;
  const out = { ...sum, ftp: p.ftp, lthr: p.lthr, runPace: p.runPace, css: p.css };
  // (its time in zones, where the zones have moved: until it's opened again, none)
  if (sum.ftp !== p.ftp) out.zones = null;
  if (sum.lthr !== p.lthr) out.hrZones = null;
  if (sum.tss == null) return out;
  const [k, pow] = sum.kind === "power" ? [sum.ftp / p.ftp, 2] : sum.kind === "hr" ? [sum.lthr / p.lthr, 2]
    : sum.kind === "pace" && sport === "swim" ? [p.css / sum.css, 3] : sum.kind === "pace" ? [p.runPace / sum.runPace, 2] : [1, 2];
  if (!Number.isFinite(k) || k === 1) return out;
  out.tss = Math.round(sum.tss * k ** pow);
  if (sum.iF != null) out.iF = Math.round(sum.iF * k * 1000) / 1000;
  return out;
}

// the most you held for each of CURVE's durations, in watts
export function bestEfforts(p) {
  const cum = new Float64Array(p.length + 1);
  for (let i = 0; i < p.length; i++) cum[i + 1] = cum[i] + p[i];
  const out = {};
  for (const d of CURVE) {
    if (d > p.length) break;
    let best = 0;
    for (let i = d; i <= p.length; i++) best = Math.max(best, cum[i] - cum[i - d]);
    out[d] = Math.round(best / d);
  }
  return out;
}

// Fitness, fatigue and form, day by day, from { day (local midnight, ms): TSS }: [{ day, tss, ctl, atl, tsb }]
export function fitness(daily, from, to) {
  const out = [];
  let ctl = 0, atl = 0;
  const kc = 1 - Math.exp(-1 / 42), ka = 1 - Math.exp(-1 / 7);
  for (let d = startOfDay(from); d <= to; d = startOfDay(d + DAY + 3600e3)) {
    const tss = daily[d] || 0, tsb = ctl - atl;
    ctl += (tss - ctl) * kc; atl += (tss - atl) * ka;
    out.push({ day: d, tss, ctl, atl, tsb });
  }
  return out;
}
// form in words, as it's usually read
export function formSaid(tsb) {
  if (tsb > 15) return { word: "Fresh", tone: "fresh", line: "Rested: a good day for a hard session, or a race." };
  if (tsb > -10) return { word: "Neutral", tone: "neutral", line: "Neither fresh nor tired: steady training suits today." };
  if (tsb > -30) return { word: "Productive", tone: "productive", line: "Tired in the way training should leave you: you're getting fitter." };
  return { word: "Overreaching", tone: "high", line: "Very tired. An easy day or two will do more than another hard one." };
}
