// Precision Fit Studio: Pedal Revolution's bike-fit form, for the fitter's iPad. The app lives in fitting/ and is served
// at the root of its own address, fitting.georgefarrowgreen.com (functions/_middleware.js); on preview and local
// addresses at /fitting/ (functions/fitting/_middleware.js). Its files only use relative addresses, so they work the
// same at either.
//
// It has no API and asks nothing of anywhere else (its typefaces and PDF libraries are its own copies): every fit it
// records stays in the browser that recorded it (IndexedDB), until the fitter shares the client's report.

import { notFound } from "./_app.js";
export const FITTING_HOST = "fitting.georgefarrowgreen.com";
// (FITTING_HOST in the environment: tests, which run the app's own address on local names, a comma between them)
export const isFitting = (url, env) => (env.FITTING_HOST || FITTING_HOST).split(",").includes(url.hostname);

// (styles inline as well as its own: the form and the report place their gauges and photos with style attributes.
// Scripts only its own, so nothing a rider's name or note holds can ever run.)
export const FIT_SECURITY = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
// the app's one page (as stored, under /fitting/)
const PAGE = /^\/fitting\/(index\.html)?$/;

// The response for one of the app's files: `res` is the file as stored, at `path` (under /fitting/)
export function serveFitting(res, path) {
  const type = res.headers.get("content-type") || "";
  // anything else that comes back as a page is the site's home page, served as a fallback
  if (res.status === 200 && type.includes("text/html") && !PAGE.test(path)) return notFound();
  if (res.status === 404) return notFound();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(FIT_SECURITY)) out.headers.set(k, v);
  // (the page, its code and its worker asked after each time, by their ETag: so each opening is the latest; the
  // typefaces and libraries never change at an address, so kept a month)
  if ((res.status === 200 || res.status === 304) && /\.(html|js|css|webmanifest)$|\/$/.test(path) && !path.includes("/vendor/")) out.headers.set("Cache-Control", "no-cache");
  if (res.status === 200 && (/\/(fonts|vendor)\//.test(path) || /\.png$/.test(path))) out.headers.set("Cache-Control", "public, max-age=2592000");
  return out;
}

// fitting.georgefarrowgreen.com: /x is the file /fitting/x; no API
export async function fittingHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return notFound();
  if (url.pathname === "/fitting" || url.pathname.startsWith("/fitting/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(8) || "/";
    return Response.redirect(to.href, 301);
  }
  const path = "/fitting" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveFitting(res, path);
}
