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

const CHAT = issueCode("chat", "crash", "TypeError: x of bob@example.com", "/pigeon/app.js:12");
test("a report from the window: kept under its code, the page's path alone, a few an hour from one address", async () => {
  const r = await call("POST", "https://chat.inflite.ai/api/bugs", JSON.stringify({ code: CHAT, app: "chat", kind: "crash", version: "1.79", words: "TypeError: x of bob@example.com", where: "/pigeon/app.js:12", path: "/chats/x?with=1#secret", device: "iPhone · Safari 18", note: "Tapped send" }));
  assert.equal(r.status, 200); assert.equal(r.json.code, CHAT);
  assert.equal(r.json.status, `https://status.inflite.ai/#${CHAT}`, "and where it stands, for the window's link");
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
  assert.equal(DB.sql.prepare("SELECT issue FROM pg_bugs WHERE code = ?").get(CHAT).issue, 42);
});

test("a server error: filed under its code, which logError hands back for the API's answer", async () => {
  const e = new Error("D1_ERROR: no such column: x at 3");
  const code = await fileServerBug(env, "pigeon api", e);
  assert.match(code, /^IF-S-[0-9A-Z]{5}$/);
  assert.equal(await logError(env, "pigeon api", new Error("D1_ERROR: no such column: x at 9")), code, "the same issue, the same code");
  assert.ok(DB.sql.prepare("SELECT COUNT(*) AS n FROM pg_bugs WHERE code = ? AND app = 'server'").get(code).n >= 2);
  for (const f of ["account", "fitness", "markets", "pigeon", "today", "weather"]) assert.match(readFileSync(new URL(`../../../functions/api/${f}/[[path]].js`, import.meta.url), "utf8"), /const code = await logError\([^)]*\);\n\s*return json\(\{ error: "[^"]+", code \}, 500\);/, f);
});

// (review: anyone can send anything, and a code opens an incident, says a fixed bug's back, and is commented on in its
// public issue; so the code's worked out here, and each report keeps where it came from as a key that can't be read back)
test("a report's code never taken on the sender's word: a crash's worked out, a server error's only where the site filed it", async () => {
  const ids = [], send = async (o, ip = "192.0.2.10") => { const r = await call("POST", "https://chat.inflite.ai/api/bugs", JSON.stringify({ app: "chat", ...o }), { "CF-Connecting-IP": ip }); if (ip === "192.0.2.10") ids.push(r.json.id); return r; };
  const crash = await send({ code: "IF-C-AAAAA", kind: "crash", words: "TypeError: y", where: "/pigeon/app.js:9" });
  assert.equal(crash.json.code, issueCode("chat", "crash", "TypeError: y", "/pigeon/app.js:9"), "a crash: the code from what went wrong and where, not the one sent");
  const fake = await send({ code: "IF-S-ZZZZZ", kind: "server", words: "Something went wrong on our side.", where: "/api/pigeon/sync" });
  assert.equal(fake.json.code, issueCode("chat", "server", "Something went wrong on our side.", "/api/pigeon/sync"), "a server code the site never filed: worked out instead");
  const real = await fileServerBug(env, "pigeon sync", new Error("D1_ERROR: busy"));
  assert.equal((await send({ code: real, kind: "server", words: "Something went wrong on our side.", where: "/api/pigeon/sync" })).json.code, real, "one it filed itself: kept, its burst and its issue");
  const mine = await send({ code: "IF-C-R7K2M", kind: "manual", note: "It froze" });
  assert.equal(mine.json.code, "IF-C-R7K2M", "reported by hand: the window's own code, as it showed it");
  for (const code of ["IF-C-R7K2M", crash.json.code, "IF-W-R1234", "IF-C-RABCDE"]) assert.match((await send({ code, kind: "manual", note: "x" })).json.code, /^IF-C-R[0-9A-Z]{4}$/);
  assert.notEqual((await send({ code: "IF-C-R7K2M", kind: "manual", note: "x" })).json.code, "IF-C-R7K2M", "never one another report has");
  const rows = ids.map((id) => DB.sql.prepare("SELECT reporter FROM pg_bugs WHERE id = ?").get(id).reporter);
  assert.ok(rows.length >= 4 && rows.every((k) => /^[0-9a-f]{16}$/.test(k) && k === rows[0]), "one network, one reporter's key, the address unreadable in it");
  const other = (await send({ kind: "crash", words: "z" }, "192.0.2.11")).json.id;
  assert.notEqual(DB.sql.prepare("SELECT reporter FROM pg_bugs WHERE id = ?").get(other).reporter, rows[0], "another network, another key");
});

test("a few an hour from each network (an IPv6 /48, not each /64), and a few hundred an hour in all", async () => {
  const send = (ip) => call("POST", "https://chat.inflite.ai/api/bugs", JSON.stringify({ app: "chat", words: "q" }), { "CF-Connecting-IP": ip });
  for (let i = 0; i < 12; i++) assert.equal((await send(`2001:db8:77:${i.toString(16)}::1`)).status, 200);
  assert.equal((await send("2001:db8:77:ff::9")).status, 429, "the thirteenth from the same /48, whatever its /64");
  assert.equal((await send("2001:db8:78::1")).status, 200, "another /48: its own");
  DB.sql.prepare("UPDATE pg_limits SET count = 300 WHERE key = 'bugs:all'").run();
  assert.equal((await send("198.51.100.200")).status, 429, "three hundred in an hour from everyone: no more till it's past");
  DB.sql.prepare("DELETE FROM pg_limits WHERE key = 'bugs:all'").run();
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
