// Fitness's core under the roof keeps in step with Fitness's own page (One roof stage 2, S2-D1, S2-D2, S2-D4, S2-D21,
// RI2, RI7, §9.1 FXA): the same-named functions are taken out of fitness/app.js (and plan.js, progressview.js,
// activities.js for fxcalc.js) by name, their source brace-matched, and run beside fitness/roof/core.js's and fxcalc.js's
// ports on the same records: adopt, record, plannedOn, todaySnap, morningDays, and a save that meets another device's
// (account.js merge). Then the module's own rules: saveSettings changes only the keys given (a key this build doesn't
// know, in prefs or beside them, kept); a page left open past midnight moves on to the new day when Fitness shows again;
// one account's fields never reach the next (start, stop, start); busy() while a save waits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as FX from "./fixtures/fx.mjs";

// ---- the browser bits: storage, IndexedDB in memory, a clock to move, a network that answers as told ----
const { store: ls, mem } = FX.memStorage();
globalThis.localStorage = ls;
const idbFake = FX.fakeIndexedDB();
globalThis.indexedDB = idbFake.indexedDB;
let NOW = FX.TODAY + 12 * 3600e3;
const realNow = Date.now;
Date.now = () => NOW;
let answer = async () => { throw Object.assign(new TypeError("offline (test)"), {}); };
const sent = [];
globalThis.fetch = async (url, o = {}) => { sent.push({ url: String(url), method: o.method || "GET", body: o.body }); return answer(String(url), o); };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const FIT = new URL("../../../fitness/", import.meta.url);
const core = await import(new URL("roof/core.js", FIT));
const calc = await import(new URL("roof/fxcalc.js", FIT));
const I = await import(new URL("roof/idb.js", FIT));
const UI = await import(new URL("ui.js", FIT));
const WK = await import(new URL("workouts.js", FIT));
const LD = await import(new URL("load.js", FIT));
const A = await import(new URL("account.js", FIT));
const R = await import(new URL("rhythm.js", FIT));
const BT = await import(new URL("besttime.js", FIT));
const E = await import(new URL("efforts.js", FIT));
const SRC = Object.fromEntries(["app", "plan", "progressview", "activities"].map((f) => [f, readFileSync(new URL(`${f}.js`, FIT), "utf8")]));

// ---- a function or a const out of a file by name: its whole source, brackets matched, strings, comments and regex
// literals stepped over ----
function sourceOf(name, file = "app") {
  const T = SRC[file];
  const m = new RegExp(String.raw`^(?:async\s+)?function\s+${name}\s*\(|^const\s+${name}\s*=`, "m").exec(T);
  assert.ok(m, `${file}.js has ${name}`);
  let i = m.index, depth = 0, seenBody = false;
  const isFn = /function/.test(m[0]);
  for (; i < T.length; i++) {
    const c = T[i], n2 = T.slice(i, i + 2);
    if (n2 === "//") { i = T.indexOf("\n", i); continue; }
    if (n2 === "/*") { i = T.indexOf("*/", i) + 1; continue; }
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < T.length && T[i] !== c; i++) { if (T[i] === "\\") i++; else if (c === "`" && T[i] === "$" && T[i + 1] === "{") { let d = 0; for (; i < T.length; i++) { if (T[i] === "{") d++; else if (T[i] === "}" && --d === 0) break; } } }
      continue;
    }
    if (c === "/" && /[=(,:!&|?{};]\s*$/.test(T.slice(Math.max(0, i - 3), i))) { for (i++; i < T.length && T[i] !== "/"; i++) { if (T[i] === "\\") i++; else if (T[i] === "[") { for (; T[i] !== "]"; i++) if (T[i] === "\\") i++; } } continue; }
    if ("([{".includes(c)) { depth++; if (c === "{") seenBody = true; continue; }
    if (")]}".includes(c)) { depth--; if (isFn && depth === 0 && c === "}" && seenBody) return T.slice(m.index, i + 1); continue; }
    if (!isFn && depth === 0 && c === ";") return T.slice(m.index, i + 1);
  }
  throw new Error(`no end to ${name}`);
}

