// Today's day, version 2 (functions/_todayday.js dayFor, Today First spec §7.1–§7.4, §7.6), against a real database
// (node:sqlite, made to look like D1, with each app's own tables) and Open-Meteo stood in for through fetch: the demo's
// Monday in London from real rows (a ride moved to 16:45 in fx_times, Mira's call agreed in Chat, Today's two acts,
// Thursday's habit ride and Leo's agreed one, Pat's and Mira's messages, a Garmin row waiting, then the ride in Fitness),
// each phase's answer the shape of its fixture (.tools/tests/mocks/today/cards.<phase>.json, the page's tests being
// built on those) and in its words: the honest after card both ways, planning handed to waitUntil, an undone add
// hidden, Waiting for You with names and never words, every Markets card a percent and nothing more.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { wxdb } from "../../../functions/_wxpush.js";
import { fitdb } from "../../../functions/_fitness.js";
import { tddb } from "../../../functions/_today.js";
import { offersReady } from "../../../functions/_fitshare.js";
import { timesReady } from "../../../functions/_fittimes.js";
import { timesFor } from "../../../functions/_times.js";
import { dayFor, dayInputs } from "../../../functions/_todayday.js";
import { phaseOf } from "../../../functions/_todayphase.js";
import { withForDay } from "../../../functions/_todaycards.js";
import { unpackCard, normCard } from "../../../pigeon/cards.js";

const FIX = (n) => JSON.parse(readFileSync(new URL(`../mocks/today/${n}.json`, import.meta.url), "utf8"));
const MIN = 60e3, H = 60 * MIN, DAY = 24 * H, LON = "Europe/London";
const at = (h, m = 0, d = 2) => Date.UTC(2026, 10, d, h, m);                // (Monday 2 November 2026: London on GMT)

// ---- the database ----
const sql = new DatabaseSync(":memory:");
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ q, bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const asked = [];
let waited = [];
const env = {
  DB: { prepare: (q) => { asked.push(q); return st(q); },
    batch: async (list) => { sql.exec("BEGIN"); try { const out = []; for (const s of list) out.push(/^\s*(SELECT|PRAGMA|WITH)\b/i.test(s.q) ? await s.all() : await s.run()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } },
  WXAPP_URL: "http://om.test",
  waitUntil: (p) => { waited.push(p); Promise.resolve(p).catch(() => {}); },
};
const put = (table, row) => sql.prepare(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...val(Object.values(row)));
await db(env); await wxdb(env); await fitdb(env); await tddb(env); await offersReady(env); await timesReady(env); await timesFor(env, "nobody", 0, 1, { t: 0 });
sql.exec("CREATE TABLE IF NOT EXISTS fx_garmin_new (user_id TEXT NOT NULL, id TEXT NOT NULL, start INTEGER, name TEXT, added INTEGER NOT NULL, size INTEGER NOT NULL DEFAULT 0, sport TEXT, secs INTEGER, dist REAL, PRIMARY KEY (user_id, id))");

// ---- Open-Meteo, for a ride's week where you ride: light rain 15:00 to 17:00, then dry; 8° feels-like at 16:00 ----
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  const url = new URL(String(u));
  if (url.host !== "om.test") return new Response("{}", { status: 404 });
  const o = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], is_day: [] };
  for (let s = at(0); s < at(0) + 7 * DAY; s += H) {
    const hr = new Date(s).getUTCHours(), wet = hr === 15 || hr === 16;
    o.time.push(s / 1000); o.temperature_2m.push(10); o.apparent_temperature.push(hr === 16 ? 8 : 9.5); o.precipitation_probability.push(wet ? 70 : 10); o.precipitation.push(wet ? 0.6 : 0);
    o.weather_code.push(wet ? 61 : 3); o.wind_speed_10m.push(10); o.wind_gusts_10m.push(20); o.wind_direction_10m.push(250); o.is_day.push(hr >= 7 && hr < 17 ? 1 : 0);
  }
  return new Response(JSON.stringify({ utc_offset_seconds: 0, hourly: o }), { headers: { "Content-Type": "application/json" } });
};
after(() => { globalThis.fetch = realFetch; });

