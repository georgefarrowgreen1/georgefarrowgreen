// Account persistence for route plans; loop generation uses the owned UK service.
import { HttpError } from "./_http.js";
import { tablesOnce, fitdb } from "./_fitness.js";
import { cleanRoute } from "../fitness/routes-geometry.js";
import { validDay } from "../fitness/routes-store.js";
import { ROUTER_URL, cleanQuery, generateRoutes, waypoints } from "./_fitloops.js";
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
