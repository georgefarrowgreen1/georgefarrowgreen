import { sessionCookie, json } from "../_auth.js";

export async function onRequestPost() {
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