// ---- George's day ----
const id = (n) => `b1c2d3e4-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ME = id(0), LEO = id(3), PAT = id(11), MIRA = id(12), NIA = id(14);
const PREFS = JSON.stringify({ quiet: true, quietFrom: 21, quietTo: 6, tz: LON, names: false });
const user = (uid, name, x = {}) => put("pg_users", { id: uid, handle: `h${uid.slice(-2)}`, name, email: `${uid}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0, ...x });
user(ME, "George Farrow", { notify_prefs: PREFS }); user(LEO, "Leo Park"); user(PAT, "Pat Kelly"); user(MIRA, "Mira Shah"); user(NIA, "Nia Adeyemi");
for (const f of [LEO, PAT, MIRA, NIA]) put("pg_links", { a: ME, b: f, status: "ok", created_at: 0 });
const U = { id: ME, name: "George Farrow", notify_prefs: PREFS };
// (their words, which must never come out)
const msg = (mid, x) => put("pg_msgs", { id: mid, km: 0, ct: `SECRET-${mid}`, instant: 1, from_place: "SECRET-PLACE", to_place: "SECRET-PLACE", ...x });
msg("pat1", { sender: PAT, recipient: ME, sent_at: at(9, 20), deliver_at: at(9, 20) });
msg("pat2", { sender: PAT, recipient: ME, sent_at: at(9, 41), deliver_at: at(9, 41) });
msg("mira", { sender: MIRA, recipient: ME, sent_at: at(17, 8), deliver_at: at(17, 8) });
// (a pigeon from Nia, from Edinburgh: in the air, on Chat's card, never named as a place)
put("wx_accts", { user_id: ME, data: JSON.stringify({ places: [{ name: "London", lat: 51.5072, lon: -0.1276 }], settings: {}, notify: {} }), ver: 1, updated: 0 });
// the ride, moved by Today's clash rule to 16:45; Mira's call at 18:30, agreed in Chat
put("fx_times", { user_id: ME, day: "2026-11-02", start: at(16, 45), stop: at(18), tz: LON, sport: "ride", source: "moved", made: at(6) });
const CALL = "9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5";
put("td_times", { user_id: ME, id: CALL, kind: "call", start: at(18, 30), stop: at(19), tz: LON, with_id: MIRA, who: "Mira", role: "asked", state: "yes", made: at(6), until: at(19) + 12 * H });
// Thursday: the habit ride Today added (not kept), and the ride Leo agreed to in Chat (not yet in Fitness)
const HABIT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a81", WITH_LEO = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a82";
const offer = (o) => put("fx_offers", { user_id: ME, start: at(10, 0, 5), stop: at(11, 0, 5), tz: LON, sport: "ride", wid: "free-ride", name: "Ride", secs: 3600, who: "", role: "today", far: 0, dry: 1, state: "yes", made: at(6), until: at(11, 0, 5) + 12 * H, taken: 0, ...o });
offer({ id: HABIT });
offer({ id: WITH_LEO, role: "answered", who: "Leo", with_id: LEO, state: "new" });
// Today's two acts this morning, as functions/_todayacts.js keeps them: the move (target the day's fx_times row), and the
// add (target the day it adds to; its offer in now)
const MOVE = "7a0e1f52-3c4d-4e5f-8a9b-0c1d2e3f4a01", ADD = "7a0e1f52-3c4d-4e5f-8a9b-0c1d2e3f4a02";
const act = (a) => put("td_acts", { user_id: ME, made: at(6), ...a, was: a.was === undefined ? null : JSON.stringify(a.was), now: a.now === undefined ? null : JSON.stringify(a.now) });
act({ id: MOVE, rule: "moveRide", day: "2026-11-02", target: "time:2026-11-02", kind: "move", state: "done", level: "do", was: { day: "2026-11-02", start: at(18), stop: at(19, 15), tz: LON, sport: "ride", source: "set" },
  now: { day: "2026-11-02", start: at(16, 45), stop: at(18), tz: LON, sport: "ride", source: "moved", why: { kind: "call", who: "Mira", start: at(18, 30) } }, said: "Moved your ride to 16:45, clear of Mira’s call", undo_until: at(15, 45) });
act({ id: ADD, rule: "addRide", day: "2026-11-02", target: "day:2026-11-05", kind: "add", state: "done", level: "do", was: { planned: "rest" },
  now: { offer: HABIT, day: "2026-11-05", start: at(10, 0, 5), stop: at(11, 0, 5), state: "yes", secs: 3600, k: 6, n: 8 }, said: "Added: a ride on Thursday at 10:00", undo_until: at(9, 0, 5) });
put("td_plans", { user_id: ME, day: "2026-11-02", at: at(6) });

