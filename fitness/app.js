// Fitness: training for riding first, and running, swimming and strength alongside. Four screens on a tab bar:
//
// - Today: today's session (or rest), the best time for it from Weather, your fitness, fatigue and form, the week so
//   far, and how you feel (which can swap a hard day for an easy one).
// - Plan: the plan you're on, its phases and weeks, this week's days and next; another plan from the library.
// - Workouts: the library by sport and kind, your own (built here, or imported), each to read, ride and send.
// - Activities: every ride, run and swim, from the files your devices record, each with its route, figures, charts,
//   zones and best efforts, and out again as FIT, GPX or TCX.
//
// Files come in from anywhere on the page (Import, or dropped on it): FIT from a Garmin or a Wahoo, GPX, TCX, ZWO, ERG,
// MRC, or a zip of them. Workouts go out as each device and app takes them (formats.js). Files are read and made on this
// device.
//
// Signed in only: with your georgefarrowgreen.com account, the one every app on the site uses, signed in on the
// account's own page (account.js). Your rides (each file as you imported it, and its figures), your plan, your numbers
// and your workouts are kept with the account, so they're the same on every phone and computer you sign in on; a change
// here goes to it a moment later, put together with any another device made meanwhile (account.js merge).

import { h, svg as svgOf, icon, sportIcon, U, dur, hm, clock, stepLen, dist, distNum, height, speed, pace, paceOf, weight, dayLong, dayShort, dayName, dayLetter, dateShort, timeOf, plural, pct } from "./ui.js";
import { WORKOUTS, PLANS, SPORTS, ZONES, HR_ZONES, zoneOf, flatten, measure, layOut, workoutById, DAY, startOfDay, addDays, mondayOf } from "./workouts.js";
import { summarise, fitness, formSaid, perSecond, rescale } from "./load.js";
import { demo, samples, PROFILE, rng } from "./sample.js";
import * as F from "./formats.js";
import * as C from "./charts.js";
import * as A from "./account.js";
import * as R from "./rhythm.js";

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main"), sheetEl = $("#sheet"), toastEl = $("#toast"), tabsEl = $("#tabs"), dropEl = $("#drop"), filesEl = $("#files");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// ---- kept in this browser ----
const store = {
  get(k, d) { try { const v = localStorage.getItem("fitness:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("fitness:" + k, JSON.stringify(v)); } catch (_) {} },
};
// each activity's file as this device last fetched it (IndexedDB), so a ride opened again doesn't come over the network
// again: by account and activity, and cleared on signing out
const idb = (() => {
  let p = null;
  const open = () => (p ||= new Promise((res, rej) => {
    const r = indexedDB.open("fitness", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction("files", mode), q = fn(t.objectStore("files")); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); });
  };
  return { get: (k) => run("readonly", (s) => s.get(k)), put: (k, v) => run("readwrite", (s) => s.put(v, k)), del: (k) => run("readwrite", (s) => s.delete(k)), clear: () => run("readwrite", (s) => s.clear()) };
})();

const TODAY = startOfDay(Date.now());
const D = demo(Date.now());
// Your record (kept with the account: adopt), your own activities (S.own, their rows from the account), and the example
// rides, shown only if you turn them on (You › Example rides). The plan's the one you chose (and when it starts), or with
// the examples on and none chosen, theirs.
const S = {
  tab: "today", me: null, ver: 0, dirty: new Set(), inStepWorkouts: [], pulledAt: 0,
  profile: { ...PROFILE }, examples: false, chosen: null, rhythm: null, swaps: {}, feel: {}, mine: [],
  sport: "ride", actSport: "all", formDays: 42,
  own: [], acts: [], garmin: { on: false },
  sums: new Map(), summed: false,
};
// Your record, as kept with the account, taken up here (null: none yet, so the app's own defaults)
function adopt(d) {
  const ok = (o) => o && typeof o === "object" && !Array.isArray(o), was = numbers();
  S.profile = { ...PROFILE, ...(ok(d?.profile) ? d.profile : {}) };
  S.chosen = ok(d?.plan) && PLANS.some((p) => p.id === d.plan.id) && Number.isFinite(d.plan.start) ? d.plan : null;
  S.rhythm = ok(d?.rhythm) && Array.isArray(d.rhythm.days) ? d.rhythm : null;
  S.swaps = ok(d?.swaps) ? d.swaps : {}; S.feel = ok(d?.feel) ? d.feel : {};
  S.mine = Array.isArray(d?.workouts) ? d.workouts : [];
  U.metric = d?.prefs?.units !== "imperial"; S.examples = false;   // (the example rides are gone: your own alone)
  setActs();
  // (new numbers, from another device: every ride's stress worked out again for them)
  if (numbers() !== was) resum();
}
const numbers = () => [P().ftp, P().lthr, P().runPace, P().css].join("/");
// what's kept with the account, as this device has it now
const record = () => ({ profile: (({ name, ...p }) => p)(S.profile), plan: S.chosen, rhythm: S.rhythm, swaps: S.swaps, feel: S.feel, workouts: S.mine, prefs: { units: U.metric ? "metric" : "imperial", examples: S.examples } });
// A change to your record: kept with your account a moment later (a few changes go as one), from the version this
// device had. Where another device has changed it meanwhile, the two are put together (each part this device changed
// its own, the days and workouts joined) and sent again.
let saveT = null;
function keep(...parts) { if (!S.me) return; for (const x of parts) S.dirty.add(x); clearTimeout(saveT); saveT = setTimeout(inStep, 700); }
async function inStep() {
  if (!S.me || !S.dirty.size || inStep.busy) return;
  inStep.busy = true;
  const dirty = new Set(S.dirty); S.dirty.clear();
  let again = 700;
  try {
    let mine = record(), r = await A.save(S.ver, mine), merged = false;
    for (let i = 0; r.conflict && i < 3; i++) {
      mine = A.merge(r.data, mine, dirty, S.inStepWorkouts); S.inStepWorkouts = A.workoutIds(r.data);
      adopt(mine); merged = true; r = await A.save(r.ver, mine);
    }
    if (r.conflict) throw new Error("Your changes didn’t save. Try again.");
    S.ver = r.ver; S.inStepWorkouts = A.workoutIds(r.data || mine);
    if (merged) redraw();
  } catch (e) {
    for (const x of dirty) S.dirty.add(x);
    if (e.status === 401) { inStep.busy = false; return signedOutHere(true); }
    toast(e.offline ? "You’re offline: your changes will be saved when you’re back" : e.message, true);
    again = e.offline ? 15000 : 30000;
  } finally { inStep.busy = false; }
  // (changes made while that was on its way, or that didn't go: next)
  if (S.dirty.size) { clearTimeout(saveT); saveT = setTimeout(inStep, again); }
}
function setActs() {
  S.acts = [...(S.examples ? D.history.map((x) => ({ ...x, sample: true })) : []), ...S.own].sort((a, b) => b.start - a.start);
}
const P = () => S.profile;
const signed = (v) => (Math.round(v) > 0 ? "+" : Math.round(v) < 0 ? "−" : "") + Math.abs(Math.round(v));
const runSpeed = () => 1000 / P().runPace, swimSpeed = () => 100 / P().css;
const paceFor = (sport) => (sport === "run" ? runSpeed() : sport === "swim" ? swimSpeed() : 4);
const allWorkouts = () => [...S.mine, ...WORKOUTS];
const wkById = (id) => S.mine.find((w) => w.id === id) || R.workoutOf(id, rh()?.targets);

// ---- Rhythm: the plan that never ends (rhythm.js), unless you've chosen an event's plan ----
const rhythmOn = () => !!S.rhythm && !S.chosen;
let rhCache = null;
function rh() {
  if (!rhythmOn()) return null;
  const acts = S.own.map((a) => ({ start: a.start, sport: a.sport, sum: sumOf(a) }));
  const key = JSON.stringify([S.rhythm, S.feel, S.swaps, P().ftp, P().runPace, P().css, acts.map((a) => [a.start, a.sum?.tss])]);
  if (rhCache?.key !== key) rhCache = { key, v: R.plan({ prefs: S.rhythm, acts, feel: S.feel, swaps: S.swaps, today: TODAY, ftp: P().ftp, paces: { run: runSpeed(), swim: swimSpeed() } }) };
  return rhCache.v;
}
const rhDay = (d) => rh()?.days.find((x) => x.date === d) || null;

// ---- the plan, as days ----
const myPlan = () => S.chosen || (S.examples && !S.rhythm ? { id: "sportive", start: D.start } : null);
const plan = () => (myPlan() ? PLANS.find((p) => p.id === myPlan().id) : null);
const planStart = () => myPlan()?.start ?? Infinity;
let weeksCache = null;
function weeks() {
  const c = myPlan();
  if (!c) return [];
  const key = c.id + c.start;
  if (weeksCache?.key !== key) weeksCache = { key, v: layOut(plan(), c.start) };
  return weeksCache.v;
}
// (a plan's chosen on a day: the days before it, in a plan that starts partway, aren't missed, as you weren't on it)
function choosePlan(c) { S.chosen = { ...c, at: TODAY }; S.swaps = {}; keep("plan", "swaps"); }
const missed = (day, wk) => (rhythmOn() ? !!rhDay(day)?.missed : wk && day < TODAY && day >= (myPlan()?.at ?? -Infinity) && !actsOn(day).length);
// what's planned on a day (a swap you've made, or the plan's): a workout id, "event", or null for rest
function plannedOn(day) {
  if (S.swaps[day] !== undefined) return S.swaps[day];
  if (rhythmOn()) { const r = rhDay(day); return r ? r.id : undefined; }
  for (const w of weeks()) for (const d of w.days) if (d.date === day) return d.id;
  return undefined;
}
const weekIndex = (day) => (myPlan() ? Math.floor((mondayOf(day) - mondayOf(planStart())) / (7 * DAY) + 0.01) : -1);
const actsOn = (day) => S.acts.filter((a) => startOfDay(a.start) === day);
const eventDay = () => weeks().at(-1)?.days.at(-1).date ?? null;

// ---- each ride's figures: worked out a few at a time once the page is up, newest first, and kept for next time ----
const sumKey = () => `${P().ftp}/${P().lthr}`;
const sumOf = (a) => S.sums.get(a.id);
// A ride's samples, the last few kept: a sample ride's made up afresh each time it's needed; one of yours read from its
// file (load), which comes from this device's copy of it, or the account's
const held = new Map();
const remember = (id, x) => { held.delete(id); held.set(id, x); if (held.size > 6) held.delete(held.keys().next().value); return x; };
function full(a) {
  if (held.has(a.id)) return held.get(a.id);
  return a.sample ? remember(a.id, samples(a, P())) : null;
}
const fileKey = (a) => `${S.me?.id}:${a.id}`;
async function load(a) {
  if (full(a)) return full(a);
  let bytes = await idb.get(fileKey(a)).catch(() => null);
  if (!bytes) { bytes = await A.fileOf(a.id); idb.put(fileKey(a), bytes).catch(() => {}); }
  const r = await F.readAny(a.file || `activity.${a.type}`, bytes);
  // (a file of several parts, a triathlon's: the part that's this one, by when it started)
  const x = r.activities.find((y) => Math.abs(y.start - a.start) < 2000) || r.activities[0];
  if (!x) throw new Error("That file has no activity in it any more.");
  Object.assign(x, { id: a.id, name: a.name });
  return remember(a.id, x);
}
function sumUp() {
  const cached = store.get("sums", null);
  if (cached?.key === sumKey() + "@" + TODAY) for (const [id, s] of Object.entries(cached.v)) S.sums.set(id, s);
  const todo = S.acts.filter((a) => a.sample && !S.sums.has(a.id));
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
// (your numbers changed: the example rides' figures worked out again, and yours from what they were worked out with)
function resum() {
  for (const id of [...S.sums.keys()]) if (id.startsWith("x")) S.sums.delete(id);
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  store.set("sums", null); sumUp();
}

// fitness, day by day, from every ride's stress
function fitnessSeries() {
  const daily = {};
  for (const a of S.acts) { const s = sumOf(a); if (s?.tss) daily[startOfDay(a.start)] = (daily[startOfDay(a.start)] || 0) + s.tss; }
  const first = Math.min(...S.acts.map((a) => a.start), TODAY - 120 * DAY);
  return fitness(daily, first, TODAY);
}

// ---- the page ----
const TABS = [["today", "Today", "today"], ["plan", "Plan", "plan"], ["activities", "Activities", "list"]];
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
  const views = { today: todayView, plan: planView, activities: activitiesView };
  const screen = h("div.screen" + (fresh ? ".in" : ""), {}, views[S.tab]());
  main.replaceChildren(screen);
  main.removeAttribute("aria-busy");
  document.title = { today: "Fitness", plan: "Plan · Fitness", workouts: "Workouts · Fitness", activities: "Activities · Fitness" }[S.tab];
}
// drawn again in place (what changed behind the scenes), keeping where you'd scrolled to; a sheet that's up stays as it
// is unless it's asked for too (what's in it is drawn afresh, charts and all)
function redraw(sheetToo = false) { const y = scrollY; render(false); scrollTo(0, y); if (sheetToo && sheetEl.open && Sheet.redraw) Sheet.redraw(); }
const head = (title, sub, ...right) => h("div.head", {}, h("div.t", {}, h("h1", { text: title }), sub && h("div.sub", { text: sub })), ...right,
  h("button.round.me", { type: "button", "aria-label": "You and settings", onclick: () => openSheet(settingsView) }, face()));
// you, as the account has you: your photo, or your initial
const face = () => (S.me?.photoAt ? h("img", { src: A.photoUrl(S.me.photoAt), alt: "", width: 44, height: 44 }) : (S.me?.name || "Y").trim().slice(0, 1).toUpperCase());
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
  if (S.examples) {
    out.push(h("div.note.glass", {}, h("span.ic", {}, icon("sparkle", 16, 2.2)), h("div", {},
      h("b", { text: "Example rides are on. " }), "They’re made up, for a rider five weeks into a sportive plan, so there’s something to see. Import your own from a Garmin or a Wahoo, then turn the examples off to see only yours.",
      h("div.gos", {}, h("button.go", { type: "button", onclick: chooseFiles }, "Import files"), h("button.go", { type: "button", onclick: () => setExamples(false) }, "Use only my rides")))));
  }
  const left = [], right = [];
  left.push(sessionCard(w, id, done));
  // (the best time to ride: Weather's, once Fitness has your place; till then, the examples' alone)
  if (S.examples && w && (w.sport === "ride" || w.sport === "run") && !done.length) left.push(weatherCard(w));
  right.push(formCard());
  right.push(weekCard());
  left.push(feelCard(w));
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
  if (!myPlan() && !rhythmOn()) {
    return h("div.card.hero.glass.session.rest", {}, h("span.sport", {}, h("i.s-ride", {}, icon("calendar", 14, 2.2)), "No plan yet"),
      h("h2", { text: "Fit all year, a day at a time" }),
      h("p.about", { text: "Rhythm decides each day’s session, or rest, from the days you ride, what you’ve done and how you feel. No event needed." }),
      h("div.acts", {}, h("button.pill.primary", { type: "button", onclick: () => rhythmSetup() }, "Set up Rhythm")));
  }
  const rd = rhythmOn() && S.swaps[TODAY] === undefined ? rhDay(TODAY) : null;
  if (!w && rd) {
    const next = [1, 2, 3].map((n) => rhDay(addDays(TODAY, n))).find((x) => x?.id), nw = next && wkById(next.id);
    return h("div.card.hero.glass.session.rest", {}, h("span.sport", {}, h("i.s-walk", {}, icon("heart", 14, 2.2)), "Rest day"),
      h("h2", { text: "Rest, and let it sink in" }), h("p.why", { text: rd.why }),
      nw && h("div.acts", {}, h("button.pill", { type: "button", onclick: () => openWorkout(nw) }, `${dayName(next.date)}: ${nw.name}`, icon("chev", 15, 2.4))));
  }
  if (!w && myPlan() && TODAY < planStart()) {
    const first = weeks()[0].days.find((d) => d.id), fw = first && wkById(first.id);
    return h("div.card.hero.glass.session.rest", {}, h("span.sport", {}, h("i.s-ride", {}, icon("calendar", 14, 2.2)), "New plan"),
      h("h2", { text: `${plan().name} starts ${planStart() - TODAY < 7 * DAY ? dayName(planStart()) : dayShort(planStart())}` }),
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
    rd ? h("p.why", {}, h("b", { text: "Why today: " }), rd.why) : h("p.about", { text: w.about }),
    rd && (rd.fuel || rd.strength) && h("div.extras", {},
      rd.fuel && h("span", {}, icon("bolt", 14, 2.2), `Fuel: ${rd.fuel}`),
      rd.strength && h("button.link.small", { type: "button", onclick: () => openWorkout(workoutById("strength-heavy")) }, icon("strength", 14, 2.2), "Then heavy strength, 20 minutes")),
    h("div.acts", {},
      w.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => openSheet(() => sendView(w)) }, icon("download", 17, 2.2), "Download"),
      h("button.pill", { type: "button", onclick: () => (rd ? openSheet(() => sessionView(TODAY), { tall: true }) : openWorkout(w)) }, "Details"),
      swapped && h("button.pill", { type: "button", onclick: () => { delete S.swaps[TODAY]; keep("swaps"); redraw(); } }, "Undo swap")));
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
  if (!S.acts.some((a) => sumOf(a)?.tss)) return card(null, "Fitness and form", h("p.line-said", { text: "Your fitness, fatigue and form come from your rides’ training stress, day by day. Import a few weeks of rides to see them; the more, the truer." }),
    h("div.acts", { vars: { "margin-top": "12px" } }, h("button.pill", { type: "button", onclick: chooseFiles }, icon("inbox", 17, 2.1), "Import rides")));
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
      h("span", { text: rhythmOn() ? rhythmSaid() : !myPlan() ? "No plan" : TODAY < planStart() ? `Starts ${dayShort(planStart())}` : weekIndex(TODAY) >= weeks().length ? "Plan done" : `Week ${weekIndex(TODAY) + 1} of ${plan().weeks} · ${weeks()[weekIndex(TODAY)].phase}` })));
}
// How you feel: sleep, legs and mood, said in a tap each, and what to do about it with your form. Tired legs on a hard
// day: an easier session, swapped in with a tap (and back again).
function feelCard(w) {
  const f = S.feel[TODAY] || {}, done = ["sleep", "legs", "mood"].every((k) => f[k] != null);
  // (not yet today: a check-in, a tap away; with Rhythm it's asked as the app opens, once a day)
  if (!done) return h("div.card.glass.checkin", {}, h("div", {}, h("b", { text: "How are you today?" }), h("small", { text: rhythmOn() ? "Three taps. Today’s session, and the next days, follow what you say." : "Three taps: sleep, legs and motivation." })),
    h("button.pill.primary", { type: "button", onclick: () => openCheckIn() }, "Check in"));
  // (each answer a chip: its icon, its words, and its tone: amber for a poor one, green for a good one)
  const chips = [["sleep", "contrast", ["Slept poorly", "Slept OK", "Slept well"]], ["legs", "run", ["Heavy legs", "Normal legs", "Fresh legs"]], ["mood", "bolt", ["Low motivation", "Motivation OK", "Motivated"]]]
    .map(([k, ic, xs]) => h("span.chip.tone-" + ["low", "mid", "high"][f[k]], {}, icon(ic, 14, 2.2), xs[f[k]]));
  const rd = rhythmOn() ? rhDay(TODAY) : null, tm = rhythmOn() ? rhDay(addDays(TODAY, 1)) : null;
  let verdict;
  if (rd) {
    const eased = rd.feel !== "good", carry = tm && /yesterday/.test(tm.why || "");
    verdict = !eased && !carry ? ["green", "check", "Ready for it", rd.id ? "Today’s session stands." : "Enjoy the rest day."]
      : ["amber", "swap", eased ? "Rhythm has eased today" : "Tomorrow eased", [eased && rd.why, carry && `Tomorrow: ${tm.why.charAt(0).toLowerCase()}${tm.why.slice(1)}.`].filter(Boolean).join(". ")];
  } else {
    const score = f.sleep + f.legs + f.mood, hard = w && measure(w).iF > 0.8;
    verdict = score <= 2 && hard ? ["amber", "swap", "Take it easy today", `${w.name} would cost more than it gives today.`] : ["green", "check", score >= 5 ? "Ready for it" : "Good to go", w ? `${w.name} as planned.` : "Ride as you feel."];
  }
  return h("div.card.glass.checkin.done", {},
    h("div.checkin-top", {}, h("span.ic." + verdict[0], {}, icon(verdict[1], 18, 2.4)), h("div.tx", {}, h("b", { text: verdict[2] }), h("small", { text: verdict[3] })),
      h("button.pill.small", { type: "button", onclick: () => openCheckIn(), "aria-label": "Change how you are today" }, "Change")),
    h("div.checkin-chips", {}, chips));
}
// The day's check-in: sleep, legs and motivation, a tap each; with Rhythm, today and the days after follow it
function openCheckIn() {
  const f = { ...(S.feel[TODAY] || {}) };
  try { localStorage.setItem("fitness:asked", String(TODAY)); } catch (_) {}
  const before = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
  const view = () => {
    const seg = (k, opts) => { const at = opts.findIndex(([v]) => v === f[k]);
      return h("div.seg" + (at < 0 ? ".none" : ""), { vars: { "--n": opts.length, "--at": Math.max(0, at) }, role: "group", "aria-label": k },
        opts.map(([v, label]) => h("button", { type: "button", "aria-pressed": String(f[k] === v), onclick: () => { f[k] = v; Sheet.redraw(); } }, label))); };
    const all = ["sleep", "legs", "mood"].every((k) => f[k] != null);
    const save = () => {
      S.feel[TODAY] = { ...f }; keep("feel"); closeSheet(); redraw();
      const after = rhythmOn() ? JSON.stringify([rhDay(TODAY)?.id, rhDay(addDays(TODAY, 1))?.id]) : null;
      toast(before && after !== before ? "Rhythm has changed your plan to suit" : "Thanks: today stands");
    };
    return { title: dayLong(TODAY), right: h("button.link.r", { type: "button", onclick: closeSheet }, "Not now"), body: [
      h("div.sheet-top", {}, h("h1", { text: "How are you today?" }), h("div.sub", { text: rhythmOn() ? "Today’s session, and the next days, follow what you say." : "So today’s riding suits how you are." })),
      h("div.checkin-q", {}, h("b", { text: "How did you sleep?" }), seg("sleep", [[0, "Poorly"], [1, "OK"], [2, "Well"]])),
      h("div.checkin-q", {}, h("b", { text: "How are your legs?" }), seg("legs", [[0, "Heavy"], [1, "Normal"], [2, "Fresh"]])),
      h("div.checkin-q", {}, h("b", { text: "How motivated are you?" }), seg("mood", [[0, "Low"], [1, "OK"], [2, "High"]])),
      h("button.btn", { type: "button", disabled: !all, onclick: save }, "Done")] };
  };
  openSheet(view);
}
// (asked once a day, as the app opens or comes back, while you're on Rhythm and haven't said)
function askToday() {
  if (!rhythmOn() || S.feel[TODAY] || sheetEl.open) return;
  try { if (localStorage.getItem("fitness:asked") === String(TODAY)) return; } catch (_) {}
  setTimeout(() => { if (!sheetEl.open && !S.feel[TODAY]) openCheckIn(); }, 700);
}

