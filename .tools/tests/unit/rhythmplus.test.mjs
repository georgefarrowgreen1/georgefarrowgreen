// Rhythm, sharpened: training stress for every activity, FTP offered as it moves, the power curve by how recent, the
// week planned as a whole, sessions that grow through a block, the weather and your nights
import { test } from "node:test";
import assert from "node:assert/strict";
import * as RH from "../../../fitness/rhythm.js";
import { tssOf } from "../../../fitness/load.js";
import { wetDays } from "../../../fitness/besttime.js";
import { readinessOf } from "../../../fitness/todaycalc.js";
import { wellFrom } from "../../../functions/_garmin.js";
import { startOfDay as sod, addDays as add, mondayOf as monOf, measure } from "../../../fitness/workouts.js";

const today = sod(new Date(2026, 9, 21, 12).getTime());   // a Wednesday
const steady = (weeks, { tss = 55, long = 110 } = {}) => {
  const acts = [];
  for (let i = weeks * 7; i > 0; i--) { const d = add(today, -i), dow = (new Date(d).getDay() + 6) % 7; if (dow === 0 || dow === 4) continue;
    acts.push({ start: d + 9 * 3600e3, sport: "ride", sum: { tss: dow === 5 ? long : tss, moving: dow === 5 ? 9000 : 3600, iF: 0.7, curve: { 120: 380, 300: 320, 600: 290, 1200: 270, 3600: 240 } } }); }
  return acts;
};
const mins = (w) => Math.round(measure(w, 4).secs / 60);

test("an activity with nothing to go by still counts: from its time, as an easy one", () => {
  assert.equal(tssOf({ tss: 80 }, "ride"), 80);
  assert.equal(tssOf({ moving: 3600 }, "ride"), 42);
  assert.equal(tssOf({ moving: 3600 }, "run"), 56);
  assert.equal(tssOf(null, "ride"), 0);
  // (and the plan sees it: a week of rides with no sensors isn't a week off)
  const none = steady(6).map((a) => ({ ...a, sum: { moving: a.sum.moving } }));
  assert.ok(RH.plan({ prefs: { start: monOf(today) }, acts: none, today, ftp: 260 }).ctl > 20);
});

test("critical power: sure with all four efforts, most of them recent; else the targets go halfway to FTP's", () => {
  const fresh = RH.criticalPower({ 120: { w: 380, age: 5 }, 300: { w: 320, age: 10 }, 600: { w: 290, age: 20 }, 1200: { w: 270, age: 30 } }, 260);
  const stale = RH.criticalPower({ 120: { w: 380, age: 70 }, 300: { w: 320, age: 60 }, 600: { w: 290, age: 20 }, 1200: { w: 270, age: 30 } }, 260);
  assert.equal(fresh.sure, true); assert.equal(stale.sure, false);
  const a = RH.targets(fresh, 260), b = RH.targets(stale, 260), f = RH.targets(null, 260);
  assert.ok(Math.abs(b.vo2 - (a.vo2 + f.vo2) / 2) < 1e-9);
  // (an older best counts for less: 92% at twelve weeks)
  const bs = RH.bestsOf([{ start: add(today, -84), sport: "ride", sum: { curve: { 300: 400 } } }, { start: add(today, -3), sport: "ride", sum: { curve: { 300: 380 } } }], add(today, -90), add(today, 1));
  assert.equal(bs[300].raw, 380);
});

test("FTP offered as it moves: up from a hard 20 minutes; down only where critical power is sure of it", () => {
  const hard = [{ start: add(today, -5), sport: "ride", sum: { curve: { 1200: 300 } } }];
  assert.deepEqual(RH.ftpSeen(hard, today, 260, null), { ftp: 285, from: "20" });
  assert.equal(RH.ftpSeen([{ start: add(today, -5), sport: "ride", sum: { curve: { 1200: 240 } } }], today, 260, null), null);
  assert.equal(RH.ftpSeen(hard, today, 283, null), null);
});

