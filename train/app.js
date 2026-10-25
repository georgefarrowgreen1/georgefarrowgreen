// Cadence: training for riding first, and running, swimming and strength alongside. Four screens on a tab bar:
//
// - Today: today's session (or rest), the best time for it from Weather, your fitness, fatigue and form, the week so
//   far, and how you feel (which can swap a hard day for an easy one).
// - Plan: the plan you're on, its phases and weeks, this week's days and next; another plan from the library.
// - Workouts: the library by sport and kind, your own (built here, or imported), each to read, ride and send.
// - Activities: every ride, run and swim, from the files your devices record, each with its route, figures, charts,
//   zones and best efforts, and out again as FIT, GPX or TCX.
//
// Files come in from anywhere on the page (Import, or dropped on it): FIT from a Garmin or a Wahoo, GPX, TCX, ZWO, ERG,
// MRC, or a zip of them. Workouts go out as each device and app takes them (formats.js). Everything's read and made on
// this device; in the demo, nothing's sent anywhere. (Signed in with the site's account, your rides would be kept with it:
// the proposal's next step.)

import { h, icon, sportIcon, U, dur, hm, clock, stepLen, dist, distNum, height, speed, pace, paceOf, weight, dayLong, dayShort, dayName, dayLetter, dateShort, timeOf, plural, pct } from "./ui.js";
import { WORKOUTS, PLANS, SPORTS, ZONES, HR_ZONES, zoneOf, flatten, measure, layOut, workoutById, DAY, startOfDay, addDays, mondayOf } from "./workouts.js";
import { summarise, fitness, formSaid, perSecond } from "./load.js";
import { demo, samples, PROFILE, rng } from "./sample.js";
import * as F from "./formats.js";
import * as C from "./charts.js";

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main"), sheetEl = $("#sheet"), toastEl = $("#toast"), tabsEl = $("#tabs"), dropEl = $("#drop"), filesEl = $("#files");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// ---- kept in this browser ----
const store = {
  get(k, d) { try { const v = localStorage.getItem("cadence:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("cadence:" + k, JSON.stringify(v)); } catch (_) {} },
};
// rides you've imported, whole, in IndexedDB (they're too big for anywhere else); in memory alone where it can't be had
const idb = (() => {
  let p = null;
  const open = () => (p ||= new Promise((res, rej) => {
    const r = indexedDB.open("cadence", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("acts", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction("acts", mode), q = fn(t.objectStore("acts")); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); });
  };
  return { all: () => run("readonly", (s) => s.getAll()), put: (a) => run("readwrite", (s) => s.put(a)), del: (id) => run("readwrite", (s) => s.delete(id)) };
})();

const TODAY = startOfDay(Date.now());
const D = demo(Date.now());
const S = {
  tab: "today",
  profile: { ...PROFILE, ...store.get("profile", {}) },
  planId: store.get("plan", "sportive"), planStart: store.get("planStart", D.start),
  swaps: store.get("swaps", {}), feel: store.get("feel", {}), mine: store.get("workouts", []),
  sport: "ride", actSport: "all", formDays: 42,
  acts: D.history.map((x) => ({ ...x, sample: true })).sort((a, b) => b.start - a.start),
  sums: new Map(), summed: false,
};
U.metric = store.get("units", "metric") === "metric";
const P = () => S.profile;
const signed = (v) => (Math.round(v) > 0 ? "+" : Math.round(v) < 0 ? "−" : "") + Math.abs(Math.round(v));
const runSpeed = () => 1000 / P().runPace, swimSpeed = () => 100 / P().css;
const paceFor = (sport) => (sport === "run" ? runSpeed() : sport === "swim" ? swimSpeed() : 4);
const allWorkouts = () => [...S.mine, ...WORKOUTS];
const wkById = (id) => S.mine.find((w) => w.id === id) || workoutById(id);

// ---- the plan, as days ----
const plan = () => PLANS.find((p) => p.id === S.planId) || PLANS[0];
let weeksCache = null;
function weeks() {
  const key = S.planId + S.planStart;
  if (weeksCache?.key !== key) weeksCache = { key, v: layOut(plan(), S.planStart) };
  return weeksCache.v;
}
// what's planned on a day (a swap you've made, or the plan's): a workout id, "event", or null for rest
function plannedOn(day) {
  if (S.swaps[day] !== undefined) return S.swaps[day];
  for (const w of weeks()) for (const d of w.days) if (d.date === day) return d.id;
  return undefined;
}
const weekIndex = (day) => Math.floor((mondayOf(day) - mondayOf(S.planStart)) / (7 * DAY) + 0.01);
const actsOn = (day) => S.acts.filter((a) => startOfDay(a.start) === day);
const eventDay = () => weeks().at(-1).days.at(-1).date;

// ---- each ride's figures: worked out a few at a time once the page is up, newest first, and kept for next time ----
const sumKey = () => `${P().ftp}/${P().lthr}`;
const sumOf = (a) => S.sums.get(a.id);
// a ride's samples (a sample ride's made up afresh each time it's needed; the last few kept)
const full = (() => {
  const keep = new Map();
  return (a) => {
    if (!a.sample) return a.data;
    if (keep.has(a.id)) return keep.get(a.id);
    const x = samples(a, P());
    keep.set(a.id, x); if (keep.size > 4) keep.delete(keep.keys().next().value);
    return x;
  };
})();
function sumUp() {
  const cached = store.get("sums", null);
  if (cached?.key === sumKey() + "@" + TODAY) for (const [id, s] of Object.entries(cached.v)) S.sums.set(id, s);
  const todo = S.acts.filter((a) => !S.sums.has(a.id));
  S.summed = !todo.length;
  if (S.summed) return;
  let i = 0;
  const step = () => {
    const until = performance.now() + 40;
    while (i < todo.length && performance.now() < until) { const a = todo[i++]; S.sums.set(a.id, summarise(full(a), P())); }
    if (i < todo.length) return setTimeout(step, 0);
    S.summed = true;
    store.set("sums", { key: sumKey() + "@" + TODAY, v: Object.fromEntries([...S.sums].filter(([id]) => id.startsWith("x"))) });
    redraw();
  };
  setTimeout(step, 30);
}
function resum() { S.sums.clear(); store.set("sums", null); sumUp(); }

// fitness, day by day, from every ride's stress
function fitnessSeries() {
  const daily = {};
  for (const a of S.acts) { const s = sumOf(a); if (s?.tss) daily[startOfDay(a.start)] = (daily[startOfDay(a.start)] || 0) + s.tss; }
  const first = Math.min(...S.acts.map((a) => a.start), TODAY - 120 * DAY);
  return fitness(daily, first, TODAY);
}

// ---- the page ----
const TABS = [["today", "Today", "today"], ["plan", "Plan", "plan"], ["workouts", "Workouts", "bolt"], ["activities", "Activities", "list"]];
function drawTabs() {
  tabsEl.replaceChildren(...TABS.map(([id, name, ic], i) => h("button.tab", { type: "button", "aria-current": S.tab === id ? "page" : null, onclick: () => go(id) }, icon(ic, 24, 1.9), name)));
  tabsEl.style.setProperty("--tab", TABS.findIndex(([id]) => id === S.tab));
}
function go(tab) {
  if (tab === S.tab) return scrollTo({ top: 0, behavior: still.matches ? "auto" : "smooth" });
  S.tab = tab;
  tabsEl.classList.remove("moving"); void tabsEl.offsetWidth; tabsEl.classList.add("moving");
  drawTabs();
  render(true);
  scrollTo(0, 0);
  try { history.replaceState(null, "", "#" + tab); } catch (_) {}
}
function render(fresh = false) {
  const views = { today: todayView, plan: planView, workouts: workoutsView, activities: activitiesView };
  const screen = h("div.screen" + (fresh ? ".in" : ""), {}, views[S.tab]());
  main.replaceChildren(screen);
  main.removeAttribute("aria-busy");
  document.title = { today: "Cadence", plan: "Plan · Cadence", workouts: "Workouts · Cadence", activities: "Activities · Cadence" }[S.tab];
}
// drawn again in place (what changed behind the scenes), keeping where you'd scrolled to; a sheet that's up stays as it
// is unless it's asked for too (what's in it is drawn afresh, charts and all)
function redraw(sheetToo = false) { const y = scrollY; render(false); scrollTo(0, y); if (sheetToo && sheetEl.open && Sheet.redraw) Sheet.redraw(); }
const head = (title, sub, ...right) => h("div.head", {}, h("div.t", {}, h("h1", { text: title }), sub && h("div.sub", { text: sub })), ...right,
  h("button.round.me", { type: "button", "aria-label": "You and settings", onclick: () => openSheet(settingsView) }, (P().name || "Y").slice(0, 1).toUpperCase()));
const section = (title, ...kids) => h("section.section", {}, title && h("h3", {}, title), ...kids);
const card = (cls, title, ...kids) => h("div.card.glass" + (cls ? "." + cls : ""), {}, title && h("h3", {}, ...[].concat(title)), ...kids);
function row({ icon: ic, tint, tile, title, sub, value, onclick, chev = true, cls = "", extra = null, href = null }) {
  const tag = href ? "a.row" : onclick ? "button.row" : "div.row";
  return h(tag + (cls ? "." + cls : ""), { type: onclick && !href ? "button" : null, onclick, href, target: href ? "_blank" : null, rel: href ? "noopener" : null },
    tile || (ic && h("span.ic." + (tint || "grey"), {}, icon(ic, 18, 2.1))),
    h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })),
    extra, value != null && h("span.val", {}, ...[].concat(value)), (onclick || href) && chev && h("span.chev", {}, icon(href ? "open" : "chev", 17, 2.4)));
}
const sportTile = (sport, small = false) => h("span.tile.s-" + sport + (small ? ".small" : ""), {}, sportIcon(sport, small ? 17 : 20));
const stat = (label, v, unit) => h("div.stat", {}, h("small", { text: label }), h("b", {}, v ?? "–", unit && v != null ? h("u", { text: unit }) : null));
const wait = (hgt) => h("div.wait", { vars: { "min-height": hgt + "px" } });
// how wide a chart is drawn, in a card on the page or in a sheet (so its labels come out at their own size)
const cardW = (hero = false) => Math.round((innerWidth >= 1000 ? 500 : Math.min(innerWidth, 680) - 32) - (hero ? 40 : 36));
const sheetW = () => Math.round(Math.min(innerWidth - 16, 600) - 32 - 36);

// ---- Today ----
function todayView() {
  const id = plannedOn(TODAY), done = actsOn(TODAY), w = id && id !== "event" ? wkById(id) : null;
  const out = [head("Today", dayLong(TODAY))];
  if (!store.get("noted", false)) {
    out.push(h("div.note.glass", {}, h("span.ic", {}, icon("sparkle", 16, 2.2)), h("div", {},
      h("b", { text: "A demo, with made-up rides. " }), "Everything here is example data for a rider five weeks into a sportive plan. Import your own files from a Garmin or a Wahoo and they'll appear alongside.",
      h("div.gos", {}, h("button.go", { type: "button", onclick: chooseFiles }, "Import files"), h("button.go", { type: "button", onclick: () => { store.set("noted", true); redraw(); } }, "Hide this")))));
  }
  const left = [], right = [];
  left.push(sessionCard(w, id, done));
  if (w && (w.sport === "ride" || w.sport === "run") && !done.length) left.push(weatherCard(w));
  right.push(formCard());
  right.push(weekCard());
  left.push(feelCard(w));
  const recent = S.acts.slice(0, 3);
  right.push(section("Recent", h("div.group.glass", {}, recent.map(actRow)), h("p.foot", {}, h("button.link", { type: "button", onclick: () => go("activities") }, "All activities"))));
  out.push(h("div.cols", {}, h("div", {}, left), h("div", {}, right)));
  return out;
}
function sessionCard(w, id, done) {
  if (done.length) {
    const a = done[0], s = sumOf(a);
    return h("button.card.hero.glass.session.done", { type: "button", onclick: () => openAct(a) },
      h("span.sport", {}, h("i.s-" + a.sport, {}, sportIcon(a.sport, 14)), "Done today"),
      h("h2", {}, h("span.tick-badge", {}, icon("check", 16, 3)), a.name),
      h("div.meta", { text: s ? [dur(s.moving), s.dist ? dist(s.dist) : null, s.tss != null ? `TSS ${s.tss}` : null].filter(Boolean).join(" · ") : "…" }));
  }
  if (id === "event") {
    return h("div.card.hero.glass.session", {}, h("span.sport", {}, h("i.s-ride", {}, sportIcon("ride", 14)), "Event day"),
      h("h2", { text: plan().name }), h("p.about", { text: "This is what the weeks were for. Start steady, eat early, and enjoy it." }));
  }
  if (!w && TODAY < S.planStart) {
    const first = weeks()[0].days.find((d) => d.id), fw = first && wkById(first.id);
    return h("div.card.hero.glass.session.rest", {}, h("span.sport", {}, h("i.s-ride", {}, icon("calendar", 14, 2.2)), "New plan"),
      h("h2", { text: `${plan().name} starts ${dayName(S.planStart)}` }),
      h("p.about", { text: "Until then, ride as you like: easy miles are never wasted." }),
      fw && h("div.acts", {}, h("button.pill", { type: "button", onclick: () => openWorkout(fw) }, `${dayName(first.date)}: ${fw.name}`, icon("chev", 15, 2.4))));
  }
  if (!w) {
    const next = [1, 2, 3].map((n) => addDays(TODAY, n)).find((d) => plannedOn(d));
    const nw = next && plannedOn(next) !== "event" ? wkById(plannedOn(next)) : null;
    return h("div.card.hero.glass.session.rest", {}, h("span.sport", {}, h("i.s-walk", {}, icon("heart", 14, 2.2)), "Rest day"),
      h("h2", { text: "Rest, and let it sink in" }),
      h("p.about", { text: "Fitness is built while you recover. A walk is fine; anything harder can wait." }),
      nw && h("div.acts", {}, h("button.pill", { type: "button", onclick: () => openWorkout(nw) }, `${dayName(next)}: ${nw.name}`, icon("chev", 15, 2.4))));
  }
  const m = measure(w, paceFor(w.sport)), swapped = S.swaps[TODAY] !== undefined;
  return h("div.card.hero.glass.session", {},
    h("span.sport", {}, h("i.s-" + w.sport, {}, sportIcon(w.sport, 14)), `${SPORTS[w.sport].name} · ${w.kind}${swapped ? " · swapped" : ""}`),
    h("h2", { text: w.name }),
    h("div.meta", { text: [dur(m.secs), w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null, w.sport === "ride" ? `IF ${m.iF.toFixed(2)}` : null].filter(Boolean).join(" · ") }),
    h("div.profile", {}, C.profile(w, { ftp: w.sport === "ride" ? P().ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: cardW(true) })),
    h("p.about", { text: w.about }),
    h("div.acts", {},
      w.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => openSheet(() => sendView(w)) }, icon("upload", 17, 2.2), "Send to device"),
      h("button.pill", { type: "button", onclick: () => openWorkout(w) }, "Details"),
      swapped && h("button.pill", { type: "button", onclick: () => { delete S.swaps[TODAY]; store.set("swaps", S.swaps); redraw(); } }, "Undo swap")));
}
// The best time for it today, as Weather would say it (its Best times, for a ride as long as this one). In the demo, a
// made-up day; signed in, Weather's own forecast for your place.
function weatherCard(w) {
  const r = rng("wx" + TODAY), m = measure(w, paceFor(w.sport)), hrs = Math.max(1, Math.ceil(m.secs / 3600));
  const from = 9 + Math.floor(r() * 3), to = Math.min(17, from + hrs + 1 + Math.floor(r() * 2)), temp = 9 + Math.floor(r() * 7), wind = 8 + Math.floor(r() * 14);
  const dir = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.floor(r() * 8)];
  return h("div.card.glass", {}, h("h3", {}, "Best time to " + (w.sport === "run" ? "run" : "ride")),
    h("div.wx", {}, h("span.wxi", {}, C.weatherIcon()), h("div", {}, h("b", { text: `${String(from).padStart(2, "0")}:00 to ${String(to).padStart(2, "0")}:00, dry` }),
      h("span", { text: `${temp}° and sunny spells, wind ${wind} km/h from the ${dir}${w.sport === "ride" ? `: head out into it, home with it behind you` : ""}.` }))),
    h("p.line-said", { text: "From Weather’s Best times, for your place. (In the demo, an example day.)" }));
}
function formCard() {
  if (!S.summed) return card(null, "Fitness and form", wait(44), h("div", { vars: { height: "10px" } }), wait(120));
  const f = fitnessSeries(), last = f.at(-1), said = formSaid(last.tsb), wk = f.at(-8);
  return h("button.card.glass", { type: "button", onclick: () => openSheet(formView), "aria-label": `Fitness ${Math.round(last.ctl)}, fatigue ${Math.round(last.atl)}, form ${Math.round(last.tsb)}: ${said.word}` },
    h("h3", {}, "Fitness and form"),
    h("div.figs", {},
      h("div.fig", {}, h("small", {}, h("i.dot-fit"), "Fitness"), h("b", { text: Math.round(last.ctl) }), h("span.word.tone-neutral", { text: `${last.ctl >= wk.ctl ? "+" : "−"}${Math.abs(Math.round(last.ctl - wk.ctl))} this week` })),
      h("div.fig", {}, h("small", {}, h("i.dot-fat"), "Fatigue"), h("b", { text: Math.round(last.atl) })),
      h("div.fig", {}, h("small", {}, h("i.dot-form"), "Form"), h("b", { text: signed(last.tsb) }), h("span.word.tone-" + said.tone, { text: said.word }))),
    C.fitnessChart(f, { days: 42, W: cardW() }), h("p.line-said", { text: said.line }));
}
function weekCard() {
  const mon = mondayOf(TODAY), days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mon, i));
  const planTss = (d) => { const id = plannedOn(d); const w = id && id !== "event" ? wkById(id) : null; return w ? measure(w, paceFor(w.sport)).tss : 0; };
  const doneTss = (d) => actsOn(d).reduce((a, x) => a + (sumOf(x)?.tss || 0), 0);
  const planSecs = (d) => { const id = plannedOn(d); const w = id && id !== "event" ? wkById(id) : null; return w ? measure(w, paceFor(w.sport)).secs : 0; };
  const doneSecs = (d) => actsOn(d).reduce((a, x) => a + (sumOf(x)?.moving || 0), 0);
  const max = Math.max(60, ...days.map((d) => Math.max(planTss(d), doneTss(d))));
  const totPlan = days.reduce((a, d) => a + planTss(d), 0), totDone = days.reduce((a, d) => a + doneTss(d), 0);
  const secsPlan = days.reduce((a, d) => a + planSecs(d), 0), secsDone = days.reduce((a, d) => a + doneSecs(d), 0);
  const cols = days.map((d) => {
    const pt = planTss(d), dt = doneTss(d), did = actsOn(d).length, past = d < TODAY, id = plannedOn(d);
    const bar = h("span.bar", {}, pt ? h("i.plan", { vars: { height: (pt / max) * 100 + "%" } }) : null, dt ? h("i.done" + (dt >= pt ? ".over" : ""), { vars: { height: (Math.min(dt, max) / max) * 100 + "%" } }) : null);
    const said = `${dayName(d)}: ${id === "event" ? "event" : id ? wkById(id)?.name : "rest"}${did ? ", done" : past && id ? ", missed" : ""}`;
    return h("button.wday" + (d === TODAY ? ".today" : ""), { type: "button", "aria-label": said, onclick: () => openDay(d) }, h("span.mark", {}, did ? icon("check", 14, 3) : id ? h("i.o") : null), bar, h("span.d", { text: dayLetter(d) }));
  });
  return card(null, ["This week", h("span.more", { text: S.summed ? `${Math.round(totDone)} of ${Math.round(totPlan)} TSS` : "" })],
    h("div.week", {}, cols),
    h("div.week-sum", {}, h("span", {}, h("b", { text: dur(secsDone) }), ` of ${dur(secsPlan)}`),
      h("span", { text: TODAY < S.planStart ? `Starts ${dayShort(S.planStart)}` : weekIndex(TODAY) >= weeks().length ? "Plan done" : `Week ${weekIndex(TODAY) + 1} of ${plan().weeks} · ${weeks()[weekIndex(TODAY)].phase}` })));
}
// How you feel: sleep, legs and mood, said in a tap each, and what to do about it with your form. Tired legs on a hard
// day: an easier session, swapped in with a tap (and back again).
function feelCard(w) {
  const f = S.feel[TODAY] || {}, set = (k, v) => { S.feel[TODAY] = { ...f, [k]: v }; store.set("feel", S.feel); redraw(); };
  const seg = (k, opts) => {
    const at = opts.findIndex(([v]) => v === f[k]);
    return h("div.seg.small" + (at < 0 ? ".none" : ""), { vars: { "--n": opts.length, "--at": Math.max(0, at) }, role: "group", "aria-label": k },
      opts.map(([v, label]) => h("button", { type: "button", "aria-pressed": String(f[k] === v), onclick: () => set(k, v) }, label)));
  };
  const rows = [["sleep", "Sleep", [[0, "Poor"], [1, "OK"], [2, "Good"]]], ["legs", "Legs", [[0, "Heavy"], [1, "Normal"], [2, "Fresh"]]], ["mood", "Motivation", [[0, "Low"], [1, "OK"], [2, "High"]]]];
  let verdict = null;
  if (["sleep", "legs", "mood"].every((k) => f[k] != null)) {
    const score = f.sleep + f.legs + f.mood, tsb = S.summed ? fitnessSeries().at(-1).tsb : 0, hard = w && measure(w).iF > 0.8;
    if (score <= 2 || (f.legs === 0 && tsb < -20)) {
      verdict = h("div.verdict", {}, h("span.ic.amber", {}, icon("swap", 16, 2.2)), h("div", {}, h("b", { text: hard ? "Swap today for something easy" : "Take it easy today" }),
        h("p", { text: hard ? `Tired legs and form of ${Math.round(tsb)}: ${w.name} would cost more than it gives. An easy spin keeps the legs turning.` : "Keep it short and easy, or rest. Tomorrow will go better for it." }),
        hard && h("button.pill.small", { type: "button", onclick: () => { S.swaps[TODAY] = "recovery-45"; store.set("swaps", S.swaps); toast("Swapped for a recovery spin"); redraw(); } }, "Swap for a recovery spin")));
    } else verdict = h("div.verdict", {}, h("span.ic.green", {}, icon("check", 16, 2.6)), h("div", {}, h("b", { text: score >= 5 ? "Ready for it" : "Good to go" }),
      h("p", { text: w ? `Ride ${w.name.toLowerCase().startsWith("rest") ? "as planned" : `${w.name} as planned`}.` : "Enjoy the rest day." })));
  }
  return card(null, "How do you feel?", h("div.feel", {}, rows.map(([k, label, opts]) => h("div.feel-row", {}, h("span", { text: label }), seg(k, opts))), verdict));
}

