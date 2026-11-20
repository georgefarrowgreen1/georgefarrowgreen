// Rank real loops by distance, retracing, and the terrain mapped on the routed ways.
import { metresBetween } from "../fitness/routes-geometry.js";
import { builtUpMetres } from "../workers/routing/src/settlements.js";

export const DISTANCE_TOLERANCE = .10;
export const MIN_TERRAIN_SHARE = Object.freeze({ gravel: .18, mtb: .25 });
const PAVED = new Set(["paved", "asphalt", "concrete", "paving_stones", "sett", "cobblestone", "metal"]);
const GRAVEL = new Set(["gravel", "fine_gravel", "compacted", "pebblestone"]);
const GROUND = new Set(["ground", "dirt", "earth"]);
const OTHER_UNPAVED = new Set(["unpaved", ...GROUND, "grass", "mud", "sand", "rock", "stone", "clay", "grass_paver"]);
const PATHS = new Set(["path", "footway", "track", "bridleway"]);
const BIKE_ACCESS = new Set(["yes", "designated", "permissive", "official"]);

export function roadData(feature, surfacePreference) {
  const [columns, ...rows] = Array.isArray(feature?.properties?.messages) ? feature.properties.messages : [];
  if (!Array.isArray(columns)) return null;
  const distanceIndex = columns.indexOf("Distance"), tagsIndex = columns.indexOf("WayTags");
  if (distanceIndex < 0 || tagsIndex < 0) return null;
  const sections = [];
  const data = {
    total: 0, paved: 0, gravel: 0, unpaved: 0, unknown: 0, trail: 0,
    main: 0, busy: 0, path: 0, quietPath: 0, traffic: 0, longestBusy: 0, blocked: 0, difficultGravel: 0, difficultMtb: 0, mtbOnly: 0,
  };
  let busyRun = 0;
  for (const row of rows) {
    const metres = Number(row?.[distanceIndex]);
    if (!Number.isFinite(metres) || metres <= 0) continue;
    const tags = Object.create(null);
    for (const tag of String(row?.[tagsIndex] || "").split(/\s+/)) {
      const split = tag.indexOf("=");
      if (split > 0) tags[tag.slice(0, split)] = tag.slice(split + 1);
    }
    const { highway, surface, bicycle, access, vehicle, tracktype, smoothness } = tags;
    const path = PATHS.has(highway), paved = PAVED.has(surface);
    const mtbScale = tags["mtb:scale"] || "";
    const difficultGravel = /^(very_bad|horrible|very_horrible|impassable|high_clearance)$/.test(smoothness) ||
      /^grade[45]$/.test(tracktype) || /^(mud|sand|rock|stone)$/.test(surface) || /^(2\+?|[3-6][+-]?)$/.test(mtbScale);
    const difficultMtb = smoothness === "impassable" || /^[3-6]/.test(mtbScale) || tags["mtb:scale:uphill"] === "5";
    const gravel = !difficultGravel && (GRAVEL.has(surface) ||
      ((!surface || surface === "unpaved") && tracktype === "grade2") ||
      (GROUND.has(surface) && (/^(excellent|good|intermediate)$/.test(smoothness) || /^grade[12]$/.test(tracktype))));
    const unpaved = GRAVEL.has(surface) || OTHER_UNPAVED.has(surface) ||
      (!surface && /^grade[2-5]$/.test(tracktype));
    const trail = (path || highway === "cycleway") && !paved && !difficultMtb &&
      (unpaved || /^[0-2][+-]?$/.test(mtbScale));
    const explicitBike = BIKE_ACCESS.has(bicycle) || bicycle === "mtb";
    const restrictions = /^(no|private|destination|customers|agricultural|forestry|delivery|permit|military)$/;
    const directionAccess = tags[tags.reversedirection === "yes" ? "bicycle:backward" : "bicycle:forward"];
    const cycleRoute = ["route_bicycle_lcn", "route_bicycle_rcn", "route_bicycle_ncn", "route_bicycle_icn"].some(key => tags[key] === "yes");
    const walkOnly = /^(footway|pedestrian)$/.test(highway) && !explicitBike && !cycleRoute;
    const blocked = walkOnly || /^(no|use_sidepath)$/.test(directionAccess) || smoothness === "impassable" || /^(motorway|motorway_link|steps|construction|proposed|abandoned)$/.test(highway) ||
      /^(no|private|dismount|use_sidepath|destination|permit)$/.test(bicycle) ||
      (!explicitBike && (restrictions.test(access) || restrictions.test(vehicle))) ||
      tags.motorroad === "yes" || tags.route === "ferry" || /^(yes|stepping_stones)$/.test(tags.ford);

    if (!blocked && (surfacePreference === "gravel" ? gravel : surfacePreference === "mtb" && trail)) {
      const previous = sections.at(-1);
      if (previous?.end === data.total) previous.end += metres;
      else sections.push({ start: data.total, end: data.total + metres });
    }
    data.total += metres;
    if (paved) data.paved += metres;
    else if (unpaved) {
      data.unpaved += metres;
      if (gravel) data.gravel += metres;
    } else data.unknown += metres;
    if (trail) data.trail += metres;
    if (/^(primary|secondary|tertiary)(?:_link)?$/.test(highway)) data.main += metres;
    if (/^(primary|trunk)(?:_link)?$/.test(highway)) data.busy += metres;
    if (path) data.path += metres;
    const separated = highway === "cycleway" || (path && paved && explicitBike);
    if (path && separated) data.quietPath += metres;
    const roadClass = /^(primary|trunk)(?:_link)?$/.test(highway) ? 1 :
      /^secondary(?:_link)?$/.test(highway) ? .5 : 0;
    const estimatedTraffic = Math.max(0, Math.min(1, (Number(tags.estimated_traffic_class) || 0) / 3 - 1));
    const exposure = separated ? 0 : Math.max(roadClass, estimatedTraffic);
    data.traffic += exposure * metres;
    busyRun = exposure >= .65 ? busyRun + metres : 0;
    data.longestBusy = Math.max(data.longestBusy, busyRun);
    if (blocked) data.blocked += metres;
    if (difficultGravel) data.difficultGravel += metres;
    if (difficultMtb) data.difficultMtb += metres;
    if (bicycle === "mtb") data.mtbOnly += metres;
  }
  data.sections = sections;
  data.runs = [];
  data.longestTerrain = 0;
  for (const { start, end } of sections) {
    let run = data.runs.at(-1);
    if (!run || start - run.end > 180) {
      run = { start, end, metres: 0 };
      data.runs.push(run);
    }
    run.end = end;
    run.metres += end - start;
    data.longestTerrain = Math.max(data.longestTerrain, run.metres);
  }
  return data.total ? data : null;
}

