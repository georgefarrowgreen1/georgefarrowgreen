// Fitness's rides coming in (fitness/formats.js, functions/_fitness.js, _garmin.js, _strava.js), run against a database
// of their own (Node's own SQLite in memory, standing in for D1): a night's stop in a ride of a few days is kept, and a
// file that jumps on years is cut there and says so; a day's ride at a point a second can be drawn; the same ride from
// Garmin and from Strava is kept once; a Garmin file that won’t come doesn’t hold up the rest for good (nor is lost to
// an hour or two of Garmin being down); and asks made now take no more than their share of Strava's allowance, which
// is the whole app's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readAny, routeShape } from "../../../fitness/formats.js";
import { tcxOf } from "../../../functions/_strava.js";
import { addActivity, fileKey } from "../../../functions/_fitness.js";
import { connect, fetchNew, garminOf } from "../../../functions/_garmin.js";
import { stravaShare } from "../../../functions/_strava.js";

// D1, as much of it as the server uses: prepare, bind, first, all, run, and batch (all or nothing)
function d1() {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
// (one database for them all, as the server's set up once for each copy of it: _pigeon.js db, _fitness.js fitdb)
const DB = d1();
// R2, as much of it as these use
function r2() {
  const m = new Map();
  return { m, put: async (k, v) => { m.set(k, v); }, get: async (k) => (m.has(k) ? { body: m.get(k) } : null), delete: async (k) => { for (const x of [].concat(k)) m.delete(x); }, list: async () => ({ objects: [], truncated: false }) };
}

// ---- a file read ----
const start = "2026-10-20T07:30:00Z";
const ride = (times) => tcxOf({ id: 1, sport_type: "Ride", start_date: start }, { time: { data: times }, watts: { data: times.map(() => 200) }, heartrate: { data: times.map(() => 140) } });
const secs = (from, n) => Array.from({ length: n }, (_, i) => from + i);

test("a night's stop in a ride of a few days, recorded as one: all of it kept, nothing said to be cut", async () => {
  const { activities: [a] } = await readAny("trip.tcx", new TextEncoder().encode(ride([...secs(0, 300), ...secs(11 * 3600, 300)])));
  assert.equal(a.s.t.length, 600);
  assert.equal(a.s.t.at(-1), 11 * 3600 + 299);
  assert.equal(a.cut, undefined);
});
test("a file that jumps on years partway (a device's clock gone wrong): cut there, and how much said", async () => {
  const { activities: [a] } = await readAny("odd.tcx", new TextEncoder().encode(ride([...secs(0, 300), ...secs(3 * 365 * 86400, 20)])));
  assert.equal(a.s.t.length, 300);
  assert.equal(a.cut, 20);
});
test("a day's ride at a point a second (more points than a call can be handed): its route's shape still drawn", () => {
  const n = 90000, s = { lat: Array.from({ length: n }, (_, i) => 51 + i * 1e-5), lon: Array.from({ length: n }, (_, i) => -2 + Math.sin(i / 5000) * 0.1) };
  const r = routeShape(s);
  assert.equal(r.length, 96);
  assert.ok(r.every((v) => v >= 0 && v <= 100));
});

// ---- kept once ----
const FIT = (() => { const u8 = new Uint8Array(64); u8[0] = 14; u8.set([46, 70, 73, 84], 8); return u8; })();
const meta = (id, start) => ({ id, start, sport: "ride", indoor: false, name: "Morning ride", device: null, file: "a.fit", type: "fit", sum: {} });

test("the same ride from Garmin and from Strava (started within a minute): kept once, the second's file not left behind", async () => {
  const env = { DB, BIO_R2: r2() }, t = Date.UTC(2026, 9, 20, 7, 30);
  assert.deepEqual(await addActivity(env, "u1", meta("g11", t), FIT), { kept: true });
  assert.deepEqual(await addActivity(env, "u1", meta("s22", t + 20e3), FIT), { kept: false, already: true });
  assert.ok(!env.BIO_R2.m.has(fileKey("u1", "s22")));
  // (and one that's another ride, later the same morning: kept; as is the same moment in another account)
  assert.deepEqual(await addActivity(env, "u1", meta("s33", t + 5 * 60e3), FIT), { kept: true });
  assert.deepEqual(await addActivity(env, "u2", meta("s22", t + 20e3), FIT), { kept: true });
});

// ---- Garmin: one file that won't come ----
test("a Garmin file that fails every time: tried three times over a day, then passed over, and the ones after it come in", async () => {
  const env = { DB, BIO_R2: r2(), GARMIN_API: "https://garmin.test" }, now = Date.now();
  const jwt = ["e30", Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + 86400, sub: "who-1" })).toString("base64url"), "sig"].join(".");
  const acts = [101, 102, 103].map((id, i) => ({ activityId: id, startTimeGMT: new Date(now - (3 - i) * 86400e3).toISOString().slice(0, 19).replace("T", " "), activityName: `Ride ${id}` }));
  const was = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/token")) return new Response(jwt);
    if (u.pathname.includes("/activities/search/")) return Response.json(acts);
    const f = /\/files\/activity\/(\d+)$/.exec(u.pathname);
    if (f) return f[1] === "101" ? new Response("no", { status: 500 }) : new Response(new Uint8Array([80, 75, 3, 4, 1, 2, 3]));
    return new Response("", { status: 404 });
  };
  try {
    let g = await connect(env, "u1", "k".repeat(40));
    assert.equal(g.said, "unreachable", "Garmin's error said");
    assert.equal(g.waiting.length, 0, "the first fails, and nothing's asked for past it this time");
    for (let i = 0; i < 3; i++) g = await fetchNew(env, "u1", { force: true });
    assert.equal(g.waiting.length, 0, "an hour or two of Garmin failing: nothing passed over, so nothing's lost to it");
    // (a day on, still failing: passed over, and the rest come in)
    const row = await DB.prepare("SELECT missed FROM fx_garmin WHERE user_id = 'u1'").first();
    assert.deepEqual(Object.keys(JSON.parse(row.missed)), ["101"]);
    await DB.prepare("UPDATE fx_garmin SET missed = ? WHERE user_id = 'u1'").bind(JSON.stringify({ 101: [4, now - 2 * 86400e3] })).run();
    g = await fetchNew(env, "u1", { force: true });
    assert.deepEqual(g.waiting.map((w) => w.id), ["102", "103"]);
    assert.equal(g.said, null);
    // (and not asked for again)
    g = await fetchNew(env, "u1", { force: true });
    assert.deepEqual((await garminOf(env, "u1")).waiting.map((w) => w.id), ["102", "103"]);
    assert.equal((await DB.prepare("SELECT missed FROM fx_garmin WHERE user_id = 'u1'").first()).missed, null);
  } finally { globalThis.fetch = was; }
});

// ---- Strava's allowance, the whole app's ----
test("asks made now take no more than their share of Strava's allowance, for everyone together", async () => {
  const env = { DB };
  for (let i = 0; i < 6; i++) assert.equal(await stravaShare(env), true, `ask ${i + 1}`);
  assert.equal(await stravaShare(env), false, "the seventh this quarter hour waits for the scheduler");
});
