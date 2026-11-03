// InFlite Today's morning notification (functions/_todaymorning.js): its words, from the cards, in each case (Chat's
// pigeons named only where Chat's own names preference is on, and never a word of any letter nor a pigeon's kind); when
// it's due, where the account is; the next time it comes, right across the clocks changing; and the scheduler's turn,
// run against a database of its own (Node's own SQLite in memory, standing in for D1, with the site's schema): one tick
// at a time, each account composed before its day's claimed, and claimed only while the tick's still beginning things,
// so one cut off part way leaves it for the next; at most PER_TICK accounts a tick; the day given back when nothing
// went; a device gone forgotten, and one failing five times in a row; and "Show it on this phone", which never counts
// as the day's. And since Today First: the day planned just before its morning's composed (functions/_todayacts.js
// planDay), so what Today did is said in the Fitness line, naming a friend only with Chat's names on, kept whole inside
// the 400 characters; and every note says it's Today's (app: "today").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { tddb, todayPrefs, morningCandidates } from "../../../functions/_today.js";
import { wxdb, OM_KEEP } from "../../../functions/_wxpush.js";
import { forecast } from "../mocks/wxappdata.mjs";
import { morningLines, composeMorning, previewMorning, sendMorningNow, morningTick, nextAt, isDue, tickTest, countedDb, PER_TICK, AT_ONCE, LEASE, DB_BUDGET, DB_MOST } from "../../../functions/_todaymorning.js";
import { Quiet, cardsMemo } from "../../../functions/_todaycards.js";
import { planDay } from "../../../functions/_todayacts.js";

const fixture = (f) => JSON.parse(readFileSync(new URL(`../mocks/today/${f}`, import.meta.url), "utf8"));
const CARDS = fixture("cards.json"), QUIET = fixture("cards.quiet.json"), MORNING = fixture("morning.json");
const AT = CARDS.at;                    // (Monday 2 November 2026, 08:10 in London: GMT)
const clone = (o) => JSON.parse(JSON.stringify(o));
const with_ = (k, card) => ({ ...clone(CARDS.cards), [k]: card });
const say = (cards, o = {}) => morningLines(cards, { names: false, tz: "Europe/London", t: AT, lines: {}, ...o });
const ON_WAY = (who, landsAt, more = {}) => ({ who: { id: `id-${who}`, name: `${who} Lee`, first: who, photoAt: null }, sentAt: AT - 3600e3, landsAt, km: 300, kind: "swift", mystery: false, bird: { name: "Biscuit", rank: "Navigator" }, from: "Paris", href: "x", ...more });

// ---- the words ----
test("the title: Weather's briefing title, or the day where the account is when Weather's isn't to be had or is turned off", () => {
  assert.equal(say(CARDS.cards).title, "London · 14° / 7°");
  assert.equal(say(with_("weather", { state: "error", href: "", said: "Couldn’t get the forecast just now.", retry: true })).title, "Your Monday");
  const off = say(CARDS.cards, { lines: { weather: false } });
  assert.equal(off.title, "Your Monday", "Weather's line off: not its title either");
  assert.ok(!off.out.includes("Weather") && !off.lines.some((l) => /sunny/.test(l)), "and no Weather line, nor said to have nothing");
  // (the day as it is there: 23:30 on Sunday in London is Monday in Tokyo)
  const late = Date.UTC(2026, 10, 1, 23, 30), none = with_("weather", { state: "empty", href: "", said: "x" });
  assert.equal(say(none, { t: late }).title, "Your Sunday");
  assert.equal(say(none, { t: late, tz: "Asia/Tokyo" }).title, "Your Monday");
});

test("the Weather line: the briefing's first sentence, and the official warning's when there's one; nothing to say, in out", () => {
  const r = say(CARDS.cards);
  assert.equal(r.lines[0], "Dry, sunny spells until about 15:00, then cloudy, with wind picking up. Met Office: yellow wind warning today 18:00 to tomorrow 03:00.");
  assert.equal(say(with_("weather", { ...CARDS.cards.weather, warning: null })).lines[0], "Dry, sunny spells until about 15:00, then cloudy, with wind picking up.");
  assert.deepEqual(say(QUIET.cards).lines[0], "Dry and partly cloudy tonight.");
  for (const state of ["empty", "error"]) assert.deepEqual(say(with_("weather", { state, href: "", said: "x" })).out, ["Weather"]);
});

test("the Fitness line: the session and its best time, a poor day, no best time, rest, an event, done; nothing planned, in out", () => {
  const fit = CARDS.cards.fitness, line = (c) => say(with_("fitness", c)).lines.find((l, i) => i === 1);
  assert.equal(line(fit), "Tempo 2 × 15 · best 10:00–11:00");
  assert.equal(line({ ...fit, best: { ...fit.best, poor: true, span: "07:00–08:00" } }), "Tempo 2 × 15 · no good time outside");
  assert.equal(line({ ...fit, best: null }), "Tempo 2 × 15, 1 h");
  assert.equal(line({ ...fit, best: null, session: { ...fit.session, secs: 4320 } }), "Tempo 2 × 15, 1 h 12 min");
  assert.equal(line({ ...fit, kind: "rest", session: null, best: null }), "Rest day");
  assert.equal(line({ ...fit, kind: "event", session: null, best: null, event: { name: "Dragon Ride" } }), "Event day: Dragon Ride");
  assert.equal(line({ ...fit, kind: "done", best: null, done: { name: "Morning Ride", sport: "ride", start: AT - 3600e3, secs: 3500, dist: 30000, tss: 60, from: "strava" } }), "Done: Morning Ride");
  assert.deepEqual(say(with_("fitness", QUIET.cards.fitness)).out, ["Fitness"], "kind none: nothing to say");
  assert.deepEqual(say(with_("fitness", { state: "empty", href: "", said: "x", action: {} })).out, ["Fitness"]);
});

// (a Chat card with these on their way, the soonest the card lists, and its counts of them all: by default, just these)
const chatWith = (inbound, total = inbound.length, from = new Set(inbound.map((p) => p.who.id)).size) => with_("chat", { ...CARDS.cards.chat, inbound, inboundTotal: total, inboundFrom: from });

test("the Chat line, names off (Chat's default): how many, never who", () => {
  const chat = CARDS.cards.chat;
  assert.equal(say(CARDS.cards).lines[2], "2 pigeons on their way");
  assert.equal(say(chatWith([chat.inbound[0]])).lines[2], "A pigeon on its way");
  const some = (k) => Array.from({ length: k }, (_, i) => ON_WAY(`F${i}`, AT + (i + 1) * 1e6));
  assert.equal(say(chatWith(some(5))).lines[2], "5 pigeons on their way");
  // (the card lists the soonest 6 at most, and counts them all: functions/_todaychat.js)
  assert.equal(say(chatWith(some(6))).lines[2], "6 pigeons on their way", "exactly 6: no more behind them");
  assert.equal(say(chatWith(some(6), 9, 9)).lines[2], "9 pigeons on their way", "9, of which the card lists 6");
  assert.equal(say(chatWith(some(2), 0, 0)).lines[2], "2 pigeons on their way", "never fewer than it lists");
  const r = say(with_("chat", { ...chat, inbound: [], inboundTotal: 0, inboundFrom: 0 }));
  assert.deepEqual(r.out, ["Chat"], "none on its way: nothing to say (landed ones and your own aren't the morning's)");
  assert.ok(!JSON.stringify(say(CARDS.cards)).includes("Sam") && !JSON.stringify(say(CARDS.cards)).includes("Mum"), "no one named");
});