// ---- Plan ----
function planView() {
  const p = plan(), ws = weeks(), now = Math.max(0, Math.min(ws.length - 1, weekIndex(TODAY))), ev = eventDay(), left = Math.round((ev - TODAY) / DAY);
  const planWeekTss = ws.map((w) => ({ phase: w.phase, tss: w.days.reduce((a, d) => a + (d.id && d.id !== "event" ? measure(wkById(d.id), paceFor(wkById(d.id).sport)).tss : 0), 0) }));
  const doneWeek = ws.map((w) => w.days.reduce((a, d) => a + actsOn(d.date).reduce((x, act) => x + (sumOf(act)?.tss || 0), 0), 0));
  const phaseCls = { Base: "z2", Build: "z4", Peak: "z5", Taper: "z3" };
  const out = [head("Plan", TODAY < S.planStart ? `${p.name} · starts ${dayShort(S.planStart)}` : `${p.name} · week ${now + 1} of ${p.weeks}`)];
  out.push(h("div.card.hero.glass", {},
    h("h3", {}, "Your goal"),
    h("div.countdown", {}, h("b", { text: left > 0 ? left : "Today" }), h("span", { text: left > 0 ? `days to ${p.name.toLowerCase().includes("sportive") ? "your sportive" : "the end"}, ${dayShort(ev)}` : "" })),
    h("div.phases", {}, p.phases.map(([name, n]) => h("i.bg-" + phaseCls[name], { vars: { flex: n } }))),
    h("div.phase-names", {}, p.phases.map(([name, n]) => h("span" + (ws[now].phase === name ? ".now" : ""), { vars: { flex: n }, text: name }))),
    h("div", { vars: { "margin-top": "16px" } }, C.planWeeks(planWeekTss, doneWeek, now, cardW(true))),
    h("p.line-said", { text: `${p.about} Week ${now + 1} is ${ws[now].recovery ? "an easier week, to recover" : ws[now].phase.toLowerCase()}.` })));
  const dayRows = (w) => w.days.map((d) => {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, wk = id && id !== "event" ? wkById(id) : null, did = actsOn(d.date), past = d.date < TODAY;
    const m = wk ? measure(wk, paceFor(wk.sport)) : null;
    return h("button.row" + (d.date === TODAY ? ".today" : "") + (past ? ".past" : ""), { type: "button", onclick: () => openDay(d.date) },
      h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: d.date === TODAY ? "Today" : dayName(d.date).slice(0, 3) })),
      h("span.tx", {}, h("b", { text: id === "event" ? "Event day" : wk ? wk.name : "Rest" }), h("small", { text: wk ? `${dur(m.secs)}${wk.sport !== "strength" ? ` · TSS ${Math.round(m.tss)}` : ""}${S.swaps[d.date] !== undefined ? " · swapped" : ""}` : id === "event" ? p.name : "Recover" })),
      wk && h("span.mini", {}, C.profile(wk, { mini: true, pace: paceFor(wk.sport) })),
      did.length ? h("span.badge", {}, "Done") : past && wk ? h("span.badge.plan", {}, "Missed") : null);
  });
  const started = TODAY >= S.planStart, wkName = (i) => (started ? (i === now ? "This week" : "Next week") : `Week ${i + 1}`);
  out.push(section([`${wkName(now)} · ${ws[now].phase}${ws[now].recovery ? " (easier)" : ""}`, h("span.aside", { text: `${dateShort(ws[now].days[0].date)} – ${dateShort(ws[now].days[6].date)}` })],
    h("div.group.glass", {}, dayRows(ws[now])),
    h("p.foot", {}, "Tap a day for its workout. Workouts go to your Garmin or Wahoo from there, or all of this week's at once below.")));
  if (ws[now + 1]) out.push(section([`${wkName(now + 1)} · ${ws[now + 1].phase}${ws[now + 1].recovery ? " (easier)" : ""}`, h("span.aside", { text: `${dateShort(ws[now + 1].days[0].date)} – ${dateShort(ws[now + 1].days[6].date)}` })], h("div.group.glass", {}, dayRows(ws[now + 1]))));
  out.push(section("This week’s files", h("div.group.glass", {},
    row({ icon: "zip", tint: "coral", title: started ? "Send this week’s workouts" : "Send week 1’s workouts", sub: "One zip: a FIT file for each, for your Garmin or Wahoo", onclick: () => weekZip(ws[now]) }),
    row({ icon: "calendar", tint: "red", title: "Add to your calendar", sub: "This week and next as events (.ics), with each workout in its notes", onclick: () => calendar([ws[now], ws[now + 1]].filter(Boolean)) }))));
  out.push(section("Plans", h("div.group.glass", {}, PLANS.map((x) => row({ icon: x.sport === "run" ? "run" : x.sport === "multi" ? "swim" : "ride", tint: x.id === S.planId ? "coral" : "grey", title: x.name, sub: `${x.weeks} weeks · ${x.phases.map(([n]) => n).join(", ")}`, value: x.id === S.planId ? "Yours" : null, onclick: () => openSheet(() => planSheet(x)) })))));
  return out;
}
function planSheet(p) {
  const mine = p.id === S.planId, start = mondayOf(addDays(TODAY, 7)), ws = layOut(p, start), first = ws[0];
  return {
    title: p.name,
    body: [
      h("div.sheet-top", {}, h("h1", { text: p.name }), h("div.sub", { text: `${p.weeks} weeks · ${p.phases.map(([n, w]) => `${n} ${w}`).join(" · ")}` })),
      h("p", { text: p.about }),
      card(null, "A typical week", h("div.steps", {}, first.days.map((d) => { const w = d.id && d.id !== "event" ? wkById(d.id) : null; return h("div.step", {}, h("i.bg-" + (w ? zoneOf(measure(w).iF).c : "z1")), h("div", {}, h("b", { text: dayName(d.date) }), h("small", { text: w ? w.name : "Rest" })), h("div.v", { text: w ? dur(measure(w, paceFor(w.sport)).secs) : "" })); }))),
      mine ? h("p", { text: "You’re on this plan." }) : h("button.btn", { type: "button", onclick: () => { S.planId = p.id; S.planStart = start; S.swaps = {}; store.set("plan", p.id); store.set("planStart", start); store.set("swaps", {}); closeSheet(); toast(`${p.name} starts on ${dayShort(start)}`); redraw(); } }, `Start on ${dayShort(start)}`),
    ],
  };
}
// a day: what's planned, what's done
function openDay(day) {
  const id = plannedOn(day), w = id && id !== "event" ? wkById(id) : null, did = actsOn(day);
  if (did.length === 1 && !w) return openAct(did[0]);
  if (!did.length && w) return openWorkout(w);
  openSheet(() => ({
    title: dayLong(day),
    body: [h("div.sheet-top", {}, h("h1", { text: dayLong(day) }), h("div.sub", { text: w ? `Planned: ${w.name}` : id === "event" ? "Event day" : "A rest day" })),
      w && section("Planned", h("div.group", {}, workoutRow(w))),
      did.length ? section("Done", h("div.group", {}, did.map(actRow))) : h("p", { text: day < TODAY ? "Nothing recorded this day." : "Nothing recorded yet." })],
  }));
}

