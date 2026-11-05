// Notifications from Today's You (functions/_todaynotify.js, Today First spec §6.1, §10): GET today/notify is the
// account page's own notifySettings, exactly; PATCH today/notify goes through the account page's setNotify, with its
// checks and its limit, and answers the settings after; neither answers anyone but Today's own page (its Origin; a
// change never straight from a browser), nor anyone signed out. Through the account's router, as Today's server asks it,
// against a database of its own (Node's own SQLite in memory, standing in for D1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { db, hex, sha256 } from "../../../functions/_pigeon.js";
import { onRequest, notifySettings } from "../../../functions/api/account/[[path]].js";
import { notifyGet, notifyPatch } from "../../../functions/_todaynotify.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...val(args)) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...val(args)), meta: {} }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? { results: s.prepare(sql).all(...val(args)) } : { meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
  });
  return { sql: s, prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const env = { DB: d1(), APPS_SITE: "ifl.test", ACCOUNT_SITE: "gfg.test", ACCOUNT_HOST: "account.ifl.test", AUTH_HOST: "auth.ifl.test" };
const D = await db(env), t0 = Date.now(), TODAY = "http://ifl.test:8788", ACCT = "http://account.ifl.test:8788";
for (const id of ["ann", "bo"]) await D.prepare("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?2, ?2)").bind(id, t0).run();
async function signIn(user) {
  const token = randomBytes(24).toString("base64url");
  await D.prepare("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash) VALUES (?, ?, ?, ?, ?, ?)").bind(`s-${user}-${token.slice(0, 6)}`, user, t0, t0, t0, hex(await sha256(token))).run();
  return `account=${token}`;
}
const ann = await signIn("ann"), bo = await signIn("bo");
// (a request to the account's address: Today's, as its server makes them, or the account page's own)
async function call(method, path, { cookie, origin = TODAY, body, site, page = false } = {}) {
  const url = `http://account.ifl.test:8788/api/account/${page ? "" : "today/"}${path}`, data = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  const request = new Request(url, { method, body: data, headers: { ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(site ? { "Sec-Fetch-Site": site } : {}),
    ...(data ? { "Content-Type": "application/json" } : {}) } });
  const res = await onRequest({ request, env, params: { path: [...(page ? [] : ["today"]), ...path.split("?")[0].split("/")] }, waitUntil: () => {} });
  return { s: res.status, j: (res.headers.get("Content-Type") || "").includes("json") ? await res.json() : null };
}

test("GET today/notify: the account page's own settings, exactly", async () => {
  const r = await call("GET", "notify", { cookie: ann });
  assert.equal(r.s, 200);
  const page = await call("GET", "notify", { cookie: ann, origin: ACCT, page: true });
  assert.equal(page.s, 200);
  assert.deepEqual(r.j, page.j, "the same as the account page's");
  const u = await D.prepare("SELECT * FROM pg_users WHERE id = 'ann'").first();
  assert.deepEqual(r.j, JSON.parse(JSON.stringify(await notifySettings(env, u))));
  assert.deepEqual(Object.keys(r.j).sort(), ["account", "chat", "emailOk", "fitness", "mail", "markets", "quiet", "today", "weather"]);
  assert.deepEqual(await notifyGet(env, u), await notifySettings(env, u));
});

test("PATCH today/notify: changed as the account page changes it, and the settings after; the account page then says the same", async () => {
  let r = await call("PATCH", "notify", { cookie: ann, body: { quiet: { on: true, from: 21, to: 6, tz: "Europe/London" } } });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.quiet, { on: true, from: 21, to: 6, tz: "Europe/London" });
  r = await call("PATCH", "notify", { cookie: ann, body: { chat: { messages: false, names: true } } });
  assert.equal(r.j.chat.kinds.messages, false); assert.equal(r.j.chat.names, true);
  assert.deepEqual((await call("GET", "notify", { cookie: ann, origin: ACCT, page: true })).j, r.j);
  assert.equal((await call("GET", "notify", { cookie: bo })).j.quiet.on, false, "another account's untouched");
  // (today's morning, from You: on, at its time)
  r = await call("PATCH", "notify", { cookie: ann, body: { today: { on: true, at: 450 } } });
  assert.deepEqual({ on: r.j.today.on, at: r.j.today.at }, { on: true, at: 450 });
  // (an empty change changes nothing)
  const before = (await call("GET", "notify", { cookie: ann })).j;
  r = await call("PATCH", "notify", { cookie: ann, body: {} });
  assert.deepEqual(r.j, before);
});

test("PATCH today/notify goes through setNotify's checks: each refused as the account page refuses it, nothing changed", async () => {
  const before = (await call("GET", "notify", { cookie: ann })).j;
  for (const [body, words] of [[{ quiet: null }, "Bad request."], [{ chat: { messages: "yes" } }, "Choose on or off."], [{ weather: { place: { lat: "x" } } }, "Bad place."],
    [{ weather: { briefAt: "7am" } }, "Choose a time."], [{ markets: { alerts: 1 } }, "Choose on or off."], [{ today: "on" }, "Bad request."], ["[1, 2]", "Bad request."]]) {
    const r = await call("PATCH", "notify", { cookie: ann, body });
    assert.equal(r.s, 400, JSON.stringify(body));
    assert.equal(r.j.error, words, JSON.stringify(body));
  }
  assert.deepEqual((await call("GET", "notify", { cookie: ann })).j, before);
  await assert.rejects(notifyPatch(env, { id: "ann" }, null), (e) => e.status === 400);
});

test("refused without Today's Origin, straight from a browser, or signed out", async () => {
  for (const [method, body] of [["GET"], ["PATCH", { quiet: { on: false } }]]) {
    let r = await call(method, "notify", { cookie: ann, body, origin: "https://evil.example" });
    assert.equal(r.s, 403, `${method}: another Origin`);
    r = await call(method, "notify", { cookie: ann, body, origin: null });
    assert.equal(r.s, 403, `${method}: no Origin`);
    r = await call(method, "notify", { cookie: ann, body, origin: ACCT });
    assert.equal(r.s, 403, `${method}: the account page's Origin isn't Today's`);
    r = await call(method, "notify", { body });
    assert.equal(r.s, 401, `${method}: signed out`);
  }
  const r = await call("PATCH", "notify", { cookie: ann, body: { quiet: { on: false } }, site: "cross-site" });
  assert.equal(r.s, 403, "a change straight from a browser");
  assert.equal((await call("GET", "notify", { cookie: ann })).j.quiet.on, true, "nothing changed by any of them");
});

test("You's changes and the account page's share one limit", async () => {
  const bo2 = await signIn("bo");
  // (the account page's changes have had their 120 this hour)
  await D.prepare("INSERT OR REPLACE INTO pg_limits (key, count, reset_at) VALUES ('prefs:bo', 120, ?)").bind(Date.now() + 3600e3).run();
  const r = await call("PATCH", "notify", { cookie: bo2, body: { quiet: { on: true } } });
  assert.equal(r.s, 429, JSON.stringify(r.j));
  assert.equal((await call("GET", "notify", { cookie: bo2 })).j.quiet.on, false);
});
