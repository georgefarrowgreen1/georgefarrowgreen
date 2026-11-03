// Mail's module contracts under the roof (One roof stage 4, s4/spec §4, §3.1–3.5, §10.1; frozen by B0-b, kept by MM): the
// inflite repo's email/public/roof/ exports CONTRACT 1, BUILD and NEWS equal to email/public/app.js's, SECTIONS equal to
// the connector's and the router's; each file its frozen names, openers and view signatures; store's keys, api's methods
// and the body frame's message constants as the spec fixes them; the connector says exactly the agreed words and lists
// exactly the static import graph from mail.js (12 files) and the 3 stylesheets, with the four lazy files as lazy (Mail's
// NET is none, s24-contracts §8); every dynamic import sits in fw.lazy(; §5.1's rules hold over the module (document and
// window reached through ownerDocument, defaultView or a name for them count as themselves), which never writes HTML,
// never names the body shell or posts a message but in bodyframe.js, makes blob: URLs only behind the pictures list,
// and never asks for a message's body; the body shell's files, Mail's Worker's /body route and hub gate, wrangler.jsonc
// and _headers have their stage-4 lines; Today's page has the Mail Notifications sheet; the kit's stand-in for Mail
// keeps the hub gate's refusals and answers the page's exact origin only. The byte budgets (§4.5) run always, stubs and
// all. Skips with mailSkip's reason where the inflite repo beside has no Mail module (email/public/roof/mail.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as fx from './fixtures/roof.mjs';

const IFL = fx.IFL;
const MAILDIR = IFL && new URL('email/', IFL), MOD = IFL && new URL('email/public/roof/', IFL);
// (fixtures/roof.mjs's mailSkip once the joint contracts have it; the same rule meanwhile)
const mailSkip = fx.mailSkip ?? (!IFL ? 'the inflite repo isn’t beside this one'
  : !existsSync(new URL('mail.js', MOD)) ? 'the inflite repo beside has no Mail module yet (email/public/roof/mail.js): its live branch, while this repo goes live first'
  : false);
