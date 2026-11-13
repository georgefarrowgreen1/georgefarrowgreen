// Exercise the real bio UI and account-aware destinations with isolated network responses.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync,statSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const ROOT=resolve(__dirname,'../..'),HOME='https://motion.test';
let browser;
before(async()=>{browser=await (process.env.BIO_TEST_BROWSER==='webkit'?webkit:chromium).launch(process.env.BIO_TEST_BROWSER==='webkit'?{}:{executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(assets,{width=390,reduce=false,cadence=0,saveData=false}={}){
 const ctx=await browser.newContext({viewport:{width,height:740},isMobile:width<600,hasTouch:width<600,reducedMotion:reduce?'reduce':'no-preference'});
 await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:get.call(this,type,...args);};});
 await ctx.addInitScript(({cadence,saveData})=>{if(saveData)Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true});if(cadence){const raf=requestAnimationFrame;let now=1000;window.requestAnimationFrame=cb=>raf(t=>cb(cb.name==='sample'?(now+=cadence):t));}},{cadence,saveData});
 const errors=[],posts=[],gates=[];let response={status:200,body:{ok:true},gate:null};
 await ctx.route(`${HOME}/**`,async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:readFileSync(resolve(ROOT,'index.html'),'utf8').replace('<html lang="en-GB">','<html lang="en-GB" data-words>')});
  if(path==='/api/me')return route.fulfill({json:{signedIn:false,links:{inflight:'https://chat.inflite.ai/?from=bio&keep=1'}}});
  if(path==='/api/content')return route.fulfill({json:{name:'George Farrow-Green',role:'Fitness · Outdoors',bio:'Bikes, fitness, outdoors.'}});
  if(path==='/api/contact'){
   const current=response;posts.push(route.request().postDataJSON());if(current.gate)await current.gate.promise;
   return route.fulfill({status:current.status,json:current.body});
  }
  if(path==='/api/background')return route.fulfill(url.search?{contentType:'image/png',body:readFileSync(resolve(ROOT,'pigeon/icon-180.png'))}:{json:{images:[]}});
  if(path.startsWith('/apps/'))return route.fulfill({contentType:'image/png',body:readFileSync(resolve(ROOT,'pigeon/icon-180.png'))});
  const min=resolve(ROOT,assets+path.slice(1)),file=assets&&/\.(css|js)$/.test(path)&&existsSync(min)?min:resolve(ROOT,path.slice(1));
  if(existsSync(file)&&statSync(file).isFile())return route.fulfill({body:readFileSync(file),contentType:{'.js':'text/javascript','.css':'text/css','.avif':'image/avif','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'}[extname(file)]||'application/octet-stream'});
  return route.fulfill({status:404,body:''});
 });
 await ctx.route('https://chat.inflite.ai/**',r=>r.fulfill({contentType:'text/html',body:'<title>Chat destination</title><p>Chat</p>'}));
 const p=await ctx.newPage();p.setDefaultTimeout(6500);p.on('pageerror',e=>errors.push(e.message));await p.goto(HOME);
 await p.waitForFunction(()=>!document.documentElement.matches('.intro-loading,.intro-revealing')&&document.body.classList.contains('known'));
 await p.evaluate(()=>document.fonts.ready);
 return{ctx,p,errors,posts,reply:r=>{response=r;if(r.gate)gates.push(r.gate);},cleanup:async()=>{gates.forEach(g=>g.resolve());await ctx.close();}};
}
async function open(f){await f.p.locator('.cta [data-contact]').click();await f.p.locator('#contact-sheet[open]').waitFor();}
async function close(f){await f.p.keyboard.press('Escape');await f.p.locator('#contact-sheet:not([open])').waitFor({state:'attached'});}
async function fill(f,message='A message to George'){
 await f.p.locator('#c-name').fill('Sam Rider');await f.p.locator('#c-email').fill('sam@example.com');await f.p.locator('#c-message').fill(message);
 await f.p.waitForTimeout(450);
}
for(const assets of ['', 'min/']){
 test(`${assets||'source/'}contact keeps existing sheet, validates, waits for real success, and restores errors/drafts`,async()=>{
  const f=await fixture(assets);
  try{
   await open(f);await f.p.locator('#contact-send').click();assert.equal(f.posts.length,0);assert.match(await f.p.locator('#contact-err').innerText(),/name/);
   await fill(f);const gate=deferred();f.reply({status:200,body:{ok:true},gate});
   await f.p.locator('#contact-send').click();await f.p.locator('#contact-send.busy').waitFor();
   assert.equal(await f.p.locator('#contact-form').getAttribute('aria-busy'),'true');assert.equal(await f.p.locator('#contact-sent').isVisible(),false);
   assert.equal(await f.p.locator('#contact-send .send-activity i').count(),3);
   await f.p.evaluate(()=>document.querySelector('#contact-form').requestSubmit());assert.equal(f.posts.length,1,'busy form does not send twice');
   gate.resolve();await f.p.locator('#contact-sent:not([hidden])').waitFor();assert.match(await f.p.locator('#thanks').innerText(),/Thanks, Sam/);
   assert.equal(await f.p.locator('#contact-send').getAttribute('aria-busy'),'false');assert.equal(await f.p.locator('#contact-sent button').evaluate(el=>el===document.activeElement),true);
   await close(f);await open(f);await f.p.locator('#c-message').fill('Keep this draft after an error');f.reply({status:503,body:{error:'Please try again shortly.'}});
   await f.p.locator('#contact-send').click();await f.p.locator('#contact-err:not([hidden])').waitFor();
   assert.equal(await f.p.locator('#c-message').inputValue(),'Keep this draft after an error');assert.equal(await f.p.locator('#contact-sent').isVisible(),false);
   assert.equal(await f.p.locator('#contact-send').isEnabled(),true);assert.equal(await f.p.locator('.send-activity').count(),0);
   const later=deferred();f.reply({status:200,body:{ok:true},gate:later});await f.p.locator('#contact-send').click();await f.p.locator('#contact-send.busy').waitFor();
   await close(f);await open(f);await f.p.locator('#c-message').fill('A new draft while the previous request finishes');later.resolve();await f.p.locator('#contact-send:not(.busy)').waitFor();
   assert.equal(await f.p.locator('#contact-form').isVisible(),true,'old request cannot replace a newly opened form');
   assert.equal(await f.p.locator('#c-message').inputValue(),'A new draft while the previous request finishes');
   assert.equal(await f.p.locator('#contact-sent').isVisible(),false);assert.deepEqual(f.errors,[]);
  }finally{await f.cleanup();}
 });
 test(`${assets||'source/'}hero depth freezes behind a sheet, sections reveal once, app handoff preserves navigation and Back`,async()=>{
  const f=await fixture(assets,{width:1440});
  try{
   await f.p.evaluate(()=>scrollTo({top:document.querySelector('.projects').offsetTop-180,behavior:'instant'}));
   await f.p.waitForFunction(()=>document.querySelector('.projects').getAnimations().length>0);
   await f.p.waitForFunction(()=>!document.querySelector('.projects').getAnimations().length);
   await f.p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await f.p.locator('.projects').scrollIntoViewIfNeeded();
   assert.equal(await f.p.locator('.projects').evaluate(e=>e.getAnimations().length),0,'one-time entrance does not loop');
   await f.p.evaluate(()=>scrollTo({top:120,behavior:'instant'}));await f.p.waitForFunction(()=>document.body.classList.contains('motion-lite')||parseFloat(document.querySelector('#bg').style.getPropertyValue('--hero-depth'))>0);
   const depth=await f.p.locator('#bg').evaluate(e=>e.style.getPropertyValue('--hero-depth'));await open(f);assert.equal(await f.p.locator('#bg').evaluate(e=>e.style.getPropertyValue('--hero-depth')),depth);
   await close(f);await f.p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await f.p.waitForFunction(()=>document.querySelector('#bg').style.getPropertyValue('--hero-depth')==='0px');
   await f.p.locator('.app[aria-hidden=false] .app-link').scrollIntoViewIfNeeded();
   for(const kind of ['modified','new-tab','download']){
    const prevented=await f.p.locator('.app[aria-hidden=false] .app-link').evaluate((el,kind)=>{
     const target=el.getAttribute('target');if(kind==='new-tab')el.target='_blank';if(kind==='download')el.setAttribute('download','');
     let prevented;document.addEventListener('click',e=>{prevented=e.defaultPrevented;e.preventDefault();},{once:true});
     el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:kind==='modified'}));
     if(target===null)el.removeAttribute('target');else el.setAttribute('target',target);el.removeAttribute('download');return prevented;
    },kind);
    assert.equal(prevented,false,kind+' retains the browser default');assert.equal(await f.p.locator('.app-handoff').count(),0);
   }
   const departure=await f.p.locator('.app[aria-hidden=false] .app-link').evaluate(el=>{
    el.click();const icon=document.querySelector('.app[aria-hidden=false] .app-grab img');
    const result={cover:!!document.querySelector('.app-handoff'),opacity:icon.style.opacity};
    dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));return result;
   });
   assert.equal(departure.cover,true);assert.equal(departure.opacity,'0');
   await f.p.waitForTimeout(700);assert.equal(new URL(f.p.url()).hostname,'motion.test');assert.equal(await f.p.locator('.app-handoff').count(),0);assert.equal(await f.p.locator('.app[aria-hidden=false] .app-grab img').evaluate(e=>e.style.opacity),'');
   assert.equal(await f.p.locator('body').evaluate(e=>e.classList.contains('leaving')),false);
   await f.p.locator('.app[aria-hidden=false] .app-link').click();await f.p.waitForURL('https://chat.inflite.ai/?from=bio&keep=1');assert.deepEqual(f.errors,[]);
  }finally{await f.cleanup();}
 });
 test(`${assets||'source/'}reduced motion skips spatial effects and completes the real send flow`,async()=>{
  const f=await fixture(assets,{width:320,reduce:true});
  try{
   await f.p.evaluate(()=>scrollTo({top:100,behavior:'instant'}));await f.p.waitForTimeout(80);assert.equal(await f.p.locator('#bg').evaluate(e=>e.style.getPropertyValue('--hero-depth')),'0px');
   await open(f);await fill(f);await f.p.locator('#contact-send').click();await f.p.locator('#contact-sent:not([hidden])').waitFor();
   assert.equal(await f.p.locator('.tick path').evaluate(e=>getComputedStyle(e).animationName),'none');
   await close(f);await f.p.locator('.app[aria-hidden=false] .app-link').click();await f.p.waitForURL('https://chat.inflite.ai/?from=bio&keep=1');assert.deepEqual(f.errors,[]);
  }finally{await f.cleanup();}
 });
}

