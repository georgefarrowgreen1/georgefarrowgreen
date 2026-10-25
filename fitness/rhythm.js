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
// - Intervals set from critical power and W′ where your rides give them, else from FTP (Chorley & Lamb 2020).
// - A poor night or heavy legs keep the time and drop the intensity; feeling poor twice running, rest.
// - Heavy strength twice a week on hard days in aerobic and threshold blocks, once in top-end blocks, none in an
//   absorb week (Rønnestad & Mujika). Every ride says what to eat (up to about 90 g an hour).
// - A rest day may move: a session missed earlier in the week, form good, and another rest day still to come, and the
//   rest day becomes the catch-up ride.
// - Rides first; a run and a swim a week as well, where you ride those too.

import { workoutById, measure, startOfDay, addDays, mondayOf, DAY } from "./workouts.js";

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
export function criticalPower(bests, ftp) {
  const pts = [120, 300, 600, 1200].filter((t) => bests?.[t] > 0).map((t) => [t, bests[t] * t]);
  if (pts.length < 3) return null;
  const n = pts.length, sx = pts.reduce((a, [x]) => a + x, 0), sy = pts.reduce((a, [, y]) => a + y, 0);
  const sxx = pts.reduce((a, [x]) => a + x * x, 0), sxy = pts.reduce((a, [x, y]) => a + x * y, 0);
  const cp = (n * sxy - sx * sy) / (n * sxx - sx * sx), w = (sy - cp * sx) / n;
  if (!(w >= 3000 && w <= 40000 && cp >= 0.7 * ftp && cp <= 1.2 * ftp)) return null;
  return { cp: Math.round(cp), w: Math.round(w) };
}
export function targets(cpw, ftp) {
  if (!cpw) return { thr: 0.97, vo2: 1.18, on30: 1.25 };
  return { thr: clamp((cpw.cp / ftp) * 0.97, 0.92, 1.02), vo2: clamp((cpw.cp + cpw.w / 300) / ftp, 1.08, 1.3), on30: clamp((cpw.cp + cpw.w / 240) / ftp, 1.12, 1.4) };
}

