// Fitness's "Send to a friend" (fitness/send.js) and plans made in Chat (fitness/invites.js): the session as a card
// Chat keeps (pigeon/cards.js normCard), with no share id (Chat makes that as the letter goes), the address it goes to,
// and the rule for who a day's session is with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionSendCard, chatHash, chatPage, durWords } from "../../../fitness/send.js";
import { withOf, withOffer, waiting, offerWords, dayWord, withLine, addWords } from "../../../fitness/invites.js";
import { startOfDay, addDays } from "../../../fitness/workouts.js";
import { normCard, readShareHash } from "../../../pigeon/cards.js";

const H = 3600e3;
const TODAY = startOfDay(Date.now());
const keyOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ride = { id: "endurance-90", sport: "ride", name: "Endurance 90", kind: "Endurance", secs: 5400, tss: 62.4 };

test("a session's card passes Chat's checks and carries no share id", () => {
  const best = { start: TODAY + 18 * H, end: TODAY + 19 * H + 30 * 60e3, dry: true };
  const c = sessionSendCard({ day: TODAY, tz: "Europe/London", w: ride, best });
  const n = normCard(c);
  assert.ok(n, "normCard keeps it");
  assert.equal(c.kind, "fitness"); assert.equal(c.from, "fitness");
  assert.ok(!("ref" in c), "no ref"); assert.ok(!("ref" in n));
  assert.equal(n.snap.day, keyOf(TODAY));
  assert.equal(n.snap.sport, "ride"); assert.equal(n.snap.name, "Endurance 90"); assert.equal(n.snap.kind, "Endurance");
  assert.equal(n.snap.wid, "endurance-90"); assert.equal(n.snap.secs, 5400); assert.equal(n.snap.tss, 62);
  assert.deepEqual(n.snap.best, { start: best.start, end: best.end, dry: true });
  assert.equal(n.snap.done, null);
  assert.match(c.say, /^Today: Endurance 90, 1 h 30 min\. Best time to ride \d\d:\d\d to \d\d:\d\d\.$/);
  assert.equal(durWords(4500), "1 h 15 min");
});

test("done: its figures only where known, no best time; nothing a card can't carry", () => {
  const c = sessionSendCard({ day: TODAY, tz: "Europe/London", w: ride, done: { sport: "ride", name: "Morning ride", secs: 3720, dist: 30400, tss: null }, best: { start: TODAY, end: TODAY + H, dry: true } });
  const n = normCard(c);
  assert.ok(n);
  assert.deepEqual(n.snap.done, { secs: 3720, dist: 30400 });
  assert.equal(n.snap.best, null);
  assert.equal(n.snap.name, "Endurance 90", "the session as planned, where it's the same sport");
  assert.equal(c.say, "Rode my endurance session today: Endurance 90.");
  // (another sport than planned, or nothing planned: what was done, by its sport, never its own name, which no view
  // of a done card shows)
  const r = sessionSendCard({ day: TODAY, w: ride, done: { sport: "run", name: "Physio at St Mary's, then home", secs: 1800 } });
  assert.equal(normCard(r).snap.name, "Run"); assert.equal(r.say, "Out on a run today.");
  assert.ok(!JSON.stringify(r).includes("Physio"), "the activity's own name isn't sealed");
  const r2 = sessionSendCard({ day: TODAY, done: { sport: "ride", name: "Physio at St Mary's, then home", secs: 1800 } });
  assert.equal(normCard(r2).snap.name, "Ride"); assert.ok(!JSON.stringify(r2).includes("Physio"));
  assert.ok(!("wid" in r.snap) && !("kind" in r.snap));
  // (done, no figures at all: still done)
  assert.deepEqual(normCard(sessionSendCard({ day: TODAY, done: { sport: "swim", name: "Swim" } })).snap.done, {});
  // (a sport Chat doesn't know, or no name: no card)
  assert.equal(sessionSendCard({ day: TODAY, done: { sport: "yoga", name: "Yoga" } }), null);
  assert.equal(sessionSendCard({ day: TODAY, w: { ...ride, name: "" } }), null);
  assert.equal(sessionSendCard({ day: "1 Nov", w: ride }), null);
  // (a zone a browser doesn't know: left out)
  assert.ok(!("tz" in sessionSendCard({ day: TODAY, tz: "x", w: ride }).snap));
});

