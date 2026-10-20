// The weather app's reasoning (weather/): units and times, the Sun and Moon, thirty years of
// climate, and the insights it draws from a forecast, on forecasts made up to show each case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFormat, parseWall, keyOf, compass, beaufort } from "../../../weather/format.js";
import { skyDay, nextPhases, offsetFor, moonPhase } from "../../../weather/sky.js";
import { compactClimate, climateOn, rankIn, yearsAgo, climateSpan } from "../../../weather/climate.js";
import { shapeForecast, shapeModels, shapeEnsemble } from "../../../weather/data.js";
import { codeInfo, iconOf } from "../../../weather/codes.js";
import * as I from "../../../weather/insights.js";

const H = 3600e3, D = 864e5, M = 60e3;
const f = makeFormat({ temp: "c", wind: "mph", precip: "mm", clock: "24" });
const DAY0 = Date.UTC(2026, 9, 19);          // a Monday, in the place's wall time

// A made-up forecast: `hour(i, t)` gives what's different about hour i (from DAY0's midnight)
function makeWx(hour = () => ({}), { days = 10, minutely = null, extra = {} } = {}) {
  const hourly = [];
  for (let i = -24; i < days * 24; i++) {
    const t = DAY0 + i * H, hh = ((i % 24) + 24) % 24, isDay = hh >= 7 && hh < 18;
    hourly.push({ t, temp: 12 + 4 * Math.sin((hh - 9) / 24 * 2 * Math.PI), feels: 11 + 4 * Math.sin((hh - 9) / 24 * 2 * Math.PI), rh: 70, dew: 6,
      pop: 5, precip: 0, snow: 0, code: 2, pressure: 1015, cloud: 50, cloudLow: 20, cloudMid: 20, cloudHigh: 20, vis: 20000, wind: 12, dir: 225, gust: 25,
      uv: isDay ? 2 : 0, isDay, cape: 0, li: null, vpd: 0.6, sun: isDay ? 1800 : 0, ...hour(i, t, hh) });
  }
  const daily = [];
  for (let k = -1; k < days; k++) {
    const date = DAY0 + k * D, hs = hourly.filter((h) => h.t >= date && h.t < date + D);
    daily.push({ date, key: keyOf(date), code: Math.max(...hs.map((h) => h.code)), tmax: Math.max(...hs.map((h) => h.temp)), tmin: Math.min(...hs.map((h) => h.temp)),
      fmax: Math.max(...hs.map((h) => h.feels)), fmin: Math.min(...hs.map((h) => h.feels)), sunrise: date + 7 * H, sunset: date + 18 * H - k * 2 * M,
      daylight: 11 * 3600 - k * 240, sunshine: hs.reduce((a, h) => a + (h.sun || 0), 0), uvMax: Math.max(...hs.map((h) => h.uv)),
      precip: hs.reduce((a, h) => a + h.precip, 0), snow: hs.reduce((a, h) => a + h.snow, 0), precipHours: hs.filter((h) => h.precip >= 0.1).length,
      popMax: Math.max(...hs.map((h) => h.pop)), gustMax: Math.max(...hs.map((h) => h.gust)), windMax: Math.max(...hs.map((h) => h.wind)), dir: 225 });
  }
  return { place: { name: "Testville", lat: 51.5, lon: -0.12, offset: 3600 }, current: { ...hourly[24 + 10], precip: 0 }, minutely: minutely || [], hourly, daily, models: null, ensemble: null, air: null, climate: null, ...extra };
}
const ids = (cards) => cards.map((c) => c.id);
const card = (cards, id) => cards.find((c) => c.id === id);

/* ---------- units and times ---------- */
test("units convert, and times read as the place's own clock", () => {
  const us = makeFormat({ temp: "f", wind: "kmh", precip: "in", clock: "12", pressure: "inhg" });
  assert.equal(f.temp(21.4), "21°"); assert.equal(us.temp(20), "68°"); assert.equal(us.delta(5), "9°");
  assert.equal(f.temp(-3.4), "−3°"); assert.equal(f.temp(-0.4), "0°");     // (a true minus sign; never "−0°")
  assert.equal(f.wind(100), "62 mph"); assert.equal(us.wind(100), "100 km/h");
  assert.equal(f.precip(0.04), "0 mm"); assert.equal(f.precip(3.26), "3.3 mm"); assert.equal(f.precip(12.6), "13 mm"); assert.equal(us.precip(25.4), "1.0 in");
  assert.equal(us.pressure(1013.25), "29.92 inHg");
  const t = parseWall("2026-10-19T15:30");
  assert.equal(f.time(t), "15:30"); assert.equal(us.time(t), "3:30pm"); assert.equal(us.time(parseWall("2026-10-19T00:00")), "midnight");
  assert.equal(f.day(t, DAY0 + 8 * H), "Today"); assert.equal(f.day(t + D, DAY0), "Tomorrow"); assert.equal(f.day(t + 3 * D, DAY0), "Thursday");
  assert.equal(f.when(DAY0 + 15 * H, DAY0 + 9 * H), "this afternoon"); assert.equal(f.when(DAY0 + D + 2 * H, DAY0 + 20 * H), "overnight");
  assert.equal(f.when(DAY0 + D + 8 * H, DAY0 + 20 * H), "tomorrow morning");
  assert.equal(compass(230), "SW"); assert.equal(beaufort(65).force, 8);
  assert.equal(codeInfo(95).kind, "storm"); assert.equal(iconOf(0, false), "moon"); assert.equal(iconOf(81, true), "showers-sun");
});

