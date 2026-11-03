// The kit the One roof acceptance tests share (roofweather.mjs, roofnav.mjs, roofsw.mjs; spec §9.4 Q, §10.2): a phone at
// InFlite's hub (the stack run.sh starts for a test whose first line is `// needs: hub`: hubstack.mjs), and what those
// tests read off it that the page itself doesn't say:
//   alive(p)         a marker put on the document: still there = the same document (no reload, no navigation)
//   loads(p)         main-frame navigations that fetched a document (a pushState is none)
//   HISTORY          pushState/replaceState noted per document (window.__roofHist), read with history(p)
//   meter(p)         Weather's same-origin script and style requests, with their gzip sizes (§7.3's budget)
//   standIns(ctx)    Weather's third parties stood in for in the browser (wxhub.mjs's routes, mocks/wxappdata.mjs)
//   wxServer()       the site's own stand-ins on :8794 (WXAPP_URL, METEOALARM_URL, NWS_URL, EA_URL in server.sh): the
//                    forecast the server asks for Today's card, and the official warnings (two over London, one over
//                    Bristol, France's feed down so a place there has none at all: wx.official null)
//   STANDALONE       a Home Screen phone (navigator.standalone, display-mode: standalone)
//   ownGuard(ctx)    every request and navigation to Weather's own address (weather.ifl.test here, weather.inflite.ai
//                    live), from any page or frame: a /weather/ boot under the roof must start none (D23)
//   launch()         the browser: Chromium with the hub's names mapped (as lib.mjs hubBrowser), or WebKit when
//                    BROWSER=webkit and it's installed (the names through a small proxy, as WebKit takes no resolver
//                    rules; http://ifl.test isn't a secure origin there, so its service worker and push are Chromium's)
// Selectors come only from roofhooks.mjs (§3.14); this file holds none of the apps' markup.
import { chromium, webkit } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import http from 'node:http';
import net from 'node:net';
import * as F from './mocks/wxappdata.mjs';
import * as OW from './mocks/wxwarnings.mjs';
import { hostCall as signupAt } from './handback.mjs';

