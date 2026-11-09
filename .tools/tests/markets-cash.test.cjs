const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{resolve,extname}=require('node:path'),{existsSync,readFileSync}=require('node:fs'),{pathToFileURL}=require('node:url');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');let browser,serveKit,KIT,fixtures;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));fixtures=await import(pathToFileURL(ROOT+'/.tools/tests/unit/fixtures/mk.mjs'));browser=process.env.CASH_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
async function world({width,hosted,cashOnly=false,loseFirst=false}){
 const ctx=await browser.newContext({viewport:{width,height:1000},colorScheme:width===390?'dark':'light',reducedMotion:'reduce',serviceWorkers:'block'});
 if(hosted)await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});
 else await ctx.route('http://finance.kit.test/**',async r=>{const u=new URL(r.request().url());if(u.pathname.startsWith('/api/'))return r.fallback();let file=resolve(ROOT+'/markets','.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(ROOT+'/markets/')||!existsSync(file))return r.fulfill({status:404,body:'not found'});return r.fulfill({body:readFileSync(file),contentType:MIME[extname(file)]||'application/octet-stream'});});
 const acc=fixtures.account();acc.cash=[];if(cashOnly)acc.holdings=[];const api=fixtures.marketsApi({acc}),writes=[];let lose=loseFirst;
 await ctx.route('**/api/markets/**',async r=>{
  const req=r.request(),u=new URL(req.url()),path=u.pathname.split('/').at(-1),method=req.method();
  if(path==='cash'){
   if(method==='PUT'){const b=req.postDataJSON();writes.push(b);const old=acc.cash.find(x=>x.id===b.id);if(old)Object.assign(old,b,{updated:Date.now()});else acc.cash.push({...b,added:Date.now(),updated:Date.now()});if(lose){lose=false;return r.abort();}}
   if(method==='DELETE')acc.cash=acc.cash.filter(x=>x.id!==u.searchParams.get('id'));
   return r.fulfill({json:{cash:acc.cash}});
  }
  if(path==='chart'){const t=Math.floor(Date.now()/1000);return r.fulfill({json:{t:[t-86400*30,t-86400*15,t],c:[2.9,3,3.12],base:3,cur:'GBP',tz:'Europe/London'}});}
  const result=await api.fetch(req.url(),{method,body:req.postData()});return r.fulfill({status:result.ok?200:404,json:await result.json()});
 });
 const p=await ctx.newPage(),errors=[];p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
 if(hosted){await p.goto(KIT+'/?module=/markets/roof/markets.js&apps=weather,markets');await p.waitForFunction(()=>window.kit?.ready);await p.evaluate(()=>kit.F.nav.go('/markets/#holdings'));}
 else {await p.goto('http://finance.kit.test/');await p.waitForFunction(()=>document.querySelector('#main')?.textContent?.includes('Markets')||document.querySelector('.cash-section')||document.querySelector('.empty'));}
 return {ctx,p,acc,writes,errors};
}
const visible=(p,s)=>p.locator(s).filter({visible:true});
async function holdings(p,hosted){if(hosted){await p.evaluate(()=>kit.F.nav.go('/markets/#holdings'));return;}if(!await p.locator('body').evaluate(b=>b.classList.contains('desk-on'))){const tab=p.locator('[data-tab="holdings"],button[data-k="holdings"],a[href="#holdings"]').filter({visible:true});if(await tab.count())await tab.first().click();else await p.evaluate(()=>{location.hash='holdings';});}}
for(const width of [320,390,1440])for(const hosted of [true,false])test(`cash can be added, edited and removed ${hosted?'in Today':'standalone'} at ${width}px`,async()=>{
 const cashOnly=width===320,{ctx,p,acc,writes,errors}=await world({width,hosted,cashOnly});
 try{
  await holdings(p,hosted);await visible(p,'button').filter({hasText:/^Add cash$/}).first().click();
  assert.deepEqual(errors,[]);const amount=p.locator('#mk-cash-amount'),rate=p.locator('#mk-cash-rate'),name=p.locator('#mk-cash-name');await amount.waitFor();
  await name.fill(width===320?'<img src=x onerror="alert(1)">':'Savings');await amount.fill('12,000.00');await rate.fill('101');await p.locator('#mk-cash-save').click();
  await p.locator('#mk-cash-error').waitFor({state:'visible'});assert.match(await p.locator('#mk-cash-error').textContent(),/interest rate/);assert.equal(writes.length,0);assert.equal(await amount.inputValue(),'12,000.00');
  await rate.fill('4');assert.match(await p.locator('.cash-echo').textContent(),/£480.00 a year.*£40.00 monthly/);await p.locator('#mk-cash-save').click();await amount.waitFor({state:'detached'});
  assert.equal(writes.length,1);assert.equal(writes[0].amount,12000);assert.equal(writes[0].rate,4);assert.match(writes[0].id,/^[a-f\d-]{36}$/);
  await holdings(p,hosted);const row=visible(p,'.cash-row').first();await row.waitFor();assert.equal(await row.locator('img').count(),0);assert.match(await row.textContent(),/12,000.00/);
  const amountTotal=await p.evaluate(()=>{const n=[...document.querySelectorAll('.portfolio-overview .stat:first-child b,#dpv')].find(x=>x.getBoundingClientRect().width);return n?.textContent;});assert.match(amountTotal,new RegExp(cashOnly?'12,000':'21,801'));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(process.env.CASH_SCREENSHOTS){require('node:fs').mkdirSync(process.env.CASH_SCREENSHOTS,{recursive:true});await row.scrollIntoViewIfNeeded();await p.waitForTimeout(600);await p.screenshot({path:process.env.CASH_SCREENSHOTS+'/cash-'+(hosted?'today':'standalone')+'-'+width+'.png'});}
  await row.click();await amount.waitFor();await amount.fill(cashOnly?'0':'10,000');await rate.fill('0');await p.locator('#mk-cash-save').click();await amount.waitFor({state:'detached'});assert.equal(acc.cash.length,1);assert.equal(acc.cash[0].amount,cashOnly?0:10000);assert.equal(acc.cash[0].rate,0);assert.ok(writes[1].updated);assert.doesNotMatch(await p.locator('body').textContent(),/0 of 0 up|NaN/);
  await holdings(p,hosted);await visible(p,'.cash-row').first().click();await p.locator('.cash-remove').click();assert.equal(acc.cash.length,1);await p.locator('.cash-remove').click();await amount.waitFor({state:'detached'});assert.equal(acc.cash.length,0);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
test('retrying a cash save after a lost response keeps the input and creates just one holding',async()=>{
 const {ctx,p,acc,writes,errors}=await world({width:390,hosted:true,cashOnly:true,loseFirst:true});
 try{await visible(p,'button').filter({hasText:/^Add cash$/}).first().click();await p.locator('#mk-cash-amount').fill('5000');await p.locator('#mk-cash-rate').fill('4.25');await p.locator('#mk-cash-save').click();await p.locator('#mk-cash-error').waitFor();assert.equal(await p.locator('#mk-cash-amount').inputValue(),'5000');assert.equal(await p.locator('#mk-cash-rate').inputValue(),'4.25');await p.locator('#mk-cash-save').click();await p.locator('#mk-cash-amount').waitFor({state:'detached'});assert.equal(writes.length,2);assert.equal(writes[0].id,writes[1].id);assert.equal(acc.cash.length,1);assert.deepEqual(errors,[]);}finally{await ctx.close();}
});
for(const hosted of [true,false])test(`large cash balances stay inside the phone viewport ${hosted?'in Today':'standalone'}`,async()=>{
 const {ctx,p,errors}=await world({width:320,hosted,cashOnly:true});
 try{await visible(p,'button').filter({hasText:/^Add cash$/}).first().click();await p.locator('#mk-cash-amount').fill('1000000000000');await p.locator('#mk-cash-rate').fill('100');await p.locator('#mk-cash-save').click();await p.locator('#mk-cash-amount').waitFor({state:'detached'});
  if(hosted)await p.evaluate(()=>kit.F.nav.go('/markets/'));else await p.locator('[data-tab="today"]').filter({visible:true}).click();
  await visible(p,'[data-el=pv],#pv').waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