// ---- Workouts ----
function workoutsView() {
  const sports = [["ride", "Ride"], ["run", "Run"], ["swim", "Swim"], ["strength", "Strength"]], at = sports.findIndex(([k]) => k === S.sport);
  const out = [head("Workouts", "Every session, to ride and to send", h("button.round", { type: "button", "aria-label": "Build a workout", onclick: () => openSheet(() => builderView()) }, icon("plus", 22, 2.2)))];
  out.push(h("div.seg.wide", { vars: { "--n": 4, "--at": at }, role: "group", "aria-label": "Sport" }, sports.map(([k, label]) => h("button", { type: "button", "aria-pressed": String(S.sport === k), onclick: () => { S.sport = k; redraw(); } }, label))));
  const mine = S.mine.filter((w) => w.sport === S.sport);
  if (mine.length) out.push(section("Yours", h("div.group.glass", {}, mine.map(workoutRow))));
  const kinds = [...new Set(WORKOUTS.filter((w) => w.sport === S.sport).map((w) => w.kind))];
  for (const k of kinds) out.push(section(k, h("div.group.glass", {}, WORKOUTS.filter((w) => w.sport === S.sport && w.kind === k).map(workoutRow))));
  out.push(section(null, h("div.group.glass", {},
    row({ icon: "edit", tint: "coral", title: "Build a workout", sub: "Steps, repeats, power and cadence", onclick: () => openSheet(() => builderView()) }),
    row({ icon: "inbox", tint: "blue", title: "Import a workout", sub: "FIT, ZWO, ERG or MRC (from Zwift, TrainerRoad, TrainingPeaks…)", onclick: chooseFiles }))));
  return out;
}
function workoutRow(w) {
  const m = measure(w, paceFor(w.sport));
  return h("button.row", { type: "button", onclick: () => openWorkout(w) },
    h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) })),
    h("span.tx", {}, h("b", { text: w.name }), h("small", { text: [dur(m.secs), w.sport === "swim" ? dist(F_metres(w), true) : null, w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null].filter(Boolean).join(" · ") })),
    h("span.chev", {}, icon("chev", 17, 2.4)));
}
const F_metres = (w) => flatten(w).reduce((a, s) => a + (s.metres || 0), 0);
function openWorkout(w) { openSheet(() => workoutView(w), { tall: true }); }
function workoutView(w) {
  const m = measure(w, paceFor(w.sport)), ftp = P().ftp, mine = S.mine.some((x) => x.id === w.id);
  const target = (s) => {
    if (s.kind === "free") return "As you like";
    if (w.sport === "ride") return s.from === s.to ? `${pct(s.from)} · ${Math.round(s.from * ftp)} W` : `${pct(s.from)}–${pct(s.to)} · ${Math.round(s.from * ftp)}–${Math.round(s.to * ftp)} W`;
    if (w.sport === "run") return pace(paceOfSpeed(runSpeed() * s.from));
    if (w.sport === "swim") return s.from ? pace(100 / (swimSpeed() * s.from), "/100 m") : "Rest";
    return "";
  };
  const stepEl = (s) => h("div.step", {}, h("i.bg-" + (s.kind === "free" ? "z1" : zoneOf((s.from + (s.to ?? s.from)) / 2).c)),
    h("div", {}, h("b", { text: s.name || { warmup: "Warm up", cooldown: "Cool down", rest: "Easy", work: "Interval", steady: "Steady" }[s.kind] }), h("small", { text: [stepLen(s), s.cad ? `${s.cad[0]}–${s.cad[1]} rpm` : null, s.note].filter(Boolean).join(" · ") })),
    h("div.v", { text: target({ ...s, to: s.to ?? s.from }) }));
  const steps = w.steps.map((s) => (s.repeat ? h("div.repeat", {}, h("div.rh", {}, icon("swap", 14, 2.4), `${s.repeat} times`), h("div.steps", {}, s.steps.map(stepEl))) : stepEl(s)));
  return {
    title: w.name,
    body: [
      h("div.sheet-top", {}, h("div.sub", {}, sportTile(w.sport, true), `${SPORTS[w.sport].name} · ${w.kind}`), h("h1", { text: w.name }),
        h("div.sub.num", { text: [dur(m.secs), w.sport === "swim" ? dist(F_metres(w), true) : null, w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null, w.sport === "ride" ? `IF ${m.iF.toFixed(2)}` : null, w.sport === "ride" ? `${Math.round((m.avg * ftp * m.secs) / 1000)} kJ` : null].filter(Boolean).join(" · ") })),
      card(null, w.sport === "ride" ? `Power, at your FTP of ${ftp} W` : w.sport === "run" ? "Effort, against your threshold pace" : "Effort", C.profile(w, { ftp: w.sport === "ride" ? ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: sheetW() })),
      w.about && h("p", { text: w.about }),
      card(null, "Steps", h("div.steps", {}, steps)),
      w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => pushSheet(() => sendView(w)) }, icon("upload", 19, 2.2), "Send to your devices"),
      h("div.group", {},
        row({ icon: "edit", tint: "coral", title: mine ? "Edit" : "Edit a copy", onclick: () => pushSheet(() => builderView(mine ? w : { ...structuredClone(w), id: `w${Date.now()}`, name: `${w.name} (mine)`, kind: "Yours", imported: false })) }),
        mine && h("button.row.action.danger", { type: "button", onclick: () => { S.mine = S.mine.filter((x) => x.id !== w.id); store.set("workouts", S.mine); closeSheet(); toast("Workout deleted"); redraw(); } }, "Delete workout")),
    ],
  };
}
const paceOfSpeed = (ms) => (U.metric ? 1000 / ms : 1609.344 / ms);

