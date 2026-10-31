// Chat's server against a real database (node:sqlite, made to look like D1, with the real schema): seasonal looks
// counted after messages go, disappearing messages and read receipts (and in a group someone has left), what one person
// is sent of others' reactions and flights together, the minute tick finding what it needs by index, and what quiet
// hours hold that no pigeon carries
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { db, msgView, refundLoft, loft } from '../../../functions/_pigeon.js';
import { noteSeason } from '../../../functions/_seasons.js';
import { vanishSweep } from '../../../functions/_vanish.js';
import { reactsFor } from '../../../functions/_reacts.js';
import { nearViews, flockUp } from '../../../functions/_moments.js';
import { stampPassports, restampPair } from '../../../functions/_passport.js';
import { settleBirds, birdQs, birdsFrom } from '../../../functions/_birds.js';
import { friendRequested, friendAccepted, groupAdded, heldTick, oneTick } from '../../../functions/_notify.js';
import { idleDue } from '../../../functions/_retention.js';

const sql = new DatabaseSync(':memory:'), asked = [];
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const env = { DB: { prepare: (q) => { asked.push(q); return st(q); },
  batch: async (list) => { sql.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } } } };
const D = await db(env);
const DAY = 864e5, now = Date.now();
const put = (table, row) => sql.prepare(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...val(Object.values(row)));
const user = (id, x = {}) => put('pg_users', { id, handle: id, name: id, email: `${id}@example.com`, pub: '{}', salt: 's', proof_hash: 'p', vault: 'v', swift: 9, swift_at: 0, created_at: 0, lat: 51.5, lon: -0.1, ...x });
const msg = (id, x) => put('pg_msgs', { id, ct: 'sealed', km: 300, sent_at: now - 2 * DAY, deliver_at: now - DAY, from_lat: 51.5, from_lon: -0.1, to_lat: 48.85, to_lon: 2.35, ...x });
const gmsg = (id, x) => put('pg_gmsgs', { id, group_id: 'g', body: 'sealed', sender_key: 'k', pigeon: 'standard', sent_at: now - 9 * DAY, from_lat: 51.5, from_lon: -0.1, ...x });
const gdel = (msg_id, user_id, x) => put('pg_gdeliv', { msg_id, user_id, wrap: 'w', km: 300, deliver_at: now - 8 * DAY, to_lat: 48.85, to_lon: 2.35, ...x });
const link = (a, b, status = 'ok') => put('pg_links', { a, b, status, created_at: 0 });
const member = (group_id, user_id) => put('pg_group_members', { group_id, user_id, added_by: 'ann', joined_at: 0 });
const gone = (t, id) => !!sql.prepare(`SELECT gone_at FROM ${t} WHERE id = ?`).get(id).gone_at;
for (const id of ['ann', 'bo', 'cy', 'di']) user(id);

test('a seasonal look is kept at ten, counting the pigeons whose messages have since gone (a month after landing)', async () => {
  const t = Date.UTC(2026, 10, 10);                      // 10 Nov: autumn
  for (let i = 0; i < 5; i++) put('pg_flights', { id: `f${i}`, msg_id: `f${i}`, sender: 'ann', sent_at: Date.UTC(2026, 9, 2 + i) });
  for (let i = 0; i < 4; i++) msg(`s${i}`, { sender: 'ann', recipient: 'bo', sent_at: Date.UTC(2026, 10, 5 + i), deliver_at: Date.UTC(2026, 10, 5 + i, 3) });
  await noteSeason(D, 'ann', t);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_kit WHERE user_id = 'ann'").get().n, 0, 'nine: not yet');
  msg('s4', { sender: 'ann', recipient: 'bo', sent_at: t - 1000, deliver_at: t + 3600e3 });
  await noteSeason(D, 'ann', t);
  assert.ok(sql.prepare("SELECT 1 FROM pg_kit WHERE user_id = 'ann' AND item = 'skin:autumn'").get(), 'the tenth keeps it');
});

