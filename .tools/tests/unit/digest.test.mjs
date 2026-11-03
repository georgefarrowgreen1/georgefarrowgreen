// What a friend said, for Today's Waiting for You (spec §7.4; pigeon/digest.js waitingDigest): a pure module (no fetch,
// no storage, no clock, and it imports nothing), over several messages per friend: the kinds, the 90-character cut, the
// topics from cards and from your holdings named in any of the messages (Tesco in the first of two), and the stale rule.
// (The fetch and body spies are in todaymoments.mjs (2) and (5), where words could actually leak.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as D from "../../../pigeon/digest.js";

const { waitingDigest } = D;
const H = 3600e3, MIN = 60e3;
const NOW = Date.parse("2026-11-02T12:30:00Z");               // the demo's midday
const STOCKS = [{ sym: "TSCO.L", name: "Tesco" }, { sym: "RR.L", name: "Rolls-Royce Holdings plc" }, { sym: "BP.L", name: "BP" }];
const UUID = "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c";
const pat = (msgs, o = {}) => ({ id: "pat", first: "Pat", msgs, ...o });
const one = (items, o = {}) => waitingDigest(items, { stocks: STOCKS, now: NOW, ...o });

test("pure: no fetch, no storage, no clock, no page, and it imports nothing", () => {
  const src = readFileSync(fileURLToPath(new URL("../../../pigeon/digest.js", import.meta.url)), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");      // (comments out: they may say what it doesn't do)
  for (const [what, re] of [["fetch", /\bfetch\b/], ["XMLHttpRequest", /XMLHttpRequest/], ["WebSocket", /WebSocket|EventSource/], ["sendBeacon", /sendBeacon/],
    ["localStorage", /localStorage/], ["sessionStorage", /sessionStorage/], ["indexedDB", /indexedDB/i], ["caches", /\bcaches\b/], ["cookies", /cookie/i],
    ["postMessage", /postMessage/], ["the page", /\b(document|window|navigator|location|self|globalThis)\b/], ["the clock", /Date\.now|new Date\b|performance\./],
    ["imports", /^\s*import\b|\bimport\s*\(|\brequire\s*\(/m], ["timers", /setTimeout|setInterval|queueMicrotask/], ["console", /\bconsole\./]]) {
    assert.ok(!re.test(code), `pigeon/digest.js mentions ${what}`);
  }
  assert.deepEqual(Object.keys(D).filter((k) => typeof D[k] === "function"), ["waitingDigest"]);
  // (and run with every way out made to throw, it still answers)
  const saved = {};
  for (const k of ["fetch", "localStorage", "sessionStorage", "indexedDB", "XMLHttpRequest"]) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { configurable: true, get() { throw new Error(`${k} touched`); } });
  }
  try { assert.equal(one([pat([{ text: "Did you see Tesco this week?", at: NOW - H }])])[0].said, "Did you see Tesco this week?"); }
  finally { for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } }
});

test("Pat's two messages: both said, a question, and Tesco from the first", () => {
  const [d] = one([pat([{ text: "Did you see Tesco this week?", at: NOW - 3 * H }, { text: "Dinner Friday?", at: NOW - 2 * H }], { at: NOW - 2 * H })]);
  assert.deepEqual(Object.keys(d), ["id", "first", "at", "said", "kind", "topics"]);
  assert.equal(d.id, "pat"); assert.equal(d.first, "Pat");
  assert.equal(d.at, NOW - 2 * H, "the newest message's time");
  assert.equal(d.said, "Did you see Tesco this week? Dinner Friday?");
  assert.equal(d.kind, "question");
  assert.deepEqual(d.topics, [{ kind: "markets", sym: "TSCO.L", name: "Tesco", at: NOW - 3 * H, asked: true, via: "words" }]);
  // (in whatever order the engine hands them over)
  assert.deepEqual(one([pat([{ text: "Dinner Friday?", at: NOW - 2 * H }, { text: "Did you see Tesco this week?", at: NOW - 3 * H }])])[0].said, d.said);
});

