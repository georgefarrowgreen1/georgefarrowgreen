// The Solar card (weather/solar.js): when the sun's coming out on your panels, from the sunlight on the roof by the hour
import { test } from "node:test";
import assert from "node:assert/strict";
import { sunSpell, solarSay, solarQuery, MIN_W } from "../../../weather/solar.js";
import { makeFormat } from "../../../weather/format.js";

const H = 3600e3, D0 = Date.UTC(2026, 9, 27), f = makeFormat({});
// a grey morning, sun from 11:00 to 15:00 (each hour's the hour up to its time), best in the hour to 13:00
const W = { 8: 4, 9: 28, 10: 74, 11: 157, 12: 343, 13: 627, 14: 548, 15: 367, 16: 138 };
const day = Object.entries(W).map(([h, w]) => ({ t: D0 + Number(h) * H, w }));

test("the spell: an hour or more with half the day's best, said from two hours before it until it ends", () => {
  assert.equal(sunSpell(day, D0 + 8.5 * H), null, "too early");
  const s = sunSpell(day, D0 + 10 * H);
  assert.ok(s && !s.on && s.start === D0 + 11 * H && s.end === D0 + 15 * H && s.peak === D0 + 12.5 * H, JSON.stringify(s));
  assert.deepEqual(solarSay(s, D0 + 10 * H, f), { title: "Sun coming out from about 11:00", text: "Your panels should work well until about 15:00, at their best around 12:30. A good time for the washing machine." });
  const on = sunSpell(day, D0 + 13 * H);
  assert.equal(solarSay(on, D0 + 13 * H, f).title, "Sunny now, until about 15:00");
  assert.equal(solarSay(on, D0 + 13 * H, f).text, "Your panels are near their best for today.");
  assert.equal(sunSpell(day, D0 + 15 * H), null, "over");
  assert.deepEqual(on.hours.filter((x) => x.in).map((x) => new Date(x.t).getUTCHours()), [12, 13, 14, 15]);
});
test("a grey day: nothing", () => {
  assert.equal(sunSpell(day.map((x) => ({ ...x, w: Math.min(x.w, MIN_W - 1) })), D0 + 10 * H), null);
});
test("the roof's way and pitch, as Open-Meteo has them", () => {
  const q = new URLSearchParams(solarQuery(52.8236, 1.387, "SW", 30));
  assert.equal(q.get("azimuth"), "45"); assert.equal(q.get("tilt"), "30"); assert.equal(q.get("hourly"), "global_tilted_irradiance");
});
test("the whole day's spell, for the morning briefing: said however early it's asked", () => {
  const s = sunSpell(day, D0 + 7 * H, Infinity);
  assert.ok(s && s.start === D0 + 11 * H && s.end === D0 + 15 * H);
  assert.equal(sunSpell(day, D0 + 7 * H), null, "the card's: not yet");
});
test("what a device says of its zones, made safe and put together by place (functions/_wxpush.js solarWant)", async () => {
  const { solarWant } = await import("../../../functions/_wxpush.js");
  const z = (name, faces, pitch, kw, lat = 52.82361, lon = 1.38701) => ({ name, lat, lon, place: "North Walsham", faces, pitch, kw });
  assert.deepEqual(solarWant({ alert: true, zones: [z("East roof", "E", 30, 2), z("West roof", "W", 30, null), z("Cottage", "S", 35, 4, 50.1, -5.5)] }), { alert: true, places: [
    { lat: 52.82, lon: 1.39, name: "North Walsham", zones: [{ name: "East roof", faces: "E", pitch: 30, kw: 2 }, { name: "West roof", faces: "W", pitch: 30, kw: null }] },
    { lat: 50.1, lon: -5.5, name: "North Walsham", zones: [{ name: "Cottage", faces: "S", pitch: 35, kw: 4 }] }] });
  assert.deepEqual(solarWant({ alert: false, zones: [z("", "up", 33, -1)] }).places[0].zones, [{ name: "Roof", faces: "S", pitch: 35, kw: null }], "odd values: the usual");
  // (from an app from before zones: its one roof)
  assert.deepEqual(solarWant({ on: true, lat: 52.8, lon: 1.4, name: "Home", faces: "SW", pitch: 30, alert: true }), { alert: true, places: [{ lat: 52.8, lon: 1.4, name: "Home", zones: [{ name: "Roof", faces: "SW", pitch: 30, kw: null }] }] });
  assert.equal(solarWant({ on: false, lat: 52.8, lon: 1.4 }), null);
  assert.equal(solarWant({ zones: [z("Roof", "S", 35, null, 952.8)] }), null);
  assert.equal(solarWant(null), null);
});
test("zones together: each its own spell, the card from two hours before the first until the last ends, and the best hours when all work", async () => {
  const { zonesSpell, zonesSay } = await import("../../../weather/solar.js");
  // (an east and a west roof at 30°, as North Walsham had them on 29 October 2026)
  const E = { 8: 203, 9: 348, 10: 400, 11: 396, 12: 330, 13: 228, 14: 111, 15: 68, 16: 45 }, Wst = { 8: 18, 9: 52, 10: 66, 11: 201, 12: 307, 13: 371, 14: 375, 15: 294, 16: 95 };
  const hrs = (o) => Object.entries(o).map(([h, w]) => ({ t: D0 + Number(h) * H, w }));
  const zs = [{ zone: { id: "e", name: "East roof", kw: 2 }, hours: hrs(E) }, { zone: { id: "w", name: "West roof", kw: 2 }, hours: hrs(Wst) }];
  assert.equal(zonesSpell(zs, D0 + 4.5 * H), null, "too early");
  const s = zonesSpell(zs, D0 + 6.5 * H);
  assert.ok(s && !s.on && s.start === D0 + 7 * H && s.end === D0 + 15 * H, JSON.stringify([s?.start, s?.end].map((t) => t && new Date(t).toISOString())));
  assert.deepEqual(s.zones.map((x) => [x.zone.name, new Date(x.sp.start).getUTCHours(), new Date(x.sp.end).getUTCHours()]), [["East roof", 7, 13], ["West roof", 10, 15]]);
  assert.deepEqual([s.best.from, s.best.to].map((t) => new Date(t).getUTCHours()), [10, 13], "both working");
  assert.equal(s.hours[0].parts.length, 2);
  assert.deepEqual(zonesSay(s, D0 + 6.5 * H, f), { title: "Sun on your panels from about 07:00 until about 15:00",
    text: "East roof first, West roof from 10:00. A good time for the washing machine: 10:00 to 13:00, when they’re all working." });
  assert.equal(zonesSay(zonesSpell(zs, D0 + 11 * H), D0 + 11 * H, f).title, "Sunny now, until about 15:00");
  // (one zone: said as one roof)
  assert.equal(zonesSay(zonesSpell([zs[0]], D0 + 6.5 * H), D0 + 6.5 * H, f).title, "Sun coming out from about 07:00");
});
