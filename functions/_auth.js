// Shared auth helpers for the Pages Functions (Web Crypto, runs on the edge).
// A session is a random token in an HttpOnly cookie, kept (as a hash) in D1,
// so signing out ends it for good. Each is tagged with a keyed hash of
// EDIT_PASSWORD, so changing the password ends every session automatically;
// the key is a server secret, so a stolen cookie can't be used to guess the
// password offline.
import { db, serverSecret } from "./_pigeon.js";

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

// Constant-time string compare (of equal-length hex digests)
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
const digest = async (s) => toHex(await crypto.subtle.digest("SHA-256", enc(s)));

// Compares digests, so the time taken says nothing about the password's length.
export async function passwordValid(password, env) {
  if (!env.EDIT_PASSWORD) return false;
  return safeEqual(await digest(String(password || "")), await digest(String(env.EDIT_PASSWORD)));
}

// Ties a passkey to the password it was added under: changing EDIT_PASSWORD
// retires every passkey, like every session.
export const passwordTag = (env) => hmac(env.EDIT_PASSWORD, "passkey");

// the current password's tag (kept per isolate: the secret and password don't change while it lives)
let tagMemo = null;
async function ownerTag(env) {
  const pw = await digest(String(env.EDIT_PASSWORD));
  if (tagMemo?.pw !== pw) tagMemo = { pw, tag: await hmac(await serverSecret(env), "owner-session|" + pw) };
  return tagMemo.tag;
}
export async function createToken(env) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32))), t = Date.now(), D = await db(env);
  await D.batch([
    D.prepare("DELETE FROM pg_owner_sessions WHERE created_at < ?").bind(t - TTL_MS),
    D.prepare("INSERT INTO pg_owner_sessions (hash, tag, created_at) VALUES (?, ?, ?)").bind(await digest(token), await ownerTag(env), t),
  ]);
  return token;
}
// Signing out: the session ends on the server too, not just in this browser.
export async function endSession(request, env) {
  const token = readCookie(request, COOKIE);
  if (token && /^[0-9a-f]{64}$/.test(token)) await (await db(env)).prepare("DELETE FROM pg_owner_sessions WHERE hash = ?").bind(await digest(token)).run();
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
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const row = await (await db(env)).prepare("SELECT tag, created_at FROM pg_owner_sessions WHERE hash = ?").bind(await digest(token)).first();
  return !!row && Date.now() - row.created_at < TTL_MS && safeEqual(row.tag, await ownerTag(env));
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