// Sending a workout: a file for each device and app, and how to get it there
function sendView(w) {
  const name = w.name, ride = w.sport === "ride", viewer = inViewer();
  const file = (title, sub, tileCls, ic, ext, make) => row({ tile: h("span.ic." + tileCls, {}, icon(ic, 18, 2)), title, sub, chev: false,
    extra: h("span.get", { "aria-hidden": "true" }, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(name, ext), make()) });
  const fit = () => F.fitFromWorkout(w, { pace: paceFor(w.sport) });
  return {
    title: "Send to your devices",
    body: [
      h("div.sheet-top", {}, h("div.sub", {}, sportTile(w.sport, true), `${SPORTS[w.sport].name} · ${dur(measure(w, paceFor(w.sport)).secs)}`), h("h1", { text: name })),
      viewer && h("div.dl-note", {}, icon("info", 18, 2), h("span", { text: "In this preview, each file comes in a .zip (it only hands over some kinds of file). Open the zip, then copy the file across as below." })),
      section("Garmin", h("div.group", {}, file("Edge or watch", ".fit workout file", "brand.garmin", "device", "fit", fit)),
        h("ol.how", {}, h("li", {}, "Connect your Garmin to your computer with its cable."),
          h("li", {}, "Copy the file into ", h("code", { text: "Garmin/NewFiles" }), " (some watches: ", h("code", { text: "Garmin/Workouts" }), ")."),
          h("li", {}, "Unplug it. The workout is under ", h("b", { text: "Training › Workouts" }), " on an Edge, ", h("b", { text: "Training › My Workouts" }), " on a watch.")),
        h("p.foot", { text: "A newer Edge (the 1050, or a 540, 840 or 1040 since late 2024) shows up as a phone does rather than a drive: on a Mac, open it with OpenMTP, and quit Garmin Express first. Garmin Connect can’t import workout files; sending straight to Connect needs Garmin’s partner programme (the plan’s next step)." })),
      section("Wahoo ELEMNT", h("div.group", {},
        ride && file("ACE, BOLT 3 or ROAM 3", ".fit workout file, into plans", "brand.wahoo", "device", "fit", fit),
        ride && file("Earlier ELEMNT, BOLT or ROAM", ".plan file, into plans", "brand.wahoo", "device", "plan", () => F.planFromWorkout(w)),
        !ride && file("ACE, BOLT 3 or ROAM 3", ".fit workout file, into plans", "brand.wahoo", "device", "fit", fit)),
        h("ol.how", {}, h("li", {}, "In the Wahoo app, open your ELEMNT’s settings and turn on ", h("b", { text: "USB access" }), "."),
          h("li", {}, "Connect it to your computer and copy the file into its ", h("code", { text: "plans" }), " folder."),
          h("li", {}, "On the ELEMNT, open ", h("b", { text: "Planned Workouts" }), " and sync.")),
        h("p.foot", { text: "Wahoo supports the .fit route on the 2024 models. The .plan file is the older ELEMNTs’ own format, which Wahoo never published: it works on most, but not every firmware." })),
      ride && section("Indoor apps", h("div.group", {},
        file("Zwift", ".zwo · Documents/Zwift/Workouts/<your ID>", "zwift", "trainer", "zwo", () => F.zwoFromWorkout(w)),
        file("TrainerRoad, Golden Cheetah and others", `.erg, in watts at your FTP of ${P().ftp} W`, "tr", "trainer", "erg", () => F.ergFromWorkout(w, P().ftp)),
        file("The same, as a share of FTP", ".mrc: follows whatever FTP the app has", "grey", "trainer", "mrc", () => F.mrcFromWorkout(w))),
        h("p.foot", { text: "A Wahoo KICKR or any smart trainer follows these in ERG mode, from whichever app you ride in." })),
      h("button.btn.quiet", { type: "button", onclick: () => saveFile(F.fileName(name, "zip"), F.zip([
        { name: F.fileName(name, "fit"), data: fit() }, ...(ride ? [{ name: F.fileName(name, "plan"), data: F.planFromWorkout(w) }, { name: F.fileName(name, "zwo"), data: F.zwoFromWorkout(w) },
          { name: F.fileName(name, "erg"), data: F.ergFromWorkout(w, P().ftp) }, { name: F.fileName(name, "mrc"), data: F.mrcFromWorkout(w) }] : [])])) }, icon("zip", 19, 2), "All of them, in one zip"),
    ],
  };
}