// (what a service worker fetches goes through the context's routes too, its own script included: roofsw stands in for
// Weather's old worker that way, and the release and roof-off stand-ins reach a module file a worker fetches. Read by
// Playwright as each browser starts, after this line)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export const HUB = 'http://ifl.test:8788';
export const OWN = 'http://weather.ifl.test:8788';
export const ROOT = process.env.APP_ROOT || new URL('../../', import.meta.url).pathname;
export const IFL = process.env.IFL_ROOT || `${ROOT}/../inflite/`;
const HERE = new URL('./', import.meta.url).pathname;
export const AXE = readFileSync(`${HERE}node_modules/axe-core/axe.min.js`, 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==', 'base64');
export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const until = async (f, ms = 15000, step = 250) => { const end = Date.now() + ms; for (;;) { const v = await Promise.resolve().then(f).catch(() => null); if (v || Date.now() > end) return v; await wait(step); } };
export const js = (x, n = 300) => String(JSON.stringify(x) ?? x).slice(0, n);

// ---- checks, each naming the spec section it proves ----
export function checker() {
  let fails = 0;
  const ok = (c, label, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && extra ? '  — ' + String(extra).slice(0, 600) : ''}`); if (!c) fails++; return !!c; };
  const step = (n, what, sec) => console.log(`\n==== ${n}. ${what}  (${sec})`);
  // (a part of a test: a throw in it is one failure, said, and the test goes on to the next part)
  const part = async (n, what, sec, fn) => { step(n, what, sec); try { await fn(); } catch (e) { ok(false, `${n}. stopped: ${String(e?.message || e).split('\n')[0]}`); } };
  return { ok, step, part, fails: () => fails, fail: () => fails++ };
}

// ---- the browser ----
const SECURE = ['', 'auth.', 'account.', 'chat.', 'email.', 'weather.', 'fitness.', 'finance.'].map((h) => `http://${h}ifl.test:8788`).join(',');
const RULES = 'MAP ifl.test:8788 127.0.0.1:8787, MAP email.ifl.test:8788 127.0.0.1:8806, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1, MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1';
export const CHROMIUM_ARGS = [`--host-resolver-rules=${RULES}`, `--unsafely-treat-insecure-origin-as-secure=${SECURE}`];
export const ENGINE = (() => {
  if (process.env.BROWSER !== 'webkit') return 'chromium';
  try { if (existsSync(webkit.executablePath())) return 'webkit'; } catch (_) {}
  console.log('note: BROWSER=webkit asked for, but WebKit isn’t installed here: Chromium instead');
  return 'chromium';
})();
// (WebKit takes no resolver rules: a proxy that sends each of the tests' names where Chromium's rules would)
let proxy = null;
function hubProxy() {
  if (proxy) return proxy;
  const where = (host) => {
    const [name, port = '80'] = host.split(':');
    if (name === 'ifl.test' && port === '8788') return ['127.0.0.1', 8787];
    if (name === 'email.ifl.test' && port === '8788') return ['127.0.0.1', 8806];
    if (/(^|\.)(ifl|gfg)\.test$/.test(name)) return ['127.0.0.1', Number(port)];
    return [name, Number(port)];
  };
  const srv = http.createServer((q, s) => {
    let u; try { u = new URL(q.url); } catch (_) { s.writeHead(400); return s.end(); }
    const [host, port] = where(u.host);
    const out = http.request({ host, port, method: q.method, path: u.pathname + u.search, headers: q.headers }, (r) => { s.writeHead(r.statusCode, r.rawHeaders); r.pipe(s); });
    out.on('error', () => { if (!s.headersSent) s.writeHead(502); s.end(); });
    q.pipe(out);
  });
  srv.on('connect', (q, sock, head) => {
    const [host, port] = where(q.url);
    const up = net.connect(port || 443, host, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up); });
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  });
  proxy = new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${srv.address().port}`)));
  return proxy;
}
let browser = null;
export function launch() {
  return (browser ||= (async () => ENGINE === 'webkit'
    ? webkit.launch({ proxy: { server: await hubProxy(), bypass: '<-loopback>' } })
    : chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: CHROMIUM_ARGS }))());
}
// A browser profile kept on disk, opened again as a fresh window (empty sessionStorage; its storage, caches and
// service workers kept): roofsw's offline open
export async function persistent(dir, opts = {}) {
  const o = { viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: ENGINE === 'chromium', hasTouch: true, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'allow', userAgent: IPHONE, ...opts };
  return ENGINE === 'webkit'
    ? webkit.launchPersistentContext(dir, { ...o, proxy: { server: await hubProxy(), bypass: '<-loopback>' } })
    : chromium.launchPersistentContext(dir, { ...o, executablePath: process.env.CHROMIUM || undefined, args: CHROMIUM_ARGS });
}
export async function closeAll() { if (browser) await (await browser).close().catch(() => {}); }

// ---- what every page notes as it opens: its history calls, CSP refusals, every note and toast it showed ----
// (history: { kind: push|replace, url, state } per call, in this document; csp: each refusal; said: the text of each
// toast or note as it appeared, the shared block's .ifm-note and the framework's .ifl-toast alike)
export const NOTING = () => {
  const H = (window.__roofHist = []);
  for (const kind of ['pushState', 'replaceState']) {
    const real = History.prototype[kind];
    History.prototype[kind] = function (state, title, url) {
      try { H.push({ kind: kind === 'pushState' ? 'push' : 'replace', url: url == null ? null : new URL(url, location.href).href, state: JSON.parse(JSON.stringify(state ?? null)), t: Date.now() }); } catch (_) {}
      return real.apply(this, arguments);
    };
  }
  window.__roofCsp = [];
  document.addEventListener('securitypolicyviolation', (e) => { const s = `${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber || ''}`; window.__roofCsp.push(s); console.error(`CSP violation: ${s}`); });
  window.__roofSaid = [];
  const seen = new WeakSet();
  const look = () => { for (const n of document.querySelectorAll('.ifl-toast, .ifm-note')) { if (seen.has(n)) continue; seen.add(n); setTimeout(() => window.__roofSaid.push(n.textContent.replace(/\s+/g, ' ').trim()), 60); } };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
};
// The page's visibility, ours to say (headless pages are always visible): hide(p) and show(p) set it and tell the page,
// as a phone's app switcher would
export const VISIBILITY = () => {
  let v = 'visible';
  Object.defineProperty(Document.prototype, 'visibilityState', { get: () => v, configurable: true });
  Object.defineProperty(Document.prototype, 'hidden', { get: () => v !== 'visible', configurable: true });
  window.__roofVis = (to) => { if (to === v) return; v = to; document.dispatchEvent(new Event('visibilitychange')); };
};
export const hide = (p) => p.evaluate(() => window.__roofVis?.('hidden'));
export const show = (p) => p.evaluate(() => window.__roofVis?.('visible'));
// A Home Screen phone: navigator.standalone and display-mode: standalone (as homelink.mjs and lib.mjs hubPhone)
export const STANDALONE = () => {
  Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } : mm(q));
};

// A phone at the hub: an iPhone (390×844 unless said), its weather stood in for, its page errors and console errors
// noted (errs), every page it opens noted (pages), the noting script above in every document, and the visibility ours.
// o: { cookies: { name: value } on .ifl.test, standalone, width, height, scheme ('light'|'dark'), sw ('allow'|'block'),
//      zone, path (where it opens; none: it opens nothing), clock (Playwright's clock installed and left running) }
export async function phone(name, o = {}) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: o.width || 390, height: o.height || 844 }, screen: { width: o.width || 390, height: o.height || 844 }, deviceScaleFactor: 2,
    isMobile: ENGINE === 'chromium' && (o.width || 390) < 700, hasTouch: true, timezoneId: o.zone || 'Europe/London', locale: 'en-GB', serviceWorkers: o.sw || 'allow',
    colorScheme: o.scheme || 'light', userAgent: (o.width || 390) < 700 ? IPHONE : undefined });
  await dress(ctx, name, o);
  const pages = []; ctx.on('page', (pg) => pages.push(pg));
  const p = await ctx.newPage();
  const ph = { name, ctx, p, pages, errs: ctx.__errs };
  if (o.path) await p.goto(HUB + o.path);
  return ph;
}
// (what phone() puts on a context, for a persistent one too)
export async function dress(ctx, name, o = {}) {
  const errs = (ctx.__errs = []);
  if (o.cookies && Object.keys(o.cookies).length) await ctx.addCookies(Object.entries(o.cookies).map(([k, v]) => ({ name: k, value: String(v), domain: '.ifl.test', path: '/', httpOnly: k === 'account', sameSite: 'Lax' })));
  await ctx.grantPermissions(['notifications'], { origin: HUB }).catch(() => {});
  await ctx.addInitScript(NOTING);
  await ctx.addInitScript(VISIBILITY);
  if (o.standalone) await ctx.addInitScript(STANDALONE);
  if (o.clock) { await ctx.clock.install(); await ctx.clock.resume(); }
  await standIns(ctx);
  const watch = (pg) => {
    pg.on('pageerror', (e) => errs.push(`${name} ${short(pg.url())}: ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push(`${name} ${short(pg.url())}: ${m.text().slice(0, 300)}`); });
    pg.on('dialog', (d) => d.dismiss().catch(() => {}));
  };
  ctx.on('page', watch); for (const pg of ctx.pages()) watch(pg);
  return ctx;
}
const short = (u) => { try { const x = new URL(u); return x.host === 'ifl.test:8788' ? x.pathname + x.hash : x.host + x.pathname; } catch (_) { return u; } };