test("the Chat line, names on: who, soonest first, each first name once; landing about, then at, within 10 minutes; never a kind", () => {
  const chat = CARDS.cards.chat, named = (inbound, t = AT, ...counts) => say(chatWith(inbound, ...counts), { names: true, t }).lines.find((l) => /igeon/.test(l));
  assert.equal(named([chat.inbound[0]]), "A pigeon from Sam, landing about 11:05", "the hostile name's first word, as the card gives it");
  assert.equal(named([ON_WAY("Ana", AT + 10 * 60e3 + 60e3)]), "A pigeon from Ana, landing about 08:21");
  assert.equal(named([ON_WAY("Ana", AT + 9 * 60e3)]), "A pigeon from Ana, landing at 08:19");
  assert.equal(named(chat.inbound), "Pigeons from Sam and Mum on their way");
  // (in the order they land, whatever order they come in)
  assert.equal(named([ON_WAY("Leo", AT + 5e6), ON_WAY("Ana", AT + 1e6), ON_WAY("Bo", AT + 3e6)]), "Pigeons from Ana, Bo and Leo on their way");
  assert.equal(named([ON_WAY("Ana", AT + 1e6), ON_WAY("Ana", AT + 2e6)]), "Pigeons from Ana on their way", "two from one friend: named once");
  const from = (names) => names.map((n, i) => ON_WAY(n, AT + (i + 1) * 1e6));
  assert.equal(named(from(["Ana", "Bo", "Cy", "Di", "Ed"])), "Pigeons from Ana, Bo and 3 others on their way");
  // (the card lists the soonest 6 at most, and counts them all, and the friends sending them: so exactly, however many)
  assert.equal(named(from(["Ana", "Bo", "Cy", "Di", "Ed", "Flo"])), "Pigeons from Ana, Bo and 4 others on their way", "6 friends, all listed");
  assert.equal(named(from(["Ana", "Bo", "Cy", "Di", "Ed", "Flo"]), AT, 9, 8), "Pigeons from Ana, Bo and 6 others on their way", "8 friends, 6 of them listed");
  assert.equal(named(from(["Ana", "Bo", "Ana", "Bo", "Ana", "Cy"])), "Pigeons from Ana, Bo and Cy on their way", "6 pigeons from 3 friends, all listed");
  assert.equal(named(from(["Ana", "Bo", "Ana", "Bo", "Ana", "Cy"]), AT, 8, 4), "Pigeons from Ana, Bo and 2 others on their way", "a 4th friend's further back than the list goes");
  assert.equal(named(from(["Ana", "Ana", "Ana", "Ana", "Ana", "Bo"]), AT, 7, 3), "Pigeons from Ana, Bo and 1 other on their way");
  assert.equal(named(from(["Ana", "Ana", "Ana", "Ana", "Ana", "Ana"]), AT, 7, 2), "Pigeons from Ana and 1 other on their way");
  assert.equal(named(from(["Ana", "Ana", "Ana", "Ana", "Ana", "Ana"]), AT, 8, 1), "Pigeons from Ana on their way", "all Ana's, more than the list holds");
  // (in the account's own zone: 11:05 in London is 20:05 in Tokyo)
  assert.equal(say(chatWith([chat.inbound[0]]), { names: true, tz: "Asia/Tokyo" }).lines.find((l) => /igeon/.test(l)), "A pigeon from Sam, landing about 20:05");
  // never the kind: a rocket, a mystery's, a swift
  const kinds = [ON_WAY("Ana", AT + 1e6, { kind: "rocket" }), ON_WAY("Bo", AT + 2e6, { kind: null, mystery: true })];
  for (const names of [false, true]) {
    const s = JSON.stringify(say(chatWith(kinds), { names }));
    assert.doesNotMatch(s, /rocket|swift|turbo|mystery|Biscuit|Navigator|Paris/i, s);
  }
});

test("morning: letter words for pigeons off", () => {
  const chat = CARDS.cards.chat, off = (inbound, o = {}, ...counts) => say(with_("chat", { ...chatWith(inbound, ...counts).chat, pigeons: false }), o).lines[2];
  assert.equal(off([chat.inbound[0]]), "A letter on its way", "names off, one");
  assert.equal(off(chat.inbound), "2 letters on their way", "names off, several");
  assert.equal(off([chat.inbound[0]], { names: true }), "A letter from Sam, arriving about 11:05", "one, named");
  assert.equal(off([ON_WAY("Ana", AT + 9 * 60e3)], { names: true }), "A letter from Ana, arriving at 08:19", "at, within 10 minutes");
  assert.equal(off([ON_WAY("Ana", NaN)], { names: true }), "A letter from Ana on its way", "one, no time");
  assert.equal(off(chat.inbound, { names: true }), "Letters from Sam and Mum on their way", "several, named");
  const from = ["Ana", "Bo", "Cy", "Di", "Ed"].map((n, i) => ON_WAY(n, AT + (i + 1) * 1e6));
  assert.equal(off(from, { names: true }), "Letters from Ana, Bo and 3 others on their way", "and the others");
  // (pigeons on, or the card saying nothing of them: as before)
  assert.equal(say(with_("chat", { ...chat, pigeons: true })).lines[2], "2 pigeons on their way");
  assert.equal(say(CARDS.cards).lines[2], "2 pigeons on their way");
});

test("the Markets line, in Markets' own words: traded, flat, shut, before the open; nothing owned, in out", () => {
  const mk = CARDS.cards.markets, line = (c) => say(with_("markets", c)).lines.at(-1);
  assert.equal(line(mk), "Your portfolio is up 0.3% today, at £20,862");
  assert.equal(line({ ...mk, change: -250.4, pct: -1.18 }), "Your portfolio is down 1.2% today, at £20,862");
  assert.equal(line({ ...mk, change: 0.6, pct: 0 }), "Your portfolio’s little changed today, at £20,862");
  assert.equal(line(QUIET.cards.markets), "London and New York are shut today. Your portfolio is at £20,801");
  assert.equal(line({ ...QUIET.cards.markets, market: { open: false, said: "Markets closed", shut: ["London"] } }), "London is shut today. Your portfolio is at £20,801");
  assert.equal(line({ ...QUIET.cards.markets, market: { open: false, said: "Markets closed", shut: [] } }), "Your portfolio is at £20,801, as it closed");
  assert.equal(line({ ...mk, value: 950.5, traded: false, market: { shut: [] } }), "Your portfolio is at £950.50, as it closed");
  assert.deepEqual(say(with_("markets", { ...mk, owned: 0 })).out, ["Markets"], "following only: nothing to say");
  assert.deepEqual(say(with_("markets", { state: "error", href: "", said: "x", retry: true })).out, ["Markets"]);
});

test("the whole of it: the apps' lines in order, those with nothing to say in out, the lines turned off in neither; the fixtures agree", () => {
  const r = say(CARDS.cards);
  assert.deepEqual(r, { title: "London · 14° / 7°", out: [], lines: [
    "Dry, sunny spells until about 15:00, then cloudy, with wind picking up. Met Office: yellow wind warning today 18:00 to tomorrow 03:00.",
    "Tempo 2 × 15 · best 10:00–11:00", "2 pigeons on their way", "Your portfolio is up 0.3% today, at £20,862"] });
  // (the morning view's example: this morning's, as it went at 07:02, before anything traded)
  const at7 = with_("markets", { ...CARDS.cards.markets, value: 20801.21, change: 0, pct: 0, traded: false, market: { open: false, said: "Markets closed", shut: [] } });
  const sent = say(at7, { t: MORNING.preview.at });
  assert.deepEqual({ title: sent.title, lines: sent.lines, out: sent.out }, { title: MORNING.preview.title, lines: MORNING.preview.lines, out: MORNING.preview.out });
  assert.deepEqual(say(QUIET.cards, { t: QUIET.at }), { title: "London · 13° / 8°", lines: ["Dry and partly cloudy tonight.", "London and New York are shut today. Your portfolio is at £20,801"], out: ["Fitness", "Chat"] });
  const off = say(CARDS.cards, { lines: { chat: false, markets: false } });
  assert.equal(off.lines.length, 2); assert.deepEqual(off.out, []);
  const err = say(fixture("cards.error.json").cards);
  assert.deepEqual(err, { title: "Your Monday", lines: [], out: ["Weather", "Fitness", "Chat", "Markets"] });
  assert.deepEqual(say({}), { title: "Your Monday", lines: [], out: ["Weather", "Fitness", "Chat", "Markets"] }, "no cards at all");
});

