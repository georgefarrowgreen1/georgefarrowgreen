// Execute the production asynchronous client functions with synthetic accounts and controllable IO.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IFL} from './fixtures/roof.mjs';
const fitness=readFileSync(new URL('../../../fitness/app.js',import.meta.url),'utf8');
const chat=readFileSync(new URL('../../../pigeon/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const tick=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
function decl(source,name){
 const match=new RegExp(`^(?:async function ${name}\\(|function ${name}\\(|const ${name} = )`,'m').exec(source);assert.ok(match,name);
 const at=match.index,line=source.slice(at,source.indexOf('\n',at));
 if(line.startsWith('const ')||line.endsWith('}'))return line;
 const end=source.indexOf('\n}',at);assert.ok(end>at,name);return source.slice(at,end+2);
}
function run(source,names,deps,prefix='',extra=''){
 return new Function(...Object.keys(deps),`${prefix}\n${names.map(n=>decl(source,n)).join('\n')}\n${extra}\nreturn {${names.join(',')}};`)(...Object.values(deps));
}
function fit({get=async()=>null,file=async()=>new Uint8Array([7]),read=async()=>({activities:[{start:1}]}),health=async()=>({on:true,key:'synthetic-upload-key'})}={}){
 const S={me:{id:'ann'},health:{on:false}},held=new Map(),values=new Map(),files=new Map(),requests=[],nodes=[];
 const store={get:(k,d)=>values.get(k)??d,set:(k,v)=>values.set(k,v)};
 const deps={S,held,store,FILES:50,filesUsed:()=>values.get('files')||[],idb:{get,put:async(k,v)=>files.set(k,v),del:async k=>files.delete(k),clear:async()=>files.clear()},
 A:{fileOf:async id=>{requests.push(id);return file(id);},healthKey:health},full:a=>held.get(a.id),fileKey:a=>`${S.me?.id}:${a.id}`,readOff:read,remember:(id,v)=>{held.set(id,v);return v;},
 healthView:()=>{},heldKey:()=>null,h:(tag,attrs,...children)=>{const node={tag,...attrs,children};nodes.push(node);return node;},section:(...a)=>a,Sheet:{redraw(){}},toast(){}};
 const api=run(fitness,['privateLease','privateLive','privateCheck','endPrivateWork','keepFile','load','forgetCopies','healthView'],deps,'let privateEpoch=0, meBase=null;');
 return{...api,S,held,values,files,requests,nodes};
}
const activity={id:'ride1',start:1,type:'fit',name:'Synthetic ride'};
test('Fitness late file responses cannot be written under a different account',async()=>{
 const job=deferred(),f=fit({file:()=>job.promise});const loading=f.load(activity);await tick();assert.equal(f.requests.length,1);
 f.S.me={id:'bea'};f.S.health={on:false};job.resolve(new Uint8Array([1,2]));await assert.rejects(loading,{name:'AbortError'});
 assert.equal(f.files.size,0);assert.equal(f.held.size,0);assert.equal(f.values.has('files'),false);
});
test('Fitness logout purges copies and rejects pending work even after the same account returns',async()=>{
 const job=deferred(),f=fit({file:()=>job.promise});f.files.set('ann:older',new Uint8Array([9]));
 const loading=f.load(activity);await tick();await f.forgetCopies();f.S.me={id:'ann'};
 job.resolve(new Uint8Array([2]));await assert.rejects(loading,{name:'AbortError'});assert.equal(f.files.size,0);assert.equal(f.held.size,0);assert.equal(f.values.get('hk'),null);
});
test('Fitness does not fetch old private files after an account changes during IndexedDB read',async()=>{
 const job=deferred(),f=fit({get:()=>job.promise});const loading=f.load(activity);f.S.me={id:'bea'};job.resolve(null);
 await assert.rejects(loading,{name:'AbortError'});assert.equal(f.requests.length,0);
});
test('Fitness late file parsing cannot repopulate the cleared activity map',async()=>{
 const job=deferred(),f=fit({read:()=>job.promise});const loading=f.load(activity);await tick();await f.forgetCopies();job.resolve({activities:[{start:1}]});
 await assert.rejects(loading,{name:'AbortError'});assert.equal(f.held.size,0);assert.equal(f.files.size,0);
});
test('Fitness normal file loading still caches the owner-scoped bytes and parsed activity',async()=>{
 const f=fit(),a=await f.load(activity);assert.equal(a.name,activity.name);assert.ok(f.files.has('ann:ride1'));assert.equal(f.held.get('ride1'),a);
});
for(const change of ['different account','same account after logout'])test(`Fitness late health key is discarded for ${change}`,async()=>{
 const job=deferred(),f=fit({health:()=>job.promise});f.healthView();const button=f.nodes.find(n=>n.tag==='button.btn');assert.ok(button);
 const making=button.onclick();if(change==='different account')f.S.me={id:'bea'};else await f.forgetCopies();const next={on:false};f.S.health=next;
 job.resolve({on:true,key:'synthetic-bearer-key'});await making;assert.equal(f.S.health,next);assert.ok(!f.values.get('hk'));assert.ok(!f.healthView.key);
});
test('Fitness normal health key is retained for its original owner',async()=>{
 const f=fit();f.healthView();await f.nodes.find(n=>n.tag==='button.btn').onclick();assert.equal(f.values.get('hk').id,'ann');assert.equal(f.S.health.on,true);
});
test('Fitness fetchMe cannot recreate a profile cache after logout; a normal cold and warm fetch still works',async()=>{
 const writes=[],job=deferred();
 // Expose the production generation variable through a fixture-only control.
 const make=new Function('A','lastMe',`let privateEpoch=0,meBase=null;${decl(fitness,'fetchMe')}return{fetchMe,release(){privateEpoch++;}}`);
 const f=make({me:()=>job.promise},{put:m=>writes.push(m)}),pending=f.fetchMe();f.release();job.resolve({signedIn:true,id:'ann',at:2});await assert.rejects(pending,{name:'AbortError'});assert.equal(writes.length,0);
 const normal=make({me:async()=>({signedIn:true,id:'ann',at:2,acts:[]})},{put:m=>writes.push(m)});
 assert.equal((await normal.fetchMe()).id,'ann');assert.equal((await normal.fetchMe({id:'ann',at:1})).id,'ann');assert.equal(writes.length,2);
});
function chatter({get=async()=>({sealed:true}),open=async()=>({d:[['friend','synthetic private draft']]}),seal=async()=>({sealed:true})}={}){
 const S={me:{id:'ann'},token:'ann-session',priv:{},myPub:{},drafts:new Map(),plain:new Map(),view:'messages',photos:new Map(),pctx:new Map(),outbox:[]},writes=[];
 const deps={S,$ta:null,E2E:{open,seal},idb:{get,set:async(k,v)=>writes.push([k,v]),del:async k=>writes.push([k,null])},pairFor:async()=>({}),clearTimeout(){},
 ctxOf:(kind,m,fid)=>`${kind}|${m.id}|${fid}`,seenPlain:()=>false,friend:()=>({}),keysOf:()=>['pub'],pubFromId:k=>k,shapeOK:()=>true,keepPlain:(id,ctx,o)=>S.plain.set(id,o)};
 const api=run(chat,['privacyLease','privacyLive','draftsSave','draftsLoad','decrypt'],deps,'let privacyEpoch=0,draftsTimer=0;');
 return{...api,S,writes};
}
for(const stage of ['read','decrypt'])test(`Chat rejects a late draft ${stage} after an account switch`,async()=>{
 const job=deferred(),c=chatter(stage==='read'?{get:()=>job.promise}:{open:()=>job.promise});const reading=c.draftsLoad();await tick();
 c.S.me={id:'bea'};c.S.token='bea-session';c.S.drafts=new Map();job.resolve(stage==='read'?{sealed:true}:{d:[['friend','synthetic private draft']]});await reading;
 assert.equal(c.S.drafts.size,0);
});
test('Chat a late message decryption never installs plaintext into the next account',async()=>{
 const job=deferred(),c=chatter({open:()=>job.promise}),reading=c.decrypt('friend',{id:'msg1',ct:'sealed',from:'friend',to:'ann'});await tick();
 c.S.me={id:'bea'};c.S.token='bea-session';c.S.plain=new Map();job.resolve({t:'synthetic private message'});await reading;assert.equal(c.S.plain.size,0);
});
test('Chat late draft encryption is discarded on a new session for the same owner',async()=>{
 const job=deferred(),c=chatter({seal:()=>job.promise});c.S.drafts.set('friend','synthetic private draft');const saving=c.draftsSave();await tick();
 c.S.token='another-ann-session';job.resolve({sealed:true});await saving;assert.equal(c.writes.length,0);
});
test('Chat normal drafts still decrypt and save in the unchanged encrypted storage format',async()=>{
 const c=chatter();await c.draftsLoad();assert.equal(c.S.drafts.get('friend'),'synthetic private draft');await c.draftsSave();assert.deepEqual(c.writes,[['drafts:ann',{sealed:true}]]);
});

test('Chat delayed pin synchronization cannot merge or upload a previous account’s trust store',async()=>{
 for(const stage of ['fetch','encrypt']){
  const job=deferred(),S={me:{id:'ann'},token:'ann-session',priv:{},myPub:{},pins:{friend:'trusted-A'},pinsUnread:false},posts=[],writes=[];let timer;
  const deps={S,idb:{set:async(k,v)=>writes.push([k,v])},clearTimeout(){},setTimeout:fn=>{timer=fn;return 1;},serverPins:async()=>stage==='fetch'?job.promise:{friend:'trusted-A'},
    pairFor:async()=>({}),E2E:{seal:async()=>stage==='encrypt'?job.promise:{sealed:true}},api:async(path,opts)=>posts.push([path,opts]),mergePins:(a,b)=>({...b,...a})};
  const c=run(chat,['privacyLease','privacyLive','savePins'],deps,'let privacyEpoch=0,pinsTimer=0;');c.savePins();const pending=timer();await tick();const before=writes.length;
  S.me={id:'bea'};S.token='bea-session';S.pins={friend:'trusted-B'};job.resolve(stage==='fetch'?{friend:'trusted-A'}:{sealed:true});await pending;
  assert.deepEqual(S.pins,{friend:'trusted-B'},stage);assert.equal(posts.length,0,stage);assert.equal(writes.length,before,'no additional trust-store writes after owner change');
 }
});
test('native Chat also fences late draft decrypt and shares the same trust/decrypt lifetime checks',async()=>{
 const core=readFileSync(new URL('../../../pigeon/roof/core.js',import.meta.url),'utf8'),job=deferred();
 const S={me:{id:'ann'},token:'ann-session',priv:{},myPub:{},drafts:new Map()};
 const c=run(core,['privacyLease','privacyLive','draftsLoad'],{S,idb:{get:async()=>({sealed:true})},openDrafts:()=>job.promise},'let privacyEpoch=0;');
 const reading=c.draftsLoad();await tick();S.me={id:'bea'};S.token='bea-session';S.drafts=new Map();job.resolve([['friend','synthetic A draft']]);await reading;assert.equal(S.drafts.size,0);
 assert.match(decl(core,'forget'),/privacyEpoch\+\+/);assert.match(decl(chat,'forget'),/privacyEpoch\+\+/);
});
test('private exception values never reach the reviewed top-level or provider console sinks',()=>{
 const probes=IFL?[[new URL('today/src/index.js',IFL),/console\.error\(err\)/],[new URL('today/src/hub.js',IFL),/console\.error\([^\n]*e\s*&&\s*e\.message/]]:[];
 for(const [path,forbidden] of [...probes,
   [new URL('../../../functions/_email.js',import.meta.url),/console\.error\([^\n]*why\)/],
   [new URL('../../../functions/_garmin.js',import.meta.url),/console\.error\([^\n]*e\.message/],
   [new URL('../../../functions/_strava.js',import.meta.url),/console\.error\([^\n]*e\.message/],
   [new URL('../../../functions/_status.js',import.meta.url),/console\.error\([^\n]*(?:e\.message|e\.stack)/]])assert.doesNotMatch(readFileSync(path,'utf8'),forbidden,String(path));
});

test('Fitness warm cached-profile adoption keeps its already pending validation fetch alive',async()=>{
 const job=deferred(),S={me:null,sums:new Map()},writes=[],noop=()=>{};
 const api=run(fitness,['privateLease','privateLive','privateCheck','endPrivateWork','arrive','fetchMe'],{
  S,held:new Map(),healthView:()=>{},A:{me:()=>job.promise,workoutIds:()=>[]},lastMe:{put:m=>writes.push(m)},lookOf:noop,adopt:noop,rescale:x=>x,P:()=>({}),
  document:{body:{classList:{remove:noop}}},drawTabs:noop,sumUp:noop,render:noop,estimate:noop,background:noop,
 },'let privateEpoch=0,meBase=null;');
 const pending=api.fetchMe({id:'ann',at:1});api.arrive({id:'ann',acts:[],signedIn:true},true);
 job.resolve({id:'ann',signedIn:true,acts:[],at:2});assert.equal((await pending).id,'ann');assert.equal(writes.length,1);
});

test('native Fitness late parsed activity cannot repopulate private memory after lifecycle release',async()=>{
 const source=readFileSync(new URL('../../../fitness/roof/core.js',import.meta.url),'utf8').replace(/^export /gm,''),job=deferred(),S={me:{id:'ann'}},Q={fw:{},gen:0},held=new Map();
 const c=run(source,['mark','still','load'],{S,Q,full:()=>null,fileKey:a=>`${S.me.id}:${a.id}`,idb:{get:async()=>null},A:{fileOf:async()=>new Uint8Array([1])},I:{keepFile(){}},
 readOff:()=>job.promise,remember:(id,x)=>held.set(id,x)});
 const reading=c.load(activity);await tick();Q.gen++;S.me={id:'bea'};job.resolve({activities:[{start:1}]});await assert.rejects(reading,{name:'AbortError'});assert.equal(held.size,0);
});
test('native Fitness Health responses respect sheet, owner and framework lifetime',async()=>{
 const source=readFileSync(new URL('../../../fitness/roof/fxsettings.js',import.meta.url),'utf8');
 const current=/  const current = [^\n]+/.exec(source)[0],owned=/  async function owned\(task\) \{[\s\S]*?\n  }/.exec(source)[0];
 const start=source.indexOf('  function healthPage()'),make=/      const make = async \(b\) => \{[\s\S]*?\n      };/.exec(source.slice(start))[0];
 for(const release of ['owner','framework','sheet']){
  const job=deferred(),S={me:{id:'ann'},health:{on:false}},controller=new AbortController(),fw={signal:controller.signal,session:{user:{id:'ann'}}};
  const c=new Function('S','fw','A',`let alive=true,healthKey=null;const owner=S.me.id;const redraw=()=>{},toast=()=>{},lost=()=>{};${current}\n${owned}\n${make}\nreturn{make,close(){alive=false;}};`)(S,fw,{healthKey:()=>job.promise});
  const pending=c.make({disabled:false});if(release==='owner'){S.me={id:'bea'};fw.session.user.id='bea';}else if(release==='framework')controller.abort();else c.close();
  const after={on:false};S.health=after;job.resolve({on:true,key:'synthetic-native-private-key'});await pending;assert.equal(S.health,after,release);
 }
});

function markets(){
 const source=readFileSync(new URL('../../../markets/app.js',import.meta.url),'utf8'),job=deferred(),S={me:{id:'ann'},list:[{symbol:'ANN'}],years:{},yearsAt:0,tab:'today',paid:null,inc:null},writes=[],applied=[];let signedOut=0;
 const deps={S,A:{years:()=>job.promise,paid:()=>job.promise,income:()=>job.promise,quotes:()=>job.promise},BENCHES:[],owned:()=>S.list,store:{set:(k,v)=>writes.push([k,v])},calm:()=>true,render(){},Sheet:{stack:[]},$:()=>null,stockView(){},incomeView(){},drawSheet(){},
 document:{hidden:false},INDICES:[],cashStore:{sync(){}},applyPrices:r=>applied.push(r),stream:{sync(){}},signedOut:()=>signedOut++,sayLine(){}};
 const names=['loadYears','loadPaid','loadIncome','refresh'],api=new Function(...Object.keys(deps),`let cashEpoch=0;${names.map(n=>decl(source,n)).join('\n')}return{${names.join(',')},release(){cashEpoch++;}};`)(...Object.values(deps));
 return{...api,S,job,writes,applied,signedOut:()=>signedOut};
}
for(const method of ['loadYears','loadPaid','loadIncome','refresh'])for(const change of ['owner','same-owner lifetime'])test(`Markets ${method} ignores a late private response after ${change} change`,async()=>{
 const c=markets(),reading=c[method]();await tick();if(change==='owner')c.S.me={id:'bea'};else c.release();c.S.list=[{symbol:'BEA'}];
 c.job.resolve({years:{ANN:{private:'synthetic-A-history'}},paid:{private:'synthetic-A-paid'},income:{private:'synthetic-A-income'},quotes:{ANN:{private:'synthetic-A-quote'}}});await reading;
 assert.deepEqual(c.S.years,{});assert.equal(c.S.paid,null);assert.equal(c.S.inc,null);assert.equal(c.writes.length,0);assert.equal(c.applied.length,0);
});
test('Markets ignores an old-session unauthorized response instead of signing out the new owner',async()=>{
 const c=markets(),reading=c.refresh();c.S.me={id:'bea'};c.job.resolve(Promise.reject(Object.assign(new Error('Synthetic old session ended'),{status:401})));await reading;assert.equal(c.signedOut(),0);
});
for(const method of ['loadPaid','loadIncome'])test(`Markets normal ${method} retains its own account response`,async()=>{
 const c=markets(),reading=c[method]();c.job.resolve({paid:{amount:12},income:{amount:34}});await reading;
 assert.equal((method==='loadPaid'?c.S.paid:c.S.inc).v.amount,method==='loadPaid'?12:34);
});

test('Chat delayed IndexedDB opening cannot put or delete after forget; explicit wipe still works',async()=>{
 const source=readFileSync(new URL('../../../pigeon/roof/idb.js',import.meta.url),'utf8').replace(/^export /gm,'');
 for(const operation of ['set','del']){
  const api=new Function(`${source}\nreturn{idb,set,del,wipe,get,gone};`)(),job=deferred(),writes=[],rows=new Map([['session',{synthetic:true}]]);
  const db={transaction(){const t={objectStore:()=>({put(v,k){writes.push(['put',k]);rows.set(k,v);return{result:k};},delete(k){writes.push(['delete',k]);rows.delete(k);return{};},get(k){return{result:rows.get(k)};}})};queueMicrotask(()=>t.oncomplete());return t;}};
  api.idb.open=()=>job.promise;
  const pending=operation==='set'?api.set('drafts:synthetic-owner',{sealed:true}):api.del('session');api.gone();job.resolve(db);
  assert.equal(await pending,null,operation);assert.equal(writes.length,0,operation);assert.ok(rows.has('session'));
  await api.wipe('session');assert.deepEqual(writes,[['delete','session']]);assert.equal(rows.has('session'),false);
 }
});
