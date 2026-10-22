// Weather's files, as a browser gets them. The app lives in weather/ and is
// served at the root of weather.georgefarrowgreen.com (functions/_middleware.js);
// on preview and local addresses it's at /weather/ (functions/weather/_middleware.js).
// Its files only use relative addresses, so they work the same at either.
//
// (WebAssembly runs: a password's stretched on the phone when you sign in to your account, weather/account.js.)
// It asks Open-Meteo (the forecast, and its archive of past forecasts), BigDataCloud
// (a name for where you are) and RainViewer (the radar) straight from the browser,
// and draws the radar over OpenFreeMap's vector map (its tiles, fonts and relief; or
// OpenStreetMap's tiles, without WebGL 2), so those, and nothing else, are allowed.

import { notFound } from "./_app.js";

export const WEATHER_HOST = "weather.georgefarrowgreen.com";
// (WEATHER_HOST in the environment: tests, which run the app's own address on local names, a comma between them)
export const isWeather = (url, env) => (env.WEATHER_HOST || WEATHER_HOST).split(",").includes(url.hostname);

const CONNECT = [
  "https://api.open-meteo.com", "https://ensemble-api.open-meteo.com", "https://air-quality-api.open-meteo.com", "https://marine-api.open-meteo.com",
  "https://archive-api.open-meteo.com", "https://geocoding-api.open-meteo.com", "https://previous-runs-api.open-meteo.com",
  "https://api.bigdatacloud.net", "https://nominatim.openstreetmap.org", "https://api.rainviewer.com", "https://tiles.openfreemap.org", "https://cloudflareinsights.com",
];
const IMAGES = ["https://tilecache.rainviewer.com", "https://tile.openstreetmap.org", "https://tiles.openfreemap.org"];
export const WX_SECURITY = {
  "Content-Security-Policy": `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data: blob: ${IMAGES.join(" ")}; font-src 'self'; connect-src 'self' ${CONNECT.join(" ")}; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`,
  "Permissions-Policy": "geolocation=(self), microphone=(), camera=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // its own window, and its files for its own pages only
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
// the app's one page (as stored, under /weather/)
const PAGE = /^\/weather\/(index\.html)?$/;

// The response for one of the app's files: `res` is the file as stored, at `path` (under /weather/)
export function serveWeather(res, path) {
  const type = res.headers.get("content-type") || "";
  // anything else that comes back as a page is the site's home page, served as a fallback
  if (res.status === 200 && type.includes("text/html") && !PAGE.test(path)) return notFound();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(WX_SECURITY)) out.headers.set(k, v);
  // small files, always checked for a newer copy (the browser keeps its copy until one appears); private, so
  // Cloudflare passes them through rather than keeping them and telling browsers to keep them for hours
  if (res.status === 200 && /\.(html|js|css|webmanifest)$|\/$/.test(path)) out.headers.set("Cache-Control", "private, no-cache");
  if (res.status === 200 && /\.(png|svg)$/.test(path)) out.headers.set("Cache-Control", "public, max-age=86400");
  return out;
}

// weather.georgefarrowgreen.com: /x is the file /weather/x; the API is only Weather's own
export async function weatherHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/weather/") ? ctx.next() : notFound();
  // an address from the site's own copy, on the new host: the same place, at the root
  if (url.pathname === "/weather" || url.pathname.startsWith("/weather/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(8) || "/";
    return Response.redirect(to.href, 301);
  }
  const path = "/weather" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveWeather(res, path);
}
