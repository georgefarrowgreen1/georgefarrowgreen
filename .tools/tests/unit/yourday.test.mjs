// Mail on Your Day, stage 1 (trips and bookings), the account's side of the contract with Mail (the inflite repo's
// email/, which reads booking details and calendar invites by rules alone): Mail's card answer stood in for here, with
// bookings and a trip shaped exactly as the contract has them, and malformed entries among them. Checked: cardOf keeps
// ahead and trips field by field, dropping what's malformed and never the card (and leaves both out where Mail did: the
// switch off); tripFor picks the soonest trip starting within 48 hours or under way; Coming Up's rows from Mail (the next
// 24 hours, in time order among the others, the trip card's bookings left out); the day's trip with the weather where it
// goes, from Weather's own forecast code, the destination found by Weather's own place search where Mail gave no
// position (none where it can't be found), its zone and how far its clocks are from home's; Hide, the admin's alone,
// through the account's route to Mail's POST /api/connector/hide with the shared key; and the morning notification's
// line ("Rockfish at 19:30 · Flight tomorrow 07:40"). Against a real database (node:sqlite as D1) and stand-ins for Mail's
// Worker and Open-Meteo through fetch.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { db, hex, sha256 } from "../../../functions/_pigeon.js";
import { onRequest } from "../../../functions/api/account/[[path]].js";
import { cardOf, tripFor, mailHide, AHEAD_MAX, TRIPS_MAX } from "../../../functions/_todaymail.js";
import { upcomingFor } from "../../../functions/_todaycoming.js";
import { tripWeather, placeNamed } from "../../../functions/_todaywx.js";
import { morningLines, mailLine, composeMorning } from "../../../functions/_todaymorning.js";
import { tddb, todayPrefs } from "../../../functions/_today.js";
import { timesReady } from "../../../functions/_fittimes.js";
import { wxdb } from "../../../functions/_wxpush.js";
import { fitdb } from "../../../functions/_fitness.js";
import { offersReady } from "../../../functions/_fitshare.js";
import { timesFor } from "../../../functions/_times.js";
import { dayFor } from "../../../functions/_todayday.js";
import { forecast as omForecast } from "../mocks/wxappdata.mjs";

// ---- the database, the two accounts (gf, the site's admin, and bo) ----
function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...val(args)) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...val(args)), meta: {} }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
    now: () => (/^\s*(SELECT|PRAGMA|WITH)\b|\bRETURNING\b/i.test(sql) ? { results: s.prepare(sql).all(...val(args)) } : { meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
  });
  return { sql: s, prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const KEY = "mail-test-key", VIA = "http://127.0.0.1:8807", OM = "http://om.test", TODAY = "http://ifl.test:8788";
const env = { DB: d1(), APPS_SITE: "ifl.test", ACCOUNT_SITE: "gfg.test", ACCOUNT_HOST: "account.ifl.test", AUTH_HOST: "auth.ifl.test", HUB_ORIGINS: TODAY,
  MAIL_KEY: KEY, MAIL_VIA: VIA, WXAPP_URL: OM, METEOALARM_URL: "http://ma.test", EA_URL: "http://ea.test", NWS_URL: "http://nws.test", WARN_TTL: "0" };
await db(env); await tddb(env); await timesReady(env); await wxdb(env); await fitdb(env); await offersReady(env); await timesFor(env, "nobody", 0, 1, { t: 0 });
const run = (sql, ...a) => env.DB.sql.prepare(sql).run(...a);
const t0 = Date.now();
for (const id of ["gf", "bo"]) run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?2, ?2)", id, t0);
run("INSERT INTO pg_meta (k, v) VALUES ('admin_user', 'gf')");
async function signIn(user) {
  const token = randomBytes(24).toString("base64url");
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash) VALUES (?, ?, ?, ?, ?, ?)", `s-${user}-${token.slice(0, 6)}`, user, t0, t0, t0, hex(await sha256(token)));
  return `account=${token}`;
}
const gf = await signIn("gf"), bo = await signIn("bo");
const GF = { id: "gf", name: "gf", notify_prefs: "{}" }, BO = { id: "bo", name: "bo", notify_prefs: "{}" };
const OWN = "https://email.ifl.test";

