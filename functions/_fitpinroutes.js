// Ordered map pins are routed as one BRouter journey, including any return leg.
import { cleanRoute, MAX_POINTS, MAX_ROUTE_PINS, metresBetween, pointOK, supportedSurface } from "../fitness/routes-geometry.js";
import { inUK } from "../workers/routing/src/coverage.js";
import { HttpError } from "./_http.js";
import { ROUTER_URL, ROUTE_SEARCH_MS, routeBytes, routingProfile, untilAbort } from "./_fitloops.js";
import { roadData, terrainAccess, terrainSummary } from "./_fitroutechoices.js";

const unavailable = () => new HttpError(503, "InFlite’s UK router is starting or busy. Please try again shortly.");
const pointsOf = q => [q.start, ...q.pins, ...(q.returnToStart ? [q.start] : [])];
function pointField(index, count) {
  if (index === 0) return { label: "The start", field: "start" };
  if (index > count) return { label: "The return to the start", field: "returnToStart" };
  return { label: "Pin " + index, field: "pins." + (index - 1) };
}
function pointError(status, index, count, reason) {
  const { label, field } = pointField(index, count);
  return new HttpError(status, label + " " + reason, field);
}

export function cleanPinQuery(b) {
  if (!Array.isArray(b.pins) || !b.pins.length || b.pins.length > MAX_ROUTE_PINS) {
    throw new HttpError(400, "Place between one and eight destination pins.", "pins");
  }
  if (!supportedSurface(b.surface)) throw new HttpError(400, "Choose Road, Gravel or Mountain bike.", "surface");
  if (b.roadPreference != null && !["main", "quiet"].includes(b.roadPreference)) throw new HttpError(400, "Choose main roads or quiet lanes.", "roadPreference");
  if (b.avoidUnpaved != null && typeof b.avoidUnpaved !== "boolean") throw new HttpError(400, "Choose whether to avoid unpaved roads.", "avoidUnpaved");
  if (b.returnToStart !== undefined && typeof b.returnToStart !== "boolean") throw new HttpError(400, "Choose whether to return to the start.", "returnToStart");
  const count = b.pins.length;
  const points = pointsOf(b).map((p, i) => {
    if (!pointOK(p) || p.length !== 2) throw pointError(400, i, count, "needs a valid map location.");
    const point = p.map(n => Number(n.toFixed(6)));
    if (!inUK(point)) throw pointError(422, i, count, "is outside the UK cycling map.");
    return point;
  });
  let metres = 0;
  for (let i = 1; i < points.length; i++) {
    const distance = metresBetween(points[i - 1], points[i]);
    if (distance < 10) throw pointError(400, i, count, "is too close to the previous stop. Move it at least 10 metres away.");
    metres += distance;
    if (metres > 220000) throw pointError(422, i, count, "would take this ride beyond 220 km. Choose a closer stop.");
  }
  return { mode: "pins", start: points[0], pins: points.slice(1, count + 1), returnToStart: b.returnToStart === true,
    surface: b.surface, roadPreference: b.roadPreference || "main", avoidUnpaved: b.surface === "road" && b.avoidUnpaved !== false };
}

// Choose the minimum total snap distance in riding order. Greedy nearest-point
// matching can skip the intended first visit when an outbound and return leg cross.
function matchPins(coords, q) {
  const count = q.pins.length, last = coords.length - 1;
  const checkSnap = (distance, index) => {
    if (distance > 250) throw pointError(422, index, count, "is too far from a cycle route. Move it closer to a road or trail.");
  };
  checkSnap(metresBetween(coords[0], q.start), 0);
  checkSnap(metresBetween(coords[last], q.returnToStart ? q.start : q.pins.at(-1)), q.returnToStart ? count + 1 : count);
  if (q.returnToStart && metresBetween(coords[0], coords[last]) > 25) throw pointError(422, count + 1, count, "could not be joined to the starting road.");
  let costs = new Float64Array(coords.length).fill(Infinity);
  costs[0] = 0;
  const predecessors = [];
  let end = 0;
  for (let i = 0; i < count - (q.returnToStart ? 0 : 1); i++) {
    const next = new Float64Array(coords.length).fill(Infinity), previous = new Int32Array(coords.length);
    let best = 0;
    end = -1;
    for (let j = 1; j < last; j++) {
      if (costs[j - 1] < costs[best]) best = j - 1;
      if (costs[best] === Infinity) continue;
      const snap = metresBetween(coords[j], q.pins[i]);
      if (snap > 250) continue;
      next[j] = costs[best] + snap;
      previous[j] = best;
      if (end < 0 || next[j] < next[end]) end = j;
    }
    if (end < 0) throw pointError(422, i + 1, count, "could not be reached in order. Move it closer to a connected road or trail.");
    predecessors.push(previous);
    costs = next;
  }
  const indices = new Array(count);
  if (!q.returnToStart) indices[count - 1] = last;
  for (let i = predecessors.length - 1; i >= 0; i--) {
    indices[i] = end;
    end = predecessors[i][end];
  }
  return indices;
}

