const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{readFileSync,existsSync,mkdirSync}=require('node:fs'),{resolve,extname}=require('node:path');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite'),OUT=process.env.WEATHER_MOTION_SCREENSHOTS;let browser;
before(async()=>{browser=process.env.WEATHER_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});if(OUT)mkdirSync(OUT,{recursive:true});});
after(async()=>browser?.close());

// Production component shapes and styles, with no API dependency or live maps.
// Test the actual held press, release and entry frames: settled screenshots alone
// miss a fading text label or an active transform escaping Reduce Motion.
for(const hosted of [false,true])for(const reducedMotion of ['no-preference','reduce'])for(const [width,colorScheme]of [[390,'light'],[1440,'dark']])test(`Weather motion stays bounded and readable ${hosted?'hosted':'native'} ${width}px ${reducedMotion}`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:900},colorScheme,reducedMotion,serviceWorkers:'block'}),errors=[],missing=[];
 const card=hosted?'ifl-card wx-card':'card settled',chart='<svg class="c-wait" viewBox="0 0 320 80" role="img" aria-label="Temperature chart"><path class="c-line" pathLength="1" stroke="var(--temp, #b8650a)" d="M10 60 Q160 5 300 40"/><text class="c-label" x="150" y="20">12°</text><rect class="c-col" style="--k:47" x="20" y="40" width="10" height="30"/></svg>';
 const radar=`<div class="${hosted?'wx-radar':`radar ${colorScheme==='light'?'light-map':''} settled`}" id="radar"><div class="radar-map"></div><div class="map-ctl"><div class="map-zoom"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button></div><button class="radar-centre" aria-label="Your place">⌖</button><div class="layer-wrap"><button class="map-layers" aria-label="Layers">▱</button><div class="layer-menu" hidden><button aria-pressed="true">Rain</button><button>Wind</button></div></div></div><button class="radar-credit folded" aria-label="Map credits"><span class="rc-c">©</span><span class="rc-t">OpenStreetMap</span></button><div class="radar-dock"><button class="${hosted?'radar-play':'icon-btn radar-play'}" aria-label="Play radar">▶</button><div class="radar-time">Rain radar</div><div class="radar-track"><input class="radar-slider" aria-label="Radar time" type="range"></div><div class="rl-switch"><button aria-pressed="true">Wind</button><button>Gusts</button></div></div><span class="map-read"><span class="mr-b"><b class="mr-v">Light rain</b></span></span></div>`;
 const parts=hosted?'<button class="wx-alert">Yellow wind warning</button><div class="wx-tiles"><button class="wx-tile">Feels like <b>10°</b></button></div>':'<div class="seg" role="tablist"><button aria-selected="true" role="tab">Temp</button><button role="tab" aria-selected="false">Rain</button><button role="tab" aria-selected="false">Wind</button></div><button class="tile opens settled">Feels like <b>10°</b></button><button class="day-row">Tomorrow · 12°</button><div class="day-strip"><button class="ds-day" aria-current="date"><span>Tue</span><b>10</b></button><button class="ds-day"><span>Wed</span><b>11</b></button></div><label class="switch">Rain alerts<input id="rain-alerts" type="checkbox"></label><div id="day-body">Tomorrow: dry and bright</div>';
 const places=hosted?'<dialog class="ifl-sheet" data-app="weather" data-sheet="places" id="places"><div class="ifl-sheet-head"><h2>Places</h2></div><div class="ifl-sheet-body"><div class="wx-places"><div class="wx-place"><button class="wx-place-go">London</button></div></div><button class="wx-found-row">North Walsham</button></div></dialog>':'<dialog class="sheet" id="places"><div class="sheet-head"><h2>Places</h2></div><div class="sheet-body"><button class="place-card"><span class="pc-l"><b>London</b></span><span class="pc-r">12°</span></button><button class="row-btn">North Walsham</button></div></dialog>';
 await ctx.route('**/*',route=>{
  const u=new URL(route.request().url()),p=u.pathname;
  if(u.hostname!=='weather.test')return route.fulfill({status:503,body:'No live APIs in the motion fixture'});
  if(p==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB" data-app="weather"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${hosted?'/app.css':'/weather/styles.css'}">${hosted?'<link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/weather/roof/weather.css"><link rel="stylesheet" href="/weather/roof/radar.css"><link rel="stylesheet" href="/weather/roof/wxcore.css">':''}<link rel="stylesheet" href="/canonical.css"><style>main{display:block!important;max-width:760px;margin:0 auto;padding:24px 16px}.fixture{display:grid;gap:16px}#radar{position:relative;inset:auto;height:360px;min-height:0;margin:0;max-width:100%;border-radius:26px;overflow:hidden}.map-read{position:absolute!important;left:40%!important;top:55%!important}.radar-dock{position:absolute!important;left:12px;right:12px;bottom:12px}#places button{max-width:100%}</style></head><body><main class="${hosted?'m-weather':''}"><h1>Weather</h1><p>London · 12°</p><section class="${card} fixture"><h2>Next 48 hours</h2>${parts}<div class="chart">${chart}</div><svg class="r-wait" viewBox="0 0 320 24" role="img" aria-label="Climate range"><text class="r-text" x="5" y="18">November average</text><text class="r-vtext" x="220" y="18">12°</text></svg></section>${radar}<button class="${hosted?'wx-link':'link'}" id="open-places">Places</button></main>${places}</body></html>`});
  const file=p==='/canonical.css'?ROOT+'/.tools/inflite/tokens.css':p.startsWith('/weather/')?ROOT+p:IFL+'/today/public'+p;
  if(!existsSync(file)){missing.push(p);return route.fulfill({status:404,body:''});}
  return route.fulfill({contentType:extname(file)==='.css'?'text/css':'application/octet-stream',body:readFileSync(file)});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 const press=async(selector,target=selector)=>{
  const button=page.locator(selector).first();await button.scrollIntoViewIfNeeded();await button.hover();await page.waitForTimeout(470);
  const before=await button.evaluate(n=>({w:n.offsetWidth,h:n.offsetHeight}));await page.mouse.down();await page.waitForTimeout(130);
  const held=await page.locator(target).first().evaluate(n=>{const s=getComputedStyle(n),m=new DOMMatrixReadOnly(s.transform);return{scale:Math.hypot(m.a,m.b),opacity:s.opacity};});
  assert.equal(held.opacity,'1',`held text stays fully opaque: ${selector}`);
  assert.ok(reducedMotion==='reduce'?Math.abs(held.scale-1)<.001:held.scale>=.93&&held.scale<.999,`press scale ${selector}: ${JSON.stringify(held)}`);
  assert.deepEqual(await button.evaluate(n=>({w:n.offsetWidth,h:n.offsetHeight})),before,'press never changes layout');
  await page.mouse.up();await page.waitForTimeout(470);
  const released=await page.locator(target).first().evaluate(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return Math.hypot(m.a,m.b);});
  assert.ok(Math.abs(released-1)<.001,`release returns to rest: ${selector}: ${released}`);
 };
 try{
  await page.goto('https://weather.test/');
  const readable=()=>page.locator('.c-label,.r-text,.r-vtext').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).opacity==='1'));
  assert.equal(await readable(),true,'offscreen chart/range text is never hidden before entry');
  await page.locator('.chart svg').evaluate(n=>{n.classList.replace('c-wait','c-enter');for(const a of n.getAnimations({subtree:true})){a.pause();a.currentTime=0;}});
  assert.equal(await readable(),true,'text stays fully visible in the first chart entry frame');
  const column=await page.locator('.c-col').evaluate(n=>{const s=getComputedStyle(n);return{duration:parseFloat(s.animationDuration),delay:parseFloat(s.animationDelay)};});
  assert.ok(column.duration<=.46&&column.delay<=.12,'48th-column stagger is capped');
  await page.locator('.chart svg').evaluate(n=>{for(const a of n.getAnimations({subtree:true}))a.finish();});
  if(!hosted){await press('.seg button:nth-child(2)');await press('.ds-day:nth-child(2)','.ds-day:nth-child(2) b');await press('.tile.opens');await press('.day-row');
   const toggle=page.locator('#rain-alerts');await toggle.hover();await page.mouse.down();await page.waitForTimeout(180);
   const knob=await toggle.evaluate(n=>({width:getComputedStyle(n,'::before').width,transition:getComputedStyle(n,'::before').transitionDuration}));
   assert.equal(knob.width,reducedMotion==='reduce'?'28px':'34px','switch press follows the motion preference');
   if(reducedMotion==='reduce')assert.equal(knob.transition,'0s');await page.mouse.up();assert.equal(await toggle.isChecked(),true,'switch state updates normally');
   await page.waitForTimeout(470);assert.equal(await toggle.evaluate(n=>new DOMMatrixReadOnly(getComputedStyle(n,'::before').transform).m41),20,'switch rests at its checked position');
  }
  else{await press('.wx-alert');await press('.wx-tile');await press('.radar-play');await press('.radar-centre');await press('.map-layers');}
  await press('.map-zoom button');await press('.radar-credit');await press('.rl-switch button');
  await page.locator('.layer-menu').evaluate(n=>{n.hidden=false;for(const a of n.getAnimations()){a.pause();a.currentTime=0;}});
  assert.equal(await page.locator('.layer-menu').evaluate(n=>getComputedStyle(n).opacity),'1','menu text arrives at full contrast');
  assert.equal(await page.locator('.mr-b').evaluate(n=>getComputedStyle(n).opacity),'1','reading text stays fully opaque');
  if(reducedMotion==='reduce')assert.equal(await page.locator('.layer-menu,.mr-b').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).animationName==='none')),true,'Reduce Motion has no overlay entry animation');
  if(!hosted){await page.locator('#day-body').evaluate(n=>{n.className='from-right';for(const a of n.getAnimations()){a.pause();a.currentTime=0;}});assert.equal(await page.locator('#day-body').evaluate(n=>getComputedStyle(n).opacity),'1');}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal overflow');
  if(OUT&&reducedMotion==='no-preference')await page.screenshot({path:OUT+`/${hosted?'hosted':'native'}-${width}-${colorScheme}.png`,fullPage:true});
  await page.locator('#places').evaluate(n=>n.showModal());await page.waitForTimeout(500);
  await press(hosted?'.wx-place-go':'.place-card');await press(hosted?'.wx-found-row':'.row-btn');
  await page.locator(hosted?'.wx-place-go':'.place-card').focus();await page.keyboard.press('Tab');
  assert.equal(await page.locator(hosted?'.wx-found-row':'.row-btn').evaluate(n=>document.activeElement===n),true,'keyboard focus proceeds through Places');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 }finally{await ctx.close();}
});
