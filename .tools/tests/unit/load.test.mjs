// Fitness's ride figures (fitness/load.js): a ride of days counted whole, its nights left out of its power and stress
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, perSecond, movingOf } from "../../../fitness/load.js";

const H = 3600, FTP = 250;
// A ride of days, a second a sample: eight hours a day of 180 to 239 W at 8 m/s, and between them a night, the
// device stopped (no samples) or left recording where it stood (still samples, no speed or power)
function ride(days, { kept = false, cafe = 0 } = {}) {
  const t = [], pwr = [], hr = [], spd = [], dist = [];
  let x = 0, d = 0;
  const at = (p, v) => { t.push(x++); pwr.push(p); hr.push(p ? 140 : 60); spd.push(v); d += v; dist.push(d); };
  for (let day = 0; day < days; day++) {
    for (let i = 0; i < 8 * H; i++) { if (cafe && i === 4 * H) for (let j = 0; j < cafe; j++) at(0, 0); at(180 + (i % 60), 8); }
    if (day < days - 1) { if (kept) for (let i = 0; i < 16 * H; i++) at(0, 0); else x += 16 * H; }
  }
  return { sport: "ride", s: { t, pwr, hr, spd, dist, cad: null, ele: null } };
}

test("a three-day ride: moving time, distance, power and stress over all of it, the nights left out", () => {
  const one = summarise(ride(1), { ftp: FTP });
  for (const kept of [false, true]) {
    const s = summarise(ride(3, { kept }), { ftp: FTP });
    assert.ok(Math.abs(s.moving - 3 * 8 * H) <= 2, `every day's riding, past the second day: ${s.moving}`);
    assert.equal(s.dist, 3 * 8 * H * 8 - 8, "as far as it went");
    assert.ok(Math.abs(s.np - one.np) <= 1, `Normalized Power as a day's: ${s.np} against ${one.np}`);
    assert.ok(Math.abs(s.avgPwr - one.avgPwr) <= 1, "average power over the riding, not the nights");
    assert.ok(Math.abs(s.tss - 3 * one.tss) <= 3, `stress three days' worth: ${s.tss} against ${one.tss} a day`);
    assert.ok(s.hrZones.reduce((a, b) => a + b, 0) < 3 * 8 * H + 60, "no night in the heart rate zones");
    assert.ok(Math.abs(s.avgSpd - 8) < 0.01);
  }
});

test("a stop of under an hour still counts, as it always has", () => {
  const s = summarise(ride(1, { cafe: 40 * 60 }), { ftp: FTP }), one = summarise(ride(1), { ftp: FTP });
  assert.equal(s.moving, one.moving);
  assert.ok(s.np < one.np && s.tss > one.tss, "its 40 minutes as nothing, in the rolling power and the time");
});

test("the seconds held are capped by memory, not by days; moving time counted past them", () => {
  const t = [], pwr = [];
  for (let i = 0; i < 1000; i++) { t.push(i); pwr.push(200); }
  t.push(30 * 86400); pwr.push(200);   // (a last sample dated a month on, a device's fault)
  const a = { sport: "ride", s: { t, pwr, hr: t.map(() => 140), spd: t.map(() => 8), cad: t.map(() => 85), ele: t.map(() => 10), dist: t.map((v, i) => i * 8) } };
  assert.ok(perSecond(a).pwr.length <= 3e6 / 6 + 1, "about 24 MB at most");
  assert.equal(movingOf(a), 1000, "the month's gap not moving");
  assert.equal(perSecond(ride(4)).moving.length, 3 * 24 * H + 8 * H, "four days held whole");
});

test("a ride past the seconds held: the rest taken as more of the same, for its stress and its work", () => {
  // (ten days on four sensors: past the 750,000 seconds held, so the tenth day's riding isn't among them)
  const a = ride(10), one = summarise(ride(1), { ftp: FTP }), s = summarise(a, { ftp: FTP });
  assert.ok(perSecond(a).moving.length < a.s.t[a.s.t.length - 1], "not all of it held");
  assert.ok(Math.abs(s.moving - 10 * 8 * H) <= 9, `every day's riding: ${s.moving}`);
  assert.ok(Math.abs(s.tss - 10 * one.tss) <= 10, `stress ten days' worth: ${s.tss} against ${one.tss} a day`);
  assert.ok(Math.abs(s.kj - 10 * one.kj) <= 10, `work ten days' worth: ${s.kj} against ${one.kj} a day`);
});
