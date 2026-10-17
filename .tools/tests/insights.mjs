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
msg('m3', as.me.id, bs.me.id, now - 3 * 3600e3, now - 20 * 60e3, { pigeon: 'standard', notified_at: null });
msg('m4', bs.me.id, as.me.id, now - 3600e3, now + 5 * 3600e3, { pigeon: 'standard', notified_at: null });
one(`INSERT INTO pg_gmsgs (id, group_id, sender, body, sender_key, pigeon, sent_at) VALUES ('g1', '${g.group.id}', '${as.me.id}', 'x', 'x', 'standard', ${now - 2 * 3600e3})`);
for (const u of [bs.me.id, cs.me.id]) one(`INSERT INTO pg_gdeliv (msg_id, user_id, wrap, km, deliver_at, notified_at) VALUES ('g1', '${u}', 'x', 400, ${now - 30 * 60e3}, ${now - 29 * 60e3})`);
// accounts of different ages: Ben joined 10 days ago and is still here; Cal joined 12 days ago and left that day
one(`UPDATE pg_users SET created_at = ${now - 10 * DAY} WHERE id = '${bs.me.id}'`);
one(`UPDATE pg_users SET created_at = ${now - 12 * DAY}, seen_at = ${now - 12 * DAY + 3600e3} WHERE id = '${cs.me.id}'`); one(`UPDATE pg_sessions SET seen_at = ${now - 12 * DAY + 3600e3} WHERE user_id = '${cs.me.id}'`);

// the admin
const ad = await (await K.b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })).newPage();
await ad.goto(K.BASE + '/pigeon/admin/'); await ad.waitForSelector('#f-pw'); await ad.fill('#f-pw', 'owner-test-pass'); await ad.press('#f-pw', 'Enter');
await ad.waitForSelector('[data-a=insights]', { timeout: 15000 });
const x = await ad.evaluate(async () => (await fetch('/api/pigeon/admin-insights')).json());
console.log(JSON.stringify({ people: x.people, retention: x.retention, kinds: x.kinds, health: x.health, features: x.features, adoption: x.adoption }));
ok(x.people.total === 3 && x.people.today === 2 && x.people.week === 2 && x.people.month === 3, 'people: 3 accounts, 2 here today and this week, 3 this month', JSON.stringify(x.people));
ok(x.retention.old === 2 && x.retention.back === 1, 'came back after a week: Ben yes, Cal no (1 of 2)', JSON.stringify(x.retention));
ok(x.retention.weeks.length === 1 && x.retention.weeks[0].weeksAgo === 1 && x.retention.weeks[0].joined === 2, 'by week joined: both 1–2 weeks ago', JSON.stringify(x.retention.weeks));
const sent = x.days.sent, n = sent.length;
ok(n === 30 && sent.reduce((a, b) => a + b, 0) === 5 && sent[n - 1] === 3 && sent[n - 1 - 5] === 1 && sent[n - 1 - 12] === 1, '5 pigeons on their days: 3 today, 1 five days ago, 1 twelve days ago (a group pigeon counts once)', sent.join(','));
ok(x.days.active[n - 1] === 2 && x.days.active[n - 1 - 5] === 2 && x.days.active[n - 1 - 12] === 1, 'people active each day: sent or opened one', x.days.active.join(','));
ok(x.days.joined[n - 1] === 1 && x.days.joined[n - 1 - 10] === 1 && x.days.joined[n - 1 - 12] === 1, 'new accounts on the days they joined', x.days.joined.join(','));
const kind = Object.fromEntries(x.kinds.map((k) => [k.kind, k.n]));
ok(kind.standard === 4 && kind.swift === 1, 'kinds: 4 standard, 1 swift', JSON.stringify(x.kinds));
ok(x.features.total === 5 && x.features.group === 1, 'of 5 pigeons, 1 to a group', JSON.stringify(x.features));
ok(x.adoption.friends === 3 && x.adoption.groups === 3, 'all three have a friend, and are in a group', JSON.stringify(x.adoption));
ok(x.health.late === 1, 'one landing not told after 15 minutes', JSON.stringify(x.health));
ok(!/Ann|Ben|Cal|ann@|One|Two|London|New York/.test(JSON.stringify(x)), 'no names, words or places anywhere in it');

// the panel
await ad.click('[data-a=insights]'); await ad.waitForSelector('#layer .chart', { timeout: 15000 }); await ad.waitForTimeout(900);
const txt = (await ad.locator('#layer').innerText()).replace(/\s+/g, ' ');
ok(/Today/.test(txt) && /50%/.test(txt) && /Pigeons sent 5 in 30 days/.test(txt) && /Joined 1–2 weeks ago/.test(txt) && /1 landing not told yet/.test(txt), 'Insights: the figures, the charts, coming back, and the late landing', txt.slice(0, 400));
ok(await ad.locator('#layer .chart').count() === 3 && await ad.locator('#layer .cslot').count() === 90, 'three charts of 30 days each');
const hs = await ad.evaluate(() => [...document.querySelectorAll('#layer .chart[data-chart=sent] .cslot i')].map((i) => Math.round(i.offsetHeight / i.parentElement.offsetHeight * 100)));
ok(hs[29] === 100 && hs[24] === 33 && hs[17] === 33 && hs[0] === 0, 'each column as tall as its day’s figure (today 3 of a scale of 3, the others 1)', hs.join(','));
const mw = await ad.evaluate(() => { const i = [...document.querySelectorAll('#layer .meter')].find((m) => /Swift/.test(m.textContent)).querySelector('.mbar i'); return Math.round(i.offsetWidth / i.parentElement.offsetWidth * 100); });
ok(mw === 20, 'and each row’s bar as long as its share (swift: 1 of 5)', String(mw));
await ad.screenshot({ path: `${out}/insights.png` });
// a tap on today's column: its figure
await ad.locator('#layer .chart[data-chart=sent] .cslot.now').dispatchEvent('pointerdown');
await ad.waitForTimeout(300);
const tip = (await ad.locator('#layer .chart[data-chart=sent] .ctip').textContent()).replace(/\s+/g, ' ');
ok(/3 pigeons ?Today, so far/.test(tip), 'a tap on a day shows its figure', tip);
await ad.screenshot({ path: `${out}/insights-tip.png` });
await ad.evaluate(() => document.querySelector('#layer .sheet .body').scrollBy({ top: 700 })); await ad.waitForTimeout(400);
await ad.screenshot({ path: `${out}/insights-2.png` });
await ad.evaluate(() => document.querySelector('#layer .sheet .body').scrollBy({ top: 900 })); await ad.waitForTimeout(400);
await ad.screenshot({ path: `${out}/insights-3.png` });
// dark
await ad.emulateMedia({ colorScheme: 'dark' }); await ad.evaluate(() => { localStorage.setItem('inflight-theme', 'auto'); document.documentElement.setAttribute('data-theme', 'auto'); });
await ad.evaluate(() => document.querySelector('#layer .sheet .body').scrollTo({ top: 0 })); await ad.waitForTimeout(500);
await ad.screenshot({ path: `${out}/insights-dark.png` });
// the API is the admin's only
const r = await fetch(K.BASE + '/api/pigeon/admin-insights', { headers: { Authorization: 'Bearer ' + as.token } });
ok(r.status === 401 || r.status === 403, 'not for anyone else', String(r.status));
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