test("no letter's words, nor anything sealed, can reach the notification, whatever a card carries", () => {
  const MARKS = ["SECRET-CT", "SECRET-VIA", "SECRET-NOTE", "SECRET-BODY", "SECRET-WRAP", "98765", "SECRET-FROM", "SECRET-TO"];
  const leaky = (p) => ({ ...p, ct: "SECRET-CT", via_ct: "SECRET-VIA", via_note: "SECRET-NOTE", viaNote: "SECRET-NOTE", body: "SECRET-BODY", wrap: "SECRET-WRAP", photo_size: 98765, from: "SECRET-FROM", to: "SECRET-TO", note: "SECRET-NOTE" });
  const chat = { ...CARDS.cards.chat, inbound: CARDS.cards.chat.inbound.map(leaky), unread: CARDS.cards.chat.unread.map(leaky), mine: CARDS.cards.chat.mine.map(leaky), share: "SECRET-BODY", body: "SECRET-BODY" };
  for (const names of [false, true]) for (const inbound of [chat.inbound, chat.inbound.slice(0, 1)]) {
    const s = JSON.stringify(say(with_("chat", { ...chat, inbound, inboundTotal: inbound.length, inboundFrom: inbound.length }), { names }));
    for (const m of MARKS) assert.ok(!s.includes(m), `${m} in ${s}`);
  }
});

test("composed: the lines as the body (cut at 400 characters), Chat's names preference from the account, its tag and how long it keeps", async () => {
  const env = {}, row = { m_on: 1, m_at: 420, m_tz: null, m_lines: {}, m_sent: null, m_last: null, cards: {} };
  const off = await composeMorning(env, { id: "x", notify_prefs: null }, row, AT, { cards: CARDS.cards });
  assert.equal(off.title, "London · 14° / 7°");
  assert.equal(off.body, off.lines.join("\n"));
  assert.equal(off.lines[2], "2 pigeons on their way");
  assert.deepEqual({ tag: off.tag, url: off.url, ttl: off.ttl }, { tag: "today-morning", url: "/", ttl: 14400 });
  const on = await composeMorning(env, { id: "x", notify_prefs: JSON.stringify({ names: true }) }, row, AT, { cards: CARDS });
  assert.equal(on.lines[2], "Pigeons from Sam and Mum on their way", "the page's whole answer will do as well as its cards");
  const long = await composeMorning(env, { id: "x", notify_prefs: null }, row, AT, { cards: with_("weather", { ...CARDS.cards.weather, lead: "Wet. ".repeat(100).trim() }) });
  assert.equal([...long.body].length, 400); assert.ok(long.lines[0].length > 400, "the lines kept whole for the preview");
  const some = await composeMorning(env, { id: "x", notify_prefs: null }, { ...row, m_lines: { weather: false, markets: false } }, AT, { cards: CARDS.cards });
  assert.deepEqual(some.lines, ["Tempo 2 × 15 · best 10:00–11:00", "2 pigeons on their way"]);
});

// ---- when ----
test("the next time it comes: today's if it's still to come, else tomorrow's, right on the days the clocks change", () => {
  const L = "Europe/London";
  assert.equal(nextAt(L, 420, Date.UTC(2026, 2, 29, 0, 30)), Date.UTC(2026, 2, 29, 6, 0), "29 March (clocks forward): 07:00 BST");
  assert.equal(nextAt(L, 420, Date.UTC(2026, 9, 25, 0, 30)), Date.UTC(2026, 9, 25, 7, 0), "25 October (clocks back): 07:00 GMT");
  assert.equal(nextAt(L, 90, Date.UTC(2026, 2, 28, 23, 0)), Date.UTC(2026, 2, 29, 1, 30), "01:30 on 29 March, a minute that isn't: 02:30 BST's moment");
  // (a minute that comes twice, the night the clocks go back: the first time, by the summer's clocks, when it's due)
  assert.equal(nextAt(L, 90, Date.UTC(2026, 9, 24, 23, 0)), Date.UTC(2026, 9, 25, 0, 30), "01:30 on 25 October: 01:30 BST, the first of the two");
  assert.equal(nextAt(L, 90, Date.UTC(2026, 9, 25, 1, 10)), Date.UTC(2026, 9, 25, 1, 30), "between the two: 01:30 GMT, the second");
  assert.equal(nextAt(L, 90, Date.UTC(2026, 9, 25, 1, 30)), Date.UTC(2026, 9, 26, 1, 30), "both gone: the 26th's");
  assert.equal(nextAt("Europe/Berlin", 150, Date.UTC(2026, 9, 24, 20, 0)), Date.UTC(2026, 9, 25, 0, 30), "02:30 in Berlin on 25 October: CEST's, the first");
  assert.equal(nextAt("America/New_York", 90, Date.UTC(2026, 10, 1, 0, 0)), Date.UTC(2026, 10, 1, 5, 30), "01:30 in New York on 1 November: EDT's, the first");
  for (const t of [Date.UTC(2026, 9, 24, 23, 0), Date.UTC(2026, 9, 25, 1, 10)]) {
    const u = { id: "x", notify_prefs: null }, row = { m_on: 1, m_at: 90, m_tz: L, m_lines: {}, m_sent: null, m_last: null, cards: {} };
    let due = t + 60e3; while (!isDue(u, row, due)) due += 60e3;
    assert.equal(nextAt(L, 90, t), due, `from ${new Date(t).toISOString()}: the minute it's first due`);
  }
  assert.equal(nextAt(L, 420, Date.UTC(2026, 2, 28, 7, 0)), Date.UTC(2026, 2, 29, 6, 0), "07:00 come on the 28th: the 29th's, in BST");
  assert.equal(nextAt(L, 420, Date.UTC(2026, 9, 24, 8, 0)), Date.UTC(2026, 9, 25, 7, 0), "the 24th's gone: the 25th's, in GMT");
  assert.equal(nextAt(L, 420, Date.UTC(2026, 10, 2, 6, 59)), Date.UTC(2026, 10, 2, 7, 0));
  assert.equal(nextAt(L, 420, Date.UTC(2026, 10, 2, 7, 0)), Date.UTC(2026, 10, 3, 7, 0), "at its very minute: tomorrow's");
  assert.equal(nextAt("America/New_York", 390, Date.UTC(2026, 10, 1, 5, 0)), Date.UTC(2026, 10, 1, 11, 30), "New York's clocks back on 1 November: 06:30 EST");
  assert.equal(nextAt("Asia/Tokyo", 420, Date.UTC(2026, 10, 1, 23, 0)), Date.UTC(2026, 10, 2, 22, 0), "08:00 in Tokyo already: tomorrow's 07:00");
  assert.equal(nextAt("Not/AZone", 420, Date.UTC(2026, 10, 2, 6, 0)), Date.UTC(2026, 10, 2, 7, 0), "a zone that isn't one: London's");
});

