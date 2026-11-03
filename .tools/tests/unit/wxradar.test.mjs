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

/* ---------- the radar's options for a screen of its own (One roof, spec §7.1 radar.js, §9.4 WX) ---------- */
// weather/radar.js on a small stand-in page: elements, the window's and the document's listeners counted, observers and
// workers watched, Leaflet stood in (no WebGL 2 here, so mapleaf.js draws the map). full: false (no full-screen button:
// no throw, no Escape listener), explore: true (explored at creation and on every resize, no "Tap to explore", a tap
// reads the weather, a tap on another place goes there), light, destroy() (every listener, observer, worker and the map
// let go), and every option left out keeps Weather's own page as it was.
const fake = (() => {
  const counts = { window: new Map(), document: new Map() };
  const bump = (who, type, fn, by) => { const m = counts[who]; const s = m.get(type) || new Set(); if (by > 0) s.add(fn); else s.delete(fn); m.set(type, s); };
  const live = (who) => [...counts[who].entries()].flatMap(([t, s]) => [...s].map(() => t));
  const VOID = new Set(["path", "circle", "rect", "br", "img", "input", "line", "polyline", "ellipse"]);
  const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  class Text { constructor(t) { this.nodeType = 3; this.data = String(t); this.parentElement = null; } get textContent() { return this.data; } set textContent(v) { this.data = String(v); }
    remove() { this.parentElement?._drop(this); } replaceWith(n) { const p = this.parentElement; if (p) { p._insertAt(p.childNodes.indexOf(this), n); p._drop(this); } } }
  const anim = () => ({ finished: Promise.resolve(), ready: Promise.resolve(), cancel() {}, finish() {}, currentTime: 0 });
  function parseSel(sel) {
    return sel.split(",").map((one) => one.trim().replace(/\s*>\s*/g, " ").split(/\s+/).map((c) => {
      const out = { tag: null, id: null, cls: [], attrs: [] };
      for (const m of c.matchAll(/^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="?([^"\]]*)"?)?\]/g)) {
        if (m[1]) out.tag = m[1].toUpperCase(); else if (m[2]) out.id = m[2]; else if (m[3]) out.cls.push(m[3]); else out.attrs.push([m[4], m[5]]);
      }
      return out;
    }));
  }
  const one = (el, c) => (!c.tag || el.tagName === c.tag) && (!c.id || el.getAttribute("id") === c.id) && c.cls.every((k) => el.classList.contains(k))
    && c.attrs.every(([a, v]) => (a === "hidden" ? el.hidden : el.hasAttribute(a)) && (v === undefined || el.getAttribute(a) === v));
  const matches = (el, sel) => parseSel(sel).some((chain) => {
    if (!one(el, chain[chain.length - 1])) return false;
    let at = el.parentElement;
    for (let k = chain.length - 2; k >= 0; k--) { while (at && !one(at, chain[k])) at = at.parentElement; if (!at) return false; at = at.parentElement; }
    return true;
  });
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentElement = null; this._a = new Map(); this._ev = new Map(); this.hidden = false; this.inert = false;
      const self = this;
      this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; }, getPropertyValue(k) { return this[k] ?? ""; } };
      this.dataset = new Proxy({}, { get: (_, k) => self.getAttribute(`data-${kebab(String(k))}`) ?? undefined, set: (_, k, v) => { self.setAttribute(`data-${kebab(String(k))}`, v); return true; },
        deleteProperty: (_, k) => { self.removeAttribute(`data-${kebab(String(k))}`); return true; } });
      this.classList = { _l: () => (self.getAttribute("class") || "").split(/\s+/).filter(Boolean), contains: (k) => self.classList._l().includes(k),
        add: (...ks) => self.setAttribute("class", [...new Set([...self.classList._l(), ...ks])].join(" ")), remove: (...ks) => self.setAttribute("class", self.classList._l().filter((k) => !ks.includes(k)).join(" ")),
        toggle: (k, on) => { const has = self.classList.contains(k), want = on === undefined ? !has : !!on; if (want) self.classList.add(k); else self.classList.remove(k); return want; } };
      if (this.tagName === "CANVAS") { this.width = 300; this.height = 150; }
    }
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; } get lastElementChild() { return this.children.at(-1) || null; }
    get firstChild() { return this.childNodes[0] || null; } get lastChild() { return this.childNodes.at(-1) || null; }
    get nextElementSibling() { const s = this.parentElement?.children || []; return s[s.indexOf(this) + 1] || null; }
    get previousElementSibling() { const s = this.parentElement?.children || []; return s[s.indexOf(this) - 1] || null; }
    get className() { return this.getAttribute("class") || ""; } set className(v) { this.setAttribute("class", v); }
    get id() { return this.getAttribute("id") || ""; } set id(v) { this.setAttribute("id", v); }
    get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return n === doc.documentElement; }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(""); }
    set textContent(v) { this.replaceChildren(...(String(v ?? "") ? [String(v)] : [])); }
    set innerHTML(html) { this.replaceChildren(); parseInto(this, String(html)); } get innerHTML() { return ""; }
    get offsetWidth() { return 0; } get offsetHeight() { return 0; } get offsetLeft() { return 0; } get offsetTop() { return 0; }
    get clientWidth() { return 300; } get clientHeight() { return 300; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
    setAttribute(k, v) { this._a.set(k, String(v)); if (k === "hidden") this.hidden = true; } getAttribute(k) { return this._a.has(k) ? this._a.get(k) : null; }
    hasAttribute(k) { return this._a.has(k); } removeAttribute(k) { this._a.delete(k); if (k === "hidden") this.hidden = false; }
    _wrap(n) { return typeof n === "string" || typeof n === "number" ? new Text(n) : n; }
    _drop(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentElement = null; }
    _insertAt(i, n) { n = this._wrap(n); n.parentElement?._drop(n); this.childNodes.splice(i, 0, n); n.parentElement = this; }
    append(...ns) { for (const n of ns) this._insertAt(this.childNodes.length, n); } prepend(...ns) { ns.reverse().forEach((n) => this._insertAt(0, n)); }
    appendChild(n) { this.append(n); return n; } removeChild(n) { this._drop(n); return n; }
    after(...ns) { const p = this.parentElement; if (!p) return; let i = p.childNodes.indexOf(this) + 1; for (const n of ns) p._insertAt(i++, n); }
    before(...ns) { const p = this.parentElement; if (!p) return; let i = p.childNodes.indexOf(this); for (const n of ns) p._insertAt(i++, n); }
    remove() { this.parentElement?._drop(this); } replaceChildren(...ns) { for (const n of [...this.childNodes]) this._drop(n); this.append(...ns); }
    replaceWith(n) { const p = this.parentElement; if (p) { p._insertAt(p.childNodes.indexOf(this), n); p._drop(this); } }
    contains(n) { for (; n; n = n.parentElement) if (n === this) return true; return false; }
    matches(sel) { return matches(this, sel); } closest(sel) { for (let n = this; n; n = n.parentElement) if (n.nodeType === 1 && n.matches(sel)) return n; return null; }
    querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (matches(c, sel)) out.push(c); walk(c); } }; walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    addEventListener(t, fn) { const s = this._ev.get(t) || new Set(); s.add(fn); this._ev.set(t, s); } removeEventListener(t, fn) { this._ev.get(t)?.delete(fn); }
    dispatchEvent(e) { e.target ??= this; let stop = false; e.stopPropagation = () => { stop = true; }; e.preventDefault ??= () => {};
      for (let n = this; n && !stop; n = n.parentElement) for (const fn of [...(n._ev.get(e.type) || [])]) fn.call(n, e);
      if (!stop) for (const fn of [...(doc._ev.get(e.type) || [])]) fn(e); return true; }
    click() { if (!this.disabled) this.dispatchEvent({ type: "click" }); }
    focus() { doc.activeElement = this; } blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    animate() { return anim(); } getAnimations() { return []; }
    getContext(kind) { if (kind !== "2d") return null; const t = { canvas: this, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), measureText: () => ({ width: 0 }) };
      return new Proxy(t, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } }); }
    toDataURL() { return ""; }
  }
  function parseInto(root, html) {
    let at = root;
    for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
      if (m[5] != null) { at.append(m[5]); continue; }
      if (m[1]) { at = at.parentElement || root; continue; }
      const el = new El(m[2]);
      for (const a of m[3].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) el.setAttribute(a[1], a[2] ?? "");
      at.append(el);
      if (!m[4] && !VOID.has(m[2].toLowerCase())) at = el;
    }
  }
  const doc = new El("#document");
  doc.documentElement = new El("html"); doc.body = new El("body"); doc.head = new El("head");
  doc.documentElement.append(doc.head, doc.body); doc.activeElement = doc.body; doc.visibilityState = "visible";
  doc.createElement = (t) => new El(t);
  doc.querySelector = (s) => doc.documentElement.querySelector(s); doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  const docAdd = El.prototype.addEventListener, docRemove = El.prototype.removeEventListener;
  doc.addEventListener = (t, fn, o) => { docAdd.call(doc, t, fn, o); bump("document", t, fn, 1); };
  doc.removeEventListener = (t, fn) => { docRemove.call(doc, t, fn); bump("document", t, fn, -1); };
  // the window
  const winEv = new Map();
  const observers = [];
  class Obs { constructor(cb, kind) { this.cb = cb; this.kind = kind; this.els = []; this.on = true; observers.push(this); } observe(el) { this.els.push(el); this.on = true; } unobserve(el) { this.els = this.els.filter((x) => x !== el); } disconnect() { this.on = false; this.els = []; } }
  const mqls = [];
  const media = { "(pointer: coarse)": false, "(prefers-color-scheme: light)": false, "(prefers-reduced-motion: reduce)": true };
  const workersMade = [];
  Object.assign(globalThis, {
    window: globalThis, document: doc, devicePixelRatio: 1, self: globalThis,
    addEventListener: (t, fn) => { const s = winEv.get(t) || new Set(); s.add(fn); winEv.set(t, s); bump("window", t, fn, 1); },
    removeEventListener: (t, fn) => { winEv.get(t)?.delete(fn); bump("window", t, fn, -1); },
    matchMedia: (q) => { const l = new Set(); const m = { media: q, get matches() { return !!media[q]; }, addEventListener: (t, fn) => l.add(fn), removeEventListener: (t, fn) => l.delete(fn), listeners: l }; mqls.push(m); return m; },
    IntersectionObserver: class extends Obs { constructor(cb) { super(cb, "io"); } },
    ResizeObserver: class extends Obs { constructor(cb) { super(cb, "ro"); } },
    requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 16), cancelAnimationFrame: (id) => clearTimeout(id),
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    ImageData: class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } },
    createImageBitmap: async () => ({ close() {} }),
    Worker: class { constructor() { this.terminated = false; workersMade.push(this); } postMessage() {} terminate() { this.terminated = true; } },
    getComputedStyle: () => ({ opacity: "1", transform: "none" }),
    fetch: async () => { throw new Error("offline (test)"); },
  });
  if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; }
  Object.defineProperty(globalThis, "navigator", { value: { hardwareConcurrency: 2, onLine: true }, configurable: true });
  // Leaflet, stood in: enough for mapleaf.js
  const maps = [], markers = [];
  const handler = (on) => ({ on, enable() { this.on = true; }, disable() { this.on = false; }, enabled() { return this.on; } });
  const chain = () => { const c = { on: () => c, addTo: () => c, setStyle: () => c, setOpacity() {}, bringToFront() {}, setLatLng() {}, remove() {} }; return c; };
  const layer = () => class { constructor(o) { this.options = o || {}; } addTo() { return this; } setOpacity() {} bringToFront() {} on() { return this; } };
  globalThis.L = {
    map(el, o) {
      const m = { el, o, ev: new Map(), z: 0, center: [0, 0], sized: 0, removed: false, dragging: handler(o.dragging !== false), scrollWheelZoom: handler(!!o.scrollWheelZoom), touchZoom: handler(true),
        setView(ll, z) { this.center = ll; if (z != null) this.z = z; return this; }, createPane() { return { style: {} }; },
        on(t, fn) { const l = this.ev.get(t) || []; l.push(fn); this.ev.set(t, l); return this; }, fire(t, e) { for (const fn of this.ev.get(t) || []) fn(e); return this; },
        invalidateSize() { this.sized++; }, getZoom() { return this.z; }, getCenter() { return { lat: this.center[0], lng: this.center[1] }; }, setZoom(z) { this.z = z; this.fire("move"); },
        zoomIn() { this.z++; this.fire("move"); }, zoomOut() { this.z--; this.fire("move"); }, removeLayer() {}, addLayer() {}, remove() { this.removed = true; },
        getBounds() { return { getSouth: () => 0, getWest: () => 0, getNorth: () => 1, getEast: () => 1 }; } };
      maps.push(m); return m;
    },
    tileLayer: chain, layerGroup: chain, polygon: chain, rectangle: chain,
    marker(ll, o) { const mk = { ll, o, removed: false, addTo() { return mk; }, setLatLng(x) { mk.ll = x; }, remove() { mk.removed = true; } }; markers.push(mk); return mk; },
    divIcon: (o) => o, GridLayer: { extend: layer }, ImageOverlay: { extend: layer }, DomUtil: { addClass() {} }, Util: { falseFn() {} }, DomEvent: { disableClickPropagation() {} },
  };
  return { doc, El, live, observers, mqls, media, workersMade, maps, markers };
})();

