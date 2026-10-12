// InFlight — the phone app. Everything readable is encrypted and decrypted
// here; the server (functions/api/pigeon) only ever sees ciphertext.
import { E2E, te, rand, b64, b64url, fromB64url, uuid } from "./crypto.js";
import { LAND } from "./land.js";
import { PLACES, nearestPlace } from "./places.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SPEED_KMH = 80, SWIFT_MAX = 7;
const POLL_MS = 15000;
const AUTH_VIEWS = new Set(["welcome", "signup", "making", "signin", "unlock", "roostpick", "pkoffer", "forgot", "reset"]);

/* ---------------- state ---------------- */
const S = {
  token: null, me: null, priv: null, secretJwk: null, fp: "",
  friends: [], incoming: [], outgoing: [], passkeys: [], skew: 0,
  view: "loading", chat: null, sheet: null, flash: "", err: "",
  msgs: new Map(), turns: new Map(), plain: new Map(), photos: new Map(), photoGone: new Set(),
  pairs: new Map(), pins: {}, attach: null, busy: false, stick: true, making: 0,
  pendingUnlock: null, pendingAdd: null, offline: false, seenLanded: new Set(),
  resetToken: null, resetInfo: null,
};
const now = () => Date.now() + S.skew;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- this phone's storage (IndexedDB) ----------------
   Holds the session token and the private key as a non-extractable CryptoKey:
   usable by this app, but not readable even by its own code. */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open("inflight", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res((this.db = r.result));
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("kv", mode), req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
    });
  },
  get(k) { return this.run("readonly", (s) => s.get(k)).catch(() => null); },
  set(k, v) { return this.run("readwrite", (s) => s.put(v, k)).catch(() => null); },
  del(k) { return this.run("readwrite", (s) => s.delete(k)).catch(() => null); },
};

/* ---------------- server ---------------- */
async function api(path, { method = "GET", body, form, raw } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let r;
  try { r = await fetch("/api/pigeon/" + path, { method, headers, body: payload }); }
  catch (_) { S.offline = true; renderOffline(); throw new Error("You’re offline. Check your connection and try again."); }
  if (S.offline) { S.offline = false; renderOffline(); }
  if (raw && r.ok) return r;
  let data = {};
  try { data = await r.json(); } catch (_) {}
  if (r.status === 401 && S.token && !/^(login|passkey-login)/.test(path)) { await forget(); go("welcome"); }
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again."), { status: r.status, field: data.field });
  return data;
}

