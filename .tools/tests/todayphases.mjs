// Today's day, phase by phase (Today First: spec §7.3, §7.4, §7.7, §8.3, §14.3, §14.4), end to end in real Chromium:
// the inflite repo's Today Worker run by wrangler dev on :8787 against the stand-in account (mocks/todaystub.mjs on
// :8789), which answers each moment of the demo's day (Monday 2 November 2026, London) from mocks/today/cards.<phase>.json;
// the page's clock is Playwright's, installed at the fixture's moment, so a boundary is crossed with clock.runFor.
// Checked: each phase's top card, the header's line, Waiting for You and Coming Up present or absent (before and during
// a ride, the ride alone), the top card's lines as rows beside their apps' icons, no Send or Open anywhere on Today
// (Today 1.15–1.18: each app has its own), and nothing to type in; a boundary crossed and a passed row taken away
// with no request (the stand-in's log); a return to the page asks again; Undo, Take and Keep call /api/act and
// /api/act/undo; the after card without Stress offers no Open Fitness (the card's head is the way); an answer that says
// planning is asked again once, 5 seconds on. At the hub (IFL.hub stood in for, as hubshare.mjs and wxhub.mjs spy on it):
// the hub's paths through IFL.hub.go, nothing sent through IFL.hub.send or Chat's engine from the cards or Send to Leo,
// and Waiting for You's words from the engine only beside a message the server named and only when as new as the
// server's. And once Today's page is the hub's (its marker, batch S), the page's own IFL.hub with no stand-in: the
// hub's paths and no Send, with /api/hub saying ready. Under One roof (the framework beside: roof/router.js), the
// header's line is the phase's (the date above the title, in the crumb), the page's toasts are the framework's, and
// Radar opens in the page at /weather/#radar (one document), its screen Weather's, here its error state with both ways
// on (the module's files not served by this stub stack). No CSP violation, console error or sideways scroll anywhere.
//   node .tools/tests/todayphases.mjs [state dir] [screenshots dir]     (or ./run.sh todayphases)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = new URL('./', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || new URL('../../../inflite/', import.meta.url).pathname;
const OUT = process.argv[3] || `${tmpdir()}/todayphases`;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8787', STUB = 'http://127.0.0.1:8789';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; };
const same = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), l, `got ${JSON.stringify(a)?.slice(0, 400)}, wanted ${JSON.stringify(b)?.slice(0, 400)}`);
if (!existsSync(`${IFL}today/public/day.js`)) { console.log('SKIP  the inflite repo isn’t beside this one'); console.log('FAILS 0'); process.exit(0); }

const FIX = (p) => JSON.parse(readFileSync(new URL(`./mocks/today/cards.${p}.json`, import.meta.url), 'utf8'));
const PHASES = ['morning', 'midday', 'preride', 'riding', 'after', 'after-fit', 'evening'];
const F = Object.fromEntries(PHASES.map((p) => [p, FIX(p)]));
const SESSION = 'stubsession0123456789abcdefABCDEF';
const DAY = ':is(#today, #cards)';
const PAT = F.midday.waiting[0].id, MIRA = F.after.tops.after.wrote[0].id, LEO = F.after.tops.after.sendTo.id;
const [MOVE, ADD] = F.morning.acts.map((a) => a.id);

// ---- the stand-in account and Today's Worker ----
const stub = spawn(process.execPath, [`${HERE}mocks/todaystub.mjs`, '8789'], { stdio: ['ignore', 'ignore', 'inherit'] });
const wbin = [`${IFL}node_modules/.bin/wrangler`, `${HERE}node_modules/.bin/wrangler`].find((f) => existsSync(f));
let wlog = '';
const wr = spawn(wbin, ['dev', '--port', '8787', '--var', 'ACCOUNT_ORIGIN:http://127.0.0.1:8789'], { cwd: IFL, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
wr.stdout.on('data', (d) => (wlog += d)); wr.stderr.on('data', (d) => (wlog += d));
let stopped = false;
const stop = () => { if (stopped) return; stopped = true; try { process.kill(-wr.pid, 'SIGTERM'); } catch {} try { stub.kill(); } catch {} };
process.on('exit', stop);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); process.exit(1); });
const up = async (u) => { for (let i = 0; i < 90; i++) { try { if ((await fetch(u)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 1000)); } return false; };
if (!(await up(`${STUB}/__log`)) || !(await up(`${BASE}/version`))) { console.log(wlog.slice(-2000)); ok(false, 'the stub and Today’s Worker start'); console.log(`FAILS ${fails}`); stop(); process.exit(1); }

const ctl = (path, body) => fetch(STUB + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const reqs = async () => (await ctl('/__log')).filter((e) => e.path.startsWith('/api/account/today/'));
const cardsAsked = async () => (await reqs()).filter((e) => e.method === 'GET' && e.path.endsWith('/today/cards'));
const reset = () => ctl('/__reset', {});
const real = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await real(100); } }

