// Chats' sheets on InFlite's framework (One roof, stage 3: roof/s3/spec.md §2.2, §2.6, S3-D7, S3-D8; UI-B), end to end
// in real Chromium on FW's kit page (roofkit/serve.mjs at http://kit.test) with Chats on and the kit's stub core
// (?apps=weather,chats&module=/chats/roof/chats.js&service=stub&state=…): MAIN's pigeon/roof/ from disk, the page's CSP.
// Selectors only from roofhooks.mjs. Checked:
//   every sheet of send.js, sheets.js, flight.js, media.js, scan.js and settings.js (§2.2) opened by its opener with the
//   module's own fw and full service (fw.service()) and a store fed by the service's patches, seen open by its hook
//   (chSheet), closed by the sheet's ✕ (SHEET_CLOSE) and gone; axe on each; at 390 wide, light and dark;
//   Chat Settings' Privacy & Security is the link to /chats/in/#account (CH_PRIVACY); a safety number's digits;
//   Send (S3-D7): ready → the friends (CH_SEND_ROW), one picked, Send (CH_SEND_GO) sealed by the core's sendRun, the
//   toast "Sent. You’re still here", resolved { ok: true }; signin, key, ended, device, locked → its state's words
//   (CH_SEND_STATE), Sign In / Unlock Chats a link to Chat's own page; locked then unlocked → the friends; offline → the
//   friends with the outbox note;
//   no CSP violation, no page error; no request carries the words typed (they cross to the Worker by postMessage only).
//   node .tools/tests/roofchatsheetmount.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as H from './roofhooks.mjs';

const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/roofchatsheetmount`;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 300)}, wanted ${JSON.stringify(b)?.slice(0, 300)}`);
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
if (!existsSync(`${IFL}today/public/roof/frame.js`)) { ok(false, 'the inflite repo, with the framework, is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
if (!/\bchats: fz\(\{/.test(readFileSync(`${IFL}today/public/roof/router.js`, 'utf8'))) { ok(false, 'the inflite repo beside has REGISTRY.chats (stage 3’s B0)'); console.log(`FAILS ${fails}`); process.exit(0); }
const { serveKit, KIT } = await import('./roofkit/serve.mjs');
const AXE = readFileSync(`${HERE}node_modules/axe-core/axe.min.js`, 'utf8');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const WORDS = 'Kittiwake lantern 4471';
const PAT = '6c0f6f1e-0000-4000-8000-0000000000a1', ALI = '6c0f6f1e-0000-4000-8000-0000000000a2', GROUP = '6c0f6f1e-0000-4000-8000-0000000000b1';

async function kit({ state = 'ready', scheme = 'light' } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const served = await serveKit(ctx);
  // (the stub core in the state asked for: serve.mjs's own .replace('__KIT_STATE__', …) meets the placeholder in the
  // stub's header comment first, so it always starts ready; reported to B0. Routed here, after serveKit, so this wins)
  const stub = readFileSync(`${HERE}roofkit/chatcore-stub.js`, 'utf8').replaceAll('__KIT_STATE__', state);
  await ctx.route(`${KIT}/chats/roof/core.js`, (r) => r.fulfill({ status: 200, body: stub, headers: { 'content-type': 'text/javascript', 'cache-control': 'no-store' } }));
  // (locked: the app lock saved on this phone, as Chat's own page saves it; the service reads it before starting the core)
  if (state === 'locked') await ctx.addInitScript(() => { try { localStorage.setItem('inflight-lock', JSON.stringify({ on: true, uid: '6c0f6f1e-0000-4000-8000-000000000001' })); } catch (_) {} });
  const p = await ctx.newPage();
  const errs = [], urls = [];
  p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|status of 404|status of 500|Permission|NotAllowed|NotFound|getUserMedia|Requested device/.test(m.text())) errs.push(`console ${m.text()}`); });
  p.on('request', (r) => urls.push(r.url() + ' ' + (r.postData() || '')));
  await p.goto(`${KIT}/?apps=weather,chats&module=/chats/roof/chats.js&service=stub&state=${state}`);
  await p.waitForFunction(() => window.kit?.ready, null, { timeout: 15000 });
  await p.goto(`${KIT}/chats/`);
  await p.waitForFunction(() => window.kit?.ready && !!document.querySelector('main#m-chats'), null, { timeout: 15000 });
  // (the module's own fw and full service, a store fed by its patches, and every opener bound, as chats.js gives them)
  await p.evaluate(async () => {
    const fw = kit.F.forModule('chats'), svc = await fw.service(), { createStore } = await import('/chats/roof/store.js');
    const store = createStore(); svc.on('*', (x) => store.apply(x));
    const open = {};
    for (const f of ['sheets', 'flight', 'media', 'scan', 'settings']) Object.assign(open, await import(`/chats/roof/${f}.js`));
    window.kitCtx = { fw, svc, store, open, chat: '6c0f6f1e-0000-4000-8000-0000000000a1' };
    if (svc.state === 'ready') await svc.call('open', '6c0f6f1e-0000-4000-8000-0000000000a1').catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
  });
  return { ctx, p, errs, urls, log: served.log };
}
const settle = (p, ms = 400) => p.waitForTimeout(ms);
async function clean(k, label) {
  same(await k.p.evaluate(() => window.kit?.state.csp || []).catch(() => []), [], `${label}: no CSP violation`);
  same(k.errs, [], `${label}: no page error or console error`);
  ok(!k.urls.some((u) => u.includes(WORDS) || u.includes(encodeURIComponent(WORDS))), `${label}: no request carries the words typed`);
}
async function axe(p, label) {
  if (!(await p.evaluate(() => !!window.axe))) await p.evaluate(AXE);
  const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, rules: { 'meta-viewport': { enabled: false }, 'color-contrast': { enabled: false } }, resultTypes: ['violations'] })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
  same(v, [], `${label}: axe finds nothing serious or critical`);
}
// an opener, called in the page; → whether it gave a handle
const openIt = (p, file, fn, args) => p.evaluate(async ([file, fn, args]) => {
  const m = await import(`/chats/roof/${file}`);
  const h = m[fn](window.kitCtx, ...args);
  window.kitSheet = h;
  return !!(h && typeof h.close === 'function');
}, [file, fn, args]);