// ---- Friday 6 November 2026, 08:12 in London: a table tonight, Lisbon from tomorrow (four emails), a train next week ----
const H = 3600e3, DAY = 864e5, FRI = Date.UTC(2026, 10, 6, 8, 12), at = (d, hh, mm = 0) => Date.UTC(2026, 10, d, hh, mm);
function booked(t = FRI) {
  const shift = t - FRI, s = (ms) => ms + shift;
  return {
    people: 2, updates: 4, later: { n: 0, next: null },
    ahead: [
      { id: "rock-0611", kind: "restaurant", title: "Table at Rockfish", sub: "2 people · Exeter Quay", start: s(at(6, 19, 30)), end: null, tz: "Europe/London", place: { name: "Rockfish, Exeter Quay", lat: 50.7196, lon: -3.5311 }, ref: null, trip: null, thread: "6f1c2b9e-7d4a-4f0e-9a51-2c8e1b7d3a10", status: "confirmed" },
      { id: "K7QX2M-1", kind: "flight", title: "TP1351 to Lisbon", sub: "Heathrow T2 07:40 → 10:15 · seat 14C", start: s(at(7, 7, 40)), end: s(at(7, 10, 15)), tz: "Europe/London", place: { name: "Heathrow T2" }, ref: "K7QX2M", trip: "trip-lisbon-1107", thread: "0d3e9a51-1b2c-4d5e-8f60-7a8b9c0d1e2f", status: "confirmed" },
      { id: "bk-5521876", kind: "hotel", title: "Memmo Alfama", sub: "Check-in from 15:00 · 3 nights", start: s(at(7, 15)), end: s(at(10, 11)), tz: "Europe/Lisbon", place: { name: "Memmo Alfama" }, ref: "5521876", trip: "trip-lisbon-1107", thread: "a1b2c3d4-0000-4000-8000-000000000001", status: "confirmed" },
      { id: "gyg-GYG8K2", kind: "event", title: "Sintra day trip", sub: "Meet 09:00, Rossio station", start: s(at(8, 9)), end: s(at(8, 18)), tz: "Europe/Lisbon", place: { name: "Rossio station" }, ref: "GYG8K2", trip: "trip-lisbon-1107", thread: "a1b2c3d4-0000-4000-8000-000000000002", status: "confirmed" },
      { id: "K7QX2M-2", kind: "flight", title: "TP1366 home", sub: "Lisbon 18:05 → Heathrow T2 20:40", start: s(at(10, 18, 5)), end: s(at(10, 20, 40)), tz: "Europe/Lisbon", place: { name: "Lisbon airport" }, ref: "K7QX2M", trip: "trip-lisbon-1107", thread: "0d3e9a51-1b2c-4d5e-8f60-7a8b9c0d1e2f", status: "confirmed" },
      { id: "gwr-81", kind: "train", title: "Exeter to Bristol", sub: "09:23 → 10:25 · coach C", start: s(at(15, 9, 23)), end: s(at(15, 10, 25)), tz: "Europe/London", place: null, ref: "TQ81", trip: null, thread: "a1b2c3d4-0000-4000-8000-000000000003", status: "confirmed" },
    ],
    trips: [{ id: "trip-lisbon-1107", name: "Lisbon", start: s(at(7, 7, 40)), end: s(at(10, 20, 40)), destination: { name: "Lisbon" }, items: ["K7QX2M-1", "bk-5521876", "gyg-GYG8K2", "K7QX2M-2"] }],
  };
}

