// InFlite Today's cards (functions/_todaycards.js and the four card modules), against a real database (node:sqlite, made
// to look like D1, with each app's own tables) and stand-ins for Open-Meteo, MeteoAlarm and Yahoo through fetch: each
// card's fields in its app's own words, its empty and error states, Open-Meteo's allowance kept for the morning's
// briefings, a tick's accounts sharing one forecast, Fitness's day and its done, Markets' own logic for the day (a
// weekend, before the open, a holiday) and its kept prices, the lines to send cut at 500 characters, and every card's
// shape as the fixtures (.tools/tests/mocks/today/) have it, the page's tests being built on those.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { wxdb, OM_KEEP, COST_FULL } from "../../../functions/_wxpush.js";
import { fitdb } from "../../../functions/_fitness.js";
import { mkdb } from "../../../functions/_markets.js";
import { snapshotOf } from "../../../functions/_fittoday.js";
import { tddb } from "../../../functions/_today.js";
import { offersReady } from "../../../functions/_fitshare.js";
import { timesReady } from "../../../functions/_fittimes.js";
import { timesFor } from "../../../functions/_times.js";
import { cardsFor, localDay, shareCut, couldnt, withDeadline, Quiet, CARD_KEYS } from "../../../functions/_todaycards.js";
import { weatherCard, skyFor, heaviestOf } from "../../../functions/_todaywx.js";
import { fitnessCard } from "../../../functions/_todayfit.js";
import { marketsCard } from "../../../functions/_todaymkt.js";
import { forecast as omForecast } from "../mocks/wxappdata.mjs";
import { unpackCard, normCard } from "../../../pigeon/cards.js";
import { shapeForecast } from "../../../weather/data.js";
import { makeFormat, nowWall } from "../../../weather/format.js";
import { headline } from "../../../weather/insights.js";
import { briefing } from "../../../weather/alerts.js";
import { oneRain } from "../../../weather/agree.js";
import { inForce, colourOf, titleOf, badgeOf, spanOf } from "../../../weather/official.js";

const FIX = (n) => JSON.parse(readFileSync(new URL(`../mocks/today/${n}.json`, import.meta.url), "utf8"));
const CARDS = FIX("cards"), EMPTY = FIX("cards.empty"), ERROR = FIX("cards.error"), QUIET = FIX("cards.quiet");

// ---- the database, and the stand-ins ----
const sql = new DatabaseSync(":memory:");
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
let beforeRun = null, chatDown = false;
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }),
  run: async () => { if (beforeRun) { const f = beforeRun; if (f(q)) beforeRun = null; } return { meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }; } });
const later = [];
const env = {
  DB: { prepare: (q) => st(q),
    batch: async (list) => { if (chatDown) throw new Error("D1_ERROR: SECRET database words"); sql.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } },
  WXAPP_URL: "http://om.test", METEOALARM_URL: "http://ma.test", EA_URL: "http://ea.test", NWS_URL: "http://nws.test", WARN_TTL: "0",
  MARKETS_DATA: "http://yahoo.test", MARKETS_TTL: "0",
  waitUntil: (p) => { later.push(Promise.resolve(p).catch(() => {})); },
};
const settle = async () => { while (later.length) await later.shift(); };
const put = (table, row) => sql.prepare(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...val(Object.values(row)));
await db(env); await wxdb(env); await fitdb(env); await mkdb(env); await snapshotOf(env, "nobody");
sql.exec("CREATE TABLE IF NOT EXISTS fx_garmin_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, added INTEGER NOT NULL, size INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, id))");

const H = 3600e3, DAY = 864e5, MON = Date.UTC(2026, 10, 2, 8, 10), SAT_EVE = Date.UTC(2026, 9, 31, 19, 40);
const LINKS = { chat: "https://chat.inflite.ai", weather: "https://weather.inflite.ai", fitness: "https://fitness.inflite.ai", finance: "https://finance.inflite.ai", account: "https://account.inflite.ai", auth: "https://auth.inflite.ai" };
const ctxAt = (t, x = {}) => ({ only: CARD_KEYS, t, request: null, purpose: "page", tz: "Europe/London", links: LINKS, memo: null, ...x });

