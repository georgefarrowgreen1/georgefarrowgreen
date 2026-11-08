// Mail's body boundary (One roof stage 4, s4/spec §3.2–3.4, §3.6; the inflite repo's email/, where it's checked out
// beside this one). A message's body is never on InFlite's page: each is a frame of Mail's shell at email.inflite.ai/body/,
// which fetches the message itself and draws it with scripts off.
//   The route (email/src/body.js): /body/ only, with its own headers, framed only by the hub origins switched on (the
//   same list written into the page as data-parents), 404 with none; its script and style kept a year at ?v=<BUILD>;
//   /body, /body/index.html and anything else under /body/ 404.
//   The shell (email/public/body/body.js): the inner frame's sandbox exactly as in production (never allow-scripts), the
//   meta policies, <base target="_blank">, Mail's own drawing moved as it is; posts only to parent at p, and only if p
//   is in data-parents; hears only parent at p; a 401 says so in 64 px; the text path draws as Mail's messageBody does.
//   The parent half (email/public/roof/bodyframe.js), with a made-up window: the frame as §3.2 builds it; a message from
//   another origin, another window, another frame or of another shape changes nothing; each field checked; the 6 s rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IFL, mailSkip } from './fixtures/roof.mjs';

const EMAIL = IFL && new URL('email/', IFL);
const PUB = EMAIL && new URL('public/', EMAIL);
const skip = !IFL ? 'the inflite repo isn’t beside this one'
  : !existsSync(new URL('src/body.js', EMAIL)) || !existsSync(new URL('body/body.js', PUB)) ? 'the inflite repo beside has no body shell yet (email/src/body.js): from before One roof stage 4'
  : false;
const frameSkip = skip || mailSkip;
const read = (rel) => readFileSync(new URL(rel, PUB), 'utf8');
const APP = skip ? '' : read('app.js');
const SHELL_JS = skip ? '' : read('body/body.js');
const BUILD = skip ? null : /\n\s*const BUILD = "([\d.]+)";/.exec(APP)[1];

// ---- the route ----
const route = skip ? null : await import(new URL('src/body.js', EMAIL).href);
const gate = skip ? null : await import(new URL('src/hubgate.js', EMAIL).href);
// (MW's gate filters HUB_ORIGIN by the switches; B0's stub answers none, so the cases through it wait for MW's)
const gateReal = !skip && (await gate.hubOrigins({ HUB_ORIGIN: 'https://inflite.ai https://next.inflite.ai', HUB_API: '1' })).includes('https://inflite.ai');
const gateSkip = skip || (!gateReal && 'hubgate.js is still B0’s stub (hubOrigins answers none until MW’s gate is merged)');

// (Mail's files, as the Worker's ASSETS binding answers them: index.html for a folder, each with its type, as Cloudflare's
// assets do. missing: paths taken as left out of the deploy; spa: a missing file answered 200 with Mail's own index.html,
// as wrangler.jsonc's not_found_handling "single-page-application" does; fail: paths whose fetch throws; type: a type
// to give a path instead of its own)
const TYPES = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css; charset=utf-8' };
function assets({ missing = [], spa = false, fail = [], type = {} } = {}) {
  const asked = [];
  return {
    asked,
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      asked.push(`${req.method} ${path}`);
      if (fail.includes(path)) throw new Error('assets down');
      let file = path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
      if (missing.includes(path) || !existsSync(new URL(file, PUB))) {
        if (!spa) return new Response('Not found', { status: 404 });
        file = 'index.html';
      }
      const headers = { 'Content-Type': path in type ? type[path] : TYPES[file.split('.').pop()] || 'text/plain', 'Content-Security-Policy': "frame-ancestors 'none'", ETag: '"x"' };
      return new Response(readFileSync(new URL(file, PUB)), { headers });
    },
  };
}
const HUBS = ['https://inflite.ai', 'http://ifl.test:8788'];
const req = (path, method = 'GET') => new Request(`https://email.inflite.ai${path}`, { method });
const SHELL_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; font-src data: https:; media-src https:; connect-src 'self'; frame-src 'self' about:; base-uri 'none'; form-action 'none'; object-src 'none'";

test('/body/: the shell with its own headers exactly, framed only by the hub origins switched on, the same list written in as data-parents', { skip }, async () => {
  for (const origins of [HUBS, ['https://next.inflite.ai']]) {
    const ASSETS = assets();
    const res = await route.serveBody(req('/body/'), { ASSETS }, origins);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.fromEntries(res.headers), {
      'content-security-policy': `${SHELL_CSP}; frame-ancestors ${origins.join(' ')}`,
      'content-type': 'text/html; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cross-origin-resource-policy': 'same-site',
      'cache-control': 'private, max-age=300',
      'strict-transport-security': 'max-age=63072000; includeSubDomains',
    }, 'no X-Frame-Options, no second policy, nothing of the files’ own');
    const html = await res.text();
    assert.match(html, new RegExp(`<html lang="en-GB" data-parents="${origins.join(' ').replace(/[.]/g, '\\.')}">`));
    assert.ok(html.includes(`src="/body/body.js?v=${BUILD}"`) && html.includes(`href="/body/body.css?v=${BUILD}"`), `?v=${BUILD} on its script and style`);
    assert.ok(!html.includes('?v=0') && !/<script>|<style>|\son\w+=|style="/.test(html), 'nothing inline');
    // (the shell, and Mail's build read once per deployment)
    assert.equal(ASSETS.asked[0], 'GET /body/');
    assert.ok(ASSETS.asked.every((a) => a === 'GET /body/' || a === 'GET /app.js'), ASSETS.asked.join());
  }
  assert.equal(route.BODY_CSP_BASE, SHELL_CSP);
  // (HEAD: the same headers, no body)
  const head = await route.serveBody(req('/body/', 'HEAD'), { ASSETS: assets() }, HUBS);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'private, max-age=300');
  assert.equal(await head.text(), '');
});

