// What a friend said, in a line, for Today's Waiting for You (Today First, spec §7.4): run by Chat's engine on the
// phone, over messages it has just decrypted in memory, so the words never leave it. Pure: no fetch, no storage, no
// clock (the time is passed in), and it imports nothing.
//   waitingDigest(items: [{ id, first, at?, msgs: [{ text, card?, plan?, when?, ask?, ans?, at }] }], { stocks, now })
//   → [{ id, first, at, said, kind: "invite" | "ask" | "question" | "message", topics }], newest first
// - items: one per friend (or group) the server named, with that friend's messages since your last one in the chat
//   (the engine takes at most 5; so does this), each as Chat's payloadParts read it (text: its words). at: the
//   server's time of their newest message, where it's known.
// - Only messages that have landed by now and are under a day old count (none: the friend is left out).
// - said: the newest messages joined (oldest first), as many as fit in 90 characters; the newest alone cut to fit.
//   The stale rule: where the newest message here is older than the server's at (the engine couldn't read the newer
//   one yet), said is "", so old words never sit beside a new message. (Today's merge holds to the same rule.)
// - kind: "invite" for a ride or a time offered (a plan, a when, or a "later" answer with its own time), "ask" for an
//   open "How's yours?", "question" for words that ask, else "message".
// - topics (newest first, at most 6): from cards ({ kind: "weather" | "fitness" } or { kind: "markets", sym, name }),
//   and your holdings (stocks: [{ sym, name }]) named by name or by symbol in any of the messages ({ kind: "markets",
//   sym, name }); each with at (when said), asked (in a message that asks) and via ("card" | "words").

const CTRL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;          // (as pigeon/cards.js, copied from functions/_markets.js)
const DAY = 24 * 3600e3;
export const SAID_MAX = 90, MSGS_MAX = 5, TOPICS_MAX = 6, STOCKS_MAX = 60;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const fin = Number.isFinite;
const clean = (v, n = 2000) => (typeof v === "string" ? v.slice(0, n * 2).replace(CTRL, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");
// (cut to n characters, an ellipsis last, never through a surrogate pair)
function cutTo(s, n) {
  if (s.length <= n) return s;
  let o = s.slice(0, n - 1);
  if (/[\ud800-\udbff]$/.test(o)) o = o.slice(0, -1);
  return `${o.trimEnd()}…`;
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// words that ask: a question mark at the end of a sentence (not one inside a web address)
const asks = (t) => /\?(?=$|[\s"'”’)\]])/.test(t);
const askBack = (t) => /How[’']s yours\?$/i.test(t);

// Your holdings, as patterns: the name whole (and without a trailing "plc", "Holdings", "Group" and the like), any case;
// the symbol's own letters ("TSCO" of "TSCO.L", "$TSCO"), in capitals. Never a name or a symbol of under 2 letters.
const SUFFIX = /\s+(?:plc|p\.l\.c\.?|holdings?|group|inc\.?|incorporated|ltd\.?|limited|corp\.?|corporation|co\.?|company|sa|s\.a\.?|ag|nv|n\.v\.?|se|&\s*co\.?)$/i;
function stockPatterns(stocks) {
  const out = [];
  for (const h of (Array.isArray(stocks) ? stocks : []).slice(0, STOCKS_MAX)) {
    if (!isObj(h)) continue;
    const sym = typeof h.sym === "string" && SYMBOL.test(h.sym) ? h.sym : null, name = clean(h.name, 60);
    if (!sym && !name) continue;
    const names = new Set();
    if (name.length >= 3) names.add(name);
    let bare = name.replace(/^the\s+/i, "");
    for (let i = 0; i < 3 && SUFFIX.test(bare); i++) bare = bare.replace(SUFFIX, "");
    if (bare.length >= 3) names.add(bare);
    const res = [...names].map((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escRe(n)}(?![\\p{L}\\p{N}])`, "iu"));
    const base = sym ? sym.replace(/^\^/, "").split(".")[0] : "";
    if (/^[A-Z][A-Z0-9-]{1,9}$/.test(base)) res.push(new RegExp(`(?<![\\p{L}\\p{N}])\\$?${escRe(base)}(?![\\p{L}\\p{N}])`, "u"));
    if (res.length) out.push({ sym, name: name || sym, res });
  }
  return out;
}

// (one message, as it's read here: its words and parts, or null where it isn't one that counts)
function msgOf(m, now) {
  if (!isObj(m) || !fin(m.at)) return null;
  if (fin(now) && (m.at > now || m.at <= now - DAY)) return null;
  return { at: m.at, text: clean(m.text), card: isObj(m.card) ? m.card : null, plan: isObj(m.plan), when: isObj(m.when), ask: isObj(m.ask), ans: isObj(m.ans) ? m.ans : null };
}
const invites = (m) => m.plan || m.when || (m.ans?.a === "later" && (isObj(m.ans.plan) || fin(m.ans.start)));
const asksBack = (m) => m.ask || (!!m.card && askBack(m.text));

function topicsOf(msgs, pats) {
  const out = new Map();
  const add = (key, t) => { const was = out.get(key); if (was) was.asked = was.asked || t.asked; else out.set(key, t); };
  for (const m of [...msgs].reverse()) {                  // (newest first: each topic says when it was last said)
    const q = asks(m.text), c = m.card;
    if (c && typeof c.kind === "string") {
      const asked = q || asksBack(m);
      if (c.kind === "markets") {
        const sym = typeof c.snap?.sym === "string" && SYMBOL.test(c.snap.sym) ? c.snap.sym : null;
        if (sym) add(`markets:${sym}`, { kind: "markets", sym, name: clean(c.snap.name, 60) || sym, at: m.at, asked, via: "card" });
      } else if (c.kind === "weather" || c.kind === "fitness") add(c.kind, { kind: c.kind, at: m.at, asked, via: "card" });
    }
    if (!m.text) continue;
    for (const p of pats) if (p.res.some((re) => re.test(m.text))) add(`markets:${p.sym || p.name}`, { kind: "markets", sym: p.sym, name: p.name, at: m.at, asked: q, via: "words" });
  }
  return [...out.values()].slice(0, TOPICS_MAX);
}

// the newest messages' words joined, as many as fit; the newest alone cut to fit
function saidOf(msgs) {
  const parts = [];
  let len = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = msgs[i].text;
    if (!t) continue;
    if (parts.length && len + 1 + t.length > SAID_MAX) break;
    parts.unshift(t); len += (parts.length > 1 ? 1 : 0) + t.length;
  }
  return cutTo(parts.join(" "), SAID_MAX);
}

export function waitingDigest(items, { stocks, now } = {}) {
  const pats = stockPatterns(stocks), best = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (!isObj(it) || typeof it.id !== "string" || !it.id || it.id.length > 64) continue;
    const msgs = (Array.isArray(it.msgs) ? it.msgs : []).map((m) => msgOf(m, now)).filter(Boolean).sort((a, b) => a.at - b.at).slice(-MSGS_MAX);
    if (!msgs.length) continue;
    const at = msgs[msgs.length - 1].at, stale = fin(it.at) && at < it.at;
    const kind = msgs.some(invites) ? "invite" : msgs.some(asksBack) ? "ask" : msgs.some((m) => asks(m.text)) ? "question" : "message";
    const row = { id: it.id, first: clean(it.first, 40), at, said: stale ? "" : saidOf(msgs), kind, topics: topicsOf(msgs, pats) };
    const was = best.get(it.id);
    if (!was || row.at > was.at) best.set(it.id, row);
  }
  return [...best.values()].sort((a, b) => b.at - a.at);
}
