import { test } from 'node:test';
import assert from 'node:assert/strict';
const req = (path = '/gone', headers = {}, method = 'GET') => new Request('https://fitness.inflite.ai' + path, { method, headers: { Accept: 'text/html', ...headers } });
const missing = () => new Response('original', {status: 404});
const page = () => new Response('<h1>InFlite</h1>', {status: 404, headers: {'Content-Type': 'text/html; charset=utf-8', 'X-Inflite-Error': '404'}});

test('only browser documents qualify, including HEAD and missing HTML documents', async () => {
  const { documentRequest } = await import('../../../functions/_notfound.js');
  for (const path of ['/gone', '/fitness/missing', '/missing.html', '/nested/missing.htm']) assert.ok(documentRequest(req(path)), path);
  assert.ok(documentRequest(req('/gone', {}, 'HEAD')));
  for (const path of ['/api/missing', '/fitness/api/missing', '/roof/gone', '/parts/gone', '/body/gone', '/.well-known/gone', '/cdn-cgi/gone', '/_hub/gone', '/missing.js', '/missing.css', '/missing.svg', '/missing%2Ejs', '/bad%ZZ']) assert.equal(documentRequest(req(path)), false, path);
  for (const headers of [{Accept: '*/*'}, {Accept: 'application/json'}, {Accept: 'text/html;q=0'}, {'Sec-Fetch-Dest': 'script'}, {'Sec-Fetch-Dest': 'empty'}, {'Sec-Fetch-Mode': 'cors'}]) assert.equal(documentRequest(req('/gone', headers)), false);
  assert.equal(documentRequest(req('/gone', {}, 'POST')), false);
});

test('proxy forwards no credentials or missing URL; preserves status and HEAD', async () => {
  const { sharedNotFound } = await import('../../../functions/_notfound.js');
  let count = 0;
  const service = {async fetch(request) {
    count++;
    assert.equal(request.url, 'https://inflite.ai/_errors/404');
    assert.deepEqual([...request.headers], [['accept', 'text/html']]);
    return page();
  }};
  const result = await sharedNotFound(req('/gone?private=value', {Cookie:'secret', Authorization:'Bearer secret'}), missing(), service);
  assert.equal(result.status, 404);
  assert.equal(await result.text(), '<h1>InFlite</h1>');
  assert.equal(await (await sharedNotFound(req('/gone', {}, 'HEAD'), missing(), service)).text(), '');
  for (const original of [new Response('valid'), new Response('denied', {status:403}), page()]) assert.equal(await sharedNotFound(req(), original, service), original);
  const original = missing();
  assert.equal(await sharedNotFound(req('/api/gone'), original, service), original);
  assert.equal(count, 2);
});

test('failed or stalled renderer preserves the original response', async () => {
  const { sharedNotFound } = await import('../../../functions/_notfound.js');
  for (const service of [undefined, {fetch: async () => {throw Error('down');}}, {fetch: async () => new Response('bad')}, {fetch: async () => new Response('wrong', {status:404})}, {fetch: () => new Promise(() => {})}, {fetch: async () => new Response(new ReadableStream({start(){}}), {status:404, headers:{'Content-Type':'text/html', 'X-Inflite-Error':'404'}})}]) {
    const original = missing();
    assert.equal(await sharedNotFound(req(), original, service, 15), original);
    assert.equal(await original.text(), 'original');
  }
});

test('middleware shares app document 404s, preserving portfolio, APIs, files and valid routes', async () => {
  const {onRequest} = await import('../../../functions/_middleware.js');
  let forwarded = 0;
  const env = {ASSETS:{fetch:async () => missing()}, TODAY_APP:{fetch:async () => {forwarded++; return page();}}};
  const call = (host, path='/gone', headers={}) => onRequest({request:new Request(`https://${host}${path}`, {headers:{Accept:'text/html',...headers}}),env,next:async () => missing(),params:{},data:{},waitUntil(){}});
  for (const host of ['weather','fitness','finance','chat','account','auth','status']) {
    const response = await call(`${host}.inflite.ai`);
    assert.equal(response.status,404,host);
    assert.equal(response.headers.get('X-Inflite-Error'),'404',host);
  }
  assert.equal(forwarded,7);
  for (const [host,path,headers] of [['fitness.inflite.ai','/gone.js',{}],['fitness.inflite.ai','/api/gone',{}],['fitness.inflite.ai','/gone', {Accept:'application/json'}],['georgefarrowgreen.com','/gone',{}],['fitting.georgefarrowgreen.com','/gone',{}]]) {
    assert.notEqual((await call(host,path,headers)).headers.get('X-Inflite-Error'),'404');
  }
  assert.equal(forwarded,7);
});