// each moment's cards: the fixture's, with what the cards hold apart for the day (Markets' hours and alerts, tomorrow)
const HELD = (tesco) => [{ sym: "TSCO.L", name: "Tesco", pct: tesco, day: "2026-11-02", where: "London" }, { sym: "RR.L", name: "Rolls-Royce", pct: -0.8, day: "2026-11-02", where: "London" }];
function cardsAt(phase) {
  const c = FIX(`cards.${phase}`).cards, tesco = c.markets.holdings[0].pct;
  withForDay(c.markets, { hours: [{ where: "London", open: at(8), close: at(16, 30) }], held: HELD(tesco), alerts: tesco >= 3 ? [{ sym: "TSCO.L", name: "Tesco", pct: tesco, alert: 3 }] : [] });
  withForDay(c.weather, { tomorrow: { at: at(7, 0, 3), day: "2026-11-03", temp: 7, feels: 6, code: 1, label: "Mostly Clear", pop: 5, rain: 0, wind: 4, wet: false, said: "dry and still", good: "run" }, deg: (v) => `${Math.round(v)}°` });
  return c;
}
const day = (phase, t) => dayFor(env, U, t, cardsAt(phase), { tz: LON });
const V2 = (phase) => { const f = FIX(`cards.${phase}`); delete f.at; delete f.tz; delete f.cards; delete f.morning; return f; };

