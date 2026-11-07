const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFile,mkdir}=require('node:fs/promises');
const {existsSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=resolve(__dirname,'../..');
let server,browser,origin,csp;
before(async()=>{
 ({FIT_SECURITY:{'Content-Security-Policy':csp}}=await import(pathToFileURL(resolve(ROOT,'functions/_fitapp.js'))));
 server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p==='/test-export.html'&&process.env.ROUTES_DEMO_HTML){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(process.env.ROUTES_DEMO_HTML));return;}const fwBase=process.env.ROOF_IFL&&resolve(process.env.ROOF_IFL,'today/public/roof');const file=p.startsWith('/test-fw/')&&fwBase?resolve(fwBase,p.slice(9)):resolve(ROOT,'.'+p);if(!file.startsWith(ROOT+'/')&&!(fwBase&&file.startsWith(fwBase+'/')))throw Error();const body=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');if(extname(file)==='.html')res.setHeader('Content-Security-Policy',csp);res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?server.close(r):r());});
async function open(width=390,scheme='light'){
 const context=await browser.newContext({viewport:{width,height:844},colorScheme:scheme,hasTouch:width<600,isMobile:width<600,reducedMotion:'reduce',acceptDownloads:true});
 await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^webgl/.test(kind)?null:get.call(this,kind,...args);};window.__csp=[];document.addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective));});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[],api=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push([r.method(),r.url()]);});
 await page.goto(origin+'/fitness/routes-demo.html');await page.locator('.fr-route-card').first().waitFor();return{context,page,errors,api};
}
async function save(page,name){if(!process.env.ROUTES_SCREENSHOTS)return;await mkdir(process.env.ROUTES_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.ROUTES_SCREENSHOTS}/${name}.png`,fullPage:true});}
test('routes fit phone and desktop in both themes, and time/surface filters change real suggestions',async()=>{
 for(const width of [320,390,1440])for(const theme of ['light','dark']){const{context,page,errors,api}=await open(width,theme);try{
  assert.equal(await page.locator('.fr-route-card').count(),4);assert.equal(await page.locator('.fr-route-card').first().getAttribute('data-route'),'park-endurance');
  await page.getByLabel('Time available').selectOption('45');assert.equal(await page.locator('.fr-route-card').first().getAttribute('data-route'),'park-loop');
  await page.getByLabel('Surface',{exact:true}).selectOption('mixed');assert.equal(await page.locator('.fr-route-card').count(),1);assert.equal(await page.locator('.fr-route-card').getAttribute('data-route'),'park-paths');
  await page.getByLabel('Surface',{exact:true}).selectOption('all');await page.getByLabel('Time available').selectOption('90');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await save(page,`routes-${width}-${theme}`);assert.deepEqual(errors,[]);assert.deepEqual(api,[]);assert.deepEqual(await page.evaluate(()=>__csp),[]);
 }finally{await context.close();}}
});
test('map fallback, scrubbing, sample weather, local planning, Today card and valid GPX export work end to end',async()=>{
 const{context,page,errors,api}=await open();try{
  await page.locator('[data-route="park-endurance"]').click();
  await page.getByText('Street map unavailable. The route outline and GPX still work.').waitFor();
  const scrub=page.getByRole('slider',{name:'Inspect route distance'});await scrub.focus();await page.keyboard.press('End');assert.match(await page.locator('.fr-profile-readout').innerText(),/27\./);
  await page.getByLabel('Departure',{exact:true}).fill('12:30');assert.equal(await page.locator('.fr-sample-weather b').innerText(),'A brighter window');assert.match(await page.locator('.fr-sample-weather').innerText(),/not a live prediction/);
  await save(page,'route-detail-mobile');
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export GPX',exact:true}).click();const download=await downloaded;assert.equal(download.suggestedFilename(),'inflite-park-endurance.gpx');
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const xml=Buffer.concat(chunks).toString();
  const parsed=await page.evaluate(s=>{const d=new DOMParser().parseFromString(s,'application/xml');return{error:!!d.querySelector('parsererror'),points:d.getElementsByTagName('trkpt').length,name:d.querySelector('trk > name')?.textContent};},xml);assert.equal(parsed.error,false);assert.ok(parsed.points>900);assert.equal(parsed.name,'Richmond endurance loop');
  await page.getByRole('button',{name:'Add demo ride to Fitness Today',exact:true}).click();await page.getByText('Demo ride saved. Find it on Fitness Today.').waitFor();
  await page.getByRole('button',{name:'Open Fitness Today',exact:true}).click();assert.equal(await page.locator('#today [data-k="route-demo-plan"]').count(),1);assert.match(await page.locator('#today').innerText(),/Richmond endurance loop/);await save(page,'route-demo-today');
  await page.reload();await page.locator('.fr-route-card').first().waitFor();await page.getByRole('button',{name:'Today',exact:true}).click();assert.equal(await page.locator('#today [data-k="route-demo-plan"]').count(),1);
  await page.getByRole('button',{name:'Remove demo ride',exact:true}).click();assert.equal(await page.locator('#today [data-k="route-demo-plan"]').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(api,[]);assert.deepEqual(await page.evaluate(()=>__csp),[]);
 }finally{await context.close();}
});
test('storage failure stays visible, accounts are isolated, and a stale account cannot save',async()=>{
 const{context,page,errors}=await open();try{
  const result=await page.evaluate(async()=>{
   const{createRoutesView}=await import('/fitness/routes-demo.js'),host=document.createElement('div');host.className='m-fitness';const root=document.createElement('div');host.append(root);document.body.append(host);
   let active='a';const a=createRoutesView(root,{owner:'a',current:()=>active==='a'});a.draw();a.open('park-loop');
   active='b';root.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));const stale=localStorage.getItem('fitness:routes-demo:a');a.destroy();
   const b=createRoutesView(root,{owner:'b',current:()=>active==='b'});b.draw();b.open('park-paths');root.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));const bSaved=JSON.parse(localStorage.getItem('fitness:routes-demo:b'));b.destroy();
   const a2=createRoutesView(root,{owner:'a',storage:{getItem(){return null;},setItem(){throw Error('blocked');}}});a2.draw();const isolated=!root.querySelector('[data-k="route-demo-plan"]');a2.open('park-loop');root.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));const failure=root.querySelector('[role="status"]').textContent;a2.destroy();host.remove();return{stale,bSaved,isolated,failure};
  });assert.equal(result.stale,null);assert.equal(result.bSaved.routeId,'park-paths');assert.equal(result.isolated,true);assert.match(result.failure,/Couldn’t save/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('hidden/destroyed routes release street maps, including map promises that resolve after leaving',async()=>{
 const{context,page,errors}=await open();try{
  const result=await page.evaluate(async()=>{
   const{createRoutesView}=await import('/fitness/routes-demo.js'),host=document.createElement('div');host.className='m-fitness';document.body.append(host);let removed=0;const pending=[];
   const view=createRoutesView(host,{owner:'lifecycle',map:()=>new Promise(r=>pending.push(r))});view.draw();view.open('park-loop');await new Promise(r=>setTimeout(r,0));view.hide();pending.shift()({remove(){removed++;}});await new Promise(r=>setTimeout(r,0));
   view.open('park-paths');await new Promise(r=>setTimeout(r,0));pending.shift()({remove(){removed++;}});await new Promise(r=>setTimeout(r,0));view.destroy();host.remove();return removed;
  });assert.equal(result,2);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('Fitness’s actual module opens live Routes and shows an account route beneath the workout on Today', {skip:!process.env.ROOF_IFL&&'set ROOF_IFL to the inflite checkout for the shared UI'},async()=>{
 const{context,page,errors}=await open();try{
  const loop=JSON.parse(await readFile(resolve(__dirname,'fixtures/cycling-loop.json'),'utf8'));let plan=null;
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:loop.start[1],longitude:loop.start[0],accuracy:10});
  await context.route('**/api/fitness/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname;if(p.endsWith('/routes/generate'))return route.fulfill({json:{routes:[loop]}});if(p.endsWith('/routes/plan')){if(req.method()==='PUT')plan=req.postDataJSON();return route.fulfill({json:{plan}});}return route.fulfill({json:p.endsWith('/me')?{signedIn:true,id:'module-demo',at:Date.now(),ver:1,data:{prefs:{onboarded:true,units:'metric',maps:'tap'}},acts:[],times:[],more:false}:{ok:true}});});
  await page.evaluate(async()=>{
   const ui=await import('/test-fw/ui.js'),entry=await import('/fitness/roof/fitness.js');
   document.querySelector('.fr-preview-main').replaceChildren();const root=document.createElement('div');root.className='m-fitness';document.querySelector('.fr-preview-main').append(root);
   let instance;const fw={ui,screenEl:root,session:{user:{id:'module-demo'},lost:async()=>false},theme:()=> 'light',motion:()=> 'reduced',visible:()=>true,on:()=>()=>{},header:{set(){}},lazy:fn=>fn(''),toast(){},changed(){},zoomTarget(){},nav:{section:section=>instance.show({kind:'app',app:'fitness',section}),depth:()=>1}};
   instance=await entry.mount(root,fw);window.__fitnessModule=instance;window.__routeCore=await import('/fitness/roof/core.js');await instance.show({kind:'app',app:'fitness',section:'routes'});
  });
  await page.getByRole('button',{name:'Use current location',exact:true}).click();
  await page.locator('[data-sec="routes"] .fr-route-card').first().waitFor();
  await page.locator('[data-sec="routes"] .fr-route-card').first().click();
  await page.getByRole('button',{name:'Save planned route',exact:true}).click();await page.getByText('Route saved to your account.',{exact:true}).waitFor();await page.getByRole('button',{name:'Open Fitness Today',exact:true}).click();
  await page.locator('[data-sec="today"] [data-k="route-plan"]').waitFor();
  assert.match(await page.locator('[data-sec="today"] [data-k="route-plan"]').innerText(),/Recommended loop/);
  assert.equal(await page.locator('[data-sec="today"] [data-k="daycard"] + [data-k="route-plan"]').count(),1,'the route belongs beneath the planned workout');
  assert.deepEqual(await page.evaluate(()=>({dirty:__routeCore.S.dirty.size,activities:__routeCore.S.acts.length})),{dirty:0,activities:0});
  await save(page,'integrated-fitness-today');await page.evaluate(()=>__fitnessModule.unmount());assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('the exported single-file demo starts and exports GPX without other local assets', {skip:!process.env.ROUTES_DEMO_HTML&&'set ROUTES_DEMO_HTML to the exported review file'},async()=>{
 const{context,page,errors}=await open();try{
  await page.goto(origin+'/test-export.html');await page.locator('.fr-route-card').first().waitFor();assert.equal(await page.locator('.fr-route-card').count(),4);
  await page.locator('[data-route="park-loop"]').click();const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Export GPX',exact:true}).click();const download=await promise;assert.equal(download.suggestedFilename(),'inflite-park-loop.gpx');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
