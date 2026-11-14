// Signing in happens on the account's own page and only there (functions/_handback.js): every app sends you there,
// and is handed the sign-in back with a code good only in the tab that asked (its word's hash went with it), Chat
// with what unlocks its key sealed to that tab. Here: the sealing, the word, where the page will send a sign-in back
// to, and that no app signs in by itself any more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { returnFor } from '../../../account/identity-location.js';
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

// The page delegates its return allowlist to the same pure route boundary tested here.
function backFor(at) {
  const source = read('account/app.js'), apps = vm.runInNewContext(/const APPS = \{[^\n]+\};/.exec(source)[0] + '\nAPPS');
  return (app, back) => returnFor(new URL(at), apps[app].sub, back);
}
test('sign-in returns to each app at its canonical public path, accepting old exact links without widening the allowlist', () => {
  const site = backFor('https://inflite.ai/auth/');
  const apps = { inflight: ['chat','chats'], weather:['weather','weather'],fitness:['fitness','fitness'],markets:['finance','markets'],mail:['email','mail'] };
  for (const [app,[host,path]] of Object.entries(apps)) {
    for (const back of [`https://${host}.inflite.ai/`,`https://inflite.ai/${path}/`,`https://next.inflite.ai/${path}/`,`https://os.inflite.ai/${path}/`]) assert.equal(site(app,back),`https://inflite.ai/${path}/`);
    for (const back of [`https://${host}.inflite.ai.evil.test/`,`https://u:p@inflite.ai/${path}/`,`http://inflite.ai/${path}/`,`https://inflite.ai:444/${path}/`,`https://inflite.ai/${path}/?x=1`,`https://inflite.ai/${path}/other`]) assert.equal(site(app,back),`https://inflite.ai/${path}/`);
  }
  for(const back of ['https://inflite.ai/','https://next.inflite.ai/','https://os.inflite.ai/','https://evil.test/']) assert.equal(site('today',back),'https://inflite.ai/');
  assert.equal(site('home','https://inflite.ai/'),'https://georgefarrowgreen.com/');
});
test('identity return routes preserve the local two-site testing boundary and exact ports', () => {
  const local=backFor('http://account.ifl.test:8788/');
  assert.equal(local('home','http://gfg.test:8788/'),'http://gfg.test:8788/');
  assert.equal(local('fitness','http://fitness.ifl.test:8788/'),'http://fitness.ifl.test:8788/');
  assert.equal(local('inflight','http://ifl.test:8788/chats/'),'http://ifl.test:8788/chats/');
  assert.equal(local('today','http://next.ifl.test:8788/'),'http://next.ifl.test:8788/');
  assert.equal(local('inflight','http://ifl.test:9999/chats/'),'http://chat.ifl.test:8788/');
  assert.equal(backFor('http://account.localhost:8788/')('inflight','http://localhost:8788/pigeon/'),'http://localhost:8788/pigeon/');
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
