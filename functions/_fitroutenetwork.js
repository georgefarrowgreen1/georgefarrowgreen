// Use already-routed geometry to propose the last few searches. Only BRouter's
// subsequent, independently checked route can become an option for the rider.
import { MIN_TERRAIN_SHARE } from "./_fitroutechoices.js";
import { metresBetween } from "../fitness/routes-geometry.js";

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const keyOf = point => point[0] + "," + point[1];

function sampleLeg(route, roads, query, backwards, junctions) {
  const total = route.metres, coords = route.coords;
  const step = query.metres / 32, limit = Math.min(query.metres * .84, total * .86);
  const xScale = 111320 * Math.cos(query.start[1] * Math.PI / 180);
  const factor = roads?.total ? total / roads.total : 1;
  const sections = (roads?.sections || []).map(({ start, end }) => backwards
    ? { from: total - end * factor, to: total - start * factor }
    : { from: start * factor, to: end * factor });
  if (backwards) sections.reverse();

  let length = 0, next = step, section = 0, terrain = 0;
  const samples = [], matches = new Map(), direction = backwards ? -1 : 1;
  for (let i = backwards ? coords.length - 2 : 1; i >= 0 && i < coords.length; i += direction) {
    const point = coords[i];
    length += metresBetween(coords[i - direction], point);
    if (length > limit) break;
    const key = junctions && keyOf(point);
    const meet = junctions?.has(key) && !matches.has(key);
    if (length < next && !meet) continue;
    while (section < sections.length && sections[section].to <= length) {
      terrain += sections[section].to - sections[section].from;
      section++;
    }
    const sample = {
      point: point.slice(0, 2), length,
      x: (point[0] - query.start[0]) * xScale, y: (point[1] - query.start[1]) * 111320,
      terrain: terrain + Math.max(0, length - (sections[section]?.from ?? length)),
    };
    if (meet) matches.set(key, sample);
    if (length >= next) {
      samples.push(sample);
      next = (Math.floor(length / step) + 1) * step;
    }
  }
  return { samples, matches };
}

function arms(samples, target, ends = samples) {
  if (!samples.length) return [];
  const choices = [];
  let middle = 0;
  for (const end of ends) {
    if (end.length < target * .16) continue;
    while (samples[middle + 1]?.length <= end.length * .55) middle++;
    choices.push({ end, mid: samples[middle], samples });
  }
  return choices;
}

function checkpoints({ samples, end }) {
  const points = [];
  let i = 0;
  for (const fraction of [.25, .5, .75]) {
    const wanted = end.length * fraction;
    while (samples[i + 1] && Math.abs(samples[i + 1].length - wanted) < Math.abs(samples[i].length - wanted)) i++;
    if (samples[i].length < end.length && points.at(-1) !== samples[i]) points.push(samples[i]);
  }
  return [...points, end];
}

