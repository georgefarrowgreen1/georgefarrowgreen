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

// fingerprints, kept briefly per isolate (a deploy starts fresh isolates anyway)
const memo = new Map();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function fingerprint(ctx, path) {
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
// import … from "./x.js"  →  "./x.js?v=…"
async function stampImports(ctx, path, js) {
  const dir = path.slice(0, path.lastIndexOf("/") + 1), seen = new Map();
  for (const [, rel] of js.matchAll(/\bfrom\s+"(\.\/[\w./-]+\.js)"/g)) if (!seen.has(rel)) seen.set(rel, await fingerprint(ctx, dir + rel.slice(2)));
  return js.replace(/\bfrom\s+"(\.\/[\w./-]+\.js)"/g, (m, rel) => (seen.get(rel) ? `from "${rel}?v=${seen.get(rel)}"` : m));
}

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
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
    const want = url.searchParams.get("v"), v = await fingerprint(ctx, url.pathname);
    const fresh = want && want === v;
    let out;
    if (url.pathname.endsWith(".js")) {
      const js = await stampImports(ctx, url.pathname, await res.text());
      out = new Response(ctx.request.method === "HEAD" ? null : js, res);
      out.headers.delete("content-length"); out.headers.delete("etag");
    } else out = new Response(res.body, res);
    // only a file asked for by its current fingerprint is safe to keep forever
    out.headers.set("Cache-Control", fresh ? FOREVER : "no-cache");
    return withSecurity(out);
  }
  return withSecurity(res);
}

function withSecurity(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
}