test('/body/ with no hub origin switched on, or none that is one: 404', { skip }, async () => {
  for (const origins of [[], null, undefined, ['*'], ["'self'"], ['https://inflite.ai/'], ['https://inflite.ai; script-src *'], [42]]) {
    const ASSETS = assets();
    const res = await route.serveBody(req('/body/'), { ASSETS }, origins);
    assert.equal(res.status, 404, JSON.stringify(origins));
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(ASSETS.asked, [], 'the files never asked');
  }
  // (a mix: only the real ones)
  const res = await route.serveBody(req('/body/'), { ASSETS: assets() }, ['https://inflite.ai', '*', 'https://inflite.ai; x']);
  assert.match(res.headers.get('content-security-policy'), /; frame-ancestors https:\/\/inflite\.ai$/);
});

test('/body, /body/index.html, /body/x, a file without ?v=, any other method: 404; body.js and body.css at ?v= kept a year', { skip }, async () => {
  for (const [path, method] of [['/body', 'GET'], ['/body/index.html', 'GET'], ['/body/x', 'GET'], ['/body/x/', 'GET'], ['/body/body.js', 'GET'], ['/body/body.css', 'GET'],
    ['/body/body.js?v=', 'GET'], ['/body/body.js?v=1&x=2', 'GET'], ['/body/body.js?v=<x>', 'GET'], ['/body/index.html?v=1.48', 'GET'], ['/body/sw.js?v=1', 'GET'],
    ['/body/', 'POST'], ['/body/', 'PUT'], ['/body/', 'DELETE'], ['/body/', 'OPTIONS'], ['/body/body.js?v=1.48', 'POST']]) {
    const res = await route.serveBody(req(path, method), { ASSETS: assets() }, HUBS);
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  for (const [file, type] of [['body.js', 'text/javascript; charset=utf-8'], ['body.css', 'text/css; charset=utf-8']]) {
    const res = await route.serveBody(req(`/body/${file}?v=${BUILD}`), { ASSETS: assets() }, HUBS);
    assert.equal(res.status, 200, file);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(res.headers.get('content-type'), type);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await res.text(), read(`body/${file}`));
  }
});

test('a shell file left out of the deploy is never Mail’s own page under the shell’s name (single-page-application): 404', { skip }, async () => {
  const mailPage = read('index.html');
  assert.ok(!/data-parents=""/.test(mailPage), 'Mail’s own page has no shell mark');
  const gone = { missing: ['/body/', '/body/body.js', '/body/body.css'], spa: true };
  for (const path of ['/body/', `/body/body.js?v=${BUILD}`, `/body/body.css?v=${BUILD}`]) {
    const ASSETS = assets(gone);
    const res = await route.serveBody(req(path), { ASSETS }, HUBS);
    assert.equal(res.status, 404, path);
    assert.ok(!(await res.text()).includes('app.js'), `${path}: none of Mail’s page`);
    // (the fake really answered Mail's page: what the Worker refused)
    assert.equal((await ASSETS.fetch(req(new URL(path, 'https://x').pathname))).headers.get('content-type'), TYPES.html);
  }
  // (a file that comes back as HTML, or as the wrong kind, is refused too; JavaScript under either of its names is fine)
  for (const [path, type, status] of [['/body/body.js', 'text/html', 404], ['/body/body.js', 'text/css', 404], ['/body/body.css', 'text/javascript', 404], ['/body/body.css', 'text/html; charset=utf-8', 404],
    ['/body/body.js', '', 404], ['/body/body.js', 'text/javascript; charset=utf-8', 200], ['/body/body.js', 'application/javascript', 200], ['/body/body.css', 'text/css', 200]]) {
    const res = await route.serveBody(req(`${path}?v=${BUILD}`), { ASSETS: assets({ type: { [path]: type } }) }, HUBS);
    assert.equal(res.status, status, `${path} as ${type || 'nothing'}`);
  }
});

test('Mail’s build unread (assets failing for /app.js): never ?v=0 and never kept; the deployment’s id stands in, read again next time', { skip }, async () => {
  const BODY_ID = 'b0d1e5a7-3f0e-4c2b-9a1d-6e5f4c3b2a10';
  for (const env of [{ BUILD_ID: 'deploy-7f3a' }, { CF_VERSION_METADATA: { id: BODY_ID } }]) {
    const down = assets({ fail: ['/app.js'] });
    const res = await route.serveBody(req('/body/'), { ...env, ASSETS: down }, HUBS);
    assert.equal(res.status, 200);
    const html = await res.text();
    const v = /src="\/body\/body\.js\?v=([^"]+)"/.exec(html)?.[1];
    assert.ok(v && v !== '0' && !html.includes('?v=0') && v !== BUILD, `the stand-in: ${v}`);
    assert.ok(v.includes(String(env.BUILD_ID || BODY_ID).replace(/-/g, '').slice(0, 20)), `the deployment's id: ${v}`);
    assert.ok(html.includes(`href="/body/body.css?v=${v}"`));
    // (an address the files answer at, kept a year: this deployment's alone)
    assert.equal((await route.serveBody(req(`/body/body.js?v=${v}`), { ASSETS: assets() }, HUBS)).status, 200, v);
    // (the next asks again, and then keeps what it read)
    const up = assets();
    const again = await (await route.serveBody(req('/body/'), { ...env, ASSETS: up }, HUBS)).text();
    assert.ok(again.includes(`src="/body/body.js?v=${BUILD}"`) && up.asked.includes('GET /app.js'), 'read again once it can be');
    const kept = assets();
    await route.serveBody(req('/body/'), { ...env, ASSETS: kept }, HUBS);
    assert.deepEqual(kept.asked, ['GET /body/'], 'then kept for the deployment');
  }
  // (an app.js without its BUILD line is the same as none)
  const odd = { fetch: async (q) => (new URL(q.url).pathname === '/app.js' ? new Response('// no build', { headers: { 'Content-Type': TYPES.js } }) : assets().fetch(q)) };
  const oddHtml = await (await route.serveBody(req('/body/'), { BUILD_ID: 'deploy-odd', ASSETS: odd }, HUBS)).text();
  assert.ok(!oddHtml.includes('?v=0') && oddHtml.includes('?v=ddeployodd'), 'no BUILD line: the deployment’s id');
  // (no deployment id at all, as under wrangler dev with nothing kept yet: an address used once, each time)
  const fresh = await import(`${new URL('src/body.js', EMAIL).href}?unread=${Date.now()}`);
  const vs = [];
  for (let i = 0; i < 2; i++) {
    const html = await (await fresh.serveBody(req('/body/'), { ASSETS: assets({ fail: ['/app.js'] }) }, HUBS)).text();
    vs.push(/src="\/body\/body\.js\?v=([^"]+)"/.exec(html)?.[1]);
  }
  assert.ok(vs.every((v) => v && v !== '0' && /^[\w.-]{1,32}$/.test(v)) && vs[0] !== vs[1], JSON.stringify(vs));
});

