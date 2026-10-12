// InFlight — the phone app. Everything readable is encrypted and decrypted
// here; the server (functions/api/pigeon) only ever sees ciphertext.
import { E2E, te, rand, b64, b64url, fromB64url, uuid } from "./crypto.js";
import { LAND } from "./land.js";
import { PLACES, nearestPlace } from "./places.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SPEED_KMH = 80, SWIFT_MAX = 7;
const POLL_MS = 15000;
const AUTH_VIEWS = new Set(["welcome", "signup", "making", "signin", "unlock", "locpick", "pkoffer", "forgot", "reset"]);

/* ---------------- state ---------------- */
const S = {
  token: null, me: null, priv: null, secretJwk: null, fp: "",
  friends: [], incoming: [], outgoing: [], passkeys: [], skew: 0,
  view: "loading", chat: null, sheet: null, flash: "", err: "",
  msgs: new Map(), turns: new Map(), plain: new Map(), photos: new Map(), photoGone: new Set(),
  pairs: new Map(), pins: {}, attach: null, busy: false, stick: true, making: 0,
  pendingUnlock: null, pendingAdd: null, offline: false, seenLanded: new Set(),
  resetToken: null, resetInfo: null, avatars: new Map(), q: "", fq: "", addMsg: null,
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
async function api(path, { method = "GET", body, form, raw, blob } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if (form) payload = form;
  else if (blob) { headers["Content-Type"] = blob.type; payload = blob; }
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
// A person's picture if they have one (fetched with this phone's sign-in, then kept as a blob URL), else their initials.
function avatar(person, size = "") {
  const name = person?.name || "?";
  const url = person?.avatarAt ? avatarUrl(person) : "";
  return `<span class="av ${size}" data-c="${hue(name)}" aria-hidden="true">${url ? `<img src="${url}" alt="">` : esc(initials(name))}</span>`;
}
let avatarRender = 0;
function avatarUrl(p) {
  const key = `${p.id}:${p.avatarAt}`;
  if (S.avatars.has(key)) return S.avatars.get(key);
  S.avatars.set(key, "");
  api(`avatar/${encodeURIComponent(p.id)}?v=${p.avatarAt}`, { raw: true })
    .then((r) => r.blob())
    .then((b) => {
      S.avatars.set(key, URL.createObjectURL(b));
      clearTimeout(avatarRender); avatarRender = setTimeout(() => { render(); if (S.sheet && S.sheet.type !== "map") renderSheet(true); }, 60);
    })
    .catch(() => {});
  return "";
}
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
  bubble: ico(`<path d="M12 4C7 4 3 7.2 3 11.2c0 2.2 1.2 4.1 3.1 5.4L5.5 20l3.9-2c.8.2 1.7.3 2.6.3 5 0 9-3.2 9-7.1S17 4 12 4Z"/>`),
  people: ico(`<circle cx="9" cy="8.5" r="3.3"/><path d="M3.2 19c.6-3.3 3-5.2 5.8-5.2s5.2 1.9 5.8 5.2"/><circle cx="16.8" cy="9.5" r="2.6"/><path d="M15.6 13.9c2.6-.4 4.7 1.2 5.2 4.2"/>`),
  person: ico(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.3c1.2-2.3 3.3-3.4 5.7-3.4s4.5 1.1 5.7 3.4"/>`),
  compose: ico(`<path d="M11 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M17.8 3.8a1.8 1.8 0 0 1 2.5 2.5L12.5 14 9.5 15l1-3Z"/>`),
  plus: ico(`<path d="M12 5v14M5 12h14"/>`),
  minus: ico(`<path d="M5 12h14"/>`),
  contrast: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/>`),
  moon: ico(`<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>`),
  bell: ico(`<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>`),
  back: ico(`<path d="M15 4.5 7.5 12l7.5 7.5"/>`),
  chev: ico(`<path d="m9 5 7 7-7 7"/>`),
  more: `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="7.9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.1" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  search: ico(`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>`),
  loc: ico(`<path d="M20 4 4 10.8l6.9 2.3L13.2 20Z"/>`),
  map: ico(`<path d="M3 6.5 8.5 4l7 3L21 4.5v13L15.5 20l-7-3L3 19.5Z"/><path d="M8.5 4v13M15.5 7v13"/>`),
  addp: ico(`<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3 1.4 0 2.6.3 3.7 1"/><path d="M18 14v6M15 17h6"/>`),
  minusp: ico(`<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3s5.7 1.9 6.5 5.3"/><path d="M16 12h6"/>`),
  share: ico(`<path d="M12 3.5v11M8 7l4-4 4 4"/><path d="M6 11H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 19 11h-1"/>`),
  photo: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/>`),
  camera: ico(`<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.5"/>`),
  trash: ico(`<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>`),
  up: ico(`<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>`),
  check: ico(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  x: ico(`<path d="M6 6l12 12M18 6 6 18"/>`),
  pin: ico(`<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>`),
  gone: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 4l16 16"/>`),
  key: ico(`<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2"/>`),
  face: ico(`<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5c1.4 1.2 3.6 1.2 5 0"/>`),
  eye: ico(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`),
  lock: ico(`<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`),
  shield: ico(`<path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>`),
  info: ico(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>`),
  dist: ico(`<circle cx="6" cy="17" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M7.8 15.6c2.5-1 3.2-3.4 5-5s3-2 3.6-2.2" stroke-dasharray="2 2.6"/>`),
  hourglass: ico(`<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 5-8 8.5s8 4 8 8.5"/>`),
  ok: ico(`<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.7L16 9.5"/>`),
  dot: ico(`<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>`),
  warn: ico(`<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17.2v.3"/>`),
  mail: ico(`<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>`),
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
// Web Mercator, in degree-sized units so 1 unit of x is 1° of longitude.
const R2D = 180 / Math.PI, MERC_MAX = 85;
const mercY = (lat) => R2D * Math.log(Math.tan(Math.PI / 4 + Math.max(-MERC_MAX, Math.min(MERC_MAX, lat)) / (2 * R2D)));
// Each ring or line: Float32Array of lon,mercY pairs, plus its bounding box.
// Longitudes are unwrapped so shapes that cross the date line stay in one
// piece; a ring that circles the globe (Antarctica) is closed via the pole.
function shapes(list, closed) {
  return list.map((src) => {
    const a = src.slice();
    for (let i = 2; i < a.length; i += 2) { while (a[i] - a[i - 2] > 180) a[i] -= 360; while (a[i] - a[i - 2] < -180) a[i] += 360; }
    if (closed && a.length > 4 && Math.abs(a[a.length - 2] - a[0]) > 180) a.push(a[a.length - 2], a[1] < 0 ? -90 : 90, a[0], a[1] < 0 ? -90 : 90);
    const f = new Float32Array(a.length); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < a.length; i += 2) { const x = a[i], y = mercY(a[i + 1]); f[i] = x; f[i + 1] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { f, box: [x0, y0, x1, y1] };
  });
}
// Natural Earth data (public domain), self-hosted so no map company learns
// where anyone's pigeons fly. 110m is built in; 50m and 10m load when needed.
const WORLD = {};
function world(res) {
  if (res === "110m") {
    if (!WORLD[res]) WORLD[res] = { land: shapes(LAND.split(";").map((r) => r.split(",").map((n) => n / 2)), true), borders: [] };
    return WORLD[res];
  }
  if (!WORLD[res]) {
    WORLD[res] = "loading";
    fetch(`/pigeon/map/world-${res}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => {
      const dec = (str) => !str ? [] : str.split(";").map((r) => { const a = r.split(",").map(Number); for (let i = 2; i < a.length; i++) a[i] += a[i - 2]; return a.map((n) => n / d.q); });
      WORLD[res] = { land: shapes(dec(d.land), true), borders: shapes(dec(d.borders)) };
      redrawMap();
    }).catch(() => { WORLD[res] = "failed"; });
  }
  return typeof WORLD[res] === "object" ? WORLD[res] : null;
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
const MAP_KMAX = 400;                       // pixels per degree at full zoom
// The route, as points along the great circle (longitudes unwrapped so it never jumps the date line).
function routePts(m) {
  const a = { lat: m.route[0], lon: m.route[1] }, b = { lat: m.route[2], lon: m.route[3] };
  const N = 96, pts = []; let prev = null;
  for (let i = 0; i <= N; i++) {
    const p = gcPoint(a, b, i / N);
    if (prev != null) { while (p.lon - prev > 180) p.lon -= 360; while (p.lon - prev < -180) p.lon += 360; }
    prev = p.lon; pts.push({ x: p.lon, y: mercY(p.lat) });
  }
  return pts;
}
// Where the map sits: the whole route in view, unless the person has moved it.
function mapFrame(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight, usableH = Math.max(80, H - cardH - 30), sy0 = 20 + usableH / 2;
  const pts = routePts(m);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const fit = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    k: Math.min(W / Math.max(8, (Math.max(...xs) - Math.min(...xs)) * 1.5), usableH / Math.max(6, (Math.max(...ys) - Math.min(...ys)) * 1.6 + 8)),
  };
  return { W, H, sy0, pts, fit, view: S.sheet?.view || fit, kMin: Math.max(W / 360, H / (2 * mercY(MERC_MAX))) };
}
function drawMap(cv, m, cardH) {
  cv._m = m; cv._cardH = cardH;
  const { W, H, sy0, pts, view } = mapFrame(cv, m, cardH); if (!W || !H) return;
  const { cx, cy, k } = view;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = (n) => cssVar(cv, n);
  const ox = W / 2 - cx * k, oy = sy0 + cy * k;
  const X = (x) => ox + x * k, Y = (y) => oy - y * k;
  const vx0 = cx - W / 2 / k, vx1 = cx + W / 2 / k, vy0 = cy - (H - sy0) / k, vy1 = cy + sy0 / k;
  g.fillStyle = col("--sea"); g.fillRect(0, 0, W, H);
  // graticule, spaced so lines stay roughly 60px or more apart
  const step = [1, 2, 5, 10, 15, 30].find((s) => s * k >= 60) || 30;
  g.strokeStyle = col("--grid"); g.lineWidth = 1; g.beginPath();
  for (let lon = Math.ceil(vx0 / step) * step; lon <= vx1; lon += step) { const x = Math.round(X(lon)) + 0.5; g.moveTo(x, 0); g.lineTo(x, H); }
  for (let lat = -80; lat <= 80; lat += step) { const y = Y(mercY(lat)); if (y >= 0 && y <= H) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); } }
  g.stroke();
  // coastlines: the finest data that's loaded and worth drawing at this zoom
  const want = k < 5 ? "110m" : k < 40 ? "50m" : "10m";
  let data = world(want);
  if (!data && want === "10m") data = world("50m");
  if (!data) data = world("110m");
  // trace shapes in view; points are clamped to a box just off screen and
  // ones under a pixel apart skipped, so even the 10m coast draws fast
  const M = 40, offs = [];
  for (let o = Math.floor((vx0 + 180) / 360) * 360; o <= vx1 + 180; o += 360) offs.push(o);
  const trace = (list, close) => {
    for (const o of offs) for (const { f, box } of list) {
      if (box[2] + o < vx0 || box[0] + o > vx1 || box[3] < vy0 || box[1] > vy1) continue;
      let lx = 1e9, ly = 1e9;
      for (let i = 0, n = f.length; i < n; i += 2) {
        const sx = Math.max(-M, Math.min(W + M, ox + (f[i] + o) * k)), sy = Math.max(-M, Math.min(H + M, oy - f[i + 1] * k));
        if (i === 0) g.moveTo(sx, sy);
        else if (Math.abs(sx - lx) + Math.abs(sy - ly) >= 0.75 || i === n - 2) g.lineTo(sx, sy); else continue;
        lx = sx; ly = sy;
      }
      if (close) g.closePath();
    }
  };
  g.beginPath(); trace(data.land, true);
  g.fillStyle = col("--land"); g.fill("evenodd");
  g.strokeStyle = col("--land-edge"); g.lineWidth = k > 40 ? 1.1 : 0.8; g.stroke();
  if (data.borders.length && k >= 2.5) {
    g.beginPath(); trace(data.borders, false);
    g.strokeStyle = col("--border"); g.lineWidth = k > 40 ? 1.2 : 0.8; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
  }
  // the route, from and to, and the pigeon
  const N = pts.length - 1, P = pts.map((p) => [X(p.x), Y(p.y)]);
  g.strokeStyle = col("--tint"); g.lineWidth = 3.5; g.setLineDash([11, 8]); g.lineCap = "round";
  g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
  const f = Math.min(1, Math.max(0, (now() - m.sentAt) / (m.deliverAt - m.sentAt)));
  const [px, py] = P[Math.round(f * N)];
  // labels claim space in priority order; anything that would overlap is left out
  const taken = [[px - 24, py - 20, px + 24, py + 20], [0, H - cardH, W, H]];
  const ctlEl = $(".mapctl", $layer);
  if (ctlEl) { const r = ctlEl.getBoundingClientRect(), c = cv.getBoundingClientRect(); taken.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]); }
  const free = (b) => b[0] >= 2 && b[2] <= W - 2 && b[1] >= 2 && b[3] <= H - 2 && !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round";
  const text = (s, x, y, color) => { g.lineWidth = 4; g.strokeStyle = col("--land"); g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y); };
  // each end's label sits above or below its dot, away from the route, far enough out that the pigeon never covers it
  g.font = "600 13px -apple-system, system-ui, sans-serif";
  const end = ([x, y], toward, name) => {
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.fillStyle = col("--tint"); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    taken.push([x - 9, y - 9, x + 9, y + 9]);
    if (!name || x < -10 || x > W + 10 || y < -10 || y > H + 10) return;
    const w = g.measureText(name).width, ly = y + (toward[1] <= y ? 28 : -28), lx = Math.min(W - 8 - w, Math.max(8, x - w / 2));
    taken.push([lx - 3, ly - 10, lx + w + 3, ly + 10]);
    text(name, lx, ly, col("--label"));
  };
  end(P[0], P[4], m.fromPlace); end(P[N], P[N - 4], m.toPlace);
  // other cities once there's room to read them
  if (k >= 4) {
    g.font = "500 11px -apple-system, system-ui, sans-serif";
    const c2 = col("--label-2"), skip = new Set([m.fromPlace, m.toPlace]);
    for (const [name, lat, lon] of PLACES) {
      if (skip.has(name)) continue;
      for (const o of offs) {
        const x = X(lon + o), y = Y(mercY(lat)); if (x < -50 || x > W + 50 || y < -20 || y > H + 20) continue;
        const w = g.measureText(name).width, box = [x - 4, y - 8, x + 8 + w, y + 8];
        if (!free(box)) continue;
        taken.push(box);
        g.fillStyle = c2; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill();
        text(name, x + 6, y, c2);
      }
    }
  }
  const bird = new Path2D(BIRD), flip = P[N][0] > P[0][0] ? -1 : 1;   // the icon faces left
  g.save(); g.translate(px, py); g.scale(1.6 * flip, 1.6); g.translate(-12, -11);
  g.lineWidth = 3; g.strokeStyle = col("--cell"); g.stroke(bird); g.fillStyle = col("--label"); g.fill(bird);
  g.restore();
  if (ctlEl) ctlEl.classList.toggle("moved", !!S.sheet?.view);
}
let mapFrameReq = 0;
function redrawMap() {
  if (mapFrameReq) return;
  mapFrameReq = requestAnimationFrame(() => { mapFrameReq = 0; const cv = $(".map", $layer); if (cv && cv._m && S.sheet?.type === "map") drawMap(cv, cv._m, cv._cardH); });
}
// Move the map: zoom by `z` about screen point (sx, sy), then pan by (dx, dy) pixels.
function moveMap(cv, z, sx, sy, dx = 0, dy = 0) {
  if (!cv._m || S.sheet?.type !== "map") return;
  const { W, sy0, fit, view, kMin, pts } = mapFrame(cv, cv._m, cv._cardH);
  const k = Math.max(kMin, Math.min(MAP_KMAX, view.k * z));
  const wx = view.cx + (sx - W / 2) / view.k, wy = view.cy - (sy - sy0) / view.k;
  let cx = wx - (sx - W / 2) / k - dx / k, cy = wy + (sy - sy0) / k + dy / k;
  const mid = (pts[0].x + pts[pts.length - 1].x) / 2, ymax = mercY(MERC_MAX) - (sy0 / k) * 0.5;
  cx = Math.max(mid - 300, Math.min(mid + 300, cx));
  cy = Math.max(-ymax, Math.min(ymax, cy));
  S.sheet.view = { cx, cy, k };
  if (Math.abs(k - fit.k) < 1e-6 && Math.abs(cx - fit.cx) < 1e-6 && Math.abs(cy - fit.cy) < 1e-6) S.sheet.view = null;
  redrawMap();
}
// Drag to pan, pinch or scroll to zoom, double-tap to zoom in.
function mapGestures(cv) {
  const pts = new Map(); let last = null, lastTap = 0;
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const state = () => { const a = [...pts.values()]; if (a.length === 1) return { x: a[0][0], y: a[0][1], d: 0 };
    return { x: (a[0][0] + a[1][0]) / 2, y: (a[0][1] + a[1][1]) / 2, d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) }; };
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, local(e)); last = state();
    if (pts.size === 1) { const t = performance.now(); if (t - lastTap < 300) { const [x, y] = local(e); moveMap(cv, 2, x, y); lastTap = 0; } else lastTap = t; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, local(e)); const s = state();
    if (last && pts.size <= 2) {
      const z = pts.size === 2 && last.d && s.d ? s.d / last.d : 1;
      moveMap(cv, z, last.x, last.y, s.x - last.x, s.y - last.y);
      if (Math.abs(s.x - last.x) + Math.abs(s.y - last.y) > 6) lastTap = 0;
    }
    last = s;
  });
  const up = (e) => { pts.delete(e.pointerId); last = pts.size ? state() : null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = local(e); moveMap(cv, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), x, y); }, { passive: false });
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
      S.me = d.me; S.friends = d.friends; S.incoming = d.incoming; S.outgoing = d.outgoing; S.passkeys = d.passkeys; S.emailOn = !!d.emailOn;
      syncTheme();
      for (const f of S.friends) {
        checkPin(f);
        if (f.last) await decrypt(f.id, f.last);
        // a notice for pigeons that land while the app is open (not for ones already waiting at launch)
        if (f.last && !f.last.flying && !S.seenLanded.has(f.last.id)) {
          S.seenLanded.add(f.last.id);
          if (S.started && f.last.from === f.id && !f.last.readAt && !(S.view === "chat" && S.chat === f.id))
            toast(`<b>${esc(f.name)}</b><br>A pigeon just landed.`, "Read", () => go("chat", f.id));
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
let $view, $compose, $tabbar, $layer, $pop, $toast, $ta;
// No zooming the page (only the map zooms, and it handles its own pinches),
// and no copying. iOS ignores user-scalable=no, so stop its gestures here too.
const inField = (t) => !!t?.closest?.("input, textarea, [contenteditable]");
function lockPage() {
  const stop = (e) => e.preventDefault();
  ["gesturestart", "gesturechange", "gestureend"].forEach((n) => document.addEventListener(n, stop, { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 && !e.target.closest?.(".map")) e.preventDefault(); }, { passive: false });
  // a quick second tap zooms on iOS; let taps through, but not the zoom
  let lastTouch = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouch < 300 && !e.target.closest?.(".map, input, textarea, select, button, label, a")) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  for (const n of ["copy", "cut", "contextmenu", "selectstart", "dragstart"]) document.addEventListener(n, (e) => { if (!inField(e.target)) e.preventDefault(); });
}
function mount() {
  lockPage();
  root().innerHTML = `
    <div class="offline" hidden>You’re offline. Pigeons will wait.</div>
    <div class="view"></div>
    <form class="compose" hidden data-form="compose">
      <div class="note" hidden></div>
      <div class="attach" hidden></div>
      <div class="crow">
        <button type="button" class="plus" data-act="attachmenu" aria-label="Add a photo">${I.plus}</button>
        <div class="field-wrap">
          <textarea rows="1" placeholder="Message" aria-label="Message" id="msg" maxlength="2000" enterkeyhint="send"></textarea>
          <button type="submit" class="send" aria-label="Release the pigeon">${I.up}</button>
        </div>
      </div>
    </form>
    <nav class="tabbar" aria-label="Sections"></nav>
    <input type="file" accept="image/*" capture="environment" id="file-cam" hidden>
    <input type="file" accept="image/*" id="file-lib" hidden>
    <input type="file" accept="image/*" capture="user" id="av-cam" hidden>
    <input type="file" accept="image/*" id="av-lib" hidden>
    <div class="layer"></div>
    <div class="poplayer"></div>
    <div class="toasts"></div>`;
  $view = $(".view"); $compose = $(".compose"); $tabbar = $(".tabbar"); $layer = $(".layer"); $pop = $(".poplayer"); $toast = $(".toasts"); $ta = $("#msg");
  $view.addEventListener("scroll", () => {
    const y = $view.scrollTop;
    $view.classList.toggle("scrolled", y > 4);
    $view.classList.toggle("titled", y > 38);
    S.stick = $view.scrollHeight - y - $view.clientHeight < 40;
  }, { passive: true });
  root().addEventListener("click", onClick);
  root().addEventListener("change", onChange);
  root().addEventListener("submit", onSubmit);
  root().addEventListener("input", onInput);
  $ta.addEventListener("input", () => { fitTa(); renderCompose(); });
}
function fitTa() { $ta.style.height = "auto"; $ta.style.height = Math.min(120, $ta.scrollHeight) + "px"; }
function renderOffline() { const o = $(".offline"); if (o) o.hidden = !S.offline; }

function go(view, chat) {
  if (view === "reset" && S.view !== "reset") { S.view = view; return loadReset(); }
  const same = view === S.view && chat === S.chat;
  S.view = view; S.chat = chat ?? null; S.sheet = null; S.err = ""; S.stick = true;
  if (view !== "chat") clearAttach();
  closePop();
  if (!same && $view) { $view.scrollTop = 0; $view.classList.remove("scrolled", "titled"); }
  render();
  if (view === "chat" && chat) loadChat(chat).then(render).catch((e) => toast(esc(e.message)));
}

function render() {
  if (!$view) return;
  const auth = AUTH_VIEWS.has(S.view) || !S.me;
  const chat = !auth && S.view === "chat";
  root().classList.toggle("plain", chat || (!auth && S.view === "messages"));
  $view.classList.toggle("tabs-pad", !auth && !chat);
  if (auth) {
    $view.innerHTML = vAuth(); $compose.hidden = true; $tabbar.hidden = true; renderSheet();
    return;
  }
  $tabbar.hidden = chat;
  const keepTop = $view.scrollTop;
  $view.innerHTML = chat ? vChat() : S.view === "friends" ? vFriends() : S.view === "account" ? vAccount() : vMessages();
  if (chat && S.stick) $view.scrollTop = $view.scrollHeight; else $view.scrollTop = keepTop;
  renderCompose(); renderTabs(); renderSheet(); live(); filterLists();
}

/* ---------- shared bits ---------- */
const navbar = (title, { left = "", right = "", solid = false } = {}) =>
  `<div class="navbar${solid ? " solid" : ""}"><div class="nb-left">${left}</div><div class="nb-title one">${esc(title)}</div><div class="nb-right">${right}</div></div>`;
const nbtn = (act, icon, label, extra = "") => `<button class="nbtn" data-act="${act}" aria-label="${esc(label)}" ${extra}>${icon}</button>`;
const backBtn = (act, id, label = "") => `<button class="nbtn back" data-act="${act}"${id ? ` data-id="${id}"` : ""} aria-label="Back">${I.back}${label ? `<span>${esc(label)}</span>` : ""}</button>`;
const cell = ({ act, id, icon, tile, label, sub, val, chev, cls = "", tag }) => {
  const t = tag || (act ? "button" : "div");
  return `<${t} class="cell${icon ? " has-icon" : ""} ${cls}"${act ? ` data-act="${act}"` : ""}${id ? ` data-id="${esc(id)}"` : ""}${t === "button" ? ' type="button"' : ""}>
    ${icon ? `<span class="tile ${tile || "blue"}">${icon}</span>` : ""}
    <span class="ctext"><span>${label}</span>${sub ? `<span class="csub">${sub}</span>` : ""}</span>
    ${val != null ? `<span class="val">${val}</span>` : ""}${chev ? I.chev.replace('class="ico"', 'class="ico chev"') : ""}</${t}>`;
};
const chevSm = I.chev.replace('class="ico"', 'class="ico chev"');

function preview(f) {
  const l = f.last;
  if (!l) return { html: "No messages yet", at: 0 };
  if (l.from === S.me.id && l.flying) return { html: `<span class="fl">${I.bird}In flight · <span data-eta="${l.deliverAt}"></span> to go</span>`, at: l.sentAt };
  if (l.from !== S.me.id && l.flying) return { html: `<span class="fl">${I.bird}A pigeon is on its way…</span>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? "Couldn’t open this message" : p.p ? (l.photo === 2 ? "Photo (expired)" : "Photo") + (p.t ? ": " + p.t : "") : p.t;
  return { html: (l.from === S.me.id ? "You: " : "") + esc(body), at: l.deliverAt };
}
const fmtListTime = (ts) => { if (!ts) return ""; if (sameDay(ts, now())) return fmtTime(ts); if (sameDay(ts, now() - DAY)) return "Yesterday"; const d = new Date(ts); return now() - ts < 6 * DAY ? DOW[d.getDay()] : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };

/* ---------- Messages ---------- */
function vMessages() {
  const fr = S.friends.map((f) => ({ f, ...preview(f) })).filter((x) => x.f.last).sort((a, b) => b.at - a.at);
  const rows = fr.map(({ f, html, at }) => `
    <button class="mrow" data-act="open" data-id="${f.id}" data-find="${esc((f.name + " " + f.handle).toLowerCase())}">
      ${f.unread ? `<span class="dot" aria-label="Unread"></span>` : ""}
      ${avatar(f, "m")}
      <span class="mtext">
        <span class="mtop"><span class="mname one">${esc(f.name)}</span><time>${fmtListTime(at)}</time>${chevSm}</span>
        <span class="mprev">${html}</span>
      </span>
    </button>`).join("");
  const empty = S.friends.length
    ? `<p class="empty"><b>No messages yet</b>Tap the pencil to send your first pigeon.</p>`
    : `<p class="empty"><b>No messages yet</b>Add a friend by their handle, then send your first pigeon.<br><button class="btn" data-act="tab" data-id="friends">Find Friends</button></p>`;
  return `${navbar("Messages", { right: nbtn("newmsg", I.compose, "New message") })}
    <h1 class="large">Messages <span class="beta">Beta</span></h1>
    ${rows ? `<label class="search">${I.search}<input type="search" id="msearch" placeholder="Search" value="${esc(S.q)}" autocomplete="off" aria-label="Search messages"></label>` : ""}
    <div class="mlist" data-list="m">${rows}</div>${rows ? "" : empty}`;
}

/* ---------- Friends ---------- */
function vFriends() {
  const fr = [...S.friends].sort((a, b) => a.name.localeCompare(b.name));
  const inc = S.incoming.length, out = S.outgoing.length;
  const rows = fr.map((f) => `<button class="cell" data-act="open" data-id="${f.id}" data-find="${esc((f.name + " " + f.handle).toLowerCase())}">${avatar(f, "s")}
      <span class="ctext"><span class="one">${esc(f.name)}</span><span class="csub one">@${esc(f.handle)}${f.place ? ` · ${esc(f.place)}` : ""}</span></span>${chevSm}</button>`).join("");
  return `${navbar("Friends", { right: nbtn("share", I.share, "Share your handle") + nbtn("addfriend", I.addp, "Add a friend") })}
    <h1 class="large">Friends</h1>
    ${fr.length ? `<label class="search">${I.search}<input type="search" id="fsearch" placeholder="Search" value="${esc(S.fq)}" autocomplete="off" aria-label="Search friends"></label>` : ""}
    ${inc || out ? `<div class="group">${cell({ act: "requests", icon: I.addp, tile: "red", label: "Friend Requests", sub: inc ? `${inc} waiting for you` : `${out} sent, waiting for a reply`, val: inc ? `<span class="badge-n">${inc}</span>` : "", chev: true })}</div>` : ""}
    ${fr.length ? `<div class="ghead">${fr.length} friend${fr.length === 1 ? "" : "s"}</div><div class="group" data-list="f">${rows}</div>
      <div class="gfoot">Your handle is <b>@${esc(S.me.handle)}</b>. Share it so friends can add you.</div>`
      : `<p class="empty"><b>No friends yet</b>Add someone by their handle, or share yours: @${esc(S.me.handle)}.<br><button class="btn" data-act="addfriend">Add a Friend</button></p>`}
    <div class="gap"></div>`;
}

/* ---------- Account ---------- */
function vAccount() {
  const u = S.me;
  const dots = Array.from({ length: SWIFT_MAX }, (_, i) => `<i class="${i < u.swift ? "" : "e"}"></i>`).join("");
  return `${navbar("Account")}
    <h1 class="large">Account</h1>
    <div class="group"><button class="cell me-cell" data-act="profile">${avatar(u, "l")}
      <span class="ctext"><span class="name one">${esc(u.name)}</span><span class="csub one">@${esc(u.handle)} · Edit profile</span></span>${chevSm}</button></div>
    <div class="ghead">Location</div>
    <div class="group">
      ${cell({ icon: I.pin, tile: "blue", label: "Location", val: esc(u.place || "Not set") })}
      ${cell({ act: "locate", icon: I.loc, tile: "blue", label: "Use Current Location", cls: "action" })}
      <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
        <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
    </div>
    <div class="gfoot">Pigeons fly from here. It’s kept to about 10 km, and only your friends see it.</div>
    <div class="ghead">Pigeons</div>
    <div class="group">${cell({ icon: I.bird, tile: "orange", label: "Swift Pigeons", val: `<span class="dots" role="img" aria-label="${u.swift} of ${SWIFT_MAX}">${dots}</span>` })}</div>
    <div class="gfoot">${u.swift >= SWIFT_MAX ? "Your loft is full." : `The next one hatches in <span data-eta="${u.swiftNextAt}"></span>.`} Swift pigeons fly twice as fast and let you write when it isn’t your turn.</div>
    <div class="ghead">Appearance</div>
    <div class="group">${cell({ act: "appearancesheet", icon: I.contrast, tile: "blue", label: "Appearance", val: THEME_NAMES[theme()], chev: true })}</div>
    ${notifySection(u)}
    <div class="ghead">Privacy &amp; Security</div>
    <div class="group">
      ${cell({ icon: I.lock, tile: "green", label: "Encryption Key", val: `<span class="mono">${S.fp}</span>` })}
      ${cell({ act: "safetylist", icon: I.shield, tile: "teal", label: "Safety Numbers", chev: true })}
      ${cell({ act: "passkeys", icon: I.key, tile: "indigo", label: "Passkeys", val: S.passkeys.length || (passkeysSupported() ? "Off" : ""), chev: true })}
      ${cell({ act: "changepw", icon: I.lock, tile: "gray", label: "Change Password", chev: true })}
    </div>
    <div class="gfoot">Messages and photos are end-to-end encrypted. Your private key was made on this phone and locked with your password, so the server can’t read anything.</div>
    <div class="ghead">About</div>
    <div class="group">${cell({ icon: I.info, tile: "gray", label: "InFlight", val: "Beta" })}${cell({ icon: I.mail, tile: "blue", label: "Email", val: esc(u.email) })}</div>
    <div class="gfoot">Pigeons fly at ${SPEED_KMH} km/h, from 5 minutes to 3 days. Photos are deleted 24 hours after they land.</div>
    <div class="group mt">${cell({ act: "signout", label: "Sign Out", cls: "center destructive" })}</div>
    <div class="group mt">${cell({ act: "delask", label: "Delete Account", cls: "center destructive" })}</div>
    <div class="gap"></div>`;
}
const toggleCell = ({ act, id, icon, tile, label, sub, on, disabled }) => `<button type="button" class="cell has-icon" role="switch" aria-checked="${!!on}" data-act="${act}"${id ? ` data-id="${id}"` : ""}${disabled ? " disabled" : ""}>
    <span class="tile ${tile}">${icon}</span><span class="ctext"><span>${label}</span>${sub ? `<span class="csub">${sub}</span>` : ""}</span><span class="switch${on ? " on" : ""}" aria-hidden="true"></span></button>`;
// Account shows one row; the settings live in their own sheet, like iOS Settings.
function notifySection(u) {
  const ps = pushState(), n = u.notify || {};
  const on = [ps === "on" && "Push", u.notifyEmail && "Email"].filter(Boolean);
  const val = on.length ? on.join(", ") : ps === "homescreen" ? "Set Up" : "Off";
  return `<div class="ghead">Notifications</div>
    <div class="group">${cell({ act: "notifysheet", icon: I.bell, tile: "red", label: "Notifications", val: esc(val), chev: true })}</div>
    <div class="gfoot">${on.length ? `${n.quiet ? `Quiet from ${hourLabel(n.quietFrom)} to ${hourLabel(n.quietTo)}. ` : ""}Notifications say who sent a pigeon, never what it says.` : "Hear when a pigeon lands or someone adds you."}</div>`;
}
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
function vNotifySheet() {
  const u = S.me, n = u.notify || {}, ps = pushState();
  const pushFoot = {
    homescreen: "On iPhone, notifications need InFlight on your Home Screen: tap Share, then Add to Home Screen, and open it from there.",
    denied: "Notifications are blocked for InFlight. Turn them on in your phone’s Settings, then come back here.",
    unsupported: "This browser can’t show notifications. Email still works.",
  }[ps] || "Push notifications are set for each phone. The settings below apply to all of them.";
  const t = (key, icon, tile, label, sub) => toggleCell({ act: "npref", id: key, icon, tile, label, sub, on: !!n[key] });
  const hours = (key) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${n[key] === h ? " selected" : ""}>${hourLabel(h)}</option>`).join("");
  const anyOn = ps === "on" || u.notifyEmail;
  return `
    <div class="ghead">This Phone</div>
    <div class="group">
      ${toggleCell({ act: "pushtoggle", icon: I.bell, tile: "red", label: "Push Notifications", on: ps === "on", disabled: !["on", "off"].includes(ps) || S.pushBusy })}
      ${ps === "on" ? cell({ act: "pushtest", label: "Send a Test Notification", cls: "action" }) : ""}
    </div>
    <div class="gfoot">${pushFoot}</div>
    ${S.emailOn ? `<div class="ghead">Email</div>
    <div class="group">${toggleCell({ act: "emailtoggle", icon: I.mail, tile: "blue", label: "Email Me", sub: esc(u.email), on: u.notifyEmail })}</div>
    <div class="gfoot">Only when a pigeon has waited 10 minutes unread, and at most every half hour. Every email has a link to turn them off.</div>` : ""}
    <div class="${anyOn ? "" : "dim"}">
    <div class="ghead">Notify Me When</div>
    <div class="group">
      ${t("landed", I.bird, "orange", "A Pigeon Lands")}
      ${t("takeoff", I.up, "teal", "A Pigeon Takes Off", "When a friend sends you one")}
      ${t("requests", I.addp, "green", "Friend Requests")}
      ${t("accepted", I.people, "indigo", "Request Accepted")}
    </div>
    <div class="ghead">Lock Screen</div>
    <div class="group">${t("names", I.eye, "gray", "Show Names")}</div>
    <div class="gfoot">${n.names ? "Notifications say who sent a pigeon." : "Notifications just say “A pigeon has landed”, without who sent it."} They never include what a message says: only your phone can read that.</div>
    <div class="ghead">Quiet Hours</div>
    <div class="group">
      ${t("quiet", I.moon, "indigo", "Quiet Hours")}
      ${n.quiet ? `<label class="cell"><span class="ctext"><span>From</span></span><span class="val">${hourLabel(n.quietFrom)}</span>${chevSm}
        <select class="overlay" data-act="quiethour" data-id="quietFrom" aria-label="Quiet from">${hours("quietFrom")}</select></label>
      <label class="cell"><span class="ctext"><span>To</span></span><span class="val">${hourLabel(n.quietTo)}</span>${chevSm}
        <select class="overlay" data-act="quiethour" data-id="quietTo" aria-label="Quiet until">${hours("quietTo")}</select></label>` : ""}
    </div>
    <div class="gfoot">${n.quiet ? `Nothing arrives between ${hourLabel(n.quietFrom)} and ${hourLabel(n.quietTo)} (${esc(n.tz)} time). Pigeons that land meanwhile are announced when quiet hours end.` : "Hold notifications overnight, and hear about anything that landed when quiet hours end."}</div>
    </div>`;
}
async function setNotify(patch) {
  const before = S.me.notify;
  S.me.notify = { ...before, ...patch }; render(); renderSheet();            // feel instant
  try { const r = await api("me", { method: "PATCH", body: { notify: patch } }); S.me = r.me; }
  catch (err) { S.me.notify = before; toast(esc(err.message)); }
  render(); renderSheet();
}
function cityOptions() {
  const cur = S.me?.place;
  return `<option value="">Choose a city</option>` +
    [...PLACES].sort((a, b) => a[0].localeCompare(b[0])).map(([n]) => `<option value="${esc(n)}"${n === cur ? " selected" : ""}>${esc(n)}</option>`).join("");
}

/* ---------- Chat ---------- */
function status(f, t) {
  const n = esc(first(f.name));
  const B = (cls, text) => `<div class="status ${cls}">${I.bird}<span>${text}</span></div>`;
  switch (t?.state) {
    case "fresh": return B("sill", "Your pigeon is ready. Send the first message.");
    case "sill": return B("sill", "The pigeon is on your windowsill. Your turn to send.");
    case "inbound": return B("inbound", `A pigeon from ${n} is on its way.`);
    case "outbound": return B("", `Your pigeon is flying to ${n}.`);
    case "theirs": return B("", `${n} has the pigeon.`);
    default: return "";
  }
}
function bubble(f, m, isLastMine, gapTop) {
  const mine = m.from === S.me.id;
  if (!mine && m.flying) {
    return `<button class="fly" data-act="map" data-id="${m.id}" aria-label="Watch the pigeon on the map">
      <span class="t1">${I.bird}<span>On its way</span></span>
      <span class="t2"><b><span data-eta="${m.deliverAt}"></span> away</b><span>${fmtMiles(m.km)}${m.swift ? " · swift" : ""}</span></span>
      <span class="prog"><i data-from="${m.sentAt}" data-to="${m.deliverAt}"></i></span></button>`;
  }
  const p = S.plain.get(m.id) || { t: "" };
  const text = p.bad ? `<span class="bad-scroll">This message couldn’t be opened on this phone.</span>` : esc(p.t).replace(/\n/g, "<br>");
  const prog = mine && m.flying ? `<div class="prog"><i data-from="${m.sentAt}" data-to="${m.deliverAt}"></i></div>` : "";
  let html;
  if (p.p) {
    let photo;
    if (m.photo === 2 || S.photoGone.has(m.id)) photo = `<div class="ph">${I.gone}<span>Photo expired</span></div>`;
    else if (S.photos.get(m.id)) photo = `<img src="${S.photos.get(m.id)}" alt="Photo from ${esc(first(mine ? S.me.name : f.name))}" data-act="view" data-id="${m.id}">`;
    else photo = `<div class="ph">Opening photo…</div>`;
    html = `<div class="b pic${mine ? " me" : ""}${gapTop ? " gap-top" : ""}">${photo}${p.t || prog ? `<span class="ptxt">${text}${prog}</span>` : ""}</div>`;
  } else html = `<div class="b${mine ? " me" : ""}${gapTop ? " gap-top" : ""}">${text}${prog}</div>`;
  const meta = [];
  if (mine && m.flying) meta.push(`<span class="fl">In flight · <span data-eta="${m.deliverAt}"></span> to go${m.swift ? " · swift" : ""}</span>`);
  else if (mine && isLastMine) meta.push(`<span>Landed ${fmtShort(m.deliverAt)}</span>`);
  if (p.p && m.photo === 1 && !m.flying && !S.photoGone.has(m.id)) meta.push(`<span class="fl">Photo disappears in <span data-eta="${m.expiresAt}"></span></span>`);
  return html + (meta.length ? `<div class="meta${mine ? " me" : ""}">${meta.join("")}</div>` : "");
}
function vChat() {
  const f = friend(S.chat);
  if (!f) return `${navbar("", { left: backBtn("tab", "messages"), solid: true })}<p class="empty"><b>Not in your friends</b>This person isn’t in your friends any more.</p>`;
  const msgs = S.msgs.get(f.id);
  const t = S.turns.get(f.id) || f.turn;
  let body = "", lastStamp = 0, prevFrom = null;
  const lastMine = msgs && [...msgs].reverse().find((m) => m.from === S.me.id);
  if (!msgs) body = `<p class="empty">Opening your messages…</p>`;
  else if (!msgs.length) body = `<p class="empty"><b>Say hello</b>Messages to ${esc(first(f.name))} are end-to-end encrypted and fly the real distance between you.</p>`;
  else for (const m of msgs) {
    const at = m.from === S.me.id || m.flying ? m.sentAt : m.deliverAt;
    if (at - lastStamp > HOUR) { body += `<div class="stamp"><b>${dayLabel(at)}</b> ${fmtTime(at)}</div>`; prevFrom = null; }
    lastStamp = at;
    body += bubble(f, m, lastMine && m.id === lastMine.id, prevFrom !== null && prevFrom !== m.from);
    prevFrom = m.from;
  }
  const warn = f.keyChanged ? `<div class="warn"><span>${esc(first(f.name))}’s security key changed. This happens when they make a new account or reset their password. Compare safety numbers before you send anything private.</span><button class="btn small" data-act="trust" data-id="${f.id}">I’ve Checked</button></div>` : "";
  return `<div class="navbar solid chatnav">
      <div class="nb-left">${backBtn("tab", "messages")}</div>
      <button class="chatwho" data-act="friendinfo" data-id="${f.id}" aria-label="${esc(f.name)}: details">${avatar(f, "s")}<span class="nm"><span>${esc(f.name)}</span>${I.chev}</span></button>
      <div class="nb-right">${nbtn("chatmenu", I.more, "More")}</div>
    </div>
    ${warn}<div class="msgs">${status(f, t)}${body}</div>`;
}

/* ---------- sign-up and sign-in ---------- */
function field(name, placeholder, type, ac, prefix) {
  return `<label class="fcell">${prefix ? `<span class="pre">${prefix}</span>` : ""}<input id="f-${name}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" autocomplete="${ac}" aria-label="${esc(placeholder)}"${type === "email" || name === "handle" ? ' autocapitalize="off" spellcheck="false"' : ""}${name === "handle" ? ' maxlength="20"' : ""}>${type === "password" ? `<button type="button" class="peek" data-act="peek" aria-label="Show password">${I.eye}</button>` : ""}</label>`;
}
const ferr = `<p class="gfoot bad ferr" role="alert" hidden></p>`;
function vAuth() {
  const back = (to) => navbar("", { left: backBtn("to", to) });
  switch (S.view) {
    case "loading": return `<div class="loading">Opening InFlight…</div>`;
    case "welcome": return `<div class="auth welcome">
        <div class="appicon">${I.bird}</div>
        <h1>InFlight <span class="beta">Beta</span></h1>
        <ul class="feats">
          <li>${I.dist}<div><b>Real distance</b><span>Each message flies the real miles between you, at pigeon speed.</span></div></li>
          <li>${I.lock}<div><b>End-to-end encrypted</b><span>Only you and your friend can read your messages and photos.</span></div></li>
          <li>${I.hourglass}<div><b>Photos that vanish</b><span>Photos are deleted 24 hours after they land.</span></div></li>
        </ul>
        <div class="stack">
          <button class="btn wide" data-act="to" data-id="signup">Create Account</button>
          <button class="btn wide plain" data-act="to" data-id="signin">Sign In</button>
        </div></div>`;
    case "signup": return `<div class="auth">${back("welcome")}
        <h1 class="large">Create Account</h1>
        <form data-form="signup" novalidate>
          <div class="group">${field("name", "Name", "text", "name")}${field("handle", "handle", "text", "username", "@")}</div>
          <div class="gfoot">Friends see your name and find you by your handle.</div>
          <div class="group mt">${field("email", "Email", "email", "email")}${field("password", "Password", "password", "new-password")}</div>
          <div class="gfoot">At least 10 characters. Your password also locks your encryption key, so add a passkey later as a backup.</div>
          ${ferr}
          <div class="pad"><button class="btn wide">Create Account</button></div>
        </form></div>`;
    case "making": {
      const step = (n, label) => `<li class="${S.making >= n ? "is-ok" : S.making === n - 1 ? "is-now" : ""}">${S.making >= n ? I.ok : S.making === n - 1 ? `<span class="spin"></span>` : I.dot}<span>${label}</span></li>`;
      return `<div class="auth"><div class="hero"><div class="appicon">${I.bird}</div><h1>Setting Up Your Account</h1><p>Your key is made and locked on this phone.</p></div>
        <ul class="steps">${step(1, "Making your key pair")}${step(2, "Locking it with your password")}${step(3, "Creating your account")}</ul></div>`;
    }
    case "signin": return `<div class="auth">${back("welcome")}
        <h1 class="large">Sign In</h1>
        <form data-form="signin" novalidate>
          <div class="group">${field("email", "Email", "email", "username webauthn")}${field("password", "Password", "password", "current-password")}</div>
          ${ferr}
          <div class="pad"><button class="btn wide">Sign In</button></div>
        </form>
        <div class="group">${passkeysSupported() ? cell({ act: "pkget", icon: I.key, tile: "indigo", label: "Sign In with a Passkey", cls: "action" }) : ""}${cell({ act: "to", id: "forgot", label: "Forgot Password?", cls: "action" })}</div>
        <div class="stack"><button class="btn wide plain" data-act="to" data-id="signup">Create Account</button></div>
      </div>`;
    case "unlock": return `<div class="auth">${navbar("", { left: backBtn("cancelunlock") })}
        <h1 class="large">Unlock Messages</h1>
        <p class="sub">Your passkey signed you in. Enter your password once so this phone can unlock your encryption key.</p>
        <form data-form="unlock" novalidate>
          <div class="group mt-s">${field("password", "Password", "password", "current-password")}</div>${ferr}
          <div class="pad"><button class="btn wide">Unlock</button></div>
        </form>
        <div class="group">${cell({ act: "to", id: "forgot", label: "Forgot Password?", cls: "action" })}</div></div>`;
    case "forgot": return `<div class="auth">${back("signin")}
        <h1 class="large">Reset Password</h1>
        <p class="sub">We’ll email you a link to choose a new password. It works once, for one hour.</p>
        <form data-form="forgot" novalidate>
          <div class="group mt-s">${field("email", "Email", "email", "email")}</div>${ferr}
          <div class="gfoot">With a passkey, a reset keeps your messages. Without one, you start with a new key and older messages can’t be opened.</div>
          <div class="pad"><button class="btn wide">Email Reset Link</button></div>
        </form></div>`;
    case "reset": return vReset();
    case "locpick": return `<div class="auth">${navbar("")}
        <h1 class="large">Your Location</h1>
        <p class="sub">Pigeons fly from here, so it sets how long your messages take. It’s kept to about 10 km, and only your friends see it.</p>
        <div class="group mt">
          ${S.me?.place ? cell({ icon: I.check, tile: "green", label: esc(S.me.place), sub: "Current location" }) : ""}
          ${cell({ act: "locate", icon: I.loc, tile: "blue", label: S.me?.place ? "Use Current Location Again" : "Use Current Location", cls: "action" })}
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
        </div>${ferr}
        <div class="stack"><button class="btn wide" data-act="locdone"${S.me?.place ? "" : " disabled"}>Continue</button></div></div>`;
    case "pkoffer": return `<div class="auth"><div class="hero tall"><span class="big-ico">${I.face}</span>
        <h1>Sign In with Face ID</h1><p>Save a passkey to sign in with Face ID or your fingerprint. On most newer phones it can also unlock your messages if you forget your password.</p></div>${ferr}
        <div class="stack"><button class="btn wide" data-act="pkadd" data-next="messages">Save a Passkey</button><button class="btn wide plain" data-act="tab" data-id="messages">Not Now</button></div></div>`;
  }
  return "";
}
function vReset() {
  const info = S.resetInfo;
  if (!info) return `<div class="loading">Checking your reset link…</div>`;
  if (info.error) return `<div class="auth"><div class="hero tall"><span class="big-ico">${I.warn}</span><h1>This Link Won’t Work</h1><p>${esc(info.error)}</p></div>
      <div class="stack"><button class="btn wide" data-act="to" data-id="forgot">Get a New Link</button><button class="btn wide plain" data-act="to" data-id="welcome">Back</button></div></div>`;
  const canKeep = info.passkeys.length && passkeysSupported();
  return `<div class="auth">${navbar("")}
      <h1 class="large">New Password</h1>
      <p class="sub">For ${esc(info.name)} (@${esc(info.handle)}, ${esc(info.email)}).</p>
      <form data-form="reset" novalidate>
        <div class="group mt-s">${field("password", "New password", "password", "new-password")}</div>${ferr}
        <div class="gfoot">${canKeep ? "Use your passkey to keep all your messages readable. Starting fresh" : "Without a passkey, this"} makes a new key: your friends stay, but older messages can’t be opened, and friends see that your key changed.</div>
        <div class="stack">${canKeep ? `<button type="button" class="btn wide" data-act="resetkeep">${I.key}Keep Messages with Passkey</button><button type="button" class="btn wide plain" data-act="resetfresh">Start Fresh Instead</button>`
          : `<button type="button" class="btn wide" data-act="resetfresh">Set New Password</button>`}</div>
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
  toast(mode === "keep" ? "Password changed. Your messages are safe." : "Password changed. You’re starting fresh with a new key.");
}

/* ---------- composer and tab bar ---------- */
function renderCompose() {
  const show = S.view === "chat" && !!S.chat && !!friend(S.chat) && !!S.me;
  $compose.hidden = !show; if (!show) return;
  const f = friend(S.chat), t = S.turns.get(f.id) || f.turn, sw = S.me.swift;
  const note = $(".note", $compose), btn = $(".send", $compose);
  const has = $ta.value.trim() || S.attach;
  let blocked = false;
  if (S.err) { note.hidden = false; note.className = "note stop"; note.textContent = S.err; }
  else if (f.keyChanged) { note.hidden = false; note.className = "note stop"; note.textContent = "Check the new safety number before sending."; blocked = true; }
  else if (S.me.lat == null) { note.hidden = false; note.className = "note stop"; note.textContent = "Set your location in Account before sending."; blocked = true; }
  else if (t.free) note.hidden = true;
  else if (sw > 0) { note.hidden = false; note.className = "note"; note.innerHTML = `${I.bird}<span>Sends with a swift pigeon (${sw} left), 2× faster.</span>`; }
  else { note.hidden = false; note.className = "note stop"; note.textContent = `No swift pigeons left. The next hatches in ${fmtDur(S.me.swiftNextAt - now())}.`; blocked = true; }
  btn.disabled = blocked || !has || S.busy;
  $ta.disabled = blocked && !S.err;
  const a = $(".attach", $compose);
  a.hidden = !S.attach;
  if (S.attach && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<img src="${S.attach.preview}" alt=""><span>Photo, ${fmtBytes(S.attach.bytes.length)}. Encrypted before it leaves this phone.</span><button type="button" data-act="unattach" aria-label="Remove photo">${I.x}</button>`;
  }
  if (!S.attach && a.dataset.for) { a.dataset.for = ""; a.innerHTML = ""; }
}
function renderTabs() {
  const unread = S.friends.reduce((n, f) => n + (f.unread || 0), 0);
  const cur = S.view === "chat" ? "messages" : S.view;
  const tab = (id, label, icon, badge) => `<button class="tab" data-act="tab" data-id="${id}" aria-current="${cur === id}">${badge ? `<span class="badge">${badge}</span>` : ""}${icon}<span>${label}</span></button>`;
  $tabbar.innerHTML = `<div class="tabs">${tab("messages", "Messages", I.bubble, unread)}${tab("friends", "Friends", I.people, S.incoming.length)}${tab("account", "Account", I.person, 0)}</div>`;
  document.title = unread ? `(${unread}) InFlight` : "InFlight";
}
function filterLists() {
  const run = (list, q) => { const el = $(`[data-list="${list}"]`); if (!el) return; q = q.trim().toLowerCase(); el.querySelectorAll("[data-find]").forEach((r) => { r.hidden = !!q && !r.dataset.find.includes(q); }); };
  run("m", S.q); run("f", S.fq);
}
function onInput(e) {
  if (e.target.id === "msearch") { S.q = e.target.value; filterLists(); }
  if (e.target.id === "fsearch") { S.fq = e.target.value; filterLists(); }
}

/* ---------- sheets ---------- */
// header: { left: {label, act}, right: {label, act} | {label, form}, strong }
function sheetHtml(title, body, { left, right = { label: "Done", act: "close" }, flush, plain } = {}) {
  const b = (x, cls) => !x ? ""
    : x.form ? `<button type="button" class="nbtn prominent ${cls}" data-act="submit" data-id="${x.form}" aria-label="${esc(x.label)}">${I.check}</button>`
    : `<button type="button" class="nbtn ${cls}" data-act="${x.act}" aria-label="${esc(x.label)}">${x.act === "close" ? I.x : I.back}</button>`;
  return `<div class="scrim" data-act="close"></div><div class="sheet${plain ? " plainbg" : ""}" role="dialog" aria-label="${esc(title)}"><div class="grab"></div>
    <header><span class="l">${b(left, "l")}</span><h3>${esc(title)}</h3><span class="r">${b(right, "r")}</span></header>
    <div class="body${flush ? " flush" : ""}">${body}</div></div>`;
}
function renderSheet(refresh) {
  const s = S.sheet;
  if (refresh && s?.type !== "profile") return;
  if (!s) { $layer.innerHTML = ""; return; }
  const f = s.id ? friend(s.id) : null;
  switch (s.type) {
    case "map":
      if (!$(".map", $layer)) $layer.innerHTML = sheetHtml("Pigeon in Flight", `<canvas class="map" role="img" aria-label="Map of the pigeon’s route. Drag to move, pinch to zoom."></canvas>
        <div class="mapctl glass"><button type="button" data-act="mapzoom" data-id="in" aria-label="Zoom in">${I.plus}</button><button type="button" data-act="mapzoom" data-id="out" aria-label="Zoom out">${I.minus}</button><button type="button" class="fitbtn" data-act="mapzoom" data-id="fit" aria-label="Show the whole route">${I.loc}</button></div>
        <div class="mapcard"></div>`, { flush: true });
      if (!$(".map", $layer)._g) { $(".map", $layer)._g = 1; mapGestures($(".map", $layer)); }
      return tickMap();
    case "safety":
      $layer.innerHTML = sheetHtml("Safety Number", `
        <div class="profile-head">${avatar(f, "l")}<span class="name">${esc(f?.name || "")}</span></div>
        <div class="group mt-s"><div class="digits">${(s.digits || []).map((d) => `<span>${d}</span>`).join("")}</div></div>
        <div class="gfoot">Compare these 60 digits with ${esc(first(f?.name || "your friend"))} in person or on a call. If they match, only the two of you can read your messages. Not even the server could swap in a different key.</div>`,
        { left: s.from ? { label: "Back", act: s.from } : null });
      return;
    case "safetylist":
      $layer.innerHTML = sheetHtml("Safety Numbers", S.friends.length
        ? `<div class="ghead">Choose a friend</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="safety" data-id="${x.id}" data-from="safetylist">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(x.name)}</span></span>${chevSm}</button>`).join("")}</div>
          <div class="gfoot">Each friend has a safety number you can compare to check your messages are private.</div>`
        : `<p class="empty"><b>No friends yet</b>Safety numbers appear once you add a friend.</p>`);
      return;
    case "newmsg":
      $layer.innerHTML = sheetHtml("New Message", S.friends.length
        ? `<div class="ghead">To</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="open" data-id="${x.id}">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(x.name)}</span><span class="csub one">${esc(x.place || "No location")}${S.me.lat != null && x.lat != null ? ` · ${fmtDur(flightMs(haversineKm(S.me.lat, S.me.lon, x.lat, x.lon)))} by pigeon` : ""}</span></span>${chevSm}</button>`).join("")}</div>`
        : `<p class="empty"><b>No friends yet</b>Add a friend first.<br><button class="btn" data-act="addfriend">Add a Friend</button></p>`,
        { left: { label: "Cancel", act: "close" }, right: null });
      return;
    case "addfriend":
      if (!$("#add-h", $layer)) {
        $layer.innerHTML = sheetHtml("Add Friend", `<form id="add-form" data-form="add" novalidate>
            <div class="group mt-s"><label class="fcell"><span class="pre">@</span><input name="h" id="add-h" placeholder="handle" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Friend’s handle"></label></div>
            <p class="gfoot add-msg" role="status">Ask a friend for their handle. They’ll get a friend request.</p></form>
            <div class="ghead">Your handle</div><div class="group">${cell({ label: `@${esc(S.me.handle)}` })}${cell({ act: "share", label: "Share My Handle", cls: "action" })}</div>`,
          { left: { label: "Cancel", act: "close" }, right: { label: "Send", form: "add-form" } });
        const i = $("#add-h", $layer); i.value = S.pendingAdd || ""; setTimeout(() => i.focus(), 300);
      }
      return;
    case "requests": {
      const row = (p, inc) => `<div class="reqrow${inc ? " inc" : ""}">${avatar(p, "s")}<span class="ctext"><span class="one">${esc(p.name)}</span><br><span class="csub">@${esc(p.handle)}</span></span>
        <span class="acts">${inc ? `<button class="btn small gray" data-act="decline" data-id="${p.id}" aria-label="Decline ${esc(p.name)}">Decline</button><button class="btn small" data-act="accept" data-id="${p.id}" aria-label="Accept ${esc(p.name)}">Accept</button>`
          : `<button class="btn small gray" data-act="cancelreq" data-id="${p.id}" aria-label="Cancel request to ${esc(p.name)}">Cancel</button>`}</span></div>`;
      $layer.innerHTML = sheetHtml("Friend Requests",
        (S.incoming.length ? `<div class="ghead">Waiting for you</div><div class="group">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "") +
        (S.outgoing.length ? `<div class="ghead">Sent</div><div class="group">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : "") +
        (S.incoming.length + S.outgoing.length ? "" : `<p class="empty"><b>All caught up</b>No friend requests right now.</p>`));
      return;
    }
    case "friendinfo": {
      if (!f) { S.sheet = null; return renderSheet(); }
      const km = S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : null;
      $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl")}<span class="name">${esc(f.name)}</span><span class="sub">@${esc(f.handle)}</span></div>
        <div class="group mt">
          ${cell({ icon: I.pin, tile: "blue", label: "Location", val: esc(f.place || "Not set") })}
          ${km != null ? cell({ icon: I.dist, tile: "teal", label: "Distance", val: fmtMiles(km) }) : ""}
          ${km != null ? cell({ icon: I.bird, tile: "orange", label: "Pigeon Flight", val: fmtDur(flightMs(km)) }) : ""}
        </div>
        <div class="group mt">${cell({ act: "safety", id: f.id, icon: I.shield, tile: "teal", label: "Safety Number", chev: true })}</div>
        <div class="group mt">${cell({ act: "unfriendask", id: f.id, label: "Remove Friend", cls: "center destructive" })}</div>`);
      return;
    }
    case "view":
      $layer.innerHTML = `<div class="viewer" data-act="close" role="dialog" aria-label="Photo"><img src="${S.photos.get(s.id) || ""}" alt="Photo"><p>Decrypted on this phone. Tap to close.</p></div>`;
      return;
    case "appearance":
      $layer.innerHTML = sheetHtml("Appearance", `<div class="group mt-s">
        ${THEMES.map((k) => `<button type="button" class="cell" role="radio" aria-checked="${theme() === k}" data-act="theme" data-id="${k}"><span class="ctext"><span>${THEME_NAMES[k]}</span></span>${theme() === k ? `<span class="val tick">${I.check}</span>` : ""}</button>`).join("")}
        </div>
        <div class="gfoot">${theme() === "auto" ? "Matches your phone’s Light or Dark setting. " : ""}Saved to your account, so it’s the same on every phone you sign in on.</div>`);
      return;
    case "notifications": {
      const old = $(".sheet .body", $layer), top = old ? old.scrollTop : 0;
      $layer.innerHTML = sheetHtml("Notifications", vNotifySheet());
      if (top) $(".sheet .body", $layer).scrollTop = top;    // toggling shouldn't jump the list
      return;
    }
    case "passkeys":
      $layer.innerHTML = sheetHtml("Passkeys", `
        ${S.passkeys.length ? `<div class="ghead">Saved passkeys</div><div class="group">${S.passkeys.map((p) => `<div class="cell has-icon"><span class="tile indigo">${I.key}</span><span class="ctext"><span>${esc(p.label || "Passkey")}</span><span class="csub">Added ${fmtDate(p.createdAt)}</span></span><button class="link danger" data-act="pkdel" data-id="${esc(p.id)}">Remove</button></div>`).join("")}</div>` : ""}
        ${passkeysSupported() ? `<div class="group ${S.passkeys.length ? "mt" : "mt-s"}">${cell({ act: "pkadd", icon: I.plus, tile: "indigo", label: "Add a Passkey", cls: "action" })}</div>
          <div class="gfoot">Passkeys let you sign in with Face ID or your fingerprint. On newer phones they also unlock your messages, so a password reset can keep them.</div>`
          : `<p class="empty"><b>Not available</b>This browser can’t save passkeys.</p>`}`);
      return;
    case "askpw":
      if (!$("#f-password", $layer)) $layer.innerHTML = sheetHtml("Link Passkey", `<p class="gfoot mt-s">Enter your password once so this passkey can also unlock your messages on a new phone.</p>
        <form id="askpw-form" data-form="askpw" novalidate><div class="group mt-xs">${field("password", "Password", "password", "current-password")}</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Link", form: "askpw-form" } });
      return;
    case "profile": {
      const u = S.me, wait = u.handleNextAt && u.handleNextAt > now() ? u.handleNextAt - now() : 0;
      const keep = $("#f-name", $layer) ? { name: $("#f-name", $layer).value, handle: $("#f-handle", $layer).value } : null;
      $layer.innerHTML = sheetHtml("Edit Profile", `
        <div class="profile-head"><button type="button" class="avedit" data-act="avmenu">${avatar(u, "xl")}<span>${u.avatarAt ? "Edit Photo" : "Add Photo"}</span></button></div>
        <form id="profile-form" data-form="profile" novalidate>
          <div class="ghead">Name</div><div class="group">${field("name", "Name", "text", "name")}</div>
          <div class="ghead">Handle</div><div class="group">${field("handle", "handle", "text", "username", "@")}</div>
          <div class="gfoot">${wait ? `You can change your handle once a day. Next change in ${fmtDur(wait)}.` : "Friends find you by your handle. You can change it once a day."}</div>${ferr}
        </form>
        <div class="gfoot mt">Your friends, and people you’ve sent or received a friend request from, can see your photo.</div>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Done", form: "profile-form" } });
      $("#f-name", $layer).value = keep ? keep.name : u.name;
      $("#f-name", $layer).maxLength = 50;
      $("#f-handle", $layer).value = keep ? keep.handle : u.handle;
      if (wait) $("#f-handle", $layer).disabled = true;
      return;
    }
    case "changepw":
      if (!$("#f-current", $layer)) $layer.innerHTML = sheetHtml("Change Password", `<form id="pw-form" data-form="changepw" novalidate>
        <div class="group mt-s">${field("current", "Current password", "password", "current-password")}</div>
        <div class="group mt">${field("password", "New password", "password", "new-password")}</div>
        <div class="gfoot">At least 10 characters. Other phones signed in to your account will be signed out.</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Change", form: "pw-form" } });
      return;
  }
}
function tickMap() {
  const s = S.sheet; if (!s || s.type !== "map") return;
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
  const card = $(".mapcard", $layer), cv = $(".map", $layer);
  if (!m || !card || !m.route) return;
  const left = m.deliverAt - now();
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

/* ---------- menus, action sheets and banners ---------- */
// iOS-style context menu anchored to a button. items: {label, icon, act, id, destructive}
function openMenu(anchor, items) {
  const box = root().getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const up = a.top - box.top > box.height * 0.55;
  const right = a.left + a.width / 2 > box.left + box.width / 2;
  $pop.innerHTML = `<div class="menu-scrim" data-act="closepop"></div>
    <div class="menu-pop" role="menu">${items.map((it) =>
      `<button class="mi${it.destructive ? " destructive" : ""}" role="menuitem" data-act="${it.act}"${it.id ? ` data-id="${esc(it.id)}"` : ""}><span>${esc(it.label)}</span>${it.icon || ""}</button>`).join("")}</div>`;
  const m = $(".menu-pop", $pop);
  if (up) m.style.bottom = `${box.bottom - a.top + 6}px`; else m.style.top = `${a.bottom - box.top + 6}px`;
  if (right) m.style.right = `${Math.max(8, box.right - a.right)}px`; else m.style.left = `${Math.max(8, a.left - box.left)}px`;
  m.style.setProperty("--origin", `${up ? "bottom" : "top"} ${right ? "right" : "left"}`);
}
function openActions({ title, message, actions }) {
  $pop.innerHTML = `<div class="scrim" data-act="closepop"></div><div class="asheet" role="dialog" aria-label="${esc(title || "Confirm")}">
    <div class="grp">${title || message ? `<div class="msg">${title ? `<b>${esc(title)}</b>` : ""}${esc(message || "")}</div>` : ""}${actions.map((x) =>
      `<button class="ab${x.destructive ? " destructive" : ""}" data-act="${x.act}"${x.id ? ` data-id="${esc(x.id)}"` : ""}>${esc(x.label)}</button>`).join("")}</div>
    <button class="cancel" data-act="closepop">Cancel</button></div>`;
}
function closePop() { if ($pop) $pop.innerHTML = ""; }
let toastTimer = 0;
function toast(html, btn, fn) {
  if (!$toast) return;
  $toast.innerHTML = `<div class="toast" role="status"><span class="ticon">${I.bird}</span><span>${html}</span>${btn ? `<button type="button" class="btn small" data-act="toast">${esc(btn)}</button>` : ""}</div>`;
  S.toastFn = fn;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $toast.innerHTML = ""; }, 5000);
}

/* ============================================================
   Actions
   ============================================================ */
function showErr(msg, field) {
  const scope = S.sheet && $("form", $layer) ? $layer : root();
  scope.querySelectorAll(".fcell.bad").forEach((e) => e.classList.remove("bad"));
  const f = field && $(`#f-${field}`, scope)?.closest(".fcell");
  if (f) { f.classList.add("bad"); $("input", f)?.focus(); }
  const g = $(".ferr", scope); if (g) { g.textContent = msg; g.hidden = false; } else toast(esc(msg));
}
async function busyBtn(btn, label, fn) {
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}
async function onClick(e) {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const id = t.dataset.id;
  const inPop = !!t.closest(".poplayer") && t.dataset.act !== "closepop";
  if (inPop) closePop();
  switch (t.dataset.act) {
    case "tab": return go(id);
    case "to": return go(id);
    case "open": return go("chat", id);
    case "newmsg": S.sheet = { type: "newmsg" }; return renderSheet();
    case "requests": S.sheet = { type: "requests" }; return renderSheet();
    case "addfriend": S.sheet = { type: "addfriend" }; return renderSheet();
    case "safetylist": S.sheet = { type: "safetylist" }; return renderSheet();
    case "passkeys": S.sheet = { type: "passkeys" }; return renderSheet();
    case "friendinfo": S.sheet = { type: "friendinfo", id: id || S.chat }; return renderSheet();
    case "close":
      if (S.sheet?.type === "askpw") S.sheet.resolve(null);
      S.sheet = null; return renderSheet();
    case "closepop": return closePop();
    case "submit": return $("#" + id, $layer)?.requestSubmit();
    case "map": S.sheet = { type: "map", id }; return renderSheet();
    case "mapzoom": {
      const cv = $(".map", $layer); if (!cv || !cv._m) return;
      if (id === "fit") { S.sheet.view = null; return redrawMap(); }
      return moveMap(cv, id === "in" ? 2 : 0.5, cv.clientWidth / 2, mapFrame(cv, cv._m, cv._cardH).sy0);
    }
    case "view": S.sheet = { type: "view", id }; return renderSheet();
    case "safety": {
      const f = friend(id); if (!f) return;
      S.sheet = { type: "safety", id, from: t.dataset.from || (S.sheet?.type === "friendinfo" ? "friendinfo" : null), digits: await E2E.safety(S.me.id, S.me.pub, f.id, f.pub) };
      return renderSheet();
    }
    case "chatmenu": {
      const f = friend(S.chat); if (!f) return;
      const flying = (S.msgs.get(f.id) || []).slice().reverse().find((m) => m.flying && m.route);
      return openMenu(t, [
        ...(flying ? [{ label: "Watch the Pigeon", icon: I.map, act: "map", id: flying.id }] : []),
        { label: "Contact Info", icon: I.info, act: "friendinfo", id: f.id },
        { label: "Safety Number", icon: I.shield, act: "safety", id: f.id },
        { label: "Remove Friend", icon: I.minusp, act: "unfriendask", id: f.id, destructive: true },
      ]);
    }
    case "attachmenu":
      return openMenu(t, [{ label: "Camera", icon: I.camera, act: "pick", id: "file-cam" }, { label: "Photo Library", icon: I.photo, act: "pick", id: "file-lib" }]);
    case "avmenu":
      return openMenu(t, [{ label: "Choose Photo", icon: I.photo, act: "pick", id: "av-lib" }, { label: "Take Photo", icon: I.camera, act: "pick", id: "av-cam" },
        ...(S.me.avatarAt ? [{ label: "Remove Photo", icon: I.trash, act: "avdel", destructive: true }] : [])]);
    case "pick": return $("#" + id)?.click();
    case "trust": return trustNewKey(id);
    case "accept": case "decline":
      await api("friends-respond", { method: "POST", body: { id, accept: t.dataset.act === "accept" } }).catch((err) => toast(esc(err.message)));
      await sync(); return renderSheet();
    case "cancelreq":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      await sync(); return renderSheet();
    case "unfriendask": {
      const f = friend(id); if (!f) return;
      return openActions({ title: `Remove ${f.name}?`, message: "You’ll stop seeing each other’s messages. You can add them again later.", actions: [{ label: "Remove Friend", act: "unfriend", id, destructive: true }] });
    }
    case "unfriend":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      S.sheet = null; await sync(); return go("messages");
    case "share": return shareHandle();
    case "unattach": return clearAttach();
    case "toast": { $toast.innerHTML = ""; const fn = S.toastFn; S.toastFn = null; return fn && fn(); }
    case "peek": { const inp = t.parentElement.querySelector("input"); const show = inp.type === "password"; inp.type = show ? "text" : "password"; t.setAttribute("aria-label", show ? "Hide password" : "Show password"); return; }
    case "locate": return locate(t);
    case "locdone": return go(passkeysSupported() ? "pkoffer" : "messages");
    case "pkadd":
      try {
        const unlocks = await busyBtn(t, "Waiting for your passkey…", addPasskey);
        await sync();
        if (t.dataset.next) go(t.dataset.next); else renderSheet();
        toast(unlocks ? "Passkey saved. It can sign you in and unlock your messages." : "Passkey saved. On a new phone you’ll also need your password once.");
      } catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(passkeyError(err)); }
      return;
    case "pkget":
      try { await busyBtn(t, "Waiting for your passkey…", signInPasskey); if (S.priv) afterSignIn(); }
      catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(passkeyError(err)); }
      return;
    case "pkdel":
      await api("passkey", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      toast("Passkey removed. You can also delete it from your phone’s Passwords app.");
      await sync(); return renderSheet();
    case "cancelunlock": S.pendingUnlock = null; return go("welcome");
    case "signout": return openActions({ message: "You’ll need your password or a passkey to sign in again.", actions: [{ label: "Sign Out", act: "signoutgo", destructive: true }] });
    case "appearancesheet": S.sheet = { type: "appearance" }; return renderSheet();
    case "theme": setTheme(id); render(); return renderSheet();
    case "notifysheet": S.sheet = { type: "notifications" }; return renderSheet();
    case "npref": return setNotify({ [id]: !S.me.notify?.[id] });
    case "pushtoggle": return S.pushOn ? pushDisable() : pushEnable();
    case "pushtest":
      try { const r = await api("push-test", { method: "POST" }); toast(r.sent ? "Test sent. It should arrive in a moment." : "Couldn’t reach this phone. Turn notifications off and on again."); }
      catch (err) { toast(esc(err.message)); }
      return;
    case "emailtoggle": return setEmailNotify(!S.me.notifyEmail);
    case "signoutgo":
      await pushDisable(true);
      api("logout", { method: "POST" }).catch(() => {});
      await forget(); return go("welcome");
    case "delask": return openActions({ title: "Delete your account?", message: "This deletes your account, friends, and every message and photo you’ve sent or received. It can’t be undone.", actions: [{ label: "Delete Account", act: "delgo", destructive: true }] });
    case "delgo":
      try { await api("me", { method: "DELETE" }); await forget(); go("welcome"); toast("Your account was deleted."); }
      catch (err) { toast(esc(err.message)); }
      return;
    case "changepw": S.sheet = { type: "changepw" }; return renderSheet();
    case "profile": S.sheet = { type: "profile" }; return renderSheet();
    case "avdel":
      try { S.me = (await api("avatar", { method: "DELETE" })).me; renderSheet(true); render(); }
      catch (err) { showErr(err.message); }
      return;
    case "resetkeep": case "resetfresh":
      try { await resetWith(t.dataset.act === "resetkeep" ? "keep" : "fresh", t); }
      catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(err.message, err.field); }
      return;
  }
}
const passkeyError = (err) => err.name === "InvalidStateError" ? "This phone already has a passkey for your account." : err.name === "SecurityError" ? "Passkeys only work on georgefarrowgreen.com." : err.message || "The passkey didn’t work. Try again.";

async function onChange(e) {
  const el = e.target;
  if ((el.id === "av-cam" || el.id === "av-lib") && el.files[0]) { const f = el.files[0]; el.value = ""; return setAvatar(f); }
  if ((el.id === "file-cam" || el.id === "file-lib") && el.files[0]) { const f = el.files[0]; el.value = ""; return setAttach(f); }
  if (el.dataset.act === "quiethour") return setNotify({ [el.dataset.id]: Number(el.value) });
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
      showErr(err.code === 1 ? "Location is off for this site. Choose a city instead, or allow location in your browser settings." : "Couldn’t find your location. Choose a city instead.");
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
  const btn = form.querySelector(".btn") || $(`[data-act=submit][data-id="${form.id}"]`, $layer);
  if (kind === "compose") return send();
  if (kind === "add") {
    const h = form.h.value.trim(); if (!h) return;
    const msg = $(".add-msg", $layer);
    try {
      const r = await busyBtn(btn, "Sending…", () => api("friends", { method: "POST", body: { handle: h } }));
      S.pendingAdd = null;
      if (/^Request sent|joined/.test(r.message)) { S.sheet = null; renderSheet(); toast(esc(r.message)); }
      else { msg.textContent = r.message; msg.classList.add("bad"); }
    } catch (err) { msg.textContent = err.message; msg.classList.add("bad"); }
    await sync(); return;
  }
  const v = Object.fromEntries(new FormData(form));
  if (kind === "signup") {
    v.handle = String(v.handle || "").trim().replace(/^@/, "").toLowerCase();
    v.email = String(v.email || "").trim();
    if (!String(v.name || "").trim()) return showErr("Enter your name.", "name");
    if (!/^[a-z0-9_]{3,20}$/.test(v.handle)) return showErr("Handles use 3 to 20 letters, numbers or underscores.", "handle");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) return showErr("That doesn’t look like an email address.", "email");
    if (String(v.password || "").length < 10) return showErr("Use at least 10 characters for your password.", "password");
    const keep = { ...v };
    S.making = 0; go("making");
    try { await createAccount(keep); await new Promise((r) => setTimeout(r, 400)); go("locpick"); }
    catch (err) {
      go("signup");
      for (const k of ["name", "handle", "email", "password"]) { const i = $(`#f-${k}`); if (i) i.value = keep[k] || ""; }
      showErr(err.message, err.field);
    }
  } else if (kind === "signin") {
    if (!v.email || !v.password) return showErr("Enter your email and password.");
    try { await busyBtn(btn, "Signing In…", () => signInPassword(String(v.email).trim(), v.password)); afterSignIn(); }
    catch (err) { showErr(err.message); }
  } else if (kind === "unlock") {
    try { await busyBtn(btn, "Unlocking…", () => unlockWithPassword(v.password || "")); afterSignIn(); }
    catch (err) { showErr(err.message, err.field); }
  } else if (kind === "forgot") {
    const email = String(v.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showErr("That doesn’t look like an email address.", "email");
    try {
      const r = await busyBtn(btn, "Sending…", () => api("reset-request", { method: "POST", body: { email } }));
      form.innerHTML = `<div class="group mt-s">${cell({ icon: I.check, tile: "green", label: "Check your email", sub: esc(r.message) })}</div>`;
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "reset") {
    const keep = $("[data-act=resetkeep]");
    try { await resetWith(keep ? "keep" : "fresh", keep || $("[data-act=resetfresh]")); }
    catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(err.message, err.field); }
  } else if (kind === "profile") {
    const name = String(v.name || "").trim(), handle = String(v.handle ?? S.me.handle).trim().replace(/^@/, "").toLowerCase();
    if (!name) return showErr("Your name can’t be empty.", "name");
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) return showErr("Handles use 3 to 20 letters, numbers or underscores.", "handle");
    const changes = {};
    if (name !== S.me.name) changes.name = name;
    if (handle !== S.me.handle) changes.handle = handle;
    if (!Object.keys(changes).length) { S.sheet = null; return renderSheet(); }
    try {
      S.me = (await busyBtn(btn, "Saving…", () => api("me", { method: "PATCH", body: changes }))).me;
      S.sheet = null; renderSheet(); render();
      toast(changes.handle ? `Saved. Friends now find you as @${esc(S.me.handle)}.` : "Profile saved.");
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "changepw") {
    if (!v.current) return showErr("Enter your current password.", "current");
    if (String(v.password || "").length < 10) return showErr("Use at least 10 characters for your new password.", "password");
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
  refreshPush();
  if (S.me.lat == null) return go("locpick");
  if (S.pendingAdd) { go("friends"); S.sheet = { type: "addfriend" }; return renderSheet(); }
  go("messages");
}
// Profile pictures: centre-cropped square, 512px JPEG (which also drops location metadata).
async function setAvatar(file) {
  try {
    const bmp = await loadBitmap(file);
    const side = Math.min(bmp.width, bmp.height), size = Math.min(512, side);
    const c = document.createElement("canvas"); c.width = c.height = size;
    c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
    const jpg = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!jpg) throw new Error("That picture couldn’t be read. Try another one.");
    const r = await api("avatar", { method: "POST", blob: jpg });
    S.me = r.me;
    S.avatars.set(`${S.me.id}:${S.me.avatarAt}`, URL.createObjectURL(jpg));
    renderSheet(true); render();
    toast("Profile picture updated.");
  } catch (err) { showErr(err.message || "That picture couldn’t be read. Try another one."); }
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
    offerNotify();
  } catch (err) { S.err = err.message; }
  S.busy = false; renderCompose();
}
$(".page").addEventListener("keydown", (e) => {
  if (e.target.id === "msg" && e.key === "Enter" && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); send(); }
});

