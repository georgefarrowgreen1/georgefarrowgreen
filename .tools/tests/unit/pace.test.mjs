// Everyday ceilings (functions/_pigeon.js pace): the ceiling as written the most ever let through, never more. The
// Workers rate limiter counts a minute at a time where Cloudflare serves the request, with nothing written: the one at
// four times the ceiling's rate a minute or more turns away hammering first (429); where there's one at half its rate or
// under, it lets the everyday asks through uncounted, and past it the database's count (limit) takes the rest, up to the
// ceiling less what that one could have let through; with none that slow, the database's count alone. Let through by a
// limiter that doesn't answer; the database's count where there's no limiter. The security counts, the daily ones and
// the allowances of others we're held to never go that way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pace, PACES } from "../../../functions/_pigeon.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const limiter = (answer) => { const asked = []; return { asked, limit: async ({ key }) => { asked.push(key); if (answer instanceof Error) throw answer; return { success: answer }; } }; };
const envWith = (answer, more = {}) => { const e = { ...more }; for (const n of PACES) e[`RL${n}`] = limiter(answer); return e; };
function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => { const p = s.prepare(sql); if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } }; const r = p.run(...val(args)); return { results: [], success: true, meta: { changes: Number(r.changes) } }; };
  const st = (sql, args = []) => ({ bind: (...a) => st(sql, a), first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args), raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)), now: () => exec(sql, args) });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } }, exec: async (q) => s.exec(q) };
}
const DB = d1();
const counted = (key) => { try { return DB.sql.prepare("SELECT count FROM pg_limits WHERE key = ?").get(key)?.count ?? 0; } catch (_) { return 0; } };
// (each RL<n> as Cloudflare's: n a minute for each key, the minute moved on by hand)
const minuteLimiters = () => {
  const clock = { m: 0 }, env = { DB, clock };
  for (const n of PACES) { const seen = new Map(); env[`RL${n}`] = { limit: async ({ key }) => { const k = `${clock.m}|${key}`; seen.set(k, (seen.get(k) || 0) + 1); return { success: seen.get(k) <= n }; } }; }
  return env;
};

test("hammering turned away first: the limiter at four times the ceiling's rate a minute or more, by the ceiling's own key", async () => {
  const cases = [[600, 3600e3, 40], [120, 3600e3, 10], [150, 15 * 60e3, 40], [60, 15 * 60e3, 20], [900, 3600e3, 80], [1500, 3600e3, 160], [2000, 3600e3, 160], [6000, 60e3, 320]];
  for (const [max, win, want] of cases) {
    const env = envWith(false, { DB });
    await assert.rejects(pace(env, `k:${max}`, max, win), (e) => e.status === 429 && /Too many/.test(e.message));
    assert.deepEqual(PACES.filter((n) => env[`RL${n}`].asked.length), [want], `${max} in ${win / 60e3} min → RL${want}`);
    assert.deepEqual(env[`RL${want}`].asked, [`k:${max}`]);
    assert.equal(counted(`k:${max}`), 0, "nothing written for it");
  }
});

test("the busiest ceilings: a limiter at half the rate or under lets the everyday asks through with nothing written", async () => {
  for (const [max, win, burst, quick] of [[1200, 3600e3, 80, 10], [1500, 3600e3, 160, 10], [2000, 3600e3, 160, 10], [6000, 60e3, 320, 160]]) {
    const env = envWith(true, { DB });
    await pace(env, `q:${max}`, max, win);
    assert.deepEqual(PACES.filter((n) => env[`RL${n}`].asked.length), [quick, burst].sort((a, b) => a - b), `${max} in ${win / 60e3} min → RL${burst}, then RL${quick}`);
    assert.equal(counted(`q:${max}`), 0, "nothing written");
  }
});

test("the rest: counted by the database, whatever the minute's limiter allowed", async () => {
  const env = envWith(true, { DB });
  await pace(env, "today:c1", 600, 3600e3);
  assert.equal(counted("today:c1"), 1, "600 an hour: no limiter at half its rate, so counted");
  // (the busy one's quick limiter saying no: past it, counted, up to the ceiling less the 600 it could have let through)
  const busy = envWith(true, { DB }); busy.RL10 = limiter(false);
  for (let i = 0; i < 900; i++) await pace(busy, "giff:c1", 1500, 3600e3);
  await assert.rejects(pace(busy, "giff:c1", 1500, 3600e3), (e) => e.status === 429);
});

