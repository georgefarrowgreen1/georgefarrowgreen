// The trip sheet on a slow phone: Singapore to Copernicus (the case George reported), how long a
// redraw takes, and whether taps still work.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess, openChat } = K;
const R = await K.phone('reuben'), M = await K.phone('mira');
await K.signup(R, 'Reuben Tan', 'reuben', 'reuben@example.com', 'Singapore');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Paris');
const [rs, ms] = [await sess(R), await sess(M)];
await api(rs.token, 'friends', { handle: ms.me.handle }); await api(ms.token, 'friends-respond', { id: rs.me.id, accept: true });
await fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + ms.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ moon: { lat: 9.6, lon: -20.1 } }) });
await R.p.reload(); await R.p.waitForSelector('.tabs');
await openChat(R, ms.me.id); await R.p.waitForTimeout(600);
await R.p.click('.compose .kind'); await R.p.waitForSelector('.sheet [data-act=pigeon][data-id=lunarx]');
await R.p.click('.sheet [data-act=pigeon][data-id=lunarx]'); await R.p.waitForTimeout(300); await R.p.click('.sheet header [data-act=close]'); await R.p.waitForTimeout(400);
await R.p.fill('#msg', 'See you on the Moon'); await R.p.click('.send'); await R.p.waitForTimeout(1800);
const m = one(`SELECT id FROM pg_msgs WHERE sender = '${rs.me.id}'`)[0];
// a phone-ish CPU
const cdp = await R.ctx.newCDPSession(R.p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await R.p.click(`[data-mid="${m.id}"]`); await R.p.waitForTimeout(400);
const t0 = Date.now(); await R.p.click('[data-act=map]'); await R.p.waitForSelector('.moonsky'); const open = Date.now() - t0;
await R.p.waitForTimeout(2500);
// how long one redraw takes now (the pictures are already drawn once)
const ms1 = await R.p.evaluate(async () => { const t = performance.now(); for (let i = 0; i < 10; i++) window.__tick?.(); return (performance.now() - t) / 10; });
const longest = await R.p.evaluate(() => new Promise((res) => { let worst = 0; const o = new PerformanceObserver((l) => { for (const e of l.getEntries()) worst = Math.max(worst, e.duration); }); o.observe({ type: 'longtask', buffered: false }); setTimeout(() => { o.disconnect(); res(worst); }, 4000); }));
ok(longest < 120, 'with the trip open, the page never stalls (longest task, at 6× slower CPU)', `${Math.round(longest)} ms; opened in ${open} ms`);
await R.p.screenshot({ path: `${out}/singapore-to-copernicus.png` });
const t1 = Date.now(); await R.p.click('.sheet header [data-act=close]'); await R.p.waitForSelector('.moonsky', { state: 'detached', timeout: 5000 }); const shut = Date.now() - t1;
ok(shut < 1500, 'tapping Close answers straight away', `${shut} ms`);
// the Earth is mostly sea from over Singapore: count green vs blue on the globe
await R.p.click(`[data-mid="${m.id}"]`); await R.p.waitForTimeout(300); await R.p.click('[data-act=map]'); await R.p.waitForSelector('.moonsky'); await R.p.waitForTimeout(1500);
const mix = await R.p.evaluate(() => {
  const cv = document.querySelector('.moonsky'), g = cv.getContext('2d'), w = cv.width, h = cv.height;
  const cx = Math.round(w * 0.17), cy = Math.round(h * 0.58), r = Math.round(Math.min(w * 0.11, h * 0.2) * 0.8);
  const d = g.getImageData(cx - r, cy - r, 2 * r, 2 * r).data; let land = 0, sea = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > d[i + 2] && d[i + 1] > 60) land++; else if (d[i + 2] > d[i + 1] && d[i + 2] > 60) sea++; }
  return { land, sea };
});
ok(mix.sea > mix.land && mix.land > 0, 'the Earth from over Singapore: land and sea, mostly sea', JSON.stringify(mix));
// the moments run on below the picture: the sheet scrolls to the last of them
const sc = await R.p.evaluate(() => { const b = document.querySelector('.sheet .body.moonbody'); const before = b.scrollTop; b.scrollTop = 9999; return { can: b.scrollHeight > b.clientHeight, moved: b.scrollTop > before, style: getComputedStyle(b).overflowY }; });
ok(sc.can && sc.moved, 'the trip scrolls to its last moment', JSON.stringify(sc));
await R.p.mouse.move(195, 600); await R.p.mouse.wheel(0, 800); await R.p.waitForTimeout(400);
ok(await R.p.locator('.mcsteps li').last().isVisible() && (await R.p.locator('.mcsteps li').last().boundingBox()).y < 844, 'touchdown is on screen once scrolled');
await R.p.screenshot({ path: `${out}/scrolled.png` });
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