// The shape of one answer against a fixture's: the same keys, each the same type (null on either side matches anything),
// lists by their first entry (the card for Chat may be null on either side)
function sameShape(got, want, where = "") {
  if (want === null || got === null) return;
  if (Array.isArray(want)) { assert.ok(Array.isArray(got), `${where}: a list`); if (want.length && got.length) sameShape(got[0], want[0], `${where}[0]`); return; }
  if (typeof want === "object") {
    assert.ok(got && typeof got === "object" && !Array.isArray(got), `${where}: an object`);
    assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${where}: its keys`);
    for (const k of Object.keys(want)) sameShape(got[k], want[k], `${where}.${k}`);
    return;
  }
  assert.equal(typeof got, typeof want, `${where}: ${typeof want}`);
}
// Nothing that mustn't leave: no message's words, no Chat place; every Markets card a percent only, unchanged through
// normCard; no line to send with money in it, or a number that isn't a percent, a time, a temperature, a length or a name
const NAMES = ["Endurance 75"];
function privacy(answer) {
  const json = JSON.stringify(answer);
  assert.ok(!/SECRET|Edinburgh/.test(json), "no words of a message, and no Chat place");
  const cards = [], shares = [];
  (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "sendCard" && typeof x === "string") cards.push(x); else if (k === "share" && typeof x === "string") shares.push(x); else walk(x); } })(answer);
  for (const s of cards) {
    const c = unpackCard(s);
    assert.ok(c, "every card for Chat unpacks");
    if (c.kind === "markets") {
      assert.deepEqual(Object.keys(c.snap).sort(), ["day", "name", "pct", "sym"], `a Markets card: ${JSON.stringify(c.snap)}`);
      assert.deepEqual(normCard(c), c, "unchanged through normCard");
    }
  }
  for (const s of shares) {
    assert.ok(!/[£$€]/.test(s), `no money in "${s}"`);
    let rest = s;
    for (const n of NAMES) rest = rest.split(n).join("");
    rest = rest.replace(/[+−-]?\d+(\.\d+)?%/g, "").replace(/\b\d{1,2}:\d\d\b/g, "").replace(/−?\d+°/g, "").replace(/\b\d+(\.\d+)? ?(mi|km|miles)\b/g, "");
    assert.ok(!/\d/.test(rest), `no bare number in "${s}"`);
  }
  return cards.length;
}
const lines = (top) => top.lines.join(" | ");

test("07:00, morning: the plan joined up, the acts with Undo, and the later phases' cards worked out already", async () => {
  const d = await day("morning", at(7));
  sameShape(d, V2("morning"), "morning");
  assert.equal(d.v, 2); assert.equal(d.phase, "morning"); assert.equal(d.since, at(6)); assert.equal(d.until, at(11));
  assert.deepEqual(d.timeline, phaseOf(at(7), LON, { dayStart: 360, eveningAt: 1140, rides: [{ start: at(16, 45), stop: at(18), secs: 4500, source: "moved" }], dones: [] }).timeline);
  assert.deepEqual(d.timeline.map((x) => x.phase), ["morning", "midday", "preride", "riding", "midday", "evening", "morning"]);
  assert.deepEqual(Object.keys(d.tops), ["morning", "midday", "preride", "riding"], "up to riding: what follows needs an activity");
  const m = d.tops.morning;
  assert.equal(m.kind, "plan"); assert.equal(m.chip, "Moved"); assert.equal(m.title, "Your day, joined up");
  assert.equal(m.lines[0], "Today: rain from 15:00, heaviest at 17:00, your ride at 16:45 before Mira’s call at 18:30.");
  assert.ok(m.lines.includes("Moved your ride to 16:45, clear of Mira’s call.") && m.lines.includes("Added: a ride on Thursday at 10:00."), lines(m));
  assert.ok(m.lines.includes("London opens at 08:00."), lines(m));
  assert.ok(!m.lines.includes("Nothing needed moving."));
  assert.deepEqual(m.buttons, [{ do: "undo", id: MOVE, label: "Undo the Move" }, { do: "undo", id: ADD, label: "Undo Thursday’s Ride" }]);
  assert.deepEqual(m.stats, [{ label: "Rain", value: "From 15:00" }, { label: "Ride", value: "16:45" }, { label: "Call", value: "18:30" }]);
  assert.equal(m.share, "My ride today: Endurance 75 at 16:45.");
  const card = unpackCard(m.sendCard);
  assert.equal(card.kind, "fitness"); assert.equal(card.snap.name, "Endurance 75"); assert.equal(card.snap.wid, "rh:endurance:75");
  assert.deepEqual(card.snap.best, { start: at(16, 45), end: at(18), dry: false }, "best: the ride's own window, wet at first");
  assert.equal(card.snap.secs, 4500); assert.equal(card.snap.done, null);
  // (the rest of the answer)
  assert.deepEqual(d.waiting, [], "Pat hasn't written yet");
  assert.deepEqual(d.upcoming.map((r) => r.id), ["rain", "close", "ride", `pigeon:${NIA}`, `time:${CALL}`, `offer:${HABIT}`, `offer:${WITH_LEO}`]);
  assert.deepEqual(d.upcoming.find((r) => r.id === "ride").sub, "Light rain at first");
  assert.deepEqual(d.acts.map((a) => [a.id, a.rule, a.state, a.undoUntil]), [[MOVE, "moveRide", "done", at(15, 45)], [ADD, "addRide", "done", at(9, 0, 5)]]);
  assert.deepEqual(d.ride, { start: at(16, 45), stop: at(18), name: "Endurance 75", secs: 4500, sport: "ride", source: "moved", hold: true }, "the moved time, from the ride's row");
  assert.deepEqual(d.quiet, { on: true, from: 21, to: 6 });
  assert.deepEqual(d.apps, { weather: "9°, rain from 15:00", fitness: "Endurance 75 today", markets: "Opens at 08:00", mail: false });
  assert.equal("planning" in d, false, "the day's planned already");
  privacy(d);
});

test("12:30, midday: the weather you'll ride in; Pat waiting, named, never her words", async () => {
  asked.length = 0;
  const d = await day("midday", at(12, 30));
  sameShape(d, V2("midday"), "midday");
  assert.equal(d.phase, "midday"); assert.equal(d.until, at(16, 5));
  const w = d.tops.midday;
  assert.equal(w.kind, "weather"); assert.equal(w.chip, "London · now"); assert.equal(w.title, "14° · Dry until 15:00");
  assert.deepEqual(w.lines, ["Then rain, heaviest at 17:00.", "Your ride at 16:45 catches light rain at first, clearing by 17:00."]);
  assert.deepEqual(w.stats, [{ label: "Now", value: "14°" }, { label: "Rain", value: "From 15:00" }, { label: "Heaviest", value: "17:00" }]);
  assert.deepEqual(w.buttons, [{ do: "open", label: "Radar", href: "/weather/#radar" }]);
  assert.equal(w.share, FIX("cards.midday").cards.weather.share);
  assert.deepEqual(d.waiting, [{ id: PAT, first: "Pat", at: at(9, 41), n: 2 }], "who and since when, two of hers");
  // (no column of a message but those allowed was read)
  for (const q of asked.filter((q) => /\bpg_msgs\b/.test(q))) assert.ok(!/\bm\.(ct|via_ct|via_note|body|wrap|photo|from_place|to_place)\b/.test(q.split(/\bFROM\b/i)[0]), q);
  assert.equal(d.apps.markets, "Tesco +1.2%");
  privacy(d);
});

test("16:05, preride: the ride, roads wet, a jacket, messages held, done before Mira's call", async () => {
  const d = await day("preride", at(16, 5));
  sameShape(d, V2("preride"), "preride");
  const r = d.tops.preride;
  assert.equal(r.kind, "ride"); assert.equal(r.chip, "In 40 minutes"); assert.equal(r.title, "Endurance 75 at 16:45");
  assert.deepEqual(r.lines, ["Light rain at first, clearing by 17:00, light wind", "A jacket for the first half hour", "Messages are held while you ride, except warnings", "Done before Mira’s call at 18:30"]);
  assert.deepEqual(r.stats, [{ label: "Time", value: "1:15" }, { label: "Out in", value: "8°" }, { label: "Roads", value: "Wet", tone: "warn" }]);
  assert.deepEqual(r.buttons.map((b) => [b.label, b.href]), [["Radar", "/weather/#radar"], ["The Session", "/fitness/#today"]]);
  assert.deepEqual(Object.keys(d.tops), ["preride", "riding"]);
  assert.equal(d.apps.fitness, "Endurance 75 at 16:45");
  privacy(d);
});

test("16:50, riding: until unknown, messages held, the count held so far", async () => {
  const d = await day("riding", at(16, 50));
  sameShape(d, V2("riding"), "riding");
  assert.equal(d.phase, "riding"); assert.equal(d.until, null);
  const r = d.tops.riding;
  assert.equal(r.chip, "Riding · messages held"); assert.equal(r.title, "Endurance 75 · since 16:45");
  assert.ok(r.lines.includes("Nothing held yet; warnings still get through"), lines(r));
  assert.deepEqual(r.stats.map((s) => [s.label, s.value]), [["Time", "1:15"], ["Held", "0"], ["Roads", "Wet"]]);
  assert.equal(d.apps.fitness, "Riding now");
  assert.ok(!d.upcoming.some((x) => x.id === "ride"), "the ride's under way, not coming up");
});

test("18:05, after, from a Garmin row only: the honest card (no Stress, once Fitness has it, Open Fitness), Mira wrote, Send to Leo", async () => {
  put("fx_garmin_new", { user_id: ME, id: "g1", start: at(16, 46), name: "Evening Ride", added: at(18, 2), size: 1, sport: "cycling", secs: 4500, dist: 36050 });
  const d = await day("after", at(18, 5));
  sameShape(d, V2("after"), "after");
  assert.equal(d.phase, "after"); assert.equal(d.since, at(18, 1)); assert.equal(d.until, at(19, 31));
  assert.deepEqual(Object.keys(d.tops), ["after", "evening"], "the evening's settled: the ride's in and London's closed");
  const a = d.tops.after;
  assert.equal(a.kind, "done"); assert.equal(a.chip, "Done"); assert.equal(a.title, "Endurance 75 · 1:15");
  assert.deepEqual(a.lines, ["From your watch", "Stress and fitness once Fitness has it", "Mira wrote while you rode"]);
  assert.deepEqual(a.stats, [{ label: "Time", value: "1:15" }, { label: "Distance", value: "22.4 mi" }]);
  assert.ok(!a.stats.some((s) => s.label === "Stress" || s.label === "Fitness"), "no Stress or Fitness from a waiting row");
  assert.deepEqual(a.buttons, [{ do: "open", label: "Open Fitness", href: "/fitness/#activities" }, { do: "answer", id: MIRA, label: "Answer Mira", href: `/chats/#open=${MIRA}` },
    { do: "sendto", id: LEO, to: LEO, label: "Send to Leo" }]);
  assert.deepEqual(a.sendTo, { id: LEO, first: "Leo", why: "Riding with you Thursday" }, "the friend of the next agreed ride, still new");
  assert.deepEqual(a.wrote, [{ id: MIRA, first: "Mira", at: at(17, 8) }]);
  assert.equal(a.share, "Done: Endurance 75, 1:15, 22.4 mi.");
  const card = unpackCard(a.sendCard);
  assert.deepEqual(card.snap.done, { secs: 4500, dist: 36050 }, "only what's known: no stress"); assert.equal(card.snap.best, null);
  assert.equal(d.ride.doneAt, at(18, 1));
  assert.equal(d.apps.fitness, "Endurance 75 done");
  assert.deepEqual(d.waiting.map((w) => w.first), ["Mira", "Pat"]);
  privacy(d);
});