test('disappearing messages: timed from landing, read or not, where read receipts are off (one to one and in a group)', async () => {
  user('quiet', { no_receipts: 1, no_receipts_at: now - 30 * DAY });
  user('newly', { no_receipts: 1, no_receipts_at: now - 3600e3 });                      // (turned them off an hour ago)
  const due = { vanish: DAY, deliver_at: now - DAY - 5000 };
  msg('v-off', { sender: 'ann', recipient: 'quiet', ...due });                         // unread, receipts off: goes
  msg('v-on', { sender: 'ann', recipient: 'cy', ...due });                             // unread, receipts on: stays
  msg('v-read', { sender: 'ann', recipient: 'cy', ...due, read_at: now - DAY - 5000 }); // read a day ago: goes
  for (const id of ['ann', 'cy', 'di', 'quiet', 'newly']) member('g', id);
  gmsg('gv-off', { sender: 'ann', vanish: 7 * DAY }); gdel('gv-off', 'quiet'); gdel('gv-off', 'cy');
  gmsg('gv-on', { sender: 'ann', vanish: 7 * DAY }); gdel('gv-on', 'cy'); gdel('gv-on', 'di');
  gmsg('gv-read', { sender: 'ann', vanish: 7 * DAY }); gdel('gv-read', 'cy', { read_at: now - 8 * DAY }); gdel('gv-read', 'di', { read_at: now - 8 * DAY });
  // (landed before receipts went off: its time counts from then, so turning them off wipes nothing at once)
  msg('v-new', { sender: 'ann', recipient: 'newly', ...due });
  gmsg('gv-new', { sender: 'ann', vanish: 7 * DAY }); gdel('gv-new', 'newly'); gdel('gv-new', 'cy');
  await vanishSweep(env);
  assert.deepEqual(['v-off', 'v-on', 'v-read', 'v-new'].map((id) => gone('pg_msgs', id)), [true, false, true, false]);
  assert.deepEqual(['gv-off', 'gv-on', 'gv-read', 'gv-new'].map((id) => gone('pg_gmsgs', id)), [true, false, true, false]);
  sql.exec(`UPDATE pg_users SET no_receipts_at = ${now - 8 * DAY} WHERE id = 'newly'`);
  await vanishSweep(env);
  assert.deepEqual([gone('pg_msgs', 'v-new'), gone('pg_gmsgs', 'gv-new')], [true, true], 'and its time after that');
  assert.equal(sql.prepare("SELECT ct FROM pg_msgs WHERE id = 'v-off'").get().ct, '', 'what was said is wiped');
});

test('disappearing messages in a group: someone who left without reading one doesn’t keep it there for everyone else', async () => {
  for (const id of ['ann', 'cy', 'di']) member('gl', id);                                // (bo has left)
  const read = { read_at: now - 8 * DAY }, g = { group_id: 'gl', sender: 'ann', vanish: 7 * DAY };
  gmsg('gl-left', g); gdel('gl-left', 'cy', read); gdel('gl-left', 'bo');               // read by all still in it: goes
  gmsg('gl-stay', g); gdel('gl-stay', 'cy', read); gdel('gl-stay', 'di');               // di, still in it, hasn't read it: stays
  gmsg('gl-all', g); gdel('gl-all', 'bo');                                              // everyone it flew to has left: timed from landing
  gmsg('gl-soon', g); gdel('gl-soon', 'bo', { deliver_at: now - DAY });                 // (and not before its time)
  await vanishSweep(env);
  assert.deepEqual(['gl-left', 'gl-stay', 'gl-all', 'gl-soon'].map((id) => gone('pg_gmsgs', id)), [true, false, true, false]);
});

test('reactions: none from, or flying to, someone either of you has blocked; your own always', async () => {
  link('ann', 'bo', 'blocked'); link('ann', 'cy');
  const r = (id, sender, recipient) => put('pg_reacts', { id, msg_id: 'm-r', group_id: 'g', sender, recipient, ct: 'sealed', keys: '{}', sent_at: now - 60e3, deliver_at: now - 30e3 });
  r('r1', 'bo', 'cy'); r('r2', 'cy', 'bo'); r('r3', 'cy', 'di'); r('r4', 'ann', 'bo');
  assert.deepEqual((await reactsFor(env, 'ann', ['m-r'])).map((x) => x.id).sort(), ['r3', 'r4']);
  assert.equal((await reactsFor(env, 'di', ['m-r'])).length, 4, 'someone with no block sees them all');
});

