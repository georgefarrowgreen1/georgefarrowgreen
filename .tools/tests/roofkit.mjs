// InFlite's framework on its own (One roof, spec §3, §5.2, §9.4 FW), end to end in real Chromium on FW's kit page
// (roofkit/: the inflite repo's today/public/ and the shared block from disk, at http://kit.test with the page's CSP,
// stand-in tab screens, a fake module at Weather's address). No site, no hub: everything is routed in the browser.
// Checked: tab screens and the fake module; the header (root and app: crumb, pick, acts, compaction --p and
// compactTitle, the warnings count, Back's label; long titles at 320 and 390 with Back, title and capsule apart and the
// full title in aria-label); the switcher (manual activation, the lens on show); the tab bar (has-pill, no static pill,
// Apps from inside the app back or push, your own tab to the top); the Back rule (a sheet, the module's back, history,
// a cold deep link to /#apps, a wiped state re-stamped); scroll kept per entry (scrollRestoration manual) and per
// section; transitions with and without View Transitions, under reduced motion, and none on hasUAVisualTransition; the
// zoom with the card's clone; fw.fill; sheets (focus kept in, Escape, a drag, push and pop, the accent kept to the
// sheet, browser back with one open); the address tidied after show; a toast with an action (held while focused);
// search (focused in the tap, providers, a slow and a throwing one, Enter, no request, nothing kept); a module that
// fails (Try Again, Open on Its Own, then Reload), a contract mismatch, a mount that throws (IFL.built only once mounted);
// fw.lazy while stale; lost() with a session still signed in; F.nav.go refusing javascript: and data:; the connector
// sheet; every member of F (§3.2) and fw (§5.2) with its type; "route" fired after F.route changes; a wiped state healed
// by going on; one live region; a section tapped while the module loads; sign-out from Radar; CSS already in;
// F.setRoof(false) inside the app; axe; 320, 390, 768 and 1280 wide, light and dark; no CSP violation, no page error.
// Stage 2 (s2 §9.2 FW; s24-contracts §2, §4, §6, §7), with the fake module at Markets' and Mail's addresses too: a switch
// per app (one switched off doesn't unmount another; the bounce of the shown one flushes and waits while it's busy);
// sections: false, fw.nav.go with { replace }, fw.nav.depth(), a stay key (Mail's thread) left in the address; fw.lazy
// while stale and busy imports with no reload, while stale and idle reloads at the route; a lazy file that fails: the
// same build out, Try Again's ?retry=1, a new build out, the reload at the route; a provider per app (Weather's places
// found while Markets' module provides its own; the connector's search given { userId }); the connector sheet's acts and
// hero line per switch; Back or Forward to a module switched off since (Today; offline or something unsaved: no reload;
// else a real load once saved); a Markets card's zoom with no hint; a module switched off while busy and then left: no
// bounce, no reload.
// Stage 3's B0 (roof/s3/spec.md §2.2, §5.2, §5.4): Chats' stub module and the kit's stub core (?apps=weather,chats&service=
// stub): the module mounts, F.service's frozen facade and fw.service's full service over one Worker, opts.serviceState,
// one stub sheet per opener file opening and closing, a locked start, and with Chats off nothing of it at all.
//   node .tools/tests/roofkit.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium, devices } from 'playwright';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { serveKit, KIT } from './roofkit/serve.mjs';
import * as H from './roofhooks.mjs';

const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/roofkit`;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 300)}, wanted ${JSON.stringify(b)?.slice(0, 300)}`);
if (!existsSync(`${IFL}today/public/roof/frame.js`)) { console.log('SKIP  the inflite repo with the framework isn’t beside this one'); console.log('FAILS 0'); process.exit(0); }
const AXE = readFileSync(`${HERE}node_modules/axe-core/axe.min.js`, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });

const pages = [];
async function kit({ w = 390, h = 844, scheme = 'light', path = '/', motion = 'no-preference', noVT = false, init = null, phone = false } = {}) {
  // (phone: a phone's user agent and touch, for Chats, whose service keeps theme.js's device rule: no core on a computer, S3-D13)
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: motion, locale: 'en-GB', timezoneId: 'Europe/London', ...(phone ? { userAgent: devices['iPhone 13'].userAgent, hasTouch: true, isMobile: true } : {}) });
  const served = await serveKit(ctx);
  if (noVT) await ctx.addInitScript(() => { delete Document.prototype.startViewTransition; });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|status of 404|status of 500/.test(m.text())) errs.push(`console ${m.text()}`); });
  const rec = { ctx, p, errs, log: served.log };
  pages.push(rec);
  await p.goto(KIT + path);
  await p.waitForFunction(() => window.kit?.ready, null, { timeout: 10000 });
  return rec;
}
const at = (p) => p.evaluate(() => ({ route: document.documentElement.dataset.route, app: document.documentElement.dataset.app, url: location.pathname + location.search + location.hash, d: history.state?.ifl?.d, y: Math.round(scrollY) }));
const settle = (p, ms = 450) => p.waitForTimeout(ms);
const text = (p, s) => p.$eval(s, (e) => e.textContent.trim()).catch(() => null);
async function clean(rec, label) {
  const csp = await rec.p.evaluate(() => window.kit?.state.csp || []).catch(() => []);
  same(csp, [], `${label}: no CSP violation`);
  same(rec.errs, [], `${label}: no page error or console error`);
}
async function axe(p, label) {
  if (!(await p.evaluate(() => !!window.axe))) await p.evaluate(AXE);
  const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, rules: { 'meta-viewport': { enabled: false }, 'color-contrast': { enabled: false } }, resultTypes: ['violations'] })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
  same(v, [], `${label}: axe finds nothing serious or critical`);
}

