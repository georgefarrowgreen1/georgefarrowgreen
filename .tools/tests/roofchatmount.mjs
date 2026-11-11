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
const MAIN = new URL('../../', import.meta.url).pathname, IFL = process.env.ROOF_IFL ? process.env.ROOF_IFL.replace(/\/?$/, '/') : new URL('../../../inflite/', import.meta.url).pathname;
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });

if (!existsSync(`${IFL}today/public/roof/frame.js`)) { ok(false, 'the inflite repo, with the framework, is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
const { serveKit, KIT } = await import('./roofkit/serve.mjs');
const FX = await import('./unit/fixtures/chats.mjs');
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const MODULE = '/chats/roof/chats.js';
// (whether the inflite repo's tabs.js draws away yet, or still has B0's inert stub)
const AWAY = /classList\.toggle\("away"/.test(readFileSync(`${IFL}today/public/roof/tabs.js`, 'utf8'));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });

async function phone({ width = 390, height = 844, computer = false, colorScheme = 'light', lock = false } = {}) {
  const ctx = await b.newContext(computer ? { viewport: { width, height }, colorScheme, locale: 'en-GB', timezoneId: 'Europe/London' }
    : { ...devices['iPhone 13'], viewport: { width, height }, colorScheme, locale: 'en-GB', timezoneId: 'Europe/London' });
  const st = { errors: [] };
  // (the app lock set up on this phone, as Chat's own page keeps it: the service starts the core locked)
  if (lock) await ctx.addInitScript((uid) => { try { localStorage.setItem('inflight-lock', JSON.stringify({ on: true, after: 0, uid })); } catch (_) {} }, FX.IDS.me);
  await serveKit(ctx, { main: MAIN, ifl: IFL });
  // (serve.mjs writes the state in with replace(), whose first match is the stub's own header comment, so the stub
  // always starts ready: reported to B0/HOST. Until it's fixed, this test serves the stub with every placeholder filled.)
  await ctx.route(`${KIT}/chats/roof/core.js*`, async (r) => {
    const cookie = r.request().headers().cookie || '';
    if (!/(?:^|;\s*)kit-service=stub(?:;|$)/.test(cookie)) return r.fallback();
    const st = /(?:^|;\s*)kit-chat-state=(\w+)/.exec(cookie)?.[1] || 'ready';
    return r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'cache-control': 'no-cache' }, body: readFileSync(new URL('./roofkit/chatcore-stub.js', import.meta.url), 'utf8').replaceAll('__KIT_STATE__', st) });
  });
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
// (a hook's matches that are on show: the hooks start at .m-chats, so they're never nested in another hook)
const shownIds = (p, sel) => p.locator(sel).evaluateAll((ns) => ns.filter((n) => n.checkVisibility()).map((n) => n.dataset.id));
const shownCount = async (p, sel) => (await p.locator(sel).evaluateAll((ns) => ns.filter((n) => n.checkVisibility()).length));
const here = (p) => p.evaluate(() => location.pathname + location.hash);
async function openChats(p, { state = 'ready', path = '/chats/' } = {}) {
  await p.goto(`${KIT}/?module=${MODULE}&apps=weather,chats&service=stub&state=${state}`);
  await until(() => p.evaluate(() => !!window.kit?.ready), 10000);
  await go(p, path);
  return until(() => visible(p, H.M_CHATS), 15000);
}
async function axe(p, label) {
  if (!(await p.evaluate(() => !!window.axe))) await p.evaluate(AXE);
  const r = await p.evaluate(async (sel) => (await window.axe.run(document.querySelector(sel) || document, { preload: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] })).violations
    .filter((v) => /serious|critical/.test(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), H.M_CHATS);
  ok(!r.length, `axe: no serious or critical violations (${label})`, r.join(', '));
}
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const pat = FX.IDS.pat;