// ---- IFL.hub, stood in for: everything asked of it written down in window.__hub; Chat's engine, if given ----
// (kept as the page's IFL.hub where the page sets its own on window too, as the hub's page does for Chat's engine: the
// page's setting it, by assignment or defineProperty, is let be here and its own hub left alone, so these parts test
// day.js and cards.js against this stand-in whatever the page does. The page's own hub: 'the page’s own IFL.hub' below)
function standInHub(o) {
  const log = (window.__hub = []);
  const engine = o.engine ? {
    state: 'ready',
    waiting: async (q) => { log.push(['waiting', JSON.parse(JSON.stringify(q))]); return o.engine.waiting || []; },
    since: async (id, t) => { log.push(['since', id, t]); return (o.engine.since || {})[id] || null; },
    sendTo: async (id, words, packed) => { log.push(['sendTo', id, words, packed, !!navigator.userActivation?.isActive]); return o.engine.sendTo || { ok: true, say: 'Sent to Leo. You’re still here' }; },
    share: async (...a) => { log.push(['share', ...a]); return true; },
  } : null;
  const SUBS = { chat: '/chats/', weather: '/weather/', fitness: '/fitness/', finance: '/markets/' };
  const IFL = { hub: {
    on: true, base: '/', degraded: false,
    go(url) {
      log.push(['go', String(url)]);
      try {
        const u = new URL(String(url), location.href), m = /^(chat|weather|fitness|finance)\./.exec(u.host);
        if (u.origin === location.origin) return u.pathname + u.search + u.hash;
        return m ? SUBS[m[1]].slice(0, -1) + u.pathname + u.search + u.hash : url;
      } catch { return url; }
    },
    send(words, packed, opts) { log.push(['send', words, packed, opts ? JSON.parse(JSON.stringify(opts)) : opts]); return Promise.resolve(true); },
    chat: () => Promise.resolve(engine),
    sent(say) { log.push(['sent', say]); },
    closed() {},
  } };
  // (the page's own IFL, as it sets it on window, kept behind the stand-in: everything but these parts of its hub is the
  // page's, so its framework (which reads window.IFL: the header, the tab bar) works as ever)
  let real = null, merged = null;
  const view = () => { if (!real) return IFL; if (!merged) merged = { ...real, hub: Object.assign(Object.create(real.hub), IFL.hub) }; return merged; };
  const define = Object.defineProperty;
  define(window, 'IFL', { get: view, set() {}, enumerable: true, configurable: false });
  Object.defineProperty = function (obj, key, desc) { if (obj === window && key === 'IFL') { real = desc?.value || null; merged = null; return obj; } return define.call(Object, obj, key, desc); };
}
const hubLog = (p, kind) => p.evaluate((k) => (window.__hub || []).filter((x) => !k || x[0] === k), kind);