// what's asked for, and how each stand-in answers
const asked = [];
let warnFeed = { warnings: [] }, ride = "fine", omAt = MON, omDown = false, omLondon = false, omScene = {};
const Y = {};
const slow = new Map();
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
// (Open-Meteo's ride weather, as functions/_fitwx.js asks for it: a week, hour by hour, real seconds)
function rideJson(t) {
  const start = Math.floor(t / DAY) * DAY, time = [], o = { temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], is_day: [] };
  for (let s = start; s < start + 7 * DAY; s += H) {
    const hr = new Date(s).getUTCHours(), wet = ride === "rain";
    time.push(s / 1000); o.temperature_2m.push(14); o.apparent_temperature.push(14); o.precipitation_probability.push(wet ? 90 : 5); o.precipitation.push(wet ? 2 : 0);
    o.weather_code.push(wet ? 63 : 2); o.wind_speed_10m.push(10); o.wind_gusts_10m.push(20); o.wind_direction_10m.push(270); o.is_day.push(hr >= 7 && hr < 17 ? 1 : 0);
  }
  return { utc_offset_seconds: 0, hourly: { time, ...o } };
}
// (the stand-in's forecast as Open-Meteo gives it for a place in London: every time on London's clock, so the hour the
// clocks go back over comes twice and the one they skip isn't there, and the offset London has at t)
const LONDON_WALL = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const inLondon = (j, t) => {
  const wall = (s) => { const p = Object.fromEntries(LONDON_WALL.formatToParts(new Date(`${s}Z`)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
  const p = Object.fromEntries(LONDON_WALL.formatToParts(new Date(t)).map((x) => [x.type, x.value])), off = (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60e3) * 60e3) / 1000;
  return { ...j, timezone: "Europe/London", timezone_abbreviation: off ? "BST" : "GMT", utc_offset_seconds: off, current: { ...j.current, time: wall(j.current.time) },
    minutely_15: { ...j.minutely_15, time: j.minutely_15.time.map(wall) }, hourly: { ...j.hourly, time: j.hourly.time.map(wall) },
    daily: { ...j.daily, sunrise: j.daily.sunrise.map(wall), sunset: j.daily.sunset.map(wall) } };
};
// (Yahoo's chart for a symbol, as functions/_markets.js readChart reads it)
function chartJson(sym, range) {
  const y = Y[sym];
  if (!y) return null;
  const ts = [], close = [];
  for (let s = y.open.start, i = 0; s <= y.time; s += 300, i++) { ts.push(s); close.push(+(y.prev + (y.price - y.prev) * Math.min(1, (s - y.open.start) / Math.max(1, y.time - y.open.start))).toFixed(4)); }
  if (!ts.length) { ts.push(y.time); close.push(y.price); }
  close[close.length - 1] = y.price;
  const divs = range === "max" || range === "1y" ? y.divs || [] : [];
  return { chart: { result: [{ meta: { currency: y.cur, symbol: sym, exchangeName: y.ex, instrumentType: y.type, regularMarketTime: y.time, exchangeTimezoneName: y.tz, regularMarketPrice: y.price,
    previousClose: y.prev, chartPreviousClose: y.prev, longName: y.name, currentTradingPeriod: { regular: { start: y.open.start, end: y.open.end } } },
    timestamp: ts, ...(divs.length ? { events: { dividends: Object.fromEntries(divs.map(([d, amount]) => [String(d), { date: d, amount }])) } } : {}), indicators: { quote: [{ close }] } }] } };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const url = new URL(String(u)), k = url.host;
  asked.push(String(u));
  if (k === "om.test" && url.pathname === "/v1/forecast") return url.searchParams.get("timeformat") === "unixtime" ? json(rideJson(omAt)) : omDown ? json({ error: true }, 503) : json(omLondon ? inLondon(omForecast(omAt, omScene), omAt) : omForecast(omAt, omScene));
  if (k === "ma.test") return url.pathname.endsWith("feeds-united-kingdom") ? json(warnFeed) : json({ warnings: [] });
  if (k === "yahoo.test") {
    const m = /^\/v8\/finance\/chart\/([^/]+)$/.exec(url.pathname), sym = m && decodeURIComponent(m[1]);
    if (slow.has(sym)) await slow.get(sym);
    const j = sym && chartJson(sym, url.searchParams.get("range"));
    return j ? json(j) : json({ chart: { result: null } }, 404);
  }
  return json({}, 404);
};
after(async () => { globalThis.fetch = realFetch; for (const r of slow.values()) r.release?.(); await settle(); });

// ---- accounts ----
const user = (id, name = id) => put("pg_users", { id, handle: id, name, email: `${id}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0 });
const wxPlace = (id, place, settings = {}) => put("wx_accts", { user_id: id, data: JSON.stringify({ places: [{ region: "", ...place }], settings, notify: { places: [], brief: null, briefAt: "07:00" } }), ver: 1, updated: 0 });
const LONDON = { name: "London", lat: 51.5072, lon: -0.1276 };
const bucket = () => JSON.parse(sql.prepare("SELECT v FROM wx_meta WHERE k = 'om_bucket'").get()?.v || "null");
const setBucket = (n, at) => put("wx_meta", { k: "om_bucket", v: JSON.stringify({ n, at }) });
const omCalls = () => asked.filter((u) => u.startsWith("http://om.test/v1/forecast") && !u.includes("timeformat=unixtime")).length;
const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, "+00:00");
// a Met Office warning via MeteoAlarm, over London: yellow, for wind, 18:00 to 03:00 (as the fixture's)
const WIND = { warnings: [{ uuid: "u-w", alert: { identifier: "w-1", msgType: "Alert", status: "Actual", scope: "Public", sender: "https://www.metoffice.gov.uk", sent: iso(Date.UTC(2026, 10, 2, 6)),
  info: [{ language: "en-GB", event: "Yellow wind warning", onset: iso(Date.UTC(2026, 10, 2, 18)), expires: iso(Date.UTC(2026, 10, 3, 3)), senderName: "UK Met Office", headline: "Gusts", description: "",
    parameter: [{ valueName: "awareness_level", value: "2; yellow; Moderate" }, { valueName: "awareness_type", value: "1; Wind" }],
    area: [{ areaDesc: "London & South East England", polygon: ["51.3,-0.5 51.3,0.3 51.7,0.3 51.7,-0.5 51.3,-0.5"] }] }] } }] };
// The fixture's warning, as Weather's own functions word it (weather/official.js, and briefing()'s sentence, alerts.js)
const fixtureWarning = { issuer: "Met Office", via: "MeteoAlarm", event: "Yellow wind warning", level: 2, onset: "2026-11-02T18:00:00Z", expires: "2026-11-03T03:00:00Z" };

// The shape of one answer against a fixture's: the same keys, each the same type (null on either side matches anything:
// "null | …" in the contract), lists by their first entry
function sameShape(got, want, at = "") {
  if (want === null || got === null) return;
  if (Array.isArray(want)) { assert.ok(Array.isArray(got), `${at}: a list`); if (want.length && got.length) sameShape(got[0], want[0], `${at}[0]`); return; }
  if (typeof want === "object") {
    assert.ok(got && typeof got === "object" && !Array.isArray(got), `${at}: an object`);
    // (the card for Chat, packed for the page: on any ok card, whether or not the fixture's has it)
    const keys = (o) => Object.keys(o).filter((k) => k !== "sendCard").sort();
    assert.deepEqual(keys(got), keys(want), `${at}: its keys`);
    for (const k of Object.keys(want)) if (k !== "sendCard") sameShape(got[k], want[k], `${at}.${k}`);
    return;
  }
  assert.equal(typeof got, typeof want, `${at}: ${typeof want}`);
}

// ================================ Weather ================================
user("wx1"); wxPlace("wx1", LONDON);
test("Weather: the place's weather now, its next hours and its day in Weather's own words, with the warning in force there", async () => {
  warnFeed = WIND; omAt = MON;
  const c = await weatherCard(env, { id: "wx1" }, ctxAt(MON));
  assert.equal(c.state, "ok", JSON.stringify(c));
  assert.deepEqual(c.place, LONDON);
  assert.equal(c.href, `${LINKS.weather}/?lat=51.5072&lon=-0.1276&name=London`);
  assert.equal(c.clock, "24"); assert.equal(c.offset, 0);
  // (the same forecast through Weather's own steps)
  const f = makeFormat({}), wx = oneRain(shapeForecast(omForecast(MON, {}), LONDON), nowWall(0, MON));
  assert.equal(c.now.temp, f.temp(wx.current.temp)); assert.equal(c.now.feels, f.temp(wx.current.feels));
  assert.equal([c.lead, c.more].filter(Boolean).join(" "), headline(wx, MON, f), "the headline, its first sentence and the rest");
  assert.ok(/[.!?]$/.test(c.lead) && !c.lead.slice(0, -1).match(/[.!?]\s/), c.lead);
  assert.deepEqual(c.warning, CARDS.cards.weather.warning, "the warning in Weather's words, as the fixture has them");
  assert.equal(c.hours.label, "Next four hours");
  assert.deepEqual(c.hours.list.map((h) => h.time), ["Now", "09", "10", "11", "12"]);
  assert.deepEqual(c.hours.list.map((h) => h.t), [8, 9, 10, 11, 12].map((h) => Date.UTC(2026, 10, 2, h)));
  assert.equal(c.hours.list[0].temp, f.temp(wx.current.temp), "now's, with the weather now");
  assert.equal(c.hours.wet, c.hours.list.some((h) => h.pop >= 20));
  assert.equal(c.brief.title, briefing({ ...wx, official: [] }, MON, f).title);
  assert.match(c.brief.title, /^London · −?\d+° \/ −?\d+°$/);
  assert.equal(c.share, `London today: ${c.lead[0].toLowerCase()}${c.lead.slice(1)} ${CARDS.cards.weather.warning.said}`);
  assert.equal(c.sky, skyFor(wx, MON));
  sameShape(c, CARDS.cards.weather, "weather");
});

test("the fixture's warning words are those Weather's own functions make for its warning", () => {
  const f = makeFormat({}), w = inForce([fixtureWarning], MON)[0], title = titleOf(w), badge = badgeOf(w), span = spanOf(w, MON, f, 0), low = (s) => s[0].toLowerCase() + s.slice(1);
  const want = CARDS.cards.weather.warning;
  assert.equal(want.span, span); assert.equal(want.title, title); assert.equal(want.colour, colourOf(w)); assert.equal(want.issuer, w.issuer);
  assert.equal(want.chip, `${badge} ${title.toLowerCase()} ${low(span)}`);
  const wx = oneRain(shapeForecast(omForecast(MON, {}), LONDON), MON);
  assert.ok(briefing({ ...wx, official: [fixtureWarning] }, MON, f).body.includes(want.said), "briefing()'s own sentence for it");
});

test("Weather: in °F and on a 12-hour clock, as the account has Weather set", async () => {
  user("wx2"); wxPlace("wx2", { name: "Leeds", lat: 53.8, lon: -1.55 }, { temp: "f", clock: "12" });
  warnFeed = { warnings: [] };
  const c = await weatherCard(env, { id: "wx2" }, ctxAt(MON));
  const wx = oneRain(shapeForecast(omForecast(MON, {}), LONDON), MON);
  assert.equal(c.clock, "12");
  assert.equal(c.now.temp, `${Math.round(wx.current.temp * 9 / 5 + 32)}°`);
  assert.deepEqual(c.hours.list.map((h) => h.time), ["Now", "9am", "10am", "11am", "noon"]);
  assert.equal(c.warning, null, "no warning there");
  assert.equal(c.share, `Leeds today: ${c.lead[0].toLowerCase()}${c.lead.slice(1)}`);
});

test("Weather: from 19:00, tomorrow's day where you are, in place of the next hours", async () => {
  omAt = SAT_EVE; warnFeed = { warnings: [] };
  const c = await weatherCard(env, { id: "wx1" }, ctxAt(SAT_EVE));
  assert.equal(c.hours.label, "Tomorrow in London");
  assert.deepEqual(c.hours.list.map((h) => h.time), ["09", "11", "13", "15", "17"]);
  assert.deepEqual(c.hours.list.map((h) => h.t), [9, 11, 13, 15, 17].map((h) => Date.UTC(2026, 10, 1, h)));
  assert.equal(c.now.isDay, false);
  sameShape(c, QUIET.cards.weather, "weather (quiet)");
  omAt = MON;
});

test("Weather's hours across a clock change: each at the offset London has at that hour, not now's", async () => {
  user("wx7"); wxPlace("wx7", LONDON);
  warnFeed = { warnings: [] }; omLondon = true;
  try {
    // Saturday 24 October 2026, 20:30 in London (BST): tomorrow's hours are Sunday's, on GMT
    omAt = Date.UTC(2026, 9, 24, 19, 30); setBucket(OM_KEEP, omAt);
    let c = await weatherCard(env, { id: "wx7" }, ctxAt(omAt));
    assert.equal(c.state, "ok", JSON.stringify(c));
    assert.equal(c.offset, 3600, "the offset now, for the card's clock");
    assert.equal(c.hours.label, "Tomorrow in London");
    assert.deepEqual(c.hours.list.map((h) => h.time), ["09", "11", "13", "15", "17"]);
    assert.deepEqual(c.hours.list.map((h) => h.t), [9, 11, 13, 15, 17].map((h) => Date.UTC(2026, 9, 25, h)), "09:00 GMT is 09:00 UTC");
    // 00:10 that night (still BST): the next hours run through the hour the clocks go back over, twice
    omAt = Date.UTC(2026, 9, 24, 23, 10); setBucket(OM_KEEP, omAt);
    c = await weatherCard(env, { id: "wx7" }, ctxAt(omAt));
    assert.equal(c.hours.label, "Next four hours");
    assert.deepEqual(c.hours.list.map((h) => h.time), ["Now", "01", "01", "02", "03"]);
    assert.deepEqual(c.hours.list.map((h) => h.t), [Date.UTC(2026, 9, 24, 23), ...[0, 1, 2, 3].map((h) => Date.UTC(2026, 9, 25, h))], "an hour apart, as they really are");
    // Saturday 28 March 2026, 20:30 in London (GMT): tomorrow's hours are on BST
    omAt = Date.UTC(2026, 2, 28, 20, 30); setBucket(OM_KEEP, omAt);
    c = await weatherCard(env, { id: "wx7" }, ctxAt(omAt));
    assert.equal(c.offset, 0);
    assert.deepEqual(c.hours.list.map((h) => h.time), ["09", "11", "13", "15", "17"]);
    assert.deepEqual(c.hours.list.map((h) => h.t), [8, 10, 12, 14, 16].map((h) => Date.UTC(2026, 2, 29, h)), "09:00 BST is 08:00 UTC");
  } finally { omLondon = false; omAt = MON; }
});

test("Weather's sky is Weather's own: the copy is weather/app.js's skyFor, word for word", () => {
  const body = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); return src.slice(i, src.indexOf("\n}\n", i) + 2); };
  const app = body(readFileSync(new URL("../../../weather/app.js", import.meta.url), "utf8"), "function skyFor(wx, now) {").replace(/\bI\./g, "");
  const mine = body(readFileSync(new URL("../../../functions/_todaywx.js", import.meta.url), "utf8"), "export function skyFor(wx, now) {").replace(/^export /, "");
  assert.equal(mine, app);
});

test("Weather: no places in Weather is the card saying to add one", async () => {
  user("wx0");
  const c = await weatherCard(env, { id: "wx0" }, ctxAt(MON));
  assert.deepEqual(c, EMPTY.cards.weather);
});

test("Open-Meteo's allowance: each forecast paid for, none for a page that would leave less than half of what's kept for the morning's briefings", async () => {
  user("wx3"); wxPlace("wx3", { name: "Bath", lat: 51.38, lon: -2.36 });
  setBucket(OM_KEEP / 2 + COST_FULL - 1, MON);
  const before = omCalls();
  const c = await cardsFor(env, { id: "wx3" }, { only: ["weather"], t: MON, links: LINKS });
  assert.equal(c.cards.weather.state, "error");
  assert.equal(omCalls(), before, "Open-Meteo not asked");
  assert.deepEqual(c.cards.weather.place, { name: "Bath", lat: 51.38, lon: -2.36 }, "its place still said");
  assert.equal(c.cards.weather.said, "Couldn’t get the forecast just now.");
  assert.ok(!sql.prepare("SELECT 1 FROM pg_errors WHERE src = 'today weather'").get(), "a refusal kept for the briefings isn't an error to log");
  sameShape(c.cards.weather, ERROR.cards.weather, "weather (error)");
  setBucket(OM_KEEP / 2 + COST_FULL, MON);
  const ok = await cardsFor(env, { id: "wx3" }, { only: ["weather"], t: MON, links: LINKS });
  assert.equal(ok.cards.weather.state, "ok");
  assert.equal(omCalls(), before + 1);
  assert.deepEqual(bucket(), { n: OM_KEEP / 2, at: MON }, "what it cost taken off what's left, the half kept whole");
});

test("Open-Meteo's allowance: the morning's notification (in place of Weather's briefing) spends from the briefings' reserve, down to nothing", async () => {
  user("wx8"); wxPlace("wx8", { name: "Exeter", lat: 50.72, lon: -3.53 });
  setBucket(OM_KEEP / 2 - 10, MON);
  const before = omCalls();
  let c = await cardsFor(env, { id: "wx8" }, { only: ["weather"], t: MON, purpose: "morning", links: LINKS, memo: new Map() });
  assert.equal(c.cards.weather.state, "ok", "what a page couldn't have");
  assert.equal(omCalls(), before + 1);
  assert.deepEqual(bucket(), { n: OM_KEEP / 2 - 10 - COST_FULL, at: MON });
  setBucket(COST_FULL - 1, MON);
  c = await cardsFor(env, { id: "wx8" }, { only: ["weather"], t: MON, purpose: "morning", links: LINKS, memo: new Map() });
  assert.equal(c.cards.weather.state, "error", "not a forecast's worth left");
  assert.equal(omCalls(), before + 1, "Open-Meteo not asked");
  assert.ok(!sql.prepare("SELECT 1 FROM pg_errors WHERE src = 'today weather'").get());
  setBucket(COST_FULL, MON);
  c = await cardsFor(env, { id: "wx8" }, { only: ["weather"], t: MON, purpose: "morning", links: LINKS, memo: new Map() });
  assert.equal(c.cards.weather.state, "ok");
  assert.deepEqual(bucket(), { n: 0, at: MON });
});

test("Open-Meteo down: Weather's error, with its place, and nothing logged (it's not ours)", async () => {
  user("wx6"); wxPlace("wx6", { name: "York", lat: 53.96, lon: -1.08 });
  setBucket(OM_KEEP, MON); omDown = true;
  const c = await cardsFor(env, { id: "wx6" }, { only: ["weather"], t: MON, links: LINKS });
  omDown = false;
  assert.deepEqual(c.cards.weather, { state: "error", href: `${LINKS.weather}/?lat=53.96&lon=-1.08&name=York`, said: "Couldn’t get the forecast just now.", retry: true, place: { name: "York", lat: 53.96, lon: -1.08 } });
  assert.ok(!sql.prepare("SELECT 1 FROM pg_errors WHERE src = 'today weather'").get());
});

test("Open-Meteo's allowance: a tick's write between the card's read and its own isn't written over", async () => {
  setBucket(400, MON);
  beforeRun = (q) => { if (!/UPDATE wx_meta SET v = \?1 WHERE k = 'om_bucket'/.test(q)) return false; sql.prepare("UPDATE wx_meta SET v = ? WHERE k = 'om_bucket'").run(JSON.stringify({ n: 300, at: MON })); return true; };
  const c = await cardsFor(env, { id: "wx3" }, { only: ["weather"], t: MON, links: LINKS });
  assert.equal(c.cards.weather.state, "ok");
  assert.deepEqual(bucket(), { n: 300 - COST_FULL, at: MON }, "read again, and taken off the tick's");
});

test("a tick's accounts in one place share one forecast: Open-Meteo asked once for two", async () => {
  user("wx4"); user("wx5");
  wxPlace("wx4", { name: "Bristol", lat: 51.4545, lon: -2.5879 }); wxPlace("wx5", { name: "Clifton", lat: 51.46, lon: -2.61 });
  setBucket(OM_KEEP, MON);
  const memo = new Map(), before = omCalls();
  const [a, b] = await Promise.all(["wx4", "wx5"].map((id) => cardsFor(env, { id }, { only: ["weather"], t: MON, purpose: "morning", links: LINKS, memo })));
  assert.equal(a.cards.weather.state, "ok"); assert.equal(b.cards.weather.state, "ok");
  assert.equal(omCalls(), before + 1);
  assert.equal(b.cards.weather.place.name, "Clifton", "each its own place");
  assert.deepEqual([...memo.keys()], ["wx:51.45,-2.6"], "kept by its cell, and nothing else");
});

// ================================ Fitness ================================
const snapRow = (id, days, { at = MON - 12 * H, tz = "Europe/London", units = "metric" } = {}) => put("fx_today", { user_id: id, tz, units, days: JSON.stringify(days), at });
const TEMPO = { state: "session", id: "rh:tempo:60", sport: "ride", name: "Tempo 2 × 15", kind: "Tempo", secs: 3600, tss: 62, hard: true, why: "Fresh after Sunday’s rest: a good day for some tempo.",
  steps: [[600, 0.5, 0.75], [900, 0.88, 0.88], [300, 0.55, 0.55], [900, 0.88, 0.88], [900, 0.6, 0.45]] };
const week = (from, list) => Object.fromEntries(list.map((d, i) => [new Date(Date.parse(from) + i * DAY).toISOString().slice(0, 10), d]));

test("Fitness: no snapshot, or one over 8 days old, is the card saying to open Fitness", async () => {
  assert.deepEqual(await fitnessCard(env, { id: "fx0" }, ctxAt(MON)), EMPTY.cards.fitness);
  snapRow("fx-old", week("2026-11-02", [TEMPO]), { at: MON - 9 * DAY });
  assert.deepEqual(await fitnessCard(env, { id: "fx-old" }, ctxAt(MON)), EMPTY.cards.fitness);
});

test("Fitness: a day with nothing planned, and the next session in the days after", async () => {
  snapRow("fx-none", week("2026-11-02", [{ state: "none" }, { state: "rest", why: "" }, TEMPO, { state: "none" }]));
  const c = await fitnessCard(env, { id: "fx-none" }, ctxAt(MON));
  assert.equal(c.kind, "none"); assert.equal(c.session, null); assert.equal(c.share, null); assert.equal(c.best, null); assert.equal(c.why, null);
  assert.deepEqual(c.next, { day: "2026-11-04", label: "Wednesday", name: "Tempo 2 × 15", secs: 3600, kind: "Tempo" });
  assert.equal(c.day, "2026-11-02"); assert.equal(c.tz, "Europe/London");
  sameShape(c, QUIET.cards.fitness, "fitness (none)");
});

test("Fitness: a rest day, and an event", async () => {
  snapRow("fx-rest", week("2026-11-02", [{ state: "rest", why: "Easy after the weekend." }, TEMPO]));
  const r = await fitnessCard(env, { id: "fx-rest" }, ctxAt(MON));
  assert.equal(r.kind, "rest"); assert.equal(r.share, "A rest day today, letting the week sink in.");
  assert.equal(r.why, "Easy after the weekend.", "the rest day's reason, as Fitness gave it");
  assert.equal(r.session, null);
  assert.deepEqual(r.next, { day: "2026-11-03", label: "Tomorrow", name: "Tempo 2 × 15", secs: 3600, kind: "Tempo" });
  sameShape(r, QUIET.cards.fitness, "fitness (rest)");
  snapRow("fx-rest2", week("2026-11-02", [{ state: "rest", why: "" }]));
  assert.equal((await fitnessCard(env, { id: "fx-rest2" }, ctxAt(MON))).why, null, "none given: none");
  snapRow("fx-event", week("2026-11-02", [{ state: "event", name: "London to Brighton" }]));
  const e = await fitnessCard(env, { id: "fx-event" }, ctxAt(MON));
  assert.equal(e.kind, "event"); assert.deepEqual(e.event, { name: "London to Brighton" }); assert.equal(e.why, null);
});

test("Fitness: done, from what's in Fitness, shows even with no snapshot", async () => {
  put("fx_acts", { user_id: "fx-done", id: "a1", start: MON - H, sport: "ride", indoor: 0, name: "Morning ride", type: "fit", size: 10, sum: JSON.stringify({ secs: 3600, dist: 30120, tss: 55 }), added: MON });
  put("fx_acts", { user_id: "fx-done", id: "a0", start: MON - 10 * H, sport: "run", indoor: 0, name: "Yesterday's run", type: "fit", size: 10, sum: "{}", added: MON });
  const c = await fitnessCard(env, { id: "fx-done" }, ctxAt(MON));
  assert.equal(c.kind, "done"); assert.equal(c.session, null);
  assert.deepEqual(c.done, { name: "Morning ride", sport: "ride", start: MON - H, secs: 3600, dist: 30120, tss: 55, from: "fitness" }, "today's, by the account's day, not yesterday's");
  assert.equal(c.share, "Out on a ride today.");
  // (the card for Chat goes by the sport, never the activity's own name, which no view of a done card shows)
  assert.equal(c.send.snap.name, "Ride");
  assert.ok(!JSON.stringify(c.send).includes("Morning ride"), "the activity's own name isn't sent");
});

test("Fitness: done, from what's waiting to come in from Garmin, whatever was planned", async () => {
  snapRow("fx-garmin", week("2026-11-02", [TEMPO, TEMPO]));
  put("fx_garmin_new", { user_id: "fx-garmin", id: "g9", start: MON - 30 * 60e3, name: "Lunch ride", added: MON });
  const c = await fitnessCard(env, { id: "fx-garmin" }, ctxAt(MON));
  assert.equal(c.kind, "done"); assert.equal(c.done.from, "garmin"); assert.equal(c.done.secs, null);
  assert.equal(c.session.name, "Tempo 2 × 15", "the session it was");
  assert.equal(c.best, null, "no best time for what's done");
  assert.equal(c.share, "Rode my tempo session today: Tempo 2 × 15.");
  assert.deepEqual(c.next, { day: "2026-11-03", label: "Tomorrow", name: "Tempo 2 × 15", secs: 3600, kind: "Tempo" });
});

test("Fitness: today's session, and its best time to ride from the weather where you ride, in Fitness's words", async () => {
  user("fx-ride"); wxPlace("fx-ride", LONDON);
  snapRow("fx-ride", week("2026-11-02", [TEMPO]));
  ride = "fine";
  const c = await fitnessCard(env, { id: "fx-ride" }, ctxAt(MON));
  assert.equal(c.kind, "session");
  assert.deepEqual(c.session, { id: "rh:tempo:60", sport: "ride", name: "Tempo 2 × 15", kind: "Tempo", secs: 3600, tss: 62, hard: true, why: TEMPO.why, steps: TEMPO.steps });
  assert.equal(c.why, null, "a session's why is its own, not a rest day's");
  assert.equal(c.best.said, "Best 08:00 to 09:00"); assert.equal(c.best.span, "08:00–09:00"); assert.equal(c.best.poor, false);
  assert.equal(c.best.sub, "14°, dry, a light westerly · London");
  assert.deepEqual(c.best.grid.map((g) => new Date(g.t).getUTCHours()), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16], "each daylight hour in a ride's hours");
  assert.ok(c.best.grid.every((g) => ["Great", "Good", "Fair", "Poor"].includes(g.rating)));
  assert.equal(c.share, "Today: Tempo 2 × 15, 1 h. Best time to ride 08:00 to 09:00.");
  assert.equal(c.snapshotAt, MON - 12 * H); assert.equal(c.units, "metric");
  sameShape(c, CARDS.cards.fitness, "fitness");
});

test("Fitness: a day with no good time outside, as Fitness says it", async () => {
  ride = "rain";
  const c = await fitnessCard(env, { id: "fx-ride" }, ctxAt(MON));
  assert.equal(c.best.poor, true); assert.equal(c.best.said, "No good time outside today");
  assert.equal(c.best.sub, "Rain on and off all day: the trainer, perhaps · London");
  assert.equal(c.share, "Today: Tempo 2 × 15, 1 h.", "no best time in the line");
  ride = "fine";
});

test("Fitness: the day by the account's zone where Fitness sent it, else by the phone's", async () => {
  const at = Date.UTC(2026, 10, 2, 3);                 // 03:00 in London, 22:00 the day before in New York
  const A = { ...TEMPO, name: "Sunday's" }, B = { ...TEMPO, name: "Monday's" };
  snapRow("fx-away", { "2026-11-01": A, "2026-11-02": B }, { tz: "America/New_York", at: at - H });
  let c = await fitnessCard(env, { id: "fx-away" }, ctxAt(at));
  assert.equal(c.day, "2026-11-02"); assert.equal(c.tz, "Europe/London"); assert.equal(c.session.name, "Monday's");
  snapRow("fx-away", { "2026-10-31": A, "2026-11-01": A }, { tz: "America/New_York", at: at - H });
  c = await fitnessCard(env, { id: "fx-away" }, ctxAt(at));
  assert.equal(c.day, "2026-11-01"); assert.equal(c.tz, "America/New_York"); assert.equal(c.session.name, "Sunday's");
});

test("localDay: right across the clocks changing (a 23-hour day and a 25-hour one), and where they jump at midnight", () => {
  assert.deepEqual(localDay("Europe/London", Date.UTC(2026, 2, 29, 12)), { day: "2026-03-29", start: Date.UTC(2026, 2, 29, 0), end: Date.UTC(2026, 2, 29, 23) });
  assert.deepEqual(localDay("Europe/London", Date.UTC(2026, 9, 25, 12)), { day: "2026-10-25", start: Date.UTC(2026, 9, 24, 23), end: Date.UTC(2026, 9, 26, 0) });
  assert.deepEqual(localDay("Europe/London", Date.UTC(2026, 9, 24, 23, 30)), { day: "2026-10-25", start: Date.UTC(2026, 9, 24, 23), end: Date.UTC(2026, 9, 26, 0) }, "half past midnight, BST");
  // (Santiago's clocks go from 00:00 to 01:00 on 6 September 2026: the day starts at 01:00)
  const day = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(t));
  const s = localDay("America/Santiago", Date.UTC(2026, 8, 6, 15));
  assert.equal(s.day, "2026-09-06"); assert.equal(day(s.start), "2026-09-06"); assert.equal(day(s.start - 1), "2026-09-05"); assert.equal(day(s.end), "2026-09-07"); assert.equal(day(s.end - 1), "2026-09-06");
  assert.equal(s.end - s.start, 23 * H);
  assert.equal(localDay("Not/AZone", MON).day, "2026-11-02", "a zone that isn't one: London's");
});

// ================================ Markets ================================
const S = (t) => Math.floor(t / 1000);
// the quotes at t: London's traded today (or as Friday closed), New York's likewise
function market(t, { london = "today", ny = "friday" } = {}) {
  const day = new Date(t).toISOString().slice(0, 10), at = (h, m = 0) => S(Date.parse(`${day}T00:00:00Z`) + h * H + m * 60e3);
  const fri = (h, m = 0) => S(Date.UTC(2026, 9, 30) + h * H + m * 60e3);
  const ldn = london === "today" ? { time: S(t) - 60, open: { start: at(8), end: at(16, 30) } } : { time: fri(16, 30), open: { start: fri(8), end: fri(16, 30) } };
  const nyk = ny === "today" ? { time: S(t) - 60, open: { start: at(14, 30), end: at(21) } } : { time: fri(20), open: { start: fri(13, 30), end: fri(20) } };
  Object.assign(Y, {
    "RR.L": { name: "Rolls-Royce Holdings plc", cur: "GBp", ex: "LSE", type: "EQUITY", tz: "Europe/London", prev: 877.4, price: 894, ...ldn },
    "TSCO.L": { name: "Tesco PLC", cur: "GBp", ex: "LSE", type: "EQUITY", tz: "Europe/London", prev: 412, price: 410.8, ...ldn, divs: [] },
    AAPL: { name: "Apple Inc.", cur: "USD", ex: "NMS", type: "EQUITY", tz: "America/New_York", prev: 239.74, price: 241.18, ...nyk },
    "^FTSE": { name: "FTSE 100", cur: "GBP", ex: "FGI", type: "INDEX", tz: "Europe/London", prev: 8360.7, price: 8412.6, ...ldn },
    "^GSPC": { name: "S&P 500", cur: "USD", ex: "SNP", type: "INDEX", tz: "America/New_York", prev: 6188.9, price: 6214.3, ...nyk },
    "BTC-USD": { name: "Bitcoin USD", cur: "USD", ex: "CCC", type: "CRYPTOCURRENCY", tz: "UTC", prev: 94770, price: 97420, time: S(t) - 60, open: { start: S(t) - H / 1000, end: S(t) + 3600 } },
    "USDGBP=X": { name: "USD/GBP", cur: "GBP", ex: "CCY", type: "CURRENCY", tz: "Europe/London", prev: 0.77, price: 0.77, time: S(t) - 60, open: { start: S(t) - 3600, end: S(t) + 3600 } },
  });
}
const hold = (uid, symbol, name, qty, account = null, ord = 0) => put("mk_holdings", { user_id: uid, symbol, name, qty, cost: null, ord, added: 0, account });
const pf = (uid) => { hold(uid, "RR.L", "Rolls-Royce", 100, null, 0); hold(uid, "TSCO.L", "Tesco", 1000, "isa", 1); hold(uid, "AAPL", "Apple", 10, null, 2); hold(uid, "SHEL.L", "Shell", 0, null, 3); hold(uid, "GONE.L", "Gone Ltd", 5, null, 4); };
// Tesco's dividends, as Markets keeps them (mk_cache d:TSCO.L): twice a year for five years, the last in June
const TSCO_DIVS = [2022, 2023, 2024, 2025, 2026].flatMap((y) => [{ t: S(Date.UTC(y - 1, 10, 6)), amount: 0.0825 }, { t: S(Date.UTC(y, 5, 5)), amount: 0.041 }]);
put("mk_cache", { k: "d:TSCO.L", at: Date.now(), v: JSON.stringify(TSCO_DIVS) });
const WEEKDAY = Date.UTC(2026, 10, 2, 10);              // Monday 10:00 in London (05:00 in New York)

test("Markets: traded today, by Markets' own logic: only what's traded today counts, its best and worst, the day's line and the line to send", async () => {
  pf("mk1"); market(WEEKDAY);
  put("mk_isa", { user_id: "mk1", year: "2026/27", paid: 8000 });
  asked.length = 0;
  const c = await marketsCard(env, { id: "mk1" }, ctxAt(WEEKDAY));
  await settle();
  assert.ok(asked.some((u) => u.includes("/RR.L?") && /range=max/.test(u)), "Rolls-Royce's dividends, with nothing kept, asked for after the answer");
  assert.equal(c.state, "ok", JSON.stringify(c));
  assert.equal(c.owned, 4); assert.equal(c.following, 1);
  assert.equal(c.traded, true);
  // (Rolls-Royce up £16.60, Tesco down £12.00; Apple's move is Friday's, not today's)
  assert.equal(c.change, 4.6);
  assert.equal(c.value, Math.round((894 + 4108 + 241.18 * 10 * 0.77) * 100) / 100);
  assert.equal(c.pct, Math.round((4.6 / (c.value - 4.6)) * 100 * 100) / 100);
  assert.deepEqual(c.top, { name: "Rolls-Royce", symbol: "RR.L", change: 16.6, href: `${LINKS.finance}/#s=RR.L` });
  assert.deepEqual(c.low, { name: "Tesco", symbol: "TSCO.L", change: -12, href: `${LINKS.finance}/#s=TSCO.L` });
  assert.ok(c.spark && c.spark.vals.length >= 2 && c.spark.vals.length <= 48, JSON.stringify(c.spark));
  assert.equal(c.spark.vals.at(-1), c.value, "ending at its value now");
  assert.equal(c.market.open, true); assert.equal(c.market.said, "London open · closes in 6h 30m"); assert.deepEqual(c.market.shut, []);
  assert.deepEqual(c.leftOut, ["Gone Ltd"], "what has no price, by name");
  assert.equal(c.stale, false);
  assert.equal(c.share, "My portfolio is up 0.1% today.");
  assert.deepEqual(c.isa, { year: "2026/27", paid: 8000, allowance: 20000, left: 12000, used: 0.4, days: 155, inIsa: 4108 });
  sameShape(c, CARDS.cards.markets, "markets");
});

test("Markets, for the morning's notification: only what its line says (the value, the day's change, a market shut), with no dividend, ISA or day's line, so none of their reading is done", async () => {
  pf("mk9"); market(WEEKDAY);
  put("mk_isa", { user_id: "mk9", year: "2026/27", paid: 8000 });
  // (every statement the card sends, with what it's bound to)
  const seen = [];
  const wrap = (q, s, a = []) => ({ bind: (...b) => wrap(q, s.bind(...b), b), first: (...x) => (seen.push([q, a]), s.first(...x)), all: (...x) => (seen.push([q, a]), s.all(...x)), run: (...x) => (seen.push([q, a]), s.run(...x)) });
  const spy = { ...env, DB: { prepare: (q) => wrap(q, env.DB.prepare(q)), batch: (list) => env.DB.batch(list) } };
  const page = await marketsCard(spy, { id: "mk9" }, ctxAt(WEEKDAY));
  await settle();
  const forPage = seen.length;
  seen.length = 0; asked.length = 0;
  const m = await marketsCard(spy, { id: "mk9" }, ctxAt(WEEKDAY, { purpose: "morning" }));
  await settle();
  assert.equal(m.state, "ok", JSON.stringify(m));
  for (const k of ["owned", "following", "value", "change", "pct", "traded", "market", "top", "low", "leftOut", "stale", "share"]) assert.deepEqual(m[k], page[k], k);
  assert.equal(page.traded, true); assert.ok(page.isa && page.dividend && page.spark, "the page's card has all three");
  assert.equal(m.isa, null); assert.equal(m.dividend, null); assert.equal(m.spark, null);
  assert.ok(!seen.some(([q]) => /mk_isa/.test(q)), "the ISA not read");
  assert.ok(!seen.some(([q, a]) => /mk_cache/.test(q) && /^(d:|c:[^:]+:1y)/.test(String(a[0]))), "no holding's dividends read, nor its year's", JSON.stringify(seen.map(([, a]) => a[0])));
  assert.ok(!asked.some((u) => /range=(max|1y)/.test(u)), "nor asked for, even after the answer");
  assert.ok(!asked.some((u) => u.includes("BTC-USD")) && !seen.some(([, a]) => String(a[0]).includes("BTC-USD")), "nor Bitcoin, which no market's hours depend on");
  assert.ok(seen.length < forPage, `fewer statements for the morning (${seen.length}) than the page (${forPage})`);
  sameShape({ ...m, isa: page.isa, dividend: page.dividend, spark: page.spark }, CARDS.cards.markets, "markets (morning)");
});

test("Markets: the next dividend from what Markets has kept, never asked for while the card waits", async () => {
  market(WEEKDAY); asked.length = 0;
  const c = await marketsCard(env, { id: "mk1" }, ctxAt(WEEKDAY));
  assert.deepEqual(c.dividend, { name: "Tesco", symbol: "TSCO.L", at: Date.UTC(2026, 10, 6), value: 82.5, href: `${LINKS.finance}/#s=TSCO.L` }, "about £82.50, around 6 Nov: an estimate, a year on");
  assert.ok(!asked.some((u) => u.includes("TSCO.L") && /range=(max|1y)/.test(u)), "Tesco's dividends not asked for");
  await settle();
  const again = asked.filter((u) => /range=(max|1y)/.test(u) && /\/(RR\.L|TSCO\.L|AAPL)\?/.test(u));
  assert.deepEqual(again, [], "nor any priced one's, now each is kept");
});

test("Markets: a Saturday: nothing traded today, no change, and London and New York shut", async () => {
  const SAT = Date.UTC(2026, 9, 31, 12);
  market(SAT, { london: "friday", ny: "friday" });
  const c = await marketsCard(env, { id: "mk1" }, ctxAt(SAT));
  assert.equal(c.traded, false); assert.equal(c.change, 0); assert.equal(c.pct, 0);
  assert.deepEqual(c.market, { open: false, said: "Markets closed", shut: ["London", "New York"] });
  assert.equal(c.top, null); assert.equal(c.low, null); assert.equal(c.spark, null); assert.equal(c.share, null);
  assert.equal(c.isa.days, 157);
  sameShape(c, QUIET.cards.markets, "markets (quiet)");
});

test("Markets: Monday at 07:00, before the open: no change yet, and nothing said to be shut", async () => {
  const EARLY = Date.UTC(2026, 10, 2, 7);
  market(EARLY, { london: "friday", ny: "friday" });
  const c = await marketsCard(env, { id: "mk1" }, ctxAt(EARLY));
  assert.equal(c.traded, false); assert.equal(c.change, 0);
  assert.deepEqual(c.market.shut, []);
  assert.equal(c.share, null);
});

test("Markets: a weekday at 10:00 with nothing traded in London (a holiday): London shut, New York not yet open", async () => {
  market(WEEKDAY, { london: "friday", ny: "friday" });
  const c = await marketsCard(env, { id: "mk1" }, ctxAt(WEEKDAY));
  assert.equal(c.traded, false);
  assert.deepEqual(c.market.shut, ["London"]);
});

test("Markets: the ISA shown once something's paid in or held in it, not otherwise", async () => {
  market(WEEKDAY);
  hold("mk2", "RR.L", "Rolls-Royce", 10);
  assert.equal((await marketsCard(env, { id: "mk2" }, ctxAt(WEEKDAY))).isa, null);
  hold("mk3", "RR.L", "Rolls-Royce", 10, "isa");
  assert.deepEqual((await marketsCard(env, { id: "mk3" }, ctxAt(WEEKDAY))).isa, { year: "2026/27", paid: 0, allowance: 20000, left: 20000, used: 0, days: 155, inIsa: 89.4 });
});

test("Markets: nothing in the list is the card saying to add something; only followed is nothing owned yet", async () => {
  assert.deepEqual(await marketsCard(env, { id: "mk0" }, ctxAt(WEEKDAY)), EMPTY.cards.markets);
  hold("mk4", "RR.L", "Rolls-Royce", 0);
  const c = await marketsCard(env, { id: "mk4" }, ctxAt(WEEKDAY));
  assert.equal(c.state, "ok"); assert.equal(c.owned, 0); assert.equal(c.following, 1); assert.equal(c.value, 0); assert.equal(c.share, null);
});

test("Markets: no price at all for anything you own, fresh or kept, is the card's error", async () => {
  hold("mk5", "NOPE.L", "Nope", 3);
  const c = await cardsFor(env, { id: "mk5" }, { only: ["markets"], t: WEEKDAY, links: LINKS });
  assert.deepEqual(c.cards.markets, ERROR.cards.markets);
});

test("Markets: a quote slower than 3.5 seconds is given as kept (stale), not an error", async () => {
  market(WEEKDAY);
  await marketsCard(env, { id: "mk2" }, ctxAt(WEEKDAY));
  await settle();
  let release; const hold1 = new Promise((ok) => { release = ok; }); hold1.release = release;
  slow.set("RR.L", hold1);
  const t0 = Date.now(), c = await marketsCard(env, { id: "mk2" }, ctxAt(WEEKDAY));
  assert.ok(Date.now() - t0 < 6000, `answered by the card's time (${Date.now() - t0} ms)`);
  assert.equal(c.state, "ok"); assert.equal(c.stale, true); assert.equal(c.value, 89.4, "Rolls-Royce at its kept price");
  slow.delete("RR.L"); release(); await settle();
});

// ================================ Chat (its shape) ================================
test("Chat: the card's shape, as the fixture's", async () => {
  for (const [id, name] of [["ch-me", "Alex Morgan"], ["ch-sam", "Sam Lee"], ["ch-mum", "Mum"]]) user(id, name);
  put("pg_links", { a: "ch-me", b: "ch-sam", status: "ok", created_at: 0 }); put("pg_links", { a: "ch-mum", b: "ch-me", status: "ok", created_at: 0 });
  const m = (id, x) => put("pg_msgs", { id, ct: "sealed", km: 343, sent_at: MON - H, deliver_at: MON + H, ...x });
  m("c1", { sender: "ch-sam", recipient: "ch-me", swift: 1, bird_name: "Biscuit", bird_rank: "Navigator", from_place: "Paris" });
  m("c2", { sender: "ch-mum", recipient: "ch-me", sent_at: MON - 3 * H, deliver_at: MON - 2 * H });
  m("c3", { sender: "ch-me", recipient: "ch-sam", pigeon: "standard", to_place: "Lisbon", bird_name: "Pip", bird_rank: "Courier" });
  put("pg_meta", { k: "streaks_v1", v: "1" });
  put("pg_streaks", { a: "ch-me", b: "ch-mum", start: Math.floor(MON / DAY) - 12, last: Math.floor(MON / DAY) - 1, best: 19 });
  const c = await cardsFor(env, { id: "ch-me" }, { only: ["chat"], t: MON, links: LINKS });
  assert.equal(c.cards.chat.state, "ok");
  assert.ok(c.cards.chat.inbound.length && c.cards.chat.unread.length && c.cards.chat.mine.length && c.cards.chat.streak);
  sameShape(c.cards.chat, CARDS.cards.chat, "chat");
});

test("a card that fails is an error on its own card, logged without the database's words reaching the answer; the rest still come", async () => {
  chatDown = true;
  const c = await cardsFor(env, { id: "ch-me" }, { only: ["chat", "fitness"], t: MON, links: LINKS });
  chatDown = false;
  assert.deepEqual(c.cards.chat, ERROR.cards.chat);
  assert.ok(!JSON.stringify(c).includes("SECRET"), "no database words in the answer");
  assert.ok(sql.prepare("SELECT 1 FROM pg_errors WHERE src = 'today chat'").get(), "logged");
  assert.equal(c.cards.fitness.state, "empty");
  assert.deepEqual(Object.keys(c.cards), ["chat", "fitness"], "only the cards asked for");
});

test("each card has its time: one that's late is an error, and isn't logged", async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 20), Quiet);
  assert.equal(await withDeadline(Promise.resolve(7), 20), 7);
  sameShape(couldnt("fitness", LINKS), ERROR.cards.fitness, "fitness (error)");
  assert.deepEqual(couldnt("fitness", LINKS), ERROR.cards.fitness);
});

