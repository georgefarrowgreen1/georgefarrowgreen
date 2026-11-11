import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createWorkspace } from '../../../fitness/roof/workspace.js';
import { forgetRoutePlans } from '../../../fitness/routes-account.js';
import { startOfDay, measure } from '../../../fitness/workouts.js';
import { dayStamp } from '../../../fitness/roof/fxcalc.js';

const realRoute = JSON.parse(readFileSync(new URL('../fixtures/cycling-loop.json', import.meta.url)));
const TODAY = startOfDay(Date.now()), day = dayStamp(TODAY);
const workout = { id:'workspace-ride',name:'Endurance 90',kind:'Endurance',sport:'ride',steps:[{kind:'work',secs:5400,from:.65,to:.65}] };
const deferred = () => { let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve}; };
function setup({plan={route:realRoute,day,time:'09:00',tz:'Pacific/Auckland'},pending=null,ride=true}={}) {
 forgetRoutePlans();
 const controller=new AbortController(),listeners=new Map(['me','times','plan'].map(k=>[k,new Set()])),writes=[],downloads=[],sections=[];
 const S={me:{id:'ann'},loading:false,error:null,times:ride?[{day,start:TODAY+18*3600e3,stop:TODAY+19.5*3600e3,tz:'Europe/London',source:'set',sport:'ride'}]:[],wx:{d:{place:{name:'Norwich',rough:true},hours:[]}}};
 let provided,removed=0,changed=0,active=true,scope='a',context={location:null,interval:null};
 const fw={signal:controller.signal,session:{user:{id:'ann'}},nav:{section:k=>sections.push(k)},send:async()=>true,
  workspace:{enabled:true,active:()=>active,provide:p=>{provided=p;return()=>removed++;},changed:()=>changed++,context:{get:()=>context,capture:()=>{const captured=scope;return()=>scope===captured;},update:(patch,meta)=>{writes.push({patch,meta});context={...context,...patch};}}}};
 const core={S,TODAY,EVENTS:[...listeners.keys()],plannedOn:()=>ride?workout.id:null,wkById:()=>workout,allWorkouts:()=>[workout],actsOn:()=>[],paceFor:()=>4,sumOf:()=>null,BT:{bestWindow:()=>null},
  on:(k,f)=>{listeners.get(k).add(f);return()=>listeners.get(k).delete(f);},saveFile:async(name,file)=>downloads.push({name,file})};
 const root={classList:{remove() {}}},ctx={S,core,fw,open:{sendDevice:async()=>undefined}};
 const nativeFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options={})=>{requests.push({url,options});if(pending)return pending.promise;return Response.json({plan});};
 const bridge=createWorkspace(root,ctx),emit=k=>{for(const fn of listeners.get(k))fn();};
 return {S,fw,ctx,core,root,controller,bridge,downloads,requests,writes,sections,provided,emit,listeners,setActive:v=>active=v,setContext:v=>context=v,setContextScope:(id,value)=>{scope=id;context=value;},getContext:()=>context,get changed(){return changed;},get removed(){return removed;},close(){bridge.destroy();globalThis.fetch=nativeFetch;}};
}

// The native picker itself is a boundary: model its activation and the actual
// UI callbacks, while keeping browser trust/chooser checks in the app UI suite.
function filePicker(e,{activated=false}={}) {
 const nativeNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),activation={isActive:activated},sheets=[];
 let picks=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userActivation:activation}});
 const picker={value:'previous-file',click(){picks++;}};
 e.root.querySelector=selector=>selector==='input[type="file"][data-k="files"]'?picker:null;
 e.fw.ui={el:(tag,props={},...children)=>({tag,...props,children:children.flat()}),btn:(label,props={})=>({tag:'button',label,...props})};
 e.fw.sheet={open(spec){const sheet={spec,closed:false,now(){if(sheet.closed)return;sheet.closed=true;spec.onClose?.();}};sheets.push(sheet);return sheet;}};
 return {picker,sheets,activation,get picks(){return picks;},choose(sheet=sheets.at(-1)){const button=sheet.spec.body.children[1];activation.isActive=true;try{button.run();}finally{activation.isActive=false;}},restore(){if(nativeNavigator)Object.defineProperty(globalThis,'navigator',nativeNavigator);else delete globalThis.navigator;}};
}