/* ---------------- formatting ---------------- */
const pad2 = (n) => String(n).padStart(2, "0");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDur(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return "under a minute";
}
function fmtAgo(ts) {
  const ms = now() - ts;
  if (ms < MIN) return "now";
  if (ms < HOUR) return Math.floor(ms / MIN) + "m";
  if (ms < DAY) return Math.floor(ms / HOUR) + "h";
  return Math.floor(ms / DAY) + "d";
}
const fmtTime = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
function dayLabel(ts) {
  if (sameDay(ts, now())) return "Today";
  if (sameDay(ts, now() - DAY)) return "Yesterday";
  const d = new Date(ts); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
const fmtShort = (ts) => (sameDay(ts, now()) ? fmtTime(ts) : `${DOW[new Date(ts).getDay()]} ${fmtTime(ts)}`);
const fmtDate = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fmtMiles = (km) => Math.round(km * 0.621371).toLocaleString("en-GB") + " mi";
const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");
const initials = (n) => String(n).trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const first = (n) => String(n).trim().split(" ")[0];
const hue = (s) => ([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) % 5 + 1;
const avatar = (name, size = "") => `<span class="av ${size}" data-c="${hue(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
function haversineKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, s = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}
const flightMs = (km) => Math.min(3 * DAY, Math.max(5 * MIN, (km / SPEED_KMH) * HOUR));

/* ---------------- icons ---------------- */
const BIRD = document.getElementById("bird-path").getAttribute("d");
const ico = (d) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${d}</svg>`;
const I = {
  bird: `<svg viewBox="0 0 24 24" class="bird" aria-hidden="true"><path d="${BIRD}"/></svg>`,
  back: ico(`<path d="M15 5 8 12l7 7"/>`),
  chev: ico(`<path d="m9 5 7 7-7 7"/>`),
  map: ico(`<path d="M3 6.5 8.5 4l7 3L21 4.5v13L15.5 20l-7-3L3 19.5Z"/><path d="M8.5 4v13M15.5 7v13"/>`),
  pen: ico(`<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>`),
  addp: ico(`<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3 1.4 0 2.6.3 3.7 1"/><path d="M18 14v6M15 17h6"/>`),
  share: ico(`<path d="M12 3.5v11M8 7l4-4 4 4"/><path d="M6 11H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 19 11h-1"/>`),
  photo: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/>`),
  camera: ico(`<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.5"/>`),
  send: ico(`<path d="M12 19V6M6.5 11 12 5.5l5.5 5.5"/>`),
  check: ico(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  x: ico(`<path d="M6 6l12 12M18 6 6 18"/>`),
  pin: ico(`<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>`),
  gone: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 4l16 16"/>`),
  aviary: ico(`<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>`),
  roost: ico(`<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.9 3.8-6 7.5-6s6.6 2.1 7.5 6"/>`),
  key: ico(`<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2"/>`),
  face: ico(`<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5c1.4 1.2 3.6 1.2 5 0"/>`),
  eye: ico(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`),
  lock: ico(`<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`),
  dist: ico(`<circle cx="6" cy="17" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M7.8 15.6c2.5-1 3.2-3.4 5-5s3-2 3.6-2.2" stroke-dasharray="2 2.6"/>`),
  hourglass: ico(`<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 5-8 8.5s8 4 8 8.5"/>`),
  ok: ico(`<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.7L16 9.5"/>`),
  dot: ico(`<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>`),
  locate: ico(`<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>`),
  warn: ico(`<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17.2v.3"/>`),
};

/* ---------------- photos ---------------- */
async function loadBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch (_) {
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  }
}
// Downscale to 1600px and re-encode as JPEG. This also strips the photo's location metadata.
async function prepImage(blob) {
  const bmp = await loadBitmap(blob);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  if (!out) throw new Error("That photo couldn’t be prepared.");
  return { bytes: new Uint8Array(await out.arrayBuffer()), w: c.width, h: c.height, preview: URL.createObjectURL(out) };
}

/* ---------------- map ---------------- */
let LAND_RINGS = null;
function land() {
  if (!LAND_RINGS) LAND_RINGS = LAND.split(";").map((r) => { const a = r.split(",").map(Number); const out = []; for (let i = 0; i < a.length; i += 2) out.push([a[i] / 2, a[i + 1] / 2]); return out; });
  return LAND_RINGS;
}
function gcPoint(a, b, f) {
  const r = Math.PI / 180;
  const v = (p) => [Math.cos(p.lat * r) * Math.cos(p.lon * r), Math.cos(p.lat * r) * Math.sin(p.lon * r), Math.sin(p.lat * r)];
  const A = v(a), B = v(b);
  const w = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (w < 1e-9) return { lat: a.lat, lon: a.lon };
  const s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
  const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
  return { lat: Math.atan2(z, Math.hypot(x, y)) / r, lon: Math.atan2(y, x) / r };
}
const cssVar = (el, n) => getComputedStyle(el).getPropertyValue(n).trim();
function drawMap(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = (n) => cssVar(cv, n);
  const a = { lat: m.route[0], lon: m.route[1] }, b = { lat: m.route[2], lon: m.route[3] };
  const N = 96, pts = []; let prev = null;
  for (let i = 0; i <= N; i++) {
    const p = gcPoint(a, b, i / N);
    if (prev != null) { while (p.lon - prev > 180) p.lon -= 360; while (p.lon - prev < -180) p.lon += 360; }
    prev = p.lon; pts.push(p);
  }
  const usableH = H - cardH - 30;
  const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
  const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cos = Math.max(0.35, Math.cos(cy * Math.PI / 180));
  const spanX = Math.max(8, (Math.max(...lons) - Math.min(...lons)) * 1.5) * cos;
  const spanY = Math.max(5, (Math.max(...lats) - Math.min(...lats)) * 1.6 + 6);
  const k = Math.min(W / spanX, usableH / spanY);
  const X = (lon) => W / 2 + (lon - cx) * cos * k, Y = (lat) => 20 + usableH / 2 - (lat - cy) * k;
  g.fillStyle = col("--sea"); g.fillRect(0, 0, W, H);
  g.strokeStyle = col("--grid"); g.lineWidth = 1;
  const step = spanY > 40 ? 15 : spanY > 15 ? 5 : 1;
  for (let lon = -540; lon <= 540; lon += step) { const x = X(lon); if (x < 0 || x > W) continue; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let lat = -90; lat <= 90; lat += step) { const y = Y(lat); if (y < 0 || y > H) continue; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = col("--land"); g.strokeStyle = col("--land-edge"); g.lineWidth = 0.8;
  for (const off of [-360, 0, 360]) for (const ring of land()) {
    g.beginPath(); ring.forEach(([lo, la], i) => (i ? g.lineTo(X(lo + off), Y(la)) : g.moveTo(X(lo + off), Y(la)))); g.closePath(); g.fill(); g.stroke();
  }
  const P = pts.map((p) => [X(p.lon), Y(p.lat)]);
  g.strokeStyle = col("--bark"); g.lineWidth = 3.5; g.setLineDash([11, 8]); g.lineCap = "round";
  g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
  // each label sits above or below its dot, away from the route, far enough out that the pigeon never covers it
  g.font = "600 13px -apple-system, system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
  const label = ([x, y], toward, name) => {
    g.fillStyle = col("--card"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.fillStyle = col("--bark"); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    if (!name) return;
    const w = g.measureText(name).width, ly = y + (toward[1] <= y ? 28 : -28), lx = Math.min(W - 8 - w, Math.max(8, x - w / 2));
    g.lineWidth = 4; g.strokeStyle = col("--card"); g.lineJoin = "round"; g.strokeText(name, lx, ly);
    g.fillStyle = col("--ink"); g.fillText(name, lx, ly);
  };
  label(P[0], P[4], m.fromPlace); label(P[N], P[N - 4], m.toPlace);
  const f = Math.min(1, Math.max(0, (now() - m.sentAt) / (m.deliverAt - m.sentAt)));
  const [px, py] = P[Math.round(f * N)];
  const bird = new Path2D(BIRD), flip = P[N][0] > P[0][0] ? -1 : 1;   // the icon faces left
  g.save(); g.translate(px, py); g.scale(1.6 * flip, 1.6); g.translate(-12, -11);
  g.lineWidth = 3; g.strokeStyle = col("--card"); g.stroke(bird); g.fillStyle = col("--ink"); g.fill(bird);
  g.restore();
}

/* ============================================================
   Keys and accounts
   ============================================================ */
async function useKeys(token, me, privJwk) {
  S.token = token; S.me = me;
  S.secretJwk = privJwk;                          // memory only: lets a new passkey lock its own copy
  S.priv = await E2E.importPriv(privJwk);
  S.fp = await E2E.fingerprint(me.pub);
  S.pairs = new Map(); S.plain = new Map(); S.msgs = new Map();
  S.pins = (await idb.get("pins:" + me.id)) || {};
  const saved = await idb.set("session", { token, me, priv: S.priv });
  if (saved === null) console.warn("InFlight: couldn’t save the session on this phone; you’ll sign in again next time.");
}
async function forget() {
  S.photos.forEach((u) => URL.revokeObjectURL(u));
  Object.assign(S, { token: null, me: null, priv: null, secretJwk: null, fp: "", friends: [], incoming: [], outgoing: [], passkeys: [],
    msgs: new Map(), plain: new Map(), photos: new Map(), photoGone: new Set(), pairs: new Map(), chat: null, sheet: null, pendingUnlock: null });
  clearAttach();
  await idb.del("session");
}
async function createAccount(v) {
  const { privJwk, pub } = await E2E.newIdentity();
  S.making = 1; render();
  const salt = rand(16);
  const { lockKey, proof } = await E2E.fromPassword(v.password, salt);
  const vault = await E2E.lock(lockKey, { ecdh: privJwk });
  S.making = 2; render();
  const r = await api("signup", { method: "POST", body: { name: v.name, handle: v.handle, email: v.email, salt: b64url(salt), proof, vault, pub } });
  S.making = 3; render();
  await useKeys(r.token, r.me, privJwk);
}
async function signInPassword(email, password) {
  const { salt } = await api("salt", { method: "POST", body: { email } });
  const { lockKey, proof } = await E2E.fromPassword(password, fromB64url(salt));
  const r = await api("login", { method: "POST", body: { email, proof } });
  let ecdh;
  try { ({ ecdh } = await E2E.unlock(lockKey, r.vault)); }
  catch (_) { throw new Error("Signed in, but your password couldn’t unlock your key. Try again."); }
  await useKeys(r.token, r.me, ecdh);
}
const passkeysSupported = () => !!(window.PublicKeyCredential && navigator.credentials?.create);
function deviceLabel() {
  const ua = navigator.userAgent;
  const d = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android phone" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "Device";
  return d;
}
const prfResult = (cred) => { const r = cred.getClientExtensionResults?.().prf; return r?.results?.first ? new Uint8Array(r.results.first) : null; };
async function signInPasskey() {
  const o = await api("passkey-options", { method: "POST", body: { mode: "login" } });
  const a = await navigator.credentials.get({ publicKey: {
    challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "preferred", timeout: 120000,
    extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } });
  if (!a) throw new Error("No passkey was chosen.");
  const r = await api("passkey-login", { method: "POST", body: {
    challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
    authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) } });
  const secret = prfResult(a);
  if (secret && r.pkVault) {
    try { const { ecdh } = await E2E.unlock(await E2E.fromSecret(secret), r.pkVault); return useKeys(r.token, r.me, ecdh); }
    catch (_) { /* fall through to the password */ }
  }
  // This passkey signs in but can't unlock the key on its own: ask for the password once.
  S.pendingUnlock = r;
  go("unlock");
}
async function unlockWithPassword(password) {
  const r = S.pendingUnlock;
  const { lockKey } = await E2E.fromPassword(password, fromB64url(r.salt));
  let ecdh;
  try { ({ ecdh } = await E2E.unlock(lockKey, r.vault)); }
  catch (_) { throw Object.assign(new Error("That password didn’t unlock your key."), { field: "password" }); }
  S.pendingUnlock = null;
  await useKeys(r.token, r.me, ecdh);
}
// Save a passkey; if the phone supports PRF, give it its own locked copy of the key.
async function addPasskey() {
  const o = await api("passkey-options", { method: "POST", body: { mode: "register" } });
  const prfSalt = await E2E.prfSalt();
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: fromB64url(o.challenge), rp: { id: o.rpId, name: "InFlight" },
    user: { id: fromB64url(o.user.id), name: o.user.name, displayName: o.user.displayName },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
    excludeCredentials: o.exclude.map((id) => ({ type: "public-key", id: fromB64url(id) })),
    attestation: "none", timeout: 120000, extensions: { prf: { eval: { first: prfSalt } } } } });
  const resp = cred.response;
  const spki = resp.getPublicKey?.(), alg = resp.getPublicKeyAlgorithm?.();
  if (!spki) throw new Error("This browser can’t save passkeys for InFlight yet.");
  await api("passkey-register", { method: "POST", body: {
    challenge: o.challenge, id: cred.id, publicKey: b64url(spki), alg, clientDataJSON: b64url(resp.clientDataJSON), label: deviceLabel() } });
  let secret = prfResult(cred);
  const ext = cred.getClientExtensionResults?.().prf;
  if (!secret && ext?.enabled) {
    // Some phones only hand over the PRF secret when the passkey is used, so use it once now.
    try {
      const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: o.rpId, userVerification: "preferred",
        allowCredentials: [{ type: "public-key", id: cred.rawId }], extensions: { prf: { eval: { first: prfSalt } } } } });
      secret = a && prfResult(a);
    } catch (_) { /* the passkey still signs in; it just won't unlock messages by itself */ }
  }
  if (!secret) return false;
  const jwk = S.secretJwk || (await askPasswordForKey());
  if (!jwk) return false;
  await api("passkey-vault", { method: "POST", body: { id: cred.id, vault: await E2E.lock(await E2E.fromSecret(secret), { ecdh: jwk }) } });
  return true;
}
// After a reload the key is on the phone but not exportable, so linking a new
// passkey needs the password once to open the stored copy.
function askPasswordForKey() {
  return new Promise((resolve) => { S.sheet = { type: "askpw", resolve }; renderSheet(); });
}

/* ============================================================
   Sync with the server
   ============================================================ */
