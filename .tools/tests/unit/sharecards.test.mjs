// Send to a friend: the card format (pigeon/cards.js): what's let in, how it travels in a link and in a letter, and
// every word it's put into. Plus a seeded fuzz: nothing the checks let through makes a drawing or a words function throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../pigeon/cards.js";
import * as V from "../../../pigeon/cardview.js";
import { E2E } from "../../../pigeon/crypto.js";

const NOW = Date.now(), H = 3600e3, MIN = 60e3;
const LON = "Europe/London";
const weather = (o = {}) => ({ v: 1, kind: "weather", from: "weather", at: NOW - H, say: "Rain in North Walsham from 15:00.",
  snap: { place: "North Walsham", tz: LON, temp: 12.4, feels: 10.9, code: 61, isDay: true, hi: 14.1, lo: 8, lead: "Rain from about 15:00.",
    rain: { now: false, at: NOW + 2 * H, end: NOW + 4 * H }, spell: { act: "cycle", start: NOW + 5 * H, end: NOW + 7 * H, rating: "Good" }, ...o.snap },
  ref: { cell: [52.8, 1.4] }, ...o.top });
const fitness = (o = {}) => ({ v: 1, kind: "fitness", from: "fitness", at: NOW - H,
  snap: { day: "2026-11-01", tz: LON, sport: "ride", name: "Endurance 75", kind: "Endurance", wid: "endurance-90", secs: 4500, tss: 62,
    best: { start: NOW + H, end: NOW + 2 * H, dry: true }, done: null, ...o.snap }, ref: { share: "AbCdEfGhIjKlMnOpQrStUv" }, ...o.top });
const markets = (o = {}) => ({ v: 1, kind: "markets", from: "markets", at: NOW - H, snap: { name: "Rolls-Royce", sym: "RR.L", pct: 1.21, day: "2026-11-01", ...o.snap }, ref: { sym: "RR.L" }, ...o.top });
const streak = () => ({ v: 1, kind: "streak", from: "today", at: NOW, snap: { who: "Sam", n: 12, best: 20 } });
const plan = (o = {}) => ({ sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, start: NOW + 3 * H, end: NOW + 5 * H, tz: LON,
  opts: [{ start: NOW + 6 * H, end: NOW + 8 * H }], dry: true, far: false, ...o });
const UUID = "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c";
// (Today First's: the weather where a friend is, a ride with friends, a time to talk)
const there = () => ({ ...weather(), from: "chat", there: true, ref: { cell: [52.63, 1.29], friend: "leo" } });
const withLeo = () => fitness({ snap: { with: ["Leo", "Ade"] } });
const when = (o = {}) => ({ kind: "call", start: Math.ceil((NOW + 3 * H) / (15 * MIN)) * 15 * MIN, mins: 30, tz: LON, opts: [Math.ceil((NOW + 4 * H) / (15 * MIN)) * 15 * MIN], ...o });
// an older Chat's check of a letter (pigeon/app.js shapeOK, as of Chat 1.63)
const shapeOK = (kind, o) => !!o && typeof o === "object" && !Array.isArray(o) && (kind === "react" ? false : typeof o.t === "string" && !("r" in o) && !("k" in o));
const OLD = ["r", "k", "p", "v", "bad", "unchecked", "ph"];

