// The hub's rules on everything it gives back (spec §3.3, §3.7), for every prefix, with the apps' own answers made by
// this repo's server itself (functions/_middleware.js, as each app's host has it, behind the hub's key), and Cloudflare's
// Web Analytics beacon put into each page as its edge would: no cloudflareinsights in any CSP or page; nosniff on every
// answer; X-Robots-Tag: noindex on pages (not the API); the hub's marker in pages alone, first in <head>; the manifest and
// touch icon InFlite's; no outside origin in script-src; pages no-cache, private, with no ETag or length. (HTMLRewriter
// is Cloudflare's runtime's, not Node's: a stand-in here that does what the hub asks of it on the pages as they are.
// The real one, in wrangler dev, is hubserve.mjs's.) These are the hub's pages as milestone 1 has them, which is Weather's
// too with the roof off (ROOF_OFF "1"); One roof's own (stage 1, spec §8.1): with the roof on, a document at /weather/ is
// the framework's page with the page's headers, /weather/sw.js the retiring worker, each with the hub's nosniff and
// noindex; with it off, the module's files not found, never kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { IFL, roofSkip } from './fixtures/roof.mjs';

const ROOT = new URL('../../../', import.meta.url);
const SRC = IFL && new URL('today/src/hub.js', IFL);
const skip = (!IFL || !existsSync(SRC)) && 'the inflite repo isn’t beside this one';
const H = skip ? null : await import(SRC);
const ROOFJS = IFL && new URL('today/src/roof.js', IFL);
const hasRoof = !skip && existsSync(ROOFJS);
const R = hasRoof ? await import(ROOFJS) : null;
const roofCase = skip || roofSkip || (!hasRoof && 'the inflite repo beside has no roof rule yet (today/src/roof.js)');
const { onRequest } = await import('../../../functions/_middleware.js');

