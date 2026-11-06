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
// Stages 2 and 3 (yourday2 spec): parcels, bills and money, a trip's hidden bookings and a repeating invite's dates kept
// field by field (anything malformed dropped, never the card); Waiting for You's rows from Mail (a bill to pay, a
// renewal, a trial ending, a return's last day) and the quiet "paid by themselves" line; a parcel's Coming Up row (its
// window, its stage); a repeating date's row ("· every other Thursday"); the Bills sheet's words; Put back (the account's
// route to Mail's POST /api/connector/unhide, Mail's 404 as done); and the morning's parcel and bill.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { db, hex, sha256 } from "../../../functions/_pigeon.js";
import { onRequest } from "../../../functions/api/account/[[path]].js";
import { cardOf, tripFor, mailHide, mailUnhide, AHEAD_MAX, TRIPS_MAX, PARCELS_MAX, BILLS_MAX } from "../../../functions/_todaymail.js";
import { upcomingFor, mailWaiting, moneyFor } from "../../../functions/_todaycoming.js";
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
let mailSays = () => Response.json(booked()), hideSays = () => new Response(null, { status: 204 }), unhideSays = () => new Response(null, { status: 204 });
let asked = [], omTz = "Europe/Lisbon", omDown = false, places = { lisbon: [{ name: "Lisbon", latitude: 38.71667, longitude: -9.13333, country_code: "PT", admin1: "Lisbon", country: "Portugal" }] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(String(url)), h = new Headers(o.headers || {});
  if (String(url).startsWith(VIA)) {
    asked.push({ path: u.pathname, method: o.method || "GET", auth: h.get("Authorization"), body: o.body ? JSON.parse(o.body) : null });
    return u.pathname === "/api/connector/hide" ? hideSays(o) : u.pathname === "/api/connector/unhide" ? unhideSays(o) : mailSays(u, o);
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
  hideSays = () => new Response(JSON.stringify({ error: "Not found." }), { status: 404 });
  assert.equal((await call("POST", "today/mail/hide", { cookie: gf, body: { id: "K7QX2M-1" } })).s, 200, "a booking Mail no longer has (404): as good as hidden");
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

// ---- stages 2 and 3: parcels, bills, money, a trip's hidden bookings, a repeating invite ----
// (the same Friday: Wiggle's parcel out for delivery with Evri between 11 and 13, Amazon's due Monday, a Royal Mail
// parcel delivered two hours ago, Zara's last day to return on Monday; Octopus's bill by card, 18% over its usual, EE's
// direct debit, Admiral's renewal £23.60 up on last year, Strava's trial ending on Sunday, Spotify's receipt; and Book
// club, every other Thursday, one cancelled and one moved)
const DEC = (d, hh, mm = 0) => Date.UTC(2026, 11, d, hh, mm);
const PARCELS = () => [
  { id: "evri-H01AA2B3C4D5", shop: "Wiggle", carrier: "Evri", stage: 2, window: { from: at(6, 11), to: at(6, 13) }, due: at(6, 0), deliveredAt: null, note: "", track: "https://www.evri.com/track/parcel/H01AA2B3C4D5/details", ref: "H01AA2B3C4D5", order: "8817205", thread: "th-evri-1", returnBy: DEC(4, 23, 59) },
  { id: "amz-204-1189", shop: "Amazon", carrier: "Royal Mail", stage: 1, window: null, due: at(9, 12), deliveredAt: null, note: "", track: "https://www.royalmail.com/track-your-item#/tracking-results/AB123456789GB", ref: "AB123456789GB", order: "204-1189", thread: "th-amz-1", returnBy: null },
  { id: "rm-JX1", shop: "", carrier: "Royal Mail", stage: 3, window: null, due: null, deliveredAt: FRI - 2 * H, note: "Left in porch", track: null, ref: "JX1", order: "", thread: "th-rm-1", returnBy: null },
  { id: "zara-9001", shop: "Zara", carrier: "", stage: 3, window: null, due: null, deliveredAt: Date.UTC(2026, 9, 12, 10), note: "", track: null, ref: "", order: "9001", thread: "th-zara-1", returnBy: at(9, 23, 59) },
];
const BILLS = () => [
  { id: "oct-2611", kind: "bill", sender: "Octopus Energy", cat: "Home", amount: 8420, due: at(12, 9), auto: false, usual: 7130, was: null, last: [6800, 7200, 7400, 6900, 7130, 8420], thread: "th-oct-1" },
  { id: "ee-2611", kind: "bill", sender: "EE", cat: "Phone and internet", amount: 2400, due: at(12, 6), auto: true, usual: 2400, was: null, last: [2400, 2400], thread: "th-ee-1" },
  { id: "adm-2611", kind: "renewal", sender: "Admiral", cat: "Car", amount: 41260, due: at(16, 0), auto: true, usual: null, was: 38900, last: [38900, 41260], thread: "th-adm-1" },
  { id: "str-1", kind: "trial", sender: "Strava", cat: "Subscriptions", amount: 899, due: at(8, 9), auto: true, usual: null, was: null, last: [], thread: "th-str-1" },
  { id: "spt-2611", kind: "sub", sender: "Spotify", cat: "Subscriptions", amount: 1199, due: at(18, 6), auto: true, usual: 1099, was: 1099, last: [1099, 1099, 1199], thread: "th-spt-1" },
];
const MONEY = () => ({ month: 18640, n: 11, months: [17141, 17700, 17500, 18200, 18300, 18640], cats: [{ name: "Home", pence: 11240 }, { name: "Phone and internet", pence: 4600 }, { name: "Subscriptions", pence: 2800 }], paidSelf: { n: 3, pence: 3600 } });
const CLUB = (d, more = {}) => ({ id: `club~202611${d}`, kind: "event", title: "Book club", sub: "The Old Firehouse", start: at(d, 19), end: at(d, 21), tz: "Europe/London", place: { name: "The Old Firehouse" }, ref: null, trip: null,
  thread: "th-club-1", status: "confirmed", repeat: "every other Thursday",
  next: [{ start: at(12, 19) }, { start: at(26, 19), cancelled: true }, { start: DEC(10, 19, 30), was: DEC(10, 19) }, { start: DEC(24, 19) }, { start: Date.UTC(2027, 0, 7, 19) }], ...more });
function stage2(t = FRI) {
  const b = booked(t);
  b.ahead = [...b.ahead.filter((x) => x.id !== "gyg-GYG8K2"), CLUB(12)];
  b.trips[0].items = b.trips[0].items.filter((i) => i !== "gyg-GYG8K2");
  b.trips[0].hidden = [{ id: "gyg-GYG8K2", title: "Sintra day trip", sub: "Meet 09:00, Rossio station", start: at(8, 9) }];
  return { ...b, parcels: PARCELS(), bills: BILLS(), money: MONEY() };
}

test("stage 2, cardOf: parcels, bills and money kept as the contract has them, each with Mail's own address for its email", () => {
  const c = cardOf(stage2(), OWN, FRI);
  assert.deepEqual(c.parcels.map((p) => p.id), ["rm-JX1", "evri-H01AA2B3C4D5", "amz-204-1189", "zara-9001"], "soonest first: by window, due, last day, or when delivered");
  assert.deepEqual(c.parcels[1], { id: "evri-H01AA2B3C4D5", shop: "Wiggle", carrier: "Evri", stage: 2, window: { from: at(6, 11), to: at(6, 13) }, due: at(6, 0), deliveredAt: null, note: "",
    track: "https://www.evri.com/track/parcel/H01AA2B3C4D5/details", ref: "H01AA2B3C4D5", order: "8817205", thread: "th-evri-1", href: `${OWN}/#thread=th-evri-1`, returnBy: DEC(4, 23, 59) });
  assert.equal(c.parcels[0].note, "Left in porch", "delivered two hours ago: still there (18 hours)");
  assert.deepEqual(c.bills.map((b) => b.id), ["str-1", "ee-2611", "oct-2611", "adm-2611", "spt-2611"], "soonest due first");
  assert.deepEqual(c.bills.find((b) => b.id === "oct-2611"), { id: "oct-2611", kind: "bill", sender: "Octopus Energy", cat: "Home", amount: 8420, due: at(12, 9), auto: false, usual: 7130, was: null,
    last: [6800, 7200, 7400, 6900, 7130, 8420], thread: "th-oct-1", href: `${OWN}/#thread=th-oct-1` });
  assert.deepEqual(c.money, MONEY());
  assert.deepEqual(c.trips[0].hidden, [{ id: "gyg-GYG8K2", title: "Sintra day trip", sub: "Meet 09:00, Rossio station", start: at(8, 9) }]);
  const club = c.ahead.find((b) => b.id === "club~20261112");
  assert.ok(club, "a repeating invite's date: its id <series>~<yyyymmdd>");
  assert.equal(club.repeat, "every other Thursday");
  assert.deepEqual(club.next, [{ start: at(12, 19) }, { start: at(26, 19), cancelled: true }, { start: DEC(10, 19, 30), was: DEC(10, 19) }, { start: DEC(24, 19) }, { start: Date.UTC(2027, 0, 7, 19) }]);
  assert.ok(!("was" in club));
  assert.equal(tripFor(c, FRI).hidden[0].id, "gyg-GYG8K2", "the trip shown carries its hidden");
  // (each switch alone: only its own lists)
  const plain = { people: 1, updates: 0, later: { n: 0, next: null } };
  const off = cardOf(plain, OWN, FRI);
  for (const k of ["parcels", "bills", "money"]) assert.ok(!(k in off), `${k}: absent with the switch off`);
  const parcelsOnly = cardOf({ ...plain, parcels: [] }, OWN, FRI);
  assert.deepEqual(parcelsOnly.parcels, []);
  assert.ok(!("bills" in parcelsOnly) && !("money" in parcelsOnly) && !("ahead" in parcelsOnly));
  const billsOnly = cardOf({ ...plain, bills: BILLS(), money: MONEY() }, OWN, FRI);
  assert.ok(!("parcels" in billsOnly) && billsOnly.bills.length === 5 && billsOnly.money.month === 18640);
  assert.ok(!("hidden" in cardOf(booked(), OWN, FRI).trips[0]), "a Mail from before stage 3: no hidden");
});

test("stage 2, cardOf: every malformed parcel, bill or date dropped on its own, never the card; strings plain and bounded", () => {
  const good = PARCELS()[0];
  const badP = [{ ...good, id: "a b" }, { ...good, id: "" }, { ...good, stage: 4 }, { ...good, stage: "2" }, { ...good, stage: 1.5 }, { ...good, shop: "", carrier: "" },
    { ...good, stage: 3, deliveredAt: FRI - 30 * H, returnBy: null }, { ...good, stage: 3, deliveredAt: null, returnBy: FRI + 5 * DAY }, null, "parcel", [good]].map((p, i) => (p && typeof p === "object" && !Array.isArray(p) && p.id === good.id ? { ...p, id: `bad-${i}` } : p));
  badP[0] = { ...good, id: "a b" };
  const oddP = [
    { ...good, id: "odd-1", track: "http://evri.com/track/1", window: { from: at(6, 13), to: at(6, 11) }, shop: `Wig<b>gle</b>‮${"x".repeat(60)}`, note: "n".repeat(100), ref: "R".repeat(50), order: 7, thread: "../x" },
    { ...good, id: "odd-2", track: "javascript:alert(1)", window: { from: "11:00", to: at(6, 13) }, due: "today" },
    { ...good, id: "odd-3", track: "https://user:pw@evri.com/t", carrier: "", returnBy: 1e9 },
    { ...good, id: "odd-4", track: "https://evri.com/t?x=1 2" },
  ];
  const goodB = BILLS()[0];
  const badB = [{ ...goodB, id: "x y" }, { ...goodB, kind: "invoice" }, { ...goodB, amount: 84.2 }, { ...goodB, amount: "8420" }, { ...goodB, amount: -1 }, { ...goodB, amount: 2e8 }, { ...goodB, sender: "  " },
    { ...goodB, due: FRI + 20 * DAY }, { ...goodB, due: FRI - 3 * DAY }, null, 3].map((b, i) => (b && typeof b === "object" && b.id === goodB.id ? { ...b, id: `badb-${i}` } : b));
  badB[0] = { ...goodB, id: "x y" };
  const oddB = [
    { ...goodB, id: "oddb-1", cat: "Pets", auto: "yes", usual: 71.5, was: "38900", last: [1, "2", 3.5, -4, 5, 6, 7, 8, 9], sender: "O".repeat(80), thread: null },
    { ...goodB, id: "oddb-2", due: null, last: "lots" },
  ];
  const c = cardOf({ people: 0, updates: 0, later: { n: 0, next: null }, parcels: [good, ...badP, ...oddP, { ...good }], bills: [goodB, ...badB, ...oddB], money: { ...MONEY(), months: [1, 2, 3, 4, 5], cats: [{ name: "Pets", pence: 1 }, { name: "Home", pence: "1" }, { name: "Car", pence: 500 }, { name: "Car", pence: 9 }], paidSelf: { n: -1, pence: 3 }, n: "11" } }, OWN, FRI);
  assert.ok(c, "the card stands");
  assert.deepEqual(c.parcels.map((p) => p.id).sort(), ["evri-H01AA2B3C4D5", "odd-1", "odd-2", "odd-3", "odd-4"].sort(), "only the well-formed, each id once");
  const o1 = c.parcels.find((p) => p.id === "odd-1");
  assert.equal(o1.track, null, "a tracking page that isn't https: none");
  assert.equal(o1.window, null, "a window that ends before it starts: none");
  assert.ok(!/[<>]b|‮/.test(o1.shop.replace(/<b>|<\/b>/g, "")) && [...o1.shop].length <= 40 && !/‮/.test(o1.shop), o1.shop);
  assert.equal([...o1.note].length, 60);
  assert.equal(o1.ref.length, 32);
  assert.equal(o1.order, "");
  assert.equal(o1.thread, null); assert.equal(o1.href, `${OWN}/`);
  const o2 = c.parcels.find((p) => p.id === "odd-2");
  assert.equal(o2.track, null, "javascript: never");
  assert.equal(o2.window, null); assert.equal(o2.due, null, "a due that isn't a time: none");
  assert.equal(c.parcels.find((p) => p.id === "odd-3").track, null, "a name and password in it: none");
  assert.equal(c.parcels.find((p) => p.id === "odd-3").returnBy, null);
  assert.equal(c.parcels.find((p) => p.id === "odd-4").track, null, "a space in it: none");
  assert.deepEqual(c.bills.map((b) => b.id).sort(), ["oct-2611", "oddb-1", "oddb-2"].sort());
  const b1 = c.bills.find((b) => b.id === "oddb-1");
  assert.equal(b1.cat, "Other", "a kind of bill that isn't one: Other");
  assert.equal(b1.auto, false, "only true is automatic");
  assert.equal(b1.usual, null); assert.equal(b1.was, null);
  assert.deepEqual(b1.last, [1, 5, 6, 7, 8, 9], "whole pence only, the last six");
  assert.equal([...b1.sender].length, 40);
  assert.deepEqual(c.bills.find((b) => b.id === "oddb-2").last, []);
  assert.deepEqual(c.money, { month: 18640, n: 0, months: [], cats: [{ name: "Car", pence: 500 }], paidSelf: { n: 0, pence: 0 } }, "money's malformed parts left empty, never the rest");
  assert.ok(!("money" in cardOf({ people: 0, updates: 0, later: { n: 0, next: null }, bills: [], money: { month: "186.40" } }, OWN, FRI)), "a month that isn't an amount: no money");
  // (at most 10 parcels and 20 bills)
  const many = cardOf({ people: 0, updates: 0, later: { n: 0, next: null }, parcels: Array.from({ length: 30 }, (_, i) => ({ ...good, id: `p-${i}` })), bills: Array.from({ length: 30 }, (_, i) => ({ ...goodB, id: `b-${i}` })) }, OWN, FRI);
  assert.equal(many.parcels.length, PARCELS_MAX); assert.equal(many.bills.length, BILLS_MAX);
});

test("stage 3, cardOf: a trip's hidden and a repeating invite's dates checked; ids with ~ kept, bad ones dropped", () => {
  const b = booked();
  const hid = (i, more = {}) => ({ id: `h-${i}`, title: `Hidden ${i}`, sub: "s", start: at(8, 9) + i * H, ...more });
  b.trips[0].hidden = [hid(0), { ...hid(1), id: "K7QX2M-1" }, hid(2, { title: "" }), hid(3, { start: "soon" }), hid(4, { id: "a b" }), null, ...Array.from({ length: 14 }, (_, i) => hid(10 + i)), hid(0)];
  b.ahead.push(CLUB(12, { repeat: `every ${"other ".repeat(20)}Thursday`, next: [{ start: at(12, 19) }, { start: "x" }, null, { start: at(12, 19) }, { start: at(26, 19), cancelled: "yes", was: at(26, 19) }, ...Array.from({ length: 9 }, (_, i) => ({ start: DEC(1 + i, 19) }))] }),
    CLUB(13, { id: "club~2026 1113" }), { ...CLUB(13), id: "club~20261126", repeat: 7, next: [{ start: at(26, 19) }], was: at(26, 18) });
  const c = cardOf(b, OWN, FRI);
  const h = c.trips[0].hidden;
  assert.equal(h.length, 10, "at most 10");
  assert.deepEqual(h.slice(0, 2).map((x) => x.id), ["h-0", "h-10"], "each once, none also shown, none malformed");
  const club = c.ahead.find((x) => x.id === "club~20261112");
  assert.equal([...club.repeat].length, 40);
  assert.deepEqual(club.next.slice(0, 2), [{ start: at(12, 19) }, { start: at(26, 19) }], "a bad date dropped, each once, cancelled only when true");
  assert.equal(club.next.length, 5);
  assert.ok(!c.ahead.some((x) => x.id === "club~2026 1113"));
  const moved = c.ahead.find((x) => x.id === "club~20261126");
  assert.ok(!("repeat" in moved) && !("next" in moved), "repeat not words: none, and no next");
  assert.equal(moved.was, at(26, 18), "a moved one's first time");
});

test("stage 2, Coming Up: a parcel out for delivery today, its window on the right and its stage; until its window's end", () => {
  const mail = cardOf(stage2(), OWN, FRI);
  const rows = upcomingFor({ mail }, { tz: "Europe/London", tripId: "trip-lisbon-1107" }, FRI);
  const p = rows.find((r) => r.id === "mail-evri-H01AA2B3C4D5");
  assert.deepEqual(p, { at: at(6, 11), app: "mail", title: "Parcel from Wiggle", sub: "Out for delivery · Evri", href: `${OWN}/#thread=th-evri-1`, id: "mail-evri-H01AA2B3C4D5",
    parcel: "evri-H01AA2B3C4D5", stage: 2, until: at(6, 13), amt: "11–13", when: "today", carrier: "Evri", track: "https://www.evri.com/track/parcel/H01AA2B3C4D5/details", ref: "H01AA2B3C4D5" });
  assert.deepEqual(rows.map((r) => r.id), ["mail-evri-H01AA2B3C4D5", "mail-rock-0611"], "in time order; Amazon's (Monday), the delivered one and Zara's return aren't Coming Up");
  assert.ok(upcomingFor({ mail }, { tz: "Europe/London" }, at(6, 12)).some((r) => r.id === "mail-evri-H01AA2B3C4D5"), "inside its window: still there");
  assert.ok(!upcomingFor({ mail }, { tz: "Europe/London" }, at(6, 13, 30)).some((r) => r.id === "mail-evri-H01AA2B3C4D5"), "its window over: gone");
  // (out for delivery with no window: "Today", until the day's end; due today, shipped: the same)
  const nowin = cardOf({ ...stage2(), parcels: [{ ...PARCELS()[0], window: null }, { ...PARCELS()[1], due: at(6, 12), window: { from: at(6, 14, 30), to: at(6, 15, 30) } }] }, OWN, FRI);
  const r2 = upcomingFor({ mail: nowin }, { tz: "Europe/London" }, FRI).filter((r) => r.parcel);
  assert.deepEqual(r2.map((r) => [r.parcel, r.amt, r.when, r.sub]), [["evri-H01AA2B3C4D5", "Today", "", "Out for delivery · Evri"], ["amz-204-1189", "14:30–15:30", "today", "Shipped · Royal Mail"]]);
  assert.equal(r2[0].until, Date.UTC(2026, 10, 7, 0));
});

test("stage 3, Coming Up: a repeating invite's date says how it repeats, with the series' next dates for its sheet", () => {
  const t = at(12, 8), mail = cardOf(stage2(), OWN, t);
  const r = upcomingFor({ mail }, { tz: "Europe/London" }, t).find((x) => x.booking === "club~20261112");
  assert.equal(r.sub, "The Old Firehouse · every other Thursday");
  assert.equal(r.repeat, "every other Thursday");
  assert.deepEqual(r.next[1], { start: at(26, 19), cancelled: true });
  assert.deepEqual(r.next[2], { start: DEC(10, 19, 30), was: DEC(10, 19) });
});

test("stage 2, Waiting for You: a bill to pay, a renewal, a trial ending and a return's last day, the number on the right; what paid itself in a line", () => {
  const mail = cardOf(stage2(), OWN, FRI);
  const { rows, paid } = mailWaiting({ mail }, { tz: "Europe/London" }, FRI);
  assert.deepEqual(rows.map((r) => r.item), ["str-1", "zara-9001", "oct-2611", "adm-2611"], "soonest first; EE's direct debit and Spotify's receipt pay themselves");
  const by = Object.fromEntries(rows.map((r) => [r.item, r]));
  assert.deepEqual(by["oct-2611"], { id: "mail-oct-2611", item: "oct-2611", kind: "bill", title: "Octopus Energy", sub: "To pay · +18% on your usual £71", chg: "+18%", amt: "£84.20", when: "Thu 12", at: at(12, 9), href: `${OWN}/#thread=th-oct-1`, auto: false });
  assert.deepEqual([by["adm-2611"].title, by["adm-2611"].sub, by["adm-2611"].chg, by["adm-2611"].amt, by["adm-2611"].when], ["Car insurance renews", "Admiral · +£23.60 on last year", "+£23.60", "£412.60", "16 Nov"]);
  assert.deepEqual([by["str-1"].title, by["str-1"].sub, by["str-1"].amt, by["str-1"].when], ["Strava trial ends", "Then £8.99", "£8.99", "Sun 8"]);
  assert.deepEqual([by["zara-9001"].title, by["zara-9001"].kind, by["zara-9001"].amt, by["zara-9001"].when, by["zara-9001"].sub], ["Return to Zara", "return", "Mon 9", "last day", "Order 9001"]);
  assert.deepEqual(paid, { n: 3, pence: 3600, said: "3 paid by themselves · £36.00" });
  // (the windows: a bill 7 days, a renewal 10, a trial 2, a return 3)
  const late = mailWaiting({ mail: cardOf(stage2(), OWN, at(3, 9)) }, { tz: "Europe/London" }, at(3, 9));
  assert.deepEqual(late.rows.map((r) => r.item), [], "Tuesday 3rd: nothing close enough yet");
  const same = cardOf({ ...stage2(), bills: [{ ...BILLS()[0], amount: 7200 }] }, OWN, FRI);
  assert.equal(mailWaiting({ mail: same }, { tz: "Europe/London" }, FRI).rows.find((r) => r.item === "oct-2611").sub, "To pay · Same as usual", "within 5% of its usual: no change said");
  assert.deepEqual(mailWaiting({ mail: cardOf({ ...stage2(), money: { ...MONEY(), paidSelf: { n: 0, pence: 0 } } }, OWN, FRI) }, { tz: "Europe/London" }, FRI).paid, null, "none paid themselves: no line");
  assert.deepEqual(mailWaiting({ mail: cardOf(booked(), OWN, FRI) }, { tz: "Europe/London" }, FRI), { rows: [], paid: null }, "the switches off");
});

test("stage 2, the Bills sheet: the month, its change since June, six months, the split, Needs You and Paid by Themselves", () => {
  const m = moneyFor({ mail: cardOf(stage2(), OWN, FRI) }, { tz: "Europe/London" }, FRI);
  assert.equal(m.month, "£186.40");
  assert.equal(m.n, "11 bills and subscriptions");
  assert.equal(m.tag, "+£14.99 on June");
  assert.deepEqual(m.bars.map((b) => b.label), ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
  assert.equal(m.bars[5].pct, 100); assert.equal(m.bars[5].said, "£186"); assert.ok(!("said" in m.bars[0]) && m.bars[0].pct === 92);
  assert.deepEqual(m.cats.map((c) => c.said), ["Home £112", "Phone and internet £46", "Subscriptions £28"]);
  assert.deepEqual(m.needs.map((r) => r.item), ["str-1", "oct-2611", "adm-2611"]);
  assert.deepEqual(m.paid.map((r) => [r.item, r.sub]), [["ee-2611", "Same as usual"], ["spt-2611", "+9% on your usual £11"]]);
  assert.equal(moneyFor({ mail: cardOf(booked(), OWN, FRI) }, { tz: "Europe/London" }, FRI), null, "bills off: no sheet");
  // (months from before Mail knew the bills: empty bars, and the change counted from the first month it knew)
  const early = moneyFor({ mail: cardOf({ ...stage2(), money: { ...MONEY(), months: [null, null, null, null, 18000, 18640] } }, OWN, FRI) }, { tz: "Europe/London" }, FRI);
  assert.deepEqual(early.bars.map((b) => b.pct), [0, 0, 0, 0, 97, 100]);
  assert.equal(early.tag, "+£6.40 on October");
  const fresh = moneyFor({ mail: cardOf({ ...stage2(), money: { ...MONEY(), months: [null, null, null, null, null, 18640] } }, OWN, FRI) }, { tz: "Europe/London" }, FRI);
  assert.equal(fresh.tag, null, "only this month known: no change to say");
  assert.deepEqual(cardOf({ ...stage2(), money: { ...MONEY(), months: [1, 2, 3, 4, 5, null] } }, OWN, FRI).money.months, [], "this month unknown: the months left out");
});

test("stages 2 and 3, the day: Waiting for You's rows from Mail, the paid line, the Bills sheet, the parcel's row and the trip's hidden", async () => {
  mailSays = () => Response.json(stage2());
  omTz = "Europe/Lisbon"; omDown = false;
  const d = await dayFor(env, GF, FRI, {}, { tz: "Europe/London" });
  assert.deepEqual(d.owed.map((r) => r.item), ["str-1", "zara-9001", "oct-2611", "adm-2611"]);
  assert.equal(d.paidSelf.said, "3 paid by themselves · £36.00");
  assert.equal(d.money.month, "£186.40");
  assert.ok(d.upcoming.some((r) => r.parcel === "evri-H01AA2B3C4D5" && r.amt === "11–13"));
  assert.deepEqual(d.trip.hidden, [{ id: "gyg-GYG8K2", title: "Sintra day trip", sub: "Meet 09:00, Rossio station", start: at(8, 9) }]);
  assert.deepEqual(d.trip.items.map((b) => b.id), ["K7QX2M-1", "bk-5521876", "K7QX2M-2"]);
  // (anyone else: none of it)
  const o = await dayFor(env, BO, FRI, {}, { tz: "Europe/London" });
  assert.ok(!("owed" in o) && !("paidSelf" in o) && !("money" in o));
  // (Mail's switches off: none of it either)
  mailSays = () => Response.json(booked());
  const off = await dayFor(env, GF, FRI, {}, { tz: "Europe/London" });
  assert.ok(!("owed" in off) && !("paidSelf" in off) && !("money" in off) && !("hidden" in off.trip));
});

test("stage 3, Put back: the account's route asks Mail's POST /api/connector/unhide with the key, for Mail's owner alone; Mail's 404 as done", async () => {
  asked = [];
  let r = await call("POST", "today/mail/unhide", { cookie: gf, body: { id: "gyg-GYG8K2" } });
  assert.deepEqual([r.s, r.j], [200, { ok: true }]);
  assert.deepEqual(asked, [{ path: "/api/connector/unhide", method: "POST", auth: `Bearer ${KEY}`, body: { id: "gyg-GYG8K2" } }]);
  asked = [];
  assert.equal((await call("POST", "today/mail/unhide", { cookie: bo, body: { id: "gyg-GYG8K2" } })).s, 403, "not Mail's owner");
  for (const id of [undefined, "", "a b", "x".repeat(65), 7]) assert.equal((await call("POST", "today/mail/unhide", { cookie: gf, body: { id } })).s, 400, JSON.stringify(id));
  assert.equal((await call("POST", "today/mail/unhide", { body: { id: "gyg-GYG8K2" } })).s, 401, "signed out");
  assert.equal((await call("POST", "today/mail/unhide", { cookie: gf, origin: "https://evil.test", body: { id: "gyg-GYG8K2" } })).s, 403, "not from Today");
  assert.deepEqual(asked, [], "Mail never asked for any of those");
  unhideSays = () => new Response(JSON.stringify({ error: "Not found." }), { status: 404 });
  assert.equal((await call("POST", "today/mail/unhide", { cookie: gf, body: { id: "gyg-GYG8K2" } })).s, 200, "one Mail no longer has (404): as good as done");
  unhideSays = () => new Response("nope", { status: 500 });
  assert.equal((await call("POST", "today/mail/unhide", { cookie: gf, body: { id: "gyg-GYG8K2" } })).s, 502);
  unhideSays = () => { throw new TypeError("connection refused"); };
  assert.equal((await call("POST", "today/mail/unhide", { cookie: gf, body: { id: "gyg-GYG8K2" } })).s, 502);
  unhideSays = () => new Response(null, { status: 204 });
  await assert.rejects(mailUnhide({ ...env, MAIL_KEY: "" }, GF, "gyg-GYG8K2"), (e) => e.status === 503);
  // (a repeating invite's date, hidden: its id with ~, which hides its series in Mail)
  asked = [];
  assert.equal((await call("POST", "today/mail/hide", { cookie: gf, body: { id: "club~20261112" } })).s, 200);
  assert.deepEqual(asked.map((a) => [a.path, a.body.id]), [["/api/connector/hide", "club~20261112"]]);
  // (a parcel's and a bill's Hide, the same route)
  asked = [];
  for (const id of ["evri-H01AA2B3C4D5", "oct-2611"]) assert.equal((await call("POST", "today/mail/hide", { cookie: gf, body: { id } })).s, 200);
  assert.deepEqual(asked.map((a) => a.body.id), ["evri-H01AA2B3C4D5", "oct-2611"]);
});

test("stage 2, the morning's line: the parcel coming today and a bill to pay today or tomorrow, within the one line", () => {
  const t = at(6, 7), mail = cardOf(stage2(), OWN, t);
  assert.equal(mailLine(mail, "Europe/London", t), "Rockfish at 19:30 · Parcel 11:00–13:00 · Flight tomorrow 07:40");
  const due = cardOf({ ...stage2(), bills: [{ ...BILLS()[0], due: at(7, 9) }, { ...BILLS()[1], due: at(6, 9) }] }, OWN, t);
  assert.equal(mailLine(due, "Europe/London", t), "Rockfish at 19:30 · Parcel 11:00–13:00 · Octopus £84.20 due tomorrow · Flight tomorrow 07:40", "EE's direct debit pays itself: not said");
  const today = cardOf({ ...stage2(), ahead: [], trips: [], parcels: [{ ...PARCELS()[0], window: null }], bills: [{ ...BILLS()[0], due: at(6, 17) }] }, OWN, t);
  assert.equal(mailLine(today, "Europe/London", t), "Parcel today · Octopus £84.20 due today");
  // (bookings today, a parcel and a bill: four parts at most, today's bookings making room)
  const t7 = at(7, 6), club = { ...CLUB(8), id: "club~20261108", start: at(8, 19), end: at(8, 21) };
  const busy = cardOf({ ...stage2(), ahead: [...stage2().ahead, { ...booked().ahead[0], id: "lunch-1", title: "Table at Ze da Mouraria", start: at(7, 13), place: null }, club],
    parcels: [{ ...PARCELS()[0], window: { from: at(7, 11), to: at(7, 13) } }], bills: [{ ...BILLS()[0], due: at(7, 18) }] }, OWN, t7);
  assert.equal(mailLine(busy, "Europe/London", t7), "Flight 07:40 · Parcel 11:00–13:00 · Octopus £84.20 due today · Book club tomorrow at 19:00");
  const m = morningLines({ weather: { state: "ok", lead: "Dry." }, mail: today }, { names: false, tz: "Europe/London", t, lines: {} });
  assert.deepEqual(m.lines.slice(0, 2), ["Dry.", "Parcel today · Octopus £84.20 due today"]);
});
