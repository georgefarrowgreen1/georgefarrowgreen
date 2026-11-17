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
const {launchApp:app}=require('./fixtures/launcher.cjs');
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
test('cold account search opens native Mail and unlocked Chat results without retaining private snippets',async()=>{
 const t=await env.open({width:390,initialPath:'/?os=1',ready:'home'}),{page}=t;try{
  const field=page.getByRole('combobox',{name:'Search everything',exact:true});await page.keyboard.press('Control+k');await field.waitFor();await field.fill('Glass explorations');
  const result=page.getByRole('option').filter({hasText:'Liquid Glass explorations'});await result.first().waitFor();await result.first().click();await page.waitForFunction(()=>location.pathname==='/mail/'&&location.hash.startsWith('#thread='));await page.locator('#m-mail .ml-reader').waitFor();
  assert.equal((await page.evaluate(()=>localStorage.getItem('ifl:recent')||'')).includes('Liquid Glass explorations'),false);
  await page.keyboard.press('Control+k');await field.waitFor();await field.fill('Pat');const person=page.getByRole('option').filter({hasText:'Pat Jones'});await person.first().waitFor();await person.first().click();await page.waitForFunction(()=>location.pathname==='/chats/'&&location.hash.startsWith('#open='));await page.locator('#m-chats .ch-input').waitFor();
  assert.equal((await page.evaluate(()=>localStorage.getItem('ifl:recent')||'')).includes('Pat Jones'),false);assert.equal(t.state.mail.sends.length,0);await env.assertNoChatSends(page);await t.clean();
 }finally{await t.ctx.close()}
});

for (const width of [390,1440]) test(`Settings opens native app preferences and returns to the same category at ${width}px`, async () => {
  const t = await env.open({width, initialPath:'/?os=1', ready:'home'});
  const {page} = t;
  try {
    await app(page,'Chats');
    await page.locator('#m-chats .ch-row').first().waitFor();
    await page.getByRole('button',{name:'Chat Settings',exact:true}).click();
    const chat = page.locator('dialog[open][data-sheet="chatsettings"]');
    await chat.waitFor();
    assert.equal(new URL(page.url()).hash,'#settings=chats');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => location.hash === '#settings=apps');
    await page.locator('[data-setting=weather]').waitFor();
    assert.equal(await page.locator('.ws-sidebar-button[data-ws-action=settings]').getAttribute('aria-current'),'page');
    if (process.env.SETTINGS_SCREENSHOTS) {
      await page.waitForFunction(() => !document.documentElement.dataset.vt && !document.querySelector('.ifl-screen[class*="ifl-enter-"]'));
      await page.screenshot({path:resolve(process.env.SETTINGS_SCREENSHOTS,`apps-${width}.png`),caret:'initial'});
    }
    for (const [key,sheet] of [['weather','wxsettings'],['fitness','fxsettings'],['markets','market-preferences'],['chats','chatsettings'],['mail','mail-settings']]) {
      await page.locator('[data-setting="'+key+'"]').click();
      const panel = page.locator('dialog[open][data-sheet="'+sheet+'"]');
      await panel.waitFor({timeout:6500});
      if (key === 'markets') {
        const live = panel.getByRole('switch',{name:'Live prices'});
        const was = await live.isChecked();
        await live.click();
        assert.notEqual(await live.isChecked(),was);
      }
      await page.keyboard.press('Escape');
      await panel.waitFor({state:'hidden'});
      assert.equal(new URL(page.url()).hash,'#settings=apps');
    }
    const search = page.getByRole('searchbox',{name:'Search settings'});
    await search.fill('solar panels');
    await page.getByRole('button',{name:'Solar panels Weather'}).click();
    const solar = page.locator('dialog[open][data-sheet=wxsettings]');
    await solar.getByRole('heading',{name:'Solar',exact:true}).waitFor();
    await solar.getByRole('button',{name:'Close',exact:true}).click();
    await search.fill('');
    await page.evaluate(() => { location.hash = 'settings=markets'; });
    const markets = page.locator('dialog[open][data-sheet=market-preferences]');
    await markets.getByRole('link',{name:'Price alerts and evening wrap'}).click();
    await page.locator('[data-group=notifications]').waitFor();
    assert.equal(new URL(page.url()).hash,'#settings=notifications');
    await env.assertNoChatSends(page);
    await t.clean();
  } finally { await t.ctx.close(); }
});

for (const width of [390,1440]) test(`Account stays inside Settings at ${width}px`, async () => {
  const t = await env.open({width,initialPath:'/?os=1',ready:'home'});
  const {page} = t;
  try {
    let loads = 0;
    await page.route('**/settings/account/?embed=1', route => {
      loads++;
      return route.fulfill({contentType:'text/html',body:'<label>Profile name <input></label>'});
    });
    await page.evaluate(() => { window.shellBeforeAccount = document; location.hash = 'settings'; });
    await page.locator('#youAcct').click();
    const pane = page.frameLocator('iframe[title="Account"]');
    await pane.getByLabel('Profile name').fill('Draft name');
    assert.equal(await page.evaluate(() => document === window.shellBeforeAccount),true);
    assert.equal(new URL(page.url()).hash,'#settings=account');
    assert.equal(await page.locator('.settings-back').isVisible(),width<900);
    assert.equal(await page.locator('#you nav[aria-label="Settings categories"]').isVisible(),width>=900);
    assert.equal(await page.locator(width<900 ? '.ws-dock:visible' : '.ws-sidebar-button[data-ws-action=settings]:visible').count()>0,true);
    if (width<900) {
      const bar = page.locator('.settings-account-bar');
      assert.equal(await bar.getByRole('heading',{name:'Account & security'}).isVisible(),true);
      assert.equal(await page.locator('#hd .ifh').isVisible(),false);
      const header = await bar.boundingBox(), frame = await page.locator('.settings-account-frame').boundingBox();
      assert.ok(header.height >= 44 && frame.y - header.y <= header.height + 12);
      const dock = await page.locator('.ws-dock:visible').boundingBox();
      assert.ok(frame.y + frame.height <= dock.y + 1, JSON.stringify({frame,dock}));
      await bar.getByRole('button',{name:'Search'}).click();
      await page.getByRole('combobox',{name:'Search everything'}).waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.settings-back').click();
      await page.locator('#hd .ifh').waitFor();
    }
    else await page.locator('#you [data-category=apps]').click();
    await page.locator('.settings-account-frame').waitFor({state:'detached'});
    await page.locator('#you [data-category=account]').click();
    await pane.getByLabel('Profile name').waitFor();
    assert.equal(loads,2);
    t.state.view.user.name = 'Updated Profile';
    await page.locator('.settings-account-frame').evaluate(frame => frame.dispatchEvent(new Event('inflite-profile-updated')));
    await page.locator('#youAcct').getByText('Updated Profile',{exact:true}).waitFor({state:'attached'});
    assert.equal(loads,2,'profile refresh keeps the current editor mounted');
    assert.equal(await page.evaluate(()=>document === window.shellBeforeAccount && document.documentElement.scrollWidth <= innerWidth + 1),true);
    await t.clean();
  } finally { await t.ctx.close(); }
});
