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
     never change or be lost: every password would stop working.
   - Moving the site to another Cloudflare project (Pages to a Worker, .tools/workers/README.md), where it can't
     be copied (Cloudflare never shows a secret again): PIGEON_PEPPER_KEY, a key of the owner's choosing (32
     characters or more), set beside PIGEON_PEPPER, has the site keep the pepper in the database, locked with it
     (pg_meta "pepper": AES-256-GCM under a key from PIGEON_PEPPER_KEY). Where PIGEON_PEPPER_KEY is set and
     PIGEON_PEPPER isn't (the new project), the pepper's that one, opened with it: the same pepper, so every
     password goes on working, and a copy of the database alone is still no use. */
import { hex, sha256, b64url, fromB64url, db } from "./_pigeon.js";

const enc = new TextEncoder(), dec = new TextDecoder();
// (a key for the pepper's own lock, from PIGEON_PEPPER_KEY: none for one too short to be one)
const keyOf = (env) => (typeof env.PIGEON_PEPPER_KEY === "string" && env.PIGEON_PEPPER_KEY.length >= 32 ? env.PIGEON_PEPPER_KEY : null);
const AAD = enc.encode("inflight/at-rest/pepper|v1");
async function kek(k) {
  const base = await crypto.subtle.importKey("raw", enc.encode(k), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("inflight/at-rest/pepper-key/v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
// the pepper as the database keeps it, opened with PIGEON_PEPPER_KEY → the pepper, or null (none kept, or not this key's)
async function opened(env, k) {
  const row = await (await db(env)).prepare("SELECT v FROM pg_meta WHERE k = 'pepper'").first();
  if (!row || !String(row.v).startsWith("k1:")) return null;
  try { const all = fromB64url(row.v.slice(3)); return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: AAD }, await kek(k), all.slice(12))); }
  catch (_) { return null; }
}
// (where both are set: the pepper kept, locked with the key, once per copy of the server, and kept again should the
// key have changed. Never in place of another pepper kept with this same key: the pepper never changes, so one that
// differs is a wrong one set by mistake (a new value under PIGEON_PEPPER on the Worker, say), and the one kept stays)
let kept = null;
async function keep(env, p, k) {
  const id = hex(await sha256(`${k}|${p}`));
  if (kept === id) return;
  const was = await opened(env, k);
  if (was && was !== p) throw new Error("PIGEON_PEPPER isn't the pepper kept with PIGEON_PEPPER_KEY: not kept again");
  if (was !== p) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const d = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, await kek(k), enc.encode(p)));
    const out = new Uint8Array(12 + d.length); out.set(iv); out.set(d, 12);
    await (await db(env)).prepare("INSERT INTO pg_meta (k, v) VALUES ('pepper', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind("k1:" + b64url(out)).run();
  }
  kept = id;
}
// The pepper: PIGEON_PEPPER (kept, locked, where PIGEON_PEPPER_KEY is set too); else, with PIGEON_PEPPER_KEY alone, the one
// the database keeps; else none
let held = null;
async function pepperOf(env) {
  const k = keyOf(env);
  if (env.PIGEON_PEPPER) { if (k) await keep(env, env.PIGEON_PEPPER, k).catch(() => {}); return env.PIGEON_PEPPER; }
  if (!k) return null;
  if (held?.k === k) return held.p;
  const p = await opened(env, k);
  if (!p) missing();
  held = { k, p };
  return p;
}
// How the pepper stands, for the admin (never the pepper): { on, key, kept } — kept: the database has it, locked with
// this key, and it's this pepper (so a project with PIGEON_PEPPER_KEY alone would read everything as this one does)
export async function pepperState(env) {
  const k = keyOf(env), on = !!env.PIGEON_PEPPER || !!k;
  if (!k) return { on, key: false, kept: false };
  // (where both are set, kept now if it isn't yet: asking is enough, no password need be checked first)
  if (env.PIGEON_PEPPER) await keep(env, env.PIGEON_PEPPER, k).catch(() => {});
  const p = await opened(env, k).catch(() => null);
  return { on, key: true, kept: !!p && (!env.PIGEON_PEPPER || p === env.PIGEON_PEPPER) };
}
let made = null;
async function keys(env) {
  const p = await pepperOf(env);
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
export const pepperOn = (env) => !!env.PIGEON_PEPPER || !!keyOf(env);
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
