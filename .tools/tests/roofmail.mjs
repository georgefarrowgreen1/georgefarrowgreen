// needs: hub mail roof-mail
// Mail under the roof, end to end (One roof stage 4, spec §10.2 roofmail): George, the site's admin, on an iPhone at
// InFlite's hub with Mail's module switched on (ROOF_MAIL, and Mail's own HUB_API_TEST for the test hub), real mail in
// Mail's Worker (seeded through its email handler, as hubmail.mjs does), every request, history call and storage key
// noted. In real Chromium against the hub stack (hubstack.mjs with `hub mail roof-mail`).
//   1 Apps' tile → Mail in the same document; the header (crumb, the view ▾, the line, one act, People's badge); the
//     lenses by replaceState; Back to Apps with Apps' scroll
//   2 the phone's reader: a row → /mail/#thread= pushed and kept, the switcher hidden, "Back to Mail" with the list's scroll
//     and focus; back/forward; a reload on the reader; a cold reader's Back → People, its label saying so; a thread
//     longer than the screen shows no false "Couldn’t show this message" (RI10)
//   3 an iPad (1024): the reader a pane, no address change; a cold #thread= tidied; the pane scrolls without the list
//   4 swipes (Done right, Later left, never from the left edge), the row menu, Undo; the Later sheet; a picture opened at
//     Mail's own address first, then in the module's viewer (RI6); the SVG never in the viewer
//   5 Send with Undo, then sent; the outbox offline; a reply whose sent copy Mail quoted itself (the page never asked
//     /api/messages/<id>); a forward by { ref }; words typed, then a notification tapped: kept (Drafts or mail:unsent);
//     words typed, then signed out: a server draft
//   6 search: the provider's hit from what's loaded; "Search Mail for …" a POST, the words in no address, history entry,
//     storage key or log
// Every check's line names the spec section it proves. Selectors are roofhooks.mjs's (spec §10.2); where Mail has no hook,
// a control is found by its role and the words on it (what George sees), never by another batch's class names.
import http from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import * as H from './roofhooks.mjs';
import {
  HUB, EXCEPT, checker, phone, account, hostCall, pageCall, alive, loads, history, here, shown, gone, textOf, attrOf, count, visible,
  storage, changed, said, route, tapNotification, rootWorker, wait, until, js, closeAll,
} from './rooflib.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const ROOT = process.env.APP_ROOT || new URL('../../', import.meta.url).pathname;
const MAIL = 'http://email.ifl.test:8788', MAILHOST = 'email.ifl.test:8788';
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});

// ---- Mail's hooks (roofhooks.mjs, spec §10.2) ----
const M_MAIL = H.M_MAIL;                                   // main#m-mail
const ROW = H.MAIL_THREAD;                                 // .m-mail [data-thread]
const row = (id) => H.mailThread(id);                     // that conversation's row
const BODY = H.MAIL_BODY;                                  // .m-mail iframe.mail-body
const act = (name) => H.mailAct(name);                     // .m-mail [data-act=done|later|reply|send|undo]
const SH = (name) => H.mailSheet(name);                    // dialog.ifl-sheet[data-sheet=mail-…]
const COMPOSE = SH('mail-compose');

// ---- the site's database (as lib.mjs reads it: wrangler d1 on the site's local state) ----
const esc = (s) => String(s).replace(/'/g, "''");
const sql = (q) => {
  for (let i = 0; ; i++) {
    try {
      const o = execSync(`${S}/wr/node_modules/.bin/wrangler d1 execute bio-db --local --persist-to ${S}/wrstate --command "${q.replace(/(["$`\\])/g, '\\$1')}"`, { cwd: ROOT, stdio: 'pipe' }).toString();
      const m = o.match(/"results": (\[[\s\S]*?\])\s*,\s*"success"/); return m ? JSON.parse(m[1]) : [];
    } catch (e) { if (i > 5 || !/SQLITE_BUSY/.test(String(e.stdout) + String(e.stderr))) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); }
  }
};
const hex = (s) => createHash('sha256').update(s).digest('hex');
// (a sign-in of George's made in the database, as lib.mjs admin() makes one: for asking Mail as Mail on its own would,
// after the page's own sign-in has been ended)
const freshCookie = (uid) => { const t = Date.now(), site = randomBytes(32).toString('base64url'); sql(`INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash) VALUES ('${hex(randomBytes(32).toString('base64url'))}', '${uid}', ${t}, ${t}, ${t}, '${hex(site)}')`); return `account=${site}`; };

