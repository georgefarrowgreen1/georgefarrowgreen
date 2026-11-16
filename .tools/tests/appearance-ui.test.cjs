const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { mkdirSync,mkdtempSync,readFileSync,rmSync } = require('node:fs');
const {tmpdir}=require('node:os');
const {resolve}=require('node:path');
const {execFileSync}=require('node:child_process');
const {createServer}=require('node:https');
const {createServer:createProxy}=require('node:http');
const {connect}=require('node:net');
let browser, backend,server,proxy,proxyURL,certificateDir,active;const sockets=new Set(),preferenceWrites=[];
const engine = (process.env.WEB_UI_BROWSER || process.env.IDENTITY_BROWSER) === 'webkit' ? 'webkit' : 'chromium';
const out = process.env.IDENTITY_PREVIEWS || '/tmp/inflite-os-next-20261114/identity';
before(async()=>{
 mkdirSync(out,{recursive:true});
 const {createIdentityBackend}=await import('./fixtures/identity-backend.mjs');backend=await createIdentityBackend();
 certificateDir=mkdtempSync(resolve(tmpdir(),'identity-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',resolve(certificateDir,'key.pem'),'-out',resolve(certificateDir,'cert.pem'),'-subj','/CN=inflite.ai','-addext','subjectAltName=DNS:inflite.ai','-days','1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(resolve(certificateDir,'key.pem')),cert:readFileSync(resolve(certificateDir,'cert.pem'))},async(req,res)=>{
  try{const parts=[];for await(const part of req)parts.push(part);const bytes=parts.length?Buffer.concat(parts):undefined;
   if(req.method==='PUT'&&req.url==='/account/api/account/prefs')preferenceWrites.push(JSON.parse(bytes));
   const url='https://inflite.ai'+req.url;const response=await backend.request(new Request(url,{method:req.method,headers:req.headers,body:bytes}));
   if(active&&response.status>=400&&!/\/api\/(bugs|vitals|status-banner)/.test(url))active.failed.push(url+' '+response.status);
   const headers=Object.fromEntries(response.headers),cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
   res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){active?.errors.push(error.message);res.destroy();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 proxy=createProxy((_req,res)=>{res.writeHead(403);res.end();});proxy.on('connect',(req,socket,head)=>{
  if(req.url!=='inflite.ai:443'){socket.destroy();return;}
  const upstream=connect(server.address().port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
  for(const peer of [socket,upstream]){sockets.add(peer);peer.on('close',()=>sockets.delete(peer));peer.on('error',()=>{socket.destroy();upstream.destroy();});}
 });await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));proxyURL='http://127.0.0.1:'+proxy.address().port;
 browser=engine==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--ignore-certificate-errors']});
});

test(`Account glass commits survive immediate navigation and departure cancels previews ${engine}`,async()=>{
 const context=await browser.newContext({viewport:{width:390,height:950},isMobile:true,hasTouch:true,serviceWorkers:'block',ignoreHTTPSErrors:true,proxy:{server:proxyURL},reducedMotion:'reduce'});
 const errors=[];active={errors,failed:[]};
 try{
  const pub=await crypto.subtle.exportKey('jwk',(await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits'])).publicKey);
  const signup=await backend.request(new Request('https://inflite.ai/auth/api/account/signup',{method:'POST',headers:{Origin:'https://inflite.ai','Content-Type':'application/json'},body:JSON.stringify({name:'Glass Departure',handle:'glassleave'+engine,email:'glassdeparture'+engine+'@example.com',salt:Buffer.alloc(16,7).toString('base64url'),proof:Buffer.alloc(32,8).toString('base64url'),vault:'v'.repeat(40),pub})}));
  assert.equal(signup.status,201,await signup.clone().text());
  await context.addCookies(signup.headers.getSetCookie().map(c=>{const item=c.split(';')[0],i=item.indexOf('=');return{name:item.slice(0,i),value:item.slice(i+1),domain:'.inflite.ai',path:'/',secure:true,httpOnly:true,sameSite:'Lax'};}));
  const cookies=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');
  const saved=async()=>{const response=await backend.request(new Request('https://inflite.ai/account/api/account/appearance',{headers:{Cookie:cookies}}));assert.equal(response.status,200);return response.json();};
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const beforeWrites=preferenceWrites.length;
  await page.goto('https://inflite.ai/account/#open=appearance');
  await page.locator('#appearance-glass-strength').waitFor();
  assert.equal((await saved()).glassStrength,70);
  // The document departs in the very same task as the native change event,
  // before its 350ms coalescing timer can send the account preference.
  await page.locator('#appearance-glass-strength').evaluate(el=>{el.value='83';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));location.assign('about:blank');});
  await page.waitForURL('about:blank');
  let kept;
  for(let attempt=0;attempt<100;attempt++){kept=await saved();if(kept.glassStrength===83)break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(kept.glassStrength,83,'the committed level reaches the account after immediate navigation');
  assert.equal(preferenceWrites.length,beforeWrites+1,'departure flushes the committed level once');
  await page.goto('https://inflite.ai/account/#open=appearance');
  await page.waitForFunction(()=>document.querySelector('#appearance-glass-strength')?.value==='83');
  await page.locator('#appearance-glass-strength').evaluate(el=>{el.value='17';el.dispatchEvent(new Event('input',{bubbles:true}));location.assign('about:blank');});
  await page.waitForURL('about:blank');
  await page.goBack();
  await page.waitForFunction(()=>document.querySelector('#appearance-glass-strength')?.value==='83');
  assert.equal((await saved()).glassStrength,83,'an unfinished preview is not saved on departure');
  assert.equal(preferenceWrites.length,beforeWrites+1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).glassStrength),83);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
after(async()=>{await browser?.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>proxy?proxy.close(resolve):resolve());await new Promise(resolve=>server?server.close(resolve):resolve());await backend?.close();if(certificateDir)rmSync(certificateDir,{recursive:true,force:true});});

for(const width of [320,390,1440])test(`account Appearance persists, handles rapid choices and keeps keyboard focus ${engine}/${width}`,async()=>{
 const context=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',ignoreHTTPSErrors:true,proxy:{server:proxyURL},colorScheme:'light',reducedMotion:width===1440?'no-preference':'reduce'});
 const errors=[];active={errors,failed:[]};
 try{
  const pub=await crypto.subtle.exportKey('jwk',(await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits'])).publicKey);
  const r=await backend.request(new Request('https://inflite.ai/auth/api/account/signup',{method:'POST',headers:{Origin:'https://inflite.ai','Content-Type':'application/json'},body:JSON.stringify({name:'Theme Tester',handle:'appearance'+width,email:'appearance'+width+'@example.com',salt:Buffer.alloc(16,7).toString('base64url'),proof:Buffer.alloc(32,8).toString('base64url'),vault:'v'.repeat(40),pub})}));
  assert.equal(r.status,201,await r.clone().text());
  await context.addCookies(r.headers.getSetCookie().map(c=>{const item=c.split(';')[0],i=item.indexOf('=');return{name:item.slice(0,i),value:item.slice(i+1),domain:'.inflite.ai',path:'/',secure:true,httpOnly:true,sameSite:'Lax'};}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto('https://inflite.ai/account/#open=appearance');
  await page.locator('[data-appearance-palette=coast]').waitFor();
  const material=await page.locator('#sheet').evaluate(node=>{const style=getComputedStyle(node),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');c.fillStyle=style.backgroundColor;c.fillRect(0,0,1,1);return{alpha:c.getImageData(0,0,1,1).data[3]/255,blur:style.backdropFilter||style.webkitBackdropFilter,background:style.backgroundColor,glass:document.documentElement.dataset.glass,strength:InFliteAppearance.snapshot().glassStrength};});
  assert.equal(material.strength,70,'default Account material level');
  console.log('Account glass material',engine,width,JSON.stringify(material));
  assert.equal(material.glass,'on');assert.ok(material.alpha<.94&&material.alpha>.5,`the real default Account window remains visibly translucent: ${JSON.stringify(material)}`);assert.match(material.blur,/blur\((?!0(?:px)?\))/,'the real default Account window samples its backdrop');
  assert.equal(await page.locator('[data-appearance-palette]').count(),6);
  await page.locator('[data-appearance-palette=coast]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.documentElement.dataset.palette==='coast');
  assert.equal(await page.locator('[data-appearance-palette=coast]').evaluate(el=>document.activeElement===el),true);
  await page.waitForFunction(()=>document.querySelector('.appearance-status')?.textContent==='Applies across your InFlite apps.');
  await page.locator('[data-appearance-mode=dark]').click();
  await page.locator('[data-appearance-palette=iris]').click();
  await page.locator('[data-appearance-palette=ember]').click();
  await page.waitForFunction(()=>document.querySelector('.appearance-status')?.textContent==='Applies across your InFlite apps.');
  let pref=await page.evaluate(()=>fetch('/account/api/account/appearance').then(r=>r.json()));assert.equal(pref.palette,'ember');assert.equal(pref.appearance,'dark');
  assert.equal(await page.locator('[data-appearance-palette=ember]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.reload();await page.locator('[data-appearance-palette=ember][aria-pressed=true]').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  // Another open page receives the account cache without reloading either view.
  const second=await context.newPage();await second.goto('https://inflite.ai/account/#open=appearance');await second.locator('[data-appearance-palette=coast]').waitFor();
  await page.locator('[data-appearance-palette=rose]').click();
  await second.waitForFunction(()=>document.documentElement.dataset.palette==='rose');
  await page.waitForFunction(()=>document.querySelector('.appearance-status')?.textContent==='Applies across your InFlite apps.');
  // A failed save puts back the stored account choice, visibly and on reload.
  await page.route('**/api/account/prefs',route=>route.fulfill({status:503,json:{error:'Could not save this theme.'}}));
  await page.locator('[data-appearance-palette=graphite]').click();
  await page.waitForFunction(()=>document.querySelector('.appearance-status')?.textContent==='Applies across your InFlite apps.'&&document.documentElement.dataset.palette==='rose');
  await page.unroute('**/api/account/prefs');
  await page.locator('[data-appearance-mode=auto]').click();
  await page.waitForFunction(()=>document.querySelector('.appearance-status')?.textContent==='Applies across your InFlite apps.');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme==='dark');
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme==='light');
  const glassSwitch=page.getByRole('switch',{name:'Liquid Glass',exact:true}), strength=page.getByRole('slider',{name:'Intensity',exact:true});
  const glassPrefs=()=>page.evaluate(()=>fetch('/account/api/account/appearance').then(r=>r.json()));
  const settled=()=>page.waitForFunction(()=>document.querySelector('.appearance-status')?.textContent==='Applies across your InFlite apps.');
  const inputStrength=value=>strength.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const commitStrength=async value=>{await inputStrength(value);await strength.dispatchEvent('change');await settled();};
  const putRequests=[];page.on('request',request=>{if(request.method()==='PUT'&&new URL(request.url()).pathname==='/account/api/account/prefs')putRequests.push(request.postDataJSON());});
  assert.equal(await glassSwitch.isChecked(),true);assert.equal(await strength.inputValue(),'70');
  assert.equal(await strength.isEnabled(),true);
  assert.equal(await strength.evaluate(el=>el.getBoundingClientRect().height>=44),true,'range has a touch-sized target');
  if(width===390){
   const material=page.locator('.appearance-glass');
   await material.scrollIntoViewIfNeeded();
   for(const colour of ['light','dark']){
    await page.emulateMedia({colorScheme:colour});
    await page.evaluate(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await material.screenshot({path:out+'/glass-'+engine+'-'+colour+'.png'});
   }
   await page.emulateMedia({colorScheme:'light'});
  }
  // Native keyboard operation commits an exact integer and retains focus.
  await strength.focus();
  for(const [key,value]of [['Home',0],['End',100],['ArrowLeft',99],['ArrowRight',100]]){
   await strength.press(key);await settled();
   assert.equal(await strength.inputValue(),String(value));assert.equal((await glassPrefs()).glassStrength,value);
   assert.equal(await strength.evaluate(el=>el===document.activeElement),true);
   assert.match(await strength.getAttribute('aria-valuetext'),new RegExp('^'+value+' percent,'));
  }
  // Moving a range previews immediately without a cache or API write. Escape
  // and pointer cancellation restore the last committed level in place.
  const requestsBeforePreview=putRequests.length;
  await inputStrength(35);
  assert.equal(await page.evaluate(()=>InFliteAppearance.snapshot().glassStrength),35);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).glassStrength),100);
  assert.equal((await glassPrefs()).glassStrength,100);assert.equal(putRequests.length,requestsBeforePreview);
  await strength.press('Escape');
  assert.equal(await strength.inputValue(),'100');assert.equal(await page.locator('#sheet').evaluate(el=>el.open),true);
  await inputStrength(12);await strength.dispatchEvent('pointercancel');
  assert.equal(await strength.inputValue(),'100');assert.equal(putRequests.length,requestsBeforePreview);
  await commitStrength(25);
  assert.equal((await glassPrefs()).glassStrength,25);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).glassStrength),25);
  await glassSwitch.click();await settled();
  assert.equal(await strength.isDisabled(),true);assert.equal(await strength.inputValue(),'25');
  assert.equal((await glassPrefs()).glass,false);
  assert.equal(await page.locator('.appearance-glass-preview-pane').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  await glassSwitch.click();await settled();
  assert.equal(await strength.isEnabled(),true);assert.equal((await glassPrefs()).glassStrength,25);
  // Media preferences stay stronger than a stored material setting.
  await page.emulateMedia({forcedColors:'active'});
  await page.locator('#appearance-glass-preference').waitFor({state:'visible'});
  assert.match(await page.locator('#appearance-glass-preference').innerText(),/Higher contrast/);
  assert.equal(await page.locator('.appearance-glass-preview-pane').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  await page.emulateMedia({forcedColors:'none'});
  // A failed material save rolls back the control, cache, preview and server
  // preference together, without changing the selected palette or display mode.
  await page.route('**/api/account/prefs',route=>route.fulfill({status:503,json:{error:'Could not save this glass setting.'}}));
  await commitStrength(88);
  await page.waitForFunction(()=>document.querySelector('[data-appearance-glass-strength]').value==='25');
  assert.equal((await glassPrefs()).glassStrength,25);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).glassStrength),25);
  assert.equal(await page.evaluate(()=>InFliteAppearance.snapshot().palette),'rose');
  await page.unroute('**/api/account/prefs');
  if(width===390){
   const beforeClose=putRequests.length;
   await inputStrength(44);
   await page.locator('#sheet .sheet-head [aria-label="Close"]').click();
   await page.waitForFunction(()=>!document.querySelector('#sheet').open);
   await page.waitForFunction(()=>InFliteAppearance.snapshot().glassStrength===25);
   assert.equal(await page.evaluate(()=>InFliteAppearance.snapshot().glassStrength),25);
   assert.equal(putRequests.length,beforeClose,'closing a preview does not persist it');
   await page.locator('main [data-k="Appearance"]').click();await strength.waitFor();
   let release,seen;const held=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{seen=resolve;});
   await page.route('**/api/account/prefs',async route=>{if(route.request().postDataJSON().glassStrength===80){seen();await held;}await route.continue();});
   try{
    await inputStrength(80);await strength.dispatchEvent('change');await requested;
    await inputStrength(90);await strength.dispatchEvent('change');
    const olderResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/account/api/account/prefs'&&response.request().postDataJSON().glassStrength===80);
    release();await (await olderResponse).finished();
    assert.equal(await strength.inputValue(),'90','an older reply does not replace the debounced selection');
    await settled();
    assert.equal((await glassPrefs()).glassStrength,90);assert.equal(await strength.inputValue(),'90');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).glassStrength),90);
   }finally{release();await page.unroute('**/api/account/prefs');}
   const beforeBurst=putRequests.length;
   await strength.evaluate(el=>{for(const value of [61,62,63,64]){el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}});
   assert.equal(putRequests.length,beforeBurst,'range changes wait before sending a server request');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).glassStrength),64);
   await settled();assert.equal(putRequests.length,beforeBurst+1,'a burst saves only its last level');
   assert.equal((await glassPrefs()).glassStrength,64);
   // An account refresh captured before a local save cannot undo the choice
   // when that older response finally reaches the visible Appearance sheet.
   let releaseRefresh,seenRefresh;const refreshHeld=new Promise(resolve=>{releaseRefresh=resolve;}),refreshRequested=new Promise(resolve=>{seenRefresh=resolve;});
   await page.route('**/api/account/me',async route=>{const response=await route.fetch(),body=await response.json();seenRefresh();await refreshHeld;await route.fulfill({response,json:{...body,name:'Refreshed Theme Tester'}});});
   try{
    await page.clock.setSystemTime(Date.now()+20000);
    await page.evaluate(()=>dispatchEvent(new Event('focus')));await refreshRequested;
    await commitStrength(73);
    const oldRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/account/api/account/me');
    releaseRefresh();await (await oldRefresh).finished();
    await page.getByRole('heading',{name:'Refreshed Theme Tester',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-appearance-glass-strength]').value==='73');
    assert.equal((await glassPrefs()).glassStrength,73);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).glassStrength),73);
   }finally{releaseRefresh();await page.unroute('**/api/account/me');}
   // An old account's delayed save cannot replace the appearance of the owner
   // that another signed-in page has since installed in the shared runtime.
   let releaseOwner,seenOwner;const ownerHeld=new Promise(resolve=>{releaseOwner=resolve;}),ownerRequested=new Promise(resolve=>{seenOwner=resolve;});
   await page.route('**/api/account/prefs',async route=>{seenOwner();await ownerHeld;await route.continue();});
   try{
    const beforeOwner=putRequests.length;
    await inputStrength(81);await strength.dispatchEvent('change');await ownerRequested;
    await inputStrength(82);await strength.dispatchEvent('change');
    await page.evaluate(()=>InFliteAppearance.accept({...InFliteAppearance.snapshot(),id:'replacement-owner',glass:false,glassStrength:17}));
    releaseOwner();await settled();
    await page.waitForTimeout(450);
    const replacement=await page.evaluate(()=>InFliteAppearance.snapshot());
    assert.equal(replacement.id,'replacement-owner');assert.equal(replacement.glass,false);assert.equal(replacement.glassStrength,17);
    assert.equal(await strength.isDisabled(),true);
    assert.equal(putRequests.length,beforeOwner+1,'owner replacement cancels the old owner’s pending slider save');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflite:appearance:v1')).id),'replacement-owner');
   }finally{releaseOwner();await page.unroute('**/api/account/prefs');}
  }
  await page.waitForFunction(()=>!document.documentElement.classList.contains("ifl-colour-change"));
  await page.screenshot({path:out+'/themes-'+engine+'-'+width+'.png',fullPage:true});
  assert.deepEqual(errors,[]);
 }catch(e){const p=context.pages()[0];if(p){await p.screenshot({path:out+"/appearance-failure-"+width+".png",fullPage:true});console.error(JSON.stringify({url:p.url(),errors,text:(await p.locator("body").innerText()).slice(0,3500)}));}throw e;}finally{await context.close();}
});
