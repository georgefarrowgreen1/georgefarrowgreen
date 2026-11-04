// Mail framed by InFlite's window (Today First, spec §6.4, §9.4; the inflite repo's email/, where it's checked out beside
// this one). Mail's Worker answers its page (/ and /index.html, wrangler.jsonc's run_worker_first) with one
// Content-Security-Policy, put in place of the files' own: Mail's policy (public/_headers) with frame-ancestors the
// hubs' addresses (HUB_ORIGIN: the site's and its staging hub's, a space between them) in place of 'none', so the hubs'
// /mail/ pages alone may frame it; every other file as the files have it. And Mail's page in the frame
// (email/public/app.js): embed mode only in a frame named ifl-mail; its hello to the hubs' addresses alone (Mail's own
// with email. taken off, and the staging hub's, next.), to the one holding the frame where the browser says which; the
// hub's word heard only from the window holding the frame, at one of those addresses, which fixes the hub; nothing said
// to the hub but the hello until it has answered; nothing in your photo's place (the hub's bar has Back to Apps); no
// badge, no notification asked for and no Home Screen fit in the frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
// (and skipped, not failed, where the inflite repo beside is from before Today First: its live branch, as CI has it beside
// main while this repo goes live first, has no framed Mail yet)
const skip = (!existsSync(new URL('src/index.js', MAIL)) && 'the inflite repo isn’t beside this one') ||
  (!existsSync(new URL('../../../../inflite/today/src/hub.js', import.meta.url)) && 'the inflite repo beside is from before Today First (its live branch, while this repo goes live first)');
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

test('with no hub address, or anything in it that isn’t one: framed by no one, as before', { skip }, async () => {
  for (const HUB_ORIGIN of [undefined, '', ' ', 'https://inflite.ai/', 'https://inflite.ai/mail/', '*', "'self'", 'https://inflite.ai; script-src *', 'javascript:x',
    'https://inflite.ai *', 'https://inflite.ai https://next.inflite.ai/', "https://inflite.ai 'unsafe-inline'", 'https://inflite.ai,https://next.inflite.ai',
    'https://inflite.ai https://next.inflite.ai; script-src *', 'https://inflite.ai\nscript-src *', 42, ['https://inflite.ai']]) {
    const res = await call('/', { ASSETS: files(), HUB_ORIGIN });
    const csp = res.headers.get('content-security-policy');
    assert.deepEqual(directives(csp).filter((d) => d.startsWith('frame-ancestors')), ["frame-ancestors 'none'"], JSON.stringify(HUB_ORIGIN));
    assert.ok(!/script-src \*/.test(csp) && !csp.includes('\n'), JSON.stringify(HUB_ORIGIN));
  }
  // (the tests' hub: its port kept)
  const res = await call('/', { ASSETS: files(), HUB_ORIGIN: 'http://ifl.test:8788' });
  assert.match(res.headers.get('content-security-policy'), /; frame-ancestors http:\/\/ifl\.test:8788$/);
});

