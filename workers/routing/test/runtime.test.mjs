import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=new URL('../../../',import.meta.url),fixture=JSON.parse(readFileSync(new URL('.tools/tests/fixtures/cycling-loop.json',root))),config=readFileSync(new URL('wrangler.worker.jsonc',root),'utf8'),siteDate=/"compatibility_date": "([^"]+)"/.exec(config)[1];
test('the authenticated public pin probe forwards all three stops across the private Durable Object boundary in workerd', async () => {
 const routingRoot=new URL('../',import.meta.url);
 // The fixed pin probe does not query corridors. Supply a correctly sized index with one record per surface.
 const index=new Uint8Array(16+3*32),header=new DataView(index.buffer);
 header.setUint32(0,0x49464331);
 for(const offset of [4,8,12])header.setUint32(offset,1);
 const bundled=await build({
   stdin:{contents:`export {default} from './src/index.js';
     import {DurableObject} from 'cloudflare:workers';
     export class Engine extends DurableObject {
       fetch(request){return this.env.ENGINE.fetch(request);}
       ensureProfile(date,profile){return {ready:true,snapshot:date+'-graph-'+profile};}
     }`,resolveDir:routingRoot.pathname},
   bundle:true,minify:true,platform:'browser',format:'esm',write:false,external:['cloudflare:*'],loader:{'.brf':'text'},
   plugins:[{name:'corridor-fixture',setup(b){
     b.onResolve({filter:/corridors\.bin$/},()=>({path:'fixture',namespace:'index'}));
     b.onLoad({filter:/.*/,namespace:'index'},()=>({contents:'export default new Uint8Array('+JSON.stringify([...index])+').buffer;'}));
   }}],
 });
 let calls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-01',script:bundled.outputFiles[0].text,
   durableObjects:{ROUTER_POOL:'Engine'},bindings:{ROUTING_PROBE_TOKEN:'fixture'},
   serviceBindings:{ENGINE:async request=>{
     calls++;
     assert.equal(request.method,'POST');
     assert.equal(new URL(request.url).pathname,'/route');
     assert.equal(request.headers.get('content-type'),'application/x-www-form-urlencoded');
     const form=new URLSearchParams(await request.text());
     assert.equal(form.get('profile'),'road');assert.equal(form.get('mode'),'pins');
     const coordinates=form.get('lonlats').split('|').map(point=>point.split(',').map(Number));
     assert.deepEqual(coordinates,[[-.296178,51.450117],[-.256625,51.441439],[-.266024,51.451899]]);
     return Response.json({features:[{geometry:{type:'LineString',coordinates}}]});
   }},
 }));
 try {
   const probe = token=>mf.dispatchFetch('https://router.example/probe',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Routing-Check':'pins'}});
   assert.equal((await probe('wrong')).status,404);assert.equal(calls,0);
   const response=await probe('fixture'),data=await response.json();
   assert.equal(response.status,200);assert.deepEqual(data,{ready:true,status:200,points:3});assert.equal(calls,1);
   const release=await mf.dispatchFetch('https://router.example/probe',{method:'POST',headers:{Authorization:'Bearer fixture','X-Routing-Check':'release'}});
   const availability=await release.json();
   assert.equal(availability.ready,false,'an older Durable Object cannot certify a loop-only engine for pin routing');
   assert.deepEqual(availability.instances.map(i=>i.ready),[false,false]);
 } finally { await mf.dispose(); }
});
test('the exact loop planner can construct private POST requests and normalise tracks inside workerd',async()=>{
 const bundled=await build({stdin:{contents:`import {generateRoutes} from './functions/_fitloops.js'; const route=${JSON.stringify(fixture)};export default {async fetch(){try {let calls=0;const result=await generateRoutes({start:route.start,metres:33000,surface:'road',seed:1},{fetcher:async(url,init)=>{const request=new Request(url,init);calls++;if(request.method!=='POST'||new URL(request.url).search)throw Error('Unexpected routing request');return Response.json({features:[{geometry:{type:'LineString',coordinates:route.coords}}]});}});return Response.json({ready:result.routes.length>0,calls});}catch(e){return Response.json({error:e.message},{status:503});}}};`,resolveDir:root.pathname},bundle:true,format:'esm',platform:'browser',write:false});
 for(const date of new Set([siteDate,'2026-10-01'])){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:date,script:bundled.outputFiles[0].text}));
  try {const r=await mf.dispatchFetch('https://check/'),j=await r.json();assert.equal(r.status,200,JSON.stringify({date,...j}));assert.deepEqual(j,{ready:true,calls:6});}finally {await mf.dispose();}
 }
});