// ---- the stand-ins: Mail's Worker (its card, and Hide), Open-Meteo (the forecast, and Weather's place search) ----
let mailSays = () => Response.json(booked()), hideSays = () => new Response(null, { status: 204 });
let asked = [], omTz = "Europe/Lisbon", omDown = false, places = { lisbon: [{ name: "Lisbon", latitude: 38.71667, longitude: -9.13333, country_code: "PT", admin1: "Lisbon", country: "Portugal" }] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(String(url)), h = new Headers(o.headers || {});
  if (String(url).startsWith(VIA)) {
    asked.push({ path: u.pathname, method: o.method || "GET", auth: h.get("Authorization"), body: o.body ? JSON.parse(o.body) : null });
    return u.pathname === "/api/connector/hide" ? hideSays(o) : mailSays(u, o);
  }
  if (u.origin === OM && u.pathname === "/v1/search") {
    asked.push({ path: u.pathname, name: u.searchParams.get("name"), count: u.searchParams.get("count"), language: u.searchParams.get("language") });
    return Response.json({ results: places[u.searchParams.get("name").toLowerCase()] || undefined, generationtime_ms: 0.4 });
  }
  if (u.origin === OM && u.pathname === "/v1/forecast") {
    asked.push({ path: u.pathname, lat: +u.searchParams.get("latitude"), lon: +u.searchParams.get("longitude"), days: +u.searchParams.get("forecast_days") });
    if (omDown) return new Response("down", { status: 503 });
    const f = omForecast(FRI);
    return Response.json({ ...f, timezone: omTz, timezone_abbreviation: omTz === "Europe/Paris" ? "CET" : "WET", utc_offset_seconds: omTz === "Europe/Paris" ? 3600 : 0 });
  }
  return new Response("{}", { status: 404 });
};
const quiet = console.error;
console.error = () => {};
after(() => { globalThis.fetch = realFetch; console.error = quiet; });
const waited = [];
async function call(method, path, { cookie, origin = TODAY, body } = {}) {
  const data = body === undefined ? undefined : JSON.stringify(body);
  const request = new Request(`http://account.ifl.test:8788/api/account/${path}`, { method, body: data, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}),
    ...(data ? { "Content-Type": "application/json" } : {}), "X-Inflite": "1" } });
  const res = await onRequest({ request, env, params: { path: path.split("/") }, waitUntil: (p) => waited.push(p) });
  return { s: res.status, j: (res.headers.get("Content-Type") || "").includes("json") ? await res.json() : null };
}

// ---- cardOf: the contract, field by field ----
test("cardOf: Mail's bookings and trips kept as the contract has them, each with Mail's own address for its email", () => {
  const c = cardOf(booked(), OWN, FRI);
  assert.equal(c.state, "ok");
  assert.equal(c.people, 2, "the numbers as before");
  assert.deepEqual(c.ahead.map((b) => b.id), ["rock-0611", "K7QX2M-1", "bk-5521876", "gyg-GYG8K2", "K7QX2M-2", "gwr-81"], "soonest first");
  assert.deepEqual(c.ahead[1], { id: "K7QX2M-1", kind: "flight", title: "TP1351 to Lisbon", sub: "Heathrow T2 07:40 → 10:15 · seat 14C", start: at(7, 7, 40), end: at(7, 10, 15), tz: "Europe/London",
    place: { name: "Heathrow T2" }, ref: "K7QX2M", trip: "trip-lisbon-1107", thread: "0d3e9a51-1b2c-4d5e-8f60-7a8b9c0d1e2f", href: `${OWN}/#thread=0d3e9a51-1b2c-4d5e-8f60-7a8b9c0d1e2f` });
  assert.deepEqual(c.ahead[0].place, { name: "Rockfish, Exeter Quay", lat: 50.7196, lon: -3.5311 });
  assert.deepEqual(c.trips, [{ id: "trip-lisbon-1107", name: "Lisbon", start: at(7, 7, 40), end: at(10, 20, 40), destination: { name: "Lisbon" }, items: ["K7QX2M-1", "bk-5521876", "gyg-GYG8K2", "K7QX2M-2"] }]);
  assert.equal(c.ahead[5].trip, null);
});

test("cardOf: the switch off (no ahead) is no lists at all; on with nothing booked, two empty ones; a list that isn't one, left out", () => {
  const plain = { people: 1, updates: 0, later: { n: 0, next: null } };
  const off = cardOf(plain, OWN, FRI);
  assert.ok(!("ahead" in off) && !("trips" in off), "off: absent");
  assert.deepEqual(cardOf({ ...plain, ahead: [], trips: [] }, OWN, FRI).ahead, []);
  assert.deepEqual(cardOf({ ...plain, ahead: [] }, OWN, FRI).trips, [], "ahead without trips: no trips");
  for (const ahead of ["lots", { 0: {} }, 7, null]) assert.ok(!("ahead" in cardOf({ ...plain, ahead }, OWN, FRI)), JSON.stringify(ahead));
  assert.equal(cardOf({ ...booked(), people: "2" }, OWN, FRI), null, "the numbers still decide the card");
});