// The workout builder: steps (warm up, intervals, recoveries, cool down) and repeats, each its length and how hard,
// the shape and its stress drawn as you go
function builderView(base) {
  const B = base ? structuredClone(base) : { id: `w${Date.now()}`, sport: "ride", kind: "Yours", name: "My workout", about: "", steps: [{ kind: "warmup", secs: 600, from: 0.5, to: 0.75, name: "Warm up" }, { repeat: 4, steps: [{ kind: "work", secs: 300, from: 1.05, name: "Hard" }, { kind: "rest", secs: 180, from: 0.55, name: "Easy" }] }, { kind: "cooldown", secs: 600, from: 0.65, to: 0.45, name: "Cool down" }] };
  let picture = h("div"), figs = h("div.sub.num");
  const redrawShape = () => {
    const m = measure(B, paceFor(B.sport));
    picture.replaceChildren(C.profile(B, { ftp: B.sport === "ride" ? P().ftp : null, pace: paceFor(B.sport), label: "The workout so far", W: sheetW() }));
    figs.textContent = `${dur(m.secs)} · TSS ${Math.round(m.tss)}${B.sport === "ride" ? ` · IF ${m.iF.toFixed(2)}` : ""}`;
  };
  const stepper = (label, get, set, show, by) => h("span.stepper", { role: "group", "aria-label": label },
    h("button", { type: "button", "aria-label": `Less ${label}`, onclick: (e) => { set(-by); e.currentTarget.parentNode.querySelector("output").textContent = show(get()); redrawShape(); } }, icon("minus", 16, 2.4)),
    h("output", { text: show(get()) }),
    h("button", { type: "button", "aria-label": `More ${label}`, onclick: (e) => { set(by); e.currentTarget.parentNode.querySelector("output").textContent = show(get()); redrawShape(); } }, icon("plus", 16, 2.4)));
  let list = h("div.bgroup");
  const stepCtl = (s, arr, i) => {
    const zone = () => zoneOf((s.from + (s.to ?? s.from)) / 2).c, bar = h("i.bg-" + zone());
    const kind = h("select", { "aria-label": "Kind of step", onchange: (e) => { s.kind = e.target.value; s.name = { warmup: "Warm up", cooldown: "Cool down", work: "Interval", rest: "Easy", steady: "Steady" }[s.kind]; if ((s.kind === "warmup" || s.kind === "cooldown") && s.to == null) s.to = s.kind === "warmup" ? s.from + 0.2 : Math.max(0.3, s.from - 0.2); if (s.kind !== "warmup" && s.kind !== "cooldown") delete s.to; drawList(); redrawShape(); } },
      [["warmup", "Warm up"], ["work", "Interval"], ["steady", "Steady"], ["rest", "Recovery"], ["cooldown", "Cool down"]].map(([v, l]) => h("option", { value: v, selected: s.kind === v ? true : null }, l)));
    const clamp = (v) => Math.max(0.3, Math.min(2.5, Math.round(v * 100) / 100));
    return h("div.bstep", {}, bar, h("div", {},
      h("div.top", {}, kind, h("button.x", { type: "button", "aria-label": "Remove step", onclick: () => { arr.splice(i, 1); drawList(); redrawShape(); } }, icon("x", 16, 2.4))),
      h("div.ctl", {},
        stepper("time", () => s.secs, (d) => { s.secs = Math.max(15, s.secs + d * (s.secs < 120 ? 15 : 60)); }, clock, 1),
        stepper(s.to != null ? "start" : "power", () => s.from, (d) => { s.from = clamp(s.from + d * 0.05); bar.className = "bg-" + zone(); }, (v) => (B.sport === "ride" ? `${pct(v)} · ${Math.round(v * P().ftp)} W` : pct(v)), 1),
        s.to != null && stepper("end", () => s.to, (d) => { s.to = clamp(s.to + d * 0.05); bar.className = "bg-" + zone(); }, (v) => (B.sport === "ride" ? `to ${pct(v)}` : pct(v)), 1))));
  };
  const drawList = () => {
    list.replaceChildren(...B.steps.map((s, i) => s.repeat
      ? h("div.brepeat", {}, h("div.top", {}, h("span", { text: "Repeat" }), stepper("repeats", () => s.repeat, (d) => { s.repeat = Math.max(1, Math.min(30, s.repeat + d)); }, (v) => `${v} times`, 1),
        h("button.x.link", { type: "button", "aria-label": "Remove repeat", onclick: () => { B.steps.splice(i, 1); drawList(); redrawShape(); } }, icon("x", 16, 2.4))), s.steps.map((x, j) => stepCtl(x, s.steps, j)))
      : stepCtl(s, B.steps, i)));
  };
  drawList(); redrawShape();
  const add = (what) => {
    const at = B.steps.findIndex((s) => s.kind === "cooldown"), pos = at < 0 ? B.steps.length : at;
    const step = { warmup: { kind: "warmup", secs: 600, from: 0.5, to: 0.75, name: "Warm up" }, work: { kind: "work", secs: 300, from: 1.0, name: "Interval" }, rest: { kind: "rest", secs: 180, from: 0.55, name: "Easy" },
      repeat: { repeat: 3, steps: [{ kind: "work", secs: 240, from: 1.1, name: "Hard" }, { kind: "rest", secs: 120, from: 0.55, name: "Easy" }] }, cooldown: { kind: "cooldown", secs: 600, from: 0.65, to: 0.45, name: "Cool down" } }[what];
    if (what === "warmup") B.steps.unshift(step); else if (what === "cooldown") B.steps.push(step); else B.steps.splice(pos, 0, step);
    drawList(); redrawShape();
  };
  return {
    title: base ? "Edit workout" : "New workout",
    right: h("button.link.done", { type: "button", onclick: () => {
      if (!B.steps.length) return toast("Add a step first", true);
      const i = S.mine.findIndex((x) => x.id === B.id);
      if (i >= 0) S.mine[i] = B; else S.mine.unshift(B);
      store.set("workouts", S.mine); S.sport = B.sport; closeSheet(); toast("Saved to your workouts"); redraw();
    } }, "Save"),
    body: [
      h("input.field", { type: "text", value: B.name, "aria-label": "Name", maxlength: 40, oninput: (e) => { B.name = e.target.value.trim() || "My workout"; } }),
      card(null, null, picture, figs),
      list,
      h("div.adds", {}, [["warmup", "Warm up"], ["work", "Interval"], ["rest", "Recovery"], ["repeat", "Repeat"], ["cooldown", "Cool down"]].map(([k, l]) => h("button.pill.small", { type: "button", onclick: () => add(k) }, icon("plus", 14, 2.6), l))),
      h("p", { text: "Power is a share of your FTP, so the workout follows your fitness as it changes. Saved here, it can go to your Garmin, Wahoo, Zwift or TrainerRoad like any other." }),
    ],
  };
}

