// Actual conversation and shared header modules with deterministic message fixtures, in Chromium.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const ifl = process.env.ROOF_IFL || '/workspace/inflite-chat';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
const out = root + 'artifacts/chat'; mkdirSync(out, { recursive: true });
let checks = 0; const errors = [];
const ok = (v, why) => { assert.ok(v, why); checks++; };
const harness = `
import * as ui from '/roof/ui.js';
import { createHeader } from '/roof/header.js';
import { createStore } from '/pigeon/roof/store.js';
import { view } from '/pigeon/roof/chat.js';
const store=createStore(), calls=[], NOW=Date.now();
const data={id:'reuben',kind:'friend',msgs:[
 ...[1,2,3].map((n)=>({id:'r'+n,from:'me',at:NOW-86400000*(5-n),kind:'text',recalled:true})),
 {id:'t1',from:'me',at:NOW-3e6,kind:'text',text:'Instant pigeon',delivered:true},
 {id:'t2',from:'them',at:NOW-2.8e6,kind:'text',text:'Very tuff',reactions:{'👍':1},mine:'👍'},
 {id:'t3',from:'me',at:NOW-2.5e6,kind:'text',text:'Not insta pigeon tho',delivered:true},
 {id:'opened',from:'me',at:NOW-2e6,kind:'viewonce',opened:1,read:true,delivered:true},
 {id:'sealed',from:'them',at:NOW-36e5,kind:'text',text:'SECRET SEALED CONTENT',flight:{flying:true,sentAt:NOW-36e5,landsAt:NOW+3.9*36e5,way:'pigeon'}}
]};
store.apply('friends',[{id:'reuben',name:'Reuben',online:false}]); store.apply('groups',[]);
const hd=createHeader(document.querySelector('#hd'),{nav:{back(){calls.push(['back'])}},search:{open(){calls.push(['search'])}}});
const header={set(s){hd.set({...s,crumb:{text:'Chats',app:'chats'}})}};
const fw={ui,header,fill(on){document.documentElement.classList.toggle('ifl-fill',on)},tabs:{away(){}},on(){return ()=>{}},visible(){return true},toast(){},lazy:f=>f('')};
const svc={async call(m,...a){calls.push([m,...a]);if(m==='open'){store.apply('chat:reuben',data);return data;}return {ok:true}}};
const ctx={fw,svc,store,open:{friendInfo:id=>calls.push(['info',id]),groupInfo(){},photo(){},voice:id=>calls.push(['voice',id]),view:id=>calls.push(['view',id]),map:id=>calls.push(['map',id]),hold(){},safety(){}}};
const chat=view(document.querySelector('.m-chats'),ctx);await chat.show({arg:'reuben'});
window.testChat={data,store,chat,calls,hd,patch(){store.apply('chat:reuben',{...data,msgs:[...data.msgs]})}};
`;
try {
 for(const [width,height,scheme] of [[390,844,'light'],[390,844,'dark'],[320,568,'light'],[1440,1000,'dark']]) {
  const ctx=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600,colorScheme:scheme,reducedMotion:'reduce'});
  await ctx.route('**/*',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-app="chats"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/pigeon/roof/chats.css"></head><body><div class="sky" aria-hidden="true"></div><div id="hd"></div><main class="m-chats"></main><script src="/menu.js"></script><script type="module" src="/harness.js"></script></body></html>'});
   if(path==='/menu.js')return route.fulfill({contentType:'text/javascript',body:readFileSync(root+'.tools/inflite/menu.js','utf8')+'\nglobalThis.IFL=IFL;'});
   if(path==='/harness.js')return route.fulfill({contentType:'text/javascript',body:harness});
   const file=path.startsWith('/pigeon/')?root+path.slice(1):ifl+'/today/public'+path;
   if(!existsSync(file))return route.fulfill({status:404,body:''});
   const type=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'application/octet-stream';
   return route.fulfill({contentType:type,body:readFileSync(file)});
  });
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://inflite.test/');await p.waitForSelector('.ch-b.sealed');await p.waitForTimeout(100);
  ok(!await p.getByText('SECRET SEALED CONTENT').count(),'sealed plaintext never reaches the page');
  ok(await p.locator('.ifh-conversation').count()===1,'shared compact conversation header');
  ok(await p.locator('.ifh-person .ifl-avatar').innerText()==='R','friend avatar in header');
  ok(await p.locator('.ifh-conversation').evaluate(el=>el.getBoundingClientRect().height)<85,'header is compact');
  ok(await p.locator('.ch-recalls summary').innerText()==='3 messages called back','recall history grouped');
  await p.locator('.ch-recalls summary').click();ok(await p.locator('.ch-recalls').getAttribute('open')!==null,'activity expands');
  ok(await p.locator('.ch-recall-events time').count()===3,'original event times retained');
  await p.evaluate(()=>testChat.patch());await p.waitForTimeout(100);
  ok(await p.locator('.ch-recalls').getAttribute('open')!==null,'activity remains expanded on refresh');
  await p.locator('.ch-recalls summary').click();
  const progress=await p.locator('.ch-flight-progress').evaluate(el=>el.value);
  ok(progress>0 && progress<1,'flight progress uses actual departure and arrival times');
  await p.locator('.ch-b.sealed').click();ok(await p.evaluate(()=>testChat.calls.some(c=>c[0]==='map'&&c[1]==='sealed')),'sealed letter opens flight, never contents');
  ok(await p.locator('.ch-field .ch-voice').count()===1,'microphone inside message field');
  await p.getByRole('textbox',{name:'Message',exact:true}).fill('Hello Reuben');
  await p.getByRole('button',{name:'Send',exact:true}).click();
  ok(await p.evaluate(()=>testChat.calls.some(c=>c[0]==='sendText'&&c[2]==='Hello Reuben')),'composer still sends');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await p.screenshot({path:out+'/chat-'+width+'-'+scheme+'.png',fullPage:true});
  // A read/opened photo keeps its type and cannot be opened again.
  ok(await p.locator('[data-mid="opened"] .ch-photo.done').innerText()==='Opened','opened photo retains state');
  ok(await p.locator('[data-mid="opened"] button[data-act="view"]').count()===0,'opened photo has no reopen action');
  await p.evaluate(()=>{testChat.chat.hide();testChat.hd.set({title:'Chats'});});
  ok(await p.locator('.ch-bubble').count()===0,'leaving removes message contents');
  ok(await p.locator('.ifh-person .ifl-avatar').count()===0,'leaving clears header identity');
  await ctx.close();
 }
 assert.deepEqual(errors,[],'no browser errors');console.log(checks+' conversation browser checks passed; screenshots in artifacts/chat');
} finally {await browser.close();}
