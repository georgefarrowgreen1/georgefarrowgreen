// The two sites as production has them, with nothing in the environment (the end-to-end tests stand in addresses of
// their own, so they can't see a production address left out): every app at its inflite.ai address and its old one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isChat } from '../../../functions/_app.js';
import { isWeather } from '../../../functions/_wxapp.js';
import { isFitness } from '../../../functions/_fitapp.js';
import { isAccount } from '../../../functions/_acctapp.js';
import { siteOf, oldApp, appOrigin } from '../../../functions/_sites.js';

const at = (h) => ({ hostname: h });
test('each app answers at its inflite.ai address, and at its old one (its API, for what was set up there)', () => {
  for (const [is, name] of [[isChat, 'chat'], [isWeather, 'weather'], [isFitness, 'fitness'], [isAccount, 'account']]) {
    assert.ok(is(at(`${name}.inflite.ai`), {}), `${name}.inflite.ai`);
    assert.ok(is(at(`${name}.georgefarrowgreen.com`), {}), `${name}.georgefarrowgreen.com`);
    assert.ok(!is(at('inflite.ai'), {}) && !is(at('georgefarrowgreen.com'), {}) && !is(at(`${name}.inflite.ai.evil.example`), {}), `${name}: nowhere else`);
  }
  assert.equal(oldApp('weather.georgefarrowgreen.com', {}), 'weather');
  assert.equal(oldApp('www.georgefarrowgreen.com', {}), null);
  assert.equal(siteOf('account.inflite.ai', {}), 'apps'); assert.equal(siteOf('georgefarrowgreen.com', {}), 'home'); assert.equal(siteOf('x.pages.dev', {}), null);
  assert.equal(appOrigin('fitness', {}), 'https://fitness.inflite.ai');
});
test('InFlight’s API answers at its own address (not only at the addresses a test names)', () => {
  const api = readFileSync(new URL('../../../functions/api/pigeon/[[path]].js', import.meta.url), 'utf8');
  assert.match(api, /const hostOk = \(h, env\) => HOSTS\.test\(h\) \|\| isChat\(\{ hostname: h \}, env\);/);
});
