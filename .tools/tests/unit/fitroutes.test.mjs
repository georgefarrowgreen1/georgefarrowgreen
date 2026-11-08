import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {cleanRoute,metresBetween,toGPX,geometry,estimate} from '../../../fitness/routes-geometry.js';
import {cleanQuery,waypoints,generateRoutes,cleanRoutePlan,saveRoutePlan,routePlan,dropRoutePlan,exportRouteData,deleteRouteData} from '../../../functions/_fitroutes.js';
import {onRequest} from '../../../functions/api/fitness/[[path]].js';
import {db,issueSession,hex,sha256} from '../../../functions/_pigeon.js';
import {fitdb} from '../../../functions/_fitness.js';
const route=JSON.parse(readFileSync(new URL('../fixtures/cycling-loop.json',import.meta.url))),query={start:route.start,metres:33000,surface:'road',seed:1};
const sql=new DatabaseSync(':memory:'),val=a=>a.map(x=>x===undefined?null:x);
const st=(q,a=[])=>({sql:q,bind:(...b)=>st(q,b),first:async()=>sql.prepare(q).get(...val(a))??null,all:async()=>({results:sql.prepare(q).all(...val(a)),meta:{}}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...val(a)).changes)}})});
const env={DB:{prepare:q=>st(q),batch:async list=>{const out=[];for(const s of list)out.push(/^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql)?await s.run():await s.all());return out;}},FITNESS_HOST:'fitness.localhost',ROUTING_APP:{fetch:request=>globalThis.fetch(request)}};
await db(env);await fitdb(env);
const FIT='http://fitness.localhost',cookies={};
for(const id of ['ann','bo']){sql.prepare('INSERT INTO pg_users (id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,id,id,id+'@example.com','{}','s','p','v',9,0,0);const h=hex(await sha256(await issueSession(env,id,new Request(FIT+'/api/fitness/me'))));cookies[id]=('f'+id).padEnd(43,'x');sql.prepare('UPDATE pg_sessions SET site_hash = ? WHERE hash = ?').run(hex(await sha256(cookies[id])),h);}
const api=(method,path,{who='ann',origin=FIT,data}={})=>onRequest({env,params:{path:path.split('/')},waitUntil(){},request:new Request(FIT+'/api/fitness/'+path,{method,headers:{...(who?{Cookie:'account='+cookies[who]}:{}),...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})})}).then(async r=>({status:r.status,body:await r.json()}));
const day=new Date(Date.now()+86400e3).toISOString().slice(0,10),plan={route,day,time:'09:00',tz:'UTC'};
test('location and route filters are bounded; each waypoint loop starts and ends at the requested GPS point',()=>{
 assert.deepEqual(cleanQuery(query),{...query,roadPreference:"main",avoidUnpaved:true});for(const b of [{start:[181,51]},{metres:0},{metres:120001},{metres:5.5},{surface:'motorcar'},{seed:-1},{start:['-0.2',51]}])assert.throws(()=>cleanQuery({...query,...b}),{status:400});
 for(const bearing of [0,90,180,270]){const w=waypoints(query,bearing);assert.deepEqual(w[0],query.start);assert.deepEqual(w.at(-1),query.start);assert.equal(w.length,5);assert.ok(metresBetween(w[0],w[1])>1000);}
});
test('generated tracks are closed, near the GPS origin, continuous and carry real GPX elevations without recorded timestamps',()=>{
 const r=cleanRoute(route);assert.ok(r);assert.equal(r.snap,0);assert.ok(estimate(r)>0);assert.equal(geometry(r).coords.length,r.coords.length);const gpx=toGPX({...r,name:'My & <route>'});assert.match(gpx,/My &amp; &lt;route&gt;/);assert.equal((gpx.match(/<trkpt /g)||[]).length,r.coords.length);assert.ok(!gpx.includes('<time>'));
 for(const bad of [{start:[0,0]},{coords:r.coords.slice(0,-50)},{coords:[[Infinity,51],...r.coords.slice(1)]},{coords:[r.coords[0],[20,52,1],...r.coords.slice(2)]}])assert.equal(cleanRoute({...r,...bad}),null);
 const twoD=cleanRoute({...r,coords:r.coords.map(c=>c.slice(0,2))});assert.equal(twoD.elevation,false);assert.equal(twoD.ascent,null);assert.ok(!toGPX(twoD).includes('<ele>'));
});
test('provider requests follow fixed bicycle profiles and return validated geometry; failures and unsuitable loops stay explicit',async()=>{
 const calls=[],fetcher=async(url,opts)=>{calls.push({url:new URL(url),opts,form:new URLSearchParams(opts.body)});return Response.json({features:[{geometry:{type:'LineString',coordinates:route.coords}}]});};
 const got=await generateRoutes(query,{fetcher});assert.equal(calls.length,6);assert.equal(got.routes.length,1,'duplicate candidates are removed');assert.equal(got.partial,true);assert.equal(calls[0].url.origin,'https://routing.internal');assert.equal(calls[0].form.get('profile'),'road-paved');assert.equal(calls[0].url.search,'');assert.equal(calls[0].opts.method,'POST');assert.equal(got.routes[0].name,'Recommended loop');
 await generateRoutes({...query,surface:'mixed'},{fetcher});assert.equal(calls[6].form.get('profile'),'mixed');
 await assert.rejects(generateRoutes(query,{fetcher:async()=>new Response('unavailable',{status:503})}),{status:503});
 await assert.rejects(generateRoutes(query,{fetcher:async()=>Response.json({features:[]})}),{status:422});
 await assert.rejects(generateRoutes({...query,start:[2.35,48.85]},{fetcher}),{status:422});
 const c=new AbortController();c.abort();await assert.rejects(generateRoutes(query,{signal:c.signal,fetcher}),{status:503});
});
test('route generation requires the signed-in account and own origin; malformed input never reaches a provider',async()=>{
 assert.equal((await api('POST','routes/generate',{who:null,data:query})).status,401);assert.equal((await api('POST','routes/generate',{origin:'http://elsewhere.localhost',data:query})).status,403);assert.equal((await api('POST','routes/generate',{origin:null,data:query})).status,403);assert.equal((await api('POST','routes/generate',{data:{...query,metres:0}})).status,400);
});
test('real route plans sync per account without changing training state; stale removal cannot erase a replacement',async()=>{
 const first=await api('PUT','routes/plan',{data:plan});assert.equal(first.status,200);assert.equal((await api('GET','routes/plan')).body.plan.route.id,route.id);assert.equal((await api('GET','routes/plan',{who:'bo'})).body.plan,null);
 assert.equal((await api('PUT','routes/plan',{who:null,data:plan})).status,401);assert.equal((await api('PUT','routes/plan',{origin:'http://elsewhere.localhost',data:plan})).status,403);
 const newer={...plan,route:{...route,id:'r-replacement-loop'}};const replacement=await saveRoutePlan(env,'ann',newer);await api('DELETE','routes/plan',{data:{id:route.id,version:first.body.plan.version}});assert.equal((await routePlan(env,'ann')).route.id,newer.route.id);
 const changed=await saveRoutePlan(env,'ann',{...newer,time:'10:00'});await api('DELETE','routes/plan',{data:{id:newer.route.id,version:replacement.version}});assert.equal((await routePlan(env,'ann')).time,'10:00');
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM fx_acts').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM fx_state').get().n,0);
 const gone=await api('DELETE','routes/plan',{data:{id:newer.route.id,version:changed.version}});assert.equal(gone.status,200);assert.equal(gone.body.plan,null);
});
test('planned routes validate dates, geometry and time zones, and are included in export and account deletion',async()=>{
 for(const b of [{day:'2026-02-30'},{time:'25:00'},{tz:'Missing/Zone'},{route:{...route,start:[0,0]}},{day:'2000-01-01'}])assert.throws(()=>cleanRoutePlan({...plan,...b}),{status:400});
 await saveRoutePlan(env,'ann',plan);await saveRoutePlan(env,'bo',plan);assert.equal((await exportRouteData(env,'ann')).route.id,route.id);await deleteRouteData(env,'ann');assert.equal(await routePlan(env,'ann'),null);assert.ok(await routePlan(env,'bo'));await dropRoutePlan(env,'bo');
});


