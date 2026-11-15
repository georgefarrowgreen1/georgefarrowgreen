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
let browser, backend,server,proxy,proxyURL,certificateDir,active;const sockets=new Set();
const engine = (process.env.WEB_UI_BROWSER || process.env.IDENTITY_BROWSER) === 'webkit' ? 'webkit' : 'chromium';
const out = process.env.IDENTITY_PREVIEWS || '/tmp/inflite-os-next-20261114/identity';
before(async()=>{
 mkdirSync(out,{recursive:true});
 const {createIdentityBackend}=await import('./fixtures/identity-backend.mjs');backend=await createIdentityBackend();
 certificateDir=mkdtempSync(resolve(tmpdir(),'identity-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',resolve(certificateDir,'key.pem'),'-out',resolve(certificateDir,'cert.pem'),'-subj','/CN=inflite.ai','-addext','subjectAltName=DNS:inflite.ai','-days','1'],{stdio:'ignore'});
 server=createServer({key:readFileSync(resolve(certificateDir,'key.pem')),cert:readFileSync(resolve(certificateDir,'cert.pem'))},async(req,res)=>{
  try{const parts=[];for await(const part of req)parts.push(part);const bytes=parts.length?Buffer.concat(parts):undefined;
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
  await page.waitForFunction(()=>!document.documentElement.classList.contains("ifl-colour-change"));
  await page.screenshot({path:out+'/themes-'+engine+'-'+width+'.png',fullPage:true});
  assert.deepEqual(errors,[]);
 }catch(e){const p=context.pages()[0];if(p){await p.screenshot({path:out+"/appearance-failure-"+width+".png",fullPage:true});console.error(JSON.stringify({url:p.url(),errors,text:(await p.locator("body").innerText()).slice(0,3500)}));}throw e;}finally{await context.close();}
});
