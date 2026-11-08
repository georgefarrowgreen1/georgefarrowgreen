const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{createHash}=require('node:crypto'),{pathToFileURL}=require('node:url'),{resolve}=require('node:path'),{mkdir}=require('node:fs/promises'),{existsSync}=require('node:fs');
const ROOT=resolve(__dirname,'../..'),IFL=process.env.ROOF_IFL||resolve(ROOT,'../inflite'),NOW=new Date('2026-11-09T11:00:00Z').getTime(),DAY=86400e3;
let browser,serveKit,KIT,cleanPrescription;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));({cleanPrescription}=await import(pathToFileURL(resolve(ROOT,'functions/_fitrhythm2.js'))));browser=await chromium.launch({...((process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/chromium'))?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'}:{}),headless:true,args:['--no-sandbox']});});after(async()=>browser?.close());
async function open(width=390,theme='dark'){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,timezoneId:'Europe/London',locale:'en-GB',acceptDownloads:true});await context.addInitScript(now=>{const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};},NOW);
 const kit=await serveKit(context,{main:ROOT+'/',ifl:IFL+'/'}),state={records:[],writes:[],errors:[],trainingRequests:0,data:{profile:{ftp:250,weight:75,lthr:160,maxHr:185,set:['ftp']},plan:null,rhythm:{days:[60,60,0,60,0,120,90],level:'regular',start:NOW-11*3600e3,at:NOW-11*3600e3,lean:'balanced',mode:'build'},swaps:{},feel:{},workouts:[],prefs:{units:'metric',onboarded:true,ask:false}},ver:1};
 const acts=Array.from({length:8},(_,i)=>({id:'ride'+i,start:NOW-(i*3+1)*DAY,sport:'ride',indoor:false,name:'Endurance ride',file:'ride.fit',type:'fit',sum:{moving:3600,secs:3600,tss:45,kind:'power',iF:.68}}));
 await context.route(/\/api\/fitness\//,async r=>{const req=r.request(),url=new URL(req.url()),path=url.pathname.split('/api/fitness/')[1],b=req.postData()?JSON.parse(req.postData()):null;let out={};
  if(path==='me'&&req.method()==='GET')out={signedIn:true,id:'ann',name:'Alex',handle:'alex',data:state.data,ver:state.ver,acts,at:NOW,garmin:{on:false},health:{on:false},strava:{on:false},offers:[],times:[]};
  else if(path==='me'&&req.method()==='PUT'){state.data=b.data;out={ver:++state.ver,data:state.data};}
  else if(path==='rhythm2'){state.trainingRequests++;out={records:state.records};}
  else if(path==='rhythm2/prescriptions'){state.writes.push(b);const payload=cleanPrescription(b,NOW),id=createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,24);let record=state.records.find(x=>x.id===id);if(!record){record={...payload,id,created:NOW,revision:0,feedback:null};state.records.push(record);}out={record};}
  else if(path==='rhythm2/feedback'){state.writes.push(b);let rec=state.records.find(x=>x.id===b.id);assert.equal(rec.revision,b.revision);rec={...rec,revision:rec.revision+1,feedback:{completion:b.completion,effort:b.effort,reason:b.reason}};state.records=state.records.map(r=>r.id===rec.id?rec:r);out={record:rec};}
  else if(path==='routes/plan')out={plan:null};
  await r.fulfill({json:out});
 });
 const page=await context.newPage();page.on('pageerror',e=>state.errors.push(e.message));await page.goto(KIT+'/?module=/fitness/roof/fitness.js&apps=weather,fitness');await page.waitForFunction(()=>window.kit?.ready);await page.evaluate(()=>window.kit.F.nav.go('/fitness/'));await page.getByRole('button',{name:/Rhythm 2\.0/}).waitFor();return {context,page,state,kit};
}
test('Rhythm 2 beta enables, records exact targets, saves feedback and can return to classic on mobile',async()=>{
 const {context,page,state,kit}=await open();try{
  assert.equal(state.trainingRequests,0);assert.ok(!kit.log.some(p=>/\/rhythm2\.js(?:\?|$)/.test(p)),'classic does not fetch the new planner');
  await page.getByRole('button',{name:/Rhythm 2\.0/}).click();const sheet=page.locator('dialog[data-sheet="rhythm2"]');await sheet.waitFor();await page.getByRole('switch',{name:'Use Rhythm 2.0 beta'}).check();await page.getByRole('button',{name:'Use this session',exact:true}).waitFor();
  await page.getByRole('button',{name:'Use this session',exact:true}).click();await page.getByRole('button',{name:'Session recorded',exact:true}).waitFor();assert.equal(state.records.length,1);assert.equal(state.records[0].ftp,250);const steps=JSON.stringify(state.records[0].workout.steps);
  await page.getByLabel('Perceived effort',{exact:true}).fill('6');await page.getByRole('button',{name:'Save review',exact:true}).click();await page.getByText('Review saved. Rhythm will use it for future sessions.',{exact:true}).waitFor();assert.equal(state.records[0].feedback.effort,6);assert.equal(await page.getByLabel('Perceived effort',{exact:true}).inputValue(),'6');assert.equal(JSON.stringify(state.records[0].workout.steps),steps);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(process.env.RHYTHM2_SCREENSHOTS){await mkdir(process.env.RHYTHM2_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.RHYTHM2_SCREENSHOTS+'/mobile-beta.png'});}
  await page.getByRole('switch',{name:'Use Rhythm 2.0 beta'}).uncheck();await page.keyboard.press('Escape');await sheet.waitFor({state:'detached'});assert.equal(state.records.length,1);assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
});
test('the beta sheet fits narrow phones and desktops in either theme',async()=>{
 for(const [width,theme]of [[320,'light'],[1440,'dark']]){const {context,page,state}=await open(width,theme);try{
  await page.getByRole('button',{name:/Rhythm 2\.0/}).click();await page.getByRole('switch',{name:'Use Rhythm 2.0 beta'}).waitFor();
  await page.getByText('How Rhythm plans',{exact:true}).click();await page.getByText('Mostly easy riding',{exact:true}).waitFor();await page.getByText('Research behind Rhythm',{exact:true}).click();
  const links=page.locator('.r2-content a[href^="https://doi.org/"]');assert.equal(await links.count(),4);for(const link of await links.all())assert.equal(await link.getAttribute('target'),'_blank');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.locator('.r2-content').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  assert.deepEqual(state.errors,[]);
 }finally{await context.close();}}
});
