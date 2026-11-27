// GPX routes are reviewed locally; only the explicit native Plan save persists them.
import { cleanRoute, MAX_POINTS } from "../routes-geometry.js";
const MAX_ROUTE_BYTES = 5 * 1024 * 1024, MAX_ACTIVITY_BYTES = 25 * 1024 * 1024;
const children = (node, name) => [...(node?.children || [])].filter(n => n.localName === name);
function routeInput(text, filename, bytes) {
  if (bytes > MAX_ACTIVITY_BYTES) throw Error("Use a GPX file under 25 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error("Use a GPX file without document entities.");
  const xml = new DOMParser().parseFromString(text, "application/xml"), root = xml.documentElement;
  if (root?.localName !== "gpx" || xml.getElementsByTagName("parsererror").length) throw Error("That GPX file is not valid XML.");
  const segments = children(root, "trk").flatMap(n => children(n, "trkseg")), routes = children(root, "rte");
  const groups = [...segments, ...routes];
  const pointsOf = (group) => children(group, group.localName === "rte" ? "rtept" : "trkpt");
  if (groups.some(group => pointsOf(group).some(p => children(p, "time").length))) return null; // Recorded activities use Fitness's existing reader.
  if (bytes > MAX_ROUTE_BYTES) throw Error("Use a GPX route under 5 MB.");
  if (groups.length !== 1) throw Error("Import one continuous GPX track or route at a time.");
  const group = groups[0], points = pointsOf(group);
  if (points.length < 2 || points.length > MAX_POINTS) throw Error("Use a route with 2–12,000 points.");
  const coords = points.map(p => {
    const lat = p.getAttribute("lat"), lon = p.getAttribute("lon"), ele = children(p, "ele")[0]?.textContent?.trim();
    return [lon == null || lon.trim() === "" ? NaN : Number(lon), lat == null || lat.trim() === "" ? NaN : Number(lat), ele ? Number(ele) : null];
  });
  const named = children(group, "name")[0] || children(group.parentElement, "name")[0] || children(children(root, "metadata")[0] || root, "name")[0];
  const name = (named?.textContent?.trim() || filename.replace(/\.gpx$/i, "")).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 90) || "Imported route";
  return {id:"r-" + crypto.randomUUID(), name, source:"imported-gpx", surface:"mixed", start:coords[0].slice(0,2), coords, generatedAt:Date.now()};
}
function checked(route) {
  if (!route) throw Error("Use valid coordinates, a 100 m–500 km route and no gaps over 2.5 km.");
  return route;
}
export function parseGPXRoute(text, filename = "Imported route.gpx") {
  const input = routeInput(text, filename, new TextEncoder().encode(text).byteLength);
  return input ? checked(cleanRoute(input)) : null;
}
async function validateRoute(input, fw) {
  let worker, timer;
  try {
    worker = await fw.lazy(() => new Worker(new URL("../reader.js", import.meta.url), { type: "module" }));
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => data.error ? reject(Error(data.error)) : resolve(data.r);
      worker.onerror = event => { event.preventDefault(); reject(Error("The route reader failed.")); };
      timer = setTimeout(reject, 5000);
      worker.postMessage({ id: 1, route: input });
    });
  } catch (_) {
    return cleanRoute(input);
  } finally {
    clearTimeout(timer);
    worker?.terminate();
  }
}
export async function readRouteFiles(files, current = () => true, fw) {
  const routes = [], remaining = [], errors = [];
  for (const file of files) {
    if (!current()) return null;
    if (!/\.gpx$/i.test(file.name)) { remaining.push(file); continue; }
    try {
      if (file.size > MAX_ACTIVITY_BYTES) throw Error("Use a GPX file under 25 MB.");
      const text = await file.text();
      if (!current()) return null;
      const input = routeInput(text, file.name, file.size);
      if (!input) { remaining.push(file); continue; }
      const route = checked(input.coords.length >= 1000 && fw?.lazy && typeof Worker === "function" ? await validateRoute(input, fw) : cleanRoute(input));
      if (!current()) return null;
      routes.push(route);
    } catch (error) { errors.push(`${file.name}: ${error.message}`); }
  }
  return {routes, remaining, errors};
}
export function reviewRoutes(ctx, routes, current, onClose) {
  if (!current()) return false;
  const {el} = ctx.fw.ui, body = el("div", {class:"m-fitness"}), group = el("div", {class:"group glass"});
  body.append(el("p", {class:"about", text:"Choose a route to review. It is saved only when you select Save planned route."}));
  let sheet, closed = false;
  for (const route of routes) group.append(el("button", {type:"button", class:"row", text:`${route.name} · ${(route.metres / 1000).toFixed(1)} km`, on:{click:() => {
    if (closed || !current()) return;
    ctx.routeToOpen = {route, imported:true}; sheet?.now(); ctx.fw.nav.section("routes");
  }}}));
  body.append(group);
  sheet = ctx.fw.sheet.open({sheet:"fitness-route-import", title:"Review imported routes", app:"fitness", body, onClose:() => { closed = true; onClose?.(); }});
  return true;
}

export async function importFiles(ctx, files, current) {
  const parsed = await readRouteFiles(files, current, ctx.fw);
  if (!parsed || !current()) return null;
  const got = parsed.remaining.length ? await ctx.core.importFiles(parsed.remaining) : {acts:[],workouts:[],skipped:[],dupes:0};
  if (!current()) return null;
  got.skipped.push(...parsed.errors); got.routes = parsed.routes;
  return got;
}
