import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationRequester } from '../../../weather/location.js';

function device(state = 'prompt', permissions = true) {
  let time = 0, calls = 0, error = null, lat = 51.5;
  const nav = { geolocation: { getCurrentPosition(ok, no, options) {
    calls++; assert.equal(options.maximumAge, 60000);
    error ? no(error) : ok({ coords: { latitude: lat, longitude: -0.1 } });
  } } };
  if (permissions) nav.permissions = { query: async () => ({ state }) };
  return { request: locationRequester(() => nav, () => time), get calls() { return calls; },
    advance() { time += 61000; }, allow() { state = 'granted'; error = null; },
    deny() { error = { code: 1 }; }, move() { lat = 52; } };
}

test('opening requests permission before it has been granted; automatic updates use a fresh location', async () => {
  const d = device();
  assert.equal((await d.request(true)).coords.latitude, 51.5);
  d.allow(); d.move();
  assert.equal(await d.request(true), null);
  d.advance();
  assert.equal((await d.request(true)).coords.latitude, 52);
  assert.equal(d.calls, 2);
});

test('denial is not repeatedly prompted; a permission change or manual retry can recover', async () => {
  const d = device(); d.deny();
  await assert.rejects(d.request(true));
  d.advance(); assert.equal(await d.request(true), null); assert.equal(d.calls, 1);
  d.allow(); assert.ok(await d.request(true));
  assert.ok(await d.request(false)); assert.equal(d.calls, 3);
});

test('browsers without the Permissions API can locate and refresh, but do not repeat a denied prompt', async () => {
  const d = device('prompt', false);
  assert.ok(await d.request(true)); d.advance(); d.move();
  assert.equal((await d.request(true)).coords.latitude, 52);
  d.advance(); d.deny(); await assert.rejects(d.request(true));
  d.advance(); assert.equal(await d.request(true), null); assert.equal(d.calls, 3);
});

test('overlapping opening and foreground requests share one browser prompt', async () => {
  let resolve, calls = 0;
  const request = locationRequester(() => ({ geolocation: { getCurrentPosition(ok) { calls++; resolve = ok; } } }));
  const first = request(true);
  assert.equal(await request(true), null);
  resolve({ coords: { latitude: 51, longitude: 0 } });
  assert.ok(await first); assert.equal(calls, 1);
});

test('unavailable or blocked location leaves the existing forecast usable', async () => {
  assert.equal(await locationRequester(() => ({}))(true), null);
  const d = device('denied'); assert.equal(await d.request(true), null); assert.equal(d.calls, 0);
});
