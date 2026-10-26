// Rhythm's targets, set to what you've been holding in each kind of hard session
import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustments } from "../../../fitness/rhythm.js";

const DAY = 86400000, today = Date.UTC(2026, 9, 26), base = { vo2: 1.18, on30: 1.25, thr: 0.97 };
const ride = (daysAgo, fam, effFtp, effortPct, held, efforts = 5) => ({ start: today - daysAgo * DAY, sport: "ride", sum: { effFam: fam, effFtp, effortPct, held, efforts } });

test("no sessions with efforts: the targets stay as they are", () => {
  const a = adjustments([{ start: today, sport: "ride", sum: {} }], today, base);
  assert.deepEqual([a.vo2, a.on30, a.thr, a.said.length], [0, 0, 0, 0]);
});
test("every effort held, above target: VO₂ max targets go up, no more than 6%", () => {
  const a = adjustments([ride(3, 1, 1180, 104, 5), ride(10, 1, 1180, 103, 5)], today, base);
  assert.ok(a.vo2 > 0.02 && a.vo2 <= 0.06, String(a.vo2));
  assert.equal(a.thr, 0);
  assert.equal(a.said[0].key, "vo2"); assert.equal(a.said[0].allHeld, true); assert.equal(a.said[0].n, 2);
  assert.equal(adjustments([ride(3, 1, 1180, 140, 5)], today, base).vo2, 0.06);
});
test("efforts missed: threshold targets come down a little", () => {
  const a = adjustments([ride(2, 2, 970, 93, 2, 3), ride(9, 2, 970, 95, 1, 3)], today, base);
  assert.ok(a.thr < 0 && a.thr >= -0.06, String(a.thr));
  assert.equal(a.said[0].allHeld, false);
});
test("held, right on target: no change said", () => {
  const a = adjustments([ride(4, 4, 1250, 100, 6, 6)], today, base);
  assert.equal(a.on30, 0); assert.equal(a.said.length, 0);
});
test("only the last three in six weeks count", () => {
  const old = [ride(50, 1, 1180, 80, 0), ride(60, 1, 1180, 80, 0)];
  assert.equal(adjustments(old, today, base).vo2, 0);
  const many = [ride(30, 1, 1180, 80, 0), ...[3, 6, 9].map((d) => ride(d, 1, 1180, 103, 5))];
  assert.ok(adjustments(many, today, base).vo2 > 0);
});
