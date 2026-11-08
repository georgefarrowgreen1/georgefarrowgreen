// The home page's way in (georgefarrowgreen.com), through the sign-in page on the other site (auth.inflite.ai) and back:
// Sign in there, then the sign-in carried over to the home page by a hop (functions/_hop.js: start on the home page,
// issue on the apps' site, finish on the home page), the picture the sign-in page ended on there from the first frame.
// With a photo of the kind that makes the picture's copy of it large (fine detail), the way back's addresses stay
// short (the picture rides in the #, which the browser carries through each step and no server sees), it ends signed
// in, quickly, with the photo in the picture; and the same signed in on the apps' site already (one tap: Continue).
// (The sites stood in for by gfg.test and ifl.test, as in home.mjs.)
import { chromium } from 'playwright';
import { makeAccount } from './join.mjs';
import { randomBytes } from 'node:crypto';
const [,, , out] = process.argv;
const SITE = 'http://gfg.test:8788', CHAT = 'http://chat.ifl.test:8788', ACCT = 'http://account.ifl.test:8788', AUTH = 'http://auth.ifl.test:8788';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--host-resolver-rules=MAP *.gfg.test 127.0.0.1, MAP gfg.test 127.0.0.1, MAP *.ifl.test 127.0.0.1, MAP ifl.test 127.0.0.1', `--unsafely-treat-insecure-origin-as-secure=${SITE},${CHAT},${ACCT},${AUTH}`] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function phone(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: 'en-GB' });
  const p = await ctx.newPage(), errs = [], navs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  ctx.on('request', (r) => { if (r.isNavigationRequest()) navs.push({ url: r.url(), at: Date.now() }); });
  ctx.on('response', (r) => { const n = navs.find((x) => x.url === r.url() && !x.status); if (n) n.status = r.status(); });
  return { ctx, p, errs, navs, name };
}
const handle = `hh${randomBytes(3).toString('hex')}`, email = `${handle}@example.com`;

// ---- an account with a photo full of fine detail (what makes its small copy largest) ----
const A = await phone('maker');
await makeAccount(A.p, `${ACCT}/`, { name: 'Harper Lowe', handle, email });
const put = await A.p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = c.height = 600; const g = c.getContext('2d'), d = g.createImageData(600, 600);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  const r = await fetch('/api/account/me/photo', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob, credentials: 'include' });
  return [r.status, blob.size];
});
ok(put[0] === 200, 'a detailed photo put on the account', JSON.stringify(put));
await A.ctx.close();

// ---- 1. a visitor signs in from the account page and returns; an InFlite member needs no button ----
async function trip(x, label, signIn) {
  await x.p.goto(`${SITE}/`); await x.p.waitForSelector('body.known', { timeout: 20000 });
  ok(!(await x.p.$('#sign-in')), `${label}: no header Sign in button`);
  if (signIn) {
    await x.p.goto(`${AUTH}/#signin=home`);
    await signIn();
  }
  const t0 = Date.now();
  await x.p.waitForURL((u) => u.hostname === 'gfg.test', { timeout: 30000 }).catch(() => {});
  const backAt = Date.now();
  const signed = await x.p.waitForSelector('#me', { state: 'visible', timeout: 15000 }).then(() => true, () => false);
  const doneAt = Date.now();
  const hops = x.navs.filter((n) => /\/api\/hop\//.test(n.url) || n.url.startsWith(SITE));
  const longest = Math.max(0, ...x.navs.map((n) => n.url.length));
  const photoInQuery = x.navs.some((n) => /\/api\/hop\//.test(n.url) && /signedin|[?&]p=|%26p%3D/.test(n.url.split('#')[0]));
  const picture = await x.p.evaluate(() => !!window.backPhoto || !!document.querySelector('#face img')?.complete);
  await x.p.screenshot({ path: `${out}/${label}.png` });
  ok(signed, `${label}: back on the home page, signed in`, `${backAt - t0} ms to the home page, ${doneAt - t0} ms till signed in; at ${x.p.url().slice(0, 80)}`);
  ok(longest < 2000, `${label}: every address on the way short (the picture in the #, never in a server's address)`, `longest ${longest} chars: ${hops.map((h) => `${new URL(h.url).host}${new URL(h.url).pathname} ${h.status ?? '?'} ${h.url.length}`).join(' → ')}`);
  ok(!photoInQuery, `${label}: no server's address carries the picture`);
  ok(picture, `${label}: the profile photo is available`);
  ok(!x.errs.length, `${label}: no page errors`, x.errs.slice(0, 3).join(' | '));
}
const V = await phone('visitor');
await trip(V, '1-visitor', async () => {
  await V.p.waitForSelector('main .signin input[name=email]', { timeout: 20000 });
  await V.p.fill('main .signin input[name=email]', email); await V.p.fill('main .signin input[name=password]', 'a long test password');
  await V.p.click('main .signin form .btn');
});

// ---- 2. signed in on the apps' site already (Chat, say), not on the home page: one tap, Continue ----
const W = await phone('apps');
await W.p.goto(`${AUTH}/#signin=home`); await W.p.waitForSelector('main .signin input[name=email]', { timeout: 20000 });
await W.p.fill('main .signin input[name=email]', email); await W.p.fill('main .signin input[name=password]', 'a long test password');
await W.p.click('main .signin form .btn');
await W.p.waitForURL((u) => u.hostname === 'gfg.test', { timeout: 30000 }).catch(() => {});
// (signed out of the home page only: its cookie gone, the apps' kept)
await W.ctx.clearCookies({ domain: 'gfg.test' }); await W.ctx.clearCookies({ domain: '.gfg.test' });
W.navs.length = 0;
await trip(W, '2-apps-signed-in', null);

await b.close();
console.log(`FAILS ${fails}`);