/* ---------- the Sun and Moon ---------- */
test("sunrise and sunset in London, to within two minutes", () => {
  const s = skyDay(Date.UTC(2026, 9, 18) - H, 51.5072, -0.1276);    // local midnight (BST)
  assert.ok(Math.abs(s.sunrise - Date.UTC(2026, 9, 18, 6, 29)) < 2 * M, new Date(s.sunrise).toISOString());
  assert.ok(Math.abs(s.sunset - Date.UTC(2026, 9, 18, 17, 1)) < 2 * M, new Date(s.sunset).toISOString());
  assert.ok(s.goldenPm[0] < s.sunset && s.sunset < s.goldenPm[1] && s.goldenPm[1] <= s.bluePm[0] + M && s.bluePm[1] === s.dusk);
});
test("the Moon: full on 26 October 2026, new on 9 November, half lit on the 18th", () => {
  const p = nextPhases(Date.UTC(2026, 9, 18));
  assert.ok(Math.abs(p.full - Date.UTC(2026, 9, 26, 4, 12)) < 20 * M, new Date(p.full).toISOString());
  assert.ok(Math.abs(p.new - Date.UTC(2026, 10, 9, 7, 2)) < 20 * M, new Date(p.new).toISOString());
  const m = moonPhase(Date.UTC(2026, 9, 18, 12));
  assert.ok(m.waxing && m.lit > 0.4 && m.lit < 0.6, m.name);
});
test("a polar night has no sunrise; the clocks going back are found from the forecast's own sunrise", () => {
  const s = skyDay(Date.UTC(2026, 11, 21) - H, 69.65, 18.96);
  assert.equal(s.sunrise, null); assert.equal(s.sunset, null);
  assert.equal(offsetFor(parseWall("2026-10-18T07:29"), 51.5072, -0.1276, 3600), 3600);
  assert.equal(offsetFor(parseWall("2026-10-26T06:43"), 51.5072, -0.1276, 3600), 0);
});

/* ---------- thirty years of this time of year ---------- */
function fakeArchive() {
  const time = [], tmax = [], tmin = [], rain = [];
  for (let t = Date.UTC(1996, 0, 1); t <= Date.UTC(2025, 11, 31); t += D) {
    const d = new Date(t), y = d.getUTCFullYear(), doy = (t - Date.UTC(y, 0, 1)) / D;
    time.push(d.toISOString().slice(0, 10));
    tmax.push(15 + 8 * Math.sin((doy - 110) / 365.25 * 2 * Math.PI) + ((y * 7 + doy * 13) % 9) / 2 - 2);
    tmin.push(7 + 6 * Math.sin((doy - 110) / 365.25 * 2 * Math.PI));
    rain.push(doy % 3 === 0 ? 3 : 0);
  }
  // a record: 25° on 19 October 2011
  tmax[time.indexOf("2011-10-19")] = 25;
  return { daily: { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: rain } };
}
test("climate: normals, percentiles, records and a year ago", () => {
  const c = compactClimate(fakeArchive());
  assert.deepEqual(c.years, [1996, 2025]);
  const n = climateOn(c, DAY0);
  assert.ok(n.tmax.mean > 10 && n.tmax.mean < 16, String(n.tmax.mean));
  assert.ok(n.tmax.p10 < n.tmax.p50 && n.tmax.p50 < n.tmax.p90);
  assert.deepEqual(n.recordHigh, { v: 25, year: 2011 });
  assert.ok(Math.abs(n.wet - 1 / 3) < 0.05);
  assert.equal(rankIn([1, 2, 3, 4], 5), 100); assert.equal(rankIn([1, 2, 3, 4], 0), 0); assert.equal(rankIn([1, 2, 3, 4], 2), 37.5);
  assert.equal(yearsAgo(c, Date.UTC(2026, 9, 19)).key, "2025-10-19");
  assert.deepEqual(climateSpan(Date.UTC(2026, 9, 18)), { start: "1996-01-01", end: "2025-12-31" });
});
test("a forecast near the record says so", () => {
  const wx = makeWx((i, t, hh) => (i >= 0 && i < 24 ? { temp: hh === 14 ? 24.8 : 15 } : {}));
  wx.climate = compactClimate(fakeArchive());
  const cards = I.insights(wx, DAY0 + 9 * H, f);
  assert.match(card(cards, "normal").title, /near-record/);
  assert.match(card(cards, "normal").text, /25° in 2011/);
});

