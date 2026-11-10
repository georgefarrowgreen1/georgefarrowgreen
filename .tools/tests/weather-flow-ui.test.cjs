const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{readFileSync,existsSync,mkdirSync}=require('node:fs'),{resolve,extname}=require('node:path');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite'),OUT=process.env.WEATHER_FLOW_SCREENSHOTS;let browser,F,serveKit,KIT;
before(async()=>{
 F=await import('./mocks/wxappdata.mjs');({serveKit,KIT}=await import('./roofkit/serve.mjs'));
 browser=process.env.WEATHER_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 console.log(`Weather flow browser: ${browser.browserType().name()} ${browser.version()}`);if(OUT)mkdirSync(OUT,{recursive:true});
});
after(async()=>browser?.close());
const places=[{name:'London',region:'England',lat:51.5072,lon:-.1276},{name:'Leeds',region:'England',lat:53.8,lon:-1.55}];
async function open(hosted,width){
 const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:width===320?'light':'dark',isMobile:width===320,hasTouch:width===320,serviceWorkers:'block',locale:'en-GB'}),now=Date.now();
 await ctx.addInitScript(places=>{localStorage.setItem('wx:places',JSON.stringify(places));localStorage.setItem('wx:cur','0');localStorage.setItem('wx:settings',JSON.stringify({glass:'clear',temp:'c'}));Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}});},places);
 // No request can escape the fixture, including a newly introduced provider.
 await ctx.route('**/*',r=>r.fulfill({status:503,body:'Unmocked request'}));
 if(hosted)await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});
 const origin=hosted?KIT:'https://weather.inflite.ai',j=(r,o,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(o),headers:{'Access-Control-Allow-Origin':'*'}});
 // Explicitly choose the real Weather files in every engine. The generic kit's
 // cookie selector can otherwise serve its fake module in WebKit.
 if(hosted)await ctx.route(KIT+'/weather/**',r=>{const p=new URL(r.request().url()).pathname;if(p==='/weather/version')return j(r,{build:null});const file=ROOT+p;if(!existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({contentType:extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'application/octet-stream',body:readFileSync(file)});});
 if(!hosted)await ctx.route(origin+'/**',r=>{
  const p=new URL(r.request().url()).pathname,file=ROOT+'/weather'+(p==='/'?'/index.html':p).replace(/\.min\.(js|css)$/,'.$1');
  if(!existsSync(file))return r.fulfill({status:404,body:''});
  const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'}[extname(file)]||'application/octet-stream';
  // Serve the source module at its own URL, so lazy files import the same app
  // instance rather than loading a second instance through a .min.js alias.
  const body=p==='/'?readFileSync(file,'utf8').replace(/\.min\.(js|css)/g,'.$1'):readFileSync(file);
  return r.fulfill({contentType:type,body});
 });
 await ctx.route(origin+'/api/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/api/session')return j(r,{signedIn:hosted,user:hosted?{id:'u-fixture',name:'Sam Taylor'}:null});
  if(p.endsWith('/where'))return j(r,{name:'London',region:'England',lat:51.5072,lon:-.1276});
  if(p.endsWith('/warnings'))return j(r,{warnings:[]});
  if(p.endsWith('/me'))return j(r,{signedIn:false});
  return j(r,{},404);
 });
 await ctx.route(/open-meteo\.com|bigdatacloud|nominatim/,r=>{
  const u=r.request().url();
  if(u.includes('ensemble-api'))return j(r,F.ensemble(now,{rainIn:90}));
  if(u.includes('air-quality'))return j(r,F.air(now));
  if(u.includes('marine-api'))return j(r,F.marine(now,u));
  if(u.includes('archive-api'))return j(r,F.archive(now));
  if(u.includes('bigdatacloud')||u.includes('nominatim'))return j(r,{city:'London',locality:'London',countryCode:'GB',principalSubdivision:'England'});
  if(u.includes('models='))return j(r,F.models(now,{rainIn:90}));
  if(u.includes('previous-runs-api')||u.includes('past_hours')||u.includes('forecast_minutely_15=9')||u.includes('hourly=precipitation%2Csnowfall'))return j(r,{},503);
  return j(r,F.forecast(now,{rainIn:90}));
 });
 const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date(now)); // Date is fixed; timers, rAF and animations continue normally.
 if(hosted){await page.goto(KIT+'/?module=/weather/roof/weather.js');await page.waitForFunction(()=>window.kit?.ready);await page.evaluate(()=>kit.F.nav.go('/weather/'));}
 else await page.goto(origin+'/?lat=51.5072&lon=-.1276&name=London');
 try{await page.locator(hosted?'[data-card=hourly] .chart svg':'#hourly-chart svg').first().waitFor();}
 catch(e){console.log('Weather fixture failed to mount',JSON.stringify({hosted,width,errors,text:(await page.locator('body').innerText()).slice(0,1400)}));if(OUT)await page.screenshot({path:`${OUT}/mount-failure-${hosted?'hosted':'native'}-${width}.png`});await ctx.close();throw e;}
 // Climate is intentionally loaded after three seconds. Wait for the actual
 // completed fixture data, so an unrelated incoming forecast is not mistaken
 // for a redraw caused by reselecting a control.
 await page.waitForFunction(async hosted=>{const {S}=await import(hosted?'/weather/roof/core.js':'/app.js');return!S.loading&&!!S.wx?.models&&!!S.wx?.ensemble&&!!S.wx?.air&&!!S.wx?.climate;},hosted);
 return{ctx,page,errors};
}
for(const hosted of [false,true])for(const width of [320,1440])test(`Weather flow continuity ${hosted?'hosted':'native'} ${width}px`,async()=>{
 const {ctx,page,errors}=await open(hosted,width),name=`${hosted?'hosted':'native'}-${width}`;
 const shot=async what=>{if(OUT)await page.screenshot({path:`${OUT}/${name}-${what}.png`});};
 try{
  if(!hosted)assert.equal(await page.locator('#place-name').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,'a short London title fits without clipping');
  await shot('now');
  const chart=page.locator(hosted?'[data-card=hourly] .chart':'#hourly-chart'),active=page.locator(hosted?'[data-key=metric] [aria-checked=true]':'#hourly-seg [aria-selected=true]');await active.focus();
  await page.waitForFunction(sel=>{const n=document.querySelector(sel),s=n?.querySelector('svg:not(.c-old)'),ready=n?._w>0&&Math.abs(n._w-n.clientWidth)<1&&Math.abs((s?.viewBox.baseVal.width||0)-Math.max(260,n.clientWidth))<1;const old=window.__flowReady;window.__flowReady={node:s,width:n?.clientWidth,frames:ready&&old?.node===s&&old.width===n.clientWidth?old.frames+1:0};return window.__flowReady.frames>=2;},hosted?'[data-card=hourly] .chart':'#hourly-chart');
  await chart.evaluate(n=>{window.__flowChart=n;window.__flowSvg=n.querySelector('svg:not(.c-old)');});
  for(let i=0;i<2;i++){await active.press('Enter');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))));const same=await page.evaluate(()=>__flowSvg===__flowChart.querySelector('svg:not(.c-old)'));const detail=!same&&!hosted?await page.evaluate(async()=>{const{S}=await import('/app.js');return{mode:S.mode,chosen:S.modeChosen,draws:window.__flowDraws};}):null;assert.equal(same,true,'reselecting the current metric preserves the chart '+JSON.stringify(detail));}
  // Explicitly choosing the automatic Temp view must still opt out of a later
  // weather-driven switch. Only the ephemeral fixture's weather is changed.
  await page.evaluate(async hosted=>{const m=await import(hosted?'/weather/roof/core.js':'/app.js');if(hosted){m.S.wx.current.gust=90;m.emit('wx',m.S.wx);}else{if(!m.S.modeChosen)throw new Error('A manual choice must remain opted in');m.S.base.current.gust=90;m.redraw();}},hosted);
  await page.waitForTimeout(200);assert.equal(await active.getAttribute(hosted?'data-value':'data-mode'),'temp','the manual choice survives changed weather');
  if(hosted)await page.locator('#hd [data-sec=days]').click();
  const dayMode=page.locator(hosted?'[data-key=daysby] [aria-checked=true]':'#days-seg [aria-selected=true]');await dayMode.focus();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))));
  const days=page.locator(hosted?'.wx-days':'#days');await days.evaluate(n=>{window.__flowDays=n;window.__flowRow=n.querySelector('button');});
  await dayMode.press('Enter');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))));
  assert.equal(await page.evaluate(()=>__flowRow===__flowDays.querySelector('button')),true,'reselecting Days by preserves rows');
  if(hosted){
   await page.locator('.wx-day[data-day]').nth(1).click();const sheet=page.locator('dialog[data-sheet=day][open]');await sheet.waitFor();await page.waitForTimeout(500);
   const nav=sheet.locator(':scope > .wx-day-step');assert.equal(await nav.count(),1,'one navigation pair lives in the sheet footer');
   const visible=()=>nav.evaluate(n=>{const d=n.closest('dialog').getBoundingClientRect();return[...n.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=d.top&&r.bottom<=Math.min(d.bottom,innerHeight)+1&&b.contains(hit);});});
   await shot('day');assert.equal(await visible(),true,'navigation is visible when the day opens');
   await sheet.evaluate(n=>n.scrollTop=(n.scrollHeight-n.clientHeight)/2);assert.equal(await visible(),true,'navigation stays visible midway through the charts');
   await sheet.evaluate(n=>n.scrollTop=n.scrollHeight);assert.equal(await visible(),true,'navigation stays visible at the actual end of the dialog');
   await nav.locator('[data-act=next]').click();await page.waitForTimeout(100);
   assert.equal(await sheet.evaluate(n=>n.scrollTop),0,'a new day resets the actual dialog scroller');
   assert.equal(await nav.locator('[data-act=next]').evaluate(n=>document.activeElement===n),true,'focus remains on the new visible next control');
   assert.equal(await visible(),true);assert.equal(await sheet.locator('.wx-day-top').evaluate(n=>n.getBoundingClientRect().top>=n.closest('dialog').getBoundingClientRect().top),true,'the new summary is in view');await shot('day-next');
   for(let i=0;i<2;i++)await nav.locator('[data-act=prev]').click();
   assert.equal(await nav.locator('[data-act=prev]').isDisabled(),true,'the first day has no earlier day');
   assert.equal(await nav.locator('[data-act=next]').evaluate(n=>document.activeElement===n),true,'focus falls back to the enabled direction at the boundary');
   await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
  }
  await page.locator(hosted?'#hd [data-act=settings]':'#settings-btn').click();
  const settings=page.locator(hosted?'dialog[data-sheet=wxsettings][open]':'#settings[open]');await settings.waitFor();await settings.locator('[data-go=units]').click();await page.waitForTimeout(500);
  const sizes=await settings.locator(hosted?'.wxs-opt [role=radio]':'.set-page:not([hidden]) .choice label').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
  assert.ok(sizes.length>=10&&sizes.every(s=>s.w>=44&&s.h>=44),'unit choices have 44px targets');await shot('units');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
