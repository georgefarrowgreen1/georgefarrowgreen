// The two sites as production has them, with nothing in the environment (the end-to-end tests stand in addresses of
// their own, so they can't see a production address left out): every app at its inflite.ai address and its old one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isChat } from '../../../functions/_app.js';
import { isWeather } from '../../../functions/_wxapp.js';
import { isFitness } from '../../../functions/_fitapp.js';
import { isAccount } from '../../../functions/_acctapp.js';
import { siteOf, oldApp, appOrigin, todayOrigin, todayLinks } from '../../../functions/_sites.js';

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
test('Chat’s API answers at its own address (not only at the addresses a test names)', () => {
  const api = readFileSync(new URL('../../../functions/api/pigeon/[[path]].js', import.meta.url), 'utf8');
  assert.match(api, /const hostOk = \(h, env\) => HOSTS\.test\(h\) \|\| isChat\(\{ hostname: h \}, env\);/);
});
test('InFlite Today is at the apps’ site itself, and links to each app at its own address', () => {
  assert.equal(todayOrigin({}), 'https://inflite.ai');
  assert.equal(todayOrigin({}, new Request('https://account.inflite.ai/api/account/today/me')), 'https://inflite.ai', 'production: never the request’s own');
  assert.equal(todayOrigin({}, new Request('https://georgefarrowgreen.pages.dev/x')), 'https://inflite.ai');
  assert.deepEqual(todayLinks({}, null), { chat: 'https://chat.inflite.ai', weather: 'https://weather.inflite.ai', fitness: 'https://fitness.inflite.ai',
    finance: 'https://finance.inflite.ai', account: 'https://account.inflite.ai', auth: 'https://auth.inflite.ai' });
  // the tests' stood-in site, on the port the server's on
  const env = { APPS_SITE: 'ifl.test' }, req = new Request('http://account.ifl.test:8788/api/account/today/me');
  assert.equal(todayOrigin(env, req), 'http://ifl.test:8788');
  assert.equal(todayOrigin(env, 'http://account.ifl.test:8788/'), 'http://ifl.test:8788');
  assert.equal(todayOrigin(env), 'https://ifl.test', 'with no request (the About sheet’s ask): the site’s own, over https');
  assert.equal(todayLinks(env, req).chat, 'http://chat.ifl.test:8788');
  assert.equal(todayLinks(env, req).auth, 'http://auth.ifl.test:8788');
  assert.equal(todayLinks(env, null).finance, 'https://finance.ifl.test');
});
