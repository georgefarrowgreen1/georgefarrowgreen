// Mail's real module on InFlite's framework, before Today has it (One roof stage 4, s4/spec §2.1, §2.2, §4, S4-D5–D9,
// D13, D16, D18, D23, D25, D26, §10.2): FW's kit page (roofkit/serve.mjs) at http://kit.test with
// ?module=/mail/roof/mail.js&apps=weather,mail, the inflite repo's email/public/roof/ and today/public/ from disk, and
// Mail's API stood in at http://email.kit.test by mocks/mailmock.mjs (its demo mailbox, the hub gate's refusals kept).
// Selectors only from roofhooks.mjs (and, inside the module, MM's own rows: .ml-row). Checked:
//   the module mounts at /mail/; the header: crumb, the view as title with ▾, "N unread", one act (Write), People's
//   badge; the remembered lens (mail:lens) on the first show only; lenses by the switcher, the address following
//   (/mail/#updates by replaceState), the list asked for by GET with no q; the Views sheet: a filter (Unread), an
//   address, Drafts, Trash, Mail Settings last; rows by day with their words; a swipe right = Done with Undo (the inverse
//   sent), a swipe left = the Later sheet (a choice snoozes), never one that starts in the left 20 px; the row menu (the
//   context menu); a failed action puts the row back; the outbox: save (POST /api/drafts with X-Inflite), "Sending… ·
//   Undo", POST /api/send { draftId, key } after 6 s, Undo before then sending nothing; search: Mail's provider finds a
//   loaded conversation, "Search Mail for …" is a POST with the query in its body and in no URL, history entry or
//   storage key; a phone row tap pushes /mail/#thread=<id> with the switcher hidden, Back returns; an iPad tap shows the
//   pane with no address change; the gate (reauth) says so with Confirm It's You; offline says Mail needs a connection;
//   the static bytes of the module's first open, and its same-origin requests ≤ files + 2. Reader parts are MR's
//   (roofmailmount2).
//   node .tools/tests/roofmailmount.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as H from './roofhooks.mjs';

const [,, S = new URL('./.state', import.meta.url).pathname, OUT = `${S}/out/roofmailmount`] = process.argv;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const note = (l) => console.log(`NOTE  ${l}`);
const MAIN = new URL('../../', import.meta.url).pathname, IFL = new URL('../../../inflite/', import.meta.url).pathname;
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); console.log(`FAILS ${fails + 1}`); process.exit(0); });

if (!existsSync(`${IFL}email/public/roof/mail.js`)) { ok(false, 'the inflite repo, with Mail’s module (email/public/roof/), is beside this one'); console.log(`FAILS ${fails}`); process.exit(0); }
const { serveKit, KIT } = await import('./roofkit/serve.mjs');
const { routeMail, MAIL_KIT } = await import('./mocks/mailmock.mjs');
// (spec §10.2's Mail hooks, from roofhooks.mjs once the joint contracts have them)
const M_MAIL = H.M_MAIL || 'main#m-mail';
const ROW = `${M_MAIL} .ml-row[data-thread]`;
const MODULE = '/mail/roof/mail.js';
const qs = (x) => new URLSearchParams(x.query || '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open({ width = 390, height = 844, touch = true, access = 'ok', init = null } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, locale: 'en-GB', timezoneId: 'Europe/London' });
  if (init) await ctx.addInitScript(init);
  const kit = await serveKit(ctx, { main: MAIN, ifl: IFL });
  const mail = await routeMail(ctx, { origin: KIT, access });
  const page = await ctx.newPage();
  const urls = [], errors = [], bytes = new Map();
  page.on('request', (r) => urls.push(r.url()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', async (r) => { const u = new URL(r.url()); if (u.origin === KIT && u.pathname.startsWith('/mail/roof/')) try { bytes.set(u.pathname, await r.body()); } catch {} });
  await page.goto(`${KIT}/?module=${encodeURIComponent(MODULE)}&apps=weather,mail`);
  await page.waitForFunction(() => window.kit?.ready, null, { timeout: 15000 });
  return { ctx, page, mail, kit, urls, errors, bytes };
}
const go = (page, path) => page.evaluate((p) => window.kit.F.nav.go(p), path);
const rowsText = (page) => page.$$eval(ROW, (rs) => rs.map((r) => r.getAttribute('aria-label')));
const batches = (mail) => mail.log.filter((x) => x.method === 'POST' && x.path === '/api/threads/batch').map((x) => x.body);
// (a finger dragged along a row, from x0 by dx, as touch pointer events)
async function swipe(page, sel, x0, dx) {
  const box = await page.locator(sel).first().boundingBox();
  const y = box.y + box.height / 2, x = x0 ?? box.x + 60;
  await page.locator(sel).first().evaluate((el, { x, y, dx }) => {
    const ev = (type, cx) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y, button: 0 }));
    ev('pointerdown', x);
    for (let i = 1; i <= 8; i++) ev('pointermove', x + (dx * i) / 8);
    ev('pointerup', x + dx);
  }, { x, y, dx });
}