export function terrainFit(data, metres, query) {
  if (data?.blocked > 0 || (query.surface !== "mtb" && data?.mtbOnly > 0)) return false;
  if (query.surface === "road" && query.avoidUnpaved) return !(data?.unpaved > 0);
  if (query.surface === "gravel") return !!data && data.difficultGravel === 0 && data.gravel >= Math.max(metres, data.total) * MIN_TERRAIN_SHARE.gravel;
  if (query.surface === "mtb") return !!data && data.difficultMtb === 0 && data.trail >= Math.max(metres, data.total) * MIN_TERRAIN_SHARE.mtb;
  return true;
}

export function terrainSummary(data, metres) {
  if (!data) return null;
  const total = Math.max(metres, data.total);
  const paved = Math.round(data.paved / total * 100);
  const gravel = Math.round((data.paved + data.gravel) / total * 100) - paved;
  const unpaved = Math.round((data.paved + data.unpaved) / total * 100) - paved - gravel;
  return {
    paved, gravel, unpaved, unknown: 100 - paved - gravel - unpaved,
    trail: Math.round(data.trail / total * 100),
  };
}

const corridors = new WeakMap();
function corridor(route) {
  if (corridors.has(route)) return corridors.get(route);
  const cells = new Map(), latitudeScale = 111320 * Math.cos(route.start[1] * Math.PI / 180);
  let total = 0;
  for (let i = 1; i < route.coords.length; i++) {
    const a = route.coords[i - 1], b = route.coords[i], length = metresBetween(a, b);
    const steps = Math.max(1, Math.ceil(length / 25)), weight = length / steps;
    for (let n = 0; n < steps; n++) {
      const t = (n + .5) / steps;
      const x = (a[0] + (b[0] - a[0]) * t - route.start[0]) * latitudeScale;
      const y = (a[1] + (b[1] - a[1]) * t - route.start[1]) * 111320;
      const key = Math.round(x / 40) + "," + Math.round(y / 40);
      cells.set(key, (cells.get(key) || 0) + weight);
    }
    total += length;
  }
  const result = { cells, total };
  corridors.set(route, result);
  return result;
}

export function sharedRoadFraction(a, b) {
  const aa = corridor(a), bb = corridor(b);
  let shared = 0;
  for (const [key, length] of aa.cells) shared += Math.min(length, bb.cells.get(key) || 0);
  return shared / Math.max(1, Math.min(aa.total, bb.total));
}