test('the signed-in generation endpoint bounds provider load and refuses duplicate concurrent work',async()=>{
 const native=globalThis.fetch;let providerCalls=0,started,release;
 const begun=new Promise(r=>started=r);
 globalThis.fetch=async()=>{providerCalls++;if(providerCalls===1){started();await new Promise(r=>release=r);}return Response.json({features:[{geometry:{type:'LineString',coordinates:route.coords}}]});};
 try {
  const first=api('POST','routes/generate',{data:query});await begun;
  assert.equal((await api('POST','routes/generate',{data:query})).status,409);
  release();const result=await first;assert.equal(result.status,200);assert.equal(providerCalls,6);assert.equal(result.body.routes[0].coords.length,route.coords.length);
  assert.equal(sql.prepare("SELECT count FROM pg_limits WHERE key = 'fxroutes:ann'").get().count,1);
  sql.prepare("UPDATE pg_limits SET count = 12 WHERE key = 'fxroutes:ann'").run();
  assert.equal((await api('POST','routes/generate',{data:query})).status,429);assert.equal(providerCalls,6,'a quota refusal never reaches the provider');
 } finally {globalThis.fetch=native;}
});

test('distance drives recalibration and rejects candidates outside ten percent',async()=>{
 const legacy=cleanQuery({start:query.start,minutes:90,speed:22,surface:'road',seed:1});assert.equal(legacy.metres,31167);
 assert.deepEqual(cleanQuery({...query,speed:10,minutes:240}),cleanQuery(query));
 assert.deepEqual(waypoints(cleanQuery({...query,speed:40}),90),waypoints(query,90));
 const coords=(factor,z=1)=>route.coords.map(c=>[query.start[0]+(c[0]-query.start[0])*factor,query.start[1]+(c[1]-query.start[1])*factor,c[2]*z]);
 const calls=[];let n=0;
 const got=await generateRoutes(query,{fetcher:async(url,init)=>{calls.push(new URLSearchParams(init.body).get('lonlats').split('|').map(p=>p.split(',').map(Number)));return Response.json({features:[{geometry:{type:'LineString',coordinates:coords(query.metres/route.metres*(n++===0?1.18:1.02))}}]});}});
 assert.equal(got.routes.length,1);assert.ok(Math.abs(got.routes[0].metres-query.metres)/query.metres<.05);
 assert.ok(calls.length<=9);assert.ok(metresBetween(calls[1][0],calls[1][1])<metresBetween(calls[0][0],calls[0][1]),'an overlong candidate shrinks the next attempt');
 assert.equal(got.routes[0].targetMetres,query.metres);
 await assert.rejects(generateRoutes({...query,metres:5000},{fetcher:async()=>Response.json({features:[{geometry:{type:'LineString',coordinates:route.coords}}]})}),{status:422});
});
