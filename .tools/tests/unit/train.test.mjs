// Cadence's files (train/fit.js, train/formats.js): FIT read and written byte for byte as the protocol has it, a ride
// round the three activity formats and back with the same figures, and a workout out to each device's file and back
// with the same shape. (The FIT files were also checked against Garmin's own FIT SDK while they were written: its
// decoder reads them whole, CRCs and all, and each field as written.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFit, writeFit, crc16, FIT_EPOCH } from '../../../train/fit.js';
import {
  fitFromActivity, gpxFromActivity, tcxFromActivity, fitFromWorkout, workoutFromFit, zwoFromWorkout, workoutFromZwo,
  ergFromWorkout, mrcFromWorkout, workoutFromCourse, planFromWorkout, readAny, zip, unzip, crc32,
} from '../../../train/formats.js';
import { WORKOUTS, workoutById, measure, layOut, PLANS, mondayOf } from '../../../train/workouts.js';
import { activityFromFit } from '../../../train/formats.js';
import { summarise, fitness, bestEfforts } from '../../../train/load.js';
import { demo, samples, PROFILE } from '../../../train/sample.js';

const enc = (s) => new TextEncoder().encode(s);

test('the FIT CRC is the protocol\'s (its check value for "123456789" is 0xBB3D)', () => {
  assert.equal(crc16(enc('123456789')), 0xbb3d);
});

test('a FIT file: its header, its definitions once per shape, and its CRC', () => {
  const t = 1792310400;
  const b = writeFit([['fileId', { type: 4, manufacturer: 255, product: 0, serial: 7, created: t }],
    ...Array.from({ length: 3 }, (_, i) => ['record', { timestamp: t + i, lat: 51.5, lon: -0.12, power: 200 + i, heartRate: 140 }])]);
  assert.equal(b[0], 14);
  assert.equal(String.fromCharCode(...b.subarray(8, 12)), '.FIT');
  const dv = new DataView(b.buffer);
  assert.equal(dv.getUint32(4, true), b.length - 16, 'the data size leaves out the header and the CRC');
  assert.equal(dv.getUint16(12, true), crc16(b, 0, 12));
  assert.equal(dv.getUint16(b.length - 2, true), crc16(b, 0, b.length - 2));
  // (two definitions, for two shapes of message; three records after one)
  let defs = 0;
  for (let i = 14; i < b.length - 2;) { const h = b[i]; if (h & 0x40) { defs++; i += 6 + b[i + 5] * 3; } else i += h === 0 ? 1 + 1 + 2 + 2 + 4 + 4 : 1 + 4 + 4 + 4 + 2 + 1; }
  assert.equal(defs, 2);
  const r = readFit(b);
  assert.equal(r.damaged, undefined);
  assert.equal(r.messages.record.length, 3);
  assert.equal(r.messages.record[2].power, 202);
  assert.equal(r.messages.record[0].timestamp, t);
  assert.ok(Math.abs(r.messages.record[0].lat - 51.5) < 1e-6);
});

test('a FIT file cut short is read as far as it goes, and a damaged one says so', () => {
  const t = 1792310400;
  const b = writeFit([['fileId', { type: 4, manufacturer: 1, product: 0, serial: 7, created: t }], ...Array.from({ length: 50 }, (_, i) => ['record', { timestamp: t + i, power: i }])]);
  const cut = readFit(b.subarray(0, 300));
  assert.equal(cut.truncated, true);
  assert.ok(cut.messages.record.length > 10 && cut.messages.record.length < 50);
  const bad = b.slice(); bad[200] ^= 0xff;
  assert.equal(readFit(bad).damaged, true);
  assert.throws(() => readFit(enc('<gpx></gpx>')), /isn’t a FIT file|too short/);
});

