// Pure loop planner shared by the Fitness API and the owned service’s deployment probes.
import { HttpError } from "./_http.js";
import { cleanRoute, pointOK, destination, metresBetween, MAX_POINTS } from "../fitness/routes-geometry.js";
import { inUK } from "../workers/routing/src/coverage.js";
import {DISTANCE_TOLERANCE,roadData,selectRoutes} from "./_fitroutechoices.js";
const ROUTER_URL = "https://routing.internal/route";
function cleanQuery(b) {
  if (!b || !pointOK(b.start) || !["road", "mixed"].includes(b.surface) || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 1e6) throw new HttpError(400, "Choose a distance from 5 to 120 km and a starting location.");
  // Keep already-open 2.05 clients working during the rollout; new clients send metres only.
  const legacy = b.metres == null && Number.isInteger(b.minutes) && b.minutes >= 30 && b.minutes <= 240 && Number.isFinite(b.speed) && b.speed >= 10 && b.speed <= 40;
  const metres = legacy ? Math.round(Math.min(120000, Math.max(5000, (b.minutes - 5) * b.speed / 60 * 1000))) : b.metres;
  if (!Number.isInteger(metres) || metres < 5000 || metres > 120000) throw new HttpError(400, "Choose a distance from 5 to 120 km and a starting location.");
  if (!inUK(b.start.slice(0, 2))) throw new HttpError(422, "Cycling routes currently cover the United Kingdom.");
  if (b.roadPreference != null && !["main","quiet"].includes(b.roadPreference) || b.avoidUnpaved != null && typeof b.avoidUnpaved !== "boolean") throw new HttpError(400, "Choose main roads or quiet lanes.");
  return { start: b.start.slice(0, 2).map(n => Number(n.toFixed(6))), metres, surface: b.surface, seed: b.seed, roadPreference:b.roadPreference||"main", avoidUnpaved:b.surface==="road" ? b.avoidUnpaved!==false : false };
}
function waypoints(q, bearing, scale = 1) {
  const radius = q.metres / 4.6 * scale;
  return [q.start, destination(q.start, radius, bearing - 35), destination(q.start, radius * 1.55, bearing), destination(q.start, radius, bearing + 35), q.start];
}
// Detect individual turn-back spurs as well as aggregate repeated distance.
// Match actual road vertices, rather than turn angles: a hairpin on a different road is valid.
function routeQuality(coords) {
  const seen = new Set(), stack = [];
  let repeated = 0, total = 0, returning = 0, longestBacktrack = 0;
  for (let i = 0; i < coords.length; i++) {
    const point = coords[i], vertex = `${point[0].toFixed(6)},${point[1].toFixed(6)}`;
    const previous = stack.at(-1);
    if (previous?.vertex === vertex) continue;
    if (stack.length > 1 && stack.at(-2).vertex === vertex) {
      returning += metresBetween(previous.point, point);
      longestBacktrack = Math.max(longestBacktrack, returning);
      stack.pop();
    } else { returning = 0; stack.push({vertex, point}); }
    if (!i) continue;
    const key = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`, a = key(coords[i - 1]), b = key(point);
    if (a === b) continue;
    const edge = a < b ? `${a}|${b}` : `${b}|${a}`, length = metresBetween(coords[i - 1], point);
    total += length;
    if (seen.has(edge)) repeated += length;
    seen.add(edge);
  }
  return {overlap: total ? repeated / total : 1, longestBacktrack};
}
async function routeBytes(response, signal) {
  const max = 3 * 1024 * 1024, said = response.headers.get("Content-Length");
  if (said !== null && !(Number(said) <= max)) throw new HttpError(413, "Route response too large.");
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader(), parts = []; let size = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (signal.aborted) throw new DOMException("Route request timed out.", "AbortError");
      if (done) break;
      if ((size += value.byteLength) > max) { cancel(); throw new HttpError(413, "Route response too large."); }
      parts.push(value);
    }
    const out = new Uint8Array(size); let at = 0;
    for (const part of parts) { out.set(part, at); at += part.byteLength; }
    return out;
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
// A private binding may not honour AbortSignal. Bound the whole fetch/body operation as well.
function untilAbort(task, signal) {
  if (signal.aborted) return Promise.reject(new DOMException("Route request timed out.", "AbortError"));
  let cancel;
  const aborted = new Promise((_, reject) => { cancel = () => reject(new DOMException("Route request timed out.", "AbortError")); signal.addEventListener("abort", cancel, { once: true }); });
  return Promise.race([Promise.resolve().then(task), aborted]).finally(() => signal.removeEventListener("abort", cancel));
}
async function generateRoutes(body, { fetcher = fetch, endpoint = ROUTER_URL, now = Date.now(), signal, onAttempt } = {}) {
  const q = cleanQuery(body), base = new URL(endpoint);
  if (base.protocol !== "https:" || base.username || base.password) throw new HttpError(503, "Route planning is not configured.");
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 75e3), cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const routes = [];
  let providerDown = false, calibration = 1;
  const queue=Array.from({length:6},(_,n)=>({bearing:(q.seed*137.508+n*60)%360,scale:null,refinements:0}));
  try {
    for (let n = 0; n < 9 && queue.length && !abort.signal.aborted; n++) {
      const task=queue.shift(),scale=task.scale??calibration,points=waypoints(q,task.bearing,scale);
      const attempt = new AbortController(), cancelAttempt = () => attempt.abort();
      abort.signal.addEventListener("abort", cancelAttempt, { once: true });
      if (abort.signal.aborted) cancelAttempt();
      const attemptTimer = setTimeout(cancelAttempt, 30000);
      const form = new URLSearchParams({lonlats: points.map(p => p.join(",")).join("|"), profile: q.surface==="mixed"?"mixed":"road"+(q.roadPreference==="quiet"?"-quiet":"")+(q.avoidUnpaved?"-paved":"")});
      let phase = "request", status = 0, response; const at = Date.now();
      try {
        const bytes = await untilAbort(async () => {
        const r = response = await fetcher(base, {method: "POST", body: form.toString(), headers: {"Content-Type": "application/x-www-form-urlencoded", Accept: "application/geo+json, application/json"}, signal: attempt.signal, redirect: "manual"});
        status = r.status;
        if (attempt.signal.aborted) { r.body?.cancel().catch(() => {}); throw new DOMException("Route request timed out.", "AbortError"); }
        if (!r.ok) {
          providerDown ||= r.status >= 500 || r.status === 429;
          r.body?.cancel().catch(() => {});
          return null;
        }
        phase = "body";
        return await routeBytes(r, attempt.signal);
        }, attempt.signal);
        if (!bytes) continue;
        phase = "normalise";
        const json = JSON.parse(new TextDecoder().decode(bytes)), feature=json?.features?.find(f=>f.geometry?.type==="LineString"),coords=feature?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length > MAX_POINTS) continue;
        const route = cleanRoute({ id: "r-" + crypto.randomUUID(), name: "Cycling loop", start: q.start, surface: q.surface, coords, generatedAt: now });
        if (!route) continue;
        const quality = routeQuality(route.coords);
        if (quality.overlap > .4 || quality.longestBacktrack > 10) continue;
        const roads=roadData(feature);
        if(q.surface==="road"&&q.avoidUnpaved&&roads&&roads.unpaved>20)continue;
        const error=Math.abs(route.metres-q.metres)/q.metres,nextScale=Math.min(1.8,Math.max(.35,scale*q.metres/route.metres));
        calibration=nextScale;
        if(error>.05&&task.refinements<2&&Math.abs(nextScale-scale)>.02){const next={bearing:task.bearing,scale:nextScale,refinements:task.refinements+1};if(error>DISTANCE_TOLERANCE)queue.unshift(next);else queue.push(next);}
        if(error>DISTANCE_TOLERANCE)continue;
        if(routes.some(other=>Math.abs(other.metres-route.metres)<30&&metresBetween(other.coords[Math.floor(other.coords.length/2)],route.coords[Math.floor(route.coords.length/2)])<30))continue;
        route._roads=roads;route._quality=quality;route.targetMetres=q.metres;route.roadPreference=q.roadPreference;route.avoidUnpaved=q.avoidUnpaved;
        routes.push(route);
        if(routes.length>=5&&n>=5)break;
      } catch (e) {
        providerDown = true;
      } finally {
        clearTimeout(attemptTimer);
        if (attempt.signal.aborted) { try { response?.body?.cancel().catch(() => {}); } catch {} }
        onAttempt?.({ phase, status, ms: Date.now() - at, aborted: attempt.signal.aborted });
        abort.signal.removeEventListener("abort", cancelAttempt);
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
  if (!routes.length) throw new HttpError(providerDown || abort.signal.aborted ? 503 : 422, providerDown || abort.signal.aborted ? "InFlite’s UK router is starting or busy. Please try again shortly." : "No cycling loop within 10% of that distance was found here. Try a different distance or road preference.");
  const selected=selectRoutes(routes,q);
  for(const route of selected){delete route._roads;delete route._quality;}
  return {routes:selected,at:now,partial:selected.length<3};
}
export { ROUTER_URL, cleanQuery, generateRoutes, waypoints, routeQuality };