/* ---------- shaping Open-Meteo's answers ---------- */
test("shapes a forecast, the models and the ensemble", () => {
  const j = { latitude: 51.5, longitude: -0.1, timezone: "Europe/London", utc_offset_seconds: 3600,
    current: { time: "2026-10-19T10:15", temperature_2m: 12.3, weather_code: 3, is_day: 1, precipitation: 0 },
    hourly: { time: ["2026-10-19T10:00", "2026-10-19T11:00"], temperature_2m: [12, 13], weather_code: [3, 61], precipitation: [0, 0.6], is_day: [1, 1], precipitation_probability: [10, 70] },
    daily: { time: ["2026-10-19"], temperature_2m_max: [14], temperature_2m_min: [8], sunrise: ["2026-10-19T07:31"], sunset: ["2026-10-19T17:58"], weather_code: [61], precipitation_sum: [2] },
    minutely_15: { time: ["2026-10-19T10:15"], precipitation: [0.1], weather_code: [61] } };
  const wx = shapeForecast(j, { name: "London", lat: 51.5, lon: -0.1 });
  assert.equal(wx.place.offset, 3600); assert.equal(wx.hourly[1].pop, 70); assert.equal(wx.hourly[1].isDay, true);
  assert.equal(wx.daily[0].sunrise, Date.UTC(2026, 9, 19, 7, 31)); assert.equal(wx.current.temp, 12.3); assert.equal(wx.minutely[0].precip, 0.1);
  assert.equal(wx.minutely[0].t, Date.UTC(2026, 9, 19, 10, 0), "a quarter hour's rain is the 15 minutes up to its time: kept by when it starts");
  const m = shapeModels({ daily: { time: ["2026-10-19"], temperature_2m_max_ecmwf_ifs: [14], precipitation_sum_ecmwf_ifs: [2], temperature_2m_max_gfs_seamless: [16], precipitation_sum_gfs_seamless: [0], temperature_2m_max_gem_seamless: [null] } });
  assert.deepEqual(m.list.map((x) => x[1]), ["ECMWF", "GFS"]);
  assert.equal(m.days["2026-10-19"][1].tmax, 16);
  const hourly = { time: [] };
  for (let k = 0; k < 24; k++) hourly.time.push(`2026-10-19T${String(k).padStart(2, "0")}:00`);
  for (let mbr = 0; mbr <= 10; mbr++) {
    const sfx = mbr ? `_member${String(mbr).padStart(2, "0")}` : "";
    hourly[`temperature_2m${sfx}`] = hourly.time.map((_, k) => 10 + mbr * 0.5 + (k === 14 ? 3 : 0));
    hourly[`precipitation${sfx}`] = hourly.time.map(() => (mbr < 4 ? 0.2 : 0));
  }
  const e = shapeEnsemble({ hourly });
  assert.equal(e.members, 11);
  assert.ok(Math.abs(e.hourly[14].p50 - 15.5) < 1e-9);
  assert.ok(Math.abs(e.days["2026-10-19"].wet - 4 / 11) < 1e-9);       // 4 runs with 4.8 mm, the rest dry
  assert.ok(e.days["2026-10-19"].tmaxP90 > e.days["2026-10-19"].tmaxP10);
});

/* ---------- the next few hours ---------- */
const quarter = (from, fn) => Array.from({ length: 16 }, (_, k) => ({ t: from + k * 15 * M, precip: fn(k), code: fn(k) ? 61 : 2 }));
test("nowcast: rain starting soon, and rain stopping", () => {
  const now = DAY0 + 10 * H;
  let wx = makeWx(() => ({}), { minutely: quarter(now, (k) => (k >= 2 && k < 6 ? 0.4 : 0)) });
  let n = I.nowcast(wx, now, f);
  assert.equal(n.now, false); assert.equal(n.startsAt, now + 30 * M); assert.match(n.text, /starting in about 30 min, lasting about an hour/);
  wx = makeWx(() => ({}), { minutely: quarter(now, (k) => (k < 3 ? 1.2 : 0)) });
  n = I.nowcast(wx, now, f);
  assert.equal(n.now, true); assert.match(n.text, /^Heavy rain stopping in about 45 min/);
  // starting again later: in hours, not "175 min"
  wx = makeWx(() => ({}), { minutely: quarter(now, (k) => (k < 2 || k >= 12 ? 0.4 : 0)) });
  n = I.nowcast(wx, now, f);
  assert.match(n.text, /stopping in about 30 min\. Starting again in about 3h\.$/, n.text);
  wx = makeWx(() => ({}), { minutely: quarter(now, () => 0) });
  assert.equal(I.nowcast(wx, now, f), null);
});

/* ---------- the headline ---------- */
test("headline: dry, rain later, raining now", () => {
  const dry = makeWx((i, t, hh) => ({ cloud: 10 }));
  assert.match(I.headline(dry, DAY0 + 9 * H, f), /^Dry, sunny for the rest of the day and clear tonight\. High \d+°\.$/);
  const later = makeWx((i) => (i >= 16 && i < 20 ? { precip: 1.5, code: 63, pop: 90 } : {}));
  assert.match(I.headline(later, DAY0 + 9 * H, f), /until about 16:00, then rain until around 20:00\./);
  // rain due later in this very hour: the quarter-hours say it hasn't started yet
  const soon = makeWx((i) => (i === 9 ? { precip: 1, code: 63, pop: 90 } : {}), { minutely: quarter(DAY0 + 9 * H, (k) => (k >= 2 && k < 4 ? 0.3 : 0)) });
  assert.match(I.headline(soon, DAY0 + 9 * H + 5 * M, f), /^Rain on the way from about 09:30, for an hour or two\./);
  const now = makeWx((i) => (i >= 6 && i < 12 ? { precip: 2, code: 63, pop: 95 } : {}));
  assert.match(I.headline(now, DAY0 + 9 * H, f), /^Rain easing around 12:00, then/);
  const evening = makeWx(() => ({ cloud: 90 }));
  assert.match(I.headline(evening, DAY0 + 20 * H, f), /Down to \d+° tonight\. Tomorrow: cloudy, \d+°\./);
  // a shower the quarter hours see coming (the radar's) that the hours don't: said, not "dry"
  const shower = makeWx(() => ({}), { minutely: quarter(DAY0 + 10 * H, (k) => (k >= 2 && k < 4 ? 0.3 : 0)) });
  assert.match(I.headline(shower, DAY0 + 10 * H, f), /^Rain on the way from about 10:30, for an hour or two\./);
  // and raining now by them, though not by the hours: easing, not "dry"
  const wet = makeWx(() => ({}), { minutely: quarter(DAY0 + 10 * H, (k) => (k < 2 ? 0.4 : 0)) });
  assert.match(I.headline(wet, DAY0 + 10 * H, f), /^Rain easing soon, then /);
});

