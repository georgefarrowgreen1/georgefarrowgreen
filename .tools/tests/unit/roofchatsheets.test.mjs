// Chats' sheets under the roof (One roof, stage 3: roof/s3/spec.md §2.2, §2.6, S3-D7, S3-D8; UI-B): every opener of
// send.js, sheets.js, flight.js, media.js, scan.js and settings.js drawn on the stand-in DOM with the framework's real
// ui.js and sheet.js, from B0's fixtures (fixtures/chats.mjs) through a stand-in service answering the core's RPC table:
// each opens its data-sheet under data-app=chats and returns the handle; data never becomes markup (a name full of
// markup comes out escaped); no style attribute and no inline handler; the calls made are only the core's RPC methods
// and META's names. Send: the card checked as engineCard, the five not-ready states of S3-D7 (signin, key, locked,
// device, offline; and ended), a ready send sealed by sendRun with the toast "… You’re still here", a sheet closed
// unsent. Chat Settings: Privacy & Security is a plain link to /chats/in/#account (S3-D8), a switch saves one `me` key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOF, CHATS_ROOF, chatsSkip, roofSkip } from './fixtures/roof.mjs';
import { fakeDocument } from '../roofkit/fakedom.mjs';
import { world, ONE, IDS } from './fixtures/chats.mjs';

const skip = roofSkip || chatsSkip;
const FILES = ['send.js', 'sheets.js', 'flight.js', 'media.js', 'scan.js', 'settings.js'];
const read = (f) => readFileSync(new URL(f, CHATS_ROOF), 'utf8');
const uncomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\"'`])\/\/.*$/gm, '$1');
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await flush(); };
// a card that passes cards.js's normCard (B0's ONE.Card is the boundary's shape, not a sendable one)
const NOW = Date.UTC(2026, 10, 3, 9, 41);
const CARD = { v: 1, kind: 'weather', from: 'weather', at: NOW, say: 'Rain in Leeds from 15:00.', snap: { place: 'Leeds', tz: 'Europe/London', temp: 12, code: 61, isDay: true, rain: { now: true } } };
const BAD = '<img src=x onerror=alert(1)>';

// ---- the stand-in DOM and the framework's real builders and sheet ----
let ui, createSheets, RPC, META;
async function setup() {
  globalThis.document = fakeDocument();
  globalThis.matchMedia ??= () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
  globalThis.cancelAnimationFrame ??= (t) => clearTimeout(t);
  globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
  globalThis.fetch = async () => { throw new Error('no network in this test: the sheets talk only to the core'); };
  ui ??= await import(new URL('ui.js', ROOF).href);
  ({ createSheets } = await import(new URL('sheet.js', ROOF).href));
  ({ RPC, META } = await import(new URL('core.js', CHATS_ROOF).href));
}