test("cardOf: every malformed booking dropped on its own, never the card; strings made plain and cut to their bounds", () => {
  const good = booked().ahead[1];
  const bad = [
    { ...good, id: undefined }, { ...good, id: "has space" }, { ...good, id: "x".repeat(65) }, { ...good, id: "<b>" },
    { ...good, kind: "parcel" }, { ...good, kind: "FLIGHT" }, { ...good, title: "" }, { ...good, title: "   \n " }, { ...good, title: 42 },
    { ...good, start: "2026-11-07T07:40:00Z" }, { ...good, start: NaN }, { ...good, start: 1e9 }, { ...good, start: null },
    { ...good, status: "cancelled" }, { ...good, status: "maybe" },
    { ...good, start: FRI + 15 * DAY }, { ...good, start: FRI - 2 * DAY, end: FRI - 13 * H },
    null, "K7QX2M", 7, [good], {},
  ].map((b, i) => (b && typeof b === "object" && !Array.isArray(b) && b.id !== undefined && typeof b.id === "string" && b.id === good.id ? { ...b, id: `bad-${i}` } : b));
  // (each bad one renamed, so the good one's id isn't what drops them)
  bad[0] = { ...good, id: undefined };
  const odd = [
    { ...good, id: "odd-1", title: `TP1351 <b>to</b>‮ Lisbon\u0000\n\t${"x".repeat(200)}`, sub: "y".repeat(300), ref: "R".repeat(40), end: good.start - 1, tz: "Mars/Olympus", place: { name: "", lat: 1, lon: 2 }, trip: "not a trip", thread: "../../etc" },
    { ...good, id: "odd-2", place: { name: "Lisbon", lat: 38.7 }, tz: null, ref: "", thread: null, status: undefined, sub: undefined },
    { ...good, id: "odd-3", place: { name: "Somewhere", lat: 95, lon: 10 }, place2: "ignored" },
    { ...good, id: "odd-4", start: FRI - 2 * H, end: null },
    { ...good, id: "K7QX2M-1" },
  ];
  const c = cardOf({ people: 0, updates: 0, later: { n: 0, next: null }, ahead: [good, ...bad, ...odd], trips: [] }, OWN, FRI);
  assert.ok(c, "the card stands");
  assert.deepEqual(c.ahead.map((b) => b.id).sort(), ["K7QX2M-1", "odd-1", "odd-2", "odd-3", "odd-4"].sort(), "only the well-formed, each id once");
  const o1 = c.ahead.find((b) => b.id === "odd-1");
  assert.ok(!/[\u0000-\u001f‮]/.test(o1.title) && o1.title.startsWith("TP1351 <b>to</b> Lisbon x") && [...o1.title].length <= 80, o1.title);
  assert.equal([...o1.sub].length, 120);
  assert.equal(o1.ref.length, 24);
  assert.equal(o1.end, null, "an end before its start: none");
  assert.equal(o1.tz, null, "a zone that isn't one: none");
  assert.equal(o1.place, null, "a place with no name: none");
  assert.equal(o1.trip, null, "a trip that isn't among the trips: none");
  assert.equal(o1.thread, null);
  assert.equal(o1.href, `${OWN}/`, "no thread: Mail itself");
  const o2 = c.ahead.find((b) => b.id === "odd-2");
  assert.deepEqual(o2.place, { name: "Lisbon" }, "half a position: the name alone");
  assert.equal(o2.ref, null); assert.equal(o2.sub, "");
  assert.deepEqual(c.ahead.find((b) => b.id === "odd-3").place, { name: "Somewhere" }, "a latitude past 90: the name alone");
  assert.ok(!("place2" in c.ahead.find((b) => b.id === "odd-3")), "nothing kept that the contract doesn't name");
  assert.ok(c.ahead.find((b) => b.id === "odd-4"), "started two hours ago: still ahead (12 hours' grace)");
});

