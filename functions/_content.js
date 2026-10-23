// The home page's words (its owner edits them in place there): the line above the name (role), the name, and the
// line under it (bio). Kept in KV, each save keeping the one before it, so a change can be undone (functions/api/history.js).

export const KEY = "content";
export const HISTORY_KEY = "content_history";
export const HISTORY_MAX = 15;

// (what's shown where nothing's been written: also what's in index.html, for search and link previews)
export const DEFAULT_CONTENT = {
  name: "George Farrow-Green",
  role: "Photography · Cycling · Apps",
  bio: "I ride, I take photos on the road and in the hills, and I build small apps for the people around me.",
};

// (a line left empty shows what's above)
const filled = (c) => ({ name: c.name || DEFAULT_CONTENT.name, role: c.role || DEFAULT_CONTENT.role, bio: c.bio || DEFAULT_CONTENT.bio });

export async function getContent(env) {
  const stored = env.BIO_KV ? await env.BIO_KV.get(KEY) : null;
  return filled(stored ? JSON.parse(stored) : {});
}

export async function getHistory(env) {
  if (!env.BIO_KV) return [];
  const v = await env.BIO_KV.get(HISTORY_KEY);
  return v ? JSON.parse(v) : [];
}

// Save new content, first snapshotting the previous version into history (the defaults, the first time: so even
// that can be undone).
export async function saveContent(env, clean) {
  const prev = await env.BIO_KV.get(KEY);
  const history = await getHistory(env);
  history.unshift({ savedAt: Date.now(), content: prev ? JSON.parse(prev) : {} });
  await env.BIO_KV.put(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  await env.BIO_KV.put(KEY, JSON.stringify(clean));
  return filled(clean);
}

// one line of plain text: no line breaks or control characters, spaces run together, cut to max
const line = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function sanitize(body) {
  return { name: line(body.name, 80), role: line(body.role, 120), bio: line(body.bio, 400) };
}