let syncing = null;
async function sync() {
  if (!S.token || !S.priv) return;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const d = await api("sync");
      S.skew = d.now - Date.now();
      S.me = d.me; S.friends = d.friends; S.incoming = d.incoming; S.outgoing = d.outgoing; S.passkeys = d.passkeys;
      for (const f of S.friends) {
        checkPin(f);
        if (f.last) await decrypt(f.id, f.last);
        // a notice for pigeons that land while the app is open (not for ones already waiting at launch)
        if (f.last && !f.last.flying && !S.seenLanded.has(f.last.id)) {
          S.seenLanded.add(f.last.id);
          if (S.started && f.last.from === f.id && !f.last.readAt && !(S.view === "chat" && S.chat === f.id))
            toast(`A pigeon from ${esc(first(f.name))} just landed.`, "Read", () => go("chat", f.id));
        }
      }
      S.started = true;
      if (S.view === "chat" && S.chat) await loadChat(S.chat);
      if (!AUTH_VIEWS.has(S.view)) render();
    } catch (e) { if (e.status !== 401) console.warn("sync", e.message); }
    finally { syncing = null; }
  })();
  return syncing;
}
function friend(id) { return S.friends.find((f) => f.id === id); }
// First key seen for a friend is remembered on this phone; a later change is flagged.
// Keys this phone trusted before are kept too, so scrolls sealed with them stay readable
// after a friend resets. Only keys this phone has seen are ever tried: a key named by the
// server alone could have been made by the server.
const keyId = (pub) => `${pub.x}.${pub.y}`;
const pubFromId = (k) => { const [x, y] = k.split("."); return { kty: "EC", crv: "P-256", x, y }; };
function checkPin(f) {
  const k = keyId(f.pub);
  if (!S.pins[f.id]) { S.pins[f.id] = k; idb.set("pins:" + S.me.id, S.pins); }
  f.keyChanged = S.pins[f.id] !== k;
}
async function trustNewKey(fid) {
  const f = friend(fid); if (!f) return;
  const old = S.pins[fid], hist = S.pins["old:" + fid] || [];
  if (old && old !== keyId(f.pub) && !hist.includes(old)) S.pins["old:" + fid] = [...hist, old];
  S.pins[fid] = keyId(f.pub); await idb.set("pins:" + S.me.id, S.pins);
  f.keyChanged = false; render();
}
function pairFor(pub) {
  const k = keyId(pub);
  if (!S.pairs.has(k)) S.pairs.set(k, E2E.pair(S.priv, pub));
  return S.pairs.get(k);
}
const base = (fid) => pairFor(friend(fid).pub);
async function decrypt(fid, m) {
  if (!m.ct || S.plain.has(m.id)) return;
  const f = friend(fid);
  const tries = [keyId(f.pub), S.pins[fid], ...(S.pins["old:" + fid] || [])].filter((k, i, a) => k && a.indexOf(k) === i);
  for (const k of tries) {
    try { S.plain.set(m.id, await E2E.open(await pairFor(pubFromId(k)), m, m.ct)); return; } catch (_) {}
  }
  S.plain.set(m.id, { t: "", bad: true });
}
async function loadChat(fid) {
  const d = await api("messages?with=" + encodeURIComponent(fid));
  S.skew = d.now - Date.now();
  S.msgs.set(fid, d.messages); S.turns.set(fid, d.turn);
  for (const m of d.messages) {
    await decrypt(fid, m);
    const p = S.plain.get(m.id);
    if (m.photo === 2 && S.photos.has(m.id)) { URL.revokeObjectURL(S.photos.get(m.id)); S.photos.delete(m.id); }
    if (m.photo === 1 && p?.p && !S.photos.has(m.id) && !S.photoGone.has(m.id) && !(m.to === S.me.id && m.flying)) loadPhoto(fid, m, p);
  }
  if (d.messages.some((m) => m.from === fid && !m.flying && !m.readAt)) {
    api("read", { method: "POST", body: { with: fid } }).catch(() => {});
    for (const m of d.messages) if (m.from === fid && !m.flying) m.readAt = m.readAt || now();
    const f = friend(fid); if (f) f.unread = 0;
  }
}
async function loadPhoto(fid, m, p) {
  S.photos.set(m.id, "");                         // loading
  try {
    const r = await api("photo/" + m.id, { raw: true });
    const plain = await E2E.openPhoto(m.id, p.p, await r.arrayBuffer());
    S.photos.set(m.id, URL.createObjectURL(new Blob([plain], { type: "image/jpeg" })));
  } catch (e) {
    S.photos.delete(m.id);
    if (e.status === 410) S.photoGone.add(m.id);
  }
  if (S.view === "chat" && S.chat === fid) render();
}

/* ============================================================
   Rendering
   ============================================================ */
const root = () => $("#screen");
let $view, $compose, $tabbar, $layer, $ta, $menu;
function mount() {
  root().innerHTML = `
    <div class="offline" hidden>You’re offline. Pigeons will wait.</div>
    <div class="view"></div>
    <form class="compose" hidden data-form="compose">
      <div class="note" hidden></div>
      <div class="attach" hidden></div>
      <div class="crow">
        <button type="button" class="ibtn" data-act="menu" aria-label="Add a photo" aria-expanded="false">${I.photo}</button>
        <textarea rows="1" placeholder="Write your scroll…" aria-label="Message" id="msg" maxlength="2000" enterkeyhint="send"></textarea>
        <button type="submit" class="ibtn send" aria-label="Release the pigeon">${I.send}</button>
      </div>
      <div class="menu" hidden>
        <label>${I.camera}<span>Take a photo</span><input type="file" accept="image/*" capture="environment" id="file-cam"></label>
        <label>${I.photo}<span>Choose from library</span><input type="file" accept="image/*" id="file-lib"></label>
      </div>
    </form>
    <nav class="tabbar" aria-label="Sections"></nav>
    <div class="layer"></div>`;
  $view = $(".view"); $compose = $(".compose"); $tabbar = $(".tabbar"); $layer = $(".layer"); $ta = $("#msg"); $menu = $(".menu");
  $view.addEventListener("scroll", () => { S.stick = $view.scrollHeight - $view.scrollTop - $view.clientHeight < 40; }, { passive: true });
  root().addEventListener("click", onClick);
  root().addEventListener("change", onChange);
  root().addEventListener("submit", onSubmit);
  $ta.addEventListener("input", () => { fitTa(); renderCompose(); });
}
function fitTa() { $ta.style.height = "auto"; $ta.style.height = Math.min(120, $ta.scrollHeight + 2) + "px"; }
function renderOffline() { const o = $(".offline"); if (o) o.hidden = !S.offline; }

function go(view, chat) {
  if (view === "reset" && S.view !== "reset") { S.view = view; return loadReset(); }
  S.view = view; S.chat = chat ?? null; S.sheet = null; S.flash = ""; S.err = ""; S.stick = true;
  if (view !== "chat") clearAttach();
  if ($menu) $menu.hidden = true;
  render();
  if (view === "chat" && chat) loadChat(chat).then(render).catch((e) => toast(esc(e.message)));
}

function render() {
  if (!$view) return;
  if (AUTH_VIEWS.has(S.view) || !S.me) {
    $view.innerHTML = vAuth(); $compose.hidden = true; $tabbar.hidden = true; renderSheet();
    return;
  }
  $tabbar.hidden = false;
  const keepTop = $view.scrollTop;
  $view.innerHTML = S.view === "chat" ? vChat() : S.view === "flock" ? vFlock() : S.view === "roost" ? vRoost() : vAviary();
  if (S.view === "chat" && S.stick) $view.scrollTop = $view.scrollHeight; else $view.scrollTop = keepTop;
  renderCompose(); renderTabs(); renderSheet(); live();
}