test("sessions grow through a block: longer efforts, then more, then harder; as far as the time goes", () => {
  const names = (k, m) => [0, 1, 2, 3].map((l) => RH.session(`rh:${k}:${m}:${l}`).name);
  assert.deepEqual(names("threshold", 95), ["Threshold 3 × 10", "Threshold 4 × 10", "Threshold 3 × 15", "Threshold 2 × 20"]);
  assert.deepEqual(names("vo2", 75), ["VO₂ max 5 × 4", "VO₂ max 6 × 4", "VO₂ max 6 × 4", "VO₂ max 5 × 5"]);
  // (short of time, a lower rung, never longer than the day by more than five minutes)
  for (const k of ["tempo", "sweet", "threshold", "vo2", "thirty"]) for (const m of [45, 55, 65]) assert.ok(mins(RH.session(`rh:${k}:${m}:3`)) <= m + 5 || /2 × 10|1 × 15|3 × 4|1 × 13/.test(RH.session(`rh:${k}:${m}:3`).name), `${k} ${m}`);
  assert.equal(RH.withMins("rh:sweet:70:2", 50), "rh:sweet:50:2");
  // (the plan climbs them: the second week of a block a level up on the first)
  const lv = (wk) => RH.plan({ prefs: { start: add(monOf(today), -7 * wk), days: [0, 75, 60, 75, 0, 150, 90] }, acts: steady(8), today, ftp: 260 }).days.filter((d) => d.hard && /^rh:[a-z0-9]+:\d+:\d$/.test(d.id)).map((d) => +d.id.split(":")[3]);
  assert.ok(Math.max(...lv(0)) <= Math.min(...lv(2)), `${lv(0)} then ${lv(2)}`);
});

test("the week as a whole: the hard session goes to the wet day, the rules still kept", () => {
  const base = { prefs: { start: add(monOf(today), -7), days: [0, 60, 60, 60, 60, 150, 90] }, acts: steady(8), today, ftp: 260 };
  const dry = RH.plan(base), hardDays = (r) => r.days.filter((d) => d.date >= today && d.hard).map((d) => d.date);
  const wetDay = add(today, 2);
  assert.ok(!hardDays(dry).includes(wetDay), "dry, Friday's easy");
  const wet = RH.plan({ ...base, wet: { [wetDay]: true } });
  assert.ok(hardDays(wet).includes(wetDay), "hard on the wet day");
  assert.match(wet.days.find((d) => d.date === wetDay).why, /trainer/);
  const ds = wet.days.filter((d) => d.date >= today);
  for (let i = 1; i < ds.length; i++) assert.ok(!(ds[i].hard && ds[i - 1].hard), "never two hard days running");
});

