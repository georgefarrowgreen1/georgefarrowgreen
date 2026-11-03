// A ride's weather for Today's cards (functions/_todayride.js, Today First spec §7.3): the roads wet from a wet hour in
// the three before the start; a jacket by feels-like under the ride's limit or a 30% chance of rain in the first hour;
// the words across the ride's window (dry, wet then clearing, dry then wet, wet throughout, on and off). rideWxOf is
// pure; rideWx asks for the week where you ride (Open-Meteo stood in for through fetch) at your first Weather place.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { rideWx, rideWxOf } from "../../../functions/_todayride.js";
import { wxdb } from "../../../functions/_wxpush.js";
import { LIMITS } from "../../../fitness/besttime.js";

const H = 3600e3, at = (h, m = 0) => Date.UTC(2026, 10, 2, h, m);
const RIDE = { start: at(16, 45), stop: at(18), secs: 4500, sport: "ride" };
// a day by the hour, real ms: each hour dry and mild unless set
function week(set = {}) {
  const hours = [];
  for (let h = 0; h < 48; h++) {
    const t = at(0) + h * H, x = set[h % 24] || {};
    hours.push({ t, temp: 12, feels: 11, pop: 5, rain: 0, code: 2, wind: 10, gust: 20, dir: 270, day: h % 24 >= 7 && h % 24 < 17, ...x });
  }
  return { offset: 0, hours };
}
const WET = { pop: 80, rain: 0.6, code: 61 };

test("roads wet: a wet hour in the three before the start (the start's own hour too); dry otherwise; unknown with no hours before", () => {
  assert.equal(rideWxOf(week({ 14: WET }), RIDE).roads, "wet", "14:00, within three hours of 16:45");
  assert.equal(rideWxOf(week({ 16: WET }), RIDE).roads, "wet", "raining as you set out");
  assert.equal(rideWxOf(week({ 13: WET }), RIDE).roads, "wet", "13:00–14:00 is within the three hours from 13:45");
  assert.equal(rideWxOf(week({ 12: WET }), RIDE).roads, "dry", "12:00 dried off by 13:45");
  assert.equal(rideWxOf(week({ 17: WET }), RIDE).roads, "dry", "rain after the start isn't the roads at the start");
  assert.equal(rideWxOf({ offset: 0, hours: week().hours.filter((h) => h.t >= at(16, 45)) }, RIDE).roads, null);
});

test("a jacket: feels-like under the ride's limit at the start, or a 30% chance of rain in the first hour", () => {
  assert.equal(rideWxOf(week(), RIDE).jacket, false);
  assert.equal(rideWxOf(week({ 16: { feels: LIMITS.ride.tmin - 1 } }), RIDE).jacket, true, "cold to start in");
  assert.equal(rideWxOf(week({ 16: { feels: LIMITS.ride.tmin } }), RIDE).jacket, false, "at the limit isn't under it");
  assert.equal(rideWxOf(week({ 17: { pop: 30 } }), RIDE).jacket, true, "17:00 is in the first hour from 16:45");
  assert.equal(rideWxOf(week({ 18: { pop: 90 } }), RIDE).jacket, false, "later than the first hour");
  assert.equal(rideWxOf(week({ 16: { feels: 7 } }), { ...RIDE, sport: "run" }).jacket, false, "a run's limit is lower");
  assert.equal(rideWxOf(week({ 16: { feels: 8.4 } }), RIDE).out, 8.4, "out in: the feels-like in the start's hour");
});

