import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewWorkout } from "../../../fitness/workout-review.js";

const stepped = (kind, secs, from) => ({ name: kind, kind, secs, from });
const record = (sport, t, channels) => ({ sport, s: { t, ...channels } });

test("a ride review expands repeats and keeps measured zero watts distinct from missing power", () => {
  const workout = { sport: "ride", steps: [
    stepped("warmup", 10, 0.5),
    { repeat: 2, steps: [stepped("work", 10, 1), stepped("rest", 10, 0.4)] },
  ] };
  const time = new Float64Array(Array.from({ length: 51 }, (_, i) => i));
  const power = new Float64Array(time.map((i) => [100, 208, 0, 170, 80, 80][Math.floor(i / 10)]));
  const review = reviewWorkout(workout, record("ride", time, { pwr: power }), { ftp: 200 });

  assert.equal(review.metric, "power");
  assert.equal(review.alignment, "elapsed");
  assert.equal(review.plannedSeconds, 50);
  assert.equal(review.recordedSeconds, 50);
  assert.deepEqual(review.intervals.map((step) => step.status), [
    "on-target", "on-target", "below-target", "below-target", "on-target",
  ]);
  assert.deepEqual(review.intervals[1].target, { from: 200, to: 200, average: 200 });
  assert.deepEqual(review.intervals[3].rep, [2, 2]);
  assert.equal(review.intervals[2].actual, 0);
  assert.equal(review.intervals[2].measuredSeconds, 10);
});

test("a pause is not filled with power and a shortened recording cannot complete later intervals", () => {
  const workout = { sport: "ride", steps: Array.from({ length: 4 }, () => stepped("work", 20, 1)) };
  const recording = record("ride", [0, 1, 2, 3, 20, 21, 22, 40, 50], { pwr: [200, 200, null, 200, 200, 200, 200, 200, 200] });
  const review = reviewWorkout(workout, recording, { ftp: 200 });

  assert.deepEqual(review.intervals.map((step) => step.recordedSeconds), [20, 20, 10, 0]);
  assert.deepEqual(review.intervals.map((step) => step.measuredSeconds), [2, 2, 10, 0]);
  assert.deepEqual(review.intervals.map((step) => step.status), ["no-data", "no-data", "partial", "not-recorded"]);
  assert.equal(review.intervals[0].actual, 200);
  assert.equal(review.intervals[3].actual, null);
});

test("measured sample spans are weighted and clipped at the time boundaries of mixed workouts", () => {
  const workout = { sport: "run", steps: [
    stepped("warmup", 4, 0.5),
    { name: "20 m repeat", kind: "work", metres: 20, from: 1 },
    stepped("rest", 4, 0.5),
  ] };
  const recording = record("run", [0, 2, 5, 8, 12, 16], {
    dist: [0, 4, 10, 22, 38, 46],
    spd: [2, 2, 4, 4, 2, 2],
  });
  const review = reviewWorkout(workout, recording, { thresholdSpeed: 4 });

  assert.equal(review.alignment, "mixed");
  assert.equal(review.plannedSeconds, 13);
  assert.deepEqual(review.intervals.map((step) => step.start), [0, 4, 9.5]);
  assert.deepEqual(review.intervals.map((step) => step.end), [4, 9.5, 13.5]);
  assert.equal(review.intervals[1].plannedMetres, 20);
  assert.equal(review.intervals[1].recordedSeconds, 5.5);
  assert.equal(review.intervals[1].actual, 20 / 5.5);
  assert.equal(review.intervals[1].status, "below-target");
});

test("a long gap with distance samples on both ends leaves running and open-water pace unknown", () => {
  for (const [sport, indoor] of [["run", true], ["swim", false]]) {
    const workout = { sport, steps: [stepped("work", 30, 1)] };
    const recording = { ...record(sport, [0, 30], { dist: [0, 100], spd: [3, 3] }), indoor };
    const [interval] = reviewWorkout(workout, recording, { thresholdSpeed: 3 }).intervals;
    assert.equal(interval.recordedSeconds, 30);
    assert.equal(interval.measuredSeconds, 0);
    assert.equal(interval.actual, null);
    assert.equal(interval.status, "no-data");
  }
});

test("elapsed swimming pace is available on measured distance boundaries without interpolating through missing spans", () => {
  const recording = record("swim", [0, 25, 60], { dist: [0, 50, 100] });
  const step = (metres) => ({ name: "Length", kind: "work", metres, from: 1 });
  const options = { thresholdSpeed: 2 };
  const workout = { sport: "swim", steps: [step(50), step(50), step(50)] };
  const review = reviewWorkout(workout, recording, options);

  assert.equal(review.alignment, "distance");
  assert.equal(review.intervals[0].actual, 2);
  assert.equal(review.intervals[0].status, "on-target");
  assert.equal(review.intervals[1].actual, 50 / 35);
  assert.equal(review.intervals[1].status, "below-target");
  assert.equal(review.intervals[2].status, "not-recorded");
  const uncertain = reviewWorkout({ ...workout, steps: [step(75), step(25)] }, recording, options);
  assert.deepEqual(uncertain.intervals.map((r) => r.status), ["no-data", "no-data"]);
  assert.equal(uncertain.intervals[0].end, null);
});

test("an incomplete distance step shows the measured part and a distance reset does not infer later steps", () => {
  const workout = { sport: "run", steps: [
    { kind: "work", metres: 100, from: 1 }, stepped("rest", 10, 0.5),
  ] };
  const recording = record("run", [0, 10, 20], { dist: [0, 30, 60] });
  const review = reviewWorkout(workout, recording, { thresholdSpeed: 3 });
  assert.equal(review.intervals[0].status, "partial");
  assert.equal(review.intervals[0].recordedSeconds, 20);
  assert.equal(review.intervals[0].actual, 3);
  assert.equal(review.intervals[1].status, "not-recorded");

  const reset = record("run", [0, 10, 20], { dist: [0, 30, 10] });
  assert.equal(reviewWorkout(workout, reset, { thresholdSpeed: 3 }).intervals[0].status, "no-data");
});

test("comparison requires an explicit threshold and gracefully handles unsupported, missing and oversized inputs", () => {
  const workout = { sport: "ride", steps: [stepped("work", 4, 1)] };
  const recording = record("ride", [0, 2, 4], { pwr: [200, 200, 200] });
  assert.equal(reviewWorkout(workout, recording).intervals[0].status, "untargeted");
  const absent = reviewWorkout(workout, null, { ftp: 200 });
  assert.equal(absent.plannedSeconds, 4);
  assert.equal(absent.recordedSeconds, null);
  assert.equal(absent.intervals[0].target.average, 200);
  assert.equal(absent.intervals[0].actual, null);
  assert.equal(absent.reason, "missing-recording");
  assert.equal(reviewWorkout({ ...workout, sport: "swim" }, recording).reason, "sport-mismatch");
  assert.equal(reviewWorkout({ ...workout, sport: "strength" }, { sport: "strength" }).reason, "unsupported-sport");
  assert.equal(reviewWorkout({ ...workout, steps: [{ repeat: 100_000_000, steps: workout.steps }] }, recording).reason, "invalid-plan");
  assert.equal(reviewWorkout({ ...workout, steps: [...workout.steps, { repeat: 100_000_000, steps: [] }] }, recording).reason, "invalid-plan");
  assert.equal(reviewWorkout(workout, record("ride", [0, 4, 2], {})).reason, "invalid-recording");
  assert.equal(reviewWorkout(workout, record("ride", new Float64Array(500_001), {})).reason, "recording-limit");
});
