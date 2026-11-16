// Real Root boot and all five native apps, replacing retired grouped-window flows.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {Module}=require('node:module'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
let env,IDs;
before(async()=>{
 ({IDS:IDs}=await import('./unit/fixtures/chats.mjs'));
 const filename=resolve(__dirname,'os-v2-integration.test.cjs'),m=new Module(filename);
 m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);const original=m.require.bind(m);let start,stop;
 m.require=id=>id==='node:test'?{test(){},before(fn){start=fn},after(fn){stop=fn}}:original(id);
 m._compile(readFileSync(filename,'utf8')+'\nmodule.exports={open:(...args)=>env.open(...args),createAll,sameRoots,assertNoChatSends};',filename);
 env={...m.exports,stop};await start();
});
after(async()=>env?.stop());
const app=(page,name)=>page.locator('.ws-dock').getByRole('button',{name,exact:true}).click();
for(const width of [390,1440])test(`five native apps retain their singleton views and Chat draft at ${width}px`,async()=>{
 const t=await env.open({width,initialPath:'/?os=1',ready:'home'});const{page}=t;
 try{
  assert.equal(await page.getByRole('button',{name:/workspace|sync/i}).count(),0);
  await env.createAll(page,t.state);assert.equal(await env.sameRoots(page),true);
  await app(page,'Chats');await page.locator('#m-chats .ch-row[data-id="'+IDs.pat+'"]').click();
  const input=page.locator('#m-chats .ch-input');await input.waitFor();await input.fill('Private native draft');
  await page.getByRole('button',{name:'Back to Chats',exact:true}).click();
  await app(page,'Weather');await page.locator('#m-weather [data-card=hourly]').waitFor();
  await app(page,'Chats');await page.locator('#m-chats .ch-row[data-id="'+IDs.pat+'"]').click();await input.waitFor();await page.waitForFunction(()=>document.querySelector('#m-chats .ch-input')?.value==='Private native draft');assert.equal(await input.inputValue(),'Private native draft');
  await page.getByRole('button',{name:'Back to Chats',exact:true}).click();
  await app(page,'Fitness');await page.getByRole('tab',{name:'Progress',exact:true}).click();
  await page.locator('#m-fitness .fx-sec[data-sec=progress]:not([hidden])').waitFor();
  await app(page,'Mail');await page.locator('#m-mail .ml-row').first().waitFor();
  await app(page,'Fitness');await page.locator('#m-fitness .fx-sec[data-sec=progress]:not([hidden])').waitFor();
  assert.equal(await env.sameRoots(page),true);assert.equal(await page.locator('.ws-ride:visible').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await env.assertNoChatSends(page);assert.equal(t.state.mail.sends.length,0);assert.deepEqual(t.state.routeWrites,[]);await t.clean();
 }finally{await t.ctx.close()}
});
test('a saved workspace bookmark returns home without adopting another account’s layout',async()=>{
 const t=await env.open({mode:{legacy:true},initialPath:'/?os=1#workspace=legacy',ready:'home'});
 try{
  assert.equal(await t.page.locator('#workspace').getAttribute('data-mode'),'today');
  assert.equal(await t.page.getByRole('button',{name:/workspace|sync/i}).count(),0);
  assert.equal(await t.page.getByText('Other account private workspace',{exact:true}).count(),0);
  const stored=await t.page.evaluate(id=>JSON.parse(localStorage.getItem('ifl:workspace:v1:'+id)),t.state.view.user.id);
  assert.equal(stored.workspaces[0].name,'Legacy <img src=x>');
  await t.clean();
 }finally{await t.ctx.close()}
});

async function command(page,query,title){const field=page.getByRole('combobox',{name:'Search everything',exact:true});await page.keyboard.press('Control+k');await field.waitFor();await field.fill(query);await page.getByRole('option').filter({hasText:title}).first().click();}
test('a fresh document restores the verified owner’s last section, explicit links win and a new account starts at home',async()=>{
 const t=await env.open({width:390,initialPath:'/?os=1',ready:'home'});let page=t.page;const errors=[];
 // A closed/reopened tab avoids WebKit routing old-document resource-abort
 // diagnostics into a reused Page. Every new document still checks JS/CSP.
 async function reopen(path){const old=page;await old.evaluate(()=>dispatchEvent(new Event('pagehide')));page=await t.ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>{if(!page.isClosed())errors.push(e.message)});await old.close();await page.goto('http://os.ifl.test:8788'+path,{waitUntil:'domcontentloaded'});}
 try{
  await app(page,'Fitness');await page.getByRole('tab',{name:'Progress',exact:true}).click();await page.locator('#m-fitness .fx-sec[data-sec=progress]:not([hidden])').waitFor();
  await page.evaluate(()=>dispatchEvent(new Event('pagehide')));const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('ifl:resume:v1:'+id)),t.state.view.user.id);assert.equal(saved.target.path,'/fitness/#progress');
  let release;const gate=new Promise(r=>release=r);await t.ctx.route('**/api/session',async r=>{await gate;await r.fallback()});
  await reopen('/?os=1');assert.equal(await page.locator('.ws-dock:visible').count(),0,'no restored app before verification');release();
  await page.locator('#m-fitness .fx-sec[data-sec=progress]:not([hidden])').waitFor();
  await t.ctx.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6r4sAAAAASUVORK5CYII=','base64')}));
  await reopen('/weather/?os=1#radar');await page.locator('#m-weather .wx-sec[data-sec=radar]:not([hidden])').waitFor();await page.waitForLoadState('networkidle');
  t.state.view.user.id='another-owner';await reopen('/?os=1');await page.locator('.ifl-workspace[data-mode=today]').waitFor();assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('#m-weather:visible').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>[__osCsp,__osRejected]),[[],[]]);assert.deepEqual(t.state.unknown,[]);
 }finally{await t.ctx.close()}
});
test('explicit saved ride opens Weather and a forecast opens a Mail draft without writes or sending',async()=>{
 const t=await env.open({width:390,initialPath:'/?os=1',ready:'home'}),{page}=t;
 try{
  await app(page,'Fitness');await page.locator('#m-fitness .week-overview').waitFor();await command(page,'check saved route weather','Check saved route weather');
  const banner=page.locator('#m-weather [aria-label="Ride forecast"]');await banner.waitFor();assert.match(await banner.innerText(),/Start of QA <route> & London loop/);
  await page.locator('#m-weather .wx-now .t').waitFor();await page.getByRole('button',{name:'Draft forecast in Mail',exact:true}).click();
  const compose=page.locator('dialog[data-sheet=mail-compose][open]');await compose.waitFor();const text=await compose.locator('textarea').inputValue();assert.match(text,/Forecast from InFlite Weather|Rain|London|Start of/);
  assert.equal(await compose.getByRole('textbox',{name:'To',exact:true}).inputValue(),'');assert.equal(t.state.mail.sends.length,0);assert.deepEqual(t.state.routeWrites,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await t.clean();
 }catch(error){console.log('HANDOFF DIAGNOSTIC',JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,4000),errors:t.errors,unknown:t.state.unknown,rejected:await page.evaluate(()=>__osRejected)}));throw error;}finally{await t.ctx.close()}
});
test('Mail preserves the newest words immediately on page suspension and offers review after reopening',async()=>{
 const t=await env.open({width:390,initialPath:'/?os=1',ready:'home'}),{page}=t;
 try{
  await app(page,'Mail');await page.locator('#m-mail .ml-row').first().waitFor();await page.getByRole('button',{name:'Write',exact:true}).click();
  const compose=page.locator('dialog[data-sheet=mail-compose][open]');await compose.waitFor();await compose.locator('textarea').fill('Newest unsent words before debounce');
  await page.evaluate(()=>dispatchEvent(new Event('pagehide')));assert.match(await page.evaluate(()=>localStorage.getItem('mail:unsent')),/Newest unsent words before debounce/);
  await page.goto('http://os.ifl.test:8788/?os=1',{waitUntil:'domcontentloaded'});const banner=page.locator('#m-mail .ml-resume-draft');await banner.waitFor();await banner.getByRole('button',{name:'Continue',exact:true}).click();
  await compose.waitFor();assert.equal(await compose.locator('textarea').inputValue(),'Newest unsent words before debounce');assert.equal(t.state.mail.sends.length,0);await t.clean();
 }finally{await t.ctx.close()}
});
test('cold Weather renders while its optional bridge is held, and boot does not request the file picker',async()=>{
 const t=await env.open({width:390,initialPath:'/?os=1',ready:'home'}),{page}=t;let release;
 try{
  assert.equal(t.state.fileReads.includes('/roof/files-dialogs.js'),false);let bridgeRequested=false;const gate=new Promise(r=>release=r);
  await t.ctx.route('**/weather/roof/workspace.js*',async r=>{bridgeRequested=true;await gate;await r.fallback()});
  await app(page,'Weather');await page.locator('#m-weather .wx-now .t').waitFor();assert.equal(bridgeRequested,true);assert.equal(t.state.fileReads.includes('/weather/roof/workspace.js'),false,'bridge remains blocked while forecast is usable');release();
  await page.getByRole('button',{name:'Draft forecast in Mail',exact:true}).waitFor();await t.ctx.setOffline(true);await page.getByRole('status').filter({hasText:'You’re offline · Current content available'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await t.ctx.setOffline(false);await page.locator('.ws-connection').waitFor({state:'hidden'});await t.clean();
 }finally{release?.();await t.ctx.close()}
});

test('desktop Mail restores the visible conversation even when its address shows the list',async()=>{
 const t=await env.open({width:1440,initialPath:'/?os=1',ready:'home'}),{page}=t;
 try{
  await app(page,'Mail');await page.locator('#m-mail .ml-row').first().waitFor();await page.locator('#m-mail .ml-row').first().click();await page.locator('#m-mail .ml-reader:not([hidden])').waitFor();
  await page.evaluate(()=>dispatchEvent(new Event('pagehide')));const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('ifl:resume:v1:'+id)),t.state.view.user.id);assert.match(saved.target.path,/^\/mail\/#thread=[A-Za-z0-9_-]+$/);
  await page.goto('http://os.ifl.test:8788/?os=1',{waitUntil:'domcontentloaded'});await page.locator('#m-mail .ml-reader:not([hidden])').waitFor();assert.equal(t.state.mail.sends.length,0);await t.clean();
 }finally{await t.ctx.close()}
});