for(const assets of ['', 'min/']){
 test(`${assets||'source/'}rapid reversals keep the current card position and momentum without queued moves`,async()=>{
  const f=await fixture(assets,{width:1440});
  try{
   await f.p.locator('.app[aria-hidden=false] .app-grab').focus();
   const continuity=await f.p.evaluate(()=>{
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    const start=performance.now();while(performance.now()-start<70){}
    document.querySelector('#apps').getAnimations({subtree:true}).forEach(a=>a.currentTime=70);
    const card=document.querySelector('#app-inflight'),old=new DOMMatrixReadOnly(getComputedStyle(card).transform).m41;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
    const a=card.getAnimations().find(a=>a.effect.getKeyframes()[0].transform),frames=a.effect.getKeyframes();
    return{before:old,start:new DOMMatrixReadOnly(frames[0].transform).m41,next:new DOMMatrixReadOnly(frames[1].transform).m41,name:document.querySelector('.app[aria-hidden=false] b').textContent};
   });
   assert.equal(continuity.name,'Chat');assert.ok(Math.abs(continuity.before-continuity.start)<.5,'retarget starts from the currently painted position');
   assert.ok(continuity.next<continuity.start,'inherited velocity is retained before reversing direction');
   for(let i=0;i<7;i++)await f.p.keyboard.press('ArrowRight');
   assert.equal(await f.p.locator('.app[aria-hidden=false] b').innerText(),'Markets','every new input retargets immediately');
   await f.p.waitForFunction(()=>!document.querySelector('#apps').getAnimations({subtree:true}).length);
   await f.p.waitForTimeout(600);assert.equal(await f.p.locator('.app[aria-hidden=false] b').innerText(),'Markets');
   assert.equal(await f.p.locator('.app:not([inert])').count(),1);assert.deepEqual(f.errors,[]);
  }finally{await f.cleanup();}
 });
 test(`${assets||'source/'}message confirmation scales only its surface and leaves text unscaled`,async()=>{
  const f=await fixture(assets);
  try{
   await open(f);await fill(f);
   await f.p.evaluate(()=>{
    const watch=new MutationObserver(()=>{
     if(document.querySelector('#contact-sent').hidden)return;
     window.confirmationFrames={
      surface:document.querySelector('.sheet-surface').getAnimations().map(a=>a.effect.getKeyframes()),
      text:document.querySelector('.sheet-in').getAnimations().map(a=>a.effect.getKeyframes()),
      sent:document.querySelector('#contact-sent').getAnimations().map(a=>a.effect.getKeyframes())
     };watch.disconnect();
    });watch.observe(document.querySelector('#contact-sheet'),{subtree:true,attributes:true,attributeFilter:['hidden']});
   });
   await f.p.locator('#contact-send').click();await f.p.locator('#contact-sent:not([hidden])').waitFor();
   const transition=await f.p.evaluate(()=>window.confirmationFrames);
   assert.ok(transition.surface.flat().some(f=>f.transform?.includes('scaleY')));
   assert.ok(transition.text.flat().every(f=>!f.transform?.includes('scale')&&!('height'in f)));
   assert.ok(transition.sent.flat().every(f=>!f.transform?.includes('scale')&&!('height'in f)));
   await close(f);await open(f);assert.equal(await f.p.locator('#contact-form').isVisible(),true);assert.deepEqual(f.errors,[]);
  }finally{await f.cleanup();}
 });
}
for(const cadence of [1000/120,1000/60,1000/30])test(`frame monitor recognises ${Math.round(1000/cadence)} Hz and only reduces decoration on slow frames`,async()=>{
 const f=await fixture('',{width:1440,cadence});
 try{
  await f.p.waitForFunction(()=>performance.getEntriesByName('bio.motion.sample').length>0);
  const result=await f.p.evaluate(()=>performance.getEntriesByName('bio.motion.sample')[0].detail);
  assert.ok(Math.abs(result.cadence-cadence)<.2);assert.equal(result.light,cadence>24);
  assert.equal(await f.p.locator('body').evaluate(e=>e.classList.contains('motion-lite')),cadence>24);
  await f.p.locator('.app[aria-hidden=false] .app-next').click();assert.equal(await f.p.locator('.app[aria-hidden=false] b').innerText(),'Weather');
  await f.p.waitForTimeout(300);assert.equal(await f.p.evaluate(()=>performance.getEntriesByName('bio.motion.sample').length),1,'monitor is bounded');assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
test('Save Data keeps the page decorative motion still while all card controls work',async()=>{
 const f=await fixture('',{saveData:true});try{
  assert.equal(await f.p.locator('body').evaluate(e=>e.classList.contains('motion-lite')),true);
  await f.p.locator('.app[aria-hidden=false] .app-next').click();assert.equal(await f.p.locator('.app[aria-hidden=false] b').innerText(),'Weather');assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