test("the words across the ride: dry, wet then clearing, dry then wet, wet throughout, on and off; the wind", () => {
  const long = { start: at(15), stop: at(19), secs: 4 * 3600, sport: "ride" };
  let w = rideWxOf(week(), long);
  assert.equal(w.words, "dry throughout"); assert.equal(w.short, "dry throughout"); assert.equal(w.wind, "light wind");
  w = rideWxOf(week({ 15: WET, 16: WET }), long, { tz: "Europe/London" });
  assert.equal(w.words, "light rain at first, clearing by 17:00"); assert.equal(w.short, "light rain at first");
  w = rideWxOf(week({ 17: { ...WET, rain: 2 }, 18: WET }), long, { tz: "Europe/London" });
  assert.equal(w.words, "dry until 17:00, then rain"); assert.equal(w.short, "dry until 17:00");
  w = rideWxOf(week({ 15: WET, 16: WET, 17: { ...WET, rain: 5 }, 18: WET }), long);
  assert.equal(w.words, "heavy rain throughout");
  assert.equal(rideWxOf(week({ 15: WET, 17: WET }), long).words, "light rain on and off");
  const storm = { code: 95, rain: 3, pop: 90 };
  assert.equal(rideWxOf(week({ 17: storm, 18: storm }), long, { tz: "Europe/London" }).words, "dry until 17:00, then storms");
  assert.equal(rideWxOf(week({ 16: storm }), long).words, "storms on and off");
  assert.equal(rideWxOf(week({ 15: { wind: 30, gust: 60 }, 16: { wind: 30, gust: 60 }, 17: { wind: 30 }, 18: { wind: 30 } }), long).wind, "windy, gusty");
  // (the hours across the window, each with whether it's wet)
  assert.deepEqual(rideWxOf(week({ 16: WET }), RIDE).hours.map((h) => [h.t, h.wet]), [[at(16), true], [at(17), false]]);
  // (no hours across it, or no ride: nothing)
  assert.equal(rideWxOf({ offset: 0, hours: [] }, RIDE), null);
  assert.equal(rideWxOf(week(), { start: at(18), stop: at(17) }), null);
  assert.equal(rideWxOf(null, RIDE), null);
});

// ---- rideWx: the week at your first Weather place, through hoursAt ----
const sql = new DatabaseSync(":memory:");
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null, all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }),
  run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const env = { DB: { prepare: (q) => st(q), batch: async (l) => { const out = []; for (const s of l) out.push(/^\s*(SELECT|PRAGMA)/i.test(s.q || "") ? await s.all() : await s.run()); return out; } }, WXAPP_URL: "http://om.test" };
await wxdb(env);
const asked = [], realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  asked.push(String(u));
  const w = week({ 15: WET, 16: WET }), H2 = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], is_day: [] };
  for (const h of w.hours) { H2.time.push(h.t / 1000); H2.temperature_2m.push(h.temp); H2.apparent_temperature.push(h.feels); H2.precipitation_probability.push(h.pop); H2.precipitation.push(h.rain); H2.weather_code.push(h.code); H2.wind_speed_10m.push(h.wind); H2.wind_gusts_10m.push(h.gust); H2.wind_direction_10m.push(h.dir); H2.is_day.push(h.day ? 1 : 0); }
  return new Response(JSON.stringify({ utc_offset_seconds: 0, hourly: H2 }), { headers: { "Content-Type": "application/json" } });
};
after(() => { globalThis.fetch = realFetch; });

test("rideWx: the week where you ride (your first Weather place), and none with no place", async () => {
  assert.equal(await rideWx(env, { id: "nobody" }, RIDE, at(12)), null, "no place in Weather");
  assert.equal(asked.length, 0, "and nothing asked");
  sql.prepare("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?, ?, 1, 0)").run("rider", JSON.stringify({ places: [{ name: "London", lat: 51.5072, lon: -0.1276 }], settings: {}, notify: {} }));
  const w = await rideWx(env, { id: "rider" }, { ...RIDE, tz: "Europe/London" }, at(12));
  assert.equal(w.roads, "wet"); assert.equal(w.jacket, true, "a 80% chance in the first hour");
  assert.equal(w.words, "light rain at first, clearing by 17:00");
  assert.ok(asked.length === 1 && asked[0].includes("latitude=51.51") && asked[0].includes("timeformat=unixtime"), asked[0]);
  assert.equal(await rideWx(env, { id: "rider" }, null, at(12)), null);
});
