// InFlight's end-to-end encryption, on Web Crypto only.
//
// Identity: an ECDH P-256 key pair made on the phone. Two friends' keys give
// both of them the same shared secret (ECDH), which HKDF turns into a fresh
// AES-256-GCM key per scroll. The server only ever holds public keys.
//
// Password: stretched into 64 bytes. The first half locks the private key
// ("vault") before it is uploaded; the second half is the proof the server
// checks at sign-in (it stores only a hash of it). So the server can verify a
// password without being able to unlock anything with it. The stretching is
// Argon2id (64 MiB, 3 passes: memory-hard, so guessing on graphics cards is
// slow) for a salt marked "a2:"; an account from before (a bare salt) uses
// PBKDF2-SHA256 at 600,000 rounds until its next password sign-in moves it on.
//
// Passkeys: WebAuthn's PRF extension gives the phone a secret per passkey,
// which locks a second copy of the private key for password-free recovery.
//
// Signing in happens on the account's own page (account.<site>), which hands
// the sign-in back to InFlight with what unlocks the key there (the password's
// first half, or a passkey's PRF secret), sealed to a key pair InFlight's tab
// made for the trip: only that tab can open it (handbackPair, sealFor, unseal).

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
const ARGON = { m: 65536, t: 3 };                // 64 MiB, 3 passes, one lane
// (hash-wasm's Argon2id, loaded only when a password is stretched)
let argon = null;
const loadArgon = () => (argon ||= import("./argon2.js").then((m) => m?.argon2id || m?.default?.argon2id || globalThis.hashwasm.argon2id).catch((e) => { argon = null; throw e; }));
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const aesKey = (raw, uses) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, uses);
// (a hand-back's key: from the two halves of the trip's key pairs, both public halves bound in)
async function handbackKey(priv, pub, from, to) {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const base = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: te.encode(`inflight/handback/v1|${from}|${to}`) },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

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
  // a new salt (as the server keeps it: "a2:" and 16 random bytes)
  newSalt: () => "a2:" + b64url(rand(16)),
  isCurrent: (salt) => String(salt || "").startsWith("a2:"),
  async fromPassword(password, salt) {
    const pw = te.encode(String(password).normalize("NFKC"));
    let bits;
    if (E2E.isCurrent(salt)) {
      const argon2id = await loadArgon();
      bits = await argon2id({ password: pw, salt: fromB64url(salt.slice(3)), parallelism: 1, iterations: ARGON.t, memorySize: ARGON.m, hashLength: 64, outputType: "binary" });
    } else {
      const base = await crypto.subtle.importKey("raw", pw, "PBKDF2", false, ["deriveBits"]);
      bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: typeof salt === "string" ? fromB64url(salt) : salt, iterations: PBKDF2_ITER }, base, 512));
    }
    // (lock: the first half as it is, only for handing to InFlight from the account's page, sealed: sealFor)
    return { lockKey: await aesKey(bits.slice(0, 32), ["encrypt", "decrypt"]), proof: b64url(bits.slice(32)), lock: b64url(bits.slice(0, 32)) };
  },
  // the password's first half, handed back from the account's page, as the key it is
  lockKeyOf: (lock) => aesKey(fromB64url(lock), ["encrypt", "decrypt"]),
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
  // Shows the server this phone holds the private key, without giving it away:
  // an HMAC under the secret it shares with a one-off server key, over what's proved.
  async keyProof(priv, serverPub, what) {
    const pub = await crypto.subtle.importKey("jwk", { ...serverPub, ext: true }, ECDH, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
    const k = await crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return b64url(await crypto.subtle.sign("HMAC", k, te.encode("inflight/key-proof/v1|" + what)));
  },
  msgKey(base, salt) {
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: te.encode("inflight/msg/v1") },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  },
  // What it is, its id, sender and recipient are bound in, so the server can't
  // re-address, swap or re-label scrolls (a reaction can't pass for a message,
  // nor a group key for either). v1 (before the type was bound) still opens.
  TYPES: ["msg", "react", "wrap", "via", "note", "pins"],
  aad: (m) => te.encode(m.type ? `inflight/v2|${m.type}|${m.id}|${m.from}|${m.to}` : `inflight/v1|${m.id}|${m.from}|${m.to}`),
  async seal(base, meta, obj) {
    if (!E2E.TYPES.includes(meta.type)) throw new Error("seal: what is it?");
    const salt = rand(16), iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: E2E.aad(meta) }, await E2E.msgKey(base, salt), te.encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 2, s: b64(salt), iv: b64(iv), d: b64(d) });
  },
  async open(base, meta, ct) {
    const e = JSON.parse(ct);
    if (e.v === 2 && !E2E.TYPES.includes(meta.type)) throw new Error("open: what is it?");
    const m = e.v === 2 ? meta : { id: meta.id, from: meta.from, to: meta.to };
    const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: E2E.aad(m) }, await E2E.msgKey(base, unb64(e.s)), unb64(e.d));
    return JSON.parse(td.decode(p));
  },
  hash: async (s) => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)))),
  // each photo (or voice pigeon) gets its own random key, which travels inside
  // the encrypted scroll; what it is is in the label, so one can't pass for the other
  async sealPhoto(id, bytes, kind = "photo") {
    const raw = rand(32), iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(`inflight/${kind}/v1|` + id) }, await aesKey(raw, ["encrypt"]), bytes);
    return { k: b64(raw), iv: b64(iv), data: new Uint8Array(d) };
  },
  async openPhoto(id, p, data, kind = "photo") {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p.iv), additionalData: te.encode(`inflight/${kind}/v1|` + id) }, await aesKey(unb64(p.k), ["decrypt"]), data);
  },

  // Groups: a message is sealed once under its own random key, and that key
  // travels to each member sealed with the pair key the sender shares with
  // them (seal above, so it's bound to the message id, sender and member).
  // A new member can't open what came before; someone who left, what comes after.
  // v2: what it is is bound in too, and each member's sealed key carries a hash
  // of the body (h), so no member can swap in a different body for someone
  // else's message: the body is the sender's, not just the group's.
  async sealGroup(meta, obj) {
    if (!["msg", "react"].includes(meta.type)) throw new Error("sealGroup: what is it?");
    const raw = rand(32), iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(`inflight/group/v2|${meta.type}|${meta.id}|${meta.from}|${meta.group}`) }, await aesKey(raw, ["encrypt"]), te.encode(JSON.stringify(obj)));
    const body = JSON.stringify({ v: 2, iv: b64(iv), d: b64(d) });
    return { body, key: b64(raw), h: await E2E.hash(body) };
  },
  async openGroup(meta, key, body) {
    const e = JSON.parse(body);
    const aad = e.v === 2 ? `inflight/group/v2|${meta.type}|${meta.id}|${meta.from}|${meta.group}` : `inflight/group/v1|${meta.id}|${meta.from}|${meta.group}`;
    const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: te.encode(aad) }, await aesKey(unb64(key), ["decrypt"]), unb64(e.d));
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
    return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("").match(/.{4}/g).join(" ");     // 128 bits
  },
  async prfSalt() { return new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode("inflight/prf/v1"))); },

  // A sign-in handed back from the account's page. Before going there, the app makes a word for the sign-in (its
  // hash, ask, goes there; the code that comes back is good only with the word itself: the server checks) and a key
  // pair for the trip (its public half goes there, the private half stays here), kept on this phone until it's back
  // (pigeon/app.js toAccountSignIn).
  async handbackPair() {
    const kp = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]), word = b64url(rand(32));
    return { word, ask: b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(word)))),
      pub: b64url(await crypto.subtle.exportKey("raw", kp.publicKey)), priv: await crypto.subtle.exportKey("jwk", kp.privateKey) };
  },
  // (the account's page) what unlocks the key, sealed to that public half, with a key pair of its own made for it
  async sealFor(pub, obj) {
    const to = await crypto.subtle.importKey("raw", fromB64url(pub), ECDH, false, []), eph = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
    const from = b64url(await crypto.subtle.exportKey("raw", eph.publicKey)), iv = rand(12);
    const d = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode("inflight/handback/v1") }, await handbackKey(eph.privateKey, to, from, pub), te.encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, e: from, iv: b64url(iv), d: b64url(d) });
  },
  // (back here) opened with the private half this tab kept, and its public half
  async unseal(priv, pub, s) {
    const e = JSON.parse(s);
    const key = await crypto.subtle.importKey("jwk", priv, ECDH, false, ["deriveBits"]), from = await crypto.subtle.importKey("raw", fromB64url(e.e), ECDH, false, []);
    const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(e.iv), additionalData: te.encode("inflight/handback/v1") }, await handbackKey(key, from, e.e, pub), fromB64url(e.d));
    return JSON.parse(td.decode(p));
  },
};
