// Official warnings: the server's reading of MeteoAlarm's and the National Weather Service's feeds
// (functions/_wxwarn.js), and how the app says them (weather/official.js), on the stand-in feeds the
// end-to-end test uses too (mocks/wxwarnings.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { polygon, inside, shapeMeteoalarm, shapeNws, warningsAt, simplify } from "../../../functions/_wxwarn.js";
import { inForce, colourOf, titleOf, badgeOf, spanOf, glyphOf, covered } from "../../../weather/official.js";
import { briefing } from "../../../weather/alerts.js";
import { makeFormat } from "../../../weather/format.js";
import { ukFeed, nwsAlerts, NEW_YORK } from "../mocks/wxwarnings.mjs";

const H = 3600e3, f = makeFormat({});
const NOW = Date.UTC(2026, 9, 19, 9, 0);          // a Monday, 09:00 UTC

test("a warning's drawn area, and whether a place is in it", () => {
  const sq = polygon("51.3,-0.5 51.3,0.3 51.7,0.3 51.7,-0.5 51.3,-0.5");
  assert.deepEqual(sq.b, [51.3, -0.5, 51.7, 0.3]);
  assert.ok(inside(51.51, -0.13, sq), "London's in it");
  assert.ok(!inside(51.45, -2.59, sq) && !inside(51.8, -0.13, sq), "Bristol and Luton aren't");
  // a concave one (an L): its notch is outside
  const ell = polygon("0,0 0,2 1,2 1,1 2,1 2,0 0,0");
  assert.ok(inside(0.5, 1.5, ell) && inside(1.5, 0.5, ell) && !inside(1.5, 1.5, ell));
  assert.equal(polygon("51,0 52,1"), null, "too few points");
  assert.equal(polygon("51,0 52,x 53,1 51,0"), null, "not numbers");
  assert.equal(polygon("91,0 52,1 53,1 91,0"), null, "off the globe");
});

