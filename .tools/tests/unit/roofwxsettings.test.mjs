// Weather Settings under the roof (One roof, spec §7.1, §7.4, §9.4 WS): what each page saves through core.saveSettings
// (only the keys it edits, laid over the whole stored wx:settings as core does) is a wx:settings that weather/app.js's
// own loadSettings takes as it is (run here from app.js's text: defaults, CARDS, layoutOf, solarOf, notifyOf and
// loadSettings, extracted and run over a stand-in store), so standalone Weather and the account read the same thing; a
// Units save keeps glass, notify and keys the module doesn't know, and Arrange Now never lists or moves daily and radar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIN } from './fixtures/roof.mjs';

const WX = new URL('weather/', MAIN), FILE = new URL('weather/roof/wxsettings.js', MAIN);
const W = await import(FILE.href);
const I = await import(new URL('insights.js', WX).href);
const SOL = await import(new URL('solar.js', WX).href);
const A = await import(new URL('account.js', WX).href);
const { makeFormat } = await import(new URL('format.js', WX).href);

// ---- app.js's settings functions, from its text ----
const APP = readFileSync(new URL('app.js', WX), 'utf8');
// (from `start` to the end of its balanced {…} or […], or to its ; at depth 0; strings, templates and regexes skipped)
function cut(src, start) {
  let i = src.indexOf(start);
  assert.ok(i >= 0, `app.js has ${start}`);
  const from = i;
  let depth = 0, opened = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") { const q = c; for (i++; src[i] !== q; i++) if (src[i] === '\\') i++; continue; }
    if (c === '`') { for (i++; src[i] !== '`'; i++) { if (src[i] === '\\') i++; else if (src[i] === '$' && src[i + 1] === '{') { let d = 1; for (i += 2; d; i++) { if (src[i] === '{') d++; else if (src[i] === '}') d--; } i--; } } continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && /[(,=:[!&|?{};]\s*$/.test(src.slice(Math.max(0, i - 3), i))) { for (i++; src[i] !== '/'; i++) { if (src[i] === '\\') i++; else if (src[i] === '[') { for (i++; src[i] !== ']'; i++) if (src[i] === '\\') i++; } } continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; opened = true; }
    else if (c === '}' || c === ']' || c === ')') { depth--; if (!depth && c === '}' && opened && start.startsWith('function')) return src.slice(from, i + 1); }
    else if (c === ';' && !depth) return src.slice(from, i + 1);
  }
  throw new Error(`no end for ${start}`);
}
const parts = ['const defaults = ', 'const CARDS = ', 'function layoutOf(', 'function solarOf(', 'function notifyOf(', 'function loadSettings('].map((s) => cut(APP, s));
const kit = new Function('store', 'I', 'FACES', 'PITCHES', 'MAX_ZONES', 'A', 'makeFormat', 'document', 'S',
  `${parts.join('\n')}\nreturn { defaults, CARDS, layoutOf, solarOf, notifyOf, loadSettings };`);
// app.js's loadSettings over a stored wx:settings → what it holds (S.settings)
function load(stored) {
  const S = {}, mem = { 'wx:settings': stored === undefined ? null : JSON.parse(JSON.stringify(stored)) };
  const k = kit({ get: (key) => mem[key] ?? null }, I, SOL.FACES, SOL.PITCHES, SOL.MAX_ZONES, A, makeFormat, { body: { dataset: {} } }, S);
  k.loadSettings();
  return S.settings;
}
const { CARDS } = kit({ get: () => null }, I, SOL.FACES, SOL.PITCHES, SOL.MAX_ZONES, A, makeFormat, { body: { dataset: {} } }, {});
// core.saveSettings(patch): the whole stored wx:settings, only the keys in patch changed
const saved = (stored, patch) => { assert.ok(patch && typeof patch === 'object', 'a patch'); return { ...JSON.parse(JSON.stringify(stored)), ...JSON.parse(JSON.stringify(patch)) }; };
// the round trip: saved, then read by app.js, is what was saved (nothing put back to a default), the patch's keys as given
function takes(stored, patch, what) {
  const next = saved(stored, patch), back = load(next);
  assert.deepEqual(back, next, `${what}: app.js loadSettings takes the saved wx:settings as it is`);
  for (const k of Object.keys(patch)) assert.deepEqual(back[k], patch[k], `${what}: ${k} as saved`);
  return next;
}

// a device's wx:settings as app.js keeps it: glass tinted, daily and radar moved (radar off), a briefing, a key from
// elsewhere (zzz) the module doesn't know
const ORDER = ['radar', 'nowcast', 'solar', 'hourly', 'right-now', 'insights-card', 'windows', 'daily', 'accuracy', 'climate'];
const BASE = load({
  temp: 'c', wind: 'mph', glass: 'tinted', layout: { order: ORDER, off: ['radar', 'climate'] }, zzz: { kept: 1 },
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

test('Units: each choice saves only its key, taken by app.js; glass, notify, zzz and daily/radar left as they were', () => {
  let s = BASE;
  for (const [key, [, opts]] of Object.entries(W.UNITS)) {
    for (const [v] of opts) {
      const patch = W.PATCH.units(s, key, v);
      assert.deepEqual(Object.keys(patch), [key]);
      s = takes(s, patch, `Units ${key}=${v}`);
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

test('Arrange Now: moves and show/hide never list or touch daily and radar, and app.js takes every layout saved', () => {
  let s = BASE;
  const listed = () => s.layout.order.filter((k) => !W.FIXED.includes(k));
  // every listed card down to the bottom and back up, one place at a time
  for (const k of listed()) {
    for (let n = 0; n < 10; n++) { const L = W.moveCard(s.layout, k, 1); if (!L) break; s = takes(s, W.PATCH.arrange(s, L), `move ${k} down`); assert.deepEqual(fixed(s), fixed(BASE)); }
    assert.equal(listed().at(-1), k, `${k} at the bottom of the list`);
    assert.equal(W.moveCard(s.layout, k, 1), null, 'the last can’t go further down');
  }
  const first = listed()[0];
  assert.equal(W.moveCard(s.layout, first, -1), null, 'the first can’t go further up');
  for (const k of W.FIXED) { assert.equal(W.moveCard(s.layout, k, 1), null, `${k} isn’t moved`); assert.equal(W.showCard(s.layout, k, true), null, `${k} isn’t shown or hidden here`); }
  // hide and show
  s = takes(s, W.PATCH.arrange(s, W.showCard(s.layout, 'hourly', false)), 'hide hourly');
  assert.ok(s.layout.off.includes('hourly') && s.layout.off.includes('radar'));
  s = takes(s, W.PATCH.arrange(s, W.showCard(s.layout, 'climate', true)), 'show climate');
  assert.ok(!s.layout.off.includes('climate'));
  assert.deepEqual(fixed(s), fixed(BASE));
  // put back as it was: the listed cards in CARDS' order, all shown; radar still first and off, daily still eighth
  s = takes(s, W.PATCH.arrange(s, W.resetLayout(s.layout, CARDS)), 'put back');
  assert.deepEqual(listed(), CARDS.map((c) => c[0]).filter((k) => !W.FIXED.includes(k)));
  assert.deepEqual(s.layout.off, ['radar']);
  assert.deepEqual(fixed(s), fixed(BASE));
  assert.equal(s.glass, 'tinted');
  assert.equal(W.summary('arrange', s, makeFormat(s), CARDS), 'As usual');
});

test('Best Times: adding, changing, switching off and removing activities save a list app.js takes', () => {
  let s = BASE;
  const add = (id) => { const a = W.newActivity(id); assert.ok(a && a.on === true && typeof a.name === 'string'); s = takes(s, W.PATCH.best(s, [...s.activities, a]), `add ${id}`); return a; };
  add('golf');
  const mine = add('custom');
  assert.match(mine.id, /^my/);
  assert.equal(W.newActivity('nope'), null);
  const acts = JSON.parse(JSON.stringify(s.activities));
  acts[0].on = false; acts.at(-1).tmin = 4; acts.at(-1).name = 'Dog walk';
  s = takes(s, W.PATCH.best(s, acts), 'change');
  assert.equal(s.activities[0].on, false);
  s = takes(s, W.PATCH.best(s, s.activities.filter((a) => a.id !== 'golf')), 'remove golf');
  assert.ok(!s.activities.some((a) => a.id === 'golf'));
  assert.equal(s.glass, 'tinted');
  assert.match(W.summary('best', s, makeFormat(s)), /Dog walk/);
});

test('Commute: on, leave and return save the commute app.js takes', () => {
  let s = BASE;
  s = takes(s, W.PATCH.commute(s, { on: true }), 'commute on');
  s = takes(s, W.PATCH.commute(s, { am: '07:45' }), 'leave');
  s = takes(s, W.PATCH.commute(s, { pm: '18:15' }), 'return');
  assert.deepEqual(s.commute, { on: true, am: '07:45', pm: '18:15' });
  assert.equal(W.summary('commute', s, makeFormat(s)), '07:45, 18:15');
  assert.equal(W.summary('commute', load({ ...s, clock: '12' }), makeFormat({ clock: '12' })).toLowerCase().replace(/\s/g, ''), '7:45am,6:15pm');
});

test('Solar: a zone at the place shown, changed, a second, the alert and removing them save what app.js takes', () => {
  let s = BASE;
  // on with no zones: one at the place shown
  const z = W.newZone(s, PLACES, 0);
  assert.equal(z.place, 'London');
  s = takes(s, W.PATCH.solar(s, { on: true, zones: [z] }), 'solar on');
  assert.equal(s.solar.on, true);
  const zs = JSON.parse(JSON.stringify(s.solar.zones));
  Object.assign(zs[0], { name: 'East roof', faces: 'E', pitch: 30, kw: 2.5 });
  s = takes(s, W.PATCH.solar(s, { zones: zs }), 'zone changed');
  // with only My Location shown: still a saved place first; with none saved, where My Location is, its name left out
  const z2 = W.newZone(s, PLACES, 1);
  assert.equal(z2.place, 'London');
  assert.equal(z2.name, 'Roof');
  const z3 = W.newZone(s, [PLACES[1]], 0);
  assert.equal(z3.place, '');
  s = takes(s, W.PATCH.solar(s, { zones: [...s.solar.zones, z2, z3] }), 'two more zones');
  assert.equal(W.summary('solar', s, makeFormat(s)), '3 zones');
  s = takes(s, W.PATCH.solar(s, { alert: false }), 'alert off');
  assert.equal(s.solar.alert, false);
  // the most there can be
  const full = { ...s, solar: { ...s.solar, zones: Array.from({ length: SOL.MAX_ZONES }, (_, i) => ({ ...z, id: `z${i}` })) } };
  assert.equal(W.newZone(full, PLACES, 0), null);
  // every zone removed: off, as app.js has it
  s = takes(s, W.PATCH.solar(s, { zones: [] }), 'all removed');
  assert.equal(s.solar.on, false);
  assert.equal(W.PATCH.solar(s, { on: true }).solar.on, false, 'not on with no zone to be on for');
  assert.equal(s.glass, 'tinted');
});

test('Forecast: tune and each “also look out for” switch save only their key, taken by app.js', () => {
  let s = BASE;
  const p = W.PATCH.tune(s, false);
  assert.deepEqual(Object.keys(p), ['tune']);
  s = takes(s, p, 'tune off');
  assert.equal(W.summary('forecast', s, makeFormat(s)), 'Not tuned');
  for (const [k] of W.EXTRAS) {
    const q = W.PATCH.extras(s, k, false);
    assert.deepEqual(Object.keys(q), ['extras']);
    s = takes(s, q, `${k} off`);
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
