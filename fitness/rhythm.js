// Rhythm: the plan that never ends. No event and no last week: you say which days you ride and for how long, what to
// lean towards, and whether to build or hold; each morning Rhythm decides the day's session, or rest, from what you've
// actually done, how fresh you are and how you slept and feel. It plans seven days ahead but only commits to today, so
// a missed day or a ride of your own never knocks it over: it starts again from the truth each morning.
//
// Its rules, each from the research (the proposal has the sources):
// - Most riding easy, at most two hard sessions a week (three with 12 hours or more), 48 hours between them, and the mix
//   by the time you have: pyramidal under about 6 hours a week (sweet spot and threshold give the most per hour),
//   polarised from 9 (more VO₂ max, less of the middle). Seiler; Oliveira et al. 2024.
// - Fitness and fatigue (CTL, ATL) from every activity's training stress; fitness raised a few points a week at most
//   in a build, kept level in hold; form kept above −25. Banister; Foster.
// - Four-week blocks, three building and one absorbing, themed aerobic, threshold or top end: in order the first time
//   round, then each block chosen by the end-of-block check (whichever ability moved least lately goes next, or the
//   same again once if it moved a lot). Issurin; Rønnestad.
// - Anything left too long rises up the list, so nothing goes stale; 30/15s are the first choice for VO₂ max work
//   (Rønnestad et al. 2020); every other week in aerobic and threshold blocks the long ride ends with threshold
//   efforts, for durability (Maunder et al. 2021; Jones 2024).
// - Intervals set from critical power and W′ where your rides give them (your best efforts, the older ones counting for
//   a little less), else from FTP (Chorley & Lamb 2020); then moved to what you've been holding in each kind of hard
//   session (the efforts of each, fitness/efforts.js), but not for ones ridden tired. FTP itself offered a change when
//   your rides say it's moved.
// - Each block's sessions grow week by week: longer efforts first, then more of them, then harder (Seiler).
// - The week planned as a whole, the hard days where they fit best (spaced, the long day kept, intervals on wet days
//   for the trainer), then only today committed to.
// - A low HRV against its usual range, or resting heart rate up 5 or more, eases the day as heavy legs do; a short
//   night counts where there's no check-in (Plews; Buchheit).
// - A poor night or heavy legs keep the time and drop the intensity; feeling poor twice running, rest. Training stress
//   for an activity with no power, heart rate or pace, from its time (fitness/load.js tssOf).
// - Heavy strength twice a week on hard days in aerobic and threshold blocks, once in top-end blocks, none in an
//   absorb week (Rønnestad & Mujika). Every ride says what to eat (up to about 90 g an hour).
// - A rest day may move: a session missed earlier in the week, form good, and another rest day still to come, and the
//   rest day becomes the catch-up ride.
// - Rides first; a run and a swim a week as well, where you ride those too.

import { workoutById, measure, startOfDay, addDays, mondayOf, DAY } from "./workouts.js";
import { tssOf } from "./load.js";

export const THEMES = { aerobic: "Aerobic", threshold: "Threshold", topend: "Top end" };
const ORDER = ["aerobic", "threshold", "topend"];
// how often each block wants each kind of session, in days (the smaller, the more often)
const SPACING = {
  aerobic: { tempo: 5, sweet: 7, threshold: 14, vo2: 10, sprint: 10 },
  threshold: { tempo: 14, sweet: 5, threshold: 5, vo2: 10, sprint: 7 },
  topend: { tempo: 21, sweet: 14, threshold: 10, vo2: 4, sprint: 5 },
};
const WORDS = { tempo: "tempo", sweet: "sweet spot", threshold: "threshold", vo2: "VO₂ max", sprint: "sprint", durable: "hard-finish long" };
export const HARD = new Set(["sweet", "threshold", "vo2", "thirty", "sprint", "durable", "run-tempo", "swim-css"]);
// your week, Monday first: minutes each day (0: a rest day), and the rest
export const DEFAULTS = { days: [0, 60, 60, 60, 0, 150, 90], run: false, swim: false, lean: "balanced", mode: "build" };
export const LEANS = { balanced: "Balanced", endurance: "Long days", punch: "Punchy rides" };

