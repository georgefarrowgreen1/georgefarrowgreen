// Bug reports (functions/_bugs.js): each issue its own code, the same every time it happens; a report kept from the
// window (POST /api/bugs), with nothing of anyone's in it; the new ones handed to the GitHub Action (pending) and marked
// filed, at the site's workers.dev address with the scheduled jobs' key alone; a server error filed under its code, and
// the API's answer carrying it. And the window's own code-maker, in the shared menu, the same as the server's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { issueCode, scrub, sameness, bugsRoute, fileServerBug } from "../../../functions/_bugs.js";
import { logError } from "../../../functions/_pigeon.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => { const p = s.prepare(sql); if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } }; const r = p.run(...val(args)); return { results: [], success: true, meta: { changes: Number(r.changes) } }; };
  const st = (sql, args = []) => ({ bind: (...a) => st(sql, a), first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args), raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)), now: () => exec(sql, args) });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const DB = d1(), TICK = "inflite-apps.example.workers.dev";
const env = { DB, PIGEON_TICK_SECRET: "tick-secret", TICK_HOST: TICK };
const ctx = (method, url, body, headers = {}) => ({ env, request: new Request(url, { method, body, headers: { "CF-Connecting-IP": "203.0.113.9", ...headers } }) });
const call = async (method, url, body, headers) => { const r = await bugsRoute(ctx(method, url, body, headers), new URL(url)); return { status: r.status, json: await r.json() }; };

test("one code for one issue: the same whatever differs from one time to the next, another for another", () => {
  const a = issueCode("chat", "crash", "TypeError: Cannot read properties of undefined (reading 'x') at 12", "/pigeon/app.js:120");
  assert.match(a, /^IF-C-[0-9A-HJKMNP-TV-Z]{5}$/);
  assert.equal(issueCode("chat", "crash", "TypeError: Cannot read properties of undefined (reading 'y') at 99", "/pigeon/app.js:121"), a, "numbers, quoted words and the line aside");
  assert.notEqual(issueCode("chat", "crash", "TypeError: x is not a function", "/pigeon/app.js:120"), a);
  assert.notEqual(issueCode("weather", "crash", "TypeError: Cannot read properties of undefined (reading 'x')", "/pigeon/app.js:120").slice(3, 4), "C");
  assert.equal(sameness("Failed 404 for https://x.test/a?b=1 id 0123456789abcdef"), "failed # for <url> id #");
});

test("nothing of anyone's: emails, long keys and any address's query taken out", () => {
  assert.equal(scrub("from ann@example.com: token AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA at https://chat.inflite.ai/x?code=1#k"), "from <email>: token <long> at https://chat.inflite.ai/x");
});

