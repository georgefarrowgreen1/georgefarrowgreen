// The framework's components and rules (One roof, spec §3.1, §3.5, §3.13, §3.15, RB5a, RI16, RI18): ui.js's builders
// put data in as text only (a stand-in DOM serialises what they make, and no data ever becomes markup); no style
// attribute, inline style or inline handler anywhere in roof/*.js; the ARIA the framework promises (the switcher's
// tablist with manual activation, every sheet labelled, the segmented control's radios, Back named, the toast's one
// live region); the header's row 1 is the shared block's own skeleton (IFL.headerHtml's, from Today's copy of
// menu.js), and header.js reaches only into parts that skeleton has; and roof/*.js together stay within 20 KB gzipped
// with comments stripped. Skips (with the reason) when the inflite repo beside has no roof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { ROOF, IFL, roofSkip } from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';
import { JS_START, JS_END } from '../../iflmenu.mjs';

const read = (f) => readFileSync(new URL(f, ROOF), 'utf8');
const files = () => readdirSync(ROOF).filter((f) => f.endsWith('.js')).sort();
// comments out: /* … */ blocks and // to the end of a line, but never inside a string or a regular expression's class
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([;{},)\]])[ \t]*\/\/(?![^\n]*["'`])[^\n]*$/gm, '$1');
const HOSTILE = `<img src=x onerror="alert(1)">'&<script>alert(2)</script>`;
// (an element made from the data: a script, the hostile img, any on* attribute, or the data put in as markup)
const unsafe = (el) => el.tagName === 'SCRIPT' || (el.tagName === 'IMG' && el.getAttribute('src') === 'x') || [...el.attrs.keys()].some((k) => /^on/.test(k)) || el.childNodes.some((n) => n.nodeType === 99 && n.html.includes('<img src=x')) || el.children.some(unsafe);

test('every builder puts data in as text: nothing it is given becomes markup', { skip: roofSkip }, async () => {
  globalThis.document = fakeDocument();
  const ui = await import(new URL('ui.js', ROOF));
  const H = HOSTILE, run = () => {};
  const made = {
    el: ui.el('p', { class: 'x', text: H, title: H, data: { k: H }, aria: { label: H } }, H, [H]),
    card: ui.card({ kind: 'hero', title: H, label: H, body: ui.el('p', { text: H }), app: 'weather' }),
    list: ui.list([ui.row({ title: H, sub: H, value: H })], { label: H }),
    row: ui.row({ lead: { time: H }, title: H, sub: H, value: H, trail: 'chevron', run, label: H, act: 'x' }),
    rowAvatar: ui.row({ lead: { avatar: H }, title: H, trail: 'switch', checked: true }),
    label: ui.label(H),
    chip: ui.chip(H, { kind: 'action', href: '/#you', label: H }),
    stats: ui.stats([[H, H, H, 'pos']]),
    btn: ui.btn(H, { primary: true, run, label: H, act: 'go' }),
    iconBtn: ui.iconBtn('search', { label: H, run }),
    seg: ui.seg([['a', H], ['b', H]], 'a', run, { label: H }),
    sw: ui.sw(true, run, { label: H }),
    field: ui.field({ type: 'search', value: H, placeholder: H, label: H }),
    tile: ui.tile({ app: 'weather', name: H, line: H, href: '/weather/', mini: ui.mini({ kind: 'num-bars', num: H, bars: [10, 200, -5, 'x', 60], label: H }), chips: [{ text: H, href: '/weather/#radar' }] }),
    mini: ui.mini({ kind: 'pct-spark', pct: 1.234, label: H }),
    avatar: ui.avatar(H, { photo: '/api/avatar?id=x' }),
    badge: ui.badge(H, { label: H }),
    empty: ui.empty({ title: H, body: H, acts: [{ label: H, act: 'retry', run }] }),
    error: ui.error({ title: H, body: H, acts: [{ label: H, act: 'own', run }] }),
  };
  for (const [k, el] of Object.entries(made)) {
    assert.ok(el && el.nodeType === 1, `${k} gives an element`);
    assert.ok(!unsafe(el), `${k}: data stayed text — ${el.outerHTML.slice(0, 200)}`);
  }
  assert.ok(made.row.outerHTML.includes('&lt;img src=x'), 'the text is there, escaped');
  assert.equal(ui.esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.throws(() => ui.el('div', { style: 'color:red' }), /never style/);
  assert.throws(() => ui.el('div', { onclick: 'x()' }), /never onclick/);
  assert.throws(() => ui.el('div', { html: '<b>x</b>' }), /never html/);
  // a figure a drawing needs is a custom property, never a style attribute
  const bars = made.tile.querySelectorAll('.bars i');
  assert.deepEqual(bars.map((i) => i.style.getPropertyValue('--h')), ['0.1', '1', '0', '0', '0.6'], 'bars clamp to 0…1 through --h');
  assert.ok(!made.tile.outerHTML.includes('style='), 'no style attribute');
  // roots and hooks
  assert.equal(made.row.tagName, 'BUTTON', 'a row with run is a button');
  assert.equal(made.chip.tagName, 'A', 'an action chip with href is a link');
  assert.equal(made.tile.getAttribute('data-app'), 'weather', 'a tile carries data-app (hook .ifl-tile[data-app])');
  assert.deepEqual(made.error.querySelectorAll('[data-act]').map((b) => b.getAttribute('data-act')), ['own'], 'error acts carry data-act (hook .ifl-error [data-act])');
  assert.match(made.avatar.className, /^ifl-avatar av-c[1-8]$/, 'an avatar’s colour is a class (.av-c1…8), hashed');
  assert.equal(ui.avatar('Pat').className, ui.avatar('Pat').className, 'the same name, the same colour');
  assert.equal(made.mini.querySelector('b').textContent, '+1.2%', 'a Markets mini is a percentage, never an amount');
  // the Markets day's shape (spec §6.1): drawn from 0…1 values as an aria-hidden area, its points a custom property, no figure
  const sp = ui.mini({ kind: 'pct-spark', pct: -0.4, spark: [0, 1, 0.5, 'x'] });
  const area = sp.querySelector('.spark');
  assert.ok(area && area.getAttribute('aria-hidden') === 'true', 'the spark is drawn, hidden from assistive tech');
  assert.equal(area.style.getPropertyValue('--pts'), '0 100%,0% 100%,33.333333333333336% 0%,66.66666666666667% 50%,100% 100%,100% 100%', 'its shape through --pts (an odd value drawn at the bottom)');
  assert.equal(sp.textContent, '-0.4%', 'no figure but the percentage');
  assert.ok(!sp.outerHTML.includes('style='), 'no style attribute');
  assert.equal(ui.mini({ kind: 'pct-spark', pct: 1, spark: [0.5] }).querySelector('.spark'), null, 'one point is no shape');
  const { STATIC } = await import(new URL('connectors.js', ROOF));
  const mk = STATIC.markets.mini({ cards: { markets: { traded: true, pct: 1.25, spark: { vals: [1520.4, 1530.4, 1525.4, 'x'], base: 1500 } } } });
  assert.deepEqual(mk, { kind: 'pct-spark', pct: 1.25, spark: [0, 1, 0.5] }, 'the Markets mini: the percentage, and the card’s intraday values made 0…1 (only the shape leaves the connector)');
  assert.ok(!/1520|1530|1525|1500/.test(JSON.stringify(mk)), 'no amount in the mini');
  assert.equal(STATIC.markets.mini({ cards: { markets: { traded: true, pct: 0.2 } } }).spark, null, 'no intraday values, no spark');
  assert.equal(STATIC.markets.mini({ cards: { markets: { traded: false, pct: 0.2 } } }), null, 'not traded today: no mini');
  assert.equal(ui.mini(null), null);
});

test('ARIA: the segmented control, the switch, the error, a skeleton', { skip: roofSkip }, async () => {
  globalThis.document = fakeDocument();
  const ui = await import(new URL('ui.js', ROOF));
  let got = null;
  const s = ui.seg([['temp', 'Temp'], ['rain', 'Rain']], 'rain', (v) => { got = v; }, { label: 'Days by' });
  assert.equal(s.getAttribute('role'), 'radiogroup');
  assert.equal(s.getAttribute('aria-label'), 'Days by');
  const radios = s.querySelectorAll('[role=radio]');
  assert.deepEqual(radios.map((r) => [r.getAttribute('data-value'), r.getAttribute('aria-checked'), r.getAttribute('tabindex')]), [['temp', 'false', '-1'], ['rain', 'true', '0']], 'radios with data-value (hook segValue), one checked and in the tab order');
  radios[0].click();
  assert.equal(got, 'temp');
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  s.set('rain');
  assert.equal(radios[1].getAttribute('aria-checked'), 'true');
  const sw = ui.sw(false, () => {}, { label: 'Rain alerts' });
  assert.equal(sw.input.getAttribute('role'), 'switch');
  assert.equal(sw.input.getAttribute('aria-label'), 'Rain alerts');
  assert.equal(ui.error({ title: 'x' }).getAttribute('role'), 'alert');
  assert.equal(ui.skeleton('hero').getAttribute('aria-hidden'), 'true');
  assert.equal(ui.icon('search').getAttribute('aria-hidden'), 'true');
});

test('the framework’s ARIA, as written: switcher, sheets, Back, tab bar, toast, search', { skip: roofSkip }, () => {
  const h = read('header.js'), sh = read('sheet.js'), t = read('tabs.js'), to = read('toast.js'), se = read('search.js'), fr = read('frame.js');
  for (const s of ['role: "tablist"', 'role: "tab"', 'aria-selected', 'tabIndex = on ? 0 : -1', '"Enter"', 'ArrowRight', 'ArrowLeft', 'class: "ifl-lens", "aria-hidden": "true"', '"ifl-sec-badge"', '`${l}, ${', 'in force']) assert.ok(h.includes(s), `header.js: ${s}`);
  assert.ok(/class: "ifl-back"[^)]*"aria-label"/.test(h) && /back\.setAttribute\("aria-label", spec\.back\.label/.test(h), 'Back is named for where it goes');
  assert.ok(h.includes('h1.setAttribute("aria-label"'), 'the full title is the h1’s accessible name');
  assert.ok(/role="?tabpanel/.test(fr) || fr.includes('role: "tabpanel"'), 'the module’s body is the tabpanel');
  assert.ok(sh.includes('d.setAttribute("aria-labelledby", `${id}-t`)') && sh.includes('d.setAttribute("aria-label", spec.label'), 'every sheet is labelled: by its h2, else by its label');
  assert.ok(sh.includes('showModal()'), 'sheets are modal dialogs (focus trap, Escape, inert page)');
  assert.ok(sh.includes('"aria-label": "Close"') && sh.includes('"aria-label": "Back"'), 'close and back are named');
  assert.ok(t.includes('"aria-current", c === "apps" && inApp() ? "true" : "page"') && t.includes('"aria-hidden", "true"'), 'tabs: aria-current page / true, the pill aria-hidden');
  assert.ok(to.includes('d.querySelector(".ifm-say")') && !/createElement\("p"\)|"aria-live"/.test(strip(to)), 'the toast speaks through the shared block’s one live region, and never makes a second');
  assert.ok(se.includes('role: "combobox"') && se.includes('"aria-controls"') && se.includes('"listbox"') && se.includes('"option"'), 'search: a combobox over a listbox of options');
  assert.ok(fr.includes('"#hd h1.ifh-name"') && fr.includes('backTo'), 'focus: the h1 on a new screen, the opener on a pop (§3.15)');
});

test('no style attribute, inline style or inline handler in roof/*.js (the page’s CSP refuses them)', { skip: roofSkip }, () => {
  for (const f of files()) {
    const s = strip(read(f));
    assert.ok(!/style\s*=\s*["'`]/.test(s), `${f}: a style= attribute`);
    assert.ok(!/setAttribute\(\s*["']style["']/.test(s), `${f}: setAttribute("style")`);
    assert.ok(!/\.style\.cssText|\.style\s*=[^=]/.test(s), `${f}: style written whole`);
    assert.ok(!/\son[a-z]+\s*=\s*["'`\\]/.test(s), `${f}: an inline handler in markup`);
    assert.ok(!/setAttribute\(\s*["']on[a-z]+["']/.test(s), `${f}: an on* attribute set`);
    assert.ok(!/\beval\(|new Function\(/.test(s), `${f}: eval`);
    // innerHTML only ever takes the shared block's own glyphs
    for (const m of s.matchAll(/innerHTML\s*=\s*([^;]+);|insertAdjacentHTML\(([^;]+)\);/g)) assert.match(m[1] || m[2], /^\s*g\s*$|IFL\.glyph\(|"beforeend", IFL\.glyph/, `${f}: innerHTML with ${m[0]}`);
  }
});

test('the header’s row 1 is the shared block’s own skeleton (IFL.headerHtml, from Today’s copy of menu.js)', { skip: roofSkip }, () => {
  const app = readFileSync(new URL('today/public/app.js', IFL), 'utf8');
  const block = app.slice(app.indexOf(JS_START), app.indexOf(JS_END));
  const doc = fakeDocument();
  const ctx = { document: doc, URL, Blob: class {}, addEventListener() {}, removeEventListener() {}, navigator: {}, sessionStorage: null, localStorage: null, setTimeout, clearTimeout, console };
  vm.runInNewContext(`${block}\n;globalThis.__IFL = IFL;`, ctx);
  const html = ctx.__IFL.headerHtml({ me: '', title: 'Title', line: '', acts: [] });
  const skel = [...html.replace(/<svg[\s\S]*?<\/svg>/g, '').matchAll(/<(\w+)[^>]*?class="([^"]*)"/g)].map(([, t, c]) => `${t}.${c.split(' ')[0]}`);
  assert.deepEqual(skel, ['header.ifh', 'button.ifh-me', 'div.ifh-t', 'h1.ifh-name', 'span.ifh-line', 'div.ifh-acts'], 'the shared skeleton, as header.js builds on it');
  const h = read('header.js');
  assert.ok(/IFL\.header\(\{/.test(h), 'header.js makes row 1 with IFL.header (the shared block’s own)');
  const reached = [...strip(h).matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(reached.length >= 5, 'header.js reaches into the skeleton by its classes');
  for (const s of reached) {
    const [tag, cls] = s.includes('.') ? s.split('.') : ['', s];
    assert.ok(skel.some((k) => k.endsWith(`.${cls}`) && (!tag || k.startsWith(`${tag}.`))), `${s} is in the shared skeleton`);
  }
});

// (stage 1 left roof/*.js at 20,452 of 20,480 B; stages 2–4 raise the cap to 24 KB once, for the per-app switch, the
// reload rules, flush, the stay keys and the connector providers they all need (s24-contracts §13; s4 spec §5). j0, which
// did most of stage 2's framework parts too, left 22,350 B: stage 2's FW ≤ 850 B more, stage 3 ≤ 1,300 B, ~75 B slack.
// 5 November: 128 B more, for a sheet lifted above the keyboard (sheet.js; search's field was under it) and no broken
// app icon (ui.js); and 64 B more, for a sheet you type in filling what's in sight from the top, fitted again once iOS's
// word suggestions are up (sheet.js)). 6 November: 1,216 B more, for the rail on a computer (tabs.js: InFlite's name,
// each tab's key, your apps, you at its foot, the pill up and down, and the keys 1–4 and /), about 130 B slack)
test('roof/*.js together: at most 25 KB and 384 B gzipped, comments stripped', { skip: roofSkip }, () => {
  const all = files().map((f) => strip(read(f))).join('\n');
  const gz = gzipSync(all).length;
  assert.ok(gz <= 25 * 1024 + 384, `roof/*.js is ${gz} bytes gzipped (comments stripped), over 25984`);
  assert.ok(strip('a(); // x\n/* y */b();').trim() === 'a();\nb();', 'the stripping takes comments, not code');
});

// ---- stages 2–4's additions to fw and F (s24-contracts §4–§7), where the inflite repo beside has them ----
const s24 = roofSkip || (!/fw\.nav\.depth|depth: \(\) => curDepth\(\)/.test(read('frame.js')) && 'the inflite repo beside is from before stages 2–4 (frame.js has no nav.depth)');
test('stages 2–4, frame.js: sections false hides the switcher, back: { label } from the module, nav.go with replace and kind, nav.depth, stay keys left by the tidy, fw.changed, session.hubAgain', { skip: s24 }, () => {
  const f = strip(read('frame.js'));
  assert.match(f, /sections: h\.sections === false \|\| h\.sections === null \? null : R\.sections/, 'false (and null) hide it; anything else shows it');
  assert.match(f, /back: (?:t \? null : )?\{ label: h\.back\?\.label \|\| \(to \? `Back to \$\{to\}` : "Back"\) \}/, 'the module’s label, the action always F.nav.back (none at the root of an app that’s a tab screen: stage 3)');
  assert.match(f, /go: \(path, o\) => F\.nav\.go\(path, \{ from: app, replace: !!o\?\.replace, kind: KINDS\.includes\(o\?\.kind\) \? o\.kind : null \}\)/, 'a module’s kind: push, tab, zoom or section only (roofframe.test runs it)');
  assert.match(f, /depth: \(\) => curDepth\(\)/);
  assert.match(f, /function tidy\(r\) \{\n\s*if \(REGISTRY\[r\.app\]\?\.stay\?\.includes\(r\.key\)\) return;/, 'a stay key stays in the address');
  assert.match(f, /changed: \(\) => \{ T\(\(\) => opts\.changed\?\.\(app\)\); \}/);
  assert.match(f, /hubAgain: \(\) => F\.hubAgain\(\)/);
  assert.ok(!/roofOn\(\)/.test(f), 'no single flag for every app: roofs() gives parse the map');
  assert.match(f, /const roofs = \(\) => sess\(\)\.apps;/, 'the map, {} with the hub off (no app route is ours)');
});

test('stages 2–4, frame.js: F.flush caps each module at 2 s and sums lost; reloads the frame starts itself wait while busy; the bounce flushes first; fw.lazy asks the version and retries with ?retry=<n>', { skip: s24 }, () => {
  const f = strip(read('frame.js'));
  // (F.flush's cap, setRoof's bounce, the waits while busy and fw.lazy's version ask and ?retry are run, not read, in
  // roofframe.test.mjs; here only the stale guards that test doesn't drive)
  assert.match(f, /if \(r\.kind === "app" && stale && prev && !same && !F\.busy\(\)\) return reloadStale\(\);/);
  assert.match(f, /if \(stale && away >= 60e3 && !F\.busy\(\)\) return reloadStale\(\);/);
  assert.match(f, /if \(stale && !F\.busy\(\)\) \{ reloadStale\(\); return new Promise\(\(\) => \{\}\); \}/, 'stale and busy: the import goes ahead');
  assert.match(f, /fn\(fails\[app\] \? `\?retry=\$\{fails\[app\]\}` : ""\)/);
  assert.match(f, /Date\.now\(\) - \(lazyAt\[app\] \|\| 0\) > 60e3/, 'the version asked at most once a minute per app');
});

test('stages 2–4: toast() gives { close() }; connectors.js has a provider per app, given the user’s id; modules.js gates on apps[app] and opens the app’s own address by link', { skip: s24 }, async () => {
  assert.match(strip(read('toast.js')), /return \{ close: \(\) => \{ if \(cur\?\.t === t\) gone\(\); \} \};\n\}/);
  const c = strip(read('connectors.js'));
  assert.match(c, /export function connectorProvider\(F, app\)/);
  assert.match(c, /c\.search\(q, \{ userId: F\.session\?\.view\?\.user\?\.id \?\? null \}\)/);
  assert.match(c, /export const placesProvider = \(F\) => connectorProvider\(F, "weather"\);/);
  const { connectorOf, STATIC } = await import(new URL('connectors.js', ROOF));
  const F = (apps) => ({ session: { hub: true, apps } });
  assert.equal(await connectorOf('markets', F({ markets: false })), STATIC.markets, 'off: the words of its hub page');
  assert.equal(await connectorOf('mail', F({})), STATIC.mail);
  assert.equal(await connectorOf('chats', F({})), STATIC.chats);
  const m = strip(read('modules.js'));
  assert.match(m, /if \(!s\.apps\?\.\[app\]\) throw new Error\(`the hub or the roof is off/, 'stage 1’s words (roofshell allows exactly that error)');
  assert.match(m, /const ln = R\.link \|\| app, base = links\[ln\]/);
  assert.match(m, /keepOffline\(app, m\.BUILD, \[\.\.\.\(c\.files \|\| \[\]\), \.\.\.lazy\]\)\), 10e3\)/, 'lazy kept only on the Home Screen, 10 s on');
});

// ---- stage 3 (HOST, roof/s3/spec.md §2.1 rules a–e, §2.4, §4.1, S3-C3–C5, S3-C7): the frame and the tab bar run with
// Chats on, not read. The frame with a stand-in history and location, fakedom for its elements and stand-ins for its
// pieces (as roofframe.test does); tabs.js itself on fakedom ----
const chats3 = roofSkip || (!/\bchats: fz\(\{/.test(read('router.js')) && 'the inflite repo beside has no Chats in REGISTRY (before stage 3’s B0)');
const H3 = (globalThis.__host3 = {});
const STUB3 = {
  'header.js': 'export function createHeader() { const k = globalThis.__host3; return { set(h) { k.heads.push(h); }, destroy() {}, compact() {} }; }',
  'tabs.js': 'export function createTabs() { const k = globalThis.__host3; return { set(c) { k.tab = c; }, away(v) { k.away.push(v); }, badge(t, n) { k.badges.push([t, n]); }, destroy() {} }; }',
  'sheet.js': 'export function createSheets() { return { top: () => null, closeAll() {}, open() {} }; }',
  'toast.js': 'export function toast() { return { close() {} }; }',
  'ui.js': 'export const el = (t, a = {}, ...c) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === "data") Object.assign(e.dataset, v); else if (k === "hidden") e.hidden = !!v; else e.setAttribute(k, v); } e.append(...c); return e; }; export const skeleton = () => document.createElement("div");',
  'search.js': 'export function createSearch() { return { provide() { return () => {}; } }; }',
  'send.js': 'export function createSend() { return {}; }',
  'modules.js': 'export const loadModule = (app, F) => globalThis.__host3.load(app, F); export const loadService = (app, F) => globalThis.__host3.loadService(app, F);',
  'connectors.js': 'export function connectorProvider() { return () => {}; } export function chatsProvider(F, s) { const k = globalThis.__host3; k.finds.push(s); return () => { k.finds = k.finds.filter((x) => x !== s); }; }',
};
let frame3 = null;
async function sandbox3() {
  if (frame3) return frame3;
  const { mkdtempSync, copyFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const d = mkdtempSync(join(tmpdir(), 'roofhost-'));
  for (const f of ['frame.js', 'router.js']) copyFileSync(new URL(f, ROOF), join(d, f));
  for (const [f, src] of Object.entries(STUB3)) writeFileSync(join(d, f), src);
  return (frame3 = (await import(pathToFileURL(join(d, 'frame.js')).href)).createFrame);
}
const settle3 = async () => { for (let i = 0; i < 30; i++) await new Promise((ok) => setImmediate(ok)); };
// a page at path with Chats on (apps), its history (back() fires popstate at once), a stand-in root worker to post to
async function boot3(path, { apps = { weather: true, chats: true }, retired } = {}) {
  const createFrame = await sandbox3();
  const doc = fakeDocument(), win = new EventTarget(), sw = new EventTarget();
  doc.visibilityState = 'visible';
  doc.startViewTransition = (fn) => { fn(); return { finished: new Promise(() => {}) }; };
  const loc = { set(h) { const u = new URL(h, this.href || 'https://ifl.test/'); Object.assign(this, { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash }); }, reload() { H3.reloads++; }, assign(p) { H3.assigns.push(p); } };
  loc.set(path);
  const hist = {
    entries: [{ state: null, url: loc.href }], i: 0, scrollRestoration: 'auto',
    get state() { return this.entries[this.i].state; },
    pushState(s, _, p) { this.entries.length = this.i + 1; this.entries.push({ state: structuredClone(s), url: new URL(p, loc.href).href }); this.i++; loc.set(this.entries[this.i].url); },
    replaceState(s, _, p) { this.entries[this.i] = { state: structuredClone(s), url: new URL(p, loc.href).href }; loc.set(this.entries[this.i].url); },
    back() { if (this.i > 0) { this.i--; loc.set(this.entries[this.i].url); win.dispatchEvent(new Event('popstate')); } },
  };
  const views = doc.createElement('div'), store = new Map();
  doc.documentElement.append(views);
  Object.assign(H3, {
    heads: [], away: [], badges: [], finds: [], reloads: 0, assigns: [], y: 0, tab: null, inst: {}, svcMade: 0, released: [], states: [],
    session: { view: { user: { id: 'u1', name: 'U' } }, hub: true, roof: !!apps.weather, links: {}, apps },
    load: async (app, F) => { const inst = { fw: F.forModule(app), shows: 0, show() { this.shows++; }, hide() {}, unmount() {} }; H3.inst[app] = inst; return { instance: inst, m: { BUILD: '1.00' } }; },
    loadService: async (app, F) => {
      const n = ++H3.svcMade, subs = {};
      const s = { n, state: H3.state0 || 'ready', ui: F.forModule(app), facade: Object.freeze({ n }), on(t, fn) { (subs[t] ||= []).push(fn); return () => {}; }, call: async () => [], release(o) { H3.released.push([n, !!o?.terminate]); }, emit(t, d) { for (const f of subs[t] || []) f(d); } };
      H3.svc = s;
      return s;
    },
  });
  Object.assign(globalThis, {
    document: doc, location: loc, history: hist, addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    scrollTo: (_, y) => { H3.y = y; }, requestAnimationFrame: () => 0, requestIdleCallback: () => 0,
    fetch: async () => ({ ok: false, json: async () => null }),
  });
  Object.defineProperty(globalThis, 'scrollY', { configurable: true, get: () => H3.y });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: sw, onLine: true } });
  const F = createFrame({ session: () => H3.session, views, retired, serviceState: (app, st) => H3.states.push([app, st]) });
  await settle3();
  return { F, loc, hist, doc, sw };
}

test('stage 3, frame: Chats’ root is a tab screen (no Back, no crumb, its own tab current, a tab cross-fade with Today); a chat says Back to Chats and backs cold to /chats/; at the root Back stays (§2.1 a, b, e)', { skip: chats3 }, async () => {
  let { F, loc, doc } = await boot3('/chats/');
  let h = H3.heads.at(-1);
  assert.equal(h.back, null, 'no Back at a tab screen'); assert.equal(h.crumb, null, 'no crumb');
  assert.deepEqual(h.sections.map((s) => s[0]), ['chats', 'friends'], 'its switcher kept');
  assert.equal(H3.tab, 'chats', 'its own tab current');
  F.nav.go('/');
  assert.equal(doc.documentElement.dataset.vt, 'tab', 'Chats → Today: the tab cross-fade');
  F.nav.go('/chats/');
  assert.equal(doc.documentElement.dataset.vt, 'tab', 'Today → Chats: the tab cross-fade');
  await settle3();
  F.nav.go('/chats/#open=pat_1');
  assert.equal(doc.documentElement.dataset.vt, 'push', 'into a chat: a push');
  await settle3();
  assert.equal(H3.heads.at(-1).back.label, 'Back to Chats', 'a chat’s Back after Chats');
  assert.equal(H3.tab, 'chats');
  F.destroy();
  // (cold, from a notification: Back to Chats, to /chats/ in place; then at the root Back goes nowhere)
  ({ F, loc } = await boot3('/chats/#open=pat_1'));
  h = H3.heads.at(-1);
  assert.equal(h.back.label, 'Back to Chats', 'cold: Back to Chats'); assert.equal(h.crumb.text, 'Chats');
  assert.equal(loc.hash, '#open=pat_1', 'the stay key kept in the address');
  F.nav.back(); await settle3();
  assert.equal(loc.pathname + loc.hash, '/chats/', 'cold Back: the app’s root, not Apps');
  assert.equal(history.i, 0, 'in place (replace)');
  F.nav.back(); await settle3();
  assert.equal(loc.pathname + loc.hash, '/chats/', 'at the root: Back stays'); assert.deepEqual(H3.assigns, []);
  F.destroy();
  // (Weather keeps stage 1's: a crumb, Back to Apps, its tab Apps)
  ({ F } = await boot3('/weather/'));
  assert.equal(H3.heads.at(-1).back.label, 'Back to Apps'); assert.equal(H3.tab, 'apps');
  F.destroy();
});

test('stage 3, frame: no window scroll kept or put back for a stay route (a chat scrolls its own, S3-C7); the root’s is', { skip: chats3 }, async () => {
  const { F, loc } = await boot3('/chats/');
  H3.y = 300;
  F.nav.go('/chats/#open=pat_1'); await settle3();
  assert.equal(H3.y, 0);
  H3.y = 120;
  F.nav.go('/'); await settle3();
  history.back(); await settle3();
  assert.equal(loc.hash, '#open=pat_1'); assert.equal(H3.y, 0, 'popped back into the chat: no scroll put back');
  history.back(); await settle3();
  assert.equal(loc.pathname + loc.hash, '/chats/'); assert.equal(H3.y, 300, 'the list’s scroll put back');
  F.destroy();
  // (Mail's thread, a stay key of an app that's no tab screen, keeps s24 C7's: its scroll put back as it's popped to)
  const m = await boot3('/mail/#thread=t1', { apps: { mail: true } });
  H3.y = 250;
  m.F.nav.go('/'); await settle3();
  history.back(); await settle3();
  assert.equal(m.loc.hash, '#thread=t1'); assert.equal(H3.y, 250, 'Mail’s thread: put back');
  m.F.destroy();
});

test('stage 3, frame: F.service after opts.retired, one per app; the facade to the host, the full service only by fw.service(); each state to opts.serviceState; the search while signed in and unlocked; let go of (terminate) by releaseService, the switch, sign-out', { skip: chats3 }, async () => {
  let done;
  H3.state0 = 'locked';
  let { F } = await boot3('/', { retired: new Promise((ok) => (done = ok)) });
  const a = F.service('chats'), b = F.service('chats');
  await settle3();
  assert.equal(H3.svcMade, 0, 'nothing started before the old workers are let go of');
  done(); const [fa, fb] = await Promise.all([a, b]);
  assert.equal(H3.svcMade, 1, 'one service for the page'); assert.equal(fa, fb); assert.equal(fa, H3.svc.facade, 'the host gets the facade');
  assert.equal(await F.forModule('chats').service(), H3.svc, 'the module gets the full service');
  assert.equal(H3.svc.ui, F.forModule('chats'), 'its ui is the Chats fw');
  await settle3();
  assert.deepEqual(H3.states, [['chats', 'locked']], 'the state it started in, at once (its patch came before F.service resolved)'); assert.equal(H3.finds.length, 0);
  H3.state0 = null;
  H3.svc.emit('state', { state: 'ready' }); await settle3();
  assert.deepEqual(H3.states.at(-1), ['chats', 'ready']); assert.equal(H3.finds.length, 1, 'People and Messages while ready');
  H3.svc.emit('state', { state: 'ready' }); await settle3();
  assert.equal(H3.finds.length, 1, 'once');
  H3.svc.emit('state', { state: 'locked' }); await settle3();
  assert.deepEqual(H3.states.at(-1), ['chats', 'locked']); assert.equal(H3.finds.length, 0, 'none while locked');
  H3.svc.emit('state', { state: 'ready' }); await settle3();
  await F.releaseService('chats', { terminate: true }); await settle3();
  assert.deepEqual(H3.released, [[1, true]]); assert.equal(H3.finds.length, 0, 'the search goes with it');
  await F.service('chats');
  assert.equal(H3.svcMade, 2, 'a new one after a terminate');
  await assert.rejects(F.service('weather'), /no service/, 'an app without one');
  // (Chats switched off: the core ended with it; sign-out (destroy): the same)
  H3.session.apps = { weather: true, chats: false }; F.setRoof(true, H3.session.apps); await settle3();
  assert.deepEqual(H3.released.at(-1), [2, true], 'setRoof(off) ended it');
  await assert.rejects(F.service('chats'), /no service/, 'refused while off');
  F.destroy();
  ({ F } = await boot3('/'));
  await F.service('chats');
  F.destroy(); await settle3();
  assert.deepEqual(H3.released.at(-1), [H3.svcMade, true], 'sign-out ended it');
  await assert.rejects(F.service('chats'), /no service/, 'none made after sign-out');
});

test('stage 3, frame: the root worker’s { inflight: "sync", tag } to the Chats fw only, as { app, tag } (S3-C5); fw.tabs.away only while its screen shows, put back as the screen changes; badge on its own tab', { skip: chats3 }, async () => {
  const { F, sw } = await boot3('/');
  const got = { chats: [], weather: [] };
  F.forModule('chats').on('push', (x) => got.chats.push(x));
  F.forModule('weather').on('push', (x) => got.weather.push(x));
  const post = (data) => { const e = new Event('message'); e.data = data; sw.dispatchEvent(e); };
  post({ inflight: 'sync', tag: 'pigeon-1' }); post({ inflight: 'sync' }); post({ ifl: 'other' });
  assert.deepEqual(got.chats, [{ app: 'chats', tag: 'pigeon-1' }, { app: 'chats', tag: null }]);
  assert.deepEqual(got.weather, [], 'no other module hears it');
  const fw = F.forModule('chats');
  fw.tabs.away(true);
  assert.deepEqual(H3.away.at(-1), false, 'not shown: never away');
  F.nav.go('/chats/#open=pat_1'); await settle3();
  fw.tabs.away(true);
  assert.equal(H3.away.at(-1), true);
  F.nav.go('/'); await settle3();
  assert.equal(H3.away.at(-1), false, 'back as the screen changed');
  fw.tabs.badge(3); F.forModule('weather').tabs.badge(2);
  assert.deepEqual(H3.badges, [['chats', 3], [undefined, 2]], 'its own tab (Weather has none)');
  F.destroy();
});

test('stage 3, tabs.js: with Chats on, Chats is a tab screen (in-page, a tab move; on its list, to the top), the bar takes the .chats indigo, a count on its tab (none at 0, 99+), away; with it off, a plain link as before', { skip: chats3 }, async () => {
  const doc = fakeDocument(), { El } = await import('../roofkit/fakedom.mjs');
  El.prototype.appendChild ||= function (c) { this.append(c); return c; };
  Object.assign(globalThis, { document: doc, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo: (o) => { H3.top = o; } });
  globalThis.IFL = { hub: { on: true, degraded: false, tabs(nav) { nav.replaceChildren(...['today', 'chats', 'apps', 'you'].map((k) => { const a = doc.createElement('a'); a.className = 'ifl-tab'; a.dataset.tab = k; return a; })); } } };
  const { createTabs } = await import(new URL('tabs.js', ROOF));
  const gone = [], mk = (apps, route) => { const nav = doc.createElement('nav'); const F = { session: { apps }, route, nav: { go: (p, o) => gone.push([p, o?.kind]), prev: () => null } }; return { nav, F, t: createTabs(nav, F) }; };
  const tab = (nav, k) => nav.querySelector(`.ifl-tab[data-tab=${k}]`);
  const tap = (nav, k) => nav.dispatch('click', { target: tab(nav, k) });
  let { nav, F, t } = mk({ chats: true }, { kind: 'app', app: 'chats', section: 'chats', key: 'chats' });
  t.set('chats');
  assert.equal(tab(nav, 'chats').getAttribute('aria-current'), 'page'); assert.ok(nav.classList.contains('chats'), 'indigo');
  H3.top = null; assert.ok(tap(nav, 'chats').defaultPrevented); assert.ok(H3.top, 'on its list: to the top'); assert.deepEqual(gone, []);
  F.route = { kind: 'app', app: 'chats', section: 'friends', key: 'friends' };
  tap(nav, 'chats'); assert.deepEqual(gone.at(-1), ['/chats/', 'tab'], 'on Friends: its list');
  tap(nav, 'apps'); assert.deepEqual(gone.at(-1), ['/#apps', 'tab'], 'Apps from Chats: a tab move, not Apps’ back');
  F.route = { kind: 'tab', tab: 'today', arg: null }; t.set('today');
  tap(nav, 'chats'); assert.deepEqual(gone.at(-1), ['/chats/', 'tab'], 'from Today: in-page');
  t.badge('chats', 3);
  assert.equal(tab(nav, 'chats').querySelector('.ifl-tab-badge').textContent, '3');
  t.badge('chats', 250); assert.equal(tab(nav, 'chats').querySelector('.ifl-tab-badge').textContent, '99+');
  t.set('today'); assert.equal(tab(nav, 'chats').querySelectorAll('.ifl-tab-badge').length, 1, 'kept, once, as the bar redraws');
  t.badge('chats', 0); assert.equal(tab(nav, 'chats').querySelector('.ifl-tab-badge'), null, 'none at 0');
  t.badge('chats', 'x<b>'); assert.equal(tab(nav, 'chats').querySelector('.ifl-tab-badge'), null, 'a number only');
  t.away(true); assert.ok(nav.classList.contains('away') && nav.inert, 'away, and out of reach (inert)'); t.away(false); assert.ok(!nav.classList.contains('away') && !nav.inert);
  t.destroy();
  // (Chats off: the bar as stage 1 drew it, and Chats a normal link)
  ({ nav, F, t } = mk({ chats: false }, { kind: 'tab', tab: 'today', arg: null }));
  t.set('today'); gone.length = 0;
  assert.ok(!nav.classList.contains('chats'), 'menu.css’s colour');
  assert.ok(!tap(nav, 'chats').defaultPrevented, 'a normal navigation'); assert.deepEqual(gone, []);
  t.destroy();
  delete globalThis.IFL;
});

test('stage 3, connectors.js chatsProvider: People (friends and groups by name, never the blocked) and Messages (the service’s search, the query cut to 100), each opening its chat; first while Chats shows; gone when let go of', { skip: chats3 }, async () => {
  const { chatsProvider } = await import(new URL('connectors.js', ROOF));
  const provs = new Set(), calls = [];
  let star = null;
  const F = { route: { kind: 'tab', tab: 'today' }, search: { provide(p) { provs.add(p); return () => provs.delete(p); } } };
  const svc = { on(t, fn) { assert.equal(t, '*', 'caught up through "*"'); star = fn; return () => { star = null; }; },
    call: async (m, q) => { calls.push([m, q]); return [{ token: 't1', chatId: 'pat_1', title: 'Pat', sub: '…the pigeon landed…', at: 1 }, { chatId: '../x', title: 'bad' }]; } };
  const off = chatsProvider(F, svc);
  star({ topic: 'friends', data: [{ id: 'pat_1', name: 'Pat Lee' }, { id: 'sam_2', name: 'Sam', blocked: true }] });
  star({ topic: 'groups', data: [{ id: 'g_1', name: 'Pat’s Ride' }] });
  star({ topic: 'rows', data: [{ id: 'zz', name: 'Pat' }] });
  const [people, msgs] = [...provs].sort((a, b) => a.order - b.order);
  assert.deepEqual([people.id, people.group, people.order, msgs.id, msgs.group, msgs.order], ['people', 'People', 15, 'messages', 'Messages', 16]);
  F.route = { kind: 'app', app: 'chats', section: 'chats', key: 'chats' };
  assert.deepEqual([people.order, msgs.order], [5, 6], 'first on the Chats screen (Apps is 10)');
  assert.deepEqual(people.search(' pat '), [{ title: 'Pat Lee', sub: 'Chats', avatar: 'Pat Lee', href: '/chats/#open=pat_1' }, { title: 'Pat’s Ride', sub: 'Chats', avatar: 'Pat’s Ride', href: '/chats/#open=g_1' }]);
  assert.deepEqual(people.search('sam'), [], 'never the blocked');
  assert.deepEqual(people.search(''), []);
  assert.deepEqual(await msgs.search('landed'), [{ title: 'Pat', sub: '…the pigeon landed…', avatar: 'Pat', href: '/chats/#open=pat_1' }], 'its chat; never a bad id');
  await msgs.search('x'.repeat(300)); await msgs.search('   ');
  assert.deepEqual(calls.map(([m, q]) => [m, q.length]), [['search', 6], ['search', 100]], 'the query to the core only, at most 100, none for blank');
  off();
  assert.equal(provs.size, 0); assert.equal(star, null);
});

test('stage 3, frame: a service let go of while it starts: never made if before its turn, never heard from once made (no state to the host, no search)', { skip: chats3 }, async () => {
  let done;
  let { F } = await boot3('/', { retired: new Promise((ok) => (done = ok)) });
  const a = F.service('chats');
  F.releaseService('chats', { terminate: true });
  done();
  await assert.rejects(a, /let go of/);
  assert.equal(H3.svcMade, 0, 'no Worker started for it');
  F.destroy();
  ({ F } = await boot3('/'));
  let go;
  const slow = H3.loadService;
  H3.loadService = (app, F2) => new Promise((ok) => (go = () => ok(slow(app, F2))));
  const b = F.service('chats');
  await settle3();
  F.releaseService('chats', { terminate: true });
  go(); await b.catch(() => {}); await settle3();
  assert.deepEqual(H3.states, [], 'nothing to serviceState'); assert.equal(H3.finds.length, 0, 'no search registered');
  assert.deepEqual(H3.released, [[1, true]], 'ended as soon as it was made');
  H3.svc.emit('state', { state: 'ready' }); await settle3();
  assert.equal(H3.finds.length, 0, 'its later patches unheard');
  F.destroy();
});
