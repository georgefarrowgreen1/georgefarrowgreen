// One roof's frame (IFL today/public/roof/frame.js) run, not read: createFrame with a stand-in DOM, history, location
// and timers, the real router.js beside it, and stand-ins for the frame's pieces (header, tabs, sheets, search, send,
// modules.js, connectors.js) that note what the frame asks of them. Proves stages 2–4's framework behaviour that j0 built
// (roof/s24-contracts.md §4, §6, §7): per-app setRoof and D14's bounce (at once when idle, after the shown module is
// idle, never over unsaved work, never once you've left it, one 'hidden' at a time), F.flush's 2 s cap, fw.lazy's
// version ask and ?retry, one connector provider per app (Places kept while another module provides its own), a stay
// key's focus and scroll, Weather's pop not scrolled again after show (stage 1's), fw.nav.go's kinds, the back label,
// sections: false and nav.depth. The host's parts (app.js: signOut's Sign Out Anyway?, signedOutNow) are roofshell's.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOF_DIR, appsSkip } from './fixtures/roof.mjs';

const skip = appsSkip;
const kit = (globalThis.__roofkit = {});

// ---- the stand-in DOM: elements that keep children, classes, dataset, attributes and focus
class El {
  constructor(tag = 'div', attrs = {}) {
    Object.assign(this, { tag, attrs: {}, children: [], parent: null, hidden: false, inert: false, dataset: {}, cls: new Set() });
    this.classList = {
      add: (...c) => c.forEach((x) => this.cls.add(x)), remove: (...c) => c.forEach((x) => this.cls.delete(x)), contains: (c) => this.cls.has(c),
      toggle: (c, v) => { v = v === undefined ? !this.cls.has(c) : !!v; if (v) this.cls.add(c); else this.cls.delete(c); return v; },
    };
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'data') Object.assign(this.dataset, v); else if (k === 'hidden') this.hidden = !!v;
      else if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((c) => this.cls.add(c)); else this.attrs[k] = v;
    }
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  append(...c) { for (const x of c) if (x instanceof El) { x.remove(); x.parent = this; this.children.push(x); } }
  prepend(...c) { for (const x of c.reverse()) if (x instanceof El) { x.remove(); x.parent = this; this.children.unshift(x); } }
  replaceChildren(...c) { for (const x of [...this.children]) x.remove(); this.append(...c); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { let n = this; while (n.parent) n = n.parent; return n === kit.body; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() { kit.doc.activeElement = this; }
  addEventListener() {}
  removeEventListener() {}
  cloneNode() { return new El(this.tag); }
}

// ---- the frame's pieces, stood in (they read kit at call time)
const STUBS = {
  'header.js': 'export function createHeader() { const k = globalThis.__roofkit; return { set(h) { k.heads.push(h); }, destroy() {}, compact() {} }; }',
  'tabs.js': 'export function createTabs() { return { set() {}, destroy() {} }; }',
  'sheet.js': 'export function createSheets() { const k = globalThis.__roofkit; return { top: () => k.sheetTop, closeAll() {}, open() {} }; }',
  'toast.js': 'export function toast() { return { close() {} }; }',
  'ui.js': 'export const el = (t, a, ...c) => { const e = new globalThis.__roofkit.El(t, a); e.append(...c); return e; }; export const skeleton = () => new globalThis.__roofkit.El("div");',
  'search.js': 'export function createSearch() { const k = globalThis.__roofkit; return { provide(p) { k.provided.add(p); return () => k.provided.delete(p); } }; }',
  'send.js': 'export function createSend() { return {}; }',
  'modules.js': 'export const loadModule = (app, F) => globalThis.__roofkit.load(app, F);',
  'connectors.js': 'export function connectorProvider(F, app) { const k = globalThis.__roofkit; k.cp.add(app); return () => k.cp.delete(app); }',
};
let createFrame = null, T = null;
async function sandbox() {
  if (createFrame) return;
  T = mkdtempSync(join(tmpdir(), 'roofframe-'));
  for (const f of ['frame.js', 'router.js', 'requests.js']) copyFileSync(join(ROOF_DIR, f), join(T, f));
  for (const [f, src] of Object.entries(STUBS)) writeFileSync(join(T, f), src);
  for (const f of ['modules.js', 'connectors.js']) await import(pathToFileURL(join(T, f)).href);
  ({ createFrame } = await import(pathToFileURL(join(T, 'frame.js')).href));
}

// ---- a page: location, history (back() fires popstate at once), document, window, storage, fetch
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((ok) => setImmediate(ok)); };
function page(path) {
  const win = new EventTarget(), docT = new EventTarget();
  const loc = {
    set(h) { const u = new URL(h, this.href || 'https://ifl.test/'); Object.assign(this, { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash }); },
    reload() { kit.reloads++; }, assign(p) { kit.assigns.push(p); },
  };
  loc.set(path);
  const hist = {
    entries: [{ state: null, url: loc.href }], i: 0, scrollRestoration: 'auto',
    get state() { return this.entries[this.i].state; },
    pushState(s, _, p) { this.entries.length = this.i + 1; this.entries.push({ state: structuredClone(s), url: new URL(p, loc.href).href }); this.i++; loc.set(this.entries[this.i].url); },
    replaceState(s, _, p) { this.entries[this.i] = { state: structuredClone(s), url: new URL(p, loc.href).href }; loc.set(this.entries[this.i].url); },
    back() { if (this.i > 0) { this.i--; loc.set(this.entries[this.i].url); win.dispatchEvent(new Event('popstate')); } },
  };
  const store = new Map();
  Object.assign(kit, {
    El, reloads: 0, assigns: [], heads: [], provided: new Set(), cp: new Set(), inst: {}, busy: {}, flushR: {}, showP: {}, build: {}, served: {},
    fetches: [], idle: [], y: 0, sheetTop: null, body: new El('body'), h1: new El('h1'),
    session: { view: { user: { id: 'u1', name: 'U' } }, hub: true, roof: true, links: {}, apps: { weather: true, markets: true, fitness: false, mail: true } },
    load: async (app, F) => {
      const fw = F.forModule(app);
      const inst = {
        fw, shows: 0, hides: 0, unmounts: 0, flushes: 0,
        show() { this.shows++; return kit.showP[app]; }, hide() { this.hides++; }, unmount() { this.unmounts++; }, busy() { return !!kit.busy[app]; },
        flush() { this.flushes++; return kit.flushR[app] ?? Promise.resolve({ lost: 0 }); },
      };
      kit.inst[app] = inst;
      return { instance: inst, m: { BUILD: kit.build[app] ?? '1.00' } };
    },
  });
  kit.views = new El('div'); kit.body.append(kit.views, kit.h1);
  kit.doc = {
    documentElement: new El('html'), activeElement: null, visibilityState: 'visible',
    addEventListener: docT.addEventListener.bind(docT), removeEventListener: docT.removeEventListener.bind(docT), dispatchEvent: docT.dispatchEvent.bind(docT),
    querySelector: (s) => (s === '#hd h1.ifh-name' ? kit.h1 : null), getElementById: () => null,
  };
  Object.assign(globalThis, {
    location: loc, history: hist, document: kit.doc, win,
    addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    scrollTo: (_, y) => { kit.y = y; }, requestAnimationFrame: () => 0, requestIdleCallback: (f) => kit.idle.push(f),
    fetch: async (u) => { kit.fetches.push(String(u)); const app = String(u).split('/')[1]; return { ok: true, json: async () => ({ build: kit.served[app] ?? '1.00' }) }; },
  });
  Object.defineProperty(globalThis, 'scrollY', { configurable: true, get: () => kit.y });
  return { loc, hist, store, win };
}
async function boot(path, apps) {
  await sandbox();
  const P = page(path);
  if (apps) kit.session.apps = apps;
  const F = createFrame({ session: () => kit.session, views: kit.views, changed: (a) => (kit.changed ||= []).push(a) });
  await settle();
  return { F, ...P };
}
const hidden = () => { kit.doc.visibilityState = 'hidden'; kit.doc.dispatchEvent(new Event('visibilitychange')); kit.doc.visibilityState = 'visible'; kit.doc.dispatchEvent(new Event('visibilitychange')); };
const switchOff = (F, app) => { kit.session.apps = { ...kit.session.apps, [app]: false }; F.setRoof(kit.session.apps.weather, kit.session.apps); };
function timed(t) {
  return async (c) => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1.7e12 });
    let F = null;
    try { await t(c, (f) => (F = f)); } finally { try { F?.destroy(); } catch (_) {} mock.timers.reset(); }
  };
}
const tick = async (ms) => { mock.timers.tick(ms); await settle(); };

