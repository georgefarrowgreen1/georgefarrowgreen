// Three small server fixes: guessing elsewhere can't lock you out (nor, on a device that's signed in
// before, guessing from everywhere at once), two standard pigeons at once can't both take the turn,
// and unfriending puts booked pigeons back in their lofts.
import { kit } from './lib.mjs';
import { signInInFlight, accountUrl, PASSWORD } from './join.mjs';
import { acctCall } from './handback.mjs';
import { randomUUID } from 'crypto';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess } = K;
const A = await K.phone('ann'), B = await K.phone('ben');
await K.signup(A, 'Ann Ito', 'ann', 'ann@example.com', 'London');
await K.signup(B, 'Ben Ode', 'ben', 'ben@example.com', 'Paris');
const [as, bs] = [await sess(A), await sess(B)];
await api(as.token, 'friends', { handle: bs.me.handle }); await api(bs.token, 'friends-respond', { id: as.me.id, accept: true });
const post = (path, body, headers = {}) => fetch(K.BASE + '/api/pigeon/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);

// 1. forty wrong passwords for Ann, from four other addresses (on the account's page, where every app signs in)
const codes = [];
for (let ip = 1; ip <= 4; ip++) for (let i = 0; i < 10; i++) codes.push((await acctCall('signin/password', { email: 'ann@example.com', proof: 'x'.repeat(43) }, { ip: `203.0.113.${ip}` })).s);
ok(codes.every((c) => c === 401), 'forty wrong tries from elsewhere: each just refused', JSON.stringify([...new Set(codes)]));
const A2 = await K.phone('ann2'); await signInInFlight(A2.p, K.URL, { email: 'ann@example.com' });
ok(await A2.p.waitForSelector('.tabs', { timeout: 20000 }).then(() => true, () => false), 'Ann still signs in with her password, from her own phone');
// one address that keeps guessing is held back (its own 10 per 15 minutes, before the account's 30)
const more = []; for (let i = 0; i < 3; i++) more.push((await acctCall('signin/password', { email: 'ann@example.com', proof: 'y'.repeat(43) }, { ip: '203.0.113.1' })).s);
ok(more.every((c) => c === 429), 'the guessing address itself is held back', JSON.stringify(more));

// 2. two standard pigeons at the same moment, one from each of them: only one takes the turn
const ct = 'c'.repeat(40);
const both = await Promise.all([post('messages', { id: randomUUID(), to: bs.me.id, ct, pigeon: 'standard' }, { Authorization: 'Bearer ' + as.token }),
  post('messages', { id: randomUUID(), to: as.me.id, ct, pigeon: 'standard' }, { Authorization: 'Bearer ' + bs.token }),
  post('messages', { id: randomUUID(), to: bs.me.id, ct, pigeon: 'standard' }, { Authorization: 'Bearer ' + as.token })]);
const sent = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE pigeon = 'standard'`)[0].n);
ok(sent === 1 && both.filter(([c]) => c === 200).length === 1, 'three standard pigeons at once: one flies, the others are told it isn’t their turn', JSON.stringify(both.map(([c, b]) => c + (b.error ? ' ' + b.error.slice(0, 40) : ''))));

// 3. Ann books a swift pigeon for tomorrow, then unfriends Ben: it stays home, back in her loft
const swifts = async () => (await api(as.token, `messages?with=${bs.me.id}`))[1].swift;
const before = await swifts();
const [sc] = await post('messages', { id: randomUUID(), to: bs.me.id, ct, pigeon: 'swift', landAt: Date.now() + 26 * 3600e3 }, { Authorization: 'Bearer ' + as.token });
const after = await swifts();
ok(sc === 200 && after === before - 1, 'booking a swift pigeon takes one from the loft', `${before} → ${after}`);
await fetch(K.BASE + '/api/pigeon/friends', { method: 'DELETE', headers: { Authorization: 'Bearer ' + as.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bs.me.id }) });
const gone = Number(one(`SELECT COUNT(*) AS n FROM pg_msgs WHERE pigeon = 'swift'`)[0].n);
const loft = one(`SELECT swift FROM pg_users WHERE id = '${as.me.id}'`)[0].swift;
ok(gone === 0 && loft === before, 'unfriended: the booked pigeon stays home, and is back in the loft', `rows ${gone}, loft ${loft}`);
// 4. Ann signs in on the account's page on her phone (and out again): it keeps a word that it has. Then guessing spread
// wide (ten more from each of thirty addresses) holds the account itself back, but not on her phone; a new one is told
// a passkey still works
// (signing in on the account's page, in a phone's browser, and out again if asked: → "signed in", or what it says)
const onPage = async (ph, out = false) => {
  const q = await ph.ctx.newPage(); await q.goto(accountUrl(K.URL));
  await q.waitForSelector('main .signin input[name=password]', { state: 'attached', timeout: 30000 });
  if (await q.$('main .signin input[name=email]')) await q.fill('main .signin input[name=email]', 'ann@example.com');
  await q.fill('main .signin input[name=password]', PASSWORD); await q.click('main .signin form .btn');
  const r = await Promise.race([q.waitForSelector('main .hero', { timeout: 30000 }).then(() => 'signed in'),
    q.waitForSelector('main .said.bad', { timeout: 30000 }).then((e) => e.innerText())]).catch(() => 'nothing');
  if (r === 'signed in' && out) { await q.click('main .row.action:text-is("Sign out")'); await q.waitForSelector('main .signin input[name=password]', { state: 'attached', timeout: 15000 }); }
  await q.close(); return r;
};
const before4 = await onPage(A2, true);
for (let ip = 10; ip < 40; ip++) for (let i = 0; i < 10; i++) await acctCall('signin/password', { email: 'ann@example.com', proof: 'x'.repeat(43) }, { ip: `198.51.100.${ip}` });
const A3 = await K.phone('ann3');
const [mine, theirs] = [await onPage(A2), await onPage(A3)];
ok(before4 === 'signed in' && mine === 'signed in', 'guessed at from everywhere: Ann still signs in with her password on her phone, which has signed in before', `${before4} | ${mine}`);
ok(/^Too many tries for this account\. Try again in [^,]+, or sign in with a passkey\.$/.test(theirs), 'a device that hasn\'t signed in before is held back, and told a passkey still works', theirs);
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
