// Weather's core under the roof keeps in step with Weather's own page (One roof, spec D9, §7.1, §7.2, §9.4 WX): the
// same-named pure functions are taken out of weather/app.js by name (their source, brace-matched) and run beside
// weather/roof/core.js's and sync.js's ports on the same fixtures, at InFlite's hub (IFL.hub.on): damaged settings,
// notifications kept from before as one place, more than MAX_NOTIFY, stand-in places, merges with conflicts; takeUp
// writes the same wx:* values; saveSettings changes only what it's given (glass and every other stored key kept); and a
// link's place (fromLink) switches to one you have, in wx:places or in the account's (wx:acct), and asks only for one
// that's new.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---- the browser bits the modules touch: storage, events, a network that never answers ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.fetch = async () => { throw Object.assign(new Error("offline (test)"), { offline: true }); };

const WX = new URL("../../../weather/", import.meta.url);
const core = await import(new URL("roof/core.js", WX));
const sync = await import(new URL("roof/sync.js", WX));
const A = await import(new URL("account.js", WX));
const I = await import(new URL("insights.js", WX));
const { makeFormat } = await import(new URL("format.js", WX));
const { FACES, PITCHES, MAX_ZONES } = await import(new URL("solar.js", WX));
const { store } = await import(new URL("data.js", WX));
const APP = readFileSync(new URL("app.js", WX), "utf8");

// ---- taking a function or a const out of app.js by name: its whole source, brackets matched, strings and comments
// stepped over ----
function sourceOf(name) {
  const m = new RegExp(String.raw`^(?:async\s+)?function\s+${name}\s*\(|^const\s+${name}\s*=`, "m").exec(APP);
  assert.ok(m, `app.js has ${name}`);
  let i = m.index, depth = 0, seenBody = false;
  const isFn = /function/.test(m[0]);
  for (; i < APP.length; i++) {
    const c = APP[i], n2 = APP.slice(i, i + 2);
    if (n2 === "//") { i = APP.indexOf("\n", i); continue; }
    if (n2 === "/*") { i = APP.indexOf("*/", i) + 1; continue; }
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < APP.length && APP[i] !== c; i++) { if (APP[i] === "\\") i++; else if (c === "`" && APP[i] === "$" && APP[i + 1] === "{") { let d = 0; for (; i < APP.length; i++) { if (APP[i] === "{") d++; else if (APP[i] === "}" && --d === 0) break; } } }
      continue;
    }
    // (a regex literal after one of these: stepped over whole)
    if (c === "/" && /[=(,:!&|?{};]\s*$/.test(APP.slice(Math.max(0, i - 3), i))) { for (i++; i < APP.length && APP[i] !== "/"; i++) { if (APP[i] === "\\") i++; else if (APP[i] === "[") { for (; APP[i] !== "]"; i++) if (APP[i] === "\\") i++; } } continue; }
    if ("([{".includes(c)) { depth++; if (c === "{") seenBody = true; continue; }
    if (")]}".includes(c)) { depth--; if (isFn && depth === 0 && c === "}" && seenBody) return APP.slice(m.index, i + 1); continue; }
    if (!isFn && depth === 0 && c === ";") return APP.slice(m.index, i + 1);
  }
  throw new Error(`no end to ${name}`);
}

// app.js's own, run at the hub (IFL.hub.on) with its S and what they call
function appOwn() {
  const names = ["defaults", "CARDS", "layoutOf", "solarOf", "notifyOf", "loadSettings", "SYNCED", "canon", "standIn", "mine", "snapOf", "sameAs", "nkey", "combine", "takeUp"];
  const src = names.map(sourceOf).join("\n");
  const S = { settings: null, f: null, places: [], cur: 0, wx: null };
  const doc = { body: { dataset: {} } };
  const IFL = { hub: { on: true } };
  const calls = { go: 0, render: 0 };
  const fn = new Function("A", "S", "IFL", "store", "I", "makeFormat", "FACES", "PITCHES", "MAX_ZONES", "document", "calls",
    `const place = () => S.places[S.cur] || null; const go = () => { calls.go++; }; const render = () => { calls.render++; };
     const drawSaved = () => {}; const SE = () => null; const syncNotify = () => Promise.resolve(); const notifying = () => false; const $ = () => ({ open: false });
     ${src}
     return { ${names.join(", ")} };`);
  return { ...fn(A, S, IFL, store, I, makeFormat, FACES, PITCHES, MAX_ZONES, doc, calls), S, doc, calls };
}

