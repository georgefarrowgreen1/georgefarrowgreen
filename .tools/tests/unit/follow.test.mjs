// Pigeons follow someone to another world (functions/_follow.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { followOne } from "../../../functions/_follow.js";

const H = 3600e3, t = Date.parse("2026-10-20T12:00:00Z");
const tycho = { b: "moon", lat: -43.3, lon: -11.4, place: "Tycho, the Moon" }, jezero = { b: "mars", lat: 18.4, lon: 77.5, place: "Jezero Crater, Mars" };
const paris = { b: "earth", lat: 49, lon: 2.5, place: "Paris" };
const earth = { sent_at: t - H, deliver_at: t + H, lost_at: null, km: 340, pigeon: "standard", risky: 0, moon: null, from_lat: 51.5, from_lon: -0.1, to_lat: 48.9, to_lon: 2.35, legs: null };

test("an Earth pigeon to someone who's gone to the Moon is handed to a lunar pigeon, from where it is", () => {
  const x = followOne(earth, tycho, t);
  assert.equal(x.how, "hand"); assert.equal(x.moon.k, "trip"); assert.equal(x.moon.pk, "lunar"); assert.equal(x.moon.t0, t);
  assert.ok(x.deliver - t > 2 * 24 * H && x.deliver - t < 5 * 24 * H);
  assert.ok(x.moon.ground.length >= 2 && x.moon.ground[0][0] === 51.5, "keeps the way it flew on Earth");
});
test("…and to Mars, by laser", () => {
  const x = followOne(earth, jezero, t);
  assert.equal(x.moon.k, "laser"); assert.ok(x.deliver - t < 23 * 60e3);
});
test("an Earth pigeon to someone still on Earth is left to reroute", () => assert.equal(followOne(earth, paris, t), null));
test("a pigeon still in its loft takes off as a space pigeon from home when it would have", () => {
  const x = followOne({ ...earth, sent_at: t + H, deliver_at: t + 3 * H }, tycho, t);
  assert.equal(x.moon.t0, t + H); assert.equal(x.moon.from.lat, 51.5); assert.equal(x.moon.ground, undefined);
});
test("a space pigeon carries on to where they were, then is relayed on", () => {
  const a = followOne(earth, tycho, t), row = { ...earth, moon: JSON.stringify(a.moon), deliver_at: a.deliver, km: a.km, from_lat: null, to_lat: null };
  const b = followOne(row, jezero, t + H);
  assert.equal(b.how, "relay"); assert.equal(b.moon.prev.k, "trip"); assert.equal(b.moon.t0, a.deliver); assert.equal(b.moon.pk, "laser");
  assert.ok(b.deliver > a.deliver && b.deliver - a.deliver < 25 * 60e3);
  // still on the first leg, they come home: the relay comes down to Earth instead
  const c = followOne({ ...row, moon: JSON.stringify(b.moon), deliver_at: b.deliver }, paris, t + 2 * H);
  assert.equal(c.moon.k, "trip"); assert.equal(c.moon.to.b, "earth"); assert.equal(c.moon.prev.k, "trip");
});
test("a new spot on the same world: it just heads there", () => {
  const a = followOne(earth, tycho, t), row = { ...earth, moon: JSON.stringify(a.moon), deliver_at: a.deliver, km: a.km };
  const b = followOne(row, { b: "moon", lat: 26.1, lon: 3.6, place: "Hadley Rille, the Moon" }, t + H);
  assert.equal(b.how, "same"); assert.equal(b.moon.to.lat, 26.1); assert.equal(b.moon.prev, undefined);
  assert.equal(followOne(row, tycho, t + H), null, "the same spot: nothing to do");
});
test("a doomed pigeon is still lost, before it lands", () => {
  const x = followOne({ ...earth, lost_at: t + 0.5 * H }, tycho, t);
  assert.ok(x.lostAt > t && x.lostAt < x.deliver);
});