function preview(f) {
  const l = f.last;
  if (!l) return { html: `<em>No scrolls yet</em>`, at: 0 };
  if (l.from === S.me.id && l.flying) return { html: `${I.bird}<em>Your scroll is en route…</em>`, at: l.sentAt };
  if (l.from !== S.me.id && l.flying) return { html: `${I.bird}<em>A pigeon is on its way…</em>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? "Couldn’t open this scroll" : p.p ? (l.photo === 2 ? "Photo (flown away)" : "Photo") + (p.t ? ": " + p.t : "") : p.t;
  return { html: l.from === S.me.id ? `<b>You:</b> ${esc(body)}` : esc(body), at: l.deliverAt };
}
function vAviary() {
  const fr = S.friends.map((f) => ({ f, ...preview(f) })).filter((x) => x.f.last).sort((a, b) => b.at - a.at);
  const rows = fr.map(({ f, html, at }) => `
    <button class="row${f.unread ? " unread" : ""}" data-act="open" data-id="${f.id}">
      ${avatar(f.name)}
      <span class="txt">
        <span class="l1"><span class="nm one">${esc(f.name)}</span><time>${at ? fmtAgo(at) : ""}</time></span>
        <span class="l2"><span class="pv one">${html}</span>${f.unread ? `<span class="count" aria-label="${f.unread} unread">${f.unread}</span>` : ""}</span>
      </span>
    </button>`).join("");
  const empty = S.friends.length
    ? `<p class="empty">No scrolls yet. Tap the pen to write to someone in your flock.</p>`
    : `<p class="empty">No conversations yet. Add a friend by their handle, then send your first pigeon.</p><div class="pad"><button class="btn wide" data-act="tab" data-id="flock">Find friends</button></div>`;
  return `<header class="hdr"><h1>The Aviary <span class="beta">Beta</span></h1><button class="round" data-act="compose" aria-label="New scroll">${I.pen}</button></header>
    <div class="list">${rows}</div>${rows ? "" : empty}`;
}
function banner(f, t) {
  const n = esc(first(f.name));
  const B = (cls, text) => `<div class="banner ${cls}">${I.bird}<span>${text}</span></div>`;
  switch (t?.state) {
    case "fresh": return B("sill", "Your pigeon is ready. Send the first scroll!");
    case "sill": return B("sill", "The pigeon is on your windowsill. Your turn to send!");
    case "inbound": return B("inbound", `A pigeon from ${n} is on its way to you…`);
    case "outbound": return B("away", `Your pigeon is flying to ${n}…`);
    case "theirs": return B("away", `${n} has the pigeon. Waiting for their reply.`);
    default: return "";
  }
}
function bubble(f, m) {
  const mine = m.from === S.me.id;
  if (!mine && m.flying) {
    return `<button class="fly" data-act="map" data-id="${m.id}" aria-label="Watch the pigeon on the map">
      <span class="t1">${I.bird}<span>Wings beating steadily onward…</span></span>
      <span class="t2"><b><span data-eta="${m.deliverAt}"></span> away</b><span>${fmtMiles(m.km)}${m.swift ? " · swift" : ""}</span></span>
      <span class="prog"><i data-from="${m.sentAt}" data-to="${m.deliverAt}"></i></span></button>`;
  }
  const p = S.plain.get(m.id) || { t: "" };
  let photo = "";
  if (p.p) {
    if (m.photo === 2 || S.photoGone.has(m.id)) photo = `<div class="ph">${I.gone}<span>This photo has flown away.</span></div>`;
    else if (S.photos.get(m.id)) photo = `<img src="${S.photos.get(m.id)}" alt="Photo from ${esc(first(mine ? S.me.name : f.name))}" data-act="view" data-id="${m.id}">`;
    else photo = `<div class="ph">Opening photo…</div>`;
  }
  const meta = [];
  if (mine && m.flying) meta.push(`<span>${fmtShort(m.sentAt)}</span><span class="fl">In flight · <span data-eta="${m.deliverAt}"></span> to go${m.swift ? " · swift" : ""}</span>`);
  else if (mine) meta.push(`<span>${fmtShort(m.sentAt)}</span><span>Landed ${fmtShort(m.deliverAt)}</span>`);
  else meta.push(`<span>Arrived ${fmtShort(m.deliverAt)}</span>`);
  if (p.p && m.photo === 1 && !m.flying && !S.photoGone.has(m.id)) meta.push(`<span class="fl">Photo vanishes in <span data-eta="${m.expiresAt}"></span></span>`);
  const text = p.bad ? `<em>This scroll couldn’t be opened on this phone.</em>` : esc(p.t).replace(/\n/g, "<br>");
  const prog = mine && m.flying ? `<div class="prog"><i data-from="${m.sentAt}" data-to="${m.deliverAt}"></i></div>` : "";
  return `<div class="b${mine ? " me" : ""}${p.p ? " pic" : ""}">${photo}<span class="txt">${text}</span><span class="bm">${meta.join("")}</span>${prog}</div>`;
}
function vChat() {
  const f = friend(S.chat);
  if (!f) return `<header class="chathdr"><button class="round" data-act="tab" data-id="aviary" aria-label="Back">${I.back}</button></header><p class="empty">This friend isn’t in your flock any more.</p>`;
  const msgs = S.msgs.get(f.id);
  const t = S.turns.get(f.id) || f.turn;
  const flying = msgs && [...msgs].reverse().find((m) => m.flying && m.route);
  const km = S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : null;
  let body = "", lastDay = "";
  if (!msgs) body = `<p class="empty">Opening your scrolls…</p>`;
  else if (!msgs.length) body = `<p class="empty">Scrolls to ${esc(first(f.name))} are end-to-end encrypted. Tap their name to compare safety numbers.</p>`;
  else for (const m of msgs) {
    const d = dayLabel(m.from === S.me.id || m.flying ? m.sentAt : m.deliverAt);
    if (d !== lastDay) { body += `<div class="day">${d}</div>`; lastDay = d; }
    body += bubble(f, m);
  }
  const warn = f.keyChanged ? `<div class="warnbar"><span>${esc(first(f.name))}’s security key changed. This happens when they make a new account or reinstall. Compare safety numbers before you send anything private.</span><button class="btn ghost" data-act="trust" data-id="${f.id}">I’ve checked with them</button></div>` : "";
  return `<header class="chathdr">
      <button class="round" data-act="tab" data-id="aviary" aria-label="Back to the Aviary">${I.back}</button>
      <button class="who2" data-act="safety" data-id="${f.id}" aria-label="${esc(f.name)}: verify encryption">
        ${avatar(f.name, "s")}
        <span class="txt"><span class="nm two">${esc(f.name)}</span>
        <span class="meta">${I.pin}<span>${esc(f.place || "Roost not set")}${km != null ? ` · ${fmtMiles(km)}` : ""}</span></span></span>
      </button>
      <span class="acts">
        ${flying ? `<button class="round" data-act="map" data-id="${flying.id}" aria-label="Watch the pigeon on the map">${I.map}</button>` : ""}
        <span class="chip" title="Swift pigeons left">${I.bird}${S.me.swift}</span>
      </span>
    </header>
    ${warn}${banner(f, t)}
    <div class="msgs">${body}</div>`;
}
function vFlock() {
  const fr = [...S.friends].sort((a, b) => a.name.localeCompare(b.name));
  const inc = S.incoming, out = S.outgoing;
  return `<header class="hdr"><h1>The Flock</h1>
      <button class="round" data-act="share" aria-label="Share your handle">${I.share}</button>
      <button class="round" data-act="focusadd" aria-label="Add a friend">${I.addp}</button></header>
    ${inc.length || out.length ? `<button class="reqbtn" data-act="requests">
        <span class="n">${inc.length || out.length}</span>
        <span class="txt"><b>${inc.length ? "Incoming carrier pigeons" : "Requests you sent"}</b><small>${inc.length ? `${inc.length} friend request${inc.length > 1 ? "s" : ""} waiting` : `${out.length} waiting for a reply`}</small></span>
        ${I.chev}</button>` : ""}
    <div class="sect">Add a friend</div>
    <form class="add" data-form="add">
      <label class="field"><span>@</span><input name="h" placeholder="their handle" aria-label="Friend's handle" id="add-h" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.pendingAdd || "")}"></label>
      <button class="btn">Send</button>
    </form>
    ${S.flash ? `<p class="flash" role="status">${esc(S.flash)}</p>` : ""}
    <div class="sect">Your flock <small>${fr.length} friend${fr.length === 1 ? "" : "s"}</small></div>
    <div class="list">${fr.map((f) => `<button class="row" data-act="open" data-id="${f.id}">${avatar(f.name)}
      <span class="txt"><span class="l1"><span class="nm one">${esc(f.name)}</span></span>
      <span class="l2"><span class="pv one">@${esc(f.handle)}${f.place ? ` · ${esc(f.place)}` : ""}</span></span></span></button>`).join("") || `<p class="empty">Your flock is empty. Share your handle, @${esc(S.me.handle)}, with a friend.</p>`}</div>
    <div class="gap"></div>`;
}
function vRoost() {
  const u = S.me;
  const eggs = Array.from({ length: SWIFT_MAX }, (_, i) => `<i class="${i < u.swift ? "" : "e"}"></i>`).join("");
  return `<header class="hdr"><h1>Roost</h1></header>
    <div class="prof">${avatar(u.name, "l")}<h2>${esc(u.name)}</h2><p>@${esc(u.handle)}</p></div>
    <div class="sect">Your roost</div>
    <div class="card">
      <div class="kv"><span>Location</span><span class="val">${esc(u.place || "Not set")}</span></div>
      <button class="kv linkrow" data-act="locate">${I.locate}<span>Update from my location</span>${I.chev}</button>
      <div class="kv"><span>Or choose a city</span><select data-act="city" aria-label="Choose a city" id="city">${cityOptions()}</select></div>
      <div class="kv"><span>Swift pigeons</span><span class="eggs" role="img" aria-label="${u.swift} of ${SWIFT_MAX}">${eggs}</span></div>
    </div>
    <p class="foot">${u.swift >= SWIFT_MAX ? "Your loft is full." : `The next swift pigeon hatches in <span data-eta="${u.swiftNextAt}"></span>.`} Swift pigeons fly twice as fast and let you write when it isn’t your turn. Your location is kept to about 10 km.</p>
    <div class="sect">Encryption</div>
    <div class="card">
      <div class="kv"><span>Your key</span><span class="val fp">${S.fp}</span></div>
      ${S.friends.map((f) => `<button class="kv linkrow" data-act="safety" data-id="${f.id}"><span class="one">Safety number with ${esc(first(f.name))}</span>${I.chev}</button>`).join("")}
    </div>
    <p class="foot">Your private key was made on this phone and locked with your password before it was stored. The server holds it but can’t open it, and it can’t read your scrolls or photos.</p>
    <div class="sect">Sign-in</div>
    <div class="card">
      <div class="kv"><span>Email</span><span class="val">${esc(u.email)}</span></div>
      ${S.passkeys.map((p) => `<div class="kv">${I.key}<span class="pk"><span>${esc(p.label || "Passkey")}</span><small>${p.unlocks ? "Signs in and unlocks your scrolls" : "Signs in; asks for your password on a new phone"} · added ${fmtDate(p.createdAt)}</small></span><button class="link danger" data-act="pkdel" data-id="${esc(p.id)}">Remove</button></div>`).join("")}
      ${passkeysSupported() ? `<button class="kv linkrow" data-act="pkadd">${I.key}<span>Add a passkey</span>${I.chev}</button>` : ""}
      <button class="kv linkrow" data-act="changepw">${I.lock}<span>Change password</span>${I.chev}</button>
    </div>
    <p class="foot">${S.passkeys.length ? "Passkeys let you sign in with Face ID or your fingerprint." : "Add a passkey to sign in with Face ID or your fingerprint instead of your password."} Your password locks your key, so a reset only keeps your scrolls if you have a passkey that unlocks them.</p>
    <div class="pad"><button class="btn wide ghost" data-act="signout">Sign out</button></div>
    <div class="pad"><button class="btn wide ghost danger-btn" data-act="delask">Delete my account</button></div>
    <div class="sect">About the beta <span class="beta">Beta</span></div>
    <div class="card"><ul class="betalist">
      <li>There are no notifications yet. Open InFlight to check for pigeons.</li>
      <li>Forgot your password? Use the link on the sign-in screen. Without a passkey, a reset starts you with a new key.</li>
      <li>Features may change while InFlight is in beta.</li>
    </ul></div>
    <p class="foot">Pigeons fly at ${SPEED_KMH} km/h, taking at least 5 minutes and at most 3 days. Photos are deleted 24 hours after they land.</p>
    <div class="gap"></div>`;
}
function vReset() {
  const info = S.resetInfo;
  if (!info) return `<div class="loading">Checking your reset link…</div>`;
  if (info.error) return `<div class="auth center"><div class="mark">${I.warn}</div><h1>This link won’t work</h1>
      <p class="sub">${esc(info.error)}</p>
      <div class="stack"><button class="btn big" data-act="to" data-id="forgot">Ask for a new link</button><button class="btn big ghost" data-act="to" data-id="welcome">Back</button></div></div>`;
  const canKeep = info.passkeys.length && passkeysSupported();
  return `<div class="auth">
      <h1>Choose a new password</h1>
      <p class="sub">For <b>${esc(info.name)}</b> (@${esc(info.handle)}, ${esc(info.email)}).</p>
      <form class="fields" data-form="reset" novalidate>
        ${field("password", "New password", "password", "new-password", "At least 10 characters.")}
        <p class="ferr" role="alert" hidden></p>
        ${canKeep ? `<button type="button" class="btn big icon" data-act="resetkeep">${I.key}<span>Keep my scrolls with my passkey</span></button>
          <p class="fine">Your passkey unlocks your key, so all your scrolls stay readable.</p>
          <button type="button" class="btn big ghost" data-act="resetfresh">Start fresh instead</button>` :
        `<button type="button" class="btn big" data-act="resetfresh">Set new password</button>`}
        <p class="fine">${canKeep ? "Starting fresh" : "Without a passkey, this"} makes a new key on this phone. Your friends stay, but scrolls from before can’t be opened, and friends will see that your security key changed.</p>
      </form></div>`;
}
async function loadReset() {
  S.resetInfo = null; render();
  try { S.resetInfo = await api("reset-check", { method: "POST", body: { token: S.resetToken } }); }
  catch (e) { S.resetInfo = { error: e.message }; }
  if (S.view === "reset") render();
}
async function resetWith(mode, btn) {
  const pw = $("#f-password")?.value || "";
  if (pw.length < 10) return showErr("Use at least 10 characters.", "password");
  await busyBtn(btn, mode === "keep" ? "Waiting for your passkey…" : "Making your new key…", async () => {
    let ecdh, pub;
    if (mode === "keep") {
      const a = await navigator.credentials.get({ publicKey: {
        challenge: rand(32), rpId: location.hostname, userVerification: "preferred", timeout: 120000,
        allowCredentials: S.resetInfo.passkeys.map((p) => ({ type: "public-key", id: fromB64url(p.id) })),
        extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } });
      const secret = a && prfResult(a), pk = a && S.resetInfo.passkeys.find((p) => p.id === a.id);
      if (!secret || !pk) throw new Error("That passkey couldn’t unlock your key on this phone. You can start fresh instead.");
      try { ({ ecdh } = await E2E.unlock(await E2E.fromSecret(secret), pk.vault)); }
      catch (_) { throw new Error("That passkey couldn’t unlock your key. You can start fresh instead."); }
    } else {
      ({ privJwk: ecdh, pub } = await E2E.newIdentity());
    }
    const salt = rand(16);
    const { lockKey, proof } = await E2E.fromPassword(pw, salt);
    const vault = await E2E.lock(lockKey, { ecdh });
    const r = await api("reset-complete", { method: "POST", body: { token: S.resetToken, salt: b64url(salt), proof, vault, ...(pub ? { pub } : {}) } });
    S.resetToken = null; S.resetInfo = null;
    await useKeys(r.token, r.me, ecdh);
  });
  await afterSignIn();
  toast(mode === "keep" ? "Password changed. Your scrolls are safe." : "Password changed. You’re starting fresh with a new key.");
}
function cityOptions() {
  const cur = S.me?.place;
  return `<option value="">${cur && PLACES.some((p) => p[0] === cur) ? "" : "Choose…"}</option>` +
    [...PLACES].sort((a, b) => a[0].localeCompare(b[0])).map(([n]) => `<option value="${esc(n)}"${n === cur ? " selected" : ""}>${esc(n)}</option>`).join("");
}

/* ---------- sign-up and sign-in screens ---------- */
function field(name, label, type, ac, hint, prefix) {
  return `<label class="fl" for="f-${name}"><span class="lbl">${label}</span>
    <span class="inp">${prefix ? `<span class="pre">${prefix}</span>` : ""}<input id="f-${name}" name="${name}" type="${type}" autocomplete="${ac}"${type === "email" || name === "handle" ? ' autocapitalize="off" spellcheck="false"' : ""}${name === "handle" ? ' maxlength="20"' : ""}>
    ${type === "password" ? `<button type="button" class="peek" data-act="peek" aria-label="Show password">${I.eye}</button>` : ""}</span>
    ${hint ? `<span class="hint">${hint}</span>` : ""}<span class="err" hidden></span></label>`;
}
function vAuth() {
  switch (S.view) {
    case "loading": return `<div class="loading">Opening InFlight…</div>`;
    case "welcome": return `<div class="auth welcome">
        <div class="mark">${I.bird}</div>
        <div class="wordrow"><h1 class="word">InFlight</h1><span class="beta big">Beta</span></div>
        <p class="tagline">Letters that travel the real distance between you.</p>
        <ul class="feats">
          <li>${I.dist}<span>Each scroll flies the real miles at pigeon speed.</span></li>
          <li>${I.lock}<span>End-to-end encrypted from your very first scroll.</span></li>
          <li>${I.hourglass}<span>Photos vanish 24 hours after they land.</span></li>
        </ul>
        <p class="fine">InFlight is in beta, so things may change as it grows.</p>
        <div class="stack">
          <button class="btn big" data-act="to" data-id="signup">Create an account</button>
          <button class="btn big ghost" data-act="to" data-id="signin">Sign in</button>
        </div></div>`;
    case "signup": return `<div class="auth">
        <button class="round" data-act="to" data-id="welcome" aria-label="Back">${I.back}</button>
        <h1>Create your account</h1>
        <form class="fields" data-form="signup" novalidate>
          ${field("name", "Your name", "text", "name", "What your friends will see")}
          ${field("handle", "Handle", "text", "username", "How friends find you", "@")}
          ${field("email", "Email", "email", "email", "")}
          ${field("password", "Password", "password", "new-password", "At least 10 characters. It also locks your encryption key. Add a passkey too, so a password reset can keep your scrolls.")}
          <p class="ferr" role="alert" hidden></p>
          <button class="btn big">Create account</button>
          <p class="fine">Your scrolls are end-to-end encrypted. We can’t read them.</p>
        </form></div>`;
    case "making": {
      const step = (n, label) => `<li class="${S.making >= n ? "is-ok" : S.making === n - 1 ? "is-now" : ""}">${S.making >= n ? I.ok : I.dot}<span>${label}</span></li>`;
      return `<div class="auth center">
        <div class="mark pulse">${I.bird}</div>
        <h1>Hatching your account</h1>
        <ul class="steps">${step(1, "Making your key pair on this phone")}${step(2, "Locking it with your password")}${step(3, "Sending the locked key to the server")}</ul></div>`;
    }
    case "signin": return `<div class="auth">
        <button class="round" data-act="to" data-id="welcome" aria-label="Back">${I.back}</button>
        <h1>Welcome back</h1>
        <form class="fields" data-form="signin" novalidate>
          ${field("email", "Email", "email", "username webauthn", "")}
          ${field("password", "Password", "password", "current-password", "")}
          <p class="ferr" role="alert" hidden></p>
          <button class="btn big">Sign in</button>
          <p class="fine"><button type="button" class="link" data-act="to" data-id="forgot">Forgot your password?</button></p>
        </form>
        ${passkeysSupported() ? `<div class="or"><span>or</span></div>
        <button class="btn big ghost icon" data-act="pkget">${I.key}<span>Sign in with a passkey</span></button>` : ""}
        <p class="fine">New here? <button class="link" data-act="to" data-id="signup">Create an account</button></p>
      </div>`;
    case "unlock": return `<div class="auth">
        <button class="round" data-act="cancelunlock" aria-label="Back">${I.back}</button>
        <h1>Unlock your scrolls</h1>
        <p class="sub">Your passkey signed you in. Enter your password once so this phone can unlock your encryption key.</p>
        <form class="fields" data-form="unlock" novalidate>
          ${field("password", "Password", "password", "current-password", "")}
          <p class="ferr" role="alert" hidden></p>
          <button class="btn big">Unlock</button>
          <p class="fine"><button type="button" class="link" data-act="to" data-id="forgot">Forgot your password?</button></p>
        </form></div>`;
    case "forgot": return `<div class="auth">
        <button class="round" data-act="to" data-id="signin" aria-label="Back">${I.back}</button>
        <h1>Reset your password</h1>
        <p class="sub">We’ll email you a link to choose a new password. It works once, for one hour.</p>
        <form class="fields" data-form="forgot" novalidate>
          ${field("email", "Email", "email", "email", "")}
          <p class="ferr" role="alert" hidden></p>
          <button class="btn big">Email me a reset link</button>
        </form>
        <p class="fine">If you have a passkey for InFlight, the reset can keep your scrolls. Without one, you’ll start with a new key and older scrolls can’t be opened.</p>
      </div>`;
    case "reset": return vReset();
    case "roostpick": return `<div class="auth">
        <h1>Where’s your roost?</h1>
        <p class="sub">Pigeons fly from here, so it sets how long your scrolls take. We keep it to about 10 km, and only your friends see it.</p>
        <div class="loc">
          ${S.me?.place ? `<div class="locstate">${I.pin}<span>${esc(S.me.place)}</span></div>` : ""}
          <button class="btn big${S.me?.place ? " ghost" : ""} icon" data-act="locate">${I.locate}<span>${S.me?.place ? "Use my location again" : "Use my location"}</span></button>
          <label class="fl" for="city"><span class="lbl">Or choose a city</span><span class="inp"><select data-act="city" id="city" class="cityselect">${cityOptions()}</select></span></label>
          <p class="ferr" role="alert" hidden></p>
        </div>
        <div class="dock"><button class="btn big" data-act="roostdone"${S.me?.place ? "" : " disabled"}>Continue</button></div></div>`;
    case "pkoffer": return `<div class="auth center">
        <div class="mark">${I.face}</div>
        <h1>Sign in with a glance</h1>
        <p class="sub">Add a passkey and you can sign in with Face ID or your fingerprint. On most new phones it also unlocks your scrolls if you forget your password.</p>
        <p class="ferr" role="alert" hidden></p>
        <div class="stack">
          <button class="btn big" data-act="pkadd" data-next="aviary">Add a passkey</button>
          <button class="btn big ghost" data-act="tab" data-id="aviary">Not now</button>
        </div></div>`;
  }
  return "";
}

function renderCompose() {
  const show = S.view === "chat" && !!S.chat && !!friend(S.chat);
  $compose.hidden = !show; if (!show) return;
  const f = friend(S.chat), t = S.turns.get(f.id) || f.turn, sw = S.me.swift;
  const note = $(".note", $compose), btn = $(".send", $compose);
  const has = $ta.value.trim() || S.attach;
  let blocked = false;
  if (S.err) { note.hidden = false; note.className = "note stop"; note.textContent = S.err; }
  else if (f.keyChanged) { note.hidden = false; note.className = "note stop"; note.textContent = "Check the new safety number before sending."; blocked = true; }
  else if (S.me.lat == null) { note.hidden = false; note.className = "note stop"; note.textContent = "Set your roost in the Roost tab before sending."; blocked = true; }
  else if (t.free) note.hidden = true;
  else if (sw > 0) { note.hidden = false; note.className = "note"; note.innerHTML = `${I.bird}<span>Sending uses a swift pigeon (${sw} left). It flies 2× faster.</span>`; }
  else { note.hidden = false; note.className = "note stop"; note.textContent = `No swift pigeons left. The next hatches in ${fmtDur(S.me.swiftNextAt - now())}.`; blocked = true; }
  btn.disabled = blocked || !has || S.busy;
  const a = $(".attach", $compose);
  a.hidden = !S.attach;
  if (S.attach && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<img src="${S.attach.preview}" alt=""><span>Photo, ${fmtBytes(S.attach.bytes.length)}. Encrypted before it leaves this phone.</span><button type="button" data-act="unattach">Remove</button>`;
  }
  if (!S.attach && a.dataset.for) { a.dataset.for = ""; a.innerHTML = ""; }
}
function renderTabs() {
  const unread = S.friends.reduce((n, f) => n + (f.unread || 0), 0);
  const cur = S.view === "chat" ? "aviary" : S.view;
  const tab = (id, label, icon, badge) => `<button class="tab" data-act="tab" data-id="${id}" aria-current="${cur === id}">${badge ? `<span class="badge">${badge}</span>` : ""}${icon}<span>${label}</span></button>`;
  $tabbar.innerHTML = `<div class="tabs">${tab("aviary", "Aviary", I.aviary, unread)}${tab("flock", "Flock", I.bird, S.incoming.length)}${tab("roost", "Roost", I.roost, 0)}</div>`;
  document.title = unread ? `(${unread}) InFlight Beta` : "InFlight Beta";
}
const sheetHtml = (title, body, flush) => `<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="done" data-act="close">Done</button></header><div class="body${flush ? " flush" : ""}">${body}</div></div>`;
function renderSheet() {
  const s = S.sheet;
  if (!s) { if (!$(".toast", $layer)) $layer.innerHTML = ""; return; }
  if (s.type === "map") {
    if (!$(".map", $layer)) $layer.innerHTML = sheetHtml("Pigeon in Flight", `<canvas class="map" role="img" aria-label="Map of the pigeon’s route"></canvas><div class="mapcard"></div>`, true);
    tickMap();
  } else if (s.type === "safety") {
    const f = friend(s.id);
    $layer.innerHTML = sheetHtml("Safety number", `
      <div class="card"><div class="digits">${(s.digits || []).map((d) => `<span>${d}</span>`).join("")}</div></div>
      <p class="foot">Compare these 60 digits with ${esc(first(f?.name || "your friend"))}, in person or on a call. If they match, your scrolls can only be opened by the two of you. Not even our server could swap in a different key.</p>`);
  } else if (s.type === "compose") {
    $layer.innerHTML = sheetHtml("New scroll", S.friends.length ? `<div class="list">${S.friends.map((f) => `<button class="row" data-act="open" data-id="${f.id}">${avatar(f.name)}
      <span class="txt"><span class="l1"><span class="nm one">${esc(f.name)}</span></span>
      <span class="l2"><span class="pv">${esc(f.place || "Roost not set")}${S.me.lat != null && f.lat != null ? ` · ${fmtDur(flightMs(haversineKm(S.me.lat, S.me.lon, f.lat, f.lon)))} by pigeon` : ""}</span></span></span></button>`).join("")}</div>`
      : `<p class="empty">Add someone to your flock first.</p>`);
  } else if (s.type === "requests") {
    const row = (p, acts) => `<div class="row">${avatar(p.name)}<span class="txt"><span class="l1"><span class="nm one">${esc(p.name)}</span></span><span class="l2"><span class="pv">${acts ? `@${esc(p.handle)} wants to join your flock` : `Waiting for @${esc(p.handle)}`}</span></span></span>${acts ? `<button class="yes" data-act="accept" data-id="${p.id}" aria-label="Accept ${esc(p.name)}">${I.check}</button><button class="no" data-act="decline" data-id="${p.id}" aria-label="Decline ${esc(p.name)}">${I.x}</button>` : `<button class="no" data-act="unfriend" data-id="${p.id}" aria-label="Cancel request to ${esc(p.name)}">${I.x}</button>`}</div>`;
    $layer.innerHTML = sheetHtml("Friend requests",
      (S.incoming.length ? `<div class="sect">Incoming pigeons</div><div class="list">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "") +
      (S.outgoing.length ? `<div class="sect">Sent by you</div><div class="list">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : "") +
      (S.incoming.length + S.outgoing.length ? "" : `<p class="empty">No requests waiting.</p>`));
  } else if (s.type === "view") {
    $layer.innerHTML = `<div class="viewer" data-act="close" role="dialog" aria-label="Photo"><img src="${S.photos.get(s.id) || ""}" alt="Photo"><p>Decrypted on this phone. Tap anywhere to close.</p></div>`;
  } else if (s.type === "askpw") {
    if (!$("#f-password", $layer)) $layer.innerHTML = sheetHtml("Link your passkey", `<p class="lead">Enter your password once so this passkey can also unlock your scrolls on a new phone.</p>
      <form class="fields" data-form="askpw" novalidate>${field("password", "Password", "password", "current-password", "")}<p class="ferr" role="alert" hidden></p><button class="btn big">Link passkey</button></form>`);
  } else if (s.type === "changepw") {
    if (!$("#f-current", $layer)) $layer.innerHTML = sheetHtml("Change password", `<form class="fields" data-form="changepw" novalidate>
      ${field("current", "Current password", "password", "current-password", "")}
      ${field("password", "New password", "password", "new-password", "At least 10 characters. Other phones signed in to your account will be signed out.")}
      <p class="ferr" role="alert" hidden></p><button class="btn big">Change password</button></form>`);
  } else if (s.type === "delete") {
    $layer.innerHTML = sheetHtml("Delete account", `<p class="lead">This deletes your account, your flock and every scroll and photo you’ve sent or received, for you and your friends. It can’t be undone.</p>
      <div class="pad"><button class="btn wide danger-btn ghost" data-act="delgo">Delete everything</button></div>`);
  }
}
function tickMap() {
  const s = S.sheet; if (!s || s.type !== "map") return;
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
  const card = $(".mapcard", $layer), cv = $(".map", $layer);
  if (!m || !card || !m.route) return;
  const left = m.deliverAt - now(), f = Math.min(1, (now() - m.sentAt) / (m.deliverAt - m.sentAt));
  card.innerHTML = `<span class="big">${I.bird}<span>${left > 0 ? fmtDur(left) + " away" : "Landed"}</span></span>
    <span class="prog"><i data-from="${m.sentAt}" data-to="${m.deliverAt}"></i></span>
    <span class="route"><span>${esc(m.fromPlace || "?")} → ${esc(m.toPlace || "?")}</span><span>${fmtMiles(m.km)}${m.swift ? " · swift" : ""}</span></span>`;
  setProgress(card);
  drawMap(cv, m, card.offsetHeight + 14);
}
function setProgress(el) {
  el.querySelectorAll("i[data-from]").forEach((e) => { const a = +e.dataset.from, b = +e.dataset.to; e.style.width = (Math.min(1, Math.max(0, (now() - a) / (b - a))) * 100).toFixed(1) + "%"; });
}
function live() {
  const r = root();
  r.querySelectorAll("[data-eta]").forEach((e) => { e.textContent = fmtDur(+e.dataset.eta - now()); });
  setProgress(r);
  if (S.view === "chat") renderCompose();
  tickMap();
}
let toastTimer = 0;
function toast(html, btn, fn) {
  if (!$layer) return;
  $(".toast", $layer)?.remove();
  $layer.insertAdjacentHTML("beforeend", `<div class="toast" role="status">${I.bird}<span>${html}</span>${btn ? `<button type="button" data-act="toast">${esc(btn)}</button>` : ""}</div>`);
  S.toastFn = fn;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $(".toast", $layer)?.remove(), 6000);
}

