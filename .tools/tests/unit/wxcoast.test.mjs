// By the coast: the Environment Agency's flood warnings (functions/_wxwarn.js) and how the app keeps them (weather/
// official.js), and the sea (weather/data.js shapeMarine): its tides found from the hours, and what it does to a swim
// or a sail (weather/insights.js), on the stand-ins the end-to-end test uses too (mocks/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeEa, outlineOf, kmFrom, warningsAt } from "../../../functions/_wxwarn.js";
import { inForce, colourOf, titleOf, glyphOf, covered, spanOf } from "../../../weather/official.js";
import { shapeMarine } from "../../../weather/data.js";
import { activityScore, ACTIVITIES } from "../../../weather/insights.js";
import { makeFormat } from "../../../weather/format.js";
import { eaFloods, eaOutline, BACTON_EA } from "../mocks/wxwarnings.mjs";
import { marine, BACTON } from "../mocks/wxappdata.mjs";

const H = 3600e3, f = makeFormat({});
const NOW = Date.UTC(2026, 9, 19, 9, 0);

test("the Environment Agency's floods: severe warnings red, warnings amber, alerts yellow; none no longer in force", () => {
  const list = shapeEa(eaFloods(BACTON_EA.lat, BACTON_EA.lon, NOW));
  assert.deepEqual(list.map((w) => [w.id, w.event, w.level]), [["ea-054FWCBACTN-2", "Flood warning", 3], ["ea-054WAFARAWY-3", "Flood alert", 2]]);
  const w = list[0];
  assert.equal(w.issuer, "Environment Agency");
  assert.equal(w.expires, null); assert.equal(w.open, true);
  assert.equal(w.onset, new Date(NOW - 3 * H).toISOString().replace(".000", ""), "its time (the API's, without a zone: UTC)");
  assert.equal(w.url, "https://check-for-flooding.service.gov.uk/target-area/054FWCBACTN");
  assert.equal(w.headline, "Flooding is expected: act now.");
  assert.match(w.text, /Avoid the sea front/);
  // made-up area ids aren't followed
  assert.deepEqual(shapeEa({ items: [{ severityLevel: 2, floodAreaID: "../../x?y" }] }), []);
  assert.deepEqual(shapeEa(null), []);
  // as the app says it: amber, by its own name, a flood's icon, and in force (it has no end)
  assert.equal(colourOf(w), "amber"); assert.equal(titleOf(w), "Flood warning"); assert.equal(glyphOf(w), "flood");
  assert.equal(colourOf({ ...w, level: 4 }), "red"); assert.equal(colourOf(list[1]), "yellow");
  assert.equal(spanOf(w, NOW, f), "In force");
  // (a flood warning isn't a rain warning: the app's own heavy rain warnings still stand)
  assert.equal(covered([{ ...w, checked: new Date(NOW).toISOString() }], NOW).size, 0);
});

test("a flood area's outline, and how far a place is from it", () => {
  const rings = outlineOf(eaOutline("054FWCBACTN"));
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0].b, [52.84, 1.43, 52.88, 1.51]);
  assert.equal(kmFrom(52.86, 1.47, rings), 0, "inside it");
  const off = kmFrom(52.86, 1.47, outlineOf(eaOutline("054WAFARAWY")));
  assert.ok(off > 9 && off < 14, `the far one's 10 km or so off: ${off}`);
  // just outside, by a kilometre or so (north of its edge)
  const near = kmFrom(52.89, 1.47, rings);
  assert.ok(near > 1 && near < 1.3, `${near}`);
  // a MultiPolygon, each of its rings; and nothing that isn't one
  assert.equal(outlineOf({ type: "MultiPolygon", coordinates: [[[[1, 52], [1.1, 52], [1.1, 52.1], [1, 52]]], [[[2, 52], [2.1, 52], [2.1, 52.1], [2, 52]]]] }).length, 2);
  assert.deepEqual(outlineOf({ type: "Point", coordinates: [1, 52] }), []);
  assert.equal(kmFrom(52.86, 1.47, []), Infinity);
});

test("warnings for a place in England: the floods whose area takes it in or is within 3 km", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/flood-monitoring/id/floods") return new Response(JSON.stringify(eaFloods(+u.searchParams.get("lat"), +u.searchParams.get("long"), NOW)), { status: 200 });
    const m = /floodAreas\/([\w-]+)\/polygon$/.exec(u.pathname);
    if (m) return eaOutline(m[1]) ? new Response(JSON.stringify(eaOutline(m[1])), { status: 200 }) : new Response("", { status: 404 });
    return new Response(JSON.stringify({ warnings: [] }), { status: 200 });
  };
  try {
    const env = { METEOALARM_URL: "http://ma.test", EA_URL: "http://ea.test" };
    const got = (await warningsAt(env, BACTON_EA.lat, BACTON_EA.lon, NOW)).warnings;
    assert.deepEqual(got.map((w) => w.id), ["ea-054FWCBACTN-2"], "not the alert 10 km off");
    assert.equal(got[0].checked, new Date(NOW).toISOString(), "when the server saw it in force");
    assert.ok(!("floodArea" in got[0]) && !("polys" in got[0]));
    // Scotland and Wales: outside the Agency's map, not asked
    assert.deepEqual((await warningsAt(env, 57.48, -4.22, NOW)).warnings, []);
  } finally { globalThis.fetch = real; }
});