const fw = () => ({ on: () => () => {}, visible: () => false, toast() {}, lazy: () => new Promise(() => {}), stale: () => false, session: { lost: async () => false } });
const reset = (k = {}) => { mem.clear(); for (const [key, v] of Object.entries(k)) mem.set(key, JSON.stringify(v)); };

// fixtures
const DAMAGED = [
  null, [], "nope", 7,
  { temp: "kelvin", wind: "furlongs", precip: "in", pressure: "mmhg", clock: 12, tune: 0, glass: "frosted", commute: "x", extras: [1], solar: "on", notify: [], layout: { order: ["radar", "nope", "radar", "hourly"], off: ["climate", "zzz"] }, activities: [{ name: "Run" }, null, { nameless: 1 }], extra: { kept: true } },
  { temp: "f", wind: "kn", glass: "clear", commute: { on: true, am: "07:30" }, extras: { stars: false }, solar: { on: true, lat: 51, lon: 0, name: "Home", faces: "SW", pitch: 40 }, tune: false },
  { solar: { on: true, alert: false, zones: [{ lat: 50, lon: 1, name: "  ", faces: "Q", pitch: 99, kw: 80 }, { lat: "x" }, { id: "abc", lat: 52, lon: -1, kw: 4.2 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }] } },
];
const NOTIFY = [
  undefined, null, [], { place: { lat: 51.5, lon: -0.1, name: "London" }, rain: true, warn: false, brief: true, briefAt: "6:00" },
  { place: { lat: 51.5, lon: -0.1, name: "London", gps: true }, rain: false, warn: false, brief: false, endpoint: "https://push/x", devId: "d1", syncedAt: 5, off: true },
  { places: Array.from({ length: A.MAX_NOTIFY + 4 }, (_, i) => ({ lat: 50 + i / 10, lon: i / 10, name: `P${i}`, rain: i % 2 === 0, warn: true })), brief: { lat: 50, lon: 0, name: "P0", gps: 1 }, briefAt: "07:45", email: { warn: 1 } },
  { places: [{ lat: 1, lon: 2, rain: false, warn: false }, { lat: "x", lon: 1, rain: true }, { lat: 3, lon: 4, name: 9, rain: 1 }], brief: "x" },
];

test("defaults, CARDS and SYNCED are app.js's", () => {
  const app = appOwn();
  assert.deepEqual(core.defaults(), app.defaults());
  assert.deepEqual(core.CARDS, app.CARDS);
  assert.deepEqual(sync.SYNCED, app.SYNCED);
});

test("layoutOf, solarOf and notifyOf give app.js's answers, damaged, old and over-long ones included", () => {
  const app = appOwn();
  for (const v of [undefined, null, "x", [], { order: "x" }, { order: ["radar", "radar", "nope", "daily"], off: ["radar", "q", "radar"] }, { order: app.CARDS.map((c) => c[0]).reverse(), off: [] }, { order: ["climate"] }])
    assert.deepEqual(core.layoutOf(v), app.layoutOf(v), JSON.stringify(v));
  for (const v of [undefined, null, [], "on", ...DAMAGED.filter((d) => d && typeof d === "object" && !Array.isArray(d)).map((d) => d.solar)])
    assert.deepEqual(core.solarOf(v), app.solarOf(v), JSON.stringify(v));
  for (const v of NOTIFY) assert.deepEqual(core.notifyOf(v), app.notifyOf(v), JSON.stringify(v));
  // (the one kept from before as one place turns into a list; more than the server takes keeps the first)
  assert.equal(core.notifyOf(NOTIFY[3]).places.length, 1);
  assert.equal(core.notifyOf(NOTIFY[5]).places.length, A.MAX_NOTIFY);
});

