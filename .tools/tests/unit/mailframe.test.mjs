// Mail framed by InFlite's window (Today First, spec §6.4, §9.4; the inflite repo's email/, where it's checked out beside
// this one). Mail's Worker answers its page (/ and /index.html, wrangler.jsonc's run_worker_first) with one
// Content-Security-Policy, put in place of the files' own: Mail's policy (public/_headers) with frame-ancestors the
// hub's address (HUB_ORIGIN) in place of 'none', so the hub's /mail/ page alone may frame it; every other file as the
// files have it. And Mail's page in the frame (email/public/app.js): embed mode only in a frame named ifl-mail; its
// hello to the hub's address alone (Mail's own with email. taken off); the hub's word heard only from the window holding
// the frame, at that address; Back to Apps in your photo's place; no badge, no notification asked for and no Home Screen
// fit in the frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/index.js', MAIL)) && 'the inflite repo isn’t beside this one';
const worker = skip ? null : (await import(new URL('src/index.js', MAIL).href)).default;
const src = skip ? '' : readFileSync(new URL('public/app.js', MAIL), 'utf8');

// (Mail's policy as public/_headers gives every file: its /* rule)
const filesPolicy = () => {
  const text = readFileSync(new URL('public/_headers', MAIL), 'utf8');
  const all = text.slice(text.indexOf('\n/*\n'));
  return /\n\s+Content-Security-Policy: (.+)\n?/.exec(all)[1].trim();
};
// (the files: what each is asked for, answered as the files are, with _headers' rules on it, or with none)
function files({ headers = true } = {}) {
  const asked = [];
  return {
    asked,
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      asked.push(path);
      const h = new Headers({ 'Content-Type': path.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', ETag: '"abc"' });
      if (headers) { h.set('Content-Security-Policy', filesPolicy()); h.set('X-Content-Type-Options', 'nosniff'); h.set('Cache-Control', 'no-cache'); }
      return new Response(path.endsWith('.js') ? 'const BUILD = "1.0";' : '<!doctype html><title>Mail</title>', { headers: h });
    },
  };
}
const HUB = 'https://inflite.ai';
const call = async (path, env, init = {}) => worker.fetch(new Request(`https://email.inflite.ai${path}`, init), env, { waitUntil() {} });
const directives = (p) => p.split(';').map((d) => d.trim()).filter(Boolean);

test('Mail’s page: one policy, Mail’s own with frame-ancestors the hub’s address, in place of the files’ one', { skip }, async () => {
  for (const headers of [true, false]) {
    const ASSETS = files({ headers });
    for (const path of ['/', '/index.html']) {
      const res = await call(path, { ASSETS, HUB_ORIGIN: HUB });
      assert.equal(res.status, 200);
      const csp = res.headers.get('content-security-policy');
      // (Headers joins two of a name with ", ": one policy is one header, so no ", " and one frame-ancestors)
      assert.ok(!csp.includes(', ') && csp.split('frame-ancestors').length === 2, `${path}: one policy (${csp})`);
      const want = directives(filesPolicy()).map((d) => (d.startsWith('frame-ancestors') ? `frame-ancestors ${HUB}` : d));
      assert.deepEqual(directives(csp), want, `${path}: the files’ policy, framed by the hub alone`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('strict-transport-security'), 'max-age=63072000; includeSubDomains');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      assert.equal(res.headers.get('x-frame-options'), null);
      assert.equal(res.headers.get('etag'), '"abc"', 'the files’ own answer otherwise');
      assert.match(await res.text(), /<title>Mail<\/title>/);
    }
    assert.deepEqual(ASSETS.asked, ['/', '/index.html'], 'from the files');
  }
});

test('with no hub address, or something that isn’t one: framed by no one, as before', { skip }, async () => {
  for (const HUB_ORIGIN of [undefined, '', 'https://inflite.ai/', 'https://inflite.ai/mail/', '*', "'self'", 'https://inflite.ai https://evil.example', 'https://inflite.ai; script-src *', 'javascript:x']) {
    const res = await call('/', { ASSETS: files(), HUB_ORIGIN });
    const csp = res.headers.get('content-security-policy');
    assert.deepEqual(directives(csp).filter((d) => d.startsWith('frame-ancestors')), ["frame-ancestors 'none'"], String(HUB_ORIGIN));
    assert.ok(!/script-src \*/.test(csp), String(HUB_ORIGIN));
  }
  // (the tests' hub: its port kept)
  const res = await call('/', { ASSETS: files(), HUB_ORIGIN: 'http://ifl.test:8788' });
  assert.match(res.headers.get('content-security-policy'), /; frame-ancestors http:\/\/ifl\.test:8788$/);
});

test('every other file: the files’ own answer, untouched (and the API as it was)', { skip }, async () => {
  const ASSETS = files();
  for (const path of ['/app.js', '/app.css', '/sw.js', '/thread/abc']) {
    const res = await call(path, { ASSETS, HUB_ORIGIN: HUB });
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'$/, path);
  }
  assert.deepEqual(ASSETS.asked, ['/app.js', '/app.css', '/sw.js', '/thread/abc']);
  // (an API path never reaches the files, page or no page)
  const api = await call('/api/nope', { ASSETS, HUB_ORIGIN: HUB }, { method: 'POST' });
  assert.equal(api.status, 403);
  assert.equal(ASSETS.asked.length, 4);
});

test('wrangler.jsonc: the page runs the Worker first, and the hub’s address is InFlite’s', { skip }, () => {
  const text = readFileSync(new URL('wrangler.jsonc', MAIL), 'utf8');
  const conf = JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
  assert.deepEqual(conf.assets.run_worker_first, ['/api/*', '/', '/index.html']);
  assert.equal(conf.vars.HUB_ORIGIN, 'https://inflite.ai');
  // (_headers keeps 'none' for every file: the Worker's answer is the only one framed by the hub)
  assert.match(filesPolicy(), /frame-ancestors 'none'$/);
});

// ---- Mail's page in the frame: its embed mode, from email/public/app.js ----
const fn = (name) => new RegExp(`\\n {2}(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`).exec(src)?.[0] || assert.fail(`app.js: ${name}`);
const part = (re, what) => re.exec(src)?.[0] || assert.fail(`app.js: ${what}`);
// (Mail at an address, in a window: its parent, its name; → its embed mode's parts, working)
function embed({ origin = 'https://email.inflite.ai', framed = true, name = 'ifl-mail', parentThrows = false } = {}) {
  const posted = [], listeners = {}, classes = [];
  const win = { name };
  const parent = { postMessage: (m, o) => { if (parentThrows) throw new Error('gone'); posted.push([JSON.parse(JSON.stringify(m)), o]); } };
  win.parent = framed ? parent : win;
  const ctx = { window: win, location: { origin }, addEventListener: (t, f) => (listeners[t] = f), document: { documentElement: { classList: { add: (c) => classes.push(c) } } } };
  win.addEventListener = ctx.addEventListener;
  const code = `${part(/\n {2}const EMBED = \(\(\) => \{[\s\S]*?\n {2}\}\)\(\);\n/, 'EMBED')}${part(/\n {2}const HUB = .+;\n/, 'HUB')}${part(/\n {2}let hubHeard = false;\n/, 'hubHeard')}
    ${fn('toHub')}${fn('fromHub')}${part(/\n {2}if \(EMBED\) \{\n[\s\S]*?\n {2}\}\n/, 'if (EMBED)')}
    ({ EMBED, HUB, toHub, fromHub, heard: () => hubHeard })`;
  return { ...vm.runInNewContext(code, ctx), posted, listeners, classes, parent, win };
}

test('embed mode: only in a frame named ifl-mail; the hub is Mail’s own address with email. taken off', { skip }, () => {
  let m = embed();
  assert.equal(m.EMBED, true);
  assert.equal(m.HUB, 'https://inflite.ai');
  assert.deepEqual(m.classes, ['embed'], 'html.embed');
  assert.deepEqual(m.posted, [[{ ifl: 'hello', v: 1 }, 'https://inflite.ai']], 'its hello, to the hub’s address alone');
  assert.equal(typeof m.listeners.message, 'function');
  assert.equal(embed({ origin: 'http://email.ifl.test:8788' }).HUB, 'http://ifl.test:8788', 'the tests’ site the same');
  for (const o of [{ framed: false }, { name: 'other' }, { name: '' }, { framed: false, name: 'ifl-mail' }]) {
    m = embed(o);
    assert.equal(m.EMBED, false, JSON.stringify(o));
    assert.deepEqual(m.posted, [], 'nothing said');
    assert.deepEqual(m.classes, []);
    assert.equal(m.listeners.message, undefined, 'nothing heard');
    assert.equal(m.toHub({ ifl: 'back' }), false);
    assert.deepEqual(m.posted, [], 'and nothing sent off it');
  }
  // (a parent that can't be told: nothing thrown)
  assert.equal(embed({ parentThrows: true }).toHub({ ifl: 'back' }), false);
});

test('the hub’s word: heard only from the window holding the frame, at the hub’s address, and only its hello', { skip }, () => {
  let m = embed();
  assert.equal(m.fromHub({ source: m.parent, origin: 'https://inflite.ai', data: { ifl: 'hello', v: 1 } }), true);
  assert.equal(m.heard(), true);
  m = embed();
  for (const e of [{ source: {}, origin: 'https://inflite.ai', data: { ifl: 'hello', v: 1 } }, { source: m.win, origin: 'https://inflite.ai', data: { ifl: 'hello', v: 1 } },
    { source: m.parent, origin: 'https://evil.example', data: { ifl: 'hello', v: 1 } }, { source: m.parent, origin: 'https://email.inflite.ai', data: { ifl: 'hello', v: 1 } },
    { source: m.parent, origin: 'https://inflite.ai.evil.example', data: { ifl: 'hello', v: 1 } }, { source: m.parent, origin: 'https://inflite.ai', data: { ifl: 'hello', v: 2 } },
    { source: m.parent, origin: 'https://inflite.ai', data: 'hello' }, { source: m.parent, origin: 'https://inflite.ai', data: null }, { source: m.parent, origin: 'https://inflite.ai', data: { ifl: 'signin', ask: 'x' } }])
    assert.equal(m.fromHub(e), false, JSON.stringify({ ...e, source: e.source === m.parent ? 'parent' : 'other' }));
  assert.equal(m.heard(), false);
  // (Mail at its own address hears nothing at all, even its own window's word)
  m = embed({ framed: false });
  assert.equal(m.fromHub({ source: m.win, origin: 'https://inflite.ai', data: { ifl: 'hello', v: 1 } }), false);
});

test('in the frame: Back to Apps in your photo’s place, Mail’s own few in the title’s menu, and nothing of the window’s', { skip }, () => {
  // (Back posts { ifl: "back" }, in your photo's place, which opens InFlite's menu everywhere else)
  const nav = fn('renderNavButtons');
  assert.match(nav, /EMBED\s*\?\s*h\("button\.gbtn\.glass\.hub-back", \{ type: "button", "aria-label": "Back to Apps", title: "Back to Apps", onclick: \(\) => toHub\(\{ ifl: "back" \}\) \}/);
  assert.match(nav, /: h\(\s*"button\.gbtn\.glass\.profile"[\s\S]*profileMenu\(e\.currentTarget\)/);
  assert.match(fn('listMenu'), /if \(EMBED\)\s*items\.push\("-", \{ label: "Remote Images"[\s\S]*label: "Settings", icon: "sliders", action: \(\) => openSettings\(\) \}\)/);
  // (no notification asked for as it opens from #notify; no Home Screen fit; no badge)
  assert.match(src, /\n {2}let ASK_NOTIFY = IFL\.wantsAllow\(\) && !EMBED;\n/);
  assert.match(src, /\n {2}if \(navigator\.standalone === true && screen\.width && screen\.height && !EMBED\) \{\n/);
  const badge = (embedded) => {
    const set = [];
    const ctx = { EMBED: embedded, S: { counts: { inbox: { unread: 3 } } }, document: { title: '' }, navigator: { setAppBadge: (n) => set.push(n), clearAppBadge: () => set.push(0) } };
    vm.runInNewContext(`${fn('updateBadge')}; updateBadge();`, ctx);
    return { set, title: ctx.document.title };
  };
  assert.deepEqual(badge(true), { set: [], title: 'Mail (3)' }, 'in the frame: the title, never the icon’s badge (InFlite’s)');
  assert.deepEqual(badge(false), { set: [3], title: 'Mail (3)' }, 'at its own address: as before');
  assert.match(fn('forgetMail'), /if \(!EMBED\) navigator\.clearAppBadge\?\.\(\);/);
  // (signed out in the frame: the sign-in page, never framed, isn't gone to)
  assert.match(fn('signOut'), /if \(!EMBED && authOrigin\(\) !== accountOrigin\) location\.assign\(/);
});
