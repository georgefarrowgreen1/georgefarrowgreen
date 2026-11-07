// Pure loop planner shared by the Fitness API and the owned service’s deployment probes.
import { HttpError } from "./_http.js";
import { readCapped } from "./_pigeon.js";
import { cleanRoute, pointOK, destination, metresBetween, estimate, MAX_POINTS } from "../fitness/routes-geometry.js";
import { inUK } from "../workers/routing/src/coverage.js";
const ROUTER_URL = "https://routing.internal/route";
function cleanQuery(b) {
  if (!b || !pointOK(b.start) || !Number.isInteger(b.minutes) || b.minutes < 30 || b.minutes > 240 || !["road", "mixed"].includes(b.surface) || !Number.isFinite(b.speed) || b.speed < 10 || b.speed > 40 || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 1e6) throw new HttpError(400, "Choose a ride from 30 minutes to 4 hours and a starting location.");
  if (!inUK(b.start.slice(0, 2))) throw new HttpError(422, "Cycling routes currently cover the United Kingdom.");
  return { start: b.start.slice(0, 2).map((n) => Number(n.toFixed(6))), minutes: b.minutes, surface: b.surface, speed: b.speed, seed: b.seed };
}
function waypoints(q, bearing, scale = 1) {
  const target = Math.min(12e4, Math.max(5e3, (q.minutes - 5) * q.speed / 60 * 1e3)), radius = target / 4.6 * scale;
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
async function generateRoutes(body, { fetcher = fetch, endpoint = ROUTER_URL, now = Date.now(), signal } = {}) {
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
      try {
        const r = await fetcher(base, {method: "POST", body: form.toString(), headers: {"Content-Type": "application/x-www-form-urlencoded", Accept: "application/geo+json, application/json"}, signal: attempt.signal, redirect: "error"});
        if (!r.ok) {
          providerDown ||= r.status >= 500 || r.status === 429;
          await r.body?.cancel();
          continue;
        }
        const bytes = await readCapped(r, 3 * 1024 * 1024, "Route response too large.");
        const json = JSON.parse(new TextDecoder().decode(bytes)), coords = json?.features?.find((f) => f.geometry?.type === "LineString")?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length > MAX_POINTS) continue;
        const route = cleanRoute({ id: "r-" + crypto.randomUUID(), name: `${["First", "Second", "Third"][n]} loop`, start: q.start, surface: q.surface, coords, generatedAt: now });
        if (!route || overlap(route.coords) > 0.4) continue;
        const duration = estimate(route, q.speed);
        scale = Math.min(1.3, Math.max(.55, scale * (q.minutes - 5) / Math.max(1, duration - 5)));
        if (duration < q.minutes * 0.5 || duration > q.minutes * 1.7) continue;
        if (routes.some((r2) => Math.abs(r2.metres - route.metres) < r2.metres * 0.04 && metresBetween(r2.coords[Math.floor(r2.coords.length / 2)], route.coords[Math.floor(route.coords.length / 2)]) < 500)) continue;
        route.duration = duration;
        routes.push(route);
      } catch (e) {
        providerDown = true;
      } finally {
        clearTimeout(attemptTimer);
        abort.signal.removeEventListener("abort", cancelAttempt);
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
  if (!routes.length) throw new HttpError(providerDown || abort.signal.aborted ? 503 : 422, providerDown || abort.signal.aborted ? "InFlite’s UK router is starting or busy. Please try again shortly." : "No suitable cycling loop was found here. Try a different ride length or surface.");
  routes.sort((a, b) => Math.abs(a.duration - q.minutes) - Math.abs(b.duration - q.minutes));
  const names = ["Recommended loop", "Alternative loop", "Another way round"];
  routes.forEach((r, i) => {
    r.name = names[i];
    delete r.duration;
  });
  return { routes, at: now, partial: routes.length < 3 };
}
export { ROUTER_URL, cleanQuery, generateRoutes, waypoints };
