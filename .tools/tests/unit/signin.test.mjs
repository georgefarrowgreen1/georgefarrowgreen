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

test('no app signs in by itself any more: the account’s page does, and hands it back', () => {
  const inflight = read('pigeon/app.js'), weather = read('weather/account.js') + read('weather/app.js');
  const inflightApi = read('functions/api/pigeon/[[path]].js'), weatherApi = read('functions/_wxacct.js');
  assert.doesNotMatch(inflight, /api\("(login|passkey-login)"/, 'Chat asks nothing of its old sign-in');
  assert.doesNotMatch(weather, /signin\//, 'nor Weather of its own');
  assert.match(inflightApi, /"POST login": elsewhere\("Sign in"\)/); assert.match(inflightApi, /"POST passkey-login": elsewhere\("Sign in"\)/);
  assert.match(weatherApi, /accountRoutes\(view, \{[^}]*signIn: false \}\)/);
  assert.match(inflight, /"POST", body: \{ code, verifier: k\.word \}/); assert.match(weather, /A\.handback\(code, k\.word\)/);
});
