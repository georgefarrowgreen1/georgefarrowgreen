// Progress's figures (fitness/progress.js), from activities' rows alone
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bests, weekly, streak, efficiency, riderType, intensity, stayingPower, daily } from '../../../fitness/progress.js';
import { DAY, startOfDay, mondayOf, addDays } from '../../../fitness/workouts.js';

const today = startOfDay(Date.UTC(2026, 9, 25, 12));
const ride = (daysAgo, sum, id = `r${daysAgo}`) => ({ id, name: `Ride ${daysAgo}`, start: addDays(today, -daysAgo) + 9 * 3600e3, sport: 'ride', sum });

test('bests: the most at each length, in the range, with the ride it was on', () => {
  const acts = [ride(3, { curve: { 300: 300, 1200: 250 } }), ride(40, { curve: { 300: 310, 1200: 240 } }), { ...ride(2, { curve: { 300: 999 } }), sport: 'run' }];
  const all = bests(acts), recent = bests(acts, addDays(today, -14));
  assert.equal(all[300].w, 310); assert.equal(all[300].id, 'r40'); assert.equal(all[1200].w, 250);
  assert.equal(recent[300].w, 300); assert.equal(recent[1200].id, 'r3');
});

test('weekly: time split by zone, by power where there is power, else heart rate, else unknown', () => {
  const w = weekly([ride(0, { moving: 3600, tss: 50, zones: [600, 2400, 300, 300, 0, 0, 0] }), ride(1, { moving: 1800, tss: 20, hrZones: [0, 1800, 0, 0, 0] }), ride(2, { moving: 600, tss: 5 })], today, 2);
  const now = w.at(-1);
  assert.equal(w.length, 2); assert.equal(now.mon, mondayOf(today));
  assert.equal(Math.round(now.easy), 3000 + 1800); assert.equal(Math.round(now.mid), 300); assert.equal(Math.round(now.hard), 300); assert.equal(now.unknown, 600);
  assert.equal(now.count, 3); assert.equal(now.tss, 75);
});

test('streak: weeks in a row riding twice or more; this week counted once it has two', () => {
  const wk = (n) => ({ count: n });
  assert.deepEqual(streak([wk(2), wk(0), wk(3), wk(2), wk(2), wk(1)]), { now: 3, best: 3 });
  assert.deepEqual(streak([wk(2), wk(2), wk(2), wk(2), wk(0), wk(2)]), { now: 1, best: 4 });
});

test('efficiency: steady rides only; more watts at the same heart rate reads as a gain', () => {
  const acts = Array.from({ length: 8 }, (_, i) => ride(70 - i * 9, { np: 180 + i * 3, avgHr: 135, moving: 4000, iF: 0.7 }));
  acts.push(ride(1, { np: 300, avgHr: 170, moving: 3600, iF: 1.0 }));   // (a hard ride: left out)
  const e = efficiency(acts, addDays(today, -90));
  assert.equal(e.enough, true); assert.equal(e.pts.length, 8); assert.equal(e.hr, 135);
  assert.ok(e.watts >= 20 && e.watts <= 22, String(e.watts)); assert.ok(e.pct > 0);
  assert.equal(efficiency(acts.slice(0, 3), addDays(today, -90)).enough, false);
});

test('rider type: what stands out against what is usual for your FTP', () => {
  assert.equal(riderType({ 5: { w: 1400 }, 60: { w: 480 }, 300: { w: 300 } }, 250).kind, 'sprint');
  assert.equal(riderType({ 5: { w: 900 }, 60: { w: 560 }, 300: { w: 300 } }, 250).name, 'Puncheur');
  assert.equal(riderType({ 5: { w: 900 }, 60: { w: 450 }, 300: { w: 345 } }, 250).name, 'Climber');
  assert.equal(riderType({ 5: { w: 800 }, 60: { w: 400 }, 300: { w: 280 } }, 250).name, 'Diesel');
  assert.equal(riderType({ 5: { w: 800 } }, 250), null);
});

test('intensity, staying power and each day', () => {
  const acts = [ride(2, { moving: 3600, zones: [1800, 1000, 400, 400, 0, 0, 0], drift: 6, late20: 230 }), ride(1, { moving: 3600, zones: [1800, 1000, 400, 400, 0, 0, 0], drift: 3, tss: 60 })];
  const it = intensity(acts, addDays(today, -30));
  assert.ok(Math.abs(it.easy - 2800 / 3600) < 1e-9 && Math.abs(it.hard - 400 / 3600) < 1e-9);
  const sp = stayingPower(acts, addDays(today, -30), 250);
  assert.equal(sp.drift.now, 3); assert.equal(sp.drift.was, 6); assert.equal(sp.late20, 230); assert.equal(sp.ofFresh, 0.92);
  const d = daily(acts, today, 7);
  assert.equal(d.tss.length, 7); assert.equal(d.tss[5], 60); assert.equal(d.from, addDays(today, -6));
});

// ---- your history ----
import * as GH from '../../../fitness/progress.js';
test('history: the year added up day by day, all-time bests against this year, each year\'s peak, a year in review', () => {
  const day = 86400000, at = (y, m, d) => new Date(y, m, d, 9).getTime();
  const r = (start, dist, w20, extra = {}) => ({ id: String(start), name: `Ride ${start}`, sport: 'ride', start, sum: { dist, moving: 3600, ascent: 100, tss: 60, curve: { 1200: w20, 300: w20 + 40 }, ...extra } });
  const acts = [r(at(2025, 2, 1), 40000, 260), r(at(2025, 5, 10), 80000, 280), r(at(2026, 1, 1), 50000, 270), r(at(2026, 4, 5), 30000, 290)];
  const c = GH.cumulative(acts, 2026, at(2026, 9, 26));
  assert.equal(c.at(-1)[1], 80000); assert.equal(c[0][1], 0);
  assert.equal(GH.cumulative(acts, 2025).at(-1)[1], 120000);
  const b = GH.allTime(acts, at(2026, 9, 26)).find((x) => x.secs === 1200);
  assert.equal(b.ever.w, 290); assert.ok(b.isBest);
  const pk = GH.peaks([{ day: at(2025, 5, 1), ctl: 50 }, { day: at(2025, 6, 1), ctl: 55 }, { day: at(2026, 3, 1), ctl: 60 }]);
  assert.equal(pk[2025].ctl, 55); assert.equal(pk[2026].ctl, 60);
  const y = GH.yearReview(acts, 2025);
  assert.equal(y.count, 2); assert.equal(y.dist, 120000); assert.equal(y.best20.w, 280); assert.equal(y.months[5], 3600); assert.equal(GH.yearReview(acts, 2020), null);
});
