// The radar's sums (weather/rainmap.js): rain rate to reflectivity, the radar's own colours, the grid the
// forecast's frames are made from, painting one, the timeline of radar then forecast, and smoothing the
// radar's own tiles where they're enlarged; and the rain at a place over the next two hours from the radar, led by it
// and then the models'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dbzOf, mmhOf, rgbaFor, hexFor, shade, grid, paint, timeline, LEGEND, decode, ramp, resample, motion, along, blend, partsAt, tileOf, cornerOf, rainValues, colour, palette, gridAt, rainSaid } from "../../../weather/rainmap.js";
import { heaviness } from "../../../weather/codes.js";

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
  const c = shade(dbzOf(2));
  assert.deepEqual([...all.slice(0, 4)], c, "2 mm/h everywhere: every pixel the same colour, the app's own for it");
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
  assert.ok(s[0] < s[1] && s[0] < s[2] && s[2] > 150, `cyan for snow: ${s}`);
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
test("the colour ramp: the app's own colours (after Apple's Weather map), or flowing between them", () => {
  const r = ramp(false), at = (t, dbz) => [...t.slice((dbz + 10) * 16, (dbz + 10) * 16 + 4)];
  assert.deepEqual(at(r, 20), shade(20));
  // light rain blue, moderate violet, heavy yellow, extreme a pale yellow; see-through where it's light
  const [lt, md, hv, ex] = [16, 29, 45, 58].map((d) => at(r, d));
  assert.ok(lt[2] > lt[0] && lt[2] > lt[1], `light blue: ${lt}`);
  assert.ok(md[2] > md[1] && md[0] > md[1], `moderate violet: ${md}`);
  assert.ok(hv[0] > 240 && hv[1] > 240 && hv[2] < 120, `heavy yellow: ${hv}`);
  assert.ok(ex[0] > 240 && ex[1] > 240 && ex[2] > 200, `extreme pale: ${ex}`);
  assert.ok(lt[3] < md[3] && md[3] < hv[3], "light rain lighter on the map");
  const sn = at(ramp(true), 20);
  assert.ok(sn[1] > sn[0] && sn[2] > sn[0], `snow in cyans: ${sn}`);
  // soft: no step from one dB to the next bigger than a gentle one, and light rain stays blue
  const s = ramp(false, 1.4);
  let step = 0; for (let d = 8; d < 64; d++) step = Math.max(step, ...[0, 1, 2].map((j) => Math.abs(at(s, d + 1)[j] - at(s, d)[j])));
  assert.ok(step < 24, `flowing: the biggest step ${step}`);
  assert.ok(at(s, 18)[2] > at(s, 18)[0], "blue stays blue");
});
test("smoothing an enlarged tile: a shower becomes round, its edge soft, the dry stays clear", () => {
  // a 4 × 4 block of 30 dBZ rain in a dry tile, enlarged 8 times (as at zoom 10)
  const codes = new Uint8Array(256 * 256);
  for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) codes[y * 256 + x] = 30 + 11;
  const code = (x, y) => (x < 0 || y < 0 || x > 255 || y > 255 ? 0 : codes[y * 256 + x]);
  const W = 128, out = resample(new Uint8ClampedArray(W * W * 4), W, code, 8, 8, 8, { edge: [0.16, 0.5], soft: 1.4 });
  const a = (x, y) => out[(y * W + x) * 4 + 3];
  // the block covers source x 10-14 → output 32-96: rain in the middle, clear at the tile's corners
  assert.ok(a(64, 64) > 180 && a(2, 2) === 0 && a(125, 125) === 0);
  assert.deepEqual([...out.slice((64 * W + 64) * 4, (64 * W + 64) * 4 + 3)], [...ramp(false, 1.4).slice(40 * 16, 40 * 16 + 3)], "the middle in 30 dBZ's colour");
  // round, not square: the block's corner is cut away, while the middle of its edge is rain
  assert.ok(a(34, 34) < a(34, 64), `corner ${a(34, 34)} vs edge ${a(34, 64)}`);
  // its edge fades over a few pixels rather than stepping from clear to rain
  const row = Array.from({ length: 30 }, (_, k) => a(18 + k, 64)), between = row.filter((v) => v > 0 && v < 180);
  assert.ok(between.length >= 2, `a soft edge: ${row.join(",")}`);
  // nothing in, nothing out
  const dry = resample(new Uint8ClampedArray(W * W * 4), W, () => 0, 0, 0, 32);
  assert.ok(dry.every((v, k) => k % 4 !== 3 || v === 0));
  // snow: snow's blues
  const snow = (x, y) => (code(x, y) ? 30 + 111 : 0), sn = resample(new Uint8ClampedArray(W * W * 4), W, snow, 8, 8, 8);
  assert.ok(sn[(64 * W + 64) * 4 + 2] > 150 && sn[(64 * W + 64) * 4] < 0x80, "snow in cyans");
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
  assert.ok(Math.abs(out[4].radar - s4) < 1e-9 && Math.abs(out[4].precip - Math.round(s4 * 0.5 * 100) / 100) < 1e-9 && out[4].code === [61, 63, 65][heaviness(out[4].precip * 4) - 1], `the radar's rain, an hour on, as heavy as it falls: ${JSON.stringify(out[4])}`);
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
test("between two of the radar's frames: each moved along the rain's way and blended into the other, minute by minute", () => {
  // (the rain going 0.5 zoom-7 pixels a minute east and 0.2 south; the 12:30 and 12:40 frames)
  const src = { past: pastOf(13), drift: { vx: 0.5, vy: 0.2 } };
  assert.deepEqual(partsAt(src, T0 + 30 * M), [{ k: 3, dx: 0, dy: 0, alpha: 1 }], "on a frame: that frame as it is");
  const [a, b] = partsAt(src, T0 + 33 * M);
  assert.equal(a.k, 3); assert.equal(b.k, 4);
  assert.ok(near(a.alpha, 0.7) && near(b.alpha, 0.3), `${a.alpha} ${b.alpha}`);
  // 12:30's rain moved on three minutes' worth; 12:40's moved back seven; the two meet where the rain is at 12:33
  assert.ok(near(a.dx, 1.5) && near(a.dy, 0.6) && near(b.dx, -3.5) && near(b.dy, -1.4), JSON.stringify([a, b]));
  assert.ok(near(a.alpha + b.alpha, 1));
  // the pair's own way, where it's known (the rain then may have been going another way than it is now); else the latest's
  const pair = partsAt({ past: pastOf(13), drift: { vx: 0.5, vy: 0.2 }, driftOf: (k) => (k === 3 ? { vx: 1, vy: 0 } : null) }, T0 + 35 * M);
  assert.ok(near(pair[0].dx, 5) && near(pair[0].dy, 0) && near(pair[1].dx, -5), JSON.stringify(pair));
  const other = partsAt({ past: pastOf(13), drift: { vx: 0.5, vy: 0.2 }, driftOf: (k) => (k === 3 ? { vx: 1, vy: 0 } : null) }, T0 + 55 * M);
  assert.ok(near(other[0].dx, 2.5) && near(other[0].dy, 1), JSON.stringify(other));
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
test("then the models' hours: on from the end of the two hours, what was on show fading into them over an hour, hour into hour", () => {
  const now = Date.UTC(2026, 9, 18, 15, 7), radar = Array.from({ length: 13 }, (_, k) => Date.UTC(2026, 9, 18, 13) + k * 600e3);
  const ahead = Array.from({ length: 12 }, (_, k) => radar[12] + (k + 1) * 600e3), hourT = Array.from({ length: 13 }, (_, k) => Date.UTC(2026, 9, 18, 15) + k * 3600e3 - 1800e3);
  const tl = timeline(radar, ahead, now, 2 * 3600e3, hourT);
  assert.equal(tl.split, radar[12] + 2 * 3600e3, "the split: the end of the two hours");
  assert.deepEqual(tl.frames.filter((f) => f.kind === "hour").map((f) => new Date(f.t).toISOString().slice(11, 16)), ["17:30", "18:30", "19:30", "20:30", "21:30", "22:30", "23:30", "00:30", "01:30", "02:30"]);
  assert.equal(timeline(radar, ahead, now).split, radar[12] + 2 * 3600e3, "without hours: the same split, nothing after it");
  // the radar carried on to the split, then on along its track as it fades into the first hour over the next hour; then
  // hour into hour; past the last, the last
  const last = T0 + 120 * M, split = last + 120 * M, hourly = [{ t: split + 20 * M, k: 3 }, { t: split + 80 * M, k: 4 }];
  const hours = { rain: [[], [], [], [0, 2, 4], [4, 2, 0]], snow: [[], [], [], [0, 0, 0], [1, 1, 1]] };
  const src = { past: pastOf(13), drift: { vx: 0.5, vy: 0 }, hourly, hours, split };
  assert.ok(near(partsAt(src, split)[0].alpha, 0.7) && partsAt(src, split).length === 1, "at the split: the radar carried on, as before");
  const into = partsAt(src, split + 5 * M);
  assert.ok(into.length === 2 && into[0].k === 12 && near(into[0].dx, 62.5) && near(into[0].alpha, 0.7 * 11 / 12) && near(into[1].alpha, 1 / 12) && into[1].rates === hours.rain[3], JSON.stringify(into));
  const hh = partsAt(src, split + 50 * M), h = hh[hh.length - 1];
  assert.ok(hh.length === 2 && near(hh[0].alpha, 0.7 / 6) && near(h.alpha, 5 / 6) && h.rates.every((r, p) => near(r, (hours.rain[3][p] + hours.rain[4][p]) / 2)), JSON.stringify(hh));
  const [on] = partsAt(src, split + 65 * M);
  assert.ok(on.alpha === 1 && on.rates.every((r, p) => near(r, hours.rain[3][p] * 0.25 + hours.rain[4][p] * 0.75)), "an hour on: the models' alone");
  assert.deepEqual(partsAt(src, split + 300 * M), [{ rates: hours.rain[4], snow: hours.snow[4], alpha: 1 }]);
  // (and from the models' quarter hours, where they were on show, the same way)
  const model = { rain: [[1, 1, 1]], snow: [[0, 0, 0]] }, m = partsAt({ past: pastOf(13), models: [{ t: last + 7.5 * M, k: 0 }], model, hourly, hours, split }, split + 10 * M);
  assert.ok(m.length === 2 && m[0].rates === model.rain[0] && near(m[0].alpha, 5 / 6) && near(m[1].alpha, 1 / 6), JSON.stringify(m));
  // (on the hours' own grid, where they've one)
  const wide = grid(52, 0, 13, 2.5, 6), w = partsAt({ ...src, hours: { ...hours, g: wide } }, split + 300 * M);
  assert.ok(w.length === 1 && w[0].g === wide, JSON.stringify(w.map((x) => x.g?.n)));
});
test("a grid's value at a place: the four points about it blended; none outside it", () => {
  const g = grid(52, 0, 3, 1), vals = [0, 10, 20, 30, 40, 50, 60, 70, 80];
  assert.equal(gridAt(g, vals, g.north, g.west), 0);
  assert.equal(gridAt(g, vals, 52, 0), 40, "the middle point");
  assert.ok(near(gridAt(g, vals, (g.north + 52) / 2, (g.west + 0) / 2), 20), "between four: blended");
  assert.equal(gridAt(g, vals, g.south - 0.1, 0), null);
  assert.equal(gridAt(g, [0, 10, null, 30, 40, 50, 60, 70, 80], 52.5, 0.5), null, "a point without one: none");
});
test("map tiles: where a place is on them, and where a tile's corner is", () => {
  const [x, y] = tileOf(52.63, 1.28, 9);
  assert.ok(Math.floor(x) === 257 && Math.floor(y) === 167, `${x} ${y}`);
  const [la, lo] = cornerOf(x, y, 9);
  assert.ok(near(la, 52.63, 1e-9) && near(lo, 1.28, 1e-9), `${la} ${lo}`);
  assert.deepEqual(cornerOf(0, 0, 0).map((v) => Math.round(v * 1e4) / 1e4), [85.0511, -180]);
  assert.deepEqual(tileOf(0, 0, 1), [1, 1]);
});
test("kept as rain, then coloured: as the smoothing draws it; and two frames blended as rain go through the radar's own colours", () => {
  // a tile of rain, heavier to the east, snow in its north-east corner
  const S = 512, codes = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = Math.sin(x / 23) * Math.cos(y / 31) + Math.sin((x + y) / 57); codes[y * S + x] = v > 0.3 ? (x > 300 && y < 150 ? 111 : 11) + Math.round(v * 12 + x / 20) : 0; }
  const code = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : codes[y * S + x]), LOOK = { edge: [0.16, 0.5], soft: 1.4 };
  const drawn = resample(new Uint8ClampedArray(256 * 256 * 4), 256, code, 100, 100, 128, LOOK);
  const vals = rainValues(new Uint8ClampedArray(256 * 256 * 4), 256, code, 100, 100, 128, LOOK), again = colour(vals, new Uint8ClampedArray(256 * 256 * 4), LOOK.soft);
  let off = 0, n = 0, worst = 0;
  for (let i = 0; i < drawn.length; i += 4) {
    if (!drawn[i + 3] && !again[i + 3]) continue;
    n++;
    const d = Math.max(...[0, 1, 2, 3].map((j) => Math.abs(drawn[i + j] - again[i + j])));
    if (drawn[i + 3] > 128) worst = Math.max(worst, d);
    off += d;
  }
  // (kept to a 255th of the 75 dB, a third of a dB, where the smoothing goes by quarters: the most a colour's off is where
  // the radar's jumps from blue to yellow)
  assert.ok(n > 10000 && off / n < 1.5 && worst <= 24, `${n} pixels; mean ${(off / n).toFixed(2)}, the worst where it's solid ${worst}`);
  // (dry: nothing there; where it's there, all of the alpha's its own)
  assert.equal(palette(false, 1.4).length, 256 * 4);
  // two pixels blended as rain: heavy (yellow) half way to light (blue) is the radar's colour for the rain between, not
  // a mix of the two colours
  const px = (dbz) => { const x = (dbz + 10) / 75; return [Math.round(x * 255), 255, 0, 255]; }, heavy = px(40), light = px(18);
  const mid = [0, 1, 2].map((j) => Math.round((heavy[j] + light[j]) / 2)).concat(255);
  const [r, g, b] = colour(Uint8ClampedArray.from(mid), new Uint8ClampedArray(4), 1.4), want = shade(29);
  assert.ok(Math.abs(r - want[0]) + Math.abs(g - want[1]) + Math.abs(b - want[2]) < 40, `${[r, g, b]} against ${want}`);
  const [hr, hg, hb] = colour(Uint8ClampedArray.from(heavy), new Uint8ClampedArray(4), 1.4), [lr, lg, lb] = colour(Uint8ClampedArray.from(light), new Uint8ClampedArray(4), 1.4);
  assert.ok(Math.abs(r - (hr + lr) / 2) + Math.abs(g - (hg + lg) / 2) + Math.abs(b - (hb + lb) / 2) > 60, "not the two colours' average");
});

// the quick way (the codes about the square stitched into one array, as radar.js hands them to radarwork.js) draws
// exactly what the pixel-by-pixel way does, across tiles' edges, snow and all
test("smoothing from the codes stitched together: the same, byte for byte", () => {
  const SRC = 512, A = new Uint8Array(SRC * SRC), B = new Uint8Array(SRC * SRC);
  for (let y = 0; y < SRC; y++) for (let x = 0; x < SRC; x++) {
    const v = Math.sin(x / 23) * Math.cos(y / 31) + Math.sin((x + y) / 57);
    A[y * SRC + x] = v > 0.1 ? (x > 300 && y < 150 ? 111 : 11) + Math.round(v * 20) : 0; B[y * SRC + x] = (x * 7 + y * 3) % 11 === 0 ? 30 : 0;
  }
  const from = new Map([["0,0", A], ["1,0", B]]);
  const code = (x, y) => { const ox = Math.floor(x / SRC), oy = Math.floor(y / SRC), t = from.get(`${ox},${oy}`); return t ? t[(y - oy * SRC) * SRC + (x - ox * SRC)] : 0; };
  const LOOK = { edge: [0.16, 0.5], soft: 1.4 };
  for (const [x0, y0, span] of [[100, 100, 128], [480, 20, 64], [0, 0, 256], [505, 500, 32], [3.5, 7.25, 64]]) {
    const ox = Math.floor(x0) - 2, oy = Math.floor(y0) - 2, w = Math.ceil(x0 + span + 2) - ox, h = Math.ceil(y0 + span + 2) - oy, data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = code(x + ox, y + oy);
    const a = rainValues(new Uint8ClampedArray(256 * 256 * 4), 256, code, x0, y0, span, LOOK), b = rainValues(new Uint8ClampedArray(256 * 256 * 4), 256, { data, w, h, ox, oy }, x0, y0, span, LOOK);
    assert.ok(a.some((v, i) => i % 4 === 1 && v > 0), "(some rain in it)");
    assert.ok(a.every((v, i) => v === b[i]), `the same at ${x0},${y0} over ${span}`);
  }
});

test("the rain about a place in words: nearest, how heavy, which way, and when it might be here", () => {
  const w = 768, c = w / 2, seen = new Uint8Array(w * w), blank = new Uint8Array(w * w);
  // (a patch of rain at a given dBZ, centred dx, dy pixels from the place: east and south positive)
  const patch = (dx, dy, dbz, snow = false) => { const a = new Uint8Array(w * w); for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) a[(c + dy + y) * w + c + dx + x] = (snow ? 111 : 11) + dbz; return a; };
  // no rain anywhere the radar sees: how far it's clear (half the square, at 51.5°: about 290 km)
  assert.equal(rainSaid(blank, seen, 51.5), "No rain within about 290 km.");
  // where the radar doesn't see the place: nothing said
  const unseen = new Uint8Array(w * w); unseen[c * w + c] = 1;
  assert.equal(rainSaid(blank, unseen, 51.5), "");
  // and only as far as it sees: blind from 60 pixels east (about 45 km at 51.5°)
  const part = new Uint8Array(w * w); for (let y = 0; y < w; y++) for (let x = c + 60; x < w; x++) part[y * w + x] = 1;
  assert.equal(rainSaid(blank, part, 51.5), "No rain within about 50 km.");
  // rain over the place
  assert.equal(rainSaid(patch(0, 0, 30), seen, 51.5), "Moderate rain here now.");
  // 40 pixels west (about 30 km at 51.5°), heavy, not moving that we know of
  assert.equal(rainSaid(patch(-46, 0, 40), seen, 51.5), "Heavy rain about 30 km to the west.");
  // the same, coming east at a pixel a minute (about 45 km/h): here in about 40 minutes
  assert.equal(rainSaid(patch(-46, 0, 40), seen, 51.5, { vx: 1, vy: 0 }), "Heavy rain about 30 km to the west, moving east at about 45 km/h: it could be here in about 40 minutes.");
  // going north, past: not this way
  assert.equal(rainSaid(patch(-46, 0, 40), seen, 51.5, { vx: 0, vy: -1 }), "Heavy rain about 30 km to the west, moving north at about 45 km/h, not this way.");
  // light snow to the north-east (its nearest edge about 25 km away)
  assert.equal(rainSaid(patch(30, -30, 15, true), seen, 51.5), "Light snow about 25 km to the north-east.");
  // too faint to count (under 15 dBZ): as if dry
  assert.equal(rainSaid(patch(0, 0, 10), seen, 51.5), "No rain within about 290 km.");
});
