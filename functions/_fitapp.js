// Fitness's files, as a browser gets them. The app lives in fitness/ and is served at the root of
// fitness.georgefarrowgreen.com (functions/_middleware.js); on preview and local addresses it's at /fitness/
// (functions/fitness/_middleware.js), where it opens but can't sign in (the account's API answers only at its own
// address). Its files only use relative addresses, so they work the same at either.
//
// It asks nothing of anywhere else: your rides are read and drawn on the phone, and kept with your account here
// (functions/api/fitness), so only the site itself is allowed.

import { notFound } from "./_app.js";

export const FITNESS_HOST = "fitness.georgefarrowgreen.com";
// (FITNESS_HOST in the environment: tests, which run the app's own address on local names, a comma between them)
export const isFitness = (url, env) => (env.FITNESS_HOST || FITNESS_HOST).split(",").includes(url.hostname);

export const FIT_SECURITY = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // its own window, and its files for its own pages only
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
// the app's one page (as stored, under /fitness/)
const PAGE = /^\/fitness\/(index\.html)?$/;

// The response for one of the app's files: `res` is the file as stored, at `path` (under /fitness/)
export function serveFitness(res, path) {
  const type = res.headers.get("content-type") || "";
  // anything else that comes back as a page is the site's home page, served as a fallback
  if (res.status === 200 && type.includes("text/html") && !PAGE.test(path)) return notFound();
  if (res.status === 404) return notFound();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(FIT_SECURITY)) out.headers.set(k, v);
  // the page and its code never kept, so each opening is the latest (app.js also checks, as you come back to it)
  if (res.status === 200 && /\.(html|js|css|webmanifest)$|\/$/.test(path)) out.headers.set("Cache-Control", "no-store");
  if (res.status === 200 && /\.(png|svg)$/.test(path)) out.headers.set("Cache-Control", "public, max-age=86400");
  return out;
}

// fitness.georgefarrowgreen.com: /x is the file /fitness/x; the API is only Fitness's own
export async function fitnessHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/fitness/") ? ctx.next() : notFound();
  // an address from the site's own copy, on the new host: the same place, at the root
  if (url.pathname === "/fitness" || url.pathname.startsWith("/fitness/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(8) || "/";
    return Response.redirect(to.href, 301);
  }
  const path = "/fitness" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveFitness(res, path);
}
