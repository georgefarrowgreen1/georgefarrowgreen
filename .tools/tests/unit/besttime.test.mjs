// Fitness's best time to ride: the stretch of today it picks, from the hours' weather, clear of any times it's to avoid
import { test } from "node:test";
import assert from "node:assert/strict";
import { bestWindow, hourScore, windWords, LIMITS, isWet } from "../../../fitness/besttime.js";

const H = 3600e3, DAY0 = Date.UTC(2026, 9, 26);   // (midnight, UTC, on a place with no offset)
const fine = { temp: 15, feels: 15, pop: 5, rain: 0, code: 1, wind: 10, gust: 20, dir: 270, day: true };
const day = (f = () => ({})) => ({ offset: 0, hours: Array.from({ length: 48 }, (_, i) => ({ t: DAY0 + i * H, ...fine, day: i % 24 >= 7 && i % 24 < 19, ...f(i % 24, i) })) });

test("a fine day: the first stretch of the session's length, once it's light", () => {
  const b = bestWindow(day(), { secs: 2 * 3600, now: DAY0 });
  assert.equal(new Date(b.start).getUTCHours(), 7);
  assert.equal((b.end - b.start) / H, 2);
  assert.equal(b.rating, "Great");
  assert.equal(b.dry, true);
});
test("rain in the morning: the afternoon wins", () => {
  const b = bestWindow(day((h) => (h < 13 ? { rain: 1.5, code: 61, pop: 90 } : {})), { secs: 3600, now: DAY0 });
  assert.ok(new Date(b.start).getUTCHours() >= 13);
});
test("a cold morning and a mild afternoon: the warmth wins", () => {
  const b = bestWindow(day((h) => ({ temp: h < 12 ? 2 : 14, feels: h < 12 ? 0 : 14 })), { secs: 3600, now: DAY0 });
  assert.ok(new Date(b.start).getUTCHours() >= 12);
});
test("only what's left of today: none in the evening", () => {
  assert.equal(bestWindow(day(), { secs: 3600, now: DAY0 + 20 * H }), null);
  const b = bestWindow(day(), { secs: 3600, now: DAY0 + 10.5 * H });
  assert.ok(b.start >= DAY0 + 10 * H);
});
test("avoid: a stretch touching a time to keep clear is never picked; the next best is", () => {
  const free = bestWindow(day(), { secs: 2 * 3600, now: DAY0 });
  assert.equal(new Date(free.start).getUTCHours(), 7);
  const call = [DAY0 + 8 * H + 30 * 60e3, DAY0 + 9 * H];
  const b = bestWindow(day(), { secs: 2 * 3600, now: DAY0, avoid: [call] });
  assert.ok(b.start >= call[1], "after the call");
  assert.equal(new Date(b.start).getUTCHours(), 9, "the next best: straight after it");
  assert.equal(new Date(bestWindow(day(), { secs: 2 * 3600, now: DAY0, avoid: [[DAY0 + 9 * H, DAY0 + 10 * H]] }).start).getUTCHours(), 7, "ending as it starts isn't touching it");
  assert.equal(bestWindow(day(), { secs: 3600, now: DAY0, avoid: [[DAY0, DAY0 + 24 * H]] }), null, "none clear: none");
  assert.equal(new Date(bestWindow(day(), { secs: 3600, now: DAY0, avoid: [[DAY0 + 7 * H, DAY0 + 8 * H], "x", [5], null, [DAY0 + 9 * H, DAY0 + 8 * H]] }).start).getUTCHours(), 8,
    "what isn't a [start, end] is passed over");
  // (never crossed, whatever the weather and whatever's to keep clear)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 300; n++) {
    const wx = day(() => ({ rain: rnd() < 0.3 ? 1 : 0, code: rnd() < 0.3 ? 61 : 1, temp: 5 + rnd() * 15, wind: rnd() * 30 }));
    const avoid = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => { const s = DAY0 + Math.floor(rnd() * 48) * 15 * 60e3 + 6 * H; return [s, s + (15 + Math.floor(rnd() * 8) * 15) * 60e3]; });
    const secs = 1800 + Math.floor(rnd() * 4) * 3600, w = bestWindow(wx, { secs, now: DAY0 + Math.floor(rnd() * 12) * H, avoid });
    if (w) for (const [s, e] of avoid) assert.ok(!(Math.floor(w.start / H) * H < e && s < w.end), `case ${n}: ${new Date(w.start).toISOString()}–${new Date(w.end).toISOString()} crosses ${new Date(s).toISOString()}`);
  }
});
test("avoid: left out, empty, or nowhere near, the answer's the same", () => {
  for (const [wx, opts] of [[day(), { secs: 7200, now: DAY0 }], [day((h) => (h < 13 ? { rain: 1.5, code: 61, pop: 90 } : {})), { secs: 3600, now: DAY0 }],
    [day((h) => ({ temp: h < 12 ? 2 : 14, feels: h < 12 ? 0 : 14 })), { secs: 5400, now: DAY0 + 3 * H, sport: "run" }], [day(), { secs: 3600, now: DAY0 + 20 * H }]]) {
    const want = bestWindow(wx, opts);
    for (const avoid of [undefined, [], [[DAY0 + 30 * H, DAY0 + 31 * H]], [[DAY0 - 5 * H, DAY0 - 4 * H]]]) assert.deepEqual(bestWindow(wx, { ...opts, avoid }), want, JSON.stringify(avoid));
  }
});
test("an hour's score: wind, gusts and rain take it down", () => {
  const a = LIMITS.ride;
  assert.equal(hourScore(fine, null, a), 1);
  assert.ok(hourScore({ ...fine, wind: 32 }, null, a) < 0.3);
  assert.equal(hourScore({ ...fine, rain: 2, code: 63 }, null, a), 0);
  assert.ok(isWet({ code: 80 }) && !isWet({ code: 3, rain: 0 }));
});
test("the wind in words", () => {
  assert.equal(windWords(10, 270), "a light westerly");
  assert.equal(windWords(30, 225), "a strong south-westerly");
  assert.equal(windWords(3, 90), "little wind");
});