test("due: once its time has come where the account is (Chat's zone, else the page's), for three hours, and not if today's is claimed", () => {
  const u = (tz) => ({ id: "x", notify_prefs: tz ? JSON.stringify({ tz }) : null }), row = (o = {}) => ({ m_on: 1, m_at: 420, m_tz: null, m_lines: {}, m_sent: null, m_last: null, cards: {}, ...o });
  const at = (h, m) => Date.UTC(2026, 10, 2, h, m);            // (Monday 2 November: London on GMT)
  assert.equal(isDue(u(), row(), at(6, 59)), false);
  assert.equal(isDue(u(), row(), at(7, 0)), true);
  assert.equal(isDue(u(), row(), at(10, 0)), true, "three hours late: still");
  assert.equal(isDue(u(), row(), at(10, 1)), false, "over three hours: that day's goes unsaid");
  assert.equal(isDue(u(), row({ m_sent: "2026-11-02" }), at(7, 5)), false, "today's claimed");
  assert.equal(isDue(u(), row({ m_sent: "2026-11-01" }), at(7, 5)), true, "yesterday's claimed");
  assert.equal(isDue(u("Asia/Tokyo"), row(), at(7, 0)), false, "16:00 in Tokyo");
  assert.equal(isDue(u("Asia/Tokyo"), row(), at(22, 5)), true, "07:05 on the 3rd in Tokyo");
  assert.equal(isDue(u("Asia/Tokyo"), row({ m_sent: "2026-11-02" }), at(22, 5)), true, "Tokyo's 2nd claimed: the 3rd's due there");
  assert.equal(isDue(u(), row({ m_tz: "America/New_York" }), at(12, 0)), true, "no zone chosen for Quiet Hours: the page's (07:00 in New York)");
  assert.equal(isDue(u("Europe/London"), row({ m_tz: "America/New_York" }), at(9, 0)), true, "Chat's zone first (09:00 in London, not New York's 04:00)");
  assert.equal(isDue(u("Europe/London"), row({ m_tz: "America/New_York" }), at(12, 30)), false, "Chat's zone first (12:30 in London is too late, though it's 07:30 in New York)");
  assert.equal(isDue({ id: "x", notify_prefs: JSON.stringify({ quiet: true }) }, row({ m_tz: "Asia/Tokyo" }), at(22, 5)), true, "Chat's zone left as it was (UTC by default): the page's");
});

// ---- the scheduler's turn ----
function d1() {
  const s = new DatabaseSync(":memory:");
  const exec = (sql, args) => {
    const p = s.prepare(sql);
    if (p.columns().length) return { results: p.all(...args), success: true, meta: { changes: 0 } };
    const r = p.run(...args);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v))),
    first: async (col) => { const row = s.prepare(sql).get(...args) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args),
    run: async () => exec(sql, args),
    raw: async () => s.prepare(sql).all(...args).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const PUSH = "http://push.test/push";
const env = { DB: d1(), PIGEON_PUSH_URL: PUSH, WXAPP_URL: "http://wx.test", METEOALARM_URL: "http://wx.test", NWS_URL: "http://wx.test", EA_URL: "http://wx.test", WARN_TTL: "0" };
await db(env); await tddb(env); await wxdb(env);
const q = (sql, ...a) => env.DB.sql.prepare(sql).all(...a), run = (sql, ...a) => env.DB.sql.prepare(sql).run(...a);

// a phone's subscription, as a browser makes one (its keys kept, to read what's sent to it)
const wc = crypto.subtle;
async function phone(n) {
  const kp = await wc.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), auth = crypto.getRandomValues(new Uint8Array(16));
  const pub = new Uint8Array(await wc.exportKey("raw", kp.publicKey));
  return { endpoint: `https://fcm.googleapis.com/fcm/send/today-test-${n}`, p256dh: Buffer.from(pub).toString("base64url"), auth: Buffer.from(auth).toString("base64url"), kp, pub, authBytes: auth };
}
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await wc.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await wc.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));
const te = new TextEncoder();
async function opened(ph, buf) {
  const salt = buf.slice(0, 16), n = buf[20], asPub = buf.slice(21, 21 + n), ct = buf.slice(21 + n);
  const shared = new Uint8Array(await wc.deriveBits({ name: "ECDH", public: await wc.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []) }, ph.kp.privateKey, 256));
  const ikm = await hkdf(ph.authBytes, shared, new Uint8Array([...te.encode("WebPush: info\0"), ...ph.pub, ...asPub]), 32);
  const key = await wc.importKey("raw", await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await wc.decrypt({ name: "AES-GCM", iv: await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12) }, key, ct));
  let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
  return JSON.parse(new TextDecoder().decode(pt.slice(0, end)));
}

// The push services, stood in for: each push kept ({ endpoint, body }), answered as answer(endpoint) says (201: sent,
// 410: gone, 500: failed); Open-Meteo's forecasts counted
let pushes = [], forecasts = 0, answer = () => 201;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u === PUSH) { const endpoint = o.headers["X-Endpoint"]; pushes.push({ endpoint, body: new Uint8Array(o.body) }); return new Response("", { status: answer(endpoint) }); }
  if (u.startsWith("http://wx.test/v1/forecast")) { forecasts++; return Response.json(forecast(MON7)); }
  return new Response("{}", { status: 404 });
};
const said = console.error;
console.error = () => {};
test.after(() => { globalThis.fetch = realFetch; console.error = said; });

// An account with the morning on (at 07:00 in London unless said), signed in on its phones (each a sign-in of its own)
let n = 0;
async function account(o = {}) {
  const id = `u${++n}`, t = Date.now();
  run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at, notify_prefs) VALUES (?1, ?1, ?1, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?2, ?2, ?3)", id, t, o.prefs ? JSON.stringify(o.prefs) : null);
  run("INSERT INTO td_prefs (user_id, cards, m_on, m_at, m_tz, m_lines, m_sent, m_last, updated) VALUES (?, '{}', 1, ?, ?, ?, ?, ?, ?)", id, o.at ?? 420, o.tz ?? null, JSON.stringify(o.lines || {}), o.sent ?? null, o.last ? JSON.stringify(o.last) : null, t);
  const phones = [];
  for (let k = 0; k < (o.phones ?? 1); k++) {
    const ph = await phone(`${id}-${k}`);
    run("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)", `s-${id}-${k}`, id, t, t);
    run("INSERT INTO td_push (endpoint, user_id, p256dh, auth, session, added, fails) VALUES (?, ?, ?, ?, ?, ?, ?)", ph.endpoint, id, ph.p256dh, ph.auth, `s-${id}-${k}`, t + k, o.fails ?? 0);
    phones.push(ph);
  }
  return { id, phones };
}
const prefs = (id) => ({ ...q("SELECT m_sent, m_last FROM td_prefs WHERE user_id = ?", id)[0] });
const devices = (id) => q("SELECT endpoint, fails, ok_at FROM td_push WHERE user_id = ? ORDER BY added", id);
// (each account's turned off once its test is done, so the next test's tick has only its own)
const done = () => run("UPDATE td_prefs SET m_on = 0");
const fromCards = (cards = CARDS.cards) => (env2, u, row, t, o) => composeMorning(env2, u, row, t, { ...o, cards });
const MON7 = Date.UTC(2026, 10, 2, 7, 5);                     // (07:05 on Monday 2 November in London)

