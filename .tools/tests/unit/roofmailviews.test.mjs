// Mail's reader and sheets under the roof (One roof stage 4, s4/spec §10.1 roofmailviews, S4-D4, D11, D16, D17, D18,
// §3.1): MR's files in the inflite repo beside (email/public/roof/), driven on FW's stand-in DOM with FW's real ui.js, a
// stand-in fw (sheets, toasts, nav), a stand-in Mail API that records every call, and a stand-in outbox. Checked:
//   compose's close rules: a changed compose closed any way but Send or Delete Draft has its words written to
//   mail:unsent (outbox.keepUnsent) synchronously in onClose, never a file, then a server draft and "Draft saved"; an
//   unchanged one writes nothing; Send hands the words and files to the outbox and keeps nothing; Delete Draft removes
//   the server draft; offline with files the sheet stays ("Files need a connection. Try Again");
//   a quoteOld draft (api.draft): the note, Open Mail, and Send asks "Send Without the Quoted Text?" first;
//   Mail Settings: only its keys are saved (signature, catchall; an address's name, signature, category, color), never
//   isDefault, no New Address, Delete Address or Send From (a link to Mail's own address instead), Remote Images on this
//   phone is mail:remote-images and nothing else;
//   the viewer's type list is S4-D17's, an SVG or a PDF never reaches it, a picture is re-typed and its blob: revoked;
//   the reader draws cards from api.meta (no body is ever asked for), pictures by api.picture (raster only), every
//   other file a link at Mail's address.
// Skips with its reason when the inflite repo beside hasn't MR's files (or they are still B0-b's stubs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as FX from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';

const { IFL, ROOF } = FX;
const MR = IFL && new URL('email/public/roof/', IFL);
const FILES = ['reader.js', 'compose.js', 'mailsettings.js', 'viewer.js', 'signin.js'];
const stubbed = (f) => /^\s*export\s+const\s+STUB\s*=\s*true/m.test(readFileSync(new URL(f, MR), 'utf8'));
const skip = FX.roofSkip || FX.mailSkip
  || (!MR || !FILES.every((f) => existsSync(new URL(f, MR))) ? 'the inflite repo beside has no Mail module (email/public/roof/)' : false)
  || (FILES.some(stubbed) ? 'MR’s files are still B0-b’s stubs' : false);

// ---- the browser bits: a document, storage, a location at inflite.ai, the network never used
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), keys: () => [...m.keys()], key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.document = fakeDocument();
globalThis.localStorage = mem();
globalThis.sessionStorage = mem();
globalThis.location ??= { protocol: 'https:', host: 'inflite.ai', origin: 'https://inflite.ai', pathname: '/mail/', hash: '' };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, language: 'en-GB' }, configurable: true, writable: true });
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.fetch = async () => { throw new Error('no network in this test'); };
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((ok) => setTimeout(ok, 0)); };
const text = (n) => n?.textContent ?? '';

let ui, M = {};
if (!skip) {
  ui = await import(new URL('ui.js', ROOF).href);
  for (const f of [...FILES, 'store.js', 'logic.js', 'api.js']) M[f.replace('.js', '')] = await import(new URL(f, MR).href);
}