test('flying together: its meet and part points go to everyone as plain timing points; who sees both pigeons is told when they part', async () => {
  const meet = now - 6 * 3600e3, part = now - 5 * 3600e3, legs = JSON.stringify([[50, 0, meet, 'f'], [49.5, 1, part, 'f'], [49, 2, now - 4 * 3600e3, 'c']]);
  msg('fl-a', { sender: 'ann', recipient: 'bo', sent_at: now - 8 * 3600e3, deliver_at: now - 3600e3, legs });
  msg('fl-b', { sender: 'ann', recipient: 'cy', sent_at: now - 8 * 3600e3, deliver_at: now - 3600e3, legs });
  put('pg_near', { a: 'fl-a', b: 'fl-b', at: meet, lat: 50, lon: 0, km: 80, place: 'France', kind: 'flock' });
  const v = msgView('bo', sql.prepare("SELECT * FROM pg_msgs WHERE id = 'fl-a'").get(), now);
  assert.deepEqual(v.legs.map((l) => [l[2], l[3]]), [[meet, 'c'], [part, 'c'], [now - 4 * 3600e3, 'c']], 'no "f" points, but each kept, at its time (the map keeps pace)');
  const seen = await nearViews(D, 'ann', ['fl-a'], now);
  assert.equal(seen.get('fl-a')?.[0]?.until, part, 'the sender of both: when they part');
  assert.equal((await nearViews(D, 'bo', ['fl-a'], now)).size, 0, 'the recipient of one hears nothing of it');
});

test('the minute tick: flights to stamp and named pigeons to settle found by index, and each flight stamped once', async () => {
  for (let i = 0; i < 3; i++) msg(`st${i}`, { sender: 'ann', recipient: 'cy', deliver_at: now - (i + 1) * 3600e3 });
  gmsg('gst', { sender: 'ann' }); gdel('gst', 'cy');
  sql.exec("UPDATE pg_msgs SET stamped = 1 WHERE id NOT LIKE 'st%'"); sql.exec("UPDATE pg_gdeliv SET stamped = 1 WHERE msg_id != 'gst'");   // (the others' flights: done)
  gmsg('gnf', { sender: 'ann' }); gdel('gnf', 'di', { deliver_at: now - 9 * DAY });   // (to someone who isn't ann's friend: waits for that)
  asked.length = 0;
  assert.equal(await stampPassports(D, now), 5);
  await settleBirds(D, now);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_msgs WHERE id LIKE 'st%' AND stamped = 1").get().n, 3, 'one to one: marked');
  assert.equal(sql.prepare("SELECT stamped FROM pg_gdeliv WHERE msg_id = 'gst' AND user_id = 'cy'").get().stamped, 1, 'in a group: marked');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_stamped WHERE id LIKE 'st%' OR id = 'gst:cy'").get().n, 4, 'and in the passport');
  // (every look at the message tables goes by an index: none reads them through)
  for (const q of asked.filter((q) => /^\s*SELECT/.test(q) && /pg_(msgs|gmsgs|gdeliv)\b/.test(q))) {
    const scans = sql.prepare('EXPLAIN QUERY PLAN ' + q).all().map((r) => r.detail).filter((d) => /^SCAN (pg_msgs|pg_gmsgs|pg_gdeliv|m|d)$/.test(d));
    assert.deepEqual(scans, [], q.replace(/\s+/g, ' ').slice(0, 120));
  }
  assert.equal(await stampPassports(D, now), 0, 'nothing left to stamp');
  // (the one to someone who isn't a friend: left out of the look, not read again every minute; stamped once they're friends)
  const looked = () => sql.prepare("SELECT COUNT(*) AS n FROM pg_gdeliv INDEXED BY pg_gdeliv_unstamped WHERE stamped IS NULL AND lost_at IS NULL AND deliver_at <= ?").get(now).n;
  assert.equal(looked(), 0, 'out of the index');
  assert.ok(!sql.prepare("SELECT 1 FROM pg_stamped WHERE id = 'gnf:di'").get(), 'and not stamped');
  link('ann', 'di'); await restampPair(D, 'di', 'ann').run();
  assert.equal(looked(), 1, 'friends now: back in it');
  assert.equal(await stampPassports(D, now), 1);
  assert.ok(sql.prepare("SELECT 1 FROM pg_stamped WHERE id = 'gnf:di'").get(), 'and stamped');
});

