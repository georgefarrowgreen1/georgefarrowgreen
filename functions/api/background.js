import { requireOwner, failed, json } from "../_auth.js";

// Background photos for the home page's slideshow (its owner changes them there: functions/_auth.js).
//   Image bytes live in R2 (env.BIO_R2) when bound; otherwise KV. A photo never changes under its id, so it's kept
//   for good by browsers; "cover" (the first one for a phone or a computer) changes with the list, so only briefly.
//   Ordered list in KV: bg_list = JSON array of { id, focus ("x% y%"), device, m }. m: there's a phone-sized copy
//   too (R2 only, at bg/<id>-m), sent for ?s=m and to phones asking for the cover.
//   Legacy single image (KV key "background") migrated transparently.

const LIST = "bg_list";
const LEGACY = "background";
const KV_IMG = (id) => `bg:${id}`;
const R2_KEY = (id) => `bg/${id}`;
const DEFAULT_FOCUS = "50% 50%";
const MAX = 50;

function normalize(list) {
  return (list || []).map((e) =>
    typeof e === "string"
      ? { id: e, focus: DEFAULT_FOCUS, device: "both" }
      : { id: e.id, focus: e.focus || DEFAULT_FOCUS, device: e.device || "both", ...(e.m ? { m: 1 } : {}) }
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
  await env.BIO_KV.put(LIST, JSON.stringify(list.slice(0, MAX)));
}
// A change to the list (apply: false for none to make), made to it as it is and saved; the list, or null. KV takes one
// write a second to a key, so a change that comes sooner (a second tap on a tag) waits a moment and is made again to the
// list as it is then (so a change made meanwhile is kept, too).
export async function updateList(env, apply, wait = 1100) {
  for (let i = 0; ; i++) {
    const list = await getList(env);
    if (apply(list) === false) return null;
    try { await saveList(env, list); return list; }
    catch (e) { if (i || !/429/.test(String(e && e.message))) throw e; await new Promise((r) => setTimeout(r, wait)); }
  }
}
const unsaved = () => json({ error: "That couldn’t be saved just now. Try again." }, 503);
// A photo added at the end of the list as it is (for updateList): false, for none to add, when there are as many as
// there can be by then (another add, from another tab, say, saved while this one waited)
export const addPhoto = (entry) => (l) => { if (l.length >= MAX) return false; l.push(entry); };

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

export async function onRequestGet(ctx) {
  const { request, env } = ctx, url = new URL(request.url);
  let id = url.searchParams.get("id");
  if (!id) return json({ images: await getList(env) }, 200, { "Cache-Control": "no-store" });
  const cover = id === "cover", cache = cover ? "public, max-age=600" : "public, max-age=31536000, immutable";
  let small = url.searchParams.get("s") === "m";

  // "cover" resolves to the first image for the requested device — used for an
  // early <link rel=preload> so the first photo paints fast.
  if (cover) {
    const want = url.searchParams.get("d") === "mobile" ? "mobile" : "desktop";
    const list = await getList(env);
    const pick = list.find((e) => (e.device || "both") === "both" || e.device === want) || list[0];
    if (!pick) return new Response(null, { status: 404 });
    id = pick.id; small = want === "mobile" && !!pick.m;
  }
  if (!/^[\w-]{1,40}$/.test(id)) return new Response(null, { status: 404 });
  // A photo's bytes never change under its id, so its id is its tag: a browser asking again about the cover it has
  // (once its 10 minutes are up) is told it's the same, not sent it again, unless the cover's become another photo.
  const tag = `"bg-${id}${small ? "-m" : ""}"`;
  if ((request.headers.get("If-None-Match") || "").split(/\s*,\s*/).includes(tag)) return new Response(null, { status: 304, headers: { ETag: tag, "Cache-Control": cache } });
  // and kept at the edge by its id for a day, so it's read from storage once a day there, not for each visit (a day,
  // not for good: a photo taken off the page is gone from every edge by the next day)
  const edge = typeof caches !== "undefined" ? caches.default : null, key = new Request(`${url.origin}/api/background?id=${encodeURIComponent(id)}${small ? "&s=m" : ""}&edge=1`);
  const hit = await edge?.match(key).catch(() => null);
  if (hit) { const r = new Response(hit.body, hit); r.headers.set("Cache-Control", cache); r.headers.set("ETag", tag); return r; }

  if (env.BIO_R2) {
    const obj = (small && (await env.BIO_R2.get(R2_KEY(id) + "-m"))) || (await env.BIO_R2.get(R2_KEY(id)));
    if (obj) {
      const type = (obj.httpMetadata && obj.httpMetadata.contentType) || "image/jpeg";
      if (edge) {
        const [a, b] = obj.body.tee();
        ctx.waitUntil?.(edge.put(key, new Response(b, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } })).catch(() => {}));
        return new Response(a, { headers: { "Content-Type": type, "Cache-Control": cache, ETag: tag } });
      }
      return new Response(obj.body, { headers: { "Content-Type": type, "Cache-Control": cache, ETag: tag } });
    }
  }
  if (env.BIO_KV) {
    const parsed = dataUrlToBytes(await env.BIO_KV.get(id === "legacy" ? LEGACY : KV_IMG(id)));
    if (parsed) {
      return new Response(parsed.bytes, {
        headers: { "Content-Type": parsed.type, "Cache-Control": cache, ETag: tag },
      });
    }
  }
  return new Response(null, { status: 404 });
}
// (a link preview's first look: the same answer, without the photo)
export async function onRequestHead(ctx) {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}

