import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/_middleware.js';
import { unescaped, plainName, readPreview } from '../../../functions/_markets.js';
import { statusRoute } from '../../../functions/_status.js';

test('repository artifacts are refused before the asset server sees decoded or unusual paths', async () => {
  const paths = ['/docs/private.md','/functions/_account.js','/tests/fixtures.json','/node_modules/library/index.js','/package.json','/package-lock.json','/pnpm-lock.yaml','/yarn.lock','/%64ocs/private.md','//docs/private.md','/%2566unctions/_account.js','/docs%5cprivate.md'];
  for (const path of paths) {
    let assets = 0;
    const ctx = { request: new Request('https://georgefarrowgreen.com'+path), env: { ASSETS: { fetch: async () => { assets++; return new Response('PRIVATE'); } } }, next: async () => { assets++; return new Response('PRIVATE'); } };
    const r = await onRequest(ctx);
    assert.equal(r.status,404,path); assert.equal(assets,0,path);
  }
});

test('malformed entities in external market names and previews cannot crash parsing', () => {
  for (const entity of ['&#999999999999999999999999999999999;','&#x110000;','&#xFFFFFFFFFFFFFFFFFFFF;','&#xD800;','&#0;']) {
    assert.equal(unescaped('Name '+entity),'Name \ufffd');
    assert.doesNotThrow(()=>plainName('Example '+entity+' plc'));
    const p=readPreview('<title>News '+entity+'</title><meta name="description" content="Summary '+entity+'">','https://example.com/news');
    assert.ok(p.title.includes('\ufffd')); assert.ok(p.summary.includes('\ufffd'));
  }
  assert.equal(unescaped('AT&amp;T &#x1F600; &#65;'),'AT&T 😀 A');
});

test('public Status mutations reject foreign, opaque and missing origins before reading the body', async () => {
  for(const path of ['subscribe','unsubscribe']) for(const origin of [undefined,'null','https://evil.example','https://status.inflite.ai.evil.example']) {
    const request=new Request('https://status.inflite.ai/api/status/'+path,{method:'POST',headers:origin?{Origin:origin}:{},body:'{}'});
    const r=await statusRoute({request,env:{}},new URL(request.url));
    assert.equal(r.status,403,`${path}: ${origin}`);
  }
});

test('Status reads JSON within a byte cap, including chunked requests', async () => {
  for(const raw of ['x','x'.repeat(8193)]) {
    const bytes=new TextEncoder().encode(raw);
    const stream=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=1024)c.enqueue(bytes.slice(i,i+1024));c.close()}});
    const request=new Request('https://status.inflite.ai/api/status/unsubscribe',{method:'POST',headers:{Origin:'https://status.inflite.ai'},body:stream,duplex:'half'});
    const r=await statusRoute({request,env:{}},new URL(request.url));
    assert.equal(r.status,raw.length>8192?413:400);
  }
});

test('Fit Studio bounds login bodies and rejects malformed JSON without a server error', async () => {
  for(const raw of ['null','[]','x','x'.repeat(8193)]) {
    const request=new Request('https://fitting.georgefarrowgreen.com/api/login',{method:'POST',headers:{Origin:'https://fitting.georgefarrowgreen.com'},body:raw});
    const r=await onRequest({request,env:{FITTING_USERS:'Auditor:local-fixture-password'},waitUntil(){}});
    assert.equal(r.status,raw.length>8192?413:400,raw.slice(0,12));
  }
});
