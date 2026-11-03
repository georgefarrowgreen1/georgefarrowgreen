// Today First's card formats (spec §8.3, §8.4; pigeon/cards.js, rank.js): the weather where a friend is (there, sent to
// that friend alone), a planned ride's friends (with), a time to talk (the payload's when, and the answer to it by its
// id), each invisible to an older Chat; the four new reasons and their scores; and no amount in any Markets card or its
// words. Plus a seeded fuzz over the new parts.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../pigeon/cards.js";
import * as V from "../../../pigeon/cardview.js";
import { rankFriends } from "../../../pigeon/rank.js";

const H = 3600e3, MIN = 60e3, LON = "Europe/London";
const NOW = Date.parse("2026-11-03T09:00:00Z");                 // a Tuesday, in London's winter (clock = UTC)
const UUID = "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c", LEO = "6f1c2b3a-1111-4222-8333-944455556666";
const at = (iso) => Date.parse(iso);
const there = (o = {}) => ({ v: 1, kind: "weather", from: "chat", there: true, at: NOW, snap: { place: "Norwich", tz: LON, temp: 12, code: 61, isDay: true, rain: { now: true } },
  ref: { cell: [52.6312, 1.2973], friend: LEO }, ...o });
const ride = (snap = {}) => ({ v: 1, kind: "fitness", from: "today", at: NOW, snap: { day: "2026-11-05", tz: LON, sport: "ride", name: "Ride how you like", secs: 7200,
  best: { start: at("2026-11-05T10:00:00Z"), end: at("2026-11-05T12:00:00Z"), dry: true }, done: null, ...snap } });
const when = (o = {}) => ({ kind: "call", start: at("2026-11-03T18:30:00Z"), mins: 30, tz: LON, opts: [at("2026-11-03T19:00:00Z")], ...o });

// an older Chat's payloadParts and normAns (pigeon/cards.js as of Chat 1.67, before Today First), copied as they were
function oldNormAns(x) {
  try {
    if (!x || typeof x !== "object" || Array.isArray(x) || typeof x.re !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.re)) return null;
    const a = ["yes", "later", "no"].includes(x.a) ? x.a : null; if (!a) return null;
    const plan = C.normPlan(x.plan);
    if (a !== "no" && !plan) return null;
    return { re: x.re.toLowerCase(), a, ...(plan ? { plan } : {}) };
  } catch (_) { return null; }
}
const oldHas = (v) => v != null;
function oldPayloadParts(p) {
  const out = { t: "", card: null, ask: null, re: null, plan: null, ans: null };
  try {
    if (!p || typeof p !== "object" || Array.isArray(p)) return out;
    out.t = typeof p.t === "string" ? p.t : "";
    out.card = oldHas(p.c) ? C.normCard(p.c) : null;
    out.ask = out.card && oldHas(p.ask) ? C.normAsk(p.ask, out.card) : null;
    out.re = oldHas(p.re) ? C.normRe(p.re) : null;
    out.plan = oldHas(p.plan) ? C.normPlan(p.plan) : null;
    out.ans = oldHas(p.ans) ? oldNormAns(p.ans) : null;
  } catch (_) {}
  return out;
}

