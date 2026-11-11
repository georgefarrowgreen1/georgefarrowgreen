const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{readFileSync,existsSync,mkdirSync}=require('node:fs'),{resolve,extname}=require('node:path');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite'),ORIGIN='https://workspace.test',OUT=process.env.WEATHER_WORKSPACE_SCREENSHOTS;
const H=3600000,places=[{name:'London',region:'England',lat:51.5072,lon:-.1276},{name:'Leeds',region:'England',lat:53.8,lon:-1.55}];
let browser,F;
before(async()=>{F=await import('./mocks/wxappdata.mjs');browser=process.env.WEATHER_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});console.log(`Weather workspace browser: ${browser.browserType().name()} ${browser.version()}`);if(OUT)mkdirSync(OUT,{recursive:true});});
after(async()=>browser?.close());
async function open({width=480,saved=places,selection=null,plain=false}={}){
 const now=Date.now(),ctx=await browser.newContext({viewport:{width:1440,height:960},colorScheme:'light',serviceWorkers:'block'}),requests=[],errors=[];
 await ctx.addInitScript(saved=>{localStorage.setItem('wx:places',JSON.stringify(saved));localStorage.setItem('wx:settings',JSON.stringify({temp:'c',glass:'clear'}));Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}});},saved);
 await ctx.route('**/*',r=>r.fulfill({status:503,body:'No unmocked network requests'}));
 const json=(r,value,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(value),headers:{'Access-Control-Allow-Origin':'*'}});
 await ctx.route(ORIGIN+'/**',r=>{
  const p=new URL(r.request().url()).pathname;requests.push(p);
  if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB" data-app="weather"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/weather/roof/weather.css"><link rel="stylesheet" href="/weather/roof/wxcore.css"><link rel="stylesheet" href="/weather/roof/wxsettings.css"><link rel="stylesheet" href="/weather/roof/radar.css"><link rel="stylesheet" href="/weather/roof/workspace.css"><link rel="stylesheet" href="/harness.css"></head><body><div class="composition"><section id="pane"><header id="head"></header><div class="pane-body"><div class="m-weather"></div></div></section><aside id="neighbor">Another app stays visible</aside></div><script src="/menu.js"></script><script type="module" src="/harness.js"></script></body></html>'});
  if(p==='/harness.css')return r.fulfill({contentType:'text/css',body:`body{margin:0}.composition{display:flex;gap:20px;padding:20px}#pane{width:${width}px;flex:none;min-width:0}#head{height:64px;display:flex;gap:8px;align-items:center}.pane-body{height:760px;min-height:0;overflow:auto}#neighbor{width:400px;height:760px;background:var(--ifl-surface-2);border-radius:26px;padding:20px}.m-weather{min-width:0}.m-weather>.wx-sec{padding:0 8px 12px}.m-weather>.wx-sec[data-sec=radar]{padding:0}`});
  if(p==='/menu.js')return r.fulfill({contentType:'text/javascript',body:readFileSync(ROOT+'/.tools/inflite/menu.js','utf8')+'\nglobalThis.IFL=IFL;'});
  if(p==='/harness.js')return r.fulfill({contentType:'text/javascript',body:`import * as ui from '/roof/ui.js';import{createSheets}from'/roof/sheet.js';import{createWorkspaceContext}from'/roof/workspace-context.js';import{mount}from'/weather/roof/weather.js';import*as core from'/weather/roof/core.js';const owner=new AbortController(),events=new Map(),bus=createWorkspaceContext({signal:owner.signal});let instance,visible=true,provider=null,changed=0,provided=0,shows=0;const updates=[];if(${JSON.stringify(selection)})bus.update(${JSON.stringify(selection)},{source:'fitness:weather-for-ride'});const sdk={enabled:true,active:()=>visible,provide(p){provided++;provider=p;return()=>{if(provider===p)provider=null;};},changed(){changed++;},context:{get:bus.get,subscribe:bus.subscribe,update(p,m){updates.push({p,m});return bus.update(p,m);}}};const fw={ui,signal:owner.signal,screenEl:document.querySelector('#pane'),visible:()=>visible,stale:()=>false,lazy:fn=>fn(''),session:{user:null,lost:async()=>false},on(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);return()=>events.get(k).delete(fn);},theme:()=> 'light',toast(){},zoomTarget(){},fill(v){document.querySelector('.pane-body').classList.toggle('fill',v);},search:{provide:()=>()=>{}},header:{set(m){const head=document.querySelector('#head');head.replaceChildren(ui.btn(m.title,{run:m.pick?.run}),...m.acts.map(a=>ui.btn(a.label,{run:a.run})));}},nav:{section:id=>instance.show({section:id}),go:()=>{}}};fw.sheet=createSheets({});if(!${plain})fw.workspace=sdk;if(!${plain})document.querySelector('.m-weather').classList.add('ifl-in-pane');instance=await mount(document.querySelector('.m-weather'),fw);const show=instance.show;instance.show=(...args)=>{shows++;return show(...args);};window.probe={core,instance,bus,updates,get provider(){return provider;},get changed(){return changed;},get provided(){return provided;},get shows(){return shows;},enableWorkspace(){fw.workspace=sdk;return instance.workspace();},hide(){visible=false;instance.hide();},show(route={section:'now'}){visible=true;return instance.show(route);},dispose(){instance.unmount();owner.abort();}};await instance.show({section:'now'});window.probe.ready=true;`});
  // Map engine is outside this layout/bridge slice; the real radar view and CSS
  // still construct the pane card and all overlay layout. No provider is called.
  if(p==='/weather/radar.js')return r.fulfill({contentType:'text/javascript',body:'export function radar(){return{place(){},mark(){},others(){},warnings(){},refresh(){},destroy(){}}}'});
  if(p.startsWith('/api/'))return p.endsWith('/where')?json(r,{name:'London',region:'England',lat:51.5072,lon:-.1276}):p.endsWith('/warnings')?json(r,{warnings:[]}):p.endsWith('/me')?json(r,{signedIn:false}):json(r,{},404);
  const file=p.startsWith('/weather/')?ROOT+p:IFL+'/today/public'+p;
  return existsSync(file)?r.fulfill({contentType:extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':extname(file)==='.svg'?'image/svg+xml':'application/octet-stream',body:readFileSync(file)}):r.fulfill({status:404,body:''});
 });
 await ctx.route(/open-meteo\.com|bigdatacloud|nominatim/,r=>{const u=r.request().url();requests.push(u);return json(r,u.includes('ensemble-api')?F.ensemble(now):u.includes('air-quality')?F.air(now):u.includes('marine-api')?F.marine(now,u):u.includes('archive-api')?F.archive(now):u.includes('bigdatacloud')||u.includes('nominatim')?{city:'London',principalSubdivision:'England',countryCode:'GB'}:u.includes('models=')?F.models(now):F.forecast(now));});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.clock.setFixedTime(new Date(now));await page.goto(ORIGIN);await page.waitForFunction(()=>window.probe?.ready&&probe.core.S.wx&&!probe.core.S.loading);await page.locator('[data-card=hourly] .chart svg').waitFor();
 return{ctx,page,requests,errors,now};
}

test('workspace explicit ride location is transient; time and forecast are matched; hidden changes defer and explicit Places publish once',async()=>{
 const start=Math.floor(Date.now()/H)*H+2*H,selection={location:{...places[0],name:'Ride start'},interval:{start,end:start+2*H}},p=await open({saved:[],selection});
 try{
  assert.equal(p.requests.filter(x=>x.endsWith('/where')).length,0,'an explicit transient ride location does not bootstrap an unrelated default');
  assert.deepEqual(await p.page.evaluate(()=>JSON.parse(localStorage.getItem('wx:places'))),[],'ride context never adds a saved place');
  assert.equal(await p.page.evaluate(()=>probe.provider.snapshot().window.state),'ready');
  assert.ok(await p.page.locator('.hour[data-workspace-selected]').count()>0);
  assert.equal(await p.page.evaluate(()=>probe.updates.length),0,'initial/default forecast data never publish location');
  await p.page.evaluate(()=>{probe.hide();probe.bus.update({location:{name:'Leeds ride',lat:53.8,lon:-1.55}},{source:'fitness:weather-for-ride'});});await p.page.waitForTimeout(120);
  assert.equal(await p.page.evaluate(()=>probe.core.place().name),'Ride start','a hidden pane does not consume a new location or fetch');
  await p.page.evaluate(()=>probe.show());await p.page.waitForFunction(()=>probe.core.place().name==='Leeds ride'&&!probe.core.S.loading);
  assert.deepEqual(await p.page.evaluate(()=>JSON.parse(localStorage.getItem('wx:places'))),[]);
  await p.page.evaluate(()=>probe.bus.update({location:null,interval:null},{source:'fitness:weather-for-ride'}));
  assert.equal(await p.page.locator('.wx-workspace-context').isVisible(),false);assert.equal(await p.page.locator('[data-workspace-selected]').count(),0);
  await p.page.evaluate(()=>{probe.core.addPlace({name:'London',lat:51.5072,lon:-.1276},false);probe.provider.run('places');});
  await p.page.locator('dialog[data-sheet=places] .wx-place-go').click();
  assert.equal(await p.page.evaluate(()=>probe.bus.get().location.name),'London');assert.equal(await p.page.evaluate(()=>probe.updates.length),1,'only the explicit Places action publishes');
  await p.page.evaluate(()=>probe.provider.run('refresh'));await p.page.waitForTimeout(150);assert.equal(await p.page.evaluate(()=>probe.updates.length),1);
  if(OUT)await p.page.screenshot({path:OUT+'/context-flow.png'});
  await p.page.evaluate(()=>{window.oldProvider=probe.provider;probe.dispose();});assert.equal(await p.page.evaluate(()=>probe.provider),null);assert.equal(await p.page.evaluate(()=>oldProvider.run('refresh')),false);assert.deepEqual(p.errors,[]);
 }finally{await p.ctx.close();}
});

test('Weather uses its pane width, charts survive resizing and Radar stays inside its own pane',async()=>{
 const p=await open({width:400});try{
  assert.equal(await p.page.locator('.wx-cards').evaluate(n=>getComputedStyle(n).display),'grid','a400px pane does not inherit the desktop two-column layout');
  for(const width of[400,600,420]){await p.page.locator('#pane').evaluate((n,w)=>n.style.width=w+'px',width);await p.page.waitForTimeout(120);assert.equal(await p.page.locator('.m-weather').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);}
  await p.page.evaluate(()=>probe.instance.show({section:'days'}));await p.page.locator('.wx-day[data-day]').first().waitFor();assert.equal(await p.page.locator('.wx-days').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  await p.page.evaluate(()=>probe.instance.show({section:'radar'}));await p.page.locator('.wx-radar').waitFor();
  const bounds=await p.page.locator('.wx-radar').evaluate(n=>{const r=n.getBoundingClientRect(),p=n.closest('#pane').getBoundingClientRect(),b=n.closest('.pane-body').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,paneLeft:p.left,paneRight:p.right,bodyTop:b.top,bodyBottom:b.bottom};});
  assert.ok(bounds.left>=bounds.paneLeft&&bounds.right<=bounds.paneRight+1&&bounds.top>=bounds.bodyTop&&bounds.bottom<=bounds.bodyBottom+1,JSON.stringify(bounds));
  await p.page.locator('.m-weather').evaluate(n=>n.classList.remove('ifl-in-pane'));
  assert.equal(await p.page.locator('.wx-radar').evaluate(n=>getComputedStyle(n).position),'fixed','expanding to the normal full app releases pane-only radar positioning');
  await p.page.locator('.m-weather').evaluate(n=>n.classList.add('ifl-in-pane'));
  assert.equal(await p.page.locator('.wx-radar').evaluate(n=>getComputedStyle(n).position),'absolute','returning to a pane restores bounded radar');
  if(OUT)await p.page.screenshot({path:OUT+'/pane-radar.png'});assert.deepEqual(p.errors,[]);
 }finally{await p.ctx.close();}
});

test('ordinary Today does not load workspace code and a pending loaded-day route cannot reopen a sheet after hide',async()=>{
 const p=await open({plain:true});try{
  assert.equal(p.requests.some(x=>x==='/weather/roof/workspace.js'),false);assert.equal(await p.page.locator('.m-weather[data-workspace]').count(),0);
  await p.page.evaluate(()=>probe.instance.show({section:'days'}));await p.page.locator('.wx-day[data-day]').first().click();await p.page.locator('dialog[data-sheet=day]').waitFor();await p.page.keyboard.press('Escape');await p.page.locator('dialog[data-sheet=day]').waitFor({state:'hidden'});
  await p.page.evaluate(async()=>{const saved=probe.core.S.wx,key=saved.daily[1].key;probe.core.S.wx=null;await probe.instance.show({section:'now',key:'day',arg:key});probe.hide();probe.core.S.wx=saved;probe.core.emit('wx',saved);});await p.page.waitForTimeout(250);
  assert.equal(await p.page.locator('dialog[data-sheet=day][open]').count(),0,'the cancelled route cannot use its already-loaded opener');assert.deepEqual(p.errors,[]);
 }finally{await p.ctx.close();}
});

test('an already shown cold full-app instance attaches late workspace capability once without replaying show, then cleans up',async()=>{
 const p=await open({plain:true});try{
  assert.equal(p.requests.includes('/weather/roof/workspace.js'),false);
  await p.page.evaluate(async()=>{probe.bus.update({location:{name:'Explicit ride start',lat:53.8,lon:-1.55}},{source:'fitness:weather-for-ride'});await probe.enableWorkspace();window.firstProvider=probe.provider;await probe.enableWorkspace();await probe.instance.workspace();});
  await p.page.waitForFunction(()=>probe.core.place().name==='Explicit ride start'&&!probe.core.S.loading);
  assert.equal(await p.page.evaluate(()=>probe.provider===firstProvider&&probe.provided===1&&probe.shows===1),true,'one provider is attached without a duplicate full-app show');
  assert.equal(await p.page.locator('.wx-cards').evaluate(n=>getComputedStyle(n).display),'block','OS capability alone preserves full-app desktop layout');
  assert.equal(p.requests.filter(x=>x==='/weather/roof/workspace.js').length,1);assert.equal(await p.page.locator('.wx-workspace-context').count(),1);
  assert.equal(await p.page.evaluate(()=>probe.updates.length),0,'attaching never publishes the existing place');
  await p.page.evaluate(()=>probe.dispose());assert.equal(await p.page.evaluate(()=>probe.provider),null);
  assert.equal(await p.page.evaluate(()=>probe.instance.workspace()),null);assert.equal(p.requests.filter(x=>x==='/weather/roof/workspace.js').length,1);assert.deepEqual(p.errors,[]);
 }finally{await p.ctx.close();}
});
