// Strava's webhook (functions/_strava.js hookEvent): Strava doesn't sign its events, and the subscription's number and
// an athlete's are no secret, so what an event says is checked with Strava before it's acted on. Those checks are asks
// out of the whole app's allowance (200 a quarter hour): so made-up events for an athlete, however many, have Strava
// asked only a few times in a few minutes. Against a real database (node:sqlite as D1) and Strava stood in for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { hookEvent, stravaOf } from "../../../functions/_strava.js";

test("made-up events for an athlete ask Strava a few times in a few minutes, not once each", async () => {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({ sql, bind: (...a) => st(sql, a), first: async () => s.prepare(sql).get(...args) ?? null, all: async () => ({ results: s.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...args).changes) } }), now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? { results: s.prepare(sql).all(...args) } : { meta: { changes: Number(s.prepare(sql).run(...args).changes) } }) });
  const now = Date.now(), env = { DB: { prepare: (q) => st(q), batch: async (l) => l.map((x) => x.now()) }, STRAVA_API: "http://strava.test", STRAVA_CLIENT_ID: "1", STRAVA_CLIENT_SECRET: "s" };
  await db(env); await stravaOf(env, "nobody");   // (the tables made)
  s.prepare("INSERT INTO fx_meta (k, v) VALUES ('strava_hook', '99')").run();
  s.prepare("INSERT INTO fx_strava (user_id, athlete, access, refresh, exp, since, seen, last, due, ok, added) VALUES ('sue', 7, 'tok', 'ref', ?, ?, '[]', NULL, 0, 1, ?)").run(now + 3600e3, now - 7 * 86400e3, now);
  s.prepare("INSERT INTO fx_strava_new (user_id, id, start, name, added) VALUES ('sue', '501', ?, 'Endurance 75', ?)").run(now - 3600e3, now);
  const asked = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = new URL(String(u));
    asked.push(url.pathname);
    if (url.pathname === "/api/v3/activities/501") return Response.json({ id: 501, name: "Endurance 75" });
    if (url.pathname === "/api/v3/athlete") return Response.json({ id: 7 });
    return new Response("{}", { status: 404 });
  };
  try {
    for (let i = 0; i < 20; i++) await hookEvent(env, { subscription_id: 99, owner_id: 7, object_type: "activity", object_id: 501, aspect_type: "update", updates: { title: `Renamed ${i}` } });
    for (let i = 0; i < 20; i++) await hookEvent(env, { subscription_id: 99, owner_id: 7, object_type: "athlete", object_id: 7, aspect_type: "update", updates: { authorized: "false" } });
    // (a new activity only marks them to be asked: never held back)
    await hookEvent(env, { subscription_id: 99, owner_id: 7, object_type: "activity", object_id: 502, aspect_type: "create" });
  } finally { globalThis.fetch = realFetch; }
  assert.ok(asked.length >= 1 && asked.length <= 3, `Strava asked ${asked.length} times for 40 events`);
  assert.equal(s.prepare("SELECT due FROM fx_strava WHERE user_id = 'sue'").get().due, 1);
  assert.ok(s.prepare("SELECT 1 FROM fx_strava WHERE user_id = 'sue'").get(), "still connected: Strava took the tokens");
});
