import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { cashInput, cashTotals, cashNumber, cashSeries, MAX_CASH } from "../../../markets/cash.js";
import { createCashStore } from "../../../markets/cash-store.js";
import { cashHoldings, putCash, dropCash } from "../../../functions/_marketcash.js";
import { db, issueSession, hex, sha256 } from "../../../functions/_pigeon.js";
import { mkdb, dropMarkets } from "../../../functions/_markets.js";
import { withSession } from "../../../functions/_account.js";
import { onRequest } from "../../../functions/api/markets/[[path]].js";

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const holding = (n = 1, extra = {}) => ({ id: id(n), name: "Savings", amount: 12000, rate: 4, account: null, ...extra });
test("cash validates real amounts/rates, accepts zero, and keeps forecasts separate from balances", () => {
  assert.equal(cashNumber("£12,000.50"), 12000.5); assert.equal(cashNumber("4.25%", { rate: true }), 4.25); assert.equal(cashNumber("", { rate: true }), 0);
  for (const s of ["", "1,2", "1e4", "££3", "-1", "abc"]) assert.ok(Number.isNaN(cashNumber(s)), s);
  assert.deepEqual(cashInput(holding(1, { name: "  Savings  account  ", amount: 0, rate: 0 })).name, "Savings account");
  for (const amount of [-1, NaN, Infinity, true, null, "100", 1e12 + 1, 1.005]) assert.throws(() => cashInput(holding(1, { amount })), /amount/);
  for (const rate of [-1, NaN, Infinity, null, true, "4", 100.1, 4.12345]) assert.throws(() => cashInput(holding(1, { rate })), /interest/);
  assert.throws(() => cashInput(holding(1, { account: "other" })), /account/); assert.throws(() => cashInput(holding(1, { id: "../bank" })), /valid/);
  const rows = [holding(), holding(2, { amount: 8000, rate: 0 })], before = structuredClone(rows);
  assert.deepEqual(cashTotals(rows), { amount: 20000, annual: 480, monthly: 40 }); assert.deepEqual(rows, before, "forecast never accrues into the balance");
  assert.deepEqual(cashTotals(null), { amount: 0, annual: 0, monthly: 0 }); assert.equal(cashTotals([holding(1, { amount: -1 })]).amount, 0);
  const series = cashSeries(12000, "1y", 1800000000); assert.equal(series.T[1] - series.T[0], 365 * 86400); assert.deepEqual(series.vals, [12000, 12000]);
});

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
test("a pending cash read cannot overwrite an edit; a late account response cannot cross sign-ins", async () => {
  let owner = "ann:1"; const state = { cash: [] }, read = deferred(), write = deferred(); let changes = 0;
  const store = createCashStore({ state, owner: () => owner, keep() {}, changed() { changes++; }, api: { cash: () => read.promise, putCash: () => write.promise } });
  const syncing = store.sync(), saving = store.save(holding()); await Promise.resolve();
  write.resolve({ cash: [holding()] }); assert.equal(await saving, true);
  read.resolve({ cash: [] }); assert.equal(await syncing, false); assert.equal(state.cash[0].amount, 12000); assert.equal(changes, 1);
  const late = deferred(), other = createCashStore({ state, owner: () => owner, keep() { assert.fail("old account must not cache"); }, changed() { assert.fail("old account must not draw"); }, api: { putCash: () => late.promise } });
  const old = other.save(holding()); await Promise.resolve(); owner = "bo:2"; state.cash = [];
  late.resolve({ cash: [holding()] }); assert.equal(await old, false); assert.deepEqual(state.cash, []);
});
test("cash edits are serialized, and queued edits are dropped when the account changes", async () => {
  let owner = "ann", calls = []; const first = deferred(), state = { cash: [] };
  const store = createCashStore({ state, owner: () => owner, keep() {}, changed() {}, api: { putCash: (b) => { calls.push(b.amount); return first.promise; } } });
  const a = store.save(holding()), b = store.save(holding(2)); await Promise.resolve(); assert.deepEqual(calls, [12000]);
  owner = "bo"; first.resolve({ cash: [holding()] }); assert.equal(await a, false); assert.equal(await b, false); assert.equal(calls.length, 1);
});