test("cardOf: malformed trips dropped, a trip's bookings only those in ahead, at most 40 bookings and 5 trips", () => {
  const b = booked(), ok = b.trips[0];
  const trips = [ok, { ...ok, id: "no-dest", destination: { lat: 1 } }, { ...ok, id: "none-here", items: ["zzz"] }, { ...ok, id: "bad id!" }, { ...ok, id: "no-name", name: " " },
    { ...ok, id: "no-start", start: "soon" }, null, "trip", { ...ok, id: "dupe", items: ["K7QX2M-1", "K7QX2M-1", "missing"], end: ok.start - 5 }];
  const c = cardOf({ ...b, trips }, OWN, FRI);
  assert.deepEqual(c.trips.map((x) => x.id), ["dupe", "trip-lisbon-1107"], "soonest first (the same start: by id)");
  assert.deepEqual(c.trips[0].items, ["K7QX2M-1"], "each once, and only those ahead");
  assert.equal(c.trips[0].end, null, "an end before its start: none");
  const many = Array.from({ length: 60 }, (_, i) => ({ ...b.ahead[0], id: `r-${String(i).padStart(2, "0")}`, start: FRI + (i + 1) * H, trip: null }));
  const lots = Array.from({ length: 8 }, (_, i) => ({ id: `t-${i}`, name: `Trip ${i}`, start: FRI + (i + 1) * H, end: null, destination: { name: "X" }, items: [`r-${String(i).padStart(2, "0")}`] }));
  const c2 = cardOf({ ...b, ahead: many, trips: lots }, OWN, FRI);
  assert.equal(c2.ahead.length, AHEAD_MAX);
  assert.equal(c2.trips.length, TRIPS_MAX);
  assert.deepEqual(c2.ahead.slice(0, 3).map((x) => x.trip), ["t-0", "t-1", "t-2"], "a booking's trip from the trip that names it");
});

// ---- tripFor ----
test("tripFor: the soonest trip starting within 48 hours or under way; none starting later, none over", () => {
  const c = cardOf(booked(), OWN, FRI);
  const tr = tripFor(c, FRI);
  assert.equal(tr.id, "trip-lisbon-1107");
  assert.deepEqual(tr.items.map((b) => b.id), ["K7QX2M-1", "bk-5521876", "gyg-GYG8K2", "K7QX2M-2"]);
  assert.deepEqual(tr.destination, { name: "Lisbon" });
  assert.equal(tripFor(cardOf(booked(), OWN, FRI - 2 * DAY), FRI - 2 * DAY), null, "starting in three days: not yet");
  assert.equal(tripFor(cardOf(booked(), OWN, at(8, 12)), at(8, 12)).id, "trip-lisbon-1107", "under way");
  assert.equal(tripFor(cardOf(booked(), OWN, at(10, 21)), at(10, 21)), null, "home again");
  const noEnd = booked(); noEnd.trips[0].end = null;
  assert.equal(tripFor(cardOf(noEnd, OWN, at(10, 20)), at(10, 20)).end, at(10, 20, 40), "no end of its own: its last booking's");
  assert.equal(tripFor(cardOf({ people: 0, updates: 0, later: { n: 0, next: null } }, OWN, FRI), FRI), null, "the switch off");
  assert.equal(tripFor(null, FRI), null);
});

