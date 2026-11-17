import{before,after,test}from'node:test';import assert from'node:assert/strict';
import{createIdentityBackend}from'../fixtures/identity-backend.mjs';
import{db,issueSession,hex,sha256}from'../../../functions/_pigeon.js';import{withSession}from'../../../functions/_account.js';
import{protectedPost}from'../../../account/security-module.js';
let B,seq=0;before(async()=>B=await createIdentityBackend());after(async()=>B?.close());
async function owner(){const id='security-account-'+(++seq),D=await db(B.env),now=Date.now();await D.prepare('INSERT INTO pg_users(id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,id,id,id+'@example.test','test','test','test','test',1,now,now).run();const request=new Request('https://account.inflite.ai/api/account/me',{headers:{Origin:'https://account.inflite.ai'}}),token=await issueSession(B.env,id,request),res=await withSession(Response.json({}),request,B.env,hex(await sha256(token)),true);return{id,cookie:res.headers.get('set-cookie').split(';')[0]};}
async function api(a,path,b={}){const r=await B.dispatch(new Request('https://account.inflite.ai/api/account/'+path,{method:'POST',headers:{Origin:'https://account.inflite.ai','Content-Type':'application/json','X-Inflite-Owner':a.id,Cookie:a.cookie},body:JSON.stringify(b)}));return{status:r.status,value:await r.json()};}
test('account export is protected by a one-use purpose-bound approval even with fresh authentication',async()=>{const a=await owner();assert.equal((await api(a,'export')).status,403);const c=await api(a,'security/confirmation',{action:'account-export',target:a.id});assert.equal(c.status,200,JSON.stringify(c.value));const exported=await api(a,'export',{securityTicket:c.value.token});assert.equal(exported.status,200,JSON.stringify(exported.value));assert.ok(exported.value.securityModule);assert.equal((await api(a,'export',{securityTicket:c.value.token})).status,403)});
test('an export proof cannot delete an account or sign out its other devices',async()=>{const a=await owner(),c=await api(a,'security/confirmation',{action:'account-export',target:a.id});assert.equal((await api(a,'delete',{confirm:a.id,securityTicket:c.value.token})).status,403);assert.equal((await api(a,'devices/end',{others:true,securityTicket:c.value.token})).status,403);assert.equal((await api(a,'export',{securityTicket:c.value.token})).status,200)});
test('a captured account mismatch is rejected before account-action confirmation',async()=>{const a=await owner(),b=await owner();assert.equal((await api({...a,cookie:b.cookie},'security/confirmation',{action:'account-export',target:a.id})).status,401)});
test('account client never submits an action after the account changes during confirmation',async()=>{let current=true;const calls=[];await assert.rejects(()=>protectedPost({path:'export',body:{},owner:'a',current:()=>current,call:async(p,o)=>{calls.push(p);current=false;return{token:'one'}}}),/account changed/);assert.deepEqual(calls,['security/confirmation'])});
test('account client binds approvals to immutable action input and fences response delivery',async()=>{let current=true;const body={others:true},calls=[];await assert.rejects(()=>protectedPost({path:'devices/end',body,owner:'a',current:()=>current,call:async(p,o)=>{calls.push({p,o});if(p==='security/confirmation'){body.others=false;return{token:'one'}}current=false;return{ok:true}}}),/account changed/);assert.equal(calls[0].o.body.target,'others');assert.equal(calls[1].o.body.others,true);assert.equal(calls[1].o.owner,'a')});
test('canonical Account proxy preserves the captured owner for sensitive actions',async()=>{const a=await owner(),b=await owner();const r=await B.request(new Request('https://inflite.ai/account/api/account/security/confirmation',{method:'POST',headers:{Origin:'https://inflite.ai','Content-Type':'application/json','X-Inflite-Owner':a.id,Cookie:b.cookie},body:JSON.stringify({action:'account-devices',target:'others'})}));assert.equal(r.status,401)});

test('Settings saves preferences for the captured account and rejects a switched session',async()=>{
  const a=await owner(), b=await owner();
  const request=(path,method,account,body)=>B.request(new Request('https://inflite.ai/account/api/account/'+path,{
    method, headers:{Origin:'https://inflite.ai','Content-Type':'application/json','X-Inflite-Owner':a.id,Cookie:account.cookie},
    body:body ? JSON.stringify(body) : undefined
  }));
  const saved=await request('prefs','PUT',a,{glassStrength:33});
  assert.equal(saved.status,200);
  assert.equal((await saved.json()).prefs.glassStrength,33);
  assert.equal((await request('prefs','PUT',b,{glassStrength:19})).status,401);
  assert.equal((await request('notify','PATCH',b,{account:{fixed:false}})).status,401);
  assert.equal((await request('notify','GET',b)).status,401);
  const notifications=await request('notify','PATCH',a,{account:{fixed:false}});
  assert.equal(notifications.status,200);
  assert.equal((await notifications.json()).account.fixed,false);
});