test("each kind's sample is let in, rebuilt from what's known", () => {
  for (const c of [weather(), fitness(), markets(), streak()]) {
    const n = C.normCard(c);
    assert.ok(n, c.kind);
    assert.equal(n.kind, c.kind);
    assert.deepEqual(C.normCard(n), n, "checking twice changes nothing");
  }
  assert.deepEqual(C.normCard(weather()).ref, { cell: [52.8, 1.4] });
  assert.equal(C.normCard(streak()).say, "My flight streak with Sam is 12 days.");
});
test("wrong kinds, broken numbers, huge strings and extra fields", () => {
  assert.equal(C.normCard({ ...weather(), kind: "photo" }), null);
  assert.equal(C.normCard(null), null);
  assert.equal(C.normCard([weather()]), null);
  assert.equal(C.normCard(weather({ snap: { place: "" } })), null, "a place is required");
  assert.equal(C.normCard(markets({ snap: { pct: NaN } })), null, "a percent is required");
  assert.equal(C.normCard(markets({ snap: { pct: 5000 } })), null);
  const w = C.normCard(weather({ snap: { temp: NaN, code: 300, place: "x".repeat(500) }, top: { evil: 1, warn: { level: "red", said: "Flood" } } }));
  assert.equal(w.snap.temp, undefined, "a broken number goes, the card stays");
  assert.equal(w.snap.code, undefined);
  assert.equal(w.snap.place.length, 60);
  assert.equal(w.evil, undefined);
  assert.equal(w.warn, undefined, "no warning field, ever");
  assert.equal(C.normCard(weather({ snap: { warn: { said: "x" } } })).snap.warn, undefined);
  assert.equal(C.normCard({ ...weather(), say: "a\u202eb\u0000c" }).say, "a b c", "control and direction characters go");
});
test("the square is snapped to 0.05° whatever comes in", () => {
  assert.deepEqual(C.normCard(weather({ top: { ref: { cell: [52.8123, 1.3876] } } })).ref.cell, [52.8, 1.4]);
  assert.deepEqual(C.normCard(weather({ top: { ref: { cell: [-33.8688, 151.2093] } } })).ref.cell, [-33.85, 151.2]);
  assert.equal(C.normCard(weather({ top: { ref: { cell: [952, 1] } } })).ref, undefined);
});
test("markets: percent only; amounts, holdings and a portfolio's mover are stripped", () => {
  const m = C.normCard(markets({ snap: { price: 512.3, value: 10000, change: 12.5, qty: 30 }, top: { top: { name: "Tesco", sym: "TSCO.L", pct: 3 } } }));
  assert.deepEqual(Object.keys(m.snap).sort(), ["day", "name", "pct", "sym"]);
  assert.equal(m.top, undefined);
  const p = C.normCard({ kind: "markets", from: "today", snap: { name: "My ISA", sym: null, pct: 1.234, day: "2026-11-01", top: { name: "Tesco" } }, ref: { sym: "TSCO.L" } });
  assert.deepEqual(p.snap, { name: "Portfolio", sym: null, pct: 1.23, day: "2026-11-01" });
  assert.equal(p.ref, undefined, "a portfolio has no way to look it up");
  assert.equal(p.say, "My portfolio is up 1.2% today.");
  assert.ok(!/Tesco/.test(JSON.stringify(p)));
});
test("zones, days and symbols are checked", () => {
  assert.equal(C.normCard(weather({ snap: { tz: "x" } })).snap.tz, undefined);
  assert.equal(C.normCard(weather({ snap: { tz: "Mars/Olympus" } })).snap.tz, undefined);
  assert.equal(C.normCard(fitness({ snap: { day: "2026-02-30" } })), null, "a fitness card needs a real day");
  assert.equal(C.normCard(fitness({ snap: { day: "01/11/2026" } })), null);
  assert.equal(C.normCard(markets({ snap: { day: "2026-13-01" } })).snap.day, undefined);
  const bad = C.normCard(markets({ snap: { sym: "<script>" }, top: { ref: { sym: "<script>" } } }));
  assert.equal(bad.snap.sym, null); assert.equal(bad.snap.name, "Portfolio"); assert.equal(bad.ref, undefined);
  assert.equal(C.normCard(markets({ top: { ref: { sym: "TSCO.L" } } })).ref, undefined, "the ref must be the card's own symbol");
});
test("a link never carries a Fitness share id", () => {
  assert.equal(C.normCard(fitness(), { from: "hash" }).ref, undefined);
  assert.deepEqual(C.normCard(fitness()).ref, { share: "AbCdEfGhIjKlMnOpQrStUv" });
  assert.equal(C.unpackCard(C.packCard(fitness())).ref, undefined);
  assert.equal(C.normCard(fitness({ top: { ref: { share: "short" } } })).ref, undefined);
});
test("MAX_CARD counts UTF-8 bytes, not UTF-16 units", () => {
  // (a card's own limits, 60 + 140 + 200 characters of words, keep a real one far under 4400 bytes; the measure is
  // the guard behind them, so it's checked directly)
  const wide = { v: 1, kind: "weather", say: "語".repeat(1480) };          // 1480 units, 4440 bytes of words alone
  assert.ok(JSON.stringify(wide).length < 4000);
  assert.ok(C.bytesOf(JSON.stringify(wide)) > C.MAX_CARD);
  assert.equal(C.cardFits(wide), false, "over 4400 bytes, though under 4000 units: dropped");
  assert.equal(C.cardFits({ say: "a".repeat(4000) }), true, "4000 Latin letters fit");
  assert.equal(C.bytesOf("語"), 3);
  // every card that passes packs to ≤ 6000, whatever its characters
  for (const s of ["a", "é", "語", "😀", '"', "\\"]) {
    const x = C.normCard(weather({ snap: { place: s.repeat(60), lead: s.repeat(140) }, top: { say: s.repeat(200) } }));
    assert.ok(x, s);
    assert.ok(C.bytesOf(JSON.stringify(x)) <= C.MAX_CARD);
    assert.ok(C.packCard(x).length <= C.MAX_PACKED, s);
  }
});
test("pack and unpack: a round trip, and the limits", () => {
  const w = C.normCard(weather());
  assert.deepEqual(C.unpackCard(C.packCard(w)), w);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(C.packCard(w)));
  assert.equal(C.unpackCard("x".repeat(6001)), null);
  assert.equal(C.unpackCard("not base64!"), null);
  assert.equal(C.unpackCard(btoa("{nope").replace(/=+$/, "")), null);
  assert.equal(C.unpackCard(btoa(JSON.stringify({ kind: "photo" })).replace(/=+$/, "")), null);
  assert.equal(C.unpackCard(""), null);
  assert.equal(C.unpackCard(null), null);
  assert.equal(C.packCard({ kind: "nope" }), null);
});
test("readShareHash keeps today's words rule, and the card only within bounds", () => {
  assert.deepEqual(C.readShareHash("#share=Hello%0Athere%01"), { words: "Hello\nthere", card: null });
  assert.equal(C.readShareHash(`#share=${"a".repeat(600)}`).words.length, 500);
  assert.deepEqual(C.readShareHash("#open=x"), { words: null, card: null });
  assert.deepEqual(C.readShareHash(""), { words: null, card: null });
  const h = C.chatHash("Rain later", C.normCard(weather()));
  const r = C.readShareHash(h);
  assert.equal(r.words, "Rain later"); assert.equal(r.card.snap.place, "North Walsham");
  assert.equal(C.readShareHash(h + "&x=" + "a".repeat(8000)).card, null, "over MAX_HASH: words only");
  assert.equal(C.readShareHash(h + "&x=" + "a".repeat(8000)).words, "Rain later");
  assert.equal(C.readShareHash("#share=Hi&card=%%%").card, null);
});
test("chatHash: share first, an old Chat gets the words, and the URL keeps its #", () => {
  const h = C.chatHash("Rain in North Walsham from 15:00.", C.normCard(weather()));
  assert.ok(h.startsWith("#share="));
  assert.ok(h.indexOf("share=") < h.indexOf("&card="));
  assert.ok(/#share=/.test(h));
  assert.equal(new URLSearchParams(h.slice(1)).get("share"), "Rain in North Walsham from 15:00.");
  const url = "https://chat.x/" + C.chatHash("Hi", C.normCard(weather()));
  assert.ok(url.includes("/#share="));
  assert.equal(C.chatHash("Hi"), "#share=Hi");
  assert.equal(C.chatHash("Hi", { kind: "weather", say: "x".repeat(7000) }), "#share=Hi", "too long a card: words only");
});
test("payloadParts never throws, and checks each part on its own", () => {
  for (const junk of [null, undefined, 5, "x", [], { t: 5 }, { c: "x" }, { c: { kind: "weather", snap: null } }, { ask: { kind: "weather" } }, { plan: 7, ans: [] }, Object.create(null)]) {
    const p = C.payloadParts(junk);
    assert.equal(typeof p.t, "string");
    assert.equal(p.card, null);
    assert.equal(p.when, null);
  }
  const p = C.payloadParts({ t: "Hi", c: weather(), ask: { kind: "markets" }, re: { ask: "nope" }, plan: plan({ end: NOW + 3.5 * H }), ans: { re: UUID, a: "no" }, z: "   " });
  assert.equal(p.t, "Hi"); assert.ok(p.card); assert.equal(p.ask, null, "a request must be for the card's kind");
  assert.equal(p.re, null); assert.equal(p.plan, null, "half hours aren't a plan"); assert.deepEqual(p.ans, { re: UUID, a: "no" });
});
test("every payload built and padded passes an older Chat's check, with no old keys", () => {
  const all = [
    C.buildPayload({ t: "Rain later", card: weather() }),
    C.buildPayload({ t: C.askWords("Rain later"), card: weather(), ask: { kind: "weather" } }),
    C.buildPayload({ t: "Here’s mine.", card: markets(), re: { ask: UUID }, q: { id: UUID, from: "u1", t: "How’s yours?" } }),
    C.buildPayload({ t: C.planWords(plan(), { tz: LON, now: NOW }), plan: plan() }),
    C.buildPayload({ t: "Yes, 10:00 works.", ans: { re: UUID, a: "yes", plan: plan() }, q: { id: UUID, from: "u1", t: "Ride together?" } }),
    C.buildPayload({ t: "Just words" }),
    C.buildPayload({ t: "Call at 18:30?", when: when() }),
    C.buildPayload({ t: "Yes, 18:30 works.", ans: { id: UUID, a: "yes", start: when().start } }),
    C.buildPayload({ t: "Norwich today.", card: there() }),
    C.buildPayload({ t: "Riding with Leo.", card: withLeo() }),
  ];
  assert.ok(all.at(-4).when && all.at(-3).ans.id && all.at(-2).c.there && all.at(-1).c.snap.with, "each new part went in");
  for (const p of all) {
    for (const x of [p, C.padPayload(p)]) {
      assert.ok(shapeOK("msg", x), JSON.stringify(x).slice(0, 80));
      for (const k of OLD) assert.ok(!(k in x), k);
      assert.ok(!("type" in x));
    }
  }
  assert.throws(() => C.buildPayload({ t: "   ", card: weather() }), /No words/);
  assert.throws(() => C.buildPayload({}), /No words/);
  assert.equal(C.buildPayload({ t: "x", card: { kind: "bad" } }).c, undefined);
  assert.equal(C.buildPayload({ t: "x", ask: { kind: "weather" } }).ask, undefined, "no request without a card");
});
test("padPayload lands on 1024, 4096 and 8192 bytes exactly", () => {
  const bytes = (p) => new TextEncoder().encode(JSON.stringify(p)).length;
  assert.equal(bytes(C.padPayload({ t: "hi" })), 1024);
  assert.equal(bytes(C.padPayload({ t: "é".repeat(400) })), 1024);
  assert.equal(bytes(C.padPayload({ t: "x".repeat(1100) })), 4096);
  assert.equal(bytes(C.padPayload({ t: "x".repeat(5000) })), 8192);
  assert.equal(bytes(C.padPayload({ t: "x".repeat(9000) })), 12288);
  assert.equal(bytes(C.padPayload(C.padPayload({ t: "hi", c: C.normCard(weather()) }))), 1024 * (bytes({ t: "hi", c: C.normCard(weather()) }) > 1000 ? 4 : 1));
  assert.ok(/^ *$/.test(C.padPayload({ t: "x" }).z));
  assert.equal(C.payloadParts(C.padPayload({ t: "x", c: weather() })).card.snap.place, "North Walsham");
});
test("a padded card letter seals and opens as any letter does", async () => {
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const base = await E2E.pair(k.privateKey, await crypto.subtle.exportKey("jwk", k.publicKey));
  const meta = { type: "msg", id: UUID, from: "u1", to: "u2" };
  const payload = C.padPayload(C.buildPayload({ t: "Rain later", card: weather(), ask: { kind: "weather" } }));
  const ct = await E2E.seal(base, meta, payload);
  assert.ok(!ct.includes("North Walsham"));
  const back = await E2E.open(base, meta, ct);
  assert.deepEqual(back, payload);
  assert.ok(shapeOK("msg", back));
  assert.equal(C.payloadParts(back).ask.kind, "weather");
  // a words-only letter is the same size of sealed text
  const ct2 = await E2E.seal(base, meta, C.padPayload({ t: "Hello" }));
  assert.equal(ct2.length, ct.length);
});
test("canForward: yours of any kind; theirs only weather and one stock", () => {
  const p = C.normCard({ kind: "markets", snap: { sym: null, pct: 1 } });
  for (const c of [weather(), fitness(), markets(), streak()].map((x) => C.normCard(x)).concat([p])) assert.equal(C.canForward(c, { mine: true }), true);
  assert.equal(C.canForward(C.normCard(weather()), { mine: false }), true);
  assert.equal(C.canForward(C.normCard(markets()), { mine: false }), true);
  assert.equal(C.canForward(p, { mine: false }), false);
  assert.equal(C.canForward(C.normCard(fitness()), { mine: false }), false);
  assert.equal(C.canForward(C.normCard(streak()), { mine: false }), false);
  assert.equal(C.canForward(null, { mine: true }), false);
  // (Today First: the weather where a friend is goes to that friend alone, never on, never without a to)
  const t = C.normCard(there());
  assert.equal(C.canForward(t, { mine: true }), false);
  assert.equal(C.canForward(t, { mine: true, to: "leo" }), true);
  assert.equal(C.canForward(t, { mine: false, to: "pat" }), false);
});
test("live keys, items and how long a card stays live", () => {
  const w = C.normCard(weather()), m = C.normCard(markets()), f = C.normCard(fitness()), s = C.normCard(streak());
  assert.equal(C.liveKey(w), "weather:52.80,1.40");
  assert.equal(C.liveKey(m), "markets:RR.L");
  assert.equal(C.liveKey(f), "fitness:AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(C.liveKey(s), null);
  assert.deepEqual(C.liveItem(w), { k: "weather", cell: [52.8, 1.4] });
  assert.deepEqual(C.liveItem(f), { k: "fitness", share: "AbCdEfGhIjKlMnOpQrStUv" });
  assert.equal(C.liveItem(s), null);
  assert.ok(!("letter" in C.liveItem(m)));
  assert.equal(C.isLive(w, { landedAt: NOW - H, now: NOW }), true);
  assert.equal(C.isLive(w, { landedAt: NOW - 49 * H, now: NOW }), false);
  assert.equal(C.isLive(w, { landedAt: NOW + H, now: NOW }), false, "not before it lands");
  assert.equal(C.isLive(w, { landedAt: NOW + H, mine: true, now: NOW }), true, "yours, in the air");
  assert.equal(C.isLive(s, { landedAt: NOW, now: NOW }), false);
  assert.equal(C.isLive(C.normCard(fitness(), { from: "hash" }), { landedAt: NOW, now: NOW }), false);
  // (yours with no landing and no time of its own: nothing to count 48 hours from, so not live, never live for ever)
  const noAt = C.normCard(weather({ top: { at: undefined } }));
  assert.equal(noAt.at, undefined);
  assert.equal(C.isLive(noAt, { mine: true, now: NOW }), false);
  assert.equal(C.isLive(noAt, { mine: true, now: NOW + 1e12 }), false);
  assert.equal(C.isLive(w, { mine: true, now: NOW }), true, "yours, from its own time");
  assert.equal(C.isLive(w, { mine: true, now: NOW + 48 * H }), false);
});
test("pigeonsFor: free turns, a standard one waiting, timed ones need paid, slowest first, then none", () => {
  const me = { swift: 1, turbo: 1, rocket: 0 };
  const m = C.pigeonsFor([{ id: "a", free: true, waiting: false, landAt: null }, { id: "b", free: true, waiting: true, landAt: null },
    { id: "c", free: true, waiting: false, landAt: NOW + H }, { id: "d", free: false, waiting: false, landAt: null }], { me, now: NOW });
  assert.deepEqual([...m], [["a", "standard"], ["b", "swift"], ["c", "turbo"], ["d", null]]);
  assert.deepEqual([...C.pigeonsFor([{ id: "x", free: false, landAt: null }], { me: { swift: 0, turbo: 0, rocket: 2 } })], [["x", "rocket"]]);
  assert.deepEqual([...C.pigeonsFor([], { me })], []);
});
test("spendWords, exactly", () => {
  const names = new Map([["a", "Leo"], ["b", "Ade"], ["c", "Mum"]]);
  assert.equal(C.spendWords(new Map([["a", "standard"]]), names), "Uses your free pigeon to Leo");
  assert.equal(C.spendWords(new Map([["a", "swift"], ["b", "swift"]]), names), "Uses 2 swift pigeons");
  assert.equal(C.spendWords(new Map([["a", "swift"], ["b", "turbo"]]), names), "Uses a swift and a turbo pigeon");
  assert.equal(C.spendWords(new Map([["a", "standard"], ["b", "swift"]]), names), "Uses your free pigeon to Leo and a swift pigeon");
  assert.equal(C.spendWords(new Map([["a", "swift"]]), names), "Uses a swift pigeon");
  assert.equal(C.spendWords(new Map([["a", "swift"], ["b", "swift"], ["c", "swift"]]), names), "Uses 3 swift pigeons");
  assert.equal(C.spendWords(["standard", "standard"], ["Leo", "Ade"]), "Uses your free pigeons to Leo and Ade");
  assert.equal(C.spendWords(new Map(), names), "");
});
test("whenLine, exactly", () => {
  const at = (iso) => Date.parse(iso), now = at("2026-11-02T10:00:00Z");
  assert.equal(C.whenLine("Leo", { mode: "asap", landAt: at("2026-11-02T14:20:00Z"), tz: LON, now }), "Leo’s lands 14:20");
  assert.equal(C.whenLine("Mum", { mode: "before", landAt: at("2026-11-02T17:30:00Z"), rainAt: at("2026-11-02T18:30:00Z"), tz: LON, now }), "Mum’s lands 17:30, an hour before the rain");
  assert.equal(C.whenLine("Mum", { mode: "before", landAt: null, rainAt: at("2026-11-02T10:20:00Z"), tz: LON, now }), "Too late to beat the rain to Mum: it goes now");
  assert.equal(C.whenLine("Leo", { mode: "morning", landAt: at("2026-11-03T12:30:00Z"), tz: LON, theirTz: "America/New_York", now }), "Leo’s lands 07:30 tomorrow, their time");
  assert.equal(C.whenLine("Leo", { mode: "morning", landAt: at("2026-11-03T07:30:00Z"), tz: LON, theirTz: LON, now }), "Leo’s lands 07:30 tomorrow");
  assert.equal(C.whenLine("Leo", { mode: "morning", landAt: at("2026-11-03T07:30:00Z"), tz: LON, theirTz: "Europe/Dublin", now }), "Leo’s lands 07:30 tomorrow", "the same clock isn't their time");
  assert.equal(C.whenLine("Leo", { mode: "morning", landAt: at("2026-11-04T07:30:00Z"), tz: LON, theirTz: LON, now }), "Leo’s lands 07:30 on Wednesday");
  assert.equal(C.whenLine("Leo", { mode: "morning", landAt: at("2026-11-02T07:30:00Z") + 10 * H, tz: LON, theirTz: LON, now }), "Leo’s lands 17:30");
  // a message (no pigeon): now says nothing; sent at a time, when it arrives
  assert.equal(C.whenLine("Leo", { mode: "now", tz: LON, now }), "");
  assert.equal(C.whenLine("Leo", { mode: "at", landAt: at("2026-11-03T12:30:00Z"), tz: LON, theirTz: "America/New_York", now }), "Arrives 07:30 tomorrow, their time");
  assert.equal(C.whenLine("Leo", { mode: "at", landAt: at("2026-11-03T07:30:00Z"), tz: LON, theirTz: LON, now }), "Arrives 07:30 tomorrow");
});
test("sentToast, exactly", () => {
  assert.equal(C.sentToast([{ name: "Leo", ok: true, lands: 8 * MIN }, { name: "Ade", ok: true, lands: 6 * MIN }]), "Sent · Leo in 8m, Ade in 6m");
  const t = Date.parse("2026-11-03T07:30:00Z");
  assert.equal(C.sentToast([{ name: "Leo", ok: true, lands: "8m" }, { name: "Ade", ok: true, landAt: t }]).replace(/at \d\d:\d\d/, "at HH:MM"), "Sent · Leo in 8m, Ade at HH:MM");
  assert.equal(C.sentToast([1, 2, 3, 4, 5].map((i) => ({ name: `F${i}`, ok: true, lands: 2 * H }))), "Sent · F1 in 2h, F2 in 2h, F3 in 2h and 2 more");
  assert.equal(C.sentToast([{ name: "Leo", ok: true, lands: 1 }, { name: "Ade", ok: false, err: "That’s too soon." }]), "Couldn’t send to Ade: That’s too soon.");
  assert.equal(C.sentToast([{ name: "Ade", ok: false }, { name: "Mum", ok: false, err: "x" }]), "Couldn’t send to Ade and Mum. Try again.");
  // messages: sent, or sent at a time on their clock; failures as ever
  assert.equal(C.sentToast([{ name: "Leo", ok: true }], { instant: true }), "Sent to Leo");
  assert.equal(C.sentToast([{ name: "Leo", ok: true }, { name: "Ade", ok: true }], { instant: true }), "Sent to Leo and Ade");
  assert.equal(C.sentToast([{ name: "Leo", ok: true }], { instant: true, at: Date.parse("2026-11-03T12:30:00Z"), tz: "America/New_York" }), "Leo gets it at 07:30, their time");
  assert.equal(C.sentToast([{ name: "Ade", ok: false, err: "x" }], { instant: true }), "Couldn’t send to Ade: x");
  assert.equal(C.sentToast([{ name: "Leo", ok: true, lands: 8 * MIN }], {}), "Sent · Leo in 8m", "without instant, as ever");
});
test("compareNow: weather, every row", () => {
  const w = C.normCard(weather({ snap: { rain: { now: false, at: Date.parse("2026-11-02T15:00:00Z") } } }));
  const base = { temp: 12.4, feels: 11, code: 61, isDay: true, hi: 14, lo: 8, at: NOW };
  const c = (now) => C.compareNow(w, now, NOW);
  let r = c({ ...base, rain: { now: true, at: NOW, end: NOW + H } });
  assert.deepEqual([r.changed, r.delta, r.line], [true, "Changed since it was sent", "Raining in North Walsham now."]);
  assert.deepEqual(r.big, ["12°", "12°"]);
  const wet = C.normCard(weather({ snap: { rain: { now: true } } }));
  assert.equal(C.compareNow(wet, { ...base, rain: null }, NOW).line, "Dry in North Walsham now.");
  assert.equal(c({ ...base, rain: { now: false, at: Date.parse("2026-11-02T16:10:00Z") } }).line, "The rain’s now due at 16:10, not 15:00.");
  r = c({ ...base, rain: { now: false, at: Date.parse("2026-11-02T15:20:00Z") } });
  assert.deepEqual([r.changed, r.line, r.delta], [false, "As forecast.", "As it was when sent"]);
  assert.equal(c({ ...base, temp: 16.6, rain: { now: false, at: Date.parse("2026-11-02T15:00:00Z") } }).line, "4° warmer than when it was sent.");
  assert.equal(c({ ...base, temp: 8.2, rain: { now: false, at: Date.parse("2026-11-02T15:00:00Z") } }).line, "4° colder than when it was sent.");
  assert.equal(c({ ...base, code: 3, rain: { now: false, at: Date.parse("2026-11-02T15:00:00Z") } }).line, "Now: Cloudy.");
  // rain that was due, its time gone by, and none due now: a change, never "As forecast."
  const gone = C.normCard(weather({ snap: { rain: { now: false, at: NOW - 2 * H } } }));
  r = C.compareNow(gone, { temp: 12, code: 3, rain: null, at: NOW }, NOW);
  assert.deepEqual([r.changed, r.delta, r.line], [true, "Changed since it was sent", "No rain’s due now."]);
  r = c({ ...base, rain: null });
  assert.deepEqual([r.changed, r.line], [true, "No rain’s due now."], "and still ahead");
  // before an answer, and when none can be had
  assert.deepEqual(C.compareNow(w, null, NOW), { changed: false, delta: "", line: "", big: ["12°", "…"] });
  assert.deepEqual(C.compareNow(w, { quiet: true }, NOW).big, ["12°", "…"]);
});
test("a weather code we don't know (or none) says nothing about the sky", () => {
  assert.equal(C.codeLabel(-1), ""); assert.equal(C.codeLabel(undefined), ""); assert.equal(C.codeLabel(NaN), "");
  assert.equal(C.codeLabel(3), "Cloudy"); assert.equal(C.codeGroup(undefined), undefined);
  const c = C.normCard({ kind: "weather", snap: { place: "NW", temp: 12 } });
  assert.equal(c.say, "NW: 12°.");
  assert.equal(C.normCard({ kind: "weather", snap: { place: "NW", temp: 12, code: 3 } }).say, "NW: 12° and cloudy.");
  // (and no code then, or no code now: no "Now: …" line made up from nothing)
  assert.equal(C.compareNow(c, { temp: 12.2, code: 3, rain: null, at: NOW }, NOW).line, "As forecast.");
});
test("compareNow: fitness, every row, and a done with no figures", () => {
  const f = C.normCard(fitness());
  const dayOf = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: LON }).format(new Date(ms));
  const today = C.normCard(fitness({ snap: { day: dayOf(NOW) } }));
  let r = C.compareNow(today, { done: true, secs: 3720, dist: 30400, tss: 48 }, NOW);
  assert.deepEqual([r.changed, r.line, r.big[1]], [true, "Done: 1:02 · 30.4 km · stress 48.", "Done ✓"]);
  assert.equal(C.compareNow(today, { done: true, dist: 30400 }, NOW).line, "Done: 30.4 km.");
  r = C.compareNow(today, { done: true }, NOW);
  assert.deepEqual([r.changed, r.line], [true, "Done ✓."]);
  r = C.compareNow(today, { done: false }, NOW);
  assert.deepEqual([r.changed, r.line, r.big[1]], [false, "Not done yet.", "Endurance 75"]);
  r = C.compareNow(f, { done: false }, Date.parse("2026-11-02T09:00:00Z"));
  assert.deepEqual([r.changed, r.line, r.delta], [true, "Not done that day.", "Changed since it was sent"]);
  // done when sent, but Fitness can't see it now: still "Done ✓", the figure and its line agreeing
  r = C.compareNow(C.normCard(fitness({ snap: { day: dayOf(NOW), done: { secs: 3720 } } })), { done: false }, NOW);
  assert.deepEqual([r.changed, r.line, r.big[1]], [false, "Done ✓.", "Done ✓"]);
  assert.equal(C.compareNow(f, { gone: true }, NOW).big[1], null);
});
test("compareNow: markets, every row", () => {
  const m = C.normCard(markets());
  assert.equal(C.compareNow(m, { pct: 1.62, day: "2026-11-01", stale: false, at: NOW }, NOW).line, "Up 1.62% now, from 1.21% when it was sent.");
  assert.equal(C.compareNow(C.normCard(markets({ snap: { pct: 0.12 } })), { pct: -0.4, day: "2026-11-01" }, NOW).line, "Down 0.40% now, from 0.12% up when it was sent.");
  assert.equal(C.compareNow(m, { pct: 0.4, day: "2026-11-02" }, NOW).line, "A new day: up 0.40% today.");
  const r = C.compareNow(m, { pct: 1.3, day: "2026-11-01" }, NOW);
  assert.deepEqual([r.changed, r.line, r.big], [false, "No real change.", ["+1.21%", "+1.30%"]]);
  const at = Date.parse("2026-11-01T16:30:00Z");
  assert.match(C.compareNow(m, { pct: 1.3, day: "2026-11-01", stale: true, at }, NOW).line, /^No real change\. Prices from \d\d:30\.$/);
  assert.equal(C.compareNow(C.normCard(markets({ snap: { pct: -2 } })), { pct: -2.1, day: "2026-11-01" }, NOW).big[0], "−2.00%");
});
test("nextLocal over the October and March clock changes", () => {
  // London: clocks go back on Sun 25 Oct 2026, forward on Sun 29 Mar 2026
  assert.equal(new Date(C.nextLocal(LON, "07:30", Date.parse("2026-10-24T12:00:00Z"))).toISOString(), "2026-10-25T07:30:00.000Z");
  assert.equal(new Date(C.nextLocal(LON, "07:30", Date.parse("2026-10-24T05:00:00Z"))).toISOString(), "2026-10-24T06:30:00.000Z");
  assert.equal(new Date(C.nextLocal(LON, "07:30", Date.parse("2026-03-28T12:00:00Z"))).toISOString(), "2026-03-29T06:30:00.000Z");
  // New York: back on Sun 1 Nov 2026
  assert.equal(new Date(C.nextLocal("America/New_York", "07:30", Date.parse("2026-10-31T12:00:00Z"))).toISOString(), "2026-11-01T12:30:00.000Z");
  assert.equal(new Date(C.nextLocal("America/New_York", "07:30", Date.parse("2026-10-31T10:00:00Z"))).toISOString(), "2026-10-31T11:30:00.000Z");
  // a bad zone doesn't throw
  assert.ok(Number.isFinite(C.nextLocal("x", "07:30", NOW)));
});
test("landWords, aboutSaid, askWords, exactly", () => {
  const w = C.normCard(weather());
  const rainAt = Date.parse("2026-11-02T18:30:00Z");
  assert.equal(C.landWords(w, { mode: "before", landAt: rainAt - H, rainAt, tz: LON }), "Rain reaches you in about an hour, at 18:30.");
  assert.equal(C.landWords(w, { mode: "morning" }), "Good morning. Rain in North Walsham from 15:00.");
  assert.equal(C.landWords(w, { mode: "asap" }), "Rain in North Walsham from 15:00.");
  assert.equal(C.aboutSaid(40 * MIN), "about 40 minutes");
  assert.equal(C.aboutSaid(55 * MIN), "about an hour");
  assert.equal(C.aboutSaid(75 * MIN), "about an hour");
  assert.equal(C.aboutSaid(110 * MIN), "about 2 hours");
  assert.equal(C.askWords("Rain later."), "Rain later. How’s yours?");
  assert.equal(C.askWords("Rain later"), "Rain later. How’s yours?");
  assert.equal(C.askWords(""), "How’s yours?");
});
test("planWords and answerWords, exactly", () => {
  const sat10 = Date.parse("2026-11-07T10:00:00Z"), now = Date.parse("2026-11-03T09:00:00Z");
  const p = { ...plan(), start: sat10, end: sat10 + 2 * H, opts: [] };
  assert.equal(C.planWords(p, { tz: LON, now }), "Ride together? Saturday 10:00–12:00, dry for both.");
  assert.equal(C.planWords({ ...p, sport: "run" }, { tz: LON, now }), "Run together? Saturday 10:00–12:00, dry for both.");
  assert.equal(C.planWords({ ...p, dry: false }, { tz: LON, now }), "Ride together? Saturday 10:00–12:00.");
  assert.equal(C.planWords({ ...p, far: true }, { tz: LON, now }), "Ride at the same time? Saturday 10:00–12:00, dry for both.");
  assert.equal(C.planWords(p, { tz: LON, now: Date.parse("2026-11-07T07:00:00Z") }), "Ride together? Today 10:00–12:00, dry for both.");
  assert.equal(C.answerWords({ a: "yes", plan: p }, { tz: LON, now: Date.parse("2026-11-07T07:00:00Z") }), "Yes, 10:00 works.");
  assert.equal(C.answerWords({ a: "yes", plan: p }, { tz: LON, now }), "Yes, Saturday 10:00 works.");
  assert.equal(C.answerWords({ a: "later", plan: { ...p, start: sat10 + 3 * H, end: sat10 + 5 * H } }, { tz: LON, now: Date.parse("2026-11-07T07:00:00Z") }), "Later suits me better: 13:00?");
  assert.equal(C.answerWords({ a: "no" }, { tz: LON, now }), "Can’t make it this time.");
});
test("normPlan and normAns: whole hours, at most three other times, a real zone", () => {
  assert.ok(C.normPlan(plan()));
  assert.equal(C.normPlan(plan({ end: NOW + 3 * H + 30 * MIN })), null);
  assert.equal(C.normPlan(plan({ end: NOW + 10 * H })), null, "more than six hours");
  assert.equal(C.normPlan(plan({ sport: "swim" })), null);
  assert.equal(C.normPlan(plan({ wid: "rh:mine" })), null, "never a Rhythm id");
  assert.equal(C.normPlan(plan({ tz: "x" })).tz, undefined);
  const many = C.normPlan(plan({ opts: [1, 2, 3, 4, 5].map((i) => ({ start: NOW + (6 + 2 * i) * H, end: NOW + (8 + 2 * i) * H })).concat([{ start: NOW, end: NOW + H }]) }));
  assert.equal(many.opts.length, 3);
  assert.ok(many.opts.every((o) => o.end - o.start === 2 * H));
  assert.equal(C.normAns({ re: UUID, a: "yes" }), null, "a yes needs its time");
  assert.equal(C.normAns({ re: "x", a: "no" }), null);
  assert.equal(C.normAns({ re: UUID, a: "maybe", plan: plan() }), null);
  assert.deepEqual(Object.keys(C.normAns({ re: UUID, a: "later", plan: plan(), x: 1 })), ["re", "a", "plan"]);
  assert.equal(C.normCard(weather({ top: { at: Date.UTC(2019, 0, 1) } })).at, undefined, "a time before 2020 goes");
  assert.equal(C.normPlan(plan({ start: NOW + 500 * 24 * H, end: NOW + 500 * 24 * H + 2 * H })), null, "nor more than 400 days ahead");
  // the window is the workout's own length in whole hours (1 to 6), and nothing else
  assert.equal(C.normPlan(plan({ secs: 600, start: NOW + H, end: NOW + 7 * H, opts: [] })), null, "a 10-minute workout over six hours");
  assert.equal(C.normPlan(plan({ secs: 600, start: NOW + H, end: NOW + 2 * H, opts: [] })).end, NOW + 2 * H, "under an hour: one hour");
  assert.equal(C.normPlan(plan({ secs: 7201, opts: [] })), null, "just over two hours needs three");
  assert.ok(C.normPlan(plan({ secs: 8 * 3600, start: NOW + H, end: NOW + 7 * H, opts: [] })), "longer than six hours: six");
  // the other times: each once, none over the window or another
  const o1 = { start: NOW + 6 * H, end: NOW + 8 * H };
  assert.deepEqual(C.normPlan(plan({ opts: [o1, { ...o1 }, { start: NOW + 7 * H, end: NOW + 9 * H }, { start: NOW + 4 * H, end: NOW + 6 * H }, { start: NOW + 8 * H, end: NOW + 10 * H }] })).opts,
    [o1, { start: NOW + 8 * H, end: NOW + 10 * H }]);
  // each other time keeps whether it's dry for both, and a "later" answer takes that time's, never the first window's
  const mixed = C.normPlan(plan({ dry: true, opts: [{ start: NOW + 6 * H, end: NOW + 8 * H, dry: false }, { start: NOW + 9 * H, end: NOW + 11 * H, dry: true }] }));
  assert.deepEqual(mixed.opts, [{ start: NOW + 6 * H, end: NOW + 8 * H }, { start: NOW + 9 * H, end: NOW + 11 * H, dry: true }]);
  const wet = C.laterPlan(mixed, NOW + 6 * H), dry = C.laterPlan(mixed, NOW + 9 * H);
  assert.equal(wet.dry, false, "a wet other time isn't sent as dry for both"); assert.equal(wet.start, NOW + 6 * H); assert.deepEqual(wet.opts, []);
  assert.equal(dry.dry, true);
  assert.equal(C.normAns({ re: "6f1c2b3a-1111-4222-8333-944455556666", a: "later", plan: wet }).plan.dry, false);
  assert.equal(C.laterPlan(mixed, NOW + 7 * H), null, "not one of its times");
});
test("clockIn and dayWords: a bad zone falls back, never throws", () => {
  assert.equal(C.clockIn(Date.parse("2026-11-02T14:40:00Z"), LON), "14:40");
  assert.equal(C.clockIn(Date.parse("2026-07-02T14:40:00Z"), LON), "15:40");
  assert.match(C.clockIn(NOW, "Not/AZone"), /^\d\d:\d\d$/);
  assert.equal(C.clockIn(NaN, LON), "");
  const now = Date.parse("2026-11-03T09:00:00Z");
  assert.equal(C.dayWords(now + H, LON, now), "Today");
  assert.equal(C.dayWords(now + 24 * H, LON, now), "Tomorrow");
  assert.equal(C.dayWords(Date.parse("2026-11-07T10:00:00Z"), LON, now), "Saturday");
  assert.equal(C.dayWords(Date.parse("2026-11-14T10:00:00Z"), LON, now), "Sat 14 Nov");
});

