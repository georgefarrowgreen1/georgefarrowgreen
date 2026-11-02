// Send to a friend: who should know (pigeon/rank.js). Every reason with its exact words, "Best fit" only at 60 or
// more, and friends who can't be sent to at the foot with why.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normCard } from "../../../pigeon/cards.js";
import { rankFriends, seenFrom, rainAsk } from "../../../pigeon/rank.js";

const H = 3600e3, MIN = 60e3, LON = "Europe/London";
const NOW = Date.parse("2026-11-05T10:00:00Z");      // a Thursday
const me = { id: "me", lat: 52.8, lon: 1.4, tz: LON };
const W = normCard({ kind: "weather", at: NOW, snap: { place: "North Walsham", tz: LON, temp: 12 }, ref: { cell: [52.8, 1.4] } });
const ride = normCard({ kind: "fitness", at: NOW, snap: { day: "2026-11-05", sport: "ride", name: "Endurance 75" } });
const run = normCard({ kind: "fitness", at: NOW, snap: { day: "2026-11-05", sport: "run", name: "Easy run" } });
const M = normCard({ kind: "markets", at: NOW, snap: { name: "Rolls-Royce", sym: "RR.L", pct: 1.2 }, ref: { sym: "RR.L" } });
const f = (id, name, o = {}) => ({ id, name, place: o.place ?? name + "ton", lat: o.lat ?? 52.9, lon: o.lon ?? 1.3, tz: o.tz ?? LON, ...o });
const one = (card, friend, o = {}) => rankFriends(card, { friends: [friend], me, now: NOW, landsIn: () => 8 * MIN, ...o })[0];

