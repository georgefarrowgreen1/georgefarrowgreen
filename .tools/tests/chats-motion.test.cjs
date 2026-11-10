const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const ROOT = resolve(__dirname, '../..'), IFL = resolve(ROOT, '../inflite');
let browser, serveKit, KIT, IDS;
before(async () => {
  ({ serveKit, KIT } = await import('./roofkit/serve.mjs'));
  ({ IDS } = await import('./unit/fixtures/chats.mjs'));
  browser = process.env.CHAT_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const events = page => page.evaluate(() => window.__chatMotion);
async function open({ motion = 'no-preference', history = false } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: motion });
  await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
  // This seeded window is complete. The kit's simple older() reply does not
  // advance its flag as the real core does; leaving it on would loop pagination.
  const initial = `W.chats[IDS.pat].older=false;` + (history ? `W.chats[IDS.pat].msgs=Array.from({length:65},(_,i)=>({id:'history-'+i,from:i%2?'me':'them',at:Date.now()-(70-i)*60000,kind:'text',text:'History message '+i,reactions:{},read:true,delivered:true,recalled:false})).concat(W.chats[IDS.pat].msgs);` : '');
  const injected = `
    if(name==='me' && args?.motion){
      const c=W.chats[IDS.pat], key=args.id||'motion-new';
      if(args.motion==='append') c.msgs.push({id:key,from:args.from||'them',at:Date.now(),kind:'text',text:args.text||'A live message',reactions:{},read:false,delivered:false,recalled:false,...(args.flying?{flight:{way:'pigeon',flying:true,sentAt:Date.now(),landsAt:Date.now()+3600000}}:{})});
      if(args.motion==='prepend') c.msgs.unshift({id:key,from:'them',at:Math.min(...c.msgs.map(m=>m.at))-86400000,kind:'text',text:'An older message',reactions:{}});
      if(args.motion==='receipt'){const m=c.msgs.find(m=>m.id===key);m.read=!m.read;m.delivered=true;}
      if(args.motion==='land'){const m=c.msgs.find(m=>m.id===key);m.flight={...m.flight,flying:false};m.text='The letter has arrived';}
      patch('chat:'+IDS.pat,c);return {ok:true};
    }
  `;
  const core = readFileSync(resolve(__dirname, 'roofkit/chatcore-stub.js'), 'utf8').replaceAll('__KIT_STATE__', 'ready').replace('let state =', initial + 'let state =').replace('meta: (name) => {', 'meta: (name, args) => {' + injected);
  await ctx.route(`${KIT}/chats/roof/core.js*`, r => r.fulfill({ contentType: 'text/javascript', body: core }));
  await ctx.route(`${KIT}/api/**`, r => r.fulfill({ json: { signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } } }));
  const page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__chatMotion = [];
    document.addEventListener('animationstart', e => {
      if (/^ch-message-(enter|reveal)$/.test(e.animationName)) __chatMotion.push({ name: e.animationName, id: e.target.dataset.mid });
    });
  });
  await page.goto(`${KIT}/?module=/chats/roof/chats.js&apps=weather,chats&service=stub`);
  await page.waitForFunction(() => window.kit?.ready);
  await page.evaluate(id => kit.F.nav.go('/chats/#open=' + id), IDS.pat);
  await page.locator('.ch-input').waitFor(); await page.locator('.ch-b').first().waitFor();
  await settle(page);
  const change = async (motion, extra = {}) => {
    await page.evaluate(async args => { const svc = await kit.F.forModule('chats').service(); await svc.call('meta', 'me', args); }, { motion, ...extra });
    await settle(page);
  };
  return { ctx, page, errors, change };
}

test('live messages enter once while receipts, repeated sync and draft changes stay still', async () => {
  const { ctx, page, errors, change } = await open();
  try {
    const measure = () => page.locator('.ch-scroller').evaluate(n => ({ gap: n.scrollHeight - n.scrollTop - n.clientHeight, scrollTop: n.scrollTop, height: n.clientHeight, content: n.scrollHeight }));
    assert.deepEqual(await events(page), [], 'the initial thread does not replay message entrances');
    await page.locator('.ch-input').fill('Keep this\nmultiline draft');
    await change('append', { id: 'live-incoming' });
    await page.waitForFunction(() => __chatMotion.some(e => e.id === 'live-incoming'));
    assert.deepEqual(await events(page), [{ name: 'ch-message-enter', id: 'live-incoming' }]);
    assert.equal(await page.locator('.ch-input').inputValue(), 'Keep this\nmultiline draft');
    await change('receipt', { id: 'live-incoming' }); await change('sync'); await change('sync');
    assert.equal((await events(page)).length, 1, 'read receipts and unchanged sync do not replay a row');
    await page.locator('.ch-send').click();
    await page.waitForFunction(() => __chatMotion.length === 2);
    assert.equal(await page.locator('.ch-input').inputValue(), '');
    assert.equal((await events(page))[1].name, 'ch-message-enter');
    await page.waitForFunction(() => !document.querySelector('.ch-arriving, .ch-revealing'));
    const end = await measure();
    assert.ok(end.gap < 65, 'sending stays at the latest message after the entrance settles: ' + JSON.stringify(end));
    if (process.env.CHAT_MOTION_SCREENSHOTS) {
      mkdirSync(process.env.CHAT_MOTION_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: process.env.CHAT_MOTION_SCREENSHOTS + '/live-thread.png' });
    }
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => kit.state.csp), []);
  } finally { await ctx.close(); }
});