// ---- Activities ----
function activitiesView() {
  const sports = [["all", "All"], ["ride", "Rides"], ["run", "Runs"], ["other", "Other"]], at = sports.findIndex(([k]) => k === S.actSport);
  const list = S.acts.filter((a) => S.actSport === "all" || a.sport === S.actSport || (S.actSport === "other" && a.sport !== "ride" && a.sport !== "run"));
  const out = [head("Activities", `${plural(S.acts.length, "activity", "activities")}, from your devices`, h("button.round", { type: "button", "aria-label": "Import files", onclick: chooseFiles }, icon("inbox", 21, 2)))];
  // the last four weeks, at a glance
  const since = addDays(TODAY, -27), recent = S.acts.filter((a) => a.start >= since);
  const tot = recent.reduce((t, a) => { const s = sumOf(a); if (s) { t.secs += s.moving; t.dist += s.dist || 0; t.tss += s.tss || 0; t.asc += s.ascent || 0; } return t; }, { secs: 0, dist: 0, tss: 0, asc: 0 });
  out.push(card(null, "The last four weeks", S.summed ? h("div.stats", {}, stat("Time", hm(tot.secs), tot.secs >= 3600 ? "h" : null), stat("Distance", ...distNum(tot.dist)), stat("Climbing", ...height(tot.asc))) : wait(48)));
  out.push(h("div.seg.wide", { vars: { "--n": 4, "--at": at }, role: "group", "aria-label": "Sport" }, sports.map(([k, label]) => h("button", { type: "button", "aria-pressed": String(S.actSport === k), onclick: () => { S.actSport = k; redraw(); } }, label))));
  // by week, newest first
  const byWeek = new Map();
  for (const a of list) { const k = mondayOf(a.start); if (!byWeek.has(k)) byWeek.set(k, []); byWeek.get(k).push(a); }
  const thisMon = mondayOf(TODAY);
  for (const [mon, acts] of byWeek) {
    const name = mon === thisMon ? "This week" : mon === addDays(thisMon, -7) ? "Last week" : `${dateShort(mon)} – ${dateShort(addDays(mon, 6))}`;
    const secs = acts.reduce((t, a) => t + (sumOf(a)?.moving || 0), 0);
    out.push(section([name, h("span.aside", { text: S.summed ? dur(secs) : "" })], h("div.group.glass", {}, acts.map(actRow))));
  }
  out.push(h("p.foot", { vars: { "text-align": "center" } }, h("button.link", { type: "button", onclick: chooseFiles }, "Import from a Garmin or Wahoo")));
  return out;
}
function actRow(a) {
  const s = sumOf(a);
  return h("button.row", { type: "button", onclick: () => openAct(a) }, sportTile(a.sport),
    h("span.tx", {}, h("b", { text: a.name }), h("small", { text: `${dayShort(a.start)} · ${a.device || (a.sample ? "Example" : "Imported")}` })),
    h("span.val", {}, s ? (s.dist > 100 ? dist(s.dist) : hm(s.moving)) : "", h("small", { text: s ? [s.dist > 100 ? hm(s.moving) : null, s.tss != null ? `TSS ${s.tss}` : null].filter(Boolean).join(" · ") : "" })));
}
function openAct(a) { openSheet(() => actView(a), { tall: true }); }
function actView(a) {
  const x = full(a), s = sumOf(a) || summarise(x, P()), ps = perSecond(x), w = a.workout ? wkById(a.workout) : null, plannedId = plannedOn(startOfDay(a.start));
  const planned = plannedId && plannedId !== "event" ? wkById(plannedId) : null;
  const body = [];
  body.push(h("div.sheet-top", {}, h("div.sub", {}, sportTile(a.sport, true), `${dayLong(a.start)}, ${timeOf(a.start)}`), h("h1", { text: a.name }),
    h("div.sub", { text: [a.device, a.sample ? "example ride" : a.file].filter(Boolean).join(" · ") }),
    planned && planned.sport === a.sport && h("div.sub", {}, h("span.tick-badge", {}, icon("check", 14, 3)), `From your plan: ${planned.name}`)));
  // the route, coloured by the power there (30 seconds' average) or plain
  let mapAt = null;
  if (x.s.lat) {
    const roll = ps.pwr ? rollAvg(ps.pwr, 30) : null;
    const r = C.route(x.s, roll ? (i) => zoneOf((roll[Math.min(roll.length - 1, Math.round(x.s.t[i]))] || 0) / P().ftp).c : null, sheetW() + 36, U.metric);
    mapAt = (sec) => { if (sec == null) return r.at(null); let lo = 0, hi = x.s.t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (x.s.t[m] < sec) lo = m + 1; else hi = m; } r.at(lo); };
    body.push(h("div.map", {}, r.el));
  }
  const ftp = P().ftp;
  body.push(card(null, null, h("div.stats", {},
    s.dist > 100 && stat("Distance", ...distNum(s.dist)), stat("Moving time", clock(s.moving)), s.ascent > 0 && stat("Climbing", ...height(s.ascent)),
    a.sport === "ride" && s.avgSpd && stat("Average speed", ...speed(s.avgSpd)), a.sport === "run" && s.avgSpd && stat("Average pace", pace(paceOfSpeed(s.avgSpd)).split(" ")[0], U.metric ? "/km" : "/mi"),
    s.avgPwr != null && stat("Average power", s.avgPwr, "W"), s.np != null && stat("Normalized Power", s.np, "W"), s.iF != null && stat("Intensity", s.iF.toFixed(2)),
    s.tss != null && stat(s.kind === "hr" ? "TSS (from heart rate)" : "Training stress", s.tss), s.avgHr && stat("Average heart rate", s.avgHr, "bpm"), s.maxHr && stat("Max heart rate", s.maxHr, "bpm"),
    s.avgCad && stat("Cadence", s.avgCad, a.sport === "run" ? "spm" : "rpm"), s.kj != null ? stat("Work", s.kj.toLocaleString("en-GB"), "kJ") : stat("Energy", s.kcal, "kcal"))));
  // power, heart rate and height, with a cursor that says what each was there (and moves a marker on the map)
  if (ps.moving.length > 60) {
    const cw = sheetW(), pic = C.streams(ps, s.secs, cw), cur = pic.querySelector(".cursor"), read = h("p.readout", { text: "Touch the chart to see each moment." });
    const show = (e) => {
      const r = pic.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), sec = Math.round(f * (ps.moving.length - 1));
      cur.setAttribute("x1", f * cw); cur.setAttribute("x2", f * cw); cur.setAttribute("visibility", "visible");
      const v = (arr, k = 0) => (arr && Number.isFinite(arr[sec]) ? arr[sec] : null), pw = ps.pwr ? rollAvg(ps.pwr, 3, sec) : null;
      read.replaceChildren(h("b", { text: clock(sec) }), pw != null ? ` · ${Math.round(pw)} W` : "", v(ps.hr) != null ? ` · ${Math.round(v(ps.hr))} bpm` : "",
        v(ps.spd) != null ? ` · ${speed(v(ps.spd)).join(" ")}` : "", v(ps.ele) != null ? ` · ${height(v(ps.ele)).join(" ")}` : "");
      mapAt?.(sec);
    };
    pic.addEventListener("pointermove", show); pic.addEventListener("pointerdown", show);
    pic.addEventListener("pointerleave", () => { cur.setAttribute("visibility", "hidden"); mapAt?.(null); });
    body.push(card(null, "Through the ride", read, pic, h("div.legend", {}, ps.pwr && h("span", {}, h("i.lg-pwr"), "Power"), ps.hr && h("span", {}, h("i.lg-hr"), "Heart rate"), !ps.pwr && ps.spd && h("span", {}, h("i.lg-spd"), "Speed"), ps.ele && h("span", {}, h("i.lg-ele"), "Height"))));
  }
  // time in zones
  if (s.zones) body.push(card(null, `Time in power zones · FTP ${ftp} W`, zoneBars(s.zones, ZONES.map((z, i) => `${z.name} · ${i ? Math.round(ZONES[i - 1].top * ftp) : 0}${z.top < 9 ? `–${Math.round(z.top * ftp)}` : "+"} W`), ZONES.map((z) => z.c))));
  if (s.hrZones) body.push(card(null, `Time in heart rate zones · threshold ${P().lthr} bpm`, zoneBars(s.hrZones, HR_ZONES.map((z, i) => `${z.name} · ${i ? Math.round(HR_ZONES[i - 1].top * P().lthr) : 0}${z.top < 9 ? `–${Math.round(z.top * P().lthr)}` : "+"} bpm`), ["z1", "z2", "z3", "z4", "z6"])));
  if (s.curve && Object.keys(s.curve).length > 2) {
    // (an FTP read from the best 20 minutes only where they were ridden hard: an easy ride's says nothing about it)
    const best20 = s.curve[1200], est = best20 ? Math.round(best20 * 0.95) : 0;
    body.push(card(null, "Best efforts", C.curve(s.curve, ftp, sheetW()), best20 && h("p.line-said", { text: `Your best 20 minutes: ${best20} W, ${pct(best20 / ftp)} of your FTP.${est > ftp + 4 ? ` That’s an FTP of about ${est} W, above your ${ftp} W: worth a test.` : ""}` })));
  }
  if (x.laps.length > 1 && x.laps.length <= 30) {
    body.push(section(`Laps (${x.laps.length})`, h("div.group", {}, x.laps.map((l, i) => {
      const p = ps.pwr ? avgOver(ps.pwr, l.start, l.secs) : null, hr = ps.hr ? avgOver(ps.hr, l.start, l.secs) : null;
      return h("div.row.plain", {}, h("span.tx", {}, h("b", { text: `Lap ${i + 1}` }), h("small", { text: clock(l.secs) })), h("span.val", { text: [p != null && `${Math.round(p)} W`, hr != null && `${Math.round(hr)} bpm`].filter(Boolean).join(" · ") }));
    }))));
  }
  // and out again
  const stem = `${new Date(a.start).toISOString().slice(0, 10)} ${a.name}`;
  body.push(section("Export", h("div.group", {},
    row({ tile: h("span.ic.coral", {}, icon("file", 18, 2)), title: "FIT", sub: "For Garmin Connect, Strava, TrainingPeaks, intervals.icu, and the Wahoo app", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "fit"), F.fitFromActivity(x, s)) }),
    x.s.lat && row({ tile: h("span.ic.blue", {}, icon("file", 18, 2)), title: "GPX", sub: "For maps and route apps (Komoot, RideWithGPS), with heart rate, cadence and power", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "gpx"), F.gpxFromActivity(x)) }),
    row({ tile: h("span.ic.grey", {}, icon("file", 18, 2)), title: "TCX", sub: "Garmin’s older format, for tools that want it", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "tcx"), F.tcxFromActivity(x, s)) })),
    h("p.foot", { text: "Garmin Connect: Import Data takes any of these. The Wahoo app: History, then + and Upload, takes the FIT file." })));
  if (!a.sample) body.push(h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: async () => {
    S.acts = S.acts.filter((y) => y.id !== a.id); S.sums.delete(a.id); try { await idb.del(a.id); } catch (_) {} closeSheet(); toast("Deleted"); redraw();
  } }, "Delete this activity")));
  return { title: a.name, body };
}
function zoneBars(secs, labels, cls) {
  const total = secs.reduce((a, b) => a + b, 0) || 1, max = Math.max(...secs);
  const bars = secs.map((v, i) => {
    const fill = h("i.bg-" + cls[i]);
    requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty("width", `${(v / max) * 100}%`)));
    return h("div.zrow", { title: labels[i] }, h("span", { text: `Z${i + 1}` }), h("span.zbar", { "aria-label": `${labels[i]}: ${dur(v)}, ${pct(v / total)}` }, fill), h("span.zv", { text: v >= 60 ? `${dur(v)}` : v ? "<1 min" : "–" }));
  });
  return h("div.zones", {}, bars);
}
const rollAvg = (arr, n, at = null) => {
  if (at != null) { let t = 0, c = 0; for (let j = Math.max(0, at - n + 1); j <= at; j++) if (Number.isFinite(arr[j])) { t += arr[j]; c++; } return c ? t / c : null; }
  const out = new Float64Array(arr.length); let t = 0;
  for (let i = 0; i < arr.length; i++) { t += Number.isFinite(arr[i]) ? arr[i] : 0; if (i >= n) t -= Number.isFinite(arr[i - n]) ? arr[i - n] : 0; out[i] = t / Math.min(i + 1, n); }
  return out;
};
const avgOver = (arr, from, secs) => { let t = 0, c = 0; for (let i = Math.round(from); i < Math.min(arr.length, from + secs); i++) if (Number.isFinite(arr[i])) { t += arr[i]; c++; } return c ? t / c : null; };

