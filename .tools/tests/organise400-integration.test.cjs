const {launchApp}=require('./fixtures/launcher.cjs');
// Actual UI, encrypted IndexedDB, Root proxy and private D1/R2 account routes.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http'),{readFileSync,existsSync}=require('node:fs'),{resolve,extname}=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium,webkit}=require('playwright'),ROOT=resolve(__dirname,'../../..','inflite'),PUBLIC=resolve(ROOT,'today/public');
let server,browser,backend,origin,a,b,c,organiseAPI,systemAPI,filesAPI,createFilesBackend;const requests=[];let readGate=null;
const fixture=`import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {mountApp} from '/organise/app.js';
window.IFL={glyph:()=>'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>'};const ac=new AbortController();const T=window.T={errors:[],toasts:[],ac,headers:[],instances:{},roots:{},route:null};addEventListener('unhandledrejection',e=>T.errors.push(String(e.reason)));const owner=document.body.dataset.owner;
const go=async path=>{T.path=path;history.pushState({},'',path);const u=new URL(path,location.origin),kind=u.pathname.split('/')[1],h=u.hash.slice(1).split('=');if(!['notes','calendar','people'].includes(kind))return;for(const [k,r]of Object.entries(T.roots)){r.hidden=k!==kind;if(k!==kind)T.instances[k].hide()}if(!T.instances[kind]){const root=ui.el('section');document.querySelector('main').append(root);T.roots[kind]=root;const F={ui,signal:ac.signal,session:{user:{id:owner}},nav:{go,back:()=>go('/'+kind+'/')},header:{set:s=>T.headers.push(s)},toast:s=>T.toasts.push(s),workspace:{active:()=>T.path?.startsWith('/'+kind+'/'),today:()=>null,changed(){},provide(p){T.providers||={};T.providers[kind]=p;return()=>{}},files:null},visible:()=>true};F.sheet=createSheets(F);T.instances[kind]=await mountApp(root,F,kind)}T.roots[kind].hidden=false;const section=kind==='calendar'?(h[0]==='agenda'?'agenda':'week'):kind==='notes'?'all':'contacts';T.instances[kind].show({app:kind,section,key:h[0]||section,arg:h[1]||null});};T.go=go;await go('/notes/');T.ready=true;`;
before(async()=>{
 ({createFilesBackend}=await import('./fixtures/os-next-backend.mjs'));backend=await createFilesBackend();a=await backend.session('organise_browser_a');b=await backend.session('organise_browser_b');c=await backend.session('organise_browser_review');
 ({organiseAPI}=await import(pathToFileURL(resolve(ROOT,'today/src/organise.js'))));
 ({systemAPI}=await import(pathToFileURL(resolve(ROOT,'today/src/system.js'))));({filesAPI}=await import(pathToFileURL(resolve(ROOT,'today/src/files.js'))));
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,origin||'http://localhost');if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks);requests.push({path:url.pathname,method:req.method,body:bytes.toString()});const request=new Request(url,{method:req.method,headers:{...req.headers,cookie:req.headers.cookie?.includes("fixture_account=c")?c.cookie:req.headers.cookie?.includes("fixture_account=b")?b.cookie:a.cookie},...(bytes.length?{body:bytes}:{})});const r=await(url.pathname.startsWith('/api/organise/')?organiseAPI:url.pathname.startsWith('/api/system/')?systemAPI:filesAPI)(request,{ACCOUNT_ORIGIN:'https://account.inflite.ai',TODAY_AS:'https://inflite.ai',APPS:backend.serviceBinding()});const payload=Buffer.from(await r.arrayBuffer());if(url.pathname==='/api/system/actions'&&req.method==='GET'&&readGate){const gate=readGate;readGate=null;gate.enter();await gate.promise}res.writeHead(r.status,Object.fromEntries(r.headers));res.end(payload);return}
 if(url.pathname==='/'||/^\/(notes|people|calendar)\/$/.test(url.pathname)){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',/Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC,'_headers'),'utf8'))[1]);res.end('<!doctype html><html><head><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/organise/organise.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/roof/controls.css"></head><body data-owner="'+(req.headers.cookie?.includes('fixture_account=c')?c.owner:req.headers.cookie?.includes('fixture_account=b')?b.owner:a.owner)+'"><main></main><script type="module" src="/fixture.js"></script></body></html>');return}
 const file=resolve(PUBLIC,'.'+url.pathname);if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return}if(!file.startsWith(PUBLIC+'/')||!existsSync(file)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.js':'text/javascript'}[extname(file)]||'application/octet-stream'));res.end(readFileSync(file));}catch(e){res.writeHead(500);res.end(e.message)}});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
});after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));await backend?.dispose()});
async function open(account=a,context=null){const ctx=context||await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',acceptDownloads:true});await ctx.addCookies([{name:'fixture_account',value:account===c?'c':account===b?'b':'a',url:origin}]);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+(account===b?'/?b=1':'/'));await page.waitForFunction(()=>T.ready);return{ctx,page,errors}}
const active=p=>p.locator('main > section:not([hidden])');
async function saved(page){try{await page.waitForFunction(()=>[...document.querySelectorAll('main>section:not([hidden]) .org-save-state')].some(n=>n.textContent==='Saved to your account'),null,{timeout:10000})}catch(e){const state=await page.evaluate(()=>({states:[...document.querySelectorAll('.org-save-state,.org-status')].map(n=>n.textContent),toasts:window.T?.toasts,errors:window.T?.errors}));await page.screenshot({path:'/tmp/inflite402-save-failure-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'});throw Error(e.message+' '+JSON.stringify(state))}}
async function rootContext(account=c){
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await ctx.addCookies([{name:'fixture_account',value:account===c?'c':account===b?'b':'a',url:origin}]);
 const view=JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/session.json'))),cards={at:Date.now(),tz:'UTC',cards:{}};
 view.user={...view.user,id:account.owner,name:'Review User',photoAt:0};view.apps={calendar:true,notes:true,people:true,weather:false,markets:false,fitness:false,chats:false,mail:false};
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(r.request().isNavigationRequest())return r.fulfill({contentType:'text/html',body:readFileSync(resolve(PUBLIC,'index.html')),headers:{'Content-Security-Policy':/Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC,'_headers'),'utf8'))[1]}});const api={'/api/session':view,'/api/boot':{view,cards},'/api/hub':{ready:true,roof:true,apps:view.apps},'/api/today':cards,'/api/status-banner':{banner:null},'/api/rules':JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/rules.json'))),'/api/notify':JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/notify.json'))),'/api/devices':{devices:[],here:[]},'/version':{build:/const BUILD = "([^"]+)"/.exec(readFileSync(resolve(PUBLIC,'app.js'),'utf8'))[1]}};if(Object.hasOwn(api,u.pathname))return r.fulfill({json:api[u.pathname]});if(u.pathname==='/api/vitals')return r.fulfill({status:204,body:''});if(/^\/(calendar|notes|people)\/version$/.test(u.pathname))return r.fulfill({json:{build:'4.10'}});return r.fallback()});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/?os=1');await page.locator('.ws-dock').waitFor();return{ctx,page,errors};
}
async function settled(page){await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.allSettled(document.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})}
async function reviewState(page,root,name,{keyboard=false}={}){
 for(const appearance of ['light','dark'])for(const width of [320,390,1440]){
  await page.evaluate(appearance=>InFliteAppearance.accept({palette:'coast',appearance}),appearance);await page.setViewportSize({width,height:900});
  await settled(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+'/'+appearance+'/'+width);
  const box=await root.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1,name+' stays inside the screen');
  await page.screenshot({path:'/tmp/inflite402-'+name+'-'+appearance+'-'+width+'-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'});
 }
 if(keyboard){
  await page.setViewportSize({width:320,height:540});const field=root.getByRole('textbox').filter({visible:true}).first();await field.focus();await settled(page);
  assert.equal(await field.evaluate(n=>n===document.activeElement),true,name+' keyboard focus');
  const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('input,textarea,dialog,.org')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right})).slice(0,8)}));
  if(viewport.scroll>viewport.width+1)await page.screenshot({path:'/tmp/inflite402-'+name+'-keyboard-failure-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'});
  assert.ok(viewport.scroll<=viewport.width+1,name+' keyboard overflow: '+JSON.stringify(viewport));
  const b=await field.boundingBox();assert.ok(b&&b.x>=-1&&b.x+b.width<=321,name+' field stays inside keyboard viewport');
 }
 await page.setViewportSize({width:390,height:900});
}
test('actual Root empty libraries, native creation and profiles fit both themes and all three widths',async()=>{
 const {ctx,page,errors}=await rootContext();try{
  for(const app of ['notes','people','calendar']){
   await launchApp(page,app[0].toUpperCase()+app.slice(1));const root=page.locator('#m-'+app);
   await root.locator(app==='calendar'?'.org-empty':'.org-welcome').waitFor();
   const create=app==='notes'?'New note':app==='people'?'Add person':'New event';assert.equal(await root.getByRole('button',{name:create,exact:true}).count(),1);
   if(app!=='calendar'){assert.equal(await root.getByRole('searchbox').isVisible(),false);assert.equal(await root.locator('.org-library-head').isVisible(),false)}
   else{assert.equal(await root.getByRole('radio',{name:'Week',exact:true}).getAttribute('aria-checked'),'true');assert.equal(await root.locator('.org-week-strip .org-date').count(),7)}
   await reviewState(page,root,app+'-empty');
  }
  for(const app of ['notes','people','calendar']){
   await launchApp(page,app[0].toUpperCase()+app.slice(1));const root=page.locator('#m-'+app);
   await root.getByRole('button',{name:app==='notes'?'New note':app==='people'?'Add person':'New event',exact:true}).press('Enter');
   const titleLabel=app==='people'?'Name':'Title';
   const title=root.getByRole('textbox',{name:titleLabel,exact:true});await title.waitFor();
   await page.waitForFunction(({app,titleLabel})=>document.activeElement?.closest('#m-'+app)&&document.activeElement.getAttribute('aria-label')===titleLabel,{app,titleLabel});
   await reviewState(page,root,app+'-create',{keyboard:true});
   await title.fill(app==='notes'?'A quiet thought':app==='people'?'Maya Review':'A riverside coffee');
   if(app==='notes'){await root.getByRole('textbox',{name:'Note',exact:true}).fill('A saved thought with room to breathe.');await root.locator('.org-save-state').getByText('Saved to your account',{exact:true}).waitFor();}
   else{
    if(app==='people')await root.getByRole('textbox',{name:'Email',exact:true}).fill('maya-review@example.test');
    else{const order=await root.locator('.org-form').evaluate(f=>[...f.querySelectorAll('input,textarea')].map(n=>n.getAttribute('aria-label')));assert.ok(order.indexOf('Description')>order.indexOf('Ends'),'event timing comes before description');await root.getByRole('textbox',{name:'Description',exact:true}).fill('Meet beside the river.');}
    await root.getByRole('button',{name:'Save',exact:true}).click();await root.getByRole('heading',{name:app==='people'?'Maya Review':'A riverside coffee',exact:true}).waitFor();await reviewState(page,root,app+'-profile');
   }
  }
  await launchApp(page,'Notes');await page.goto(origin+'/notes/?os=1');await page.locator('#m-notes .org-record').filter({hasText:'A quiet thought'}).click();
  await page.locator('#m-notes').getByRole('textbox',{name:'Note',exact:true}).waitFor();assert.equal(await page.locator('#m-notes').evaluate(r=>r.querySelector('.org-form')?.contains(document.activeElement)),false,'opening a saved note does not summon the keyboard');
  assert.deepEqual(errors,[]);
 }finally{await ctx.close()}
});
test('Notes autosave, checklist, reload, owner isolation and mobile geometry',async()=>{const {ctx,page,errors}=await open();try{await active(page).locator('.org-welcome').waitFor();await active(page).getByRole('button',{name:'New note',exact:true}).click();await active(page).getByRole('textbox',{name:'Title',exact:true}).fill('A note <script>');await active(page).getByRole('textbox',{name:'Note',exact:true}).fill('Private trip notes\nBring the lights');await active(page).getByRole('button',{name:'Add checklist item'}).click();await active(page).getByRole('textbox',{name:'Checklist item'}).fill('Charge the lights');await active(page).getByRole('checkbox',{name:'Complete checklist item'}).check();await saved(page);const path=await page.evaluate(()=>T.path);await page.evaluate(()=>T.go('/people/'));await page.evaluate(path=>T.go(path),path);assert.equal(await active(page).getByRole('textbox',{name:'Note',exact:true}).inputValue(),'Private trip notes\nBring the lights');await page.reload();await page.waitForFunction(()=>T.ready);await page.evaluate(path=>T.go(path),path);await active(page).getByRole('textbox',{name:'Note',exact:true}).waitFor();assert.equal(await active(page).getByRole('textbox',{name:'Checklist item'}).inputValue(),'Charge the lights');assert.equal(await active(page).getByRole('checkbox').isChecked(),true);for(const width of [320,390,1024]){await page.setViewportSize({width,height:844});await settled(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'overflow at '+width);await page.screenshot({path:'/tmp/inflite402-notes-'+width+'-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'})}assert.equal(await page.locator('script').count(),1);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>T.errors),[]);const other=await open(b);try{await other.page.evaluate(path=>T.go(path),path);await other.page.getByText('This item could not open',{exact:true}).waitFor();assert.equal(await other.page.getByText('Private trip notes').count(),0)}finally{await other.ctx.close()}}finally{await ctx.close()}});
test('Root contact import previews locally, requires confirmation, ignores embedded URLs and validates file size',async()=>{
 const {ctx,page,errors}=await rootContext();try{
  await launchApp(page,'People');await page.getByRole('button',{name:'Contacts actions',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Import contacts',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Import contacts',exact:true}),input=dialog.getByLabel('Contacts file',{exact:true}),confirm=dialog.getByRole('button',{name:'Import contacts',exact:true});
  await dialog.waitFor();assert.equal(await confirm.isEnabled(),false);const writes=()=>requests.filter(r=>r.method==='PUT'&&r.path==='/api/organise/record').length;
  await input.setInputFiles({name:'too-large.vcf',mimeType:'text/vcard',buffer:Buffer.alloc(512*1024+1,65)});await dialog.getByText('Choose a contacts file smaller than 512 KB.',{exact:true}).waitFor();assert.equal(await confirm.isEnabled(),false);
  const remote=[];page.on('request',r=>{if(r.url().includes('import-attacker.example'))remote.push(r.url())});
  const vcf='BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Import <script>\r\nEMAIL:imported@example.test\r\nPHOTO:https://import-attacker.example/portrait.png\r\nURL:javascript:window.importExecuted=true\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Zoë Import\r\nORG:Studio;Research\r\nTEL:tel:+44 7700 900456\r\nEND:VCARD';
  const before=writes();await input.setInputFiles({name:'contacts.vcf',mimeType:'text/vcard',buffer:Buffer.from(vcf)});await dialog.getByText('2 contacts ready to import. Existing contacts stay as they are.',{exact:true}).waitFor();
  assert.equal(writes(),before,'preview makes no account write');assert.equal(await dialog.locator('.org-import-contact').count(),2);assert.equal(await dialog.locator('script,img').count(),0);assert.equal(await page.evaluate(()=>window.importExecuted),undefined);
  await reviewState(page,dialog,'people-import');await confirm.click();await dialog.getByText('2 contacts added. Pending changes sync when connected.',{exact:true}).waitFor();assert.equal(await confirm.isEnabled(),false);await dialog.getByRole('button',{name:'Close',exact:true}).click();
  const root=page.locator('#m-people');await root.locator('.org-record').filter({hasText:'Zoë Import'}).waitFor();await root.locator('.org-record').filter({hasText:'Import <script>'}).click();await root.getByRole('heading',{name:'Import <script>',exact:true}).waitFor();assert.equal(await root.locator('.org-profile').getByText('imported@example.test',{exact:true}).isVisible(),true);assert.deepEqual(remote,[]);
  const other=await open(b);try{await other.page.evaluate(()=>T.go('/people/'));await other.page.waitForFunction(()=>!document.querySelector('main>section:not([hidden]) .org-status')?.textContent.includes('Opening'));assert.equal(await active(other.page).getByText('Import <script>',{exact:true}).count(),0)}finally{await other.ctx.close()}
  assert.deepEqual(errors,[]);
 }finally{await ctx.close()}
});
test('closing a contact preview or replacing its owner fences delayed file reads before any import',async()=>{
 for(const ending of ['close','owner']){
  const {ctx,page}=await open(c);try{
   await page.evaluate(async()=>{await T.go('/people/');T.headers.at(-1).acts.find(a=>a.label==='Contacts actions').run()});await page.getByRole('dialog').getByRole('button',{name:'Import contacts',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Import contacts',exact:true});
   await page.evaluate(()=>{File.prototype.text=function(){return new Promise(r=>window.releaseContactFile=()=>r('BEGIN:VCARD\nVERSION:4.0\nFN:Late owner contact\nEND:VCARD'))}});
   await dialog.getByLabel('Contacts file',{exact:true}).setInputFiles({name:'late.vcf',mimeType:'text/vcard',buffer:Buffer.from('delayed')});await page.waitForFunction(()=>!!window.releaseContactFile);const before=requests.filter(r=>r.method==='PUT'&&r.path==='/api/organise/record').length;
   if(ending==='owner')await page.evaluate(()=>T.ac.abort());else await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});await page.evaluate(()=>{releaseContactFile();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
   assert.equal(requests.filter(r=>r.method==='PUT'&&r.path==='/api/organise/record').length,before);assert.equal(await page.getByText('Late owner contact',{exact:true}).count(),0);
  }finally{await ctx.close()}
 }
});
test('People and Calendar create real records, link them, maintain state and use own routes',async()=>{const {ctx,page,errors}=await open();try{await page.evaluate(()=>T.go('/people/'));await active(page).locator('.org-welcome,.org-record').first().waitFor();await active(page).getByRole('button',{name:'Add person',exact:true}).click();await active(page).getByRole('textbox',{name:'Name',exact:true}).fill('Example Person');await active(page).getByRole('textbox',{name:'Email',exact:true}).fill('example@example.test');await active(page).getByRole('textbox',{name:'Organisation',exact:true}).fill('Cycling club');await active(page).getByRole('button',{name:'Save',exact:true}).click();await saved(page);const personPath=await page.evaluate(()=>T.path);await page.evaluate(()=>T.go('/calendar/'));await active(page).getByRole('button',{name:'New event',exact:true}).click();await active(page).getByRole('textbox',{name:'Title',exact:true}).fill('Club ride');await active(page).getByLabel('Starts',{exact:true}).fill('2026-11-16T11:00');await active(page).getByLabel('Ends',{exact:true}).fill('2026-11-16T13:00');await active(page).getByRole('button',{name:'Link an item'}).click();await page.getByRole('combobox',{name:'Link from app'}).selectOption('people');await page.getByRole('dialog').getByRole('button',{name:'Example Person',exact:true}).click();await active(page).getByRole('button',{name:'Save',exact:true}).click();await saved(page);const calendarPath=await page.evaluate(()=>T.path);await active(page).getByRole('button',{name:'Prepare invitation'}).click();await page.getByText('Review this invitation. Nothing is sent automatically.').waitFor();assert.match(await page.getByRole('textbox',{name:'Invitation text'}).inputValue(),/Club ride/);await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await page.evaluate(path=>T.go(path),personPath);await active(page).getByRole('heading',{name:'Example Person',exact:true}).waitFor();assert.equal(await active(page).getByText('example@example.test',{exact:true}).isVisible(),true);await active(page).getByRole('button',{name:'Edit contact',exact:true}).click();assert.equal(await active(page).getByRole('textbox',{name:'Email'}).inputValue(),'example@example.test');await page.evaluate(path=>T.go(path),calendarPath);await active(page).getByRole('button',{name:'Edit event',exact:true}).click();await active(page).getByLabel('Starts',{exact:true}).waitFor();assert.equal(await active(page).getByLabel('Starts',{exact:true}).inputValue(),'2026-11-16T11:00');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>T.errors),[])}finally{await ctx.close()}});
test('offline autosave survives reopening and encrypted journal does not expose text',async()=>{const {ctx,page}=await open(b);try{await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false})});await active(page).getByRole('button',{name:'New note',exact:true}).click();await active(page).getByRole('textbox',{name:'Title',exact:true}).fill('Offline note');await active(page).getByRole('textbox',{name:'Note',exact:true}).fill('Sensitive offline words');await page.getByText('Kept on this device',{exact:true}).waitFor();const path=await page.evaluate(()=>T.path);const encrypted=await page.evaluate(async()=>{const name='ifl:offline:v1:'+document.body.dataset.owner;const db=await new Promise((y,n)=>{const r=indexedDB.open(name);r.onsuccess=()=>y(r.result);r.onerror=()=>n(r.error)});const rows=await new Promise((y,n)=>{const r=db.transaction('work').objectStore('work').getAll();r.onsuccess=()=>y(r.result);r.onerror=()=>n(r.error)});db.close();return JSON.stringify(rows)});assert.doesNotMatch(encrypted,/Sensitive offline words|Offline note/);await page.reload();await page.waitForFunction(()=>T.ready);await page.evaluate(path=>T.go(path),path);await saved(page);assert.equal(await active(page).getByRole('textbox',{name:'Note',exact:true}).inputValue(),'Sensitive offline words')}finally{await ctx.close()}});
test('cross-tab CAS conflict retains local work and explicit new-copy resolution',async()=>{const {ctx,page}=await open();try{await active(page).getByRole('button',{name:'New note',exact:true}).click();await active(page).getByRole('textbox',{name:'Title',exact:true}).fill('Conflict base');await active(page).getByRole('textbox',{name:'Note',exact:true}).fill('Original');await saved(page);const path=await page.evaluate(()=>T.path),id=path.split('=').at(-1);await page.evaluate(async id=>{const headers={'Content-Type':'application/json','X-Inflite':'1','X-Inflite-Owner':document.body.dataset.owner};const r=await fetch('/api/organise/record?kind=notes&id='+id,{headers});const {record:v}=await r.json();const {createSystemClient}=await import('/roof/system-client.js');const F={signal:T.ac.signal,session:{user:{id:document.body.dataset.owner}}},c=createSystemClient(F,{prefix:'/api/organise/'});await c.request('record',{method:'PUT',body:{kind:'notes',id,version:v.version,operationId:crypto.randomUUID().replaceAll('-',''),deleted:false,value:{title:'Changed in another tab',text:'Remote text',checklist:[],links:[]}}})},id);await active(page).getByRole('textbox',{name:'Note',exact:true}).fill('Local work must stay');await page.getByText('Needs review',{exact:true}).waitFor();await active(page).getByRole('button',{name:'Review account version'}).click();await page.getByRole('dialog').getByText(/Changed in another tab/).waitFor();await page.getByRole('button',{name:'Save my work as a new copy'}).click();await page.waitForFunction(old=>T.path!==old,path);await saved(page);assert.equal(await active(page).getByRole('textbox',{name:'Note',exact:true}).inputValue(),'Local work must stay')}finally{await ctx.close()}});
test('the actual Root boot opens all three native apps in one shell and retains drafts and dock identity',async()=>{const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',colorScheme:'dark',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{await ctx.addCookies([{name:'fixture_account',value:'a',url:origin}]);await ctx.addInitScript(()=>{Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}});window.__csp=[];document.addEventListener('securitypolicyviolation',e=>__csp.push({directive:e.violatedDirective,blocked:e.blockedURI,source:e.sourceFile,line:e.lineNumber,sample:e.sample}));});const view=JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/session.json'))),cards=JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/day.json')));view.user={...view.user,id:a.owner,name:'Example User',photoAt:0};view.apps={calendar:true,notes:true,people:true,weather:false,markets:false,fitness:false,chats:false,mail:false};cards.at=Date.now();
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(r.request().isNavigationRequest())return r.fulfill({contentType:'text/html',body:readFileSync(resolve(PUBLIC,'index.html')),headers:{'Content-Security-Policy':/Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC,'_headers'),'utf8'))[1]}});const api={'/api/session':view,'/api/boot':{view,cards},'/api/hub':{ready:true,roof:true,apps:view.apps},'/api/today':cards,'/api/status-banner':{banner:null},'/api/rules':JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/rules.json'))),'/api/notify':JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/notify.json'))),'/api/devices':{devices:[],here:[]},'/version':{build:/const BUILD = "([^"]+)"/.exec(readFileSync(resolve(PUBLIC,'app.js'),'utf8'))[1]}};if(Object.hasOwn(api,u.pathname))return r.fulfill({json:api[u.pathname]});if(u.pathname==='/api/vitals')return r.fulfill({status:204,body:''});if(/^\/(calendar|notes|people)\/version$/.test(u.pathname))return r.fulfill({json:{build:'4.10'}});return r.fallback()});
 await page.goto(origin+'/?os=1');await page.locator('.ws-dock').waitFor();await page.evaluate(()=>window.__dock=document.querySelector('.ws-dock'));await launchApp(page,'Notes');await page.waitForFunction(()=>{const root=document.querySelector('#m-notes');return root?.querySelector('.org-welcome,.org-record')&&[...root.querySelectorAll('button')].filter(b=>b.textContent==='New note'&&b.getClientRects().length).length===1});await page.locator('#m-notes').getByRole('button',{name:'New note',exact:true}).click();await page.locator('#m-notes').getByRole('textbox',{name:'Title',exact:true}).fill('Native shell note');await page.locator('#m-notes').getByRole('textbox',{name:'Note',exact:true}).fill('Retained through native app switches');await page.locator('#m-notes .org-save-state').getByText('Saved to your account',{exact:true}).waitFor();await launchApp(page,'People');await page.locator('#m-people').getByRole('button',{name:'Add person',exact:true}).waitFor();await launchApp(page,'Calendar');await page.locator('#m-calendar').getByRole('button',{name:'New event',exact:true}).waitFor();await launchApp(page,'Notes');await page.locator('#m-notes').getByRole('textbox',{name:'Note',exact:true}).waitFor();assert.equal(await page.locator('#m-notes').getByRole('textbox',{name:'Note',exact:true}).inputValue(),'Retained through native app switches');assert.equal(await page.evaluate(()=>__dock===document.querySelector('.ws-dock')),true);await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search everything'}).fill('Native shell note');await page.getByRole('option').filter({hasText:/^Native shell note/}).first().click();await page.getByRole('dialog').getByRole('button',{name:'Open in Notes',exact:true}).click();await page.locator('#m-notes').getByRole('textbox',{name:'Note',exact:true}).waitFor();await page.setViewportSize({width:1440,height:900});await launchApp(page,'All apps');for(const name of ['Calendar','Notes','People'])assert.equal(await page.getByRole('dialog').getByRole('button',{name,exact:true}).isEnabled(),true);await page.getByRole('dialog').getByRole('button',{name:'Files',exact:true}).click();await page.locator('.ifx-location-list').getByRole('button',{name:'From apps',exact:true}).click();await page.getByRole('button',{name:'Select Notes',exact:true}).dblclick();await page.getByRole('button',{name:'Select Native shell note.txt',exact:true}).dblclick();await page.locator('#m-notes').getByRole('textbox',{name:'Note',exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>__csp),[]);await reviewLibraries(page,origin,a.owner);/* CSP is asserted by the review before browser screenshot helpers install styles. */ /* WebKit screenshot helpers inject an inline style under strict CSP; assert app navigation before taking images. */for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(async()=>{await Promise.allSettled(document.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Overflow after resize to '+width);await page.screenshot({path:'/tmp/inflite402-shell-'+width+'-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'})}assert.deepEqual(errors,[]);
 }finally{await ctx.close()}});
