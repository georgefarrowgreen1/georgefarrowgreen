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
import * as G from "./progress.js";
import * as M from "./map.js";

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
// Your numbers before Fitness knows them: middling ones, each marked not set (so worked out from your rides as they
// come in, and asked in Rhythm's setup), never someone else's
const START = { ftp: 200, weight: 75, lthr: 160, maxHr: 182, restHr: 55, runPace: 330, css: 120 };
const S = {
  tab: "today", me: null, ver: 0, dirty: new Set(), inStepWorkouts: [], pulledAt: 0,
  profile: { ...START, set: [] }, examples: false, chosen: null, rhythm: null, swaps: {}, feel: {}, mine: [],
  sport: "ride", actSport: "all", formDays: 42,
  own: [], acts: [], garmin: { on: false },
  sums: new Map(), summed: false,
};
// Your record, as kept with the account, taken up here (null: none yet, so the app's own defaults)
function adopt(d) {
  const ok = (o) => o && typeof o === "object" && !Array.isArray(o), was = numbers();
  // (a record from before numbers were marked set or worked out: all of them taken to be yours)
  const kept = ok(d?.profile) ? d.profile : null;
  S.profile = { ...START, ...(kept || {}), set: kept ? (Array.isArray(kept.set) ? kept.set : Object.keys(START).filter((k) => k in kept)) : [] };
  S.chosen = ok(d?.plan) && PLANS.some((p) => p.id === d.plan.id) && Number.isFinite(d.plan.start) ? d.plan : null;
  S.rhythm = ok(d?.rhythm) && Array.isArray(d.rhythm.days) ? d.rhythm : null;
  S.swaps = ok(d?.swaps) ? d.swaps : {}; S.feel = ok(d?.feel) ? d.feel : {};
  S.mine = Array.isArray(d?.workouts) ? d.workouts : [];
  // (units as you chose them; till then, your phone's region's: miles in the US, kilometres elsewhere)
  S.unitsSet = d?.prefs?.units === "metric" || d?.prefs?.units === "imperial";
  U.metric = S.unitsSet ? d.prefs.units !== "imperial" : !/-(US|LR|MM)\b/i.test(navigator.language || "");
  S.ask = d?.prefs?.ask !== false;
  S.examples = false;   // (the example rides are gone: your own alone)
  setActs();
  // (new numbers, from another device: every ride's stress worked out again for them)
  if (numbers() !== was) resum();
}
const numbers = () => [P().ftp, P().lthr, P().runPace, P().css].join("/");
// what's kept with the account, as this device has it now
const record = () => ({ profile: (({ name, ...p }) => p)(S.profile), plan: S.chosen, rhythm: S.rhythm, swaps: S.swaps, feel: S.feel, workouts: S.mine,
  prefs: { ...(S.unitsSet ? { units: U.metric ? "metric" : "imperial" } : {}), examples: S.examples, ...(S.ask === false ? { ask: false } : {}) } });
