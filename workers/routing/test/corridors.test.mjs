import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleCorridors, nearbyCorridors, readCorridorIndex } from '../src/corridors.js';

const start = [.635, 52.439];
const north = { points: [[.616, 52.52], [.635, 52.53], [.657, 52.536]], metres: 3200, directions: 2 };
const east = { points: [[.754, 52.416], [.788, 52.433], [.815, 52.445]], metres: 4700, directions: 3 };
const outOfRange = { points: [[1.61, 52.52], [1.635, 52.53], [1.657, 52.536]], metres: 9000, directions: 1 };
const tooClose = { points: [[.619, 52.438], [.629, 52.439], [.651, 52.44]], metres: 1900, directions: 1 };

const x = lon => Math.round((lon + 180) * 1e6);
const y = lat => Math.round((lat + 90) * 1e6);
const cell = ([lon, lat]) => Math.floor(x(lon) / 50_000) * 4096 + Math.floor(y(lat) / 50_000);

function build(tables) {
  const buffer = new ArrayBuffer(16 + tables.flat().length * 32), view = new DataView(buffer);
  view.setUint32(0, 0x49464331);
  let offset = 16;
  for (const [i, rows] of tables.entries()) {
    view.setUint32(4 + i * 4, rows.length);
    for (const row of rows.toSorted((a, b) => cell(a.points[1]) - cell(b.points[1]))) {
      view.setUint32(offset, cell(row.points[1]));
      for (const [point, [lon, lat]] of row.points.entries()) {
        view.setInt32(offset + 4 + 8 * point, x(lon));
        view.setInt32(offset + 8 + 8 * point, y(lat));
      }
      view.setUint16(offset + 28, row.metres);
      view.setUint8(offset + 30, row.directions);
      offset += 32;
    }
  }
  return buffer;
}

const bytes = build([[north, outOfRange], [east, north, outOfRange, tooClose], [east, tooClose]]);
const index = readCorridorIndex(bytes);

test('the spatial index returns nearby connected stretches for the requested ride type and preserves direction', () => {
  const query = { start, metres: 40000 };
  assert.deepEqual(nearbyCorridors(index, { ...query, surface: 'road' }), [north]);
  assert.deepEqual(new Set(nearbyCorridors(index, { ...query, surface: 'gravel' })), new Set([east, north]));
  assert.deepEqual(nearbyCorridors(index, { ...query, surface: 'mtb' }), [east]);
  assert.throws(() => readCorridorIndex(bytes.slice(0, -1)), /length/);
  assert.throws(() => readCorridorIndex(build([[], [north], [east]])), /empty/i);
});

test('the private lookup validates request type, distance and UK coverage', async () => {
  const query = { start: start.join(','), metres: 40000, surface: 'road' };
  function lookup(extra, url = 'https://routing.internal/corridors') {
    return handleCorridors(new Request(url, { method: 'POST', body: new URLSearchParams({ ...query, ...extra }) }), index);
  }
  const valid = await lookup();
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await valid.json()).corridors, [north]);
  assert.equal((await lookup({ start: '2.3522,48.8566' })).status, 422);
  assert.equal((await lookup({ metres: 120001 })).status, 400);
  assert.equal((await lookup({ surface: 'mixed' })).status, 400);
  assert.equal((await lookup({}, 'https://routing.internal/corridors?start=0,0')).status, 400);
});