/* ============================================================
   Appearance (theme.js applies it before the page draws)
   ============================================================ */
const THEMES = ["light", "dark", "auto"];
const THEME_NAMES = { light: "Light", dark: "Dark", auto: "Automatic" };
function theme() { try { const t = localStorage.getItem("inflight-theme"); return THEMES.includes(t) ? t : "light"; } catch (_) { return "light"; } }
// Saved to the account (so every phone you sign in on matches) and kept on
// this phone too, so theme.js can draw the right colours before the app loads.
function setTheme(t) {
  if (!THEMES.includes(t)) return;
  keepTheme(t);
  if (S.me) {
    S.me.appearance = t;
    api("me", { method: "PATCH", body: { appearance: t } }).catch(() => toast("Couldn’t save that to your account. It’s set on this phone for now."));
  }
}
function keepTheme(t) {
  try { localStorage.setItem("inflight-theme", t); } catch (_) { /* this visit only */ }
  applyTheme(t);
}
// After each sync: the account's choice wins; an account that has never
// chosen takes this phone's.
function syncTheme() {
  if (!S.me) return;
  const mine = S.me.appearance;
  if (THEMES.includes(mine)) { if (mine !== theme()) { keepTheme(mine); if (S.view === "account" || S.sheet?.type === "appearance") { render(); renderSheet(); } } }
  else if (!S.themeSent) { S.themeSent = true; api("me", { method: "PATCH", body: { appearance: theme() } }).then((r) => { S.me = r.me; }).catch(() => {}); }
}
function applyTheme(t = theme()) {
  document.documentElement.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1c1c1f" : "#f2f2f7");
}
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

