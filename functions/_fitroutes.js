// Live bicycle loops: a bounded, replaceable BRouter adapter. Never log coordinates or provider URLs.
import { HttpError } from "./_http.js";
import { readCapped } from "./_pigeon.js";
import { tablesOnce, fitdb } from "./_fitness.js";
import { cleanRoute, pointOK, destination, metresBetween, estimate, MAX_POINTS } from "../fitness/routes-geometry.js";
import { validDay } from "../fitness/routes-store.js";
const ROUTER_URL = "https://brouter.de/brouter";
function cleanQuery(b) {
  if (!b || !pointOK(b.start) || !Number.isInteger(b.minutes) || b.minutes < 30 || b.minutes > 240 || !["road", "mixed"].includes(b.surface) || !Number.isFinite(b.speed) || b.speed < 10 || b.speed > 40 || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 1e6) throw new HttpError(400, "Choose a ride from 30 minutes to 4 hours and a starting location.");
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
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 42e3), cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const routes = [];
  let providerDown = false, scale = 1;
  try {
    for (let n = 0; n < 3 && !abort.signal.aborted; n++) {
      const bearing = (q.seed * 137.508 + n * 120) % 360, points = waypoints(q, bearing, scale);
      const url = new URL(base);
      url.searchParams.set("lonlats", points.map((p) => p.join(",")).join("|"));
      url.searchParams.set("profile", q.surface === "road" ? "fastbike" : "trekking");
      url.searchParams.set("alternativeidx", "0");
      url.searchParams.set("format", "geojson");
      try {
        const r = await fetcher(url, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(16e3)]), redirect: "error", headers: { Accept: "application/geo+json, application/json" } });
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
        if (e?.name === "AbortError" || e?.name === "TimeoutError" || e instanceof TypeError) providerDown = true;
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
  if (!routes.length) throw new HttpError(providerDown || abort.signal.aborted ? 503 : 422, providerDown || abort.signal.aborted ? "The routing service is unavailable. Please try again shortly." : "No suitable cycling loop was found here. Try a different ride length or surface.");
  routes.sort((a, b) => Math.abs(a.duration - q.minutes) - Math.abs(b.duration - q.minutes));
  const names = ["Recommended loop", "Alternative loop", "Another way round"];
  routes.forEach((r, i) => {
    r.name = names[i];
    delete r.duration;
  });
  return { routes, at: now, partial: routes.length < 3 };
}
async function make(D) {
  await D.prepare("CREATE TABLE IF NOT EXISTS fx_route_plan (user_id TEXT PRIMARY KEY, plan TEXT NOT NULL, updated INTEGER NOT NULL)").run();
}
const ready = (env) => tablesOnce(env, "route_plan", make);
function cleanRoutePlan(b, { now = Date.now() } = {}) {
  const route = cleanRoute(b?.route);
  if (!route || !validDay(b.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || "") || typeof b.tz !== "string" || b.tz.length > 80) throw new HttpError(400, "Choose a valid route, day and departure time.");
  let today, last;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone: b.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    last = new Intl.DateTimeFormat("en-CA", { timeZone: b.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now + 30 * 864e5);
  } catch {
    throw new HttpError(400, "Choose a valid time zone.");
  }
  if (b.day < today || b.day > last) throw new HttpError(400, "Choose a ride within the next 30 days.");
  return { route, day: b.day, time: b.time, tz: b.tz };
}
async function routePlan(env, userId) {
  const D = await ready(env), r = await D.prepare("SELECT plan FROM fx_route_plan WHERE user_id = ?").bind(userId).first();
  if (!r) return null;
  try {
    const p = JSON.parse(r.plan);
    return cleanRoute(p.route) ? p : null;
  } catch {
    return null;
  }
}
async function saveRoutePlan(env, userId, b, { now = Date.now() } = {}) {
  const plan = { ...cleanRoutePlan(b, { now }), version: crypto.randomUUID() }, D = await ready(env);
  await D.prepare("INSERT INTO fx_route_plan (user_id, plan, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, updated = excluded.updated").bind(userId, JSON.stringify(plan), now).run();
  return plan;
}
async function dropRoutePlan(env, userId, { expected, version } = {}) {
  const D = await ready(env);
  if (expected) {
    await D.prepare("DELETE FROM fx_route_plan WHERE user_id = ? AND json_extract(plan, '$.route.id') = ? AND json_extract(plan, '$.version') = ?").bind(userId, expected, version).run();
  } else await D.prepare("DELETE FROM fx_route_plan WHERE user_id = ?").bind(userId).run();
}
async function deleteRouteData(env, userId) {
  const D = await fitdb(env);
  await D.prepare("DELETE FROM fx_route_plan WHERE user_id = ?").bind(userId).run().catch(() => {
  });
}
async function exportRouteData(env, userId) {
  const D = await fitdb(env);
  try {
    const row = await D.prepare("SELECT plan FROM fx_route_plan WHERE user_id = ?").bind(userId).first();
    return row ? JSON.parse(row.plan) : null;
  } catch {
    return null;
  }
}
export {
  ROUTER_URL,
  cleanQuery,
  cleanRoutePlan,
  deleteRouteData,
  dropRoutePlan,
  exportRouteData,
  generateRoutes,
  routePlan,
  saveRoutePlan,
  waypoints
};