// a radar card as Weather's own page has it (index.html), with or without its full-screen button
function cardOf(withFull = true) {
  const host = fake.doc.createElement("div");
  host.innerHTML = `<section class="card radar" id="radar"><div class="card-head"><h2 class="card-title">Rain radar</h2>${withFull ? '<button class="icon-btn small radar-full" type="button" aria-label="Full screen" data-on="0"></button>' : ""}</div>`
    + '<p class="radar-note"><span></span></p><div class="radar-wrap"><div class="radar-map"></div><p class="sr-only" id="radar-said"></p><span class="radar-chip" data-kind="radar"></span><span class="radar-hint" hidden>Tap to explore</span></div>'
    + '<div class="radar-dock"><div class="radar-bar"><button class="icon-btn small radar-play" type="button" aria-label="Play" data-on="0"></button><div class="radar-track"><input class="radar-slider" type="range"><div class="radar-scale"></div></div></div><p class="radar-time"></p></div>'
    + '<div class="radar-legend"></div><p class="chart-note radar-status"><span></span></p></section>';
  const card = host.firstElementChild;
  fake.doc.body.append(card);
  return card;
}
const { radar } = await import("../../../weather/radar.js");
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const OPTS = { lat: 51.5, lon: -0.12, time: (t) => String(t) };
// (made, then the card comes into sight: the map's made as the page comes to rest, as on Weather's page)
async function shown(card, opts) {
  const mapsBefore = fake.maps.length, obsBefore = fake.observers.length;
  const r = radar(card, { ...OPTS, ...opts });
  const io = fake.observers.slice(obsBefore).filter((o) => o.kind === "io" && o.on && o.els.includes(card)).at(-1);
  io.cb([{ isIntersecting: true, target: card }]);
  for (let k = 0; k < 40 && fake.maps.length === mapsBefore; k++) await wait(25);
  await wait(30);
  return { r, map: fake.maps.at(-1), made: fake.maps.length > mapsBefore, obs: () => fake.observers.slice(obsBefore) };
}
const tally = () => ({ window: fake.live("window").sort(), document: fake.live("document").sort(), mql: fake.mqls.reduce((n, m) => n + m.listeners.size, 0) });