test('unsaved People forms survive an app switch and reload without silently becoming cloud contacts',async()=>{const {ctx,page}=await open(b);try{await page.evaluate(()=>T.go('/people/'));await active(page).locator('.org-welcome').waitFor();await active(page).getByRole('button',{name:'Add person',exact:true}).click();await active(page).getByRole('textbox',{name:'Name',exact:true}).fill('Unfinished contact');await active(page).getByRole('textbox',{name:'Email',exact:true}).fill('incomplete@');await page.getByText('Draft kept on this device',{exact:true}).waitFor();const path=await page.evaluate(()=>T.path);await page.evaluate(()=>T.go('/notes/'));await page.reload();await page.waitForFunction(()=>T.ready);await page.evaluate(path=>T.go(path),path);await active(page).getByRole('textbox',{name:'Email',exact:true}).waitFor();assert.equal(await active(page).getByRole('textbox',{name:'Email',exact:true}).inputValue(),'incomplete@');const names=await page.evaluate(async()=>{const {createSystemClient}=await import('/roof/system-client.js'),c=createSystemClient({signal:T.ac.signal,session:{user:{id:document.body.dataset.owner}}},{prefix:'/api/organise/'});return(await c.request('list',{method:'POST',body:{kind:'people'}})).records.map(x=>x.title)});assert.ok(!names.includes('Unfinished contact'));await active(page).getByRole('textbox',{name:'Email',exact:true}).fill('finished@example.test');await active(page).getByRole('button',{name:'Save',exact:true}).click();await saved(page)}finally{await ctx.close()}});

