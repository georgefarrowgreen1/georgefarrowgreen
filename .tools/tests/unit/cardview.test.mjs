// Send to a friend: how Chat draws a card, a request, an invite and an answer (pigeon/cardview.js): the words, the
// escaping, no inline styles, nothing that names a holding, and no answering a time that's passed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normCard, normPlan, normAns, normWhen } from "../../../pigeon/cards.js";
import { cardHtml, sheetCardHtml, askHtml, sideBySideHtml, inviteHtml, answerHtml, stripHtml, whenHtml } from "../../../pigeon/cardview.js";

const H = 3600e3, LON = "Europe/London";
const NOW = Date.now();
const day = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: LON }).format(new Date(ms));
// (a November day: London keeps UTC then, so the clock reads as written)
const at = (hh, mm = 0) => Date.UTC(2026, 10, 2, hh, mm);
const W = normCard({ kind: "weather", from: "weather", at: NOW - H, snap: { place: "North Walsham", tz: LON, temp: 12.4, code: 61, isDay: true, lead: "Rain from about 15:00.", rain: { now: false, at: NOW + 2 * H } }, ref: { cell: [52.8, 1.4] } });
const F = normCard({ kind: "fitness", from: "fitness", at: NOW - H, snap: { day: day(NOW), tz: LON, sport: "ride", name: "Tempo 2 × 15", secs: 3600, best: { start: at(18, 30), end: at(19, 30), dry: true } }, ref: { share: "AbCdEfGhIjKlMnOpQrStUv" } });
const M = normCard({ kind: "markets", from: "markets", at: NOW - H, snap: { name: "Rolls-Royce", sym: "RR.L", pct: 1.21, day: "2026-11-01" }, ref: { sym: "RR.L" } });
const P = normCard({ kind: "markets", from: "today", at: NOW - H, snap: { name: "x", sym: null, pct: -0.4, day: "2026-11-01" } });
const S = normCard({ kind: "streak", from: "today", at: NOW, snap: { who: "Sam", n: 12, best: 20 } });
const links = { weather: "https://weather.inflite.ai/", finance: "https://finance.inflite.ai" };
const noStyle = (h) => assert.ok(!/\sstyle=/i.test(h), "no inline styles");

