import { adminOf } from "./api/pigeon/[[path]].js";

// Atlas calls these internal account APIs through the APPS service binding.
// The binding keeps traffic inside Cloudflare; the shared bearer credential is
// the authentication boundary. Browser cookies never grant access here.
export function atlasServiceStatus(request, env) {
  if (request.method !== "POST") return 405;
  if (new URL(request.url).hostname !== "account.inflite.ai") return 404;
  const key = env.ATLAS_VERIFY_KEY;
  if (typeof key !== "string" || key.length < 32) return 503;
  const supplied = request.headers.get("Authorization") || "", expected = "Bearer " + key;
  if (supplied.length !== expected.length) return 403;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch ? 403 : 0;
}

export async function atlasOwner(env, owner) {
  const admin = await adminOf(env);
  return admin && String(admin.id) === owner && Number(admin.passkeys) > 0 ? admin : null;
}