// ---- Mail's Worker, asked as Mail on its own asks it (its own address, no Origin of a hub) ----
const mailAsk = (path, { cookie, method, body } = {}) => hostCall(MAILHOST, path, body, { cookie, method, headers: method && method !== 'GET' ? { 'X-Inflite': '1' } : {} });
// (a message to Mail, as mail comes to it: Mail's Worker's own email handler, which wrangler dev answers at its own port)
function deliver({ from, to = 'hello@inflite.ai', subject, text = '', html = null, files = [], id = null, inReplyTo = null, headers = [] }) {
  const mid = id || `<${randomBytes(8).toString('hex')}@example.com>`, B = `b${randomBytes(6).toString('hex')}`, A = `a${randomBytes(6).toString('hex')}`;
  const head = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, `Message-ID: ${mid}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', ...headers,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : [])];
  const textPart = ['Content-Type: text/plain; charset=utf-8', '', text];
  const alt = html ? [`Content-Type: multipart/alternative; boundary="${A}"`, '', `--${A}`, ...textPart, `--${A}`, 'Content-Type: text/html; charset=utf-8', '', html, `--${A}--`] : textPart;
  const body = files.length
    ? [`Content-Type: multipart/mixed; boundary="${B}"`, '', `--${B}`, ...alt, ...files.flatMap((f) => [`--${B}`, `Content-Type: ${f.type}; name="${f.name}"`, `Content-Disposition: attachment; filename="${f.name}"`, 'Content-Transfer-Encoding: base64', '', f.data.toString('base64').replace(/(.{76})/g, '$1\r\n')]), `--${B}--`]
    : alt;
  const raw = [...head, ...body, ''].join('\r\n'), addr = /<([^>]+)>/.exec(from)?.[1] || from;
  return new Promise((done) => {
    const q = http.request({ host: '127.0.0.1', port: 8806, method: 'POST', agent: false, path: `/cdn-cgi/handler/email?from=${encodeURIComponent(addr)}&to=${encodeURIComponent(to)}`,
      headers: { 'Content-Type': 'message/rfc822', 'Content-Length': Buffer.byteLength(raw) } }, (res) => { res.resume(); res.on('end', () => done({ status: res.statusCode, id: mid })); });
    q.on('error', () => done({ status: 0, id: mid })); q.end(raw);
  });
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR42mP8z0AZYBw1YNSAUQNGDRg1YNQAAgAAqU4QAeoZPgcAAAAASUVORK5CYII=', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>top.__svgRan=1</script><rect width="10" height="10"/></svg>');
const LONG = (who, n) => Array.from({ length: 40 }, (_, i) => `${who}, line ${i + 1} of part ${n}: the roof survey goes on, slate by slate, with the gutters next week.`).join('\n');

// ======================================================================================================================
// George: an account made at the tests' sign-in page, the site's admin with a passkey, his sign-in fresh (Mail's gate:
// admin, passkey, a check within 12 hours, auth.js accessOf)
// ======================================================================================================================
const acct = await account('George Farrow-Green', 'georgeroofmail');
ok(!!acct.cookies, 'George’s account, made at the tests’ sign-in page, its cookie on the tests’ site', js(acct.json));
const cookies = acct.cookies || {}, cookie = acct.cookie || '';
const GID = sql("SELECT id FROM pg_users WHERE handle = 'georgeroofmail'")[0]?.id;
sql(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${GID}')`);
sql(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('roofmail-key', '${GID}', 'x', -7, ${Date.now()})`);
sql(`UPDATE pg_sessions SET auth_at = ${Date.now()} WHERE user_id = '${GID}'`);
ok(!!GID, 'George the site’s admin, a passkey on his account, signed in just now');

// ---- the mail: 24 conversations from people (the list scrolls), a long one, three Updates, pictures, a designed one, and
// one whose only rare word is in an attachment's file name (Mail's server search matches file names, the module's
// provider only what it has loaded: subject, snippet, people; so it's found only by asking Mail) ----
const PEOPLE = ['Pat Smith', 'Rowan Ash', 'Kit Lee', 'Noor Haddad', 'Isla Moor', 'Sam Reed', 'Jo Hart', 'Alex Park'];
const sent = [];
for (let i = 0; i < 24; i++) {
  const who = PEOPLE[i % PEOPLE.length], addr = `${who.split(' ')[0].toLowerCase()}${i}@example.com`;
  sent.push(await deliver({ from: `${who} <${addr}>`, subject: `Roof note ${String(i + 1).padStart(2, '0')}: ${['gutters', 'slates', 'chimney', 'flashing'][i % 4]}`, text: `Note ${i + 1} about the roof.` }));
}
// (the long one: six messages back and forth, each forty lines)
let prev = null;
for (let n = 1; n <= 6; n++) {
  const r = await deliver({ from: n % 2 ? 'Rowan Ash <rowan@example.com>' : 'George <hello@inflite.ai>', subject: n === 1 ? 'Survey of the whole roof' : 'Re: Survey of the whole roof', text: LONG(n % 2 ? 'Rowan' : 'George', n), inReplyTo: prev });
  prev = r.id; sent.push(r);
}
for (const [k, s] of [['news', 'Weekly roofing digest'], ['receipts', 'Your receipt for ladders'], ['updates', 'Product update: tiles']]) sent.push(await deliver({ from: `Roof Co <${k}@roofco.example>`, subject: s, text: `${s}. Read online.` }));
sent.push(await deliver({ from: 'Kit Lee <kit@example.com>', subject: 'Photos from Saturday', text: 'Two from the scaffold.', files: [{ name: 'ridge.png', type: 'image/png', data: PNG }, { name: 'plan.svg', type: 'image/svg+xml', data: SVG }] }));
const FIGURES = 'Kestrelwick figures';
sent.push(await deliver({ from: 'Jo Hart <jo@example.com>', subject: 'Quarterly figures', text: `${FIGURES}: up four per cent.`, html: `<html><body><table><tr><td style="font-family:Georgia"><h1>${FIGURES}</h1><p>Up four per cent on last quarter.</p></td></tr></table></body></html>` }));
const RARE = 'Ptarmiganroost';
sent.push(await deliver({ from: 'Sam Reed <sam@example.com>', subject: 'Odds and ends', text: 'Nothing much to say here, just the schedule attached.', files: [{ name: `${RARE}-schedule.pdf`, type: 'application/pdf', data: Buffer.from('%PDF-1.4\n% roof schedule\n%%EOF\n') }] }));
ok(sent.every((x) => x.status >= 200 && x.status < 300), `${sent.length} messages came to Mail (its email handler)`, js(sent.filter((x) => !(x.status >= 200 && x.status < 300)).length));

// (each conversation's id, by its subject, as Mail on its own lists them)
const listOf = async (q) => (await mailAsk(`/api/threads?${q}&limit=100`, { cookie })).json?.threads || [];
const T = {};
for (const t of [...(await listOf('view=all&category=people')), ...(await listOf('view=all&category=updates'))]) T[t.subject] = t.id;
const idOf = (subject) => T[subject] || null;
const LONG_ID = idOf('Survey of the whole roof') || idOf('Re: Survey of the whole roof'), PHOTOS = idOf('Photos from Saturday'), FIG = idOf('Quarterly figures');
ok(!!LONG_ID && !!PHOTOS && !!FIG && Object.keys(T).length >= 30, 'Mail lists them, each conversation with its id', js(Object.keys(T).length));
const countsNow = async () => (await mailAsk('/api/counts', { cookie })).json || null;
const threadOf = async (id, c = cookie) => (await mailAsk(`/api/threads/${id}`, { cookie: c })).json || null;
const folderOf = async (folder, c = cookie) => (await mailAsk(`/api/messages?folder=${folder}&limit=100`, { cookie: c })).json?.messages || [];
const inView = async (view, id) => (await listOf(`view=${view}`)).some((t) => t.id === id);

// ---- the phones, and what each one asks of anyone ----
const everyone = [];
const asked = [];      // every request of every phone: { url, method, origin, post, frame (main|sub), page }
const open = async (name, o = {}) => {
  const ph = await phone(name, { cookies, ...o });
  ph.ctx.on('request', (r) => { let fr = 'sub'; try { fr = r.frame()?.parentFrame() ? 'sub' : 'main'; } catch (_) { fr = 'worker'; }
    asked.push({ who: name, url: r.url(), method: r.method(), post: r.postData() || '', origin: r.headers().origin || null, frame: fr, nav: r.isNavigationRequest(), type: r.resourceType() }); });
  everyone.push(ph); return ph;
};
const at = (p, path, ms = 15000) => p.waitForFunction((u) => location.pathname + location.search + location.hash === u, path, { timeout: ms }).then(() => true, () => false);
const mailUp = async (p, ms = 30000) => (await shown(p, M_MAIL, ms)) && (await shown(p, ROW, ms));
const readerUp = async (p, ms = 30000) => (await shown(p, M_MAIL, ms)) && (await shown(p, BODY, ms));
const tapTile = (p, app = 'mail') => p.evaluate((s) => { const a = document.querySelector(s); if (!a) return false; a.click(); return true; }, EXCEPT.tileLink(app));
const titleIs = (p, want, ms = 15000) => p.waitForFunction(([s, w]) => document.querySelector(s)?.textContent.trim() === w, [H.HD_TITLE, want], { timeout: ms }).then(() => true, () => false);
const sheetUp = (p, name, ms = 10000) => shown(p, `${SH(name)}[open]`, ms);
const closeSheets = async (p) => { for (let i = 0; i < 3 && (await count(p, H.SHEET_OPEN)); i++) { await p.click(H.SHEET_CLOSE).catch(() => p.keyboard.press('Escape')); await wait(450); } };
const sections = (p) => p.$$eval(H.HD_SEC, (els) => els.map((e) => ({ id: e.dataset.sec, on: e.getAttribute('aria-selected') }))).catch(() => []);
const focusIn = (p, sel) => p.evaluate((s) => !!document.activeElement?.closest(s), sel).catch(() => false);
// (a compose sheet's fields, found by their labels: To, Subject and the message)
const field = (p, name) => p.locator(COMPOSE).getByRole('textbox', { name });
const fill = async (p, { to, subject, text }) => {
  if (to != null) { await field(p, /^To\b/i).first().fill(to); await p.keyboard.press('Enter').catch(() => {}); }
  if (subject != null) await field(p, /^Subject/i).first().fill(subject);
  if (text != null) await field(p, /message|body/i).first().fill(text);
};
const write = async (p) => { await p.click(H.HD_COMPOSE); return sheetUp(p, 'mail-compose'); };
const sendNow = (p) => p.click(`${COMPOSE} ${H.MAIL_SEND}`);
// (Undo in the toast: the hook, or the toast's own action by its word, as the framework's toast draws it)
const toastUndo = (p) => p.locator(`${H.TOAST} ${H.MAIL_UNDO}`).or(p.locator(H.TOAST).getByRole('button', { name: /^Undo$/ })).first();
// (a row swiped by a finger: pointer down on the row's middle at x0, moved in steps to x1, up; x0 and x1 inside the
// row unless said: 'in' → 40 px in from the row's left edge, 'out' → 40 px in from its right, a number → that x)
const swipe = async (p, sel, from, to) => {
  const b = await p.locator(sel).first().boundingBox(); if (!b) return false;
  const x = (v) => (v === 'in' ? b.x + 40 : v === 'out' ? b.x + b.width - 40 : v === 'left' ? b.x + 12 : v === 'right' ? b.x + b.width - 12 : v);
  const x0 = x(from), x1 = x(to), y = b.y + b.height / 2;
  await p.mouse.move(x0, y); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(x0 + ((x1 - x0) * i) / 12, y); await wait(16); }
  await p.mouse.up(); return true;
};

const G = await open('george');
const { p } = G;

// ======================================================================================================================
await part(1, 'Apps’ tile → Mail in the same document: the header, People’s badge, the lenses by replaceState, Back to Apps', '§2.1, §2.5, S4-D5, S4-D26, C2', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/#apps`);
  ok((await shown(p, H.APPS, 30000)) && (await shown(p, H.appTile('mail'), 30000)), '1. Apps: Mail’s tile for its admin (§2.5)');
  ok((await attrOf(p, EXCEPT.tileLink('mail'), 'href')) === '/mail/', '1. …its link /mail/ (§2.3)', await attrOf(p, EXCEPT.tileLink('mail'), 'href'));
  // (a shorter phone, so Apps scrolls: 560 points tall, then shorter while Apps has under 120 points to scroll, never
  // under 420; measured at each height, since the page's own height can follow the screen's)
  let tall = 0;
  for (const h of [560, 500, 460, 420]) {
    await p.setViewportSize({ width: 390, height: h }); await wait(400);
    tall = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (tall >= 120) break;
  }
  const yApps = await p.evaluate(() => { scrollTo(0, Math.min(240, document.documentElement.scrollHeight - innerHeight)); return Math.round(scrollY); });
  await wait(300);
  ok(yApps > 50, `1. Apps scrolled down ${yApps}px before the tile is tapped (so Back can be seen to keep it, D20)`, js({ tall, h: await p.evaluate(() => innerHeight) }));
  const life = await alive(p), docs = loads(p);
  await tapTile(p);
  const up = await mailUp(p);
  ok(up && (await at(p, '/mail/')), '1. tapped: Mail’s list at /mail/ (People, §2.3)', here(p));
  ok((await life.same()) && docs.n() === 0, '1. in the same document: nothing reloaded, no document fetched (D2)', js(docs.list));
  ok((await count(p, H.htmlApp('mail'))) === 1 && (await attrOf(p, H.tab('apps'), 'aria-current')) === 'true', '1. html[data-app=mail] (Mail’s accent); the tab bar’s Apps current (§2.1)');
  await shot(p, '1-people');

  // the header (§2.1, S4-D26)
  ok(/^Mail$/.test((await textOf(p, H.HD_CRUMB)) || ''), '1. the crumb: Mail (§2.1)', await textOf(p, H.HD_CRUMB));
  ok(await titleIs(p, 'All Mail'), '1. the title: the view, All Mail (§2.1)', await textOf(p, H.HD_TITLE));
  ok((await count(p, H.HD_PICK)) === 1, '1. the title’s ▾ (the Views sheet, §2.2)');
  const c = await countsNow(), unread = c?.people?.unread ?? null;
  const line = (await textOf(p, H.HD_LINE)) || '';
  ok(unread != null && (unread > 0 ? line === `${unread} unread` : line === 'All caught up'), `1. the line: “${unread} unread” (Mail’s count, §2.1)`, js({ line, counts: c?.people }));
  ok((await count(p, H.HD_COMPOSE)) === 1 && !(await count(p, H.HD_SETTINGS)) && !(await count(p, H.HD_EDIT)), '1. one act: Write (data-act=compose); no Settings, no Edit (S4-D26)');
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Apps', '1. Back says “Back to Apps” (§2.1)', await attrOf(p, H.HD_BACK, 'aria-label'));
  const secs = await sections(p);
  ok(js(secs.map((s) => s.id)) === js(['people', 'updates', 'later', 'done']) && secs[0]?.on === 'true', '1. the switcher: People · Updates · Later · Done, People selected (§2.1, REGISTRY)', js(secs));
  const badge = await p.waitForFunction(([s, n]) => document.querySelector(s)?.textContent.trim() === String(n), [`${H.hdSec('people')} ${H.SEC_BADGE}`, unread], { timeout: 15000 }).then(() => true, () => false);
  const named = await p.getByRole('tab', { name: new RegExp(`People, ${unread} unread`) }).count().catch(() => 0);
  ok(badge && named === 1 && !(await count(p, `${H.hdSec('updates')} ${H.SEC_BADGE}`)) && !(await count(p, `${H.hdSec('later')} ${H.SEC_BADGE}`)), `1. one badge, on People: ${unread}, its tab named “People, ${unread} unread” (S4-D26)`, `${await textOf(p, `${H.hdSec('people')} ${H.SEC_BADGE}`)} ${named}`);
  // (the ▾: the Views sheet, Mail Settings its last row)
  await p.click(H.HD_PICK);
  const views = await sheetUp(p, 'mail-views');
  const lastRow = views ? await p.locator(`${SH('mail-views')}[open]`).getByRole('button').last().innerText().catch(() => '') : '';
  ok(views && /Mail Settings/.test(lastRow), '1. ▾: the Views sheet (mail-views), Mail Settings its last row (§2.2, S4-D11)', lastRow);
  await shot(p, '1-views');
  await closeSheets(p);

  // the lenses by replaceState (S4-D5)
  const len0 = await p.evaluate(() => history.length);
  for (const [id, url] of [['updates', '/mail/#updates'], ['later', '/mail/#later'], ['done', '/mail/#done'], ['people', '/mail/']]) {
    const h0 = (await history(p)).length;
    await p.click(H.hdSec(id));
    const there = await at(p, url);
    const sel = (await p.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-selected') === 'true', H.hdSec(id), { timeout: 5000 }).then(() => true, () => false)) ? 'true' : await attrOf(p, H.hdSec(id), 'aria-selected');
    const hs = (await history(p)).slice(h0), len = await p.evaluate(() => history.length);
    ok(there && sel === 'true' && hs.length > 0 && hs.every((x) => x.kind === 'replace') && len === len0, `1. ${id}: ${url} by replaceState, no history entry (S4-D5)`, js({ url: here(p), sel, hs: hs.map((x) => x.kind), len, len0 }));
    if (id === 'updates') ok(await shown(p, row(idOf('Weekly roofing digest')), 15000), '1. …Updates lists the digest from Roof Co (§2.1)');
    await shot(p, `1-${id}`);
  }
  // Back to Apps, Apps' scroll as it was (D20)
  await p.click(H.HD_BACK);
  const back = (await shown(p, H.APPS)) && (await at(p, '/#apps'));
  const y1 = await until(async () => { const y = await p.evaluate(() => Math.round(scrollY)); return Math.abs(y - yApps) <= 6 ? String(y) : null; }, 6000);
  ok(back && yApps > 50 && y1 != null && (await life.same()), `1. Back to Apps: /#apps, its scroll as it was (${yApps}px), the same document (D20)`, js({ url: here(p), y: await p.evaluate(() => scrollY) }));
  docs.stop();
  await p.setViewportSize({ width: 390, height: 844 });
});

