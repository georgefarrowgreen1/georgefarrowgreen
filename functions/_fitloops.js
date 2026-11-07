// Pure loop planner shared by the Fitness API and the owned service’s deployment probes.
import { HttpError } from "./_http.js";
import { cleanRoute, pointOK, destination, metresBetween, MAX_POINTS } from "../fitness/routes-geometry.js";
import { inUK } from "../workers/routing/src/coverage.js";
const ROUTER_URL = "https://routing.internal/route";
function cleanQuery(b) {
  if (!b || !pointOK(b.start) || !["road", "mixed"].includes(b.surface) || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 1e6) throw new HttpError(400, "Choose a distance from 5 to 120 km and a starting location.");
  // Keep already-open 2.05 clients working during the rollout; new clients send metres only.
  const legacy = b.metres == null && Number.isInteger(b.minutes) && b.minutes >= 30 && b.minutes <= 240 && Number.isFinite(b.speed) && b.speed >= 10 && b.speed <= 40;
  const metres = legacy ? Math.round(Math.min(120000, Math.max(5000, (b.minutes - 5) * b.speed / 60 * 1000))) : b.metres;
  if (!Number.isInteger(metres) || metres < 5000 || metres > 120000) throw new HttpError(400, "Choose a distance from 5 to 120 km and a starting location.");
  if (!inUK(b.start.slice(0, 2))) throw new HttpError(422, "Cycling routes currently cover the United Kingdom.");
  return { start: b.start.slice(0, 2).map(n => Number(n.toFixed(6))), metres, surface: b.surface, seed: b.seed };
}
function waypoints(q, bearing, scale = 1) {
  const radius = q.metres / 4.6 * scale;
  return [q.start, destination(q.start, radius, bearing - 35), destination(q.start, radius * 1.55, bearing), destination(q.start, radius, bearing + 35), q.start];
}
function overlap(coords) {
  const seen = /* @__PURE__ */ new Set();
  let repeated = 0, total = 0;
  for (let i = 1; i < coords.length; i++) {
    const key = (c) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`, a = key(coords[i - 1]), b = key(coords[i]);
    if (a === b) continue;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`, len = metresBetween(coords[i - 1], coords[i]);
    total += len;
    if (seen.has(k)) repeated += len;
    seen.add(k);
  }
  return total ? repeated / total : 1;
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
  let providerDown = false, scale = 1;
  try {
    for (let n = 0; n < 3 && !abort.signal.aborted; n++) {
      const bearing = (q.seed * 137.508 + n * 120) % 360, points = waypoints(q, bearing, scale);
      const attempt = new AbortController(), cancelAttempt = () => attempt.abort();
      abort.signal.addEventListener("abort", cancelAttempt, { once: true });
      if (abort.signal.aborted) cancelAttempt();
      const attemptTimer = setTimeout(cancelAttempt, 30000);
      const form = new URLSearchParams({lonlats: points.map(p => p.join(",")).join("|"), profile: q.surface});
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
        const json = JSON.parse(new TextDecoder().decode(bytes)), coords = json?.features?.find((f) => f.geometry?.type === "LineString")?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length > MAX_POINTS) continue;
        const route = cleanRoute({ id: "r-" + crypto.randomUUID(), name: `${["First", "Second", "Third"][n]} loop`, start: q.start, surface: q.surface, coords, generatedAt: now });
        if (!route || overlap(route.coords) > 0.4) continue;
        scale = Math.min(1.6, Math.max(.4, scale * q.metres / route.metres));
        if (Math.abs(route.metres - q.metres) > q.metres * .25) continue;
        if (routes.some((r2) => Math.abs(r2.metres - route.metres) < r2.metres * 0.04 && metresBetween(r2.coords[Math.floor(r2.coords.length / 2)], route.coords[Math.floor(route.coords.length / 2)]) < 500)) continue;
        routes.push(route);
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
  if (!routes.length) throw new HttpError(providerDown || abort.signal.aborted ? 503 : 422, providerDown || abort.signal.aborted ? "InFlite’s UK router is starting or busy. Please try again shortly." : "No suitable cycling loop was found here. Try a different distance or surface.");
  routes.sort((a, b) => Math.abs(a.metres - q.metres) - Math.abs(b.metres - q.metres));
  const names = ["Recommended loop", "Alternative loop", "Another way round"];
  routes.forEach((r, i) => {
    r.name = names[i];
  });
  return { routes, at: now, partial: routes.length < 3 };
}
export { ROUTER_URL, cleanQuery, generateRoutes, waypoints };