test("18:05, after, with the ride in Fitness: Stress, and Fitness (CTL) up against yesterday's; no Open Fitness", async () => {
  // (as Fitness's import does: the ride into fx_acts, the waiting row gone; and eight weeks before it)
  sql.prepare("DELETE FROM fx_garmin_new WHERE user_id = ?").run(ME);
  const act = (aid, start, tss, extra = {}) => put("fx_acts", { user_id: ME, id: aid, start, sport: "ride", indoor: 0, name: "Ride", type: "fit", size: 1, sum: JSON.stringify({ tss, secs: 3600, dist: 30000, route: [[1, 2]], ...extra }), added: start });
  for (let n = 56; n >= 1; n--) act(`h${n}`, at(17) - n * DAY, 50);
  act("today", at(16, 46), 68, { secs: 4500, dist: 36050 });
  asked.length = 0;
  const d = await day("after-fit", at(18, 5));
  sameShape(d, V2("after-fit"), "after-fit");
  const a = d.tops.after;
  assert.deepEqual(a.lines, ["From Fitness", "Mira wrote while you rode"]);
  assert.deepEqual(a.stats.map((s) => s.label), ["Distance", "Stress", "Fitness"]);
  assert.equal(a.stats[1].value, "68");
  assert.match(a.stats[2].value, /^\d+ ↑$/); assert.equal(a.stats[2].tone, "up");
  assert.ok(!a.buttons.some((b) => b.label === "Open Fitness"));
  assert.deepEqual(unpackCard(a.sendCard).snap.done, { secs: 4500, dist: 36050, tss: 68 });
  // (only the stress read out of each summary, never the route)
  const q = asked.find((x) => /FROM fx_acts/.test(x) && /json_extract/.test(x));
  assert.ok(q && !/SELECT[^]*\bsum\b\s*,/.test(q.replace(/json_\w+\(sum[^)]*\)/g, "")), q);
  privacy(d);
});