// ======================================================================================================================
await part(2, 'the phone’s reader: pushed and kept, “Back to Mail” with scroll and focus, back/forward, reload, a cold reader, no false “Couldn’t show”', 'S4-D6, S4-D7, C5, C6, C7, RI10, §3.2', async () => {
// ======================================================================================================================
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${HUB}/mail/`);
  await mailUp(p); await wait(1200);
  const life = await alive(p);
  // (scrolled down the list, then a conversation lower down tapped)
  const y0 = await p.evaluate(() => { scrollTo(0, Math.min(500, document.documentElement.scrollHeight - innerHeight)); return Math.round(scrollY); });
  await wait(400);
  const target = await p.evaluate(([s]) => { const r = [...document.querySelectorAll(s)].find((e) => { const b = e.getBoundingClientRect(); return b.top > 120 && b.bottom < innerHeight - 120; }); return r?.dataset.thread || null; }, [ROW]);
  ok(y0 > 100 && !!target, '2. the list scrolled down, a conversation on screen there (24 from people: it scrolls)', js({ y0, target }));
  const h0 = (await history(p)).length;
  await p.click(row(target));
  const opened = (await readerUp(p)) && (await at(p, `/mail/#thread=${target}`));
  const hs = (await history(p)).slice(h0);
  ok(opened && hs.some((x) => x.kind === 'push' && x.url.endsWith(`/mail/#thread=${target}`)), '2. a row tapped: the reader, /mail/#thread=<id> pushed (a history entry, S4-D6)', js({ url: here(p), hs: hs.map((x) => `${x.kind} ${x.url}`) }));
  ok((await life.same()), '2. …in the same document');
  await wait(800);
  ok(await at(p, `/mail/#thread=${target}`, 3000), '2. …and the address kept after show (REGISTRY stay: ["thread"], the D6 tidy leaves it, C2)', here(p));
  ok(!(await visible(p, H.HD_TABLIST)), '2. the switcher hidden on the reader (sections: false, C3)');
  ok((await attrOf(p, H.HD_BACK, 'aria-label')) === 'Back to Mail', '2. Back says “Back to Mail” (C6)', await attrOf(p, H.HD_BACK, 'aria-label'));
  const subj = (await threadOf(target))?.subject;
  ok(!!subj && (await textOf(p, H.HD_TITLE)) === subj, '2. the title: the conversation’s subject (§2.1)', js({ title: await textOf(p, H.HD_TITLE), subj }));
  ok(await focusIn(p, H.HD_TITLE), '2. focus on the header’s title after the push (C7)', await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
  const src = await attrOf(p, BODY, 'src');
  let su = null; try { su = new URL(src); } catch (_) {}
  const sp = new URLSearchParams(su?.hash.slice(1) || '');
  ok(!!su && su.origin === MAIL && su.pathname === '/body/' && /^[\w-]{1,64}$/.test(sp.get('m') || '') && sp.get('p') === HUB, '2. the message drawn in a frame of Mail’s own /body/ (#m=<id>&…&p=the hub), never on the hub’s origin (§3.1, §3.2)', src);
  await shot(p, '2-reader');

  // Back: the list, its scroll and the row focused (C7, D20)
  await p.click(H.HD_BACK);
  const listBack = (await at(p, '/mail/')) && (await shown(p, row(target)));
  const y1 = await until(async () => { const y = await p.evaluate(() => Math.round(scrollY)); return Math.abs(y - y0) <= 6 ? String(y) : null; }, 6000);
  ok(listBack && y1 != null, `2. Back: the list at /mail/, scrolled as it was (${y0}px, C7)`, js({ url: here(p), y: await p.evaluate(() => scrollY) }));
  ok(await until(() => focusIn(p, row(target)), 3000), '2. …focus back on the row that opened it (C7)', await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
  await p.goForward();
  ok((await readerUp(p)) && (await at(p, `/mail/#thread=${target}`)), '2. forward: the reader again', here(p));
  await p.goBack();
  ok((await at(p, '/mail/')) && (await shown(p, row(target))) && (await life.same()), '2. back again: the list, the same document', here(p));

  // a reload on the reader (the address is kept, so it opens there)
  await p.click(row(target)); await readerUp(p);
  await p.reload();
  const rl = { up: await readerUp(p), at: await at(p, `/mail/#thread=${target}`), back: await attrOf(p, H.HD_BACK, 'aria-label'), frames: await count(p, BODY), mail: await count(p, M_MAIL) };
  ok(rl.up && rl.at && rl.back === 'Back to Mail', '2. reloaded on the reader: the reader again, “Back to Mail” (S4-D6, S4-D7)', js({ url: here(p), ...rl }));
  await shot(p, '2-reloaded');

  // a cold reader (a new page straight at /mail/#thread=…): Back stays in Mail, at People, the label saying so
  const C = await open('george-cold');
  await C.p.goto(`${HUB}/robots.txt`);
  const d = loads(C.p);
  await C.p.goto(`${HUB}/mail/#thread=${target}`);
  ok((await readerUp(C.p)) && (await attrOf(C.p, H.HD_BACK, 'aria-label')) === 'Back to Mail', '2. a cold reader: “Back to Mail” (depth 0, S4-D7, C5, C6)', await attrOf(C.p, H.HD_BACK, 'aria-label'));
  const cl = await alive(C.p), ch0 = (await history(C.p)).length;
  await C.p.click(H.HD_BACK);
  const toPeople = (await at(C.p, '/mail/')) && (await mailUp(C.p)) && (await attrOf(C.p, H.hdSec('people'), 'aria-selected')) === 'true';
  const chs = (await history(C.p)).slice(ch0);
  ok(toPeople && (await cl.same()) && chs.length > 0 && chs.every((x) => x.kind === 'replace'), '2. …its Back: People at /mail/, replacing the address, in the page (never off the site, S4-D7, C4)', js({ url: here(C.p), hs: chs.map((x) => x.kind) }));
  ok((await attrOf(C.p, H.HD_BACK, 'aria-label')) === 'Back to Apps', '2. …then the list’s own Back: “Back to Apps” (the frame’s for a cold screen, stage 1 §3.4)', await attrOf(C.p, H.HD_BACK, 'aria-label'));
  d.stop(); await C.ctx.close();

  // a thread longer than the screen: no frame below the fold is said to have failed (RI10)
  await p.goto(`${HUB}/mail/#thread=${LONG_ID}`);
  await readerUp(p);
  const frames = await count(p, BODY);
  await wait(8000);
  const falseFail = await p.evaluate((s) => /Couldn’t show this message/.test(document.querySelector(s)?.textContent || ''), M_MAIL);
  const tall = await p.evaluate((b) => [...document.querySelectorAll(b)].some((f) => f.getBoundingClientRect().bottom > innerHeight), BODY);
  ok(frames >= 1 && tall && !falseFail, `2. the long conversation (${frames} frame${frames > 1 ? 's' : ''}, longer than the screen): 8 s on, no “Couldn’t show this message” (RI10)`, js({ frames, tall, falseFail }));
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await wait(4000);
  const heights = await p.$$eval(BODY, (fs) => fs.map((f) => Number(f.getAttribute('height')) || Math.round(f.getBoundingClientRect().height)));
  ok(heights.length >= 1 && heights.every((h) => h > 900), '2. …scrolled to the end, its frame sized to the message (forty lines: the height from the shell, §3.2)', js(heights));
  await shot(p, '2-long');
});

// ======================================================================================================================
await part(3, 'an iPad (1024): the reader a pane, no address change; a cold #thread= tidied; the pane scrolls on its own', 'S4-D6, §2.1 iPad', async () => {
// ======================================================================================================================
  const I = await open('george-ipad', { width: 1024, height: 1366 });
  const q = I.p;
  await q.goto(`${HUB}/mail/`);
  await mailUp(q); await wait(800);
  const life = await alive(q), h0 = (await history(q)).length;
  await q.click(row(LONG_ID));
  const pane = await readerUp(q);
  const hs = (await history(q)).slice(h0);
  ok(pane && (await at(q, '/mail/', 3000)) && !hs.some((x) => x.kind === 'push'), '3. a row tapped: the reader in a pane, the address still /mail/, no history entry (S4-D6)', js({ url: here(q), hs: hs.map((x) => x.kind) }));
  const side = await q.evaluate(([r, b]) => { const a = document.querySelector(r)?.getBoundingClientRect(), f = document.querySelector(b)?.getBoundingClientRect(); return a && f ? { rowRight: Math.round(a.right), frameLeft: Math.round(f.left), rowW: Math.round(a.width) } : null; }, [ROW, BODY]);
  ok(side && side.rowRight <= side.frameLeft + 2 && side.rowW >= 300 && side.rowW <= 420, '3. the list on the left (≈360 px), the pane beside it (§2.1)', js(side));
  ok((await life.same()), '3. the same document');
  await shot(q, '3-ipad-pane');

  // the pane scrolls without moving the list or the window
  const before = await q.evaluate(([r, b]) => {
    const f = document.querySelector(b); let s = f?.parentElement;
    while (s && !(/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight + 4)) s = s.parentElement;
    window.__pane = s || null;
    return { found: !!s, y: Math.round(scrollY), row: Math.round(document.querySelector(r).getBoundingClientRect().top) };
  }, [ROW, BODY]);
  await q.evaluate(() => { if (window.__pane) window.__pane.scrollTop = 600; }); await wait(400);
  const after = await q.evaluate((r) => ({ y: Math.round(scrollY), row: Math.round(document.querySelector(r).getBoundingClientRect().top), top: window.__pane ? Math.round(window.__pane.scrollTop) : 0 }), ROW);
  ok(before.found && after.top >= 300 && after.y === before.y && after.row === before.row, '3. the pane scrolls on its own (overflow auto, sticky), the list and the window still (§2.1)', js({ before, after }));
  await shot(q, '3-ipad-pane-scrolled');

  // a cold #thread= on an iPad: list and pane, the address tidied to the lens's (replace)
  const J = await open('george-ipad-cold', { width: 1024, height: 1366 });
  await J.p.goto(`${HUB}/mail/#thread=${PHOTOS}`);
  const cold = (await readerUp(J.p)) && (await shown(J.p, ROW));
  const tidy = await at(J.p, '/mail/', 10000);
  const jh = await history(J.p);
  ok(cold && tidy && jh.some((x) => x.kind === 'replace' && new URL(x.url).pathname === '/mail/' && !new URL(x.url).hash), '3. cold /mail/#thread=<id> at 1024: the list and that conversation in the pane, the address tidied to /mail/ by replace (S4-D6)', js({ url: here(J.p), hs: jh.map((x) => `${x.kind} ${x.url}`) }));
  await I.ctx.close(); await J.ctx.close();
});

// ======================================================================================================================
await part(4, 'swipes and the row menu with Undo; the Later sheet; a picture at Mail’s address first, then in the viewer', 'S4-D18, S4-D17, RI6, §2.2', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/mail/`);
  await mailUp(p); await wait(800);
  const firstId = async () => p.evaluate((s) => { const r = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length && e.getBoundingClientRect().top > 100); return r?.dataset.thread || null; }, ROW);

  // never from the left 20 px (the edge is Back's, D19)
  const e = await firstId();
  await swipe(p, row(e), 8, 'right'); await wait(900);
  ok(!!e && (await count(p, row(e))) === 1 && (await inView('all', e)), '4. a swipe from the left edge (x 8): nothing done to the row (the edge is Back’s, S4-D18)');

  // swipe right: Done, then Undo
  const a = await firstId();
  await swipe(p, row(a), 'in', 'right');
  const goneA = await gone(p, row(a), 8000), toastA = await shown(p, H.TOAST, 5000);
  const doneA = await until(() => inView('done', a), 8000);
  ok(goneA && toastA && doneA, '4. swiped right: Done (the row leaves People, Mail has it in Done), a toast with Undo (S4-D18)', js({ goneA, toastA, doneA, toast: await textOf(p, H.TOAST) }));
  await shot(p, '4-done-toast');
  await toastUndo(p).click({ timeout: 5000 }).catch(() => {});
  const backA = (await shown(p, row(a), 8000)) && (await until(() => inView('all', a), 8000));
  ok(backA, '4. …Undo: the row back, and in People at Mail again (§4.1 actions.js, put back)');

  // swipe left: the Later sheet; a choice
  const b = await firstId();
  await swipe(p, row(b), 'out', 'left');
  const later = await sheetUp(p, 'mail-later');
  const choices = later ? await p.locator(`${SH('mail-later')}[open]`).getByRole('button').allInnerTexts().catch(() => []) : [];
  ok(later && choices.some((t) => /Pick a Time/i.test(t)), '4. swiped left: the Later sheet (mail-later), its choices and Pick a Time (S4-D18)', js(choices));
  await shot(p, '4-later');
  const pick = choices.find((t) => /Tomorrow|This Evening|Later Today|Next Week|This Weekend/i.test(t));
  if (pick) await p.locator(`${SH('mail-later')}[open]`).getByRole('button', { name: pick.trim() }).first().click().catch(() => {});
  const snoozed = (await gone(p, row(b), 8000)) && (await until(() => inView('later', b), 8000));
  ok(!!pick && snoozed, `4. “${pick?.trim()}”: the row leaves People, Mail has it in Later`, js({ pick }));
  await p.click(H.hdSec('later'));
  ok(await shown(p, row(b), 15000), '4. …and the Later lens lists it');
  await p.click(H.hdSec('people')); await mailUp(p);

  // the row menu (press and hold): Done from there, Undo
  const c = await firstId();
  // (a finger held still on the row: touch pointer events, as a phone sends them, held 800 ms)
  await p.evaluate(async (s) => {
    const r = document.querySelector(s), b = r.getBoundingClientRect(), o = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, buttons: 1 };
    r.dispatchEvent(new PointerEvent('pointerdown', o)); await new Promise((ok) => setTimeout(ok, 800)); r.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
  }, row(c));
  let menu = await sheetUp(p, 'mail-rowmenu', 4000);
  if (!menu) { await p.click(row(c), { button: 'right' }).catch(() => {}); menu = await sheetUp(p, 'mail-rowmenu', 4000); }
  const items = menu ? await p.locator(`${SH('mail-rowmenu')}[open]`).getByRole('button').allInnerTexts().catch(() => []) : [];
  ok(menu && ['Done', 'Later'].every((w) => items.some((t) => new RegExp(`^\\s*${w}\\b`).test(t))), '4. press and hold: the row menu (mail-rowmenu), with Done and Later (S4-D18)', js(items));
  await shot(p, '4-rowmenu');
  await p.locator(`${SH('mail-rowmenu')}[open]`).getByRole('button', { name: /^Done$/ }).first().click().catch(() => {});
  ok((await gone(p, row(c), 8000)) && (await until(() => inView('done', c), 8000)), '4. …Done: gone from People, in Done at Mail');
  await toastUndo(p).click({ timeout: 5000 }).catch(() => {});
  ok((await shown(p, row(c), 8000)) && (await until(() => inView('all', c), 8000)), '4. …Undo: back');

  // a picture: first at Mail's own address (Mail on its own's way), then in the module's viewer (RI6: Vary: Origin)
  const msgs = (await threadOf(PHOTOS))?.messages || [];
  const files = (await mailAsk(`/api/messages/${msgs.at(-1)?.id}`, { cookie })).json?.attachments || [];
  const png = files.find((f) => /png/.test(f.type || f.contentType || '')), svg = files.find((f) => /svg/.test(f.type || f.contentType || ''));
  ok(!!png && !!svg, '4. the photos message has its PNG and its SVG', js(files.map((f) => f.filename)));
  const own = await G.ctx.newPage();
  const ownRes = await own.goto(`${MAIL}/api/attachments/${png?.id}`).catch(() => null);
  ok(ownRes?.status() === 200, '4. the PNG opened at Mail’s own address first (kept in the phone’s cache as Mail on its own fetched it)', String(ownRes?.status()));
  await own.close();
  await p.goto(`${HUB}/mail/#thread=${PHOTOS}`);
  await readerUp(p);
  const thumb = `${M_MAIL} img[src^="blob:"]`;
  const pic = await shown(p, thumb, 15000);
  if (pic) await p.click(thumb);
  const viewer = await sheetUp(p, 'mail-viewer');
  const img = viewer ? await p.waitForFunction((s) => { const i = document.querySelector(`${s}[open] img`); return i && i.complete && i.naturalWidth > 0 && i.src.startsWith('blob:') ? { w: i.naturalWidth, src: i.src.slice(0, 5) } : false; }, SH('mail-viewer'), { timeout: 10000 }).then((h) => h.jsonValue(), () => null) : null;
  ok(pic && viewer && !!img, '4. …then in the module: its picture as a blob: image, opened in the viewer (mail-viewer), drawn (RI6, S4-D17)', js({ pic, viewer, img }));
  await shot(p, '4-viewer');
  await closeSheets(p);
  const svgAsked = asked.filter((r) => r.who === 'george' && r.url.includes(`/api/attachments/${svg?.id}`) && !r.nav);
  ok(!!svg && !svgAsked.length && !(await p.evaluate(() => window.__svgRan || 0)), '4. the SVG never fetched by the page (no viewer, no blob: for it), nothing of it ran (S4-D17)', js(svgAsked.slice(0, 2)));
});

// ======================================================================================================================
await part(5, 'Send with Undo and the outbox; a reply Mail quotes itself; a forward by ref; words kept through a tap and a sign-out', 'S4-D4, S4-D16, S4-D18, C10, RI2, RB3', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/mail/`);
  await mailUp(p);
  const mark = asked.length;
  // Send, Undo inside the 6 s, then Send for good
  ok(await write(p), '5. Write: the compose sheet (mail-compose, S4-D18)');
  await fill(p, { to: 'pat@example.com', subject: 'Roof send one', text: 'Hello from the roof.' });
  await sendNow(p);
  const sending = await p.waitForFunction((s) => /Sending/.test(document.querySelector(s)?.textContent || ''), H.TOAST, { timeout: 8000 }).then(() => true, () => false);
  ok(sending, '5. Send: “Sending… · Undo” (S4-D18)', await textOf(p, H.TOAST));
  await toastUndo(p).click({ timeout: 5000 }).catch(() => {});
  const reopened = await sheetUp(p, 'mail-compose', 8000);
  const kept = reopened ? await field(p, /^Subject/i).first().inputValue().catch(() => '') : '';
  const draft1 = await until(async () => (await folderOf('drafts')).find((m) => m.subject === 'Roof send one'), 8000);
  await wait(7000);
  const notSent = !(await folderOf('sent')).some((m) => m.subject === 'Roof send one');
  ok(reopened && kept === 'Roof send one' && !!draft1 && notSent, '5. Undo inside the 6 s: compose open again with what was written, a server draft kept, nothing sent (S4-D18)', js({ reopened, kept, draft: !!draft1, notSent }));
  await sendNow(p);
  const went = await until(async () => (await folderOf('sent')).find((m) => m.subject === 'Roof send one'), 20000);
  const draftGone = !(await folderOf('drafts')).some((m) => m.subject === 'Roof send one');
  ok(!!went && draftGone, '5. Send again and left: sent after its 6 s, the draft gone (Mail sends the stored draft, S4-D4)', js({ went: !!went, draftGone }));
  const writes = asked.slice(mark).filter((r) => r.url.startsWith(`${MAIL}/api/`) && r.method === 'POST');
  const sendCall = writes.find((r) => r.url === `${MAIL}/api/send`);
  let sb = null; try { sb = JSON.parse(sendCall?.post || 'null'); } catch (_) {}
  ok(writes.some((r) => r.url === `${MAIL}/api/drafts`) && sb && js(Object.keys(sb).sort()) === js(['draftId', 'key']), '5. save, then send: POST /api/drafts, then POST /api/send { draftId, key } and nothing else (S4-D18, §4.7)', js({ writes: writes.map((r) => r.url.replace(MAIL, '')), sb }));
  ok(writes.every((r) => r.origin === HUB), '5. …each from the hub’s page, by CORS (S4-D2)', js(writes.map((r) => r.origin)));

  // the outbox: offline, text only, sent when back online
  await G.ctx.setOffline(true);
  await write(p);
  await fill(p, { to: 'kit@example.com', subject: 'Roof sent offline', text: 'Written on the train.' });
  await sendNow(p); await wait(1500);
  const box = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('mail:outbox') || '[]'); } catch (_) { return null; } });
  // (S4-D16 fixes the key, not the entry's shape: the words found anywhere in it, and no file's bytes)
  ok(Array.isArray(box) && box.length >= 1 && JSON.stringify(box).includes('Roof sent offline') && !/"content"|base64/.test(JSON.stringify(box)), '5. offline: Send keeps it in mail:outbox, text only (S4-D16, S4-D18)', js(box, 400));
  await G.ctx.setOffline(false);
  const flown = await until(async () => (await folderOf('sent')).find((m) => m.subject === 'Roof sent offline'), 25000);
  const empty = await until(() => p.evaluate(() => { try { return !JSON.parse(localStorage.getItem('mail:outbox') || '[]').length; } catch (_) { return false; } }), 10000);
  ok(!!flown && empty, '5. online again: sent (save, then send), the outbox empty (S4-D18)', js({ flown: !!flown, empty }));

  // a reply: Mail's server quotes the original; the page never asked for the message itself
  const m0 = asked.length;
  await p.goto(`${HUB}/mail/#thread=${FIG}`);
  await readerUp(p);
  await p.click(act('reply'));
  await sheetUp(p, 'mail-compose');
  await fill(p, { text: 'Thanks Jo, good news.' });
  await sendNow(p);
  const reply = await until(async () => (await folderOf('sent')).find((m) => /Quarterly figures/.test(m.subject || '')), 25000);
  const full = reply ? (await mailAsk(`/api/messages/${reply.id}`, { cookie })).json : null;
  ok(!!full && /<blockquote type="cite"/.test(full.html || '') && full.html.includes(FIGURES) && /Thanks Jo/.test(full.text || full.html || ''), '5. Reply: Mail’s sent copy has the original quoted in a <blockquote type="cite">, built by Mail’s server (S4-D4)', js({ html: (full?.html || '').slice(0, 200) }));
  const draftPost = asked.slice(m0).filter((r) => r.url === `${MAIL}/api/drafts` && r.method === 'POST').map((r) => { try { return JSON.parse(r.post); } catch (_) { return null; } }).filter(Boolean).at(-1);
  ok(!!draftPost?.quote?.of && draftPost.quote.mode === 'reply' && !/<blockquote|html/i.test(JSON.stringify(draftPost.quote)), '5. …the page sent only quote { of, mode: "reply" } (S4-D4)', js(draftPost?.quote));
  const bodyAsks = asked.slice(m0).filter((r) => r.frame === 'main' && /^http:\/\/email\.ifl\.test:8788\/api\/messages\/[\w-]+(\/raw)?(\?|$)/.test(r.url));
  ok(!bodyAsks.length, '5. …and the hub’s page never asked /api/messages/<id> (only /meta: bodies never reach inflite.ai, RB3)', js(bodyAsks.map((r) => r.url)));

  // a forward: the picture by { ref }, never its bytes
  const f0 = asked.length;
  await p.goto(`${HUB}/mail/#thread=${PHOTOS}`);
  await readerUp(p);
  await p.locator(M_MAIL).getByRole('button', { name: /^Forward$/ }).first().click().catch(() => {});
  await sheetUp(p, 'mail-compose');
  await fill(p, { to: 'noor@example.com' });
  await sendNow(p);
  const fwd = await until(async () => (await folderOf('sent')).find((m) => /Photos from Saturday/.test(m.subject || '') && /^Fwd?:/i.test(m.subject || '')), 25000);
  const fwdFull = fwd ? (await mailAsk(`/api/messages/${fwd.id}`, { cookie })).json : null;
  const fpost = asked.slice(f0).filter((r) => r.url === `${MAIL}/api/drafts` && r.method === 'POST').map((r) => { try { return JSON.parse(r.post); } catch (_) { return null; } }).filter(Boolean).at(-1);
  ok(!!fwdFull && (fwdFull.attachments || []).some((x) => /ridge\.png/.test(x.filename || '')), '5. Forward: sent, the picture with it (S4-D4)', js((fwdFull?.attachments || []).map((x) => x.filename)));
  ok(!!fpost && (fpost.attachments || []).some((x) => x.ref) && !(fpost.attachments || []).some((x) => x.content), '5. …the page sent it as { ref }, never its bytes (S4-D4)', js(fpost?.attachments));
  const attAsks = asked.slice(f0).filter((r) => r.frame === 'main' && /\/api\/attachments\//.test(r.url) && !/ridge|png/i.test(r.url) && r.who === 'george');
  console.log('note: attachment requests while forwarding:', js(attAsks.map((r) => r.url.replace(MAIL, '')), 300));

  // words typed, then a notification tapped: the sheet closes, the words kept (mail:unsent or a server draft)
  await p.goto(`${HUB}/mail/`);
  await mailUp(p);
  await write(p);
  await fill(p, { to: 'sam@example.com', subject: 'Roof words kept', text: 'Half a thought about the chimney' });
  const r = await tapNotification(G.ctx, { app: 'mail', url: `/mail/#thread=${FIG}` });
  const routed = (await readerUp(p)) && (await at(p, `/mail/#thread=${FIG}`)) && !(await count(p, H.SHEET_OPEN));
  const unsent = await p.evaluate(() => localStorage.getItem('mail:unsent') || '');
  const asDraft = await until(async () => (await folderOf('drafts')).find((m) => m.subject === 'Roof words kept'), 8000);
  ok(r === 'done' && routed && (/Roof words kept/.test(unsent) || !!asDraft), '5. words typed, then a notification tapped: the reader, compose closed, the words kept (mail:unsent or Drafts, S4-D18, RI2)', js({ r, routed, unsent: !!unsent, draft: !!asDraft }));
  ok(!!asDraft, '5. …and saved to Mail as a draft (“Draft saved”, S4-D18)', js(await said(p)));

  // words typed, compose closed, then Sign Out at once: the closed compose's save reaches Mail before any mail:* key
  // goes (the sign-out's flush, C10). (The sheets are modal: the page behind is inert until compose is closed.)
  await p.goto(`${HUB}/mail/`);
  await mailUp(p);
  await write(p);
  await fill(p, { to: 'jo@example.com', subject: 'Roof before sign out', text: 'Unfinished business' });
  const pre = (await mailAsk('/api/session', { cookie })).json?.access;
  await closeSheets(p);
  const shut = !(await count(p, H.SHEET_OPEN));
  await p.click(H.tab('you'));
  const you = await shown(p, H.YOU, 15000);
  // (Sign Out in InFlite's menu, your photo's (the shared menu, .ifm-pop as roofshell opens it): the button by its name)
  // (the sign-in page takes #signout= out of its address at once, so the way there is noted as it goes)
  const outNavs = []; const noteNav = (fr) => { if (fr === p.mainFrame()) outNavs.push(fr.url()); }; p.on('framenavigated', noteNav);
  await p.click(H.HD_ME);
  const menu = await shown(p, '.ifm-pop.open', 5000);
  await p.locator('.ifm-pop.open').getByRole('button', { name: 'Sign Out' }).first().click({ timeout: 10000 }).catch(() => {});
  const anyway = await shown(p, `${H.SIGNOUT_ANYWAY}[open]`, 3000);
  if (anyway) await p.locator(`${H.SIGNOUT_ANYWAY}[open]`).getByRole('button', { name: 'Sign Out' }).click().catch(() => {});
  const landed = await p.waitForURL((u) => u.host === 'auth.ifl.test:8788', { timeout: 20000 }).then(() => true, () => false);
  p.off('framenavigated', noteNav);
  const outHash = outNavs.filter((u) => u.startsWith('http://auth.ifl.test:8788/')).map((u) => new URLSearchParams(u.split('#')[1] || '').get('signout')).find(Boolean) || null;
  // (the old sign-in ended: Mail, asked with its cookie, says sign in; its Worker keeps a yes for 10 seconds)
  const post = await until(async () => { const a = (await mailAsk('/api/session', { cookie })).json?.access; return a === 'signin' ? a : null; }, 20000);
  ok(pre === 'ok' && shut && you && menu && landed && post === 'signin', '5. compose closed, then You, InFlite’s menu, Sign Out: signed out (on the sign-in page; Mail, asked with the old cookie, says sign in, C10)', js({ pre, shut, you, menu, anyway, landed, outHash, url: p.url().split('#')[0], post }));
  const c2 = freshCookie(GID);
  const saved = await until(async () => (await folderOf('drafts', c2)).find((m) => m.subject === 'Roof before sign out'), 10000);
  ok(!!saved, '5. …and Mail has the words as a draft (the closed compose’s save flushed before the sign-out, C10, RI1)', js(saved?.subject));
  await p.goto(`${HUB}/robots.txt`);
  const left = await p.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith('mail:')));
  ok(!left.length, '5. …and no mail:* key left on the phone (S4-D16, C10)', js(left));
  // (signed in again for part 6: a new sign-in, fresh)
  const [k, v] = c2.split('=');
  await G.ctx.addCookies([{ name: k, value: v, domain: '.ifl.test', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  G.cookie = c2;
});

// ======================================================================================================================
await part(6, 'search: the provider’s hit; “Search Mail for …” a POST, the words in no address, history, storage or log', 'S4-D9, D16, §9', async () => {
// ======================================================================================================================
  await p.goto(`${HUB}/mail/`);
  await mailUp(p); await wait(800);
  const s0 = asked.length, st0 = await storage(p);
  await p.click(H.HD_SEARCH);
  await shown(p, `${H.SEARCH_SHEET}[open]`);
  await p.keyboard.type('Quarterly', { delay: 40 });
  const hit = await until(async () => (await p.$$eval(H.SEARCH_RESULT, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()))).find((t) => /Quarterly figures/.test(t)), 8000);
  ok(!!hit, '6. “Quarterly”: the conversation among the results, from what’s loaded on this phone (Mail’s provider, S4-D9)', js(await p.$$eval(H.SEARCH_RESULT, (els) => els.map((e) => e.textContent.trim().slice(0, 60))).catch(() => [])));
  await p.fill(H.SEARCH_INPUT, '');
  await p.keyboard.type(RARE, { delay: 30 });
  const offer = await until(async () => { const all = await p.$$eval(H.SEARCH_RESULT, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())); return all.length && /^Search Mail for “/.test(all.at(-1)) && all.at(-1).includes(RARE) ? all : null; }, 8000);
  ok(!!offer && offer.at(-1).includes(RARE), `6. “${RARE}” (only in an attachment’s file name, which the module never loads): “Search Mail for “${RARE}”” offered, last (S4-D9)`, js(offer));
  const before = asked.slice(s0).filter((r) => (r.url + r.post).includes(RARE.slice(0, 6)));
  ok(!before.length, '6. typed but not asked: nothing has left the phone (D16)', js(before.map((r) => r.url)));
  await p.locator(H.SEARCH_RESULT).last().click();
  const closed = await gone(p, `${H.SEARCH_SHEET}[open]`, 8000);
  const found = await shown(p, row(idOf('Odds and ends')), 15000);
  ok(closed && found, '6. tapped: the search sheet closed, Mail’s answer in the list (the conversation with that file, S4-D9)', js({ closed, found, rows: await count(p, ROW) }));
  await shot(p, '6-search');
  const sent6 = asked.slice(s0).filter((r) => (r.url + ' ' + r.post).includes(RARE));
  ok(sent6.length >= 1 && sent6.every((r) => r.method === 'POST' && r.url === `${MAIL}/api/threads/search` && !r.url.includes(RARE)), '6. the words went once, to Mail only, in a POST body to /api/threads/search, never in an address (S4-D9)', js(sent6.map((r) => `${r.method} ${r.url}`)));
  const hs = JSON.stringify(await history(p)) + (await p.evaluate(() => JSON.stringify(history.state) + location.href));
  ok(!hs.includes(RARE), '6. …nor in the address, a history entry or history.state (§9)', here(p));
  const st1 = await storage(p);
  ok(!JSON.stringify(st1).includes(RARE) && !changed(st0, st1).added.some((k) => k.includes(RARE)), '6. …nor in any storage key or value (no recent searches kept, S4-D9)', js(changed(st0, st1)));
  const logs = ['ifl.log', 'wrangler.log', 'hostpass.jsonl'].map((f) => { try { return [f, readFileSync(`${S}/${f}`, 'utf8')]; } catch (_) { return [f, '']; } });
  const leak = logs.filter(([, t]) => t.includes(RARE) || t.includes('Kestrelwick') || t.includes('Quarterly figures')).map(([f]) => f);
  ok(!leak.length, '6. no word of a search or a message in InFlite’s Worker’s log, the account’s log or the pass-throughs’ (§9)', js(leak));
  const mailLog = (() => { try { return readFileSync(`${S}/mail.log`, 'utf8'); } catch (_) { return ''; } })();
  ok(!mailLog.split('\n').some((l) => /\b(GET|POST)\b/.test(l) && l.includes(RARE)), '6. …and in Mail’s own log, no address carrying it (S4-D9)');
});