/* ---------- a day in words ---------- */
test("describeDay: part by part, with rain and wind", () => {
  const wx = makeWx((i) => (i >= 24 && i < 36 ? { cloud: 10 } : i >= 36 && i < 48 ? { precip: 1, code: 63, pop: 90, gust: 55 } : {}));
  const s = I.describeDay(wx, keyOf(DAY0 + D), f);
  assert.match(s, /^Sunny in the morning, then rain from the afternoon\. Around 12 mm of rain, mostly in the (afternoon|evening)\. Windy, gusts up to 34 mph\.$/);
  assert.match(I.describeDay(makeWx(() => ({ cloud: 95 })), keyOf(DAY0), f), /^Cloudy all day\.$/);
  // rain over two parts of the day: in both, not "through" the second (which read as only then)
  const wet = makeWx((i) => (i >= 30 && i < 42 ? { precip: 1, code: 63, pop: 90 } : i >= 42 && i < 48 ? { cloud: 95 } : {}));
  assert.match(I.describeDay(wet, keyOf(DAY0 + D), f), /^Rain in the morning and afternoon, then cloudy in the evening\./);
  // the high and low are beside it in the sheet; only how the high will feel, when it's different
  const raw = makeWx((i, t, hh) => ({ cloud: 95, feels: 12 + 4 * Math.sin((hh - 9) / 24 * 2 * Math.PI) - 5 }));
  assert.match(I.describeDay(raw, keyOf(DAY0 + D), f), /^Cloudy all day\. The high feels more like \d+°\.$/);
  // rain in the small hours, before the morning the parts start with, is placed there
  const early = makeWx((i) => (i >= 26 && i < 29 ? { precip: 1, code: 63, pop: 90 } : { cloud: 95 }));
  assert.match(I.describeDay(early, keyOf(DAY0 + D), f), /^Cloudy all day\. Around 3 mm of rain, in the small hours\.$/);
});

