// Fitness's sheets under the roof (One roof stage 2, spec §9.1 FXB, S2-D7, S2-D13, §2.6): Fitness Settings' pages save
// only their keys (each control one patch, { prefs: {…} } or { profile: {…} }, laid over the whole record by FXA's real
// core.saveSettings, so a key this build doesn't know survives); a number set here is what fitness/app.js setNumber
// makes of it (taken out of app.js's text by name); Strava's Connect is a real link, <a target=_blank rel=noopener>, with
// the address POST strava/connect answered, never a navigation of the page (RI6); and the openTo rules of §2.6 that are
// FXB's: #act=<id> (here: the act sheet; not yet, with older rides to come: looked for again once they're in; else said
// not to be here) and #day= further off (a day's sheet).
// The sheets are driven on FW's stand-in DOM (roofkit/fakedom.mjs) with FW's real ui.js and sheet.js and FXA's real
// core, adapter and x.js; with FXA's files not on this branch yet (B0's stubs, or none), those cases skip and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MAIN, ROOF, roofSkip } from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';

const FX = new URL('fitness/', MAIN), RX = new URL('fitness/roof/', MAIN);
const textOf = (f) => (existsSync(new URL(f, RX)) ? readFileSync(new URL(f, RX), 'utf8') : '');
const isStub = (f) => /^export const STUB = true;/m.test(textOf(f));
const fxaSkip = !textOf('core.js') ? 'FXA’s core (fitness/roof/core.js) isn’t on this branch yet'
  : ['core.js', 'fxui.js', 'fxcalc.js', 'todayview.js'].some(isStub) ? 'still B0’s stub: FXA’s core, adapter and Today aren’t merged here yet' : false;
const fxbSkip = ['actsview.js', 'planview.js', 'progview.js', 'fxsettings.js'].find(isStub);
const skip = fxaSkip || (fxbSkip ? `still B0’s stub: ${fxbSkip}` : false);