// app.js's own (with plan.js's and the views' few), run on an S of their own
const APP_NAMES = ["START", "numbers", "adopt", "record", "isSet", "setActs", "P", "runSpeed", "paceFor", "wkById", "rhythmOn", "rhFrom", "rh", "wetAhead", "wellSource", "nightsFrom", "wellByDay", "rhDay",
  "myPlan", "plan", "planStart", "weeks", "plannedOn", "tz", "morningDays", "todaySnap"];
function appOwn() {
  const src = [...APP_NAMES.map((n) => sourceOf(n)), sourceOf("dayStamp", "plan"), sourceOf("rhythmSaid", "plan"), sourceOf("progActs", "progressview"), sourceOf("rollAvg", "activities")].join("\n");
  const S = { me: null, ver: 0, dirty: new Set(), profile: null, examples: false, chosen: null, rhythm: null, swaps: {}, feel: {}, mine: [], own: [], acts: [], sums: new Map(), garmin: { on: false }, health: { on: false }, wx: null };
  const fn = new Function("S", "U", "PLANS", "WORKOUTS", "layOut", "measure", "dur", "plural", "DAY", "startOfDay", "addDays", "mondayOf", "R", "BT", "TODAY", "rescale",
    `let dataV = 0, rhCache = null, weeksCache = null; const changed = () => { dataV++; }; const resum = () => {}; const D = {};
     const sumOf = (a) => S.sums.get(a.id); const once = (f) => () => f();
     ${src}
     S.profile = { ...START, set: [] };
     return { ${APP_NAMES.join(", ")}, swimSpeed, dayStamp, rhythmSaid, progActs, rollAvg, bump: () => { dataV++; } };`);
  return { ...fn(S, UI.U, WK.PLANS, WK.WORKOUTS, WK.layOut, WK.measure, UI.dur, UI.plural, WK.DAY, WK.startOfDay, WK.addDays, WK.mondayOf, R, BT, core.TODAY, LD.rescale), S };
}
// (the account's answer taken up the same way on both sides: its activities, their figures as they'd be rescaled)
function arriveApp(app, m) {
  app.S.me = m; app.S.own = m.acts.map((x) => ({ ...x, sample: false }));
  app.adopt(m.data);
  for (const a of app.S.own) app.S.sums.set(a.id, LD.rescale(a.sum, app.P(), a.sport));
  app.S.acts = [...app.S.own].sort((a, b) => b.start - a.start);
}
const fw = (over = {}) => {
  const subs = {};
  const f = { on: (e, fn) => { (subs[e] ||= new Set()).add(fn); return () => subs[e].delete(fn); }, fire: (e) => { for (const fn of subs[e] || []) fn(); },
    visible: () => true, toast: (t) => { f.toasts.push(t); }, toasts: [], lazy: (fn) => Promise.resolve(fn("")), stale: () => false, changed: () => { f.changes++; }, changes: 0,
    session: { user: { id: "u-a", name: "Ann Rider" }, lost: async () => false }, screenEl: null, theme: () => "dark", ...over };
  return f;
};
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test("adopt and record: the same record, taken up and given back, as fitness/app.js's (damaged parts too)", () => {
  const cases = [FX.record(), FX.record({ units: "imperial", ftp: 280 }), FX.record({ rhythm: false }), null, { profile: [], plan: { id: "nope", start: 1 }, rhythm: { days: "x" }, swaps: [], feel: 3, workouts: {}, prefs: { units: "furlongs", ask: false, nights: "apple", onboarded: true } }];
  for (const d of cases) {
    const app = appOwn();
    app.adopt(d);
    const appRec = app.record(), appMetric = UI.U.metric;
    core.adopt(d);
    assert.deepEqual(core.record(), appRec, JSON.stringify(d)?.slice(0, 60));
    assert.equal(UI.U.metric, appMetric);
    for (const k of ["unitsSet", "ask", "nightsFrom", "onboarded", "maps", "examples"]) assert.deepEqual(core.S[k], app.S[k], k);
    assert.deepEqual(core.S.profile, app.S.profile);
    assert.equal(core.numbers(), app.numbers());
  }
});