// ---- an account, made at the tests' sign-in page (its cookie covers ifl.test: Today's session at the hub is it) ----
export async function account(name, handle) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const b64u = (u) => Buffer.from(u).toString('base64url');
  const r = await signupAt('auth.ifl.test', '/api/account/signup', { name, handle, email: `${handle}@example.com`, salt: b64u(randomBytes(16)), proof: b64u(randomBytes(32)),
    vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: `10.0.${randomBytes(1)[0]}.${(randomBytes(1)[0] % 250) + 1}` });
  if (!(r.s === 201 && r.cookie)) return { status: r.s, json: r.j, cookies: null };
  const [k, v] = r.cookie.split('=');
  return { status: r.s, json: r.j, cookies: { [k]: v }, cookie: r.cookie };
}
// A request as a browser would make it at one of the tests' addresses (the hub at its Worker, every other at the site),
// with that Host. → { status, headers, text, json, cookies }
export function hostCall(host, path, body, { method, cookie, ip, headers = {} } = {}) {
  const port = host === 'ifl.test:8788' ? 8787 : host === 'email.ifl.test:8788' ? 8806 : Number(host.split(':')[1] || 8788);
  const data = body === undefined ? null : JSON.stringify(body);
  const h = { Host: host, ...(cookie ? { Cookie: cookie } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}), ...(data != null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Origin: `http://${host}` } : {}), ...headers };
  return new Promise((done, no) => {
    const q = http.request({ host: '127.0.0.1', port, path, method: method || (data != null ? 'POST' : 'GET'), agent: false, headers: h }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { const text = Buffer.concat(parts).toString(); let json = null; try { json = JSON.parse(text); } catch (_) {}
        const sc = res.headers['set-cookie']; done({ status: res.statusCode, headers: res.headers, text, json, cookies: Array.isArray(sc) ? sc : sc ? [sc] : [] }); });
    });
    q.on('error', no); q.end(data ?? undefined);
  });
}
// A request from the page itself: same origin, its cookie (Weather's own routes at the hub: /api/weather/…)
export const pageCall = (p, method, path, body) => p.evaluate(async ({ method, path, body }) => {
  const h = { Accept: 'application/json' };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (method !== 'GET' && !/^\/api\/(pigeon|weather|fitness|markets)\//.test(path)) h['X-Inflite'] = '1';
  try { const r = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (_) {} return { s: r.status, j }; }
  catch (e) { return { s: 0, j: { error: String(e) } }; }
}, { method, path, body });

// ---- one document, and the documents fetched ----
export async function alive(p) {
  const mark = randomBytes(8).toString('hex');
  await p.evaluate((m) => { window.__roofAlive = m; }, mark);
  return { mark, same: () => p.evaluate((m) => window.__roofAlive === m, mark).catch(() => false) };
}
// (main-frame navigations that fetched a document; a same-document one, pushState or a hash, fetches none)
export function loads(p) {
  const list = [];
  const on = (r) => { if (r.isNavigationRequest() && r.frame() === p.mainFrame()) list.push(r.url()); };
  p.on('request', on);
  return { list, n: () => list.length, reset: () => { list.length = 0; }, stop: () => p.off('request', on) };
}
export const history = (p) => p.evaluate(() => (window.__roofHist || []).slice()).catch(() => []);
export const said = (p) => p.evaluate(() => (window.__roofSaid || []).slice()).catch(() => []);
export const cspOf = (p) => p.evaluate(() => (window.__roofCsp || []).slice()).catch(() => []);
export const here = (p) => { const u = new URL(p.url()); return u.pathname + u.search + u.hash; };
// (shown: in the document, laid out and not hidden by the hidden attribute or inert screens)
export const shown = (p, sel, ms = 15000) => p.waitForSelector(sel, { state: 'visible', timeout: ms }).then(() => true, () => false);
export const gone = (p, sel, ms = 8000) => p.waitForSelector(sel, { state: 'hidden', timeout: ms }).then(() => true, () => false);
export const textOf = (p, sel) => p.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? null, sel).catch(() => null);
export const attrOf = (p, sel, a) => p.evaluate(([s, a]) => document.querySelector(s)?.getAttribute(a) ?? null, [sel, a]).catch(() => null);
export const count = (p, sel) => p.evaluate((s) => document.querySelectorAll(s).length, sel).catch(() => 0);
// (everything the site keeps on this phone: localStorage and sessionStorage, key → value)
export const storage = (p) => p.evaluate(() => {
  const o = { local: {}, session: {} };
  for (const [n, st] of [['local', localStorage], ['session', sessionStorage]]) for (let i = 0; i < st.length; i++) { const k = st.key(i); o[n][k] = st.getItem(k); }
  return o;
}).catch(() => ({ local: {}, session: {} }));
// (what changed between two storage(p)s: keys added or changed, keys removed)
export function changed(a, b) {
  const out = { added: [], changed: [], removed: [] };
  for (const n of ['local', 'session']) {
    for (const [k, v] of Object.entries(b[n])) { if (!(k in a[n])) out.added.push(`${n}:${k}`); else if (a[n][k] !== v) out.changed.push(`${n}:${k}`); }
    for (const k of Object.keys(a[n])) if (!(k in b[n])) out.removed.push(`${n}:${k}`);
  }
  return out;
}
export async function axe(p, label) {
  await p.evaluate(AXE);
  return p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ').slice(0, 160)}`)).catch((e) => [`axe failed (${label}): ${e.message}`]);
}

