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
async function fixture(assets,{width=390,reduce=false,viewportEvents=false}={}){
 const ctx=await browser.newContext({viewport:{width,height:740},isMobile:width<600,hasTouch:width<600,reducedMotion:reduce?'reduce':'no-preference'});
 if(viewportEvents)await ctx.addInitScript(()=>{
  const vv=new EventTarget(),state={height:innerHeight,offsetTop:0,scale:1};window.viewportReads=0;
  for(const key of Object.keys(state))Object.defineProperty(vv,key,{get:()=>{if(key==='height')window.viewportReads++;return state[key];}});
  Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
  window.setTestViewport=(patch,silent=false)=>{Object.assign(state,patch);if(!silent)vv.dispatchEvent(new Event('resize'));};
 });
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
 await p.waitForFunction(()=>!document.body.classList.contains('playing-opening')&&document.body.classList.contains('known'));
 await p.evaluate(()=>document.fonts.ready);
 return{ctx,p,errors,posts,reply:r=>{response=r;if(r.gate)gates.push(r.gate);},cleanup:async()=>{gates.forEach(g=>g.resolve());await ctx.close();}};
}
async function open(f){await f.p.locator('footer [data-contact]').click();await f.p.locator('#contact-sheet[open]').waitFor();}
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
 test(`${assets||'source/'}app handoff preserves native navigation and Back`,async()=>{
  const f=await fixture(assets,{width:1440});
  try{
   await f.p.locator('#app-inflight').scrollIntoViewIfNeeded();
   for(const kind of ['modified','new-tab','download']){
    const prevented=await f.p.locator('#app-inflight').evaluate((el,kind)=>{
     const target=el.getAttribute('target');if(kind==='new-tab')el.target='_blank';if(kind==='download')el.setAttribute('download','');
     let prevented;document.addEventListener('click',e=>{prevented=e.defaultPrevented;e.preventDefault();},{once:true});
     el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:kind==='modified'}));
     if(target===null)el.removeAttribute('target');else el.setAttribute('target',target);el.removeAttribute('download');return prevented;
    },kind);
    assert.equal(prevented,false,kind+' retains the browser default');assert.equal(await f.p.locator('.app-handoff').count(),0);
   }
   const departure=await f.p.locator('#app-inflight').evaluate(el=>{
    el.click();const icon=document.querySelector('#app-inflight img');
    const result={cover:!!document.querySelector('.app-handoff'),opacity:icon.style.opacity};
    dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));return result;
   });
   assert.equal(departure.cover,true);assert.equal(departure.opacity,'0');
   await f.p.waitForTimeout(700);assert.equal(new URL(f.p.url()).hostname,'motion.test');assert.equal(await f.p.locator('.app-handoff').count(),0);assert.equal(await f.p.locator('#app-inflight img').evaluate(e=>e.style.opacity),'');
   assert.equal(await f.p.locator('body').evaluate(e=>e.classList.contains('leaving')),false);
   await f.p.locator('#app-inflight').click();await f.p.waitForURL('https://chat.inflite.ai/?from=bio&keep=1');assert.deepEqual(f.errors,[]);
  }finally{await f.cleanup();}
 });
 test(`${assets||'source/'}reduced motion skips spatial effects and completes the real send flow`,async()=>{
  const f=await fixture(assets,{width:320,reduce:true});
  try{
   assert.equal(await f.p.locator('[data-replay]').isVisible(),false);
   await open(f);await fill(f);await f.p.locator('#contact-send').click();await f.p.locator('#contact-sent:not([hidden])').waitFor();
   assert.equal(await f.p.locator('.tick path').evaluate(e=>getComputedStyle(e).animationName),'none');
   await close(f);await f.p.locator('#app-inflight').click();await f.p.waitForURL('https://chat.inflite.ai/?from=bio&keep=1');assert.deepEqual(f.errors,[]);
  }finally{await f.cleanup();}
 });
}

