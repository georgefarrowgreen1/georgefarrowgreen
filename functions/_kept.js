// Encrypted shared settings in D1, opened by Workers with PIGEON_PEPPER_KEY.
// Explicit Worker settings always win, including empty overrides used to disable a stored value.
// keepSecrets supports provisioning from an environment with the pepper and key; fillSecrets opens
// the existing copy once per server instance. Neither keys, pepper nor platform metadata are stored.
// keptCount exposes only the count for Admin Insights.
import { hex, sha256, b64url, fromB64url, db } from "./_pigeon.js";

const enc = new TextEncoder(), dec = new TextDecoder(), AAD = enc.encode("inflight/at-rest/secrets|v1");
const keyOf = (env) => (typeof env?.PIGEON_PEPPER_KEY === "string" && env.PIGEON_PEPPER_KEY.length >= 32 ? env.PIGEON_PEPPER_KEY : null);
const NOT = new Set(["PIGEON_PEPPER", "PIGEON_PEPPER_KEY", "TICK_HOST"]);
const carried = (env) => Object.keys(env).filter((k) => typeof env[k] === "string" && /^[A-Z][A-Z0-9_]*$/.test(k) && !NOT.has(k) && !k.startsWith("CF_")).sort();
async function box(k) {
  const base = await crypto.subtle.importKey("raw", enc.encode(k), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("inflight/at-rest/secrets/v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
// (the kept copy, as it's kept, still locked: from KV's copy nearest this server where it's there, else from the database,
// and then copied to KV. A new copy of the server asks for it before its first request, so this saves most requests on a
// quiet site a trip to the database. The same locked text in either place: KV's copy opens no more than the database's)
const KV_KEY = "site:kept_secrets";
async function keptText(env) {
  try { const v = env.BIO_KV ? await env.BIO_KV.get(KV_KEY, { cacheTtl: 86400 }) : null; if (typeof v === "string" && v.startsWith("k1:")) return v; } catch (_) {}
  // (pg_meta, straight: it's been there since the first, so no schema check needed first)
  const row = await env.DB?.prepare("SELECT v FROM pg_meta WHERE k = 'secrets'").first().catch(() => null);
  const v = row && String(row.v).startsWith("k1:") ? String(row.v) : null;
  if (v && env.BIO_KV) await env.BIO_KV.put(KV_KEY, v).catch(() => {});
  return v;
}
async function opened(env, k) {
  const v = await keptText(env);
  if (!v) return null;
  try { const all = fromB64url(v.slice(3)); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: AAD }, await box(k), all.slice(12)))); }
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
    if (env.BIO_KV) await env.BIO_KV.delete(KV_KEY).catch(() => {});
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