// ---- Plan ----
function planView() {
  if (rhythmOn()) return rhythmView();
  if (!myPlan()) return noPlanView();
  const p = plan(), ws = weeks(), now = Math.max(0, Math.min(ws.length - 1, weekIndex(TODAY))), ev = eventDay(), left = Math.round((ev - TODAY) / DAY);
  const planWeekTss = ws.map((w) => ({ phase: w.phase, tss: w.days.reduce((a, d) => a + (d.id && d.id !== "event" ? measure(wkById(d.id), paceFor(wkById(d.id).sport)).tss : 0), 0) }));
  const doneWeek = ws.map((w) => w.days.reduce((a, d) => a + actsOn(d.date).reduce((x, act) => x + (sumOf(act)?.tss || 0), 0), 0));
  const phaseCls = { Base: "z2", Build: "z4", Peak: "z5", Taper: "z3" };
  const out = [head("Plan", TODAY < planStart() ? `${p.name} · starts ${dayShort(planStart())}` : `${p.name} · week ${now + 1} of ${p.weeks}`)];
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
      did.length ? h("span.badge", {}, "Done") : missed(d.date, wk) ? h("span.badge.plan", {}, "Missed") : null);
  });
  const started = TODAY >= planStart(), wkName = (i) => (started ? (i === now ? "This week" : "Next week") : `Week ${i + 1}`);
  out.push(section([`${wkName(now)} · ${ws[now].phase}${ws[now].recovery ? " (easier)" : ""}`, h("span.aside", { text: `${dateShort(ws[now].days[0].date)} – ${dateShort(ws[now].days[6].date)}` })],
    h("div.group.glass", {}, dayRows(ws[now])),
    h("p.foot", {}, "Tap a day for its workout. Workouts go to your Garmin or Wahoo from there, or all of this week's at once below.")));
  if (ws[now + 1]) out.push(section([`${wkName(now + 1)} · ${ws[now + 1].phase}${ws[now + 1].recovery ? " (easier)" : ""}`, h("span.aside", { text: `${dateShort(ws[now + 1].days[0].date)} – ${dateShort(ws[now + 1].days[6].date)}` })], h("div.group.glass", {}, dayRows(ws[now + 1]))));
  out.push(section("This week’s files", h("div.group.glass", {},
    row({ icon: "zip", tint: "coral", title: started ? "Send this week’s workouts" : "Send week 1’s workouts", sub: "One zip: a FIT file for each, for your Garmin or Wahoo", onclick: () => weekZip(ws[now]) }),
    row({ icon: "calendar", tint: "red", title: "Add to your calendar", sub: "This week and next as events (.ics), with each workout in its notes", onclick: () => calendar([ws[now], ws[now + 1]].filter(Boolean)) }))));
  out.push(plansList(p.id));
  if (S.chosen) out.push(section(null, h("div.group.glass", {}, h("button.row.action.danger", { type: "button", onclick: () => { S.chosen = null; S.swaps = {}; keep("plan", "swaps"); toast(S.rhythm ? "Back to Rhythm" : "Plan stopped"); redraw(); } }, S.rhythm ? "Stop, and go back to Rhythm" : "Stop this plan"))));
  if (!S.rhythm) out.push(section(null, h("div.group.glass", {}, row({ icon: "calendar", tint: "blue", title: "Switch to Rhythm", sub: "No event: a session or rest each day, all year", onclick: () => rhythmSetup() }))));
  return out;
}
const plansList = (current) => section("Plans", h("div.group.glass", {}, PLANS.map((x) => row({ icon: x.sport === "run" ? "run" : x.sport === "multi" ? "swim" : "ride", tint: x.id === current ? "coral" : "grey",
  title: x.name, sub: `${x.weeks} weeks · ${x.phases.map(([n]) => n).join(", ")}`, value: x.id === current ? "Yours" : null, onclick: () => openSheet(() => planSheet(x)) }))));