test("loadSettings reads wx:settings as app.js does: damaged values fall back, every other key is kept", () => {
  const app = appOwn();
  for (const k of DAMAGED) {
    reset(k === null ? {} : { "wx:settings": k });
    app.loadSettings();
    const mine = core.loadSettings();
    assert.deepEqual(mine, app.S.settings, JSON.stringify(k));
    assert.equal(core.S.settings, mine, "S.settings is what it returns");
    assert.deepEqual(core.S.f.units, app.S.f.units);
  }
});

test("canon, snapOf, sameAs and combine put the account's and this device's together as app.js does", () => {
  const app = appOwn();
  const s1 = { temp: "c", wind: "mph", layout: { off: [], order: ["a", "b"] }, glass: "clear" };
  const s2 = { glass: "clear", layout: { order: ["a", "b"], off: [] }, wind: "kmh", temp: "c" };
  for (const v of [s1, s2, null, [3, { b: 1, a: 2 }]]) assert.equal(sync.canon(v), app.canon(v));
  const theirs = { places: [{ name: "Leeds", lat: 53.8, lon: -1.55 }, { name: "York", lat: 53.96, lon: -1.08 }], settings: { ...s2, tune: false },
    notify: { places: [{ lat: 53.8, lon: -1.55, name: "Leeds", rain: true, warn: false }], brief: null, briefAt: "07:00", email: { warn: true, brief: false } } };
  const now = { places: [{ name: "Leeds", lat: 53.8, lon: -1.55 }, { name: "Bath", lat: 51.38, lon: -2.36 }], settings: { ...s1, tune: true },
    notify: { places: [{ lat: 51.38, lon: -2.36, name: "Bath", rain: true, warn: true }, { lat: 53.8, lon: -1.55, name: "Leeds", rain: false, warn: true }], brief: { lat: 51.38, lon: -2.36, name: "Bath" }, briefAt: "06:30", email: { warn: false, brief: true } } };
  const snapData = { places: [{ name: "Leeds", lat: 53.8, lon: -1.55 }, { name: "York", lat: 53.96, lon: -1.08 }], settings: { ...s1, tune: false }, notify: theirs.notify };
  assert.deepEqual(sync.snapOf(snapData), app.snapOf(snapData));
  assert.deepEqual(sync.snapOf({}), app.snapOf({}));
  const snap = app.snapOf(snapData);
  for (const [a, b] of [[now, snap], [theirs, snap], [snapData, snap]]) assert.equal(sync.sameAs(a, b), app.sameAs(a, b));
  for (const first of [false, true]) {
    assert.deepEqual(sync.combine(theirs, now, snap, first), app.combine(theirs, now, snap, first), `first: ${first}`);
    assert.deepEqual(sync.combine({ places: [], settings: {}, notify: null }, now, app.snapOf({}), first), app.combine({ places: [], settings: {}, notify: null }, now, app.snapOf({}), first));
  }
  // (a conflict: York taken away here since, Bath added here, the account's tune kept as this device didn't change it)
  const c = sync.combine(theirs, now, snap);
  assert.deepEqual(c.places.map((p) => p.name), ["Leeds", "Bath"]);
});

test("mine leaves out My Location and the stand-ins (at InFlite), as app.js does at the hub", () => {
  const app = appOwn();
  reset({ "wx:settings": DAMAGED[5] });
  core.start(fw());
  app.loadSettings();
  const places = [{ name: "My Location", lat: 51.501, lon: -0.142, gps: true }, { name: "London", region: "England", lat: 51.5072, lon: -0.1276, standin: true },
    { name: "Somewhere", lat: 52.2, lon: 0.12, approx: true }, { name: "Leeds", region: "England, United Kingdom", lat: 53.8, lon: -1.55, extra: 1 }, { name: "Bath", lat: 51.38, lon: -2.36 }];
  core.S.places = structuredClone(places); app.S.places = structuredClone(places);
  assert.deepEqual(sync.mine(), app.mine());
  assert.deepEqual(sync.mine().places.map((p) => p.name), ["Leeds", "Bath"]);
  core.stop();
});

