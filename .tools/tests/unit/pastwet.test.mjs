// Whether each of the last 56 days was wet or dry where you ride, hour by hour (functions/_fitwx.js pastWet, for Today's
// habit rule, functions/_todayacts.js habitRide), with Open-Meteo stood in for through fetch: asked once for each 0.05°
// cell each day (two places in one cell, and many asks, one trip; another cell or the next day, another), with
// past_days=56 and only the hourly precipitation and weather code, kept in the data centre's cache for a day; each hour
// wet or dry by Fitness's own rule (fitness/besttime.js isWet), on the place's own clock across a change of the clocks;
// only the 56 whole days before today; and null, never a guess, where it isn't known (no answer, a bad place, no hours).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { pastWet, pastFrom, rideWeather } from "../../../functions/_fitwx.js";

const H = 3600e3, DAY = 864e5;
// (Monday 2 November 2026, 12:00 in London; the clocks went back on 25 October)
const T = Date.UTC(2026, 10, 2, 12);
const env = { WXAPP_URL: "http://om.test" };

// ---- Open-Meteo, and the data centre's cache ----
let asked = [], down = false;
const cached = new Map(), puts = [];
const realFetch = globalThis.fetch;
// (57 days of hours, the place's clock London's: wet 07:00 to 09:00 local each day by rain, 17:00 by its code alone
// (drizzle, no amount said), dry the rest; an hour with nothing said at 03:00)
function answer(url) {
  const first = Date.UTC(2026, 8, 7) - H, hours = [], rain = [], code = [];   // (00:00 BST, 7 September)
  for (let s = first; s < T + DAY; s += H) {
    const local = new Date(s + (s < Date.UTC(2026, 9, 25, 1) ? H : 0)).getUTCHours();
    hours.push(s / 1000);
    if (local === 3) { rain.push(null); code.push(null); continue; }
    rain.push(local >= 7 && local < 9 ? 1.2 : local === 17 ? null : 0);
    code.push(local >= 7 && local < 9 ? 61 : local === 17 ? 53 : 2);
  }
  return { latitude: Number(url.searchParams.get("latitude")), timezone: "Europe/London", utc_offset_seconds: 0, hourly: { time: hours, precipitation: rain, weather_code: code } };
}
globalThis.fetch = async (u) => {
  const url = new URL(String(u));
  asked.push(url);
  if (down) return new Response("no", { status: 503 });
  return new Response(JSON.stringify(answer(url)), { headers: { "Content-Type": "application/json" } });
};
globalThis.caches = { default: { match: async (r) => { const v = cached.get(r.url); return v ? new Response(v.body) : undefined; },
  put: async (r, res) => { puts.push({ url: r.url, cc: res.headers.get("Cache-Control") }); cached.set(r.url, { body: await res.text() }); } } };
after(() => { globalThis.fetch = realFetch; delete globalThis.caches; });
beforeEach(() => { asked = []; down = false; });

test("asked once for each 0.05° cell each day: past_days=56, the precipitation and the weather code only; kept a day in the cache", async () => {
  const a = await pastWet(env, 51.512, -0.121, T);
  assert.ok(a && typeof a === "object");
  assert.equal(asked.length, 1);
  const q = asked[0].searchParams;
  assert.equal(asked[0].origin + asked[0].pathname, "http://om.test/v1/forecast");
  assert.equal(q.get("past_days"), "56"); assert.equal(q.get("hourly"), "precipitation,weather_code"); assert.equal(q.get("timezone"), "auto");
  assert.deepEqual([q.get("latitude"), q.get("longitude")], ["51.50", "-0.10"], "the cell, not the place");
  assert.deepEqual(puts.map((p) => p.cc), ["max-age=86400"], "kept a day");
  // (the same cell, many times and from another place in it: no more trips)
  for (const [la, lo] of [[51.512, -0.121], [51.49, -0.09], [51.5, -0.1]]) assert.deepEqual(await pastWet(env, la, lo, T + 5 * H), a);
  assert.equal(asked.length, 1, "one trip for the cell's day");
  // (another cell; and the same cell the next day: asked again, each)
  await pastWet(env, 51.56, -0.1, T);
  assert.equal(asked.length, 2);
  assert.equal(asked[1].searchParams.get("latitude"), "51.55");
  cached.clear();
  await pastWet(env, 51.512, -0.121, T + DAY);
  assert.equal(asked.length, 3, "the next day, asked again");
});

test("each hour wet or dry by Fitness's own rule, on the place's own clock (summer time too); only the 56 whole days before today", async () => {
  const p = await pastWet(env, 40.0, -3.7, T);
  const days = Object.keys(p).sort();
  assert.equal(days.length, 56);
  assert.deepEqual([days[0], days.at(-1)], ["2026-09-07", "2026-11-01"], "not today, nothing older than 56 days");
  for (const d of ["2026-10-20", "2026-11-01"]) {
    assert.equal(p[d][7], true, `${d} 07:00: rain`); assert.equal(p[d][8], true);
    assert.equal(p[d][17], true, `${d} 17:00: drizzle by its code, no amount said`);
    assert.equal(p[d][12], false, `${d} noon: dry`); assert.equal(p[d][9], false);
    assert.ok(!(3 in p[d]), "an hour with nothing said: left out, not dry");
  }
  assert.equal(Object.keys(p["2026-10-20"]).length, 23);
  // (25 October, the clocks went back: 01:00 twice, and its hours still on its own clock)
  assert.equal(p["2026-10-25"][7], true); assert.equal(p["2026-10-25"][6], false);
});

test("null where it isn't known: no answer, a place that isn't one, no time, no hours; one that failed asked again next time", async () => {
  down = true;
  assert.equal(await pastWet(env, 10, 10, T), null);
  down = false;
  assert.ok(await pastWet(env, 10, 10, T), "asked again, now it answers");
  assert.equal(asked.length, 2);
  for (const [la, lo, t] of [[NaN, 0, T], [91, 0, T], [0, 181, T], ["x", 0, T], [10, 10, undefined]]) assert.equal(await pastWet(env, la, lo, t), null, `${la},${lo},${t}`);
  assert.equal(pastFrom({ hourly: { time: [] } }, T), null);
  assert.equal(pastFrom(null, T), null);
  assert.equal(pastFrom({ timezone: "Not/AZone", utc_offset_seconds: 3600, hourly: { time: [(T - DAY) / 1000], precipitation: [0], weather_code: [0] } }, T)["2026-11-01"][13], false, "an unknown zone: by the offset");
});

test("rideWeather: behind the hub, where the hub says the person is, not the hub's own place", async () => {
  const geo = Buffer.from(JSON.stringify({ city: "Bristol", latitude: 51.45, longitude: -2.59 })).toString("base64url");
  const req = { cf: { city: "Ashburn", latitude: 39.04, longitude: -77.49 }, headers: new Headers({ "X-Hub-Ok": "1", "X-Hub-Geo": geo }) };
  const env2 = { ...env, WXAPP_URL: "http://om.test" };
  const r = await rideWeather(env2, "nobody-here", req);
  assert.deepEqual(r.place, { name: "Bristol", rough: true });
  assert.equal(asked.at(-1).searchParams.get("latitude"), "51.45");
  const direct = await rideWeather(env2, "nobody-here", { cf: { city: "Leeds", latitude: 53.8, longitude: -1.55 }, headers: new Headers() });
  assert.deepEqual(direct.place, { name: "Leeds", rough: true }, "not behind the hub: its own place, as before");
});
