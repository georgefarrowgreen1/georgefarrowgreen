import { requireOwner, failed, json } from "../_auth.js";
import { getContent, saveContent, sanitize } from "../_content.js";

// Public: anyone can read the home page's words.
export async function onRequestGet({ env }) {
  return json(await getContent(env));
}

// Only the site's owner (signed in as the admin account) can change them.
export async function onRequestPut({ request, env }) {
  try { await requireOwner(request, env); } catch (e) { return failed(e); }
  if (!env.BIO_KV) return json({ error: "Storage isn't configured yet (no BIO_KV namespace bound)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON." }, 400); }
  return json({ ok: true, content: await saveContent(env, sanitize(body)) });
}
