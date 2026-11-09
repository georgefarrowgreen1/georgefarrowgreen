const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{resolve}=require('node:path'),{existsSync}=require('node:fs'),{pathToFileURL}=require('node:url'),{mkdir}=require('node:fs/promises');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');let browser,serveKit,KIT,defaults;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));defaults=(await import(pathToFileURL(ROOT+'/fitness/rhythm.js'))).DEFAULTS;browser=process.env.FITNESS_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const width of [320,390,1440])test(`Fitness controls, weekly availability and reduced motion remain usable at ${width}px`,async()=>{
 const reduced=width!==390,ctx=await browser.newContext({viewport:{width,height:950},colorScheme:width===390?'dark':'light',reducedMotion:reduced?'reduce':'no-preference'});
 await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});let writes=0;
 await ctx.route('**/api/fitness/**',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({json:{signedIn:true,id:'ui-rider',name:'Alex',ver:1,data:{profile:{ftp:250,weight:75,lthr:160,maxHr:185,set:['ftp']},rhythm:{...defaults,days:[270,0,0,0,0,60,270],at:Date.now()-14*86400e3},plan:null,swaps:{},workouts:[],prefs:{onboarded:true,ask:false,maps:'tap'}},acts:[],garmin:{on:false},health:{on:false},strava:{on:false},offers:[],times:[]}});});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
 try{
  await p.goto(KIT+'/?module=/fitness/roof/fitness.js&apps=weather,fitness');await p.waitForFunction(()=>window.kit?.ready);await p.evaluate(()=>kit.F.nav.go('/fitness/'));
  await p.locator('.week-overview').waitFor();
  if(width<980){await p.waitForFunction(()=>document.querySelector('.m-fitness .strip-all')?.getBoundingClientRect().height>=43.99);const two=p.locator('.m-fitness .strip-all');await two.click({trial:true});assert.ok(await two.evaluate(e=>e.getBoundingClientRect().height>=43.99));
   const back=p.getByRole('button',{name:'The week before',exact:true}).filter({visible:true});await back.click({trial:true});assert.ok(await back.evaluate(e=>e.getBoundingClientRect().height>=43.99));assert.ok(await back.evaluate(e=>parseFloat(getComputedStyle(e,'::after').width)>=43.99));assert.ok(await back.evaluate(e=>{const p=e.parentElement,n=p.querySelectorAll('.strip-step')[1];return n.getBoundingClientRect().right+6<=p.querySelector('.strip-all').getBoundingClientRect().left+1;}),'week-arrow hit areas do not overlap the two-week switch');await back.click();await p.waitForFunction(()=>document.querySelector('.strip-top b')?.textContent.includes('Last week'));
  }else await p.locator('.wgrid').waitFor();
  const week=p.locator('button.row').filter({hasText:/^Your week/}).filter({visible:true});await week.click();
  const slider=p.getByRole('slider',{name:'Monday',exact:true});await slider.waitFor();assert.equal(await slider.getAttribute('aria-orientation'),'vertical');
  await slider.focus();await p.keyboard.press('Home');assert.equal(await slider.getAttribute('aria-valuenow'),'0');await p.keyboard.press('End');assert.equal(await slider.getAttribute('aria-valuenow'),'360');await p.keyboard.press('ArrowDown');assert.equal(await slider.getAttribute('aria-valuenow'),'345');
  const less=p.getByRole('button',{name:'15 minutes less',exact:true});assert.ok((await less.boundingBox()).width>=44);assert.ok((await less.boundingBox()).height>=44);await less.click();assert.equal(await slider.getAttribute('aria-valuenow'),'330');
  await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2,box.y+box.height*.7);assert.equal(await slider.evaluate(e=>e.classList.contains('dragging')),true);assert.ok(await slider.locator('i').evaluate(e=>getComputedStyle(e).transitionDuration.split(',').every(v=>parseFloat(v)<=0.001)));
  const beforeCancel=await slider.getAttribute('aria-valuenow');await slider.dispatchEvent('pointercancel',{pointerId:1});await p.mouse.move(box.x+box.width/2,box.y+box.height*.2);await p.mouse.up();assert.equal(await slider.getAttribute('aria-valuenow'),beforeCancel);assert.equal(await slider.evaluate(e=>e.classList.contains('dragging')),false);
  if(reduced)assert.ok(await less.evaluate(e=>getComputedStyle(e).transitionDuration.split(',').every(v=>parseFloat(v)<=0.001)));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);const oldWrites=writes;
  if(process.env.FITNESS_UI_SHOTS){await mkdir(process.env.FITNESS_UI_SHOTS,{recursive:true});await p.screenshot({path:process.env.FITNESS_UI_SHOTS+'/week-'+width+'.png'});}
  await p.keyboard.press('Escape');assert.equal(writes,oldWrites,'closing the draft does not save availability');assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