for(const assets of ['', 'min/']){
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
for(const assets of ['', 'min/'])for(const kb of [0,330])test(`${assets||'source/'}sender folds and unfolds smoothly${kb?' above the keyboard':''}`,async()=>{
 const f=await fixture(assets);try{
  await open(f);await f.p.locator('#contact-sheet.shown').waitFor();
  if(kb){await f.p.evaluate(k=>document.documentElement.style.setProperty('--kb',k+'px'),kb);await f.p.waitForTimeout(400);}
  await f.p.locator('#c-name').fill('Sam Rider');await f.p.locator('#c-email').fill('sam@example.com');
  const start=await f.p.evaluate(()=>{
   const msg=document.querySelector('#c-message');msg.focus({preventScroll:true});const before=msg.getBoundingClientRect().top,sender=document.querySelector('#sender'),height=sender.getBoundingClientRect().height;
   msg.value='Hi';msg.dispatchEvent(new Event('input',{bubbles:true}));
   const after=msg.getBoundingClientRect().top,a=sender.getAnimations().find(a=>a.effect.getKeyframes().some(f=>'height'in f)),duration=a.effect.getTiming().duration,frames=a.effect.getKeyframes();
   a.currentTime=duration/2;const halfway=sender.getBoundingClientRect().height;a.currentTime=0;
   return{before,after,height,halfway,end:parseFloat(frames.at(-1).height),duration,words:document.querySelectorAll('.sender-word').length,
    box:document.querySelector('.sheet-in').getAnimations().flatMap(a=>a.effect.getKeyframes())};
  });
  assert.ok(Math.abs(start.after-start.before)<1,'message starts from its painted position');assert.equal(start.words,2);
  assert.ok(start.halfway<start.height-2&&start.halfway>start.end+2,'the panel itself passes through intermediate heights');
  assert.ok(start.duration>=500,'compaction remains visibly gradual');assert.ok(start.box.every(f=>!('height'in f)),'only the sender panel animates its height; the sheet flows naturally');
  await f.p.waitForFunction(()=>!document.querySelector('.sender-word'));await f.p.waitForTimeout(40);
  assert.equal(await f.p.locator('#from-name').innerText(),'Sam Rider');assert.equal(await f.p.locator('#c-message').inputValue(),'Hi');
  assert.equal(await f.p.locator('#c-message').evaluate(el=>el===document.activeElement),true);
  assert.equal(await f.p.locator('#c-name').count(),1);assert.equal(await f.p.locator('#c-email').count(),1);
  await f.p.locator('#from-change').click();await f.p.waitForFunction(()=>!document.querySelector('.sender-word'));
  assert.equal(await f.p.locator('#c-name').isVisible(),true);assert.equal(await f.p.locator('#c-name').evaluate(el=>el===document.activeElement),true);
  assert.equal(await f.p.locator('#c-name').inputValue(),'Sam Rider');assert.equal(await f.p.locator('#c-email').inputValue(),'sam@example.com');
  assert.equal(await f.p.evaluate(()=>document.querySelectorAll('#sender .ghost').length),0);assert.equal(f.posts.length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
for(const assets of ['', 'min/'])test(`${assets||'source/'}sender reverses from its current position and lets typing take priority`,async()=>{
 const f=await fixture(assets);try{
  await open(f);await f.p.locator('#contact-sheet.shown').waitFor();await f.p.locator('#c-name').fill('Sam Rider');await f.p.locator('#c-email').fill('sam@example.com');
  await f.p.evaluate(()=>{const msg=document.querySelector('#c-message');msg.focus();msg.value='Hi';msg.dispatchEvent(new Event('input',{bubbles:true}));});
  const jump=await f.p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{
   const ghost=document.querySelector('.sender-word'),before=ghost.getBoundingClientRect();
   document.querySelector('#from-change').click();const after=document.querySelector('.sender-word').getBoundingClientRect();
   resolve(Math.hypot(after.left-before.left,after.top-before.top));
  })));
  assert.ok(jump<1,'reversal keeps the painted text position');
  await f.p.locator('#c-name').fill('Sam Changed');
  assert.equal(await f.p.locator('#c-name').evaluate(el=>getComputedStyle(el).opacity),'1','typing is immediately visible');
  await f.p.waitForFunction(()=>!document.querySelector('.sender-word'));
  assert.equal(await f.p.locator('#c-name').inputValue(),'Sam Changed');assert.equal(await f.p.locator('#c-message').inputValue(),'Hi');
  await f.p.evaluate(()=>document.querySelector('#c-message').focus());await close(f);
  assert.equal(await f.p.locator('.sender-word').count(),0);assert.equal(await f.p.locator('#sender .ghost').count(),0);assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
test('Reduce Motion folds the sender without transitional text copies',async()=>{
 const f=await fixture('',{reduce:true});try{
  await open(f);await fill(f);assert.equal(await f.p.locator('#sender').evaluate(el=>el.classList.contains('known')),true);
  assert.equal(await f.p.locator('.sender-word').count(),0);await f.p.locator('#from-change').click();assert.equal(await f.p.locator('#c-name').isVisible(),true);assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
for(const assets of ['', 'min/'])test(`${assets||'source/'}sending during the sender morph clears its transient text before confirmation`,async()=>{
 const f=await fixture(assets);try{
  await open(f);await f.p.locator('#contact-sheet.shown').waitFor();await f.p.locator('#c-name').fill('Sam Rider');await f.p.locator('#c-email').fill('sam@example.com');
  await f.p.evaluate(()=>{const msg=document.querySelector('#c-message');msg.focus({preventScroll:true});msg.value='Hi';msg.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#contact-form').requestSubmit();});
  await f.p.locator('#contact-sent:not([hidden])').waitFor();assert.equal(await f.p.locator('.sender-word').count(),0);assert.equal(await f.p.locator('#sender .ghost').count(),0);assert.equal(f.posts.length,1);assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
for(const assets of ['', 'min/'])test(`${assets||'source/'}motion tokens preserve milliseconds when CSS converts units to seconds`,async()=>{
 const f=await fixture(assets);try{
  assert.deepEqual(await f.p.evaluate(()=>({...MOTION})),{fast:180,enter:420,exit:260,layout:340,stagger:50});assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
for (const assets of ['', 'min/']) for (const [width, launcher] of [[390, 'menu'], [1440, 'footer']]) {
 test(`${assets || 'source/'}${width}px contact form moves together and reverses in place from the ${launcher}`, async () => {
  const f = await fixture(assets, {width});
  try {
   if (launcher === 'menu') await f.p.locator('.fi-menubtn').click();
   const selector = (launcher === 'menu' ? '#fi-floating-links' : 'footer') + ' [data-contact]';
   await f.p.locator(selector).scrollIntoViewIfNeeded();
   const initialScroll = await f.p.evaluate(() => scrollY);
   const samples = await f.p.evaluate(selector => {
    const trigger = document.querySelector(selector), dialog = document.querySelector('#contact-sheet');
    trigger.click();
    const animation = dialog._presentation;
    animation.pause();
    const sample = () => {
     const box = dialog.getBoundingClientRect();
     return {top:box.top, left:box.left, width:box.width, height:box.height, opacity:Number(getComputedStyle(dialog).opacity),
      textOffset:dialog.querySelector('#c-message').getBoundingClientRect().top - box.top};
    };
    const duration = animation.effect.getTiming().duration;
    animation.currentTime = 0; const start = sample();
    animation.currentTime = duration; const end = sample();
    animation.currentTime = duration * .4; const middle = sample();
    dialog.querySelector('[data-close]').click(); const reversing = sample();
    trigger.click(); const reopening = sample();
    dialog.querySelector('#c-message').focus();
    return {start, middle, end, reversing, reopening, sameAnimation:dialog._presentation === animation};
   }, selector);
   assert.ok(samples.sameAnimation);
   assert.ok(samples.middle.top > samples.end.top && samples.middle.top < samples.start.top);
   assert.ok(samples.middle.opacity > 0 && samples.middle.opacity < 1);
   assert.ok(samples.start.top - samples.end.top <= (width < 600 ? 50 : 20));
   for (const state of [samples.start, samples.middle, samples.reversing, samples.reopening]) {
    for (const key of ['width','height','left','textOffset']) assert.ok(Math.abs(samples.end[key] - state[key]) < 1, key);
   }
   for (const state of [samples.reversing, samples.reopening]) {
    assert.ok(Math.abs(samples.middle.top - state.top) < 1);
    assert.ok(Math.abs(samples.middle.opacity - state.opacity) < .01);
   }
   await f.p.waitForFunction(() => !document.querySelector('#contact-sheet')._presentation);
   assert.equal(await f.p.locator('#c-message').evaluate(el => el === document.activeElement), true);
   await close(f);
   await f.p.waitForFunction(selector => document.activeElement.matches(selector), launcher === 'menu' ? '.fi-menubtn' : selector);
   assert.ok(Math.abs(await f.p.evaluate(() => scrollY) - initialScroll) < 2);
   assert.deepEqual(f.errors, []);
  } finally { await f.cleanup(); }
 });
}
for(const assets of ['', 'min/'])test(`${assets||'source/'}keyboard viewport frames track directly, settle without polling, and preserve the draft`,async()=>{
 const f=await fixture(assets,{viewportEvents:true});try{
  await open(f);await f.p.locator('#c-name').fill('Sam Rider');await f.p.locator('#c-email').fill('sam@example.com');await f.p.locator('#c-message').fill('Keep this draft');await f.p.waitForFunction(()=>!document.querySelector('.sender-word'));
  for(const inset of [100,190,330]){
   await f.p.evaluate(inset=>setTestViewport({height:innerHeight-inset}),inset);
   await f.p.waitForFunction(inset=>parseFloat(document.documentElement.style.getPropertyValue('--kb'))===inset,inset);
   const state=await f.p.evaluate(()=>({bottom:parseFloat(getComputedStyle(document.querySelector('#contact-sheet')).bottom),transition:getComputedStyle(document.querySelector('#contact-sheet')).transitionDuration}));
   assert.ok(Math.abs(state.bottom-inset-8)<1,'sheet follows the actual viewport rather than easing behind it');assert.equal(state.transition,'0s');
  }
  await f.p.waitForTimeout(850);const reads=await f.p.evaluate(()=>viewportReads);await f.p.waitForTimeout(160);assert.equal(await f.p.evaluate(()=>viewportReads),reads,'no permanent frame loop while typing');
  assert.equal(await f.p.locator('#c-message').inputValue(),'Keep this draft');assert.equal(await f.p.locator('#c-message').evaluate(el=>el===document.activeElement),true);
  await f.p.evaluate(()=>setTestViewport({height:innerHeight-360},true));await f.p.locator('#c-message').press('End');await f.p.keyboard.type('!');
  await f.p.waitForFunction(()=>parseFloat(document.documentElement.style.getPropertyValue('--kb'))===360);assert.equal(await f.p.locator('#c-message').inputValue(),'Keep this draft!','typing catches silent viewport movement without losing input');
  await f.p.evaluate(()=>setTestViewport({height:innerHeight-440,scale:1.5}));await f.p.waitForTimeout(80);assert.equal(await f.p.evaluate(()=>parseFloat(document.documentElement.style.getPropertyValue('--kb'))),360,'pinch zoom does not masquerade as a keyboard');
  for(const inset of [190,50,0]){await f.p.evaluate(inset=>setTestViewport({height:innerHeight-inset,scale:1}),inset);await f.p.waitForFunction(inset=>parseFloat(document.documentElement.style.getPropertyValue('--kb'))===inset,inset);}
  await close(f);assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});

test('dismissing with the keyboard raised holds the sheet above it until the fade finishes', async () => {
 const f = await fixture('', {viewportEvents:true});
 try {
  await open(f);
  await f.p.locator('#c-message').fill('Keep my draft');
  await f.p.evaluate(() => setTestViewport({height:innerHeight - 290}));
  await f.p.waitForFunction(() => document.documentElement.style.getPropertyValue('--kb') === '290px');
  const bottom = await f.p.evaluate(() => {
   const d = document.querySelector('#contact-sheet'), start = getComputedStyle(d).bottom;
   d.querySelector('[data-close]').click();
   d._presentation.pause();
   setTestViewport({height:innerHeight});
   return start;
  });
  await f.p.waitForFunction(() => document.documentElement.style.getPropertyValue('--kb') === '0px');
  assert.equal(await f.p.locator('#contact-sheet').evaluate(d => getComputedStyle(d).bottom), bottom);
  await f.p.evaluate(() => document.querySelector('#contact-sheet')._presentation.play());
  await f.p.locator('#contact-sheet:not([open])').waitFor({state:'attached'});
  await open(f);
  assert.equal(await f.p.locator('#c-message').inputValue(), 'Keep my draft');
  assert.equal(await f.p.locator('#contact-sheet').evaluate(d => d.style.bottom), '');
 } finally { await f.cleanup(); }
});

test('dragging the contact handle keeps the page still and a downward swipe dismisses it', async () => {
 const f = await fixture('');
 try {
  await open(f);
  await f.p.waitForFunction(() => !document.querySelector('#contact-sheet')._presentation);
  const handle = await f.p.locator('#contact-sheet .grab').boundingBox();
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  await f.p.mouse.move(x, y);
  await f.p.mouse.down();
  await f.p.mouse.move(x, y + 140, {steps:8});
  const state = await f.p.evaluate(() => ({
   sheet:document.querySelector('#contact-sheet').getBoundingClientRect().top,
   page:getComputedStyle(document.querySelector('#page')).transform
  }));
  assert.ok(state.sheet > handle.y + 100);
  assert.equal(state.page, 'none');
  await f.p.mouse.up();
  await f.p.locator('#contact-sheet:not([open])').waitFor({state:'attached'});
  assert.deepEqual(f.errors, []);
 } finally { await f.cleanup(); }
});
