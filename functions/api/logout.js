import { sessionCookie, endSession, json } from "../_auth.js";

export async function onRequestPost({ request, env }) {
  await endSession(request, env).catch(() => {});
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