test("MeteoAlarm: only what's in force or to come, yellow and up, with a drawn area, and not replaced", () => {
  const list = shapeMeteoalarm(ukFeed(NOW), NOW);
  assert.deepEqual(list.map((w) => w.id), ["ldn-rain", "ldn-storm", "brs-wind", "brs-wind-again"], "not the one over, the green one, the cancelled one, the replaced one or the one without a map");
  const rain = list[0];
  assert.equal(rain.issuer, "Met Office"); assert.equal(rain.via, "MeteoAlarm"); assert.equal(rain.level, 2); assert.equal(rain.type, 10);
  assert.equal(rain.event, "Yellow rain warning"); assert.equal(rain.impacts.length, 2); assert.match(rain.url, /^https:\/\/www\.metoffice\.gov\.uk\//);
  assert.equal(list[1].level, 3);
  assert.deepEqual(shapeMeteoalarm(null), []); assert.deepEqual(shapeMeteoalarm({ warnings: [{}, { alert: { status: "Actual", msgType: "Alert", info: [] } }] }), []);
  // the English one of several languages; capitals calmed; a link that isn't one dropped
  const multi = shapeMeteoalarm({ warnings: [{ alert: { identifier: "m", status: "Actual", msgType: "Alert", info: [
    { language: "no", event: "Kraftige vindkast", expires: new Date(NOW + H).toISOString(), parameter: [{ valueName: "awareness_level", value: "2; yellow; Moderate" }], area: [{ polygon: ["60,10 60,11 61,11 60,10"] }] },
    { language: "en-GB", event: "COASTAL EVENT", senderName: "MET Norway", web: "javascript:alert(1)", expires: new Date(NOW + H).toISOString(), parameter: [{ valueName: "awareness_level", value: "2; yellow; Moderate" }], area: [{ polygon: ["60,10 60,11 61,11 60,10"] }] },
  ] } }] }, NOW);
  assert.equal(multi[0].event, "Coastal event"); assert.equal(multi[0].issuer, "MET Norway"); assert.equal(multi[0].url, null);
  // a machine's headline (MET Norway's: the event, its level, the area and two timestamps): the description's first sentence
  // instead, or the headline without its dates; and long text cut at a word
  const said = (headline, description, impacts = []) => shapeMeteoalarm({ warnings: [{ alert: { identifier: "h", status: "Actual", msgType: "Alert", info: [{ language: "en-GB", event: "Strong wind gusts", headline, description,
    expires: new Date(NOW + H).toISOString(), parameter: [{ valueName: "awareness_level", value: "2; yellow; Moderate" }, ...impacts.map((value) => ({ valueName: "impacts", value }))], area: [{ polygon: ["60,10 60,11 61,11 60,10"] }] }] } }] }, NOW)[0];
  assert.equal(said("Strong wind gusts, yellow level, Troms, 2026-10-19T04:00:00+00:00, 2026-10-19T19:00:00+00:00", "locally strong wind gusts around 27-33 m/s. The wind will ease.").headline, "Locally strong wind gusts around 27-33 m/s.");
  assert.equal(said("Flood warning yellow level for Troms 2026-10-19", "").headline, "Flood warning yellow level for Troms");
  assert.equal(said("Heavy rain may lead to flooding.", "Rain will turn heavy.").headline, "Heavy rain may lead to flooding.", "a person's headline stays");
  const long = said("x", "", ["Roads may be closed, and there could be a lot of water on the road, especially near streams and rivers. ".repeat(10)]).impacts[0];
  assert.ok(long.length <= 700 && long.endsWith("…") && /\s\S+…$/.test(long) && !/\b(ri|stre)…$/.test(long), long.slice(-40));
});

test("the National Weather Service: in force, real and not cancelled; linked to the point's own page", () => {
  const list = shapeNws(nwsAlerts(NOW), 40.71, -74.01, NOW);
  assert.deepEqual(list.map((w) => w.id), ["nws-1"]);
  assert.equal(list[0].issuer, "National Weather Service"); assert.equal(list[0].via, null);
  assert.equal(list[0].headline, "West winds 20 to 30 mph with gusts up to 50 mph.", "what's coming, from its description, not its headline in capitals");
  assert.equal(shapeNws({ features: [{ properties: { ...nwsAlerts(NOW).features[0].properties, description: "Fog this morning." } }] }, 1, 2, NOW)[0].headline, nwsAlerts(NOW).features[0].properties.headline);
  assert.equal(list[0].url, "https://forecast.weather.gov/MapClick.php?lat=40.71&lon=-74.01");
});

test("an outline made light for the map: its shape kept, its points fewer, to 3 places", () => {
  // a circle of 400 points, a little rough
  const p = [];
  for (let k = 0; k <= 400; k++) { const a = (k / 400) * 2 * Math.PI, r = 0.5 + (k % 2 ? 0.0004 : 0); p.push(51.5 + r * Math.sin(a), -0.1 + r * 1.6 * Math.cos(a)); }
  const s = simplify(p);
  assert.ok(s.length / 2 <= 120 && s.length / 2 >= 20, `${s.length / 2} points`);
  assert.ok(s.every((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6), "to 3 decimal places");
  assert.deepEqual(s.slice(0, 2), s.slice(-2), "still closed");
  assert.ok(inside(51.5, -0.1, polygon(Array.from({ length: s.length / 2 }, (_, i) => `${s[2 * i]},${s[2 * i + 1]}`).join(" "))), "its middle still in it");
  assert.deepEqual(simplify([1, 2, 3, 4, 5, 6, 1, 2]), [1, 2, 3, 4, 5, 6, 1, 2], "a few points: as they are");
});
test("warnings for a place: from the feeds that cover it, worst first, each with its areas made light", async () => {
  const asked = [], real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const u = new URL(url);
    if (u.pathname === "/api/v1/warnings/feeds-united-kingdom") return new Response(JSON.stringify(ukFeed(NOW)), { status: 200 });
    if (u.pathname === "/alerts/active") return u.searchParams.get("point") === NEW_YORK ? new Response(JSON.stringify(nwsAlerts(NOW)), { status: 200 }) : new Response("{}", { status: 400 });
    return new Response("{}", { status: 404 });
  };
  try {
    const env = { METEOALARM_URL: "http://ma.test", NWS_URL: "http://nws.test" };
    const london = await warningsAt(env, 51.51, -0.13, NOW);
    assert.deepEqual(london.warnings.map((w) => w.id), ["ldn-storm", "ldn-rain"], "the amber one first");
    assert.ok(london.warnings.every((w) => !("polys" in w) && w.areas?.length >= 1 && w.areas.every((r) => r.length >= 8 && r.length <= 240)), "its areas, made light, for the map (not as the feed had them)");
    const ny = (await warningsAt(env, 40.71, -74.01, NOW)).warnings[0];
    assert.ok(ny.areas?.length === 1 && ny.areas[0][0] === 40.68 && ny.areas[0][1] === -74.06, `the Weather Service's drawn area: ${JSON.stringify(ny.areas)}`);
    assert.deepEqual((await warningsAt(env, 51.45, -2.59, NOW)).warnings.map((w) => w.id), ["brs-wind"], "the one issued twice, once");
    assert.deepEqual((await warningsAt(env, 40.71, -74.01, NOW)).warnings.map((w) => w.id), ["nws-1"]);
    asked.length = 0;
    assert.deepEqual(await warningsAt(env, 52.52, 13.4, NOW), { warnings: [] }, "Berlin: no feed with drawn areas");
    assert.equal(asked.length, 0, "and nothing asked");
    // outside the Weather Service's map (Toronto's in its box): none
    assert.deepEqual(await warningsAt(env, 43.65, -79.38, NOW), { warnings: [] });
    // every source down: an error, so the phone keeps the warnings it had (not told there are none)
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(warningsAt(env, 51.51, -0.13, NOW), (e) => e.status === 502);
  } finally { globalThis.fetch = real; }
});

// One of a place's sources down (England: MeteoAlarm's feed answers, the Environment Agency's doesn't): what the others
// say, each warning with its source, and which didn't answer, so the phone keeps what it had from that one; and a feed
// asked for by several of a tick's places at once, asked for once
test("one source down: the rest as they are, and which didn't answer, so the phone keeps what it had from it", async () => {
  const { keptWarnings } = await import("../../../weather/data.js");
  const real = globalThis.fetch, asked = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    asked.push(u.pathname);
    await new Promise((ok) => setTimeout(ok, 10));
    if (u.pathname === "/api/v1/warnings/feeds-united-kingdom") return new Response(JSON.stringify(ukFeed(NOW)), { status: 200 });
    return new Response("", { status: 503 });
  };
  try {
    const env = { METEOALARM_URL: "http://ma.test", NWS_URL: "http://nws.test", EA_URL: "http://ea.test" };
    const tick = new Map(), [london, bristol] = await Promise.all([warningsAt(env, 51.51, -0.13, NOW, tick), warningsAt(env, 51.45, -2.59, NOW, tick)]);
    assert.deepEqual(london.warnings.map((w) => w.id), ["ldn-storm", "ldn-rain"]);
    assert.ok(london.warnings.every((w) => w.src === "meteoalarm:united-kingdom"));
    assert.deepEqual(london.missing, ["floods"]); assert.deepEqual(bristol.missing, ["floods"]);
    assert.equal(asked.filter((p) => p === "/api/v1/warnings/feeds-united-kingdom").length, 1, "the feed asked for once for both");
    // (but not between requests: each a phone's, which can't wait on another's fetch)
    await Promise.all([warningsAt(env, 51.51, -0.13, NOW), warningsAt(env, 51.45, -2.59, NOW)]);
    assert.equal(asked.filter((p) => p === "/api/v1/warnings/feeds-united-kingdom").length, 3, "each phone's asks for it (the cache, where there is one, answering)");
    // the phone: what it had from the floods kept (while in force), what it had from MeteoAlarm as MeteoAlarm says now
    const flood = { id: "ea-x-2", src: "floods", level: 3, event: "Flood warning", onset: new Date(NOW - H).toISOString(), expires: null, open: true, checked: new Date(NOW - H).toISOString() };
    const was = { warnings: [flood, { id: "ldn-old", src: "meteoalarm:united-kingdom", level: 2, onset: new Date(NOW - 2 * H).toISOString(), expires: new Date(NOW + H).toISOString() },
      { id: "ea-over", src: "floods", level: 2, onset: new Date(NOW - 9 * H).toISOString(), expires: new Date(NOW - H).toISOString() }] };
    const kept = keptWarnings(london, was, NOW);
    assert.deepEqual(kept.warnings.map((w) => w.id), ["ea-x-2", "ldn-storm", "ldn-rain"], "the flood warning kept, among the rest worst first, then soonest; not MeteoAlarm's old one, nor one that's over");
    assert.equal(keptWarnings({ warnings: london.warnings }, was, NOW).warnings.length, 2, "all of them answering: as they say");
  } finally { globalThis.fetch = real; }
});

