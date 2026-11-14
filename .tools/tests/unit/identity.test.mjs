import {test} from 'node:test';
import {IFL} from './fixtures/roof.mjs';
import assert from 'node:assert/strict';
import {createIdentityBackend} from '../fixtures/identity-backend.mjs';
import {identityPrefix,identityOrigin} from '../../../functions/_identity.js';
import {sameOrigin} from '../../../functions/_account.js';
import {newRpFor,rpOf,newChallenge,checkClientData,b64url,accountPage,authPage} from '../../../functions/_pigeon.js';
import {identityBase,siteUrlFor,returnFor} from '../../../account/identity-location.js';
const request=(path,body,cookie)=>new Request('https://inflite.ai'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://inflite.ai','Sec-Fetch-Site':'same-origin',...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const cookies=r=>r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');

test('canonical identity crosses the actual middleware/API boundary: signup, shared session, password sign-in, known device and signout',{skip:!IFL&&'companion InFlite repository unavailable'},async()=>{
 const backend=await createIdentityBackend();try{
  const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const pub=await crypto.subtle.exportKey('jwk',kp.publicKey),proof=b64url(crypto.getRandomValues(new Uint8Array(32)));
  const signup={name:'Ann Example',handle:'ann_identity',email:'ann_identity@example.com',salt:'a2:'+b64url(crypto.getRandomValues(new Uint8Array(16))),proof,vault:'v'.repeat(40),pub};
  const r=await backend.request(request('/auth/api/account/signup',signup));assert.equal(r.status,201,await r.clone().text());
  const me=await r.json();assert.equal(me.signedIn,true);let jar=cookies(r);assert.match(jar,/__Secure-account=/);assert.match(jar,/__Secure-known-/);
  const read=await backend.request(request('/account/api/account/me',undefined,jar));assert.equal(read.status,200);assert.equal((await read.json()).id,me.id);
  const wrongRole=await backend.request(request('/account/api/account/signin/password',{email:signup.email,proof}));assert.equal(wrongRole.status,404);
  const login=await backend.request(request('/auth/api/account/signin/password',{email:signup.email,proof},jar));assert.equal(login.status,200,await login.clone().text());assert.equal((await login.json()).id,me.id);jar=cookies(login);
  const out=await backend.request(request('/auth/api/account/signout',{},jar));assert.equal(out.status,200);
  const ended=await backend.request(request('/account/api/account/me',undefined,jar));assert.deepEqual(await ended.json(),{signedIn:false});
 }finally{await backend.close();}
});
test('canonical auth/account assets, module graph and manifests resolve under their visible prefixes without redirects',{skip:!IFL&&'companion InFlite repository unavailable'},async()=>{
 const b=await createIdentityBackend();try{for(const role of ['auth','account']){
  const page=await b.request(request('/'+role+'/'));assert.equal(page.status,200);const html=await page.text();assert.match(html,/Content|InFlite/);assert.equal(page.headers.get('Location'),null);
  const references=[...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css|svg)(?:\?[^"#]*)?)"/g)].map(m=>m[1]);
  assert.ok(references.length>=6);for(const ref of references){const url=new URL(ref,'https://inflite.ai/'+role+'/');assert.equal(url.pathname.startsWith('/'+role+'/'),true,url.href);const asset=await b.request(new Request(url));assert.equal(asset.status,200,url.href);}
  const app=await b.request(request('/'+role+'/'+(role==='auth'?'signin.js':'app.js')));const text=await app.text();assert.match(text,/identity-location\.js\?v=/);
  const helper=await b.request(request('/'+role+'/identity-location.js'));assert.equal(helper.status,200);
  const manifest=await(await b.request(request('/'+role+'/manifest.webmanifest'))).json();assert.equal(manifest.start_url,'/'+role+'/');assert.equal(manifest.scope,'/'+role+'/');assert.ok(manifest.icons.every(i=>i.src.startsWith('/'+role+'/')));
 }}finally{await b.close();}
});
test('only authenticated identity service requests accept Apex Origin; passkey RP and one-use clientData checks remain exact',{skip:!IFL&&'companion InFlite repository unavailable'},async()=>{
 const b=await createIdentityBackend();try{
  const trusted=new Request('https://auth.inflite.ai/api/account/signin/options',{headers:{'X-Hub-Ok':'1','X-Inflite-Identity':'auth',Origin:'https://inflite.ai'}});
  assert.equal(identityPrefix(trusted),'/auth');assert.equal(identityOrigin(trusted),true);assert.doesNotThrow(()=>sameOrigin(trusted));
  for(const headers of [{Origin:'https://inflite.ai'},{Origin:'https://evil.test','X-Hub-Ok':'1','X-Inflite-Identity':'auth'},{Origin:'https://inflite.ai','X-Hub-Ok':'1','X-Inflite-Identity':'account'}])assert.throws(()=>sameOrigin(new Request(trusted.url,{headers})),/didn't come/);
  assert.equal(newRpFor(trusted,b.env),'inflite.ai');assert.equal(rpOf({},trusted,b.env),'georgefarrowgreen.com');
  const challenge=await newChallenge(b.env,'login'),data={challenge,clientDataJSON:b64url(new TextEncoder().encode(JSON.stringify({type:'webauthn.get',origin:'https://inflite.ai',challenge})))};
  await checkClientData(b.env,trusted,data,'webauthn.get','login');await assert.rejects(checkClientData(b.env,trusted,data,'webauthn.get','login'),/expired/);
  const challenge2=await newChallenge(b.env,'login');await assert.rejects(checkClientData(b.env,trusted,{challenge:challenge2,clientDataJSON:b64url(new TextEncoder().encode(JSON.stringify({type:'webauthn.get',origin:'https://inflite.ai.evil.test',challenge:challenge2})))},'webauthn.get','login'),/match this site/);
  assert.equal(accountPage(trusted,b.env),'https://inflite.ai/account');assert.equal(authPage(trusted,b.env),'https://inflite.ai/auth');
 }finally{await b.close();}
});
test('native legacy documents move while APIs/static resources and fixed callbacks keep their transport',{skip:!IFL&&'companion InFlite repository unavailable'},async()=>{
 const b=await createIdentityBackend();try{
  for(const role of ['auth','account']){const r=await b.dispatch(new Request('https://'+role+'.inflite.ai/',{headers:{Accept:'text/html'}}));assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://inflite.ai/'+role+'/');}
  const {accountHost}=await import('../../../functions/_acctapp.js');const sandboxURL=new URL('http://auth.ifl.test:8788/');const sandbox=await accountHost({request:new Request(sandboxURL,{headers:{Accept:'text/html'}}),env:{...b.env,APPS_SITE:'ifl.test',ACCOUNT_SITE:'gfg.test',AUTH_HOST:'auth.ifl.test'},next:()=>new Response('not found',{status:404})},sandboxURL);assert.equal(sandbox.status,200);assert.equal(sandbox.headers.get('Location'),null);
  const api=await b.dispatch(new Request('https://auth.inflite.ai/api/account/me',{headers:{Accept:'application/json'}}));assert.equal(api.status,200);
  const staticAsset=await b.dispatch(new Request('https://auth.inflite.ai/theme.js'));assert.equal(staticAsset.status,200);
  const forged=await b.dispatch(new Request('https://auth.inflite.ai/api/account/signout',{method:'POST',headers:{Origin:'https://inflite.ai','X-Hub-Ok':'1','X-Inflite-Identity':'auth','Content-Type':'application/json'},body:'{}'}));assert.equal(forged.status,403);
 }finally{await b.close();}
});
test('public identity and return routes normalize only known app addresses and preserve local test sites',()=>{
 for(const at of ['https://inflite.ai/auth/','https://account.inflite.ai/','https://auth.inflite.ai/']){const l=new URL(at);assert.equal(siteUrlFor(l,'weather'),'https://inflite.ai/weather/');assert.equal(returnFor(l,'fitness','https://fitness.inflite.ai/'),'https://inflite.ai/fitness/');for(const back of ['https://evil.test/','https://fitness.inflite.ai.evil.test/','http://inflite.ai/fitness/','https://inflite.ai:444/fitness/','https://u:p@inflite.ai/fitness/'])assert.equal(returnFor(l,'fitness',back),'https://inflite.ai/fitness/');}
 assert.equal(returnFor(new URL('https://inflite.ai/auth/'),'email','https://inflite.ai/mail/standalone/'),'https://inflite.ai/mail/standalone/');assert.equal(returnFor(new URL('https://inflite.ai/auth/'),'email','https://inflite.ai/mail/standalone/evil/'),'https://inflite.ai/mail/');
 assert.equal(identityBase(new URL('https://inflite.ai/account/')),'/account');assert.equal(identityBase(new URL('https://account.inflite.ai/')),'');assert.equal(siteUrlFor(new URL('http://account.ifl.test:8788/'),'fitness'),'http://fitness.ifl.test:8788/');
});
