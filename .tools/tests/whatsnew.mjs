// What's New: never pops up; and no version at the foot of Account (it's in InFlite's menu). The sheet itself, opened as its act would.
import { kit } from './lib.mjs';
import { readFileSync } from 'fs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql } = K;
const G = await K.phone('george');
await K.signup(G, 'George Farrow-Green', 'geo', 'george@example.com', 'London');
const open = () => G.p.locator('.sheet .wnhero').count();
// (the app's own version and release list, so a new release doesn't need this changing)
const app = readFileSync(new URL('../../pigeon/app.js', import.meta.url), 'utf8');
const V = app.match(/const APP_VERSION = "([\d.]+)"/)[1], VS = [...app.matchAll(/\{ v: "([\d.]+)", at:/g)].map((x) => x[1]);
sql(`UPDATE pg_users SET created_at = ${Date.UTC(2026, 3, 1)}`);
await G.p.evaluate(() => localStorage.setItem('inflight-seen', '1.0.2'));
await G.p.reload(); await G.p.waitForSelector('.tabs'); await G.p.waitForTimeout(3000);
ok(await open() === 0, 'it never pops up on its own, even after an update');
await G.p.click('[data-act=tab][data-id=account]'); await G.p.waitForTimeout(700);
await G.p.locator('#screen > main.view .aver').scrollIntoViewIfNeeded();
const foot = await G.p.locator('#screen > main.view .aver').innerText();
ok(!foot.includes(V) && !(await G.p.$('#screen > main.view [data-act=whatsnew]')), 'no version at the foot of Account', foot);
await G.p.screenshot({ path: `${out}/account-foot.png` });
await G.p.evaluate(() => { const x = document.createElement('button'); x.hidden = true; x.dataset.act = 'whatsnew'; document.querySelector('#screen').append(x); x.click(); x.remove(); });
await G.p.waitForSelector('.sheet .wnhero'); await G.p.waitForTimeout(1200);
const heads = await G.p.locator('.sheet .ghead').allInnerTexts(), rows = await G.p.locator('.sheet .wnrow b').allInnerTexts();
// (every release since you joined, newest first: this account joined before 1.0.2)
const since = VS.slice(0, VS.indexOf('1.0.2') + 1);
ok(heads.length === since.length && heads.every((h, i) => h.startsWith(since[i] + ' ')) && heads[0].startsWith(V) && rows.length > 40, 'tap it: every release, newest first', JSON.stringify([heads, rows.length]));
await G.p.screenshot({ path: `${out}/whatsnew-light.png` });
await G.p.click('.sheet .wnfoot [data-act=close]').catch(async () => { await G.p.keyboard.press('Escape'); });
await G.p.waitForTimeout(500);
ok(await open() === 0, 'Done closes it');
console.log(`FAILS ${K.fails()}`); await K.b.close(); process.exit(0);
