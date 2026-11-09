// The real standalone markup and roof card component retain reachable details at each size.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),ifl=process.env.ROOF_IFL||root+'../inflite';
const html=readFileSync(root+'weather/index.html','utf8');
const part=id=>{const start=html.indexOf('<details class="card weather-more" id="'+id+'"');return html.slice(start,html.indexOf('</details>',start)+10)};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++};mkdirSync('/tmp/inflite-six-20261109/02-weather/screens',{recursive:true});
try{for(const mode of ['standalone','module'])for(const width of [320,390,1440])for(const scheme of ['light','dark']){
 const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce'});
 await ctx.route('**/*',async r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/')return r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${mode==='module'?'/app.css':'/weather/styles.css'}">${mode==='module'?'<link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/weather/roof/weather.css">':''}</head><body><main class="${mode==='module'?'m-weather':''}"><section id="alerts">Weather warning</section>${mode==='standalone'?part('right-now').replace('<div class="tiles" id="tiles"></div>','<div class="tiles" id="tiles"><button type="button">Wind details</button></div>')+part('climate'):''}</main><script type="module" src="/harness.js"></script></body></html>`});
  if(p==='/harness.js')return r.fulfill({contentType:'text/javascript',body:mode==='module'?`import * as ui from '/roof/ui.js';import {wxCard,h} from '/weather/roof/wxui.js';for(const id of ['right-now','climate','hourly'])document.querySelector('main').append(wxCard({fw:{ui}},{id,title:id},h('button',{type:'button',onclick:()=>window.clicked=true},'Open '+id)));window.ready=true;`:`document.querySelector('#tiles button').onclick=()=>window.clicked=true;window.ready=true;`});
  const f=p.startsWith('/weather/')?root+p.slice(1):ifl+'/today/public'+p;
  return r.fulfill(existsSync(f)?{contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml',body:readFileSync(f)}:{status:404,body:''});
 });
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://weather.test/');await p.waitForFunction(()=>window.ready);
 const details=p.locator('details');ok(await details.count()===2,'two secondary disclosures');ok(await p.locator('#alerts').isVisible(),'warnings stay visible');
 for(let i=0;i<2;i++){const d=details.nth(i);ok(!(await d.getAttribute('open'))&&await d.evaluate(e=>!e.open),'details start closed');await d.locator('summary').focus();await p.keyboard.press('Enter');ok(await d.evaluate(e=>e.open),'details open by keyboard');}
 const button=mode==='module'?p.getByRole('button',{name:'Open right-now',exact:true}):p.getByRole('button',{name:'Wind details',exact:true});await button.click();ok(await p.evaluate(()=>window.clicked),'detail actions remain interactive');
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');assert.deepEqual(errors,[]);
 await p.screenshot({path:`/tmp/inflite-six-20261109/02-weather/screens/${mode}-${width}-${scheme}.png`,caret:'initial'});await ctx.close();
}console.log(checks+' Weather summary checks passed');}finally{await browser.close();}
