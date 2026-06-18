import { isAuthed, json } from "../_auth.js";

// Background photos for the hero carousel. Multiple images supported.
//   bg_list   -> JSON array of image ids (order = slideshow order)
//   bg:<id>   -> data URL for each image
//   background-> legacy single image (migrated transparently as id "legacy")

const LIST = "bg_list";
const LEGACY = "background";
const IMG = (id) => `bg:${id}`;

async function getList(env) {
  if (!env.BIO_KV) return [];
  const v = await env.BIO_KV.get(LIST);
  if (v) return JSON.parse(v);
  const legacy = await env.BIO_KV.get(LEGACY);
  return legacy ? ["legacy"] : [];
}

function imageResponse(dataUrl) {
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) return new Response(null, { status: 404 });
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300" },
  });
}

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ images: await getList(env) });
  if (!env.BIO_KV) return new Response(null, { status: 404 });
  const dataUrl = await env.BIO_KV.get(id === "legacy" ? LEGACY : IMG(id));
  if (!dataUrl) return new Response(null, { status: 404 });
  return imageResponse(dataUrl);
}

export async function onRequestPut({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON." }, 400); }
  const a = String(body.image || "");
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(a) || a.length > 4000000) {
    return json({ error: "Invalid or oversized image." }, 400);
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await env.BIO_KV.put(IMG(id), a);
  const list = await getList(env);
  list.push(id);
  await env.BIO_KV.put(LIST, JSON.stringify(list.slice(0, 20)));
  return json({ ok: true, id, images: list });
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = body.id;
  const list = (await getList(env)).filter((x) => x !== id);
  await env.BIO_KV.put(LIST, JSON.stringify(list));
  await env.BIO_KV.delete(id === "legacy" ? LEGACY : IMG(id));
  return json({ ok: true, images: list });
}