test("a tick sends each account's that's due, once, to each of its phones, and keeps what it said; the next tick doesn't send it again", async () => {
  tickTest.compose = fromCards(); pushes = []; answer = () => 201;
  const a = await account({ phones: 2 }), b = await account({ at: 480 }), c = await account({ sent: "2026-11-02" });
  const r = await morningTick(env, MON7), { db: sent, ...counts } = r;
  assert.deepEqual(counts, { accounts: 3, due: 1, sent: 2, gone: 0, failed: 0, left: 0 });
  // (the day's plan, functions/_todayacts.js, its tables made the first time, among them)
  assert.ok(Number.isInteger(sent) && sent > 0 && sent < 80, `the statements it sent the database, counted: ${sent}`);
  assert.deepEqual(pushes.map((p) => p.endpoint).sort(), a.phones.map((p) => p.endpoint).sort(), "both of its phones, and no one else's");
  // (each phone's opened with its own keys: the two are pushed at once, so either may be first)
  const note = await opened(a.phones[0], pushes.find((p) => p.endpoint === a.phones[0].endpoint).body);
  assert.deepEqual(await opened(a.phones[1], pushes.find((p) => p.endpoint === a.phones[1].endpoint).body), note, "the same to each");
  assert.equal(note.title, "London · 14° / 7°");
  assert.equal(note.body, ["Dry, sunny spells until about 15:00, then cloudy, with wind picking up. Met Office: yellow wind warning today 18:00 to tomorrow 03:00.", "Tempo 2 × 15 · best 10:00–11:00", "2 pigeons on their way", "Your portfolio is up 0.3% today, at £20,862"].join("\n"));
  assert.deepEqual({ tag: note.tag, url: note.url }, { tag: "today-morning", url: "/" });
  const p = prefs(a.id);
  assert.equal(p.m_sent, "2026-11-02");
  assert.deepEqual(JSON.parse(p.m_last), { title: note.title, lines: note.body.split("\n"), out: [], at: MON7 });
  assert.ok(devices(a.id).every((d) => d.fails === 0 && d.ok_at), "each phone's kept as working");
  assert.equal(prefs(b.id).m_sent, null, "08:00's not come yet"); assert.equal(prefs(c.id).m_sent, "2026-11-02");
  pushes = [];
  const again = await morningTick(env, MON7 + 5 * 60e3);
  assert.equal(again.due, 0); assert.equal(pushes.length, 0, "not sent again");
  done();
});

test("composed before it's claimed: a compose that fails claims nothing, nor one that's done after the tick's time is up; the claim is against the day as it was", async () => {
  pushes = []; answer = () => 201;
  const a = await account({ sent: "2026-11-01" });
  tickTest.compose = async () => { throw new Error("the forecast's not answering"); };
  let r = await morningTick(env, MON7);
  assert.equal(r.due, 1); assert.equal(r.sent, 0); assert.equal(pushes.length, 0);
  assert.equal(prefs(a.id).m_sent, "2026-11-01", "nothing claimed: the next tick tries again");
  // composed, but past the tick's own time (the compose ran long): left for the next, claimed by no one
  const real = Date.now;
  tickTest.compose = async (...x) => { const note = await fromCards()(...x); const now = real(); Date.now = () => now + 30e3; return note; };
  try { r = await morningTick(env, MON7 + 5 * 60e3); } finally { Date.now = real; }
  assert.equal(r.left, 1, "said to be left for the next tick"); assert.equal(pushes.length, 0);
  assert.equal(prefs(a.id).m_sent, "2026-11-01", "and nothing claimed");
  // the day claimed by something else while this one composed (from what it read before): not sent twice
  tickTest.compose = async (...x) => { run("UPDATE td_prefs SET m_sent = '2026-11-02' WHERE user_id = ?", a.id); return fromCards()(...x); };
  r = await morningTick(env, MON7 + 10 * 60e3);
  assert.equal(pushes.length, 0, "claimed against yesterday's: lost, so not sent");
  run("UPDATE td_prefs SET m_sent = '2026-11-01' WHERE user_id = ?", a.id);
  tickTest.compose = fromCards();
  r = await morningTick(env, MON7 + 15 * 60e3);
  assert.equal(r.sent, 1); assert.equal(prefs(a.id).m_sent, "2026-11-02", "and in the end, claimed and sent");
  done();
});

test("one tick at a time: a second while one has the lease is busy; a lapsed lease is taken; given back at the end", async () => {
  tickTest.compose = fromCards(); pushes = []; answer = () => 201;
  run("INSERT OR REPLACE INTO td_meta (k, v) VALUES ('tick', ?)", String(MON7 + 60e3));
  assert.deepEqual(await morningTick(env, MON7), { busy: true });
  run("UPDATE td_meta SET v = ? WHERE k = 'tick'", String(MON7 - 1));
  assert.equal((await morningTick(env, MON7)).busy, undefined, "lapsed (its tick died part way): taken");
  assert.equal(q("SELECT v FROM td_meta WHERE k = 'tick'")[0].v, "0", "and given back");
  // two at once: one runs, the other's busy
  const both = await Promise.all([morningTick(env, MON7), morningTick(env, MON7)]);
  assert.equal(both.filter((x) => x.busy).length, 1);
  assert.ok(LEASE > 55e3 && LEASE < 5 * 60e3, "longer than the scheduler lets a tick run, shorter than the time between ticks");
});

test(`at most ${PER_TICK} accounts a tick; the rest are left, said so, and the next tick takes them`, async () => {
  tickTest.compose = fromCards(); pushes = []; answer = () => 201;
  const many = [];
  for (let k = 0; k < PER_TICK + 5; k++) many.push(await account());
  const one = await morningTick(env, MON7);
  assert.equal(one.due, PER_TICK + 5); assert.equal(one.sent, PER_TICK); assert.equal(one.left, 5);
  const two = await morningTick(env, MON7 + 5 * 60e3);
  assert.equal(two.due, 5); assert.equal(two.sent, 5); assert.equal(two.left, 0);
  assert.equal(new Set(pushes.map((p) => p.endpoint)).size, PER_TICK + 5, "every one, once");
  assert.ok(many.every((a) => prefs(a.id).m_sent === "2026-11-02"));
  done();
});

// (a compose as dear as a big portfolio's, cold: n statements to the database, a batch of 10 among them, then the words)
const dear = (n) => async (env2, u, row, t, o) => {
  await env2.DB.batch(Array.from({ length: 10 }, () => env2.DB.prepare("SELECT 1")));
  for (let i = 10; i < n; i++) await env2.DB.prepare("SELECT 1").first();
  return fromCards()(env2, u, row, t, o);
};

test("the database's statements counted as they're sent, a batch's each one; one refused isn't sent, and says so quietly", async () => {
  const told = [], D = countedDb(env.DB, (n) => { told.push(n); if (told.length > 2) return false; });
  const before = q("SELECT COUNT(*) AS n FROM td_meta")[0].n;
  await D.batch([D.prepare("SELECT 1"), D.prepare("SELECT 2"), D.prepare("SELECT 3")]);
  assert.equal((await D.prepare("SELECT ?1 AS x").bind(7).first()).x, 7);
  await assert.rejects(D.prepare("INSERT INTO td_meta (k, v) VALUES ('counted', '1')").run(), (e) => e instanceof Quiet);
  await assert.rejects(D.batch([D.prepare("SELECT 1")]), (e) => e instanceof Quiet);
  assert.deepEqual(told, [3, 1, 1, 1]);
  assert.equal(q("SELECT COUNT(*) AS n FROM td_meta")[0].n, before, "the refused one never reached the database");
});

