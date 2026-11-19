// Real Root boot/Frame, all six OS controllers, native Mail/Fitness providers,
// cookie sessions, D1 CAS and R2 bytes. Only account/bootstrap/native-app API
// transports and the existing Chat RPC test boundary remain fixtures.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const {Module}=require('node:module');
const ORIGIN='https://inflite.ai';
const BROWSER=process.env.WEB_UI_BROWSER||process.env.WORKSPACE_UI_BROWSER||'chromium';
let kit,teardowns=[];
before(async()=>{
  const {workspacesAPI}=await import(pathToFileURL(resolve(__dirname,'../../../inflite/today/src/workspaces.js')));
  const filename=resolve(__dirname,'files-integration.test.cjs'),m=new Module(filename),starts=[];
  m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);const ownRequire=m.require.bind(m);
  m.require=id=>id==='node:test'?{test(){},before(fn){starts.push(fn);},after(fn){teardowns.push(fn);}}:ownRequire(id);
  m.workspacesAPI=workspacesAPI;
  let source=readFileSync(filename,'utf8');
  const {hub}=await import(pathToFileURL(resolve(__dirname,'../../../inflite/today/src/hub.js')));
  m.fitnessAPI=request=>hub(request,{HUB_KEY:'os-next-real-route-transport',FITNESS_ORIGIN:'https://fitness.inflite.ai',APPS:kit.backend().serviceBinding()},{});
  const seams=[
   ["async function openFiles({width=1440,colorScheme}={})","async function openFiles({width=1440,colorScheme,workoutToday=false}={})"],
   ["mode:{filesTheme:colorScheme}","mode:{filesTheme:colorScheme,workoutToday}"],
   ["req.url==='/api/workspaces'", "req.url==='/api/workspaces'||req.url==='/api/fitness/routes/plan'"],
   ["url.pathname==='/api/workspaces'?'workspaces'", "url.pathname==='/api/fitness/routes/plan'?'fitness-plan':url.pathname==='/api/workspaces'?'workspaces'"],
   ["url.pathname==='/api/workspaces'?workspacesAPI:filesAPI", "url.pathname==='/api/fitness/routes/plan'?module.fitnessAPI:url.pathname==='/api/workspaces'?workspacesAPI:filesAPI"],
   ["m.rewriteHarness=source=>source.replace(", `m.rewriteHarness=source=>source.replace(${JSON.stringify("const page = await ctx.newPage(), errors = [];")}, ${JSON.stringify("await ctx.route(ORIGIN+'/api/fitness/routes/plan',route=>route.continue()); const page = await ctx.newPage(), errors = [];")}).replace(${JSON.stringify("state.fx = await routeFitness(ctx, ORIGIN, { me });")},${JSON.stringify("if(mode.workoutToday)me.data.swaps={...me.data.swaps,[Math.floor(NOW/864e5)*864e5]:'mine-1'};state.fx = await routeFitness(ctx, ORIGIN, { me });")}).replace(`],
  ];
  for(const[from,to]of seams){assert.ok(source.includes(from),'real Fitness transport seam exists: '+from);source=source.replace(from,to);}

  m._compile(source+`\nmodule.exports={fitnessProxy:module.fitnessAPI,openFiles,goFiles,folderUI,action,uploadUI,select,gateReached,setupOS,backend:()=>backend,accounts:()=>accounts,os:()=>os};`,filename);
  kit=m.exports;for(const start of starts)await start();
});
after(async()=>{for(const stop of teardowns.reverse())await stop();});
const sheet=(page,id)=>page.locator(`dialog[data-sheet="${id}"][open]`);
async function command(page,query,title){
  const field=page.getByRole('combobox',{name:'Search everything',exact:true});
  await page.keyboard.press('Control+k');await field.waitFor();await field.fill(query);
  await page.getByRole('option').filter({hasText:title}).first().click();
}
async function sourceApp(page,name){
  await kit.goFiles(page);await page.locator('.ifx-location-list').getByRole('button',{name:'From apps',exact:true}).click();
  const choice=kit.select(page,name);await choice.waitFor();if(page.viewportSize().width>=1100)await choice.dblclick();else await choice.click();
}
async function chooseFile(page,name){
  const d=sheet(page,'files-open');await d.waitFor();await d.getByRole('button',{name:'Select '+name,exact:true}).click();await d.getByRole('button',{name:'Open',exact:true}).click();await d.waitFor({state:'detached'});
}
async function saveAs(page,name){const d=sheet(page,'files-save');await d.waitFor();await d.getByRole('textbox',{name:'File name',exact:true}).fill(name);await d.getByRole('button',{name:'Save here',exact:true}).click();await d.waitFor({state:'detached'});}
async function closeDialogs(page){for(let i=0;i<5;i++){const top=page.locator('dialog[open]').last();if(!await top.count())break;await top.locator('[data-close]').click();await top.waitFor({state:'detached'});}}
async function diagnose(t,label){console.log('COMBINED DIAGNOSTIC',JSON.stringify({label,url:t.page.url(),body:(await t.page.locator('body').innerText()).slice(0,6500),requests:t.state.fileRequests.map(({controller,...r})=>r),errors:t.errors,unknown:t.state.unknown,reads:t.state.fileReads.filter(p=>p.includes('workspace')||p.includes('route-files')),security:await t.page.evaluate(()=>({csp:__osCsp,rejected:__osRejected,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.dataset.sheet),importToasts:window.__importToasts||[]}))}));}
async function clean(t){await t.clean();assert.deepEqual(t.state.fileBridgeErrors,[]);}


