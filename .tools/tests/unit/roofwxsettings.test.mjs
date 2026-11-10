// Weather Settings under the roof (One roof, spec §7.1, §7.4, §9.4 WS): what each page saves through core.saveSettings
// (only the keys it edits; saved by WX's real core.saveSettings, which lays them over the whole stored wx:settings) is a
// wx:settings that weather/app.js's own loadSettings takes as it is (taken out of app.js's text by roofwxcore.test's
// extractor and run over the same stand-in storage), so standalone Weather and the account read the same thing; a
// Units save keeps glass, notify and keys the module doesn't know, and Arrange Now never lists or moves daily and radar.
// And the sheet itself, driven on FW's stand-in DOM with FW's real ui.js and sheet.js: every page opened and saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIN, ROOF, roofSkip } from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';

// ---- the browser bits core touches (as roofwxcore.test has them): storage, events, a network that never answers ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.fetch = async () => { throw Object.assign(new Error('offline (test)'), { offline: true }); };

const WX = new URL('weather/', MAIN), FILE = new URL('weather/roof/wxsettings.js', MAIN);
const W = await import(FILE.href);
const core = await import(new URL('roof/core.js', WX).href);
const I = await import(new URL('insights.js', WX).href);
const SOL = await import(new URL('solar.js', WX).href);
const A = await import(new URL('account.js', WX).href);
const { makeFormat } = await import(new URL('format.js', WX).href);
const { store } = await import(new URL('data.js', WX).href);

// ---- app.js's settings functions taken out of its text by name, as roofwxcore.test's extractor does (its sourceOf,
// copied: that test keeps it to itself): the whole source, brackets matched, strings, comments and regexes stepped over
const APP = readFileSync(new URL('app.js', WX), 'utf8');
function sourceOf(name) {
  const m = new RegExp(String.raw`^(?:async\s+)?function\s+${name}\s*\(|^const\s+${name}\s*=`, 'm').exec(APP);
  assert.ok(m, `app.js has ${name}`);
  let i = m.index, depth = 0, seenBody = false;
  const isFn = /function/.test(m[0]);
  for (; i < APP.length; i++) {
    const c = APP[i], n2 = APP.slice(i, i + 2);
    if (n2 === '//') { i = APP.indexOf('\n', i); continue; }
    if (n2 === '/*') { i = APP.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < APP.length && APP[i] !== c; i++) { if (APP[i] === '\\') i++; else if (c === '`' && APP[i] === '$' && APP[i + 1] === '{') { let d = 0; for (; i < APP.length; i++) { if (APP[i] === '{') d++; else if (APP[i] === '}' && --d === 0) break; } } }
      continue;
    }
    if (c === '/' && /[=(,:!&|?{};]\s*$/.test(APP.slice(Math.max(0, i - 3), i))) { for (i++; i < APP.length && APP[i] !== '/'; i++) { if (APP[i] === '\\') i++; else if (APP[i] === '[') { for (; APP[i] !== ']'; i++) if (APP[i] === '\\') i++; } } continue; }
    if ('([{'.includes(c)) { depth++; if (c === '{') seenBody = true; continue; }
    if (')]}'.includes(c)) { depth--; if (isFn && depth === 0 && c === '}' && seenBody) return APP.slice(m.index, i + 1); continue; }
    if (!isFn && depth === 0 && c === ';') return APP.slice(m.index, i + 1);
  }
  throw new Error(`no end to ${name}`);
}
const NAMES = ['defaults', 'CARDS', 'layoutOf', 'solarOf', 'notifyOf', 'loadSettings'];
const kit = new Function('A', 'S', 'store', 'I', 'makeFormat', 'FACES', 'PITCHES', 'MAX_ZONES', 'document',
  `${NAMES.map(sourceOf).join('\n')}\nreturn { ${NAMES.join(', ')} };`);
