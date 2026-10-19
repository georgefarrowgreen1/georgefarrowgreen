// Weather's second round (weather/): how good each model has been here and the forecast tuned by it
// (skill.js), your own activities and their limits (insights.js), and what a notification says and
// when it's due (alerts.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFormat, keyOf } from "../../../weather/format.js";
import { shapePrevious, skillFrom, tuneDay, applyTuning, obsDays, TUNE_DAYS } from "../../../weather/skill.js";
import { activityScore, ACTIVITIES, windows, limitsText, likely, dryChance, insights } from "../../../weather/insights.js";
import { shapeEnsemble } from "../../../weather/data.js";
import { rainAlert, briefDue, briefing, isQuiet } from "../../../weather/alerts.js";

const H = 3600e3, D = 864e5, M = 60e3;
const f = makeFormat({ temp: "c", wind: "mph", precip: "mm", clock: "24" });
const DAY0 = Date.UTC(2026, 9, 19);          // a Monday

function makeWx(hour = () => ({}), { minutely = [], name = "Testville" } = {}) {
  const hourly = [];
  for (let i = -24; i < 72; i++) {
    const t = DAY0 + i * H, hh = ((i % 24) + 24) % 24, isDay = hh >= 7 && hh < 18;
    hourly.push({ t, temp: 12, feels: 12, pop: 5, precip: 0, snow: 0, code: 2, cloud: 40, wind: 10, gust: 20, dir: 225, uv: 1, isDay, vis: 20000, pressure: 1015, ...hour(i, t, hh) });
  }
  const daily = [-1, 0, 1, 2].map((k) => { const date = DAY0 + k * D, hs = hourly.filter((h) => h.t >= date && h.t < date + D);
    return { date, key: keyOf(date), code: 2, tmax: Math.max(...hs.map((h) => h.temp)), tmin: Math.min(...hs.map((h) => h.temp)), sunrise: date + 7 * H, sunset: date + 18 * H, precip: hs.reduce((a, h) => a + h.precip, 0), popMax: 10, gustMax: 20 }; });
  return { place: { name, lat: 51.5, lon: -0.12, offset: 0 }, current: { ...hourly[34], precip: 0 }, minutely, hourly, daily, models: null };
}
const quarters = (from, fn) => Array.from({ length: 16 }, (_, k) => ({ t: from + k * 15 * M, precip: fn(k), code: fn(k) ? 63 : 2 }));

