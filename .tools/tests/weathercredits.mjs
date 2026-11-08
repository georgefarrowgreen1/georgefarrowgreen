// The actual standalone Credits markup and shared Weather sheet, in both themes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync,existsSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),ifl=process.env.ROOF_IFL||'/workspace/inflite-chat';
const html=readFileSync(root+'weather/index.html','utf8'),start=html.indexOf('<dialog class="sheet" id="credits"'),sheet=html.slice(start,html.indexOf('</dialog>',start)+9);
const out=root+'artifacts/weather-credits';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
let checks=0;const errors=[];const ok=(v,m)=>{assert.ok(v,m);checks++};
try{for(const mode of ['standalone','module'])for(const scheme of ['light','dark'])for(const width of [390,1280]){
 const ctx=await browser.newContext({viewport:{width,height:844},colorScheme:scheme,reducedMotion:'reduce',isMobile:width<600,hasTouch:width<600});
 await ctx.route('**/*',async r=>{const p=new URL(r.request().url()).pathname;
  if(p==='/')return r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html data-app="weather"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+(mode==='module'?'/app.css':'/weather/styles.css')+'">'+(mode==='module'?'<link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/weather/roof/weather.css">':'')+'</head><body>'+(mode==='standalone'?sheet:'')+'<script src="/menu.js"></script><script type="module" src="/harness.js"></script></body></html>'});
  if(p==='/menu.js')return r.fulfill({contentType:'text/javascript',body:readFileSync(root+'.tools/inflite/menu.js','utf8')+'\nglobalThis.IFL=IFL;'});
  if(p==='/harness.js')return r.fulfill({contentType:'text/javascript',body:mode==='module'?`import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {openCredits} from '/weather/roof/wxdetail.js';openCredits({fw:{ui,sheet:createSheets({})}});`:`document.querySelector('#credits').showModal();document.querySelector('[data-close]').onclick=()=>document.querySelector('#credits').close();`});
  const file=p.startsWith('/weather/')?root+p.slice(1):ifl+'/today/public'+p;
  if(!existsSync(file))return r.fulfill({status:404,body:''});
  return r.fulfill({contentType:p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.svg')?'image/svg+xml':'application/octet-stream',body:readFileSync(file)});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://inflite.test/');
 const brand=page.locator('.credits-brand,.wx-credits-brand'),details=page.locator('.credits-attributions,.wx-credits-attributions');await brand.waitFor();
 await page.waitForFunction(()=>{const i=document.querySelector('.credits-brand img,.wx-credits-brand img');return i?.complete&&i.naturalWidth>0;});
 ok(await brand.innerText()==='Powered by InFlite','powered by branding');
 ok(await brand.evaluate(n=>n===n.parentElement.firstElementChild),'branding appears first');
 ok(await brand.getAttribute('href')==='https://inflite.ai/','branding links to InFlite');
 ok(await details.getAttribute('open')===null,'full attributions collapsed by default');
 ok(await page.locator('a[href="https://open-meteo.com/"]').count()===1,'Open-Meteo appears once in the source list');
 ok(await page.locator('a[href="https://creativecommons.org/licenses/by/4.0/"]').count()===1,'licence link retained');
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');
 await page.screenshot({path:out+'/'+mode+'-'+scheme+'-'+width+'.png',fullPage:true});
 await details.locator('summary').focus();await page.keyboard.press('Enter');ok(await details.getAttribute('open')!==null,'attribution disclosure opens with keyboard');
 ok((await details.innerText()).includes('Contains modified Copernicus Climate Change Service information'),'full Copernicus attribution retained');
 ok((await details.innerText()).includes('Neither the European Commission nor ECMWF'),'full disclaimer retained');
 await page.getByRole('button',{name:'Close',exact:true}).click();ok(await page.locator('dialog[open]').count()===0,'sheet closes normally');
 await ctx.close();
}assert.deepEqual(errors,[],'no browser script errors');console.log(checks+' credits browser checks passed; screenshots in artifacts/weather-credits');}finally{await browser.close();}
