// Chat's files, as a phone gets them, at either of its addresses:
// georgefarrowgreen.com/pigeon/ (where it has always been) and
// chat.inflite.ai/ (where it's moving), the same files at both.
//
// Pages are never cached. Each script and stylesheet a page loads, and each
// module app.js imports, gets ?v=<fingerprint of that file>, so a refresh
// always pulls whatever changed and nothing that didn't. Those fingerprinted
// files can then be cached for good. The page also carries the fingerprint of
// the whole app (inflight-version), which open copies poll to notice a new
// deploy and reload themselves.
//
// At chat.inflite.ai the app is the whole site: /x is the file
// /pigeon/x, and every "/pigeon/" the files say is "/" there (so its offline
// copy, Home Screen app and links cover the site; the API keeps its address).
//
// And at InFlite's hub (inflite.ai/chats/, Today First), the same files from
// chat.inflite.ai/_hub/, asked for by the hub's Worker with its key
// (functions/_middleware.js): every "/pigeon/" said as "/chats/" (base), and
// its pages framed by the hub's own pages alone (HUB_SECURITY), so Today and
// the apps can open Chat's sheet in place.

export const SECURITY = {
  "Permissions-Policy": "geolocation=(self), microphone=(self), camera=(self), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};
// (the hub's copy: the same, but its pages may be framed by the hub's own pages, which open Chat's sheet in a frame)
export const HUB_SECURITY = { ...SECURITY, "Content-Security-Policy": SECURITY["Content-Security-Policy"].replace("frame-ancestors 'none'", "frame-ancestors 'self'"), "X-Frame-Options": "SAMEORIGIN" };
const FOREVER = "public, max-age=31536000, immutable";
import { oldApp } from "./_sites.js";
import { assets } from "./_min.js";
export const CHAT_HOST = "chat.inflite.ai";
// (CHAT_HOST in the environment: tests, which run the new address on local names, a comma between them)
// (and its old address on georgefarrowgreen.com, whose pages go on to the new one, but whose API still answers what was
// set up there: a page left open, Strava's hook, the Health shortcut: functions/_middleware.js movedOn)
export const isChat = (url, env) => (env.CHAT_HOST || CHAT_HOST).split(",").includes(url.hostname) || oldApp(url.hostname, env) === "chat";
// the app's own paths, as they are at the new address ("/api/pigeon/…" is the API's, and stays); base: where the app is
// at that address ("/", or the hub's "/chats/")
export const atRoot = (text, base = "/") => text.replace(/(?<![\w.-])\/pigeon\//g, base);

// fingerprints, kept per isolate (a deploy starts fresh isolates, with the new files); and, for one request, those
// still being worked out, so each is worked out once (a page asks for all its files at once, and app.js and moon.js for
// some of the same ones. Not shared between requests: what one is doing is its own)
const memo = new Map(), working = new WeakMap();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
// a file as it's sent: a module with its imports stamped, and (at the new address) its paths at the root, or the base
async function asSent(ctx, path, body, chat, base = "/", chain = []) {
  if (path.endsWith(".js")) body = await stampImports(ctx, path, body, chat, base, chain);
  return chat && /\.(js|css|html|webmanifest)$|\/$/.test(path) ? atRoot(body, base) : body;
}
async function fingerprint(ctx, path, chat, base = "/", chain = []) {
  // worked out again each minute: just after a deploy the files can briefly be
  // last version's, and a fingerprint of those mustn't stick for as long as this copy runs
  // (each copy its own: as sent at the old address, the new one, and the hub's, which say their paths differently)
  const k = (chat ? "c:" : "") + (base === "/" ? "" : base) + path, hit = memo.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  let doing = working.get(ctx); if (!doing) working.set(ctx, (doing = new Map()));
  if (!doing.has(k)) doing.set(k, (async () => {
    const r = await assets(ctx.env).fetch(new URL(path, ctx.request.url));
    if (!r.ok) return "";
    const body = await asSent(ctx, path, await r.text(), chat, base, [...chain, path]);
    const v = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).slice(0, 12);
    memo.set(k, { v, at: Date.now() });
    return v;
  })());
  return doing.get(k);
}
// import … from "./x.js"  →  "./x.js?v=…" (and import("./x.js"), loaded only when it's needed)
const IMPORT_RE = /\b(from\s*|import\()"(\.\/[\w./-]+\.js)"/g;
// (Chats' module, InFlite's One roof stage 3, S3-D1: files under /pigeon/roof/ alone also have Chat's own files they
// share stamped, "../x.js", and their Worker's, new URL("./x.js", import.meta.url), so core.js is kept for good too.
// Every other file is stamped exactly as before)
const ROOF = /^\/pigeon\/roof\//;
const ROOF_IMPORT_RE = /\b(from\s*|import\()"(\.\.?\/[\w./-]+\.js)"/g;
const ROOF_URL_RE = /\b(new URL\(\s*)"(\.\.?\/[\w./-]+\.js)"(?=\s*,\s*import\.meta\.url\s*\))/g;
async function stampImports(ctx, path, js, chat, base = "/", chain = []) {
  const dir = path.slice(0, path.lastIndexOf("/") + 1), seen = new Map();
  if (ROOF.test(path)) return stampRoof(ctx, path, js, chat, base, chain);
  for (const [, , rel] of js.matchAll(IMPORT_RE)) if (!seen.has(rel)) seen.set(rel, await fingerprint(ctx, dir + rel.slice(2), chat, base));
  return js.replace(IMPORT_RE, (m, how, rel) => (seen.get(rel) ? `${how}"${rel}?v=${seen.get(rel)}"` : m));
}
// (a /roof/ file's: each address worked out as the browser will, from the file's own; only ever one of Chat's files;
// one that imports a file importing it back, however far round, left unstamped there rather than waited for forever)
async function stampRoof(ctx, path, js, chat, base, chain) {
  const seen = new Map(), at = (rel) => new URL(rel, "https://x" + path).pathname;
  for (const re of [ROOF_IMPORT_RE, ROOF_URL_RE]) for (const [, , rel] of js.matchAll(re)) {
    if (seen.has(rel)) continue;
    const to = at(rel);
    seen.set(rel, to.startsWith("/pigeon/") && to !== path && !chain.includes(to) ? await fingerprint(ctx, to, chat, base, [...chain, path]) : "");
  }
  const stamp = (m, how, rel) => (seen.get(rel) ? `${how}"${rel}?v=${seen.get(rel)}"` : m);
  return js.replace(ROOF_IMPORT_RE, stamp).replace(ROOF_URL_RE, stamp);
}

// The response for one of the app's files: `res` is the file as stored (at `path`, under /pigeon/). base: where the app
// is at this address, for the files as sent ("/", or the hub's "/chats/"); security: the headers its answers carry
export async function serveApp(ctx, res, path, chat, { base = "/", security = SECURITY } = {}) {
  const url = new URL(ctx.request.url);
  // (one that isn't anything: the site's own page for that is the site's, not Chat's)
  if (res.status === 404) return notFound();
  if (res.status !== 200 || !["GET", "HEAD"].includes(ctx.request.method)) return withSecurity(res, security);
  const type = res.headers.get("content-type") || "", head = ctx.request.method === "HEAD";

  if (type.includes("text/html")) {
    // only Chat's own pages: anything else here would be the site's home page, served as a fallback
    if (!APP_PAGES.test(path)) return notFound();
    let html = await res.text();
    const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/pigeon\/[\w./-]+\.(?:js|css))"/g)].map((m) => m[1]))];
    const vs = await Promise.all(refs.map((p) => fingerprint(ctx, p, chat, base)));
    refs.forEach((p, i) => { if (vs[i]) html = html.replaceAll(`"${p}"`, `"${p}?v=${vs[i]}"`); });
    const app = vs.some(Boolean) ? hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(vs.join(".")))).slice(0, 12) : "";
    if (app) html = html.replace("<head>", `<head>\n  <meta name="inflight-version" content="${app}" />`);
    if (chat) html = atRoot(html, base);
    const out = withSecurity(new Response(head ? null : html, res), security);
    out.headers.delete("content-length"); out.headers.delete("etag");
    // (the asset service's own preload hints name the files unstamped, and at the old address: each would be fetched again, uncached)
    out.headers.delete("Link");
    out.headers.set("Cache-Control", "no-store");
    return out;
  }

  if (/\.(js|css)$/.test(path)) {
    // the file as sent (a module with its imports stamped), and its own fingerprint
    const want = url.searchParams.get("v");
    const body = head ? null : await asSent(ctx, path, await res.text(), chat, base);
    const v = head ? await fingerprint(ctx, path, chat, base) : hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).slice(0, 12);    // (no body to check: go by the file's fingerprint)
    const out = new Response(body, res);
    out.headers.delete("content-length"); out.headers.delete("etag");
    // kept forever only when what's sent is exactly what was asked for: just after a
    // deploy the old file can be served under the new fingerprint, and a phone that
    // kept that would show last version's styles (or code) until the next change
    out.headers.set("Cache-Control", want && want === v ? FOREVER : "no-store");
    return withSecurity(out, security);
  }

  if (chat && /\.webmanifest$/.test(path)) {
    const out = new Response(head ? null : atRoot(await res.text(), base), res);
    out.headers.delete("content-length"); out.headers.delete("etag");
    return withSecurity(out, security);
  }
  return withSecurity(res, security);
}

// the pages Chat has (under /pigeon/, as stored)
const APP_PAGES = /^\/pigeon\/(index(\.html)?|tracker(\.html)?|handover(\.html)?)?$/;
export const notFound = () => withSecurity(new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }));

export function withSecurity(res, security = SECURITY) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(security)) out.headers.set(k, v);
  return out;
}
