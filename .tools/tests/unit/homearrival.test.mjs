import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeArrival } from '../../../functions/_home.js';
const check = (href, { method = 'GET', cookie, referrer, env = {} } = {}) => {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (referrer) headers.set('Referer', referrer);
  const request = new Request(href, { method, headers });
  return homeArrival({ request, env }, new URL(href));
};
test('public documents render directly for fresh visits, bio links and outside referrals', async () => {
  for (const referrer of [undefined, 'https://georgefarrowgreen.com/missing', 'https://www.instagram.com/',
    'https://inflite.ai.example.org/', 'not a URL']) {
    assert.equal(await check('https://georgefarrowgreen.com/?keep=ride', { referrer }), null);
  }
});
test('arriving from InFlite can transfer a session before rendering, preserving the destination', async () => {
  const r = await check('https://georgefarrowgreen.com/?keep=ride', { referrer: 'https://inflite.ai/' });
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
test('checked guests and an unavailable session store can render the public document', async () => {
  const referrer = 'https://auth.inflite.ai/';
  assert.equal(await check('https://georgefarrowgreen.com/?__ifl_account=checked', { referrer }), null);
  assert.equal(await check('https://georgefarrowgreen.com/', { referrer, cookie: '__Secure-account=' + 'a'.repeat(32) }), null);
});
test('account preflight is confined to GET home documents, including the configured local site', async () => {
  const referrer = 'https://chat.inflite.ai/';
  for (const href of ['https://georgefarrowgreen.com/app.js', 'https://georgefarrowgreen.com/api/me', 'https://account.inflite.ai/', 'https://preview.example/']) assert.equal(await check(href, { referrer }), null);
  assert.equal(await check('https://georgefarrowgreen.com/', { method: 'HEAD', referrer }), null);
  const r = await check('http://gfg.test:8788/index.html', { referrer: 'http://account.ifl.test:8788/', env: { ACCOUNT_SITE: 'gfg.test', APPS_SITE: 'ifl.test' } });
  assert.equal(r.status, 302);
  assert.equal(new URL(r.headers.get('location')).origin, 'http://auth.ifl.test:8788');
});

test('messaging clients can read the public bio without following an account redirect', async () => {
  const url = new URL('https://georgefarrowgreen.com/');
  for (const agent of ['WhatsApp/2.0', 'facebookexternalhit/1.1 Twitterbot/1.0', 'Slackbot-LinkExpanding 1.0', 'Discordbot/2.0']) {
    const request = new Request(url, { headers: { 'User-Agent': agent, Referer: 'https://inflite.ai/' } });
    assert.equal(await homeArrival({ request, env: {} }, url), null);
  }
});
