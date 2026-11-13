// The real early bundles and styles: continuation over either theme, safe failure, Back, input, and Reduce Motion.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs');
const {resolve}=require('node:path');
const {chromium,webkit}=require('playwright');
const ROOT=resolve(__dirname,'../..');let browser;
before(async()=>{browser=await (process.env.BIO_TEST_BROWSER==='webkit'?webkit:chromium).launch(process.env.BIO_TEST_BROWSER==='webkit'?{}:{executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
const apps=[['pigeon','theme'],['weather','early'],['fitness','theme'],['markets','theme']];
async function fixture(app,script,min,{reduce=false,referrer='https://georgefarrowgreen.com/',back=false,theme='light'}={}){
 const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:reduce?'reduce':'no-preference'});
 await c.addInitScript(({referrer,back,theme})=>{
  Object.defineProperty(document,'referrer',{get:()=>referrer});localStorage.setItem('inflight-theme',theme);localStorage.setItem('fitness:appearance',theme);localStorage.setItem('markets:appearance',theme);
  if(back){const get=performance.getEntriesByType.bind(performance);performance.getEntriesByType=t=>t==='navigation'?[{type:'back_forward'}]:get(t);}
 },{referrer,back,theme});
 await c.route('https://entry.test/**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(path==='/')return r.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="apple-touch-icon" href="/${app}/icon-180.png">${app==='weather'?'':`<script src="/${app}/${script}.js"></script>`}<link rel="stylesheet" href="/${app}/styles.css"></head><body>${app==='weather'?`<script src="/${app}/${script}.js"></script>`:''}<script>window.entryAtFirstPaint=document.documentElement.classList.contains('bio-arrival');</script><button id="content">App control</button></body></html>`});
  const file=resolve(ROOT,(min&&/\.(css|js)$/.test(path)?'min/':'')+path.slice(1));
  if(existsSync(file))return r.fulfill({body:readFileSync(file),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'image/png'});
  return r.fulfill({status:404,body:''});
 });
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://entry.test/');return{c,p,errors};
}
for(const min of [false,true])for(const[app,script]of apps){
 test(`${min?'min':'source'}/${app}: bio arrival continues the outgoing icon then releases the real theme`,async()=>{
  const f=await fixture(app,script,min,{theme:'dark'});try{
   assert.equal(await f.p.evaluate(()=>window.entryAtFirstPaint),true);
   await f.p.waitForFunction(()=>!document.documentElement.classList.contains('bio-arrival'));
   assert.equal(await f.p.locator('#content').isVisible(),true);await f.p.locator('#content').focus();
   assert.equal(await f.p.locator('#content').evaluate(e=>e===document.activeElement),true);
   assert.equal(await f.p.evaluate(()=>document.documentElement.style.getPropertyValue('--bio-entry-icon')),'');assert.equal(await f.p.locator('html').getAttribute('data-theme'),'dark');assert.deepEqual(f.errors,[]);
  }finally{await f.c.close();}
 });
}
for(const options of [{reduce:true},{back:true},{referrer:'https://example.com/'}])test(`no bio arrival for ${JSON.stringify(options)}`,async()=>{
 const f=await fixture('pigeon','theme',false,options);try{assert.equal(await f.p.evaluate(()=>window.entryAtFirstPaint),false);assert.deepEqual(f.errors,[]);}finally{await f.c.close();}
});
test('arrival safety works in CSS even if its finishing script cannot run',async()=>{
 const f=await fixture('fitness','theme',false,{referrer:'https://example.com/'});try{
  await f.p.evaluate(()=>document.documentElement.classList.add('bio-arrival'));
  await f.p.waitForTimeout(1200);
  assert.equal(await f.p.evaluate(()=>getComputedStyle(document.documentElement,'::before').visibility),'hidden');
  await f.p.locator('#content').click();assert.deepEqual(f.errors,[]);
 }finally{await f.c.close();}
});
test('shared arrival bundles are reproducible from their maintained sources',()=>{
 for(const[ext,files]of [['js',apps.map(([a,s])=>`${a}/${s}.js`)],['css',apps.map(([a])=>`${a}/styles.css`) ]]){
  const shared=readFileSync(resolve(ROOT,`.tools/inflite/bio-arrival.${ext}`),'utf8').trim();
  for(const file of files)assert.ok(readFileSync(resolve(ROOT,file),'utf8').includes(shared),file);
 }
});