test("a weather card: head, When sent and Now, the line, the change, and the link to the square", () => {
  const h = cardHtml(W, { now: { temp: 12, feels: 11, code: 61, isDay: true, rain: { now: true, at: NOW }, at: NOW }, viewAt: NOW, live: true, links, tz: LON });
  assert.match(h, /Weather<\/span><span class="cd-what"> · North Walsham/);
  assert.match(h, /When sent · \d\d:\d\d/);
  assert.match(h, /Now · \d\d:\d\d/);
  assert.match(h, /12°/);
  assert.match(h, /Rain due \d\d:\d\d/);
  assert.match(h, /Raining in North Walsham now\./);
  assert.match(h, /Changed since it was sent/);
  assert.match(h, /href="https:\/\/weather\.inflite\.ai\/\?lat=52\.80&amp;lon=1\.40&amp;name=North\+Walsham"/);
  assert.match(h, /Open in Weather/); assert.match(h, /rel="noopener"/);
  assert.match(h, /<svg/);
  noStyle(h);
});
test("before the first answer, Now waits; not live, one column and when it was sent", () => {
  const wait = cardHtml(W, { now: "wait", viewAt: NOW, live: true, tz: LON });
  assert.match(wait, /<small class="cd-lab">Now<\/small>/); assert.match(wait, /…/);
  assert.ok(!/Changed since|As it was when sent/.test(wait));
  const old = cardHtml(W, { now: null, viewAt: NOW + 3 * 24 * H, live: false, tz: LON });
  assert.match(old, /cd-one/); assert.ok(!/Now/.test(old));
  assert.match(old, /Sent \w{3} \d+ \w{3}/);
  assert.match(old, /Rain was due \d\d:\d\d/, "phrased for when it's viewed");
  const same = cardHtml(W, { now: { temp: 12, code: 61, isDay: true, rain: { now: false, at: NOW + 2 * H }, at: NOW }, viewAt: NOW, live: true, tz: LON });
  assert.match(same, /As it was when sent/); assert.match(same, /As forecast\./);
});
test("a fitness card: the session, its best time, and done with or without figures", () => {
  const h = cardHtml(F, { now: null, viewAt: NOW, live: false, tz: LON });
  assert.match(h, /Fitness<\/span><span class="cd-what"> · Today/);
  assert.match(h, /Tempo 2 × 15/);
  assert.match(h, /1 h · best 18:30–19:30, dry/);
  const done = cardHtml(F, { now: { done: true, secs: 3720, dist: 30400, tss: 48 }, viewAt: NOW, live: true, tz: LON });
  assert.match(done, /Done ✓/); assert.match(done, /1:02 · 30\.4 km · stress 48/); assert.match(done, /Changed since it was sent/);
  const bare = cardHtml(F, { now: { done: true }, viewAt: NOW, live: true, tz: LON });
  assert.match(bare, /Done ✓/);
  const other = normCard({ ...F, snap: { ...F.snap, day: "2026-11-01" } });
  assert.match(cardHtml(other, { viewAt: Date.parse("2026-11-05T10:00:00Z"), tz: LON }), /Fitness<\/span><span class="cd-what"> · Sun 1 Nov/);
  assert.ok(!/Open in/.test(h), "no link for Fitness");
});
test("a markets card: percent with its sign, the market, the link; a portfolio names no stock", () => {
  const h = cardHtml(M, { now: { pct: 1.62, day: "2026-11-01", stale: false, at: NOW }, viewAt: NOW, live: true, links, tz: LON });
  assert.match(h, /Markets<\/span><span class="cd-what"> · Rolls-Royce/);
  assert.match(h, /\+1\.21%/); assert.match(h, /\+1\.62%/); assert.match(h, /London/); assert.match(h, /cd-up/);
  assert.match(h, /href="https:\/\/finance\.inflite\.ai\/#s=RR\.L"/);
  const p = cardHtml(P, { viewAt: NOW, links, tz: LON });
  assert.match(p, /Markets<\/span><span class="cd-what"> · Portfolio/);
  assert.match(p, /−0\.40%/); assert.match(p, /cd-down/);
  assert.ok(!/Open in|#s=|TSCO|Tesco|RR\.L/.test(p));
  assert.ok(!/£|\$/.test(p));
});
test("a streak card", () => {
  const h = cardHtml(S, { viewAt: NOW, tz: LON });
  assert.match(h, /Chat<\/span><span class="cd-what"> · Flight streak/);
  assert.match(h, /12 days/); assert.match(h, /Best 20/);
});
test("links only from http(s) origins Chat gives", () => {
  const h = cardHtml(W, { viewAt: NOW, live: false, links: { weather: "javascript:alert(1)//" }, tz: LON });
  assert.ok(!/href=/.test(h));
  assert.ok(!/href=/.test(cardHtml(M, { viewAt: NOW, links: null, tz: LON })));
});
test("the sheet's card: as it would go, with its words", () => {
  const h = sheetCardHtml(W, { viewAt: NOW, links, tz: LON });
  assert.match(h, /cd-sheet/); assert.match(h, /North Walsham today: rain from about 15:00\./); assert.ok(!/When sent/.test(h));
  noStyle(h);
  // Chat's live look says otherwise (raining now): said as now, with its time, never as a bare line under the card's words
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: LON, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(NOW));
  const live = sheetCardHtml(W, { now: { temp: 12, feels: 11, code: 61, isDay: true, rain: { now: true, at: NOW }, at: NOW }, viewAt: NOW, links, tz: LON });
  assert.match(live, /North Walsham today: rain from about 15:00\./, "the words that go");
  assert.ok(live.includes(`<span class="cd-delta cd-changed">Now · ${clock}</span> Raining in North Walsham now.`), live);
  assert.ok(!/<p class="cd-said">Raining/.test(live), "not a bare line");
  noStyle(live);
  // (the same now: nothing more)
  assert.ok(!/Now ·/.test(sheetCardHtml(W, { now: { temp: 12, code: 61, isDay: true, rain: { now: false, at: NOW + 2 * H }, at: NOW }, viewAt: NOW, tz: LON })));
});
test("How’s yours? on both sides", () => {
  assert.match(askHtml({ kind: "weather" }, { mine: true }), /You asked how theirs is/);
  const open = askHtml({ kind: "weather" }, { who: "Leo", state: "open", id: "abc" });
  assert.match(open, /Leo asks how yours is/); assert.match(open, /data-act="askshow" data-id="abc">Show What Would Go/);
  const no = askHtml({ kind: "weather" }, { who: "Leo", state: "declined", id: "abc" });
  assert.match(no, /You didn’t send yours/); assert.match(no, /Send Yours After All/);
  const sent = askHtml({ kind: "weather" }, { who: "Leo", state: "sent", id: "abc" });
  assert.match(sent, /You sent yours back/); assert.ok(!/button/.test(sent));
});
test("side by side: You on the left, the friend on the right", () => {
  const theirs = normCard({ ...W, snap: { ...W.snap, place: "Lisbon", temp: 21, code: 0 } });
  const w = sideBySideHtml(W, theirs, { nowMine: { temp: 12, code: 53, isDay: true }, nowTheirs: null, who: "Priya", viewAt: NOW, tz: LON });
  assert.match(w, /Here and there · now/);
  assert.ok(w.indexOf(">You<") < w.indexOf(">Priya<"));
  assert.match(w, /12°/); assert.match(w, /Drizzle/); assert.match(w, /21°/); assert.match(w, /Clear/);
  const done = normCard({ ...F, snap: { ...F.snap, done: { secs: 3720, dist: 30400 } } });
  const f = sideBySideHtml(done, done, { who: "Priya", viewAt: NOW, tz: LON });
  assert.match(f, /Today’s sessions/); assert.match(f, /1:02/); assert.match(f, /30\.4 km ride/); assert.match(f, /Both done today/);
  const half = sideBySideHtml(done, F, { who: "Priya", viewAt: NOW, tz: LON });
  assert.match(half, /Tempo 2 × 15/); assert.ok(!/Both done today/.test(half));
  const m = sideBySideHtml(M, M, { who: "Priya", viewAt: NOW, tz: LON });
  assert.match(m, /Today’s moves/); assert.match(m, /Rolls-Royce/); assert.match(m, /\+1\.21%/);
});
const sat10 = Date.parse("2026-11-07T10:00:00Z");
const plan = normPlan({ sport: "ride", wid: "free-ride", name: "Ride how you like", secs: 7200, start: sat10, end: sat10 + 2 * H, tz: LON, opts: [{ start: sat10 + 3 * H, end: sat10 + 5 * H }], dry: true, far: false });
test("an invite: its time, dry for both, Yes / Later / No, and the other times under Later", () => {
  const viewAt = Date.parse("2026-11-03T09:00:00Z");
  const h = inviteHtml(plan, { who: "Leo", id: "inv1", canAnswer: true, tz: LON, viewAt });
  assert.match(h, /Ride together\?/); assert.match(h, /Sat 10:00–12:00/); assert.match(h, /Ride how you like · Dry for both/);
  for (const a of ["yes", "later", "no"]) assert.match(h, new RegExp(`data-act="planans" data-a="${a}" data-id="inv1"`));
  assert.match(h, /data-act="planlater" data-id="inv1" data-t="\d+">Sat 13:00/);
  assert.match(h, /class="cd-later" hidden/);
  assert.match(inviteHtml(plan, { who: "Leo", id: "inv1", tz: LON, viewAt, showLater: true }), /class="cd-later">/);
  const none = inviteHtml({ ...plan, opts: [] }, { id: "x", tz: LON, viewAt });
  assert.match(none, /No other time is dry for you both\./);
  const far = inviteHtml({ ...plan, far: true }, { id: "x", tz: LON, viewAt });
  assert.match(far, /Ride at the same time\?/); assert.match(far, /You’re far apart: same time, each where you are\./);
  assert.ok(!/planans/.test(inviteHtml(plan, { mine: true, who: "Leo", id: "x", tz: LON, viewAt })), "not on your own invite");
  assert.ok(!/planans/.test(inviteHtml(plan, { who: "Leo", id: "x", canAnswer: false, tz: LON, viewAt })), "nor once answered");
  noStyle(h);
});
test("an invite whose time has passed: said so, and nothing to answer", () => {
  const h = inviteHtml(plan, { who: "Leo", id: "inv1", canAnswer: true, tz: LON, viewAt: sat10 + 60e3 });
  assert.match(h, /This time has passed\./);
  assert.ok(!/planans|planlater/.test(h));
  const later = answerHtml(normAns({ re: "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c", a: "later", plan }), { who: "Leo", id: "a1", tz: LON, viewAt: sat10 + 60e3 });
  assert.match(later, /This time has passed\./); assert.ok(!/planans/.test(later));
});
test("answers: yes, later (Yes / No only), no", () => {
  const viewAt = Date.parse("2026-11-07T07:00:00Z"), re = "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c";
  const yes = answerHtml(normAns({ re, a: "yes", plan }), { who: "Leo", id: "a1", tz: LON, viewAt });
  assert.match(yes, /Leo: Yes, 10:00 ✓/); assert.match(yes, /In Fitness for you both to add · dry for both/);
  const later = answerHtml(normAns({ re, a: "later", plan: { ...plan, start: sat10 + 3 * H, end: sat10 + 5 * H, opts: [] } }), { who: "Leo", id: "a1", tz: LON, viewAt });
  assert.match(later, /Leo: Later suits me better/); assert.match(later, /13:00–15:00/);
  assert.match(later, /data-a="yes"/); assert.match(later, /data-a="no"/); assert.ok(!/data-a="later"/.test(later));
  const no = answerHtml(normAns({ re, a: "no" }), { who: "Leo", id: "a1", tz: LON, viewAt });
  assert.match(no, /Leo: Can’t make it this time/); assert.match(no, /Fitness keeps your plan as it was\./);
  assert.match(answerHtml(normAns({ re, a: "no" }), { mine: true, tz: LON, viewAt }), /You: Can’t make it this time/);
});
test("the strip: You and the friend, dry, wet and off, the window marked, 14 hours at most", () => {
  const hours = Array.from({ length: 20 }, (_, i) => ({ t: sat10 - 4 * H + i * H, me: i % 3 ? "dry" : "wet", them: i > 15 ? "off" : "dry" }));
  const h = stripHtml(hours, { who: "Leo", start: sat10, end: sat10 + 2 * H, tz: LON });
  assert.equal((h.match(/class="cd-cell/g) || []).length, 28);
  assert.equal((h.match(/cd-in/g) || []).length, 4);
  assert.match(h, />You</); assert.match(h, />Leo</); assert.match(h, /cd-wet/); assert.match(h, /cd-dry/);
  assert.equal(stripHtml([], {}), "");
  noStyle(h);
});
test("every field with script-like words comes out escaped", () => {
  const x = "<script>alert(1)</script>\"'&";
  const w = normCard({ kind: "weather", at: NOW, say: x, snap: { place: x, lead: x, temp: 1, code: 1 }, ref: { cell: [1, 1] } });
  const f = normCard({ kind: "fitness", at: NOW, say: x, snap: { day: "2026-11-01", sport: "ride", name: x, kind: x, done: {} } });
  const m = normCard({ kind: "markets", at: NOW, say: x, snap: { name: x, sym: "RR.L", pct: 1 }, ref: { sym: "RR.L" } });
  const s = normCard({ kind: "streak", at: NOW, say: x, snap: { who: x, n: 3 } });
  const p = normPlan({ ...plan, name: x });
  const outs = [w, f, m, s].flatMap((c) => [cardHtml(c, { live: true, now: { temp: 1, done: true, pct: 2 }, viewAt: NOW, links, tz: LON }), sheetCardHtml(c, { viewAt: NOW, links, tz: LON }), sideBySideHtml(c, c, { who: x, viewAt: NOW })])
    .concat([askHtml({ kind: "weather" }, { who: x, id: x }), inviteHtml(p, { who: x, id: x, tz: LON, viewAt: NOW }), answerHtml({ re: "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c", a: "yes", plan: p }, { who: x, id: x, tz: LON, viewAt: NOW }),
      stripHtml([{ t: NOW, me: x, them: "dry" }], { who: x, start: NOW, end: NOW + H, tz: LON })]);
  for (const h of outs) {
    assert.ok(!h.includes("<script>"), h.slice(0, 120));
    assert.ok(!/"'&(?!amp;|quot;|#39;|lt;|gt;)/.test(h));
    noStyle(h);
  }
  assert.ok(outs.some((h) => h.includes("&lt;script&gt;")));
});
test("nothing a check lets through makes a drawing throw: a bad zone, junk where a card should be", () => {
  // (each drawing gives "" rather than throw, so drawing nothing for a card that passed is how a throw would show)
  for (const tz of ["x", undefined, "Asia/Kathmandu"]) {
    for (const c of [W, F, M, P, S]) {
      for (const now of [{}, null, "wait", { quiet: true }, { gone: true }, { temp: 1, code: 2, rain: null, done: false, pct: 1, at: NOW }]) assert.match(cardHtml(c, { live: true, now, viewAt: NOW, tz }), /class="cd-card /);
      assert.match(cardHtml(c, { viewAt: NOW, tz }), /class="cd-card /);
      assert.match(sheetCardHtml(c, { tz }), /class="cd-card /);
      assert.match(sideBySideHtml(c, c, { tz, nowMine: {}, nowTheirs: { quiet: true } }), /class="cd-card /);
    }
    assert.match(inviteHtml(plan, { tz, viewAt: NOW }), /class="cd-card /);
    for (const a of ["yes", "later", "no"]) assert.match(answerHtml({ re: "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c", a, plan }, { tz, viewAt: NOW }), /class="cd-card /);
  }
  for (const junk of [null, undefined, 5, "x", {}, { kind: "weather" }, { kind: "weather", snap: {} }]) {
    assert.equal(cardHtml(junk), ""); assert.equal(inviteHtml(junk), ""); assert.equal(answerHtml(junk), ""); if (!junk?.kind) assert.equal(askHtml(junk), "");
  }
});

test("a rain time gone by reads \"Rain was due\" until there's a real answer beside it", () => {
  const w = normCard({ ...W, snap: { ...W.snap, rain: { now: false, at: NOW - 2 * H } } });
  for (const now of [null, "wait", { quiet: true }]) {
    const h = cardHtml(w, { now, viewAt: NOW, live: true, tz: LON });
    assert.match(h, /Rain was due \d\d:\d\d/, String(JSON.stringify(now)));
    assert.ok(!/Rain due/.test(h));
    assert.match(h, /Now<\/small>.*…/s);
  }
  assert.match(cardHtml(w, { viewAt: NOW, tz: LON }), /Rain was due/, "not live");
  // (with a real answer, "When sent" says the card as it was sent, and the line says what's changed)
  const h = cardHtml(w, { now: { temp: 12, code: 3, isDay: true, rain: null, at: NOW }, viewAt: NOW, live: true, tz: LON });
  assert.match(h, /When sent · \d\d:\d\d<\/small>.*Rain due \d\d:\d\d/s);
  assert.match(h, /No rain’s due now\./);
  assert.match(h, /Changed since it was sent/);
  // (still ahead: "Rain due", answer or not)
  assert.match(cardHtml(W, { now: null, viewAt: NOW, live: true, tz: LON }), /Rain due \d\d:\d\d/);
});
test("a weather card with no code: no sky made up, no glyph, no line", () => {
  const w = normCard({ kind: "weather", at: NOW - H, snap: { place: "NW", temp: 12 }, ref: { cell: [52.8, 1.4] } });
  for (const h of [cardHtml(w, { viewAt: NOW, tz: LON }), cardHtml(w, { now: { temp: 13, rain: null, at: NOW }, viewAt: NOW, live: true, tz: LON }), sheetCardHtml(w, { tz: LON }), sideBySideHtml(w, w, {})]) {
    assert.match(h, /12°/);
    assert.ok(!/Cloudy|cloudy|cd-glyph/.test(h), h);
  }
});
test("a session done when sent that Fitness can't see now: \"Done ✓\" in both columns, never the name over \"Done ✓\"", () => {
  const done = normCard({ ...F, snap: { ...F.snap, done: { secs: 3720, dist: 30400 } } });
  const h = cardHtml(done, { now: { done: false }, viewAt: NOW, live: true, tz: LON });
  const cols = h.split('class="cd-col"').slice(1);
  assert.equal(cols.length, 2);
  for (const c of cols) { assert.match(c, /<b class="cd-big cd-done">Done ✓<\/b>/); assert.match(c, /1:02 · 30\.4 km/); assert.ok(!c.includes("Tempo 2 × 15")); }
  assert.match(h, /As it was when sent/);
});

// ---------- Today First (spec §8.4): the weather where a friend is, a ride with friends, a time to talk ----------
const THERE = normCard({ kind: "weather", from: "chat", there: true, at: NOW - H, snap: { place: "Norwich", tz: LON, temp: 12, code: 61, isDay: true, rain: { now: true } }, ref: { cell: [52.63, 1.29], friend: "leo" } });
const RIDE = normCard({ kind: "fitness", from: "today", at: NOW - H, snap: { day: "2026-11-05", tz: LON, sport: "ride", name: "Ride how you like", secs: 7200, best: { start: Date.UTC(2026, 10, 5, 10), end: Date.UTC(2026, 10, 5, 12), dry: true }, with: ["Leo", "Ade"] } });
const UUID = "0b5c7c1e-6a43-4a8e-9a77-1f5e2f3a4b5c";
test("the weather where a friend is: “Where Leo is” as you sent it, “Where you are” on theirs", () => {
  const mine = cardHtml(THERE, { mine: true, who: "Leo", viewAt: NOW, links, tz: LON });
  assert.match(mine, /<span class="cd-app">Where Leo is<\/span><span class="cd-what"> · Norwich/);
  assert.match(cardHtml(THERE, { mine: false, who: "George", viewAt: NOW, tz: LON }), /<span class="cd-app">Where you are<\/span>/);
  assert.match(cardHtml(THERE, { mine: true, viewAt: NOW, tz: LON }), /<span class="cd-app">Where they are<\/span>/, "no name given");
  assert.match(sheetCardHtml(THERE, { who: "Leo", viewAt: NOW, tz: LON }), /<span class="cd-app">Where Leo is<\/span>/, "in the sheet, as it would go");
  assert.match(mine, /Open in Weather/, "the square, as any weather card");
  assert.match(cardHtml(THERE, { mine: true, who: "Leo", live: true, now: { temp: 13, code: 61, rain: { now: true }, at: NOW }, viewAt: NOW, tz: LON }), /Now · \d\d:\d\d/, "live through its square");
  assert.match(cardHtml(W, { mine: true, who: "Leo", viewAt: NOW, tz: LON }), /<span class="cd-app">Weather<\/span>/, "any other weather card as ever");
  noStyle(mine);
});
test("a ride with friends: “with Leo and Ade” on the ride card", () => {
  const h = cardHtml(RIDE, { viewAt: Date.parse("2026-11-03T09:00:00Z"), tz: LON });
  assert.match(h, /2 h · best 10:00–12:00, dry · with Leo and Ade/);
  const done = normCard({ ...RIDE, snap: { ...RIDE.snap, with: ["Leo"], done: { secs: 3720, dist: 30400 } } });
  assert.match(cardHtml(done, { viewAt: NOW, tz: LON }), /1:02 · 30\.4 km · with Leo/);
  assert.match(sheetCardHtml(RIDE, { viewAt: NOW, tz: LON }), /with Leo and Ade/);
  assert.ok(!/with /.test(cardHtml(F, { viewAt: NOW, tz: LON })), "none: nothing said");
});
const T0 = Date.parse("2026-11-03T09:00:00Z"), call = (o = {}) => normWhen({ kind: "call", start: Date.UTC(2026, 10, 3, 18, 30), mins: 30, tz: LON, opts: [Date.UTC(2026, 10, 3, 19), Date.UTC(2026, 10, 3, 19, 30)], ...o });
test("a time to talk: “Call at 18:30?” Yes · Another Time · No, the other times under Another Time", () => {
  const h = whenHtml(call(), { who: "Mira", id: "w1", canAnswer: true, tz: LON, viewAt: T0 });
  assert.match(h, /<span class="cd-app">Call at 18:30\?<\/span>/);
  assert.match(h, /18:30–19:00/); assert.match(h, /30 min/); assert.match(h, /Or 19:00 or 19:30/);
  assert.deepEqual([...h.matchAll(/class="cd-btn[^"]*" data-act="whenans" data-a="(\w+)" data-id="w1">([^<]+)</g)].map((m) => [m[1], m[2]]), [["yes", "Yes"], ["later", "Another Time"], ["no", "No"]]);
  assert.match(h, /class="cd-later" hidden><button type="button" class="cd-chip" data-act="whenans" data-a="yes" data-id="w1" data-t="\d+">19:00/);
  assert.match(whenHtml(call(), { id: "w1", tz: LON, viewAt: T0, showLater: true }), /class="cd-later">/);
  assert.ok(!/cd-later/.test(whenHtml(call({ opts: [] }), { id: "w1", tz: LON, viewAt: T0 })), "no other times: nothing under Another Time");
  // the words: meet, other days, an hour or more
  assert.match(whenHtml(call({ kind: "meet", mins: 60 }), { tz: LON, viewAt: T0 }), /Meet at 18:30\?<\/span>.*1 hour/s);
  assert.match(whenHtml(call({ start: Date.UTC(2026, 10, 4, 18, 30), mins: 90, opts: [] }), { tz: LON, viewAt: T0 }), /Call tomorrow at 18:30\?<\/span>.*Tomorrow 18:30–20:00.*1 h 30 min/s);
  assert.match(whenHtml(call({ start: Date.UTC(2026, 10, 7, 10), mins: 120, opts: [] }), { tz: LON, viewAt: T0 }), /Call Saturday at 10:00\?<\/span>.*Sat 10:00–12:00.*2 hours/s);
  assert.match(whenHtml(call({ start: Date.UTC(2026, 10, 14, 10), opts: [] }), { tz: LON, viewAt: T0 }), /Call on Sat 14 Nov at 10:00\?/);
  assert.match(whenHtml(call(), { tz: "Asia/Kolkata", viewAt: T0 }), /Call tomorrow at 00:00\?/, "on the reader's clock");
  // yours, answered, passed
  const mine = whenHtml(call(), { mine: true, who: "Mira", id: "w1", tz: LON, viewAt: T0 });
  assert.match(mine, /You asked Mira\./); assert.ok(!/whenans/.test(mine)); assert.match(mine, /cd-mine/);
  assert.ok(!/whenans/.test(whenHtml(call(), { who: "Mira", id: "w1", canAnswer: false, tz: LON, viewAt: T0 })), "once answered");
  const mid = whenHtml(call(), { id: "w1", tz: LON, viewAt: Date.UTC(2026, 10, 3, 18, 45) });
  assert.ok(!/data-a="yes" data-id="w1">Yes/.test(mid), "the first time gone: no Yes to it");
  assert.match(mid, /data-t="\d+">19:00/); assert.match(mid, /Another Time/);
  const gone = whenHtml(call(), { id: "w1", tz: LON, viewAt: Date.UTC(2026, 10, 3, 19, 45) });
  assert.match(gone, /This time has passed\./); assert.ok(!/whenans/.test(gone));
  noStyle(h);
  for (const junk of [null, 5, {}, { kind: "call" }, { kind: "ride", start: Date.UTC(2026, 10, 3, 18, 30), mins: 30 }]) assert.equal(whenHtml(junk), "");
});
test("answers to a time: yes (in Today for you both), another time, no", () => {
  const s = Date.UTC(2026, 10, 3, 19);
  const yes = answerHtml(normAns({ id: UUID, a: "yes", start: s }), { who: "Mira", tz: LON, viewAt: T0 });
  assert.match(yes, /Mira: Yes, 19:00 ✓/); assert.match(yes, /In Today for you both/); assert.ok(!/Fitness/.test(yes));
  assert.match(answerHtml({ id: UUID, a: "yes", start: Date.UTC(2026, 10, 4, 19) }, { who: "Mira", tz: LON, viewAt: T0 }), /Mira: Yes, tomorrow 19:00 ✓/);
  assert.match(answerHtml({ id: UUID, a: "yes" }, { mine: true, tz: LON, viewAt: T0 }), /You: Yes ✓/);
  assert.match(answerHtml({ id: UUID, a: "later" }, { who: "Mira", tz: LON, viewAt: T0 }), /Mira: Another time</);
  const no = answerHtml({ id: UUID, a: "no" }, { who: "Mira", tz: LON, viewAt: T0 });
  assert.match(no, /Mira: Can’t make that time/); assert.ok(!/Fitness keeps your plan/.test(no), "never a ride's words");
  for (const h of [yes, no]) { assert.ok(!/<button/.test(h)); noStyle(h); }
});
test("the new fields escaped, and nothing drawn for them throws in a bad zone", () => {
  const x = "<script>alert(1)</script>\"'&";
  const outs = [cardHtml(THERE, { mine: true, who: x, viewAt: NOW, tz: LON }), sheetCardHtml(THERE, { who: x, tz: LON }),
    cardHtml(normCard({ ...RIDE, snap: { ...RIDE.snap, with: [x, x + "2"] } }), { viewAt: NOW, tz: LON }),
    whenHtml(call(), { who: x, id: x, mine: true, tz: LON, viewAt: T0 }), whenHtml(call(), { who: x, id: x, tz: LON, viewAt: T0 }), answerHtml({ id: UUID, a: "yes", start: T0 }, { who: x, tz: LON, viewAt: T0 })];
  for (const h of outs) { assert.ok(!h.includes("<script>"), h.slice(0, 120)); noStyle(h); }
  assert.ok(outs.every((h) => h.includes("&lt;script&gt;")));
  for (const tz of ["x", undefined, "Asia/Kathmandu"]) {
    assert.match(whenHtml(call(), { tz, viewAt: T0 }), /class="cd-card /);
    assert.match(whenHtml(call({ tz: undefined }), { tz, viewAt: T0 }), /class="cd-card /);
    assert.match(cardHtml(THERE, { tz, viewAt: NOW, live: true, now: {} }), /class="cd-card /);
    assert.match(cardHtml(RIDE, { tz, viewAt: NOW }), /class="cd-card /);
    for (const a of ["yes", "later", "no"]) assert.match(answerHtml({ id: UUID, a, start: T0 }, { tz, viewAt: T0 }), /class="cd-card /);
  }
});
