// Chat's "Send to a friend", the server's routes (functions/_share.js SHARE_ROUTES), against a real database (node:sqlite,
// made to look like D1, with Chat's, Weather's, Fitness's and Markets' own tables) and stand-ins for Open-Meteo and Yahoo
// through fetch, and for the data centre's cache: the live "Now" of each kind of card, with Open-Meteo's allowance kept
// (a forecast had already costing nothing, and over either allowance nothing fetched at all); a friend's look at a
// session gated with no letter named; rain at friends' places without their places; your own card read and nothing
// written; share ids and plans in your own rows only; the best times for two; every route's limit; and every answer
// holding only the keys its list allows (never a place, a price, an amount, or when a session was started). Since Today
// First: a stock you hold by its symbol (percent only); times to talk and plans with a friend's id stored only for a
// friend, the inviter's pending row agreed by the friend's Yes; sync's hold, times and rides, ids and times only.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession, hex, sha256 } from "../../../functions/_pigeon.js";
import { wxdb, OM_KEEP } from "../../../functions/_wxpush.js";
import { fitdb } from "../../../functions/_fitness.js";
import { mkdb } from "../../../functions/_markets.js";
import { snapshotOf } from "../../../functions/_fittoday.js";
import { onRequest as fitnessApi } from "../../../functions/api/fitness/[[path]].js";
import { SHARE_ROUTES, TIME_ROUTES, liveMiss, workoutFor } from "../../../functions/_share.js";
import { onRequest as pigeonApi } from "../../../functions/api/pigeon/[[path]].js";
import { fitNowMany, fitNow, shareFor, addOffer, offersFor, daySpan, OFFER_KEEP } from "../../../functions/_fitshare.js";
import { Quiet } from "../../../functions/_todaycards.js";
import { normCard } from "../../../pigeon/cards.js";
import { forecast as omForecast } from "../mocks/wxappdata.mjs";

// ---- the database ----
const sql = new DatabaseSync(":memory:");
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ sql: q, bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const later = [];
const env = {
  DB: { prepare: (q) => st(q),
    // (D1's batch: each statement's rows, and a write's changes)
    batch: async (list) => { sql.exec("BEGIN"); try { const out = []; for (const s of list) out.push(/^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql) ? await s.run() : await s.all()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } },
  WXAPP_URL: "http://om.test", METEOALARM_URL: "http://ma.test", WARN_TTL: "0", MARKETS_DATA: "http://yahoo.test", MARKETS_TTL: "0", FITNOW_MEMO_MS: "0", FITNESS_HOST: "fitness.localhost",
  waitUntil: (p) => { later.push(Promise.resolve(p).catch(() => {})); },
};
await db(env); await wxdb(env); await fitdb(env); await mkdb(env); await snapshotOf(env, "nobody");
const put = (table, row) => sql.prepare(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...val(Object.values(row)));
const H = 3600e3, DAY = 864e5, MIN = 60e3, now = Date.now();
const setBucket = (n) => put("wx_meta", { k: "om_bucket", v: JSON.stringify({ n, at: Date.now() }) });
setBucket(OM_KEEP * 10);
const limitOf = (key) => sql.prepare("SELECT count FROM pg_limits WHERE key = ?").get(key)?.count ?? 0;
const setLimit = (key, count) => put("pg_limits", { key, count, reset_at: Date.now() + H });
const clearLimits = () => sql.exec("DELETE FROM pg_limits");

// ---- the data centre's cache, Open-Meteo and Yahoo ----
const cached = new Map();
globalThis.caches = { default: { match: async (r) => { const v = cached.get(typeof r === "string" ? r : r.url); return v ? new Response(v) : undefined; }, put: async (r, res) => { cached.set(typeof r === "string" ? r : r.url, await res.text()); } } };
const asked = [];
const om = () => asked.filter((u) => u.startsWith("http://om.test/v1/forecast") && !u.includes("timeformat=unixtime")).length;
const omRide = () => asked.filter((u) => u.includes("timeformat=unixtime")).length;
// (each cell's weather by its latitude: rain due in 90 minutes at 52.80, raining now at 53.00, dry elsewhere)
const scenario = (lat) => (Math.abs(lat - 52.8) < 0.01 ? { rainIn: 90 } : Math.abs(lat - 53) < 0.01 ? { rainIn: -20 } : {});
// (a week hour by hour, as functions/_fitwx.js asks: dry 10:00 to 12:00 UTC each day, wet the rest)
function rideJson() {
  const start = Math.floor(now / DAY) * DAY, o = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], is_day: [] };
  for (let s = start; s < start + 7 * DAY; s += H) {
    const hr = new Date(s).getUTCHours(), dry = hr >= 10 && hr < 12;
    o.time.push(s / 1000); o.temperature_2m.push(15); o.apparent_temperature.push(15); o.precipitation_probability.push(dry ? 5 : 90); o.precipitation.push(dry ? 0 : 2);
    o.weather_code.push(dry ? 2 : 63); o.wind_speed_10m.push(8); o.wind_gusts_10m.push(15); o.wind_direction_10m.push(270); o.is_day.push(hr >= 7 && hr < 17 ? 1 : 0);
  }
  return { utc_offset_seconds: 0, hourly: o };
}
const Y = { "RR.L": { prev: 1000, price: 1012.1, cur: "GBp", ex: "LSE", tz: "Europe/London", name: "Rolls-Royce" }, "TSCO.L": { prev: 400, price: 398.4, cur: "GBp", ex: "LSE", tz: "Europe/London", name: "Tesco" } };
function chartJson(sym) {
  const y = Y[sym]; if (!y) return null;
  // (traded ten minutes ago, or where that's yesterday, at London's midnight: always today, whenever the test runs)
  const t = Date.now(), time = Math.ceil(Math.max(t - 600e3, daySpan(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(t)), "Europe/London").start) / 1000);
  return { chart: { result: [{ meta: { currency: y.cur, symbol: sym, exchangeName: y.ex, instrumentType: "EQUITY", regularMarketTime: time, exchangeTimezoneName: y.tz, regularMarketPrice: y.price,
    previousClose: y.prev, chartPreviousClose: y.prev, longName: y.name, currentTradingPeriod: { regular: { start: time - 6 * 3600, end: time + 3600 } } },
    timestamp: [time - 600, time], indicators: { quote: [{ close: [y.prev, y.price] }] } }] } };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  const url = new URL(String(u));
  asked.push(String(u));
  if (url.host === "om.test") return url.searchParams.get("timeformat") === "unixtime" ? json(rideJson()) : json(omForecast(now, scenario(Number(url.searchParams.get("latitude")))));
  if (url.host === "yahoo.test") { const m = /\/chart\/([^/]+)$/.exec(url.pathname), j = m && chartJson(decodeURIComponent(m[1])); return j ? json(j) : json({ chart: { result: null } }, 404); }
  return json({ warnings: [] });
};
after(async () => { globalThis.fetch = realFetch; delete globalThis.caches; while (later.length) await later.shift(); });