// ---------- fuzz ----------
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
test("fuzz: 2000 seeded objects through the checks, and every survivor through every drawing", () => {
  const r = rng(20261102), pickOne = (xs) => xs[Math.floor(r() * xs.length)];
  const vals = () => pickOne([null, undefined, true, false, 0, -1, 1e308, NaN, Infinity, -Infinity, 12.4, 61, NOW, NOW + H, NOW + 2.5 * H, "", "x", "<img src=x onerror=alert(1)>", "\u202e\u0000", "Europe/London", "x/y", "2026-11-01", "2026-02-30", "RR.L", "^FTSE", "😀".repeat(50), [], [1, 2], {}, { now: true }, { start: NOW, end: NOW + H }]);
  const mutate = (o, depth = 0) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return r() < 0.5 ? vals() : o;
    const out = { ...o };
    for (const k of Object.keys(out)) {
      const x = r();
      if (x < 0.15) out[k] = vals();
      else if (x < 0.2) delete out[k];
      else if (x < 0.4 && depth < 3) out[k] = mutate(out[k], depth + 1);
    }
    if (r() < 0.2) out[pickOne(["warn", "top", "evil", "__proto__", "constructor", "z"])] = vals();
    return out;
  };
  let cards = 0, plans = 0, answers = 0, whens = 0;
  for (let i = 0; i < 2000; i++) {
    const base = pickOne([weather(), fitness(), markets(), streak(), { kind: pickOne(C.KINDS), snap: {} }, vals(), there(), withLeo()]);
    const c = C.normCard(mutate(base), { from: r() < 0.3 ? "hash" : undefined });
    const p = C.normPlan(mutate(plan()));
    const a = C.normAns(mutate(pickOne([{ re: UUID, a: pickOne(["yes", "later", "no"]), plan: plan() }, { id: UUID, a: pickOne(["yes", "later", "no"]), start: when().start }])));
    const w = C.normWhen(mutate(when()));
    const nowAns = pickOne([null, "wait", { quiet: true }, { gone: true }, mutate({ temp: 3, code: 95, isDay: false, rain: { now: true, at: NOW }, at: NOW }), mutate({ done: true, secs: 100 }), mutate({ pct: -3, day: "2026-11-02", stale: true, at: NOW })]);
    const opts = { now: nowAns, viewAt: NOW + (r() - 0.5) * 100 * H, sentAt: NOW, live: r() < 0.5, mine: r() < 0.5, links: { weather: "https://weather.x", finance: pickOne(["https://finance.x", "javascript:alert(1)", null]) }, tz: pickOne([LON, "x", undefined, "Asia/Kolkata"]), who: "Leo" };
    if (c) {
      cards++;
      // (HTML: everything escaped, and no link but the ones Chat builds)
      // (each drawing wraps itself so it gives "" rather than throw; so a survivor must draw something, or it threw)
      for (const [f, mark] of [[() => V.cardHtml(c, opts), "cd-card"], [() => V.sheetCardHtml(c, opts), "cd-card"], [() => V.sideBySideHtml(c, c, { ...opts, nowMine: nowAns, nowTheirs: nowAns }), "cd-card"], [() => V.askHtml({ kind: c.kind }, opts), C.ASK_KINDS.includes(c.kind) ? "cd-ask" : null]]) {
        const out = f();
        assert.equal(typeof out, "string");
        if (mark) assert.ok(out.includes(mark), `drew nothing for ${JSON.stringify(c).slice(0, 200)}`);
        assert.ok(!/<img|javascript:/i.test(out), out.slice(0, 200));
      }
      // (words: plain text, escaped where they're drawn)
      C.compareNow(c, nowAns, opts.viewAt); C.cardWords(c); C.liveItem(c); C.landWords(c, { mode: "before", landAt: NOW, rainAt: NOW + H, tz: opts.tz });
      assert.ok(new TextEncoder().encode(JSON.stringify(c)).length <= C.MAX_CARD);
      assert.ok(C.packCard(c) === null || C.packCard(c).length <= C.MAX_PACKED);
    }
    if (p) { plans++; const out = V.inviteHtml(p, opts); assert.equal(typeof out, "string"); assert.ok(out.includes("cd-card"), "an invite that passed draws"); assert.ok(!/<img/i.test(out)); assert.equal(typeof C.planWords(p, opts), "string"); }
    if (a) { answers++; const out = V.answerHtml(a, opts); assert.equal(typeof out, "string"); assert.ok(out.includes("cd-card"), "an answer that passed draws"); assert.ok(!/<img/i.test(out)); assert.equal(typeof C.answerWords(a, opts), "string"); }
    if (w) { whens++; const out = V.whenHtml(w, opts); assert.ok(out.includes("cd-card"), "a time that passed draws"); assert.ok(!/<img/i.test(out)); assert.equal(typeof C.whenWords(w, opts), "string"); }
    if (c?.there) assert.equal(C.canForward(c, { mine: true, to: "pat" }), false, "a there card never goes on to anyone else");
    C.clockIn(opts.viewAt, opts.tz); C.dayWords(opts.viewAt, opts.tz, NOW);
    V.stripHtml(mutate({ a: 1 }), { who: "<b>", start: NOW, end: NOW + H, tz: opts.tz });
  }
  assert.ok(cards > 300 && plans > 100 && answers > 100 && whens > 100, `survivors: ${cards} cards, ${plans} plans, ${answers} answers, ${whens} times`);
});
