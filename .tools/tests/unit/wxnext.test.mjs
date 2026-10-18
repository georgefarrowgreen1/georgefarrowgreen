// Weather's second round (weather/): how good each model has been here and the forecast tuned by it
// (skill.js), your own activities and their limits (insights.js), and what a notification says and
// when it's due (alerts.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFormat, keyOf } from "../../../weather/format.js";
import { shapePrevious, skillFrom, tuneDay, applyTuning, obsDays, TUNE_DAYS } from "../../../weather/skill.js";
import { activityScore, ACTIVITIES, windows, limitsText } from "../../../weather/insights.js";
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
function previous(names = ["ecmwf_ifs025", "gfs_seamless"]) {
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
  assert.deepEqual(Object.keys(p).sort(), ["ecmwf_ifs025", "gfs_seamless"]);
  assert.ok(Math.abs(p.ecmwf_ifs025["2026-10-05"].hi1 - 16) < 0.01 && Math.abs(p.gfs_seamless["2026-10-05"].lo1 - 2) < 0.01);
  // one model asked for: its columns carry no suffix
  const one = shapePrevious(previous(["ecmwf_ifs025"]), [["ecmwf_ifs025", "ECMWF"]]);
  assert.ok(one.ecmwf_ifs025["2026-10-06"].hi3 > one.ecmwf_ifs025["2026-10-06"].hi1);
  assert.equal(shapePrevious({}), null);
});
test("skill: the closer model wins, and each one's lean is known", () => {
  const k = skillFrom(shapePrevious(previous()), obs);
  assert.equal(k.best, "ecmwf_ifs025"); assert.equal(k.days, 10);
  const e = k.byId.ecmwf_ifs025, g = k.byId.gfs_seamless;
  assert.ok(Math.abs(e.hiMae - 1) < 0.01 && Math.abs(e.hiBias - 1) < 0.01 && Math.abs(g.hiBias + 3) < 0.01);
  assert.ok(Math.abs(e.hiMae3 - 1.5) < 0.01);
  // too few days: nothing to say yet
  assert.equal(skillFrom(shapePrevious(previous()), { "2026-10-05": { tmax: 15, tmin: 5 } }), null);
});
test("tuning: each model's lean taken off, the closest counting most", () => {
  const prev = shapePrevious(previous(["ecmwf_ifs025", "gfs_seamless", "icon_seamless"]));
  const k = skillFrom(prev, obs);      // icon is like gfs here (3° cold)
  const t = tuneDay(k, [{ id: "ecmwf_ifs025", tmax: 18, tmin: 8 }, { id: "gfs_seamless", tmax: 14, tmin: 4 }, { id: "icon_seamless", tmax: 14, tmin: 4 }]);
  // with their leans taken off, all three say 17° / 7°
  assert.ok(Math.abs(t.tmax - 17) < 0.01 && Math.abs(t.tmin - 7) < 0.01, JSON.stringify(t));
  assert.equal(tuneDay(k, [{ id: "ecmwf_ifs025", tmax: 18, tmin: 8 }]), null, "one model isn't enough");
  assert.equal(tuneDay({ ...k, days: TUNE_DAYS - 1 }, [{ id: "ecmwf_ifs025", tmax: 18, tmin: 8 }, { id: "gfs_seamless", tmax: 14, tmin: 4 }, { id: "icon_seamless", tmax: 14, tmin: 4 }]), null, "not enough days yet");
  const wx = makeWx();
  wx.models = { days: { [keyOf(DAY0 + D)]: [{ id: "ecmwf_ifs025", tmax: 18, tmin: 8 }, { id: "gfs_seamless", tmax: 14, tmin: 4 }, { id: "icon_seamless", tmax: 14, tmin: 4 }] } };
  const out = applyTuning(wx, k, keyOf(DAY0));
  const tomorrow = out.daily.find((d) => d.key === keyOf(DAY0 + D)), today = out.daily.find((d) => d.key === keyOf(DAY0));
  assert.ok(tomorrow.tuned && Math.abs(tomorrow.tmax - 17) < 0.01 && tomorrow.raw.tmax === 12);
  assert.ok(!today.tuned, "today is left to its own hours");
  assert.equal(wx.daily[2].tuned, undefined, "the original isn't changed");
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
