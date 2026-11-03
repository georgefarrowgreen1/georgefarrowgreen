// Mail's copy of InFlite's way in (the inflite repo's email/public/app.css, where it's checked out beside this one): the
// template's, as every app here has it (unit/iflsignin.test.mjs checks those), and InFlite's mark the same. Refreshed by
// node .tools/signin.mjs ../inflite/email/public. And Mail's own sign-in in InFlite's window (framed at the hub's /mail/):
// its word kept as ever, the trip asked of the hub, the code back into the frame (below).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { START, END, block } from '../../signin.mjs';

const PUB = new URL('../../../../inflite/email/public/', import.meta.url);
const skip = !existsSync(new URL('app.css', PUB)) && 'the inflite repo isn’t beside this one';
const ROOT = new URL('../../../', import.meta.url);

test('Mail’s copy of InFlite’s way in is the template’s, and its mark the same', { skip }, () => {
  const css = readFileSync(new URL('app.css', PUB), 'utf8'), i = css.indexOf(START), j = css.indexOf(END);
  assert.ok(i >= 0 && j > i, 'Mail has no copy: run node .tools/signin.mjs ../inflite/email/public');
  assert.equal(css.slice(i, j + END.length), block(), 'Mail’s copy is out of date: run node .tools/signin.mjs ../inflite/email/public');
  assert.equal(readFileSync(new URL('inflite.svg', PUB), 'utf8'), readFileSync(new URL('.tools/inflite/inflite.svg', ROOT), 'utf8'), 'Mail’s inflite.svg differs');
});

// ---- Mail's Sign In in InFlite's window (Today First, spec §9.4): framed by the hub's /mail/ page, Mail keeps its word
// where it always has (this tab's sessionStorage, inflite:signin-verifier) and asks the hub, with the word's hash, to
// make the trip (the sign-in page is never framed); the code comes back into the frame's address, and Mail's own
// hand-back finishes it there. At its own address, the trip as before.
const APP = new URL('app.js', PUB);
const app = skip ? '' : readFileSync(APP, 'utf8');
const fn = (name) => new RegExp(`\\n {2}(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`).exec(app)?.[0] || assert.fail(`app.js: ${name}`);
const part = (re, what) => re.exec(app)?.[0] || assert.fail(`app.js: ${what}`);
// (Mail's sign-in parts, at an address, in the frame or not: what it kept, said to the hub, went to, handed back)
function signIn({ embed, hash = '' }) {
  const kept = new Map(), told = [], went = [], handed = [], replaced = [];
  const ctx = {
    EMBED: embed, crypto: globalThis.crypto, TextEncoder, btoa, URLSearchParams,
    sessionStorage: { setItem: (k, v) => kept.set(k, String(v)), getItem: (k) => kept.get(k) ?? null, removeItem: (k) => kept.delete(k) },
    location: { origin: 'https://email.inflite.ai', pathname: '/', search: '', hash, assign: (u) => went.push(u) },
    history: { state: null, replaceState: (s, t, u) => replaced.push(u) },
    toHub: (m) => (told.push(JSON.parse(JSON.stringify(m))), true),
    api: { handback: async (code, verifier) => (handed.push([code, verifier]), { access: 'ok' }) },
  };
  const code = `let accountOrigin = "https://account.inflite.ai";
    ${part(/\n {2}const authOrigin = .+;\n/, 'authOrigin')}${part(/\n {2}const VERIFIER_KEY = .+;\n/, 'VERIFIER_KEY')}${part(/\n {2}const b64url = [\s\S]*?;\n/, 'b64url')}
    ${fn('goToAccount')}${fn('finishSignIn')} ({ goToAccount, finishSignIn, VERIFIER_KEY })`;
  return { ...vm.runInNewContext(code, ctx), kept, told, went, handed, replaced };
}
const hashOf = (w) => createHash('sha256').update(w).digest('base64url');

test('in the hub’s frame: Sign In keeps its word in this tab, as ever, and asks the hub to make the trip with its hash', { skip }, async () => {
  const m = signIn({ embed: true });
  assert.equal(m.VERIFIER_KEY, 'inflite:signin-verifier');
  assert.equal(await m.goToAccount(), true);
  const word = m.kept.get('inflite:signin-verifier');
  assert.match(word, /^[A-Za-z0-9_-]{43}$/, 'the word, kept in sessionStorage');
  assert.deepEqual(m.told, [{ ifl: 'signin', ask: hashOf(word) }], 'the hub asked, with the word’s hash alone');
  assert.match(m.told[0].ask, /^[A-Za-z0-9_-]{16,64}$/, 'a hash the hub’s page takes');
  assert.deepEqual(m.went, [], 'the frame goes nowhere itself: the sign-in page is never framed');
});

test('at its own address: the trip to the sign-in page as before, back to Mail', { skip }, async () => {
  const m = signIn({ embed: false });
  await m.goToAccount();
  const word = m.kept.get('inflite:signin-verifier');
  assert.deepEqual(m.told, []);
  assert.equal(m.went.length, 1);
  const u = new URL(m.went[0]), p = new URLSearchParams(u.hash.slice(1));
  assert.equal(u.origin, 'https://auth.inflite.ai');
  assert.deepEqual([p.get('signin'), p.get('ask'), p.get('back')], ['mail', hashOf(word), 'https://email.inflite.ai/']);
});

test('the code handed into the frame’s address (by the hub’s /mail/ page): Mail’s own hand-back, with the word kept in this tab', { skip }, async () => {
  const CODE = 'Qx7_Lm2-Rt9kVb3nWp5sYc8dZf1gHj4K';
  const m = signIn({ embed: true, hash: `#signin=${CODE}` });
  m.kept.set('inflite:signin-verifier', 'the-word-kept-before-the-trip');
  assert.deepEqual(await m.finishSignIn(), { access: 'ok' });
  assert.deepEqual(m.handed, [[CODE, 'the-word-kept-before-the-trip']]);
  assert.equal(m.kept.has('inflite:signin-verifier'), false, 'the word used once');
  assert.deepEqual(m.replaced, ['/'], 'the code out of the frame’s address');
  // (no word here: nothing handed back)
  const none = signIn({ embed: true, hash: `#signin=${CODE}` });
  assert.equal(await none.finishSignIn(), null);
  assert.deepEqual(none.handed, []);
});