/* ============================================================
   Actions
   ============================================================ */
function showErr(msg, field) {
  const scope = S.sheet && $("form", $layer) ? $layer : root();
  scope.querySelectorAll(".fl .err").forEach((e) => { e.hidden = true; });
  scope.querySelectorAll(".fl").forEach((e) => e.classList.remove("bad"));
  const f = field && $(`#f-${field}`, scope)?.closest(".fl");
  if (f) { f.classList.add("bad"); const e = $(".err", f); e.textContent = msg; e.hidden = false; $("input", f)?.focus(); return; }
  const g = $(".ferr", scope); if (g) { g.textContent = msg; g.hidden = false; } else toast(esc(msg));
}
async function busyBtn(btn, label, fn) {
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}
async function onClick(e) {
  const t = e.target.closest("[data-act]");
  if ($menu && !e.target.closest(".menu") && !(t && t.dataset.act === "menu")) $menu.hidden = true;
  if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case "tab": return go(id);
    case "to": return go(id);
    case "open": return go("chat", id);
    case "compose": S.sheet = { type: "compose" }; return renderSheet();
    case "requests": S.sheet = { type: "requests" }; return renderSheet();
    case "close":
      if (S.sheet?.type === "askpw") S.sheet.resolve(null);
      S.sheet = null; return renderSheet();
    case "map": S.sheet = { type: "map", id }; return renderSheet();
    case "view": S.sheet = { type: "view", id }; return renderSheet();
    case "safety": {
      const f = friend(id); if (!f) return;
      S.sheet = { type: "safety", id, digits: await E2E.safety(S.me.id, S.me.pub, f.id, f.pub) }; return renderSheet();
    }
    case "trust": return trustNewKey(id);
    case "accept": case "decline":
      await api("friends-respond", { method: "POST", body: { id, accept: t.dataset.act === "accept" } }).catch((err) => toast(esc(err.message)));
      await sync(); return renderSheet();
    case "unfriend":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      await sync(); return renderSheet();
    case "focusadd": $("#add-h")?.focus(); return;
    case "share": return shareHandle();
    case "menu": $menu.hidden = !$menu.hidden; t.setAttribute("aria-expanded", String(!$menu.hidden)); return;
    case "unattach": return clearAttach();
    case "toast": { $(".toast", $layer)?.remove(); const fn = S.toastFn; S.toastFn = null; return fn && fn(); }
    case "peek": { const inp = t.parentElement.querySelector("input"); const show = inp.type === "password"; inp.type = show ? "text" : "password"; t.setAttribute("aria-label", show ? "Hide password" : "Show password"); return; }
    case "locate": return locate(t);
    case "roostdone": return go(passkeysSupported() ? "pkoffer" : "aviary");
    case "pkadd":
      try {
        const unlocks = await busyBtn(t, "Waiting for your passkey…", addPasskey);
        await sync();
        if (t.dataset.next) go(t.dataset.next);
        toast(unlocks ? "Passkey saved. It can sign you in and unlock your scrolls." : "Passkey saved. On a new phone you’ll also need your password once.");
      } catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(passkeyError(err)); }
      return;
    case "pkget":
      try { await busyBtn(t, "Waiting for your passkey…", signInPasskey); if (S.priv) afterSignIn(); }
      catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(passkeyError(err)); }
      return;
    case "pkdel":
      await api("passkey", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      toast("Passkey removed from your account. You can also delete it from your phone’s passwords.");
      return sync();
    case "cancelunlock": S.pendingUnlock = null; return go("welcome");
    case "signout":
      api("logout", { method: "POST" }).catch(() => {});
      await forget(); return go("welcome");
    case "delask": S.sheet = { type: "delete" }; return renderSheet();
    case "changepw": S.sheet = { type: "changepw" }; return renderSheet();
    case "resetkeep": case "resetfresh":
      try { await resetWith(t.dataset.act === "resetkeep" ? "keep" : "fresh", t); }
      catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(err.message, err.field); }
      return;
    case "delgo":
      try { await busyBtn(t, "Deleting…", () => api("me", { method: "DELETE" })); await forget(); go("welcome"); toast("Your account and scrolls were deleted."); }
      catch (err) { toast(esc(err.message)); }
      return;
  }
}
const passkeyError = (err) => err.name === "InvalidStateError" ? "This phone already has a passkey for your account." : err.name === "SecurityError" ? "Passkeys only work on georgefarrowgreen.com." : err.message || "The passkey didn’t work. Try again.";

