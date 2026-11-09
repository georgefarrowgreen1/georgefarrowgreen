const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{resolve}=require('node:path'),{existsSync}=require('node:fs'),{pathToFileURL}=require('node:url');
const {mkdir}=require('node:fs/promises');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');let browser,serveKit,KIT,defaults;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));defaults=(await import(pathToFileURL(ROOT+'/fitness/rhythm.js'))).DEFAULTS;browser=await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const width of [320,390,1440])test(`one weekly overview shows availability, plan and completion at ${width}px`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:950},colorScheme:width===390?'dark':'light',reducedMotion:'reduce'});
 await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});
 await ctx.route('**/api/fitness/**',r=>r.fulfill({json:{signedIn:true,id:'weekly-rider',name:'Alex',ver:1,data:{profile:{ftp:250,weight:75,lthr:160,maxHr:185,set:['ftp']},rhythm:{...defaults,days:[270,0,0,0,0,60,270],at:Date.now()-14*86400e3},plan:null,swaps:{},workouts:[],prefs:{onboarded:true,ask:false,maps:'tap'}},acts:[],garmin:{on:false},health:{on:false},strava:{on:false},offers:[],times:[]}}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await p.goto(KIT+'/?module=/fitness/roof/fitness.js&apps=weather,fitness');await p.waitForFunction(()=>window.kit?.ready);await p.evaluate(()=>kit.F.nav.go('/fitness/'));
  const summary=p.locator('.week-overview');await summary.waitFor();assert.equal(await summary.count(),1);assert.deepEqual(await summary.locator('dt').allTextContents(),['Available','Planned','Completed']);
  assert.match((await summary.locator('dd').allTextContents())[0],/^10\s*h/);assert.match((await summary.locator('dd').allTextContents())[2],/^0/);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.waitForTimeout(400);await p.evaluate(()=>document.querySelector('.week-overview').scrollIntoView({block:'center'}));await mkdir('/tmp/inflite-six-20261109/03-fitness/screens',{recursive:true});await p.screenshot({path:`/tmp/inflite-six-20261109/03-fitness/screens/week-${width}.png`,caret:'initial'});assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