// ---- the browser ----
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
const errs = [];
// a phone at a moment of the day: the stand-in answering that moment, the page's clock installed at it
async function open(ph, { time = F[ph].at, hub = null, w = 390, h = 844, scheme = 'dark', patch = null, wait = true, setup = null } = {}) {
  await ctl('/__mode', { phase: ph });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block' });
  await ctx.addCookies([{ name: 'account', value: SESSION, url: BASE }]);
  await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  if (hub) await ctx.addInitScript(standInHub, hub);
  await ctx.clock.install({ time: new Date(time) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${ph}: pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (40[14]|50[12])/.test(m.text())) errs.push(`${ph}: ${m.text()}`); });
  // (the account's answer changed on its way, where a part needs a moment the fixtures don't have)
  // (a request still on its way as the page closes is let go)
  if (patch) await p.route((u) => new URL(u).pathname === '/api/today', async (r) => {
    try {
      const res = await r.fetch(), a = await res.json();
      await r.fulfill({ response: res, json: patch(a) });
    } catch {}
  });
  if (setup) await setup(p);
  await p.goto(BASE + '/');
  if (wait) await p.waitForSelector(`${DAY}[data-phase="${F[ph].phase}"] #top .day-top`, { timeout: 15000 });
  return { ctx, p };
}
const text = (p, s) => p.$eval(s, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const shown = (p, s) => p.$eval(s, (e) => !e.hidden && e.getClientRects().length > 0).catch(() => false);
const ONLY = process.env.ONLY?.split(',');
async function part(name, fn) { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { ok(false, name, e.stack?.split('\n').slice(0, 3).join(' | ')); } }
// (One roof: the date is the header's crumb, above the title, and the line the phase's own, or where the weather is in
// the morning; before it, the line was the date and the place)
const ROOF = existsSync(`${IFL}today/public/roof/router.js`);
const TOAST_ON = ROOF ? '.ifl-toast.on' : '.toast.on';
const LINES = { morning: ROOF ? 'London' : 'Monday 2 November · London', midday: '12:30 · what’s next', preride: '16:05 · your ride', riding: '16:50 · riding', after: '18:05 · ride done', 'after-fit': '18:05 · ride done', evening: '21:00 · closed' };
const SHOWS = { morning: 'wcr', midday: 'wcr', preride: '', riding: '', after: 'cr', 'after-fit': 'cr', evening: 'cr' };
// (the top card as Today 1.18 draws it: each line a row, without the app's name in front ("Markets: …"), its first letter
// capitalised; a figure that only says the title's digits again left out; no Open or Send to Leo, the rows saying where)
const rowWords = (l) => { const w = l.replace(/^(Markets|Fitness|Weather|Chat|Mail):\s*/i, ''); return w.charAt(0).toUpperCase() + w.slice(1); };
const rowApp = (l) => /^(Markets|Fitness|Weather|Chat|Mail):/i.exec(l)?.[1].toLowerCase() || null;
const digitsOf = (x) => (String(x).match(/\d+(?:[.,]\d+)?/g) || []).join(' ');
const statsShown = (top) => top.stats.filter((s) => !digitsOf(top.title) || digitsOf(s.value) !== digitsOf(top.title));

// ======================================================================= each moment of the day, off the hub
await part('each phase', async () => {
  for (const ph of PHASES) {
    await reset();
    const a = F[ph], top = a.tops[a.phase], { ctx, p } = await open(ph);
    const sel = `${DAY}[data-phase="${a.phase}"]`;
    ok(await p.$(`${sel} #top .day-top[data-phase="${a.phase}"]`), `${ph}: the top card is ${a.phase}’s`);
    same(await text(p, `${sel} #top .dt-h`), top.title, `${ph}: its title`);
    same(await text(p, `${sel} #top .dt-chip`), top.chip, `${ph}: its chip`);
    const rowsDrawn = await p.$$eval(`${sel} #top ul.dt-rows > li`, (ls) => ls.map((l) => [l.querySelector('.dt-ic') ? (l.querySelector('img.dt-ic')?.getAttribute('src') || 'glyph') : null, l.querySelector('span:not(.dt-ic)')?.textContent ?? l.textContent]));
    same(rowsDrawn.map((r) => r[1]), top.lines.map(rowWords), `${ph}: its lines, as rows (no app’s name in front, each begun with a capital)`);
    ok(rowsDrawn.length === top.lines.length && rowsDrawn.every((r) => r[0]) && top.lines.every((l, i) => !rowApp(l) || rowsDrawn[i][0] === `/apps/${rowApp(l)}.svg`), `${ph}: each row beside its app’s icon (or a glyph)`, JSON.stringify(rowsDrawn.map((r) => r[0])));
    same(await p.$$eval(`${sel} #top .dt-stats > div`, (ds) => ds.map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent])), statsShown(top).map((s) => [s.label, s.value]), `${ph}: its figures`);
    same(await text(p, '#hd .ifh-line'), LINES[ph], `${ph}: the header’s line`);
    if (ROOF) same(await text(p, '#hd .ifh-crumb') || '', '', `${ph}: no date above the title (Today 1.39 took it away)`);
    const want = SHOWS[ph], hasWaiting = want.includes('w') && a.waiting.length > 0;
    same(await shown(p, `${sel} #waiting`), hasWaiting, `${ph}: Waiting for You ${hasWaiting ? 'shown' : 'not shown'}`);
    same(await shown(p, `${sel} #coming`), want.includes('c'), `${ph}: Coming Up ${want.includes('c') ? 'shown' : 'not shown'}`);
    same(await shown(p, `${sel} #rest`), want.includes('r'), `${ph}: The Rest of Today ${want.includes('r') ? 'shown' : 'put away'}`);
    if (!want) ok(!(await shown(p, `${sel} #waiting`)) && !(await shown(p, `${sel} #coming`)) && !(await shown(p, `${sel} #rest`)), `${ph}: the ride alone`);
    // (no Send anywhere on Today since Today 1.16–1.18, though the answer still has words to send: not on the top card,
    // the four cards or Coming Up's rows. Each app has its own Send)
    ok(!!top.share, `${ph}: the answer’s top card still has words to send`);
    same(await p.$$eval(`${sel} [data-send], ${sel} [data-do="sendto"], ${sel} .dc-send`, (xs) => xs.length), 0, `${ph}: no Send on the top card, the cards or Coming Up`);
    same(await p.$$eval(`${sel} #top [data-do="open"]`, (xs) => xs.length), 0, `${ph}: no Open on the top card (its rows say where)`);
    if (want.includes('r')) {
      const rest = await p.$$eval(`${sel} #rest .tcard`, (cs) => cs.map((c) => [c.dataset.app, !!c.querySelector('a.tc-head[href]'), !!c.querySelector('.tc-go')]));
      same(rest, Object.keys(a.cards).map((k) => [k, true, false]), `${ph}: the four cards in Edit’s order, each head the link to its app, with no Open`);
    }
    if (want.includes('c')) {
      const rows = await p.$$eval(`${sel} #coming .dc-row`, (rs) => rs.map((r) => r.querySelector('b').textContent));
      // (in the evening, what's left of tonight and tomorrow's first: nothing after the next morning's first row)
      const dawn = a.timeline.find((x) => x.phase === 'morning' && x.at > a.at)?.at ?? Infinity, later = a.upcoming.filter((r) => r.at > a.at);
      const cut = a.phase === 'evening' ? later.findIndex((r) => r.at >= dawn) : -1;
      const exp = (cut < 0 ? later : later.slice(0, cut + 1)).map((r) => r.title);
      same(rows, exp, `${ph}: Coming Up’s rows`);
    }
    same(await p.$$eval(`${DAY} input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), ${DAY} textarea, ${DAY} [contenteditable]`, (xs) => xs.length), 0, `${ph}: no box to type in`);
    // (off the hub, links go to each app's own address, never a hub path this site may not have yet)
    const opens = await p.$$eval(`${sel} #top a[data-do="answer"], ${sel} #rest a.tc-head, ${sel} #coming a.dc-main`, (as) => as.map((x) => x.getAttribute('href')));
    ok(opens.every((h) => /^https?:\/\/(chat|weather|fitness|finance)\./.test(h)), `${ph}: Answer, the cards’ heads and Coming Up at the apps’ own addresses`, JSON.stringify(opens));
    if (ph === 'midday') {
      same(await text(p, `${sel} #waiting .dw-row b`), 'Pat', 'midday: Pat waiting, by name from the server');
      same(await text(p, `${sel} #waiting .dw-row small`), '2 messages, the last at 09:41', 'midday: and when');
      ok(!(await shown(p, `${sel} #waiting .dw-words`)), 'midday: no words without Chat’s engine');
    }
    if (ph === 'after') {
      ok(!(await p.$(`${sel} #top a[data-do="open"]`)) && F.after.tops.after.buttons.some((x) => x.do === 'open'), 'after, without Stress: no Open Fitness, though the answer offers it (the Fitness card’s head opens Fitness)');
      ok(await p.$(`${sel} #top a[data-do="answer"]`) && !(await p.$(`${sel} #top [data-do="sendto"]`)), 'after: Answer Mira stays; no Send to Leo');
      ok(!(await p.$$eval(`${sel} #top dt`, (ds) => ds.some((d) => d.textContent === 'Stress'))), 'after, without Stress: no Stress figure');
      ok((await text(p, `${sel} #top .dt-rows`)).includes('Stress and fitness once Fitness has it'), 'after: “once Fitness has it”');
    }
    if (ph === 'after-fit') {
      ok(await p.$$eval(`${sel} #top dt`, (ds) => ds.some((d) => d.textContent === 'Stress')), 'after, in Fitness: Stress');
      ok(!(await p.$(`${sel} #top a[data-do="open"][href$="/#activities"]`)), 'after, in Fitness: no Open Fitness');
      ok(await p.$eval(`${sel} #top .dt-up dd`, (d) => d.textContent === '63 ↑').catch(() => false), 'after, in Fitness: Fitness up');
    }
    ok(await p.evaluate(() => !!document.querySelector('link[rel="stylesheet"][href="/day.css"]') && getComputedStyle(document.querySelector('.dt-chip')).borderRadius === '999px'), `${ph}: day.css applied`);
    await p.screenshot({ path: `${OUT}/${ph}-390-dark.png`, fullPage: true });
    // (the day asked for, version 2, and nothing written by drawing it)
    const asked = await reqs();
    ok(asked.some((e) => e.method === 'GET' && e.path.endsWith('/today/cards') && e.query.v === '2'), `${ph}: the day asked for, version 2`);
    same(asked.filter((e) => e.method !== 'GET').map((e) => e.path), [], `${ph}: nothing written just by looking`);
    await ctx.close();
  }
});