// no plan yet: Rhythm
function noPlanView() {
  // (an example week, drawn: what Rhythm gives you, before the words)
  const wk = [[0, "z1"], [44, "z4"], [30, "z2"], [40, "z6"], [0, "z1"], [62, "z2"], [36, "z2"]];
  const feature = (ic, tint, b, t) => h("div.rh-feat", {}, h("span.ic." + tint, {}, icon(ic, 16, 2.2)), h("div", {}, h("b", { text: b }), h("span", { text: t })));
  return [head("Plan", "Rhythm · not set up"),
    h("div.card.hero.glass.rhythm-intro", {},
      h("div.rh-brand", {}, h("span.tile.s-ride", {}, icon("wave", 18, 2.2)), h("span", { text: "Rhythm" })),
      h("h2", { text: "A session or rest, decided each morning" }),
      h("div.rh-example", { "aria-label": "An example week" },
        h("div.rh-ex-head", {}, h("span", { text: "A week, for example" }), h("span", { text: "6 h 30" })),
        h("div.rh-ex-bars", {}, wk.map(([v, z], i) => h("div", {}, h("i.bg-" + z + (v ? "" : ".rest"), { vars: { "--h": Math.max(6, v) + "px" } }), h("small", { text: "MTWTFSS"[i] })))),
        h("div.rh-ex-key", {}, [["z2", "Easy"], ["z4", "Threshold"], ["z6", "VO₂ max"], ["z1", "Rest"]].map(([z, l]) => h("span", {}, h("i.bg-" + z), l)))),
      feature("today", "blue", "Fits your week", "The days you ride, and for how long."),
      feature("heart", "green", "Listens to you", "Slept badly? Today gets easier, not shorter."),
      feature("swap", "indigo", "Never goes stale", "Four-week blocks, a lighter week every fourth."),
      h("button.btn", { type: "button", onclick: () => rhythmSetup() }, "Set up Rhythm"),
      h("p.rh-note", { text: "Four questions, about a minute" }))];
}
// ---- Rhythm, on the Plan tab: where you are in the block, the days ahead, and your week ----
const rhythmSaid = () => { const b = rh().block; return `${R.THEMES[b.theme]} block · ${b.absorb ? "lighter week" : `week ${b.week + 1} of 4`}`; };
function rhythmView() {
  const r = rh(), b = r.block, prefs = { ...R.DEFAULTS, ...S.rhythm }, mon = mondayOf(TODAY), from = S.rhythm.at ?? S.rhythm.start ?? mon;
  const out = [head("Plan", rhythmSaid())];
  // this week at a glance: a circle a day (ridden, rested, today, missed, or what's planned), and how it's balanced
  const wk = r.days.filter((d) => mondayOf(d.date) === mon);
  const dot = (d) => {
    const did = actsOn(d.date).length > 0;
    if (d.date < from && !did) return ["pre", null];
    if (did) return ["done", icon("check", 14, 3)];
    if (d.date === TODAY) return ["today", h("i")];
    if (d.missed) return ["missed", h("i")];
    return d.id ? ["plan" + (d.hard ? ".hard" : ""), h("i")] : ["rest", "–"];
  };
  const doneMins = wk.reduce((a, d) => a + actsOn(d.date).reduce((x, act) => x + (sumOf(act)?.moving || 0) / 60, 0), 0);
  // (the week's whole time: what's planned from when Rhythm began, and what you rode before it)
  const rode = (d) => actsOn(d.date).reduce((x, act) => x + (sumOf(act)?.moving || 0) / 60, 0);
  const planMins = wk.reduce((a, d) => a + (d.date >= from ? d.mins : rode(d)), 0);
  const hardMins = wk.filter((d) => d.date >= from && d.hard).reduce((a, d) => a + Math.min(d.mins, 60) * 0.55, 0), easy = planMins ? Math.round(100 * (1 - hardMins / planMins)) : 100;
  out.push(h("div.card.glass.rh-week", {},
    h("div.rh-week-head", {}, h("b", { text: "This week" }), h("span", {}, h("b", { text: dur(doneMins * 60) }), ` of ${dur(planMins * 60)} done`)),
    h("div.rh-circles", {}, wk.map((d) => { const [cls, inner] = dot(d); return h("button" + (d.date === TODAY ? ".is-today" : ""), { type: "button", onclick: () => openDay(d.date), "aria-label": `${dayLong(d.date)}: ${cls === "done" ? "done" : d.id ? wkById(d.id)?.name : "rest"}` },
      h("small", { text: d.date === TODAY ? "TODAY" : dayName(d.date).slice(0, 3).toUpperCase() }), h("span.c." + cls.replace(".", "."), {}, inner), h("small.n", { text: new Date(d.date).getDate() })); })),
    h("div.rh-balance", {}, h("div.bar", { role: "img", "aria-label": `${easy}% easy, ${100 - easy}% hard this week` }, h("i.easy", { vars: { "--w": easy + "%" } }), h("i.hard", { vars: { "--w": 100 - easy + "%" } })))));
  // today, first
  const td = rhDay(TODAY), tw = td?.id ? wkById(S.swaps[TODAY] !== undefined ? S.swaps[TODAY] : td.id) : null, tdone = actsOn(TODAY);
  if (tdone.length) out.push(h("button.card.glass.rh-today.done", { type: "button", onclick: () => openAct(tdone[0]) }, h("span.rh-chip", {}, icon("check", 13, 3), "Today · done"), h("h2", { text: tdone[0].name }), h("p", { text: "Nice work. Tomorrow’s plan takes it in." })));
  else if (tw) {
    const m = measure(tw, paceFor(tw.sport));
    out.push(h("div.card.glass.rh-today", {},
      h("div.rh-today-top", {}, h("span.rh-chip", {}, sportTile(tw.sport, true), `Today · ${tw.kind}`), h("span", { text: `${dur(m.secs)}${tw.sport !== "strength" ? ` · TSS ${Math.round(m.tss)}` : ""}` })),
      h("h2", { text: tw.name }),
      h("div.profile", {}, C.profile(tw, { ftp: tw.sport === "ride" ? P().ftp : null, pace: paceFor(tw.sport), label: `${tw.name}, step by step`, W: cardW(true) })),
      h("p", { text: td.why }),
      (td.fuel || td.strength) && h("div.extras", {}, td.fuel && h("span", {}, icon("bolt", 14, 2.2), `Eat ${td.fuel}`), td.strength && h("span", {}, icon("strength", 14, 2.2), "Then 20 min strength")),
      h("div.acts", {}, tw.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => openSheet(() => sendView(tw, TODAY)) }, "Download"), h("button.pill", { type: "button", onclick: () => openSheet(() => sessionView(TODAY), { tall: true }) }, "Details"), h("button.pill", { type: "button", onclick: () => openDay(TODAY) }, "Change"))));
  } else out.push(h("button.card.glass.rh-today.rest", { type: "button", onclick: () => openDay(TODAY) }, h("span.rh-chip", {}, icon("heart", 13, 2.4), "Today · rest"), h("h2", { text: "Rest, and let it sink in" }), h("p", { text: td?.why || "Fitness is built while you recover." })));
  // coming up: three days, the rest of the week ahead a tap away
  const ahead = r.days.filter((d) => d.date > TODAY), shown = S.planMore ? ahead : ahead.slice(0, 3);
  const rowOf = (d) => { const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id ? wkById(id) : null;
    return h("button.row", { type: "button", onclick: () => openDay(d.date) }, h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: dayName(d.date).slice(0, 3) })),
      h("span.tx", {}, h("b", { text: w ? `${w.name}${d.strength ? " + strength" : ""}` : "Rest" }), h("small", { text: w ? `${dur(d.mins * 60)} · ${d.hard ? "hard" : "easy"}${d.moved ? " · rest day moved" : ""}` : d.why })),
      w && h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) }))); };
  out.push(section(["Coming up", h("span.aside", { text: "Firms up each morning" })], h("div.group.glass", {}, shown.map(rowOf),
    ahead.length > 3 && h("button.row.action", { type: "button", onclick: () => { S.planMore = !S.planMore; redraw(); } }, S.planMore ? "Show fewer" : `Show the next ${ahead.length - 3} days`))));
  // where it's heading: the block's four weeks, and your fitness, with the week ahead as planned
  const line = r.line, lo = Math.min(...line.map((x) => x.ctl)), hi = Math.max(...line.map((x) => x.ctl)), span = Math.max(8, hi - lo), W = 320, H = 70;
  const pt = (x, i) => `${((i / (line.length - 1)) * W).toFixed(1)},${(H - 6 - ((x.ctl - lo) / span) * (H - 16)).toFixed(1)}`;
  const past = line.filter((x) => !x.future), cut = past.length - 1;
  const chart = svgOf(`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Your fitness, the last four weeks and the week ahead"><line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" class="rh-axis"/><polyline class="rh-line up" points="${past.map(pt).join(" ")}"/><polyline class="rh-line up ahead" points="${line.slice(cut).map((x, i) => pt(x, i + cut)).join(" ")}"/><circle cx="${pt(line[cut], cut).split(",")[0]}" cy="${pt(line[cut], cut).split(",")[1]}" r="4" class="rh-now"/></svg>`);
  const ramp = Math.max(1.5, 4.5 - r.ctl / 40);
  out.push(h("div.card.glass.rh-heading", {}, h("div.rh-week-head", {}, h("b", { text: "Where it’s heading" }), h("span", { text: prefs.mode === "hold" ? "Holding" : "Building" })),
    h("div.rb-weeks", {}, [0, 1, 2, 3].map((i) => h("div.rb-week" + (i === b.week ? ".now" : "") + (i < b.week ? ".past" : ""), {}, h("i.bg-" + (i === 3 ? "z1" : { aerobic: "z2", threshold: "z4", topend: "z6" }[b.theme])), h("small", { text: i === b.week ? "This week" : i === 3 ? "Lighter" : `Week ${i + 1}` })))),
    chart,
    h("p.line-said", { text: `${prefs.mode === "hold" ? "Holding your fitness where it is" : b.absorb ? "A lighter week, so the work sinks in" : `Up about ${Math.round(ramp)} points a week, then a lighter week so it sinks in`}. ${{ aerobic: "Steady riding and tempo first.", threshold: "Sweet spot and threshold now.", topend: "VO₂ max and sprints now." }[b.theme]}` })));
  const nd = prefs.days.filter((x) => x > 0).length, hrs = prefs.days.reduce((a, x) => a + x, 0);
  out.push(section(null, h("div.group.glass", {},
    row({ icon: "calendar", tint: "blue", title: "Your week", sub: `${plural(nd, "day")}, ${dur(hrs * 60)}${prefs.run ? ", a run" : ""}${prefs.swim ? ", a swim" : ""}`, onclick: () => rhythmSetup() }))));
  return out;
}
// A day's session in full: its shape, every step in order with the clock, the watts and how it should feel, time in
// each zone, when to eat, what follows it, and why it's today
const CUES = { warmup: "Spin up gradually; nothing hard yet.", cooldown: "Ease right off and spin the legs out.", rest: "Spin easy and let your breathing settle.",
  z1: "Very easy: barely pressing on the pedals.", z2: "Conversational: you could talk in full sentences.", z3: "Comfortably hard: steady pressure, breathing deep.",
  z4: "Hard but steady: a few words at a time. Even, not heroic.", z5: "As hard as you can hold for the whole effort. Breathing hard.", z6: "Very hard and short: everything but a sprint.", z7: "All out, from a rolling start." };
