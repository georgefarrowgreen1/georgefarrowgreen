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
// reload rules, flush, the stay keys and the connector providers they all need (s24-contracts §13; s4 spec §5): j0's
// share ≤ 1.5 KB plus stage 2's framework work, stage 3's ≤ 1.3 KB after)
test('roof/*.js together: at most 24 KB gzipped, comments stripped', { skip: roofSkip }, () => {
  const all = files().map((f) => strip(read(f))).join('\n');
  const gz = gzipSync(all).length;
  assert.ok(gz <= 24 * 1024, `roof/*.js is ${gz} bytes gzipped (comments stripped), over 24576`);
  assert.ok(strip('a(); // x\n/* y */b();').trim() === 'a();\nb();', 'the stripping takes comments, not code');
});

// ---- stages 2–4's additions to fw and F (s24-contracts §4–§7), where the inflite repo beside has them ----
const s24 = roofSkip || (!/fw\.nav\.depth|depth: \(\) => curDepth\(\)/.test(read('frame.js')) && 'the inflite repo beside is from before stages 2–4 (frame.js has no nav.depth)');
test('stages 2–4, frame.js: sections false hides the switcher, back: { label } from the module, nav.go with replace and kind, nav.depth, stay keys left by the tidy, fw.changed, session.hubAgain', { skip: s24 }, () => {
  const f = strip(read('frame.js'));
  assert.match(f, /sections: h\.sections === false \|\| h\.sections === null \? null : R\.sections/, 'false (and null) hide it; anything else shows it');
  assert.match(f, /back: \{ label: h\.back\?\.label \|\| \(to \? `Back to \$\{to\}` : "Back"\) \}/, 'the module’s label, the action always F.nav.back');
  assert.match(f, /go: \(path, o\) => F\.nav\.go\(path, \{ from: app, replace: !!o\?\.replace, kind: o\?\.kind \}\)/);
  assert.match(f, /depth: \(\) => curDepth\(\)/);
  assert.match(f, /function tidy\(r\) \{\n\s*if \(REGISTRY\[r\.app\]\?\.stay\?\.includes\(r\.key\)\) return;/, 'a stay key stays in the address');
  assert.match(f, /changed: \(\) => \{ T\(\(\) => opts\.changed\?\.\(app\)\); \}/);
  assert.match(f, /hubAgain: \(\) => F\.hubAgain\(\)/);
  assert.ok(!/roofOn\(\)/.test(f), 'no single flag for every app: roofs() gives parse the map');
  assert.match(f, /const roofs = \(\) => \{ const s = sess\(\); return s\.hub \? s\.apps : false; \};/);
});

test('stages 2–4, frame.js: F.flush caps each module at 2 s and sums lost; reloads the frame starts itself wait while busy; the bounce flushes first; fw.lazy asks the version and retries with ?retry=<n>', { skip: s24 }, () => {
  const f = strip(read('frame.js'));
  assert.match(f, /flush\(\) \{\n\s*return Promise\.all\(Object\.values\(mods\)\.map\(\(m\) => Promise\.race\(\[Promise\.resolve\(\)\.then\(\(\) => m\.instance\?\.flush\?\.\(\)\)\.catch\(\(\) => null\), new Promise\(\(ok\) => setTimeout\(ok, 2000\)\)\]\)\)\)/);
  assert.match(f, /lost: a\.reduce\(\(n, x\) => n \+ \(Number\(x\?\.lost\) \|\| 0\), 0\)/);
  assert.match(f, /if \(!F\.busy\(\)\) \{ T\(\(\) => mods\[shownApp\]\?\.instance\?\.flush\?\.\(\)\); return go\(\); \}\n\s*F\.flush\(\)\.then\(\(\) => safely\(go\)\);/, 'the bounce: at once with nothing unsaved (stage 1), else flushed, then once nothing is unsaved');
  assert.match(f, /if \(!F\.busy\(\)\) \{ clearInterval\(later\); return go\(\); \}/);
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
  assert.match(m, /if \(!s\.apps\?\.\[app\]\) throw new Error/);
  assert.match(m, /const ln = R\.link \|\| app, base = links\[ln\]/);
  assert.match(m, /keepOffline\(app, m\.BUILD, \[\.\.\.\(c\.files \|\| \[\]\), \.\.\.lazy\]\)\), 10e3\)/, 'lazy kept only on the Home Screen, 10 s on');
});
