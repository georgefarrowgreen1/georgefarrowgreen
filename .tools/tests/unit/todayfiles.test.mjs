// Today's files (the inflite repo's today/public, where it's checked out beside this one): its copies of this
// repository's are the same, byte for byte (Weather's icons, the apps' icons, InFlite's mark); its icons are the sizes
// its manifest says; its page is a public one (title, description, og tags, robots, sitemap); and its headers never
// preload HSTS and allow nothing inline; with One roof (stage 1, spec §8.3), its CSP names exactly Weather's origins and is
// the Worker's PAGE_HEADERS' for /weather/, geolocation is its own, the framework's files are never kept stale, and its
// worker keeps them (today-app-3). (What its page is made of, and that nothing it draws has an inline style:
// roofpage.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { IFL, roofSkip } from './fixtures/roof.mjs';

const PUB = new URL('../../../../inflite/today/public/', import.meta.url);
const ROOT = new URL('../../../', import.meta.url);
const skip = !existsSync(new URL('index.html', PUB)) && 'the inflite repo isn’t beside this one';
// (InFlite's page's cases: skipped, not failed, where the inflite repo beside has no hub yet, as its live branch beside
// main while this repo goes live first)
const tfSkip = skip || (!existsSync(new URL('../../../../inflite/today/src/hub.js', import.meta.url)) && 'the inflite repo beside is from before Today First (its live branch, while this repo goes live first)');
// (One roof's headers, where the inflite repo beside has the roof rule (today/src/roof.js); milestone 1's where it hasn't)
const ROOFJS = new URL('../src/roof.js', PUB);
const hasRoof = !tfSkip && existsSync(ROOFJS);
const roofCase = tfSkip || roofSkip || (!hasRoof && 'the inflite repo beside has no roof rule yet (today/src/roof.js)');
const m1Case = tfSkip || (hasRoof && 'the inflite repo beside has the roof (today/src/roof.js): its CSP names Weather’s origins, below');
const pub = (f) => readFileSync(new URL(f, PUB));
const here = (f) => readFileSync(new URL(f, ROOT));
// (a PNG's width and height, from its header)
const size = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test('Today’s copies are this repository’s, byte for byte', { skip }, () => {
  assert.ok(pub('wxicons.js').equals(here('weather/icons.js')), 'today/public/wxicons.js differs from weather/icons.js: copy it again');
  for (const a of ['chat', 'weather', 'fitness', 'markets']) assert.ok(pub(`apps/${a}.svg`).equals(here(`.tools/inflite/icons/${a}.svg`)), `apps/${a}.svg differs from .tools/inflite/icons/${a}.svg`);
  assert.deepEqual(readdirSync(new URL('apps/', PUB)).sort(), ['chat.svg', 'fitness.svg', 'markets.svg', 'weather.svg']);
  assert.ok(pub('icon.svg').equals(here('.tools/inflite/inflite.svg')), 'icon.svg differs from .tools/inflite/inflite.svg');
  assert.ok(pub('inflite.svg').equals(here('.tools/inflite/inflite.svg')), 'inflite.svg differs from .tools/inflite/inflite.svg');
});

