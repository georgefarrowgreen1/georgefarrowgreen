// The real Chat composer on the framework, with the kit's stub service. Reproduce Home Screen gaps and verify
// viewport geometry and tap targets through keyboard dismissal, multiline drafts, resume and rotation.
import { chromium, devices } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { serveKit, KIT } from './roofkit/serve.mjs';
import { IDS } from './unit/fixtures/chats.mjs';

const MAIN = new URL('../../', import.meta.url).pathname;
const IFL = process.env.ROOF_IFL ? process.env.ROOF_IFL.replace(/\/?$/, '/') : new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || process.argv[2] || '/tmp/chat-composer';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } });
// setViewportSize also resizes Playwright's screen. A phone's hardware screen stays the same when its keyboard opens.
await ctx.addInitScript(() => Object.defineProperties(screen, {
  width: { configurable: true, get: () => 390 }, height: { configurable: true, get: () => 844 },
}));
let fails = 0;
const ok = (value, name, detail = '') => { console.log(`${value ? 'PASS' : 'FAIL'} ${name}${value ? '' : `: ${detail}`}`); if (!value) fails++; };
try {
  await serveKit(ctx, { main: MAIN, ifl: IFL });
  await ctx.route(`${KIT}/chats/roof/core.js*`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(new URL('./roofkit/chatcore-stub.js', import.meta.url), 'utf8').replaceAll('__KIT_STATE__', 'ready') }));
  await ctx.route(`${KIT}/api/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } }) }));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.goto(`${KIT}/?module=/chats/roof/chats.js&apps=weather,chats&service=stub`);
  await p.waitForFunction(() => window.kit?.ready);
  await p.evaluate((id) => window.kit.F.nav.go(`/chats/#open=${id}`), IDS.pat);
  await p.locator('.ch-input').waitFor();
  await p.waitForFunction(() => document.querySelectorAll('.ch-b').length >= 5);

  const geometry = () => p.evaluate(() => {
    const vv = visualViewport, top = vv.offsetTop, foot = top + vv.height;
    const composer = document.querySelector('.ch-composer').getBoundingClientRect();
    const scroller = document.querySelector('.ch-scroller').getBoundingClientRect();
    const controls = [...document.querySelectorAll('.ch-input, .ch-send, .ch-attach, .ch-voice')];
    const targets = controls.every((n) => {
      const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.top >= top && r.bottom <= foot + 1 && r.left >= 0 && r.right <= innerWidth + 1 && (hit === n || n.contains(hit));
    });
    return { fits: targets && composer.bottom <= foot + 1 && scroller.bottom <= composer.top + 1, bottom: composer.bottom, foot, active: document.activeElement?.className, scale: vv.scale, screen: [screen.width, screen.height], inner: innerHeight, coarse: matchMedia('(any-pointer: coarse)').matches, keyboard: document.querySelector('.ch-chat').classList.contains('ch-kbup') };
  });
  const check = async (name, keyboard) => {
    let v;
    for (let i = 0; i < 20; i++) {
      v = await geometry();
      if (v.fits && (keyboard == null || v.keyboard === keyboard)) break;
      await p.waitForTimeout(50);
    }
    ok(v.fits && (keyboard == null || v.keyboard === keyboard), name, JSON.stringify(v));
  };
  const gap = (value) => p.evaluate((value) => { document.documentElement.style.setProperty('--fix-gap', `${value}px`); visualViewport.dispatchEvent(new Event('resize')); }, value);
  await gap(54);
  await check('Home Screen gap: whole message field and all buttons remain visible and tappable', false);
  await p.screenshot({ path: `${OUT}/composer-home-screen.png` });
  await p.locator('.ch-input').focus();
  for (const [height, correction, keyboard] of [[844, 54, false], [780, 20, false], [480, 54, true], [844, 90, false]]) {
    await p.setViewportSize({ width: 390, height });
    await gap(correction);
    await check(`${height}px viewport, ${correction}px correction, keyboard ${keyboard ? 'up' : 'down'}`, keyboard);
  }
  await p.locator('.ch-input').fill('One\nTwo\nThree\nFour\nFive\nSix');
  await check('Multiline draft keeps every control on screen');
  await p.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 740 });
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await check('Resume without resize refits the composer');
  await p.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
  await p.locator('.ch-input').fill('');
  await p.locator('.ch-input').blur();
  await p.setViewportSize({ width: 844, height: 390 });
  await gap(54);
  await check('Landscape rotation keeps the composer visible and tappable', false);
  await p.setViewportSize({ width: 390, height: 844 });
  await gap(54);
  await check('Return to portrait keeps the composer visible and tappable', false);
  await p.locator('#hd .ifl-back').click();
  await p.waitForFunction(() => document.querySelector('.ch-chat').hidden);
  await p.evaluate((id) => window.kit.F.nav.go(`/chats/#open=${id}`), IDS.pat);
  await p.waitForFunction(() => !document.querySelector('.ch-chat').hidden);
  await check('Reopening the conversation refits the composer', false);
  await p.locator('.ch-input').fill('Testing the message box');
  await p.locator('.ch-send').click();
  await p.waitForFunction(() => document.querySelector('.ch-input').value === '');
  ok(true, 'The send button accepts a tap and clears the message field');
  ok(!errors.length, 'No page or CSP errors', errors.join(' | '));
} finally {
  await ctx.close();
  await b.close();
}
console.log(`FAILS ${fails}`);
process.exitCode = fails ? 1 : 0;
