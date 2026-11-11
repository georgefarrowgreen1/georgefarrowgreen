// Signing in happens on the account's own page and only there (functions/_handback.js): every app sends you there,
// and is handed the sign-in back with a code good only in the tab that asked (its word's hash went with it), Chat
// with what unlocks its key sealed to that tab. Here: the sealing, the word, where the page will send a sign-in back
// to, and that no app signs in by itself any more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { E2E } from '../../../pigeon/crypto.js';
import { signInWord } from '../../../weather/account.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const hashOf = (w) => createHash('sha256').update(w).digest('base64url');

test('what unlocks Chat’s key opens only with the private half its tab kept', async () => {
  const tab = await E2E.handbackPair(), other = await E2E.handbackPair();
  assert.equal(hashOf(tab.word), tab.ask, 'the word’s hash is what goes to the account’s page');
  assert.match(tab.pub, /^[A-Za-z0-9_-]{87}$/); assert.match(tab.ask, /^[A-Za-z0-9_-]{43}$/);
  const box = await E2E.sealFor(tab.pub, { lock: 'x'.repeat(43) });
  assert.deepEqual(await E2E.unseal(tab.priv, tab.pub, box), { lock: 'x'.repeat(43) });
  await assert.rejects(E2E.unseal(other.priv, other.pub, box), 'another tab’s key pair can’t open it');
  await assert.rejects(E2E.unseal(tab.priv, other.pub, box), 'nor this one, said to be for another');
  // (the password's first half, as the account's page hands it over, is the key that locks the vault)
  const k = await E2E.fromPassword('a long test password', E2E.newSalt());
  const vault = await E2E.lock(k.lockKey, { ecdh: { d: 'secret' } });
  assert.deepEqual(await E2E.unlock(await E2E.lockKeyOf(k.lock), vault), { ecdh: { d: 'secret' } });
});

test('Weather’s word for a sign-in, and its hash, as the server checks them', async () => {
  const { word, ask } = await signInWord();
  assert.match(word, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashOf(word), ask);
});

