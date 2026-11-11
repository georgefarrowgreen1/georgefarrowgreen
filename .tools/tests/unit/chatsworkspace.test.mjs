import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect, mediaFiles } from '../../../pigeon/roof/workspace.js';
import { createStore } from '../../../pigeon/roof/store.js';
import { world, IDS } from './fixtures/chats.mjs';
import { view as lockView } from '../../../pigeon/roof/lock.js';
import { fakeDocument } from '../roofkit/fakedom.mjs';

function fixture() {
  const ac = new AbortController(), W = world(), calls = [], store = createStore(), urls = [], links = [];
  let provider, removed = 0, changed = 0, state = 'ready', id = IDS.pat, visible = true;
  for (const key of ['friends', 'rows', 'groups']) store.apply(key, W[key]);
  store.apply(`chat:${id}`, W.chats[id]);
  const fw = { signal: ac.signal, session: { user: { id: 'account-a' } }, nav: { go: p => calls.push(['go', p]) },
    workspace: { enabled: true, active: () => visible, changed: () => changed++, provide(p) { provider = p; return () => removed++; } },
    lazy: async () => ({ openChatSettings() { calls.push(["settings"]); return {}; }, openView(ctx, mid) { calls.push(["view", mid]); return {}; }, blobUrl(file) { const url = { file, url: 'blob:test', revoked: 0, revoke() { this.revoked++; } }; urls.push(url); return url; } }),
    ui: { el(tag, attrs) { const link = { tag, attrs, clicked: 0, click() { this.clicked++; }, remove() {} }; links.push(link); return link; } } };
  const root = { append() {} }, svc = { async call(...args) { calls.push(args); return new Blob(['real bytes'], { type: 'image/jpeg' }); } };
  const open = Object.fromEntries(['newChat', 'newGroup', 'requests', 'settings', 'view'].map(name => [name, (...args) => { calls.push([name, ...args]); return {}; }]));
  const handle = connect(root, { fw, svc, store, open }, { state: () => state, chatId: () => id, reply: target => { calls.push(['reply', target]); return true; },
    unlock: async current => { calls.push(['unlock']); return current(); } });
  return { ac, fw, svc, open, calls, store, W, handle, urls, links, get provider() { return provider; }, get removed() { return removed; }, get changed() { return changed; },
    state: value => state = value, chat: value => id = value, hide: () => visible = false };
}

test('Chat Files indexes only available non-ephemeral media from the current decrypted chat, without fetching bytes', async () => {
  const f = fixture();
  try {
    const chat = f.W.chats[IDS.pat], normal = chat.msgs.find(m => m.kind === 'photo');
    for (const patch of [{ id: 'once', kind: 'viewonce', media: { ref: 'once' } }, { id: 'recalled', recalled: true }, { id: 'flying', flight: { flying: true } }, { id: 'lost', flight: { lost: true } }, { id: 'expires', expires: Date.now() + 864e5 }, { id: 'expired', expires: 1 }, { id: 'invalid', media: { ref: '../invalid' } }, { id: 'alias', media: { ref: 'once' } }]) chat.msgs.push({ ...normal, ...patch });
    f.store.apply(`chat:${IDS.pat}`, chat);
    const result = f.provider.files();
    assert.equal(result.status, 'ready'); assert.equal(result.files.length, 2);
    assert.deepEqual(result.files.map(file => file.objectId), [`${IDS.pat}:m-p-4`, `${IDS.pat}:m-p-5`]);
    assert.ok(result.files.every(file => file.mime === 'application/octet-stream' && file.source === 'Pat Jones' && file.downloadIntent === 'download-file'));
    assert.equal(f.provider.files({ query: 'VOICE' }).files.length, 1);
    assert.deepEqual(f.calls, [], 'metadata never decrypts or consumes an attachment');
    assert.deepEqual(mediaFiles(IDS.ali, chat), []);
    assert.deepEqual(mediaFiles('../bad', chat), []);
    f.chat(IDS.group); assert.deepEqual(f.provider.files().files, [], 'another current chat never inherits media from a previous conversation');
    await Promise.resolve(); assert.equal(f.changed > 0, true);
  } finally { f.ac.abort(); }
});