// app.js's loadSettings over a stored wx:settings → what it holds (S.settings)
function load(stored) {
  const S = {}, was = mem.get('wx:settings');
  mem.set('wx:settings', JSON.stringify(stored));
  try { kit(A, S, store, I, makeFormat, SOL.FACES, SOL.PITCHES, SOL.MAX_ZONES, { body: { dataset: {} } }).loadSettings(); }
  finally { if (was == null) mem.delete('wx:settings'); else mem.set('wx:settings', was); }
  return S.settings;
}
const { CARDS } = kit(A, {}, store, I, makeFormat, SOL.FACES, SOL.PITCHES, SOL.MAX_ZONES, { body: { dataset: {} } });
// core.saveSettings(patch), the real one (WX's): the whole stored wx:settings with only the keys in patch changed (never
// B0's stub: this file fails on it rather than checking itself)
async function saved(stored, patch) {
  assert.ok(!('STUB' in core) && typeof core.saveSettings === 'function', 'WX’s core.saveSettings (not B0’s stub)');
  assert.ok(patch && typeof patch === 'object', 'a patch');
  const want = { ...JSON.parse(JSON.stringify(stored)), ...JSON.parse(JSON.stringify(patch)) };
  mem.set('wx:settings', JSON.stringify(stored));
  const heard = [], off = core.on('settings', (d) => heard.push(d));
  await core.saveSettings(patch);
  off();
  const next = JSON.parse(mem.get('wx:settings'));
  assert.deepEqual(next, want, 'core keeps the whole stored wx:settings, only the patch’s keys changed');
  assert.deepEqual(heard, [{ keys: Object.keys(patch) }], 'core says which keys changed');
  return next;
}
// the round trip: saved, then read by app.js, is what was saved (nothing put back to a default), the patch's keys as given
async function takes(stored, patch, what) {
  const next = await saved(stored, patch), back = load(next);
  assert.deepEqual(back, next, `${what}: app.js loadSettings takes the saved wx:settings as it is`);
  for (const k of Object.keys(patch)) assert.deepEqual(back[k], patch[k], `${what}: ${k} as saved`);
  assert.deepEqual(core.S.settings, back, `${what}: core holds what app.js reads`);
  return next;
}

// a device's wx:settings as app.js keeps it: glass tinted, daily and radar moved (radar off), a briefing, a key from
// elsewhere (zzz) the module doesn't know
const ORDER = ['radar', 'nowcast', 'solar', 'hourly', 'right-now', 'insights-card', 'windows', 'daily', 'climate'];
const BASE = load({
  temp: 'c', wind: 'mph', glass: 'tinted', layout: { order: [...ORDER, 'accuracy'], off: ['radar', 'climate'] }, zzz: { kept: 1 },
  notify: { places: [{ lat: 51.5, lon: -0.12, name: 'London', rain: true, warn: true }], brief: { lat: 51.5, lon: -0.12, name: 'London' }, briefAt: '07:15', endpoint: 'https://push.example/x', devId: 'd1', syncedAt: 5 },
});
const PLACES = [{ name: 'London', lat: 51.5072, lon: -0.1276 }, { name: 'My Location', lat: 53.48, lon: -2.24, gps: true }];
const fixed = (s) => ({ daily: s.layout.order.indexOf('daily'), radar: s.layout.order.indexOf('radar'), off: s.layout.off.filter((k) => W.FIXED.includes(k)) });

test('the stand-in device: app.js keeps it as it is, glass, layout, notify and an unknown key with it', () => {
  assert.equal(BASE.glass, 'tinted');
  assert.deepEqual(BASE.layout.order, ORDER);
  assert.deepEqual(BASE.zzz, { kept: 1 });
  assert.deepEqual(load(BASE), BASE);
  assert.deepEqual(CARDS.map((c) => c[0]).sort(), [...ORDER].sort());
});