test("plannedOn, todaySnap and morningDays: the coming days as the page plans them (Rhythm, a swap, the rest)", () => {
  core.stop();
  const m = FX.me("u-a"), app = appOwn();
  arriveApp(app, m);
  core.start(fw());
  core.arrive(m, true);
  for (let i = -7; i <= 13; i++) {
    const d = WK.addDays(core.TODAY, i);
    assert.deepEqual(core.plannedOn(d), app.plannedOn(d), `day ${i}`);
  }
  assert.deepEqual(core.todaySnap(), app.todaySnap());
  assert.deepEqual(core.morningDays(), app.morningDays());
  assert.ok(Object.keys(core.todaySnap().days).length === 8);
  // fxcalc against plan.js / progressview.js / activities.js
  assert.equal(calc.rhythmSaid(), app.rhythmSaid());
  assert.equal(calc.dayStamp(FX.TODAY), app.dayStamp(FX.TODAY));
  assert.deepEqual(calc.progActs(), app.progActs());
  const arr = Array.from({ length: 200 }, (_, i) => (i % 7 ? 200 + (i % 13) * 5 : NaN));
  assert.deepEqual([...calc.rollAvg(arr, 30)], [...app.rollAvg(arr, 30)]);
  assert.equal(calc.rollAvg(arr, 30, 120), app.rollAvg(arr, 30, 120));
  core.stop();
});

test("dayChanges: plan.js's ways to change a day (labels and what they say); Another day through ctx.open.move", () => {
  core.start(fw());
  core.arrive(FX.me("u-a"), true);
  const moved = [];
  let day = null;
  for (let i = 0; i < 7 && !day; i++) { const d = WK.addDays(core.TODAY, i); if (core.rhDay(d)?.id && core.S.swaps[d] === undefined) day = d; }
  assert.ok(day, "a session ahead");
  const ch = calc.dayChanges(day, { move: (d) => moved.push(d) });
  assert.ok(ch.some((c) => c.key === "move") && ch.some((c) => c.key === "rest"));
  for (const c of ch) assert.ok(c.label && c.sub && typeof c.run === "function");
  ch.find((c) => c.key === "move").run();
  assert.deepEqual(moved, [day]);
  assert.deepEqual(calc.dayChanges(WK.addDays(core.TODAY, -3), {}), [], "a day gone by: nothing to change");
  core.stop();
});

test("a save that meets another device's: put together as account.js merge does, then saved again; busy() till it's done", async () => {
  core.start(fw());
  const m = FX.me("u-a");
  core.arrive(m, false);   // (the account's own answer: background work starts, saving allowed)
  const theirs = { ...m.data, feel: { ...m.data.feel, [WK.addDays(core.TODAY, -2)]: { sleep: 0, legs: 0, mood: 0 } } };
  const puts = [];
  answer = async (url, o) => {
    if (o.method === "PUT" && url.endsWith("/api/fitness/me")) { puts.push(JSON.parse(o.body)); return puts.length === 1 ? json(409, { conflict: true, ver: 9, data: theirs }) : json(200, { ver: 10, data: puts.at(-1).data }); }
    throw new TypeError("offline (test)");
  };
  core.S.feel[core.TODAY] = { sleep: 2, legs: 2, mood: 1 };
  core.keep("feel");
  assert.equal(core.busy(), true, "a save waiting its moment is unsaved work");
  await core.inStep();
  await settle(5);
  assert.equal(puts.length, 2);
  const mine = { ...puts[0].data };
  assert.deepEqual(puts[1].data, A.merge(theirs, mine, new Set(["feel"]), A.workoutIds(m.data)));
  assert.equal(core.S.ver, 10);
  assert.ok(core.S.feel[WK.addDays(core.TODAY, -2)] && core.S.feel[core.TODAY], "both devices' check-ins kept");
  assert.equal(core.busy(), false);
  core.stop();
  answer = async () => { throw new TypeError("offline (test)"); };
});

