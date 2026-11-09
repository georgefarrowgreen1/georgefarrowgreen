const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{resolve}=require('node:path'),{existsSync}=require('node:fs'),{pathToFileURL}=require('node:url');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');let browser,serveKit,KIT,fixtures;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));fixtures=await import(pathToFileURL(ROOT+'/.tools/tests/unit/fixtures/mk.mjs'));browser=await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const width of [320,390,1440])test(`Markets comparisons and chart ranges work at ${width}px`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:950},colorScheme:width===390?'dark':'light',reducedMotion:'reduce'});await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});
 const acc=fixtures.account(),api=fixtures.marketsApi({acc}),errors=[];
 await ctx.route('**/api/markets/**',async r=>{if(new URL(r.request().url()).pathname.endsWith('/chart')){const t=Math.floor(Date.now()/1000);return r.fulfill({json:{t:[t-86400*30,t-86400*15,t],c:[2.9,3,3.12],prev:3.05,cur:'GBP',tz:'Europe/London'}});}const v=await api.fetch(r.request().url(),{method:r.request().method(),body:r.request().postData()});return r.fulfill({status:v.ok?200:404,json:await v.json()});});
 const p=await ctx.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
 try{await p.goto(KIT+'/?module=/markets/roof/markets.js&apps=weather,markets');await p.waitForFunction(()=>window.kit?.ready);await p.evaluate(()=>kit.F.nav.go('/markets/'));await p.locator('.pseg.range-controls').waitFor();
 assert.deepEqual(await p.locator('.pseg button').allTextContents(),['Day','Week','Month','Year']);
 await p.locator('.pseg button[data-r="1mo"]').click();await p.waitForFunction(()=>document.querySelector('[data-el=ps]')?.textContent==='this month');assert.equal(await p.locator('.pseg [aria-pressed=true]').getAttribute('data-r'),'1mo');
 await p.evaluate(()=>kit.F.nav.go('/markets/#holdings'));const overview=p.locator('.portfolio-overview');await overview.waitFor();assert.deepEqual(await overview.locator('dt').allTextContents(),['Portfolio','Total return','Paid dividends']);
 const text=await overview.textContent();assert.match(text,/£/);assert.doesNotMatch(text,/NaN|undefined/);assert.match(await p.locator('.stats-note').textContent(),/Return covers 3 of 4/);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 // Unknown purchase details must remain unknown rather than becoming zero returns/payments.
 const unknown=await p.evaluate(async()=>{const {statsPart}=await import('/markets/roof/holdings.js');const node=statsPart({o:[{}],value:100,back:null,costed:[],undated:[],divs:0})[0];return node.textContent;});assert.match(unknown,/Add purchase costs/);assert.match(unknown,/Add purchase dates/);
 await p.evaluate(()=>kit.F.nav.go('/markets/#s=TSCO.L'));await p.locator('.ifl-sheet[data-app=markets] .range-controls').waitFor();const range=p.locator('.ifl-sheet[data-app=markets] .range-controls');assert.deepEqual(await range.locator('button').allTextContents(),['Day','Week','Month','Year','5yr']);assert.ok((await range.locator('button').evaluateAll(a=>a.map(b=>b.getBoundingClientRect().height))).every(n=>n>=44));
 await range.locator('button[data-r="1y"]').click();await p.waitForFunction(()=>document.querySelector('.ifl-sheet [data-el=cb]')?.dataset.range==='1y');assert.equal(await range.locator('[aria-pressed=true]').getAttribute('data-r'),'1y');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