// ===================== 1. the list, Friends, the root's sheets =====================
{
  const { p, st, ctx } = await phone();
  ok(await openChats(p), 'the module mounts');
  ok(await p.locator(H.M_CHATS).getAttribute('role') === 'main', 'the native app screen keeps main landmark semantics');
  ok(await until(() => visible(p, H.chSec('chats'))), 'the Chats section shows');
  const ids = await until(async () => { const v = await shownIds(p, H.CH_ROW); return v.length >= 3 && v; });
  ok(ids && ids[0] === pat, 'the rows, pinned first (Pat)', String(await shownIds(p, H.CH_ROW)));
  ok(await until(async () => (await text(p, H.HD_TITLE)).trim() === 'Chats'), 'the header’s title: Chats', await text(p, H.HD_TITLE));
  ok(await until(async () => /unread/.test(await text(p, H.HD_LINE))), 'the header’s line: unread and in the air', await text(p, H.HD_LINE));
  ok(await visible(p, H.HD_NEWCHAT) && await visible(p, H.HD_CHATSETTINGS), 'acts: New Chat, Chat Settings');
  // (the badge is HOST's to draw, from the module's fw.tabs.badge(n): checked once tabs.js draws it)
  if (await p.locator(H.TAB_BADGE).count()) ok(await until(async () => /^\d+$/.test((await text(p, H.TAB_BADGE)).trim())), 'the Chats tab’s badge: the unread count', await text(p, H.TAB_BADGE));
  else note('the Chats tab’s badge isn’t drawn yet (tabs.js badge is B0’s inert stub: HOST’s)');
  await shot(p, '1-list');
  await axe(p, 'the list');
  ok(await wide(p) <= 0, 'nothing wider than the window (390)');
  // sheets by hook
  await p.locator(H.HD_NEWCHAT).click();
  ok(await until(() => visible(p, `${H.chSheet('newmsg')}[open]`)), 'New Chat opens (newmsg)');
  await p.locator(H.SHEET_CLOSE).first().click();
  ok(await until(async () => !(await visible(p, `${H.sheet('newmsg')}[open]`))), 'and closes');
  await p.locator(H.hdSec('friends')).click();
  ok(await until(() => visible(p, H.chSec('friends'))), 'Friends by the switcher');
  ok(await until(async () => (await here(p)) === '/chats/#friends'), 'the address: /chats/#friends', await here(p));
  ok(await until(async () => (await shownCount(p, H.CH_FRIEND)) >= 2), 'friends listed');
  await p.locator(H.CH_ADD).locator('visible=true').first().click();
  ok(await until(() => visible(p, `${H.sheet('addfriend')}[open]`)), 'Add Friend opens (addfriend)');
  await p.keyboard.press('Escape');
  ok(await until(async () => !(await visible(p, `${H.sheet('addfriend')}[open]`))), 'and closes');
  await p.locator(H.CH_REQUESTS).locator('visible=true').first().click();
  ok(await until(() => visible(p, `${H.sheet('requests')}[open]`)), 'Requests opens (requests)');
  await p.keyboard.press('Escape');
  await shot(p, '1-friends');
  ok(!st.errors.length, 'no page error', st.errors.join(' | '));
  await ctx.close();
}

