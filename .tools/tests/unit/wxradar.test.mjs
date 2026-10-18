// The radar's sums (weather/rainmap.js): rain rate to reflectivity, the radar's own colours, the grid the
// forecast's frames are made from, painting one, and the timeline of radar then forecast.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dbzOf, mmhOf, rgbaFor, hexFor, grid, paint, timeline, LEGEND } from "../../../weather/rainmap.js";

test("rain rate ↔ reflectivity (Marshall and Palmer)", () => {
  assert.ok(Math.abs(dbzOf(1) - 23.01) < 0.01);
  assert.ok(Math.abs(dbzOf(10) - 39.01) < 0.01);
  assert.ok(Math.abs(mmhOf(dbzOf(4.2)) - 4.2) < 1e-9);
  assert.equal(dbzOf(0), -99);
  assert.deepEqual(LEGEND.map((x) => x.label), ["Drizzle", "Light", "Moderate", "Heavy", "Very heavy", "Extreme"]);
});
test("the radar's own colours (Universal Blue)", () => {
  assert.deepEqual(rgbaFor(20), [0x00, 0xa3, 0xe0, 0xff]);
  assert.deepEqual(rgbaFor(37), [0xff, 0xe0, 0x00, 0xff], "heavy rain turns yellow at 36 dBZ");
  assert.deepEqual(rgbaFor(15), [0xde, 0xd0, 0x97, 0xbe], "drizzle is a pale, see-through sand");
  assert.deepEqual(rgbaFor(20, true), [0x7f, 0xbf, 0xff, 0xff], "snow in blues");
  assert.equal(rgbaFor(-20), null);
  assert.equal(hexFor(50), "rgba(193,0,0,1.00)");
});
test("the grid: 9 × 9 points about 220 km across, north-west to south-east", () => {
  const g = grid(51.5, -0.12);
  assert.equal(g.lats.length, 81);
  assert.deepEqual([g.lats[0], g.lons[0]], [52.5, Math.round((-0.12 - 1 / Math.cos(51.5 * Math.PI / 180)) * 100) / 100]);
  assert.deepEqual([g.lats[80], g.lons[80]], [50.5, Math.round((-0.12 + 1 / Math.cos(51.5 * Math.PI / 180)) * 100) / 100]);
  assert.ok(g.east - g.west > g.north - g.south, "wider in longitude, so it's square on the ground");
  // across the date line, longitudes stay in range
  const p = grid(-17, 179.5);
  assert.ok(p.lons.every((x) => x >= -180 && x <= 180) && p.lons.some((x) => x < 0));
});
test("painting a frame: rain where the points say, nothing where they don't", () => {
  const g = grid(51.5, -0.12, 9), W = 40, H = 40;
  const all = paint(new Uint8ClampedArray(W * H * 4), W, H, g, Array(81).fill(2));
  const c = rgbaFor(dbzOf(2));
  assert.deepEqual([...all.slice(0, 4)], c, "2 mm/h everywhere: every pixel the same blue");
  assert.ok(all.every((v, k) => v === c[k % 4]));
  const dry = paint(new Uint8ClampedArray(W * H * 4), W, H, g, Array(81).fill(0));
  assert.ok(dry.every((v, k) => k % 4 !== 3 || v === 0), "dry: all clear");
  // a shower over the middle point only: the middle wet, the corners clear
  const one = Array(81).fill(0); one[40] = 8;
  const mid = paint(new Uint8ClampedArray(W * H * 4), W, H, g, one);
  const px = (x, y) => [...mid.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
  assert.ok(px(20, 20)[3] > 0 && px(0, 0)[3] === 0 && px(39, 39)[3] === 0);
  // its edge fades rather than ending in a hard ring
  const alphas = Array.from({ length: 20 }, (_, k) => px(20 + k, 20)[3]).filter((a) => a > 0);
  assert.ok(alphas.at(-1) < alphas[0], `fades: ${alphas.join(",")}`);
  // snow there: snow's colours
  const snow = Array(81).fill(0); snow[40] = 1;
  const sn = paint(new Uint8ClampedArray(W * H * 4), W, H, g, one, snow);
  const s = [...sn.slice((20 * W + 20) * 4, (20 * W + 20) * 4 + 4)];
  assert.ok(s[2] === 255 && s[0] < s[2], "blue for snow");
});
test("the timeline: two hours of radar, then the forecast after the latest frame", () => {
  const now = Date.UTC(2026, 9, 18, 15, 7), radar = Array.from({ length: 13 }, (_, k) => Date.UTC(2026, 9, 18, 13) + k * 600e3);
  const model = Array.from({ length: 9 }, (_, k) => Date.UTC(2026, 9, 18, 15) + k * 900e3);
  const t = timeline(radar, model, now);
  assert.equal(t.now, 12);
  assert.deepEqual(t.frames.filter((f) => f.kind === "model").map((f) => new Date(f.t).toISOString().slice(11, 16)), ["15:15", "15:30", "15:45", "16:00", "16:15", "16:30", "16:45", "17:00"]);
  // no radar: the forecast alone, from now
  const only = timeline([], model, now);
  assert.equal(only.frames[0].kind, "model"); assert.equal(only.now, 0);
});