/* ---------- the warnings ---------- */
test("frost, ground frost and ice", () => {
  const frost = makeWx((i, t, hh) => (i >= 24 && i < 31 ? { temp: -2, feels: -4 } : {}));
  const c = I.insights(frost, DAY0 + 15 * H, f);
  assert.equal(card(c, "frost").title, "Frost"); assert.match(card(c, "frost").text, /Down to −2° overnight/);
  const ground = makeWx((i, t, hh) => (i >= 24 && i < 31 ? { temp: 2, cloud: 5, wind: 4 } : {}));
  assert.equal(card(I.insights(ground, DAY0 + 15 * H, f), "frost").title, "Ground frost possible");
  const ice = makeWx((i) => (i >= 20 && i < 23 ? { precip: 1, code: 63, pop: 90 } : i >= 23 && i < 30 ? { temp: -1 } : {}));
  const ci = I.insights(ice, DAY0 + 15 * H, f);
  assert.ok(card(ci, "ice")); assert.ok(!card(ci, "frost"), "ice replaces the frost card");
});
test("wind, heavy rain, thunderstorms, snow, fog, heat, UV", () => {
  const now = DAY0 + 9 * H;
  const c = I.insights(makeWx((i) => (i === 15 ? { gust: 85, dir: 270 } : i === 30 ? { precip: 12, code: 65, pop: 95 } : i === 33 ? { code: 95, pop: 80 } : {})), now, f);
  assert.equal(card(c, "wind").title, "Damaging gusts"); assert.equal(card(c, "wind").level, "alert"); assert.match(card(c, "wind").text, /53 mph this afternoon, from the west/);
  assert.equal(card(c, "heavyrain").title, "Heavy rain");
  assert.equal(card(c, "storm").title, "Thunderstorms possible");
  assert.ok(ids(c).indexOf("storm") < ids(c).indexOf("wear"), "warnings come before tips");
  const snow = I.insights(makeWx((i) => (i >= 20 && i < 26 ? { snow: 1.2, code: 73, precip: 1, temp: 0 } : {})), now, f);
  assert.equal(card(snow, "snow").title, "Heavy snow");
  const fog = I.insights(makeWx((i) => (i >= 28 && i < 32 ? { code: 45, vis: 150 } : {})), DAY0 + 20 * H, f);
  assert.match(card(fog, "fog").text, /^Likely overnight, from about 04:00, visibility down to 0\.1 mi/);
  const hot = I.insights(makeWx((i, t, hh) => (i >= 0 && i < 24 ? { feels: hh > 11 && hh < 17 ? 33 : 22, uv: hh > 10 && hh < 16 ? 8 : 1 } : {})), now, f);
  assert.equal(card(hot, "heat").title, "Very hot");
  assert.match(card(hot, "uv").text, /^UV 8 around 11:00: fair skin can burn in about 20 minutes/);
});
/* ---------- warnings that suit the place ---------- */
// thirty years of a made-up climate: days warming from `winter`° to `summer`° in late July, nights from `cold`° to
// `night`°, a few degrees either way, now and then a day 5° warmer than that; every third day wet, `rain` mm or up to
// twice it
function climateLike({ summer, winter, night, cold, rain = 3 }) {
  const time = [], tmax = [], tmin = [], precip = [];
  for (let t = Date.UTC(1996, 0, 1); t <= Date.UTC(2025, 11, 31); t += D) {
    const d = new Date(t), y = d.getUTCFullYear(), doy = (t - Date.UTC(y, 0, 1)) / D;
    const k = (Math.sin(((doy - 110) / 365.25) * 2 * Math.PI) + 1) / 2, wobble = (((y * 7 + doy * 13) % 9) - 4) * 0.75;
    time.push(d.toISOString().slice(0, 10));
    tmax.push(winter + (summer - winter) * k + wobble + ((y * 3 + doy) % 37 === 0 ? 5 : 0)); tmin.push(cold + (night - cold) * k + wobble);
    precip.push(doy % 3 === 0 ? rain * (1 + ((y + doy) % 5) / 4) : 0);
  }
  return compactClimate({ daily: { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: precip } });
}
test("warnings suit the place: heat and warm nights where summers are hot, by its own warmest days", () => {
  const south = climateLike({ summer: 31, winter: 12, night: 21, cold: 3 }), now = DAY0 + 9 * H;
  const L = I.limitsHere({ climate: south });
  assert.ok(L.hot > 27 && L.hot < 36 && L.warmNight > 20, JSON.stringify(L));
  // tomorrow afternoon: 2° short of a hot summer's day there, then 1° past it (feeling 1° warmer)
  const at = (v, climate = south) => makeWx((i, t, hh) => (i >= 24 && i < 48 ? { temp: hh >= 13 && hh <= 16 ? v : 22, feels: hh >= 13 && hh <= 16 ? v + 1 : 22 } : {}), { extra: { climate } });
  assert.equal(card(I.insights(at(L.hot - 2), now, f), "heat"), undefined, "an ordinary summer's day there");
  const hot = card(I.insights(at(L.hot + 1), now, f), "heat");
  assert.equal(hot.title, "Hot"); assert.match(hot.text, /, hotter than most summer days here\. Drink plenty/);
  const very = card(I.insights(at(L.veryHot + 0.5), now, f), "heat");
  assert.ok(L.veryHot - L.hot >= 2 && very.title === "Very hot" && /, as hot as summer gets here\./.test(very.text), very.text);
  // the same day somewhere with cool summers (and no climate yet): hot by the fixed bar
  const cool = card(I.insights(at(29, null), now, f), "heat");
  assert.equal(cool.title, "Hot"); assert.doesNotMatch(cool.text, /here/);
  const uk = makeWx((i, t, hh) => (i >= 24 && i < 48 ? { temp: hh >= 13 && hh <= 16 ? 28 : 18, feels: hh >= 13 && hh <= 16 ? 28 : 18 } : {}), { extra: { climate: compactClimate(fakeArchive()) } });
  assert.equal(card(I.insights(uk, now, f), "heat").title, "Hot", "a cool climate keeps the fixed bar");
  // a warm night: short of the warmest tenth of summer nights there, then past it
  const night = (v) => makeWx((i) => (i >= 12 && i < 36 ? { temp: v, feels: v } : {}), { extra: { climate: south } });
  assert.equal(card(I.insights(night(L.warmNight - 1), now, f), "warmnight"), undefined);
  assert.match(card(I.insights(night(L.warmNight + 0.5), now, f), "warmnight").text, /, warmer than most summer nights here\./);
});
test("warnings suit the place: bitter cold and frost where winters are hard, heavy rain where it's wet", () => {
  const north = climateLike({ summer: 24, winter: -10, night: 8, cold: -26 }), now = DAY0 + 15 * H;
  const L = I.limitsHere({ climate: north });
  assert.ok(L.bitter < -10, JSON.stringify(L));
  const feels = (v, climate) => I.insights(makeWx((i) => (i >= 24 && i < 31 ? { temp: v + 4, feels: v } : {}), { extra: { climate } }), now, f);
  assert.equal(card(feels(-9, north), "bitter"), undefined, "just a winter's night there");
  assert.match(card(feels(L.bitter - 2, north), "bitter").text, /, colder than most winter nights here\. Hat/);
  assert.equal(card(feels(-9, compactClimate(fakeArchive())), "bitter").title, "Bitterly cold", "somewhere milder, by the fixed bar");
  // frost, where nearly every night of the season freezes, isn't news
  assert.ok(climateOn(north, DAY0).frost >= 0.8 && climateOn(compactClimate(fakeArchive()), DAY0).frost < 0.2);
  const frosty = (climate) => I.insights(makeWx((i) => (i >= 24 && i < 31 ? { temp: -3, feels: -5 } : {}), { extra: { climate } }), now, f);
  assert.equal(card(frosty(north), "frost"), undefined);
  assert.equal(card(frosty(compactClimate(fakeArchive())), "frost").title, "Frost");
  // 36 mm in a day: heavy rain somewhere it's rarely that wet, not where it often is
  const wet = climateLike({ summer: 30, winter: 25, night: 24, cold: 20, rain: 30 }), soaked = (climate) => I.insights(makeWx((i) => (i >= 12 && i < 36 ? { precip: 1.5, code: 63, pop: 90 } : {}), { extra: { climate } }), DAY0 + 9 * H, f);
  assert.ok(I.limitsHere({ climate: wet }).heavyDay > 36);
  assert.equal(card(soaked(wet), "heavyrain"), undefined);
  assert.equal(card(soaked(compactClimate(fakeArchive())), "heavyrain").title, "Heavy rain");
  assert.equal(card(soaked(null), "heavyrain").title, "Heavy rain", "and without a climate yet");
});
test("the umbrella: needed, maybe, and nothing to say when it's dry", () => {
  const now = DAY0 + 9 * H;
  assert.equal(card(I.insights(makeWx((i) => (i === 17 ? { precip: 2, code: 63, pop: 80 } : {})), now, f), "umbrella").title, "Take an umbrella");
  assert.equal(card(I.insights(makeWx((i) => (i === 17 ? { pop: 35 } : {})), now, f), "umbrella").title, "Maybe an umbrella");
  // (rain in the forecast, but a coin toss: a maybe, by the odds it gives)
  const toss = card(I.insights(makeWx((i) => (i === 17 ? { precip: 2, code: 63, pop: 48 } : {})), now, f), "umbrella");
  assert.deepEqual([toss.title, toss.short], ["Maybe an umbrella", "Rain this afternoon (48%)"]);
  assert.equal(card(I.insights(makeWx(), now, f), "umbrella"), undefined);
  // late in the evening it's about tomorrow
  assert.match(card(I.insights(makeWx((i) => (i === 24 + 15 ? { precip: 2, code: 63, pop: 80 } : {})), DAY0 + 21 * H, f), "umbrella").text, /tomorrow/);
});
test("the commute card looks at the next commute on a working day", () => {
  const wx = makeWx((i) => (i === 17 ? { precip: 1.5, code: 63, pop: 85 } : {}));
  const c = card(I.insights(wx, DAY0 + 9 * H, f, { commute: { on: true, am: "08:00", pm: "17:30" } }), "commute");
  assert.equal(c.title, "Your 17:30 commute"); assert.match(c.text, /^Rain \(1\.5 mm\)/);
  // Saturday: no commute
  const sat = makeWx(); sat.daily.forEach((d) => {});
  assert.equal(card(I.insights(sat, DAY0 + 5 * D + 9 * H, f, { commute: { on: true, am: "08:00", pm: "17:30" } }), "commute"), undefined);
});