// ---- the budget meter (§7.3): Weather's same-origin scripts and styles, as sent, their gzip sizes ----
// A file sent unminified because its minified copy is out of date (until integration runs minify.mjs) is measured as
// minify.mjs would send it (esbuild, its options), so the budget is the shipped one; such files are listed (unminified).
// The radar stack and the rain files (lazy, D2) are counted apart (lazy).
const LAZY = /^\/weather\/(?:radar|radarmix|radarwork|mapstyle|mapgl|mapleaf|rainmap|radarrain)\.js$|^\/weather\/vendor\//;
let esb = null;
const esbuild = () => (esb ||= createRequire(`${HERE}package.json`)('esbuild'));
export const sha = (buf) => createHash('sha256').update(buf).digest('hex');
let manifest = null;
const minManifest = () => (manifest ||= (() => { try { return JSON.parse(readFileSync(`${ROOT}/min/manifest.json`, 'utf8')); } catch (_) { return {}; } })());
// (is the minified copy of a file current, and what is it: { fresh, min } — fresh: its original's fingerprint matches)
export function minOf(path) {
  const rel = path.replace(/^\//, ''), want = minManifest()[rel];
  let src = null; try { src = readFileSync(`${ROOT}/${rel}`); } catch (_) { return { fresh: false, min: null, src: null }; }
  const fresh = !!want && want === sha(src);
  let min = null; if (fresh) try { min = readFileSync(`${ROOT}/min/${rel}`, 'utf8'); } catch (_) {}
  return { fresh: fresh && min != null, min, src: src.toString() };
}
export function meter(p) {
  const rows = [], jobs = [];
  const on = (res) => {
    let u; try { u = new URL(res.url()); } catch (_) { return; }
    if (u.origin !== HUB || !/^\/weather\/.*\.(?:js|css)$/.test(u.pathname) || u.pathname === '/weather/sw.js') return;
    jobs.push((async () => {
      const req = res.request(), body = await res.body().catch(() => null);
      const text = body ? body.toString() : '';
      const m = minOf(u.pathname);
      const isMin = m.fresh && text === m.min;
      let gz = body ? gzipSync(body).length : 0, unminified = false;
      if (body && !isMin && res.status() === 200) {
        unminified = true;
        try { gz = gzipSync(Buffer.from(esbuild().transformSync(text, { loader: u.pathname.endsWith('.css') ? 'css' : 'js', minifyWhitespace: true, minifySyntax: true, legalComments: 'none', charset: 'utf8' }).code)).length; } catch (_) {}
      }
      rows.push({ path: u.pathname, query: u.search, status: res.status(), kind: u.pathname.endsWith('.css') ? 'css' : 'js', gz, lazy: LAZY.test(u.pathname), minified: isMin, fresh: m.fresh, unminified,
        cookie: !!(await req.allHeaders().catch(() => ({})))?.cookie });
    })());
  };
  p.on('response', on);
  return {
    rows,
    stop: () => p.off('response', on),
    async report() {
      await Promise.all(jobs);
      const first = rows.filter((r) => !r.lazy);
      const sum = (k) => first.filter((r) => r.kind === k).reduce((a, r) => a + r.gz, 0);
      return { requests: first.length, js: sum('js'), css: sum('css'), lazy: rows.filter((r) => r.lazy).map((r) => r.path), unminified: first.filter((r) => r.unminified).map((r) => r.path), rows: first };
    },
  };
}

// ---- Weather's own numbers, read from its files (connector.files, BUILD) ----
export function connectorFiles() {
  const src = readFileSync(`${ROOT}/weather/roof/connector.js`, 'utf8');
  const m = /files:\s*\[([\s\S]*?)\]/.exec(src);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}
export const moduleBuild = () => /^export const BUILD = "([^"]+)";/m.exec(readFileSync(`${ROOT}/weather/roof/weather.js`, 'utf8'))?.[1] || null;

