import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=new URL('../../../',import.meta.url),fixture=JSON.parse(readFileSync(new URL('.tools/tests/fixtures/cycling-loop.json',root))),config=readFileSync(new URL('wrangler.worker.jsonc',root),'utf8'),siteDate=/"compatibility_date": "([^"]+)"/.exec(config)[1];
test('the exact loop planner can construct private POST requests and normalise tracks inside workerd',async()=>{
 const bundled=await build({stdin:{contents:`import {generateRoutes} from './functions/_fitloops.js'; const route=${JSON.stringify(fixture)};export default {async fetch(){try {let calls=0;const result=await generateRoutes({start:route.start,metres:33000,surface:'road',seed:1},{fetcher:async(url,init)=>{const request=new Request(url,init);calls++;if(request.method!=='POST'||new URL(request.url).search)throw Error('Unexpected routing request');return Response.json({features:[{geometry:{type:'LineString',coordinates:route.coords}}]});}});return Response.json({ready:result.routes.length>0,calls});}catch(e){return Response.json({error:e.message},{status:503});}}};`,resolveDir:root.pathname},bundle:true,format:'esm',platform:'browser',write:false});
 for(const date of new Set([siteDate,'2026-10-01'])){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:date,script:bundled.outputFiles[0].text}));
  try {const r=await mf.dispatchFetch('https://check/'),j=await r.json();assert.equal(r.status,200,JSON.stringify({date,...j}));assert.deepEqual(j,{ready:true,calls:6});}finally {await mf.dispose();}
 }
});
