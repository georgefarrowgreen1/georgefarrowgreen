// The framework's search (One roof, spec §3.10, D16: on this device only): providers merged in order (order, then id),
// at most 8 entries each, entries with nowhere to go left out; a slow provider shown when it arrives, after the quick
// ones; one that throws or refuses left out; the sheet drawn through a stand-in DOM with the Apps provider on an empty
// field, results as options, Enter opening the first, "Nothing for “…”"; and the query never leaves the page: a fake
// fetch fails the test if it is called, and storage and history fail it if they are written. Skips (with the reason)
// when the inflite repo beside has no roof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOF, roofSkip } from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const later = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const e = (title, href = '/#you') => ({ title, href });

// nothing may leave the page or be kept: these fail the test if touched
function guard() {
  const fail = (what) => () => { throw new Error(`search used ${what}`); };
  globalThis.fetch = fail('fetch');
  globalThis.XMLHttpRequest = function () { throw new Error('search used XMLHttpRequest'); };
  globalThis.navigator ??= {};
  try { globalThis.navigator.sendBeacon = fail('sendBeacon'); } catch (_) {}
  const store = { getItem: () => null, setItem: fail('storage'), removeItem: fail('storage'), clear: fail('storage') };
  globalThis.localStorage = store; globalThis.sessionStorage = store;
  globalThis.history = { state: null, pushState: fail('history.pushState'), replaceState: fail('history.replaceState') };
  globalThis.indexedDB = { open: fail('indexedDB') };
}

test('collect: merged by order then id, at most 8 each, entries with nowhere to go left out', { skip: roofSkip }, async () => {
  guard();
  const { collect } = await import(new URL('search.js', ROOF));
  const calls = [];
  const P = [
    { id: 'b', group: 'B', order: 20, search: (q) => { calls.push(['b', q]); return [e('B1'), e('B2')]; } },
    { id: 'a', group: 'A', order: 20, search: () => Array.from({ length: 12 }, (_, i) => e(`A${i}`)) },
    { id: 'z', group: 'Z', order: 5, search: () => [e('Z1'), { title: 'no way to go' }, { href: '/x' }, null, { title: 'run', run: () => {} }] },
    { id: 'empty', group: 'E', order: 1, search: () => [] },
  ];
  let got = null, done = 0;
  await collect(P, 'lon', (g, settled) => { got = g; if (settled) done++; });
  assert.deepEqual(got.map((g) => g.id), ['z', 'a', 'b'], 'ordered by order, then id; an empty group left out');
  assert.equal(got.find((g) => g.id === 'a').entries.length, 8, 'at most 8 entries a group');
  assert.deepEqual(got.find((g) => g.id === 'z').entries.map((x) => x.title), ['Z1', 'run'], 'an entry needs a title and an href or a run');
  assert.deepEqual(calls, [['b', 'lon']], 'each provider asked once, with the query');
  assert.equal(done, 1, 'settled once');
});

test('collect: a slow provider is shown when it arrives; one that throws or refuses is left out', { skip: roofSkip }, async () => {
  guard();
  const { collect } = await import(new URL('search.js', ROOF));
  const seen = [];
  const P = [
    { id: 'slow', group: 'Slow', order: 1, search: () => later(120, [e('late')]) },
    { id: 'quick', group: 'Quick', order: 9, search: () => later(5, [e('soon')]) },
    { id: 'boom', group: 'Boom', order: 2, search: () => { throw new Error('no'); } },
    { id: 'no', group: 'No', order: 3, search: () => Promise.reject(new Error('no')) },
    { id: 'junk', group: 'Junk', order: 4, search: () => 'not a list' },
  ];
  const t0 = Date.now();
  await collect(P, 'x', (g, settled) => seen.push({ ids: g.map((x) => x.id), settled, at: Date.now() - t0 }), { slow: 40 });
  assert.deepEqual(seen.map((s) => s.ids), [['quick'], ['slow', 'quick']], 'first the quick ones (once slow ms passed), then the slow one in its place');
  assert.ok(seen[0].at >= 35 && seen[0].at < 110, `the first draw waited for the slow mark, not the slow provider (${seen[0].at} ms)`);
  assert.deepEqual(seen.map((s) => s.settled), [false, true]);
  const fast = [];
  await collect([{ id: 'q', order: 1, search: () => [e('now')] }], 'x', (g, s) => fast.push([g.length, s]), { slow: 1000 });
  assert.deepEqual(fast, [[1, true]], 'all quick: drawn once, at once');
  const none = [];
  await collect([], 'x', (g, s) => none.push([g.length, s]));
  assert.deepEqual(none, [[0, true]], 'no providers: drawn empty and settled');
});