// ---------- the best times for two people at once (Chat's "Make it a plan") ----------
import { bestTogether } from "../../../fitness/besttime.js";
const D0 = Date.UTC(2026, 10, 2);                  // midnight UTC, a Monday
const place = (f = () => ({}), offset = 0, startAt = D0) => ({ offset, hours: Array.from({ length: 96 }, (_, i) => {
  const t = startAt + i * H, local = new Date(t + offset * 1000).getUTCHours();
  return { t, ...fine, day: local >= 7 && local < 17, ...f(local, t) };
}) });

test("together: a window dry at only one place isn't dry, and a wet hour at either counts", () => {
  const a = place(), b = place((h) => (h >= 7 && h < 12 ? { rain: 1, code: 61, pop: 90 } : {}));
  const r = bestTogether(a, b, { len: 2, now: D0 + 6 * H, days: 1 });
  assert.ok(r.windows.length >= 1);
  for (const w of r.windows) assert.ok(new Date(w.start).getUTCHours() >= 12, "not while it's wet for them");
  assert.ok(r.windows.every((w) => w.dry));
  // wet all day for one: anything picked isn't dry
  const all = bestTogether(a, place(() => ({ rain: 0.5, code: 61, pop: 80 })), { len: 1, now: D0, days: 1 });
  assert.ok(all.windows.every((w) => !w.dry));
});
test("together: each place's own hours on its own clock", () => {
  // them 5 hours behind: their 06:00 is our 11:00; their daylight 07–17 is our 12–22, ours 7–17: both light 12–17
  const a = place(), b = place(() => ({}), -5 * 3600);
  const r = bestTogether(a, b, { len: 1, now: D0, days: 1, top: 10 });
  assert.ok(r.windows.length > 0);
  for (const w of r.windows) { const h = new Date(w.start).getUTCHours(); assert.ok(h >= 12 && h < 17, `hour ${h}`); }
  // their riding hours end at 20:00 their time: never a window past it
  const late = bestTogether(place((h) => ({ day: true })), place((h) => ({ day: true }), -5 * 3600), { len: 1, now: D0, days: 1, top: 20 });
  for (const w of late.windows) { const theirs = new Date(w.start - 5 * H).getUTCHours(), ours = new Date(w.start).getUTCHours(); assert.ok(theirs >= 6 && theirs + 1 <= 20 && ours >= 6 && ours + 1 <= 20); }
});
test("together: a place on a half-hour clock (its hours at :30) still lines up with one on the hour", () => {
  // London and Mumbai (+5:30): Mumbai's hours fall at hh:30 UTC; both light and riding 07:00–11:30 UTC
  const a = place(), b = place(() => ({}), 5.5 * 3600, D0 + 30 * 60e3);
  const r = bestTogether(a, b, { len: 1, now: D0, days: 2 });
  assert.ok(r.windows.length > 0, "dry and mild at both: there's a time");
  for (const w of r.windows) { assert.equal(w.start % H, 0, "on the asker's hour"); assert.ok(w.dry); }
  // (wet for them all day: still lined up, so not dry)
  const wet = bestTogether(a, place(() => ({ rain: 0.5, code: 61, pop: 80 }), 5.5 * 3600, D0 + 30 * 60e3), { len: 1, now: D0, days: 1 });
  assert.ok(wet.windows.every((w) => !w.dry));
});
test("together: none before `after`, whole hours of the asked length, not overlapping, three at most", () => {
  const a = place(), b = place();
  const after = D0 + 10 * H + 15 * 60e3;
  const r = bestTogether(a, b, { len: 2, now: D0 + 6 * H, after, days: 3 });
  assert.ok(r.windows.length > 0 && r.windows.length <= 3);
  for (const w of r.windows) {
    assert.ok(w.start >= after);
    assert.equal(w.end - w.start, 2 * H);
    assert.equal(w.start % H, 0);
    assert.ok(["Great", "Good", "Fair"].includes(w.rating));
    assert.deepEqual(Object.keys(w).sort(), ["dry", "end", "me", "rating", "start", "them"]);
    assert.deepEqual(Object.keys(w.me).sort(), ["pop", "temp"]);
  }
  for (const x of r.windows) for (const y of r.windows) if (x !== y) assert.ok(x.end <= y.start || y.end <= x.start, "overlap");
  assert.equal(bestTogether(a, b, { len: 9, now: D0, days: 1, top: 1 }).windows[0].end - bestTogether(a, b, { len: 9, now: D0, days: 1, top: 1 }).windows[0].start, 6 * H, "six hours at most");
  assert.equal(bestTogether(a, b, { len: 1, now: D0, days: 3, top: 5 }).windows.length, 5);
});
test("together: sooner is better, a little, and a poor stretch never makes it", () => {
  const r = bestTogether(place(), place(), { len: 1, now: D0, days: 3 });
  assert.equal(new Date(r.windows[0].start).getUTCDate(), 2, "today first, the weather being the same");
  const cold = (h) => ({ temp: -8, feels: -14, wind: 40, gust: 70 });
  assert.deepEqual(bestTogether(place(cold), place(), { len: 1, now: D0, days: 3 }).windows, []);
});
test("together: the strip is the best window's day, 14 hours at most, dry / wet / off for each", () => {
  const b = place((h) => (h === 15 ? { rain: 1, code: 61 } : {}));
  const r = bestTogether(place(), b, { len: 2, now: D0, days: 1 });
  assert.ok(r.hours.length > 0 && r.hours.length <= 14);
  const w = r.windows[0];
  assert.ok(r.hours.some((h) => h.t === w.start), "the window's in view");
  for (const h of r.hours) { assert.ok(["dry", "wet", "off"].includes(h.me)); assert.ok(["dry", "wet", "off"].includes(h.them)); assert.deepEqual(Object.keys(h).sort(), ["me", "t", "them"]); }
  assert.equal(r.hours.find((h) => new Date(h.t).getUTCHours() === 15).them, "wet");
  assert.equal(r.hours.find((h) => new Date(h.t).getUTCHours() === 6).me, "off", "before it's light");
  // a run's hours (6 to 21) are 15: still 14 at most
  const run = bestTogether(place((h) => ({ day: true, temp: 10, feels: 10 })), place((h) => ({ day: true, temp: 10, feels: 10 })), { len: 1, sport: "run", now: D0, days: 1 });
  assert.equal(run.hours.length, 14);
  assert.deepEqual(bestTogether(null, undefined), { windows: [], hours: [] });
});
