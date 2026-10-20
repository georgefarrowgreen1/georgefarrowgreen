// The radar's sums (weather/rainmap.js): rain rate to reflectivity, the radar's own colours, the grid the
// forecast's frames are made from, painting one, the timeline of radar then forecast, and smoothing the
// radar's own tiles where they're enlarged; and the rain at a place over the next two hours from the radar, led by it
// and then the models'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dbzOf, mmhOf, rgbaFor, hexFor, grid, paint, timeline, LEGEND, decode, ramp, resample, motion, along, blend, partsAt, tileOf, cornerOf } from "../../../weather/rainmap.js";

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

/* ---------- the next two hours here, from the radar ---------- */
// a square of radar 200 pixels across, the place at its middle: a block of rain (30 dBZ: about 2.7 mm an hour) from
// x0 to x1, the rows y0 to y1; codes as rainmap.js decode gives them (snow: +100)
const W = 200, square = (x0, x1, y0 = 80, y1 = 120, snow = false) => {
  const c = new Uint8Array(W * W);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) c[y * W + x] = 30 + 11 + (snow ? 100 : 0);
  return c;
};
const SEEN = new Uint8Array(W * W);
test("the radar's rain here: carried along its track, read over a circle that widens the further ahead", () => {
  // rain 20 to 60 pixels west of here, moving east at 2 pixels a minute: its edge here 10 minutes on, gone by 35
  const steps = along(square(40, 80), SEEN, W, { vx: 2, vy: 0 }, 0, 60);
  const at = (lead) => steps.find((s) => s.lead === lead);
  assert.deepEqual(steps.map((s) => s.lead).slice(0, 3), [0, 5, 10]);
  assert.equal(at(0).mmh, 0, "dry here now");
  assert.ok(at(20).mmh > 2.5 && at(20).mmh < 2.9, `under it: ${at(20).mmh}`);
  assert.ok(at(5).mmh === 0 && at(10).mmh > 0 && at(10).mmh < at(20).mmh, "its edge first: some of the circle");
  assert.equal(at(50).mmh, 0, "and gone");
  assert.ok(steps.filter((s) => s.lead <= 40).every((s) => s.seen === 1 && !s.snow), "all of it seen, while it's on the square");
  // left where it is (no track to go on): it stays put; snow is snow
  assert.ok(along(square(90, 110, 90, 110, true), SEEN, W, null, 0, 30).every((s) => s.mmh > 0 && s.snow));
  // where the radar can't see, none of it counts
  const blind = new Uint8Array(W * W).fill(1);
  assert.ok(along(square(90, 110), blind, W, null, 0, 10).every((s) => s.seen === 0 && s.mmh === 0));
  // carried off the square: less and less of the circle is seen
  const off = along(square(0, 0), SEEN, W, { vx: 3, vy: 0 }, 0, 60);
  assert.ok(off[0].seen === 1 && off[off.length - 1].seen < 0.5, `${off[off.length - 1].seen}`);
});
test("the next hours' rain: the radar's for the first half hour, giving way to the models' by two hours on", () => {
  const at = Date.UTC(2026, 9, 19, 12, 0), offset = 3600, wall = (t) => t + offset * 1000;
  // the models' quarter hours from 12:00 (real time) for two and a half hours: rain (0.5 mm in each) from 12:15 to 12:45
  const model = Array.from({ length: 10 }, (_, k) => { const t = wall(at + k * 900e3), wet = k >= 1 && k <= 2; return { t, precip: wet ? 0.5 : 0, code: wet ? 63 : 2 }; });
  // the radar: dry for the first hour (and seeing), then 2 mm an hour
  const steps = Array.from({ length: 25 }, (_, k) => ({ lead: k * 5, mmh: k * 5 >= 60 ? 2 : 0, snow: false, seen: 1 }));
  const out = blend(model, steps, at, offset);
  assert.equal(out.length, 10);
  assert.ok(out[1].precip === 0 && out[2].precip < 0.05 && out[1].code === 3 && out[1].radar === 1, "the models' shower: not what the radar sees");
  // an hour on (its middle 67.5 minutes after the frame): the radar's 2 mm an hour, with a little over half the say
  const s4 = 1 - (67.5 - 30) / 90;
  assert.ok(Math.abs(out[4].radar - s4) < 1e-9 && Math.abs(out[4].precip - Math.round(s4 * 0.5 * 100) / 100) < 1e-9 && out[4].code === 61, `the radar's rain, an hour on: ${JSON.stringify(out[4])}`);
  // 1h37 on: 2 mm an hour from the radar and none from the models, about evenly
  const mid = out[6], share = 1 - (97.5 - 30) / 90;
  assert.ok(Math.abs(mid.radar - share) < 1e-9 && Math.abs(mid.precip - Math.round(share * 0.5 * 100) / 100) < 1e-9, JSON.stringify(mid));
  assert.equal(out[9].radar, undefined, "two hours on: the models' alone");
  assert.equal(out[9], model[9]);
  // where the radar can't see: the models' alone throughout
  assert.deepEqual(blend(model, steps.map((s) => ({ ...s, seen: 0.3 })), at, offset), model);
  assert.equal(blend(model, null, at, offset), model);
});

