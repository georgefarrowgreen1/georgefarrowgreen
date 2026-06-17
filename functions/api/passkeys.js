import { isAuthed, createToken, sessionCookie, json } from "../_auth.js";

/* ----------------------------------------------------------------------
   Passkey (WebAuthn) login — single-user.
   - Registration requires an existing authenticated (password) session.
   - Authentication verifies an assertion and issues the same session cookie
     the password login uses.
   - Implemented on Web Crypto only (no external deps). Supports ES256 (-7)
     and RS256 (-257), which covers Apple, Android, and FIDO2 keys.

   KV layout (in BIO_KV):
     passkeys        -> JSON array of { id, publicKey, alg, label, createdAt }
     pk_chal_reg     -> base64url challenge for registration (TTL 5 min)
     pk_chal_auth    -> base64url challenge for authentication (TTL 5 min)
---------------------------------------------------------------------- */

const enc = (s) => new TextEncoder().encode(s);

function bufToB64url(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(str) {
  str = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

function randomChallenge() {
  return bufToB64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(buf) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

// Convert a DER-encoded ECDSA signature to the raw r||s form Web Crypto wants.
function derToRawEcdsa(der) {
  const u = new Uint8Array(der);
  let i = 0;
  if (u[i++] !== 0x30) throw new Error("bad der");
  let seqLen = u[i++];
  if (seqLen & 0x80) {
    const n = seqLen & 0x7f;
    seqLen = 0;
    for (let k = 0; k < n; k++) seqLen = (seqLen << 8) | u[i++];
  }
  const readInt = () => {
    if (u[i++] !== 0x02) throw new Error("bad der");
    const len = u[i++];
    const v = u.slice(i, i + len);
    i += len;
    return v;
  };
  const pad = (b) => {
    let start = 0;
    while (start < b.length - 1 && b[start] === 0) start++;
    b = b.slice(start);
    const out = new Uint8Array(32);
    out.set(b.slice(-32), 32 - Math.min(32, b.length));
    return out;
  };
  const r = pad(readInt());
  const s = pad(readInt());
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

async function getPasskeys(env) {
  if (!env.BIO_KV) return [];
  const v = await env.BIO_KV.get("passkeys");
  return v ? JSON.parse(v) : [];
}
async function putPasskeys(env, list) {
  await env.BIO_KV.put("passkeys", JSON.stringify(list));
}

/* ---------------- Verification ---------------- */
async function verifyClientData(clientDataBuf, type, expectedChallenge, origin) {
  const data = JSON.parse(new TextDecoder().decode(clientDataBuf));
  if (data.type !== type) return false;
  if (data.challenge !== expectedChallenge) return false;
  if (data.origin !== origin) return false;
  return true;
}

async function verifyAssertion(cred, authDataBuf, clientDataBuf, sigBuf, rpId) {
  const authData = new Uint8Array(authDataBuf);
  const rpIdHash = authData.slice(0, 32);
  if (!bytesEqual(rpIdHash, await sha256(enc(rpId)))) return false;
  if (!(authData[32] & 0x01)) return false; // user-present flag

  const clientHash = await sha256(clientDataBuf);
  const signed = new Uint8Array(authData.length + clientHash.length);
  signed.set(authData, 0);
  signed.set(clientHash, authData.length);

  const spki = b64urlToBuf(cred.publicKey);
  if (cred.alg === -7) {
    const key = await crypto.subtle.importKey(
      "spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
    );
    const raw = derToRawEcdsa(sigBuf);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, raw, signed);
  }
  if (cred.alg === -257) {
    const key = await crypto.subtle.importKey(
      "spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sigBuf, signed);
  }
  return false;
}

/* ---------------- Routes ---------------- */
// GET: status + (when authed) the list of registered passkeys.
export async function onRequestGet({ request, env }) {
  const list = await getPasskeys(env);
  const authed = await isAuthed(request, env);
  return json({
    supported: !!env.EDIT_PASSWORD,
    count: list.length,
    credentials: authed
      ? list.map((c) => ({ id: c.id, label: c.label, createdAt: c.createdAt }))
      : [],
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  const url = new URL(request.url);
  const rpId = url.hostname;
  const origin = url.origin;

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const action = body.action;

  /* ---- Registration (requires existing session) ---- */
  if (action === "register-options") {
    if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
    const challenge = randomChallenge();
    await env.BIO_KV.put("pk_chal_reg", challenge, { expirationTtl: 300 });
    const list = await getPasskeys(env);
    return json({
      challenge,
      rpId,
      excludeCredentials: list.map((c) => c.id),
    });
  }

  if (action === "register-verify") {
    if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
    const expected = await env.BIO_KV.get("pk_chal_reg");
    if (!expected) return json({ error: "Challenge expired. Try again." }, 400);
    await env.BIO_KV.delete("pk_chal_reg");

    const ok = await verifyClientData(b64urlToBuf(body.clientDataJSON), "webauthn.create", expected, origin);
    if (!ok) return json({ error: "Registration verification failed." }, 400);
    if (body.alg !== -7 && body.alg !== -257) {
      return json({ error: "Unsupported key type (need ES256 or RS256)." }, 400);
    }

    const list = await getPasskeys(env);
    if (list.some((c) => c.id === body.id)) {
      return json({ error: "This passkey is already registered." }, 409);
    }
    list.push({
      id: body.id,
      publicKey: body.publicKey,
      alg: body.alg,
      label: String(body.label || "Passkey").slice(0, 40),
      createdAt: Date.now(),
    });
    await putPasskeys(env, list);
    return json({ ok: true, count: list.length });
  }

  /* ---- Authentication (public) ---- */
  if (action === "auth-options") {
    const list = await getPasskeys(env);
    const challenge = randomChallenge();
    await env.BIO_KV.put("pk_chal_auth", challenge, { expirationTtl: 300 });
    return json({ challenge, rpId, allowCredentials: list.map((c) => c.id) });
  }

  if (action === "auth-verify") {
    const expected = await env.BIO_KV.get("pk_chal_auth");
    if (!expected) return json({ error: "Challenge expired. Try again." }, 400);
    await env.BIO_KV.delete("pk_chal_auth");

    const list = await getPasskeys(env);
    const cred = list.find((c) => c.id === body.id);
    if (!cred) return json({ error: "Unknown passkey." }, 401);

    const clientBuf = b64urlToBuf(body.clientDataJSON);
    if (!(await verifyClientData(clientBuf, "webauthn.get", expected, origin))) {
      return json({ error: "Verification failed." }, 401);
    }
    const valid = await verifyAssertion(
      cred, b64urlToBuf(body.authenticatorData), clientBuf, b64urlToBuf(body.signature), rpId
    );
    if (!valid) return json({ error: "Signature check failed." }, 401);

    const token = await createToken(env);
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
  }

  return json({ error: "Unknown action." }, 400);
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAuthed(request, env))) return json({ error: "Not authorized." }, 401);
  if (!env.BIO_KV) return json({ error: "Storage not configured (BIO_KV)." }, 503);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const list = await getPasskeys(env);
  const next = list.filter((c) => c.id !== body.id);
  await putPasskeys(env, next);
  return json({ ok: true, count: next.length });
}