test("to Chat: chatPage() + chatHash(…) has /#share= first, and Chat reads both back, still with no share id", () => {
  const c = sessionSendCard({ day: TODAY, tz: "Europe/London", w: ride });
  const page = chatPage({ hostname: "fitness.inflite.ai", origin: "https://fitness.inflite.ai" });
  assert.equal(page, "https://chat.inflite.ai/");
  assert.equal(chatPage({ hostname: "localhost", origin: "http://localhost:8788" }), null);
  const url = page + chatHash(c.say, c);
  assert.ok(url.startsWith("https://chat.inflite.ai/#share="), url.slice(0, 60));
  const got = readShareHash(new URL(url).hash);
  assert.equal(got.words, c.say);
  assert.equal(got.card.kind, "fitness");
  assert.ok(!got.card.ref);
  // (even one with a share id put in by hand loses it in Chat: only the sending Chat adds one)
  const forged = page + chatHash(c.say, { ...c, ref: { share: "A".repeat(22) } });
  assert.ok(!readShareHash(new URL(forged).hash).card.ref);
});

test("who a day's session is with: an agreed plan whose workout is that day's swap", () => {
  const sat = addDays(TODAY, 2), start = sat + 10 * H, stop = sat + 12 * H;
  const yes = { id: "6f1c2b3a-1111-4222-8333-944455556666", start, stop, sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Leo", role: "asked", far: false, dry: true, state: "yes" };
  assert.equal(withOf(sat, { [sat]: "free-ride" }, [yes]), "Leo");
  assert.equal(withOffer(sat, { [sat]: "free-ride" }, [yes]), yes);
  assert.equal(withOf(sat, { [sat]: "endurance-90" }, [yes]), null, "a different swap: nothing");
  assert.equal(withOf(sat, {}, [yes]), null, "no swap: nothing");
  assert.equal(withOf(sat, { [sat]: "free-ride" }, [{ ...yes, state: "new" }]), null, "a plan not added yet: nothing");
  assert.equal(withOf(addDays(sat, 1), { [addDays(sat, 1)]: "free-ride" }, [yes]), null, "another day: nothing");
  assert.equal(withOf(sat, { [sat]: "free-ride" }, null), null);
  assert.equal(withLine(yes), "Riding with Leo, 10:00–12:00.");
  assert.equal(withLine({ ...yes, sport: "run" }), "Running with Leo, 10:00–12:00.");
});

test("plans waiting: new and not over, soonest first, in Fitness's words", () => {
  const now = TODAY + 9 * H, at = (d, h) => addDays(TODAY, d) + h * H;
  const o = (id, d, state = "new", extra = {}) => ({ id, start: at(d, 10), stop: at(d, 12), sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, who: "Leo", role: "asked", far: false, dry: true, state, ...extra });
  const list = [o("b", 2), o("a", 1), o("c", 1, "yes"), o("d", -1), o("e", 3, "no")];
  assert.deepEqual(waiting(list, { now }).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(waiting(list, { now, hidden: new Set(["a"]) }).map((x) => x.id), ["b"]);
  assert.deepEqual(waiting(null), []);
  const w = offerWords(o("a", 1), now);
  assert.equal(w.title, "Ride with Leo");
  assert.equal(w.when, "Tomorrow 10:00–12:00 · Ride how you like");
  assert.equal(w.line, "Leo said yes in Chat. Add it to your plan?");
  assert.equal(w.far, null);
  const r = offerWords(o("x", 0, "new", { sport: "run", role: "answered", far: true, name: "Easy run 40" }), now);
  assert.equal(r.title, "Run with Leo");
  assert.equal(r.when, "Today 10:00–12:00 · Easy run 40");
  assert.equal(r.line, "You said yes to Leo in Chat. Add it to your plan?");
  assert.equal(r.far, "Same time, each where you are.");
  const day = addDays(TODAY, 3), name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(day).getDay()];
  assert.equal(dayWord(day + 10 * H, now), name);
});

test("adding a plan: what it does to its day, by what's planned there", () => {
  const base = { word: "Saturday", wid: "free-ride", name: "Ride how you like", who: "Leo", span: "10:00–12:00" };
  const end90 = { id: "endurance-90", name: "Endurance 90" };
  assert.equal(addWords({ ...base, was: "endurance-90", ww: end90 }), "Saturday: Endurance 90 becomes Ride how you like, with Leo, 10:00–12:00.");
  assert.equal(addWords({ ...base, was: "free-ride", ww: { id: "free-ride", name: "Ride how you like" } }), "Saturday: Ride how you like, with Leo, 10:00–12:00.");
  // (a rest day: the plan's, or Rhythm's, null; or a workout gone from yours since, which Today shows as rest)
  assert.equal(addWords({ ...base, was: null, ww: null }), "Saturday is a rest day: Ride how you like with Leo goes in its place.");
  assert.equal(addWords({ ...base, was: "my-old-one", ww: null }), "Saturday is a rest day: Ride how you like with Leo goes in its place.");
  // (nothing planned yet: past Rhythm's days, or no plan at all; not a rest day)
  assert.equal(addWords({ ...base, was: undefined, ww: null }), "Saturday isn't planned yet: Ride how you like with Leo goes in.");
  assert.equal(addWords({ ...base, was: "event", ww: null }), "Saturday is your event day: Ride how you like with Leo goes in its place.");
});
