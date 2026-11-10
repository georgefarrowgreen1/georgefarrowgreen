const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{resolve}=require('node:path'),{existsSync}=require('node:fs');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');let browser,serveKit,KIT,routeFitness,meAnswer;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));({routeFitness,meAnswer}=await import('./mocks/fitnessmock.mjs'));browser=process.env.FITNESS_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const width of [320,1440])test(`Fitness filters retain keyboard focus and their actual selection transition at ${width}px`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:width===320?'light':'dark',reducedMotion:'no-preference',locale:'en-GB',timezoneId:'Europe/London'});
 const me=meAnswer();me.offers=[];me.data.prefs={...me.data.prefs,onboarded:true,ask:false,maps:'tap'};await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});const state=await routeFitness(ctx,KIT,{me}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(KIT+'/?module=/fitness/roof/fitness.js&apps=weather,fitness');await page.waitForFunction(()=>window.kit?.ready);await page.evaluate(()=>kit.F.nav.go('/fitness/'));await page.locator('.week-overview').waitFor();
  for(const [section,label,choice]of [['Activities','Sport','Rides'],['Progress','Range','Year']]){
   await page.getByRole('tab',{name:section,exact:true}).click();const seg=page.getByRole('group',{name:label,exact:true}),button=seg.getByRole('button',{name:choice,exact:true});await button.waitFor();
   await page.evaluate(label=>{const seg=document.querySelector(`.fx-sec:not([hidden]) .seg[aria-label="${label}"]`);window.__filter=seg;window.__from=Number(seg.style.getPropertyValue('--at'));window.__chosen=[...seg.querySelectorAll('button')].find(b=>b.textContent===(label==='Sport'?'Rides':'Year'));},label);
   assert.ok(await button.evaluate(e=>e.getBoundingClientRect().height>=44));await button.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>__chosen.getAttribute('aria-pressed')==='true');
   const moving=await page.evaluate(()=>{const motion=__filter.getAnimations({subtree:true}).find(a=>a.transitionProperty==='translate');if(!motion)return null;motion.pause();motion.currentTime=motion.effect.getTiming().duration/2;window.__filterMotion=motion;return {position:parseFloat(getComputedStyle(__filter,'::before').translate),at:Number(__filter.style.getPropertyValue('--at')),from:__from,same:__filter===document.querySelector('.fx-sec:not([hidden]) .seg'),focus:document.activeElement===__chosen};});
   assert.ok(moving,'the retained highlight has a real running CSS transition');assert.equal(moving.same,true);assert.equal(moving.focus,true);assert.ok(moving.position>moving.from*100&&moving.position<moving.at*100,'highlight is between its old and new positions');
   await page.evaluate(()=>__filterMotion.finish());await page.waitForFunction(()=>__filterMotion.playState==='finished');
   await page.evaluate(async()=>{const c=await import('/fitness/roof/core.js');c.emit('acts');});await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>document.activeElement===__chosen&&__filter===document.querySelector('.fx-sec:not([hidden]) .seg')),true,'a data redraw retains the focused filter too');
   await page.emulateMedia({reducedMotion:'reduce'});const first=seg.getByRole('button').first();await first.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>__filter.style.getPropertyValue('--at')==='0');assert.equal(await page.evaluate(()=>document.activeElement===__filter.querySelector('button')),true);
   assert.equal(await page.evaluate(()=>__filter.getAnimations({subtree:true}).some(a=>a.transitionProperty==='translate'&&a.playState==='running')),false,'reduced motion changes selection immediately');await page.emulateMedia({reducedMotion:'no-preference'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(process.env.FITNESS_UI_SHOTS)await page.screenshot({path:process.env.FITNESS_UI_SHOTS+`/after-roof-${section.toLowerCase()}-${width}.png`});
  }
  await page.getByRole('tab',{name:'Today',exact:true}).click();assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.target?.closest?.('.fx-sec[hidden]')).length),0,'hidden Fitness sections perform no animation work');assert.equal(state.puts.length,0,'filtering does not change the saved training record');assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
