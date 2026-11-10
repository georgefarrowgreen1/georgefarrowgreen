const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const ROOT = resolve(__dirname, '../..'), IFL = resolve(ROOT, '../inflite');
let browser, serveKit, KIT, IDS;
before(async () => {
  ({ serveKit, KIT } = await import('./roofkit/serve.mjs'));
  ({ IDS } = await import('./unit/fixtures/chats.mjs'));
  browser = process.env.CHAT_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());
async function settle(page) {
  await page.evaluate(async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
const glyphs = ns => ns.map(n => {
  const r = n.getBoundingClientRect(), s = getComputedStyle(n), range = document.createRange();
  range.selectNodeContents(n); const text = range.getBoundingClientRect();
  return { width: r.width, height: r.height, top: r.top, radius: s.borderRadius, dx: (text.left + text.right - r.left - r.right) / 2, dy: (text.top + text.bottom - r.top - r.bottom) / 2 };
});
async function open(width, theme) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width, height: 844 }, colorScheme: theme, reducedMotion: width === 390 ? 'no-preference' : 'reduce' });
  await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
  const setup = `W.chats[IDS.pat].older=false;const original=W.chats[IDS.pat].msgs[0],voice=W.chats[IDS.pat].msgs.find(m=>m.kind==='voice');W.typing[IDS.pat]={on:false};W.chats[IDS.pat].msgs=[original,{...original,id:'geometry-opened',from:'me',kind:'viewonce',text:'',opened:1},{...original,id:'geometry-live',kind:'viewonce',text:'',media:{ref:'geometry-live',kind:'photo'},opened:0},voice,{...original,id:'geometry-sealed',text:'',flight:{way:'pigeon',flying:true,sentAt:Date.now()-60000,landsAt:Date.now()+3600000}}];`;
  const core = readFileSync(resolve(__dirname, 'roofkit/chatcore-stub.js'), 'utf8').replaceAll('__KIT_STATE__', 'ready').replace('let state =', setup + 'let state =');
  await ctx.route(`${KIT}/chats/roof/core.js*`, r => r.fulfill({ contentType: 'text/javascript', body: core }));
  await ctx.route(`${KIT}/api/**`, r => r.fulfill({ json: { signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } } }));
  const page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${KIT}/?module=/chats/roof/chats.js&apps=weather,chats&service=stub`); await page.bringToFront();
  await page.waitForFunction(() => window.kit?.ready);
  await page.evaluate(id => kit.F.nav.go('/chats/#open=' + id), IDS.pat);
  await page.locator('[data-mid=geometry-opened]').waitFor(); await settle(page);
  return { ctx, page, errors };
}
for (const [width, theme] of [[320, 'dark'], [390, 'dark'], [1280, 'dark'], [390, 'light']]) {
  test(`Chats circles, single media surfaces and keyboard focus at ${width}px ${theme}`, async () => {
    const { ctx, page, errors } = await open(width, theme);
    try {
      const opened = await page.locator('.ch-photo.done').evaluate(n => {
        const s = getComputedStyle(n), r = n.getBoundingClientRect(), p = n.parentElement.getBoundingClientRect();
        return { background: s.backgroundColor, width: r.width, height: p.height, left: r.left - p.left, right: p.right - r.right, top: r.top - p.top, bottom: p.bottom - r.bottom };
      });
      assert.match(opened.background, /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/);
      assert.ok(opened.height >= 44); assert.equal(opened.left, 16); assert.equal(opened.right, 16); assert.equal(opened.top, 11); assert.equal(opened.bottom, 11);
      for (const selector of ['[data-mid=geometry-live] .ch-photo', '.ch-vn']) {
        const surface = await page.locator(selector).evaluate(n => {
          const r = n.getBoundingClientRect(), p = n.parentElement.getBoundingClientRect(), s = getComputedStyle(n);
          return { left: r.left - p.left, right: p.right - r.right, top: r.top - p.top, bottom: p.bottom - r.bottom, radius: s.borderRadius, width: r.width, height: r.height, margin: s.margin };
        });
        assert.deepEqual([surface.left, surface.right, surface.top, surface.bottom], [0, 0, 0, 0], 'media has one rounded surface without nested negative margins');
        assert.equal(surface.radius, '22px'); assert.equal(surface.margin, '0px'); assert.ok(surface.height >= 44);
      }
      const photo = page.locator('[data-mid=geometry-live] .ch-photo');
      await photo.click(); await page.locator('dialog[data-sheet=view] [data-close]').click();
      await page.locator('dialog[data-sheet=view]').waitFor({ state: 'detached' });
      const returned = await photo.evaluate(n => { const s = getComputedStyle(n); return { visible: n.matches(':focus-visible'), style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, radius: s.borderRadius }; });
      // WebKit may retain :focus-visible when native dialog focus is restored.
      // Keep that accessibility choice, with the same quiet inset treatment.
      if (returned.visible) assert.deepEqual(returned, { visible: true, style: 'solid', width: '2px', offset: '-3px', radius: '22px' });
      else assert.equal(returned.style, 'none', 'ordinary pointer focus stays quiet');
      await photo.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      const focus = await photo.evaluate(n => { const s = getComputedStyle(n); return { visible: n.matches(':focus-visible'), width: s.outlineWidth, offset: s.outlineOffset, radius: s.borderRadius }; });
      assert.deepEqual(focus, { visible: true, width: '2px', offset: '-3px', radius: '22px' });
      await page.locator('.ch-b[role=button]').first().click(); await page.locator('dialog[data-sheet=hold]').waitFor(); await settle(page);
      const reactions = await page.locator('.chs-emoji').evaluateAll(glyphs);
      assert.equal(reactions.length, 6);
      for (const r of reactions) {
        assert.equal(r.width, 48); assert.equal(r.height, 48); assert.equal(r.radius, '50%');
        assert.ok(Math.abs(r.dx) < 2.5 && Math.abs(r.dy) < 2.5, 'each emoji is centered in both axes: ' + JSON.stringify(r));
      }
      assert.equal(new Set(reactions.map(r => Math.round(r.top))).size, width < 360 ? 2 : 1, 'reactions form a deliberate 3×2 or six-column grid');
      const reaction = page.locator('.chs-emoji').first();
      await reaction.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await reaction.evaluate(n => getComputedStyle(n).outlineOffset), '-3px');
      await reaction.hover(); await page.mouse.down();
      assert.equal(await reaction.evaluate(n => getComputedStyle(n).borderRadius), '50%', 'pressed reactions remain circular');
      await page.mouse.up();
      if (width === 390 && theme === 'dark') {
        await page.evaluate(() => kit.F.nav.go('/chats/')); await page.locator('.ch-row').first().waitFor(); await settle(page);
        assert.equal(await page.locator('.ch-list').first().evaluate(n => getComputedStyle(n).borderRadius), '22px');
        assert.equal(await page.locator('.ch-row').first().evaluate(n => getComputedStyle(n).borderRadius), '16px', 'list row press and focus backgrounds have rounded corners');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => kit.state.csp), []);
    } finally { await ctx.close(); }
  });
}
test('native Chats reactions, card actions and tracker zoom controls keep rounded centered geometry', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  try {
    await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
    await ctx.route(`${KIT}/geometry-native`, r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/chats/styles.css"><link rel="stylesheet" href="/chats/cards.css"></head><body><div class="menu-pop"><div class="rrow">${['❤️','👍','😂','😮','😢','🙏'].map(e => `<button>${e}</button>`).join('')}</div></div><article class="cd-card"><div class="cd-acts"><button class="cd-btn">Suggest another time</button><button class="cd-btn">Keep this plan</button></div><a class="cd-open" href="#">Open Weather</a></article></body></html>` }));
    const page = await ctx.newPage(); await page.goto(`${KIT}/geometry-native`); await page.bringToFront();
    const native = await page.locator('.rrow button').evaluateAll(glyphs);
    assert.equal(new Set(native.map(r => Math.round(r.top))).size, 2);
    for (const r of native) { assert.equal(r.width, 48); assert.equal(r.height, 48); assert.equal(r.radius, '50%'); assert.ok(Math.abs(r.dx) < 2.5 && Math.abs(r.dy) < 2.5, JSON.stringify(r)); }
    assert.equal(await page.locator('.cd-card').evaluate(n => getComputedStyle(n).borderRadius), '26px');
    for (const selector of ['.cd-btn', '.cd-open']) assert.ok(await page.locator(selector).first().evaluate(n => { const s = getComputedStyle(n); return parseFloat(s.borderRadius) > 20 && n.getBoundingClientRect().height >= 44; }));
    await ctx.route(`${KIT}/geometry-tracker`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/chats/tracker.css"></head><body><main class="tk"><div class="tk-zoom"><button data-z="in">+</button><button data-z="out">−</button><button data-z="reset">All</button></div></main></body></html>' }));
    await page.goto(`${KIT}/geometry-tracker`);
    const zoom = await page.locator('.tk-zoom button:not([data-z=reset])').evaluateAll(glyphs);
    for (const r of zoom) { assert.equal(r.width, 44); assert.equal(r.height, 44); assert.equal(r.radius, '50%'); assert.ok(Math.abs(r.dx) < 2.5 && Math.abs(r.dy) < 2.5); }
  } finally { await ctx.close(); }
});

