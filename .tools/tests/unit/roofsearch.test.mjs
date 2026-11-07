// The framework's search (One roof, spec §3.10, D16: on this device only): providers merged in order (order, then id),
// at most 20 entries each, entries with nowhere to go left out; a slow provider shown when it arrives, after the quick
// ones; one that throws or refuses left out. match: a start, a word's start, inside a word, every word, an acronym, a
// slip, accents aside, and what matched. rank: a Top hit, groups by their best, an address once, a recent one higher,
// a provider's offer to look further last. Recent: what was opened (with an address), the account's own, Mail's only
// for the admin, Clear. The sheet through a stand-in DOM: the empty field (your apps as icons, Recent, shortcuts, no
// section rows), typing (Top hit, groups of three with Show all, the letters in bold), ↑/↓, Enter, Esc, opening a result
// keeping it in Recent, Mail's provider asked only for the admin; and the query never leaves the page: a fake fetch
// fails the test if it is called, history fails it if written, and storage takes only Recent's one key, never what was
// typed. Skips (with the reason) when the inflite repo beside has no roof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOF, roofSkip } from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const later = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const e = (title, href = '/#you') => ({ title, href });

// nothing may leave the page; storage only Recent's key (writes listed in kept)
function guard() {
  const fail = (what) => () => { throw new Error(`search used ${what}`); };
  globalThis.fetch = fail('fetch');
  globalThis.XMLHttpRequest = function () { throw new Error('search used XMLHttpRequest'); };
  globalThis.navigator ??= {};
  try { globalThis.navigator.sendBeacon = fail('sendBeacon'); } catch (_) {}
  const data = {}, kept = [];
  const ok = (k) => { if (k !== 'ifl:recent') throw new Error(`search used storage: ${k}`); };
  globalThis.localStorage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { ok(k); kept.push(String(v)); data[k] = String(v); }, removeItem: (k) => { ok(k); kept.push(null); delete data[k]; }, clear: fail('storage') };
  globalThis.sessionStorage = { getItem: () => null, setItem: fail('sessionStorage'), removeItem: fail('sessionStorage'), clear: fail('sessionStorage') };
  globalThis.history = { state: null, pushState: fail('history.pushState'), replaceState: fail('history.replaceState') };
  globalThis.indexedDB = { open: fail('indexedDB') };
  return { data, kept };
}

