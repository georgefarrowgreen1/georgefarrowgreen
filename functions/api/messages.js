import { isAuthed, json } from "../_auth.js";

// Contact submissions stored in D1 (env.DB). Table is created on demand.

async function ensureTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS messages (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "name TEXT, email TEXT, body TEXT, created_at INTEGER)"
  ).run();
}

// Used by the contact Function.
export async function saveMessage(env, { name, email, body }) {
  await ensureTable(env);
  await env.DB.prepare(
    "INSERT INTO messages (name, email, body, created_at) VALUES (?, ?, ?, ?)"
  ).bind(name, email, body, Date.now()).run();
}

// List messages (owner only).
export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.DB) return json({ error: "Database not configured (DB)." }, 503);
  await ensureTable(env);
  const { results } = await env.DB.prepare(
    "SELECT id, name, email, body, created_at FROM messages ORDER BY created_at DESC LIMIT 200"
  ).all();
  return json({ messages: results || [] });
}

// Delete a message by id (owner only).
export async function onRequestDelete({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.DB) return json({ error: "Database not configured (DB)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  await ensureTable(env);
  await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(body.id).run();
  return json({ ok: true });
}