test('setRoof per app: the shown one switched off, nothing unsaved → its flush, unmounted, the bounce marker and one reload at once (stage 1’s)', { skip }, timed(async (_, keep) => {
  const { F, store, loc } = await boot('/markets/'); keep(F);
  const m = kit.inst.markets;
  assert.ok(m && m.shows >= 1, 'Markets mounted and shown');
  switchOff(F, 'markets');
  assert.equal(kit.reloads, 1); assert.equal(store.get('ifl-roof-bounce'), '1'); assert.equal(m.flushes, 1); assert.equal(m.unmounts, 1);
  assert.equal(loc.pathname, '/markets/', 'reloaded at its own address');
}));

test('setRoof per app: an app switched off that isn’t shown is flushed and let go of with no reload; the shown one, still on, is untouched; Weather with no flush() goes at once', { skip }, timed(async (_, keep) => {
  const { F } = await boot('/weather/'); keep(F);
  delete kit.inst.weather.flush;           // (stage 1's Weather module has none)
  F.nav.go('/markets/'); await settle();
  F.nav.go('/mail/'); await settle();
  const wx = kit.inst.weather, mk = kit.inst.markets, ml = kit.inst.mail;
  kit.idle.splice(0).forEach((f) => f()); await settle();
  assert.deepEqual([...kit.cp].sort(), ['mail', 'markets', 'weather'], 'a connector provider for each app that’s on');
  kit.flushR.markets = new Promise((ok) => (kit.mkDone = ok));
  kit.session.apps = { ...kit.session.apps, markets: false, weather: false };
  F.setRoof(false, kit.session.apps);
  assert.equal(wx.unmounts, 1, 'Weather (no flush) at once, as stage 1');
  assert.equal(mk.flushes, 1); assert.equal(mk.unmounts, 0, 'Markets waits for its own flush');
  kit.mkDone({ lost: 0 }); await settle();
  assert.equal(mk.unmounts, 1);
  assert.equal(ml.unmounts, 0); assert.equal(kit.reloads, 0, 'no reload: Mail, shown, is still on');
  await settle();
  assert.deepEqual([...kit.cp].sort(), ['mail'], 'the off apps’ providers are gone');
  // (and back on: the provider again, no mount)
  kit.session.apps = { ...kit.session.apps, fitness: true };
  F.setRoof(false, kit.session.apps); await settle();
  assert.ok(kit.cp.has('fitness'));
}));