test("a missed ride's training made up on the easy days, and said", () => {
  const acts = steady(6).filter((a) => sod(a.start) < monOf(today));
  const r = RH.plan({ prefs: { start: add(monOf(today), -7), days: [90, 90, 0, 90, 0, 150, 120] }, acts, today, ftp: 260 });
  assert.ok(r.days.some((d) => /to make up for (Monday|Tuesday)'s missed ride/.test(d.why)), r.days.map((d) => d.why).join(" | "));
});

test("your night: a low HRV or a raised resting heart rate eases the day, and readiness", () => {
  const well = {};
  for (let i = 30; i > 0; i--) well[add(today, -i)] = { hrv: 60 + (i % 3), rhr: 48 };
  const n = RH.nightOf({ ...well, [today]: { hrv: 44, rhr: 55, sleep: 7 * 3600 } }, today);
  assert.ok(n.hrvLow && n.rhrUp && !n.short && /HRV is 44/.test(n.said));
  assert.equal(RH.nightOf(well, today), null);
  const base = { prefs: { start: add(monOf(today), -7), days: [60, 60, 60, 60, 60, 120, 90] }, acts: steady(6), today, ftp: 260 };
  const low = RH.plan({ ...base, well: { ...well, [today]: { hrv: 40 } } }).today;
  assert.ok(!low.hard && low.kind !== "rest" && /HRV is 40/.test(low.night), JSON.stringify(low));
  assert.ok(readinessOf(0, null, n).v < readinessOf(0, null, null).v);
});

test("tired sessions don't lower the targets", () => {
  const s = (d) => ({ start: add(today, -d) + 9 * 3600e3, sport: "ride", sum: { effFam: 2, effFtp: 970, effortPct: 90, held: 1, efforts: 3 } });
  assert.ok(RH.adjustments([s(3), s(8)], today, { vo2: 1.18, on30: 1.25, thr: 0.97 }).thr < 0);
  assert.equal(RH.adjustments([s(3), s(8)], today, { vo2: 1.18, on30: 1.25, thr: 0.97 }, () => true).thr, 0);
});

test("the wet days ahead, from the hours: half or more of the riding hours wet", () => {
  const t0 = Date.UTC(2026, 9, 22, 0), hours = [];
  for (let i = 0; i < 48; i++) hours.push({ t: t0 + i * 3600e3, pop: i < 24 ? 80 : 10, rain: 0 });
  assert.deepEqual(wetDays({ offset: 0, hours }), { "2026-10-22": true });
});

test("Garmin's nights read for their fields wherever they sit", () => {
  const rows = wellFrom({
    hrv: [{ hrvSummaries: [{ calendarDate: "2026-10-20", lastNightAvg: 58, baseline: { balancedLow: 52, balancedUpper: 70 } }] }],
    sleep: [[{ calendarDate: "2026-10-20", sleepTimeSeconds: 25200, sleepScores: { overall: { value: 81 } } }]],
    daily: [{ list: [{ calendarDate: "2026-10-20", restingHeartRate: 47 }, { calendarDate: "2026-10-19", restingHeartRate: 999 }] }],
  });
  assert.deepEqual(rows, [{ day: "2026-10-20", hrv: 58, hrv_lo: 52, hrv_hi: 70, sleep: 25200, score: 81, rhr: 47 }]);
});

test("nights: a falling week, three short nights, and a good night", () => {
  const well = (f) => { const w = {}; for (let i = 40; i >= 0; i--) w[add(today, -i)] = f(i); return w; };
  // (a month at 60, then a week mostly at 50: falling; one low night alone isn't)
  const falling = RH.nightOf(well((i) => ({ hrv: i === 0 ? 56 : i < 7 ? 50 + (i % 2) : 60 + (i % 3), rhr: 48, sleep: 7.5 * 3600 })), today);
  assert.ok(falling.trendLow && /all week/.test(falling.said), JSON.stringify(falling));
  const once = RH.nightOf(well((i) => ({ hrv: i === 0 ? 50 : 60 + (i % 3), rhr: 48, sleep: 7.5 * 3600 })), today);
  assert.ok(!once.trendLow && once.hrvLow);
  const debt = RH.nightOf(well((i) => ({ hrv: 60 + ((i + 1) % 3), rhr: 48, sleep: i < 3 ? 6.3 * 3600 : 7.5 * 3600 })), today);
  assert.ok(debt.debt && !debt.short && /three short nights/.test(debt.said));
  const good = RH.nightOf(well((i) => ({ hrv: 60 + ((i + 1) % 3), rhr: 48, sleep: 7.6 * 3600 })), today);
  assert.ok(good.green && !good.hrvLow && !good.trendLow && !good.debt);
  // (in the plan: a falling week and a low night, rest; a falling week, no hard days for the two after)
  const base = { prefs: { start: add(monOf(today), -7), days: [60, 60, 60, 60, 60, 120, 90] }, acts: steady(6), today, ftp: 260 };
  const low = { ...well((i) => ({ hrv: i < 7 ? 50 + (i % 2) : 60 + (i % 3), rhr: 48, sleep: 7.5 * 3600 })), [today]: { hrv: 40, rhr: 48, sleep: 7.5 * 3600 } };
  const r = RH.plan({ ...base, well: low });
  assert.equal(r.today.kind, "rest");
  assert.ok(r.days.filter((d) => d.date > today && d.date <= add(today, 2)).every((d) => !d.hard));
  assert.ok(readinessOf(-10, null, good).v > readinessOf(-10, null, null).v && readinessOf(-10, null, falling).v < readinessOf(-10, null, null).v);
});