test("saveSettings: only the keys given change; prefs and keys this build doesn't know are kept", async () => {
  core.start(fw());
  core.arrive(FX.me("u-a"), true);
  core.saveSettings({ prefs: { units: "imperial" } });
  const s = core.saved();
  assert.equal(s.prefs.units, "imperial");
  assert.equal(s.prefs.future, "kept");
  assert.equal(s.prefs.maps, "always");
  assert.equal(s.prefs.nights, "garmin");
  assert.deepEqual(s.besideIt, { kept: true });
  assert.equal(UI.U.metric, false);
  core.saveSettings({ profile: { ftp: 262 } });
  const t = core.saved();
  assert.equal(t.profile.ftp, 262);
  assert.equal(t.profile.weight, 72, "the other numbers as they were");
  assert.ok(t.profile.set.includes("ftp") && t.profile.set.includes("weight"));
  assert.equal(t.prefs.units, "imperial", "the first save's key still there");
  assert.equal(t.prefs.future, "kept");
  core.stop();
});

test("a page left open past midnight: Fitness shown again moves to the new day, works it out afresh and draws it (RI2)", async () => {
  NOW = FX.TODAY + 23.9 * 3600e3;
  const f = fw();
  core.start(f);
  core.arrive(FX.me("u-a"), true);
  const t0 = core.TODAY, snap0 = core.todaySnap();
  let drawn = 0;
  const off = core.on("me", () => drawn++);
  core.shown(true);
  await settle(5);
  core.shown(false);
  NOW = FX.TODAY + 24.2 * 3600e3;   // (just after midnight)
  drawn = 0;
  core.shown(true);
  assert.equal(core.TODAY, WK.addDays(t0, 1));
  assert.ok(drawn >= 1, "redrawn for the new day");
  assert.notDeepEqual(Object.keys(core.todaySnap().days)[0], Object.keys(snap0.days)[0]);
  // (and visible again, while shown, the same)
  NOW = FX.TODAY + 48.2 * 3600e3;
  f.fire("visible");
  assert.equal(core.TODAY, WK.addDays(t0, 2));
  off();
  core.shown(false);
  core.stop();
  NOW = FX.TODAY + 12 * 3600e3;
});

test("one account, then another: start, stop, start keeps nothing of the first (RI7); the database closed", async () => {
  core.start(fw());
  core.arrive(FX.me("u-a", { units: "imperial" }), true);
  core.held.set("a1", { id: "a1" });
  await core.idb.put("x", 1);
  assert.ok(I.opened());
  assert.ok(core.S.own.length > 10 && core.S.sums.size > 10 && core.S.me.id === "u-a");
  assert.equal(UI.U.metric, false);
  const closed = idbFake.log.closed;
  core.stop();
  await settle(5);
  assert.equal(I.opened(), false);
  assert.equal(idbFake.log.closed, closed + 1, "the handle closed");
  assert.equal(core.S.me, null);
  assert.equal(core.S.own.length, 0);
  assert.equal(core.S.sums.size, 0);
  assert.equal(core.held.size, 0);
  assert.deepEqual(core.S.swaps, {});
  assert.deepEqual(core.S.offers, []);
  assert.equal(UI.U.metric, true, "units back to the default");
  core.start(fw({ session: { user: { id: "u-b", name: "Bea" }, lost: async () => false } }));
  core.arrive(FX.me("u-b", { name: "Bea Cyclist", prefix: "b" }), true);
  assert.ok(core.S.own.every((a) => a.id.startsWith("b")), "only the second account's rides");
  assert.ok(![...core.S.sums.keys()].some((k) => k.startsWith("a")));
  assert.equal(core.S.me.id, "u-b");
  core.stop();
});

