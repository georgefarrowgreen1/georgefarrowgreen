import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest} from '../../../functions/api/routing-check.js';
const route=JSON.parse(readFileSync(new URL('../../../.tools/tests/fixtures/cycling-loop.json',import.meta.url)));
test('deployment route checks require the scheduler host and credential before invoking routing',async()=>{
 let calls=0;const env={TICK_HOST:'apps.example',PIGEON_TICK_SECRET:'probe-key',ROUTING_APP:{fetch:async r=>{calls++;assert.equal(r.method,'POST');assert.equal(new URL(r.url).search,'');return Response.json({features:[{geometry:{type:'LineString',coordinates:route.coords}}]});}}};
 const check=(host,method,token)=>onRequest({env,request:new Request('https://'+host+'/api/routing-check',{method,headers:token?{Authorization:'Bearer '+token}:{}})});
 assert.equal((await check('fitness.example','POST','probe-key')).status,404);
 assert.equal((await check('apps.example','GET','probe-key')).status,404);
 assert.equal((await check('apps.example','POST','wrong')).status,401);assert.equal(calls,0);
 const r=await check('apps.example','POST','probe-key'),j=await r.json();assert.equal(r.status,200);assert.equal(j.ready,true);assert.equal(j.count,1);assert.equal(calls,3);assert.equal('routes' in j,false);
});
