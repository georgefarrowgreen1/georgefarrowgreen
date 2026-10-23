// The signed-in account's photo, for the home page's top bar (functions/api/me): this site's pages only.
import { cookieUser } from "../../_account.js";
import { photoOf } from "../../_profile.js";
import { json } from "../../_auth.js";

export async function onRequestGet({ request, env }) {
  const u = await cookieUser(request, env).catch(() => null);
  const res = u && (await photoOf(env, u.id, { "Cross-Origin-Resource-Policy": "same-origin" }));
  return res || json({ error: "No photo." }, 404);
}
