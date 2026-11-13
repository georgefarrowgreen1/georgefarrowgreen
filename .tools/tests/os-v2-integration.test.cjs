// Real Root boot/frame/controller and all five real app modules. Only network
// transports and the Chats Worker RPC boundary use existing account fixtures;
// no pane, editor, app store, chart, Files or window implementation is replaced.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('node:module');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const ROOT = resolve(__dirname, '../..'), IFL = resolve(ROOT, '../inflite');
const ORIGIN = 'http://os.ifl.test:8788', MAIL = 'http://email.ifl.test:8788';
const APPS = ['fitness', 'weather', 'markets', 'chats', 'mail'];
let env, marketFixtures, mailMock, IDS;

before(async () => {
  marketFixtures = await import('./unit/fixtures/mk.mjs');
  ({ IDS } = await import('./unit/fixtures/chats.mjs'));
  // Same demo transport used by Mail's native tests, at the origin explicitly
  // permitted by the unmodified production CSP.
  const mailSource = readFileSync(resolve(__dirname, 'mocks/mailmock.mjs'), 'utf8').replace("export const MAIL_KIT = 'http://email.kit.test';", `export const MAIL_KIT = '${MAIL}';`);
  ({ mailMock } = await import('data:text/javascript;base64,' + Buffer.from(mailSource).toString('base64')));
  const filename = resolve(__dirname, 'workspace-integration.test.cjs'), m = new Module(filename);
  m.filename = filename; m.paths = Module._nodeModulePaths(__dirname);
  let start, stop; const originalRequire = m.require.bind(m);
  m.require = id => id === 'node:test' ? { test() {}, before(fn) { start = fn; }, after(fn) { stop = fn; } } : originalRequire(id);
  // Extend only the existing transport harness; all app source bytes are served
  // directly from disk, under the actual Root response policy.
  const source = readFileSync(filename, 'utf8')
    .replace("const ORIGIN = 'http://os.test'", `const ORIGIN = '${ORIGIN}'`)
    .replace('markets: false, chats: false, mail: false', 'markets: true, chats: true, mail: true')
    .replace('const page = await ctx.newPage(), errors = [];', 'await module.augment(ctx,state,j); const page = await ctx.newPage(), errors = [];');
  m.augment = augment; m._compile(source + '\nmodule.exports={open};', filename);
  env = { open: m.exports.open, stop: () => stop() }; await start();
});
after(async () => env?.stop());