test("there: kept on a weather card with its friend, and nowhere else", () => {
  const c = C.normCard(there());
  assert.equal(c.there, true);
  assert.equal(c.from, "chat");
  assert.deepEqual(c.ref, { cell: [52.65, 1.3], friend: LEO }, "the friend's 0.05° square, never the place, and whom it's for");
  assert.deepEqual(C.normCard(c), c, "checking twice changes nothing");
  assert.equal(C.normCard(there({ there: "yes" })).there, undefined, "only true");
  assert.equal(C.normCard({ ...C.normCard(ride()), there: true }).there, undefined, "a weather card's only");
  const plain = C.normCard(there({ there: undefined }));
  assert.equal(plain.there, undefined);
  assert.deepEqual(plain.ref, { cell: [52.65, 1.3] }, "a friend's id goes with a there card only");
  assert.equal(C.normCard(there({ ref: { cell: [52.6, 1.3], friend: "x y" } })).ref.friend, undefined, "not an id");
  assert.equal(C.liveKey(c), "weather:52.65,1.30", "live through its square, like any weather card");
  assert.deepEqual(C.liveItem(c), { k: "weather", cell: [52.65, 1.3] }, "card-now hears the square, not whom it's for");
  assert.equal(C.unpackCard(C.packCard(c)).there, true);
});
test("canForward: a there card goes to its friend alone", () => {
  const c = C.normCard(there());
  assert.equal(C.canForward(c, { mine: true, to: LEO }), true, "yours, to Leo, where Leo is");
  assert.equal(C.canForward(c, { mine: true, to: "pat" }), false, "never to anyone else");
  assert.equal(C.canForward(c, { mine: true }), false, "and never without saying to whom");
  assert.equal(C.canForward(c, { mine: false, to: "pat" }), false, "nor on from Leo, once it's his");
  assert.equal(C.canForward(C.normCard(there({ ref: { cell: [52.6, 1.3] } })), { mine: true, to: LEO }), false, "no friend in it: no one");
  // (every other card as before)
  const w = C.normCard(there({ there: undefined }));
  assert.equal(C.canForward(w, { mine: false }), true);
  assert.equal(C.canForward(w, { mine: false, to: "pat" }), true);
  assert.equal(C.canForward(C.normCard(ride()), { mine: false, to: LEO }), false);
});
test("with: a planned ride's friends, first names, at most three", () => {
  const c = C.normCard(ride({ with: ["Leo", " leo ", "", 7, "Ade\u202e", "Bo", "Cy", "Dee"] }));
  assert.deepEqual(c.snap.with, ["Leo", "Ade", "Bo"], "cleaned, none twice, three at most");
  assert.equal(C.normCard(ride({ with: ["x".repeat(90)] })).snap.with[0].length, 40);
  for (const v of [[], "Leo", { 0: "Leo" }, null, [null, 5]]) assert.equal("with" in C.normCard(ride({ with: v })).snap, false, JSON.stringify(v));
  // (a card without friends is byte for byte what it was)
  assert.equal(JSON.stringify(C.normCard(ride())), JSON.stringify(C.normCard(ride({ with: [] }))));
  assert.equal(c.say, "Riding with Leo, Ade and Bo: Ride how you like, 2 h.");
  assert.equal(C.normCard(ride({ with: ["Leo"], done: { secs: 3600 } })).say, "Done today with Leo: Ride how you like.");
  assert.equal(C.normCard(ride({ with: ["Leo"], sport: "run" })).say, "Running with Leo: Ride how you like, 2 h.");
  assert.equal(C.normCard(ride()).say, "Today’s session: Ride how you like, 2 h.", "without friends, as ever");
});
test("normWhen: quarter hours, 15 to 240 minutes, three other times at most, bad ones left out", () => {
  const w = C.normWhen(when());
  assert.deepEqual(w, { kind: "call", start: at("2026-11-03T18:30:00Z"), mins: 30, tz: LON, opts: [at("2026-11-03T19:00:00Z")] });
  assert.deepEqual(C.normWhen(w), w);
  assert.equal(C.normWhen(when({ kind: "meet" })).kind, "meet");
  for (const bad of [{ kind: "ride" }, { kind: undefined }, { start: at("2026-11-03T18:35:00Z") }, { start: "18:30" }, { start: at("2019-12-31T18:30:00Z") },
    { mins: 14 }, { mins: 241 }, { mins: 30.5 }, { mins: "30" }, { mins: 0 }]) assert.equal(C.normWhen(when(bad)), null, JSON.stringify(bad));
  assert.ok(C.normWhen(when({ mins: 15 })) && C.normWhen(when({ mins: 240 })) && C.normWhen(when({ mins: 50 })), "any whole minutes from 15 to 240");
  assert.equal(C.normWhen(when({ start: at("2026-11-03T18:30:00Z") + 1e12 })), null, "nor more than 400 days ahead");
  assert.equal(C.normWhen(when({ tz: "Not/AZone" })).tz, undefined, "a zone that isn't one goes, the time stays");
  const q = (h, m) => at(`2026-11-03T${h}:${m}:00Z`);
  const many = C.normWhen(when({ opts: [q(19, "07"), q(18, 30), q(19, "00"), q(19, "00"), "x", null, q(19, 30), q(20, "00"), q(20, 30)] }));
  assert.deepEqual(many.opts, [q(19, "00"), q(19, 30), q(20, "00")], "off the quarter, the first time itself, twice and junk left out; three kept");
  assert.deepEqual(C.normWhen(when({ opts: "19:00" })).opts, []);
  for (const junk of [null, undefined, 5, "x", [], [when()]]) assert.equal(C.normWhen(junk), null);
});
test("an answer to a time: by its letter's id, with the time chosen; an answer to a ride as ever", () => {
  assert.deepEqual(C.normAns({ id: UUID.toUpperCase(), a: "yes", start: at("2026-11-03T19:00:00Z") }), { id: UUID, a: "yes", start: at("2026-11-03T19:00:00Z") });
  assert.deepEqual(C.normAns({ id: UUID, a: "yes" }), { id: UUID, a: "yes" }, "yes to the first time");
  assert.deepEqual(C.normAns({ id: UUID, a: "later" }), { id: UUID, a: "later" });
  assert.deepEqual(C.normAns({ id: UUID, a: "no", start: at("2026-11-03T19:00:00Z") }), { id: UUID, a: "no" }, "no time with a no");
  assert.deepEqual(C.normAns({ id: UUID, a: "yes", start: at("2026-11-03T19:05:00Z") }), { id: UUID, a: "yes" }, "a time off the quarter goes");
  assert.equal(C.normAns({ id: "x", a: "yes" }), null);
  assert.equal(C.normAns({ id: UUID, a: "maybe" }), null);
  assert.equal(C.normAns({ re: "x", id: UUID, a: "no" }), null, "a bad re is never read as a time's answer");
  const plan = { sport: "ride", wid: "free-ride", name: "Ride", secs: 3600, start: NOW + 2 * H, end: NOW + 3 * H, opts: [] };
  assert.deepEqual(Object.keys(C.normAns({ re: UUID, id: UUID, a: "yes", plan })), ["re", "a", "plan"], "re: an answer to a ride, as ever");
});
test("payloadParts keeps when; an older Chat drops it, and an answer to one, and keeps the words", () => {
  const w = when(), t = C.whenWords(C.normWhen(w), { tz: LON, now: NOW });
  const p = C.padPayload(C.buildPayload({ t, when: w }));
  const now = C.payloadParts(p), old = oldPayloadParts(p);
  assert.deepEqual(now.when, C.normWhen(w));
  assert.equal(now.t, "Call at 18:30? 19:00 would work too.");
  assert.equal(old.t, now.t, "the words, for an older Chat");
  assert.equal("when" in old, false);
  assert.ok(!old.card && !old.plan && !old.ans, "and nothing it could draw");
  const a = C.buildPayload({ t: "Yes, 19:00 works.", ans: { id: UUID, a: "yes", start: at("2026-11-03T19:00:00Z") } });
  assert.deepEqual(C.payloadParts(a).ans, { id: UUID, a: "yes", start: at("2026-11-03T19:00:00Z") });
  assert.equal(oldPayloadParts(a).ans, null, "an older Chat never draws a ride's answer for a time's");
  assert.equal(oldPayloadParts(C.buildPayload({ t: "Can’t make that time.", ans: { id: UUID, a: "no" } })).ans, null, "nor its No as \"Fitness keeps your plan\"");
  // one to one only
  assert.equal(C.buildPayload({ t, when: w, group: true }).when, undefined);
  assert.equal(C.buildPayload({ t: "x", ans: { id: UUID, a: "no" }, group: true }).ans, undefined);
  assert.equal(C.payloadParts(p, { group: true }).when, null);
  assert.equal(C.payloadParts(a, { group: true }).ans, null);
  assert.deepEqual(C.payloadParts(C.buildPayload({ t: "x", ans: { re: UUID, a: "no" }, group: true }), { group: true }).ans, { re: UUID, a: "no" }, "a ride's answer as ever");
  // a bad when is left out, never the letter
  const bad = C.payloadParts({ t: "Hi", when: when({ mins: 999 }), c: there() });
  assert.equal(bad.when, null); assert.equal(bad.t, "Hi"); assert.ok(bad.card);
  assert.equal(C.buildPayload({ t: "Hi", when: { kind: "call" } }).when, undefined);
  for (const junk of [null, 5, "x", [], { when: 7 }, { t: "x", when: [] }]) assert.equal(C.payloadParts(junk).when, null);
});
test("whenWords and whenAnsWords, exactly", () => {
  const w = (o) => C.normWhen(when(o));
  assert.equal(C.whenWords(w({ opts: [] }), { tz: LON, now: NOW }), "Call at 18:30?");
  assert.equal(C.whenWords(w({ kind: "meet", opts: [] }), { tz: LON, now: NOW }), "Meet at 18:30?");
  assert.equal(C.whenWords(w({ start: at("2026-11-04T18:30:00Z"), opts: [] }), { tz: LON, now: NOW }), "Call tomorrow at 18:30?");
  assert.equal(C.whenWords(w({ start: at("2026-11-07T10:00:00Z"), opts: [] }), { tz: LON, now: NOW }), "Call Saturday at 10:00?");
  assert.equal(C.whenWords(w({ start: at("2026-11-14T10:00:00Z"), opts: [] }), { tz: LON, now: NOW }), "Call on Sat 14 Nov at 10:00?");
  assert.equal(C.whenWords(w({ opts: [at("2026-11-03T19:00:00Z"), at("2026-11-03T19:30:00Z"), at("2026-11-03T20:00:00Z")] }), { tz: LON, now: NOW }), "Call at 18:30? 19:00, 19:30 or 20:00 would work too.");
  assert.equal(C.whenWords(w({ opts: [] }), { tz: "Asia/Kolkata", now: NOW }), "Call tomorrow at 00:00?", "on the reader's clock (18:30 in London is midnight in Kolkata)");
  assert.equal(C.whenWords(w({ opts: [] }), { tz: "x", now: NOW }), "Call at 18:30?", "a zone that isn't one: the time's own");
  const s = at("2026-11-03T19:00:00Z");
  assert.equal(C.whenAnsWords({ id: UUID, a: "yes", start: s }, { tz: LON, now: NOW }), "Yes, 19:00 works.");
  assert.equal(C.whenAnsWords({ id: UUID, a: "yes", start: at("2026-11-07T10:00:00Z") }, { tz: LON, now: NOW }), "Yes, Saturday 10:00 works.");
  assert.equal(C.whenAnsWords({ id: UUID, a: "yes" }, { tz: LON, now: NOW }), "Yes, that works.");
  assert.equal(C.whenAnsWords({ id: UUID, a: "later" }), "Can we find another time?");
  assert.equal(C.whenAnsWords({ id: UUID, a: "no" }), "Can’t make that time.");
  assert.equal(C.answerWords({ id: UUID, a: "no" }), "Can’t make that time.", "answerWords says either kind");
  assert.equal(C.answerWords({ re: UUID, a: "no" }), "Can’t make it this time.");
});

