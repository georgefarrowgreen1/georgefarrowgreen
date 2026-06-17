import { isAuthed, json } from "../_auth.js";
import { getContent, getHistory, saveContent } from "../_content.js";

// List previous versions (auth only — it can include unpublished drafts).
export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  const history = await getHistory(env);
  return json({
    versions: history.map((h, i) => ({
      index: i,
      savedAt: h.savedAt,
      name: h.content && h.content.name,
      summary: (h.content && h.content.role) || "",
    })),
  });
}

// Restore a version by index. Current content is snapshotted first, so a
// restore is itself undoable.
export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const history = await getHistory(env);
  const entry = history[body.index];
  if (!entry) return json({ error: "Version not found." }, 404);

  await saveContent(env, entry.content);
  return json({ ok: true, content: entry.content });
}