async function onChange(e) {
  const el = e.target;
  if (el.type === "file" && el.files[0]) { $menu.hidden = true; await setAttach(el.files[0]); el.value = ""; }
  if (el.dataset.act === "city" && el.value) {
    const p = PLACES.find((x) => x[0] === el.value);
    if (p) await savePlace(p[1], p[2], p[0]);
  }
}
async function savePlace(lat, lon, place) {
  try { const r = await api("me", { method: "PATCH", body: { lat, lon, place } }); S.me = r.me; render(); }
  catch (err) { showErr(err.message); }
}
function locate(btn) {
  if (!navigator.geolocation) return showErr("This browser can’t share your location. Choose a city instead.");
  busyBtn(btn, "Finding you…", () => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      await savePlace(lat, lon, nearestPlace(lat, lon));
      resolve();
    }, (err) => {
      showErr(err.code === 1 ? "Location is turned off for this site. Choose a city instead, or allow location in your browser settings." : "Couldn’t find your location. Choose a city instead.");
      resolve();
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * MIN });
  }));
}
async function shareHandle() {
  const url = `${location.origin}/pigeon/#add=${S.me.handle}`;
  const text = `Send me a pigeon on InFlight: @${S.me.handle}`;
  try {
    if (navigator.share) await navigator.share({ title: "InFlight", text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied."); }
  } catch (_) { /* share sheet closed */ }
}
async function onSubmit(e) {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form;
  const btn = form.querySelector(".btn.big, .btn");
  if (kind === "compose") return send();
  if (kind === "add") {
    const h = form.h.value.trim(); if (!h) return;
    try { S.flash = (await api("friends", { method: "POST", body: { handle: h } })).message; S.pendingAdd = null; }
    catch (err) { S.flash = err.message; }
    await sync(); render();
    return;
  }
  const v = Object.fromEntries(new FormData(form));
  if (kind === "signup") {
    v.handle = String(v.handle || "").trim().replace(/^@/, "").toLowerCase();
    v.email = String(v.email || "").trim();
    if (!String(v.name || "").trim()) return showErr("Tell us your name.", "name");
    if (!/^[a-z0-9_]{3,20}$/.test(v.handle)) return showErr("Use 3 to 20 letters, numbers or underscores.", "handle");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) return showErr("That doesn’t look like an email address.", "email");
    if (String(v.password || "").length < 10) return showErr("Use at least 10 characters.", "password");
    const keep = { ...v };
    S.making = 0; go("making");
    try { await createAccount(keep); await new Promise((r) => setTimeout(r, 400)); go("roostpick"); }
    catch (err) {
      go("signup");
      for (const k of ["name", "handle", "email", "password"]) { const i = $(`#f-${k}`); if (i) i.value = keep[k] || ""; }
      showErr(err.message, err.field);
    }
  } else if (kind === "signin") {
    if (!v.email || !v.password) return showErr("Enter your email and password.");
    try { await busyBtn(btn, "Unlocking…", () => signInPassword(String(v.email).trim(), v.password)); afterSignIn(); }
    catch (err) { showErr(err.message); }
  } else if (kind === "unlock") {
    try { await busyBtn(btn, "Unlocking…", () => unlockWithPassword(v.password || "")); afterSignIn(); }
    catch (err) { showErr(err.message, err.field); }
  } else if (kind === "forgot") {
    const email = String(v.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showErr("That doesn’t look like an email address.", "email");
    try {
      const r = await busyBtn(btn, "Sending…", () => api("reset-request", { method: "POST", body: { email } }));
      form.innerHTML = `<div class="locstate">${I.ok}<span>${esc(r.message)}</span></div>`;
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "reset") {
    const keep = $("[data-act=resetkeep]");
    try { await resetWith(keep ? "keep" : "fresh", keep || $("[data-act=resetfresh]")); }
    catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(err.message, err.field); }
  } else if (kind === "changepw") {
    if (!v.current) return showErr("Enter your current password.", "current");
    if (String(v.password || "").length < 10) return showErr("Use at least 10 characters.", "password");
    try {
      await busyBtn(btn, "Changing…", async () => {
        const { vault, salt } = await api("vault");
        const old = await E2E.fromPassword(v.current, fromB64url(salt));
        let ecdh;
        try { ({ ecdh } = await E2E.unlock(old.lockKey, vault)); }
        catch (_) { throw Object.assign(new Error("Your current password isn’t right."), { field: "current" }); }
        const ns = rand(16), nw = await E2E.fromPassword(v.password, ns);
        await api("password", { method: "POST", body: { oldProof: old.proof, salt: b64url(ns), proof: nw.proof, vault: await E2E.lock(nw.lockKey, { ecdh }) } });
        S.secretJwk = ecdh;
      });
      S.sheet = null; renderSheet();
      toast("Password changed. Any other phones were signed out.");
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "askpw") {
    try {
      const jwk = await busyBtn(btn, "Unlocking…", async () => {
        const { vault, salt } = await api("vault");
        const { lockKey } = await E2E.fromPassword(v.password || "", fromB64url(salt));
        try { return (await E2E.unlock(lockKey, vault)).ecdh; } catch (_) { throw Object.assign(new Error("That password didn’t unlock your key."), { field: "password" }); }
      });
      S.secretJwk = jwk;
      const s = S.sheet; S.sheet = null; renderSheet(); s.resolve(jwk);
    } catch (err) { showErr(err.message, err.field); }
  }
}
async function afterSignIn() {
  await sync();
  if (S.me.lat == null) return go("roostpick");
  if (S.pendingAdd) return go("flock");
  go("aviary");
}
async function setAttach(blob) {
  clearAttach();
  try { S.attach = await prepImage(blob); S.err = ""; }
  catch (_) { S.err = "That file couldn’t be opened as a photo."; }
  renderCompose();
}
function clearAttach() { if (S.attach) URL.revokeObjectURL(S.attach.preview); S.attach = null; if ($compose) renderCompose(); }
async function send() {
  const text = $ta.value.trim();
  if ((!text && !S.attach) || S.busy || $(".send", $compose).disabled) return;
  S.busy = true; S.err = ""; renderCompose();
  try {
    const id = uuid(), to = S.chat;
    const payload = { t: text };
    let blob = null;
    if (S.attach) {
      const sealed = await E2E.sealPhoto(id, S.attach.bytes);
      payload.p = { k: sealed.k, iv: sealed.iv, w: S.attach.w, h: S.attach.h };
      blob = sealed.data;
    }
    const ct = await E2E.seal(await base(to), { id, from: S.me.id, to }, payload);
    let r;
    if (blob) {
      const form = new FormData();
      form.append("meta", JSON.stringify({ id, to, ct }));
      form.append("photo", new Blob([blob], { type: "application/octet-stream" }), "photo.bin");
      r = await api("messages", { method: "POST", form });
    } else r = await api("messages", { method: "POST", body: { id, to, ct } });
    S.plain.set(id, payload);
    if (S.attach) { S.photos.set(id, S.attach.preview); S.attach = null; }   // keep the preview as our own copy
    $ta.value = ""; fitTa(); S.stick = true;
    const list = S.msgs.get(to) || []; list.push(r.message); S.msgs.set(to, list);
    await sync();
  } catch (err) { S.err = err.message; }
  S.busy = false; renderCompose();
}
$(".page").addEventListener("keydown", (e) => {
  if (e.target.id === "msg" && e.key === "Enter" && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); send(); }
});

/* ============================================================
   Start
   ============================================================ */
async function start() {
  mount();
  const m = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
  if (m) { S.pendingAdd = m[1].toLowerCase(); history.replaceState(null, "", location.pathname); }
  // a reset link: take the token out of the address bar straight away
  const rs = /#reset=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (rs) { S.resetToken = rs[1]; history.replaceState(null, "", location.pathname); }
  if (!window.crypto?.subtle || !window.indexedDB) { S.view = "welcome"; render(); return showErr("This browser can’t run InFlight’s encryption. Try Safari or Chrome."); }
  const saved = await idb.get("session");
  if (S.resetToken) {
    // a reset replaces whoever is signed in on this phone
    if (saved?.token) await idb.del("session");
    go("reset");
  } else if (saved?.token && saved.priv) {
    S.token = saved.token; S.me = saved.me; S.priv = saved.priv;
    S.fp = await E2E.fingerprint(saved.me.pub);
    S.pins = (await idb.get("pins:" + saved.me.id)) || {};
    S.view = S.pendingAdd ? "flock" : "aviary";
    render();
    await sync();
    if (S.me && S.me.lat == null) go("roostpick");
  } else go("welcome");
  // a reset or add-a-friend link opened while InFlight is already open in this tab
  window.addEventListener("hashchange", async () => {
    const r = /#reset=([A-Za-z0-9_-]{40,50})/.exec(location.hash), a = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
    if (!r && !a) return;
    history.replaceState(null, "", location.pathname);
    if (r) {
      if (S.token) { api("logout", { method: "POST" }).catch(() => {}); await forget(); }
      S.resetToken = r[1]; S.view = "loading"; go("reset");
    } else { S.pendingAdd = a[1].toLowerCase(); if (S.me) go("flock"); }
  });
  setInterval(() => { if (!AUTH_VIEWS.has(S.view) && $view) live(); flightCheck(); }, 1000);
  setInterval(() => { if (document.visibilityState === "visible") sync(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
}
// When a pigeon you can see lands, fetch it straight away instead of waiting for the next poll.
let nextLanding = 0;
function flightCheck() {
  if (!S.me) return;
  const t = now();
  const lands = [];
  for (const f of S.friends) if (f.last?.flying) lands.push(f.last.deliverAt);
  for (const list of S.msgs.values()) for (const m of list) if (m.flying) lands.push(m.deliverAt);
  const due = lands.filter((x) => x <= t);
  if (due.length && Date.now() > nextLanding) { nextLanding = Date.now() + 5000; setTimeout(sync, 1500); }
}
start();