test("how the app says them: colour, title, badge, when, icon", () => {
  const [rain, storm, wind] = shapeMeteoalarm(ukFeed(NOW), NOW);
  assert.equal(colourOf(rain), "yellow"); assert.equal(colourOf(storm), "amber");
  assert.equal(colourOf({ level: 3, issuer: "SMHI", event: "Storm" }), "orange", "MeteoAlarm's orange where the issuer doesn't say amber");
  assert.equal(colourOf({ level: 4, event: "Hurricane Warning" }), "red");
  assert.equal(titleOf(rain), "Rain warning"); assert.equal(titleOf({ event: "strong wind gusts" }), "Strong wind gusts");
  assert.equal(badgeOf(storm), "Amber"); assert.equal(badgeOf({ via: null, event: "Wind Advisory", level: 2 }), null, "the US names its kinds instead");
  assert.equal(glyphOf(rain), "rain"); assert.equal(glyphOf(storm), "storm"); assert.equal(glyphOf(wind), "wind");
  assert.equal(glyphOf({ event: "Winter Storm Warning" }), "snow"); assert.equal(glyphOf({ event: "Freeze Warning" }), "frost"); assert.equal(glyphOf({ event: "Something else" }), "warning");
  // on the place's clock (London in October: an hour ahead of UTC)
  const wall = NOW + 3600e3;
  assert.equal(spanOf(rain, wall, f, 3600), "Until 15:00");
  assert.equal(spanOf(storm, wall, f, 3600), "Tomorrow 13:00 to 22:00");
  assert.equal(spanOf({ onset: new Date(NOW + 10 * H).toISOString(), expires: new Date(NOW + 20 * H).toISOString() }, wall, f, 3600), "Today 20:00 to tomorrow 06:00");
  assert.equal(spanOf({ onset: new Date(NOW - H).toISOString(), expires: new Date(NOW + 30 * H).toISOString() }, wall, f, 3600), "Until tomorrow 16:00");
  assert.equal(inForce([rain, { expires: new Date(NOW - 1).toISOString() }], NOW).length, 1);
  // the app's own warnings an official one says already: wind (in force), not the thunderstorm two days off
  assert.deepEqual([...covered([wind, rain], NOW)].sort(), ["rain", "wind"]);
  assert.deepEqual([...covered([storm], NOW - 30 * H)], [], "a thunderstorm warning a day and a half off doesn't stand in for today's");
});

