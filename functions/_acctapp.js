// The account's own page, at account.georgefarrowgreen.com: your georgefarrowgreen.com account, the one every app on the
// site signs in with (functions/_account.js), in one place: your profile, your apps, your password, passkeys and
// signed-in devices, and deleting the account. Its files are in account/, served at the address's root; its API is
// /api/account/ (functions/api/account/[[path]].js), answered only here. A few files it shares with the rest of the
// site: the password stretching (pigeon/crypto.js and argon2.js, so a password's stretched the same way everywhere) and
// the apps' icons.

import { notFound } from "./_app.js";

export const ACCOUNT_HOST = "account.georgefarrowgreen.com";
// (ACCOUNT_HOST in the environment: tests, which run the address on local names, a comma between them)
export const isAccount = (url, env) => (env.ACCOUNT_HOST || ACCOUNT_HOST).split(",").includes(url.hostname);

export const ACCT_SECURITY = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
// what it shares with the rest of the site: its address here → where it's kept
const SHARED = { "/crypto.js": "/pigeon/crypto.js", "/argon2.js": "/pigeon/argon2.js", "/qr.js": "/pigeon/qr.js", "/apps/inflight.png": "/pigeon/icon-180.png", "/apps/weather.png": "/weather/icon-180.png" };
const PAGE = /^\/account\/(index\.html)?$/;

export async function accountHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/account/") ? ctx.next() : notFound();
  // an address from the site's own copy, on the new host: the same place, at the root
  if (url.pathname === "/account" || url.pathname.startsWith("/account/")) { const to = new URL(url); to.pathname = url.pathname.slice(8) || "/"; return Response.redirect(to.href, 301); }
  const path = SHARED[url.pathname] || "/account" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path, url), ctx.request));
  const type = res.headers.get("content-type") || "";
  // (anything else that comes back as a page is the site's home page, served as a fallback)
  if (res.status === 200 && type.includes("text/html") && !PAGE.test(path)) return notFound();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(ACCT_SECURITY)) out.headers.set(k, v);
  if (res.status === 200) out.headers.set("Cache-Control", /\.(png|svg)$/.test(path) ? "public, max-age=86400" : "private, no-cache");
  return out;
}