// ================================ All of it ================================
test("the lines to send are cut at 500 characters, at a word", async () => {
  const long = Array.from({ length: 140 }, (_, i) => `word${i}`).join(" ");
  const cut = shareCut(long);
  assert.ok(cut.length <= 500 && cut.endsWith("…"), cut.length);
  assert.ok(long.startsWith(cut.slice(0, -1)) && /word\d+$/.test(cut.slice(0, -1)), "at a word");
  assert.equal(shareCut("Short."), "Short.");
  snapRow("fx-long", week("2026-11-02", [{ state: "event", name: long }]));
  const c = await cardsFor(env, { id: "fx-long" }, { only: ["fitness"], t: MON, links: LINKS });
  assert.ok(c.cards.fitness.share.length <= 500 && c.cards.fitness.share.startsWith("Event day today: word0 word1"), c.cards.fitness.share.length);
});

test("the whole answer: when, the account's zone, and every card asked for in its own state", async () => {
  omAt = MON; warnFeed = WIND; market(WEEKDAY); setBucket(OM_KEEP, MON);
  const a = await cardsFor(env, { id: "wx1" }, { t: MON, tz: "Europe/London", links: LINKS });
  assert.deepEqual(Object.keys(a).sort(), ["at", "cards", "tz"]);
  assert.equal(a.at, MON); assert.equal(a.tz, "Europe/London");
  assert.deepEqual(Object.keys(a.cards), CARD_KEYS);
  assert.equal(a.cards.weather.state, "ok"); assert.equal(a.cards.chat.state, "empty"); assert.equal(a.cards.fitness.state, "empty"); assert.equal(a.cards.markets.state, "empty");
  sameShape(a.cards.chat, EMPTY.cards.chat, "chat (empty)");
  assert.equal((await cardsFor(env, { id: "wx1" }, { only: ["chat"], t: MON, tz: "Not/AZone", links: LINKS })).tz, "Europe/London", "a zone that isn't one: London's");
  assert.deepEqual((await cardsFor(env, { id: "wx1" }, { only: [], t: MON, links: LINKS })).cards, {}, "none asked for: none");
  await settle();
});

