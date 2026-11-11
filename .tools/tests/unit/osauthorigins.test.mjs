import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IFL } from './fixtures/roof.mjs';

const main = new URL('../../../', import.meta.url);
const chat = readFileSync(new URL('pigeon/app.js', main), 'utf8');
const mail = IFL && readFileSync(new URL('email/public/app.js', IFL), 'utf8');
const api = IFL && readFileSync(new URL('email/public/roof/api.js', IFL), 'utf8');
const signin = IFL && readFileSync(new URL('email/public/roof/signin.js', IFL), 'utf8');
const take = (source, pattern) => { const found = pattern.exec(source); assert.ok(found, String(pattern)); return found[0].replace(/^export /, ''); };

test('OS Chat engine derives the existing account site without changing arbitrary subdomains', () => {
  const source = take(chat, /^const hubSite = .+;$/m);
  for (const [host, expected] of [['inflite.ai', 'inflite.ai'], ['next.inflite.ai', 'inflite.ai'], ['os.inflite.ai', 'inflite.ai'], ['os.ifl.test:8788', 'ifl.test:8788'], ['other.inflite.ai', 'other.inflite.ai']])
    assert.equal(vm.runInNewContext(source + '\nhubSite()', { location: { host } }), expected, host);
});

test('OS Mail API and sign-in use the existing exact email/auth hosts', { skip: !IFL && 'companion InFlite repo unavailable' }, () => {
  for (const [protocol, host, site] of [['https:', 'inflite.ai', 'inflite.ai'], ['https:', 'next.inflite.ai', 'inflite.ai'], ['https:', 'os.inflite.ai', 'inflite.ai'], ['http:', 'os.ifl.test:8788', 'ifl.test:8788'], ['https:', 'os.ifl.test', 'ifl.test'], ['https:', 'os.ifl.test:443', 'ifl.test:443'], ['https:', 'os.inflite.ai:444', 'os.inflite.ai:444'], ['http:', 'os.inflite.ai', 'os.inflite.ai'], ['https:', 'os.inflite.ai.evil.example', 'os.inflite.ai.evil.example'], ['https:', 'os.other.example', 'os.other.example'], ['https:', 'os.os.inflite.ai', 'os.os.inflite.ai'], ['https:', 'os.ifl.test.evil.example:8788', 'os.ifl.test.evil.example:8788']]) {
    const context = { location: { protocol, host } };
    assert.equal(vm.runInNewContext(take(api, /^export const MAIL = .+;$/m) + '\nMAIL', context), `${protocol}//email.${site}`);
    assert.equal(vm.runInNewContext(take(signin, /^export const authOrigin = .+;$/m) + '\nauthOrigin()', context), `${protocol}//auth.${site}`);
  }
});

test('legacy Mail iframe handshake recognizes only the three exact sibling hub origins', { skip: !IFL && 'companion InFlite repo unavailable' }, () => {
  const source = take(mail, /^  const SITE = .+;$/m) + '\n' + take(mail, /^  const HUBS = .+;$/m) + '\nHUBS';
  const hubs = Array.from(vm.runInNewContext(source, { location: { origin: 'https://email.inflite.ai' } }));
  assert.deepEqual(hubs, ['https://inflite.ai', 'https://next.inflite.ai', 'https://os.inflite.ai']);
  for (const bad of ['https://os.inflite.ai.evil.example', 'http://os.inflite.ai', 'https://os.inflite.ai:444', 'https://os.os.inflite.ai']) assert.equal(hubs.includes(bad), false, bad);
});