test("kinds: an invite, an ask, a question, a message", () => {
  const k = (msgs) => one([pat(msgs)])[0].kind;
  const m = (o) => ({ text: "Hello", at: NOW - H, ...o });
  assert.equal(k([m({ text: "Ride together? Saturday 10:00–12:00.", plan: { sport: "ride" } })]), "invite");
  assert.equal(k([m({ text: "Call at 18:30?", when: { kind: "call" } })]), "invite");
  assert.equal(k([m({ text: "Later suits me better: 13:00?", ans: { re: UUID, a: "later", plan: { sport: "ride" } } })]), "invite", "a later with its own time");
  assert.equal(k([m({ text: "Can’t make it this time.", ans: { re: UUID, a: "no" } })]), "message", "a no isn't one");
  assert.equal(k([m({ text: "Can we find another time?", ans: { id: UUID, a: "later" } })]), "question", "nor another time asked for a call: a question");
  assert.equal(k([m({ text: "Rain later. How’s yours?", card: { kind: "weather" }, ask: { kind: "weather" } })]), "ask");
  assert.equal(k([m({ text: "Rain later. How's yours?", card: { kind: "weather" } })]), "ask", "the words of one, with its card");
  assert.equal(k([m({ text: "Are you about?" })]), "question");
  assert.equal(k([m({ text: "Are you about? I’m in town." })]), "question", "a question mark that ends a sentence");
  assert.equal(k([m({ text: "Look: https://example.com/?a=1" })]), "message", "not one in a web address");
  assert.equal(k([m({ text: "See you soon." })]), "message");
  // (over all of their messages: an invite first, then an ask, then a question)
  assert.equal(k([m({ text: "Call at 18:30?", when: {}, at: NOW - 3 * H }), m({ text: "Are you about?", at: NOW - 2 * H }), m({ text: "x", card: { kind: "weather" }, ask: {} })]), "invite");
  assert.equal(k([m({ text: "Are you about?", at: NOW - 2 * H }), m({ text: "Here’s mine. How’s yours?", card: { kind: "weather" }, ask: { kind: "weather" } })]), "ask");
  assert.equal(k([m({ text: "Are you about?", at: NOW - 2 * H }), m({ text: "Never mind." })]), "question");
});

test("said: the newest messages joined, as many as fit in 90 characters, the newest alone cut to fit", () => {
  const long = "x".repeat(60), longer = "y".repeat(200);
  let d = one([pat([{ text: long, at: NOW - 3 * H }, { text: "Dinner Friday?", at: NOW - 2 * H }])])[0];
  assert.equal(d.said, `${long} Dinner Friday?`); assert.equal(d.said.length, 75);
  d = one([pat([{ text: "Hi!", at: NOW - 4 * H }, { text: long, at: NOW - 3 * H }, { text: "a".repeat(30), at: NOW - 2 * H }])])[0];
  assert.equal(d.said, "a".repeat(30), "60 more and a space would be 91: the older ones go, never the newest");
  d = one([pat([{ text: "Hi!", at: NOW - 3 * H }, { text: longer, at: NOW - 2 * H }])])[0];
  assert.equal(d.said, `${"y".repeat(89)}…`); assert.equal(d.said.length, 90);
  d = one([pat([{ text: `${"z".repeat(88)}😀 more`, at: NOW - H }])])[0];
  assert.equal(d.said, `${"z".repeat(88)}…`, "never through a surrogate pair");
  d = one([pat([{ text: "  Dinner \n\n Friday?‮\u0000 ", at: NOW - H }])])[0];
  assert.equal(d.said, "Dinner Friday?", "control and direction characters out, spaces collapsed");
  d = one([pat([{ text: "", card: { kind: "weather" }, at: NOW - H }, { text: "Look at this", at: NOW - 2 * H }])])[0];
  assert.equal(d.said, "Look at this", "a message with no words adds none");
  assert.ok(one([pat([{ text: "w ".repeat(400), at: NOW - H }])])[0].said.length <= 90);
});

