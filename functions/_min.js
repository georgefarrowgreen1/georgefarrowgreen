// The apps' scripts and styles, sent minified: their comments and spacing taken out (nothing renamed), by
// node .tools/minify.mjs, into min/ beside them (min/pigeon/app.js for pigeon/app.js, and so on), with each one's
// original's fingerprint (min/manifest.json). A minified copy is sent only while it's still of the file as it is: one
// that's changed since (the script not run again) is sent as it is, never an old copy in a new page.
// Every app's files are read through this (assets(env).fetch, in place of env.ASSETS.fetch).
export const MINIFIED = /^\/(?:(?:pigeon|weather|fitness|account)\/(?!vendor\/)(?:[\w.-]+\/)*[\w.-]+|app|styles)\.(?:js|css)$/;
const SKIP = /\/sw\.js$/;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
// (per copy of the server, and its store of files: a deploy starts fresh ones, with the new files)
const known = new WeakMap();
const of = (env) => { let k = known.get(env.ASSETS); if (!k) known.set(env.ASSETS, (k = { manifest: null, fresh: new Map() })); return k; };
function listOf(env, url) {
  const k = of(env);
  return (k.manifest ||= env.ASSETS.fetch(new Request(new URL("/min/manifest.json", url)))
    .then((r) => (r.ok ? r.json() : {}), () => ({}))
    .then((m) => { if (!Object.keys(m).length) k.manifest = null; return m; }));
}
// (is the minified copy still of the file as it is? Worked out once per copy of the server, for each file)
function current(env, url, path) {
  const fresh = of(env).fresh;
  let p = fresh.get(path);
  if (!p) {
    p = (async () => {
      const want = (await listOf(env, url))[path.slice(1)];
      if (!want) return false;
      const r = await env.ASSETS.fetch(new Request(new URL(path, url)));
      return r.ok && hex(await crypto.subtle.digest("SHA-256", await r.arrayBuffer())) === want;
    })().catch(() => false);
    fresh.set(path, p);
    p.then((ok) => { if (!ok) fresh.delete(path); });
  }
  return p;
}

export function assets(env) {
  return {
    async fetch(input, init) {
      const req = input instanceof Request && !init ? input : new Request(input, init);
      const url = new URL(req.url);
      if ((req.method === "GET" || req.method === "HEAD") && MINIFIED.test(url.pathname) && !SKIP.test(url.pathname) && (await current(env, url, url.pathname))) {
        const min = new URL(url); min.pathname = "/min" + url.pathname;
        const r = await env.ASSETS.fetch(new Request(min, req));
        if (r.status === 200 || r.status === 304) return r;
      }
      return env.ASSETS.fetch(req);
    },
  };
}