test("a streak about to end, whatever the card", () => {
  const leo = f("leo", "Leo");
  let r = one(W, leo, { streakRisk: () => ({ n: 12, endsAt: NOW + 4 * H }) });
  assert.deepEqual([r.score, r.reason], [75, "Your 12-day streak ends tonight"]);
  r = one(M, leo, { streakRisk: () => ({ n: 12, endsAt: NOW + 40 * MIN }) });
  assert.equal(r.reason, "Your 12-day streak ends in 40m");
  r = one(W, leo, { streakRisk: () => ({ n: 2, endsAt: NOW + H }) });
  assert.equal(r.reason, "Lands in 8m", "under three days isn't a streak");
  r = one(W, leo, { streakRisk: () => ({ n: 9, endsAt: NOW + 7 * H }) });
  assert.equal(r.reason, "Lands in 8m", "six hours or more to go isn't at risk");
});
test("weather: rain reaching them, raining now, dry all day", () => {
  const cromer = f("c", "Cat", { place: "Cromer" });
  let r = one(W, cromer, { rain: { c: { now: false, at: Date.parse("2026-11-05T14:40:00Z"), end: NOW + 6 * H } } });
  assert.equal(r.reason, "The rain reaches Cromer at 14:40");
  assert.equal(r.score, Math.round(95 - 3 * (4 + 40 / 60)));
  const ny = f("n", "Nia", { place: "New York", tz: "America/New_York" });
  r = one(W, ny, { rain: { n: { now: false, at: Date.parse("2026-11-05T14:40:00Z") } } });
  assert.equal(r.reason, "The rain reaches New York at 09:40 their time");
  r = one(W, cromer, { rain: { c: { now: true, at: NOW, end: NOW + H } } });
  assert.deepEqual([r.score, r.reason], [70, "Raining in Cromer now"]);
  const paris = f("p", "Pat", { place: "Paris" });
  r = one(W, paris, { rain: { p: null } });
  assert.deepEqual([r.score, r.reason], [20, "Dry in Paris all day"]);
  r = one(W, paris, { rain: {} });
  assert.equal(r.reason, "Lands in 8m", "a friend the server couldn't tell about");
  r = one(W, cromer, { rain: { c: { now: false, at: NOW + 13 * H } } });
  assert.equal(r.reason, "Lands in 8m", "more than 12 hours off");
});
test("fitness: rides too near and far, near enough to join", () => {
  const ade = f("ade", "Ade", { lat: 52.95, lon: 1.25 });         // about 20 km
  const seen = seenFrom([{ from: "ade", to: "me", payload: { t: "x", c: ride } }, { from: "far", to: "me", payload: { t: "x", c: ride } }], "me");
  let r = one(ride, ade, { seen });
  assert.equal(r.score, 90); assert.match(r.reason, /^Rides too · \d+ mi away$/);
  assert.equal(r.reason, "Rides too · 12 mi away");
  r = one(ride, f("far", "Fi", { lat: 51.5, lon: -0.12 }), { seen });
  assert.deepEqual([r.score, r.reason], [35, "Rides too · too far to join"]);
  r = one(run, ade, { seen: seenFrom([{ from: "ade", to: "me", payload: { t: "x", c: run } }], "me") });
  assert.equal(r.reason, "Runs too · 12 mi away");
  r = one(run, ade, { seen });
  assert.deepEqual([r.score, r.reason], [55, "Near enough to join · 12 mi away"], "a ride from them isn't a run");
  r = one(ride, f("x", "Xa", { lat: 53.2, lon: 1.4 }), { seen: new Map() });
  assert.equal(r.reason, "Lands in 8m", "over 25 km and no card");
  // a card you sent doesn't say they ride
  r = one(ride, ade, { seen: seenFrom([{ from: "me", to: "ade", payload: { t: "x", c: ride } }], "me") });
  assert.match(r.reason, /^Near enough to join/);
});
test("markets: sent before, sends you them too", () => {
  const leo = f("leo", "Leo");
  let r = one(M, leo, { seen: seenFrom([{ from: "me", to: "leo", payload: { t: "x", c: M } }], "me") });
  assert.deepEqual([r.score, r.reason], [55, "You’ve sent Markets cards before"]);
  r = one(M, leo, { seen: seenFrom([{ from: "leo", to: "me", payload: { t: "x", c: M } }], "me") });
  assert.deepEqual([r.score, r.reason], [50, "Sends you Markets cards too"]);
});
test("a letter this week: +10 to a reason, or a reason of its own", () => {
  const leo = f("leo", "Leo");
  let r = one(W, leo, { lastAt: () => NOW - H });
  assert.deepEqual([r.score, r.reason], [15, "Wrote today"]);
  assert.equal(one(W, leo, { lastAt: () => NOW - 24 * H }).reason, "Wrote yesterday");
  assert.equal(one(W, leo, { lastAt: () => Date.parse("2026-11-02T12:00:00Z") }).reason, "Wrote on Monday");
  assert.equal(one(W, leo, { lastAt: () => NOW - 8 * 24 * H }).reason, "Lands in 8m");
  r = one(W, leo, { lastAt: () => NOW - H, streakRisk: () => ({ n: 5, endsAt: NOW + H * 2 }) });
  assert.deepEqual([r.score, r.reason], [85, "Your 5-day streak ends tonight"]);
});
test("none of these: by flight time", () => {
  const r = rankFriends(W, { friends: [f("a", "Al"), f("b", "Bo")], me, now: NOW, landsIn: (x) => (x.id === "a" ? 2 * H : 8 * MIN) });
  assert.deepEqual(r.map((x) => [x.id, x.reason]), [["b", "Lands in 8m"], ["a", "Lands in 2h"]]);
  assert.ok(r.every((x) => !x.best));
  assert.equal(r[0].lands, 8 * MIN);
});
test("Best fit goes to the top friend only, and only at 60 or more", () => {
  const rain = { a: { now: false, at: NOW + 2 * H }, b: { now: true } };
  let r = rankFriends(W, { friends: [f("a", "Al"), f("b", "Bo"), f("c", "Cy")], me, now: NOW, rain, landsIn: () => 8 * MIN });
  assert.deepEqual(r.map((x) => [x.id, x.best]), [["a", true], ["b", false], ["c", false]]);
  r = rankFriends(W, { friends: [f("a", "Al")], me, now: NOW, rain: { a: null }, landsIn: () => 8 * MIN });
  assert.equal(r[0].best, false, "20 isn't a fit");
});
test("ties: the most recent letter first, then by name", () => {
  const r = rankFriends(M, { friends: [f("z", "Zoe"), f("a", "Amy"), f("m", "Max")], me, now: NOW, landsIn: () => 8 * MIN, lastAt: (x) => (x.id === "m" ? NOW - 5 * H : NOW - 2 * H) });
  // all "Wrote today" at 15: Amy and Zoe wrote more recently than Max; Amy before Zoe by name
  assert.deepEqual(r.map((x) => x.id), ["a", "z", "m"]);
});
test("friends who can't be sent to: at the foot, greyed, with canFly's words", () => {
  const why = { k: "Check the new safety number first", l: "No location yet", m: "Send from the chat", p: "No pigeon free just now" };
  const friends = [f("k", "Kit"), f("l", "Lou", { lat: null, lon: null }), f("m", "Mo"), f("p", "Pip"), f("ok", "Ola")];
  const r = rankFriends(W, { friends, me, now: NOW, rain: { k: { now: true } }, landsIn: () => 8 * MIN, canFly: (x) => why[x.id] ?? null });
  assert.equal(r[0].id, "ok"); assert.equal(r[0].can, true); assert.equal(r[0].why, null);
  for (const x of r.slice(1)) { assert.equal(x.can, false); assert.equal(x.why, why[x.id]); assert.equal(x.best, false); }
  assert.ok(r.find((x) => x.id === "k").score > r[0].score, "even a higher score stays at the foot");
});
test("seenFrom reads only checked cards, and rainAsk the nearest within 300 km", () => {
  const s = seenFrom([{ from: "a", to: "me", payload: { t: "x", c: { kind: "fitness", snap: { sport: "ride" } } } }, { from: "a", to: "me", payload: null }, null, { from: "x", to: "y", payload: { t: "", c: ride } }], "me");
  assert.equal(s.get("a"), undefined, "an unchecked card counts for nothing");
  assert.equal(s.get("x"), undefined, "not a letter of yours");
  const friends = [f("near", "N", { lat: 52.9, lon: 1.3 }), f("mid", "M", { lat: 52.2, lon: 0.1 }), f("far", "F", { lat: 48.85, lon: 2.35 }), f("none", "X", { lat: null, lon: null })];
  assert.deepEqual(rainAsk(W, friends), ["near", "mid"]);
  assert.deepEqual(rainAsk(W, friends, 1), ["near"]);
  assert.deepEqual(rainAsk(M, friends), []);
});
