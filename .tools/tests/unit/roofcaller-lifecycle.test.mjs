// Delayed imports/service startup must not rebuild disposed modules or reopen a sheet after leaving and returning.
// Run the entry modules with their real lifecycle code and inert views, while controlling each async boundary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../../pigeon/roof/store.js';

const MAIN = new URL('../../../', import.meta.url);
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const noop = () => {};
const view = () => ({ draw: noop, resume: noop, hide: () => false, destroy: noop, show: noop, unmount: noop, busy: () => false, flush: async () => ({ lost: 0 }) });

class Element extends EventTarget {
  constructor(doc, tag = 'div') {
    super(); this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = { setProperty: noop };
    this.classList = { add: noop, remove: noop, toggle: noop }; this.hidden = false; this.isConnected = true;
  }
  append(...kids) { for (const k of kids) { this.children.push(k); if (k && typeof k === 'object') k.parentElement = this; } }
  replaceChildren(...kids) { for (const k of this.children) if (k && typeof k === 'object') k.isConnected = false; this.children = []; this.append(...kids); }
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((x) => x !== this); }
  setAttribute(k, v) { this[k] = String(v); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get childElementCount() { return this.children.length; }
}
function env(lazy = new Map()) {
  const doc = new EventTarget(); doc.createElement = (tag) => new Element(doc, tag); doc.querySelector = () => null; doc.head = doc.createElement('head');
  const root = doc.createElement('div'), headers = [], toasts = [], controller = new AbortController();
  const el = (tag, attrs = {}, ...kids) => { const e = doc.createElement(tag); Object.assign(e, attrs); e.append(...kids); return e; };
  const fw = {
    signal: controller.signal, session: { user: { id: 'u' } }, screenEl: root, stale: () => false, visible: () => true,
    ui: { el, skeleton: () => el('div'), error: () => el('div'), empty: () => el('div'), btn: () => el('button'), icon: () => el('svg') },
    header: { set: (h) => headers.push(h) }, tabs: { badge: noop }, toast: (s) => toasts.push(s), on: () => noop,
    search: { provide: () => noop }, nav: { section: noop, go: noop },
    lazy(fn) { const file = /import\("[^\"]*\/([^/\"]+)"/.exec(String(fn))?.[1]; return lazy.get(file)?.promise || Promise.resolve({ view, renderRoutePlan: noop, forgetRoutePlans: noop }); },
  };
  return { doc, root, fw, headers, toasts, controller };
}
function load(file, deps, exports = 'mount') {
  const src = readFileSync(new URL(file, MAIN), 'utf8').replace(/^import .*?;\s*$/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(deps), `${src}\nreturn { ${exports} };`)(...Object.values(deps));
}
function fitness(e, extra = {}) {
  const core = { S: { me: { id: 'u' }, acts: [], mine: [], times: [], dirty: new Set() }, U: {}, TODAY: Date.now(), EVENTS: [], start: noop, stop: noop, shown: noop, actsOn: () => [], plannedOn: () => null, rhythmOn: () => false };
  Object.assign(core, extra);
  const deps = { core, connector: { search: () => [] }, attach: noop, detach: noop, setPicker: noop, closeSheet: noop, sheetEl: {}, todayView: view, lookAt: noop, sendableToday: noop, openOffer: noop, dayStamp: () => '', rhythmSaid: () => '', dur: String, dist: String, measure: noop, startOfDay: (d) => d, addDays: (d) => d, mondayOf: (d) => d, WORKOUTS: [] };
  return load('fitness/roof/fitness.js', deps).mount(e.root, e.fw);
}
function markets(e) {
  const core = { S: { me: { id: 'u' }, list: [], q: {} }, totals: () => ({ o: [] }), lineSaid: () => ({ text: '' }), newsNew: () => [], newsSeen: () => 0, on: () => noop, start: noop, stop: noop, at: noop, shown: noop, leftNews: noop };
  const deps = { core, connector: { search: () => [] }, want: {}, h: noop, M: {}, init: noop, release: noop, openSheet: noop, pushSheet: noop, closeSheet: noop, paint: noop, icon: noop, Sheet: { stack: [] }, topView: noop, topArg: noop, todayView: view, cashContext: noop, cashEditor: noop };
  return load('markets/roof/markets.js', deps).mount(e.root, e.fw);
}
function chats(e, service) {
  e.fw.service = () => service.promise;
  const deps = { createStore, listView: view, friendsView: view, chatView: view, lockView: view, lockWatch: () => noop, readShareHash: () => ({ words: '', card: null }), openNewChat: noop, openNewGroup: noop, openRequests: noop, openAddFriend: noop };
  return load('pigeon/roof/chats.js', deps).mount(e.root, e.fw);
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'iPhone', maxTouchPoints: 5, onLine: true, connection: { saveData: true } } });
globalThis.addEventListener = noop; globalThis.removeEventListener = noop;