// the account's page's backFor, siteUrl and APPS, run as they are, at an address of the page's
function backFor(at) {
  const src = read('account/app.js'), grab = (re) => re.exec(src)?.[0] || assert.fail(`account/app.js: ${re}`);
  const code = [grab(/const APPS = \{[^\n]+\};/), grab(/const HOME_SITES = \{[^\n]+\};/), grab(/function siteUrl\(sub\) \{[\s\S]*?\n\}/), grab(/function backFor\(app, back\) \{[\s\S]*?\n\}/), 'backFor'].join('\n');
  const u = new URL(at);
  return vm.runInNewContext(code, { location: { hostname: u.hostname, protocol: u.protocol, port: u.port }, URL });
}
test('the account’s page sends a sign-in back only to the app’s own address', () => {
  const site = backFor('https://account.inflite.ai/');
  assert.equal(site('inflight', 'https://chat.inflite.ai/'), 'https://chat.inflite.ai/');
  assert.equal(site('weather', 'https://weather.inflite.ai/'), 'https://weather.inflite.ai/');
  assert.equal(site('home', 'https://georgefarrowgreen.com/'), 'https://georgefarrowgreen.com/', 'the home page, on a site of its own');
  // anything else: the app's usual address
  for (const bad of ['https://evil.example/', 'https://chat.inflite.ai.evil.example/', 'http://chat.inflite.ai/', 'https://chat.inflite.ai:444/', 'https://georgefarrowgreen.com/pigeon/',
    'https://chat.georgefarrowgreen.com/', 'https://chat.inflite.ai/x', 'https://chat.inflite.ai/?a=1', 'https://u:p@chat.inflite.ai/', 'https://weather.inflite.ai/', 'javascript:alert(1)', 'nonsense', null])
    assert.equal(site('inflight', bad), 'https://chat.inflite.ai/', String(bad));
  assert.equal(site('weather', 'https://chat.inflite.ai/'), 'https://weather.inflite.ai/', 'one app’s address isn’t another’s');
  assert.equal(site('home', 'https://inflite.ai/'), 'https://georgefarrowgreen.com/', 'the home page is only ever its own');
  // the tests' two sites
  const tests = backFor('http://account.ifl.test:8788/');
  assert.equal(tests('home', 'http://gfg.test:8788/'), 'http://gfg.test:8788/');
  assert.equal(tests('fitness', 'http://fitness.ifl.test:8788/'), 'http://fitness.ifl.test:8788/');
  // a test server's: its own names, on its own port
  const local = backFor('http://account.localhost:8788/');
  assert.equal(local('inflight', 'http://localhost:8788/pigeon/'), 'http://localhost:8788/pigeon/');
  assert.equal(local('weather', 'http://weather.localhost:8788/'), 'http://weather.localhost:8788/');
  assert.equal(local('inflight', 'http://localhost:9999/pigeon/'), 'http://chat.localhost:8788/');
});
test('InFlite Today, at the apps’ site itself: a sign-in goes back only there (and "home" is still only the home page)', () => {
  const site = backFor('https://account.inflite.ai/');
  assert.equal(site('today', 'https://inflite.ai/'), 'https://inflite.ai/');
  for (const bad of ['https://evil.example/', 'https://inflite.ai.evil.example/', 'http://inflite.ai/', 'https://inflite.ai:444/', 'https://inflite.ai/x', 'https://inflite.ai/?a=1',
    'https://u:p@inflite.ai/', 'https://www.inflite.ai/', 'https://chat.inflite.ai/', 'https://account.inflite.ai/', 'https://georgefarrowgreen.com/', 'javascript:alert(1)', 'nonsense', null])
    assert.equal(site('today', bad), 'https://inflite.ai/', String(bad));
  assert.equal(site('home', 'https://inflite.ai/'), 'https://georgefarrowgreen.com/', 'the home page is never Today');
  assert.equal(site('inflight', 'https://inflite.ai/'), 'https://chat.inflite.ai/', 'nor is Chat');
  // (from the sign-in page too, and the tests' site, on its port)
  assert.equal(backFor('https://auth.inflite.ai/')('today', 'https://inflite.ai/'), 'https://inflite.ai/');
  const tests = backFor('http://account.ifl.test:8788/');
  assert.equal(tests('today', 'http://ifl.test:8788/'), 'http://ifl.test:8788/');
  assert.equal(tests('today', 'http://ifl.test:9999/'), 'http://ifl.test:8788/');
  assert.equal(tests('today', 'http://gfg.test:8788/'), 'http://ifl.test:8788/');
  assert.equal(tests('home', 'http://ifl.test:8788/'), 'http://gfg.test:8788/');
});
test('InFlite in one window (Today First): a sign-in goes back to Chat at /chats/, Mail at /mail/ and Today, at the site and its staging copy, and nowhere looser', () => {
  const site = backFor('https://account.inflite.ai/');
  for (const ok of ['https://inflite.ai/chats/', 'https://next.inflite.ai/chats/', 'https://os.inflite.ai/chats/', 'https://chat.inflite.ai/']) assert.equal(site('inflight', ok), ok, ok);
  for (const ok of ['https://inflite.ai/mail/', 'https://next.inflite.ai/mail/', 'https://os.inflite.ai/mail/', 'https://email.inflite.ai/']) assert.equal(site('mail', ok), ok, ok);
  for (const ok of ['https://inflite.ai/', 'https://next.inflite.ai/', 'https://os.inflite.ai/']) assert.equal(site('today', ok), ok, ok);
  for (const [app, good] of [['today', 'https://os.inflite.ai/'], ['inflight', 'https://os.inflite.ai/chats/'], ['mail', 'https://os.inflite.ai/mail/']]) {
    for (const bad of [good.replace('os.inflite.ai', 'os.inflite.ai.evil.example'), good.replace('os.inflite.ai', 'os.os.inflite.ai'), good.replace('https:', 'http:'), good.replace('os.inflite.ai', 'os.inflite.ai:444'), good.replace('https://', 'https://u:p@'), good + '?next=x', good + 'other/'])
      assert.notEqual(site(app, bad), bad, `${app}: ${bad}`);
  }
  // (the same rules as ever: its protocol and port, no query, no one's name and password, the path exactly)
  for (const bad of ['https://inflite.ai/chats/x', 'https://inflite.ai/chats', 'https://inflite.ai/chats/?a=1', 'http://inflite.ai/chats/', 'https://inflite.ai:444/chats/', 'https://u:p@inflite.ai/chats/',
    'https://next.inflite.ai/', 'https://nextx.inflite.ai/chats/', 'https://next.next.inflite.ai/chats/', 'https://evil.example/chats/', 'https://inflite.ai.evil.example/chats/', 'https://inflite.ai/mail/',
    'https://inflite.ai/weather/', 'https://www.inflite.ai/chats/', 'https://next.georgefarrowgreen.com/chats/'])
    assert.equal(site('inflight', bad), 'https://chat.inflite.ai/', bad);
  for (const bad of ['https://inflite.ai/mail/x', 'https://inflite.ai/mail', 'https://inflite.ai/chats/', 'https://next.inflite.ai/', 'http://inflite.ai/mail/', 'https://inflite.ai/mail/?x=1'])
    assert.equal(site('mail', bad), 'https://email.inflite.ai/', bad);
  for (const bad of ['https://next.inflite.ai/x', 'https://next.inflite.ai/chats/', 'https://next.inflite.ai/?a=1', 'http://next.inflite.ai/', 'https://next.inflite.ai:444/'])
    assert.equal(site('today', bad), 'https://inflite.ai/', bad);
  // (no other app takes the hub's paths)
  for (const app of ['weather', 'fitness', 'markets', 'home']) for (const p of ['https://inflite.ai/chats/', 'https://inflite.ai/mail/', 'https://next.inflite.ai/'])
    assert.notEqual(site(app, p), p, `${app}: ${p}`);
  // (from the sign-in page, and the tests' site, on its port)
  assert.equal(backFor('https://auth.inflite.ai/')('inflight', 'https://inflite.ai/chats/'), 'https://inflite.ai/chats/');
  const tests = backFor('http://account.ifl.test:8788/');
  assert.equal(tests('inflight', 'http://ifl.test:8788/chats/'), 'http://ifl.test:8788/chats/');
  assert.equal(tests('mail', 'http://ifl.test:8788/mail/'), 'http://ifl.test:8788/mail/');
  assert.equal(tests('today', 'http://next.ifl.test:8788/'), 'http://next.ifl.test:8788/');
  assert.equal(tests('inflight', 'http://ifl.test:9999/chats/'), 'http://chat.ifl.test:8788/');
});
test('the account’s page takes Today’s sign-in and sign-out, and names it', () => {
  const src = read('account/app.js');
  assert.match(src, /const SIGN_FOR = [\s\S]*?\(inflight\|weather\|fitness\|markets\|mail\|today\|home\)/);
  assert.match(src, /const OUT = [\s\S]*?\(account\|inflight\|weather\|fitness\|markets\|mail\|today\|home\)/);
  assert.match(src, /today: \{ name: "Today", sub: "@" \}/);
  assert.match(read('functions/_handback.js'), /APPS = new Set\(\[[^\]]*"today"[^\]]*\]\)/);
});

test('no app signs in by itself any more: the account’s page does, and hands it back', () => {
  const inflight = read('pigeon/app.js'), weather = read('weather/account.js') + read('weather/app.js');
  const inflightApi = read('functions/api/pigeon/[[path]].js'), weatherApi = read('functions/_wxacct.js');
  assert.doesNotMatch(inflight, /api\("(login|passkey-login)"/, 'Chat asks nothing of its old sign-in');
  assert.doesNotMatch(weather, /signin\//, 'nor Weather of its own');
  assert.match(inflightApi, /"POST login": elsewhere\("Sign in"\)/); assert.match(inflightApi, /"POST passkey-login": elsewhere\("Sign in"\)/);
  assert.match(weatherApi, /accountRoutes\(view, \{[^}]*signIn: false \}\)/);
  assert.match(inflight, /"POST", body: \{ code, verifier: k\.word \}/); assert.match(weather, /A\.handback\(code, k\.word\)/);
});
