// Real studio page, local synthetic account and browser storage; no messages or reports are sent.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{readFileSync,existsSync,mkdirSync}=require('node:fs'),{resolve,extname}=require('node:path');
const ROOT=resolve(__dirname,'../../fitting');let browser;
before(async()=>{browser=process.env.FITTING_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const width of [320,390,1440])for(const colorScheme of ['light','dark'])test(`Fit Studio tool focus and layout at ${width}px ${colorScheme}`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:900},colorScheme,reducedMotion:width===320?'reduce':'no-preference',serviceWorkers:'block'}),errors=[];
 try{
  await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='studio.test')return r.abort();if(u.pathname==='/api/me')return r.fulfill({json:{name:'Test fitter',google:'',googleFixed:false}});const f=resolve(ROOT,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(ROOT+'/')||!existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({body:readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(f)]||'application/octet-stream'});});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('https://studio.test/');await p.locator('#main .step-head').waitFor();
  await p.locator('#btn-fits').click();const dialog=p.getByRole('dialog',{name:'Fits on this device',exact:true});await dialog.waitFor();
  assert.equal(await p.locator('.shell').evaluate(e=>e.inert),true);assert.equal(await p.locator('.top').evaluate(e=>e.inert),true);
  assert.equal(await dialog.evaluate(e=>e.contains(document.activeElement)),true,'opening moves focus into the tool');
  await p.locator('#fits-q').focus();await p.keyboard.press('Tab');assert.equal(await p.locator('[data-act="signout"]').evaluate(e=>e===document.activeElement),true,'Tab from the last field wraps to the first control');
  await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#fits-q').evaluate(e=>e===document.activeElement),true,'Shift+Tab wraps back to the last field');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(process.env.FITTING_SCREENSHOTS){mkdirSync(process.env.FITTING_SCREENSHOTS,{recursive:true});await p.screenshot({path:process.env.FITTING_SCREENSHOTS+`/studio-${width}-${colorScheme}.png`});}
  if(width===320)assert.equal(await dialog.evaluate(e=>e.getAnimations().length),0,'reduced motion skips the tool entrance');
  await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await p.locator('#btn-fits').evaluate(e=>e===document.activeElement),true,'closing restores the opener');assert.equal(await p.locator('.shell').evaluate(e=>e.inert),false);
  assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
