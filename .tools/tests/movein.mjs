// The move to chat.georgefarrowgreen.com: a phone signed in at the old address opens the new one already signed in.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, api, sess, openChat, say, sql, tick } = K;
const OLD = 'http://localhost:8788', NEW = 'http://chat.localhost:8788';
const G = await K.phone('george'), R = await K.phone('reuben');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(R, 'Reuben Tan', 'roobs', 'reuben@example.com', 'Paris');
const [gs, rs] = [await sess(G), await sess(R)];
await api(gs.token, 'friends', { handle: rs.me.handle }); await api(rs.token, 'friends-respond', { id: gs.me.id, accept: true });
await R.p.reload(); await R.p.waitForSelector('.tabs');
await openChat(R, gs.me.id); await say(R, 'swift', 'hello from the old address');
sql(`UPDATE pg_msgs SET deliver_at = ${Date.now() - 1000} WHERE deliver_at > ${Date.now()}`); await tick();
await G.p.evaluate(() => localStorage.setItem('inflight-haptics', '0'));

// the headers: the old address's handover page may be framed by the new address only
let h = await fetch(OLD + '/pigeon/handover');
ok(h.status === 200 && !h.headers.get('x-frame-options') && h.headers.get('content-security-policy').includes(`frame-ancestors ${NEW}`) && !h.headers.get('content-security-policy').includes("frame-ancestors 'none'"), 'handover page: framed by the new address only', h.headers.get('content-security-policy'));
h = await fetch(NEW + '/'); ok(h.headers.get('content-security-policy').includes(`frame-src ${OLD}`), 'new address may frame the old one');
h = await fetch(OLD + '/pigeon/'); ok(h.headers.get('x-frame-options') === 'DENY' && !/frame-src/.test(h.headers.get('content-security-policy')), 'old address app page unchanged');
ok((await fetch(NEW + '/handover')).status === 404, 'no handover page at the new address');

// George opens the new address in the same browser
const p = await G.ctx.newPage(); const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
const t0 = Date.now(); await p.goto(NEW + '/');
ok(await p.waitForSelector('.tabs', { timeout: 15000 }).then(() => true, () => false), 'new address opens signed in, no sign-in asked', `${Date.now() - t0} ms`);
const st = await p.evaluate(() => ({ moved: localStorage.getItem('inflight-movedin'), haptics: localStorage.getItem('inflight-haptics'), sub: localStorage.getItem('inflight-pushsub'), cls: document.documentElement.className, frames: document.querySelectorAll('iframe').length }));
ok(!!st.moved && st.haptics === '0' && st.frames === 0, 'settings came over, and the hidden page is gone', JSON.stringify(st));
// and what the old address kept is gone from it (the home page shares that address), noted so it isn't asked again
const old = await G.ctx.newPage(); await old.goto(OLD + '/robots.txt');
// (the old tab, still open there, may make itself an empty one again: what matters is nothing's in it)
const left = await old.evaluate(async () => ({
  keys: (await indexedDB.databases()).some((d) => d.name === 'inflight') ? await new Promise((res) => { const r = indexedDB.open('inflight'); r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').getAllKeys(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; r.onerror = () => res(['?']); }) : [],
  ls: Object.keys(localStorage).filter((k) => k.startsWith('inflight-') && k !== 'inflight-mapcard') }));   // (mapcard: the tests' own, on every page)
await old.close();
ok(left.keys.length === 0 && left.ls.length === 0 && !!(await p.evaluate(() => localStorage.getItem('inflight-oldcleared'))), 'the old address’s copy cleared once it’s here', JSON.stringify(left));
await openChat({ p }, rs.me.id);
ok(await p.waitForFunction(() => /hello from the old address/.test(document.querySelector('.msgs')?.innerText || ''), null, { timeout: 15000 }).then(() => true, () => false), 'a landed pigeon reads (the key came over)');
const ns = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res({ tok: g.result.token, ext: g.result.priv.extractable, ty: g.result.priv.type }); }; }));
ok(ns.tok === gs.token && ns.ext === false && ns.ty === 'private', 'same sign-in, key still unreadable', JSON.stringify({ ...ns, tok: !!ns.tok }));
// it sends from the new address
await say({ p, name: 'george-new' }, 'swift', 'and now from the new one');
ok(/and now from the new one/.test(await p.locator('.msgs').innerText()), 'sends from the new address');
ok(!errs.some((e) => /Content Security Policy|frame/i.test(e)), 'no CSP or framing errors', errs.join(' | '));

// signing out at the new address doesn't bring the old sign-in back
await p.reload(); await p.waitForSelector('.tabs'); await p.click('[data-act=tab][data-id=account]'); await p.waitForTimeout(600);
await p.locator('#screen > main.view [data-act=signout]').scrollIntoViewIfNeeded(); await p.click('#screen > main.view [data-act=signout]'); await p.waitForSelector('[data-act=signoutgo]'); await p.click('[data-act=signoutgo]');
await p.waitForSelector('.welcome', { timeout: 10000 }); await p.reload();
ok(await p.waitForSelector('.welcome', { timeout: 10000 }).then(() => true, () => false), 'signed out here stays signed out');

// a phone that never used the old address: straight to the welcome, and it doesn't ask again
const N = await K.b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const q = await N.newPage(); const t1 = Date.now(); await q.goto(NEW + '/'); await q.waitForSelector('.welcome', { timeout: 15000 });
// (the welcome is up while the old address is asked, so its answer, and the mark that it was asked, follow a moment later)
const shown = Date.now() - t1, asked = await q.waitForFunction(() => localStorage.getItem('inflight-movedin'), null, { timeout: 8000 }).then(() => true, () => false);
ok(shown < 6000 && asked, 'new phone: welcome, handover asked once', `${shown} ms`);
// a page elsewhere can't get the handover: framing it from the old address itself is refused
const w = await N.newPage(); await w.goto(OLD + '/pigeon/');
const leaked = await w.evaluate(() => new Promise((res) => { const f = document.createElement('iframe'); f.src = '/pigeon/handover'; addEventListener('message', (e) => res(true)); document.body.append(f); setTimeout(() => res(false), 3000); }));
ok(!leaked, 'the handover answers no other page');
console.log(`FAILS ${K.fails()}`);
process.exit(0);
