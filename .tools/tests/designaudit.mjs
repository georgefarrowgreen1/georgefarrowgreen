// Browser audit of shared chrome, Status and the authenticated shop app, using real
// middleware, local assets and disposable accounts. No production writes or network.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { jsBlock } from '../iflmenu.mjs';
import { onRequest } from '../../functions/_middleware.js';
const ROOT = new URL('../../', import.meta.url).pathname;
const IFL = ROOT + '../inflite/';
const out = process.env.AUDIT_OUT || '/tmp/inflite-design-audit';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
const types = { html:'text/html', js:'text/javascript', css:'text/css', svg:'image/svg+xml', png:'image/png', woff2:'font/woff2', webmanifest:'application/manifest+json' };
const AXE = readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
async function layout(p, label) {
  if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) {
    console.log(label,await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.right>innerWidth+1||r.left< -1)}).slice(0,20).map(e=>({tag:e.tagName,cls:e.className,id:e.id,text:e.textContent.trim().slice(0,60),width:e.getBoundingClientRect().width,left:e.getBoundingClientRect().left}))));
    await p.screenshot({path:out+'/overflow.png',fullPage:true});
  }
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no document overflow`);
}
async function axe(p, label) {
  await p.evaluate(AXE);
  const issues = await p.evaluate(async () => (await axe.run(document, { preload:false,
    runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa'] }, rules:{'meta-viewport':{enabled:false}}
  })).violations.filter(x => /serious|critical/.test(x.impact)).map(x => `${x.id}: ${x.nodes.map(n => n.target).join(', ')}`));
  assert.deepEqual(issues, [], label); checks++;
}
try {
  // Every actual app stylesheet, with the real shared menu, stress-tested at the
  // smallest supported phone width, tablet and desktop, with long unbroken text.
  for (const [app, css] of [['chat','pigeon/styles.css'],['weather','weather/styles.css'],['fitness','fitness/styles.css'],['markets','markets/styles.css'],['account','account/styles.css'],['mail','../inflite/email/public/app.css'],['today','../inflite/today/public/app.css']]) {
    if(process.env.AUDIT_ONLY==='workflow') continue;
    const ctx = await browser.newContext({ viewport:{width:1440,height:900}, colorScheme:'dark', reducedMotion:'reduce', serviceWorkers:'block' });
    const errors = [];
    await ctx.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.hostname !== 'design.test') return r.abort();
      const body = u.pathname === '/' ? '<!doctype html><html lang="en"><head><title>Design audit</title><link rel="stylesheet" href="/app.css"><script src="/shared.js" defer></script></head><body><button id="anchor" type="button">Profile</button></body></html>'
        : u.pathname === '/app.css' ? readFileSync(ROOT + css)
        : u.pathname === '/shared.js' ? jsBlock(app === 'today' ? 'today' : undefined) : null;
      return body === null ? r.fulfill({status:404,body:''}) : r.fulfill({body,headers:{'content-type':types[u.pathname.split('.').pop()] || 'text/html','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'"}});
    });
    const p = await ctx.newPage(); p.setDefaultTimeout(15000); p.on('pageerror', e => errors.push(e.message));
    await p.goto('https://design.test/');
    await p.evaluate(app => {
      const anchor = document.querySelector('#anchor');
      const header = IFL.header({ me:'S', title:'InFlite', line:'Shared controls', acts:[] });
      document.body.append(header);
      Object.assign(anchor.style,{position:'fixed',right:'16px',top:'16px',width:'80px',height:'48px',zIndex:'31'});
      anchor.onclick = () => IFL.menu(anchor,{app,build:'1.00',me:{name:'AlexandertheverylongunbrokennamereturningtoInFlite',line:'averylongemailaddress@example.example.com'},rows:[
        {label:'Location automatically updated',value:'NorthWalshamandtheverysurroundinglonglocation',icon:'sun'},
        {label:'Notification preferences',on:true,icon:'bell',toggle:v=>v},
        {label:'Unavailable setting',on:false,disabled:true,icon:'lock'}],signOut() {}});
    },app);
    await p.locator('#anchor').click(); await p.locator('.ifm-pop.open').waitFor();
    for (const [width,height] of [[1440,900],[320,568],[844,390],[768,1024],[390,844]]) {
      await p.setViewportSize({width,height}); await p.waitForTimeout(100);
      const state = await p.evaluate(() => {
        const pop=document.querySelector('.ifm-pop'),r=pop.getBoundingClientRect();
        return {fits:r.left>=11 && r.top>=11 && r.right<=innerWidth-11 && r.bottom<=innerHeight-11,
          overflow:pop.scrollWidth>pop.clientWidth+1,
          text:[...pop.querySelectorAll('.ifm-who b,.ifm-who small,.ifm-val,.ifm-l')].some(e=>e.scrollWidth>e.clientWidth+1 || e.scrollHeight>e.clientHeight+1),
          motion:getComputedStyle(pop).transform};
      });
      assert.deepEqual(state,{fits:true,overflow:false,text:false,motion:'none'},`${app} ${width}: usable menu after resize with reduced motion`); checks++;
      await layout(p,app);
    }
    for (const scheme of ['light','dark']) {
      await p.emulateMedia({colorScheme:scheme});
      const paint=await p.locator('.ifm-pop').evaluate(e=>{const c=getComputedStyle(e);return [c.backgroundColor,c.color,c.backdropFilter]});
      assert.deepEqual(paint,scheme==='light'?['rgb(255, 255, 255)','rgb(23, 26, 24)','none']:['rgb(25, 28, 25)','rgb(244, 247, 242)','none'],`${app}: coherent opaque ${scheme} menu`);checks++;
      await axe(p,`${app}: ${scheme} menu accessibility`);
      await p.screenshot({path:`${out}/${app}-menu-${scheme}.png`});
    }
    await p.keyboard.press('Tab');
    for(let i=0;i<12;i++) await p.keyboard.press('Tab');
    ok(await p.evaluate(()=>document.activeElement.closest('.ifm-pop')!==null),`${app}: keyboard stays in menu, skipping disabled controls`);
    await p.screenshot({path:`${out}/${app}-menu.png`});
    await p.keyboard.press('Escape'); await p.locator('.ifm-layer').waitFor({state:'detached'});
    ok(await p.locator('#anchor').evaluate(e=>e===document.activeElement && !e.inert),`${app}: dismiss restores focus and releases background`);
    // Native CSS media preference, including the paired foreground/background.
    const cdp=await ctx.newCDPSession(p);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});
    await p.locator('#anchor').click(); await p.locator('.ifm-pop.open').waitFor();
    const solid=await p.locator('.ifm-pop').evaluate(e=>{const c=getComputedStyle(e);return [c.backdropFilter,c.backgroundColor,c.color]});
    assert.deepEqual(solid,['none','rgb(25, 28, 25)','rgb(244, 247, 242)'],`${app}: reduced transparency keeps dark text/surface pairing`);checks++;
    assert.deepEqual(errors,[],`${app}: no runtime errors`); checks++;
    await ctx.close();
  }

  // Real fitting login, signed cookie, private app assets and all workflow steps.
  // Status uses the actual summary schema against a disposable SQLite-backed D1.
  const sql=new DatabaseSync(':memory:');
  const exec=(q,a)=>{const s=sql.prepare(q);return s.columns().length?{results:s.all(...a),success:true}:{results:[],meta:{changes:Number(s.run(...a).changes)},success:true}};
  const stmt=(q,a=[])=>({bind:(...v)=>stmt(q,v),first:async col=>{const r=sql.prepare(q).get(...a)??null;return col&&r?r[col]:r},all:async()=>exec(q,a),run:async()=>exec(q,a),now:()=>exec(q,a)});
  const kv=new Map(), env={DB:{prepare:stmt,batch:async a=>a.map(x=>x.now())},FITTING_USERS:'Auditor:local-browser-fixture-password',BIO_KV:{get:async k=>kv.get(k)??null,put:async(k,v)=>kv.set(k,v),delete:async k=>kv.delete(k)},ASSETS:{fetch:async req=>{
    let path=new URL(req.url||req).pathname;if(path.endsWith('/'))path+='index.html';
    let f=ROOT+path.slice(1);if(!existsSync(f)&&existsSync(f+'.html')) { f+='.html'; path+='.html'; }
    if(path.includes('..')||!existsSync(f)||!statSync(f).isFile())return new Response('not found',{status:404});
    return new Response(readFileSync(f),{headers:{'content-type':types[path.split('.').pop()]||'application/octet-stream'}});
  }}};
  for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]])for(const scheme of ['light','dark']) {
    const ctx=await browser.newContext({viewport:{width,height},colorScheme:scheme,reducedMotion:'reduce',serviceWorkers:'block'});
    const errors=[];
    await ctx.route('**/*',async route=>{
      const q=route.request(),u=new URL(q.url());
      if(!['status.inflite.ai','fitting.georgefarrowgreen.com'].includes(u.hostname))return route.abort();
      const request=new Request(q.url(),{method:q.method(),headers:q.headers(),...(['GET','HEAD'].includes(q.method())?{}:{body:q.postDataBuffer()})});
      const res=await onRequest({request,env,next:()=>env.ASSETS.fetch(request),waitUntil(){},params:{},data:{}});
      return route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});
    });
    const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
    await p.goto('https://status.inflite.ai/');await p.locator('.service-overview').waitFor();
    await layout(p,'Status');await axe(p,'Status serious accessibility');
    await p.screenshot({path:`${out}/status-${width}-${scheme}.png`,fullPage:true});
    await p.goto('https://fitting.georgefarrowgreen.com/login');
    await layout(p,'Shop login');await axe(p,'Shop login serious accessibility');
    const response=await p.evaluate(async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Auditor',password:'local-browser-fixture-password'})});return r.status});
    assert.equal(response,200,'local shop sign-in');checks++;
    await p.goto('https://fitting.georgefarrowgreen.com/');await p.locator('#main .sec').first().waitFor();
    const count=await p.locator('#rail .step-btn').count();
    for(let i=0;i<count;i++) {
      await p.locator('#rail .step-btn').nth(i).click();
      await layout(p,`Fitting step ${i}`);
    }
    await axe(p,'Fitting workflow serious accessibility');
    if(width===390 && scheme==='light') {
      const pdf=await p.evaluate(async()=>{const blob=await buildPDF();return {type:blob.type,size:blob.size,header:new TextDecoder().decode((await blob.arrayBuffer()).slice(0,5)),version:window.jspdf.jsPDF.version}});
      assert.equal(pdf.type,'application/pdf');assert.ok(pdf.size>1000);assert.equal(pdf.header,'%PDF-');assert.equal(pdf.version,'4.2.1');checks++;
    }
    await p.screenshot({path:`${out}/fitting-${width}-${scheme}.png`,fullPage:true});
    assert.deepEqual(errors,[],`Status and fitting ${width}/${scheme}: no runtime errors`);checks++;
    await ctx.close();
  }
  sql.close();
  console.log(`PASS ${checks} browser checks; all seven shared menus, Status and fitting`);
} finally { await browser.close(); }