test("a report from the window: kept under its code, the page's path alone, a few an hour from one address", async () => {
  const r = await call("POST", "https://chat.inflite.ai/api/bugs", JSON.stringify({ code: "IF-C-ABCDE", app: "chat", kind: "crash", version: "1.79", words: "TypeError: x of bob@example.com", where: "/pigeon/app.js:12", path: "/chats/x?with=1#secret", device: "iPhone · Safari 18", note: "Tapped send" }));
  assert.equal(r.status, 200); assert.equal(r.json.code, "IF-C-ABCDE");
  assert.match(r.json.status, /^https:\/\/status\.[^/]+\/#IF-C-ABCDE$/, "and where it stands, for the window's link");
  const row = DB.sql.prepare("SELECT * FROM pg_bugs WHERE id = ?").get(r.json.id);
  assert.equal(row.path, "/chats/x"); assert.equal(row.words, "TypeError: x of <email>"); assert.equal(row.note, "Tapped send"); assert.equal(row.filed_at, null);
  assert.equal((await call("POST", "https://chat.inflite.ai/api/bugs", JSON.stringify({ app: "nope" }))).status, 400, "an app it knows");
  assert.equal((await call("POST", "https://chat.inflite.ai/api/bugs", JSON.stringify({ app: "server", words: "x" }))).status, 400, "never the server's own, from outside");
  const made = await call("POST", "https://weather.inflite.ai/api/bugs", JSON.stringify({ code: "not a code", app: "weather", words: "RangeError: bad", where: "/weather/app.js:5" }));
  assert.equal(made.json.code, issueCode("weather", "crash", "RangeError: bad", "/weather/app.js:5"), "a code it can't read: worked out here");
  let last; for (let i = 0; i < 12; i++) last = await call("POST", "https://weather.inflite.ai/api/bugs", JSON.stringify({ app: "weather", words: "x" }), { "CF-Connecting-IP": "198.51.100.7" });
  assert.equal(last.status, 200);
  assert.equal((await call("POST", "https://weather.inflite.ai/api/bugs", JSON.stringify({ app: "weather", words: "x" }), { "CF-Connecting-IP": "198.51.100.7" })).status, 429);
  assert.equal((await call("POST", "https://weather.inflite.ai/api/bugs", "x".repeat(13000))).status, 413);
  assert.equal((await call("GET", "https://weather.inflite.ai/api/bugs")).status, 404);
  assert.equal(await bugsRoute(ctx("GET", "https://chat.inflite.ai/api/other"), new URL("https://chat.inflite.ai/api/other")), null, "anything else isn't its");
});

test("the new ones for the GitHub Action, then filed: its address and its key alone", async () => {
  assert.equal((await call("GET", "https://chat.inflite.ai/api/bugs/pending", undefined, { Authorization: "Bearer tick-secret" })).status, 404, "not at an app's address");
  assert.equal((await call("GET", `https://${TICK}/api/bugs/pending`, undefined, { Authorization: "Bearer wrong" })).status, 401);
  const p = await call("GET", `https://${TICK}/api/bugs/pending`, undefined, { Authorization: "Bearer tick-secret" });
  assert.equal(p.status, 200); assert.ok(p.json.bugs.length >= 2);
  const f = await call("POST", `https://${TICK}/api/bugs/filed`, JSON.stringify({ ids: p.json.bugs.map((b) => b.id), issue: 42 }), { Authorization: "Bearer tick-secret" });
  assert.equal(f.json.filed, p.json.bugs.length);
  assert.equal((await call("GET", `https://${TICK}/api/bugs/pending`, undefined, { Authorization: "Bearer tick-secret" })).json.bugs.length, 0);
  assert.equal(DB.sql.prepare("SELECT issue FROM pg_bugs WHERE code = 'IF-C-ABCDE'").get().issue, 42);
});

test("a server error: filed under its code, which logError hands back for the API's answer", async () => {
  const e = new Error("D1_ERROR: no such column: x at 3");
  const code = await fileServerBug(env, "pigeon api", e);
  assert.match(code, /^IF-S-[0-9A-Z]{5}$/);
  assert.equal(await logError(env, "pigeon api", new Error("D1_ERROR: no such column: x at 9")), code, "the same issue, the same code");
  assert.ok(DB.sql.prepare("SELECT COUNT(*) AS n FROM pg_bugs WHERE code = ? AND app = 'server'").get(code).n >= 2);
  for (const f of ["account", "fitness", "markets", "pigeon", "today", "weather"]) assert.match(readFileSync(new URL(`../../../functions/api/${f}/[[path]].js`, import.meta.url), "utf8"), /const code = await logError\([^)]*\);\n\s*return json\(\{ error: "[^"]+", code \}, 500\);/, f);
});

test("the window's code-maker, in the shared menu, works it out as the server does", async () => {
  const menu = readFileSync(new URL("../../inflite/menu.js", import.meta.url), "utf8");
  const src = /const same = (\(s\) => [^\n]+\n[^\n]+);\n\s*const fnv = ([^\n]+);\n\s*const codeOf = (\(app, kind, words, where = ""\) => \{[\s\S]*?\n\s*\});/.exec(menu);
  assert.ok(src, "found in menu.js");
  const LETTER = { chat: "C", weather: "W" }, ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const letterOf = (a) => LETTER[a] || String(a || "X")[0].toUpperCase();
  const codeOf = new Function("LETTER", "ALPHA", "letterOf", `const same = ${src[1]}; const fnv = ${src[2]}; return ${src[3]};`)(LETTER, ALPHA, letterOf);
  for (const [w, at] of [["TypeError: a is undefined", "/pigeon/app.js:3"], ["RangeError: 12 too big 'x'", "/weather/app.js:40"]])
    assert.equal(codeOf("chat", "crash", w, at), issueCode("chat", "crash", w, at));
  assert.match(menu, /label: "Report a Problem"/, "Report a Problem in every app's menu");
});
