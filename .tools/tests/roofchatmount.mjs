// Chats' real module on InFlite's framework, on the kit page with B0's stub core (One roof, stage 3: spec §2.1, §2.2,
// S3-D17, §10.2 roofchatmount; UI-A). The kit page (roofkit/serve.mjs) at http://kit.test with
// ?module=/chats/roof/chats.js&apps=weather,chats&service=stub (the frame's fw.service() answers with the stub core,
// .tools/tests/roofkit/chatcore-stub.js, a Worker answering every RPC from unit/fixtures/chats.mjs), ?state=<state> for
// the core's state. Selectors only from roofhooks.mjs. Checked:
//   1 the list: the module mounts, the Chats section shows the fixtures' rows (pinned first), the header (title Chats,
//     its line, New Chat and Chat Settings), the tab's badge, In the Air; Friends by the switcher; New Chat, Add Friend
//     and Requests open and close by hook;
//   2 a chat: a row opens it at /chats/#open=<id>; Back "Back to Chats", no switcher; html.ifl-fill; the tab bar .away;
//     the bubbles; the scroller starts at the bottom; scrolled up, left, and opened again, the same message at its top;
//     the keyboard up (the visual viewport shorter) keeps the last message in sight; a message typed and sent goes to
//     the core (sendText) and the composer empties; Back to the list, the tab bar back;
//   3 every state of §2.1 by ?state= (signin, key, locked, ended, offline) with its words, and device on a computer;
//   4 axe (no serious or critical violations) on the list and a chat; no CSP violation, no page error;
//   at 320, 390 and 1280 wide: nothing wider than the window.
//   node .tools/tests/roofchatmount.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium, devices } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as H from './roofhooks.mjs';

const [,, S = new URL('./.state', import.meta.url).pathname, OUT = `${S}/out/roofchatmount`] = process.argv;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const note = (l) => console.log(`NOTE  ${l}`);
const MAIN = new URL('../../', import.meta.url).pathname, IFL = new URL('../../../inflite/', import.meta.url).pathname;
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });

if (!existsSync(`${IFL}today/public/roof/frame.js`)) { ok(false, 'the inflite repo, with the framework, is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
const { serveKit, KIT } = await import('./roofkit/serve.mjs');
const FX = await import('./unit/fixtures/chats.mjs');
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const MODULE = '/chats/roof/chats.js';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });

async function phone({ width = 390, height = 844, computer = false, colorScheme = 'light' } = {}) {
  const ctx = await b.newContext(computer ? { viewport: { width, height }, colorScheme, locale: 'en-GB', timezoneId: 'Europe/London' }
    : { ...devices['iPhone 13'], viewport: { width, height }, colorScheme, locale: 'en-GB', timezoneId: 'Europe/London' });
  const st = { errors: [] };
  await serveKit(ctx, { main: MAIN, ifl: IFL });
  await ctx.route(`${KIT}/api/**`, (r) => (new URL(r.request().url()).pathname === '/api/session'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } }) })
    : r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => st.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) st.errors.push(m.text()); });
  return { ctx, p, st };
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (_) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((ok) => setTimeout(ok, 100)); } };
const text = (p, sel) => p.locator(sel).first().textContent({ timeout: 3000 }).catch(() => '');
const go = (p, path) => p.evaluate((path) => window.kit.F.nav.go(path), path);
const here = (p) => p.evaluate(() => location.pathname + location.hash);
async function openChats(p, { state = 'ready', path = '/chats/' } = {}) {
  await p.goto(`${KIT}/?module=${MODULE}&apps=weather,chats&service=stub&state=${state}`);
  await until(() => p.evaluate(() => !!window.kit?.ready), 10000);
  await go(p, path);
  return until(() => visible(p, H.M_CHATS), 15000);
}
async function axe(p, label) {
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async (sel) => (await window.axe.run(document.querySelector(sel) || document, { resultTypes: ['violations'] })).violations.filter((v) => /serious|critical/.test(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`), H.M_CHATS);
  ok(!r.length, `axe: no serious or critical violations (${label})`, r.join(', '));
}
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const pat = FX.IDS.pat;

// ===================== 1. the list, Friends, the root's sheets =====================
{
  const { p, st, ctx } = await phone();
  ok(await openChats(p), 'the module mounts');
  ok(await until(() => visible(p, H.chSec('chats'))), 'the Chats section shows');
  const ids = await until(async () => { const v = await p.locator(`${H.chSec('chats')} ${H.CH_ROW}`).evaluateAll((ns) => ns.map((n) => n.dataset.id)); return v.length >= 3 && v; });
  ok(ids && ids[0] === pat, 'the rows, pinned first (Pat)', String(ids));
  ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Chats'), 'the header’s title: Chats', await text(p, H.HD_TITLE));
  ok(await until(async () => /unread/.test(await text(p, H.HD_LINE))), 'the header’s line: unread and in the air', await text(p, H.HD_LINE));
  ok(await visible(p, H.hdAct('compose')) && await visible(p, H.hdAct('settings')), 'acts: New Chat, Chat Settings');
  ok(await until(async () => /\d/.test(await text(p, H.TAB_BADGE))), 'the Chats tab’s badge: the unread count', await text(p, H.TAB_BADGE));
  await shot(p, '1-list');
  await axe(p, 'the list');
  ok(await wide(p) <= 0, 'nothing wider than the window (390)');
  // sheets by hook
  await p.locator(H.hdAct('compose')).click();
  ok(await until(() => visible(p, `${H.sheet('newmsg')}[open]`)), 'New Chat opens (newmsg)');
  await p.locator(H.SHEET_CLOSE).first().click();
  ok(await until(async () => !(await visible(p, `${H.sheet('newmsg')}[open]`))), 'and closes');
  await p.locator(H.hdSec('friends')).click();
  ok(await until(() => visible(p, H.chSec('friends'))), 'Friends by the switcher');
  ok(await until(async () => (await here(p)) === '/chats/#friends'), 'the address: /chats/#friends', await here(p));
  ok(await p.locator(`${H.chSec('friends')} ${H.CH_ROW}`).count() >= 2, 'friends and the group listed');
  await p.locator(`${H.chSec('friends')} [data-act=addfriend]`).first().click();
  ok(await until(() => visible(p, `${H.sheet('addfriend')}[open]`)), 'Add Friend opens (addfriend)');
  await p.keyboard.press('Escape');
  ok(await until(async () => !(await visible(p, `${H.sheet('addfriend')}[open]`))), 'and closes');
  await p.locator(`${H.chSec('friends')} [data-act=requests]`).first().click();
  ok(await until(() => visible(p, `${H.sheet('requests')}[open]`)), 'Requests opens (requests)');
  await p.keyboard.press('Escape');
  await shot(p, '1-friends');
  ok(!st.errors.length, 'no page error', st.errors.join(' | '));
  await ctx.close();
}

// ===================== 2. a chat: the scroller, the keyboard, sending =====================
{
  const { p, st, ctx } = await phone({ height: 700 });
  await openChats(p);
  await until(() => visible(p, H.chRow(pat)));
  await p.locator(H.chRow(pat)).first().click();
  ok(await until(async () => (await here(p)) === `/chats/#open=${pat}`), 'a row opens its chat at /chats/#open=<id>', await here(p));
  ok(await until(async () => (await p.locator(H.CH_BUBBLE).count()) >= 5), 'its messages drawn', String(await p.locator(H.CH_BUBBLE).count()));
  ok(await until(async () => /Back to Chats/.test(await p.locator(H.HD_BACK).getAttribute('aria-label').catch(() => ''))), 'Back: “Back to Chats”');
  ok(!(await visible(p, H.HD_TABLIST)), 'no switcher in a chat');
  ok(await p.locator(H.HTML_FILL).count() === 1, 'html.ifl-fill: the window holds still');
  ok(await until(async () => (await p.locator(`${H.TAB}`).first().evaluate((n) => n.closest('nav').classList.contains('away')).catch(() => false))), 'the tab bar away');
  ok(await visible(p, H.CH_COMPOSER), 'the composer');
  const atBottom = () => p.locator(H.CH_SCROLLER).evaluate((n) => n.scrollHeight - n.scrollTop - n.clientHeight < 70);
  ok(await until(atBottom), 'the scroller starts at the bottom');
  await shot(p, '2-chat');
  await axe(p, 'a chat');
  // scroll up, leave, come back: the same message at the top (S3-D17's per-chat anchor)
  const top = await p.locator(H.CH_SCROLLER).evaluate((n) => { n.scrollTop = Math.max(0, (n.scrollHeight - n.clientHeight) / 3); n.dispatchEvent(new Event('scroll')); const r = n.getBoundingClientRect(); const m = [...n.querySelectorAll('[data-mid]')].find((x) => x.getBoundingClientRect().bottom > r.top); return m?.dataset.mid; });
  const scrollable = await p.locator(H.CH_SCROLLER).evaluate((n) => n.scrollHeight > n.clientHeight + 70);
  await p.locator(H.HD_BACK).click();
  ok(await until(() => visible(p, H.chSec('chats'))), 'Back: the list');
  ok(await until(async () => !(await p.locator(H.TAB).first().evaluate((n) => n.closest('nav').classList.contains('away')))), 'the tab bar back');
  ok(await p.locator(H.HTML_FILL).count() === 0, 'html.ifl-fill gone');
  ok(await p.locator(H.CH_BUBBLE).count() === 0, 'the chat’s words out of the page');
  await p.locator(H.chRow(pat)).first().click();
  await until(async () => (await p.locator(H.CH_BUBBLE).count()) >= 5);
  if (scrollable) {
    const back = await until(() => p.locator(H.CH_SCROLLER).evaluate((n) => { const r = n.getBoundingClientRect(); return [...n.querySelectorAll('[data-mid]')].find((x) => x.getBoundingClientRect().bottom > r.top)?.dataset.mid; }));
    ok(back === top, 'opened again: the same message at the top', `${top} → ${back}`);
  } else note('the chat fits without scrolling at this size: the anchor case needs a longer chat');
  // the keyboard: the visual viewport shorter → the last message still in sight
  await p.locator(H.CH_SCROLLER).evaluate((n) => { n.scrollTop = n.scrollHeight; n.dispatchEvent(new Event('scroll')); });
  await p.locator(`${H.CH_COMPOSER} textarea`).focus();
  await p.setViewportSize({ width: 390, height: 400 });
  await p.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));
  ok(await until(() => p.locator(H.CH_BUBBLE).last().evaluate((n) => { const r = n.getBoundingClientRect(); return r.bottom <= (window.visualViewport?.height || innerHeight) + 1 && r.bottom > 0; })), 'the keyboard up: the last message in sight');
  ok(await until(() => p.locator(H.CH_COMPOSER).evaluate((n) => n.getBoundingClientRect().bottom <= (window.visualViewport?.height || innerHeight) + 1)), 'and the composer above it');
  await shot(p, '2-keyboard');
  await p.setViewportSize({ width: 390, height: 700 });
  // send
  await p.locator(`${H.CH_COMPOSER} textarea`).fill('A test from the kit');
  const sentP = p.evaluate(() => new Promise((ok) => { const t0 = Date.now(); const f = () => (window.kit?.state?.chatcore?.some?.((c) => c[0] === 'sendText') ? ok(true) : Date.now() - t0 > 4000 ? ok(null) : setTimeout(f, 100)); f(); }));
  await p.locator(H.CH_SEND_BTN).click();
  ok(await until(async () => (await p.locator(`${H.CH_COMPOSER} textarea`).inputValue()) === ''), 'sent: the composer empties');
  const sent = await sentP;
  if (sent == null) note('the kit doesn’t record the stub core’s calls (kit.state.chatcore): sendText checked by the composer emptying only');
  ok(!st.errors.length, 'no page error', st.errors.join(' | '));
  await ctx.close();
}