test("topics: from cards, and your holdings by name or symbol in any of the messages", () => {
  const t = (msgs, o) => one([pat(msgs)], o)[0].topics;
  // cards: a stock (its symbol), the weather, a session
  assert.deepEqual(t([{ text: "Up today", at: NOW - H, card: { kind: "markets", snap: { name: "Rolls-Royce", sym: "RR.L", pct: 1.2 } } }]),
    [{ kind: "markets", sym: "RR.L", name: "Rolls-Royce", at: NOW - H, asked: false, via: "card" }]);
  assert.deepEqual(t([{ text: "Rain later. How’s yours?", at: NOW - H, card: { kind: "weather", snap: { place: "Norwich" } }, ask: { kind: "weather" } }]), [{ kind: "weather", at: NOW - H, asked: true, via: "card" }]);
  assert.deepEqual(t([{ text: "Done", at: NOW - H, card: { kind: "fitness" } }]).map((x) => x.kind), ["fitness"]);
  assert.deepEqual(t([{ text: "x", at: NOW - H, card: { kind: "markets", snap: { name: "Portfolio", sym: null } } }]), [], "a portfolio names no stock");
  // holdings, by name (any case, without "Holdings plc"), by symbol (capitals, $ or not), in any message
  assert.deepEqual(t([{ text: "rolls-royce did well", at: NOW - H }]).map((x) => [x.sym, x.name, x.asked]), [["RR.L", "Rolls-Royce Holdings plc", false]]);
  assert.deepEqual(t([{ text: "Seen $TSCO today?", at: NOW - H }]).map((x) => x.sym), ["TSCO.L"]);
  assert.deepEqual(t([{ text: "TSCO.L is up", at: NOW - H }]).map((x) => x.sym), ["TSCO.L"]);
  assert.deepEqual(t([{ text: "Tesco's results?", at: NOW - H }]).map((x) => x.sym), ["TSCO.L"]);
  assert.deepEqual(t([{ text: "BP is down", at: NOW - H }]).map((x) => x.sym), ["BP.L"]);
  assert.deepEqual(t([{ text: "tsco and bp, in small letters, and a bpm of 140, and Tescotastic", at: NOW - H }]), [], "symbols only in capitals, names only whole");
  assert.deepEqual(t([{ text: "Tesco", at: NOW - H }], { stocks: [] }), [], "only your own holdings");
  assert.deepEqual(t([{ text: "Delta Air Lines is late again", at: NOW - H }], { stocks: [{ sym: "DAL", name: "Delta Air Lines, Inc." }] }).map((x) => x.sym), ["DAL"], "a name with a comma before its Inc.");
  // newest first, each once (said again: the newest time, asked if any asked)
  const many = t([{ text: "Did you see Tesco?", at: NOW - 3 * H }, { text: "Rolls-Royce too", at: NOW - 2 * H }, { text: "Tesco again", at: NOW - H, card: { kind: "markets", snap: { name: "Tesco", sym: "TSCO.L" } } }]);
  assert.deepEqual(many.map((x) => [x.sym, x.at, x.asked, x.via]), [["TSCO.L", NOW - H, true, "card"], ["RR.L", NOW - 2 * H, false, "words"]]);
  assert.ok(t(Array.from({ length: 5 }, (_, i) => ({ text: "x", at: NOW - H - i, card: { kind: "markets", snap: { name: `S${i}`, sym: `S${i}X` } } })).concat([{ text: "Tesco BP Rolls-Royce", at: NOW - 10 * MIN }])).length <= 6);
});