// ======== a phone ========
{
  const { ctx, page, mail, urls, errors, bytes } = await open({ init: () => { try { localStorage.setItem('mail:lens', JSON.stringify('updates')); } catch {} } });
  ok(await page.evaluate(() => window.kit.F.session.apps?.mail === true), 'the kit’s session has Mail on (?apps=weather,mail)');
  await go(page, '/mail/');
  await page.waitForSelector(ROW, { timeout: 15000 }).catch(() => {});
  ok(await page.$(M_MAIL), 'the module mounted in main#m-mail');
  // (the remembered lens, on the first show: Updates)
  await page.waitForFunction(() => document.documentElement.dataset.route === '/mail/#updates', null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => location.hash === '#updates'), 'the first show of a bare /mail/ goes to the remembered lens (mail:lens = updates, S4-D25)', await page.evaluate(() => location.href));
  ok(await page.$eval(H.hdSec('updates'), (t) => t.getAttribute('aria-selected')) === 'true', 'the switcher shows Updates');
  ok(mail.log.some((x) => x.path === '/api/threads' && qs(x).get('category') === 'updates'), 'Updates asked for by GET /api/threads?category=updates');
  ok(mail.log.filter((x) => x.path === '/api/threads').every((x) => !qs(x).has('q')), 'no q in a GET, ever');
  // People by the switcher
  await page.click(H.hdSec('people'));
  await page.waitForFunction(() => location.pathname === '/mail/' && !location.hash, null, { timeout: 5000 }).catch(() => {});
  await page.waitForSelector(ROW, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => location.pathname + location.hash) === '/mail/', 'People is /mail/ (by replaceState)');
  await page.waitForFunction(() => localStorage.getItem('mail:lens') === '"people"', null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('mail:lens'))) === 'people', 'the lens remembered: mail:lens');
  // the header
  const head = await page.evaluate(({ T, C, L, P }) => ({ title: document.querySelector(T)?.getAttribute('aria-label'), crumb: document.querySelector(C)?.textContent.trim(), line: document.querySelector(L)?.textContent.trim(), pick: !!document.querySelector(P) }), { T: H.HD_TITLE, C: H.HD_CRUMB, L: H.HD_LINE, P: H.HD_PICK });
  ok(head.title === 'All Mail', 'title: the view (All Mail)', head.title);
  ok(head.crumb === 'Mail', 'crumb: Mail', head.crumb);
  ok(/^\d+ unread$|^All caught up$/.test(head.line), 'line: “N unread” or “All caught up”', head.line);
  ok(head.pick, 'the title has its ▾');
  const acts = await page.$$eval('#hd [data-act]', (bs) => bs.map((b) => b.dataset.act));
  ok(JSON.stringify(acts) === JSON.stringify(['search', 'compose']), 'one act besides search: Write (data-act=compose, S4-D26)', JSON.stringify(acts));
  const badge = await page.$eval(H.hdSec('people'), (t) => ({ n: t.querySelector('.ifl-sec-badge')?.textContent, label: t.getAttribute('aria-label') })).catch(() => null);
  ok(badge?.n && /^People, \d+ unread$/.test(badge.label || ''), 'People’s badge, said “People, N unread”', JSON.stringify(badge));
  ok(!(await page.$(`${H.hdSec('updates')} ${H.SEC_BADGE}`)), 'no red badge on Updates');
  // rows
  await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((r) => /Maya Chen/.test(r.getAttribute('aria-label'))), ROW, { timeout: 5000 }).catch(() => {});
  const rows = await rowsText(page);
  ok(rows.length >= 3 && rows.some((r) => /Maya Chen/.test(r)), 'rows with their words', rows.join(' | '));
  ok(await page.$(`${M_MAIL} .ml-day`), 'by day');
  await page.screenshot({ path: `${OUT}/phone-people.png` });

  // the Views sheet: Unread
  await page.click(H.HD_PICK);
  await page.waitForSelector(H.sheet('mail-views') + '[open]', { timeout: 5000 }).catch(() => {});
  const viewRows = await page.$$eval(`${H.sheet('mail-views')} .ifl-row`, (rs) => rs.map((r) => r.querySelector('b')?.textContent));
  ok(viewRows.includes('Unread') && viewRows.includes('Drafts') && viewRows.includes('Trash'), 'Views: the filters, Drafts, Trash', viewRows.join(', '));
  ok(viewRows.at(-1) === 'Mail Settings', 'Mail Settings is the last row', viewRows.at(-1));
  ok(viewRows.some((r) => /^Only Mail to /.test(r || '')), 'an address lens per address');
  await page.click(`${H.sheet('mail-views')} [data-act="filter-unread"]`);
  await page.waitForFunction((T) => document.querySelector(T)?.getAttribute('aria-label') === 'Unread', H.HD_TITLE, { timeout: 5000 }).catch(() => {});
  ok(await page.$eval(H.HD_TITLE, (h) => h.getAttribute('aria-label')) === 'Unread', 'title: Unread');
  ok((await rowsText(page)).every((r) => /^Unread/.test(r)), 'only unread rows');
  ok(mail.log.some((x) => x.path === '/api/threads' && qs(x).get('view') === 'unread'), 'asked for view=unread');
  ok(await page.evaluate(() => location.pathname + location.hash) === '/mail/', 'a filter is never an address');
  // Trash, then back
  await page.click(H.HD_PICK);
  await page.click(`${H.sheet('mail-views')} [data-act="trash"]`);
  await page.waitForFunction((T) => document.querySelector(T)?.getAttribute('aria-label') === 'Trash', H.HD_TITLE, { timeout: 5000 }).catch(() => {});
  ok(mail.log.some((x) => x.path === '/api/threads' && qs(x).get('view') === 'trash'), 'Trash: view=trash');
  await page.click(H.HD_PICK);
  await page.click(`${H.sheet('mail-views')} [data-act="back"]`);
  await page.waitForFunction((T) => document.querySelector(T)?.getAttribute('aria-label') === 'All Mail', H.HD_TITLE, { timeout: 5000 }).catch(() => {});
  await page.waitForSelector(ROW, { timeout: 5000 }).catch(() => {});
  ok(await page.$eval(H.HD_TITLE, (h) => h.getAttribute('aria-label')) === 'All Mail', 'back to People’s All Mail');

  // swipe right: Done, with Undo
  const first = await page.$eval(ROW, (r) => r.dataset.thread);
  await swipe(page, `${ROW}[data-thread="${first}"]`, 120, 260);
  await page.waitForFunction((s) => !document.querySelector(s), `${ROW}[data-thread="${first}"]`, { timeout: 5000 }).catch(() => {});
  ok(!(await page.$(`${ROW}[data-thread="${first}"]`)), 'a swipe right takes the row away at once (Done)');
  await wait(300);
  ok(batches(mail).some((x) => x.action === 'done' && x.ids?.[0] === first), 'Done through POST /api/threads/batch', JSON.stringify(batches(mail)));
  ok(mail.log.filter((x) => x.method === 'POST').every((x) => x.inflite), 'every write carries X-Inflite: 1');
  const toast = await page.$eval(H.TOAST, (t) => t.textContent).catch(() => '');
  ok(/Done/.test(toast) && /Undo/.test(toast), 'the toast: Done · Undo', toast);
  await page.click(`${H.TOAST} button`);
  await page.waitForSelector(`${ROW}[data-thread="${first}"]`, { timeout: 5000 }).catch(() => {});
  ok(batches(mail).some((x) => x.action === 'inbox' && x.ids?.[0] === first), 'Undo sends the inverse (inbox)');
  ok(await page.$(`${ROW}[data-thread="${first}"]`), 'and the row is back');

  // a swipe that starts in the left 20 px is the framework's Back, never a row's
  const before = batches(mail).length;
  await swipe(page, `${ROW}[data-thread="${first}"]`, 12, 260);
  await wait(500);
  ok(batches(mail).length === before && await page.$(`${ROW}[data-thread="${first}"]`), 'no swipe from the left 20 px (D19)');

  // swipe left: the Later sheet; a choice snoozes it
  await swipe(page, `${ROW}[data-thread="${first}"]`, 300, -260);
  await page.waitForSelector(H.sheet('mail-later') + '[open]', { timeout: 5000 }).catch(() => {});
  ok(await page.$(H.sheet('mail-later') + '[open]'), 'a swipe left opens Later');
  const choices = await page.$$eval(`${H.sheet('mail-later')} .ifl-row b`, (bs) => bs.map((x) => x.textContent));
  ok(choices.includes('Tomorrow Morning') && choices.includes('Pick a Time'), 'Later’s choices', choices.join(', '));
  await page.click(`${H.sheet('mail-later')} .ifl-row:has-text("Tomorrow Morning")`);
  await wait(400);
  const snooze = batches(mail).find((x) => x.action === 'snooze');
  ok(snooze && snooze.ids[0] === first && snooze.until > Date.now(), 'snoozed until tomorrow morning', JSON.stringify(snooze));
  ok(!(await page.$(`${ROW}[data-thread="${first}"]`)), 'and gone from People');

  // the row menu (press and hold / the context menu)
  const second = await page.$eval(ROW, (r) => r.dataset.thread);
  await page.dispatchEvent(`${ROW}[data-thread="${second}"]`, 'contextmenu');
  await page.waitForSelector(H.sheet('mail-rowmenu') + '[open]', { timeout: 5000 }).catch(() => {});
  const menu = await page.$$eval(`${H.sheet('mail-rowmenu')} .ifl-row b`, (bs) => bs.map((x) => x.textContent));
  ok(['Reply', 'Forward', 'Done', 'Later…', 'Move to Trash'].every((w) => menu.includes(w)), 'the row menu', menu.join(', '));
  // (a failed action: the row put back where it was)
  mail.set({ fail: { 'POST /api/threads/batch': 500 } });
  await page.click(`${H.sheet('mail-rowmenu')} [data-act="trash"]`);
  await page.waitForFunction((s) => !!document.querySelector(s), `${ROW}[data-thread="${second}"]`, { timeout: 5000 }).catch(() => {});
  await wait(300);
  ok(await page.$(`${ROW}[data-thread="${second}"]`), 'Mail refusing it: the row is put back');
  mail.set({ fail: {} });

  // the outbox: save, then send after 6 s; Undo before then sends nothing
  const sent0 = mail.sends.length;
  const outbox = await page.evaluate(async (mailBase) => {
    const [{ createOutbox }, { createStore }, { createApi }, logic] = await Promise.all([import('/mail/roof/outbox.js'), import('/mail/roof/store.js'), import('/mail/roof/api.js'), import('/mail/roof/logic.js')]);
    const fw = window.kit.F.forModule('mail'), opened = [];
    const ctx = { store: createStore({ access: 'ok' }), api: createApi({ base: mailBase }), logic, fw, actions: { counts() {}, load() {} }, open: { compose: (i) => opened.push(i) } };
    const ob = createOutbox(ctx);
    window.__ob = { ob, ctx, opened };
    const draft = { from: 'hello@inflite.ai', to: [{ email: 'leo.martins@fastmail.com' }], subject: 'Re: Dinner Friday?', text: 'See you then', quote: { of: 'demo-3', mode: 'reply' } };
    const a = await ob.send(draft, []);
    const b = await ob.send({ ...draft, subject: 'Undone' }, []);
    return { a, b, sending: ctx.store.get().sending };
  }, MAIL_KIT);
  ok(outbox.a.ok && outbox.a.draftId && outbox.b.ok, 'Send saves a server draft first (POST /api/drafts)', JSON.stringify(outbox));
  ok(mail.log.filter((x) => x.path === '/api/drafts' && x.method === 'POST').every((x) => x.inflite && x.body.quote?.of === 'demo-3'), 'the draft carries quote { of, mode }, with X-Inflite');
  ok(/Sending…/.test(await page.$eval(H.TOAST, (t) => t.textContent).catch(() => '')), '“Sending… · Undo”');
  await page.evaluate((k) => window.__ob.ob.undo(k), outbox.b.key);
  await wait(3500);
  ok(mail.sends.length === sent0, 'nothing sent before 6 s');
  await page.waitForFunction((n) => true, null);
  await wait(3500);
  const sends = mail.log.filter((x) => x.path === '/api/send');
  ok(sends.length === 1 && sends[0].body.draftId === outbox.a.draftId && sends[0].body.key === outbox.a.key && Object.keys(sends[0].body).sort().join() === 'draftId,key', 'after 6 s: POST /api/send { draftId, key } and nothing else', JSON.stringify(sends.map((x) => x.body)));
  ok(await page.evaluate(() => window.__ob.opened.length === 1 && window.__ob.opened[0].subject === 'Undone'), 'the undone one opened again in compose, its draft kept');
  await page.evaluate(() => window.__ob.ob.destroy());

  // search: Mail's provider, and "Search Mail for …" as a POST
  const subj = (await page.$eval(`${ROW} .ml-subj`, (x) => x.textContent.trim())) || 'Dinner';
  const word = subj.split(/\s+/).find((w) => w.length > 3) || subj;
  await page.click(H.HD_SEARCH);
  await page.fill(H.SEARCH_INPUT, word);
  await page.waitForSelector(`${H.SEARCH_RESULT}:has-text("${subj}")`, { timeout: 5000 }).catch(() => {});
  ok(await page.$(`${H.SEARCH_RESULT}:has-text("${subj}")`), `Mail’s provider finds a loaded conversation (“${word}”)`, (await page.$$eval(H.SEARCH_RESULT, (rs) => rs.map((r) => r.textContent))).join(' | '));
  await page.fill(H.SEARCH_INPUT, 'Lisbon');
  await page.waitForSelector(`${H.SEARCH_RESULT}:has-text("Search Mail for “Lisbon”")`, { timeout: 5000 }).catch(() => {});
  await page.click(`${H.SEARCH_RESULT}:has-text("Search Mail for “Lisbon”")`);
  await page.waitForSelector(`${ROW}`, { timeout: 5000 }).catch(() => {});
  await wait(400);
  const posted = mail.log.find((x) => x.path === '/api/threads/search');
  ok(posted?.method === 'POST' && posted.body?.q === 'Lisbon', '“Search Mail for …” is a POST with q in its body', JSON.stringify(posted?.body));
  ok(!urls.some((u) => /lisbon/i.test(u)), 'the query is in no request URL');
  ok(!(await page.evaluate(() => /lisbon/i.test(location.href + JSON.stringify(history.state) + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })))), 'nor the address, history.state or storage');
  ok((await rowsText(page)).some((r) => /Lisbon/.test(r)), 'Mail’s results in the list');
  // (cleared: the list again)
  await page.click(`${M_MAIL} .ml-chips .ifl-chip`);
  await wait(500);
  ok(!(await rowsText(page)).some((r) => /Lisbon/.test(r)), 'the search cleared from its chip');

  // a phone row: the reader as a history entry, the switcher hidden, Back returns
  await page.waitForSelector(ROW);
  const id = await page.$eval(ROW, (r) => r.dataset.thread);
  await page.click(`${ROW}[data-thread="${id}"]`);
  await page.waitForFunction((i) => location.hash === `#thread=${i}`, id, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => location.hash) === `#thread=${id}`, 'a row tap pushes /mail/#thread=<id> (S4-D6)');
  ok(await page.$eval(H.HD_TABLIST, (t) => t.closest('[hidden]') !== null || t.hidden).catch(() => true), 'the switcher hidden on the reader (sections: false)');
  ok(await page.$eval(H.HD_BACK, (b) => b.getAttribute('aria-label')) === 'Back to Mail', 'Back says “Back to Mail”');
  const acts2 = await page.$$eval('#hd [data-act]', (bs) => bs.map((b) => b.dataset.act));
  ok(acts2.includes('done') && acts2.includes('later'), 'the reader’s acts: Done and Later', acts2.join(','));
  await page.click(H.HD_BACK);
  await page.waitForFunction(() => !location.hash, null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => location.pathname + location.hash) === '/mail/', 'Back returns to the list');
  ok(await page.$eval(H.HD_TITLE, (h) => h.getAttribute('aria-label')) === 'All Mail', 'and the header is the lens’s again, no subject left');

  // keys: j moves to a row, e acts on it
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('j');
  const focused = await page.evaluate(() => document.activeElement?.dataset?.thread || null);
  ok(!!focused, 'j focuses a row (S4-D23)', await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} rows=${document.querySelectorAll('.ml-row').length}`));

  // the static bytes of the first open, and the requests
  const own = urls.filter((u) => u.startsWith(`${KIT}/mail/roof/`)).map((u) => new URL(u).pathname);
  const files = [...new Set(own)];
  const js = files.filter((f) => f.endsWith('.js')), css = files.filter((f) => f.endsWith('.css'));
  const gz = (list) => list.reduce((n, f) => n + (bytes.get(f) ? gzipSync(bytes.get(f), { level: 9 }).length : 0), 0);
  note(`first open: ${js.length} JS (${(gz(js) / 1024).toFixed(1)} KB gzip, comments in), ${css.length} CSS (${(gz(css) / 1024).toFixed(1)} KB)`);
  ok(new Set(own.filter((f) => !/compose|signin|viewer|mailsettings/.test(f))).size <= 15 + 2, '/mail/roof/ requests ≤ files + 2', String(files.length));
  ok(gz(js) <= 55 * 1024 * 1.25, 'static JS within the budget (55 KB, comments stripped: roofmailcontract measures it exactly)', String(gz(js)));
  ok(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/phone-end.png` });
  await ctx.close();
}

