// Your georgefarrowgreen.com account, in Fitness: signing in (on the account's own page, where every app on the site
// signs in, and handed back here: functions/_handback.js), and keeping your record and your activities with it, so
// they're the same on every phone and computer you're signed in on (functions/_fitness.js). The sign-in is the site's:
// signed in anywhere on it in this browser, Fitness is too. The page never holds the sign-in itself (the browser keeps
// it, out of any page's reach); it asks with it.

const API = "/api/fitness";
// (iOS 15 has no AbortSignal.timeout: the same, by hand, as the account's page and Weather have)
if (typeof AbortSignal !== "undefined" && !AbortSignal.timeout) AbortSignal.timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
async function call(path, { method = "GET", body, form, raw = false, wait = 30000 } = {}) {
  let r;
  try {
    r = await fetch(`${API}/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: form || (body ? JSON.stringify(body) : undefined),
      credentials: "same-origin", signal: AbortSignal.timeout(wait) });
  } catch (_) { throw Object.assign(new Error("You’re offline. Try again when you’re back online."), { offline: true }); }
  if (raw && r.ok) return new Uint8Array(await r.arrayBuffer());
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw Object.assign(new Error(j.error || `Something went wrong (${r.status}).`), { status: r.status });
  return { status: r.status, ...j };
}
// who's signed in, your record and your activities: { signedIn, name, handle, photoAt, ver, data, acts }
export const me = () => call("me");
// a change to the record, made from version base: { ver, data } as kept now; or { conflict, ver, data } where it's
// moved on meanwhile
export const save = (base, data) => call("me", { method: "PUT", body: { base, data } });
// an activity: its figures (meta) and its file as it was imported → { kept } or { already }
export function upload(meta, name, bytes) {
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  form.append("file", new Blob([bytes]), name);
  return call("acts", { method: "POST", form, wait: 120000 });
}
// an activity's file, as it was before it was gzipped (one kept before that, as it is)
export const fileOf = async (id) => gunzip(await call(`acts/${encodeURIComponent(id)}`, { raw: true, wait: 60000 }));
// its file again, made smaller here (written as FIT, gzipped) → { kept, size }
export function replaceFile(id, meta, name, bytes) {
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  form.append("file", new Blob([bytes]), name);
  return call(`acts/${encodeURIComponent(id)}`, { method: "PUT", form, wait: 120000 });
}
// Files gzipped here before they're kept, and unpacked as they come back (the browser's own (de)compression; one that
// has none sends them as they are)
const pipe = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
export const canGzip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";
export const gzip = async (u8) => (canGzip() ? pipe(u8, new CompressionStream("gzip")) : u8);
export const gunzip = async (u8) => (u8.length > 18 && u8[0] === 0x1f && u8[1] === 0x8b ? pipe(u8, new DecompressionStream("gzip")) : u8);
export const rename = (id, name) => call(`acts/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } });
export const setRoute = (id, route) => call(`acts/${encodeURIComponent(id)}`, { method: "PATCH", body: { route } });
export const remove = (id) => call(`acts/${encodeURIComponent(id)}`, { method: "DELETE" });

// ---- the account's own page ----
// (beside this app's own address: fitness.<site> → account.<site>; nowhere else is there one to sign in on)
export const accountPage = () => (location.hostname.startsWith("fitness.") ? `${location.origin.replace("//fitness.", "//account.")}/` : null);
// opened signed in as you: a code good once, for a minute (functions/api/fitness account-link)
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
// the code it came back with, and the word, swapped for the sign-in: the account, as me() has it
export const handback = (code, verifier) => call("handback", { method: "POST", body: { code, verifier } });

// ---- in step ----
// Your record as this device has it, put together with the account's where another device changed it meanwhile: each
// part this device has changed since they were last in step (dirty) this device's, the rest the account's. The days of
// swaps and of how you felt are joined (this device's winning where both have one; but a plan chosen here starts its
// swaps afresh), and so are your own workouts: one added on either kept, one deleted on either gone (base: the workouts'
// ids when the two were last in step, so a workout missing from one is known to be new or gone)
export function merge(theirs, mine, dirty, base = []) {
  const out = { ...(theirs || {}) }, was = new Set(base);
  for (const k of dirty) {
    if ((k === "swaps" && !dirty.has("plan")) || k === "feel") out[k] = { ...(theirs?.[k] || {}), ...(mine[k] || {}) };
    else if (k === "workouts") {
      const ws = (d) => (Array.isArray(d?.workouts) ? d.workouts : []), theirIds = new Set(ws(theirs).map((w) => w.id)), myIds = new Set(ws(mine).map((w) => w.id));
      out.workouts = [...ws(mine).filter((w) => theirIds.has(w.id) || !was.has(w.id)), ...ws(theirs).filter((w) => !myIds.has(w.id) && !was.has(w.id))];
    } else out[k] = mine[k];
  }
  return out;
}
// (the workouts' ids in a record: what merge's base is made of)
export const workoutIds = (d) => (Array.isArray(d?.workouts) ? d.workouts.map((w) => w.id) : []);
// Garmin Connect, by your Personal API key (functions/_garmin.js): { on, ok, said, last, waiting: [{ id, start, name }] }
export const garmin = () => call("garmin");
export const garminConnect = (key) => call("garmin", { method: "POST", body: { key }, wait: 120000 });
export const garminDisconnect = () => call("garmin", { method: "DELETE" });
export const garminFetch = (force = false) => call("garmin/fetch", { method: "POST", body: { force }, wait: 120000 });
export const garminFile = (id) => call(`garmin/new/${encodeURIComponent(id)}`, { raw: true, wait: 60000 });
export const garminDone = (id) => call(`garmin/new/${encodeURIComponent(id)}`, { method: "DELETE" });