// ======================================================================= the next phase at its minute, with no request
await part('a boundary crossed', async () => {
  const preride = F.preride.at, { ctx, p } = await open('midday', { time: preride - 60e3 });
  same(await text(p, '#hd .ifh-line'), '16:04 · what’s next', 'a minute before the ride’s 40: midday');
  await reset();
  // (any request the page might make held, never answered, so the switch can't lean on one)
  const held = [];
  await p.route('**/api/**', (r) => { held.push(r.request().url()); });
  await p.clock.runFor(2 * 60e3);
  await p.waitForSelector(`${DAY}[data-phase="preride"] #top .day-top[data-phase="preride"]`, { timeout: 5000 });
  same(held, [], 'the ride took over at its minute, with no request made by the page');
  same(await reqs(), [], 'and none reached the stand-in');
  same(await text(p, `${DAY} #top .dt-h`), F.preride.tops.preride.title, 'the ride’s card, from the midday answer’s tops');
  same(await text(p, '#hd .ifh-line'), '16:06 · your ride', 'the header says so');
  ok(!(await shown(p, `${DAY} #waiting`)) && !(await shown(p, `${DAY} #coming`)) && !(await shown(p, `${DAY} #rest`)), 'the ride alone');
  await p.screenshot({ path: `${OUT}/boundary-preride.png`, fullPage: true });
  await ctx.close();
});

await part('a passed row', async () => {
  const rain = F.midday.upcoming[0], { ctx, p } = await open('midday', { time: rain.at - 30e3 });
  ok((await text(p, `${DAY} #coming`)).includes('Rain reaches London'), '14:59: the rain’s row');
  await reset();
  await p.clock.runFor(60e3);
  await until(async () => !(await text(p, `${DAY} #coming`)).includes('Rain reaches London'), 3000);
  ok(!(await text(p, `${DAY} #coming`)).includes('Rain reaches London'), '15:00: the rain’s row gone');
  ok((await text(p, `${DAY} #coming`)).includes('London closes'), 'the rest still there');
  same(await reqs(), [], 'with no request');
  await ctx.close();
});

