// Publishes exactly one page out of blokk/: the browser demo.
//
// wrangler.toml sets pages_build_output_dir = ".", so the whole repo root
// ships as static assets. blokk/ is source, and stays unreadable — only the
// demo is surfaced, at /blokk. Everything else under /blokk/* still 404s,
// including the demo's own asset path, so there is one public URL for it.
//
// The demo is the right surface to publish: blokk/demo/index.html inlines the
// engine and talks to nothing, whereas blokk/web/index.html drives eight
// /api/v1/* endpoints on the Mac and would render a dead shell here.
// It has no relative src/href of its own, so serving it from /blokk rather
// than its own directory breaks no links.

const DEMO = "/blokk/demo/";   // pretty path — ASSETS wants the directory,
                               // not /blokk/demo/index.html

export function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    },
  });
}

export async function serveDemo({ request, env }) {
  const asset = await env.ASSETS.fetch(new URL(DEMO, request.url));
  // A missing asset must not surface as a 200 with an error page in it.
  if (!asset.ok) return notFound();
  const headers = new Headers(asset.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-cache");   // matches index.html/app.js
  return new Response(asset.body, { status: 200, headers });
}

// /block was asked for by name; /blokk is the product's spelling and the
// directory here, so it is canonical and the other redirects to it.
export function toCanonical({ request }) {
  const { search } = new URL(request.url);
  return Response.redirect(new URL("/blokk" + search, request.url).toString(), 301);
}
