// Apple Health by a Shortcut (functions/_health.js): last night read as Shortcuts writes it
import { test } from "node:test";
import assert from "node:assert/strict";
import { nightFrom, dayIn } from "../../../functions/_health.js";

test("numbers as they are", () => {
  assert.deepEqual(nightFrom({ hrv: 52, rhr: 48, sleep: 7.5 }), { hrv: 52, rhr: 48, sleep: 27000 });
  assert.equal(nightFrom({ sleep: 450 }).sleep, 27000);        // (minutes)
  assert.equal(nightFrom({ sleep: 27000 }).sleep, 27000);      // (seconds)
});
test("samples with their units, a line each, or as lists; HRV averaged, resting heart rate the middle, sleep added up", () => {
  assert.deepEqual(nightFrom({ hrv: "48 ms\n52 ms\n55 ms", rhr: ["51 count/min", "49 count/min", "60 count/min"], sleep: "2 hr 10 min\n3 hr 5 min\n1 hr 45 min" }), { hrv: 51.7, rhr: 51, sleep: 25200 });
  assert.equal(nightFrom({ sleep: ["1:30:00", "2:15"] }).sleep, 3 * 3600 + 45 * 60);
  assert.equal(nightFrom({ sleep: "45 min, 30 s" }).sleep, 2730);
});
test("what isn't a night is left out", () => {
  assert.deepEqual(nightFrom({ hrv: "999 ms", rhr: "", sleep: "2 min" }), { hrv: null, rhr: null, sleep: null });
  assert.deepEqual(nightFrom({}), { hrv: null, rhr: null, sleep: null });
});
test("today where you are", () => {
  const t = Date.UTC(2026, 9, 26, 23, 30);
  assert.equal(dayIn("Europe/London", t), "2026-10-26");
  assert.equal(dayIn("Asia/Tokyo", t), "2026-10-27");
  assert.equal(dayIn("Not/AZone", t), "2026-10-26");
});
