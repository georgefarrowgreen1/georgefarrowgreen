// needs: hub
// Signing in through the sign-in page (auth.<site>), from every app and from InFlite's hub, on each kind of device the
// site is used on: an iPhone in Safari and from its Home Screen, an Android phone in Chrome, an iPad (which says it's a
// Mac), and computers in Chrome, Safari, Firefox and Edge. Each starts signed out in a browser of its own, signs in with
// email and password from the app's own Sign in, and must come back to that app, signed in there, with the site's
// sign-in cookie (one for every address on the site, out of any page's reach). The browsers are Chromium dressed as each
// (their screen, touch, what they say they are): what's tested is what the site does for each, not the engines.
// (Mail asks for the site's admin with a passkey, so it's left to mailauth.mjs; Today's API to todayauth.mjs.)
import { dress, chatSession, until, wait, HUB, CHAT, ACCOUNT_AT, CHROMIUM_ARGS } from './rooflib.mjs';
import { chromium } from 'playwright';
import { makeAccount, onAccountPage, usePassword } from './join.mjs';
import { randomBytes } from 'node:crypto';
const [,, , out] = process.argv;
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const WX = 'http://weather.ifl.test:8788', FIT = 'http://fitness.ifl.test:8788', MKT = 'http://finance.ifl.test:8788';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
};
const DEVICES = [
  { id: 'iphone-safari', ua: UA.iphone, w: 390, h: 844, mobile: true },
  { id: 'iphone-home', ua: UA.iphone, w: 390, h: 844, mobile: true, standalone: true },
  { id: 'android-chrome', ua: UA.android, w: 412, h: 915, mobile: true },
  { id: 'ipad-safari', ua: UA.ipad, w: 820, h: 1180, mobile: false, touch: true },  // (iPadOS: a Mac's words, a touchscreen)
  { id: 'mac-safari', ua: UA.safari, w: 1440, h: 900 },
  { id: 'win-chrome', ua: UA.chrome, w: 1280, h: 800 },
  { id: 'win-firefox', ua: UA.firefox, w: 1280, h: 800 },
  { id: 'win-edge', ua: UA.edge, w: 1366, h: 768 },
];
const ONLY = (process.env.MATRIX_DEVICES || '').split(',').filter(Boolean);

// Each app: where it opens, how its Sign in is started signed out, and how it says who's signed in once back
const meAt = (path) => async (p) => p.evaluate(async (u) => { try { const r = await fetch(u, { credentials: 'include' }); const j = await r.json().catch(() => ({})); return r.ok && (j.signedIn !== false) && !!(j.name || j.email || j.handle || j.id || j.user || j.signedIn) ? (j.name || j.handle || 'yes') : null; } catch (_) { return null; } }, path);
const hubMe = async (p) => p.evaluate(async () => { try { const j = await (await fetch('/api/session', { credentials: 'include' })).json(); return j.signedIn ? (j.name || 'yes') : null; } catch (_) { return null; } });
const APPS = [
  // (InFlite's own Sign in: Chats' trip on a phone or iPad, Today's own on a computer, where Chat doesn't open)
  { id: 'hub', home: HUB + '/', host: 'ifl.test', start: async (p) => { await p.goto(HUB + '/'); await p.waitForSelector('#signin', { state: 'visible', timeout: 30000 }); await wait(500); await p.click('#signin'); },
    me: async (p) => (await chatSession(p))?.token ? 'chat key' : await hubMe(p) },
  // (an app in InFlite's window, signed out: its Sign in, InFlite's menu's hub.signIn, and back to it)
  { id: 'hub-app', home: HUB + '/markets/', host: 'ifl.test', start: async (p, x) => { await p.goto(x.home); await p.waitForFunction(() => window.IFL?.hub?.on, null, { timeout: 30000 }); await wait(500); await p.evaluate(() => IFL.hub.signIn()); },
    back: (u) => u.pathname.startsWith('/markets/'),
    me: async (p) => (await chatSession(p))?.token ? 'chat key' : await hubMe(p) },
  { id: 'chat', home: CHAT + '/', host: 'chat.ifl.test', start: async (p) => p.goto(`${CHAT}/#signin-start`),
    me: async (p) => (await chatSession(p))?.token ? 'chat key' : null },
  { id: 'weather', home: `${WX}/?lat=51.5072&lon=-0.1276&name=London`, host: 'weather.ifl.test',
    start: async (p, x) => { await p.goto(x.home); await p.waitForSelector('#me-btn', { state: 'visible', timeout: 30000 }); await wait(800); await p.click('#me-btn'); },
    me: meAt('/api/weather/me') },
  { id: 'fitness', home: FIT + '/', host: 'fitness.ifl.test',
    start: async (p, x) => { await p.goto(x.home); await p.waitForSelector('#sign-in:not([disabled])', { state: 'visible', timeout: 30000 }); await wait(500); await p.click('#sign-in'); },
    me: meAt('/api/fitness/me') },
  { id: 'markets', home: MKT + '/', host: 'finance.ifl.test',
    start: async (p, x) => { await p.goto(x.home); await p.waitForSelector('#sign-in:not([disabled])', { state: 'visible', timeout: 30000 }); await wait(500); await p.click('#sign-in'); },
    me: meAt('/api/markets/me') },
  { id: 'account', home: ACCOUNT_AT + '/', host: 'account.ifl.test',
    start: async (p, x) => { await p.goto(x.home); await p.waitForSelector('main .signin .btn', { state: 'visible', timeout: 20000 }); await wait(400); await p.click('main .signin .btn'); },
    me: meAt('/api/account/me') },
];
const ONLY_APPS = (process.env.MATRIX_APPS || '').split(',').filter(Boolean);