test(`a tick counts what it sends the database: it begins no account once it's sent ${DB_BUDGET}, stops those composing past ${DB_MOST} but the first, leaves the rest for the next tick with nothing claimed, and stays well inside D1's 1,000`, async () => {
  pushes = []; answer = () => 201;
  const many = [];
  for (let k = 0; k < 12; k++) many.push(await account());
  tickTest.compose = dear(150);
  let all = 0, ticks = 0;
  const sends = [];
  for (let at = MON7; all < many.length && ticks < 8; at += 5 * 60e3, ticks++) {
    const r = await morningTick(env, at);
    assert.ok(r.db <= DB_MOST + 150 + AT_ONCE * 10, `this tick's statements (${r.db}): at most ${DB_MOST}, one compose and what follows those in flight`);
    assert.ok(r.db < 1000);
    assert.ok(r.sent >= 1, "each tick sends one at least");
    assert.equal(r.sent + r.left, r.due, JSON.stringify(r));
    // (those left: nothing claimed)
    assert.equal(many.filter((a) => prefs(a.id).m_sent === "2026-11-02").length, all + r.sent);
    all += r.sent; sends.push(r.sent);
  }
  assert.equal(all, many.length, `every account sent in the end (${sends.join(", ")} a tick)`);
  assert.ok(sends[0] < many.length, "not all in one tick: the database's share stopped it");
  assert.equal(new Set(pushes.map((p) => p.endpoint)).size, many.length, "each once");
  done();
});

test("composes each dearer than a tick's share at once: the one begun first finishes and is sent, the others are stopped (no more of their statements sent) and left; so every tick sends one", async () => {
  pushes = []; answer = () => 201;
  const many = [];
  for (let k = 0; k < AT_ONCE; k++) many.push(await account());
  tickTest.compose = dear(250);
  const r = await morningTick(env, MON7);
  assert.equal(r.due, AT_ONCE); assert.equal(r.sent, 1); assert.equal(r.left, AT_ONCE - 1, JSON.stringify(r));
  assert.ok(r.db <= DB_MOST + 250 + 10, `the others stopped at once: ${r.db}`);
  assert.equal(many.filter((a) => prefs(a.id).m_sent === "2026-11-02").length, 1, "only the one sent is claimed");
  const next = await morningTick(env, MON7 + 5 * 60e3);
  assert.ok(next.sent >= 1 && next.db < 1000, JSON.stringify(next));
  done();
});

test("nothing sent (the push service failing): the day given back, for a later tick; a phone gone forgotten; one failing a fifth time in a row forgotten", async () => {
  tickTest.compose = fromCards(); pushes = [];
  const failing = await account(), gone = await account(), worn = await account({ fails: 4 }), mixed = await account({ phones: 2 });
  const bad = new Set([failing.phones[0].endpoint, worn.phones[0].endpoint, mixed.phones[1].endpoint]);
  answer = (e) => (e === gone.phones[0].endpoint ? 410 : bad.has(e) ? 500 : 201);
  const r = await morningTick(env, MON7);
  assert.deepEqual({ sent: r.sent, gone: r.gone, failed: r.failed }, { sent: 1, gone: 1, failed: 3 });
  assert.equal(prefs(failing.id).m_sent, null, "nothing went: given back"); assert.equal(prefs(failing.id).m_last, null);
  assert.equal(devices(failing.id)[0].fails, 1, "one failure counted");
  assert.equal(devices(gone.id).length, 0, "its push service says it's gone: forgotten"); assert.equal(prefs(gone.id).m_sent, null);
  assert.equal(devices(worn.id).length, 0, "its fifth failure in a row: forgotten");
  assert.equal(prefs(mixed.id).m_sent, "2026-11-02", "one of two phones had it: the day's done");
  assert.deepEqual(devices(mixed.id).map((d) => d.fails), [0, 1]);
  // the service back: the next tick sends what was given back
  answer = () => 201; pushes = [];
  const next = await morningTick(env, MON7 + 5 * 60e3);
  assert.equal(next.sent, 1); assert.deepEqual(pushes.map((p) => p.endpoint), [failing.phones[0].endpoint]);
  assert.equal(devices(failing.id)[0].fails, 0, "working again: its failures forgotten");
  done();
});

test("nothing to say (every line off, or none of the apps with anything): the day's decided, and nothing sent; the Morning section doesn't show an earlier day's as this morning's", async () => {
  pushes = []; answer = () => 201;
  const sunday = { title: "London · 12° / 6°", lines: ["Sunday’s line"], out: [], at: Date.UTC(2026, 10, 1, 7, 2) };
  const a = await account({ lines: { weather: false, fitness: false, chat: false, markets: false } }), b = await account({ sent: "2026-11-01", last: sunday });
  tickTest.compose = fromCards(fixture("cards.error.json").cards);
  const r = await morningTick(env, MON7);
  assert.equal(r.due, 2); assert.equal(pushes.length, 0);
  assert.equal(prefs(a.id).m_sent, "2026-11-02"); assert.equal(prefs(b.id).m_sent, "2026-11-02");
  assert.deepEqual(JSON.parse(prefs(b.id).m_last), sunday, "what last went kept as it was");
  // (the day's decided with nothing sent: not Sunday's as this morning's, but tomorrow's, as it would be now)
  const view = await previewMorning(env, { id: b.id, notify_prefs: null }, await todayPrefs(env, b.id), MON7 + 60e3, { cards: CARDS.cards });
  assert.equal(view.kind, "next", JSON.stringify(view));
  assert.equal(view.at, Date.UTC(2026, 10, 3, 7, 0), "tomorrow's 07:00");
  assert.deepEqual(view.lines, say(CARDS.cards).lines);
  done();
});

test("the tick's accounts share what's asked for: two in one place ask Open-Meteo once", async () => {
  tickTest.compose = null; pushes = []; answer = () => 201; forecasts = 0;
  const a = await account(), b = await account();
  for (const [id, lat] of [[a.id, 51.5072], [b.id, 51.5101]])
    run("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?, ?, 1, ?)", id, JSON.stringify({ places: [{ name: "London", lat, lon: -0.1276 }], settings: {}, notify: {} }), Date.now());
  const r = await morningTick(env, MON7);
  done();
  assert.equal(r.sent, 2, JSON.stringify(r));
  assert.equal(forecasts, 1, `Open-Meteo asked ${forecasts} times`);
  // (and what each was sent is Weather's briefing there)
  for (const x of [a, b]) assert.match(JSON.parse(prefs(x.id).m_last).title, /^London · \d+° \/ \d+°$/);
});

test("Show it on this phone: sent to that phone now, its health kept, and never the day's (the claim and what was last sent untouched)", async () => {
  pushes = []; answer = () => 201;
  const last = { title: "London · 12° / 6°", lines: ["Earlier"], out: [], at: MON7 - 864e5 };
  const a = await account({ phones: 2, sent: "2026-11-01", last, fails: 2 });
  const u = { id: a.id, notify_prefs: null };
  const r = await sendMorningNow(env, u, { endpoint: a.phones[1].endpoint });
  assert.deepEqual(r, { sent: 1 });
  assert.deepEqual(pushes.map((p) => p.endpoint), [a.phones[1].endpoint], "that phone only");
  assert.deepEqual(prefs(a.id), { m_sent: "2026-11-01", m_last: JSON.stringify(last) }, "the day's claim and its last untouched");
  assert.deepEqual(devices(a.id).map((d) => d.fails), [2, 0], "that phone's health kept");
  answer = () => 410;
  assert.deepEqual(await sendMorningNow(env, u, { endpoint: a.phones[1].endpoint }), { sent: 0 });
  assert.equal(devices(a.id).length, 1, "gone: forgotten");
  await assert.rejects(sendMorningNow(env, u, { endpoint: "https://fcm.googleapis.com/fcm/send/someone-else" }), (e) => e.status === 400);
  assert.deepEqual(prefs(a.id), { m_sent: "2026-11-01", m_last: JSON.stringify(last) });
  done();
});

