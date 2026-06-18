import { isAuthed, json } from "../_auth.js";

// Background photos for the hero carousel.
//   Image bytes live in R2 (env.BIO_R2) when bound; otherwise KV.
//   Ordered list in KV: bg_list = JSON array of { id, focus } ("x% y%").
//   Legacy single image (KV key "background") migrated transparently.

const LIST = "bg_list";
const LEGACY = "background";
const KV_IMG = (id) => `bg:${id}`;
const R2_KEY = (id) => `bg/${id}`;
const DEFAULT_FOCUS = "50% 50%";

function normalize(list) {
  return (list || []).map((e) =>
    typeof e === "string"
      ? { id: e, focus: DEFAULT_FOCUS, device: "both" }
      : { id: e.id, focus: e.focus || DEFAULT_FOCUS, device: e.device || "both" }
  );
}

async function getList(env) {
  if (!env.BIO_KV) return [];
  const v = await env.BIO_KV.get(LIST);
  if (v) return normalize(JSON.parse(v));
  const legacy = await env.BIO_KV.get(LEGACY);
  return legacy ? [{ id: "legacy", focus: DEFAULT_FOCUS, device: "both" }] : [];
}

async function saveList(env, list) {
  await env.BIO_KV.put(LIST, JSON.stringify(list.slice(0, 50)));
}

function dataUrlToBytes(a) {
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(a || "");
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1], bytes };
}

function sanitizeFocus(f) {
  const m = /^\s*(\d{1,3})%\s+(\d{1,3})%\s*$/.exec(String(f || ""));
  if (!m) return DEFAULT_FOCUS;
  const x = Math.min(100, parseInt(m[1], 10));
  const y = Math.min(100, parseInt(m[2], 10));
  return `${x}% ${y}%`;
}

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ images: await getList(env) });

  if (env.BIO_R2) {
    const obj = await env.BIO_R2.get(R2_KEY(id));
    if (obj) {
      return new Response(obj.body, {
        headers: {
          "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "image/jpeg",
          "Cache-Control": "public, max-age=600",
        },
      });
    }
  }
  if (env.BIO_KV) {
    const parsed = dataUrlToBytes(await env.BIO_KV.get(id === "legacy" ? LEGACY : KV_IMG(id)));
    if (parsed) {
      return new Response(parsed.bytes, {
        headers: { "Content-Type": parsed.type, "Cache-Control": "public, max-age=600" },
      });
    }
  }
  return new Response(null, { status: 404 });
}

export async function onRequestPut({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON." }, 400); }
  const a = String(body.image || "");
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(a) || a.length > 8000000) {
    return json({ error: "Invalid or oversized image." }, 400);
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  if (env.BIO_R2) {
    const p = dataUrlToBytes(a);
    await env.BIO_R2.put(R2_KEY(id), p.bytes, { httpMetadata: { contentType: p.type } });
  } else {
    await env.BIO_KV.put(KV_IMG(id), a);
  }
  const list = await getList(env);
  list.push({ id, focus: DEFAULT_FOCUS, device: "both" });
  await saveList(env, list);
  return json({ ok: true, id, images: list });
}

// Update a photo's focal point and/or device target:
//   { id, focus?: "x% y%", device?: "both"|"desktop"|"mobile" }
export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const list = await getList(env);
  const entry = list.find((e) => e.id === body.id);
  if (!entry) return json({ error: "Not found." }, 404);
  if (body.focus !== undefined) entry.focus = sanitizeFocus(body.focus);
  if (body.device !== undefined) {
    entry.device = ["both", "desktop", "mobile"].includes(body.device) ? body.device : "both";
  }
  await saveList(env, list);
  return json({ ok: true, images: list });
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = body.id;
  const list = (await getList(env)).filter((e) => e.id !== id);
  await saveList(env, list);
  if (env.BIO_R2) await env.BIO_R2.delete(R2_KEY(id));
  await env.BIO_KV.delete(id === "legacy" ? LEGACY : KV_IMG(id));
  return json({ ok: true, images: list });
}