test('cold import opens the native file gate, enables only after the domain owner arrives, and chooses through its explicit button',async()=>{
 const e=setup(),ui=filePicker(e);try{
  e.S.me=null;e.S.loading=true;
  assert.deepEqual(await e.provided.run('import-files'),{ok:true,pending:true});
  assert.equal(ui.picks,0);assert.equal(ui.sheets.length,1);
  const sheet=ui.sheets[0],[words,button]=sheet.spec.body.children;
  assert.equal(sheet.spec.sheet,'fitness-files');assert.equal(button.label,'Choose files');assert.equal(button.disabled,true);assert.match(words.textContent,/Loading/);
  ui.choose();assert.equal(ui.picks,0,'even a queued button callback cannot choose before Fitness owns the account');
  assert.equal((await e.provided.run('view-route')).ok,false,'other actions retain their domain ownership guard');assert.equal(e.requests.length,0);
  e.S.me={id:'ann'};e.S.loading=false;e.emit('me');
  assert.equal(button.disabled,false);assert.match(words.textContent,/Add a ride or workout/);assert.equal(ui.picks,0,'account readiness never opens a picker automatically');
  ui.choose();assert.equal(ui.picks,1);assert.equal(ui.picker.value,'');assert.equal(sheet.closed,true);
  assert.equal([...e.listeners.values()].reduce((n,s)=>n+s.size,0),3,'opening and closing the gate adds no core subscriptions');
 }finally{e.close();ui.restore();}
 assert.ok([...e.listeners.values()].every(s=>s.size===0));assert.equal(e.removed,1);
});

test('owned imports choose directly with activation and use the explicit gate after activation is lost',async()=>{
 for(const activated of [true,false]){
  const e=setup(),ui=filePicker(e,{activated});try{
   assert.equal((await e.provided.run('import-files')).ok,true);
   assert.equal(ui.picks,activated?1:0);assert.equal(ui.sheets.length,activated?0:1);
   if(!activated){assert.equal(ui.sheets[0].spec.body.children[1].disabled,false);ui.choose();assert.equal(ui.picks,1);assert.equal(ui.sheets[0].closed,true);}
  }finally{e.close();ui.restore();}
 }
});

test('retired import callers and accounts cannot choose files, and gate disposal releases UI and core listeners',async()=>{
 for(const retirement of ['caller','account','abort']){
  const e=setup(),ui=filePicker(e);let current=true;
  try{
   e.S.me=null;e.S.loading=true;
   assert.equal((await e.provided.run('import-files',undefined,{current:()=>current})).ok,true);
   const sheet=ui.sheets[0];
   if(retirement==='caller'){current=false;e.S.me={id:'ann'};e.emit('me');}
   else if(retirement==='account'){e.fw.session.user.id='bea';e.S.me={id:'bea'};e.controller.abort();}
   else e.controller.abort();
   ui.choose(sheet);assert.equal(ui.picks,0,retirement);assert.equal(sheet.closed,true,retirement);
   assert.equal((await e.provided.run('import-files',undefined,{current:()=>current})).ok,false);
   assert.equal(ui.sheets.length,1,'a retired callback cannot create replacement UI');
   e.bridge.destroy();e.bridge.destroy();assert.equal(e.removed,1);assert.ok([...e.listeners.values()].every(s=>s.size===0));
  }finally{e.close();ui.restore();}
 }
});

test('workspace snapshot uses actual workout/time/place and opaque validated route-file metadata without publishing coordinates',async()=>{
 const e=setup();try{const s=await e.provided.snapshot();assert.equal(s.status,'ready');assert.equal(s.ride.title,workout.name);assert.equal(s.ride.durationSeconds,5400);assert.equal(s.ride.tss,measure(workout).tss);assert.equal(s.ride.scheduled.start,e.S.times[0].start);assert.deepEqual(s.ride.place,{name:'Norwich',rough:true});assert.equal(s.ride.bestWindow,null);assert.deepEqual(s.route.schedule,{day,time:'09:00',tz:'Pacific/Auckland'});assert.equal(s.files[0].routeId,realRoute.id);assert.equal(s.files[0].mime,'application/gpx+xml');assert.ok(!JSON.stringify(s).includes('51.450117'));assert.ok(!JSON.stringify(s).includes('coords'));assert.deepEqual(e.writes,[]);assert.ok(e.requests.every(r=>(r.options.method||'GET')==='GET'));}finally{e.close();}
});

