import { isAuthed, json } from "../_auth.js";

const KEY = "content";

const DEFAULT_CONTENT = {
  name: "George Farrow Green",
  role: "Curious human · builder of things",
  bio:
    "This is a placeholder bio. Log in with your password to edit it — share a " +
    "few warm sentences about who you are, what you make, and what you're into.",
  links: [
    { label: "Email", url: "mailto:georgefarrowgreen@icloud.com" },
    { label: "GitHub", url: "https://github.com/georgefarrowgreen1" },
  ],
};

// Public: anyone can read the bio.
export async function onRequestGet({ env }) {
  if (!env.BIO_KV) return json(DEFAULT_CONTENT);
  const stored = await env.BIO_KV.get(KEY);
  return json(stored ? JSON.parse(stored) : DEFAULT_CONTENT);
}

// Protected: only an authenticated editor can write.
export async function onRequestPut({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return json({ error: "Not authorized." }, 401);
  }
  if (!env.BIO_KV) {
    return json({ error: "Storage isn't configured yet (no BIO_KV namespace bound)." }, 503);
  }

  let body = {};
  try { body = await request.json(); } catch (_) {
    return json({ error: "Invalid JSON." }, 400);
  }

  const clean = sanitize(body);
  await env.BIO_KV.put(KEY, JSON.stringify(clean));
  return json({ ok: true, content: clean });
}

function clip(s, max) {
  return String(s == null ? "" : s).slice(0, max);
}

function cleanUrl(url) {
  const u = clip(url, 500).trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(u)) return "mailto:" + u;
  if (u) return "https://" + u.replace(/^\/+/, "");
  return "";
}

function sanitize(body) {
  const links = Array.isArray(body.links) ? body.links.slice(0, 12) : [];
  return {
    name: clip(body.name, 80) || DEFAULT_CONTENT.name,
    role: clip(body.role, 120),
    bio: clip(body.bio, 1200),
    links: links
      .map((l) => ({ label: clip(l && l.label, 40).trim(), url: cleanUrl(l && l.url) }))
      .filter((l) => l.label && l.url),
  };
}
