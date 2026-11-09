const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright'),{resolve}=require('node:path'),{readFileSync,existsSync,mkdirSync}=require('node:fs');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');let browser,serveKit,KIT,IDS;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));({IDS}=await import('./unit/fixtures/chats.mjs'));browser=process.env.CHAT_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const width of [320,390,1280])test(`chat list and history controls remain readable and usable at ${width}px`,async()=>{
 const ctx=await browser.newContext({...devices['iPhone 13'],viewport:{width,height:844},colorScheme:width===390?'dark':'light',reducedMotion:width===390?'reduce':'no-preference'});
 try{
  await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});
  const injection=`W.rows.find(r=>r.kind==='group').name='VeryLongUnbrokenGroupName'.repeat(8);W.air[0].from='LongName'.repeat(30);W.chats[IDS.pat].msgs=Array.from({length:65},(_,i)=>({id:'history-'+i,from:i%2?'me':'them',at:Date.now()-(70-i)*60000,kind:'text',text:'A message from earlier in the conversation '+i,reactions:{},read:true,delivered:true,recalled:false})).concat(W.chats[IDS.pat].msgs);W.chats[IDS.pat].older=false;`;
  const core=readFileSync(resolve(__dirname,'roofkit/chatcore-stub.js'),'utf8').replaceAll('__KIT_STATE__','ready').replace('let state =',injection+'let state =');
  await ctx.route(`${KIT}/chats/roof/core.js*`,r=>r.fulfill({contentType:'text/javascript',body:core}));
  await ctx.route(`${KIT}/api/**`,r=>r.fulfill({contentType:'application/json',body:JSON.stringify({signedIn:true,user:{id:'u-kit-0001',name:'Sam Taylor'}})}));
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
  p.setDefaultTimeout(10000);
  await p.goto(`${KIT}/?module=/chats/roof/chats.js&apps=weather,chats&service=stub`);await p.waitForFunction(()=>window.kit?.ready);await p.evaluate(()=>kit.F.nav.go('/chats/'));await p.locator('.ch-row').first().waitFor();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await p.locator('.ch-airp').first().evaluate(n=>{const r=n.getBoundingClientRect();return r.width<=231&&r.height<=120;}),true,'long in-flight names stay within a compact card');
  if(process.env.CHAT_UI_SCREENSHOTS){mkdirSync(process.env.CHAT_UI_SCREENSHOTS,{recursive:true});await p.screenshot({path:process.env.CHAT_UI_SCREENSHOTS+`/list-${width}.png`,scale:'css',animations:'disabled',timeout:30000});}
  await p.evaluate(id=>kit.F.nav.go('/chats/#open='+id),IDS.pat);await p.locator('.ch-input').waitFor();await p.waitForFunction(()=>document.querySelectorAll('.ch-b').length>60);
  const jump=p.getByRole('button',{name:'Jump to latest messages'});assert.equal(await jump.isVisible(),false);
  await p.locator('.ch-scroller').evaluate(n=>{n.scrollTop=0;n.dispatchEvent(new Event('scroll'));});await jump.waitFor({state:'visible'});
  await p.locator('.ch-input').fill('Keep this draft while reading history');
  assert.equal(await p.locator('.ch-scroller').evaluate(n=>n.scrollTop<100),true,'typing while reading does not lose the history position');
  assert.equal(await jump.evaluate(n=>{const r=n.getBoundingClientRect(),composer=n.closest('.ch-composer').getBoundingClientRect();return r.height>=44&&r.bottom<=composer.top&&r.left>=0&&r.right<=innerWidth;}),true,'jump target sits above the composer and inside the viewport');
  if(process.env.CHAT_UI_SCREENSHOTS)await p.screenshot({path:process.env.CHAT_UI_SCREENSHOTS+`/history-${width}.png`,scale:'css',animations:'disabled',timeout:30000});
  await jump.click();await jump.waitFor({state:'hidden'});assert.equal(await p.locator('.ch-input').inputValue(),'Keep this draft while reading history');
  assert.equal(await p.locator('.ch-scroller').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight<65),true);
  if(width===390)assert.equal(await p.locator('.ch-attach').evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
