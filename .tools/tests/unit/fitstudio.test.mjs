// Precision Fit Studio (fitting.georgefarrowgreen.com, functions/_fitstudio.js): the app at its address's root, under its
// own rules (its scripts only, no frames, not for search); nothing but its files there (no API, no other page, no source);
// georgefarrowgreen.com/fitting/ sends you on to it, a preview's serves it in place; and the app itself asks nothing of
// anywhere else (every file it loads is its own, and every file its worker keeps is there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const { onRequest } = await import('../../../functions/_middleware.js');
const { onRequest: atPath } = await import('../../../functions/fitting/_middleware.js');
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', woff2: 'font/woff2' };

// the site's files, as Pages' store has them (a file that isn't there: the site's 404 page)
const store = { async fetch(r) {
  let path = new URL(r.url ?? r).pathname; if (path.endsWith('/')) path += 'index.html';
  const file = new URL('.' + path, ROOT);
  if (!existsSync(file) || path.includes('..')) return new Response(readFileSync(new URL('404.html', ROOT)), { status: 404, headers: { 'content-type': TYPES.html } });
  return new Response(readFileSync(file), { headers: { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream', etag: '"x"' } });
} };
const next = async () => new Response('the next handler', { status: 418 });
const get = (url, fn = onRequest) => fn({ request: new Request(url), env: { ASSETS: store }, next: async () => store.fetch(new Request(url)), waitUntil() {}, params: {}, data: {} });
const HOST = 'https://fitting.georgefarrowgreen.com';

test('the app is at its address’s root, under its own rules', async () => {
  const res = await get(HOST + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>Precision Fit Studio/);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'( https:\/\/static\.cloudflareinsights\.com)?;/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('its files: code asked after each time, typefaces and libraries kept', async () => {
  for (const f of ['/app.js', '/styles.css', '/sw.js', '/manifest.webmanifest']) {
    const res = await get(HOST + f);
    assert.equal(res.status, 200, f); assert.equal(res.headers.get('cache-control'), 'no-cache', f);
  }
  for (const f of ['/fonts/barlow-400.woff2', '/vendor/jspdf.umd.min.js', '/vendor/html2canvas.min.js', '/logo.png', '/icon-180.png']) {
    const res = await get(HOST + f);
    assert.equal(res.status, 200, f); assert.equal(res.headers.get('cache-control'), 'public, max-age=2592000', f);
  }
});

test('nothing else is there: no API, no other page, no source', async () => {
  for (const f of ['/api/markets/quotes', '/api/account/me', '/nothing-here', '/README.md', '/wrangler.toml', '/.tools/minify.mjs', '/weather/']) {
    const res = await get(HOST + f);
    assert.equal(res.status, 404, f);
  }
  const old = await get(HOST + '/fitting/app.js');
  assert.equal(old.status, 301); assert.equal(old.headers.get('location'), HOST + '/app.js');
});

test('georgefarrowgreen.com/fitting/ sends you on; a preview serves it in place', async () => {
  const on = await get('https://georgefarrowgreen.com/fitting/app.js', atPath);
  assert.equal(on.status, 302); assert.equal(on.headers.get('location'), HOST + '/app.js');
  const here = await get('https://claude-fitting.georgefarrowgreen.pages.dev/fitting/', atPath);
  assert.equal(here.status, 200); assert.match(here.headers.get('content-security-policy'), /style-src 'self' 'unsafe-inline'/);
  const bare = await get('https://claude-fitting.georgefarrowgreen.pages.dev/fitting', atPath);
  assert.equal(bare.status, 301);
});

test('the app asks nothing of anywhere else, and its worker keeps only files that are there', () => {
  const html = readFileSync(new URL('fitting/index.html', ROOT), 'utf8'), js = readFileSync(new URL('fitting/app.js', ROOT), 'utf8'), css = readFileSync(new URL('fitting/styles.css', ROOT), 'utf8');
  assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /(src|href)="(https?:)?\/\//);
  assert.doesNotMatch(css, /url\((https?:)?\/\//);
  assert.doesNotMatch(js, /loadScript\('https?:/);
  assert.doesNotMatch(html, /<script>|\son[a-z]+="/, 'no inline script: the page’s rules allow only its own files');
  const shell = JSON.parse(readFileSync(new URL('fitting/sw.js', ROOT), 'utf8').match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell) assert.ok(existsSync(new URL('fitting/' + (f === './' ? 'index.html' : f), ROOT)), f);
});