// ======================================================================= coming back to the page
await part('a return', async () => {
  const { ctx, p } = await open('midday');
  await reset();
  await p.clock.runFor(3 * 60e3);
  same(await cardsAsked(), [], 'three minutes on, nothing asked while it’s open');
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const got = await until(async () => (await cardsAsked()).length > 0);
  ok(got, 'back to the page: the day asked for again');
  ok((await cardsAsked())[0]?.query?.v === '2', 'version 2');
  await ctx.close();
});

// ======================================================================= Undo, Take and Keep
await part('undo', async () => {
  const { ctx, p } = await open('morning');
  await reset();
  // (what the page sends: the stand-in sees only what Today's Worker passes on, which checks X-Inflite and drops it)
  const sent = [];
  p.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/act')) sent.push([new URL(r.url()).pathname, r.headers()['x-inflite'], r.postData()]); });
  await p.click(`${DAY} #top button[data-do="undo"][data-id="${MOVE}"]`);
  await p.waitForFunction((s) => /Undone\. Moves are suggested now, not made/.test(document.querySelector(s)?.textContent || ''), TOAST_ON, { timeout: 5000 });
  ok(true, 'Undo: the account’s word, said');
  const u = (await reqs()).find((e) => e.method === 'POST' && e.path.endsWith('/today/act/undo'));
  same(u && JSON.parse(u.body), { id: MOVE }, 'Undo: POST /api/act/undo { id }');
  same(sent, [['/api/act/undo', '1', JSON.stringify({ id: MOVE })]], 'sent with X-Inflite');
  same(u?.headers.origin, BASE, 'and passed on with Today’s Origin');
  await p.waitForSelector(`${DAY} #top button[data-do="undo"][data-id="${MOVE}"]`, { state: 'detached', timeout: 5000 });
  ok(await p.$(`${DAY} #top button[data-do="undo"][data-id="${ADD}"]`), 'that Undo gone, the other still there');
  ok(await p.evaluate(() => document.activeElement?.id === 'dt-h'), 'the focus on the card’s title, not lost');
  await p.screenshot({ path: `${OUT}/undo.png` });
  await ctx.close();
});

await part('keep', async () => {
  const keep = (a) => ({ ...a, tops: { ...a.tops, morning: { ...a.tops.morning, buttons: [{ do: 'keep', id: ADD, label: 'Keep Thursday’s Ride' }, ...a.tops.morning.buttons] } } });
  const { ctx, p } = await open('morning', { patch: keep });
  await reset();
  await p.click(`${DAY} #top button[data-do="keep"]`);
  await p.waitForFunction((s) => /Kept/.test(document.querySelector(s)?.textContent || ''), TOAST_ON, { timeout: 5000 });
  const k = (await reqs()).find((e) => e.method === 'POST' && e.path.endsWith('/today/act'));
  same(k && JSON.parse(k.body), { id: ADD }, 'Keep: POST /api/act { id }');
  await p.waitForSelector(`${DAY} #top button[data-do="keep"]`, { state: 'detached', timeout: 5000 });
  ok(true, 'Keep: kept, and asked no more');
  await ctx.close();
});

await part('take', async () => {
  const OFFER = '7a0e1f52-3c4d-4e5f-8a9b-0c1d2e3f4a09';
  const take = (a) => ({ ...a, acts: [...a.acts, { id: OFFER, rule: 'moveRide', kind: 'move', state: 'offered', level: 'suggest', said: 'Your ride clashes with Mira’s call', undoUntil: null }],
    tops: { ...a.tops, morning: { ...a.tops.morning, buttons: [{ do: 'take', id: OFFER, label: 'Move It to 16:45' }] } } });
  const { ctx, p } = await open('morning', { patch: take });
  const bodies = [];
  // (the stand-in has no offer in its fixtures: this one answered here, as the account would)
  await p.route('**/api/act', async (r) => {
    bodies.push([r.request().headers()['x-inflite'], r.request().postData()]);
    await r.fulfill({ json: { act: { id: OFFER, rule: 'moveRide', kind: 'move', state: 'taken', level: 'suggest', said: 'Moved your ride to 16:45, clear of Mira’s call', undoUntil: null }, rule: { rule: 'moveRide', level: 'suggest', line: 'Moved 3 · kept 3' } } });
  });
  same(await text(p, `${DAY} #top button[data-do="take"]`), 'Move It to 16:45', 'the suggestion’s one button');
  await p.click(`${DAY} #top button[data-do="take"]`);
  await p.waitForFunction((s) => /Moved your ride to 16:45/.test(document.querySelector(s)?.textContent || ''), TOAST_ON, { timeout: 5000 });
  same(bodies, [['1', JSON.stringify({ id: OFFER })]], 'Take: POST /api/act { id }, with X-Inflite');
  await p.waitForSelector(`${DAY} #top button[data-do="take"]`, { state: 'detached', timeout: 5000 });
  ok(true, 'Take: taken, and offered no more');
  await ctx.close();
});