function sessionView(day) {
  const d = rhDay(day), id = S.swaps[day] !== undefined ? S.swaps[day] : d?.id, w = id ? wkById(id) : null;
  if (!w) return rhDayView(day);
  const m = measure(w, paceFor(w.sport)), ftp = P().ftp, ride = w.sport === "ride", steps = flatten(w, paceFor(w.sport));
  const clk = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
  const watts = (x) => (x.from === x.to ? `${Math.round(x.from * ftp)} W` : `${Math.round(x.from * ftp)}–${Math.round(x.to * ftp)} W`);
  const zOf = (x) => (x.kind === "free" ? ZONES[1] : zoneOf((x.from + x.to) / 2));
  // (repeats said as "Effort 2 of 3"; each step with the clock it starts at)
  let t = 0;
  const rows = steps.map((x) => {
    const z = zOf(x), at = t; t += x.secs;
    const name = x.rep && x.kind === "work" ? `${x.name || "Effort"} ${x.rep[0]} of ${x.rep[1]}` : x.name || { warmup: "Warm up", cooldown: "Cool down", rest: "Easy", steady: "Steady" }[x.kind] || "Effort";
    const cue = ["warmup", "cooldown", "rest"].includes(x.kind) ? CUES[x.kind] : CUES[z.c];
    return h("div.ss-step", {}, h("span.ss-at", { text: clk(at) }), h("i.bg-" + z.c),
      h("div.ss-tx", {}, h("b", { text: name }), h("small", { text: [stepLen(x), ride ? `Z${z.n} ${z.name}` : null, x.cad ? `${x.cad[0]}–${x.cad[1]} rpm` : null].filter(Boolean).join(" · ") }), cue && h("small.cue", { text: x.note || cue })),
      h("span.ss-w", { text: ride && x.kind !== "free" ? watts(x) : "" }));
  });
  // (the same steps again, merged where one follows another at the same effort, for long steady rides)
  const zsecs = ZONES.map(() => 0); for (const x of steps) zsecs[zOf(x).n - 1] += x.secs;
  const g = /(\d+)(?:–(\d+))? g/.exec(d?.fuel || ""), perHour = g ? (+g[1] + +(g[2] || g[1])) / 2 : 0;
  const feeds = [];
  if (perHour) for (let at = 20 * 60; at < m.secs - 10 * 60; at += 20 * 60) feeds.push(at);
  const each = perHour ? Math.round(perHour / 3 / 5) * 5 : 0;
  return { title: dayLong(day), body: [
    h("div.sheet-top", {}, h("div.sub", {}, sportTile(w.sport, true), kindSaid(w)), h("h1", { text: w.name }),
      h("div.sub.num", { text: [dur(m.secs), w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null, ride ? `IF ${m.iF.toFixed(2)}` : null, ride ? `${Math.round((m.avg * ftp * m.secs) / 1000)} kJ` : null].filter(Boolean).join(" · ") })),
    card(null, ride ? `Power, at your FTP of ${ftp} W` : "Effort", C.profile(w, { ftp: ride ? ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: sheetW() })),
    d && h("div.rh-why", {}, h("b", { text: "Why today: " }), S.swaps[day] !== undefined ? "you changed this day." : d.why),
    w.about && h("p", { text: w.about }),
    section("Step by step", h("div.card.glass.ss-steps", {}, rows)),
    ride && section("Time in each zone", card(null, null, zoneBars(zsecs, ZONES.map((z) => z.name), ZONES.map((z) => z.c)))),
    perHour > 0 && section("Eating and drinking", h("div.card.glass.ss-fuel", {},
      h("p", {}, h("b", { text: `About ${Math.round(perHour)} g of carbs an hour` }), `, ${Math.round((perHour * m.secs) / 3600)} g in all: ${each} g every 20 minutes (a gel is about 25 g, a bar 40). A bottle an hour, more if it’s warm.`),
      h("div.ss-feeds", {}, feeds.map((at) => h("span", {}, h("b", { text: clk(at) }), `${each} g`))))),
    !perHour && ride && h("p.rh-note", { text: "Under 75 minutes: water is enough." }),
    d?.strength && section("Afterwards", h("div.group.glass", {}, row({ icon: "strength", tint: "indigo", title: "Heavy strength, 20 minutes", sub: "Squats, Romanian deadlifts and step-ups: heavy, few, never to failure", onclick: () => pushSheet(() => workoutView(workoutById("strength-heavy"))) }))),
    h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => pushSheet(() => sendView(w, day)) }, "Download"), day >= TODAY && h("button.btn.quiet", { type: "button", onclick: () => pushSheet(() => rhDayView(day)) }, "Change")),
  ] };
}
// A day of Rhythm's: the session in plain terms, why, and what to do when it isn't the day for it
function rhDayView(day) {
  const d = rhDay(day), id = S.swaps[day] !== undefined ? S.swaps[day] : d?.id, w = id ? wkById(id) : null, future = day >= TODAY;
  const watts = (() => { if (!w || w.sport !== "ride") return null; const xs = flatten(w).filter((x) => x.kind === "work").map((x) => Math.round(x.from * P().ftp)); return xs.length ? `${Math.min(...xs)}${Math.max(...xs) !== Math.min(...xs) ? `–${Math.max(...xs)}` : ""} W` : null; })();
  const set = (v, said) => { if (v === undefined) delete S.swaps[day]; else S.swaps[day] = v; keep("swaps"); closeSheet(); toast(said); redraw(); };
  const tomorrow = addDays(day, 1), tm = rhDay(tomorrow);
  const opt = (ic, tint, t, sub, fn) => row({ icon: ic, tint, title: t, sub, onclick: fn });
  const mins = d?.mins || 60, kind = /^rh:([a-z0-9]+):/.exec(id || "")?.[1];
  return { title: dayLong(day), body: [
    h("div.sheet-top", {}, h("h1", { text: w ? w.name : "Rest" }), h("div.sub", { text: w ? [dur(measure(w, paceFor(w.sport)).secs), watts && `efforts at ${watts}`].filter(Boolean).join(" · ") : "Recover" })),
    d && h("div.rh-why", {}, h("b", { text: "Why: " }), S.swaps[day] !== undefined ? "you changed this day." : d.why),
    w && d?.fuel && h("p.rh-note", { text: `Eat ${d.fuel}${d.strength ? ", then 20 minutes of heavy strength" : ""}.` }),
    future && w && section("Not the day for it?", h("div.group", {},
      mins > 50 && opt("today", "blue", "Short on time", kind && kind !== "endurance" && kind !== "long" ? `The same work in ${dur(Math.max(50, mins - 30) * 60)}` : `${dur(Math.max(40, Math.round(mins / 2 / 5) * 5) * 60)} instead`, () => set(kind ? `rh:${kind}:${kind === "endurance" || kind === "long" ? Math.max(40, Math.round(mins / 2 / 5) * 5) : Math.max(50, mins - 30)}` : "recovery-45", "Shorter, same purpose")),
      d?.hard && opt("gauge", "green", "Make it easier", "Steady all the way, no hard efforts", () => set(`rh:endurance:${Math.min(mins, 90)}`, "Easier today")),
      tm && opt("swap", "indigo", "Swap with tomorrow", `${tm.id ? (wkById(tm.id)?.name || "Tomorrow’s") : "Rest"} today, this on ${dayName(tomorrow)}`, () => { S.swaps[day] = tm.id ?? null; S.swaps[tomorrow] = id; keep("swaps"); closeSheet(); toast("Swapped"); redraw(); }),
      opt("heart", "grey", "Rest today", "Rhythm makes up for it later in the week", () => set(null, "Rest today")))),
    S.swaps[day] !== undefined && future && h("button.btn.quiet", { type: "button", onclick: () => set(undefined, "Back to Rhythm’s plan") }, "Undo the change"),
    w && h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => pushSheet(() => sendView(w, day)) }, "Download"), h("button.btn.quiet", { type: "button", onclick: () => pushSheet(() => sessionView(day)) }, "Details")),
  ] };
}
// Setting Rhythm up (or changing it): four short steps, each a page of the sheet (Back pops it): when you ride, how you
// like to ride, build or hold, and the first week it gives you before anything's kept
function rhythmSetup() {
  const editing = !!S.rhythm, draft = { ...R.DEFAULTS, ...(S.rhythm || {}) };
  draft.days = [...draft.days];
  const cancel = () => h("button.link.r", { type: "button", onclick: closeSheet }, "Cancel");
  // (little of your own riding to go by: a step asking where you've been, so Rhythm starts there)
  const needLevel = R.sparse(S.own.map((a) => ({ start: a.start })), TODAY), N = needLevel ? 5 : 4, at = (n) => (needLevel && n > 1 ? n + 1 : n);
  const dots = (n) => h("div.rh-dots", { "aria-label": `Step ${n} of ${N}` }, Array.from({ length: N }, (_, i) => h("i" + (i + 1 === n ? ".now" : i + 1 < n ? ".done" : ""))));
  const top = (n, title, sub) => [dots(at(n)), h("div.sheet-top", {}, h("h1", { text: title }), sub && h("div.sub", { text: sub }))];
  const next = (label, view) => h("button.btn.rh-next", { type: "button", onclick: () => pushSheet(view) }, label);
  // 1. When you ride: a bar a day, dragged up to how long you have (to 6 hours, by quarter hours); a tap makes it rest
  // (said short, so a day's label fits over its bar: 45m, 1h, 1h45)
  const MAX = 360, said = (v) => (!v ? "Rest" : v < 60 ? `${v}m` : `${Math.floor(v / 60)}h${v % 60 ? String(v % 60).padStart(2, "0") : ""}`);
  const days = () => {
    const total = h("b"), count = h("span");
    const sum = () => { const n = draft.days.filter((x) => x).length; total.textContent = n ? dur(draft.days.reduce((a, x) => a + x, 0) * 60) : "No days yet"; count.textContent = `${plural(n, "day")} · ${plural(7 - n, "rest")}`; };
    const cols = draft.days.map((v, i) => {
      const label = h("span.v", { text: said(v) }), bar = h("i"), track = h("div.track", {}, bar);
      const paint = () => { const x = draft.days[i]; bar.className = x ? "" : "rest"; bar.style.setProperty("--h", (x ? Math.max(8, (x / MAX) * 100) : 4) + "%"); label.textContent = said(x); track.setAttribute("aria-valuenow", x); track.setAttribute("aria-valuetext", said(x)); sum(); };
      const at = (e) => { const r = track.getBoundingClientRect(), f = 1 - (e.clientY - r.top) / r.height, m = Math.round((f * MAX) / 15) * 15; return m < 30 ? 0 : Math.min(MAX, m); };
      let down = null;
      track.addEventListener("pointerdown", (e) => { down = { y: e.clientY, moved: false }; track.setPointerCapture(e.pointerId); e.preventDefault(); });
      track.addEventListener("pointermove", (e) => { if (!down) return; if (Math.abs(e.clientY - down.y) > 4) down.moved = true; if (down.moved) { draft.days[i] = at(e); paint(); } });
      track.addEventListener("pointerup", () => { if (down && !down.moved) { draft.days[i] = draft.days[i] ? 0 : (S.rhythm?.days?.[i] || 60); paint(); } down = null; });
      track.addEventListener("keydown", (e) => { const d = { ArrowUp: 15, ArrowRight: 15, ArrowDown: -15, ArrowLeft: -15 }[e.key]; if (d) { e.preventDefault(); draft.days[i] = Math.max(0, Math.min(MAX, draft.days[i] + d)); if (draft.days[i] && draft.days[i] < 30) draft.days[i] = d > 0 ? 30 : 0; paint(); } });
      Object.assign(track, { tabIndex: 0 }); track.setAttribute("role", "slider"); track.setAttribute("aria-label", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]); track.setAttribute("aria-valuemin", 0); track.setAttribute("aria-valuemax", MAX);
      setTimeout(paint);
      return h("div.rh-day", {}, label, track, h("small", { text: "MTWTFSS"[i] }));
    });
    const preset = (name, v) => h("button.pill.small", { type: "button", onclick: () => { draft.days = [...v]; Sheet.redraw(); } }, name);
    setTimeout(sum);
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top(1, "When do you ride?", "Drag each day up to how long you usually have. Tap a day to make it a rest day."),
      h("div.card.rh-days", {}, h("div.rh-sum", {}, total, count), h("div.rh-bars", {}, cols)),
      section("Or start from", h("div.rh-presets", {}, preset("Evenings and weekends", [0, 60, 60, 60, 0, 150, 90]), preset("Weekends only", [0, 0, 0, 0, 0, 180, 150]), preset("Most days", [45, 75, 60, 75, 0, 180, 120]))),
      h("button.btn.rh-next", { type: "button", onclick: () => (draft.days.some((x) => x) ? pushSheet(needLevel ? level : style) : toast("Choose at least one day to ride", true)) }, "Next")] };
  };
  // 1b. Where you've been riding lately (only with less than a month of your own rides to go by)
  const level = () => {
    if (!draft.level) draft.level = "some";
    const opt = (k, t, sub) => h("button.rh-choice" + (draft.level === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.level === k), onclick: () => { draft.level = k; Sheet.redraw(); } },
      h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })), h("span.tick", {}, draft.level === k ? icon("check", 13, 3.2) : null));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [dots(2), h("div.sheet-top", {}, h("h1", { text: "How much have you been riding?" }),
      h("div.sub", { text: `The last month or so. ${S.own.length ? `You’ve uploaded ${plural(S.own.length, "ride")}, so` : "With no rides uploaded yet,"} Rhythm starts from this, and learns from every ride you add.` })),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Riding lately" },
        opt("none", "Hardly at all", "Starting again, or new to it"), opt("some", "A ride or two a week", "About 2 to 4 hours"), opt("regular", "Most weeks, regularly", "About 5 to 8 hours"), opt("lots", "A lot", "9 hours or more")),
      next("Next", style)] };
  };
  // 2. How you like to ride, and a run and a swim
  const pic = (bars) => h("span.rh-pic", { "aria-hidden": "true" }, bars.map(([v, z]) => h("i.bg-" + z, { vars: { "--h": v + "%" } })));
  const style = () => {
    const choice = (k, title, sub, bars) => h("button.rh-choice" + (draft.lean === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.lean === k), onclick: () => { draft.lean = k; Sheet.redraw(); } },
      pic(bars), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })), h("span.tick", {}, draft.lean === k ? icon("check", 13, 3.2) : null));
    const tile = (k, ic, title) => h("button.rh-tile" + (draft[k] ? ".on." + k : ""), { type: "button", "aria-pressed": String(!!draft[k]), onclick: () => { draft[k] = !draft[k]; Sheet.redraw(); } },
      h("span.ic", {}, icon(ic, 18, 2)), h("b", { text: title }), h("small", { text: draft[k] ? "On" : "Off" }));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top(2, "How do you like to ride?", "Rhythm keeps every kind of effort sharp; this is where it leans."),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Lean towards" },
        choice("balanced", "Balanced", "A bit of everything, all year", [[45, "z2"], [75, "z4"], [45, "z2"], [85, "z6"], [55, "z2"], [65, "z3"]]),
        choice("endurance", "Long days", "Sportives, hills, all-day rides", [[55, "z2"], [65, "z3"], [55, "z2"], [65, "z4"], [95, "z2"], [95, "z2"]]),
        choice("punch", "Punchy rides", "Group rides, short climbs, sprints", [[45, "z2"], [90, "z6"], [45, "z2"], [100, "z7"], [45, "z2"], [80, "z6"]])),
      section("Alongside riding", h("div.rh-tiles", {}, tile("run", "run", "A run a week"), tile("swim", "swim", "A swim a week"))),
      next("Next", goal)] };
  };
  // 3. Build or hold
  const goal = () => {
    const card = (k, title, sub, path, c) => h("button.rh-goal" + (draft.mode === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.mode === k), onclick: () => { draft.mode = k; Sheet.redraw(); } },
      h("span.rh-goal-top", {}, h("b", { text: title }), h("span.tick", {}, draft.mode === k ? icon("check", 13, 3.2) : null)),
      svgOf(`<svg viewBox="0 0 326 64" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="63" x2="326" y2="63" class="rh-axis"/><path d="${path}" class="rh-line ${c}"/></svg>`),
      h("small", { text: sub }));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top(3, "Build, or hold?", "You can change this any time, say for a busy month."),
      h("div.rh-goals", { role: "radiogroup", "aria-label": "Build or hold" },
        card("build", "Keep building", "Up a few points a week, never faster, with a lighter week every fourth. Uses all the time you gave.", "M0 54 C40 50, 60 46, 90 42 S 130 40, 150 40 C170 40, 190 32, 230 26 S 280 20, 300 18 L326 14", "up"),
        card("hold", "Hold where I am", "Fitness kept level with less riding: shorter sessions, the hard work kept.", "M0 32 C40 28, 70 34, 110 31 S 170 28, 200 32 S 270 34, 326 30", "level")),
      h("div.rh-ftp", {}, icon("info", 18, 2), h("span", {}, "Your FTP is ", h("b", { text: `${P().ftp} W` }), ", from You. Rhythm sets every interval from it, and from your power curve once your rides show it.")),
      next("See your first week", preview)] };
  };
  // 4. The first week, as Rhythm would have it, before anything's kept
  const preview = () => {
    const acts = S.own.map((a) => ({ start: a.start, sport: a.sport, sum: sumOf(a) }));
    const r = R.plan({ prefs: { ...draft, start: S.rhythm?.start ?? mondayOf(TODAY), at: S.rhythm?.at ?? TODAY }, acts, feel: S.feel, today: TODAY, ftp: P().ftp, paces: { run: runSpeed(), swim: swimSpeed() } });
    const ds = r.days.filter((d) => d.date >= TODAY).slice(0, 7), t = R.targets ? r.targets : undefined;
    const mins = ds.reduce((a, d) => a + d.mins, 0), hard = ds.filter((d) => d.hard), easy = mins ? Math.round(100 * (1 - hard.reduce((a, d) => a + Math.min(d.mins, 60), 0) * 0.55 / mins)) : 100;
    const rowOf = (d) => { const w = d.id ? R.workoutOf(d.id, t) : null;
      return h("div.row.plain" + (d.date === TODAY ? ".today" : ""), {}, h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: d.date === TODAY ? "Today" : dayName(d.date).slice(0, 3) })),
        h("span.tx", {}, h("b", { text: w ? `${w.name}${d.strength ? " + strength" : ""}` : "Rest" }), h("small", { text: w ? [dur(d.mins * 60), d.fuel ? `eat ${d.fuel}` : null].filter(Boolean).join(" · ") : d.why })),
        w && h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) }))); };
    const start = () => {
      S.rhythm = { ...draft, start: S.rhythm?.start ?? mondayOf(TODAY), at: S.rhythm?.at ?? TODAY };
      if (S.chosen) { S.chosen = null; S.swaps = {}; keep("plan", "swaps"); }
      keep("rhythm"); closeSheet(); toast(editing ? "Your week is saved" : "Rhythm has started"); if (S.tab !== "plan") go("plan"); else redraw();
    };
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top(4, editing ? "Your next seven days" : "Your first week", `${R.THEMES[r.block.theme]} block${r.block.absorb ? ", a lighter week" : ""}. Each day firms up that morning, from what you’ve done and how you feel.`),
      h("div.group", {}, ds.map(rowOf)),
      h("div.rh-stats", {}, [["Time", dur(mins * 60)], ["Hard", plural(hard.length, "session")], ["Easy", `${easy}%`]].map(([k, v]) => h("div", {}, h("small", { text: k }), h("b", { text: v })))),
      h("button.btn.rh-next", { type: "button", onclick: start }, editing ? "Save" : "Start Rhythm"),
      h("p.rh-note", { text: "Change your week any time in Plan" })] };
  };
  openSheet(days, { tall: true });
}
// A plan: what a week of it looks like, and when to start it: next Monday, or so it ends on your event's day (a plan of
// 16 weeks to an event 10 weeks off starts six weeks in)
function planSheet(p) {
  const mine = p.id === myPlan()?.id, next = mondayOf(addDays(TODAY, 7)), ws = layOut(p, next), first = ws[0];
  const endOf = (start) => addDays(start, p.weeks * 7 - 1), startFor = (end) => addDays(mondayOf(end), -(p.weeks - 1) * 7);
  let end = endOf(next);
  const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const byEnd = h("button.btn.quiet", { type: "button", onclick: () => start(startFor(end)) });
  const said = () => { const st = startFor(end), wk = Math.floor((mondayOf(TODAY) - st) / (7 * DAY)) + 1; byEnd.textContent = st > TODAY ? `Start ${dayShort(st)}, to end ${dayShort(end)}` : `Start at week ${Math.min(p.weeks, wk)}, to end ${dayShort(end)}`; };
  const start = (st) => { choosePlan({ id: p.id, start: st }); closeSheet(); toast(st > TODAY ? `${p.name} starts on ${dayShort(st)}` : `${p.name}: you’re in week ${weekIndex(TODAY) + 1}`); redraw(); };
  said();
  const endField = h("input.field", { type: "date", id: "plan-end", value: iso(end), min: iso(addDays(TODAY, 7)), "aria-label": "Your event’s day, or when the plan should end",
    oninput: (e) => { const v = e.target.valueAsDate; if (v) { end = startOfDay(v.getTime() + v.getTimezoneOffset() * 60e3); said(); } } });
  return {
    title: p.name,
    body: [
      h("div.sheet-top", {}, h("h1", { text: p.name }), h("div.sub", { text: `${p.weeks} weeks · ${p.phases.map(([n, w]) => `${n} ${w}`).join(" · ")}` })),
      h("p", { text: p.about }),
      card(null, "A typical week", h("div.steps", {}, first.days.map((d) => { const w = d.id && d.id !== "event" ? wkById(d.id) : null; return h("div.step", {}, h("i.bg-" + (w ? zoneOf(measure(w).iF).c : "z1")), h("div", {}, h("b", { text: dayName(d.date) }), h("small", { text: w ? w.name : "Rest" })), h("div.v", { text: w ? dur(measure(w, paceFor(w.sport)).secs) : "" })); }))),
      mine && h("p", { text: "You’re on this plan. Starting it again starts it afresh." }),
      h("button.btn", { type: "button", onclick: () => start(next) }, `Start next Monday, ${dayShort(next)}`),
      section("Or end it on your event’s day", h("label", { for: "plan-end", class: "vh", text: "Your event’s day" }), endField), byEnd,
    ],
  };
}
// a day: what's planned, what's done
function openDay(day) {
  if (rhythmOn() && actsOn(day).length) return actsOn(day).length === 1 ? openAct(actsOn(day)[0]) : null;
  if (rhythmOn() && rhDay(day)) return openSheet(() => rhDayView(day));
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
    title: "Workout",
    body: [
      h("div.sheet-top", {}, h("div.sub", {}, sportTile(w.sport, true), kindSaid(w)), h("h1", { text: w.name }),
        h("div.sub.num", { text: [dur(m.secs), w.sport === "swim" ? dist(F_metres(w), true) : null, w.sport !== "strength" ? `TSS ${Math.round(m.tss)}` : null, w.sport === "ride" ? `IF ${m.iF.toFixed(2)}` : null, w.sport === "ride" ? `${Math.round((m.avg * ftp * m.secs) / 1000)} kJ` : null].filter(Boolean).join(" · ") })),
      card(null, w.sport === "ride" ? `Power, at your FTP of ${ftp} W` : w.sport === "run" ? "Effort, against your threshold pace" : "Effort", C.profile(w, { ftp: w.sport === "ride" ? ftp : null, pace: paceFor(w.sport), label: `${w.name}, step by step`, W: sheetW() })),
      w.about && h("p", { text: w.about }),
      card(null, "Steps", h("div.steps", {}, steps)),
      w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => pushSheet(() => sendView(w)) }, icon("download", 19, 2.2), "Download"),
      mine && h("div.group", {},
        h("button.row.action.danger", { type: "button", onclick: () => { S.mine = S.mine.filter((x) => x.id !== w.id); keep("workouts"); closeSheet(); toast("Workout deleted"); redraw(); } }, "Delete workout")),
    ],
  };
}
// (a workout's sport and kind, the kind left out where it only says the sport again: Strength, not Strength · Strength)
const kindSaid = (w) => (w.kind && w.kind !== SPORTS[w.sport].name ? `${SPORTS[w.sport].name} · ${w.kind}` : SPORTS[w.sport].name);
const paceOfSpeed = (ms) => (U.metric ? 1000 / ms : 1609.344 / ms);