test('through Mail’s Worker: every /body path goes to body.js, and /body/ is 404 while no hub switch is on', { skip }, async () => {
  const worker = (await import(new URL('src/index.js', EMAIL).href)).default;
  const call = (path, env) => worker.fetch(req(path), { ASSETS: assets(), ...env }, { waitUntil() {} });
  for (const env of [{}, { HUB_ORIGIN: 'https://inflite.ai https://next.inflite.ai' }, { HUB_ORIGIN: 'https://inflite.ai', HUB_API: '0', HUB_API_NEXT: '0' }])
    for (const path of ['/body/', '/body', '/body/index.html', '/body/body.js?v=1'])
      assert.equal((await call(path, env)).status, path.startsWith('/body/body.js') ? 200 : 404, `${path} ${JSON.stringify(env)}`);
  const wr = readFileSync(new URL('wrangler.jsonc', EMAIL), 'utf8');
  const config = JSON.parse(wr.replace(/^\s*\/\/.*$/gm, ''));
  for (const p of ['/body', '/body/*']) assert.ok(config.assets.run_worker_first === true || config.assets.run_worker_first.includes(p), `Worker runs first for ${p}`);
});

test('through MW’s gate: /body/ framed by exactly hubOrigins(env), and the shell answers those alone', { skip: gateSkip }, async () => {
  const HUB_ORIGIN = 'https://inflite.ai https://next.inflite.ai http://ifl.test:8788';
  for (const sw of [{ HUB_API: '1' }, { HUB_API_NEXT: '1' }, { HUB_API: '1', HUB_API_NEXT: '1', HUB_API_TEST: '1' }, {}]) {
    const env = { ASSETS: assets(), HUB_ORIGIN, ...sw };
    const on = await gate.hubOrigins(env);
    const res = await route.body(req('/body/'), env);
    if (!on.length) { assert.equal(res.status, 404, JSON.stringify(sw)); continue; }
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-security-policy'), `${SHELL_CSP}; frame-ancestors ${on.join(' ')}`);
    assert.ok((await res.text()).includes(`data-parents="${on.join(' ')}"`));
  }
});

// ---- the shell's script ----
// (a const, a function or a regex out of a script by name: its text, as written)
function piece(src, name) {
  const at = new RegExp(String.raw`^([ \t]*)(?:const ${name} =|function ${name}\()`, 'm').exec(src);
  assert.ok(at, `has ${name}`);
  const rest = src.slice(at.index);
  if (rest.trimStart().startsWith('const') && !/=>\s*$|=\s*$/.test(rest.split('\n')[0])) return rest.split('\n')[0].trim();
  const end = rest.indexOf(`\n${at[1]}}`);
  const endConst = rest.search(/;\n/);
  return (rest.trimStart().startsWith('function') ? rest.slice(0, end + at[1].length + 2) : rest.slice(0, endConst + 1)).split('\n').map((l) => l.trim()).join('\n');
}

test('the shell draws as Mail does: its cleaning, quote folding, link and pattern code moved as it is', { skip }, () => {
  for (const name of ['ATTRIBUTION', 'DESIGNED', 'escapeHtml', 'linkify', 'cleanMail', 'foldQuotes'])
    assert.equal(piece(SHELL_JS, name), piece(APP, name), `${name}: as app.js has it`);
  const remote = /const remotePattern = (\/.+\/i);/.exec(APP)[1];
  assert.ok(SHELL_JS.includes(`const REMOTE = ${remote};`), 'the remote-picture pattern');
  const [, cspRemote, cspLocal] = /const csp = allowRemote\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)";/.exec(APP);
  assert.ok(SHELL_JS.includes(`const CSP_REMOTE = "${cspRemote}";`) && SHELL_JS.includes(`const CSP_LOCAL = "${cspLocal}";`), 'the inner meta policies, exactly');
  for (const s of ['<base target="_blank">', '<meta http-equiv="x-dns-prefetch-control" content="off">', '<meta http-equiv="Content-Security-Policy" content="${csp}">'])
    assert.ok(SHELL_JS.includes(s), s);
});