// ---- a stand-in fw and ctx: sheets as the framework's (a dialog with its head's h2 and body; push; onClose however it
// closes), toasts and navigations recorded
function rig({ me = { displayName: 'George', defaultFrom: 'hello@inflite.ai', identities: ['hello@inflite.ai'], addresses: [], signature: '' }, api = {} } = {}) {
  const calls = [], toasts = [], sheets = [], navs = [], confirms = [];
  const rec = (name, answer) => (...a) => { calls.push([name, ...a]); return typeof answer === 'function' ? answer(...a) : Promise.resolve(answer); };
  const fw = {
    ui, app: 'mail', toast: (t) => toasts.push(t), theme: () => 'light', on: () => () => {}, lazy: (fn) => Promise.resolve(fn()),
    nav: { go: (p) => navs.push(p), section: (s) => navs.push(`section:${s}`) },
    sheet: {
      open(spec) {
        const d = ui.el('dialog', { class: 'ifl-sheet', data: { sheet: spec.sheet, app: 'mail' } });
        const h2 = ui.el('h2', { text: spec.title || spec.label || '' }), body = ui.el('div', { class: 'ifs-body' });
        d.append(ui.el('header', { class: 'ifs-head' }, h2), body);
        if (spec.acts?.length) d.append(ui.el('footer', { class: 'ifs-acts' }, spec.acts.map((a) => ui.btn(a.label, a))));
        const h = { el: d, body, closed: false, spec, busy: false,
          close() { if (h.closed) return; h.closed = true; d.remove(); spec.onClose?.(); },
          push(p) { const pg = ui.el('div', { class: 'ifs-page', data: { page: p.page } }); h2.textContent = p.title ?? h2.textContent; body.append(pg); if (typeof p.body === 'function') p.body(pg, h); else if (p.body) pg.append(p.body); return pg; },
          pop() {}, setBusy(b) { h.busy = !!b; } };
        document.body.append(d);
        if (typeof spec.body === 'function') spec.body(body, h); else if (spec.body) body.append(spec.body);
        sheets.push(h);
        return h;
      },
    },
  };
  const store = M.store.createStore({ me });
  const outbox = { keeps: [], sends: [], drops: 0,
    keepUnsent(f) { this.keeps.push(JSON.parse(JSON.stringify(f))); return true; }, dropUnsent() { this.drops++; }, unsent: () => null,
    send(d, files) { this.sends.push({ d, files }); return Promise.resolve({ ok: true }); } };
  const fake = {
    saveDraft: rec('saveDraft', { ok: true, id: 'd-saved' }), remove: rec('remove', { ok: true }), findContacts: rec('findContacts', { contacts: [] }),
    draft: rec('draft', { compose: {}, quoteOld: false }), settings: rec('settings', {}), saveSettings: rec('saveSettings', (p) => Promise.resolve(p)),
    updateAddress: rec('updateAddress', (e, p) => Promise.resolve({ email: e, ...p })), me: rec('me', me),
    thread: rec('thread', null), meta: rec('meta', null), picture: rec('picture', null), batch: rec('batch', { ok: true }),
    fileUrl: (id) => `https://email.inflite.ai/api/attachments/${id}`, rawUrl: (id) => `https://email.inflite.ai/api/messages/${id}/raw`,
    ...api,
  };
  const ctx = { store, api: fake, logic: M.logic, fw, icon: (n) => ui.el('span', { class: 'ic', data: { icon: n } }), outbox,
    actions: { act: (...a) => { calls.push(['act', ...a]); return Promise.resolve({ ok: true }); }, batch: () => Promise.resolve({}) },
    open: { confirm: (spec) => { confirms.push(spec); return Promise.resolve(confirms.answer ?? true); }, compose: (i) => calls.push(['open.compose', i]), viewer: (f, i) => calls.push(['open.viewer', f, i]), later: () => {}, rowMenu: () => {} },
    layout: () => store.get().layout };
  return { ctx, calls, toasts, sheets, navs, confirms, outbox, store };
}
const type = (input, v) => { input.value = v; input.dispatch('input'); };
const act = (root, a) => root.querySelector(`[data-act=${a}]`);