test('a FIT file\'s compressed timestamps count on from the last full one', () => {
  // a definition for records with power alone, a full timestamp by the event before, then two compressed records
  const t = FIT_EPOCH + 1000000000 + 30;   // (its low five bits: 30)
  const head = writeFit([['fileId', { type: 4, manufacturer: 1, product: 0, serial: 7, created: t }], ['event', { timestamp: t, event: 0, eventType: 0 }]]);
  const body = head.subarray(14, head.length - 2);
  const def = [0x42, 0, 0, 20, 0, 1, 7, 2, 0x84];
  const rec = (off, p) => [0x80 | (2 << 5) | off, p & 0xff, p >> 8];
  const data = new Uint8Array([...body, ...def, ...rec(31, 250), ...rec(1, 260)]);     // (31: a second on; 1: past the wrap)
  const out = new Uint8Array(14 + data.length + 2); out.set(head.subarray(0, 14)); out.set(data, 14);
  new DataView(out.buffer).setUint32(4, data.length, true);
  new DataView(out.buffer).setUint16(12, crc16(out, 0, 12), true);
  new DataView(out.buffer).setUint16(out.length - 2, crc16(out, 0, out.length - 2), true);
  const r = readFit(out).messages.record;
  assert.deepEqual(r.map((x) => [x.power, x.timestamp - t]), [[250, 1], [260, 3]]);
});

test('a ride goes out as FIT, GPX and TCX, and comes back with the same figures', async () => {
  const D = demo(Date.UTC(2026, 9, 25, 10));
  const h = D.history.find((x) => x.workout === 'recovery-45' && !x.indoor);
  const a = samples(h), s = summarise(a, PROFILE);
  assert.ok(s.dist > 10000 && s.np > 100 && s.ascent > 50, 'a ride with a route, power and hills');
  for (const [ext, data] of [['fit', fitFromActivity(a, s)], ['gpx', gpxFromActivity(a)], ['tcx', tcxFromActivity(a, s)]]) {
    const r = await readAny(`ride.${ext}`, typeof data === 'string' ? enc(data) : data);
    const b = r.activities[0], s2 = summarise(b, PROFILE);
    assert.equal(b.s.t.length, a.s.t.length, `${ext}: every sample`);
    assert.equal(s2.np, s.np, `${ext}: Normalized Power`);
    assert.equal(s2.avgHr, s.avgHr, `${ext}: heart rate`);
    assert.ok(Math.abs(s2.dist - s.dist) < 15, `${ext}: distance`);
    assert.ok(Math.abs(s2.ascent - s.ascent) <= 5, `${ext}: climbing`);
    assert.equal(Math.round(b.start / 1000), Math.round(a.start / 1000), `${ext}: when it started`);
  }
});

test('a workout as a FIT workout file: power as a share of FTP, repeats pointing back to their first step', () => {
  const w = workoutById('ss-3x12'), b = fitFromWorkout(w, { created: Date.UTC(2026, 9, 25) });
  const M = readFit(b).messages;
  assert.equal(M.fileId[0].type, 5);
  assert.equal(M.workout[0].name, 'Sweet spot 3 × 12');
  assert.equal(M.workout[0].steps, M.workoutStep.length);
  const [warm, work, easy, again, cool] = M.workoutStep;
  assert.deepEqual([warm.durationValue, warm.targetType, warm.low, warm.high, warm.intensity], [600000, 4, 50, 75, 2]);
  assert.deepEqual([work.durationValue, work.low, work.high, work.intensity], [720000, 88, 93, 0]);
  assert.equal(easy.intensity, 1);
  assert.deepEqual([again.durationType, again.durationValue, again.targetValue], [6, 1, 3], 'repeat steps 1 and 2 three times');
  assert.equal(cool.intensity, 3);
  // and back
  const back = workoutFromFit(b, 'x.fit');
  assert.equal(Math.round(measure(back).secs), Math.round(measure(w).secs));
  assert.equal(back.steps[1].repeat, 3);
  // a cadence held alongside the power; a run's pace as speed; a swim by distance, in a pool
  const hill = readFit(fitFromWorkout(workoutById('hill-6x3'))).messages.workoutStep[1];
  assert.deepEqual([hill.target2Type, hill.low2, hill.high2], [3, 60, 70]);
  const run = readFit(fitFromWorkout(workoutById('run-800s'), { pace: 1000 / 260 })).messages.workoutStep;
  assert.deepEqual([run[1].durationType, run[1].durationValue, run[1].targetType], [1, 80000, 0]);
  assert.ok(run[1].low > 3900 && run[1].high < 4400, '5k pace for a 4:20 threshold, in mm/s');
  const swim = readFit(fitFromWorkout(workoutById('swim-css'))).messages;
  assert.deepEqual([swim.workout[0].sport, swim.workout[0].subSport, swim.workout[0].poolLength], [5, 17, 25]);
});