/* ---------- how good each model has been ---------- */
// hourly past forecasts for two models over 10 days: ECMWF 1° too warm, GFS 3° too cold
function previous(names = ["ecmwf_ifs", "gfs_seamless"]) {
  const time = [], h = { time };
  for (let d = 0; d < 10; d++) for (let k = 0; k < 24; k++) time.push(`2026-10-${String(5 + d).padStart(2, "0")}T${String(k).padStart(2, "0")}:00`);
  const curve = (k) => 10 + 5 * Math.sin(((k - 9) / 24) * 2 * Math.PI);     // 5 to 15 each day
  names.forEach((id, j) => {
    const off = j === 0 ? 1 : -3, sfx = names.length === 1 ? "" : `_${id}`;
    h[`temperature_2m_previous_day1${sfx}`] = time.map((t) => curve(+t.slice(11, 13)) + off);
    h[`temperature_2m_previous_day3${sfx}`] = time.map((t) => curve(+t.slice(11, 13)) + off * 1.5);
  });
  return { hourly: h };
}
const obs = Object.fromEntries(Array.from({ length: 10 }, (_, d) => [`2026-10-${String(5 + d).padStart(2, "0")}`, { tmax: 15, tmin: 5 }]));
test("past forecasts → daily highs and lows, each model's own columns", () => {
  const p = shapePrevious(previous());
  assert.deepEqual(Object.keys(p).sort(), ["ecmwf_ifs", "gfs_seamless"]);
  assert.ok(Math.abs(p.ecmwf_ifs["2026-10-05"].hi1 - 16) < 0.01 && Math.abs(p.gfs_seamless["2026-10-05"].lo1 - 2) < 0.01);
  // one model asked for: its columns carry no suffix
  const one = shapePrevious(previous(["ecmwf_ifs"]), [["ecmwf_ifs", "ECMWF"]]);
  assert.ok(one.ecmwf_ifs["2026-10-06"].hi3 > one.ecmwf_ifs["2026-10-06"].hi1);
  assert.equal(shapePrevious({}), null);
});
test("skill: the closer model wins, and each one's lean is known", () => {
  const k = skillFrom(shapePrevious(previous()), obs);
  assert.equal(k.best, "ecmwf_ifs"); assert.equal(k.days, 10);
  const e = k.byId.ecmwf_ifs, g = k.byId.gfs_seamless;
  assert.ok(Math.abs(e.hiMae - 1) < 0.01 && Math.abs(e.hiBias - 1) < 0.01 && Math.abs(g.hiBias + 3) < 0.01);
  assert.ok(Math.abs(e.hiMae3 - 1.5) < 0.01);
  // too few days: nothing to say yet
  assert.equal(skillFrom(shapePrevious(previous()), { "2026-10-05": { tmax: 15, tmin: 5 } }), null);
});
test("tuning: each model's lean taken off, the closest counting most", () => {
  const prev = shapePrevious(previous(["ecmwf_ifs", "gfs_seamless", "icon_seamless"]));
  const k = skillFrom(prev, obs);      // icon is like gfs here (3° cold)
  const t = tuneDay(k, [{ id: "ecmwf_ifs", tmax: 18, tmin: 8 }, { id: "gfs_seamless", tmax: 14, tmin: 4 }, { id: "icon_seamless", tmax: 14, tmin: 4 }]);
  // with their leans taken off, all three say 17° / 7°
  assert.ok(Math.abs(t.tmax - 17) < 0.01 && Math.abs(t.tmin - 7) < 0.01, JSON.stringify(t));
  assert.equal(tuneDay(k, [{ id: "ecmwf_ifs", tmax: 18, tmin: 8 }]), null, "one model isn't enough");
  assert.equal(tuneDay({ ...k, days: TUNE_DAYS - 1 }, [{ id: "ecmwf_ifs", tmax: 18, tmin: 8 }, { id: "gfs_seamless", tmax: 14, tmin: 4 }, { id: "icon_seamless", tmax: 14, tmin: 4 }]), null, "not enough days yet");
  const wx = makeWx();
  wx.models = { days: { [keyOf(DAY0 + D)]: [{ id: "ecmwf_ifs", tmax: 18, tmin: 8 }, { id: "gfs_seamless", tmax: 14, tmin: 4 }, { id: "icon_seamless", tmax: 14, tmin: 4 }] } };
  const out = applyTuning(wx, k, keyOf(DAY0));
  const tomorrow = out.daily.find((d) => d.key === keyOf(DAY0 + D)), today = out.daily.find((d) => d.key === keyOf(DAY0));
  assert.ok(tomorrow.tuned && Math.abs(tomorrow.tmax - 17) < 0.01 && tomorrow.raw.tmax === 12);
  assert.ok(!today.tuned, "today is left to its own hours");
  assert.equal(wx.daily[2].tuned, undefined, "the original isn't changed");
});
test("tuning: the hours follow the tuned high and low, easing between, today's own left alone", () => {
  const k = skillFrom(shapePrevious(previous(["ecmwf_ifs", "gfs_seamless", "icon_seamless"])), obs);
  // a day that warms to 14° at 15:00 and cools to 6° at 03:00, every day; tomorrow tuned to 17° and 7° (up 3, up 1)
  const wx = makeWx((i, t, hh) => { const v = 10 + 4 * Math.sin(((hh - 9) / 24) * 2 * Math.PI); return { temp: v, feels: v - 1 }; });
  const tk = keyOf(DAY0 + D), at = (w, d = wx) => d.hourly.find((h) => h.t === w);
  wx.daily.find((d) => d.key === tk).fmax = 13;
  wx.models = { days: { [tk]: [{ id: "ecmwf_ifs", tmax: 18, tmin: 8 }, { id: "gfs_seamless", tmax: 14, tmin: 4 }, { id: "icon_seamless", tmax: 14, tmin: 4 }] } };
  const out = applyTuning(wx, k, keyOf(DAY0)), tom = out.hourly.filter((h) => keyOf(h.t) === tk);
  const close = (a, b) => Math.abs(a - b) < 0.01;
  assert.ok(close(Math.max(...tom.map((h) => h.temp)), 17) && close(Math.min(...tom.map((h) => h.temp)), 7), "the day's chart peaks at its tuned high and bottoms at its tuned low");
  assert.ok(close(at(DAY0 + D + 15 * H, out).temp, 17) && close(at(DAY0 + D + 3 * H, out).temp, 7));
  assert.ok(close(at(DAY0 + D + 9 * H, out).temp, at(DAY0 + D + 9 * H).temp + 2), "the morning between: half of each");
  assert.ok(close(at(DAY0 + 12 * H, out).temp, at(DAY0 + 12 * H).temp), "today's own hours as they were");
  assert.ok(close(at(DAY0 + 21 * H, out).temp, at(DAY0 + 21 * H).temp + 0.5), "tonight easing from today's to tomorrow's");
  assert.ok(close(at(DAY0 + D + 15 * H, out).feels, at(DAY0 + D + 15 * H).feels + 3), "feeling like moves with it");
  const day = out.daily.find((d) => d.key === tk);
  assert.ok(close(day.fmax, 16) && day.raw.fmax === 13, "and the day's own feels-like high");
  // the ensemble's likely high and low, moved as far as the day was (so the tuned high isn't outside its own range)
  const ens = { tmaxP10: 12, tmaxP90: 15, tminP10: 5, tminP90: 7 }, r = likely(day, ens);
  assert.ok(close(r.hi[0], 15) && close(r.hi[1], 18) && close(r.lo[0], 6) && close(r.lo[1], 8), JSON.stringify(r));
  assert.deepEqual(likely(out.daily.find((d) => d.key === keyOf(DAY0)), ens), { hi: [12, 15], lo: [5, 7] }, "an untuned day's as the ensemble has it");
  assert.equal(at(DAY0 + D + 15 * H).temp < 14.01, true, "the original hours aren't changed");
  // nothing tuned: the very same hours
  assert.equal(applyTuning({ ...wx, models: { days: {} } }, k, keyOf(DAY0)).hourly, wx.hourly);
});
test("airport reports → whole days only, in local time", () => {
  const reports = [];
  for (let k = 0; k < 48; k++) reports.push({ obsTime: (Date.UTC(2026, 9, 16, 23) + k * H) / 1000, temp: k % 24 === 14 ? 17 : k % 24 === 4 ? 3 : 10 });
  reports.push({ obsTime: Date.UTC(2026, 9, 17, 12, 30) / 1000, temp: null });
  const days = obsDays(reports, 3600, Date.UTC(2026, 9, 19, 12));
  // UTC+1: 23:00 UTC on the 16th is midnight on the 17th; the 17th and 18th are whole days
  assert.deepEqual(Object.keys(days), ["2026-10-17", "2026-10-18"]);
  assert.equal(days["2026-10-17"].tmax, 17); assert.equal(days["2026-10-17"].tmin, 3);
  // today isn't over: left out
  assert.deepEqual(Object.keys(obsDays(reports, 3600, Date.UTC(2026, 9, 18, 12))), ["2026-10-17"]);
});

