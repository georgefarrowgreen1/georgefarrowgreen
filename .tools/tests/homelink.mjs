// Chat opened from another Home Screen app (a Send to a friend link from Today or Markets): iOS shows it in its own small
// browser, still "standalone" but under that browser's bar, so the page is shorter than the screen and has no status
// bar inset. Chat mustn't size itself to the screen there (its Home Screen fix), or Sign in is pushed off the foot.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, b, URL } = K;
const view = async (viewport, screen) => {
  const ctx = await b.newContext({ viewport, screen, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => K.errs.push(`${e}`));
  await p.goto(URL + '#share=' + encodeURIComponent('Dry in Norwich for now.'));
  await p.waitForSelector('.ifl-go', { state: 'attached', timeout: 20000 }); await p.waitForTimeout(1600);
  const r = await p.evaluate(() => ({ fix: document.documentElement.classList.contains('fullscreen-fix'), bottom: document.querySelector('.ifl-go').getBoundingClientRect().bottom, h: window.innerHeight }));
  return { p, ctx, r };
};
// the small browser: 390 wide like the screen, but 720 tall of the screen's 844 (its bar above, its toolbar below)
const a = await view({ width: 390, height: 720 }, { width: 390, height: 844 });
ok(!a.r.fix, 'in iOS’s small browser: not sized to the screen', JSON.stringify(a.r));
ok(a.r.bottom <= a.r.h - 40, 'and Sign in is on the screen, above its foot', JSON.stringify(a.r));
await a.p.screenshot({ path: `${out}/small-browser-sign-in.png` }); await a.ctx.close();
// on its side, where no status bar runs over the page, the Home Screen fix still holds
const c = await view({ width: 844, height: 390 }, { width: 390, height: 844 });
ok(c.r.fix, 'on its side, filling the screen: still sized to the screen', JSON.stringify(c.r)); await c.ctx.close();
// The account's page opened the same way with no word of the app it came from (a link in an email read in Mail): laid
// out as in a browser, a sheet the whole window rather than a card at its foot, under the small browser's bottom bar
// (styles.css html.inbrowser); its own Home Screen app, filling the screen, still has its sheets as cards
const acct = async (viewport) => {
  const ctx = await b.newContext({ viewport, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => K.errs.push(`${e}`));
  await p.goto(URL.replace(/\/\/[^/:]+(:\d+)?\/.*$/, '//account.localhost$1/'));
  await p.waitForSelector('main .signin', { timeout: 20000 }); await p.waitForTimeout(800);
  // (a sheet, as the page draws one: its own rules place it)
  const r = await p.evaluate(async () => { const d = document.createElement('dialog'); d.className = 'sheet'; d.innerHTML = '<div class="sheet-body"><p>Sheet</p></div>'; document.body.append(d); d.showModal();
    await new Promise((y) => setTimeout(y, 900)); const x = d.getBoundingClientRect(); return { inbrowser: document.documentElement.classList.contains('inbrowser'), top: Math.round(x.top), bottom: Math.round(x.bottom), h: innerHeight }; });
  await p.screenshot({ path: `${out}/account-${viewport.width}x${viewport.height}.png` }); await ctx.close();
  return r;
};
const ab = await acct({ width: 390, height: 720 });
ok(ab.inbrowser && ab.top === 0 && ab.bottom === ab.h, 'the account’s page in iOS’s small browser: laid out as in a browser, a sheet the whole window', JSON.stringify(ab));
const af = await acct({ width: 844, height: 390 });
ok(!af.inbrowser, 'and on its side, filling the screen, as its own Home Screen app', JSON.stringify(af));
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