// fitness and form, over longer
function formView() {
  const f = fitnessSeries(), last = f.at(-1), said = formSaid(last.tsb), days = S.formDays;
  const seg = h("div.seg", { vars: { "--n": 3, "--at": [42, 90, 180].indexOf(days) }, role: "group", "aria-label": "How far back" },
    [[42, "6 weeks"], [90, "3 months"], [180, "6 months"]].map(([d, l]) => h("button", { type: "button", "aria-pressed": String(days === d), onclick: () => { S.formDays = d; Sheet.redraw(); } }, l)));
  return {
    title: "Fitness and form",
    body: [
      h("div.sheet-top", {}, h("h1", { text: `${said.word}, at ${signed(last.tsb)}` }), h("div.sub", { text: said.line })),
      seg,
      card(null, null, C.fitnessChart(f, { days: Math.min(days, f.length), W: sheetW() }), h("div.legend", {}, h("span", {}, h("i.lg-fit"), `Fitness ${Math.round(last.ctl)}`), h("span", {}, h("i.lg-fat"), `Fatigue ${Math.round(last.atl)}`), h("span", {}, h("i.lg-form"), "Form"))),
      h("p", { text: "Fitness is your training stress averaged over the last six weeks; fatigue, over the last one. Form is the gap between them: below zero you’re carrying fatigue, which is where training does its work; above it, you’re fresh." }),
      h("p", { text: "Each ride’s stress comes from its power against your FTP (an hour flat out is 100), or from heart rate where there’s no power. Keep fitness rising by about 3 to 6 a week, and take an easier week every fourth." }),
    ],
  };
}

// ---- you, and settings ----
function settingsView() {
  const p = P(), wkg = (p.ftp / p.weight).toFixed(2);
  const devices = [...new Set(S.acts.map((a) => a.device).filter(Boolean))];
  return {
    title: "You",
    body: [
      card(null, null, h("div.wx", {}, h("div.round.me", { "aria-hidden": "true" }, (p.name || "Y").slice(0, 1)), h("div", {}, h("b", { text: p.name || "You" }),
        h("span", { text: "Demo: not signed in. Signed in with your georgefarrowgreen.com account, your rides and plan would be kept with it, on every device." })))),
      section("Your numbers", h("div.group", {},
        row({ icon: "bolt", tint: "coral", title: "FTP", value: [`${p.ftp} W`, h("small", { text: `${wkg} W/kg` })], onclick: () => pushSheet(numbersView) }),
        row({ icon: "scale", tint: "indigo", title: "Weight", value: weight(p.weight), onclick: () => pushSheet(numbersView) }),
        row({ icon: "heart", tint: "red", title: "Heart rate", value: [`${p.lthr} bpm`, h("small", { text: `${p.maxHr} max` })], onclick: () => pushSheet(numbersView) }),
        row({ icon: "run", tint: "green", title: "Threshold pace", value: pace(paceOf(p.runPace)), onclick: () => pushSheet(numbersView) }),
        row({ icon: "swim", tint: "teal", title: "Swim (CSS)", value: pace(p.css, "/100 m"), onclick: () => pushSheet(numbersView) })),
        h("p.foot", { text: "Every zone, target and training stress follows these." })),
      section("Power zones", h("div.group", {}, ZONES.map((z, i) => h("div.row.plain", {}, h("span.zone-chip.bg-" + z.c, { text: `Z${z.n}` }), h("span.tx", {}, h("b", { text: z.name })),
        h("span.val", { text: `${i ? Math.round(ZONES[i - 1].top * p.ftp) : 0}${z.top < 9 ? `–${Math.round(z.top * p.ftp) - 1}` : "+"} W` }))))),
      section("Your devices", h("div.group", {},
        devices.map((d) => row({ icon: /KICKR/i.test(d) ? "trainer" : "device", tint: /Wahoo/i.test(d) ? "blue" : "grey", title: d, sub: `Seen in ${plural(S.acts.filter((a) => a.device === d).length, "file")}`, chev: false })),
        row({ icon: "usb", tint: "coral", title: "Sending workouts to a device", onclick: () => pushSheet(() => sendView(wkById("ss-3x12"))) })),
        h("p.foot", { text: "Garmin and Wahoo devices are known from the files they write. Sending workouts straight to them, without a cable, comes with Garmin’s and Wahoo’s partner programmes." })),
      section("Preferences", h("div.group", {},
        row({ icon: "contrast", tint: "indigo", title: "Appearance", value: { auto: "Automatic", light: "Light", dark: "Dark" }[store.get("appearance", "auto")] || "Automatic", onclick: () => pushSheet(appearanceView) }),
        row({ icon: "ruler", tint: "blue", title: "Units", value: U.metric ? "Kilometres" : "Miles", onclick: () => { U.metric = !U.metric; store.set("units", U.metric ? "metric" : "imperial"); redraw(true); } }))),
      section("Your data", h("div.group", {},
        row({ icon: "inbox", tint: "blue", title: "Import files", sub: "FIT, GPX, TCX, ZWO, ERG, MRC, or a zip of them", onclick: () => { closeSheet(); chooseFiles(); } }),
        row({ icon: "zip", tint: "green", title: "Export everything", sub: "Every activity as FIT, and your workouts as FIT and ZWO, in one zip", onclick: exportAll })),
        h("p.foot", { text: "Files are read and made on this device. Imported rides are kept in this browser." })),
    ],
  };
}
function numbersView() {
  const p = P(), field = (label, key, show, by, lo, hi) => h("div.row.plain", {}, h("span.tx", {}, h("b", { text: label })),
    h("span.stepper", { role: "group", "aria-label": label },
      h("button", { type: "button", "aria-label": `Less ${label}`, onclick: () => change(key, -by, lo, hi) }, icon("minus", 16, 2.4)),
      h("output", { text: show(p[key]) }),
      h("button", { type: "button", "aria-label": `More ${label}`, onclick: () => change(key, by, lo, hi) }, icon("plus", 16, 2.4))));
  const change = (k, d, lo, hi) => { S.profile = { ...P(), [k]: Math.max(lo, Math.min(hi, Math.round((P()[k] + d) * 10) / 10)) }; store.set("profile", S.profile); Sheet.redraw(); clearTimeout(change.t); change.t = setTimeout(() => { resum(); redraw(); }, 600); };
  // (your best 20 minutes of the last six weeks, for an FTP to try)
  const since = addDays(TODAY, -42), best20 = Math.max(0, ...S.acts.filter((a) => a.start >= since).map((a) => sumOf(a)?.curve?.[1200] || 0));
  return {
    title: "Your numbers",
    body: [
      h("div.group", {}, field("FTP", "ftp", (v) => `${v} W`, 5, 80, 500), field("Weight", "weight", (v) => weight(v), 0.5, 35, 150),
        field("Threshold heart rate", "lthr", (v) => `${v} bpm`, 1, 100, 210), field("Max heart rate", "maxHr", (v) => `${v} bpm`, 1, 120, 230),
        field("Threshold pace", "runPace", (v) => pace(paceOf(v)), 5, 150, 600), field("CSS", "css", (v) => pace(v, "/100 m"), 1, 50, 240)),
      best20 > 0 && card(null, "From your rides", h("p.line-said", { text: `Your best 20 minutes in the last six weeks: ${best20} W, an FTP of about ${Math.round(best20 * 0.95)} W.` }),
        Math.abs(Math.round(best20 * 0.95) - p.ftp) >= 5 && h("button.pill.small", { type: "button", onclick: () => { S.profile = { ...P(), ftp: Math.round(best20 * 0.95) }; store.set("profile", S.profile); Sheet.redraw(); resum(); redraw(); toast(`FTP set to ${S.profile.ftp} W`); } }, `Use ${Math.round(best20 * 0.95)} W`)),
      h("p", { text: "FTP is the power you could hold for about an hour. The ramp test or the 20-minute test in Workouts will find it; or ride hard and Cadence will notice." }),
    ],
  };
}
function appearanceView() {
  const now = store.get("appearance", "auto"), set = (v) => {
    store.set("appearance", v);
    if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    try { localStorage.setItem("cadence:appearance", v); } catch (_) {}
    Sheet.redraw();
  };
  return { title: "Appearance", body: [h("div.group", {}, [["auto", "Automatic", "As your device is set"], ["light", "Light", "Dawn"], ["dark", "Dark", "Night"]].map(([v, l, sub]) =>
    row({ title: l, sub, chev: false, onclick: () => set(v), extra: now === v ? h("span.get", {}, icon("check", 18, 2.6)) : null })))] };
}

