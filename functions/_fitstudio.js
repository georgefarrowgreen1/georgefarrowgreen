// Precision Fit Studio: Pedal Revolution's bike-fit form, for the fitter's iPad. The app lives in fitting/ and is served
// at the root of its own address, fitting.georgefarrowgreen.com (functions/_middleware.js); on preview and local
// addresses at /fitting/ (functions/fitting/_middleware.js). Its files only use relative addresses, so they work the
// same at either.
//
// Its own sign-in, apart from the rest of the site's (no account, no shared cookie): the fit team, each with a name and
// a password, set in FITTING_USERS (Cloudflare, Variables and Secrets): "Kate:…,Matt:…", each password either as it is or
// as .tools/fitting-user.mjs writes it (PBKDF2). Signed in, a cookie for this address alone (__Host-fit, 30 days)
// holding the name and an end, signed with a key made from FITTING_USERS: so a changed password signs everyone out.
// Without FITTING_USERS no one can sign in. Every file but the sign-in page and what it shows (its styles, typefaces,
// logo and icons) is only for someone signed in.
//
// Every fit is kept in the browser that recorded it (IndexedDB). Connected to the shop's Google Drive (signed in there
// with the shop's Google account, in Google's own window), each fit is kept in that Drive too, sent straight from the
// device to Google: nothing of it passes through here. The app's Google client ID (not a secret) is pasted into the
// app's Fits list by a fitter (api/google, kept in KV), or set as FITTING_GOOGLE_CLIENT_ID on the Worker, which wins;
// api/me hands it to the app. Without one the app offers no Drive.

import { notFound } from "./_app.js";
export const FITTING_HOST = "fitting.georgefarrowgreen.com";
// (FITTING_HOST in the environment: tests, which run the app's own address on local names, a comma between them)
export const isFitting = (url, env) => (env.FITTING_HOST || FITTING_HOST).split(",").includes(url.hostname);

// (styles inline as well as its own: the form and the report place their gauges and photos with style attributes.
// Scripts only its own, and Google's sign-in, so nothing a rider's name or note holds can ever run. The shop's Google
// Drive: Google's sign-in window (a popup, so the page's opener rule lets popups talk back) and its Drive API.)
const GSI = "https://accounts.google.com/gsi/";
export const FIT_SECURITY = {
  "Content-Security-Policy": `default-src 'self'; script-src 'self' ${GSI}client https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' ${GSI}style; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://www.googleapis.com ${GSI} https://cloudflareinsights.com; frame-src ${GSI}; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`,
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
};
// the app's pages (as stored, under /fitting/): the app, and the sign-in
const PAGE = /^\/fitting\/(index\.html|login)?$/;
// what the sign-in page shows, open to anyone
const OPEN = /^\/(login|styles\.css|logo\.png|login\.js|manifest\.webmanifest|icon-\d+\.png|fonts\/[\w-]+\.woff2)$/;

