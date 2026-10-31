// Mail (the inflite repo's email/, where it's checked out beside this one) keeping mail that comes, against a real
// database (node:sqlite, made to look like D1, with Mail's own schema) and R2 kept in memory: a database that takes a
// message but whose answer is lost on the way back (an error, though it's kept) leaves the message whole, its body and
// its files with it, kept once, with or without a Message-ID of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MAIL = new URL('../../../../inflite/email/', import.meta.url);
const skip = !existsSync(new URL('src/index.js', MAIL)) && 'the inflite repo isn’t beside this one';
const load = (p) => import(new URL(p, MAIL).href);

const sql = new DatabaseSync(':memory:');
// (lost: the next batch that writes a message is done, and then said to have failed)
let lost = false;
const val = (a) => a.map((x) => (typeof x === 'boolean' ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const DB = { prepare: (q) => st(q), batch: async (list) => {
  sql.exec('BEGIN');
  const out = [];
  try { for (const s of list) out.push(await s.all()); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; }
  if (lost && list.length > 1) { lost = false; throw new Error('D1_ERROR: Network connection lost.'); }
  return out;
} };
const r2 = new Map();
const R2 = {
  put: async (k, v) => { r2.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v)); },
  get: async (k) => (r2.has(k) ? { arrayBuffer: async () => r2.get(k).buffer.slice(0), json: async () => JSON.parse(new TextDecoder().decode(r2.get(k))) } : null),
  delete: async (k) => { for (const x of [].concat(k)) r2.delete(x); },
  list: async ({ prefix, limit }) => ({ objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((key) => ({ key })) }),
};
const env = { DB, MAIL: R2, DOMAIN: 'inflite.ai', DEFAULT_FROM: 'hello@inflite.ai', ACCOUNT_ORIGIN: 'https://account.inflite.ai' };
const later = [];
const ctx = { waitUntil: (p) => later.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (later.length) await later.shift(); };
const quietly = async (fn) => { const was = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = was; } };

// (a message with a photo attached; with its own Message-ID, or none)
const eml = (subject, id) => [
  'From: Maya Chen <maya@studio-north.co>', 'To: hello@inflite.ai', `Subject: ${subject}`, ...(id ? [`Message-ID: <${id}@studio-north.co>`] : []),
  `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b1"', '',
  '--b1', 'Content-Type: text/plain', '', 'The drawings are attached.', '',
  '--b1', 'Content-Type: image/png; name="plan.png"', 'Content-Disposition: attachment; filename="plan.png"', 'Content-Transfer-Encoding: base64', '',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', '', '--b1--', '',
].join('\r\n');
const incoming = (subject, id) => ({ to: 'hello@inflite.ai', from: 'maya@studio-north.co', raw: eml(subject, id), rawSize: 400, setReject: () => assert.fail('refused'), forward: async () => {} });

for (const [what, id] of [['with its own Message-ID', 'lost-answer'], ['with none', null]]) {
  test(`kept though the database’s answer was lost (${what}): once, whole, its body and its file there`, { skip }, async () => {
    const { ensureSchema } = await load('src/db.js');
    const { receiveEmail } = await load('src/receive.js');
    await ensureSchema(env);
    const subject = `Drawings ${what}`;
    lost = true;
    await quietly(() => receiveEmail(incoming(subject, id), env, ctx));
    await settle();
    assert.equal(lost, false, 'its answer was lost');
    const rows = sql.prepare(`SELECT id, subject FROM messages WHERE subject = ?`).all(subject);
    assert.equal(rows.length, 1, 'kept once');
    const mid = rows[0].id;
    assert.ok(r2.has(`body/${mid}.json`), 'its body kept');
    assert.match(new TextDecoder().decode(r2.get(`body/${mid}.json`)), /drawings are attached/);
    const atts = sql.prepare(`SELECT id, filename FROM attachments WHERE message_id = ?`).all(mid);
    assert.deepEqual(atts.map((a) => a.filename), ['plan.png'], 'its file, once');
    assert.ok(r2.has(`att/${atts[0].id}`), 'and the file itself');
    assert.ok(r2.has(`raw/${mid}.eml`), 'the original kept');
    assert.equal([...r2.keys()].filter((k) => k.startsWith('pending/')).length, 0, 'nothing left to read in later');
  });
}