export async function onRequestPut({ request, env }) {
  try { await requireOwner(request, env); } catch (e) { return failed(e); }
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON." }, 400); }
  const a = String(body.image || "");
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(a) || a.length > 8000000) {
    return json({ error: "Invalid or oversized image." }, 400);
  }
  // (refused before anything's stored: one past the most was cut from the list as it was saved, while the sheet showed
  // it added and its files stayed with nothing pointing to them; and asked again of the list as it's saved: addPhoto)
  if ((await getList(env)).length >= MAX) return json({ error: `There can be ${MAX} photos at most. Remove one first.` }, 400);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // (and a phone-sized copy, made by the page as it's added: phones are sent that, about a third of the size)
  const sm = String(body.small || ""), withSmall = !!env.BIO_R2 && /^data:image\/(jpeg|jpg|webp);base64,/.test(sm) && sm.length <= 3000000;
  if (env.BIO_R2) {
    const p = dataUrlToBytes(a);
    await env.BIO_R2.put(R2_KEY(id), p.bytes, { httpMetadata: { contentType: p.type } });
    if (withSmall) { const q = dataUrlToBytes(sm); await env.BIO_R2.put(R2_KEY(id) + "-m", q.bytes, { httpMetadata: { contentType: q.type } }); }
  } else {
    await env.BIO_KV.put(KV_IMG(id), a);
  }
  let list;
  try { list = await updateList(env, addPhoto({ id, focus: DEFAULT_FOCUS, device: "both", ...(withSmall ? { m: 1 } : {}) })); }
  catch (_) { list = undefined; }
  if (!list) {
    // (not in the list, so its files are taken away again: nothing would point to them, and nothing sweeps bg/)
    if (env.BIO_R2) await env.BIO_R2.delete([R2_KEY(id), R2_KEY(id) + "-m"]).catch(() => {});
    else await env.BIO_KV.delete(KV_IMG(id)).catch(() => {});
    return list === null ? json({ error: `There can be ${MAX} photos at most. Remove one first.` }, 400) : unsaved();
  }
  return json({ ok: true, id, images: list });
}

// Update a photo's focal point and/or device target:
//   { id, focus?: "x% y%", device?: "both"|"desktop"|"mobile" }
export async function onRequestPost({ request, env }) {
  try { await requireOwner(request, env); } catch (e) { return failed(e); }
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  let list;
  try {
    list = await updateList(env, (l) => {
      const entry = l.find((e) => e.id === body.id);
      if (!entry) return false;
      if (body.focus !== undefined) entry.focus = sanitizeFocus(body.focus);
      if (body.device !== undefined) {
        entry.device = ["both", "desktop", "mobile"].includes(body.device) ? body.device : "both";
      }
    });
  } catch (_) { return unsaved(); }
  if (!list) return json({ error: "Not found." }, 404);
  return json({ ok: true, images: list });
}

export async function onRequestDelete({ request, env }) {
  try { await requireOwner(request, env); } catch (e) { return failed(e); }
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const id = body.id;
  let list;
  try { list = await updateList(env, (l) => { const k = l.findIndex((e) => e.id === id); if (k >= 0) l.splice(k, 1); }); } catch (_) { return unsaved(); }
  if (env.BIO_R2) await env.BIO_R2.delete([R2_KEY(id), R2_KEY(id) + "-m"]);
  if (typeof caches !== "undefined") for (const s of ["", "&s=m"]) await caches.default.delete(new Request(`${new URL(request.url).origin}/api/background?id=${encodeURIComponent(id)}${s}&edge=1`)).catch(() => {});
  await env.BIO_KV.delete(id === "legacy" ? LEGACY : KV_IMG(id));
  return json({ ok: true, images: list });
}
