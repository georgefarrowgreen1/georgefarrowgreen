// Precision Fit Studio's own store (functions/_fitstudio.js serves the app): every fit kept here as well as on the iPad
// that recorded it, so a lost or cleared device loses nothing and Kate's fits are on Matt's iPad too. Only for someone
// signed in to the Fit Studio; a change only from the app's own pages.
//
// A fit: one row of pf_fits (D1, the site's DB; the table made the first time it's needed), what the app holds for it as
// JSON, its photos apart in R2 (BIO_R2, fitting/photos/<fit>/<photo>, as sent: JPEG). A fit taken away leaves its id and
// when (deleted), its data and photos gone, so every other device lets it go too.
//
//   GET    api/fits                 every fit: {fits: [{id, updated, deleted}]}
//   GET    api/fits/<id>            one fit: {fit: {...}, updated}
//   PUT    api/fits/<id>            keep a fit {fit: {...}}: the newer of it and what's here stays (its `updated`); 409 with ours when ours is newer
//   DELETE api/fits/<id>            take a fit away, photos and all
//   PUT    api/photos/<fit>/<photo> keep a photo (its bytes)
//   GET    api/photos/<fit>/<photo> a photo

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_FIT = 1_500_000, MAX_PHOTO = 15_000_000;
const PHOTO_TYPES = /^image\/(jpeg|png|webp)$/;
let made = false;
async function table(env) {
  if (made) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pf_fits (id TEXT PRIMARY KEY, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
    by TEXT, name TEXT, email TEXT, bike TEXT, fit TEXT, date TEXT, follow_of TEXT, data TEXT)`).run();
  made = true;
}
const photoKey = (fit, photo) => `fitting/photos/${fit}/${photo}`;

// `what`: the path after api/; `me`: who's signed in; `json`/`plain`: the app's own responses (its headers)
export async function fitStore(ctx, url, what, me, { json, plain }) {
  const req = ctx.request, env = ctx.env, m = req.method;
  if (!me) return json(401, { error: "Sign in first." });
  if (!env.DB) return json(503, { error: "The studio’s store isn’t connected." });
  if (m !== "GET" && m !== "HEAD" && req.headers.get("Origin") !== url.origin) return json(403, { error: "Only from the Fit Studio’s own pages." });
  const parts = what.split("/");
  await table(env);

  if (parts[0] === "fits" && parts.length === 1) {
    if (m !== "GET") return plain(405, "GET only.");
    const { results } = await env.DB.prepare("SELECT id, updated, deleted FROM pf_fits").all();
    return json(200, { fits: results.map((r) => ({ id: r.id, updated: Number(r.updated), deleted: !!r.deleted })) });
  }

  if (parts[0] === "fits" && parts.length === 2 && ID.test(parts[1])) {
    const id = parts[1];
    const row = await env.DB.prepare("SELECT updated, deleted, data FROM pf_fits WHERE id = ?").bind(id).first();
    if (m === "GET") {
      if (!row || row.deleted) return json(404, { error: "No such fit." });
      return json(200, { fit: JSON.parse(row.data), updated: Number(row.updated) });
    }
    if (m === "PUT") {
      const text = await req.text();
      if (text.length > MAX_FIT) return json(413, { error: "That fit is too big to keep." });
      let fit; try { fit = JSON.parse(text).fit; } catch (_) { fit = null; }
      if (!fit || typeof fit !== "object" || fit.id !== id || !Number.isFinite(fit.updated)) return json(400, { error: "Send the fit, its id and when it changed." });
      // (the newer wins: a device that was offline with an older copy doesn't undo another's work, nor bring back a fit
      // taken away since; one changed after it was taken away is kept again)
      if (row && Number(row.updated) > fit.updated) return json(409, { updated: Number(row.updated), deleted: !!row.deleted });
      fit.photos = (Array.isArray(fit.photos) ? fit.photos : []).filter((p) => p && ID.test(String(p.id))).map(({ src, _comp, up, ...p }) => p);
      delete fit.synced;
      const v = fit.v || {}, name = [v.first, v.last].filter(Boolean).join(" ");
      await env.DB.prepare(`INSERT INTO pf_fits (id, updated, deleted, by, name, email, bike, fit, date, follow_of, data) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated = excluded.updated, deleted = 0, by = excluded.by, name = excluded.name, email = excluded.email, bike = excluded.bike,
        fit = excluded.fit, date = excluded.date, follow_of = excluded.follow_of, data = excluded.data`)
        .bind(id, fit.updated, me, str(name), str(v.email), str(v.bike), str(fit.fit), str(v.date), str(fit.follow && fit.follow.of), JSON.stringify(fit)).run();
      // (a photo taken out of the fit: its file goes too)
      if (row && row.data && env.BIO_R2) {
        const now = new Set(fit.photos.map((p) => String(p.id)));
        const gone = ((JSON.parse(row.data || "{}").photos) || []).map((p) => String(p.id)).filter((p) => ID.test(p) && !now.has(p));
        if (gone.length) await env.BIO_R2.delete(gone.map((p) => photoKey(id, p)));
      }
      return json(200, { updated: fit.updated });
    }
    if (m === "DELETE") {
      if (row && !row.deleted) {
        const photos = ((JSON.parse(row.data || "{}").photos) || []).map((p) => String(p.id)).filter((p) => ID.test(p));
        if (photos.length && env.BIO_R2) await env.BIO_R2.delete(photos.map((p) => photoKey(id, p)));
      }
      await env.DB.prepare(`INSERT INTO pf_fits (id, updated, deleted, by, data) VALUES (?, ?, 1, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET updated = excluded.updated, deleted = 1, by = excluded.by, name = NULL, email = NULL, bike = NULL, data = NULL`)
        .bind(id, Date.now(), me).run();
      return json(200, { ok: true });
    }
    return plain(405, "GET, PUT or DELETE.");
  }

  if (parts[0] === "photos" && parts.length === 3 && ID.test(parts[1]) && ID.test(parts[2])) {
    if (!env.BIO_R2) return json(503, { error: "The studio’s photo store isn’t connected." });
    const key = photoKey(parts[1], parts[2]);
    if (m === "GET") {
      const o = await env.BIO_R2.get(key);
      if (!o) return json(404, { error: "No such photo." });
      return new Response(o.body, { headers: { "Content-Type": (o.httpMetadata && o.httpMetadata.contentType) || "image/jpeg", "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
    }
    if (m === "PUT") {
      const type = (req.headers.get("Content-Type") || "").split(";")[0].trim();
      if (!PHOTO_TYPES.test(type)) return json(415, { error: "A JPEG, PNG or WebP photo only." });
      const row = await env.DB.prepare("SELECT deleted FROM pf_fits WHERE id = ?").bind(parts[1]).first();
      if (row && row.deleted) return json(409, { error: "That fit was deleted.", deleted: true });
      const body = await req.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_PHOTO) return json(413, { error: "That photo is too big to keep." });
      await env.BIO_R2.put(key, body, { httpMetadata: { contentType: type } });
      return json(200, { ok: true });
    }
    return plain(405, "GET or PUT.");
  }
  return json(404, { error: "Not found." });
}
const str = (x) => (x == null || x === "" ? null : String(x).slice(0, 300));