// ---- sessions made to fit the day (rh:<kind>:<minutes>), or the library's ----
const m = (x) => Math.round(x * 60);
const wu = (x, a = 0.5, b = 0.72) => ({ kind: "warmup", secs: m(x), from: a, to: b, name: "Warm up" });
const cd = (x, a = 0.62, b = 0.45) => ({ kind: "cooldown", secs: m(x), from: a, to: b, name: "Cool down" });
const on = (x, f, name) => ({ kind: "work", secs: m(x), from: f, name });
const off = (x, f = 0.5, name = "Easy") => ({ kind: "rest", secs: m(x), from: f, name });
const at = (x, f, name) => ({ kind: "steady", secs: m(x), from: f, name });
const rep = (n, ...steps) => ({ repeat: n, steps });
const hm = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60}` : ""}` : `${mins} min`);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Intervals from your power curve: critical power and W′ fitted to your best 2- to 20-minute efforts (work done against
// time is a straight line: its slope CP, its start W′), where they make sense; as shares of FTP for each session
// (bests: { secs: watts }, or { secs: { w, age } } with how many days ago each was ridden: sure where all four are
// there, and three or more from the last six weeks; else the targets go halfway to FTP's)
export function criticalPower(bests, ftp) {
  const W = (t) => (typeof bests?.[t] === "object" ? bests[t]?.w : bests?.[t]), age = (t) => (typeof bests?.[t] === "object" ? bests[t]?.age ?? 0 : 0);
  const pts = [120, 300, 600, 1200].filter((t) => W(t) > 0).map((t) => [t, W(t) * t]);
  if (pts.length < 3) return null;
  const n = pts.length, sx = pts.reduce((a, [x]) => a + x, 0), sy = pts.reduce((a, [, y]) => a + y, 0);
  const sxx = pts.reduce((a, [x]) => a + x * x, 0), sxy = pts.reduce((a, [x, y]) => a + x * y, 0);
  const cp = (n * sxy - sx * sy) / (n * sxx - sx * sx), w = (sy - cp * sx) / n;
  if (!(w >= 3000 && w <= 40000 && cp >= 0.7 * ftp && cp <= 1.2 * ftp)) return null;
  const sure = pts.length === 4 && [120, 300, 600, 1200].filter((t) => age(t) <= 42).length >= 3;
  return { cp: Math.round(cp), w: Math.round(w), sure };
}
// How you've been getting on with each kind of hard session: its targets set to what you've been holding. Each ride's
// efforts (fitness/efforts.js, kept with it: effFam 1 VO₂ max, 4 30/15s, 2 threshold; effFtp their targets as a share of
// FTP, in thousandths; effortPct what you rode against them) say the level held: what you rode, where every effort held;
// a little under the target, where some didn't. The last three of each kind in six weeks, averaged, against the target
// Rhythm would set from your power alone: at most 6% either way. → { vo2, on30, thr: shares to add, said: [...] }
export const FAMS = [[1, "vo2", "VO₂ max"], [4, "on30", "30/15s"], [2, "thr", "threshold"]];
// Fair to you: one ridden tired (form under −20 that day, or a poor or tired check-in) that didn't hold is left out (it
// says how tired you were, not what you can do); indoors counted 3% up (the same effort reads lower on a trainer); the
// latest counting most (1, then 0.75, then 0.55). tired: (day) → true where you were.
export function adjustments(acts, today, base, tired = () => false) {
  const out = { vo2: 0, on30: 0, thr: 0, said: [] };
  for (const [fam, key, name] of FAMS) {
    const xs = acts.filter((a) => a.sum?.effFam === fam && a.sum.efforts > 0 && a.sum.effFtp > 0 && a.start >= addDays(today, -42) && a.start < addDays(today, 1) && !(a.sum.held < a.sum.efforts && tired(startOfDay(a.start))))
      .sort((a, b) => a.start - b.start).slice(-3);
    if (!xs.length || !base?.[key]) continue;
    const level = (a) => { const f = (a.sum.effFtp / 1000) * (a.indoor ? 1.03 : 1), r = (a.sum.effortPct || 100) / 100; return a.sum.held >= a.sum.efforts ? r * f : Math.min(r, 1) * f * 0.97; };
    const wts = [0.55, 0.75, 1].slice(-xs.length), held = xs.reduce((t, a, i) => t + level(a) * wts[i], 0) / wts.reduce((x, y) => x + y, 0);
    const by = Math.round(clamp(held / base[key] - 1, -0.06, 0.06) * 200) / 200;
    out[key] = by;
    if (Math.abs(by) >= 0.01) out.said.push({ key, name, by, n: xs.length, allHeld: xs.every((a) => a.sum.held >= a.sum.efforts), last: xs.at(-1) });
  }
  return out;
}
export function targets(cpw, ftp) {
  const ftpOnly = { thr: 0.97, vo2: 1.18, on30: 1.25 };
  if (!cpw) return ftpOnly;
  const t = { thr: clamp((cpw.cp / ftp) * 0.97, 0.92, 1.02), vo2: clamp((cpw.cp + cpw.w / 300) / ftp, 1.08, 1.3), on30: clamp((cpw.cp + cpw.w / 240) / ftp, 1.12, 1.4) };
  if (cpw.sure === false) for (const k in t) t[k] = (t[k] + ftpOnly[k]) / 2;
  return t;
}
// The power curve from your rides between two days: each duration's best, an older one counting for a little less (all
// of it for four weeks, then down to 92% at twelve), with how long ago it was. → { secs: { w, age } }
export function bestsOf(acts, from, to) {
  const b = {};
  for (const a of acts) {
    if (a.start < from || a.start >= to || a.sport !== "ride") continue;
    const age = Math.max(0, (to - a.start) / DAY), wt = age <= 28 ? 1 : Math.max(0.92, 1 - ((age - 28) / 56) * 0.08);
    for (const [k, v] of Object.entries(a.sum?.curve || {})) if (v * wt > (b[k]?.w || 0)) b[k] = { w: v * wt, raw: v, age: Math.round(age) };
  }
  return b;
}
// FTP as your rides have it: critical power, where it's sure; else 95% of your best 20 minutes in six weeks (only ever
// up from that: a 20 minutes not ridden flat out says nothing about a fall). → { ftp, from: "cp" | "20" } where it's
// moved 3% or more, else null
export function ftpSeen(acts, today, ftp, cpw) {
  const b20 = bestsOf(acts, addDays(today, -42), addDays(today, 1))[1200]?.raw, est = cpw?.sure ? cpw.cp : b20 ? b20 * 0.95 : null;
  if (!est) return null;
  const v = Math.round(est), by = v / ftp - 1;
  if (by >= 0.03 || (by <= -0.03 && cpw?.sure && b20 && v <= b20 * 0.95)) return { ftp: v, from: cpw?.sure ? "cp" : "20" };
  return null;
}

// The hard sessions' ladders: each rung { n, len (minutes), rec (after each), wu, cd } (the core: their minutes all told), and the
// rung each level (0 to 3: the block's week, and a step up where you've held everything lately) climbs to
const R_ = (n, len, rec, wu = 10, cd = 8) => ({ n, len, rec, wu, cd });
export const LADDERS = {
  tempo: { steps: [R_(1, 15, 5, 10, 10), R_(2, 15, 5, 10, 10), R_(3, 15, 5, 10, 10), R_(2, 25, 5, 10, 10), R_(3, 20, 5, 10, 10)], up: [2, 3, 3, 4] },
  sweet: { steps: [R_(2, 10, 4, 10, 7), R_(3, 10, 4, 10, 7), R_(3, 12, 5, 10, 7), R_(2, 20, 6, 12, 8), R_(3, 15, 5, 12, 8)], up: [1, 2, 3, 4] },
  threshold: { steps: [R_(2, 10, 5, 12, 8), R_(3, 10, 5, 12, 8), R_(4, 10, 5, 12, 8), R_(3, 15, 6, 15, 10), R_(2, 20, 8, 15, 13)], up: [1, 2, 3, 4] },
  vo2: { steps: [R_(3, 4, 4, 15, 10), R_(4, 4, 4, 15, 10), R_(5, 4, 4, 15, 10), R_(6, 4, 4, 15, 10), R_(5, 5, 4, 15, 10)], up: [2, 3, 3, 4] },
  // (30/15s: n sets of len, each set len × 45 s, three minutes between)
  thirty: { steps: [R_(1, 13, 3, 15, 10), R_(2, 13, 3, 15, 10), R_(3, 13, 3, 15, 10), R_(3, 15, 3, 15, 10)], up: [2, 2, 3, 3] },
};
function rung(c) {
  const work = LADDERS.thirty.steps.includes(c) ? c.len * 0.75 : c.len;
  return { ...c, core: Math.round(c.wu + c.cd + c.n * (work + c.rec)), steps: (f, name, easy = 0.55) => [wu(c.wu), rep(c.n, on(c.len, f, name), off(c.rec, easy)), cd(c.cd)] };
}
// an id for a session at a length, its level kept
export const withMins = (id, mins) => String(id).replace(/^(rh:[a-z0-9]+:)\d+/, `$1${mins}`);
// a session Rhythm makes, from its id (rh:<kind>:<minutes>, and :<level> for the hard ones): its steps, with any spare
// time ridden steady round the work
export function session(id, t = targets(null)) {
  const x = /^rh:([a-z0-9]+):(\d+)(?::(\d))?$/.exec(id || "");
  if (!x) return null;
  const kind = x[1], mins = +x[2], level = Math.min(3, +(x[3] || 0));
  const fill = (core, steps) => (mins - core >= 15 ? [steps[0], at(mins - core, 0.68, "Endurance"), ...steps.slice(1)] : steps);
  // (the rung for the level, or the highest below it the time allows; the lowest where none does)
  const ladder = (L, f) => { const cs = L.steps.map(rung); let i = Math.min(L.up[level], cs.length - 1); while (i > 0 && cs[i].core > mins + 5) i--; return f(cs[i]); };
  const make = (name, label, about, steps) => ({ id, sport: "ride", kind: label, name, about, steps, rhythm: true });
  switch (kind) {
    case "endurance": return make(`Endurance ${hm(mins)}`, "Endurance", "Steady zone 2: conversational all the way. The riding that builds everything else.", [wu(10, 0.5, 0.65), at(Math.max(10, mins - 15), 0.68, "Endurance"), cd(5, 0.6, 0.45)]);
    case "long": return make(`Long ride ${hm(mins)}`, "Endurance", "Your long ride: zone 2 throughout, and eat from the first hour.", [wu(15, 0.5, 0.65), at(Math.max(20, mins - 30), 0.67, "Endurance"), cd(15, 0.6, 0.45)]);
    case "recovery": return make("Recovery spin", "Recovery", "Easy spinning, nothing more: come away fresher than you started.", [at(Math.min(mins, 60), 0.48, "Easy spin")]);
    // (the hard ones: a ladder each, the block's week climbing it, longer efforts first, then more of them, then harder;
    // as far up as the day's time goes, give or take five minutes)
    case "tempo": return ladder(LADDERS.tempo, (c) => make(`Tempo ${c.n} × ${c.len}`, "Tempo", "Comfortably hard: steady pressure, breathing deep but in control.", fill(c.core, c.steps(0.83, "Tempo"))));
    case "sweet": return ladder(LADDERS.sweet, (c) => make(`Sweet spot ${c.n} × ${c.len}`, "Sweet spot", "Just under threshold: the most fitness for the least fatigue. Seated and smooth.", fill(c.core, c.steps(0.9, "Sweet spot"))));
    case "threshold": return ladder(LADDERS.threshold, (c) => make(`Threshold ${c.n} × ${c.len}`, "Threshold", c.len >= 20 ? "Twenty minutes at threshold, twice: hard, but finish each feeling there was a little more." : `${c.len === 10 ? "Ten" : c.len === 12 ? "Twelve" : "Fifteen"} minutes at threshold, ${["", "once", "twice", "three times", "four times"][c.n]}. Even, not heroic.`, fill(c.core, c.steps(t.thr, "Threshold"))));
    case "vo2": return ladder(LADDERS.vo2, (c) => make(`VO₂ max ${c.n} × ${c.len}`, "VO₂ max", `${c.len === 5 ? "Five" : "Four"} minutes as hard as you can hold for ${c.len === 5 ? "five" : "four"}, spun out easy between. Don't start the next till you're ready.`, fill(c.core, c.steps(t.vo2, "VO₂ max", 0.5))));
    case "thirty": return ladder(LADDERS.thirty, (c) => { const block = Array.from({ length: c.len * 2 }, (_, i) => (i % 2 ? off(0.25, 0.5, "Easy") : on(0.5, t.on30, "Hard")));
      return make(`30/15s ${c.n} × ${c.len}`, "VO₂ max", `Thirty seconds hard, fifteen easy, ${c.len} times; three minutes between. Time near VO₂ max without the dread of long efforts.`, fill(c.core, [wu(15), rep(c.n, ...block, off(3, 0.5, "Recover")), cd(10)])); });
    case "sprint": return make("Sprints 8 × 15 s", "Anaerobic", "All-out sprints from a rolling start, with full recovery. Quality over quantity.", fill(65, [wu(15), rep(8, on(0.25, 2.0, "Sprint"), off(4.75, 0.5, "Recover")), cd(10)]));
    case "durable": { const steady = Math.max(30, mins - 10 - 25 - 5); return make(`Long ride, hard finish`, "Durability", "A long steady ride with two threshold efforts in its last hour, when you're already tired: power that lasts.", [wu(10, 0.5, 0.65), at(steady, 0.67, "Endurance"), rep(2, on(10, Math.min(t.thr, 0.95), "Threshold, tired")), off(5, 0.55), cd(5)]); }
  }
  return null;
}
// a day's session, whichever it is
export const workoutOf = (id, t) => session(id, t) || workoutById(id);

// ---- what a past activity was ----
// (from its time in each power zone where it has them; else how hard and how long)
export function classify(a) {
  const s = a.sum || {}, z = s.zones, mins = (s.moving || 0) / 60;
  if (a.sport === "run") return (s.tss || 0) / Math.max(mins / 60, 0.25) > 75 ? "run-tempo" : "run-easy";
  if (a.sport === "swim") return "swim";
  if (a.sport !== "ride") return "other";
  if (z && z.length === 7) {
    const [, , z3, z4, z5, z6, z7] = z;
    if (mins >= 140 && z4 >= 600) return "durable";
    if (z5 + z6 >= 480) return "vo2";
    if (z7 >= 40 && z5 < 300) return "sprint";
    if (z4 >= 900) return "threshold";
    if (z4 + z3 >= 1500 && z4 >= 300) return "sweet";
    if (z3 >= 1200) return "tempo";
    return mins >= 140 ? "long" : "endurance";
  }
  const iF = s.iF || 0;
  if (iF >= 0.88 && mins < 120) return "threshold";
  if (iF >= 0.8 && mins < 150) return "sweet";
  return mins >= 140 ? "long" : "endurance";
}
const feelOf = (f) => {
  if (!f) return "good";
  const score = (f.sleep ?? 1) + (f.legs ?? 1) + (f.mood ?? 1);
  return score <= 2 ? "poor" : f.sleep === 0 || f.legs === 0 ? "tired" : "good";
};
// Your night, from Garmin (functions/_garmin.js) or Apple Health (functions/_health.js): { day: { hrv, hrv_lo, hrv_hi,
// rhr, sleep, score } }, each read against your own usual:
// - HRV under its usual range (Garmin's own; else your last month's average, less a standard deviation), or the week's
//   average under your usual by more than half a standard deviation (a falling trend: Plews et al. 2013, HRV's 7-day
//   rolling average against its baseline, the smallest change that matters half its spread)
// - resting heart rate 5 or more above your month's middle
// - a night under six hours or scored under 60; or three short nights running (sleep debt: under 19 h 30 in three)
// - and a good night: HRV in its range or above, resting heart rate as usual, seven hours or more (the green light)
// → { hrv, rhr, sleep, score, lo, hi, rb, trend, base, hrvLow, rhrUp, short, trendLow, debt, green, said } or null
export function nightOf(well, day) {
  const n = well?.[day];
  if (!n) return null;
  const on = (d) => well?.[addDays(day, d)], mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length, sdOf = (xs, m) => Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  const before = Object.entries(well || {}).filter(([d]) => +d < day && +d >= addDays(day, -30)).map(([, v]) => v);
  const hv = before.map((v) => v.hrv).filter((v) => v > 0), mid = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
  let lo = n.hrv_lo > 0 ? n.hrv_lo : null, hi = n.hrv_hi > 0 ? n.hrv_hi : null;
  if ((!lo || !hi) && hv.length >= 7) { const m = mean(hv), sd = sdOf(hv, m); lo ??= m - sd; hi ??= m + sd; }
  const rb = mid(before.map((v) => v.rhr).filter((v) => v > 0)), rhrN = before.filter((v) => v.rhr > 0).length;
  // (the week's HRV, against the month before it)
  const week = Array.from({ length: 7 }, (_, i) => on(-i)?.hrv).filter((v) => v > 0);
  const baseXs = Array.from({ length: 30 }, (_, i) => on(-7 - i)?.hrv).filter((v) => v > 0);
  const trend = week.length >= 5 ? mean(week) : null, base = baseXs.length >= 14 ? { m: mean(baseXs), sd: sdOf(baseXs, mean(baseXs)) } : null;
  const three = [0, -1, -2].map((d) => on(d)?.sleep), slept = three.every((v) => v > 0) ? three.reduce((a, b) => a + b, 0) : null;
  const out = {
    hrv: n.hrv ?? null, rhr: n.rhr ?? null, sleep: n.sleep ?? null, score: n.score ?? null, lo, hi, rb, trend, base,
    hrvLow: n.hrv > 0 && lo > 0 && n.hrv < lo, rhrUp: n.rhr > 0 && rhrN >= 7 && n.rhr >= rb + 5, short: (n.sleep > 0 && n.sleep < 6 * 3600) || (n.score > 0 && n.score < 60),
    // (and most of the week's nights under it too, so one bad night isn't a falling week)
    trendLow: trend != null && base != null && trend < base.m - 0.5 * base.sd && week.filter((v) => v < base.m).length >= 4,
    debt: slept != null && slept < 19.5 * 3600 && three.filter((v) => v < 7 * 3600).length >= 2,
  };
  out.green = !out.hrvLow && !out.rhrUp && !out.short && !out.trendLow && !out.debt && n.hrv > 0 && lo > 0 && (n.sleep >= 7 * 3600 || n.score >= 75);
  const hm = (s) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;
  out.said = out.hrvLow ? `your HRV is ${Math.round(n.hrv)}, under its usual range` : out.rhrUp ? `your resting heart rate is ${Math.round(n.rhr)}, up ${Math.round(n.rhr - rb)}`
    : out.trendLow ? `your HRV has been under its usual all week` : out.short ? (n.sleep > 0 && n.sleep < 6 * 3600 ? `you slept ${hm(n.sleep)}` : `your sleep scored ${n.score}`)
    : out.debt ? `three short nights: ${hm(slept)} in all` : null;
  return out;
}
const fuelFor = (mins, hard) => (mins < 75 ? null : mins >= 150 && hard ? "about 90 g of carbs an hour" : mins >= 120 ? "60–80 g of carbs an hour" : "40–60 g of carbs an hour");

// ---- the plan ----
// prefs: your week (DEFAULTS' shape, with `start`: the Monday Rhythm began); acts: your activities, each { start, sport,
// sum } (sum: its figures, tss and zones and curve); feel: how you felt, by day; today: the day's start; ftp.
// → { days: this week's and the next seven (each { date, id, kind, mins, tss, hard, why, fuel, strength, moved, done,
//   missed }), today, block: { index, theme, week, absorb }, ctl, atl, cpw }
// (where you've been riding lately, as you said it, for a start when there's little of your own to go by: fitness)
export const LEVELS = { none: 10, some: 25, regular: 45, lots: 70 };
// what a day you've changed (a swap: a session's id, or null for rest) asks of you
const kindOfId = (id) => (id == null ? "rest" : /^rh:([a-z0-9]+):/.exec(id)?.[1] || ({ "recovery-45": "recovery", "run-tempo": "run-tempo", "swim-css": "swim-css" }[id] || (/^run/.test(id) ? "run-easy" : /^swim/.test(id) ? "swim" : "endurance")));
// (too little of your own riding lately to go by: fewer than six days with an activity in the last six weeks)
export const sparse = (acts, today) => new Set(acts.filter((a) => a.start >= addDays(today, -42) && a.start < addDays(today, 1)).map((a) => startOfDay(a.start))).size < 6;

// wet: the wet days ahead ({ day: true }, fitness/besttime.js wetDays); well: your nights (nightOf).
export function plan({ prefs, acts = [], feel = {}, swaps = {}, today, ftp = 250, paces = { run: 4, swim: 1 }, wet = {}, well = {} }) {
  const P = { ...DEFAULTS, ...(prefs || {}) }, start = mondayOf(P.start ?? today);
  const hours = P.days.reduce((a, x) => a + x, 0) / 60;
  // each day's activities, and their kinds
  const byDay = new Map();
  for (const a of acts) { const d = startOfDay(a.start); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push({ ...a, cls: classify(a) }); }
  // your power curve now (the last 12 weeks' best, the older counting a little less), for intervals set from it
  const bestsIn = (from, to) => Object.fromEntries(Object.entries(bestsOf(acts, from, to)).map(([k, v]) => [k, v.raw]));
  const cpw = criticalPower(bestsOf(acts, addDays(today, -84), addDays(today, 1)), ftp), T = targets(cpw, ftp);
  // (your form day by day these four months, so a session ridden tired doesn't lower the targets)
  const formOn = new Map();
  { const daily = new Map(); for (const a of acts) { const x = startOfDay(a.start); daily.set(x, (daily.get(x) || 0) + tssOf(a.sum, a.sport)); }
    let c = 0, t = 0; for (let x = addDays(today, -126); x <= today; x = addDays(x, 1)) { formOn.set(x, c - t); const v = daily.get(x) || 0; c += (v - c) / 42; t += (v - t) / 7; } }
  const tiredOn = (x) => (formOn.get(x) ?? 0) < -20 || feelOf(feel[x]) !== "good";
  // (the targets, as you've been holding them)
  const adjust = adjustments(acts, today, { ...T }, tiredOn);
  T.vo2 *= 1 + adjust.vo2; T.on30 *= 1 + adjust.on30; T.thr *= 1 + adjust.thr;
  const ftpNew = ftpSeen(acts, today, ftp, cpw);
  // each block's theme: in order the first time round; then whatever moved least in the six weeks before it, or the
  // same again once if it moved a lot
  const themes = [];
  const themeOf = (b) => {
    if (themes[b]) return themes[b];
    if (b < 3) return (themes[b] = ORDER[b]);
    const at0 = addDays(start, b * 28), now = bestsIn(addDays(at0, -42), at0), before = bestsIn(addDays(at0, -84), addDays(at0, -42));
    const gain = (k) => (now[k] && before[k] ? now[k] / before[k] - 1 : null);
    const g = { topend: gain(300), threshold: gain(1200), aerobic: gain(3600) }, prev = themeOf(b - 1);
    if (Object.values(g).some((v) => v == null)) return (themes[b] = ORDER[b % 3]);
    // (and your staying power: heart rate drifting under 5% on long rides says the base is built; over 8%, not yet)
    const drifts = acts.filter((a) => a.sport === "ride" && a.sum?.drift != null && a.start >= addDays(at0, -42) && a.start < at0).map((a) => a.sum.drift).sort((x, y) => x - y);
    if (drifts.length >= 2) { const md = drifts[drifts.length >> 1]; g.aerobic += md < 5 ? 0.03 : md > 8 ? -0.03 : 0; }
    if (g[prev] > 0.04 && themeOf(b - 2) !== prev) return (themes[b] = prev);
    return (themes[b] = ORDER.filter((k) => k !== prev).sort((p, q) => g[p] - g[q])[0]);
  };
  // the load model, from 16 weeks before the first activity or today, whichever is later
  const first = acts.length ? Math.min(...acts.map((a) => startOfDay(a.start))) : today;
  let d = Math.min(Math.max(addDays(first, -1), addDays(today, -112)), mondayOf(today)), ctl = 0, atl = 0;
  // (with under four weeks of your activities to go by, the load model starts where riding your week would have you)
  const seeded = sparse(acts, today);
  if (seeded) ctl = atl = LEVELS[P.level] ?? Math.min(45, hours * 5);
  const since = { tempo: 14, sweet: 14, threshold: 14, vo2: 14, sprint: 14, durable: 14, long: 7 };
  let lastHard = -Infinity, poorRun = 0, allow = null;
  // (a falling week of HRV this morning: no hard days for the next two either)
  const trendTill = nightOf(well, today)?.trendLow ? addDays(today, 2) : null;
  const week = { mon: null, tss: 0, hard: 0, strength: 0, run: false, swim: false, missed: null, missedTss: 0, moved: false, target: null };
  const out = [], thisMon = mondayOf(today), end = addDays(today, 7);
  let now = { ctl: 0, atl: 0 };
  const line = [];   // (fitness, the last four weeks and the week ahead, as planned)
  // one day: what's planned (from this week on), and its load, done or planned
  function step(d) {
    const mon = mondayOf(d);
    if (week.mon !== mon) Object.assign(week, { mon, tss: 0, hard: 0, strength: 0, run: false, swim: false, missed: null, missedTss: 0, moved: false, target: null });
    if (d === today) now = { ctl, atl };
    if (d >= addDays(today, -28)) line.push({ date: d, ctl, future: d > today });
    const done = byDay.get(d) || [], planning = d >= thisMon && d >= start;
    let dec = null;
    if (planning) {
      dec = decide(d);
      if (Object.prototype.hasOwnProperty.call(swaps, d)) {
        const id = swaps[d], k = kindOfId(id), w = id ? workoutOf(id, T) : null, mm = w ? measure(w, w.sport === "run" ? paces.run : w.sport === "swim" ? paces.swim : 4) : null;
        dec = { ...dec, id: id ?? null, kind: k, mins: mm ? Math.round(mm.secs / 60) : 0, tss: mm ? Math.round(mm.tss) : 0, hard: HARD.has(k), strength: dec.strength && HARD.has(k), fuel: w?.sport === "ride" && mm ? fuelFor(Math.round(mm.secs / 60), HARD.has(k)) : null, why: "As you changed it", swapped: true };
      }
      // (missed: a session planned on a day gone by, since Rhythm was set up, with nothing done)
      const missed = d < today && d >= (P.at ?? start) && dec.kind !== "rest" && !done.length;
      if (missed && !week.missed) week.missed = d;
      if (missed) week.missedTss += dec.tss;
      out.push({ ...dec, done: done.length > 0, missed });
    }
    // the day's load: what was done, or (from today on, where nothing's done yet) what's planned
    const real = done.length > 0 || d < today;
    const tss = real ? done.reduce((a, x) => a + tssOf(x.sum, x.sport), 0) : dec?.tss || 0;
    ctl += (tss - ctl) / 42; atl += (tss - atl) / 7; week.tss += tss;
    for (const k in since) since[k] += 1;
    const kinds = real ? done.map((x) => x.cls) : dec && dec.kind !== "rest" ? [dec.kind] : [];
    for (const k of kinds) {
      const base = k === "thirty" ? "vo2" : k;
      if (base in since) since[base] = 0;
      if (k === "durable") { since.long = 0; since.threshold = 0; }
      if (HARD.has(k)) { lastHard = d; week.hard++; }
      if (k.startsWith("run")) week.run = true;
      if (k.startsWith("swim")) week.swim = true;
    }
    if (dec?.strength) week.strength++;
  }
  // The week ahead as a whole: each way of placing its hard days (up to three, on any of its days, or wherever they
  // come first, as day by day would), tried, and the best kept: hard days where they're most needed and you're freshest,
  // spaced, on the wet days (intervals suit the trainer), the long ride on a dry one, and the week's stress on target
  const snap = () => ({ ctl, atl, since: { ...since }, lastHard, poorRun, week: { ...week }, n: out.length, ln: line.length, now: { ...now } });
  const back = (x) => { ctl = x.ctl; atl = x.atl; Object.assign(since, x.since); lastHard = x.lastHard; poorRun = x.poorRun; Object.assign(week, x.week); out.length = x.n; line.length = x.ln; now = x.now; };
  const dowOf = (x) => (new Date(x).getDay() + 6) % 7;
  function scoreOf(n, last) {
    let sc = 0, prev = null;
    for (const e of out.slice(n)) {
      if (e.hard && !e.done) { sc += Math.min(2, e.need ?? 1) + (wet[e.date] ? 0.3 : 0) - (e.tsb < -15 ? 0.4 : 0); if (prev != null && (e.date - prev) / DAY >= 2.9) sc += 0.2; prev = e.date; }
      if (e.kind === "long" || e.kind === "durable") sc += wet[e.date] ? -0.3 : 0.3;
    }
    if (week.target && dowOf(last) === 6) sc -= 1.5 * Math.min(1, Math.abs(week.tss - week.target) / week.target);
    return sc;
  }
  function plannedWeek(win) {
    const s0 = snap(), ways = [null];
    for (let m = 0; m < 1 << win.length; m++) { let bits = 0; for (let x = m; x; x &= x - 1) bits++; if (bits <= 3) ways.push(new Set(win.filter((_, i) => m & (1 << i)))); }
    let best = null;
    for (const w of ways) {
      allow = w; for (const x of win) step(x);
      const sc = scoreOf(s0.n, win.at(-1)) + (w === null ? 0.01 : 0);
      if (!best || sc > best.sc) best = { sc, w };
      back(s0);
    }
    return best.w;
  }
  for (; d <= end; d = addDays(d, 1)) {
    if (d >= today && d >= thisMon && d >= start && (d === today || dowOf(d) === 0)) {
      const win = []; for (let x = d; x <= Math.min(addDays(mondayOf(d), 6), end); x = addDays(x, 1)) win.push(x);
      allow = plannedWeek(win);
      for (const x of win) step(x);
      allow = null; d = win.at(-1);
      continue;
    }
    step(d);
  }

  function decide(day) {
    const wk = Math.max(0, Math.round((mondayOf(day) - start) / (7 * DAY))), b = Math.floor(wk / 4), bw = wk % 4, theme = themeOf(b);
    const absorb = bw === 3, hold = P.mode === "hold", dow = (new Date(day).getDay() + 6) % 7, tsb = ctl - atl;
    let f = day <= today ? feelOf(feel[day]) : "good";
    poorRun = f === "poor" ? poorRun + 1 : 0;
    // (your night: a low HRV, a falling week of it, or a raised resting heart rate eases the day; a short night or three,
    // where you've not said you slept well; a falling week and a low night as well, rest; and for two days after a
    // falling week, no hard days, so it can come back)
    const night = day <= today ? nightOf(well, day) : null, sleptWell = feel[day]?.sleep === 2;
    const nightWhy = f === "good" && night && (night.hrvLow || night.rhrUp || night.trendLow || ((night.short || night.debt) && !sleptWell)) ? night.said : null;
    if (nightWhy) f = "tired";
    const green = day === today && f === "good" && night?.green;
    const base = { date: day, block: { index: b, theme, week: bw, absorb }, feel: f };
    let avail = P.days[dow] || 0, moved = false;
    // a rest day moved: a session missed earlier this week, form good, and another rest day still to come this week
    const restsLeft = P.days.slice(dow + 1).filter((x) => !x).length;
    if (!avail && week.missed && !week.moved && tsb > -15 && restsLeft > 0 && day >= today) {
      avail = Math.max(45, Math.min(90, Math.max(...P.days) / 2)); moved = true; week.moved = true;
    }
    const restWhy = (why) => ({ ...base, id: null, kind: "rest", mins: 0, tss: 0, hard: false, why, fuel: null, strength: false, moved: false });
    if (!avail) return restWhy(P.days.some((x) => x) ? "A rest day: fitness is built while you recover" : "Choose the days you ride in Rhythm's settings");
    if (tsb < -25) return restWhy(`Rest: your form is ${Math.round(tsb)}, too tired to train well`);
    if (poorRun >= 2) return restWhy("Rest: you've felt poor two days running");
    if (night?.trendLow && (night.hrvLow || night.rhrUp)) return restWhy(`Rest: your HRV has been under its usual all week, and last night ${night.hrvLow ? "was low again" : "your resting heart rate was up"}`);
    // the week's training stress: fitness up a few points in a build week (fewer as it gets higher), level in hold,
    // about 60% in an absorb week
    const ramp = hold ? 0 : Math.max(1.5, 4.5 - ctl / 40);
    const target = absorb ? ctl * 7 * (hold ? 0.8 : 0.6) : (ctl + 6 * ramp) * 7;
    if (week.target == null) week.target = target;
    const daysLeft = P.days.slice(dow).filter((x) => x > 0).length || 1, share = Math.max(0, (target - week.tss) / daysLeft);
    const maxHard = absorb ? 1 : hours >= 12 ? 3 : 2, longest = avail === Math.max(...P.days) && avail >= 90;
    // (heavy legs, or a poor day, carry over: the day after is easy too)
    const fy = feel[addDays(day, -1)], yesterday = fy && addDays(day, -1) <= today ? (feelOf(fy) === "poor" ? "you weren't feeling good yesterday" : fy.legs === 0 ? "your legs were heavy yesterday" : null) : null;
    // (a good night lets a hard day stand a little deeper into fatigue: form down to −25, not −20)
    const settling = trendTill && day > today && day <= trendTill;
    const canHard = tsb > (green ? -25 : -20) && day - lastHard >= 2 * DAY - 3600e3 && week.hard < maxHard && f === "good" && !yesterday && !settling && avail >= 50 && (!allow || allow.has(day));
    // what's needed most: each kind's days since, against how often this block (and your lean, and your hours) wants it
    const sp = { ...SPACING[theme] };
    if (P.lean === "endurance") { sp.tempo *= 0.7; sp.sweet *= 0.8; sp.vo2 *= 1.4; sp.sprint *= 1.6; }
    if (P.lean === "punch") { sp.vo2 *= 0.75; sp.sprint *= 0.7; sp.tempo *= 1.4; }
    if (hours <= 6) { sp.sweet *= 0.8; sp.tempo *= 0.8; sp.vo2 *= 1.2; } else if (hours >= 9) { sp.sweet *= 1.5; sp.tempo *= 1.6; sp.vo2 *= 0.85; }
    const need = Object.entries(sp).map(([k, s]) => [k, since[k] / s]).sort((p, q) => q[1] - p[1]);
    let kind, why, needed = null;
    if (f === "poor") { kind = "recovery"; why = "Easy: you're not feeling good this morning"; }
    else if (longest && canHard && theme !== "topend" && !absorb && since.durable >= 13 && avail >= 100) { kind = "durable"; needed = since.durable / 13; why = "Your long ride, with threshold efforts in its last hour: power that lasts when you're tired"; }
    else if (canHard && need[0][1] >= 1 && !(longest && since.long >= 5)) {
      const k = need[0][0]; needed = need[0][1];
      kind = k === "vo2" && (theme === "topend" || since.vo2 >= 10) && avail >= 52 ? "thirty" : k;
      const ago = since[k] > 21 ? "Over three weeks" : `${Math.round(since[k])} days`, block = THEMES[theme].toLowerCase();
      why = `${ago} since your last ${WORDS[k]} session${theme === (k === "vo2" || k === "sprint" ? "topend" : k === "tempo" ? "aerobic" : "threshold") ? `, and you're in ${/^[aeiou]/.test(block) ? "an" : "a"} ${block} block` : ": keeping it sharp"}`;
    } else if (longest) { kind = "long"; why = "Your longest day: the week's long ride"; }
    else if (tsb < -15) { kind = "recovery"; why = `Easy: your form is ${Math.round(tsb)}`; }
    else { kind = "endurance"; why = f === "tired" ? `Steady, not hard: ${nightWhy || "a poor night or heavy legs"}` : yesterday ? `Steady, not hard: ${yesterday}` : settling ? "Steady, not hard: your HRV's been low this week, so easy days till it's back" : "Aerobic riding between the harder days"; }
    if (green && HARD.has(kind) && tsb <= -20) why += ". Your night says you've recovered: the hard day stands";
    // a run and a swim a week, where you do them, in place of an easy ride on a shorter day
    let id = null, mins = avail;
    if ((kind === "endurance" || kind === "recovery") && !longest) {
      // (both still to do this week: one or the other by the day, so they fall on different days)
      const can = [P.run && !week.run && "run", P.swim && !week.swim && "swim"].filter(Boolean), pick = can[dow % (can.length || 1)];
      if (pick === "run") { kind = canHard && week.hard < maxHard && (wk % 2 === 1) ? "run-tempo" : "run-easy"; id = kind === "run-tempo" ? "run-tempo" : avail >= 70 ? "run-long" : "run-easy-40"; why = kind === "run-tempo" ? "Your run this week: twenty minutes at threshold" : "Your run this week, easy"; }
      else if (pick === "swim") { kind = canHard && week.hard < maxHard ? "swim-css" : "swim"; id = kind === "swim-css" ? "swim-css" : "swim-endurance"; why = kind === "swim-css" ? "Your swim this week: threshold 100s" : "Your swim this week, steady"; }
    }
    if (!id) {
      if (kind === "endurance" || kind === "long") mins = Math.max(40, Math.min(avail, Math.round(share / (kind === "long" ? 0.75 : 0.77) / 5) * 5));   // (TSS a minute, steady zone 2)
      if (kind === "recovery") mins = Math.min(45, avail);
      // (never more in a day than your fitness can take: about two and a half days' worth, an hour at least)
      const cap = Math.max(60, ctl * 2.5);
      if (kind === "endurance" || kind === "long") mins = Math.min(mins, Math.max(40, Math.round(cap / 0.77 / 5) * 5));
      // (a hard day: the session, with steady riding round it only as far as the week's budget goes)
      if (HARD.has(kind) || kind === "tempo") mins = Math.min(avail, Math.max(kind === "durable" ? 100 : 55, Math.round(Math.min(share, cap) / (kind === "durable" ? 0.8 : 0.9) / 5) * 5));
      // (a missed ride's training made up on the easy days left, as far as they go: said where it's ten minutes or more)
      if ((kind === "endurance" || kind === "long") && week.missedTss > 0 && week.missed) {
        const without = Math.max(40, Math.min(avail, Math.round(Math.max(0, share - week.missedTss / daysLeft) / (kind === "long" ? 0.75 : 0.77) / 5) * 5));
        if (mins - without >= 10) why += `. ${mins - without} minutes longer, to make up for ${new Date(week.missed).toLocaleDateString("en-GB", { weekday: "long" })}'s missed ride`;
      }
      // (the hard ones at their level: the block's week, a step up where every effort's held lately, none in an absorb week)
      const fam = { vo2: "vo2", thirty: "on30", threshold: "thr" }[kind];
      if (LADDERS[kind]) {
        const up = fam && adjust[fam] > 0 ? 1 : 0, level = absorb ? 0 : hold ? 1 : Math.min(3, bw + up);
        id = `rh:${kind}:${mins}:${level}`;
        if (up && level > bw) why += ". A step up: you held every effort last time";
      } else id = `rh:${kind}:${mins}`;
      if (wet[day] && (HARD.has(kind) || kind === "tempo")) why += ". Rain forecast: one for the trainer";
      else if (wet[day] && kind === "long") why += ". Rain forecast: dress for it, or take it indoors";
    }
    const w = workoutOf(id, T), meas = w ? measure(w, w.sport === "run" ? paces.run : w.sport === "swim" ? paces.swim : 4) : { secs: mins * 60, tss: 0 };
    mins = Math.round(meas.secs / 60);
    const hard = HARD.has(kind);
    if (moved) why = `Rest day moved: you missed ${new Date(week.missed).toLocaleDateString("en-GB", { weekday: "long" })}'s session. ${why}`;
    // (heavy strength on a hard day, twice a week in aerobic and threshold blocks, once in top end, none when absorbing)
    const strength = hard && !absorb && week.strength < (theme === "topend" ? 1 : 2) && !kind.startsWith("swim");
    return { ...base, id, kind, mins, tss: Math.round(meas.tss), hard, why, fuel: w?.sport === "ride" ? fuelFor(mins, hard) : null, strength, moved, need: needed, tsb: Math.round(tsb), night: nightWhy, green: !!(green && hard) };
  }

  const at0 = out.find((x) => x.date === today) || null;
  return { days: out, today: at0, block: at0?.block || { index: 0, theme: "aerobic", week: 0, absorb: false }, ctl: now.ctl, atl: now.atl, seeded, line, cpw, targets: T, adjust, ftpSeen: ftpNew };
}