test("takeUp writes the same wx:places, wx:cur and wx:settings as app.js would", () => {
  const app = appOwn();
  const kept = { temp: "f", glass: "tinted", odd: { a: 1 }, notify: { places: [], endpoint: "https://push/e", devId: "dv", syncedAt: 9, off: true } };
  const places = [{ name: "My Location", lat: 51.501, lon: -0.142, gps: true }, { name: "London", lat: 51.5072, lon: -0.1276, standin: true }, { name: "Bath", lat: 51.38, lon: -2.36, region: "Somerset" }];
  const d = { places: [{ name: "Bath", lat: 51.38, lon: -2.36, region: "Somerset, England" }, { name: "London", lat: 51.5072, lon: -0.1276, region: "England" }, { name: "York", lat: 53.96, lon: -1.08, region: "" }],
    settings: { temp: "c", wind: "kmh", glass: "clear", layout: { order: ["climate"], off: ["solar"] } },
    notify: { places: [{ lat: 53.96, lon: -1.08, name: "York", rain: true, warn: false }], brief: null, briefAt: "08:00", email: { warn: true, brief: false } } };
  for (const cur of [0, 1, 2]) {
    reset({ "wx:settings": kept, "wx:places": places, "wx:cur": cur });
    app.loadSettings(); app.S.places = structuredClone(places); app.S.cur = cur;
    app.takeUp(structuredClone(d));
    const want = Object.fromEntries(["wx:places", "wx:cur", "wx:settings"].map((k) => [k, mem.get(k)]));
    reset({ "wx:settings": kept, "wx:places": places, "wx:cur": cur });
    core.start(fw());
    sync.takeUp(structuredClone(d));
    for (const k of Object.keys(want)) assert.deepEqual(JSON.parse(mem.get(k)), JSON.parse(want[k]), `${k} (on place ${cur})`);
    assert.deepEqual(core.S.settings, app.S.settings);
    core.stop();
  }
});

test("saveSettings changes only the keys it's given: glass and every other stored key kept, the units re-made", async () => {
  const stored = { glass: "clear", temp: "c", wind: "mph", commute: { on: true, am: "07:10", pm: "18:00" }, layout: { order: ["radar", "daily", "hourly"], off: ["radar"] }, odd: { kept: [1, 2] },
    notify: { places: [{ lat: 1, lon: 2, name: "X", rain: true, warn: false }], endpoint: "https://push/e", devId: "dv" } };
  reset({ "wx:settings": stored });
  core.start(fw());
  const keys = [];
  const off = core.on("settings", (d) => keys.push(d.keys));
  await core.saveSettings({ temp: "f", wind: "kmh", precip: "in", pressure: "inhg", clock: "12" });
  const now = JSON.parse(mem.get("wx:settings"));
  assert.equal(now.glass, "clear");
  assert.deepEqual(now.odd, stored.odd);
  assert.deepEqual(now.commute, stored.commute);
  assert.deepEqual(now.layout, stored.layout, "daily and radar's places and off-state untouched");
  assert.deepEqual(now.notify, stored.notify);
  assert.deepEqual({ temp: now.temp, wind: now.wind, precip: now.precip, pressure: now.pressure, clock: now.clock }, { temp: "f", wind: "kmh", precip: "in", pressure: "inhg", clock: "12" });
  assert.equal(core.S.settings.glass, "clear");
  assert.equal(core.S.f.units.temp, "f", "S.f re-made");
  assert.deepEqual(keys, [["temp", "wind", "precip", "pressure", "clock"]]);
  // (and what app.js would read from it is the same)
  const app = appOwn();
  app.loadSettings();
  assert.deepEqual(core.S.settings, app.S.settings);
  off(); core.stop();
});