// Sending a workout: a file for each device and app, and how to get it there
// (named by the day it's for: 2026-10-25.fit; a workout from the library, today)
function sendView(w, day = TODAY) {
  const fit = () => F.fitFromWorkout(w, { pace: paceFor(w.sport) }), dt = new Date(day);
  const name = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const file = (title, cls) => row({ tile: h("span.ic." + cls, {}, icon("device", 18, 2)), title, sub: ".fit workout file", chev: false,
    extra: h("span.get", { "aria-hidden": "true" }, icon("download", 18, 2.2)), onclick: () => saveFile(`${name}.fit`, fit()) });
  return { title: "Download", body: [h("div.sheet-top", {}, h("h1", { text: name })), h("div.group", {}, file("Garmin", "brand.garmin"), file("Wahoo", "brand.wahoo"))] };
}

// ---- Activities ----
function activitiesView() {
  const sports = [["all", "All"], ["ride", "Rides"], ["run", "Runs"], ["other", "Other"]], at = sports.findIndex(([k]) => k === S.actSport);
  const list = S.acts.filter((a) => S.actSport === "all" || a.sport === S.actSport || (S.actSport === "other" && a.sport !== "ride" && a.sport !== "run"));
  const out = [head("Activities", S.acts.length ? `${plural(S.acts.length, "activity", "activities")}, from your devices` : "None yet", h("button.round", { type: "button", "aria-label": "Upload activities", onclick: chooseFiles }, icon("upload", 21, 2.1)))];
  // none yet: what to do, and where your files are
  if (!S.acts.length) return [...out, ...firstUpload()];
  // the last four weeks, at a glance
  const since = addDays(TODAY, -27), recent = S.acts.filter((a) => a.start >= since);
  const tot = recent.reduce((t, a) => { const s = sumOf(a); if (s) { t.secs += s.moving; t.dist += s.dist || 0; t.tss += s.tss || 0; t.asc += s.ascent || 0; } return t; }, { secs: 0, dist: 0, tss: 0, asc: 0 });
  if (S.acts.length) out.push(card(null, "The last four weeks", S.summed ? h("div.stats", {}, stat("Time", hm(tot.secs), tot.secs >= 3600 ? "h" : null), stat("Distance", ...distNum(tot.dist)), stat("Climbing", ...height(tot.asc))) : wait(48)));
  out.push(h("div.seg.wide", { vars: { "--n": 4, "--at": at }, role: "group", "aria-label": "Sport" }, sports.map(([k, label]) => h("button", { type: "button", "aria-pressed": String(S.actSport === k), onclick: () => { S.actSport = k; redraw(); } }, label))));
  // by week, newest first
  const byWeek = new Map();
  for (const a of list) { const k = mondayOf(a.start); if (!byWeek.has(k)) byWeek.set(k, []); byWeek.get(k).push(a); }
  const thisMon = mondayOf(TODAY);
  if (!list.length) out.push(h("p.foot.none", { text: `No ${sports[at][1].toLowerCase()} yet.` }));
  for (const [mon, acts] of byWeek) {
    const name = mon === thisMon ? "This week" : mon === addDays(thisMon, -7) ? "Last week" : `${dateShort(mon)} – ${dateShort(addDays(mon, 6))}`;
    const secs = acts.reduce((t, a) => t + (sumOf(a)?.moving || 0), 0);
    out.push(section([name, h("span.aside", { text: S.summed ? dur(secs) : "" })], h("div.group.glass", {}, acts.map(actRow))));
  }
  if (list.length) out.push(h("p.foot", { vars: { "text-align": "center" } }, h("button.link", { type: "button", onclick: chooseFiles }, "Upload more activities")));
  return out;
}
// Your first activity: one button, and where each device and app keeps its files
function firstUpload() {
  const where = (ic, tint, title, sub) => h("div.row.plain", {}, h("span.ic." + tint, {}, icon(ic, 18, 2.1)), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  return [
    h("div.card.glass.first", {},
      h("span.big", {}, icon("upload", 30, 2)),
      h("h2", { text: "Add your first activity" }),
      h("p", { text: "Upload a file from your Garmin, Wahoo, Strava or Zwift. Fitness works out whether it was a ride, a run or a swim, and you can change it before it’s saved." }),
      h("button.btn", { type: "button", onclick: chooseFiles }, icon("upload", 19, 2.2), "Upload a file"),
      h("small", { text: "FIT, GPX or TCX, or a zip of them" })),
    section("Where to find your files", h("div.group.glass", {},
      where("device", "blue", "Garmin", "In Garmin Connect, open an activity, then ⋯ › Export Original. Or plug the device in and open Garmin › Activity."),
      where("device", "teal", "Wahoo", "In the Wahoo app, open an activity, then Share › Download .fit."),
      where("open", "coral", "Strava", "On strava.com, open an activity, then ⋯ › Export Original."),
      where("trainer", "indigo", "Zwift", "Documents › Zwift › Activities, on the computer you ride on."))),
  ];
}
function actRow(a) {
  const s = sumOf(a);
  return h("button.row", { type: "button", onclick: () => openAct(a) }, sportTile(a.sport),
    h("span.tx", {}, h("b", { text: a.name }), h("small", { text: `${dayShort(a.start)} · ${a.device || (a.sample ? "Example" : "Imported")}` })),
    h("span.val", {}, s ? (s.dist > 100 ? dist(s.dist) : hm(s.moving)) : "", h("small", { text: s ? [s.dist > 100 ? hm(s.moving) : null, s.tss != null ? `TSS ${s.tss}` : null].filter(Boolean).join(" · ") : "" })));
}
// an activity, opened: its file read first, where it isn't here yet (from this device's copy, or the account's)
async function openAct(a) {
  if (full(a)) return openSheet(() => actView(a), { tall: true });
  openSheet(() => ({ title: a.name, body: [h("div.sheet-top", {}, h("div.sub", {}, sportTile(a.sport, true), `${dayLong(a.start)}, ${timeOf(a.start)}`), h("h1", { text: a.name }),
    h("div.sub", { text: "Opening its file…" })), wait(220), wait(160)] }), { tall: true });
  try {
    await load(a);
    if (sheetEl.open && !sheetEl.classList.contains("closing")) { Sheet.stack = [() => actView(a)]; drawSheet(); }
  } catch (e) { if (e.status === 401) return signedOutHere(); closeSheet(); toast(e.message, true); }
}
function actView(a) {
  // (one of yours worked out afresh from its file, its zones and all, for your numbers now)
  const x = full(a), s = a.sample ? sumOf(a) || summarise(x, P()) : summarise(x, P()), ps = perSecond(x), w = a.workout ? wkById(a.workout) : null, plannedId = plannedOn(startOfDay(a.start));
  const planned = plannedId && plannedId !== "event" ? wkById(plannedId) : null;
  const body = [];
  body.push(h("div.sheet-top", {}, h("div.sub", {}, sportTile(a.sport, true), `${dayLong(a.start)}, ${timeOf(a.start)}`), h("h1", { text: a.name }),
    h("div.sub", { text: [a.device, a.sample ? "example ride" : a.file].filter(Boolean).join(" · ") }),
    !a.sample && h("div.sub", {}, h("button.link.small", { type: "button", onclick: () => pushSheet(() => renameView(a)) }, "Rename")),
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
    a.sport === "ride" && s.avgSpd > 0 && stat("Average speed", ...speed(s.avgSpd)), a.sport === "run" && s.avgSpd > 0 && stat("Average pace", pace(paceOfSpeed(s.avgSpd)).split(" ")[0], U.metric ? "/km" : "/mi"),
    s.avgPwr != null && stat("Average power", s.avgPwr, "W"), s.np != null && stat("Normalized Power", s.np, "W"), s.iF != null && stat("Intensity", s.iF.toFixed(2)),
    s.tss != null && stat({ hr: "TSS (heart rate)", pace: "TSS (pace)" }[s.kind] || "Training stress", s.tss), s.avgHr > 0 && stat("Average heart rate", s.avgHr, "bpm"), s.maxHr > 0 && stat("Max heart rate", s.maxHr, "bpm"),
    s.avgCad > 0 && stat("Cadence", s.avgCad, a.sport === "run" ? "spm" : "rpm"), s.kj != null ? stat("Work", s.kj.toLocaleString("en-GB"), "kJ") : stat("Energy", s.kcal, "kcal"))));
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
    body.push(card(null, "Best efforts", C.curve(s.curve, ftp, sheetW()), best20 > 0 && h("p.line-said", { text: `Your best 20 minutes: ${best20} W, ${pct(best20 / ftp)} of your FTP.${est > ftp + 4 ? ` That’s an FTP of about ${est} W, above your ${ftp} W: worth a test.` : ""}` })));
  }
  if (x.laps.length > 1 && x.laps.length <= 30) {
    body.push(section(`Laps (${x.laps.length})`, h("div.group", {}, x.laps.map((l, i) => {
      const p = ps.pwr ? avgOver(ps.pwr, l.start, l.secs) : null, hr = ps.hr ? avgOver(ps.hr, l.start, l.secs) : null;
      return h("div.row.plain", {}, h("span.tx", {}, h("b", { text: `Lap ${i + 1}` }), h("small", { text: clock(l.secs) })), h("span.val", { text: [p != null && `${Math.round(p)} W`, hr != null && `${Math.round(hr)} bpm`].filter(Boolean).join(" · ") }));
    }))));
  }
  // and out again (the example rides only: your own are kept as you uploaded them)
  const stem = `${new Date(a.start).toISOString().slice(0, 10)} ${a.name}`;
  if (a.sample) body.push(section("Export", h("div.group", {},
    row({ tile: h("span.ic.coral", {}, icon("file", 18, 2)), title: "FIT", sub: "For Garmin Connect, Strava, TrainingPeaks, intervals.icu, and the Wahoo app", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "fit"), F.fitFromActivity(x, s)) }),
    x.s.lat && row({ tile: h("span.ic.blue", {}, icon("file", 18, 2)), title: "GPX", sub: "For maps and route apps (Komoot, RideWithGPS), with heart rate, cadence and power", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "gpx"), F.gpxFromActivity(x)) }),
    row({ tile: h("span.ic.grey", {}, icon("file", 18, 2)), title: "TCX", sub: "Garmin’s older format, for tools that want it", chev: false, extra: h("span.get", {}, icon("download", 18, 2.2)), onclick: () => saveFile(F.fileName(stem, "tcx"), F.tcxFromActivity(x, s)) })),
    h("p.foot", { text: "Garmin Connect: Import Data takes any of these. The Wahoo app: History, then + and Upload, takes the FIT file." })));
  if (!a.sample) body.push(h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Delete it, and its file, for good"; return; }
    try { await A.remove(a.id); } catch (err) { if (err.status === 401) return signedOutHere(); return toast(err.message, true); }
    S.own = S.own.filter((y) => y.id !== a.id); setActs(); S.sums.delete(a.id); held.delete(a.id); idb.del(fileKey(a)).catch(() => {});
    closeSheet(); toast("Deleted"); redraw();
  } }, "Delete this activity")));
  return { title: a.name, body };
}
// a new name for one of yours
function renameView(a) {
  const field = h("input.field", { type: "text", id: "act-name", value: a.name, maxlength: 80, "aria-label": "Name" });
  const save = async () => {
    const name = field.value.trim() || a.name;
    try { await A.rename(a.id, name); } catch (e) { return toast(e.message, true); }
    a.name = name; const x = held.get(a.id); if (x) x.name = name;
    for (const y of S.own) if (y.id === a.id) y.name = name;
    setActs(); redraw(); sheetBack(); toast("Renamed");
  };
  setTimeout(() => field.focus(), 350);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  return { title: "Rename", right: h("button.link.done.r", { type: "button", onclick: save }, "Save"), body: [field] };
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
      // (your account's card: its page, opened signed in as you, for your photo, name and the rest)
      h("button.card.glass.acct", { type: "button", onclick: openAccount, "aria-label": "Your account" },
        h("div.wx", {}, h("div.round.me", { "aria-hidden": "true" }, face()), h("div", {}, h("b", { text: S.me?.name || "You" }), h("span", { text: `@${S.me?.handle} · georgefarrowgreen.com` })),
          h("span.chev", {}, icon("chev", 17, 2.4)))),
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
        row({ tile: h("span.ic.brand.garmin", {}, icon("device", 18, 2)), title: "Garmin Connect", sub: garminSaid(), onclick: () => pushSheet(garminView) }),
        devices.map((d) => row({ icon: /KICKR/i.test(d) ? "trainer" : "device", tint: /Wahoo/i.test(d) ? "blue" : "grey", title: d, sub: `Seen in ${plural(S.acts.filter((a) => a.device === d).length, "file")}`, chev: false })),
        row({ icon: "usb", tint: "coral", title: "Sending workouts to a device", onclick: () => pushSheet(() => sendView(wkById("ss-3x12"))) })),
        h("p.foot", { text: "Garmin and Wahoo devices are known from the files they write. Sending workouts straight to them, without a cable, comes with Garmin’s and Wahoo’s partner programmes." })),
      section("Preferences", h("div.group", {},
        row({ icon: "contrast", tint: "indigo", title: "Appearance", value: { auto: "Automatic", light: "Light", dark: "Dark" }[store.get("appearance", "auto")] || "Automatic", onclick: () => pushSheet(appearanceView) }),
        row({ icon: "ruler", tint: "blue", title: "Units", value: U.metric ? "Kilometres" : "Miles", onclick: () => { U.metric = !U.metric; keep("prefs"); redraw(true); } }))),
      section("Your data", h("div.group", {},
        row({ icon: "inbox", tint: "blue", title: "Import files", sub: "FIT, GPX, TCX, ZWO, ERG, MRC, or a zip of them", onclick: () => { closeSheet(); chooseFiles(); } }),
        row({ icon: "zip", tint: "green", title: "Export everything", sub: "Every activity's own file, and your workouts as FIT and ZWO, in one zip", onclick: exportAll })),
        h("p.foot", { text: "Your rides are kept with your georgefarrowgreen.com account (each file as you imported it, and its figures), with your plan, numbers and workouts, on every device you sign in on. Deleting the account deletes them." })),
      section(null, h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: signOutHere }, "Sign out"))),
    ],
  };
}
// Your account's page, opened signed in as you (a code good once, for a minute), with the way back here
async function openAccount() {
  const page = A.accountPage();
  if (!page) return toast("Your account is at account.georgefarrowgreen.com");
  try { const { code } = await A.accountLink(); location.assign(`${page}#${new URLSearchParams({ handoff: code, from: "fitness" })}`); }
  catch (e) { if (e.status === 401) return signedOutHere(); toast(e.message, true); }
}
function numbersView() {
  const p = P(), field = (label, key, show, by, lo, hi) => h("div.row.plain", {}, h("span.tx", {}, h("b", { text: label })),
    h("span.stepper", { role: "group", "aria-label": label },
      h("button", { type: "button", "aria-label": `Less ${label}`, onclick: () => change(key, -by, lo, hi) }, icon("minus", 16, 2.4)),
      h("output", { text: show(p[key]) }),
      h("button", { type: "button", "aria-label": `More ${label}`, onclick: () => change(key, by, lo, hi) }, icon("plus", 16, 2.4))));
  const change = (k, d, lo, hi) => { S.profile = { ...P(), [k]: Math.max(lo, Math.min(hi, Math.round((P()[k] + d) * 10) / 10)) }; keep("profile"); Sheet.redraw(); clearTimeout(change.t); change.t = setTimeout(() => { resum(); redraw(); }, 600); };
  // (your best 20 minutes of the last six weeks, for an FTP to try)
  const since = addDays(TODAY, -42), best20 = Math.max(0, ...S.acts.filter((a) => a.start >= since).map((a) => sumOf(a)?.curve?.[1200] || 0));
  return {
    title: "Your numbers",
    body: [
      h("div.group", {}, field("FTP", "ftp", (v) => `${v} W`, 5, 80, 500), field("Weight", "weight", (v) => weight(v), 0.5, 35, 150),
        field("Threshold heart rate", "lthr", (v) => `${v} bpm`, 1, 100, 210), field("Max heart rate", "maxHr", (v) => `${v} bpm`, 1, 120, 230),
        field("Threshold pace", "runPace", (v) => pace(paceOf(v)), 5, 150, 600), field("CSS", "css", (v) => pace(v, "/100 m"), 1, 50, 240)),
      best20 > 0 && card(null, "From your rides", h("p.line-said", { text: `Your best 20 minutes in the last six weeks: ${best20} W, an FTP of about ${Math.round(best20 * 0.95)} W.` }),
        Math.abs(Math.round(best20 * 0.95) - p.ftp) >= 5 && h("button.pill.small", { type: "button", onclick: () => { S.profile = { ...P(), ftp: Math.round(best20 * 0.95) }; keep("profile"); Sheet.redraw(); resum(); redraw(); toast(`FTP set to ${S.profile.ftp} W`); } }, `Use ${Math.round(best20 * 0.95)} W`)),
      h("p", { text: "FTP is the power you could hold for about an hour. The ramp test or the 20-minute test in Workouts will find it; or ride hard and Fitness will notice." }),
    ],
  };
}
function appearanceView() {
  const now = store.get("appearance", "auto"), set = (v) => {
    store.set("appearance", v);
    if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    try { localStorage.setItem("fitness:appearance", v); } catch (_) {}
    Sheet.redraw();
  };
  return { title: "Appearance", body: [h("div.group", {}, [["auto", "Automatic", "As your device is set"], ["light", "Light", "Dawn"], ["dark", "Dark", "Night"]].map(([v, l, sub]) =>
    row({ title: l, sub, chev: false, onclick: () => set(v), extra: now === v ? h("span.get", {}, icon("check", 18, 2.6)) : null })))] };
}

