// Mail's logic under the roof keeps in step with Mail on its own (One roof stage 4, s4/spec §4.1, §10.1): the same-named
// functions are taken out of the inflite repo's email/public/app.js by name (their source, brackets matched) and run
// beside email/public/roof/logic.js's ports on fixed inputs, with London's clock stood in at fixed times: the dates
// (list, long, quote, Later's "when", the day headings), laterChoices at several clocks (weekday morning, evening, a
// weekend, across the clocks going forward), inView over every view and state, the search tokeniser (dateOp, sayQuery,
// restoreQuery, typingToken, replaceTyping), mailtoDraft, parseAddress, linkify and textToHtml, the people line, the swipe's
// lead, the lens counts and titles, and replyDraft: everything but its quote, which under the roof is { of, mode } for
// Mail's server to build (S4-D4), and its forwarded files, which are { ref } to Mail's own copy. Skips with mailSkip's
// reason where the inflite repo beside has no Mail module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as fx from './fixtures/roof.mjs';

process.env.TZ = 'Europe/London';
const IFL = fx.IFL, MOD = IFL && new URL('email/public/roof/', IFL);
const skip = fx.mailSkip ?? (!IFL ? 'the inflite repo isn’t beside this one'
  : !existsSync(new URL('mail.js', MOD)) ? 'the inflite repo beside has no Mail module yet (email/public/roof/mail.js): its live branch, while this repo goes live first'
  : false);
const L = skip ? null : await import(new URL('logic.js', MOD));
// (Mail's page, with its later parts, where it has them: email/public/parts/, each part's own indented by two spaces too,
// and read first, as what app.js has of a part's own is only what asks the part for it)
const PARTS = !skip && existsSync(new URL('email/public/parts/', IFL)) ? readdirSync(new URL('email/public/parts/', IFL)).filter((f) => f.endsWith('.js')).sort() : [];
const APP = skip ? '' : [...PARTS.map((f) => readFileSync(new URL(`email/public/parts/${f}`, IFL), 'utf8')), readFileSync(new URL('email/public/app.js', IFL), 'utf8')].join('\n');

// ---- a function or a const out of app.js by name (app.js is one closure: its own are indented by two spaces)
function sourceOf(name) {
  const m = new RegExp(String.raw`^  (?:async\s+)?function\s+${name}\s*\(|^  const\s+${name}\s*=`, 'm').exec(APP);
  assert.ok(m, `app.js has ${name}`);
  let i = m.index, depth = 0, seenBody = false;
  const isFn = /function/.test(m[0]);
  for (; i < APP.length; i++) {
    const c = APP[i], n2 = APP.slice(i, i + 2);
    if (n2 === '//') { i = APP.indexOf('\n', i); continue; }
    if (n2 === '/*') { i = APP.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < APP.length && APP[i] !== c; i++) {
        if (APP[i] === '\\') i++;
        else if (c === '`' && APP[i] === '$' && APP[i + 1] === '{') { let d = 0; for (; i < APP.length; i++) { if (APP[i] === '{') d++; else if (APP[i] === '}' && --d === 0) break; } }
      }
      continue;
    }
    if (c === '/' && /[=(,:!&|?{};]\s*$/.test(APP.slice(Math.max(0, i - 3), i))) {
      for (i++; i < APP.length && APP[i] !== '/'; i++) { if (APP[i] === '\\') i++; else if (APP[i] === '[') { for (; APP[i] !== ']'; i++) if (APP[i] === '\\') i++; } }
      continue;
    }
    if ('([{'.includes(c)) { depth++; if (c === '{') seenBody = true; continue; }
    if (')]}'.includes(c)) { depth--; if (isFn && depth === 0 && c === '}' && seenBody) return APP.slice(m.index, i + 1); continue; }
    if (!isFn && depth === 0 && c === ';') return APP.slice(m.index, i + 1);
  }
  throw new Error(`no end to ${name}`);
}

// app.js's own, at a clock stood in (Date with no arguments, and Date.now(), are `now`), with its S
const NAMES = ['escapeHtml', 'hue', 'initials', 'displayName', 'dayMs', 'startOfDay', 'fmtListDate', 'fmtLongDate', 'fmtQuoteDate', 'fmtSize', 'linkify', 'textToHtml',
  'parseAddress', 'EMAIL_RE', 'mailtoDraft', 'LENSES', 'FILTERS', 'lensCount', 'listTitle', 'SF', 'DATES', 'ymd', 'dateOp', 'clearFilters', 'sayQuery', 'nameOf',
  'restoreQuery', 'typingToken', 'replaceTyping', 'dayLabel', 'peopleLine', 'leadAction', 'at', 'laterChoices', 'fmtWhen', 'PATCH', 'inView', 'mine', 'dedupe', 'replyDraft'];
