import { isAuthed, json } from "../_auth.js";
import { getContent, saveContent, sanitize } from "../_content.js";

// Public: anyone can read the bio.
export async function onRequestGet({ env }) {
  return json(await getContent(env));
}

// Protected: only an authenticated editor can write.
export async function onRequestPut({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return json({ error: "Not authorized." }, 401);
  }
  if (!env.BIO_KV) {
    return json({ error: "Storage isn't configured yet (no BIO_KV namespace bound)." }, 503);
  }

  let body = {};
  try { body = await request.json(); } catch (_) {
    return json({ error: "Invalid JSON." }, 400);
  }

  const clean = sanitize(body);
  await saveContent(env, clean);
  return json({ ok: true, content: clean });
}