test('Units: each choice saves only its key, taken by app.js; glass, notify, zzz and daily/radar left as they were', async () => {
  let s = BASE;
  for (const [key, [, opts]] of Object.entries(W.UNITS)) {
    for (const [v] of opts) {
      const patch = W.PATCH.units(s, key, v);
      assert.deepEqual(Object.keys(patch), [key]);
      s = await takes(s, patch, `Units ${key}=${v}`);
      assert.equal(s.glass, 'tinted');
      assert.deepEqual(s.notify, BASE.notify);
      assert.deepEqual(s.zzz, { kept: 1 });
      assert.deepEqual(s.layout, BASE.layout);
      assert.deepEqual(fixed(s), { daily: 7, radar: 0, off: ['radar'] });
    }
  }
  assert.equal(W.PATCH.units(s, 'temp', 'k'), null, 'a unit app.js doesn’t know is never saved');
  assert.equal(W.PATCH.units(s, 'glass', 'clear'), null, 'no Look page: glass isn’t a unit');
  // app.js's own choices are the module's, every one
  const form = readFileSync(new URL('index.html', WX), 'utf8');
  for (const [key, [, opts]] of Object.entries(W.UNITS)) {
    const theirs = [...form.matchAll(new RegExp(`name="${key}" value="([^"]+)"`, 'g'))].map((m) => m[1]);
    assert.deepEqual(opts.map((o) => o[0]).sort(), theirs.sort(), `Units ${key}: the same choices as Weather’s own Settings`);
  }
});

test('Arrange Now: moves and show/hide never list or touch daily and radar, and app.js takes every layout saved', async () => {
  let s = BASE;
  const listed = () => s.layout.order.filter((k) => !W.FIXED.includes(k));
  // every listed card down to the bottom and back up, one place at a time
  for (const k of listed()) {
    for (let n = 0; n < 10; n++) { const L = W.moveCard(s.layout, k, 1); if (!L) break; s = await takes(s, W.PATCH.arrange(s, L), `move ${k} down`); assert.deepEqual(fixed(s), fixed(BASE)); }
    assert.equal(listed().at(-1), k, `${k} at the bottom of the list`);
    assert.equal(W.moveCard(s.layout, k, 1), null, 'the last can’t go further down');
  }
  const first = listed()[0];
  assert.equal(W.moveCard(s.layout, first, -1), null, 'the first can’t go further up');
  for (const k of W.FIXED) { assert.equal(W.moveCard(s.layout, k, 1), null, `${k} isn’t moved`); assert.equal(W.showCard(s.layout, k, true), null, `${k} isn’t shown or hidden here`); }
  // hide and show
  s = await takes(s, W.PATCH.arrange(s, W.showCard(s.layout, 'hourly', false)), 'hide hourly');
  assert.ok(s.layout.off.includes('hourly') && s.layout.off.includes('radar'));
  s = await takes(s, W.PATCH.arrange(s, W.showCard(s.layout, 'climate', true)), 'show climate');
  assert.ok(!s.layout.off.includes('climate'));
  assert.deepEqual(fixed(s), fixed(BASE));
  // put back as it was: the listed cards in CARDS' order, all shown; radar still first and off, daily still eighth
  s = await takes(s, W.PATCH.arrange(s, W.resetLayout(s.layout, CARDS)), 'put back');
  assert.deepEqual(listed(), CARDS.map((c) => c[0]).filter((k) => !W.FIXED.includes(k)));
  assert.deepEqual(s.layout.off, ['radar']);
  assert.deepEqual(fixed(s), fixed(BASE));
  assert.equal(s.glass, 'tinted');
  assert.equal(W.summary('arrange', s, makeFormat(s), CARDS), 'As usual');
});