// ===================== 2. a chat: the scroller, the keyboard, sending =====================
{
  const { p, st, ctx } = await phone({ height: 420 });
  await openChats(p);
  await until(() => visible(p, H.chRow(pat)));
  await p.locator(H.chRow(pat)).locator('visible=true').first().click();
  ok(await until(async () => (await here(p)) === `/chats/#open=${pat}`), 'a row opens its chat at /chats/#open=<id>', await here(p));
  ok(await until(async () => (await p.locator(H.CH_BUBBLE).count()) >= 5), 'its messages drawn', String(await p.locator(H.CH_BUBBLE).count()));
  ok(await until(async () => /Back to Chats/.test(await p.locator(H.HD_BACK).getAttribute('aria-label').catch(() => ''))), 'Back: “Back to Chats”');
  ok(!(await visible(p, H.HD_TABLIST)), 'no switcher in a chat');
  ok(await p.locator(H.HTML_FILL).count() === 1, 'html.ifl-fill: the window holds still');
  // (the tab bar's away is HOST's to draw, from the module's fw.tabs.away(true): checked once tabs.js has it)
  if (AWAY) ok(await until(() => p.locator(H.TABS_AWAY).count().then((n) => n === 1)), 'the tab bar away');
  else note('the tab bar’s away isn’t drawn yet (tabs.js away is B0’s inert stub: HOST’s)');
  ok(await visible(p, H.CH_COMPOSER), 'the composer');
  // Home Screen resume can leave a screen/layout correction on html. It must not extend the conversation below
  // the visual viewport: the message field and the send button need their whole tap targets on screen.
  const homeGap = await p.evaluate(() => {
    document.documentElement.style.setProperty('--fix-gap', '54px');
    visualViewport.dispatchEvent(new Event('resize'));
    const composer = document.querySelector('.ch-composer').getBoundingClientRect();
    const send = document.querySelector('.ch-send').getBoundingClientRect();
    return { bottom: composer.bottom, send: send.bottom, foot: visualViewport.height + visualViewport.offsetTop };
  });
  ok(homeGap.bottom <= homeGap.foot + 1 && homeGap.send <= homeGap.foot + 1, 'Home Screen gap: the message box and send button stay fully visible', JSON.stringify(homeGap));
  await p.evaluate(() => { document.documentElement.style.removeProperty('--fix-gap'); visualViewport.dispatchEvent(new Event('resize')); });
  const atBottom = () => p.locator(H.CH_SCROLLER).evaluate((n) => n.scrollHeight - n.scrollTop - n.clientHeight < 70);
  ok(await until(atBottom), 'the scroller starts at the bottom');
  await shot(p, '2-chat');
  await axe(p, 'a chat');
  // scroll up, leave, come back: the same message at the top (S3-D17's per-chat anchor)
  const top = await p.locator(H.CH_SCROLLER).evaluate((n) => { n.scrollTop = Math.max(0, (n.scrollHeight - n.clientHeight) / 3); n.dispatchEvent(new Event('scroll')); const r = n.getBoundingClientRect(); const m = [...n.querySelectorAll('[data-mid]')].find((x) => x.getBoundingClientRect().bottom > r.top); return m?.dataset.mid; });
  const scrollable = await p.locator(H.CH_SCROLLER).evaluate((n) => n.scrollHeight > n.clientHeight + 70);
  await p.locator(H.HD_BACK).click();
  ok(await until(() => visible(p, H.chSec('chats'))), 'Back: the list');
  if (AWAY) ok(await until(() => p.locator(H.TABS_AWAY).count().then((n) => n === 0)), 'the tab bar back');
  ok(await p.locator(H.HTML_FILL).count() === 0, 'html.ifl-fill gone');
  ok(await p.locator(H.CH_BUBBLE).count() === 0, 'the chat’s words out of the page');
  await p.locator(H.chRow(pat)).locator('visible=true').first().click();
  await until(async () => (await p.locator(H.CH_BUBBLE).count()) >= 5);
  if (scrollable) {
    const back = await until(() => p.locator(H.CH_SCROLLER).evaluate((n) => { const r = n.getBoundingClientRect(); return [...n.querySelectorAll('[data-mid]')].find((x) => x.getBoundingClientRect().bottom > r.top)?.dataset.mid; }));
    ok(back === top, 'opened again: the same message at the top', `${top} → ${back}`);
  } else note('the chat fits without scrolling at this size: the anchor case needs a longer chat');
  // the keyboard: the visual viewport shorter → the last message still in sight
  await p.locator(H.CH_SCROLLER).evaluate((n) => { n.scrollTop = n.scrollHeight; n.dispatchEvent(new Event('scroll')); });
  await p.locator(H.CH_INPUT).focus();
  await p.setViewportSize({ width: 390, height: 300 });
  await p.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));
  ok(await until(() => p.locator(H.CH_BUBBLE).last().evaluate((n) => { const r = n.getBoundingClientRect(); return r.bottom <= (window.visualViewport?.height || innerHeight) + 1 && r.bottom > 0; })), 'the keyboard up: the last message in sight');
  ok(await until(() => p.locator(H.CH_COMPOSER).evaluate((n) => n.getBoundingClientRect().bottom <= (window.visualViewport?.height || innerHeight) + 1)), 'and the composer above it');
  await shot(p, '2-keyboard');
  await p.setViewportSize({ width: 390, height: 420 });
  // send
  await p.locator(H.CH_INPUT).fill('A test from the kit');
  // (until tabs.js draws away, the tab bar lies over the composer: the tap is sent to the button itself)
  if (AWAY) await p.locator(H.CH_SEND_BTN).click({ timeout: 5000 });
  else await p.locator(H.CH_SEND_BTN).dispatchEvent('click');
  ok(await until(async () => (await p.locator(H.CH_INPUT).inputValue()) === ''), 'sent: the composer empties');
  ok(!st.errors.length, 'no page error', st.errors.join(' | '));
  await ctx.close();
}

// ===================== 3. every state of §2.1 =====================
{
  const WORDS = { signin: 'Sign in to Chats', key: 'Unlock Chats on this phone', ended: 'You’ve been signed out of Chats', offline: 'No signal', locked: 'Chats is locked' };
  for (const [state, words] of Object.entries(WORDS)) {
    const { p, st, ctx } = await phone({ lock: state === 'locked' });
    await openChats(p, { state });
    ok(await until(() => visible(p, H.chState(state))), `${state}: its screen (data-state)`);
    ok(await until(async () => (await p.locator(H.M_CHATS).textContent()).includes(words)), `${state}: “${words}”`);
    if (state === 'key') ok(await visible(p, H.CH_UNLOCK), 'key: Unlock Chats');
    if (state === 'locked') ok(await visible(p, H.CH_LOCK), 'locked: the lock screen');
    ok((await shownCount(p, H.CH_ROW)) === 0, `${state}: no rows`);
    await shot(p, `3-${state}`);
    ok(!st.errors.length, `${state}: no page error`, st.errors.join(' | '));
    await ctx.close();
  }
  const { p, ctx } = await phone({ computer: true, width: 1280, height: 800 });
  await openChats(p);
  ok(await until(async () => (await p.locator(H.M_CHATS).textContent()).includes('Chats is on your phone')), 'a computer: “Chats is on your phone”');
  ok(await until(() => p.locator(`${H.CH_QR} svg`).count().then((n) => n === 1)), 'with a code to scan');
  await shot(p, '3-device');
  await ctx.close();
}

// ===================== 4. widths, dark, CSP =====================
for (const width of [320, 1280]) {
  const { p, st, ctx } = await phone({ width, computer: false, colorScheme: width === 320 ? 'dark' : 'light' });
  await openChats(p);
  await until(() => visible(p, H.chRow(pat)));
  ok(await wide(p) <= 0, `nothing wider than the window (${width})`);
  await p.locator(H.chRow(pat)).locator('visible=true').first().click();
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
