// Today's files (the inflite repo's today/public, where it's checked out beside this one): its copies of this
// repository's are the same, byte for byte (Weather's icons, the apps' icons, InFlite's mark); its icons are the sizes
// its manifest says; its page is a public one (title, description, og tags, robots, sitemap); its headers never
// preload HSTS and allow nothing inline; and nothing it draws has an inline style, which those headers would refuse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const PUB = new URL('../../../../inflite/today/public/', import.meta.url);
const ROOT = new URL('../../../', import.meta.url);
const skip = !existsSync(new URL('index.html', PUB)) && 'the inflite repo isn’t beside this one';
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

test('its icons are the sizes the manifest and page say, and the manifest is Today’s', { skip }, () => {
  const m = JSON.parse(pub('manifest.webmanifest'));
  assert.equal(m.name, 'InFlite Today');
  assert.equal(m.short_name, 'Today');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  for (const i of m.icons.filter((x) => x.type === 'image/png')) assert.deepEqual(size(pub(i.src.slice(1))), i.sizes.split('x').map(Number), i.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon');
  assert.ok(m.icons.some((i) => i.src === '/icon.svg' && i.sizes === 'any'));
  assert.deepEqual(size(pub('icon-180.png')), [180, 180]);
  assert.deepEqual(size(pub('og.png')), [1200, 630]);
});

test('its page is a public one: title, description, og tags, canonical, robots and sitemap', { skip }, () => {
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
  assert.equal(String(pub('robots.txt')), 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://inflite.ai/sitemap.xml\n');
  assert.match(String(pub('sitemap.xml')), /<loc>https:\/\/inflite\.ai\/<\/loc>/);
  assert.match(String(pub('404.html')), /href="\/"/);
});

test('its headers: HSTS without preload, a CSP with nothing inline and no other site, its scripts never kept stale', { skip }, () => {
  const h = String(pub('_headers'));
  assert.match(h, /Strict-Transport-Security: max-age=63072000; includeSubDomains\n/);
  assert.ok(!/preload/.test(h), 'no HSTS preload at the apex until every subdomain is ready');
  const csp = /Content-Security-Policy: (.*)/.exec(h)[1];
  assert.ok(!/unsafe-inline|unsafe-eval|https?:/.test(csp), csp);
  for (const d of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) assert.ok(csp.includes(d), d);
  for (const f of ['/sw.js', '/', '/app.js', '/cards.js', '/wxicons.js', '/app.css', '/theme.js']) assert.match(h, new RegExp(`^${f.replace(/[.*/]/g, '\\$&')}\\n  Cache-Control: no-cache$`, 'm'), f);
});

test('nothing Today draws has an inline style or an inline script, which its CSP refuses', { skip }, () => {
  for (const f of ['index.html', '404.html']) {
    const html = String(pub(f));
    assert.ok(!/\sstyle\s*=/.test(html), `${f} has a style attribute`);
    assert.ok(!/<style\b/.test(html), `${f} has a <style>`);
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) assert.match(tag, /\ssrc=/, `${f}: an inline script`);
    assert.ok(!/\son[a-z]+\s*=/.test(html), `${f} has an inline handler`);
  }
  for (const f of ['app.js', 'cards.js']) {
    // (InFlite's shared menu sets its place with the CSSOM, which the CSP allows: only style="" in markup is refused)
    const js = String(pub(f));
    assert.ok(!/style=\\?["']/.test(js), `${f} writes a style attribute into markup`);
    assert.ok(!/setAttribute\(\s*["']style["']/.test(js), `${f} sets a style attribute`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(js), `${f} writes an inline handler into markup`);
  }
});