test("Show it on this phone is the page's: from the cards it worked out in the last minute, else worked out as a page's are, never spending what's kept of Open-Meteo's allowance for the briefings", async () => {
  pushes = []; answer = () => 201; forecasts = 0;
  const a = await account(), u = { id: a.id, notify_prefs: null }, row = await todayPrefs(env, a.id);
  run("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?, ?, 1, ?)", a.id, JSON.stringify({ places: [{ name: "Leeds", lat: 53.8008, lon: -1.5491 }], settings: {}, notify: {} }), Date.now());
  // (only the briefings' reserve left: a page's below its floor, which the tick may still spend)
  run("INSERT OR REPLACE INTO wx_meta (k, v) VALUES ('om_bucket', ?)", JSON.stringify({ n: OM_KEEP / 2, at: Date.now() }));
  assert.deepEqual(await sendMorningNow(env, u, { endpoint: a.phones[0].endpoint }), { sent: 1 });
  assert.equal(forecasts, 0, "Open-Meteo not asked: the reserve's the briefings'");
  const plain = await opened(a.phones[0], pushes[0].body);
  assert.match(plain.title, /^Your \w+day$/, "no forecast to be had: the day as its title");
  // (the tick, composing the same account's, may spend it)
  await composeMorning(env, u, row, Date.now());
  assert.equal(forecasts, 1, "the tick's compose asks");
  // (and with the page's cards from the last minute, those: nothing worked out again)
  cardsMemo.set(a.id, { at: CARDS.at, tz: "Europe/London", cards: CARDS.cards });
  pushes = [];
  assert.deepEqual(await sendMorningNow(env, u, { endpoint: a.phones[0].endpoint }), { sent: 1 });
  const note = await opened(a.phones[0], pushes[0].body);
  assert.equal(note.title, "London · 14° / 7°");
  assert.equal(note.body, say(CARDS.cards).lines.join("\n"));
  assert.equal(forecasts, 1, "nothing asked again");
  done();
});

test("the preview: this morning's as it went, once sent today where the account is; else the next, composed now from the page's cards", async () => {
  const u = { id: "x", notify_prefs: null }, last = { title: "London · 14° / 7°", lines: ["a", "b"], out: ["Chat"], at: MON7 };
  const row = (o) => ({ m_on: 1, m_at: 420, m_tz: null, m_lines: {}, m_sent: null, m_last: null, cards: {}, ...o });
  assert.deepEqual(await previewMorning(env, u, row({ m_sent: "2026-11-02", m_last: last }), AT, { cards: CARDS.cards }), { kind: "sent", ...last });
  const next = await previewMorning(env, u, row({ m_sent: "2026-11-01", m_last: last }), AT, { cards: CARDS.cards });
  assert.equal(next.kind, "next"); assert.equal(next.at, Date.UTC(2026, 10, 2, 8, 15), "08:10, today's not sent yet: the scheduler's next turn");
  assert.deepEqual({ title: next.title, lines: next.lines, out: next.out }, say(CARDS.cards));
  const later = await previewMorning(env, u, row({ m_at: 600 }), AT, { cards: CARDS.cards });
  assert.equal(later.at, Date.UTC(2026, 10, 2, 10, 0), "10:00's still to come today");
  assert.deepEqual(Object.keys(later).sort(), ["at", "kind", "lines", "out", "title"]);
  // (claimed today, but from a day before: not this morning's)
  const old = await previewMorning(env, u, row({ m_sent: "2026-11-02", m_last: { ...last, at: MON7 - 864e5 } }), AT, { cards: CARDS.cards });
  assert.equal(old.kind, "next"); assert.equal(old.at, Date.UTC(2026, 10, 3, 7, 0));
  // (its time moved later after today's was decided: still tomorrow's, as today's won't come again)
  const moved = await previewMorning(env, u, row({ m_at: 600, m_sent: "2026-11-02", m_last: { ...last, at: MON7 - 864e5 } }), AT, { cards: CARDS.cards });
  assert.equal(moved.at, Date.UTC(2026, 10, 3, 10, 0));
});

test("the preview's next time is when the scheduler will send it: due now and not yet sent (turned on late, or moved earlier), its next turn; off, its time", async () => {
  const u = { id: "x", notify_prefs: null }, row = (o) => ({ m_on: 1, m_at: 420, m_tz: null, m_lines: {}, m_sent: null, m_last: null, cards: {}, ...o });
  const at = async (o, t) => (await previewMorning(env, u, row(o), t, { cards: CARDS.cards })).at;
  assert.equal(await at({}, AT), Date.UTC(2026, 10, 2, 8, 15), "07:00 passed at 08:10, not yet sent: the scheduler's turn at 08:15");
  assert.equal(await at({ m_sent: "2026-11-01" }, Date.UTC(2026, 10, 2, 8, 15)), Date.UTC(2026, 10, 2, 8, 20), "at a turn's very minute: the next");
  assert.equal(await at({}, Date.UTC(2026, 10, 2, 9, 58)), Date.UTC(2026, 10, 2, 10, 0), "the last turn it's let run late");
  assert.equal(await at({}, Date.UTC(2026, 10, 2, 10, 0)), Date.UTC(2026, 10, 3, 7, 0), "after that, tomorrow's");
  assert.equal(await at({ m_on: 0 }, AT), Date.UTC(2026, 10, 3, 7, 0), "off: its time, not now");
  // (and that's the tick's own rule, minute by minute, across the clocks going back in London, Berlin and New York, and
  // on an ordinary day in Tokyo: the preview's time is the first of the scheduler's turns at which it's due)
  const cases = [["Europe/London", [0, 90, 420, 1435]], ["Europe/Berlin", [150]], ["America/New_York", [90, 390]], ["Asia/Tokyo", [420]]];
  for (const [tz, list] of cases) for (const m_at of list) for (const from of [Date.UTC(2026, 9, 24, 12), Date.UTC(2026, 9, 31, 12)]) {
    const r = row({ m_at, m_tz: tz });
    // (the first turn after t at which it's due: the last one found, while that's still to come, as none came between)
    let turn = 0;
    for (let t = from + 20e3; t < from + 48 * 3600e3; t += 23 * 60e3) {
      if (turn <= t) { turn = (Math.floor(t / 300e3) + 1) * 300e3; while (!isDue(u, r, turn)) turn += 300e3; }
      assert.equal(await at({ m_at, m_tz: tz }, t), turn, `${tz} ${m_at} from ${new Date(t).toISOString()}`);
    }
  }
});

test("morning: a pigeons-off account's morning notification uses letter words", async () => {
  tickTest.compose = null; done();
  // (Pat has pigeons off; Sam, a friend, has a letter on its way to Pat, landing in two hours)
  const pat = await account({ prefs: { names: true } }), sam = "sam-" + pat.id, t = Date.now();
  run("UPDATE pg_users SET pigeons = 0, new_way = 'instant' WHERE id = ?", pat.id);
  run("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at) VALUES (?1, ?1, 'Sam Lee', ?1 || '@example.com', '{}', 's', 'p', 'v', 3, 0, 0)", sam);
  run("INSERT INTO pg_links (a, b, status, created_at) VALUES (?, ?, 'ok', 0)", sam, pat.id);
  run("INSERT INTO pg_msgs (id, sender, recipient, ct, km, sent_at, deliver_at, pigeon) VALUES (?, ?, ?, 'x', 300, ?, ?, 'swift')", "lt-" + pat.id, sam, pat.id, t - 3600e3, t + 2 * 3600e3);
  const c = (await morningCandidates(env)).find((x) => x.u.id === pat.id);
  assert.equal(c.u.pigeons, 0, "the candidate carries the switch");
  const note = await composeMorning(env, c.u, { ...c.row, m_lines: { weather: false, fitness: false, markets: false } }, t);
  assert.equal(note.lines.length, 1);
  assert.match(note.lines[0], /^A letter from Sam, arriving about \d\d:\d\d$/);
  assert.doesNotMatch(JSON.stringify(note), /pigeon|streak/i);
  done();
});