// Populated libraries, month/week selection, read-only profiles and real shell geometry.
async function reviewLibraries(page,origin,owner){
 await page.evaluate(async owner=>{
  const {localDay,addDays}=await import('/organise/model.js'),day=localDay();
  const rows=[['notes',{title:'Weekend ride',text:'A quiet loop through the lanes. Stop for coffee and take the scenic way home.',checklist:[{id:crypto.randomUUID().replaceAll('-',''),text:'Charge the lights',done:true},{id:crypto.randomUUID().replaceAll('-',''),text:'Pack a spare layer',done:false}],links:[]}],['notes',{title:'Ideas worth keeping',text:'A few things to come back to.\n\nMake more room for the things that matter.',checklist:[],links:[]}],['people',{title:'Maya Chen',organisation:'North Norfolk Cycling',email:'maya@example.test',phone:'+44 7700 900123',details:'Sunday rides and good coffee.',links:[]}],['people',{title:'Reuben',organisation:'',email:'reuben@example.test',phone:'',details:'',links:[]}],['calendar',{title:'Coffee with Maya',description:'Meet at the cafe by the river.',allDay:false,start:new Date(day+'T10:30:00').getTime(),end:new Date(day+'T11:30:00').getTime(),timezone:'UTC',links:[]}],['calendar',{title:'A day outside',description:'',allDay:true,startDate:addDays(day,2),endDate:addDays(day,3),timezone:'UTC',links:[]}]];
  for(const[kind,value]of rows){const r=await fetch('/api/organise/record',{method:'PUT',headers:{'Content-Type':'application/json','X-Inflite':'1','X-Inflite-Owner':owner},body:JSON.stringify({kind,id:crypto.randomUUID().replaceAll('-',''),operationId:crypto.randomUUID().replaceAll('-',''),version:0,deleted:false,value})});if(!r.ok)throw Error('Review seed failed '+r.status)}
 },owner);
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const app of ['notes','people','calendar']){
  if(app==='notes'){await page.goto(origin+'/'+app+'/?os=1');await page.locator('.ws-dock').waitFor()}else await launchApp(page,app[0].toUpperCase()+app.slice(1));const root=page.locator('#m-'+app);await root.locator('.org-record').first().waitFor();
  assert.equal(await root.locator('.org-intro').count(),0);assert.equal(await root.getByRole('button',{name:'Refresh',exact:true}).count(),0);
  assert.equal(await root.getByRole('button',{name:app==='notes'?'New note':app==='people'?'Add person':'New event',exact:true}).count(),1);
  if(app==='calendar'){
   assert.equal(await root.locator('.org-week-strip .org-date').count(),7);
   await root.getByRole('radio',{name:'Month',exact:true}).click();await root.locator('.org-month-grid').waitFor();assert.equal(await root.locator('.org-month-grid .org-date').count(),42);
   await root.getByRole('radio',{name:'Week',exact:true}).click();await root.locator('.org-week-strip .org-date').first().waitFor();assert.equal(await root.locator('.org-week-strip .org-date').count(),7);
   await root.getByRole('radio',{name:'Month',exact:true}).click();await root.locator('.org-month-grid').waitFor();
   const title=await root.locator('.org-month-head h2').textContent();await root.getByRole('button',{name:'Next',exact:true}).click();await page.waitForFunction(t=>document.querySelector('#m-calendar .org-month-head h2').textContent!==t,title);await root.getByRole('button',{name:'Today',exact:true}).click();
   await root.locator('.org-record').filter({hasText:'Coffee with Maya'}).waitFor();
  }
  for(const appearance of ['dark','light'])for(const width of [320,390,1440]){
   await page.evaluate(appearance=>InFliteAppearance.accept({palette:'coast',appearance}),appearance);await page.setViewportSize({width,height:900});await page.evaluate(async()=>{await Promise.allSettled(document.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,app+'/'+appearance+'/'+width);
   assert.equal(await root.evaluate(r=>[...r.querySelectorAll('*')].some(n=>n.childNodes.length===1&&n.firstChild.nodeType===3&&n.textContent==='null')),false);
   // Assert CSP before screenshot helper styles are installed by WebKit.

   await page.screenshot({path:'/tmp/inflite402-'+app+'-'+appearance+'-'+width+'-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'});
   await page.evaluate(()=>{window.__csp=[]});
  }
  await page.setViewportSize({width:390,height:900});
  if(app==='notes'){
   await root.getByRole('radio',{name:'Checklists',exact:true}).click();assert.equal(await root.locator('.org-record').filter({hasText:'Ideas worth keeping'}).count(),0);assert.equal(await root.locator('.org-record').filter({hasText:'Weekend ride'}).count(),1);await reviewState(page,root,'notes-checklists');
   await root.getByRole('radio',{name:'All notes',exact:true}).click();await root.getByRole('button',{name:'Switch notes layout',exact:true}).click();assert.equal(await root.locator('[data-notes-view]').getAttribute('data-notes-view'),'grid');await reviewState(page,root,'notes-grid');
   await root.getByRole('button',{name:'Switch notes layout',exact:true}).click();assert.equal(await root.locator('[data-notes-view]').getAttribute('data-notes-view'),'list');
  }
  const search=root.getByRole('searchbox',{name:'Search '+app[0].toUpperCase()+app.slice(1)});await search.fill('No such result abcxyz');await root.getByRole('heading',{name:'No results',exact:true}).waitFor();assert.equal(await root.locator('.org-record').count(),0);await search.fill('');await root.locator('.org-record').first().waitFor();
  if(app==='people'){
   await root.locator('.org-record').filter({hasText:'Maya Chen'}).click();await root.getByRole('heading',{name:'Maya Chen',exact:true}).waitFor();assert.equal(await root.getByRole('textbox',{name:'Email',exact:true}).isVisible(),false);await settled(page);await page.screenshot({path:'/tmp/inflite402-people-profile-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'});await root.getByRole('button',{name:'Edit contact',exact:true}).click();assert.equal(await root.getByRole('textbox',{name:'Email',exact:true}).inputValue(),'maya@example.test');
  }
  if(app==='calendar'){
   await root.getByRole('radio',{name:'Week',exact:true}).click();await root.locator('.org-record').filter({hasText:'Coffee with Maya'}).click();await root.getByRole('heading',{name:'Coffee with Maya',exact:true}).waitFor();assert.equal(await root.locator('[role=radio][data-value=week]').getAttribute('aria-checked'),'true');await settled(page);await page.screenshot({path:'/tmp/inflite402-calendar-detail-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',fullPage:true,caret:'initial'});await root.getByRole('button',{name:'Edit event',exact:true}).click();await root.getByLabel('Starts',{exact:true}).waitFor();
  }
 }
}

test('Quick Capture in the real Root shares one account store with Notes and creates a linked calendar draft',async()=>{const{ctx,page,errors}=await rootContext();try{await page.getByRole('button',{name:'Quick Capture',exact:true}).click();await page.getByRole('textbox',{name:'Capture text'}).fill('Captured across the shell\nBring a notebook');await page.getByRole('button',{name:'Save note',exact:true}).click();await page.getByRole('dialog',{name:'Quick Capture',exact:true}).waitFor({state:'detached'});const toast=page.locator('.ifl-toast.has-act').last();await toast.waitFor();assert.equal(await toast.evaluate(n=>{const r=n.getBoundingClientRect(),text=n.querySelector('.ifm-note-tx').getBoundingClientRect();return r.left>=15&&r.right<=innerWidth-15&&text.width>100&&r.height<130}),true);await launchApp(page,'Notes');const note=page.getByRole('button').filter({has:page.locator('strong',{hasText:'Captured across the shell'})}).first();await note.waitFor();await note.click();await page.getByRole('textbox',{name:'Note',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Note',exact:true}).inputValue(),'Bring a notebook');await page.getByText('Saved to your account',{exact:true}).waitFor();await page.locator('summary').filter({hasText:'Linked items & actions'}).click();await page.getByRole('button',{name:'Use in another app',exact:true}).click();await page.getByRole('button').filter({hasText:'Plan an event'}).click();await page.getByRole('textbox',{name:'Title',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Title',exact:true}).inputValue(),'Captured across the shell');assert.equal(await page.getByRole('textbox',{name:'Description',exact:true}).inputValue(),'Bring a notebook');assert.equal(await page.locator('.ws-dock').count(),1);await page.screenshot({path:'/tmp/inflite-life410/root-linked-event.png',fullPage:true});assert.deepEqual(errors,[])}finally{await ctx.close()}});
test('launcher shortcuts create real notes and Keep draft closes a contact without publishing it',{skip:!existsSync(resolve(PUBLIC,'notes/roof/releases/4.30/notes.js'))},async()=>{
 const {ctx,page,errors}=await rootContext();try{
  await page.getByRole('button',{name:'All apps',exact:true}).click();let menu=page.locator('dialog[data-sheet=workspace-apps]');
  await menu.getByRole('button',{name:'Notes',exact:true}).click({button:'right'});await menu.getByRole('button',{name:'New note',exact:true}).click();
  const notes=page.locator('#m-notes');await notes.getByRole('textbox',{name:'Title',exact:true}).fill('Shortcut note');await notes.getByRole('textbox',{name:'Note',exact:true}).fill('Created through the real launcher action.');await notes.getByText('Saved to your account',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Back to Notes',exact:true}).click();await notes.locator('.org-record').filter({hasText:'Shortcut note'}).waitFor();
  await launchApp(page,'People');const people=page.locator('#m-people');await people.getByRole('button',{name:'Add person',exact:true}).click({timeout:8000});await people.getByRole('textbox',{name:'Name',exact:true}).fill('A contact draft to keep');await page.getByRole('button',{name:'Back to Contacts',exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'Keep editing?',exact:true});await confirm.getByRole('button',{name:'Keep draft & close',exact:true}).click();
  await people.locator('.org-record').filter({hasText:'A contact draft to keep'}).click();assert.equal(await people.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'A contact draft to keep');
  assert.equal(await people.getByRole('textbox',{name:'Email',exact:true}).inputValue(),'');assert.deepEqual(errors,[]);
 }finally{await ctx.close()}
});
test('native Back restores a scrolled Notes collection and its originating record focus',{skip:!existsSync(resolve(PUBLIC,'notes/roof/releases/4.31/notes.js'))},async()=>{
 const {ctx,page,errors}=await rootContext();try{
  await launchApp(page,'Notes');
  await page.evaluate(async owner=>{
   const {createSystemClient,operationId}=await import('/roof/system-client.js'),client=createSystemClient({signal:new AbortController().signal,session:{user:{id:owner}}},{prefix:'/api/organise/'});
   for(let i=0;i<14;i++)await client.request('record',{method:'PUT',body:{kind:'notes',id:operationId(),version:0,deleted:false,operationId:operationId(),value:{title:'Scroll reference '+i,text:'A real account record for navigation.',checklist:[],links:[]}}});
   dispatchEvent(new CustomEvent('inflite:organise-change',{detail:{owner,kind:'notes'}}));
  },c.owner);
  const notes=page.locator('#m-notes'),record=notes.locator('.org-record').filter({hasText:'Scroll reference 0'});
  await record.waitFor();await settled(page);
  const id=await record.evaluate(node=>{
   node.focus({preventScroll:true});
   node.scrollIntoView({block:'center',behavior:'instant'});
   return node.dataset.record;
  });
  await page.waitForFunction(()=>scrollY>300);
  const y=await page.evaluate(()=>scrollY);
  await notes.locator('.org-list').evaluate((list,id)=>{
   list.addEventListener('click',function remember(event){
    if(event.target.closest('[data-record]')?.dataset.record!==id)return;
    window.__libraryClickY=scrollY;
    list.removeEventListener('click',remember,true);
   },true);
  },id);
  await record.click();await notes.getByRole('textbox',{name:'Title',exact:true}).waitFor();await page.getByRole('button',{name:'Back to Notes',exact:true}).click();await record.waitFor();await settled(page);
  const position=await page.evaluate(()=>({actual:scrollY,clicked:window.__libraryClickY,focused:document.activeElement?.dataset.record}));assert.ok(Math.abs(position.actual-position.clicked)<3,'Back returns to the remembered library position: '+JSON.stringify({before:y,...position}));assert.equal(await page.evaluate(()=>document.activeElement?.dataset.record),id);assert.deepEqual(errors,[]);
 }finally{await ctx.close()}
});

test('typing during the acknowledgement of a local note advances its own saved version', async () => {
 const {ctx,page}=await open();
 try {
  const record=await page.evaluate(async()=>{
   const {createStore}=await import('/organise/store.js');
   const controller=new AbortController(),id=crypto.randomUUID().replaceAll('-','');
   const store=await createStore({signal:controller.signal,session:{user:{id:document.body.dataset.owner}}},'notes');
   const first={title:'Acknowledged note',text:'First edit',checklist:[],links:[]};
   const second={...first,text:'Next edit'};
   const original=IDBObjectStore.prototype.delete;
   let queued=false,timer;
   const done=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error('The queued note did not settle')),15000);
    store.subscribe(()=>{
     const r=store.view(id);
     if(r?.state==='failed'||r?.state==='conflict')reject(new Error(r.error));
     if(r?.version===2&&!r.pending)resolve();
    });
    IDBObjectStore.prototype.delete=function(key){
     if(this.name==='work'&&key===id&&!queued){
      queued=true;
      store.save(id,second,{version:0}).catch(reject);
     }
     return original.call(this,key);
    };
   });
   try{
    await store.save(id,first,{version:0});
    await done;
    return await store.remote(id);
   }finally{
    clearTimeout(timer);
    IDBObjectStore.prototype.delete=original;
    controller.abort();
   }
  });
  assert.equal(record.version,2);
  assert.equal(record.text,'Next edit');
 }finally{await ctx.close()}
});