/* ---------- how sure ---------- */
test("confidence: models that agree, and ones that don't", () => {
  const wx = makeWx();
  const day = (k) => keyOf(DAY0 + k * D);
  wx.models = { list: [], days: {
    [day(1)]: [14, 14.5, 13.8, 14.2, 14.1, 14.3].map((tmax) => ({ tmax, precip: 0 })),
    [day(2)]: [10, 17, 12, 15, 11, 16].map((tmax, k) => ({ tmax, precip: k % 2 ? 6 : 0 })),
  } };
  wx.ensemble = { days: { [day(1)]: { tmaxP10: 13.5, tmaxP90: 14.8, wet: 0.02 }, [day(2)]: { tmaxP10: 9, tmaxP90: 17, wet: 0.5 } }, hourly: [] };
  const c = I.confidence(wx);
  assert.equal(c[day(1)].level, "high"); assert.equal(c[day(2)].level, "low");
  assert.equal(c[day(2)].wetModels, 3);
  const cards = I.insights(wx, DAY0 + 9 * H, f);
  assert.equal(card(cards, "confidence").title, "Wednesday is uncertain");
  assert.match(card(cards, "confidence").text, /^Highs anywhere from 9° to 17° and 3 of 6 models bring rain\. Check back nearer the time\.$/);
  // all agreed: nothing to say (that's what a forecast should be)
  wx.models.days[day(2)] = wx.models.days[day(1)]; wx.ensemble.days[day(2)] = wx.ensemble.days[day(1)];
  assert.equal(card(I.insights(wx, DAY0 + 9 * H, f), "confidence"), undefined);
});