for (const [name, factory, section, file] of [['Fitness', fitness, 'activities', 'actsview.js'], ['Markets', markets, 'holdings', 'holdings.js']]) {
  test(`${name}: a delayed view is never constructed after unmount or signal abort`, async () => {
    for (const abort of [false, true]) {
      const job = deferred(), e = env(new Map([[file, job]])); let made = 0;
      const app = await factory(e); await app.show({ section });
      if (abort) e.controller.abort(); else app.unmount();
      job.resolve({ view: () => { made++; return view(); } }); await tick();
      assert.equal(made, 0);
      if (abort) app.unmount();
    }
  });
  test(`${name}: a disposed import failure stays silent`, async () => {
    const job = deferred(), e = env(new Map([[file, job]]));
    const app = await factory(e); await app.show({ section }); app.unmount();
    const count = e.root.children.length;
    job.reject(new Error('late network failure')); await tick();
    assert.equal(e.root.children.length, count); assert.deepEqual(e.toasts, []);
  });
}

test('Fitness: dropping a section invalidates its pending constructor, and a current load still works', async () => {
  const first = deferred(), lazy = new Map([['actsview.js', first]]), e = env(lazy); let made = 0;
  const app = await fitness(e); await app.show({ section: 'activities' }); await app.show({ section: 'progress' }); app.hide();
  const realNow = Date.now; Date.now = () => realNow() + 6 * 60e3;
  try { await app.show({ section: 'today' }); } finally { Date.now = realNow; }
  first.resolve({ view: () => { made++; return view(); } }); await tick(); assert.equal(made, 0);
  const second = deferred(); lazy.set('actsview.js', second); await app.show({ section: 'activities' });
  second.resolve({ view: () => { made++; return view(); } }); await tick(); assert.equal(made, 1); app.unmount();
});

const pickRide = (e) => {
  const picker = e.root.children.find((x) => x.dataset?.k === 'files');
  picker.files = [{ name: 'ride.fit' }]; picker.dispatchEvent(new Event('change'));
};
test('Fitness: parsed imports remain available across section switches and hidden lazy presentation', async () => {
  for (const hiddenAt of ['parse', 'lazy', 'never']) {
    const read = deferred(), acts = deferred(), e = env(new Map([['actsview.js', acts]])), received = [];
    const got = { acts: [{ id: 'ride', start: 1 }], workouts: [], skipped: [], dupes: 0 };
    const app = await fitness(e, { importFiles: () => read.promise }); await app.show({ section: 'today' }); pickRide(e);
    if (hiddenAt === 'parse') app.hide(); else await app.show({ section: 'activities' });
    read.resolve(got); await tick();
    if (hiddenAt === 'lazy') app.hide();
    acts.resolve({ view, openUpload: async (ctx, batch, current) => { if (!current()) return false; received.push(batch); return true; } }); await tick();
    if (hiddenAt !== 'never') { assert.equal(received.length, 0); await app.show({ section: 'activities' }); await tick(); }
    assert.deepEqual(received, [got], `${hiddenAt}: the parsed ride can still be reviewed`);
    await app.show({ section: 'today' }); await tick(); assert.equal(received.length, 1, 'an already presented batch is not replayed'); app.unmount();
  }
});