// ---- files ----
// Inside claude.ai's viewer, a page can't start a download itself: it offers the file through the viewer's own save,
// which takes only some kinds of file, so a FIT (or any) file goes in a zip. Anywhere else, the browser's own download.
const inViewer = () => typeof window.claude?.use === "function";
async function saveFile(name, data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (inViewer()) {
    let dl = null;
    try { dl = await window.claude.use("downloads"); } catch (_) {}
    if (!dl) return toast("Saving files isn’t available in this preview", true);
    const zipped = name.endsWith(".zip") ? bytes : F.zip([{ name, data: bytes }]);
    try { await dl.save({ filename: name.endsWith(".zip") ? name : name.replace(/\.[^.]+$/, "") + ".zip", data: zipped }); toast(`Saved ${name}`); }
    catch (e) { if (e?.code !== "declined") toast("That file couldn’t be saved here", true); }
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(`Saved ${name}`);
}
function weekZip(wk) {
  const files = [];
  for (const d of wk.days) {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id && id !== "event" ? wkById(id) : null;
    if (w && w.sport !== "strength") files.push({ name: F.fileName(`${new Date(d.date).toISOString().slice(0, 10)} ${w.name}`, "fit"), data: F.fitFromWorkout(w, { pace: paceFor(w.sport) }) });
  }
  saveFile(F.fileName(`Cadence week ${wk.week}`, "zip"), F.zip(files));
}
// a week or two as calendar events (iCalendar), each workout at 7:00 for its length, its steps in the notes
function calendar(wks) {
  const z = (n) => String(n).padStart(2, "0"), stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}T${z(d.getHours())}${z(d.getMinutes())}00`; };
  const fold = (s) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ev = [];
  for (const wk of wks) for (const d of wk.days) {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id && id !== "event" ? wkById(id) : null;
    if (!w) continue;
    const m = measure(w, paceFor(w.sport)), start = d.date + 7 * 3600e3;
    const notes = `${w.about}\n\n` + flatten(w, paceFor(w.sport)).map((s) => `${stepLen(s)} ${s.name || s.kind}${w.sport === "ride" && s.kind !== "free" ? ` at ${pct(s.from)}${s.to !== s.from ? `–${pct(s.to)}` : ""}` : ""}`).join("\n");
    ev.push(["BEGIN:VEVENT", `UID:${w.id}-${d.date}@cadence.georgefarrowgreen.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + m.secs * 1000)}`,
      `SUMMARY:${fold(`${w.name} (${SPORTS[w.sport].name})`)}`, `DESCRIPTION:${fold(notes)}`, "END:VEVENT"].join("\r\n"));
  }
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//georgefarrowgreen.com//Cadence//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR", ""].join("\r\n");
  // (iCalendar files aren't among the kinds claude.ai's viewer hands over: there, it goes in a zip like the rest)
  saveFile(F.fileName(`Cadence week ${wks[0].week}`, "ics"), ics);
}
function exportAll() {
  const files = [];
  for (const a of S.acts) {
    const x = full(a), s = sumOf(a) || summarise(x, P());
    files.push({ name: F.fileName(`${new Date(a.start).toISOString().slice(0, 10)} ${a.name}`, "fit"), data: F.fitFromActivity(x, s) });
  }
  for (const w of S.mine) {
    files.push({ name: `workouts/${F.fileName(w.name, "fit")}`, data: F.fitFromWorkout(w, { pace: paceFor(w.sport) }) });
    if (w.sport === "ride") files.push({ name: `workouts/${F.fileName(w.name, "zwo")}`, data: F.zwoFromWorkout(w) });
  }
  saveFile("Cadence export.zip", F.zip(files));
}

// Importing: chosen, or dropped anywhere on the page
function chooseFiles() { filesEl.value = ""; filesEl.click(); }
filesEl.addEventListener("change", () => { if (filesEl.files.length) importFiles([...filesEl.files]); });
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dropEl.classList.add("on"); });
addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropEl.classList.remove("on"); } });
addEventListener("drop", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; dropEl.classList.remove("on"); importFiles([...e.dataTransfer.files]); });
dropEl.append(h("div", {}, icon("inbox", 40, 1.8), h("b", { text: "Drop to import" }), h("span", { text: "Rides and runs as FIT, GPX or TCX (from a Garmin, a Wahoo, Strava…), workouts as FIT, ZWO, ERG or MRC" })));

async function importFiles(files) {
  const got = { acts: [], workouts: [], skipped: [], dupes: 0 };
  toast(`Reading ${plural(files.length, "file")}…`);
  for (const f of files) {
    try {
      const r = await F.readAny(f.name, await f.arrayBuffer());
      for (const a of r.activities) {
        if (S.acts.some((x) => !x.sample && Math.abs(x.start - a.start) < 60e3 && x.sport === a.sport)) { got.dupes++; continue; }
        const entry = { id: `i${a.start}`, sport: a.sport, start: a.start, name: a.name, device: a.device, indoor: a.indoor, sample: false, file: a.file, data: a };
        S.acts.push(entry); S.sums.set(entry.id, summarise(a, P())); got.acts.push(entry);
        try { await idb.put(entry); } catch (_) {}
      }
      for (const w of r.workouts) { S.mine.unshift(w); got.workouts.push(w); }
      got.skipped.push(...(r.skipped || []));
    } catch (e) { got.skipped.push(`${f.name}: ${e.message}`); }
  }
  S.acts.sort((a, b) => b.start - a.start);
  if (got.workouts.length) store.set("workouts", S.mine);
  toastEl.classList.remove("on");
  redraw();
  if (got.acts.length === 1 && !got.workouts.length && !got.skipped.length) return openAct(got.acts[0]);
  if (got.workouts.length === 1 && !got.acts.length && !got.skipped.length) { S.sport = got.workouts[0].sport; redraw(); return openWorkout(got.workouts[0]); }
  openSheet(() => ({
    title: "Imported",
    body: [h("div.sheet-top", {}, h("h1", { text: got.acts.length || got.workouts.length ? "Imported" : "Nothing imported" }),
      h("div.sub", { text: [got.acts.length && plural(got.acts.length, "activity", "activities"), got.workouts.length && plural(got.workouts.length, "workout"), got.dupes && `${got.dupes} already here`].filter(Boolean).join(" · ") || "" })),
      got.acts.length && section("Activities", h("div.group", {}, got.acts.map(actRow))),
      got.workouts.length && section("Workouts", h("div.group", {}, got.workouts.map(workoutRow))),
      got.skipped.length && section("Not read", h("div.group", {}, got.skipped.map((s) => h("div.row.plain", {}, h("span.tx", {}, h("small", { text: s }))))))],
  }));
}

// ---- sheets: up from below, the page stepping back; inside one, on and back slide like pages ----
const Sheet = { stack: [], tall: false, redraw: null };
function openSheet(view, { tall = false } = {}) {
  if (sheetEl.open) { Sheet.stack = []; }
  Sheet.stack.push(view); Sheet.tall = tall;
  drawSheet();
  if (!sheetEl.open) {
    document.body.style.setProperty("--sy", `${scrollY + innerHeight / 2}px`);
    sheetEl.classList.remove("closing");
    sheetEl.showModal();
    document.body.classList.add("sheet-up");
  }
}
function pushSheet(view) { Sheet.stack.push(view); drawSheet("on"); }
function sheetBack() { if (Sheet.stack.length > 1) { Sheet.stack.pop(); drawSheet("back"); } else closeSheet(); }
function drawSheet(dir = null) {
  const v = Sheet.stack.at(-1)();
  sheetEl.classList.toggle("tall", Sheet.tall);
  const bodyEl = h("div.sheet-body" + (dir ? ".swap" + (dir === "back" ? ".back" : "") : ""), {}, v.body);
  const headEl = h("div.sheet-head", {},
    Sheet.stack.length > 1 ? h("button.link.back.l", { type: "button", onclick: sheetBack, "aria-label": "Back" }, icon("back", 22, 2.4), "Back") : h("span.l"),
    h("h2#sheet-title", { text: v.title || "" }),
    v.right || h("button.link.done.r", { type: "button", onclick: closeSheet }, "Done"));
  sheetEl.replaceChildren(h("div.grab", { "aria-hidden": "true" }), headEl, bodyEl);
  drag(headEl);
  Sheet.redraw = () => { const top = bodyEl.scrollTop; drawSheet(); sheetEl.querySelector(".sheet-body").scrollTop = top; };
}
async function closeSheet() {
  if (!sheetEl.open || sheetEl.classList.contains("closing")) return;
  sheetEl.style.setProperty("--from-tf", getComputedStyle(sheetEl).transform === "none" ? "none" : getComputedStyle(sheetEl).transform);
  sheetEl.classList.add("closing");
  document.body.classList.remove("sheet-up");
  await new Promise((r) => setTimeout(r, still.matches ? 200 : 340));
  sheetEl.close(); sheetEl.classList.remove("closing"); sheetEl.style.removeProperty("transform"); sheetEl.style.removeProperty("--from-tf");
  Sheet.stack = []; Sheet.redraw = null;
}
sheetEl.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
sheetEl.addEventListener("click", (e) => { if (e.target === sheetEl) closeSheet(); });   // (a tap on the dim outside it)
// dragged down by its top, it follows the finger; let go far enough (or quickly), it goes
function drag(handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const y0 = e.clientY, t0 = performance.now();
    let dy = 0;
    sheetEl.classList.add("dragging");
    const move = (ev) => { dy = Math.max(0, ev.clientY - y0); sheetEl.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      sheetEl.classList.remove("dragging");
      if (dy > 120 || (dy > 30 && dy / (performance.now() - t0) > 0.6)) closeSheet();
      else { sheetEl.style.transition = "transform 0.4s var(--ease-spring)"; sheetEl.style.transform = ""; setTimeout(() => sheetEl.style.removeProperty("transition"), 400); }
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  });
}

// ---- toasts ----
let toastT = null;
function toast(text, bad = false, ms = 2600) {
  toastEl.replaceChildren(icon(bad ? "info" : "check", 18, 2.4), h("span", { text }));
  toastEl.classList.toggle("bad", bad); toastEl.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), ms);
}

// ---- drawn again for a new width (the charts are drawn to it) ----
let lastW = innerWidth, resizeT = null;
addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; redraw(true); } }, 250); });

// ---- the status bar's glass, once the page is under it ----
addEventListener("scroll", () => document.documentElement.style.setProperty("--bar", scrollY > 8 ? 1 : 0), { passive: true });

// ---- starting ----
(async () => {
  const want = location.hash.slice(1);
  if (TABS.some(([id]) => id === want)) S.tab = want;
  drawTabs();
  render(true);
  // (your imported rides, from this browser, then each ride's figures)
  try {
    const mine = await idb.all();
    for (const a of mine || []) { if (!S.acts.some((x) => x.id === a.id)) { S.acts.push(a); S.sums.set(a.id, summarise(a.data, P())); } }
    S.acts.sort((a, b) => b.start - a.start);
  } catch (_) {}
  sumUp();
  if (S.summed) redraw();
})();