const skip = mailSkip;
const read = (u) => readFileSync(u, 'utf8');
const uncomment = (src) => src.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, s) => s ?? '');
function exportsOf(src) {
  const s = uncomment(src), out = new Set();
  for (const m of s.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of s.matchAll(/\bexport\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); }
  return out;
}
const LITERAL = String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|-?\d+(?:\.\d+)?|\[[^\n]*\])`;
const lit = (src, name, exp) => { const m = new RegExp(String.raw`^[ \t]*${exp ? String.raw`export\s+` : String.raw`(?:export\s+)?`}const\s+${name}\s*=\s*${LITERAL}\s*;`, 'm').exec(src); return m ? Function(`"use strict"; return (${m[1]});`)() : undefined; };
const literalOf = (src, name) => lit(src, name, true);
const constOf = (src, name) => lit(src, name, false);
const jsFiles = () => readdirSync(MOD).filter((f) => f.endsWith('.js')).sort();
const cssFiles = () => readdirSync(MOD).filter((f) => f.endsWith('.css')).sort();
const src = (f) => read(new URL(f, MOD));
const pub = (p) => new URL(p.replace(/^\/mail\/roof\//, ''), MOD);   // /mail/roof/x → email/public/roof/x
// (the static graph from mail.js: relative imports only, staying in email/public/roof/; → /mail/roof/<file>)
function graphFrom(start) {
  const seen = new Set(), todo = [start], bad = [];
  while (todo.length) {
    const u = todo.pop();
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    for (const m of uncomment(read(u)).matchAll(/\b(?:import|export)\s+(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"']+)["']/g)) {
      const next = /^\.\/[\w.-]+\.js$/.test(m[1]) ? new URL(m[1], u) : null;
      if (next && next.href.startsWith(MOD.href)) todo.push(next); else bad.push(`${u.href.slice(MOD.href.length)}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], 'static imports are ./<file>.js beside it');
  return [...seen].map((h) => '/mail/roof/' + h.slice(MOD.href.length));
}
// (every import( is the body of fw.lazy(: `fw.lazy((q) => import("./x.js" + q))` (s24-contracts §7) or `fw.lazy(() => import("./x.js"))`)
const lazyOutside = (s0) => { const s = uncomment(s0), bad = []; for (const m of s.matchAll(/\bimport\s*\(/g)) if (!/fw\.lazy\(\s*(?:async\s*)?(?:\(\s*(?:[\w$]+\s*)?\)|[\w$]+)\s*=>\s*(?:await\s+)?$/.test(s.slice(Math.max(0, m.index - 60), m.index))) bad.push(s.slice(Math.max(0, m.index - 40), m.index + 30)); return bad; };
const lazyTargets = (s0) => [...uncomment(s0).matchAll(/fw\.lazy\(\s*(?:async\s*)?(?:\(\s*(?:[\w$]+\s*)?\)|[\w$]+)\s*=>\s*(?:await\s+)?import\(\s*["']\.\/([\w.-]+)["']\s*(?:\+\s*[\w$]+\s*)?\)/g)].map((m) => m[1]);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([;{},)\]])[ \t]*\/\/(?![^\n]*["'`])[^\n]*$/gm, '$1');
const gz = (files) => gzipSync(files.map((f) => strip(read(f))).join('\n'), { level: 9 }).length;

const SECTIONS = [['people', 'People'], ['updates', 'Updates'], ['later', 'Later'], ['done', 'Done']];
const FILES = ['mail.js', 'store.js', 'api.js', 'logic.js', 'actions.js', 'list.js', 'rows.js', 'menus.js', 'icons.js', 'reader.js', 'bodyframe.js', 'outbox.js'].map((f) => `/mail/roof/${f}`);
const CSS = ['mail.css', 'reader.css', 'mailsheets.css'].map((f) => `/mail/roof/${f}`);
// (s24-contracts §8: Mail's NET is none, so lazy is every fw.lazy target less files; it overrides s4/spec §4.4's two)
const LAZY = ['compose.js', 'signin.js', 'mailsettings.js', 'viewer.js'].map((f) => `/mail/roof/${f}`);
const R = skip || fx.roofSkip ? null : await import(new URL('router.js', fx.ROOF));
const { connector, CONNECTOR } = skip ? {} : await import(new URL('connector.js', MOD));
const stubs = () => jsFiles().filter((f) => exportsOf(src(f)).has('STUB'));

test('mail.js exports CONTRACT 1, BUILD and NEWS equal to email/public/app.js’s, SECTIONS equal to the connector’s and the router’s, and mount(root, fw)', { skip }, () => {
  const MAILJS = src('mail.js'), APP = read(new URL('public/app.js', MAILDIR));
  for (const n of ['CONTRACT', 'BUILD', 'NEWS', 'SECTIONS', 'mount']) assert.ok(exportsOf(MAILJS).has(n), `mail.js exports ${n}`);
  assert.match(uncomment(MAILJS), /\bexport\s+async\s+function\s+mount\s*\(\s*root\s*,\s*fw\s*\)/);
  assert.equal(literalOf(MAILJS, 'CONTRACT'), 1);
  assert.ok(constOf(APP, 'BUILD'), 'app.js has its BUILD');
  assert.equal(literalOf(MAILJS, 'BUILD'), constOf(APP, 'BUILD'), 'BUILD = email/public/app.js’s (the integrator raises both in one commit, S4-D19)');
  assert.equal(literalOf(MAILJS, 'NEWS'), constOf(APP, 'NEWS'), 'NEWS = email/public/app.js’s');
  assert.deepEqual(literalOf(MAILJS, 'SECTIONS'), SECTIONS);
  assert.deepEqual(connector.sections, SECTIONS);
  // (the router's REGISTRY.mail, once the joint contracts (C2) have it)
  if (R?.REGISTRY?.mail) {
    const M = JSON.parse(JSON.stringify(R.REGISTRY.mail));
    assert.deepEqual(M.sections, SECTIONS, 'REGISTRY.mail.sections');
    assert.deepEqual(M.aliases, connector.aliases, 'REGISTRY.mail.aliases');
    assert.equal(M.entry, '/mail/roof/mail.js');
    assert.equal(M.connector, '/mail/roof/connector.js');
    assert.deepEqual(M.css, CSS);
    assert.deepEqual(M.stay, ['thread'], 'the reader’s key stays in the address (s24-contracts §3: stay)');
    assert.equal(M.link, 'email');
  }
  // (every instance method, by name, in mount's answer)
  const s = uncomment(MAILJS);
  for (const k of ['show', 'hide', 'back', 'busy', 'flush', 'sendable', 'unmount']) assert.match(s, new RegExp(String.raw`\b${k}\s*(?:\(|:)`), `the instance has ${k}`);
});

test('each file exports its frozen names: openers, views, the store’s keys, the API’s methods and the body frame’s constants', { skip }, () => {
  const want = {
    'connector.js': ['CONNECTOR', 'connector'],
    'store.js': ['KEYS', 'STORAGE', 'SESSION', 'CAP', 'initial', 'createStore'],
    'api.js': ['MAIL', 'METHODS', 'ApiError', 'createApi'],
    'logic.js': ['escapeHtml', 'hue', 'initials', 'displayName', 'startOfDay', 'fmtListDate', 'fmtLongDate', 'fmtQuoteDate', 'attName', 'fmtSize', 'linkify', 'textToHtml', 'parseAddress', 'EMAIL_RE', 'mailtoDraft',
      'VIEWS', 'LENSES', 'FILTERS', 'lensCount', 'listTitle', 'DATES', 'ymd', 'dateOp', 'sayQuery', 'restoreQuery', 'at', 'laterChoices', 'fmtWhen', 'inView', 'mine', 'dedupe', 'replyDraft', 'PICTURES'],
    'actions.js': ['createActions'], 'list.js': ['view'], 'reader.js': ['view'], 'rows.js': ['threadRow', 'swipes', 'EDGE'],
    'menus.js': ['openViews', 'openLater', 'openRowMenu', 'openUnsub', 'confirm', 'SHEETS'], 'icons.js': ['icon', 'NAMES'],
    'outbox.js': ['createOutbox', 'UNDO_MS', 'FLUSH_MS'],
    'bodyframe.js': ['bodyFrame', 'listenFrames', 'themeAll', 'BODY', 'MSG', 'SANDBOX', 'ID_RE', 'H_START', 'H_MIN', 'H_MAX', 'MAILTO_MAX', 'SILENT_MS'],
    'compose.js': ['openCompose'], 'mailsettings.js': ['openSettings'], 'viewer.js': ['openViewer'], 'signin.js': ['signIn', 'finishSignIn'],
  };
  for (const [f, names] of Object.entries(want)) {
    assert.ok(existsSync(new URL(f, MOD)), `email/public/roof/${f}`);
    const has = exportsOf(src(f));
    for (const n of names) assert.ok(has.has(n), `email/public/roof/${f} exports ${n}`);
  }
  const SIG = [['list.js', /export\s+function\s+view\s*\(\s*el\s*,\s*ctx\s*\)/], ['reader.js', /export\s+function\s+view\s*\(\s*el\s*,\s*ctx\s*\)/],
    ['compose.js', /export\s+(?:async\s+)?function\s+openCompose\s*\(\s*ctx\s*,\s*init\b/], ['mailsettings.js', /export\s+(?:async\s+)?function\s+openSettings\s*\(\s*ctx\s*,\s*page\b/],
    ['viewer.js', /export\s+(?:async\s+)?function\s+openViewer\s*\(\s*ctx\s*,\s*files\s*,\s*i\b/], ['signin.js', /export\s+(?:async\s+)?function\s+signIn\s*\(\s*ctx\s*\)/],
    ['signin.js', /export\s+async\s+function\s+finishSignIn\s*\(\s*ctx\s*,\s*code\s*\)/], ['menus.js', /export\s+(?:async\s+)?function\s+openViews\s*\(\s*ctx\s*\)/],
    ['menus.js', /export\s+(?:async\s+)?function\s+openLater\s*\(\s*ctx\s*,\s*ids\s*\)/], ['menus.js', /export\s+(?:async\s+)?function\s+openRowMenu\s*\(\s*ctx\s*,\s*t\s*\)/],
    ['menus.js', /export\s+(?:async\s+)?function\s+openUnsub\s*\(\s*ctx\s*,\s*t\s*\)/], ['menus.js', /export\s+(?:async\s+)?function\s+confirm\s*\(\s*ctx\s*,\s*spec\s*\)/],
    ['bodyframe.js', /export\s+function\s+bodyFrame\s*\(\s*message\s*,\s*\{\s*theme\b[^}]*\bimages\b[^}]*\beager\b/], ['icons.js', /export\s+function\s+icon\s*\(\s*name\s*\)/],
    ['actions.js', /export\s+function\s+createActions\s*\(\s*ctx\s*\)/], ['outbox.js', /export\s+function\s+createOutbox\s*\(\s*ctx\s*\)/],
    ['store.js', /export\s+function\s+createStore\s*\(\s*init\b/], ['api.js', /export\s+function\s+createApi\s*\(\s*\{\s*base\b[^}]*\bonLost\b/]];
  for (const [f, re] of SIG) assert.match(uncomment(src(f)), re, `${f}: ${re}`);
  // (the store: §4.2's keys, S4-D16's storage names, the 256 KB cap)
  const store = src('store.js');
  assert.deepEqual(literalOf(store, 'KEYS'), ['access', 'me', 'counts', 'version', 'offline', 'updatedAt', 'lens', 'filter', 'address', 'box', 'query', 'list', 'threadId', 'thread', 'layout', 'compose', 'sending', 'outbox']);
  assert.equal(literalOf(store, 'CAP'), 262144);
  assert.match(store, /export const STORAGE = \{ replies: "mail:replies", unsent: "mail:unsent", outbox: "mail:outbox", remoteImages: "mail:remote-images", lens: "mail:lens" \};/);
  assert.match(store, /export const SESSION = \{ verifier: "mail:signin-verifier" \};/);
  // (the API: §4.7's methods, each in createApi's answer; MAIL by modules.js's rule)
  const api = src('api.js');
  const METHODS = ['session', 'me', 'version', 'counts', 'settings', 'handback', 'threads', 'search', 'thread', 'meta', 'draft', 'batch', 'emptyTrash', 'unsubInfo', 'unsubscribe', 'remove', 'saveSettings', 'updateAddress', 'findContacts', 'saveDraft', 'sendDraft', 'sent', 'picture', 'fileUrl', 'rawUrl'];
  assert.deepEqual(literalOf(api, 'METHODS'), METHODS);
  for (const k of METHODS) assert.match(uncomment(api), new RegExp(String.raw`\b${k}\s*(?::|\()`), `api has ${k}`);
  for (const k of ['checkAddress', 'logout', 'pushKey', 'pushSubscribe', 'pushUnsubscribe', 'message', 'send', 'createAddress', 'deleteAddress', 'contacts', 'count', 'threadAction']) assert.ok(!new RegExp(String.raw`(?<![\w.])${k}\s*:\s*(?:async\s*)?(?:\(|[\w$]+\s*=>|function\b)`).test(uncomment(api)), `api has no ${k} (§4.7)`);
  assert.ok(!/addresses\/check/.test(uncomment(api)), 'no address check: it would put what was typed into a URL, and the module makes no addresses (B0-b review I6)');
  assert.match(api, /export const MAIL = `\$\{location\.protocol\}\/\/email\.\$\{location\.host\.replace\(\/\^next\\\.\/, ""\)\}`;/);
  // (the body frame's message and its limits, §3.2)
  const bf = src('bodyframe.js');
  assert.equal(literalOf(bf, 'BODY'), '/body/');
  assert.match(bf, /export const MSG = \{ ifl: "mailbody", v: 1 \};/);
  assert.equal(literalOf(bf, 'SANDBOX'), 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  assert.match(bf, /export const ID_RE = \/\^\[\\w-\]\{1,64\}\$\/;/);
  assert.deepEqual([literalOf(bf, 'H_START'), literalOf(bf, 'H_MIN'), literalOf(bf, 'H_MAX'), literalOf(bf, 'MAILTO_MAX'), literalOf(bf, 'SILENT_MS')], [120, 40, 40000, 2000, 6000]);
  assert.match(uncomment(bf), /import\s*\{\s*MAIL\s*\}\s*from\s*"\.\/api\.js"/, 'the frames’ origin is api.js’s MAIL');
  // (the sheets' names the hooks know, §2.2; the outbox's undo window, S4-D18; the swipe edge, D19; the icons, BI12)
  assert.match(src('menus.js'), /export const SHEETS = \{ views: "mail-views", later: "mail-later", rowMenu: "mail-rowmenu", unsub: "mail-unsub", confirm: "mail-confirm" \};/);
  assert.equal(literalOf(src('outbox.js'), 'UNDO_MS'), 6000);
  assert.equal(literalOf(src('outbox.js'), 'FLUSH_MS'), 2000);
  assert.equal(literalOf(src('rows.js'), 'EDGE'), 20);
  assert.deepEqual(literalOf(src('icons.js'), 'NAMES'), ['done', 'reply', 'reply-all', 'forward', 'flag', 'trash', 'attachment', 'more', 'later']);
  assert.match(src('logic.js'), /export const PICTURES = \/\^image\\\/\(png\|jpeg\|gif\|webp\|avif\|heic\|bmp\)\$\/;/);
});

test('the store: frozen snapshots, the initial state has exactly the keys', { skip }, async () => {
  const S = await import(new URL('store.js', MOD));
  assert.deepEqual(Object.keys(S.initial()).sort(), [...S.KEYS].sort());
  const st = S.createStore({ lens: 'later' });
  assert.ok(Object.isFrozen(st.get()));
  assert.equal(st.get().lens, 'later');
  assert.equal(st.get().filter, 'all');
  assert.equal(typeof st.on('lens', () => {}), 'function');
});

test('the connector: no imports, ≤ 4 KB, the agreed words, Mail’s sections and aliases, files, lazy and mini, and no search', { skip }, () => {
  const s = src('connector.js');
  assert.ok(!/\bimport\b/.test(uncomment(s)), 'no imports');
  assert.ok(Buffer.byteLength(s) <= 4096, `${Buffer.byteLength(s)} bytes`);
  assert.equal(CONNECTOR, 1);
  assert.equal(connector.app, 'mail');
  assert.equal(connector.name, 'Mail');
  assert.deepEqual(connector.shares, {
    cards: 'How many from people are waiting, and what’s back from Later: numbers only',
    search: 'Conversations already on screen, on this phone; asking Mail is your choice',
    notifications: 'New mail from people and what’s back from Later, through InFlite when you choose',
    actions: 'Open People, Updates, Later or Done, or a conversation',
    screens: 'People · Updates · Later · Done',
  });
  assert.deepEqual(connector.aliases, { thread: 'people', settings: 'people', signin: 'people' });
  assert.deepEqual(connector.lazy, LAZY);
  assert.ok(!('search' in connector), 'no search: Mail’s provider is only while mounted (S4-D9)');
  assert.equal(connector.mini(null), null);
  assert.equal(connector.mini({ cards: {} }), null);
  assert.equal(connector.mini({ cards: { mail: { people: 'x' } } }), null);
  assert.deepEqual(connector.mini({ cards: { mail: { people: 3, updates: 5, later: { n: 1, next: null } } } }), { kind: 'num', num: '3', label: 'From people' });
});

test('connector.files is exactly the static import graph from mail.js and the three stylesheets; lazy is the four lazy files, reached only through fw.lazy', { skip }, () => {
  const files = connector.files;
  assert.equal(new Set(files).size, files.length, 'no repeats');
  assert.deepEqual([...files].sort(), [...FILES, ...CSS].sort(), 'the 15 files (§4.4)');
  for (const f of [...files, ...LAZY]) assert.ok(existsSync(pub(f)), `${f} exists`);
  const graph = graphFrom(new URL('mail.js', MOD));
  assert.deepEqual(graph.sort(), [...FILES].sort(), 'the static graph from mail.js is the 12');
  assert.ok(!graph.includes('/mail/roof/connector.js'), 'mail.js never imports the connector');
  for (const f of LAZY) assert.ok(!graph.includes(f), `${f}: lazy, never static`);
  assert.deepEqual(lazyTargets(src('mail.js')).map((f) => `/mail/roof/${f}`).sort(), [...LAZY].sort(), 'mail.js reaches the four lazy files through fw.lazy, and lazy is exactly them (s24-contracts §8)');
  assert.deepEqual(files.filter((f) => LAZY.includes(f)), [], 'files ∩ lazy = ∅');
  assert.deepEqual([...files, ...LAZY].filter((f) => f.endsWith('.css')).sort(), [...CSS].sort());
  assert.deepEqual(cssFiles(), ['mail.css', 'mailsheets.css', 'reader.css'], 'no other stylesheet');
  assert.ok(files.length + LAZY.length <= 60, 'files ∪ lazy ≤ 60 (C11)');
});

test('every dynamic import in the module sits inside fw.lazy( (D21)', { skip }, () => {
  assert.deepEqual(lazyOutside('fw.lazy(() => import("./compose.js"))'), []);
  assert.deepEqual(lazyOutside('fw.lazy((q) => import("./compose.js" + q))'), []);
  assert.deepEqual(lazyTargets('fw.lazy((q) => import("./compose.js" + q)); fw.lazy(() => import("./viewer.js"))'), ['compose.js', 'viewer.js']);
  assert.equal(lazyOutside('await import("./compose.js")').length, 1);
  for (const f of jsFiles()) assert.deepEqual(lazyOutside(src(f)), [], `email/public/roof/${f}`);
});

// (document and window reached another way count as themselves: x.ownerDocument → document, x.ownerDocument.defaultView
// and x.defaultView → window, and a name given one of them (mail.js's `const doc = root.ownerDocument`) → that one)
function globals(s) {
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/(?:[\w$]+\s*\??\.\s*)*ownerDocument\s*\??\.\s*defaultView\b/g, 'window')
      .replace(/(?:[\w$]+\s*\??\.\s*)*ownerDocument\b/g, 'document')
      .replace(/(?:[\w$]+\s*\??\.\s*)+defaultView\b/g, 'window');
    for (const [, name, who] of [...s.matchAll(/(?<![.\w$])([\w$]+)\s*=\s*(document|window|globalThis|self)\s*(?=[;,)\n]|$)/gm)]) {
      if (name !== who) s = s.replace(new RegExp(String.raw`(?<![.\w$])${name.replace(/\$/g, '\\$')}(?![\w$])`, 'g'), who === 'document' ? 'document' : 'window');
    }
    if (s === before) break;
  }
  return s;
}
const GLOBAL_EV = (verb) => new RegExp(String.raw`(?:\b(window|document|globalThis|self)\s*\.\s*|(?<![.\w$]))${verb}EventListener\s*\(\s*(?:(["'\`])([\w:-]+)\2)?`, 'g');
const pairs = (s, verb) => [...s.matchAll(GLOBAL_EV(verb))].map((m) => [m[1] || 'window', m[3] ?? '(not a literal)']);
const sameGlobal = (a, b) => (a === 'document') === (b === 'document');

test('the module keeps §5.1’s rules and §4.3’s: no service worker, history, location change, confirm/alert, IFL, page selectors, today:* key, indexedDB, parent, innerHTML or document.title; window/document listeners removed', { skip }, () => {
  const RULES = [
    [/serviceWorker/, 'registers no service worker'],
    [/(?:\b(?:window|globalThis)\s*\.\s*|(?<![.\w$]))history\s*\./, 'no history.*'],
    [/(?:\b(?:window|globalThis|document)\s*\.\s*|(?<![.\w$]))location\s*(?:\.\s*(?:assign|replace|reload)\s*\(|(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=))/, 'no location changes (reading only)'],
    [/(?<![.\w$])(?:confirm|alert|prompt)\s*\(|\bwindow\s*\.\s*(?:confirm|alert|prompt)\s*\(/, 'no confirm()/alert()'],
    [/\bIFL\b/, 'no IFL'],
    [/\b(?:document|window)\s*\.\s*(?:getElementById|querySelector|querySelectorAll|getElementsBy\w+|elementsFromPoint|elementFromPoint)\s*\(/, 'no document.getElementById/querySelector (only root, fw.screenEl and what it made)'],
    [/["'`]today:/, 'no today:* key'],
    [/\bindexedDB\b/, 'no indexedDB (S4-D16)'],
    [/(?<![.\w$])parent\s*\./, 'no parent.'],
    [/["'`]#(?:hd|tabs)\b|\bifl-tab|\.ifh-/, 'never the header’s or the tab bar’s DOM'],
    [/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|\bdocument\s*\.\s*write/, 'no HTML written (§4.3)'],
    [/\bdocument\s*\.\s*title\b/, 'never document.title (§2.1)'],
  ];
  // (a function named confirm, as menus.js's, is a declaration, not a call to the page's confirm())
  const calls = (s) => s.replace(/\bfunction\s+confirm\s*\(/g, 'function _confirm(');
  for (const f of jsFiles()) {
    const s = globals(calls(uncomment(src(f))));
    for (const [re, why] of RULES) assert.ok(!re.test(s), `email/public/roof/${f}: ${why} (${re.exec(s)?.[0]})`);
    for (const [who, type] of pairs(s, 'add')) assert.ok(pairs(s, 'remove').some(([w, t]) => t === type && sameGlobal(w, who)), `email/public/roof/${f}: ${who}'s "${type}" listener removed (in unmount)`);
  }
  assert.ok(RULES[10][0].test('el.innerHTML = x') && RULES[10][0].test('a.insertAdjacentHTML("x", y)') && !RULES[10][0].test('el.textContent = x'));
  assert.ok(RULES[3][0].test('confirm("x")') && !RULES[3][0].test(calls('export function confirm(ctx, spec) {}; ctx.open.confirm(s)')));
  // (the aliases: each of these is caught; the review's mutations of B0-b, I3)
  const unremoved = (s) => { const g = globals(s); return pairs(g, 'add').filter(([w, t]) => !pairs(g, 'remove').some(([w2, t2]) => t2 === t && sameGlobal(w2, w))); };
  assert.deepEqual(unremoved('root.ownerDocument.defaultView.addEventListener("message", f)'), [['window', 'message']]);
  assert.deepEqual(unremoved('root.ownerDocument.addEventListener("keydown", f)'), [['document', 'keydown']]);
  assert.deepEqual(unremoved('const doc = root.ownerDocument;\ndoc.addEventListener("keydown", f);'), [['document', 'keydown']]);
  assert.deepEqual(unremoved('const doc = root.ownerDocument, win = doc.defaultView;\nwin.addEventListener("resize", f);'), [['window', 'resize']]);
  assert.deepEqual(unremoved('const doc = root.ownerDocument;\ndoc.addEventListener("keydown", f);\ndoc.removeEventListener("keydown", f);'), []);
  assert.deepEqual(unremoved('const w = el.ownerDocument.defaultView;\nw.addEventListener("message", f);\nwindow.removeEventListener("message", f);'), []);
  assert.ok(RULES[5][0].test(globals('const doc = root.ownerDocument;\ndoc.querySelector(".x")')), 'doc.querySelector');
  assert.ok(RULES[5][0].test(globals('el.ownerDocument.getElementById("x")')), 'ownerDocument.getElementById');
  assert.ok(RULES[9][0].test('doc.querySelector(".ifl-tab")') && RULES[9][0].test('q(".ifl-tabs")'), 'the tab bar’s classes');
  assert.ok(RULES[10][0].test(globals('const d = root.ownerDocument;\nd.write("x")')), 'd.write');
  assert.ok(!RULES[5][0].test(globals('const doc = root.ownerDocument;\nroot.querySelector(".x"); doc.createElement("p")')), 'root’s own selectors and createElement are fine');
});

test('only bodyframe.js names the body shell or posts a message; blob: URLs only in reader.js and viewer.js, behind the pictures list; never a message’s body', { skip }, () => {
  for (const f of jsFiles()) {
    const s = uncomment(src(f));
    if (f !== 'bodyframe.js') {
      assert.ok(!/\/body\//.test(s), `${f} names /body/ (only bodyframe.js, §3.2)`);
      assert.ok(!/\bpostMessage\b/.test(s), `${f} posts a message (only bodyframe.js, §3.2)`);
    }
    if (/\bcreateObjectURL\b/.test(s)) {
      assert.ok(['reader.js', 'viewer.js'].includes(f), `${f} makes a blob: URL (only reader.js and viewer.js, S4-D17)`);
      assert.match(s, /\bPICTURES\b/, `${f}: blob: URLs only behind logic.PICTURES (S4-D17)`);
    }
    assert.ok(!/(?<![\w$])(?:api|ctx\.api)\s*\.\s*message\s*\(/.test(s), `${f} asks api.message( (§3.1)`);
    // (/api/messages/<id> only as …/meta; in api.js also rawUrl's navigation address and remove's DELETE)
    const lines = s.split('\n');
    for (const [i, line] of lines.entries()) for (const m of line.matchAll(/\/api\/messages\//g)) {
      const rest = line.slice(m.index + 14);
      const ok = /^\$\{[^}]*\}\/meta\b/.test(rest) || (f === 'api.js' && ((/\brawUrl\b/.test(line) && /^\$\{[^}]*\}\/raw`/.test(rest)) || /\bremove\b/.test(line)));
      assert.ok(ok, `${f}:${i + 1}: /api/messages/… is only …/meta (§3.1): ${line.trim()}`);
    }
    // (Mail's keys at inflite.ai are named once, in store.js's STORAGE and SESSION, S4-D16)
    if (f !== 'store.js') assert.ok(!/["'`]mail:/.test(s), `${f}: a mail:* key outside store.js`);
  }
});

test('the module’s CSS: nothing on :root, html or body, every rule under .m-mail or a Mail sheet', { skip }, () => {
  for (const f of cssFiles()) {
    const css = src(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const sel = m[1].trim();
      if (sel.startsWith('@') || /^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(sel)) continue;
      assert.ok(!/(^|[\s,>+~(])(?::root|html|body)(?![\w-])/.test(sel), `email/public/roof/${f}: ${sel}`);
      for (const one of sel.split(',')) assert.ok(/\.m-mail\b|\[data-app=["']?mail["']?\]/.test(one), `email/public/roof/${f}: ${one.trim()} is under .m-mail or .ifl-sheet[data-app=mail]`);
    }
  }
});

test('no style attribute and no inline handler in the module (the page’s CSP refuses both)', { skip }, () => {
  for (const f of jsFiles()) {
    const s = uncomment(src(f));
    assert.ok(!/style=\\?["']/.test(s), `${f} writes a style attribute`);
    assert.ok(!/setAttribute\(\s*["'`]style["'`]/.test(s), `${f} sets a style attribute`);
    assert.ok(!/\.style\s*\.\s*(?!setProperty\b|removeProperty\b)[a-zA-Z]+\s*=/.test(s), `${f}: element.style.x = … (only setProperty("--…"), §4.3)`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(s), `${f} writes an inline handler`);
  }
});

test('the body shell, Mail’s Worker’s /body route and hub gate, wrangler.jsonc and _headers have their stage-4 lines', { skip }, async () => {
  for (const f of ['index.html', 'body.js', 'body.css']) assert.ok(existsSync(new URL(`public/body/${f}`, MAILDIR)), `email/public/body/${f}`);
  assert.match(read(new URL('public/body/index.html', MAILDIR)), /data-parents=/, 'the shell has data-parents');
  assert.match(uncomment(read(new URL('src/body.js', MAILDIR))), /export\s+async\s+function\s+body\s*\(\s*request\s*,\s*env\s*\)/);
  const gate = uncomment(read(new URL('src/hubgate.js', MAILDIR)));
  assert.match(gate, /export\s+function\s+hubOrigins\s*\(\s*env\s*\)/);
  assert.match(gate, /export\s+function\s+hubOf\s*\(\s*request\s*,\s*env\s*\)/);
  const idx = uncomment(read(new URL('src/index.js', MAILDIR)));
  assert.match(idx, /import\s*\{\s*body\s*\}\s*from\s*"\.\/body\.js"/);
  assert.match(idx, /import\s*\{[^}]*\bhubOf\b[^}]*\}\s*from\s*"\.\/hubgate\.js"/);
  const conf = JSON.parse(read(new URL('wrangler.jsonc', MAILDIR)).replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
  for (const p of ['/body', '/body/*', '/roof/*']) assert.ok(conf.assets.run_worker_first.includes(p), `run_worker_first has ${p}`);
  const h = read(new URL('public/_headers', MAILDIR));
  assert.match(h, /\n\/body\/\*\n\s+Content-Security-Policy: [^\n]*frame-ancestors 'none'/, '_headers: /body/* frame-ancestors none (the backstop, §3.4)');
  assert.match(h, /\n\/roof\/\*\n\s+Cache-Control: no-cache/, '_headers: /roof/* no-cache');
  // (Mail's Worker: every /body path 404 with no hub switched on, the stub's answer and the real one's alike; nothing
  // under /body reaches Mail's page)
  const worker = (await import(new URL('src/index.js', MAILDIR).href)).default;
  const asked = [];
  const ASSETS = { fetch: async (r) => { asked.push(new URL(r.url).pathname); return new Response('<!doctype html><title>Mail</title>', { headers: { 'content-type': 'text/html' } }); } };
  for (const p of ['/body', '/body/', '/body/index.html', '/body/x', '/body/body.js']) {
    const res = await worker.fetch(new Request(`https://email.inflite.ai${p}`), { ASSETS, HUB_ORIGIN: 'https://inflite.ai https://next.inflite.ai' }, { waitUntil() {} });
    if (p !== '/body/body.js') assert.equal(res.status, 404, `${p}: 404 with no hub switched on`);
    assert.ok(!/<title>Mail<\/title>/.test(await res.text()), `${p}: never Mail’s page`);
  }
});

test('Today’s page has the Mail Notifications sheet in the frozen markup, and mailnotify.js its opener', { skip }, () => {
  const html = read(new URL('today/public/index.html', IFL));
  assert.ok(html.includes('<dialog class="ifl-sheet" id="sh-mailnotify" aria-labelledby="sh-mailnotify-t"><div class="ifs-grab" aria-hidden="true"></div><header class="ifs-head"><h2 id="sh-mailnotify-t" tabindex="-1">Mail Notifications</h2><button class="ifs-btn" type="button" data-close aria-label="Close">✕</button></header><div class="ifs-body" id="mlnBody"></div></dialog>'));
  assert.match(uncomment(read(new URL('today/public/mailnotify.js', IFL))), /export\s+(?:async\s+)?function\s+openMailNotify\s*\(\s*F\s*\)/);
});

test('the kit’s stand-in for Mail answers §4.7 and keeps the hub gate’s refusals', { skip }, async () => {
  const { mailMock, routeMail, MAIL_KIT } = await import('../mocks/mailmock.mjs');
  assert.equal(MAIL_KIT, 'http://email.kit.test');
  assert.equal(typeof routeMail, 'function');
  const m = mailMock();
  const call = async (method, path, body, headers = {}, nav = false) => {
    let got;
    await m.handle({ request: () => ({ url: () => MAIL_KIT + path, method: () => method, headers: () => ({ origin: 'http://kit.test', ...headers }), postData: () => (body ? JSON.stringify(body) : null), isNavigationRequest: () => nav }), fulfill: (r) => { got = r; }, abort: () => { got = { status: 0 }; } });
    assert.equal(got.headers?.['access-control-allow-origin'], 'http://kit.test', `${method} ${path}: CORS for the page`);
    let data = got.body;
    try { data = JSON.parse(got.body); } catch {}
    return { status: got.status, data };
  };
  const W = { 'x-inflite': '1' };
  const t = await call('GET', '/api/threads?view=all&category=people');
  assert.equal(t.status, 200);
  assert.ok(t.data.threads.length && t.data.threads.every((x) => x.latestId), 'summaries with latestId');
  assert.equal((await call('GET', '/api/threads?q=Leo')).status, 403, 'no q in a GET');
  assert.equal((await call('GET', '/api/contacts?q=Leo')).status, 403, 'no q in a GET');
  assert.equal((await call('GET', '/api/messages/demo-1')).status, 403, 'no body');
  assert.equal((await call('GET', '/api/messages/demo-1/raw')).status, 403, 'no raw by fetch');
  assert.equal((await call('POST', '/api/drafts', {})).status, 403, 'a write needs X-Inflite');
  assert.equal((await call('POST', '/api/logout', {}, W)).status, 403);
  assert.equal((await call('POST', '/api/addresses', { local: 'x' }, W)).status, 403);
  assert.equal((await call('PATCH', '/api/addresses/hello%40inflite.ai', { isDefault: true }, W)).status, 403);
  assert.equal((await call('GET', '/api/addresses/check?local=x')).status, 403, 'no address check (a typed word in a URL)');
  const meta = await call('GET', '/api/messages/demo-1/meta');
  assert.equal(meta.status, 200);
  assert.ok(!('html' in meta.data) && !('text' in meta.data), '/meta has no body');
  assert.deepEqual(Object.keys(meta.data.attachments[0]).sort(), ['filename', 'id', 'size', 'type']);
  assert.deepEqual((await call('POST', '/api/threads/search', { q: 'Lisbon' }, W)).data.threads.map((x) => x.subject), ['Your trip to Lisbon is confirmed']);
  assert.equal((await call('POST', '/api/threads/search', { q: 'Lisbon', count: 1 }, W)).data.count, 1);
  assert.equal((await call('GET', '/api/attachments/a1')).status, 200, 'a PNG by CORS');
  assert.equal((await call('GET', '/api/attachments/a8')).status, 403, 'an SVG never by CORS (S4-D17)');
  assert.equal((await call('GET', '/api/attachments/a6', null, {}, true)).status, 200, 'a PDF at Mail’s address');
  const old = m.msgs.find((x) => x.subject === 'Re: Something old');
  assert.equal((await call('GET', `/api/drafts/${old.id}`)).data.quoteOld, true);
  const d = await call('POST', '/api/drafts', { from: 'hello@inflite.ai', to: [{ email: 'leo.martins@fastmail.com' }], subject: 'Re: Dinner Friday?', text: 'Yes', quote: { of: 'demo-3', mode: 'reply' }, attachments: [{ ref: 'a1' }] }, W);
  const back = await call('GET', `/api/drafts/${d.data.id}`);
  assert.deepEqual(back.data.compose.quote, { of: 'demo-3', mode: 'reply' });
  assert.equal(back.data.compose.files[0].filename, 'Toolbar-v2.png');
  assert.equal((await call('POST', '/api/send', { draftId: d.data.id, key: 'k-12345678' }, W)).status, 200);
  assert.deepEqual((await call('GET', '/api/sends?keys=k-12345678')).data.sent, ['k-12345678']);
  assert.equal((await call('POST', '/api/send', { draftId: d.data.id, key: 'k-12345678' }, W)).status, 404, 'a draft sends once');
  assert.equal((await call('POST', '/api/threads/batch', { ids: ['t-1'], action: 'done' }, W)).status, 200);
  m.set({ access: 'reauth' });
  const lost = await call('GET', '/api/counts');
  assert.equal(lost.status, 401);
  assert.equal(lost.data.access, 'reauth');
});

test('the kit’s stand-in for Mail answers the page’s exact origin only (§3.5): any other Origin gets 403 and no CORS headers', { skip }, async () => {
  const { mailMock, MAIL_KIT } = await import('../mocks/mailmock.mjs');
  const m = mailMock({ origin: 'http://kit.test' });
  const ask = async (method, path, origin, nav = false) => {
    let got;
    await m.handle({ request: () => ({ url: () => MAIL_KIT + path, method: () => method, headers: () => (origin ? { origin } : {}), postData: () => null, isNavigationRequest: () => nav }), fulfill: (r) => { got = r; }, abort: () => { got = { status: 0, headers: {} }; } });
    return got;
  };
  for (const o of ['http://evil.test', 'http://kit.test.evil.test', 'https://kit.test', 'http://next.kit.test', 'null']) {
    for (const [method, path] of [['GET', '/api/counts'], ['OPTIONS', '/api/drafts'], ['GET', '/api/attachments/a1']]) {
      const r = await ask(method, path, o);
      assert.equal(r.status, 403, `${method} ${path} from ${o}: 403`);
      assert.equal(r.headers['access-control-allow-origin'], undefined, `${method} ${path} from ${o}: no Allow-Origin`);
      assert.equal(r.headers['access-control-allow-credentials'], undefined, `${method} ${path} from ${o}: no Allow-Credentials`);
    }
  }
  const ok = await ask('GET', '/api/counts', 'http://kit.test');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['access-control-allow-origin'], 'http://kit.test');
  assert.equal(ok.headers['access-control-allow-credentials'], 'true');
  assert.equal((await ask('OPTIONS', '/api/drafts', 'http://kit.test')).status, 204);
  const nav = await ask('GET', '/api/attachments/a6', null, true);
  assert.equal(nav.status, 200, 'a navigation (no Origin) at Mail’s address');
  assert.equal(nav.headers['access-control-allow-origin'], undefined);
  // (the stand-in's own origin option is the one it answers)
  const other = mailMock({ origin: 'http://other.test' });
  let got; await other.handle({ request: () => ({ url: () => MAIL_KIT + '/api/counts', method: () => 'GET', headers: () => ({ origin: 'http://kit.test' }), postData: () => null, isNavigationRequest: () => false }), fulfill: (r) => { got = r; }, abort: () => {} });
  assert.equal(got.status, 403, 'mailMock({ origin }) gates on that origin');
});

// (every budget runs always, stubs and all: a stub is far under any of them, so a STUB = true left behind in one file can
// never turn the budgets off; that none is left is the integrator's check, B0-b review I5)
test('the transfer budgets (§4.5): static JS ≤ 55 KB, CSS ≤ 12 KB, compose ≤ 12, mailsettings ≤ 10, viewer ≤ 8, signin ≤ 2, bodyframe ≤ 3, icons ≤ 2, the body shell ≤ 8 (gzip -9, comments stripped)', { skip }, (t) => {
  const left = stubs();
  if (left.length) t.diagnostic(`still stubs (budgeted as they are): ${left.join(', ')}`);
  const one = (f) => gz([new URL(f, MOD)]);
  const budget = [['static JS', gz(FILES.map(pub)), 55], ['CSS', gz(CSS.map(pub)), 12], ['compose.js', one('compose.js'), 12], ['mailsettings.js', one('mailsettings.js'), 10],
    ['viewer.js', one('viewer.js'), 8], ['signin.js', one('signin.js'), 2], ['bodyframe.js', one('bodyframe.js'), 3], ['icons.js', one('icons.js'), 2],
    ['body shell', gz(['index.html', 'body.js', 'body.css'].map((f) => new URL(`public/body/${f}`, MAILDIR))), 8]];
  for (const [what, n, kb] of budget) assert.ok(n <= kb * 1024, `${what}: ${n} B gzipped, over ${kb} KB`);
});
