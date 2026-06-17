import { isAuthed, json } from "../_auth.js";

// Large hero background image, stored separately from content (so it doesn't
// bloat the content JSON or version history). Stored as a data URL in KV under
// "background"; served as a real image with a content-type.

const KEY = "background";

export async function onRequestGet({ env }) {
  if (!env.BIO_KV) return new Response(null, { status: 404 });
  const dataUrl = await env.BIO_KV.get(KEY);
  if (!dataUrl) return new Response(null, { status: 404 });
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return new Response(null, { status: 404 });
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300" },
  });
}

export async function onRequestPut({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON." }, 400); }
  const a = String(body.image || "");
  // Accept inline image data URLs up to ~3 MB of base64.
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(a) || a.length > 4000000) {
    return json({ error: "Invalid or oversized image." }, 400);
  }
  await env.BIO_KV.put(KEY, a);
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (env.BIO_KV) await env.BIO_KV.delete(KEY);
  return json({ ok: true });
}
