// needs: hub roof-markets roof-fitness
// Swiping between an app's sections (Today's swipe.js): in Weather, Fitness and Markets under the roof, a touch drag to
// the left goes to the next section and one to the right back; a short drag stays; a vertical drag scrolls and switches
// nothing; nothing of the swipe is left on the page; at a phone's speed (CPU x4) no frame of a swipe over 40 ms.
import * as H from './roofhooks.mjs';
import { HUB, checker, phone, account, wxServer, weatherAccount, pageCall, shown, wait, PLACES, engine } from './rooflib.mjs';
const [,, S, out] = process.argv;
const { ok, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL crashed: ${e?.stack || e}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
wxServer();
const acct = await account('Probe Swipe', 'probeswipe');
const ph = await phone('probe', { cookies: acct.cookies });
await engine(ph.ctx);
const { p } = ph;
await p.goto(`${HUB}/robots.txt`);
await weatherAccount(p, { places: [PLACES.London], settings: { temp: 'c' } });
await pageCall(p, 'PUT', '/api/markets/holding', { symbol: 'TSCO.L', name: 'Tesco', qty: 200, cost: 3.5 });
const r0 = (await pageCall(p, 'GET', '/api/fitness/me')).j;
await p.evaluate(async (base) => { const d = new Date(); d.setHours(0, 0, 0, 0); const t = d.getTime(), mon = t - ((d.getDay() + 6) % 7) * 864e5;
  await fetch('/api/fitness/me', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base, data: { plan: { id: 'sportive', start: mon, at: t }, prefs: { onboarded: true, maps: 'always', units: 'metric' } } }) }); }, r0?.ver || 0);
const cdp = await p.context().newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
async function swipe(x0, x1, y, steps = 12, shotName = null) {
  await touch('touchStart', x0, y);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + ((x1 - x0) * i) / steps, y); await wait(16); if (shotName && i === Math.round(steps / 2)) await p.screenshot({ path: `${out}/${shotName}.png` }); }
  await touch('touchEnd', x1, y);
  await wait(700);
}
const sec = () => p.evaluate(() => document.querySelector('#hd [role=tab][aria-selected="true"]')?.dataset.sec || null);
const clean = () => p.evaluate(() => ({ cls: document.documentElement.className.match(/ifl-sw[-\w]*/g) || [], peek: document.querySelectorAll('.ifl-sw-peek,.ifl-sw-cur').length }));
for (const [app, path, main, secs] of [['weather', '/weather/', H.M_WEATHER, ['now', 'days']], ['fitness', '/fitness/', H.M_FITNESS, ['today', 'activities']], ['markets', '/markets/', H.M_MARKETS, ['today', 'holdings']]]) {
  await p.goto(`${HUB}${path}`); ok(await shown(p, main, 20000), `${app} up`); await wait(5000);
  // (a y in the middle of the screen, away from charts if we can: the header's bottom + 150)
  // Weather's rain chart now occupies y=600 and owns its sideways gesture. Swipe
  // the forecast's text instead, while still leaving chart scrubbing untouched.
  const y = app === 'weather' ? 300 : 600;
  const s0 = await sec();
  await swipe(320, 60, y, 12, `${app}-mid`);
  const s1 = await sec();
  ok(s1 === secs[1], `${app}: a swipe left from ${s0} goes to ${secs[1]}`, s1);
  const c1 = await clean();
  ok(!c1.cls.length && !c1.peek, `${app}: nothing of the swipe left behind`, JSON.stringify(c1));
  await p.screenshot({ path: `${out}/${app}-after.png` });
  await swipe(60, 320, y);
  ok((await sec()) === secs[0], `${app}: a swipe right comes back to ${secs[0]}`, await sec());
  await swipe(320, 250, y, 6);
  ok((await sec()) === secs[0], `${app}: a short drag stays`, await sec());
  // (a vertical drag scrolls and switches nothing)
  await touch('touchStart', 200, 650); for (let i = 1; i <= 10; i++) { await touch('touchMove', 205, 650 - i * 30); await wait(16); } await touch('touchEnd', 205, 350); await wait(500);
  ok((await sec()) === secs[0], `${app}: a vertical drag switches nothing`, await sec());
  // every section starts just under the header (one not shown takes no room, Radar's full-screen height included)
  for (const id of await p.$$eval('#hd [role=tab][data-sec]', (b) => b.map((x) => x.dataset.sec))) {
    if (id === 'radar') continue;
    await p.evaluate((s) => document.querySelector(`#hd [role=tab][data-sec="${s}"]`)?.click(), id); await wait(900);
    const top = await p.evaluate((s) => { const e = document.querySelector(`main:not([hidden]) section[data-sec="${s}"]`); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; }, id);
    ok(top != null && top < 360, `${app}: ${id} starts just under the header`, String(top));
  }
  await p.evaluate((s) => document.querySelector(`#hd [role=tab][data-sec="${s}"]`)?.click(), secs[0]); await wait(900);
  // at phone speed: the frames during a swipe
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.evaluate(() => { window.__fr = []; let l = performance.now(); const t = (n) => { window.__fr.push(n - l); l = n; if (window.__fr.length < 400) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await swipe(320, 60, y, 14);
  const gaps = await p.evaluate(() => window.__fr.filter((g) => g > 40).map(Math.round));
  ok(!gaps.length, `${app}: at a phone’s speed, no frame of a swipe over 40 ms`, JSON.stringify(gaps));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
}
console.log(`FAILS ${fails()}`); process.exit(0);
