// Mail (the inflite repo's email/, where it's checked out beside this one), its Worker against a real database
// (node:sqlite, made to look like D1, with Mail's own schema): the figures for the chips and the badge, and the lists of
// the stream, read from the conversations that can be in them (by an index of their own) rather than every one there's
// ever been, which Done keeps for good, and the same as reading them all made them; and one message come to two of your
// addresses kept once, with the other address noted on it, even when both come at the same moment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/threads.js', MAIL)) && 'the inflite repo isn’t beside this one';
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
const asked = [];
let miss = null;
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b),
  first: async () => { asked.push(q); if (miss?.(q)) { miss = null; return null; } return sql.prepare(q).get(...val(a)) ?? null; },
  all: async () => (asked.push(q), { results: sql.prepare(q).all(...val(a)), meta: {} }),
  run: async () => (asked.push(q), { meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const DB = { prepare: (q) => st(q), batch: async (list) => { sql.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
const r2 = new Map();
const R2 = {
  put: async (k, v) => { r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v)); },
  get: async (k) => (r2.has(k) ? { arrayBuffer: async () => r2.get(k).buffer.slice(0), json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))) } : null),
  delete: async (k) => { for (const x of [].concat(k)) r2.delete(x); },
  list: async ({ prefix, limit }) => ({ objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((key) => ({ key })) }),
};
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai' };
const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };

// A mailbox of a few hundred conversations, made the same each time: most long since Done, some in the stream, some put
// off till Later (some whose time has come), flagged, unread, to three addresses, in People and Updates, a few in the Trash
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const now = Date.now();
const ADDRS = ['hello@inflite.ai', 'george@inflite.ai', 'shop@inflite.ai'];
function fill() {
  const ins = sql.prepare(`INSERT INTO messages (id, folder, thread_id, message_id, mailbox, from_name, from_email, subject, snippet, date, unread, starred,
    category, snooze_until, bumped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  for (let t = 0; t < 400; t++) {
    const kind = rnd(), stream = kind < 0.25, later = stream && rnd() < 0.3, trash = !stream && kind > 0.95;
    const cat = rnd() < 0.4 ? 'updates' : 'people', box = ADDRS[Math.floor(rnd() * 3)];
    const snooze = later ? now + (rnd() < 0.8 ? 1 : -1) * Math.floor(rnd() * 864e5 + 6e4) : null;
    const count = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const sent = i > 0 && rnd() < 0.3;
      const folder = trash ? 'trash' : sent ? 'sent' : stream && (i === count - 1 || rnd() < 0.5) ? 'inbox' : 'archive';
      ins.run(`m${n}`, folder, `t${t}`, `<m${n}@x>`, box, 'Someone', `s${t % 37}@example.com`, `About ${t}`, 'Hello', now - 1e9 + n * 1000,
        folder === 'inbox' && rnd() < 0.5 ? 1 : 0, rnd() < 0.08 ? 1 : 0, sent ? 'people' : cat, folder === 'inbox' ? snooze : null,
        rnd() < 0.05 ? now - 1e9 + n * 1000 + 500 : null);
      n++;
    }
  }
}

// What the figures and lists were when every conversation was read and added up here (as Mail had it before)
const AGG = `thread_id, MAX(MAX(date), MAX(COALESCE(bumped_at, 0))) AS last, MAX(date) AS latest, COUNT(*) AS n,
  SUM(folder = 'inbox' AND unread = 1) AS unread, MAX(starred) AS starred, MAX(has_attachments) AS atts,
  SUM(folder = 'inbox') AS inbox, MIN(COALESCE(category, 'people')) AS category, MAX(COALESCE(snooze_until, 0)) AS snooze,
  SUM(lower(mailbox) = ?1) AS toAddr`;
const everything = (addr = '') => sql.prepare(`SELECT ${AGG} FROM messages WHERE folder NOT IN ('trash', 'drafts') AND thread_id IS NOT NULL GROUP BY thread_id`).all(addr);
function countsBefore() {
  const out = { people: { threads: 0, unread: 0 }, updates: { threads: 0, unread: 0 }, flagged: 0, snoozed: 0 };
  const rows = everything();
  for (const r of rows) {
    const c = out[r.category === 'updates' ? 'updates' : 'people'];
    if (r.inbox > 0 && r.snooze > now) out.snoozed++;
    else if (r.inbox > 0) { c.threads++; if (r.unread) c.unread++; }
    if (r.starred) out.flagged++;
  }
  const later = rows.filter((r) => r.inbox > 0 && r.snooze > now).sort((a, b) => a.snooze - b.snooze)[0];
  const ups = rows.filter((r) => r.inbox > 0 && r.snooze <= now && r.category === 'updates').sort((a, b) => b.last - a.last).slice(0, 4);
  return { out, later: later?.thread_id, ups: ups.map((r) => r.thread_id) };
}
function listBefore({ view, category, address }) {
  const keep = {
    all: (r) => r.inbox > 0 && r.snooze <= now,
    unread: (r) => r.unread > 0 && r.snooze <= now,
    later: (r) => r.inbox > 0 && r.snooze > now,
    flagged: (r) => r.starred === 1,
  }[view];
  return everything(address || '').filter((r) => keep(r) && (!category || r.category === category) && (!address || r.toAddr > 0))
    .sort(view === 'later' ? (a, b) => a.snooze - b.snooze : (a, b) => b.last - a.last).slice(0, 40).map((r) => r.thread_id);
}

test('the chips’ figures, the badge and the stream’s lists: as reading every conversation made them, read from the stream alone', { skip }, async () => {
  const { ensureSchema } = await load('src/db.js');
  await ensureSchema(env);
  fill();
  sql.exec('ANALYZE');
  const { counts, listThreads } = await load('src/threads.js');
  const { peopleUnread } = await load('src/push.js');
  const before = countsBefore();
  asked.length = 0;
  const c = await counts(env);
  for (const k of ['people', 'updates', 'flagged', 'snoozed']) assert.deepEqual(c[k], before.out[k], k);
  assert.ok(c.people.threads && c.updates.unread && c.snoozed && c.flagged, 'a mailbox with something of each');
  assert.equal(c.nextLater?.id, before.later, 'the next back from Later');
  assert.deepEqual(c.updatesFrom.length, before.ups.length);
  assert.equal(c.inbox.unread, before.out.people.unread, 'the badge');
  assert.equal(await peopleUnread(env), before.out.people.unread, 'the badge, as a notice sets it');
  assert.equal(c.trash, sql.prepare(`SELECT COUNT(DISTINCT thread_id) AS n FROM messages WHERE folder = 'trash'`).get().n);
  for (const view of ['all', 'unread', 'later', 'flagged'])
    for (const category of [null, 'people', 'updates'])
      for (const address of [null, 'george@inflite.ai']) {
        const sp = new URLSearchParams(Object.entries({ view, category, address }).filter(([, v]) => v));
        const got = (await listThreads(env, new URL(`https://x/api/threads?${sp}`))).threads.map((t) => t.id);
        assert.deepEqual(got, listBefore({ view, category: view === 'flagged' ? category : category, address }), `${view} ${category} ${address}`);
      }
  // (and none of it read by going through every message: each grouping by conversation finds them by an index)
  const grouped = [...new Set(asked.filter((q) => /GROUP BY thread_id/.test(q)))];
  assert.ok(grouped.length >= 3);
  for (const q of grouped) {
    const n = Math.max(0, ...[...q.matchAll(/\?(\d+)/g)].map((m) => +m[1]));
    const plan = sql.prepare(`EXPLAIN QUERY PLAN ${q}`).all(...Array(n).fill(now)).map((r) => r.detail);
    assert.ok(!plan.some((d) => /^SCAN messages( USING (COVERING )?INDEX idx_messages_(thread|thread_folder|folder_date))?$/.test(d)), `${q}\n${plan.join('\n')}`);
  }
});

const eml = ({ to, cc = '', id = 'two@studio-north.co', subject = 'Drawings', from = 'Maya Chen <maya@studio-north.co>' }) =>
  `From: ${from}\r\nTo: ${to}\r\n${cc ? `Cc: ${cc}\r\n` : ''}Subject: ${subject}\r\nMessage-ID: <${id}>\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain\r\n\r\nThe drawings are attached.\r\n`;
