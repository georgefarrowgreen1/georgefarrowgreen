import { isAuthed, json } from "../_auth.js";

export async function onRequestGet({ request, env }) {
  return json({ authed: await isAuthed(request, env) });
}
