// Workouts and plans: what a session is made of, how hard it is, and the weeks they're laid out in.
//
// A workout is steps, each a stretch of time (or distance, for a run or a swim) at an intensity: a share of your
// threshold (FTP for a ride, threshold pace for a run, CSS for a swim), held (`from` alone) or ramped (`from` to
// `to`), with a cadence to hold where it matters. Steps can repeat as a block ({ repeat: 5, steps: [...] }). That's
// all every device and indoor app shares, so it goes out to each of them as itself (formats.js).

export const SPORTS = {
  ride: { name: "Ride", one: "ride", threshold: "FTP" },
  run: { name: "Run", one: "run", threshold: "threshold pace" },
  swim: { name: "Swim", one: "swim", threshold: "CSS" },
  strength: { name: "Strength", one: "session", threshold: null },
};

// Coggan's seven power zones (as shares of FTP), each its colour as Zwift and TrainerRoad have taught everyone to read
// them: grey, blue, green, yellow, orange, red, and purple for a sprint
export const ZONES = [
  { n: 1, name: "Recovery", top: 0.55, c: "z1" },
  { n: 2, name: "Endurance", top: 0.75, c: "z2" },
  { n: 3, name: "Tempo", top: 0.9, c: "z3" },
  { n: 4, name: "Threshold", top: 1.05, c: "z4" },
  { n: 5, name: "VO₂ max", top: 1.2, c: "z5" },
  { n: 6, name: "Anaerobic", top: 1.5, c: "z6" },
  { n: 7, name: "Sprint", top: Infinity, c: "z7" },
];
export const zoneOf = (x) => ZONES.find((z) => x < z.top) || ZONES[6];
// heart rate zones, as shares of threshold heart rate (Friel's five)
export const HR_ZONES = [
  { n: 1, name: "Recovery", top: 0.81 }, { n: 2, name: "Aerobic", top: 0.9 }, { n: 3, name: "Tempo", top: 0.94 },
  { n: 4, name: "Threshold", top: 1.0 }, { n: 5, name: "Max", top: Infinity },
];

// ---- the shape of a workout ----
// every step in order, repeats unrolled: [{ secs, metres, from, to, kind, name, cad, note, rep }]
export function flatten(w, pace = null) {
  const out = [];
  const one = (s, rep) => {
    const secs = s.secs ?? (s.metres && pace ? s.metres / (pace * (s.from + (s.to ?? s.from)) / 2) : 0);
    out.push({ ...s, secs, to: s.to ?? s.from, rep });
  };
  for (const s of w.steps) {
    if (s.repeat) for (let r = 0; r < s.repeat; r++) for (const x of s.steps) one(x, [r + 1, s.repeat]);
    else one(s, null);
  }
  return out;
}
// How long it takes, and how hard: its intensity factor (the fourth-power mean of its intensity, as Normalized Power
// is worked out, near enough for steps) and its training stress (an hour at FTP is 100). A run's distance steps take
// the time they would at their pace (`pace`: threshold speed, metres a second).
export function measure(w, pace = 4) {
  const steps = flatten(w, pace);
  let secs = 0, p4 = 0, p1 = 0;
  for (const s of steps) {
    secs += s.secs;
    // (a ramp's fourth-power mean, through its middle and ends)
    const a = s.kind === "free" ? 0.6 : s.from, b = s.kind === "free" ? 0.6 : s.to, m = (a + b) / 2;
    p4 += s.secs * (a ** 4 + 4 * m ** 4 + b ** 4) / 6;
    p1 += s.secs * m;
  }
  const iF = secs ? (p4 / secs) ** 0.25 : 0;
  return { secs, iF, tss: (secs / 3600) * iF * iF * 100, avg: secs ? p1 / secs : 0, steps };
}
export const totalMetres = (w) => flatten(w).reduce((a, s) => a + (s.metres || 0), 0);

// ---- the library ----
// (sx: a step's helpers: wu(10, .5, .75) is ten minutes warming up from 50% to 75%)
const min = (m) => Math.round(m * 60);
const wu = (m, a = 0.5, b = 0.75) => ({ kind: "warmup", secs: min(m), from: a, to: b, name: "Warm up" });
const cd = (m, a = 0.65, b = 0.45) => ({ kind: "cooldown", secs: min(m), from: a, to: b, name: "Cool down" });
const on = (m, x, name, extra = {}) => ({ kind: "work", secs: min(m), from: x, name, ...extra });
const off = (m, x = 0.5, name = "Easy") => ({ kind: "rest", secs: min(m), from: x, name });
const at = (m, x, name) => ({ kind: "steady", secs: min(m), from: x, name });
const rep = (n, ...steps) => ({ repeat: n, steps });

