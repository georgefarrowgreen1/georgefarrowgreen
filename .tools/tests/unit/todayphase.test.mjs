// Today's phase engine (functions/_todayphase.js phaseOf, Today First spec §7.1), pure: the demo's day in London, each
// phase at its minute, the after phase on an activity's arrival (early, on time, or none by the cap), two rides, a ride
// with no time, an auto-added habit ride not kept, no morning set, quiet hours starting early, the clocks changing, far
// zones; and everywhere, until and the timeline agree with phaseOf asked again at those moments. It never reads the clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseOf, ridesWithDones, wallAt, capOf } from "../../../functions/_todayphase.js";

const MIN = 60e3, H = 60 * MIN;
const LON = "Europe/London";
const at = (h, m = 0, d = 2) => Date.UTC(2026, 10, d, h, m);               // (2 November 2026: London is on GMT)
const RIDE = { start: at(16, 45), stop: at(18), secs: 4500, sport: "ride", source: "moved", withId: null, who: null, hold: true };
const DAY_IN = { dayStart: 6 * 60, eveningAt: 19 * 60, rides: [RIDE], dones: [] };
const GARMIN = { start: at(16, 46), secs: 4500, dist: 36050, tss: null, from: "garmin" };
const hhmm = (tz, ms) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const line = (tz, r) => r.timeline.map((x) => `${x.phase}@${hhmm(tz, x.at)}`).join(" ");

// until and the timeline say what phaseOf itself says at those moments
function agrees(t, tz, inputs) {
  const r = phaseOf(t, tz, inputs);
  assert.equal(r.timeline[0].phase, r.phase, "the timeline starts with the phase now");
  assert.equal(r.timeline[0].at, r.since, "at its since");
  assert.ok(r.since <= t, "since is past");
  for (const [i, e] of r.timeline.entries()) {
    if (!i) continue;
    const there = phaseOf(e.at, tz, inputs);
    assert.equal(there.phase, e.phase, `${e.phase} at ${new Date(e.at).toISOString()}`);
    assert.equal(there.since, e.at, `since ${new Date(e.at).toISOString()}`);
    assert.ok(e.at > r.timeline[i - 1].at, "in order");
  }
  if (r.until != null) {
    assert.ok(r.until > t, "until is still to come");
    assert.equal(r.until, r.timeline[1]?.at, "until is the timeline's next boundary");
    const then = phaseOf(r.until, tz, inputs);
    assert.equal(then.phase, r.timeline[1].phase); assert.equal(then.since, r.until);
  } else assert.equal(r.phase, "riding", "until is unknown only while riding");
  assert.equal(r.timeline.at(-1).phase, "morning", "the timeline ends on the next day's start");
  return r;
}

test("the demo's moments on Monday 2 November 2026 in London: each phase, its since and until, and the rest of the day", () => {
  const want = [
    [at(7), "morning", "06:00", "11:00", "morning@06:00 midday@11:00 preride@16:05 riding@16:45 midday@18:45 evening@19:00 morning@06:00"],
    [at(12, 30), "midday", "11:00", "16:05", "midday@11:00 preride@16:05 riding@16:45 midday@18:45 evening@19:00 morning@06:00"],
    [at(16, 5), "preride", "16:05", "16:45", "preride@16:05 riding@16:45 midday@18:45 evening@19:00 morning@06:00"],
    [at(16, 50), "riding", "16:45", null, "riding@16:45 midday@18:45 evening@19:00 morning@06:00"],
    [at(21), "evening", "19:00", "06:00", "evening@19:00 morning@06:00"],
  ];
  for (const [t, phase, since, until, tl] of want) {
    const r = agrees(t, LON, DAY_IN);
    assert.equal(r.phase, phase, hhmm(LON, t));
    assert.equal(hhmm(LON, r.since), since); assert.equal(r.until == null ? null : hhmm(LON, r.until), until);
    assert.equal(line(LON, r), tl);
  }
  // (18:05, with the activity in from Garmin: after, from its arrival, for 90 minutes, outranking the evening's 19:00)
  const r = agrees(at(18, 5), LON, { ...DAY_IN, dones: [GARMIN] });
  assert.equal(r.phase, "after"); assert.equal(r.since, at(18, 1), "arrived at its end: 16:46 and 75 minutes");
  assert.equal(r.until, at(19, 31)); assert.equal(line(LON, r), "after@18:01 evening@19:31 morning@06:00");
  const eve = agrees(at(21), LON, { ...DAY_IN, dones: [GARMIN] });
  assert.equal(eve.phase, "evening"); assert.equal(eve.since, at(19, 31), "the evening from the after's end");
});

