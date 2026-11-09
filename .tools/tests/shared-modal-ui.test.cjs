const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
const ROOT=resolve(__dirname,'../..');
test('shared problem report stays above an existing sheet, traps keyboard focus and restores it',async()=>{
 const {jsBlock,cssBlock}=await import('../iflmenu.mjs');
 const engine=process.env.UI_BROWSER==='webkit'?webkit:chromium;
 const b=await engine.launch(process.env.UI_BROWSER==='webkit'?{}:{executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [320,1440]){
  const c=await b.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await c.route('http://shared.test/**',async r=>{const p=new URL(r.request().url()).pathname;const body=p==='/shared.js'?jsBlock()+'\nwindow.auditIFL=IFL;':p==='/style.css'?cssBlock():p==='/'?'<!doctype html><html lang="en"><head><title>Shared controls</title><link rel="stylesheet" href="/style.css"><script src="/shared.js" defer></script></head><body><button id="outside">Outside</button><dialog id="under"><button id="open">Report a problem</button></dialog></body></html>':null;return body===null?r.fulfill({json:{}}):r.fulfill({body,contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'});});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://shared.test/');
  await p.evaluate(()=>{document.querySelector('#under').showModal();document.querySelector('#open').focus();auditIFL.bug.report();});
  const report=p.locator('dialog.ifb-layer');await report.waitFor({state:'visible'});assert.equal(await report.evaluate(x=>x.matches(':modal')),true);
  await p.locator('.ifb-acts button').last().focus();await p.keyboard.press('Tab');assert.equal(await p.locator('.ifb-note').evaluate(x=>x===document.activeElement),true);
  await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('.ifb-acts button').last().evaluate(x=>x===document.activeElement),true);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.keyboard.press('Escape');await report.waitFor({state:'detached'});assert.equal(await p.locator('#open').evaluate(x=>x===document.activeElement),true);assert.equal(await p.locator('#under').evaluate(x=>x.open),true);assert.deepEqual(errors,[]);await c.close();
 }}finally{await b.close();}
});
