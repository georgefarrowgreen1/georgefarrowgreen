// A chart's axis never reads the same twice, nor rounds its ticks into the wrong numbers (weather/charts.js niceScale):
// visibility in fog, a drizzly day's rain
import { test } from "node:test";
import assert from "node:assert/strict";

// (what charts.js asks of the browser as it loads)
globalThis.innerWidth ??= 390; globalThis.addEventListener ??= () => {};
const { niceScale } = await import("../../../weather/charts.js");

const labels = (s, fmt) => s.ticks.map(fmt);
const whole = (v) => String(Math.round(v)), tenth = (v) => String(Math.round(v * 10) / 10);

test("whole-number labels: whole steps, never 0, 1, 1", () => {
  assert.deepEqual(labels(niceScale(0, 0.8, 3, 0, 1), whole), ["0", "1"], "fog, in kilometres");
  assert.deepEqual(labels(niceScale(0, 0.5, 3, 0, 1), whole), ["0", "1"], "and in miles");
  // (a range that'd be split in 2.5s: 5s instead, which the labels can say)
  assert.deepEqual(niceScale(1010, 1016.5, 3, 0, 1).ticks, [1010, 1015, 1020]);
  assert.deepEqual(niceScale(1010, 1016.5).ticks, [1010, 1012.5, 1015, 1017.5], "(as it was without a unit)");
});
test("labels to a tenth (rain in mm, visibility in fog): steps of a tenth or more", () => {
  for (const hi of [0.05, 0.1, 0.15, 0.3, 0.8]) {
    const said = labels(niceScale(0, hi, 3, 0, 0.1), tenth);
    assert.equal(new Set(said).size, said.length, `0–${hi}: ${said}`);
  }
  assert.deepEqual(labels(niceScale(0, 0.15, 3, 0, 0.1), tenth), ["0", "0.1", "0.2"]);
  assert.deepEqual(labels(niceScale(0, 0.8, 3, 0, 0.1), tenth), ["0", "0.5", "1"]);
  // (2.5s where the labels can say them)
  assert.deepEqual(labels(niceScale(0, 7, 3, 0, 0.1), tenth), ["0", "2.5", "5", "7.5"]);
});
test("labels to a hundredth (rain in inches): no 0.00 three times", () => {
  const said = labels(niceScale(0, 0.004, 3, 0, 0.01), (v) => v.toFixed(2));
  assert.deepEqual(said, ["0.00", "0.01"]);
});
test("ranges wide enough aren't changed", () => {
  for (const [lo, hi] of [[0, 30], [4, 17], [-3, 9], [995, 1030]]) assert.deepEqual(niceScale(lo, hi, 3, 0, 1), niceScale(lo, hi), `${lo}–${hi}`);
});
