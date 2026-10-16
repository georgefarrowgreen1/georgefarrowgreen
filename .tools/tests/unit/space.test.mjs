// The space maths (pigeon/space.js), shared by the phone and the server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inShadow, eclipseBetween, lunarDay, orbitAt, orbitFlight, spaceFlight, legOf, spaceLegs, marsKm, lightMs } from "../../../pigeon/space.js";

const at = (d, hm) => Date.parse(`${d}T${hm}Z`);
// Lunar eclipses: when the Moon enters and leaves the umbra (U1, U4), in UT
const ECLIPSES = [["2021-11-19", "07:18", "10:47"], ["2022-11-08", "09:09", "12:49"], ["2023-10-28", "19:35", "20:52"], ["2024-09-18", "02:12", "03:16"],
  ["2025-03-14", "05:09", "08:47"], ["2025-09-07", "16:27", "19:57"], ["2026-03-03", "09:50", "13:17"], ["2026-08-28", "02:33", "05:52"], ["2028-01-12", "03:45", "04:42"]];
for (const [d, u1, u4] of ECLIPSES) test(`the eclipse of ${d} begins and ends within 3 minutes`, () => {
  let s = null, e = null;
  for (let t = at(d, "00:00") - 12 * 3600e3; t < at(d, "00:00") + 36 * 3600e3; t += 60e3) if (inShadow(t)) { s ??= t; e = t; }
  assert.ok(s != null, "found");
  assert.ok(Math.abs(s - at(d, u1)) <= 3 * 60e3, `starts ${new Date(s).toISOString()}`);
  assert.ok(Math.abs(e - at(d, u4)) <= 3 * 60e3, `ends ${new Date(e).toISOString()}`);
  const first = eclipseBetween(at(d, "00:00") - 5 * 864e5, at(d, "23:59"));
  assert.ok(first && Math.abs(first.at - at(d, u1)) <= 3 * 60e3);
});
test("a penumbral eclipse isn't one (the Moon never reaches the umbra)", () => {
  for (const d of ["2024-03-25", "2023-05-05"]) assert.equal(eclipseBetween(at(d, "00:00") - 864e5, at(d, "00:00") + 2 * 864e5), null, d);
});
test("lunar day and night: a change within a month, even at a pole", () => {
  const t = Date.now();
  for (const lat of [0, 45, -89, 90, -90]) { const d = lunarDay(lat, 20, t); assert.ok(d.next > t && d.next - t < 31 * 864e5, `lat ${lat}`); }
});
test("an orbit's ground track stays within ±180° of longitude, however many laps", () => {
  const o = orbitFlight({ b: "earth", lat: 44.1, lon: -169.4 }, { b: "earth", lat: -47.7, lon: 132 }, Date.now());
  for (let tau = 0; tau < 86400e3; tau += 60e3) { const [, lo] = orbitAt(o, tau); assert.ok(lo >= -180 && lo <= 180, String(lo)); }
});
test("laser pigeons go at the speed of light: 3 to 22 minutes to Mars", () => {
  for (let t = Date.now(), i = 0; i < 30; i++, t += 30 * 864e5) { const m = lightMs(marsKm(t)) / 60e3; assert.ok(m > 3 && m < 23, String(m)); }
  const f = spaceFlight("laser", { b: "earth", lat: 51.5, lon: 0 }, { b: "mars", lat: 18.4, lon: 77.5 }, Date.now());
  assert.ok(f.ms > 3 * 60e3 && f.ms < 23 * 60e3);
});
test("a relayed pigeon's legs, in order", () => {
  const prev = { k: "trip", t0: 1000 }, mn = { k: "laser", t0: 5000, prev };
  assert.equal(legOf(mn, 1000, 6000, 3000).mn, prev);
  assert.equal(legOf(mn, 1000, 6000, 3000).then, mn);
  assert.equal(legOf(mn, 1000, 6000, 5500).mn, mn);
  assert.deepEqual(spaceLegs(mn, 1000, 6000).map((l) => [l.from, l.to]), [[1000, 5000], [5000, 6000]]);
});