test("21:00, evening: the day closed: Tesco past its alert, the ride and its fitness, tomorrow first, quiet hours", async () => {
  const d = await day("evening", at(21));
  sameShape(d, V2("evening"), "evening");
  assert.equal(d.phase, "evening"); assert.equal(d.since, at(19, 31)); assert.equal(d.until, at(6, 0, 3));
  const e = d.tops.evening;
  assert.equal(e.kind, "closed"); assert.equal(e.chip, "The day closed"); assert.equal(e.title, "Up 0.4%, 22 miles, and Mira’s call");
  assert.equal(e.lines[0], "Markets: Tesco finished +3.4%, past your 3% alert");
  assert.match(e.lines[1], /^Fitness: 1:15, stress 68, fitness up to \d+$/);
  assert.ok(e.lines.includes("Tomorrow first: dry and still at 07:00, a good morning for a run"), lines(e));
  assert.equal(e.lines.at(-1), "Quiet hours until 06:00");
  assert.deepEqual(e.stats.map((s) => [s.label, s.value, s.tone]).slice(0, 2), [["Portfolio", "+0.4%", "up"], ["Ride", "22 mi", undefined]]);
  assert.equal(e.share, "Tesco finished up 3.4% today.");
  const stock = unpackCard(e.sendCard);
  assert.deepEqual(stock.snap, { name: "Tesco", sym: "TSCO.L", pct: 3.4, day: "2026-11-02" }); assert.deepEqual(stock.ref, { sym: "TSCO.L" });
  assert.deepEqual(d.upcoming[0], { at: at(7, 0, 3), app: "weather", title: "Dry and still", sub: "A good morning for a run", href: "/weather/#day=2026-11-03", id: "tomorrow" });
  assert.match(d.apps.fitness, /^1:15, stress 68$/);
  assert.equal(d.ride.doneAt, at(18, 1));
  // (and every Markets card in the cards themselves too: the portfolio's, each holding's)
  assert.ok(privacy({ ...d, cards: cardsAt("evening") }) >= 4);
});

test("planning: the first read of the day after its start hands planDay to waitUntil, never awaited, and says so; none before the start", async () => {
  sql.prepare("DELETE FROM td_plans WHERE user_id = ?").run(ME);
  waited = [];
  let d = await day("morning", at(3));
  assert.equal(d.phase, "evening"); assert.equal("planning" in d, false, "before 06:00: not yet"); assert.equal(waited.length, 0);
  d = await day("morning", at(7));
  assert.equal(d.planning, true); assert.equal(waited.length, 1, "handed to waitUntil");
  assert.equal(typeof waited[0]?.then, "function");
  await Promise.all(waited);
  // (no waitUntil, as in a test with none: still planning, nothing run)
  const bare = await dayFor({ ...env, waitUntil: undefined }, U, at(7), cardsAt("morning"), { tz: LON });
  assert.equal(bare.planning, true);
  put("td_plans", { user_id: ME, day: "2026-11-02", at: at(6) });
  waited = [];
  d = await day("morning", at(7, 30));
  assert.equal("planning" in d, false); assert.equal(waited.length, 0);
});

