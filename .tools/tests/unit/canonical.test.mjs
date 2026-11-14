import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicApp, canonicalDocument } from '../../../functions/_canonical.js';
import { todayLinks, appOrigin } from '../../../functions/_sites.js';
test('public navigation uses one canonical origin while service origins stay native', () => {
  assert.equal(publicApp('chat'), 'https://inflite.ai/chats');
  assert.equal(publicApp('finance'), 'https://inflite.ai/markets');
  assert.equal(publicApp('email'), 'https://inflite.ai/mail');
  assert.equal(publicApp('status'), 'https://inflite.ai/status');
  assert.equal(appOrigin('weather', {}), 'https://weather.inflite.ai');
  assert.deepEqual(todayLinks({}), { chat:'https://inflite.ai/chats', weather:'https://inflite.ai/weather', fitness:'https://inflite.ai/fitness', finance:'https://inflite.ai/markets', email:'https://inflite.ai/mail', account:'https://inflite.ai/account', auth:'https://inflite.ai/auth' });
  assert.equal(publicApp('chat', { APPS_SITE: 'ifl.test' }, new Request('http://chat.ifl.test:8788/x')), 'http://ifl.test:8788/chats');
  assert.throws(() => publicApp('evil'));
});
test('old human app documents redirect directly, preserving path/query and inheriting fragments', () => {
  for (const [host, path] of [['status','status']]) {
    const r = canonicalDocument(new Request(`https://${host}.inflite.ai/detail?q=a%20b`, {headers:{Accept:'text/html','Sec-Fetch-Dest':'document'}}));
    assert.equal(r.status,308); assert.equal(r.headers.get('Location'),`https://inflite.ai/${path}/detail?q=a%20b`);
    assert.equal(r.headers.get('Cache-Control'),'no-store');
    assert.equal(new URL(r.headers.get('Location')).hash,''); // HTTP redirects inherit the browser's fragment.
  }
  for (const host of ['chat','weather','fitness','finance']) assert.equal(canonicalDocument(new Request(`https://${host}.inflite.ai/`,{headers:{Accept:'text/html','Sec-Fetch-Dest':'document'}})),null,'origin-local unsynced data remains reachable through legacy documents');
});
test('APIs, assets, service requests and lookalike domains retain their original routing', () => {
  for (const path of ['/api/pigeon/me','/_hub/','/version','/.well-known/webauthn']) assert.equal(canonicalDocument(new Request('https://chat.inflite.ai'+path,{headers:{Accept:'text/html'}})),null);
  for (const headers of [{Accept:'application/javascript','Sec-Fetch-Dest':'script'},{Accept:'text/html','X-Hub-Key':'test'},{Accept:'text/html','X-Hub-Ok':'1'},{}]) assert.equal(canonicalDocument(new Request('https://weather.inflite.ai/',{headers})),null);
  assert.equal(canonicalDocument(new Request('https://weather.inflite.ai.evil.test/',{headers:{Accept:'text/html'}})),null);
  assert.equal(canonicalDocument(new Request('https://weather.inflite.ai/',{method:'POST',headers:{Accept:'text/html'}})),null);
});

test('canonical email artwork traverses the real identity and app middleware to the unchanged PNG asset', async () => {
  const { readFileSync } = await import('node:fs');
  const { identity } = await import('../../../../inflite/today/src/identity.js');
  const { onRequest } = await import('../../../functions/_middleware.js');
  const expected = readFileSync(new URL('../../../mail/account-shield.png', import.meta.url));
  const backend = { HUB_KEY: 'canonical-art-test', ASSETS: { async fetch(request) {
    assert.equal(new URL(request.url).pathname, '/mail/account-shield.png');
    return new Response(expected, { headers: { 'Content-Type': 'image/png' } });
  } } };
  const env = { HUB_KEY: backend.HUB_KEY, APPS: { fetch: request => onRequest({ request, env: backend, next() { throw Error('Artwork leaked into home routing'); } }) } };
  const response = await identity(new Request('https://inflite.ai/account/mail/account-shield.png', {headers:{Accept:'image/png'}}), env);
  assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),'image/png');
  assert.equal(response.headers.get('cache-control'),'public, max-age=604800');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);
});

test('standalone Fitness and Markets public navigation uses apex while local test origins remain usable', async () => {
  const previous = globalThis.location;
  const fitness = await import('../../../fitness/account.js'), markets = await import('../../../markets/account.js');
  try {
    for (const [api, host] of [[fitness,'fitness.inflite.ai'],[markets,'finance.inflite.ai']]) {
      globalThis.location = new URL('https://' + host + '/');
      assert.equal(api.accountPage(),'https://inflite.ai/account/'); assert.equal(api.authPage(),'https://inflite.ai/auth/');
      globalThis.location = new URL('https://inflite.ai/' + (api === fitness ? 'fitness/' : 'markets/'));
      assert.equal(api.accountPage(),'https://inflite.ai/account/'); assert.equal(api.authPage(),'https://inflite.ai/auth/');
    }
    assert.equal(markets.chatPage(),'https://inflite.ai/chats/');
    globalThis.location = new URL('http://finance.ifl.test:8788/');
    assert.equal(markets.accountPage(),'http://account.ifl.test:8788/'); assert.equal(markets.authPage(),'http://auth.ifl.test:8788/');
  } finally { if (previous === undefined) delete globalThis.location; else globalThis.location = previous; }
});
