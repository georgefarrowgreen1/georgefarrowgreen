// Isolated status-page UI checks; no backend or external requests.
// CHROMIUM=/usr/bin/chromium node .tools/tests/status-ui.mjs
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../status/', import.meta.url));
const now = Date.now(), dayKeys = Array.from({length: 90}, (_, i) => new Date(now - (89-i)*864e5).toISOString().slice(0,10));
const services = ['today','chat','weather','fitness','markets','mail','auth','account','home'].map((id,i) => ({
  id, name: ['Today','Chat','Weather','Fitness','Markets','Mail','Sign in','Account','Home page'][i],
  group: i<6?'apps':i<8?'account':'home', s:'ok', address:`${id}.inflite.ai`,
  days:dayKeys.map(()=>({s:'ok',n:288,down:0,slow:0,up:100})), checks:[{k:'Answers',s:'ok',ms:80}]
}));
const fixture = {at:now,since:dayKeys[0],dayKeys,services,
  jobs:['Chat notifications','Weather alerts','Garmin sync','Market alerts','Morning notification'].map((name,i)=>({id:['notify','wxtick','garmin','mkttick','morning'][i],name,s:'ok',at:now,ms:400})),
  deps:['Weather API','Market API','Garmin API','Email API'].map((name,i)=>({id:['dep-weather','dep-prices','dep-garmin','dep-email'][i],name,s:'ok',ms:i===3?null:87})),
  incidents:[{id:'resolved-test',title:"Markets: TypeError: A.atHub is not a function. (In 'A.atHub(IFL.hub)'",svcs:['weather'],started:now-3600e3,ended:now-1800e3,updates:[{at:now-1800e3,k:'Resolved',w:'Alerts are being delivered normally.'},{at:now-3600e3,k:'Investigating',w:'Checking delayed alerts.'}]}],bugs:[],maint:[]};
