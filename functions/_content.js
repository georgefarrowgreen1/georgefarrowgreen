// Shared content store + sanitization, used by /api/content and /api/history.

export const KEY = "content";
export const HISTORY_KEY = "content_history";
export const HISTORY_MAX = 15;

export const DEFAULT_CONTENT = {
  name: "George Farrow-Green",
  role: "Curious human · builder of things",
  bio:
    "This is a placeholder bio. Log in with your password to edit it — share a " +
    "few warm sentences about who you are, what you make, and what you're into.",
  avatar: "",
  links: [
    { label: "Email", url: "mailto:georgefarrowgreen@icloud.com" },
    { label: "GitHub", url: "https://github.com/georgefarrowgreen1" },
  ],
};

export async function getContent(env) {
  if (!env.BIO_KV) return DEFAULT_CONTENT;
  const stored = await env.BIO_KV.get(KEY);
  return stored ? JSON.parse(stored) : DEFAULT_CONTENT;
}

export async function getHistory(env) {
  if (!env.BIO_KV) return [];
  const v = await env.BIO_KV.get(HISTORY_KEY);
  return v ? JSON.parse(v) : [];
}

// Save new content, first snapshotting the previous version into history.
export async function saveContent(env, clean) {
  const prev = await env.BIO_KV.get(KEY);
  if (prev) {
    const history = await getHistory(env);
    history.unshift({ savedAt: Date.now(), content: JSON.parse(prev) });
    await env.BIO_KV.put(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  }
  await env.BIO_KV.put(KEY, JSON.stringify(clean));
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

function cleanAvatar(avatar) {
  const a = String(avatar || "");
  // Only accept inline image data URLs, capped at ~700 KB of base64.
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(a) && a.length <= 700000) {
    return a;
  }
  return "";
}

export function sanitize(body) {
  const links = Array.isArray(body.links) ? body.links.slice(0, 12) : [];
  return {
    name: clip(body.name, 80) || DEFAULT_CONTENT.name,
    role: clip(body.role, 120),
    bio: clip(body.bio, 1200),
    avatar: cleanAvatar(body.avatar),
    links: links
      .map((l) => ({ label: clip(l && l.label, 40).trim(), url: cleanUrl(l && l.url) }))
      .filter((l) => l.label && l.url),
  };
}