await part('acts not built yet', async () => {
  const { ctx, p } = await open('morning');
  await p.route('**/api/act/undo', (r) => r.fulfill({ status: 501, json: { error: 'Not built yet.' } }));
  await p.click(`${DAY} #top button[data-do="undo"][data-id="${MOVE}"]`);
  await p.waitForFunction((s) => /can’t do that just yet/.test(document.querySelector(s)?.textContent || ''), TOAST_ON, { timeout: 5000 });
  same(await p.$$eval(`${DAY} #top [data-do="undo"], ${DAY} #top [data-do="take"], ${DAY} #top [data-do="keep"]`, (xs) => xs.length), 0, 'an account side without acts (501): their buttons gone');
  same(await p.$$eval(`${DAY} #top ul.dt-rows > li`, (ls) => ls.length), F.morning.tops.morning.lines.length, 'and the card otherwise as it was (its rows all there)');
  await ctx.close();
});

// ======================================================================= the day's plan still being worked out
await part('planning', async () => {
  // (the page's clock stopped once it's open, so five seconds are five seconds; then an answer that says planning, as a
  // return to the page brings it)
  let planning = false;
  const { ctx, p } = await open('midday', { patch: (a) => (planning ? ((planning = false), { ...a, planning: true }) : a) });
  await p.clock.pauseAt(new Date((await p.evaluate(() => Date.now())) + 100));
  await p.clock.runFor(3 * 60e3);
  await reset();
  planning = true;
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  ok(await until(async () => (await cardsAsked()).length === 1), 'back to the page: asked, and the answer says planning');
  await real(600);
  await reset();
  await p.clock.runFor(4000);
  await real(300);
  same(await cardsAsked(), [], 'four seconds on: not asked yet');
  await p.clock.runFor(1500);
  ok(await until(async () => (await cardsAsked()).length === 1), 'five seconds on: asked once more');
  await p.clock.runFor(20000);
  await real(500);
  same((await cardsAsked()).length, 1, 'and only once (the next answer isn’t planning)');
  await ctx.close();
});

// ======================================================================= at the hub
// (Coming Up's rain row is the way to Radar now: the top card has no Open since Today 1.18)
const RAIN = `${DAY} #coming .dc-row a.dc-main:has(b:text-is("Rain reaches London"))`;
await part('at the hub: links, and no Send', async () => {
  const a = F.midday, { ctx, p } = await open('midday', { hub: {} });
  const radar = await p.$eval(RAIN, (x) => x.getAttribute('href'));
  same(radar, '/weather/#radar', 'Radar, from Coming Up’s rain row: the hub’s path');
  ok((await hubLog(p, 'go')).some((g) => g[1] === '/weather/#radar'), 'through IFL.hub.go');
  ok(await p.$eval(`${DAY} #rest .tcard[data-app="weather"] .tc-head`, (x) => x.getAttribute('href').startsWith('/weather/')), 'the Weather card’s head at /weather/ too');
  // (no Send on Today at the hub either: not the top card, Coming Up's rows (nor a long press on one) or the cards; the
  // engine's sheet is each app's own Send's, and the Waiting for You chips')
  same(await p.$$eval(`${DAY} [data-send], ${DAY} .dc-send, ${DAY} .dc-row[data-sends]`, (xs) => xs.length), 0, 'no Send on the top card, Coming Up’s rows or the cards');
  ok(!!a.upcoming[0].share && !!a.cards.markets.share, 'though the answer has words for them');
  await p.click(`${DAY} #coming .dc-row:first-child .dc-main`, { button: 'right' }).catch(() => {});
  await real(300);
  same(await hubLog(p, 'send'), [], 'a long press (or right click) on a Coming Up row sends nothing');
  same(new URL(p.url()).pathname, '/', 'still on Today');
  if (!ROOF) {
    // (a stand-in Weather page, which asks for the hub's cross-fade as every hub page does (InFlite's menu.css:
    // @view-transition): one that didn't would have the browser give up the cross-fade from Today with an error)
    await p.route('**/weather/**', (r) => r.fulfill({ body: '<!doctype html><title>Weather</title><style>@view-transition { navigation: auto; }</style>', contentType: 'text/html' }));
    await p.click(RAIN);
    await p.waitForURL(`${BASE}/weather/#radar`, { timeout: 5000 });
    ok(true, 'Radar opens /weather/#radar in the same window');
  }
  await ctx.close();
});