test('compose: a changed compose closed any way but Send or Delete Draft is kept on the phone synchronously, then saved to Mail, “Draft saved”', { skip }, async () => {
  const r = rig();
  const h = M.compose.openCompose(r.ctx, {});
  assert.equal(h.spec.sheet, 'mail-compose');
  assert.equal(r.store.get().compose, true, 'store.compose while it’s open (busy)');
  const q = (s) => h.el.querySelector(s);
  q('input[data-key=to]').value = 'pat@example.com';
  type(q('input[data-key=subject]'), 'Lunch');
  type(q('textarea[data-key=text]'), 'Thursday?');
  const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
  h.close();   // (the ✕, a drag, Escape, a route change and sign-out all close the sheet this way: onClose)
  assert.equal(r.outbox.keeps.length, 1, 'mail:unsent written in onClose, before anything is awaited');
  assert.deepEqual(r.outbox.keeps[0].to, [{ name: '', email: 'pat@example.com' }], 'what was typed in To counted');
  assert.equal(r.outbox.keeps[0].subject, 'Lunch');
  assert.ok(!('files' in r.outbox.keeps[0]) && !('attachments' in r.outbox.keeps[0]), 'never a file in what’s kept');
  assert.equal(r.store.get().compose, false);
  await tick();
  const save = r.calls.find((c) => c[0] === 'saveDraft');
  assert.ok(save, 'then a server draft');
  assert.equal(save[1].subject, 'Lunch');
  assert.deepEqual(save[1].quote, null);
  assert.ok(r.toasts.includes('Draft saved'), r.toasts.join(' | '));
  assert.ok(r.outbox.drops >= 1, 'the phone’s copy let go once Mail has it');
  void file;
});

test('compose: unchanged, nothing is kept; Send hands the words to the outbox and keeps nothing; Delete Draft removes it', { skip }, async () => {
  let r = rig();
  let h = M.compose.openCompose(r.ctx, {});
  h.close();
  await tick();
  assert.equal(r.outbox.keeps.length, 0, 'nothing written');
  assert.ok(!r.calls.some((c) => c[0] === 'saveDraft'), 'no server draft');

  r = rig();
  h = M.compose.openCompose(r.ctx, { to: [{ name: 'Pat', email: 'pat@example.com' }], subject: 'Hi', quote: { of: 'm-1', mode: 'reply' }, snippet: 'See you then' });
  type(h.el.querySelector('textarea[data-key=text]'), 'Yes please');
  assert.match(text(h.el.querySelector('.mc-quote')), /Quoted below/);
  assert.match(text(h.el.querySelector('.mc-quote')), /See you then/, 'the snippet under “Quoted below”, as text');
  act(h.el, 'send').click();
  await tick();
  assert.equal(r.outbox.sends.length, 1, 'sent through the outbox');
  assert.deepEqual(r.outbox.sends[0].d.quote, { of: 'm-1', mode: 'reply' }, 'the quote as { of, mode }: Mail’s server quotes');
  assert.ok(!('html' in (r.outbox.sends[0].d.quote || {})));
  assert.ok(h.closed, 'the sheet closed');
  assert.equal(r.outbox.keeps.length, 0, 'Send keeps nothing in mail:unsent');
  assert.ok(!r.calls.some((c) => c[0] === 'saveDraft'), 'no close-time draft (the outbox saves before it sends)');

  r = rig();
  h = M.compose.openCompose(r.ctx, { draftId: 'd-9', to: [{ name: '', email: 'a@b.co' }], subject: 'Old', text: 'x' });
  type(h.el.querySelector('textarea[data-key=text]'), 'changed');
  act(h.el, 'more').click();
  act(h.el, 'delete-draft').click();
  await tick();
  assert.equal(r.outbox.keeps.length, 0, 'Delete Draft keeps nothing');
  assert.deepEqual(r.calls.find((c) => c[0] === 'remove'), ['remove', 'd-9'], 'the server draft removed');

  r = rig();
  navigator.onLine = false;
  h = M.compose.openCompose(r.ctx, { to: [{ name: '', email: 'a@b.co' }], subject: 'Pics', files: [{ ref: 'att-1', filename: 'a.png', type: 'image/png', size: 9 }] });
  act(h.el, 'send').click();
  await tick();
  navigator.onLine = true;
  assert.ok(!h.closed, 'offline with files: the sheet stays');
  assert.ok(r.toasts.includes('Files need a connection. Try Again'), r.toasts.join(' | '));
  assert.equal(r.outbox.sends.length, 0);
  h.close();
});