test('the sheet: Apps on an empty field, options as you type, Enter opens the first, nothing kept or sent', { skip: roofSkip }, async () => {
  guard();
  const doc = globalThis.document = fakeDocument();
  globalThis.IFL = { glyph: () => '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>', iconUrl: () => 'blob:x' };
  const ui = await import(new URL('ui.js', ROOF));
  const { createSearch } = await import(new URL('search.js', ROOF));
  let opened = null, closed = 0;
  const F = {
    ui,
    sheet: { open(spec) { opened = spec; const body = doc.createElement('div'); body.append(spec.body); doc.body.append(body); return { el: body, body, close() { closed++; spec.onClose?.(); } }; } },
  };
  const S = createSearch(F);
  const off = S.provide({ id: 'places', group: 'Places', order: 20, search: (q) => [{ title: 'London', sub: 'England', icon: 'weather', href: '/weather/?lat=1&lon=2&name=London' }].filter((x) => x.title.toLowerCase().includes(q.toLowerCase())) });
  S.provide({ id: 'boom', group: 'Boom', order: 1, search: () => { throw new Error('no'); } });
  S.provide({ id: 'people', group: 'People', order: 30, search: (q) => (q === 'pat' ? [{ title: 'Pat', avatar: 'Pat', run: () => { ran++; } }] : []) });
  let ran = 0;
  S.open();
  assert.equal(opened.sheet, 'search', 'the sheet is data-sheet=search');
  assert.equal(opened.title, 'Search everything');
  const input = doc.querySelector('input[type=search]');
  assert.ok(input, 'its input[type=search]');
  assert.equal(doc.activeElement, input, 'focused at once, inside the tap (no wait)');
  assert.equal(opened.focus, input, 'and the sheet is told to focus it as it opens');
  assert.equal(input.getAttribute('role'), 'combobox');
  const listbox = doc.querySelector(`#${input.getAttribute('aria-controls')}`);
  assert.ok(listbox, 'aria-controls names the results');
  await sleep(450);
  const titles = () => doc.querySelectorAll('[role=option]').map((o) => o.querySelector('b').textContent);
  assert.deepEqual(titles(), ['Weather', 'Chats', 'Fitness', 'Markets', 'Mail'], 'an empty field: every app (the Apps provider), no other provider asked');
  assert.equal(listbox.getAttribute('role'), 'listbox');
  const type = async (v) => { input.value = v; input.dispatch('input'); await sleep(450); };
  await type('lon');
  assert.deepEqual(titles(), ['London'], 'typed: Places’ London; the throwing provider left out');
  assert.equal(doc.querySelector('[role=option]').getAttribute('href'), '/weather/?lat=1&lon=2&name=London', 'a result is a link to its place');
  await type('16 days');
  assert.deepEqual(titles(), ['Weather · 16 Days'], 'an app’s section by its name');
  await type('fitness · act');
  assert.deepEqual(titles(), ['Fitness · Activities'], 'a page beside the framework, by its section');
  await type('pat');
  let clicked = 0;
  const first = doc.querySelector('[role=option]');
  first.addEventListener('click', () => { clicked++; });
  input.dispatch('keydown', { key: 'Enter' });
  assert.equal(clicked, 1, 'Enter opens the first result');
  assert.equal(ran, 1, 'a result with run runs it');
  assert.equal(closed, 1, 'and the sheet closes first');
  S.open();
  const input2 = doc.querySelectorAll('input[type=search]').at(-1);
  input2.value = 'zzqx'; input2.dispatch('input'); await sleep(450);
  assert.equal(doc.querySelectorAll('.ifl-none').at(-1).textContent, 'Nothing for “zzqx”', '“Nothing for …”, as text');
  assert.ok(!doc.querySelectorAll('.ifl-results').at(-1).hasAttribute('role'), 'no results: no empty listbox');
  off();
  input2.value = 'lon'; input2.dispatch('input'); await sleep(450);
  assert.deepEqual(doc.querySelectorAll('.ifl-results').at(-1).querySelectorAll('[role=option]').length, 0, 'a provider let go of is asked no more');
  input2.value = '<img src=x onerror=alert(1)>'; input2.dispatch('input'); await sleep(450);
  assert.ok(!doc.querySelectorAll('.ifl-none').at(-1).children.length && /^Nothing for “<img/.test(doc.querySelectorAll('.ifl-none').at(-1).textContent), 'what was typed is said back as text only');
});
