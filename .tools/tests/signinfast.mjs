// needs: hub
// Signing in to an app already signed in to the site: the sign-in page's /go (functions/_signinfast.js) sends the
// browser straight back to the app with its code, and the sign-in page itself never opens (no page asked for at
// auth.<site>/). Today swaps the code with the word its tab kept and is signed in; Weather in a browser's tab, whose
// sign-in is the site's own, is just sent back. Signed out, /go is the sign-in page, its card asking for an email, with
// what the app said kept (the way back to the app).
import { dress, until, wait, HUB, ACCOUNT_AT, CHROMIUM_ARGS } from './rooflib.mjs';
import { chromium } from 'playwright';
import { makeAccount } from './join.mjs';
import { randomBytes, createHash } from 'node:crypto';
const [,, , out] = process.argv;
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const AUTH = 'http://auth.ifl.test:8788', WX = 'http://weather.ifl.test:8788';
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const word = () => { const verifier = b64url(randomBytes(32)); return { verifier, ask: b64url(createHash('sha256').update(verifier).digest()) }; };
const hubMe = async (p) => p.evaluate(async () => { try { const j = await (await fetch('/api/session', { credentials: 'include' })).json(); return j.signedIn ? (j.name || 'yes') : null; } catch (_) { return null; } });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: CHROMIUM_ARGS });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB', timezoneId: 'Europe/London' });
await dress(ctx, 'fast');
const p = await ctx.newPage();
// (every page the browser opened at the sign-in page's address, apart from /go itself)
const pages = [];
p.on('request', (r) => { const u = new URL(r.url()); if (r.isNavigationRequest() && u.hostname.startsWith('auth.') && u.pathname !== '/go') pages.push(u.pathname); });
const handle = `fs${randomBytes(3).toString('hex')}`;
await makeAccount(p, `${ACCOUNT_AT}/`, { name: 'Robin Ash', handle, email: `${handle}@example.com` });
ok(!!(await ctx.cookies()).find((c) => c.name === 'account'), 'signed in to the site (the account made on its page)');

// Today: its tab's word kept, then the sign-in page's /go: back at once with a code, swapped, signed in
await p.goto(HUB + '/'); await p.waitForLoadState('domcontentloaded');
await p.evaluate(() => { for (const k of Object.keys(sessionStorage)) sessionStorage.removeItem(k); });
const w = word();
await p.evaluate((v) => sessionStorage.setItem('inflite:signin-verifier', v), w.verifier);
pages.length = 0;
const t0 = Date.now();
const res = await p.goto(`${AUTH}/go?${new URLSearchParams({ signin: 'today', ask: w.ask, back: HUB + '/' })}`);
await p.waitForURL((u) => u.host === 'ifl.test:8788' && !/signin=/.test(u.hash), { timeout: 30000 });
ok(!pages.length, 'Today: no sign-in page on the way, just back', pages.join(' '));
ok(!!(await until(() => hubMe(p), 20000, 300)), `Today: signed in once back (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
ok(await p.evaluate(() => sessionStorage.getItem('inflite:signin-verifier') === null), 'Today: its word used up');
ok(res?.status() === 200, 'Today: its page, as the browser landed', String(res?.status()));

// Weather in a browser's tab (its sign-in the site's): straight back, nothing to swap
pages.length = 0;
const w2 = word();
await p.goto(`${AUTH}/go?${new URLSearchParams({ signin: 'weather', ask: w2.ask, back: WX + '/', jar: 'shared' })}`);
await p.waitForURL((u) => u.host === 'weather.ifl.test:8788', { timeout: 30000 });
ok(!pages.length, 'Weather in a tab: straight back, no sign-in page', pages.join(' '));

// signed out: /go is the sign-in page, asking for an email, the app's way back kept
const fresh = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-GB' });
await dress(fresh, 'fast-out');
const q = await fresh.newPage();
// (signed out on Today: Sign in on the screen, its connection to the sign-in page made ahead: IFL.warm)
await q.goto(HUB + '/'); await q.waitForSelector('#signin', { state: 'visible', timeout: 30000 });
const warm = await q.evaluate(() => [...document.querySelectorAll('link[rel=preconnect], link[rel=dns-prefetch]')].map((l) => `${l.rel} ${l.href}`));
ok(warm.some((x) => /^preconnect http:\/\/auth\.ifl\.test:8788\/?$/.test(x)), 'signed out on Today: the sign-in page’s connection made ahead', warm.join(', '));
const w3 = word();
await q.goto(`${AUTH}/go?${new URLSearchParams({ signin: 'today', ask: w3.ask, back: HUB + '/' })}`);
await q.waitForSelector('main .signin input[name=email]', { state: 'attached', timeout: 30000 });
ok(new URL(q.url()).host === 'auth.ifl.test:8788', 'signed out: on to the shared sign-in page');
ok(await q.evaluate(() => { try { const k = JSON.parse(sessionStorage.getItem('acct-for') || 'null'); return k?.app === 'today' && /ifl\.test/.test(k.back); } catch (_) { return false; } }), 'and what Today said kept, for the way back');
await q.screenshot({ path: `${out}/signed-out.png` }).catch(() => {});
const errs = [...(ctx.__errs || []), ...(fresh.__errs || [])].filter((e) => !/Failed to load|ERR_|favicon|status of 4\d\d|Cross-Origin-Opener-Policy/.test(e));
ok(!errs.length, 'no errors on the pages', errs.slice(0, 3).join(' | '));
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
