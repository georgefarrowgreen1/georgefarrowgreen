// Mail's reader and sheets on InFlite's framework, on the kit page (One roof stage 4, s4/spec §10.2 roofmailmount2, §2.1,
// §2.2, §3.1, S4-D4, D6, D11, D12, D17, D18; MR's files): FW's kit page (roofkit/serve.mjs) at http://kit.test with
// ?module=/mail/roof/mail.js, the inflite repo's email/public/roof/ and today/public/ from disk, and Mail's Worker stood
// in by mocks/mailmock.mjs at http://email.kit.test (its hub-gate refusals kept: a body asked for, a q in a URL or a write
// without X-Inflite is answered 403 and fails the check that reads the log). Body frames are stood in here: the shell at
// email.kit.test/body/ is a blank page (roofmailbody proves the real one). Checked:
//   1 the reader on a phone (390): a row's tap pushes /mail/#thread=<id>; message cards from /meta, the newest open with
//     its body frame (iframe.mail-body, src at Mail's /body/ with the message in the hash, the sandbox §3.2 gives); no
//     /api/messages/<id> ever asked for; pictures by CORS as blob: images, the SVG and the PDF links at Mail's address;
//     the viewer opens on a picture tap (pictures only), Share or Save, closes with its blob: URLs revoked;
//   2 the reader at 1024 (iPad): the list and the pane side by side, the pane's toolbar (Done, Later, ⋯), no address change;
//   3 compose: Reply with "Quoted below" and the snippet; Send with Undo (the draft kept, compose back), then Send again
//     and after the undo window Mail's /api/send has { draftId, key } and the draft's quote is { of, mode } (no html);
//     a changed compose closed with Escape: mail:unsent written, then POST /api/drafts and "Draft saved"; a quoteOld
//     draft says so and Send asks "Send Without the Quoted Text?";
//   4 Mail Settings: every page (addresses, an address, Unknown Addresses, Signature), a save with only its key, the row to
//     Mail's own address in a new tab, no New Address or Delete Address inside;
//   5 sign-in: signIn() goes to auth.kit.test with signin=mail, ask and back=…/mail/ and keeps the verifier in this tab;
//     finishSignIn swaps the code at Mail's /api/auth/handback and lets the verifier go.
// Needs MM's module core (mail.js, list.js, api.js, store.js, outbox.js) to be real: until then it prints "SKIPPED: …".
//   node .tools/tests/roofmailmount2.mjs [state dir] [screenshots dir]      (run.sh does this)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as H from './roofhooks.mjs';
import { routeMail, MAIL_KIT } from './mocks/mailmock.mjs';

const [,, S = new URL('./.state', import.meta.url).pathname, OUT = `${S}/out/roofmailmount2`] = process.argv;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${!c && extra ? '  — ' + extra : ''}`); if (!c) fails++; return !!c; };
const note = (l) => console.log(`NOTE  ${l}`);
const done = () => { console.log(`FAILS ${fails}`); process.exit(0); };
const MAIN = new URL('../../', import.meta.url).pathname, IFL = new URL('../../../inflite/', import.meta.url).pathname;
process.on('uncaughtException', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); fails++; done(); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`); fails++; done(); });