test("the kept copy is drawn only for the framework's user (S2-D9); signed out, the framework is asked, and signs out only when it’s sure", async () => {
  // (a kept copy of A's, the framework's user B: nothing of A's drawn; the account's answer for B taken up)
  // (written once started: between stop() and start() IndexedDB takes no writes)
  const bMe = FX.me("u-b", { name: "Bea Cyclist", prefix: "b" });
  let drawnA = false;
  answer = async (url) => (url.includes("/api/fitness/me") ? json(200, bMe) : Promise.reject(new TypeError("offline (test)")));
  const f = fw({ session: { user: { id: "u-b", name: "Bea" }, lost: async () => false } });
  core.start(f);
  await I.idb.put("me:last", JSON.stringify({ ...FX.me("u-a"), signedIn: true }));
  const off = core.on("me", () => { if (core.S.me?.id === "u-a") drawnA = true; });
  core.shown(true);
  await settle(30);
  assert.equal(drawnA, false, "another's copy never drawn");
  assert.equal(core.S.me?.id, "u-b");
  off(); core.shown(false); core.stop();
  // (signed out, the framework sure of it: everything let go)
  let asked = 0;
  answer = async (url) => (url.includes("/api/fitness/me") ? json(200, { signedIn: false }) : Promise.reject(new TypeError("offline (test)")));
  const g = fw({ session: { user: { id: "u-b" }, lost: async () => { asked++; return true; } } });
  core.start(g);
  core.arrive(FX.me("u-b", { prefix: "b" }), true);
  core.S.pulledAt = 0;
  await core.pull();
  await settle(5);
  assert.equal(asked, 1);
  assert.equal(core.S.me, null, "stopped: nothing of the account left");
  core.stop();
  answer = async () => { throw new TypeError("offline (test)"); };
});

test("the one-minute day check runs only while Fitness shows (S2-D4)", async () => {
  const f = fw();
  core.start(f);
  core.shown(true);
  core.shown(false);
  const before = core.TODAY;
  NOW = FX.TODAY + 36 * 3600e3;
  f.fire("visible");   // (hidden: nothing moves)
  assert.equal(core.TODAY, before);
  core.stop();
  NOW = FX.TODAY + 12 * 3600e3;
});

// (a ride as a GPX file, read as Add Files reads one)
const gpxRide = (t0 = FX.TODAY - 20 * 3600e3) => {
  let pts = "";
  for (let i = 0; i < 120; i++) pts += `<trkpt lat="${51.5 + i * 1e-4}" lon="${-0.1 + i * 1e-4}"><ele>10</ele><time>${new Date(t0 + i * 10e3).toISOString()}</time></trkpt>`;
  return new TextEncoder().encode(`<?xml version="1.0"?><gpx version="1.1" creator="t"><trk><name>Late ride</name><type>cycling</type><trkseg>${pts}</trkseg></trk></gpx>`);
};
const deferred = () => { let ok, no; const p = new Promise((a, b) => { ok = a; no = b; }); return { p, ok, no }; };
const filesIn = () => [...(idbFake.dbs.get("fitness")?.get("files")?.keys() || [])];

test("signed out while a ride uploads: its late answer lands nowhere (not in S, not in IndexedDB); the database refuses writes till the next start", async () => {
  core.start(fw());
  core.arrive(FX.me("u-a"), true);
  const F = await core.needF();
  const got = { acts: (await F.readAny("ride.gpx", gpxRide())).activities, workouts: [] };
  assert.equal(got.acts.length, 1);
  const own0 = core.S.own.length, gate = deferred();
  answer = async (url, o) => (o.method === "POST" && url.endsWith("/api/fitness/acts") ? gate.p : Promise.reject(new TypeError("offline (test)")));
  const btn = { disabled: false, lastChild: { textContent: "" } };
  let then = 0;
  const up = core.upload(got, btn, () => { then++; });
  for (let i = 0; i < 200 && !sent.some((x) => x.url.endsWith("/api/fitness/acts")); i++) await settle(5);
  assert.ok(sent.some((x) => x.url.endsWith("/api/fitness/acts")), "the upload asked");
  assert.equal(core.S.own.length, own0);
  core.stop();   // (signed out meanwhile: You's forgetApps clears what's kept)
  gate.ok(json(200, { kept: true }));
  await up;
  await settle(10);
  assert.equal(core.S.own.length, 0, "nothing of the ride in S");
  assert.equal(core.S.me, null);
  assert.equal(then, 0, "nothing followed (no sheet closed, no ride opened)");
  assert.ok(!filesIn().some((k) => String(k).includes(":i")), `no ride file kept: ${filesIn().join(",")}`);
  assert.ok(!(localStorage.getItem("fitness:files") || "").includes(":i"), "nor listed as kept");
  await assert.rejects(I.idb.put("late", 1), /closed/, "between stop() and start(), IndexedDB refuses writes");
  assert.ok(!filesIn().includes("late"));
  core.start(fw());
  await I.idb.put("again", 1);
  assert.ok(filesIn().includes("again"), "started again: writes go through");
  await I.idb.del("again");
  core.stop();
  answer = async () => { throw new TypeError("offline (test)"); };
});