for (const [width, theme] of [[390, 'dark'], [1440, 'light']]) test(`native Chats welcome CTA and invitation text stay opaque throughout entry at ${width}px ${theme}`, async () => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'no-preference' });
  try {
    await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
    const cta = (busy) => `<p class="wbrand ifl-brand"><img src="/chats/inflite.svg" alt="" width="22" height="22">Powered by InFlite</p><button class="btn wide wglow ifl-go"${busy ? ' disabled' : ''}>${busy ? 'Signing in…' : 'Sign in'}</button>${busy ? '' : '<p class="wnew ifl-new">New here? <a href="#join">Make an account</a></p>'}`;
    await ctx.route(`${KIT}/geometry-welcome`, r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/chats/styles.css"></head><body><main class="app"><section class="view"><div class="auth welcome night ifl-in"><div class="wtop ifl-top"><div class="wlogo ifl-logo"><img class="appicon" src="/chats/inflite.svg" alt="InFlite"></div><h1 class="wtitle ifl-title" aria-label="Chat">${[...'Chat'].map(c => `<span aria-hidden="true">${c}</span>`).join('')}</h1><p class="winvite">@pat asked you to join. Sign in or make your account, and their request is ready to send.</p><p class="winvite">You’ve been signed out, as this sign-in was ended on another device or by a new password.</p></div><div class="wcta ifl-cta">${cta(false)}</div></div></section></main></body></html>` }));
    const page = await ctx.newPage(); await page.goto(`${KIT}/geometry-welcome`); await page.bringToFront();
    assert.equal(await page.locator('.wlogo .appicon').getAttribute('src'), '/chats/inflite.svg');
    assert.equal(await page.locator('.wtitle span').first().evaluate(n => getComputedStyle(n).animationName), 'wletter', 'decorative wordmark keeps its own animation');
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      for (const state of [{}, { swap: true }, { again: true }, { again: true, swap: true }, { swap: true, busy: true }]) {
        await page.evaluate(({ state, html }) => {
          const welcome = document.querySelector('.welcome'), box = welcome.querySelector('.wcta');
          welcome.classList.toggle('again', !!state.again); box.classList.toggle('swap', !!state.swap); box.innerHTML = html;
          for (const n of welcome.querySelectorAll('.wcta, .winvite')) for (const a of n.getAnimations()) a.pause();
        }, { state, html: cta(!!state.busy) });
        const timing = await page.locator('.wcta, .winvite').evaluateAll(ns => ns.map(n => ({ name: getComputedStyle(n).animationName, animations: n.getAnimations().map(a => { const t = a.effect.getTiming(); return { duration: t.duration, delay: t.delay }; }) })));
        if (reduced) assert.ok(timing.every(t => t.name === 'none' && !t.animations.length), 'Reduce Motion disables initial, swap and return entrances');
        else for (const t of timing) for (const a of t.animations) assert.ok(a.duration <= 360 && a.delay <= 120, 'entry duration/delay stays bounded');
        for (const phase of ['delay', 'first', 'mid', 'final']) {
          const text = await page.evaluate(async (phase) => {
            for (const n of document.querySelectorAll('.wcta, .winvite')) for (const a of n.getAnimations()) {
              const t = a.effect.getTiming(), duration = Number(t.duration), delay = t.delay;
              a.currentTime = phase === 'delay' ? Math.max(0, delay - 1) : delay + duration * (phase === 'first' ? 0 : phase === 'mid' ? .5 : 1);
            }
            await new Promise(r => requestAnimationFrame(r));
            return [...document.querySelectorAll('.ifl-brand, .ifl-go, .ifl-new, .winvite')].map(n => {
              const chain = []; for (let p = n; p; p = p.parentElement) chain.push({ tag: p.className || p.tagName, opacity: getComputedStyle(p).opacity });
              return { text: n.textContent, chain };
            });
          }, phase);
          assert.ok(text.length >= 4);
          for (const item of text) assert.ok(item.chain.every(p => p.opacity === '1'), `${JSON.stringify(state)} ${reduced ? 'reduced' : 'full'} ${phase}: ${JSON.stringify(item)}`);
        }
      }
    }
  } finally { await ctx.close(); }
});
