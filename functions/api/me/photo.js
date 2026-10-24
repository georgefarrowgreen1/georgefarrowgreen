// The signed-in account's photo, for the home page's top bar (functions/api/me): this site's pages only.
import { cookieUser } from "../../_account.js";
import { photoOf } from "../../_profile.js";
import { json } from "../../_auth.js";

export async function onRequestGet({ request, env }) {
  const u = await cookieUser(request, env).catch(() => null);
  // (asked for by when it was last changed, ?v=: that address only ever means this photo, so it's kept for good)
  const res = u && (await photoOf(env, u.id, { "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "private, max-age=31536000, immutable" }));
  return res || json({ error: "No photo." }, 404);
}