async function requestTrack(points, profile, { base, fetcher, signal }) {
  const form = new URLSearchParams({ mode: "pins", profile, lonlats: points.map(p => p.join(",")).join("|") });
  try {
    return await untilAbort(async () => {
      const response = await fetcher(base, { method: "POST", body: form.toString(), redirect: "manual", signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/geo+json, application/json" } });
      if (signal.aborted || (!response.ok && response.status !== 422)) {
        response.body?.cancel().catch(() => {});
        throw unavailable();
      }
      const bytes = await routeBytes(response, signal, response.ok ? undefined : 2048);
      const json = JSON.parse(new TextDecoder().decode(bytes));
      if (response.status === 422) {
        if (!["no_route", "outside_coverage"].includes(json?.error)) throw unavailable();
        const index = json.pointIndex;
        return { pointIndex: Number.isInteger(index) && index >= 0 && index < points.length ? index : null };
      }
      const feature = Array.isArray(json?.features) && json.features.find(f => f?.geometry?.type === "LineString");
      const coords = feature?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2 || coords.length > MAX_POINTS || !coords.every(pointOK)) throw unavailable();
      return { feature };
    }, signal);
  } catch { throw unavailable(); }
}

export async function generatePinnedRoute(body, { fetcher = fetch, endpoint = ROUTER_URL, now = Date.now(), signal, reserveAdditionalCall } = {}) {
  const q = cleanPinQuery(body), points = pointsOf(q), base = new URL(endpoint);
  if (base.protocol !== "https:" || base.username || base.password) throw unavailable();
  const deadline = AbortSignal.timeout(ROUTE_SEARCH_MS);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const routeTo = size => requestTrack(points.slice(0, size), routingProfile(q), { base, fetcher, signal: combined });
  const response = await routeTo(points.length);
  if (!response.feature) {
    // An unmapped waypoint has an engine index. For disconnected components
    // BRouter can omit that index. Find the shortest failing prefix on demand.
    let lo = 1, hi = points.length, failed = response.pointIndex;
    while (failed === null && hi - lo > 1) {
      if (combined.aborted) throw unavailable();
      await reserveAdditionalCall?.();
      const size = Math.floor((lo + hi) / 2), probe = await routeTo(size);
      if (probe.feature) lo = size;
      else { hi = size; failed = probe.pointIndex; }
    }
    throw pointError(422, failed ?? hi - 1, q.pins.length, "could not be reached on this cycling profile. Move it to a connected road or trail.");
  }
  const coords = response.feature.geometry.coordinates, pinIndices = matchPins(coords, q);
  const route = cleanRoute({ ...q, pinIndices, coords, source: "map-pins", id: "r-" + crypto.randomUUID(), name: "Pinned ride", generatedAt: now });
  if (!route) throw new HttpError(422, "Choose a continuous ride between 100 metres and 220 km.");
  const roads = roadData(response.feature, q.surface);
  if (!terrainAccess(roads, q)) throw new HttpError(422, "This ride crosses a section unsuitable for the selected cycling profile. Move a pin or change the road preferences.");
  const terrain = terrainSummary(roads, route.metres);
  if (terrain) route.terrain = terrain;
  return { routes: [route], at: now, partial: false };
}
