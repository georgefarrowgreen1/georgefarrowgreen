import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityBackend} from '../fixtures/identity-backend.mjs';
import {appearanceOf} from '../../../functions/_appearance.js';

const req=(path,method='GET',body,cookie,origin='https://inflite.ai')=>new Request('https://inflite.ai/account/api/account/'+path,{method,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
async function signup(backend,suffix){
 const pub=await crypto.subtle.exportKey('jwk',(await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits'])).publicKey);
 const r=await backend.request(new Request('https://inflite.ai/auth/api/account/signup',{method:'POST',headers:{Origin:'https://inflite.ai','Content-Type':'application/json'},body:JSON.stringify({name:'Glass Tester',handle:'glass_'+suffix,email:'glass_'+suffix+'@example.com',salt:Buffer.alloc(16,5).toString('base64url'),proof:Buffer.alloc(32,6).toString('base64url'),vault:'v'.repeat(40),pub})}));
 assert.equal(r.status,201,await r.clone().text());return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
}
const settings=async(backend,cookie)=>{
 const r=await backend.request(req('appearance','GET',undefined,cookie));assert.equal(r.status,200);return r.json();
};
async function put(backend,cookie,value){const r=await backend.request(req('prefs','PUT',value,cookie));assert.equal(r.status,200,await r.clone().text());return(await r.json()).prefs}

test('legacy appearance rows default to enabled glass at 70 without losing false or zero',()=>{
 assert.deepEqual(appearanceOf({}),{appearance:'auto',palette:'inflite',glass:true,glassStrength:70});
 assert.deepEqual(appearanceOf({appearance:'dark',theme_palette:'coast',glass_enabled:0,glass_strength:0}),{appearance:'dark',palette:'coast',glass:false,glassStrength:0});
 for(const value of [null,undefined,-1,101,70.5,'70'])assert.equal(appearanceOf({glass_strength:value}).glassStrength,70);
 assert.equal(appearanceOf({glass_enabled:1,glass_strength:100}).glassStrength,100);
});

test('real glass preferences persist in SQL, survive old-client partial updates and appear in account export',async()=>{
 let backend=await createIdentityBackend();
 try{
  const cookie=await signup(backend,'durable');let p=await settings(backend,cookie);const owner=p.id;
  assert.equal(p.glass,true);assert.equal(p.glassStrength,70);
  p=await put(backend,cookie,{glass:false,glassStrength:0,appearance:'dark',palette:'coast'});
  assert.equal(p.glass,false);assert.equal(p.glassStrength,0);
  p=await put(backend,cookie,{appearance:'light'});assert.deepEqual([p.appearance,p.palette,p.glass,p.glassStrength],['light','coast',false,0]);
  p=await put(backend,cookie,{palette:'iris'});assert.deepEqual([p.appearance,p.palette,p.glass,p.glassStrength],['light','iris',false,0]);
  p=await put(backend,cookie,{glassStrength:100});assert.equal(p.glass,false);assert.equal(p.glassStrength,100);
  p=await put(backend,cookie,{glass:true});assert.equal(p.glass,true);assert.equal(p.glassStrength,100);
  p=await put(backend,cookie,{});assert.equal(p.glass,true);assert.equal(p.glassStrength,100);
  const row=await backend.env.DB.prepare('SELECT appearance,theme_palette,glass_enabled,glass_strength FROM pg_users WHERE id=?').bind(owner).first();
  assert.deepEqual({...row},{appearance:'light',theme_palette:'iris',glass_enabled:1,glass_strength:100});
  await backend.close();backend=await createIdentityBackend();p=await settings(backend,cookie);
  assert.deepEqual([p.appearance,p.palette,p.glass,p.glassStrength],['light','iris',true,100]);
  let r=await backend.request(req('me','GET',undefined,cookie));assert.equal(r.status,200);p=(await r.json()).prefs;assert.equal(p.glass,true);assert.equal(p.glassStrength,100);
  const confirmation=await backend.request(req('security/confirmation','POST',{action:'account-export',target:owner},cookie));assert.equal(confirmation.status,200);const approval=await confirmation.json();
  r=await backend.request(req('export','POST',{securityTicket:approval.token},cookie));assert.equal(r.status,200,await r.clone().text());p=(await r.json()).account;assert.equal(p.glass,true);assert.equal(p.glassStrength,100);
 }finally{await backend.close()}
});

test('real glass writes reject invalid bounds, types and unknown fields before changing any appearance setting',async()=>{
 const backend=await createIdentityBackend();try{
  const cookie=await signup(backend,'validate');await put(backend,cookie,{glass:false,glassStrength:19,palette:'rose',appearance:'dark'});
  const invalid=[...[-1,101,19.5,'70',null,{},[],true].map(glassStrength=>({glass:true,glassStrength,palette:'coast'})),...[0,1,'false',null,{},[]].map(glass=>({glass,glassStrength:100,palette:'coast'})),{glass:true,glassStrength:100,glassTint:'red'},null,[]];
  for(const body of invalid){
   const r=await backend.request(req('prefs','PUT',body,cookie));assert.equal(r.status,400,JSON.stringify(body));
   const p=await settings(backend,cookie);assert.deepEqual([p.appearance,p.palette,p.glass,p.glassStrength],['dark','rose',false,19]);
  }
 }finally{await backend.close()}
});

test('real glass preferences belong to the signed-in cookie account and retain the existing origin guard',async()=>{
 const backend=await createIdentityBackend();try{
  const a=await signup(backend,'owner_a'),b=await signup(backend,'owner_b');await put(backend,a,{glass:false,glassStrength:23});
  assert.deepEqual([(await settings(backend,b)).glass,(await settings(backend,b)).glassStrength],[true,70]);
  await put(backend,b,{glass:true,glassStrength:88});
  assert.deepEqual([(await settings(backend,a)).glass,(await settings(backend,a)).glassStrength],[false,23]);
  assert.equal((await backend.request(req('prefs','PUT',{glass:true,glassStrength:100},a,'https://evil.example'))).status,403);
  assert.equal((await backend.request(req('prefs','PUT',{glass:true,glassStrength:100}))).status,401);
  assert.deepEqual([(await settings(backend,a)).glass,(await settings(backend,a)).glassStrength],[false,23]);
 }finally{await backend.close()}
});