// ---- the browser bits the files touch: storage, a document, frames, and a network that answers only what a case says ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.document = docWithTemplates();
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const answers = new Map(), asked = [];
globalThis.fetch = async (url, o = {}) => {
  const path = String(url).replace(/^.*\/api\/fitness\//, '');
  asked.push(`${o.method || 'GET'} ${path}`);
  const a = answers.get(path);
  if (!a) throw Object.assign(new Error('offline (test)'), { offline: true });
  const body = await a();
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
};
// (no location write, ever: a write would land here and fail the case)
const navigated = [];
globalThis.location ??= { origin: 'https://inflite.ai', pathname: '/fitness/', search: '', hash: '', set href(v) { navigated.push(v); }, get href() { return 'https://inflite.ai/fitness/'; }, assign: (v) => navigated.push(v), replace: (v) => navigated.push(v) };
const flush = () => new Promise((r) => setTimeout(r, 0));
// (fitness/ui.js draws its icons through a <template>: the stand-in DOM's is given a content, the markup kept raw)
function docWithTemplates() {
  const doc = fakeDocument(), make = doc.createElement;
  doc.createElement = (t) => {
    if (t !== 'template') return make(t);
    const tpl = make('template'), svg = make('svg');
    Object.defineProperty(tpl, 'innerHTML', { set(h) { svg.innerHTML = h; } });
    tpl.content = { get firstChild() { return svg; } };
    return tpl;
  };
  return doc;
}

let core, fxui, SET, ACTS, PLAN, ui, createSheets;
if (!skip) {
  core = await import(new URL('core.js', RX).href);
  fxui = await import(new URL('fxui.js', RX).href);
  SET = await import(new URL('fxsettings.js', RX).href);
  ACTS = await import(new URL('actsview.js', RX).href);
  PLAN = await import(new URL('planview.js', RX).href);
}
if (!skip && !roofSkip) {
  ui = await import(new URL('ui.js', ROOF).href);
  ({ createSheets } = await import(new URL('sheet.js', ROOF).href));
}

// ---- fitness/app.js's functions taken out of its text by name (brackets matched, strings and comments stepped over) ----
const APP = readFileSync(new URL('app.js', FX), 'utf8');
function sourceOf(name) {
  const m = new RegExp(String.raw`^(?:async\s+)?function\s+${name}\s*\(|^const\s+${name}\s*=`, 'm').exec(APP);
  assert.ok(m, `fitness/app.js has ${name}`);
  let i = m.index, depth = 0, seenBody = false;
  const isFn = /function/.test(m[0]);
  for (; i < APP.length; i++) {
    const c = APP[i], n2 = APP.slice(i, i + 2);
    if (n2 === '//') { i = APP.indexOf('\n', i); continue; }
    if (n2 === '/*') { i = APP.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { for (i++; i < APP.length && APP[i] !== c; i++) { if (APP[i] === '\\') i++; } continue; }
    if ('([{'.includes(c)) { depth++; if (c === '{') seenBody = true; continue; }
    if (')]}'.includes(c)) { depth--; if (isFn && depth === 0 && c === '}' && seenBody) return APP.slice(m.index, i + 1); continue; }
    if (!isFn && depth === 0 && c === ';') return APP.slice(m.index, i + 1);
  }
  throw new Error(`no end to ${name}`);
}
// app.js's setNumber over a profile → the profile it leaves (its keep() stood in)
function appSetNumber(profile, k, v, TODAY) {
  const S = { profile: JSON.parse(JSON.stringify(profile)) };
  const run = new Function('S', 'TODAY', 'keep', `const P = () => S.profile; const isSet = (k) => (P().set || []).includes(k);\n${sourceOf('logFtp')}\n${sourceOf('setNumber')}\nreturn setNumber;`);
  run(S, TODAY, () => {})(k, v);
  return S.profile;
}

// a record as the account keeps it: numbers partly set by you, an FTP log, prefs, and keys this build doesn't know
const RECORD = {
  profile: { ftp: 240, weight: 72, lthr: 158, maxHr: 186, restHr: 52, runPace: 300, css: 110, set: ['ftp', 'weight'], ftpLog: [[Date.UTC(2026, 9, 1), 232, 1]], zz: 'kept' },
  plan: null, rhythm: null, swaps: {}, feel: {}, workouts: [],
  prefs: { units: 'metric', maps: 'tap', examples: false, zzz: { kept: 1 } }, extra: { kept: true },
};

test('Fitness Settings’ patches: each carries only its keys, and a value Fitness doesn’t know is never saved', { skip }, () => {
  assert.deepEqual(SET.PATCH.units('imperial'), { prefs: { units: 'imperial' } });
  assert.deepEqual(SET.PATCH.maps('always'), { prefs: { maps: 'always' } });
  assert.deepEqual(SET.PATCH.ask(false), { prefs: { ask: false } });
  assert.deepEqual(SET.PATCH.nights('apple'), { prefs: { nights: 'apple' } });
  for (const bad of [SET.PATCH.units('furlongs'), SET.PATCH.maps('never'), SET.PATCH.nights('fitbit'), SET.PATCH.number(RECORD.profile, 'height', 180)]) assert.equal(bad, null);
  for (const k of Object.keys(SET.LIMITS)) {
    const p = SET.PATCH.number(RECORD.profile, k, RECORD.profile[k] + SET.LIMITS[k][0]);
    assert.deepEqual(Object.keys(p), ['profile'], `${k}: profile only`);
    const want = ['set', k, ...(k === 'ftp' ? ['ftpLog'] : []), ...(k === 'maxHr' ? ['lthr'] : [])].sort();
    assert.deepEqual(Object.keys(p.profile).sort(), want, `${k}: only ${want.join(', ')}`);
  }
  // (held to Fitness's own limits: the steppers' ranges of fitness/app.js numbersView)
  assert.equal(SET.PATCH.number(RECORD.profile, 'ftp', 9999).profile.ftp, 500);
  assert.equal(SET.PATCH.number(RECORD.profile, 'weight', 1).profile.weight, 35);
  assert.deepEqual(SET.PAGES, ['numbers', 'units', 'nights', 'devices']);
});

test('a number set in Fitness Settings is what fitness/app.js setNumber makes of it (set by you, FTP logged, threshold following max)', { skip }, () => {
  const TODAY = Date.UTC(2026, 10, 3);
  for (const [k, v] of [['ftp', 255], ['weight', 71.5], ['lthr', 162], ['maxHr', 190], ['runPace', 290], ['css', 105]]) {
    const theirs = appSetNumber(RECORD.profile, k, v, TODAY);
    const mine = { ...RECORD.profile, ...SET.numberPatch(RECORD.profile, k, v, TODAY) };
    assert.deepEqual(mine, theirs, `${k} = ${v}`);
  }
  // (threshold set by you: max no longer moves it)
  const p = { ...RECORD.profile, set: [...RECORD.profile.set, 'lthr'] };
  assert.deepEqual({ ...p, ...SET.numberPatch(p, 'maxHr', 200, TODAY) }, appSetNumber(p, 'maxHr', 200, TODAY));
});

test('saved through FXA’s core.saveSettings: only the patched keys change; prefs and keys this build doesn’t know survive', { skip }, async () => {
  core.S.me = null;
  core.adopt(JSON.parse(JSON.stringify(RECORD)));
  const before = core.saved();
  const heard = [], off = core.on('settings', (d) => heard.push(d));
  for (const [patch, path, value] of [
    [SET.PATCH.units('imperial'), ['prefs', 'units'], 'imperial'],
    [SET.PATCH.maps('always'), ['prefs', 'maps'], 'always'],
    [SET.PATCH.ask(false), ['prefs', 'ask'], false],
    [SET.PATCH.nights('garmin'), ['prefs', 'nights'], 'garmin'],
    [SET.PATCH.number(core.P(), 'ftp', 250), ['profile', 'ftp'], 250],
  ]) {
    const was = core.saved();
    await core.saveSettings(patch);
    const now = core.saved();
    assert.deepEqual(now[path[0]][path[1]], value, `${path.join('.')} saved`);
    for (const k of Object.keys(was)) if (k !== path[0]) assert.deepEqual(now[k], was[k], `${k} untouched by ${path.join('.')}`);
  }
  off();
  const after = core.saved();
  assert.deepEqual(after.extra, { kept: true }, 'a top-level key this build doesn’t know survives');
  assert.deepEqual(after.prefs.zzz, { kept: 1 }, 'a pref this build doesn’t know survives');
  assert.equal(after.profile.zz, 'kept', 'a number this build doesn’t know survives');
  assert.equal(after.profile.weight, before.profile.weight);
  assert.ok(after.profile.set.includes('ftp') && after.profile.ftpLog.length === 2, 'FTP set by you and logged');
  assert.equal(heard.length, 5, 'core says each save');
});

// ---- the sheet, driven: openSettings on FW's stand-in DOM, FW's real ui.js and sheet.js, FXA's real core ----
function fwFor(log) {
  const offs = new Map();
  return {
    ui, sheet: createSheets({}), app: 'fitness',
    nav: { go: (u) => log.navs.push(u), section: (s) => log.sections.push(s) },
    toast: (m) => { log.toasts.push(m); return { close() {} }; },
    session: { user: { id: 'u-fx-1', name: 'Pat' }, lost: async () => { log.lost++; return false; } },
    on: (e, f) => { offs.set(f, e); (log.on[e] ||= []).push(f); return () => { log.on[e] = (log.on[e] || []).filter((x) => x !== f); }; },
    visible: () => true, lazy: (fn) => fn(''), theme: () => 'light',
  };
}

test('Fitness Settings, driven: its pages open at [data-page], each control saves one patch with only its keys, Notifications goes to You', { skip: skip || roofSkip }, async () => {
  globalThis.document = docWithTemplates();
  core.S.me = null;
  core.adopt(JSON.parse(JSON.stringify(RECORD)));
  const log = { navs: [], sections: [], toasts: [], lost: 0, on: {} }, patches = [];
  const C = { ...core, saveSettings: (p) => { patches.push(JSON.parse(JSON.stringify(p))); return core.saveSettings(p); } };
  const ctx = { S: core.S, core: C, fw: fwFor(log), open: {} };
  const h = SET.openSettings(ctx, null), d = h.el;
  assert.equal(d.getAttribute('data-sheet'), 'fxsettings');
  assert.equal(d.getAttribute('data-app'), 'fitness');
  assert.deepEqual(d.querySelectorAll('[data-go]').map((r) => r.getAttribute('data-go')), [...SET.PAGES]);
  const page = (p) => { d.querySelector(`[data-go=${p}]`).click(); const pg = d.querySelector(`[data-page=${p}]`); assert.ok(pg, `${p} pushed`); return pg; };
  async function one(run, want) {
    const n = patches.length;
    run();
    await flush();
    assert.equal(patches.length, n + 1, 'one save');
    assert.deepEqual(patches.at(-1), want);
    return core.saved();
  }
  // Units and Maps
  const units = page('units');
  const radio = (key, v) => units.querySelector(`[data-key=${key}] button[data-value=${v}]`);
  let s = await one(() => radio('units', 'imperial').click(), { prefs: { units: 'imperial' } });
  assert.equal(s.prefs.units, 'imperial'); assert.deepEqual(s.prefs.zzz, { kept: 1 }); assert.deepEqual(s.extra, { kept: true });
  s = await one(() => radio('maps', 'always').click(), { prefs: { maps: 'always' } });
  assert.equal(s.prefs.maps, 'always'); assert.equal(s.prefs.units, 'imperial');
  h.pop();
  // Nights and Check-in
  const nights = page('nights');
  const ask = nights.querySelector('[data-key=ask] input');
  s = await one(() => { ask.checked = false; ask.dispatch('change'); }, { prefs: { ask: false } });
  assert.equal(s.prefs.ask, false);
  s = await one(() => nights.querySelector('[data-key=nights] button[data-value=apple]').click(), { prefs: { nights: 'apple' } });
  assert.equal(s.prefs.nights, 'apple');
  h.pop();
  // Your Numbers: a step up in FTP, only the profile's keys
  const nums = page('numbers');
  const ftp0 = core.P().ftp;
  const more = nums.querySelector('[data-key=ftp] [data-act=more]');
  const n = patches.length;
  more.click(); await flush();
  assert.equal(patches.length, n + 1);
  assert.deepEqual(Object.keys(patches.at(-1)), ['profile']);
  assert.deepEqual(Object.keys(patches.at(-1).profile).sort(), ['ftp', 'ftpLog', 'set']);
  assert.equal(core.P().ftp, ftp0 + 5);
  assert.equal(nums.querySelector('[data-key=ftp] output').textContent, `${ftp0 + 5} W`, 'drawn again from what’s kept');
  h.pop();
  // Notifications: You's, by the framework's nav, no navigation of the page
  const notify = d.querySelectorAll('a').find((a) => a.getAttribute('href') === '/#you=notify');
  assert.ok(notify);
  notify.dispatch('click', { button: 0 });
  assert.deepEqual(log.navs, ['/#you=notify']);
  assert.deepEqual(navigated, []);
  assert.equal(log.lost, 0);
});

test('Strava (S2-D13, RI6): Devices asks POST strava/connect as it opens; the link waits, disabled, then is <a target=_blank rel=noopener> to the address; never a navigation', { skip: skip || roofSkip }, async () => {
  globalThis.document = docWithTemplates();
  core.S.me = null;
  core.adopt(JSON.parse(JSON.stringify(RECORD)));
  core.S.strava = { on: false, ready: true }; core.S.garmin = { on: false }; core.S.health = { on: false };
  const URL_ = 'https://www.strava.com/oauth/authorize?client_id=1&state=abc';
  let release;
  answers.set('strava/connect', () => new Promise((r) => { release = () => r({ url: URL_ }); }));
  asked.length = 0;
  const log = { navs: [], sections: [], toasts: [], lost: 0, on: {} };
  const ctx = { S: core.S, core: { ...core }, fw: fwFor(log), open: {} };
  const h = SET.openSettings(ctx, 'devices'), d = h.el;
  const pg = d.querySelector('[data-page=devices]');
  assert.ok(pg, 'Devices opened straight at its page');
  await flush();
  assert.ok(asked.includes('POST strava/connect'), 'asked as the page opens');
  let a = d.querySelector('a[data-k=strava]');
  assert.ok(a, 'the Connect link');
  assert.equal(a.getAttribute('href'), null, 'no address till Strava answers');
  assert.equal(a.getAttribute('aria-disabled'), 'true');
  assert.match(a.textContent, /Getting Strava ready/);
  release(); await flush(); await flush();
  a = d.querySelector('a[data-k=strava]');
  assert.equal(a.tagName, 'A');
  assert.equal(a.getAttribute('href'), URL_, 'the address Strava gave');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener');
  assert.equal(a.getAttribute('aria-disabled'), null);
  assert.match(a.textContent, /Connect Strava/);
  // a tap is the link's own (a window of its own): the module doesn't navigate the page, and asks the account again on
  // the next visible
  const e = a.dispatch('click');
  assert.equal(e.defaultPrevented, false, 'the link is followed, not stopped');
  assert.deepEqual(navigated, []);
  assert.ok((log.on.visible || []).length >= 1, 'listening for the way back');
  // Strava's own page (not connected) draws the same link
  d.querySelector('[data-page=devices] [data-go=strava]').click();
  const sp = d.querySelector('[data-page=strava]');
  assert.ok(sp.querySelector('a[data-k=strava]')?.getAttribute('href') === URL_);
  answers.delete('strava/connect');
  h.close();
});

test('#act=<id> (§2.6, fitness/app.js openTo): here → the act sheet; not yet, older still to come → looked for again once they’re in; else “That activity isn’t here.”', { skip: skip || roofSkip }, async () => {
  globalThis.document = docWithTemplates();
  const root = document.createElement('div');
  document.body.append(root);
  const log = { navs: [], sections: [], toasts: [], lost: 0, on: {} }, opened = [];
  const fw = fwFor(log), sheetOpen = fw.sheet.open;
  fw.sheet.open = (spec) => { opened.push(spec.sheet); return sheetOpen(spec); };
  fw.screenEl = root;
  fxui.attach(root, fw);
  core.start(fw);
  core.S.me = { id: 'u-fx-1', more: false };
  core.S.own = [{ id: 'i1000', start: Date.UTC(2026, 10, 1, 8), sport: 'ride', name: 'Morning Ride', sum: { moving: 3600, dist: 30000 } }];
  core.setActs();
  let olderAsked = 0;
  const C = { ...core, older: async () => { olderAsked++; core.S.own.push({ id: 's42', start: Date.UTC(2025, 2, 1, 8), sport: 'ride', name: 'Old Ride', sum: { moving: 3000 } }); core.setActs(); } };
  const ctx = { S: core.S, core: C, fw, open: { act: (id) => ACTS.openAct(ctx, id) } };
  // here: the act sheet (its file read first: offline here, so said and closed)
  await ACTS.openAct(ctx, 'i1000');
  assert.equal(opened.at(-1), 'act');
  assert.ok(!log.toasts.includes('That activity isn’t here.'));
  // not yet here, older still to come: asked for, then opened
  core.S.me.more = true;
  await ACTS.openAct(ctx, 's42');
  assert.equal(olderAsked, 1, 'older rides brought in first');
  assert.equal(opened.filter((x) => x === 'act').length, 2, 'then its sheet');
  // not here at all, and nothing more to come
  core.S.me.more = false;
  await ACTS.openAct(ctx, 'g999');
  assert.equal(olderAsked, 1);
  assert.equal(log.toasts.at(-1), 'That activity isn’t here.');
  // #day= further off than Today's two weeks: the day's own sheet (a rest day, nothing recorded)
  const far = core.startOfDay(Date.UTC(2026, 0, 14, 12));
  PLAN.openDay(ctx, far);
  assert.equal(opened.at(-1), 'fx-day');
  assert.match(fxui.sheetEl.el.textContent, /A rest day/);
  fxui.detach();
  core.stop();
  assert.equal(log.lost, 0);
});

test('every opener the entry binds is exported, with view() for the two lazy sections, as j0’s surface froze them', { skip }, async () => {
  const PROG = await import(new URL('progview.js', RX).href);
  for (const n of ['view', 'openAct', 'openActMap', 'openActShare', 'openRename', 'openForm', 'openUpload']) assert.equal(typeof ACTS[n], 'function', `actsview ${n}`);
  for (const n of ['view', 'openForm', 'openPower', 'openTraining', 'openEngine', 'openYear']) assert.equal(typeof PROG[n], 'function', `progview ${n}`);
  for (const n of ['openSession', 'openWorkout', 'openDay', 'openMove', 'openWorkouts', 'openRhythmSetup', 'openSendDevice']) assert.equal(typeof PLAN[n], 'function', `planview ${n}`);
  assert.equal(typeof SET.openSettings, 'function');
  for (const m of [ACTS, PROG, PLAN, SET]) assert.ok(!('STUB' in m), 'not B0’s stub');
  // (and the entry asks for exactly these: FXA's fitness.js via(file, name))
  const entry = textOf('fitness.js');
  for (const [, file, name] of entry.matchAll(/via\("(\w+)", "(\w+)"\)/g)) {
    const mod = { acts: ACTS, prog: PROG, plan: PLAN, set: SET }[file];
    assert.equal(typeof mod?.[name], 'function', `fitness.js asks ${file}.${name}`);
  }
});
