import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {E2E} from '../../../pigeon/crypto.js';
const require=createRequire(new URL('../package.json',import.meta.url)),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const ROOT=resolve(fileURLToPath(new URL('../../..',import.meta.url))),HOST='https://account.inflite.ai';let mf,seq=0;
const script=`
import {SYSTEM_ROUTES} from './functions/_systemapp.js';
import {FILES_ROUTES} from './functions/_filesapp.js';
import {systemdb} from './functions/_system350.js';
import {db,issueSession,hex,sha256} from './functions/_pigeon.js';
import {withSession} from './functions/_account.js';
import {removeAccount} from './functions/_accounts.js';
import {reminderTick} from './functions/_actiontick.js';
const json=(v,s=200)=>Response.json(v??null,{status:s});
export default{async fetch(request,env,ctx){try{
 const url=new URL(request.url),path=url.pathname;
 if(path==='/_seed'){const {owner}=await request.json(),D=await db(env),now=Date.now();await D.prepare('INSERT INTO pg_users(id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(owner,owner,owner,owner+'@example.test','test','test','test','test',1,now,now).run();const token=await issueSession(env,owner,new Request('https://account.inflite.ai/api/account/today/system/actions',{headers:{Origin:'https://inflite.ai'}}));return withSession(json({owner}),request,env,hex(await sha256(token)),true)}
 if(path==='/_sql'){const {sql,args=[]}=await request.json();return json(await(await systemdb(env)).prepare(sql).bind(...args).all())}
 if(path==='/_remove'){await removeAccount(env,(await request.json()).owner);return json({ok:true})}
 if(path==='/_tick'){const {now,parallel=false}=await request.json(),sent=[];const options={devices:async()=>[{endpoint:'https://example.test/push'}],push:async(e,d,n)=>{sent.push(n);return 'sent'}};return json({result:await(parallel?Promise.all([reminderTick(env,now,options),reminderTick(env,now,options)]):reminderTick(env,now,options)),sent})}
 const key=request.method+' '+path.replace(/^\\/api\\/account\\//,'');const fn=SYSTEM_ROUTES[key]||FILES_ROUTES[key];return fn?await fn({request,env,waitUntil:p=>ctx.waitUntil(p)}):json({error:'Unknown test route'},404);
 }catch(e){return json({error:e.message},e.status||500)}}};`;
