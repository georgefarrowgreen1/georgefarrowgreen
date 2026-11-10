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
async function settled(page) {
  await page.evaluate(async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
function wav() {
  const b = Buffer.alloc(44 + 32000);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(32000, 40);
  for (let i = 0; i < 16000; i++) b.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 8000) * 500), 44 + i * 2);
  return [...b];
}
async function open(width, colorScheme, reducedMotion = 'no-preference') {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width, height: 844 }, colorScheme, reducedMotion });
  await serveKit(ctx, { main: ROOT + '/', ifl: IFL + '/' });
  const core = readFileSync(resolve(__dirname, 'roofkit/chatcore-stub.js'), 'utf8')
    .replaceAll('__KIT_STATE__', 'ready')
    .replace('let state =', 'W.chats[IDS.pat].older=false;let lastSend=null;let state =')
    .replace('sendText: (id, text) => {', 'sendText: (id, text, opts) => {lastSend={id,text,opts};')
    .replace('if (name === "me") return { me: W.me };', 'if (name === "me") return { me: W.me, lastSend };')
    .replace('photo: () => { need(); return blob(); },', `photo: (id) => { need(); return id==='vo-p-5' ? new Blob([new Uint8Array(${JSON.stringify(wav())})],{type:'audio/wav'}) : blob(); },`);
  await ctx.route(`${KIT}/chats/roof/core.js*`, r => r.fulfill({ contentType: 'text/javascript', body: core }));
  await ctx.route(`${KIT}/api/**`, r => r.fulfill({ json: { signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } } }));
  const page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    window.__mediaUrls = { created: [], revoked: [] };
    URL.createObjectURL = blob => { const url = create(blob); __mediaUrls.created.push(url); return url; };
    URL.revokeObjectURL = url => { __mediaUrls.revoked.push(url); return revoke(url); };
    window.__chatCspDetails = [];
    document.addEventListener('securitypolicyviolation', e => __chatCspDetails.push({ stage: window.__chatStage, directive: e.violatedDirective, blockedURI: e.blockedURI, sourceFile: e.sourceFile, lineNumber: e.lineNumber, columnNumber: e.columnNumber, sample: e.sample, disposition: e.disposition }));
  });
  await page.goto(`${KIT}/?module=/chats/roof/chats.js&apps=weather,chats&service=stub`);
  await page.bringToFront();
  await page.waitForFunction(() => window.kit?.ready);
  await page.evaluate(id => kit.F.nav.go('/chats/#open=' + id), IDS.pat);
  await page.locator('.ch-input').waitFor(); await page.locator('.ch-b[role=button]').first().waitFor(); await settled(page);
  return { ctx, page, errors };
}
for (const [width, theme, motion] of [[320, 'light', 'reduce'], [390, 'light', 'no-preference'], [1280, 'dark', 'no-preference']]) {
  test(`message actions, keyboard Reply and CSP-safe voice playback at ${width}px ${theme}`, async () => {
    const { ctx, page, errors } = await open(width, theme, motion);
    try {
      const bubble = page.locator('.ch-b[role=button]').first();
      await bubble.focus(); await page.keyboard.press('Enter');
      await page.locator('dialog[data-sheet=hold] [data-act=reply]').waitFor(); await settled(page);
      assert.equal(await page.locator('.chs-react [data-act=react]').count(), 6);
      await page.keyboard.press('Escape'); await page.locator('dialog[data-sheet=hold]').waitFor({ state: 'detached' });
      await bubble.focus(); await page.keyboard.press('Space');
      await page.locator('dialog[data-sheet=hold] [data-act=reply]').click();
      await page.locator('dialog[data-sheet=hold]').waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement === document.querySelector('.ch-input'));
      assert.equal(await page.locator('.ch-reply').getAttribute('aria-label'), 'Replying to Pat');
      assert.match(await page.locator('.ch-reply-copy').innerText(), /Pat/);
      await page.locator('.ch-input').fill('A reply with\na second line'); await settled(page);
      const geometry = await page.locator('.ch-composer').evaluate(n => {
        const r = n.getBoundingClientRect(), input = n.querySelector('textarea').getBoundingClientRect(), cancel = n.querySelector('.ch-reply-cancel').getBoundingClientRect();
        return { bottom: r.bottom, inputHeight: input.height, cancelWidth: cancel.width, cancelHeight: cancel.height, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.equal(geometry.overflow, false); assert.ok(geometry.bottom <= 845); assert.ok(geometry.inputHeight >= 60, 'multiline typing retains its two lines');
      assert.equal(geometry.cancelWidth, 44); assert.equal(geometry.cancelHeight, 44);
      await page.locator('.ch-send').click();
      await page.waitForFunction(() => document.querySelector('.ch-input').value === '' && document.querySelector('.ch-reply').hidden);
      await page.waitForFunction(() => [...document.querySelectorAll('.ch-words')].some(n => n.textContent === 'A reply with\na second line'));
      await settled(page);
      const anchored = () => page.locator('.ch-scroller').evaluate(n => ({ gap: n.scrollHeight - n.scrollTop - n.clientHeight, latest: document.querySelector('.ch-latest').hidden }));
      assert.ok((await anchored()).gap < 65, 'sending a reply stays at the latest message: ' + JSON.stringify(await anchored()));
      const sent = await page.evaluate(async () => { const svc = await kit.F.forModule('chats').service(); return (await svc.call('meta', 'me')).lastSend; });
      assert.deepEqual(sent, { id: IDS.pat, text: 'A reply with\na second line', opts: { replyTo: 'm-p-1' } });
      await page.locator('.ch-b[role=button]').last().click(); await page.locator('dialog[data-sheet=hold] [data-act=reply]').click();
      await page.locator('dialog[data-sheet=hold]').waitFor({ state: 'detached' });
      await page.locator('.ch-reply-cancel').click(); assert.equal(await page.locator('.ch-reply').isHidden(), true);
      await settled(page);
      assert.ok((await anchored()).gap < 65, 'canceling a reply retains the latest position: ' + JSON.stringify(await anchored()));
      await page.locator('.ch-vn').click(); await page.locator('.chs-audio').waitFor({ state: 'attached' });
      await page.waitForFunction(() => document.querySelector('.chs-audio').readyState >= 1);
      await settled(page);
      const audio = await page.locator('.chs-audio').evaluate(n => ({ controls: n.controls, duration: n.duration, src: n.src, images: n.closest('dialog').querySelectorAll('img').length }));
      assert.equal(audio.controls, false); assert.equal(audio.duration, 2); assert.equal(audio.images, 0);
      const play = page.locator('.chs-play'), seek = page.locator('.chs-seek');
      assert.ok(await play.evaluate(n => n.getBoundingClientRect().height >= 44));
      await play.click(); await page.waitForFunction(() => !document.querySelector('.chs-audio').paused);
      await page.getByRole('button', { name: 'Pause voice message' }).click();
      await page.waitForFunction(() => document.querySelector('.chs-audio').paused);
      await seek.focus(); await seek.press('Home'); await seek.press('ArrowRight');
      assert.ok(await page.locator('.chs-audio').evaluate(n => n.currentTime >= .09), 'native range keyboard seeking moves playback');
      assert.match(await seek.getAttribute('aria-valuetext'), /of 0:02/);
      await settled(page);
      await play.click(); await page.waitForFunction(() => !document.querySelector('.chs-audio').paused);
      await page.locator('.chs-audio').evaluate(n => { window.__closedVoice = n; });
      await page.locator('dialog[data-sheet=view] [data-close]').click();
      await page.locator('dialog[data-sheet=view]').waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(src => __mediaUrls.revoked.filter(u => u === src).length, audio.src), 1);
      assert.deepEqual(await page.evaluate(() => ({ paused: __closedVoice.paused, src: __closedVoice.getAttribute('src') })), { paused: true, src: null });
      if (width === 390) {
        await page.evaluate(() => { const original = HTMLMediaElement.prototype.play; window.__playInvocations = 0; window.__restorePlay = () => { HTMLMediaElement.prototype.play = original; }; HTMLMediaElement.prototype.play = () => { __playInvocations++; return new Promise((_, reject) => { window.__rejectPlay = reject; }); }; });
        await page.locator('.ch-vn').click(); await page.locator('.chs-play').focus(); await page.locator('.chs-play').press('Enter'); await page.locator('.chs-play').press('Enter');
        assert.equal(await page.locator('.chs-play').getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('.chs-play').isDisabled(), false, 'pending playback retains the keyboard focus target');
        assert.deepEqual(await page.evaluate(() => ({ focused: document.activeElement === document.querySelector('.chs-play'), calls: __playInvocations })), { focused: true, calls: 1 });
        await page.locator('dialog[data-sheet=view] [data-close]').click();
        await page.locator('dialog[data-sheet=view]').waitFor({ state: 'detached' });
        await page.evaluate(() => { __rejectPlay(new DOMException('Interrupted', 'AbortError')); __restorePlay(); });
        await settled(page);
      }
      assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => kit.state.csp), [], JSON.stringify(await page.evaluate(() => __chatCspDetails)));
    } finally { await ctx.close(); }
  });
}
