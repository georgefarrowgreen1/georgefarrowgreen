import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { onRequest } from "../../../functions/api/atlas-context.js";
import { onRequest as verifyAdmin } from "../../../functions/api/atlas-admin.js";
import { accountHost } from "../../../functions/_acctapp.js";
import { db } from "../../../functions/_pigeon.js";
import { fitdb } from "../../../functions/_fitness.js";
import { setSnapshot } from "../../../functions/_fittoday.js";
import { tddb, todayPrefs, morningTz } from "../../../functions/_today.js";
import { cardsFor, localDay } from "../../../functions/_todaycards.js";
import { todayLinks } from "../../../functions/_sites.js";

const KEY = "atlas-verifier-fixture-" + "x".repeat(40);
const NOW = Date.UTC(2026, 10, 24, 12, 30);
const URL = "https://account.inflite.ai/api/atlas-context";
const valid = { owner: "owner", scope: "fitness" };

async function fixture(t) {
  const sql = new DatabaseSync(":memory:"), queries = [], sessions = [], pending = [];
  t.after(() => sql.close());
  let failQuery = null;
  const values = list => list.map(value => typeof value === "boolean" ? +value : value === undefined ? null : value);
  function statement(query, bindings = []) {
    const execute = (mode) => {
      queries.push({ query, bindings });
      if (failQuery?.(query)) throw new Error("Private fixture database failure: " + KEY + " secret-session-cookie");
      return sql.prepare(query)[mode](...values(bindings));
    };
    return {
      bind: (...bindings) => statement(query, bindings),
      first: async () => execute("get") ?? null,
      all: async () => ({ results: execute("all"), meta: {} }),
      run: async () => ({ success: true, meta: { changes: Number(execute("run").changes) } }),
    };
  }
  const database = {
    prepare: query => statement(query),
    withSession(constraint) { sessions.push(constraint); return database; },
    async batch(list) {
      sql.exec("BEGIN");
      try { const results = []; for (const item of list) results.push(await item.all()); sql.exec("COMMIT"); return results; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  const env = { DB: database, ATLAS_VERIFY_KEY: KEY, PIGEON_ADMIN_EMAIL: "absent-admin@example.test" };
  const put = (table, row) => sql.prepare(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`).run(...values(Object.values(row)));
  await db(env); await fitdb(env); await tddb(env);
  for (const owner of ["owner", "other"]) {
    put("pg_users", { id: owner, handle: owner, name: owner, email: owner + "@example.test", pub: "{}", salt: "fixture", proof_hash: "fixture", vault: "fixture", swift: 1, swift_at: 0, created_at: 0, notify_prefs: JSON.stringify({ tz: "Pacific/Auckland" }) });
    put("pg_passkeys", { id: "pk-" + owner, user_id: owner, public_key: "{}", alg: -7, created_at: 0 });
    put("td_prefs", { user_id: owner, m_tz: "America/New_York", updated: 0 });
  }
  put("pg_meta", { k: "admin_user", v: "owner" });
  queries.length = sessions.length = 0;
  t.mock.method(globalThis, "fetch", async () => assert.fail("This fixture must not make external requests"));
  function request({ url = URL, method = "POST", body = valid, authorization = "Bearer " + KEY, headers = {} } = {}) {
    return new Request(url, { method, headers: { "Content-Type": "application/json", ...(authorization == null ? {} : { Authorization: authorization }), ...headers },
      ...(["GET", "HEAD"].includes(method) || body === undefined ? {} : { body: typeof body === "string" || body instanceof ReadableStream || body instanceof Uint8Array ? body : JSON.stringify(body), duplex: "half" }) });
  }
  async function run(options, overrides = {}) {
    const response = await onRequest({ request: request(options), env: { ...env, ...overrides }, waitUntil: promise => pending.push(Promise.resolve(promise).catch(() => {})) });
    const raw = await response.text();
    assert.ok(!raw.includes(KEY) && !raw.includes("secret-session-cookie"), "service responses do not expose verifier or session credentials");
    assert.equal(response.headers.get("Set-Cookie"), null); assert.match(response.headers.get("Cache-Control"), /no-store/);
    while (pending.length) await pending.shift();
    return { status: response.status, body: JSON.parse(raw), headers: response.headers };
  }
  return { env, sql, queries, sessions, put, request, run, failWhen: fn => { failQuery = fn; } };
}

test("Atlas context accepts only its exact account host, method and shared verifier", async t => {
  const f = await fixture(t);
  for (const [options, status, overrides] of [
    [{ method: "GET" }, 405],
    [{ url: "https://auth.inflite.ai/api/atlas-context" }, 404],
    [{ url: "https://fitness.inflite.ai/api/atlas-context" }, 404],
    [{ url: "https://account.inflite.ai.evil.invalid/api/atlas-context" }, 404],
    [{ authorization: null, headers: { Cookie: "account=secret-session-cookie" } }, 403],
    [{ authorization: "Bearer " + "z".repeat(KEY.length) }, 403],
    [{ authorization: "Bearer short" }, 403],
    [{}, 503, { ATLAS_VERIFY_KEY: undefined }],
    [{}, 503, { ATLAS_VERIFY_KEY: "short" }],
  ]) assert.equal((await f.run(options, overrides)).status, status);
  assert.equal(f.queries.length, 0, "invalid service requests never inspect owner data");
});

test("Atlas context strictly bounds and validates its JSON scope before account reads", async t => {
  const f = await fixture(t);
  for (const body of ["{", "null", "[]", { owner: "owner" }, { scope: "fitness" }, { ...valid, owner: 7 }, { ...valid, owner: "a".repeat(129) }, { ...valid, scope: "mail" }, { ...valid, path: "/api/account/private" }])
    assert.equal((await f.run({ body })).status, 400);
  assert.equal((await f.run({ body: Uint8Array.of(0xc3) })).status, 400, "invalid UTF-8 is not accepted");
  assert.equal((await f.run({ headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await f.run({ headers: { "Content-Length": "1025" } })).status, 413);
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(1025))); }, cancel() { cancelled = true; } });
  assert.equal((await f.run({ body, headers: { "Content-Length": "1" } })).status, 413);
  assert.equal(cancelled, true); assert.equal(f.queries.length, 0);
});

test("current primary admin identity and passkey ownership gate every Fitness read", async t => {
  const f = await fixture(t);
  for (const owner of ["other", "missing"]) assert.equal((await f.run({ body: { owner, scope: "fitness" }, headers: { Cookie: "account=secret-session-cookie" } })).status, 403);
  assert.ok(f.sessions.every(value => value === "first-primary"));
  assert.ok(!f.queries.some(({ query }) => /fx_today|fx_acts|td_prefs/.test(query)), "a foreign owner cannot cause a Fitness read");
  f.sql.prepare("DELETE FROM pg_passkeys WHERE user_id='owner'").run();
  assert.equal((await f.run()).status, 403);
  f.put("pg_passkeys", { id: "pk-owner", user_id: "owner", public_key: "{}", alg: -7, created_at: 0 });
  f.put("pg_meta", { k: "admin_user", v: "other" });
  assert.equal((await f.run()).status, 403, "a former admin is denied immediately");
  f.put("pg_meta", { k: "admin_user", v: "owner" });
  f.sql.prepare("UPDATE pg_users SET delete_at=? WHERE id='owner'").run(NOW);
  assert.equal((await f.run()).status, 403, "a deleted or deleting account is not an Atlas owner");
});

test("scheduled Fitness context matches the owner's real card and timezone without a browser session", async t => {
  t.mock.method(Date, "now", () => NOW);
  const f = await fixture(t), zone = "Pacific/Auckland", day = localDay(zone, NOW).day;
  await setSnapshot(f.env, "owner", { tz: zone, units: "metric", days: { [day]: { state: "rest", why: "Owner recovery day" } } });
  await setSnapshot(f.env, "other", { tz: zone, units: "imperial", days: { [day]: { state: "rest", why: "Other account private summary" } } });
  const user = f.sql.prepare("SELECT * FROM pg_users WHERE id='owner'").get(), prefs = await todayPrefs(f.env, "owner");
  const expected = await cardsFor(f.env, user, { only: ["fitness"], request: null, tz: morningTz(user, prefs), links: todayLinks(f.env, null) });
  f.queries.length = f.sessions.length = 0;
  const result = await f.run({ headers: { Cookie: "account=secret-session-cookie" } });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { fitness: expected.cards.fitness });
  assert.equal(result.body.fitness.tz, zone, "Quiet Hours timezone takes precedence over Today preferences");
  assert.equal(result.body.fitness.day, day); assert.equal(result.body.fitness.why, "Owner recovery day");
  assert.ok(!JSON.stringify(result.body).includes("Other account"));
  assert.ok(f.sessions.length >= 2 && f.sessions.every(value => value === "first-primary"));
  assert.ok(f.queries.filter(({ query }) => /fx_today|fx_acts/.test(query)).every(({ bindings }) => bindings[0] === "owner"));
  assert.ok(!f.queries.some(({ query }) => /pg_sessions/.test(query)), "cookies are neither read as identity nor persisted");
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM pg_sessions").get().n, 0);
});

test("missing or stale Fitness summaries cannot be reported as usable context", async t => {
  t.mock.method(Date, "now", () => NOW);
  const f = await fixture(t), day = localDay("Pacific/Auckland", NOW).day;
  let result = await f.run();
  assert.equal(result.status, 404); assert.equal(result.body.code, "fitness_context_empty");
  await setSnapshot(f.env, "owner", { tz: "Pacific/Auckland", units: "metric", days: { [day]: { state: "rest", why: "Old summary" } } });
  f.sql.prepare("UPDATE fx_today SET at=? WHERE user_id='owner'").run(NOW - 9 * 86400000);
  result = await f.run();
  assert.equal(result.status, 404); assert.ok(!JSON.stringify(result.body).includes("Old summary"));
});

test("database errors and oversized summaries return static errors without private logs", async t => {
  t.mock.method(Date, "now", () => NOW);
  const logged = []; t.mock.method(console, "error", (...args) => logged.push(args)); t.mock.method(console, "log", (...args) => logged.push(args));
  const f = await fixture(t);
  f.failWhen(query => query.startsWith("SELECT u.id"));
  const failed = await f.run();
  assert.equal(failed.status, 503); assert.equal(failed.body.code, "fitness_context_unavailable"); assert.deepEqual(logged, []);
  f.failWhen(null);
  const day = localDay("Pacific/Auckland", NOW).day;
  await setSnapshot(f.env, "owner", { tz: "Pacific/Auckland", units: "metric", days: { [day]: { state: "rest", why: "Small summary" } } });
  f.sql.prepare("UPDATE fx_today SET days=? WHERE user_id='owner'").run(JSON.stringify({ [day]: { state: "rest", why: "private ".repeat(5000) } }));
  const oversized = await f.run();
  assert.equal(oversized.status, 503); assert.ok(!JSON.stringify(oversized.body).includes("private private")); assert.deepEqual(logged, []);
});

test("the existing admin verifier retains its contract through the shared authentication helper", async t => {
  const f = await fixture(t);
  for (const [owner, allowed] of [["owner", true], ["other", false]]) {
    const response = await verifyAdmin({ request: f.request({ url: "https://account.inflite.ai/api/atlas-admin", body: { owner } }), env: f.env });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { allowed });
  }
  const denied = await verifyAdmin({ request: f.request({ authorization: null }), env: f.env });
  assert.equal(denied.status, 403); assert.deepEqual(await denied.json(), { allowed: false });
});

test("account routing exposes only the two exact Atlas paths on the account host", async t => {
  const f = await fixture(t);
  for (const [host, path, allowed] of [
    ["account.inflite.ai", "/api/atlas-context", true], ["account.inflite.ai", "/api/atlas-admin", true],
    ["account.inflite.ai", "/api/atlas-context/other", false], ["account.inflite.ai", "/api/atlas-other", false],
    ["auth.inflite.ai", "/api/atlas-context", false], ["account.georgefarrowgreen.com", "/api/atlas-context", false],
  ]) {
    const request = f.request({ url: "https://" + host + path });
    const response = await accountHost({ request, env: f.env, next: () => new Response("routed", { status: 201 }) }, new globalThis.URL(request.url));
    assert.equal(response.status, allowed ? 201 : 404);
  }
});
