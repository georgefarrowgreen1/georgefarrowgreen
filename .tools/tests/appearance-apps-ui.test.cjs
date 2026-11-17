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

for(const width of [390,1440])test(`six themes preserve real native pages, dock geometry and a Chat draft at ${width}px`,async()=>{
 const t=await env.open({width,initialPath:'/?os=1',ready:'home'}),{page}=t;
 try{
  await env.createAll(page,t.state);
  await app(page,'Chats');await page.locator('#m-chats .ch-row[data-id="'+IDs.pat+'"]').click();
  const input=page.locator('#m-chats .ch-input');await input.waitFor();await input.fill('Keep my themed draft');
  await page.getByRole('button',{name:'Back to Chats',exact:true}).click();
  const dock=page.locator('.ws-dock'), initial=await dock.boundingBox();
  for(const palette of ['inflite','coast','iris','ember','rose','graphite'])for(const appearance of ['light','dark']){
   await page.evaluate(p=>InFliteAppearance.accept(p),{palette,appearance});
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.palette),palette);
   const colour=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ifl-accent-fill').trim());
   assert.ok(colour.length>0);
   for(const name of ['Fitness','Weather','Markets','Chats','Mail','Today']){
    await app(page,name);
    const box=await dock.boundingBox();assert.ok(Math.abs(box.x-initial.x)<=1&&Math.abs(box.y-initial.y)<=1,'theme and page changes keep the dock stationary');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   }
  }
  await page.evaluate(()=>InFliteAppearance.accept({palette:'coast',appearance:'dark'}));
  await app(page,'Today');await page.screenshot({path:'/tmp/inflite-os-next-20261114/identity/theme-native-'+width+'.png',fullPage:false});
  await app(page,'Chats');await page.locator('#m-chats .ch-row[data-id="'+IDs.pat+'"]').click();await input.waitFor();assert.equal(await input.inputValue(),'Keep my themed draft');
  assert.equal(await env.sameRoots(page),true);await env.assertNoChatSends(page);assert.equal(t.state.mail.sends.length,0);await t.clean();
 }finally{await t.ctx.close()}
});
