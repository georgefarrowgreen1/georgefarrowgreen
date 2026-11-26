// Fitness's tables (functions/_fitness.js fitdb and tablesOnce), against a database of their own (Node's own SQLite in
// memory, standing in for D1): each part's tables made once for each change to them, so a new copy of the server,
// with everything made already, makes one look and no more before it can answer
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

function d1(said) {
  const s = new DatabaseSync(":memory:");
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => { said.push(sql); return s.prepare(sql).get(...args) ?? null; },
    all: async () => { said.push(sql); return { results: s.prepare(sql).all(...args) }; },
    run: async () => { said.push(sql); return { meta: { changes: Number(s.prepare(sql).run(...args).changes) } }; },
    now: () => { said.push(sql); return /^\s*SELECT/i.test(sql) ? s.prepare(sql).all(...args) : s.prepare(sql).run(...args); },
  });
  return { prepare: (sql) => st(sql), async batch(list) { return list.map((x) => x.now()); } };
}
// (a new copy of the server: the module afresh, as a new isolate has it, over the same database)
let copies = 0;
const server = () => import(`../../../functions/_fitness.js?copy=${++copies}`);

test("a part's tables: made once, then known from fitdb's one look, even by a new copy of the server", async () => {
  const said = [], env = { DB: d1(said) };
  let made = 0;
  const make = async (D) => { made++; await D.prepare("CREATE TABLE IF NOT EXISTS fx_try (id TEXT PRIMARY KEY)").run(); };
  // (the first: everything made, and kept as made)
  const first = await server();
  await first.tablesOnce(env, "try", make);
  assert.equal(made, 1);
  await first.tablesOnce(env, "try", make);
  assert.equal(made, 1, "not made again by the same copy");
  // (a new copy, everything made already: one look, nothing made)
  said.length = 0;
  const second = await server();
  const D = await second.tablesOnce(env, "try", make);
  assert.equal(made, 1, "not made again by a new copy");
  assert.equal(said.length, 1, `one look, not ${said.length}: ${said.join(" | ")}`);
  assert.match(said[0], /^SELECT k, v FROM fx_meta/);
  assert.ok(await D.prepare("SELECT id FROM fx_try").all(), "and the table there");
});
test("a change to a part's tables: made again, once", async () => {
  const env = { DB: d1([]) };
  let runs = 0;
  await (await server()).tablesOnce(env, "try", async () => { runs++; });
  await (await server()).tablesOnce(env, "try", async () => { runs++; /* changed: a column added, say */ });
  await (await server()).tablesOnce(env, "try", async () => { runs++; /* changed: a column added, say */ });
  assert.equal(runs, 2);
});

test("workout reviews preserve uploaded activity data and stay private to the captured account", async () => {
  const { activities, activityReviews, deleteActivity, dropFitness } = await server();
  const { db, issueSession, hex, sha256 } = await import("../../../functions/_pigeon.js");
  const { onRequest } = await import("../../../functions/api/fitness/[[path]].js");
  const env = { DB: d1([]), FITNESS_HOST: "fitness.localhost" };
  const origin = "http://fitness.localhost", cookies = {};
  await db(env);
  // A database from before the review columns existed, with activity IDs scoped per owner.
  await env.DB.prepare(`CREATE TABLE fx_acts (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, sport TEXT NOT NULL,
    indoor INTEGER DEFAULT 0, name TEXT, device TEXT, file TEXT, type TEXT NOT NULL, size INTEGER NOT NULL, sum TEXT,
    added INTEGER NOT NULL, PRIMARY KEY (user_id, id))`).run();
  for (const owner of ["ann", "bo"]) {
    await env.DB.prepare("INSERT INTO pg_users (id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(owner, owner, owner, `${owner}@example.com`, "{}", "s", "p", "v", 9, 0, 0).run();
    const hash = hex(await sha256(await issueSession(env, owner, new Request(`${origin}/api/fitness/me`))));
    cookies[owner] = owner.padEnd(43, "x");
    await env.DB.prepare("UPDATE pg_sessions SET site_hash = ? WHERE hash = ?").bind(hex(await sha256(cookies[owner])), hash).run();
    await env.DB.prepare("INSERT INTO fx_acts (user_id,id,start,sport,name,type,size,sum,added) VALUES (?, ?, ?, 'ride', 'Test ride', 'fit', 1, ?, ?)")
      .bind(owner, "same-id", Date.now(), '{"avgPwr":210}', Date.now()).run();
  }
  const api = async (method, { who = "ann", owner = who, from = origin, value, id = "same-id" } = {}) => {
    const headers = { Origin: from, "Content-Type": "application/json" };
    if (who) headers.Cookie = `account=${cookies[who]}`;
    if (owner) headers["X-Inflite-Route-Owner"] = owner;
    const response = await onRequest({ env, params: { path: ["acts", id, "review"] }, waitUntil() {},
      request: new Request(`${origin}/api/fitness/acts/${id}/review`, { method, headers, body: value === undefined ? undefined : JSON.stringify(value) }) });
    return { status: response.status, json: await response.json(), cache: response.headers.get("Cache-Control") };
  };
  const review = { workoutId: "rh:threshold:60", effort: 8, notes: "Felt steady\nHard finish" };
  assert.equal((await api("GET", { who: null })).status, 401);
  assert.equal((await api("GET", { owner: null })).status, 401);
  assert.equal((await api("GET", { who: "bo", owner: "ann" })).status, 401);
  assert.equal((await api("GET", { id: "missing" })).status, 404);
  assert.deepEqual((await api("GET")).json, { ver: 0, review: null });
  assert.equal((await api("PUT", { from: "http://other.localhost", value: { base: 0, review } })).status, 403);
  for (const invalid of [{ effort: 11 }, { effort: 5.5 }, { notes: "n".repeat(601) }, { notes: { note: "n" } }, { workoutId: "bad/file" }]) {
    assert.equal((await api("PUT", { value: { base: 0, review: { ...review, ...invalid } } })).status, 400);
  }
  const value = { base: 0, review };
  const first = await api("PUT", { value });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json, { ver: 1, review });
  assert.match(first.cache, /no-store/);
  assert.deepEqual((await api("PUT", { value })).json, first.json, "retrying the same save acknowledges the first write");
  const conflict = await api("PUT", { value: { base: 0, review: { ...review, effort: 4 } } });
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.json, { conflict: true, ver: 1, review });
  assert.deepEqual((await activities(env, "ann")).acts[0].sum, { avgPwr: 210 });
  assert.equal("review" in (await activities(env, "ann")).acts[0], false);
  assert.deepEqual(await activityReviews(env, "ann"), new Map([["same-id", review]]));
  assert.equal((await activityReviews(env, "bo")).size, 0);
  assert.deepEqual((await api("GET", { who: "bo" })).json, { ver: 0, review: null });
  assert.deepEqual((await api("PUT", { who: "bo", value })).json, { ver: 1, review });
  assert.deepEqual((await api("PUT", { value: { base: 1, review: null } })).json, { ver: 2, review: null });
  await deleteActivity(env, "ann", "same-id");
  assert.equal((await api("GET")).status, 404);
  assert.deepEqual((await api("GET", { who: "bo" })).json, { ver: 1, review });
  await dropFitness(env, "bo");
  assert.equal((await api("GET", { who: "bo" })).status, 404);
});