test('collect: merged by order then id, at most 20 each, entries with nowhere to go left out', { skip: roofSkip }, async () => {
  guard();
  const { collect } = await import(new URL('search.js', ROOF));
  const calls = [];
  const P = [
    { id: 'b', group: 'B', order: 20, search: (q) => { calls.push(['b', q]); return [e('B1'), e('B2')]; } },
    { id: 'a', group: 'A', order: 20, search: () => Array.from({ length: 25 }, (_, i) => e(`A${i}`)) },
    { id: 'z', group: 'Z', order: 5, search: () => [e('Z1'), { title: 'no way to go' }, { href: '/x' }, null, { title: 'run', run: () => {} }] },
    { id: 'empty', group: 'E', order: 1, search: () => [] },
  ];
  let got = null, done = 0;
  await collect(P, 'lon', (g, settled) => { got = g; if (settled) done++; });
  assert.deepEqual(got.map((g) => g.id), ['z', 'a', 'b'], 'ordered by order, then id; an empty group left out');
  assert.equal(got.find((g) => g.id === 'a').entries.length, 20, 'at most 20 entries a group');
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

test('match: a start before a word’s start before inside one; every word; an acronym; a slip; accents aside; what matched', { skip: roofSkip }, async () => {
  const { match } = await import(new URL('search.js', ROOF));
  const s = (q, t) => match(q, t)?.s ?? 0;
  const lit = (q, t) => (match(q, t)?.hits || []).map(([a, z]) => t.slice(a, z));
  assert.ok(s('rad', 'Radar') > s('rad', 'Weather · Radar'), 'its start, before a word’s start');
  assert.ok(s('rad', 'Weather · Radar') > s('ada', 'Weather · Radar'), 'a word’s start, before inside one');
  assert.deepEqual(lit('rad', 'Weather · Radar'), ['Rad'], 'the letters that matched, as written');
  assert.deepEqual(lit('hold mark', 'Markets · Holdings'), ['Mark', 'Hold'], 'every word of the query, in any order');
  assert.ok(s('hold mark', 'Markets · Holdings') > 0.7);
  assert.deepEqual(lit('wr', 'Weather · Radar'), ['W', 'R'], 'an acronym: each word’s first letter');
  assert.ok(s('raadr', 'Weather · Radar') > 0, 'one slip forgiven (a letter too many)');
  assert.ok(s('qiuet', 'Quiet Hours') > 0, 'two letters swapped');
  assert.ok(s('notifcations', 'Notifications') > 0, 'a letter missing');
  assert.ok(s('pat', 'Patrick') > s('raadr', 'Weather · Radar'), 'a slip ranks below a true match');
  assert.ok(s('zur', 'Zürich') > 0.9, 'accents aside');
  assert.deepEqual(lit('zur', 'Zürich'), ['Zür'], 'and the hit in the words as written');
  assert.equal(match('mail', 'Weather'), null, 'nothing alike: no match');
  assert.equal(match('e', 'Weather'), null, 'one letter: only at a word’s start');
  assert.ok(match('w', 'Weather'), 'which it is here');
  assert.equal(match('qx', 'Quiet Hours'), null, 'two letters not in order: no match');
  assert.equal(match('', 'Weather'), null, 'an empty query matches nothing');
});

test('rank: a Top hit, groups by their best, an address once, a recent one higher, offers last, three a group', { skip: roofSkip }, async () => {
  const { rank } = await import(new URL('search.js', ROOF));
  const G = (id, order, entries) => ({ id, group: id[0].toUpperCase() + id.slice(1), order, entries });
  const r = rank([
    G('apps', 0, [{ title: 'Weather · Radar', href: '/weather/#radar' }, { title: 'Rain radar', href: '/weather/#radar' }]),
    G('people', 1, [{ title: 'Radha', avatar: 'Radha', href: '/chats/#open=r1' }]),
    G('markets', 2, [{ title: 'Find “rad” in Markets', run: () => {} }, { title: 'Radiant Energy', href: '/markets/#s=RAD' }, { title: 'Holding found by symbol', href: '/markets/#s=RDX' }]),
    G('mail', 3, [{ title: 'Search Mail for “rad”', run: () => {} }]),
  ], 'rad');
  assert.equal(r.top.e.title, 'Radha', 'the best of all, the Top hit (its start)');
  assert.deepEqual(r.groups.map((g) => g.id), ['markets', 'apps'], 'the groups by their best entry (Radiant before Weather · Radar), the Top hit’s own left empty');
  const apps = r.groups.find((g) => g.id === 'apps').entries.map((x) => x.e.title);
  assert.deepEqual(apps, ['Rain radar'], 'one address once, by its best title');
  assert.deepEqual(r.groups[0].entries.map((x) => x.e.title), ['Radiant Energy', 'Holding found by symbol'], 'what its provider found by something else, after what matches');
  assert.deepEqual(r.more.map((x) => x.e.title), ['Find “rad” in Markets', 'Search Mail for “rad”'], 'the offers to look further, last, in their providers’ order');
  assert.deepEqual(r.top.hits, [[0, 3]], 'with what matched');
  const one = rank([G('apps', 0, [{ title: 'Weather · Radar', href: '/weather/#radar' }])], 'rad');
  assert.equal(one.top, null, 'one result: no Top hit, just its group');
  const boosted = rank([G('places', 0, [{ title: 'Radstock', href: '/weather/?a' }, { title: 'Radley', href: '/weather/?b' }])], 'rad', { recent: [{ title: 'Radley', href: '/weather/?b' }] });
  assert.equal(boosted.top.e.title, 'Radley', 'one opened before, a little higher');
  const many = rank([G('places', 0, Array.from({ length: 7 }, (_, i) => ({ title: `Rad ${i}`, href: `/weather/?${i}` })))], 'rad');
  assert.equal(many.groups[0].all, 6, 'every one counted (the sheet shows three and “Show all”)');
});

test('Recent: what was opened, newest first, at most 8, the account’s own, Mail’s only for the admin, cleared', { skip: roofSkip }, async () => {
  const { data } = guard();
  const { recents, remember, forget } = await import(new URL('search.js', ROOF));
  const F = { session: { view: { user: { id: 'u1' }, apps: {} } } };
  assert.deepEqual(recents(F), [], 'nothing yet');
  remember(F, { title: 'London', sub: 'England', icon: 'weather', href: '/weather/?lat=1&lon=2&name=London' });
  remember(F, { title: 'Pat', sub: 'Chats', avatar: 'Pat', href: '/chats/#open=p1' });
  remember(F, { title: 'London', sub: 'England', icon: 'weather', href: '/weather/?lat=1&lon=2&name=London' });
  remember(F, { title: 'Find', run: () => {} });
  remember(F, { title: 'Away', href: 'https://evil.example/' });
  assert.deepEqual(recents(F).map((r) => r.title), ['London', 'Pat'], 'newest first, one address once; a result that only runs, or goes off the site, not kept');
  assert.deepEqual(Object.keys(recents(F)[1]).sort(), ['avatar', 'href', 'sub', 'title'], 'only what draws its row');
  for (let i = 0; i < 12; i++) remember(F, { title: `P${i}`, href: `/weather/?${i}` });
  assert.equal(recents(F).length, 8, 'at most 8');
  remember(F, { title: 'Quarterly figures', href: '/mail/#thread=t1' });
  assert.ok(!recents(F).some((r) => r.href.startsWith('/mail/')), 'Mail’s, for anyone but the admin: not shown');
  F.session.view.apps.mail = true;
  assert.equal(recents(F)[0].title, 'Quarterly figures', 'the admin’s: shown');
  assert.deepEqual(recents({ session: { view: { user: { id: 'u2' }, apps: {} } } }), [], 'another account’s list is no one’s');
  assert.equal(JSON.parse(data['ifl:recent']).u, 'u1', 'kept for its account');
  forget();
  assert.deepEqual(recents(F), [], 'Clear: gone');
  assert.equal(data['ifl:recent'], undefined);
});

test('the sheet: the empty field, typing, keys, Show all, opening a result into Recent, Mail the admin’s, nothing typed kept or sent', { skip: roofSkip }, async () => {
  const { kept } = guard();
  const doc = globalThis.document = fakeDocument();
  globalThis.IFL = { glyph: () => '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>', iconUrl: () => 'blob:x' };
  const ui = await import(new URL('ui.js', ROOF));
  const { createSearch } = await import(new URL('search.js', ROOF));
  let opened = null, closed = 0;
  const F = {
    ui, session: { view: { user: { id: 'u1' }, apps: {} }, apps: {} },
    sheet: { open(spec) { opened = spec; const body = doc.createElement('div'); body.append(spec.body); doc.body.append(body); return { el: body, body, close() { closed++; spec.onClose?.(); } }; } },
  };
  const S = createSearch(F);
  const asked = [];
  const off = S.provide({ id: 'places', group: 'Places', order: 20, search: (q) => { asked.push(['places', q]); return [{ title: 'London', sub: 'England', icon: 'weather', href: '/weather/?lat=1&lon=2&name=London' }, { title: 'Londonderry', sub: 'Northern Ireland', icon: 'weather', href: '/weather/?lat=3&lon=4&name=Londonderry' }].filter((x) => x.title.toLowerCase().includes(q.toLowerCase())); } });
  S.provide({ id: 'boom', group: 'Boom', order: 1, search: () => { throw new Error('no'); } });
  let ran = 0;
  S.provide({ id: 'people', group: 'People', order: 15, search: (q) => (/^pat/i.test(q) ? [{ title: 'Pat', sub: 'Chats', avatar: 'Pat', href: '/chats/#open=p1' }, { title: 'Patterson', sub: 'Chats', avatar: 'Patterson', run: () => { ran++; } }] : []) });
  S.provide({ id: 'mail', group: 'Mail', order: 30, search: (q) => { asked.push(['mail', q]); return [{ title: `Search Mail for “${q}”`, run: () => {} }]; } });
  S.provide({ id: 'many', group: 'Many', order: 40, search: (q) => (q === 'stop' ? Array.from({ length: 6 }, (_, i) => ({ title: `Stop ${i}`, href: `/#you=s${i}` })) : []) });

  // ---- the empty field
  S.open();
  assert.equal(opened.sheet, 'search', 'the sheet is data-sheet=search');
  assert.equal(opened.title, 'Search everything');
  const input = doc.querySelector('input[type=search]');
  assert.equal(doc.activeElement, input, 'focused at once, inside the tap (no wait)');
  assert.equal(opened.focus, input, 'and the sheet is told to focus it as it opens');
  assert.equal(input.getAttribute('role'), 'combobox');
  const listbox = doc.querySelector(`#${input.getAttribute('aria-controls')}`);
  assert.equal(listbox.getAttribute('role'), 'listbox', 'aria-controls names the listbox');
  const groups = () => listbox.querySelectorAll('[role=group]').map((g) => g.getAttribute('aria-label'));
  const titles = () => listbox.querySelectorAll('[role=option]').map((o) => o.querySelector('b')?.textContent ?? o.getAttribute('aria-label') ?? o.textContent);
  assert.deepEqual(groups(), ['Apps', 'Shortcuts'], 'the empty field: your apps and a few shortcuts (Recent once there’s something in it)');
  assert.deepEqual(listbox.querySelectorAll('.ifl-sr-app').map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')]), [['Weather', '/weather/'], ['Chats', '/chats/'], ['Fitness', '/fitness/'], ['Markets', '/markets/']], 'your apps as icons, each to its own page; Mail, the admin’s alone, not for anyone else');
  assert.deepEqual(listbox.querySelectorAll('.ifl-sr-cuts [role=option]').map((c) => [c.textContent, c.getAttribute('href')]), [['Rain radar', '/weather/#radar'], ['Add a friend', '/chats/#add'], ['Activities', '/fitness/#activities'], ['Holdings', '/markets/#holdings'], ['Quiet Hours', '/#you=quiet']], 'the shortcuts');
  assert.ok(!titles().some((t) => / · /.test(t)), 'no section rows until you type');
  assert.deepEqual(asked, [], 'no provider asked for an empty field');
  assert.equal(input.getAttribute('aria-activedescendant'), null, 'nothing highlighted yet');
  input.dispatch('keydown', { key: 'ArrowDown', preventDefault() {} });
  assert.equal(input.getAttribute('aria-activedescendant'), listbox.querySelector('.ifl-sr-app').id, '↓: the first app highlighted');
  assert.equal(listbox.querySelector('.ifl-sr-app').getAttribute('aria-selected'), 'true');

  // ---- typing
  const type = async (v) => { input.value = v; input.dispatch('input'); await sleep(450); };
  await type('lon');
  assert.deepEqual(groups(), ['Top hit', 'Places'], 'typed: the best first (Top hit), then its group; the throwing provider left out');
  assert.deepEqual(titles(), ['London', 'Londonderry']);
  const top = listbox.querySelector('[role=option]');
  assert.equal(top.getAttribute('href'), '/weather/?lat=1&lon=2&name=London', 'a result is a link to its place');
  assert.deepEqual(top.querySelectorAll('mark').map((m) => m.textContent), ['Lon'], 'the letters that matched, in bold');
  assert.equal(input.getAttribute('aria-activedescendant'), top.id, 'the Top hit highlighted, ready for Enter');
  assert.deepEqual(asked.filter(([p]) => p === 'mail'), [], 'Mail’s provider not asked for an account not the admin’s');
  await type('16 days');
  assert.deepEqual(titles(), ['Weather · 16 Days'], 'an app’s section by its name');
  await type('16-day');
  assert.ok(titles().includes('16-day forecast') && !titles().includes('Weather · 16 Days'), 'one address once, by its better title');
  await type('raadr');
  assert.equal(listbox.querySelector('[role=option]')?.getAttribute('href'), '/weather/#radar', 'a slip forgiven: the radar');
  await type('stop');
  const many = listbox.querySelectorAll('[role=group]').find((g) => g.getAttribute('aria-label') === 'Many');
  assert.equal(many.querySelectorAll('[role=option]').length, 3, 'three a group (the best of them the Top hit)');
  const all = many.querySelector('.ifl-sr-more');
  assert.equal(all?.textContent, 'Show all');
  all.click(); await sleep(10);
  assert.equal(listbox.querySelectorAll('[role=group]').find((g) => g.getAttribute('aria-label') === 'Many').querySelectorAll('[role=option]').length, 5, 'Show all: the rest of the group');
  await type('pat');
  assert.deepEqual(titles(), ['Pat', 'Patterson'], 'People: Pat the Top hit, Patterson in the group');

  // ---- keys
  const opts = () => listbox.querySelectorAll('[role=option]');
  input.dispatch('keydown', { key: 'ArrowDown', preventDefault() {} });
  assert.equal(input.getAttribute('aria-activedescendant'), opts()[1].id, '↓ moves the highlight');
  input.dispatch('keydown', { key: 'ArrowDown', preventDefault() {} });
  assert.equal(input.getAttribute('aria-activedescendant'), opts()[0].id, 'and round to the first');
  input.dispatch('keydown', { key: 'ArrowUp', preventDefault() {} });
  assert.equal(input.getAttribute('aria-activedescendant'), opts()[1].id, '↑ back');
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(ran, 1, 'Enter opens the highlighted one (a result that runs)');
  assert.equal(closed, 1, 'the sheet closed first');
  assert.ok(!kept.some((v) => v && v.includes('Patterson')), 'a result that only runs isn’t kept');

  // ---- opening a result into Recent; Esc
  S.open();
  const i2 = doc.querySelectorAll('input[type=search]').at(-1), lb2 = doc.querySelector(`#${i2.getAttribute('aria-controls')}`);
  i2.value = 'pat'; i2.dispatch('input'); await sleep(450);
  assert.equal(kept.length, 0, 'typing keeps nothing');
  let went = 0;
  lb2.querySelector('[role=option]').addEventListener('click', () => { went++; });
  i2.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(went, 1, 'Enter opens the Top hit: its link clicked (the frame’s link handler takes it there)');
  assert.deepEqual(JSON.parse(kept.at(-1)).list.map((r) => r.title), ['Pat'], 'and it’s kept in Recent');
  assert.ok(kept.every((v) => !v || !/“pat”|"pat"/.test(v)), 'never what was typed');
  closed = 0;
  i2.dispatch('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(closed, 1, 'Esc closes');
  S.open();
  const lb3 = doc.querySelectorAll('.ifl-results').at(-1);
  assert.deepEqual(lb3.querySelectorAll('[role=group]').map((g) => g.getAttribute('aria-label')), ['Apps', 'Recent', 'Shortcuts'], 'opened again: Recent between your apps and the shortcuts');
  assert.deepEqual(lb3.querySelectorAll('[data-group=recent] [role=option]').map((o) => [o.querySelector('b').textContent, o.getAttribute('href')]), [['Pat', '/chats/#open=p1']]);
  lb3.querySelector('[data-group=recent] .ifl-sr-more').click();
  assert.deepEqual(lb3.querySelectorAll('[role=group]').map((g) => g.getAttribute('aria-label')), ['Apps', 'Shortcuts'], 'Clear: Recent gone');
  S.close();

  // ---- Mail, the admin's; nothing found; a provider let go of; what's typed said back as text
  F.session.view.apps.mail = true;
  S.open();
  const i4 = doc.querySelectorAll('input[type=search]').at(-1), lb4 = () => doc.querySelectorAll('.ifl-results').at(-1);
  assert.ok(lb4().querySelectorAll('.ifl-sr-app').some((a) => a.getAttribute('aria-label') === 'Mail'), 'the admin’s: Mail among the apps');
  i4.value = 'mail'; i4.dispatch('input'); await sleep(450);
  assert.ok(lb4().querySelectorAll('[role=option]').some((o) => o.querySelector('b').textContent === 'Mail'), 'and found by name');
  assert.deepEqual(asked.filter(([p]) => p === 'mail'), [['mail', 'mail']], 'Mail’s provider asked, for the admin only');
  assert.equal(lb4().querySelectorAll('[role=group]').at(-1).getAttribute('aria-label'), 'More', 'its offer to look further, last');
  delete F.session.view.apps.mail;
  i4.value = 'zzqx'; i4.dispatch('input'); await sleep(450);
  assert.equal(doc.querySelectorAll('.ifl-none').at(-1).textContent, 'Nothing for “zzqx”', '“Nothing for …”, as text');
  assert.ok(!lb4().hasAttribute('role'), 'no results: no empty listbox');
  off();
  i4.value = 'lon'; i4.dispatch('input'); await sleep(450);
  assert.ok(!lb4().querySelectorAll('[role=option]').some((o) => /London/.test(o.textContent)), 'a provider let go of is asked no more');
  i4.value = '<img src=x onerror=alert(1)>'; i4.dispatch('input'); await sleep(450);
  assert.ok(!doc.querySelectorAll('.ifl-none').at(-1).children.length && /^Nothing for “<img/.test(doc.querySelectorAll('.ifl-none').at(-1).textContent), 'what was typed is said back as text only');
});
