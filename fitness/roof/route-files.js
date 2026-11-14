// GPX routes are reviewed locally; only the explicit native Plan save persists them.
import { cleanRoute, MAX_POINTS } from "../routes-geometry.js";
const MAX_BYTES = 5 * 1024 * 1024;
const children = (node, name) => [...(node?.children || [])].filter(n => n.localName === name);
export function parseGPXRoute(text, filename = "Imported route.gpx") {
  if (text.length > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text)) throw Error("Use a GPX file under 5 MB without document entities.");
  const xml = new DOMParser().parseFromString(text, "application/xml"), root = xml.documentElement;
  if (root?.localName !== "gpx" || xml.getElementsByTagName("parsererror").length) throw Error("That GPX file is not valid XML.");
  const segments = children(root, "trk").flatMap(n => children(n, "trkseg")), routes = children(root, "rte");
  const groups = [...segments, ...routes];
  if (groups.length !== 1) throw Error("Import one continuous GPX track or route at a time.");
  const group = groups[0], points = children(group, group.localName === "rte" ? "rtept" : "trkpt");
  if (points.some(p => children(p, "time").length)) return null; // Recorded activities use Fitness's existing reader.
  if (points.length < 2 || points.length > MAX_POINTS) throw Error("Use a route with 2–12,000 points.");
  const coords = points.map(p => {
    const lat = p.getAttribute("lat"), lon = p.getAttribute("lon"), ele = children(p, "ele")[0]?.textContent?.trim();
    return [lon == null || lon.trim() === "" ? NaN : Number(lon), lat == null || lat.trim() === "" ? NaN : Number(lat), ele ? Number(ele) : null];
  });
  const named = children(group, "name")[0] || children(group.parentElement, "name")[0] || children(children(root, "metadata")[0] || root, "name")[0];
  const name = (named?.textContent?.trim() || filename.replace(/\.gpx$/i, "")).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 90) || "Imported route";
  const route = cleanRoute({id:"r-" + crypto.randomUUID(), name, source:"imported-gpx", surface:"mixed", start:coords[0].slice(0,2), coords, generatedAt:Date.now()});
  if (!route) throw Error("Use valid coordinates, a 100 m–500 km route and no gaps over 2.5 km.");
  return route;
}
export async function readRouteFiles(files, current = () => true) {
  const routes = [], remaining = [], errors = [];
  for (const file of files) {
    if (!current()) return null;
    if (!/\.gpx$/i.test(file.name)) { remaining.push(file); continue; }
    try {
      if (file.size > MAX_BYTES) throw Error("Use a GPX file under 5 MB.");
      const text = await file.text();
      if (!current()) return null;
      const route = parseGPXRoute(text, file.name);
      if (route) routes.push(route); else remaining.push(file);
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
  const parsed = await readRouteFiles(files, current);
  if (!parsed || !current()) return null;
  const got = parsed.remaining.length ? await ctx.core.importFiles(parsed.remaining) : {acts:[],workouts:[],skipped:[],dupes:0};
  if (!current()) return null;
  got.skipped.push(...parsed.errors); got.routes = parsed.routes;
  return got;
}