// ---- Weather's third parties, stood in for in the browser (as wxhub.mjs does) ----
// Places the stand-ins know: the geocoder's "Find a place" answers and the reverse lookup's names
export const PLACES = {
  London: { name: 'London', region: 'England', lat: 51.5072, lon: -0.1276 },
  Bristol: { name: 'Bristol', region: 'England', lat: 51.4545, lon: -2.5879 },
  York: { name: 'York', region: 'England', lat: 53.959, lon: -1.0815 },
  Cromer: { name: 'Cromer', region: 'England', lat: 52.9311, lon: 1.2985 },
  Leeds: { name: 'Leeds', region: 'England', lat: 53.801, lon: -1.549 },
  Paris: { name: 'Paris', region: 'Île-de-France', lat: 48.8566, lon: 2.3522 },
};
const nearest = (lat, lon) => Object.values(PLACES).reduce((a, x) => (Math.hypot(x.lat - lat, x.lon - lon) < Math.hypot(a.lat - lat, a.lon - lon) ? x : a));
export async function standIns(ctx, { now = Date.now() } = {}) {
  const j = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o), headers: { 'Access-Control-Allow-Origin': '*' } });
  await ctx.route(/open-meteo\.com|bigdatacloud|nominatim\.openstreetmap\.org/, (r) => {
    const u = new URL(r.request().url());
    if (u.host.includes('ensemble-api')) return j(r, F.ensemble(now, { rainIn: 90 }));
    if (u.host.includes('air-quality')) return j(r, F.air(now));
    if (u.host.includes('marine-api')) return j(r, F.marine(now, u.href));
    if (u.host.includes('archive-api')) return j(r, F.archive(now));
    if (u.host.includes('geocoding')) {
      const q = (u.searchParams.get('name') || '').toLowerCase();
      return j(r, { results: Object.values(PLACES).filter((x) => q && x.name.toLowerCase().startsWith(q)).map((x, i) => ({ id: 100 + i, name: x.name, latitude: x.lat, longitude: x.lon, country_code: x.name === 'Paris' ? 'FR' : 'GB', country: x.name === 'Paris' ? 'France' : 'United Kingdom', admin1: x.region, timezone: x.name === 'Paris' ? 'Europe/Paris' : 'Europe/London' })) });
    }
    if (u.host.includes('bigdatacloud')) { const x = nearest(+u.searchParams.get('latitude') || 51.5, +u.searchParams.get('longitude') || 0); return j(r, { city: x.name, locality: x.name, principalSubdivision: x.region, countryCode: x.name === 'Paris' ? 'FR' : 'GB', countryName: x.name === 'Paris' ? 'France' : 'United Kingdom' }); }
    if (u.host.includes('nominatim')) { const x = nearest(+u.searchParams.get('lat') || 51.5, +u.searchParams.get('lon') || 0); return j(r, { address: { city: x.name, state: x.region, country_code: 'gb' }, name: x.name, display_name: `${x.name}, ${x.region}` }); }
    if (u.host.includes('previous-runs-api') || u.search.includes('past_hours') || u.search.includes('forecast_minutely_15=9') || u.search.includes('hourly=precipitation%2Csnowfall') || u.search.includes('hourly=temperature_2m%2Cwind')) return r.fulfill({ status: 503, body: '' });
    if (u.search.includes('models=')) return j(r, F.models(now, { rainIn: 90 }));
    return j(r, F.forecast(now, { rainIn: 90 }));
  });
  await ctx.route(/api\.rainviewer\.com/, (r) => j(r, { host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, k) => ({ time: Math.floor(now / 600e3) * 600 - (12 - k) * 600, path: `/v2/radar/f${k}` })), nowcast: [] } }));
  await ctx.route(/tilecache\.rainviewer\.com|tile\.openstreetmap\.org|aviationweather|meteoalarm/, (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG }));
  await ctx.route(/tiles\.openfreemap\.org/, (r) => {
    const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*' };
    if (/\/planet$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 }) });
    return r.fulfill({ status: 200, contentType: /\.png$/.test(u) ? 'image/png' : 'application/x-protobuf', headers: cors, body: /\.png$/.test(u) ? PNG : Buffer.alloc(0) });
  });
}