test("preride at the very minute 40 before the ride, riding at its start", () => {
  assert.equal(phaseOf(at(16, 5) - 1, LON, DAY_IN).phase, "midday");
  assert.equal(phaseOf(at(16, 5), LON, DAY_IN).phase, "preride");
  assert.equal(phaseOf(at(16, 45) - 1, LON, DAY_IN).phase, "preride");
  assert.equal(phaseOf(at(16, 45), LON, DAY_IN).phase, "riding");
});

test("after: on the activity's arrival, an early one, a late one, and none by the cap (back to the clock's phase)", () => {
  // (early: a 40-minute ride, in by 17:25: riding ends then)
  const early = { start: at(16, 45), secs: 2400, dist: 15000, tss: null, from: "strava" };
  let r = agrees(at(17, 30), LON, { ...DAY_IN, dones: [early] });
  assert.equal(r.phase, "after"); assert.equal(r.since, at(17, 25)); assert.equal(r.until, at(18, 55));
  assert.equal(phaseOf(at(17, 20), LON, { ...DAY_IN, dones: [early] }).phase, "riding");
  // (started 30 minutes early, within the 40 before: still this ride's; and one started an hour early isn't)
  r = phaseOf(at(17, 50), LON, { ...DAY_IN, dones: [{ start: at(16, 15), secs: 4500, from: "garmin" }] });
  assert.equal(r.phase, "after"); assert.equal(r.since, at(17, 30));
  r = phaseOf(at(17, 50), LON, { ...DAY_IN, dones: [{ start: at(15, 30), secs: 3600, from: "garmin" }] });
  assert.equal(r.phase, "riding", "an activity from before the ride's 40 minutes isn't its");
  // (none by the cap, 18:45 here: the clock's phase, midday until 19:00, with no after; and the cap for a long ride)
  r = agrees(at(18, 50), LON, DAY_IN);
  assert.equal(r.phase, "midday"); assert.equal(r.since, at(18, 45)); assert.equal(r.until, at(19));
  assert.equal(capOf({ start: at(9), stop: at(13), secs: 4 * 3600 }), at(13, 30), "a four-hour ride's cap: its length and half an hour");
  // (an activity with no length: in at its start and the ride's planned length)
  r = phaseOf(at(18, 10), LON, { ...DAY_IN, dones: [{ start: at(16, 50), secs: null, from: "garmin" }] });
  assert.equal(r.phase, "after"); assert.equal(r.since, at(18, 5));
});

test("two rides in a day: each its own preride, riding and after; one activity a ride", () => {
  const am = { start: at(8), stop: at(9), secs: 3600, sport: "ride", source: "set", hold: true };
  const two = { dayStart: 6 * 60, eveningAt: 19 * 60, rides: [RIDE, am], dones: [{ start: at(8), secs: 3600, from: "garmin" }] };
  let r = agrees(at(7, 30), LON, two);
  assert.equal(r.phase, "preride");
  assert.equal(line(LON, r), "preride@07:20 riding@08:00 after@09:00 morning@10:30 midday@11:00 preride@16:05 riding@16:45 midday@18:45 evening@19:00 morning@06:00");
  r = agrees(at(9, 30), LON, two);
  assert.equal(r.phase, "after"); assert.equal(r.until, at(10, 30));
  assert.equal(phaseOf(at(16, 10), LON, two).phase, "preride", "the second ride's preride, with no activity for it yet");
  const m = ridesWithDones(two.rides, two.dones);
  assert.deepEqual(m.map((x) => [x.ride.start, x.done?.start ?? null]), [[at(8), at(8)], [at(16, 45), null]], "the morning's activity is the morning ride's alone");
});

test("a ride with no time, and an auto-added habit ride not kept, are no phase: no preride, no riding", () => {
  const habit = { start: at(16, 45), stop: at(18), secs: 4500, sport: "ride", role: "today", state: "yes", taken: false };
  for (const rides of [[{ sport: "ride", secs: 4500 }], [habit], [{ ...habit, state: "new" }], [{ ...habit, role: "asked", state: "new" }]]) {
    const r = agrees(at(16, 50), LON, { dayStart: 360, eveningAt: 1140, rides, dones: [] });
    assert.equal(r.phase, "midday", JSON.stringify(rides[0]));
    assert.ok(!r.timeline.some((x) => x.phase === "preride" || x.phase === "riding"), "none in the day");
  }
  // (kept with a tap, or added in Fitness: explicit, so it does)
  assert.equal(phaseOf(at(16, 50), LON, { dayStart: 360, eveningAt: 1140, rides: [{ ...habit, taken: true }], dones: [] }).phase, "riding");
  assert.equal(phaseOf(at(16, 50), LON, { dayStart: 360, eveningAt: 1140, rides: [{ ...habit, role: "answered", taken: false }], dones: [] }).phase, "riding");
});

