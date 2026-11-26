import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "../../../fitness/workouts.js";
import { currentWorkoutReviewMove, suggestWorkoutReviewMove } from "../../../fitness/workout-review-schedule.js";

function fixture() {
  const today = new Date(2026, 10, 26).getTime();
  const from = addDays(today, 1), to = addDays(today, 2);
  const activity = { id: "ride-review-1", start: today + 3_600_000, sport: "ride" };
  const hard = { id: "threshold", name: "Threshold intervals", sport: "ride", steps: [{ kind: "work", secs: 1_800, from: 1, to: 1 }] };
  const easy = { id: "endurance", name: "Easy endurance", sport: "ride", steps: [{ kind: "steady", secs: 1_800, from: .6, to: .6 }] };
  const days = Array.from({ length: 6 }, (_, i) => ({ date: addDays(today, i), id: [null, hard.id, null, easy.id, easy.id, null][i] }));
  const state = { me: { id: "owner" }, rhythm: { days: Array(7).fill(60) }, chosen: null, own: [activity], times: [], offers: [] };
  return { activity, effort: 9, today, from, to, days, state,
    plannedOn: (d) => days.find((day) => day.date === d)?.id,
    workoutById: (id) => [hard, easy].find((workout) => workout.id === id),
    actsOn: (d) => d === today ? [activity] : [],
  };
}

test("suggests the next hard ride on a suitable later rest day, without changing the plan", () => {
  const input = fixture(), before = JSON.stringify(input.days);
  const move = suggestWorkoutReviewMove(input);
  assert.equal(move?.from, input.from);
  assert.equal(move?.to, input.to);
  assert.equal(move?.workoutId, "threshold");
  assert.match(move?.label, /Move Threshold intervals from Fri 27 Nov to Sat 28 Nov/);
  assert.equal(JSON.stringify(input.days), before);
  assert.deepEqual(currentWorkoutReviewMove(move, input), move);
});

test("omits suggestions for old, easy-rated, example, deleted, and unplanned rides", () => {
  for (const change of [
    (f) => { f.effort = 7; },
    (f) => { f.activity.start = addDays(f.today, -2); },
    (f) => { f.activity.sample = true; },
    (f) => { f.state.own = []; },
    (f) => { f.state.chosen = { id: "sportive" }; },
    (f) => { f.days[1].id = null; },
    (f) => { f.days[1].id = "endurance"; },
  ]) {
    const input = fixture();
    change(input);
    assert.equal(suggestWorkoutReviewMove(input), null);
  }
});

test("offers no move onto an unavailable day or next to a hard day", () => {
  const unavailable = fixture();
  unavailable.state.rhythm.days.fill(0);
  assert.equal(suggestWorkoutReviewMove(unavailable), null);
  const adjacent = fixture();
  adjacent.days[3].id = "threshold";
  assert.equal(suggestWorkoutReviewMove(adjacent), null);
});

test("rejects stale suggestions after changes to the workout, appointments, or ownership", () => {
  for (const change of [
    (f) => { f.days[1].id = "endurance"; },
    (f) => { f.days[1].prescriptionId = "prescribed"; },
    (f) => { f.days[2].id = "endurance"; },
    (f) => { f.state.times = [{ day: "2026-11-28" }]; },
    (f) => { f.state.offers = [{ state: "yes", start: f.to + 3_600_000 }]; },
    (f) => { f.state.own = []; },
    (f) => { f.state.me = null; },
  ]) {
    const input = fixture(), move = suggestWorkoutReviewMove(input);
    change(input);
    assert.equal(currentWorkoutReviewMove(move, input), null);
  }
});
