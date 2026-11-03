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
test("pigeons off: no landing time and no streak (landsIn null, no streakRisk), so no “Lands in” and no streak reason", () => {
  const leo = f("leo", "Leo");
  let r = one(W, leo, { landsIn: () => null });
  assert.deepEqual([r.score, r.reason, r.lands], [0, "", null]);
  r = one(M, leo, { landsIn: () => null, lastAt: () => NOW - H });
  assert.deepEqual([r.score, r.reason], [15, "Wrote today"], "the other reasons as ever");
  r = one(W, f("c", "Cat", { place: "Cromer" }), { landsIn: () => null, rain: { c: { now: true, at: NOW, end: NOW + H } } });
  assert.equal(r.reason, "Raining in Cromer now");
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

// ---------- Today First's reasons (spec §8.3): built on the phone, passed in beside seen ----------
const T = normCard({ kind: "markets", at: NOW, snap: { name: "Tesco", sym: "TSCO.L", pct: 3.4 }, ref: { sym: "TSCO.L" } });
const THERE = normCard({ kind: "weather", from: "chat", there: true, at: NOW, snap: { place: "Norwich", tz: LON, temp: 12 }, ref: { cell: [52.63, 1.29], friend: "leo" } });
const at = (iso) => Date.parse(iso);
test("there: “Where Leo is” at 100, Leo only, and no one else can have the card", () => {
  const friends = [f("pat", "Pat Lee"), f("leo", "Leo Smith"), f("mira", "Mira")];
  const r = rankFriends(THERE, { friends, me, now: NOW, landsIn: () => 8 * MIN, rain: { pat: { now: true } }, lastAt: () => NOW - H });
  assert.deepEqual([r[0].id, r[0].score, r[0].reason, r[0].best, r[0].can], ["leo", 110, "Where Leo is", true, true], "and a letter this week adds its 10");
  for (const x of r.slice(1)) { assert.equal(x.can, false); assert.equal(x.why, "Only for Leo"); assert.equal(x.best, false); }
  assert.equal(r.find((x) => x.id === "pat").reason, "Raining in Pat Leeton now", "their own reasons still said, greyed");
  // canFly's words first, where it has any
  assert.equal(rankFriends(THERE, { friends, me, now: NOW, canFly: (x) => (x.id === "leo" ? "Check the new safety number first" : null) })[0].can, false);
  // whom it's for: the opt, else the card's own; no friend in it at all: no one
  assert.equal(rankFriends(THERE, { friends, me, now: NOW, there: "mira" }).find((x) => x.can).id, "mira");
  const nobody = normCard({ ...THERE, ref: { cell: [52.6, 1.3] } });
  assert.ok(rankFriends(nobody, { friends, me, now: NOW }).every((x) => !x.can && x.why === "Only for the friend it’s about"));
  // (a card that isn't one: there says nothing)
  assert.ok(rankFriends(W, { friends, me, now: NOW, there: "leo" }).every((x) => x.can && x.reason !== "Where Leo is"));
});
test("asked: the stock in what they said, at 95, with when they said it", () => {
  const pat = f("pat", "Pat");
  const tp = (o) => [{ id: "pat", topics: [{ kind: "markets", sym: "TSCO.L", name: "Tesco PLC", at: NOW - H, asked: true, via: "words", ...o }] }];
  let r = one(T, pat, { asked: tp() });
  assert.deepEqual([r.score, r.reason], [95, "Asked about Tesco this morning"], "the card's own name");
  assert.equal(one(T, pat, { asked: tp({ at: at("2026-11-05T13:10:00Z") }), now: at("2026-11-05T15:00:00Z") }).reason, "Asked about Tesco this afternoon");
  assert.equal(one(T, pat, { asked: tp({ at: at("2026-11-05T19:10:00Z") }), now: at("2026-11-05T21:00:00Z") }).reason, "Asked about Tesco this evening");
  assert.equal(one(T, pat, { asked: tp({ at: NOW - 24 * H }) }).reason, "Asked about Tesco yesterday");
  assert.equal(one(T, pat, { asked: tp({ at: at("2026-11-02T12:00:00Z") }) }).reason, "Asked about Tesco on Monday");
  assert.equal(one(T, pat, { asked: tp({ at: undefined }) }).reason, "Asked about Tesco");
  assert.equal(one(T, pat, { asked: tp({ asked: false }) }).reason, "Mentioned Tesco this morning");
  assert.equal(one(T, pat, { asked: tp({ asked: false, via: "card" }) }).reason, "Sent you Tesco this morning");
  assert.equal(one(T, pat, { asked: new Map([["pat", tp()[0].topics]]) }).reason, "Asked about Tesco this morning", "a Map does as well");
  assert.equal(one(M, pat, { asked: tp(), landsIn: () => null }).reason, "", "another stock: nothing");
  assert.equal(one(W, pat, { asked: tp(), landsIn: () => null }).reason, "", "nor any other card");
  assert.equal(one(T, f("leo", "Leo"), { asked: tp(), landsIn: () => null }).reason, "", "nor anyone else");
});
test("planned: a ride with them, at 90, on fitness and weather cards", () => {
  const leo = f("leo", "Leo", { lat: 51.5, lon: -0.12 });        // (in London: too far for "Near enough to join")
  const thu10 = at("2026-11-05T14:00:00Z"), plan = (o) => ({ planned: [{ with: "leo", start: thu10, stop: thu10 + 2 * H, sport: "ride", ...o }], landsIn: () => null });
  assert.deepEqual([one(ride, leo, plan()).score, one(ride, leo, plan()).reason], [90, "Riding with you today"]);
  assert.equal(one(W, leo, plan()).reason, "Riding with you today", "the weather, for the ride");
  assert.equal(one(M, leo, plan()).reason, "", "not a stock");
  assert.equal(one(ride, leo, plan({ start: at("2026-11-06T10:00:00Z"), stop: at("2026-11-06T12:00:00Z") })).reason, "Riding with you tomorrow");
  assert.equal(one(ride, leo, plan({ start: at("2026-11-08T10:00:00Z"), stop: at("2026-11-08T12:00:00Z") })).reason, "Riding with you Sunday");
  assert.equal(one(ride, leo, plan({ start: at("2026-11-12T09:00:00Z"), stop: at("2026-11-12T11:00:00Z") })).reason, "Riding with you on Thu 12 Nov", "a week on, the date");
  assert.equal(one(ride, leo, plan({ start: at("2026-11-13T09:00:00Z"), stop: at("2026-11-13T11:00:00Z") })).reason, "", "further off: nothing");
  assert.equal(one(ride, leo, plan({ sport: "run" })).reason, "Running with you today");
  assert.equal(one(ride, leo, plan({ state: "yes" })).reason, "Riding with you today", "agreed");
  for (const state of ["no", "pending"]) assert.equal(one(ride, leo, plan({ state })).reason, "", state);
  assert.equal(one(ride, leo, plan({ start: NOW - 3 * H, stop: NOW - H })).reason, "", "over already");
  assert.equal(one(ride, leo, plan({ start: NOW - H, stop: NOW + H, sport: undefined })).reason, "Riding with you today", "under way still counts");
  assert.equal(one(ride, leo, { planned: [{ withId: "leo", start: thu10, end: thu10 + 2 * H }] }).reason, "Riding with you today", "an invite from the letters (withId, end)");
  assert.equal(one(ride, leo, { planned: [{ with: "leo", start: at("2026-11-07T10:00:00Z") }, { with: "leo", start: at("2026-11-06T10:00:00Z") }, { with: "pat", start: thu10 }] }).reason, "Riding with you tomorrow", "the soonest of Leo's");
  // a reason already higher stays (rain reaching them in the hour)
  const r = one(W, leo, { ...plan(), rain: { leo: { now: false, at: NOW + 30 * MIN } } });
  assert.equal(r.score, 94); assert.match(r.reason, /^The rain reaches/);
});
test("calls: a time agreed, at 85, whatever the card", () => {
  const nia = f("nia", "Nia");
  const call = (o) => ({ calls: [{ id: "x", with: "nia", kind: "call", start: at("2026-11-05T18:30:00Z"), stop: at("2026-11-05T19:00:00Z"), ...o }], landsIn: () => null });
  for (const card of [W, ride, M, T]) assert.deepEqual([one(card, nia, call()).score, one(card, nia, call()).reason], [85, "Calling at 18:30"], card.kind);
  assert.equal(one(W, nia, call({ kind: "meet" })).reason, "Meeting at 18:30");
  assert.equal(one(W, nia, call({ start: at("2026-11-06T18:30:00Z"), stop: at("2026-11-06T19:00:00Z") })).reason, "Calling tomorrow at 18:30");
  assert.equal(one(W, nia, call({ start: at("2026-11-07T10:00:00Z"), stop: at("2026-11-07T10:30:00Z") })).reason, "Calling Saturday at 10:00");
  assert.equal(one(W, f("ny", "Al", { tz: "America/New_York" }), { ...call({ with: "ny" }), me: { ...me, tz: "America/New_York" } }).reason, "Calling at 13:30", "on your own clock");
  assert.equal(one(W, nia, call({ start: NOW - 2 * H, stop: NOW - H })).reason, "", "over already");
  assert.equal(one(W, nia, { calls: new Map([["nia", { kind: "call", start: at("2026-11-05T18:30:00Z") }]]) }).reason, "Calling at 18:30", "a Map, one row");
  // (beside the others: there 100 > asked 95 > planned 90 > calls 85)
  const r = rankFriends(T, { friends: [f("nia", "Nia"), f("pat", "Pat")], me, now: NOW, landsIn: () => null, ...call(), asked: [{ id: "pat", topics: [{ sym: "TSCO.L", at: NOW - H, asked: true }] }] });
  assert.deepEqual(r.map((x) => [x.id, x.score]), [["pat", 95], ["nia", 85]]);
});
test("junk in the new options never throws, and changes nothing", () => {
  const leo = f("leo", "Leo", { lat: 51.5, lon: -0.12 });
  for (const junk of [null, 5, "x", {}, [null, 5, "x", {}], [{ with: 5, start: "x" }], new Map([["leo", null]]), new Map([["leo", [null, { start: NaN }]]])]) {
    const r = one(ride, leo, { asked: junk, planned: junk, calls: junk, there: junk });
    assert.equal(r.reason, "Lands in 8m", String(junk));
  }
});
