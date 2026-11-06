// Markets' prices and years (functions/api/markets/[[path]].js GET quotes and GET years): each symbol a request has to
// ask Yahoo for (not kept, or kept too long) counted to the account, so a few dozen symbols no one else asks for in each
// request, at the routes' own pace, can't have Yahoo asked thousands of times a minute. Past it: what's kept, or nothing,
// never a refusal. Against a real database (node:sqlite as D1), Yahoo stood in for, and the per-minute limiter
// (env.RL320, as Cloudflare's: functions/_pigeon.js pace) counted here.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { db, hex, sha256 } from "../../../functions/_pigeon.js";
import { onRequest } from "../../../functions/api/markets/[[path]].js";

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
// (the per-minute limiter: so many for each key, as Cloudflare's allows)
const counts = new Map(), RL320 = { limit: async ({ key }) => { const n = (counts.get(key) || 0) + 1; counts.set(key, n); return { success: n <= 320 }; } };
const env = { DB: d1(), MARKETS_HOST: "markets.test", MARKETS_DATA: "http://yahoo.test", RL320 };
await db(env);
const run = (sql, ...a) => env.DB.sql.prepare(sql).run(...a), t0 = Date.now();
async function signIn(user) {
  run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?2, ?2)", user, t0);
  const token = randomBytes(24).toString("base64url");
  run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash) VALUES (?, ?, ?, ?, ?, ?)", `s-${user}`, user, t0, t0, t0, hex(await sha256(token)));
  return `account=${token}`;
}
const ann = await signIn("ann"), ben = await signIn("ben");
let asked = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.origin !== "http://yahoo.test") return new Response("{}", { status: 404 });
  const symbol = decodeURIComponent(u.pathname.split("/").pop());
  // (the made-up symbols' asks counted; a currency's rate, one for every price in it, isn't one of them)
  if (symbol.startsWith("Z")) asked++;
  return Response.json({ chart: { result: [{ meta: { currency: "USD", symbol, regularMarketPrice: 10, previousClose: 9 }, timestamp: [1, 2], indicators: { quote: [{ close: [9, 10] }] } }] } });
};
after(() => { globalThis.fetch = realFetch; });
const call = async (path, cookie) => {
  const request = new Request(`http://markets.test/api/markets/${path}`, { headers: { Cookie: cookie } });
  const res = await onRequest({ request, env, params: { path: path.split("?")[0].split("/") } });
  return { s: res.status, j: await res.json() };
};
let n = 0;
const fresh = (k) => Array.from({ length: k }, () => `Z${(n++).toString(36).toUpperCase()}`).join(",");

test("symbols no one else asks for, 64 a request: Yahoo asked for no more than the account's share; the answers still come", async () => {
  const quotes = [];
  for (let i = 0; i < 10; i++) quotes.push(await call(`quotes?s=${fresh(64)}`, ann));
  assert.ok(quotes.every((r) => r.s === 200), "every request answered");
  assert.equal(Object.keys(quotes[0].j.quotes).length, 64, "the first in full");
  assert.ok(asked <= 320, `Yahoo asked ${asked} times for 640 symbols`);
  // (years: each symbol two asks, its year and its dividends, out of the same share)
  const before = asked, years = await call(`years?s=${fresh(64)}`, ann);
  assert.equal(years.s, 200); assert.equal(asked, before, "the share spent: nothing more asked");
  // another account has its own
  const b = await call(`quotes?s=${fresh(64)}`, ben);
  assert.equal(Object.keys(b.j.quotes).length, 64);
});
