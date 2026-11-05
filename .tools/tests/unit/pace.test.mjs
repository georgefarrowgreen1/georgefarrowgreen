// Everyday ceilings counted where Cloudflare serves the request (the Workers rate limiter, functions/_pigeon.js pace),
// not by a write to the main database first: the limiter chosen by the ceiling's own rate (the first at four times it a
// minute or more), 429 when it says no, let through when it doesn't answer, and the database's own count (limit) where
// there's no limiter. The security counts, the daily ones and the allowances of others we're held to never go that way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { pace, PACES } from "../../../functions/_pigeon.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const limiter = (answer) => { const asked = []; return { asked, limit: async ({ key }) => { asked.push(key); if (answer instanceof Error) throw answer; return { success: answer }; } }; };
const envWith = (answer) => { const e = {}; for (const n of PACES) e[`RL${n}`] = limiter(answer); return e; };

test("the limiter for each ceiling: the first at four times its rate a minute or more", async () => {
  const cases = [[600, 3600e3, 40], [120, 3600e3, 10], [150, 15 * 60e3, 40], [60, 15 * 60e3, 20], [900, 3600e3, 80], [1500, 3600e3, 160], [2000, 3600e3, 160], [6000, 60e3, 320]];
  for (const [max, win, want] of cases) {
    const env = envWith(true);
    await pace(env, "k:1", max, win);
    const used = PACES.filter((n) => env[`RL${n}`].asked.length);
    assert.deepEqual(used, [want], `${max} in ${win / 60e3} min → RL${want}`);
    assert.deepEqual(env[`RL${want}`].asked, ["k:1"], "asked by the ceiling's own key");
  }
});

test("over it: 429; the limiter not answering: let through", async () => {
  await assert.rejects(pace(envWith(false), "today:1", 600, 3600e3), (e) => e.status === 429 && /Too many/.test(e.message));
  await pace(envWith(new Error("down")), "today:1", 600, 3600e3);
});

test("no limiter (the tests, an older copy): the database's own count, as before", async () => {
  let asked = null;
  const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ first: async () => { asked = { sql, a }; return { count: 1, reset_at: Date.now() + 1000 }; } }) }) } };
  await pace(env, "prefs:1", 120, 3600e3).catch(() => {});
  assert.ok(!asked || /pg_limits/.test(asked.sql), "limit()'s statement, if the database was set up here");
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
