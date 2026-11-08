import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeArrival } from '../../../functions/_home.js';
const check = (href, { method = 'GET', cookie, env = {} } = {}) => {
  const request = new Request(href, { method, headers: cookie ? { Cookie: cookie } : {} });
  return homeArrival({ request, env }, new URL(href));
};
test('anonymous homepage resolves the account before returning any HTML, preserving its destination', async () => {
  const r = await check('https://georgefarrowgreen.com/?keep=ride');
  assert.equal(r.status, 302);
  assert.equal(await r.text(), '');
  const issue = new URL(r.headers.get('location')), to = new URL(issue.searchParams.get('to'));
  assert.equal(issue.origin, 'https://auth.inflite.ai');
  assert.equal(issue.pathname, '/api/hop/issue');
  assert.match(issue.searchParams.get('n'), /^[a-f0-9]{64}$/);
  assert.equal(to.origin, 'https://georgefarrowgreen.com');
  assert.equal(to.searchParams.get('keep'), 'ride');
  assert.equal(to.searchParams.get('__ifl_account'), 'checked');
  assert.match(r.headers.get('set-cookie'), /Path=\/api\/hop\/; HttpOnly; SameSite=Lax/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('checked guests and existing sessions proceed to their document without another hand-off', async () => {
  assert.equal(await check('https://georgefarrowgreen.com/?__ifl_account=checked'), null);
  assert.equal(await check('https://georgefarrowgreen.com/', { cookie: '__Secure-account=' + 'a'.repeat(32) }), null);
});
test('account preflight is confined to GET home documents, including the configured local site', async () => {
  for (const href of ['https://georgefarrowgreen.com/app.js', 'https://georgefarrowgreen.com/api/me', 'https://account.inflite.ai/', 'https://preview.example/']) assert.equal(await check(href), null);
  assert.equal(await check('https://georgefarrowgreen.com/', { method: 'HEAD' }), null);
  const r = await check('http://gfg.test:8788/index.html', { env: { ACCOUNT_SITE: 'gfg.test', APPS_SITE: 'ifl.test' } });
  assert.equal(r.status, 302);
  assert.equal(new URL(r.headers.get('location')).origin, 'http://auth.ifl.test:8788');
});