// (One roof: with the hub ready and roof on (/api/hub stood in for), Radar is the framework's, in this same document: the
// address /weather/#radar by pushState (from Coming Up's rain row), Weather's screen shown, and, the module's files not served by this stub stack
// (stood in for as missing, 404), its error state with Try Again and Open Weather on Its Own, never a load of a page)
await part('at the hub, under the roof: Radar in the page', async () => {
  if (!ROOF) { console.log('SKIP  Radar in the page: the inflite repo beside has no roof yet'); return; }
  const setup = async (p) => {
    await p.route((u) => new URL(u).pathname === '/api/hub', (r) => r.fulfill({ json: { ready: true, roof: true }, headers: { 'Cache-Control': 'no-store' } }));
    await p.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => r.fulfill({ body: '<!doctype html><title>Chats</title>', contentType: 'text/html' }));
    await p.route((u) => /^\/weather\/.+/.test(new URL(u).pathname), (r) => r.fulfill({ status: 404, body: 'Not found', contentType: 'text/plain' }));
  };
  const { ctx, p } = await open('midday', { hub: {}, setup });
  // (documents loaded in the tab: a pushState is never one)
  let loads = 0;
  p.on('load', () => { loads++; });
  await p.evaluate(() => { window.__same = 1; });
  await p.click(RAIN);
  await p.waitForURL(`${BASE}/weather/#radar`, { timeout: 5000 });
  await p.waitForSelector('main#m-weather:not([hidden]) .ifl-error [data-act=retry]', { timeout: 20000 });
  ok(await p.evaluate(() => window.__same === 1), 'Radar: /weather/#radar in the same document (pushState), never a page load');
  same(loads, 0, 'no page loaded');
  same(await p.evaluate(() => [document.documentElement.dataset.app, document.getElementById('today').hidden]), ['weather', true], 'Weather’s screen shown, Today’s hidden');
  ok(await p.$('main#m-weather .ifl-error [data-act=own]'), 'the error state offers Open Weather on Its Own beside Try Again');
  await p.screenshot({ path: `${OUT}/hub-radar-error.png` });
  await p.goBack();
  await p.waitForFunction(() => !document.getElementById('today').hidden, null, { timeout: 5000 });
  ok(await p.evaluate(() => window.__same === 1) && new URL(p.url()).pathname === '/', 'Back: Today again, in the same document');
  await ctx.close();
  // (the frame's own word of the module it couldn't load, expected here and nowhere else)
  for (let i = errs.length - 1; i >= 0; i--) if (/Failed to fetch dynamically imported module: \S+\/weather\/roof\/weather\.js/.test(errs[i])) errs.splice(i, 1);
});

await part('at the hub: Waiting for You’s words', async () => {
  const at = F.midday.waiting[0].at, hold = F.midday.cards.markets.holdings[0];
  const engine = { waiting: [
    { id: PAT, first: 'Pat', at, said: 'Did you see Tesco this week? Dinner Friday?', kind: 'question', topics: ['TSCO.L'] },
    { id: 'b1c2d3e4-0000-4000-8000-000000000099', first: 'Nia', at: at + 1, said: 'NOT NAMED BY THE SERVER', kind: 'message', topics: [] },
  ] };
  const { ctx, p } = await open('midday', { hub: { engine } });
  await p.waitForSelector(`${DAY} #waiting .dw-words.in:not([hidden])`, { timeout: 5000 });
  same(await text(p, `${DAY} #waiting .dw-words`), '“Did you see Tesco this week? Dinner Friday?”', 'Pat’s words, from the engine, beside her name');
  same(await text(p, `${DAY} #waiting .dw-row b`), 'Pat', 'her name from the server');
  ok(!(await text(p, 'body')).includes('NOT NAMED BY THE SERVER'), 'nothing for anyone the server didn’t name');
  const w = (await hubLog(p, 'waiting'))[0]?.[1];
  same(w, { ids: [PAT], stocks: F.midday.cards.markets.holdings.map((h) => ({ sym: h.sym, name: h.name })) }, 'the engine asked about the server’s ids, with your holdings’ names');
  same(await text(p, `${DAY} #waiting .dw-chip`), 'Tesco', 'a Tesco chip from what she asked');
  await p.click(`${DAY} #waiting .dw-chip`);
  same((await hubLog(p, 'send')).at(-1), ['send', 'Tesco +1.2% today.', hold.sendCard, { to: PAT }], 'the chip: Tesco’s card to Pat, percent only');
  ok(await p.evaluate(() => !Object.keys(localStorage).some((k) => /Tesco this week|Dinner Friday/.test(localStorage.getItem(k) || ''))), 'her words kept nowhere in this browser');
  await p.screenshot({ path: `${OUT}/hub-waiting.png`, fullPage: true });
  await ctx.close();
  // (an engine behind the server: no words, only who and when)
  const stale = await open('midday', { hub: { engine: { waiting: [{ id: PAT, first: 'Pat', at: at - 60e3, said: 'Older words', kind: 'message', topics: [] }] } } });
  await until(async () => (await hubLog(stale.p, 'waiting')).length > 0, 3000);
  await real(300);
  ok(!(await shown(stale.p, `${DAY} #waiting .dw-words`)) && !(await text(stale.p, 'body')).includes('Older words'), 'a stale engine: no words beside a newer message');
  same(await text(stale.p, `${DAY} #waiting .dw-row small`), '2 messages, the last at 09:41', 'just when Pat wrote');
  await stale.ctx.close();
});

