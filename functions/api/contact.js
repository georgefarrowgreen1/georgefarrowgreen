import { json } from "../_auth.js";

// Contact form → email via Resend (https://resend.com).
// Requires env: RESEND_API_KEY. Optional: CONTACT_TO, CONTACT_FROM.
// Spam defenses: hidden honeypot field + per-IP rate limit in KV.

const MAX_PER_WINDOW = 5;
const WINDOW_SECONDS = 60 * 60; // 1 hour

function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n).trim();
}

function validEmail(e) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (_) {
    return json({ error: "Invalid request." }, 400);
  }

  // Honeypot: real users never fill this. Pretend success to waste bot time.
  if (clip(body.website, 100)) return json({ ok: true });

  const name = clip(body.name, 100);
  const email = clip(body.email, 200);
  const message = clip(body.message, 4000);

  if (!name || !message || !validEmail(email)) {
    return json({ error: "Please add your name, a valid email, and a message." }, 400);
  }

  // Rate limit per IP.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.BIO_KV) {
    const key = `contact_rl:${ip}`;
    const count = parseInt((await env.BIO_KV.get(key)) || "0", 10);
    if (count >= MAX_PER_WINDOW) {
      return json({ error: "You've sent a few already — please try later." }, 429);
    }
    await env.BIO_KV.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  }

  if (!env.RESEND_API_KEY) {
    return json({ error: "The contact form isn't configured yet." }, 503);
  }

  const to = env.CONTACT_TO || "georgefarrowgreen@icloud.com";
  const from = env.CONTACT_FROM || "Website <noreply@georgefarrowgreen.com>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: email,
      subject: `New message from ${name} via your site`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }),
  });

  if (!res.ok) {
    return json({ error: "Couldn't send right now — please try again later." }, 502);
  }
  return json({ ok: true });
}