// ---- the site's own stand-ins on :8794: the forecast for Today's card, and the official warnings ----
// (the UK's feed: two in force over London, one over Bristol (mocks/wxwarnings.mjs); France's feed down, so a place
// there has no official warnings at all: the server says it can't tell (502) and Weather has wx.official null)
export function wxServer({ port = 8794 } = {}) {
  const asked = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    asked.push(u.pathname);
    try {
      if (u.pathname === '/v1/forecast') {
        const n = (u.searchParams.get('latitude') || '').split(',').length, f = F.forecast(Date.now(), { rainIn: 90 });
        return send(n > 1 ? Array(n).fill(f) : f);
      }
      if (u.pathname === '/api/v1/warnings/feeds-united-kingdom') return send(OW.ukFeed(Date.now(), {}));
      if (u.pathname === '/api/v1/warnings/feeds-france') { res.writeHead(503); return res.end(); }
      if (u.pathname.startsWith('/api/v1/warnings/feeds-')) return send({ warnings: [] });
      if (u.pathname === '/flood-monitoring/id/floods') return send({ items: [] });
      if (u.pathname === '/alerts/active') { res.writeHead(400); return res.end('{"title":"out of bounds"}'); }
      if (u.pathname === '/api/data/stationinfo') return send([]);
    } catch (e) { res.writeHead(500); return res.end(); }
    res.writeHead(404); res.end();
  });
  srv.listen(port, '127.0.0.1');
  return { asked, close: () => srv.close() };
}

