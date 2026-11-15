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
  await app(page,'Chats');await page.locator('#m-chats .ch-row[data-id="'+IDs.pat+'"]').click();await input.waitFor();assert.equal(await input.inputValue(),'Private native draft');
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
