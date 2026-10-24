// One rain story (weather/agree.js): every hour's chance from the ensembles, a day's of rain at some point in it, and
// the first hours as the next four hours (and the radar, where it leads) have them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { oneRain } from "../../../weather/agree.js";
import { rainChance, dayParts, nowcast } from "../../../weather/insights.js";
import { isWetCode, wetAt, heaviness } from "../../../weather/codes.js";
import { shapeEnsemble } from "../../../weather/data.js";
import { blend } from "../../../weather/rainmap.js";
import { keyOf, makeFormat } from "../../../weather/format.js";

const H = 3600e3, D = 864e5, Q = 15 * 60e3;
const DAY0 = Date.UTC(2026, 9, 19), NOW = DAY0 + 10 * H;

// three days of hours (from yesterday), each its rain the hour up to its time, the forecast's own chance 50% when wet
function makeWx(hour = () => ({})) {
  const hourly = [];
  for (let i = -24; i < 72; i++) hourly.push({ t: DAY0 + i * H, temp: 12, precip: 0, pop: 10, code: 2, isDay: true, ...hour(i) });
  const daily = [-1, 0, 1, 2].map((k) => ({ date: DAY0 + k * D, key: keyOf(DAY0 + k * D), tmax: 14, tmin: 9, code: 2, popMax: 10, precip: 0 }));
  return { place: { offset: 0 }, hourly, daily, minutely: [] };
}
// an ensemble (one system, 50 runs): wet(i, k), whether run k is wet in the hour up to DAY0 + i hours
function ensembleOf(wet) {
  const time = [], h = { time };
  for (let i = -24; i < 72; i++) time.push(new Date(DAY0 + i * H).toISOString().slice(0, 16));
  for (let k = 0; k < 50; k++) {
    const sfx = k ? `_member${String(k).padStart(2, "0")}` : "";
    h[`temperature_2m${sfx}`] = time.map(() => 12);
    h[`precipitation${sfx}`] = time.map((_, j) => (wet(j - 24, k) ? 0.6 : 0));
  }
  return shapeEnsemble({ hourly: h });
}
const at = (wx, i) => wx.hourly.find((h) => h.t === DAY0 + i * H);

test("each hour's chance is the ensembles' (where they reach), a day's of rain at some point in it", () => {
  const wx = makeWx();
  // ten of the 50 runs wet at 15:00 tomorrow, ten others at 16:00
  wx.ensemble = ensembleOf((i, k) => (i === 39 && k < 10) || (i === 40 && k >= 10 && k < 20));
  const told = oneRain(wx, NOW);
  assert.equal(at(told, 39).pop, 20); assert.equal(at(told, 40).pop, 20); assert.equal(at(told, 30).pop, 0);
  // tomorrow: 20 of the 50 runs wet at some point, not the wettest hour's 20% alone... a 40% chance
  assert.equal(told.daily.find((d) => d.date === DAY0 + D).popMax, 40);
  assert.equal(told.daily.find((d) => d.date === DAY0).popMax, 0, "today, from now: dry in every run");
  assert.equal(told.daily.find((d) => d.date === DAY0 - D).popMax, 10, "a day gone: as it was");
  // and a part of the day the same way: tomorrow afternoon holds both hours
  const parts = dayParts(told, keyOf(DAY0 + D));
  assert.equal(parts.find((p) => p.name === "afternoon").pop, 40);
  assert.equal(parts.find((p) => p.name === "morning").pop, 0);
});

