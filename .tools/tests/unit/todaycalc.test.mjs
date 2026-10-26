// Fitness's Today: readiness, and each day's ring in the week
import { test } from "node:test";
import assert from "node:assert/strict";
import { readinessOf, dayKindOf, toneOfIF } from "../../../fitness/todaycalc.js";

test("readiness: form alone, then the check-in moving it", () => {
  assert.deepEqual(readinessOf(9), { v: 74, tone: "steady", word: "Steady" });
  assert.equal(readinessOf(9, { sleep: 2, legs: 2, mood: 2 }).word, "Ready");
  assert.equal(readinessOf(9, { sleep: 0, legs: 0, mood: 1 }).word, "Go easy");
  // (a check-in half done counts for nothing yet)
  assert.equal(readinessOf(9, { sleep: 0 }).v, 74);
  // (and it stays between 15 and 97)
  assert.equal(readinessOf(-80, { sleep: 0, legs: 0, mood: 0 }).v, 15);
  assert.equal(readinessOf(60, { sleep: 2, legs: 2, mood: 2 }).v, 97);
});
test("a day's ring: ridden, missed, to come or rest; nothing missed before the plan began", () => {
  const today = 10, base = { today, id: "vo2-5x4" };
  assert.equal(dayKindOf({ ...base, day: 8, did: 1 }), "did");
  assert.equal(dayKindOf({ ...base, day: 8 }), "missed");
  assert.equal(dayKindOf({ ...base, day: 10 }), "plan");
  assert.equal(dayKindOf({ ...base, day: 12 }), "plan");
  assert.equal(dayKindOf({ ...base, day: 8, began: 9 }), "rest");
  assert.equal(dayKindOf({ today, day: 8, id: null }), "rest");
  assert.equal(dayKindOf({ today, day: 8, id: null, did: 2 }), "did");
});
test("a session's colour by how hard it is", () => {
  assert.deepEqual([0.6, 0.8, 0.88, 1.02].map(toneOfIF), ["z2", "z3", "z4", "z6"]);
});
