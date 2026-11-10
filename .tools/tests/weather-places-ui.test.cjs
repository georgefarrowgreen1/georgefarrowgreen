const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{readFileSync,existsSync,mkdirSync}=require('node:fs'),{resolve,extname}=require('node:path');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite'),OUT=process.env.WEATHER_UI_SCREENSHOTS;let browser;
before(async()=>{browser=process.env.WEATHER_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});if(OUT)mkdirSync(OUT,{recursive:true});});
after(async()=>browser?.close());
const source=readFileSync(ROOT+'/weather/app.js','utf8'),html=readFileSync(ROOT+'/weather/index.html','utf8');
const cut=(name)=>{const at=source.indexOf('function '+name+'(');assert.ok(at>=0);return source.slice(at,source.indexOf('\n}\n',at)+2);};
const start=html.indexOf('<dialog class="sheet" id="places"'),sheet=html.slice(start,html.indexOf('</dialog>',start)+9);
const longName='Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',region='A deliberately long district and region that must remain distinguishable';
const fixture=(name)=>({name,latitude:51.5,longitude:-0.1,admin1:region,country:'United Kingdom',country_code:'GB'});
for(const mode of ['standalone','module'])for(const width of [320,390,1280])test(`Weather Places stays readable and ignores stale search results ${mode} at ${width}px`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:844},colorScheme:width===390?'dark':'light',reducedMotion:'reduce',locale:'en-GB'}),errors=[],pending=new Map();
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url()),p=u.pathname;
  if(u.hostname==='geocoding-api.open-meteo.com'){pending.set(u.searchParams.get('name'),route);return;}
  if(p==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB" data-app="weather"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${mode==='module'?'/app.css':'/weather/styles.css'}">${mode==='module'?'<link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/weather/roof/wxcore.css"><link rel="stylesheet" href="/weather/roof/weather.css">':''}</head><body>${mode==='standalone'?sheet:''}<script src="/menu.js"></script><script type="module" src="/harness.js"></script></body></html>`});
  if(p==='/menu.js')return route.fulfill({contentType:'text/javascript',body:readFileSync(ROOT+'/.tools/inflite/menu.js','utf8')+'\nglobalThis.IFL=IFL;'});
  if(p==='/harness.js'){
   const shared=`import {searchPlaces} from '/weather/data.js';const picked=[];window.__picked=picked;`;
   const standalone=`${shared}const $=id=>document.getElementById(id),S={searching:false,pick:false,places:[]},calm=matchMedia('(prefers-reduced-motion:reduce)'),EASE_OUT='ease';let searchTimer=null,searchSeq=0,searchingT=0;function h(tag,a={},...kids){const n=document.createElement(tag);for(const[k,v]of Object.entries(a)){if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);}for(const k of kids.flat(9))if(k!=null)n.append(k);return n;}const addPlace=p=>(S.places.push(p),S.places.length-1),closeSheet=()=>Promise.resolve(),turnTo=i=>picked.push(S.places[i].name);${cut('results')}\n${cut('onSearch')}\n$('search').addEventListener('input',()=>onSearch());$('places').showModal();$('saved').innerHTML='<li class="pc-li"><button class="place-card"><span class="pc-l"><span class="pc-name">${longName}</span><span class="pc-sub">${region}</span></span><span class="pc-r"><span class="pc-temp">−12°</span></span></button></li>';document.querySelector('.sheet-body').append(h('button',{class:'tile opens',id:'motion-probe',text:'Details'}));window.__ready=true;`;
   const module=`import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {openPlaces} from '/weather/roof/places.js';const places=[{name:'${longName}',region:'${region}',lat:51.5,lon:-.1},{name:'London',region:'England',lat:51.5,lon:0},{name:'York',region:'England',lat:54,lon:-1}];const core={S:{places,cur:0,f:{temp:x=>x+'°',time:()=> '12:00'}},peek:()=>({temp:-12,code:3,isDay:true}),looking:()=>false,on:()=>()=>{},glanceAll:async()=>false,locate:async()=>false,movePlace:(i,by)=>{[places[i],places[i+by]]=[places[i+by],places[i]];return true;},removePlace:i=>places.splice(i,1),addPlace:p=>(places.push(p),places.length-1),setPlace:i=>{window.__picked=[places[i].name];}};const handle=openPlaces({core,fw:{ui,sheet:createSheets({})}});const m=document.createElement('div');m.className='m-weather';m.innerHTML='<button class="wx-tile" id="motion-probe">Details</button>';handle.body.append(m);window.__ready=true;`;
   return route.fulfill({contentType:'text/javascript',body:mode==='module'?module:standalone});
  }
  const file=p.startsWith('/weather/')?ROOT+p:IFL+'/today/public'+p;
  if(!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':extname(file)==='.svg'?'image/svg+xml':'application/octet-stream',body:readFileSync(file)});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const waitPending=async q=>{for(let i=0;i<250&&!pending.has(q);i++)await page.waitForTimeout(20);assert.ok(pending.has(q),'search request starts: '+q);};
 try{
  await page.goto('https://inflite.test/');await page.waitForFunction(()=>window.__ready);
  if(mode==='module'){
   await page.locator('[data-act=edit]').click();await page.locator('.is-editing').first().waitFor();
   const box=await page.locator('.wx-place').first().evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth,go:n.querySelector('.wx-place-go').getBoundingClientRect().width,tools:[...n.querySelectorAll('.wx-place-tools button')].map(b=>b.getBoundingClientRect().width)}));
   assert.ok(box.scroll<=box.width+1,JSON.stringify(box));assert.ok(box.go>=box.width-1);assert.ok(box.tools.every(x=>x>=44));
   if(OUT)await page.screenshot({path:OUT+`/places-edit-${width}.png`});
   await page.locator('[data-place="0"] [data-act=down]').click();
   assert.equal(await page.locator('[data-place="1"] [data-act=down]').evaluate(n=>document.activeElement===n),true,'reordering keeps focus on the requested direction');
   await page.locator('[data-act=edit]').click();
  }
  const field=page.locator(mode==='module'?'.wx-find':'#search'),results=page.locator(mode==='module'?'.wx-found-row':'.results .row-btn');
  await field.fill('Old');await waitPending('Old');
  await field.fill('New');await pending.get('Old').fulfill({json:{results:[fixture('Old result')]}});await page.waitForTimeout(80);
  assert.equal(await results.count(),0,'the previous query cannot show results during the next debounce');
  await waitPending('New');await pending.get('New').fulfill({json:{results:[fixture(longName)]}});await results.waitFor();
  assert.match(await results.textContent(),new RegExp(longName));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await results.evaluate(n=>n.scrollWidth>n.clientWidth+1),false,'long result stays inside its row');
  if(OUT)await page.screenshot({path:OUT+`/places-result-${mode}-${width}.png`});
  const probe=page.locator('#motion-probe');await probe.scrollIntoViewIfNeeded();await probe.hover();await page.mouse.down();assert.equal(await probe.evaluate(n=>getComputedStyle(n).transform),'none','Reduce Motion removes press scaling');await page.mouse.up();
  await field.fill('');assert.equal(await results.count(),0);assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});

// The public audit found rain percentages using the graph's blue and offscreen
// planning cards fading their text. These are the production component shapes
// from app.js windows()/hourly and roof/now.js windowsCard()/wxui.js strip(),
// including poor windows that remain collapsed in many ordinary forecasts.
const plans=[
 {name:'Run',rating:'Fair',day:'Tomorrow',time:'16:00–17:00',text:'Dry, 10°, light winds'},
 {name:'Walk',rating:'Poor',day:'Not today or tomorrow',text:'Rain and strong gusts throughout the day'},
 {name:'Ride',rating:'Poor',day:'Tomorrow',time:'12:00–13:00',text:'A wet and windy ride, with gusts of 60 mph'},
];
for(const mode of ['standalone','module'])for(const width of [320,1440])for(const colorScheme of ['light','dark'])test(`Weather rain, offscreen planning and poor windows retain contrast ${mode} ${width}px ${colorScheme}`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:900},colorScheme,reducedMotion:'no-preference',serviceWorkers:'block'}),errors=[];
 const hosted=mode==='module',card=hosted?'ifl-card wx-card':'card',win=hosted?'wx-win':'win',grid=hosted?'wx-win-grid':'win-grid';
 const windows=plans.map(w=>`<div class="${win}${w.rating==='Poor'?' poor':''}"><div class="win-name">${w.name}</div><div class="win-day"><span>${w.day}</span><span class="win-rate" data-r="${w.rating}">${w.rating}</span></div>${w.time?`<div class="win-time">${w.time}</div>`:''}<div class="win-text">${w.text}</div></div>`).join('');
 const links=hosted?'<button class="wx-link" id="hover-link">Refresh</button><button class="wx-win-poor" id="hover-poor"><span><b>Nothing looking good: </b>Walk, Ride</span></button>':'<button class="link" id="hover-link">Refresh</button><button class="win-poor" id="hover-poor"><span><b>Nothing looking good: </b>Walk, Ride</span></button><div class="credits"><a id="hover-credits" href="#sources">Weather sources</a></div><p class="credits-lead"><a href="#sources">Weather data</a></p><p class="warn-link"><a href="#warning">Official warning</a></p><p class="acct-new"><a href="#signin">Sign in</a></p><footer class="foot"><a id="hover-foot" href="#credits">Learn more about weather data</a></footer>';
 await ctx.route('**/*',route=>{
  const p=new URL(route.request().url()).pathname;
  if(p==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB" data-app="weather"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${hosted?'/app.css':'/weather/styles.css'}">${hosted?'<link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/weather/roof/weather.css">':''}</head><body><main class="${hosted?'m-weather':''}" style="display:block;max-width:760px;margin:auto;padding:16px"><section class="${card}" id="hours"><h2>Next 48 hours</h2><div class="${hosted?'wx-strip':'strip'}"><div class="hour now"><span class="h-time">Now</span><span class="h-pop">40%</span><span class="h-temp">10°</span></div></div><svg width="80" height="12" aria-hidden="true"><rect width="80" height="8" fill="var(${hosted?'--wx-rain':'--rain'})"/></svg></section><div style="height:940px" aria-hidden="true"></div><section class="${card}" id="planning"><h2>Best times</h2><div class="${grid}">${windows}</div>${links}</section></main></body></html>`});
  const file=p.startsWith('/weather/')?ROOT+p:IFL+'/today/public'+p;
  return existsSync(file)?route.fulfill({contentType:extname(file)==='.css'?'text/css':'application/octet-stream',body:readFileSync(file)}):route.fulfill({status:404,body:''});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const samples=()=>page.evaluate(()=>{
  const rgba=s=>{const a=s.match(/[\d.]+/g).map(Number),k=s.startsWith('color(srgb ')?255:1;return[a[0]*k,a[1]*k,a[2]*k,a.length>3?a[3]:1];};
  const over=(a,b)=>{const k=a[3]+b[3]*(1-a[3]);return[...a.slice(0,3).map((x,i)=>(x*a[3]+b[i]*b[3]*(1-a[3]))/k),k];};
  const lum=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll('.h-pop,.win-name,.win-day>span,.win-time,.win-text,#hover-link,#hover-poor b,.credits a,.credits-lead a,.warn-link a,.acct-new a,.foot a')].map(n=>{
   const ancestors=[];for(let p=n;p;p=p.parentElement)ancestors.unshift(p);
   const opacity=ancestors.reduce((v,p)=>v*Number(getComputedStyle(p).opacity),1);
   const bg=ancestors.reduce((v,p)=>over(rgba(getComputedStyle(p).backgroundColor),v),[255,255,255,1]);
   const fg=over(rgba(getComputedStyle(n).color),bg),values=[lum(fg),lum(bg)].sort((a,b)=>a-b);
   return{text:n.textContent.trim(),opacity,ratio:(values[1]+.05)/(values[0]+.05),foreground:fg,background:bg};
  });
 });
 const readable=async label=>{for(const s of await samples()){assert.ok(Math.abs(s.opacity-1)<.001,`${label}: text/ancestor opacity must stay1: ${JSON.stringify(s)}`);assert.ok(s.ratio>=4.5,`${label}: small text needs4.5:1: ${JSON.stringify(s)}`);}};
 try{
  await page.goto('https://inflite.test/');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.ok(await page.locator('#planning').evaluate(n=>n.getBoundingClientRect().top>innerHeight),'planning card starts outside the viewport, so its real scroll-timeline starting state is checked');
  if(!hosted&&await page.evaluate(()=>CSS.supports('animation-timeline:view()')&&CSS.supports('animation-range:entry 0% entry 160px')))assert.equal(await page.locator('#planning').evaluate(n=>getComputedStyle(n).animationName),'settle','exercise the production scroll-linked animation');
  assert.equal(await page.locator('.poor').count(),2);await readable('before scrolling');
  const graphic=await page.locator('#hours rect').evaluate(n=>getComputedStyle(n).fill);
  assert.equal(graphic,colorScheme==='light'?'rgb(47, 122, 214)':'rgb(90, 162, 240)','rain graphics keep their existing meteorological color');
  await page.locator('#planning').scrollIntoViewIfNeeded();await readable('after scrolling');
  for(const id of hosted?['hover-link','hover-poor']:['hover-link','hover-poor','hover-credits','hover-foot']){
   await page.locator('#'+id).hover();await page.waitForTimeout(250);await readable('hover '+id);
  }
  await page.addScriptTag({content:readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')});
  const contrast=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'rule',values:['color-contrast']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
  assert.deepEqual(contrast,[],'Axe confirms composite text contrast');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  if(OUT){await page.locator('#planning').screenshot({path:OUT+`/planning-${mode}-${width}-${colorScheme}.png`});await page.locator('#hours').screenshot({path:OUT+`/rain-${mode}-${width}-${colorScheme}.png`});}
 }finally{await ctx.close();}
});