export function networkWaypoints(tracks, query) {
  const target = query.metres, offRoad = query.surface === "gravel" || query.surface === "mtb";
  const minimum = MIN_TERRAIN_SHARE[query.surface] || 0;
  const junctions = new Map(), pairs = [];
  const outward = tracks.map(({ route, roads }) => {
    const leg = arms(sampleLeg(route, roads, query, false).samples, target);
    for (const arm of leg) {
      const key = keyOf(arm.end.point);
      if (!junctions.has(key)) junctions.set(key, []);
      junctions.get(key).push(arm);
    }
    return leg;
  });
  function consider(a, b, sharedVertex) {
    const connector = gap(a.end, b.end);
    if (connector > target * .29 || gap(a.mid, b.mid) < target * .07) return;
    // Legs have measured network lengths. A gap is only a provisional estimate.
    const error = Math.abs(a.end.length + b.end.length + 1.4 * connector - target) / target;
    if (error > .12) return;
    const evidence = (a.end.terrain + b.end.terrain) / target;
    if (offRoad && evidence < minimum * .4) return;
    const terrainCost = offRoad ? 4 * Math.max(0, minimum - evidence) - 1.4 * evidence : 0;
    const score = error * 8 + connector / target * 2.5 + terrainCost - (sharedVertex ? .32 : 0);
    pairs.push({ a, b, score });
  }
  const allOutward = outward.flat();
  for (const [index, { route, roads }] of tracks.entries()) {
    const { samples, matches } = sampleLeg(route, roads, query, true, junctions);
    for (const b of arms(samples, target)) for (const a of allOutward) consider(a, b, false);
    const sameTrack = outward[index][0]?.samples;
    for (const b of arms(samples, target, matches.values())) {
      for (const a of junctions.get(keyOf(b.end.point))) {
        if (a.samples !== sameTrack) consider(a, b, true);
      }
    }
  }
  pairs.sort((a, b) => a.score - b.score);
  const selected = [];
  for (const { a, b } of pairs) {
    const signature = [a.mid, a.end, b.end, b.mid];
    const similar = other => signature.every((p, i) => gap(p, other[i]) < target * .10);
    if (selected.some(other => similar(other.forward) || similar(other.reverse))) continue;
    const points = [];
    for (const point of [...checkpoints(a), ...checkpoints(b).reverse()]) {
      if (!points.length || gap(points.at(-1), point) > Math.min(120, target * .012)) points.push(point);
    }
    if (points.length < 3) continue;
    selected.push({ forward: signature, reverse: [...signature].reverse(),
      points: [query.start, ...points.map(p => p.point), query.start] });
    if (selected.length === 3) break;
  }
  return selected.map(option => option.points);
}

// Pin a continuous stretch of the requested terrain in its observed riding
// direction. Shape the remaining leg using the distance left after that stretch.
export function terrainWaypoints(route, roads, query) {
  if (!roads?.runs?.length) return [];
  const start = query.start, target = query.metres;
  const xScale = 111320 * Math.cos(start[1] * Math.PI / 180);
  const factor = route.metres / roads.total;
  const runs = roads.runs.filter(run => run.metres >= target * .019)
    .sort((a, b) => b.metres - a.metres).slice(0, 5);
  if (!runs.length) return [];
  const distance = [0], coords = route.coords;
  for (let i = 1; i < coords.length; i++) distance.push(distance.at(-1) + metresBetween(coords[i - 1], coords[i]));
  function pointAt(metres) {
    let lo = 0, hi = coords.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (distance[mid] < metres) lo = mid + 1;
      else hi = mid;
    }
    return coords[lo].slice(0, 2);
  }
  const options = [];
  for (const run of runs) {
    const length = (run.end - run.start) * factor;
    const corridor = [.03, .27, .5, .73, .97].map(f => pointAt(run.start * factor + length * f));
    for (const before of [false, true]) {
      const end = before ? corridor[0] : corridor.at(-1), other = before ? corridor.at(-1) : corridor[0];
      const direct = metresBetween(start, other), chord = metresBetween(start, end);
      const remaining = (target - length) / (query.surface === "mtb" ? 1.48 : 1.36) - direct;
      if (chord < target * .055 || remaining < chord || remaining > target * .71) continue;
      // The perpendicular bisector gives two possible return arcs of the same estimated length.
      const height = Math.sqrt(remaining ** 2 - chord ** 2) / 2;
      const x = (end[0] - start[0]) * xScale, y = (end[1] - start[1]) * 111320;
      const side = Math.sign(x * (other[1] - start[1]) * 111320 - y * (other[0] - start[0]) * xScale) || 1;
      const via = [start[0] + (x / 2 + side * y / chord * height) / xScale,
        start[1] + (y / 2 - side * x / chord * height) / 111320].map(n => Number(n.toFixed(6)));
      const loop = before ? [start, via, ...corridor, start] : [start, ...corridor, via, start];
      const points = loop.filter((p, i) => !i || keyOf(p) !== keyOf(loop[i - 1]));
      if (points.length >= 5) options.push({ points, anchor: corridor[2], via,
        priority: run.metres / target - .12 * direct / target });
    }
  }
  return options;
}
