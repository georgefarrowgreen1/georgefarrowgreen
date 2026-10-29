// Your account, in Markets: signing in (on the account's own page, where every app on the site signs in, and handed back
// here: functions/_handback.js), and your list kept with it, the same on every phone and computer you're signed in on
// (functions/_markets.js). The page never holds the sign-in itself (the browser keeps it, out of any page's reach); it
// asks with it.

const API = "/api/markets";
if (typeof AbortSignal !== "undefined" && !AbortSignal.timeout) AbortSignal.timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
async function call(path, { method = "GET", body, wait = 30000 } = {}) {
  let r;
  try {
    r = await fetch(`${API}/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", signal: AbortSignal.timeout(wait) });
  } catch (_) { throw Object.assign(new Error("You’re offline. Try again when you’re back online."), { offline: true }); }
  return answer(r);
}
async function answer(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Something went wrong (${r.status}).`), { status: r.status });
  return j;
}
const list = (syms) => syms.map(encodeURIComponent).join(",");
// who's signed in, your list, its prices and the markets' (the one theme.js asked for as the page was read: taken up once)
export function me() {
  const early = globalThis.mkEarly;
  globalThis.mkEarly = null;
  if (early) return early.then((r) => answer(r), () => call("me"));
  return call("me");
}
export const quotes = (syms) => call(`quotes?s=${list(syms)}`);
export const chart = (sym, r) => call(`chart?s=${encodeURIComponent(sym)}&r=${r}`);
export const years = (syms) => call(`years?s=${list(syms)}`, { wait: 60000 });
export const news = (syms) => call(`news?s=${list(syms)}`);
export const search = (q) => call(`search?q=${encodeURIComponent(q)}`);
export const putHolding = (h) => call("holding", { method: "PUT", body: h });
export const dropHolding = (sym) => call(`holding?s=${encodeURIComponent(sym)}`, { method: "DELETE" });
export const order = (symbols) => call("order", { method: "PUT", body: { symbols } });
export const setAlert = (symbol, on, pct = 3) => call("alert", { method: "PUT", body: { symbol, on, pct } });
export const pushKey = () => call("push-key");
export const pushOn = (sub) => call("push", { method: "POST", body: { sub } });
export const pushOff = (endpoint) => call("push", { method: "DELETE", body: { endpoint } });

// ---- the account's own page ----
// (beside this app's own address: markets.<site> → account.<site>; nowhere else is there one to sign in on)
export const accountPage = () => (location.hostname.startsWith("markets.") ? `${location.origin.replace("//markets.", "//account.")}/` : null);
// and Chat, beside it, for sending a stock to a friend
export const chatPage = () => (location.hostname.startsWith("markets.") ? `${location.origin.replace("//markets.", "//chat.")}/` : null);
export const accountLink = () => call("account-link", { method: "POST", body: {} });
export const signOut = () => call("signout", { method: "POST", body: {} });
export const photoUrl = (at) => `${API}/me/photo?v=${at}`;

// ---- signing in, on the account's page ----
// A word for this sign-in, kept on this device till it's used: its hash (ask) goes to the account's page, and the code
// that comes back is good only with the word itself (functions/_handback.js)
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function signInWord() {
  const word = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return { word, ask: b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(word))) };
}
export const handback = (code, verifier) => call("handback", { method: "POST", body: { code, verifier } });