// the example rides on or off (and with them, the example plan, where you haven't chosen one)
function setExamples(on) {
  S.examples = on; keep("prefs"); setActs(); if (on) sumUp();
  if (!on && S.tab === "today") scrollTo(0, 0);
  toast(on ? "Example rides on" : "Only your rides now");
  redraw();
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
  saveFile(F.fileName(`Fitness week ${wk.week}`, "zip"), F.zip(files));
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
    ev.push(["BEGIN:VEVENT", `UID:${w.id}-${d.date}@fitness.georgefarrowgreen.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + m.secs * 1000)}`,
      `SUMMARY:${fold(`${w.name} (${SPORTS[w.sport].name})`)}`, `DESCRIPTION:${fold(notes)}`, "END:VEVENT"].join("\r\n"));
  }
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//georgefarrowgreen.com//Fitness//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR", ""].join("\r\n");
  // (iCalendar files aren't among the kinds claude.ai's viewer hands over: there, it goes in a zip like the rest)
  saveFile(F.fileName(`Fitness week ${wks[0].week}`, "ics"), ics);
}
// Everything: each of your activities as its file came (fetched from the account where this device hasn't it), and your
// workouts as FIT and ZWO
async function exportAll() {
  const files = [], seen = new Set(), own = S.own;
  for (let i = 0; i < own.length; i++) {
    const a = own[i];
    toast(`Gathering ${i + 1} of ${own.length}…`, false, 60000);
    try {
      let bytes = await idb.get(fileKey(a)).catch(() => null);
      if (!bytes) { bytes = await A.fileOf(a.id); idb.put(fileKey(a), bytes).catch(() => {}); }
      // (a file of several parts, kept once)
      const name = `activities/${F.fileName(`${new Date(a.start).toISOString().slice(0, 10)} ${a.name}`, a.type || "fit")}`;
      if (!seen.has(a.file + bytes.length)) { seen.add(a.file + bytes.length); files.push({ name, data: bytes }); }
    } catch (e) { if (e.status === 401) return signedOutHere(); return toast(e.message, true); }
  }
  for (const w of S.mine) {
    files.push({ name: `workouts/${F.fileName(w.name, "fit")}`, data: F.fitFromWorkout(w, { pace: paceFor(w.sport) }) });
    if (w.sport === "ride") files.push({ name: `workouts/${F.fileName(w.name, "zwo")}`, data: F.zwoFromWorkout(w) });
  }
  toastEl.classList.remove("on");
  if (!files.length) return toast("Nothing to export yet: import a ride first");
  saveFile("Fitness export.zip", F.zip(files));
}

