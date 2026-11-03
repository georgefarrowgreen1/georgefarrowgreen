// What a friend said, in a line, for Today's Waiting for You (Today First, spec §7.4): run by Chat's engine on the
// phone, over messages it has just decrypted in memory, so the words never leave it. Pure: no fetch, no storage, no
// clock (the time is passed in), and it imports nothing.
//   waitingDigest(items: [{ id, first, at?, msgs: [{ text, card?, plan?, when?, ask?, ans?, at }] }], { stocks, now })
//   → [{ id, first, at, said, kind: "invite" | "ask" | "question" | "message", topics }], newest first
// - items: one per friend (or group) the server named, with that friend's messages since your last one in the chat
//   (the engine takes at most 5; so does this), each as Chat's payloadParts read it (text: its words; at: when it
//   landed). The item's at: the server's time of their newest message, where it's known.
// - Only messages that have landed and are under a day old count (none: the friend is left out). Landed: at or before
//   now, give or take half a minute for the phone's clock, or before the server's at (it says they had by then).
// - said: the newest messages joined (oldest first), as many as fit in 90 characters; the newest alone cut to fit.
//   The stale rule: where the newest message here is older than the server's at (the engine couldn't read the newer
//   one yet), said is "", so old words never sit beside a new message. (Today's merge holds to the same rule.)
// - kind: "invite" for a ride or a time offered (a plan, a when, or a ride's "later" answer with its time), "ask" for an
//   open "How's yours?", "question" for words that ask, else "message".
// - topics (newest first, at most 6): from cards ({ kind: "weather" | "fitness" } or { kind: "markets", sym, name }),
//   and your holdings (stocks: [{ sym, name }]) named by name or by symbol in any of the messages ({ kind: "markets",
//   sym, name }); each with at (when said), asked (in a message that asks) and via ("card" | "words"). A name that's
//   also an everyday word (Next, Target, Apple) counts only with its capital, and not as a sentence's first word.
// - Never throws, on any engine: a holding whose pattern won't build is left out, and one bad item costs only its row.

const CTRL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;          // (as pigeon/cards.js, copied from functions/_markets.js)
const DAY = 24 * 3600e3, SKEW_MS = 30e3;                 // (how far the phone's clock may run behind the server's)
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
// A name of one word that's also an everyday word ("Next plc" said bare, "Target", "Apple") counts only with its
// capital and not as a sentence's first word ("Dinner next week?", "on target", "apple pie" and "Next week?" name no
// stock); its full name or its symbol always does. (No lookbehind, which Safari before 16.4 can't build: the character
// before a name is matched instead; and each pattern is built on its own, so one that won't build loses only itself.)
const SUFFIX = /\s+(?:plc|p\.l\.c\.?|holdings?|group|inc\.?|incorporated|ltd\.?|limited|corp\.?|corporation|co\.?|company|sa|s\.a\.?|ag|nv|n\.v\.?|se|&\s*co\.?)$/i;
const ORDINARY = new Set(("next target shell apple visa snap block sage compass unite admiral phoenix smiths man just wise arm senior " +
  "future reach diploma genus capita persimmon kingfisher prudential weir flutter endeavour hays rank evoke carnival restaurant " +
  "meta alphabet oracle intel ford gap square adobe micron chevron caterpillar progressive travelers southern ball crown match zoom " +
  "unity lucid booking juniper cognizant workday snowflake cadence tapestry coach chipotle occidental conduit sabre marshalls go-ahead").split(" "));