/* ---------- context ---------- */
test("only what's worth knowing today: not the daylight, the best model, the same as yesterday or no change", () => {
  // (the Sun card says the daylight; the accuracy card which model's best; the tiles the pressure and the UV)
  const wx = makeWx((i) => (i >= 12 && i < 15 ? { uv: 4 } : {}));
  wx.skill = { skill: { days: 30, models: [{ name: "ECMWF", hiMae: 0.7, hiBias: 0 }, { name: "GFS", hiMae: 1.4, hiBias: 1.2 }] }, station: { name: "Heathrow" } };
  wx.air = { current: { eaqi: 12 }, hourly: [] };
  const c = I.insights(wx, DAY0 + 9 * H, f, { prev: { ...I.snapshot(wx, DAY0 + 3 * H), at: DAY0 + 3 * H } });
  assert.deepEqual(ids(c).filter((x) => ["daylight", "skill", "vs", "changes", "air", "uv", "pressure", "umbrella"].includes(x)), [], ids(c).join());
  for (const x of c) assert.ok(!/much the same|Shorter days|Most accurate|No big changes|Fresh air|Moderate UV|High pressure|No umbrella/.test(x.title), x.title);
});
test("one row a thing: the umbrella and the week's worst day the same wet day, as one", () => {
  // today: rain from noon, gusts to 47 km/h (not enough for a wind row of their own); Friday fine
  const wx = makeWx((i) => (i >= 12 && i < 22 ? { precip: 2, code: 63, pop: 90, gust: 47, sun: 0, cloud: 100 } : Math.floor(i / 24) === 4 ? { cloud: 5, sun: 3600, temp: 19, feels: 19, gust: 15 } : {}));
  const c = I.insights(wx, DAY0 + 9 * H, f), u = card(c, "umbrella");
  assert.equal(card(c, "worstday"), undefined, ids(c).join());
  assert.deepEqual([u.title, u.short, u.act, u.day], ["Today: wet and windy", "Rain from 12:00, gusts 29 mph", "Take an umbrella", keyOf(DAY0)]);
  assert.match(u.text, /^Rain likely this afternoon \(90% chance\), about 20 mm in all\. Gusts to 29 mph\. The worst day of the week: one to plan indoors\.$/);
  // gusts with a row of their own: not said again here
  const gale = makeWx((i) => (i >= 12 && i < 22 ? { precip: 2, code: 63, pop: 90, gust: i === 15 ? 70 : 47, sun: 0, cloud: 100 } : Math.floor(i / 24) === 4 ? { cloud: 5, sun: 3600, temp: 19, feels: 19, gust: 15 } : {}));
  const g = I.insights(gale, DAY0 + 9 * H, f);
  assert.deepEqual([card(g, "umbrella").title, card(g, "umbrella").short, card(g, "wind").title], ["Today: a wet day", "Rain from 12:00 (90%)", "Gales"]);
  // the worst day another day: two rows, as before
  const later = I.insights(makeWx((i) => (i === 17 ? { precip: 2, code: 63, pop: 80 } : Math.floor(i / 24) === 2 ? { precip: 2, code: 63, pop: 90, gust: 60, sun: 0, cloud: 100 } : Math.floor(i / 24) === 4 ? { cloud: 5, sun: 3600, temp: 19, feels: 19, gust: 15 } : {})), DAY0 + 9 * H, f);
  assert.deepEqual([card(later, "umbrella").title, card(later, "worstday").title], ["Take an umbrella", "Worst day: Wednesday"]);
});

test("warmer than yesterday, a trend coming, the barometer falling", () => {
  const wx = makeWx((i, t) => {
    const k = Math.floor(i / 24);
    return { temp: (k < 0 ? 8 : k < 4 ? 14 : 6) + (i % 24 === 14 ? 1 : 0), pressure: i >= 6 && i <= 9 ? 1015 - (i - 6) * 2 : 1015 };
  });
  const c = I.insights(wx, DAY0 + 9 * H, f);
  assert.equal(card(c, "vs").title, "Today: warmer"); assert.match(card(c, "vs").text, /^Peaks at \d+°, 7° warmer than yesterday/);
  assert.equal(card(c, "trend").title, "Turning colder"); assert.match(card(c, "trend").text, /^From Friday, highs drop from around 15° to 7°/);
  assert.equal(card(c, "pressure").title, "Pressure falling fast");
});
test("the best and worst days, and the weekend", () => {
  const wx = makeWx((i) => {
    const k = Math.floor(i / 24);
    return k === 2 ? { precip: 2, code: 63, pop: 90, gust: 60, sun: 0, cloud: 100 } : k === 4 ? { cloud: 5, sun: 3600, temp: 19, feels: 19, gust: 15 } : {};
  });
  const c = I.insights(wx, DAY0 + 9 * H, f);
  assert.equal(card(c, "bestday").title, "Best day: Friday");
  assert.equal(card(c, "worstday").title, "Worst day: Wednesday");
  assert.match(card(c, "worstday").text, /48 mm of rain and gusts to 37 mph/);
  assert.match(card(c, "weekend").text, /^Saturday: .*Sunday: /);
  // the week's best day on the weekend: said once, not again as the weekend's better day
  const sunny = I.insights(makeWx((i) => {
    const k = Math.floor(i / 24);
    return k === 2 ? { precip: 2, code: 63, pop: 90, gust: 60, sun: 0, cloud: 100 } : k === 6 ? { cloud: 5, sun: 3600, temp: 19, feels: 19, gust: 15 } : {};
  }), DAY0 + 9 * H, f);
  assert.equal(card(sunny, "bestday").title, "Best day: Sunday");
  assert.equal(card(sunny, "weekend"), undefined);
});
test("since you last looked: the biggest changes, in words", () => {
  const wx = makeWx(), now = DAY0 + 15 * H;
  const prev = I.snapshot(wx, now - 6 * H);
  prev.at = now - 6 * H;
  prev.daily[2] = { ...prev.daily[2], popMax: 80 };
  prev.daily[3] = { ...prev.daily[3], tmax: prev.daily[3].tmax - 4 };
  const c = I.changes(prev, wx, now, f);
  assert.equal(c.title, "Since you last looked");
  assert.match(c.text, /^Compared with earlier today \(09:00\): Wednesday looks drier \(rain chance 80% → 5%\) and Thursday is now 4° warmer/);
  assert.equal(I.changes({ ...prev, at: now - H }, wx, now, f), null, "too soon to compare");
  // (a day named mid-line: "and tomorrow", not "and Tomorrow")
  const soon = { ...prev, daily: prev.daily.map((d, k) => (k === 1 ? { ...d, tmax: d.tmax - 4 } : k === 3 ? { ...d, tmax: d.tmax + 4 } : d)) };
  assert.match(I.changes(soon, wx, now, f).text, /: Wednesday looks drier \(rain chance 80% → 5%\) and tomorrow is now 4° warmer/);
  assert.equal(I.changes(I.snapshot(wx, now - 6 * H), wx, now, f), null, "no change: nothing to say");
});