test("fromLink: a place you have (by 0.02°), My Location for its own notification (by 0.2°), or one in the account's switches; only a new one asks; the name made safe", async () => {
  const places = [{ name: "My Location", lat: 51.501, lon: -0.142, gps: true }, { name: "Leeds", lat: 53.8, lon: -1.55 }, { name: "Bath", lat: 51.38, lon: -2.36 }];
  const notify = { places: [{ lat: 50.72, lon: -1.88, name: "Poole", gps: true, rain: true, warn: false }], brief: null };
  const setUp = (extra = {}) => { reset({ "wx:places": places, "wx:cur": 2, "wx:settings": { notify }, ...extra }); core.start(fw()); };
  let asked = [];
  const confirm = async (p) => { asked.push(p); return "add"; };

  setUp();
  assert.equal(await core.fromLink("?lat=53.81&lon=-1.56&name=Leeds", { confirm }), "switch");
  assert.equal(core.place().name, "Leeds"); assert.equal(core.S.cur, 1); assert.deepEqual(asked, []);
  // (0.02° is the limit: just past it is a new place)
  assert.equal(await core.fromLink("?lat=53.83&lon=-1.55&name=Near%20Leeds", { confirm: async () => null }), null);
  assert.equal(core.S.places.length, 3, "not added when the answer's no");
  core.stop();

  // My Location: a notification of this device's own for it, the place within 0.2°
  setUp({ "wx:places": [{ name: "My Location", lat: 50.75, lon: -1.95, gps: true }, ...places.slice(1)] });
  assert.equal(await core.fromLink("?lat=50.72&lon=-1.88&name=Poole", { confirm }), "switch");
  assert.ok(core.place().gps); assert.deepEqual(asked, []);
  core.stop();

  // one of the account's places, not taken up here yet: switched to, never asked
  setUp({ "wx:acct": { id: "u1", handle: "g", ver: 3, snap: { places: ["55.95,-3.19", "53.80,-1.55"], settings: "null", notify: null } } });
  assert.equal(await core.fromLink("?lat=55.953&lon=-3.188&name=Edinburgh", { confirm }), "switch");
  assert.equal(core.place().name, "Edinburgh"); assert.deepEqual(asked, []);
  assert.equal(core.S.places.length, 4);
  core.stop();

  // a new one: asked; "add" adds it and shows it; the name made safe, at most 60 characters
  setUp();
  const long = "Llan\u0000fair‮" + "x".repeat(80);
  assert.equal(await core.fromLink(`?lat=48.85&lon=2.35&name=${encodeURIComponent(long)}`, { confirm }), "add");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].name, ("Llanfair" + "x".repeat(80)).slice(0, 60));
  assert.equal(core.place().name, asked[0].name);
  assert.equal(core.S.places.length, 4);
  core.stop();

  // "Just Look": shown, not kept
  asked = [];
  setUp();
  assert.equal(await core.fromLink("?lat=40.4&lon=-3.7&name=Madrid", { confirm: async (p) => (asked.push(p), "look") }), "look");
  assert.equal(core.place().name, "Madrid"); assert.ok(core.looking());
  assert.equal(core.S.places.length, 3); assert.ok(!JSON.parse(mem.get("wx:places")).some((p) => p.name === "Madrid"));
  core.setPlace(1); assert.ok(!core.looking());
  core.stop();

  // a first visit takes it as its place, without asking; no name → its position; nonsense → nothing
  reset({}); core.start(fw()); asked = [];
  assert.equal(await core.fromLink("?lat=10.5&lon=20.25", { confirm }), "add");
  assert.deepEqual(core.S.places.map((p) => p.name), ["10.50, 20.25"]); assert.deepEqual(asked, []);
  assert.equal(await core.fromLink("?lat=99&lon=0&name=X", { confirm }), null);
  assert.equal(await core.fromLink("?name=X", { confirm }), null);
  core.stop();
});

