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
  if(p==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB" data-app="weather"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${mode==='module'?'/app.css':'/weather/styles.css'}">${mode==='module'?'<link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/weather/roof/wxcore.css"><link rel="stylesheet" href="/weather/roof/weather.css">':''}</head><body>${mode==='standalone'?sheet:''}<script src="/menu.js"></script><script type="module" src="/harness.js"></script></body></html>`});
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