// ======== an iPad: the pane, no address change ========
{
  const { ctx, page, errors } = await open({ width: 1024, height: 768, touch: false });
  await go(page, '/mail/');
  await page.waitForSelector(ROW, { timeout: 15000 }).catch(() => {});
  const id = await page.$eval(ROW, (r) => r.dataset.thread);
  await page.click(`${ROW}[data-thread="${id}"]`);
  await wait(400);
  ok(await page.evaluate(() => location.pathname + location.hash) === '/mail/', 'an iPad tap writes no address (S4-D6)');
  ok(await page.$(`${ROW}[data-thread="${id}"].selected`), 'the row is selected, the pane beside it');
  ok(await page.$eval(`${M_MAIL} .ml-reader`, (r) => !r.hidden), 'the reader’s pane shows');
  // (a cold #thread= on an iPad: list and pane, the address tidied to the lens's)
  await go(page, `/mail/#thread=${id}`);
  await page.waitForFunction(() => !location.hash, null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => location.pathname + location.hash) === '/mail/', 'a #thread= on an iPad is tidied to the lens’s address');
  ok(!errors.length, 'no page errors (iPad)', errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/ipad.png` });
  await ctx.close();
}

// ======== Mail's gate, and offline ========
{
  const { ctx, page, mail } = await open({ access: 'reauth' });
  await go(page, '/mail/');
  await page.waitForSelector(`${M_MAIL} [data-act="signin"]`, { timeout: 10000 }).catch(() => {});
  ok(await page.$(`${M_MAIL} [data-act="signin"]`), 'Mail’s own gate (reauth): Confirm It’s You (S4-D12)');
  ok(!mail.log.some((x) => x.path === '/api/threads'), 'no list asked for behind the gate');
  await ctx.close();
  // (the module's files in first, as the root worker keeps them; then no connection at all)
  const o = await open();
  await o.page.evaluate(async () => { const c = await import('/mail/roof/connector.js'); await Promise.all(c.connector.files.filter((f) => f.endsWith('.js')).map((f) => import(f))); });
  o.mail.set({ offline: true });
  await o.ctx.setOffline(true);
  await go(o.page, '/mail/');
  await o.page.waitForFunction((s) => /needs a connection/.test(document.querySelector(s)?.textContent || ''), M_MAIL, { timeout: 10000 }).catch(() => {});
  ok(/Mail needs a connection/.test(await o.page.$eval(M_MAIL, (m) => m.textContent).catch(() => '')), 'offline: “Mail needs a connection…” (S4-D15)');
  await o.ctx.close();
}

await b.close();
console.log(`FAILS ${fails}`);