// ---- a stand-in service: the core's RPC table, answered from the fixtures; every call kept ----
function service({ state = 'ready', answers = {} } = {}) {
  const calls = [], subs = new Map(), W = world('ready');
  const base = {
    state: () => ({ state }),
    share: () => W.rows.map((r) => ({ ...r, can: !r.keyChanged })),
    rank: () => ({ [IDS.pat]: { why: 'Lives in Leeds', score: 3, best: true } }),
    sendRun: (spec) => ({ ok: true, say: 'Sent to Pat', sent: spec.pick, failed: [] }),
    safety: () => ONE.Safety,
    verify: () => ({ ok: true }), trust: () => ({ ok: true }),
    photo: () => new Blob(['x'], { type: 'image/png' }),
    sendText: () => ({ id: 'm-new' }), sendBlob: () => ({ id: 'm-new' }), react: () => ({ ok: true }), recall: () => ({ ok: true }),
    meta: (name, args) => ({
      'flight-log': { sent: 12, received: 9, flying: 1, km: 5400, hours: 30, kinds: { standard: 8, swift: 4 }, longest: { km: 800, place: BAD }, dodged: 2, lost: 1, recalled: 0, since: NOW - 864e5 * 40,
        badges: [{ id: 'first', name: BAD, desc: 'First flight', earned: true }], passport: { countries: 2, seas: 1, places: [{ name: 'France', at: NOW }, { name: 'the North Sea', sea: true, at: NOW }] } },
      loft: { loft: { km: 900, landed: 4, countries: 2, postmarks: 1, birds: [{ name: BAD, rank: 'Courier', since: NOW }], hall: [], badges: [], kit: [], looks: [] } },
      feathers: { feathers: 30, items: [{ id: 'scarf', name: 'Scarf', emoji: '🧣', price: 20 }], recent: [] },
      news: { news: [{ kind: 'rank', who: { id: IDS.pat, name: BAD }, text: BAD, at: NOW }] },
      skies: { birds: [{ lat: 51, lon: 0, kind: 'swift' }] },
      'gif-search': { gifs: [{ id: 'g1', title: BAD, w: 200, h: 100 }], next: null },
      gif: new Blob(['g'], { type: 'image/gif' }),
      'my-card': { card: CARD },
    })[name] ?? { ok: true, me: W.me },
  };
  const call = async (m, ...a) => {
    calls.push([m, ...a]);
    if (!RPC[m]) throw Object.assign(new Error('no'), { why: 'no' });
    if (m === 'meta' && !META[a[0]]) throw Object.assign(new Error('no'), { why: 'no' });
    const f = answers[m] ?? base[m];
    const v = typeof f === 'function' ? await f(...a) : f;
    if (v instanceof Error) throw v;
    return v;
  };
  const on = (topic, fn) => { const l = subs.get(topic) || new Set(); l.add(fn); subs.set(topic, l); return () => l.delete(fn); };
  const emit = (topic, data) => { for (const f of [...(subs.get(topic) || [])]) f(data); };
  return { svc: { call, on, get state() { return state; } }, calls, emit, set: (s) => { state = s; } };
}
async function storeOf(mut) {
  const { createStore } = await import(new URL('store.js', CHATS_ROOF).href);
  const s = createStore(), W = world('ready');
  mut?.(W);
  for (const t of ['me', 'friends', 'groups', 'requests', 'rows', 'air', 'outbox', 'keywarn', 'unread']) s.apply({ topic: t, data: W[t] });
  for (const [id, c] of Object.entries(W.chats)) s.apply({ topic: `chat:${id}`, data: c });
  await flush();
  return s;
}
function fwOf() {
  const toasts = [], navs = [];
  const sheets = lastSheets = createSheets({});
  const fw = {
    app: 'chats', ui, screenEl: document.body,
    sheet: { open: (spec) => sheets.open({ app: 'chats', ...spec }) },
    toast: (t) => { toasts.push(String(t)); return { close() {} }; },
    nav: { go: (p, o) => navs.push([p, o]), href: (k, a) => `/chats/#${k}=${a}`, back() {}, depth: () => 0 },
    lazy: (fn) => Promise.resolve(fn('')),
    on: () => () => {}, visible: () => true, theme: () => 'light',
  };
  return { fw, toasts, navs, sheets };
}
const M = {};
// (the stand-in DOM doesn't bubble a click up to the dialog: a sheet is put away through its handle, as its ✕ does)
let lastSheets = null;
const shut = async () => { lastSheets?.top()?.close(); await settle(); };
async function ctxOf(opts = {}) {
  for (const f of FILES) M[f] ??= await import(new URL(f, CHATS_ROOF).href);
  const { fw, toasts, navs, sheets } = fwOf();
  const s = service(opts), store = await storeOf(opts.world);
  const open = {};
  const ctx = { fw, svc: s.svc, store, open, chat: IDS.pat };
  for (const f of ['sheets.js', 'flight.js', 'media.js', 'scan.js', 'settings.js']) for (const [k, v] of Object.entries(M[f])) if (/^(open|record|pick)/.test(k) && typeof v === 'function') open[k] = v;
  return { ctx, fw, toasts, navs, sheets, ...s };
}
const html = () => document.body.outerHTML;
const top = () => document.body.querySelectorAll('dialog.ifl-sheet').at(-1);
function clean(where) {
  const h = html();
  assert.ok(!/<img src=x/i.test(h.replace(/<!--raw-->[\s\S]*?<!--\/raw-->/g, '')), `${where}: markup from data became an element`);
  assert.ok(!/\sstyle="/.test(h.replace(/<!--raw-->[\s\S]*?<!--\/raw-->/g, '')), `${where}: a style attribute`);
  assert.ok(!/\son[a-z]+="/.test(h.replace(/<!--raw-->[\s\S]*?<!--\/raw-->/g, '')), `${where}: an inline handler`);
  for (const m of h.matchAll(/<!--raw-->([\s\S]*?)<!--\/raw-->/g)) {
    assert.ok(!/<img src=x/i.test(m[1]), `${where}: raw markup (cardview/qr) with data in it unescaped`);
    assert.ok(!/\son[a-z]+=|style="/.test(m[1].replace(/<path d="[^"]*"/g, '')), `${where}: raw markup with a handler or style`);
  }
}

test('the source keeps the module rules: no style attribute, no inline handler, no IFL, no document-wide lookup, no location change, every import( in fw.lazy', { skip }, () => {
  for (const f of FILES) {
    const s = uncomment(read(f));
    assert.ok(!/\bIFL\b/.test(s), `${f}: no IFL`);
    assert.ok(!/style=\\?["']|setAttribute\(\s*["'`]style/.test(s), `${f}: no style attribute`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(s), `${f}: no inline handler`);
    assert.ok(!/\bdocument\s*\.\s*(?:getElementById|querySelector|querySelectorAll)\s*\(/.test(s), `${f}: no document-wide lookup`);
    assert.ok(!/\blocation\s*(?:\.\s*(?:assign|replace|reload)\s*\(|(?:\.\s*(?:href|hash))?\s*=(?!=))/.test(s), `${f}: no location change`);
    assert.ok(!/\bindexedDB\b|\blocalStorage\b|\bsessionStorage\b|serviceWorker/.test(s), `${f}: no storage of its own, no service worker`);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(s), `${f}: no request of its own (the core makes every one)`);
    for (const m of s.matchAll(/\bimport\s*\(/g)) assert.match(s.slice(Math.max(0, m.index - 40), m.index + 7), /fw\.lazy\(\s*\(\s*\w*\s*\)\s*=>\s*import\($/, `${f}: import( only inside fw.lazy((q) => import(…))`);
    assert.ok(!/URL\.createObjectURL/.test(s) || f === 'media.js', `${f}: object URLs only in media.js`);
  }
});

test('every opener opens its own sheet (data-sheet, data-app=chats), returns the handle, escapes what it’s given, and asks only the core’s methods', { skip }, async () => {
  await setup();
  const BADW = (W) => { W.friends[0].name = BAD; W.friends[0].handle = 'x"><b>'; W.groups[0].name = BAD; W.me.place = BAD; W.me.birds = [{ id: 'b1', name: BAD, rank: 'Courier', km: 600, flights: 3, longest: 300, stamina: 20 }]; W.chats[IDS.pat].msgs[2] = { ...W.chats[IDS.pat].msgs[2], card: CARD }; };
  const cases = [
    ['sheets.js', 'openFriendInfo', [IDS.pat], 'friendinfo'], ['sheets.js', 'openGroupInfo', [IDS.group], 'groupinfo'],
    ['sheets.js', 'openGroupAdd', [IDS.group], 'groupadd'], ['sheets.js', 'openGroupRename', [IDS.group], 'grouprename'],
    ['sheets.js', 'openSafety', [IDS.pat], 'safety'], ['sheets.js', 'openWhoHas', ['m-g-2'], 'whohas'],
    ['sheets.js', 'openView', ['m-p-4'], 'view'], ['sheets.js', 'openSchedule', [IDS.pat], 'schedule'],
    ['sheets.js', 'openTimeTalk', [IDS.pat], 'timetalk'], ['sheets.js', 'openFromApps', [IDS.pat], 'fromapps'],
    ['sheets.js', 'openHold', [{ kind: 'msg', chatId: IDS.pat, msgId: 'm-p-3' }], 'hold'],
    ['flight.js', 'openFlightLog', [], 'flightlog'], ['flight.js', 'openPassport', [], 'passport'], ['flight.js', 'openMap', ['m-air-1'], 'map'],
    ['flight.js', 'openSkies', [], 'skies'], ['flight.js', 'openLookUp', [], 'lookup'], ['flight.js', 'openWay', [IDS.pat], 'way'],
    ['flight.js', 'openMoonPick', ['moon'], 'moonpick'], ['flight.js', 'openBirds', [], 'birds'], ['flight.js', 'openBird', ['b1'], 'bird'],
    ['flight.js', 'openBirdName', [], 'birdname'], ['flight.js', 'openLoft', [IDS.pat], 'loft'], ['flight.js', 'openFeathers', [], 'feathers'],
    ['flight.js', 'openNews', [], 'news'], ['media.js', 'openGifs', [IDS.pat], 'gifs'], ['media.js', 'recordVoice', [IDS.pat], 'voice'],
    ['scan.js', 'openScan', [], 'scan'], ['settings.js', 'openChatSettings', [], 'chatsettings'], ['settings.js', 'openChatSettings', ['location'], 'chatsettings'],
    ['settings.js', 'openChatSettings', ['credits'], 'chatsettings'],
  ];
  globalThis.URL.createObjectURL ??= () => 'blob:x';
  globalThis.URL.revokeObjectURL ??= () => {};
  for (const [file, name, args, sheet] of cases) {
    const { ctx, calls } = await ctxOf({ world: BADW });
    const h = M[file][name](ctx, ...args);
    await settle();
    assert.ok(h && typeof h.close === 'function' && h.el, `${name} returns the sheet's handle`);
    assert.equal(h.el.dataset.sheet, sheet, `${name}: data-sheet=${sheet}`);
    assert.equal(h.el.dataset.app, 'chats', `${name}: under data-app=chats`);
    assert.ok(h.body.textContent.length > 0, `${name} draws something`);
    clean(name);
    for (const [m, n] of calls) { assert.ok(RPC[m], `${name}: ${m} is a method of the core's RPC table`); if (m === 'meta') assert.ok(META[n], `${name}: meta ${n} is one of META's names`); }
    h.now?.() ?? h.close();
    await settle(2);
  }
});

test('Chat Settings: Privacy & Security is a plain link to Chat’s own page; a switch saves one `me` key; Location and credits are pages of it', { skip }, async () => {
  await setup();
  const { ctx, calls } = await ctxOf();
  const h = M['settings.js'].openChatSettings(ctx);
  const a = h.body.querySelector('a[data-act=account]');
  assert.ok(a, 'the Privacy & Security row is a link');
  assert.equal(a.getAttribute('href'), '/chats/in/#account');
  assert.ok(!h.body.querySelector('[data-key=appearance]') && !/Appearance|Passkeys/.test(h.body.textContent.replace(/Passkeys, signed-in/, '')), 'no Appearance, no passkeys here');
  const sw = h.body.querySelector('[data-key=risky] input');
  sw.checked = true; sw.dispatch('change');
  await settle();
  assert.deepEqual(calls.filter((c) => c[0] === 'meta').at(-1), ['meta', 'me', { method: 'PATCH', risky: true }]);
  for (const k of ['showOnline', 'shareNews', 'approxLocation', 'shareTracker']) if (h.body.querySelector(`[data-key=${k}]`)) assert.ok(META.me.methods.PATCH.b.includes(k), `${k} is a key META lets me PATCH`);
  h.body.querySelector('[data-go=location]').click();
  assert.ok(h.body.querySelector('[data-page=location] select[data-act=city]'), 'Location: a city to choose');
  h.pop();
  h.body.querySelector('[data-go=credits]').click();
  assert.ok(h.body.querySelector('[data-page=credits] a[href="https://open-meteo.com/"]'), 'credits: the sources, linked');
  h.now();
});

test('Send: the card checked as engineCard; ready → friends ranked, picked, sealed by sendRun, “… You’re still here”; closed unsent → closed', { skip }, async () => {
  await setup();
  const S = M['send.js'] ?? (M['send.js'] = await import(new URL('send.js', CHATS_ROOF).href));
  const { packCard } = await import(new URL('../cards.js', CHATS_ROOF).href);
  assert.equal(S.engineCard('hi', 'not!packed'), null);
  assert.ok(S.engineCard('hi', packCard(CARD))?.card, 'a packed card passes');
  assert.ok(S.engineCard('hi', CARD)?.card, 'a card object passes');
  assert.deepEqual(S.shareOf('#share=Hi&card=abc&back=%2Fweather%2F'), { words: 'Hi', card: 'abc', back: '/weather/' });
  assert.equal(S.shareOf('#share=Hi&back=https%3A%2F%2Fevil.example%2F').back, null, 'back only ever a path of this site');
  assert.equal(S.stillHere('Sent to Pat'), 'Sent to Pat. You’re still here');

  { const { fw } = await ctxOf(), { svc } = service();
    assert.deepEqual(await S.openSend(fw, svc, { card: 'zzz', words: 'x' }), { ok: false, why: 'card' }, 'no card that passes: card'); }

  { const { fw, toasts, navs } = await ctxOf(), { svc, calls } = service();
    const p = S.openSend(fw, svc, { card: packCard(CARD), words: 'Rain later', to: IDS.pat, back: '/weather/' });
    await settle();
    const d = top();
    assert.equal(d.dataset.sheet, 'send');
    const rows = d.querySelectorAll('[data-k=to]');
    assert.equal(rows.length, 3, 'a row per friend and group');
    assert.equal(d.querySelector(`[data-k=to][data-id="${IDS.pat}"]`).getAttribute('aria-checked'), 'true', 'to: starts picked');
    assert.ok(d.querySelector(`[data-k=to][data-id="${IDS.ali}"]`).disabled, 'a changed key can’t be picked');
    assert.match(d.textContent, /Lives in Leeds/, 'the reason from rank');
    clean('send');
    d.querySelector('[data-act=sendgo]').click();
    const r = await p;
    assert.deepEqual(r, { ok: true, say: 'Sent to Pat' });
    const run = calls.find((c) => c[0] === 'sendRun');
    assert.deepEqual(run[1].pick, [IDS.pat]);
    assert.equal(run[1].words, 'Rain later');
    assert.ok(run[1].card && run[1].card.kind === 'weather', 'the card as normCard has it');
    assert.deepEqual(toasts, ['Sent to Pat. You’re still here']);
    assert.deepEqual(navs, [['/weather/', { replace: true }]], 'back where it came from');
    assert.ok(!calls.some((c) => c[0] === 'meta'), 'no metadata call carries the words'); }

  { const { fw } = await ctxOf(), { svc } = service();
    const p = S.openSend(fw, svc, { card: CARD, words: '' });
    await settle();
    await shut();
    assert.deepEqual(await p, { ok: false, why: S.CLOSED }); }
});

test('Send’s not-ready states (S3-D7): signin, key, ended → words + Sign In / Unlock Chats to Chat’s own page; device; locked → the sheet once ready; offline → the sheet with the outbox note', { skip }, async () => {
  await setup();
  const S = M['send.js'];
  for (const st of ['signin', 'key', 'ended', 'device', 'locked']) {
    const { fw } = await ctxOf(), { svc, calls } = service({ state: st });
    const p = S.openSend(fw, svc, { card: CARD, words: 'w' });
    await settle();
    const d = top(), e = d.querySelector(`[data-state=${st}]`);
    assert.ok(e, `${st}: its own words`);
    assert.match(e.textContent, new RegExp(S.NOT_READY[st].title.replace(/[’]/g, '.')));
    assert.ok(!calls.some((c) => c[0] === 'share' || c[0] === 'sendRun'), `${st}: nothing asked of the friends, nothing sealed`);
    const a = e.querySelector('a');
    if (st === 'signin' || st === 'key' || st === 'ended') {
      assert.equal(a?.getAttribute('href'), '/chats/in/#signin-start&then=%2Fchats%2F', `${st}: the trip to Chat's own page`);
      assert.equal(a.textContent, st === 'key' ? 'Unlock Chats' : 'Sign In');
      a.click();
      assert.deepEqual(await p, { ok: false, why: st }, `${st}: the card isn't kept`);
      await shut();
    } else {
      assert.ok(!a, `${st}: no sign-in`);
      await shut();
      assert.equal((await p).ok, false);
    }
  }
  // locked, then unlocked: the sheet draws as soon as the state is ready
  { const { fw } = await ctxOf(), s = service({ state: 'locked' });
    S.openSend(fw, s.svc, { card: CARD, words: 'w' });
    await settle();
    assert.ok(top().querySelector('[data-state=locked]'));
    s.set('ready'); s.emit('state', { state: 'ready' });
    await settle();
    assert.ok(!top().querySelector('[data-state=locked]') && top().querySelectorAll('[data-k=to]').length === 3, 'unlocked: the friends to send to');
    await shut(); }
  // offline: the sheet, with the outbox note
  { const { fw } = await ctxOf(), s = service({ state: 'offline' });
    S.openSend(fw, s.svc, { card: CARD, words: 'w' });
    await settle();
    const d = top();
    assert.equal(d.querySelector('[data-state=offline]')?.textContent, 'It’ll go when you’re back online');
    assert.equal(d.querySelectorAll('[data-k=to]').length, 3, 'offline: the friends all the same');
    await shut(); }
  // a send refused for a changed key: said, still open, nothing toasted
  { const { fw, toasts } = await ctxOf(), s = service({ answers: { sendRun: () => ({ ok: false, why: 'trust', sent: [], failed: [IDS.pat] }) } });
    S.openSend(fw, s.svc, { card: CARD, words: 'w', to: IDS.pat });
    await settle();
    top().querySelector('[data-act=sendgo]').click();
    await settle();
    assert.match(top().querySelector('[role=alert]').textContent, /safety number/);
    assert.deepEqual(toasts, []);
    await shut(); }
});

test('safety numbers: digits in fives, a QR code of the digits only, trust and verify through the core', { skip }, async () => {
  await setup();
  const Sh = M['sheets.js'];
  assert.deepEqual(Sh.fives('12345 67890 11'), ['12345', '67890', '11']);
  assert.equal(Sh.safetyCode(['12345', '67890']), 'inflight-safety:1:1234567890');
  { const { ctx, calls } = await ctxOf({ answers: { safety: { digits: '1'.repeat(60), verified: false, keyChanged: true } } });
    const h = Sh.openSafety(ctx, IDS.ali); await settle();
    assert.equal(h.body.querySelectorAll('.chs-digits span').length, 12);
    h.body.querySelector('[data-act=trust]').click(); await settle();
    assert.ok(calls.some((c) => c[0] === 'trust' && c[1] === IDS.ali)); h.now(); }
  { const { ctx, calls } = await ctxOf({ answers: { safety: { digits: '2'.repeat(60), verified: false, keyChanged: false } } });
    const h = Sh.openSafety(ctx, IDS.pat); await settle();
    assert.ok(h.body.querySelector('.chs-qr'), 'a code to scan');
    h.body.querySelector('[data-act=verify]').click(); await settle();
    assert.ok(calls.some((c) => c[0] === 'verify' && c[1] === IDS.pat && c[2] === true)); h.now(); }
  const Sc = M['scan.js'];
  const want = new Map([['a', 'inflight-safety:1:111'], ['b', 'inflight-safety:1:222']]);
  assert.deepEqual(Sc.matchCode('inflight-safety:1:222', want), { hit: 'b' });
  assert.deepEqual(Sc.matchCode('inflight-safety:1:999', want), { bad: true });
  assert.equal(Sc.matchCode('https://example.com', want), null);
});