test('Fitness: hiding during upload preparation defers the same batch until return', async () => {
  const prepare = deferred(), received = [], got = { acts: [{ id: 'ride', start: 1 }] };
  const acts = { promise: Promise.resolve({ view, openUpload: async (ctx, batch, current) => { await prepare.promise; if (!current()) return false; received.push(batch); return true; } }) };
  const delayed = env(new Map([['actsview.js', acts]]));
  const app = await fitness(delayed, { importFiles: async () => got }); await app.show({ section: 'today' }); pickRide(delayed); await tick();
  app.hide(); prepare.resolve(); await tick(); assert.deepEqual(received, []);
  await app.show({ section: 'activities' }); await tick(); assert.deepEqual(received, [got]); app.unmount();
});

test('Fitness: imports from an unmounted, aborted or changed account are never presented', async () => {
  for (const end of ['unmount', 'abort', 'account']) {
    const read = deferred(), e = env(), received = [];
    const acts = { promise: Promise.resolve({ view, openUpload: async (ctx, got) => { received.push(got); return true; } }) };
    e.fw.lazy = () => acts.promise;
    const app = await fitness(e, { importFiles: () => read.promise }); await app.show({ section: 'activities' }); pickRide(e);
    if (end === 'unmount') app.unmount(); else if (end === 'abort') e.controller.abort(); else e.fw.session.user.id = 'other';
    read.resolve({ acts: [{ id: 'private-ride' }] }); await tick(); assert.deepEqual(received, [], end);
    if (end !== 'unmount') app.unmount();
  }
});

test('Fitness Upload checks the optional presentation guard after its own formatter import', async () => {
  const src = readFileSync(new URL('fitness/roof/actsview.js', MAIN), 'utf8');
  const body = src.slice(src.indexOf('export async function openUpload('), src.indexOf('// the Activities section:', src.indexOf('export async function openUpload('))).replace('export ', '');
  const prepare = deferred(); let current = true, opened = 0;
  const upload = new Function('use', 'needF', 'toast', 'openSheet', 'uploadView', `${body}\nreturn openUpload;`)(noop, () => prepare.promise, noop, () => opened++, noop);
  const pending = upload({}, { acts: [] }, () => current); current = false; prepare.resolve();
  assert.equal(await pending, false); assert.equal(opened, 0);
  current = true; assert.equal(await upload({}, { acts: [] }), true); assert.equal(opened, 1, 'ordinary callers keep the additive default');
});

for (const [name, factory, section, file, method, route] of [
  ['Fitness', fitness, 'activities', 'fxsettings.js', 'openSettings', { section: 'activities', key: 'settings' }],
  ['Markets', markets, 'today', 'stock.js', 'openStock', { section: 'today', key: 's', arg: 'TSCO' }],
]) {
  test(`${name}: a lazy sheet cannot follow a previous screen episode; current requests still open`, async () => {
    const job = deferred(), e = env(new Map([[file, job]])); let opened = 0;
    const app = await factory(e); await app.show(route); await tick(); app.hide(); await app.show({ section });
    job.resolve({ [method]: () => { opened++; } }); await tick(); assert.equal(opened, 0);
    await app.show(route); await tick(); assert.equal(opened, 1); app.unmount();
  });
}

test('Chats: resolving or rejecting service startup after unmount never reattaches subscriptions or UI', async () => {
  for (const fail of [false, true]) {
    const service = deferred(), e = env(); let subscribed = 0;
    const app = await chats(e, service); await app.show({ section: 'chats' }); app.unmount();
    const count = e.headers.length;
    if (fail) service.reject(new Error('late startup')); else service.resolve({ on: () => { subscribed++; return noop; }, call: async () => ({}) });
    await tick(); assert.equal(subscribed, 0); assert.equal(e.root.children.length, 0); assert.equal(e.headers.length, count);
  }
});

test('Chats: the signal prevents subscriptions before the frame reaches unmount', async () => {
  const service = deferred(), e = env(); let subscribed = 0;
  const app = await chats(e, service); e.controller.abort(); service.resolve({ on: () => { subscribed++; return noop; }, call: async () => ({}) });
  await tick(); assert.equal(subscribed, 0); app.unmount();
});

