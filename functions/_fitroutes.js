// Account persistence and routing for cycling loops and ordered map pins.
import { HttpError } from "./_http.js";
import { tablesOnce, fitdb } from "./_fitness.js";
import { cleanRoute } from "../fitness/routes-geometry.js";
import { validDay } from "../fitness/routes-store.js";
import { ROUTE_SEARCH_MS, ROUTER_URL, cleanQuery as cleanLoopQuery, generateRoutes as generateLoops, waypoints } from "./_fitloops.js";
import { cleanPinQuery, generatePinnedRoute } from "./_fitpinroutes.js";
function cleanQuery(body) {
  if (body?.mode === "pins") return cleanPinQuery(body);
  if (body?.mode != null && body.mode !== "loop") throw new HttpError(400, "Choose a loop or a ride to pins.");
  return cleanLoopQuery(body);
}
function generateRoutes(body, options) {
  return body?.mode === "pins" ? generatePinnedRoute(body, options) : generateLoops(body, options);
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
  const route = b?.route;
  const scheduleOnly = route?.source === "map-pins" &&
    ["pins", "pinIndices", "returnToStart"].every(key => !Object.hasOwn(route, key));
  if (scheduleOnly) {
    // Earlier iOS builds re-encode the known fields when changing departure.
    // Reuse the owner's whole stored track, and only while that version is current.
    const saved = await routePlan(env, userId);
    if (saved?.route.source !== "map-pins" || saved.route.id !== route.id ||
        JSON.stringify(saved.route.start) !== JSON.stringify(route.start) ||
        JSON.stringify(saved.route.coords) !== JSON.stringify(route.coords)) {
      throw new HttpError(409, "This planned ride has changed. Reload it before changing the departure.");
    }
    const plan = { ...cleanRoutePlan({ ...b, route: saved.route }, { now }), version: crypto.randomUUID() };
    const D = await ready(env);
    const result = await D.prepare("UPDATE fx_route_plan SET plan = ?, updated = ? WHERE user_id = ? AND json_extract(plan, '$.version') = ?")
      .bind(JSON.stringify(plan), now, userId, saved.version).run();
    if (!result.meta.changes) throw new HttpError(409, "This planned ride has changed. Reload it before changing the departure.");
    return plan;
  }
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
  ROUTE_SEARCH_MS,
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