test('setRoof: the shown one busy → F.flush first, no reload while busy, the bounce once it’s idle', { skip }, timed(async (_, keep) => {
  const { F, store } = await boot('/markets/'); keep(F);
  const m = kit.inst.markets;
  kit.busy.markets = true;
  switchOff(F, 'markets'); await settle();
  assert.equal(kit.reloads, 0); assert.equal(m.flushes, 1, 'F.flush asked it');
  await tick(3000);
  assert.equal(kit.reloads, 0, 'never over unsaved work');
  kit.busy.markets = false;
  await tick(1000);
  assert.equal(kit.reloads, 1); assert.equal(store.get('ifl-roof-bounce'), '1');
}));

test('setRoof: busy, then Back to Today → no reload and no marker; the off module flushed and let go of', { skip }, timed(async (_, keep) => {
  const { F, store, loc } = await boot('/'); keep(F);
  F.nav.go('/markets/'); await settle();
  const m = kit.inst.markets;
  kit.busy.markets = true;
  switchOff(F, 'markets'); await settle();
  F.nav.back(); await settle();
  assert.equal(loc.pathname, '/');
  kit.sheetTop = { close() {} };          // (a sheet open on Today doesn't hold the off module's letting go)
  await tick(1000);
  assert.equal(kit.reloads, 0); assert.equal(store.get('ifl-roof-bounce'), undefined);
  assert.ok(m.flushes >= 2, 'its own flush again before it goes'); assert.equal(m.unmounts, 1);
  kit.sheetTop = null;
  await tick(20000); hidden(); await settle();
  assert.equal(kit.reloads, 0, 'nothing later either');
}));

