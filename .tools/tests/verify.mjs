// Verify in person: the safety number as a QR code, scanned with the camera (jsQR), or marked by hand.
import { kit } from './lib.mjs';
import { signInChat } from './join.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, api, sess, openChat } = K;
const G = await K.phone('george'), M = await K.phone('mira');
// the camera: a canvas showing whatever code the test puts up (no BarcodeDetector: the jsQR path, as on an iPhone)
await G.ctx.addInitScript(() => {
  delete window.BarcodeDetector;
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas'); c.width = c.height = 480; const g = c.getContext('2d');
    let shown = null, img = null;
    const draw = async () => {
      if (window.__code && window.__code !== shown) {
        shown = window.__code; const { qrSvg } = await import('/pigeon/qr.js');
        const blob = new Blob([qrSvg(shown)], { type: 'image/svg+xml' }); img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
      }
      g.fillStyle = '#777'; g.fillRect(0, 0, 480, 480); if (img) { g.fillStyle = '#fff'; g.fillRect(70, 70, 340, 340); g.drawImage(img, 90, 90, 300, 300); }
      setTimeout(draw, 100);
    };
    draw(); return c.captureStream(10);
  };
});
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'Norwich');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
const [gs, ms] = [await sess(G), await sess(M)];
await api(gs.token, 'friends', { handle: 'mira' }); await api(ms.token, 'friends-respond', { id: gs.me.id, accept: true });
await G.p.reload(); await G.p.waitForSelector('.tabs');
await openChat(G, ms.me.id); await G.p.click('.chatwho'); await G.p.waitForSelector('.sheet [data-act=safety]'); await G.p.click('.sheet [data-act=safety]');
await G.p.waitForSelector('.sheet .safeqr svg'); await G.p.waitForTimeout(500);
ok(await G.p.isVisible('.sheet [data-act=scansafe]') && await G.p.isVisible('.sheet [data-act=verifyok]'), 'Safety Number: the code, Scan Their Code and Mark as Verified');
await G.p.screenshot({ path: `${out}/verify-sheet.png` });
const digits = (await G.p.locator('.sheet .digits').innerText()).replace(/\s+/g, '');
ok(digits.length === 60, 'the 60 digits', digits.length);
// Mira's phone shows the same code
await openChat(M, gs.me.id); await M.p.click('.chatwho'); await M.p.waitForSelector('.sheet [data-act=safety]'); await M.p.click('.sheet [data-act=safety]'); await M.p.waitForSelector('.sheet .digits');
ok((await M.p.locator('.sheet .digits').innerText()).replace(/\s+/g, '') === digits, 'Mira’s phone shows the same number');
// a code that isn't theirs: refused
await G.p.evaluate(() => { window.__code = 'inflight-safety:1:' + '1'.repeat(60); });
await G.p.click('.sheet [data-act=scansafe]'); await G.p.waitForSelector('.scanbox video');
ok(await G.p.waitForFunction(() => /isn’t the same safety number/.test(document.querySelector('.scanmsg')?.textContent || ''), null, { timeout: 15000 }).then(() => true, () => false), 'a different code: not the same safety number');
await G.p.screenshot({ path: `${out}/verify-bad.png` });
ok(!/"v:/.test(sql("SELECT 1") ) && !(await G.p.evaluate(() => 0)), 'nothing marked');
// the right one
await G.p.evaluate((d) => { window.__code = 'inflight-safety:1:' + d; }, digits);
await G.p.click('.sheet [data-act=scansafe]');
ok(await G.p.waitForSelector('.sheet .profile-head .verified', { timeout: 15000 }).then(() => true, () => false), 'scanning Mira’s code: Verified in person');
await G.p.waitForTimeout(600); await G.p.screenshot({ path: `${out}/verify-done.png` });
const camOff = await G.p.evaluate(() => !document.querySelector('.scanbox video'));
ok(camOff, 'the camera closes once it has read the code');
await G.p.click('.sheet [data-act=back], .sheet header [data-act=friendinfo]').catch(() => {});
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400); await G.p.click('.chatwho'); await G.p.waitForSelector('.sheet [data-act=safety]');
ok(/Verified/.test(await G.p.locator('.sheet [data-act=safety]').innerText()), 'Contact info shows Verified');
await G.p.keyboard.press('Escape'); await G.p.waitForTimeout(400);
// it's kept with the trusted keys (sealed, on the server)
await G.p.waitForTimeout(2500);
const pinsCt = sql(`SELECT pins FROM pg_users WHERE handle = 'geo'`);
ok(!/v:/.test(pinsCt), 'kept sealed with the trusted keys (the server can’t see who you verified)');
// the copy on the server, opened with George's key on his phone; and (else) another phone of his saving its own over it:
// without that mark, and with a key of someone's it trusted once
const ELSE = '00000000-0000-4000-8000-000000000000';
const serverPins = (ph, other) => ph.p.evaluate(async (other) => {
  const { E2E } = await import('/pigeon/crypto.js');
  const s = await new Promise((res) => { const r = indexedDB.open('inflight'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('session'); g.onsuccess = () => res(g.result); }; });
  const pair = await E2E.pair(s.priv, s.pub), meta = { type: 'pins', id: 'pins', from: s.me.id, to: s.me.id }, H = { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' };
  const p = (await E2E.open(pair, meta, (await (await fetch('/api/pigeon/pins', { headers: H })).json()).pins)).pins;
  if (!other) return p;
  for (const k of Object.keys(p)) if (k.startsWith('v:')) delete p[k];
  p['old:' + other] = ['an.oldkey'];
  await fetch('/api/pigeon/pins', { method: 'POST', headers: H, body: JSON.stringify({ pins: await E2E.seal(pair, meta, { pins: p, at: Date.now() }) }) });
  return p;
}, other);
await serverPins(G, ELSE);
// Mira's key changes: the warning is stronger
const newPub = await M.p.evaluate(async () => { const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); const j = await crypto.subtle.exportKey('jwk', k.publicKey); return { kty: 'EC', crv: 'P-256', x: j.x, y: j.y }; });
sql(`UPDATE pg_users SET pub = json_object('kty', 'EC', 'crv', 'P-256', 'x', '${newPub.x}', 'y', '${newPub.y}') WHERE handle = 'mira'`);
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ms.me.id); await G.p.waitForTimeout(800);
ok(/You verified Mira in person, and their security key has changed since/.test(await G.p.locator('.warn').innerText()) && await G.p.isVisible('.warn.strong'), 'their key changes: “You verified Mira in person…”');
await G.p.screenshot({ path: `${out}/verify-changed.png` });
// Mark as Verified by hand, and Clear
const M2 = await K.phone('pat'); await K.signup(M2, 'Pat Lee', 'pat', 'pat@example.com', 'London'); const ps = await sess(M2);
await api(gs.token, 'friends', { handle: 'pat' }); await api(ps.token, 'friends-respond', { id: gs.me.id, accept: true });
await G.p.reload(); await G.p.waitForSelector('.tabs'); await openChat(G, ps.me.id); await G.p.click('.chatwho'); await G.p.click('.sheet [data-act=safety]'); await G.p.waitForSelector('.sheet [data-act=verifyok]');
await G.p.click('.sheet [data-act=verifyok]'); await G.p.waitForSelector('.sheet .verified');
ok(true, 'Mark as Verified (after comparing the digits)');
await G.p.click('.sheet [data-act=unverify]'); await G.p.waitForSelector('.sheet [data-act=verifyok]');
ok(!(await G.p.$('.sheet .verified')), 'Clear Verification');
// this phone's saves since added to the other phone's copy rather than replacing it
await G.p.waitForTimeout(2500);
const kept = await serverPins(G);
ok(kept['old:' + ELSE]?.[0] === 'an.oldkey' && !!kept['v:' + ms.me.id] && kept['v:' + ps.me.id] === '' && !!kept[ps.me.id], 'saved from this phone since: the other phone’s old key kept, with this one’s Verified mark (and the one cleared, cleared)', JSON.stringify(Object.keys(kept)));
// a new phone of George's that can't fetch them as it signs in: it saves nothing over them, and once it can, Mira's
// changed key is caught there too (verified before, on the other phone)
const G2 = await K.phone('george2');
await G2.ctx.addInitScript(() => {
  if (location.pathname !== '/pigeon/') return;
  const f = window.fetch;
  window.fetch = function (u, o) {
    if (/\/api\/pigeon\/pins$/.test(String(u))) {
      if ((o?.method || 'GET') === 'GET') { if (!localStorage.getItem('pins-ok')) return Promise.reject(new TypeError('Failed to fetch')); }
      else localStorage.setItem('pins-posts', String(+(localStorage.getItem('pins-posts') || 0) + 1));
    }
    return f.apply(this, arguments);
  };
});
await signInChat(G2.p, K.URL, { email: 'george@example.com' }); await G2.p.waitForSelector('.tabs', { timeout: 40000 }); await G2.p.waitForTimeout(3500);
const posts = () => G2.p.evaluate(() => +(localStorage.getItem('pins-posts') || 0));
ok(await posts() === 0 && (await serverPins(G))['old:' + ELSE]?.length === 1, 'a new phone that couldn’t fetch the trusted keys saves nothing over them');
await G2.p.evaluate(() => { localStorage.setItem('pins-ok', '1'); dispatchEvent(new Event('online')); }); await G2.p.waitForTimeout(3500);
await openChat(G2, ms.me.id); await G2.p.waitForTimeout(800);
ok(await posts() > 0 && await G2.p.isVisible('.warn.strong'), 'once it can: saved, and Mira’s changed key is caught there too', String(await posts()));
await G2.p.screenshot({ path: `${out}/verify-newphone.png` });
const h = await fetch(K.BASE + '/pigeon/'); ok(/camera=\(self\)/.test(h.headers.get('permissions-policy')), 'the page may use the camera (its own, for this only)');
console.log(`FAILS ${K.fails()}`); process.exit(0);