test('compose: a quoteOld draft says so, offers Mail, and Send asks “Send Without the Quoted Text?” first', { skip }, async () => {
  const r = rig({ api: { draft: async (id) => ({ compose: { from: 'hello@inflite.ai', to: [{ name: 'Pat', email: 'pat@example.com' }], cc: [], bcc: [], subject: 'Re: Plans', text: 'Sounds good', inReplyTo: '<x@y>', references: '<x@y>', quote: null, files: [] }, quoteOld: true }) } });
  const h = M.compose.openCompose(r.ctx, { draftId: 'd-old' });
  await tick();
  assert.equal(h.el.querySelector('input[data-key=subject]').value, 'Re: Plans', 'the draft’s fields from api.draft');
  assert.match(text(h.el.querySelector('.mc-quote')), /started in Mail on its own/);
  assert.ok(h.el.querySelector('.mc-quote [data-act=open-mail]'), 'Open Mail');
  r.confirms.answer = false;
  act(h.el, 'send').click();
  await tick();
  assert.equal(r.confirms.at(-1)?.title, 'Send Without the Quoted Text?');
  assert.equal(r.outbox.sends.length, 0, 'Cancel: not sent');
  r.confirms.answer = true;
  act(h.el, 'send').click();
  await tick();
  assert.equal(r.outbox.sends.length, 1, 'Send: sent');
  assert.equal(r.outbox.sends[0].d.draftId, 'd-old', 'from the draft it was');
});

test('Mail Settings: only its own keys saved, never isDefault; no New Address, Delete Address or Send From inside InFlite', { skip }, async () => {
  const src = readFileSync(new URL('mailsettings.js', MR), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/createAddress|deleteAddress|isDefault\s*:/.test(src), 'no address create, delete or default');
  assert.equal(M.mailsettings.patchOf('address', 'isDefault', true), null);
  assert.equal(M.mailsettings.patchOf('settings', 'notify', true), null);
  const settings = { domain: 'inflite.ai', catchall: 'keep', signature: 'G', addresses: [{ email: 'hello@inflite.ai', name: 'George', color: 'blue', category: null, isDefault: true, count: 3 }, { email: 'shop@inflite.ai', name: '', color: 'green', category: 'updates', isDefault: false }] };
  const r = rig({ api: { settings: async () => JSON.parse(JSON.stringify(settings)) } });
  const before = localStorage.keys();
  const h = M.mailsettings.openSettings(r.ctx, null);
  assert.equal(h.spec.sheet, 'mail-settings');
  await tick();
  assert.equal(h.el.querySelectorAll('[data-address]').length, 2, 'a row per address');
  assert.ok(!/New Address$|Delete Address|Make Default/.test(text(h.el).replace('New Address, Delete or Send From', '')), 'no New Address, Delete Address or Make Default rows');
  const own = act(h.el, 'own');
  assert.equal(own.getAttribute('href'), 'https://email.inflite.ai/#settings', 'those at Mail’s own address');
  assert.equal(own.getAttribute('target'), '_blank');
  assert.equal(act(h.el, 'notify').getAttribute('href'), '/#you=notify-mail', 'Notifications → You');
  // an address's page: name, signature, sort, colour
  h.el.querySelector('[data-address="shop@inflite.ai"]').click();
  const pg = h.el.querySelector('[data-page=address]');
  assert.ok(pg, 'its own page');
  const name = pg.querySelector('input[data-key=name]');
  name.value = 'Shop'; name.dispatch('change');
  const sig = pg.querySelector('textarea[data-key=signature]');
  sig.value = 'Thanks'; sig.dispatch('change');
  pg.querySelector('[data-key=category] [data-value=people]').click();
  pg.querySelector('[data-key=color] [data-colour=teal]').click();
  await tick();
  const ups = r.calls.filter((c) => c[0] === 'updateAddress');
  assert.deepEqual(ups.map((c) => [c[1], c[2]]), [['shop@inflite.ai', { name: 'Shop' }], ['shop@inflite.ai', { signature: 'Thanks' }], ['shop@inflite.ai', { category: 'people' }], ['shop@inflite.ai', { color: 'teal' }]]);
  for (const [, , p] of ups) assert.ok(Object.keys(p).every((k) => M.mailsettings.SAVES.address.includes(k)), JSON.stringify(p));
  // the signature for every address, and Unknown Addresses
  M.mailsettings.openSettings(r.ctx, 'signature');
  await tick();
  const sh = r.sheets.at(-1), area = sh.el.querySelector('[data-page=signature] textarea[data-key=signature]');
  assert.ok(area, 'opened straight at its page');
  area.value = 'George F-G'; area.dispatch('blur');
  M.mailsettings.openSettings(r.ctx, 'unknown');
  await tick();
  r.sheets.at(-1).el.querySelector('[data-page=unknown] [data-key=catchall] [data-value=reject]').click();
  await tick();
  assert.deepEqual(r.calls.filter((c) => c[0] === 'saveSettings').map((c) => c[1]), [{ signature: 'George F-G' }, { catchall: 'reject' }]);
  // Remote Images on this phone: mail:remote-images, and no other key
  const sw = h.el.querySelector('[data-key=remote-images] input');
  sw.checked = true; sw.dispatch('change');
  assert.equal(localStorage.getItem('mail:remote-images'), '1');
  assert.deepEqual(localStorage.keys().filter((k) => !before.includes(k)), ['mail:remote-images'], 'nothing else stored');
  sw.checked = false; sw.dispatch('change');
  assert.equal(localStorage.getItem('mail:remote-images'), null);
});

