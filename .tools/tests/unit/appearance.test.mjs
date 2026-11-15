import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityBackend} from '../fixtures/identity-backend.mjs';
import {PALETTES} from '../../../functions/_appearance.js';
const req=(path,method='GET',body,cookie,origin='https://inflite.ai')=>new Request('https://inflite.ai/account/api/account/'+path,{method,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
test('real Appearance API: defaults, six palettes, independent modes, persistence, account isolation and validation',async()=>{
 const backend=await createIdentityBackend();
 try{
  const pub=await crypto.subtle.exportKey('jwk',(await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits'])).publicKey);
  const signup=async suffix=>{
   const r=await backend.request(new Request('https://inflite.ai/auth/api/account/signup',{method:'POST',headers:{Origin:'https://inflite.ai','Content-Type':'application/json'},body:JSON.stringify({name:'Theme Tester',handle:'theme_'+suffix,email:'theme_'+suffix+'@example.com',salt:Buffer.alloc(16,5).toString('base64url'),proof:Buffer.alloc(32,6).toString('base64url'),vault:'v'.repeat(40),pub})}));
   assert.equal(r.status,201,await r.clone().text());return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  };
  const cookie=await signup('one');
  assert.deepEqual(await (await backend.request(req('appearance'))).json(),{signedIn:false});
  let r=await backend.request(req('appearance','GET',undefined,cookie));
  assert.match(r.headers.get('Cache-Control'),/no-store/);let p=await r.json();assert.equal(p.palette,'inflite');assert.equal(p.appearance,'auto');
  for(const palette of PALETTES){r=await backend.request(req('prefs','PUT',{palette},cookie));assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).prefs.palette,palette);}
  r=await backend.request(req('prefs','PUT',{appearance:'dark'},cookie));assert.equal(r.status,200);p=(await r.json()).prefs;assert.equal(p.palette,'graphite');assert.equal(p.appearance,'dark');
  for(const palette of ['url(javascript:alert(1))','__proto__','',null,{},['coast']]){
   r=await backend.request(req('prefs','PUT',{appearance:'light',palette},cookie));assert.equal(r.status,400);
   p=await (await backend.request(req('appearance','GET',undefined,cookie))).json();assert.equal(p.palette,'graphite');assert.equal(p.appearance,'dark','invalid palette must not partially change mode');
  }
  assert.equal((await backend.request(req('prefs','PUT',{palette:'coast'},cookie,'https://evil.example'))).status,403);
  const other=await signup('two');p=await (await backend.request(req('appearance','GET',undefined,other))).json();assert.equal(p.palette,'inflite');
  p=await (await backend.request(req('appearance','GET',undefined,cookie))).json();assert.equal(p.palette,'graphite');assert.equal(p.appearance,'dark');
 }finally{await backend.close();}
});
