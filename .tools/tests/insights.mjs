// Admin → Insights (functions/_insights.js): how many people use InFlight and come back, pigeons and people each
// day, which kinds and features, which settings, and whether landings are told on time. Totals only.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess } = K;
const DAY = 864e5, now = Date.now();
const A = await K.phone('ann'), B = await K.phone('ben'), C = await K.phone('cal');
await K.signup(A, 'Ann Ito', 'ann', 'ann@example.com', 'London');
await K.signup(B, 'Ben Ode', 'ben', 'ben@example.com', 'New York');
await K.signup(C, 'Cal Roy', 'cal', 'cal@example.com', 'Paris');
const [as, bs, cs] = [await sess(A), await sess(B), await sess(C)];
for (const x of [bs, cs]) { await api(as.token, 'friends', { handle: x.me.handle }); await api(x.token, 'friends-respond', { id: as.me.id, accept: true }); }
// pigeons, put straight into the database (Insights only counts them): Ann's one 12 days ago (a swift), one 5 days
// ago that Ben opened then, one to the group today, and one that landed 20 minutes ago with no one told yet (a
// late notice); and Ben's one back today
const [, g] = await api(as.token, 'groups', { name: 'Trio', members: [bs.me.id, cs.me.id] });
for (const P of [A, B, C]) await P.ctx.close();
const msg = (id, from, to, sent, land, more = {}) => {
  const cols = { id, sender: from, recipient: to, ct: 'x', km: 5000, sent_at: sent, deliver_at: land, notified_at: land, ...more };
  one(`INSERT INTO pg_msgs (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).map((v) => v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : v).join(', ')})`);
};
msg('m1', as.me.id, bs.me.id, now - 12 * DAY, now - 12 * DAY + 3600e3, { pigeon: 'swift' });
msg('m2', as.me.id, bs.me.id, now - 5 * DAY, now - 5 * DAY + 3600e3, { pigeon: 'standard', read_at: now - 5 * DAY + 7200e3 });
// (today's sent no earlier than London's midnight, so they're today's whatever the hour the test runs at)
const lp = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, Number(x.value)]));
const midnight = now - ((lp.hour * 60 + lp.minute) * 60 + lp.second) * 1000 - (now % 1000), todayAt = (ago, k) => Math.max(midnight + k * 60e3, now - ago);
msg('m3', as.me.id, bs.me.id, todayAt(3 * 3600e3, 1), now - 20 * 60e3, { pigeon: 'standard', notified_at: null });
msg('m4', bs.me.id, as.me.id, todayAt(3600e3, 3), now + 5 * 3600e3, { pigeon: 'standard', notified_at: null });
one(`INSERT INTO pg_gmsgs (id, group_id, sender, body, sender_key, pigeon, sent_at) VALUES ('g1', '${g.group.id}', '${as.me.id}', 'x', 'x', 'standard', ${todayAt(2 * 3600e3, 2)})`);
for (const u of [bs.me.id, cs.me.id]) one(`INSERT INTO pg_gdeliv (msg_id, user_id, wrap, km, deliver_at, notified_at) VALUES ('g1', '${u}', 'x', 400, ${now - 30 * 60e3}, ${now - 29 * 60e3})`);
// accounts of different ages: Ben joined 16 days ago, used it in his second week, and is here today; Cal joined
// 12 days ago and left that day (the London days each used it, as the app notes them)
const today = one(`SELECT MAX(day) AS d FROM pg_active`)[0].d;
ok(one(`SELECT COUNT(*) AS n FROM pg_active WHERE day = ${today}`)[0].n === 3, 'signing in notes the day each used it');
one(`UPDATE pg_users SET created_at = ${now - 16 * DAY} WHERE id = '${bs.me.id}'`);
one(`DELETE FROM pg_active WHERE user_id IN ('${bs.me.id}', '${cs.me.id}')`);
one(`INSERT INTO pg_active (day, user_id) VALUES (${today - 16}, '${bs.me.id}'), (${today - 9}, '${bs.me.id}'), (${today}, '${bs.me.id}'), (${today - 12}, '${cs.me.id}')`);
one(`UPDATE pg_users SET created_at = ${now - 12 * DAY}, seen_at = ${now - 12 * DAY + 3600e3} WHERE id = '${cs.me.id}'`); one(`UPDATE pg_sessions SET seen_at = ${now - 12 * DAY + 3600e3} WHERE user_id = '${cs.me.id}'`);

// the admin (Ann's account), on its own page
const AD = await K.admin(as.me.id);
const x = (await AD.ask('insights')).json;
console.log(JSON.stringify({ people: x.people, retention: x.retention, kinds: x.kinds, health: x.health, features: x.features, adoption: x.adoption }));
ok(x.people.total === 3 && x.people.today === 2 && x.people.week === 2 && x.people.month === 3, 'people: 3 accounts, 2 here today and this week, 3 this month', JSON.stringify(x.people));
ok(x.retention.old === 2 && x.retention.back === 1, 'came back after a week: Ben yes, Cal no (1 of 2)', JSON.stringify(x.retention));
const [w1, w2] = x.retention.weeks;
ok(x.retention.weeks.length === 2 && w1.weeksAgo === 1 && w1.joined === 1 && w1.back === 0 && w1.secondWeek === undefined && w2.weeksAgo === 2 && w2.joined === 1 && w2.secondWeek === 1,
  'by week joined: Cal 1–2 weeks ago (his second week not over yet), Ben 2–3 weeks ago, who used it in his second week', JSON.stringify(x.retention.weeks));