const SHEETS = [
  ['sheets.js', 'openFriendInfo', [PAT], 'friendinfo'], ['sheets.js', 'openGroupInfo', [GROUP], 'groupinfo'], ['sheets.js', 'openGroupAdd', [GROUP], 'groupadd'],
  ['sheets.js', 'openGroupRename', [GROUP], 'grouprename'], ['sheets.js', 'openSafety', [PAT], 'safety'], ['sheets.js', 'openWhoHas', ['m-p-2'], 'whohas'],
  ['sheets.js', 'openView', ['m-p-4'], 'view'], ['sheets.js', 'openSchedule', [PAT], 'schedule'], ['sheets.js', 'openTimeTalk', [PAT], 'timetalk'],
  ['sheets.js', 'openFromApps', [PAT], 'fromapps'], ['sheets.js', 'openHold', [{ kind: 'msg', chatId: PAT, msgId: 'm-p-2' }], 'hold'],
  ['flight.js', 'openFlightLog', [], 'flightlog'], ['flight.js', 'openPassport', [], 'passport'], ['flight.js', 'openMap', ['m-air-1'], 'map'],
  ['flight.js', 'openSkies', [], 'skies'], ['flight.js', 'openLookUp', [], 'lookup'], ['flight.js', 'openWay', [PAT], 'way'], ['flight.js', 'openMoonPick', ['moon'], 'moonpick'],
  ['flight.js', 'openBirds', [], 'birds'], ['flight.js', 'openBird', ['b-none'], 'bird'], ['flight.js', 'openBirdName', [], 'birdname'], ['flight.js', 'openLoft', [PAT], 'loft'],
  ['flight.js', 'openFeathers', [], 'feathers'], ['flight.js', 'openNews', [], 'news'],
  ['media.js', 'openGifs', [PAT], 'gifs'], ['media.js', 'recordVoice', [PAT], 'voice'], ['scan.js', 'openScan', [], 'scan'], ['settings.js', 'openChatSettings', [], 'chatsettings'],
];

