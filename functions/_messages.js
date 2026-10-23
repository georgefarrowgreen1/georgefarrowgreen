// What's sent through the home page's Get in touch (functions/api/contact.js): kept in D1 as well as emailed, and read
// in Admin on the owner's account page (functions/api/pigeon admin-messages). The table's made the first time it's needed.

async function ensureTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS messages (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "name TEXT, email TEXT, body TEXT, created_at INTEGER)"
  ).run();
}

export async function saveMessage(env, { name, email, body }) {
  await ensureTable(env);
  await env.DB.prepare(
    "INSERT INTO messages (name, email, body, created_at) VALUES (?, ?, ?, ?)"
  ).bind(name, email, body, Date.now()).run();
}

// the latest 200, newest first
export async function listMessages(env) {
  await ensureTable(env);
  const { results } = await env.DB.prepare(
    "SELECT id, name, email, body, created_at FROM messages ORDER BY created_at DESC LIMIT 200"
  ).all();
  return results || [];
}

export async function dropMessage(env, id) {
  await ensureTable(env);
  return (await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run()).meta?.changes || 0;
}