// ---- Coming Up ----
test("Coming Up: Mail's bookings in the next 24 hours as rows, in time order among the others, the trip card's left out", () => {
  const mail = cardOf(booked(), OWN, FRI);
  const weather = { state: "ok", place: { name: "Exeter" }, rain: { now: false, at: at(6, 15), peak: at(6, 17), end: null } };
  let rows = upcomingFor({ weather, mail }, { tz: "Europe/London" }, FRI);
  assert.deepEqual(rows.map((r) => r.id), ["rain", "mail-rock-0611", "mail-K7QX2M-1"]);
  const r = rows[1];
  assert.deepEqual(r, { at: at(6, 19, 30), app: "mail", title: "Table at Rockfish", sub: "2 people · Exeter Quay", href: `${OWN}/#thread=6f1c2b9e-7d4a-4f0e-9a51-2c8e1b7d3a10`, id: "mail-rock-0611",
    booking: "rock-0611", kind: "restaurant", wx: "/weather/?lat=50.7196&lon=-3.5311&name=Rockfish%2C%20Exeter%20Quay#day=2026-11-06", place: "Rockfish, Exeter Quay" });
  assert.equal(rows[2].ref, "K7QX2M");
  assert.ok(!("wx" in rows[2]), "a place with no position: no Weather There");
  rows = upcomingFor({ weather, mail }, { tz: "Europe/London", tripId: "trip-lisbon-1107" }, FRI);
  assert.deepEqual(rows.map((x) => x.id), ["rain", "mail-rock-0611"], "the flight's in the trip card");
  assert.deepEqual(upcomingFor({ mail: { ...mail, state: "error" } }, { tz: "Europe/London" }, FRI), []);
  assert.deepEqual(upcomingFor({ mail: cardOf({ people: 0, updates: 0, later: { n: 0, next: null } }, OWN, FRI) }, { tz: "Europe/London" }, FRI), [], "the switch off");
  assert.deepEqual(upcomingFor({ mail }, { tz: "Europe/London" }, at(6, 20)).map((x) => x.id), ["mail-K7QX2M-1", "mail-bk-5521876"], "a booking passed: gone; the next day's now within 24 hours");
});