test("the fixtures agree with each other: the same times, zone and links throughout", () => {
  for (const f of [CARDS, EMPTY, ERROR]) { assert.equal(f.at, MON); assert.equal(f.tz, "Europe/London"); assert.deepEqual(Object.keys(f.cards), CARD_KEYS); }
  assert.equal(QUIET.at, SAT_EVE);
  for (const f of [CARDS, EMPTY, ERROR, QUIET]) for (const c of Object.values(f.cards)) assert.ok(Object.values(LINKS).some((l) => c.href.startsWith(`${l}/`)), c.href);
  // (Chat's says whether pigeons are on, too)
  for (const [k, c] of Object.entries(EMPTY.cards)) sameShape(c, { state: "", ...(k === "chat" ? { pigeons: true } : {}), href: "", said: "", action: { label: "", href: "" } }, `empty ${k}`);
});

// ================================ Chat's cards (Send to a friend) ================================
test("each card's card for Chat: packed for the page only, the weather's by its 0.05° cell, the portfolio's percent only, the session's with no share id, and nothing kept", async () => {
  omAt = MON; warnFeed = { warnings: [] }; market(WEEKDAY); setBucket(OM_KEEP, MON); ride = "fine";
  const shares = () => sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'fx_shares'").get().n ? sql.prepare("SELECT COUNT(*) AS n FROM fx_shares").get().n : 0;
  const before = shares();
  // weather
  const w = (await cardsFor(env, { id: "wx1" }, { only: ["weather"], t: MON, links: LINKS })).cards.weather;
  assert.equal(w.state, "ok");
  assert.ok(!("send" in w), "the card itself isn't in the page's answer");
  const wc = unpackCard(w.sendCard);
  assert.ok(wc, "sendCard unpacks");
  assert.equal(wc.kind, "weather"); assert.equal(wc.from, "today"); assert.equal(wc.snap.place, "London");
  assert.deepEqual(wc.ref.cell, [51.5, -0.15], "the 0.05° cell");
  for (const exact of ["51.5072", "-0.1276", "0.1276"]) assert.ok(!JSON.stringify(wc).includes(exact), `no exact place (${exact})`);
  assert.ok(!("warn" in wc.snap));
  assert.ok(wc.say.startsWith("London today: "), wc.say);
  // markets: the whole portfolio's percent, and nothing else
  pf("mk-send"); market(WEEKDAY);
  const m = (await cardsFor(env, { id: "mk-send" }, { only: ["markets"], t: WEEKDAY, links: LINKS })).cards.markets, mc = unpackCard(m.sendCard);
  assert.ok(mc, JSON.stringify(m.sendCard));
  assert.deepEqual(Object.keys(mc.snap).sort(), ["day", "name", "pct", "sym"]);
  assert.equal(mc.snap.name, "Portfolio"); assert.equal(mc.snap.sym, null); assert.equal(mc.snap.pct, m.pct);
  assert.ok(!("ref" in mc));
  for (const word of ["Rolls", "Tesco", "RR.L", "TSCO", "top", "change", "value", "isa", "dividend"]) assert.ok(!JSON.stringify(mc).includes(word), word);
  // fitness: today's session, no share id
  const f = (await cardsFor(env, { id: "fx-ride" }, { only: ["fitness"], t: MON, links: LINKS })).cards.fitness, fc = unpackCard(f.sendCard);
  assert.ok(fc);
  assert.equal(fc.kind, "fitness"); assert.equal(fc.snap.name, "Tempo 2 × 15"); assert.equal(fc.snap.sport, "ride"); assert.equal(fc.snap.day, "2026-11-02");
  assert.ok(!("ref" in fc), "no share id: Chat makes one as it's sent");
  assert.ok(fc.snap.best && fc.snap.best.end > fc.snap.best.start);
  // the morning's cards carry none
  const mo = (await cardsFor(env, { id: "fx-ride" }, { only: ["fitness"], t: MON, links: LINKS, purpose: "morning" })).cards.fitness;
  assert.ok(!("sendCard" in mo) && !("send" in mo));
  // kept for "How's yours?" only when asked
  const kept = (await cardsFor(env, { id: "fx-ride" }, { only: ["fitness"], t: MON, links: LINKS, keepSend: true })).cards.fitness;
  assert.ok(normCard(kept.send)); assert.ok(!JSON.stringify(kept).includes('"send"'), "and never in its JSON");
  assert.equal(shares(), before, "no share row made by a page");
  await settle();
});