test('Best Times: adding, changing, switching off and removing activities save a list app.js takes', async () => {
  let s = BASE;
  const add = async (id) => { const a = W.newActivity(id); assert.ok(a && a.on === true && typeof a.name === 'string'); s = await takes(s, W.PATCH.best(s, [...s.activities, a]), `add ${id}`); return a; };
  await add('golf');
  const mine = await add('custom');
  assert.match(mine.id, /^my/);
  assert.equal(W.newActivity('nope'), null);
  const acts = JSON.parse(JSON.stringify(s.activities));
  acts[0].on = false; acts.at(-1).tmin = 4; acts.at(-1).name = 'Dog walk';
  s = await takes(s, W.PATCH.best(s, acts), 'change');
  assert.equal(s.activities[0].on, false);
  s = await takes(s, W.PATCH.best(s, s.activities.filter((a) => a.id !== 'golf')), 'remove golf');
  assert.ok(!s.activities.some((a) => a.id === 'golf'));
  assert.equal(s.glass, 'tinted');
  assert.match(W.summary('best', s, makeFormat(s)), /Dog walk/);
});

test('Commute: on, leave and return save the commute app.js takes', async () => {
  let s = BASE;
  s = await takes(s, W.PATCH.commute(s, { on: true }), 'commute on');
  s = await takes(s, W.PATCH.commute(s, { am: '07:45' }), 'leave');
  s = await takes(s, W.PATCH.commute(s, { pm: '18:15' }), 'return');
  assert.deepEqual(s.commute, { on: true, am: '07:45', pm: '18:15' });
  assert.equal(W.summary('commute', s, makeFormat(s)), '07:45, 18:15');
  assert.equal(W.summary('commute', load({ ...s, clock: '12' }), makeFormat({ clock: '12' })).toLowerCase().replace(/\s/g, ''), '7:45am,6:15pm');
});

test('Solar: a zone at the place shown, changed, a second, the alert and removing them save what app.js takes', async () => {
  let s = BASE;
  // on with no zones: one at the place shown
  const z = W.newZone(s, PLACES, 0);
  assert.equal(z.place, 'London');
  s = await takes(s, W.PATCH.solar(s, { on: true, zones: [z] }), 'solar on');
  assert.equal(s.solar.on, true);
  const zs = JSON.parse(JSON.stringify(s.solar.zones));
  Object.assign(zs[0], { name: 'East roof', faces: 'E', pitch: 30, kw: 2.5 });
  s = await takes(s, W.PATCH.solar(s, { zones: zs }), 'zone changed');
  // with only My Location shown: still a saved place first; with none saved, where My Location is, its name left out
  const z2 = W.newZone(s, PLACES, 1);
  assert.equal(z2.place, 'London');
  assert.equal(z2.name, 'Roof');
  const z3 = W.newZone(s, [PLACES[1]], 0);
  assert.equal(z3.place, '');
  s = await takes(s, W.PATCH.solar(s, { zones: [...s.solar.zones, z2, z3] }), 'two more zones');
  assert.equal(W.summary('solar', s, makeFormat(s)), '3 zones');
  assert.equal(W.summary('solar', { ...s, solar: { ...s.solar, zones: [{ ...z, faces: 'S', pitch: 0 }] } }, makeFormat(s)), `${SOL.facesName('S')}, 0°`, 'as Weather’s own Solar folder says it');
  s = await takes(s, W.PATCH.solar(s, { alert: false }), 'alert off');
  assert.equal(s.solar.alert, false);
  // the most there can be
  const full = { ...s, solar: { ...s.solar, zones: Array.from({ length: SOL.MAX_ZONES }, (_, i) => ({ ...z, id: `z${i}` })) } };
  assert.equal(W.newZone(full, PLACES, 0), null);
  // every zone removed: off, as app.js has it
  s = await takes(s, W.PATCH.solar(s, { zones: [] }), 'all removed');
  assert.equal(s.solar.on, false);
  assert.equal(W.PATCH.solar(s, { on: true }).solar.on, false, 'not on with no zone to be on for');
  assert.equal(s.glass, 'tinted');
});