test('quiet hours hold a friend request, one accepted and being added to a group, and they are told once they end, if they still stand', async () => {
  const pushed = [], was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { pushed.push(init.headers['X-Endpoint']); return new Response(null, { status: 201 }); };
  try {
    const env2 = { ...env, PIGEON_PUSH_URL: 'https://push.test/' };
    const h = new Date().getUTCHours(), quiet = (on) => JSON.stringify({ quiet: on, quietFrom: h, quietTo: (h + 2) % 24, tz: 'UTC' });
    for (const id of ['fay', 'gus', 'hal']) user(id);
    user('eve', { notify_prefs: quiet(true) });
    // (a phone of eve's to push to)
    const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const b64u = (b) => Buffer.from(b).toString('base64url');
    put('pg_sessions', { hash: 'se', user_id: 'eve', created_at: now, seen_at: now });
    put('pg_push', { endpoint: 'https://fcm.googleapis.com/fcm/send/eve', user_id: 'eve', session: 'se', p256dh: b64u(await crypto.subtle.exportKey('raw', k.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))), created_at: now });
    link('fay', 'eve', 'pending'); link('eve', 'gus'); link('hal', 'eve', 'pending');
    put('pg_groups', { id: 'g2', name: 'Walks', created_by: 'fay', created_at: now }); member('g2', 'eve');
    await friendRequested(env2, 'https://chat.example', { id: 'fay', name: 'Fay', handle: 'fay' }, 'eve');
    await friendRequested(env2, 'https://chat.example', { id: 'hal', name: 'Hal', handle: 'hal' }, 'eve');
    await friendAccepted(env2, { id: 'gus', name: 'Gus' }, 'eve');
    await groupAdded(env2, { id: 'fay', name: 'Fay' }, ['eve'], { id: 'g2', name: 'Walks' });
    assert.equal(pushed.length, 0, 'nothing in quiet hours');
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_held WHERE user_id = 'eve'").get().n, 4, 'all held');
    assert.equal(await heldTick(env2, D, Date.now(), 'https://chat.example'), 0, 'still quiet: still held');
    sql.prepare("DELETE FROM pg_links WHERE a = 'hal'").run();                // (hal took his request back)
    sql.prepare("UPDATE pg_users SET notify_prefs = ? WHERE id = 'eve'").run(quiet(false));
    assert.equal(await heldTick(env2, D, Date.now(), 'https://chat.example'), 3, 'quiet hours over: told, but not of a request no longer there');
    assert.equal(pushed.length, 3);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_held").get().n, 0, 'and each told once');
    assert.equal(await heldTick(env2, D, Date.now(), 'https://chat.example'), 0);
    // (one held for days is let go untold)
    sql.prepare("INSERT INTO pg_held (user_id, kind, about, at) VALUES ('eve', 'request', 'fay', ?)").run(now - 4 * DAY);
    assert.equal(await heldTick(env2, D, Date.now(), 'https://chat.example'), 0);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_held").get().n, 0);
  } finally { globalThis.fetch = was; }
});

test('a pigeon that never went goes back in the loft it came from: a mystery one in its own, a full loft left as it is', async () => {
  const t = now;
  user('ivy', { mystery: 0, mystery_at: t - 3600e3, swift: 9, swift_at: 0 });
  await refundLoft(D, 'ivy', 'mystery', t);
  const ivy = () => sql.prepare("SELECT * FROM pg_users WHERE id = 'ivy'").get();
  assert.equal(loft(ivy(), 'mystery', t).count, 1, 'its mystery pigeon is back');
  assert.equal(ivy().mystery_at, t, 'and, the loft full, its clock starts again');
  const swift = loft(ivy(), 'swift', t).count;
  await refundLoft(D, 'ivy', 'swift', t);
  assert.equal(loft(ivy(), 'swift', t).count, swift, 'a full loft: no more than full');
});

test('flying together: a pigeon just off is read again only once it has been made quicker, not once for every pigeon it could meet', async () => {
  const off = now + 3600e3, way = { from_lat: 51.5, from_lon: -0.1, to_lat: 48.85, to_lon: 2.35, sent_at: off, deliver_at: off + 5 * 3600e3 };
  for (const id of ['lea', 'max', 'ned']) user(id);
  msg('fk-a', { sender: 'lea', recipient: 'max', ...way });
  msg('fk-b', { sender: 'lea', recipient: 'ned', ...way });                                // (the same way at the same time: together)
  for (let i = 0; i < 5; i++) msg(`fk-x${i}`, { sender: 'lea', recipient: 'ned', ...way, to_lat: 55.95, to_lon: -3.19 });   // (off north: not)
  asked.length = 0;
  assert.equal(await flockUp(D, sql.prepare("SELECT * FROM pg_msgs WHERE id = 'fk-a'").get()), 1, 'one flock');
  assert.ok(sql.prepare("SELECT 1 FROM pg_near WHERE a = 'fk-a' AND b = 'fk-b' AND kind = 'flock'").get());
  assert.ok(sql.prepare("SELECT deliver_at FROM pg_msgs WHERE id = 'fk-a'").get().deliver_at < way.deliver_at, 'and quicker');
  assert.equal(asked.filter((q) => /FROM pg_msgs WHERE id = \?/.test(q)).length, 1, 'read again once, after (it was once for each of the six)');
});