// ---- the weather where the trip goes ----
test("tripWeather: Weather's place search for a destination with no position, then Weather's forecast there, each day in Weather's words", async () => {
  asked = [];
  const trip = tripFor(cardOf(booked(), OWN, FRI), FRI);
  const w = await tripWeather(env, trip, FRI, { deg: (c) => `${Math.round(c)}°` });
  const search = asked.find((a) => a.path === "/v1/search"), fc = asked.find((a) => a.path === "/v1/forecast");
  assert.deepEqual(search, { path: "/v1/search", name: "Lisbon", count: "8", language: "en" }, "asked as Weather's own search asks");
  assert.deepEqual([fc.lat, fc.lon, fc.days], [38.7, -9.15, 10], "the forecast for its cell, ten days");
  assert.deepEqual(w.destination, { name: "Lisbon", lat: 38.71667, lon: -9.13333 });
  assert.equal(w.tz, "Europe/Lisbon");
  assert.equal(w.href, "/weather/?lat=38.71667&lon=-9.13333&name=Lisbon");
  assert.deepEqual(w.days.map((d) => d.day), ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
  for (const d of w.days) assert.ok(/^-?\d+°$/.test(d.hi) && /^-?\d+°$/.test(d.lo) && d.icon && d.label && d.said, JSON.stringify(d));
  // (the stand-in's third day ahead is wet from 09:00 to 18:00: wet part way through the day, said from when)
  assert.match(w.days[2].said, /^rain from 08:00$/, w.days[2].said);
  assert.match(w.days[0].said, /^(sunny|mostly sunny|sunny spells|mostly cloudy|cloudy)/);
  // (given a position, no search)
  asked = [];
  await tripWeather(env, { ...trip, destination: { name: "Lisbon", lat: 38.7223, lon: -9.1393 } }, FRI);
  assert.ok(!asked.some((a) => a.path === "/v1/search"));
  // (a place the search can't find: no weather, and no forecast asked)
  asked = [];
  assert.equal(await tripWeather(env, { ...trip, destination: { name: "Nowhere-on-sea" } }, FRI), null);
  assert.ok(!asked.some((a) => a.path === "/v1/forecast"));
  assert.equal(await placeNamed(env, ""), null);
});

// ---- the day ----
test("the day: Mail's trip with its weather, its zone and how far from home; its bookings not rows; the table tonight a row", async () => {
  mailSays = () => Response.json(booked());
  omTz = "Europe/Lisbon"; omDown = false;
  const cards = {};
  const d = await dayFor(env, GF, FRI, cards, { tz: "Europe/London" });
  assert.ok(d.trip, "a trip");
  assert.equal(d.trip.id, "trip-lisbon-1107");
  assert.equal(d.trip.name, "Lisbon");
  assert.deepEqual(d.trip.destination, { name: "Lisbon", lat: 38.71667, lon: -9.13333 });
  assert.equal(d.trip.tz, "Europe/Lisbon");
  assert.equal(d.trip.apart, 0, "Lisbon keeps London's time in November");
  assert.equal(d.trip.days.length, 4);
  assert.ok(d.trip.days.every((x) => x.hi && x.icon));
  assert.deepEqual(d.trip.items.map((b) => [b.id, b.wx]), [
    ["K7QX2M-1", "/weather/?lat=38.71667&lon=-9.13333&name=Lisbon#day=2026-11-07"], ["bk-5521876", "/weather/?lat=38.71667&lon=-9.13333&name=Lisbon#day=2026-11-07"],
    ["gyg-GYG8K2", "/weather/?lat=38.71667&lon=-9.13333&name=Lisbon#day=2026-11-08"], ["K7QX2M-2", "/weather/?lat=38.71667&lon=-9.13333&name=Lisbon#day=2026-11-10"]]);
  assert.equal(d.trip.items[0].href, `${OWN}/#thread=0d3e9a51-1b2c-4d5e-8f60-7a8b9c0d1e2f`);
  const mailRows = d.upcoming.filter((r) => r.app === "mail");
  assert.deepEqual(mailRows.map((r) => r.id), ["mail-rock-0611"], "tonight's table; the flight's in the trip");
  assert.ok(Array.isArray(cards.mail.ahead) && cards.mail.ahead.length === 6, "Mail's card among the cards, with its bookings");
  // (Paris: an hour ahead)
  omTz = "Europe/Paris";
  assert.equal((await dayFor(env, GF, FRI, {}, { tz: "Europe/London" })).trip.apart, 60);
  // (the forecast not to be had: the trip all the same, its days with no weather, its zone the hotel's)
  omDown = true;
  const d2 = await dayFor(env, GF, FRI, {}, { tz: "Europe/London" });
  assert.equal(d2.trip.tz, "Europe/Lisbon");
  assert.deepEqual(d2.trip.days, [{ day: "2026-11-07" }, { day: "2026-11-08" }, { day: "2026-11-09" }, { day: "2026-11-10" }]);
  omDown = false; omTz = "Europe/Lisbon";
  // (a destination the search can't find: no weather, no Weather There for bookings with no place of their own)
  mailSays = () => { const b = booked(); b.trips[0].destination = { name: "Nowhere-on-sea" }; return Response.json(b); };
  const d3 = await dayFor(env, GF, FRI, {}, { tz: "Europe/London" });
  assert.ok(d3.trip && !d3.trip.href && d3.trip.items.every((b) => !b.wx) && d3.trip.days.every((x) => !x.hi));
  // (no trip in 48 hours: none, and its flight's a row of Coming Up once within 24)
  mailSays = () => Response.json(booked());
  const d4 = await dayFor(env, GF, FRI - 2 * DAY, {}, { tz: "Europe/London" });
  assert.ok(!("trip" in d4));
  // (anyone else: no trip, Mail never asked)
  asked = [];
  const d5 = await dayFor(env, BO, FRI, {}, { tz: "Europe/London" });
  assert.ok(!("trip" in d5) && !d5.upcoming.some((r) => r.app === "mail"));
  assert.ok(!asked.some((a) => a.path.startsWith("/api/connector/")));
  // (Mail's switch off: no trip, no rows)
  mailSays = () => Response.json({ people: 1, updates: 0, later: { n: 0, next: null } });
  const d6 = await dayFor(env, GF, FRI, {}, { tz: "Europe/London" });
  assert.ok(!("trip" in d6) && !d6.upcoming.some((r) => r.app === "mail"));
  mailSays = () => Response.json(booked());
});

// ---- Hide ----
test("Hide: the account's route asks Mail's POST /api/connector/hide with the key, for Mail's owner alone", async () => {
  asked = [];
  let r = await call("POST", "today/mail/hide", { cookie: gf, body: { id: "K7QX2M-1" } });
  assert.deepEqual([r.s, r.j], [200, { ok: true }]);
  assert.deepEqual(asked, [{ path: "/api/connector/hide", method: "POST", auth: `Bearer ${KEY}`, body: { id: "K7QX2M-1" } }]);
  asked = [];
  r = await call("POST", "today/mail/hide", { cookie: bo, body: { id: "K7QX2M-1" } });
  assert.equal(r.s, 403, "not Mail's owner");
  for (const id of [undefined, "", "a b", "x".repeat(65), 7, ["K7QX2M-1"]]) assert.equal((await call("POST", "today/mail/hide", { cookie: gf, body: { id } })).s, 400, JSON.stringify(id));
  assert.equal((await call("POST", "today/mail/hide", { body: { id: "K7QX2M-1" } })).s, 401, "signed out");
  assert.equal((await call("POST", "today/mail/hide", { cookie: gf, origin: "https://evil.test", body: { id: "K7QX2M-1" } })).s, 403, "not from Today");
  assert.deepEqual(asked, [], "Mail never asked for any of those");
  hideSays = () => new Response("nope", { status: 500 });
  assert.equal((await call("POST", "today/mail/hide", { cookie: gf, body: { id: "K7QX2M-1" } })).s, 502, "Mail not taking it: said");
  hideSays = () => { throw new TypeError("connection refused"); };
  assert.equal((await call("POST", "today/mail/hide", { cookie: gf, body: { id: "K7QX2M-1" } })).s, 502);
  hideSays = () => new Response(null, { status: 204 });
  await assert.rejects(mailHide({ ...env, MAIL_KEY: "" }, GF, "K7QX2M-1"), (e) => e.status === 503, "no key: Mail isn't connected");
});

// ---- the morning ----
test("the morning's line: today's bookings still to come and tomorrow's first, after the weather", async () => {
  const mail = cardOf(booked(), OWN, at(6, 7));
  assert.equal(mailLine(mail, "Europe/London", at(6, 7)), "Rockfish at 19:30 · Flight tomorrow 07:40");
  assert.equal(mailLine(mail, "Europe/London", at(6, 20)), "Flight tomorrow 07:40", "tonight's table gone by");
  assert.equal(mailLine(cardOf(booked(), OWN, at(7, 6)), "Europe/London", at(7, 6)), "Flight 07:40 · Memmo Alfama at 15:00 · Sintra day trip tomorrow at 09:00");
  assert.equal(mailLine(cardOf(booked(), OWN, at(11, 7)), "Europe/London", at(11, 7)), null, "nothing today or tomorrow");
  assert.equal(mailLine({ state: "ok", people: 0 }, "Europe/London", at(6, 7)), null, "the switch off");
  const weather = { state: "ok", lead: "Dry and bright until the evening.", brief: { title: "A bright morning" } };
  const m = morningLines({ weather, mail }, { names: false, tz: "Europe/London", t: at(6, 7), lines: {} });
  assert.deepEqual(m.lines.slice(0, 2), ["Dry and bright until the evening.", "Rockfish at 19:30 · Flight tomorrow 07:40"]);
  assert.ok(!m.out.includes("Mail"));
  // (composed for the tick: Mail asked for the admin's, never for anyone else)
  mailSays = () => Response.json(booked());
  asked = [];
  const row = await todayPrefs(env, "gf");
  const note = await composeMorning(env, GF, row, at(6, 7), { cards: { weather } });
  assert.ok(note.lines.includes("Rockfish at 19:30 · Flight tomorrow 07:40"), JSON.stringify(note.lines));
  assert.match(note.body, /Rockfish at 19:30 · Flight tomorrow 07:40/);
  asked = [];
  const other = await composeMorning(env, BO, await todayPrefs(env, "bo"), at(6, 7), { cards: { weather } });
  assert.ok(!other.lines.some((l) => /Rockfish|Flight/.test(l)));
  assert.ok(!asked.some((a) => a.path === "/api/connector/card"), "nothing asked of Mail for anyone else");
  mailSays = () => Response.json(booked());
});
