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
import * as BT from "./besttime.js";
import * as E from "./efforts.js";
import { askToday, todayView } from "./today.js";
import { dayStamp, download, planView, rhythmSetup } from "./plan.js";
import { progressView } from "./progressview.js";
import { activitiesView, openAct, routes, uploadFilesView, withFigures } from "./activities.js";

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
// What everything worked out from your rides is kept against: a count that moves whenever the rides, their figures or
// what's kept with the account change (so Rhythm's plan, your fitness, the days' rides and Progress's figures are worked
// out once a change, not each time a screen asks)
let dataV = 0;
const changed = () => { dataV++; };
class Watched extends Map { set(k, v) { dataV++; return super.set(k, v); } delete(k) { dataV++; return super.delete(k); } clear() { dataV++; return super.clear(); } }
// a value worked out once a change (and a day: a new day, worked out afresh)
// (a declaration, so the screens' modules can make theirs as they load, before this one has run)
function once(f) { let at = null, v; return () => { const k = `${dataV}@${TODAY}`; if (k !== at) { v = f(); at = k; } return v; }; }
const S = {
  tab: "today", me: null, ver: 0, dirty: new Set(), inStepWorkouts: [], pulledAt: 0,
  profile: { ...START, set: [] }, examples: false, chosen: null, rhythm: null, swaps: {}, feel: {}, mine: [],
  sport: "ride", actSport: "all", formDays: 42,
  own: [], acts: [], garmin: { on: false },
  sums: new Watched(), summed: false,
};
// Your record, as kept with the account, taken up here (null: none yet, so the app's own defaults)
function adopt(d) {
  changed();
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
function keep(...parts) { changed(); if (!S.me) return; for (const x of parts) S.dirty.add(x); clearTimeout(saveT); saveT = setTimeout(inStep, 700); morningRefresh(); }
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
  changed();
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
  // (worked out again only when something it goes on has changed: the count covers the rides and their figures)
  const key = `${dataV}@${TODAY}|${P().ftp}|${P().runPace}|${P().css}|${JSON.stringify(S.rhythm)}|${JSON.stringify(S.feel)}|${JSON.stringify(S.swaps)}`;
  if (rhCache?.key !== key) {
    const acts = S.own.map((a) => ({ start: a.start, sport: a.sport, sum: sumOf(a) }));
    rhCache = { key, v: R.plan({ prefs: S.rhythm, acts, feel: S.feel, swaps: S.swaps, today: TODAY, ftp: P().ftp, paces: { run: runSpeed(), swim: swimSpeed() } }) };
  }
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
// each day's activities, by day (made once a change)
const byDay = once(() => { const m = new Map(); for (const a of S.acts) { const d = startOfDay(a.start); if (!m.has(d)) m.set(d, []); m.get(d).push(a); } return m; });
const actsOn = (day) => byDay().get(day) || [];
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
const fitnessSeries = once(() => fitnessSeriesNow());
function fitnessSeriesNow() {
  const daily = {};
  for (const a of S.acts) { const s = sumOf(a); if (s?.tss) daily[startOfDay(a.start)] = (daily[startOfDay(a.start)] || 0) + s.tss; }
  const first = Math.min(...S.acts.map((a) => a.start), TODAY - 120 * DAY);
  return fitness(daily, first, TODAY);
}

// ---- the page ----
// (three: Today has the plan's days too, Plan having gone into it)
const TABS = [["today", "Today", "today"], ["activities", "Activities", "list"], ["progress", "Progress", "trend"]];
function drawTabs() {
  tabsEl.replaceChildren(...TABS.map(([id, name, ic], i) => h("button.tab", { type: "button", "aria-current": S.tab === id ? "page" : null, onclick: () => go(id) }, icon(ic, 24, 1.9), name)));
  tabsEl.style.setProperty("--tab", TABS.findIndex(([id]) => id === S.tab));
}
// A change shown as iOS shows it: what moves glides to where it goes, the rest dissolving (View Transitions, where the
// browser has them, and not with Reduce Motion: else simply done)
const canMorph = () => !!document.startViewTransition && !still.matches;
function morph(kind, fn) {
  if (!canMorph()) return fn();
  document.documentElement.dataset.vt = kind;
  const t = document.startViewTransition(fn);
  t.finished.finally(() => { if (document.documentElement.dataset.vt === kind) delete document.documentElement.dataset.vt; });
}
function go(tab) {
  if (tab === S.tab) {
    // (Today, tapped again while looking at another day: back to today)
    if (tab === "today" && (S.dayAt != null || S.agenda)) { S.dayAt = null; S.agenda = false; render(true); }
    return scrollTo({ top: 0, behavior: still.matches ? "auto" : "smooth" });
  }
  S.tab = tab; S.actShow = 0;
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
    // (fresh, for a moment: what's in it comes up in turn as it opens, and not again as it's redrawn)
    sheetEl.classList.add("fresh"); clearTimeout(openSheet.t); openSheet.t = setTimeout(() => sheetEl.classList.remove("fresh"), 1200);
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
// The account as last fetched, kept on this phone: the app's drawn from it at once as it opens, while what's changed
// since is fetched (and gone with the rest of this phone's copies on signing out: idb.clear)
let meBase = null;
// (kept as one string: read back as one, and parsed, it's far quicker than thousands of objects copied out one by one)
const lastMe = {
  get: async () => { try { const t = await idb.get("me:last"); return typeof t === "string" ? JSON.parse(t) : null; } catch (_) { return null; } },
  put: (m) => { meBase = m; idb.put("me:last", JSON.stringify(m)).catch(() => {}); },
};
// the account now: what's changed since the copy here (its activities put together with those it has, and those gone
// left out), or all of it where there's no copy, or it's another account's
async function fetchMe(base = meBase) {
  let m = await A.me(base?.id && base.at ? base.at : null);
  if (m.signedIn && m.ids) {
    if (base?.id !== m.id) m = await A.me();
    else {
      const still = new Set(m.ids), byId = new Map((base.acts || []).filter((a) => still.has(a.id)).map((a) => [a.id, a]));
      for (const a of m.acts || []) byId.set(a.id, a);
      m = { ...m, acts: [...byId.values()].sort((a, b) => b.start - a.start), ids: undefined };
    }
  }
  if (m.signedIn) lastMe.put(m);
  return m;
}
function arrive(m) {
  S.me = m; S.ver = m.ver || 0; S.pulledAt = Date.now(); S.inStepWorkouts = A.workoutIds(m.data);
  S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
  S.sums.clear();
  adopt(m.data);
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  document.body.classList.remove("out");
  drawTabs();
  // (the figures first, so the screen's drawn once, not drawn and then drawn again)
  sumUp();
  render(true);
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
// the account as fetched, taken up over what's on the screen (this device's changes not yet kept winning)
function takeUp(m) {
  document.body.dataset.fresh = "1";
  S.me = { ...S.me, name: m.name, handle: m.handle, photoAt: m.photoAt, garmin: m.garmin }; S.ver = m.ver; S.pulledAt = Date.now();
  adopt(S.dirty.size ? A.merge(m.data, record(), S.dirty, S.inStepWorkouts) : m.data); S.inStepWorkouts = A.workoutIds(m.data);
  S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  setActs(); redraw(); estimate();
  garminNow(m.garmin);
}
async function pull() {
  if (!S.me || pull.busy) return;
  pull.busy = true;
  try {
    const m = await fetchMe();
    if (!m.signedIn || m.id !== S.me.id) return signedOutHere(true);
    takeUp(m);
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
const FILES = ["app.js", "styles.css", "ui.js", "charts.js", "workouts.js", "load.js", "sample.js", "formats.js", "fit.js", "account.js", "rhythm.js", "progress.js", "map.js", "mapstyle.js", "besttime.js", "efforts.js", "today.js", "plan.js", "progressview.js", "activities.js", "todaycalc.js"];
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

// (the sign-in gone, found out mid-way: signed out here too, and said so)
const signedOutHere = () => signOutHere(true);

// ---- starting ----
(async () => {
  // back from signing in on the account's page, with the code it handed back (taken out of the address at once)
  const code = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash)?.[1];
  if (code) history.replaceState(null, "", location.pathname + location.search);
  const want = location.hash.slice(1);
  if (TABS.some(([id]) => id === want)) S.tab = want;
  else if (want === "plan") S.tab = "today";
  let m = null, early = null;
  try {
    if (code) { m = await signedBack(code); if (m) lastMe.put(m); }
    if (!m) {
      // (the copy kept here, drawn at once; then what's changed since, taken up)
      const kept = await lastMe.get();
      if (kept?.signedIn && Array.isArray(kept.acts)) { early = kept; meBase = kept; arrive(kept); }
      m = await fetchMe(kept);
    }
  } catch (e) {
    if (early) return;   // (offline: what was here last stays)
    return welcome(e.offline ? "You’re offline. Fitness will be here when you’re back online." : e.message);
  }
  if (!m.signedIn) return early ? signOutHere(true) : welcome();
  if (early && m.id !== early.id) return location.reload();
  if (early) takeUp(m); else { arrive(m); document.body.dataset.fresh = "1"; }
})();

// (what the screens, each its own module, take from here)
export { A, BT, C, DAY, E, F, G, HR_ZONES, M, P, PLANS, R, S, SPORTS, Sheet, TODAY, U, WORKOUTS, ZONES, actsOn, addDays, bigMapView, calendar, canMorph, card, cardW, chooseFiles, choosePlan, clock, closeSheet, dateShort, dayLetter, dayLong, dayName, dayShort, dist, distNum, drawSheet, dur, eventDay, face, fileKey, fitness, fitnessSeries, flatten, formSaid, full, garminView, go, h, head, height, held, hm, icon, idb, isSet, keep, layOut, lightNow, load, mapCredit, measure, missed, mondayOf, morph, myPlan, numbers, once, openSheet, pace, paceFor, pct, perSecond, plan, planStart, plannedOn, plural, pushSheet, record, redraw, rh, rhDay, rhythmOn, rng, routeOf, row, runSpeed, saveFile, section, setActs, setExamples, settingsView, sheetBack, sheetEl, sheetW, signed, signedOutHere, speed, sportIcon, sportTile, startOfDay, stat, stepLen, stepper, store, sumOf, summarise, svgOf, swimSpeed, timeOf, toast, upload, wait, weekIndex, weekZip, weeks, weight, wkById, workoutById, zoneOf };