const MR = `${IFL}email/public/roof/`;
const stub = (f) => !existsSync(MR + f) || /^\s*export\s+const\s+STUB\s*=\s*true/m.test(readFileSync(MR + f, 'utf8'));
if (!existsSync(`${IFL}today/public/roof/frame.js`) || !existsSync(`${MR}mail.js`)) { ok(false, 'the inflite repo, with the framework and Mail’s module, is beside this one'); done(); }
const core = ['mail.js', 'list.js', 'api.js', 'store.js', 'outbox.js', 'logic.js'].filter(stub);
if (core.length) { console.log(`SKIPPED: MM’s module core is still B0-b’s stubs (${core.join(', ')})`); done(); }
const mine = ['reader.js', 'compose.js', 'mailsettings.js', 'viewer.js', 'signin.js'].filter(stub);
if (mine.length) { ok(false, 'MR’s files are real', mine.join(', ')); done(); }
const framesReal = !stub('bodyframe.js');
let serveKit, KIT, PAGE_HEADERS;
try { ({ serveKit, KIT, PAGE_HEADERS } = await import('./roofkit/serve.mjs')); } catch (e) { ok(false, 'FW’s kit page is here (.tools/tests/roofkit/serve.mjs)', e.message); done(); }
// (until the kit page serves Mail itself (s24-contracts §13: Mail's module from IFL email/public/roof/, the session's
// apps, http://email.kit.test in its CSP copy), this test puts those three in front of it, the same way, and says so)
const KITDIR = new URL('./roofkit/', import.meta.url).pathname;
const kitHasMail = /email\/public\/roof/.test(readFileSync(`${KITDIR}serve.mjs`, 'utf8'));
async function kitMail(ctx) {
  if (kitHasMail) return;
  const typeOf = (f) => (/\.css$/.test(f) ? 'text/css' : 'text/javascript');
  const csp = PAGE_HEADERS['content-security-policy'].replace(/(connect-src [^;]*)/, `$1 ${MAIL_KIT}`).replace(/(frame-src [^;]*)/, `$1 ${MAIL_KIT}`);
  await ctx.route(new RegExp(`^${KIT.replace(/\./g, '\\.')}/(index\\.html)?(\\?.*)?$`), (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { ...PAGE_HEADERS, 'content-security-policy': csp }, body: readFileSync(`${KITDIR}index.html`, 'utf8') }));
  await ctx.route(`${KIT}/kit/kit.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'cache-control': 'no-cache' },
    body: readFileSync(`${KITDIR}kit.js`, 'utf8').replace('session: () => ({ view: { user }, hub: state.hub, roof: state.roof,', 'session: () => ({ view: { user, apps: { mail: true } }, hub: state.hub, roof: state.roof, apps: { weather: state.roof, mail: true }, links: { email: "http://email.kit.test" },') }));
  await ctx.route(`${KIT}/mail/roof/**`, (r) => {
    const f = new URL(r.request().url()).pathname.replace('/mail/roof/', '');
    return /^[\w-]+\.(js|css)$/.test(f) && existsSync(MR + f) ? r.fulfill({ status: 200, contentType: typeOf(f), headers: { 'cache-control': 'no-cache' }, body: readFileSync(MR + f) }) : r.fulfill({ status: 404, body: 'not found' });
  });
  await ctx.route(`${KIT}/mail/version`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: null }) }));
}
if (!kitHasMail) note('the kit page doesn’t serve Mail yet: this test puts Mail’s files, the session’s apps and Mail’s origin in the CSP in front of it');

// hooks (roofhooks.mjs, s4 §10.2), with the spec's selectors where a name isn't there yet
const M_MAIL = H.M_MAIL || 'main#m-mail';
const ROW = H.MAIL_THREAD || '.m-mail [data-thread]';
const BODY = H.MAIL_BODY || '.m-mail iframe.mail-body';
const sheet = (n) => (H.mailSheet ? H.mailSheet(n) : `dialog.ifl-sheet[data-sheet=${n}]`);
const mact = (a) => (H.mailAct ? H.mailAct(a) : `.m-mail [data-act=${a}]`);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: [`--unsafely-treat-insecure-origin-as-secure=${KIT}`] });
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (_) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 100)); } };
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const text = (p, sel) => p.locator(sel).first().textContent({ timeout: 3000 }).catch(() => '');
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const here = (p) => p.evaluate(() => location.pathname + location.hash);

async function phone({ width = 390, height = 844, touch = true, access = 'ok' } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'light' });
  await serveKit(ctx, { main: MAIN, ifl: IFL });
  await kitMail(ctx);
  const mail = await routeMail(ctx, { origin: KIT, access });
  // (the body shell stood in: a blank page at Mail's /body/; the auth page a stand-in)
  await ctx.route(`${MAIL_KIT}/body/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>body</title>' }));
  await ctx.route('http://auth.kit.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Sign in</title><h1>SIGN IN STAND-IN</h1>' }));
  await ctx.route(`${KIT}/api/**`, (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === '/api/session') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedIn: true, user: { id: 'u-kit-0001', name: 'Sam Taylor' } }) });
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await p.goto(`${KIT}/?module=/mail/roof/mail.js&apps=weather,mail`);
  await until(() => p.evaluate(() => !!window.kit?.ready), 10000);
  await p.evaluate(() => window.kit.F.nav.go('/mail/'));
  return { ctx, p, mail, errors };
}
const bodies = (mail) => mail.log.filter((r) => /^\/api\/messages\/[\w-]+(\/raw)?$/.test(r.path) && r.method === 'GET' && !r.navigate);
const refused = (mail) => mail.log.filter((r) => (r.method !== 'GET' && r.method !== 'OPTIONS' && !r.inflite) || (/^\/api\/(threads|contacts)$/.test(r.path) && /[?&]q=/.test(r.query)));
// a ctx for MR's openers on the kit page, made as mail.js makes it, from the module's own files (MM's store, api, logic,
// outbox) and the framework's fw for Mail
const sheetsCtx = (p) => p.evaluate(async () => {
  const [{ createStore }, { createApi, MAIL }, logic, { createOutbox }, { icon }, menus] = await Promise.all(['store', 'api', 'logic', 'outbox', 'icons', 'menus'].map((f) => import(`/mail/roof/${f}.js`)));
  const fw = window.kit.F.forModule('mail'), store = createStore({ me: null });
  const api = createApi({ base: MAIL, onLost: () => {} });
  store.set({ me: await api.me() }, 'test');
  const ctx = { store, api, logic, fw, icon, layout: () => 'phone', actions: { act: async () => ({}), batch: (b) => api.batch(b) }, open: {} };
  ctx.outbox = createOutbox(ctx);
  ctx.open.confirm = (spec) => menus.confirm(ctx, spec);
  ctx.open.compose = (init) => import('/mail/roof/compose.js').then((m) => m.openCompose(ctx, init));
  window.__mr = ctx;
  return true;
});

// ===================== 1. the reader on a phone, the viewer =====================
{
  const { ctx, p, mail, errors } = await phone();
  ok(await until(() => visible(p, ROW), 12000), 'the list draws rows (MM) on the kit page', await text(p, M_MAIL));
  const row = p.locator(`${ROW}[data-thread="t-1"]`).first();
  ok(await row.count() > 0, 'Maya’s conversation in People');
  await row.click();
  ok(await until(async () => (await here(p)) === '/mail/#thread=t-1'), 'a row’s tap pushes /mail/#thread=t-1 (S4-D6)', await here(p));
  ok(await until(() => visible(p, '.m-mail .mr-card.open')), 'the newest message open in a card');
  ok(await until(() => mail.log.some((r) => r.path === '/api/messages/demo-1/meta')), 'its Meta from /api/messages/<id>/meta');
  if (framesReal) {
    ok(await until(() => visible(p, BODY)), 'its body in a frame (iframe.mail-body)');
    const f = await p.locator(BODY).first().evaluate((x) => ({ src: x.getAttribute('src'), sandbox: x.getAttribute('sandbox'), ref: x.getAttribute('referrerpolicy') }));
    ok(f.src?.startsWith(`${MAIL_KIT}/body/#`) && /m=demo-1/.test(f.src) && f.src.includes(`p=${encodeURIComponent(KIT)}`), 'the frame is Mail’s shell with the message in the hash and this page as parent', f.src);
    ok(f.sandbox === 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox' && f.ref === 'no-referrer', 'the sandbox and referrer policy §3.2 give', JSON.stringify(f));
  } else note('bodyframe.js is still B0-b’s stub: the card shows the snippet and Open in Mail instead of a frame (MB’s part)');
  ok(await until(() => p.locator('.m-mail .mr-tile img').count().then((n) => n === 2)), 'the two pictures shown');
  ok((await p.locator('.m-mail .mr-tile img').evaluateAll((xs) => xs.every((x) => x.src.startsWith('blob:')))), 'as blob: images');
  ok(mail.log.filter((r) => /^\/api\/attachments\//.test(r.path)).every((r) => !!r.origin), 'pictures fetched by CORS from this page');
  ok(await visible(p, mact('reply')) && await visible(p, mact('send')) && await visible(p, mact('done')) && await visible(p, mact('later')), 'Reply, the quick reply’s Send, Done and Later in the reader');
  await shot(p, '1-reader-phone');
  // the viewer: pictures only
  await p.locator('.m-mail .mr-tile').first().click();
  ok(await until(() => visible(p, `${sheet('mail-viewer')}[open] img.mv-img`)), 'a picture’s tap opens the viewer with it');
  ok(/1 of 2/.test(await text(p, `${sheet('mail-viewer')} .mv-count`)), 'one of the two', await text(p, `${sheet('mail-viewer')} .mv-count`));
  await shot(p, '2-viewer');
  await p.keyboard.press('Escape');
  ok(await until(async () => !(await visible(p, `${sheet('mail-viewer')}[open]`))), 'Escape closes it');
  // Alex's photos: the SVG never in the viewer, a link at Mail's address
  await p.evaluate(() => window.kit.F.nav.back());
  ok(await until(async () => (await here(p)) === '/mail/'), 'Back to the list', await here(p));
  await p.locator(`${ROW}[data-thread="t-6"]`).first().click();
  ok(await until(() => p.locator('.m-mail .mr-tile').count().then((n) => n === 3)), 'Alex’s three photos as pictures');
  const svg = await p.locator('.m-mail a.mr-file').first().evaluate((a) => [a.getAttribute('href'), a.getAttribute('target')]).catch(() => []);
  ok(svg[0] === `${MAIL_KIT}/api/attachments/a8` && svg[1] === '_blank', 'the SVG a link at Mail’s address, in a new tab', JSON.stringify(svg));
  ok(!mail.log.some((r) => r.path === '/api/attachments/a8' && !r.navigate), 'the SVG never fetched into the page');
  ok(bodies(mail).length === 0, 'no /api/messages/<id> or /raw ever asked for by the page (§3.1)', JSON.stringify(bodies(mail)));
  ok(refused(mail).length === 0, 'no write without X-Inflite and no q in a URL', JSON.stringify(refused(mail)));
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

// ===================== 2. the reader at 1024 (iPad) =====================
{
  const { ctx, p, mail, errors } = await phone({ width: 1024, height: 768, touch: true });
  ok(await until(() => visible(p, ROW), 12000), 'iPad: rows');
  ok(await until(() => p.evaluate(() => document.querySelector('.m-mail')?.dataset.layout === 'pad')), 'the pad layout (S4-D6’s rule)');
  ok(/Choose a conversation/.test(await text(p, '.m-mail .ml-reader')), '“Choose a conversation” in the pane');
  await p.locator(`${ROW}[data-thread="t-1"]`).first().click();
  ok(await until(() => visible(p, '.m-mail .mr-card.open')), 'the conversation in the pane');
  ok(await until(async () => (await here(p)) === '/mail/'), 'no address change on an iPad', await here(p));
  const box = await p.evaluate(() => { const l = document.querySelector('.m-mail .ml-list')?.getBoundingClientRect(), r = document.querySelector('.m-mail .ml-reader')?.getBoundingClientRect(); return l && r ? { l: [l.left, l.width], r: [r.left, r.width], pos: getComputedStyle(document.querySelector('.m-mail .ml-reader')).position } : null; });
  ok(box && box.r[0] >= box.l[0] + box.l[1] - 1 && box.pos === 'sticky', 'list on the left, a sticky pane beside it', JSON.stringify(box));
  ok(await visible(p, '.m-mail .mr-bar [data-act=done]') && await visible(p, '.m-mail .mr-bar [data-act=later]') && await visible(p, '.m-mail .mr-bar [data-act=more]'), 'the pane’s toolbar: Done, Later, ⋯');
  await shot(p, '3-reader-pad');
  ok(bodies(mail).length === 0, 'no body asked for');
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

// ===================== 3. compose: reply with undo, close saves, quoteOld =====================
{
  const { ctx, p, mail, errors } = await phone();
  await until(() => visible(p, ROW), 12000);
  await p.locator(`${ROW}[data-thread="t-1"]`).first().click();
  await until(() => visible(p, '.m-mail .mr-card.open'));
  await until(() => mail.log.some((r) => r.path === '/api/messages/demo-1/meta'));
  await p.locator(mact('reply')).first().click();
  const C = sheet('mail-compose');
  ok(await until(() => visible(p, `${C}[open]`)), 'Reply opens compose');
  ok(/Quoted below/.test(await text(p, `${C} .mc-quote`)) && /Attached are the updated explorations/.test(await text(p, `${C} .mc-quote`)), 'the snippet under “Quoted below”', await text(p, `${C} .mc-quote`));
  ok(/Re: Liquid Glass/.test(await p.locator(`${C} input[data-key=subject]`).inputValue()), 'Re: the subject');
  await p.locator(`${C} textarea[data-key=text]`).fill('Looks great — see you Thursday.');
  await shot(p, '4-compose');
  await p.locator(`${C} [data-act=send]`).click();
  ok(await until(async () => !(await visible(p, `${C}[open]`))), 'Send closes compose');
  ok(await until(() => visible(p, '.ifl-toast')), 'the toast with Undo (MM’s outbox)', await text(p, '.ifl-toast'));
  await p.locator('.ifl-toast button').first().click().catch(() => {});
  ok(await until(() => visible(p, `${C}[open]`)), 'Undo: compose back');
  ok(mail.sends.length === 0, 'nothing sent');
  await p.locator(`${C} [data-act=send]`).click();
  ok(await until(() => mail.sends.length === 1, 12000), 'sent once the undo window is over');
  const s = mail.sends[0] || {};
  ok(!!s.draftId && !!s.key, 'POST /api/send { draftId, key } (S4-D18)', JSON.stringify(s).slice(0, 200));
  const saved = mail.log.filter((r) => r.path === '/api/drafts' && r.method === 'POST').at(-1)?.body || {};
  ok(JSON.stringify(saved.quote) === JSON.stringify({ of: 'demo-1', mode: 'reply' }) && !/html/.test(JSON.stringify(saved.quote)), 'the draft’s quote is { of, mode }: Mail’s server quotes (S4-D4)', JSON.stringify(saved.quote));
  // a changed compose closed by Escape: kept, then a server draft, "Draft saved"
  await p.locator(mact('forward')).first().click();
  await until(() => visible(p, `${C}[open]`));
  await p.locator(`${C} input[data-key=to]`).fill('pat@example.com');
  await p.locator(`${C} textarea[data-key=text]`).fill('FYI');
  const before = mail.log.filter((r) => r.path === '/api/drafts' && r.method === 'POST').length;
  await p.keyboard.press('Escape');
  ok(await until(async () => !(await visible(p, `${C}[open]`))), 'Escape closes it, asking nothing');
  ok(await until(() => mail.log.filter((r) => r.path === '/api/drafts' && r.method === 'POST').length === before + 1), 'then a server draft');
  const fwd = mail.log.filter((r) => r.path === '/api/drafts' && r.method === 'POST').at(-1)?.body || {};
  ok(Array.isArray(fwd.attachments) && fwd.attachments.length === 2 && fwd.attachments.every((a) => a.ref && !a.content), 'forwarded files by { ref }, never their bytes', JSON.stringify(fwd.attachments));
  ok(await until(async () => /Draft saved/.test(await text(p, '.ifl-toast'))), '“Draft saved”', await text(p, '.ifl-toast'));
  // a quoteOld draft
  await sheetsCtx(p);
  const oldId = mail.msgs.find((m) => m.subject === 'Re: Something old')?.id;
  await p.evaluate((id) => window.__mr.open.compose({ draftId: id }), oldId);
  ok(await until(async () => /started in Mail on its own/.test(await text(p, `${C}[open] .mc-quote`))), 'a quoteOld draft says so');
  ok(await visible(p, `${C}[open] .mc-quote [data-act=open-mail]`), 'with Open Mail');
  await p.locator(`${C}[open] [data-act=send]`).click();
  ok(await until(async () => /Send Without the Quoted Text\?/.test(await text(p, `${sheet('mail-confirm')}[open]`))), 'Send asks “Send Without the Quoted Text?”');
  await shot(p, '5-quoteold');
  ok(bodies(mail).length === 0 && refused(mail).length === 0, 'no body asked for, nothing the gate refuses', JSON.stringify([...bodies(mail), ...refused(mail)]));
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

// ===================== 4. Mail Settings, 5. sign-in =====================
{
  const { ctx, p, mail, errors } = await phone();
  await until(() => visible(p, ROW), 12000);
  await sheetsCtx(p);
  const MS = sheet('mail-settings');
  await p.evaluate(() => import('/mail/roof/mailsettings.js').then((m) => m.openSettings(window.__mr, null)));
  ok(await until(() => p.locator(`${MS}[open] [data-address]`).count().then((n) => n === 2)), 'Mail Settings: your two addresses');
  const own = await p.locator(`${MS}[open] [data-act=own]`).evaluate((a) => [a.getAttribute('href'), a.getAttribute('target')]).catch(() => []);
  ok(own[0] === `${MAIL_KIT}/#settings` && own[1] === '_blank', 'New Address, Delete or Send From: Mail’s own address, a new tab', JSON.stringify(own));
  ok(!/Delete Address|Make Default/.test(await text(p, `${MS}[open]`)), 'no Delete Address or Make Default inside');
  ok(await p.locator(`${MS}[open] [data-act=notify]`).getAttribute('href') === '/#you=notify-mail', 'Notifications → You');
  await shot(p, '6-settings');
  await p.locator(`${MS}[open] [data-address="support@inflite.ai"]`).click();
  ok(await until(() => visible(p, `${MS}[open] [data-page=address]`)), 'an address’s page');
  await p.locator(`${MS}[open] [data-page=address] [data-key=category] [data-value=people]`).click();
  ok(await until(() => mail.log.some((r) => r.method === 'PATCH' && r.path === '/api/addresses/support%40inflite.ai' && JSON.stringify(r.body) === '{"category":"people"}')), 'Sort Into saved with only its key', JSON.stringify(mail.log.filter((r) => r.method === 'PATCH').map((r) => [r.path, r.body])));
  await p.keyboard.press('Escape');
  await until(async () => !(await visible(p, `${MS}[open]`)));
  for (const [page, sel] of [['signature', '[data-page=signature] textarea'], ['unknown', '[data-page=unknown] [data-key=catchall]']]) {
    await p.evaluate((pg) => import('/mail/roof/mailsettings.js').then((m) => m.openSettings(window.__mr, pg)), page);
    ok(await until(() => visible(p, `${MS}[open] ${sel}`)), `opened at ${page}`);
    if (page === 'unknown') {
      await p.locator(`${MS}[open] [data-value=reject]`).click();
      ok(await until(() => mail.log.some((r) => r.method === 'PATCH' && r.path === '/api/settings' && JSON.stringify(r.body) === '{"catchall":"reject"}')), 'Unknown Addresses saved with only its key');
    }
    await p.keyboard.press('Escape');
    await until(async () => !(await visible(p, `${MS}[open]`)));
  }
  // sign-in: the trip, and the code swapped
  const handback = await p.evaluate(async () => {
    const m = await import('/mail/roof/signin.js');
    sessionStorage.setItem('mail:signin-verifier', 'v'.repeat(43));
    const ok = await m.finishSignIn(window.__mr, 'code-12345678');
    return { ok, left: sessionStorage.getItem('mail:signin-verifier') };
  });
  ok(handback.ok === true && handback.left === null, 'finishSignIn: the code swapped at Mail, the verifier let go', JSON.stringify(handback));
  ok(mail.log.some((r) => r.method === 'POST' && r.path === '/api/auth/handback' && r.body?.code === 'code-12345678' && r.inflite), 'POST /api/auth/handback { code, verifier } with X-Inflite');
  await p.evaluate(() => import('/mail/roof/signin.js').then((m) => m.signIn(window.__mr)));
  ok(await until(() => p.url().startsWith('http://auth.kit.test/')), 'signIn goes to InFlite’s sign-in page', p.url());
  const u = new URL(p.url()), h = new URLSearchParams(u.hash.slice(1));
  ok(h.get('signin') === 'mail' && /^[\w-]{43}$/.test(h.get('ask') || '') && h.get('back') === `${KIT}/mail/`, 'with signin=mail, the ask and back=…/mail/ (S4-D12)', u.hash);
  await p.goBack().catch(() => {});
  const kept = await p.evaluate(() => sessionStorage.getItem('mail:signin-verifier')).catch(() => null);
  ok(/^[\w-]{43}$/.test(kept || ''), 'the verifier kept in this tab', String(kept));
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

await b.close();
done();
