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
