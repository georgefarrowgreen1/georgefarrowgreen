import { requireOwner, failed, json } from "../_auth.js";
import { getContent, saveContent, sanitize, tooLong, LIMITS } from "../_content.js";

const LABEL = { role: "The line above the name", name: "The name", bio: "The line under the name" };

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
  // (a line that's too long is refused, naming it, so the page keeps what was typed and goes back to editing it)
  const clean = sanitize(body), over = tooLong(clean);
  if (over) return json({ error: `${LABEL[over]} is too long: ${LIMITS[over]} characters at most.`, field: over }, 400);
  return json({ ok: true, content: await saveContent(env, clean) });
}
