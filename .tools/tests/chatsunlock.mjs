// needs: hub
// Chats unlocked by Today's own sign-in, on a phone, without Chats' page: Today's trip carries Chats' word and a key pair
// for it (today/public/app.js chatTrip), the sign-in page sends back a code for Chat with the key sealed to that pair
// (account/app.js chatBack), and Today opens it and keeps Chat's sign-in where Chats looks (unlockChats). So signed in
// with a password on Today, Chat's session and key are on the phone before Chats is ever opened, Chats opens on its
// chats (not "Unlock Chats"), and Today and the apps are signed in too. On a computer, where Chats doesn't run, the trip
// asks for nothing of Chats.
import { dress, until, wait, HUB, ACCOUNT_AT, CHROMIUM_ARGS, chatSession } from './rooflib.mjs';
import { chromium } from 'playwright';
import { makeAccount, onAccountPage } from './join.mjs';
import { randomBytes } from 'node:crypto';
const [,, , out] = process.argv;
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const hubMe = async (p) => p.evaluate(async () => { try { const j = await (await fetch('/api/session', { credentials: 'include' })).json(); return j.signedIn ? (j.name || 'yes') : null; } catch (_) { return null; } });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: CHROMIUM_ARGS });
const handle = `cu${randomBytes(3).toString('hex')}`, email = `${handle}@example.com`;
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: 'en-GB' });
  await dress(ctx, 'maker');
  await makeAccount(await ctx.newPage(), `${ACCOUNT_AT}/`, { name: 'Casey Unlock', handle, email });
  await ctx.close();
}

// ---- a phone, signed out: Today's Sign in, a password on the sign-in page, back on Today ----
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE, locale: 'en-GB', timezoneId: 'Europe/London' });
await dress(ctx, 'phone');
const p = await ctx.newPage();
const navs = []; p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
await p.goto(HUB + '/'); await p.waitForSelector('#signin', { state: 'visible', timeout: 30000 }); await wait(500);
ok(!(await chatSession(p)), 'to begin with: no Chat sign-in on this phone');
await p.click('#signin');
await p.waitForURL((u) => u.hostname.startsWith('auth.'), { timeout: 30000 });
const asked = new URL(p.url());
await onAccountPage(p, { email });
await p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/' && !/signin=/.test(u.hash), { timeout: 45000 });
ok(!!(await until(() => hubMe(p), 20000, 300)), 'back on Today, signed in');
const s = await until(() => chatSession(p), 20000, 300);
ok(!!s?.token, 'and Chat’s sign-in and key on the phone, by the same sign-in', JSON.stringify(s));
ok(!navs.some((u) => new URL(u).pathname.startsWith('/chats/')), 'never by Chats’ page', navs.map((u) => new URL(u).pathname).join(' '));
ok(await p.evaluate(() => sessionStorage.getItem('inflite:chat-trip') === null), 'the trip’s key pair let go of');
// (Chats opened: its chats, not Unlock)
await p.goto(HUB + '/chats/');
await wait(4000);
const text = await p.evaluate(() => document.body.innerText);
const wayIn = await p.evaluate(() => [...document.querySelectorAll('.ifl-go, [data-act=unlock], [data-act=signin]')].some((e) => e.offsetParent !== null));
ok(!wayIn && !/Unlock Chats on this phone|Sign in to Chats/.test(text), 'Chats opens unlocked (no Sign in or Unlock on it)', text.slice(0, 160).replace(/\s+/g, ' '));
await p.screenshot({ path: `${out}/chats-open.png` }).catch(() => {});
const errs = (ctx.__errs || []).filter((e) => !/Failed to load|ERR_|favicon|status of 4\d\d|Cross-Origin-Opener-Policy/.test(e));
ok(!errs.length, 'no errors on the pages', errs.slice(0, 3).join(' | '));
await ctx.close();

// ---- a computer: Chats doesn't run there, so the trip asks nothing of it ----
const pc = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
await dress(pc, 'computer');
const q = await pc.newPage();
await q.goto(HUB + '/'); await q.waitForSelector('#signin', { state: 'visible', timeout: 30000 }); await wait(500);
await q.click('#signin');
await q.waitForURL((u) => u.hostname.startsWith('auth.'), { timeout: 30000 });
await q.waitForSelector('main .signin input[name=email]', { timeout: 30000 });
const kept = await q.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('acct-for') || 'null'); } catch (_) { return null; } });
ok(kept?.app === 'today' && !kept.chat, 'on a computer: Today’s trip carries nothing for Chats', JSON.stringify(kept && { app: kept.app, chat: kept.chat }));
ok(asked.hostname.startsWith('auth.'), '(the phone went by the sign-in page)');
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