// ---- Weather's own address: nothing of a /weather/ boot under the roof goes there (D13, D23) ----
export function ownGuard(ctx) {
  const hits = [];
  const note = (what) => (r) => { try { if (new URL(r.url()).origin === OWN) hits.push(`${what} ${r.url()}`); } catch (_) {} };
  ctx.on('request', note('request'));
  const watch = (pg) => pg.on('framenavigated', (f) => { try { if (new URL(f.url()).origin === OWN) hits.push(`navigated ${f.url()}`); } catch (_) {} });
  ctx.on('page', watch); for (const pg of ctx.pages()) watch(pg);
  return { hits, async opened() { const out = []; for (const pg of ctx.pages()) out.push(...(await pg.evaluate(() => window.__opened || []).catch(() => []))); return out.filter((u) => /weather\.(ifl\.test|inflite\.ai)/.test(u)); } };
}

// ---- the hub's request log (hubstack.mjs: each pass-through notes every request, without cookie values) ----
export const passed = (S, since = 0) => { try { return readFileSync(`${S}/hostpass.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.at >= since); } catch (_) { return []; } };
export const WEATHER_PORT = 8802;

// ---- Chat's engine stood in for (as wxhub.mjs): its share noted as window.__shared on the page, and said as sent the
// way Chat's engine says it (IFL.hub.sent: "Sent to Pat. You're still here") ----
export async function engine(ctx) {
  await ctx.route(/^http:\/\/ifl\.test:8788\/chats\/\?engine=1$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><title>Chats</title><script src="/__roof-engine.js"></script>` }));
  await ctx.route(/^http:\/\/ifl\.test:8788\/__roof-engine\.js$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `window.IFLChat = { state: "ready",
    share(words, packed, o) { parent.__shared = { words, packed, to: (o && o.to) || null }; setTimeout(() => parent.IFL && parent.IFL.hub.sent("Sent to Pat"), 50); return Promise.resolve({ sent: true, to: "Pat" }); },
    sendTo: () => Promise.resolve({ ok: false }), waiting: async () => [], since: async () => [], refresh: async () => {}, signOut: async () => {} };
    parent.dispatchEvent(new Event("ifl-chat-ready"));` }));
}

