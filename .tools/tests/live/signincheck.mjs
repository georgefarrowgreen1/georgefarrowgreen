// The nightly check of signing in on the real site (.github/workflows/signin-check.yml): a test account signs in with
// its password from each app's own Sign in (InFlite's hub, Weather, Fitness, Markets and the account's page), on an
// iPhone in Safari and a computer in Chrome (as Chromium dressed as each), through the sign-in page (auth.<site>), and
// must come back to that app signed in there, with the site's sign-in cookie. Nothing is made, changed or sent: it
// signs in, looks, and signs nothing out (each browser's thrown away).
//   SITE=https://inflite.ai CHECK_EMAIL=… CHECK_PASSWORD=… node .tools/tests/live/signincheck.mjs [out dir]
// Exit 0 when every one worked; 1, with a table of what didn't (and a screenshot of each in the out dir), when any didn't.
// (Use an account kept for this: each run is a dozen sign-ins on it, from new "devices".)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { onAccountPage } from '../join.mjs';

const SITE = new URL(process.env.SITE || 'https://inflite.ai').origin, host = new URL(SITE).host;
const at = (sub) => `${new URL(SITE).protocol}//${sub}.${host}`;
const EMAIL = process.env.CHECK_EMAIL, PASSWORD = process.env.CHECK_PASSWORD, OUT = process.argv[2] || 'signin-check';
if (!EMAIL || !PASSWORD) { console.log('No CHECK_EMAIL / CHECK_PASSWORD: nothing checked.'); process.exit(0); }
mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { id: 'iphone-safari', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', w: 390, h: 844, mobile: true },
  { id: 'computer-chrome', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', w: 1280, h: 800 },
];
const meAt = (path) => async (p) => p.evaluate(async (u) => { try { const r = await fetch(u, { credentials: 'include' }); const j = await r.json().catch(() => ({})); return r.ok && j.signedIn !== false && (j.name || j.handle || j.signedIn) ? 'yes' : null; } catch (_) { return null; } }, path);
const APPS = [
  // (InFlite: Chats' trip on a phone, Today's own on a computer)
  { id: 'inflite', home: `${SITE}/`, host, start: async (p) => { await p.waitForSelector('#signin', { state: 'visible', timeout: 30000 }); await p.click('#signin'); }, me: meAt('/api/session') },
  { id: 'weather', home: `${at('weather')}/?lat=51.5072&lon=-0.1276&name=London`, host: `weather.${host}`, start: async (p) => { await p.waitForSelector('#me-btn', { state: 'visible', timeout: 30000 }); await p.click('#me-btn'); }, me: meAt('/api/weather/me') },
  { id: 'fitness', home: `${at('fitness')}/`, host: `fitness.${host}`, start: async (p) => { await p.waitForSelector('#sign-in:not([disabled])', { state: 'visible', timeout: 30000 }); await p.click('#sign-in'); }, me: meAt('/api/fitness/me') },
  { id: 'markets', home: `${at('finance')}/`, host: `finance.${host}`, start: async (p) => { await p.waitForSelector('#sign-in:not([disabled])', { state: 'visible', timeout: 30000 }); await p.click('#sign-in'); }, me: meAt('/api/markets/me') },
  { id: 'account', home: `${at('account')}/`, host: `account.${host}`, own: true, start: async (p) => { await p.waitForSelector('main .signin .btn', { state: 'visible', timeout: 30000 }); await p.click('main .signin .btn'); }, me: meAt('/api/account/me') },
];

// (CHECK_LOCAL: the test stack's stand-in site, ifl.test, with its names mapped: .tools/tests/signinlive.mjs)
const args = process.env.CHECK_LOCAL ? (await import('../rooflib.mjs')).CHROMIUM_ARGS : [];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args });
const rows = [];
for (const d of DEVICES) for (const a of APPS) {
  const ctx = await b.newContext({ viewport: { width: d.w, height: d.h }, isMobile: !!d.mobile, hasTouch: !!d.mobile, userAgent: d.ua, locale: 'en-GB', timezoneId: 'Europe/London' });
  const p = await ctx.newPage(), t0 = Date.now(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  let step = 'opening', ok = false, why = '';
  try {
    await p.goto(a.home, { waitUntil: 'domcontentloaded', timeout: 45000 });
    step = 'its Sign in'; await a.start(p);
    step = 'the sign-in page';
    if (a.own) {
      await p.waitForURL((u) => u.hostname.startsWith('auth.'), { timeout: 30000 });
      await p.waitForSelector('main .signin input[name=email]', { timeout: 30000 });
      await p.fill('main .signin input[name=email]', EMAIL); await p.fill('main .signin input[name=password]', PASSWORD);
      await p.click('main .signin form .btn');
    } else await onAccountPage(p, { email: EMAIL, password: PASSWORD });
    step = 'coming back'; await p.waitForURL((u) => u.host === a.host && !/#signin=/.test(u.hash), { timeout: 60000 });
    step = 'signed in there';
    let who = null; for (let i = 0; i < 40 && !who; i++) { who = await a.me(p); if (!who) await p.waitForTimeout(500); }
    const c = (await ctx.cookies()).find((x) => /(^|__Secure-)account$/.test(x.name));
    ok = !!who && !!c && c.httpOnly && c.sameSite === 'Lax';
    why = `${who ? 'signed in' : 'not signed in'}; cookie ${c ? `${c.domain} ${c.sameSite}${c.httpOnly ? ' HttpOnly' : ''}` : 'none'}; ${((Date.now() - t0) / 1000).toFixed(1)}s`;
  } catch (e) { why = `stuck at ${step}: ${String(e.message).split('\n')[0].slice(0, 140)} (at ${p.url().slice(0, 100)})`; }
  if (errs.length) why += `; page errors: ${errs.slice(0, 2).join(' | ').slice(0, 200)}`;
  if (!ok) await p.screenshot({ path: `${OUT}/${d.id}-${a.id}.png` }).catch(() => {});
  rows.push({ d: d.id, a: a.id, ok, why });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${d.id.padEnd(16)} ${a.id.padEnd(8)} ${why}`);
  await ctx.close().catch(() => {});
}
await b.close();
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `\n${bad.length} of ${rows.length} sign-ins didn't work.` : `\nAll ${rows.length} sign-ins worked.`);
process.exit(bad.length ? 1 : 0);
