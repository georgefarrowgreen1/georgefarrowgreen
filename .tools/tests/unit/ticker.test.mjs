// The site's scheduler (workers/ticker): every job asked for, each with its secret, and a run where one didn't go said
// to have failed (thrown), so it's seen in Cloudflare's dashboard and not only in a log no one's watching.
import { test } from "node:test";
import assert from "node:assert/strict";
import ticker from "../../../workers/ticker/index.js";

// (one run, the site answering each job with answer(path): → what was asked, and what the run threw, or null)
async function run(env, answer) {
  const asked = [], real = globalThis.fetch, said = console.error;
  globalThis.fetch = async (url, o) => { const p = new URL(url).pathname; asked.push(`${p} ${o.headers.Authorization}`); return answer(p); };
  console.error = () => {};
  try { const threw = await ticker.scheduled({}, env, { waitUntil() {} }).then(() => null, (e) => e); return { asked: asked.sort(), threw }; }
  finally { globalThis.fetch = real; console.error = said; }
}
const env = { INFLIGHT_TICK_SECRET: "chat", WEATHER_TICK_SECRET: "wx" };

test("the scheduler asks for every job, each with its secret, and a run where all go is fine", async () => {
  const r = await run(env, () => new Response("{}"));
  assert.deepEqual(r.asked, ["/api/fitness/garmin-tick Bearer chat", "/api/markets/tick Bearer chat", "/api/pigeon/notify-tick Bearer chat", "/api/weather/tick Bearer wx"]);
  assert.equal(r.threw, null);
  // (Weather's own secret only if it has one: else Chat's)
  assert.ok((await run({ INFLIGHT_TICK_SECRET: "chat" }, () => new Response("{}"))).asked.includes("/api/weather/tick Bearer chat"));
});

test("a run where a job fails (refused, or the site not answering) is said to have failed, naming it", async () => {
  const one = await run(env, (p) => new Response("Not allowed.", { status: p === "/api/markets/tick" ? 401 : 200 }));
  assert.match(one.threw?.message || "", /\/api\/markets\/tick/);
  assert.doesNotMatch(one.threw.message, /weather|pigeon|fitness/);
  const down = await run(env, () => { throw new Error("The site isn't answering."); });
  for (const p of ["notify-tick", "weather/tick", "garmin-tick", "markets/tick"]) assert.match(down.threw?.message || "", new RegExp(p));
  // (no secret set: nothing asked, and each job said not to have gone)
  const none = await run({}, () => new Response("{}"));
  assert.equal(none.asked.length, 0);
  assert.match(none.threw?.message || "", /notify-tick.*weather\/tick.*garmin-tick.*markets\/tick/);
});