test('Forecast: tune and each “also look out for” switch save only their key, taken by app.js', async () => {
  let s = BASE;
  const p = W.PATCH.tune(s, false);
  assert.deepEqual(Object.keys(p), ['tune']);
  s = await takes(s, p, 'tune off');
  assert.equal(W.summary('forecast', s, makeFormat(s)), 'Off', 'as Weather’s own Forecast folder says it');
  for (const [k] of W.EXTRAS) {
    const q = W.PATCH.extras(s, k, false);
    assert.deepEqual(Object.keys(q), ['extras']);
    s = await takes(s, q, `${k} off`);
    assert.equal(s.extras[k], false);
  }
  assert.deepEqual(s.extras, { laundry: false, stars: false, sunset: false });
  assert.equal(s.glass, 'tinted');
});

test('the sheet: every page, the Notifications row to You, saves only through core.saveSettings, no Look page, no stub', () => {
  const src = readFileSync(FILE, 'utf8');
  assert.deepEqual([...W.PAGES], ['units', 'arrange', 'best', 'commute', 'solar', 'forecast']);
  assert.ok(!('STUB' in W), 'the real sheet: no STUB export');
  assert.match(src, /export function openSettings\(ctx, page = null\)/);
  assert.match(src, /sheet: "wxsettings"/);
  assert.match(src, /"\/#you=notify-weather"/);
  assert.match(src, /core\.saveSettings\(patch\)/);
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  assert.equal([...code.matchAll(/saveSettings\(/g)].length, 1, 'one save, through core');
  assert.doesNotMatch(src, /localStorage|wx:settings"|glass:/, 'nothing written but through core; glass never touched');
  for (const p of W.PAGES) assert.ok(new RegExp(`\\b${p}: ${p}Page\\b`).test(src), `${p} has a page`);
  // every key a page edits is a top-level wx:settings key app.js keeps
  for (const k of ['temp', 'wind', 'precip', 'pressure', 'clock', 'layout', 'activities', 'commute', 'solar', 'tune', 'extras']) assert.ok(k in BASE, k);
});

// ---- the sheet itself, driven: openSettings on FW's stand-in DOM, with FW's real ui.js and sheet.js, WX's real core,
// a stand-in nav and toast. Every page opened and saved (§9.4): each control sends one patch with only its key, into the
// right place (the card, the activity, the zone, the time), kept in wx:settings with glass, notify and zzz as they were.
// (The stand-in DOM is not a browser: events don't bubble, so a change on a form is dispatched on the form; a field
// takes its value from its attribute, and a select from its selected option, as a browser does on first draw: settle.)
const flush = () => new Promise((r) => setImmediate(r));
function settle(node) {
  for (const i of node.querySelectorAll('input')) if (i._value === undefined && i.hasAttribute('value')) i.value = i.getAttribute('value');
  for (const s of node.querySelectorAll('select')) if (s._value === undefined) { const os = s.querySelectorAll('option'); const o = os.find((x) => x.selected) || os[0]; if (o) s.value = o.getAttribute('value'); }
}
const byLabel = (node, l) => node.querySelectorAll('input').find((i) => i.getAttribute('aria-label') === l);
const flip = (input, on) => { input.checked = on; input.dispatch('change'); };
const choose = (sel, v) => { sel.value = v; sel.dispatch('change'); };

test('the sheet, driven: every page opened and saved, one patch each with only its key, through WX’s core', { skip: roofSkip }, async () => {
  globalThis.document = fakeDocument();
  globalThis.matchMedia ??= () => ({ matches: true });
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
  globalThis.cancelAnimationFrame ??= (t) => clearTimeout(t);
  globalThis.scrollX = 0; globalThis.scrollY = 0;
  globalThis.scrollTo ??= (x, y) => { globalThis.scrollX = Number(x) || 0; globalThis.scrollY = Number(y) || 0; };
  globalThis.location ??= new URL('https://inflite.ai/weather/');
  const ui = await import(new URL('ui.js', ROOF).href);
  const { createSheets } = await import(new URL('sheet.js', ROOF).href);
  assert.ok(!('STUB' in core), 'WX’s real core');
  mem.set('wx:settings', JSON.stringify(BASE));
  core.loadSettings();
  core.S.places = PLACES; core.S.cur = 0; core.S.acct = null;
  const patches = [], navs = [], toasts = [];
  const C = { S: core.S, CARDS: core.CARDS, loadSettings: core.loadSettings, on: core.on, saveSettings: (p) => { patches.push(JSON.parse(JSON.stringify(p))); return core.saveSettings(p); } };
  const user = { id: 'u1', name: 'Pat' };
  const fw = { ui, sheet: createSheets({}), nav: { go: (u) => navs.push(u) }, toast: (m) => toasts.push(m), session: { get user() { return user; } } };
  const ctx = { S: core.S, core: C, fw };
  const kept = () => JSON.parse(mem.get('wx:settings'));
  // one action → exactly one patch, with only `key`; the rest of wx:settings as it was
  async function one(key, run) {
    const n = patches.length;
    run();
    await flush();
    assert.equal(patches.length, n + 1, `one save for ${key}`);
    const p = patches.at(-1);
    assert.deepEqual(Object.keys(p), [key], `only ${key} saved`);
    const k = kept();
    assert.deepEqual(k[key], p[key], `${key} kept in wx:settings as sent`);
    assert.equal(k.glass, 'tinted'); assert.deepEqual(k.notify, BASE.notify); assert.deepEqual(k.zzz, { kept: 1 });
    return p[key];
  }

  // -- the list: signed in under the roof → the account's line, even before sync knows the account (I3)
  let h = W.openSettings(ctx, null);
  const d = h.el;
  assert.equal(d.getAttribute('data-sheet'), 'wxsettings');
  assert.equal(d.getAttribute('data-app'), 'weather');
  assert.equal(d.querySelector('.ifs-hero span').textContent, 'Your places and settings are kept with your account.');
  assert.deepEqual(d.querySelectorAll('[data-go]').map((r) => r.getAttribute('data-go')), [...W.PAGES]);
  const page = (p) => { const pg = d.querySelector(`[data-page=${p}]`); assert.ok(pg, `${p} pushed`); settle(pg); return pg; };
  const go = (p) => { d.querySelector(`[data-go=${p}]`).click(); return page(p); };
  const back = () => d.dispatch('click', { target: d.querySelector('[data-back]') });
  const val = (p) => d.querySelector(`[data-go=${p}] .ifl-val`).textContent;

  // -- Forecast: tune, then each extra
  let pg = go('forecast');
  assert.equal(await one('tune', () => flip(pg.querySelector('[data-key=tune] input'), false)), false);
  for (const [k] of W.EXTRAS) {
    const x = await one('extras', () => flip(pg.querySelector(`[data-extra=${k}] input`), false));
    assert.equal(x[k], false, `${k} off`);
  }
  assert.deepEqual(kept().extras, { laundry: false, stars: false, sunset: false });
  back();
  assert.equal(val('forecast'), 'Off', 'the list says it as Weather’s own Forecast folder');

  // -- Commute: on, Leave, Return (each into its own field)
  pg = go('commute');
  const c0 = core.S.settings.commute;
  let c = await one('commute', () => flip(pg.querySelector('[data-key=commute] input'), true));
  assert.deepEqual(c, { ...c0, on: true });
  c = await one('commute', () => choose(pg.querySelector('select[name=am]'), '07:45'));
  assert.deepEqual([c.am, c.pm], ['07:45', c0.pm], 'Leave saves am, Return untouched');
  c = await one('commute', () => choose(pg.querySelector('select[name=pm]'), '18:15'));
  assert.deepEqual(c, { on: true, am: '07:45', pm: '18:15' }, 'Return saves pm, Leave untouched');
  back();
  assert.equal(val('commute'), '07:45, 18:15');

  // -- Solar: on (a zone at the place shown), its page, a second zone, the alert; a zone at My Location keeps its place
  pg = go('solar');
  let sol = await one('solar', () => flip(byLabel(pg, 'Solar panels'), true));
  assert.equal(sol.on, true); assert.equal(sol.zones.length, 1); assert.equal(sol.zones[0].place, 'London');
  const z1 = sol.zones[0].id;
  pg.querySelector(`[data-zone=${z1}]`).click();
  let zp = page('zone');
  zp.querySelector('[name=zname]').value = 'East roof';
  zp.querySelector('[name=zfaces]').value = 'E';
  zp.querySelector('[name=zpitch]').value = '30';
  sol = await one('solar', () => zp.querySelector('.wxs-edit').dispatch('change', { target: zp.querySelector('[name=zpitch]') }));
  assert.deepEqual([sol.zones[0].name, sol.zones[0].faces, sol.zones[0].pitch, sol.zones[0].place], ['East roof', 'E', 30, 'London']);
  back();
  sol = await one('solar', () => pg.querySelector('[data-act=add]').click());
  assert.equal(sol.zones.length, 2); assert.equal(sol.zones[0].name, 'East roof', 'the first zone as it was');
  await flush();
  page('zone'); back();
  sol = await one('solar', () => flip(byLabel(pg, 'Tell me when the sun’s coming out'), false));
  assert.equal(sol.alert, false); assert.equal(sol.zones.length, 2);
  // a zone where no saved place is (made with only My Location saved): an edit keeps its place "" (I5c)
  const gpsZone = { ...W.newZone(core.S.settings, [PLACES[1]], 0), id: 'zgps', name: 'Shed' };
  assert.equal(gpsZone.place, '');
  await one('solar', () => C.saveSettings({ solar: { ...core.S.settings.solar, zones: [...core.S.settings.solar.zones, gpsZone] } }));
  pg.querySelector('[data-zone=zgps]').click();
  zp = page('zone');
  zp.querySelector('[name=zname]').value = 'Big shed';
  sol = await one('solar', () => zp.querySelector('.wxs-edit').dispatch('change', { target: zp.querySelector('[name=zname]') }));
  const g = sol.zones.find((z) => z.id === 'zgps');
  assert.deepEqual([g.name, g.place, g.lat, g.lon], ['Big shed', '', gpsZone.lat, gpsZone.lon], 'the stand-in spot keeps the zone’s own place');
  back(); back();
  assert.equal(val('solar'), '3 zones');

  // -- Best Times: add, switch one off, an activity's page into its own index, two-tap Remove
  pg = go('best');
  const a0 = core.S.settings.activities.map((a) => a.id);
  let acts = await one('activities', () => choose(pg.querySelector('select[aria-label="Add an activity"]') || pg.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === 'Add an activity'), 'golf'));
  assert.deepEqual(acts.map((a) => a.id), [...a0, 'golf']);
  acts = await one('activities', () => flip(pg.querySelector('[data-activity=golf] input'), false));
  assert.equal(acts.at(-1).on, false); assert.ok(acts.slice(0, -1).every((a, k) => a.on === core.S.settings.activities[k].on), 'only golf switched off');
  acts = await one('activities', () => flip(pg.querySelector('[data-activity=golf] input'), true));
  assert.equal(acts.at(-1).on, true);
  pg.querySelector('[data-activity=golf] .ifl-row').click();
  const ap = page('activity');
  ap.querySelector('[name=name]').value = 'Golf day';
  ap.querySelector('[name=tmin]').value = '6';
  acts = await one('activities', () => ap.querySelector('.wxs-edit').dispatch('change', { target: ap.querySelector('[name=tmin]') }));
  const gi = acts.findIndex((a) => a.id === 'golf');
  assert.equal(gi, acts.length - 1);
  assert.equal(acts[gi].name, 'Golf day'); assert.equal(acts[gi].tmin, 6);
  assert.deepEqual(acts.slice(0, gi).map((a) => a.name), core.S.settings.activities.slice(0, gi).map((a) => a.name), 'the others as they were');
  const del = ap.querySelector('[data-act=delete]');
  del.click();
  assert.ok(d.querySelector('[data-page=activity]'), 'one tap only asks');
  acts = await one('activities', () => del.click());
  assert.ok(!acts.some((a) => a.id === 'golf'), 'removed on the second tap');
  assert.ok(!d.querySelector('[data-page=activity]'), 'and its page put away');
  back();

  // -- Arrange Now: daily and radar never listed; a switch, a move (swapped with its listed neighbour), Put Back
  pg = go('arrange');
  const cardsOn = () => pg.querySelectorAll('[data-card]').map((r) => r.getAttribute('data-card'));
  assert.ok(!cardsOn().some((k) => W.FIXED.includes(k)), 'daily and radar never listed');
  let L = await one('layout', () => flip(pg.querySelector('[data-card=hourly] input'), false));
  assert.ok(L.off.includes('hourly') && L.off.includes('radar'));
  const before = cardsOn(), i = before.indexOf('solar');
  L = await one('layout', () => pg.querySelector('[data-card=solar] [data-act=down]').click());
  const after = cardsOn();
  assert.deepEqual([after[i], after[i + 1]], [before[i + 1], 'solar'], 'Solar down one, redrawn from what was saved');
  assert.match(pg.querySelector('.wxs-said').textContent, /^Solar: \d+ of \d+\.$/);
  assert.deepEqual([L.order.indexOf('daily'), L.order.indexOf('radar')], [ORDER.indexOf('daily'), ORDER.indexOf('radar')], 'daily and radar where they were');
  L = await one('layout', () => pg.querySelector('[data-act=reset]').click());
  assert.deepEqual(L.off, ['radar']);
  const popped = pg.querySelector('.wxs-arrange'), drawn = cardsOn().join();
  back();
  // a popped page is never drawn again (I5a): Arrange opened anew and a move made there leaves the old one as it was
  pg = go('arrange');
  await one('layout', () => pg.querySelector('[data-card=solar] [data-act=down]').click());
  assert.notEqual(cardsOn().join(), drawn, 'the page shown is redrawn');
  assert.equal(popped.querySelectorAll('[data-card]').map((r) => r.getAttribute('data-card')).join(), drawn, 'the popped one isn’t');
  back();

  // -- Units: each key's choice saves that key only
  pg = go('units');
  for (const [key, [, opts]] of Object.entries(W.UNITS)) {
    const v = opts.find(([x]) => x !== core.S.settings[key])[0];
    assert.equal(await one(key, () => pg.querySelector(`[data-key=${key}] [data-value=${v}]`).click()), v);
    assert.equal(pg.querySelector(`[data-key=${key}] [aria-checked=true]`).getAttribute('data-value'), v);
  }
  back();
  assert.deepEqual(toasts, [], 'every save went through');

  // -- Notifications: You's sheet, the settings sheet put away first, nothing saved
  const n = patches.length;
  const notify = d.querySelectorAll('a').find((a) => a.getAttribute('href') === '/#you=notify-weather');
  assert.ok(notify, 'the Notifications row');
  const e = notify.dispatch('click', { button: 0 });
  assert.ok(e.defaultPrevented);
  assert.ok(h.closed, 'the sheet closed');
  assert.deepEqual(navs, ['/#you=notify-weather']);
  assert.equal(patches.length, n);

  // -- straight at a page (#settings=units), signed out of everything: this device's line, put right on "acct" (I3)
  user.id = null;
  h = W.openSettings(ctx, 'units');
  assert.ok(h.el.querySelector('[data-page=units]'), 'opened at Units');
  assert.equal(h.el.querySelector('.ifs-hero span').textContent, 'Settings and places stay on this device.');
  core.S.acct = { id: 'a1', handle: 'pat', state: 'ok' };
  core.emit('acct', core.S.acct);
  assert.equal(h.el.querySelector('.ifs-hero span').textContent, 'Your places and settings are kept with your account.');
  h.close();
  core.S.acct = null;
});