test('more than one hub, a space between them (the site’s and its staging hub’s): framed by each of them and no one else', { skip }, async () => {
  for (const [HUB_ORIGIN, want] of [
    ['https://inflite.ai https://next.inflite.ai', 'frame-ancestors https://inflite.ai https://next.inflite.ai'],
    ['  https://inflite.ai \t https://next.inflite.ai  ', 'frame-ancestors https://inflite.ai https://next.inflite.ai'],
    ['HTTPS://InFlite.ai https://NEXT.inflite.ai', 'frame-ancestors https://inflite.ai https://next.inflite.ai'],
    ['http://ifl.test:8788 http://next.ifl.test:8788', 'frame-ancestors http://ifl.test:8788 http://next.ifl.test:8788'],
  ]) {
    const res = await call('/', { ASSETS: files(), HUB_ORIGIN });
    const csp = res.headers.get('content-security-policy');
    assert.deepEqual(directives(csp).filter((d) => d.startsWith('frame-ancestors')), [want], HUB_ORIGIN);
    assert.ok(!csp.includes(', ') && csp.endsWith(`; ${want}`), csp);
    assert.deepEqual(directives(csp).slice(0, -1), directives(filesPolicy()).filter((d) => !d.startsWith('frame-ancestors')), 'Mail’s own policy otherwise');
  }
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

test('wrangler.jsonc: the page runs the Worker first, and the hubs’ addresses are InFlite’s and its staging hub’s', { skip }, () => {
  const text = readFileSync(new URL('wrangler.jsonc', MAIL), 'utf8');
  const conf = JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
  // (and, where the inflite repo beside has Mail's module, One roof stage 4's: /body and /body/* the body shell, /roof/*
  // the module's files, both answered by the Worker; before it, the page and the API alone)
  const roof = existsSync(new URL('public/roof/mail.js', MAIL));
  assert.deepEqual(conf.assets.run_worker_first, ['/api/*', '/', '/index.html', ...(roof ? ['/body', '/body/*', '/roof/*'] : [])]);
  // (the staging hub, next.inflite.ai, frames Mail too, for the phone checks before going live: spec §15.2 K7)
  assert.equal(conf.vars.HUB_ORIGIN, 'https://inflite.ai https://next.inflite.ai');
  // (_headers keeps 'none' for every file: the Worker's answer is the only one framed by the hub)
  assert.match(filesPolicy(), /frame-ancestors 'none'$/);
});

// ---- Mail's page in the frame: its embed mode, from email/public/app.js ----
const fn = (name) => new RegExp(`\\n {2}(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`).exec(src)?.[0] || assert.fail(`app.js: ${name}`);
const part = (re, what) => re.exec(src)?.[0] || assert.fail(`app.js: ${what}`);
// (Mail at an address, in a window: its parent, its name, and the address of the window holding it as the browser says
// it (ancestorOrigins: undefined where it doesn't, 'throws' for one that can't be read); → its embed mode's parts, working)
// (unsent: with the hand-in of what InFlite's Mail was writing as its switch went off, Mail's saves answered by it:
// (draft) → a promise; what was saved, toasted, and the list and counts asked again, in saved, toasts, again)
function embed({ origin = 'https://email.inflite.ai', framed = true, name = 'ifl-mail', parentThrows = false, ancestors, unsent } = {}) {
  const posted = [], listeners = {}, classes = [];
  const win = { name };
  const parent = { postMessage: (m, o) => { if (parentThrows) throw new Error('gone'); posted.push([JSON.parse(JSON.stringify(m)), o]); } };
  win.parent = framed ? parent : win;
  const location = { origin };
  if (ancestors === 'throws') Object.defineProperty(location, 'ancestorOrigins', { get() { throw new Error('no'); } });
  else if (ancestors) location.ancestorOrigins = ancestors;
  const ctx = { window: win, location, addEventListener: (t, f) => (listeners[t] = f), document: { documentElement: { classList: { add: (c) => classes.push(c) } } } };
  win.addEventListener = ctx.addEventListener;
  const code = `${part(/\n {2}const EMBED = \(\(\) => \{[\s\S]*?\n {2}\}\)\(\);\n/, 'EMBED')}${part(/\n {2}const SITE = .+;\n {2}const HUBS = .+;\n/, 'SITE, HUBS')}
    ${part(/\n {2}let HUB = \(\(\) => \{[\s\S]*?\n {2}\}\)\(\);\n {2}let hubHeard = false;\n/, 'HUB, hubHeard')}
    ${fn('toHub')}${fn('helloHub')}${fn('fromHub')}${part(/\n {2}if \(EMBED\) \{\n[\s\S]*?\n {2}\}\n/, 'if (EMBED)')}
    ${unsent ? `${fn('unsentDraft')}\n  const handedIn = new Set();${fn('fromHubUnsent')}` : 'const fromHubUnsent = null;'}
    ({ EMBED, HUBS, hub: () => HUB, toHub, fromHub, fromHubUnsent, heard: () => hubHeard })`;
  const saved = [], toasts = [], again = [];
  if (unsent) Object.assign(ctx, { api: { saveDraft: (d) => (saved.push(JSON.parse(JSON.stringify(d))), unsent(d)) }, toast: (t) => toasts.push(t), S: { me: {} },
    refreshCounts: () => again.push('counts'), loadList: (o) => again.push(o) });
  return { ...vm.runInNewContext(code, ctx), posted, listeners, classes, parent, win, saved, toasts, again };
}
const HELLO = { ifl: 'hello', v: 1 };
const plain = (x) => JSON.parse(JSON.stringify(x));

test('embed mode: only in a frame named ifl-mail; the hubs are Mail’s own address with email. taken off, and its staging hub’s', { skip }, () => {
  let m = embed();
  assert.equal(m.EMBED, true);
  assert.deepEqual(plain(m.HUBS), ['https://inflite.ai', 'https://next.inflite.ai']);
  assert.equal(m.hub(), null, 'which one holds the frame: not known yet, where the browser doesn’t say');
  assert.deepEqual(m.classes, ['embed'], 'html.embed');
  assert.deepEqual(m.posted, [[HELLO, 'https://inflite.ai'], [HELLO, 'https://next.inflite.ai']], 'its hello, to the hubs’ addresses alone');
  assert.equal(typeof m.listeners.message, 'function');
  assert.deepEqual(plain(embed({ origin: 'http://email.ifl.test:8788' }).HUBS), ['http://ifl.test:8788', 'http://next.ifl.test:8788'], 'the tests’ site the same');
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
  m = embed({ parentThrows: true });
  m.fromHub({ source: m.parent, origin: 'https://inflite.ai', data: HELLO });
  assert.equal(m.toHub({ ifl: 'back' }), false);
});

test('the hub holding the frame, as the browser says it: the hello to it alone, and only its word heard', { skip }, () => {
  for (const at of ['https://inflite.ai', 'https://next.inflite.ai']) {
    const m = embed({ ancestors: [at] });
    assert.equal(m.hub(), at);
    assert.deepEqual(m.posted, [[HELLO, at]], `${at}: the hello to it alone`);
    const other = at === 'https://inflite.ai' ? 'https://next.inflite.ai' : 'https://inflite.ai';
    assert.equal(m.fromHub({ source: m.parent, origin: other, data: HELLO }), false, `${at}: the other hub’s word isn’t this frame’s`);
    assert.equal(m.heard(), false);
    assert.equal(m.fromHub({ source: m.parent, origin: at, data: HELLO }), true);
    assert.equal(m.heard(), true);
  }
  // (an address that isn't one of the hubs', or one that can't be read: as if the browser didn't say)
  for (const ancestors of [['https://evil.example'], ['https://email.inflite.ai'], [], 'throws']) {
    const m = embed({ ancestors });
    assert.equal(m.hub(), null, JSON.stringify(ancestors));
    assert.deepEqual(m.posted, [[HELLO, 'https://inflite.ai'], [HELLO, 'https://next.inflite.ai']], JSON.stringify(ancestors));
  }
});

test('the hub’s word: heard only from the window holding the frame, at a hub’s address, and only its hello, which fixes the hub', { skip }, () => {
  let m = embed();
  assert.equal(m.toHub({ ifl: 'back' }), false, 'nothing but the hello said before the hub answers');
  assert.equal(m.posted.length, 2);
  assert.equal(m.fromHub({ source: m.parent, origin: 'https://next.inflite.ai', data: HELLO }), true);
  assert.equal(m.heard(), true);
  assert.equal(m.hub(), 'https://next.inflite.ai', 'the hub: the one that answered');
  m.posted.length = 0;
  assert.equal(m.toHub({ ifl: 'signin', ask: 'x' }), true);
  assert.deepEqual(m.posted, [[{ ifl: 'signin', ask: 'x' }, 'https://next.inflite.ai']], 'said to that hub alone');
  assert.equal(m.fromHub({ source: m.parent, origin: 'https://inflite.ai', data: HELLO }), false, 'and the other one not heard from then on');
  assert.equal(m.hub(), 'https://next.inflite.ai');
  m = embed();
  for (const e of [{ source: {}, origin: 'https://inflite.ai', data: HELLO }, { source: m.win, origin: 'https://inflite.ai', data: HELLO },
    { source: m.parent, origin: 'https://evil.example', data: HELLO }, { source: m.parent, origin: 'https://email.inflite.ai', data: HELLO },
    { source: m.parent, origin: 'https://inflite.ai.evil.example', data: HELLO }, { source: m.parent, origin: 'https://next.next.inflite.ai', data: HELLO },
    { source: m.parent, origin: 'http://inflite.ai', data: HELLO }, { source: m.parent, origin: 'null', data: HELLO }, { source: m.parent, origin: 'https://inflite.ai', data: { ifl: 'hello', v: 2 } },
    { source: m.parent, origin: 'https://inflite.ai', data: 'hello' }, { source: m.parent, origin: 'https://inflite.ai', data: null }, { source: m.parent, origin: 'https://inflite.ai', data: { ifl: 'signin', ask: 'x' } }])
    assert.equal(m.fromHub(e), false, JSON.stringify({ ...e, source: e.source === m.parent ? 'parent' : 'other' }));
  assert.equal(m.heard(), false);
  assert.equal(m.hub(), null);
  // (Mail at its own address hears nothing at all, even its own window's word)
  m = embed({ framed: false });
  assert.equal(m.fromHub({ source: m.win, origin: 'https://inflite.ai', data: HELLO }), false);
});

test('in the frame: nothing in your photo’s place (the hub’s bar has Back to Apps), Mail’s own few in the title’s menu, and nothing of the window’s', { skip }, () => {
  // (your photo opens InFlite's menu everywhere else; in the frame, You and your apps are the hub's, and one Back to Apps
  // is the hub's bar's, over Mail the whole time, not a second one on Mail's list)
  const nav = fn('renderNavButtons');
  assert.match(nav, /EMBED\s*\?\s*null\s*: h\(\s*"button\.gbtn\.glass\.profile"[\s\S]*profileMenu\(e\.currentTarget\)/);
  assert.doesNotMatch(src, /hub-back/);
  const css = readFileSync(new URL('public/app.css', MAIL), 'utf8');
  assert.doesNotMatch(css, /hub-back/);
  // (the line under the lens's name lined up with the name, at the bar's edge, where your photo isn't)
  assert.match(css, /\nhtml\.embed \.pane\.list \.subtitle \{\n {2}padding-left: calc\(12px \+ var\(--sal\) \+ 4px\);\n\}/);
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

test('what InFlite’s Mail was writing as its switch went off, handed in by the hub’s page: saved as a draft only from the hub holding the frame, after its hello; the hub told by the copy’s time alone (One roof stage 4, §8)', { skip }, async () => {
  const tick = () => new Promise((ok) => setTimeout(ok, 0));
  const words = { from: 'hello@inflite.ai', to: [{ name: 'Pat', email: 'pat@example.com', extra: 1 }, { name: 'x' }, null], cc: [], bcc: [], subject: 'Roof switch draft', text: 'Words',
    inReplyTo: '<a@x>', references: '<a@x>', quote: { of: 'm-1', mode: 'replyAll' } };
  const msg = (draft = words, at = 1700000000000) => ({ ifl: 'unsent', v: 1, at, draft });
  let m = embed({ unsent: async () => ({ id: 'd-9' }) });
  // (before the hub's answered the hello, or from anywhere but the hub holding the frame: nothing saved)
  assert.equal(m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data: msg() }), false, 'not before the hello');
  m.fromHub({ source: m.parent, origin: 'https://inflite.ai', data: HELLO });
  for (const e of [{ source: {}, origin: 'https://inflite.ai' }, { source: m.parent, origin: 'https://next.inflite.ai' }, { source: m.parent, origin: 'https://evil.example' }, { source: m.parent, origin: 'https://email.inflite.ai' }])
    assert.equal(m.fromHubUnsent({ ...e, data: msg() }), false, e.origin);
  for (const data of [null, 'unsent', { ...msg(), v: 2 }, { ...msg(), ifl: 'hello' }, { ...msg(), at: 'x' }, msg(null), msg({ ...words, to: [], subject: '', text: ' ' }), msg('words')])
    assert.equal(m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data }), false, JSON.stringify(data));
  assert.deepEqual(m.saved, []);
  m.posted.length = 0;
  assert.equal(m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data: msg() }), true);
  await tick();
  assert.deepEqual(m.saved, [{ from: 'hello@inflite.ai', to: [{ name: 'Pat', email: 'pat@example.com' }], cc: [], bcc: [], subject: 'Roof switch draft', text: 'Words', inReplyTo: '<a@x>', references: '<a@x>',
    attachments: [], quote: { of: 'm-1', mode: 'replyAll' } }], 'a new draft, its people as Mail keeps them, the quote by which message it is');
  assert.deepEqual(m.posted, [[{ ifl: 'unsent', v: 1, at: 1700000000000, saved: true }, 'https://inflite.ai']], 'the hub told, by the copy’s time alone (none of the words)');
  assert.deepEqual(m.toasts, ['Draft Saved']);
  assert.deepEqual(plain(m.again), ['counts', { quiet: true }]);
  // (the same copy again: saved once)
  assert.equal(m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data: msg() }), false);
  // (a draft it was: saved over, its files kept by their places; a references list as Mail keeps it, one line)
  m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data: msg({ ...words, draftId: 'd-1', references: ['<a@x>', '<b@x>'], quote: null }, 2) });
  await tick();
  assert.equal(m.saved[1].id, 'd-1');
  assert.deepEqual(m.saved[1].attachments, Array.from({ length: 20 }, (_, i) => ({ i })));
  assert.equal(m.saved[1].references, '<a@x> <b@x>');
  assert.equal('quote' in m.saved[1], false, 'no quote key: Mail keeps the one the draft has');
  for (const draftId of ['../x', 'a b', 'x'.repeat(65), 42]) {
    m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data: msg({ ...words, draftId }, 3 + m.saved.length) });
    await tick();
    assert.equal('id' in m.saved.at(-1), false, String(draftId));
  }
  // (Mail couldn't save it: the hub not told, so it keeps its copy, and the same copy is taken again later)
  m = embed({ unsent: async () => { throw new Error('no'); } });
  m.fromHub({ source: m.parent, origin: 'https://inflite.ai', data: HELLO });
  m.posted.length = 0;
  m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data: msg() });
  await tick();
  assert.deepEqual(m.posted, []);
  assert.equal(m.fromHubUnsent({ source: m.parent, origin: 'https://inflite.ai', data: msg() }), true, 'taken again');
  // (Mail at its own address: nothing)
  m = embed({ framed: false, unsent: async () => ({}) });
  assert.equal(m.fromHubUnsent({ source: m.win, origin: 'https://inflite.ai', data: msg() }), false);
  assert.deepEqual(m.saved, []);
});
