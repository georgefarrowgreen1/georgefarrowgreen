// InFlight's files, as a phone gets them, at either of its addresses:
// georgefarrowgreen.com/pigeon/ (where it has always been) and
// chat.georgefarrowgreen.com/ (where it's moving), the same files at both.
//
// Pages are never cached. Each script and stylesheet a page loads, and each
// module app.js imports, gets ?v=<fingerprint of that file>, so a refresh
// always pulls whatever changed and nothing that didn't. Those fingerprinted
// files can then be cached for good. The page also carries the fingerprint of
// the whole app (inflight-version), which open copies poll to notice a new
// deploy and reload themselves.
//
// At chat.georgefarrowgreen.com the app is the whole site: /x is the file
// /pigeon/x, and every "/pigeon/" the files say is "/" there (so its offline
// copy, Home Screen app and links cover the site; the API keeps its address).

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
const FOREVER = "public, max-age=31536000, immutable";
export const CHAT_HOST = "chat.georgefarrowgreen.com";
// (CHAT_HOST in the environment: tests, which run the new address on local names, a comma between them)
export const isChat = (url, env) => (env.CHAT_HOST || CHAT_HOST).split(",").includes(url.hostname);
// the app's own paths, as they are at the new address ("/api/pigeon/…" is the API's, and stays)
const atRoot = (text) => text.replace(/(?<![\w.-])\/pigeon\//g, "/");

// fingerprints, kept per isolate (a deploy starts fresh isolates, with the new files)
const memo = new Map();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
// a file as it's sent: a module with its imports stamped, and (at the new address) its paths at the root
async function asSent(ctx, path, body, chat) {
  if (path.endsWith(".js")) body = await stampImports(ctx, path, body, chat);
  return chat && /\.(js|css|html|webmanifest)$|\/$/.test(path) ? atRoot(body) : body;
}
async function fingerprint(ctx, path, chat) {
  // worked out again each minute: just after a deploy the files can briefly be
  // last version's, and a fingerprint of those mustn't stick for as long as this copy runs
  const k = (chat ? "c:" : "") + path, hit = memo.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const r = await ctx.env.ASSETS.fetch(new URL(path, ctx.request.url));
  if (!r.ok) return "";
  const body = await asSent(ctx, path, await r.text(), chat);
  const v = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).slice(0, 12);
  memo.set(k, { v, at: Date.now() });
  return v;
}
// import … from "./x.js"  →  "./x.js?v=…" (and import("./x.js"), loaded only when it's needed)
const IMPORT_RE = /\b(from\s+|import\()"(\.\/[\w./-]+\.js)"/g;
async function stampImports(ctx, path, js, chat) {
  const dir = path.slice(0, path.lastIndexOf("/") + 1), seen = new Map();
  for (const [, , rel] of js.matchAll(IMPORT_RE)) if (!seen.has(rel)) seen.set(rel, await fingerprint(ctx, dir + rel.slice(2), chat));
  return js.replace(IMPORT_RE, (m, how, rel) => (seen.get(rel) ? `${how}"${rel}?v=${seen.get(rel)}"` : m));
}

// The response for one of the app's files: `res` is the file as stored (at `path`, under /pigeon/)
export async function serveApp(ctx, res, path, chat) {
  const url = new URL(ctx.request.url);
  // (one that isn't anything: the site's own page for that is the site's, not InFlight's)
  if (res.status === 404) return notFound();
  if (res.status !== 200 || !["GET", "HEAD"].includes(ctx.request.method)) return withSecurity(res);
  const type = res.headers.get("content-type") || "", head = ctx.request.method === "HEAD";

  if (type.includes("text/html")) {
    // only InFlight's own pages: anything else here would be the site's home page, served as a fallback
    if (!APP_PAGES.test(path)) return notFound();
    let html = await res.text();
    const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/pigeon\/[\w./-]+\.(?:js|css))"/g)].map((m) => m[1]))];
    const vs = await Promise.all(refs.map((p) => fingerprint(ctx, p, chat)));
    refs.forEach((p, i) => { if (vs[i]) html = html.replaceAll(`"${p}"`, `"${p}?v=${vs[i]}"`); });
    const app = vs.some(Boolean) ? hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(vs.join(".")))).slice(0, 12) : "";
    if (app) html = html.replace("<head>", `<head>\n  <meta name="inflight-version" content="${app}" />`);
    if (chat) html = atRoot(html);
    const out = withSecurity(new Response(head ? null : html, res));
    out.headers.delete("content-length"); out.headers.delete("etag");
    // (Pages' own preload hints name the files unstamped, and at the old address: each would be fetched again, uncached)
    out.headers.delete("Link");
    out.headers.set("Cache-Control", "no-store");
    // the new address may open the old one's handover page, hidden (pigeon/handover.js)
    if (chat) out.headers.set("Content-Security-Policy", `${SECURITY["Content-Security-Policy"]}; frame-src ${url.protocol}//${url.host.replace(/^chat\./, "")}`);
    return out;
  }

  if (/\.(js|css)$/.test(path)) {
    // the file as sent (a module with its imports stamped), and its own fingerprint
    const want = url.searchParams.get("v");
    const body = head ? null : await asSent(ctx, path, await res.text(), chat);
    const v = head ? await fingerprint(ctx, path, chat) : hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).slice(0, 12);    // (no body to check: go by the file's fingerprint)
    const out = new Response(body, res);
    out.headers.delete("content-length"); out.headers.delete("etag");
    // kept forever only when what's sent is exactly what was asked for: just after a
    // deploy the old file can be served under the new fingerprint, and a phone that
    // kept that would show last version's styles (or code) until the next change
    out.headers.set("Cache-Control", want && want === v ? FOREVER : "no-store");
    return withSecurity(out);
  }

  if (chat && /\.webmanifest$/.test(path)) {
    const out = new Response(head ? null : atRoot(await res.text()), res);
    out.headers.delete("content-length"); out.headers.delete("etag");
    return withSecurity(out);
  }
  return withSecurity(res);
}

// the pages InFlight has (under /pigeon/, as stored)
const APP_PAGES = /^\/pigeon\/(index(\.html)?|tracker(\.html)?|handover(\.html)?)?$/;
export const notFound = () => withSecurity(new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }));

export function withSecurity(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
}
