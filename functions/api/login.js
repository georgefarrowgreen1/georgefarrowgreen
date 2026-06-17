import { passwordValid, createToken, sessionCookie, json } from "../_auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.EDIT_PASSWORD) {
    return json({ error: "Editing isn't configured yet (no EDIT_PASSWORD set)." }, 503);
  }
  let body = {};
  try { body = await request.json(); } catch (_) {}

  if (!(await passwordValid(body.password, env))) {
    return json({ error: "Incorrect password." }, 401);
  }

  const token = await createToken(env);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
}