test("the new reasons and their scores: there 100, asked 95, planned 90, calls 85", () => {
  const me = { id: "me", tz: LON };                              // (no place: so no "Near enough to join")
  const f = (id, name) => ({ id, name, place: "Norwich", lat: 52.63, lon: 1.29, tz: LON });
  const friends = [f(LEO, "Leo Smith"), f("pat", "Pat Lee"), f("mira", "Mira Okafor"), f("nia", "Nia Jones"), f("ade", "Ade Bello")];
  const thur10 = at("2026-11-05T10:00:00Z");
  const opts = {
    friends, me, now: NOW, landsIn: () => null,
    asked: [{ id: "pat", topics: [{ kind: "markets", sym: "TSCO.L", name: "Tesco", at: NOW - H, asked: true, via: "words" }] }],
    planned: [{ with: "mira", start: thur10, stop: thur10 + 2 * H, sport: "ride", state: "new" }],
    calls: [{ with: "nia", kind: "call", start: at("2026-11-03T18:30:00Z"), stop: at("2026-11-03T19:00:00Z") }],
  };
  const reasons = (card, o = opts) => Object.fromEntries(rankFriends(card, o).map((r) => [r.id, [r.score, r.reason, r.can]]));
  // the weather where Leo is: Leo alone, at 100; everyone else can't have it
  let r = reasons(C.normCard(there()));
  assert.deepEqual(r[LEO], [100, "Where Leo is", true]);
  for (const id of ["pat", "mira", "nia", "ade"]) assert.equal(r[id][2], false, id);
  assert.equal(rankFriends(C.normCard(there()), opts)[0].id, LEO);
  // a stock Pat asked about: 95, on that stock only
  const tesco = C.normCard({ kind: "markets", snap: { name: "Tesco", sym: "TSCO.L", pct: 1.2 }, ref: { sym: "TSCO.L" } });
  r = reasons(tesco);
  assert.deepEqual(r.pat, [95, "Asked about Tesco this morning", true]);
  assert.deepEqual(r.nia, [85, "Calling at 18:30", true], "a call agreed, whatever the card");
  assert.equal(r.mira[0], 0, "a ride says nothing about a stock");
  assert.equal(reasons(C.normCard({ kind: "markets", snap: { name: "Rolls-Royce", sym: "RR.L", pct: 1 }, ref: { sym: "RR.L" } })).pat[0], 0, "another stock: nothing");
  // a ride (and the weather) with Mira: 90
  r = reasons(C.normCard(ride()));
  assert.deepEqual(r.mira, [90, "Riding with you Thursday", true]);
  assert.deepEqual(reasons(C.normCard(there({ there: undefined }))).mira, [90, "Riding with you Thursday", true]);
  assert.deepEqual(r.nia, [85, "Calling at 18:30", true]);
  assert.deepEqual(r.ade, [0, "", true], "and nothing for anyone else");
  // the order of a sheet with every reason at once (the weather here: planned 90 above calls 85)
  assert.deepEqual(rankFriends(C.normCard(ride()), opts).slice(0, 2).map((x) => x.id), ["mira", "nia"]);
  assert.equal(rankFriends(C.normCard(ride()), opts)[0].best, true);
});