test("radar.js, full: false: markup with no full-screen button is no trouble, and no Escape listener is added", async () => {
  fake.media["(pointer: coarse)"] = true;
  const before = tally();
  const card = cardOf(false);
  const { r, map, made } = await shown(card, { full: false });
  assert.ok(made, "the map is made");
  assert.ok(!tally().document.includes("keydown"), "no document keydown listener");
  // a tap on the map, in the card with a finger: never grown (there's no full screen to grow to); a reading instead
  const marks = fake.markers.length;
  map.fire("click", { latlng: { lat: 51.4, lng: -0.1 } });
  assert.ok(!card.classList.contains("radar-big"));
  assert.ok(fake.markers.length > marks && fake.markers.at(-1).o.icon.html.classList.contains("map-read"), "a reading at the spot");
  r.destroy();
  assert.deepEqual(tally(), before, "everything it added let go");
  card.remove();
});

test("radar.js, explore: true: explored as it's made and on every resize, no Tap to explore, a tap reads, a bubble goes", async () => {
  fake.media["(pointer: coarse)"] = true;
  const card = cardOf(false), hint = card.querySelector(".radar-hint");
  const { r, map, obs } = await shown(card, { full: false, explore: true });
  assert.ok(map.dragging.enabled() && map.scrollWheelZoom.enabled(), "dragged and zoomed where it is, with a finger");
  assert.equal(map.o.dragging, false, "(Leaflet made for a finger: it's explore that turns dragging on)");
  assert.ok(hint.hidden, "no Tap to explore");
  // a resize: measured again and still explored
  map.dragging.disable();
  const ro = obs().find((o) => o.kind === "ro" && o.on && o.els.includes(card.querySelector(".radar-map")));
  const sized = map.sized;
  ro.cb([]);
  assert.ok(map.dragging.enabled() && map.sized > sized, "explored and measured again on a resize");
  // a tap on the map: a reading there, never grown
  const marks = fake.markers.length;
  map.fire("click", { latlng: { lat: 51.6, lng: -0.2 } });
  assert.ok(!card.classList.contains("radar-big"));
  assert.ok(fake.markers.slice(marks).some((m) => m.o.icon.html.classList.contains("map-read")));
  // another saved place: its bubble goes there
  let went = 0;
  r.others([{ name: "Leeds", lat: 53.8, lon: -1.55, temp: "9°", colour: null, go: () => went++ }]);
  const bubble = fake.markers.map((m) => m.o.icon.html).find((b) => b.classList.contains("map-other"));
  bubble.click();
  assert.equal(went, 1, "the bubble's place shown");
  assert.ok(!card.classList.contains("radar-big"));
  await wait(20);
  assert.ok(hint.hidden, "still no hint");
  r.destroy();
  card.remove();
});

