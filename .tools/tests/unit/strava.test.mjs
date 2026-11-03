// Strava (functions/_strava.js): an activity's streams written as TCX, read back by Fitness as any file is
import { test } from "node:test";
import assert from "node:assert/strict";
import { tcxOf, sportOf } from "../../../functions/_strava.js";
import { readAny } from "../../../fitness/formats.js";

const n = 600, start = "2026-10-20T07:30:00Z";
const streams = { time: { data: Array.from({ length: n }, (_, i) => i) }, latlng: { data: Array.from({ length: n }, (_, i) => [51.45 + i * 1e-4, -2.6 + i * 1e-4]) },
  altitude: { data: Array.from({ length: n }, (_, i) => 20 + (i % 50)) }, distance: { data: Array.from({ length: n }, (_, i) => i * 8) },
  heartrate: { data: Array.from({ length: n }, (_, i) => 120 + (i % 20)) }, cadence: { data: Array.from({ length: n }, () => 88) },
  watts: { data: Array.from({ length: n }, (_, i) => 180 + (i % 40)) }, velocity_smooth: { data: Array.from({ length: n }, () => 8) } };

test("a ride's streams, as TCX: read back with its power, heart rate, route and start", async () => {
  const xml = tcxOf({ id: 1, name: "Morning <ride>", sport_type: "GravelRide", start_date: start, device_name: "Wahoo & co" }, streams);
  assert.match(xml, /<Name>Wahoo &amp; co<\/Name>/);
  const { activities: [a] } = await readAny("strava-1.tcx", new TextEncoder().encode(xml));
  assert.equal(a.sport, "ride");
  assert.equal(a.start, Date.parse(start));
  assert.equal(a.s.t.length, n);
  assert.equal(a.s.pwr[10], 190);
  assert.equal(a.s.hr[5], 125);
  assert.ok(Math.abs(a.s.lat[100] - 51.46) < 1e-6);
});
test("indoors, with no route: still read, its power and heart rate", async () => {
  const { latlng, ...indoor } = streams;
  const { activities: [a] } = await readAny("s.tcx", new TextEncoder().encode(tcxOf({ id: 2, sport_type: "VirtualRide", start_date: start }, indoor)));
  assert.equal(a.sport, "ride");
  assert.equal(a.s.pwr[0], 180);
  assert.ok(!a.s.lat?.some((x) => x != null));
});
test("Strava's sports, as Fitness's", () => {
  for (const [t, s] of [["Ride", "ride"], ["VirtualRide", "ride"], ["MountainBikeRide", "ride"], ["EBikeRide", "ride"], ["Run", "run"], ["TrailRun", "run"], ["Swim", "swim"], ["Walk", "walk"], ["Hike", "walk"], ["WeightTraining", "strength"], ["Rowing", "other"]])
    assert.equal(sportOf({ sport_type: t }), s, t);
  assert.equal(sportOf({ type: "Ride" }), "ride");
});

// Today First (spec §5.2, §9.3): each activity waiting from Strava keeps its moving time and distance, as Strava's activity
// said them (functions/_strava.js fetchStrava, as Strava's hook marks it due), so Today can show a ride before Fitness has
// read it; null where Strava said nothing that could be one; and read back as Today reads them (donesIn)
import { DatabaseSync } from "node:sqlite";
import { figuresOf, fetchStrava, stravaOf } from "../../../functions/_strava.js";
import { donesIn } from "../../../functions/_fitshare.js";

test("Strava's moving time and distance, only where they're numbers that could be them", () => {
  assert.deepEqual(figuresOf({ moving_time: 4500, distance: 30412.37, elapsed_time: 5000 }), { secs: 4500, dist: 30412.4 }, "moving, not elapsed");
  assert.deepEqual(figuresOf({}), { secs: null, dist: null });
  for (const bad of [NaN, Infinity, -1, "60", null, 1e12]) assert.deepEqual(figuresOf({ moving_time: bad, distance: bad }), { secs: null, dist: null }, String(bad));
});

test("what's new from Strava: each waiting row with its moving time and distance; read back as Today reads them", async () => {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({ sql, bind: (...a) => st(sql, a), first: async () => s.prepare(sql).get(...args) ?? null, all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }), now: () => (/^\s*SELECT/i.test(sql) ? { results: s.prepare(sql).all(...args) } : { meta: { changes: Number(s.prepare(sql).run(...args).changes) } }) });
  const files = new Map(), now = Date.now(), start = now - 2 * 3600e3;
  const env = { DB: { prepare: (q) => st(q), batch: async (l) => l.map((x) => x.now()) }, STRAVA_API: "http://strava.test", STRAVA_CLIENT_ID: "1", STRAVA_CLIENT_SECRET: "s", BIO_R2: { put: async (k, v) => files.set(k, v), delete: async () => {} } };
  await stravaOf(env, "nobody");   // (the tables made)
  s.prepare("INSERT INTO fx_strava (user_id, athlete, access, refresh, exp, since, seen, last, due, ok, added) VALUES ('sue', 7, 'tok', 'ref', ?, ?, '[]', NULL, 1, 1, ?)").run(now + 3600e3, now - 7 * 86400e3, now);
  const list = [
    { id: 501, name: "Endurance 75", sport_type: "Ride", start_date: new Date(start).toISOString(), moving_time: 4500, elapsed_time: 4800, distance: 30412.37 },
    { id: 502, name: "Jog", sport_type: "Run", start_date: new Date(start - 86400e3).toISOString() },
  ];
  const n = 60, streams = { time: { data: Array.from({ length: n }, (_, i) => i) }, distance: { data: Array.from({ length: n }, (_, i) => i * 5) } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = new URL(String(u));
    if (url.pathname === "/api/v3/athlete/activities") return new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } });
    if (/^\/api\/v3\/activities\/\d+\/streams$/.test(url.pathname)) return new Response(JSON.stringify(streams), { headers: { "Content-Type": "application/json" } });
    return new Response("{}", { status: 404 });
  };
  try { await fetchStrava(env, "sue", { force: true }); } finally { globalThis.fetch = realFetch; }
  const rows = s.prepare("SELECT id, name, sport, secs, dist FROM fx_strava_new WHERE user_id = 'sue' ORDER BY id").all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ id: "501", name: "Endurance 75", sport: "ride", secs: 4500, dist: 30412.4 }, { id: "502", name: "Jog", sport: "run", secs: null, dist: null }]);
  assert.equal(files.size, 2, "each written as a file waiting, as before");
  const [ride] = await donesIn(env, "sue", start - 60e3, now, { added: true });
  // (added: when it came in, as the hook wrote it, for Today's after phase)
  const added = s.prepare("SELECT added FROM fx_strava_new WHERE user_id = 'sue' AND id = '501'").get().added;
  assert.ok(Number.isFinite(added) && added > 0);
  assert.deepEqual({ ...ride }, { name: "Endurance 75", sport: "ride", start: Date.parse(list[0].start_date), secs: 4500, dist: 30412.4, tss: null, from: "strava", added });
});
