// Strava (functions/_strava.js): an activity's streams written as TCX, read back by Fitness as any file is
import { test } from "node:test";
import assert from "node:assert/strict";
import { tcxOf, sportOf } from "../../../functions/_strava.js";
import { readAny } from "../../../fitness/formats.js";

const n = 600, start = "2026-10-20T07:30:00Z";
const streams = { time: { data: Array.from({ length: n }, (_, i) => i) }, latlng: { data: Array.from({ length: n }, (_, i) => [51.45 + i * 1e-4, -2.6 + i * 1e-4]) },
  altitude: { data: Array.from({ length: n }, (_, i) => 20 + (i % 50)) }, distance: { data: Array.from({ length: n }, (_, i) => i * 8) },
  heartrate: { data: Array.from({ length: n }, (_, i) => 120 + (i % 20)) }, cadence: { data: Array.from({ length: n }, () => 88) },
  watts: { data: Array.from({ length: n }, (_, i) => 180 + (i % 40)) }, velocity_smooth: { data: Array.from({ length: n }, () => 8) } };

test("a ride's streams, as TCX: read back with its power, heart rate, route and start", async () => {
  const xml = tcxOf({ id: 1, name: "Morning <ride>", sport_type: "GravelRide", start_date: start, device_name: "Wahoo & co" }, streams);
  assert.match(xml, /<Name>Wahoo &amp; co<\/Name>/);
  const { activities: [a] } = await readAny("strava-1.tcx", new TextEncoder().encode(xml));
  assert.equal(a.sport, "ride");
  assert.equal(a.start, Date.parse(start));
  assert.equal(a.s.t.length, n);
  assert.equal(a.s.pwr[10], 190);
  assert.equal(a.s.hr[5], 125);
  assert.ok(Math.abs(a.s.lat[100] - 51.46) < 1e-6);
});
test("indoors, with no route: still read, its power and heart rate", async () => {
  const { latlng, ...indoor } = streams;
  const { activities: [a] } = await readAny("s.tcx", new TextEncoder().encode(tcxOf({ id: 2, sport_type: "VirtualRide", start_date: start }, indoor)));
  assert.equal(a.sport, "ride");
  assert.equal(a.s.pwr[0], 180);
  assert.ok(!a.s.lat?.some((x) => x != null));
});
test("Strava's sports, as Fitness's", () => {
  for (const [t, s] of [["Ride", "ride"], ["VirtualRide", "ride"], ["MountainBikeRide", "ride"], ["EBikeRide", "ride"], ["Run", "run"], ["TrailRun", "run"], ["Swim", "swim"], ["Walk", "walk"], ["Hike", "walk"], ["WeightTraining", "strength"], ["Rowing", "other"]])
    assert.equal(sportOf({ sport_type: t }), s, t);
  assert.equal(sportOf({ type: "Ride" }), "ride");
});
