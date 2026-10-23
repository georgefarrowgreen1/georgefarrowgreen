import { json } from "../_auth.js";
import { saveMessage } from "../_messages.js";
import { emailReady, emailBody, sendEmail, linkOrigin, ukTime } from "../_email.js";

// Contact form. Saves to D1 (if bound) and/or emails via a provider:
//   WEB3FORMS_KEY   -> https://web3forms.com  (no domain verification needed)
//   RESEND_API_KEY  -> https://resend.com     (needs a verified sender domain; in the site's email look, functions/_email.js)
// Spam defenses: hidden honeypot field + per-IP rate limit in KV.

const MAX_PER_WINDOW = 5;
const WINDOW_SECONDS = 60 * 60; // 1 hour

function clip(s, n) { return String(s == null ? "" : s).slice(0, n).trim(); }
function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid request." }, 400); }

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

  // Persist to D1 (best effort — never block the user on this).
  let saved = false;
  if (env.DB) {
    try { await saveMessage(env, { name, email, body: message }); saved = true; } catch (_) {}
  }

  const subject = `New enquiry from ${name} via your site`;

  // --- Web3Forms (preferred: no domain verification) ---
  if (env.WEB3FORMS_KEY) {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: env.WEB3FORMS_KEY, subject, from_name: name, name, email, replyto: email, message }),
    });
    if (!res.ok && !saved) return json({ error: "Couldn't send right now — please try later." }, 502);
    return json({ ok: true });
  }

  // --- Resend (fallback): from "Website" <website@…>, a reply going to whoever wrote ---
  if (emailReady(env)) {
    const to = env.CONTACT_TO || "georgefarrowgreen@icloud.com";
    const reply = `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent("Re: your message")}`;
    const { text, html } = emailBody({ brand: "website", origin: linkOrigin(request), title: `A message from ${name}`, preheader: message.slice(0, 140),
      pill: ["mail", email], quote: message, rows: [["Sent", ukTime(Date.now())]], button: { label: `Reply to ${name.split(/\s+/)[0]}`, url: reply } });
    try { await sendEmail(env, { brand: "website", to, replyTo: email, subject, text, html }); }
    catch (_) { if (!saved) return json({ error: "Couldn't send right now — please try later." }, 502); }
    return json({ ok: true });
  }

  // No email provider configured — success only if we at least recorded it.
  return saved ? json({ ok: true }) : json({ error: "The contact form isn't configured yet." }, 503);
}

