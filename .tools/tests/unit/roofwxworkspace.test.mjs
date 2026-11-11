import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.innerWidth ??= 390;
globalThis.addEventListener ??= () => {};
const { placeOf, intervalOf, periodFor } = await import('../../../weather/roof/workspace.js');

const H = 3600000, base = Date.UTC(2026, 10, 11);
const location = { name: 'Ride start', lat: 51.5072, lon: -.1276 };
const wx = { place: { ...location, offset: 3600 }, daily: [], hourly: Array.from({ length: 30 }, (_, i) => ({ t: base + i * H, temp: 12, code: 2, wind: 10, gust: 20, pop: 10, precip: 0, cloud: 50 })) };
const selection = { location, interval: { start: base + 9.5 * H, end: base + 11 * H } };

test('workspace locations retain explicit zero coordinates and reject invalid or string coordinates', () => {
  assert.deepEqual(placeOf({ name: '\u202e Greenwich\u0000 ', lat: 0, lon: 0, region: ' London ' }), { name: 'Greenwich', lat: 0, lon: 0, region: 'London' });
  for (const bad of [null, { ...location, lat: '51' }, { ...location, lon: 181 }, { ...location, lat: NaN }, { ...location, name: '' }]) assert.equal(placeOf(bad), null);
});
test('workspace time is an absolute bounded interval, with null as an explicit clear', () => {
  assert.deepEqual(intervalOf(selection.interval), selection.interval);
  for (const bad of [null, {}, { start: 5, end: 4 }, { start: 1.5, end: 2 }, { start: base, end: base + 49 * H }]) assert.equal(intervalOf(bad), null);
});
test('ride window converts UTC into the forecast wall clock, including the partially overlapping first hour', () => {
  const before = JSON.stringify(wx), result = periodFor(wx, selection);
  assert.equal(result.state, 'ready');
  assert.equal(result.from, base + 10.5 * H);
  assert.equal(result.to, base + 12 * H);
  assert.deepEqual(result.hours.map(h => h.at), [base + 9 * H, base + 10 * H], 'returned hour times are absolute UTC again');
  assert.ok(result.summary.length > 0);
  assert.equal(result.rainChance, null, 'missing ensemble coverage is not invented');
  assert.equal(JSON.stringify(wx), before, 'projection does not move the current forecast or mutate its data');
});
test('ride weather never infers coordinates from a Fitness weather label or current Weather place', () => {
  assert.equal(periodFor(wx, { interval: selection.interval, location: { name: 'London' } }).state, 'location-needed');
  assert.equal(periodFor(wx, { interval: selection.interval, location: null }).state, 'location-needed');
  assert.equal(periodFor(wx, { location, interval: null }), null);
});
test('kept forecast from another area is explicit until the requested route location arrives', () => {
  const result = periodFor(wx, { ...selection, location: { name: 'Edinburgh', lat: 55.95, lon: -3.19 } });
  assert.equal(result.state, 'location-mismatch');
  assert.deepEqual(result.hours, []);
  assert.equal(periodFor(null, selection).state, 'loading');
});
test('partial forecast coverage cannot claim that the whole ride has a forecast', () => {
  for (const interval of [{ start: base - 1.5 * H, end: base + H }, { start: base + 28 * H, end: base + 31 * H }]) {
    const result = periodFor(wx, { location, interval });
    assert.equal(result.state, 'outside-forecast');
    assert.deepEqual(result.hours, []);
  }
});