test("the first hours are the next four hours': their rain, and where the radar leads, their chance", () => {
  // the forecast has rain at 11:00 and 12:00; the 15-minute forecast has it a little later and lighter
  const wx = makeWx((i) => (i === 11 || i === 12 ? { precip: 2, code: 63, pop: 90 } : {}));
  wx.ensemble = ensembleOf((i, k) => (i === 11 || i === 12) && k < 35);
  // (quarters from 09:45, each kept by when it starts: wet from 12:00 to 13:00)
  wx.minutely = Array.from({ length: 17 }, (_, k) => ({ t: NOW - Q + k * Q, precip: k >= 9 && k < 13 ? 0.3 : 0, code: k >= 9 && k < 13 ? 61 : 2 }));
  let told = oneRain(wx, NOW);
  // (11:00's rain is the hour up to it, 10:00 to 11:00: the quarters from 10:00; dry in the next four hours)
  assert.deepEqual([at(told, 11).precip, at(told, 11).code, at(told, 11).pop], [0, 63, 70], "no radar: the quarters' rain, the ensembles' chance");
  assert.deepEqual([at(told, 13).precip, at(told, 13).code], [1.2, 63], "12:00 to 13:00 wet in the quarters: rain, 1.2 mm in the hour (moderate), not the quarters' light");
  assert.equal(at(told, 11).led, undefined);
  // the radar seeing it dry for the next hour and a half, then light rain: it leads, and says so
  const steps = Array.from({ length: 25 }, (_, k) => ({ lead: k * 5, mmh: k * 5 >= 100 ? 1 : 0, snow: false, seen: 1 }));
  wx.minutely = blend(wx.minutely, steps, NOW - 5 * 60e3, 0);
  told = oneRain(wx, NOW);
  const eleven = at(told, 11);
  assert.ok(eleven.led > 0.8 && eleven.pop <= 15 && eleven.code === 3 && eleven.precip === 0, `the radar dry: ${JSON.stringify(eleven)}`);
  // today's chance from now: the hours it leads by their own say, the rest from the ensembles
  const today = told.daily.find((d) => d.date === DAY0).popMax, rc = rainChance(told, NOW, DAY0 + D);
  assert.equal(today, Math.round(rc * 100));
  assert.ok(today >= 0 && today <= 100);
});

test("without the ensembles or the next four hours: the forecast as it was", () => {
  const wx = makeWx((i) => (i === 40 ? { precip: 1, code: 61, pop: 60 } : {}));
  const told = oneRain(wx, NOW);
  assert.equal(at(told, 40).pop, 60);
  assert.equal(told.daily[2].popMax, 10);
  assert.equal(rainChance(told, NOW, NOW + 3 * H), null);
});

test("how heavy rain is, by its rate: one scale (light under 0.6 mm an hour, moderate to 4, heavy beyond), its kind kept", () => {
  assert.deepEqual([0.3, 0.6, 1.2, 3.9, 4, 12].map(heaviness), [1, 2, 2, 2, 3, 3]);
  // rain, showers, drizzle while it's light, snow by its water; a thunderstorm and freezing rain as they are
  assert.deepEqual([wetAt(61, 1.2), wetAt(63, 0.3), wetAt(61, 6), wetAt(80, 1.2), wetAt(82, 0.2), wetAt(51, 0.3), wetAt(51, 1.2)], [63, 61, 65, 81, 80, 51, 63]);
  assert.deepEqual([wetAt(71, 0.5), wetAt(71, 2), wetAt(85, 2), wetAt(3, 2, true), wetAt(3, 2), wetAt(95, 0.2), wetAt(66, 6)], [71, 73, 86, 73, 63, 95, 66]);
});
test("now: raining as the next four hours say (the radar's, where it leads), so the top of the page agrees with them", () => {
  // 15:50; the forecast's own now overcast, but the radar's quarters wet from 15:45 to 16:15, then dry
  const at = DAY0 + 15 * H + 50 * 60e3, f = makeFormat({});
  const wx = makeWx((i) => (i === 16 ? { code: 3, precip: 0, pop: 30 } : {}));
  wx.current = { t: at, temp: 12, feels: 9, code: 3, precip: 0, cloud: 100, isDay: true };
  wx.minutely = Array.from({ length: 17 }, (_, k) => ({ t: DAY0 + 15 * H + 45 * 60e3 + k * Q, precip: k < 2 ? 0.3 : 0, code: k < 2 ? 61 : 3, radar: k < 12 ? 1 : 0 }));
  let told = oneRain(wx, at);
  assert.equal(nowcast(told, at, f).now, true);
  assert.equal(told.current.code, 63, "raining now, and as heavily as the card under it says (1.2 mm an hour: moderate), not overcast");
  // (the hour now's in, 15:00 to 16:00, partly gone: what's left of it wet, so a wet hour)
  assert.ok(isWetCode(at16(told).code) && at16(told).precip >= 0.3, JSON.stringify(at16(told)));
  // the other way: the forecast has rain now, the radar sees none here for the next hour
  wx.current = { ...wx.current, code: 63, precip: 0.4, cloud: 90 };
  wx.minutely = wx.minutely.map((q) => ({ ...q, precip: 0, code: 3 }));
  told = oneRain(wx, at);
  assert.equal(nowcast(told, at, f), null);
  assert.equal(told.current.code, 3, "not raining now, as the card says: overcast");
  // without the next four hours: the forecast's own now, as it was
  wx.minutely = [];
  assert.equal(oneRain(wx, at).current.code, 63);
});
const at16 = (wx) => wx.hourly.find((h) => h.t === DAY0 + 16 * H);