/* ---------- to the minute ---------- */
const M = 60e3, T0 = Date.UTC(2026, 9, 20, 12, 0);
const pastOf = (n) => Array.from({ length: n }, (_, k) => ({ time: (T0 + k * 10 * M) / 1000, path: `/v2/radar/${k}` }));
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
test("between two of the radar's frames: each moved along the rain's way and faded into the other, minute by minute", () => {
  // (the rain going 0.5 zoom-7 pixels a minute east and 0.2 south; the 12:30 and 12:40 frames)
  const src = { past: pastOf(13), drift: { vx: 0.5, vy: 0.2 } };
  assert.deepEqual(partsAt(src, T0 + 30 * M), [{ k: 3, dx: 0, dy: 0, alpha: 1 }], "on a frame: that frame as it is");
  const [a, b] = partsAt(src, T0 + 33 * M);
  assert.equal(a.k, 3); assert.equal(b.k, 4);
  assert.ok(near(a.alpha, 0.7) && near(b.alpha, 0.3), `${a.alpha} ${b.alpha}`);
  // 12:30's rain moved on three minutes' worth; 12:40's moved back seven; the two meet where the rain is at 12:33
  assert.ok(near(a.dx, 1.5) && near(a.dy, 0.6) && near(b.dx, -3.5) && near(b.dy, -1.4), JSON.stringify([a, b]));
  assert.ok(near(a.alpha + b.alpha, 1));
  // nothing moving to go on near now: the pair's own way, where it's known; else simply faded
  const pair = partsAt({ past: pastOf(13), drift: null, driftOf: (k) => (k === 3 ? { vx: 1, vy: 0 } : null) }, T0 + 35 * M);
  assert.ok(near(pair[0].dx, 5) && near(pair[1].dx, -5), JSON.stringify(pair));
  const still = partsAt({ past: pastOf(13), drift: null }, T0 + 35 * M);
  assert.ok(still.every((p) => p.dx === 0 && p.dy === 0) && near(still[0].alpha, 0.5), JSON.stringify(still));
});
test("after the latest radar: carried on to the minute along its track, fading a little the further ahead", () => {
  const src = { past: pastOf(13), drift: { vx: 0.5, vy: -0.25 } }, last = T0 + 120 * M;
  assert.deepEqual(partsAt(src, last), [{ k: 12, dx: 0, dy: 0, alpha: 1 }]);
  const [p] = partsAt(src, last + 37 * M);
  assert.ok(p.k === 12 && near(p.dx, 18.5) && near(p.dy, -9.25) && near(p.alpha, 1 - 0.3 * 37 / 120), JSON.stringify(p));
  assert.ok(near(partsAt(src, last + 120 * M)[0].alpha, 0.7), "two hours on: faded to 70%");
  // (nothing coming: the latest held where it is)
  assert.ok(partsAt({ past: pastOf(13), drift: null }, last + 20 * M).every((x) => x.dx === 0 && x.dy === 0));
});
test("the models' rain between their quarter hours: blended, from the latest radar into the first of them", () => {
  const last = T0 + 120 * M, models = [{ t: last + 7.5 * M, k: 0 }, { t: last + 22.5 * M, k: 1 }, { t: last + 37.5 * M, k: 2 }];
  const model = { rain: [[0, 2, 4], [4, 2, 0], [1, 1, 1]], snow: [[0, 0, 0], [1, 1, 1], [0, 0, 0]] };
  const src = { past: pastOf(13), drift: null, models, model };
  // from the radar into the first quarter hour
  const into = partsAt(src, last + 3 * M);
  assert.ok(into.length === 2 && into[0].k === 12 && near(into[0].alpha, 0.6) && near(into[1].alpha, 0.4) && into[1].rates === model.rain[0], JSON.stringify(into));
  // between two quarter hours: their rates blended, snow where the nearer has it
  const [m] = partsAt(src, last + 11.25 * M);
  assert.ok(m.alpha === 1 && m.rates.every((r, p) => near(r, model.rain[0][p] * 0.75 + model.rain[1][p] * 0.25)) && m.snow === model.snow[0], JSON.stringify(m));
  assert.equal(partsAt(src, last + 20 * M)[0].snow, model.snow[1]);
  assert.deepEqual(partsAt(src, last + 40 * M), [{ rates: model.rain[2], snow: model.snow[2], alpha: 1 }], "past the last: the last");
  // no radar at all: the models' from their first
  assert.deepEqual(partsAt({ past: [], models, model }, last), [{ rates: model.rain[0], snow: model.snow[0], alpha: 1 }]);
});
test("map tiles: where a place is on them, and where a tile's corner is", () => {
  const [x, y] = tileOf(52.63, 1.28, 9);
  assert.ok(Math.floor(x) === 257 && Math.floor(y) === 167, `${x} ${y}`);
  const [la, lo] = cornerOf(x, y, 9);
  assert.ok(near(la, 52.63, 1e-9) && near(lo, 1.28, 1e-9), `${la} ${lo}`);
  assert.deepEqual(cornerOf(0, 0, 0).map((v) => Math.round(v * 1e4) / 1e4), [85.0511, -180]);
  assert.deepEqual(tileOf(0, 0, 1), [1, 1]);
});