// Importing: chosen, or dropped anywhere on the page
function chooseFiles() { filesEl.value = ""; filesEl.click(); }
filesEl.addEventListener("change", () => { if (filesEl.files.length) importFiles([...filesEl.files]); });
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
addEventListener("dragenter", (e) => { if (!hasFiles(e) || !S.me) return; e.preventDefault(); dragDepth++; dropEl.classList.add("on"); });
addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropEl.classList.remove("on"); } });
addEventListener("drop", (e) => { if (!hasFiles(e) || !S.me) return; e.preventDefault(); dragDepth = 0; dropEl.classList.remove("on"); importFiles([...e.dataTransfer.files]); });
dropEl.append(h("div", {}, icon("inbox", 40, 1.8), h("b", { text: "Drop to import" }), h("span", { text: "Rides and runs as FIT, GPX or TCX (from a Garmin, a Wahoo, Strava…), workouts as FIT, ZWO, ERG or MRC" })));

async function importFiles(files) {
  if (!S.me) return;
  // read first, here: each activity in the files (a zip's, a triathlon's three), and any workouts
  const got = { acts: [], workouts: [], skipped: [], dupes: 0 };
  toast(`Reading ${plural(files.length, "file")}…`, false, 60000);
  for (const f of files) {
    try {
      const r = await F.readAny(f.name, await f.arrayBuffer());
      for (const a of r.activities) {
        if (S.own.some((x) => Math.abs(x.start - a.start) < 60e3) || got.acts.some((x) => x.start === a.start)) { got.dupes++; continue; }
        got.acts.push(a);
      }
      if (r.workouts.length) got.skipped.push(`${f.name}: a workout, not an activity. Fitness takes the rides, runs and swims your devices record.`);
      got.skipped.push(...(r.skipped || []));
    } catch (e) { got.skipped.push(`${f.name}: ${e.message}`); }
  }
  toastEl.classList.remove("on");
  got.acts.sort((a, b) => b.start - a.start);
  openSheet(() => uploadView(got), { tall: got.acts.length > 2 });
}
const SPORT_NAMES = [["ride", "Ride"], ["run", "Run"], ["swim", "Swim"], ["walk", "Walk"], ["row", "Row"], ["strength", "Strength"], ["other", "Other"]];
// What's in the files, before it's saved: each activity with what it was (as its file says, or worked out from how it
// went, and a tap to change), then Upload
function uploadView(got) {
  const n = got.acts.length, nw = got.workouts.length;
  if (!n && !nw) return { title: "Upload", body: [h("div.sheet-top", {}, h("h1", { text: "Nothing to upload" }), h("div.sub", { text: got.dupes ? `${plural(got.dupes, "activity is", "activities are")} here already` : "" })),
    got.skipped.length > 0 && section("Not read", h("div.group", {}, got.skipped.map((t) => h("div.row.plain", {}, h("span.tx", {}, h("small", { text: t })))))),
    h("button.btn.quiet", { type: "button", onclick: () => { closeSheet(); chooseFiles(); } }, "Choose other files")] };
  const rows = got.acts.map((a) => {
    const sum = summarise(a, P()), tile = h("span.tile.s-" + a.sport, {}, sportIcon(a.sport, 20)), name = h("b", { text: a.name });
    const said = h("small.said", { text: a.guessed ? "Fitness worked this out: check it" : "As your device recorded it" });
    const pick = h("select.sport-pick", { "aria-label": `What ${a.name} was`, onchange: () => {
      const was = defaultFor(a), now = pick.value; a.sport = now; a.guessed = false;
      if (a.name === was) { a.name = defaultFor(a); name.textContent = a.name; }
      tile.className = "tile s-" + now; tile.replaceChildren(sportIcon(now, 20)); said.textContent = "Chosen by you";
    } }, SPORT_NAMES.map(([v, l]) => h("option", { value: v, selected: a.sport === v, text: l })));
    return h("div.row.up" + (a.guessed ? ".guess" : ""), {}, tile,
      h("span.tx", {}, name, h("small", { text: [`${dayShort(a.start)}, ${timeOf(a.start)}`, sum.dist > 100 ? dist(sum.dist) : null, hm(sum.moving)].filter(Boolean).join(" · ") }), said),
      h("label.pick", {}, pick, icon("chev", 14, 2.6)));
  });
  const go = h("button.btn", { type: "button", onclick: () => upload(got, go) }, icon("upload", 19, 2.2), n ? `Upload ${plural(n, "activity", "activities")}` : `Save ${plural(nw, "workout")}`);
  return { title: "Upload", right: h("button.link.done.r", { type: "button", onclick: closeSheet }, "Cancel"), body: [
    h("div.sheet-top", {}, h("h1", { text: n ? (n === 1 ? "One activity" : `${n} activities`) : plural(nw, "workout") }),
      h("div.sub", { text: n ? "Check what each one was, then upload." : "To your workouts." })),
    n > 0 && h("div.group", {}, rows),
    nw > 0 && section("Workouts", h("div.group", {}, got.workouts.map((w) => h("div.row.plain", {}, h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) })),
      h("span.tx", {}, h("b", { text: w.name }), h("small", { text: `${dur(measure(w, paceFor(w.sport)).secs)} · ${SPORTS[w.sport]?.name || w.sport}` })))))),
    (got.dupes || got.skipped.length) > 0 && section("Left out", h("div.group", {},
      got.dupes > 0 && h("div.row.plain", {}, h("span.tx", {}, h("small", { text: `${plural(got.dupes, "activity is", "activities are")} here already` }))),
      got.skipped.map((t) => h("div.row.plain", {}, h("span.tx", {}, h("small", { text: t })))))),
    go,
  ] };
}
const defaultFor = (a) => F.defaultName(a.sport, a.start, a.indoor);
// Each activity kept with your account (its file as it came, and its figures as worked out here), one at a time, the
// sheet saying how far it's got
async function upload(got, btn) {
  btn.disabled = true;
  const done = [], failed = [];
  for (const [i, a] of got.acts.entries()) {
    btn.lastChild.textContent = got.acts.length > 1 ? `Uploading ${i + 1} of ${got.acts.length}…` : "Uploading…";
    const sum = summarise(a, P()), meta = { id: `i${a.start}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: a.raw.name, type: a.raw.type, sum };
    try {
      const r = await A.upload(meta, a.raw.name, a.raw.bytes);
      if (r.already) continue;
    } catch (e) {
      if (e.status === 401) return signedOutHere();
      failed.push(`${a.name}: ${e.message}`); continue;
    }
    const entry = { ...meta, sample: false };
    S.own.push(entry); S.sums.set(entry.id, sum); done.push(entry);
    remember(entry.id, Object.assign(a, { id: entry.id }));
    idb.put(fileKey(entry), a.raw.bytes).catch(() => {});
  }
  if (got.workouts.length) { S.mine.unshift(...got.workouts); keep("workouts"); }
  setActs();
  if (failed.length) { btn.disabled = false; btn.lastChild.textContent = "Try again"; got.acts = got.acts.filter((a) => failed.some((f) => f.startsWith(a.name + ":"))); toast(failed[0], true, 6000); redraw(); return; }
  await closeSheet();
  if (done.length) { S.tab !== "activities" && go("activities"); S.actSport = "all"; }
  redraw();
  toast([done.length && plural(done.length, "activity", "activities"), got.workouts.length && plural(got.workouts.length, "workout")].filter(Boolean).join(" and ") + " added");
  if (done.length === 1 && !got.workouts.length) openAct(done[0]);
}

// ---- Garmin Connect: your activities, in by themselves (functions/_garmin.js). The server asks Garmin what's new, as
// you open the app and every 15 minutes, and keeps each new one's file waiting; here each is read as an upload is, its
// figures worked out, and kept (a ride you've uploaded already isn't kept twice) ----
function garminNow(g) {
  if (!g?.on) { S.garmin = g || { on: false }; return; }
  S.garmin = g;
  fromGarmin().then(() => (Date.now() - (S.garmin.last || 0) > 2 * 60e3 ? A.garminFetch().then((n) => { S.garmin = n; return fromGarmin(); }) : null)).catch(() => {});
}
async function fromGarmin({ quiet = false } = {}) {
  const waiting = S.garmin?.waiting || [];
  if (!waiting.length || fromGarmin.busy) return 0;
  fromGarmin.busy = true;
  const added = [];
  try {
    for (const w of waiting) {
      let acts;
      try { acts = (await F.readAny(`garmin-${w.id}.zip`, await A.garminFile(w.id))).activities; }
      catch (e) { if (e.status === 401) return signedOutHere(true); if (e.offline || e.status >= 500) break; acts = []; }
      let kept = 0;
      for (const [k, a] of acts.entries()) {
        if (S.own.some((x) => Math.abs(x.start - a.start) < 60e3)) continue;
        if (w.name && acts.length === 1) a.name = w.name;
        const sum = summarise(a, P()), meta = { id: k ? `g${w.id}-${k + 1}` : `g${w.id}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: a.raw.name, type: a.raw.type, sum };
        try { await A.upload(meta, a.raw.name, a.raw.bytes); } catch (e) { if (e.status === 401) return signedOutHere(true); kept = -1; break; }
        const entry = { ...meta, sample: false };
        S.own.push(entry); S.sums.set(entry.id, sum); added.push(entry); kept++;
        remember(entry.id, Object.assign(a, { id: entry.id }));
        idb.put(fileKey(entry), a.raw.bytes).catch(() => {});
      }
      if (kept < 0) break;
      // (nothing in it to keep: one you have already, or one with nothing Fitness can read)
      if (!kept) await A.garminDone(w.id).catch(() => {});
      S.garmin.waiting = S.garmin.waiting.filter((x) => x.id !== w.id);
    }
  } finally { fromGarmin.busy = false; }
  if (added.length) { setActs(); redraw(); if (!quiet) toast(added.length === 1 ? `${added[0].name}, from Garmin` : `${plural(added.length, "activity", "activities")} from Garmin`); }
  return added.length;
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : dayShort(t); };
function garminSaid() {
  const g = S.garmin;
  if (!g?.on) return "Bring your activities in by themselves";
  if (!g.ok) return "Your key has stopped working: add a new one";
  return g.last ? `Connected · checked ${ago(g.last)}` : "Connected";
}
function garminView() {
  const g = S.garmin, field = h("input.field", { type: "password", id: "garmin-key", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Personal API key", "aria-label": "Your Garmin Personal API key" });
  const add = async (btn) => {
    if (!field.value.trim()) return field.focus();
    btn.disabled = true; btn.textContent = "Connecting…";
    try { S.garmin = await A.garminConnect(field.value); field.value = ""; }
    catch (e) { btn.disabled = false; btn.textContent = g?.on ? "Add the new key" : "Connect"; if (e.status === 401) return signedOutHere(); return toast(e.message, true, 6000); }
    Sheet.redraw();
    // (six weeks of them, a few at a time)
    let n = await fromGarmin({ quiet: true });
    for (let i = 0; i < 8 && S.garmin.more; i++) { try { S.garmin = await A.garminFetch(true); } catch (_) { break; } n += await fromGarmin({ quiet: true }); }
    toast(n ? `Connected: ${plural(n, "activity", "activities")} from the last six weeks` : "Connected to Garmin Connect");
  };
  const keyForm = (label) => { const btn = h("button.btn", { type: "button", onclick: () => add(btn) }, label); field.addEventListener("keydown", (e) => { if (e.key === "Enter") add(btn); }); return [field, btn]; };
  if (!g?.on) return { title: "Garmin Connect", body: [
    h("div.sheet-top", {}, h("h1", { text: "Garmin Connect" }), h("div.sub", { text: "Your rides, runs and swims, in Fitness by themselves." })),
    section("How", h("div.group", {},
      h("div.row.plain", {}, h("span.ic.blue", {}, h("b", { text: "1" })), h("span.tx", {}, h("b", { text: "Make a key in Garmin Connect" }), h("small", { text: "Settings, then Personal API Key, then Create" }))),
      h("div.row.plain", {}, h("span.ic.blue", {}, h("b", { text: "2" })), h("span.tx", {}, h("b", { text: "Copy it, and paste it here" }), h("small", { text: "Garmin shows it only once" }))))),
    h("div.garmin-key", {}, ...keyForm("Connect")),
    section(null, h("p.foot", { text: "The key is kept locked with your account and never shown again. Garmin’s personal keys only read: Fitness brings in your activities from the last six weeks, then each new one. Workouts still go to your device by Download." })),
  ] };
  const disconnect = async () => {
    if (!confirm("Disconnect Garmin Connect? Activities already brought in stay.")) return;
    try { S.garmin = await A.garminDisconnect(); } catch (e) { return toast(e.message, true); }
    sheetBack(); redraw(); toast("Disconnected");
  };
  const check = async (btn) => {
    btn.disabled = true; btn.textContent = "Checking…";
    try { S.garmin = await A.garminFetch(true); } catch (e) { btn.disabled = false; btn.textContent = "Check now"; return toast(e.message, true); }
    const n = await fromGarmin({ quiet: true });
    Sheet.redraw(); toast(n ? `${plural(n, "activity", "activities")} from Garmin` : S.garmin.ok ? "Nothing new" : garminSaid(), !S.garmin.ok);
  };
  const checkBtn = h("button.btn.quiet", { type: "button", onclick: () => check(checkBtn) }, "Check now");
  return { title: "Garmin Connect", body: [
    h("div.sheet-top", {}, h("h1", { text: "Garmin Connect" }), h("div.sub", { text: g.ok ? (g.said === "unreachable" ? "Connected, but Garmin didn’t answer last time" : "Connected") : "Your key has expired, or was deleted" })),
    h("div.group", {},
      row({ icon: "today", tint: "blue", title: "Last checked", value: g.last ? ago(g.last) : "Not yet", chev: false }),
      row({ icon: "calendar", tint: "green", title: "Connected", value: dayShort(g.since), chev: false })),
    !g.ok && section("A new key", h("div.garmin-key", {}, ...keyForm("Add the new key"))),
    g.ok && checkBtn,
    section(null, h("p.foot", { text: "Fitness looks for new activities every 15 minutes, and as you open it: a ride shows up a minute or two after your watch syncs with Garmin Connect." })),
    section(null, h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: disconnect }, "Disconnect"))),
  ] };
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
    // (the sheet itself takes the focus, as the account page's does, not its first button: so Done isn't ringed as it opens)
    sheetEl.focus({ preventScroll: true });
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