test('the shell’s inner frame: exactly production’s sandbox, never allow-scripts; it posts only to parent at p, hears only parent at p', { skip }, () => {
  const code = SHELL_JS.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(code.includes('const SANDBOX = "allow-same-origin allow-popups allow-popups-to-escape-sandbox";'));
  assert.ok(!/allow-scripts/.test(code), 'never allow-scripts');
  assert.equal(code.match(/setAttribute\("sandbox"/g)?.length, 1);
  assert.match(code, /frame\.setAttribute\("sandbox", SANDBOX\)/);
  assert.match(code, /frame\.setAttribute\("referrerpolicy", "no-referrer"\)/);
  assert.equal(code.match(/postMessage\(/g)?.length, 1, 'one place that posts');
  assert.match(code, /window\.parent\.postMessage\(\{ ifl: "mailbody", v: 1, id: at\.m, \.\.\.fields \}, at\.p\)/);
  assert.match(code, /!parents\.includes\(p\)/);
  assert.match(code, /e\.source !== window\.parent \|\| e\.origin !== at\.p/);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(code), 'no HTML put in but through srcdoc');
  assert.ok(!/["'`]\*["'`]/.test(code), 'never "*"');
});

// ---- the shell, run, with a made-up page around it ----
function el(tag, doc) {
  const e = {
    tag, kids: [], attrs: {}, style: {}, hidden: false, listeners: {}, className: '', textContent: '', srcdoc: '', title: '', parent: null,
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    append(...k) { for (const x of k) { x.parent = this; this.kids.push(x); } }, replaceChildren(...k) { this.kids = []; this.append(...k); },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, fire(t, ev = {}) { for (const f of this.listeners[t] || []) f(ev); },
    getBoundingClientRect() { return { height: this.kids.reduce((n, k) => n + (parseFloat(k.style.height) || 0) + (k.tag === 'p' ? 64 : 0), 0) }; },
    get isConnected() { return true; },
  };
  if (tag === 'iframe') { e.clientWidth = 390; Object.defineProperty(e, 'offsetHeight', { get() { return parseFloat(this.style.height) || 120; } }); }
  return e;
}
const COLOURS = { light: { '--mail-text': '#0d1020', '--mail-link': '#1f63d6', '--mail-quote': 'rgba(20, 24, 44, 0.62)', '--mail-rule': 'rgba(20, 24, 44, 0.22)' },
  dark: { '--mail-text': '#f5f6fb', '--mail-link': '#8cc2ff', '--mail-quote': 'rgba(235, 238, 250, 0.62)', '--mail-rule': 'rgba(235, 238, 250, 0.28)' } };
async function shell({ hash, parents = 'https://inflite.ai http://ifl.test:8788', answer = { status: 200, body: { text: 'Hello\n\nOn Mon, Pat wrote:\n> Hi', html: '' } }, framed = true }) {
  const posts = [], fetched = [], winOn = {}, observers = [];
  let reloads = 0;
  const root = el('html');
  root.setAttribute('data-parents', parents);
  const b = el('div');
  const doc = {
    documentElement: root, getElementById: (id) => (id === 'b' ? b : null), createElement: (t) => el(t), createElementNS: (ns, t) => el(t),
    addEventListener() {},
  };
  const parent = { postMessage: (data, target) => posts.push({ data: JSON.parse(JSON.stringify(data)), target }) };
  const win = {};
  const location = { hash, reload: () => reloads++ };
  Object.assign(win, {
    parent: framed ? parent : win, document: doc, location,
    addEventListener: (t, f) => ((winOn[t] ||= []).push(f)),
    getComputedStyle: () => ({ getPropertyValue: (n) => COLOURS[root.getAttribute('data-t') || 'light'][n] || '' }),
    fetch: async (u) => { fetched.push(u); if (answer.throws) throw new TypeError('Failed to fetch'); return new Response(answer.raw ?? JSON.stringify(answer.body ?? {}), { status: answer.status }); },
    // (as a browser's: its first callback comes as soon as it observes, whatever is there yet)
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; this.on = []; observers.push(this); }
      observe(t) { this.on.push(t); queueMicrotask(() => this.fire()); }
      fire() { if (this.on.length) this.cb(this.on.map((target) => ({ target })), this); }
      disconnect() { this.on = []; }
    },
    URLSearchParams, Date, Math, JSON, String, Object, Array, Number, parseFloat, encodeURIComponent, Promise, Set,
  });
  win.window = win;
  vm.runInNewContext(SHELL_JS, win);
  await new Promise((r) => setTimeout(r, 10));
  const say = (data, { source = parent, origin = 'https://inflite.ai' } = {}) => { for (const f of winOn.message || []) f({ data, source, origin }); };
  const frame = () => b.kids.find((k) => k.tag === 'iframe');
  // (a layout: every observer told its targets' sizes again)
  const relayout = () => observers.forEach((o) => o.fire());
  return { posts, fetched, b, root, say, frame, parent, win, location, relayout, reloads: () => reloads, hashchange: () => (winOn.hashchange || []).forEach((f) => f()) };
}
const H = (o) => new URLSearchParams(o).toString();
const GOOD = { m: 'msg-1', t: 'light', img: '0', p: 'https://inflite.ai' };

test('the shell answers only a parent in data-parents, and only for a strict address', { skip }, async () => {
  for (const hash of [H({ ...GOOD, p: 'https://evil.example' }), H({ ...GOOD, p: 'https://inflite.ai.evil.com' }), H({ ...GOOD, p: 'null' }), H({ ...GOOD, p: '*' }),
    H({ ...GOOD, m: '../x' }), H({ ...GOOD, m: 'a'.repeat(65) }), H({ ...GOOD, t: 'blue' }), H({ ...GOOD, img: 'yes' }), `${H(GOOD)}&x=1`, `${H(GOOD)}&m=other`,
    H({ m: GOOD.m, t: GOOD.t, img: GOOD.img }), '']) {
    const s = await shell({ hash: `#${hash}` });
    assert.deepEqual([s.posts, s.fetched], [[], []], hash);
  }
  // (with no hub switched on, nothing it would answer)
  const none = await shell({ hash: `#${H(GOOD)}`, parents: '' });
  assert.deepEqual([none.posts, none.fetched], [[], []]);
  // (not in a frame: drawn, as Mail would, but nothing posted)
  const top = await shell({ hash: `#${H(GOOD)}`, framed: false });
  assert.deepEqual(top.fetched, ['/api/messages/msg-1']);
  assert.deepEqual(top.posts, []);
});

test('the shell draws a text message in the inner sandbox and tells its parent, at p only, a height and its flags', { skip }, async () => {
  const s = await shell({ hash: `#${H({ ...GOOD, p: 'http://ifl.test:8788' })}` });
  assert.deepEqual(s.fetched, ['/api/messages/msg-1']);
  const f = s.frame();
  assert.equal(f.attrs.sandbox, 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  assert.equal(f.attrs.referrerpolicy, 'no-referrer');
  assert.ok(f.srcdoc.includes(`content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:"`) && f.srcdoc.includes('<base target="_blank">'));
  assert.ok(f.srcdoc.includes('<div class="mail-body">Hello</div>') && f.srcdoc.includes('<div class="mail-body quoted inflite-q">On Mon, Pat wrote:\n<span class="quote">Hi</span></div>'));
  assert.ok(f.srcdoc.includes('color:#0d1020'), 'light colours');
  assert.deepEqual(s.posts, [{ data: { ifl: 'mailbody', v: 1, id: 'msg-1', designed: false, remote: false }, target: 'http://ifl.test:8788' }]);
  // (its inner document loads: quotes found, Show Quoted Text under it, sized, and the height said)
  const listeners = {};
  const inner = {
    body: { getBoundingClientRect: () => ({ bottom: 300 }), style: {}, innerText: 'Hello' },
    documentElement: { scrollHeight: 300, classList: { toggle() {} } },
    defaultView: { getComputedStyle: () => ({ marginBottom: '0px' }) },
    addEventListener: (t, fn) => ((listeners[t] ||= []).push(fn)),
  };
  f.contentDocument = inner;
  f.fire('load');
  const row = s.b.kids.find((k) => k.className === 'quote-row');
  assert.equal(row.hidden, false);
  assert.equal(row.kids[0].kids[1].textContent, 'Show Quoted Text');
  assert.deepEqual(s.posts.slice(1).map((p) => p.data), [{ ifl: 'mailbody', v: 1, id: 'msg-1', quotes: true }, { ifl: 'mailbody', v: 1, id: 'msg-1', h: 300 }]);
  assert.ok(s.posts.every((p) => p.target === 'http://ifl.test:8788'));
  // (an address tapped in it: only the mailto: link goes out, ≤ 2000 characters; a web link is the browser's)
  const click = (href) => { const ev = { prevented: false, preventDefault() { this.prevented = true; }, target: { closest: () => ({ getAttribute: () => href }) } }; listeners.click.forEach((fn) => fn(ev)); return ev.prevented; };
  const before = s.posts.length;
  assert.equal(click('mailto:pat@example.com?subject=Hi'), true);
  assert.equal(click('https://example.com/'), false);
  assert.equal(click(`mailto:${'a'.repeat(2000)}@x.com`), true, 'too long: not opened here, and not sent');
  assert.equal(click('javascript:alert(1)'), false);
  assert.deepEqual(s.posts.slice(before).map((p) => p.data), [{ ifl: 'mailbody', v: 1, id: 'msg-1', mailto: 'mailto:pat@example.com?subject=Hi' }]);
  // (touched: said at most once a second)
  const n = s.posts.length;
  for (let i = 0; i < 5; i++) listeners.pointerdown.forEach((fn) => fn({}));
  assert.deepEqual(s.posts.slice(n).map((p) => p.data), [{ ifl: 'mailbody', v: 1, id: 'msg-1', touched: true }]);
});

test('the shell hears only a theme, only from parent at p; img=1 for this message redraws, another message starts afresh', { skip }, async () => {
  const s = await shell({ hash: `#${H(GOOD)}` });
  const doc0 = s.frame().srcdoc;
  const other = { postMessage() {} };
  for (const [data, from] of [
    [{ ifl: 'mailbody', v: 1, t: 'dark' }, { origin: 'https://evil.example' }],
    [{ ifl: 'mailbody', v: 1, t: 'dark' }, { origin: 'http://ifl.test:8788' }],
    [{ ifl: 'mailbody', v: 1, t: 'dark' }, { source: other }],
    [{ ifl: 'mailbody', v: 1, t: 'dark' }, { source: null }],
    [{ ifl: 'mailbody', v: 2, t: 'dark' }, {}],
    [{ ifl: 'hello', v: 1, t: 'dark' }, {}],
    [Object.assign(Object.create(null), { ifl: 'mailbody', v: 1, t: 'dark' }), {}],
    [[{ ifl: 'mailbody', v: 1, t: 'dark' }], {}],
    ['{"ifl":"mailbody","v":1,"t":"dark"}', {}],
    [{ ifl: 'mailbody', v: 1, t: 'purple' }, {}],
    [{ ifl: 'mailbody', v: 1, t: 'dark', html: '<script>x</script>' }, { origin: 'https://evil.example' }],
  ]) {
    s.say(data, from);
    assert.equal(s.frame().srcdoc, doc0, JSON.stringify([data, from.origin]));
  }
  s.say({ ifl: 'mailbody', v: 1, t: 'dark' });
  assert.notEqual(s.frame().srcdoc, doc0);
  assert.ok(s.frame().srcdoc.includes('color:#f5f6fb') && s.frame().srcdoc.includes('color-scheme:dark'), 'dark colours');
  assert.equal(s.root.getAttribute('data-t'), 'dark');
  // (the parent's new address for this message, img=1: drawn again, no reload; another message, or a bad one: a reload)
  s.location.hash = `#${H({ ...GOOD, t: 'dark', img: '1' })}`;
  s.hashchange();
  assert.equal(s.reloads(), 0);
  s.location.hash = `#${H({ ...GOOD, m: 'msg-2' })}`;
  s.hashchange();
  assert.equal(s.reloads(), 1);
  s.location.hash = `#${H({ ...GOOD, p: 'https://evil.example' })}`;
  s.hashchange();
  assert.equal(s.reloads(), 2);
});

test('signed out of Mail: the shell says “Open Mail to read this” in 64 px, and nothing else; Mail failing: it says nothing (the page covers it)', { skip }, async () => {
  const s = await shell({ hash: `#${H(GOOD)}`, answer: { status: 401, body: { error: 'Sign in to open Mail.', access: 'signin' } } });
  assert.deepEqual(s.posts, [{ data: { ifl: 'mailbody', v: 1, id: 'msg-1', h: 64 }, target: 'https://inflite.ai' }]);
  assert.equal(s.b.kids[0].textContent, 'Open Mail to read this');
  assert.equal(s.frame(), undefined);
  for (const answer of [{ status: 403, body: {} }, { status: 404, body: {} }, { status: 500, body: {} }, { status: 200, raw: 'not json' }, { throws: true }]) {
    const t = await shell({ hash: `#${H(GOOD)}`, answer });
    t.relayout();
    await new Promise((r) => setTimeout(r, 5));
    t.relayout();
    assert.deepEqual([t.posts, t.b.kids], [[], []], JSON.stringify(answer));
  }
});

test('the shell says no height before it has drawn something: its first layout, empty, is not one (the page’s 6 s rule stands)', { skip }, async () => {
  // (a theme from the page before the message has come: still nothing drawn, nothing said)
  const s = await shell({ hash: `#${H(GOOD)}`, answer: { status: 404, body: {} } });
  s.say({ ifl: 'mailbody', v: 1, t: 'dark' });
  s.relayout();
  assert.deepEqual(s.posts, []);
  assert.equal(s.root.getAttribute('data-t'), 'dark');
  // (drawn: from then on, a layout says the height)
  const d = await shell({ hash: `#${H(GOOD)}` });
  assert.ok(d.frame(), 'drawn');
  assert.ok(!d.posts.some((p) => 'h' in p.data), 'nothing said of a height before the frame is there, or by its first empty layout');
  d.frame().style.height = '300px';
  d.relayout();
  assert.deepEqual(d.posts.filter((p) => 'h' in p.data).map((p) => p.data.h), [300]);
  // (the note, signed out: drawn too, so its own layout may say its size)
  const n = await shell({ hash: `#${H(GOOD)}`, answer: { status: 401, body: {} } });
  n.relayout();
  assert.deepEqual(n.posts.map((p) => p.data.h), [64]);
});

// (Mail's own text path, app.js's messageBody, run with a stand-in h(), beside the shell's textParts)
test('text bodies: the shell draws exactly what Mail’s messageBody draws, on fixed inputs', { skip }, () => {
  const fnOf = (src, name) => { const i = src.search(new RegExp(String.raw`^[ \t]*function ${name}\(`, 'm')); const ind = /^[ \t]*/.exec(src.slice(i))[0]; return src.slice(i, src.indexOf(`\n${ind}}\n`, i) + ind.length + 2); };
  const lineOf = (src, name) => new RegExp(String.raw`^[ \t]*const ${name} =[^\n]*(\n[^\n]*\);)?`, 'm').exec(src)[0];
  const app = vm.runInNewContext(`${lineOf(APP, 'escapeHtml')}\n${lineOf(APP, 'ATTRIBUTION')}\n${fnOf(APP, 'linkify')}\n${fnOf(APP, 'messageBody')}\nmessageBody`, {
    h: (tag, props) => ({ tag, ...props }), quoteToggle: () => ({ tag: 'toggle' }), htmlFrame: () => { throw new Error('not the text path'); },
  });
  const ours = vm.runInNewContext(`${lineOf(SHELL_JS, 'escapeHtml')}\n${lineOf(SHELL_JS, 'ATTRIBUTION')}\n${fnOf(SHELL_JS, 'linkify')}\n${fnOf(SHELL_JS, 'textParts')}\ntextParts`, {});
  const inputs = [
    'Hello', '', '   \n  ', 'Shall we meet at noon, by the river?\nhttps://example.com/a?b=1&c=2.\nWrite to pat@example.com.',
    'Thanks!\n\nOn Mon, 3 Nov 2026 at 14:02, Pat <pat@x.com> wrote:\n> Hi\n> there\n>> deeper',
    '> all quoted\n> still', 'Top\r\n> quoted\r\nbottom', '<script>alert(1)</script> & "quotes" \'single\'',
    'Merci\nLe 3 nov. 2026, Pat a écrit :\n> Bonjour', 'Danke\nAm 3. Nov. schrieb Pat:\n> Hallo', 'Hi\n-- Original Message --\n> old',
    'Not a quote: a > b\nOn Mon wrote: nothing after', '\n\n> only after blanks', 'x\n>quoted <b>bold</b> http://a.b/c',
  ];
  const EMPTY = '<span style="color:var(--label-2)">This message has no content.</span>';
  for (const text of inputs) {
    const a = app({ text, html: '' }), o = ours(text);
    if (!Array.isArray(a)) {
      assert.equal(o.quoted, null, JSON.stringify(text));
      assert.equal(o.main, a.html === EMPTY ? '' : a.html, JSON.stringify(text));
    } else {
      assert.equal(a.length, 3);
      assert.deepEqual([o.main, o.quoted], [a[0].html, a[2].html], JSON.stringify(text));
    }
  }
});

// ---- the parent half, with a made-up window ----
let BF = null;
const winOn = {};
const posted = [];
const frames = [];
const observed = [];
let ioCallback = null;
if (!frameSkip) {
  globalThis.location = { protocol: 'https:', host: 'inflite.ai', origin: 'https://inflite.ai' };
  globalThis.window = {
    addEventListener: (t, f) => (winOn[t] ||= new Set()).add(f),
    removeEventListener: (t, f) => winOn[t]?.delete(f),
  };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  globalThis.IntersectionObserver = class { constructor(cb) { ioCallback = cb; } observe(e) { observed.push(e); } unobserve(e) { const i = observed.indexOf(e); if (i >= 0) observed.splice(i, 1); } };
  globalThis.document = {
    createElement: (tag) => {
      const e = el(tag);
      if (tag === 'iframe') {
        e.contentWindow = { postMessage: (data, target) => posted.push({ frame: e, data: JSON.parse(JSON.stringify(data)), target }) };
        e.removed = false;
        e.remove = () => (e.removed = true);
        e.after = (n) => (e.next = n);
        frames.push(e);
      } else e.remove = () => (e.removed = true);
      return e;
    },
    createTextNode: (t) => ({ tag: '#text', textContent: t }),
  };
  BF = await import(new URL('roof/bodyframe.js', PUB).href);
}
const MAILO = 'https://email.inflite.ai';
const sayTo = (data, { origin = MAILO, source } = {}) => { for (const f of winOn.message || []) f({ data, origin, source }); };
const ROWAN = { id: 'msg-1', threadId: 'thr-1', from: { name: 'Rowan Ash', email: 'rowan@example.com' } };

test('bodyFrame builds the frame exactly as §3.2: Mail’s shell at /body/ with the message in the hash, the parent named, nothing else', { skip: frameSkip }, () => {
  assert.equal(BF.STUB, undefined, 'bodyframe.js is MB’s, not the stub');
  for (const bad of [null, {}, { id: '../x' }, { id: 'a'.repeat(65) }, { id: 'a b' }, { id: 42 }, { id: 'x#y' }]) assert.equal(BF.bodyFrame(bad), null, JSON.stringify(bad));
  const f = BF.bodyFrame(ROWAN, { theme: 'dark', eager: true });
  assert.equal(f.el.src, 'https://email.inflite.ai/body/#m=msg-1&t=dark&img=0&p=https%3A%2F%2Finflite.ai');
  assert.equal(f.el.className, 'mail-body');
  assert.deepEqual(f.el.attrs, { sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox', allow: '', referrerpolicy: 'no-referrer', loading: 'eager', title: 'Message from Rowan Ash', height: '120' });
  const g = BF.bodyFrame({ id: 'msg-2', from: { email: 'pat@example.com' } }, { images: true, theme: 'blue' });
  assert.equal(g.el.attrs.loading, 'lazy');
  assert.equal(g.el.attrs.title, 'Message from pat@example.com');
  assert.equal(g.el.src, 'https://email.inflite.ai/body/#m=msg-2&t=light&img=1&p=https%3A%2F%2Finflite.ai');
  f.destroy(); g.destroy();
  assert.ok(f.el.removed && g.el.removed);
});

test('one listener: only Mail’s origin, only a live frame made here, only its own message’s id and shape; each field checked', { skip: frameSkip }, () => {
  const seen = { remote: [], mailto: [], touched: [] };
  const off1 = BF.listenFrames({ remote: () => assert.fail('the first handlers were replaced') });
  const off = BF.listenFrames({ remote: (id, on) => seen.remote.push([id, on]), mailto: (h) => seen.mailto.push(h), touched: (id) => seen.touched.push(id) });
  assert.equal(winOn.message.size, 1, 'one window listener');
  const a = BF.bodyFrame(ROWAN), b = BF.bodyFrame({ id: 'msg-2' });
  const A = a.el.contentWindow, B = b.el.contentWindow;
  const ok = { ifl: 'mailbody', v: 1, id: 'msg-1' };
  // (forged: none of these changes anything)
  for (const [data, from] of [
    [{ ...ok, h: 500, designed: true, remote: true, mailto: 'mailto:a@b.co', touched: true }, { origin: 'https://inflite.ai', source: A }],
    [{ ...ok, h: 500, designed: true, remote: true, mailto: 'mailto:a@b.co', touched: true }, { origin: 'https://evil.example', source: A }],
    [{ ...ok, h: 500, designed: true, remote: true, mailto: 'mailto:a@b.co', touched: true }, { origin: 'null', source: A }],
    [{ ...ok, h: 500, designed: true, remote: true, mailto: 'mailto:a@b.co', touched: true }, { source: { postMessage() {} } }],
    [{ ...ok, h: 500, designed: true, remote: true, mailto: 'mailto:a@b.co', touched: true }, { source: null }],
    [{ ...ok, h: 500, designed: true, remote: true, mailto: 'mailto:a@b.co', touched: true }, { source: B }],
    [{ ...ok, ifl: 'hello', h: 500, remote: true }, { source: A }],
    [{ ...ok, v: 2, h: 500, remote: true }, { source: A }],
    [{ ...ok, id: undefined, h: 500, remote: true }, { source: A }],
    [Object.assign(Object.create(null), { ...ok, h: 500, remote: true }), { source: A }],
    [[ok], { source: A }],
    [JSON.stringify({ ...ok, h: 500, remote: true }), { source: A }],
    [null, { source: A }],
  ]) sayTo(data, from);
  assert.equal(a.el.attrs.height, '120');
  assert.equal(b.el.attrs.height, '120');
  assert.deepEqual(seen, { remote: [], mailto: [], touched: [] });
  assert.ok(!a.el.classList.contains('designed'));
  // (fields out of bounds or of the wrong type: each ignored on its own)
  for (const h of [39, 40001, 500.5, '500', -1, NaN, Infinity, null]) sayTo({ ...ok, h }, { source: A });
  sayTo({ ...ok, designed: 'yes', remote: 1, quotes: 'x', mailto: 'javascript:alert(1)', touched: 1 }, { source: A });
  sayTo({ ...ok, mailto: `mailto:${'a'.repeat(1994)}` }, { source: A });
  sayTo({ ...ok, mailto: ['mailto:a@b.co'] }, { source: A });
  assert.equal(a.el.attrs.height, '120');
  assert.deepEqual(seen, { remote: [], mailto: [], touched: [] });
  // (the real thing: each field as it should be)
  sayTo({ ...ok, h: 40000, designed: true, remote: true, quotes: true, mailto: 'mailto:pat@example.com?subject=Hi', touched: true, html: '<b>ignored</b>' }, { source: A });
  assert.equal(a.el.attrs.height, '40000');
  assert.ok(a.el.classList.contains('designed'));
  assert.deepEqual(seen, { remote: [['msg-1', true]], mailto: ['mailto:pat@example.com?subject=Hi'], touched: ['msg-1'] });
  sayTo({ ...ok, h: 40, designed: false, remote: false }, { source: A });
  assert.equal(a.el.attrs.height, '40');
  assert.ok(!a.el.classList.contains('designed'));
  assert.equal(b.el.attrs.height, '120', 'the other frame untouched');
  // (a frame destroyed: its messages ignored)
  a.destroy();
  sayTo({ ...ok, h: 300, remote: true }, { source: A });
  assert.deepEqual(seen.remote, [['msg-1', true], ['msg-1', false]]);
  // (unmounted: no listener left)
  off(); off1();
  assert.equal(winOn.message.size, 0);
  b.destroy();
});

test('theme: posted to that frame only, at Mail’s origin, never “*”, once it has spoken; before, its address says it. Pictures: img=1 for that message only', { skip: frameSkip }, () => {
  const off = BF.listenFrames({});
  const a = BF.bodyFrame(ROWAN), b = BF.bodyFrame({ id: 'msg-2' });
  posted.length = 0;
  a.setTheme('dark');
  assert.equal(a.el.src, 'https://email.inflite.ai/body/#m=msg-1&t=dark&img=0&p=https%3A%2F%2Finflite.ai', 'not yet heard from: its address');
  sayTo({ ifl: 'mailbody', v: 1, id: 'msg-1', h: 200 }, { source: a.el.contentWindow });
  a.setTheme('light');
  a.setTheme('purple');
  a.setTheme('light');
  assert.deepEqual(posted.map((p) => [p.frame === a.el, p.data, p.target]), [[true, { ifl: 'mailbody', v: 1, t: 'light' }, MAILO]]);
  BF.themeAll('dark');
  assert.deepEqual(posted.slice(1).map((p) => [p.frame === a.el, p.data, p.target]), [[true, { ifl: 'mailbody', v: 1, t: 'dark' }, MAILO]]);
  assert.match(b.el.src, /&t=dark&/, 'b, not heard from: its address');
  a.allowImages();
  assert.equal(a.el.src, 'https://email.inflite.ai/body/#m=msg-1&t=dark&img=1&p=https%3A%2F%2Finflite.ai');
  assert.match(b.el.src, /&img=0&/);
  a.destroy(); b.destroy(); off();
});

test('“Couldn’t show this message”: 6 s after load (or first sight) with no height while online; never offline, never once heard; uncovered when it speaks', { skip: frameSkip }, (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const off = BF.listenFrames({});
  // (loaded, silent)
  const a = BF.bodyFrame(ROWAN);
  a.el.fire('load');
  t.mock.timers.tick(5999);
  assert.equal(a.el.next, undefined);
  t.mock.timers.tick(1);
  assert.equal(a.el.hidden, true);
  const c = a.el.next;
  assert.equal(c.className, 'mail-body-cover');
  assert.equal(c.kids.map((k) => k.textContent).join(''), 'Couldn’t show this message · Open in Mail');
  assert.equal(c.kids[2].href, 'https://email.inflite.ai/#thread=thr-1');
  assert.equal(c.kids[2].target, '_blank');
  // (it speaks after all: uncovered)
  sayTo({ ifl: 'mailbody', v: 1, id: 'msg-1', h: 300 }, { source: a.el.contentWindow });
  assert.equal(a.el.hidden, false);
  assert.equal(c.removed, true);
  // (heard from in time: never covered)
  const b = BF.bodyFrame({ id: 'msg-2' });
  b.el.fire('load');
  sayTo({ ifl: 'mailbody', v: 1, id: 'msg-2', h: 64 }, { source: b.el.contentWindow });
  t.mock.timers.tick(60000);
  assert.equal(b.el.next, undefined);
  // (offline when the time comes: the module's offline state covers the reader, not this)
  const d = BF.bodyFrame({ id: 'msg-3' });
  d.el.fire('load');
  navigator.onLine = false;
  t.mock.timers.tick(6000);
  assert.equal(d.el.next, undefined);
  navigator.onLine = true;
  // (a lazy frame further down, never loaded nor seen: never covered; once seen, the clock starts)
  const e = BF.bodyFrame({ id: 'msg-4' });
  t.mock.timers.tick(60000);
  assert.equal(e.el.next, undefined);
  assert.ok(observed.includes(e.el));
  ioCallback([{ target: e.el, isIntersecting: true }]);
  assert.ok(!observed.includes(e.el), 'seen once is enough');
  t.mock.timers.tick(6000);
  assert.equal(e.el.next?.className, 'mail-body-cover');
  assert.equal(e.el.next.kids[2].href, 'https://email.inflite.ai/', 'no thread known: Mail’s page');
  // (destroyed before its time: nothing)
  const g = BF.bodyFrame({ id: 'msg-5' });
  g.el.fire('load');
  g.destroy();
  t.mock.timers.tick(6000);
  assert.equal(g.el.next, undefined);
  for (const x of [a, b, d, e]) x.destroy();
  off();
});

test('bodyframe.js never reads a frame’s document, never posts to “*”, never puts HTML in', { skip: frameSkip }, () => {
  const code = read('roof/bodyframe.js').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/contentDocument|innerHTML|insertAdjacentHTML|outerHTML|srcdoc|\.style\b/.test(code));
  assert.ok(!/["'`]\*["'`]/.test(code));
  for (const m of code.matchAll(/postMessage\(([^)]*)\)/g)) assert.match(m[1], /, MAIL$/, m[0]);
  assert.match(code, /e\.origin !== MAIL/);
});

// (spec §4.5: the shell ≤ 8 KB gzip once, then nothing; bodyframe.js ≤ 3 KB; gzip -9, whole-line comments stripped)
test('sizes: the shell’s three files ≤ 8 KB gzipped together, bodyframe.js ≤ 3 KB', { skip }, async () => {
  const { gzipSync } = await import('node:zlib');
  const strip = (s) => s.replace(/^\s*\/\/.*\n/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;
  const shellBytes = gz(['body/index.html', 'body/body.js', 'body/body.css'].map((f) => strip(read(f))).join(''));
  assert.ok(shellBytes <= 8192, `the shell: ${shellBytes} B`);
  if (existsSync(new URL('roof/bodyframe.js', PUB))) {
    const bf = gz(strip(read('roof/bodyframe.js')));
    assert.ok(bf <= 3072, `bodyframe.js: ${bf} B`);
  }
});
