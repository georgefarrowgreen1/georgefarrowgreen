// The move off Pages (.tools/workers/README.md): the Pages project's variables and secrets carried to the site's
// Workers the way the passwords' pepper is (functions/_atrest.js), so nothing need be typed in again (Cloudflare never
// shows a secret once it's set). Both have PIGEON_PEPPER_KEY, the owner's own key:
//   - the Pages project (it has PIGEON_PEPPER, which the Workers never do) keeps every one of its own in the database,
//     locked with a key from PIGEON_PEPPER_KEY (pg_meta "secrets": AES-256-GCM), kept again whenever one changes;
//   - a Worker (PIGEON_PEPPER_KEY, no PIGEON_PEPPER) opens them, and gives itself each one it hasn't got set of its own
//     (one set on the Worker always wins).
// They never leave the account's database, nor are they ever written anywhere readable; a copy of the database alone
// opens nothing. Not carried: the pepper (functions/_atrest.js carries that), the key itself, and Pages' own (CF_PAGES*).
//   keepSecrets(env)    on the Pages project, once per copy of the server: what it has, kept
//   fillSecrets(env)    on a Worker, first thing for every request: what it hasn't got, given (opened once, then held)
//   keptCount(env)      how many are kept (for Admin's Insights; never a name or a value)
import { hex, sha256, b64url, fromB64url, db } from "./_pigeon.js";

const enc = new TextEncoder(), dec = new TextDecoder(), AAD = enc.encode("inflight/at-rest/secrets|v1");
const keyOf = (env) => (typeof env?.PIGEON_PEPPER_KEY === "string" && env.PIGEON_PEPPER_KEY.length >= 32 ? env.PIGEON_PEPPER_KEY : null);
const NOT = new Set(["PIGEON_PEPPER", "PIGEON_PEPPER_KEY", "TICK_HOST"]);
const carried = (env) => Object.keys(env).filter((k) => typeof env[k] === "string" && /^[A-Z][A-Z0-9_]*$/.test(k) && !NOT.has(k) && !k.startsWith("CF_PAGES")).sort();
async function box(k) {
  const base = await crypto.subtle.importKey("raw", enc.encode(k), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("inflight/at-rest/secrets/v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function opened(env, k) {
  const row = await (await db(env)).prepare("SELECT v FROM pg_meta WHERE k = 'secrets'").first();
  if (!row || !String(row.v).startsWith("k1:")) return null;
  try { const all = fromB64url(row.v.slice(3)); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: AAD }, await box(k), all.slice(12)))); }
  catch (_) { return null; }
}

let keptAs = null;
export async function keepSecrets(env) {
  const k = keyOf(env);
  if (!k || !env.PIGEON_PEPPER) return;
  const now = Object.fromEntries(carried(env).map((n) => [n, env[n]])), id = hex(await sha256(k + "|" + JSON.stringify(now)));
  if (keptAs === id) return;
  const was = await opened(env, k);
  if (JSON.stringify(was) !== JSON.stringify(now)) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const d = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, await box(k), enc.encode(JSON.stringify(now))));
    const out = new Uint8Array(12 + d.length); out.set(iv); out.set(d, 12);
    await (await db(env)).prepare("INSERT INTO pg_meta (k, v) VALUES ('secrets', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind("k1:" + b64url(out)).run();
  }
  keptAs = id;
}

let held = null;
export async function fillSecrets(env) {
  const k = keyOf(env);
  if (!k || env.PIGEON_PEPPER) return env;
  if (held?.k !== k) {
    const got = await opened(env, k).catch(() => null);
    // (none kept yet: asked again on a later request, not held as none)
    if (!got) return env;
    held = { k, got };
  }
  for (const [n, v] of Object.entries(held.got)) if (env[n] === undefined && !NOT.has(n) && typeof v === "string") env[n] = v;
  return env;
}

export async function keptCount(env) {
  const k = keyOf(env);
  if (!k) return 0;
  const got = await opened(env, k).catch(() => null);
  return got ? Object.keys(got).length : 0;
}