test('older pages and offscreen arrivals preserve the history anchor and composer draft', async () => {
  const { ctx, page, errors, change } = await open({ history: true });
  try {
    await page.locator('.ch-scroller').evaluate(n => { n.scrollTop = 0; n.dispatchEvent(new Event('scroll')); });
    await page.locator('.ch-latest').waitFor({ state: 'visible' });
    await page.locator('.ch-input').fill('Draft while reading');
    const position = () => page.locator('[data-mid="history-0"]').evaluate(n => n.getBoundingClientRect().top);
    const before = await position();
    await change('prepend', { id: 'older-page' });
    assert.ok(Math.abs(await position() - before) < 2, 'prepending older messages preserves the visible message position');
    await change('append', { id: 'offscreen-new' });
    assert.deepEqual(await events(page), [], 'older history and arrivals below a reading position remain still');
    assert.ok(Math.abs(await position() - before) < 2);
    assert.equal(await page.locator('.ch-input').inputValue(), 'Draft while reading');
    await page.locator('.ch-latest').click();
    await page.waitForFunction(() => document.querySelector('.ch-latest').hidden);
    assert.equal(await page.locator('.ch-scroller').evaluate(n => n.scrollHeight - n.scrollTop - n.clientHeight < 65), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a sealed letter reveals once and reopening the conversation resets animation ownership', async () => {
  const { ctx, page, errors, change } = await open();
  try {
    await change('append', { id: 'sealed-live', flying: true });
    await page.waitForFunction(() => __chatMotion.length === 1);
    await page.locator('[data-mid="sealed-live"] .sealed').waitFor();
    await change('land', { id: 'sealed-live' });
    await page.waitForFunction(() => __chatMotion.length === 2);
    assert.deepEqual((await events(page))[1], { name: 'ch-message-reveal', id: 'sealed-live' });
    assert.match(await page.locator('[data-mid="sealed-live"]').innerText(), /The letter has arrived/);
    await change('receipt', { id: 'sealed-live' }); await change('sync');
    assert.equal((await events(page)).length, 2);
    await page.locator('#hd .ifl-back').click();
    await page.waitForFunction(() => document.querySelector('.ch-chat').hidden);
    await page.evaluate(id => kit.F.nav.go('/chats/#open=' + id), IDS.pat);
    await page.locator('[data-mid="sealed-live"]').waitFor(); await settle(page);
    assert.equal((await events(page)).length, 2, 'returning history has no fresh entrance');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('reduced motion and hidden-page updates never produce spatial message entrances', async () => {
  const { ctx, page, errors, change } = await open({ motion: 'reduce' });
  try {
    await change('append', { id: 'reduced-new' });
    assert.deepEqual(await events(page), []);
    assert.equal(await page.locator('[data-mid="reduced-new"]').evaluate(n => n.getAnimations({ subtree: true }).length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await change('append', { id: 'cancelled-arrival' });
    await page.waitForFunction(() => __chatMotion.length === 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('.ch-arriving, .ch-revealing'));
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await settle(page);
    assert.equal((await events(page)).length, 1, 'an interrupted entrance does not replay when motion is enabled again');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await change('append', { id: 'hidden-new' });
    await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(page);
    assert.equal((await events(page)).length, 1);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('standalone send readiness animates its icon while preserving the 44px target and reduced motion', async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  try {
    await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
    await ctx.route(`${KIT}/standalone-send-motion`, r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/chats/styles.css"></head><body><form class="compose"><div class="crow"><div class="field-wrap"><textarea aria-label="Message"></textarea></div><button type="button" class="send" disabled aria-label="Send"><svg class="ico" viewBox="0 0 24 24"><path d="M12 20V4m-6 6 6-6 6 6"/></svg></button></div></form></body></html>` }));
    const page = await ctx.newPage();
    await page.goto(`${KIT}/standalone-send-motion`); await page.bringToFront();
    await page.locator('.send').evaluate(n => { n.disabled = false; });
    await page.waitForFunction(() => document.querySelector('.send svg').getAnimations().some(a => a.animationName === 'send-in'));
    const size = await page.locator('.send').evaluate(n => { const r = n.getBoundingClientRect(); return { width: r.width, height: r.height, animation: n.getAnimations().filter(a => a.animationName === 'send-in').length, transform: getComputedStyle(n).transform }; });
    assert.deepEqual(size, { width: 44, height: 44, animation: 0, transform: 'none' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.send svg').getAnimations().length === 0);
    assert.equal(await page.locator('.send svg').evaluate(n => getComputedStyle(n).transform), 'none');
  } finally { await ctx.close(); }
});