test('named pigeons: asked in a sync’s own trip, a flight that has landed settled first, and nothing read through for someone with none', async () => {
  user('ola');
  put('pg_birds', { id: 'b-ola', owner: 'ola', name: 'Pip', created_at: now - 9 * DAY });
  msg('bf-1', { sender: 'ola', recipient: 'bo', bird: 'b-ola', km: 340, sent_at: now - 5 * 3600e3, deliver_at: now + 3600e3 });
  const ask = async (id) => birdsFrom(D, id, now, (await D.batch(birdQs(D, id))).map((r) => r.results));
  asked.length = 0;
  let v = await ask('ola');
  assert.deepEqual([v.birds[0].state, v.birds[0].landAt], ['flying', now + 3600e3]);
  assert.ok(!asked.some((q) => /UPDATE pg_msgs SET bird_done/.test(q)), 'nothing to settle: nothing tried');
  sql.exec(`UPDATE pg_msgs SET deliver_at = ${now - 60e3} WHERE id = 'bf-1'`);              // (landed, and the tick not round yet)
  v = await ask('ola');
  assert.deepEqual([v.birds[0].state, v.birds[0].km, v.birds[0].flights], ['resting', 340, 1], 'landed: its miles counted, and resting');
  assert.ok(sql.prepare("SELECT bird_done FROM pg_msgs WHERE id = 'bf-1'").get().bird_done);
  assert.deepEqual(await ask('bo'), { birds: [], hall: [] });
  // (by index, from the pigeons themselves: no one's messages read through)
  asked.length = 0; birdQs(D, 'bo');
  for (const q of asked) {
    const scans = sql.prepare('EXPLAIN QUERY PLAN ' + q).all().map((r) => r.detail).filter((d) => /^SCAN /.test(d));
    assert.deepEqual(scans, [], q.replace(/\s+/g, ' ').slice(0, 120));
  }
});

test('one tick at a time: one asked for while another runs is left out, or waits and runs after it; a lease left by one that died lapses', async () => {
  const lease = () => sql.prepare("SELECT v FROM pg_meta WHERE k = 'tick_run'").get().v;
  let release; const first = oneTick(D, () => new Promise((r) => { release = () => r('first'); }));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(await oneTick(D, async () => 'traffic'), { busy: true }, 'the traffic’s: left out');
  const sched = oneTick(D, async () => 'scheduled', 5000);
  setTimeout(() => release(), 50);
  assert.equal(await first, 'first');
  assert.equal(await sched, 'scheduled', 'the scheduler’s: after it');
  assert.equal(lease(), '0', 'given back');
  await assert.rejects(oneTick(D, async () => { throw new Error('broke'); }));
  assert.equal(lease(), '0', 'given back by one that went wrong too');
  sql.prepare("UPDATE pg_meta SET v = ? WHERE k = 'tick_run'").run(String(Date.now() - 1));   // (one that died part way: its lease run out)
  assert.equal(await oneTick(D, async () => 'next'), 'next');
});

test('an account unused for a year goes no sooner than the day its email gave, a full week after it went', async () => {
  const warned = now - 30 * DAY, long = warned - 400 * DAY;                              // (unused far longer than a year when warned)
  user('jo', { created_at: long, seen_at: long, warned_at: warned });
  user('kit', { created_at: long, seen_at: warned + DAY, warned_at: warned });           // (and one who came back since)
  const due = async (t) => (await idleDue(D, t, 50)).map((u) => u.id).filter((id) => id === 'jo' || id === 'kit');
  assert.deepEqual(await due(warned + 6 * DAY + 60e3), [], 'six days on: not yet (it was, a day before the date it gave)');
  assert.deepEqual(await due(warned + 7 * DAY - 60e3), [], 'nor a minute before the week is up');
  assert.deepEqual(await due(warned + 7 * DAY), ['jo'], 'then: not one who came back');
});
