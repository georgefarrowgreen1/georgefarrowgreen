// What's sent through the home page's Get in touch (functions/api/contact.js): kept in D1 as well as emailed, and read
// in Admin on the owner's account page (functions/api/pigeon admin-messages), where each is new until it's been seen
// (read_at). Each is kept until it's deleted there. The table's made the first time it's needed, once per copy of the
// server.

let ready = null;
async function ensureTable(env) {
  await (ready ||= (async () => {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS messages (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "name TEXT, email TEXT, body TEXT, created_at INTEGER, read_at INTEGER)"
    ).run();
    // (a table made before messages were marked read)
    await env.DB.prepare("ALTER TABLE messages ADD COLUMN read_at INTEGER").run().catch(() => {});
  })().catch((e) => { ready = null; throw e; }));
}

export async function saveMessage(env, { name, email, body }) {
  await ensureTable(env);
  await env.DB.prepare(
    "INSERT INTO messages (name, email, body, created_at) VALUES (?, ?, ?, ?)"
  ).bind(name, email, body, Date.now()).run();
}

// (Admin shows the latest 200, and so can mark only those seen: the count of new ones is of those, too, or one older
// than them would stay new for good)
const SHOWN = 200;

// the latest 200, newest first
export async function listMessages(env) {
  await ensureTable(env);
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, body, created_at, read_at FROM messages ORDER BY created_at DESC LIMIT ${SHOWN}`
  ).all();
  return results || [];
}

export async function dropMessage(env, id) {
  await ensureTable(env);
  return (await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run()).meta?.changes || 0;
}

// how many, how many of the latest 200 not seen yet, and the latest (who, when)
export async function messageCounts(env) {
  await ensureTable(env);
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n,
    (SELECT COUNT(*) FROM (SELECT read_at FROM messages ORDER BY created_at DESC LIMIT ${SHOWN}) WHERE read_at IS NULL) AS unread,
    (SELECT name FROM messages ORDER BY created_at DESC LIMIT 1) AS lastName, MAX(created_at) AS lastAt FROM messages`).first();
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