// (the browser, opened again should it close under the test: a long run on a busy machine)
let b = null;
const browser = async () => (b?.isConnected() ? b : (b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: CHROMIUM_ARGS })));
await browser();
// the account, made once (as on any phone)
const handle = `mx${randomBytes(3).toString('hex')}`, email = `${handle}@example.com`;
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: UA.iphone, locale: 'en-GB' });
  await dress(ctx, 'maker');
  const p = await ctx.newPage();
  await makeAccount(p, `${ACCOUNT_AT}/`, { name: 'Morgan Vale', handle, email });
  await ctx.close();
}

const table = [];
for (const d of DEVICES.filter((d) => !ONLY.length || ONLY.includes(d.id))) {
  for (const a of APPS.filter((a) => !ONLY_APPS.length || ONLY_APPS.includes(a.id))) {
    const label = `${d.id} · ${a.id}`;
    // (Chat on a computer: not there by design (pigeon/theme.js), and it says so, with the way to a phone)
    if (a.id === 'chat' && !d.mobile && !d.touch) {
      const ctx = await (await browser()).newContext({ viewport: { width: d.w, height: d.h }, userAgent: d.ua, locale: 'en-GB' }); const p = await ctx.newPage();
      await p.goto(`${CHAT}/#signin-start`); const says = await p.waitForFunction(() => /isn’t available here/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true, () => false);
      ok(says, `${label} (computer: Chat says it opens on phones and iPads)`); table.push({ d: d.id, a: a.id, ok: says, why: 'not on computers, said so' }); await ctx.close(); continue;
    }
    // (a browser that closed as the context was made: opened again, and tried once more)
    const make = async () => {
      const c = await (await browser()).newContext({ viewport: { width: d.w, height: d.h }, screen: { width: d.w, height: d.h }, deviceScaleFactor: 2,
        isMobile: !!d.mobile, hasTouch: !!(d.mobile || d.touch), userAgent: d.ua, locale: 'en-GB', timezoneId: 'Europe/London' });
      await dress(c, label, { standalone: d.standalone });
      return c;
    };
    const ctx = await make().catch(() => make());
    // (an iPad says it's a Mac, and its touchscreen five points, as Chat checks; Chromium's touch emulation says one)
    if (d.touch) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true }));
    const p = await ctx.newPage();
    const t0 = Date.now();
    let step = 'start', why = '';
    try {
      await a.start(p, a);
      step = 'sign-in page';
      // (the account's page signs in on the sign-in page and comes back to itself, an address the helper takes for still
      // signing in: filled here instead)
      if (a.id === 'account') {
        await p.waitForURL((u) => u.hostname.startsWith('auth.'), { timeout: 30000 });
        await usePassword(p);
        await p.fill('main .signin input[name=email]', email); await p.fill('main .signin input[name=password]', 'a long test password');
        await p.click('main .signin form .btn');
        await p.waitForURL((u) => u.hostname === a.host, { timeout: 45000 });
      } else await onAccountPage(p, { email });
      step = 'back';
      if (a.id !== 'account') await p.waitForURL((u) => u.hostname === a.host && !/#signin=/.test(u.hash) && (!a.back || a.back(u)), { timeout: 45000 });
      else await p.waitForSelector('main .hero, main .ifh-me', { timeout: 30000 });
      step = 'signed in';
      const who = await until(() => a.me(p), 30000, 500);
      const cookie = (await ctx.cookies()).find((c) => c.name === 'account');
      const cookieOk = !!cookie && cookie.httpOnly && cookie.domain === '.ifl.test' && cookie.sameSite === 'Lax';
      const errs = ctx.__errs.filter((e) => !/Failed to load|ERR_|favicon|status of 4\d\d|Cross-Origin-Opener-Policy/.test(e));
      const good = !!who && cookieOk;
      why = `${who ? `as ${who}` : 'not signed in'}; cookie ${cookieOk ? 'ok' : JSON.stringify(cookie && { d: cookie.domain, s: cookie.sameSite, h: cookie.httpOnly })}; ${((Date.now() - t0) / 1000).toFixed(1)}s${errs.length ? `; errors: ${errs.slice(0, 2).join(' | ')}` : ''}`;
      ok(good, label, why);
      table.push({ d: d.id, a: a.id, ok: good, why });
      if (!good) await p.screenshot({ path: `${out}/${d.id}-${a.id}.png` }).catch(() => {});
    } catch (e) {
      why = `stuck at ${step}: ${String(e.message).split('\n')[0].slice(0, 160)} (at ${p.url().slice(0, 120)})`;
      ok(false, label, why);
      table.push({ d: d.id, a: a.id, ok: false, why });
      await p.screenshot({ path: `${out}/${d.id}-${a.id}.png` }).catch(() => {});
    }
    await ctx.close().catch(() => {});
  }
}
console.log('\nMATRIX');
for (const r of table) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.d.padEnd(15)} ${r.a.padEnd(8)} ${r.why}`);
console.log(`FAILS ${fails}`);
process.exit(0);
