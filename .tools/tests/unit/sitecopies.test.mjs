// The site's one password, worked out the same way in every app: InFlight's and the account page's (pigeon/crypto.js,
// the account page's /crypto.js) and Weather's own copy (weather/account.js, with weather/argon2.js). If they drifted
// apart, signing in to Weather with the same password would stop working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const crypto = read('pigeon/crypto.js'), weather = read('weather/account.js');

test('Weather’s Argon2id is InFlight’s, line for line', () => {
  const body = (s) => s.split('\n').slice(1).join('\n');            // (the first line says which app's copy it is)
  assert.equal(body(read('weather/argon2.js')), body(read('pigeon/argon2.js')));
});

test('the same stretching: Argon2id 64 MiB, 3 passes, one lane; PBKDF2 600,000 rounds for an older account', () => {
  const argon = /const ARGON = \{ m: (\d+), t: (\d+) \}/.exec(crypto), iter = /const PBKDF2_ITER = (\d+)/.exec(crypto);
  assert.ok(argon && iter, 'crypto.js says its settings');
  assert.match(weather, new RegExp(`parallelism: 1, iterations: ${argon[2]}, memorySize: ${argon[1]}, hashLength: 64`));
  assert.match(crypto, /parallelism: 1, iterations: ARGON\.t, memorySize: ARGON\.m, hashLength: 64/);
  assert.match(weather, new RegExp(`hash: "SHA-256", salt: fromB64url\\(salt\\), iterations: ${iter[1]} \\}, base, 512`));
});

test('the same password text, salt form and proof (the second half of what’s worked out)', () => {
  for (const s of [crypto, weather]) assert.match(s, /String\(password\)\.normalize\("NFKC"\)/);
  assert.match(crypto, /isCurrent: \(salt\) => String\(salt \|\| ""\)\.startsWith\("a2:"\)/);
  assert.match(weather, /String\(salt\)\.startsWith\("a2:"\)/);
  assert.match(crypto, /proof: b64url\(bits\.slice\(32\)\)/);
  assert.match(weather, /return b64url\(bits\.slice\(32\)\);/);
});
