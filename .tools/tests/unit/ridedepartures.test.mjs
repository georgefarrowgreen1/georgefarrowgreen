import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rideDepartures } from '../../../functions/_ride-departures.js';

const hour = 3600000;
const today = '2026-11-25';
const start = Date.parse(`${today}T08:00:00Z`);
const route = { name: 'Norfolk coast', coords: [[1.2, 52.9], [1.228, 52.9], [1.254, 52.9]], start: [1.2, 52.9], metres: 3600, surface: 'road' };
const plan = { route, day: today, time: '10:30', tz: 'Europe/London' };

test('departures consider when each route point is reached and preserve the saved time', async () => {
  const points = [];
  const result = await rideDepartures({}, plan, {
    now: start, minutes: 90,
    forecast: async (_, lat, lon) => {
      points.push([lat, lon]);
      return { hours: Array.from({ length: 8 }, (_, i) => ({ t: start + i * hour, day: i < 6,
        pop: lon > 1.24 && i === 4 ? 85 : 10, gust: lon > 1.24 && i === 4 ? 52 : 20 })) };
    },
    warnings: async (_, lat, lon) => ({ warnings: lon > 1.24 ? [{
      id: 'wind', level: 2, issuer: 'Met Office', event: 'Wind', area: 'North Norfolk',
      onset: new Date(start + 4 * hour).toISOString(), expires: new Date(start + 4.5 * hour).toISOString(),
    }] : [] }),
  });
  assert.equal(result.state, 'ready');
  assert.equal(points.length, 4);
  const planned = result.departures.find(choice => choice.planned);
  assert.equal(planned.start, start + 2.5 * hour);
  assert.equal(planned.end, start + 4 * hour);
  assert.equal(planned.rainChance, 85);
  assert.equal(planned.gust, 52);
  assert.equal(planned.warnings[0].event, 'Wind');
  assert.equal(result.warningCoverage, 'complete');
  assert.ok(result.departures.some(choice => !choice.planned && choice.rainChance === 10 && !choice.warnings.length));
});

test('unavailable coverage stays visible and a future date outside the forecast is not silently moved', async () => {
  const settings = { now: start, minutes: 60,
    forecast: async (_, lat, lon) => lon > 1.24 ? null : { hours: [{ t: start, day: true, pop: 0, gust: 18 }] },
    warnings: async () => ({ warnings: [], uncovered: true }),
  };
  const result = await rideDepartures({}, plan, settings);
  assert.equal(result.warningCoverage, 'partial');
  assert.equal(result.departures[0].forecastPartial, true);
  assert.equal(result.departures[0].daylight, null);
  assert.equal((await rideDepartures({}, { ...plan, day: '2026-12-01' }, settings)).state, 'outside-forecast');
  assert.equal((await rideDepartures({}, null, settings)).state, 'no-route');
});