test("sectionOf and peek", () => {
  assert.equal(core.sectionOf({ section: "radar" }), "radar");
  assert.equal(core.sectionOf({ section: "nope" }), "now");
  assert.equal(core.sectionOf(null), "now");
  reset({ "wx:glances": { "51.5,-0.1": { temp: 12, code: 3, isDay: true, offset: 0, hi: null, lo: null, at: 1 } } });
  core.start(fw());
  assert.equal(core.peek({ lat: 51.5, lon: -0.1 }).temp, 12, "a place with nothing kept: wx:glances");
  assert.equal(core.peek({ lat: 10, lon: 10 }), null);
  core.stop();
});

// ---- the account's sync under the roof: answers after unmount, no subscription calls, a look kept apart, the sync
// error kept apart from the forecast's ----
// (a network that answers as asked: each request noted, its answer held till the test lets it go)
function heldNet() {
  const asks = [];
  globalThis.fetch = (url, o = {}) => new Promise((ok) => {
    asks.push({ url: String(url), method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null,
      answer: (status, j) => ok({ ok: status >= 200 && status < 300, status, json: async () => j }) });
  });
  return asks;
}
const offline = () => { globalThis.fetch = async () => { throw Object.assign(new Error("offline (test)"), { offline: true }); }; };
const tick = (ms = 0) => new Promise((ok) => setTimeout(ok, ms));
const ACCT = { id: "u1", name: "Ann", handle: "ann", email: "ann@example.com", emailOk: true, photoAt: null, devices: [], ver: 3,
  snap: { places: ["53.80,-1.55"], settings: "null", notify: null } };

test("an account answer that comes after unmount (sign-out) writes nothing: not wx:acct, wx:places or wx:settings", async () => {
  try {
    // a PUT on its way (a place added here), then core.stop() as the sign-out unmounts the module, then Today's
    // forgetApps clears wx:*; the PUT's answer then comes, a conflict with another device's places and settings
    reset({ "wx:places": [{ name: "Leeds", lat: 53.8, lon: -1.55 }], "wx:settings": { temp: "c" }, "wx:acct": ACCT });
    const asks = heldNet();
    core.start(fw());
    core.addPlace({ name: "Bath", lat: 51.38, lon: -2.36 });
    const step = sync.keepInStep().catch(() => {});
    await tick();
    const put = asks.find((a) => a.method === "PUT");
    assert.ok(put, "the change on its way to the account");
    core.stop();
    mem.clear();
    put.answer(409, { conflict: true, ver: 9, data: { places: [{ name: "York", lat: 53.96, lon: -1.08 }], settings: { temp: "f" }, notify: { places: [], brief: null } } });
    await step; await tick(5);
    assert.deepEqual([...mem.keys()], [], "nothing written after the sign-out");
    assert.equal(asks.filter((a) => a.method === "PUT").length, 1, "and nothing sent again");

    // the same for a GET /api/weather/me on its way (the account shown first, or after a minute away)
    reset({ "wx:places": [{ name: "Leeds", lat: 53.8, lon: -1.55 }], "wx:acct": ACCT });
    const asks2 = heldNet();
    core.start(fw());
    const pulled = sync.pull();
    await tick();
    const get = asks2.find((a) => a.method === "GET" && a.url.endsWith("/me"));
    assert.ok(get, "the account asked for");
    const had = core.S.acct;
    core.stop();
    mem.clear();
    get.answer(200, { signedIn: true, id: "u1", name: "Ann", handle: "ann", email: "ann@example.com", ver: 10, devices: [],
      data: { places: [{ name: "York", lat: 53.96, lon: -1.08 }], settings: { temp: "f" }, notify: { places: [], brief: null } } });
    await pulled; await tick(5);
    assert.deepEqual([...mem.keys()], [], "nothing written from an answer that came after the sign-out");
    assert.equal(core.S.acct, had, "nor the account's answer taken up");
  } finally { offline(); core.stop(); }
});