// ---- what Today did, in the morning's words (Today First, spec §7.5) ----
const ACT = (uid, o = {}) => {
  const a = { id: crypto.randomUUID(), rule: "moveRide", day: "2026-11-02", target: "time:2026-11-02", kind: "move", state: "done", level: "do",
    was: { day: "2026-11-02", start: Date.UTC(2026, 10, 2, 18), stop: Date.UTC(2026, 10, 2, 19, 15), tz: "Europe/London", sport: "ride", source: "set" },
    now: { day: "2026-11-02", start: Date.UTC(2026, 10, 2, 16, 45), stop: Date.UTC(2026, 10, 2, 18), tz: "Europe/London", sport: "ride", source: "moved", why: { kind: "call", who: "Mira", start: Date.UTC(2026, 10, 2, 18, 30) } },
    said: "Moved your ride to 16:45, clear of Mira’s call", made: MON7 - 60e3, undo_until: Date.UTC(2026, 10, 2, 15, 45), ...o };
  run(`INSERT INTO td_acts (id, user_id, rule, day, target, kind, state, level, was, now, said, made, undo_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    a.id, uid, a.rule, a.day, a.target, a.kind, a.state, a.level, JSON.stringify(a.was), JSON.stringify(a.now), a.said, a.made, a.undo_until);
  return a;
};
const ADD = (uid, o = {}) => ACT(uid, { rule: "addRide", target: "day:2026-11-05", kind: "add", was: { planned: "rest" },
  now: { offer: crypto.randomUUID(), day: "2026-11-05", start: Date.UTC(2026, 10, 5, 10), stop: Date.UTC(2026, 10, 5, 12), state: "yes", secs: 7200 }, said: "Added: a ride on Thursday at 10:00", ...o });
const ROW = { m_on: 1, m_at: 420, m_tz: null, m_lines: {}, m_sent: null, m_last: null, cards: {} };

test("the act in the Fitness line: Chat's names off, the friend not named; on, named; what Today offers said too; never another day's, nor one undone", async () => {
  const a = await account(), b = await account({ prefs: { names: true } });
  for (const x of [a, b]) {
    ACT(x.id); ADD(x.id);
    ACT(x.id, { target: "offer:x", state: "undone" });
    ADD(x.id, { day: "2026-11-01", target: "day:2026-11-04", now: { offer: crypto.randomUUID(), day: "2026-11-04", start: Date.UTC(2026, 10, 4, 10), stop: Date.UTC(2026, 10, 4, 12), state: "yes" } });
  }
  const off = await composeMorning(env, { id: a.id, notify_prefs: null }, ROW, MON7, { cards: CARDS.cards });
  assert.equal(off.lines[1], "Tempo 2 × 15 · best 10:00–11:00. Moved your ride to 16:45 to clear your 18:30 call. Undo on Today. Added a ride on Thursday at 10:00. Undo on Today.");
  assert.ok(!JSON.stringify(off).includes("Mira"), "no friend named with names off");
  assert.equal(off.app, "today");
  const on = await composeMorning(env, { id: b.id, notify_prefs: JSON.stringify({ names: true }) }, ROW, MON7, { cards: CARDS.cards });
  assert.equal(on.lines[1], "Tempo 2 × 15 · best 10:00–11:00. Moved your ride to 16:45 to clear Mira’s call. Undo on Today. Added a ride on Thursday at 10:00. Undo on Today.");
  assert.equal(on.body.split("\n")[1], on.lines[1]);
  const c = await account();
  ACT(c.id, { state: "offered", level: "suggest" }); ADD(c.id, { state: "offered", level: "suggest" });
  const offered = await composeMorning(env, { id: c.id, notify_prefs: null }, ROW, MON7, { cards: CARDS.cards });
  assert.equal(offered.lines[1], "Tempo 2 × 15 · best 10:00–11:00. Your ride at 18:00 runs into your 18:30 call. Move it to 16:45 on Today. Thursday at 10:00 looks good for your usual ride. Add it on Today.");
  const none = await account();
  const plain = await composeMorning(env, { id: none.id, notify_prefs: null }, ROW, MON7, { cards: CARDS.cards });
  assert.equal(plain.lines[1], "Tempo 2 × 15 · best 10:00–11:00", "nothing done: the Fitness line as it was");
  done();
});

test("the act said whole inside the 400 characters (the lines before it cut instead), and even with Fitness's line off; every note is Today's (app)", async () => {
  const a = await account();
  ACT(a.id);
  const long = await composeMorning(env, { id: a.id, notify_prefs: null }, ROW, MON7, { cards: with_("weather", { ...CARDS.cards.weather, lead: "Wet. ".repeat(100).trim() }) });
  const said = "Moved your ride to 16:45 to clear your 18:30 call. Undo on Today.";
  assert.ok([...long.body].length <= 400, `${[...long.body].length}`);
  assert.ok(long.body.includes(said), "the act whole");
  assert.match(long.body.split("\n")[0], /^Wet\. Wet\..*…$/, "the weather line cut to make room");
  assert.ok(long.lines[0].length > 400, "the lines kept whole for the preview");
  const noFit = await composeMorning(env, { id: a.id, notify_prefs: null }, { ...ROW, m_lines: { fitness: false } }, MON7, { cards: CARDS.cards });
  assert.ok(noFit.lines.includes(said), `Fitness's line off: the act alone in its place (${JSON.stringify(noFit.lines)})`);
  assert.ok(!noFit.lines.some((l) => l.startsWith("Tempo")) && !noFit.out.includes("Fitness"));
  assert.equal(noFit.app, "today");
  const bare = await composeMorning({}, { id: "x", notify_prefs: null }, ROW, AT, { cards: CARDS.cards });
  assert.equal(bare.app, "today", "and one composed with no database to read acts from");
  done();
});

test("the tick plans each account's day before composing its morning, so the push says what Today did; a plan that fails leaves the morning to be sent", async () => {
  pushes = []; answer = () => 201;
  const order = [], a = await account();
  tickTest.plan = async (env2, u, t) => { order.push(`plan ${u.id}`); ACT(u.id); };
  tickTest.compose = async (...x) => { order.push(`compose ${x[1].id}`); return fromCards()(...x); };
  try {
    const r = await morningTick(env, MON7);
    assert.equal(r.sent, 1);
    assert.deepEqual(order, [`plan ${a.id}`, `compose ${a.id}`]);
    const note = await opened(a.phones[0], pushes[0].body);
    assert.equal(note.body.split("\n")[1], "Tempo 2 × 15 · best 10:00–11:00. Moved your ride to 16:45 to clear your 18:30 call. Undo on Today.");
    done(); pushes = [];
    const b = await account();
    tickTest.plan = async () => { throw new Error("the forecast's not answering"); };
    const r2 = await morningTick(env, MON7);
    assert.equal(r2.sent, 1, "the morning went all the same");
    done();
  } finally { tickTest.plan = null; tickTest.compose = null; }
  // (the real plan: run once for the account's day, the day claimed)
  const c = await account();
  tickTest.compose = fromCards();
  try { await morningTick(env, MON7); } finally { tickTest.compose = null; }
  assert.deepEqual(q("SELECT day FROM td_plans WHERE user_id = ?", c.id).map((x) => x.day), ["2026-11-02"]);
  assert.deepEqual(q("SELECT rule FROM td_rules WHERE user_id = ? ORDER BY rule", c.id).map((x) => x.rule), ["addRide", "holdRide", "moveRide"]);
  assert.deepEqual((await planDay(env, c, MON7 + 60e3)).acts, [], "planned already: the page's read does nothing more");
  done();
});