// a session Rhythm makes, from its id: its steps, with any spare time ridden steady round the work
export function session(id, t = targets(null)) {
  const x = /^rh:([a-z0-9]+):(\d+)$/.exec(id || "");
  if (!x) return null;
  const kind = x[1], mins = +x[2];
  const fill = (core, steps) => (mins - core >= 15 ? [steps[0], at(mins - core, 0.68, "Endurance"), ...steps.slice(1)] : steps);
  const make = (name, label, about, steps) => ({ id, sport: "ride", kind: label, name, about, steps, rhythm: true });
  switch (kind) {
    case "endurance": return make(`Endurance ${hm(mins)}`, "Endurance", "Steady zone 2: conversational all the way. The riding that builds everything else.", [wu(10, 0.5, 0.65), at(Math.max(10, mins - 15), 0.68, "Endurance"), cd(5, 0.6, 0.45)]);
    case "long": return make(`Long ride ${hm(mins)}`, "Endurance", "Your long ride: zone 2 throughout, and eat from the first hour.", [wu(15, 0.5, 0.65), at(Math.max(20, mins - 30), 0.67, "Endurance"), cd(15, 0.6, 0.45)]);
    case "recovery": return make("Recovery spin", "Recovery", "Easy spinning, nothing more: come away fresher than you started.", [at(Math.min(mins, 60), 0.48, "Easy spin")]);
    case "tempo": { const n = mins >= 75 ? 3 : 2, core = 20 + n * 15 + (n - 1) * 5; return make(`Tempo ${n} × 15`, "Tempo", "Comfortably hard: steady pressure, breathing deep but in control.", fill(core, [wu(10), rep(n, on(15, 0.83, "Tempo"), off(5, 0.55)), cd(10)])); }
    case "sweet": return mins >= 66 ? make("Sweet spot 2 × 20", "Sweet spot", "Just under threshold: the most fitness for the least fatigue. Seated and smooth.", fill(66, [wu(12), rep(2, on(20, 0.9, "Sweet spot"), off(6, 0.55)), cd(8)]))
      : make("Sweet spot 3 × 10", "Sweet spot", "Just under threshold: the most fitness for the least fatigue. Seated and smooth.", fill(55, [wu(10), rep(3, on(10, 0.9, "Sweet spot"), off(4, 0.55)), cd(7)]));
    case "threshold": return mins >= 80 ? make("Threshold 2 × 20", "Threshold", "Twenty minutes at threshold, twice: hard, but finish each feeling there was a little more.", fill(76, [wu(15), rep(2, on(20, t.thr, "Threshold"), off(8, 0.55)), cd(13)]))
      : make("Threshold 3 × 10", "Threshold", "Ten minutes at threshold, three times. Even, not heroic.", fill(60, [wu(12), rep(3, on(10, t.thr, "Threshold"), off(5, 0.55)), cd(8)]));
    case "vo2": { const n = mins >= 61 ? 5 : 4; return make(`VO₂ max ${n} × 4`, "VO₂ max", "Four minutes as hard as you can hold for four, spun out easy between. Don't start the next till you're ready.", fill(25 + n * 8 - 4, [wu(15), rep(n, on(4, t.vo2, "VO₂ max"), off(4, 0.5)), cd(10)])); }
    case "thirty": { const n = mins >= 70 ? 3 : 2, block = Array.from({ length: 26 }, (_, i) => (i % 2 ? off(0.25, 0.5, "Easy") : on(0.5, t.on30, "Hard")));
      return make(`30/15s ${n} × 13`, "VO₂ max", "Thirty seconds hard, fifteen easy, for thirteen minutes; three minutes between. Time near VO₂ max without the dread of long efforts.", fill(25 + n * 13 + (n - 1) * 3, [wu(15), rep(n, ...block, off(3, 0.5, "Recover")), cd(10)])); }
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

export function plan({ prefs, acts = [], feel = {}, swaps = {}, today, ftp = 250, paces = { run: 4, swim: 1 } }) {
  const P = { ...DEFAULTS, ...(prefs || {}) }, start = mondayOf(P.start ?? today);
  const hours = P.days.reduce((a, x) => a + x, 0) / 60;
  // each day's activities, and their kinds
  const byDay = new Map();
  for (const a of acts) { const d = startOfDay(a.start); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push({ ...a, cls: classify(a) }); }
  // your power curve now (the last 12 weeks' best), for intervals set from it
  const bestsIn = (from, to) => { const b = {}; for (const a of acts) if (a.start >= from && a.start < to && a.sport === "ride") for (const [k, v] of Object.entries(a.sum?.curve || {})) if (v > (b[k] || 0)) b[k] = v; return b; };
  const cpw = criticalPower(bestsIn(addDays(today, -84), addDays(today, 1)), ftp), T = targets(cpw, ftp);
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
  let lastHard = -Infinity, poorRun = 0;
  const week = { mon: null, tss: 0, hard: 0, strength: 0, run: false, swim: false, missed: null, moved: false };
  const out = [], thisMon = mondayOf(today), end = addDays(today, 7);
  let now = { ctl: 0, atl: 0 };
  const line = [];   // (fitness, the last four weeks and the week ahead, as planned)
  for (; d <= end; d = addDays(d, 1)) {
    const mon = mondayOf(d);
    if (week.mon !== mon) Object.assign(week, { mon, tss: 0, hard: 0, strength: 0, run: false, swim: false, missed: null, moved: false });
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
      out.push({ ...dec, done: done.length > 0, missed });
    }
    // the day's load: what was done, or (from today on, where nothing's done yet) what's planned
    const real = done.length > 0 || d < today;
    const tss = real ? done.reduce((a, x) => a + (x.sum?.tss || 0), 0) : dec?.tss || 0;
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

  function decide(day) {
    const wk = Math.max(0, Math.round((mondayOf(day) - start) / (7 * DAY))), b = Math.floor(wk / 4), bw = wk % 4, theme = themeOf(b);
    const absorb = bw === 3, hold = P.mode === "hold", dow = (new Date(day).getDay() + 6) % 7, tsb = ctl - atl;
    const f = day <= today ? feelOf(feel[day]) : "good";
    poorRun = f === "poor" ? poorRun + 1 : 0;
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
    // the week's training stress: fitness up a few points in a build week (fewer as it gets higher), level in hold,
    // about 60% in an absorb week
    const ramp = hold ? 0 : Math.max(1.5, 4.5 - ctl / 40);
    const target = absorb ? ctl * 7 * (hold ? 0.8 : 0.6) : (ctl + 6 * ramp) * 7;
    const daysLeft = P.days.slice(dow).filter((x) => x > 0).length || 1, share = Math.max(0, (target - week.tss) / daysLeft);
    const maxHard = absorb ? 1 : hours >= 12 ? 3 : 2, longest = avail === Math.max(...P.days) && avail >= 90;
    const canHard = tsb > -20 && day - lastHard >= 2 * DAY - 3600e3 && week.hard < maxHard && f === "good" && avail >= 50;
    // what's needed most: each kind's days since, against how often this block (and your lean, and your hours) wants it
    const sp = { ...SPACING[theme] };
    if (P.lean === "endurance") { sp.tempo *= 0.7; sp.sweet *= 0.8; sp.vo2 *= 1.4; sp.sprint *= 1.6; }
    if (P.lean === "punch") { sp.vo2 *= 0.75; sp.sprint *= 0.7; sp.tempo *= 1.4; }
    if (hours <= 6) { sp.sweet *= 0.8; sp.tempo *= 0.8; sp.vo2 *= 1.2; } else if (hours >= 9) { sp.sweet *= 1.5; sp.tempo *= 1.6; sp.vo2 *= 0.85; }
    const need = Object.entries(sp).map(([k, s]) => [k, since[k] / s]).sort((p, q) => q[1] - p[1]);
    let kind, why;
    if (f === "poor") { kind = "recovery"; why = "Easy: you're not feeling good this morning"; }
    else if (longest && canHard && theme !== "topend" && !absorb && since.durable >= 13 && avail >= 100) { kind = "durable"; why = "Your long ride, with threshold efforts in its last hour: power that lasts when you're tired"; }
    else if (canHard && need[0][1] >= 1 && !(longest && since.long >= 5)) {
      const k = need[0][0];
      kind = k === "vo2" && (theme === "topend" || since.vo2 >= 10) && avail >= 52 ? "thirty" : k;
      const ago = since[k] > 21 ? "Over three weeks" : `${Math.round(since[k])} days`, block = THEMES[theme].toLowerCase();
      why = `${ago} since your last ${WORDS[k]} session${theme === (k === "vo2" || k === "sprint" ? "topend" : k === "tempo" ? "aerobic" : "threshold") ? `, and you're in ${/^[aeiou]/.test(block) ? "an" : "a"} ${block} block` : ": keeping it sharp"}`;
    } else if (longest) { kind = "long"; why = "Your longest day: the week's long ride"; }
    else if (tsb < -15) { kind = "recovery"; why = `Easy: your form is ${Math.round(tsb)}`; }
    else { kind = "endurance"; why = f === "tired" ? "Steady, not hard: a poor night or heavy legs" : "Aerobic riding between the harder days"; }
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
      id = `rh:${kind}:${mins}`;
    }
    const w = workoutOf(id, T), meas = w ? measure(w, w.sport === "run" ? paces.run : w.sport === "swim" ? paces.swim : 4) : { secs: mins * 60, tss: 0 };
    mins = Math.round(meas.secs / 60);
    const hard = HARD.has(kind);
    if (moved) why = `Rest day moved: you missed ${new Date(week.missed).toLocaleDateString("en-GB", { weekday: "long" })}'s session. ${why}`;
    // (heavy strength on a hard day, twice a week in aerobic and threshold blocks, once in top end, none when absorbing)
    const strength = hard && !absorb && week.strength < (theme === "topend" ? 1 : 2) && !kind.startsWith("swim");
    return { ...base, id, kind, mins, tss: Math.round(meas.tss), hard, why, fuel: w?.sport === "ride" ? fuelFor(mins, hard) : null, strength, moved };
  }

  const at0 = out.find((x) => x.date === today) || null;
  return { days: out, today: at0, block: at0?.block || { index: 0, theme: "aerobic", week: 0, absorb: false }, ctl: now.ctl, atl: now.atl, seeded, line, cpw, targets: T };
}