test("radar.js, light: the map's day or night style as asked, else as the phone has it", async () => {
  fake.media["(prefers-color-scheme: light)"] = true;
  for (const [light, want] of [[true, true], [false, false], [undefined, true]]) {
    const card = cardOf(false), r = radar(card, { ...OPTS, full: false, ...(light === undefined ? {} : { light }) });
    assert.equal(card.classList.contains("light-map"), want, `light: ${light}`);
    r.destroy(); card.remove();
  }
  fake.media["(prefers-color-scheme: light)"] = false;
  const card = cardOf(false), r = radar(card, { ...OPTS, full: false });
  assert.ok(!card.classList.contains("light-map"), "left out, the phone's dark");
  r.destroy(); card.remove();
});

test("radar.js destroy(): every window and document listener, observer, media listener, worker and the map let go", async () => {
  fake.media["(pointer: coarse)"] = false;
  const before = tally();
  const card = cardOf(true);
  const { r, map, obs } = await shown(card, {});
  const during = tally();
  assert.ok(during.document.includes("keydown") && during.document.includes("visibilitychange") && during.document.includes("click"), JSON.stringify(during));
  assert.ok(during.mql > before.mql, "the pointer's media query listened to");
  r.destroy();
  assert.deepEqual(tally(), before, "listeners all removed");
  assert.ok(obs().every((o) => !o.on), "observers all disconnected");
  assert.ok(map.removed, "the map removed");
  // (no frames come on this stand-in, so no worker or blender is made here: the next case has them)
  r.destroy();     // (twice is no trouble)
  card.remove();
});