test('a workout out to Zwift, TrainerRoad and an older ELEMNT, and back', () => {
  for (const w of WORKOUTS.filter((x) => x.sport === 'ride')) {
    const m = measure(w);
    const z = workoutFromZwo(zwoFromWorkout(w), 'x.zwo');
    assert.equal(Math.round(measure(z).secs), Math.round(m.secs), `${w.id}: ZWO`);
    assert.ok(Math.abs(measure(z).tss - m.tss) < 0.6, `${w.id}: ZWO's stress`);
    const e = workoutFromCourse(ergFromWorkout(w, 265), 'x.erg');
    assert.ok(Math.abs(measure(e).tss - m.tss) < 1.5, `${w.id}: ERG`);
    const c = workoutFromCourse(mrcFromWorkout(w), 'x.mrc');
    assert.ok(Math.abs(measure(c).tss - m.tss) < 0.6, `${w.id}: MRC`);
  }
  assert.match(zwoFromWorkout(workoutById('ss-3x12')), /<IntervalsT Repeat="3" OnDuration="720" OffDuration="300" OnPower="0.9" OffPower="0.55"\/>/);
  const plan = planFromWorkout(workoutById('ss-3x12'));
  assert.match(plan, /^=HEADER=\nNAME=Sweet spot 3 × 12\n/);
  assert.equal((plan.match(/=INTERVAL=/g) || []).length, 8, 'repeats written out in full');
  assert.match(plan, /PERCENT_FTP_LO=88\nPERCENT_FTP_HI=93\nMESG_DURATION_SEC>=720\?EXIT/);
});