test('its icons are the sizes the manifest and page say, and the manifest is InFlite’s, one app at /', { skip: tfSkip }, () => {
  const m = JSON.parse(pub('manifest.webmanifest'));
  assert.equal(m.id, '/', 'the identity iOS already gives every Today icon: each one is InFlite');
  assert.equal(m.name, 'InFlite');
  assert.equal(m.short_name, 'InFlite');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  for (const i of m.icons.filter((x) => x.type === 'image/png')) assert.deepEqual(size(pub(i.src.slice(1))), i.sizes.split('x').map(Number), i.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon');
  assert.ok(m.icons.some((i) => i.src === '/icon.svg' && i.sizes === 'any'));
  assert.deepEqual(size(pub('icon-180.png')), [180, 180]);
  assert.deepEqual(size(pub('og.png')), [1200, 630]);
});

test('its page is a public one: title, description, og tags, canonical, robots and sitemap', { skip: tfSkip }, () => {
  const html = String(pub('index.html'));
  const meta = (k) => new RegExp(`<meta (?:name|property)="${k}" content="([^"]*)"`).exec(html)?.[1];
  assert.match(html, /<title>InFlite Today<\/title>/);
  assert.match(meta('description'), /^Your day from InFlite’s apps on one page/);
  assert.equal(meta('og:title'), 'InFlite Today');
  assert.equal(meta('og:image'), 'https://inflite.ai/og.png');
  assert.equal(meta('og:url'), 'https://inflite.ai/');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.match(html, /<link rel="canonical" href="https:\/\/inflite\.ai\/">/);
  assert.match(html, /maximum-scale=1, user-scalable=no/, 'pinch to zoom stays off, as in every app');
  // (the hub's pages are copies of the apps' own addresses, which stay the ones indexed)
  assert.equal(String(pub('robots.txt')), 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /chats/\nDisallow: /weather/\nDisallow: /fitness/\nDisallow: /markets/\nDisallow: /mail/\nSitemap: https://inflite.ai/sitemap.xml\n');
  assert.match(String(pub('sitemap.xml')), /<loc>https:\/\/inflite\.ai\/<\/loc>/);
  assert.match(String(pub('404.html')), /href="\/"/);
});

test('its headers: HSTS without preload, a CSP with nothing inline and no other site, its scripts never kept stale', { skip: tfSkip }, () => {
  const h = String(pub('_headers'));
  assert.match(h, /Strict-Transport-Security: max-age=63072000; includeSubDomains\n/);
  assert.ok(!/preload/.test(h), 'no HSTS preload at the apex until every subdomain is ready');
  const csp = /Content-Security-Policy: (.*)/.exec(h)[1];
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), csp);
  // (no other site at all in milestone 1; with the roof, Weather's alone, in connect-src and img-src: below)
  if (!hasRoof) assert.ok(!/https?:/.test(csp), csp);
  else assert.ok(!/https?:/.test(csp.split(';').filter((d) => !/^\s*(connect|img|frame)-src /.test(d)).join(';')), csp);
  // (frame-src 'self': Chat's engine, its own page in a frame over Today's)
  // (stages 2–4: Mail's Worker beside it, for Mail's module's bodies, s24-contracts §11)
  for (const d of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) assert.ok(csp.includes(d), d);
  assert.ok(/(^|; )frame-src 'self'(;| https:\/\/email\.inflite\.ai http:\/\/email\.ifl\.test:8788;)/.test(csp), "frame-src 'self' (and Mail's Worker)");
  for (const f of ['/sw.js', '/', '/app.js', '/cards.js', '/day.js', '/day.css', '/apps.js', '/you.js', '/wxicons.js', '/app.css', '/theme.js']) assert.match(h, new RegExp(`^${f.replace(/[.*/]/g, '\\$&')}\\n  Cache-Control: no-cache$`, 'm'), f);
});

test('milestone 1: geolocation is no one’s', { skip: m1Case }, () => {
  assert.match(String(pub('_headers')), /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)\n/);
});

test('One roof: the CSP is the Worker’s PAGE_HEADERS’ and names exactly Weather’s origins and no other site; geolocation its own; the framework’s files never kept stale; its worker keeps them', { skip: roofCase }, async () => {
  const h = String(pub('_headers'));
  const { PAGE_HEADERS } = await import(ROOFJS);
  const csp = /Content-Security-Policy: (.*)/.exec(h)[1];
  assert.equal(csp, PAGE_HEADERS['Content-Security-Policy'], '_headers and PAGE_HEADERS: one CSP');
  const wx = String(here('functions/_wxapp.js'));
  const list = (n) => [...new RegExp(`const ${n} = \\[([\\s\\S]*?)\\];`).exec(wx)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const dir = (d) => (new RegExp(`(?:^|;)\\s*${d} ([^;]*)`).exec(csp) || [])[1].trim().split(/\s+/);
  const mail = dir('connect-src').includes('https://email.inflite.ai') ? ['https://email.inflite.ai', 'http://email.ifl.test:8788'] : [];
  assert.deepEqual(dir('connect-src'), ["'self'", ...mail, ...list('CONNECT').filter((o) => !/cloudflareinsights/.test(o))]);
  assert.deepEqual(dir('img-src'), ["'self'", 'data:', 'blob:', ...list('IMAGES')]);
  assert.deepEqual(dir('frame-src'), ["'self'", ...mail], 'frame-src: this site and Mail’s Worker alone');
  assert.equal((csp.match(/https:/g) || []).length, list('CONNECT').length - 1 + list('IMAGES').length + (mail.length ? 2 : 0), 'no other site');
  // (stage 3, where the inflite repo beside has it: Chats' camera (a friend's code), microphone (voice) and blob: media,
  // this site alone; else none, as before)
  const { MODS } = await import(ROOFJS), chats = !!MODS?.includes('chats');
  assert.deepEqual(csp.includes('media-src') ? dir('media-src') : [], chats ? ["'self'", 'blob:'] : []);
  assert.match(h, chats ? /Permissions-Policy: camera=\(self\), microphone=\(self\), geolocation=\(self\)\n/ : /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(self\)\n/);
  assert.match(h, /^\/roof\/\*\n  Cache-Control: no-cache$/m, 'the framework’s files never kept stale');
  const sw = String(pub('sw.js'));
  assert.ok(['today-app-3', 'today-app-4'].includes(/\nconst SHELL = "([^"]+)";/.exec(sw)?.[1]), 'today-app-3 (4 from stages 2–4)');
  const FILES = JSON.parse(/\nconst FILES = (\[[^\]]*\]);/.exec(sw)[1]);
  for (const f of readdirSync(new URL('roof/', PUB)).filter((f) => /\.(js|css)$/.test(f))) assert.ok(FILES.includes(`/roof/${f}`), `/roof/${f} kept by the worker`);
});
