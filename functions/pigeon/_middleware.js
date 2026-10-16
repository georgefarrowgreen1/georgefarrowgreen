// InFlight (/pigeon): every page load gets the newest app.
//
// Pages are never cached. Each script and stylesheet a page loads, and each
// module app.js imports, gets ?v=<fingerprint of that file>, so a refresh
// always pulls whatever changed and nothing that didn't. Those fingerprinted
// files can then be cached for good. The page also carries the fingerprint of
// the whole app (inflight-version), which open copies poll to notice a new
// deploy and reload themselves.

const SECURITY = {
  "Permissions-Policy": "geolocation=(self), microphone=(self), camera=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000",
};
const FOREVER = "public, max-age=31536000, immutable";

// fingerprints, kept per isolate (a deploy starts fresh isolates, with the new files)
const memo = new Map();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function fingerprint(ctx, path) {
  // worked out again each minute: just after a deploy the files can briefly be
  // last version's, and a fingerprint of those mustn't stick for as long as this copy runs
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const r = await ctx.env.ASSETS.fetch(new URL(path, ctx.request.url));
  if (!r.ok) return "";
  let body = await r.text();
  if (path.endsWith(".js")) body = await stampImports(ctx, path, body);   // a module changes when its imports do
  const v = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).slice(0, 12);
  memo.set(path, { v, at: Date.now() });
  return v;
}
// import … from "./x.js"  →  "./x.js?v=…" (and import("./x.js"), loaded only when it's needed)
const IMPORT_RE = /\b(from\s+|import\()"(\.\/[\w./-]+\.js)"/g;
async function stampImports(ctx, path, js) {
  const dir = path.slice(0, path.lastIndexOf("/") + 1), seen = new Map();
  for (const [, , rel] of js.matchAll(IMPORT_RE)) if (!seen.has(rel)) seen.set(rel, await fingerprint(ctx, dir + rel.slice(2)));
  return js.replace(IMPORT_RE, (m, how, rel) => (seen.get(rel) ? `${how}"${rel}?v=${seen.get(rel)}"` : m));
}

// InFlight lives at one address. Cloudflare's preview addresses (*.pages.dev),
// and chat.georgefarrowgreen.com if it's ever pointed at this project, would
// be a second origin, with its own sign-ins and keys: send them home.
const HOME = "https://georgefarrowgreen.com";
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.hostname.endsWith(".pages.dev") || url.hostname === "chat.georgefarrowgreen.com") return Response.redirect(HOME + url.pathname + url.search, 301);
  const res = await ctx.next();
  if (res.status !== 200 || !["GET", "HEAD"].includes(ctx.request.method)) return withSecurity(res);
  const type = res.headers.get("content-type") || "";

  if (type.includes("text/html")) {
    let html = await res.text();
    const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/pigeon\/[\w./-]+\.(?:js|css))"/g)].map((m) => m[1]))];
    const vs = await Promise.all(refs.map((p) => fingerprint(ctx, p)));
    refs.forEach((p, i) => { if (vs[i]) html = html.replaceAll(`"${p}"`, `"${p}?v=${vs[i]}"`); });
    const app = vs.some(Boolean) ? hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(vs.join(".")))).slice(0, 12) : "";
    if (app) html = html.replace("<head>", `<head>\n  <meta name="inflight-version" content="${app}" />`);
    const out = new Response(ctx.request.method === "HEAD" ? null : html, res);
    out.headers.delete("content-length"); out.headers.delete("etag");
    out.headers.set("Cache-Control", "no-store");
    return withSecurity(out);
  }

  if (/\.(js|css)$/.test(url.pathname)) {
    // the file as sent (a module with its imports stamped), and its own fingerprint
    const want = url.searchParams.get("v");
    let body = await res.text();
    if (url.pathname.endsWith(".js")) body = await stampImports(ctx, url.pathname, body);
    const head = ctx.request.method === "HEAD";                      // (no body to check: go by the file's fingerprint)
    const v = head ? await fingerprint(ctx, url.pathname) : hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).slice(0, 12);
    const out = new Response(head ? null : body, res);
    out.headers.delete("content-length"); out.headers.delete("etag");
    // kept forever only when what's sent is exactly what was asked for: just after a
    // deploy the old file can be served under the new fingerprint, and a phone that
    // kept that would show last version's styles (or code) until the next change
    out.headers.set("Cache-Control", want && want === v ? FOREVER : "no-store");
    return withSecurity(out);
  }
  return withSecurity(res);
}

function withSecurity(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
}