test('real devices\' quirks: a corrupt last sample, a sensor of zeros, a triathlon in one file, the oldest speed fields', () => {
  const t0 = 1792310400, id = (serial) => ['fileId', { type: 4, manufacturer: 1, product: 1, serial, created: t0 }];
  const rec = (i, x = {}) => ['record', { timestamp: t0 + i, heartRate: 140, power: 0, cadence: 0, distance: i * 5, ...x }];
  // (a device that lost power mid-write: its last sample dated decades on; and a power meter it never had, all zeros)
  const cut = activityFromFit(writeFit([id(1), ...Array.from({ length: 600 }, (_, i) => rec(i)), ['record', { timestamp: t0 + 2e9, heartRate: 140 }],
    ['session', { timestamp: t0 + 599, startTime: t0, sport: 2, elapsed: 599, timer: 599 }]]))[0];
  assert.equal(cut.s.t.length, 600, 'the corrupt last sample left out');
  assert.equal(cut.s.pwr, null, 'a power column of zeros: no power meter');
  assert.ok(summarise(cut).moving >= 599);
  // (a triathlon: a ride, a transition and a run in one file, its distance counted on through them all)
  const tri = activityFromFit(writeFit([id(2), ...Array.from({ length: 3420 }, (_, i) => rec(i, { distance: i * 4 })),
    ['session', { timestamp: t0 + 1800, startTime: t0, sport: 2, elapsed: 1800, timer: 1800 }],
    ['session', { timestamp: t0 + 1920, startTime: t0 + 1800, sport: 3, elapsed: 120, timer: 120 }],
    ['session', { timestamp: t0 + 3419, startTime: t0 + 1920, sport: 1, elapsed: 1499, timer: 1499 }]]));
  assert.deepEqual(tri.map((a) => a.sport), ['ride', 'run'], 'the ride and the run, the transition left out');
  assert.ok(Math.abs(summarise(tri[1]).dist - 1499 * 4) < 10, 'the run\'s distance its own, not the whole file\'s');
  // (a Forerunner 405's three bytes of speed and distance, as the writer has no field for them: written here by hand,
  // 4.5 m/s and 8 m on each second)
  const head = writeFit([id(3)]), body = [...head.subarray(14, head.length - 2)];
  body.push(0x41, 0, 0, 20, 0, 3, 253, 4, 0x86, 3, 1, 0x02, 8, 3, 0x0d);
  for (let i = 0; i < 100; i++) {
    const d = (i * 8 * 16) % 4096;
    body.push(1, ...new Uint8Array(new Uint32Array([t0 + i - 631065600]).buffer), 150, 450 & 0xff, ((450 >> 8) & 0x0f) | ((d & 0x0f) << 4), d >> 4);
  }
  const u = new Uint8Array(14 + body.length + 2), dv = new DataView(u.buffer);
  u.set(head.subarray(0, 14)); u.set(body, 14);
  dv.setUint32(4, body.length, true); dv.setUint16(12, crc16(u, 0, 12), true); dv.setUint16(u.length - 2, crc16(u, 0, u.length - 2), true);
  // (a swim whose heart rate was barely heard, as a strap isn't under water: its stress from its pace against CSS instead)
  const swim = activityFromFit(writeFit([id(4), ...Array.from({ length: 1800 }, (_, i) => ['record', { timestamp: t0 + i, distance: i * 0.85, ...(i < 8 ? { heartRate: 140 } : {}) }]),
    ['session', { timestamp: t0 + 1799, startTime: t0, sport: 5, elapsed: 1799, timer: 1799 }]]))[0], ss = summarise(swim, { css: 108 });
  assert.ok(ss.kind === 'pace' && Math.abs(ss.tss - Math.round(0.5 * (0.85 / (100 / 108)) ** 3 * 100)) <= 1, `a swim's stress from its pace: ${ss.tss} (${ss.kind})`);
  const old = activityFromFit(u)[0];
  assert.ok(Math.abs(summarise(old).dist - 99 * 8) < 1 && Math.abs(old.s.spd[50] - 4.5) < 0.01, 'speed and distance unpacked');
});

test('a zip of files, stored or deflated, opens to the same files', async () => {
  const files = [{ name: 'a.zwo', data: zwoFromWorkout(WORKOUTS[0]) }, { name: 'b.fit', data: fitFromWorkout(WORKOUTS[3]) }];
  const z = zip(files), back = await unzip(z);
  assert.deepEqual(back.map((f) => f.name), ['a.zwo', 'b.fit']);
  assert.deepEqual([...back[1].data], [...files[1].data]);
  assert.equal(crc32(enc('123456789')), 0xcbf43926);
  const r = await readAny('export.zip', z);
  assert.equal(r.workouts.length, 2);
});

test('training load: Normalized Power, best efforts, and fitness against a steady diet', () => {
  assert.deepEqual(bestEfforts(Array.from({ length: 600 }, (_, i) => (i >= 100 && i < 400 ? 300 : 100)))[300], 300);
  // an hour a day at FTP for a long time: fitness and fatigue both come to 100, form to nothing
  const daily = {}, start = new Date(2026, 0, 1).getTime();
  for (let d = 0; d < 400; d++) daily[new Date(2026, 0, 1 + d).getTime()] = 100;
  const f = fitness(daily, start, new Date(2026, 0, 400).getTime()), last = f[f.length - 1];
  assert.ok(Math.abs(last.ctl - 100) < 0.5 && Math.abs(last.atl - 100) < 0.5 && Math.abs(last.tsb) < 0.5);
  // a plan's weeks: every day dated, Monday first, the recovery weeks easier
  const weeks = layOut(PLANS[0], mondayOf(Date.UTC(2026, 8, 28)));
  assert.equal(weeks.length, 16);
  assert.equal(new Date(weeks[0].days[0].date).getDay(), 1);
  const load = (wk) => wk.days.reduce((a, d) => a + (d.id && workoutById(d.id) ? measure(workoutById(d.id)).tss : 0), 0);
  assert.ok(load(weeks[3]) < load(weeks[2]) * 0.7, 'week 4 is a recovery week');
});
