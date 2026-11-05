// Signing in to an app already signed in to the site: auth.<site>/go (functions/_signinfast.js) sends you straight back
// with the app's code, no page in between; and on to the page, with everything the app said after its #, whenever
// that isn't so (signed out, a sign-in handed to this browser, Chat or Mail, a word or a way back not as an app sends
// it). The code it makes is the page's own (functions/_handback.js): good once, only with the app's word, and swapped
// by the app as ever. Run against Node's SQLite made to look like D1 (as handbackmove.test.mjs has it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession, sha256, hex, b64url } from "../../../functions/_pigeon.js";
import { fastSignIn, backOf } from "../../../functions/_signinfast.js";
import { takeHandback } from "../../../functions/_handback.js";
import { accountHost } from "../../../functions/_acctapp.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => {
    const p = s.prepare(sql);
    if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } };
    const r = p.run(...val(args));
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const st = (sql, args = []) => ({
    sql, args, bind: (...a) => st(sql, a),
    first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args),
    raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, prepare: (q) => st(q),
    async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const said = console.error;
console.error = () => {};
test.after(() => { console.error = said; });

const env = { DB: d1(), AUTH_HOST: "auth.inflite.ai" };
const S = env.DB.sql;
await db(env);
const put = (table, row) => S.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...Object.values(row));
const ANN = "00000000-0000-4000-8000-00000000a001";
put("pg_users", { id: ANN, handle: "ann", name: "Ann Smith", email: "ann@example.com", pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0 });

// the site's sign-in (the cookie the sign-in page gives, for the whole site)
async function siteSignIn({ handed = false } = {}) {
  const token = await issueSession(env, ANN, new Request("https://auth.inflite.ai/"));
  const cookie = b64url(crypto.getRandomValues(new Uint8Array(32)));
  S.prepare("UPDATE pg_sessions SET site_hash = ?, handed = ? WHERE hash = ?").run(hex(await sha256(cookie)), handed ? 1 : null, hex(await sha256(token)));
  return cookie;
}
const word = async () => { const verifier = b64url(crypto.getRandomValues(new Uint8Array(32))); return { verifier, ask: b64url(await sha256(verifier)) }; };
const go = (params, cookie) => {
  const url = new URL(`https://auth.inflite.ai/go?${new URLSearchParams(params)}`);
  return fastSignIn({ env, request: new Request(url, { headers: { "CF-Connecting-IP": "203.0.113.9", ...(cookie ? { Cookie: `__Secure-account=${cookie}` } : {}) } }) }, url);
};
const hashOf = (r) => new URLSearchParams(new URL(r.headers.get("Location")).hash.slice(1));

test("signed in: straight back to the app with its code, which the app swaps with its word (and only once)", async () => {
  const cookie = await siteSignIn(), w = await word();
  for (const [app, back] of [["today", "https://inflite.ai/"], ["weather", "https://weather.inflite.ai/"], ["fitness", "https://fitness.inflite.ai/"], ["markets", "https://finance.inflite.ai/"]]) {
    const r = await go({ signin: app, ask: w.ask, back }, cookie);
    assert.equal(r.status, 302, app);
    const to = new URL(r.headers.get("Location"));
    assert.equal(to.origin + to.pathname, back, `${app}: back to the app itself`);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal(r.headers.get("Referrer-Policy"), "no-referrer");
    const h = hashOf(r);
    assert.match(h.get("signin"), /^[A-Za-z0-9_-]{20,64}$/, `${app}: a code`);
    assert.equal(h.get("f"), "A", `${app}: the initial to draw from the first frame`);
    const req = new Request(back, { headers: { "CF-Connecting-IP": "203.0.113.9" } });
    await assert.rejects(takeHandback(env, req, app, { code: h.get("signin"), verifier: "x".repeat(43) }), /run out/, `${app}: not without the app's word`);
  }
  const r = await go({ signin: "today", ask: w.ask, back: "https://inflite.ai/" }, cookie), code = hashOf(r).get("signin");
  const req = new Request("https://inflite.ai/", { headers: { "CF-Connecting-IP": "203.0.113.9" } });
  const took = await takeHandback(env, req, "today", { code, verifier: w.verifier });
  assert.equal(took.u.id, ANN, "the app's word takes it");
  await assert.rejects(takeHandback(env, req, "today", { code, verifier: w.verifier }), /run out/, "good once");
});