// Your numbers from your rides, for those you haven't set: FTP from your best 20 minutes of the last 90 days (95% of
// it), max heart rate the highest in any of them (and threshold heart rate 90% of that, unless you've set it)
const isSet = (k) => (P().set || []).includes(k);
function estimates() {
  const since = addDays(TODAY, -90), rides = S.own.filter((a) => a.start >= since && a.sport === "ride");
  const b20 = Math.max(0, ...rides.map((a) => sumOf(a)?.curve?.[1200] || 0)), hr = Math.max(0, ...S.own.map((a) => sumOf(a)?.maxHr || 0));
  return { ftp: b20 >= 60 ? Math.round(b20 * 0.95) : null, maxHr: hr >= 120 && hr <= 230 ? Math.round(hr) : null, rides: rides.filter((a) => sumOf(a)?.curve?.[1200]).length };
}
function estimate() {
  const e = estimates(), ch = {};
  if (e.ftp && !isSet("ftp") && Math.abs(e.ftp - P().ftp) >= 3) ch.ftp = e.ftp;
  if (e.maxHr && !isSet("maxHr") && e.maxHr !== P().maxHr) { ch.maxHr = e.maxHr; if (!isSet("lthr")) ch.lthr = Math.round(e.maxHr * 0.9); }
  if (!Object.keys(ch).length) return;
  S.profile = { ...P(), ...ch, ...(ch.ftp ? { ftpLog: logFtp(ch.ftp, 0) } : {}) }; keep("profile"); resum(); redraw();
}
// FTP as it changes, a day at a time (a change the same day replaces that day's), for Progress
function logFtp(v, set) {
  const log = (P().ftpLog || []).filter((x) => x[0] !== TODAY);
  return [...log, [TODAY, Math.round(v), set ? 1 : 0]].slice(-120);
}
// one of your numbers set by you: kept as it is from now on
function setNumber(k, v) {
  S.profile = { ...P(), [k]: v, set: [...new Set([...(P().set || []), k])], ...(k === "ftp" ? { ftpLog: logFtp(v, 1) } : {}) };
  // (threshold heart rate follows your max, till you set it too)
  if (k === "maxHr" && !isSet("lthr")) S.profile.lthr = Math.round(v * 0.9);
  keep("profile");
}
// A change to your record: kept with your account a moment later (a few changes go as one), from the version this
// device had. Where another device has changed it meanwhile, the two are put together (each part this device changed
// its own, the days and workouts joined) and sent again.
let saveT = null;
function keep(...parts) { if (!S.me) return; for (const x of parts) S.dirty.add(x); clearTimeout(saveT); saveT = setTimeout(inStep, 700); morningRefresh(); }
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
const TABS = [["today", "Today", "today"], ["plan", "Plan", "plan"], ["activities", "Activities", "list"], ["progress", "Progress", "trend"]];
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
  const views = { today: todayView, plan: planView, activities: activitiesView, progress: progressView };
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
  // done: against what was planned (where it was the same sport), and what tomorrow brings
  if (done.length) {
    const a = done[0], s = sumOf(a), pl = w && w.sport === a.sport ? w : null, pt = pl ? Math.round(measure(pl, paceFor(pl.sport)).tss) : null;
    const nd = rhythmOn() ? rhDay(addDays(TODAY, 1)) : null, nw = nd?.id ? wkById(nd.id) : null;
    const fig = (k, v) => h("div", {}, h("small", { text: k }), h("b", { text: v }));
    const how = pl && s?.tss != null && pt ? (s.tss > pt * 1.1 ? "A bit more than planned. " : s.tss < pt * 0.9 ? "A bit less than planned: no matter. " : "Right on target. ") : "";
    return h("div.card.hero.glass.session.done", {},
      h("span.sport.ok", {}, h("i.s-" + a.sport, {}, icon("check", 14, 3)), pl ? "Done today · as planned" : "Done today"),
      h("h2", { text: pl ? pl.name : a.name }),
      s && h("div.done-figs", {}, pl && pt ? [fig("Planned", `TSS ${pt}`), fig("Ridden", s.tss != null ? `TSS ${s.tss}` : "–"), fig("Time", dur(s.moving))]
        : [fig("Time", dur(s.moving)), fig("Distance", s.dist ? dist(s.dist) : "–"), fig("Training stress", s.tss != null ? String(s.tss) : "–")]),
      h("p.about", { text: how + (nd ? (nw ? `Tomorrow: ${nw.name}, ${dur(nd.mins * 60)}.` : "Tomorrow: rest, so today sinks in.") : "") }),
      h("div.acts", {}, h("button.pill", { type: "button", onclick: () => openAct(a) }, "See the ride")));
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
      w.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => download(w) }, icon("download", 17, 2.2), "Download"),
      h("button.pill", { type: "button", onclick: () => (rd ? openSheet(() => sessionView(TODAY), { tall: true }) : openWorkout(w)) }, "Details"),
      swapped && h("button.pill", { type: "button", onclick: () => { delete S.swaps[TODAY]; keep("swaps"); redraw(); } }, "Undo swap")),
    w.sport !== "strength" && dlFor(w, TODAY));
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
    h("div.acts", { vars: { "margin-top": "12px" } }, h("button.pill", { type: "button", onclick: () => openSheet(uploadFilesView) }, icon("inbox", 17, 2.1), "Bring your rides in")));
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
  if (!rhythmOn() || S.ask === false || S.feel[TODAY] || sheetEl.open) return;
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
    h("div.rh-week-head", {}, h("b", { text: "This week" }), h("button.pill.small.tinted", { type: "button", onclick: () => rhythmSetup() }, icon("edit", 14, 2.4), "Your days")),
    h("div.rh-circles", {}, wk.map((d) => { const [cls, inner] = dot(d); return h("button" + (d.date === TODAY ? ".is-today" : ""), { type: "button", onclick: () => openDay(d.date), "aria-label": `${dayLong(d.date)}: ${cls === "done" ? "done" : d.id ? wkById(d.id)?.name : "rest"}` },
      h("small", { text: d.date === TODAY ? "TODAY" : dayName(d.date).slice(0, 3).toUpperCase() }), h("span.c." + cls.replace(".", "."), {}, inner), h("small.n", { text: new Date(d.date).getDate() })); })),
    h("div.rh-balance", {}, h("div.bar", { role: "img", "aria-label": `${easy}% easy, ${100 - easy}% hard this week` }, h("i.easy", { vars: { "--w": easy + "%" } }), h("i.hard", { vars: { "--w": 100 - easy + "%" } })),
      h("span", {}, h("b", { text: dur(doneMins * 60) }), ` of ${dur(planMins * 60)} done`))));
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
      h("div.acts", {}, tw.sport !== "strength" && h("button.pill.primary", { type: "button", onclick: () => download(tw) }, "Download"), h("button.pill", { type: "button", onclick: () => openSheet(() => sessionView(TODAY), { tall: true }) }, "Details"), h("button.pill", { type: "button", onclick: () => openDay(TODAY) }, "Change")),
      tw.sport !== "strength" && dlFor(tw, TODAY)));
  } else out.push(h("button.card.glass.rh-today.rest", { type: "button", onclick: () => openDay(TODAY) }, h("span.rh-chip", {}, icon("heart", 13, 2.4), "Today · rest"), h("h2", { text: "Rest, and let it sink in" }), h("p", { text: td?.why || "Fitness is built while you recover." })));
  // coming up: three days, the rest of the week ahead a tap away
  const ahead = r.days.filter((d) => d.date > TODAY), shown = S.planMore ? ahead : ahead.slice(0, 3);
  const rowOf = (d) => { const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id ? wkById(id) : null;
    return h("button.row", { type: "button", onclick: () => openDay(d.date) }, h("span.when", {}, h("b", { text: new Date(d.date).getDate() }), h("small", { text: dayName(d.date).slice(0, 3) })),
      h("span.tx", {}, h("b", { text: w ? `${w.name}${d.strength ? " + strength" : ""}` : "Rest" }), h("small", { text: w ? `${dur(d.mins * 60)} · ${d.hard ? "hard" : "easy"}${d.moved ? " · rest day moved" : ""}` : d.why })),
      w && h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) }))); };
  out.push(section(null, h("div.group.glass.rh-coming", {}, h("div.rh-week-head", {}, h("b", { text: "Coming up" })), shown.map(rowOf),
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
    h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w, day) }, "Download"), day >= TODAY && h("button.btn.quiet", { type: "button", onclick: () => pushSheet(() => rhDayView(day)) }, "Change")),
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
    w && h("div.acts.rh-day-acts", {}, w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w, day) }, "Download"), h("button.btn.quiet", { type: "button", onclick: () => pushSheet(() => sessionView(day)) }, "Details")),
  ] };
}
// Setting Rhythm up (or changing it): four short steps, each a page of the sheet (Back pops it): when you ride, how you
// like to ride, build or hold, and the first week it gives you before anything's kept
function rhythmSetup({ first = false } = {}) {
  const editing = !!S.rhythm, draft = { ...R.DEFAULTS, ...(S.rhythm || {}) };
  draft.days = [...draft.days];
  const cancel = () => h("button.link.r", { type: "button", onclick: closeSheet }, "Cancel");
  // (the steps: someone new has had Garmin's first; little of your own riding to go by, a step asking where you've
  // been, so Rhythm starts there; your numbers, setting up, not changing your week)
  const needLevel = R.sparse(S.own.map((a) => ({ start: a.start })), TODAY);
  const STEPS = [first && "garmin", "days", needLevel && "level", !editing && "numbers", "style", "goal", "preview"].filter(Boolean);
  const dots = (k) => { const n = STEPS.indexOf(k) + 1; return h("div.rh-dots", { "aria-label": `Step ${n} of ${STEPS.length}` }, STEPS.map((_, i) => h("i" + (i + 1 === n ? ".now" : i + 1 < n ? ".done" : "")))); };
  const top = (k, title, sub) => [dots(k), h("div.sheet-top", {}, h("h1", { text: title }), sub && h("div.sub", { text: sub }))];
  const next = (label, view) => h("button.btn.rh-next", { type: "button", onclick: () => pushSheet(view) }, label);
  // 1. When you ride: a bar a day, dragged up to how long you have (to 6 hours, by quarter hours); or a day tapped, and
  // its time a quarter hour at a time (all the way down: a rest day)
  // (said short, so a day's label fits over its bar: 45m, 1h, 1h45)
  const MAX = 360, said = (v) => (!v ? "Rest" : v < 60 ? `${v}m` : `${Math.floor(v / 60)}h${v % 60 ? String(v % 60).padStart(2, "0") : ""}`);
  const days = () => {
    const total = h("b"), count = h("span"), NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const sum = () => { const n = draft.days.filter((x) => x).length; total.textContent = n ? dur(draft.days.reduce((a, x) => a + x, 0) * 60) : "No days yet"; count.textContent = `${plural(n, "day")} · ${plural(7 - n, "rest")}`; };
    if (days.sel == null) days.sel = Math.max(0, draft.days.findIndex((x) => x));
    const paints = [], selName = h("b"), selVal = h("output");
    const step = (d) => { const i = days.sel, x = draft.days[i]; let v = x + d; if (d > 0 && !x) v = 30; else if (v < 30) v = 0; draft.days[i] = Math.max(0, Math.min(MAX, v)); paints[i](); };
    const pick = (i) => { days.sel = i; paints.forEach((p) => p()); };
    const cols = draft.days.map((v, i) => {
      const label = h("span.v", { text: said(v) }), bar = h("i"), track = h("div.track", {}, bar);
      const paint = () => { const x = draft.days[i]; bar.className = x ? "" : "rest"; bar.style.setProperty("--h", (x ? Math.max(8, (x / MAX) * 100) : 4) + "%"); label.textContent = said(x); track.setAttribute("aria-valuenow", x); track.setAttribute("aria-valuetext", said(x)); sum();
        track.classList.toggle("sel", days.sel === i); if (days.sel === i) { selName.textContent = NAMES[i]; selVal.textContent = x ? dur(x * 60) : "Rest"; } };
      paints[i] = paint;
      const at = (e) => { const r = track.getBoundingClientRect(), f = 1 - (e.clientY - r.top) / r.height, m = Math.round((f * MAX) / 15) * 15; return m < 30 ? 0 : Math.min(MAX, m); };
      let down = null;
      track.addEventListener("pointerdown", (e) => { down = { y: e.clientY, moved: false }; track.setPointerCapture(e.pointerId); e.preventDefault(); });
      track.addEventListener("pointermove", (e) => { if (!down) return; if (Math.abs(e.clientY - down.y) > 4) down.moved = true; if (down.moved) { draft.days[i] = at(e); paint(); } });
      track.addEventListener("pointerup", () => { if (down) pick(i); down = null; });
      track.addEventListener("focus", () => pick(i));
      track.addEventListener("keydown", (e) => { const d = { ArrowUp: 15, ArrowRight: 15, ArrowDown: -15, ArrowLeft: -15 }[e.key]; if (d) { e.preventDefault(); days.sel = i; step(d); } });
      Object.assign(track, { tabIndex: 0 }); track.setAttribute("role", "slider"); track.setAttribute("aria-label", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]); track.setAttribute("aria-valuemin", 0); track.setAttribute("aria-valuemax", MAX);
      setTimeout(paint);
      return h("div.rh-day", {}, label, track, h("small", { text: "MTWTFSS"[i] }));
    });
    const preset = (name, v) => h("button.pill.small", { type: "button", onclick: () => { draft.days = [...v]; Sheet.redraw(); } }, name);
    setTimeout(sum);
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("days", "When do you ride?", "Drag each day up to how long you usually have, or tap a day and use − and +. All the way down is a rest day."),
      h("div.card.rh-days", {}, h("div.rh-sum", {}, total, count), h("div.rh-bars", {}, cols)),
      h("div.rh-daystep", {}, selName, h("span.stepper", { role: "group", "aria-label": "That day’s time" },
        h("button", { type: "button", "aria-label": "15 minutes less", onclick: () => step(-15) }, icon("minus", 16, 2.4)), selVal,
        h("button", { type: "button", "aria-label": "15 minutes more", onclick: () => step(15) }, icon("plus", 16, 2.4)))),
      section("Or start from", h("div.rh-presets", {}, preset("Evenings and weekends", [0, 60, 60, 60, 0, 150, 90]), preset("Weekends only", [0, 0, 0, 0, 0, 180, 150]), preset("Most days", [45, 75, 60, 75, 0, 180, 120]))),
      h("button.btn.rh-next", { type: "button", onclick: () => (draft.days.some((x) => x) ? pushSheet(needLevel ? level : editing ? style : numbersStep) : toast("Choose at least one day to ride", true)) }, "Next")] };
  };
  // 1b. Where you've been riding lately (only with less than a month of your own rides to go by)
  const level = () => {
    if (!draft.level) draft.level = "some";
    const opt = (k, t, sub) => h("button.rh-choice" + (draft.level === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.level === k), onclick: () => { draft.level = k; Sheet.redraw(); } },
      h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })), h("span.tick", {}, draft.level === k ? icon("check", 13, 3.2) : null));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [dots("level"), h("div.sheet-top", {}, h("h1", { text: "How much have you been riding?" }),
      h("div.sub", { text: `The last month or so. ${S.own.length ? `You’ve uploaded ${plural(S.own.length, "ride")}, so` : "With no rides uploaded yet,"} Rhythm starts from this, and learns from every ride you add.` })),
      h("div.rh-choices", { role: "radiogroup", "aria-label": "Riding lately" },
        opt("none", "Hardly at all", "Starting again, or new to it"), opt("some", "A ride or two a week", "About 2 to 4 hours"), opt("regular", "Most weeks, regularly", "About 5 to 8 hours"), opt("lots", "A lot", "9 hours or more")),
      next("Next", editing ? style : numbersStep)] };
  };
  // 1c. Your numbers: every target's set from them (worked out from your rides till you set them)
  const numbersStep = () => ({ title: "Rhythm", right: cancel(), body: [...top("numbers", "Your numbers", "Every target in your plan is set from these. Not sure? Leave them: Fitness works them out from your rides, and keeps them up to date."),
    h("div.group", {}, stepper("FTP", "ftp", (v) => `${v} W`, 5, 80, 500), stepper("Weight", "weight", (v) => weight(v), 0.5, 35, 150), stepper("Max heart rate", "maxHr", (v) => `${v} bpm`, 1, 120, 230)),
    h("p.rh-note", { text: "Threshold heart rate and paces follow from these. Change any of them in You." }),
    next("Next", style)] });
  // 2. How you like to ride, and a run and a swim
  const pic = (bars) => h("span.rh-pic", { "aria-hidden": "true" }, bars.map(([v, z]) => h("i.bg-" + z, { vars: { "--h": v + "%" } })));
  const style = () => {
    const choice = (k, title, sub, bars) => h("button.rh-choice" + (draft.lean === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(draft.lean === k), onclick: () => { draft.lean = k; Sheet.redraw(); } },
      pic(bars), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })), h("span.tick", {}, draft.lean === k ? icon("check", 13, 3.2) : null));
    const tile = (k, ic, title) => h("button.rh-tile" + (draft[k] ? ".on." + k : ""), { type: "button", "aria-pressed": String(!!draft[k]), onclick: () => { draft[k] = !draft[k]; Sheet.redraw(); } },
      h("span.ic", {}, icon(ic, 18, 2)), h("b", { text: title }), h("small", { text: draft[k] ? "On" : "Off" }));
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("style", "How do you like to ride?", "Rhythm keeps every kind of effort sharp; this is where it leans."),
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
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("goal", "Build, or hold?", "You can change this any time, say for a busy month."),
      h("div.rh-goals", { role: "radiogroup", "aria-label": "Build or hold" },
        card("build", "Keep building", "Up a few points a week, never faster, with a lighter week every fourth. Uses all the time you gave.", "M0 54 C40 50, 60 46, 90 42 S 130 40, 150 40 C170 40, 190 32, 230 26 S 280 20, 300 18 L326 14", "up"),
        card("hold", "Hold where I am", "Fitness kept level with less riding: shorter sessions, the hard work kept.", "M0 32 C40 28, 70 34, 110 31 S 170 28, 200 32 S 270 34, 326 30", "level")),
      h("div.rh-ftp", {}, icon("info", 18, 2), h("span", {}, "Your FTP is ", h("b", { text: `${P().ftp} W` }), isSet("ftp") ? ", as you set it." : ", worked out from your rides till you set it.", " Rhythm sets every interval from it, and from your power curve once your rides show it.")),
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
    return { title: editing ? "Your week" : "Rhythm", right: cancel(), body: [...top("preview", editing ? "Your next seven days" : "Your first week", `${R.THEMES[r.block.theme]} block${r.block.absorb ? ", a lighter week" : ""}. Each day firms up that morning, from what you’ve done and how you feel.`),
      h("div.group", {}, ds.map(rowOf)),
      h("div.rh-stats", {}, [["Time", dur(mins * 60)], ["Hard days", String(hard.length)], ["Easy", `${easy}%`]].map(([k, v]) => h("div", {}, h("small", { text: k }), h("b", { text: v })))),
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
      w.sport !== "strength" && h("button.btn", { type: "button", onclick: () => download(w) }, icon("download", 19, 2.2), "Download"),
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
// Download: a workout as a .fit file named by its day. Straight away for the device you chose last (else the one your
// rides come from), then how to get it on; or a choice of device, the first time
const dayStamp = (day) => { const dt = new Date(day); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
function myDevice() {
  const k = store.get("device", null);
  if (k?.brand === "garmin" || k?.brand === "wahoo") return k;
  const d = S.own.find((a) => /garmin|wahoo/i.test(a.device || ""));
  return d ? { brand: /wahoo/i.test(d.device) ? "wahoo" : "garmin", name: d.device } : null;
}
function download(w, day = TODAY, dev = myDevice()) {
  const show = (v) => (sheetEl.open ? pushSheet(v) : openSheet(v));
  if (!dev) return show(() => sendView(w, day));
  const name = `${dayStamp(day)}.fit`;
  saveFile(name, F.fitFromWorkout(w, { pace: paceFor(w.sport) }));
  show(() => savedView(w, day, dev, name));
}
const devName = (dev) => dev.name || (dev.brand === "wahoo" ? "Wahoo" : "Garmin");
// (under a Download button: which device it's for, and another a tap away)
function dlFor(w, day) {
  const dev = myDevice();
  return dev && h("p.dl-for", {}, `For your ${devName(dev)} · `, h("button.link.small", { type: "button", onclick: () => openSheet(() => sendView(w, day)) }, "Another device?"));
}
function sendView(w, day = TODAY) {
  const file = (title, brand) => row({ tile: h("span.ic.brand." + brand, {}, icon("device", 18, 2)), title, sub: ".fit workout file", chev: false,
    extra: h("span.get", { "aria-hidden": "true" }, icon("download", 18, 2.2)), onclick: () => {
      const was = myDevice(), dev = was?.brand === brand ? was : { brand, name: brand === "wahoo" ? "Wahoo" : "Garmin" };
      store.set("device", dev); download(w, day, dev);
    } });
  return { title: "Download", body: [h("div.sheet-top", {}, h("h1", { text: dayStamp(day) }), h("div.sub", { text: "Which device is it for?" })), h("div.group", {}, file("Garmin", "garmin"), file("Wahoo", "wahoo"))] };
}
// Saved: and how to get it onto your device, step by step
function savedView(w, day, dev, name) {
  const steps = dev.brand === "wahoo"
    ? ["Open the file on your phone, and share it to the ELEMNT app", "The ELEMNT app sends it to your device", "On your ELEMNT, it’s under Workouts"]
    : ["Plug it into a computer with its cable", "Copy the file into the Garmin › NewFiles folder", "Unplug it: the workout’s under Training › Workouts"];
  return { title: dayStamp(day), body: [
    h("div.saved", {}, h("span.ok", {}, icon("check", 15, 3)), h("span", {}, h("b", { text: "Saved" }), ` as ${name}, in your downloads`)),
    section(`Onto your ${devName(dev)}`, h("div.group", {}, steps.map((t, i) => h("div.row.plain", {}, h("span.ic.soft.blue.num", {}, h("b", { text: String(i + 1) })), h("span.tx", {}, h("b.light", { text: t })))))),
    section(null, h("div.group", {}, row({ icon: "device", tint: "grey", title: "Another device", onclick: () => pushSheet(() => sendView(w, day)) }))),
  ] };
}

// ---- the map under a route (map.js): the points along it (a few thousand at most), each its stretch's colour ----
const lightNow = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "light" : !matchMedia("(prefers-color-scheme: dark)").matches);
function routeOf(s, zoneAt) {
  const idx = []; for (let i = 0; i < s.t.length; i++) if (s.lat[i] != null && s.lon[i] != null) idx.push(i);
  const step = Math.max(1, Math.ceil(idx.length / 3000)), use = idx.filter((_, j) => j % step === 0 || j === idx.length - 1);
  const css = getComputedStyle(document.documentElement), col = {};
  const colourOf = (z) => (col[z] ??= css.getPropertyValue("--" + z).trim() || "#0a84ff");
  return { coords: use.map((i) => [s.lon[i], s.lat[i]]), colours: zoneAt ? use.map((i) => colourOf(zoneAt(i))) : null };
}
// the map's credits, as Weather has them: a © in the corner, that opens out into them when tapped (and folds again)
function mapCredit() {
  const b = h("button.map-credit.folded", { type: "button", "aria-label": "Map data © OpenStreetMap, OpenFreeMap", "aria-expanded": "false",
    onclick: (e) => { e.stopPropagation(); const open = b.classList.toggle("folded"); b.setAttribute("aria-expanded", String(!open)); } },
  h("span.mc-c", { "aria-hidden": "true", text: "©" }), h("span.mc-t", { "aria-hidden": "true", text: " OpenStreetMap, OpenFreeMap" }));
  b.addEventListener("keydown", (e) => e.stopPropagation());
  return b;
}
// the route's map, the whole sheet, to move and zoom
function bigMapView(name, route) {
  const holder = h("div.map-gl.big", {}, mapCredit());
  setTimeout(() => M.routeMap(holder, { ...route, light: lightNow(), explore: true }).catch(() => {}), 350);
  return { title: name, body: [holder] };
}

// ---- Progress: how you're coming on, the story first (progress.js has the figures) ----
const RANGES = [[42, "6 wk"], [91, "3 mo"], [182, "6 mo"], [365, "Year"]];
// (each with its figures as now; its time in zones as worked out when it came in, where a new FTP has cleared them since)
const progActs = () => S.own.map((a) => { const s = sumOf(a) || a.sum; return { id: a.id, name: a.name, start: a.start, sport: a.sport, sum: s && { ...s, zones: s.zones || a.sum?.zones, hrZones: s.hrZones || a.sum?.hrZones } }; }).filter((a) => a.sum);
const monthOf = (t, len = "long") => new Date(t).toLocaleDateString("en-GB", { month: len });
const pRange = () => { const d = store.get("prange", 182); return RANGES.some(([v]) => v === d) ? d : 182; };
const f1n = (v) => (Math.round(v * 10) / 10).toFixed(1);
const signedW = (v) => (v > 0 ? `+${v} W` : v < 0 ? `−${-v} W` : "Held");
// FTP on a day, from its log (before the log began: the first it has; none at all: today's)
function ftpOn(day) {
  const log = P().ftpLog || [];
  let v = log.length ? log[0][1] : P().ftp;
  for (const [d, w] of log) if (d <= day) v = w;
  return v;
}
function progressView() {
  const days = pRange(), from = addDays(TODAY, -days), acts = progActs(), inRange = acts.filter((a) => a.start >= from), at = RANGES.findIndex(([v]) => v === days);
  const out = [head("Progress", acts.length ? `Since ${monthOf(from)} · ${plural(inRange.length, "activity", "activities")}` : "Nothing yet")];
  out.push(h("div.seg.wide.p-range", { vars: { "--n": 4, "--at": at }, role: "group", "aria-label": "Range" }, RANGES.map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": String(v === days), onclick: () => { store.set("prange", v); redraw(); } }, l))));
  if (!acts.length || !S.summed) {
    out.push(h("div.card.glass.p-empty", {}, h("span.big.ic.blue", {}, icon("trend", 26, 2.2)), h("h2", { text: "Your progress, as your rides come in" }),
      h("p", { text: "Fitness, records, how you’re riding and what’s changing: it all fills in from your activities." }),
      h("button.btn", { type: "button", onclick: () => openSheet(S.garmin?.on ? uploadFilesView : garminView) }, "Bring your rides in")));
    return out;
  }
  // the story: fitness over the range, and where it's heading
  const f = fitnessSeries(), pts = f.filter((x) => x.day >= from), last = f.at(-1);
  const fit = Math.round(last.ctl), gain = Math.round(last.ctl - (pts[0]?.ctl ?? last.ctl)), top = Math.max(...f.map((x) => x.ctl));
  let ramp = 0; for (let i = 7; i < pts.length; i++) ramp = Math.max(ramp, pts[i].ctl - pts[i - 7].ctl);
  // (where it's heading: the last fortnight's rise carried on a while, a fifth of the range, between 10 days and 5 weeks)
  const ahead = Math.round(Math.min(35, Math.max(10, days * 0.2))), slope = f.length > 15 ? (last.ctl - f.at(-15).ctl) / 14 : 0, proj = slope > 0.05 ? Math.round(last.ctl + slope * ahead) : null;
  const badge = last.ctl >= top - 0.5 && gain > 0 ? "The fittest you’ve been" : gain > 2 ? "Building" : gain < -2 ? "Easing off" : "Holding steady";
  const said = gain > 0 ? `Up ${gain} since ${monthOf(from)}${ramp >= 1 ? `, never more than ${Math.ceil(ramp)} a week` : ""}.${proj && proj > fit ? ` At this rate, ${proj} by ${ahead >= 28 ? monthOf(addDays(TODAY, ahead)) : dayShort(addDays(TODAY, ahead))}.` : ""}`
    : gain < 0 ? `Down ${-gain} since ${monthOf(from)}: ${last.tsb > 5 ? "fresher for it." : "a lighter spell."}` : `Level since ${monthOf(from)}.`;
  out.push(h("div.card.p-hero", {},
    h("span.p-badge", {}, icon("trend", 12, 3), badge),
    h("div.p-big", {}, h("b", { text: String(fit) }), h("span", { text: "fitness" }), h("span.p-gain", { text: gain >= 0 ? `+${gain}` : `−${-gain}` })),
    h("p", { text: said }), heroChart(pts, proj, from, acts, ahead)));
  // the tiles: FTP, power to weight, your average week, and form
  const wk = G.weekly(acts, TODAY, Math.max(6, Math.ceil(days / 7))), avg = wk.reduce((a, w) => a + w.secs, 0) / wk.length, ftp0 = ftpOn(from), dF = P().ftp - ftp0, said2 = formSaid(last.tsb);
  const log = [[from, ftp0], ...(P().ftpLog || []).filter((x) => x[0] > from).map((x) => [x[0], x[1]]), [TODAY, P().ftp]];
  const twelve = G.weekly(acts, TODAY, 12), maxW = Math.max(1, ...twelve.map((w) => w.secs));
  out.push(h("div.p-tiles", {},
    pTile("FTP", "c-ftp", [`${P().ftp}`, " W"], svgOf(stepSpark(log, from)), dF ? signedW(dF) : "Held", dF >= 0, () => openSheet(engineView, { tall: true })),
    pTile("Power to weight", "c-wkg", [f1n(P().ftp / P().weight), " W/kg"], svgOf(stepSpark(log.map(([d, w]) => [d, w / P().weight]), from)), dF ? `${dF > 0 ? "+" : "−"}${f1n(Math.abs(dF) / P().weight)}` : "Held", dF >= 0, () => openSheet(engineView, { tall: true })),
    pTile("A week, on average", "c-wk", [dur(avg)], h("span.p-bars", { "aria-hidden": "true" }, twelve.map((w, i) => h("i" + (i === 11 ? ".now" : ""), { vars: { "--h": Math.max(4, (w.secs / maxW) * 100) + "%" } }))), `${Math.round(wk.reduce((a, w) => a + w.tss, 0) / wk.length)} TSS`, null, () => openSheet(trainingView, { tall: true })),
    h("button.p-tile.p-form", { type: "button", onclick: () => openSheet(formView) }, svgOf(ringSvg(Math.max(0, Math.min(1, (last.tsb + 30) / 50)), signed(last.tsb), "form")), h("span.tx", {}, h("small", { text: "Form" }), h("b", { text: said2.word }), h("small", { text: said2.tone === "fresh" ? "Ready for a hard day" : said2.tone === "high" ? "Time for an easy day" : said2.tone === "productive" ? "Getting fitter" : "Steady" })))));
  // what stands out
  const cards = insights(acts, from);
  out.push(section(["What stands out", h("span.aside", { text: cards.length > 1 ? `${cards.length} things` : "" })], cards.length ? h("div.p-cards", {}, cards) : h("p.foot.none", { text: "Ride a few more weeks, and what stands out shows here." })));
  // every day, the last 26 weeks
  out.push(section(["Every day", h("span.aside", { text: `${new Set(acts.filter((a) => a.start >= addDays(TODAY, -181)).map((a) => startOfDay(a.start))).size} days riding` })], calendarCard(acts)));
  out.push(section(null, h("div.group.glass", {},
    row({ icon: "medal", tint: "amber", title: "Power", sub: "Your curve, records and what kind of rider", onclick: () => openSheet(powerView, { tall: true }) }),
    row({ icon: "list", tint: "blue", title: "Training", sub: "Volume, consistency and how hard", onclick: () => openSheet(trainingView, { tall: true }) }),
    row({ icon: "heart", tint: "red", title: "Engine", sub: "FTP, efficiency and staying power", onclick: () => openSheet(engineView, { tall: true }) }))));
  return out;
}
function pTile(label, c, big, chart, delta, up, onclick) {
  return h("button.p-tile", { type: "button", onclick }, h("small", {}, h("i." + c), label), h("b", {}, big[0], big[1] && h("u", { text: big[1] })), h("span.p-spark." + c, {}, chart),
    h("span.p-delta" + (up === true ? ".up" : up === false ? ".down" : ""), { text: delta }));
}
// a tiny stepped line, of values by day ([day, value] from the range's start to today)
function stepSpark(log, from) {
  const W = 140, H = 30, span = Math.max(DAY, TODAY - from), vs = log.map((x) => x[1]), lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
  const x = (d) => Math.max(0, Math.min(W, ((d - from) / span) * W)), y = (v) => H - 4 - ((v - lo) / r) * (H - 8);
  let d = `M0 ${y(log[0][1]).toFixed(1)}`;
  for (let i = 1; i < log.length; i++) d += `H${x(log[i][0]).toFixed(1)}V${y(log[i][1]).toFixed(1)}`;
  d += `H${W}`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
// a ring, part full, a word in it
function ringSvg(frac, word, cls) {
  const r = 22, c = 2 * Math.PI * r;
  return `<svg class="p-ring ${cls}" width="56" height="56" viewBox="0 0 56 56" role="img" aria-label="${cls} ${word}"><circle cx="28" cy="28" r="${r}" class="bg"/><circle cx="28" cy="28" r="${r}" class="fg" stroke-dasharray="${(frac * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/><text x="28" y="33" text-anchor="middle">${word}</text></svg>`;
}
// fitness over the range, glowing; a dotted line to where it's heading; and a mark or two: a week off, a record
function heroChart(pts, proj, from, acts, aheadDays) {
  if (pts.length < 2) return null;
  const W = cardW(true), H = 150, B = 26, n = pts.length, step = Math.max(1, Math.floor(n / 90)), use = pts.filter((_, i) => i % step === 0 || i === n - 1);
  const ahead = proj ? aheadDays : 0, span = Math.max(1, TODAY - from + ahead * DAY), vs = [...use.map((p) => p.ctl), proj || 0], lo = Math.min(...vs) * 0.9, hi = Math.max(...vs) * 1.06 || 1;
  const x = (d) => ((d - from) / span) * (W - 6) + 3, y = (v) => H - B - ((v - lo) / (hi - lo)) * (H - B - 14);
  const line = use.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.ctl).toFixed(1)}`).join(""), lx = x(TODAY), ly = y(pts.at(-1).ctl);
  let marks = "";
  // (a week or more with nothing, after riding had begun: the first such in the range)
  const daysOn = new Set(acts.map((a) => startOfDay(a.start))), began = Math.max(from, Math.min(...daysOn));
  for (let d = began, run = 0; d < TODAY; d = addDays(d, 1)) { run = daysOn.has(d) ? 0 : run + 1; if (run === 8) { const dd = addDays(d, -4), p = pts.find((q) => q.day >= dd); if (p) marks += `<circle cx="${x(p.day).toFixed(1)}" cy="${y(p.ctl).toFixed(1)}" r="3.5" class="m-off"/><text x="${x(p.day).toFixed(1)}" y="${(y(p.ctl) + 16).toFixed(1)}" text-anchor="middle">a week off</text>`; break; } }
  // (your best 20 minutes in the range, where it's your best ever)
  const b = G.bests(acts, from)[1200], all = G.bests(acts)[1200];
  if (b && all && b.id === all.id) { const p = pts.find((q) => q.day >= startOfDay(b.start)), px = p && x(p.day);
    // (its words only where they'd not sit on today's)
    if (p) marks += `<circle cx="${px.toFixed(1)}" cy="${y(p.ctl).toFixed(1)}" r="3.5" class="m-best"/>${lx - px > 50 ? `<text x="${px.toFixed(1)}" y="${(y(p.ctl) - 10).toFixed(1)}" text-anchor="middle">20-min best</text>` : ""}`; }
  return svgOf(`<svg class="p-hero-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fitness over the range${proj ? `, heading for ${proj}` : ""}">
    <defs><linearGradient id="phf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="phg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>
    <line x1="0" y1="${H - B}" x2="${W}" y2="${H - B}" class="axis"/>
    <path d="${line}L${lx.toFixed(1)} ${H - B}L${x(use[0].day).toFixed(1)} ${H - B}Z" fill="url(#phf)"/>
    <path d="${line}" class="ln"/>
    ${proj ? `<path d="M${lx.toFixed(1)} ${ly.toFixed(1)}L${(W - 3).toFixed(1)} ${y(proj).toFixed(1)}" class="proj"/>` : ""}
    ${marks}
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="10" class="glow" filter="url(#phg)"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5.5" class="dot"/>
    <text x="3" y="${H - 6}" class="lab">${monthOf(from, "short")}</text>${!proj || W - lx > 80 ? `<text x="${lx.toFixed(1)}" y="${H - 6}" text-anchor="${proj ? "middle" : "end"}" class="lab">Now</text>` : ""}${proj ? `<text x="${W - 3}" y="${H - 6}" text-anchor="end" class="lab">${aheadDays >= 28 ? monthOf(addDays(TODAY, aheadDays), "short") : dayShort(addDays(TODAY, aheadDays))}</text>` : ""}
  </svg>`);
}
// What stands out: a new best, your engine, how hard this month, consistency; each a card, each a tap to more
function insights(acts, from) {
  const out = [], cut = addDays(TODAY, -14), now = G.bests(acts, cut), before = G.bests(acts, -Infinity, cut);
  let pick = null;
  for (const [k, , words] of G.LENGTHS) { const n = now[k], b = before[k]; if (n && (!b || n.w > b.w)) { const rel = b ? (n.w - b.w) / b.w : 0.01; if (!pick || rel > pick.rel) pick = { k, words, n, b, rel }; } }
  const card = (cls, ic, kicker, title, sub, onclick) => h("button.p-card." + cls, { type: "button", onclick }, h("span.p-card-top", {}, h("span.ic", {}, icon(ic, 19, 2.2)), h("small", { text: kicker })), h("b", { text: title }), h("span", { text: sub }));
  if (pick) out.push(card("gold", "medal", "A new best", `${pick.n.w} W for ${pick.words}`, `${dayName(startOfDay(pick.n.start))}: ${pick.n.name}${pick.b ? `, ${pick.n.w - pick.b.w} W over your best before` : ""}.`, () => { S.plen = G.LENGTHS.findIndex(([k]) => k === pick.k); openSheet(powerView, { tall: true }); }));
  const e = G.efficiency(acts, from);
  if (e.enough && Math.abs(e.watts) >= 3) out.push(card("red", "heart", "Your engine", e.watts > 0 ? `${e.watts} W more, same heartbeat` : `${-e.watts} W less at the same heartbeat`, `On steady rides at ${e.hr} bpm, since ${monthOf(from)}.`, () => openSheet(engineView, { tall: true })));
  const it = G.intensity(acts, addDays(TODAY, -30));
  if (it && it.secs > 3 * 3600) { const pe = Math.round(it.easy * 100);
    out.push(card("blue", "gauge", "This month", `${pe}% easy`, it.easy >= 0.75 && it.mid < 0.15 ? "Right where it should be: the hard days count." : it.mid >= 0.2 ? "A lot in the grey middle: easy days easier, hard days harder." : it.easy < 0.7 ? "More hard riding than most can take in: lean on the easy days." : "A good mix, mostly easy.", () => openSheet(trainingView, { tall: true }))); }
  const st = G.streak(G.weekly(acts, TODAY, 52));
  if (st.now >= 3) out.push(card("green", "check", "Consistency", `${st.now} weeks in a row`, `Riding twice a week or more.${st.best > st.now ? ` Your best run: ${st.best} weeks.` : " Your best run yet."}`, () => openSheet(trainingView, { tall: true })));
  return out;
}
// every day of the last 26 weeks, a square each, deeper the harder it was
function calendarCard(acts) {
  const first = addDays(mondayOf(TODAY), -7 * 25), d = G.daily(acts, TODAY, 182 + 7), cells = [];
  const lvl = (t) => (t <= 0 ? 0 : t < 40 ? 1 : t < 80 ? 2 : t < 120 ? 3 : 4);
  for (let c = 0; c < 26; c++) for (let r = 0; r < 7; r++) {
    const day = addDays(first, c * 7 + r), i = Math.round((day - d.from) / DAY);
    cells.push(day > TODAY ? h("i.future") : h("i.l" + lvl(d.tss[i] || 0), { title: dayShort(day) }));
  }
  const months = []; for (let c = 0; c < 26; c += 1) { const day = addDays(first, c * 7); if (new Date(day).getDate() <= 7) months.push(h("span", { vars: { "--c": c }, text: monthOf(day, "short") })); }
  return h("div.card.glass.p-cal", {}, h("div.p-cal-grid", { role: "img", "aria-label": "Each day of the last six months, deeper the harder it was" }, cells),
    h("div.p-cal-foot", {}, h("div.p-cal-months", {}, months), h("span.p-cal-key", {}, "Less", [0, 1, 2, 3, 4].map((l) => h("i.l" + l)), "More")));
}

// Power: your best at every length, against the range before; tap a length; records; what kind of rider
function powerView() {
  const days = pRange(), from = addDays(TODAY, -days), acts = progActs(), b = G.bests(acts, from), prev = G.bests(acts, addDays(from, -days), from), all = G.bests(acts), old = G.bests(acts, -Infinity, addDays(TODAY, -14));
  const idx = S.plen ?? 2, [k, , words] = G.LENGTHS[idx], cur = b[k], up = cur && prev[k] ? cur.w - prev[k].w : null;
  const W = sheetW() + 36 - 36, H = 190, B = 22, lo5 = Math.log(5), hi5 = Math.log(3600);
  const xs = (t) => 4 + ((Math.log(t) - lo5) / (hi5 - lo5)) * (W - 8), vals = [...Object.values(b), ...Object.values(prev)].map((v) => v.w), top = Math.max(P().ftp * 1.2, ...vals) * 1.05, bot = Math.min(P().ftp * 0.7, ...vals) * 0.92;
  const ys = (v) => H - B - ((v - bot) / (top - bot)) * (H - B - 10);
  const path = (c) => G.CURVE_AT.filter((t) => c[t]).map((t, i) => `${i ? "L" : "M"}${xs(t).toFixed(1)} ${ys(c[t].w).toFixed(1)}`).join("");
  const p1 = path(b), p0 = path(prev), firstT = G.CURVE_AT.find((t) => b[t]), lastT = [...G.CURVE_AT].reverse().find((t) => b[t]);
  const mark = cur ? `<line x1="${xs(k).toFixed(1)}" y1="6" x2="${xs(k).toFixed(1)}" y2="${H - B}" class="cross"/><circle cx="${xs(k).toFixed(1)}" cy="${ys(cur.w).toFixed(1)}" r="9" class="halo"/><circle cx="${xs(k).toFixed(1)}" cy="${ys(cur.w).toFixed(1)}" r="5" class="pt"/>` : "";
  const chart = svgOf(`<svg class="p-curve" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your best power at every length from 5 seconds to an hour, against the range before">
    <defs><linearGradient id="pcf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7af0" stop-opacity="0.28"/><stop offset="1" stop-color="#2f7af0" stop-opacity="0"/></linearGradient><linearGradient id="pcl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c5cf0"/><stop offset="0.5" stop-color="#2f7af0"/><stop offset="1" stop-color="#1fa7c8"/></linearGradient></defs>
    <line x1="0" y1="${ys(P().ftp).toFixed(1)}" x2="${W}" y2="${ys(P().ftp).toFixed(1)}" class="ftp"/><text x="${W - 2}" y="${(ys(P().ftp) - 5).toFixed(1)}" text-anchor="end" class="ftpl">FTP ${P().ftp}</text>
    ${p0 ? `<path d="${p0}" class="was"/>` : ""}
    ${p1 ? `<path d="${p1}L${xs(lastT).toFixed(1)} ${H - B}L${xs(firstT).toFixed(1)} ${H - B}Z" fill="url(#pcf)"/><path d="${p1}" class="now" stroke="url(#pcl)"/>` : ""}
    ${mark}
    ${G.LENGTHS.map(([t, l]) => `<text x="${xs(t).toFixed(1)}" y="${H - 5}" text-anchor="${t === 5 ? "start" : t === 3600 ? "end" : "middle"}" class="lab">${l}</text>`).join("")}
  </svg>`);
  const rt = G.riderType(b, P().ftp);
  return { title: "Power", body: [
    h("div.card.glass.p-power", {},
      h("small.p-kick", { text: `Your best for ${words}` }),
      h("div.p-head", {}, h("b", {}, cur ? String(cur.w) : "–", h("u", { text: " W" })), cur && h("span", { text: `${f1n(cur.w / P().weight)} W/kg` }), up != null && h("span.p-gain" + (up < 0 ? ".down" : ""), { text: signedW(up) })),
      h("small.p-when", { text: cur ? `Set ${dayShort(cur.start)}: ${cur.name}` : "Not in this range" }),
      chart,
      h("div.p-lens", { role: "group", "aria-label": "Length" }, G.LENGTHS.map(([, l], i) => h("button" + (i === idx ? ".on" : ""), { type: "button", "aria-pressed": String(i === idx), onclick: () => { S.plen = i; Sheet.redraw(); } }, l))),
      h("div.p-legend", {}, h("span", {}, h("i.now"), `Since ${monthOf(from)}`), h("span", {}, h("i.was"), "The range before"))),
    section("Records", h("div.p-records", {}, G.LENGTHS.filter(([t]) => all[t]).map(([t, , w]) => { const r = all[t], was = old[t], fresh = r.start >= addDays(TODAY, -14) && was && was.w < r.w;
      return h("button.p-record" + (fresh ? ".new" : ""), { type: "button", onclick: () => { const a = S.own.find((x) => x.id === r.id); if (a) openAct(a); } },
        fresh && h("span.p-new", { text: "New" }), icon("medal", 26, 2), h("small", { text: w.replace(/^an /, "1 ") }), h("b", { text: `${r.w} W` }), h("small.d", { text: `${f1n(r.w / P().weight)} W/kg · ${dayShort(r.start)}` })); }))),
    rt && section("What kind of rider", h("div.card.glass.p-rider", {}, svgOf(radarSvg(rt.scores)), h("span.tx", {}, h("b", { text: rt.name }), h("span", { text: rt.said })))),
  ] };
}
function radarSvg(s) {
  const c = 70, R = 54, v = (x) => Math.max(0.2, Math.min(1, x / 1.3)) * R;
  const pts = [[c, c - v(s.sprint)], [c + v(s.five), c], [c, c + v(s.ftp)], [c - v(s.minute), c]].map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const ring = (k) => `${c},${c - R * k} ${c + R * k},${c} ${c},${c + R * k} ${c - R * k},${c}`;
  return `<svg class="p-radar" width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Your strengths: sprint, 5 minutes, FTP and 1 minute"><defs><linearGradient id="prd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cf0" stop-opacity="0.55"/><stop offset="1" stop-color="#2f7af0" stop-opacity="0.35"/></linearGradient></defs>
    <g class="grid"><polygon points="${ring(1)}"/><polygon points="${ring(0.66)}"/><polygon points="${ring(0.33)}"/><line x1="${c}" y1="${c - R}" x2="${c}" y2="${c + R}"/><line x1="${c - R}" y1="${c}" x2="${c + R}" y2="${c}"/></g>
    <polygon points="${pts}" fill="url(#prd)" class="shape"/>
    <text x="${c}" y="10" text-anchor="middle">Sprint</text><text x="138" y="${c + 3}" text-anchor="end">5 min</text><text x="${c}" y="138" text-anchor="middle">FTP</text><text x="2" y="${c + 3}">1 min</text></svg>`;
}

// Training: week by week, how much and how hard; consistency; this month's mix; month by month
function trainingView() {
  const acts = progActs(), wk = G.weekly(acts, TODAY, 26), first4 = wk.slice(0, 4), last4 = wk.slice(-5, -1);
  const avg = (ws) => ws.reduce((a, w) => a + w.secs, 0) / Math.max(1, ws.length), d = avg(last4) - avg(first4), all = avg(wk);
  // (the scale in whole steps of an hour or so, two or three lines up the chart)
  const peak = Math.max(3600, ...wk.map((w) => w.secs)), step = [1800, 3600, 7200, 10800, 18000, 36000].find((x) => peak / x <= 3) || 36000, max = Math.ceil(peak / step) * step;
  const grid = Array.from({ length: max / step }, (_, k) => (k + 1) * step).map((v) => h("span.p-wgrid", { vars: { "--y": (v / max) * 100 + "%" } }, h("u", { text: `${Math.floor(v / 3600) || ""}${v % 3600 ? "½" : ""} h` })));
  const bars = wk.map((w, i) => h("span.p-wbar" + (i === wk.length - 1 ? ".now" : "") + (w.secs ? "" : ".off"), { title: `${dayShort(w.mon)}: ${dur(w.secs)}` },
    w.secs > 0 && h("span.p-wcol", { vars: { "--h": (w.secs / max) * 100 + "%" } }, ["hard", "mid", "easy", "unknown"].map((k) => w[k] > 0 && h("i." + k, { vars: { "--f": w[k] / w.secs } })))));
  // (each month's name under its first week)
  const monthsUnder = wk.map((w, i) => { const m = new Date(w.mon).getMonth(); const starts = i === 0 ? new Date(wk[2].mon).getMonth() === m : new Date(wk[i - 1].mon).getMonth() !== m;   // (the first, only if its month has a few weeks still to run: else it'd sit on the next)
    return h("span", { text: starts ? monthOf(w.mon, "short") : "" }); });
  const st = G.streak(G.weekly(acts, TODAY, 52)), it = G.intensity(acts, addDays(TODAY, -30));
  // (Rhythm's sessions, from when it began: how many done)
  const r = rhythmOn() ? rh() : null, pd = r ? r.days.filter((x) => x.date < TODAY && x.id && x.date >= (S.rhythm.at || 0)) : [], dn = pd.filter((x) => x.done).length;
  const months = [2, 1, 0].map((k) => { const dt = new Date(TODAY); dt.setDate(1); dt.setMonth(dt.getMonth() - k); const s = dt.getTime(), e = new Date(dt.getFullYear(), dt.getMonth() + 1, 1).getTime(), xs = acts.filter((a) => a.start >= s && a.start < e);
    return { name: monthOf(s, "short"), now: k === 0, secs: xs.reduce((a, x) => a + (x.sum.moving || 0), 0), dist: xs.reduce((a, x) => a + (x.sum.dist || 0), 0), n: xs.length }; });
  const mMax = Math.max(1, ...months.map((m) => m.secs));
  const donut = it && svgOf((() => { const R = 48, C = 2 * Math.PI * R, seg = (f, off, cls) => `<circle cx="62" cy="62" r="${R}" class="${cls}" stroke-dasharray="${(f * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off * C).toFixed(1)}" transform="rotate(-90 62 62)"/>`;
    return `<svg class="p-donut" width="124" height="124" viewBox="0 0 124 124" role="img" aria-label="${Math.round(it.easy * 100)}% easy, ${Math.round(it.mid * 100)}% in between, ${Math.round(it.hard * 100)}% hard">${seg(it.easy, 0, "easy")}${seg(it.mid, it.easy, "mid")}${seg(it.hard, it.easy + it.mid, "hard")}<text x="62" y="60" text-anchor="middle" class="big">${Math.round(it.easy * 100)}%</text><text x="62" y="78" text-anchor="middle" class="sm">easy</text></svg>`; })());
  return { title: "Training", body: [
    h("div.card.glass.p-train", {},
      h("div.p-train-head", {}, h("span", {}, h("small.p-kick", { text: "Hours a week, by zone" }), h("b", {}, dur(all), h("u", { text: " on average" }))), Math.abs(d) >= 600 && h("span.p-gain" + (d < 0 ? ".down" : ""), { text: `${d > 0 ? "+" : "−"}${dur(Math.abs(d))} since ${monthOf(wk[0].mon, "short")}` })),
      h("div.p-wchart", {}, h("div.p-wbars", { role: "img", "aria-label": `26 weeks of hours, each split into easy, in between and hard; ${dur(all)} a week on average` }, grid,
        all > 0 && h("span.p-wavg", { vars: { "--y": (all / max) * 100 + "%" } }, h("u", { text: "avg" })), bars), h("div.p-wmonths", { "aria-hidden": "true" }, monthsUnder)),
      h("div.p-legend", {}, h("span", {}, h("i.easy"), "Easy"), h("span", {}, h("i.mid"), "In between"), h("span", {}, h("i.hard"), "Hard"), wk.some((w) => w.unknown) && h("span", {}, h("i.unknown"), "No zones"))),
    h("div.p-pair", {},
      pd.length >= 4 && h("div.p-mini.green", {}, svgOf(ringSvg(dn / pd.length, `${Math.round((dn / pd.length) * 100)}%`, "done")), h("b", { text: "Sessions done" }), h("small", { text: `${dn} of Rhythm’s ${pd.length} since it began.` })),
      h("div.p-mini.orange", {}, h("span.p-steps", { "aria-hidden": "true" }, Array.from({ length: 7 }, (_, i) => h("i", { vars: { "--h": 30 + i * 10 + "%", "--o": i < Math.min(7, st.now) ? 1 : 0.25 } }))),
        h("b", { text: st.now ? `${plural(st.now, "week")} in a row` : "A fresh start" }), h("small", { text: st.now ? `Riding twice a week or more.${st.best > st.now ? ` Your best run: ${st.best}.` : ""}` : "Two rides this week starts a run." }))),
    it && section("How hard, this month", h("div.card.glass.p-mix", {}, donut, h("span.tx", {},
      [["easy", "Easy", it.easy], ["mid", "In between", it.mid], ["hard", "Hard", it.hard]].map(([c, l, v]) => h("span.p-key", {}, h("i." + c), h("span", { text: l }), h("b", { text: `${Math.round(v * 100)}%` }))),
      h("small", { text: it.mid >= 0.2 ? "A lot in the grey middle: easy days easier, hard days harder." : "Mostly easy, hard when it counts: the mix riders improve fastest on." })))),
    section("By month", h("div.p-months", {}, months.map((m) => h("div.p-month" + (m.now ? ".now" : ""), {}, h("small", { text: m.now ? `${m.name} · so far` : m.name }), h("b", { text: hm(m.secs) }),
      h("small", { text: `${dist(m.dist)} · ${m.n}` }), h("i", { vars: { "--w": (m.secs / mMax) * 100 + "%" } }))))),
  ] };
}

// Engine: FTP over the range, aerobic efficiency, and staying power
function engineView() {
  const days = pRange(), from = addDays(TODAY, -days), acts = progActs(), ftp0 = ftpOn(from), d = P().ftp - ftp0;
  const log = [[from, ftp0, 0], ...(P().ftpLog || []).filter((x) => x[0] > from), [TODAY, P().ftp, isSet("ftp") ? 1 : 0]];
  const W = sheetW(), H = 140, B = 20, span = Math.max(DAY, TODAY - from), vs = log.map((x) => x[1]), lo = Math.min(...vs) - 6, hi = Math.max(...vs) + 6;
  const x = (t) => 4 + ((t - from) / span) * (W - 8), y = (v) => H - B - ((v - lo) / (hi - lo)) * (H - B - 16);
  let path = `M${x(from).toFixed(1)} ${y(log[0][1]).toFixed(1)}`;
  for (let i = 1; i < log.length; i++) path += `H${x(log[i][0]).toFixed(1)}V${y(log[i][1]).toFixed(1)}`;
  const dots = log.slice(1, -1).map((p) => `<circle cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="4.5" class="${p[2] ? "set" : "est"}"/>`).join("");
  const ftpChart = svgOf(`<svg class="p-ftp" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="FTP over the range, from ${ftp0} to ${P().ftp} W">
    <defs><linearGradient id="pff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f29a12" stop-opacity="0.35"/><stop offset="1" stop-color="#f29a12" stop-opacity="0"/></linearGradient></defs>
    <path d="${path}H${(W - 4).toFixed(1)}V${H - B}H${x(from).toFixed(1)}Z" fill="url(#pff)"/><path d="${path}H${(W - 4).toFixed(1)}" class="ln"/>${dots}
    <text x="4" y="${H - 4}" class="lab">${monthOf(from, "short")}</text><text x="${W - 4}" y="${H - 4}" text-anchor="end" class="lab">Now</text></svg>`);
  // efficiency: each steady ride a dot, deeper as it's more recent; the line through them, and its usual spread
  const e = G.efficiency(acts, from);
  let effChart = null;
  if (e.enough) {
    const efs = e.pts.map((p) => p.ef), elo = Math.min(...efs) * 0.97, ehi = Math.max(...efs) * 1.03, ex = (t) => 6 + ((t - from) / span) * (W - 12), ey = (v) => 130 - 16 - ((v - elo) / (ehi - elo)) * 100;
    const res = Math.sqrt(e.pts.reduce((a, p) => a + (p.ef - e.line.at(p.t)) ** 2, 0) / e.pts.length), t0 = e.pts[0].t, t1 = e.pts.at(-1).t;
    effChart = svgOf(`<svg class="p-eff" width="${W}" height="130" viewBox="0 0 ${W} 130" role="img" aria-label="Watts per heartbeat on each steady ride, ${e.watts >= 0 ? "rising" : "falling"}">
      <path d="M${ex(t0).toFixed(1)} ${ey(e.line.at(t0) + res).toFixed(1)}L${ex(t1).toFixed(1)} ${ey(e.line.at(t1) + res).toFixed(1)}L${ex(t1).toFixed(1)} ${ey(e.line.at(t1) - res).toFixed(1)}L${ex(t0).toFixed(1)} ${ey(e.line.at(t0) - res).toFixed(1)}Z" class="band"/>
      <path d="M${ex(t0).toFixed(1)} ${ey(e.line.at(t0)).toFixed(1)}L${ex(t1).toFixed(1)} ${ey(e.line.at(t1)).toFixed(1)}" class="trend"/>
      ${e.pts.map((p, i) => `<circle cx="${ex(p.t).toFixed(1)}" cy="${ey(p.ef).toFixed(1)}" r="${i === e.pts.length - 1 ? 6 : 4.5}" class="${i === e.pts.length - 1 ? "last" : "pt"}" fill-opacity="${(0.35 + 0.65 * (i / Math.max(1, e.pts.length - 1))).toFixed(2)}"/>`).join("")}
      <text x="6" y="126" class="lab">${monthOf(from, "short")}</text><text x="${W - 6}" y="126" text-anchor="end" class="lab">${dayShort(t1)}</text></svg>`);
  }
  const b20 = G.bests(acts, from)[1200]?.w, sp = G.stayingPower(acts, from, b20);
  const gauge = sp.drift && svgOf((() => { const v = Math.max(0, Math.min(12, sp.drift.now)), a = Math.PI * (1 - v / 12), nx = 70 + Math.cos(a) * 44, ny = 74 - Math.sin(a) * 44;
    return `<svg class="p-gauge" width="140" height="84" viewBox="0 0 140 84" role="img" aria-label="Heart rate drift ${f1n(sp.drift.now)}%"><defs><linearGradient id="pgg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1fa75a"/><stop offset="0.5" stop-color="#e9b52a"/><stop offset="1" stop-color="#e5372c"/></linearGradient></defs><path d="M14 74 A56 56 0 0 1 126 74" fill="none" stroke="url(#pgg)" stroke-width="12" stroke-linecap="round"/><line x1="70" y1="74" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" class="needle"/><circle cx="70" cy="74" r="6" class="hub"/></svg>`; })());
  const arc = sp.ofFresh && svgOf((() => { const f = Math.max(0, Math.min(1, sp.ofFresh)), a = Math.PI * (1 - f), ex2 = 70 + Math.cos(a) * 56, ey2 = 74 - Math.sin(a) * 56;
    return `<svg class="p-arc" width="140" height="84" viewBox="0 0 140 84" role="img" aria-label="${Math.round(f * 100)}% of fresh"><path d="M14 74 A56 56 0 0 1 126 74" class="bg"/><path d="M14 74 A56 56 0 0 1 ${ex2.toFixed(1)} ${ey2.toFixed(1)}" class="fg"/><text x="70" y="70" text-anchor="middle">${Math.round(f * 100)}%</text></svg>`; })());
  return { title: "Engine", body: [
    h("div.card.p-ftpcard", {}, h("small.p-kick", { text: "FTP" }),
      h("div.p-head", {}, h("b", {}, String(P().ftp), h("u", { text: " W" })), h("span", { text: `${f1n(P().ftp / P().weight)} W/kg` }), d !== 0 && h("span.p-gain" + (d < 0 ? ".down" : ""), { text: signedW(d) })),
      ftpChart, h("small.p-when", { text: (P().ftpLog || []).length ? "Each step a change: a filled dot worked out from your rides, an open one set by you." : "Its history starts now: each change from here is a step." })),
    h("div.card.glass.p-effcard", {}, h("div.p-row", {}, h("small.p-kick", { text: "Aerobic efficiency" }), e.enough && Math.abs(e.pct) >= 1 && h("span.p-gain" + (e.pct < 0 ? ".down" : ""), { text: `${e.pct > 0 ? "+" : "−"}${Math.abs(Math.round(e.pct))}%` })),
      h("b.p-title", { text: e.enough ? (e.watts > 0 ? `${e.watts} W more at ${e.hr} bpm than in ${monthOf(e.pts[0].t)}` : e.watts < 0 ? `${-e.watts} W less at ${e.hr} bpm than in ${monthOf(e.pts[0].t)}` : `Level at ${e.hr} bpm`) : "Needs a few more steady rides" }),
      effChart, h("small.p-when", { text: e.enough ? "Normalized power over heart rate, on each steady ride. Rising: your heart does less for the same work." : "Four or more rides of 45 minutes and longer, with power and heart rate, at an easy pace." })),
    h("div.card.glass.p-stay", {}, h("small.p-kick", { text: "Staying power" }),
      (gauge || arc) ? h("div.p-dials", {},
        gauge && h("div", {}, gauge, h("b", { text: `${f1n(sp.drift.now)}%` }), h("small", { text: `Heart rate drift, long rides${sp.drift.was != null && sp.drift.n >= 4 ? ` · from ${f1n(sp.drift.was)}%` : ""}` })),
        arc && h("div", {}, arc, h("b", { text: `${sp.late20} W` }), h("small", { text: "Best 20 min after 2 hours" }))) : null,
      h("small.p-when", { text: gauge || arc ? "How little you fade late in a long ride: what the long rides and fuelling build. Under 5% drift is a well-built base." : "Shows once you’ve a ride of 90 minutes or more with power and heart rate." })),
  ] };
}

// ---- Activities ----
function activitiesView() {
  const sports = [["all", "All"], ["ride", "Rides"], ["run", "Runs"], ["other", "Other"]], at = sports.findIndex(([k]) => k === S.actSport);
  const list = S.acts.filter((a) => S.actSport === "all" || a.sport === S.actSport || (S.actSport === "other" && a.sport !== "ride" && a.sport !== "run"));
  const out = [head("Activities", S.acts.length ? `${plural(S.acts.length, "activity", "activities")}${S.bringing ? " so far" : ", from your devices"}` : "None yet", h("button.round", { type: "button", "aria-label": "Upload files", onclick: () => openSheet(uploadFilesView) }, icon("upload", 21, 2.1)))];
  // Garmin's six months coming in
  if (S.bringing) out.push(bringingCard());
  // none yet: Garmin, or files
  if (!S.acts.length) return S.bringing ? out : [...out, ...firstUpload()];
  // the last four weeks, at a glance
  const since = addDays(TODAY, -27), recent = S.acts.filter((a) => a.start >= since);
  const tot = recent.reduce((t, a) => { const s = sumOf(a); if (s) { t.secs += s.moving || 0; t.dist += s.dist || 0; t.tss += s.tss || 0; t.asc += s.ascent || 0; } return t; }, { secs: 0, dist: 0, tss: 0, asc: 0 });
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
  if (list.length) out.push(h("p.foot", { vars: { "text-align": "center" } }, h("button.link", { type: "button", onclick: () => openSheet(uploadFilesView) }, "Upload more activities")));
  return out;
}
// Your first activities: Garmin connected (six months in at once, then each new one by itself), or files uploaded,
// and what they're for
function firstUpload() {
  const choice = (tile, title, sub, onclick, best = false) => h("button.choice" + (best ? ".best" : ""), { type: "button", onclick }, tile,
    h("span.tx", {}, h("b", {}, title, best && h("small.badge", { text: "Best" })), h("small", { text: sub })), h("span.chev", {}, icon("chev", 17, 2.4)));
  const gets = (ic, cls, title, sub) => h("div.row.plain", {}, h("span.ic.soft." + cls, {}, icon(ic, 17, 2.2)), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  const g = S.garmin?.on;
  return [
    h("div.card.glass.first", {},
      h("div.first-top", {}, h("h2", { text: "Bring your rides in" }), h("p", { text: "Rhythm plans from what you’ve done, so the more it sees, the better it gets." })),
      choice(h("span.big.ic.brand.garmin", {}, icon("device", 22, 2)), g ? "Garmin connected" : "Connect Garmin", g ? (S.garmin.ok ? "New activities come in by themselves" : "Your key has stopped working: add a new one") : "Six months in at once, then every ride by itself",
        () => openSheet(garminView), !g),
      choice(h("span.big.ic.coral", {}, icon("upload", 22, 2.2)), "Upload files", "From Wahoo, Strava, Zwift or anything else", () => openSheet(uploadFilesView))),
    section("What you’ll get", h("div.group.glass", {},
      gets("gauge", "red", "Fitness, fatigue and form", "From every ride’s training stress"),
      gets("calendar", "blue", "A plan that follows you", "Rhythm starts from your real history"),
      gets("bolt", "green", "Your best power", "5 seconds to an hour, and an FTP to try"))),
  ];
}
// Garmin's six months, coming in: how many so far, and how far back it goes
function bringingCard() {
  const back = new Date(addDays(TODAY, -183)).toLocaleDateString("en-GB", { month: "long" });
  return h("div.card.glass.bringing", { role: "status" },
    h("div.bringing-top", {}, h("span.ic.brand.garmin", {}, icon("device", 20, 2)),
      h("span.tx", {}, h("b", { text: "Bringing in six months from Garmin" }), h("small", { text: `${S.bringing.n ? `${plural(S.bringing.n, "activity", "activities")} so far` : `Back to ${back}`} · you can carry on meanwhile` }))),
    h("div.bar", {}, h("i")));
}
// Uploading files: choose them, and where each app keeps them (Garmin's connected instead)
function uploadFilesView() {
  const where = (letter, cls, title, sub) => h("div.row.plain", {}, h("span.ic." + cls, {}, h("b", { text: letter })), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  return { title: "Upload files", body: [
    h("div.drop-zone", {}, h("span.big.ic.coral", {}, icon("upload", 24, 2.2)),
      h("p", { text: "FIT, GPX or TCX, or a zip of them. Fitness works out what each one was, and you check before it’s saved." }),
      h("button.btn", { type: "button", onclick: () => { chooseFiles(); closeSheet(); } }, "Choose files")),
    section("Where to find them", h("div.group", {},
      where("W", "blue", "Wahoo", "In the Wahoo app: an activity, then Share › Download .fit"),
      where("S", "amber", "Strava", "On strava.com: an activity, then ⋯ › Export Original"),
      where("Z", "indigo", "Zwift", "Documents › Zwift › Activities, on the computer you ride on"))),
    !S.garmin?.on && h("div.note-garmin", {}, h("span.ic.brand.garmin", {}, icon("device", 15, 2.2)),
      h("span", {}, "On Garmin? ", h("button.link", { type: "button", onclick: () => pushSheet(garminView) }, "Connect it instead"), ", and skip the files.")),
  ] };
}
// An activity's row: its route's shape (or, indoors, its sport), its name with its distance, its day and the session
// it was from your plan (else the device it came from), and how long and how hard
const withRoute = (sum, a) => { const r = F.routeShape(a.s); return r ? { ...sum, route: r } : sum; };
function routeTile(r, sport) {
  const p = []; for (let i = 0; i + 1 < r.length; i += 2) p.push(`${i ? "L" : "M"}${Number(r[i]) || 0} ${Number(r[i + 1]) || 0}`);
  return h("span.tile.route.s-" + sport, {}, svgOf(`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${p.join("")}"/></svg>`));
}
function actRow(a) {
  const s = sumOf(a), r = s?.route, pid = a.sample ? null : plannedOn(startOfDay(a.start)), pw = pid && pid !== "event" ? wkById(pid) : null;
  const named = s?.dist > 100 && !/\d\s?(km|mi)\b/i.test(a.name) ? `${a.name} · ${dist(s.dist)}` : a.name;
  return h("button.row", { type: "button", onclick: () => openAct(a) }, r ? routeTile(r, a.sport) : sportTile(a.sport),
    h("span.tx", {}, h("b", { text: named }), h("small.one-line", { text: `${dayShort(a.start)} · ${pw && pw.sport === a.sport ? pw.name : a.device || (a.sample ? "Example" : "Uploaded")}` })),
    h("span.val", {}, s ? hm(s.moving) : "", h("small", { text: s?.tss != null ? `TSS ${s.tss}` : "" })));
}
// A ride's staying power, from its samples: heart rate's drift against power, its second half on its first (rides of 90
// minutes and more with both: under 5% is a well-built base), and its best 20 minutes after the first two hours
const XV = 1;
function staying(a) {
  const out = { xv: XV };
  if (a.sport !== "ride" || !a.s?.pwr) return out;
  const ps = perSecond(a), p = ps.pwr, hr = ps.hr, n = p?.length || 0;
  if (hr && n >= 5400) {
    const ef = (from, to) => { let w = 0, b = 0, c = 0; for (let i = from; i < to; i++) if (ps.moving[i] && p[i] > 0 && hr[i] > 0) { w += p[i]; b += hr[i]; c++; } return c > 600 ? w / b : null; };
    const e1 = ef(0, n >> 1), e2 = ef(n >> 1, n);
    if (e1 && e2) out.drift = Math.round(((e1 - e2) / e1) * 1000) / 10;
  }
  if (n >= 7200 + 1200) {
    let sum = 0, best = 0;
    for (let i = 7200; i < n; i++) { sum += Number.isFinite(p[i]) ? p[i] : 0; if (i >= 7200 + 1200) sum -= Number.isFinite(p[i - 1200]) ? p[i - 1200] : 0; if (i >= 7200 + 1199) best = Math.max(best, sum / 1200); }
    if (best > 0) out.late20 = Math.round(best);
  }
  return out;
}
const withFigures = (sum, a) => ({ ...withRoute(sum, a), ...staying(a) });
// The ones kept before rows had these: each read from its file as the app opens, a few at a time, and its route's shape
// and staying power added (one with no route, an indoor ride, remembered here so it isn't looked for again)
async function routes() {
  if (routes.busy || !S.me) return;
  routes.busy = true;
  const none = new Set(store.get("noroute", [])), me = S.me.id;
  try {
    for (const a of S.own.filter((x) => (!sumOf(x)?.route && !none.has(x.id)) || !(sumOf(x)?.xv >= XV)).slice(0, 40)) {
      if (S.me?.id !== me || document.querySelector(".btn[disabled]")) break;
      try {
        const x = await load(a), r = sumOf(a)?.route ? null : F.routeShape(x.s), figs = { ...staying(x), ...(r ? { route: r } : {}) };
        if (!r && !sumOf(a)?.route) none.add(a.id);
        await A.addFigures(a.id, figs);
        a.sum = { ...(a.sum || {}), ...figs }; const s = sumOf(a); if (s) S.sums.set(a.id, { ...s, ...figs });
        if (S.tab === "activities" || S.tab === "progress") redraw();
      } catch (e) { if (e.status === 401 || e.offline) break; none.add(a.id); }
    }
  } finally { routes.busy = false; store.set("noroute", [...none].slice(-2000)); }
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
    !a.sample && h("div.sub", {}, h("button.link.small", { type: "button", onclick: () => pushSheet(() => renameView(a)) }, "Rename")),
    planned && planned.sport === a.sport && h("div.sub", {}, h("span.tick-badge", {}, icon("check", 14, 3)), `From your plan: ${planned.name}`)));
  // the route, coloured by the power there (30 seconds' average) or plain
  let mapAt = null;
  if (x.s.lat) {
    const roll = ps.pwr ? rollAvg(ps.pwr, 30) : null;
    const zoneAt = roll ? (i) => zoneOf((roll[Math.min(roll.length - 1, Math.round(x.s.t[i]))] || 0) / P().ftp).c : null;
    const r = C.route(x.s, zoneAt, sheetW() + 36, U.metric), box = h("div.map", {}, r.el);
    let gl = null;
    const sampleAt = (sec) => { let lo = 0, hi = x.s.t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (x.s.t[m] < sec) lo = m + 1; else hi = m; } return lo; };
    mapAt = (sec) => { if (sec == null) { r.at(null); gl?.at(null); return; } const i = sampleAt(sec); r.at(i); if (gl && x.s.lat[i] != null) gl.at([x.s.lon[i], x.s.lat[i]]); };
    // (on a real map, where the phone can draw one: the route as ridden, over it; a tap opens it to explore)
    if (M.able()) {
      const route = routeOf(x.s, zoneAt), holder = h("div.map-gl", { role: "button", tabindex: "0", "aria-label": "The route on a map: open it to explore", onclick: () => pushSheet(() => bigMapView(a.name, route)) }, mapCredit(), h("span.map-open", { "aria-hidden": "true" }, icon("open", 15, 2.4)));
      box.replaceChildren(holder);
      // (and where it can't after all, its own drawing of the route back)
      M.routeMap(holder, { ...route, light: lightNow() }).then((g) => { gl = g; }).catch(() => box.replaceChildren(r.el));
    }
    body.push(box);
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
        devices.map((d) => row({ icon: /KICKR/i.test(d) ? "trainer" : "device", tint: /Wahoo/i.test(d) ? "blue" : "grey", title: d, sub: `Seen in ${plural(S.acts.filter((a) => a.device === d).length, "file")}`, chev: false })))),
      section("Preferences", h("div.group", {},
        row({ icon: "contrast", tint: "indigo", title: "Appearance", value: { auto: "Automatic", light: "Light", dark: "Dark" }[store.get("appearance", "auto")] || "Automatic", onclick: () => pushSheet(appearanceView) }),
        row({ icon: "ruler", tint: "blue", title: "Units", sub: S.unitsSet ? null : "From your region, until you choose", value: U.metric ? "Kilometres" : "Miles", onclick: () => { U.metric = !U.metric; S.unitsSet = true; keep("prefs"); redraw(true); } }),
        rhythmOn() && row({ icon: "today", tint: "amber", title: "Morning reminder", value: morningOf() ? clockOf(morningOf().at) : "Off", onclick: () => { morningView.at = null; pushSheet(morningView); } }),
        row({ icon: "heart", tint: "green", title: "Ask how I am each morning", sub: "Or check in from the card on Today", value: S.ask === false ? "Off" : "On", onclick: () => { S.ask = S.ask === false; keep("prefs"); Sheet.redraw(); } }))),
      section("Your data", h("div.group", {},
        row({ icon: "inbox", tint: "blue", title: "Upload files", sub: "FIT, GPX or TCX, or a zip of them", onclick: () => pushSheet(uploadFilesView) }),
        row({ icon: "zip", tint: "green", title: "Export everything", sub: "Every activity’s file, in one zip", onclick: exportAll }))),
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
// (a number's note: worked out from your rides, or a starting guess, until you set it yourself)
function numberSaid(k) {
  if (isSet(k)) return null;
  const e = estimates();
  if (k === "ftp") return e.ftp ? `Estimated from ${plural(e.rides, "ride")}` : "A starting guess";
  if (k === "maxHr" || k === "lthr") return e.maxHr ? "From your rides" : "A starting guess";
  return "A starting guess";
}
// a number, a step at a time: set by you from then on
function stepper(label, key, show, by, lo, hi, after) {
  const change = (d) => { setNumber(key, Math.max(lo, Math.min(hi, Math.round((P()[key] + d) * 10) / 10))); Sheet.redraw(); clearTimeout(stepper.t); stepper.t = setTimeout(() => { resum(); redraw(); after?.(); }, 600); };
  const said = numberSaid(key);
  return h("div.row.plain", {}, h("span.tx", {}, h("b", { text: label }), said && h("small.est", { text: said })),
    h("span.stepper", { role: "group", "aria-label": label },
      h("button", { type: "button", "aria-label": `Less ${label}`, onclick: () => change(-by) }, icon("minus", 16, 2.4)),
      h("output", { text: show(P()[key]) }),
      h("button", { type: "button", "aria-label": `More ${label}`, onclick: () => change(by) }, icon("plus", 16, 2.4))));
}
function numbersView() {
  const p = P(), field = (label, key, show, by, lo, hi) => stepper(label, key, show, by, lo, hi);
  // (your best 20 minutes of the last six weeks, offered only as a rise on an FTP you set: easy weeks never talk it down)
  const since = addDays(TODAY, -42), best20 = Math.max(0, ...S.acts.filter((a) => a.start >= since).map((a) => sumOf(a)?.curve?.[1200] || 0)), est = Math.round(best20 * 0.95);
  return {
    title: "Your numbers",
    body: [
      h("div.group", {}, field("FTP", "ftp", (v) => `${v} W`, 5, 80, 500), field("Weight", "weight", (v) => weight(v), 0.5, 35, 150),
        field("Threshold heart rate", "lthr", (v) => `${v} bpm`, 1, 100, 210), field("Max heart rate", "maxHr", (v) => `${v} bpm`, 1, 120, 230),
        field("Threshold pace", "runPace", (v) => pace(paceOf(v)), 5, 150, 600), field("CSS", "css", (v) => pace(v, "/100 m"), 1, 50, 240)),
      isSet("ftp") && est >= p.ftp + 5 && card(null, "From your rides", h("p.line-said", { text: `Your best 20 minutes in the last six weeks: ${best20} W, an FTP of about ${est} W.` }),
        h("button.pill.small.primary", { type: "button", onclick: () => { setNumber("ftp", est); Sheet.redraw(); resum(); redraw(); toast(`FTP raised to ${est} W`); } }, `Raise FTP to ${est} W`)),
      h("p", { text: isSet("ftp") ? "FTP is the power you could hold for about an hour. Ride harder than it says for 20 minutes and Fitness will offer a rise; it never talks it down. Think it’s too high? A 20-minute test will tell you." : "FTP is the power you could hold for about an hour. Until you set it, Fitness works it out from your hardest rides, and it rises by itself when you ride harder." }),
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
        a.parts = r.activities.filter((y) => y.raw?.bytes === a.raw?.bytes).length;
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
    // (said only where it matters: a sport worked out, to check; or one you chose)
    const said = h("small.said", { text: "Fitness worked this out: check it" }); said.hidden = !a.guessed;
    const pick = h("select.sport-pick", { "aria-label": `What ${a.name} was`, onchange: () => {
      const was = defaultFor(a), now = pick.value; a.sport = now; a.guessed = false;
      if (a.name === was) { a.name = defaultFor(a); name.textContent = a.name; }
      tile.className = "tile s-" + now; tile.replaceChildren(sportIcon(now, 20)); said.textContent = "Chosen by you"; said.hidden = false;
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
// What's kept of an activity's file: a FIT file of one activity as it came; a GPX or TCX, or one part of a multisport
// file, written as FIT (every sample kept, in a fraction of the space, and each part on its own, not the whole file
// for each). Gzipped as it's sent (account.js).
function keptFile(a, sum, parts = 1) {
  if (a.raw.type === "fit" && parts <= 1) return { bytes: a.raw.bytes, name: a.raw.name, type: "fit" };
  const stem = String(a.raw.name || "activity").replace(/\.[A-Za-z0-9]{2,4}$/, "");
  return { bytes: F.fitFromActivity(a, sum), name: `${stem}${parts > 1 ? `-${Math.round(a.start / 1000)}` : ""}.fit`, type: "fit" };
}
// The ones kept before that, made smaller: a few at a time, as the app opens, each read from its file and sent again
// (written as FIT, gzipped); the figures stay as they are
async function squash() {
  if (squash.busy || !A.canGzip() || !S.me) return;
  squash.busy = true;
  try {
    const me = S.me.id, todo = S.own.filter((a) => !a.gz && !squash.tried.has(a.id)).slice(0, 25);
    for (const a of todo) {
      if (S.me?.id !== me || document.querySelector(".btn[disabled]")) break;
      squash.tried.add(a.id);
      try {
        let bytes = await idb.get(fileKey(a)).catch(() => null);
        if (!bytes) bytes = await A.fileOf(a.id);
        const r = await F.readAny(a.file || `activity.${a.type}`, bytes), parts = r.activities;
        const x = parts.find((y) => Math.abs(y.start - a.start) < 2000) || (parts.length === 1 ? parts[0] : null);
        if (!x) continue;
        const k = keptFile(x, a.sum, parts.length), got = await A.replaceFile(a.id, { type: k.type, file: k.name }, k.name, await A.gzip(k.bytes));
        Object.assign(a, { gz: true, type: k.type, file: k.name, size: got.size });
        idb.put(fileKey(a), k.bytes).catch(() => {});
      } catch (e) { if (e.status === 401 || e.offline) break; }
    }
  } finally { squash.busy = false; }
}
squash.tried = new Set();
// Each activity kept with your account (its file as it came, and its figures as worked out here), one at a time, the
// sheet saying how far it's got
async function upload(got, btn) {
  btn.disabled = true;
  const done = [], failed = [];
  for (const [i, a] of got.acts.entries()) {
    btn.lastChild.textContent = got.acts.length > 1 ? `Uploading ${i + 1} of ${got.acts.length}…` : "Uploading…";
    const sum = withFigures(summarise(a, P()), a), k = keptFile(a, sum, a.parts || 1), meta = { id: `i${a.start}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: k.name, type: k.type, sum };
    try {
      const r = await A.upload(meta, k.name, await A.gzip(k.bytes));
      if (r.already) continue;
    } catch (e) {
      if (e.status === 401) return signedOutHere();
      failed.push(`${a.name}: ${e.message}`); continue;
    }
    const entry = { ...meta, gz: A.canGzip(), sample: false };
    S.own.push(entry); S.sums.set(entry.id, sum); done.push(entry);
    remember(entry.id, Object.assign(a, { id: entry.id }));
    idb.put(fileKey(entry), k.bytes).catch(() => {});
  }
  if (got.workouts.length) { S.mine.unshift(...got.workouts); keep("workouts"); }
  setActs(); estimate();
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
        const sum = withFigures(summarise(a, P()), a), f = keptFile(a, sum, acts.length), meta = { id: k ? `g${w.id}-${k + 1}` : `g${w.id}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: f.name, type: f.type, sum };
        try { await A.upload(meta, f.name, await A.gzip(f.bytes)); } catch (e) { if (e.status === 401) return signedOutHere(true); kept = -1; break; }
        const entry = { ...meta, gz: A.canGzip(), sample: false };
        S.own.push(entry); S.sums.set(entry.id, sum); added.push(entry); kept++;
        remember(entry.id, Object.assign(a, { id: entry.id }));
        idb.put(fileKey(entry), f.bytes).catch(() => {});
      }
      if (kept < 0) break;
      // (nothing in it to keep: one you have already, or one with nothing Fitness can read)
      if (!kept) await A.garminDone(w.id).catch(() => {});
      S.garmin.waiting = S.garmin.waiting.filter((x) => x.id !== w.id);
    }
  } finally { fromGarmin.busy = false; }
  if (added.length) { setActs(); estimate(); redraw(); if (!quiet) toast(added.length === 1 ? `${added[0].name}, from Garmin` : `${plural(added.length, "activity", "activities")} from Garmin`); }
  return added.length;
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : dayShort(t); };
function garminSaid() {
  const g = S.garmin;
  if (!g?.on) return "Bring your activities in by themselves";
  if (!g.ok) return "Your key has stopped working: add a new one";
  return g.last ? `Connected · checked ${ago(g.last)}` : "Connected";
}
// Garmin's six months, a batch at a time, each read and kept as it comes (Activities shows them coming in); then your
// numbers worked out from them
async function bringIn() {
  S.bringing = { n: 0 }; redraw();
  const more = async () => { const k = await fromGarmin({ quiet: true }); S.bringing.n += k; redraw(); return k; };
  let n = await more();
  for (let i = 0; i < 16 && S.garmin.more; i++) { try { S.garmin = await A.garminFetch(true); } catch (_) { break; } n += await more(); }
  S.bringing = null; redraw(); estimate();
  toast(n ? `Connected: ${plural(n, "activity", "activities")} from the last six months` : "Connected to Garmin Connect");
  return n;
}
// Someone new: three steps, Garmin (or skip), then Rhythm's setup, with your numbers in it
function firstRun() {
  const field = h("input.field", { type: "password", id: "garmin-key", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Personal API key", "aria-label": "Your Garmin Personal API key" });
  const go1 = async (btn) => {
    if (!field.value.trim()) return field.focus();
    btn.disabled = true; btn.textContent = "Connecting…";
    try { S.garmin = await A.garminConnect(field.value); field.value = ""; }
    catch (e) { btn.disabled = false; btn.textContent = "Connect"; if (e.status === 401) return signedOutHere(); return toast(e.message, true, 6000); }
    bringIn();   // (coming in meanwhile)
    rhythmSetup({ first: true });
  };
  // (as many steps as Rhythm's setup will have after this one)
  const n = 6 + (R.sparse(S.own.map((a) => ({ start: a.start })), TODAY) ? 1 : 0);
  const view = () => {
    const btn = h("button.btn.rh-next", { type: "button", onclick: () => go1(btn) }, "Connect");
    field.onkeydown = (e) => { if (e.key === "Enter") go1(btn); };
    return { title: "Welcome", right: h("button.link.r", { type: "button", onclick: closeSheet }, "Later"), body: [
      h("div.rh-dots", { "aria-label": `Step 1 of ${n}` }, Array.from({ length: n }, (_, i) => h(i ? "i" : "i.now"))),
      h("div.sheet-top", {}, h("h1", { text: "Bring your rides in" }), h("div.sub", { text: "Six months of them tells Fitness how fit you are, so your plan starts in the right place. Then your week: about a minute in all." })),
      h("div.card.first-garmin", {},
        h("div.first-garmin-top", {}, h("span.ic.brand.garmin", {}, icon("device", 22, 2)), h("span.tx", {}, h("b", { text: "Connect Garmin" }), h("small", { text: "Every ride comes in by itself after this" }))),
        h("ol.first-steps", {}, h("li", { text: "In Garmin Connect: Settings › Personal API Key › Create" }), h("li", { text: "Copy it, and paste it here" })),
        field),
      btn,
      h("button.btn.quiet", { type: "button", onclick: () => rhythmSetup({ first: true }) }, "Not on Garmin? Skip"),
    ] };
  };
  openSheet(view, { tall: true });
}
function garminView() {
  const g = S.garmin, field = h("input.field", { type: "password", id: "garmin-key", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Personal API key", "aria-label": "Your Garmin Personal API key" });
  const add = async (btn) => {
    if (!field.value.trim()) return field.focus();
    btn.disabled = true; btn.textContent = "Connecting…";
    try { S.garmin = await A.garminConnect(field.value); field.value = ""; }
    catch (e) { btn.disabled = false; btn.textContent = g?.on ? "Add the new key" : "Connect"; if (e.status === 401) return signedOutHere(); return toast(e.message, true, 6000); }
    // (six months of them, coming in on Activities)
    await closeSheet(); go("activities");
    bringIn();
  };
  const keyForm = (label) => { const btn = h("button.btn", { type: "button", onclick: () => add(btn) }, label); field.addEventListener("keydown", (e) => { if (e.key === "Enter") add(btn); }); return [field, btn]; };
  if (!g?.on) return { title: "Garmin Connect", body: [
    h("div.sheet-top", {}, h("h1", { text: "Garmin Connect" }), h("div.sub", { text: "Your rides, runs and swims, in Fitness by themselves." })),
    section("How", h("div.group", {},
      h("div.row.plain", {}, h("span.ic.blue", {}, h("b", { text: "1" })), h("span.tx", {}, h("b", { text: "Make a key in Garmin Connect" }), h("small", { text: "Settings, then Personal API Key, then Create" }))),
      h("div.row.plain", {}, h("span.ic.blue", {}, h("b", { text: "2" })), h("span.tx", {}, h("b", { text: "Copy it, and paste it here" }), h("small", { text: "Garmin shows it only once" }))))),
    h("div.garmin-key", {}, ...keyForm("Connect")),
    section(null, h("p.foot", { text: "The key is kept locked with your account and never shown again. Garmin’s personal keys only read: Fitness brings in your activities from the last six months, then each new one. Workouts still go to your device by Download." })),
  ] };
  // (a second tap to be sure, saying what stays, as deleting an activity has)
  const sure = h("p.foot", { text: "New activities stop coming in. The ones already brought in stay." });
  sure.hidden = true;
  const disconnect = async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Disconnect Garmin Connect"; sure.hidden = false; return; }
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
    h("div.sheet-top", {}, h("h1", { text: "Garmin Connect" }), h("div.sub", { text: g.ok ? (g.said === "unreachable" ? "Connected, but Garmin didn’t answer last time" : g.said === "full" ? "Connected, but your activities have used all the space there is (2 GB)" : "Connected") : "Your key has expired, or was deleted" })),
    h("div.group", {},
      row({ icon: "today", tint: "blue", title: "Last checked", value: g.last ? ago(g.last) : "Not yet", chev: false }),
      row({ icon: "calendar", tint: "green", title: "Connected", value: dayShort(g.since), chev: false })),
    !g.ok && section("A new key", h("div.garmin-key", {}, ...keyForm("Add the new key"))),
    g.ok && checkBtn,
    section(null, h("p.foot", { text: "Fitness looks for new activities every 15 minutes, and as you open it: a ride shows up a minute or two after your watch syncs with Garmin Connect." })),
    section(null, h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: disconnect }, "Disconnect")), sure),
  ] };
}

// ---- the morning notification (functions/_fitpush.js): today's session, or a rest day, at the time you chose, on this
// phone. Its words for the next week are written here, from Rhythm, and sent again as things change; the server only
// sends the day's when your time comes ----
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushWhy() {
  if (canPush()) return Notification.permission === "denied" ? "Notifications are blocked for Fitness in this browser’s settings." : null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone ? "Add Fitness to your Home Screen first (Share, then Add to Home Screen), and turn this on there." : "This browser can’t show notifications.";
}
const morningOf = () => store.get("morning", null);
const clockOf = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function morningDays() {
  const out = {};
  for (let i = 0; i < 8; i++) {
    const d = addDays(TODAY, i), r = rhDay(d);
    if (!r) continue;
    // (Rhythm's reason, where the day's its; one you changed says nothing more)
    const swapped = S.swaps[d] !== undefined, id = swapped ? S.swaps[d] : r.id, w = id ? wkById(id) : null, why = swapped ? "" : r.why || "";
    out[dayStamp(d)] = w ? { title: `Today: ${w.name}`, body: `${dur(measure(w, paceFor(w.sport)).secs)}, ${!swapped && r.hard ? "a hard day" : w.kind.toLowerCase()}. ${why}`.trim() }
      : { title: "Rest day", body: `Rest, and let it sink in. ${why}`.trim() };
  }
  return out;
}
const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function morningSub(make) {
  const reg = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && make) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes((await A.pushKey()).key) });
  return sub;
}
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
async function morningOn(at) {
  if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new Error("Notifications weren’t allowed. Turn them on for Fitness in this browser’s settings.");
  const sub = await morningSub(true);
  await A.morning({ sub: sub.toJSON(), at, tz: tz(), days: morningDays() });
  store.set("morning", { at, endpoint: sub.endpoint });
}
async function morningOffHere() {
  const m = morningOf();
  store.set("morning", null);
  try { await A.morningOff(m?.endpoint); (await morningSub(false))?.unsubscribe(); } catch (_) {}
}
// (the week's words sent again, a moment after anything that changes them)
function morningRefresh() {
  const m = morningOf();
  if (!m || !S.me || !rhythmOn() || !canPush()) return;
  clearTimeout(morningRefresh.t);
  morningRefresh.t = setTimeout(async () => {
    try { const sub = await morningSub(false); if (!sub) return store.set("morning", null); await A.morning({ sub: sub.toJSON(), at: m.at, tz: tz(), days: morningDays() }); } catch (_) {}
  }, 3000);
}
function morningView() {
  const m = morningOf(), why = pushWhy(), at = morningView.at ?? m?.at ?? 7 * 60, t0 = morningDays()[dayStamp(addDays(TODAY, 1))];
  const pick = async (v) => {
    morningView.at = v;
    if (m) { try { await morningOn(v); toast(`At ${clockOf(v)} each morning`); } catch (e) { return toast(e.message, true, 6000); } }
    Sheet.redraw(); redraw();
  };
  const on = async (btn) => {
    btn.disabled = true; btn.textContent = "Turning on…";
    try { await morningOn(at); } catch (e) { btn.disabled = false; btn.textContent = "Turn on"; return toast(e.message, true, 6000); }
    toast(`On: at ${clockOf(at)} each morning`); Sheet.redraw();
  };
  const onBtn = h("button.btn", { type: "button", onclick: () => on(onBtn) }, "Turn on");
  return { title: "Morning reminder", body: [
    h("div.sheet-top", {}, h("h1", { text: "Morning reminder" }), h("div.sub", { text: "Today’s session, or a rest day, at the time you choose. On this phone." })),
    t0 && h("div.note-preview", {}, h("span.ic", {}, h("img", { src: "icon-192.png", alt: "", width: 20, height: 20 })), h("span.tx", {}, h("b", { text: t0.title }), h("small", { text: t0.body }))),
    section("At", h("div.times", { role: "radiogroup", "aria-label": "Time" }, [360, 390, 420, 450, 480, 510, 540].map((v) =>
      h("button.pill.small" + (v === at ? ".tinted" : ""), { type: "button", role: "radio", "aria-checked": String(v === at), onclick: () => pick(v) }, clockOf(v))))),
    why ? h("p.rh-note", { text: why }) : !m && onBtn,
    m && section(null, h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: async () => { await morningOffHere(); morningView.at = null; Sheet.redraw(); redraw(); toast("Morning reminder off"); } }, "Turn off"))),
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
  main.replaceChildren(h("div.welcome.screen.in", {},
    h("div.w-top", {}, h("img.mark", { src: "icon.svg", alt: "Fitness", width: 96, height: 96 }), h("p.tagline", { text: "Training that fits your week" })),
    // (Sign in at the foot of the page, as on the site's other apps)
    h("div.w-cta", {}, note && h("p.small.said", { role: "status", text: note }),
      h("button.btn", { type: "button", id: "sign-in", disabled: !page, onclick: toAccountSignIn }, "Sign in"),
      !page && h("p.small", { text: "Signing in is at fitness.georgefarrowgreen.com." }),
      page && h("p.new-here", {}, "New here? ", h("button.link", { type: "button", onclick: (e) => toAccountSignIn(e, "join") }, "Create your account")))));
  main.removeAttribute("aria-busy");
  document.title = "Fitness";
}
async function toAccountSignIn(e, mode = "signin") {
  const page = A.accountPage(), b = mode === "signin" ? e?.currentTarget : null;
  if (!page) return;
  if (b) { b.disabled = true; b.textContent = "Signing in…"; }
  try {
    const { word, ask } = await A.signInWord();
    localStorage.setItem("fitness:signin", JSON.stringify({ word, at: Date.now() }));
    location.assign(`${page}#${new URLSearchParams({ [mode]: "fitness", ask, back: `${location.origin}/` })}`);
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
  estimate();
  // (someone new: Garmin, your numbers and your week, in one go; else the day's check-in)
  if (!S.rhythm && !S.own.length && !m.garmin?.on && !store.get("welcomed", false)) { store.set("welcomed", true); garminNow(m.garmin); setTimeout(firstRun, 500); }
  else { askToday(); garminNow(m.garmin); }
  setTimeout(squash, 4000);
  setTimeout(routes, 6000);
  morningRefresh();
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
    setActs(); redraw(); estimate();
    garminNow(m.garmin);
  } catch (_) {} finally { pull.busy = false; }
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.me && Date.now() - S.pulledAt > 60e3) pull(); if (document.visibilityState === "visible" && S.me) askToday(); });
addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
// (nothing copied or dragged out of the app, but what you type: a field's own text)
const inField = (t) => t instanceof Element && !!t.closest("input, textarea, select");
for (const ev of ["copy", "cut", "dragstart"]) addEventListener(ev, (e) => { if (!inField(e.target)) e.preventDefault(); });
addEventListener("contextmenu", (e) => { if (!inField(e.target)) e.preventDefault(); });

// ---- always the latest version: the app's files as they were when it opened, and as they are now, compared as you
// come back to it (a phone keeps a page open for days); a new one, and it's opened afresh, unless you're mid-upload ----
const FILES = ["app.js", "styles.css", "ui.js", "charts.js", "workouts.js", "load.js", "sample.js", "formats.js", "fit.js", "account.js", "rhythm.js", "progress.js", "map.js", "mapstyle.js"];
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
  // (this phone's morning reminder goes with the sign-in)
  if (already !== true && morningOf()) await morningOffHere();
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
