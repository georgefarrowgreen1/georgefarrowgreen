// Shared auth helpers for the Pages Functions (Web Crypto, runs on the edge).
// A session is an HMAC-signed, expiring token stored in an HttpOnly cookie.
// The signing key is derived from EDIT_PASSWORD, so changing the password
// invalidates every existing session automatically.

const COOKIE = "session";
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const enc = (s) => new TextEncoder().encode(s);

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc(data)));
}

// Constant-time-ish string compare
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function passwordValid(password, env) {
  if (!env.EDIT_PASSWORD) return false;
  return safeEqual(String(password || ""), String(env.EDIT_PASSWORD));
}

export async function createToken(env) {
  const exp = Date.now() + TTL_MS;
  const payload = btoa(String(exp));
  const sig = await hmac(env.EDIT_PASSWORD, payload);
  return `${payload}.${sig}`;
}

export function sessionCookie(token, maxAgeSeconds) {
  const age = maxAgeSeconds === 0 ? 0 : Math.floor(TTL_MS / 1000);
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function isAuthed(request, env) {
  if (!env.EDIT_PASSWORD) return false;
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmac(env.EDIT_PASSWORD, payload);
  if (!safeEqual(sig, expected)) return false;
  const exp = parseInt(atob(payload), 10);
  return Number.isFinite(exp) && Date.now() < exp;
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