// ---- across the run ----
// (the test's own init scripts, which Playwright puts into every frame, refused in a message's script-less inner frame:
// Chromium says so as an error; the refusal is the sandbox working, roofmailbody's to prove)
// (and part 4's own visit to the PNG at Mail's address: Mail serves an attachment under a sandbox CSP, so the same
// scripts are refused there too)
const SANDBOXED = /Blocked script execution in '(about:srcdoc|http:\/\/email\.ifl\.test:8788\/api\/attachments\/[\w-]+)'/;
const errs = everyone.flatMap((x) => x.errs || []).filter((e) => !SANDBOXED.test(e) && !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED/.test(e));
ok(!errs.some((e) => /CSP violation|Refused to/.test(e)), 'no CSP violation on any page (C13)', js(errs.filter((e) => /CSP|Refused/.test(e)).slice(0, 6)));
ok(!errs.length, 'no page error and no console error on any page (the offline outbox’s failed fetches aside)', js(errs.slice(0, 8)));
const hubAsksMail = asked.filter((r) => r.url.startsWith(`${HUB}/`) && /\/api\/(mail|threads|messages)/.test(r.url));
ok(!hubAsksMail.length, 'no Mail API call went through InFlite’s Worker: the page asks Mail directly (S4-D2, §9)', js(hubAsksMail.slice(0, 3).map((r) => r.url)));
await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