test("the morning briefing says the official warning, and not the app's own on the same thing", () => {
  const D = 864e5, DAY0 = Date.UTC(2026, 9, 19);
  const hourly = [], daily = [];
  for (let i = 0; i < 72; i++) hourly.push({ t: DAY0 - D + i * H, temp: 12, feels: 11, precip: 0, pop: 5, code: 3, gust: i === 34 ? 80 : 20, wind: 15, dir: 240, cloud: 80, isDay: true, uv: 1, vis: 20000, rh: 70, dew: 6, pressure: 1012 });
  for (let k = 0; k < 3; k++) daily.push({ key: new Date(DAY0 + (k - 1) * D).toISOString().slice(0, 10), date: DAY0 + (k - 1) * D, tmax: 14, tmin: 8, code: 3, precip: 0, gustMax: k === 1 ? 80 : 20, sunrise: DAY0 + (k - 1) * D + 7 * H, sunset: DAY0 + (k - 1) * D + 18 * H });
  const wx = { place: { name: "Bristol", offset: 0 }, current: hourly[31], minutely: [], hourly, daily, models: null };
  const now = DAY0 + 7 * H;
  assert.match(briefing(wx, now, f).body, /Warning: (damaging gusts|gales)/i, "without an official one: the app's own");
  wx.official = shapeMeteoalarm(ukFeed(now), now).filter((w) => w.id === "brs-wind");
  const b = briefing(wx, now, f).body;
  assert.match(b, /Met Office: yellow wind warning until 15:00\./);
  assert.doesNotMatch(b, /Warning: (damaging gusts|gales)/i, "the app's own gales warning stands aside");
});