async function augment(ctx, state, json) {
  if(state.mode.legacy) await ctx.addInitScript(userId=>{
    localStorage.setItem('ifl:workspace:v1:'+userId,JSON.stringify({version:1,userId,activeId:'legacy',body:'private legacy domain payload',workspaces:[{id:'legacy',name:'Legacy <img src=x>',activePane:'weather',panes:[{app:'fitness',route:'/fitness/#today',body:'not layout data'},{app:'weather',route:'/weather/#now'}],coordinates:[51.5,-.1],updatedAt:1}]}));
    localStorage.setItem('ifl:workspace:v2:other-owner',JSON.stringify({version:2,userId:'other-owner',activeId:'foreign',workspaces:[{id:'foreign',name:'Other account private workspace',panes:[{app:'mail',route:'/mail/'}],activePane:'mail'}]}));
  },state.view.user.id);
  const account = marketFixtures.account(Date.UTC(2026, 10, 10, 10)); account.id = state.view.user.id;
  const api = marketFixtures.marketsApi({ acc: account }); state.marketWrites = [];
  await ctx.route(ORIGIN + '/api/markets/**', async r => {
    const req = r.request(); if (req.method() !== 'GET') state.marketWrites.push(req.url());
    if (new URL(req.url()).pathname.endsWith('/chart')) {
      const t = Math.floor(Date.now() / 1000); return json(r, { t: [t - 2592000, t - 1296000, t], c: [2.9, 3, 3.12], prev: 3.05, cur: 'GBP', tz: 'Europe/London' });
    }
    const value = await api.fetch(req.url(), { method: req.method(), body: req.postData() }); return json(r, await value.json(), value.ok ? 200 : 404);
  });
  state.mail = mailMock({ origin: ORIGIN, now: Date.UTC(2026, 10, 10, 10) });
  await ctx.route(MAIL + '/**', state.mail.handle);
  let core = readFileSync(resolve(__dirname, 'roofkit/chatcore-stub.js'), 'utf8').replace('"__KIT_STATE__"', '"ready"')
    .replace('const calls = (self.kitCalls = {});', 'const calls = (self.kitCalls = {}), drafts = new Map();')
    .replace('const c = chatOf(id); patch', 'const c = { ...chatOf(id), draft: drafts.get(id) || "" }; patch')
    .replace('draft: () => ({ ok: true })', 'draft: (id, text) => { drafts.set(id, text); return { ok: true }; }');
  await ctx.route(ORIGIN + '/kit/fixtures/chats.mjs', r => r.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(__dirname, 'unit/fixtures/chats.mjs')) }));
  await ctx.route(ORIGIN + '/chats/roof/core.js*', r => r.fulfill({ contentType: 'text/javascript', body: core }));
  await ctx.route(/\/((?:markets|chats|mail))\//, r => {
    const u = new URL(r.request().url()), p = u.pathname;
    if (u.origin !== ORIGIN) return r.fallback();
    const [, app, tail] = /^\/(markets|chats|mail)\/(.*)$/.exec(p) || [];
    if (!tail || tail === 'index.html' || (app === 'chats' && tail === 'roof/core.js')) return r.fallback();
    const home = app === 'mail' ? resolve(IFL, 'email/public') : resolve(ROOT, app === 'chats' ? 'pigeon' : app);
    if (tail === 'version') return json(r, { build: /^export const BUILD = "([^"]+)"/m.exec(readFileSync(resolve(home, `roof/${app}.js`), 'utf8'))?.[1] || null });
    const file = resolve(home, tail);
    if (!file.startsWith(home + '/') || !existsSync(file)) { state.unknown.push(p); return r.fulfill({ status: 404, body: '' }); }
    state.fileReads.push(p);
    return r.fulfill({ contentType: ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
  });
  await ctx.addInitScript(chatId => {
    if (window !== window.top) return;
    // Device notification-log transport only. The actual Bell and its action
    // resolver dispatch into the actual mounted apps and native editors.
    const sw = new EventTarget(), notes = window.__notes = [
      { id: 'chat-note', app: 'chat', title: 'Message from Pat', body: 'Private sample', url: '/chats/#open='+chatId, at: Date.now(), seen: false },
      { id: 'ride-note', app: 'fitness', title: 'Your ride', body: 'Ready to plan', url: '/fitness/#today', at: Date.now()-1000, seen: false }
    ];
    window.__noteRequests = [];
    sw.register = async () => null; sw.ready = new Promise(() => {});
    sw.getRegistration = async () => ({ active: { postMessage(msg, ports) {
      __noteRequests.push(msg);
      if (msg.ifl === 'notes-seen') for (const n of notes) n.seen = true;
      if (msg.ifl === 'notes-clear') for (let i=notes.length-1;i>=0;i--) if (msg.all || msg.ids?.includes(notes[i].id)) notes.splice(i,1);
      queueMicrotask(() => ports?.[0]?.postMessage({ ifl: 'notes', list: notes.slice(), unread: notes.filter(n=>!n.seen).length }));
    } } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  }, IDS.pat);
}

const pane = (page, app) => page.locator(`.ifl-workspace-pane[data-pane="${app}"]`);
async function settled(page) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function createAll(page, state) {
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New workspace', exact: true });
  await sheet.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('All five apps');
  for (const app of ['Markets', 'Chats', 'Mail']) await sheet.getByRole('checkbox', { name: app, exact: true }).check();
  await sheet.getByRole('button', { name: 'Create workspace', exact: true }).click();
  // Offscreen tiled windows deliberately suspend their native view. Scroll the
  // actual grid before requiring that app to finish its real mount.
  for (const app of APPS) {
    await pane(page, app).scrollIntoViewIfNeeded(); await settled(page);
    await pane(page, app).locator('#m-' + app).waitFor();
    if (app === 'markets') try { await pane(page, app).locator('.pchart path[data-draw]').waitFor(); }
    catch (e) { console.log('MARKETS MOUNT', state?.unknown, state?.fileReads.filter(p=>p.includes('markets')), await pane(page, app).innerText(), await page.evaluate(()=>[__osCsp,__osRejected])); throw e; }
    if (app === 'mail') await pane(page, app).locator('.ml-row').first().waitFor();
  }
  await pane(page, 'mail').locator('.ml-row').first().waitFor();
  await page.evaluate(apps => window.__allRoots = Object.fromEntries(apps.map(app => [app, document.getElementById('m-' + app)])), APPS);
}
const sameRoots = page => page.evaluate(() => Object.entries(__allRoots).every(([app, el]) => el === document.getElementById('m-' + app) && document.querySelectorAll('#m-' + app).length === 1));
async function assertNoChatSends(page) {
  // Observe the existing RPC transport fixture without subclassing the native
  // Worker constructor or changing its navigation/termination behavior.
  const workers=page.workers().filter(w=>new URL(w.url()).pathname==='/chats/roof/core.js');
  assert.equal(workers.length,1,'one actual desktop OS Chat service owns the RPC Worker');
  const calls=await workers[0].evaluate(()=>self.kitCalls);
  for(const method of ['sendText','sendBlob','sendRun']) assert.equal(calls[method]||0,0,method+' requires an explicit send action');
}
async function windowMenu(page, app, item) {
  await page.getByRole('button', { name: 'Open windows', exact: true }).click();
  await page.getByRole('menuitem', { name: `Switch to ${app[0].toUpperCase()+app.slice(1)}`, exact: true }).click();
  await pane(page, app).getByRole('button', { name: `${app[0].toUpperCase()+app.slice(1)} window options`, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('five real apps share one saved workspace and survive floating, snap, minimise, native expansion and reload', async () => {
  const t = await env.open(); const { page } = t;
  try {
    await createAll(page, t.state); assert.equal(await sameRoots(page), true);
    assert.equal(await page.locator('.ifl-workspace-pane:visible').count(), 5);
    await page.getByRole('button', { name: 'Float windows', exact: true }).click();
    await windowMenu(page, 'markets', 'Snap right');
    const bounds = await pane(page, 'markets').boundingBox(); assert.ok(bounds.width > 350);
    await windowMenu(page, 'markets', 'Minimise');
    assert.equal(await pane(page, 'markets').isHidden(), true);
    await page.getByRole('button', { name: 'Open windows', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore Markets', exact: true }).click();
    await pane(page, 'markets').waitFor({ state: 'visible' }); assert.equal(await sameRoots(page), true);
    await windowMenu(page,'markets','Restore size');
    const title=await pane(page,'markets').locator('.ws-pane-title').boundingBox(),beforeMove=await pane(page,'markets').boundingBox();
    await page.mouse.move(title.x+12,title.y+10);await page.mouse.down();await page.mouse.move(title.x+42,title.y+30,{steps:4});await page.mouse.up();await settled(page);
    const moved=await pane(page,'markets').boundingBox();assert.ok(moved.x>beforeMove.x+20&&moved.y>beforeMove.y+10,'real populated window follows its title drag');
    const corner=await pane(page,'markets').locator('.ws-resize-handle').boundingBox();
    await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();await page.mouse.move(corner.x+corner.width/2-32,corner.y+corner.height/2-24,{steps:4});await page.mouse.up();await settled(page);
    const resized=await pane(page,'markets').boundingBox();assert.ok(resized.width<moved.width-20&&resized.height<moved.height-12,'native content survives actual pointer resize');
    await pane(page,'markets').locator('.pseg button[data-r="1mo"]').click();
    await page.waitForFunction(()=>document.querySelector('#m-markets .pseg [aria-pressed=true]')?.dataset.r==='1mo');
    const chart = pane(page, 'markets').locator('.pchart path[data-draw]'); assert.doesNotMatch(await chart.getAttribute('d'), /NaN|Infinity/);
    await pane(page, 'markets').getByRole('button', { name: 'Open Markets', exact: true }).click();
    await page.locator('#views > #m-markets').waitFor();
    assert.equal(await page.evaluate(() => __allRoots.markets === document.getElementById('m-markets')), true, 'native app reuses its existing root; other hidden views may detach');
    await page.goBack();
    await pane(page, 'markets').locator('#m-markets').waitFor(); assert.equal(await sameRoots(page), true);
    await page.waitForFunction(()=>document.querySelector('#m-markets .pseg [aria-pressed=true]')?.dataset.r==='1mo');
    assert.equal(await pane(page,'markets').locator('.pseg [aria-pressed=true]').getAttribute('data-r'),'1mo');
    const saved = await page.evaluate(() => Object.keys(localStorage).filter(k=>k.startsWith('ifl:workspace:v2:')).map(k=>JSON.parse(localStorage.getItem(k))));
    assert.equal(saved.length, 1); assert.equal(saved[0].workspaces.find(w=>w.name==='All five apps').panes.length, 5);
    assert.equal(saved[0].workspaces.find(w=>w.name==='All five apps').layout.mode, 'float');
    assert.doesNotMatch(JSON.stringify(saved), /maya@|Private sample|51\.5072|QA <route>|2\.9/);
    await page.reload(); await pane(page, 'mail').locator('.ml-row').first().waitFor();
    for (const app of APPS) assert.equal(await page.locator('#m-'+app).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Tile windows', exact: true }).isVisible(), true);
    await page.getByRole('button',{name:'Tile windows',exact:true}).click();await pane(page,'mail').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{const root=document.querySelector('#m-mail .m-mail');return root&&root.getBoundingClientRect().height>100;});
    assert.ok((await pane(page,'mail').locator('.m-mail').boundingBox()).height>100,'wide Mail retains usable content height when changing from floating to tiled panes');
    assert.deepEqual(t.state.marketWrites, []); assert.equal(t.state.mail.sends.length, 0); await t.clean();
  } finally { await t.ctx.close(); }
});

test('OS search reaches the actual native Fitness chooser from a cold Today screen without an account write', async () => {
  for(let attempt=0;attempt<3;attempt++) {
    const t = await env.open({ initialPath: '/?os=1#workspace', ready: 'home' });
    try {
      // Files now uploads private Drive objects. The existing native Fitness
      // import remains an app action: wake it through the actual OS command UI
      // and activate the header's genuine file picker in the next user tap.
      await t.page.keyboard.press('Control+k');
      const query=t.page.getByRole('combobox',{name:'Search everything',exact:true});
      await query.fill('open fitness');
      await t.page.getByRole('option').filter({hasText:/^Open Fitness/}).first().click();
      await t.page.locator('#views > #m-fitness').waitFor();
      const chooser=t.page.waitForEvent('filechooser',{timeout:10000});
      await t.page.getByRole('button',{name:'Add Files',exact:true}).click();
      let picked;
      try { picked=await chooser; }
      catch(e) { console.log('CHOOSER STATE',JSON.stringify({url:t.page.url(),unknown:t.state.unknown,errors:t.errors,inputs:await t.page.locator('input[type=file]').evaluateAll(ns=>ns.map(n=>({connected:n.isConnected,hidden:n.hidden,inert:!!n.closest('[inert]'),accept:n.accept})))}));throw e; }
      assert.equal(await picked.element().getAttribute('type'),'file');
      assert.equal(await picked.element().getAttribute('accept'),'.fit,.gpx,.tcx,.zwo,.erg,.mrc,.zip');
      assert.deepEqual(t.state.routeWrites,[]);assert.deepEqual(t.state.fx.times,[]);await t.clean();
    } finally { await t.ctx.close(); }
  }
});

// This legacy app-export case does not exercise private Drive storage. Keep its
// only Drive transport empty, read-only and fenced to the real fixture account;
// all app metadata, Mail viewers and Fitness export encoders remain unmodified.
async function emptyDrive(t) {
  await t.ctx.route(ORIGIN+'/api/files/list**',route=>{
    const request=route.request(),owner=t.state.view.user.id;
    assert.equal(request.method(),'GET');assert.equal(request.headers()['x-inflite-files-owner'],owner);
    t.state.requests.push({path:'/api/files/list',method:request.method(),body:request.postData()});
    return route.fulfill({contentType:'application/json',headers:{'X-Inflite-Files-Owner':owner},body:JSON.stringify({folder:null,ancestors:[],items:[],cursor:null,revision:1,usage:{used:0,reserved:0,limit:1073741824,nodes:0,nodeLimit:10000,fileLimit:104857600}})});
  });
}
async function collection(page,app) {
  const explorer=page.locator('.ifl-files-explorer:visible');
  await explorer.locator('.ifx-location-list').getByRole('button',{name:'From apps',exact:true}).click();
  await explorer.getByRole('button',{name:'Select '+app,exact:true}).dblclick();
  await explorer.getByRole('searchbox',{name:'Search '+app,exact:true}).waitFor();
  return explorer;
}

test('real keyboard commands, native unsent Mail editor and Files exports work across all-app desktop/mobile transitions', async () => {
  const t = await env.open(); const { page } = t;
  try {
    await emptyDrive(t);
    await createAll(page, t.state);
    await page.keyboard.press('Control+k'); const query = page.getByRole('combobox', { name: 'Search everything', exact: true });
    await query.fill('write email'); const compose = page.getByRole('option').filter({ hasText: /Compose (a message|Mail)/ }); await compose.waitFor();
    await compose.click();
    const draft = page.locator('dialog[data-sheet="mail-compose"] textarea'); await draft.waitFor(); await draft.fill('Unsent OS integration draft');
    await page.evaluate(() => window.__draft = document.querySelector('dialog[data-sheet="mail-compose"] textarea'));
    await page.setViewportSize({ width: 390, height: 844 }); await settled(page);
    assert.equal(await draft.inputValue(), 'Unsent OS integration draft');
    assert.equal(await page.evaluate(() => __draft === document.querySelector('dialog[data-sheet="mail-compose"] textarea')), true);
    assert.equal(t.state.mail.sends.length, 0);
    await page.locator('dialog[data-sheet="mail-compose"] [data-close]').click();
    await page.getByRole('button',{name:'All apps',exact:true}).click();
    const launcher=page.locator('dialog[data-sheet=workspace-apps][open]');
    assert.equal(await launcher.getByRole('button',{name:'Notifications',exact:true}).isVisible(),true);
    await launcher.getByRole('button',{name:'Files',exact:true}).click();
    await page.locator('.ifl-files-explorer:visible').waitFor();
    await page.goBack();await page.locator('.ifl-workspace-pane:visible').first().waitFor();
    await page.getByRole('button', { name: 'Open windows', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Switch to Chats', exact: true }).click();
    assert.equal(await pane(page, 'chats').isVisible(), true); assert.equal(await pane(page, 'mail').isHidden(), true);
    assert.equal(await sameRoots(page), true);
    await page.setViewportSize({ width: 1440, height: 940 }); await settled(page);
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    let library=await collection(page,'Fitness');
    await library.getByRole('button',{name:'Select inflite-r-workspace-fixture.gpx',exact:true}).waitFor();
    library=await collection(page,'Mail');
    await library.getByRole('button',{name:'Select October-update-notes.pdf',exact:true}).waitFor();
    assert.ok(t.state.mail.log.some(r=>r.path === '/api/threads/search'));
    assert.equal(t.state.mail.log.some(r=>/^\/api\/messages\/[^/]+$/.test(r.path) && !r.navigate), false, 'Root Files only reads Mail metadata');
    assert.equal(t.state.mail.log.some(r=>/^\/api\/attachments\//.test(r.path)), false, 'listing never downloads attachment content');
    await library.getByRole('button',{name:'Select October-update-notes.pdf',exact:true}).click();
    await library.locator('.ifx-inspector').getByRole('button',{name:'Open',exact:true}).click();
    const mailLink=page.getByRole('link',{name:'Open in Mail',exact:true}); await mailLink.waitFor();
    assert.equal(new URL(await mailLink.getAttribute('href')).origin,MAIL);
    assert.equal(t.state.mail.log.some(r=>/^\/api\/attachments\//.test(r.path)&&!r.navigate),false,'PDF opens a native Mail navigation choice without CORS fetching content');
    await page.locator('dialog[open] [data-close]').click();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    library=await collection(page,'Fitness');
    await library.getByRole('button',{name:'Select inflite-r-workspace-fixture.gpx',exact:true}).click();
    const download=page.waitForEvent('download');await library.locator('.ifx-inspector').getByRole('button',{name:'Download',exact:true}).click();
    const file = await download; const gpx = readFileSync(await file.path(), 'utf8'); assert.match(gpx, /<gpx /); assert.equal((gpx.match(/<trkpt /g)||[]).length, t.state.plan.route.coords.length);
    await pane(page,'fitness').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>__allRoots.fitness===document.getElementById('m-fitness')),true,'the native export reuses the saved Fitness root');
    await page.waitForFunction(()=>Object.entries(__allRoots).every(([app,root])=>root===document.getElementById('m-'+app)));
    assert.equal(await sameRoots(page),true);assert.equal(t.state.mail.sends.length,0);
    await assertNoChatSends(page);
    assert.deepEqual(t.state.routeWrites, []); await t.clean();
  } finally { await t.ctx.close(); }
});

test('actual notification Reply and Change ride time open owned native editors without sending or rescheduling', async () => {
  const t = await env.open(); const {page} = t;
  try {
    await createAll(page,t.state);
    await page.locator('[data-ws-action=notifications]').click();
    await page.getByRole('button',{name:'Reply · Message from Pat',exact:true}).click();
    await pane(page,'chats').locator('.ch-input').waitFor();
    await page.waitForFunction(()=>document.activeElement?.classList.contains('ch-input'));
    assert.equal(await page.locator('dialog[data-sheet=notifications][open]').count(),0);
    await pane(page,'chats').locator('.ch-input').fill('An unsent notification reply');
    await page.locator('[data-ws-action=notifications]').click();
    await page.getByRole('button',{name:'Change ride time · Your ride',exact:true}).click();
    const editor=page.locator('dialog[data-sheet=ride-at][open]'); await editor.getByLabel('Starting at',{exact:true}).fill('20:00');
    assert.deepEqual(t.state.fx.times,[]); await editor.locator('[data-close]').click();
    await page.getByRole('button',{name:'Open windows',exact:true}).click();await page.getByRole('menuitem',{name:'Switch to Chats',exact:true}).click();
    await pane(page,'chats').locator('.ch-input').waitFor();assert.equal(await pane(page,'chats').locator('.ch-input').inputValue(),'An unsent notification reply');
    await assertNoChatSends(page);
    assert.equal(t.state.mail.sends.length,0); assert.deepEqual(t.state.routeWrites,[]); await t.clean();
  }finally{await t.ctx.close();}
});

test('actual Root boot migrates only its owner v1 layout and strips copied domain fields from the v2 save',async()=>{
  const t=await env.open({mode:{legacy:true},initialPath:'/?os=1#workspace=legacy'});
  try{
    await t.page.getByRole('button',{name:'Legacy <img src=x>',exact:true}).first().waitFor();
    assert.equal(await t.page.locator('img[src=x]').count(),0,'saved workspace labels render as text');
    assert.equal(await t.page.getByText('Other account private workspace',{exact:true}).count(),0);
    await t.page.getByRole('button',{name:'Float windows',exact:true}).click();
    const value=await t.page.evaluate(userId=>JSON.parse(localStorage.getItem('ifl:workspace:v2:'+userId)),t.state.view.user.id);
    assert.equal(value.version,2);assert.equal(value.activeId,'legacy');assert.equal(value.workspaces[0].activePane,'weather');
    assert.doesNotMatch(JSON.stringify(value),/private legacy|not layout data|coordinates|Other account/);
    assert.deepEqual(t.state.routeWrites,[]);assert.equal(t.state.mail.sends.length,0);await t.clean();
  }finally{await t.ctx.close();}
});
