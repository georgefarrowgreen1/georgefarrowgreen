// Use already-routed geometry to propose the last few searches. Only BRouter's
// subsequent, independently checked route can become an option for the rider.
import { DISTANCE_TOLERANCE, MIN_TERRAIN_SHARE, routeQuality, terrainAccess } from "./_fitroutechoices.js";
import { metresBetween, pointOK } from "../fitness/routes-geometry.js";
import { inUK } from "../workers/routing/src/coverage.js";
import { builtUpEdgeMetres, builtUpMetres } from "../workers/routing/src/settlements.js";

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const keyOf = point => point[0] + "," + point[1];

const angleGap = (first, second) => Math.abs((first - second + 540) % 360 - 180);

// Keep the mapped stretch intact. Apportion the remaining distance to the
// outbound and return legs and bend them around opposite sides of the route.
export function indexedWaypoints(corridors, query, seedBearing) {
  const { start, metres: target, surface } = query;
  const scale = 111320 * Math.cos(start[1] * Math.PI / 180);
  const detour = surface === "mtb" ? 1.46 : surface === "gravel" ? 1.36 : 1.25;
  const via = (a, b, direct, slack, side) => {
    const offset = Math.sqrt(slack * (2 * direct + slack)) / 2;
    return [(a[0] + b[0]) / 2 - side * (b[1] - a[1]) * 111320 / direct * offset / scale,
      (a[1] + b[1]) / 2 + side * (b[0] - a[0]) * scale / direct * offset / 111320]
      .map(value => Number(value.toFixed(6)));
  };
  let chosen = null;
  for (const [rank, corridor] of corridors.slice(0, 16).entries()) {
    const { points, metres, directions } = corridor || {};
    if (!Array.isArray(points) || points.length !== 3 || points.some(point => !pointOK(point) || point.length !== 2) ||
        !Number.isInteger(metres) || metres < 150 || metres > target * .26 || ![1, 2, 3].includes(directions)) continue;
    const middle = points[1];
    const bearing = (Math.atan2((middle[0] - start[0]) * scale, (middle[1] - start[1]) * 111320) * 180 / Math.PI + 360) % 360;
    for (const bit of [1, 2]) {
      if (!(directions & bit)) continue;
      const anchors = bit === 1 ? points : [...points].reverse();
      const [entry, , exit] = anchors;
      const outgoing = metresBetween(start, entry), returning = metresBetween(exit, start);
      if (Math.min(outgoing, returning) < target * .08) continue;
      const slack = Math.max(0, (target - metres) / detour - outgoing - returning);
      const side = Math.sign((entry[1] - start[1]) * (exit[0] - start[0]) - (entry[0] - start[0]) * (exit[1] - start[1])) || 1;
      const outbound = via(start, entry, outgoing, slack * .52, side);
      const homeward = via(exit, start, returning, slack * .48, side);
      if (!inUK(outbound) || !inUK(homeward)) continue;
      const loop = [start, outbound, ...anchors, homeward, start];
      const cost = builtUpMetres(loop) / target * (surface === "road" ? .32 : .87) +
        angleGap(seedBearing, bearing) / 180 * .11 + rank * .008;
      if (!chosen || cost < chosen.cost) chosen = { points: loop, cost };
    }
  }
  return chosen?.points || null;
}

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

function trackSampler(route) {
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
  return { distance, pointAt };
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
  const { pointAt } = trackSampler(route);
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
        priority: run.metres / target - (.12 * direct + .38 * builtUpMetres(points)) / target });
    }
  }
  return options;
}

