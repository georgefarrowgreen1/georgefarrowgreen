// Security batch: leaked passwords refused, new sign-in alerts, approximate location.
import { kit } from './lib.mjs';
import { accountUrl, signInInFlight, fillJoin, inflightSettings } from './join.mjs';
import { readFileSync, existsSync } from 'fs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, sql, one, api, sess } = K;
const plog = () => existsSync(`${S}/pwnedlog.jsonl`) ? readFileSync(`${S}/pwnedlog.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => m.body || m);

// ---- 2. a leaked password is refused when an account's made (on the account's own page) ----
const gKeys = await K.makeKeys();
const G = await K.phone('george', gKeys);
await G.p.goto(`${accountUrl(K.URL)}#join`); await G.p.waitForSelector('main input[name=name]', { timeout: 20000 });
// (counted from before it's typed: what's asked as it's typed is the answer the button takes, not asked again)
const before = plog().length;
await fillJoin(G.p, { name: 'George Farrow-Green', handle: 'geo', email: 'george@example.com', password: 'password1234' }, { send: false });
await G.p.waitForTimeout(1200);           // (what it says as it's typed, asked and answered, before what's sent)
await G.p.click('main .signin form .btn');
const err = await G.p.waitForSelector('main .said.bad', { timeout: 15000 }).then((e) => e.innerText(), () => '');
ok(/123,456 data breaches/.test(err) && !one("SELECT COUNT(*) AS n FROM pg_users")[0].n, 'a leaked password is refused before any account is made', err);
await G.p.screenshot({ path: `${out}/leaked.png` });
const asked = plog().slice(before), mine = asked.filter((x) => x.url === '/range/E6B6A');     // (password1234's)
ok(mine.length === 1 && asked.every((x) => /^\/range\/[0-9A-F]{5}$/.test(x.url) && x.pad === 'true'), 'Pwned Passwords is asked once (as it’s typed; the button takes that answer), only the first 5 characters of a hash, padded', JSON.stringify(asked));
ok((await fetch(K.BASE + '/api/pigeon/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 410, 'InFlight’s own sign-up is gone: accounts are made on the account’s page');
ok((await fetch(K.BASE + '/api/pigeon/pwned?p=ABCDEF')).status === 400 && (await fetch(K.BASE + '/api/pigeon/pwned?p=abc')).status === 400, 'the server takes nothing longer than 5 characters');
// a fine password goes through (the kit's)
await G.p.fill('main input[name=password]', 'a long test password'); await G.p.click('main .signin form .btn'); await G.p.waitForSelector('main .hero', { timeout: 40000 });
await signInInFlight(G.p, K.URL, { email: 'george@example.com' }); await G.p.waitForSelector('#city', { state: 'attached', timeout: 20000 });
await G.p.selectOption('#city', 'Norwich'); await G.p.waitForSelector('[data-act=onbdone]', { timeout: 20000 }); await G.p.waitForSelector('[data-act=pkadd]'); await G.p.click('[data-act=onbdone]'); await G.p.waitForSelector('.tabs');
ok(true, 'a password that isn’t leaked signs up');
const gs = await sess(G);

// ---- 3. a new sign-in is announced to the other phones, and by email ----
sql(`UPDATE pg_users SET email_ok = ${Date.now()} WHERE handle = 'geo'`);
await K.pushOn(G);
const t0 = Date.now(), m0 = mails().length;
const G2 = await K.phone('george-laptop');
await signInInFlight(G2.p, K.URL, { email: 'george@example.com' }); await G2.p.waitForSelector('.tabs', { timeout: 20000 });
let push = null; for (let k = 0; k < 20 && !push; k++) { await G2.p.waitForTimeout(400); push = await K.lastPush(gKeys, t0); }
ok(push && push.msg.title === 'New sign-in' && /signed in on .+(Android|iPhone|Safari|Chrome)/.test(push.msg.body), 'the first phone is told of the new sign-in', push?.msg.body);
let mail = null; for (let k = 0; k < 20 && !mail; k++) { await G2.p.waitForTimeout(300); mail = mails().slice(m0).find((m) => /new sign-in/i.test(m.subject || '')); }
ok(mail && mail.from === 'Account <account@georgefarrowgreen.com>' && /Signed in to: InFlight/.test(mail.text || '') && /Signed-in devices/.test(mail.text || '') && /@geo/.test(mail.text || ''),
  'and an email, from the account (the same address, its own name), says where and how to sign it out', `${mail?.from} · ${mail?.subject}`);

// ---- 7. approximate location ----
const where = () => one("SELECT lat, lon, loc_approx FROM pg_users WHERE handle = 'geo'")[0];
const patch = (b) => fetch(K.BASE + '/api/pigeon/me', { method: 'PATCH', headers: { Authorization: 'Bearer ' + gs.token, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
await patch({ lat: 52.6293, lon: 1.2979, place: 'Norwich' });
const precise = where();
let r = await patch({ approxLocation: true });
const approx = where();
const KM = (a, b) => Math.hypot((a.lat - b.lat) * 111.32, (a.lon - b.lon) * 111.32 * Math.cos(a.lat * Math.PI / 180));
const step = 10 / 111.32;
ok(r.me.approxLocation === true && approx.loc_approx === 1 && Math.abs(approx.lat / step - Math.round(approx.lat / step)) < 1e-3 && KM(approx, precise) < 8, 'turning it on makes the kept spot approximate at once', JSON.stringify([precise, approx]));
await patch({ lat: 52.6311, lon: 1.3001, place: 'Norwich' });
const moved = where();
ok(Math.abs(moved.lat / step - Math.round(moved.lat / step)) < 1e-3, 'and updates stay on the 10 km grid', JSON.stringify(moved));
await patch({ approxLocation: false }); await patch({ lat: 52.6311, lon: 1.3001, place: 'Norwich' });
const back = where();
ok(back.loc_approx === 0 && Math.abs(back.lat / step - Math.round(back.lat / step)) > 1e-3, 'turned off: precise to a mile again from the next update', JSON.stringify(back));
// the switch: InFlight Settings, on the account's page
await G.p.reload(); await G.p.waitForSelector('.tabs');
const W = await inflightSettings(G.p, 'Who sees what');
await W.locator('#if-approxLocation').scrollIntoViewIfNeeded(); await W.click('#if-approxLocation');
await W.waitForFunction(() => !document.getElementById('if-approxLocation').disabled && document.getElementById('if-approxLocation').checked, null, { timeout: 8000 });
ok(where().loc_approx === 1, 'InFlight Settings → Approximate Location turns it on');
await W.waitForTimeout(400); await W.screenshot({ path: `${out}/approx.png` }); await W.close();
console.log(`FAILS ${K.fails()}`); process.exit(0);
