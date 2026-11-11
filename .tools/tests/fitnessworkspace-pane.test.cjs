const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{resolve}=require('node:path'),{existsSync,readFileSync}=require('node:fs');
const ROOT=resolve(__dirname,'../..');
// The OS keeps its provider capability when expanding an app; only physical pane ownership changes this layout.
test('Fitness workspace CSS follows embedded ownership and restores full-app layout without replacing focused controls',async()=>{
 const browser=process.env.FITNESS_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 try{
  await context.route('http://fitness-pane.test/**',r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="light"><head><link rel="stylesheet" href="/.tools/inflite/tokens.css"><link rel="stylesheet" href="/fitness/roof/fitness.css"><link rel="stylesheet" href="/fitness/roof/fxviews.css"><link rel="stylesheet" href="/fitness/roof/workspace.css"><link rel="stylesheet" href="/fixture.css"></head><body><div class="test-frame"><main class="m-fitness fx-workspace"><div class="fx-progress"><section class="p-hero">Training</section><section class="p-cards"><button class="p-card">Your ride</button><button class="p-card">Your progress</button></section></div></main></div></body></html>'});if(p==='/fixture.css')return r.fulfill({contentType:'text/css',body:'.test-frame{width:1408px}.test-frame.compact{width:560px}'});const f=resolve(ROOT,'.'+p);return f.startsWith(ROOT+'/')&&existsSync(f)?r.fulfill({contentType:'text/css',body:readFileSync(f)}):r.fulfill({status:404,body:''});});
  await page.goto('http://fitness-pane.test/');const control=page.getByRole('button',{name:'Your ride',exact:true});await control.focus();
  const layout=()=>page.evaluate(()=>{const root=document.querySelector('main'),cards=root.querySelector('.p-cards'),card=cards.querySelector('button');return{progress:getComputedStyle(root.querySelector('.fx-progress')).display,cards:getComputedStyle(cards).display,width:card.getBoundingClientRect().width,focused:document.activeElement===card,container:getComputedStyle(root).containerType};});
  let state=await layout();assert.equal(state.progress,'grid');assert.equal(state.cards,'grid');assert.equal(state.container,'normal','SDK capability alone does not establish pane geometry');
  for(let i=0;i<2;i++){
   await page.evaluate(()=>{document.querySelector('.test-frame').classList.add('compact');document.querySelector('main').classList.add('ifl-in-pane');});state=await layout();assert.equal(state.progress,'block');assert.equal(state.cards,'flex');assert.equal(state.container,'inline-size');assert.ok(state.width>=200&&state.width<=290.5);assert.equal(state.focused,true,'embedding preserves the focused real control');
   await page.evaluate(()=>{document.querySelector('.test-frame').classList.remove('compact');document.querySelector('main').classList.remove('ifl-in-pane');});state=await layout();assert.equal(state.progress,'grid');assert.equal(state.cards,'grid');assert.equal(state.container,'normal');assert.equal(state.focused,true,'expanding restores full-app layout with the same focus');
  }
 }finally{await context.close();await browser.close();}
});
