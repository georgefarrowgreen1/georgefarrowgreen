// Look up (pigeon/space.js): which way to face, and how high, for a pigeon over the Earth, the Moon and Mars.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookTo, moonLook, marsLook, sunLook } from '../../../pigeon/space.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(2)} vs ${b}`);

test('a pigeon over New York, from London: west-north-west, far under the horizon', () => {
  const l = lookTo(51.5074, -0.1278, 40.7128, -74.006, 0.12);
  near(l.az, 288.3, 0.5, 'bearing');                     // the great circle's start
  near(l.km, 5570, 15, 'km');
  assert.ok(l.el < -20, `under the horizon: ${l.el}`);
});
test('a pigeon overhead is straight up; one 10 km off and 120 m up is just above the horizon', () => {
  near(lookTo(48.85, 2.35, 48.85, 2.35, 0.12).el, 90, 0.01, 'overhead');
  const l = lookTo(48.85, 2.35, 48.94, 2.35, 0.12);
  near(l.az, 0, 0.1, 'north'); assert.ok(l.el > 0 && l.el < 1, `low: ${l.el}`);
});
test('the eclipsed Moon (28 Aug 2026, 04:13 UTC) is overhead where it is midnight under it', () => {
  // (opposite the Sun: high in the sky where the Sun is straight underfoot)
  const t = Date.parse('2026-08-28T04:13:00Z'), s = sunLook(t, -9.6, -63);
  assert.ok(s.el < -70, `the Sun is far below: ${s.el}`);
  assert.ok(moonLook(t, -9.6, -63).el > 70, 'the Moon high up');
});
test('the Moon rises in the east and sets in the west', () => {
  // full Moon, 27 Sep 2026: rises around sunset in London, low in the east-south-east; sets around sunrise in the west
  const rise = moonLook(Date.parse('2026-09-26T18:45:00Z'), 51.5, -0.13), set = moonLook(Date.parse('2026-09-27T06:30:00Z'), 51.5, -0.13);
  assert.ok(rise.az > 60 && rise.az < 130 && Math.abs(rise.el) < 20, `rising: ${JSON.stringify(rise)}`);
  assert.ok(set.az > 230 && set.az < 300 && Math.abs(set.el) < 20, `setting: ${JSON.stringify(set)}`);
});
test('Mars: somewhere on the sky, and moving slowly', () => {
  const a = marsLook(Date.parse('2026-10-17T00:00:00Z'), 51.5, 0), b = marsLook(Date.parse('2026-10-17T00:01:00Z'), 51.5, 0);
  assert.ok(Number.isFinite(a.az) && Math.abs(a.el) <= 90);
  assert.ok(Math.abs(a.az - b.az) < 1, 'a minute moves it a fraction of a degree');
});