test("a different account signed in, with places of this device's own to ask about: the old one let go with no subscription call", async () => {
  try {
    reset({ "wx:places": [{ name: "Bath", lat: 51.38, lon: -2.36 }], "wx:acct": ACCT, "wx:settings": { notify: { places: [], endpoint: "https://push.example/sub", devId: "dv1" } } });
    const asks = heldNet();
    core.start(fw());
    const asked = [];
    const off = core.on("ask", (r) => asked.push(r));
    const pulled = sync.pull();
    await tick();
    asks.find((a) => a.url.endsWith("/me")).answer(200, { signedIn: true, id: "u2", name: "Bob", handle: "bob", ver: 1, devices: [],
      data: { places: [{ name: "York", lat: 53.96, lon: -1.08 }], settings: {}, notify: { places: [], brief: null } } });
    await pulled; await tick(5);
    assert.equal(asked.at(-1)?.handle, "bob", "asked whether to keep this device's places with Bob's account");
    assert.equal(core.S.acct, null, "Ann's let go");
    assert.equal(mem.get("wx:acct"), undefined);
    assert.deepEqual(asks.filter((a) => /\/leave$/.test(a.url)), [], "no /api/weather/leave (You owns notifications)");
    assert.deepEqual(asks.map((a) => `${a.method} ${a.url.replace(/^.*\/api\/weather\//, "")}`), ["GET me"], "nothing asked but the account");
    off();
  } finally { offline(); core.stop(); }
});

test("{ signedIn: false } from the account goes through fw.session.lost: signed out after all, or still in (the sync error said)", async () => {
  try {
    for (const out of [true, false]) {
      reset({ "wx:places": [{ name: "Leeds", lat: 53.8, lon: -1.55 }], "wx:acct": ACCT });
      const asks = heldNet();
      let lostAsked = 0, toast = null;
      core.start({ ...fw(), toast: (t) => { toast = t; }, session: { lost: async () => { lostAsked++; return out; } } });
      const pulled = sync.pull();
      await tick();
      asks.find((a) => a.url.endsWith("/me")).answer(200, { signedIn: false });
      await pulled;
      assert.equal(lostAsked, 1, `fw.session.lost asked (${out})`);
      if (out) { assert.equal(core.S.acct, null); assert.equal(mem.get("wx:acct"), undefined, "this page's copy let go"); assert.equal(core.S.error, null); }
      else { assert.equal(core.S.acct?.handle, "ann", "still in: nothing let go"); assert.ok(mem.get("wx:acct")); assert.equal(core.S.error, core.SYNC_ERROR); assert.equal(toast, core.SYNC_ERROR); }
      core.stop();
    }
  } finally { offline(); core.stop(); }
});

test("a link's place only looked at: a sync, or a place deleted, keeps the saved place that was current", async () => {
  const places = [{ name: "Leeds", lat: 53.8, lon: -1.55 }, { name: "Bath", lat: 51.38, lon: -2.36 }, { name: "York", lat: 53.96, lon: -1.08 }];
  // takeUp while looking at Madrid: Bath stays current (the account's list in another order)
  reset({ "wx:places": places, "wx:cur": 1 });
  core.start(fw());
  core.look({ name: "Madrid", lat: 40.4, lon: -3.7 });
  sync.takeUp({ places: [places[2], places[0], places[1]], settings: {}, notify: { places: [], brief: null } });
  assert.ok(core.looking(), "still looking");
  assert.equal(core.place().name, "Madrid");
  assert.equal(core.S.places[core.S.cur].name, "Bath", "Bath still the saved one current");
  assert.equal(JSON.parse(mem.get("wx:cur")), 2);
  core.stop();
  // a place deleted while looking: the saved current one still current, found where it is now
  reset({ "wx:places": places, "wx:cur": 2 });
  core.start(fw());
  core.look({ name: "Madrid", lat: 40.4, lon: -3.7 });
  core.removePlace(0);
  assert.equal(core.place().name, "Madrid");
  assert.equal(core.S.places[core.S.cur].name, "York");
  assert.equal(JSON.parse(mem.get("wx:cur")), 1);
  core.stop();
});