test('Files enumerates the actual GPX and workout library while hidden, with native FIT/ZWO support and no private geometry',async()=>{
 const e=setup();try{
  e.setActive(false);
  const result=await e.provided.files({current:()=>true});assert.equal(result.status,'ready');assert.equal(result.files.length,3);
  const gpx=result.files.find(f=>f.mime==='application/gpx+xml');assert.equal(gpx.id,`fitness:route:${realRoute.id}`);assert.equal(gpx.intent,'view-route');assert.equal(gpx.downloadIntent,'export-route');assert.equal(gpx.objectId,gpx.id);
  assert.deepEqual(result.files.filter(f=>f.app==='fitness').map(f=>f.name.split('.').at(-1)).sort(),['fit','gpx','zwo']);
  assert.ok(!JSON.stringify(result).includes('coords'));assert.ok(!JSON.stringify(result).includes(String(realRoute.start[0])));
  assert.equal((await e.provided.files({query:'Endurance',current:()=>true})).files.length,2);
  assert.deepEqual((await e.provided.files({current:()=>false})).files,[]);
  e.S.loading=true;assert.equal((await e.provided.files()).status,'loading');
 }finally{e.close();}
});

test('Files exports a real native FIT and ZWO rather than invented formats, and inactive or missing resources cannot export',async()=>{
 const e=setup();try{
  e.fw.lazy=fn=>fn('');
  const fit=(await e.provided.files()).files.find(f=>f.name.endsWith('.fit'));
  const result=await e.provided.run(fit.downloadIntent,fit.objectId);assert.equal(result.ok,true);assert.equal(result.file.type,'application/vnd.ant.fit');
  const bytes=new Uint8Array(await result.file.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(8,12)),'.FIT');assert.ok(bytes.length>40);
  const zwo=(await e.provided.files()).files.find(f=>f.name.endsWith('.zwo'));
  const zw=await e.provided.run(zwo.downloadIntent,zwo.objectId);assert.equal(zw.ok,true);assert.match(await zw.file.text(),/<workout_file>/);assert.match(await zw.file.text(),/Duration="5400"/);
  assert.equal(e.downloads.length,2);
  assert.equal((await e.provided.run('download-workout-zwo',fit.objectId)).ok,false);
  e.setActive(false);assert.equal((await e.provided.run(fit.downloadIntent,fit.objectId)).ok,false);assert.equal(e.downloads.length,2);
  e.setActive(true);e.core.allWorkouts=()=>[];assert.equal((await e.provided.run(fit.downloadIntent,fit.objectId)).ok,false);assert.equal(e.downloads.length,2);
 }finally{e.close();}
});

test('delayed native format and editor imports cannot export or open after scene retirement or an account switch',async()=>{
 for(const intent of ['download-workout-fit','view-workout'])for(const accountChange of [false,true]){
  const e=setup(),pending=deferred();let current=true,opened=0;
  try{
   const ref=(await e.provided.files()).files.find(f=>f.name.endsWith('.fit'));
   e.fw.lazy=()=>pending.promise;
   const action=e.provided.run(intent,ref.objectId,{current:()=>current});
   if(accountChange){e.fw.session.user.id='bea';e.S.me={id:'bea'};}else current=false;
   pending.resolve({openWorkout(){opened++;},fitFromWorkout(){throw new Error('stale encoder must not run');}});
   assert.equal((await action).ok,false);assert.equal(opened,0);assert.equal(e.downloads.length,0);
  }finally{e.close();}
 }
});