export const WORKOUTS = [
  // rides
  { id: "endurance-90", sport: "ride", kind: "Endurance", name: "Endurance 90", about: "Steady zone 2, the miles that build your aerobic base. Conversational the whole way.",
    steps: [wu(10, 0.5, 0.65), at(75, 0.68, "Endurance"), cd(5, 0.6, 0.45)] },
  { id: "long-3h", sport: "ride", kind: "Endurance", name: "Long ride 3 h", about: "Your long ride: zone 2 throughout, eat every 45 minutes. Outdoors if the weather's kind.",
    steps: [wu(15, 0.5, 0.65), at(150, 0.67, "Endurance"), cd(15, 0.6, 0.45)] },
  { id: "recovery-45", sport: "ride", kind: "Recovery", name: "Recovery spin", about: "Easy spinning, high cadence, nothing more. The point is to come away fresher than you started.",
    steps: [at(45, 0.48, "Easy spin")] },
  { id: "tempo-3x15", sport: "ride", kind: "Tempo", name: "Tempo 3 × 15", about: "Comfortably hard: steady pressure on the pedals, breathing deep but in control.",
    steps: [wu(10), rep(3, on(15, 0.83, "Tempo"), off(5, 0.55)), cd(10)] },
  { id: "ss-3x12", sport: "ride", kind: "Sweet spot", name: "Sweet spot 3 × 12", about: "Just under threshold: the most fitness for the least fatigue. Stay seated and smooth.",
    steps: [wu(10), rep(3, on(12, 0.9, "Sweet spot"), off(5, 0.55)), cd(8)] },
  { id: "ss-2x20", sport: "ride", kind: "Sweet spot", name: "Sweet spot 2 × 20", about: "Two long blocks at sweet spot. Settle into a rhythm in the first five minutes and hold it.",
    steps: [wu(12), rep(2, on(20, 0.9, "Sweet spot"), off(6, 0.55)), cd(8)] },
  { id: "ftp-2x20", sport: "ride", kind: "Threshold", name: "Threshold 2 × 20", about: "The classic. Twenty minutes at FTP, twice. Hard, but you should finish each one feeling you had a little more.",
    steps: [wu(15), rep(2, on(20, 0.97, "Threshold"), off(8, 0.55)), cd(10)] },
  { id: "over-under", sport: "ride", kind: "Threshold", name: "Over-unders 3 × 9", about: "Two minutes just under FTP, one just over, three times through each block: teaches you to clear the burn and carry on.",
    steps: [wu(12), rep(3, on(2, 0.95, "Under"), on(1, 1.06, "Over"), on(2, 0.95, "Under"), on(1, 1.06, "Over"), on(2, 0.95, "Under"), on(1, 1.06, "Over"), off(5, 0.55)), cd(10)] },
  { id: "hill-6x3", sport: "ride", kind: "Threshold", name: "Hill repeats 6 × 3", about: "Big gear, low cadence, just above threshold: strength for the climbs. Indoors or on a steady hill.",
    steps: [wu(12), rep(6, on(3, 1.03, "Climb", { cad: [60, 70] }), off(3, 0.5, "Roll down")), cd(10)] },
  { id: "vo2-5x4", sport: "ride", kind: "VO₂ max", name: "VO₂ max 5 × 4", about: "Four minutes as hard as you can hold for four minutes, five times. Spin easy between and don't start the next till you're ready.",
    steps: [wu(15), rep(5, on(4, 1.18, "VO₂ max"), off(4, 0.5)), cd(10)] },
  { id: "30-30", sport: "ride", kind: "VO₂ max", name: "30/30s 3 × 10", about: "Thirty seconds hard, thirty easy, ten times; three sets. Time at VO₂ max without the dread of long efforts.",
    steps: [wu(15), rep(3, ...Array.from({ length: 10 }, () => [on(0.5, 1.3, "Hard"), off(0.5, 0.5)]).flat(), off(5, 0.5, "Recover")), cd(10)] },
  { id: "sprints", sport: "ride", kind: "Anaerobic", name: "Sprints 8 × 15 s", about: "All-out sprints from a rolling start, with full recovery. Quality over quantity.",
    steps: [wu(15), rep(8, on(0.25, 2.0, "Sprint", { cad: [100, 120] }), off(4.75, 0.5, "Recover")), cd(10)] },
  { id: "ramp-test", sport: "ride", kind: "Test", name: "Ramp test", about: "A minute at a time, a little harder each minute, until you can't. Your FTP is 75% of your best minute.",
    steps: [wu(5, 0.4, 0.5), ...Array.from({ length: 18 }, (_, i) => on(1, 0.5 + 0.075 * i, `Step ${i + 1}`)), cd(5, 0.5, 0.4)] },
  { id: "ftp-20", sport: "ride", kind: "Test", name: "FTP test (20 min)", about: "Twenty minutes as hard as you can hold, evenly. Your FTP is 95% of the average.",
    steps: [wu(15), on(5, 1.1, "Open up"), off(10, 0.5), { kind: "work", secs: 1200, from: 1.0, name: "All out, evenly", note: "Pace it: the last five minutes should be your hardest" }, cd(10)] },
  { id: "free-ride", sport: "ride", kind: "Endurance", name: "Ride how you like", about: "No targets. Ride with friends, ride to the café; it all counts.",
    steps: [{ kind: "free", secs: min(120), from: 0.65, name: "Free ride" }] },
  // runs (intensity as a share of threshold pace: 0.8 is a fifth slower)
  { id: "run-easy-40", sport: "run", kind: "Endurance", name: "Easy run 40", about: "Easy enough to chat. Most of your running should feel like this.",
    steps: [at(40, 0.78, "Easy")] },
  { id: "run-tempo", sport: "run", kind: "Threshold", name: "Tempo run 20", about: "Twenty minutes at threshold pace: about the pace you could race for an hour.",
    steps: [at(12, 0.78, "Warm up"), on(20, 0.98, "Tempo"), at(10, 0.75, "Cool down")] },
  { id: "run-800s", sport: "run", kind: "VO₂ max", name: "6 × 800 m", about: "At 5k pace, with 400 m jogs between. Even splits beat a fast first one.",
    steps: [{ kind: "warmup", metres: 2000, from: 0.78, name: "Warm up" }, rep(6, { kind: "work", metres: 800, from: 1.06, name: "5k pace" }, { kind: "rest", metres: 400, from: 0.7, name: "Jog" }), { kind: "cooldown", metres: 1500, from: 0.75, name: "Cool down" }] },
  { id: "run-long", sport: "run", kind: "Endurance", name: "Long run 75", about: "Slow and steady; time on your feet.",
    steps: [at(75, 0.76, "Long and easy")] },
  // swims (as a share of CSS, your critical swim speed)
  { id: "swim-css", sport: "swim", kind: "Threshold", name: "CSS 10 × 100", about: "Ten 100s at your CSS pace with 15 seconds' rest: the session that moves your threshold.",
    steps: [{ kind: "warmup", metres: 400, from: 0.8, name: "Warm up, mixed" }, rep(10, { kind: "work", metres: 100, from: 1.0, name: "CSS pace" }, { kind: "rest", secs: 15, from: 0, name: "Rest at the wall" }), { kind: "cooldown", metres: 200, from: 0.75, name: "Easy" }] },
  { id: "swim-endurance", sport: "swim", kind: "Endurance", name: "Endurance 2 km", about: "Long, smooth swimming at a steady pace, with a little rest between blocks.",
    steps: [{ kind: "warmup", metres: 300, from: 0.8, name: "Warm up" }, rep(3, { kind: "steady", metres: 400, from: 0.88, name: "Steady" }, { kind: "rest", secs: 30, from: 0, name: "Rest" }), { kind: "cooldown", metres: 200, from: 0.75, name: "Easy" }] },
  // strength (no intensity: the steps say what to do)
  { id: "core-25", sport: "strength", kind: "Strength", name: "Core for cyclists", about: "Twenty minutes for the muscles that hold you steady on the bike. Three rounds.",
    steps: [at(4, 0.4, "Mobility"), rep(3, at(0.75, 0.6, "Plank"), at(0.75, 0.6, "Glute bridge"), at(0.75, 0.6, "Dead bug"), at(0.75, 0.6, "Side plank"), at(0.75, 0.6, "Bird dog"), at(1, 0.3, "Rest")), at(3, 0.3, "Stretch")] },
];
export const workoutById = (id) => WORKOUTS.find((w) => w.id === id);

