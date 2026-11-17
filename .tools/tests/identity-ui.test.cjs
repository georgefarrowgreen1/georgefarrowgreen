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
for(const width of [390,1440])test(`real canonical auth/account UI: resources, password flow and shared session ${engine}/${width}`,async()=>{
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',ignoreHTTPSErrors:true,proxy:{server:proxyURL}});
 const errors=[],failed=[],origins=[];active={errors,failed};context.on("request",r=>origins.push(new URL(r.url()).origin));
 try{
  const {E2E}=await import('../../pigeon/crypto.js');const password='A real test password 123!',salt=Buffer.alloc(16,width%251).toString('base64url');const {proof}=await E2E.fromPassword(password,salt);
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const email=`identity${width}@example.com`;
  const seeded=await backend.request(new Request('https://inflite.ai/auth/api/account/signup',{method:'POST',headers:{Origin:'https://inflite.ai','Content-Type':'application/json'},body:JSON.stringify({name:'Identity Tester',handle:'identity'+width,email,salt,proof,vault:'v'.repeat(40),pub})}));assert.equal(seeded.status,201,await seeded.clone().text());
  await context.addInitScript(()=>{if(window.PublicKeyCredential)PublicKeyCredential.isConditionalMediationAvailable=async()=>false;});
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://inflite.ai/auth/');await page.locator('.auth-panel[data-auth-state="signin"]').waitFor();
  assert.equal(new URL(page.url()).pathname,'/auth/');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const choice=page.getByRole('button',{name:'Use your password',exact:true});if(await choice.isVisible())await choice.click();
  await page.locator('input[type="email"]').fill(email);await page.locator('input[type="password"]').fill(password);
  await page.locator('.auth-panel button[type="submit"]').click();
  await page.waitForURL('https://inflite.ai/account/**');await page.locator('.poster-card').waitFor();
  const me=await page.evaluate(()=>fetch('/account/api/account/me').then(r=>r.json()));assert.equal(me.email,email);assert.equal(me.signedIn,true);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState!=='running'));
  await page.waitForFunction(()=>{const p=document.querySelector('.poster-card');return p&&Number(getComputedStyle(p).opacity)>.95&&Number(getComputedStyle(document.querySelector('#main')).opacity)>.95;});
  await page.screenshot({path:out+'/'+engine+'-'+width+'.png',fullPage:false});
  for(const appearance of ['light','dark']){await page.evaluate(appearance=>InFliteAppearance.accept({...InFliteAppearance.snapshot(),appearance}),appearance);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForFunction(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState!=='running'));await page.locator('.app.glass').first().waitFor();const colours=await page.locator('.app.glass').evaluateAll(nodes=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');return nodes.map(n=>{c.clearRect(0,0,1,1);c.fillStyle=getComputedStyle(n).backgroundColor;c.fillRect(0,0,1,1);return[...c.getImageData(0,0,1,1).data]})});for(const colour of colours)assert.ok(Math.max(...colour.slice(0,3))-Math.min(...colour.slice(0,3))<=2,'Account card material stays neutral');await page.screenshot({path:out+'/'+engine+'-'+width+'-neutral-'+appearance+'.png',fullPage:false})}
  await page.goto('https://inflite.ai/account/#open=data');
  const archiveButton=page.getByRole('button',{name:/Download full archive \(JSON\)/});await archiveButton.waitFor();
  assert.equal(await archiveButton.evaluate(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1}),true);
  const downloaded=page.waitForEvent('download');await archiveButton.click();const file=await downloaded,exported=JSON.parse(readFileSync(await file.path(),'utf8'));
  assert.equal(exported.account.id,me.id);assert.ok(Array.isArray(exported.organise));assert.ok(exported.life);assert.ok(Array.isArray(exported.system.actions));
  await backend.env.DB.prepare('UPDATE pg_sessions SET auth_at=0 WHERE user_id=?').bind(me.id).run();
  await page.goto('https://inflite.ai/account/#open=confirm');await page.getByRole('heading',{name:'Confirm it’s you',exact:true}).waitFor();
  const redirectChecks=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/account/api/account/pwned')redirectChecks.push(r.url())});
  await page.route('https://inflite.ai/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>InFlite</title><h1>Security Module</h1>'}));
  await page.locator('input[type=password]').fill(password);await page.locator('form').filter({has:page.locator('input[type=password]')}).getByRole('button',{name:'Continue',exact:true}).click();
  await page.waitForURL('https://inflite.ai/#you=security');const confirmed=await page.evaluate(()=>fetch('/account/api/account/me').then(r=>r.json()));assert.equal(confirmed.id,me.id);assert.equal(confirmed.fresh,true);assert.deepEqual(redirectChecks,[],'redirecting reauthentication must not start a background breach request');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual([...new Set(origins)],['https://inflite.ai']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 }catch(e){const pages=context.pages();if(pages[0]){await pages[0].screenshot({path:out+'/'+engine+'-'+width+'-failure.png'});console.error(JSON.stringify({width,url:pages[0].url(),cookies:(await context.cookies()).map(c=>c.name),errors,failed,text:(await pages[0].locator('body').innerText()).slice(0,1800)}));}throw e;}finally{await context.close();}
});