test("the sync error and the forecast's kept apart: a forecast error over it, then the sync error back once the forecast's in", () => {
  reset({});
  core.start(fw());
  const seen = [];
  const off = core.on("error", (e) => seen.push(e));
  core.syncError(true);
  assert.equal(core.S.error, core.SYNC_ERROR);
  core.setError(core.FORECAST_BUSY);
  assert.equal(core.S.error, core.FORECAST_BUSY, "the forecast's error shown while it lasts");
  core.setError(null);
  assert.equal(core.S.error, core.SYNC_ERROR, "the sync still failing: said again once the forecast's in");
  core.syncError(false);
  assert.equal(core.S.error, null);
  // and a sync that goes through doesn't clear the forecast's
  core.setError(core.FORECAST_FAILED); core.syncError(true); core.syncError(false);
  assert.equal(core.S.error, core.FORECAST_FAILED);
  assert.deepEqual(seen, [core.SYNC_ERROR, core.FORECAST_BUSY, core.SYNC_ERROR, null, core.FORECAST_FAILED]);
  off(); core.stop();
});

test("a change sends the same PUT body app.js's mine() would, from the same stored wx:*", async () => {
  try {
    const settings = { temp: "f", wind: "kn", glass: "clear", odd: 1, commute: { on: true, am: "07:10", pm: "18:00" }, layout: { order: ["radar", "daily"], off: ["climate"] },
      notify: { places: [{ lat: 53.8, lon: -1.55, name: "Leeds", rain: true, warn: false }], brief: { lat: 53.8, lon: -1.55, name: "Leeds" }, briefAt: "06:45", email: { warn: true, brief: false }, endpoint: "https://push.example/s", devId: "dv" } };
    const places = [{ name: "My Location", lat: 51.501, lon: -0.142, gps: true }, { name: "London", lat: 51.5072, lon: -0.1276, standin: true }, { name: "Leeds", region: "England", lat: 53.8, lon: -1.55, extra: 1 }];
    reset({ "wx:places": places, "wx:cur": 2, "wx:settings": settings, "wx:acct": ACCT });
    const asks = heldNet();
    core.start(fw());
    await core.saveSettings({ temp: "c", clock: "12" });
    const step = sync.keepInStep().catch(() => {});
    await tick();
    const put = asks.find((a) => a.method === "PUT");
    assert.ok(put, "sent");
    // app.js's own mine(), from what's stored now
    const app = appOwn();
    app.loadSettings(); app.S.places = JSON.parse(mem.get("wx:places")); app.S.cur = JSON.parse(mem.get("wx:cur"));
    assert.deepEqual(put.body, { base: 3, data: app.mine() });
    assert.equal(sync.canon(put.body.data), sync.canon(app.mine()), "key for key");
    put.answer(200, { ver: 4, data: put.body.data });
    await step;
  } finally { offline(); core.stop(); }
});

test("opening Weather requests location with an approximate place already saved, then updates My Location", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let calls = 0, latitude = 51.501234;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    permissions: { query: async () => ({ state: "prompt" }) },
    geolocation: { getCurrentPosition(ok) { calls++; ok({ coords: { latitude, longitude: -0.141234 } }); } },
  } });
  reset({ "wx:places": [{ name: "London", lat: 51.5, lon: -0.1, approx: true }, { name: "York", lat: 53.96, lon: -1.08 }], "wx:cur": 0 });
  const owner = { ...fw(), visible: () => true };
  try {
    core.start(owner); core.shown(true);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(calls, 1, "opening calls geolocation before permission was granted");
    assert.equal(core.place().gps, true, "the approximate forecast becomes My Location");
    assert.equal(core.place().lat, 51.501, "only rounded coordinates are kept");
    latitude = 52.123456;
    await core.locate(false);
    assert.equal(core.place().lat, 52.123);
    assert.equal(core.S.places.filter((p) => p.gps).length, 1);
    assert.ok(core.S.places.some((p) => p.name === "York"), "saved places remain available");
  } finally {
    core.stop();
    if (original) Object.defineProperty(globalThis, "navigator", original); else delete globalThis.navigator;
  }
});