test("a browser's tab, whose sign-in is the site's: just back, nothing to swap (Weather, Fitness, Markets)", async () => {
  const cookie = await siteSignIn(), w = await word();
  const r = await go({ signin: "fitness", ask: w.ask, back: "https://fitness.inflite.ai/", jar: "shared" }, cookie);
  assert.equal(r.headers.get("Location"), "https://fitness.inflite.ai/#signin=shared&f=A");
  // (Today keeps its own trip, a code, even if asked so)
  assert.match(hashOf(await go({ signin: "today", ask: w.ask, back: "https://inflite.ai/", jar: "shared" }, cookie)).get("signin"), /^[A-Za-z0-9_-]{20,}$/);
});

test("anything else: on to the sign-in page, with all the app said after its # (signin= first)", async () => {
  const cookie = await siteSignIn(), handed = await siteSignIn({ handed: true }), w = await word();
  const page = (r) => { assert.equal(r.status, 302); const to = new URL(r.headers.get("Location")); assert.equal(to.origin + to.pathname, "https://auth.inflite.ai/"); return to.hash; };
  // signed out, or a sign-in an app handed to this browser (which goes on to nothing until it's shown it's you)
  const out = new URLSearchParams(page(await go({ back: "https://inflite.ai/", signin: "today", ask: w.ask })).slice(1));
  assert.deepEqual([...out.keys()], ["signin", "back", "ask"], "signed out: the page, signin= put first");
  assert.equal(out.get("ask"), w.ask);
  assert.match(page(await go({ signin: "today", ask: w.ask, back: "https://inflite.ai/" }, handed)), /^#signin=today&/);
  // Chat (its key) and Mail (a fresh sign-in) are the page's; and making an account
  assert.match(page(await go({ signin: "inflight", ask: w.ask, back: "https://chat.inflite.ai/", seal: "s".repeat(87) }, cookie)), /^#signin=inflight&/);
  assert.match(page(await go({ signin: "mail", ask: w.ask, back: "https://email.inflite.ai/" }, cookie)), /^#signin=mail&/);
  assert.match(page(await go({ join: "today", ask: w.ask, back: "https://inflite.ai/" }, cookie)), /^#join=today&/);
  // no word, or a way back that isn't the app's own: the page (which says so), never a code sent elsewhere
  assert.match(page(await go({ signin: "today", back: "https://inflite.ai/" }, cookie)), /^#signin=today/);
  for (const back of ["https://evil.example/", "https://weather.inflite.ai/", "http://inflite.ai/", "https://inflite.ai/x", "https://inflite.ai/?a=1", "https://inflite.ai:444/", "https://u:p@inflite.ai/"])
    assert.match(page(await go({ signin: "today", ask: w.ask, back }, cookie)), /^#signin=today/, back);
});

test("backOf: each app's own address on this site, as the page's backFor has it", () => {
  const at = new URL("https://auth.inflite.ai/go"), local = new URL("http://auth.ifl.test:8788/go");
  assert.equal(backOf(at, "today", "https://next.inflite.ai/"), "https://next.inflite.ai/");
  assert.equal(backOf(at, "markets", "https://finance.inflite.ai/"), "https://finance.inflite.ai/");
  assert.equal(backOf(at, "markets", "https://markets.inflite.ai/"), null);
  assert.equal(backOf(local, "weather", "http://weather.ifl.test:8788/"), "http://weather.ifl.test:8788/");
  assert.equal(backOf(local, "weather", "http://weather.ifl.test:8789/"), null);
  assert.equal(backOf(at, "inflight", "https://chat.inflite.ai/"), null);
  assert.equal(backOf(at, "today", "not a url"), null);
});

test("only at the sign-in page's address: the account's page has no /go", async () => {
  const ctx = (host) => ({ env, request: new Request(`https://${host}/go?signin=today`), next: () => new Response("next") });
  const r = await accountHost(ctx("auth.inflite.ai"), new URL("https://auth.inflite.ai/go?signin=today"));
  assert.equal(r.status, 302);
  assert.match(r.headers.get("Location"), /^https:\/\/auth\.inflite\.ai\/#signin=today$/);
});