// ---- accounts ----
const user = (id, x = {}) => put("pg_users", { id, handle: id, name: `${id[0].toUpperCase()}${id.slice(1)} Smith`, email: `${id}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0, lat: 51.5, lon: -0.1, place: "London", ...x });
const link = (a, b, status = "ok") => put("pg_links", { a, b, status, created_at: 0 });
user("ann"); user("bo", { lat: 52.81, lon: 1.41, place: "North Walsham" }); user("cy", { lat: 53.0, lon: -1.5 }); user("di", { lat: 50.0, lon: -5.0 }); user("ed", { lat: 55.0, lon: -3.0 }); user("zed");
link("ann", "bo"); link("cy", "ann"); link("ann", "di"); link("ed", "ann"); link("ann", "zed", "pending");
const tokens = {};
for (const id of ["ann", "bo", "cy", "zed"]) tokens[id] = await issueSession(env, id, new Request("http://chat.localhost/api/pigeon/sync"));
const call = async (route, who, { body, query = "" } = {}) => {
  const [method, path] = route.split(" ");
  const request = new Request(`http://chat.localhost/api/pigeon/${path}${query}`, { method, headers: { Authorization: `Bearer ${tokens[who]}`, "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  try { const r = await ({ ...SHARE_ROUTES, ...TIME_ROUTES })[route]({ request, env, waitUntil: env.waitUntil }); return { status: r.status, body: await r.json() }; }
  catch (e) { if (e.status) return { status: e.status, body: { error: e.message } }; throw e; }
};

// ---- what each answer may hold (B8): its keys, all the way down; a map's own keys (friend ids) as "*" ----
const LISTS = {
  weather: { temp: 1, feels: 1, code: 1, isDay: 1, hi: 1, lo: 1, rain: { now: 1, at: 1, end: 1 }, at: 1 },
  markets: { pct: 1, day: 1, stale: 1, at: 1 },
  fitness: { done: 1, secs: 1, dist: 1, tss: 1, gone: 1 },
  quiet: { quiet: 1 },
  shareRank: { rain: { "*": { now: 1, at: 1, end: 1 } } },
  together: { workout: { wid: 1, name: 1, secs: 1 }, windows: [{ start: 1, end: 1, rating: 1, dry: 1, me: { temp: 1, pop: 1 }, them: { temp: 1, pop: 1 } }], hours: [{ t: 1, me: 1, them: 1 }], far: 1, quiet: 1 },
  fitShare: { id: 1, ok: 1 },
  // (your own card, as pigeon/cards.js normCard makes it: Chat's own words and the card's place, cell and best time are
  // yours to send; a fitness card never with a share id, a markets one never with a symbol, amounts or holdings)
  myCard: {
    weather: { card: { v: 1, kind: 1, from: 1, at: 1, say: 1, snap: { place: 1, tz: 1, temp: 1, feels: 1, hi: 1, lo: 1, code: 1, isDay: 1, lead: 1, rain: { now: 1, at: 1, end: 1 }, spell: { act: 1, start: 1, end: 1, rating: 1 } }, ref: { cell: 1 } }, said: 1, href: 1 },
    fitness: { card: { v: 1, kind: 1, from: 1, at: 1, say: 1, snap: { day: 1, tz: 1, sport: 1, name: 1, kind: 1, wid: 1, secs: 1, tss: 1, best: { start: 1, end: 1, dry: 1 }, done: { secs: 1, dist: 1, tss: 1 } } }, said: 1, href: 1 },
    markets: { card: { v: 1, kind: 1, from: 1, at: 1, say: 1, snap: { name: 1, sym: 1, pct: 1, day: 1 } }, said: 1, href: 1 },
    // (one stock you hold, by its symbol: its symbol to look up again, as Markets' own Send has it; still percent only)
    stock: { card: { v: 1, kind: 1, from: 1, at: 1, say: 1, snap: { name: 1, sym: 1, pct: 1, day: 1 }, ref: { sym: 1 } }, said: 1, href: 1 },
  },
  ok: { ok: 1 },
  // (sync's Today First parts: ids and times only, never a name, a place or a zone)
  sync: { hold: { why: 1, until: 1 }, times: [{ id: 1, with: 1, kind: 1, start: 1, stop: 1 }], rides: [{ id: 1, with: 1, start: 1, stop: 1, sport: 1, state: 1 }] },
};
const NEVER = ["lat", "lon", "price", "value", "change", "start", "place", "user_id", "made", "until", "km"];
function within(v, list, at, never = NEVER) {
  if (v === null || typeof v !== "object") return;
  if (Array.isArray(v)) { assert.ok(Array.isArray(list), `${at}: not a list`); v.forEach((x, i) => within(x, list[0], `${at}[${i}]`, never)); return; }
  for (const [k, x] of Object.entries(v)) {
    const want = list?.[k] ?? list?.["*"];
    assert.ok(want, `${at}.${k}: not on its list`);
    assert.ok(!never.includes(k), `${at}.${k}: never`);
    if (typeof want === "object") within(x, want, `${at}.${k}`, never);
  }
}
const NOW_NEVER = NEVER.filter((k) => k !== "start");   // (a window's start is the plan's own time; never a session's)
const CARD_NEVER = NEVER.filter((k) => k !== "start" && k !== "place");   // (a best time's start; your own place's name)
const mine = (r, kind) => { within(r.body, LISTS.myCard[kind], `my-card ${kind}`, CARD_NEVER); return r; };
const nowItem = (v, at) => within(v, v.quiet ? LISTS.quiet : "temp" in v ? LISTS.weather : "pct" in v ? LISTS.markets : LISTS.fitness, at);

// ================================ card-now ================================
test("card-now, weather: the cell re-snapped, answered from the forecast; a forecast had already costs nothing", async () => {
  cached.clear(); clearLimits(); asked.length = 0;
  const r = await call("POST card-now", "ann", { body: { items: [{ k: "weather", cell: [52.8049, 1.4012] }, { k: "weather", cell: [53, -1.5] }, { k: "weather", cell: [51.5, -0.1] }] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.now.length, 3);
  r.body.now.forEach((v, i) => nowItem(v, `now[${i}]`));
  const [due, wet, dry] = r.body.now;
  assert.ok(Number.isFinite(due.temp) && Number.isFinite(due.hi) && Number.isFinite(due.lo) && typeof due.isDay === "boolean");
  assert.equal(due.rain.now, false); assert.ok(due.rain.at > now && due.rain.at < now + 3 * H, "rain due, in real ms");
  assert.equal(wet.rain.now, true, "raining now");
  assert.equal(dry.rain, null, "dry for 12 hours");
  assert.ok(asked.some((u) => u.includes("latitude=52.8&")), "asked for the cell, not the place");
  assert.equal(om(), 3); assert.equal(limitOf("livewx:ann"), 3); assert.equal(limitOf("livewx:site"), 3);
  const again = await call("POST card-now", "ann", { body: { items: [{ k: "weather", cell: [52.8, 1.4] }] } });
  assert.deepEqual(again.body.now[0].rain, due.rain);
  assert.equal(om(), 3, "a hit: no fetch"); assert.equal(limitOf("livewx:ann"), 3, "and not counted");
});

test("card-now, weather: past 4 paid looks for the account, or 12 for everyone, quiet, and nothing fetched", async () => {
  cached.clear(); clearLimits(); asked.length = 0;
  setLimit("livewx:ann", 4);
  const r = await call("POST card-now", "ann", { body: { items: [{ k: "weather", cell: [51.5, -0.1] }] } });
  assert.deepEqual(r.body.now, [{ quiet: true }]); assert.equal(om(), 0, "no fetch");
  setLimit("livewx:site", 12);
  const s = await call("POST card-now", "bo", { body: { items: [{ k: "weather", cell: [51.5, -0.1] }] } });
  assert.deepEqual(s.body.now, [{ quiet: true }]); assert.equal(om(), 0, "no fetch for anyone");
  await assert.rejects(liveMiss(env, "bo"), Quiet);
  clearLimits();
  await liveMiss(env, "bo");
  assert.equal(limitOf("livewx:bo"), 1); assert.equal(limitOf("livewx:site"), 1);
});

test("card-now: at most 3 cells, 6 symbols and 4 sessions a call (the rest quiet); markets in percent only; junk quiet", async () => {
  cached.clear(); clearLimits(); asked.length = 0;
  const cells = [[51.5, -0.1], [52.8, 1.4], [53, -1.5], [50, -5]].map((cell) => ({ k: "weather", cell }));
  const r = await call("POST card-now", "ann", { body: { items: [...cells, { k: "weather", cell: [51.5, -0.1] }] } });
  assert.equal(om(), 3);
  assert.ok(r.body.now.slice(0, 3).every((v) => "temp" in v)); assert.deepEqual(r.body.now[3], { quiet: true }, "a fourth cell"); assert.ok("temp" in r.body.now[4], "the first cell again");
  const syms = ["RR.L", "TSCO.L", "A.L", "B.L", "C.L", "D.L", "E.L"].map((sym) => ({ k: "markets", sym }));
  const m = await call("POST card-now", "ann", { body: { items: [...syms, { k: "markets", sym: "not a symbol!" }] } });
  m.body.now.forEach((v, i) => nowItem(v, `markets[${i}]`));
  assert.deepEqual(Object.keys(m.body.now[0]).sort(), ["at", "day", "pct", "stale"]);
  assert.equal(m.body.now[0].pct, 1.21); assert.equal(m.body.now[1].pct, -0.4);
  assert.deepEqual(m.body.now[6], { quiet: true }, "a seventh symbol"); assert.deepEqual(m.body.now[7], { quiet: true }, "not a symbol");
  assert.equal(asked.filter((u) => u.includes("yahoo.test") && /\/(E\.L)/.test(u)).length, 0, "the seventh never asked for");
  const fits = Array.from({ length: 6 }, (_, i) => ({ k: "fitness", share: String(i).repeat(22) }));
  const f = await call("POST card-now", "ann", { body: { items: [...fits, { k: "nope" }, null, { k: "fitness", share: "short" }] } });
  assert.deepEqual(f.body.now.slice(0, 4), Array(4).fill({ gone: true }));
  assert.deepEqual(f.body.now.slice(4), Array(5).fill({ quiet: true }));
  const many = await call("POST card-now", "ann", { body: { items: Array(20).fill({ k: "nope" }) } });
  assert.equal(many.body.now.length, 12, "12 at most");
  assert.equal(limitOf("cardnow:ann"), 4);
});

// ================================ a friend's look at a session ================================
test("a session's look is gated with no letter named: a friend with a landed letter from its owner since it was made, within 48 hours", async () => {
  const D = await db(env), letter = (id, x) => put("pg_msgs", { id, sender: "bo", recipient: "ann", ct: "sealed", km: 100, sent_at: now - 2 * H, deliver_at: now - H, from_lat: 0, from_lon: 0, to_lat: 0, to_lon: 0, ...x });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(now));
  const share = async (made = now - 3 * H) => { const id = await shareFor(env, "bo", { day, tz: "Europe/London", sport: "ride" }); sql.prepare("UPDATE fx_shares SET made = ? WHERE id = ?").run(made, id); return id; };
  const look = (id, asker = "ann") => fitNow(env, { share: id, asker });
  sql.exec("DELETE FROM pg_msgs");
  const a = await share();
  assert.deepEqual(await look(a), { gone: true }, "no letter at all");
  assert.deepEqual(await look(a, "bo"), { done: false }, "its owner may always look");
  letter("m1", {});
  assert.deepEqual(await look(a), { done: false }, "a landed letter: ok");
  assert.deepEqual(await look(a, "zed"), { gone: true }, "not a friend");
  assert.deepEqual(await look(a, "cy"), { gone: true }, "a friend with no letter");
  // the friend check itself: a letter landed with zed, who's only asked (or is a friend no longer)
  letter("m1z", { recipient: "zed" }); link("bo", "zed", "pending");
  assert.deepEqual(await look(a, "zed"), { gone: true }, "asked, not yet a friend, with a letter landed");
  sql.exec("DELETE FROM pg_links WHERE a = 'bo' AND b = 'zed'"); link("zed", "bo");
  assert.deepEqual(await look(a, "zed"), { done: false }, "a friend now (either way round): ok");
  sql.exec("DELETE FROM pg_links WHERE a = 'zed' AND b = 'bo'");
  assert.deepEqual(await look(a, "zed"), { gone: true }, "a friend no longer, the letter still there");
  sql.exec("DELETE FROM pg_msgs"); letter("m2", { deliver_at: now + H });
  assert.deepEqual(await look(a), { gone: true }, "before it lands");
  sql.exec("DELETE FROM pg_msgs"); letter("m3", { deliver_at: now - 49 * H, sent_at: now - 50 * H });
  const old = await share(now - 51 * H);
  assert.deepEqual(await look(old), { gone: true }, "48 hours after landing");
  sql.exec("DELETE FROM pg_msgs"); letter("m4", { sent_at: now - 5 * H, deliver_at: now - 4 * H });
  assert.deepEqual(await look(a), { gone: true }, "a letter sent before the share was made");
  sql.exec("DELETE FROM pg_msgs"); letter("m5", { recalled: 1, lost_at: now - 90 * MIN });
  assert.deepEqual(await look(a), { gone: true }, "called back");
  sql.exec("DELETE FROM pg_msgs"); letter("m6", { lost_at: now + H });
  assert.deepEqual(await look(a), { gone: true }, "lost (even before it's known to be)");
  sql.exec("DELETE FROM pg_msgs"); letter("m7", { gone_at: now - MIN });
  assert.deepEqual(await look(a), { gone: true }, "gone");
  sql.exec("DELETE FROM pg_msgs"); letter("m8", {});
  sql.prepare("UPDATE fx_shares SET until = ? WHERE id = ?").run(now - 1, a);
  assert.deepEqual(await look(a), { gone: true }, "the share out of date");
  // done: only the figures known, never when
  const b = await share(), span = daySpan(day, "Europe/London");
  put("fx_acts", { user_id: "bo", id: "w1", start: span.start + 60e3, sport: "walk", type: "fit", size: 1, added: 0, sum: JSON.stringify({ secs: 900, dist: 1200 }) });
  assert.deepEqual(await look(b), { done: false }, "a walk doesn't make a ride done");
  put("fx_acts", { user_id: "bo", id: "r1", start: span.start + 120e3, sport: "ride", type: "fit", size: 1, added: 0, sum: JSON.stringify({ secs: 3720, dist: 30400 }) });
  const got = await look(b);
  assert.deepEqual(got, { done: true, secs: 3720, dist: 30400 }, "no stress known: none said; never start");
  within(got, LISTS.fitness, "fitNow");
  // several at once, in order, in one trip each step
  assert.deepEqual(await fitNowMany(env, [b, "x".repeat(22), a, 7], "ann"), [{ done: true, secs: 3720, dist: 30400 }, { gone: true }, { gone: true }, { gone: true }]);
  const r = await call("POST card-now", "ann", { body: { items: [{ k: "fitness", share: b }] } });
  assert.deepEqual(r.body.now, [{ done: true, secs: 3720, dist: 30400 }]);
  void D;
});

// ================================ share-rank ================================
test("share-rank: friends only, at most 3 cells, rain at each without their places, 10 an hour", async () => {
  cached.clear(); clearLimits(); asked.length = 0;
  assert.equal((await call("POST share-rank", "ann", { body: { kind: "weather", ids: ["bo", "zed"] } })).status, 403, "not a friend (asked, not yet)");
  assert.equal((await call("POST share-rank", "ann", { body: { kind: "fitness", ids: ["bo"] } })).status, 400);
  const r = await call("POST share-rank", "ann", { body: { kind: "weather", ids: ["bo", "cy", "di", "ed"] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  within(r.body, LISTS.shareRank, "share-rank");
  assert.deepEqual(Object.keys(r.body.rain), ["bo", "cy", "di"], "the fourth friend's cell not looked at");
  assert.equal(r.body.rain.bo.now, false); assert.ok(r.body.rain.bo.at > now);
  assert.equal(r.body.rain.cy.now, true); assert.equal(r.body.rain.di, null);
  assert.equal(om(), 3);
  for (const k of ["52.81", "1.41", "-1.5,", "50,", "-5"]) assert.ok(!JSON.stringify(r.body).includes(k), k);
  for (let i = 0; i < 8; i++) await call("POST share-rank", "ann", { body: { kind: "weather", ids: ["bo"] } });
  assert.equal((await call("POST share-rank", "ann", { body: { kind: "weather", ids: ["bo"] } })).status, 429, "the eleventh in an hour");
});

// ================================ my-card ================================
// (every table but Markets' copy of prices, which any price looked up keeps for everyone: no one's own)
const counts = () => Object.fromEntries(sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'mk_cache'").all().map(({ name }) => [name, sql.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n]));
test("my-card: your own card of the kind, read from your own apps, with nothing written", async () => {
  cached.clear(); clearLimits();
  // (once, for the tables each part makes as it's first used)
  for (const kind of ["weather", "fitness", "markets"]) await call("GET my-card", "ann", { query: `?kind=${kind}&tz=Europe/London` });
  const before = counts();
  // weather: no place in Weather, so Chat's own place
  const w = mine(await call("GET my-card", "ann", { query: "?kind=weather&tz=Europe/London" }), "weather");
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.ok(normCard(w.body.card), JSON.stringify(w.body));
  assert.equal(w.body.card.kind, "weather"); assert.equal(w.body.card.snap.place, "London"); assert.deepEqual(w.body.card.ref.cell, [51.5, -0.1]);
  // fitness and markets: nothing there yet, said in their own words
  const f = mine(await call("GET my-card", "ann", { query: "?kind=fitness&tz=Europe/London" }), "fitness");
  assert.deepEqual(f.body, { card: null, said: "Open Fitness first, and today’s session can go back.", href: f.body.href });
  assert.match(f.body.href, /fitness/);
  const m = mine(await call("GET my-card", "ann", { query: "?kind=markets&tz=Not/AZone" }), "markets");
  assert.equal(m.body.said, "Add a holding in Markets first, and yours can go back.");
  // with a holding: the portfolio's percent only
  put("mk_holdings", { user_id: "ann", symbol: "RR.L", name: "Rolls-Royce", qty: 100, ord: 0, added: 0 });
  const m2 = mine(await call("GET my-card", "ann", { query: "?kind=markets&tz=Europe/London" }), "markets");
  assert.ok(m2.body.card, JSON.stringify(m2.body));
  assert.deepEqual(Object.keys(m2.body.card.snap).sort(), ["day", "name", "pct", "sym"]);
  assert.equal(m2.body.card.snap.sym, null); assert.equal(m2.body.card.snap.pct, 1.21); assert.equal(m2.body.card.ref, undefined);
  for (const k of ["Rolls", "RR.L", "1012", "100"]) assert.ok(!JSON.stringify(m2.body).includes(k), k);
  sql.exec("DELETE FROM mk_holdings WHERE user_id = 'ann'");
  const after = counts();
  assert.deepEqual(after, before, "no row written anywhere (the limit's own counter is a row already)");
  assert.equal((await call("GET my-card", "ann", { query: "?kind=streak" })).status, 400);
  assert.ok(limitOf("mycard:ann") >= 6);
});

test("my-card, fitness: today's session as Fitness sent it, then what's done, never with a share id, and nothing written", async () => {
  cached.clear(); clearLimits();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now())), span = daySpan(day, "Europe/London");
  put("fx_today", { user_id: "cy", tz: "Europe/London", units: "metric", at: Date.now(),
    days: JSON.stringify({ [day]: { state: "session", id: "free-ride", sport: "ride", name: "Ride how you like", kind: "Endurance", secs: 7200, tss: 80, hard: false, why: "", steps: [] } }) });
  await call("GET my-card", "cy", { query: "?kind=fitness&tz=Europe/London" });
  const before = counts();
  const s = mine(await call("GET my-card", "cy", { query: "?kind=fitness&tz=Europe/London" }), "fitness");
  assert.ok(s.body.card, JSON.stringify(s.body));
  assert.equal(s.body.card.snap.day, day); assert.equal(s.body.card.snap.sport, "ride"); assert.equal(s.body.card.snap.name, "Ride how you like");
  assert.equal(s.body.card.snap.done, null); assert.equal(s.body.card.ref, undefined, "no share id: Chat makes one as it's sent");
  put("fx_acts", { user_id: "cy", id: "cy1", start: span.start + 60e3, sport: "ride", type: "fit", size: 1, added: 0, sum: JSON.stringify({ secs: 3600, dist: 25000, tss: 55 }) });
  const before2 = counts();
  const d = mine(await call("GET my-card", "cy", { query: "?kind=fitness&tz=Europe/London" }), "fitness");
  assert.deepEqual(d.body.card.snap.done, { secs: 3600, dist: 25000, tss: 55 }); assert.equal(d.body.card.ref, undefined);
  assert.deepEqual(counts(), before2, "no row written"); assert.equal(before2.fx_acts, before.fx_acts + 1);
  sql.exec("DELETE FROM fx_acts WHERE user_id = 'cy'"); sql.exec("DELETE FROM fx_today WHERE user_id = 'cy'");
  // a rest day: said so, in Fitness's words
  put("fx_today", { user_id: "cy", tz: "Europe/London", units: "metric", at: Date.now(), days: JSON.stringify({ [day]: { state: "rest", why: "" } }) });
  const r = mine(await call("GET my-card", "cy", { query: "?kind=fitness&tz=Europe/London" }), "fitness");
  assert.deepEqual(r.body, { card: null, said: "There’s no session today to send back.", href: r.body.href });
  sql.exec("DELETE FROM fx_today WHERE user_id = 'cy'");
});

test("my-card, a stock by its symbol: only one you hold, in percent only, with nothing written", async () => {
  cached.clear(); clearLimits();
  put("mk_holdings", { user_id: "ann", symbol: "TSCO.L", name: "Tesco", qty: 50, ord: 0, added: 0 });
  put("mk_holdings", { user_id: "ann", symbol: "RR.L", name: "Rolls-Royce", qty: 0, ord: 1, added: 0 });
  await call("GET my-card", "ann", { query: "?kind=markets&sym=TSCO.L" });
  const before = counts();
  const r = await call("GET my-card", "ann", { query: "?kind=markets&sym=tsco.l&tz=Europe/London" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  within(r.body, LISTS.myCard.stock, "my-card stock", CARD_NEVER);
  assert.ok(normCard(r.body.card), JSON.stringify(r.body));
  assert.deepEqual({ ...r.body.card.snap, day: null }, { name: "Tesco", sym: "TSCO.L", pct: -0.4, day: null });
  assert.equal(r.body.card.kind, "markets"); assert.deepEqual(r.body.card.ref, { sym: "TSCO.L" });
  assert.equal(r.body.card.say, "Tesco is down 0.40% today.");
  for (const k of ["398", "400", "50", "£", "qty"]) assert.ok(!JSON.stringify(r.body).includes(k), k);
  // one you only follow, one you don't have at all: not yours to send, nothing looked up
  asked.length = 0;
  for (const sym of ["RR.L", "AAPL"]) {
    const x = await call("GET my-card", "ann", { query: `?kind=markets&sym=${sym}` });
    assert.deepEqual([x.status, x.body.card, x.body.said], [200, null, "That isn’t one of your holdings in Markets."], sym);
    within(x.body, LISTS.myCard.stock, `my-card ${sym}`, CARD_NEVER);
  }
  assert.equal(asked.filter((u) => u.startsWith("http://yahoo.test")).length, 0, "no price asked for");
  assert.equal((await call("GET my-card", "ann", { query: "?kind=markets&sym=not a symbol" })).status, 400);
  assert.equal((await call("GET my-card", "ann", { query: "?kind=weather&sym=TSCO.L" })).status, 400, "a symbol for a stock only");
  assert.deepEqual(counts(), before, "no row written (the limit's own counter is a row already)");
  assert.equal((await call("GET my-card", "bo", { query: "?kind=markets&sym=TSCO.L" })).body.card, null, "Ann's holding is Ann's");
  sql.exec("DELETE FROM mk_holdings WHERE user_id = 'ann'");
});

// ================================ fit-share ================================
test("fit-share: one row of only whose, day, zone, sport, made and until; { drop } takes back only your own", async () => {
  clearLimits();
  const n = sql.prepare("SELECT COUNT(*) AS n FROM fx_shares").get().n;
  const r = await call("POST fit-share", "ann", { body: { day: "2026-11-02", tz: "Europe/London", sport: "run" } });
  assert.equal(r.status, 200); within(r.body, LISTS.fitShare, "fit-share");
  assert.match(r.body.id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM fx_shares").get().n, n + 1);
  assert.deepEqual(Object.keys(sql.prepare("SELECT * FROM fx_shares WHERE id = ?").get(r.body.id)).sort(), ["day", "id", "made", "sport", "tz", "until", "user_id"]);
  assert.equal(sql.prepare("SELECT user_id FROM fx_shares WHERE id = ?").get(r.body.id).user_id, "ann");
  assert.equal((await call("POST fit-share", "ann", { body: { day: "2026-11-02", tz: "Europe/London", sport: "chess" } })).status, 400);
  assert.deepEqual((await call("POST fit-share", "bo", { body: { drop: r.body.id } })).body, { ok: true });
  assert.ok(sql.prepare("SELECT 1 FROM fx_shares WHERE id = ?").get(r.body.id), "not someone else's");
  await call("POST fit-share", "ann", { body: { drop: r.body.id } });
  assert.equal(sql.prepare("SELECT 1 FROM fx_shares WHERE id = ?").get(r.body.id), undefined, "your own");
  assert.equal((await call("POST fit-share", "ann", { body: { drop: "../etc" } })).status, 400);
  assert.equal(limitOf("fitshare:ann"), 4);
});

// ================================ fit-offer ================================
test("fit-offer: only the asker's own row, the same again changing nothing; Fitness reads it without changing anything", async () => {
  clearLimits();
  const start = Math.ceil(now / H) * H + 24 * H, body = { id: crypto.randomUUID(), start, stop: start + 2 * H, tz: "Europe/London", sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Bo", role: "answered", far: false, dry: true };
  for (let i = 0; i < 2; i++) { const r = await call("POST fit-offer", "ann", { body }); assert.deepEqual(r.body, { ok: true }); within(r.body, LISTS.ok, "fit-offer"); }
  assert.deepEqual(sql.prepare("SELECT user_id FROM fx_offers WHERE id = ?").all(body.id).map((r) => r.user_id), ["ann"], "the asker's alone, once");
  assert.equal((await call("POST fit-offer", "ann", { body: { ...body, id: crypto.randomUUID(), wid: "rh:tempo:60" } })).status, 400);
  put("fx_offers", { user_id: "ann", id: crypto.randomUUID(), start: now - 30 * H, stop: now - 28 * H, tz: "Europe/London", sport: "run", wid: "run-easy-40", name: "Easy run 40", secs: 2400, who: "Cy", role: "asked", state: "new", made: 0, until: now - 16 * H });
  const n = sql.prepare("SELECT COUNT(*) AS n FROM fx_offers").get().n;
  const list = await offersFor(env, "ann");
  assert.deepEqual(list.map((o) => o.id), [body.id], "past its time: not shown");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM fx_offers").get().n, n, "and not deleted by the read (GET me's offers)");
  await addOffer(env, "bo", { ...body, who: "Ann", role: "asked" });
  assert.equal((await offersFor(env, "ann")).length, 1, "bo's is bo's");
  assert.equal(limitOf("fitoffer:ann"), 3);
});

test("fit-offer, Today First: a friend's id only for a friend; the inviter's pending row made a plan by the friend's Yes", async () => {
  clearLimits();
  const start = Math.ceil(now / H) * H + 36 * H, plan = (x = {}) => ({ id: crypto.randomUUID(), start, stop: start + 2 * H, tz: "Europe/London", sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, far: false, dry: true, ...x });
  const inv = plan({ who: "Bo", role: "asked", with: "bo", state: "pending", opts: [[start + 24 * H, start + 26 * H]] });
  assert.deepEqual((await call("POST fit-offer", "ann", { body: inv })).body, { ok: true });
  const row = () => sql.prepare("SELECT state, start, with_id, opts FROM fx_offers WHERE user_id = 'ann' AND id = ?").get(inv.id);
  assert.deepEqual({ ...row() }, { state: "pending", start, with_id: "bo", opts: JSON.stringify([[start + 24 * H, start + 26 * H]]) });
  assert.ok(!(await offersFor(env, "ann")).some((o) => o.id === inv.id), "never shown in Fitness while pending");
  const yes = await call("POST fit-offer", "bo", { body: plan({ start: start + 24 * H, stop: start + 26 * H, who: "Ann", role: "answered", with: "ann", re: inv.id }) });
  within(yes.body, LISTS.ok, "fit-offer");
  assert.deepEqual({ ...row() }, { state: "new", start: start + 24 * H, with_id: "bo", opts: null }, "a plan to add in Ann's Fitness, at Bo's time");
  // with a non-friend (asked, not yet): no friend's id, and no pending row
  const z = plan({ start: start + 4 * H, stop: start + 6 * H, who: "Zed", role: "answered", with: "zed" });
  assert.deepEqual((await call("POST fit-offer", "ann", { body: z })).body, { ok: true });
  assert.equal(sql.prepare("SELECT with_id FROM fx_offers WHERE user_id = 'ann' AND id = ?").get(z.id).with_id, null);
  assert.equal((await call("POST fit-offer", "ann", { body: plan({ who: "Zed", role: "asked", with: "zed", state: "pending" }) })).status, 403);
  sql.exec("DELETE FROM fx_offers WHERE user_id IN ('ann', 'bo')");
});

// ================================ time-offer ================================
test("time-offer: friends only, your own row, the inviter's pending row agreed by the friend's Yes; says only ok", async () => {
  clearLimits();
  const start = Math.ceil(now / (15 * MIN)) * 15 * MIN + 5 * H, id = crypto.randomUUID();
  const r = await call("POST time-offer", "ann", { body: { id, kind: "call", start, stop: start + 30 * MIN, tz: "Europe/London", with: "bo", role: "asked", state: "pending", opts: [[start + H, start + H + 30 * MIN]] } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); within(r.body, LISTS.ok, "time-offer");
  const yes = await call("POST time-offer", "bo", { body: { id, kind: "call", start: start + H, stop: start + H + 30 * MIN, tz: "Europe/London", with: "ann", role: "answered" } });
  within(yes.body, LISTS.ok, "time-offer");
  assert.deepEqual(sql.prepare("SELECT user_id, state, start, who, with_id FROM td_times WHERE id = ? ORDER BY user_id").all(id).map((x) => ({ ...x })), [
    { user_id: "ann", state: "yes", start: start + H, who: "Bo", with_id: "bo" }, { user_id: "bo", state: "yes", start: start + H, who: "Ann", with_id: "ann" }]);
  assert.equal((await call("POST time-offer", "ann", { body: { id: crypto.randomUUID(), kind: "call", start, stop: start + 30 * MIN, tz: "Europe/London", with: "zed", role: "asked" } })).status, 403, "asked, not yet a friend");
  assert.equal(limitOf("timeoffer:ann"), 2); assert.equal(limitOf("timeoffer:bo"), 1);
  sql.exec("DELETE FROM td_times");
});

// ================================ Fitness's own: GET me's offers, and answering one ================================
test("Fitness: GET me's offers (past ones not shown, and not deleted), and POST offers/<id> answered by its own account only", async () => {
  clearLimits();
  const start = Math.ceil(now / H) * H + 30 * H, plan = (x = {}) => ({ id: crypto.randomUUID(), start, stop: start + H, tz: "Europe/London", sport: "run", wid: "run-easy-40", name: "Easy run 40", secs: 2400, who: "Cy", role: "asked", far: false, dry: true, ...x });
  const one = plan(), two = plan({ start: start + 2 * H, stop: start + 3 * H });
  await addOffer(env, "ann", one); await addOffer(env, "ann", two);
  sql.prepare("DELETE FROM fx_offers WHERE id NOT IN (?, ?)").run(one.id, two.id);   // (only these two, whatever ran before)
  put("fx_offers", { user_id: "ann", id: crypto.randomUUID(), start: now - 30 * H, stop: now - 29 * H, tz: "Europe/London", sport: "run", wid: "run-easy-40", name: "Easy run 40", secs: 2400, who: "Cy", role: "asked", state: "new", made: 0, until: now - 29 * H + OFFER_KEEP - 24 * H });
  // (signed in to Fitness: the site's cookie, for a sign-in of each account's own)
  const FIT = "http://fitness.localhost", cookies = {};
  for (const id of ["ann", "bo"]) {
    const hash = hex(await sha256(await issueSession(env, id, new Request(`${FIT}/api/fitness/me`)))); cookies[id] = `f${id}`.padEnd(43, "x");
    sql.prepare("UPDATE pg_sessions SET site_hash = ? WHERE hash = ?").run(hex(await sha256(cookies[id])), hash);
  }
  const fit = (method, path, { who = "ann", origin = FIT, data } = {}) => fitnessApi({ env, params: { path: path.split("/") }, waitUntil: env.waitUntil,
    request: new Request(`${FIT}/api/fitness/${path}`, { method, headers: { ...(who ? { Cookie: `account=${cookies[who]}` } : {}), ...(origin ? { Origin: origin } : {}), "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) }) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  const n = sql.prepare("SELECT COUNT(*) AS n FROM fx_offers").get().n;
  const me = await fit("GET", "me");
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.deepEqual(me.body.offers.map((o) => o.id), [one.id, two.id], "the two to come, not the one past");
  assert.deepEqual(Object.keys(me.body.offers[0]).sort(), ["dry", "far", "id", "name", "role", "secs", "sport", "start", "state", "stop", "who", "wid"]);
  assert.equal(me.body.offers[0].state, "new");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM fx_offers").get().n, n, "GET me deletes nothing");
  // answering: from Fitness's own pages, signed in, its own account's only
  assert.equal((await fit("POST", `offers/${one.id}`, { data: { answer: "yes" }, origin: "http://elsewhere.localhost" })).status, 403);
  assert.equal((await fit("POST", `offers/${one.id}`, { data: { answer: "yes" }, who: null })).status, 401);
  assert.equal((await fit("POST", `offers/${one.id}`, { data: { answer: "maybe" } })).status, 400);
  const theirs = await fit("POST", `offers/${one.id}`, { data: { answer: "no" }, who: "bo" });
  assert.deepEqual(theirs, { status: 404, body: { error: "That plan isn’t there any more." } }, "someone else's: not there");
  assert.equal((await fit("POST", "offers/not-an-id", { data: { answer: "yes" } })).status, 404);
  assert.deepEqual((await fit("POST", `offers/${one.id}`, { data: { answer: "yes" } })).body, { ok: true });
  assert.deepEqual((await fit("POST", `offers/${two.id}`, { data: { answer: "no" } })).body, { ok: true });
  const after = await fit("GET", "me");
  assert.deepEqual(after.body.offers.map((o) => [o.id, o.state]), [[one.id, "yes"]], "a yes kept (to add to the plan), a no gone from the list");
  assert.deepEqual((await fit("POST", `offers/${crypto.randomUUID()}`, { data: { answer: "yes" } })).status, 404);
  assert.equal(limitOf("fxoffer:ann"), 4, "each signed-in answer from its own pages"); assert.equal(limitOf("fxoffer:bo"), 1);
});

// ================================ together ================================
test("together: windows dry for both, none before after, the workout from Fitness's library, no places, kept half an hour", async () => {
  cached.clear(); clearLimits(); asked.length = 0;
  const after = Math.ceil((now + 2 * H) / (15 * MIN)) * 15 * MIN - 5 * MIN;   // (and a minute on is the same quarter hour)
  const r = await call("GET together", "ann", { query: `?with=bo&sport=ride&wid=made-up&after=${after}` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  within(r.body, LISTS.together, "together", NOW_NEVER);
  assert.deepEqual(r.body.workout, { wid: "free-ride", name: "Ride how you like", secs: 7200 }, "a made-up workout: the social one");
  assert.ok(r.body.windows.length >= 1 && r.body.windows.length <= 3, JSON.stringify(r.body.windows));
  for (const w of r.body.windows) {
    assert.ok(w.start >= after, "none before after");
    assert.equal(w.end - w.start, 2 * H, "the workout's length, in whole hours");
    assert.equal(new Date(w.start).getUTCHours(), 10); assert.equal(w.dry, true);
  }
  assert.ok(r.body.hours.length > 0 && r.body.hours.length <= 14);
  assert.equal(r.body.far, true, "London and North Walsham: far apart");
  for (const k of ["52.8", "1.4", "51.5", "North Walsham"]) assert.ok(!JSON.stringify(r.body).includes(k), k);
  assert.equal(omRide(), 2, "each place's week");
  const again = await call("GET together", "ann", { query: `?with=bo&sport=ride&wid=made-up&after=${after + 60e3}` });
  assert.deepEqual(again.body, r.body); assert.equal(omRide(), 2, "kept: nothing fetched");
  assert.equal(limitOf("together:site"), 1, "the site's count only for one not kept");
  // a run, with a workout of its own sport kept; a ride's workout for a run isn't
  assert.deepEqual(workoutFor("run-tempo", "run").wid, "run-tempo");
  assert.deepEqual(workoutFor("free-ride", "run").wid, "run-easy-40");
  assert.deepEqual(workoutFor("rh:tempo:60", "ride").wid, "free-ride", "never a Rhythm id");
  // after: never sooner than half an hour, never past three days
  const soon = await call("GET together", "ann", { query: "?with=cy&sport=run&after=0" });
  for (const w of soon.body.windows) assert.ok(w.start >= now + 30 * MIN);
  assert.equal(soon.body.workout.wid, "run-easy-40"); assert.equal(soon.body.windows[0]?.end - soon.body.windows[0]?.start, H);
  // friends only; over the site's 40 an hour, quiet, nothing fetched
  assert.equal((await call("GET together", "ann", { query: "?with=zed&sport=ride" })).status, 403);
  assert.equal((await call("GET together", "ann", { query: "?with=bo&sport=swim" })).status, 400);
  setLimit("together:site", 40); asked.length = 0;
  const q = await call("GET together", "ann", { query: `?with=di&sport=ride&after=${after}` });
  assert.equal(q.body.quiet, true); assert.deepEqual(q.body.windows, []); assert.equal(omRide(), 0);
  // 10 an hour for the account
  setLimit("together:ann", 10);
  assert.equal((await call("GET together", "ann", { query: "?with=bo&sport=ride" })).status, 429);
});

// ================================ every route's limit, and every answer's list ================================
test("every route counts against its own limit for the account", async () => {
  clearLimits();
  await call("POST card-now", "cy", { body: { items: [] } });
  await call("POST share-rank", "cy", { body: { kind: "weather", ids: [] } });
  await call("GET my-card", "cy", { query: "?kind=fitness" });
  await call("POST fit-share", "cy", { body: { day: "2026-11-02", tz: "Europe/London", sport: "ride" } });
  await call("GET together", "cy", { query: "?with=ann&sport=ride" });
  await call("POST fit-offer", "cy", { body: {} });
  await call("POST time-offer", "cy", { body: {} });
  const keys = sql.prepare("SELECT key FROM pg_limits").all().map((r) => r.key);
  for (const k of ["cardnow:cy", "sharerank:cy", "mycard:cy", "fitshare:cy", "together:cy", "fitoffer:cy", "timeoffer:cy"]) assert.ok(keys.includes(k), k);
  assert.equal((await call("POST card-now", "zed", { body: { items: [] } })).status, 200, "signed in is enough to look up nothing");
  const anon = await SHARE_ROUTES["POST card-now"]({ request: new Request("http://chat.localhost/api/pigeon/card-now", { method: "POST", body: "{}" }), env }).catch((e) => e);
  assert.equal(anon.status, 401, "not signed in");
});

// ================================ sync's Today First parts ================================
test("sync: hold, times and rides hold only ids and times; with ?quiet=1 the same, seen_at left alone", async () => {
  clearLimits();
  // (the traffic's ticks held off: only what's asked for)
  put("pg_meta", { k: "tick", v: "99999999999999" }); env.WX_TRAFFIC_TICK = "0";
  const start = Math.ceil(now / (15 * MIN)) * 15 * MIN + 3 * H, id = crypto.randomUUID(), ride = crypto.randomUUID();
  put("td_times", { user_id: "ann", id, kind: "meet", start, stop: start + H, tz: "Europe/London", with_id: "bo", who: "Bo", role: "asked", state: "yes", made: 0, until: start + 13 * H });
  put("fx_offers", { user_id: "ann", id: ride, start: start + 24 * H, stop: start + 26 * H, tz: "Europe/London", sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Bo", role: "asked", state: "yes", made: 0, until: start + 38 * H, with_id: "bo" });
  sql.prepare("UPDATE pg_users SET notify_prefs = ?, seen_at = 0 WHERE id = 'ann'").run(JSON.stringify({ quiet: true, quietFrom: new Date(now).getUTCHours(), quietTo: (new Date(now).getUTCHours() + 1) % 24, tz: "UTC" }));
  const sync = (q = "") => pigeonApi({ env, params: {}, waitUntil: () => {}, request: new Request(`http://chat.localhost/api/pigeon/sync${q}`, { headers: { Authorization: `Bearer ${tokens.ann}` } }) }).then((r) => r.json());
  for (const q of ["?quiet=1", ""]) {
    const b = await sync(q), part = { hold: b.hold, times: b.times, rides: b.rides };
    within(part, LISTS.sync, `sync${q}`, NEVER.filter((k) => k !== "start" && k !== "until"));
    assert.deepEqual(part.times, [{ id, with: "bo", kind: "meet", start, stop: start + H }]);
    assert.deepEqual(part.rides, [{ id: ride, with: "bo", start: start + 24 * H, stop: start + 26 * H, sport: "ride", state: "yes" }]);
    assert.equal(part.hold?.why, "quiet");
    for (const k of ["Bo", "London", "Ride how you like"]) assert.ok(!JSON.stringify(part).includes(k), k);
    assert.equal(sql.prepare("SELECT seen_at FROM pg_users WHERE id = 'ann'").get().seen_at > 0, q === "", q ? "?quiet=1: seen_at left alone" : "an ordinary sync notes it");
  }
  sql.prepare("UPDATE pg_users SET notify_prefs = NULL WHERE id = 'ann'").run(); sql.exec("DELETE FROM td_times; DELETE FROM fx_offers WHERE user_id = 'ann'");
});

test("the allow-lists catch what they're for", () => {
  assert.throws(() => within({ temp: 1, lat: 51.5 }, LISTS.weather, "x"));
  assert.throws(() => within({ pct: 1, price: 101 }, LISTS.markets, "x"));
  assert.throws(() => within({ done: true, start: 1 }, LISTS.fitness, "x"));
  assert.throws(() => within({ rain: { bo: { now: false, lon: 1 } } }, LISTS.shareRank, "x"));
  assert.doesNotThrow(() => within({ rain: { bo: null, cy: { now: true } } }, LISTS.shareRank, "x"));
  assert.throws(() => within({ times: [{ id: "x", who: "Bo" }] }, LISTS.sync, "x"));
  assert.throws(() => within({ card: { snap: { pct: 1, value: 2 } } }, LISTS.myCard.stock, "x"));
});
