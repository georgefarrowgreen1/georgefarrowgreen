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
  // newest first, each once (said again: the newest time, asked if any asked)
  const many = t([{ text: "Did you see Tesco?", at: NOW - 3 * H }, { text: "Rolls-Royce too", at: NOW - 2 * H }, { text: "Tesco again", at: NOW - H, card: { kind: "markets", snap: { name: "Tesco", sym: "TSCO.L" } } }]);
  assert.deepEqual(many.map((x) => [x.sym, x.at, x.asked, x.via]), [["TSCO.L", NOW - H, true, "card"], ["RR.L", NOW - 2 * H, false, "words"]]);
  assert.ok(t(Array.from({ length: 5 }, (_, i) => ({ text: "x", at: NOW - H - i, card: { kind: "markets", snap: { name: `S${i}`, sym: `S${i}X` } } })).concat([{ text: "Tesco BP Rolls-Royce", at: NOW - 10 * MIN }])).length <= 6);
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