test("no morning set: the day from 05:00, the evening from 19:00; and the evening covering the small hours before it", () => {
  const none = { rides: [], dones: [] };
  assert.equal(phaseOf(at(4, 59), LON, none).phase, "evening");
  let r = agrees(at(5), LON, none);
  assert.equal(r.phase, "morning"); assert.equal(r.since, at(5));
  r = agrees(at(3), LON, none);
  assert.equal(r.phase, "evening"); assert.equal(r.since, at(19, 0, 1), "Sunday's evening"); assert.equal(r.until, at(5));
  assert.equal(line(LON, r), "evening@19:00 morning@05:00");
});

test("quiet hours starting early: the evening from 18:00 (eveningAt no later than quietFrom), until quiet hours end", () => {
  const q = { dayStart: 7 * 60, eveningAt: 18 * 60, rides: [], dones: [] };
  assert.equal(phaseOf(at(17, 59), LON, q).phase, "midday");
  const r = agrees(at(18), LON, q);
  assert.equal(r.phase, "evening"); assert.equal(r.until, at(7, 0, 3));
  // (an evening set at or before the day's start is moved after it)
  const odd = agrees(at(9), LON, { dayStart: 8 * 60, eveningAt: 8 * 60, rides: [], dones: [] });
  assert.equal(odd.phase, "evening"); assert.equal(odd.since, at(9));
});

test("the clocks changing: 29 March 2026 (a 23-hour day) and 25 October 2026 (a 25-hour one), walls on London's clock", () => {
  const inp = { dayStart: 6 * 60, eveningAt: 19 * 60, rides: [], dones: [] };
  // 29 March: 06:00 BST is 05:00 UTC; Saturday's 19:00 was GMT
  let r = agrees(Date.UTC(2026, 2, 29, 3), LON, inp);
  assert.equal(r.phase, "evening"); assert.equal(r.since, Date.UTC(2026, 2, 28, 19)); assert.equal(r.until, Date.UTC(2026, 2, 29, 5));
  r = agrees(Date.UTC(2026, 2, 29, 9), LON, inp);
  assert.equal(r.phase, "morning"); assert.equal(r.until, Date.UTC(2026, 2, 29, 10), "11:00 BST");
  // 25 October: Saturday's 19:00 was BST (18:00 UTC), Sunday's 06:00 is GMT
  r = agrees(Date.UTC(2026, 9, 25, 4), LON, inp);
  assert.equal(r.since, Date.UTC(2026, 9, 24, 18)); assert.equal(r.until, Date.UTC(2026, 9, 25, 6));
  r = agrees(Date.UTC(2026, 9, 25, 20), LON, inp);
  assert.equal(r.phase, "evening"); assert.equal(r.since, Date.UTC(2026, 9, 25, 19)); assert.equal(r.until, Date.UTC(2026, 9, 26, 6));
  // (a wall the clocks jump over, and one they go back over: the first time it's that time)
  assert.equal(wallAt(LON, "2026-10-25", 90), Date.UTC(2026, 9, 25, 0, 30), "01:30 the first time, BST");
  assert.equal(wallAt(LON, "2026-03-29", 90), Date.UTC(2026, 2, 29, 1, 30), "01:30 doesn't happen: where the old offset puts it");
});

test("far zones: Singapore, New York, UTC+14 and UTC−12, each on its own clock", () => {
  const inp = { dayStart: 6 * 60, eveningAt: 19 * 60, rides: [], dones: [] };
  for (const [tz, off] of [["Asia/Singapore", 8], ["America/New_York", -5], ["Etc/GMT-14", 14], ["Etc/GMT+12", -12]]) {
    // (07:00 there, on 2 November; New York is on EST by then)
    const t = Date.UTC(2026, 10, 2, 7) - off * H;
    const r = agrees(t, tz, inp);
    assert.equal(r.phase, "morning", tz); assert.equal(hhmm(tz, r.since), "06:00", tz); assert.equal(hhmm(tz, r.until), "11:00", tz);
    assert.equal(r.since, t - H, `${tz}: an hour ago`);
    assert.equal(agrees(t + 14 * H, tz, inp).phase, "evening", `${tz}: 21:00`);
    // (a ride at 16:45 there)
    const ride = { start: t + 9 * H + 45 * MIN, stop: t + 11 * H, secs: 4500, sport: "ride", source: "set" };
    assert.equal(agrees(t + 9 * H + 10 * MIN, tz, { ...inp, rides: [ride] }).phase, "preride", tz);
  }
});

test("a zone that isn't one is London's; and the clock is never read", () => {
  const real = Date.now;
  Date.now = () => { throw new Error("the clock was read"); };
  try {
    const a = phaseOf(at(12, 30), "Not/AZone", DAY_IN), b = phaseOf(at(12, 30), LON, DAY_IN);
    assert.deepEqual(a, b);
    phaseOf(at(7), LON, undefined);
    ridesWithDones(DAY_IN.rides, [GARMIN]);
  } finally { Date.now = real; }
});