test('setRoof: still busy after 10 s → waits for hidden (flushed again), stays armed while busy, one listener at a time, exactly one reload', { skip }, timed(async (_, keep) => {
  const { F } = await boot('/markets/'); keep(F);
  const m = kit.inst.markets;
  kit.busy.markets = true;
  switchOff(F, 'markets'); await settle();
  await tick(11000);
  assert.equal(kit.reloads, 0);
  const n = m.flushes;
  hidden(); await settle();
  assert.equal(kit.reloads, 0, 'still busy at hidden: no reload'); assert.equal(m.flushes, n + 1, 'flushed at hidden');
  hidden(); await settle();
  assert.equal(m.flushes, n + 1, 'the hidden listener went with it (re-armed by polling, not twice)');
  kit.busy.markets = false;
  await tick(1000);
  assert.equal(kit.reloads, 1);
  hidden(); await settle(); await tick(20000);
  assert.equal(kit.reloads, 1, 'exactly one');
}));

test('F.flush: every mounted module’s flush(), each capped at 2 s; lost summed', { skip }, timed(async (_, keep) => {
  const { F } = await boot('/weather/'); keep(F);
  F.nav.go('/markets/'); await settle();
  kit.flushR.markets = new Promise(() => {});
  kit.flushR.weather = Promise.resolve({ lost: 2 });
  let got = null;
  F.flush().then((r) => (got = r)); await settle();
  assert.equal(got, null);
  await tick(1999); assert.equal(got, null);
  await tick(1); assert.deepEqual(got, { lost: 2 });
}));

test('fw.lazy: q "" then "?retry=<n>" after a failed import; /<app>/version beside it at most once a minute and at once on a failure; a new build → stale, the reload once idle', { skip }, timed(async (_, keep) => {
  const { F, store } = await boot('/markets/'); keep(F);
  const fw = kit.inst.markets.fw, qs = [], v = () => kit.fetches.filter((u) => u === '/markets/version').length;
  assert.equal(await fw.lazy((q) => { qs.push(q); return Promise.resolve('x'); }), 'x');
  await settle(); assert.equal(v(), 1);
  await fw.lazy((q) => { qs.push(q); return 'y'; }); await settle();
  assert.equal(v(), 1, 'not again within the minute');
  await assert.rejects(fw.lazy((q) => { qs.push(q); return Promise.reject(new Error('net')); })); await settle();
  assert.equal(v(), 2, 'asked at once on the failure'); assert.equal(F.stale, false, 'same build: not stale');
  await fw.lazy((q) => { qs.push(q); return 'z'; });
  assert.deepEqual(qs, ['', '', '', '?retry=1']);
  // (a failure and a new build: stale, and the reload at the route once nothing is unsaved)
  kit.served.markets = '1.01'; kit.busy.markets = true;
  await assert.rejects(fw.lazy(() => Promise.reject(new Error('gone')))); await settle();
  assert.equal(F.stale, true);
  await tick(3000); assert.equal(kit.reloads, 0, 'busy: waits');
  kit.busy.markets = false; await tick(1000);
  assert.equal(kit.reloads, 1); assert.ok(store.get('ifl-here:today'), 'where you were kept (D21)');
}));

test('fw.lazy: a new build found beside a good import sets stale and the import is still used', { skip }, timed(async (_, keep) => {
  const { F } = await boot('/markets/'); keep(F);
  kit.served.markets = '2.00';
  assert.equal(await kit.inst.markets.fw.lazy(() => 'ok'), 'ok'); await settle();
  assert.equal(F.stale, true); assert.equal(kit.reloads, 0, 'no reload from a good import');
}));