test('explicit Weather action uses the real saved route start and real time, then follows confirmed time changes only while that location remains linked',async()=>{
 const e=setup();try{assert.equal((await e.provided.run('weather-for-ride')).ok,true);assert.deepEqual(e.writes[0],{patch:{location:{name:'Start of '+realRoute.name,lat:realRoute.start[1],lon:realRoute.start[0]},interval:{start:e.S.times[0].start,end:e.S.times[0].stop}},meta:{source:'fitness:weather-for-ride'}});e.S.times[0]={...e.S.times[0],start:TODAY+17*3600e3,stop:TODAY+18.5*3600e3};e.emit('me');assert.deepEqual(e.writes[1],{patch:{interval:{start:e.S.times[0].start,end:e.S.times[0].stop}},meta:{source:'fitness:ride-time'}});e.setContext({location:{lat:52,lon:1},interval:null});e.S.times=[];e.emit('times');assert.equal(e.writes.length,2,'a different Weather location is never overwritten');assert.equal(e.changed,2);}finally{e.close();}
});

test('route-only workspace clears stale preview time and does not invent a scheduled ride or enabled workout/share actions',async()=>{
 const e=setup({ride:false});try{const s=await e.provided.snapshot();assert.equal(s.ride,null);assert.ok(s.actions.filter(a=>['schedule','share','export-workout'].includes(a.id)).every(a=>!a.enabled));e.setContext({location:{lat:1,lon:1},interval:{start:1,end:2}});await e.provided.run('weather-for-ride');assert.equal(e.writes[0].patch.interval,null);assert.deepEqual(e.S.times,[]);}finally{e.close();}
});

test('indoor strength sessions do not invent an outdoor weather window or ride-time action',async()=>{
 const e=setup();try{e.S.times=[];e.S.wx.d.hours=[{t:Date.now()}];e.core.wkById=()=>({...workout,sport:'strength'});e.core.BT.bestWindow=()=>{throw new Error('outdoor weather should not run for strength');};const s=await e.provided.snapshot();assert.equal(s.ride.sport,'strength');assert.equal(s.ride.bestWindow,null);assert.equal(s.actions.find(x=>x.id==='schedule').enabled,false);assert.equal(s.actions.find(x=>x.id==='export-workout').enabled,false);}finally{e.close();}
});

test('GPX intent exports a real File with every validated point and stale file refs cannot export another route',async()=>{
 const e=setup();try{const s=await e.provided.snapshot(),ref=s.files[0];const result=await e.provided.run('export-route',ref.id);assert.equal(result.ok,true);assert.ok(result.file instanceof File);assert.equal(result.file.name,ref.name);assert.equal(result.file.type,'application/gpx+xml');const text=await result.file.text();assert.equal((text.match(/<trkpt /g)||[]).length,realRoute.coords.length);assert.equal(e.downloads.length,1);assert.equal(await e.downloads[0].file.text(),text);assert.equal((await e.provided.run('export-route','fitness:route:r-old-plan')).ok,false);assert.equal(e.downloads.length,1);assert.equal((await e.provided.run('view-route',ref.id)).ok,true);assert.deepEqual(e.sections,['routes']);assert.equal(e.ctx.routeToOpen.route.id,realRoute.id);}finally{e.close();}
});

test('late plan data after an account change cannot publish route metadata, files or context; aborted adapters unregister exactly once',async()=>{
 const pending=deferred(),e=setup({pending});try{const snapshot=e.provided.snapshot(),run=e.provided.run('export-route');e.fw.session.user.id='bea';e.S.me={id:'bea'};e.controller.abort();pending.resolve(Response.json({plan:{route:realRoute,day,time:'09:00',tz:'UTC'}}));const s=await snapshot;assert.equal(s.ride,null);assert.equal(s.route,null);assert.deepEqual(s.files,[]);assert.equal((await run).ok,false);assert.deepEqual(e.downloads,[]);assert.deepEqual(e.writes,[]);assert.equal(e.removed,1);assert.ok([...e.listeners.values()].every(s=>s.size===0));e.bridge.destroy();assert.equal(e.removed,1);}finally{e.close();}
});

test('hidden pane actions have no side effects and route availability remains honest after a failed account request',async()=>{
 const e=setup({plan:null});try{assert.deepEqual((await e.provided.snapshot()).files,[]);assert.equal((await e.provided.run('export-route')).ok,false);e.setActive(false);assert.equal((await e.provided.run('weather-for-ride')).ok,false);assert.equal((await e.provided.run('view-route')).ok,false);assert.deepEqual(e.sections,[]);assert.deepEqual(e.downloads,[]);assert.deepEqual(e.writes,[]);}finally{e.close();}
});

