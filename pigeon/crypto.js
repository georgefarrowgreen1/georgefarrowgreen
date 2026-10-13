// InFlight's end-to-end encryption, on Web Crypto only.
//
// Identity: an ECDH P-256 key pair made on the phone. Two friends' keys give
// both of them the same shared secret (ECDH), which HKDF turns into a fresh
// AES-256-GCM key per scroll. The server only ever holds public keys.
//
// Password: PBKDF2 stretches it into 64 bytes. The first half locks the
// private key ("vault") before it is uploaded; the second half is the proof
// the server checks at sign-in (it stores only a hash of it). So the server
// can verify a password without being able to unlock anything with it.
//
// Passkeys: WebAuthn's PRF extension gives the phone a secret per passkey,
// which locks a second copy of the private key for password-free recovery.

export const te = new TextEncoder(), td = new TextDecoder();
export const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export function b64(buf) {
  const a = new Uint8Array(buf); let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (buf) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromB64url(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return unb64(s);
}
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = rand(16); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const PBKDF2_ITER = 600000;
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const aesKey = (raw, uses) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, uses);

export const E2E = {
  async newIdentity() {
    // extractable once, so it can be locked into the vault; the phone then keeps a non-extractable copy
    const kp = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey), pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
    return { privJwk: priv, pub: { kty: "EC", crv: "P-256", x: pub.x, y: pub.y } };
  },
  importPriv(jwk) {
    return crypto.subtle.importKey("jwk", { ...jwk, ext: true, key_ops: ["deriveBits"] }, ECDH, false, ["deriveBits"]);
  },
  async fromPassword(password, salt) {
    const base = await crypto.subtle.importKey("raw", te.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, base, 512));
    return { lockKey: await aesKey(bits.slice(0, 32), ["encrypt", "decrypt"]), proof: b64url(bits.slice(32)) };
  },
  async fromSecret(secret) {
    const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: te.encode("inflight/passkey-vault/v1") },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  },
  async lock(key, obj) {
    const iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode("inflight/vault/v1") }, key, te.encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, iv: b64(iv), d: b64(d) });
  },
  async unlock(key, s) {
    const e = JSON.parse(s);
    const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: te.encode("inflight/vault/v1") }, key, unb64(e.d));
    return JSON.parse(td.decode(p));
  },

  // Both friends compute the same base key; the server, holding only public keys, can't.
  async pair(priv, pubJwk) {
    const pub = await crypto.subtle.importKey("jwk", { ...pubJwk, ext: true }, ECDH, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
    return crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  },
  msgKey(base, salt) {
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: te.encode("inflight/msg/v1") },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  },
  // id, sender and recipient are bound in, so the server can't re-address or swap scrolls
  aad: (m) => te.encode(`inflight/v1|${m.id}|${m.from}|${m.to}`),
  async seal(base, meta, obj) {
    const salt = rand(16), iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: E2E.aad(meta) }, await E2E.msgKey(base, salt), te.encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, s: b64(salt), iv: b64(iv), d: b64(d) });
  },
  async open(base, meta, ct) {
    const e = JSON.parse(ct);
    const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: E2E.aad(meta) }, await E2E.msgKey(base, unb64(e.s)), unb64(e.d));
    return JSON.parse(td.decode(p));
  },
  // each photo gets its own random key, which travels inside the encrypted scroll
  async sealPhoto(id, bytes) {
    const raw = rand(32), iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode("inflight/photo/v1|" + id) }, await aesKey(raw, ["encrypt"]), bytes);
    return { k: b64(raw), iv: b64(iv), data: new Uint8Array(d) };
  },
  async openPhoto(id, p, data) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p.iv), additionalData: te.encode("inflight/photo/v1|" + id) }, await aesKey(unb64(p.k), ["decrypt"]), data);
  },

  // Groups: a message is sealed once under its own random key, and that key
  // travels to each member sealed with the pair key the sender shares with
  // them (seal above, so it's bound to the message id, sender and member).
  // A new member can't open what came before; someone who left, what comes after.
  async sealGroup(meta, obj) {
    const raw = rand(32), iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(`inflight/group/v1|${meta.id}|${meta.from}|${meta.group}`) }, await aesKey(raw, ["encrypt"]), te.encode(JSON.stringify(obj)));
    return { body: JSON.stringify({ v: 1, iv: b64(iv), d: b64(d) }), key: b64(raw) };
  },
  async openGroup(meta, key, body) {
    const e = JSON.parse(body);
    const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: te.encode(`inflight/group/v1|${meta.id}|${meta.from}|${meta.group}`) }, await aesKey(unb64(key), ["decrypt"]), unb64(e.d));
    return JSON.parse(td.decode(p));
  },

  // 60 digits both friends can compare; identical only if no one swapped a key in between
  async safety(aId, aPub, bId, bPub) {
    const [x, y] = [[aId, aPub], [bId, bPub]].sort((m, n) => (m[0] < n[0] ? -1 : 1));
    const h = new Uint8Array(await crypto.subtle.digest("SHA-512", te.encode(`${x[1].x}.${x[1].y}|${y[1].x}.${y[1].y}`)));
    const out = [];
    for (let i = 0; i < 12; i++) { let v = 0; for (let j = 0; j < 5; j++) v = (v * 256 + h[i * 5 + j]) % 100000; out.push(String(v).padStart(5, "0")); }
    return out;
  },
  async fingerprint(pub) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(`${pub.x}.${pub.y}`)));
    return [...h.slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("").match(/.{4}/g).join(" ");
  },
  async prfSalt() { return new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode("inflight/prf/v1"))); },
};