test("signed out while the account's asked for: its answer isn't kept as me:last, nor taken up", async () => {
  core.stop();
  core.start(fw());
  await I.idb.put("me:last", "before");
  core.arrive(FX.me("u-a"), true);
  const gate = deferred();
  answer = async (url) => (url.includes("/api/fitness/me") ? gate.p : Promise.reject(new TypeError("offline (test)")));
  const pulling = core.pull();
  await settle(5);
  core.stop();
  gate.ok(json(200, FX.me("u-a")));
  await pulling;
  await settle(10);
  assert.equal(core.S.me, null);
  core.start(fw());
  assert.equal(await I.idb.get("me:last"), "before", "me:last as it was");
  await I.idb.del("me:last");
  core.stop();
  answer = async () => { throw new TypeError("offline (test)"); };
});

test("the account says signed out, the framework isn't sure: the error state with its words (Try Again), not a skeleton for ever", async () => {
  answer = async (url) => (url.includes("/api/fitness/me") ? json(200, { signedIn: false }) : Promise.reject(new TypeError("offline (test)")));
  let asked = 0;
  core.start(fw({ session: { user: { id: "u-a" }, lost: async () => { asked++; return false; } } }));
  core.shown(true);
  for (let i = 0; i < 100 && !core.S.error; i++) await settle(5);
  assert.equal(asked, 1, "the framework asked");
  assert.equal(core.S.me, null);
  assert.equal(core.S.loading, false);
  assert.match(core.S.error || "", /couldn’t check you’re signed in/);
  core.shown(false);
  core.stop();
  answer = async () => { throw new TypeError("offline (test)"); };
});

test("a save in flight: inStep() hands back that save (flush waits for it); one that fails puts the changes back, the next sends them", async () => {
  core.start(fw());
  core.arrive(FX.me("u-a"), false);
  const gate = deferred(), puts = [];
  answer = async (url, o) => {
    if (o.method === "PUT" && url.endsWith("/api/fitness/me")) { puts.push(JSON.parse(o.body)); return puts.length === 1 ? gate.p : json(200, { ver: 12, data: puts.at(-1).data }); }
    throw new TypeError("offline (test)");
  };
  core.S.feel[core.TODAY] = { sleep: 1, legs: 1, mood: 1 };
  core.keep("feel");
  const first = core.inStep();
  await settle(5);
  assert.equal(core.S.dirty.size, 0, "taken for the save in flight");
  assert.ok(core.inStep.p, "the save in flight kept");
  assert.equal(core.inStep(), core.inStep.p, "asked again meanwhile: the same save");
  let waited = false;
  const flushing = core.inStep().then(() => { waited = true; });
  await settle(5);
  assert.equal(waited, false, "waits for the save in flight");
  gate.ok(json(500, { error: "Something went wrong (500)." }));
  await first; await flushing;
  assert.equal(waited, true);
  assert.ok(core.S.dirty.has("feel"), "failed: the changes back as unsaved (Sign Out would ask)");
  await core.inStep();
  assert.equal(puts.length, 2);
  assert.equal(core.S.dirty.size, 0, "sent the second time");
  assert.equal(core.S.ver, 12);
  core.stop();
  answer = async () => { throw new TypeError("offline (test)"); };
});

test.after(() => { Date.now = realNow; });
