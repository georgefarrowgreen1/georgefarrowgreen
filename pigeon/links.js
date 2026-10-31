// The web addresses in a message (https://…, http://…, or one starting www.), so they can be tapped (app.js linked):
// what's written, in pieces, each with the address it opens if it's one. Only ever http or https, and only a name with a
// dot in it (a real site). What's around an address that isn't part of it stays outside it: a full stop or comma after
// it, a closing bracket it was written inside, a quote mark.
const FIND = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAIL = /[.,:;!?'"’”…*]$/;
const balanced = (s, open, close) => s.split(open).length >= s.split(close).length;

export function linkParts(text) {
  const out = [], s = String(text ?? "");
  let at = 0;
  for (const m of s.matchAll(FIND)) {
    let u = m[0];
    // (trimmed from its end: punctuation, and a bracket it doesn't open itself)
    for (;;) {
      if (TRAIL.test(u)) u = u.slice(0, -1);
      else if (u.endsWith(")") && !balanced(u, "(", ")")) u = u.slice(0, -1);
      else if (u.endsWith("]") && !balanced(u, "[", "]")) u = u.slice(0, -1);
      else break;
    }
    const href = hrefOf(u);
    if (!href) continue;
    if (m.index > at) out.push({ text: s.slice(at, m.index) });
    out.push({ text: u, href });
    at = m.index + u.length;
  }
  if (at < s.length || !out.length) out.push({ text: s.slice(at) });
  return out;
}
// (the address it opens, or null: never anything but a web page)
export function hrefOf(u) {
  try {
    const x = new URL(/^www\./i.test(u) ? `https://${u}` : u);
    if (!/^https?:$/.test(x.protocol) || !x.hostname.includes(".") || x.username || x.password) return null;
    return x.href;
  } catch (_) { return null; }
}
// every address in it, once each, in order
export const linksIn = (text) => [...new Set(linkParts(text).filter((p) => p.href).map((p) => p.href))];