test("radar.js destroy() with its frames in: the workers made for its tiles terminated, the graphics chip's blender dropped and its context lost", async () => {
  fake.media["(pointer: coarse)"] = false;
  // RainViewer's list of frames (the last three ten-minute frames), its tiles as pictures that come at once, and a
  // stand-in WebGL context for radarmix.js's blender: its textures and its context counted
  const was = { fetch: globalThis.fetch, Image: globalThis.Image, getContext: fake.El.prototype.getContext };
  const step = Math.floor(Date.now() / 600e3) * 600;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://api.rainviewer.com/")) return { ok: true, json: async () => ({ host: "https://tiles.test", radar: { past: [2, 1, 0].map((k) => ({ time: step - k * 600, path: `/v2/radar/${step - k * 600}` })) } }) };
    throw new Error("offline (test)");
  };
  const tilesAsked = [];
  globalThis.Image = class { set src(u) { tilesAsked.push(u); setTimeout(() => this.onload?.(), 0); } };
  const chip = { made: 0, textures: 0, deleted: 0, lost: 0 };
  fake.El.prototype.getContext = function (kind, o) {
    if (kind !== "webgl") return was.getContext.call(this, kind, o);
    if (this._gl) return this._gl;
    chip.made++;
    const own = { getProgramParameter: () => true, getParameter: () => 4096, createTexture: () => ({ n: ++chip.textures }), deleteTexture: () => { chip.deleted++; },
      getExtension: (n) => (n === "WEBGL_lose_context" ? { loseContext: () => { chip.lost++; } } : null) };
    return (this._gl = new Proxy(own, { get: (o, k) => (k in o ? o[k] : typeof k === "string" && /^[A-Z_0-9]+$/.test(k) ? 1 : () => ({})) }));
  };
  const before = fake.workersMade.length;
  const card = cardOf(false);
  let r, canvas;
  try {
    ({ r } = await shown(card, { full: false, explore: true }));
    for (let k = 0; k < 80 && (fake.workersMade.length === before || !chip.made); k++) await wait(25);
    const made = fake.workersMade.slice(before);
    assert.ok(tilesAsked.length > 0, "the radar's tiles asked for");
    assert.ok(made.length > 0, "workers made for its tiles");
    assert.equal(chip.made, 1, "the graphics chip's blender made");
    assert.ok(made.every((w) => !w.terminated), "and working, till it's let go");
    r.destroy();
    assert.ok(made.every((w) => w.terminated), "every worker terminated (the last radar on the page)");
    // (drop() comes first on the same line: its context lost means it ran)
    assert.equal(chip.lost, 1, "the blender's context lost");
    assert.ok(chip.deleted >= chip.textures - 1, "its textures let go (all but the colours, which go with the context)");
    r.destroy();
    assert.equal(chip.lost, 1, "(twice is no trouble)");
  } finally {
    globalThis.fetch = was.fetch; globalThis.Image = was.Image; fake.El.prototype.getContext = was.getContext;
    r?.destroy(); card.remove();
  }
});

test("radar.js with no options: Weather's own page as it was (full screen, Tap to explore, its Escape)", async () => {
  fake.media["(pointer: coarse)"] = true;
  const card = cardOf(true);
  const { r, map } = await shown(card, {});
  assert.ok(!map.dragging.enabled(), "in the card with a finger, the page scrolls past the map");
  assert.ok(tally().document.includes("keydown"), "Escape closes full screen");
  // a tap on the map with a finger: full screen, explored there
  map.fire("click", { latlng: { lat: 51.4, lng: -0.1 } });
  assert.ok(card.classList.contains("radar-big"), "grown to full screen");
  assert.ok(map.dragging.enabled(), "explored full screen");
  card.querySelector(".radar-full").click();
  assert.ok(!card.classList.contains("radar-big") && !map.dragging.enabled(), "and back");
  // a bubble with a finger in the card: full screen first, as anywhere on it
  let went = 0;
  r.others([{ name: "Leeds", lat: 53.8, lon: -1.55, temp: "9°", colour: null, go: () => went++ }]);
  fake.markers.map((m) => m.o.icon.html).filter((b) => b.classList.contains("map-other")).at(-1).click();
  assert.ok(card.classList.contains("radar-big") && went === 0);
  r.destroy();
  card.remove();
});
