// The demo's example data: a rider five weeks into a 16-week plan for a 160 km sportive, with three months of rides
// behind them, all dated from today so it always reads as now. Nothing here is anyone's real ride: the routes are made
// up loops, and the power, heart rate and cadence come from a simple model of a rider on a bike, second by second.
// Imported files take their place as you add them.

import { WORKOUTS, PLANS, layOut, mondayOf, addDays, startOfDay, DAY, flatten, workoutById } from "./workouts.js";
import { defaultName, metresBetween } from "./formats.js";

export const PROFILE = { name: "George", ftp: 265, weight: 72, lthr: 168, maxHr: 189, restHr: 48, runPace: 260, css: 108 };   // (paces in seconds a km, and a 100 m)

// a repeatable random number, from a seed
export function rng(seed) {
  let x = 0;
  for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) | 0;
  return () => { x |= 0; x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const OUTDOOR = ["Chew Valley loop", "Mendips climbs", "Café ride to Wells", "Cotswold edge", "Severn bridges", "Cheddar Gorge", "Somerset levels", "Gordano valley"];

// The plan, the days done and the rides before it: { plan, weeks, history: [{ id, day, sport, workout, name, … }] }
export function demo(now = Date.now()) {
  const today = startOfDay(now), monday = mondayOf(today), start = addDays(monday, -28);
  const plan = PLANS.find((p) => p.id === "sportive"), weeks = layOut(plan, start), r = rng("cadence-demo");
  const history = [];
  const add = (day, w, extra = {}) => {
    const hour = w.sport === "ride" && w.id !== "long-3h" && new Date(day).getDay() % 6 ? 18 : 9;
    const begin = day + hour * 3600e3 + Math.floor(r() * 40) * 60e3;
    const indoor = w.sport === "ride" && !["endurance-90", "long-3h", "recovery-45", "free-ride"].includes(w.id) ? true : extra.indoor ?? false;
    const name = w.sport === "ride" && !indoor ? OUTDOOR[history.length % OUTDOOR.length] : w.sport === "ride" ? w.name : defaultName(w.sport, begin, false);
    history.push({ id: `x${begin}`, day, start: begin, sport: w.sport, workout: w.id, indoor, name, device: w.sport === "run" ? "Garmin Forerunner 265" : indoor ? "Wahoo KICKR" : "Garmin Edge 840", feel: 0.96 + r() * 0.08, ...extra });
  };
  // (the twelve weeks before the plan: three or four rides a week, building)
  for (let d = addDays(start, -84); d < start; d = addDays(d, 1)) {
    const dow = (new Date(d).getDay() + 6) % 7, k = (d - addDays(start, -84)) / DAY;
    if (dow === 5) add(d, workoutById(k > 40 ? "long-3h" : "endurance-90"));
    else if (dow === 1 && r() < 0.8) add(d, workoutById(k > 50 ? "tempo-3x15" : "endurance-90"));
    else if (dow === 3 && r() < 0.7) add(d, workoutById("endurance-90"));
    else if (dow === 6 && r() < 0.5) add(d, workoutById("recovery-45"));
  }
  // (the plan, so far: nearly everything done, a session missed here and there; today's still to do)
  for (const wk of weeks) for (const day of wk.days) {
    if (day.date >= today) continue;
    if (!day.id) continue;
    if (r() < 0.1) continue;
    add(day.date, workoutById(day.id), { planned: day.id });
  }
  return { plan, start, weeks, history };
}

// A sample ride's samples, second by second, made up as a rider would ride it: a workout's power indoors; outdoors, a
// loop with hills, the power rising on the climbs and easing on the descents, speed from the power and the slope.
export function samples(h, profile = PROFILE) {
  const w = workoutById(h.workout) || WORKOUTS[0], r = rng(h.id), ftp = profile.ftp * (h.feel || 1);
  const runSpeed = 1000 / profile.runPace;
  const steps = flatten(w, w.sport === "run" ? runSpeed : w.sport === "swim" ? 100 / profile.css : 4);
  const total = Math.round(steps.reduce((a, s) => a + s.secs, 0));
  const t = [], lat = [], lon = [], ele = [], hr = [], cad = [], pwr = [], spd = [], dist = [];
  // the route: a closed loop, wobbling, about the size the ride needs
  const ctr = [51.33 + r() * 0.12, -2.75 + r() * 0.2], loopKm = w.sport === "run" ? 4 + (total / 3600) * 10 * 0.3 : (total / 3600) * 29;
  let R = loopKm / (2 * Math.PI) / 111; const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const hills = [r() * 6, r() * 6, r() * 6];
  // (the loop's height at an angle round it, and how far round it a step along the road takes you there)
  const height = (th) => 70 + 45 * Math.sin(th * 3 + hills[0]) + 25 * Math.sin(th * 7 + hills[1]) + 10 * Math.sin(th * 13 + hills[2]);
  const at = (th) => { const wob = 1 + 0.25 * Math.sin(th * 2 + ph[0]) + 0.12 * Math.sin(th * 5 + ph[1]); return [ctr[0] + R * wob * Math.sin(th + ph[2]), ctr[1] + (R * wob * Math.cos(th + ph[2])) / Math.cos((ctr[0] * Math.PI) / 180)]; };
  const outdoor = !h.indoor && w.sport !== "swim" && w.sport !== "strength";
  let d = 0, hrNow = profile.restHr + 30, theta = 0, si = 0, inStep = 0, v = 0, here = outdoor ? at(0) : null;
  const th = [];
  for (let i = 0; i <= total; i++) {
    while (si < steps.length - 1 && inStep >= steps[si].secs) { inStep -= steps[si].secs; si++; }
    const st = steps[si], f = st.secs ? Math.min(1, inStep / st.secs) : 0, aim = st.kind === "free" ? 0.68 : st.from + (st.to - st.from) * f;
    inStep++;
    const grade = outdoor && w.sport === "ride" ? Math.max(-0.12, Math.min(0.12, (height(theta + 0.002) - height(theta)) / (0.002 * R * 111000))) : 0;
    let p = 0;
    if (w.sport === "ride") {
      // (outdoors, harder up the hills and easier down them; a few seconds freewheeling now and then)
      p = ftp * aim * (h.indoor ? 1 + (r() - 0.5) * 0.06 : 1 + grade * 4 + (r() - 0.5) * 0.25);
      if (!h.indoor && (grade < -0.035 || r() < 0.02)) p = grade < -0.06 ? 0 : p * 0.3;
      p = Math.max(0, Math.round(p));
      v = speedFor(p, grade, v);
      cad.push(p ? Math.round((st.cad ? (st.cad[0] + st.cad[1]) / 2 : grade > 0.04 ? 78 : 90) + (r() - 0.5) * 6) : 0);
      pwr.push(p);
    } else if (w.sport === "run") {
      v = runSpeed * aim * (1 + (r() - 0.5) * 0.05);
      cad.push(Math.round(84 + aim * 8 + (r() - 0.5) * 3));
    } else if (w.sport === "swim") {
      v = (100 / profile.css) * aim;
    }
    // heart rate follows the effort, a little behind it, and drifts up as the hours go
    const want = profile.restHr + (profile.lthr - profile.restHr) * Math.min(1.12, (w.sport === "ride" ? p / ftp : aim) ** 0.7) + (i / 3600) * 3;
    hrNow += (want - hrNow) / 25;
    hr.push(Math.round(hrNow + (r() - 0.5) * 2));
    t.push(i);
    if (w.sport === "strength") continue;
    spd.push(Math.round(v * 100) / 100); dist.push(Math.round(d * 10) / 10);
    d += v;
    if (!outdoor) continue;
    th.push(theta); ele.push(Math.round((60 + height(theta) - 70) * 10) / 10);
    // (on round the loop by as far as the road went this second)
    const ahead = at(theta + 0.001), per = metres(here, ahead) / 0.001;
    theta += per ? v / per : 0;
    here = at(theta);
  }
  // (the loop drawn to the size the ride went round it, so it ends where it started)
  if (th.length) {
    const k = (2 * Math.PI) / theta;
    R *= theta / (2 * Math.PI);
    for (const x of th) { const p = at(x * k); lat.push(p[0]); lon.push(p[1]); }
    // (and the distance as measured along it, as a device's GPS would have it)
    let m = 0;
    for (let i = 1; i < lat.length; i++) { m += metresBetween(lat[i - 1], lon[i - 1], lat[i], lon[i]); dist[i] = Math.round(m * 10) / 10; }
  }
  return {
    id: h.id, sport: w.sport, indoor: !!h.indoor, start: h.start, name: h.name, device: h.device, file: null, sample: true, workout: w.id,
    s: { t, lat: lat.length ? lat : null, lon: lon.length ? lon : null, ele: ele.length ? ele : null, hr, cad: cad.length ? cad : null, pwr: pwr.length ? pwr : null, spd: spd.length ? spd : null, dist: dist.length ? dist : null },
    laps: lapsFor(steps),
  };
}
// a lap at each step of the workout's intervals, as a device does with them
function lapsFor(steps) {
  const out = [];
  let t = 0;
  for (const s of steps) { out.push({ start: t, secs: s.secs, dist: null }); t += s.secs; }
  return out.length > 60 ? [{ start: 0, secs: t, dist: null }] : out;
}
// the speed a rider of 80 kg with the bike goes at for `p` watts up a slope (rolling resistance, air, gravity), found
// by Newton's method from the last second's speed
function speedFor(p, grade, from = 8) {
  const m = 80, g = 9.81, crr = 0.005, k = 0.5 * 1.2 * 0.36, c = m * g * (crr + grade);
  if (p <= 0) return grade < 0 ? Math.min(16, 9 - grade * 60) : Math.max(0, from - 1);
  // (power less the work of rolling, air and the slope rises steadily past its low point, so starting beyond that, the
  // steps close in on the one speed that balances)
  let v = Math.max(from, Math.sqrt(Math.max(0, -c) / (3 * k)) + 0.5, 2);
  for (let i = 0; i < 8; i++) v -= (c * v + k * v ** 3 - p) / (c + 3 * k * v * v);
  return Math.min(25, Math.max(0.5, v));
}
const metres = ([a1, o1], [a2, o2]) => {
  const dy = (a2 - a1) * 111195, dx = (o2 - o1) * 111195 * Math.cos((a1 * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
};
