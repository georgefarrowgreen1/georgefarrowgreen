// Account-only route transport. Coordinates never enter URLs or browser storage.
import { cleanRoute } from "./routes-geometry.js";
let generation = 0, revision = 0;
const cache = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map();
async function call(path, { method = "GET", body, signal, wait = 3e4 } = {}) {
  const abort = new AbortController(), cancel = () => abort.abort(), timer = setTimeout(cancel, wait);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    const r = await fetch("/api/fitness/routes/" + path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : void 0, signal: abort.signal, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Routes could not be loaded. Please try again."), { status: r.status });
    return j;
  } catch (e) {
    if (abort.signal.aborted) throw Object.assign(new Error(signal?.aborted ? "Cancelled." : "Route planning is taking too long. Please try again."), { name: "AbortError" });
    if (e instanceof TypeError) throw new Error(globalThis.navigator?.onLine === false ? "You’re offline. Reconnect, then try planning your route again." : "Routes could not be reached. Please try again in a moment.");
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
const check = (p) => p && cleanRoute(p.route) ? { ...p, route: cleanRoute(p.route) } : null;
function forgetRoutePlans() {
  generation++;
  revision++;
  cache.clear();
  pending.clear();
}
async function readRoutePlan(owner, { force = false, signal } = {}) {
  if (!owner) return null;
  const hit = cache.get(owner);
  if (!force && hit && Date.now() - hit.at < 3e4) return hit.plan;
  if (!force && pending.has(owner)) return pending.get(owner);
  const gen = generation, rev = revision, p = call("plan", { signal }).then((j) => {
    const plan = check(j.plan);
    if (gen === generation && rev === revision) {
      cache.clear();
      cache.set(owner, { plan, at: Date.now() });
    }
    return rev === revision ? plan : cache.get(owner)?.plan ?? null;
  });
  pending.set(owner, p);
  try {
    return await p;
  } finally {
    if (pending.get(owner) === p) pending.delete(owner);
  }
}
async function saveRoutePlan(owner, plan, { signal } = {}) {
  const gen = generation;
  revision++;
  const r = await call("plan", { method: "PUT", body: plan, signal });
  const saved = check(r.plan);
  if (!saved) throw Error("The saved route could not be read. Please try again.");
  if (gen === generation) {
    cache.clear();
    cache.set(owner, { plan: saved, at: Date.now() });
  }
  return saved;
}
async function removeRoutePlan(owner, planToRemove, { signal } = {}) {
  const gen = generation;
  revision++;
  const r = await call("plan", { method: "DELETE", body: { id: planToRemove.route.id, version: planToRemove.version }, signal });
  const plan = check(r.plan);
  if (gen === generation) {
    cache.clear();
    cache.set(owner, { plan, at: Date.now() });
  }
  return plan;
}
async function generateRoutes(query, { signal } = {}) {
  const j = await call("generate", { method: "POST", body: query, signal, wait: 9e4 });
  const routes = (j.routes || []).map(cleanRoute).filter(Boolean);
  if (!routes.length) throw Error("No suitable cycling loops were returned. Try another ride length.");
  return routes;
}
export {
  forgetRoutePlans,
  generateRoutes,
  readRoutePlan,
  removeRoutePlan,
  saveRoutePlan
};