fixture.incidents.push({...structuredClone(fixture.incidents[0]),id:'resolved-mail',title:'Mail not answering',svcs:['mail'],notOutage:true});
fixture.bugs=['fixed','new','known','back'].map((state,i)=>({code:`IF-T-TEST${i}`,state,app:i===0?'server':'markets',title:i===0?'Today: building your day':null,first:now-864e5,last:now-3600e3,fixedAt:state==='fixed'||state==='back'?now-1800e3:null,n:i+1}));
fixture.deps.push(
 {id:'api-today',name:'Today API',monitor:'api',s:'ok',ms:45,why:null},
 {id:'api-fitness',name:'Fitness API',monitor:'api',s:'ok',ms:75,why:null},
 {id:'perf-today',name:'Today performance',monitor:'performance',s:'none',why:'Collecting performance samples'},
 {id:'perf-mail',name:'Mail performance',monitor:'performance',s:'ok',why:'Enough samples; within thresholds'}
);
const browser = await chromium.launch({executablePath:process.env.CHROMIUM || undefined,args:['--no-sandbox']});
const out = process.env.STATUS_SCREENSHOTS;
if(out)mkdirSync(out,{recursive:true});
try {
for(const width of [320,390,640,1100])for(const colorScheme of ['light','dark'])for(const problem of [false,true]){
 const data=structuredClone(fixture);
 if(problem){data.jobs[1].at=now-30*60e3;data.deps[1].s='warn';data.deps[2].s='down';data.deps[2].why='The provider is not answering right now.';}
 const page=await browser.newPage({viewport:{width,height:1000},colorScheme});
 await page.clock.install();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=0;
 await page.route('https://status.test/**', async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/status'){requests++;return route.fulfill({json:data});}
  if(path==='/api/status/day')return route.fulfill({json:{points:[]}});
  if(path==='/api/status/hours')return route.fulfill({json:{kept:true,ms:87,q:Array(96).fill('ok')}});
  if(path==='/api/status/code')return route.fulfill({json:{found:false}});
  if(path.startsWith('/api/'))return route.fulfill({status:404,body:''});
  const file=root+(path==='/'?'index.html':path.slice(1));
  if(!existsSync(file))return route.fulfill({status:404,body:''});
  let body=readFileSync(file);
  if(path==='/')body=body.toString().replace('</body>',`<script type="application/json" id="seed">${JSON.stringify(data)}</script></body>`);
  await route.fulfill({body,contentType:path==='/'?'text/html':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'image/svg+xml',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'"}});
 });
 await page.goto('https://status.test/');await page.waitForSelector('.status-dot');
 assert.equal(await page.locator('.status-row').count(),fixture.jobs.length+fixture.deps.length);
 assert.equal(await page.getByRole('heading',{name:'API health',exact:true}).count(),1);
 assert.equal(await page.getByRole('heading',{name:'Page performance',exact:true}).count(),1);
 assert.equal(await page.getByText('Collecting performance samples',{exact:true}).count(),1);
 assert.match(await page.locator('#verdict h2').innerText(),problem?/isn’t answering/:/Everything’s working/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
 assert.equal(await page.locator('#mini').evaluate(x=>x.inert),true);
 const incidentLayout=await page.locator('#incs .inc').evaluateAll(rows=>rows.map(row=>{
  const heading=row.querySelector('h3').getBoundingClientRect(), tags=row.querySelector('.tags').getBoundingClientRect();
  return {below:tags.top>=heading.bottom,left:Math.abs(tags.left-heading.left)<1,separator:getComputedStyle(row).borderTopWidth};
 }));
 assert(incidentLayout.every(x=>x.below && x.left),'badges consistently beneath titles');
 assert.notEqual(incidentLayout[1].separator,'0px','incident separator visible');

 assert.equal(await page.locator('.incident-detail').first().evaluate(x=>x.open),false);
 await page.locator('.incident-detail summary').first().click();
 assert.equal(await page.locator('#codesec h2').innerText(),'Bug reports');
 assert.equal(await page.locator('#codes .report').count(),4);
 assert(await page.locator('#codes .report-detail').evaluateAll(xs=>xs.every(x=>!x.open)));
 await page.locator('#codes .report-detail summary').first().click();

 assert.equal(await page.locator('.status-tools, #refreshBtn').count(),0);
 const refreshed = page.waitForResponse(response=>response.url().endsWith('/api/status'));
 await page.clock.fastForward(60_000);
 await refreshed;
 await page.waitForFunction(()=>document.querySelector('.incident-detail').open);
 assert.equal(await page.locator('#codes .report-detail').first().evaluate(x=>x.open),true);
 assert(requests>=2);assert.equal(await page.locator('.incident-detail').first().evaluate(x=>x.open),true);
 await page.locator('[data-period="2"]').click();
 assert.equal(await page.locator('[data-period="2"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.period),'2');
 assert.equal(await page.locator('.app[data-id="today"] .days button').count(),7);
 await page.locator('[data-toggle="chat"]').click();
 assert.equal(await page.locator('[data-toggle="chat"]').getAttribute('aria-expanded'),'true');
 await page.locator('.days[data-svc="chat"] button').last().click();
 await page.waitForSelector('#hours .q');
 assert.equal(await page.locator('.wrap').evaluate(x=>x.inert),true);
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.close),'1');
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.step),'-1');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.wrap').evaluate(x=>x.inert),false);
 assert.equal(await page.locator('#subBtn, a[href="#updates"]').count(),0);
 assert(!await page.locator('body').innerText().then(t=>t.includes('Checked every 5 minutes from Cloudflare')));
 await page.evaluate(()=>{location.hash='updates';});
 assert.equal(await page.locator('#sheet.on').count(),0);
 await page.locator('#lookIn').fill('if t test0');await page.locator('#lookForm button').click();
 assert.equal(await page.locator('#IF-T-TEST0 .report-detail').evaluate(x=>x.open),true);
 await page.locator('#lookIn').fill('nonsense');await page.locator('#lookForm button').click();
 assert.match(await page.locator('#found').innerText(),/doesn’t look like a code/);
 await page.locator('#lookIn').fill('if c zzzzz');await page.locator('#lookForm button').click();
 await page.waitForFunction(()=>document.querySelector('#found').textContent.includes('haven’t seen'));
 await page.locator('.page-nav a[href="#incidents"]').click();
 assert.equal(await page.evaluate(()=>location.hash),'#incidents');
 await page.evaluate(()=>window.scrollTo(0,0));
 if(out)await page.screenshot({path:`${out}/status-${width}-${colorScheme}-${problem?'issue':'healthy'}.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px ${colorScheme} ${problem?'issue':'healthy'}: layout, refresh, history, keyboard, sheets, lookup and navigation`);
 await page.close();
}
} finally {await browser.close();}