async function workspaceRequest(account,method='GET',body){
 const root=await import(pathToFileURL(resolve(__dirname,'../../../inflite/today/src/workspaces.js')));
 return root.workspacesAPI(new Request(ORIGIN+'/api/workspaces',{method,headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','X-Inflite':'1','X-Inflite-Workspace-Owner':account.owner,Cookie:account.cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{ACCOUNT_ORIGIN:'https://account.inflite.ai',TODAY_AS:'https://inflite.ai',APPS:kit.backend().serviceBinding()});
}

test('combined real backend shares account sessions while keeping Files bytes and workspace CAS private',async()=>{
 const backend=kit.backend(),accounts=kit.accounts();
 const initial=await workspaceRequest(accounts.a);assert.equal(initial.status,200);assert.deepEqual(await initial.json(),{revision:0,state:null,updatedAt:0});
 const {createWorkspaceStore}=await import(pathToFileURL(resolve(__dirname,'../../../inflite/today/public/roof/workspace-state.js')));
 const {workspaceCloudState}=await import(pathToFileURL(resolve(__dirname,'../../../inflite/today/public/roof/workspace-sync.js')));
 const store=createWorkspaceStore({userId:accounts.a.owner,storage:null});const state=workspaceCloudState(store.read(),accounts.a.owner);store.dispose();
 const put=await workspaceRequest(accounts.a,'PUT',{revision:0,state,operationId:'actual_os_workspace_seed_0001'});assert.equal(put.status,200);assert.equal((await put.json()).revision,1);
 const conflict=await workspaceRequest(accounts.a,'PUT',{revision:0,state,operationId:'actual_os_workspace_stale_001'});assert.equal(conflict.status,409);
 const item=await backend.uploaded(accounts.a,'Account fence proof.bin','real account fence bytes');
 assert.equal((await backend.api(accounts.b,'GET','item',undefined,{query:'?id='+item.id})).status,404);
 const foreign=await workspaceRequest(accounts.b);assert.equal(foreign.status,200);assert.equal((await foreign.json()).state,null);
 assert.equal(initial.headers.get('cache-control'),'private, no-store');assert.equal(initial.headers.get('access-control-allow-origin'),null);
 const routeOwner=await kit.fitnessProxy(new Request(ORIGIN+'/api/fitness/routes/plan',{headers:{Cookie:accounts.b.cookie,'Sec-Fetch-Site':'same-origin','X-Inflite-Route-Owner':accounts.a.owner}}));assert.equal(routeOwner.status,401,'actual Root hub preserves captured native route owner before real D1 reads');
});

test('actual cold command opens native Mail, attaches real Drive bytes and preserves its unsent draft across viewport and recovery',async()=>{
 const item=await kit.backend().uploaded(kit.accounts().a,'Native attach proof.txt','Exact private Drive attachment bytes');
 const t=await kit.openFiles();const{page}=t;try{
  await page.locator('.ws-sidebar').getByRole('button',{name:'Today',exact:true}).click();
  await command(page,'attach file','Attach a file in Mail');
  await chooseFile(page,item.name);
  const compose=sheet(page,'mail-compose'),draft=compose.locator('textarea');await draft.waitFor();await draft.fill('Unsent native attachment proof');
  await compose.getByRole('button',{name:'Remove '+item.name,exact:true}).waitFor();
  await page.evaluate(()=>window.__nativeMailDraft=document.querySelector('dialog[data-sheet="mail-compose"] textarea'));
  await compose.getByRole('button',{name:'Attach from InFlite Files',exact:true}).click();await chooseFile(page,item.name);assert.equal(await draft.inputValue(),'Unsent native attachment proof');assert.equal(await compose.getByRole('button',{name:'Remove '+item.name,exact:true}).count(),2,'native composer also accepts a nested Open dialog');
  await page.setViewportSize({width:390,height:844});assert.equal(await draft.inputValue(),'Unsent native attachment proof');
  assert.equal(await page.evaluate(()=>__nativeMailDraft===document.querySelector('dialog[data-sheet="mail-compose"] textarea')),true);
  assert.equal(t.state.mail.sends.length,0);assert.ok(t.state.fileRequests.some(r=>r.action==='content'&&r.method==='GET'&&r.status===200));
  await compose.locator('[data-close]').click();await compose.waitFor({state:'detached'});
  await command(page,'app status','App status');const recovery=sheet(page,'workspace-recovery');await recovery.waitFor();
  await recovery.getByRole('button',{name:'Resume Mail',exact:true}).click();await page.locator('#m-mail .ml-row').first().waitFor();
  assert.equal(await page.locator('#m-mail').count(),1);assert.equal(t.state.mail.sends.length,0);await clean(t);
 }finally{await t.close();}
});

test('real upload progress appears in Activity and commits once while its Explorer view is away',async()=>{
 const t=await kit.openFiles();const{page}=t;try{
  const gate=t.state.hold(r=>r.action==='content'&&r.method==='PUT');
  const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload',exact:true}).click();await(await choosing).setFiles({name:'Activity transport proof.bin',mimeType:'application/octet-stream',buffer:Buffer.from([0,255,128,13,10])});await kit.gateReached(t,gate);
  await page.locator('.ws-sidebar').getByRole('button',{name:'Activity',exact:true}).click();const activity=sheet(page,'workspace-activity');await activity.waitFor();
  const row=activity.getByRole('listitem').filter({hasText:'Activity transport proof.bin'});await row.waitFor();assert.equal(await row.getAttribute('data-status'),'running');
  const committed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files/content'&&r.request().method()==='PUT'&&r.status()===200);gate.release();await committed;
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-activity]')].some(n=>n.textContent.includes('Activity transport proof.bin')&&n.dataset.status==='succeeded'));
  await activity.locator('[data-close]').click();await kit.goFiles(page);await kit.select(page,'Activity transport proof.bin').waitFor();
  assert.equal(t.state.fileRequests.filter(r=>r.action==='content'&&r.method==='PUT'&&r.status===200).length,1);await clean(t);
 }finally{await t.close();}
});

async function home(page){await page.locator('.ws-sidebar').getByRole('button',{name:'Today',exact:true}).click();await page.locator('.ifl-workspace[data-mode=today]').waitFor();await page.locator('.ws-files-view').waitFor({state:'hidden'});await settleView(page);}
async function settleView(page){await page.evaluate(async()=>{await Promise.allSettled(document.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function newWorkspace(page,name){await home(page);await page.getByRole('button',{name:'New workspace',exact:true}).click();const d=sheet(page,'workspace-create');await d.getByRole('textbox',{name:'Workspace name',exact:true}).fill(name);await d.getByRole('button',{name:'Create workspace',exact:true}).click();await d.waitFor({state:'detached'});}

test('two real devices retain Files access without starting retired workspace synchronization',async()=>{
 const a=await kit.openFiles(),b=await kit.openFiles();try{
  for(const t of [a,b]){
   await home(t.page);
   assert.equal(await t.page.getByRole('button',{name:/workspace|sync/i}).count(),0);
   await kit.goFiles(t.page);await t.page.locator('.ifl-files-explorer:visible').waitFor();
   assert.equal(t.state.fileRequests.some(r=>r.action==='workspaces'),false);
   await clean(t);
  }
 }finally{await a.close();await b.close();}
});

test('canonical unified home has usable real desktop and phone layouts',async()=>{
 const t=await kit.openFiles({colorScheme:'light'});try{await home(t.page);assert.equal(new URL(t.page.url()).origin,ORIGIN);assert.equal(await t.page.getByRole('button',{name:'Open Workspaces',exact:true}).count(),0);
  const out=process.env.FILES_SCREENSHOTS||'/tmp/inflite-os-next-20261114/combined';mkdirSync(out,{recursive:true});
  await settleView(t.page);assert.equal(await t.page.locator('.ifl-files-explorer:visible').count(),0);assert.equal(await t.page.locator('.ws-home').isVisible(),true);assert.equal(await t.page.locator('.ws-files-view').isVisible(),false);if(BROWSER==='chromium')await t.page.screenshot({path:resolve(out,'unified-home-desktop.png'),fullPage:true,animations:'disabled'});
  await t.page.setViewportSize({width:390,height:844});await t.page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);
  await settleView(t.page);if(BROWSER==='chromium')await t.page.screenshot({path:resolve(out,'unified-home-phone.png'),fullPage:true,animations:'disabled'});
  assert.equal(await t.page.locator('.ws-dock-button[data-ws-action=today]').getAttribute('aria-current'),'page');await clean(t);
 }finally{await t.close();}
});

test('native Mail explicitly exports a PDF attachment through Save and the private Drive stores the inert exact bytes',async()=>{
 const t=await kit.openFiles();const{page}=t;try{
  await home(page);await command(page,'open Mail','Open Mail');
  await page.locator('.ml-row').filter({hasText:'Investor update draft'}).first().click();
  await page.getByRole('button',{name:'Save to InFlite Files',exact:true}).click();const chooser=sheet(page,'mail-save-attachment');await chooser.getByRole('button',{name:'October-update-notes.pdf',exact:true}).click();
  await saveAs(page,'Mail PDF export proof.pdf');
  const ready=t.state.fileRequests.find(r=>r.action==='content'&&r.method==='PUT'&&r.status===200)?.answer?.item;assert.ok(ready);
  const bytes=await kit.backend().api(kit.accounts().a,'GET','content',undefined,{query:'?id='+ready.id});assert.equal(bytes.status,200);assert.equal(bytes.value,'Private attachment: October-update-notes.pdf');
  assert.ok(t.state.mail.log.some(r=>r.path==='/api/attachments/a6/export'&&r.method==='POST'&&r.inflite&&r.origin===ORIGIN));
  assert.equal(t.state.mail.log.some(r=>r.path==='/api/attachments/a6'&&r.method==='GET'&&!r.navigate),false,'PDF preview policy stays intact');assert.equal(t.state.mail.sends.length,0);await clean(t);
 }catch(error){await diagnose(t,'PDF');throw error;}finally{await t.close();}
});

test('real untimed GPX review saves an imported A-to-B route in D1 and exports real GPX and FIT bytes to Drive',async()=>{
 const points=Array.from({length:11},(_,i)=>[1,52+i*.001]);
 const gpx=`<?xml version="1.0"?><gpx version="1.1" creator="InFlite test"><rte><name>Untimed A to B proof</name>${points.map(([lon,lat])=>`<rtept lat="${lat}" lon="${lon}"/>`).join('')}</rte></gpx>`;
 const item=await kit.backend().uploaded(kit.accounts().a,'Untimed route proof.gpx',gpx);
 const t=await kit.openFiles({workoutToday:true});const{page}=t;try{
  await home(page);await command(page,'import route','Import a route or activity');await chooseFile(page,item.name);
  const review=sheet(page,'fitness-route-import');await review.waitFor();assert.equal(t.state.fileRequests.some(r=>r.action==='fitness-plan'&&r.method==='PUT'),false,'review has not saved');
  await review.getByRole('button').filter({hasText:'Untimed A to B proof'}).click();
  await page.getByText('Imported GPX',{exact:false}).first().waitFor();
  const date=new Date().toISOString().slice(0,10);await page.getByLabel('Ride day',{exact:true}).fill(date);await page.getByLabel('Departure',{exact:true}).fill('18:00');
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/fitness/routes/plan'&&r.request().method()==='PUT'&&r.status()===200);
  await page.getByRole('button',{name:'Save planned route',exact:true}).click();const plan=(await(await saved).json()).plan;assert.ok(plan);assert.equal(plan.route.source,'imported-gpx');assert.equal(plan.route.provider,'Imported GPX');assert.deepEqual(plan.route.coords.map(c=>c.slice(0,2)),points);
  await command(page,'save route','Save route to InFlite Files');await saveAs(page,'Imported route export proof.gpx');
  let committed=t.state.fileRequests.filter(r=>r.action==='content'&&r.method==='PUT'&&r.status===200).at(-1).answer.item;
  let content=await kit.backend().fetch('https://account.inflite.ai/api/account/today/files/content?id='+committed.id,{headers:{Cookie:kit.accounts().a.cookie,Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','X-Inflite-Files-Owner':kit.accounts().a.owner}}),text=await content.text();assert.match(text,/<gpx /);assert.equal((text.match(/<trkpt /g)||[]).length,points.length);assert.doesNotMatch(text,/BRouter/);
  await command(page,'save workout','Save workout to InFlite Files');await saveAs(page,'Workout export proof.fit');
  committed=t.state.fileRequests.filter(r=>r.action==='content'&&r.method==='PUT'&&r.status===200).at(-1).answer.item;content=await kit.backend().fetch('https://account.inflite.ai/api/account/today/files/content?id='+committed.id,{headers:{Cookie:kit.accounts().a.cookie,Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','X-Inflite-Files-Owner':kit.accounts().a.owner}});const fit=Buffer.from(await content.arrayBuffer());assert.equal(fit.subarray(8,12).toString(),'.FIT');assert.ok(fit.length>50);
  const parser=await page.evaluate(async()=>{
   const{parseGPXRoute}=await import('/fitness/roof/route-files.js'),wrap=(a,b)=>`<gpx>${a||''}<rte>${b||'<rtept lat="52" lon="1"/><rtept lat="52.01" lon="1"/>'}</rte></gpx>`;
   const simple=parseGPXRoute(wrap()),meta=parseGPXRoute(wrap('<metadata><time>2026-11-10T00:00:00Z</time></metadata>'));
   const recorded=parseGPXRoute('<gpx><trk><trkseg><trkpt lat="52" lon="1"><time>2026-11-10T00:00:00Z</time></trkpt><trkpt lat="52.01" lon="1"><time>2026-11-10T00:04:00Z</time></trkpt></trkseg></trk></gpx>');
   const bad=['<html/>','<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx/>',wrap('', '<rtept lon="1"/><rtept lat="52.01" lon="1"/>'),wrap('', '<rtept lat="52" lon="1"/><rtept lat="52.04" lon="1"/>'),'<gpx><trk><trkseg/><trkseg/></trk></gpx>'].map(xml=>{try{parseGPXRoute(xml);return false;}catch{return true;}});
   return{source:simple.source,provider:simple.provider,points:simple.coords.length,meta:!!meta,recorded,bad};
  });assert.deepEqual(parser,{source:'imported-gpx',provider:'Imported GPX',points:2,meta:true,recorded:null,bad:[true,true,true,true,true]});
  await clean(t);
  // Chromium constructs its own detached parsererror document for malformed
  // XML, whose two UA style attributes are blocked by this same strict CSP.
  // All actual app flows above must remain completely violation-free. Keep
  // this negative parser proof separate and verify that no error DOM is used.
  const malformed=await page.evaluate(async()=>{
   const{parseGPXRoute}=await import('/fitness/roof/route-files.js');const before=__osCsp.length;let rejected=false;
   try{parseGPXRoute('<gpx><rte>');}catch{rejected=true;}
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return{rejected,attached:!!document.querySelector('parsererror'),blocked:__osCsp.slice(before)};
  });assert.equal(malformed.rejected,true);assert.equal(malformed.attached,false);assert.ok(malformed.blocked.every(s=>s==='style-src-attr inline'));
 }catch(error){await diagnose(t,'GPX');throw error;}finally{await t.close();}
});

test('Files direct actions attach real bytes in Mail and open Fitness import review without sending or saving',async()=>{
 const account=kit.accounts().a,item=await kit.backend().uploaded(account,'Direct handoff proof.txt','Explicit exact private bytes');
 const gpx='<?xml version="1.0"?><gpx version="1.1"><rte><name>Direct route</name><rtept lat="52" lon="1"/><rtept lat="52.001" lon="1"/></rte></gpx>';
 const route=await kit.backend().uploaded(account,'Direct handoff route.gpx',gpx);const t=await kit.openFiles({width:390}),{page}=t;
 try{
  await kit.action(page,item.name,'Attach in Mail');const compose=sheet(page,'mail-compose');await compose.waitFor();await compose.getByRole('button',{name:'Remove '+item.name,exact:true}).waitFor();
  assert.equal(t.state.mail.sends.length,0);assert.ok(t.state.fileRequests.some(r=>r.action==='content'&&r.method==='GET'&&r.status===200));await compose.locator('[data-close]').click();await compose.waitFor({state:'detached'});
  await kit.goFiles(page);await kit.action(page,route.name,'Import into Fitness');await sheet(page,'fitness-route-import').waitFor();assert.equal(t.state.fileRequests.some(r=>r.action==='fitness-plan'&&r.method==='PUT'),false);assert.equal(t.state.mail.sends.length,0);await clean(t);
 }catch(error){await diagnose(t,'direct-handoff');throw error;}finally{await t.close();}
});
test('reopening Files restores the owner folder reference but never the previous search text',async()=>{
 const t=await kit.openFiles({width:390}),{page}=t;try{
  await kit.folderUI(page,'Reopen private folder');await kit.select(page,'Reopen private folder').click();await page.getByRole('searchbox',{name:'Search Reopen private folder',exact:true}).waitFor();
  const path=new URL(page.url()).hash;assert.match(path,/^#files=[A-Za-z0-9_-]{32}$/);await page.evaluate(()=>dispatchEvent(new Event('pagehide')));
  await page.goto(ORIGIN+'/?os=1',{waitUntil:'domcontentloaded'});await page.getByRole('searchbox',{name:'Search Reopen private folder',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,path);assert.equal(await page.getByRole('searchbox',{name:'Search Reopen private folder',exact:true}).inputValue(),'');await clean(t);
 }catch(error){await diagnose(t,'folder-reopen');throw error;}finally{await t.close();}
});