// Adjust one connector on a measured loop. Keep checkpoints on both sides so
// BRouter can preserve the rest of the ride when it recalculates the loop.
export function connectorWaypoints(tracks, scouts, query) {
  const target = query.metres;
  const minimum = MIN_TERRAIN_SHARE[query.surface] || 0;
  if (!tracks.length) return null;
  // Past scouts can supply waypoints on real roads near the projected detour.
  const mapped = scouts.flatMap(({ route }) => {
    const { pointAt } = trackSampler(route);
    return Array.from({ length: 48 }, (_, i) => pointAt(route.metres * (i + 1) / 49));
  });
  let best = null;
  for (const { route, roads } of tracks) {
    const total = route.metres, change = target - total;
    const scale = 111320 * Math.cos(query.start[1] * Math.PI / 180);
    const { pointAt: sample } = trackSampler(route);
    const factor = roads?.total ? total / roads.total : 1;
    const terrain = query.surface === "mtb" ? roads?.trail : roads?.gravel;
    for (const width of [.25, .38, .5]) for (const start of [.04, .15, .26, .37, .48, .59, .7]) {
      const from = total * start, to = from + total * width;
      if (to >= total * .98) continue;
      const wanted = to - from + change;
      const a = sample(from), b = sample(to);
      const direct = metresBetween(a, b);
      if (direct < target * .06 || wanted < direct * 1.12) continue;
      const removedTerrain = (roads?.sections || []).reduce((sum, section) =>
        sum + Math.max(0, Math.min(to, section.end * factor) - Math.max(from, section.start * factor)), 0);
      const retained = ((terrain || 0) * factor - removedTerrain) / target;
      if (retained < minimum * .92) continue;

      // Shorten with a direct connection or set a via point from the distance
      // available. The projected leg is a hypothesis until BRouter tests it.
      const previous = sample((from + to) / 2);
      const oldChord = metresBetween(a, previous) + metresBetween(previous, b);
      const detour = Math.min(1.65, Math.max(1.12, (to - from) / oldChord));
      const air = Math.max(direct, wanted / detour);
      const height = Math.sqrt(air ** 2 - direct ** 2) / 2;
      const x = (b[0] - a[0]) * scale, y = (b[1] - a[1]) * 111320;
      const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const side of height > 0 ? [-1, 1] : [0]) {
        const projected = [midpoint[0] - side * y / direct * height / scale,
          midpoint[1] + side * x / direct * height / 111320].map(n => Number(n.toFixed(6)));
        let via = projected, mappedCost = target * .05;
        if (height > 0) for (const point of mapped) {
          const displacement = metresBetween(projected, point);
          if (displacement > mappedCost || metresBetween(point, previous) < target * .025) continue;
          const distanceError = Math.abs(metresBetween(a, point) + metresBetween(point, b) - air);
          if (displacement + distanceError < mappedCost) {
            mappedCost = displacement + distanceError;
            via = point;
          }
        }
        if (height > 0 && metresBetween(via, previous) < target * .018) continue;
        const points = [query.start, sample(from / 3), sample(from * .67), a,
          ...(height > 0 ? [via] : []), b, sample(to + (total - to) / 3),
          sample(to + (total - to) * .67), query.start];
        const unique = points.filter((point, index) => !index || keyOf(point) !== keyOf(points[index - 1]));
        if (unique.length < 5) continue;
        const exposure = minimum ? builtUpMetres(unique) / target : 0;
        const uncertainty = (wanted - direct + mappedCost) / target;
        const cost = 1.7 * exposure - 2.5 * retained + .9 * uncertainty + Math.abs(change) / target;
        if (!best || cost < best.cost) best = { points: unique, cost };
      }
    }
  }
  return best?.points || null;
}

function indexTrack({ route, roads }, offRoad) {
  const { distance, pointAt } = trackSampler(route);
  const { coords } = route, keys = coords.map(keyOf);
  const total = distance.at(-1), factor = total / roads.total;
  const nodes = new Map(), terrain = [], urban = [0];
  let section = 0, covered = 0;
  for (const [i, key] of keys.entries()) {
    const positions = nodes.get(key);
    // A loop can pass the same junction on its way out and on its return.
    if (positions) positions[1] = i;
    else nodes.set(key, [i]);
    if (!offRoad) continue;
    const metres = distance[i];
    while (roads.sections[section]?.end * factor <= metres) {
      const { start, end } = roads.sections[section++];
      covered += (end - start) * factor;
    }
    const start = roads.sections[section]?.start;
    terrain.push(covered + (start == null ? 0 : Math.max(0, metres - start * factor)));
    if (!i) continue;
    urban.push(urban.at(-1) + builtUpEdgeMetres(coords[i - 1], coords[i], metres - distance[i - 1]));
  }
  return { coords, keys, distance, pointAt, nodes, total, terrain, urban };
}