const sent = x.days.sent, n = sent.length;
ok(n === 30 && sent.reduce((a, b) => a + b, 0) === 5 && sent[n - 1] === 3 && sent[n - 1 - 5] === 1 && sent[n - 1 - 12] === 1, '5 pigeons on their days: 3 today, 1 five days ago, 1 twelve days ago (a group pigeon counts once)', sent.join(','));
const act = x.days.active;
ok(act[n - 1] === 2 && act[n - 1 - 5] === 2 && act[n - 1 - 9] === 1 && act[n - 1 - 12] === 2 && act[n - 1 - 16] === 1, 'people active each day: opened the app, or sent or opened a pigeon', act.join(','));
ok(x.days.joined[n - 1] === 1 && x.days.joined[n - 1 - 16] === 1 && x.days.joined[n - 1 - 12] === 1, 'new accounts on the days they joined', x.days.joined.join(','));
const kind = Object.fromEntries(x.kinds.map((k) => [k.kind, k.n]));
ok(kind.standard === 4 && kind.swift === 1, 'kinds: 4 standard, 1 swift', JSON.stringify(x.kinds));
ok(x.features.total === 5 && x.features.group === 1, 'of 5 pigeons, 1 to a group', JSON.stringify(x.features));
ok(x.adoption.friends === 3 && x.adoption.groups === 3, 'all three have a friend, and are in a group', JSON.stringify(x.adoption));
ok(x.health.late === 1, 'one landing not told after 15 minutes', JSON.stringify(x.health));
ok(!/Ann|Ben|Cal|ann@|One|Two|London|New York/.test(JSON.stringify(x)), 'no names, words or places anywhere in it');

// the sheet, on the admin's account page
const actx = await K.b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, colorScheme: 'light' });
await actx.addCookies([AD.cookie]);
const ad = await actx.newPage();
ad.on('pageerror', (e) => K.errs.push(`admin: ${e.message}`));
await ad.goto(AD.page + '/'); await ad.waitForSelector('main .row:has(b:text-is("Admin"))', { timeout: 20000 }); await ad.waitForTimeout(900);
await ad.click('main .row:has(b:text-is("Admin"))'); await ad.click('#sheet .row:has(b:text-is("Insights"))');
await ad.waitForSelector('#sheet .adm-chart', { timeout: 15000 }); await ad.waitForTimeout(900);
const txt = (await ad.locator('#sheet').innerText()).replace(/\s+/g, ' ');
ok(/today/.test(txt) && /50%/.test(txt) && /Pigeons sent 5 in 30 days/.test(txt) && /Joined 1–2 weeks ago 0 of 1/.test(txt) && /Joined 2–3 weeks ago 1 of 1/.test(txt) && /Landings not told yet 1/.test(txt),
  'Insights, on the admin’s account page: the figures, the charts, coming back by week, the late landing', txt.slice(0, 400));
ok(await ad.locator('#sheet .adm-chart').count() === 3 && await ad.locator('#sheet .adm-bars i').count() === 90, 'three charts of 30 days each');
const hs = await ad.evaluate(() => [...document.querySelector('#sheet .adm-chart .adm-bars').children].map((i) => Math.round(i.offsetHeight / i.parentElement.offsetHeight * 100)));
ok(hs[29] === 100 && hs[24] === 33 && hs[17] === 33 && hs[0] <= 3, 'each column as tall as its day’s figure (today 3 of a scale of 3, the others 1)', hs.join(','));
const mw = await ad.evaluate(() => { const i = [...document.querySelectorAll('#sheet .adm-meter')].find((m) => /Swift/.test(m.textContent)).querySelector('.mbar i'); return Math.round(i.offsetWidth / i.parentElement.offsetWidth * 100); });
ok(mw === 20, 'and each row’s bar as long as its share (swift: 1 of 5)', String(mw));
await ad.screenshot({ path: `${out}/insights.png` });
await ad.evaluate(() => document.querySelector('#sheet .sheet-body').scrollBy({ top: 700 })); await ad.waitForTimeout(400);
await ad.screenshot({ path: `${out}/insights-2.png` });
await ad.evaluate(() => document.querySelector('#sheet .sheet-body').scrollBy({ top: 900 })); await ad.waitForTimeout(400);
await ad.screenshot({ path: `${out}/insights-3.png` });
// dark
await ad.emulateMedia({ colorScheme: 'dark' });
await ad.evaluate(() => document.querySelector('#sheet .sheet-body').scrollTo({ top: 0 })); await ad.waitForTimeout(500);
await ad.screenshot({ path: `${out}/insights-dark.png` });
// the scheduled jobs and the server's errors, for the admin: each job notes when it ran, and an error is kept to be seen
await K.tick();
await fetch(K.BASE + '/api/weather/tick', { method: 'POST', headers: { Authorization: 'Bearer tick-test-secret' } });
one(`INSERT INTO pg_errors (at, src, msg) VALUES (${Date.now()}, 'pigeon api', 'D1_ERROR: something broke')`);
const sum = (await AD.ask('summary')).json;
ok(sum.ticks?.inflight?.at > Date.now() - 120e3 && sum.ticks?.weather?.at > Date.now() - 120e3 && sum.errors?.[0]?.msg === 'D1_ERROR: something broke',
  'Admin’s summary: when each notifications job last ran, and the server’s errors today', JSON.stringify({ ticks: sum.ticks, errors: sum.errors }));
// the admin's only; InFlight's old admin API is gone
const r = await fetch(K.BASE + '/api/pigeon/admin-insights', { headers: { Authorization: 'Bearer ' + as.token } });
ok(r.status === 404, 'InFlight’s old admin API: gone', String(r.status));
const r2 = await fetch('http://127.0.0.1:8788/api/account/admin/insights', { headers: { Authorization: 'Bearer ' + bs.token } }).catch(() => ({ status: 0 }));
ok(r2.status === 403 || r2.status === 404, 'and Admin’s not for anyone else', String(r2.status));
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
