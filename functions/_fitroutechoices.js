// Rank real loops by distance, retracing, and the terrain mapped on the routed ways.
import { metresBetween } from "../fitness/routes-geometry.js";

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
  const score = Math.abs(route.metres - query.metres) / query.metres * 100 + (route._quality?.overlap || 0) * 28;
  if (!data) return score;
  const total = Math.max(route.metres, data.total);
  const traffic = data.traffic ?? data.busy;
  const sustained = Math.min(1, (data.longestTerrain || 0) / (total * .22));
  if (query.surface === "gravel") return score - 3 * sustained + 18 * (1 - data.gravel / total) + (12 * traffic + 3 * data.unknown) / total;
  if (query.surface === "mtb") return score - 4 * sustained + 23 * (1 - data.trail / total) + (16 * traffic + 4 * data.unknown) / total;
  if (query.surface === "road") {
    const quiet = query.roadPreference === "quiet";
    const roads = quiet ? (12 * traffic + 6 * (data.longestBusy || 0)) / total : 2 * (1 - data.main / total);
    const paths = quiet ? data.path - (data.quietPath || 0) : data.path;
    return score + (35 * data.unpaved + 8 * paths) / total + roads;
  }
  return score;
}

export function selectRoutes(routes, query) {
  const ranked = [...routes].sort((a, b) => routeScore(a, query) - routeScore(b, query));
  const recommended = ranked.shift();
  if (!recommended) return [];
  recommended.name = "Recommended loop";
  const chosen = [recommended];
  const remaining = () => ranked.filter(route => !chosen.includes(route) &&
    chosen.every(other => sharedRoadFraction(route, other) <= .65));
  const minimumClimbDifference = Math.max(30, (recommended.ascent || 0) * .15);
  const withClimbs = () => remaining().filter(route => route.elevation && recommended.elevation);
  const flatter = withClimbs().sort((a, b) => a.ascent - b.ascent)
    .find(route => recommended.ascent - route.ascent >= minimumClimbDifference);
  if (flatter) {
    flatter.name = "Flatter loop";
    chosen.push(flatter);
  }
  const hillier = withClimbs().sort((a, b) => b.ascent - a.ascent)
    .find(route => route.ascent - recommended.ascent >= minimumClimbDifference);
  if (hillier) {
    hillier.name = "More climbing";
    chosen.push(hillier);
  }
  while (chosen.length < 3) {
    const route = remaining()[0];
    if (!route) break;
    route.name = chosen.length === 1 ? "Different direction" : "Another way round";
    chosen.push(route);
  }
  return chosen;
}