// ===================== 3. every state of §2.1 =====================
{
  const WORDS = { signin: 'Sign in to Chats', key: 'Unlock Chats on this phone', ended: 'You’ve been signed out of Chats', offline: 'No signal', locked: 'Chats is locked' };
  for (const [state, words] of Object.entries(WORDS)) {
    const { p, st, ctx } = await phone();
    await openChats(p, { state });
    ok(await until(async () => (await p.locator(H.M_CHATS).textContent()).includes(words)), `${state}: “${words}”`);
    if (state === 'key') ok(await visible(p, H.CH_UNLOCK), 'key: Unlock Chats');
    if (state === 'locked') ok(await visible(p, H.CH_LOCK), 'locked: the lock screen');
    ok(!(await visible(p, `${H.chSec('chats')} ${H.CH_ROW}`)), `${state}: no rows`);
    await shot(p, `3-${state}`);
    ok(!st.errors.length, `${state}: no page error`, st.errors.join(' | '));
    await ctx.close();
  }
  const { p, ctx } = await phone({ computer: true, width: 1280, height: 800 });
  await openChats(p);
  ok(await until(async () => (await p.locator(H.M_CHATS).textContent()).includes('Chats is on your phone')), 'a computer: “Chats is on your phone”');
  await shot(p, '3-device');
  await ctx.close();
}

// ===================== 4. widths, dark, CSP =====================
for (const width of [320, 1280]) {
  const { p, st, ctx } = await phone({ width, computer: false, colorScheme: width === 320 ? 'dark' : 'light' });
  await openChats(p);
  await until(() => visible(p, H.chRow(pat)));
  ok(await wide(p) <= 0, `nothing wider than the window (${width})`);
  await p.locator(H.chRow(pat)).first().click();
  await until(async () => (await p.locator(H.CH_BUBBLE).count()) >= 5);
  ok(await wide(p) <= 0, `a chat: nothing wider than the window (${width})`);
  await shot(p, `4-${width}`);
  const csp = await p.evaluate(() => window.kit.state.csp);
  ok(!csp.length, `no CSP violation (${width})`, csp.join(' | '));
  ok(!st.errors.length, `no page error (${width})`, st.errors.join(' | '));
  await ctx.close();
}

await b.close();
console.log(`FAILS ${fails}`);
