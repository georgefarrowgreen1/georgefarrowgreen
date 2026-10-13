// GIF search for InFlight, through this server so GIPHY never sees who is
// searching: it gets the search words from this server, not from anyone's
// phone, and the GIFs themselves are fetched here too. A GIF someone picks is
// then sent like any other: sealed on their phone, so GIPHY never learns what
// was sent, or to whom.
//
// Needs the secret GIPHY_API_KEY (free from developers.giphy.com). Without it
// the app hides its GIF button. GIPHY_API_URL / GIPHY_MEDIA_URL: tests only.

import { HttpError, json, limit, requireUser } from "./_pigeon.js";

const GIF_ID = /^[A-Za-z0-9]{5,40}$/;
const MAX_GIF = 8 * 1024 * 1024;
export const gifsReady = (env) => !!env.GIPHY_API_KEY;

async function search({ request, env }) {
  const u = await requireUser(request, env);
  if (!gifsReady(env)) throw new HttpError(503, "GIF search isn’t set up yet.");
  await limit(env, "gifq:" + u.id, 300, 60 * 60e3);
  const q = new URL(request.url).searchParams;
  const term = String(q.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const offset = Math.max(0, Math.min(4900, Math.floor(Number(q.get("offset")) || 0)));
  const api = new URL(`${env.GIPHY_API_URL || "https://api.giphy.com"}/v1/gifs/${term ? "search" : "trending"}`);
  api.searchParams.set("api_key", env.GIPHY_API_KEY);
  if (term) api.searchParams.set("q", term);
  api.searchParams.set("limit", "24"); api.searchParams.set("offset", String(offset)); api.searchParams.set("rating", "pg-13");
  let d;
  try {
    const r = await fetch(api, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    d = await r.json();
  } catch (_) { throw new HttpError(502, "GIF search isn’t answering right now. Try again in a moment."); }
  const list = Array.isArray(d.data) ? d.data : [];
  const gifs = list.filter((g) => GIF_ID.test(String(g.id || ""))).map((g) => {
    const fw = g.images?.fixed_width || {};
    return { id: g.id, title: String(g.title || "").slice(0, 80), w: Number(fw.width) || 200, h: Number(fw.height) || 200 };
  });
  const total = Number(d.pagination?.total_count) || 0;
  return json({ gifs, next: list.length && offset + list.length < Math.min(total || Infinity, 4999) ? offset + list.length : null });
}

// One GIF, fetched from GIPHY by this server: a small moving preview for the
// picker ("p"), or the GIF to send ("f", GIPHY's under-2 MB version).
async function file({ request, env }, id) {
  const u = await requireUser(request, env);
  if (!gifsReady(env)) throw new HttpError(503, "GIF search isn’t set up yet.");
  if (!GIF_ID.test(String(id || ""))) throw new HttpError(404, "No such GIF.");
  await limit(env, "giff:" + u.id, 1500, 60 * 60e3);
  const full = new URL(request.url).searchParams.get("s") === "f";
  const name = full ? "giphy-downsized.gif" : "200w.webp";
  let r;
  try { r = await fetch(`${env.GIPHY_MEDIA_URL || "https://media.giphy.com"}/media/${id}/${name}`, { cf: { cacheTtl: 86400, cacheEverything: true } }); }
  catch (_) { throw new HttpError(502, "That GIF didn’t load. Try another."); }
  const type = (r.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!r.ok || !["image/gif", "image/webp"].includes(type)) throw new HttpError(502, "That GIF didn’t load. Try another.");
  if (Number(r.headers.get("Content-Length")) > MAX_GIF) throw new HttpError(413, "That GIF is too big to send.");
  const bytes = await r.arrayBuffer();
  if (bytes.byteLength > MAX_GIF) throw new HttpError(413, "That GIF is too big to send.");
  return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

export const GIF_ROUTES = { "GET gif-search": search, "GET gif": file };