const delivery = (rcpt, raw) => ({ to: rcpt, from: 'maya@studio-north.co', raw, rawSize: raw.length, setReject: () => assert.fail('refused'), forward: async () => {} });
const rows = (id) => sql.prepare(`SELECT id, thread_id, mailbox, also_to, folder FROM messages WHERE message_id = ? ORDER BY date`).all(id);

test('one message to two of your addresses: one conversation, the other address noted on it, its list finding it', { skip }, async () => {
  const { receiveEmail } = await load('src/receive.js');
  const { listThreads } = await load('src/threads.js');
  const raw = eml({ to: 'hello@inflite.ai', cc: 'george@inflite.ai' });
  await receiveEmail(delivery('hello@inflite.ai', raw), env, ctx);
  await receiveEmail(delivery('george@inflite.ai', raw), env, ctx);
  await receiveEmail(delivery('george@inflite.ai', raw), env, ctx);
  const kept = rows('two@studio-north.co');
  assert.equal(kept.length, 1, 'kept once');
  assert.equal(kept[0].mailbox, 'hello@inflite.ai');
  assert.equal(kept[0].also_to, ',george@inflite.ai,', 'the other address noted, once');
  assert.equal([...r2.keys()].filter((k) => k.startsWith('raw/')).length, 1, 'the other copies let go');
  const ids = async (address) => (await listThreads(env, new URL(`https://x/api/threads?view=all&address=${address}`))).threads.map((t) => t.id);
  assert.ok((await ids('george@inflite.ai')).includes(kept[0].thread_id), 'in the other address’s own mail');
  assert.ok((await ids('hello@inflite.ai')).includes(kept[0].thread_id));
  assert.ok(!(await ids('shop@inflite.ai')).includes(kept[0].thread_id));
  const found = await listThreads(env, new URL('https://x/api/threads?q=to:george'));
  assert.ok(found.threads.some((t) => t.id === kept[0].thread_id), 'and to: finds it');
});

test('both at the same moment: the one that comes second, finding nothing yet, still kept once', { skip }, async () => {
  const { receiveEmail } = await load('src/receive.js');
  const raw = eml({ to: 'hello@inflite.ai', cc: 'shop@inflite.ai', id: 'race@studio-north.co' });
  await receiveEmail(delivery('hello@inflite.ai', raw), env, ctx);
  // (the second's look for it made before the first was kept)
  miss = (q) => /SELECT id, mailbox, also_to FROM messages/.test(q);
  await receiveEmail(delivery('shop@inflite.ai', raw), env, ctx);
  assert.equal(miss, null, 'it did miss it');
  const kept = rows('race@studio-north.co');
  assert.equal(kept.length, 1, 'kept once');
  assert.equal(kept[0].also_to, ',shop@inflite.ai,');
  assert.equal(sql.prepare(`SELECT COUNT(*) AS n FROM attachments a LEFT JOIN messages m ON m.id = a.message_id WHERE m.id IS NULL`).get().n, 0, 'nothing left over');
});

test('what you sent yourself still comes, to another of your addresses; the same message to the same address, once', { skip }, async () => {
  const { receiveEmail } = await load('src/receive.js');
  sql.prepare(`INSERT INTO messages (id, folder, thread_id, message_id, mailbox, from_name, from_email, subject, date, category)
    VALUES ('mine', 'sent', 'mine', 'self@inflite.ai', 'hello@inflite.ai', 'George', 'hello@inflite.ai', 'Note to self', ?, 'people')`).run(now);
  const raw = eml({ to: 'george@inflite.ai', id: 'self@inflite.ai', subject: 'Note to self', from: 'George <hello@inflite.ai>' });
  await receiveEmail({ ...delivery('george@inflite.ai', raw), from: 'hello@inflite.ai' }, env, ctx);
  assert.deepEqual(rows('self@inflite.ai').map((r) => r.folder).sort(), ['inbox', 'sent'], 'it came, beside the copy you sent');
  // (a different message under an ID that's taken: kept, as its own)
  await receiveEmail(delivery('hello@inflite.ai', eml({ to: 'hello@inflite.ai', id: 'two@studio-north.co', subject: 'Something else' })), env, ctx);
  assert.equal(rows('two@studio-north.co').length, 2);
});
