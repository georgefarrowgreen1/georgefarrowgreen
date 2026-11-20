import { metresBetween } from '../../../fitness/routes-geometry.js';
import { inUK } from './coverage.js';
import { json } from './handler.js';
import { builtUpMetres } from './settlements.js';

const CELL = .05;
const HEADER = 16, RECORD = 32;
const TYPES = Object.freeze({ road: 0, gravel: 1, mtb: 2 });
const KEY_WIDTH = 4096;

// IFC1 contains counts followed by three tables sorted by geographic cell.
// Read the binary in place. Candidate queries only scan the relevant cells.
export function readCorridorIndex(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < HEADER || view.getUint32(0) !== 0x49464331) throw new Error('Invalid corridor index');
  let end = 0;
  const tables = Array.from({ length: 3 }, (_, i) => {
    const start = end;
    end += view.getUint32(4 + i * 4);
    if (end === start) throw new Error('Empty corridor table');
    return { start, end };
  });
  if (view.byteLength !== HEADER + end * RECORD) throw new Error('Wrong corridor index length');
  return { view, tables };
}

function firstInCell(view, key, from, to) {
  while (from < to) {
    const i = Math.floor((from + to) / 2);
    if (view.getUint32(HEADER + i * RECORD) < key) from = i + 1;
    else to = i;
  }
  return from;
}

function coordinate(view, at) {
  return [(view.getInt32(at) - 180e6) / 1e6, (view.getInt32(at + 4) - 90e6) / 1e6];
}

export function nearbyCorridors({ view, tables }, { start, metres, surface }) {
  if (!Object.hasOwn(TYPES, surface)) return [];
  const table = tables[TYPES[surface]], offRoad = surface !== 'road';
  const maxReach = metres * .41, minReach = metres * .13;
  const cos = Math.cos(start[1] * Math.PI / 180);
  const dx = maxReach / (111000 * cos), dy = maxReach / 111000;
  const west = Math.floor((start[0] - dx + 180) / CELL), east = Math.floor((start[0] + dx + 180) / CELL);
  const south = Math.floor((start[1] - dy + 90) / CELL), north = Math.floor((start[1] + dy + 90) / CELL);
  const sectors = Array.from({ length: 8 }, () => []);
  for (let column = west; column <= east; column++) {
    const key = column * KEY_WIDTH + south, last = column * KEY_WIDTH + north;
    for (let i = firstInCell(view, key, table.start, table.end); i < table.end; i++) {
      const at = HEADER + i * RECORD;
      if (view.getUint32(at) > last) break;
      const length = view.getUint16(at + 28);
      if (length < Math.max(surface === 'road' ? 400 : 180, metres * .011) || length > metres * .26) continue;
      const middle = coordinate(view, at + 12), reach = metresBetween(start, middle);
      if (reach < minReach || reach > maxReach) continue;
      const points = [coordinate(view, at + 4), middle, coordinate(view, at + 20)];
      const span = metresBetween(start, points[0]) + metresBetween(points[2], start);
      const estimated = span * (surface === 'mtb' ? 1.46 : offRoad ? 1.36 : 1.25) + length;
      if (estimated > metres * 1.02) continue;
      const density = builtUpMetres(points) / length, preferredReach = metres * (offRoad ? .28 : .32);
      const score = Math.abs(reach - preferredReach) / metres + (.24 * (estimated < metres * .5 ? .5 - estimated / metres : 0)) +
        density * (offRoad ? .55 : .24) - Math.min(.16, length / metres) * 1.65;
      const radians = Math.atan2((middle[0] - start[0]) * cos, middle[1] - start[1]);
      const sector = sectors[(Math.round(radians * 4 / Math.PI) + 8) % 8];
      if (sector.length >= 2 && score >= sector.at(-1).score) continue;
      const duplicate = sector.findIndex(other => metresBetween(other.points[1], middle) < Math.max(350, metres * .02));
      if (duplicate >= 0 && score >= sector[duplicate].score) continue;
      if (duplicate >= 0) sector.splice(duplicate, 1);
      sector.push({ points, metres: length, directions: view.getUint8(at + 30), score });
      sector.sort((a, b) => a.score - b.score);
      if (sector.length > 2) sector.pop();
    }
  }
  return sectors.flat().sort((a, b) => a.score - b.score).map(({ score, ...corridor }) => corridor);
}

// Internal service only. Positions go in the POST body and are never logged.
export async function handleCorridors(request, index) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/corridors' || url.search ||
      !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return json({ error: 'invalid_corridor_query' }, 400);
  }
  const raw = await request.text().catch(() => '');
  if (raw.length > 256) return json({ error: 'invalid_corridor_query' }, 400);
  const form = new URLSearchParams(raw), value = form.get('start') || '';
  if (!/^-?\d{1,3}(?:\.\d{1,6})?,-?\d{1,2}(?:\.\d{1,6})?$/.test(value)) return json({ error: 'invalid_corridor_query' }, 400);
  const start = value.split(',').map(Number), metres = Number(form.get('metres')), surface = form.get('surface');
  if (form.size !== 3 || !Number.isInteger(metres) || metres < 5000 || metres > 120000 || !Object.hasOwn(TYPES, surface)) {
    return json({ error: 'invalid_corridor_query' }, 400);
  }
  if (!inUK(start)) return json({ error: 'outside_coverage' }, 422);
  return json({ corridors: nearbyCorridors(index, { start, metres, surface }) });
}