// ================================ Today First: the day with the cards (?v=2, spec §7.2) ================================
const V2FIX = ["morning", "midday", "preride", "riding", "after", "after-fit", "evening"].map((n) => [n, FIX(`cards.${n}`)]);
// (what version 2 adds to the cards themselves, and nothing else)
function v1Of(cards) {
  const c = JSON.parse(JSON.stringify(cards));
  if (c.weather) delete c.weather.rain;
  if (c.markets) { delete c.markets.holdings; if (c.markets.market) delete c.markets.market.closesAt; for (const k of ["top", "low"]) if (c.markets[k]) delete c.markets[k].pct; }
  return c;
}

test("v=2: the day with the cards, as the fixtures have it; without it (or with v: 1), version 1's answer, byte for byte", async () => {
  // (an account with all four: a place in Weather, Fitness's day, holdings in London and New York, a friend's pigeon on its way)
  user("v2", "Vee Two"); user("v2-sam", "Sam Lee"); wxPlace("v2", LONDON); snapRow("v2", week("2026-11-02", [TEMPO])); pf("v2");
  put("pg_links", { a: "v2", b: "v2-sam", status: "ok", created_at: 0 });
  put("pg_msgs", { id: "v2-in", sender: "v2-sam", recipient: "v2", ct: "SECRET-WORDS", km: 343, sent_at: WEEKDAY - H, deliver_at: WEEKDAY + H, from_place: "Paris" });
  omAt = WEEKDAY; omLondon = false; warnFeed = { warnings: [] }; market(WEEKDAY); setBucket(OM_KEEP, WEEKDAY); ride = "fine";
  // (Today First's tables, made first, as they are on a live database: this kit's batches can't overlap)
  await tddb(env); await offersReady(env); await timesReady(env); await timesFor(env, "nobody", 0, 1, { t: 0 });
  const ask = (x = {}) => cardsFor(env, { id: "v2", name: "Vee Two" }, { t: WEEKDAY, tz: "Europe/London", links: LINKS, ...x });
  await ask(); await settle();                         // (the dividends asked for after the first answer, kept for the rest)
  const one = await ask(); await settle();
  const two = await ask({ v: 2 }); await settle();
  const again = await ask({ v: 1 }); await settle();
  assert.deepEqual(Object.keys(one), ["at", "tz", "cards"], "version 1: when, the zone and the cards, nothing more");
  assert.equal(JSON.stringify(again), JSON.stringify(one), "v: 1 is the same as none");
  assert.ok(!/"(rain|holdings|closesAt)"/.test(JSON.stringify(one)) && !("pct" in (one.cards.markets.top || {})), "none of version 2's fields in version 1's cards");
  assert.equal(JSON.stringify({ at: two.at, tz: two.tz, cards: v1Of(two.cards) }), JSON.stringify(one), "version 2's cards are version 1's, with only more on them");
  assert.ok(!JSON.stringify(two).includes("SECRET"), "and never a word of a letter");
  // (the answer's own fields, as every fixture has them)
  assert.equal(two.v, 2);
  for (const [n, f] of V2FIX) {
    assert.deepEqual(Object.keys(two).filter((k) => k !== "planning").sort(), Object.keys(f).filter((k) => k !== "morning").sort(), `${n}: the answer's fields`);
    for (const k of CARD_KEYS) sameShape(two.cards[k], f.cards[k], `${n}: ${k}`);
    for (const k of ["quiet", "apps", "timeline", "acts"]) sameShape(two[k], f[k], `${n}: ${k}`);
  }
  // (each row of Coming Up: what it is, when, where it opens; a card to send only with its line)
  for (const r of two.upcoming) {
    for (const k of ["at", "app", "title", "sub", "href", "id"]) assert.ok(k in r, `${r.id}: ${k}`);
    assert.ok(Object.keys(r).every((k) => ["at", "app", "title", "sub", "href", "id", "share", "sendCard"].includes(k)), JSON.stringify(r));
    assert.equal("sendCard" in r, "share" in r, r.id);
  }
  assert.equal(two.phase, "morning"); assert.equal(two.planning, true, "this account's day not planned yet");
  // the cards' additions: the rain with its heaviest hour; when London closes; each mover's and holding's percent, a card each
  const w = two.cards.weather, m = two.cards.markets;
  assert.ok("rain" in w && (w.rain === null || Object.keys(w.rain).sort().join() === "at,end,now,peak"), JSON.stringify(w.rain));
  assert.equal(m.market.closesAt, Date.UTC(2026, 10, 2, 16, 30), "London's close today (New York's period is Friday's)");
  assert.deepEqual([m.top.pct, m.low.pct], [Math.round(((894 - 877.4) / 877.4) * 10000) / 100, Math.round(((410.8 - 412) / 412) * 10000) / 100]);
  assert.deepEqual(m.holdings.map((h) => [h.sym, h.name, h.pct]), [["RR.L", "Rolls-Royce", 1.89], ["TSCO.L", "Tesco", -0.29], ["AAPL", "Apple", 0]], "Apple's move is Friday's, not today's");
  for (const h of m.holdings) {
    const c = unpackCard(h.sendCard);
    assert.deepEqual(c.snap, { name: h.name, sym: h.sym, pct: h.pct, day: h.sym === "AAPL" ? "2026-11-02" : "2026-11-02" });
    assert.deepEqual(normCard(c), c, "unchanged through normCard");
  }
  assert.ok(!/£|value|change|qty/.test(JSON.stringify(m.holdings)), "percents only");
  // (the day's words from them: London opens at 08:00 is past at 10:00; the close and the movers in Coming Up)
  const close = two.upcoming.find((r) => r.id === "close");
  assert.deepEqual([close?.title, close?.sub], ["London closes", "Rolls-Royce +1.9% so far"]);
  assert.equal(two.apps.markets, "Rolls-Royce +1.9%");
  assert.equal(two.apps.fitness, "Tempo 2 × 15 today");
});

