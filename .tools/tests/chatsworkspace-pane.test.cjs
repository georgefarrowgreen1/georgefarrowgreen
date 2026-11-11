const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright'), { resolve } = require('node:path'), { existsSync, readFileSync } = require('node:fs');
const ROOT = resolve(__dirname, '../..'), IFL = resolve(ROOT, '../inflite');
let browser, serveKit, KIT, IDS;
before(async () => {
  ({ serveKit, KIT } = await import('./roofkit/serve.mjs'));
  ({ IDS } = await import('./unit/fixtures/chats.mjs'));
  browser = process.env.CHATS_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
});
after(async () => browser?.close());

test('real Chats keeps one desktop OS service, its root and the core-owned draft through pane/native reparenting', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, colorScheme: 'light', reducedMotion: 'reduce' });
  await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
  // The standard scripted core has no storage. Add only its existing draft/open wire fields,
  // so this test exercises native hide/flush/open restoration without handling a real account.
  const core = readFileSync(ROOT + '/.tools/tests/roofkit/chatcore-stub.js', 'utf8')
    .replace('"__KIT_STATE__"', '"ready"')
    .replace('const calls = (self.kitCalls = {});', 'const calls = (self.kitCalls = {}), drafts = new Map();')
    .replace('const c = chatOf(id); patch', 'const c = { ...chatOf(id), draft: drafts.get(id) || "" }; patch')
    .replace('draft: () => ({ ok: true })', 'draft: (id, text) => { drafts.set(id, text); return { ok: true }; }');
  await ctx.route('**/chats/roof/core.js*', r => r.fulfill({ body: core, contentType: 'text/javascript' }));
  await ctx.addInitScript(() => {
    const NativeWorker = Worker; window.chatWorkers = 0; window.chatCalls = [];
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); window.chatWorkers++; }
      postMessage(message, ...rest) { window.chatCalls.push(message.m); return super.postMessage(message, ...rest); }
    };
  });
  const page = await ctx.newPage(), errors = []; page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(KIT + '/?module=/chats/roof/chats.js&apps=chats&service=stub'); await page.waitForFunction(() => window.kit?.ready);
    await page.evaluate(async id => {
      const f = kit.F, v = window.chView = f.view('chats'); window.chOriginalRoot = v.root; window.chOriginalElement = v.el;
      v.fw.workspace = { enabled: true, active: () => v.fw.visible(), provide(p) { window.chProvider = p; return () => { window.chProvider = null; }; }, changed() {} };
      f.nav.go('/chats/#open=' + id); window.chInstance = await v.load(); await chInstance.workspace();
      await (await import('/roof/modules.js')).loadStyles('/chats/roof/workspace.css');
    }, IDS.pat);
    await page.locator('.ch-input').waitFor({ state: 'visible' });
    await page.locator('.ch-input').fill('A draft kept by the existing Chat core');
    await page.evaluate(async id => {
      const slot = document.createElement('section'); slot.id = 'ch-test-pane'; Object.assign(slot.style, { position: 'fixed', top: '120px', left: '24px', width: '420px', height: '600px', overflow: 'hidden', zIndex: '20' }); document.body.append(slot);
      kit.F.nav.go('/#apps');
      const { parse } = await import('/roof/router.js');
      chView.attach({ container: slot, workspace: chView.fw.workspace, navigate: p => chView.show(parse(p, { roof: true })), header() {} });
      await chView.show(parse('/chats/#open=' + id, { roof: true }));
    }, IDS.pat);
    await page.waitForFunction(() => document.querySelector('#ch-test-pane .ch-input')?.value === 'A draft kept by the existing Chat core');
    assert.equal(await page.locator('#ch-test-pane .ch-send').isEnabled(), true, 'the restored draft is ready to send only on a later explicit tap');
    for (const width of [320, 700, 420]) {
      await page.evaluate(width => { document.getElementById('ch-test-pane').style.setProperty('width', width + 'px'); }, width);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const geometry = await page.evaluate(() => {
        const slot = document.getElementById('ch-test-pane'), composer = slot.querySelector('.ch-composer'), pane = slot.getBoundingClientRect(), form = composer.getBoundingClientRect(), scroller = slot.querySelector('.ch-scroller');
        return { same: chView.root === chOriginalRoot && chView.el === chOriginalElement, position: getComputedStyle(slot.querySelector('.ch-chat')).position,
          left: form.left >= pane.left - 1, right: form.right <= pane.right + 1, bottom: form.bottom <= pane.bottom + 1,
          localScroll: getComputedStyle(scroller).overflowY, overflow: chView.root.scrollWidth > slot.clientWidth + 1, workers: chatWorkers };
      });
      assert.equal(geometry.same, true); assert.equal(geometry.position, 'absolute');
      assert.equal(geometry.left && geometry.right && geometry.bottom, true, JSON.stringify(geometry));
      assert.equal(geometry.localScroll, 'auto'); assert.equal(geometry.overflow, false); assert.equal(geometry.workers, 1);
    }
    await page.evaluate(() => document.getElementById('ch-test-pane').style.setProperty('width', '360px'));
    await page.setViewportSize({ width: 430, height: 500 });
    await page.waitForFunction(() => document.querySelector('#ch-test-pane .ch-composer').getBoundingClientRect().bottom <= visualViewport.height + visualViewport.offsetTop + 1);
    await page.setViewportSize({ width: 1440, height: 980 });
    const files = await page.evaluate(() => chProvider.files());
    assert.equal(files.status, 'ready'); assert.equal(files.files.length, 2); assert.ok(files.files.every(f => !f.id.includes('m-a-3')));
    assert.equal((await page.evaluate(id => chProvider.run('reply', id), IDS.pat)).ok, true);
    assert.equal(await page.locator('#ch-test-pane .ch-input').evaluate(el => document.activeElement === el), true);
    await page.evaluate(() => chView.hide());
    assert.equal((await page.evaluate(() => chProvider.run('new-chat'))).ok, false);
    assert.deepEqual((await page.evaluate(() => chProvider.files())).files, [], 'hidden Chat drops plaintext and indexed metadata');
    await page.evaluate(async id => { const { parse } = await import('/roof/router.js'); await chView.show(parse('/chats/#open=' + id, { roof: true })); }, IDS.pat);
    await page.waitForFunction(() => document.querySelector('#ch-test-pane .ch-input')?.value === 'A draft kept by the existing Chat core');
    await page.evaluate(() => kit.F.nav.go('/chats/#open=' + chProvider.files().files[0].objectId.split(':')[0]));
    await page.waitForFunction(() => document.querySelector('#views #m-chats .ch-input')?.value === 'A draft kept by the existing Chat core');
    const native = await page.evaluate(async () => ({ same: chView.root === chOriginalRoot && chView.el === chOriginalElement && await chView.load() === chInstance,
      embedded: chView.root.classList.contains('ifl-in-pane'), position: getComputedStyle(chView.root.querySelector('.ch-chat')).position, workers: chatWorkers,
      sent: chatCalls.some(m => ['sendText', 'sendBlob', 'sendRun'].includes(m)) }));
    assert.equal(native.same, true); assert.equal(native.embedded, false); assert.equal(native.position, 'fixed'); assert.equal(native.workers, 1); assert.equal(native.sent, false);
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => kit.state.csp), []);
  } catch (error) { console.error(await page.evaluate(() => ({ route: kit.F.route, calls: chatCalls, workers: chatWorkers, input: document.querySelector(".ch-input")?.value, status: chProvider?.snapshot(), paneVisible: !document.querySelector("#ch-test-pane .ch-chat")?.hidden }))); throw error; } finally { await ctx.close(); }
});
