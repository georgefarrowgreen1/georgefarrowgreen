// The sign-in page on a computer: the title, the card and the phone's code beside it in the middle of the window across
// (the pair, wider than the page's column, used to push everything to the right), and up and down where it fits; at
// common desktop sizes, signed out plainly and sent by an app (Today: its back pill, "Sign in to continue to Today"),
// and on a phone still one column with nothing past the screen's edge.
import { chromium } from 'playwright';
const [,, S, out] = process.argv;
const AUTH = 'http://auth.ifl.test:8788';
// (Today's own word for the trip, as its Sign in sends: 43 characters)
const TODAY = `${AUTH}/#signin=today&ask=${'a'.repeat(43)}&back=${encodeURIComponent('http://today.ifl.test:8788/')}`;
let fails = 0; const errs = [];
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1'] });
const measure = (p) => p.evaluate(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, c: (b.left + b.right) / 2 }; };
  return { cw: document.documentElement.clientWidth, ch: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
    h1: r(document.querySelector('.signin-shell h1')), pair: r(document.querySelector('.signpair')), card: r(document.querySelector('.signin-panel')),
    qr: r(document.querySelector('.signpair .qrc')), back: r(document.querySelector('.backapp')), welcome: r(document.querySelector('.signin-stage')),
    lead: document.querySelector('.signin-destination')?.textContent || '' };
});
async function page(w, hgt, url, mobile) {
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: hgt } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForSelector('main:not([aria-busy]) .signin-shell h1', { timeout: 20000 }); await p.waitForTimeout(1200);
  return { ctx, p };
}
for (const [label, url] of [['plain', `${AUTH}/`], ['from Today', TODAY]]) {
  for (const [w, hgt] of [[1920, 947], [1440, 789], [1280, 680], [1100, 760], [2560, 1300]]) {
    const { ctx, p } = await page(w, hgt, url);
    const m = await measure(p), mid = m.cw / 2, near = (a, n = 2) => Math.abs(a - mid) <= n;
    const at = `${label}, ${w}×${hgt}`;
    if (label === 'from Today' && w === 1920) ok(/continue to\s*Today/.test(m.lead) && !!m.back, `${at}: sent by Today (its back pill, "Sign in to continue to Today")`, m.lead);
    ok(!!m.card && !m.pair && !m.qr, `${at}: one card; phone sign-in requested separately`);
    ok(m.h1.l >= m.card.l && m.h1.r <= m.card.r, `${at}: the title stays inside the card`);
    ok(near(m.card.c), `${at}: the card centered across`);
    ok(m.sw <= m.cw, `${at}: nothing past the window's edge`, `${m.sw} of ${m.cw}`);
    if (m.sh <= m.ch) ok(m.card.t > 60 && m.card.b < m.ch, `${at}: card fits beneath header`);
    else ok(m.card.t < 160, `${at}: taller form scrolls from top`);
    await p.screenshot({ path: `${out}/desk-${label === 'plain' ? 'p' : 't'}-${w}.png` });
    await ctx.close();
  }
}
{
  const { ctx, p } = await page(0, 0, TODAY, true);
  const m = await measure(p);
  ok(!m.pair && !!m.card, 'phone: the card alone, no code beside it');
  ok(m.sw <= m.cw && Math.abs(m.card.c - m.cw / 2) <= 2, 'phone: the card in the middle, nothing past the screen', `${m.card.l.toFixed(0)}–${m.card.r.toFixed(0)} of ${m.cw}`);
  await p.screenshot({ path: `${out}/phone.png` });
  await ctx.close();
}
ok(!errs.length, 'no errors on the page', errs.join(' | '));
await b.close();
console.log(`FAILS ${fails}`); process.exit(fails ? 1 : 0);
