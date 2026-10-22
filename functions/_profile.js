// The account's profile, the same in every app on the site (functions/_account.js): your photo, your name and your
// handle, and your email (your sign-in, kept as it is). Changed in any app, it's changed in all of them, by the same
// rules wherever: a name that can't pass for a web address or a handle, a handle changed at most once a day (the old
// one held for you for 30 days), a photo a JPEG of at most MAX_AVATAR (the app sends a 512px square, which also drops
// any location in it), at most 20 a day.

import { HttpError, db, limit, DAY, HANDLE_RE, HANDLE_EVERY, MAX_AVATAR, handleTaken, holdHandle } from "./_pigeon.js";

export const avatarKey = (id) => `pigeon-avatars/${id}`;

// "23h 5m", "12 minutes": how long until something's allowed again
export function waitText(ms) {
  const all = Math.max(1, Math.ceil(ms / 60e3)), h = Math.floor(all / 60), m = all % 60;      // (whole minutes first, so never "23h 60m")
  return h ? `${h}h ${m}m` : `${m} minute${m === 1 ? "" : "s"}`;
}
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
  if (Number(request.headers.get("Content-Length")) > MAX_AVATAR) throw new HttpError(413, "That picture is too large. Try another one.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_AVATAR) throw new HttpError(413, "That picture is too large. Try another one.");
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new HttpError(400, "Profile pictures must be JPEG images.");
  const t = Date.now();
  await env.BIO_R2.put(avatarKey(u.id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
  await (await db(env)).prepare("UPDATE pg_users SET avatar_at = ? WHERE id = ?").bind(t, u.id).run();
  return t;
}
export async function dropPhoto(env, u) {
  if (env.BIO_R2) await env.BIO_R2.delete(avatarKey(u.id));
  await (await db(env)).prepare("UPDATE pg_users SET avatar_at = NULL WHERE id = ?").bind(u.id).run();
}
// An account's photo, as a response (headers: any more for it), or null if there isn't one
export async function photoOf(env, id, headers = {}) {
  const obj = env.BIO_R2 && (await env.BIO_R2.get(avatarKey(id)));
  if (!obj) return null;
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", ...headers } });
}
