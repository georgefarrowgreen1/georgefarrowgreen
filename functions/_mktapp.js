// Markets's files, as a browser gets them. The app lives in markets/ and is served at the root of finance.inflite.ai
// (functions/_middleware.js); on preview and local addresses it's at /markets/ (functions/markets/_middleware.js), where
// it opens but can't sign in (the account's API answers only at its own address). Its files only use relative
// addresses, so they work the same at either.
//
// It asks nothing of anywhere else: prices, charts and news come through its own API (functions/api/markets), which
// fetches them once for everyone and keeps them a minute or more (functions/_markets.js).

import { notFound } from "./_app.js";
import { assets } from "./_min.js";
export const MARKETS_HOST = "finance.inflite.ai";
// (MARKETS_HOST in the environment: tests, which run the app's own address on local names, a comma between them)
export const isMarkets = (url, env) => (env.MARKETS_HOST || MARKETS_HOST).split(",").includes(url.hostname);

export const MKT_SECURITY = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
// the app's one page (as stored, under /markets/)
const PAGE = /^\/markets\/(index\.html)?$/;

// The response for one of the app's files: `res` is the file as stored, at `path` (under /markets/)
export function serveMarkets(res, path) {
  const type = res.headers.get("content-type") || "";
  // anything else that comes back as a page is the site's home page, served as a fallback
  if (res.status === 200 && type.includes("text/html") && !PAGE.test(path)) return notFound();
  if (res.status === 404) return notFound();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(MKT_SECURITY)) out.headers.set(k, v);
  // (the page and its code kept, but asked after each time, by their ETag: so each opening is the latest)
  if ((res.status === 200 || res.status === 304) && /\.(html|js|css|webmanifest)$|\/$/.test(path)) out.headers.set("Cache-Control", "no-cache");
  if (res.status === 200 && /\.(png|svg)$/.test(path)) out.headers.set("Cache-Control", "public, max-age=86400");
  return out;
}

// finance.inflite.ai: /x is the file /markets/x; the API is only Markets's own
export async function marketsHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/markets/") ? ctx.next() : notFound();
  if (url.pathname === "/markets" || url.pathname.startsWith("/markets/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(8) || "/";
    return Response.redirect(to.href, 301);
  }
  const path = "/markets" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await assets(ctx.env).fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveMarkets(res, path);
}