/* ---------- the best times ---------- */
test("windows: a run avoids the rain, the washing needs a dry spell, the sunset needs high cloud", () => {
  const wx = makeWx((i, t, hh) => (i >= 9 && i < 13 ? { precip: 2, code: 63, pop: 90 } : i >= 13 && i < 24 ? { cloud: 10, cloudLow: 0, cloudMid: 30, cloudHigh: 50, vpd: 1.2, wind: 15, sun: 3600 } : {}));
  const w = Object.fromEntries(I.windows(wx, DAY0 + 9.5 * H, f).map((x) => [x.id, x]));
  assert.ok(w.run.start >= DAY0 + 13 * H, f.time(w.run.start));
  assert.ok(w.laundry.start >= DAY0 + 13 * H && w.laundry.rating !== "Poor");
  assert.equal(w.sunset.name, "Sunset colour"); assert.ok(w.sunset.score >= 0.75, String(w.sunset.score));
  assert.equal(w.sunset.text, "High cloud to catch the light");     // (the card shows when, above it)
  assert.equal(I.sunsetScore({ precip: 3, code: 63, pop: 90 }), 0.05);
});
test("dayScore: a sunny calm mild day beats a wet windy one", () => {
  const nice = { daylight: 40000, sunshine: 36000, precip: 0, precipHours: 0, gustMax: 20, fmax: 21 };
  const nasty = { daylight: 40000, sunshine: 0, precip: 25, precipHours: 14, gustMax: 80, fmax: 6 };
  assert.ok(I.dayScore(nice) >= 90); assert.ok(I.dayScore(nasty) <= 15);
});

test("each insight has a line that fits its row (the whole of it only when it's short)", () => {
  const now = DAY0 + 10 * H, seen = new Map();
  const scenarios = [
    makeWx(),
    makeWx((i) => (i >= 14 && i < 17 ? { precip: 1.5, code: 61, pop: 80 } : {})),
    makeWx((i) => (i >= 20 && i < 26 ? { precip: 0.3, code: 51, pop: 40 } : {})),
    makeWx((i, t, hh) => (i >= 24 && i < 48 && hh < 7 ? { temp: -3, feels: -7, cloud: 0, wind: 2, gust: 4 } : {})),
    makeWx((i) => (i >= 37 && i < 40 ? { gust: 85, wind: 50 } : i >= 30 && i < 34 ? { precip: 6, code: 65, pop: 95 } : {})),
    makeWx((i, t, hh) => (i < 24 && hh >= 11 && hh <= 16 ? { temp: 33, feels: 36, uv: 9 } : {})),
    makeWx((i, t, hh) => (i >= 24 && i < 48 && hh >= 4 && hh < 9 ? { vis: 300, code: 45 } : i >= 50 && i < 60 ? { snow: 1.2, precip: 1.2, code: 73, temp: -1, feels: -5 } : {})),
    makeWx((i) => ({ pressure: 1015 - Math.max(-4, i - 6) * 1.5 })),
    makeWx((i) => (i >= 96 ? { temp: 22, feels: 22 } : {})),
  ];
  for (const wx of scenarios) {
    const prev = { at: now - 26 * H, daily: wx.daily.slice(1, 8).map((d, k) => ({ key: d.key, tmax: d.tmax + (k === 2 ? 4 : 0), tmin: d.tmin, popMax: k === 3 ? 90 : d.popMax, precip: d.precip })) };
    for (const c of I.insights(wx, now, f, { prev, commute: { am: "08:00", pm: "17:30" } })) if (!seen.has(`${c.id}|${c.title}`)) seen.set(`${c.id}|${c.title}`, c);
  }
  if (process.env.SHOW) for (const c of seen.values()) console.log(`${c.id.padEnd(10)} ${String(c.short ?? "").padEnd(34)} | ${c.text}`);
  assert.ok(seen.size >= 15, `${seen.size} kinds seen`);
  for (const c of seen.values()) {
    // (about 34 characters fit beside the icon on a phone)
    if (c.text.length > 34) assert.ok(c.short, `${c.id} (${c.title}): a short line for "${c.text}"`);
    if (c.short) assert.ok(c.short.length <= 32 && !/\.$/.test(c.short), `${c.id}: "${c.short}" (${c.short.length})`);
  }
});
