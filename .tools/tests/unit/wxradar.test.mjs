// The radar's sums (weather/rainmap.js): rain rate to reflectivity, the radar's own colours, the grid the
// forecast's frames are made from, painting one, the timeline of radar then forecast, and smoothing the
// radar's own tiles where they're enlarged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dbzOf, mmhOf, rgbaFor, hexFor, grid, paint, timeline, LEGEND, decode, ramp, resample, motion } from "../../../weather/rainmap.js";

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

test("reading a radar tile back: each colour to its dBZ, rain or snow", () => {
  const px = (...cs) => new Uint8ClampedArray(cs.flat());
  // clear, 20 dBZ rain, 15 dBZ rain (between the table's steps of 2), 37 dBZ, 20 dBZ snow
  const c = decode(px([0, 0, 0, 0], [0x00, 0xa3, 0xe0, 0xff], [0x88, 0xdd, 0xee, 0xff], [0xff, 0xd2, 0x00, 0xff], [0x7f, 0xbf, 0xff, 0xff]));
  assert.deepEqual([...c], [0, 31, 26, 48, 131]);
  // a colour not in the table: the nearest rain colour
  assert.equal(decode(px([0x01, 0xa2, 0xe1, 0xff]))[0], 31);
});
test("the colour ramp: the radar's own colours, or flowing between them", () => {
  const r = ramp(false), at = (t, dbz) => [...t.slice((dbz + 10) * 16, (dbz + 10) * 16 + 4)];
  assert.deepEqual(at(r, 20), [0x00, 0xa3, 0xe0, 0xff]);
  assert.deepEqual(at(r, 36), [0xff, 0xe0, 0x00, 0xff]);
  assert.deepEqual(at(ramp(true), 20), [0x7f, 0xbf, 0xff, 0xff], "snow in blues");
  // soft: the jump from deep blue (34) to yellow (35) becomes a blend, and the blues stay blue
  const s = ramp(false, 1.4), mid = at(s, 35);
  assert.ok(mid[0] > 0x80 && mid[0] < 0xff && mid[2] > 0, `blended: ${mid}`);
  assert.ok(at(s, 24)[2] > at(s, 24)[0], "blue stays blue");
});
test("smoothing an enlarged tile: a shower becomes round, its edge soft, the dry stays clear", () => {
  // a 4 × 4 block of 30 dBZ rain in a dry tile, enlarged 8 times (as at zoom 10)
  const codes = new Uint8Array(256 * 256);
  for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) codes[y * 256 + x] = 30 + 11;
  const code = (x, y) => (x < 0 || y < 0 || x > 255 || y > 255 ? 0 : codes[y * 256 + x]);
  const W = 128, out = resample(new Uint8ClampedArray(W * W * 4), W, code, 8, 8, 8, { edge: [0.16, 0.5], soft: 1.4 });
  const a = (x, y) => out[(y * W + x) * 4 + 3];
  // the block covers source x 10-14 → output 32-96: rain in the middle, clear at the tile's corners
  assert.ok(a(64, 64) > 200 && a(2, 2) === 0 && a(125, 125) === 0);
  assert.deepEqual([...out.slice((64 * W + 64) * 4, (64 * W + 64) * 4 + 3)], [...ramp(false, 1.4).slice(40 * 16, 40 * 16 + 3)], "the middle in 30 dBZ's colour");
  // round, not square: the block's corner is cut away, while the middle of its edge is rain
  assert.ok(a(34, 34) < a(34, 64), `corner ${a(34, 34)} vs edge ${a(34, 64)}`);
  // its edge fades over a few pixels rather than stepping from clear to rain
  const row = Array.from({ length: 30 }, (_, k) => a(18 + k, 64)), between = row.filter((v) => v > 0 && v < 200);
  assert.ok(between.length >= 2, `a soft edge: ${row.join(",")}`);
  // nothing in, nothing out
  const dry = resample(new Uint8ClampedArray(W * W * 4), W, () => 0, 0, 0, 32);
  assert.ok(dry.every((v, k) => k % 4 !== 3 || v === 0));
  // snow: snow's blues
  const snow = (x, y) => (code(x, y) ? 30 + 111 : 0), sn = resample(new Uint8ClampedArray(W * W * 4), W, snow, 8, 8, 8);
  assert.ok(sn[(64 * W + 64) * 4 + 2] === 255 && sn[(64 * W + 64) * 4] < 0x80, "snow in blues");
});

test("how the rain is moving: two frames lined up", () => {
  // a band of showers (and a cell) moved 17 pixels east and 11 north between frames
  const W = 768, field = (cx, cy) => {
    const a = new Uint8Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - cx, y - cy), r2 = Math.hypot(x - cx - 150, y - cy + 90);
      if (r < 70 || (r2 < 40 && x % 7)) a[y * W + x] = 11 + Math.max(16, Math.round(40 - r / 3));
    }
    return a;
  };
  const m = motion(field(300, 400), field(317, 389), W, W);
  assert.ok(Math.abs(m.dx - 17) < 1 && Math.abs(m.dy + 11) < 1 && m.score > 0.9, JSON.stringify(m));
  const back = motion(field(300, 400), field(260, 425), W, W);
  assert.ok(Math.abs(back.dx + 40) < 1 && Math.abs(back.dy - 25) < 1, JSON.stringify(back));
  // still: no movement; nothing on the radar: nothing to go on
  const still = motion(field(300, 400), field(300, 400), W, W);
  assert.equal(still.dx, 0); assert.equal(still.dy, 0);
  assert.equal(motion(new Uint8Array(W * W), new Uint8Array(W * W), W, W), null);
  // drizzle alone (below 15 dBZ) doesn't steer it
  const drizzle = new Uint8Array(W * W).fill(11 + 10);
  assert.equal(motion(drizzle, drizzle, W, W), null);
});
