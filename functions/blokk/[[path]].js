// Keeps blokk/ out of the published site.
//
// wrangler.toml sets pages_build_output_dir = ".", so every file in the repo
// root ships as a static asset — blokk/ is source stored alongside the site,
// not part of it, and without this it would be readable at /blokk/*.
//
// This is a Function rather than a _redirects rule because _redirects only
// supports 301/302/303/307/308; a 404 line there is silently ignored, which
// would look like a guard while being none. Functions are matched before
// static assets ("if no Function is matched, it will fall back to a static
// asset"), so this wins over the files underneath it.
//
// onRequest catches every method. The catch-all covers /blokk/ and everything
// below it; /blokk itself has no index.html, so it 404s on its own.
export async function onRequest() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",          // belt and braces if a link leaks
      "Cache-Control": "no-store",        // never cache a guard
    },
  });
}