/* ---------- the chance a stretch stays dry ---------- */
// ECMWF's 51 runs as Open-Meteo gives them, through data.js: wet(i, k) says whether run k is wet in hour i (from DAY0)
function ensembleOf(wet) {
  const time = [], h = { time };
  for (let i = -24; i < 72; i++) time.push(new Date(DAY0 + i * H).toISOString().slice(0, 16));
  for (let k = 0; k <= 50; k++) {
    const sfx = k ? `_member${String(k).padStart(2, "0")}` : "";
    h[`temperature_2m${sfx}`] = time.map(() => 12);
    h[`precipitation${sfx}`] = time.map((_, j) => (wet(j - 24, k) ? 0.6 : 0.05));
  }
  return shapeEnsemble({ hourly: h });
}
test("the chance a stretch stays dry, counted run by run", () => {
  const wx = makeWx(), at = (h) => DAY0 + h * H;
  // ten runs wet from 13:00 to 15:00 tomorrow, five more at 14:00 only (a trace in the rest)
  wx.ensemble = ensembleOf((i, k) => (i >= 37 && i < 39 && k < 10) || (i === 38 && k >= 40 && k < 45));
  assert.ok(Math.abs(dryChance(wx, at(37), at(39)) - 36 / 51) < 1e-9, "15 of the 51 runs wet at some time in it");
  assert.ok(Math.abs(dryChance(wx, at(37), at(38)) - 41 / 51) < 1e-9, "its first hour alone: 10");
  assert.equal(dryChance(wx, at(30), at(36)), 1);
  assert.equal(dryChance(makeWx(), at(37), at(39)), null, "no ensemble yet");
  assert.equal(dryChance({ ensemble: { hourly: wx.ensemble.hourly.map(({ m, ...e }) => e) } }, at(37), at(39)), null, "nor one kept from before");
  assert.equal(dryChance(wx, at(80), at(82)), null, "nor past its end");
});
test("best times and the umbrella go by the whole stretch's chance of staying dry", () => {
  const now = DAY0 + 9 * H, only = { laundry: false, stars: false, sunset: false };
  // a different fifth of the runs wet each hour: an hour on its own about 80% dry, two hours together about 60%
  const wx = makeWx();
  wx.ensemble = ensembleOf((i, k) => (k + i) % 5 === 0);
  const [run, walk] = windows(wx, now, f, { activities: [{ id: "run", on: true, ...ACTIVITIES.run }, { id: "walk", on: true, ...ACTIVITIES.walk }], extras: only });
  const chance = (w) => +/^(\d+)% chance it stays dry, 12°, light winds$/.exec(w.text)?.[1];
  assert.ok(chance(run) >= 78 && chance(run) <= 80 && chance(walk) >= 58 && chance(walk) <= 61, `${run.text} | ${walk.text}`);
  assert.ok(run.rating === "Great" && walk.rating === "Good" && walk.score < run.score, `${run.rating} ${walk.rating}`);
  // the umbrella: today's waking hours, 09:00 to 22:00
  const umbrella = (wet) => { const w = makeWx(); w.ensemble = ensembleOf(wet); return insights(w, now, f).find((c) => c.id === "umbrella"); };
  assert.deepEqual([umbrella(() => false).title, umbrella(() => false).text], ["No umbrella needed", "Dry today: no rain in sight."]);
  const maybe = umbrella((i, k) => i >= 14 && i < 16 && k < 20);
  assert.deepEqual([maybe.title, maybe.text], ["Maybe an umbrella", "A 39% chance of a shower at some point; most of today stays dry."]);
  const likely = umbrella((i, k) => i >= 10 && i < 20 && k % 10 === i % 10 && k < 40);
  assert.deepEqual([likely.title, likely.text], ["Take an umbrella", "Showers likely at some point today (a 78% chance), though most of it stays dry."]);
  // rain in the forecast itself: as before
  const wet = makeWx((i) => (i === 17 ? { precip: 2, code: 63, pop: 80 } : {}));
  wet.ensemble = ensembleOf(() => false);
  assert.match(insights(wet, now, f).find((c) => c.id === "umbrella").text, /^Rain likely this afternoon \(80% chance\)/);
});