test("one without an end time is in force while the server said so lately (12 hours)", () => {
  const seen = (h) => ({ id: "ea", open: true, expires: null, checked: new Date(NOW - h * H).toISOString() });
  assert.equal(inForce([seen(1), seen(11)], NOW).length, 2);
  assert.equal(inForce([seen(13)], NOW).length, 0, "not heard of for long: let go");
  assert.equal(inForce([{ id: "x", expires: new Date(NOW + H).toISOString() }, { id: "y", expires: new Date(NOW - H).toISOString() }], NOW).length, 1);
});

test("the sea: its nearest cell's temperature, waves and tide, its high and low waters found from the hours", () => {
  const url = (la, lo) => `https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}`;
  const sea = shapeMarine(marine(NOW, url(BACTON.lat, BACTON.lon)), BACTON);
  assert.equal(sea.km, 10);
  assert.equal(sea.hourly.length, 7 * 24);
  assert.deepEqual(Object.keys(sea.hourly[0]).sort(), ["period", "sst", "t", "tide", "wave", "waveDir"]);
  // (the stand-in's tide: high at 03:00 and every 12.42 hours on; low half way between)
  const day = Math.floor(NOW / 864e5) * 864e5, P = 12.42 * H;
  const highs = sea.tides.filter((x) => x.high), lows = sea.tides.filter((x) => !x.high);
  assert.ok(highs.length >= 12 && lows.length >= 12, `${highs.length} highs, ${lows.length} lows`);
  for (const [k, x] of highs.slice(0, 6).entries()) {
    const want = day + 3 * H + (k + (highs[0].t > day + 4 * H ? 1 : 0)) * P;
    assert.ok(Math.abs(x.t - want) <= 15 * 60e3, `high ${k} within a quarter of an hour: ${new Date(x.t).toISOString()} vs ${new Date(want).toISOString()}`);
    assert.ok(Math.abs(x.h - 1.6) < 0.05, `its height ${x.h}`);
    assert.equal(x.t % (15 * 60e3), 0, "on a quarter hour");
  }
  assert.ok(lows.every((x) => Math.abs(x.h + 1.6) < 0.05));
  // inland: the nearest sea cell's too far to be its sea
  assert.equal(shapeMarine(marine(NOW, url(51.5072, -0.1276)), { lat: 51.5072, lon: -0.1276 }), null);
  // nothing to say: none
  const empty = marine(NOW, url(BACTON.lat, BACTON.lon));
  empty.hourly.sea_surface_temperature = empty.hourly.sea_surface_temperature.map(() => null); empty.hourly.wave_height = empty.hourly.wave_height.map(() => null);
  assert.equal(shapeMarine(empty, BACTON), null);
  assert.equal(shapeMarine(null, BACTON), null);
});

test("a swim in the sea as good as the water's warm and calm; sailing held back by big waves", () => {
  const swim = { id: "swim", ...ACTIVITIES.swim }, sail = { id: "sail", ...ACTIVITIES.sail };
  const day = { feels: 22, temp: 22, wind: 15, gust: 22, precip: 0, pop: 0, code: 1 };
  assert.equal(activityScore(day, null, swim), 1, "inland, or no sea known: the air alone");
  assert.equal(activityScore({ ...day, sst: 18, wave: 0.4 }, null, swim), 1);
  assert.ok(Math.abs(activityScore({ ...day, sst: 15, wave: 0.4 }, null, swim) - 0.8) < 1e-9);
  assert.ok(activityScore({ ...day, sst: 9, wave: 0.4 }, null, swim) <= 0.3, "a cold sea");
  assert.ok(activityScore({ ...day, sst: 18, wave: 1.4 }, null, swim) < 0.6, "rough");
  assert.ok(activityScore({ ...day, wind: 22, sst: 10, wave: 1.5 }, null, sail) > 0.9, "the sea's warmth doesn't matter to a sail, nor moderate waves");
  assert.ok(activityScore({ ...day, wind: 22, wave: 3.5 }, null, sail) < 0.3, "big waves do");
  assert.equal(f.height(1.44), "1.4 m"); assert.equal(makeFormat({ temp: "f" }).height(1.44), "5 ft");
  assert.equal(f.height(-1.36), "−1.4 m", "below mean sea level: a true minus"); assert.equal(f.height(-0.01), "0.0 m");
});