// amounts: a currency sign, or a figure that isn't a percent, a clock time, a day of the month or a temperature
const AMOUNT = /[£$€¥₹]|\b(GBP|USD|EUR|GBX|pence|p)\b/;
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/[+−-]?\d+(\.\d+)?%/g, "").replace(/\b\d\d:\d\d\b/g, "").replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}\b/g, "");
test("no amount in any Markets card or its words", () => {
  const inputs = [
    { kind: "markets", from: "today", snap: { name: "Tesco", sym: "TSCO.L", pct: 3.41, day: "2026-11-02", price: 312.5, value: 15000, change: 102.3, qty: 48, currency: "GBP", cost: "£14,000" }, ref: { sym: "TSCO.L" } },
    { kind: "markets", from: "markets", snap: { name: "Portfolio", sym: null, pct: -0.42, value: 98000, gain: "$1,200", top: { name: "Tesco", price: 312 } } },
    { kind: "markets", snap: { name: "Rolls-Royce", sym: "RR.L", pct: 0.001, day: "2026-11-02", holdings: [{ qty: 10 }] }, ref: { sym: "RR.L" }, value: 10, amount: "€5" },
  ];
  for (const x of inputs) {
    const c = C.normCard(x);
    assert.ok(c, JSON.stringify(x).slice(0, 60));
    assert.deepEqual(Object.keys(c.snap).filter((k) => !["name", "sym", "pct", "day"].includes(k)), [], "percent only");
    assert.deepEqual(Object.keys(c).filter((k) => !["v", "kind", "from", "at", "say", "snap", "ref"].includes(k)), []);
    const words = [c.say, C.cardWords(c), C.landWords(c, { mode: "morning" }), V.cardHtml(c, { viewAt: NOW, tz: LON, live: true, now: { pct: 2.5, day: "2026-11-02", at: NOW } }),
      V.sheetCardHtml(c, { viewAt: NOW, tz: LON }), V.sideBySideHtml(c, c, { who: "Pat", viewAt: NOW, tz: LON })];
    for (const w of words) {
      assert.ok(!AMOUNT.test(strip(w)), `a currency in: ${w.slice(0, 120)}`);
      assert.ok(!/\d/.test(strip(w)), `a figure that isn't a percent in: ${strip(w).replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }
});

// ---------- fuzz ----------
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
test("fuzz: 1500 seeded payloads with times, answers, there and with, through the checks, the drawings and the ranking", () => {
  const r = rng(20261103), pickOne = (xs) => xs[Math.floor(r() * xs.length)];
  const vals = () => pickOne([null, undefined, true, false, 0, -1, 15, 30, 240, 241, 1e308, NaN, Infinity, NOW, NOW + H, NOW + 7 * MIN, at("2026-11-03T18:30:00Z"), "", "x", "<img src=x onerror=alert(1)>",
    "\u202e\u0000", LON, "x/y", "call", "meet", "yes", "later", "no", UUID, LEO, "😀".repeat(30), [], [1, 2], [NOW + H, NOW + 2 * H], {}, { start: NOW }]);
  const mutate = (o, depth = 0) => {
    if (!o || typeof o !== "object") return r() < 0.5 ? vals() : o;
    const out = Array.isArray(o) ? [...o] : { ...o };
    for (const k of Object.keys(out)) {
      const x = r();
      if (x < 0.15) out[k] = vals();
      else if (x < 0.2) delete out[k];
      else if (x < 0.4 && depth < 3) out[k] = mutate(out[k], depth + 1);
    }
    if (r() < 0.2 && !Array.isArray(out)) out[pickOne(["evil", "__proto__", "constructor", "z", "group"])] = vals();
    return out;
  };
  const friends = [{ id: LEO, name: "Leo" }, { id: "pat", name: "<b>Pat</b>" }, { id: "x", name: "" }];
  let whens = 0, ans = 0, cards = 0;
  for (let i = 0; i < 1500; i++) {
    const p = mutate({ t: "Hi", c: pickOne([there(), ride({ with: ["Leo", "Ade"] }), there({ there: undefined })]), when: when(), ans: pickOne([{ id: UUID, a: "yes", start: NOW + H }, { re: UUID, a: "no" }]) });
    const group = r() < 0.3;
    const parts = C.payloadParts(p, { group });
    assert.equal(typeof parts.t, "string");
    const viewAt = NOW + (r() - 0.5) * 48 * H, tz = pickOne([LON, "x", undefined, "Asia/Kolkata"]), o = { mine: r() < 0.5, who: pickOne(["Leo", "<i>x</i>", ""]), id: pickOne([UUID, "<x>"]), viewAt, tz, showLater: r() < 0.5 };
    if (parts.when) {
      whens++;
      assert.ok(!group);
      const h = V.whenHtml(parts.when, o);
      assert.ok(h.includes("cd-card"), "a time that passed draws");
      assert.ok(!/<img|<b>|<i>|javascript:/i.test(h));
      assert.equal(typeof C.whenWords(parts.when, { tz, now: viewAt }), "string");
      assert.ok(parts.when.opts.length <= 3 && parts.when.mins >= 15 && parts.when.mins <= 240 && parts.when.start % (15 * MIN) === 0);
      assert.deepEqual(C.normWhen(parts.when), parts.when);
    }
    if (parts.ans) {
      ans++;
      if (group) assert.ok(!parts.ans.id);
      const h = V.answerHtml(parts.ans, o);
      assert.ok(h.includes("cd-card"), "an answer that passed draws");
      assert.ok(!/<img|<b>|<i>/i.test(h));
      assert.equal(typeof C.answerWords(parts.ans, { tz, now: viewAt }), "string");
    }
    if (parts.card) {
      cards++;
      const h = V.cardHtml(parts.card, { ...o, live: r() < 0.5, now: pickOne([null, "wait", { temp: 3, rain: null, at: NOW }, { done: true }]) });
      assert.ok(h.includes("cd-card"));
      assert.ok(!/<img|<b>|<i>/i.test(h));
      if (parts.card.there) for (const f of friends) assert.equal(C.canForward(parts.card, { mine: true, to: f.id }), parts.card.ref?.friend === f.id);
      const rows = rankFriends(parts.card, { friends, me: { tz }, now: viewAt, asked: mutate([{ id: "pat", topics: [{ sym: "TSCO.L", at: NOW }] }]), planned: mutate([{ with: LEO, start: NOW + H, stop: NOW + 2 * H }]), calls: mutate([{ with: "pat", start: NOW + H }]) });
      assert.equal(rows.length, friends.length);
      for (const x of rows) { assert.equal(typeof x.reason, "string"); assert.ok(Number.isFinite(x.score)); }
      if (parts.card.there) assert.ok(rows.every((x) => x.can === (x.id === parts.card.ref?.friend)), "a there card: its friend alone can have it");
    }
    const built = (() => { try { return C.buildPayload({ ...p, group }); } catch (_) { return null; } })();
    if (built) { assert.equal(typeof built.t, "string"); if (group) assert.ok(!built.when && !built.ans?.id); }
  }
  assert.ok(whens > 150 && ans > 150 && cards > 300, `survivors: ${whens} times, ${ans} answers, ${cards} cards`);
});
