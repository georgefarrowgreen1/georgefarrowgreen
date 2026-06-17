import { passwordValid, createToken, sessionCookie, json } from "../_auth.js";

// Brute-force protection: lock out an IP after too many failures in a window.
const MAX_FAILS = 8;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function getFails(env, ip) {
  if (!env.BIO_KV) return 0;
  const v = await env.BIO_KV.get(`login_fails:${ip}`);
  return v ? parseInt(v, 10) || 0 : 0;
}

async function bumpFails(env, ip, fails) {
  if (!env.BIO_KV) return;
  await env.BIO_KV.put(`login_fails:${ip}`, String(fails + 1), {
    expirationTtl: WINDOW_SECONDS,
  });
}

async function clearFails(env, ip) {
  if (env.BIO_KV) await env.BIO_KV.delete(`login_fails:${ip}`);
}

export async function onRequestPost({ request, env }) {
  if (!env.EDIT_PASSWORD) {
    return json({ error: "Editing isn't configured yet (no EDIT_PASSWORD set)." }, 503);
  }

  const ip = clientIp(request);
  if ((await getFails(env, ip)) >= MAX_FAILS) {
    return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  }

  let body = {};
  try { body = await request.json(); } catch (_) {}

  if (!(await passwordValid(body.password, env))) {
    await bumpFails(env, ip, await getFails(env, ip));
    return json({ error: "Incorrect password." }, 401);
  }

  await clearFails(env, ip);
  const token = await createToken(env);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
}