test('providers: one connector provider per app that’s on; a module’s own replaces only its own (Places kept), and its connector’s comes back when it goes', { skip }, timed(async (_, keep) => {
  const { F } = await boot('/markets/'); keep(F);
  kit.idle.splice(0).forEach((f) => f()); await settle();
  assert.deepEqual([...kit.cp].sort(), ['mail', 'markets', 'weather']);
  const p = { id: 'mk-own' }, drop = kit.inst.markets.fw.search.provide(p); await settle();
  assert.ok(kit.provided.has(p)); assert.ok(!kit.cp.has('markets'), 'Markets’ connector provider stood down');
  assert.ok(kit.cp.has('weather'), 'Places kept while Markets is mounted'); assert.ok(kit.cp.has('mail'));
  drop(); await settle();
  assert.ok(!kit.provided.has(p)); assert.ok(kit.cp.has('markets'), 'back');
}));

test('fw.nav.go: kind push | tab | zoom | section passed on; "pop" (or anything else) ignored, a push as any other', { skip }, timed(async (_, keep) => {
  const { F, hist } = await boot('/markets/'); keep(F);
  const fw = kit.inst.markets.fw, el = fw.screenEl;
  assert.equal(fw.nav.depth(), 0, 'a cold screen');
  fw.nav.go('/markets/#news', { kind: 'pop' }); await settle();
  assert.equal(hist.i, 1); assert.equal(fw.nav.depth(), 1);
  assert.ok(el.cls.has('ifl-enter-push') && !el.cls.has('ifl-enter-pop'), 'rendered as a push');
  fw.nav.go('/markets/#holdings', { kind: 'section', replace: true }); await settle();
  assert.equal(hist.i, 1, 'replace'); assert.ok(!el.cls.has('ifl-enter-section') && !el.cls.has('ifl-enter-fade'), 'a section: not animated');
}));

test('header: back { label } as given, sections: false (and null) hide the switcher, any other shows it', { skip }, timed(async (_, keep) => {
  const { F } = await boot('/mail/'); keep(F);
  const fw = kit.inst.mail.fw, last = () => kit.heads.at(-1);
  assert.equal(last().back.label, 'Back to Apps'); assert.equal(last().sections.length, 4);
  fw.header.set({ sections: false, back: { label: 'Back to Mail' } });
  assert.equal(last().sections, null); assert.equal(last().back.label, 'Back to Mail');
  fw.header.set({ sections: null }); assert.equal(last().sections, null);
  fw.header.set({ sections: true }); assert.equal(last().sections.length, 4);
}));

test('a stay key (Mail’s #thread): push → focus to the title and the key kept in the address; Back → focus back and the saved scroll again after show() resolves', { skip }, timed(async (_, keep) => {
  const { F, loc } = await boot('/mail/'); keep(F);
  const m = kit.inst.mail, row = new El('button');
  m.fw.screenEl.append(row); row.focus(); kit.y = 300;
  F.nav.go('/mail/#thread=t1'); await settle();
  assert.equal(kit.doc.activeElement, kit.h1, 'focus to the header’s title'); assert.equal(loc.hash, '#thread=t1', 'tidy leaves a stay key');
  assert.equal(kit.y, 0);
  let done; kit.showP.mail = new Promise((ok) => (done = ok));
  history.back(); await settle();
  assert.equal(kit.y, 300, 'the saved scroll at once');
  assert.equal(kit.doc.activeElement, row, 'focus back where it was');
  kit.y = 40; done(); await settle();
  assert.equal(kit.y, 300, 'and again once show() resolved');
}));

test('Weather’s Back (no stay key): the saved scroll at once, never pulled back again after show() (stage 1’s)', { skip }, timed(async (_, keep) => {
  const { F } = await boot('/weather/'); keep(F);
  kit.y = 400;
  F.nav.go('/#apps'); await settle();
  let done; kit.showP.weather = new Promise((ok) => (done = ok));
  history.back(); await settle();
  assert.equal(kit.y, 400);
  kit.y = 50; done(); await settle();
  assert.equal(kit.y, 50, 'left where the user scrolled to');
}));

test.after(() => { if (T) rmSync(T, { recursive: true, force: true }); });
