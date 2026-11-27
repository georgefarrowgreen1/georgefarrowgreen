// What's sent through the home page's Get in touch (functions/api/contact.js): kept in D1 as well as emailed, and read
// in Admin on the owner's account page (functions/api/pigeon admin-messages), where each is new until it's been seen
// (read_at). Each is kept until it's deleted there. The table's made the first time it's needed, once per copy of the
// server.

import { ignoreDuplicateColumn, schemaSetup } from "./_schema.js";

const ensureTable = schemaSetup(async (env) => {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS messages (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "name TEXT, email TEXT, body TEXT, created_at INTEGER, read_at INTEGER)"
  ).run();
  // (a table made before messages were marked read)
  await env.DB.prepare("ALTER TABLE messages ADD COLUMN read_at INTEGER").run().catch(ignoreDuplicateColumn);
  await env.DB.prepare("ALTER TABLE messages ADD COLUMN contact_receipt TEXT").run().catch(ignoreDuplicateColumn);
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS messages_contact_receipt ON messages (contact_receipt)").run();
});

export async function hasMessageReceipt(env, receipt) {
  await ensureTable(env);
  return !!await env.DB.prepare("SELECT 1 FROM messages WHERE contact_receipt = ?").bind(receipt).first();
}

export async function saveMessage(env, { name, email, body, receipt = null }) {
  await ensureTable(env);
  await env.DB.prepare(
    "INSERT INTO messages (name, email, body, created_at, contact_receipt) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT (contact_receipt) DO NOTHING"
  ).bind(name, email, body, Date.now(), receipt).run();
}

const SHOWN = 200;

// Give unread messages a place in the bounded list even when recent read messages would fill it.
export async function listMessages(env) {
  await ensureTable(env);
  const { results } = await env.DB.prepare(
    `SELECT * FROM (
      SELECT id, name, email, body, created_at, read_at FROM messages
      ORDER BY (read_at IS NULL) DESC, created_at DESC, id DESC LIMIT ${SHOWN}
    ) ORDER BY created_at DESC, id DESC`
  ).all();
  return results || [];
}

export async function dropMessage(env, id) {
  await ensureTable(env);
  return (await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run()).meta?.changes || 0;
}

// Total and unread counts across the inbox, plus the newest message's sender and time.
export async function messageCounts(env) {
  await ensureTable(env);
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(read_at IS NULL) AS unread,
    (SELECT name FROM messages ORDER BY created_at DESC, id DESC LIMIT 1) AS lastName, MAX(created_at) AS lastAt FROM messages`).first();
  return { n: r?.n || 0, unread: r?.unread || 0, lastName: r?.lastName || null, lastAt: r?.lastAt || null };
}

// seen (in Admin): these, if they weren't already
export async function markRead(env, ids) {
  await ensureTable(env);
  const list = ids.filter(Number.isSafeInteger).slice(0, SHOWN), t = Date.now();
  if (!list.length) return 0;
  // (99 at a time, with the time: D1 takes at most 100 values to a statement)
  let n = 0;
  for (let i = 0; i < list.length; i += 99) { const part = list.slice(i, i + 99); n += (await env.DB.prepare(`UPDATE messages SET read_at = ? WHERE read_at IS NULL AND id IN (${part.map(() => "?").join(", ")})`).bind(t, ...part).run()).meta?.changes || 0; }
  return n;
}
