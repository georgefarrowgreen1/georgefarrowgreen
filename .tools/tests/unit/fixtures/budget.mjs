// What a module costs on its first open (stages 2–4, s2/spec.md §4.6; roof/s24-contracts.md §13), measured without a
// browser: the entry's static import graph (every static `import … from "…"` and `export … from "…"`, followed from the
// entry; never a dynamic import()), plus REGISTRY's CSS for the app; each file minified in memory with minify.mjs's own
// esbuild options (what functions/_min.js serves), then gzipped at level 9; JS and CSS summed apart.
//   staticGraph(app) → absolute published paths of the static graph, the entry first ("/markets/roof/markets.js", …)
//   staticGz(app) → { js, css, files, each: { [path]: bytes } }: js and css in KiB (1024), files the published paths
//   NET (the network-only files of s24 §8, never kept or preloaded), for roofcontract
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { MAIN, ROOF, fileOf } from './roof.mjs';

const { transformSync } = createRequire(new URL('.tools/tests/package.json', MAIN))('esbuild');
// (minify.mjs's options, exactly)
export const minified = (src, css = false) => transformSync(String(src), { loader: css ? 'css' : 'js', minifyWhitespace: true, minifySyntax: true, legalComments: 'none', charset: 'utf8' }).code;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
export const NET = Object.freeze({
  weather: [/^\/weather\/(radar|radarmix|mapstyle|mapgl|mapleaf|rainmap|radarrain)\.js$/, /^\/weather\/vendor\//],
  fitness: [/^\/fitness\/(map|mapstyle|share|formats|fit|reader)\.js$/, /^\/weather\/vendor\//],
  markets: [], mail: [],
  // (stage 3, spec §5.3: Chats' flight sheets and their geodata, the QR scan and its decoder: "Needs a connection")
  // (and crypto.js's own Argon2, which runs only on Chat's own page, never under the roof: S3-D8)
  chats: [/^\/chats\/roof\/(flight|scan)\.js$/, /^\/chats\/(moon|space|land|placegrid|places|countries|shapes|jsqr|argon2|argon2w)\.js$/],
});
export const isNet = (app, p) => (NET[app] || []).some((r) => r.test(p));
// (the static specifiers of one file's text)
export const staticImports = (src) => [...strip(src).matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm)].map((m) => m[1] || m[2]);
// (the literal targets of fw.lazy(… import("…" …) …))
export const lazyImports = (src) => [...strip(src).matchAll(/\bimport\(\s*["']([^"']+)["']/g)].map((m) => m[1].replace(/\?.*$/, ''));
const resolve = (spec, from) => new URL(spec, `https://x${from}`).pathname;
async function registry() { return (await import(new URL('router.js', ROOF))).REGISTRY; }

export async function staticGraph(app, entry) {
  const R = (await registry())[app];
  const start = entry || R.entry, seen = new Set(), order = [];
  const walk = (p) => {
    if (seen.has(p)) return; seen.add(p);
    const f = fileOf(p);
    if (!f || !existsSync(f)) return;
    order.push(p);
    for (const s of staticImports(readFileSync(f, 'utf8'))) walk(resolve(s, p));
  };
  walk(start);
  return order;
}
// (the closure of every literal lazy import from the given files, through their static graphs)
export async function lazyClosure(app, files) {
  const seen = new Set(files), out = [];
  const walk = (p, top) => {
    const f = fileOf(p);
    if (!f || !existsSync(f)) return;
    const src = readFileSync(f, 'utf8');
    for (const s of lazyImports(src)) { const q = resolve(s, p); if (!seen.has(q)) { seen.add(q); out.push(q); walk(q); } }
    for (const s of staticImports(src)) { const q = resolve(s, p); if (!seen.has(q)) { seen.add(q); out.push(q); walk(q); } }
  };
  for (const p of files) walk(p);
  return out.filter((p) => !isNet(app, p));
}
export async function staticGz(app) {
  const R = (await registry())[app];
  const js = await staticGraph(app);
  const each = {};
  let jsB = 0, cssB = 0;
  for (const p of [...js, ...R.css]) {
    const f = fileOf(p);
    if (!f || !existsSync(f)) continue;
    const css = p.endsWith('.css');
    const n = gzipSync(minified(readFileSync(f, 'utf8'), css), { level: 9 }).length;
    each[p] = n;
    if (css) cssB += n; else jsB += n;
  }
  return { js: jsB / 1024, css: cssB / 1024, files: [...js, ...R.css], each };
}