function appAt(now, S = {}, people = []) {
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  const src = NAMES.map(sourceOf).join('\n');
  const f = new Function('S', 'Date', 'navigator', 'sfPeople', `"use strict"; const locale = navigator.language || "en-GB";\n${src}\nreturn { ${NAMES.join(', ')} };`);
  return f(S, FakeDate, globalThis.navigator || { language: 'en-GB' }, people);
}

const T = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
// (London: a Tuesday morning in November, a Saturday evening, the Monday after the clocks went forward, a summer
// Thursday at 16:45, a Friday at 05:30, a Sunday just before midnight)
const CLOCKS = [T(2026, 11, 3, 10), T(2026, 11, 7, 20), T(2026, 3, 30, 5, 30), T(2026, 6, 18, 16, 45), T(2026, 10, 30, 5, 30), T(2026, 12, 27, 23, 50), T(2026, 1, 1, 0, 5)];
const AGO = [0, 60e3, 3600e3, 9 * 3600e3, 20 * 3600e3, 36 * 3600e3, 3 * 864e5, 6.5 * 864e5, 8 * 864e5, 40 * 864e5, 400 * 864e5];
const AHEAD = [60e3, 2 * 3600e3, 14 * 3600e3, 30 * 3600e3, 3 * 864e5, 6.9 * 864e5, 9 * 864e5, 90 * 864e5];

test('the dates: list, long, quote, Later’s “when” and the day headings, at London’s clock, as app.js says them', { skip }, () => {
  for (const now of CLOCKS) {
    const A = appAt(now);
    for (const d of AGO) {
      const ts = now - d;
      assert.equal(L.fmtListDate(ts, now), A.fmtListDate(ts), `fmtListDate ${new Date(ts).toISOString()} at ${new Date(now).toISOString()}`);
      assert.equal(L.fmtLongDate(ts, now), A.fmtLongDate(ts), 'fmtLongDate');
      assert.equal(L.fmtQuoteDate(ts), A.fmtQuoteDate(ts), 'fmtQuoteDate');
      assert.equal(L.dayLabel(ts, now), A.dayLabel(ts), 'dayLabel');
    }
    for (const d of AHEAD) assert.equal(L.fmtWhen(now + d, now), A.fmtWhen(now + d), `fmtWhen +${d} at ${new Date(now).toISOString()}`);
    assert.equal(L.startOfDay(now), A.startOfDay(now));
  }
});

test('laterChoices at fixed clocks: the same choices, the same times', { skip }, () => {
  for (const now of [...CLOCKS, T(2026, 11, 4, 6), T(2026, 11, 4, 16, 59), T(2026, 11, 4, 17), T(2026, 11, 4, 18), T(2026, 11, 6, 9), T(2026, 11, 8, 12)]) {
    const A = appAt(now);
    assert.deepEqual(L.laterChoices(now), A.laterChoices(), `at ${new Date(now).toString()}`);
    assert.equal(L.at(1, 8, 0, now), A.at(1, 8));
    assert.equal(L.at(0, 18, 30, now), A.at(0, 18, 30));
  }
  assert.ok(L.laterChoices(T(2026, 11, 3, 10)).every((c) => c.until > T(2026, 11, 3, 10)), 'every choice is later than now');
});

test('the search tokeniser: dateOp, sayQuery, restoreQuery, typingToken and replaceTyping (nothing remembered)', { skip }, () => {
  const people = [{ name: 'Leo Martins', email: 'leo@x.com' }, { name: 'Pat', email: 'pat@y.org' }];
  const QS = ['from:leo@x.com', 'from:leo@x.com dinner', 'to:pat@y.org is:unread', 'has:attachment invoice', 'in:trash', 'from:nobody@z.com before:2026-01-01', 'after:2026-11-03', 'plain words only', '', 'is:flagged from:"x y"'];
  for (const now of CLOCKS) {
    const A = appAt(now, {}, people);
    for (const k of ['today', 'week', 'month', 'older', 'nope']) assert.equal(L.dateOp(k, now), A.dateOp(k), `dateOp ${k}`);
    for (const q of [...QS, A.dateOp('today'), `${A.dateOp('week')} lunch`, A.dateOp('older')]) {
      assert.equal(L.sayQuery(q, people, now), A.sayQuery(q), `sayQuery ${q}`);
      const rest = A.restoreQuery(q), mine = L.restoreQuery(q, people, now);
      assert.equal(mine.rest, rest, `restoreQuery ${q}`);
      assert.deepEqual(mine.sf, { ...A.SF }, `restoreQuery's filters ${q}`);
    }
  }
  const A = appAt(Date.now());
  for (const q of ['', 'dinn', 'from:le', 'to:"pa', 'a b ', 'has:x', 'one two thr']) {
    assert.deepEqual(L.typingToken(q), A.typingToken(q), `typingToken ${q}`);
    const tok = A.typingToken(q);
    if (tok) assert.equal(L.replaceTyping(q, tok, 'from:leo@x.com'), A.replaceTyping(q, tok, 'from:leo@x.com'));
  }
});

