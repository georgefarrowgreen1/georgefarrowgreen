// The actual homepage and source/minified assets, isolated from accounts and email. Exercise the manual stack,
// original account links, touch/mouse gestures, focus, reduced motion and the native fallback without production writes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const ROOT = resolve(__dirname, '../..');
let browser;
before(async () => { browser = await chromium.launch({
  ...(process.env.CHROMIUM || existsSync('/usr/bin/chromium') ? { executablePath: process.env.CHROMIUM || '/usr/bin/chromium' } : {}),
  args: ['--no-sandbox']
}); });
after(async () => browser?.close());
const signed = { signedIn: true, name: 'Sam', apps: { weather: { places: 3, alerts: true } },
  links: { weather: 'https://weather.inflite.ai/?from=home' } };
async function fixture(assets, { width = 390, reduce = false, js = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: width <= 600,
    reducedMotion: reduce ? 'reduce' : 'no-preference', javaScriptEnabled: js });
  const errors = [];
  await ctx.route('https://home.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace('<html lang="en-GB">', '<html lang="en-GB" data-words>') });
    if (path === '/api/me') return route.fulfill({ json: signed });
    if (path === '/api/background') return route.fulfill({ json: { images: [] } });
    if (path === '/api/content') return route.fulfill({ json: { name: 'George Farrow-Green', role: 'Fitness · Outdoors', bio: 'Bikes, fitness, outdoors.' } });
    if (path.startsWith('/apps/')) {
      const icon = { inflight: 'pigeon', weather: 'weather', fitness: 'fitness', markets: 'markets' }[path.split('/').pop().replace('.png', '')];
      return route.fulfill({ contentType: 'image/png', body: readFileSync(resolve(ROOT, `${icon}/icon-180.png`)) });
    }
    if (['/styles.css', '/app.js', '/signedin.js'].includes(path) || path.startsWith('/fonts/')) {
      const file = (['/styles.css', '/app.js'].includes(path) ? assets : '') + path.slice(1);
      return route.fulfill({ body: readFileSync(resolve(ROOT, file)), contentType: path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.woff2') ? 'font/woff2' : 'image/png' });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => {errors.push(e.message); console.error('PAGE ERROR:',e.message);});
  await p.goto('https://home.test/');
  if (js) await p.locator('body.known').waitFor();
  if (js) await p.locator('#app-viewport').scrollIntoViewIfNeeded();
  await p.mouse.move(0, 0);
  return { ctx, p, errors };
}
const active = p => p.locator('.app[aria-hidden="false"]');
const wait = p => p.waitForFunction(() => !document.querySelector('#apps').getAnimations({subtree:true}).length);
const title = p => active(p).locator('b').innerText();
for (const assets of ['', 'min/']) {
  test(`${assets || 'source/'}stack retains real account links, summaries and exactly one accessible card`, async () => {
    const f = await fixture(assets);
    try {
      assert.equal(await f.p.locator('.app').count(),4); assert.equal(await f.p.locator('.app-copy').count(),0);
      assert.equal(await title(f.p),'Chat'); assert.equal(await f.p.locator('.app:not([inert])').count(),1);
      assert.equal(await f.p.locator('#app-weather small').innerText(),'3 places · Alerts on');
      assert.equal(await f.p.locator('#app-weather .app-link').getAttribute('href'),signed.links.weather);
      await active(f.p).locator('.app-next').click(); await wait(f.p); assert.equal(await title(f.p),'Weather');
      assert.equal(await active(f.p).locator('.app-next').evaluate(e=>e===document.activeElement),true);
      assert.equal(await f.p.locator('body').evaluate(e=>e.classList.contains('leaving')),false,'Next never triggers the app navigation transition');
      await f.p.waitForTimeout(700); assert.equal(await title(f.p),'Weather','the approved stack moves only on interaction');
      assert.deepEqual(f.errors,[]);
    } finally { await f.ctx.close(); }
  });
  test(`${assets || 'source/'}keyboard wrap, rapid inputs and reduced motion work on the same real cards`, async () => {
    const f=await fixture(assets,{width:1440});
    try {
      await active(f.p).locator('.app-grab').focus(); await f.p.keyboard.press('ArrowLeft'); await wait(f.p); assert.equal(await title(f.p),'Markets');
      await f.p.keyboard.press('Home'); assert.equal(await title(f.p),'Chat');
      await f.p.keyboard.press('ArrowRight'); await f.p.keyboard.press('ArrowRight'); await f.p.keyboard.press('ArrowRight');
      await f.p.waitForFunction(()=>document.querySelector('.app[aria-hidden="false"] b')?.textContent==='Markets');await wait(f.p);
      await f.p.emulateMedia({reducedMotion:'reduce'});await active(f.p).locator('.app-next').click();assert.equal(await title(f.p),'Chat');
      assert.equal(await f.p.locator('#apps').evaluate(e=>e.getAnimations({subtree:true}).length),0);
      await active(f.p).locator('.app-grab').focus();await f.p.keyboard.press('End');assert.equal(await title(f.p),'Markets');
      assert.deepEqual(f.errors,[]);
    }finally{await f.ctx.close()}
  });
  test(`${assets || 'source/'}mouse dragging promotes the next card, short drags return without navigation`, async()=>{
    const f=await fixture(assets,{width:1440});
    try{
      let r=await active(f.p).locator('.app-grab').boundingBox();const x=r.x+r.width*.65,y=r.y+r.height*.5;
      await f.p.mouse.move(x,y);await f.p.mouse.down();await f.p.mouse.move(x-130,y,{steps:12});await f.p.mouse.up();await wait(f.p);assert.equal(await title(f.p),'Weather');
      r=await active(f.p).locator('.app-grab').boundingBox();await f.p.mouse.move(r.x+100,r.y+35);await f.p.mouse.down();await f.p.mouse.move(r.x+124,r.y+35,{steps:8});await f.p.waitForTimeout(110);await f.p.mouse.up();await wait(f.p);
      assert.equal(await title(f.p),'Weather');assert.match(f.p.url(),/^https:\/\/home.test\//);assert.deepEqual(f.errors,[]);
    }finally{await f.ctx.close()}
  });
  test(`${assets || 'source/'}real touch swipes and sheet interruptions leave a usable stack`,async()=>{
    const f=await fixture(assets);
    try{
      const r=await active(f.p).locator('.app-grab').boundingBox(),cdp=await f.ctx.newCDPSession(f.p),x=r.x+r.width*.75,y=r.y+40;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*12,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await wait(f.p);assert.equal(await title(f.p),'Weather');
      await active(f.p).locator('.app-next').click();await f.p.evaluate(()=>document.querySelector('[data-contact]').click());await f.p.locator('body.sheet-up').waitFor();await wait(f.p);
      assert.equal(await f.p.locator('.app:not([inert])').count(),1);await f.p.keyboard.press('Escape');await f.p.locator('body:not(.sheet-up)').waitFor();
      await active(f.p).locator('.app-next').click();await wait(f.p);assert.deepEqual(f.errors,[]);
    }finally{await f.ctx.close()}
  });
  for(const width of [320,390,768,1440])test(`${assets || 'source/'}${width}px stack and simple project rows fit without overflow`,async()=>{
    const f=await fixture(assets,{width,reduce:true});try{
      const bounds=await f.p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,rows:[...document.querySelectorAll('.project')].map(e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom}}),height:document.querySelector('#apps').offsetHeight}));
      assert.equal(bounds.overflow,false);assert.ok(bounds.rows[1].top>=bounds.rows[0].bottom);assert.equal(bounds.height,186);
      await active(f.p).locator('.app-grab').click();assert.equal(await title(f.p),'Weather');
      assert.deepEqual(f.errors,[]);
    }finally{await f.ctx.close()}
  });
}
test('without JavaScript all four native app links remain horizontally reachable',async()=>{
  const f=await fixture('',{js:false});try{
    assert.equal(await f.p.locator('.app-link').count(),4);assert.equal(await f.p.locator('.app-next:visible').count(),0);
    assert.equal(await f.p.locator('#apps').evaluate(e=>getComputedStyle(e).overflowX),'auto');
    await f.p.locator('#app-markets .app-link').focus();assert.ok(await f.p.locator('#apps').evaluate(e=>e.scrollLeft)>0);
  }finally{await f.ctx.close()}
});
