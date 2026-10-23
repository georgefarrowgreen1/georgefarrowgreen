import { requireOwner, failed, json } from "../_auth.js";
import { getHistory, saveContent } from "../_content.js";

// The words as they were before each of the last saves (the owner only).
export async function onRequestGet({ request, env }) {
  try { await requireOwner(request, env, false); } catch (e) { return failed(e); }
  const history = await getHistory(env);
  return json({ versions: history.map((h, i) => ({ index: i, savedAt: h.savedAt, name: h.content && h.content.name })) });
}

// Back to one of them (0: as they were before the last save, which is the home page's Undo). What's there now is
// kept first, so going back can be undone too.
export async function onRequestPost({ request, env }) {
  try { await requireOwner(request, env); } catch (e) { return failed(e); }
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const entry = (await getHistory(env))[body.index];
  if (!entry) return json({ error: "Version not found." }, 404);
  return json({ ok: true, content: await saveContent(env, entry.content) });
}
