/* ---------- secrets at rest ----------
   What the database keeps of each password is a hash of its proof and the
   private key it locks (the "vault"): together enough to guess the password
   offline, given a copy of the database. So both are locked again with
   PIGEON_PEPPER, a secret kept in Cloudflare (Settings → Variables and Secrets)
   and never in the database: a copy of the database alone is no use.

   - A proof's hash becomes "p1:" + HMAC(pepper, SHA-256(proof)), so one stored
     before (SHA-256(proof)) can be locked without knowing the proof.
   - A vault (and each passkey's copy) becomes "w1:" + AES-256-GCM under a key
     from the pepper, bound to the account, so one can't be moved to another.
   - Without PIGEON_PEPPER set, everything stays as it was. Once set it must
     never change or be lost: every password would stop working. */
import { hex, sha256, b64url, fromB64url } from "./_pigeon.js";

const enc = new TextEncoder(), dec = new TextDecoder();
let made = null;
async function keys(env) {
  const p = env.PIGEON_PEPPER;
  if (!p) return null;
  if (made?.p === p) return made;
  const base = await crypto.subtle.importKey("raw", enc.encode(p), "HKDF", false, ["deriveKey"]);
  const derive = (info, alg, uses) => crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(info) }, base, alg, false, uses);
  made = {
    p,
    mac: await derive("inflight/at-rest/proof/v1", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]),
    box: await derive("inflight/at-rest/vault/v1", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
  };
  return made;
}
export const pepperOn = (env) => !!env.PIGEON_PEPPER;
const locked = (s, tag) => typeof s === "string" && s.startsWith(tag);
function missing() { throw new Error("PIGEON_PEPPER is needed to read what it locked, and isn't set"); }

// a proof's hash as it's stored now, from the hash as it was stored before (hex SHA-256)
async function lockHash(env, plainHex) {
  const k = await keys(env); if (!k) return plainHex;
  return "p1:" + hex(new Uint8Array(await crypto.subtle.sign("HMAC", k.mac, enc.encode(plainHex))));
}
// what to store for a password's proof (base64url, as the phone sends it)
export const proofHash = async (env, proof) => lockHash(env, hex(await sha256(fromB64url(String(proof || "")))));
// whether a proof matches what's stored (either form), in constant time
export async function proofOk(env, proof, stored) {
  const plain = hex(await sha256(fromB64url(String(proof || ""))));
  if (locked(stored, "p1:")) { if (!pepperOn(env)) missing(); return same(await lockHash(env, plain), stored); }
  return same(plain, String(stored || ""));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// a vault (the password's, or a passkey's) as stored, and back
export async function lockVault(env, owner, vault) {
  if (vault == null) return vault;
  const k = await keys(env); if (!k || locked(vault, "w1:")) return vault;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const d = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("inflight/at-rest/v1|" + owner) }, k.box, enc.encode(vault)));
  const out = new Uint8Array(12 + d.length); out.set(iv); out.set(d, 12);
  return "w1:" + b64url(out);
}
export async function openVault(env, owner, stored) {
  if (!locked(stored, "w1:")) return stored;
  const k = await keys(env); if (!k) missing();
  const all = fromB64url(stored.slice(3));
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: enc.encode("inflight/at-rest/v1|" + owner) }, k.box, all.slice(12)));
}

// Locks what was stored before the pepper was set, a batch at a time (from the minute tick).
export async function lockOldSecrets(D, env) {
  if (!pepperOn(env)) return 0;
  const { results: us } = await D.prepare("SELECT id, proof_hash, vault FROM pg_users WHERE proof_hash NOT LIKE 'p1:%' OR vault NOT LIKE 'w1:%' LIMIT 100").all();
  const { results: pks } = await D.prepare("SELECT id, user_id, vault FROM pg_passkeys WHERE vault IS NOT NULL AND vault NOT LIKE 'w1:%' LIMIT 100").all();
  const st = [];
  for (const u of us) st.push(D.prepare("UPDATE pg_users SET proof_hash = ?, vault = ? WHERE id = ? AND proof_hash = ? AND vault = ?")
    .bind(locked(u.proof_hash, "p1:") ? u.proof_hash : await lockHash(env, u.proof_hash), await lockVault(env, u.id, u.vault), u.id, u.proof_hash, u.vault));
  for (const p of pks) st.push(D.prepare("UPDATE pg_passkeys SET vault = ? WHERE id = ? AND vault = ?").bind(await lockVault(env, p.user_id, p.vault), p.id, p.vault));
  // (and Fitness's Garmin keys and tokens, as functions/_garmin.js locks them: to the account, as Fitness's)
  const { results: gs } = await D.prepare("SELECT user_id, apikey, token FROM fx_garmin WHERE apikey NOT LIKE 'w1:%' OR (token IS NOT NULL AND token NOT LIKE 'w1:%') LIMIT 100").all().catch(() => ({ results: [] }));
  for (const g of gs) { const o = "fitness/garmin|" + g.user_id;
    st.push(D.prepare("UPDATE fx_garmin SET apikey = ?, token = ? WHERE user_id = ? AND apikey = ? AND token IS ?").bind(await lockVault(env, o, g.apikey), await lockVault(env, o, g.token), g.user_id, g.apikey, g.token)); }
  // (and Strava's tokens, as functions/_strava.js locks them)
  const { results: ss } = await D.prepare("SELECT user_id, access, refresh FROM fx_strava WHERE access NOT LIKE 'w1:%' OR refresh NOT LIKE 'w1:%' LIMIT 100").all().catch(() => ({ results: [] }));
  for (const g of ss) { const o = "fitness/strava|" + g.user_id;
    st.push(D.prepare("UPDATE fx_strava SET access = ?, refresh = ? WHERE user_id = ? AND access = ? AND refresh = ?").bind(await lockVault(env, o, g.access), await lockVault(env, o, g.refresh), g.user_id, g.access, g.refresh)); }
  if (st.length) await D.batch(st);
  return st.length;
}