const sql = new DatabaseSync(":memory:"), val = (a) => a.map((x) => x === undefined ? null : typeof x === "boolean" ? +x : x);
const stmt = (q, args = []) => ({ bind: (...a) => stmt(q, a), first: async () => sql.prepare(q).get(...val(args)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(args)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(args)).changes) } }) });
const env = { DB: { prepare: (q) => stmt(q), batch: async (list) => { sql.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } } };
await db(env); await mkdb(env);
const tokens = {};
for (const user of ["ann", "bo"]) {
  sql.prepare("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?, ?, ?, ?, '{}', 's', 'p', 'v', 9, 0, ?)").run(user, user, user, user + "@example.com", Date.now());
  const req = new Request("https://finance.inflite.ai/", { headers: { Origin: "https://finance.inflite.ai" } }), token = await issueSession(env, user, req);
  const response = await withSession(new Response("ok"), req, env, hex(await sha256(token)), true);
  tokens[user] = response.headers.get("set-cookie").split(";")[0];
}
const request = async (method, user, body, { origin = "https://finance.inflite.ai", host = "finance.inflite.ai", query = "" } = {}) => {
  const headers = { "Content-Type": "application/json" }; if (user) headers.Cookie = tokens[user]; if (origin) headers.Origin = origin;
  return onRequest({ request: new Request(`https://${host}/api/markets/cash${query}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, params: { path: ["cash"] } });
};
test("cash API is signed in, same-origin, private and scoped to each account", async () => {
  assert.equal((await request("GET", null)).status, 401);
  for (const origin of [null, "https://weather.inflite.ai", "https://example.com"]) assert.equal((await request("PUT", "ann", holding(), { origin })).status, 403);
  assert.equal((await request("PUT", "ann", holding(), { host: "inflite.ai" })).status, 404);
  let response = await request("PUT", "ann", holding(1, { name: '<img src=x onerror="alert(1)">' })); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  let rows = (await response.json()).cash; assert.equal(rows.length, 1); assert.equal(rows[0].amount, 12000);
  response = await request("GET", "bo"); assert.deepEqual((await response.json()).cash, []);
  await request("PUT", "bo", holding(1, { amount: 50, user_id: "ann" })); assert.equal((await cashHoldings(env, "ann"))[0].amount, 12000, "body cannot select another user");
  assert.equal((await cashHoldings(env, "bo"))[0].amount, 50);
  response = await request("PUT", "ann", holding(2, { amount: -1 })); assert.equal(response.status, 400); assert.equal((await response.json()).field, "amount");
});
test("cash retries are idempotent; stale changes and deleted holdings cannot overwrite newer data", async () => {
  let rows = await putCash(env, "ann", holding(2)), row = rows.find((x) => x.id === id(2));
  rows = await putCash(env, "ann", holding(2)); assert.equal(rows.filter((x) => x.id === id(2)).length, 1);
  const updated = { ...row, amount: 10000, rate: 0 };
  rows = await putCash(env, "ann", updated); const next = rows.find((x) => x.id === id(2)); assert.ok(next.updated > row.updated); assert.equal(next.rate, 0);
  assert.equal((await putCash(env, "ann", updated)).find((x) => x.id === id(2)).amount, 10000, "retry after a lost response remains safe");
  await assert.rejects(putCash(env, "ann", { ...row, amount: 9 }), (e) => e.status === 409);
  await assert.rejects(dropCash(env, "bo", id(2)), (e) => e.status === 404);
  await dropCash(env, "ann", id(2)); await assert.rejects(putCash(env, "ann", { ...next, amount: 11 }), (e) => e.status === 409);
});
test("cash limits are atomic, existing balances remain editable at the limit, and deleting account data removes cash only for that user", async () => {
  await Promise.all(Array.from({ length: MAX_CASH }, (_, i) => putCash(env, "limit", holding(i + 100))));
  await assert.rejects(putCash(env, "limit", holding(500)), (e) => e.status === 400);
  const rows = await cashHoldings(env, "limit"); assert.equal(rows.length, MAX_CASH);
  assert.equal((await putCash(env, "limit", { ...rows[0], amount: 0 })).find((x) => x.id === rows[0].id).amount, 0);
  await dropMarkets(env, "ann"); assert.deepEqual(await cashHoldings(env, "ann"), []); assert.equal((await cashHoldings(env, "bo"))[0].amount, 50);
});
