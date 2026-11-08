import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, session, workoutOf, LADDERS } from "../../../fitness/rhythm.js";
import { measure, flatten, addDays, mondayOf, DAY } from "../../../fitness/workouts.js";

const today = Date.UTC(2026, 10, 9); // Monday; the screenshot's 10-hour, three-day week
const days = [270, 0, 0, 0, 0, 60, 270];
const prefs = { start: today, at: today, days, level: "lots" };
const upcoming = (r) => r.days.filter((d) => d.date >= today && d.date < addDays(today, 7));

test("long slots receive more time: a trained rider can use the 4½-hour allocation", () => {
  const r = plan({ prefs, today }), week = upcoming(r);
  assert.equal(r.today.kind, "long");
  assert.equal(r.today.mins, 270);
  assert.equal(week[5].mins, 60);
  assert.ok(week[6].mins >= 240, JSON.stringify(week[6]));
  assert.ok(week.reduce((sum, d) => sum + d.mins, 0) >= 570, "at least 9½ of the available 10 hours");
  for (let i = 1; i <= 4; i++) assert.equal(week[i].kind, "rest");
});

test("availability is a ceiling, with progression based on riding history", () => {
  const novice = upcoming(plan({ prefs: { ...prefs, level: "none" }, today }));
  const regular = upcoming(plan({ prefs: { ...prefs, level: "regular" }, today }));
  const experienced = upcoming(plan({ prefs, today }));
  const total = (week) => week.reduce((sum, d) => sum + d.mins, 0);
  assert.ok(total(novice) < total(regular) && total(regular) < total(experienced));
  assert.ok(novice.every((d) => !d.hard), "no minimum hard-finish workout that exceeds a beginner's load budget");
  assert.ok(regular[0].mins >= 180 && regular[0].mins < 270);
  assert.match(regular[0].why, /available.*training load/);
});

test("recorded riding takes over from the initial experience setting", () => {
  const acts = [];
  for (let i = 84; i > 0; i--) {
    const date = addDays(today, -i), mins = days[(new Date(date).getDay() + 6) % 7];
    if (mins) acts.push({ start: date + 9 * 3600e3, sport: "ride", sum: { moving: mins * 60, tss: mins * 0.75, iF: 0.67 } });
  }
  const experienced = plan({ prefs, acts, today });
  const initialNovice = plan({ prefs: { ...prefs, level: "none" }, acts, today });
  assert.equal(experienced.seeded, false);
  assert.deepEqual(initialNovice.days, experienced.days, "real history determines load once enough rides exist");
  assert.ok(experienced.today.mins >= 180);
  const restricted = plan({ prefs: { ...prefs, days: [120, 0, 0, 0, 0, 60, 270] }, acts, today });
  assert.ok(restricted.today.mins <= 120, "a shorter availability is respected immediately");
});

test("short days and every interval ladder fit the allocation exactly, including 30/15s", () => {
  for (const kind of [...Object.keys(LADDERS), "sprint"]) {
    for (const mins of [50, 55, 60, 65, 75, 90, 120]) for (let level = 0; level <= 3; level++) {
      const v = measure(session(`rh:${kind}:${mins}:${level}`));
      assert.equal(v.secs, mins * 60, `${kind}, ${mins} min, level ${level}`);
    }
  }
  for (const kind of ["endurance", "long", "recovery"]) for (const mins of [15, 20, 25, 30, 40]) {
    assert.equal(measure(session(`rh:${kind}:${mins}`)).secs, mins * 60, `${kind}, ${mins} min`);
  }
  const steps = flatten(session("rh:threshold:120:2"));
  assert.ok(steps.findIndex((s) => s.kind === "work") < steps.findIndex((s) => s.name === "Endurance"), "quality work before the endurance extension");
  assert.equal(steps.at(-1).kind, "cooldown");
});

test("plans respect each slot, use measured stress, and keep tomorrow's form above −25", () => {
  const schedules = [days, [15, 20, 25, 30, 40, 50, 60], [60, 60, 60, 60, 60, 180, 90], [0, 0, 0, 0, 0, 300, 0]];
  for (const schedule of schedules) for (const level of ["none", "some", "regular", "lots"]) {
    const r = plan({ prefs: { ...prefs, days: schedule, level }, today });
    let ctl = r.ctl, atl = r.atl;
    for (const d of r.days.filter((d) => d.date >= today)) {
      const available = schedule[(new Date(d.date).getDay() + 6) % 7];
      assert.ok(d.mins <= available, `${schedule}, ${level}: ${d.kind} ${d.mins} > ${available}`);
      if (d.id) {
        const v = measure(workoutOf(d.id, r.targets));
        assert.equal(d.tss, Math.round(v.tss));
        assert.equal(d.mins, Math.round(v.secs / 60));
        assert.ok(v.secs <= available * 60);
      }
      ctl += (d.tss - ctl) / 42; atl += (d.tss - atl) / 7;
      assert.ok(ctl - atl >= -25.15, `projected form ${ctl - atl}`); // rounded display stress
    }
    for (const mon of new Set(r.days.map((d) => mondayOf(d.date)))) {
      assert.ok(r.days.filter((d) => mondayOf(d.date) === mon && d.hard).length <= 2);
    }
    const hard = r.days.filter((d) => d.hard);
    for (let i = 1; i < hard.length; i++) assert.ok(hard[i].date - hard[i - 1].date >= 2 * DAY);
  }
});

test("recovery weeks, holding and tapering still reduce the load with long slots available", () => {
  const load = (p) => upcoming(plan({ prefs: { ...prefs, ...p }, today })).reduce((sum, d) => sum + d.tss, 0);
  assert.ok(load({ mode: "hold" }) < load({ mode: "build" }));
  assert.ok(load({ start: addDays(today, -21) }) < load({ start: today }));
  const taper = plan({ prefs: { ...prefs, event: { date: addDays(today, 10), kind: "sportive" } }, today });
  assert.ok(taper.today.taper && taper.today.mins <= 120);
  assert.ok(upcoming(taper).reduce((sum, d) => sum + d.tss, 0) < load({}));
});