// The response for one of the app's files: `res` is the file as stored, at `path` (under /fitting/)
export function serveFitting(res, path) {
  const type = res.headers.get("content-type") || "";
  // anything else that comes back as a page is the site's home page, served as a fallback
  if (res.status === 200 && type.includes("text/html") && !PAGE.test(path)) return notFound();
  if (res.status === 404) return notFound();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(FIT_SECURITY)) out.headers.set(k, v);
  // (the pages, their code and the worker asked after each time, by their ETag: so each opening is the latest; the
  // typefaces and libraries never change at an address, so kept a month; nothing behind the sign-in kept on the way)
  const open = OPEN.test(path.slice(8) || "/");
  if ((res.status === 200 || res.status === 304) && (/\.(html|js|css|webmanifest)$|\/$|\/login$/.test(path)) && !path.includes("/vendor/")) out.headers.set("Cache-Control", open ? "no-cache" : "private, no-cache");
  if (res.status === 200 && (/\/(fonts|vendor)\//.test(path) || /\.png$/.test(path))) out.headers.set("Cache-Control", `${open ? "public" : "private"}, max-age=2592000`);
  return out;
}

// fitting.georgefarrowgreen.com: /x is the file /fitting/x, behind the sign-in
export async function fittingHost(ctx, url) {
  if (url.pathname === "/fitting" || url.pathname.startsWith("/fitting/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(8) || "/";
    return Response.redirect(to.href, 301);
  }
  return fitting(ctx, url, "");
}

// The app at `base` ("" at its own address, "/fitting" on a preview's): its API, the sign-in, then its files
export async function fitting(ctx, url, base) {
  const sub = url.pathname.slice(base.length) || "/";
  if (sub.startsWith("/api/")) return api(ctx, url, sub.slice(5));
  const me = await signedIn(ctx.request, ctx.env);
  if (!me && !OPEN.test(sub)) {
    // (a page asked for: the sign-in; anything else: not without signing in)
    if (sub === "/" || sub === "/index.html") return redirect(`${url.origin}${base}/login`);
    return plain(401, "Sign in first.");
  }
  if (me && sub === "/login") return redirect(`${url.origin}${base}/`);
  const path = "/fitting" + (sub === "/index.html" ? "/" : sub);
  // (a page asked for whole every time, never "is mine still the same?", so it's always stamped: below)
  const res = await ctx.env.ASSETS.fetch(PAGE.test(path) ? new Request(new URL(path, url)) : new Request(new URL(path + url.search, url), ctx.request));
  return serveFitting(PAGE.test(path) && res.status === 200 ? await stamped(ctx, url, res) : res, path);
}

// A page with its styles and scripts asked for by what they hold (styles.css?v=…): a browser that kept an older copy
// of one can't use it with a newer page, the way a desktop's did with the sign-in page's styles
async function stamped(ctx, url, res) {
  let html = await res.text();
  for (const f of new Set([...html.matchAll(/(?:href|src)="(styles\.css|app\.js|login\.js)"/g)].map((m) => m[1]))) {
    const r = await ctx.env.ASSETS.fetch(new Request(new URL("/fitting/" + f, url)));
    if (!r.ok) continue;
    const v = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await r.arrayBuffer()))].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
    html = html.split(`"${f}"`).join(`"${f}?v=${v}"`);
  }
  const out = new Response(html, res);
  out.headers.delete("content-length"); out.headers.delete("etag");
  return out;
}