/* ---------- your activities ---------- */
test("sailing needs wind; a run doesn't want it", () => {
  const calm = { feels: 18, wind: 3, gust: 6, precip: 0, pop: 0, code: 1 }, breezy = { ...calm, wind: 22, gust: 30 }, gale = { ...calm, wind: 55, gust: 80 };
  const sail = { id: "sail", ...ACTIVITIES.sail }, run = { id: "run", ...ACTIVITIES.run };
  assert.ok(activityScore(breezy, null, sail) > 0.9 && activityScore(calm, null, sail) < 0.3 && activityScore(gale, null, sail) < 0.2);
  assert.ok(activityScore(calm, null, run) > activityScore({ ...calm, wind: 35, gust: 50 }, null, run), "over a run's wind limit");
  assert.equal(activityScore(calm, null, run), activityScore(breezy, null, run), "within it, the wind doesn't count against it");
  // light rain: fine for a hike, not for golf
  const drizzle = { feels: 12, wind: 8, gust: 15, precip: 0.3, pop: 80, code: 51 };
  assert.ok(activityScore(drizzle, null, { id: "hike", ...ACTIVITIES.hike }) >= 0.7 && activityScore(drizzle, null, { id: "golf", ...ACTIVITIES.golf }) === 0);
  assert.equal(limitsText(sail, f), "12°–26°, wind 7–22 mph, light rain is fine, 3 h");
});
test("windows: your list, each with its own hours and length", () => {
  const wx = makeWx((i, t, hh) => (i >= 9 && i < 12 ? { precip: 2, code: 63, pop: 90 } : i >= 24 && i < 48 && hh >= 10 && hh < 16 ? { wind: 22, gust: 30 } : {}));
  const acts = [{ id: "golf", on: true, ...ACTIVITIES.golf }, { id: "sail", on: true, ...ACTIVITIES.sail, tmin: 10 }, { id: "walk", on: false, ...ACTIVITIES.walk }];
  const w = Object.fromEntries(windows(wx, DAY0 + 8 * H, f, { activities: acts, extras: { laundry: false, stars: false, sunset: false } }).map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(w).sort(), ["golf", "sail"], "turned-off ones and extras left out");
  assert.equal((w.golf.end - w.golf.start) / H, 4); assert.ok(w.golf.start >= DAY0 + 12 * H, "golf waits for the rain to pass");
  assert.ok(w.sail.start >= DAY0 + D + 10 * H && w.sail.end <= DAY0 + D + 16 * H, "sailing goes when the wind comes");
});