test('viewer: S4-D17’s types only; an SVG, a PDF or HTML never shown; a picture re-typed, its blob: revoked as the sheet closes', { skip }, async () => {
  assert.equal(String(M.viewer.PICTURES), String(/^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/i));
  assert.equal(M.viewer.PICTURES.source, M.logic.PICTURES.source, 'the same list as logic.PICTURES');
  for (const t of ['image/svg+xml', 'application/pdf', 'text/html', 'video/mp4', 'image/x-icon']) assert.ok(!M.viewer.isPicture({ id: 'a1', type: t }), t);
  for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/bmp']) assert.ok(M.viewer.isPicture({ id: 'a1', type: t }), t);
  assert.equal(M.viewer.openViewer(rig().ctx, [{ id: 'a1', filename: 'x.svg', type: 'image/svg+xml' }], 0), null, 'nothing to show: no sheet');
  const made = [], gone = [];
  const was = { c: URL.createObjectURL, r: URL.revokeObjectURL };
  URL.createObjectURL = (b) => { made.push(b); return `blob:https://inflite.ai/${made.length}`; };
  URL.revokeObjectURL = (u) => gone.push(u);
  try {
    const r = rig({ api: { picture: async (id) => { r.calls.push(['picture', id]); return new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }); } } });
    const h = M.viewer.openViewer(r.ctx, [{ id: 's1', filename: 'evil.svg', type: 'image/svg+xml' }, { id: 'p1', filename: 'cat.png', type: 'image/png', size: 2048 }], 1);
    assert.equal(h.spec.sheet, 'mail-viewer');
    await tick();
    assert.equal(h.el.querySelectorAll('.mv-slide').length, 1, 'only the picture');
    assert.deepEqual(r.calls.filter((c) => c[0] === 'picture').map((c) => c[1]), ['p1'], 'only the picture asked for');
    assert.equal(made.length, 1);
    assert.equal(made[0].type, 'image/png', 'its bytes re-typed as its listed type, whatever Mail answered');
    assert.ok(h.el.querySelector('img.mv-img'), 'shown in an <img>');
    h.close();
    assert.deepEqual(gone, ['blob:https://inflite.ai/1'], 'revoked on close');
  } finally { URL.createObjectURL = was.c; URL.revokeObjectURL = was.r; }
});