// ---- the API: api/login, api/logout, api/me, api/google ----
const COOKIE = "__Host-fit", DAYS = 30, TRIES = 8, TRIES_FOR = 900;
// the shop's Google client ID: the Worker's own setting, else the one a fitter pasted in
const GKEY = "fitting:google-client", GID = /^\d{6,}-[a-z0-9]{8,}\.apps\.googleusercontent\.com$/;
async function googleClient(env) {
  const fixed = String(env.FITTING_GOOGLE_CLIENT_ID || "").trim();
  if (fixed) return { google: fixed, googleFixed: true };
  let kept = ""; try { kept = (env.BIO_KV && await env.BIO_KV.get(GKEY)) || ""; } catch (_) {}
  return { google: kept, googleFixed: false };
}
async function api(ctx, url, what) {
  const req = ctx.request, env = ctx.env;
  if (what === "me") {
    if (req.method !== "GET") return plain(405, "GET only.");
    const me = await signedIn(req, env);
    return me ? json(200, { name: me, ...await googleClient(env) }) : json(401, { error: "Not signed in." });
  }
  if (what === "google") {
    if (req.method !== "PUT") return plain(405, "PUT only.");
    if (req.headers.get("Origin") !== url.origin) return json(403, { error: "Only from the Fit Studio’s own pages." });
    if (!await signedIn(req, env)) return json(401, { error: "Sign in first." });
    if (String(env.FITTING_GOOGLE_CLIENT_ID || "").trim()) return json(409, { error: "The Client ID is set on the server, so it’s changed there." });
    let id = ""; try { id = String((await req.json()).id || "").trim(); } catch (_) {}
    if (id && !GID.test(id)) return json(400, { error: "That doesn’t look like a Google Client ID: it ends .apps.googleusercontent.com." });
    if (!env.BIO_KV) return json(503, { error: "The site can’t keep it just now." });
    if (id) await env.BIO_KV.put(GKEY, id); else await env.BIO_KV.delete(GKEY);
    return json(200, { google: id });
  }
  if (what !== "login" && what !== "logout") return notFound();
  if (req.method !== "POST") return plain(405, "POST only.");
  // (only from its own pages: a POST from anywhere else is turned away)
  const origin = req.headers.get("Origin");
  if (origin !== url.origin) return json(403, { error: "Sign in from the Fit Studio’s own page." });
  if (what === "logout") return json(200, { ok: true }, { "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict` });
  const users = parseUsers(env.FITTING_USERS);
  if (!users.length) return json(503, { error: "Sign-in isn’t set up yet: FITTING_USERS needs adding in Cloudflare." });
  // (no more than TRIES wrong passwords from one address in TRIES_FOR seconds)
  const ip = req.headers.get("CF-Connecting-IP") || "local", kv = env.BIO_KV, key = `fitlogin:${ip}`;
  const tries = kv ? Number(await kv.get(key).catch(() => 0)) || 0 : 0;
  if (tries >= TRIES) return json(429, { error: "Too many wrong passwords. Try again in 15 minutes." });
  let body = {};
  try { body = await req.json(); } catch (_) { return json(400, { error: "Send a name and a password." }); }
  const name = String(body.name || "").trim(), password = String(body.password || "");
  if (!name || !password || name.length > 64 || password.length > 256) return json(400, { error: "Enter your name and password." });
  const user = users.find((u) => u.name.toLowerCase() === name.toLowerCase());
  // (a name that isn't there checked against a stand-in all the same, so a wrong name takes as long as a wrong password)
  const ok = await checkPassword(user ? user.secret : "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password) && !!user;
  if (!ok) {
    if (kv) await kv.put(key, String(tries + 1), { expirationTtl: TRIES_FOR }).catch(() => {});
    return json(401, { error: "That name and password don’t match." });
  }
  const token = await sign(user.name, Date.now() + DAYS * 864e5, env);
  return json(200, { name: user.name }, { "Set-Cookie": `${COOKIE}=${token}; Path=/; Max-Age=${DAYS * 86400}; Secure; HttpOnly; SameSite=Strict` });
}

// "Kate:secret,Matt:secret" → [{name, secret}] (a comma or a new line between them; a name never has a colon)
export function parseUsers(s) {
  return String(s || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf(":"); return i > 0 ? { name: x.slice(0, i).trim(), secret: x.slice(i + 1).trim() } : null;
  }).filter((u) => u && u.name && u.secret);
}
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0;
}
// A password against what FITTING_USERS holds for it: "pbkdf2$iterations$salt$hash" (base64), or the password itself
export async function hashPassword(password, salt, iterations = 100000) {
  const k = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, k, 256));
}
async function checkPassword(secret, password) {
  const m = /^pbkdf2\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(secret);
  if (m) {
    const n = Math.min(Number(m[1]), 100000);   // (Cloudflare's runtime allows no more)
    try { return sameBytes(await hashPassword(password, unb64(m[2]), n), unb64(m[3])); } catch (_) { return false; }
  }
  const [a, b] = await Promise.all([password, secret].map(async (x) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(x)))));
  return sameBytes(a, b);
}
// The cookie: name.end.signature, the key HMAC-SHA256 from FITTING_USERS itself
async function hmacKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("fit-session|" + String(env.FITTING_USERS || "")));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(name, until, env) {
  const body = `${b64url(enc.encode(name))}.${until}`;
  return `${body}.${b64url(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body)))}`;
}
// who's signed in (their name), or null
export async function signedIn(request, env) {
  if (!parseUsers(env.FITTING_USERS).length) return null;
  const c = (request.headers.get("Cookie") || "").split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  const m = c && /^([A-Za-z0-9_-]+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(c.slice(COOKIE.length + 1));
  if (!m || Number(m[2]) < Date.now()) return null;
  try {
    const sig = Uint8Array.from(atob(m[3].replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
    if (!await crypto.subtle.verify("HMAC", await hmacKey(env), sig, enc.encode(`${m[1]}.${m[2]}`))) return null;
    const name = new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)));
    // (one whose name has since gone from FITTING_USERS is signed out)
    return parseUsers(env.FITTING_USERS).some((u) => u.name === name) ? name : null;
  } catch (_) { return null; }
}

const secure = (h = {}) => ({ ...FIT_SECURITY, "Cache-Control": "no-store", ...h });
const json = (status, body, h) => new Response(JSON.stringify(body), { status, headers: secure({ "Content-Type": "application/json; charset=utf-8", ...h }) });
const plain = (status, text) => new Response(text, { status, headers: secure({ "Content-Type": "text/plain; charset=utf-8" }) });
const redirect = (to) => new Response(null, { status: 302, headers: secure({ Location: to }) });