await part('at the hub: the after card', async () => {
  const a = F.after, top = a.tops.after;
  const engine = { since: { [MIRA]: { said: 'Running a bit late, can we say 18:45?', at: top.wrote[0].at } } };
  const { ctx, p } = await open('after', { hub: { engine } });
  await p.waitForSelector(`${DAY} #top .dt-said.in:not([hidden])`, { timeout: 5000 });
  same(await text(p, `${DAY} #top .dt-said`), 'Mira: “Running a bit late, can we say 18:45?”', 'who wrote while you rode, with her words from the engine');
  same((await hubLog(p, 'since'))[0], ['since', MIRA, a.ride.start], 'asked since the ride began');
  same(await p.$eval(`${DAY} #top a[data-do="answer"]`, (x) => x.getAttribute('href')), `/chats/#open=${MIRA}`, 'Answer Mira: /chats/#open=<id>');
  // (no Send to Leo since Today 1.18, though the answer offers it: nothing asked of the engine, no sheet)
  ok(top.buttons.some((x) => x.do === 'sendto') && !(await p.$(`${DAY} #top [data-do="sendto"]`)) && !(await p.$(`${DAY} #top [data-send]`)), 'no Send to Leo (nor any Send) on the after card, though the answer offers it');
  await real(300);
  same([await hubLog(p, 'sendTo'), await hubLog(p, 'send')], [[], []], 'nothing sent through the engine, no sheet');
  await ctx.close();
});

// ======================================================================= at the hub: the page's own IFL.hub
// (no stand-in: Today's own IFL.hub, the hub's Worker saying it's ready (/api/hub, addendum A1), as day.js and cards.js
// find it on the page itself. Only once Today's page is the hub's (its marker, batch S's index.html): before that the page
// has no hub of its own to use. Chats isn't served here: its engine's frame gets a blank page. The answer's links to the
// apps' own addresses are put on this site's (weather.localhost:8787, as weather.inflite.ai is live), since the hub
// takes an app's address to its path only on its own site)
const HERE_SITE = (a) => JSON.parse(JSON.stringify(a).replace(/https:\/\/(chat|weather|fitness|finance)\.inflite\.ai/g, (_, app) => `http://${app}.localhost:8787`));
await part('at the hub: the page’s own IFL.hub', async () => {
  const setup = async (p) => {
    await p.route((u) => new URL(u).pathname === '/api/hub', (r) => r.fulfill({ json: { ready: true }, headers: { 'Cache-Control': 'no-store' } }));
    await p.route((u) => new URL(u).pathname.startsWith('/chats/'), (r) => r.fulfill({ body: '<!doctype html><title>Chats</title>', contentType: 'text/html' }));
  };
  const { ctx, p } = await open('midday', { setup, patch: HERE_SITE });
  if (!(await p.$('meta[name="ifl-hub"]'))) {
    console.log('SKIP  at the hub, the page’s own IFL.hub: Today’s page isn’t the hub’s yet (no ifl-hub marker: batch S)');
    await ctx.close();
    return;
  }
  ok(await p.evaluate(() => !('__hub' in window)), 'no stand-in on this page');
  same(await p.$eval(RAIN, (x) => x.getAttribute('href')), '/weather/#radar', 'the page’s own hub: Radar (Coming Up’s rain row) at the hub’s path, in the one window');
  same(await p.$$eval(`${DAY} [data-send], ${DAY} #top [data-do="open"]`, (xs) => xs.length), 0, 'the page’s own hub: no Send or Open on Today');
  ok(await p.$eval(`${DAY} #rest .tcard[data-app="weather"] .tc-head`, (x) => x.getAttribute('href').startsWith('/weather/')).catch(() => false), 'the page’s own hub: the Weather card’s head at /weather/');
  ok(!(await p.$$eval(`${DAY} a[href]`, (as) => as.some((a) => /^https?:\/\/(chat|weather|fitness|finance)\./.test(a.getAttribute('href'))))), 'no link of the day’s leaves the hub');
  await p.screenshot({ path: `${OUT}/hub-own.png`, fullPage: true });
  await ctx.close();
});

// ======================================================================= every width, light and dark
await part('every width, light and dark', async () => {
  for (const ph of ['midday', 'after']) for (const scheme of ['light', 'dark']) for (const [w, h] of [[320, 568], [390, 844], [844, 390], [1024, 1366]]) {
    const { ctx, p } = await open(ph, { w, h, scheme, hub: w === 390 ? { engine: { waiting: [{ id: PAT, first: 'Pat', at: F.midday.waiting[0].at, said: 'Did you see Tesco this week? Dinner Friday?', kind: 'question', topics: ['TSCO.L'] }] } } : null });
    await real(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, `${ph} ${w}×${h} ${scheme}: no sideways scroll`, `${over}px`);
    const small = await p.$$eval(`${DAY} #top button, ${DAY} #top a.pill, ${DAY} .dw-chip`, (xs) => xs.filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
    same(small, 0, `${ph} ${w}×${h} ${scheme}: every button at least 44 points`);
    if (scheme === 'light' || w !== 390) await p.screenshot({ path: `${OUT}/${ph}-${w}x${h}-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
});
same(errs, [], 'no CSP violation and no console error, on any page');

await b.close();
stop();
console.log(`FAILS ${fails}`);
process.exit(fails ? 1 : 0);
