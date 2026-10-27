// The account's own page, at account.inflite.ai: your georgefarrowgreen.com account, the one every app on the
// site signs in with (functions/_account.js), in one place: your profile, your apps, your password, passkeys and
// signed-in devices, and deleting the account. Its files are in account/, served at the address's root; its API is
// /api/account/ (functions/api/account/[[path]].js), answered only here. A few files it shares with the rest of the
// site: the password stretching (pigeon/crypto.js and argon2.js, so a password's stretched the same way everywhere) and
// the apps' icons.

import { notFound } from "./_app.js";

import { oldApp } from "./_sites.js";
export const ACCOUNT_HOST = "account.inflite.ai";
// (ACCOUNT_HOST in the environment: tests, which run the address on local names, a comma between them)
// (and its old address on georgefarrowgreen.com, whose pages go on to the new one, but whose API still answers what was
// set up there: a page left open, Strava's hook, the Health shortcut: functions/_middleware.js movedOn)
export const isAccount = (url, env) => (env.ACCOUNT_HOST || ACCOUNT_HOST).split(",").includes(url.hostname) || oldApp(url.hostname, env) === "account";

export const ACCT_SECURITY = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};
// what it shares with the rest of the site: its address here → where it's kept
const SHARED = { "/crypto.js": "/pigeon/crypto.js", "/argon2.js": "/pigeon/argon2.js", "/argon2w.js": "/pigeon/argon2w.js", "/qr.js": "/pigeon/qr.js", "/formats.js": "/fitness/formats.js", "/fit.js": "/fitness/fit.js", "/workouts.js": "/fitness/workouts.js", "/apps/inflight.png": "/pigeon/icon-180.png", "/apps/weather.png": "/weather/icon-180.png", "/apps/fitness.png": "/fitness/icon-180.png" };
const PAGE = /^\/account\/(index\.html)?$/;
// The page's script and styles, and every module the script brings in, stamped with what's in them as sent (?v=: a
// module's own imports stamped in turn), as InFlight's are (functions/_app.js): so the page always runs the files it
// was made with, whatever a browser kept from before, and the stamped files are kept for good. (The page itself is
// never kept, and opened afresh if the browser brings back one it kept: account/app.js; a script asked for unstamped
// isn't kept at all.)
const FOREVER = "public, max-age=31536000, immutable";
const IMPORT_RE = /\b(from\s+|import\()"\.\/([\w.-]+\.js)"/g;
const where = (name) => SHARED["/" + name] || "/account/" + name;
const stampOf = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
// (worked out again each minute: just after a deploy the files can briefly be last version's. Kept from when it's begun,
// so the files are read side by side, not one by one, and one that two others bring in is read once, with one stamp;
// one that couldn't be read is tried again next time)
const memo = new Map();
function fingerprint(ctx, url, name) {
  const hit = memo.get(name);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const e = { at: Date.now(), p: (async () => {
    const r = await ctx.env.ASSETS.fetch(new Request(new URL(where(name), url)));
    if (!r.ok) return "";
    return stampOf(await asSent(ctx, url, name, await r.text()));
  })() };
  memo.set(name, e);
  const done = (v) => { if (memo.get(name) === e) { if (v) e.at = Date.now(); else memo.delete(name); } };
  e.p.then(done, () => done(""));
  return e.p;
}
// a file as sent: a module with its imports stamped (each by its address here: crypto.js's argon2.js is this page's)
async function asSent(ctx, url, name, text) {
  if (!name.endsWith(".js")) return text;
  const deps = [...new Set([...text.matchAll(IMPORT_RE)].map((m) => m[2]))], vs = await Promise.all(deps.map((d) => fingerprint(ctx, url, d)));
  const seen = new Map(deps.map((d, i) => [d, vs[i]]));
  return text.replace(IMPORT_RE, (m, how, dep) => (seen.get(dep) ? `${how}"./${dep}?v=${seen.get(dep)}"` : m));
}
async function stamped(ctx, url, html) {
  const refs = [...new Set([...html.matchAll(/(?:src|href)="([\w.-]+\.(?:js|css))"/g)].map((m) => m[1]))];
  const vs = await Promise.all(refs.map((f) => fingerprint(ctx, url, f)));
  refs.forEach((f, i) => { if (vs[i]) html = html.replaceAll(`"${f}"`, `"${f}?v=${vs[i]}"`); });
  return html;
}

export async function accountHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/account/") ? ctx.next() : notFound();
  // an address from the site's own copy, on the new host: the same place, at the root
  if (url.pathname === "/account" || url.pathname.startsWith("/account/")) { const to = new URL(url); to.pathname = url.pathname.slice(8) || "/"; return Response.redirect(to.href, 301); }
  const path = SHARED[url.pathname] || "/account" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path, url), ctx.request));
  const type = res.headers.get("content-type") || "";
  // (anything else that comes back as a page is the site's home page, served as a fallback)
  if (res.status === 200 && type.includes("text/html") && !PAGE.test(path)) return notFound();
  // (and one that isn't anything: the site's own page for that is the site's, not the account's)
  if (res.status === 404) return notFound();
  const head = ctx.request.method === "HEAD", name = url.pathname.slice(1);
  const page = res.status === 200 && PAGE.test(path), script = res.status === 200 && /^[\w.-]+\.(js|css)$/.test(name);
  const body = head ? null : page ? await stamped(ctx, url, await res.text()) : script ? await asSent(ctx, url, name, await res.text()) : res.body;
  const out = new Response(body, res);
  for (const [k, v] of Object.entries(ACCT_SECURITY)) out.headers.set(k, v);
  if (page || script) { out.headers.delete("content-length"); out.headers.delete("etag"); }
  // (Pages' own preload hints name the files unstamped: each would be fetched again, and could be a copy kept from before)
  if (page) out.headers.delete("Link");
  // (a stamped file kept only when it's what was asked for: just after a deploy the old one can come under the new stamp)
  const want = script && url.searchParams.get("v"), v = want && (head ? await fingerprint(ctx, url, name) : await stampOf(body));
  if (res.status === 200) out.headers.set("Cache-Control", page ? "no-store" : script ? (want && want === v ? FOREVER : "no-store")
    : /\.(png|svg)$/.test(path) ? "public, max-age=86400" : "private, no-cache");
  return out;
}
