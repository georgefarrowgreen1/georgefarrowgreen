import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../../../markets/roof/workspace.js';

function fixture() {
  const ac = new AbortController(), calls = [], listeners = new Map();
  const root = { classList: { values: new Set(), add(x) { this.values.add(x); }, remove(x) { this.values.delete(x); } } };
  const S = { me: { id: 'account-a' }, list: [{ symbol: 'TSCO.L', qty: 500, cost: 1000 }], cash: [{ amount: 12345 }], loading: false, err: null };
  let provider, removed = 0, changes = 0, alive = true, visible = true;
  const native = { openIncome: () => calls.push(['income']), openIsa: () => calls.push(['isa']), openVs: () => calls.push(['vs']), openAbout: () => calls.push(['about']), openStock: (ctx, sym) => calls.push(['stock', sym]) };
  const fw = { signal: ac.signal, session: { user: { id: 'account-a' } }, lazy: async () => native, workspace: { enabled: true, active: () => visible,
    provide(p) { provider = p; return () => { removed++; }; }, changed() { changes++; } } };
  const core = { fwOf: () => fw, EVENTS: ['me', 'list', 'loading', 'error'], on(type, fn) { listeners.set(type, fn); return () => listeners.delete(type); }, retry: async () => { calls.push('refresh'); } };
  const open = Object.fromEntries(['addStock', 'cash'].map(name => [name, (...args) => { calls.push([name, ...args]); return {}; }]));
  const bridge = connect({ S, core, fw, open }, root, () => alive);
  return { ac, calls, root, S, core, fw, open, native, bridge, get provider() { return provider; }, get removed() { return removed; }, get changes() { return changes; }, listeners,
    hidden() { visible = false; }, retired() { alive = false; } };
}

test('Markets exposes real editor actions and no invented account/file resources', async () => {
  const f = fixture();
  try {
    const snapshot = f.provider.snapshot();
    assert.equal(snapshot.status, 'ready');
    assert.deepEqual(snapshot.files, []);
    assert.deepEqual(f.provider.files(), { status: 'ready', files: [] });
    assert.ok(snapshot.actions.every(a => a.enabled && a.keywords.length));
    assert.doesNotMatch(JSON.stringify(snapshot), /12345|1000|500|£/);
    const same = connect({ S: f.S, core: f.core, fw: f.fw, open: f.open }, f.root);
    assert.equal(same, f.bridge, 'late/repeated SDK activation keeps one provider');
    for (const action of ['add-stock', 'add-cash', 'income', 'isa', 'compare', 'about']) assert.equal((await f.provider.run(action)).ok, true);
    assert.deepEqual(f.calls, [['addStock'], ['cash'], ['income'], ['isa'], ['vs'], ['about']]);
  } finally { f.ac.abort(); }
});

test('Markets keeps account mismatch, hidden panes and stale intent leases inert', async () => {
  const f = fixture();
  try {
    assert.equal((await f.provider.run('stock', 'AAPL', { current: () => false })).ok, false);
    assert.equal(f.calls.length, 0);
    f.hidden(); assert.equal((await f.provider.run('add-cash')).ok, false); assert.equal(f.calls.length, 0);
    f.S.me.id = 'account-b';
    assert.equal(f.provider.snapshot().status, 'signin');
    assert.ok(f.provider.snapshot().actions.filter(a => a.id !== 'refresh').every(a => !a.enabled));
    assert.deepEqual(f.provider.files().files, []);
    f.ac.abort();
    assert.equal(f.removed, 1); assert.equal(f.listeners.size, 0); assert.equal(f.root.classList.values.has('mk-workspace'), false);
    assert.equal((await f.provider.run('refresh')).ok, false); assert.equal(f.calls.length, 0);
    f.bridge.destroy(); assert.equal(f.removed, 1);
  } finally { f.ac.abort(); }
});

test('Markets validates stock references, reports native loading/errors and fences async results', async () => {
  const f = fixture();
  try {
    assert.equal((await f.provider.run('stock', '<script>')).ok, false); assert.deepEqual(f.calls, []);
    assert.equal((await f.provider.run('stock', 'TSCO.L')).ok, true); assert.deepEqual(f.calls, [['stock', 'TSCO.L']]);
    f.listeners.get('list')(); assert.equal(f.changes, 1);
    let finish; f.fw.lazy = () => new Promise(resolve => { finish = resolve; });
    let owner = true; const work = f.provider.run('income', null, { current: () => owner }); owner = false; finish(f.native);
    assert.equal((await work).ok, false);
    assert.deepEqual(f.calls, [['stock', 'TSCO.L']], 'a cancelled lazy intent never opens its sheet');
    const replaced = f.provider.run('income'); f.S.me.id = 'account-b'; finish(f.native);
    assert.equal((await replaced).ok, false); assert.deepEqual(f.calls, [['stock', 'TSCO.L']]);
    f.S.me = null; f.S.loading = true; assert.equal(f.provider.snapshot().status, 'loading');
    f.S.loading = false; f.S.err = { words: 'Offline' }; assert.equal(f.provider.snapshot().status, 'error');
    assert.equal(f.provider.snapshot().error, 'Offline');
    f.retired(); f.listeners.get('list')(); assert.equal(f.changes, 1);
  } finally { f.ac.abort(); }
});
