// Fitness's best time to ride: the stretch of today it picks, from the hours' weather
import { test } from "node:test";
import assert from "node:assert/strict";
import { bestWindow, hourScore, windWords, LIMITS, isWet } from "../../../fitness/besttime.js";

const H = 3600e3, DAY0 = Date.UTC(2026, 9, 26);   // (midnight, UTC, on a place with no offset)
const fine = { temp: 15, feels: 15, pop: 5, rain: 0, code: 1, wind: 10, gust: 20, dir: 270, day: true };
const day = (f = () => ({})) => ({ offset: 0, hours: Array.from({ length: 48 }, (_, i) => ({ t: DAY0 + i * H, ...fine, day: i % 24 >= 7 && i % 24 < 19, ...f(i % 24, i) })) });

test("a fine day: the first stretch of the session's length, once it's light", () => {
  const b = bestWindow(day(), { secs: 2 * 3600, now: DAY0 });
  assert.equal(new Date(b.start).getUTCHours(), 7);
  assert.equal((b.end - b.start) / H, 2);
  assert.equal(b.rating, "Great");
  assert.equal(b.dry, true);
});
test("rain in the morning: the afternoon wins", () => {
  const b = bestWindow(day((h) => (h < 13 ? { rain: 1.5, code: 61, pop: 90 } : {})), { secs: 3600, now: DAY0 });
  assert.ok(new Date(b.start).getUTCHours() >= 13);
});
test("a cold morning and a mild afternoon: the warmth wins", () => {
  const b = bestWindow(day((h) => ({ temp: h < 12 ? 2 : 14, feels: h < 12 ? 0 : 14 })), { secs: 3600, now: DAY0 });
  assert.ok(new Date(b.start).getUTCHours() >= 12);
});
test("only what's left of today: none in the evening", () => {
  assert.equal(bestWindow(day(), { secs: 3600, now: DAY0 + 20 * H }), null);
  const b = bestWindow(day(), { secs: 3600, now: DAY0 + 10.5 * H });
  assert.ok(b.start >= DAY0 + 10 * H);
});
test("an hour's score: wind, gusts and rain take it down", () => {
  const a = LIMITS.ride;
  assert.equal(hourScore(fine, null, a), 1);
  assert.ok(hourScore({ ...fine, wind: 32 }, null, a) < 0.3);
  assert.equal(hourScore({ ...fine, rain: 2, code: 63 }, null, a), 0);
  assert.ok(isWet({ code: 80 }) && !isWet({ code: 3, rain: 0 }));
});
test("the wind in words", () => {
  assert.equal(windWords(10, 270), "a light westerly");
  assert.equal(windWords(30, 225), "a strong south-westerly");
  assert.equal(windWords(3, 90), "little wind");
});
