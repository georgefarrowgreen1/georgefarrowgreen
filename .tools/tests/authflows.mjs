// All auth states use the real shared frame and production asset stamping, with isolated API fixtures.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountHost } from '../../functions/_acctapp.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.AUTH_SCREENSHOTS||'/tmp/authflows';mkdirSync(out,{recursive:true});
const engine=process.env.AUTH_BROWSER==='webkit'?'webkit':'chromium';
const browser=await (engine==='webkit'?webkit.launch():chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}));
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++;};
const token='t'.repeat(43), ask='a'.repeat(43);
const entry=`https://auth.inflite.ai/#signin=weather&ask=${ask}&back=${encodeURIComponent('https://weather.inflite.ai/')}`;
const me={signedIn:true,id:'person-1',name:'Sam Lee',handle:'sam',email:'sam@example.com',fresh:true,passkeys:[],prefs:{appearance:'auto'},apps:{}};
const assetStore={async fetch(request){let path=new URL(request.url).pathname;if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);
 if(!file.startsWith(root)||!existsSync(file))return new Response('not found',{status:404});
 return new Response(readFileSync(file),{headers:{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'}[extname(file)]||'application/octet-stream'}});
}};
async function open({width=390,scheme='light',url=entry,signedIn=false,join=false,reset='valid',holdModule=false,holdMe=false,source=false,last=null}={}){
 const ctx=await browser.newContext({viewport:{width,height:844},colorScheme:scheme,reducedMotion:'reduce',serviceWorkers:'block'});
 if(last)await ctx.addInitScript(last=>localStorage.setItem('acct:last',JSON.stringify(last)),last);
 let releaseModule,moduleSeen,releaseMe,meSeen;const moduleGate=new Promise(r=>releaseModule=r),moduleObserved=new Promise(r=>moduleSeen=r),meGate=new Promise(r=>releaseMe=r),meObserved=new Promise(r=>meSeen=r);
 const requests=[],errors=[],csp=[];
 await ctx.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());if(u.origin!=='https://auth.inflite.ai')return route.abort();
  if(u.pathname==='/signin.js'){moduleSeen();if(holdModule)await moduleGate;}
  if(u.pathname.startsWith('/api/')){
   const path=u.pathname.replace('/api/account/','');requests.push({path,method:request.method(),body:request.postDataJSON()});
   if(path==='me'){meSeen();if(holdMe)await meGate;}
   let status=200,data=path==='me'?(signedIn?me:{signedIn:false}):path==='join'?{open:join,ok:join}:path==='handle'?{free:true}
    :path==='reset/request'?{message:'If there’s an account for that email, a reset link is on its way.'}
    :path==='reset/check'?{name:'Sam Lee',handle:'sam',email:'s••@example.com',passkeys:[]}
    :path==='signin/qr'?{code:'q'.repeat(32),poll:'p'.repeat(43),ttl:120000}:path==='signin/qr/wait'?{state:'waiting'}:{error:'Fixture unavailable'};
   if(path==='reset/check'&&reset!=='valid'){status=reset==='offline'?503:400;data={error:reset==='offline'?'Service unavailable':'This link has expired.'};}
   if(path.includes('options'))status=503;
   return route.fulfill({status,json:data});
  }
  if(source&&u.pathname==='/signin.js')return route.fulfill({contentType:'text/javascript',body:readFileSync(root+'account/app.js','utf8')});
  const req=new Request(u.href,{method:request.method()});
  const response=await accountHost({request:req,env:{ASSETS:assetStore},next:()=>new Response('not found',{status:404})},u);
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>{window.__violations??=[];__violations.push(`${e.violatedDirective}:${e.blockedURI}`)}));
 await p.goto(url,{waitUntil:holdModule||holdMe?'commit':'load'});
 return {ctx,p,requests,errors,releaseModule,moduleObserved,releaseMe,meObserved};
}
async function frame(x,state,label){
 await x.p.locator(`.auth-panel[data-auth-state="${state}"]`).waitFor();
 const result=await x.p.evaluate(()=>{const panel=document.querySelector('.auth-panel'),r=panel.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth+1,left:r.left,right:r.right,width:innerWidth,headings:document.querySelectorAll('main h1').length,brand:document.querySelectorAll('.signin-brand').length,labels:[...document.querySelectorAll('main input:not(.vh)')].filter(e=>e.getClientRects().length).every(e=>e.labels?.length||e.getAttribute('aria-label'))}});
 if(result.overflow||result.left< -1||result.right>result.width+1){console.log(JSON.stringify({label,result,nodes:await x.p.evaluate(()=>[...document.body.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,wrap:getComputedStyle(e).overflowWrap})).slice(-14))}));if(engine==='chromium')await x.p.screenshot({path:`${out}/failed-${label}.png`,caret:'initial',fullPage:true});}
 ok(!result.overflow&&result.left>=-1&&result.right<=result.width+1,`${label}: card fits`);ok(result.headings===1&&result.brand===1,`${label}: one title and brand`);ok(result.labels,`${label}: fields labelled`);
 if(['forgot','join','email-sent','link-invalid'].includes(state))ok(await x.p.getByRole('button',{name:/^(Back to sign in|Sign in)$/}).count()===1,`${label}: one way back to sign in`);
 assert.deepEqual(x.errors,[]);assert.deepEqual(await x.p.evaluate(()=>window.__violations||[]),[]);checks+=2;
 if(engine==='chromium')await x.p.screenshot({path:`${out}/${label}.png`,caret:'initial',fullPage:true});
}
try{
 if(!process.env.AUTH_ONLY_LONG){
 for(const width of [320,390,1440])for(const scheme of ['light','dark']){
  const x=await open({width,scheme});try{
   await frame(x,'signin',`signin-${width}-${scheme}`);
   if(await x.p.getByLabel('Password',{exact:true}).isHidden())await x.p.getByRole('button',{name:'Use your password',exact:true}).click();
   await x.p.getByRole('button',{name:'Forgot password?',exact:true}).click();await frame(x,'forgot',`forgot-${width}-${scheme}`);
   ok((await x.p.locator('.signin-destination').innerText()).includes('Weather'),'recovery retains destination');
   await x.p.getByLabel('Email',{exact:true}).fill('sam@example.com');await x.p.getByRole('button',{name:'Email me a link',exact:true}).click();
   await frame(x,'email-sent',`email-sent-${width}-${scheme}`);
   ok(await x.p.getByRole('button',{name:'Back to sign in',exact:true}).evaluate(el=>el===document.activeElement),'email confirmation focuses its single return action');
   await x.p.getByRole('button',{name:'Change email address',exact:true}).click();await frame(x,'forgot',`email-edit-${width}-${scheme}`);
   ok(await x.p.getByLabel('Email',{exact:true}).inputValue()==='sam@example.com','editing keeps entered email');
   await x.p.getByRole('button',{name:'Back to sign in',exact:true}).click();await frame(x,'signin',`return-${width}-${scheme}`);
   ok(await x.p.evaluate(()=>!!document.activeElement.closest('.signin')&&document.activeElement.getClientRects().length>0),'returning from recovery focuses a visible sign-in control');
   await x.p.getByRole('button',{name:'Use an invite',exact:true}).click();await frame(x,'join',`invite-${width}-${scheme}`);
  }finally{await x.ctx.close();}
 }
 for(const [state,opts] of [
  ['reset-password',{url:`https://auth.inflite.ai/#reset=${token}`}],
  ['link-invalid',{url:`https://auth.inflite.ai/#reset=${token}`,reset:'expired'}],
  ['link-unavailable',{url:`https://auth.inflite.ai/#reset=${token}`,reset:'offline'}],
  ['security-link',{url:`https://auth.inflite.ai/#secure=${token}`}],
  ['signed-out',{url:'https://auth.inflite.ai/#signout=today&back=https%3A%2F%2Finflite.ai%2F'}],
  ['signout-confirm',{url:'https://auth.inflite.ai/#signout=today&back=https%3A%2F%2Finflite.ai%2F',signedIn:true}],
  ['continue',{signedIn:true}],
 ])for(const width of [390,1440]){
  const x=await open({...opts,width});try{await frame(x,state,`${state}-${width}`);
   if(state==='reset-password'){await x.p.getByRole('button',{name:'Back to sign in',exact:true}).click();await frame(x,'signin',`reset-cancel-${width}`);ok(!x.requests.some(r=>r.path==='reset/complete'),'reset Back makes no password change');}
   if(state==='security-link')ok(!x.requests.some(r=>r.path==='secure'),'security action waits for explicit approval');
   if(state==='signed-out'||state==='security-link'){
    await x.p.evaluate(token=>location.hash='#reset='+token,token);await frame(x,'reset-password',`link-over-${state}-${width}`);
    await x.p.getByRole('button',{name:'Back to sign in',exact:true}).click();await frame(x,'signin',`link-back-${state}-${width}`);
    ok(!x.requests.some(r=>r.path==='reset/complete'||r.path==='secure'),'leaving a link changes no credentials or security state');
   }
  }finally{await x.ctx.close();}
 }
 const signup=await open({url:'https://auth.inflite.ai/#join',join:true});try{
  await frame(signup,'join','signup-name');await signup.p.getByLabel('Your name',{exact:true}).fill('Sam Lee');await signup.p.getByRole('button',{name:'Next',exact:true}).click();
  await signup.p.getByRole('button',{name:'Back',exact:true}).click();ok(await signup.p.getByLabel('Your name',{exact:true}).inputValue()==='Sam Lee','signup Back retains values');
 }finally{await signup.ctx.close();}
 const loading=await open({holdModule:true,holdMe:true});try{
  await loading.moduleObserved;await loading.meObserved;
  await loading.p.locator('[data-auth-loading]').waitFor();ok(await loading.p.locator('.signin-brand').count()===1,'initial server shell uses same brand');
  ok(await loading.p.locator('input').count()===0,'unknown session exposes no sign-in form');loading.releaseModule();loading.releaseMe();await frame(loading,'signin','loading-finished');
 }finally{loading.releaseModule();loading.releaseMe();await loading.ctx.close();}
 const unmin=await open({source:true});try{await frame(unmin,'signin','source-fallback');}finally{await unmin.ctx.close();}
 }
 const long=await open({width:320,last:{name:'S'.repeat(50),handle:'sam',email:'a'.repeat(64)+'@'+'b'.repeat(63)+'.example.com',way:'password'}});
 try{await frame(long,'signin','long-identity');}finally{await long.ctx.close();}
 console.log(`${checks} ${engine} auth checks passed`);
}finally{await browser.close();}
