import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {trainingRecords,prescribe,sessionFeedback,cleanPrescription,deleteTrainingRecords} from '../../../functions/_fitrhythm2.js';
import {cleanState,fitdb} from '../../../functions/_fitness.js';
import {compose,dayKey} from '../../../fitness/rhythm2.js';
import {db} from '../../../functions/_pigeon.js';
const sql=new DatabaseSync(':memory:'),val=a=>a.map(x=>x===undefined?null:x);
const st=(q,a=[])=>({bind:(...b)=>st(q,b),first:async()=>sql.prepare(q).get(...val(a))??null,all:async()=>({results:sql.prepare(q).all(...val(a))}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...val(a)).changes)}})});
const env={DB:{prepare:q=>st(q),batch:async a=>{const out=[];for(const s of a)out.push(await s.run());return out;}}};await db(env);await fitdb(env);
const now=Date.now(),payload={day:dayKey(now),ftp:250,objective:'threshold',workout:compose('threshold',60,{ftp:250})};
test('beta is explicit and existing Rhythm settings round-trip unchanged',()=>{assert.equal(cleanState({rhythm:{days:[0,60,60,60,0,120,60]}}).rhythm.engine,undefined);assert.equal(cleanState({rhythm:{days:[0,60,60,60,0,120,60],engine:2,objective:'threshold'}}).rhythm.engine,2);});
test('prescriptions are immutable and idempotent per account, with separate account identities',async()=>{
 const a=await prescribe(env,'ann',payload),again=await prescribe(env,'ann',payload);assert.equal(a.id,again.id);assert.equal((await trainingRecords(env,'ann')).length,1);assert.equal((await trainingRecords(env,'bo')).length,0);
 const b=await prescribe(env,'bo',payload);assert.equal(b.id,a.id);assert.equal((await trainingRecords(env,'bo')).length,1);assert.equal(a.ftp,250);
});
test('bad or excessive prescriptions never enter the account record',()=>{
 for(const patch of [{ftp:1},{day:'2026-02-30'},{day:'2099-01-01'},{objective:'unknown'},{workout:{...payload.workout,steps:[{kind:'work',secs:Infinity,from:.95}]}},{workout:{...payload.workout,dose:{...payload.workout.dose,reps:8}}}])assert.throws(()=>cleanPrescription({...payload,...patch}),{status:400});
});
test('feedback has optimistic concurrency, owned activity links and no ability to change recorded targets',async()=>{
 const a=(await trainingRecords(env,'ann'))[0];await assert.rejects(sessionFeedback(env,'stranger',{id:a.id,revision:0,completion:'completed',reason:'none',effort:6}),{status:404});
 const r=await sessionFeedback(env,'ann',{id:a.id,revision:0,completion:'completed',reason:'none',effort:6,ftp:999});assert.equal(r.revision,1);assert.equal(r.ftp,250);assert.deepEqual(r.workout,a.workout);
 await assert.rejects(sessionFeedback(env,'ann',{id:a.id,revision:0,completion:'completed',reason:'none',effort:6}),{status:409});
 await assert.rejects(sessionFeedback(env,'ann',{id:a.id,revision:1,completion:'completed',reason:'none',effort:6,activityId:'other-account-ride'}),{status:400});
 await assert.rejects(sessionFeedback(env,'ann',{id:a.id,revision:1,completion:'completed',reason:'none',effort:6,assessment:{status:'held',efforts:3,held:3,ratio:1}}),{status:400});
});
test('training history exports all records and account cleanup leaves another account intact',async()=>{
 assert.equal((await trainingRecords(env,'ann',{all:true}))[0].feedback.effort,6);await deleteTrainingRecords(env,'ann');assert.deepEqual(await trainingRecords(env,'ann'),[]);assert.equal((await trainingRecords(env,'bo')).length,1);
});
test('the real API enforces account authentication, same-origin writes and private record reads',async()=>{
 const {onRequest}=await import('../../../functions/api/fitness/[[path]].js');const {issueSession,hex,sha256}=await import('../../../functions/_pigeon.js');
 const FIT='http://fitness.localhost';env.FITNESS_HOST='fitness.localhost';const cookies={};
 for(const id of ['ann','bo']){sql.prepare('INSERT INTO pg_users (id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,id,id,id+'@example.com','{}','s','p','v',9,0,0);const hash=hex(await sha256(await issueSession(env,id,new Request(FIT+'/api/fitness/me'))));cookies[id]=('f'+id).padEnd(43,'x');sql.prepare('UPDATE pg_sessions SET site_hash = ? WHERE hash = ?').run(hex(await sha256(cookies[id])),hash);}
 const api=async(method,path,{who='ann',origin=FIT,data}={})=>{const r=await onRequest({env,waitUntil(){},params:{path:path.split('/')},request:new Request(FIT+'/api/fitness/'+path,{method,headers:{...(who?{Cookie:'account='+cookies[who]}:{}),...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})})});return {status:r.status,body:await r.json()};};
 assert.equal((await api('GET','rhythm2',{who:null})).status,401);assert.equal((await api('POST','rhythm2/prescriptions',{origin:'http://elsewhere.localhost',data:payload})).status,403);
 const saved=await api('POST','rhythm2/prescriptions',{data:payload});assert.equal(saved.status,200);assert.equal((await api('GET','rhythm2')).body.records.length,1);
 assert.equal((await api('POST','rhythm2/feedback',{who:'bo',data:{id:saved.body.record.id,revision:0,completion:'completed',reason:'none',effort:6}})).status,200,'the same immutable id can exist for each account independently');
 const own=(await api('GET','rhythm2')).body.records[0];assert.equal(own.feedback,null,'another account cannot change this account’s feedback');
});
