// One roof's contracts (spec §3.1, §3.13, §5, §6.1, §7.1, D2, D15, D21), frozen by B0: the framework's files export the
// names every batch builds on (the inflite repo's today/public/roof, where it's beside this one) and its token block is
// map-design's; Weather's module (weather/roof) exports CONTRACT, BUILD and NEWS equal to weather/app.js's, SECTIONS equal
// to the router's and the connector's, the openers and the section views; the connector says exactly the agreed words
// and lists every file of the module's static import graph (followed from weather.js), which never reaches vendor/, the
// radar stack or the rain files; every dynamic import sits in fw.lazy(; and the module keeps §5.1's rules: nothing on
// :root, html or body, no service worker, no history or location changes, no confirm/alert, no IFL, no reaching into the
// page by id or selector, no today:* key, no indexedDB, no parent, no style attribute, no inline handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { MAIN, ROOF, roofSkip } from './fixtures/roof.mjs';

const WX = new URL('weather/', MAIN), MOD = new URL('weather/roof/', MAIN);
const read = (u) => readFileSync(u, 'utf8');
// (comments out, strings kept: a // inside a string is left alone)
const uncomment = (src) => src.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, s) => s ?? '');
// (the names a file exports, from its text: export function/const/let/class NAME, export { a, b as c })
function exportsOf(src) {
  const s = uncomment(src), out = new Set();
  for (const m of s.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of s.matchAll(/\bexport\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); }
  return out;
}
// (an exported const's literal, one line: export const NAME = <literal>;)
const literalOf = (src, name) => { const m = new RegExp(`\\bexport\\s+const\\s+${name}\\s*=\\s*([^\\n;]+);`).exec(uncomment(src)); return m ? Function(`"use strict"; return (${m[1]});`)() : undefined; };
const constOf = (src, name) => { const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*([^\\n;]+);`).exec(uncomment(src)); return m ? Function(`"use strict"; return (${m[1]});`)() : undefined; };
// (an object literal's top-level keys, from `export const NAME = {`)
function keysOf(src, name) {
  const s = uncomment(src), at = s.search(new RegExp(`\\bexport\\s+const\\s+${name}\\s*=\\s*\\{`));
  if (at < 0) return null;
  let i = s.indexOf('{', at), depth = 0, keys = [], tok = '';
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { const end = s.indexOf(c, i + 1); i = end; continue; }
    if ('{[('.includes(c)) { depth++; continue; }
    if ('}])'.includes(c)) { if (depth === 1 && tok.trim()) keys.push(tok.trim()); depth--; tok = ''; if (depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (c === ':') { keys.push(tok.trim()); tok = '\u0000'; continue; }
    if (c === ',') { if (tok !== '\u0000' && tok.trim()) keys.push(tok.trim()); tok = ''; continue; }
    if (tok !== '\u0000') tok += c;
  }
  return keys.filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
}
// (the static import graph from a file: import … from "./x", export … from "./x", import "./x"; relative only)
function graphFrom(start) {
  const seen = new Set(), todo = [start];
  while (todo.length) {
    const u = todo.pop();
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    const s = uncomment(read(u));
    for (const m of s.matchAll(/\b(?:import|export)\s+(?:[\w$*{}\s,]+?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g)) todo.push(new URL(m[1], u));
  }
  return [...seen].map((h) => '/' + h.slice(MAIN.href.length));
}
// (every import( must be the body of fw.lazy(() => …): `fw.lazy(() => import(` or `fw.lazy(async () => import(`)
const lazyOutside = (src) => { const s = uncomment(src), bad = []; for (const m of s.matchAll(/\bimport\s*\(/g)) if (!/fw\.lazy\(\s*(?:async\s*)?\(\s*\)\s*=>\s*(?:await\s+)?$/.test(s.slice(Math.max(0, m.index - 60), m.index))) bad.push(s.slice(Math.max(0, m.index - 40), m.index + 30)); return bad; };
const jsFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.js'));

const WEATHER = read(new URL('weather.js', MOD));
const APP = read(new URL('app.js', WX));
const { connector, CONNECTOR } = await import(new URL('connector.js', MOD));
const R = roofSkip ? null : await import(new URL('router.js', ROOF));

// ---- the framework (IFL) ----

test('the framework’s files export the names §3.1 freezes', { skip: roofSkip }, () => {
  const want = {
    'frame.js': ['CONTRACT', 'createFrame'],
    'router.js': ['REGISTRY', 'TABS', 'parse', 'format', 'owns', 'ownPath'],
    'header.js': ['createHeader'], 'tabs.js': ['createTabs'], 'sheet.js': ['createSheets'], 'toast.js': ['toast'],
    'ui.js': ['el', 'esc', 'icon', 'card', 'list', 'row', 'label', 'chip', 'stats', 'btn', 'iconBtn', 'seg', 'sw', 'field', 'tile', 'mini', 'avatar', 'badge', 'empty', 'error', 'skeleton'],
    'search.js': ['createSearch'], 'send.js': ['createSend'],
    'modules.js': ['loadModule', 'loadConnector', 'preload', 'watchVersion', 'keepOffline'],
    'connectors.js': ['STATIC', 'connectorOf', 'miniOf', 'openConnector', 'placesProvider'],
  };
  for (const [f, names] of Object.entries(want)) {
    const has = exportsOf(read(new URL(f, ROOF)));
    for (const n of names) assert.ok(has.has(n), `roof/${f} exports ${n}`);
  }
  assert.equal(literalOf(read(new URL('frame.js', ROOF)), 'CONTRACT'), 1);
  assert.ok(existsSync(new URL('roof.css', ROOF)), 'roof/roof.css');
});

test('B0’s frame stub: createFrame gives an F with every member of §3.2, and F.forModule an fw with every member of §5.2', { skip: roofSkip }, async (t) => {
  if (!exportsOf(read(new URL('frame.js', ROOF))).has('STUB')) return t.skip('the real frame: roofkit drives its members in a browser');
  const { createFrame } = await import(new URL('frame.js', ROOF));
  const F = createFrame({});
  for (const k of ['screen', 'nav', 'route', 'header', 'tabs', 'sheet', 'toast', 'search', 'send', 'ui', 'session', 'setRoof', 'restamp', 'stale', 'fill', 'on', 'busy', 'forModule', 'destroy']) assert.ok(k in F, `F.${k}`);
  for (const k of ['go', 'back', 'section']) assert.equal(typeof F.nav[k], 'function', `F.nav.${k}`);
  assert.equal(typeof F.session.lost, 'function');
  const fw = F.forModule('weather');
  for (const k of ['contract', 'app', 'screenEl', 'ui', 'header', 'nav', 'sheet', 'toast', 'send', 'sendButton', 'search', 'session', 'visible', 'on', 'theme', 'motion', 'zoomTarget', 'fill', 'lazy', 'stale']) assert.ok(k in fw, `fw.${k}`);
  assert.equal(fw.contract, 1);
  assert.equal(fw.app, 'weather');
  for (const k of ['go', 'back', 'section', 'href']) assert.equal(typeof fw.nav[k], 'function', `fw.nav.${k}`);
  assert.equal(typeof fw.header.set, 'function');
  assert.equal(typeof fw.sheet.open, 'function');
  assert.equal(typeof fw.search.provide, 'function');
  assert.equal(typeof fw.session.lost, 'function');
  assert.equal(fw.nav.href('radar'), '/weather/#radar');
  assert.equal(fw.nav.href('day', '2026-11-03'), '/weather/#day=2026-11-03');
});

test('roof.css’s token block: the framework’s tokens and each app’s accent, dark first and light in both light blocks, as map-design §3.2', { skip: roofSkip }, () => {
  // (rules by selector, inside a light media block or not; declarations as a map)
  const css = read(new URL('roof.css', ROOF)).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const walk = (s, media) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < s.length && depth; j++) depth += s[j] === '{' ? 1 : s[j] === '}' ? -1 : 0;
      const body = s.slice(open + 1, j - 1);
      if (head.startsWith('@media')) walk(body, head);
      else if (!head.startsWith('@')) rules.push({ media, sel: head.split(',').map((x) => x.trim().replace(/\s+/g, ' ')), decl: Object.fromEntries(body.split(';').map((d) => d.split(/:(.*)/s).map((x) => x.trim())).filter((d) => d[0])) });
      i = j;
    }
  };
  walk(css, null);
  const get = (sel, media, prop) => { let v; for (const r of rules) if (r.sel.includes(sel) && (media ? r.media?.includes(media) : !r.media) && prop in r.decl) v = r.decl[prop]; return v; };
  const ROOT = { '--bar': 'rgba(36, 38, 52, 0.82)', '--r-sheet': '38px', '--r-well': '16px', '--r-pill': '999px', '--ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
    '--dur-press': '0.1s', '--dur-fast': '0.2s', '--dur-base': '0.35s', '--dur-sheet-in': '0.5s', '--dur-sheet-out': '0.34s', '--tabs-h': 'var(--ift-h, 64px)', '--gutter': '16px',
    '--pos': 'var(--good-text)', '--neg': 'var(--danger)', '--chart-grid': 'var(--line)', '--chart-axis': 'var(--text-2)', '--chart-now': 'var(--text-3)' };
  for (const [k, v] of Object.entries(ROOT)) assert.equal(get(':root', null, k), v, k);
  assert.ok(get(':root', null, '--hd-h'), '--hd-h has a first value');
  assert.equal(get(':root:not([data-theme="dark"])', 'prefers-color-scheme: light', '--bar'), 'rgba(250, 250, 253, 0.8)');
  assert.equal(get(':root[data-theme="light"]', null, '--bar'), 'rgba(250, 250, 253, 0.8)');
  // [app, light acc, dark acc, light ink, dark ink, fill]
  const ACC = [['inflite', '#5a4fe0', '#9a90ff', '#5a4fe0', '#9a90ff', '#5a4fe0'], ['chat', '#2a6ae6', '#6ea6ff', '#1f63d6', '#6ea6ff', '#1f63d6'],
    ['weather', '#2f7af0', '#6aa8ff', '#1f63d6', '#6aa8ff', '#1f63d6'], ['fitness', '#e8532f', '#ff8a68', '#b93a1c', '#ff8a68', '#b93a1c'],
    ['markets', '#138a52', '#4fd18e', '#0a7a4d', '#4fd18e', '#0a7a4d'], ['mail', '#0f8f8a', '#45cfc8', '#0b7a76', '#45cfc8', '#0b7a76']];
  for (const [app, la, da, li, di, fill] of ACC) {
    const sel = `[data-app="${app}"]`;
    assert.equal(get(sel, null, '--acc'), da, `${app} dark --acc`);
    assert.equal(get(sel, null, '--acc-ink'), di, `${app} dark --acc-ink`);
    assert.equal(get(sel, null, '--acc-fill'), fill, `${app} --acc-fill`);
    assert.equal(get(sel, null, '--on-acc'), '#fff', `${app} --on-acc`);
    for (const [pre, media] of [[':root:not([data-theme="dark"])', 'prefers-color-scheme: light'], [':root[data-theme="light"]', null]]) {
      for (const s of [`${pre}${sel}`, `${pre} ${sel}`]) {
        assert.equal(get(s, media, '--acc'), la, `${s} --acc`);
        assert.equal(get(s, media, '--acc-ink'), li, `${s} --acc-ink`);
      }
    }
  }
  assert.equal(get(':root', null, '--acc'), '#9a90ff', 'InFlite’s own accent at the root, dark');
  assert.equal(get(':root', null, '--acc-fill'), '#5a4fe0');
  assert.equal(get('[data-app]', null, '--acc-wash'), 'color-mix(in srgb, var(--acc) 16%, transparent)');
  assert.equal(get(':root:not([data-theme="dark"]) [data-app]', 'prefers-color-scheme: light', '--acc-wash'), 'color-mix(in srgb, var(--acc) 13%, transparent)');
  assert.equal(get(':root[data-theme="light"] [data-app]', null, '--acc-wash'), 'color-mix(in srgb, var(--acc) 13%, transparent)');
});

// ---- Weather's module (MAIN) ----

test('Weather’s module exports CONTRACT 1, BUILD and NEWS equal to weather/app.js’s, SECTIONS equal to the router’s and the connector’s, and mount', () => {
  const has = exportsOf(WEATHER);
  for (const n of ['CONTRACT', 'BUILD', 'NEWS', 'SECTIONS', 'mount']) assert.ok(has.has(n), `weather.js exports ${n}`);
  assert.match(uncomment(WEATHER), /\bexport\s+async\s+function\s+mount\s*\(\s*root\s*,\s*fw\s*\)/);
  assert.equal(literalOf(WEATHER, 'CONTRACT'), 1);
  assert.equal(literalOf(WEATHER, 'BUILD'), constOf(APP, 'BUILD'), 'BUILD = weather/app.js’s (I raises both together)');
  assert.equal(literalOf(WEATHER, 'NEWS'), constOf(APP, 'NEWS'), 'NEWS = weather/app.js’s');
  const SECTIONS = [['now', 'Now'], ['days', '16 Days'], ['radar', 'Radar'], ['warnings', 'Warnings']];
  assert.deepEqual(literalOf(WEATHER, 'SECTIONS'), SECTIONS);
  assert.deepEqual(connector.sections, SECTIONS);
  if (R) assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY.weather.sections)), SECTIONS, 'the router’s REGISTRY');
  if (R) assert.deepEqual({ ...R.REGISTRY.weather.aliases }, connector.aliases);
});

test('each module file exports its frozen names: the openers, the section views, core’s functions, S’s shape and the event names', () => {
  const want = {
    'weather.js': ['CONTRACT', 'BUILD', 'NEWS', 'SECTIONS', 'mount'],
    'connector.js': ['CONNECTOR', 'connector'],
    'core.js': ['S', 'EVENTS', 'on', 'emit', 'start', 'stop', 'defaults', 'CARDS', 'layoutOf', 'solarOf', 'notifyOf', 'loadSettings', 'saveSettings', 'place', 'addPlace', 'removePlace', 'movePlace', 'setPlace', 'go', 'refresh', 'tuned', 'shaped', 'radarRain', 'snapshotNow', 'baseline', 'locate', 'fromLink', 'sectionOf', 'peek', 'answerAsk'],
    'sync.js': ['SYNCED', 'canon', 'mine', 'snapOf', 'sameAs', 'combine', 'takeUp', 'inStepSoon', 'keepInStep', 'stepOnce', 'pull', 'adopt', 'signedOut'],
    'places.js': ['openPlaces', 'confirmPlace'],
    'radarview.js': ['view'], 'now.js': ['view'], 'days.js': ['view', 'openDay'], 'warnings.js': ['view', 'openWarning'],
    'wxui.js': ['skyClass', 'openDetail', 'openCredits'],
    'wxsettings.js': ['openSettings'],
  };
  for (const [f, names] of Object.entries(want)) {
    const src = read(new URL(f, MOD)), has = exportsOf(src);
    for (const n of names) assert.ok(has.has(n), `weather/roof/${f} exports ${n}`);
  }
  for (const f of ['radarview.js', 'now.js', 'days.js', 'warnings.js']) assert.match(uncomment(read(new URL(f, MOD))), /\bexport\s+function\s+view\s*\(\s*el\s*,\s*ctx\s*\)/, `${f}: view(el, ctx)`);
  const core = read(new URL('core.js', MOD));
  assert.deepEqual(keysOf(core, 'S').sort(), ['acct', 'ask', 'cur', 'error', 'f', 'loading', 'now', 'places', 'settings', 'stale', 'updatedAt', 'wx'], 'S’s shape');
  assert.deepEqual([...literalOf(core.replace(/Object\.freeze\((\[[^\]]*\])\)/, '$1'), 'EVENTS')].sort(), ['acct', 'ask', 'error', 'loading', 'place', 'settings', 'wx']);
  for (const [f, re] of [['places.js', /export\s+(?:async\s+)?function\s+openPlaces\s*\(\s*ctx\s*\)/], ['places.js', /export\s+async\s+function\s+confirmPlace\s*\(\s*ctx\s*,\s*p\s*\)/],
    ['days.js', /export\s+function\s+openDay\s*\(\s*ctx\s*,\s*key\s*\)/], ['warnings.js', /export\s+function\s+openWarning\s*\(\s*ctx\s*,\s*w\s*\)/],
    ['wxui.js', /export\s+function\s+openDetail\s*\(\s*ctx\s*,\s*kind\s*\)/], ['wxui.js', /export\s+function\s+openCredits\s*\(\s*ctx\s*,\s*which\s*\)/],
    ['wxsettings.js', /export\s+function\s+openSettings\s*\(\s*ctx\s*,\s*page\b/], ['core.js', /export\s+async\s+function\s+saveSettings\s*\(\s*patch\s*\)/]]) assert.match(uncomment(read(new URL(f, MOD))), re, `${f}: ${re}`);
});

test('the connector: no imports, ≤ 4 KB, the agreed words, Weather’s sections and aliases, mini and search', () => {
  const src = read(new URL('connector.js', MOD));
  assert.ok(!/\bimport\b/.test(uncomment(src)), 'no imports');
  assert.ok(Buffer.byteLength(src) <= 4096, `${Buffer.byteLength(src)} bytes`);
  assert.equal(CONNECTOR, 1);
  assert.equal(connector.app, 'weather');
  assert.equal(connector.name, 'Weather');
  assert.deepEqual(connector.shares, {
    cards: 'Today’s weather card, rain on your ride, warnings',
    search: 'Your saved places, on this phone',
    notifications: 'Rain alerts, warnings, the morning briefing and sunshine for your panels, through InFlite',
    actions: 'Open Now, 16 Days, Radar or Warnings; send the forecast',
    screens: 'Now · 16 Days · Radar · Warnings',
  });
  assert.deepEqual(connector.aliases, { day: 'days', settings: 'now' });
  assert.equal(typeof connector.mini, 'function');
  assert.equal(typeof connector.search, 'function');
  assert.equal(connector.mini(null), null);
  assert.equal(connector.mini({ cards: { weather: { state: 'none' } } }), null);
});

test('connector.files: every file there, the CSS in it, and the whole static import graph from weather.js, which never reaches vendor/, the radar stack or the rain files', () => {
  const files = connector.files;
  assert.ok(Array.isArray(files) && files.length && new Set(files).size === files.length, 'a list, no repeats');
  for (const f of files) {
    assert.match(f, /^\/weather\//, f);
    assert.ok(existsSync(new URL(f.slice(1), MAIN)), `${f} exists`);
  }
  const css = ['/weather/roof/weather.css', '/weather/roof/wxcore.css', '/weather/roof/wxsettings.css', '/weather/roof/radar.css'];
  for (const f of css) assert.ok(files.includes(f), `${f} in files`);
  if (R) for (const f of R.REGISTRY.weather.css) assert.ok(files.includes(f), `REGISTRY ${f} in files`);
  const graph = graphFrom(new URL('weather.js', MOD));
  for (const f of graph) assert.ok(files.includes(f), `${f} is in the static graph, so in connector.files`);
  const never = ['radar.js', 'radarmix.js', 'radarwork.js', 'mapstyle.js', 'mapgl.js', 'mapleaf.js', 'rainmap.js', 'radarrain.js'].map((f) => `/weather/${f}`);
  for (const f of [...graph, ...files]) {
    assert.ok(!f.startsWith('/weather/vendor/'), `${f}: vendor/ only through fw.lazy`);
    assert.ok(!never.includes(f), `${f}: only through fw.lazy`);
  }
  // (the 14 reused, as §7.1 agrees them)
  const reused = graph.filter((f) => !f.startsWith('/weather/roof/')).sort();
  assert.deepEqual(reused, ['account', 'agree', 'charts', 'climate', 'codes', 'data', 'format', 'icons', 'insights', 'official', 'send', 'skill', 'sky', 'solar'].map((f) => `/weather/${f}.js`));
});

test('every dynamic import in the module sits inside fw.lazy( (D21)', () => {
  // (the rule bites)
  assert.deepEqual(lazyOutside('const r = await fw.lazy(() => import("../radar.js"));'), []);
  assert.deepEqual(lazyOutside('ctx.fw.lazy(async () => import("../rainmap.js"))'), []);
  assert.equal(lazyOutside('const r = await import("../radar.js");').length, 1);
  assert.equal(lazyOutside('fw.lazy(() => 1); import("../x.js")').length, 1);
  assert.deepEqual(lazyOutside('// import("../x.js")\nconst u = import.meta.url;'), []);
  for (const f of jsFiles(MOD)) assert.deepEqual(lazyOutside(read(new URL(f, MOD))), [], `weather/roof/${f}`);
});

test('the module keeps §5.1’s rules: no service worker, history, location change, confirm/alert, IFL, page selectors, today:* key, indexedDB or parent; window/document listeners removed', () => {
  const RULES = [
    [/serviceWorker/, 'registers no service worker'],
    [/(?:\b(?:window|globalThis)\s*\.\s*|(?<![.\w$]))history\s*\./, 'no history.*'],
    [/(?:\b(?:window|globalThis|document)\s*\.\s*|(?<![.\w$]))location\s*(?:\.\s*(?:assign|replace|reload)\s*\(|(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=))/, 'no location changes (reading only)'],
    [/(?<![.\w$])(?:confirm|alert|prompt)\s*\(|\bwindow\s*\.\s*(?:confirm|alert|prompt)\s*\(/, 'no confirm()/alert()'],
    [/\bIFL\s*\./, 'no IFL.'],
    [/\bdocument\s*\.\s*(?:getElementById|querySelector|querySelectorAll|getElementsBy\w+)\s*\(/, 'no document.getElementById/querySelector (only root, fw.screenEl and what it made)'],
    [/["'`]today:/, 'no today:* key'],
    [/\bindexedDB\b/, 'no indexedDB'],
    [/(?<![.\w$])parent\s*\./, 'no parent.'],
    [/["'`]#(?:hd|tabs)\b|ifl-tabs|\.ifh-/, 'never the header’s or the tab bar’s DOM'],
  ];
  for (const f of jsFiles(MOD)) {
    const s = uncomment(read(new URL(f, MOD)));
    for (const [re, why] of RULES) assert.ok(!re.test(s), `weather/roof/${f}: ${why} (${re.exec(s)?.[0]})`);
    for (const m of s.matchAll(/\b(window|document)\s*\.\s*addEventListener\s*\(\s*(["'`])([\w:-]+)\2/g)) assert.match(s, new RegExp(`\\b${m[1]}\\s*\\.\\s*removeEventListener\\s*\\(\\s*["'\`]${m[3]}["'\`]`), `weather/roof/${f}: ${m[1]}'s "${m[3]}" listener removed (in unmount)`);
  }
  // (the rules bite)
  assert.ok(RULES[3][0].test('if (confirm("x")) 1') && !RULES[3][0].test('ctx.open.confirm(p); confirmPlace(ctx, p)'));
  assert.ok(RULES[2][0].test('location.href = "/"') && RULES[2][0].test('window.location.assign("/")') && RULES[2][0].test('location.reload()') && !RULES[2][0].test('const p = location.pathname; if (location.hash === "#x") 1; w.location = 2'));
  assert.ok(RULES[1][0].test('history.back()') && RULES[1][0].test('window.history.pushState(1)') && !RULES[1][0].test('wx.history.length'));
  assert.ok(RULES[8][0].test('parent.postMessage(1)') && !RULES[8][0].test('el.parentNode; a.parent.x'));
});

test('the module’s CSS defines nothing on :root, html or body', () => {
  for (const f of readdirSync(MOD).filter((x) => x.endsWith('.css'))) {
    const css = read(new URL(f, MOD)).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const sel = m[1].trim();
      if (sel.startsWith('@')) continue;
      assert.ok(!/(^|[\s,>+~(])(?::root|html|body)(?![\w-])/.test(sel), `weather/roof/${f}: ${sel}`);
    }
  }
});

test('no style attribute and no inline handler in either folder (the pages’ CSP refuses both)', () => {
  const dirs = [[MOD, 'weather/roof']];
  if (!roofSkip) dirs.push([ROOF, 'inflite today/public/roof']);
  for (const [dir, name] of dirs) for (const f of jsFiles(dir)) {
    const s = uncomment(read(new URL(f, dir)));
    assert.ok(!/style=\\?["']/.test(s), `${name}/${f} writes a style attribute`);
    assert.ok(!/setAttribute\(\s*["'`]style["'`]/.test(s), `${name}/${f} sets a style attribute`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(s), `${name}/${f} writes an inline handler`);
  }
});