try {
  // ---------------------------------------------------------------- 1. every sheet opens and closes by hook, light and dark
  for (const scheme of ['light', 'dark']) {
    const k = await kit({ scheme }), { p } = k;
    for (const [file, fn, args, name] of SHEETS) {
      const got = await openIt(p, file, fn, args);
      await p.waitForSelector(`${H.chSheet(name)}[open]`, { timeout: 4000 }).catch(() => null);
      await settle(p, 450);
      ok(got && await p.isVisible(`${H.chSheet(name)}[open]`), `${scheme}: ${fn} opens its sheet (${name})`);
      if (scheme === 'light' || ['send', 'chatsettings', 'safety', 'friendinfo', 'flightlog', 'gifs'].includes(name)) await axe(p, `${scheme}: ${name}`);
      if (['chatsettings', 'safety', 'friendinfo', 'groupinfo', 'flightlog', 'hold'].includes(name)) await p.screenshot({ path: `${OUT}/${scheme}-${name}.png` });
      if (name === 'chatsettings') ok(await p.isVisible(H.CH_PRIVACY), `${scheme}: Chat Settings’ Privacy & Security, a link to /chats/in/#account`);
      if (name === 'safety') ok(await p.isVisible(H.CH_SAFETY_DIGITS), `${scheme}: the safety number’s digits`);
      await p.click(H.SHEET_CLOSE);
      await settle(p, 500);
      ok(!(await p.isVisible(`${H.chSheet(name)}[open]`)), `${scheme}: ${name} closes by its ✕`);
    }
    await clean(k, `${scheme}: every sheet`);
    await k.ctx.close();
  }

  // ---------------------------------------------------------------- 2. Send, ready: the friends, one picked, sealed, said
  {
    const k = await kit(), { p } = k;
    await p.evaluate(async ([words]) => {
      const { packCard } = await import('/chats/cards.js'), m = await import('/chats/roof/send.js');
      const card = { v: 1, kind: 'weather', from: 'weather', at: Date.now(), say: 'Rain in Leeds from 15:00.', snap: { place: 'Leeds', tz: 'Europe/London', temp: 12, code: 61, isDay: true, rain: { now: true } } };
      window.kitSent = m.openSend(window.kitCtx.fw, window.kitCtx.svc, { card: packCard(card), words, to: null });
    }, [WORDS]);
    await p.waitForSelector(H.CH_SEND_ROW, { timeout: 4000 }).catch(() => null);
    await settle(p);
    same(await p.$$eval(H.CH_SEND_ROW, (r) => r.length), 3, 'Send: a row per friend and group');
    ok(await p.$eval(H.chSendRow(ALI), (e) => e.disabled), 'Send: a friend whose key changed can’t be picked');
    ok(await p.$eval(H.CH_SEND_GO, (e) => e.disabled), 'Send: nothing picked, nothing to send');
    await axe(p, 'Send, ready');
    await p.click(H.chSendRow(PAT));
    same(await p.getAttribute(H.chSendRow(PAT), 'aria-checked'), 'true', 'Send: Pat picked');
    await p.screenshot({ path: `${OUT}/send-ready.png` });
    await p.click(H.CH_SEND_GO);
    same(await p.evaluate(() => window.kitSent), { ok: true, say: 'Sent' }, 'Send: sealed by the core, resolved { ok: true, say }');
    await settle(p, 700);
    same(await p.$eval(H.TOAST, (e) => e.textContent.trim()).catch(() => null), 'Sent. You’re still here', 'Send: the toast says so');
    ok(!(await p.isVisible(`${H.chSheet('send')}[open]`)), 'Send: the sheet put away');
    same(await p.evaluate(() => (window.kitCtx.svc && 1)), 1, 'the service still there');
    await clean(k, 'Send, ready');
    await k.ctx.close();
  }

  // ---------------------------------------------------------------- 3. Send's not-ready states (S3-D7)
  const sendAt = async (state) => {
    const k = await kit({ state }), { p } = k;
    await p.evaluate(async () => {
      const m = await import('/chats/roof/send.js');
      const card = { v: 1, kind: 'weather', from: 'weather', at: Date.now(), say: 'Rain in Leeds from 15:00.', snap: { place: 'Leeds', tz: 'Europe/London', temp: 12, code: 61, isDay: true, rain: { now: true } } };
      window.kitSent = null;
      m.openSend(window.kitCtx.fw, window.kitCtx.svc, { card, words: 'w', to: null }).then((r) => { window.kitSent = r; });
    });
    await p.waitForSelector(`${H.chSheet('send')}[open]`, { timeout: 4000 }).catch(() => null);
    await settle(p);
    return k;
  };
  for (const st of ['signin', 'key', 'ended', 'device', 'locked']) {
    const k = await sendAt(st), { p } = k;
    same(await p.getAttribute(H.CH_SEND_STATE, 'data-state').catch(() => null), st, `Send, ${st}: its own words`);
    same(await p.$$eval(H.CH_SEND_ROW, (r) => r.length), 0, `Send, ${st}: no friends asked for`);
    const link = await p.$(`${H.CH_SEND_STATE} a`);
    if (st === 'signin' || st === 'key' || st === 'ended') same(await link?.getAttribute('href'), '/chats/in/#signin-start&then=%2Fchats%2F', `Send, ${st}: ${st === 'key' ? 'Unlock Chats' : 'Sign In'} goes to Chat’s own page`);
    else ok(!link, `Send, ${st}: no sign-in`);
    await axe(p, `Send, ${st}`);
    await p.screenshot({ path: `${OUT}/send-${st}.png` });
    if (st === 'locked') {
      await p.evaluate(() => window.kitCtx.svc.call('lock', false));
      await p.waitForSelector(H.CH_SEND_ROW, { timeout: 4000 }).catch(() => null);
      same(await p.$$eval(H.CH_SEND_ROW, (r) => r.length), 3, 'Send, locked then unlocked: the friends to send to');
    }
    await p.click(H.SHEET_CLOSE); await settle(p, 500);
    same(await p.evaluate(() => window.kitSent), { ok: false, why: 'no' }, `Send, ${st}: closed unsent`);
    await clean(k, `Send, ${st}`);
    await k.ctx.close();
  }
  {
    const k = await sendAt('offline'), { p } = k;
    await p.waitForSelector(H.CH_SEND_ROW, { timeout: 4000 }).catch(() => null);
    same(await p.$eval(`${H.CH_SEND_STATE}[data-state=offline]`, (e) => e.textContent).catch(() => null), 'It’ll go when you’re back online', 'Send, offline: the outbox note');
    same(await p.$$eval(H.CH_SEND_ROW, (r) => r.length), 3, 'Send, offline: the friends all the same');
    await axe(p, 'Send, offline');
    await p.click(H.SHEET_CLOSE); await settle(p, 500);
    await clean(k, 'Send, offline');
    await k.ctx.close();
  }
} finally {
  await b.close();
}
console.log(`FAILS ${fails}`);