try {
  // ---------------------------------------------------------------- 1. tab screens, the header at the root, the tab bar
  {
    const k = await kit(), p = k.p;
    same(await at(p), { route: '/', app: 'inflite', url: '/', d: 0, y: 0 }, 'opens on Today: html[data-route]="/", data-app inflite, stamped d:0');
    ok(await p.evaluate(() => history.scrollRestoration === 'manual'), 'history.scrollRestoration is manual (D20)');
    same(await text(p, H.HD_TITLE), 'Today', 'the header’s title is Today');
    same(await text(p, H.HD_CRUMB), 'Tuesday 3 November', 'the crumb is the date over the title');
    same(await text(p, H.HD_LINE), 'London · Rain from 15:00', 'the line under the title');
    ok(await p.isVisible(H.HD_ME) && !(await p.isVisible(H.HD_BACK)), 'your photo leads on a tab screen, no Back');
    same(await p.$eval(H.HD_ME, (b) => [b.getAttribute('aria-label'), b.getAttribute('aria-haspopup'), b.classList.contains('out')]), ['You and your apps', 'dialog', false], 'your photo’s button: “You and your apps”, opening a dialog (InFlite’s menu), not the signed-out button');
    same(await p.$$eval('#hd .ifh-acts [data-act]', (bs) => bs.map((x) => `${x.dataset.act}:${x.getAttribute('aria-label')}`)), ['search:Search', 'edit:Edit Today: hide and reorder cards'], 'the capsule: Search first, then the screen’s act');
    same(await text(p, H.HD_EDIT), 'Edit', 'an act with no glyph is its word');
    await p.click(H.HD_EDIT); await p.click(H.HD_ME);
    same(await p.evaluate(() => [kit.state.edit, kit.state.me]), [1, 1], 'the act and your photo run what the screen gave');
    same(await p.$$eval(H.TAB, (as) => as.map((a) => `${a.dataset.tab}:${a.getAttribute('aria-current')}:${a.getAttribute('href')}`)), ['today:page:/', 'chats:null:/chats/', 'apps:null:/#apps', 'you:null:/#you'], 'the tab bar: Today · Chats · Apps · You, Today current (aria-current=page)');
    ok(await p.$eval('#tabs', (n) => n.classList.contains('has-pill') && !!n.querySelector('.ifl-tab-pill[aria-hidden=true]')), 'the tab bar has the sliding pill (has-pill, aria-hidden)');
    same(await p.$eval(H.tab('today'), (a) => getComputedStyle(a).backgroundColor), 'rgba(0, 0, 0, 0)', 'menu.css’s static pill is off under it');
    const pill0 = await p.$eval('.ifl-tab-pill', (x) => x.style.getPropertyValue('--px'));
    await p.click(H.tab('apps')); await settle(p);
    same(await at(p), { route: '/#apps', app: 'inflite', url: '/#apps', d: 1, y: 0 }, 'Apps: a push (d:1), in the page');
    same(await text(p, H.HD_TITLE), 'Apps', 'the header follows (Apps)');
    ok(!(await p.isVisible(H.HD_CRUMB)), 'no crumb where the screen gives none');
    ok(await p.$eval('.ifl-tab-pill', (x, a) => x.style.getPropertyValue('--px') !== a, pill0), 'the pill slid to Apps');
    same(await p.evaluate(() => [document.querySelector('main#today').hidden, document.querySelector('main#today').inert, document.querySelector('main#apps').hidden]), [true, true, false], 'Today is hidden and inert, Apps shown');
    await p.evaluate(() => scrollTo(0, 500)); await settle(p, 150);
    await p.click(H.tab('apps')); await settle(p, 900);
    ok((await at(p)).y < 5 && (await at(p)).d === 1, 'Apps tapped again on Apps: to the top, no new entry');
    await p.evaluate(() => { window.vts = []; window.seen = []; kit.F.on('route', (r) => window.seen.push([r.tab, kit.F.route.tab, document.documentElement.dataset.route, !!document.documentElement.dataset.vt])); });
    await p.click(H.tab('you')); await settle(p);
    same((await at(p)).route, '/#you', 'You: a push');
    same(await p.evaluate(() => window.seen), [['you', 'you', '/#you', true]], 'during its View Transition, “route” fires with F.route and html[data-route] already the new screen’s');
    await p.evaluate(() => kit.F.nav.go('/#you=apps')); await settle(p);
    same(await p.evaluate(() => kit.state.shows.at(-1)), 'you=apps', 'a tab route with a target (/#you=apps) reaches the screen’s onShow');
    // the photo's place: the shared skeleton
    same(await p.$eval('#hd header.ifh', (h) => [...h.children].map((c) => c.className.split(' ')[0])), ['ifh-me', 'ifl-back', 'ifh-t', 'ifh-acts', 'ifl-row2'], 'row 1 is the shared .ifh (me, title block, capsule) with Back and row 2 added');
    await axe(p, 'You');
    await clean(k, 'tab screens');
  }

  // ---------------------------------------------------------------- 2. the fake module from Apps: header, switcher, Back, scroll, fill
  {
    const k = await kit(), p = k.p;
    await p.click(H.tab('apps')); await settle(p);
    await p.evaluate(() => scrollTo(0, 300)); await settle(p, 150);
    await p.$eval('.ifl-tile[data-app=weather] .ifl-tile-main', (a) => a.click()); await p.waitForFunction(() => window.kitMod?.shows?.length > 0); await settle(p);
    same(await at(p), { route: '/weather/', app: 'weather', url: '/weather/', d: 2, y: 0 }, 'Weather from its tile: a push, html[data-app=weather], at the top');
    ok(await p.isVisible(H.M_WEATHER) && !(await p.isVisible(H.APPS)), 'main#m-weather shown, Apps hidden');
    same(await p.evaluate(() => [document.querySelector('main#m-weather').className, document.querySelector('main#m-weather > .m-weather')?.getAttribute('role')]), ['view ifl-screen', 'tabpanel'], 'the module’s screen: main#m-weather.view.ifl-screen holding div.m-weather (the tabpanel)');
    same(await text(p, H.HD_CRUMB), 'Weather', 'the crumb is the app (icon and name)');
    ok(await p.$eval(H.HD_CRUMB, (c) => !!c.querySelector('img') && getComputedStyle(c).color !== ''), 'the crumb carries the app’s icon');
    same(await text(p, H.HD_TITLE), 'London', 'the module’s title');
    same(await p.$eval(H.HD_PICK, (b) => b.getAttribute('aria-label')), 'Places', 'the title is the ▾ pick, named');
    same(await p.$eval(H.HD_BACK, (b) => b.getAttribute('aria-label')), 'Back to Apps', 'Back, icon-only, names where it goes');
    ok(await p.$eval(H.HD_BACK, (b) => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44 && !b.textContent.trim()), 'Back is 44 px round with no words');
    ok(!(await p.isVisible(H.HD_ME)), 'no photo on an app screen');
    same(await p.$$eval('#hd .ifh-acts [data-act]', (bs) => bs.map((x) => x.dataset.act)), ['search', 'settings'], 'Search first, then Weather Settings');
    same(await p.$$eval(H.HD_SEC, (t) => t.map((x) => `${x.dataset.sec}:${x.getAttribute('aria-selected')}`)), ['now:true', 'days:false', 'radar:false', 'warnings:false'], 'the switcher: the registry’s sections, Now chosen');
    same(await p.$eval(H.hdSec('warnings'), (t, b) => [t.querySelector(b)?.textContent, t.getAttribute('aria-label')], H.SEC_BADGE), ['2', 'Warnings, 2 in force'], 'a count on Warnings, said as “Warnings, 2 in force”');
    same(await p.$eval(H.tab('apps'), (a) => a.getAttribute('aria-current')), 'true', 'in an app, Apps is current with aria-current="true"');
    // every member of §3.2’s F and §5.2’s fw, with its type, and the ones no other check here uses, exercised
    same(await p.evaluate(async () => {
      const F = kit.F, fw = kitMod.fw, ty = (o, ks) => ks.map((k) => `${k}:${typeof o[k]}`).join(' ');
      const got = [], offF = F.on('theme', (t) => got.push(`F:${t}`)), offW = fw.on('theme', (t) => got.push(`fw:${t}`)), th0 = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = 'dark';
      await new Promise((r) => setTimeout(r, 50));
      const theme = fw.theme();
      offF(); offW();
      if (th0) document.documentElement.dataset.theme = th0; else delete document.documentElement.dataset.theme;
      const fill = [(F.fill(true), document.documentElement.classList.contains('ifl-fill')), (F.fill(false), document.documentElement.classList.contains('ifl-fill'))];
      const busy = [F.busy(), (kitMod.busy = true, F.busy()), (kitMod.busy = false, F.busy())];
      const sb = fw.sendButton({ words: 'London: light rain', what: 'the forecast' });
      return [
        ty(F, ['screen', 'nav', 'route', 'header', 'tabs', 'sheet', 'toast', 'search', 'send', 'ui', 'session', 'setRoof', 'restamp', 'stale', 'fill', 'on', 'busy', 'forModule', 'destroy', 'refresh', 'hubAgain']),
        ty(F.nav, ['go', 'back', 'section', 'prev']), ty(F.session, ['view', 'hub', 'roof', 'links', 'lost']),
        ty(fw, ['contract', 'app', 'screenEl', 'ui', 'header', 'nav', 'sheet', 'toast', 'send', 'sendButton', 'search', 'session', 'visible', 'on', 'theme', 'motion', 'zoomTarget', 'fill', 'lazy', 'stale']),
        ty(fw.nav, ['go', 'back', 'section', 'href']), [typeof fw.header.set, typeof fw.sheet.open, typeof fw.search.provide, typeof fw.session.lost].join(' '),
        fw.contract, fw.app, fw.screenEl.id, fw.session.user, fw.nav.href('radar'), fw.nav.href('day', '2026-11-03'),
        fw.visible(), fw.motion(), fw.stale(), F.stale, got, theme, fill, busy, [sb.dataset.act, sb.getAttribute('aria-label')], F.forModule('weather') === fw,
      ];
    }), [
      'screen:function nav:object route:object header:object tabs:object sheet:object toast:function search:object send:object ui:object session:object setRoof:function restamp:function stale:boolean fill:function on:function busy:function forModule:function destroy:function refresh:function hubAgain:function',
      'go:function back:function section:function prev:function', 'view:object hub:boolean roof:boolean links:object lost:function',
      'contract:number app:string screenEl:object ui:object header:object nav:object sheet:object toast:function send:function sendButton:function search:object session:object visible:function on:function theme:function motion:function zoomTarget:function fill:function lazy:function stale:function',
      'go:function back:function section:function href:function', 'function function function function',
      1, 'weather', 'm-weather', { id: 'u-kit-0001', name: 'Sam Taylor' }, '/weather/#radar', '/weather/#day=2026-11-03',
      true, 'full', false, false, ['F:dark', 'fw:dark'], 'dark', [true, false], [false, true, false], ['send', 'Send the forecast to a friend'], true,
    ], 'F has every member of §3.2 and fw every member of §5.2, each of its type; F.on/fw.on("theme"), fw.theme, F.fill, F.busy and fw.sendButton work');
    const lens = () => p.evaluate(() => { const l = document.querySelector('.ifl-lens'), s = document.querySelector('#hd [role=tab][aria-selected=true]'); return [l.style.getPropertyValue('--lx'), `${s.offsetLeft}px`]; });
    const [lx, ox] = await lens(); same(lx, ox, 'the lens sits under the chosen section');
    // compaction
    await p.evaluate(() => scrollTo(0, 120)); await settle(p, 200);
    same(await p.evaluate(() => [document.querySelector('#hd .ifh').style.getPropertyValue('--p'), document.querySelector('#hd .ifh').classList.contains('ifh-compact')]), ['1.000', true], 'scrolled 64 px and more: --p is 1, compact');
    same(await text(p, H.HD_TITLE), 'London · 14°', 'compact, the title is compactTitle');
    same(await p.$eval(H.HD_TITLE, (h) => h.getAttribute('aria-label')), 'London', 'its full title stays its accessible name');
    await p.evaluate(() => scrollTo(0, 0)); await settle(p, 200);
    same(await text(p, H.HD_TITLE), 'London', 'back at the top, the full title');
    // keyboard: manual activation
    await p.focus(H.hdSec('now'));
    await p.keyboard.press('ArrowRight');
    same(await p.evaluate(() => [document.activeElement?.dataset.sec, document.querySelector('#hd [aria-selected=true]').dataset.sec, location.hash]), ['days', 'now', ''], 'an arrow moves the focus only (manual activation)');
    await p.keyboard.press('Enter'); await settle(p);
    same(await p.evaluate(() => [document.activeElement?.dataset.sec, document.querySelector('#hd [aria-selected=true]').dataset.sec, location.pathname + location.hash, history.state.ifl.d]), ['days', 'days', '/weather/#days', 2], 'Enter chooses: /weather/#days by replaceState, the focus stays on the tab');
    const [lx2, ox2] = await lens(); same(lx2, ox2, 'the lens follows (recomputed on show)');
    same(await p.evaluate(() => kitMod.shows.at(-1).section), 'days', 'the module was shown 16 Days');
    // per-section scroll
    await p.evaluate(() => scrollTo(0, 700)); await settle(p, 150);
    await p.click(H.hdSec('now')); await settle(p);
    ok((await at(p)).y < 5, 'another section opens at its own place (the top)');
    await p.click(H.hdSec('days')); await settle(p, 600);
    ok(Math.abs((await at(p)).y - 700) < 4, 'back on 16 Days, where it was scrolled to', `y ${(await at(p)).y}`);
    // fill
    await p.click(H.hdSec('radar')); await settle(p);
    ok(await p.evaluate(() => document.documentElement.classList.contains('ifl-fill')), 'Radar fills the window: html.ifl-fill (fw.fill)');
    ok(await p.$eval('#hd .ifh', (h) => getComputedStyle(h).getPropertyValue('--p').trim() === '1'), 'filling, the header is held compact');
    await p.click(H.hdSec('warnings')); await settle(p);
    ok(!(await p.evaluate(() => document.documentElement.classList.contains('ifl-fill'))), 'another section: ifl-fill cleared');
    // the Back rule
    await p.click(H.HD_PICK); await settle(p);
    ok(await p.isVisible(H.sheet('places')), 'the ▾ opened the module’s sheet');
    await p.evaluate(() => kit.F.nav.back()); await settle(p, 600);
    ok(!(await p.$(H.SHEET_OPEN)) && (await at(p)).route === '/weather/#warnings', 'Back with a sheet open: the sheet closes, nothing else');
    await p.evaluate(() => { kitMod.back = true; kit.F.nav.back(); }); await settle(p);
    same([(await at(p)).route, await p.evaluate(() => kitMod.backs)], ['/weather/#warnings', 1], 'the module’s back() handled it (true): the screen stays');
    await p.evaluate(() => { kitMod.back = false; }); await p.click(H.HD_BACK); await settle(p, 700);
    same(await at(p), { route: '/#apps', app: 'inflite', url: '/#apps', d: 1, y: 300 }, 'Back: history’s back to Apps, its scroll restored');
    same(await p.evaluate(() => kitMod.hides), 1, 'the module was told it’s hidden, not unmounted');
    // Apps from inside the app: back when the entry before is Apps
    await p.click('.ifl-tile[data-app=weather] .ifl-tile-main'); await settle(p, 600);
    await p.click(H.tab('apps')); await settle(p, 600);
    same([(await at(p)).route, (await at(p)).d], ['/#apps', 1], 'Apps tapped inside Weather opened from Apps: back (d:1), not a new entry');
    // … and a push when it isn't
    await p.click(H.tab('today')); await settle(p);
    await p.click(H.TODAY_WX_OPEN); await settle(p, 700);
    same(await p.$eval(H.HD_BACK, (b) => b.getAttribute('aria-label')), 'Back to Today', 'from Today, Back says Today');
    const d0 = (await at(p)).d;
    await p.click(H.tab('apps')); await settle(p, 600);
    same([(await at(p)).route, (await at(p)).d], ['/#apps', d0 + 1], 'Apps tapped inside Weather opened from Today: a push of /#apps');
    same(await p.evaluate(() => kitMod.mounted), 1, 'kept alive: mounted once for every open');
    await axe(p, 'Apps');
    await clean(k, 'the module from Apps');
  }

  // ---------------------------------------------------------------- 3. the zoom from Today's card (callback synchronous), the address tidied
  {
    const k = await kit({}), p = k.p;
    await p.route(`${KIT}/weather/roof/weather.js`, async (r) => { await sleep(900); r.fallback(); });
    await p.evaluate(() => {
      window.vts = [];
      new MutationObserver(() => { const v = document.documentElement.dataset.vt; if (v && window.vts.at(-1) !== v) window.vts.push(v); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-vt'] });
    });
    await p.click(H.TODAY_WX_OPEN);
    await p.waitForSelector('main#m-weather .ifl-zoom-slot .tcard', { state: 'attached', timeout: 600 }).catch(() => null);
    const z = await p.evaluate(() => { const s = document.querySelector('main#m-weather .ifl-zoom-slot'); return s && { inert: s.inert, hidden: s.getAttribute('aria-hidden'), sky: s.querySelector('.tcard')?.classList.contains('wx-sk-rain-day'), ids: s.querySelectorAll('[id]').length, mod: !!window.kitMod, skel: !!document.querySelector('main#m-weather .ifl-skeleton') }; });
    same(z, { inert: true, hidden: 'true', sky: true, ids: 0, mod: false, skel: true }, 'the card’s clone is in Weather’s skeleton at once, inert and aria-hidden, before the module is in');
    same(await p.evaluate(() => window.vts), ['zoom'], 'a zoom View Transition (html[data-vt=zoom])');
    await p.waitForFunction(() => window.kitMod?.shows?.length > 0, null, { timeout: 15000 }); await settle(p, 400);
    ok(!(await p.$('.ifl-zoom-slot')), 'the module’s hero in (fw.zoomTarget): the clone is gone');
    same(await p.evaluate(() => kitMod.shows[0]), { section: 'now', key: 'now', arg: null, query: '?lat=51.5072&lon=-0.1276&name=London', hint: { sky: 'rain-day', temp: '14°', place: 'London' } }, 'show(route, hint): the query and the card’s sky, temperature and place');
    same(await at(p), { route: '/weather/', app: 'weather', url: '/weather/', d: 1, y: 0 }, 'after show, the address is tidied: no ?lat…&name= (D6)');
    // a cold deep link to a day
    const k2 = await kit({ path: '/weather/?lat=51.3&lon=-2.9&name=Weston#day=2026-11-03' }), p2 = k2.p;
    await p2.waitForFunction(() => window.kitMod?.shows?.length > 0); await settle(p2, 400);
    same(await p2.evaluate(() => kitMod.shows[0]), { section: 'days', key: 'day', arg: '2026-11-03', query: '?lat=51.3&lon=-2.9&name=Weston', hint: null }, 'a cold deep link: 16 Days with the day and the place');
    same(await at(p2), { route: '/weather/#days', app: 'weather', url: '/weather/#days', d: 0, y: 0 }, 'its address tidied to /weather/#days (query and #day= gone)');
    same(await p2.$eval(H.HD_BACK, (x) => x.getAttribute('aria-label')), 'Back to Apps', 'a cold deep link’s Back says Apps');
    const len = await p2.evaluate(() => history.length);
    await p2.click(H.HD_BACK); await settle(p2);
    same([(await at(p2)).route, (await at(p2)).d, await p2.evaluate(() => history.length)], ['/#apps', 0, len], 'Back from a cold deep link: /#apps in its place (replaced)');
    await clean(k, 'the zoom'); await clean(k2, 'a cold deep link');
  }

  // ---------------------------------------------------------------- 4. a wiped state re-stamped; scroll per entry; browser back with a sheet open
  {
    const k = await kit(), p = k.p;
    await p.evaluate(() => scrollTo(0, 650)); await settle(p, 150);
    await p.click(H.tab('apps')); await settle(p);
    await p.click(H.tab('today')); await settle(p);
    await p.click('#toMorning'); await settle(p, 600);
    ok(await p.isVisible('dialog#morning[open]'), '#morning opened the static sheet (openEl, the frozen markup)');
    ok(!!(await p.evaluate(() => history.state?.ifl)), 'its replaceState(null) wiped the state, and F.restamp() wrote it again');
    await p.keyboard.press('Escape'); await settle(p, 600);
    ok(!(await p.$('dialog#morning[open]')), 'Escape closed it');
    await p.evaluate(() => kit.F.nav.back()); await settle(p, 600);
    same((await at(p)).route, '/', 'Back after it: Today, the entry before');
    await p.evaluate(() => kit.F.nav.back()); await settle(p, 600);
    same((await at(p)).route, '/#apps', 'Back again: Apps (the depth kept right through the wiped state)');
    await p.goBack(); await settle(p, 700);
    same([(await at(p)).route, (await at(p)).y], ['/', 650], 'browser back to the first Today: its scroll restored');
    // a state wiped and never re-stamped: going on from it heals it, so Back onto it is a step back, not forward
    await p.click(H.tab('apps')); await settle(p);
    await p.evaluate(() => { try { history.replaceState(null, '', location.href); } catch (_) {} });
    await p.evaluate(() => kit.F.nav.go('/#you')); await settle(p);
    await p.evaluate(() => kit.F.nav.back()); await settle(p, 600);
    same([(await at(p)).route, (await at(p)).d, await p.evaluate(() => kit.F.nav.prev()?.tab ?? null)], ['/#apps', 1, 'today'], 'Back onto the entry whose state was wiped: Apps at d:1 (stamped again as the page went on from it)');
    await p.evaluate(() => kit.F.nav.back()); await settle(p, 600);
    same([(await at(p)).route, (await at(p)).d, await p.evaluate(() => location.pathname)], ['/', 0, '/'], 'and Back again: Today, still in the page');
    // browser back with a sheet open
    await p.click(H.tab('you')); await settle(p);
    await p.click('[data-act=connector-weather]'); await settle(p, 600);
    ok(await p.isVisible(H.CONNECTOR_SHEET), 'You’s row opened the connector sheet');
    same(await p.$$eval(`${H.CONNECTOR_SHEET} .ifl-provides-row b`, (bs) => bs.map((x) => x.textContent)), ['Cards', 'Search', 'Notifications', 'Actions', 'Screens'], 'Weather’s connector: a row per word it fills');
    same(await p.$eval(H.CONNECTOR_SHEET, (d) => [d.dataset.app, getComputedStyle(d).getPropertyValue('--acc-fill').trim(), document.documentElement.dataset.app]), ['weather', '#1f63d6', 'inflite'], 'the sheet takes Weather’s accent; the page keeps InFlite’s');
    await p.goBack(); await settle(p, 700);
    same([await p.$$eval(H.SHEET_OPEN, (d) => d.length), (await at(p)).route, await p.evaluate(() => location.pathname + location.hash)], [0, '/', '/'], 'browser back with a sheet open: no dialog[open] left, the screen shown is the address');
    ok(!(await p.$('dialog[data-app=weather]')), 'the accent went with the sheet');
    await p.click(H.tab('you')); await settle(p);
    await p.click('[data-act=connector-fitness]'); await settle(p, 600);
    same(await p.$$eval(`${H.CONNECTOR_SHEET} .ifl-provides-row b`, (bs) => bs.map((x) => x.textContent)), ['Cards', 'Notifications', 'Actions', 'Screens'], 'Fitness’s connector says only what it fills');
    await p.click(`${H.CONNECTOR_SHEET} [data-act=open]`); await p.waitForURL(/\/fitness\//, { timeout: 5000 }).catch(() => {});
    ok(/FITNESS STAND-IN/.test(await p.textContent('body').catch(() => '')), '“Open Fitness” is a normal navigation to its page');
    await clean(k, 'a wiped state');
  }

  // ---------------------------------------------------------------- 5. sheets: focus, Escape, drag, push and pop
  {
    const k = await kit(), p = k.p;
    await p.evaluate(() => {
      const ui = kit.ui;
      window.h1 = kit.F.sheet.open({ sheet: 'connector', title: 'A Sheet', app: 'markets', body: ui.el('div', {}, ui.btn('One', { act: 'one' }), ui.btn('Two', { act: 'two' })), acts: [{ label: 'Done', act: 'done', run: () => window.h1.close() }], onClose: () => { window.wasClosed = (window.wasClosed || 0) + 1; } });
    });
    await settle(p, 600);
    ok(await p.evaluate(() => document.body.classList.contains('sheet-up') && document.activeElement === document.querySelector('dialog[open] h2')), 'open: body.sheet-up, the focus on its h2');
    same(await p.$eval(H.SHEET_OPEN, (d) => [d.getAttribute('aria-labelledby') === d.querySelector('h2').id, !!d.querySelector('.ifs-grab[aria-hidden=true]'), !!d.querySelector('header.ifs-head [data-close][aria-label=Close]'), !!d.querySelector('footer.ifs-acts')]), [true, true, true, true], 'the frozen structure: labelled by its h2, grab, close, footer');
    let inside = true;
    for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); inside &&= await p.evaluate(() => !!document.activeElement?.closest('dialog[open]')); }
    ok(inside, 'Tab keeps the focus inside the sheet');
    await p.evaluate(() => window.h1.push({ page: 'units', title: 'Units', body: kit.ui.el('p', { text: 'Pushed page' }) })); await settle(p, 500);
    same(await p.evaluate(() => [!!document.querySelector('dialog[open] [data-page=units]'), document.querySelector('dialog[open] h2').textContent, !!document.querySelector('dialog[open] .ifs-back')?.offsetParent]), [true, 'Units', true], 'push: the page (data-page) with its title and a back ‹');
    await p.click('dialog[open] .ifs-back'); await settle(p, 300);
    same(await p.evaluate(() => [!!document.querySelector('dialog[open] [data-page]'), document.querySelector('dialog[open] h2').textContent]), [false, 'A Sheet'], 'pop: back to the first page');
    // drag down
    const g = await p.$eval('dialog[open] .ifs-head', (x) => { const r = x.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; });
    await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x, g.y + 80, { steps: 4 }); await p.mouse.move(g.x, g.y + 220, { steps: 6 }); await p.mouse.up(); await settle(p, 700);
    same([await p.$$eval(H.SHEET_OPEN, (d) => d.length), await p.evaluate(() => window.wasClosed), await p.evaluate(() => document.body.classList.contains('sheet-up'))], [0, 1, false], 'dragged down: closed, onClose once, body.sheet-up gone');
    ok(!(await p.$('dialog[data-app=markets]')), 'the sheet’s accent left with it (never on the page)');
    // the toast
    await p.evaluate(() => { window.undone = 0; kit.F.toast('Saved your places', { action: { label: 'Undo', run: () => { window.undone++; } } }); }); await settle(p, 300);
    same(await p.$eval(H.TOAST, (t) => [t.textContent, t.classList.contains('on'), document.querySelector('.ifm-say')?.textContent]), ['Saved your placesUndo', true, 'Saved your places'], 'a toast with an action, read out through the one live region');
    await p.focus('.ifl-toast-act'); await sleep(6800);
    ok(!!(await p.$(`${H.TOAST}.on`)), 'focused, it stays past its 6 s');
    await p.click('.ifl-toast-act'); await settle(p, 500);
    same([await p.evaluate(() => window.undone), await p.$$eval(`${H.TOAST}.on`, (t) => t.length)], [1, 0], 'its action ran and it went');
    await p.evaluate(() => { kit.F.toast('One'); kit.F.toast('Two'); }); await settle(p, 300);
    same(await p.$$eval(H.TOAST, (t) => t.map((x) => x.textContent)), ['Two'], 'one toast at a time');
    await p.evaluate(() => IFL.note('weather', 'Notifications on', 'On this device')); await settle(p, 300);
    same(await p.$$eval('.ifm-say', (n) => n.length), 1, 'one live region (.ifm-say), after the framework’s toasts and the shared block’s own note');
    await clean(k, 'sheets and toast');
  }

  // ---------------------------------------------------------------- 6. transitions: without View Transitions, reduced motion, the UA's own
  {
    const k = await kit({ noVT: true }), p = k.p;
    await p.evaluate(() => { window.cls = []; new MutationObserver((ms) => { for (const m of ms) if (/ifl-enter-/.test(m.target.className || '')) window.cls.push(`${m.target.id}:${m.target.className.match(/ifl-enter-\w+/)[0]}`); }).observe(document.getElementById('views'), { attributes: true, attributeFilter: ['class'], subtree: true }); });
    await p.click(H.tab('apps')); await settle(p, 100);
    await p.click('.ifl-tile[data-app=weather] .ifl-tile-main'); await settle(p, 700);
    await p.goBack(); await settle(p, 700);
    same(await p.evaluate(() => [...new Set(window.cls)]), ['apps:ifl-enter-tab', 'm-weather:ifl-enter-push', 'apps:ifl-enter-pop'], 'no View Transitions: the entering screen gets ifl-enter-tab, -push, -pop');
    await clean(k, 'no View Transitions');
    const k2 = await kit({ motion: 'reduce' }), p2 = k2.p;
    await p2.evaluate(() => { window.vts = []; new MutationObserver(() => { const v = document.documentElement.dataset.vt; if (v) window.vts.push(v); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-vt'] }); });
    await p2.click(H.tab('apps')); await settle(p2);
    await p2.click(H.tab('today')); await settle(p2);
    await p2.click(H.TODAY_WX_OPEN); await settle(p2, 700);
    ok(await p2.evaluate(() => window.vts.length >= 3 && window.vts.every((v) => v === 'fade')), 'reduced motion: every kind is the 150 ms cross-fade, no zoom', JSON.stringify(await p2.evaluate(() => window.vts)));
    ok(!(await p2.$('.ifl-zoom-slot')), 'reduced motion: no card clone');
    await clean(k2, 'reduced motion');
    const k3 = await kit(), p3 = k3.p;
    await p3.click(H.tab('apps')); await settle(p3);
    await p3.evaluate(() => { window.vts = []; window.cls = []; new MutationObserver(() => { const v = document.documentElement.dataset.vt; if (v) window.vts.push(v); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-vt'] }); });
    await p3.evaluate(() => { history.replaceState({ ifl: { d: 0, k: 'ua' } }, '', '/'); dispatchEvent(new PopStateEvent('popstate', { state: history.state, hasUAVisualTransition: true })); });
    await settle(p3, 400);
    same([(await at(p3)).route, await p3.evaluate(() => window.vts), await p3.evaluate(() => document.querySelectorAll('[class*=ifl-enter-]').length)], ['/', [], 0], 'a popstate the browser already animated (hasUAVisualTransition): no transition of ours');
    await clean(k3, 'the UA’s transition');
  }

  // ---------------------------------------------------------------- 7. search
  {
    const k = await kit(), p = k.p;
    await p.evaluate(() => {
      window.fetchAsked = [];
      const f = window.fetch; window.fetch = (...a) => { window.fetchAsked.push(String(a[0])); return f(...a); };
      kit.F.search.provide({ id: 'slow', group: 'Slow', order: 90, search: (q) => new Promise((r) => setTimeout(() => r(/lo/.test(q) ? [{ title: `Slow ${q}`, sub: 'late', href: '/#you' }] : []), 800)) });
      kit.F.search.provide({ id: 'boom', group: 'Boom', order: 5, search: () => { throw new Error('no'); } });
      kit.F.search.provide({ id: 'bad', group: 'Bad', order: 6, search: () => Promise.reject(new Error('no')) });
    });
    await settle(p, 1500);
    const before = await p.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    await p.evaluate(() => { document.addEventListener('click', () => { window.focusedInTap = !!document.activeElement?.matches('dialog[data-sheet=search] input[type=search]'); }, { once: true }); });
    await p.click(H.HD_SEARCH);
    same(await p.evaluate(() => window.focusedInTap), true, 'Search: the sheet and its input made and focused inside the tap');
    same(await p.$eval(H.SEARCH_INPUT, (i) => [i.getAttribute('role'), !!document.getElementById(i.getAttribute('aria-controls'))?.matches('[role=listbox]')]), ['combobox', true], 'a combobox over a listbox');
    await settle(p, 500);
    same(await p.$$eval(H.SEARCH_RESULT, (o) => o.map((x) => x.querySelector('b').textContent)), ['Weather', 'Weather · 16 Days', 'Weather · Radar', 'Weather · Warnings', 'Chats', 'Fitness', 'Fitness · Today', 'Fitness · Activities', 'Fitness · Progress', 'Markets', 'Markets · Today', 'Markets · Holdings', 'Markets · News', 'Mail'], 'an empty field: every app and its sections (the Apps provider)');
    await p.fill(H.SEARCH_INPUT, 'lon'); await settle(p, 500);
    same(await p.$$eval(`${H.SEARCH_SHEET} [role=group]`, (g) => g.map((x) => x.getAttribute('aria-label'))), ['Places'], 'typed: your places (Places from Weather’s connector); the throwing and refusing providers left out, the slow one not yet');
    await settle(p, 700);
    same(await p.$$eval(`${H.SEARCH_SHEET} [role=group]`, (g) => g.map((x) => x.getAttribute('aria-label'))), ['Places', 'Slow'], 'the slow provider shown when it arrives, after the quick ones');
    await p.fill(H.SEARCH_INPUT, 'radar'); await settle(p, 1100);
    same(await p.$$eval(H.SEARCH_RESULT, (o) => o.map((x) => [x.querySelector('b').textContent, x.getAttribute('href')])).then((r) => r[0]), ['Weather · Radar', '/weather/#radar'], 'an app’s section by name: Weather · Radar → /weather/#radar');
    await p.fill(H.SEARCH_INPUT, 'qzxv'); await settle(p, 1100);
    same(await p.$eval(`${H.SEARCH_SHEET} .ifl-none`, (x) => x.textContent), 'Nothing for “qzxv”', '“Nothing for …” when nothing matches');
    const after = await p.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    same(after, before, 'typing kept nothing in storage');
    ok(!(await p.evaluate(() => JSON.stringify(history.state) + location.href)).includes('qzxv'), 'nor in the address or history.state');
    ok(!k.log.some((l) => /qzxv|lon|radar/.test(l.replace(/^\/weather\/roof\/.*/, ''))), 'no request carried what was typed', k.log.filter((l) => /qzxv|lon/.test(l)).join(' '));
    same(await p.evaluate(() => window.fetchAsked.filter((u) => /qzxv|lon|radar/.test(u))), [], 'no fetch with it');
    await p.fill(H.SEARCH_INPUT, 'newc'); await settle(p, 400);
    await p.press(H.SEARCH_INPUT, 'Enter'); await p.waitForFunction(() => window.kitMod?.shows?.length > 0, null, { timeout: 8000 }).catch(() => {}); await settle(p, 500);
    same([await p.$$eval(H.SHEET_OPEN, (d) => d.length), (await at(p)).route, await p.evaluate(() => kitMod.shows.at(-1).query)], [0, '/weather/', '?lat=54.978&lon=-1.617&name=Newcastle%20upon%20Tyne'], 'Enter opens the first result: the sheet closes, Weather opens at that place');
    // the module’s own provider replaces Places while it’s mounted
    await p.evaluate(() => { window.offMine = kitMod.fw.search.provide({ id: 'mine', group: 'Weather', order: 15, search: () => [{ title: 'From the module', href: '/weather/#days' }] }); });
    await p.click(H.HD_SEARCH); await p.fill(H.SEARCH_INPUT, 'lo'); await settle(p, 1100);
    same(await p.$$eval(`${H.SEARCH_SHEET} [role=group]`, (g) => g.map((x) => x.getAttribute('aria-label'))), ['Weather', 'Slow'], 'the module’s provider in place of Places while mounted');
    await axe(p, 'the search sheet');
    await clean(k, 'search');
  }

  // ---------------------------------------------------------------- 8. a module that fails; a contract mismatch; fw.lazy while stale; lost()
  {
    const k = await kit(), p = k.p;
    let failing = true;
    const asked = [];
    await p.route(new RegExp(`${KIT}/weather/roof/weather\\.js`), (r) => { asked.push(new URL(r.request().url()).search); return failing ? r.fulfill({ status: 500, body: 'no' }) : r.fallback(); });
    await p.route('https://weather.kit.test/**', (r) => r.fulfill({ status: 200, body: '<!doctype html><title>own</title><h1>WEATHER ON ITS OWN</h1>', headers: { 'content-type': 'text/html' } }));
    await p.click(H.tab('apps')); await settle(p);
    await p.click('.ifl-tile[data-app=weather] .ifl-tile-main'); await p.waitForSelector(H.ERROR, { timeout: 15000 }).catch(() => {});
    same(await p.evaluate(() => [document.querySelector('.ifl-error b')?.textContent, document.querySelector('.ifl-error p')?.textContent, [...document.querySelectorAll('.ifl-error [data-act]')].map((b) => `${b.dataset.act}:${b.textContent}`)]), ['Weather didn’t open', 'Try again, or open Weather on its own.', ['retry:Try Again', 'own:Open Weather on Its Own']], 'the entry failed: the error, Try Again and Open Weather on Its Own');
    same(await p.evaluate(() => kit.state.hubAgain), 1, 'it asked /api/hub again first (through app.js, D14)');
    await p.click(H.ERROR_RETRY); await p.waitForSelector(H.ERROR_RELOAD, { timeout: 15000 }).catch(() => {});
    ok(!!(await p.$(H.ERROR_RELOAD)) && !(await p.$(H.ERROR_RETRY)), 'a second failure offers Reload');
    same(asked, ['', '?retry=1'], 'Try Again asked for the entry again (?retry=1)');
    failing = false;
    await p.click(H.ERROR_OWN); await p.waitForURL(/weather\.kit\.test/, { timeout: 5000 }).catch(() => {});
    same(p.url(), 'https://weather.kit.test/', 'Open Weather on Its Own: Weather’s own address, same path, query and hash');
    // a contract mismatch, then a recovery
    const k2 = await kit(), p2 = k2.p;
    await p2.evaluate(() => { window.builtFor = []; const b = IFL.built; IFL.built = (...a) => { window.builtFor.push(a[0]); return b?.(...a); }; });
    await p2.route(`${KIT}/weather/roof/weather.js`, (r) => r.fulfill({ status: 200, body: 'export const CONTRACT = 2; export async function mount() { return {}; }', headers: { 'content-type': 'text/javascript' } }));
    await p2.evaluate(() => kit.F.nav.go('/weather/#days')); await p2.waitForSelector(H.ERROR, { timeout: 15000 }).catch(() => {});
    ok(!!(await p2.$(H.ERROR_RETRY)), 'a module of another contract: the error state');
    await p2.unroute(`${KIT}/weather/roof/weather.js`);
    await p2.click(H.ERROR_RETRY); await p2.waitForFunction(() => window.kitMod?.shows?.length > 0, null, { timeout: 15000 }).catch(() => {});
    same(await p2.evaluate(() => [window.kitMod?.shows.at(-1)?.section, !!document.querySelector('.ifl-error')]), ['days', false], 'Try Again with the file there: it mounts at the route');
    same(await p2.evaluate(() => window.builtFor), ['weather'], 'IFL.built once, for the module that mounted (not for the one that failed)');
    // a mount that throws: the error state, and no “Weather updated”
    const k5 = await kit(), p5 = k5.p;
    await p5.evaluate(() => { window.builtFor = []; const b = IFL.built; IFL.built = (...a) => { window.builtFor.push(a[0]); return b?.(...a); }; });
    await p5.route(new RegExp(`${KIT}/weather/roof/weather\\.js`), (r) => r.fulfill({ status: 200, body: 'export const CONTRACT = 1; export const BUILD = "9.98"; export async function mount() { throw new Error("no"); }', headers: { 'content-type': 'text/javascript' } }));
    await p5.evaluate(() => kit.F.nav.go('/weather/')); await p5.waitForSelector(H.ERROR, { timeout: 15000 }).catch(() => {});
    same([!!(await p5.$(H.ERROR_RETRY)), await p5.evaluate(() => window.builtFor)], [true, []], 'a mount that throws: the error state, and IFL.built never called');
    // fw.lazy while stale: reload at the route, the import never run
    await p2.click(H.hdSec('radar')); await settle(p2);
    await p2.evaluate(() => { kit.F.stale = true; scrollTo(0, 0); });
    const nav = p2.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    const ran = await p2.evaluate(() => { kitMod.lazy(); return kitMod.lazyRan; });
    await nav; await p2.waitForFunction(() => window.kit?.ready, null, { timeout: 10000 });
    same([ran, p2.url(), k2.log.includes('/kit/lazy.js')], [0, `${KIT}/weather/#radar`, false], 'fw.lazy while stale: the page reloads at /weather/#radar, the lazy file never asked for');
    same(await p2.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('ifl-here:today') || '{}'))), ['at', 't'], 'where you were kept for it (ifl-here:today, the shared updater’s own form)');
    // a stale page opening the app from another screen navigates instead
    await p2.evaluate(() => { kit.F.stale = true; });
    await p2.click(H.tab('apps')); await settle(p2);
    const nav2 = p2.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    await p2.click('.ifl-tile[data-app=weather] .ifl-tile-main'); await nav2;
    ok(/\/weather\/$/.test(p2.url()), 'stale, Weather opened from Apps is a real navigation (D21)');
    // lost()
    const k3 = await kit(), p3 = k3.p;
    same(await p3.evaluate(async () => [await kit.F.session.lost(), await kit.F.session.lost(), kit.state.checks, kit.state.lost]), [false, false, 1, 0], 'lost() with the session still signed in: false, asked once for both, nobody signed out');
    await p3.evaluate(() => { kit.F.nav.go('javascript:document.title="gone"'); kit.F.nav.go('data:text/html,gone'); }); await settle(p3, 300);
    same([p3.url(), await p3.title()], [`${KIT}/`, 'One roof: the framework\'s kit'], 'F.nav.go refuses javascript: and data: (only http and https leave the page)');
    const k4 = await kit(), p4 = k4.p;
    same(await p4.evaluate(async () => { kit.set({ signedIn: false }); return [await kit.F.session.lost(), kit.state.lost]; }), [true, 1], 'lost() with the session signed out: true, and signed out');
    await clean(k3, 'lost');
  }

  // ---------------------------------------------------------------- 9. a section chosen while the module loads; sign-out from Radar; CSS already in; the roof going off
  {
    const k = await kit(), p = k.p;
    await p.route(`${KIT}/weather/roof/weather.js`, async (r) => { await sleep(1500); r.fallback(); });
    await p.evaluate(() => kit.F.nav.go('/weather/'));
    await p.waitForSelector('main#m-weather .ifl-skeleton', { state: 'attached', timeout: 3000 }).catch(() => {});
    ok(await p.evaluate(() => !window.kitMod && !!document.querySelector('main#m-weather .ifl-skeleton')), 'Weather still loading: its skeleton, no module yet');
    await p.click(H.hdSec('radar'));
    await p.waitForFunction(() => window.kitMod?.shows?.length > 0, null, { timeout: 15000 }).catch(() => {}); await settle(p, 400);
    same(await p.evaluate(() => [window.kitMod?.shows.map((s) => s.section), location.pathname + location.hash, document.querySelector('main#m-weather section[data-sec=radar]')?.hidden, document.querySelector('#hd [aria-selected=true]')?.dataset.sec]), [['radar'], '/weather/#radar', false, 'radar'], 'Radar tapped during the skeleton: once the module is in, it shows Radar (never a blank screen)');
    ok(await p.evaluate(() => document.documentElement.classList.contains('ifl-fill')), 'and Radar fills the window');
    await p.evaluate(() => kit.F.destroy()); await settle(p, 100);
    same(await p.evaluate(() => { const h = document.documentElement; return [h.classList.contains('ifl-fill'), h.dataset.app, h.dataset.route ?? null, h.dataset.vt ?? null, [h, document.body].some((x) => getComputedStyle(x).overflowY === 'hidden'), kitMod.unmounts, document.getElementById('in').hidden]; }), [false, 'inflite', null, null, false, 1, true], 'signed out from Radar: no ifl-fill, the page InFlite’s again (no data-route or data-vt), it scrolls; the module unmounted, the frame hidden');
    await clean(k, 'a section during the load; sign-out from Radar');
    // the module's stylesheets already in the page and loaded: no 5 s wait for a load event that has been
    const k2 = await kit(), p2 = k2.p;
    await p2.evaluate(async () => { const { REGISTRY } = await import('/roof/router.js'); await Promise.all(REGISTRY.weather.css.map((h) => new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; l.onload = l.onerror = ok; document.head.append(l); }))); });
    const t0 = Date.now();
    await p2.evaluate(() => kit.F.nav.go('/weather/#days'));
    await p2.waitForFunction(() => window.kitMod?.shows?.length > 0, null, { timeout: 15000 }).catch(() => {});
    const took = Date.now() - t0;
    ok(took < 3000, 'its stylesheets already in: the module opens at once, not after the 5 s wait', `${took} ms`);
    // the roof going off inside Weather (D14): unmounted, the page loaded again at the section, the one bounce noted
    const nav = p2.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    const un = await p2.evaluate(() => { window.beforeBounce = 1; kit.set({ roof: false }); kit.F.setRoof(false); return kitMod.unmounts; });
    await nav; await settle(p2, 300); await p2.waitForFunction(() => window.kit?.ready, null, { timeout: 10000 }).catch(() => {});
    same([un, new URL(p2.url()).pathname + new URL(p2.url()).hash, await p2.evaluate(() => [window.beforeBounce ?? null, sessionStorage.getItem('ifl-roof-bounce')])], [1, '/weather/#days', [null, '1']], 'F.setRoof(false) in Weather (the session saying so), nothing unsaved: the module unmounted at once, the page really loaded again (a hash alone would only scroll) at /weather/#days, ifl-roof-bounce kept');
    await clean(k2, 'CSS already in; the roof going off');
  }

  // ---------------------------------------------------------------- 11. stage 2: a switch per app, C9, C7, a provider per app
  {
    // (the kit's fake module and connector at another app's addresses, as the hub would serve its files)
    const fake = async (p, app, { version = '9.99' } = {}) => {
      const MOD = readFileSync(`${HERE}roofkit/fake-module.js`, 'utf8'), CONN = readFileSync(`${HERE}roofkit/fake-connector.js`, 'utf8');
      await p.route((u) => new URL(u).pathname.startsWith(`/${app}/roof/`) || new URL(u).pathname === `/${app}/version`, (r) => {
        const q = new URL(r.request().url()).pathname;
        if (q === `/${app}/version`) return r.fulfill({ status: 200, body: JSON.stringify({ build: typeof version === 'function' ? version() : version }), headers: { 'content-type': 'application/json' } });
        if (q === `/${app}/roof/connector.js`) return r.fulfill({ status: 200, body: CONN, headers: { 'content-type': 'text/javascript' } });
        if (q === `/${app}/roof/${app}.js`) return r.fulfill({ status: 200, body: MOD, headers: { 'content-type': 'text/javascript' } });
        if (/\.css$/.test(q)) return r.fulfill({ status: 200, body: '/* the kit */', headers: { 'content-type': 'text/css' } });
        return r.fulfill({ status: 404, body: 'not found' });
      });
    };
    const mounted = (p, app) => p.waitForFunction((a) => window.kitMods?.[a]?.shows?.length > 0, app, { timeout: 15000 });
    // a. per-app setRoof: Weather off while Markets shows (Markets untouched, no reload); then Markets off while busy
    // (flushed, no reload while busy), the bounce once it isn't
    const k = await kit({ path: '/?apps=weather,markets' }), p = k.p;
    await fake(p, 'markets');
    same(await p.evaluate(() => kit.F.session.apps), { weather: true, markets: true, fitness: false, mail: false, chats: false }, 'the session’s apps: each REGISTRY app’s flag, from ?apps=');
    await p.evaluate(() => kit.F.nav.go('/weather/')); await mounted(p, 'weather');
    await p.evaluate(() => kit.F.nav.go('/markets/')); await mounted(p, 'markets'); await settle(p);
    same(await p.evaluate(() => [document.documentElement.dataset.app, location.pathname, !!document.querySelector('main#m-markets .kit-sec[data-sec=today]:not([hidden])')]), ['markets', '/markets/', true], 'a second app in the page: Markets’ stand-in at /markets/, its own sections');
    let loads = 0; p.on('load', () => { loads++; });
    await p.evaluate(() => { window.stay1 = 1; kit.set({ apps: { weather: false, markets: true } }); kit.F.setRoof(false, { weather: false, markets: true }); });
    await settle(p, 1500);
    same(await p.evaluate(() => [kitMods.weather.unmounts, kitMods.markets.unmounts, !!document.querySelector('main#m-weather'), window.stay1, location.pathname]), [1, 0, false, 1, '/markets/'], 'Weather switched off while Markets shows: Weather unmounted, Markets untouched, no reload');
    await p.evaluate(() => { kitMods.markets.busy = true; kit.set({ apps: { weather: false, markets: false } }); kit.F.setRoof(false, { weather: false, markets: false }); });
    await settle(p, 2600);
    same(await p.evaluate(() => [window.stay1, kitMods.markets.flushes >= 1, sessionStorage.getItem('ifl-roof-bounce')]), [1, true, null], 'Markets switched off while it shows with something unsaved: flushed, and no reload while busy');
    await clean(k, 'a switch per app, before the bounce');
    const nav = p.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    await p.evaluate(() => { kitMods.markets.busy = false; });
    await nav; await settle(p, 400);
    same([new URL(p.url()).pathname, await p.evaluate(() => [window.stay1 ?? null, sessionStorage.getItem('ifl-roof-bounce')])], ['/markets/', [null, '1']], 'once nothing is unsaved: the bounce, the page loaded again at /markets/ (the hub’s page with Markets off), the marker kept');
    ok(loads >= 1, 'a real load');
    await p.waitForFunction(() => window.kit?.ready, null, { timeout: 10000 }).catch(() => {});
    await clean(k, 'a switch per app, after the bounce');
    await k.ctx.close();

    // b. C9: sections: false; fw.nav.go with { replace }; stay keys left in the address (Mail's thread)
    const k2 = await kit({ path: '/?apps=weather,mail' }), p2 = k2.p;
    await fake(p2, 'mail');
    await p2.evaluate(() => kit.F.nav.go('/weather/#days')); await mounted(p2, 'weather'); await settle(p2);
    ok(!!(await p2.$(H.hdSec('radar'))), 'the switcher shown by default');
    await p2.evaluate(() => kitMod.fw.header.set({ sections: false })); await settle(p2, 150);
    ok(!(await p2.$(H.hdSec('radar'))), 'fw.header.set({ sections: false }) hides it');
    await p2.evaluate(() => kitMod.fw.header.set({ sections: undefined })); await settle(p2, 150);
    ok(!!(await p2.$(H.hdSec('radar'))), 'any other value shows it again');
    const d0 = (await at(p2)).d;
    await p2.evaluate(() => kitMod.fw.nav.go('/weather/#radar', { replace: true })); await settle(p2);
    same([(await at(p2)).d, (await at(p2)).url], [d0, '/weather/#radar'], 'fw.nav.go(path, { replace: true }): the same history entry');
    await p2.evaluate(() => kitMod.fw.nav.go('/weather/#warnings')); await settle(p2);
    same([(await at(p2)).d, await p2.evaluate(() => kitMod.fw.nav.depth())], [d0 + 1, d0 + 1], 'without it, a new entry; fw.nav.depth() says how deep');
    await p2.evaluate(() => kit.F.nav.go('/mail/#thread=t-abc123')); await mounted(p2, 'mail'); await settle(p2, 600);
    same([(await at(p2)).url, await p2.evaluate(() => kitMods.mail.shows.at(-1))], ['/mail/#thread=t-abc123', { section: 'people', key: 'thread', arg: 't-abc123', query: '', hint: null }], 'a stay key (Mail’s thread): shown, and the address left as it is');
    await p2.evaluate(() => kit.F.nav.go('/mail/#settings')); await settle(p2, 600);
    same((await at(p2)).url, '/mail/', 'a key that isn’t one: tidied to the section’s own address');
    await clean(k2, 'C9');
    await k2.ctx.close();

    // c. C7: fw.lazy while stale and busy imports with no reload; while stale and idle, the reload at the route
    const k3 = await kit(), p3 = k3.p;
    await p3.evaluate(() => kit.F.nav.go('/weather/#days')); await mounted(p3, 'weather'); await settle(p3);
    await p3.evaluate(() => { window.stay3 = 1; kitMod.busy = true; kit.F.stale = true; });
    const got = await p3.evaluate(() => kitMod.lazy().then((m) => m.LAZY ?? 'in', () => 'refused'));
    await settle(p3, 1500);
    same([got !== 'refused', await p3.evaluate(() => [window.stay3, kitMod.lazyRan])], [true, [1, 1]], 'stale and busy: fw.lazy imports as normal, and no reload (nothing unsaved lost)');
    await clean(k3, 'lazy while stale, before the reload');
    const nav3 = p3.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    await p3.evaluate(() => { kitMod.busy = false; kitMod.lazy(); });
    await nav3; await p3.waitForFunction(() => window.kit?.ready, null, { timeout: 10000 }).catch(() => {});
    same([new URL(p3.url()).pathname + new URL(p3.url()).hash, await p3.evaluate(() => window.stay3 ?? null)], ['/weather/#days', null], 'stale and nothing unsaved: fw.lazy reloads the page at the route');
    await clean(k3, 'lazy while stale, after the reload');
    await k3.ctx.close();

    // d. C7: a lazy file that fails with a new build out: the reload at the route; with none, Try Again's ?retry=1
    const k4 = await kit(), p4 = k4.p;
    let build = '9.99';
    const asked4 = [];
    await p4.route((u) => new URL(u).pathname === '/weather/version', (r) => r.fulfill({ status: 200, body: JSON.stringify({ build }), headers: { 'content-type': 'application/json' } }));
    await p4.route((u) => new URL(u).pathname === '/kit/gone.js', (r) => { asked4.push(new URL(r.request().url()).search); return r.fulfill({ status: 404, body: 'no' }); });
    await p4.evaluate(() => kit.F.nav.go('/weather/#radar')); await mounted(p4, 'weather'); await settle(p4);
    await p4.evaluate(() => { window.stay4 = 1; });
    same(await p4.evaluate(() => kitMod.lazy('/kit/gone.js').then(() => 'in', () => 'refused')), 'refused', 'a lazy file that fails: refused to the module (its error state)');
    await settle(p4, 1200);
    same(await p4.evaluate(() => [window.stay4, kit.F.stale]), [1, false], 'the same build out: no reload, not stale');
    await p4.evaluate(() => kitMod.lazy('/kit/gone.js').catch(() => {})); await settle(p4, 400);
    same(asked4, ['', '?retry=1'], 'Try Again asks for it afresh (?retry=1, a new module record)');
    await clean(k4, 'a lazy file that fails, before the reload');
    build = '10.00';
    const nav4 = p4.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    await p4.evaluate(() => kitMod.lazy('/kit/gone.js').catch(() => {}));
    await nav4; await p4.waitForFunction(() => window.kit?.ready, null, { timeout: 10000 }).catch(() => {});
    same([new URL(p4.url()).pathname + new URL(p4.url()).hash, await p4.evaluate(() => window.stay4 ?? null)], ['/weather/#radar', null], 'it fails with a new build out: the page reloads at the route (a new release, not an error)');
    await clean(k4, 'a lazy file that fails, after the reload');
    await k4.ctx.close();

    // e. a provider per app: a module's own provider replaces only its own app's; Weather's places stay in Search
    const k5 = await kit({ path: '/?apps=weather,markets' }), p5 = k5.p;
    await fake(p5, 'markets'); await fake(p5, 'fitness');
    await p5.evaluate(() => kit.F.nav.go('/markets/')); await mounted(p5, 'markets');
    await p5.evaluate(() => { kitMods.markets.fw.search.provide({ id: 'mine', group: 'Markets', order: 30, search: () => [{ title: 'From Markets’ module', href: '/markets/#news' }] }); window.kitSearch = []; });
    await settle(p5, 1500);
    await p5.click(H.HD_SEARCH); await p5.fill(H.SEARCH_INPUT, 'lon'); await settle(p5, 1100);
    same(await p5.$$eval(`${H.SEARCH_SHEET} [role=group]`, (g) => g.map((x) => x.getAttribute('aria-label'))), ['Places', 'Markets'], 'Markets’ module providing: Weather’s Places still found (London), beside Markets’ own');
    same(await p5.evaluate(() => [...new Set(kitSearch.map((s) => `${s.app}:${s.userId}`))]), ['weather:u-kit-0001'], 'a connector’s search is given the user ({ userId }); Markets’ connector not asked while its module provides');
    await p5.fill(H.SEARCH_INPUT, 'stand'); await settle(p5, 1100);
    ok(!(await p5.$$eval(H.SEARCH_RESULT, (o) => o.map((x) => x.textContent))).some((t) => /Markets stand-in/.test(t)), 'Markets’ connector provider replaced by its module’s');
    // the connector sheet per switch: its acts (label, href) and its hero's line
    const conn = (app, apps) => p5.evaluate(async ([app, apps]) => {
      const c = await import('/roof/connectors.js');
      const F = Object.create(kit.F, { session: { get: () => ({ ...kit.F.session, apps }) } });
      await c.openConnector(F, app);
      await new Promise((ok) => setTimeout(ok, 400));
      const d = document.querySelector('dialog.ifl-sheet[data-sheet=connector][open]');
      const out = d && { acts: [...d.querySelectorAll('.ifs-acts [data-act]')].map((b) => [b.dataset.act, b.textContent.trim(), b.getAttribute('href')]), line: d.querySelector('.ifs-hero span')?.textContent ?? null };
      kit.F.sheet.closeAll();
      await new Promise((ok) => setTimeout(ok, 400));
      return out;
    }, [app, apps]);
    const ON = { weather: true, markets: true, fitness: true, mail: false, chats: false }, OFF = { weather: true, markets: false, fitness: false, mail: false, chats: false };
    same(await conn('markets', ON), { acts: [['open', 'Open Markets', '/markets/'], ['notify', 'Markets Notifications', '/#you=notify']], line: 'Its own module, under one roof' }, 'Markets on: Open Markets, Markets Notifications (/#you=notify); its own module');
    same(await conn('markets', OFF), { acts: [['open', 'Open Markets', '/markets/'], ['notify', 'Markets Notifications', '/#you=notify']], line: 'An app beside InFlite' }, 'Markets off: Markets Notifications still (You’s, which works with it off); an app beside InFlite');
    same(await conn('fitness', ON), { acts: [['open', 'Open Fitness', '/fitness/'], ['settings', 'Fitness Settings', '/fitness/#settings']], line: 'Its own module, under one roof' }, 'Fitness on: Fitness Settings (/fitness/#settings); its own module');
    same(await conn('fitness', OFF), { acts: [['open', 'Open Fitness', '/fitness/']], line: 'An app beside InFlite' }, 'Fitness off: no Fitness Settings; an app beside InFlite');
    same((await conn('weather', OFF)).line, 'Its own module, under one roof', 'Weather’s hero line unchanged');
    await clean(k5, 'a provider per app; the connector sheet');
    await k5.ctx.close();

    // f. Back or Forward to a module switched off since (s24 C7): Today drawn; offline, no reload; something that couldn't
    // be saved, no reload; else, once saved, a real load at its address (the server's page for it now)
    const k6 = await kit({ path: '/?apps=weather,markets' }), p6 = k6.p;
    await fake(p6, 'markets');
    await p6.evaluate(() => kit.F.nav.go('/weather/')); await mounted(p6, 'weather');
    await p6.evaluate(() => kit.F.nav.go('/markets/')); await mounted(p6, 'markets'); await settle(p6);
    await p6.goBack(); await settle(p6, 600);
    let loads6 = 0; p6.on('load', () => { loads6++; });
    await p6.evaluate(() => { window.stay6 = 1; kit.set({ apps: { weather: true, markets: false } }); kit.F.setRoof(true, { weather: true, markets: false }); });
    await settle(p6, 400);
    same(await p6.evaluate(() => [location.pathname, !!document.querySelector('main#m-markets'), kitMods.markets.unmounts, window.stay6]), ['/weather/', false, 1, 1], 'Markets switched off while Weather shows: Markets let go of, Weather stays, no reload');
    const today6 = () => p6.evaluate(() => [location.pathname, !document.getElementById('today').hidden, window.stay6 ?? null]);
    await k6.ctx.setOffline(true);
    await p6.goForward(); await settle(p6, 2500);
    same([await today6(), loads6], [['/markets/', true, 1], 0], 'offline, Forward to /markets/ (off since): Today drawn there, no reload');
    await k6.ctx.setOffline(false);
    await p6.goBack(); await mounted(p6, 'weather'); await settle(p6, 600);
    const fl = await p6.evaluate(() => { kitMods.weather.lost = 1; return kitMods.weather.flushes; });
    await p6.goForward(); await settle(p6, 2500);
    same([await today6(), loads6, await p6.evaluate((n) => kitMods.weather.flushes > n, fl)], [['/markets/', true, 1], 0, true], 'online, something that couldn’t be saved (flush says lost): flushed, Today drawn, no reload');
    await p6.goBack(); await settle(p6, 600);
    await clean(k6, 'Back to a module off since, before the reload');
    await p6.evaluate(() => { kitMods.weather.lost = 0; });
    const nav6 = p6.waitForEvent('framenavigated', { timeout: 8000 }).catch(() => null);
    await p6.goForward();
    await nav6; await p6.waitForFunction(() => window.kit?.ready, null, { timeout: 10000 }).catch(() => {});
    same([new URL(p6.url()).pathname, await p6.evaluate(() => window.stay6 ?? null), loads6], ['/markets/', null, 1], 'online, all saved: a real load at /markets/ (the page as the server has it now)');
    await clean(k6, 'Back to a module off since, after the reload');
    await k6.ctx.close();

    // g. a zoom from another app's card carries no hint (Weather's alone, S2-D17); then a module switched off while busy,
    // and left (Back to Today) before it's saved: let go of there, no bounce, no reload
    const k7 = await kit({ path: '/?apps=weather,markets' }), p7 = k7.p;
    await fake(p7, 'markets');
    await p7.evaluate(() => { const c = kit.ui.el('article', { class: 'tcard glass', data: { app: 'markets', state: 'ok' }, 'aria-label': 'Markets' }, kit.ui.el('a', { class: 'kit-mk', href: '/markets/', text: 'Markets' })); document.getElementById('today').prepend(c); });
    await p7.click('#today .kit-mk'); await mounted(p7, 'markets'); await settle(p7);
    same(await p7.evaluate(() => [location.pathname, kitMods.markets.shows[0].hint]), ['/markets/', null], 'a Markets card on Today opens Markets with hint null (the hint is Weather’s only)');
    let loads7 = 0; p7.on('load', () => { loads7++; });
    await p7.evaluate(() => { window.stay7 = 1; kitMods.markets.busy = true; kit.set({ apps: { weather: true, markets: false } }); kit.F.setRoof(true, { weather: true, markets: false }); });
    await settle(p7, 600);
    ok(await p7.evaluate(() => !!document.querySelector('main#m-markets') && window.stay7 === 1), 'switched off while busy: still there, waiting to save');
    await p7.goBack(); await settle(p7, 2600);
    same([loads7, await p7.evaluate(() => [location.pathname, !document.getElementById('today').hidden, window.stay7 ?? null, sessionStorage.getItem('ifl-roof-bounce'), !!document.querySelector('main#m-markets'), kitMods.markets.unmounts])], [0, ['/', true, 1, null, false, 1]], 'Back to Today while it waited: Markets flushed and let go of there; no reload, no bounce marker');
    await clean(k7, 'a module switched off while busy, then left');
    await k7.ctx.close();
  }

  // ---------------------------------------------------------------- 12. stage 3's B0: Chats' stub module and stub core on the kit
  // (roof/s3/spec.md §2.2, §5.2 S3-C3, §5.4; ?apps=weather,chats puts MAIN's pigeon/roof/ at /chats/, ?service=stub the
  // stub core): the module mounts, F.service gives the frozen seven-key facade and fw.service the full service over one
  // Worker, opts.serviceState hears the state, one stub sheet opens and closes per opener file; ?state=locked starts
  // locked; with Chats off, /chats/ is still a page of its own (nothing changed for anyone)
  {
    const CARD = { v: 1, kind: 'weather', from: 'weather', at: 1793750000000, say: 'Rain in Leeds from 15:00.', snap: { place: 'Leeds', tz: 'Europe/London', temp: 12, code: 61, isDay: true, rain: { now: true } } };
    const k = await kit({ path: '/?apps=weather,chats&service=stub&state=ready', phone: true }), p = k.p;
    await p.goto(KIT + '/chats/');
    await p.waitForFunction(() => window.kit?.ready && !!document.querySelector('main#m-chats section.ch-sec'), null, { timeout: 15000 });
    await settle(p, 600);
    same(await p.evaluate(() => [document.documentElement.dataset.app, document.documentElement.dataset.route, kit.F.session.apps.chats]), ['chats', '/chats/', true], 'Chats on: /chats/ is the framework’s, html[data-app=chats]');
    same(await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => [e.dataset.sec, e.hidden]), H.CH_SEC), [['chats', false], ['friends', true]], 'the stub module: its two sections, Chats shown');
    ok(await p.isVisible(H.M_CHATS), 'main#m-chats shown');
    const svc = await p.evaluate(async () => {
      const f = await kit.F.service('chats'), s = await kit.F.forModule('chats').service(), again = await kit.F.service('chats');
      return { keys: Object.keys(f), frozen: Object.isFrozen(f), call: 'call' in f, state: f.state, same: f === again && s.facade === f, full: ['protocol', 'state', 'call', 'on', 'facade', 'release'].every((x) => x in s),
        rows: (await s.call('rows', 0, 40)).length, waiting: (await f.waiting({ ids: [] })).length, states: kit.state.serviceStates };
    });
    same(svc, { keys: ['state', 'share', 'sendTo', 'waiting', 'since', 'refresh', 'signOut'], frozen: true, call: false, state: 'ready', same: true, full: true, rows: 3, waiting: 1, states: ['chats:ready'] },
      'F.service: the frozen seven-key facade, no call; fw.service: the full service, the same one; the stub core answers; opts.serviceState heard ready');
    // (a tap (evaluate runs with one): sendTo to a friend whose key changed (Ali, the fixtures') gives the Send sheet;
    // closed, it says so. No tap: roofcontract's unit case. A card that doesn't pass engineCard: refused, no sheet)
    const tapped = await p.evaluate(async (card) => {
      const { packCard } = await import('/chats/cards.js');
      const f = await kit.F.service('chats'), bad = await f.sendTo('6c0f6f1e-0000-4000-8000-0000000000a1', 'A stand-in', null);
      if (bad?.why !== 'card') return ['no card', bad];
      const r = f.sendTo('6c0f6f1e-0000-4000-8000-0000000000a2', 'A stand-in', packCard({ ...card, at: Date.now() }));
      await new Promise((ok) => setTimeout(ok, 400));
      const open = !!document.querySelector('dialog.ifl-sheet[data-sheet=send][open]');
      kit.F.sheet.closeAll();
      return [open, await Promise.race([r, new Promise((ok) => setTimeout(() => ok('waiting'), 3000))])];
    }, CARD);
    same(tapped, [true, { ok: false, why: 'no' }], 'facade.sendTo on a tap: no card → refused (card); to a changed key → the Send sheet; closed, { ok: false, why: "no" }');
    same(k.log.filter((x) => x.startsWith('/chats/roof/core.js')).length, 1, 'one Worker for the page (its script asked for once)');
    // (one stub sheet per opener file: each opens its data-sheet and closes)
    const OPENERS = [['list.js', 'openNewChat', 'newmsg'], ['friends.js', 'openRequests', 'requests'], ['sheets.js', 'openFriendInfo', 'friendinfo'], ['flight.js', 'openFlightLog', 'flightlog'],
      ['media.js', 'openGifs', 'gifs'], ['scan.js', 'openScan', 'scan'], ['settings.js', 'openChatSettings', 'chatsettings']];
    for (const [file, fn, name] of OPENERS) {
      const r = await p.evaluate(async ([file, fn]) => {
        const fw = kit.F.forModule('chats'), svc = await fw.service(), m = await import(`/chats/roof/${file}`), { createStore } = await import('/chats/roof/store.js');
        const store = createStore(); svc.on('*', (x) => store.apply(x));
        const h = m[fn]({ fw, svc, store, open: {} }, '6c0f6f1e-0000-4000-8000-0000000000a1');
        await new Promise((ok) => setTimeout(ok, 350));
        window.kitSheet = h;
        return !!h?.close;
      }, [file, fn]);
      ok(r && await p.isVisible(`${H.chSheet(name)}[open]`), `${file} ${fn}: its sheet (${name}) opens`);
      await p.evaluate(() => window.kitSheet.close()); await settle(p, 500);
      ok(!(await p.isVisible(`${H.chSheet(name)}[open]`)), `${file} ${fn}: and closes`);
    }
    const sent = await p.evaluate(async (card) => {
      const { packCard } = await import('/chats/cards.js');
      const fw = kit.F.forModule('chats'), svc = await fw.service(), m = await import('/chats/roof/send.js');
      const r = m.openSend(fw, svc, { card: packCard({ ...card, at: Date.now() }), words: 'A stand-in', to: null });
      await new Promise((ok) => setTimeout(ok, 350));
      const open = !!document.querySelector('dialog.ifl-sheet[data-sheet=send][open]');
      kit.F.sheet.closeAll();
      return [open, await r];
    }, CARD);
    same(sent, [true, { ok: false, why: 'no' }], 'send.js openSend: its sheet (send) opens; closed, it resolves { ok: false, why: "no" }');
    await clean(k, 'Chats’ stub module and stub core');
    await k.ctx.close();
    // (the stub core started locked: the facade says so and Waiting for You gets nothing)
    const k2 = await kit({ path: '/?apps=weather,chats&service=stub&state=locked', phone: true }), p2 = k2.p;
    same(await p2.evaluate(async () => { const f = await kit.F.service('chats'); return [f.state, (await f.waiting({ ids: [] })).length, await f.since('x', 0)]; }), ['locked', 0, null], '?state=locked: the facade locked, nothing waiting, nothing since');
    await clean(k2, 'the stub core, locked');
    await k2.ctx.close();
    // (Chats off, as for everyone today: /chats/ is a page of its own; F.service refused; no Worker)
    const k3 = await kit({ path: '/' }), p3 = k3.p;
    same(await p3.evaluate(async () => [kit.F.session.apps.chats, await kit.F.service('chats').then(() => 'made', (e) => 'refused')]), [false, 'refused'], 'Chats off: F.service refused');
    ok(!k3.log.some((x) => x.startsWith('/chats/roof/')), 'Chats off: none of its files asked for');
    await p3.goto(KIT + '/chats/');
    ok(/CHATS STAND-IN/.test(await p3.textContent('body')), 'Chats off: /chats/ is its own page (a normal navigation)');
    await k3.ctx.close();
  }

  // ---------------------------------------------------------------- 10. widths and themes; long titles
  for (const [w, h] of [[320, 640], [390, 844], [768, 1024], [1280, 860]]) {
    for (const scheme of ['light', 'dark']) {
      const k = await kit({ w, h, scheme }), p = k.p;
      await p.screenshot({ path: `${OUT}/today-${w}-${scheme}.png` });
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${w} ${scheme}: Today has no sideways scroll`);
      await p.click(H.tab('apps')); await settle(p);
      await p.click('.ifl-tile[data-app=weather] .ifl-tile-main'); await p.waitForFunction(() => window.kitMod?.shows?.length > 0); await settle(p, 500);
      await p.screenshot({ path: `${OUT}/module-${w}-${scheme}.png` });
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${w} ${scheme}: the module has no sideways scroll`);
      for (const t of ['Weston-super-Mare', 'Newcastle upon Tyne']) {
        if (w > 390) break;
        await p.evaluate((t) => kitMod.fw.header.set({ title: t, compactTitle: `${t} · 14°` }), t); await settle(p, 150);
        const r = await p.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const b = q('#hd .ifl-back'), t = q('#hd h1.ifh-name'), a = q('#hd .ifh-acts'); return { b: b.right, tl: t.left, tr: t.right, a: a.left, ar: a.right, label: document.querySelector('#hd h1').getAttribute('aria-label'), w: innerWidth, tw: t.width }; });
        ok(r.b <= r.tl + 0.5 && r.tr <= r.a + 0.5 && r.ar <= r.w, `${w} ${scheme} “${t}”: Back, title and capsule side by side, none over another`, JSON.stringify(r));
        same(r.label, t, `${w} ${scheme} “${t}”: the full title in aria-label`);
        ok(r.tw >= 112, `${w} ${scheme} “${t}”: the title keeps its 112 px`, `${r.tw}`);
      }
      await p.click(H.HD_PICK); await settle(p, 600);
      await p.screenshot({ path: `${OUT}/sheet-${w}-${scheme}.png` });
      if (w === 390) await axe(p, `${w} ${scheme} with a sheet open`);
      await clean(k, `${w} ${scheme}`);
      await k.ctx.close();
    }
  }
} catch (e) {
  ok(false, 'the run finished', e.stack);
}
await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
