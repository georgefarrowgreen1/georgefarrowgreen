// The account's profile, the same in every app on the site (functions/_account.js): your photo, your name and your
// handle, and your email (your sign-in, kept as it is). Changed in any app, it's changed in all of them, by the same
// rules wherever: a name that can't pass for a web address or a handle, a handle changed at most once a day (the old
// one held for you for 30 days), a photo a JPEG of at most MAX_AVATAR (the app sends a 512px square, which also drops
// any location in it), at most 20 a day. The account's page shows the photo larger, as its card's poster: a copy of it
// at most 1600px across (MAX_POSTER), and the point of it that stays in view, chosen there.

import { HttpError, db, limit, DAY, HANDLE_RE, HANDLE_EVERY, MAX_AVATAR, MAX_POSTER, handleTaken, holdHandle, waitText, readCapped } from "./_pigeon.js";
export { waitText };

export const avatarKey = (id) => `pigeon-avatars/${id}`;
export const posterKey = (id) => `pigeon-posters/${id}`;

// Names go into emails and notifications other people get, so they can't look like a web address, an email or a handle.
export function cleanName(v, empty) {
  const name = String(v || "").normalize("NFC").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").trim().replace(/\s+/g, " ").slice(0, 50);
  if (!name) throw new HttpError(400, empty, "name");
  if (/[@/\\:<>]|\.\S|www\./i.test(name)) throw new HttpError(400, "Names can’t include web addresses or symbols like @ / :", "name");
  return name;
}
export async function setName(env, u, v) {
  const name = cleanName(v, "Your name can’t be empty.");
  await (await db(env)).prepare("UPDATE pg_users SET name = ? WHERE id = ?").bind(name, u.id).run();
  return name;
}
export async function setHandle(env, u, v) {
  const handle = String(v).trim().replace(/^@/, "").toLowerCase(), t = Date.now(), D = await db(env);
  if (!HANDLE_RE.test(handle)) throw new HttpError(400, "Use 3 to 20 letters, numbers or underscores.", "handle");
  if (handle === u.handle) return handle;
  if (u.handle_at && t - u.handle_at < HANDLE_EVERY) throw new HttpError(429, `You can change your handle once a day. Try again in ${waitText(u.handle_at + HANDLE_EVERY - t)}.`, "handle");
  if (await handleTaken(D, handle, u.id)) throw new HttpError(409, `@${handle} is taken.`, "handle");
  // the old one stays yours for 30 days: no one else can take it and get your friends' requests
  try { await D.batch([D.prepare("UPDATE pg_users SET handle = ?, handle_at = ? WHERE id = ?").bind(handle, t, u.id), holdHandle(D, u.handle, u.id),
    D.prepare("DELETE FROM pg_handles_held WHERE handle = ? AND user_id = ?").bind(handle, u.id)]); }
  catch (e) { if (String(e).includes("UNIQUE")) throw new HttpError(409, `@${handle} is taken.`, "handle"); throw e; }
  return handle;
}
// A new photo, from the request's body: → when it was set (the account's avatar_at)
export async function putPhoto(env, u, request) {
  if (!env.BIO_R2) throw new HttpError(503, "Photos aren’t set up on this server yet.");
  await limit(env, "avatar:" + u.id, 20, DAY);
  const bytes = await readCapped(request, MAX_AVATAR, "That picture is too large. Try another one.");
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new HttpError(400, "Profile pictures must be JPEG images.");
  const t = Date.now();
  await env.BIO_R2.put(avatarKey(u.id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
  // (a new photo, from any app: the poster of the last one goes; the account's page sends its own after this one)
  if (u.poster_at) await env.BIO_R2.delete(posterKey(u.id));
  await (await db(env)).prepare("UPDATE pg_users SET avatar_at = ?, poster_at = NULL, poster_focus = NULL WHERE id = ?").bind(t, u.id).run();
  return t;
}
export async function dropPhoto(env, u) {
  if (env.BIO_R2) await env.BIO_R2.delete([avatarKey(u.id), posterKey(u.id)]);
  await (await db(env)).prepare("UPDATE pg_users SET avatar_at = NULL, poster_at = NULL, poster_focus = NULL WHERE id = ?").bind(u.id).run();
}
// The point of the poster that stays in view: "x y" in percent, from "x,y" or { x, y } (the middle, if it's not one)
export function cleanFocus(v) {
  const [x, y] = (typeof v === "object" && v ? [v.x, v.y] : String(v || "").split(/[ ,]/)).map(Number);
  const ok = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
  return ok(x) && ok(y) ? `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}` : "50 50";
}
// The poster, from the request's body (a JPEG), with its focus: → when it was set (poster_at)
export async function putPoster(env, u, request, focus) {
  if (!env.BIO_R2) throw new HttpError(503, "Photos aren’t set up on this server yet.");
  if (!u.avatar_at) throw new HttpError(409, "Add a photo first.");
  await limit(env, "poster:" + u.id, 20, DAY);
  const bytes = await readCapped(request, MAX_POSTER, "That picture is too large. Try another one.");
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new HttpError(400, "Photos must be JPEG images.");
  const t = Date.now();
  await env.BIO_R2.put(posterKey(u.id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
  await (await db(env)).prepare("UPDATE pg_users SET poster_at = ?, poster_focus = ? WHERE id = ?").bind(t, cleanFocus(focus), u.id).run();
  return t;
}
export async function setFocus(env, u, focus) {
  const f = cleanFocus(focus);
  await (await db(env)).prepare("UPDATE pg_users SET poster_focus = ? WHERE id = ?").bind(f, u.id).run();
  return f;
}
// An account's photo, as a response (headers: any more for it), or null if there isn't one
export async function photoOf(env, id, headers = {}, key = avatarKey) {
  const obj = env.BIO_R2 && (await env.BIO_R2.get(key(id)));
  if (!obj) return null;
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", ...headers } });
}