test('reader: cards from api.meta (no body asked for), pictures by api.picture for raster only, every other file a link at Mail’s address', { skip }, async () => {
  const T = { id: 't-1', subject: 'Holiday photos', people: [{ name: 'Pat Smith', email: 'pat@example.com' }], count: 2, unread: 1,
    messages: [
      { id: 'm-2', folder: 'inbox', threadId: 't-1', mailbox: 'hello@inflite.ai', from: { name: 'Pat Smith', email: 'pat@example.com' }, to: [{ name: '', email: 'hello@inflite.ai' }], subject: 'Re: Holiday', snippet: 'Here they are', date: Date.now() - 6e4, unread: true },
      { id: 'm-1', folder: 'sent', threadId: 't-1', mailbox: 'hello@inflite.ai', from: { name: 'George', email: 'hello@inflite.ai' }, to: [{ name: 'Pat', email: 'pat@example.com' }], subject: 'Holiday', snippet: 'Send the photos?', date: Date.now() - 864e5, unread: false },
    ] };
  const META = { 'm-2': { ...T.messages[0], replyTo: null, messageId: '<m2@x>', inReplyTo: null, references: null, attachments: [{ id: 'a-png', filename: 'beach.png', type: 'image/png', size: 9 }, { id: 'a-svg', filename: 'logo.svg', type: 'image/svg+xml', size: 9 }, { id: 'a-pdf', filename: 'tickets.pdf', type: 'application/pdf', size: 9 }] } };
  const r = rig({ api: { thread: async (id) => (r.calls.push(['thread', id]), T), meta: async (id) => (r.calls.push(['meta', id]), META[id] || { ...T.messages.find((m) => m.id === id), attachments: [] }), picture: async (id) => (r.calls.push(['picture', id]), new Blob(['x'], { type: 'image/png' })) } });
  r.store.set({ threadId: 't-1', list: { rows: [{ id: 't-1', latestId: 'm-2', from: T.people[0], date: T.messages[0].date }], more: false, loading: false, err: null } });
  const el = ui.el('section', { class: 'ml-reader' });
  const v = M.reader.view(el, r.ctx);
  v.draw();
  await tick(10);
  v.draw();
  await tick(4);
  assert.deepEqual(r.calls.filter((c) => c[0] === 'thread').map((c) => c[1]), ['t-1'], 'the conversation asked for once');
  assert.ok(r.calls.some((c) => c[0] === 'meta' && c[1] === 'm-2'), 'the newest’s Meta');
  assert.ok(!r.calls.some((c) => /^message$/.test(c[0])), 'no body ever asked for');
  assert.equal(el.querySelectorAll('.mr-card').length, 2, 'a card per message');
  assert.equal(el.querySelector('.mr-card.open')?.getAttribute('data-mid'), 'm-2', 'the newest open');
  assert.deepEqual(r.calls.filter((c) => c[0] === 'picture').map((c) => c[1]), ['a-png'], 'only the raster picture fetched');
  const links = el.querySelectorAll('a.mr-file').map((a) => [a.getAttribute('href'), a.getAttribute('target')]);
  assert.deepEqual(links, [['https://email.inflite.ai/api/attachments/a-svg', '_blank'], ['https://email.inflite.ai/api/attachments/a-pdf', '_blank']], 'the SVG and the PDF at Mail’s address, in a new tab');
  assert.ok(r.calls.some((c) => c[0] === 'act' && c[2] === 'read'), 'an unread conversation marked read');
  assert.ok(el.querySelector('[data-act=reply]') && el.querySelector('[data-act=send]') && el.querySelector('[data-act=done]') && el.querySelector('[data-act=later]'), 'Reply, the quick reply’s Send, Done and Later');
  assert.ok(!/<iframe[^>]*srcdoc/i.test(el.outerHTML), 'no body in the page');
  v.destroy();
});