/* ============================================================
   Notifications
   ============================================================ */
// Push needs a service worker, and on iPhone only works once InFlight is on the Home Screen.
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => !!(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone);
function pushState() {
  if (!pushSupported()) return isIOS() && !standalone() ? "homescreen" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return S.pushOn ? "on" : "off";
}
const sameKey = (sub, key) => { const k = sub.options?.applicationServerKey; return !!k && b64url(new Uint8Array(k)) === key; };
async function pushSub(ask) {
  const reg = await navigator.serviceWorker.register("/pigeon/sw.js", { scope: "/pigeon/" });
  await navigator.serviceWorker.ready;
  const { key } = await api("push-key");
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe(); sub = null; }
  if (!sub && !ask) return null;
  sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(key) });
  await api("push-sub", { method: "POST", body: sub.toJSON() });
  return sub;
}
async function pushEnable() {
  if (pushState() !== "off") return;
  S.pushBusy = true; render();
  try {
    const perm = await Notification.requestPermission();    // first, while the tap still counts
    if (perm !== "granted") { if (perm === "denied") toast("Notifications are blocked. Turn them on for InFlight in your phone’s Settings."); return; }
    S.pushOn = !!(await pushSub(true));
    if (S.pushOn) toast("Notifications are on. You’ll hear when a pigeon lands.");
  } catch (err) { console.warn("push", err); toast("Couldn’t turn on notifications on this phone."); }
  finally { S.pushBusy = false; render(); if (S.sheet?.type === "notifications") renderSheet(); }
}
async function pushDisable(quiet) {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/pigeon/");
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await api("push-sub", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  } catch (_) { /* nothing to undo */ }
  S.pushOn = false;
  if (!quiet) { toast("Notifications are off on this phone."); render(); if (S.sheet?.type === "notifications") renderSheet(); }
}
// On launch: if this phone already has push on, make sure the server knows it (and for this sign-in).
async function refreshPush() {
  // quiet hours follow the phone's time zone
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && S.me?.notify && S.me.notify.tz !== tz) api("me", { method: "PATCH", body: { notify: { tz } } }).then((r) => { S.me = r.me; }).catch(() => {});
  if (!pushSupported() || Notification.permission !== "granted") { S.pushOn = false; return; }
  try { S.pushOn = !!(await pushSub(false)); } catch (_) { S.pushOn = false; }
  if (S.view === "account") render();
  if (S.sheet?.type === "notifications") renderSheet();
}
async function setEmailNotify(on) {
  try { const r = await api("me", { method: "PATCH", body: { notifyEmail: on } }); S.me = r.me; render(); if (S.sheet?.type === "notifications") renderSheet(); toast(on ? `We’ll email ${esc(S.me.email)} when a pigeon has been waiting a while.` : "Emails are off."); }
  catch (err) { toast(esc(err.message)); }
}
// After someone's first pigeon: offer to tell them when the reply lands. Asked once per phone.
async function offerNotify() {
  if (S.pushOn || S.me?.notifyEmail || S.notifyAsked) return;
  S.notifyAsked = true;
  if (await idb.get("notify-asked")) return;
  await idb.set("notify-asked", true);
  const ps = pushState();
  if (ps === "off") toast("Want to hear when the reply lands?", "Notify Me", () => pushEnable());
  else if (S.emailOn) toast("Want an email when the reply lands?", "Email Me", () => setEmailNotify(true));
  else if (ps === "homescreen") toast("Add InFlight to your Home Screen to get notified when the reply lands.", "How", () => go("account"));
}
// Links from notifications: #open=<friend> opens that chat, #requests the friend requests.
function openLink(hash) {
  const o = /#open=([0-9a-f-]{36})/.exec(hash || ""), rq = /#requests/.test(hash || "");
  if (!o && !rq) return false;
  if (location.hash) history.replaceState(null, "", location.pathname);
  if (!S.me) { S.pendingLink = hash; return true; }
  closePop(); S.sheet = null; renderSheet();
  if (o && friend(o[1])) go("chat", o[1]);
  else { go("friends"); if (S.incoming.length) { S.sheet = { type: "requests" }; renderSheet(); } }
  return true;
}