const SITE = 'https://inflite.ai', KEY = 'hub-key-0123456789abcdef';
const BEACON = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v8c78df7c7c0f484497ecbca7046644da1771523124516" data-cf-beacon='{"token": "x"}'></script>`;
const ENV = { HUB_KEY: KEY, CHAT_ORIGIN: 'https://chat.inflite.ai', WEATHER_ORIGIN: 'https://weather.inflite.ai', FITNESS_ORIGIN: 'https://fitness.inflite.ai',
  MARKETS_ORIGIN: 'https://finance.inflite.ai', MAIL_ORIGIN: 'https://email.inflite.ai', AUTH_ORIGIN: 'https://auth.inflite.ai', ROOF_OFF: '1' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', json: 'application/json' };

// The site's files, as the static asset store has them
const store = { async fetch(r) {
  let path = new URL(r.url ?? r).pathname; if (path.endsWith('/')) path += 'index.html';
  const file = new URL('.' + path, ROOT);
  if (!existsSync(file) || path.includes('..')) return new Response('not here', { status: 404 });
  return new Response(readFileSync(file), { headers: { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream', etag: '"x"' } });
} };
// The apps' hosts: this repo's server, as the Worker runs it there, with the API's routes stood in for; each page with the
// beacon in it, as Cloudflare's edge adds it
function hosts() {
  globalThis.fetch = async (url, init = {}) => {
    const request = new Request(url, init);
    const env = { HUB_KEY: KEY, ASSETS: store };
    const next = async () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Set-Cookie': 'account=abcdefghijklmnopqrstuvwxyz0123; Path=/' } });
    const res = await onRequest({ request, env, next, waitUntil() {}, params: {}, data: {} });
    if (!/text\/html/.test(res.headers.get('content-type') || '') || request.method === 'HEAD') return res;
    return new Response((await res.text()).replace('</body>', `${BEACON}</body>`), res);
  };
}
const ask = async (path, init = {}, env = ENV) => {
  const r = new Request(SITE + path, { headers: { 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9', ...(init.headers || {}) }, method: init.method || 'GET' });
  const res = await H.hub(r, env, {});
  return { res, text: init.method === 'HEAD' ? '' : await res.text() };
};

// ---- HTMLRewriter, as far as the hub uses it: tag, tag[attr="v"] and tag[attr*="v"]; remove, prepend, setAttribute ----
const VOID = new Set(['meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'base', 'col', 'embed', 'track', 'wbr', 'area', 'param']);
const attrsOf = (s) => Object.fromEntries([...s.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '']));
function selector(s) {
  const m = /^([a-z]+)(?:\[([\w-]+)(\*?=)"([^"]*)"\])?$/.exec(s);
  if (!m) throw new Error(`the stand-in doesn’t know ${s}`);
  return (tag, a) => tag === m[1] && (!m[2] || (m[3] === '=' ? a[m[2]] === m[4] : (a[m[2]] ?? '').includes(m[4])));
}
globalThis.HTMLRewriter = class {
  constructor() { this.rules = []; }
  on(s, h) { this.rules.push([selector(s), h]); return this; }
  transform(res) {
    const rules = this.rules;
    const rewrite = async () => {
      const html = await res.text(); let out = '', i = 0;
      const re = /<!--[\s\S]*?-->|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
      for (let m; (m = re.exec(html));) {
        if (!m[1]) continue;
        const tag = m[1].toLowerCase(); let attrs = attrsOf(m[2] || ''), removed = false, after = '', changed = false;
        for (const [match, h] of rules) if (match(tag, attrs)) h.element({
          remove() { removed = true; }, prepend(c) { after = c + after; },
          setAttribute(k, v) { attrs = { ...attrs, [k]: v }; changed = true; }, getAttribute: (k) => attrs[k] ?? null, tagName: tag,
        });
        let end = m.index + m[0].length;
        const close = !VOID.has(tag) && (tag === 'script' || removed) ? html.indexOf(`</${tag}>`, end) : -1;
        if (removed) { out += html.slice(i, m.index); i = close >= 0 ? close + tag.length + 3 : end; re.lastIndex = i; continue; }
        out += html.slice(i, m.index) + (changed ? `<${m[1]}${Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}${m[0].endsWith('/>') ? ' />' : '>'}` : m[0]) + after;
        i = end;
        if (tag === 'script' && close >= 0) { re.lastIndex = close; }
      }
      return out + html.slice(i);
    };
    return new Response(new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(await rewrite())); c.close(); } }), res);
  }
};

const PREFIXES = ['/chats/', '/weather/', '/fitness/', '/markets/'];
const scriptSrc = (csp) => (/(?:^|;)\s*script-src([^;]*)/.exec(csp || '') || [])[1]?.trim().split(/\s+/) || [];

test('every prefix’s page: the marker first in <head>, InFlite’s manifest and touch icon, no beacon, kept only to be checked again', { skip }, async () => {
  hosts();
  for (const prefix of PREFIXES) {
    const { res, text } = await ask(prefix);
    assert.equal(res.status, 200, prefix);
    assert.match(text, new RegExp(`<head>\\s*<meta name="ifl-hub" content="${prefix}">`), `${prefix}: the marker, first in <head>`);
    assert.equal(text.match(/name="ifl-hub"/g).length, 1, `${prefix}: once`);
    assert.doesNotMatch(text, /cloudflareinsights/, `${prefix}: no beacon in the page`);
    assert.match(text, /<link rel="manifest" href="\/manifest\.webmanifest"/, `${prefix}: InFlite’s manifest`);
    assert.match(text, /<link rel="apple-touch-icon" href="\/icon-180\.png"/, `${prefix}: InFlite’s icon`);
    assert.equal(res.headers.get('cache-control'), 'no-cache, private', prefix);
    assert.equal(res.headers.get('etag'), null, prefix); assert.equal(res.headers.get('content-length'), null, prefix);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', prefix);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', prefix);
    assert.deepEqual(res.headers.getSetCookie(), [], prefix);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, `${prefix}: a CSP`);
    assert.doesNotMatch(csp, /cloudflareinsights/, `${prefix}: none in its CSP`);
    assert.ok(scriptSrc(csp).length && scriptSrc(csp).every((t) => /^'(self|wasm-unsafe-eval)'$/.test(t)), `${prefix}: script-src is its own scripts alone: ${scriptSrc(csp)}`);
  }
  // (Chat's hub copy: its paths at /chats/, the API's kept, and framed only by the hub's own pages)
  const chat = await ask('/chats/');
  assert.doesNotMatch(chat.text, /(?<![\w.-])\/pigeon\//, 'no /pigeon/ path left');
  assert.match(chat.text, /"\/chats\/app\.js\?v=[0-9a-f]{12}"/);
  assert.match(chat.res.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(chat.res.headers.get('x-frame-options'), 'SAMEORIGIN');
  for (const prefix of ['/weather/', '/fitness/', '/markets/']) assert.match((await ask(prefix)).res.headers.get('content-security-policy'), /frame-ancestors 'none'/, `${prefix}: never framed`);
});

test('every prefix’s files and API answers: nosniff, no beacon in a CSP; the marker never outside a page; noindex on all but the API', { skip }, async () => {
  hosts();
  const files = { '/chats/': ['app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'version'], '/weather/': ['app.js', 'styles.css', 'sw.js', 'icon-180.png', 'version'],
    '/fitness/': ['app.js', 'styles.css', 'sw.js', 'version'], '/markets/': ['app.js', 'styles.css', 'sw.js', 'version'] };
  for (const [prefix, list] of Object.entries(files)) for (const f of list) {
    const { res, text } = await ask(prefix + f);
    assert.equal(res.status, 200, prefix + f);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', prefix + f);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', prefix + f);
    assert.doesNotMatch(res.headers.get('content-security-policy') || '', /cloudflareinsights/, prefix + f);
    assert.doesNotMatch(text, /ifl-hub" content=/, `${prefix + f}: no marker outside a page`);
    assert.equal(res.headers.get('service-worker-allowed'), null, `${prefix + f}: no worker over the whole site`);
  }
  for (const p of ['/api/pigeon/sync', '/api/weather/me', '/api/fitness/me', '/api/markets/quotes']) {
    const { res } = await ask(p);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', p);
    assert.equal(res.headers.get('x-robots-tag'), null, `${p}: an API answer isn’t a page`);
    assert.deepEqual(res.headers.getSetCookie(), ['account=abcdefghijklmnopqrstuvwxyz0123; Path=/'], `${p}: the account’s cookie, from an API`);
  }
  // (Chat's worker, as sent at the hub: its paths there, its scope /chats/)
  const sw = await ask('/chats/sw.js');
  assert.doesNotMatch(sw.text, /(?<![\w.-])\/pigeon\//);
});

test('an answer without nosniff gets it; a beacon in any CSP directive, or a CSP-Report-Only, is taken out; an app’s worker can’t widen its scope', { skip }, async () => {
  globalThis.fetch = async () => new Response('<!doctype html><html><head><meta name="ifl-hub" content="/evil/"><title>x</title></head><body><script src="https://static.cloudflareinsights.com/beacon.min.js"></script></body></html>', { headers: {
    'Content-Type': 'text/html', ETag: '"e"', 'Content-Length': '200', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/', 'Clear-Site-Data': '"storage"',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com https://api.example.com",
    'Content-Security-Policy-Report-Only': "script-src 'self' https://static.cloudflareinsights.com/x" } });
  const { res, text } = await ask('/fitness/');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), "default-src 'self'; script-src 'self'; connect-src 'self' https://api.example.com");
  assert.equal(res.headers.get('content-security-policy-report-only'), "script-src 'self'");
  assert.equal(res.headers.get('service-worker-allowed'), null); assert.equal(res.headers.get('clear-site-data'), null);
  assert.equal(res.headers.get('cache-control'), 'no-cache, private');
  assert.match(text, /^<!doctype html><html><head><meta name="ifl-hub" content="\/fitness\/"><title>/, 'the app’s own marker, if it had one, never kept: only the hub’s');
  assert.doesNotMatch(text, /cloudflareinsights|\/evil\//);
  // (a HEAD: the headers alone, as for the page)
  const head = await ask('/fitness/', { method: 'HEAD' });
  assert.equal(head.res.headers.get('cache-control'), 'no-cache, private'); assert.equal(head.res.headers.get('x-robots-tag'), 'noindex');
});

test('the hub’s source asks HTMLRewriter for exactly these, and sets the marker from its own table, never from the request', { skip }, async () => {
  const src = readFileSync(SRC, 'utf8');
  for (const s of [`'script[src*="cloudflareinsights"]'`, `"head"`, `'link[rel="manifest"]'`, `'link[rel="apple-touch-icon"]'`]) assert.ok(src.includes(`.on(${s}`), s);
  assert.match(src, /<meta name="ifl-hub" content="\$\{base\}">/);
  assert.match(src, /base: Object\.keys\(PAGES\)\.find\(/);
});

test('One roof: with the roof on, /weather/ is the framework’s page with the page’s headers (no hub marker of Weather’s, no beacon), /weather/sw.js the retiring worker; the files the hub’s as ever; with it off, the module’s files not found', { skip: roofCase }, async () => {
  hosts();
  // (Today's page, as the inflite repo's assets have it, with its own headers)
  const page = readFileSync(new URL('today/public/index.html', IFL));
  const ON = { ...ENV, ROOF_OFF: undefined, ASSETS: { fetch: async (r) => new Response(r.method === 'HEAD' ? null : page, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"p"', 'Content-Security-Policy': "default-src 'self'" } }) } };
  for (const p of ['/weather/', '/weather/index.html', '/weather/?lat=1&lon=2']) {
    const { res, text } = await ask(p, {}, ON);
    assert.equal(res.status, 200, p);
    assert.match(text, /<meta name="ifl-hub" content="\/">/, `${p}: the framework’s marker`);
    assert.doesNotMatch(text, /ifl-hub" content="\/weather\//, `${p}: never the hub’s marker for Weather’s page`);
    assert.doesNotMatch(text, /cloudflareinsights/);
    for (const [k, v] of Object.entries(R.PAGE_HEADERS)) assert.equal(res.headers.get(k), v, `${p}: ${k}`);
    assert.equal(res.headers.get('etag'), null);
    assert.deepEqual(res.headers.getSetCookie(), []);
    assert.ok(scriptSrc(res.headers.get('content-security-policy')).every((t) => t === "'self'"), 'script-src its own alone');
  }
  const sw = await ask('/weather/sw.js', {}, ON);
  assert.equal(sw.res.headers.get('x-content-type-options'), 'nosniff'); assert.equal(sw.res.headers.get('x-robots-tag'), 'noindex');
  assert.equal(sw.res.headers.get('service-worker-allowed'), null, 'never a worker over the whole site');
  assert.match(sw.text, /registration\.unregister\(\)/);
  for (const f of ['app.js', 'styles.css', 'icon-180.png', 'version']) {
    const { res, text } = await ask('/weather/' + f, {}, ON);
    assert.equal(res.status, 200, f); assert.equal(res.headers.get('x-robots-tag'), 'noindex', f); assert.equal(res.headers.get('x-content-type-options'), 'nosniff', f);
    assert.doesNotMatch(res.headers.get('content-security-policy') || '', /cloudflareinsights/, f);
    assert.doesNotMatch(text, /ifl-hub" content=/, f);
  }
  // (off: Weather's page the hub's again, as above; the module's files not found, never kept, never sniffed)
  for (const p of ['/weather/roof/weather.js', '/weather/roof/wxcore.css']) {
    const { res } = await ask(p);
    assert.equal(res.status, 404, p); assert.equal(res.headers.get('cache-control'), 'no-store', p); assert.equal(res.headers.get('x-content-type-options'), 'nosniff', p);
  }
});

// ---- stage 3 (s3 spec §6.2, S3-D8): Chats' switch (ROOF_CHATS), with Chat's host answering as this repo's server ----
const hasChats = hasRoof && R.MODS?.includes('chats');
test('stage 3: Chats on, /chats/ is the framework’s page with the page’s headers and /chats/sw.js the retiring worker; on or off, /chats/in/ and ?engine are Chat’s page with the hub’s rules, inflite.svg under it Chat’s; off, /chats/roof/* not found', { skip: roofCase || (!hasChats && 'the inflite repo beside has no Chats switch yet (before stage 3)') }, async () => {
  hosts();
  const page = readFileSync(new URL('today/public/index.html', IFL));
  const ON = { ...ENV, ROOF_OFF: undefined, ROOF_CHATS: '1', ASSETS: { fetch: async (r) => new Response(r.method === 'HEAD' ? null : page, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"p"' } }) } };
  const OFF = { ...ENV, ROOF_OFF: undefined };
  for (const p of ['/chats/', '/chats/index.html']) {
    const { res, text } = await ask(p, {}, ON);
    assert.equal(res.status, 200, p); assert.match(text, /<meta name="ifl-hub" content="\/">/, `${p}: the framework’s`);
    for (const [k, v] of Object.entries(R.PAGE_HEADERS)) assert.equal(res.headers.get(k), v, `${p}: ${k}`);
  }
  const sw = await ask('/chats/sw.js', {}, ON);
  assert.equal(sw.text, R.retireSw('chats')); assert.equal(sw.res.headers.get('service-worker-allowed'), null);
  for (const [e, name] of [[ON, 'on'], [OFF, 'off']]) {
    for (const p of ['/chats/in/', '/chats/in/index.html', '/chats/?engine=1']) {
      const { res, text } = await ask(p, {}, e);
      assert.equal(res.status, 200, `${name} ${p}`);
      assert.match(text, /<head>\s*<meta name="ifl-hub" content="\/chats\/">/, `${name} ${p}: Chat’s page, the hub’s marker first`);
      assert.match(text, /inflight-version/); assert.doesNotMatch(text, /cloudflareinsights/);
      assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'self'/); assert.equal(res.headers.get('cache-control'), 'no-cache, private');
      assert.equal(res.headers.get('x-robots-tag'), 'noindex'); assert.deepEqual(res.headers.getSetCookie(), []);
    }
    const svg = await ask('/chats/in/inflite.svg', {}, e);
    assert.equal(svg.res.status, 200); assert.match(svg.res.headers.get('content-type'), /svg/); assert.equal(svg.text, (await ask('/chats/inflite.svg', {}, e)).text);
  }
  for (const p of ['/chats/roof/chats.js', '/chats/roof/core.js']) {
    const off = await ask(p, {}, OFF);
    assert.equal(off.res.status, 404, p); assert.equal(off.res.headers.get('cache-control'), 'no-store');
    const on = await ask(p, {}, ON);
    assert.equal(on.res.status, 200, `on: ${p} from Chat’s hub copy`); assert.equal(on.res.headers.get('x-content-type-options'), 'nosniff');
  }
});