// ---- no zooming, on any screen: Safari pinches whatever the page's rules say, so it's told with the gestures themselves ----
for (const n of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(n, (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 || (e.scale ?? 1) !== 1) e.preventDefault(); }, { passive: false });

// ---- the status bar's glass, once the page is under it ----
addEventListener("scroll", () => document.documentElement.style.setProperty("--bar", scrollY > 8 ? 1 : 0), { passive: true });

// ---- signing in, and out ----
// Fitness is used signed in, and only signed in: signed out, this, and Sign in, which is on the account's own page
// (account.<site>, beside fitness.<site>), where every app on the site signs in: there with a word for the sign-in (kept
// on this device for half an hour, or until it's used), and back with a code for it (signedBack)
function welcome(note = null) {
  S.me = null;
  document.body.classList.add("out");
  const page = A.accountPage();
  const feature = (ic, b, t) => h("li", {}, h("span.ic.coral", {}, icon(ic, 17, 2.1)), h("div", {}, h("b", { text: b }), h("span", { text: t })));
  main.replaceChildren(h("div.welcome.screen.in", {},
    h("img.mark", { src: "icon.svg", alt: "", width: 96, height: 96 }),
    h("h1", { text: "Fitness" }),
    h("p.lead", { text: "Training, riding first: a plan to your goal, workouts for your Garmin or Wahoo, and every ride, run and swim." }),
    h("ul.features", {}, feature("plan", "Plans", "Week by week to your event, with an easier week every fourth"), feature("upload", "To your devices", "Workouts for Garmin, Wahoo, Zwift and TrainerRoad"),
      feature("list", "Your rides", "From the files your devices record: power, heart rate, zones and form")),
    h("button.btn", { type: "button", id: "sign-in", disabled: !page, onclick: toAccountSignIn }, "Sign in"),
    h("p.small", { text: page ? "With your georgefarrowgreen.com account, the one you use for InFlight and Weather." : "Signing in is at fitness.georgefarrowgreen.com." }),
    note && h("p.small.said", { role: "status", text: note })));
  main.removeAttribute("aria-busy");
  document.title = "Fitness";
}
async function toAccountSignIn(e) {
  const page = A.accountPage(), b = e?.currentTarget;
  if (!page) return;
  if (b) { b.disabled = true; b.textContent = "Signing in…"; }
  try {
    const { word, ask } = await A.signInWord();
    localStorage.setItem("fitness:signin", JSON.stringify({ word, at: Date.now() }));
    location.assign(`${page}#${new URLSearchParams({ signin: "fitness", ask, back: `${location.origin}/` })}`);
  } catch (_) { if (b) { b.disabled = false; b.textContent = "Sign in"; } toast("This browser can’t sign in here. Try Safari or Chrome.", true); }
}
// Back from the account's page with a code for the sign-in made there: swapped, with the word kept for it, for the sign-in
// (the site's: Fitness keeps none of its own). A code from anywhere else, or one that's run out, is used up and goes no
// further. → the account, as me() has it, or null
async function signedBack(code) {
  let k = null;
  try { k = JSON.parse(localStorage.getItem("fitness:signin") || "null"); localStorage.removeItem("fitness:signin"); } catch (_) {}
  if (!k || Date.now() - k.at > 30 * 60e3) { A.handback(code, "").catch(() => {}); toast("That sign-in was started somewhere else. Sign in again here.", true); return null; }
  try { const m = await A.handback(code, k.word); toast(`Signed in as ${String(m.name).trim().split(/\s+/)[0]}`); return m; }
  catch (e) { toast(e.message, true); return null; }
}
// Signed in: your record and your activities, from the account
function arrive(m) {
  S.me = m; S.ver = m.ver || 0; S.pulledAt = Date.now(); S.inStepWorkouts = A.workoutIds(m.data);
  S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
  S.sums.clear();
  adopt(m.data);
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  document.body.classList.remove("out");
  drawTabs();
  render(true);
  sumUp();
  if (S.summed) redraw();
  askToday();
  garminNow(m.garmin);
}
// What another device changed meanwhile, taken up as you come back to the app (this device's changes not yet kept
// winning, as when they're sent)
async function pull() {
  if (!S.me || pull.busy) return;
  pull.busy = true;
  try {
    const m = await A.me();
    if (!m.signedIn || m.id !== S.me.id) return signedOutHere(true);
    S.me = { ...S.me, name: m.name, handle: m.handle, photoAt: m.photoAt }; S.ver = m.ver; S.pulledAt = Date.now();
    adopt(S.dirty.size ? A.merge(m.data, record(), S.dirty, S.inStepWorkouts) : m.data); S.inStepWorkouts = A.workoutIds(m.data);
    S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
    for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
    setActs(); redraw();
    garminNow(m.garmin);
  } catch (_) {} finally { pull.busy = false; }
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.me && Date.now() - S.pulledAt > 60e3) pull(); if (document.visibilityState === "visible" && S.me) askToday(); });
addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });

// ---- always the latest version: the app's files as they were when it opened, and as they are now, compared as you
// come back to it (a phone keeps a page open for days); a new one, and it's opened afresh, unless you're mid-upload ----
const FILES = ["app.js", "styles.css", "ui.js", "charts.js", "workouts.js", "load.js", "sample.js", "formats.js", "fit.js", "account.js"];
const versionNow = async () => (await Promise.all(FILES.map((f) => fetch(f, { method: "HEAD", cache: "no-store" }).then((r) => r.headers.get("etag") || "", () => null)))).join();
let version = null, versionAt = Date.now();
versionNow().then((v) => { version = v; });
addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !version || Date.now() - versionAt < 30e3) return;
  versionAt = Date.now();
  const v = await versionNow();
  if (v && !v.split(",").includes("") && v !== version && !document.querySelector(".btn[disabled]")) location.reload();
});
// Signing out, here (everywhere on the site, in this browser), or found to be signed out (elsewhere): this device's
// copies of your files go too
async function signOutHere(already = false) {
  if (already !== true) { try { await A.signOut(); } catch (e) { if (e.status !== 401) return toast(e.message, true); } }
  if (sheetEl.open) await closeSheet();
  held.clear(); S.own = []; S.sums.clear(); S.dirty.clear(); setActs();
  idb.clear().catch(() => {});
  welcome(already === true ? "You’re signed out. Sign in again to carry on." : "Signed out.");
}

// ---- starting ----
(async () => {
  // back from signing in on the account's page, with the code it handed back (taken out of the address at once)
  const code = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash)?.[1];
  if (code) history.replaceState(null, "", location.pathname + location.search);
  const want = location.hash.slice(1);
  if (TABS.some(([id]) => id === want)) S.tab = want;
  let m = null;
  try {
    if (code) m = await signedBack(code);
    if (!m) m = await A.me();
  } catch (e) {
    return welcome(e.offline ? "You’re offline. Fitness will be here when you’re back online." : e.message);
  }
  if (!m.signedIn) return welcome();
  arrive(m);
})();