const BEFORE = "(^|[^\\p{L}\\p{N}])", AFTER = "(?![\\p{L}\\p{N}])";
const reOf = (src, flags) => { try { return new RegExp(src, flags); } catch (_) { return null; } };
// (a match of re, whose first group is the character before, that isn't a sentence's first word)
function midSentence(text, re) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index + m[1].length).replace(/[\s"'“”‘’()[\]]+$/, "");
    if (/[\p{L}\p{N}]/u.test(before) && !/[.!?…]$/.test(before)) return true;
  }
  return false;
}
function stockPatterns(stocks) {
  const out = [];
  for (const h of (Array.isArray(stocks) ? stocks : []).slice(0, STOCKS_MAX)) {
    try {
      if (!isObj(h)) continue;
      const sym = typeof h.sym === "string" && SYMBOL.test(h.sym) ? h.sym : null, name = clean(h.name, 60);
      if (!sym && !name) continue;
      const names = new Set();
      if (name.length >= 3) names.add(name);
      let bare = name.replace(/^the\s+/i, "");
      for (let i = 0; i < 4; i++) { const b = bare.replace(/[\s,.]+$/, "").replace(SUFFIX, ""); if (b === bare) break; bare = b; }
      if (bare.length >= 3) names.add(bare);
      const tests = [];
      for (const n of names) {
        if (!/\s/.test(n) && ORDINARY.has(n.toLowerCase())) {
          const cap = n === n.toUpperCase() ? n[0] + n.slice(1).toLowerCase() : n[0].toUpperCase() + n.slice(1);      // ("NEXT", "next": Next)
          const re = reOf(`${BEFORE}(${escRe(cap)})${AFTER}`, "gu");
          if (re) tests.push((t) => midSentence(t, re));
        } else {
          const re = reOf(`${BEFORE}${escRe(n)}${AFTER}`, "iu");
          if (re) tests.push((t) => re.test(t));
        }
      }
      const base = sym ? sym.replace(/^\^/, "").split(".")[0] : "";
      if (/^[A-Z][A-Z0-9-]{1,9}$/.test(base)) { const re = reOf(`${BEFORE}\\$?${escRe(base)}${AFTER}`, "u"); if (re) tests.push((t) => re.test(t)); }
      if (tests.length) out.push({ sym, name: name || sym, tests });
    } catch (_) {}
  }
  return out;
}

// (one message, as it's read here: its words, each of its lines (for the names: a line starts a sentence) and parts, or
// null where it isn't one that counts. landedBy: the latest it may have landed, by the phone's clock or the server's)
function msgOf(m, now, landedBy) {
  if (!isObj(m) || !fin(m.at)) return null;
  if (fin(now) && (m.at > landedBy || m.at <= now - DAY)) return null;
  const raw = typeof m.text === "string" ? m.text.slice(0, 4000) : "";
  return { at: m.at, text: clean(raw), lines: raw.split(/[\r\n\u2028\u2029]+/).map((l) => clean(l)).filter(Boolean),
    card: isObj(m.card) ? m.card : null, plan: isObj(m.plan), when: isObj(m.when), ask: isObj(m.ask), ans: isObj(m.ans) ? m.ans : null };
}
const invites = (m) => m.plan || m.when || (m.ans?.a === "later" && isObj(m.ans.plan));     // (a ride's "later" is a time to say yes to)
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
    for (const p of pats) if (p.tests.some((f) => m.lines.some(f))) add(`markets:${p.sym || p.name}`, { kind: "markets", sym: p.sym, name: p.name, at: m.at, asked: q, via: "words" });
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
  let pats = [];
  try { pats = stockPatterns(stocks); } catch (_) {}
  const best = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    try {
      if (!isObj(it) || typeof it.id !== "string" || !it.id || it.id.length > 64) continue;
      const landedBy = Math.max(fin(now) ? now + SKEW_MS : -Infinity, fin(it.at) ? it.at : -Infinity);
      const msgs = (Array.isArray(it.msgs) ? it.msgs : []).map((m) => msgOf(m, now, landedBy)).filter(Boolean).sort((a, b) => a.at - b.at).slice(-MSGS_MAX);
      if (!msgs.length) continue;
      const at = msgs[msgs.length - 1].at, stale = fin(it.at) && at < it.at;
      const kind = msgs.some(invites) ? "invite" : msgs.some(asksBack) ? "ask" : msgs.some((m) => asks(m.text)) ? "question" : "message";
      const row = { id: it.id, first: clean(it.first, 40), at, said: stale ? "" : saidOf(msgs), kind, topics: topicsOf(msgs, pats) };
      const was = best.get(it.id);
      if (!was || row.at > was.at) best.set(it.id, row);
    } catch (_) {}
  }
  return [...best.values()].sort((a, b) => b.at - a.at);
}