test("the overlay: an add undone today hides its ride everywhere, and Fitness's line says the day as it was", async () => {
  const TODAY_HABIT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a99";
  // (Today's habit ride for today at 10:00, undone; Fitness hasn't heard, so its plan still says the habit's session)
  offer({ id: TODAY_HABIT, start: at(10), stop: at(11), state: "yes", taken: 1 });
  act({ id: "undone-add", rule: "addRide", day: "2026-10-30", target: "day:2026-11-02", kind: "add", state: "undone", level: "suggest", was: { planned: "rest" },
    now: { offer: TODAY_HABIT, day: "2026-11-02", start: at(10), stop: at(11), state: "yes" }, said: "Added: a ride today at 10:00", made: at(7, 0, 30), undo_until: at(9) });
  const cards = cardsAt("morning");
  cards.fitness = { ...cards.fitness, session: { ...cards.fitness.session, id: "free-ride", name: "Free ride" } };
  const d = await dayFor(env, U, at(8), cards, { tz: LON });
  assert.ok(!d.upcoming.some((r) => r.id === `offer:${TODAY_HABIT}`), "not coming up");
  assert.equal(d.ride.start, at(16, 45), "not the day's ride, though it's taken and yes");
  assert.ok(!d.timeline.some((x) => x.phase === "preride" && x.at === at(9, 20)), "and no preride for it");
  assert.equal(d.apps.fitness, "Rest day", "what the act's was recorded");
  const inputs = await dayInputs(env, U, at(8), LON, cards);
  assert.deepEqual(inputs.rides.map((r) => r.start), [at(16, 45)]);
  assert.equal(inputs.dayStart, 360); assert.equal(inputs.eveningAt, 1140);
  sql.prepare("DELETE FROM fx_offers WHERE id = ?").run(TODAY_HABIT); sql.prepare("DELETE FROM td_acts WHERE id = ?").run("undone-add");
});

test("a ride from habit on its day, added and not kept: Keep (and Undo while it can be); an earlier day's add said once", async () => {
  const ON_DAY = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a98";
  offer({ id: ON_DAY, start: at(10), stop: at(11), state: "yes", taken: 0 });
  act({ id: "add-on-day", rule: "addRide", day: "2026-10-30", target: "day:2026-11-02", kind: "add", state: "done", level: "do", was: { planned: "none" },
    now: { offer: ON_DAY, day: "2026-11-02", start: at(10), stop: at(11), state: "yes", secs: 3600 }, said: "Added: a ride on Monday at 10:00", made: at(7, 0, 30), undo_until: at(9) });
  let m = (await day("morning", at(8))).tops.morning;
  assert.ok(m.lines.includes("From your habit: a ride at 10:00 today."), m.lines.join(" | "));
  assert.ok(!m.lines.includes("Added: a ride on Monday at 10:00."), "said once, as Keep's line");
  assert.deepEqual(m.buttons.filter((b) => b.id === "add-on-day"), [{ do: "take", id: "add-on-day", label: "Keep" }, { do: "undo", id: "add-on-day", label: "Undo the Ride" }]);
  let d = await day("morning", at(9, 30));
  assert.deepEqual(d.tops.morning.buttons.filter((b) => b.id === "add-on-day"), [{ do: "take", id: "add-on-day", label: "Keep" }], "past its Undo: Keep alone");
  assert.ok(d.upcoming.some((r) => r.id === `offer:${ON_DAY}` && r.sub === "From habit, dry"), "Coming Up: from habit, not kept");
  assert.notEqual(d.ride.start, at(10), "not kept: no phase of its own");
  // (kept: an explicit ride, the day's)
  sql.prepare("UPDATE fx_offers SET taken = 1 WHERE id = ?").run(ON_DAY);
  d = await day("morning", at(9, 30));
  assert.equal(d.phase, "preride"); assert.equal(d.ride.start, at(10)); assert.equal(d.ride.source, "offer");
  assert.ok(!d.tops.morning || !d.tops.morning.lines.includes("From your habit: a ride at 10:00 today."));
  sql.prepare("DELETE FROM fx_offers WHERE id = ?").run(ON_DAY); sql.prepare("DELETE FROM td_acts WHERE id = ?").run("add-on-day");
});