test('a delayed route action belongs to its initiating presentation even when Fitness remains active in another workspace or returns to the original workspace',async()=>{
 for(const intent of ['weather-for-ride','view-route','export-route'])for(const returnToOriginal of [false,true]){
  const pending=deferred(),e=setup({pending});let scene=0;const initiatingScene=scene;
  try{
   const result=e.provided.run(intent,undefined,{current:()=>scene===initiatingScene});
   assert.equal(e.requests.length,1,'the real saved route request started');
   scene++;
   if(returnToOriginal)scene++;
   assert.equal(e.fw.workspace.active(),true,'another presentation can keep the same Fitness instance active');
   pending.resolve(Response.json({plan:{route:realRoute,day,time:'09:00',tz:'UTC'}}));
   assert.equal((await result).ok,false,intent+(returnToOriginal?' after leaving and returning':' after switching'));
   assert.deepEqual(e.writes,[],'no other workspace context is changed');
   assert.deepEqual(e.sections,[],'no newer view is navigated');
   assert.deepEqual(e.downloads,[],'no stale file action is performed');
   assert.equal(e.ctx.routeToOpen,undefined);
  }finally{e.close();}
 }
});

test('a current delayed route action still publishes its real location and an already-retired invocation does not start a request',async()=>{
 const pending=deferred(),e=setup({pending});try{
  assert.equal((await e.provided.run('weather-for-ride',undefined,{current:()=>false})).ok,false);
  assert.deepEqual(e.requests,[]);
  const result=e.provided.run('weather-for-ride',undefined,{current:()=>true});
  pending.resolve(Response.json({plan:{route:realRoute,day,time:'09:00',tz:'UTC'}}));
  assert.equal((await result).ok,true);
  assert.equal(e.writes.length,1);
  assert.equal(e.writes[0].patch.location.lat,realRoute.start[1]);
  assert.equal(e.writes[0].patch.location.lon,realRoute.start[0]);
 }finally{e.close();}
});

test('a linked ride time follows its own workspace only, even if another workspace has the same route coordinates',async()=>{
 const e=setup();try{
  assert.equal((await e.provided.run('weather-for-ride')).ok,true);
  const originalContext=e.getContext();
  e.setContextScope('b',{...originalContext,interval:null});
  e.S.times[0]={...e.S.times[0],start:TODAY+17*3600e3,stop:TODAY+18.5*3600e3};
  e.emit('times');
  assert.equal(e.writes.length,1,'the matching location in another workspace is not an implicit ride link');
  e.setContextScope('a',originalContext);
  e.emit('times');
  assert.equal(e.writes.length,2,'returning to the linked workspace retains the confirmed time link');
  assert.deepEqual(e.writes[1],{patch:{interval:{start:e.S.times[0].start,end:e.S.times[0].stop}},meta:{source:'fitness:ride-time'}});
 }finally{e.close();}
});

const contextFile=new URL('../../../../inflite/today/public/roof/workspace-context.js',import.meta.url);
test('the real shared context rounds route coordinates and still follows confirmed ride-time changes; old scheduled metadata never becomes a fake forecast interval',{skip:!existsSync(contextFile)},async()=>{
 const {createWorkspaceContext}=await import(contextFile),bus=createWorkspaceContext(),e=setup();e.fw.workspace.context=bus;
 try{assert.equal((await e.provided.run('weather-for-ride')).ok,true);assert.equal(bus.get().location.lat,Number(realRoute.start[1].toFixed(6)));e.S.times[0]={...e.S.times[0],start:TODAY+17*3600e3,stop:TODAY+18.5*3600e3};e.emit('times');assert.deepEqual(bus.get().interval,{start:e.S.times[0].start,end:e.S.times[0].stop});e.S.times[0]={...e.S.times[0],start:TODAY-2*864e5,stop:TODAY-2*864e5+5400e3};e.emit('times');assert.equal(bus.get().interval,null);const snapshot=await e.provided.snapshot();assert.equal(snapshot.ride.scheduled.start,e.S.times[0].start,'the actual account time is still reported without reinterpretation');assert.equal((await e.provided.run('weather-for-ride')).ok,true);assert.equal(bus.get().interval,null);}finally{e.close();bus.dispose();}
});