test('Chats: a lazy settings sheet is dropped across hide/return, then opens from a current tap', async () => {
  const service = deferred(), job = deferred(), e = env(new Map([['settings.js', job]])); let opened = 0;
  const app = await chats(e, service); service.resolve({ on: (k, fn) => { fn({ topic: 'state', data: { state: 'ready' } }); return noop; }, call: async () => ({}) }); await tick();
  await app.show({ section: 'chats' }); const first = e.headers.at(-1).acts.find((a) => a.label === 'Chat Settings').run();
  app.hide(); await app.show({ section: 'chats' }); job.resolve({ openChatSettings: () => { opened++; } }); await first; assert.equal(opened, 0);
  await e.headers.at(-1).acts.find((a) => a.label === 'Chat Settings').run(); assert.equal(opened, 1); app.unmount();
});

test('Markets named sheet navigation captures its caller episode, including late failures and release', async () => {
  const core = { S: {}, sheetIs: noop, stockOpen: noop, emit: noop };
  const ui = load('markets/roof/mkui.js', { core, C: {} }, 'init, release, openSheet, pushSheet, Sheet');
  for (const push of [false, true]) for (const fail of [false, true]) {
    const job = deferred(); let episode = 1, opened = 0;
    const e = env(); e.fw.sheet = { open: () => { opened++; return {}; } };
    ui.init(e.fw, e.root, {}, { stock: () => job.promise }, () => { const mine = episode; return () => mine === episode; });
    const pending = (push ? ui.pushSheet : ui.openSheet)('stock'); episode++;
    if (fail) job.reject(new Error('old import')); else job.resolve(() => []);
    assert.equal(await pending, null); assert.equal(opened, 0); ui.release();
  }
  const job = deferred(), e = env(); ui.init(e.fw, e.root, {}, { stock: () => job.promise });
  const pending = ui.openSheet('stock'); ui.release(); job.resolve(() => []);
  assert.equal(await pending, null, "release invalidates pending named views even with init’s additive default");
  let opened = 0;
  const sheet = { el: e.doc.createElement('div'), close: noop };
  e.fw.sheet = { open: (spec) => { opened++; spec.body(e.doc.createElement('div')); return sheet; } };
  ui.init(e.fw, e.root, {}, { stock: async () => () => [] });
  assert.equal(await ui.openSheet('stock'), sheet, 'the additive default still opens a current named view');
  assert.equal(opened, 1); ui.release();
});

test('Chats service: abort before startup skips the worker, and abort during startup terminates immediately once', async () => {
  class FakeWorker extends EventTarget {
    static made = [];
    constructor() { super(); FakeWorker.made.push(this); this.terminated = 0; this.got = []; }
    postMessage(m) { this.got.push(m); }
    terminate() { this.terminated++; }
  }
  const saved = globalThis.Worker; globalThis.Worker = FakeWorker;
  try {
    const { startService } = await import('../../../pigeon/roof/service.js');
    const before = new AbortController(); before.abort();
    const a = await startService({ signal: before.signal }); assert.equal(FakeWorker.made.length, 0); await assert.rejects(a.call('state'));
    const during = new AbortController(), listeners = new Set();
    const pending = startService({ signal: during.signal, ui: { visible: () => true, on: (k) => { listeners.add(k); return () => listeners.delete(k); } } });
    const worker = FakeWorker.made.at(-1); assert.equal(worker.got[0].m, 'hello'); assert.equal(listeners.size, 3);
    during.abort(); assert.equal(worker.terminated, 1); assert.equal(listeners.size, 0);
    const b = await pending; b.release({ terminate: true }); assert.equal(worker.terminated, 1);
    let patches = 0; b.on('*', () => patches++); worker.dispatchEvent(Object.assign(new Event('message'), { data: { t: 'patch', topic: 'rows', data: [{ id: 'late' }] } }));
    assert.equal(patches, 0); assert.deepEqual(await b.facade.waiting(), []);
  } finally { globalThis.Worker = saved; }
});