test('Chat Files locked/sign-in states have an actual native unlock route and commands never send messages', async () => {
  const f = fixture();
  try {
    f.state('locked'); assert.equal(f.provider.files().status, 'locked'); assert.deepEqual(f.provider.files().files, []);
    assert.ok(f.provider.snapshot().actions.some(a => a.id === 'unlock' && a.enabled));
    assert.equal((await f.provider.run('unlock')).ok, true); assert.deepEqual(f.calls, [['unlock']]);
    f.state('key'); assert.equal(f.provider.files().status, 'locked'); await f.provider.run('unlock'); assert.match(f.calls.at(-1)[1], /^\/chats\/in\//);
    f.state('signin'); assert.equal(f.provider.files().status, 'signin');
    f.state('ready');
    assert.equal((await f.provider.run('reply', '<script>')).ok, false);
    assert.equal((await f.provider.run('reply', 'unknown')).ok, false);
    assert.equal((await f.provider.run('reply', IDS.pat)).ok, true);
    for (const action of ['new-chat', 'new-group', 'requests', 'settings']) assert.equal((await f.provider.run(action)).ok, true);
    assert.ok(f.calls.every(call => !['sendText', 'sendBlob', 'sendRun'].includes(call[0])));
    assert.equal((await f.provider.run('open-file', `${IDS.ali}:m-a-3`)).ok, false);
    assert.equal((await f.provider.run('open-file', `${IDS.pat}:m-p-4`)).ok, true);
    assert.deepEqual(f.calls.at(-1), ['view', 'm-p-4']);
    f.hide(); const count = f.calls.length; assert.equal((await f.provider.run('new-chat')).ok, false); assert.equal(f.calls.length, count);
  } finally { f.ac.abort(); }
});

test('Chat download uses only the current eligible native media ref and releases its owned object URL on abort', async () => {
  const f = fixture();
  try {
    const result = await f.provider.run('download-file', `${IDS.pat}:m-p-4`);
    assert.equal(result.ok, true); assert.deepEqual(f.calls, [['photo', 'ph-p-4']]);
    assert.equal(result.file.name, 'photo-m-p-4.jpg'); assert.equal(result.file.type, 'image/jpeg'); assert.equal(await result.file.text(), 'real bytes');
    assert.equal(result.ref.size, 10); assert.equal(f.links[0].clicked, 1); assert.equal(f.urls.length, 1);
    f.ac.abort(); assert.equal(f.urls[0].revoked, 1); assert.equal(f.removed, 1);
    f.handle.destroy(); assert.equal(f.urls[0].revoked, 1); assert.equal(f.removed, 1);
    assert.equal((await f.provider.run('download-file', `${IDS.pat}:m-p-4`)).ok, false);
    assert.deepEqual(f.provider.files().files, []);
  } finally { f.ac.abort(); }
});

test('Chat download fences stale route, hidden pane, lock, changed media and account leases after byte decryption', async () => {
  for (const change of [f => f.hide(), f => f.state('locked'), f => f.chat(IDS.group), f => { f.fw.session.user.id = 'account-b'; }, f => { f.W.chats[IDS.pat].msgs.find(m => m.id === 'm-p-4').media.ref = 'other-ref'; }, f => f.ac.abort()]) {
    const f = fixture(); let finish;
    try {
      f.svc.call = () => new Promise(resolve => { finish = resolve; });
      const work = f.provider.run('download-file', `${IDS.pat}:m-p-4`); change(f); finish(new Blob(['bytes'], { type: 'image/jpeg' }));
      assert.equal((await work).ok, false); assert.deepEqual(f.links, []); assert.deepEqual(f.urls, []);
    } finally { f.ac.abort(); }
  }
  const f = fixture(); let current = true, finish;
  try {
    f.fw.lazy = () => new Promise(resolve => { finish = resolve; });
    const work = f.provider.run('download-file', `${IDS.pat}:m-p-4`, { current: () => current });
    await Promise.resolve(); current = false; finish({ blobUrl: () => { throw new Error('stale intent allocated a URL'); } });
    assert.equal((await work).ok, false); assert.deepEqual(f.links, []);
  } finally { f.ac.abort(); }
});

test('Chat delayed native editors cannot open after their command lease ends', async () => {
  for (const intent of ['settings', 'open-file']) {
    const f = fixture(); let finish, current = true;
    try {
      f.fw.lazy = () => new Promise(resolve => { finish = resolve; });
      const work = f.provider.run(intent, `${IDS.pat}:m-p-4`, { current: () => current });
      current = false;
      finish({ openChatSettings() { throw new Error('stale settings opened'); }, openView() { throw new Error('stale media opened'); } });
      assert.equal((await work).ok, false); assert.deepEqual(f.calls, []);
    } finally { f.ac.abort(); }
  }
});

test('the existing Chat passkey veil cannot unlock after its OS action or visibility lease ends', async () => {
  const doc = fakeDocument(), ac = new AbortController(), calls = [];
  const ui = { el(tag, attrs = {}, ...children) { const el = doc.createElement(tag); el.append(...children); return el; }, btn() { return doc.createElement('button'); } };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let finish, current = true, visible = true, asked = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Desktop', credentials: { get() { asked++; return new Promise(resolve => { finish = resolve; }); } } } });
  const native = lockView(doc.body, { fw: { ui, signal: ac.signal, visible: () => visible, toast: text => calls.push(['toast', text]) }, svc: { async call(...args) { calls.push(args); return { state: 'ready' }; } } });
  const assertion = () => { const ad = new Uint8Array(37); ad[32] = 4; return { response: { authenticatorData: ad.buffer } }; };
  try {
    const stale = native.unlock(() => current); current = false; finish(assertion()); assert.equal(await stale, false); assert.deepEqual(calls, []);
    visible = false; assert.equal(await native.unlock(), false); assert.equal(asked, 1);
    visible = true; current = true; const valid = native.unlock(() => current); finish(assertion()); assert.equal(await valid, true); assert.deepEqual(calls, [['lock', false]]);
    const gone = native.unlock(); ac.abort(); finish(assertion()); assert.equal(await gone, false); assert.deepEqual(calls, [['lock', false]]);
  } finally { native.unmount(); if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; }
});