// A warning as it's issued: told once, the worst first; a warning raised (yellow to amber) told again; reissued or
// downgraded, not; yellow ones held over the quiet hours; turned on with warnings in force, those taken as told
test("warning notifications: new or raised, once each, yellow not overnight", async () => {
  const { warningAlert } = await import("../../../weather/alerts.js");
  const iso = (t) => new Date(t).toISOString();
  const w = (id, level, event, more = {}) => ({ id, level, event, via: "MeteoAlarm", issuer: "Met Office", type: 1, onset: iso(NOW - H), expires: iso(NOW + 12 * H), headline: "Gusts of 50 to 60 mph.", ...more });
  const day = NOW, night = Date.UTC(2026, 9, 19, 23, 30);
  // just turned on: what's in force is taken as told, nothing sent
  let r = warningAlert([w("a", 2, "Yellow wind warning")], null, day, day, f, 0, "London");
  assert.equal(r.alert, null); assert.deepEqual(Object.keys(r.told), ["a"]);
  // the same again: nothing
  r = warningAlert([w("a", 2, "Yellow wind warning")], r.told, day, day, f, 0, "London");
  assert.equal(r.alert, null);
  // raised to amber (a new warning of the same, replacing it): told, as raised
  let told = r.told;
  r = warningAlert([w("b", 3, "Amber wind warning")], told, day, day, f, 0, "London");
  assert.equal(r.alert.title, "Raised to amber: wind warning"); assert.equal(r.alert.tag, "warn:wind", "tagged by what it's of: a raise takes the yellow one's place");
  assert.match(r.alert.body, /^London: Met Office · Until 21:00\. Gusts of 50 to 60 mph\.$/);
  // and back down to yellow, or the amber reissued: not news
  told = r.told;
  assert.equal(warningAlert([w("c", 2, "Yellow wind warning")], told, day, day, f, 0, "London").alert, null);
  assert.equal(warningAlert([w("b2", 3, "Amber wind warning")], told, day, day, f, 0, "London").alert, null);
  // something new besides: the worst said, and how many more
  r = warningAlert([w("b", 3, "Amber wind warning"), w("d", 2, "Yellow rain warning", { type: 10 }), w("e", 4, "Red snow warning", { type: 2 })], told, day, day, f, 0, "London");
  assert.equal(r.alert.title, "Red snow warning"); assert.match(r.alert.body, /\(and 1 more\)$/);
  assert.equal(r.alert.tag, "warn:ice", "and something else, alongside the wind one, not in its place");
  // overnight: a new yellow one waits for the morning (not taken as told), an amber one doesn't wait
  const quiet = warningAlert([w("f", 2, "Yellow fog warning", { type: 4, expires: iso(night + 12 * H) })], {}, night, night, f, 0, "");
  assert.equal(quiet.alert, null); assert.equal(quiet.told.f, undefined, "left to tell in the morning");
  assert.equal(warningAlert([w("f", 2, "Yellow fog warning", { type: 4 })], quiet.told, day, day, f, 0, "").alert.title, "Yellow fog warning");
  assert.equal(warningAlert([w("g", 3, "Amber wind warning", { expires: iso(night + 6 * H) })], {}, night, night, f, 0, "").alert.title, "Amber wind warning");
  // the US's, named by kind: a Watch become a Warning is said by its new name
  const nws = (id, level, event) => ({ id, level, event, via: "NWS", issuer: "NWS New York NY", onset: iso(NOW), expires: iso(NOW + 6 * H) });
  const t1 = warningAlert([nws("n1", 2, "Flood Watch")], null, day, day, f, 0, "").told;
  assert.equal(warningAlert([nws("n2", 3, "Flood Warning")], t1, day, day, f, 0, "").alert.title, "Flood Warning");
  // what's told of is let go once it's over
  const old = { gone: [3, "wind", NOW - H] };
  assert.equal(warningAlert([], old, day, day, f, 0, "").told.gone, undefined);
});

