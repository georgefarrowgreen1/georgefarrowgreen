// needs: hub roof-fitness
// Acting from Today's Fitness card (Today 1.50, functions/_todayfit.js planChange, POST /api/plan): a session today,
// Rest Today → the card says rest at once (Fitness's swaps over the days it last sent), and Fitness's record has today
// rested; Undo → the session back; Move to Tomorrow → tomorrow has today's session in Fitness's record.
import * as H from './roofhooks.mjs';
import { HUB, checker, phone, account, wxServer, weatherAccount, pageCall, shown, wait, until, PLACES, js } from './rooflib.mjs';
const [,, S, out] = process.argv;
const { ok, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${e?.stack || e}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
wxServer();
const acct = await account('Plan Person', 'planperson');
const ph = await phone('plan', { cookies: acct.cookies });
const { p } = ph;
await p.goto(`${HUB}/robots.txt`);
await weatherAccount(p, { places: [PLACES.London], settings: { temp: 'c' } });
// (the plan, and today's session set to Endurance 90 by a swap of Fitness's own, keyed by the day's start here)
const r0 = (await pageCall(p, 'GET', '/api/fitness/me')).j;
const put = await p.evaluate(async (base) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); const t = d.getTime(), mon = t - ((d.getDay() + 6) % 7) * 864e5;
  const r = await fetch('/api/fitness/me', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base, data: { plan: { id: 'sportive', start: mon, at: t }, swaps: { [t]: 'endurance-90' }, prefs: { onboarded: true, maps: 'always', units: 'metric' } } }) });
  return { status: r.status, t };
}, r0?.ver || 0);
ok(put.status === 200, 'a plan, and today’s session Endurance 90', js(put));
// (Fitness opened, so it sends its days to the account)
await p.goto(`${HUB}/fitness/`); await shown(p, H.M_FITNESS, 30000); await wait(6000);
const card = '.tcard[data-app="fitness"]';
const todayCard = async () => { await p.goto(`${HUB}/`); await shown(p, H.TODAY, 30000); await shown(p, card, 30000); await wait(1500); return (await p.textContent(card).catch(() => '')) || ''; };
let t = await todayCard();
ok(/Endurance 90/.test(t) && !!(await p.$(`${card} [data-plan="rest"]`)) && !!(await p.$(`${card} [data-plan="move"]`)), 'Today’s Fitness card: Endurance 90, with Rest Today and Move to Tomorrow', t.slice(0, 160));
await p.click(`${card} [data-plan="rest"]`);
ok(await until(async () => /Rest/.test((await p.textContent('.ifl-toast').catch(() => '')) || '') ? 'y' : null, 8000), 'Rest Today: said', await p.textContent('.ifl-toast').catch(() => ''));
ok(await until(async () => /Rest/.test((await p.textContent(card).catch(() => '')) || '') && !(await p.$(`${card} [data-plan]`)) ? 'y' : null, 10000), '…the card a rest day at once', (await p.textContent(card).catch(() => ''))?.slice(0, 160));
const rec1 = (await pageCall(p, 'GET', '/api/fitness/me')).j;
ok(rec1?.data?.swaps?.[String(put.t)] === null, '…and today rested in Fitness’s own plan (its swaps)', js(rec1?.data?.swaps));
// Undo, from the toast
const undo = await p.$('.ifl-toast button');
if (undo) await undo.click();
ok(await until(async () => /Endurance 90/.test((await p.textContent(card).catch(() => '')) || '') && !!(await p.$(`${card} [data-plan="rest"]`)) ? 'y' : null, 10000), 'Undo: the session back on the card', (await p.textContent(card).catch(() => ''))?.slice(0, 160));
const rec2 = (await pageCall(p, 'GET', '/api/fitness/me')).j;
ok(rec2?.data?.swaps?.[String(put.t)] === 'endurance-90', '…and in Fitness’s plan as it was', js(rec2?.data?.swaps));
// Move to Tomorrow
await p.click(`${card} [data-plan="move"]`);
ok(await until(async () => /tomorrow/i.test((await p.textContent('.ifl-toast').catch(() => '')) || '') ? 'y' : null, 8000), 'Move to Tomorrow: said', await p.textContent('.ifl-toast').catch(() => ''));
const rec3 = (await pageCall(p, 'GET', '/api/fitness/me')).j, keys = Object.keys(rec3?.data?.swaps || {}).map(Number).sort();
const tomorrow = keys.find((k) => k > put.t);
ok(tomorrow && rec3.data.swaps[String(tomorrow)] === 'endurance-90', '…tomorrow has Endurance 90 in Fitness’s plan', js(rec3?.data?.swaps));
await p.screenshot({ path: `${out}/after-move.png` });
console.log(`FAILS ${fails()}`); process.exit(0);