test("at suggest and at quiet: the suggestion's button (until it's past), the clash's line only; Nothing needed moving when there's nothing", async () => {
  sql.prepare("UPDATE td_acts SET state = 'offered', level = 'suggest', said = 'Your ride runs into Mira’s call at 18:30; 16:45 is clear' WHERE id = ?").run(MOVE);
  sql.prepare("UPDATE td_acts SET state = 'said', level = 'quiet', said = 'Thursday’s often a ride day' WHERE id = ?").run(ADD);
  let m = (await day("morning", at(7))).tops.morning;
  assert.deepEqual(m.buttons, [{ do: "take", id: MOVE, label: "Move It to 16:45" }]);
  assert.ok(m.lines.includes("Your ride runs into Mira’s call at 18:30; 16:45 is clear.") && m.lines.includes("Thursday’s often a ride day."), m.lines.join(" | "));
  assert.equal(m.chip, "A suggestion"); assert.ok(!m.lines.includes("Nothing needed moving."));
  sql.prepare("UPDATE td_acts SET undo_until = ? WHERE id = ?").run(at(8), MOVE);
  m = (await day("morning", at(9))).tops.morning;
  assert.deepEqual(m.buttons, [], "the suggestion's time is past: its line, no button");
  sql.prepare("UPDATE td_acts SET state = 'ignored' WHERE id IN (?, ?)").run(MOVE, ADD);
  m = (await day("morning", at(9))).tops.morning;
  assert.ok(m.lines.includes("Nothing needed moving."), m.lines.join(" | ")); assert.equal(m.chip, "Your day");
  // (back as they were)
  sql.prepare("UPDATE td_acts SET state = 'done', level = 'do', said = 'Moved your ride to 16:45, clear of Mira’s call', undo_until = ? WHERE id = ?").run(at(15, 45), MOVE);
  sql.prepare("UPDATE td_acts SET state = 'done', level = 'do', said = 'Added: a ride on Thursday at 10:00' WHERE id = ?").run(ADD);
});

test("the walls: no quiet hours and no morning, 05:00; the morning's time; quiet from 18:00 brings the evening forward; a New York holding takes it past 19:00", async () => {
  const cards = cardsAt("midday");
  const inp = (prefs, c = cards) => dayInputs(env, { id: ME, notify_prefs: JSON.stringify(prefs) }, at(12), LON, c);
  assert.deepEqual([(await inp({})).dayStart, (await inp({})).eveningAt], [300, 1140]);
  put("td_prefs", { user_id: ME, m_on: 1, m_at: 405, updated: at(1) });
  assert.equal((await inp({})).dayStart, 405, "the morning notification's 06:45");
  assert.equal((await inp({ quiet: true, quietFrom: 22, quietTo: 7 })).dayStart, 420, "quiet hours win");
  assert.equal((await inp({ quiet: true, quietFrom: 18, quietTo: 7 })).eveningAt, 18 * 60, "no later than quiet hours");
  assert.equal((await inp({ quiet: true, quietFrom: 2, quietTo: 7 })).eveningAt, 1140, "quiet hours from 02:00 are tomorrow's");
  withForDay(cards.markets, { hours: [{ where: "London", open: at(8), close: at(16, 30) }, { where: "New York", open: at(14, 30), close: at(21) }], held: [], alerts: [] });
  assert.equal((await inp({})).eveningAt, 21 * 60 + 5, "5 minutes after New York's close");
  sql.prepare("DELETE FROM td_prefs WHERE user_id = ?").run(ME);
});

test("an account with nothing: no rides, no friends, no cards; a plain day", async () => {
  user(id(40), "Newcomer");
  const d = await dayFor(env, { id: id(40) }, at(12, 30), {}, { tz: LON });
  assert.equal(d.phase, "midday"); assert.equal(d.ride, null); assert.deepEqual(d.waiting, []); assert.deepEqual(d.upcoming, []); assert.deepEqual(d.acts, []);
  assert.deepEqual(d.apps, { weather: null, fitness: null, markets: null, mail: false });
  assert.equal(d.tops.midday.kind, "plan", "no weather: what's next");
  assert.deepEqual(d.quiet, { on: false, from: 22, to: 7 });
  assert.equal(d.planning, true, "its day not yet planned");
});