// ---- plans ----
// A plan is weeks, each with a workout (or a rest) for each day, Monday first, in phases: base (the miles), build (the
// harder work), peak (race-like) and taper (fresh for the day). Every fourth week is easier, as legs need.
const WEEKS = {
  base: ["rest", "tempo-3x15", "endurance-90", "ss-3x12", "recovery-45", "long-3h", "endurance-90"],
  base2: ["rest", "ss-2x20", "endurance-90", "over-under", "recovery-45", "long-3h", "run-easy-40"],
  build: ["rest", "vo2-5x4", "endurance-90", "ftp-2x20", "recovery-45", "long-3h", "hill-6x3"],
  peak: ["rest", "30-30", "endurance-90", "over-under", "rest", "long-3h", "sprints"],
  easy: ["rest", "recovery-45", "endurance-90", "core-25", "rest", "endurance-90", "recovery-45"],
  taper: ["rest", "ss-3x12", "recovery-45", "sprints", "rest", "recovery-45", "event"],
  test: ["rest", "recovery-45", "endurance-90", "ramp-test", "rest", "endurance-90", "recovery-45"],
};
// (a run plan's weeks, and a triathlon's, as the ride plan's are: by phase, every fourth week easier)
const RUN_WEEKS = {
  base: ["rest", "run-easy-40", "endurance-90", "run-easy-40", "rest", "run-long", "recovery-45"],
  build: ["rest", "run-800s", "endurance-90", "run-tempo", "rest", "run-long", "recovery-45"],
  easy: ["rest", "run-easy-40", "recovery-45", "core-25", "rest", "run-easy-40", "rest"],
  taper: ["rest", "run-easy-40", "recovery-45", "run-tempo", "rest", "run-easy-40", "event"],
};
const TRI_WEEKS = {
  base: ["swim-endurance", "run-easy-40", "endurance-90", "swim-css", "rest", "long-3h", "run-long"],
  build: ["swim-css", "run-800s", "ss-3x12", "swim-endurance", "rest", "long-3h", "run-tempo"],
  easy: ["swim-endurance", "run-easy-40", "recovery-45", "core-25", "rest", "endurance-90", "rest"],
  taper: ["swim-css", "run-easy-40", "recovery-45", "swim-endurance", "rest", "recovery-45", "event"],
};
export const PLANS = [
  { id: "sportive", sport: "ride", name: "Sportive 160 km", weeks: 16, about: "From base miles to a 160 km sportive, four phases, five or six rides a week, 6 to 10 hours.",
    phases: [["Base", 6], ["Build", 6], ["Peak", 2], ["Taper", 2]] },
  { id: "ftp", sport: "ride", name: "FTP builder", weeks: 6, about: "Six weeks of sweet spot and threshold to lift your FTP, with a test at each end.",
    phases: [["Build", 6]] },
  { id: "base", sport: "ride", name: "Winter base", weeks: 8, about: "Eight weeks of steady miles and a little tempo, for a strong spring.", phases: [["Base", 8]] },
  { id: "10k", sport: "run", name: "First 10k", weeks: 8, about: "Three runs a week, up to a 10k, alongside your riding.", phases: [["Base", 4], ["Build", 3], ["Taper", 1]] },
  { id: "tri", sport: "multi", name: "Sprint triathlon", weeks: 12, about: "Swim, bike and run, nine sessions a week at most, for your first sprint triathlon.", phases: [["Base", 5], ["Build", 5], ["Taper", 2]] },
];
// The plan as dated days, from its first Monday: [{ week, phase, days: [{ date, id }] }]
export function layOut(plan, monday) {
  const out = [];
  let w = 0;
  for (const [phase, n] of plan.phases) {
    for (let i = 0; i < n; i++, w++) {
      const recovery = phase !== "Taper" && i % 4 === 3;
      const kind = recovery ? (w === plan.weeks - 3 ? "test" : "easy") : phase === "Base" ? (i < 3 ? "base" : "base2") : phase === "Build" ? "build" : phase === "Peak" ? "peak" : "taper";
      const set = plan.sport === "run" ? RUN_WEEKS : plan.sport === "multi" ? TRI_WEEKS : WEEKS;
      const pick = (k) => set[k] || set[{ base2: "base", peak: "build", test: "easy" }[k]] || WEEKS[k];
      const pattern = phase === "Taper" && w < plan.weeks - 1 ? pick("easy") : pick(kind);
      out.push({ week: w + 1, phase, recovery, days: pattern.map((id, d) => ({ date: addDays(monday, w * 7 + d), id: id === "rest" ? null : id })) });
    }
  }
  return out;
}

// ---- dates (days as local midnight, in ms) ----
export const DAY = 86400000;
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
export const mondayOf = (t) => { const d = new Date(startOfDay(t)); return addDays(d.getTime(), -((d.getDay() + 6) % 7)); };
