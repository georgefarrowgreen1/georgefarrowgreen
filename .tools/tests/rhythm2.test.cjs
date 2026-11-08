const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{createHash}=require('node:crypto'),{pathToFileURL}=require('node:url'),{resolve}=require('node:path'),{mkdir}=require('node:fs/promises'),{existsSync}=require('node:fs');
const ROOT=resolve(__dirname,'../..'),IFL=process.env.ROOF_IFL||resolve(ROOT,'../inflite'),NOW=new Date('2026-11-09T11:00:00Z').getTime(),DAY=86400e3;
let browser,serveKit,KIT,cleanPrescription;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));({cleanPrescription}=await import(pathToFileURL(resolve(ROOT,'functions/_fitrhythm2.js'))));browser=await chromium.launch({...((process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/chromium'))?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'}:{}),headless:true,args:['--no-sandbox']});});after(async()=>browser?.close());
async function open(width=390,theme='dark',options={}){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,timezoneId:'Europe/London',locale:'en-GB',acceptDownloads:true});await context.addInitScript(now=>{const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};},NOW);
 const kit=await serveKit(context,{main:ROOT+'/',ifl:IFL+'/'}),state={records:[],writes:[],errors:[],trainingRequests:0,recordsFailure:!!options.recordsFailure,data:{profile:{ftp:250,weight:75,lthr:160,maxHr:185,set:['ftp']},plan:null,rhythm:{days:[60,60,0,60,0,120,90],level:'regular',start:NOW-11*3600e3,at:NOW-11*3600e3,lean:'balanced',mode:'build'},swaps:{},feel:{},workouts:[],prefs:{units:'metric',onboarded:true,ask:false}},ver:1};
 if(options.days)state.data.rhythm.days=[...options.days];if(options.beta)state.data.rhythm.engine=2;
 const acts=Array.from({length:8},(_,i)=>({id:'ride'+i,start:NOW-(i*3+1)*DAY,sport:'ride',indoor:false,name:'Endurance ride',file:'ride.fit',type:'fit',sum:{moving:3600,secs:3600,tss:45,kind:'power',iF:.68}}));
 await context.route(/\/api\/fitness\//,async r=>{const req=r.request(),url=new URL(req.url()),path=url.pathname.split('/api/fitness/')[1],b=req.postData()?JSON.parse(req.postData()):null;let out={};
  if(path==='me'&&req.method()==='GET')out={signedIn:true,id:'ann',name:'Alex',handle:'alex',data:state.data,ver:state.ver,acts,at:NOW,garmin:{on:false},health:{on:false},strava:{on:false},offers:[],times:[]};
  else if(path==='me'&&req.method()==='PUT'){state.data=b.data;out={ver:++state.ver,data:state.data};}
  else if(path==='rhythm2'){state.trainingRequests++;if(state.recordsFailure){await r.fulfill({status:503,json:{error:'Training is temporarily unavailable.'}});return;}out={records:state.records};}
  else if(path==='rhythm2/prescriptions'){state.writes.push(b);const payload=cleanPrescription(b,NOW),id=createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,24);let record=state.records.find(x=>x.id===id);if(!record){record={...payload,id,created:NOW,revision:0,feedback:null};state.records.push(record);}out={record};}
  else if(path==='rhythm2/feedback'){state.writes.push(b);let rec=state.records.find(x=>x.id===b.id);assert.equal(rec.revision,b.revision);rec={...rec,revision:rec.revision+1,feedback:{completion:b.completion,effort:b.effort,reason:b.reason}};state.records=state.records.map(r=>r.id===rec.id?rec:r);out={record:rec};}
  else if(path==='routes/plan')out={plan:null};
  await r.fulfill({json:out});
 });
 const page=await context.newPage();page.on('pageerror',e=>state.errors.push(e.message));await page.goto(KIT+'/?module=/fitness/roof/fitness.js&apps=weather,fitness');await page.waitForFunction(()=>window.kit?.ready);await page.evaluate(()=>window.kit.F.nav.go('/fitness/'));await page.getByRole('button',{name:/Your week/}).waitFor();return {context,page,state,kit};
}
async function settings(page){await page.getByRole('button',{name:'Fitness Settings',exact:true}).click();const dialog=page.locator('dialog[data-sheet="fxsettings"]');await dialog.waitFor();await page.waitForFunction(()=>document.querySelector('dialog[data-sheet="fxsettings"]')?.getAnimations().every(a=>a.playState==='finished'));return dialog;}
async function toggle(page,on){
 const saved=page.waitForResponse(r=>r.url().includes('/api/fitness/me')&&r.request().method()==='PUT'&&JSON.parse(r.request().postData()).data.rhythm.engine===(on?2:1));
 const input=page.getByRole('switch',{name:'Experimental',exact:true});await input.setChecked(on);await saved;assert.equal(await input.isChecked(),on);
}
test('Experimental is one Settings switch; its saved state survives reload and downloads retain prescribed targets',async()=>{
 const {context,page,state,kit}=await open();try{
  assert.equal(state.trainingRequests,0);assert.equal(await page.getByRole('button',{name:/Rhythm 2\.0/}).count(),0);
  let sheet=await settings(page);assert.equal(state.trainingRequests,0);assert.ok(!kit.log.some(p=>/\/rhythm2\.js(?:\?|$)/.test(p)),'opening Settings leaves classic training lazy');
  assert.equal(await sheet.locator('[data-logo="experimental"]').count(),1);const row=sheet.locator('.ifl-row').filter({has:page.getByRole('switch',{name:'Experimental',exact:true})});assert.equal(await row.locator('small').count(),0);assert.equal(await sheet.getByText('Your training profile',{exact:true}).count(),0);
  await toggle(page,true);await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:/Your week/}).waitFor();sheet=await settings(page);assert.equal(await page.getByRole('switch',{name:'Experimental',exact:true}).isChecked(),true);await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Download',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:/^Garmin/}).click();await download;await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(state.records.length,1);assert.equal(state.records[0].ftp,250);const steps=JSON.stringify(state.records[0].workout.steps);
  sheet=await settings(page);await toggle(page,false);assert.equal(JSON.stringify(state.records[0].workout.steps),steps);assert.deepEqual(state.errors,[]);
  if(process.env.RHYTHM2_SCREENSHOTS){await mkdir(process.env.RHYTHM2_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.RHYTHM2_SCREENSHOTS+'/experimental-settings.png'});}
 }finally{await context.close();}
});
test('Experimental fits narrow phones and desktops in either theme',async()=>{
 for(const [width,theme]of [[320,'light'],[1440,'dark']]){const {context,page,state}=await open(width,theme);try{
  const sheet=await settings(page);await page.getByRole('switch',{name:'Experimental',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await sheet.locator('.fxs-root').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.deepEqual(state.errors,[]);
  if(process.env.RHYTHM2_SCREENSHOTS){await mkdir(process.env.RHYTHM2_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.RHYTHM2_SCREENSHOTS+`/settings-${width}-${theme}.png`});}
 }finally{await context.close();}}
});
test('an unavailable planner leaves Experimental off without changing the saved preference',async()=>{
 const {context,page,state}=await open(390,'light',{recordsFailure:true});try{await settings(page);await page.getByRole('switch',{name:'Experimental',exact:true}).check();await page.getByText('Training is temporarily unavailable.',{exact:true}).waitFor();assert.equal(await page.getByRole('switch',{name:'Experimental',exact:true}).isChecked(),false);assert.notEqual(state.data.rhythm.engine,2);assert.deepEqual(state.errors,[]);}finally{await context.close();}
});

test('the Experimental week preview and saved plan both use the declared ten-hour riding goal',async()=>{
 const days=[270,0,0,0,0,60,270],{context,page,state}=await open(390,'dark',{beta:true,days});try{
  await page.getByRole('button',{name:/Your week/}).click();
  const dialog=page.locator('dialog[data-sheet="rhythm-setup"]');await dialog.waitFor();
  for(let i=0;i<8&&!await dialog.getByRole('button',{name:'Save',exact:true}).count();i++){
   await dialog.getByRole('button',{name:/^(Next|See your first week)$/}).click();
  }
  await dialog.getByText(/10\s*h weekly target/).waitFor();
  await dialog.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  assert.equal(await dialog.getByText('Long endurance ride',{exact:true}).count(),2);
  assert.equal(await dialog.getByText('Threshold 3 × 8 min',{exact:true}).count(),1);
  if(process.env.RHYTHM2_SCREENSHOTS){await mkdir(process.env.RHYTHM2_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.RHYTHM2_SCREENSHOTS+'/ten-hour-preview.png'});}
  const saved=page.waitForResponse(r=>r.url().includes('/api/fitness/me')&&r.request().method()==='PUT');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await saved;
  const actual=await page.evaluate(async()=>{const c=await import('/fitness/roof/core.js'),r=c.rh();return {minutes:r.weekly.minutes,days:r.days.filter(d=>d.date>=c.TODAY&&d.date<c.TODAY+7*86400e3).map(d=>d.mins)};});
  assert.equal(actual.minutes,600);assert.deepEqual(actual.days,days);assert.deepEqual(state.data.rhythm.days,days);assert.equal(state.records.length,0);assert.deepEqual(state.errors,[]);
 }finally{await context.close();}
});
