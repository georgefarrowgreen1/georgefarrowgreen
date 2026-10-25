// Your georgefarrowgreen.com account, in Weather: signing in (on the account's own page, where every app on the site
// signs in, and handed back here: functions/_handback.js), and keeping your saved places, settings and notifications in
// step with it, so they're the same on every phone and computer you're signed in on (functions/_wxacct.js). The sign-in
// is the site's: signed in anywhere on it in this browser, Weather is too, and signing out (on the account's own page)
// signs you out everywhere on it in this browser. The page never holds the sign-in itself (the browser keeps it, out of
// any page's reach); it asks with it.

const API = "/api/weather";
async function call(path, { method = "GET", body } = {}) {
  let r;
  try { r = await fetch(`${API}/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", signal: AbortSignal.timeout(20000) }); }
  catch (_) { throw Object.assign(new Error("You're offline. Try again when you're back online."), { offline: true }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw Object.assign(new Error(j.error || `Something went wrong (${r.status}).`), { status: r.status });
  return { status: r.status, ...j };
}
// who's signed in, and what's kept: { signedIn, name, handle, ver, data: { places, settings, notify }, devices }
export const me = () => call("me");
// this device's notifications its own again, signed out somewhere else (its push address is what shows it's this device)
export const leave = (endpoint) => call("leave", { method: "POST", body: { endpoint } });
// a change, made from version base: { ver, data } as kept now; or { conflict, ver, data } where it's moved on meanwhile
export const save = (base, data) => call("me", { method: "PUT", body: { base, data } });

// ---- the account's own page, opened signed in as you: a code good once, for a minute (functions/_wxacct.js) ----
export const accountLink = () => call("account-link", { method: "POST", body: {} });
// signing out (everywhere on the site, in this browser): for an account that isn't yours, signed in elsewhere
// (endpoint: this device's push address, if it has notifications, so they stay on as its own)
export const signOut = (endpoint) => call("signout", { method: "POST", body: endpoint ? { endpoint } : {} });
export const photoUrl = (at) => `${API}/me/photo?v=${at}`;

// ---- signing in, on the account's page ----
// A word for this sign-in, kept on this device till it's used: its hash (ask) goes to the account's page, and the code
// that comes back is good only with the word itself (functions/_handback.js)
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function signInWord() {
  const word = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return { word, ask: b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(word))) };
}
// the code it came back with, and the word, swapped for the sign-in: the account, as me() has it
export const handback = (code, verifier) => call("handback", { method: "POST", body: { code, verifier } });

// ---- in step ----
// The most places notifications can be on for: the server's MAX_PLACES (functions/_wxpush.js), which refuses more
export const MAX_NOTIFY = 12;
// A place's key: two decimal places (about a kilometre), as the app tells places apart when it saves them
export const keyOf = (p) => `${Number(p.lat).toFixed(2)},${Number(p.lon).toFixed(2)}`;
// The saved places, kept here and kept with the account, put together: the account's (in its order) less any this
// device has taken away since they were last in step (base: the keys then), and any this device has added since
export function mergePlaces(theirs, mine, base) {
  const was = new Set(base), have = new Set(mine.map(keyOf)), out = [], seen = new Set();
  for (const p of theirs) { const k = keyOf(p); if (seen.has(k) || (was.has(k) && !have.has(k))) continue; seen.add(k); out.push(p); }
  for (const p of mine) { const k = keyOf(p); if (seen.has(k) || was.has(k)) continue; seen.add(k); out.push(p); }
  return out;
}
// The settings, the same way, setting by setting: each one this device has changed since they were last in step (base:
// the settings then) this device's, the rest the account's (keys: the settings kept with it; canon: one as words, its
// keys in order, so the same setting always reads the same)
export function mergeSettings(theirs, mine, base, keys, canon) {
  const b = base || {};
  return Object.fromEntries(keys.map((k) => [k, canon(mine[k]) !== canon(b[k]) ? mine[k] : (theirs?.[k] ?? mine[k])]));
}
// A place as notifications know it: My Location is "gps", wherever it is on whichever device last moved it
export const nkeyOf = (p) => (p.gps ? "gps" : keyOf(p));
// What's changed between two lots of notification choices: the places (by nkeyOf) whose choice differs, "brief", and
// "email" (the warnings and the briefing by email too)
export function notifyChanges(now, was) {
  const of = (n) => new Map((n?.places || []).map((p) => [nkeyOf(p), `${!!p.rain}${!!p.warn}`])), a = of(now), b = of(was), out = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) out.push(k);
  const brief = (n) => JSON.stringify([n?.brief ? nkeyOf(n.brief) : null, n?.briefAt || "07:00"]);
  if (brief(now) !== brief(was)) out.push("brief");
  const email = (n) => `${!!n?.email?.warn}${!!n?.email?.brief}`;
  if (email(now) !== email(was)) out.push("email");
  return out;
}
// Which notifications for which places, the same way: the account's choice for a place, unless this device changed it
// since (changed: the places it changed, "brief" and "email"), and this device's for the places it chose since
export function mergeNotify(theirs, mine, changed) {
  const ch = new Set(changed), here = new Map((mine?.places || []).map((p) => [nkeyOf(p), p])), out = new Map();
  // (in the account's order, then any new here)
  for (const p of theirs?.places || []) { const k = nkeyOf(p); if (!ch.has(k)) out.set(k, p); else if (here.has(k)) out.set(k, here.get(k)); }
  for (const [k, p] of here) if (ch.has(k) && !out.has(k)) out.set(k, p);
  const brief = ch.has("brief") ? mine?.brief ?? null : theirs?.brief ?? null, briefAt = ch.has("brief") ? mine?.briefAt : theirs?.briefAt || mine?.briefAt;
  const email = ch.has("email") ? mine?.email : theirs?.email;
  return { places: [...out.values()].filter((p) => p.rain || p.warn), brief, briefAt: briefAt || "07:00", email: { warn: !!email?.warn, brief: !!email?.brief } };
}