test('text: mailtoDraft, parseAddress, linkify, textToHtml, escapeHtml, hue, initials, fmtSize, displayName', { skip }, () => {
  const A = appAt(Date.now());
  for (const h of ['mailto:leo@x.com', 'mailto:leo@x.com,pat@y.org?subject=Hi%20there&body=Line%201%0D%0ALine+2&cc=a@b.co', 'MAILTO:?to=x@y.zz&bcc=q@r.st', 'mailto:not-an-address', 'https://x.com', '', null, 'mailto:%E0%A4%A?subject=%ZZ'])
    assert.deepEqual(L.mailtoDraft(h), A.mailtoDraft(h), `mailtoDraft ${h}`);
  for (const s of ['Pat <pat@y.org>', '"Smith, Pat" <pat@y.org>', 'pat@y.org,', '  bare  ', '', null]) assert.deepEqual(L.parseAddress(s), A.parseAddress(s), `parseAddress ${s}`);
  for (const s of ['see https://example.com/a?b=1, then', 'mail me at leo@x.com.', '<script>alert(1)</script> & "q"', 'line one\nline two\r\nthree', '']) {
    assert.equal(L.textToHtml(s), A.textToHtml(s), `textToHtml ${JSON.stringify(s)}`);
    assert.equal(L.linkify(A.escapeHtml(s)), A.linkify(A.escapeHtml(s)));
    assert.equal(L.escapeHtml(s), A.escapeHtml(s));
  }
  for (const s of ['leo@x.com', 'Ünïcødé', '', null]) assert.equal(L.hue(s), A.hue(s));
  for (const [n, e] of [['Leo Martins', 'leo@x.com'], ['', 'pat.smith@y.org'], ["O'Brien (work)", ''], ['', ''], ['Madonna', 'm@x.com']]) assert.equal(L.initials(n, e), A.initials(n, e));
  for (const n of [0, 1, 1023, 1024, 50000, 1048576, 5e6]) assert.equal(L.fmtSize(n), A.fmtSize(n));
  for (const p of [null, { name: 'A', email: 'a@b' }, { email: 'a@b' }, {}]) assert.equal(L.displayName(p), A.displayName(p));
  assert.equal(String(L.EMAIL_RE), String(A.EMAIL_RE));
  assert.deepEqual(L.LENSES, A.LENSES);
});

// threads in every state, and every view a list can be
const TH = [];
for (const category of ['people', 'updates']) for (const unread of [0, 1]) for (const done of [false, true]) for (const snoozeUntil of [null, Date.now() + 3600e3])
  for (const trashed of [false, true]) for (const starred of [false, true]) TH.push({ id: `t${TH.length}`, category, unread, done, snoozeUntil, trashed, starred, hasAttachments: TH.length % 3 === 0 });
const ASKS = [];
for (const view of ['all', 'unread', 'flagged', 'attachments', 'later', 'done', 'trash']) for (const category of [null, 'people', 'updates']) for (const query of ['', 'from:x']) ASKS.push({ view, category, query });

test('inView: where a conversation belongs, over every view and state, as app.js decides it', { skip }, () => {
  for (const S of ASKS) {
    const A = appAt(Date.now(), S);
    for (const t of TH) assert.equal(L.inView(t, S), A.inView(t), `${JSON.stringify(S)} ${JSON.stringify(t)}`);
  }
  // (the store's own words for where it is mean the same lists: a lens and a filter, Later, Done, the Trash box)
  const same = [[{ lens: 'people', filter: 'all' }, { view: 'all', category: 'people' }], [{ lens: 'updates', filter: 'unread' }, { view: 'unread', category: 'updates' }],
    [{ lens: 'people', filter: 'files' }, { view: 'attachments', category: 'people' }], [{ lens: 'later', filter: 'all' }, { view: 'later', category: null }],
    [{ lens: 'done', filter: 'unread' }, { view: 'done', category: null }], [{ lens: 'people', filter: 'all', box: 'trash' }, { view: 'trash', category: null }],
    [{ lens: 'people', filter: 'flagged', query: 'leo' }, { view: 'flagged', category: null, query: 'leo' }]];
  for (const [store, S] of same) {
    const A = appAt(Date.now(), { query: '', ...S });
    for (const t of TH) assert.equal(L.inView(t, { query: '', address: null, box: null, ...store }), A.inView(t), `${JSON.stringify(store)} ${JSON.stringify(t)}`);
  }
});

