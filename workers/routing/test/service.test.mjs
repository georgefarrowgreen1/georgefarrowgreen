import{test}from'node:test';import assert from'node:assert/strict';
import{inUK}from'../src/coverage.js';import{handleRoute,routeInput}from'../src/handler.js';import{PROBES,probeBody}from'../src/probes.js';
const request=start=>new Request('http://router/route',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:probeBody(start)});
test('coverage includes all four UK nations, Shetland and Scilly but excludes foreign starts',()=>{for(const p of PROBES)assert.ok(inUK(p.start),p.name);for(const p of [[2.3522,48.8566],[-6.26,53.35],[-74,40.7],[0,0]])assert.equal(inUK(p),false);});
test('private route requests are bounded closed loops with an explicit cycling profile',async()=>{assert.ok(await routeInput(request(PROBES[0].start)));assert.equal(await routeInput(new Request('http://router/route?location=private',{method:'POST',body:'x'})),null);assert.equal(await routeInput(new Request('http://router/route',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'profile=car&lonlats=x'})),null);});
test('a healthy primary is used once; failure/busy falls over to the standby without changing the route',async()=>{const calls=[];const get=k=>({fetch:async req=>{calls.push({k,url:req.url,body:await req.text()});return k==='uk-primary'?new Response('busy',{status:503}):Response.json({features:[]});}});const r=await handleRoute(request(PROBES[0].start),{}, {get});assert.equal(r.status,200);assert.deepEqual(calls.map(x=>x.k),['uk-primary','uk-standby']);assert.equal(calls[0].body,calls[1].body);assert.equal(new URL(calls[0].url).search,'','coordinates stay out of request URLs');});
test('unroutable candidates are not retried against identical data, and outage attempts are capped',async()=>{let calls=0;const r=await handleRoute(request(PROBES[0].start),{}, {get:()=>({fetch:async()=>{calls++;return new Response('{}',{status:422});}})});assert.equal(r.status,422);assert.equal(calls,1);calls=0;const down=await handleRoute(request(PROBES[0].start),{}, {get:()=>({fetch:async()=>{calls++;throw Error('unavailable');}})});assert.equal(down.status,503);assert.equal(calls,2);});
test('outside-UK inputs never start a container',async()=>{const r=await handleRoute(request([-6.26,53.35]),{}, {get(){throw Error('must not be called');}});assert.equal(r.status,422);assert.equal((await r.json()).error,'outside_coverage');});

test('only the owned cycling profiles and the legacy mixed profile reach the private service', async () => {
 for (const profile of ['road', 'road-quiet', 'road-paved', 'road-quiet-paved', 'gravel', 'gravel-rural', 'mtb', 'mtb-rural', 'mixed', 'car', '../road']) {
  const form = new URLSearchParams(probeBody(PROBES[0].start));
  form.set('profile', profile);
  const r = await routeInput(new Request('http://router/route', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form }));
  assert.equal(Boolean(r), !['car', '../road'].includes(profile), profile);
 }
});

test('measured retries accept up to eight shaping points and require a closed loop', async () => {
 const start=PROBES[0].start.join(',');
 const read=async(n,finish=start)=>{
  const via=Array.from({length:n},(_,i)=>[-.29+i*.001,51.45].join(','));
  const body=new URLSearchParams({profile:'gravel',lonlats:[start,...via,finish].join('|')});
  return routeInput(new Request('http://router/route',{method:'POST',body}));
 };
 assert.ok(await read(3));assert.ok(await read(8));
 assert.equal(await read(2),null);assert.equal(await read(9),null);
 assert.equal(await read(8,'-0.29,51.45'),null);
});

test('cancelling an active route reaches the container and skips standby', async () => {
 const stop = new AbortController(), started = Promise.withResolvers(), calls = [];
 const req = new Request(request(PROBES[0].start), {signal:stop.signal});
 const result = handleRoute(req, {}, {get:key=>({fetch(r) {
   calls.push(key); started.resolve();
   return new Promise((_,reject)=>r.signal.addEventListener('abort',()=>reject(r.signal.reason),{once:true}));
 }})});
 await started.promise;stop.abort();
 await assert.rejects(result,{name:'AbortError'});assert.deepEqual(calls,['uk-primary']);
});