// Weather's emails (functions/_wxpush.js sends them): the briefing with the day's parts, its figures and the warning in
// force as a notice; a warning in its issuer's words, raised from which colour, and how many more; both in the site's
// email (functions/_email.js), its notice and strip in the words of the plain-text copy too
test("the briefing and a warning as emails", async () => {
  const { briefMail, warningMail, warningAlert } = await import("../../../weather/alerts.js");
  const { emailBody } = await import("../../../functions/_email.js");
  const D = 864e5, DAY0 = Date.UTC(2026, 9, 19), iso = (t) => new Date(t).toISOString();
  const hourly = [], daily = [];
  // a dry morning, rain in the afternoon (3 mm), dry again by evening
  for (let i = 0; i < 72; i++) { const h = i % 24, wet = i >= 24 + 13 && i < 24 + 16;
    hourly.push({ t: DAY0 - D + i * H, temp: 8 + Math.min(h, 14) / 2, feels: 8, precip: wet ? 1 : 0, pop: wet ? 80 : 5, code: wet ? 63 : 2, gust: 30, wind: 15, dir: 240, cloud: 50, isDay: h >= 7 && h < 18, uv: 1, vis: 20000, rh: 70, dew: 6, pressure: 1012 }); }
  for (let k = 0; k < 3; k++) daily.push({ key: new Date(DAY0 + (k - 1) * D).toISOString().slice(0, 10), date: DAY0 + (k - 1) * D, tmax: 15, tmin: 7, code: 63, precip: 3, popMax: 80, windMax: 18, gustMax: 32, dir: 240, sunrise: DAY0 + (k - 1) * D + 7 * H + 31 * 60e3, sunset: DAY0 + (k - 1) * D + 17 * H + 49 * 60e3 });
  const wx = { place: { name: "Bristol", offset: 0 }, current: hourly[31], minutely: [], hourly, daily, models: null };
  const now = DAY0 + 7 * H;
  wx.official = shapeMeteoalarm(ukFeed(now), now).filter((w) => w.id === "brs-wind");
  const m = briefMail(wx, now, f);
  assert.equal(m.pill[1], "Bristol · Monday 19 October");
  assert.equal(m.subject, "Bristol: Yellow wind warning · 15°", "the subject: the warning first");
  assert.deepEqual(m.lines, ["Rain from about 12:00 to 15:00, then sunny spells. High 15°."], "the rain by the clock");
  assert.equal(m.asOf, "Forecast at 07:00");
  assert.deepEqual(m.notice, { tone: "yellow", lead: "Yellow wind warning", text: "until 15:00 · Met Office" });
  // each part its rain (when it starts, or dry), and its high (the evening its low)
  assert.deepEqual(m.strip.map(([part, , temp, rain]) => `${part} ${temp} ${rain}`), ["Morning 14° Dry", "Afternoon 15° Rain 12:00", "Evening 15° Dry"]);
  assert.equal(m.strip[1][1], "rain", "the afternoon's picture: rain");
  assert.equal(m.bar.levels.join(""), "0".repeat(24) + "2".repeat(12) + "0".repeat(36), "the day's rain by the quarter hour from 06:00: light, 12:00 to 15:00");
  assert.deepEqual(m.bar.labels, ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]);
  assert.deepEqual(m.rows.map(([k, v]) => `${k}: ${v}`), ["High, low: 15° · 7°", "Rain: 3 mm, mostly afternoon", "Wind: WSW 11, gusts 20 mph", "Sun: Up 07:31 · down 17:49", "Tomorrow: 15° · 7°, sunny spells"]);
  const { html, text } = emailBody({ brand: "weather", ...m, strip: m.strip.map(([p, i, t, r]) => [p, `wx-${i}`, t, r]) });
  assert.match(html, /mail\/g-warn-yellow\.png/); assert.match(html, /mail\/wx-rain\.png/); assert.match(html, /<b>Yellow wind warning<\/b> until 15:00 · Met Office/);
  assert.equal((html.match(/class="ml-bar"/g) || []).length, 1); assert.match(html, /name="format-detection" content="telephone=no,date=no/);
  assert.match(text, /Yellow wind warning until 15:00 · Met Office/); assert.match(text, /Afternoon: 15°, Rain 12:00/); assert.match(text, /Forecast at 07:00/);
  // (a briefing's picture small, and no address under a button that only opens Weather)
  const small = emailBody({ brand: "weather", ...m, compact: true, fallback: false, button: { label: "See the latest", url: "https://weather.georgefarrowgreen.com/" } }).html;
  assert.match(small, /width="64" height="64"/); assert.doesNotMatch(small, /Button not working/);
  // a warning: raised from yellow, two more besides
  const w = (id, level, event, more = {}) => ({ id, level, event, via: "MeteoAlarm", issuer: "Met Office", type: 1, onset: iso(now - H), expires: iso(now + 12 * H), headline: "Gusts of 50 to 60 mph.", text: "Very strong winds. Some roads and bridges may close.", area: "South West England", ...more });
  const told = warningAlert([w("a", 2, "Yellow wind warning")], null, now, now, f, 0, "Bristol").told;
  const r = warningAlert([w("b", 3, "Amber wind warning"), w("c", 2, "Yellow rain warning", { type: 10 }), w("d", 2, "Yellow fog warning", { type: 4 })], told, now, now, f, 0, "Bristol");
  const wm = warningMail(r.fresh, now, f, 0, "Bristol");
  assert.equal(wm.title, "Amber wind warning"); assert.equal(wm.icon, "warn-amber");
  assert.equal(wm.subject, "Amber wind warning: Bristol (and 2 more)");
  assert.deepEqual(wm.lines, ["Gusts of 50 to 60 mph.", "Raised from yellow by the Met Office.", "And 2 more warnings here: see them in Weather."]);
  assert.equal(wm.quote, "Very strong winds. Some roads and bridges may close.");
  assert.deepEqual(wm.rows.map(([k, v]) => `${k}: ${v}`), ["When: Until 19:00", "Where: South West England", "Issued by: Met Office"]);
  assert.match(emailBody({ brand: "weather", ...wm }).html, /mail\/weather-warn-amber\.png/);
});
