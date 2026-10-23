// Your georgefarrowgreen.com account, in Weather: signing in (a passkey, or your email and password), and keeping your
// saved places, settings and notifications in step with it, so they're the same on every phone and computer you're
// signed in on (functions/_wxacct.js). The sign-in is the site's: signed in anywhere on it in this browser, Weather is
// too, and signing out (on the account's own page) signs you out everywhere on it in this browser. The page never holds
// the sign-in itself (the browser keeps it, out of any page's reach); it asks with it.

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
export const signOut = () => call("signout", { method: "POST", body: {} });
export const photoUrl = (at) => `${API}/me/photo?v=${at}`;

// ---- signing in ----
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
export const passkeysWork = () => !!(window.PublicKeyCredential && navigator.credentials?.get);
export async function withPasskey() {
  const o = await call("signin/options", { method: "POST", body: {} });
  let a;
  try { a = await navigator.credentials.get({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000 } }); }
  catch (e) { throw new Error(e?.name === "NotAllowedError" ? "No passkey was used." : "Your passkey couldn't be used here."); }
  if (!a) throw new Error("No passkey was used.");
  return call("signin/passkey", { method: "POST", body: { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
    authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) } });
}
// The password, stretched on this device as everywhere on the site (Argon2id, 64 MiB and 3 passes, for a salt marked
// "a2:"; PBKDF2 for an account from before), into the proof the server checks: the password itself never leaves here
async function proofOf(password, salt) {
  const pw = new TextEncoder().encode(String(password).normalize("NFKC"));
  let bits;
  if (String(salt).startsWith("a2:")) {
    const m = await import("./argon2.js"), argon2id = m?.argon2id || m?.default?.argon2id || globalThis.hashwasm.argon2id;
    bits = await argon2id({ password: pw, salt: fromB64url(salt.slice(3)), parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 64, outputType: "binary" });
  } else {
    const base = await crypto.subtle.importKey("raw", pw, "PBKDF2", false, ["deriveBits"]);
    bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64url(salt), iterations: 600000 }, base, 512));
  }
  return b64url(bits.slice(32));
}
export async function withPassword(email, password) {
  const { salt } = await call("signin/salt", { method: "POST", body: { email } });
  return call("signin/password", { method: "POST", body: { email, proof: await proofOf(password, salt) } });
}

// ---- in step ----
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
// A place as notifications know it: My Location is "gps", wherever it is on whichever device last moved it
export const nkeyOf = (p) => (p.gps ? "gps" : keyOf(p));
// What's changed between two lots of notification choices: the places (by nkeyOf) whose choice differs, and "brief"
export function notifyChanges(now, was) {
  const of = (n) => new Map((n?.places || []).map((p) => [nkeyOf(p), `${!!p.rain}${!!p.warn}`])), a = of(now), b = of(was), out = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) out.push(k);
  const brief = (n) => JSON.stringify([n?.brief ? nkeyOf(n.brief) : null, n?.briefAt || "07:00"]);
  if (brief(now) !== brief(was)) out.push("brief");
  return out;
}
// Which notifications for which places, the same way: the account's choice for a place, unless this device changed it
// since (changed: the places it changed, and "brief"), and this device's for the places it chose since
export function mergeNotify(theirs, mine, changed) {
  const ch = new Set(changed), here = new Map((mine?.places || []).map((p) => [nkeyOf(p), p])), out = new Map();
  // (in the account's order, then any new here)
  for (const p of theirs?.places || []) { const k = nkeyOf(p); if (!ch.has(k)) out.set(k, p); else if (here.has(k)) out.set(k, here.get(k)); }
  for (const [k, p] of here) if (ch.has(k) && !out.has(k)) out.set(k, p);
  const brief = ch.has("brief") ? mine?.brief ?? null : theirs?.brief ?? null, briefAt = ch.has("brief") ? mine?.briefAt : theirs?.briefAt || mine?.briefAt;
  return { places: [...out.values()].filter((p) => p.rain || p.warn), brief, briefAt: briefAt || "07:00" };
}