/* ---------- notifications ---------- */
test("rain alert: within the hour, not overnight, not twice in three hours", () => {
  const now = DAY0 + 10 * H, wx = makeWx(() => ({}), { minutely: quarters(now, (k) => (k >= 2 && k < 5 ? 0.5 : 0)) });
  const a = rainAlert(wx, now, f, null);
  assert.equal(a.title, "Rain in about 30 min"); assert.match(a.body, /^Testville: Rain starting in about 30 min/); assert.equal(a.tag, "rain");
  assert.equal(rainAlert(wx, now, f, 2 * H), null, "two hours after the last one: no");
  assert.ok(rainAlert(wx, now, f, 4 * H), "four hours after: yes");
  const far = makeWx(() => ({}), { minutely: quarters(now, (k) => (k >= 6 ? 0.5 : 0)) });
  assert.equal(rainAlert(far, now, f, null), null, "starting in 90 minutes: not yet");
  const trace = makeWx(() => ({}), { minutely: quarters(now, (k) => (k === 2 ? 0.06 : 0)) });
  assert.equal(rainAlert(trace, now, f, null), null, "a trace isn't worth a buzz");
  const night = makeWx(() => ({}), { minutely: quarters(DAY0 + 23 * H, (k) => (k >= 1 ? 0.5 : 0)) });
  assert.equal(rainAlert(night, DAY0 + 23 * H, f, null), null);
  assert.ok(isQuiet(DAY0 + 6 * H) && !isQuiet(DAY0 + 7 * H));
});
test("briefing: due once a day, from its time, and says the day", () => {
  assert.equal(briefDue(DAY0 + 6.9 * H, "07:00", null), false);
  assert.equal(briefDue(DAY0 + 7.1 * H, "07:00", null), true);
  assert.equal(briefDue(DAY0 + 7.1 * H, "07:00", keyOf(DAY0)), false, "already sent today");
  assert.equal(briefDue(DAY0 + 11 * H, "07:00", null), false, "too late to be a morning briefing");
  const wx = makeWx((i) => (i >= 15 && i < 18 ? { precip: 2, code: 63, pop: 90 } : i === 13 ? { gust: 70 } : {}));
  const b = briefing(wx, DAY0 + 7 * H, f);
  assert.match(b.title, /^Testville · \d+° \/ \d+°$/);
  assert.match(b.body, /then rain until around 18:00/);
  assert.match(b.body, /Warning: gales\./); assert.match(b.body, /Take an umbrella\./);
});
test("the tick keeps to Open-Meteo's free allowance: whole forecasts first, then rain, the rest next time", async () => {
  const { budgeted } = await import("../../../functions/_wxpush.js");
  const cells = (full, rain) => [...Array.from({ length: full }, (_, i) => [`f${i}`, { full: true }]), ...Array.from({ length: rain }, (_, i) => [`r${i}`, { full: false }])];
  const cost = (list) => list.reduce((a, [, c]) => a + (c.full ? 7 : 1), 0);
  let got = budgeted(cells(3, 10));
  assert.equal(got.length, 13, "a few places: all of them");
  got = budgeted(cells(3, 100));
  assert.equal(got.filter(([, c]) => c.full).length, 3, "every briefing's forecast"); assert.equal(cost(got), 55, "and rain up to the budget");
  got = budgeted(cells(10, 30));
  assert.equal(got.filter(([, c]) => c.full).length, 7); assert.equal(cost(got), 55, "the budget's left-over goes on rain");
  const a = budgeted(cells(0, 200), 55, () => 0.9).map(([k]) => k), seen = new Set();
  for (let n = 0; n < 20; n++) budgeted(cells(0, 200)).forEach(([k]) => seen.add(k));
  assert.equal(a.length, 55); assert.ok(seen.size > 150, "not always the same places left out");
});