// ---- Weather's account data at the hub, set from the page (Weather's own route, the cookie) ----
export async function weatherAccount(p, { places = [], settings = {}, notify } = {}) {
  const r = await pageCall(p, 'GET', '/api/weather/me');
  const data = { ...(r.j?.data || {}), places, settings: { ...(r.j?.data?.settings || {}), ...settings }, ...(notify ? { notify } : {}) };
  return pageCall(p, 'PUT', '/api/weather/me', { base: r.j?.ver || 0, data });
}
// (a place's date in its own zone, n days on: the forecast's days for London are UTC days, wxappdata.mjs)
export const dayKey = (n, now = Date.now()) => new Date(now + n * 864e5).toISOString().slice(0, 10);

// ---- a notification tapped: the root worker's own notificationclick, with the data a push carries (as hubpush.mjs
// does: the tap is the phone's, the rest is the worker's) → 'done' or what went wrong ----
export async function rootWorker(ctx, ms = 20000) {
  return until(() => ctx.serviceWorkers().find((w) => w.url() === `${HUB}/sw.js`) || null, ms);
}
export async function tapNotification(ctx, data) {
  const sw = await rootWorker(ctx);
  if (!sw) return 'no worker';
  return sw.evaluate(async (data) => {
    const ev = new Event('notificationclick');
    Object.defineProperty(ev, 'notification', { value: { data, close() {} } });
    let job = null; ev.waitUntil = (p) => { job = p; };
    self.dispatchEvent(ev);
    try { await job; return 'done'; } catch (e) { return `refused: ${e?.message || e}`; }
  }, data).catch((e) => `error ${e.message}`);
}

// ---- PNG pixels (8-bit RGBA or RGB, non-interlaced: what Chromium's screenshots are), for comparing two renderings ----
import { inflateSync } from 'node:zlib';
export function pngPixels(buf) {
  let o = 8, w = 0, h = 0, type = 6; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      line[x] = (line[x] + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0)) & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) px[(y * w + x) * 4 + k] = k < bpp ? line[x * bpp + k] : 255;
    prev = line;
  }
  return { w, h, px };
}
// (how alike two screenshots are: same size, and the share of pixels whose channels all lie within tol of each other)
export function alike(a, b, tol = 16) {
  const x = pngPixels(a), y = pngPixels(b);
  if (x.w !== y.w || x.h !== y.h) return { same: 0, size: `${x.w}×${x.h} vs ${y.w}×${y.h}` };
  let near = 0;
  for (let i = 0; i < x.px.length; i += 4) if (Math.abs(x.px[i] - y.px[i]) <= tol && Math.abs(x.px[i + 1] - y.px[i + 1]) <= tol && Math.abs(x.px[i + 2] - y.px[i + 2]) <= tol) near++;
  return { same: near / (x.w * x.h), size: `${x.w}×${x.h}` };
}