function commonJunctions(a, b, spacing) {
  const matches = [];
  let last = -Infinity;
  for (const [from, key] of a.keys.entries()) {
    const distance = a.distance[from];
    if (from !== a.keys.length - 1 && distance - last < spacing) continue;
    for (const to of b.nodes.get(key) || []) {
      const before = a.keys[from - 1], after = a.keys[from + 1];
      if (before && after && before === b.keys[to - 1] && after === b.keys[to + 1]) continue;
      matches.push({ from, to });
      last = distance;
    }
  }
  return matches;
}

function rangeMetres(values, from, to) {
  return values[to] - values[from];
}

// Use a loop already close to the target as the basis for a single directed
// detour between two shared map vertices. BRouter must verify the entire loop.
export function junctionWaypoints(observations, query) {
  const target = query.metres, minimum = MIN_TERRAIN_SHARE[query.surface] || 0;
  const tracks = observations.filter(({ roads }) => terrainAccess(roads, query))
    .map(track => indexTrack(track, minimum > 0));
  const plans = [];
  for (const a of tracks) {
    if (Math.abs(a.total - target) > target * DISTANCE_TOLERANCE) continue;
    for (const b of tracks) {
      if (a === b) continue;
      const joins = commonJunctions(a, b, Math.max(100, target * .012));
      for (const [i, left] of joins.entries()) for (let j = i + 1; j < joins.length; j++) {
        const right = joins[j];
        if (right.from <= left.from || right.to <= left.to) continue;
        const removed = rangeMetres(a.distance, left.from, right.from);
        const added = rangeMetres(b.distance, left.to, right.to);
        if (Math.min(removed, added) < target * .04 || a.total - removed < target * .08 ||
            b.total - added < target * .06) continue;
        const length = a.total - removed + added, error = Math.abs(length - target) / target;
        if (error > DISTANCE_TOLERANCE - .01) continue;
        let terrain = 0, urban = 0;
        if (minimum) {
          terrain = a.terrain.at(-1) - rangeMetres(a.terrain, left.from, right.from) +
            rangeMetres(b.terrain, left.to, right.to);
          if (terrain < length * minimum) continue;
          urban = a.urban.at(-1) - rangeMetres(a.urban, left.from, right.from) +
            rangeMetres(b.urban, left.to, right.to);
        }
        if (Math.abs(removed - added) < target * .015 &&
            (!minimum || Math.abs(terrain - a.terrain.at(-1)) < target * .015 &&
             Math.abs(urban - a.urban.at(-1)) < target * .015) &&
            metresBetween(a.pointAt(a.distance[left.from] + removed / 2),
              b.pointAt(b.distance[left.to] + added / 2)) < 150) continue;
        const cost = 65 * error + (60 * urban - 30 * terrain) / length;
        if (plans.length >= 36 && cost >= plans.at(-1).cost) continue;
        plans.push({ a, b, left, right, cost });
        plans.sort((first, second) => first.cost - second.cost);
        if (plans.length > 36) plans.pop();
      }
    }
  }
  for (const { a, b, left, right } of plans) {
    const coords = [...a.coords.slice(0, left.from + 1), ...b.coords.slice(left.to + 1, right.to + 1),
      ...a.coords.slice(right.from + 1)];
    const quality = routeQuality(coords);
    if (quality.overlap > .38 || quality.longestBacktrack > 10) continue;
    const points = [query.start];
    for (const [track, from, to, closesLoop] of [
      [a, 0, left.from, false], [b, left.to, right.to, false], [a, right.from, a.keys.length - 1, true],
    ]) {
      const start = track.distance[from], length = track.distance[to] - start;
      for (const fraction of length > target * .13 ? [.35, .72] : length > target * .06 ? [.5] : []) {
        points.push(track.pointAt(start + length * fraction));
      }
      if (!closesLoop && from !== to && to < track.keys.length - 1) points.push(track.coords[to].slice(0, 2));
    }
    points.push(query.start);
    const unique = points.filter((point, i) => !i || keyOf(point) !== keyOf(points[i - 1]));
    if (unique.length >= 5) return unique;
  }
  return null;
}