test('the list: people line, the swipe’s lead, lens counts and the title', { skip }, () => {
  const A = appAt(Date.now());
  for (const people of [[{ name: 'Leo Martins', email: 'leo@x.com' }], [{ me: true, name: 'George', email: 'g@inflite.ai' }], [{ email: 'a@b.co' }], [], [{ name: 'A B' }, { email: 'c@d.ef' }, { me: true }, { name: 'Z' }, { name: 'Y' }]])
    assert.equal(L.peopleLine({ people }), A.peopleLine({ people }));
  for (const t of TH) assert.deepEqual(L.leadAction(t), A.leadAction(t));
  const counts = { people: { unread: 3 }, updates: { unread: 5 }, snoozed: 2, flagged: 4, trash: 9 };
  for (const k of ['people', 'updates', 'later', 'flagged', 'done', 'trash']) {
    assert.equal(L.lensCount(k, counts), appAt(Date.now(), { counts }).lensCount(k), `lensCount ${k}`);
    assert.equal(L.lensCount(k, L.countsOf(counts)), appAt(Date.now(), { counts }).lensCount(k), `lensCount ${k} from the store’s counts`);
  }
  for (const S of [{ query: 'x', lens: 'people' }, { query: '', lens: 'trash' }, { query: '', lens: 'flagged' }, { query: '', lens: 'later' }, { query: '', lens: 'updates' }])
    assert.equal(L.listTitle(S), appAt(Date.now(), S).listTitle(), JSON.stringify(S));
  assert.deepEqual(L.PATCH, A.PATCH);
});

test('mine, dedupe and replyDraft: the same reply, reply-all and forward as app.js, but the quote is { of, mode } and forwarded files { ref }', { skip }, () => {
  const me = { identities: ['hello@inflite.ai', 'george@inflite.ai'], domain: 'inflite.ai', defaultFrom: 'hello@inflite.ai' };
  const A = appAt(T(2026, 11, 3, 10), { me });
  for (const e of ['hello@inflite.ai', 'HELLO@inflite.ai', 'x@inflite.ai', 'leo@x.com', '', null]) assert.equal(L.mine(e, me), A.mine(e), `mine ${e}`);
  const list = [{ email: 'A@x.com' }, { email: 'a@x.com' }, { email: 'b@y.com' }];
  assert.deepEqual(L.dedupe(list, me), A.dedupe(list));
  const base = { id: 'm-1', threadId: 't-1', messageId: '<m1@x.com>', references: '<m0@x.com>', subject: 'Dinner Friday?', date: T(2026, 11, 2, 14, 2) };
  const MSGS = [
    { ...base, folder: 'inbox', mailbox: 'george@inflite.ai', from: { name: 'Leo Martins', email: 'leo@x.com' }, to: [{ name: 'George', email: 'george@inflite.ai' }, { email: 'sam@z.org' }], cc: [{ email: 'leo@x.com' }, { email: 'kim@w.net' }, { email: 'KIM@w.net' }], attachments: [{ id: 'a1', filename: 'menu.pdf', type: 'application/pdf', size: 1200 }] },
    { ...base, folder: 'inbox', mailbox: 'someone@else.com', replyTo: 'list@x.com', from: { name: 'A List', email: 'noreply@x.com' }, to: [{ email: 'hello@inflite.ai' }], cc: [], subject: 'Re: News' },
    { ...base, folder: 'sent', mailbox: null, from: { name: 'George', email: 'hello@inflite.ai' }, to: [{ name: 'Leo', email: 'leo@x.com' }], cc: [{ email: 'pat@y.org' }], subject: 'Fwd: Plans', references: null },
  ];
  for (const m of MSGS) for (const mode of ['reply', 'replyAll', 'forward']) {
    const want = A.replyDraft({ ...m, html: '<p>hi</p>', text: 'hi', attachments: (m.attachments || []).map((a) => ({ ...a, url: `/api/attachments/${a.id}` })) }, mode);
    const got = L.replyDraft(m, mode, me);
    const { quote: q0, attachments: a0, ...rest0 } = want;
    const { quote: q1, files: f1, ...rest1 } = got;
    assert.deepEqual(rest1, rest0, `${m.folder} ${mode}`);
    assert.deepEqual(q1, { of: m.id, mode: mode === 'replyAll' ? 'all' : mode }, 'the quote is Mail’s server’s to build (S4-D4)');
    assert.ok(!('html' in q1) && !('text' in q1), 'no body in the quote');
    assert.deepEqual(f1, a0.map((a) => ({ ref: m.attachments.find((x) => x.filename === a.filename).id, filename: a.filename, type: a.type, size: a.size })), 'forwarded files by ref');
    assert.ok(q0.html !== undefined, 'app.js still quotes from the body itself (Mail on its own)');
  }
});
