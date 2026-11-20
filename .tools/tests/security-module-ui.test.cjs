const {launchApp}=require('./fixtures/launcher.cjs');
// Real Security Module UI, shared sheets, Root proxy and D1/R2 account services.
const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync,mkdirSync}=require('node:fs'),{resolve}=require('node:path'),Module=require('node:module');
const filename=resolve(__dirname,'life410-integration.test.cjs');let source=readFileSync(filename,'utf8');source=source.slice(0,source.indexOf('\ntest('));
source=source.replace('createFilesBackend;','createFilesBackend,securityAPI;').replace(" ({organiseAPI}=", " ({securityAPI}=await import(pathToFileURL(resolve(ROOT,'today/src/security.js'))));\n ({organiseAPI}=").replace("const r=await(url.pathname.startsWith('/api/organise/')?", "const r=await(url.pathname.startsWith('/api/security/')?securityAPI:url.pathname.startsWith('/api/organise/')?").replace('T.ready=true;',"T.security=await(await import('/roof/security-module.js')).createSecurityModule(T.F,{remembered:()=>T.calls.push(['remembered']),calendars:()=>T.calls.push(['calendars'])});document.querySelector('main').append(ui.btn('Open Security Module',{run:()=>T.security.open()}));T.ready=true;");
const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);m._compile(source+'\nmodule.exports={open,dialog,close,backend:()=>backend,account:()=>a,other:()=>b};',filename);const H=m.exports;
const open=async()=>{const t=await H.open();await reset();await t.page.getByRole('button',{name:'Open Security Module',exact:true}).click();await H.dialog(t.page,'Security').getByRole('heading',{name:'Account protection',exact:true}).waitFor();return t};
const card=(page,title)=>H.dialog(page,'Security').locator('.sm-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function mode(page,key,value){await H.dialog(page,'Security').getByRole('radio',{name:'App access',exact:true}).click();await card(page,key).getByRole('button',{name:'Change',exact:true}).click();await H.dialog(page,'App access').getByRole('button',{name:value,exact:true}).click();}
async function reset(){const b=H.backend(),a=H.account();await b.fetch('https://account.inflite.ai/api/account/today/security/permissions',{headers:{Origin:'https://inflite.ai',Cookie:a.cookie,'X-Inflite-Owner':a.owner}});await b.sql('DELETE FROM ifl_security_permissions WHERE user_id=?',[H.account().owner]);await b.sql('UPDATE pg_sessions SET auth_at=? WHERE user_id=?',[Date.now(),H.account().owner]);}
test('Security Module shows actual account checks, app access, sessions and bounded private activity',async()=>{const{ctx,page,errors}=await open();try{await H.dialog(page,'Security').getByText('Verify your email',{exact:true}).waitFor();assert.ok(await H.dialog(page,'Security').getByText('Current',{exact:true}).isVisible());await H.dialog(page,'Security').getByRole('radio',{name:'App access',exact:true}).click();assert.equal(await H.dialog(page,'Security').getByRole('button',{name:'Change',exact:true}).count(),5);await H.dialog(page,'Security').getByRole('radio',{name:'Activity',exact:true}).click();await H.dialog(page,'Security').getByText(/Activity is kept for 30 days/).waitFor();assert.deepEqual(errors,[])}finally{await ctx.close()}});
test('permission changes save to the account and document search waits for explicit one-use approval',async()=>{const{ctx,page,errors}=await open();try{await mode(page,'Search inside documents','Ask each time');await card(page,'Search inside documents').getByText('Ask each time',{exact:true}).waitFor();await H.close(page,'Security');await page.evaluate(()=>{import('/roof/security-client.js').then(m=>m.createSecurityClient(T.F,{prefix:'/api/organise/'}).request('document-search',{method:'POST',body:{q:'secret'}})).then(r=>T.searchDone=r).catch(e=>T.searchError={name:e.name,message:e.message})});await H.dialog(page,'Review access').getByRole('button',{name:'Allow once',exact:true}).waitFor();assert.equal(await page.evaluate(()=>T.searchDone),undefined);await page.getByRole('button',{name:'Allow once',exact:true}).click();await page.waitForFunction(()=>!!T.searchDone||T.searchError);assert.equal(await page.evaluate(()=>T.searchError),undefined);assert.deepEqual(errors,[])}finally{await ctx.close()}});
test('canceling an access prompt releases the pending action without returning search results',async()=>{const{ctx,page}=await open();try{await mode(page,'Search inside documents','Ask each time');await H.close(page,'Security');await page.evaluate(()=>{import('/roof/security-client.js').then(m=>m.createSecurityClient(T.F,{prefix:'/api/organise/'}).request('document-search',{method:'POST',body:{q:'secret'}})).then(r=>T.searchDone=r).catch(e=>T.searchError=e.name)});await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.waitForFunction(()=>T.searchError==='AbortError');assert.equal(await page.evaluate(()=>T.searchDone),undefined)}finally{await ctx.close()}});
test('persistent allow asks for confirmation and an old authentication cannot apply it',async()=>{const{ctx,page}=await open();try{await mode(page,'Search inside documents','Blocked');await H.backend().sql('UPDATE pg_sessions SET auth_at=0 WHERE user_id=?',[H.account().owner]);await card(page,'Search inside documents').getByRole('button',{name:'Change',exact:true}).click();await H.dialog(page,'App access').getByRole('button',{name:'Allowed',exact:true}).click();await H.dialog(page,'Allow search inside documents?').getByRole('button',{name:'Confirm',exact:true}).click();await page.getByRole('button',{name:'Confirm identity',exact:true}).waitFor();const rows=await H.backend().sql('SELECT mode FROM ifl_security_permissions WHERE user_id=? AND capability=?',[H.account().owner,'files.content-search']);assert.equal(rows[0].mode,'block')}finally{await ctx.close();await reset()}});
for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test('Security geometry and controls ' + width + ' ' + theme, async () => {
    const {ctx, page, errors} = await open();
    try {
      await page.setViewportSize({width, height: 900});
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const sheet = H.dialog(page, 'Security');
      for (const section of ['Overview', 'Sign-in', 'App access', 'Activity']) {
        await sheet.getByRole('radio', {name: section, exact: true}).click();
        const probe = await sheet.evaluate(dialog => {
          const bounds = dialog.getBoundingClientRect();
          const tabs = dialog.querySelector('[role=radiogroup]').getBoundingClientRect();
          const card = dialog.querySelector('.sm-hero, .sm-card')?.getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            width: bounds.width,
            sideInsets: [tabs.left - bounds.left, bounds.right - tabs.right],
            cardOffset: card ? card.left - tabs.left : 0,
            bad: [...dialog.querySelectorAll('button, a')].filter(e => {
              const r = e.getBoundingClientRect();
              return r.width && r.height &&
                (r.left < -1 || r.right > innerWidth + 1 || r.height < 43 || parseFloat(getComputedStyle(e).borderRadius) < 10);
            }).map(e => e.textContent)
          };
        });
        assert.equal(probe.overflow, false);
        assert.deepEqual(probe.bad, [], section);
        assert.ok(Math.abs(probe.cardOffset) <= 1, 'cards align with the navigation');
        const inset = width < 700 ? 12 : 18;
        assert.ok(probe.sideInsets.every(value => Math.abs(value - inset) <= 1), 'one side inset: ' + JSON.stringify(probe));
        if (width < 700) assert.ok(Math.abs(probe.width - width) <= 1, 'the sheet uses the phone width');
        else assert.ok(Math.abs(probe.width - 600) <= 1, 'the sheet uses the wider desktop layout');
      }
      if (width === 390 || width === 1440) {
        mkdirSync('/tmp/inflite-security-module/screenshots', {recursive: true});
        await sheet.getByRole('radio', {name: 'Overview', exact: true}).click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({path: '/tmp/inflite-security-module/screenshots/security-' + width + '-' + theme + '.png'});
      }
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}
// Exercise the entry points and retained app lifetime in the actual Root shell.
const hostFilename=resolve(__dirname,'organise400-integration.test.cjs');let hostSource=readFileSync(hostFilename,'utf8');hostSource=hostSource.slice(0,hostSource.indexOf('\ntest(')).replace('async function rootContext(account=c){',"async function rootContext(account=c,initialPath='/?os=1'){").replace("await page.goto(origin+'/?os=1');","await page.goto(origin+initialPath);").replace('createFilesBackend;','createFilesBackend,securityAPI;').replace(' ({organiseAPI}='," ({securityAPI}=await import(pathToFileURL(resolve(ROOT,'today/src/security.js'))));\n ({organiseAPI}=").replace("const r=await(url.pathname.startsWith('/api/organise/')?","const r=await(url.pathname.startsWith('/api/security/')?securityAPI:url.pathname.startsWith('/api/organise/')?");
const hm=new Module(hostFilename);hm.filename=hostFilename;hm.paths=Module._nodeModulePaths(__dirname);hm._compile(hostSource+'\nmodule.exports={rootContext,settled,account:()=>c};',hostFilename);
// The library is now a Home Screen: Security is account-wide; reopening Notes must retain its editor.
test('actual InFlite shell opens Security Module in any app and retains the dock and note draft',async()=>{const{ctx,page,errors}=await hm.exports.rootContext();try{await page.evaluate(()=>InFliteAppearance.accept({appearance:'dark',palette:'coast'}));await launchApp(page,'Notes');await page.locator('#m-notes .org-welcome').waitFor();await page.locator('#m-notes .org-welcome').getByRole('button',{name:'New note',exact:true}).click();await page.getByRole('textbox',{name:'Title',exact:true}).fill('Keep this note while reviewing access');const dock=await page.locator('.ws-dock').boundingBox();await page.getByRole('button',{name:'All apps',exact:true}).click();const launcher=page.locator('dialog[data-sheet=workspace-apps]');await launcher.getByRole('button',{name:'Actions',exact:true}).click();await launcher.getByRole('button',{name:'Security',exact:true}).click();const sheet=H.dialog(page,'Security');await sheet.getByRole('heading',{name:'Account protection',exact:true}).waitFor();await sheet.getByRole('heading',{name:'Security for Notes',exact:true}).waitFor();const box=await sheet.boundingBox();await sheet.getByRole('radio',{name:'App access',exact:true}).click();await hm.exports.settled(page);const other=await sheet.boundingBox();assert.ok(Math.abs(other.y-box.y)<2&&Math.abs(other.height-box.height)<2,'tab switches retain the security window geometry');await sheet.getByRole('radio',{name:'Overview',exact:true}).click();await hm.exports.settled(page);mkdirSync('/tmp/inflite-security-module/screenshots',{recursive:true});if(process.env.WEB_UI_BROWSER!=='webkit')await page.screenshot({path:'/tmp/inflite-security-module/screenshots/security-real-shell.png'});await H.close(page,'Security');await launchApp(page,'Notes');await page.getByRole('textbox',{name:'Title',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Title',exact:true}).inputValue(),'Keep this note while reviewing access');const after=await page.locator('.ws-dock').boundingBox();assert.ok(Math.abs(after.y-dock.y)<2);assert.equal(await page.locator('.ws-dock').count(),1);assert.deepEqual(errors,[])}finally{await ctx.close()}});


test('persistent permission approval saves only after explicit confirmation',async()=>{const{ctx,page}=await open();try{await mode(page,'Search inside documents','Ask each time');await card(page,'Search inside documents').getByRole('button',{name:'Change',exact:true}).click();await H.dialog(page,'App access').getByRole('button',{name:'Allowed',exact:true}).click();await H.dialog(page,'Allow search inside documents?').getByRole('button',{name:'Confirm',exact:true}).click();await card(page,'Search inside documents').getByText('Allowed',{exact:true}).waitFor();const rows=await H.backend().sql('SELECT mode,version FROM ifl_security_permissions WHERE user_id=? AND capability=?',[H.account().owner,'files.content-search']);assert.equal(rows[0].mode,'allow');assert.equal(rows[0].version,2)}finally{await ctx.close()}});
test('account release closes the approval and cannot return private search data',async()=>{const{ctx,page}=await open();try{await mode(page,'Search inside documents','Ask each time');await H.close(page,'Security');await page.evaluate(()=>{import('/roof/security-client.js').then(m=>m.createSecurityClient(T.F,{prefix:'/api/organise/'}).request('document-search',{method:'POST',body:{q:'secret'}})).then(r=>T.searchDone=r).catch(e=>T.searchError=e.name)});await page.getByRole('button',{name:'Allow once',exact:true}).waitFor();await page.evaluate(()=>T.ac.abort());await page.waitForFunction(()=>T.searchError==='AbortError');assert.equal(await page.evaluate(()=>T.searchDone),undefined);assert.equal(await page.getByRole('button',{name:'Allow once',exact:true}).count(),0)}finally{await ctx.close()}});

test('a fresh Security Module deep link opens the real module after shell startup',async()=>{const{ctx,page,errors}=await hm.exports.rootContext(undefined,'/?os=1#you=security');try{await H.dialog(page,'Security').getByRole('heading',{name:'Account protection',exact:true}).waitFor();assert.deepEqual(errors,[])}finally{await ctx.close()}});

test('security navigation stays fixed while content scrolls and each tab retains its position',async()=>{const{ctx,page}=await open();try{await page.setViewportSize({width:390,height:580});const sheet=H.dialog(page,'Security'),panel=sheet.locator('.sm-content'),tabs=sheet.getByRole('radiogroup',{name:'Security section'});await page.waitForFunction(()=>{const n=document.querySelector('[data-sheet=security-module] .sm-content');return n&&n.scrollHeight-n.clientHeight>100});const head=await tabs.boundingBox();await panel.evaluate(n=>n.scrollTop=n.scrollHeight);await page.waitForFunction(()=>document.querySelector('[data-sheet=security-module] .sm-content')?.scrollTop>100);const bottom=await panel.evaluate(n=>n.scrollTop);assert.equal(await sheet.evaluate(n=>n.scrollTop),0);const scrolled=await tabs.boundingBox();assert.ok(Math.abs(scrolled.y-head.y)<1);await sheet.getByRole('radio',{name:'App access',exact:true}).click();assert.equal(await panel.evaluate(n=>n.scrollTop),0);await sheet.getByRole('radio',{name:'Overview',exact:true}).click();assert.ok(Math.abs(await panel.evaluate(n=>n.scrollTop)-bottom)<2);const disclosure=sheet.locator('details');await disclosure.locator('summary').click();assert.equal(await disclosure.getAttribute('open'),'');await disclosure.getByText('Chat uses its existing message encryption.',{exact:true}).waitFor();assert.ok(Math.abs((await tabs.boundingBox()).y-head.y)<1)}finally{await ctx.close()}});
test('reduced motion and keyboard navigation keep a visible usable security selection',async()=>{const{ctx,page}=await open();try{await page.emulateMedia({reducedMotion:'reduce'});const sheet=H.dialog(page,'Security'),overview=sheet.getByRole('radio',{name:'Overview',exact:true});await overview.focus();await page.keyboard.press('ArrowRight');const access=sheet.getByRole('radio',{name:'Sign-in',exact:true});assert.equal(await access.getAttribute('aria-checked'),'true');assert.equal(await access.evaluate(n=>n===document.activeElement),true);assert.equal(await sheet.locator('.sm-content').evaluate(n=>n.getAnimations().filter(a=>a.playState==='running').length),0);await page.keyboard.press('ArrowLeft');assert.equal(await overview.getAttribute('aria-checked'),'true');assert.equal(await overview.evaluate(n=>n===document.activeElement),true)}finally{await ctx.close()}});
test('account checks use one result, human dates and honest missing password status',async()=>{const{ctx,page}=await open();try{const sheet=H.dialog(page,'Security');assert.equal(await sheet.getByText('Checked on this refresh',{exact:true}).count(),0);assert.equal(await sheet.getByText('Checked',{exact:true}).count(),0);await sheet.getByText('No breach check recorded',{exact:true}).waitFor();await H.backend().sql('UPDATE pg_users SET pw_checked_at=?,pw_leaked=0 WHERE id=?',[Date.UTC(2026,10,9,12),H.account().owner]);await sheet.getByRole('button',{name:'Refresh security information',exact:true}).click();await sheet.getByText(/No exposure reported/).waitFor();assert.equal(await sheet.getByText(/2026-11-09/).count(),0);assert.ok(await sheet.getByText(/No exposure reported/).isVisible());await sheet.getByRole('radio',{name:'Sign-in',exact:true}).click();assert.equal(await sheet.getByRole('link',{name:'Export account data'}).getAttribute('href'),'/#settings=account-data');await sheet.getByRole('button',{name:'Remembered devices',exact:true}).click();await page.waitForFunction(()=>T.calls.some(c=>c[0]==='remembered'))}finally{await H.backend().sql('UPDATE pg_users SET pw_checked_at=NULL,pw_leaked=0 WHERE id=?',[H.account().owner]);await ctx.close()}});
test('a failed refresh clears old security assessments and a retry restores live information',async()=>{const{ctx,page}=await open();try{const sheet=H.dialog(page,'Security');await page.route('**/api/security/summary',r=>r.fulfill({status:503,json:{error:'Temporarily unavailable'}}));await sheet.getByRole('button',{name:'Refresh security information',exact:true}).click();await sheet.getByRole('alert').getByText('Security couldn’t refresh',{exact:true}).waitFor();assert.equal(await sheet.getByRole('heading',{name:'Account protection',exact:true}).count(),0);assert.equal(await sheet.locator('.sm-updated').count(),0);await page.unroute('**/api/security/summary');await sheet.getByRole('button',{name:'Retry',exact:true}).click();await sheet.getByRole('heading',{name:'Account protection',exact:true}).waitFor();assert.ok((await sheet.locator('.sm-updated').textContent()).startsWith('Checked '))}finally{await ctx.close()}});
test('saving a permission restores keyboard focus to the updated connection',async()=>{const{ctx,page}=await open();try{await mode(page,'Search inside documents','Ask each time');await page.waitForFunction(()=>{const c=document.querySelector('[data-permission="files.content-search"]');return c?.querySelector('button')===document.activeElement});const button=card(page,'Search inside documents').getByRole('button',{name:'Change',exact:true});await page.keyboard.press('Enter');await H.dialog(page,'App access').getByRole('button',{name:'Allowed',exact:true}).click();await H.dialog(page,'Allow search inside documents?').getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForFunction(()=>{const c=document.querySelector('[data-permission="files.content-search"]');return c?.querySelector('button')===document.activeElement});assert.equal(await button.evaluate(n=>n===document.activeElement),true)}finally{await ctx.close()}});

async function routeAccount(page, account) {
  await page.route('**/account/**', async route => {
    const {pathname} = new URL(route.request().url());
    const assets = {
      '/account/app.js': 'account/app.js',
      '/account/styles.css': 'account/styles.css',
      '/account/identity-location.js': 'account/identity-location.js',
      '/account/auth-frame.js': 'account/auth-frame.js',
      '/account/crypto.js': 'pigeon/crypto.js'
    };
    if (Object.hasOwn(assets, pathname)) {
      return route.fulfill({
        path: resolve(__dirname, '../..', assets[pathname]),
        contentType: pathname.endsWith('.js') ? 'text/javascript' : 'text/css'
      });
    }
    if (pathname === '/account/api/account/me') {
      assert.equal(route.request().headers()['x-inflite-owner'], account.owner);
      return route.fulfill({json:{
        signedIn:true, id:account.owner, name:'Review User', handle:'review-user',
        email:'review@example.test', emailOk:false, prefs:{appearance:'system'},
        passkeys:[], devices:[], password:{leaked:null}
      }});
    }
    return route.fallback();
  });
}

test('Settings has one Security entry and sign-in forms return to the active Security tab', async () => {
  const host = hm.exports;
  const {ctx,page,errors} = await host.rootContext();
  page.setDefaultTimeout(10000);
  try {
    await routeAccount(page, host.account());
    await page.evaluate(() => { location.hash = 'settings=account'; });
    const account = page.locator('inflite-settings-account .account-detail');
    const entry = account.locator('button[data-k="Security"]');
    await entry.waitFor();
    assert.equal(await entry.count(), 1);
    assert.equal(await account.getByRole('button', { name:/Security Module|Sign-in and security/ }).count(), 0);
    await entry.click();
    const security = H.dialog(page, 'Security');
    await security.getByRole('heading', {name:'Account protection',exact:true}).waitFor();
    await security.getByRole('radio', {name:'Sign-in',exact:true}).click();
    const recovery = security.getByRole('button', {name:/Recovery email/});
    await recovery.click();
    const email = page.getByRole('dialog', {name:'Email',exact:true});
    await email.getByRole('textbox', {name:'New email',exact:true}).waitFor();
    await email.getByRole('button', {name:'Back',exact:true}).click();
    await email.waitFor({state:'hidden'});
    assert.equal(await security.getByRole('radio', {name:'Sign-in',exact:true}).getAttribute('aria-checked'), 'true');
    assert.equal(new URL(page.url()).hash, '#settings=account');
    await security.getByRole('radio', {name:'App access',exact:true}).click();
    await security.getByRole('heading', {name:'App access',exact:true}).waitFor();
    await H.close(page, 'Security');
    await page.evaluate(() => { location.hash = 'settings=account-security'; });
    await security.getByRole('heading', {name:'Account protection',exact:true}).waitFor();
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('reauthentication opens inside Security and backing out leaves permission unchanged', async () => {
  const {ctx,page,errors} = await open();
  page.setDefaultTimeout(10000);
  try {
    await routeAccount(page, H.account());
    await mode(page, 'Search inside documents', 'Blocked');
    await H.backend().sql('UPDATE pg_sessions SET auth_at=0 WHERE user_id=?', [H.account().owner]);
    await card(page, 'Search inside documents').getByRole('button', {name:'Change',exact:true}).click();
    await H.dialog(page, 'App access').getByRole('button', {name:'Allowed',exact:true}).click();
    const confirmation = H.dialog(page, 'Allow search inside documents?');
    await confirmation.getByRole('button', {name:'Confirm',exact:true}).click();
    const verify = confirmation.getByRole('button', {name:'Confirm identity',exact:true});
    await verify.click();
    const reauth = page.getByRole('dialog', {name:'Confirm it’s you',exact:true});
    await reauth.getByLabel('Password', {exact:true}).waitFor();
    await reauth.getByRole('button', {name:'Back',exact:true}).click();
    await reauth.waitFor({state:'hidden'});
    assert.ok(await verify.isVisible());
    assert.equal(await verify.evaluate(node => node === document.activeElement), true);
    const rows = await H.backend().sql('SELECT mode FROM ifl_security_permissions WHERE user_id=? AND capability=?', [H.account().owner,'files.content-search']);
    assert.equal(rows[0].mode, 'block');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); await reset(); }
});
