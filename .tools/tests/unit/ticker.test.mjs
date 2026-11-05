// The site's scheduler (workers/ticker): every job asked for, each with its secret, and a run where one didn't go said
// to have failed (thrown), so it's seen in Cloudflare's dashboard and not only in a log no one's watching.
import { test } from "node:test";
import assert from "node:assert/strict";
import ticker, { probe } from "../../../workers/ticker/index.js";
import { STATUS_SERVICES } from "../../../functions/_statuslist.js";

// (one run, the site answering each job with answer(path), and each address status.inflite.ai checks with look(url):
// → the jobs asked for, the addresses looked at, what was reported, and what the run threw, or null)
async function run(env, answer, look = () => new Response('{"build":"1.50"}', { headers: { "Content-Type": "application/json" } })) {
  const asked = [], looked = [], real = globalThis.fetch, said = console.error;
  let reported = null;
  globalThis.fetch = async (url, o) => {
    const u = new URL(url), p = u.pathname;
    if (!o.headers.Authorization) { looked.push(u.href); return look(u.href); }
    if (p === "/api/status/report") { reported = JSON.parse(o.body); return answer(p); }
    asked.push(`${p} ${o.headers.Authorization}`); return answer(p);
  };
  console.error = () => {};
  try { const threw = await ticker.scheduled({}, env, { waitUntil() {} }).then(() => null, (e) => e); return { asked: asked.sort(), looked, reported, threw }; }
  finally { globalThis.fetch = real; console.error = said; }
}
const env = { INFLIGHT_TICK_SECRET: "chat", WEATHER_TICK_SECRET: "wx" };

test("the scheduler asks for every job, each with its secret, and a run where all go is fine", async () => {
  const r = await run(env, () => new Response("{}"));
  assert.deepEqual(r.asked, ["/api/fitness/garmin-tick Bearer chat", "/api/markets/tick Bearer chat", "/api/pigeon/notify-tick Bearer chat", "/api/today/tick Bearer chat", "/api/weather/tick Bearer wx"]);
  assert.equal(r.threw, null);
  // (Weather's own secret only if it has one: else Chat's)
  assert.ok((await run({ INFLIGHT_TICK_SECRET: "chat" }, () => new Response("{}"))).asked.includes("/api/weather/tick Bearer chat"));
});

test("a run where a job fails (refused, or the site not answering) is said to have failed, naming it", async () => {
  const one = await run(env, (p) => new Response("Not allowed.", { status: p === "/api/markets/tick" ? 401 : 200 }));
  assert.match(one.threw?.message || "", /\/api\/markets\/tick/);
  assert.doesNotMatch(one.threw.message, /weather|pigeon|fitness|today/);
  // (Today's morning notification refused: named, alone)
  const today = await run(env, (p) => new Response("Not allowed.", { status: p === "/api/today/tick" ? 401 : 200 }));
  assert.match(today.threw?.message || "", /\/api\/today\/tick/);
  assert.doesNotMatch(today.threw.message, /weather|pigeon|fitness|markets/);
  const down = await run(env, () => { throw new Error("The site isn't answering."); });
  for (const p of ["notify-tick", "weather/tick", "garmin-tick", "markets/tick", "today/tick"]) assert.match(down.threw?.message || "", new RegExp(p));
  // (no secret set: nothing asked, and each job said not to have gone)
  const none = await run({}, () => new Response("{}"));
  assert.equal(none.asked.length, 0);
  assert.match(none.threw?.message || "", /notify-tick.*weather\/tick.*garmin-tick.*markets\/tick.*today\/tick/);
});

test("status.inflite.ai's checks: every address looked at as a phone would, how each job went, all reported with the key", async () => {
  const r = await run(env, (p) => new Response("{}", { status: p === "/api/markets/tick" ? 500 : 200 }));
  assert.deepEqual(r.looked.sort(), STATUS_SERVICES.map((s) => s.probe).sort());
  assert.ok(!r.looked.some((u) => u.includes("fitting")), "not Fit Studio");
  assert.equal(r.reported.checks.length, STATUS_SERVICES.length);
  assert.ok(r.reported.checks.every((c) => c.s === "ok" && c.version === "1.50" && Number.isFinite(c.ms)));
  assert.deepEqual(r.reported.jobs.find((j) => j.path === "/api/markets/tick").ok, false);
  assert.equal(r.reported.jobs.filter((j) => j.ok).length, 4);
  // (the report refused: the run said to have failed, naming it)
  const no = await run(env, (p) => new Response("x", { status: p === "/api/status/report" ? 401 : 200 }));
  assert.match(no.threw?.message || "", /\/api\/status\/report/);
});

test("one address: fine, slow, down, not answering, or behind a bot check (which isn't down: it can't be told)", async () => {
  const real = globalThis.fetch, svc = { id: "chat", probe: "https://chat.inflite.ai/version" };
  const as = async (f) => { globalThis.fetch = f; try { return await probe(svc); } finally { globalThis.fetch = real; } };
  try {
    assert.equal((await as(async () => new Response('{"app":"chat","build":"1.79"}', { headers: { "Content-Type": "application/json" } }))).version, "1.79");
    assert.equal((await as(async () => new Response('{"v":"9","app":"1.62"}', { headers: { "Content-Type": "application/json" } }))).version, "1.62", "Mail's");
    const down = await as(async () => new Response("x", { status: 502 }));
    assert.equal(down.s, "down"); assert.equal(down.why, "HTTP 502");
    const gone = await as(async () => { throw new TypeError("fetch failed"); });
    assert.equal(gone.s, "down"); assert.equal(gone.why, "unreachable");
    assert.equal((await as(async () => new Response("<html>", { status: 403, headers: { "Content-Type": "text/html", "cf-mitigated": "challenge" } }))).s, "none");
    const slow = await as(async () => { await new Promise((r) => setTimeout(r, 5)); return new Response("ok"); });
    assert.equal(slow.s, "ok");
  } finally { globalThis.fetch = real; }
});
