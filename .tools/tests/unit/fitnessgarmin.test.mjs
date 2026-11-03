// Garmin Connect's scheduler turn (functions/_garmin.js garminTick), against a database of its own (Node's own SQLite in
// memory, standing in for D1): as many accounts asked as are due, the longest waiting first, up to six a turn, so each
// is asked every 15 minutes however many are connected (not two a turn, as it was, and the rest falling behind)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { garminTick } from "../../../functions/_garmin.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }),
    now: () => (/^\s*SELECT/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args)),
  });
  return { s, prepare: (sql) => st(sql), async batch(list) { return list.map((x) => x.now()); } };
}

// (one database for the file: the tables are made once in each copy of the server, as in production)
const DB0 = d1();

test("the scheduler's turn: every account that's due, longest waiting first, up to six", async (t) => {
  t.mock.method(console, "warn", () => {});
  // (no key that opens, and nowhere to reach: each ask fails at once, here, as asked)
  const DB = DB0, env = { DB, GARMIN_API: "http://127.0.0.1:9" }, now = Date.now();
  await garminTick(env);
  // (nine due: one never asked, eight last asked an hour or more ago; and one asked a minute ago, not due)
  for (let i = 0; i < 9; i++) DB.s.prepare("INSERT INTO fx_garmin (user_id, apikey, last, ok, added) VALUES (?, 'x', ?, 1, ?)").run(`u${i}`, i ? now - 3600e3 - i * 60e3 : null, now);
  DB.s.prepare("INSERT INTO fx_garmin (user_id, apikey, last, ok, added) VALUES ('fresh', 'x', ?, 1, ?)").run(now - 60e3, now);
  const asked = () => DB.s.prepare("SELECT user_id FROM fx_garmin WHERE last >= ? ORDER BY user_id").all(now).map((r) => r.user_id);
  assert.equal((await garminTick(env)).asked, 6);
  assert.deepEqual(asked(), ["u0", "u4", "u5", "u6", "u7", "u8"]);
  // (the next turn, the three left; the one asked a minute ago, not yet)
  assert.equal((await garminTick(env)).asked, 3);
  assert.deepEqual(asked(), ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
  assert.equal((await garminTick(env)).asked, 0);
});

// Today First (spec §5.2, §9.3): each activity waiting from Garmin keeps the sport, time and distance Garmin's list said
// (functions/_garmin.js fetchNew), so Today can show a ride before Fitness has read its file; null where the list said
// nothing, or nothing that could be one; and a waiting row's figures read back as Today reads them (donesIn)
import { figuresOf, garminSport, fetchNew } from "../../../functions/_garmin.js";
import { donesIn } from "../../../functions/_fitshare.js";

test("Garmin's sports in Fitness's words, as Strava's are; the figures only where they're numbers that could be them", () => {
  for (const [k, s] of [["cycling", "ride"], ["road_biking", "ride"], ["mountain_biking", "ride"], ["gravel_cycling", "ride"], ["indoor_cycling", "ride"], ["virtual_ride", "ride"],
    ["e_bike_fitness", "ride"], ["running", "run"], ["trail_running", "run"], ["treadmill_running", "run"], ["lap_swimming", "swim"], ["open_water_swimming", "swim"],
    ["walking", "walk"], ["hiking", "walk"], ["strength_training", "strength"], ["rowing", "other"], ["yoga", "other"]]) assert.equal(garminSport(k), s, k);
  assert.equal(garminSport(undefined), null); assert.equal(garminSport(""), null);
  assert.deepEqual(figuresOf({ activityType: { typeKey: "road_biking" }, duration: 4512.7, distance: 32100.46 }), { sport: "ride", secs: 4513, dist: 32100.5 });
  assert.deepEqual(figuresOf({}), { sport: null, secs: null, dist: null });
  for (const bad of [NaN, Infinity, -5, "3600", null, 1e12]) assert.deepEqual(figuresOf({ duration: bad, distance: bad }), { sport: null, secs: null, dist: null }, String(bad));
});

test("what's new from Garmin: each waiting row with its sport, time and distance, where the list said them; read back as Today reads them", async (t) => {
  t.mock.method(console, "error", () => {});
  const DB = DB0, now = Date.now(), files = new Map(), start = now - 3 * 3600e3;
  const env = { DB, GARMIN_API: "http://garmin.test", BIO_R2: { put: async (k, v) => files.set(k, v), delete: async () => {} } };
  DB.s.prepare("INSERT INTO fx_garmin (user_id, apikey, token, token_exp, since, seen, last, ok, added) VALUES ('gee', 'key', 'tok', ?, ?, '[]', NULL, 1, ?)").run(now + 3600e3, now - 7 * 86400e3, now);
  const list = [
    { activityId: 101, activityName: "Endurance 75", startTimeGMT: new Date(start).toISOString().slice(0, 19).replace("T", " "), activityType: { typeKey: "road_biking" }, duration: 4500.4, distance: 30412.37 },
    { activityId: 102, activityName: "Lunch walk", startTimeGMT: new Date(start - 86400e3).toISOString().slice(0, 19).replace("T", " "), activityType: { typeKey: "walking" } },
    { activityId: 103, activityName: "Odd", startTimeGMT: new Date(start - 2 * 86400e3).toISOString().slice(0, 19).replace("T", " "), duration: "long", distance: -1 },
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = new URL(String(u));
    if (url.pathname.includes("/activities/search/")) return new Response(JSON.stringify(Number(url.searchParams.get("start")) ? [] : list), { headers: { "Content-Type": "application/json" } });
    if (url.pathname.startsWith("/download-service/")) return new Response(new Uint8Array([80, 75, 3, 4, 1, 2, 3]));
    return new Response("{}", { status: 404 });
  };
  try { await fetchNew(env, "gee", { force: true }); } finally { globalThis.fetch = realFetch; }
  const rows = DB.s.prepare("SELECT id, name, sport, secs, dist FROM fx_garmin_new WHERE user_id = 'gee' ORDER BY id").all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { id: "101", name: "Endurance 75", sport: "ride", secs: 4500, dist: 30412.4 },
    { id: "102", name: "Lunch walk", sport: "walk", secs: null, dist: null },
    { id: "103", name: "Odd", sport: null, secs: null, dist: null },
  ]);
  assert.equal(files.size, 3, "each file waiting, as before");
  const [ride] = await donesIn(env, "gee", start - 60e3, now, { added: true });
  // (added: when it came in, as the poll wrote it, for Today's after phase)
  const added = DB.s.prepare("SELECT added FROM fx_garmin_new WHERE user_id = 'gee' AND id = '101'").get().added;
  assert.ok(Number.isFinite(added) && added > 0);
  assert.deepEqual({ ...ride }, { name: "Endurance 75", sport: "ride", start: Math.floor(start / 1000) * 1000, secs: 4500, dist: 30412.4, tss: null, from: "garmin", added });
});