test("v=2 for the morning's notification is version 1's: the tick never works out a day", async () => {
  omAt = WEEKDAY; market(WEEKDAY); setBucket(OM_KEEP, WEEKDAY);
  const a = await cardsFor(env, { id: "v2" }, { t: WEEKDAY, tz: "Europe/London", links: LINKS, purpose: "morning", v: 2 });
  assert.deepEqual(Object.keys(a), ["at", "tz", "cards"]);
  assert.ok(!("rain" in a.cards.weather) && !("holdings" in a.cards.markets));
  await settle();
});

test("v=2 when the day can't be worked out: the cards still come, as version 1's, and the fault's logged", async () => {
  omAt = WEEKDAY; market(WEEKDAY); setBucket(OM_KEEP, WEEKDAY);
  sql.prepare("DELETE FROM pg_errors").run();
  // (a fault in the day itself: here, the request's waitUntil refusing the day's plan, which the day hands it unplanned;
  // an account with only a Weather place, whose cards hand waitUntil nothing)
  const broken = { ...env, waitUntil: () => { throw new Error("waitUntil refused"); } };
  const a = await cardsFor(broken, { id: "wx1" }, { t: WEEKDAY, tz: "Europe/London", links: LINKS, v: 2 });
  assert.deepEqual(Object.keys(a), ["at", "tz", "cards"], "version 1's answer");
  assert.equal(a.cards.weather.state, "ok");
  assert.ok(sql.prepare("SELECT src FROM pg_errors").all().some((r) => r.src === "today day"), "logged");
  await settle();
});

