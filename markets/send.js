// Markets' "Send in Chat": a stock's day as a card for Chat (pigeon/cards.js: the same shape, made here from the quote
// the page already has), and the way to Chat with it. The card carries the day's move in percent only: never a price,
// a value, what you hold or any amount in pounds. Chat draws it in the letter, and looks the percent up again for the
// friend, from the symbol (a public quote). Nothing here asks anything of a server: the card goes in the address's
// fragment, which never reaches one.
// (no page in it: node imports it too, for the tests)

// (Markets' own rule for a symbol, as functions/_markets.js has it, and as Chat checks it)
const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;
const CTRL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
// the trading day a quote is for, on its exchange's own clock ("2026-11-01")
function dayIn(tz, t) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)); }
  catch (_) { return new Date(t).toISOString().slice(0, 10); }
}

// The card (pigeon/cards.js §1.2, from "markets") for one symbol: sym as Markets has it, name as the page shows it, q
// the page's quote for it (S.q[sym]: only its chgPct, tz and time are read), now in ms. → card, or null (no move to
// send, or a symbol Chat wouldn't take: then the words go on their own)
export function stockSendCard(sym, name, q, now = Date.now()) {
  if (typeof sym !== "string" || !SYMBOL.test(sym) || !q || typeof q.chgPct !== "number" || !Number.isFinite(q.chgPct)) return null;
  const pct = Math.round(q.chgPct * 100) / 100;
  if (pct < -100 || pct > 1000) return null;
  const nm = String(name || sym).replace(CTRL, " ").replace(/\s+/g, " ").trim().slice(0, 60) || sym;
  const t = Number.isFinite(q.time) && q.time > 0 ? q.time * 1000 : now;
  const say = Math.abs(pct) < 0.005 ? `${nm} is unchanged today.` : `${nm} is ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)}% today.`;
  return { v: 1, kind: "markets", from: "markets", at: Math.round(now), say, snap: { name: nm, sym, pct, day: dayIn(q.tz, t) }, ref: { sym } };
}

// (the same four lines as Chat's own, pigeon/cards.js: the words first, so an older Chat still finds them; the card
// beside them, unless it's too long for an address)
const b64url = (s) => { let b = ""; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export function chatHash(words, card) {
  const packed = card ? b64url(JSON.stringify(card)) : "";
  return `#${new URLSearchParams(packed && packed.length <= 6000 ? { share: words, card: packed } : { share: words })}`;
}