/* ============================================================
   Start
   ============================================================ */
async function start() {
  mount();
  if (/#(open=|requests)/.test(location.hash)) { S.pendingLink = location.hash; history.replaceState(null, "", location.pathname); }
  navigator.serviceWorker?.addEventListener?.("message", (e) => { if (e.data?.inflight === "open") openLink(e.data.hash); });
  const m = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
  if (m) { S.pendingAdd = m[1].toLowerCase(); history.replaceState(null, "", location.pathname); }
  // a reset link: take the token out of the address bar straight away
  const rs = /#reset=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (rs) { S.resetToken = rs[1]; history.replaceState(null, "", location.pathname); }
  if (!window.crypto?.subtle || !window.indexedDB) { S.view = "welcome"; render(); return toast("This browser can’t run InFlight’s encryption. Try Safari or Chrome."); }
  const saved = await idb.get("session");
  if (S.resetToken) {
    // a reset replaces whoever is signed in on this phone
    if (saved?.token) await idb.del("session");
    go("reset");
  } else if (saved?.token && saved.priv) {
    S.token = saved.token; S.me = saved.me; S.priv = saved.priv;
    S.fp = await E2E.fingerprint(saved.me.pub);
    S.pins = (await idb.get("pins:" + saved.me.id)) || {};
    S.view = S.pendingAdd ? "friends" : "messages";
    render();
    await sync();
    if (S.me && S.me.lat == null) go("locpick");
    else if (S.pendingAdd) { S.sheet = { type: "addfriend" }; renderSheet(); }
    else if (S.pendingLink) { const h = S.pendingLink; S.pendingLink = null; openLink(h); }
    refreshPush();
  } else go("welcome");
  // a reset or add-a-friend link opened while InFlight is already open in this tab
  window.addEventListener("hashchange", async () => {
    if (openLink(location.hash)) return;
    const r = /#reset=([A-Za-z0-9_-]{40,50})/.exec(location.hash), a = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
    if (!r && !a) return;
    history.replaceState(null, "", location.pathname);
    if (r) {
      if (S.token) { api("logout", { method: "POST" }).catch(() => {}); await forget(); }
      S.resetToken = r[1]; S.view = "loading"; go("reset");
    } else { S.pendingAdd = a[1].toLowerCase(); if (S.me) { go("friends"); S.sheet = { type: "addfriend" }; renderSheet(); } }
  });
  setInterval(() => { if (!AUTH_VIEWS.has(S.view) && $view) live(); flightCheck(); }, 1000);
  setInterval(() => { if (document.visibilityState === "visible") sync(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(); checkUpdate(); } });
  setInterval(checkUpdate, UPDATE_MS);
}

/* ---------------- updates ----------------
   The page carries a fingerprint of the app. When a newer one is live, an open
   copy reloads itself, unless you're in the middle of something, when it asks. */
const VERSION = document.querySelector('meta[name="inflight-version"]')?.content || "";
const UPDATE_MS = 5 * 60 * 1000;
async function checkUpdate() {
  if (!VERSION || document.visibilityState !== "visible") return;
  let live = "";
  try { live = /name="inflight-version" content="([\w-]+)"/.exec(await (await fetch("/pigeon/", { cache: "no-store" })).text())?.[1] || ""; } catch { return; }
  if (!live || live === VERSION) return;
  const busy = S.sheet || S.attach || ($ta && $ta.value.trim()) || (AUTH_VIEWS.has(S.view) && S.view !== "welcome") || $(".asheet, .menu-pop");
  if (!busy) return location.reload();
  toast("A new version of InFlight is ready.", "Update", () => location.reload());
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