before(async()=>{const b=await build({stdin:{contents:script,resolveDir:ROOT,sourcefile:'system350-worker.js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});const opts={modules:true,script:b.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:{FILES_R2:'system-files',BIO_R2:'system-native'},kvNamespaces:['BIO_KV']};mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(opts):opts);await mf.ready});after(async()=>mf?.dispose());
const op=()=>('operation_'+(++seq).toString(36).padStart(16,'0'));
async function internal(path,data){const r=await mf.dispatchFetch(HOST+'/_'+path,{method:'POST',body:JSON.stringify(data)});return {status:r.status,value:await r.json()}}
async function owner(){const id='system_'+(++seq),r=await mf.dispatchFetch(HOST+'/_seed',{method:'POST',body:JSON.stringify({owner:id})});assert.equal(r.status,200,await r.clone().text());return {id,cookie:r.headers.get('set-cookie').split(';')[0]}}
async function api(o,method,path,data,{headers={},namespace='system'}={}){const h={Origin:'https://inflite.ai','Sec-Fetch-Site':'same-origin',Cookie:o?.cookie||'','X-Inflite-Owner':o?.id||'','X-Inflite-Files-Owner':o?.id||'',...headers};let body;if(data!==undefined){body=typeof data==='string'?data:JSON.stringify(data);h['Content-Type']='application/json'}const r=await mf.dispatchFetch(HOST+'/api/account/today/'+namespace+'/'+path,{method,headers:h,body});let value;const text=await r.text();try{value=JSON.parse(text)}catch(_){value=text}return {status:r.status,value,headers:r.headers}}
async function create(o,extra={}){const r=await api(o,'POST','actions',{title:'Follow up',notes:'Written by the person',operationId:op(),...extra});assert.equal(r.status,200,JSON.stringify(r.value));return r.value.action}
const edit=(o,a,patch)=>api(o,'PATCH','action',{id:a.id,version:a.version,operationId:op(),...patch});
const currentDevice=()=>String(++seq).padStart(32,'0');
async function remember(o,id=currentDevice()){const r=await api(o,'POST','device-remember',{id,label:'Phone',target:{path:'/chats/'}});assert.equal(r.status,200,JSON.stringify(r.value));return r.value.devices.find(d=>d.id===id)}
const cipher=async(owner,words='Private draft text')=>{const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),pub=await crypto.subtle.exportKey('jwk',pair.publicKey),base=await E2E.pair(pair.privateKey,pub),meta={type:'draft',id:'drafts',from:owner,to:owner};return {sealed:await E2E.seal(base,meta,{d:[['friend_1',words]]}),base,meta}}

test('private capability routes fence cookie-only swaps before body parsing and reject foreign origins',async()=>{
 const a=await owner(),b=await owner(),stale={id:a.id,cookie:b.cookie};for(const [method,path,data] of [['GET','actions'],['POST','actions','not json'],['PATCH','action','not json'],['GET','devices'],['PUT','draft','not json']])assert.equal((await api(stale,method,path,data)).status,401,path);
 for(const Origin of ['https://evil.test','https://os.inflite.ai',''])assert.equal((await api(a,'GET','actions',undefined,{headers:{Origin}})).status,403);
 const r=await api(a,'GET','actions');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(r.value.actions,[]);
});
test('creation is idempotent, edits and completion are versioned, and stale Undo cannot overwrite another device',async()=>{
 const a=await owner(),operationId=op(),spec={title:'Review the ride',source:{app:'fitness'},dueAt:Date.now()+3600000,operationId};const first=await api(a,'POST','actions',spec),again=await api(a,'POST','actions',spec);assert.equal(first.status,200,JSON.stringify(first.value));assert.equal(again.value.action.id,first.value.action.id);assert.equal((await api(a,'POST','actions',{...spec,title:'Different'})).status,409);
 const action=first.value.action,done=await edit(a,action,{status:'done'});assert.equal(done.status,200,JSON.stringify(done.value));assert.equal((await api(a,'GET','actions')).value.actions.length,0);
 const newer=await edit(a,done.value.action,{notes:'Updated elsewhere'});assert.equal(newer.status,200);assert.equal((await edit(a,done.value.action,{status:'open'})).status,409);assert.equal((await edit(a,newer.value.action,{status:'open'})).status,200);
});
test('a successful update survives a lost acknowledgement with its operation identity',async()=>{
 const a=await owner(),item=await create(a),body={id:item.id,version:item.version,status:'done',operationId:op()};const first=await api(a,'PATCH','action',body),retry=await api(a,'PATCH','action',body);assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(retry.value.action.version,first.value.action.version);assert.equal((await api(a,'PATCH','action',{...body,notes:'changed'})).status,409);
});
test('source links cannot contain URLs, copied message bodies or unbounded fields; searches remain private',async()=>{
 const a=await owner();for(const source of [{app:'mail',id:'x',text:'private body'},{app:'chats',id:'https://evil.test'},{app:'arbitrary',id:'one'},{app:'mail'}])assert.equal((await api(a,'POST','actions',{title:'Test',source,operationId:op()})).status,400);
 const item=await create(a,{title:'Paperwork <img onerror=alert(1)>',source:{app:'mail',id:'thread_1',item:'message_1'}});const found=await api(a,'POST','search',{q:'Paperwork'});assert.equal(found.value.actions[0].id,item.id);assert.equal((await api(await owner(),'GET','action?id='+item.id)).status,404);assert.equal((await api(a,'GET','action?id='+item.id)).value.action.source.id,'thread_1');
});
test('file attachments require owned ready current file references and never expose object keys',async()=>{
 const a=await owner(),b=await owner(),reserved=await api(a,'POST','uploads',{name:'plan.txt',size:4,parentId:null,mime:'text/plain',operationId:op()},{namespace:'files'});assert.equal(reserved.status,201);const ready=await api(a,'PUT','content?id='+reserved.value.item.id,'plan',{namespace:'files'});assert.equal(ready.status,200);const file=ready.value.item;
 assert.equal((await api(b,'POST','actions',{title:'Foreign',files:[{id:file.id,version:file.version}],operationId:op()})).status,404);
 assert.equal((await api(a,'POST','actions',{title:'Stale',files:[{id:file.id,version:file.version-1}],operationId:op()})).status,409);
 const item=await create(a,{files:[{id:file.id,version:file.version}]});const answer=await api(a,'GET','action?id='+item.id);assert.equal(answer.value.action.attachments[0].name,'plan.txt');assert.doesNotMatch(JSON.stringify(answer.value),/storage_key|upload_nonce|files\/system_/);
});
test('encrypted copies are opaque, CAS protected, and forgetting a device prevents their resurrection',async()=>{
 const a=await owner(),b=await owner(),d=await remember(a),sealed=await cipher(a.id),data={id:d.id,revision:0,operationId:op(),cipher:sealed.sealed};const first=await api(a,'PUT','draft',data);assert.equal(first.status,200,JSON.stringify(first.value));assert.equal((await api(a,'PUT','draft',data)).status,200);assert.equal((await api(a,'PUT','draft',{...data,operationId:op()})).status,409);
 const copy=await api(a,'GET','draft?device='+d.id);assert.equal(copy.value.cipher,sealed.sealed);assert.doesNotMatch(copy.value.cipher,/Private draft text/);assert.equal((await E2E.open(sealed.base,sealed.meta,copy.value.cipher)).d[0][1],'Private draft text');assert.equal((await api(b,'GET','draft?device='+d.id)).status,410);
 const list=await api(a,'GET','drafts');assert.equal(list.value.backups[0].id,d.id);assert.doesNotMatch(JSON.stringify(list.value),/Private draft text|cipher|iv/);
 const forgotten=await api(a,'DELETE','device?id='+d.id+'&version='+d.revision);assert.equal(forgotten.status,200,JSON.stringify(forgotten.value));assert.equal((await api(a,'PUT','draft',{...data,revision:1,operationId:op()})).status,410);assert.equal((await api(a,'GET','drafts')).value.backups.length,0);
 const old=await api(a,'PUT','continuity',{id:d.id,revision:0,label:'Phone',target:{path:'/'}},{namespace:'files'});assert.equal(old.status,410);
 await remember(a,d.id);assert.equal((await api(a,'PUT','draft',{...data,operationId:op()})).status,200);
});
test('reminder push claims are concurrent-safe, private by default, and held by quiet hours',async()=>{
 const a=await owner(),now=Date.now();await create(a,{dueAt:now-1,notify:true,title:'Private reminder title'});const result=await internal('tick',{now,parallel:true});assert.equal(result.status,200,JSON.stringify(result.value));assert.equal(result.value.sent.length,1);assert.equal(result.value.sent[0].title,'Reminder due');assert.doesNotMatch(JSON.stringify(result.value.sent),/Private reminder title/);
 const b=await owner();await create(b,{dueAt:now-1,notify:true});await internal('sql',{sql:'UPDATE pg_users SET notify_prefs=? WHERE id=?',args:[JSON.stringify({quiet:true,quietFrom:0,quietTo:23,tz:'UTC'}),b.id]});const noon=Date.parse(new Date(now).toISOString().slice(0,10)+'T12:00:00Z');await internal('sql',{sql:'UPDATE ifl_actions SET due_at=? WHERE user_id=?',args:[noon-1,b.id]});assert.equal((await internal('tick',{now:noon})).value.sent.length,0);
});
test('account deletion clears actions, draft copies and revocation records and fences late writes',async()=>{
 const a=await owner(),d=await remember(a),item=await create(a),sealed=await cipher(a.id);await api(a,'PUT','draft',{id:d.id,revision:0,operationId:op(),cipher:sealed.sealed});const removed=await internal('remove',{owner:a.id});assert.equal(removed.status,200,JSON.stringify(removed.value));for(const table of ['ifl_actions','ifl_action_operations','ifl_draft_backups','ifl_continuity']){const r=await internal('sql',{sql:'SELECT COUNT(*) AS n FROM '+table+' WHERE user_id=?',args:[a.id]});assert.equal(r.value.results[0].n,0,table)}assert.equal((await api(a,'GET','action?id='+item.id)).status,401);
});
test('delete Undo is versioned and a stale Undo cannot restore a newer deleted action',async()=>{const o=await owner(),a=await create(o),deleted=await edit(o,a,{status:'deleted'});assert.equal(deleted.status,200);assert.equal((await api(o,'GET','action?id='+a.id)).status,404);const restored=await edit(o,deleted.value.action,{status:'open'});assert.equal(restored.status,200,JSON.stringify(restored.value));assert.equal(restored.value.action.version,3);assert.equal((await edit(o,deleted.value.action,{status:'open'})).status,409);const gone=await edit(o,restored.value.action,{status:'deleted'});assert.equal((await edit(o,gone.value.action,{status:'open',title:'Unexpected edit'})).status,404)});
test('remembered device count stays bounded and expired encrypted copies can be replaced safely',async()=>{const o=await owner();let last;for(let i=0;i<14;i++)last=await remember(o);const devices=await api(o,'GET','devices');assert.equal(devices.value.devices.length,12);const v=await cipher(o.id),save={id:last.id,revision:0,cipher:v.sealed,operationId:op()};assert.equal((await api(o,'PUT','draft',save)).status,200);await internal('sql',{sql:'UPDATE ifl_draft_backups SET modified=? WHERE user_id=?',args:[Date.now()-15*864e5,o.id]});assert.equal((await api(o,'GET','drafts')).value.backups.length,0);assert.equal((await api(o,'PUT','draft',{...save,operationId:op()})).status,200)});

test('valid foreign owner requests cannot read, edit, delete or restore another account action or encrypted draft',async()=>{
 const a=await owner(),b=await owner(),item=await create(a,{title:'Owner private action'}),d=await remember(a),envelope=await cipher(a.id);
 assert.equal((await api(a,'PUT','draft',{id:d.id,revision:0,operationId:op(),cipher:envelope.sealed})).status,200);
 assert.equal((await api(b,'GET','action?id='+item.id)).status,404);
 assert.equal((await edit(b,item,{title:'Foreign overwrite'})).status,404);
 assert.equal((await api(b,'DELETE','action?id='+item.id+'&version='+item.version+'&operation='+op())).status,404);
 assert.equal((await api(b,'POST','search',{q:'Owner private'})).value.actions.length,0);
 assert.equal((await api(b,'GET','draft?device='+d.id)).status,410);
 assert.equal((await api(b,'DELETE','device?id='+d.id+'&version='+d.revision)).status,409);
 assert.equal((await api(a,'GET','action?id='+item.id)).value.action.title,'Owner private action');
 assert.equal((await api(a,'GET','draft?device='+d.id)).value.cipher,envelope.sealed);
 // A valid cursor containing someone else's ID remains an owner-local position.
 const cursor=item.createdAt+':'+item.id;
 const page=await api(b,'GET','actions?cursor='+cursor);assert.equal(page.status,200);assert.deepEqual(page.value.actions,[]);
});

test('recurring completion atomically advances one occurrence and a lost acknowledgement cannot advance twice',async()=>{const o=await owner(),item=await create(o,{dueAt:Date.now()-864e5,recurrence:{frequency:'daily',timezone:'Europe/London'}});assert.equal(item.recurrence.frequency,'daily');const data={id:item.id,version:item.version,operationId:op(),status:'done'},r=await api(o,'PATCH','action',data);assert.equal(r.status,200,JSON.stringify(r.value));assert.equal(r.value.action.status,'open');assert.ok(r.value.action.dueAt>Date.now());assert.equal(r.value.action.repetitions,1);const retry=await api(o,'PATCH','action',data);assert.equal(retry.value.action.dueAt,r.value.action.dueAt);assert.equal(retry.value.action.repetitions,1);const other=await api(o,'PATCH','action',{...data,operationId:op()});assert.equal(other.status,409);const stop=await edit(o,r.value.action,{recurrence:null});assert.equal(stop.status,200);assert.equal(stop.value.action.recurrence,null);assert.equal((await edit(o,stop.value.action,{status:'done'})).value.action.status,'done')});
test('simultaneous recurring completions cannot change the winning schedule and deleted-account repeat rows are removed',async()=>{const o=await owner(),item=await create(o,{dueAt:Date.now()+864e5,recurrence:{frequency:'weekly',timezone:'UTC'}}),r=await Promise.all([edit(o,item,{status:'done'}),edit(o,item,{recurrence:{frequency:'daily',timezone:'UTC'},status:'done'})]);assert.deepEqual(r.map(v=>v.status).sort(),[200,409]);const win=r.find(v=>v.status===200).value.action,actual=(await api(o,'GET','action?id='+item.id)).value.action;assert.equal(actual.recurrence.frequency,win.recurrence.frequency);assert.equal(actual.repetitions,1);await internal('remove',{owner:o.id});assert.equal((await internal('sql',{sql:'SELECT COUNT(*) n FROM ifl_action_repeats WHERE user_id=?',args:[o.id]})).value.results[0].n,0)});
test('reminders can link notes, contacts and events while source metadata stays opaque',async()=>{const o=await owner();for(const app of ['notes','calendar','people']){const item=await create(o,{source:{app,id:'a'.repeat(32)}});assert.equal(item.source.app,app)}assert.equal((await api(o,'POST','actions',{title:'bad',recurrence:{frequency:'daily',timezone:'UTC'},operationId:op()})).status,400)});
