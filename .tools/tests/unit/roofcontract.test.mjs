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
import { MAIN, ROOF, IFL, roofSkip, appsSkip, mailSkip, fileOf } from './fixtures/roof.mjs';
import { staticGraph, lazyClosure, isNet, NET } from './fixtures/budget.mjs';

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
// (a const's literal on one line of the raw text, never uncommented first: a quoted string (which may hold ; or //), a
// number, or an array literal; `export const NAME = <literal>;` for literalOf, the same with or without export for
// constOf. A line inside a comment doesn't start with const, so it never matches.)
const LITERAL = String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|-?\d+(?:\.\d+)?|\[[^\n]*\])`;
const lit = (src, name, exp) => { const m = new RegExp(String.raw`^[ \t]*${exp ? String.raw`export\s+` : String.raw`(?:export\s+)?`}const\s+${name}\s*=\s*${LITERAL}\s*;`, 'm').exec(src); return m ? Function(`"use strict"; return (${m[1]});`)() : undefined; };
const literalOf = (src, name) => lit(src, name, true);
const constOf = (src, name) => lit(src, name, false);
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
// (the static import graph from a file: import … from "x", export … from "x", import "x". A specifier is followed when
// relative (./, ../) or absolute on this site under /weather/ (resolved against MAIN); any other (a bare name, another
// path, a URL) is a failure: the module's static imports stay inside Weather's files, so connector.files lists them all.)
function graphFrom(start) {
  const seen = new Set(), todo = [start], bad = [];
  while (todo.length) {
    const u = todo.pop();
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    const s = uncomment(read(u));
    for (const m of s.matchAll(/\b(?:import|export)\s+(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"']+)["']/g)) {
      const spec = m[1];
      if (/^\.{1,2}\//.test(spec)) todo.push(new URL(spec, u));
      else if (/^\/weather\/[\w./-]+$/.test(spec) && !spec.includes('..')) todo.push(new URL(spec.slice(1), MAIN));
      else bad.push(`${'/' + u.href.slice(MAIN.href.length)}: ${spec}`);
    }
  }
  assert.deepEqual(bad, [], 'static imports are relative or /weather/…');
  return [...seen].map((h) => '/' + h.slice(MAIN.href.length));
}
// (every import( must be the body of fw.lazy(() => …): `fw.lazy(() => import(` or `fw.lazy(async () => import(`, or with
// the retry suffix's parameter, `fw.lazy((q) => import("./x.js" + q))` (s24-contracts §7); its first argument a string
// literal naming the file)
const lazyOutside = (src) => { const s = uncomment(src), bad = []; for (const m of s.matchAll(/\bimport\s*\(/g)) if (!/fw\.lazy\(\s*(?:async\s*)?\(\s*(?:[A-Za-z_$][\w$]*)?\s*\)\s*=>\s*(?:await\s+)?$/.test(s.slice(Math.max(0, m.index - 60), m.index)) || !/^import\s*\(\s*["']/.test(s.slice(m.index))) bad.push(s.slice(Math.max(0, m.index - 40), m.index + 30)); return bad; };
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
    'connectors.js': ['STATIC', 'connectorOf', 'miniOf', 'openConnector', 'placesProvider', ...(appsSkip ? [] : ['connectorProvider'])],
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

test('roof.css’s token block: neutral shared surfaces, geometry and one action accent in every app and theme', { skip: roofSkip }, () => {
  // (rules by selector, inside a light media block or not; declarations as a map)
  const css = (read(new URL('today/public/app.css', IFL)) + '\n' + read(new URL('roof.css', ROOF))).replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '');
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
  const ROOT = { '--bar': 'var(--ifl-surface, #191c19)', '--r-sheet': 'var(--ifl-radius-sheet, 30px)', '--r-well': 'var(--ifl-radius-row, 16px)', '--r-pill': 'var(--ifl-radius-pill, 999px)', '--ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
    '--dur-press': '0.1s', '--dur-fast': '0.2s', '--dur-base': '0.35s', '--dur-sheet-in': '0.5s', '--dur-sheet-out': '0.34s', '--tabs-h': 'var(--ift-h, 64px)', '--gutter': '16px',
    '--pos': 'var(--good-text)', '--neg': 'var(--danger)', '--chart-grid': 'var(--line)', '--chart-axis': 'var(--text-2)', '--chart-now': 'var(--text-3)' };
  for (const [k, v] of Object.entries(ROOT)) assert.equal(get(':root', null, k), v, k);
  assert.ok(get(':root', null, '--hd-h'), '--hd-h has a first value');
  // The November neutral refresh replaces six per-app control hues with one shared action accent.
  // Keep exact aliases and theme values checked, alongside all the motion, chart and geometry hooks above.
  const ACC = { '--acc': 'var(--ifl-accent, #73d781)', '--acc-ink': 'var(--ifl-accent-ink, #97e84e)',
    '--acc-fill': 'var(--ifl-accent-fill, #73d781)', '--on-acc': 'var(--ifl-on-accent, #10150d)',
    '--acc-wash': 'var(--ifl-accent-wash, color-mix(in srgb, var(--acc) 15%, transparent))' };
  for (const [prop, value] of Object.entries(ACC)) {
    assert.equal(get(':root', null, prop), value, `root ${prop}`);
    assert.equal(get('[data-app]', null, prop), value, `all apps ${prop}`);
    for (const app of ['inflite', 'chat', 'weather', 'fitness', 'markets', 'mail']) {
      const sel = `[data-app="${app}"]`;
      for (const [pre, media] of [['', null], [':root:not([data-theme="dark"])', 'prefers-color-scheme: light'], [':root[data-theme="light"]', null], [':root[data-theme="dark"]', null]]) {
        for (const context of pre ? [`${pre}${sel}`, `${pre} ${sel}`] : [sel]) {
          const override = get(context, media, prop);
          assert.equal(override ?? get('[data-app]', null, prop), value, `${context} ${prop} stays shared`);
        }
      }
    }
  }
  const LIGHT = { '--ifl-page': '#f8f9f6', '--ifl-surface': '#ffffff', '--ifl-surface-2': '#f1f2ef', '--ifl-raised': '#ffffff',
    '--ifl-text': '#171a18', '--ifl-muted': '#646a66', '--ifl-accent': '#2ea84d', '--ifl-accent-ink': '#247a35' };
  const DARK = { '--ifl-page': '#101210', '--ifl-surface': '#191c19', '--ifl-surface-2': '#222622', '--ifl-raised': '#2b302b',
    '--ifl-text': '#f4f7f2', '--ifl-muted': '#bac2b9', '--ifl-accent': '#97e84e', '--ifl-accent-ink': '#97e84e' };
  for (const [prop, value] of Object.entries(LIGHT)) {
    assert.equal(get(':root', null, prop), value, `light default ${prop}`);
    assert.equal(get(':root:not([data-theme="dark"])', 'prefers-color-scheme: light', prop) ?? get(':root', null, prop), value, `automatic light ${prop}`);
    assert.equal(get(':root[data-theme="light"]', null, prop) ?? get(':root', null, prop), value, `explicit light ${prop}`);
  }
  for (const [prop, value] of Object.entries(DARK)) {
    assert.equal(get(':root:not([data-theme="light"])', 'prefers-color-scheme: dark', prop), value, `automatic dark ${prop}`);
    assert.equal(get(':root[data-theme="dark"]', null, prop), value, `explicit dark ${prop}`);
  }
  for (const [prop, value] of Object.entries({ '--ifl-radius-card': '26px', '--ifl-radius-group': '22px', '--ifl-radius-sheet': '30px', '--ifl-radius-row': '16px', '--ifl-radius-pill': '999px',
    '--ifl-accent-gradient': 'linear-gradient(110deg, #24c872, #b8eb2b)', '--ifl-on-accent': '#10150d' })) assert.equal(get(':root', null, prop), value, prop);

});

// ---- Weather's module (MAIN) ----

test('Weather’s module exports CONTRACT 1, BUILD and NEWS equal to weather/app.js’s, SECTIONS equal to the router’s and the connector’s, and mount', () => {
  const has = exportsOf(WEATHER);
  for (const n of ['CONTRACT', 'BUILD', 'NEWS', 'SECTIONS', 'mount']) assert.ok(has.has(n), `weather.js exports ${n}`);
  assert.match(uncomment(WEATHER), /\bexport\s+async\s+function\s+mount\s*\(\s*root\s*,\s*fw\s*\)/);
  // (the reader bites: a NEWS with ; and // in it, a commented-out line, a const that isn't exported)
  assert.equal(literalOf('export const NEWS = "Rain; then sun // later";\n', 'NEWS'), 'Rain; then sun // later');
  assert.equal(constOf('// const BUILD = "0.1";\nconst BUILD = "1.66"; // raised\n', 'BUILD'), '1.66');
  assert.equal(literalOf('const BUILD = "1.66";\n', 'BUILD'), undefined);
  assert.deepEqual(literalOf('export const S = [["a", "b;c"], ["d", "e"]];\n', 'S'), [['a', 'b;c'], ['d', 'e']]);
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
  // (the real card's shape, functions/_todaywx.js weatherCard with v=2: now.temp already a string, the hours at hours.list,
  // the rain in real ms, said on the place's clock)
  const card = { state: 'ok', offset: 3600, clock: '24', now: { temp: '14°' }, hours: { label: 'Next four hours', list: [{ pop: 0 }, { pop: 20 }, { pop: 45 }, { pop: 80 }, { pop: 100 }, { pop: 60 }] },
    rain: { now: false, at: Date.UTC(2026, 10, 3, 14, 0), end: null, peak: null } };
  assert.deepEqual(connector.mini({ cards: { weather: card } }), { kind: 'num-bars', num: '14°', bars: [0, 20, 45, 80, 100], label: 'Rain from 15:00' });
  assert.equal(connector.mini({ cards: { weather: { ...card, rain: { now: true, at: null } } } }).label, 'Raining now');
  assert.deepEqual(connector.mini({ cards: { weather: { ...card, rain: null, hours: { list: [{ pop: 30 }] } } } }), { kind: 'num-bars', num: '14°', bars: [30, 0, 0, 0, 0], label: '' });
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
  assert.deepEqual(reused, ['account', 'agree', 'charts', 'climate', 'codes', 'data', 'format', 'icons', 'insights', 'location', 'official', 'send', 'skill', 'sky', 'solar'].map((f) => `/weather/${f}.js`));
});

test('every dynamic import in the module sits inside fw.lazy( (D21)', () => {
  // (the rule bites)
  assert.deepEqual(lazyOutside('const r = await fw.lazy(() => import("../radar.js"));'), []);
  assert.deepEqual(lazyOutside('ctx.fw.lazy(async () => import("../rainmap.js"))'), []);
  assert.equal(lazyOutside('const r = await import("../radar.js");').length, 1);
  assert.equal(lazyOutside('fw.lazy(() => 1); import("../x.js")').length, 1);
  assert.deepEqual(lazyOutside('// import("../x.js")\nconst u = import.meta.url;'), []);
  assert.deepEqual(lazyOutside('fw.lazy((q) => import("./stock.js" + q))'), [], 'the retry suffix (s24 §7)');
  assert.equal(lazyOutside('fw.lazy((q) => import(name + q))').length, 1, 'never without its literal');
  for (const f of jsFiles(MOD)) assert.deepEqual(lazyOutside(read(new URL(f, MOD))), [], `weather/roof/${f}`);
});

// (listeners on the page's globals: window., document., globalThis., self., or a bare addEventListener( (= window's);
// each must have its removeEventListener of the same type on the same global, document's on document)
const GLOBAL_EV = (verb) => new RegExp(String.raw`(?:\b(window|document|globalThis|self)\s*\.\s*|(?<![.\w$]))${verb}EventListener\s*\(\s*(?:(["'\`])([\w:-]+)\2)?`, 'g');
const pairs = (s, verb) => [...s.matchAll(GLOBAL_EV(verb))].map((m) => [m[1] || 'window', m[3] ?? '(not a literal)']);
const globalListeners = (s) => pairs(s, 'add');
const globalRemoves = (s) => pairs(s, 'remove');
const sameGlobal = (a, b) => (a === 'document') === (b === 'document');

test('the module keeps §5.1’s rules: no service worker, history, location change, confirm/alert, IFL, page selectors, today:* key, indexedDB or parent; window/document listeners removed', () => {
  const RULES = [
    [/serviceWorker/, 'registers no service worker'],
    [/(?:\b(?:window|globalThis)\s*\.\s*|(?<![.\w$]))history\s*\./, 'no history.*'],
    [/(?:\b(?:window|globalThis|document)\s*\.\s*|(?<![.\w$]))location\s*(?:\.\s*(?:assign|replace|reload)\s*\(|(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=))/, 'no location changes (reading only)'],
    [/(?<![.\w$])(?:confirm|alert|prompt)\s*\(|\bwindow\s*\.\s*(?:confirm|alert|prompt)\s*\(/, 'no confirm()/alert()'],
    [/\bIFL\b/, 'no IFL (window.IFL, IFL.…)'],
    [/\bdocument\s*\.\s*(?:getElementById|querySelector|querySelectorAll|getElementsBy\w+)\s*\(/, 'no document.getElementById/querySelector (only root, fw.screenEl and what it made)'],
    [/["'`]today:/, 'no today:* key'],
    [/\bindexedDB\b/, 'no indexedDB'],
    [/(?<![.\w$])parent\s*\./, 'no parent.'],
    [/["'`]#(?:hd|tabs)\b|ifl-tabs|\.ifh-/, 'never the header’s or the tab bar’s DOM'],
  ];
  for (const f of jsFiles(MOD)) {
    const s = uncomment(read(new URL(f, MOD)));
    for (const [re, why] of RULES) assert.ok(!re.test(s), `weather/roof/${f}: ${why} (${re.exec(s)?.[0]})`);
    for (const [who, type] of globalListeners(s)) assert.ok(globalRemoves(s).some(([w, t]) => t === type && sameGlobal(w, who)), `weather/roof/${f}: ${who}'s "${type}" listener removed (in unmount)`);
  }
  // (the rules bite)
  assert.ok(RULES[3][0].test('if (confirm("x")) 1') && !RULES[3][0].test('ctx.open.confirm(p); confirmPlace(ctx, p)'));
  assert.ok(RULES[2][0].test('location.href = "/"') && RULES[2][0].test('window.location.assign("/")') && RULES[2][0].test('location.reload()') && !RULES[2][0].test('const p = location.pathname; if (location.hash === "#x") 1; w.location = 2'));
  assert.ok(RULES[1][0].test('history.back()') && RULES[1][0].test('window.history.pushState(1)') && !RULES[1][0].test('wx.history.length'));
  assert.ok(RULES[8][0].test('parent.postMessage(1)') && !RULES[8][0].test('el.parentNode; a.parent.x'));
  assert.ok(RULES[4][0].test('const I = window.IFL;') && RULES[4][0].test('IFL.hub.go("/")') && !RULES[4][0].test('const IFLY = 1; fw.ifl'));
  assert.deepEqual(globalListeners('addEventListener("resize", f); window.addEventListener("keydown", g); globalThis.addEventListener("online", h); self.addEventListener("x", k); document.addEventListener("visibilitychange", v); el.addEventListener("click", c); a.b.addEventListener("y", d)'),
    [['window', 'resize'], ['window', 'keydown'], ['globalThis', 'online'], ['self', 'x'], ['document', 'visibilitychange']]);
  assert.deepEqual(globalListeners('addEventListener(type, f)'), [['window', '(not a literal)']], 'a type that isn’t a literal pairs only with a remove whose type isn’t one either');
  assert.ok(sameGlobal('window', 'self') && sameGlobal('globalThis', 'window') && !sameGlobal('document', 'window'));
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

// ==== Stages 2–4 (s2/spec.md §3 C2–C5, §4; s24-contracts §3, §5, §8, §9): every REGISTRY module on disk ====
// Markets and Fitness are this repo's (<app>/roof/), Mail the inflite repo's (email/public/roof/, served at /mail/roof/);
// Weather's own cases are above and unchanged. A file that still exports STUB is B0's (j0's) stub: its behaviour cases
// skip with "still B0's stub", its names and graph are checked all the same.
const APPS2 = ['markets', 'fitness', 'mail'];
const homeOf = (app) => (app === 'mail' ? IFL && new URL('email/public/roof/', IFL) : new URL(`${app}/roof/`, MAIN));
const appSkip = (app) => (app === 'mail' ? mailSkip : appsSkip) || (!existsSync(new URL(`${app}.js`, homeOf(app))) && `no ${app}/roof/${app}.js on disk yet`);
const appJs = (app) => (app === 'mail' ? new URL('email/public/app.js', IFL) : new URL(`${app}/app.js`, MAIN));
const stub = (u) => exportsOf(read(u)).has('STUB');
const modFiles = (app) => readdirSync(homeOf(app)).filter((f) => f.endsWith('.js'));
// (the frozen names each file of Markets' and Fitness's exports (§4.2, §4.3, §4.7, as j0's stubs wrote them): the real
// files keep every one; Mail's are stage 4's roofmailcontract.test's)
const FROZEN = {
  markets: {
    'markets.js': ['CONTRACT', 'BUILD', 'NEWS', 'SECTIONS', 'mount'], 'connector.js': ['CONNECTOR', 'connector'],
    'core.js': ['S', 'EVENTS', 'store', 'on', 'emit', 'start', 'stop', 'shown', 'busy', 'fmt', 'money', 'signed', 'pct', 'tone', 'priceSaid', 'chgSaid', 'plainSym', 'ago', 'rate', 'owned', 'valueOf', 'dayOf', 'divsOf', 'paidFor', 'unpriced', 'leftOutSaid', 'totals', 'byAccount', 'income', 'growthOf', 'isaYear', 'daySeries', 'marketSaid', 'lineSaid', 'insights', 'take', 'loadYears', 'loadPaid', 'loadIncome', 'refresh', 'loadNews', 'follow', 'removeHolding', 'alertSet', 'recent', 'live', 'calm'],
    'mkui.js': ['bind', 'h', 'icon', 'openSheet', 'pushSheet', 'drawSheet', 'closeSheet', 'toast', 'render', 'sparkCard', 'mixBar', 'vbars', 'range52', 'ring', 'chart', 'paint'],
    'todayview.js': ['view'], 'holdings.js': ['view', 'openAccount', 'openAbout'], 'news.js': ['view', 'openStory'], 'stock.js': ['openStock'],
    'edit.js': ['searchView', 'openHolding'], 'money.js': ['openIncome', 'openVs', 'openIsa'],
  },
  fitness: {
    'fitness.js': ['CONTRACT', 'BUILD', 'NEWS', 'SECTIONS', 'mount'], 'connector.js': ['CONNECTOR', 'connector'],
    'core.js': ['S', 'EVENTS', 'store', 'on', 'emit', 'start', 'stop', 'shown', 'busy', 'saveSettings', 'A', 'BT', 'C', 'E', 'F', 'G', 'M', 'P', 'R', 'adopt', 'record', 'estimate', 'setNumber', 'logFtp', 'keep', 'inStep', 'rh', 'plannedOn', 'weeks', 'actsOn', 'sumOf', 'held', 'full', 'fileKey', 'readOff', 'load', 'sumUp', 'resum', 'fitnessSeries', 'fetchMe', 'lastMe', 'arrive', 'takeUp', 'pull', 'newDay', 'todayRides', 'todaySnap', 'todayRefresh', 'morningDays', 'forgetCopies', 'wellByDay', 'nightsFrom', 'nightsSeries', 'myPlan', 'planStart', 'rhDay', 'rhythmOn', 'missed', 'lightNow', 'paceFor', 'isSet', 'weekIndex', 'wkById', 'eventDay', 'choosePlan', 'numbers', 'runSpeed', 'swimSpeed', 'weekZip', 'setActs', 'saveFile', 'stopped'],
    'fxui.js': ['bind', 'unbind', 'h', 'svg', 'icon', 'card', 'row', 'section', 'stat', 'wait', 'sportIcon', 'sportTile', 'face', 'stepper', 'calendar', 'toast', 'redraw', 'go', 'openSheet', 'pushSheet', 'sheetBack', 'drawSheet', 'closeSheet', 'sheetEl', 'chooseFiles', 'wide', 'mainW', 'partW', 'sheetW', 'cardW', 'mapsAlways'],
    'fxcalc.js': ['rhythmSaid', 'dayStamp', 'dayChanges', 'progActs', 'rollAvg'], 'idb.js': ['idb', 'keepFile', 'dropFile', 'tidyFiles', 'close'],
    'todayview.js': ['view'], 'offers.js': ['offerCards', 'undoToday', 'openOffer', 'addView'],
    'actsview.js': ['view', 'openAct', 'openActMap', 'openActShare', 'openRename', 'openForm', 'openUpload'],
    'progview.js': ['view', 'openPower', 'openTraining', 'openEngine', 'openYear'],
    'planview.js': ['openSession', 'openWorkout', 'openDay', 'openMove', 'openWorkouts', 'openRhythmSetup', 'openSendDevice'],
    'fxsettings.js': ['openSettings'],
  },
};
// (the connectors' words, frozen by B0: s2/spec.md §4.2, §4.3)
const SHARES = {
  markets: { cards: 'How your holdings are doing today', search: 'Your holdings, on this phone', notifications: 'Price alerts and the evening wrap', actions: 'Open a stock or a section; send a stock’s day in percent', screens: 'Today · Holdings · News' },
  fitness: { cards: 'Today’s session or the ride you’ve done', search: 'Your activities and sessions, on this phone', notifications: 'Your session, in the morning notification', actions: 'Open Today, Activities, Routes or Progress; send a session', screens: 'Today · Activities · Routes · Progress' },
};

for (const app of APPS2) {
  const skip = appSkip(app);
  test(`${app}: the entry exports CONTRACT 1, BUILD and NEWS equal to ${app === 'mail' ? 'email/public' : app}/app.js’s, SECTIONS = REGISTRY = connector, mount(root, fw); every frozen name there`, { skip }, async () => {
    const H = homeOf(app), E = read(new URL(`${app}.js`, H)), A = read(appJs(app));
    assert.equal(literalOf(E, 'CONTRACT'), 1);
    assert.equal(literalOf(E, 'BUILD'), constOf(A, 'BUILD'), 'BUILD = app.js’s (I raises both together)');
    assert.equal(literalOf(E, 'NEWS'), constOf(A, 'NEWS'), 'NEWS = app.js’s');
    assert.match(uncomment(E), /\bexport\s+async\s+function\s+mount\s*\(\s*root\s*,\s*fw\s*\)/);
    const { connector: c, CONNECTOR: v } = await import(new URL('connector.js', H));
    assert.equal(v, 1);
    assert.deepEqual(literalOf(E, 'SECTIONS'), JSON.parse(JSON.stringify(R.REGISTRY[app].sections)));
    assert.deepEqual(c.sections, literalOf(E, 'SECTIONS'));
    assert.deepEqual({ ...c.aliases }, { ...R.REGISTRY[app].aliases });
    assert.equal(c.app, app); assert.equal(c.name, R.REGISTRY[app].name);
    for (const [f, names] of Object.entries(FROZEN[app] || {})) {
      const has = exportsOf(read(new URL(f, H)));
      for (const n of names) assert.ok(has.has(n), `${app}/roof/${f} exports ${n}`);
    }
    for (const f of ['todayview.js', 'holdings.js', 'news.js', 'actsview.js', 'progview.js']) if (existsSync(new URL(f, H)) && FROZEN[app]?.[f]) assert.match(uncomment(read(new URL(f, H))), /\bexport\s+function\s+view\s*\(\s*el\s*,\s*ctx\s*\)/, `${f}: view(el, ctx)`);
  });

  test(`${app}: the connector: no imports, ≤ 4 KB, its words, mini and search(q, { userId })`, { skip }, async () => {
    const src = read(new URL('connector.js', homeOf(app)));
    assert.ok(!/\bimport\b/.test(uncomment(src)), 'no imports');
    assert.ok(Buffer.byteLength(src) <= 4096, `${Buffer.byteLength(src)} bytes`);
    const { connector: c } = await import(new URL('connector.js', homeOf(app)));
    if (SHARES[app]) assert.deepEqual(c.shares, SHARES[app]);
    // (Markets' and Fitness's connectors search on the phone (s2 §2.5); Mail's has none: its provider is the mounted
    // module's, S4-D9)
    // (Mail's connector has a mini but no search: s4 S4-D9, s24 §5)
    assert.equal(typeof c.mini, 'function');
    if (app !== 'mail') assert.equal(typeof c.search, 'function');
    if (typeof c.search === 'function') assert.ok(Array.isArray(await c.search('', { userId: 'someone' })), 'search gives a list');
  });

  test(`${app}: connector.files = the static graph from the entry + REGISTRY’s CSS, exactly; lazy = the closure of the literal fw.lazy imports less files less NET; none in both; ≤ 60`, { skip }, async () => {
    const { connector: c } = await import(new URL('connector.js', homeOf(app)));
    const files = c.files, lazy = c.lazy || [];
    assert.ok(Array.isArray(files) && new Set(files).size === files.length, 'files: a list, no repeats');
    assert.ok(Array.isArray(lazy) && new Set(lazy).size === lazy.length, 'lazy: a list, no repeats');
    for (const f of [...files, ...lazy]) {
      assert.match(f, new RegExp(`^/${app}/`), `${f}: the app’s own path`);
      assert.ok(fileOf(f) && existsSync(fileOf(f)), `${f} exists`);
      assert.ok(!f.includes('/vendor/') && !isNet(app, f), `${f}: never vendor/ or a network-only file`);
    }
    const graph = await staticGraph(app);
    assert.deepEqual([...files].sort(), [...graph, ...R.REGISTRY[app].css].sort(), 'files: the static graph and the CSS, no more, no less');
    const lazyCSS = [...read(fileOf(R.REGISTRY[app].entry)).matchAll(/link\.href = "([^" ]+\.css)"/g)].map(m => m[1]);
    assert.deepEqual([...lazy].sort(), [...await lazyClosure(app, graph), ...lazyCSS].sort(), 'lazy: import closure and lazily linked CSS, kept offline together');
    assert.ok(!files.some((f) => lazy.includes(f)), 'files ∩ lazy = ∅');
    assert.ok(files.length + lazy.length <= 60, `files ∪ lazy: ${files.length + lazy.length} ≤ 60 (the root worker's cap)`);
    // (static imports stay inside the app's own files: never another module's, never app.js)
    for (const f of graph) assert.ok(!/\/app\.js$/.test(f), `${f}: never app.js`);
  });

  test(`${app}: every import( and new Worker( inside fw.lazy( with its literal; §5.1’s rules over ${app}/roof/*; indexedDB only in idb.js, opening REGISTRY’s name; /weather/vendor/ only from a NET file`, { skip }, () => {
    const H = homeOf(app), idb = R.REGISTRY[app].idb;
    for (const f of modFiles(app)) {
      const s = uncomment(read(new URL(f, H)));
      assert.deepEqual(lazyOutside(s), [], `${app}/roof/${f}: import( outside fw.lazy(`);
      for (const m of s.matchAll(/\bnew\s+Worker\s*\(/g)) assert.match(s.slice(Math.max(0, m.index - 60), m.index + 40), /fw\.lazy\(\s*(?:async\s*)?\(\s*\w*\s*\)\s*=>\s*new\s+Worker\(\s*new\s+URL\(\s*["']/, `${app}/roof/${f}: a Worker only as fw.lazy(() => new Worker(new URL("…", import.meta.url), …)) (C5)`);
      const RULES = [
        [/serviceWorker/, 'registers no service worker'],
        [/(?:\b(?:window|globalThis)\s*\.\s*|(?<![.\w$]))history\s*\./, 'no history.*'],
        [/(?:\b(?:window|globalThis|document)\s*\.\s*|(?<![.\w$]))location\s*(?:\.\s*(?:assign|replace|reload)\s*\(|(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=))/, 'no location changes'],
        [/(?<![.\w$]|function\s+)(?:confirm|alert|prompt)\s*\(|\bwindow\s*\.\s*(?:confirm|alert|prompt)\s*\(/, 'no confirm()/alert() (a module’s own opener of that name may be declared)'],
        [/\bIFL\b/, 'no IFL'],
        [/\bdocument\s*\.\s*(?:getElementById|querySelector|querySelectorAll|getElementsBy\w+)\s*\(/, 'no document-wide lookups'],
        [/["'`]today:/, 'no today:* key'],
        [/(?<![.\w$])parent\s*\./, 'no parent.'],
        [/["'`]#(?:hd|tabs)\b|ifl-tabs|\.ifh-/, 'never the header’s or the tab bar’s DOM'],
        [/\/weather\/vendor\//, '/weather/vendor/ only from a NET file (outside roof/)'],
      ];
      for (const [re, why] of RULES) assert.ok(!re.test(s), `${app}/roof/${f}: ${why} (${re.exec(s)?.[0]})`);
      if (/\bindexedDB\b/.test(s)) {
        assert.equal(f, 'idb.js', `${app}/roof/${f}: indexedDB only in idb.js (C5)`);
        assert.ok(idb, `${app} has no REGISTRY idb: no IndexedDB at all`);
        for (const m of s.matchAll(/indexedDB\s*\.\s*open\(\s*([^,)]+)/g)) assert.ok(new RegExp(`^["']${idb}["']$|^NAME$`).test(m[1].trim()), `${app}/roof/idb.js opens only "${idb}" (${m[1]})`);
      }
      for (const [who, type] of globalListeners(s)) assert.ok(globalRemoves(s).some(([w, t]) => t === type && sameGlobal(w, who)), `${app}/roof/${f}: ${who}'s "${type}" listener removed`);
      assert.ok(!/style=\\?["']/.test(s) && !/setAttribute\(\s*["'`]style["'`]/.test(s), `${app}/roof/${f}: no style attribute`);
      assert.ok(!/\son[a-z]+=\\?["']/.test(s), `${app}/roof/${f}: no inline handler`);
    }
  });

  test(`${app}: the module’s CSS is scoped: under .m-${app} or .ifl-sheet[data-app=${app}], nothing on :root, html or body`, { skip }, () => {
    const H = homeOf(app);
    for (const f of readdirSync(H).filter((x) => x.endsWith('.css'))) {
      const css = read(new URL(f, H)).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{/g)) {
        const sel = m[1].trim();
        if (sel.startsWith('@') || /^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(sel)) continue;
        for (const one of sel.split(',').map((x) => x.trim())) {
          assert.ok(!/(^|[\s,>+~(])(?::root|html|body)(?![\w-])/.test(one), `${app}/roof/${f}: ${one}`);
          assert.ok(one.startsWith(`.m-${app}`) || one.startsWith(`.ifl-sheet[data-app=${app}]`) || one.startsWith(`.ifl-sheet[data-app="${app}"]`) || one.startsWith(`[data-app="${app}"]`) || one.startsWith(`[data-app=${app}]`), `${app}/roof/${f}: ${one} isn’t scoped`);
        }
      }
    }
  });
}

test('markets: the connector’s search answers only for the account whose copy is kept, with no amount (RB1)', { skip: appSkip('markets') }, async (t) => {
  const u = new URL('markets/roof/connector.js', MAIN);
  if (stub(u)) return t.skip('still B0’s stub (MK’s roofmkviews proves it on the real one)');
  const { connector: c } = await import(u);
  globalThis.localStorage ||= { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
  localStorage.setItem('markets:last', JSON.stringify({ id: 'u1', me: { holdings: [{ sym: 'TSCO.L', name: 'Tesco', qty: 10, value: 3456.78 }] } }));
  assert.deepEqual(await c.search('tes', { userId: 'u2' }), [], 'another account: nothing');
  const mine = await c.search('tes', { userId: 'u1' });
  assert.ok(!/3456|345[67]/.test(JSON.stringify(mine)), 'no amount');
});

// ==== Stage 3 (Chats; roof/s3/spec.md §3.1, §5.2 S3-C2, S3-C3, §5.3, §5.4, S3-D13, S3-D15; frozen by stage 3's B0) ====
// MAIN's pigeon/roof/ (served at /chats/roof/), with the IFL beside from stage 3's B0 on (REGISTRY.chats). Two grep
// sets: the page's (every pigeon/roof/*.js but the core's graph) and the Worker's (core.js, idb.js). A file that still
// exports STUB is B0's: its names, graph and greps are checked all the same.
import { chatsSkip, CHATS_ROOF } from './fixtures/roof.mjs';
const CH = CHATS_ROOF;
const chRead = (f) => read(new URL(f, CH));
const chFiles = () => existsSync(CH) ? readdirSync(CH).filter((f) => f.endsWith('.js')) : [];
const WORKER_FILES = ['core.js', 'idb.js'];
// (with later.js, the part of app.js loaded once the first screen is up)
const PIGEON_APP = read(new URL('pigeon/app.js', MAIN)) + '\n' + read(new URL('pigeon/later.js', MAIN));
// (the frozen names of each file, spec §2.2, §3.1, §5.4; the openers' first parameter: ctx, or (ui, svc) for openSend)
const CH_FROZEN = {
  'chats.js': ['CONTRACT', 'BUILD', 'NEWS', 'PROTOCOL', 'SECTIONS', 'mount', 'deviceOf'],
  'connector.js': ['CONNECTOR', 'connector'],
  'store.js': ['createStore'],
  'list.js': ['view', 'openNewChat', 'openNewGroup'],
  'friends.js': ['view', 'openRequests', 'openAddFriend'],
  'chat.js': ['view'], 'lock.js': ['view'],
  'send.js': ['openSend'],
  'sheets.js': ['openFriendInfo', 'openGroupInfo', 'openGroupAdd', 'openGroupRename', 'openSafety', 'openWhoHas', 'openView', 'openSchedule', 'openTimeTalk', 'openFromApps', 'openHold'],
  'flight.js': ['openFlightLog', 'openPassport', 'openMap', 'openSkies', 'openLookUp', 'openWay', 'openMoonPick', 'openBirds', 'openBird', 'openBirdName', 'openLoft', 'openFeathers', 'openNews'],
  'media.js': ['openGifs', 'recordVoice', 'pickPhoto'],
  'scan.js': ['openScan'],
  'settings.js': ['openChatSettings'],
  'service.js': ['PROTOCOL', 'startService'],
  'core.js': ['PROTOCOL', 'STATES', 'WHY', 'TOPICS', 'RPC', 'META'],
  'idb.js': ['NAME', 'STORE', 'get', 'set', 'del', 'locked', 'gone', 'isGone'],
};
// (the connector's words, frozen: spec §5.3)
const CH_SHARES = { cards: 'Who’s waiting for you, and letters on their way', search: 'Your friends and your messages, on this phone only',
  notifications: 'New messages and letters as they land, never their words', actions: 'Open a chat; send a card to a friend', screens: 'Chats · Friends' };

test('chats: chats.js exports CONTRACT 1, BUILD and NEWS = pigeon/app.js’s APP_VERSION and APP_NEWS, PROTOCOL equal in chats.js, service.js and core.js, SECTIONS = REGISTRY = connector; every frozen name, every opener taking ctx', { skip: chatsSkip }, async () => {
  const E = chRead('chats.js');
  assert.equal(literalOf(E, 'CONTRACT'), 1);
  assert.equal(literalOf(E, 'BUILD'), constOf(PIGEON_APP, 'APP_VERSION'), 'BUILD = APP_VERSION (I raises both together)');
  assert.equal(literalOf(E, 'NEWS'), constOf(PIGEON_APP, 'APP_NEWS'), 'NEWS = APP_NEWS');
  const p = ['chats.js', 'service.js', 'core.js'].map((f) => literalOf(chRead(f), 'PROTOCOL'));
  assert.ok(Number.isInteger(p[0]) && p.every((x) => x === p[0]), `PROTOCOL ×3: ${p}`);
  assert.match(uncomment(E), /\bexport\s+async\s+function\s+mount\s*\(\s*root\s*,\s*fw\s*\)/);
  const SECTIONS = [['chats', 'Chats'], ['friends', 'Friends']];
  assert.deepEqual(literalOf(E, 'SECTIONS'), SECTIONS);
  assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY.chats.sections)), SECTIONS);
  const { connector: c } = await import(new URL('connector.js', CH));
  assert.deepEqual(c.sections, SECTIONS);
  assert.deepEqual({ ...c.aliases }, { ...R.REGISTRY.chats.aliases });
  for (const [f, names] of Object.entries(CH_FROZEN)) {
    const has = exportsOf(chRead(f));
    for (const n of names) assert.ok(has.has(n), `pigeon/roof/${f} exports ${n}`);
  }
  for (const f of ['list.js', 'friends.js', 'chat.js', 'lock.js']) assert.match(uncomment(chRead(f)), /\bexport\s+function\s+view\s*\(\s*el\s*,\s*ctx\s*\)/, `${f}: view(el, ctx)`);
  for (const f of ['list.js', 'friends.js', 'sheets.js', 'flight.js', 'media.js', 'scan.js', 'settings.js']) {
    for (const m of uncomment(chRead(f)).matchAll(/\bexport\s+(?:async\s+)?function\s+(open\w+|recordVoice|pickPhoto)\s*\(([^)]*)\)/g)) assert.match(m[2], /^\s*ctx\b/, `${f}: ${m[1]}(ctx, …)`);
  }
  assert.match(uncomment(chRead('send.js')), /\bexport\s+(?:async\s+)?function\s+openSend\s*\(\s*ui\s*,\s*svc\s*,\s*\{\s*card\b[^)]*\bwords\b[^)]*\bto\b/, 'openSend(ui, svc, { card, words, to })');
  assert.match(uncomment(chRead('service.js')), /\bexport\s+(?:async\s+)?function\s+startService\s*\(\s*\{\s*path\b[^)]*\bui\b[^)]*\bonStale\b/, 'startService({ path, ui, onStale })');
  assert.match(uncomment(chRead('store.js')), /\bexport\s+function\s+createStore\s*\(\s*\)/);
});

test('chats: deviceOf is theme.js’s device rule, line for line (S3-D13; theme.js stays untouched)', { skip: chatsSkip }, () => {
  const theme = read(new URL('pigeon/theme.js', MAIN)), mine = chRead('chats.js');
  const lines = (s) => ['var ua =', 'var touched =', 'var mobile ='].map((k) => s.split('\n').map((l) => l.trim()).filter((l) => l.startsWith(k)));
  const want = lines(theme), got = lines(mine);
  for (const [i, k] of ['ua', 'touched', 'mobile'].entries()) {
    assert.equal(want[i].length, 1, `theme.js has one var ${k}`);
    assert.deepEqual(got[i], want[i], `chats.js's var ${k} is theme.js's`);
  }
  assert.match(uncomment(mine), /export\s+function\s+deviceOf\s*\(\s*\)\s*\{[\s\S]*?return\s+mobile\s*\?\s*"phone"\s*:\s*"computer"/);
});

test('chats: the connector: no imports, ≤ 4 KB, its words, no search, mini from Today’s chat card, preload the entry and itself only', { skip: chatsSkip }, async () => {
  const src = chRead('connector.js');
  assert.ok(!/\bimport\b/.test(uncomment(src)), 'no imports');
  assert.ok(Buffer.byteLength(src) <= 4096, `${Buffer.byteLength(src)} bytes`);
  const { connector: c, CONNECTOR: v } = await import(new URL('connector.js', CH));
  assert.equal(v, 1);
  assert.equal(c.app, 'chats'); assert.equal(c.name, R.REGISTRY.chats.name);
  assert.deepEqual(c.shares, CH_SHARES);
  assert.equal(c.search, undefined, 'no search: the frame’s provider over the core (§2.4)');
  assert.deepEqual(c.preload, [R.REGISTRY.chats.entry, R.REGISTRY.chats.connector]);
  assert.equal(c.mini(null), null);
  assert.equal(c.mini({ cards: { chat: { state: 'empty' } } }), null);
  assert.deepEqual(c.mini({ cards: { chat: { unread: [{ n: 2 }, { n: 3 }] } } }), { kind: 'num', num: '5', label: 'Unread' });
});

test('chats: connector.files = the static graphs of chats.js, service.js and core.js + REGISTRY’s CSS + the connector, exactly; lazy = the closure of the lazy imports less files and NET; none in both; ≤ 60; never Argon2, never rank.js in files', { skip: chatsSkip }, async () => {
  const { connector: c } = await import(new URL('connector.js', CH));
  const files = c.files, lazy = c.lazy || [];
  assert.ok(Array.isArray(files) && new Set(files).size === files.length, 'files: a list, no repeats');
  assert.ok(Array.isArray(lazy) && new Set(lazy).size === lazy.length, 'lazy: a list, no repeats');
  for (const f of [...files, ...lazy]) {
    assert.match(f, /^\/chats\//, f);
    assert.ok(fileOf(f) && existsSync(fileOf(f)), `${f} exists`);
    assert.ok(!isNet('chats', f), `${f}: never a network-only file`);
  }
  const R3 = R.REGISTRY.chats;
  const graph = [...new Set([...await staticGraph('chats'), ...await staticGraph('chats', R3.service), ...await staticGraph('chats', '/chats/roof/core.js')])];
  // (and the connector itself: the framework's (loadConnector, preload), never in chats.js's graph since an import there
  // was stamped as it's sent, so the same file fetched and run at two addresses, as Mail's mail.js never imports its own)
  assert.ok(!graph.includes(R3.connector), 'chats.js never imports connector.js');
  assert.deepEqual([...files].sort(), [...graph, ...R3.css, R3.connector].sort(), 'files: the three graphs, the CSS and the connector, no more, no less');
  assert.deepEqual([...lazy].sort(), (await lazyClosure('chats', graph)).sort(), 'lazy: the closure, less files and NET');
  assert.ok(!files.some((f) => lazy.includes(f)), 'files ∩ lazy = ∅');
  assert.ok(files.length + lazy.length <= 60, `${files.length + lazy.length} ≤ 60`);
  assert.ok(!files.includes('/chats/rank.js'), 'rank.js only through the core’s one import (build I1)');
  for (const f of [...files, ...lazy]) assert.ok(!/argon2/.test(f) && !/\/app\.js$/.test(f), `${f}: never Argon2 or app.js`);
  for (const f of ['chats.js', 'connector.js', 'store.js', 'list.js', 'friends.js', 'chat.js', 'lock.js', 'service.js', 'core.js', 'idb.js']) assert.ok(files.includes(`/chats/roof/${f}`), `${f} in files`);
  for (const f of ['send.js', 'sheets.js', 'settings.js', 'media.js']) assert.ok(lazy.includes(`/chats/roof/${f}`), `${f} in lazy (kept offline, build I9)`);
});

// (the page's rules (S1 §5.1, S3-C2) and the Worker's)
const CH_PAGE_RULES = [
  [/serviceWorker/, 'registers no service worker'],
  [/(?:\b(?:window|globalThis)\s*\.\s*|(?<![.\w$]))history\s*\./, 'no history.*'],
  [/(?:\b(?:window|globalThis|document)\s*\.\s*|(?<![.\w$]))location\s*(?:\.\s*(?:assign|replace|reload)\s*\(|(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=))/, 'no location changes'],
  [/(?<![.\w$]|function\s+)(?:confirm|alert|prompt)\s*\(|\bwindow\s*\.\s*(?:confirm|alert|prompt)\s*\(/, 'no confirm()/alert()'],
  [/\bIFL\b/, 'no IFL'],
  [/\bdocument\s*\.\s*(?:getElementById|querySelector|querySelectorAll|getElementsBy\w+)\s*\(/, 'no document-wide lookups'],
  [/["'`]today:/, 'no today:* key'],
  [/\bindexedDB\b/, 'no indexedDB (only the core’s idb.js)'],
  [/(?<![.\w$])parent\s*\./, 'no parent.'],
  [/["'`]#(?:hd|tabs)\b|ifl-tabs|\.ifh-/, 'never the header’s or the tab bar’s DOM'],
  [/\bfrom\s*["']\.\/service\.js["']|\bimport\s*\(\s*["']\.\/service\.js/, 'never imports service.js (only the frame loads it, risk B2)'],
  [/\bfrom\s*["']\.\/(?:core|idb)\.js["']/, 'never imports the core’s graph'],
];
const CH_WORKER_RULES = [
  [/\bdocument\b/, 'no document'], [/\bwindow\b/, 'no window'], [/\blocalStorage\b|\bsessionStorage\b/, 'no localStorage'],
  [/\bfw\b/, 'no fw'], [/\blocation\s*(?:\.\s*(?:assign|replace|reload)\s*\(|(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=))/, 'no location writes'],
  [/serviceWorker/, 'no serviceWorker'], [/\bunlock\s*\(|\bvaultWith\b|argon2/i, 'no unlock(, vaultWith or Argon2 (S3-D8)'],
  [/\bsecretJwk\b|exportKey\s*\(\s*["']jwk/, 'no JWK'], [/\bIFL\b/, 'no IFL'],
  [/\bcreateObjectURL\b/, 'no object URLs (made only in the page, S3-D3)'],
];

test('chats: the page’s files keep S1 §5.1’s rules and S3-C2’s (no service.js import); every import( inside fw.lazy( with its literal; a Worker only in service.js, made once from new URL("./core.js", import.meta.url); listeners removed; no style attribute, no inline handler', { skip: chatsSkip }, () => {
  const page = chFiles().filter((f) => !WORKER_FILES.includes(f));
  assert.ok(page.includes('chats.js') && page.includes('service.js'), 'the page’s files');
  for (const f of page) {
    const s = uncomment(chRead(f));
    // (service.js reaches send.js through ui.lazy: ui is the Chats fw, S3-D7)
    const lz = f === 'service.js' ? s.replace(/\bui\.lazy\(/g, 'fw.lazy(') : s;
    assert.deepEqual(lazyOutside(lz), [], `pigeon/roof/${f}: import( outside fw.lazy(`);
    for (const [re, why] of CH_PAGE_RULES) assert.ok(!re.test(s), `pigeon/roof/${f}: ${why} (${re.exec(s)?.[0]})`);
    const workers = [...s.matchAll(/\bnew\s+Worker\s*\(/g)];
    if (f === 'service.js') {
      assert.equal(workers.length, 1, 'service.js makes one Worker');
      assert.match(s, /new\s+Worker\s*\(\s*new\s+URL\(\s*["']\.\/core\.js["']\s*,\s*import\.meta\.url\s*\)\s*,\s*\{[^}]*type\s*:\s*["']module["']/, 'new Worker(new URL("./core.js", import.meta.url), { type: "module", … })');
    } else assert.equal(workers.length, 0, `pigeon/roof/${f}: a Worker only in service.js (S3-C2)`);
    for (const [who, type] of globalListeners(s)) assert.ok(globalRemoves(s).some(([w, t]) => t === type && sameGlobal(w, who)), `pigeon/roof/${f}: ${who}'s "${type}" listener removed`);
    assert.ok(!/style=\\?["']/.test(s) && !/setAttribute\(\s*["'`]style["'`]/.test(s), `pigeon/roof/${f}: no style attribute`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(s), `pigeon/roof/${f}: no inline handler`);
  }
  // (the rules bite)
  assert.ok(CH_PAGE_RULES[10][0].test('import { startService } from "./service.js";') && CH_PAGE_RULES[10][0].test('fw.lazy(() => import("./service.js"))') && !CH_PAGE_RULES[10][0].test('// service.js is the frame’s'));
});

test('chats: the Worker’s graph (core.js, idb.js) keeps its own rules (S3-C2): no document, window, localStorage, fw, location writes, serviceWorker, Argon2 or JWK; its one dynamic import ../rank.js; indexedDB only in idb.js, opening "inflight"', { skip: chatsSkip }, () => {
  for (const f of WORKER_FILES) {
    const s = uncomment(chRead(f));
    for (const [re, why] of CH_WORKER_RULES) assert.ok(!re.test(s), `pigeon/roof/${f}: ${why} (${re.exec(s)?.[0]})`);
    const dyn = [...s.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)].map((m) => m[1].trim());
    assert.ok(dyn.every((d) => /^["']\.\.\/rank\.js["']$/.test(d)), `pigeon/roof/${f}: dynamic import only of ../rank.js (${dyn})`);
    if (f !== 'idb.js') assert.ok(!/\bindexedDB\b/.test(s), `pigeon/roof/${f}: indexedDB only in idb.js`);
    for (const m of s.matchAll(/indexedDB\s*\.\s*open\(\s*([^,)]+)/g)) assert.ok(/^["']inflight["']$|^NAME$/.test(m[1].trim()), `idb.js opens only "inflight" (${m[1]})`);
    assert.ok(!/\bnew\s+Worker\s*\(/.test(s), `pigeon/roof/${f}: no Worker of its own`);
  }
  assert.equal(literalOf(chRead('idb.js'), 'NAME'), R.REGISTRY.chats.idb);
  assert.equal(literalOf(chRead('idb.js'), 'STORE'), 'kv');
  const core = uncomment(chRead('core.js'));
  for (const f of ['./idb.js', '../crypto.js', '../cards.js', '../digest.js', '../links.js']) assert.match(core, new RegExp(String.raw`^\s*import\b[^;]*from\s*["']${f.replace(/\./g, '\\.')}["']`, 'm'), `core.js imports ${f}`);
  // (the rules bite)
  assert.ok(CH_WORKER_RULES[6][0].test('await vaultWith(pw)') && CH_WORKER_RULES[6][0].test('import("../argon2.js")') && !CH_WORKER_RULES[6][0].test('const unlocked = 1'));
});

test('chats: the core’s RPC table and META are spec §5.4’s: every method there and no other, args and patches given; META carries no message words; WHY, STATES and TOPICS', { skip: chatsSkip }, async () => {
  const core = await import(new URL('core.js', CH));
  assert.deepEqual(Object.keys(core.RPC).sort(), ['hello', 'start', 'state', 'lock', 'signOut', 'forget', 'sync', 'open', 'leave', 'older', 'rows', 'search', 'waiting', 'since', 'photo',
    'sendText', 'sendBlob', 'note', 'react', 'recall', 'read', 'draft', 'share', 'rank', 'sendRun', 'safety', 'verify', 'trust', 'meta'].sort());
  for (const [m, d] of Object.entries(core.RPC)) {
    assert.ok(Object.isFrozen(d) && Array.isArray(d.args) && typeof d.v === 'string' && Array.isArray(d.patches), m);
    for (const t of d.patches) assert.ok(core.TOPICS.includes(t), `${m}: patch ${t} is a topic`);
  }
  assert.ok(Object.isFrozen(core.RPC) && Object.isFrozen(core.META));
  assert.deepEqual([...core.WHY], ['signin', 'key', 'locked', 'device', 'offline', 'ended', 'tap', 'card', 'trust', 'failed', 'no']);
  assert.deepEqual([...core.STATES], ['ready', 'signin', 'key', 'locked', 'device', 'offline', 'ended']);
  assert.deepEqual([...core.TOPICS], ['state', 'me', 'rows', 'friends', 'groups', 'requests', 'air', 'chat:', 'typing:', 'outbox', 'send', 'keywarn', 'unread']);
  const SPEC = ['me', 'friends', 'friends-respond', 'friend-status', 'block', 'mutuals', 'groups', 'group-add', 'group-name', 'group-leave', 'group-mute', 'flight-log', 'loft',
    'feathers', 'feathers-buy', 'bird-wear', 'bird-retire', 'skies', 'wind-grid', 'route-plan', 'wx-plan', 'way', 'wave', 'news', 'gif-search', 'time-offer', 'together', 'fit-offer', 'fit-share', 'card-now', 'my-card', 'share-rank'];
  assert.deepEqual(Object.keys(core.META).sort(), [...SPEC, 'avatar', 'gif'].sort(), 'spec §5.4’s names, and the two raw images (avatar, gif)');
  const NEVER = /^(messages|group-messages|read|group-read|react|stopover-note|pins|salt|resume|reauth|sessions|sessions-end|logout|vault|passkey.*|handback|push-.*|account-link|confirm-.*)$/;
  for (const [name, d] of Object.entries(core.META)) {
    assert.ok(!NEVER.test(name) && !NEVER.test(d.path.split(/[/?]/)[0]), `${name}: not a META endpoint`);
    for (const [method, k] of Object.entries(d.methods)) {
      assert.ok(['GET', 'POST', 'PATCH', 'DELETE'].includes(method), `${name} ${method}`);
      for (const key of [...k.q, ...k.b]) assert.ok(!/^(ct|iv|text|body|pins?|vault|passkey|salt|token|jwk|d|kty|secret|password)$/i.test(key), `${name}: ${key} isn’t a word, a key or a secret`);
      if (method === 'GET') assert.equal(k.b.length, 0, `${name}: a GET has no body`);
    }
    // (an endpoint pigeon/app.js really calls, by that name)
    assert.ok(PIGEON_APP.includes(`api("${d.path.split('/')[0].replace(/<\w+>/, '')}`) || PIGEON_APP.includes(`api(\`${d.path.split('/')[0].replace(/<\w+>/, '')}`), `${name}: pigeon/app.js calls ${d.path}`);
  }
});

test('chats: the service’s facade has exactly makeIFLChat’s eight keys, frozen, no call; startService gives protocol, state, call, on, facade, release; hello first, the lock read before start', { skip: chatsSkip }, async () => {
  const keys = [...PIGEON_APP.slice(PIGEON_APP.indexOf('function makeIFLChat(')).split('\n// ==== end of the hub')[0].matchAll(/^\s{4}(?:get\s+)?(\w+)\s*\(/gm)].map((m) => m[1]);
  assert.deepEqual(keys, ['state', 'share', 'sendTo', 'waiting', 'since', 'reply', 'refresh', 'signOut'], 'makeIFLChat’s keys, as pigeon/app.js has them');
  // (a stand-in Worker answering hello and start; localStorage holding a lock)
  const posted = [];
  class FakeWorker {
    constructor(url, o) { this.url = String(url); this.o = o; this.l = []; FakeWorker.made.push(this); }
    addEventListener(t, f) { if (t === 'message') this.l.push(f); }
    removeEventListener() {}
    postMessage(d) {
      posted.push(d);
      const v = d.m === 'hello' ? { protocol: d.a[0] } : d.m === 'start' ? { state: 'ready' } : undefined;
      queueMicrotask(() => { for (const f of this.l) f({ data: v === undefined ? { id: d.id, ok: false, why: 'no' } : { id: d.id, ok: true, v } }); });
    }
    terminate() { this.dead = true; }
  }
  FakeWorker.made = [];
  const keep = {};
  for (const k of ['Worker', 'localStorage', 'document']) keep[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  set('Worker', FakeWorker);
  set('localStorage', { getItem: (k) => (k === 'inflight-lock' ? JSON.stringify({ on: true, uid: 'u1', after: 0 }) : null), setItem() {}, removeItem() {} });
  set('document', { visibilityState: 'visible' });
  try {
    const { startService } = await import(new URL('service.js', CH));
    let stale = 0;
    const ui = { lazy: (f) => f(''), on: () => () => {}, toast() {}, sheet: { open() {} }, ui: {} };
    const svc = await startService({ path: '/chats/', ui, onStale: () => { stale++; } });
    assert.equal(FakeWorker.made.length, 1, 'one Worker');
    assert.match(FakeWorker.made[0].url, /\/pigeon\/roof\/core\.js$/);
    assert.equal(FakeWorker.made[0].o?.type, 'module');
    for (const k of ['protocol', 'state', 'call', 'on', 'facade', 'release']) assert.ok(k in svc, `svc.${k}`);
    assert.equal(posted[0].m, 'hello', 'hello first');
    const start = posted.find((d) => d.m === 'start');
    assert.ok(start, 'start called');
    assert.equal(start.a[0].locked, true, 'the kept lock said before the first start (S3-D14)');
    const f = svc.facade;
    assert.ok(Object.isFrozen(f), 'frozen');
    assert.deepEqual(Object.keys(f).sort(), [...keys].sort(), 'exactly the eight keys');
    assert.equal(f.call, undefined, 'no call on the facade (risk I1)');
    assert.equal(stale, 0);
    assert.deepEqual(await f.sendTo('x', 'w', null), { ok: false, why: 'tap' }, 'sendTo with no tap: refused, why tap');
    svc.release({ terminate: true });
  } finally {
    for (const [k, d] of Object.entries(keep)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  }
});

test('chats: the CSS is scoped: chats.css under .m-chats, chsheets.css under .ifl-sheet[data-app=chats]; nothing on :root, html or body', { skip: chatsSkip }, () => {
  for (const [f, pre] of [['chats.css', ['.m-chats', '[data-app="chats"]', '[data-app=chats]']], ['chsheets.css', ['.ifl-sheet[data-app=chats]', '.ifl-sheet[data-app="chats"]']]]) {
    const css = chRead(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const sel = m[1].trim();
      if (sel.startsWith('@') || /^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(sel)) continue;
      for (const one of sel.split(',').map((x) => x.trim())) {
        assert.ok(!/(^|[\s,>+~(])(?::root|html|body)(?![\w-])/.test(one), `pigeon/roof/${f}: ${one}`);
        assert.ok(pre.some((p) => one.startsWith(p)), `pigeon/roof/${f}: ${one} isn’t scoped`);
      }
    }
  }
  assert.ok(existsSync(new URL('pigeon/cards.css', MAIN)), '../cards.css, reused');
});