test("v=2, Weather: the rain on the card (when, until, its heaviest hour), and tomorrow's 07:00 held apart for the day", async () => {
  omAt = MON; omLondon = false; warnFeed = { warnings: [] }; setBucket(OM_KEEP, MON); omScene = { rainIn: 180 };
  try {
    const c = await weatherCard(env, { id: "wx1" }, ctxAt(MON, { v: 2 })), v1 = await weatherCard(env, { id: "wx1" }, ctxAt(MON));
    assert.equal(c.state, "ok");
    assert.ok(!("rain" in v1), "version 1's card: no rain field");
    const r = c.rain;
    assert.deepEqual(Object.keys(r).sort(), ["at", "end", "now", "peak"]);
    assert.equal(r.now, false);
    assert.ok(r.at >= MON + 2.5 * H && r.at <= MON + 3 * H + 15 * 60e3, `from about 11:10: ${new Date(r.at).toISOString()}`);
    assert.ok(r.peak >= r.at && r.peak < r.at + 2 * H && (r.end === null || (r.end > r.at && r.peak < r.end)), `its heaviest hour within it (its end, where known): ${JSON.stringify(r)}`);
    // (tomorrow's 07:00, held apart: in the day's cards, never the card's JSON)
    const tw = c.forDay?.tomorrow;
    assert.equal(tw.at, Date.UTC(2026, 10, 3, 7)); assert.equal(tw.day, "2026-11-03");
    assert.ok(/^(dry|rain|rain likely|a \d+% chance of rain) and (still|a light breeze|breezy|windy)$/.test(tw.said), tw.said);
    assert.ok([null, "ride", "run"].includes(tw.good));
    assert.equal(typeof c.forDay.deg, "function"); assert.equal(c.forDay.deg(11.4), "11°");
    assert.ok(!JSON.stringify(c).includes("forDay") && !JSON.stringify(c).includes("tomorrow"), "nothing held apart is in the JSON");
    // (in the small hours, the next 07:00 is this morning's)
    omAt = Date.UTC(2026, 10, 3, 3); setBucket(OM_KEEP, omAt);
    const early = await weatherCard(env, { id: "wx1" }, ctxAt(omAt, { v: 2 }));
    assert.equal(early.forDay?.tomorrow?.at, Date.UTC(2026, 10, 3, 7));
  } finally { omScene = {}; omAt = MON; }
  await settle();
});

test("heaviestOf: the wettest hour between two times on the place's clock, the soonest of equals; none when none is wet", () => {
  const h = (hr, precip, pop = 90, code = 63) => ({ t: Date.UTC(2026, 10, 2, hr), precip, pop, code });
  const wx = { hourly: [h(14, 0, 10, 2), h(15, 0.4), h(16, 1.2), h(17, 2.5), h(18, 2.5), h(19, 0.3), h(20, 0, 10, 2)] };
  assert.equal(heaviestOf(wx, Date.UTC(2026, 10, 2, 14), Date.UTC(2026, 10, 2, 21)), Date.UTC(2026, 10, 2, 17));
  assert.equal(heaviestOf(wx, Date.UTC(2026, 10, 2, 14), Date.UTC(2026, 10, 2, 17)), Date.UTC(2026, 10, 2, 16), "only within the times");
  assert.equal(heaviestOf(wx, Date.UTC(2026, 10, 2, 20), Date.UTC(2026, 10, 2, 23)), null);
  assert.equal(heaviestOf({}, 0, 1), null);
});