export function routeScore(route, query) {
  const data = route._roads;
  const error = Math.abs(route.metres - query.metres) / query.metres;
  const distanceCost = 100 * (Math.max(0, error - .03) + .55 * Math.min(error, .03));
  const overlap = route._quality?.overlap || 0;
  const inside = route._quality?.interiorOverlap ?? overlap * .45;
  const accessStem = Math.max(0, overlap - inside);
  const longStemCost = 18 * Math.max(0, accessStem - .08);
  const score = distanceCost + 12 * overlap + 36 * inside + longStemCost;
  if (!data) return score;
  const total = Math.max(route.metres, data.total);
  const traffic = data.traffic ?? data.busy;
  if (Object.hasOwn(MIN_TERRAIN_SHARE, query.surface)) {
    const urban = route.coords ? builtUpMetres(route.coords) : 0;
    const exposure = (60 * urban + 8 * (data.longestBusy || 0)) / total;
    const stretch = Math.min(3000, Math.max(1250, total * .075));
    const sustained = (data.runs || []).reduce((sum, run) =>
      sum + run.metres * Math.min(1, run.metres / stretch), 0) / total;
    const longest = Math.min(1, (data.longestTerrain || 0) / (total * .20));
    if (query.surface === "gravel") {
      return score + exposure - 7 * sustained - 3 * longest + 18 * (1 - data.gravel / total) + (12 * traffic + 3 * data.unknown) / total;
    }
    return score + exposure - 9 * sustained - 3 * longest + 23 * (1 - data.trail / total) + (16 * traffic + 4 * data.unknown) / total;
  }
  if (query.surface === "road") {
    const quiet = query.roadPreference === "quiet";
    const roads = quiet ? (12 * traffic + 6 * (data.longestBusy || 0)) / total : 2 * (1 - data.main / total);
    const paths = quiet ? data.path - (data.quietPath || 0) : data.path;
    return score + (35 * data.unpaved + 8 * paths) / total + roads;
  }
  return score;
}

function alternativeBenefit(route, recommended, query) {
  const offRoad = Object.hasOwn(MIN_TERRAIN_SHARE, query.surface);
  const here = route._roads, there = recommended._roads;
  const townDifference = offRoad ? builtUpMetres(route.coords) - builtUpMetres(recommended.coords) : 0;
  if (here && there) {
    const measure = query.surface === "mtb" ? "trail" : "gravel";
    const shareDifference = here[measure] / here.total - there[measure] / there.total;
    if (offRoad && townDifference <= query.metres * .10 && shareDifference >= .10 &&
        here[measure] - there[measure] >= 650) {
      return { name: query.surface === "mtb" ? "More trail" : "More gravel", weight: Math.min(5, 2.5 + 10 * shareDifference) };
    }
    const trafficDifference = there.traffic / there.total - here.traffic / here.total;
    if (trafficDifference >= .12 && there.traffic - here.traffic >= 600 && townDifference <= query.metres * .06) {
      return { name: "Quieter roads", weight: Math.min(4, 2 + 8 * trafficDifference) };
    }
    if (townDifference <= -Math.max(900, query.metres * .1)) {
      return { name: "Less town riding", weight: Math.min(4, 2 - 8 * townDifference / query.metres) };
    }
  }
  if (route.elevation && recommended.elevation && townDifference <= query.metres * .10) {
    const difference = route.ascent - recommended.ascent;
    const minimum = Math.max(30, recommended.ascent * .15);
    const slope = route.ascent / route.metres, reference = recommended.ascent / recommended.metres;
    if (difference <= -minimum && slope <= reference * .9) return { name: "Flatter loop", weight: 3 };
    if (difference >= minimum && slope >= reference * 1.1) return { name: "More climbing", weight: 2.5 };
  }
  return { name: null, weight: 0 };
}

export function selectRoutes(routes, query) {
  const ranked = routes.map(route => ({ route, score: routeScore(route, query) }))
    .sort((a, b) => a.score - b.score);
  const best = ranked.shift();
  if (!best) return [];
  best.route.name = "Recommended loop";

  const alternatives = [];
  for (const { route, score } of ranked) {
    const shared = sharedRoadFraction(route, best.route);
    if (shared > .65) continue;
    const benefit = alternativeBenefit(route, best.route, query);
    const gap = score - best.score - benefit.weight;
    // An extra option is useful when its trade-off justifies the drop in quality.
    if (gap > 17) continue;
    alternatives.push({ route, benefit, cost: gap + 7 * shared });
  }
  alternatives.sort((a, b) => a.cost - b.cost);
  if (!alternatives.length) return [best.route];

  // The best pair can cover more ground than choosing one option at a time.
  let selected = [alternatives[0]], bestPair = Infinity;
  for (let i = 0; i < alternatives.length; i++) {
    const a = alternatives[i];
    for (const b of alternatives.slice(i + 1)) {
      const shared = sharedRoadFraction(a.route, b.route);
      if (shared > .65) continue;
      const sameBenefit = a.benefit.name && a.benefit.name === b.benefit.name;
      const cost = a.cost + b.cost + 10 * shared + (sameBenefit ? Math.min(a.benefit.weight, b.benefit.weight) : 0);
      if (cost < bestPair) {
        bestPair = cost;
        selected = [a, b];
      }
    }
  }
  const names = new Set();
  for (const { route, benefit } of selected) {
    route.name = benefit.name && !names.has(benefit.name) ? benefit.name :
      names.size ? "Another way round" : "Different roads";
    names.add(route.name);
  }
  return [best.route, ...selected.map(option => option.route)];
}