test("never more than written: each everyday ceiling, asked for as fast as its burst allows for a whole window", async () => {
  // (the review's cases: a friend request 40 an hour had been 600; a pigeon 120, 600; a message 600, 2400; a reaction 240,
  // 1200; a friend's state 400, 2400; a speed number 40 a quarter of an hour, 300)
  for (const [key, max, win] of [["friend:w", 40, 3600e3], ["send:w", 120, 3600e3], ["msg:w", 600, 3600e3], ["react:w", 240, 3600e3], ["fstat:w", 400, 3600e3],
    ["vitals:w", 40, 15 * 60e3], ["recall:w", 30, 3600e3], ["giff:w", 1500, 3600e3], ["todayav:w", 1200, 3600e3], ["fxstravahook:w", 2000, 3600e3]]) {
    const env = minuteLimiters(), wm = win / 60e3;
    let ok = 0;
    for (env.clock.m = 0; env.clock.m < wm; env.clock.m++) for (let i = 0; i < 400; i++) { try { await pace(env, key, max, win); ok++; } catch (e) { if (e.status !== 429) throw e; } }
    assert.ok(ok <= max, `${key}: ${ok} let through, written ${max}`);
    assert.ok(ok >= max / 2, `${key}: and the most of it there to have (${ok})`);
  }
});

test("a burst within the ceiling: fine (twenty GIFs at once, a quick run of messages)", async () => {
  const env = minuteLimiters();
  for (let i = 0; i < 24; i++) await pace(env, "giff:b", 1500, 3600e3);
  for (let i = 0; i < 30; i++) await pace(env, "msg:b", 600, 3600e3);
});

test("a limiter not answering: passed by, the database's count instead", async () => {
  await pace(envWith(new Error("down"), { DB }), "today:down", 600, 3600e3);
  assert.equal(counted("today:down"), 1);
});

test("no limiter (the tests, an older copy): the database's own count, as before", async () => {
  await pace({ DB }, "prefs:none", 120, 3600e3);
  assert.equal(counted("prefs:none"), 1);
});

test("the Worker has each limiter, a minute each, by its own namespace", () => {
  const conf = readFileSync(ROOT + "wrangler.worker.jsonc", "utf8");
  const rl = [...conf.matchAll(/\{ "name": "RL(\d+)", "namespace_id": "(\d+)", "simple": \{ "limit": (\d+), "period": (\d+) \} \}/g)];
  assert.deepEqual(rl.map((m) => Number(m[1])), PACES);
  for (const m of rl) { assert.equal(m[1], m[3], `RL${m[1]} allows ${m[1]}`); assert.equal(m[4], "60"); }
  assert.equal(new Set(rl.map((m) => m[2])).size, PACES.length, "each its own namespace");
});

test("security counts, daily ones, and others' allowances keep the database's one count (limit), never pace", () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = d + "/" + f; if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } };
  walk(ROOT + "functions");
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const paced = [...src.matchAll(/await pace\(\w+, (?:["`])([a-zA-Z]+)[:"`]/g)].map((m) => m[1]);
  for (const k of ["login", "loginip", "loginacct", "pklogin", "reauth", "pwupgrade", "pwchange", "pwned", "confirm", "confirmsend", "emailchange", "resetreq", "resetmail",
    "resetcheck", "resetdo", "signup", "invitecheck", "handoff", "handback", "qrstart", "qrbad", "qrlook", "qranswer", "fxgarmin", "fxgarminall", "fxstravago", "fxstravaall",
    "fxstravanow", "fxhealth", "fxhealthbad", "livewx", "windpoints", "contact", "allchats", "export", "fxexport", "bugs", "avatar", "poster"])
    assert.ok(!paced.includes(k), `${k}: the database's count`);
  assert.ok(paced.includes("today") && paced.includes("prefs") && paced.includes("pkopt") && paced.includes("salt"), "and the everyday ones paced");
});