test("a name that's also an everyday word: only with its capital, and not as a sentence's first word", () => {
  const stocks = [{ sym: "NXT.L", name: "Next plc" }, { sym: "TGT", name: "Target Corporation" }, { sym: "AAPL", name: "Apple Inc." }, { sym: "SHEL.L", name: "Shell plc" }, ...STOCKS];
  const t = (text) => one([pat([{ text, at: NOW - H }])], { stocks })[0].topics.map((x) => [x.sym, x.asked]);
  // the review's three: nothing
  assert.deepEqual(t("Dinner next week? I'm on target to finish early"), [], "next week, on target");
  assert.deepEqual(t("Bought an apple pie"), [], "apple pie");
  assert.deepEqual(t("Shells on the beach, and a shell"), []);
  // at a sentence's start, capital or not: nothing (a new line starts one too)
  for (const x of ["Next week?", "Apple pie for pudding.", "Great. Next week then?", "Thanks!\nNext week?", "Done… Next?", "(Next) week?", "“Target practice” he said", "😀 Next week"]) assert.deepEqual(t(x), [], x);
  // with its capital mid-sentence, its full name in any case, or its symbol: the stock
  assert.deepEqual(t("Did you see Next today?"), [["NXT.L", true]]);
  assert.deepEqual(t("I'm thinking of selling Apple"), [["AAPL", false]]);
  assert.deepEqual(t("next plc's results are out"), [["NXT.L", false]], "the full name, any case");
  assert.deepEqual(t("Target Corporation is down"), [["TGT", false]]);
  assert.deepEqual(t("$TGT and NXT up, AAPL down"), [["NXT.L", false], ["TGT", false], ["AAPL", false]], "symbols, in capitals (in your holdings' order)");
  assert.deepEqual(t("NEXT WEEK?"), [], "shouted words aren't a name");
  // names that aren't everyday words, as ever: any case, anywhere
  assert.deepEqual(t("Tesco's results?"), [["TSCO.L", true]]);
  assert.deepEqual(t("tesco's results?"), [["TSCO.L", true]]);
  assert.deepEqual(t("rolls-royce did well"), [["RR.L", false]]);
  assert.deepEqual(t("Rolls-Royce did well"), [["RR.L", false]], "even first in a sentence");
});
test("builds on every engine: no lookbehind, and a pattern that won't build loses only itself", () => {
  const src = readFileSync(fileURLToPath(new URL("../../../pigeon/digest.js", import.meta.url)), "utf8");
  assert.ok(!/\(\?<[=!]/.test(src), "no lookbehind: Safari before 16.4 (iOS 15) throws on one");
  // an engine that can't build a pattern with \p{…} in it: the words still come, and the topics from cards
  const Real = globalThis.RegExp;
  globalThis.RegExp = function RegExp(src, flags) { if (/\\p\{/.test(String(src))) throw new SyntaxError("Invalid regular expression"); return new Real(src, flags); };
  try {
    const [d] = one([pat([{ text: "Did you see Tesco this week?", at: NOW - 2 * H }, { text: "Up today", at: NOW - H, card: { kind: "markets", snap: { name: "Rolls-Royce", sym: "RR.L" } } }])]);
    assert.equal(d.said, "Did you see Tesco this week? Up today");
    assert.equal(d.kind, "question");
    assert.deepEqual(d.topics.map((x) => x.sym), ["RR.L"], "the card's stock, though no name could be looked for");
  } finally { globalThis.RegExp = Real; }
  // one bad item costs only its row
  const bad = { id: "bad", first: "Bad", get msgs() { throw new Error("no"); } };
  assert.deepEqual(one([bad, pat([{ text: "Dinner Friday?", at: NOW - H }])]).map((x) => [x.id, x.said]), [["pat", "Dinner Friday?"]]);
  const evil = { id: "evil", first: "E", msgs: [{ at: NOW - H, get text() { throw new Error("no"); } }] };
  assert.deepEqual(one([pat([{ text: "Hi", at: NOW - H }]), evil]).map((x) => x.id), ["pat"]);
  assert.deepEqual(one([pat([{ text: "Hi", at: NOW - H }])], { stocks: [{ get name() { throw new Error("no"); } }, { sym: "TSCO.L", name: "Tesco" }] })[0].said, "Hi", "nor a bad holding");
});
test("landed: by the phone's clock give or take half a minute, or by the server's own at", () => {
  // the server says Pat's newest landed 5 seconds after the phone's now (its clock behind): it counts, words and all
  let [d] = one([pat([{ text: "Hi", at: NOW - H }, { text: "Just now?", at: NOW + 5000 }], { at: NOW + 5000 })]);
  assert.equal(d.said, "Hi Just now?"); assert.equal(d.kind, "question"); assert.equal(d.at, NOW + 5000);
  [d] = one([pat([{ text: "Hi", at: NOW - H }, { text: "Five minutes on?", at: NOW + 5 * MIN }], { at: NOW + 5 * MIN })]);
  assert.equal(d.said, "Hi Five minutes on?", "however far behind, the server's at says it landed");
  // no server time: half a minute either way still counts, more doesn't
  assert.equal(one([pat([{ text: "Seconds ago", at: NOW + 20e3 }])])[0].said, "Seconds ago");
  assert.deepEqual(one([pat([{ text: "On its way", at: NOW + 5 * MIN }])]), []);
  // never past the server's own at: a later one hasn't landed
  [d] = one([pat([{ text: "Landed", at: NOW + 5000 }, { text: "In the air", at: NOW + 10 * MIN }], { at: NOW + 5000 })]);
  assert.equal(d.said, "Landed"); assert.equal(d.at, NOW + 5000);
});
test("the stale rule: older than the server's newest, no words (and never old words beside a new message)", () => {
  const msgs = [{ text: "Did you see Tesco this week?", at: NOW - 3 * H }];
  const [stale] = one([pat(msgs, { at: NOW - H })]);
  assert.equal(stale.said, "", "the server knows of a newer one the engine hasn't read");
  assert.equal(stale.at, NOW - 3 * H, "said as when the engine's newest is, for Today's merge");
  assert.equal(stale.topics[0].sym, "TSCO.L", "what was said is still true for the ranking");
  assert.equal(one([pat(msgs, { at: NOW - 3 * H })])[0].said, "Did you see Tesco this week?", "as new: words");
  assert.equal(one([pat(msgs, { at: NOW - 4 * H })])[0].said, "Did you see Tesco this week?", "newer: words");
  assert.equal(one([pat(msgs)])[0].said, "Did you see Tesco this week?", "no server time: words (Today's merge still checks)");
});

test("only messages landed by now and under a day old; at most the newest five; junk never throws", () => {
  assert.deepEqual(one([pat([{ text: "On its way", at: NOW + MIN }])]), [], "not landed yet: nothing, and the friend left out");
  assert.deepEqual(one([pat([{ text: "Yesterday", at: NOW - 25 * H }])]), [], "over a day old");
  assert.equal(one([pat([{ text: "Old", at: NOW - 25 * H }, { text: "New", at: NOW - H }])])[0].said, "New");
  const six = Array.from({ length: 6 }, (_, i) => ({ text: `m${i}`, at: NOW - (6 - i) * MIN }));
  assert.equal(one([pat(six)])[0].said, "m1 m2 m3 m4 m5");
  assert.equal(waitingDigest([pat([{ text: "Hi", at: NOW + 99 * H }])])[0].said, "Hi", "no now: no time rule (the module never reads the clock)");
  for (const junk of [null, undefined, 5, "x", {}, [null], [{}], [{ id: 5, msgs: [] }], [{ id: "a", msgs: "x" }], [{ id: "a", msgs: [null, 5, { text: 5, at: "x" }, { at: NaN }] }], [{ id: "x".repeat(65), msgs: [{ text: "a", at: NOW }] }]]) {
    assert.deepEqual(waitingDigest(junk, { stocks: [null, 5, { sym: "bad sym" }, { name: "" }, { sym: "A" }], now: NOW }), [], JSON.stringify(junk));
  }
  assert.deepEqual(waitingDigest([pat([{ text: 5, at: NOW - H }])], { now: NOW }).map((x) => x.said), [""], "a message with no words still says who wrote");
  assert.deepEqual(waitingDigest([pat([{ text: "a", at: NOW }])], { stocks: "x", now: NOW })[0].topics, []);
});

test("several friends: newest first, one each, first names cleaned", () => {
  const out = one([
    { id: "mira", first: "Mira‮ Okafor-Long-Name-That-Goes-On-And-On-And-On-For-Ever", msgs: [{ text: "Can we say 18:45?", at: NOW - 30 * MIN }] },
    pat([{ text: "Dinner Friday?", at: NOW - 2 * H }]),
    pat([{ text: "Older copy", at: NOW - 5 * H }]),
    { id: "nia", first: "Nia", msgs: [{ text: "Morning!", at: NOW - 4 * H }] },
  ]);
  assert.deepEqual(out.map((x) => [x.id, x.said]), [["mira", "Can we say 18:45?"], ["pat", "Dinner Friday?"], ["nia", "Morning!"]]);
  assert.equal(out[0].first.length, 40); assert.ok(!/‮/.test(out[0].first));
});
