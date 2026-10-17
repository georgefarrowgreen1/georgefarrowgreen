// InFlight — the phone app. Everything readable is encrypted and decrypted
// here; the server (functions/api/pigeon) only ever sees ciphertext.
import { E2E, te, rand, b64, b64url, fromB64url, uuid } from "./crypto.js";
import { LAND } from "./land.js";
import { PLACES, nearestPlace, snapToMile } from "./places.js";
import { COUNTRIES, RANGES } from "./countries.js";
import { placeAt } from "./placegrid.js";
import { qrSvg } from "./qr.js";
import { ABOUT, BODIES, EARTH_R, MOON_R, lunarKm, surfaceKm, moonKm, marsKm, lightMs, moonPhase, earthPhase, nearFar, spaceKinds, spaceFlight, spaceMoments, spaceNow, legOf, drawPick, sideLon, pickAt, drawTrip, farSide, siteName, lunarDay, marsClock, bodyOf } from "./moon.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SPEED_KMH = 80, SWIFT_MAX = 9, TURBO_MAX = 3, ROCKET_MAX = 1;
// Pigeon kinds: [id, name, speed, loft size]. Standard is free on your turn;
// swift, turbo and rocket fly any time and come from lofts that refill through the day.
const APP_VERSION = "1.2.1";            // shown in Account (and What's New, once, after an update)
const KINDS = [["standard", "Standard", 1, 0], ["swift", "Swift", 2, SWIFT_MAX], ["turbo", "Turbo", 3, TURBO_MAX], ["rocket", "Rocket", 9, ROCKET_MAX]];
const KIND = Object.fromEntries(KINDS.map(([id, name, speed, max]) => [id, { name, speed, max }]));
// Rare pigeons: a look for your pigeons, unlocked by an achievement (the colour still says the kind)
const SKINS = {
  golden: { name: "Golden", badge: "Fleet", ring: "#f5c542" },
  midnight: { name: "Midnight", badge: "Long Haul", ring: "#8fa2ff" },
  storm: { name: "Storm", badge: "Tailwind Rider", ring: "#8ea3b8" },
  ember: { name: "Ember", badge: "Daredevil", ring: "#ff8a00" },
  comet: { name: "Comet", badge: "Rocket Mail", ring: "#7ad7ff" },
  rainbow: { name: "Rainbow", badge: "Around the World", ring: "#c86bff" },
  // seasonal: anyone's while the season lasts; ten pigeons in it and it's yours to keep
  spring: { name: "Blossom", badge: "Spring Migration", ring: "#ff8fb4", season: true },
  summer: { name: "Sunny", badge: "Summer Flyer", ring: "#ffc233", season: true },
  autumn: { name: "Russet", badge: "Autumn Leaves", ring: "#c8622a", season: true },
  winter: { name: "Frosty", badge: "Winter Wings", ring: "#9fd8ff", season: true },
};
// the seasons, as the server has them: [id, look, emoji, words, from [m, d], to [m, d]] (UTC days)
const SEASONS = [["spring", "Blossom", "🌸", "Spring migration", [3, 20], [4, 30]], ["summer", "Sunny", "☀️", "Summer", [6, 21], [8, 31]],
  ["autumn", "Russet", "🍂", "Autumn", [10, 1], [11, 15]], ["winter", "Frosty", "❄️", "Winter", [12, 1], [1, 6]]];
function seasonNow(t = now()) {
  const y = new Date(t).getUTCFullYear();
  for (const s of SEASONS) for (const sy of [y - 1, y]) {
    const from = Date.UTC(sy, s[4][0] - 1, s[4][1]), to = Date.UTC(s[5][0] < s[4][0] ? sy + 1 : sy, s[5][0] - 1, s[5][1]) + DAY;
    if (t >= from && t < to) return { id: s[0], look: s[1], emoji: s[2], words: s[3], from, to, key: `${s[0]}-${sy}` };
  }
  return null;
}
KIND.dumb = { name: "Dumb", speed: 1 / 3, max: 0 };
// a mystery pigeon: one a day, from no loft and on no one's turn; its kind is drawn as it takes off
KIND.mystery = { name: "Mystery", speed: 1, max: 1 };        // a secret: start a message with /dumb
// lunar pigeons (pigeon/moon.js): the only ones to, from or across the Moon, from lofts of their own
KIND.lunar = { name: "Lunar", speed: 1, max: 3 }; KIND.lunarx = { name: "Lunar Express", speed: 1, max: 1 };
// and the rest of the space pigeons (pigeon/space.js): laser to or from Mars, orbital round the Earth
KIND.laser = { name: "Laser", speed: 1, max: 5 }; KIND.orbital = { name: "Orbital", speed: 1, max: 2 };
const SPACE_KINDS = ["lunar", "lunarx", "laser", "orbital"];
// someone off the Earth (the Moon, or Mars): where (their end of a flight), and whether a chat with them is a space one
const endFor = (p) => (p?.moon ? { b: p.moon.b === "mars" ? "mars" : "moon", lat: p.moon.lat, lon: p.moon.lon, place: p.place } : p?.lat != null ? { b: "earth", lat: p.lat, lon: p.lon, place: p.place } : null);
const moonChat = (f) => !!f && !!(S.me?.moon || f.moon);
const kindsFor = (f) => spaceKinds(endFor(S.me), endFor(f)) || [];
const worldOf = (p) => (p?.moon ? (p.moon.b === "mars" ? "mars" : "moon") : p?.offEarth || "earth");
// how long a space pigeon takes now (Pigeon Death only hurries a lunar one: light and orbits don't)
// (an Earth end to the half degree, as the server keeps it: an orbit's pass can turn on a few miles)
const asSent = (e) => (e?.b === "earth" ? { ...e, lat: Math.round(e.lat * 2) / 2, lon: Math.round(e.lon * 2) / 2 } : e);
const spaceMs = (k, a, b) => spaceFlight(k, asSent(a), asSent(b), now(), S.me?.risky && k.startsWith("lunar") ? RISKY_SPEED : 1).ms;
// a name for a spot on Earth, for an orbit's path ("the North Atlantic", "France")
const whereOnEarth = (la, lo) => { const p = placeAt(la, lo); return p && p !== "land" ? p : null; };
const DUMB = /^\/dumb(?:\s+|$)/i;
// Pigeon Death (Account → Pigeons): 1.25× faster, but 1 in 100 is lost on the way
const RISKY_SPEED = 1.25;
const LIVE_LEFT = HOUR;                // pigeons with longer than this to go have the sky ahead looked at again (functions/_live.js)
const mySpeed = (kind) => KIND[kind].speed * (S.me?.risky ? RISKY_SPEED : 1);
const dumbText = () => DUMB.test($ta.value) ? $ta.value.replace(DUMB, "") : null;
const kindOf = (m) => (m && Object.hasOwn(KIND, m.pigeon) ? m.pigeon : m?.swift ? "swift" : "standard");
const POLL_MS = 15000;
const AUTH_VIEWS = new Set(["welcome", "signup", "making", "signin", "unlock", "locpick", "pkoffer", "forgot", "reset"]);
// before you're in: all under the welcome's night sky, which carries on from one to the next
const NIGHT_VIEWS = new Set(["welcome", "signup", "making", "signin", "unlock", "forgot", "reset"]);

/* ---------------- state ---------------- */
const S = {
  token: null, me: null, priv: null, secretJwk: null, fp: "",
  friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [], skew: 0,
  view: "loading", chat: null, sheet: null, flash: "", err: "",
  msgs: new Map(), turns: new Map(), plain: new Map(), notes: new Map(), photos: new Map(), photoGone: new Set(),
  pairs: new Map(), pins: {}, attach: null, busy: false, stick: true, making: 0,
  chatRaw: new Map(), outbox: [], viewedOnce: new Set(), pctx: new Map(), pendingUnlock: null, pendingAdd: null, offline: false, seenLanded: new Set(), fresh: new Map(), nav: null,
  resetToken: null, resetInfo: null, avatars: new Map(), q: "", fq: "", addMsg: null,
  reacts: new Map(), fly: new Map(), wxPlan: new Map(), gevents: new Map(), drafts: new Map(), replyTo: null,
  birds: [], hall: [], birdPick: null,       // your named pigeons, your Hall of Fame, and the one picked to carry the next message ("none": unnamed)
};
const now = () => Date.now() + S.skew;
const $ = (sel, root = document) => root.querySelector(sel);
// passkeys belong to georgefarrowgreen.com, at either of InFlight's addresses (as the server has it: rpIdFor)
const RP_ID = /(^|\.)georgefarrowgreen\.com$/.test(location.hostname) ? "georgefarrowgreen.com" : location.hostname;
// where InFlight is, as you'd type it: "georgefarrowgreen.com/pigeon" or "chat.georgefarrowgreen.com"
// InFlight lives at chat.georgefarrowgreen.com now. At its old address (georgefarrowgreen.com/pigeon)
// this is where it went; null at the new address. (Locally, tests turn the old address on.)
const NEW_HOME = (() => {
  if (/^chat\./.test(location.host)) return null;
  let test = false; try { test = location.hostname === "localhost" && !!localStorage.getItem("inflight-test-moved"); } catch (_) {}
  return location.hostname === "georgefarrowgreen.com" || test ? `${location.protocol}//chat.${location.host}` : null;
})();
const HERE = () => `${location.host}${location.pathname.replace(/\/(index\.html)?$/, "").replace(/\/+$/, "")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- this phone's storage (IndexedDB) ----------------
   Holds the session token and the private key as a non-extractable CryptoKey:
   usable by this app, but not readable even by its own code. */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      // (iOS can leave an open hanging after a resume: give up after a few seconds rather than never start)
      const late = setTimeout(() => rej(new Error("This phone’s storage didn’t answer.")), 6000);
      const r = indexedDB.open("inflight", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => {
        clearTimeout(late); const db = r.result;
        db.onclose = db.onversionchange = () => { if (this.db === db) this.db = null; };   // dropped in the background: open it again next time
        res((this.db = db));
      };
      r.onerror = () => { clearTimeout(late); rej(r.error); };
    });
  },
  async run(mode, fn, again = true) {
    const db = await this.open();
    try {
      return await new Promise((res, rej) => {
        const tx = db.transaction("kv", mode), req = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error("Storage write was cancelled."));       // a full phone aborts, it doesn't error
      });
    } catch (e) {
      if (again && e?.name === "InvalidStateError") { this.db = null; return this.run(mode, fn, false); }   // the connection was lost: once more, fresh
      throw e;
    }
  },
  get(k) { return this.run("readonly", (s) => s.get(k)).catch(() => null); },
  set(k, v) { return this.run("readwrite", (s) => s.put(v, k)).catch(() => null); },
  del(k) { return this.run("readwrite", (s) => s.delete(k)).catch(() => null); },
};

/* ---------------- server ---------------- */
// fetch can't report upload progress; XMLHttpRequest can, so photo uploads use it
function xhrFetch(url, { method, headers, body, size, onProgress }) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => resolve(new Response(x.responseText, { status: x.status, headers: { "Content-Type": x.getResponseHeader("Content-Type") || "application/json" } }));
    x.onerror = x.onabort = x.ontimeout = () => reject(new TypeError("Network error"));
    x.timeout = 120000 + (size ?? body?.size ?? 0) / 20;          // a stalled upload gives up (a big one gets longer: ~20 KB/s at worst)
    x.send(body);
  });
}
async function api(path, { method = "GET", body, form, raw, blob, size, onProgress } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if (form) payload = form;
  else if (blob) { headers["Content-Type"] = blob.type; payload = blob; }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let r;
  // nothing waits forever on a weak signal: a reply that hasn't come in 25 s (a minute for anything carrying a file) is treated as no signal
  const quit = !onProgress && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(payload instanceof Blob || payload instanceof FormData ? 90000 : 25000) : undefined;
  try { r = onProgress ? await xhrFetch("/api/pigeon/" + path, { method, headers, body: payload, size, onProgress }) : await fetch("/api/pigeon/" + path, { method, headers, body: payload, signal: quit }); }
  catch (_) { S.offline = true; renderOffline(); throw Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true }); }
  if (S.offline) { S.offline = false; renderOffline(); }
  if (raw && r.ok) return r;
  // a page that isn't ours (a café's sign-in screen, a proxy) answering in our place isn't success
  if (r.ok && !/json/.test(r.headers.get("Content-Type") || "")) { S.offline = true; renderOffline(); throw Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true }); }
  let data = {};
  try { data = await r.json(); } catch (_) {}
  // only a sign-in that has ended signs you out (not a wrong password on a "confirm it's you")
  if (r.status === 401 && S.token && data.field === "session") { await forget(); go("welcome"); }
  // a reply with no message of ours came from somewhere in between: say which, so it can be traced
  if (!r.ok) throw Object.assign(new Error(data.error || `Something went wrong (error ${r.status}). Try again.`), { status: r.status, field: data.field });
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
// When a scheduled pigeon lands: "today at 18:00", "tomorrow at 08:00", "Sat 18 Oct at 09:30"
const fmtLand = (ts) => { const d = new Date(ts); return sameDay(ts, now()) ? `today at ${fmtTime(ts)}` : sameDay(ts, now() + DAY) ? `tomorrow at ${fmtTime(ts)}` : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} at ${fmtTime(ts)}`; };
const fmtDate = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fmtMiles = (km) => Math.round(km * 0.621371).toLocaleString("en-GB") + " mi";
const fmtMph = (kmh) => Math.round(kmh * 0.621371).toLocaleString("en-GB") + " mph";
// The wind a pigeon had at take-off: what blew its way (km/h; negative is a headwind).
const windWord = (w) => (w == null ? "" : Math.abs(w) < 3 ? "calm" : w > 0 ? "tailwind" : "headwind");
const fmtWind = (w) => (w == null ? "" : Math.abs(w) < 3 ? "Calm skies" : `${w > 0 ? "Tailwind" : "Headwind"} ${Math.round(Math.abs(w) * 0.621371)} mph`);
const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");
const initials = (n) => String(n).trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const first = (n) => String(n).trim().split(/\s+/)[0];
const hue = (s) => ([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) % 5 + 1;
// A person's picture if they have one (fetched with this phone's sign-in, then kept as a blob URL), else their initials.
// dot: show a green dot when they're online now
function avatar(person, size = "", dot = false, one = false) {
  const name = person?.name || person?.handle || "?";
  const url = person?.avatarAt ? avatarUrl(person) : "";
  return `<span class="av ${size}" data-c="${hue(name)}" aria-hidden="true">${url ? `<img src="${url}" alt="">` : esc(one ? initials(name).slice(0, 1) : initials(name))}${dot ? onlineDot(person) : ""}</span>`;
}
// The dot pops in when someone comes online while you watch, not every time
// the list redraws (nor at all while the app is still opening).
const onlineSince = new Map();
function onlineDot(person) {
  const id = person?.id;
  if (!isOnline(person)) { onlineSince.delete(id); return ""; }
  let at = onlineSince.get(id); if (at == null) onlineSince.set(id, (at = S.synced ? Date.now() : 0));
  return `<i class="online${Date.now() - at < 150 ? " new" : ""}"></i>`;
}
// A group's picture: two of its other members, overlapping.
function gavatar(g, size = "") {
  const two = others(g).slice(0, 2);
  if (two.length < 2) return avatar(two[0] || { name: g.name }, size);
  // one initial each, so neither is cut off; colours as everywhere else
  return `<span class="gav ${size}" aria-hidden="true">${avatar(two[0], "", false, true)}${avatar(two[1], "", false, true)}</span>`;
}
// An open app checks in every 15 s and the server notes it once a minute, so
// anyone seen in the last 2½ minutes has InFlight open now.
const ONLINE_MS = 150e3;
const isOnline = (p) => !!p?.seenAt && now() - p.seenAt < ONLINE_MS;
// 5m ago, then Today 21:38, Yesterday 21:38, Mon 21:38, 3 Oct 2026
function fmtSeen(at) {
  if (now() - at < HOUR) return `${Math.max(1, Math.floor((now() - at) / MIN))}m ago`;
  if (sameDay(at, now()) || sameDay(at, now() - DAY)) return `${dayLabel(at)} ${fmtTime(at)}`;
  return now() - at < 6 * DAY ? fmtShort(at) : fmtDate(at);
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
    .catch(() => { setTimeout(() => S.avatars.delete(key), 30e3); });    // (tried again in a while: it may have been the signal)
  return "";
}
function haversineKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, s = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}
const flightMs = (km, speed = 1) => Math.min(3 * DAY, Math.max(5 * MIN, (km / SPEED_KMH) * HOUR)) / speed;

/* ---------------- icons ---------------- */
const BIRD = document.getElementById("bird-path").getAttribute("d");
const ico = (d) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${d}</svg>`;
const I = {
  once: `<svg viewBox="0 0 24 24" class="ico oico" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 1 1-6.6 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="7.6" cy="4.6" r="1.2" fill="currentColor"/><circle cx="4.4" cy="8.2" r="1.2" fill="currentColor"/><path d="M9.6 8.2v7.6l6.2-3.8z" fill="currentColor"/></svg>`,
  leaf: ico(`<path d="M5 19c0-8 5-14 15-14 0 9-5 14-13 14"/><path d="M5 19 13 11"/>`),
  snowflake: ico(`<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5"/>`),
  blossom: ico(`<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C10 6 13.5 3.5 14.6 6.3c1 2.6-1.2 3.6-2.6 3.5ZM14.1 11.3c3.7-1.8 6 1.8 3.2 2.8-2.6.9-3.5-1.3-3.2-2.8ZM13.3 14c1.6 3.8-2.2 5.8-3 2.9-.7-2.7 1.6-3.4 3-2.9ZM10.6 13.9c-3.9 1.4-5.6-2.5-2.7-3.1 2.8-.6 3.4 1.7 2.7 3.1Z"/>`),
  coin: ico(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.6" stroke-width="1" stroke-dasharray="1.2 1.6"/><path transform="translate(5.8 6.3) scale(.52)" fill="currentColor" stroke="none" d="${BIRD}"/>`),     // a Coots Coin: a bird on its face
  feather: ico(`<path d="M20.2 3.8C14 3.6 8.4 7.4 6.6 13.6L5 19"/><path d="M20.2 3.8c.6 6-2.6 11.3-8.4 13.2L6.6 13.6"/><path d="M11 9.6l3.3 1.2M9.4 12.4l3.3 1.3"/><path d="M5 19l-1.4 1.4"/>`),
  flame: ico(`<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-2.6 1.4-4.6 3-6.3.3 1.7 1.2 2.9 2.4 3.4-.4-3.3 1-6.1 3.4-8.4.2 2.8 1.6 4.4 2.9 6 1 1.3 1.8 2.9 1.8 4.9 0 4-2.6 6.6-6.5 6.6Z"/><path d="M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.6 1.2-2.6 2.2-3.8.2 1 .8 1.6 1.5 1.8.1-.9.6-1.6 1.1-2.2.7 1 1 2.1 1 3.2 0 2.2-1.3 3.8-3 3.8Z"/>`),
  bird: `<svg viewBox="0 0 24 24" class="bird" aria-hidden="true"><path d="${BIRD}"/></svg>`,
  bubble: ico(`<path d="M12 4C7 4 3 7.2 3 11.2c0 2.2 1.2 4.1 3.1 5.4L5.5 20l3.9-2c.8.2 1.7.3 2.6.3 5 0 9-3.2 9-7.1S17 4 12 4Z"/>`),
  people: ico(`<circle cx="9" cy="8.5" r="3.3"/><path d="M3.2 19c.6-3.3 3-5.2 5.8-5.2s5.2 1.9 5.8 5.2"/><circle cx="16.8" cy="9.5" r="2.6"/><path d="M15.6 13.9c2.6-.4 4.7 1.2 5.2 4.2"/>`),
  person: ico(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.3c1.2-2.3 3.3-3.4 5.7-3.4s4.5 1.1 5.7 3.4"/>`),
  compose: ico(`<path d="M11 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M17.8 3.8a1.8 1.8 0 0 1 2.5 2.5L12.5 14 9.5 15l1-3Z"/>`),
  plus: ico(`<path d="M12 5v14M5 12h14"/>`),
  minus: ico(`<path d="M5 12h14"/>`),
  contrast: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/>`),
  moon: ico(`<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>`),
  sun: ico(`<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`),
  bell: ico(`<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>`),
  back: ico(`<path d="M15 4.5 7.5 12l7.5 7.5"/>`),
  wind: ico(`<path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h7"/>`),
  mic: ico(`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>`),
  play: `<svg viewBox="0 0 24 24" class="ico fillico" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" class="ico fillico" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>`,
  ship: ico(`<path d="M3.5 14.5h17l-2 5h-13z"/><path d="M6.5 14.5V10h11v4.5"/><path d="M10 10V6.5h4V10"/>`),
  volcano: ico(`<path d="M3 20.5h18l-5.5-9h-7z"/><path d="M8.5 11.5 10 9h4l1.5 2.5"/><path d="M12 6.5V3.5M9.2 6 8 3.8M14.8 6 16 3.8"/>`),
  fire: ico(`<path d="M12 21.5c-3.6 0-6.2-2.5-6.2-5.8 0-3.3 2.7-5.2 3.7-8.6.5 2 1.5 3.1 2.5 3.7.3-2.8 1.7-5 3.7-6.8-.2 3.5 2.5 5.8 2.5 9.7 0 3.3-2.6 5.8-6.2 5.8z"/>`),
  compass: ico(`<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.3 4.9-4.9 2.3 2.3-4.9z"/>`),
  storm: ico(`<path d="M7 15.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 15.5"/><path d="m13 12-2.5 4h3L11 20.5"/>`),
  rain: ico(`<path d="M7 14.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 14.5H7z"/><path d="m9 17.5-1 2.5M13 17.5l-1 2.5M17 17.5l-1 2.5"/>`),
  snow: ico(`<path d="M7 14.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 14.5H7z"/><path d="M9 18h.01M13 19.5h.01M17 18h.01M11 21h.01M15 21h.01"/>`),
  fog: ico(`<path d="M7 12.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 12.5"/><path d="M4 16h16M6 19.5h12"/>`),
  pass: ico(`<path d="M3.5 8.5h13l-3.5-3.5"/><path d="M20.5 15.5h-13l3.5 3.5"/>`),
  wave: ico(`<path d="M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5.5"/><path d="M11.5 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14.5 11V5.8a1.5 1.5 0 0 1 3 0V12"/><path d="M17.5 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.8a6.5 6.5 0 0 1-5.3-2.7l-3.1-4.4a1.5 1.5 0 0 1 2.4-1.8l1.8 2.2"/>`),
  heart: ico(`<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>`),
  reply: ico(`<path d="M10 8 5 12.5l5 4.5"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5v1"/>`),
  homing: ico(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
  chev: ico(`<path d="m9 5 7 7-7 7"/>`),
  more: `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="7.9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.1" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  search: ico(`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>`),
  loc: ico(`<path d="M20 4 4 10.8l6.9 2.3L13.2 20Z"/>`),
  waves: ico(`<path d="M3 9.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/><path d="M3 14.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/>`),
  globe: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.5 3.6 5.3 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.3-3.6-8.5s1.2-6 3.6-8.5Z"/>`),
  map: ico(`<path d="M3 6.5 8.5 4l7 3L21 4.5v13L15.5 20l-7-3L3 19.5Z"/><path d="M8.5 4v13M15.5 7v13"/>`),
  addp: ico(`<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3 1.4 0 2.6.3 3.7 1"/><path d="M18 14v6M15 17h6"/>`),
  minusp: ico(`<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3s5.7 1.9 6.5 5.3"/><path d="M16 12h6"/>`),
  share: ico(`<path d="M12 3.5v11M8 7l4-4 4 4"/><path d="M6 11H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 19 11h-1"/>`),
  photo: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/>`),
  camera: ico(`<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.5"/>`),
  trash: ico(`<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>`),
  up: ico(`<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>`),
  check: ico(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  ticks: ico(`<path d="m2.5 12.5 4 4 8-9"/><path d="m11 15.5 1 1 8-9"/>`),
  x: ico(`<path d="M6 6l12 12M18 6 6 18"/>`),
  pin: ico(`<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>`),
  gone: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 4l16 16"/>`),
  key: ico(`<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2"/>`),
  face: ico(`<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5c1.4 1.2 3.6 1.2 5 0"/>`),
  eye: ico(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`),
  lock: ico(`<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`),
  shield: ico(`<path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>`),
  info: ico(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>`),
  layers: ico(`<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>`),
  clock: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`),
  skull: ico(`<path d="M12 3.5c-4.3 0-7.5 3-7.5 7 0 2.3 1 4 2.6 5.1v2.7c0 .7.5 1.2 1.2 1.2h7.4c.7 0 1.2-.5 1.2-1.2v-2.7c1.6-1.1 2.6-2.8 2.6-5.1 0-4-3.2-7-7.5-7Z"/><circle cx="9.2" cy="11" r="1.7" fill="currentColor"/><circle cx="14.8" cy="11" r="1.7" fill="currentColor"/><path d="M10.6 20v-2.2M13.4 20v-2.2"/>`),
  dist: ico(`<circle cx="6" cy="17" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M7.8 15.6c2.5-1 3.2-3.4 5-5s3-2 3.6-2.2" stroke-dasharray="2 2.6"/>`),
  hourglass: ico(`<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 5-8 8.5s8 4 8 8.5"/>`),
  ok: ico(`<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.7L16 9.5"/>`),
  dot: ico(`<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>`),
  warn: ico(`<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17.2v.3"/>`),
  mail: ico(`<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>`),
  block: ico(`<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>`),
  phone: ico(`<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>`),
  laptop: ico(`<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 18.5h19"/>`),
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
    // unwrapping from a start past the date line can leave a whole continent a
    // turn west (Eurasia from Chukotka puts Europe near -360°): bring it back
    let west = Infinity; for (let i = 0; i < a.length; i += 2) if (a[i] < west) west = a[i];
    if (west < -180) { const turn = Math.ceil((-180 - west) / 360) * 360; for (let i = 0; i < a.length; i += 2) a[i] += turn; }
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
let mapInk = null;                          // a share card's map: its own light or dark, whatever the app's theme
const MAP_KMAX = 400;                       // pixels per degree at full zoom
// The route, as points along the great circle (longitudes unwrapped so it never jumps the date line).
// The route as points along great circles, each with the time the pigeon is
// there. A pigeon that changed course (its friend moved) flies several legs.
// What its planned way is doing about now: going around storms, riding the wind,
// resting on an island, through a pass, past a landmark (see functions/_route.js)
// resting on an island ("i"), or sheltering from storms ("h"), right now: [where, until when, which], or null
// (and waiting for a ship, "b"; or at sea on it, "sail": [the sea, when it's ashore, "sail", the port])
function restingOn(m, t = now()) {
  const legs = (m.legs || []).filter((l) => l[3] && l[3] !== "c" && l[3] !== "f");
  if (m.lost || t >= m.deliverAt) return null;
  const i = legs.findIndex((l, k) => (l[3] === "i" || l[3] === "h" || l[3] === "t" || l[3] === "b") && legs[k + 1]?.[3] === l[3] && legs[k + 1][0] === l[0] && legs[k + 1][1] === l[1] && t >= l[2] && t < legs[k + 1][2]);
  if (i >= 0) return [legs[i][4] || (legs[i][3] === "h" ? "" : legs[i][3] === "b" ? "the port" : "an island"), legs[i + 1][2], legs[i][3], SEVERE_WORD[legs[i][5]?.k] || "storms"];
  const sh = shipOf(legs);
  if (sh && t >= sh.off && t < sh.ashore) return [sh.sea, sh.ashore, "sail", sh.to];
  // (resting with a friend on the way: a stopover)
  return m.via && m.viaAt <= t && t < m.viaOff ? [m.viaPlace || "", m.viaOff, "v"] : null;
}
// How the map draws it: flying ("up", "cruise", "down"), at sea on a ship, resting (wings folded: an island, a
// shelter, a breather, the port, a stopover), landed or lost
function birdPhase(r) {
  if (r.lost) return "lost";
  const rest = restingOn(r)?.[2];
  return rest === "sail" ? "sail" : rest ? "rest" : flightAt(r).phase;
}
// When a pigeon isn't flying (resting on an island, sheltering, a breather, waiting for and sailing on a ship, a
// stopover with a friend): [from, to] spans. Its speed, and how far along it is, count only the flying.
function stillSpans(m) {
  const legs = m.legs || [], out = [];
  for (let k = 0; k + 1 < legs.length; k++) {
    const a = legs[k], b = legs[k + 1];
    if (a[0] === b[0] && a[1] === b[1] && b[2] > a[2] && a[3] === b[3] && ("ihtb".includes(a[3] || "-") || (!a[3] && m.via))) out.push([a[2], b[2]]);
  }
  const sh = shipOf(legs); if (sh) out.push([sh.off, sh.ashore]);
  return out.sort((x, y) => x[0] - y[0]).reduce((acc, x) => { const l = acc.at(-1); if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else acc.push([...x]); return acc; }, []);
}
// how long it has been still, up to t (all of it, without t)
const stillMs = (m, t = Infinity) => stillSpans(m).reduce((a, [x, y]) => a + Math.max(0, Math.min(y, t) - Math.max(x, m.sentAt)), 0);
// how far along it is by its flying (it doesn't creep on while it sits out a storm), 0 to 1
const flownFrac = (m, t = now()) => Math.min(1, Math.max(0, (t - m.sentAt - stillMs(m, t)) / Math.max(1, m.deliverAt - m.sentAt - stillMs(m))));
// its average speed in the air, km/h (a crossing by ship, or a night sheltering, isn't flying slowly)
const avgKmh = (m) => m.km / (Math.max(1, m.deliverAt - m.sentAt - stillMs(m)) / HOUR);
// How far a flight goes, flown and by ship: "8 mi · 3,560 mi by ship"
function milesOf(km, legs) {
  const sea = shipKm(legs);
  return sea > 50 ? `${fmtMiles(km)} · ${fmtMiles(sea)} by ship` : fmtMiles(km);
}
// how far it goes by ship (km), 0 if it doesn't
function shipKm(legs) {
  const b = (legs || []).filter((l) => l[3] === "b");
  let sea = 0; for (let i = 1; i < b.length - 1; i++) sea += haversineKm(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1]);
  return sea;
}
// A voyage by ship (a standard pigeon across an ocean): where it boards, when the ship
// sails, the sea it crosses, where and when it comes ashore; null if it doesn't
function shipOf(legs) {
  const b = (legs || []).filter((l) => l[3] === "b"); if (b.length < 3) return null;
  // (the sea it crosses: the middle of its longest leg, not the strait it sails out by)
  let mid = [b[1][0], b[1][1]], far = -1, last = b.at(-1);
  for (let i = 1; i < b.length - 1; i++) { const d = haversineKm(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1]); if (d > far) { far = d; const w = b[i + 1][1] - b[i][1] > 180 ? -360 : b[i + 1][1] - b[i][1] < -180 ? 360 : 0, lo = (b[i][1] + b[i + 1][1] + w) / 2; mid = [(b[i][0] + b[i + 1][0]) / 2, lo > 180 ? lo - 360 : lo < -180 ? lo + 360 : lo]; } }
  return { from: b[0][4] || "port", board: b[0][2], off: b[1][2], to: last[4] || "port", ashore: last[2], sea: overWhere(mid[1], mid[0]) };
}
// When a ship gets in, as you'd say it: "at 14:00", "tomorrow", "on Thursday", "on 23 Oct"
function onDay(ts) {
  if (sameDay(ts, now())) return `at ${fmtTime(ts)}`;
  if (sameDay(ts, now() + DAY)) return "tomorrow";
  const d = new Date(ts); return ts - now() < 6 * DAY ? `on ${DOW_LONG[d.getDay()]}` : `on ${d.getDate()} ${MON[d.getMonth()]}`;
}
// A voyage on the map: the lane it sails (teal, solid where it has sailed, dotted ahead) and
// its two ports. `stroke(P, i0, i1, up)` draws points i0 to i1 of a track (the globe hides the back).
function drawVoyages(g, tracks, col, lw, stroke) {
  const ports = [];
  for (const { r, rp, P, up } of tracks) {
    const sh = !r.here && !r.lost && shipOf(r.legs); if (!sh) continue;
    const a = rp.findIndex((p) => p.t >= sh.off - 1), b = rp.findIndex((p) => p.t >= sh.ashore - 1); if (a < 0 || b <= a) continue;
    const ft = flightAt(r).t, i = rp.findIndex((p) => p.t >= ft), cut = i < 0 ? b : Math.min(b, Math.max(a, i));
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    g.globalAlpha = 0.9; g.strokeStyle = col("--cell"); g.lineWidth = lw + 3; stroke(P, a, b, up);
    g.globalAlpha = 1; g.strokeStyle = col("--teal");
    if (cut > a) { g.lineWidth = lw; stroke(P, a, cut, up); }
    if (cut < b) { g.lineWidth = lw - 0.5; g.setLineDash([0.5, 7]); stroke(P, cut, b, up); g.setLineDash([]); }
    g.restore();
    // (a port where it takes off or lands already has that end's dot and name)
    const end = (i) => [P[0], P.at(-1)].some((q) => Math.hypot(q[0] - P[i][0], q[1] - P[i][1]) < 12);
    ports.push({ at: P[a], vis: (!up || up[a]) && !end(a), name: sh.from }, { at: P[b], vis: (!up || up[b]) && !end(b), name: sh.to });
  }
  for (const p of ports) {
    if (!p.vis) continue;
    const [x, y] = p.at;
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.strokeStyle = col("--teal"); g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.stroke();
  }
  return ports;
}
// its ports' names, where there's room (after the ends have theirs)
function portLabels(g, ports, free, taken, text, col) {
  g.save(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
  for (const p of ports) {
    if (!p.vis || !p.name) continue;
    const [x, y] = p.at, s = `${p.name}`, w = g.measureText(s).width;
    taken.push([x - 8, y - 8, x + 8, y + 8]);
    for (const [lx, ly] of [[x + 11, y], [x - 11 - w, y], [x - w / 2, y - 20], [x - w / 2, y + 20]]) {
      const box = [lx - 3, ly - 9, lx + w + 3, ly + 9]; if (!free(box)) continue;
      taken.push(box); text(s, lx, ly, col("--teal-t")); break;
    }
  }
  g.restore();
}
// The way a pigeon would go if it left now (How It Flies), from the server's
// planner: { key, at, data } for one friend (every kind of pigeon, each way), kept 10 minutes.
// Asked for one kind, it answers with that kind's ways as data.plans.
const PLAN_KEEP = 10 * MIN;
// In a hurry (How It Flies → By Sea): a standard pigeon flies an ocean itself rather than take a ship, for this chat
const noShipOn = () => !!S.chat && S.noShip === S.chat;
// a kind's plans, each way: by ship where it would take one, unless it's flying it all
const kindPlans = (d, k) => (noShipOn() && d?.noShip?.[k]) || d?.kinds?.[k];
function routePlanFor(chat, kind) {
  const bd = birdFor(), key = chat + ":" + (bd?.id || ""), p = S.routePlan;     // (who'd carry it: a named pigeon stops for breathers)
  const view = (d) => (d ? { ...d, pigeon: d.kinds?.[kind] ? kind : d.pigeon, plans: kindPlans(d, kind) || d.plans } : null);
  if (p?.key === key && (p.loading || now() - p.at < PLAN_KEEP)) return view(p.data);
  S.routePlan = { key, at: now(), loading: true, data: p?.key === key ? p.data : null };
  api(`route-plan?with=${encodeURIComponent(chat)}&pigeon=${encodeURIComponent(KIND[kind] ? kind : "standard")}${bd ? `&bird=${encodeURIComponent(bd.id)}` : ""}`).then((d) => {
    if (S.routePlan?.key !== key) return;
    S.routePlan = { key, at: now(), data: d.plans ? d : null };
    if (S.sheet?.type === "flysheet") renderSheet();
    if (S.chat === chat) renderCompose();
  }).catch(() => { if (S.routePlan?.key === key) S.routePlan = { key, at: now() - PLAN_KEEP + MIN, data: null }; });
  return view(S.routePlan.data);
}
// How long a pigeon of this kind would take, the way it would really go (the
// planner's, with its rests and the weather, once it has answered), else at its calm pace
function plannedMs(c, k) {
  const d = !c.g && !c.via && !c.sched && S.routePlan?.key === c.f?.id + ":" + (birdFor()?.id || "") ? S.routePlan.data : null, p = kindPlans(d, k)?.[routeStyle()];
  return p ? Math.max(0, p.deliverAt - d.at) : etaMs(c, k);
}
// The way in a few words: "through the Simplon Pass · around storms over France"
// What a way went around, or sheltered from: storms, or hail, or icy weather (the
// planner and the live turns note it on the leg when it wasn't thunderstorms)
const SEVERE_WORD = { storms: "storms", hail: "hail", icing: "icy weather", ash: "volcanic ash", smoke: "wildfire smoke" };
// its icon: a volcano for ash, a fire for smoke, else a storm cloud
const severeIcon = (k) => (k === "ash" ? I.volcano : k === "smoke" ? I.fire : I.storm);
const severeKOf = (legs, tag = "s") => (legs || []).find((l) => l[3] === tag && l[5]?.k)?.[5]?.k || null;
const severeOf = (legs, tag = "s") => SEVERE_WORD[(legs || []).find((l) => l[3] === tag && l[5]?.k)?.[5]?.k] || "storms";
function wayWords(legs) {
  const said = [], sw = severeOf(legs);
  for (const l of legs || []) {
    const n = l[4], say = { s: `around ${sw}${n ? ` over ${n}` : ""}`, w: "riding the wind", i: `resting on ${n || "an island"}`, v: `past ${n || "a landmark"}`,
      o: `along the coast${n ? ` of ${n}` : ""}`, m: `over ${n || "the mountains"}`, b: n ? `by ship from ${n}` : "",
      p: `through ${!n ? "a pass" : /^a |^[A-Z][\w’']*['’]s /.test(n) ? n : `the ${n}`}` }[l[3]];
    if (say && !said.includes(say)) said.push(say);
  }
  return said.length ? said.slice(0, 3).join(" · ") : "the straight way";
}
function routeNote(m) {
  const legs = (m.legs || []).filter((l) => l[3] && l[3] !== "c" && l[3] !== "f"); if (!legs.length || m.lost) return null;
  const t = m.lost ? m.lostAt : now(), landed = t >= m.deliverAt;
  const rest = restingOn(m, t);
  if (rest) return rest[2] === "h" ? { icon: I.storm, text: `Sheltering${rest[0] ? ` ${rest[0]}` : ` from ${rest[3]}`} until about ${fmtTime(rest[1])}` }
    : rest[2] === "b" ? { icon: I.ship, text: `Waiting for a ship at ${rest[0]}: it sails ${sameDay(rest[1], now()) ? `at ${fmtTime(rest[1])}` : fmtShort(rest[1])}${shipOf(legs) ? `, in ${shipOf(legs).to} ${onDay(shipOf(legs).ashore)}` : ""}` }
    : rest[2] === "sail" ? { icon: I.ship, text: `At sea across ${rest[0]}: the ship gets in to ${rest[3]} ${onDay(rest[1])}` }
    : rest[2] === "t" ? { icon: I.bird, text: `Catching its breath ${rest[0] || "on the way"} until ${fmtTime(rest[1])}` }
    : { icon: I.bird, text: `Resting on ${rest[0]} until ${fmtTime(rest[1])}` };
  const next = legs.find((l) => l[2] > t), last = [...legs].reverse().find((l) => l[2] <= t), l = landed ? legs.at(-1) : next || last;
  const ahead = !landed && l === next, name = l[4], over = name ? ` over ${name}` : "";
  const turned = ahead && last?.[3] === "r";                     // it changed course for the weather on the way (live)
  const sw = turned ? SEVERE_WORD[last[5]?.k] || "storms" : severeOf(legs), hw = SEVERE_WORD[l[5]?.k] || "storms";
  const say = {
    s: [I.storm, turned ? `Rerouted around ${sw}${over}` : ahead ? `Going around ${sw}${over}` : `Went around ${sw}${over}`],
    w: [I.wind, turned ? "Rerouted to ride the wind" : ahead ? "Riding the wind: a longer way, but quicker" : "Rode the wind: a longer way, but quicker"],
    h: [I.storm, ahead ? `Sheltering from ${hw}${name ? ` ${name}` : ""} on the way` : `Sheltered from ${hw}${name ? ` ${name}` : ""}`],
    r: [name === "s" ? I.storm : I.wind, name === "s" ? `Rerouted to keep clear of ${hw}` : "Rerouted to ride the wind"],
    i: [I.bird, ahead ? `Resting on ${name || "an island"} on the way` : `Rested on ${name || "an island"}`],
    t: [I.bird, ahead ? `A breather ${name || "on the way"} coming up` : `Caught its breath ${name || "on the way"}`],
    p: [I.map, `${ahead ? "Through" : "Came through"} ${!name ? "the pass" : /^a |^[A-Z][\w’']*['’]s /.test(name) ? name : `the ${name}`}`],
    v: [I.loc, ahead ? `The scenic way, past ${name || "a landmark"}` : `Came the scenic way, past ${name || "a landmark"}`],
    o: [I.waves, ahead ? `Following the coast${name ? ` of ${name}` : ""}` : `Followed the coast${name ? ` of ${name}` : ""}`],
    m: [I.map, ahead ? `Flying over ${name || "the mountains"}` : `Flew over ${name || "the mountains"}`],
    b: [I.ship, (() => { const sh = shipOf(legs); return !sh ? (ahead ? "A voyage by ship ahead" : "Came by ship") : ahead ? `By ship from ${sh.from}: in ${sh.to} ${onDay(sh.ashore)}` : `Came by ship from ${sh.from} to ${sh.to}`; })()],
  }[l[3]];
  return say ? { icon: say[0], text: say[1] } : null;
}
function routePts(m) {
  const stops = [[m.route[0], m.route[1], m.sentAt], ...(m.legs || []), [m.route[2], m.route[3], m.deliverAt]];
  const pts = []; let prev = null;
  for (let i = 0; i < stops.length - 1; i++) {
    const [aLat, aLon, aT] = stops[i], [bLat, bLon, bT] = stops[i + 1], n = stops.length === 2 ? 96 : 48;
    for (let j = i ? 1 : 0; j <= n; j++) {
      const p = gcPoint({ lat: aLat, lon: aLon }, { lat: bLat, lon: bLon }, j / n);
      if (prev != null) { while (p.lon - prev > 180) p.lon -= 360; while (p.lon - prev < -180) p.lon += 360; }   // never jump the date line
      prev = p.lon; pts.push({ x: p.lon, y: mercY(p.lat), t: aT + (bT - aT) * j / n });
    }
    if (i < stops.length - 2) pts[pts.length - 1].turn = !stops[i + 1][3];     // (only where it turned for someone moving: planned bends, rests and cheers aren't turns)
  }
  return pts;
}
// Pigeons ease in and out: they launch hard and settle into their cruise, then
// glide down to land. Each ramp lasts up to a minute (15% of a very short
// flight); the pigeon cruises a touch faster in between, so it still lands
// exactly on time. Returns how far along it is (0-1), its speed now, the phase,
// and the "flight clock" time for that distance (route points are timed at an
// even pace).
const RAMP_MS = MIN;
function flightAt(m, t = now()) {
  const dur = Math.max(1, m.deliverAt - m.sentAt), u = Math.min(1, Math.max(0, (t - m.sentAt) / dur));
  const r = Math.min(0.15, RAMP_MS / dur), top = 1 / (1 - 2 * r * (1 - 2 / Math.PI));
  const q = Math.PI / (2 * r);                                   // pace in a ramp: sin(q·x), 0 → 1
  const ramp = (x) => (top / q) * (1 - Math.cos(q * x));         // distance covered x into a ramp
  const frac = u < r ? ramp(u) : u > 1 - r ? 1 - ramp(1 - u) : ramp(r) + top * (u - r);
  const pace = u <= 0 || u >= 1 ? 0 : u < r ? Math.sin(q * u) : u > 1 - r ? Math.sin(q * (1 - u)) : 1;
  return { frac, kmh: (m.km / (Math.max(1, dur - stillMs(m)) / HOUR)) * top * pace, phase: u >= 1 ? "landed" : u < r ? "up" : u > 1 - r ? "down" : "cruise", t: m.sentAt + frac * dur };
}
// Where the pigeon is (at flight-clock time t) along those points, and which way it's heading.
function pigeonOn(P, pts, t = now()) {
  const i = pts.findIndex((p) => p.t >= t);
  if (i <= 0) { const a = P[Math.max(0, P.length - 2)], b = P[P.length - 1]; return { at: P[i < 0 ? P.length - 1 : 0], dx: P[P.length - 1][0] - P[0][0], dy: i < 0 ? 0 : b[1] - a[1] }; }
  const f = (t - pts[i - 1].t) / Math.max(1, pts[i].t - pts[i - 1].t);
  return { at: [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f], dx: P[i][0] - P[i - 1][0], dy: P[i][1] - P[i - 1][1] };
}
// The routes a map shows: one, or for your message to a group, one per member
// whose location you can see (friends; others' routes stay off the map).
const routesOf = (m) => m.skies ? m.skies : m.flock ? m.flock.filter((r) => r.route).map((r) => ({ ...r, sentAt: m.sentAt, pigeon: m.pigeon, risky: m.risky, fromPlace: m.fromPlace })) : [m];
// Where the map sits: every route in view, unless the person has moved it.
function mapFrame(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight, usableH = Math.max(80, H - cardH - 30), sy0 = 20 + usableH / 2;
  const pts = [...routesOf(m), ...(m.alts || [])].flatMap(routePts);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const fit = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    k: Math.min(W / Math.max(8, (Math.max(...xs) - Math.min(...xs)) * 1.5), usableH / Math.max(6, (Math.max(...ys) - Math.min(...ys)) * 1.6 + 8)),
  };
  return { W, H, sy0, pts, fit, view: S.sheet?.view || fit, kMin: Math.max(W / 360, H / (2 * mercY(MERC_MAX))) };
}
// The Way: the other ways it could go (m.alts), faint and dotted, each named
// where it's furthest from the chosen way ("Scenic · 10:45"); tap a name for that
// way. Returns where the names are, for the taps. xy: a route point → [x, y, seen]
function drawAlts(g, m, xy, W, H) {
  if (!m.alts?.length) return [];                                     // (only The Way has them; a group's map has no one route)
  const hits = [], main = routePts(m).map(xy), apart = (P, Q) => Math.max(...P.map(([x, y]) => Math.min(...Q.map(([u, v]) => Math.hypot(u - x, v - y)))));
  g.save(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.lineCap = "round"; g.lineJoin = "round";
  // (two ways that go the same way are one line, named for both: "Fastest & Safe")
  const ways = [];
  for (const a of m.alts || []) {
    const P = routePts(a).map(xy), same = ways.find((w) => apart(w.P, P) < 6);
    if (same) same.a = { ...same.a, name: `${same.a.name} & ${a.name}` }; else ways.push({ a, P });
  }
  for (const { a, P } of ways) {
    // (the same way as the chosen one, near enough: nothing to show)
    const off = P.map(([x, y]) => Math.min(...main.map(([u, v]) => Math.hypot(u - x, v - y))));
    if (Math.max(...off) < 6) continue;
    g.globalAlpha = 0.5; g.strokeStyle = cssVar(g.canvas, "--label-2"); g.lineWidth = 2.5; g.setLineDash([2, 7]);
    g.beginPath(); let on = false; for (const [x, y, seen] of P) { if (seen === false) { on = false; continue; } on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; } g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    const i = off.indexOf(Math.max(...off)), [x, y, seen] = P[i]; if (seen === false || x < 0 || x > W || y < 0 || y > H) continue;
    const label = `${a.name} · ${atShort(a.deliverAt)}`, w = g.measureText(label).width + 16, h = 22, bx = Math.max(4, Math.min(W - w - 4, x - w / 2)), by = Math.max(4, Math.min(H - h - 4, y - h / 2));
    g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 6; g.shadowOffsetY = 1;
    g.fillStyle = cssVar(g.canvas, "--cell"); g.beginPath(); g.roundRect(bx, by, w, h, 11); g.fill();
    g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.strokeStyle = cssVar(g.canvas, "--sep"); g.lineWidth = 1; g.stroke();
    g.fillStyle = cssVar(g.canvas, "--label-2"); g.textBaseline = "middle"; g.fillText(label, bx + 8, by + h / 2 + 0.5);
    hits.push({ style: a.style, x0: bx - 8, y0: by - 8, x1: bx + w + 8, y1: by + h + 8 });
  }
  g.restore();
  return hits;
}
function drawMap(cv, m, cardH) {
  cv._m = m; cv._cardH = cardH;
  if (mapMoving() && cv._base) return fastFrame(cv);        // fingers on it: the quick version; the full one follows
  $(".mapctl [data-act=mapglobe]", $layer)?.setAttribute("aria-pressed", String(globeOn(m)));
  if (globeOn(m)) return drawGlobe(cv, m, cardH);
  const { W, H, sy0, pts, view } = mapFrame(cv, m, cardH); if (!W || !H) return;
  const { cx, cy, k } = view;
  const dpr = cv._dprFix || window.devicePixelRatio || 1; cv._dpr = dpr;
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
  // shallow water along every coast, then the land, then the mountains on it (lit from the north-west)
  g.save(); g.lineJoin = "round"; g.strokeStyle = col("--shelf");
  for (const [w, a] of [[Math.min(16, 3 + k * 0.9), 0.5], [Math.min(8, 2 + k * 0.45), 1]]) { g.globalAlpha = a; g.lineWidth = w; g.stroke(); }
  g.restore();
  g.fillStyle = col("--land"); g.fill("evenodd");
  g.save(); g.clip("evenodd"); drawRelief(g, offs.map((o) => (lon, lat) => [X(lon + o), Y(mercY(lat))]), k, col("--relief-hi"), col("--relief-lo")); g.restore();
  g.strokeStyle = col("--land-edge"); g.lineWidth = k > 40 ? 1.1 : 0.8; g.stroke();
  if (data.borders.length && k >= 2.5) {
    g.beginPath(); trace(data.borders, false);
    g.strokeStyle = col("--border"); g.lineWidth = k > 40 ? 1.2 : 0.8; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
  }
  const suns = drawNight(g, W, H, ox, oy, k);
  // the other ways it could go (on The Way), faint, each with its name; then the routes
  // (a message to a group has one per member), their ends, and each pigeon
  cv._altHits = drawAlts(g, m, (p) => [X(p.x), Y(p.y), true], W, H);
  const tracks = routesOf(m).map((r) => { const rp = routePts(r); return { r, rp, P: rp.map((p) => [X(p.x), Y(p.y)]) }; });
  // the trail: solid where it has flown, dashed (and fainter) where it has still to go
  const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const lw = tracks.length > 1 ? 3 : 3.5, tint = col("--tint");
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = tint;
  for (const { r, rp, P } of tracks) {
    if (r.here) continue;
    const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft);
    const at = pigeonOn(P, rp, ft).at, flown = i < 0 ? P : i === 0 ? [P[0]] : [...P.slice(0, i), at], ahead = i < 0 ? [] : [at, ...P.slice(i)];
    if (ahead.length > 1) { g.globalAlpha = r.lost ? 0.3 : 0.6; g.lineWidth = lw - 0.5; g.setLineDash([9, 8]); line(ahead); }
    g.globalAlpha = 1; g.setLineDash([]);
    if (flown.length > 1) { g.lineWidth = lw + 1.5; g.strokeStyle = col("--cell"); line(flown); g.lineWidth = lw; g.strokeStyle = tint; line(flown); }   // a light edge so it reads on land and sea
  }
  g.globalAlpha = 1; g.setLineDash([]);
  const ports = drawVoyages(g, tracks, col, lw, (P, a, b) => line(P.slice(a, b + 1)));
  // the weather on the way: the way it was going before it turned for the weather, faint;
  // and where it sheltered from storms
  const nearT = (rp, t) => rp.reduce((a, p, i) => (Math.abs(p.t - t) < Math.abs(rp[a].t - t) ? i : a), 0);
  for (const { r, rp, P } of tracks) for (const [k, l] of (r.legs || []).entries()) {
    if (l[3] === "r" && l[5]?.was?.length) {
      const i = nearT(rp, l[2]), pts = [P[i]]; let prev = rp[i].x, a = { lat: l[0], lon: l[1] };
      for (const [lat, lon] of l[5].was) {
        for (let j = 1; j <= 16; j++) { const q = gcPoint(a, { lat, lon }, j / 16); while (q.lon - prev > 180) q.lon -= 360; while (q.lon - prev < -180) q.lon += 360; prev = q.lon; pts.push([X(q.lon), Y(mercY(q.lat))]); }
        a = { lat, lon };
      }
      g.save(); g.globalAlpha = 0.55; g.strokeStyle = col("--label-3"); g.lineWidth = 2; g.setLineDash([3, 6]); line(pts); g.restore();
    }
    if (l[3] === "h" && r.legs[k + 1]?.[3] === "h" && (k === 0 || r.legs[k - 1][3] !== "h" || r.legs[k - 1][0] !== l[0])) {
      const [x, y] = P[nearT(rp, l[2])];
      g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
      g.strokeStyle = col("--orange"); g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke();
    }
  }
  g.strokeStyle = tint;
  for (const { rp, P } of tracks) rp.forEach((p, i) => { if (p.turn) { g.fillStyle = col("--cell"); g.beginPath(); g.arc(P[i][0], P[i][1], 5, 0, 7); g.fill(); g.fillStyle = col("--tint"); g.beginPath(); g.arc(P[i][0], P[i][1], 2.5, 0, 7); g.fill(); } });   // where it turned
  for (const { r, rp } of tracks) for (const n of r.near || []) {        // where it passed another pigeon
    const near = rp.reduce((a, p) => (Math.abs(p.t - n.at) < Math.abs(a.t - n.at) ? p : a), rp[0]);
    let lon = n.lon; while (lon - near.x > 180) lon -= 360; while (lon - near.x < -180) lon += 360;
    sparkAt(g, X(lon), Y(mercY(n.lat)), col("--cell"), col("--orange"));
  }
  const birds = tracks.filter(({ r }) => !r.here).map(({ r, rp, P }) => ({ r, ...pigeonOn(P, rp, flightAt(r, r.lost ? r.lostAt : now()).t) }));
  // labels claim space in priority order; anything that would overlap is left out
  const taken = [...birds.map(({ at: [px, py] }) => [px - 24, py - 20, px + 24, py + 20]), [0, H - cardH, W, H], ...suns];
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
  if (m.skies) {
    // every pigeon in the air: each place once, wherever several routes share it
    const done = new Set();
    for (const { r, P } of tracks) for (const [p, toward, name] of [[P[0], P[4], r.fromPlace], [P[P.length - 1], P[P.length - 5], r.toPlace]]) {
      const key = `${Math.round(p[0])},${Math.round(p[1])}`; if (done.has(key)) continue;
      done.add(key); end(p, toward, name);
    }
  } else {
    end(tracks[0].P[0], tracks[0].P[4], m.fromPlace);
    for (const { r, P } of tracks) end(P[P.length - 1], P[P.length - 5], r.toPlace);
  }
  g.font = "600 13px -apple-system, system-ui, sans-serif";
  portLabels(g, ports, free, taken, text, col); cv._ports = ports.filter((p) => p.vis).map((p) => p.name);
  // country names: the biggest first, smaller ones as you zoom in (only where there's room)
  if (k >= 2.2 && k < 60) {
    g.save(); g.font = "600 10px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = col("--label-3");
    const tier = k >= 9 ? 3 : k >= 4.5 ? 2 : 1;
    for (const [name, lat, lon, t] of COUNTRIES) {
      if (t > tier) continue;
      const label = name.toUpperCase().split("").join("\u200a");
      for (const o of offs) {
        const x = X(lon + o), y = Y(mercY(lat)); if (x < -60 || x > W + 60 || y < -20 || y > H + 20) continue;
        const w = g.measureText(label).width, box = [x - w / 2 - 3, y - 7, x + w / 2 + 3, y + 7];
        if (!free(box)) continue;
        taken.push(box); g.fillText(label, x, y);
      }
    }
    g.restore();
  }
  // other cities once there's room to read them
  if (k >= 4) {
    g.font = "500 11px -apple-system, system-ui, sans-serif";
    const c2 = col("--label-2"), skip = new Set([m.fromPlace, ...tracks.flatMap(({ r }) => [r.fromPlace, r.toPlace])]);
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
  // keep the map without its pigeons: between full redraws only the pigeons are drawn again (wings flapping)
  const base = cv._base || (cv._base = document.createElement("canvas"));
  if (base.width !== cv.width || base.height !== cv.height) { base.width = cv.width; base.height = cv.height; }
  base.getContext("2d").drawImage(cv, 0, 0);
  cv._birds = birds.map((b) => ({ ...b, phase: birdPhase(b.r), color: b.r.lost ? col("--label-3") : col("--p-" + kindOf(b.r)) }));
  // the wind it met, for the streaks: each route still being flown, measured along its length
  cv._snap = { ox, oy, k, globe: false }; cv._seaCol = col("--sea");
  cv._fwd = (lon, lat) => { const L = lon + 360 * Math.round((cx - lon) / 360); return [X(L), Y(mercY(lat))]; };
  cv._inv = (x, y) => [(x - ox) / k, latOf((oy - y) / k)];
  cv._kArc = (lat) => k / Math.max(0.05, Math.cos(lat * Math.PI / 180));        // pixels per degree of arc here
  cv._viewKey = `f${ox.toFixed(1)},${oy.toFixed(1)},${k.toFixed(5)},${W},${H}`;
  cv._area = (x, y) => x >= 0 && x <= W && y >= 0 && y <= H;
  windEnsure(cv);
  cv._winds = windOn() ? [] : tracks.filter(({ r }) => !r.here && !r.lost && r.wind != null && Math.abs(r.wind) >= 3 && now() < r.deliverAt).map(({ r, P }) => {
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, cum, L: cum[cum.length - 1], wind: r.wind, seed: r.deliverAt % 1000 };
  });
  cv._windCol = [col("--green") || "#34c759", col("--orange") || "#ff9500"];
  cv._wx = wxCells(tracks.map(({ r }) => r)); cv._wxText = col("--label-2"); cv._wxHalo = col("--land");
  drawBirds(cv, performance.now());
  if (ctlEl) ctlEl.classList.toggle("moved", !!S.sheet?.view);
}
// Mountains: each range a soft ridge, a light side to the north-west and a
// shadow to the south-east, built from a few wide translucent strokes.
function drawRelief(g, pts1, k, hi, lo) {
  if (k > 120) return;
  g.lineCap = "round"; g.lineJoin = "round";
  for (const [wd, pts] of RANGES) for (const pt of pts1) {
    const P = pts.map(([lon, lat]) => pt(lon, lat)); if (P.some((p) => !p)) continue;
    const w = wd * k, sh = Math.max(1, w * 0.18);
    const path = (dx, dy) => { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); };
    for (const [c, dx, dy] of [[lo, sh, sh], [hi, -sh, -sh]]) {
      g.strokeStyle = c;
      for (const [f, a] of [[1.5, 0.035], [1, 0.045], [0.6, 0.05]]) { g.globalAlpha = a; g.lineWidth = w * f; path(dx, dy); g.stroke(); }
    }
  }
  g.globalAlpha = 1;
}
// Where the sun is overhead right now (degrees): the usual low-precision
// solar formulas, good to a fraction of a degree.
function sunAt(t = now()) {
  const d = t / DAY - 10957.5, rad = Math.PI / 180;
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const eot = ((((q - ra) % 360) + 540) % 360 - 180) * 4 / 60;          // equation of time, hours
  const utc = (t % DAY) / HOUR;
  return { lat: dec / rad, lon: ((((12 - utc - eot) * 15) % 360) + 540) % 360 - 180 };
}
// Night: shade where the sun is down, deepening through twilight (to 12° below
// the horizon). Worked out on a coarse grid and smoothed, so it's cheap.
const NIGHT_STEP = 6;
function drawNight(g, W, H, ox, oy, k) {
  const sun = sunAt(), rad = Math.PI / 180, sd = Math.sin(sun.lat * rad), cd = Math.cos(sun.lat * rad);
  const cw = Math.ceil(W / NIGHT_STEP) + 1, ch = Math.ceil(H / NIGHT_STEP) + 1;
  const off = drawNight.c || (drawNight.c = document.createElement("canvas"));
  if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
  const oc = off.getContext("2d"), img = oc.createImageData(cw, ch), px = img.data;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const [r, gg, b, top] = dark ? [0, 0, 0, 0.42] : [12, 26, 64, 0.26];
  const lats = Array.from({ length: ch }, (_, j) => { const y = (oy - j * NIGHT_STEP) / k; return (2 * Math.atan(Math.exp(y / R2D)) * R2D - 90) * rad; });
  for (let i = 0; i < cw; i++) {
    const cosH = Math.cos(((i * NIGHT_STEP - ox) / k - sun.lon) * rad);
    for (let j = 0; j < ch; j++) {
      const alt = Math.asin(Math.sin(lats[j]) * sd + Math.cos(lats[j]) * cd * cosH) / rad;
      const n = alt >= 0 ? 0 : alt <= -12 ? 1 : (x => x * x * (3 - 2 * x))(-alt / 12);
      const o = (j * cw + i) * 4; px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = Math.round(255 * top * n);
    }
  }
  oc.putImageData(img, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(off, 0, 0, cw * NIGHT_STEP, ch * NIGHT_STEP); g.restore();
  // the sun, where it's overhead (once on each copy of the world in view); its spots, for labels to keep clear of
  const spots = [];
  for (let o = -360; o <= 360; o += 360) {
    const sx = ox + (sun.lon + o) * k, sy = oy - mercY(sun.lat) * k;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    spots.push([sx - 15, sy - 15, sx + 15, sy + 15]);
    g.save(); g.translate(sx, sy);
    const glow = g.createRadialGradient(0, 0, 2, 0, 0, 22); glow.addColorStop(0, "rgba(255,204,0,.55)"); glow.addColorStop(1, "rgba(255,204,0,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
    g.fillStyle = "#ffcc00"; g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = "#ffb800"; g.lineWidth = 1.6; g.lineCap = "round";
    for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s2 = Math.sin(a * Math.PI / 4); g.beginPath(); g.moveTo(c * 9, s2 * 9); g.lineTo(c * 12.5, s2 * 12.5); g.stroke(); }
    g.restore();
  }
  return spots;
}
/* ---------- when it lands, in your time and your friend's ---------- */
// Date formatters, made once per zone and style (making one is slow: a sheet full of times made hundreds)
const DTF = new Map();
const dtf = (o) => { const k = JSON.stringify(o); let f = DTF.get(k); if (!f) { f = new Intl.DateTimeFormat("en-GB", o); DTF.set(k, f); } return f; };
const MY_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return null; } })();
// "08:12", or "Sat 08:12" when that's not today there
function clockIn(ts, tz) {
  try {
    const f = (t, o) => dtf({ timeZone: tz || undefined, ...o }).format(t), ymd = { year: "numeric", month: "numeric", day: "numeric" };
    const time = f(ts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return f(ts, ymd) === f(now(), ymd) ? time : `${f(ts, { weekday: "short" })} ${time}`;
  } catch (_) { return fmtShort(ts); }
}
// How sure a landing time is: a range around it, wider the further off it is
// and the more the weather has to do with the flight (its wind, the time the
// weather has cost or saved, the storms and wind it's going around), narrowing
// as it gets closer. [earliest, latest] (to 5 minutes), or null once it's within ~10.
// With `sure` (how much the ensemble forecast's members disagree about the
// flight's length, as a share of it), the range is the middle 80% of theirs.
function landRange(at, from, { wind = null, delay = 0, legs = [], sure = null } = {}) {
  const R = Math.max(0, at - now()), H = R / HOUR;
  const wx = Math.min(0.4, Math.abs(Math.log(Math.max(0.4, (80 + (wind || 0)) / 80))) + (delay ? Math.abs(delay) / Math.max(HOUR, at - from) : 0)
    + 0.04 * (legs || []).filter((l) => /^[srhw]$/.test(l[3] || "")).length);
  const spread = Math.min(3 * HOUR, sure != null ? R * 2.56 * sure : R * (0.01 + 0.15 * wx * Math.min(1, H / 48)));
  if (spread < 10 * MIN) return null;
  const five = (x) => Math.round(x / (5 * MIN)) * 5 * MIN;
  return [five(at - spread / 2), five(at + spread / 2)];
}
// "21:10–21:40", "Fri 23:40–Sat 00:30"
const rangeText = ([lo, hi], tz = MY_TZ) => `${clockIn(lo, tz)}–${new Date(lo).toDateString() === new Date(hi).toDateString() ? fmtTime(hi) : clockIn(hi, tz)}`;
// Lands 08:12 Mira's time · 16:12 yours (when your clocks differ)
function landsLine(m) {
  const mine = m.from === S.me.id, other = friend(mine ? m.to : m.from), at = m.deliverAt, you = clockIn(at, MY_TZ);
  const them = other?.tz && other.tz !== MY_TZ ? clockIn(at, other.tz) : null;
  // (in the air, a range when it's not yet sure: "Lands 21:10–21:40")
  const range = m.flying && !m.lost ? landRange(at, m.sentAt, { wind: m.wind, delay: m.delay, legs: m.legs, sure: m.spread }) : null;
  if (range) return `Lands ${rangeText(range)}${them && them !== you ? ` · about ${them} ${esc(first(other.name))}’s time` : ""}`;
  if (!them || them === you) return `Lands ${you}`;
  return mine ? `Lands ${them} ${esc(first(other.name))}’s time · ${you} yours` : `Lands ${you} · ${them} for ${esc(first(other.name))}`;
}

/* ---------- what the weather did to a flight ---------- */
// "Delayed 40m · storms over the Alps", "25m early · tailwind over France"
const WX = { storms: ["storms", "storm"], hail: ["hail", "storm"], icing: ["icy weather", "fog"], heat: ["fierce heat", "sun"], cold: ["bitter cold", "snow"], rain: ["heavy rain", "rain"], snow: ["snow", "snow"], fog: ["fog", "fog"], gales: ["gales", "wind"],
  headwind: ["headwinds", "wind"], tailwind: ["a tailwind", "wind"], ash: ["volcanic ash", "volcano"], smoke: ["wildfire smoke", "fire"], magnetic: ["a magnetic storm", "compass"] };
// a mountain range when it's right over one, else the country or sea
function wxWhere(lon, lat) {
  for (const [wd, pts, name] of RANGES) {
    if (!name) continue;
    for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k <= 4; k++) {
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / 4, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / 4;
      if (haversineKm(lat, lon, y, x) < Math.max(120, wd * 70)) return name;
    }
  }
  return overWhere(lon, lat);
}
// What the weather named should fit what it did: a tailwind only for early, anything else only for late.
// (One that doesn't: a delay from sheltering or going round storms earlier on, then a tailwind ahead.
// The storm it stopped for, or went round, is the reason then.)
function wxCause(m, late) {
  if (m.wx && WX[m.wx.k] && (m.wx.k === "tailwind") === !late) return m.wx;
  if (!late) return null;
  for (const l of [...(m.legs || [])].reverse()) {
    if (l[3] === "h") return { k: (l.find((x) => x && typeof x === "object")?.k) || "storms", lat: l[0], lon: l[1] };
    if (l[3] === "r" && l[4] === "s" && l[5]?.storm) return { k: l[5].k || "storms", lat: l[5].storm[0], lon: l[5].storm[1] };
  }
  return null;
}
function wxSay(m, short) {
  if (!m.delay || m.lost) return null;
  const late = m.delay > 0, cause = wxCause(m, late);
  m = { ...m, wx: cause };
  const w = cause && WX[cause.k], landed = !m.flying || m.deliverAt <= now();
  const when = late ? (landed ? `Landed ${fmtDur(m.delay)} late` : `Delayed ${fmtDur(m.delay)}`) : `${fmtDur(-m.delay)} early`;
  if (short) return late ? `${landed ? `${fmtDur(m.delay)} late` : `delayed ${fmtDur(m.delay)}`}${w ? ` by ${w[0]}` : ""}` : `${fmtDur(-m.delay)} early${w ? ` on ${w[0]}` : ""}`;
  // (a wind met higher or lower than usual: it climbed for a tailwind, or kept low out of a headwind;
  // a rocket climbed all the way to the jet stream)
  const alt = m.wx?.alt, where = w ? wxWhere(m.wx.lon, m.wx.lat) : "";
  const why = !w ? (late ? "bad weather" : "a tailwind")
    : alt >= 5000 && m.wx.k === "tailwind" ? `rode the jet stream over ${where}`
    : alt >= 5000 ? `climbed to the jet stream, above the worst of the ${w[0]} over ${where}`
    : alt && m.wx.k === "tailwind" ? `${alt > 120 ? "climbed" : "flew low"} to catch a tailwind over ${where}`
    : alt && m.wx.k === "headwind" ? `${alt > 120 ? "climbed above" : "kept low under"} the worst of the headwinds over ${where}`
    : `${w[0]} over ${where}`;
  return { text: `${when} · ${why}`, icon: I[w ? w[1] : "wind"], cls: late ? "late" : "early" };
}

/* ---------- where a pigeon is: over which country or sea ---------- */
// on land? (the coarse coastline, even-odd over every ring)
function onLand(lon, lat) {
  const y = mercY(lat), land = world("110m").land;
  let inside = false;
  for (const { f, box } of land) for (const o of [0, 360, -360]) {
    const x = lon + o; if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
      const xi = f[i], yi = f[i + 1], xj = f[j], yj = f[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
// "France", "the North Atlantic": the nearest country's middle (bigger countries reach further), or the sea it's in
// The country or sea at a point, by the borders: the same grid the server names
// places from (pigeon/placegrid.js), so the card and a push about it agree
function overWhere(lon, lat) {
  return placeAt(lat, ((lon + 540) % 360) - 180);
}
// where the pigeon is now, as [lon, lat]
function pigeonLL(r) {
  const pts = routePts(r), t = flightAt(r, r.lost ? r.lostAt : now()).t, i = pts.findIndex((p) => p.t >= t);
  if (i <= 0) { const p = pts[i < 0 ? pts.length - 1 : 0]; return [p.x, latOf(p.y)]; }
  const a = pts[i - 1], b = pts[i], f = (t - a.t) / Math.max(1, b.t - a.t);
  return [a.x + (b.x - a.x) * f, latOf(a.y + (b.y - a.y) * f)];
}
// Tap the pigeon: what it's doing right now
function birdTip(cv, bird) {
  const tip = $(".birdtip", $layer); if (!tip) return;
  const r = bird.r, f = flightAt(r, r.lost ? r.lostAt : now()), [lon, lat] = pigeonLL(r), left = r.deliverAt - now();
  const who = r.from && r.from !== S.me.id ? `${esc(first(friend(r.from)?.name || member(group(r.gid || S.chat), r.from)?.name || "A friend"))}’s pigeon` : `${KIND[kindOf(r)]?.name || "Your"} pigeon`;
  const rest = !r.lost && restingOn(r), REST = { h: "Sheltering", i: "Resting", t: "Taking a breather", b: "Waiting for a ship", sail: "At sea", v: "On a stopover" };
  const state = r.recalled ? "Called back" : r.lost ? "Lost on the way" : f.phase === "landed" ? `Landed ${fmtShort(r.deliverAt)}` : rest ? REST[rest[2]] || "Resting"
    : `${f.phase === "up" ? "Taking off · " : f.phase === "down" ? "Landing · " : ""}${fmtMph(f.kmh)}`;
  tip.innerHTML = `<b>${pgm(r)}<span>${who}</span></b><span>${state}</span><span>${r.recalled ? "Turned back over" : r.lost ? "Lost" : f.phase === "landed" ? "At" : rest?.[2] === "sail" ? "Crossing" : "Over"} ${esc(overWhere(lon, lat))}</span>${!r.lost && left > 0 ? `<span class="eta"><span data-eta="${esc(r.deliverAt)}">${fmtDur(left)}</span> to go</span>` : ""}`;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight, [x, y] = bird.at;
  tip.style.left = `${Math.max(8, Math.min(cv.clientWidth - w - 8, x - w / 2))}px`; tip.style.top = `${y - h - 26 < 8 ? y + 26 : y - h - 26}px`;
  tip.classList.remove("pop"); void tip.offsetWidth; tip.classList.add("pop");
  clearTimeout(birdTip.t); birdTip.t = setTimeout(() => { tip.hidden = true; }, 6000);
}

/* ---------- the wind map: the wind everywhere, as drifting trails ---------- */
const windOn = () => { try { return localStorage.getItem("inflight-windmap") !== "0"; } catch (_) { return true; } };
// the wind (km/h east, north) anywhere in the grid, blended from the four points around it
function windAt(gr, lon, lat) {
  const span = (gr.cols - 1) * gr.step;
  let x = (lon - gr.w) / gr.step;
  if (span >= 359.9) x = ((x % (gr.cols - 1)) + (gr.cols - 1)) % (gr.cols - 1);
  else { let l = lon; while (l < gr.w) l += 360; while (l > gr.w + span) l -= 360; x = (l - gr.w) / gr.step; if (x < 0 || x > gr.cols - 1) return null; }
  const y = (lat - gr.s) / gr.step; if (y < 0 || y > gr.rows - 1) return null;
  const i = Math.min(gr.cols - 2, Math.floor(x)), j = Math.min(gr.rows - 2, Math.floor(y)), fx = x - i, fy = y - j, at = (a, jj, ii) => a[jj * gr.cols + ii];
  const mix = (a) => (at(a, j, i) * (1 - fx) + at(a, j, i + 1) * fx) * (1 - fy) + (at(a, j + 1, i) * (1 - fx) + at(a, j + 1, i + 1) * fx) * fy;
  return [mix(gr.u), mix(gr.v)];
}
// What part of the world is showing (sampled across the screen), so the right grid is asked for.
function viewBox(cv) {
  const W = cv.clientWidth, H = cv.clientHeight; let s = 90, n = -90, w = 1e9, e = -1e9, any = false;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 10; j++) {
    const ll = cv._inv((W * i) / 8, (H * j) / 10); if (!ll) continue; any = true;
    s = Math.min(s, ll[1]); n = Math.max(n, ll[1]); w = Math.min(w, ll[0]); e = Math.max(e, ll[0]);
  }
  if (!any) return null;
  // a pole in sight (on the globe), or most of the way round: the whole width of the world
  const pole = (lat) => { const p = cv._fwd(0, lat); return !!p && cv._area(p[0], p[1]); };
  if (pole(89.9) || pole(-89.9) || e - w > 300) { w = Math.min(w, (w + e) / 2 - 180); e = w + 360; if (pole(89.9)) n = 84; if (pole(-89.9)) s = -84; }
  return { s: Math.max(-84, s), n: Math.min(84, n), w, e };
}
let windTimer = 0;
function windEnsure(cv) {
  if (!windOn()) return;                          // (a pigeon's own storm is drawn without it)
  const b = viewBox(cv); if (!b) return;
  const g = S.windGrid, ideal = Math.max(b.n - b.s, b.e - b.w) / 15;
  if (g) {
    const gn = g.s + (g.rows - 1) * g.step, ge = g.w + (g.cols - 1) * g.step, full = ge - g.w >= 359.9;
    const shift = full ? 0 : 360 * Math.round((g.w + ge - b.w - b.e) / 720);
    if (b.s >= g.s && b.n <= gn && (full || (b.w + shift >= g.w && b.e + shift <= ge)) && g.step <= Math.max(0.25, ideal) * 2.6 && (g.step >= ideal / 2.6 || g.step <= 0.25)) return;
  }
  // (a map redrawn every frame, as while a pigeon takes off, mustn't keep putting the ask off)
  const q = `s=${b.s.toFixed(2)}&n=${b.n.toFixed(2)}&w=${b.w.toFixed(2)}&e=${b.e.toFixed(2)}`;
  if (windTimer && S.windWant === q) return;
  S.windWant = q;
  clearTimeout(windTimer);
  windTimer = setTimeout(async () => {
    windTimer = 0;
    if (S.windAsk === q) return;
    S.windAsk = q;
    try { S.windGrid = await api("wind-grid?" + q); const c = $(".map", $layer); if (c) { c._parts = null; smoothMap({ lost: true }); } } catch (_) { /* no wind map this time */ }
    S.windAsk = null;
  }, 300);
}
// Move each speck along the wind and draw its step on the trail layer (which fades a little every frame).
function stepWind(cv, ts) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, gr = S.windGrid;
  const tc = cv._trail || (cv._trail = document.createElement("canvas"));
  if (tc.width !== cv.width || tc.height !== cv.height) { tc.width = cv.width; tc.height = cv.height; cv._trailKey = null; }
  const t = tc.getContext("2d");
  if (cv._trailKey !== cv._viewKey || cv._trailGrid !== gr) { t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, tc.width, tc.height); cv._trailKey = cv._viewKey; cv._trailGrid = gr; cv._parts = null; cv._wts = 0; }
  const still = STILL.matches, dt = still ? 16 : Math.min(50, ts - (cv._wts || ts - 16)); cv._wts = ts;
  if (still && cv._parts) return true;                       // reduced motion: one still frame of short strokes
  const spawn = (p) => {
    for (let tries = 0; tries < 8; tries++) {
      const x = Math.random() * W, y = Math.random() * H; if (!cv._area(x, y)) continue;
      const ll = cv._inv(x, y); if (!ll) continue;
      p.lon = ll[0]; p.lat = ll[1]; p.age = 0; p.max = 110 + Math.random() * 170; return p;
    }
    p.age = 1e9; return p;
  };
  if (!cv._parts) { const n = Math.round(Math.max(500, Math.min(1700, (W * H) / 120))); cv._parts = Array.from({ length: n }, () => { const p = spawn({}); p.age = Math.random() * p.max; return p; }); }
  t.setTransform(1, 0, 0, 1, 0, 0);
  if (!still) { t.globalCompositeOperation = "destination-out"; t.fillStyle = `rgba(0,0,0,${Math.min(0.25, 0.045 * dt / 16)})`; t.fillRect(0, 0, tc.width, tc.height); t.globalCompositeOperation = "source-over"; }
  t.setTransform(dpr, 0, 0, dpr, 0, 0); t.lineCap = "round"; t.lineWidth = 1.1;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const rgb = dark ? "235,244,255" : "24,64,140", buckets = [[], [], [], []];
  for (const p of cv._parts) {
    if (p.age++ > p.max) spawn(p);
    const w = p.age < 1e8 && windAt(gr, p.lon, p.lat); if (!w) { spawn(p); continue; }
    const sp = Math.hypot(w[0], w[1]); if (sp < 0.5) { p.age += 4; continue; }
    const len = (still ? 9 : (0.12 + sp * 0.013) * dt / 16) / cv._kArc(p.lat), cl = Math.max(0.05, Math.cos(p.lat * Math.PI / 180));
    const nlat = p.lat + (w[1] / sp) * len, nlon = p.lon + ((w[0] / sp) * len) / cl;
    const a = cv._fwd(p.lon, p.lat), b = cv._fwd(nlon, nlat);
    if (!a || !b || !cv._area(b[0], b[1]) || Math.abs(b[0] - a[0]) > 40) { spawn(p); continue; }
    buckets[Math.min(3, Math.floor(sp / 15))].push(a[0], a[1], b[0], b[1]);
    p.lon = nlon; p.lat = nlat;
  }
  buckets.forEach((seg, i) => {
    if (!seg.length) return;
    t.strokeStyle = `rgba(${rgb},${[0.22, 0.34, 0.48, 0.62][i]})`; t.beginPath();
    for (let k = 0; k < seg.length; k += 4) { t.moveTo(seg[k], seg[k + 1]); t.lineTo(seg[k + 2], seg[k + 3]); }
    t.stroke();
  });
  return true;
}
// Tap the map: the wind there, which way it blows from and how hard
function windTip(cv, x, y) {
  const tip = $(".windtip", $layer), gr = S.windGrid; if (!tip || !windOn() || !gr) return;
  const ll = cv._inv(x, y), w = ll && windAt(gr, ll[0], ll[1]); if (!w) return;
  const sp = Math.hypot(w[0], w[1]), from = (Math.atan2(w[0], w[1]) * R2D + 540) % 360;
  tip.innerHTML = `<small>${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(from / 45) % 8]}</small><b>${Math.round(sp * 0.621371)}</b><small>mph</small>`;
  tip.style.left = `${x - 34}px`; tip.style.top = `${y - 34}px`; tip.hidden = false; tip.classList.remove("pop"); void tip.offsetWidth; tip.classList.add("pop");
  clearTimeout(windTip.t); windTip.t = setTimeout(() => { tip.hidden = true; }, 4000);
}
// Wind: short streaks drifting beside the route, with the pigeon for a
// tailwind (green), against it for a headwind (orange); faster the stronger it blew.
/* ---------- the rain radar ----------
   How hard it's raining, coloured like a weather radar: light blue drizzle,
   blue and purple rain, orange and yellow cloudbursts. The real rain (a coarse
   grid from Open-Meteo, with the wind map) is given a radar's grain by a
   streaky noise that drifts slowly; the storm that held a pigeon up always
   shows, as an intense cell. Worked out at a third of the screen's resolution
   and smoothed up, a few times a second. */
const RAIN_K = { storms: 16, rain: 8, snow: 4 };      // how hard (mm an hour) at the heart of a pigeon's weather
const RAMP = [[0.15, 80, 170, 255, 0], [0.4, 70, 150, 255, 0.42], [1.2, 60, 105, 245, 0.55], [2.6, 112, 78, 232, 0.62], [5, 170, 62, 205, 0.68],
  [8.5, 226, 82, 150, 0.74], [13, 255, 132, 62, 0.8], [20, 255, 206, 58, 0.86], [30, 255, 246, 140, 0.9]];
const RAMP_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const mm = 0.1 * Math.pow(400, i / 255);                // 0.1 to 40 mm an hour, on a log scale
    let j = 0; while (j < RAMP.length - 2 && mm > RAMP[j + 1][0]) j++;
    const [a, b] = [RAMP[j], RAMP[j + 1]], f = Math.max(0, Math.min(1, (Math.log(mm) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]))));
    for (let c = 0; c < 4; c++) lut[i * 4 + c] = (c < 3 ? a[c + 1] + (b[c + 1] - a[c + 1]) * f : 255 * (a[4] + (b[4] - a[4]) * f));
  }
  return lut;
})();
// value noise: smooth, repeatable, cheap
const nHash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = nHash(xi, yi), b = nHash(xi + 1, yi), c = nHash(xi, yi + 1), d = nHash(xi + 1, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
// streaky radar grain: bands running south-west to north-east, warped so they wander
function rainGrain(lon, lat, t) {
  const u = lon * 0.82 + lat * 0.57, v = -lon * 0.57 + lat * 0.82;          // turned 35°
  let x = u * 1.1 + t * 0.03, y = v * 3.2 - t * 0.012;                        // stretched along the bands
  const wx = vnoise(x * 0.5 + 7.1, y * 0.5) - 0.5, wy = vnoise(x * 0.5, y * 0.5 + 3.3) - 0.5;
  x += wx * 2.2; y += wy * 2.2;
  const fine = vnoise(x, y) * 0.55 + vnoise(x * 2.3 + 1.7, y * 2.3) * 0.3 + vnoise(x * 5.1, y * 5.1 + 9.2) * 0.15;
  // and big bands and gaps, a few hundred kilometres across, so it isn't even all over
  const big = vnoise(u * 0.32 + 5.3 + t * 0.008, v * 0.75 + 1.1);
  return fine * 0.62 + big * 0.58;
}
function gridAt(gr, a, lon, lat) {
  const span = (gr.cols - 1) * gr.step;
  let x = (lon - gr.w) / gr.step;
  if (span >= 359.9) x = ((x % (gr.cols - 1)) + (gr.cols - 1)) % (gr.cols - 1);
  else { let l = lon; while (l < gr.w) l += 360; while (l > gr.w + span) l -= 360; x = (l - gr.w) / gr.step; if (x < 0 || x > gr.cols - 1) return 0; }
  const y = (lat - gr.s) / gr.step; if (y < 0 || y > gr.rows - 1) return 0;
  const i = Math.min(gr.cols - 2, Math.floor(x)), j = Math.min(gr.rows - 2, Math.floor(y)), fx = x - i, fy = y - j, at = (jj, ii) => a[jj * gr.cols + ii];
  return (at(j, i) * (1 - fx) + at(j, i + 1) * fx) * (1 - fy) + (at(j + 1, i) * (1 - fx) + at(j + 1, i + 1) * fx) * fy;
}
const radarCells = (cv) => (cv._wx || []).filter((w) => RAIN_K[w.k]);
function radarWanted(cv) { return radarCells(cv).length > 0 || (windOn() && S.windGrid?.p?.some((v) => v >= 0.2)); }
function drawRadar(g, cv, ts, xf) {
  const want = !!cv._inv && radarWanted(cv);
  if (!want) return;
  const W = cv.clientWidth, H = cv.clientHeight, ST = 3, cw = Math.ceil(W / ST), ch = Math.ceil(H / ST);
  const off = cv._radar || (cv._radar = document.createElement("canvas"));
  const t = STILL.matches ? 0 : ts / 1000;
  // drawn afresh when the view, the rain or (four times a second) the drift changes; while the map moves, the last one moves with it
  const key = `${cv._viewKey}|${S.windGrid?.hour ?? ""}|${(cv._wx || []).length}`;
  if (!xf && (key !== cv._radarKey || (!STILL.matches && ts - (cv._radarAt || 0) > 250))) {
    cv._radarKey = key; cv._radarAt = ts;
    if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
    const oc = off.getContext("2d"), img = oc.createImageData(cw, ch), px = img.data, gr = windOn() ? S.windGrid : null, gp = gr?.p;
    const cells = radarCells(cv).map((w) => ({ lat: w.lat, lon: w.lon, peak: RAIN_K[w.k], cl: Math.cos(w.lat * Math.PI / 180) }));
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = i * ST + ST / 2, y = j * ST + ST / 2; if (!cv._area(x, y)) continue;
      const ll = cv._inv(x, y); if (!ll) continue;
      const [lon, lat] = ll;
      let mm = gp ? gridAt(gr, gp, lon, lat) : 0;
      for (const c of cells) {
        // a long cell along the bands, ~300 km by ~120 km
        const dx = (lon - c.lon) * c.cl * 111, dy = (lat - c.lat) * 111, a = dx * 0.82 + dy * 0.57, b = -dx * 0.57 + dy * 0.82;
        mm = Math.max(mm, c.peak * Math.exp(-((a / 150) ** 2 + (b / 60) ** 2)));
      }
      if (mm < 0.12) continue;
      const n = rainGrain(lon, lat, t), v = mm * Math.max(0, n - 0.5) ** 1.25 * 4.2;
      if (v < 0.15) continue;
      const li = Math.max(0, Math.min(255, Math.round(255 * Math.log(v / 0.1) / Math.log(400)))) * 4, o = (j * cw + i) * 4;
      px[o] = RAMP_LUT[li]; px[o + 1] = RAMP_LUT[li + 1]; px[o + 2] = RAMP_LUT[li + 2]; px[o + 3] = RAMP_LUT[li + 3];
    }
    oc.putImageData(img, 0, 0);
  }
  if (!off.width) return;
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  if (xf) g.setTransform(xf.a * (cv._dpr || 1), 0, 0, xf.a * (cv._dpr || 1), xf.bx * (cv._dpr || 1), xf.by * (cv._dpr || 1));
  g.drawImage(off, 0, 0, cw * ST, ch * ST);
  g.restore();
}

// The weather that's holding a pigeon up, drawn where it is: a cloud with rain
// falling, a storm cloud that flashes, drifting snow, banks of fog, or gusts.
const WX_SKY = { storms: ["#596072", 0.7, "Storms"], hail: ["#4f5668", 0.75, "Hail"], icing: ["#d6e2ee", 0.82, "Ice"], rain: ["#8a95a8", 0.6, "Heavy rain"], snow: ["#dfe5ee", 0.85, "Snow"], fog: ["#e4e7ec", 0.78, "Fog"], gales: ["#a9b1bf", 0.5, "Gales"], ash: ["#6e6660", 0.8, "Ash"], smoke: ["#a8978a", 0.62, "Smoke"] };
function wxCells(routes) {
  const held = routes.filter((r) => !r.here && !r.lost && r.wx && WX_SKY[r.wx.k] && r.delay > 0 && now() < r.deliverAt).map((r) => ({ k: r.wx.k, lat: r.wx.lat, lon: r.wx.lon }));
  // and the storms it went around (planned, or turning for them on the way), while it's flying
  const dodged = routes.filter((r) => !r.here && !r.lost && now() < r.deliverAt).flatMap((r) => (r.legs || []).filter((l) => l[5]?.storm).map((l) => ({ k: l[5].k || "storms", lat: l[5].storm[0], lon: l[5].storm[1] })));
  // (one cloud for the same weather: what held it up and what it went around are often the same storms, a little apart)
  return [...held, ...dodged].filter((c, i, a) => a.findIndex((x) => Math.abs(x.lat - c.lat) < 1 && Math.abs(x.lon - c.lon) < 1.4 / Math.max(0.3, Math.cos(c.lat * Math.PI / 180))) === i)
    .map((c) => ({ ...c, seed: (Math.abs(c.lat * 7 + c.lon * 13) % 10) }));
}
function drawWx(g, cv, ts, xf) {
  const t = STILL.matches ? 0 : ts / 1000;
  for (const w of cv._wx || []) {
    let p = cv._fwd?.(w.lon, w.lat); if (!p) continue;
    let R = Math.max(34, Math.min(100, cv._kArc(w.lat) * 1.6));
    if (xf) { p = [xf.a * p[0] + xf.bx, xf.a * p[1] + xf.by]; R *= xf.a; }
    const [x, y] = p, [c, a, label] = WX_SKY[w.k];
    if (x < -2 * R || y < -2 * R || x > cv.clientWidth + 2 * R || y > cv.clientHeight + 2 * R) continue;
    g.save();
    const radar = !!RAIN_K[w.k];                           // (rain, storms and snow are on the radar)
    // what falls from it
    if (radar) { /* the radar draws it */ } else if (w.k === "rain" || w.k === "storms" || w.k === "hail") {
      g.strokeStyle = w.k === "rain" ? "#5b8fd6" : "#4f7fc4"; g.lineWidth = Math.max(1, R / 40); g.lineCap = "round";
      for (let i = 0; i < 16; i++) {
        const ph = ((t * 1.5 + i * 0.381 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.8 + (i / 15) * 1.6 + Math.sin(i * 7.3) * 0.06;
        const xx = x + dx * R * 0.75, yy = y + R * 0.38 + ph * R * 0.8, len = R * 0.15;
        g.globalAlpha = 0.75 * Math.sin(Math.PI * ph);
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx - len * 0.3, yy + len); g.stroke();
      }
    } else if (w.k === "ash" || w.k === "smoke") {
      // ash: grey grit drifting down; smoke: embers rising from the fire beneath it
      const up = w.k === "smoke";
      g.fillStyle = up ? "#ff8a3d" : "#4a4440";
      for (let i = 0; i < 14; i++) {
        const ph = ((t * (up ? 0.45 : 0.25) + i * 0.31 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.8 + (i / 13) * 1.6;
        const xx = x + dx * R * 0.7 + Math.sin(t * 1.1 + i) * R * 0.05, yy = up ? y + R * 1.05 - ph * R * 0.75 : y + R * 0.38 + ph * R * 0.8;
        g.globalAlpha = 0.85 * Math.sin(Math.PI * ph);
        g.beginPath(); g.arc(xx, yy, Math.max(1.2, R / (up ? 30 : 36)), 0, 7); g.fill();
      }
    } else if (w.k === "snow") {
      g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 0.8;
      for (let i = 0; i < 18; i++) {
        const ph = ((t * 0.32 + i * 0.29 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.85 + (i / 17) * 1.7;
        const xx = x + dx * R * 0.75 + Math.sin(t * 1.3 + i) * R * 0.06, yy = y + R * 0.38 + ph * R * 0.8;
        g.globalAlpha = Math.sin(Math.PI * ph);
        g.beginPath(); g.arc(xx, yy, Math.max(1.4, R / 34), 0, 7); g.fill(); g.stroke();
      }
    }
    // the cloud: soft puffs that drift a little
    if (radar) { /* none */ } else if (w.k !== "fog") {
      const flash = (w.k === "storms" || w.k === "hail") && (STILL.matches || ((t + w.seed) % 3.4) < 0.16);
      // one shape (puffs on a flat base), so it reads as a cloud, not a bunch of balls
      const puffs = [[-0.5, 0.02, 0.36], [-0.16, -0.2, 0.48], [0.24, -0.12, 0.42], [0.56, 0.06, 0.3]], shape = new Path2D();
      for (const [i, [px, py, pr]] of puffs.entries()) {
        const cx = x + px * R + Math.sin(t * 0.35 + i * 1.7) * R * 0.03, cy = y + py * R, rr = pr * R;
        shape.moveTo(cx + rr, cy); shape.arc(cx, cy, rr, 0, Math.PI * 2);
      }
      shape.moveTo(x - 0.78 * R, y + 0.05 * R); shape.roundRect ? shape.roundRect(x - 0.84 * R, y - 0.06 * R, 1.68 * R, 0.4 * R, 0.2 * R) : shape.rect(x - 0.84 * R, y - 0.06 * R, 1.68 * R, 0.4 * R);
      const grd = g.createLinearGradient(0, y - 0.7 * R, 0, y + 0.34 * R);
      grd.addColorStop(0, flash ? "#f4f5ff" : "#ffffff"); grd.addColorStop(0.45, flash ? "#d6d9ee" : c); grd.addColorStop(1, flash ? "#b9bdd6" : c);
      g.globalAlpha = a; g.shadowColor = "rgba(0,0,0,.22)"; g.shadowBlur = R * 0.18; g.shadowOffsetY = R * 0.06;
      g.fillStyle = grd; g.fill(shape, "nonzero");
      g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
      if (flash) {                                           // lightning
        g.globalAlpha = 1; g.strokeStyle = "#ffd60a"; g.lineWidth = Math.max(2, R / 22); g.lineJoin = "round"; g.shadowColor = "#ffe680"; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(x + 0.08 * R, y + 0.3 * R); g.lineTo(x - 0.1 * R, y + 0.65 * R); g.lineTo(x + 0.08 * R, y + 0.65 * R); g.lineTo(x - 0.06 * R, y + 1.05 * R); g.stroke();
        g.shadowBlur = 0;
      }
      if (w.k === "gales") {                                // gusts curling past
        g.strokeStyle = "#7d8799"; g.lineWidth = Math.max(1.2, R / 32); g.lineCap = "round";
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 0.5 + i / 3) % 1 + 1) % 1, gx = x - R + ph * 2 * R, gy = y + (i - 1) * R * 0.32 + R * 0.35;
          g.globalAlpha = 0.8 * Math.sin(Math.PI * ph);
          g.beginPath(); g.moveTo(gx - R * 0.35, gy); g.lineTo(gx, gy); g.arc(gx, gy - R * 0.1, R * 0.1, Math.PI / 2, -Math.PI, true); g.stroke();
        }
      }
    } else {                                               // fog: low banks sliding past
      g.fillStyle = c;
      for (let i = 0; i < 4; i++) {
        const bw = R * (1.9 - i * 0.2), bx = x - bw / 2 + Math.sin(t * 0.4 + i * 1.9) * R * 0.25, by = y - R * 0.5 + i * R * 0.3;
        g.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 0.6 + i));
        g.shadowColor = "rgba(0,0,0,.12)"; g.shadowBlur = R * 0.1;
        g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, R * 0.22, R * 0.11) : g.rect(bx, by, bw, R * 0.22); g.fill();
        g.shadowColor = "transparent"; g.shadowBlur = 0;
      }
    }
    // what it is
    if (R >= 30) {
      g.globalAlpha = 1; g.font = "600 11px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      const ly = radar ? y + R * 1.1 : y + R * (w.k === "fog" ? 0.8 : 1.3);
      g.lineWidth = 4; g.strokeStyle = cv._wxHalo || "#fff"; g.strokeText(label, x, ly); g.fillStyle = cv._wxText || "#555"; g.fillText(label, x, ly);
    }
    g.restore();
  }
}
function drawWind(g, cv, ts) {
  for (const { P, cum, L, wind, seed } of cv._winds || []) {
    if (L < 40) continue;
    const v = (18 + Math.min(80, Math.abs(wind)) * 0.9) * Math.sign(wind), gap = 46, n = Math.ceil(L / gap);
    g.save(); g.strokeStyle = cv._windCol[wind > 0 ? 0 : 1]; g.lineCap = "round"; g.lineWidth = 1.6;
    for (const lane of [-11, 11]) for (let k = 0; k < n; k++) {
      const d = ((k * gap + (lane > 0 ? gap / 2 : 0) + seed + (ts / 1000) * v) % L + L) % L;
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), ax = P[i][0] - P[i - 1][0], ay = P[i][1] - P[i - 1][1], len = Math.hypot(ax, ay) || 1;
      const ux = ax / len, uy = ay / len, x = P[i - 1][0] + ax * f - uy * lane, y = P[i - 1][1] + ay * f + ux * lane;
      g.globalAlpha = 0.5 * Math.sin(Math.PI * (d / L)) ** 0.5;        // fading in and out at the ends
      g.beginPath(); g.moveTo(x - ux * 7, y - uy * 7); g.lineTo(x + ux * 7, y + uy * 7); g.stroke();
    }
    g.restore();
  }
}
// The pigeon, with its wing at w (1 up, 0 folded down to its back): the wing's
// points are drawn toward the body line, so it flaps.
const WING = [[12.6, 3.6], [14.4, 3], [15.6, 4], [15.4, 5.8]];
const birdAt = (w) => {
  const y = (v) => (10.4 - (10.4 - v) * w).toFixed(2), [a, b, c, d] = WING;
  return new Path2D(`M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L${a[0]} ${y(a[1])}C${b[0]} ${y(b[1])} ${c[0]} ${y(c[1])} ${d[0]} ${y(d[1])}L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z`);
};
const STILL = matchMedia("(prefers-reduced-motion: reduce)");
let cheerFx = null;                          // { id, at }: a pigeon just cheered on, for its gust on the map
// Draw the pigeons over the saved map: flapping in cruise, faster taking off
// and landing, folded once landed; tilted the way they're heading.
function drawBirds(cv, ts, xf) {
  const g = cv.getContext("2d"), dpr = cv._dpr || window.devicePixelRatio || 1;
  if (!cv._base || !cv._birds) return;
  if (xf) {
    // the last full picture, moved and scaled to where the map is now
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = cv._seaCol || "#000"; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true; g.setTransform(xf.a, 0, 0, xf.a, xf.bx * dpr, xf.by * dpr); g.drawImage(cv._base, 0, 0);
  } else {
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv._base, 0, 0);
    if (windOn() && S.windGrid && !mapMoving() && stepWind(cv, ts)) g.drawImage(cv._trail, 0, 0);     // (the wind waits while the map moves)
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRadar(g, cv, ts, xf);
  drawWx(g, cv, ts, xf);
  if (!xf) drawWind(g, cv, STILL.matches ? 0 : ts);
  for (const { r, at: [px0, py0], dx, dy, phase, color } of cv._birds) {
    const px = xf ? xf.a * px0 + xf.bx : px0, py = xf ? xf.a * py0 + xf.by : py0;
    const flying = phase === "up" || phase === "cruise" || phase === "down", hz = phase === "cruise" ? 2.2 : 5;
    const w = !flying ? 0.45 : STILL.matches ? 1 : 0.62 + 0.38 * Math.sin((ts / 1000) * hz * 2 * Math.PI + (r.deliverAt % 997));
    const bob = flying && !STILL.matches ? Math.sin((ts / 1000) * hz * 2 * Math.PI + (r.deliverAt % 997) - 1.2) * 1.2 : 0;
    const flip = dx > 0 ? -1 : 1;                                 // the icon faces left; turn it the way it's flying
    const tilt = flying ? Math.max(-0.35, Math.min(0.35, Math.atan2(dy, Math.abs(dx) || 1))) * -flip : 0;   // nose up or down with its course
    // at sea on a ship: the ship under it, rocking a little
    if (phase === "sail") {
      const rock = STILL.matches ? 0 : Math.sin(ts / 700 + (r.deliverAt % 97)) * 0.06;
      g.save(); g.translate(px, py + 13); g.rotate(rock); g.fillStyle = "#3a3f4a"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.lineJoin = "round";
      g.beginPath(); g.moveTo(-17, -4); g.lineTo(17, -4); g.lineTo(12, 5); g.lineTo(-12, 5); g.closePath(); g.stroke(); g.fill();
      g.fillStyle = "#e14b3b"; g.fillRect(-9, -9, 6, 5); g.fillStyle = "#3d9bff"; g.fillRect(-2, -9, 6, 5); g.fillStyle = "#f2b33d"; g.fillRect(5, -9, 6, 5);   // (its containers)
      g.restore();
    }
    g.save(); g.translate(px, py + bob - (phase === "sail" ? 10 : 0)); g.rotate(-tilt); g.scale(1.6 * flip, 1.6); g.translate(-12, -11);
    const bird = birdAt(w);
    g.lineWidth = r.skin && SKINS[r.skin] ? 4 : 3; g.strokeStyle = SKINS[r.skin]?.ring || "#fff"; g.stroke(bird); g.fillStyle = color; g.fill(bird);   // the pigeon in its colour (grey where it was lost)
    g.restore();
    // just cheered on: a gust of tailwind streams past it
    const fx = cheerFx && cheerFx.id === S.sheet?.id ? (ts - cheerFx.at) / 1600 : 1;
    if (flying && fx >= 0 && fx < 1 && !STILL.matches) {
      const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
      g.save(); g.lineCap = "round"; g.lineWidth = 2.5;
      for (let k = -1; k <= 1; k++) {
        const o = ((fx * 3 + (k + 1) * 0.33) % 1), back = 16 + o * 34, side = k * 9;
        g.strokeStyle = `rgba(255,159,10,${(0.85 * (1 - fx) * (1 - o)).toFixed(3)})`;
        g.beginPath(); g.moveTo(px - ux * back - uy * side, py - uy * back + ux * side); g.lineTo(px - ux * (back + 16) - uy * side, py - uy * (back + 16) + ux * side); g.stroke();
      }
      g.restore();
    }
  }
}
// A near miss on the map: a little four-pointed spark
function sparkAt(g, x, y, edge, fill) {
  g.save(); g.translate(x, y);
  const star = (r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.38 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
  g.lineJoin = "round"; g.lineWidth = 4; g.strokeStyle = edge; star(9); g.stroke(); g.fillStyle = fill; star(9); g.fill();
  g.restore();
}
/* ---------- the globe: long flights curve round the Earth ---------- */
const GLOBE_KM = 3000;
const globeOn = (m) => S.sheet?.globe ?? Math.max(0, ...routesOf(m).filter((r) => !r.here).map((r) => r.km || 0)) >= GLOBE_KM;
const latOf = (my) => 2 * Math.atan(Math.exp(my / R2D)) * R2D - 90;
// the middle of everything on the map, as a direction from the centre of the Earth
function globeFit(m) {
  let x = 0, y = 0, z = 0;
  for (const r of routesOf(m)) for (const p of routePts(r)) { const a = latOf(p.y) * Math.PI / 180, b = p.x * Math.PI / 180; x += Math.cos(a) * Math.cos(b); y += Math.cos(a) * Math.sin(b); z += Math.sin(a); }
  // looked at from a little below (towards the equator), so a long route arcs over the curve of the Earth
  const lat = Math.atan2(z, Math.hypot(x, y)) * R2D;
  return { lat: lat - Math.sign(lat || 1) * Math.min(24, Math.abs(lat) + 8), lon: Math.atan2(y, x) * R2D, s: 1, mid: lat };
}
function globeFrame(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight, usableH = Math.max(80, H - cardH - 30);
  const fit = globeFit(m), v = S.sheet?.gview || fit;
  return { W, H, cx: W / 2, cy: 20 + usableH / 2, R: Math.min(W * 0.48, usableH * 0.47) * v.s, v, fit };
}
function moveGlobe(cv, z, dx, dy) {
  const { R, v, fit } = globeFrame(cv, cv._m, cv._cardH);
  const s2 = Math.max(1, Math.min(10, v.s * z));
  // zooming in leans towards the route itself (the fit looks at it from a little below)
  const lean = z > 1 && s2 > v.s ? 0.6 * (1 - v.s / s2) : 0, dLon = ((fit.lon - v.lon + 540) % 360) - 180;
  S.sheet.gview = { lon: v.lon - (dx / R) * R2D + dLon * lean, lat: Math.max(-80, Math.min(80, v.lat + (dy / R) * R2D + (fit.mid - v.lat) * lean)), s: s2 };
  nudgeMap(cv);
}
function drawGlobe(cv, m, cardH, fast) {
  const { W, H, cx, cy, R, v } = globeFrame(cv, m, cardH); if (!W || !H) return;
  const dpr = cv._dprFix || (fast ? Math.min(1, window.devicePixelRatio || 1) : window.devicePixelRatio || 1);     // fewer pixels while it turns
  cv._dpr = dpr;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = (n) => cssVar(cv, n), rad = Math.PI / 180;
  // a little spin as it opens
  if (cv._spin == null || cv._spin === 0) cv._spin = STILL.matches || S.sheet?.gview ? -1 : performance.now();
  let lon0 = v.lon; const lat0 = v.lat;
  if (cv._spin > 0) { const p = Math.min(1, (performance.now() - cv._spin) / 1100); lon0 -= 40 * (1 - p) ** 3; if (p < 1) requestAnimationFrame(redrawMap); else cv._spin = -1; }
  const s0 = Math.sin(lat0 * rad), c0 = Math.cos(lat0 * rad);
  // orthographic: [x, y, in sight]; out of sight points go to the rim
  const proj = (lon, lat) => {
    const f = lat * rad, d = (lon - lon0) * rad, cf = Math.cos(f), cd = Math.cos(d);
    let x = cf * Math.sin(d), y = c0 * Math.sin(f) - s0 * cf * cd; const up = s0 * Math.sin(f) + c0 * cf * cd >= 0;
    if (!up) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; }
    return [cx + R * x, cy - R * y, up];
  };
  const pt = (lon, lat) => { const p = proj(lon, lat); return p[2] ? p : null; };
  const k = R * rad;                                                   // pixels per degree at the middle
  g.fillStyle = col("--bg") || col("--sea"); g.fillRect(0, 0, W, H);
  // the air around it
  const halo = g.createRadialGradient(cx, cy, R * 0.98, cx, cy, R + 18); halo.addColorStop(0, "rgba(90,160,255,.35)"); halo.addColorStop(1, "rgba(90,160,255,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R + 18, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  g.fillStyle = col("--sea"); g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // graticule
  g.strokeStyle = col("--grid"); g.lineWidth = 1;
  const curve = (pts) => { g.beginPath(); let on = false; for (const [lo, la] of pts) { const p = proj(lo, la); if (!p[2]) { on = false; continue; } on ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); on = true; } g.stroke(); };
  for (let lo = -180; lo < 180; lo += 30) curve(Array.from({ length: 61 }, (_, i) => [lo, -90 + i * 3]));
  for (let la = -60; la <= 60; la += 30) curve(Array.from({ length: 121 }, (_, i) => [-180 + i * 3, la]));
  // land (finer once it's big), with the coast's shallow water, and the mountains
  const want = R > 700 && !fast ? "50m" : "110m", data = world(want) || world("110m");
  g.beginPath();
  for (const sh of data.land) {
    const f = sh.f, lat = sh.lat || (sh.lat = Float32Array.from({ length: f.length / 2 }, (_, i) => latOf(f[i * 2 + 1])));
    let any = false; const P = [];
    for (let i = 0; i < f.length; i += 2) { const p = proj(f[i], lat[i / 2]); if (p[2]) any = true; P.push(p); }
    if (!any) continue;
    let lx = 1e9, ly = 1e9;
    P.forEach(([x, y], i) => { if (i && Math.abs(x - lx) + Math.abs(y - ly) < 0.7 && i < P.length - 1) return; i ? g.lineTo(x, y) : g.moveTo(x, y); lx = x; ly = y; });
    g.closePath();
  }
  if (!fast) {
    g.save(); g.lineJoin = "round"; g.strokeStyle = col("--shelf");
    for (const [w, a] of [[Math.min(16, 3 + k * 0.9), 0.5], [Math.min(8, 2 + k * 0.45), 1]]) { g.globalAlpha = a; g.lineWidth = w; g.stroke(); }
    g.restore();
  }
  g.fillStyle = col("--land"); g.fill("evenodd");
  if (!fast) { g.save(); g.clip("evenodd"); drawRelief(g, [pt], k, col("--relief-hi"), col("--relief-lo")); g.restore(); }
  g.strokeStyle = col("--land-edge"); g.lineWidth = 0.8; g.stroke();
  // night, on the sphere (left out while it's turning)
  const sun = sunAt(), sd = Math.sin(sun.lat * rad), sdc = Math.cos(sun.lat * rad);
  if (!fast) {
  const x0 = Math.floor(cx - R), y0 = Math.floor(cy - R), cw = Math.ceil((2 * R) / NIGHT_STEP) + 1;
  const off = drawGlobe.c || (drawGlobe.c = document.createElement("canvas"));
  if (off.width !== cw || off.height !== cw) { off.width = cw; off.height = cw; }
  const oc = off.getContext("2d"), img = oc.createImageData(cw, cw), px = img.data;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const [nr, ng, nb, top] = dark ? [0, 0, 0, 0.42] : [12, 26, 64, 0.26];
  for (let j = 0; j < cw; j++) for (let i = 0; i < cw; i++) {
    const x = (x0 + i * NIGHT_STEP - cx) / R, y = -(y0 + j * NIGHT_STEP - cy) / R, r2 = x * x + y * y; if (r2 > 1.02) continue;
    const z = Math.sqrt(Math.max(0, 1 - r2)), lat = Math.asin(z * s0 + y * c0), lon = lon0 * rad + Math.atan2(x, z * c0 - y * s0);
    const alt = Math.asin(Math.sin(lat) * sd + Math.cos(lat) * sdc * Math.cos(lon - sun.lon * rad)) / rad;
    const n = alt >= 0 ? 0 : alt <= -12 ? 1 : ((q) => q * q * (3 - 2 * q))(-alt / 12), o = (j * cw + i) * 4;
    px[o] = nr; px[o + 1] = ng; px[o + 2] = nb; px[o + 3] = Math.round(255 * top * n);
  }
  oc.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, x0, y0, cw * NIGHT_STEP, cw * NIGHT_STEP);
  }
  // light from the top left, shadow at the rim: it reads as a ball
  const shade = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  shade.addColorStop(0, "rgba(255,255,255,.10)"); shade.addColorStop(0.7, "rgba(255,255,255,0)"); shade.addColorStop(1, "rgba(0,0,0,.18)");
  g.fillStyle = shade; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // the sun where it's overhead
  const sp = pt(sun.lon, sun.lat), suns = [];
  if (sp) {
    suns.push([sp[0] - 15, sp[1] - 15, sp[0] + 15, sp[1] + 15]);
    g.save(); g.translate(sp[0], sp[1]); const gl = g.createRadialGradient(0, 0, 2, 0, 0, 22); gl.addColorStop(0, "rgba(255,204,0,.55)"); gl.addColorStop(1, "rgba(255,204,0,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.fillStyle = "#ffcc00"; g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = "#ffb800"; g.lineWidth = 1.6; g.lineCap = "round";
    for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s2 = Math.sin(a * Math.PI / 4); g.beginPath(); g.moveTo(c * 9, s2 * 9); g.lineTo(c * 12.5, s2 * 12.5); g.stroke(); }
    g.restore();
  }
  // the other ways (on The Way), faint; then the routes: solid where flown, dashed ahead; hidden round the back
  cv._altHits = drawAlts(g, m, (p) => proj(p.x, latOf(p.y)), W, H);
  const tracks = routesOf(m).map((r) => { const rp = routePts(r); const PP = rp.map((p) => proj(p.x, latOf(p.y))); return { r, rp, P: PP.map(([x, y]) => [x, y]), up: PP.map((p) => p[2]) }; });
  const seg = (P, up, a, b) => { g.beginPath(); let on = false; for (let i = a; i <= b; i++) { if (!up[i]) { on = false; continue; } on ? g.lineTo(P[i][0], P[i][1]) : g.moveTo(P[i][0], P[i][1]); on = true; } g.stroke(); };
  const lw = tracks.length > 1 ? 3 : 3.5, tint = col("--tint");
  g.lineCap = "round"; g.lineJoin = "round";
  for (const { r, rp, P, up } of tracks) {
    if (r.here) continue;
    const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft), cut = i < 0 ? P.length - 1 : Math.max(0, i - 1);
    if (i >= 0) { g.globalAlpha = r.lost ? 0.3 : 0.6; g.strokeStyle = tint; g.lineWidth = lw - 0.5; g.setLineDash([9, 8]); seg(P, up, cut, P.length - 1); }
    g.globalAlpha = 1; g.setLineDash([]);
    if (cut > 0) { g.lineWidth = lw + 1.5; g.strokeStyle = col("--cell"); seg(P, up, 0, cut); g.lineWidth = lw; g.strokeStyle = tint; seg(P, up, 0, cut); }
  }
  g.globalAlpha = 1;
  const ports = drawVoyages(g, tracks, col, lw, (P, a, b, up) => seg(P, up, a, b));
  for (const { r } of tracks) for (const n of r.near || []) { const p = proj(n.lon, n.lat); if (p[2]) sparkAt(g, p[0], p[1], col("--cell"), col("--orange")); }
  g.restore();                                                         // (out of the globe's clip)
  // ends and labels
  const birds = tracks.filter(({ r }) => !r.here).map(({ r, rp, P, up }) => { const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft); return { r, vis: up[i < 0 ? up.length - 1 : i], ...pigeonOn(P, rp, ft) }; }).filter((b) => b.vis);
  const taken = [...birds.map(({ at: [px, py] }) => [px - 24, py - 20, px + 24, py + 20]), [0, H - cardH, W, H], ...suns];
  const ctl = $(".mapctl", $layer);
  if (ctl) { const r = ctl.getBoundingClientRect(), c = cv.getBoundingClientRect(); taken.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]); }
  const free = (b) => b[0] >= 2 && b[2] <= W - 2 && b[1] >= 2 && b[3] <= H - 2 && !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  const text = (str, x, y, color) => { g.lineWidth = 4; g.strokeStyle = col("--land"); g.strokeText(str, x, y); g.fillStyle = color; g.fillText(str, x, y); };
  g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round"; g.font = "600 13px -apple-system, system-ui, sans-serif";
  const done = new Set();
  for (const { r, P, up } of tracks) for (const [i, j, name] of [[0, 4, r.fromPlace ?? m.fromPlace], [P.length - 1, P.length - 5, r.toPlace]]) {
    if (!up[i]) continue;
    const [x, y] = P[i], key = `${Math.round(x)},${Math.round(y)}`; if (done.has(key)) continue; done.add(key);
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = col("--tint"); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    taken.push([x - 9, y - 9, x + 9, y + 9]);
    if (!name) continue;
    const w = g.measureText(name).width, ly = y + ((P[Math.max(0, j)] || P[i])[1] <= y ? 28 : -28), lx = Math.min(W - 8 - w, Math.max(8, x - w / 2)), box = [lx - 3, ly - 10, lx + w + 3, ly + 10];
    if (!free(box)) continue; taken.push(box); text(name, lx, ly, col("--label"));
  }
  if (!fast) portLabels(g, ports, free, taken, text, col);
  cv._ports = ports.filter((p) => p.vis).map((p) => p.name);
  if (k >= 2.2 && !fast) {
    g.save(); g.font = "600 10px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = col("--label-3");
    const tier = k >= 9 ? 3 : k >= 4.5 ? 2 : 1;
    for (const [name, lat, lon, t] of COUNTRIES) {
      if (t > tier) continue; const p = pt(lon, lat); if (!p) continue;
      const label = name.toUpperCase().split("").join("\u200a"), w = g.measureText(label).width, box = [p[0] - w / 2 - 3, p[1] - 7, p[0] + w / 2 + 3, p[1] + 7];
      if (Math.hypot(p[0] - cx, p[1] - cy) > R * 0.92 || !free(box)) continue; taken.push(box); g.fillText(label, p[0], p[1]);
    }
    g.restore();
  }
  if (k >= 4 && !fast) {
    g.font = "500 11px -apple-system, system-ui, sans-serif"; const c2 = col("--label-2");
    for (const [name, lat, lon] of PLACES) {
      if (done.has(name)) continue; const p = pt(lon, lat); if (!p || Math.hypot(p[0] - cx, p[1] - cy) > R * 0.95) continue;
      const w = g.measureText(name).width, box = [p[0] - 4, p[1] - 8, p[0] + 8 + w, p[1] + 8]; if (!free(box)) continue;
      taken.push(box); g.fillStyle = c2; g.beginPath(); g.arc(p[0], p[1], 2.5, 0, 7); g.fill(); text(name, p[0] + 6, p[1], c2);
    }
  }
  // as the flat map: keep it without its pigeons, then draw them (and the wind) on top
  const base = cv._base || (cv._base = document.createElement("canvas"));
  if (base.width !== cv.width || base.height !== cv.height) { base.width = cv.width; base.height = cv.height; }
  base.getContext("2d").drawImage(cv, 0, 0);
  cv._birds = birds.map((b) => ({ ...b, phase: birdPhase(b.r), color: b.r.lost ? col("--label-3") : col("--p-" + kindOf(b.r)) }));
  cv._snap = { globe: true, lon: lon0, lat: lat0, R }; cv._seaCol = col("--bg") || col("--sea");
  cv._fwd = (lon, lat) => { const p = proj(lon, lat); return p[2] ? [p[0], p[1]] : null; };
  cv._inv = (x, y) => {
    const a = (x - cx) / R, b = -(y - cy) / R, r2 = a * a + b * b; if (r2 > 1) return null;
    const z = Math.sqrt(1 - r2); return [lon0 + Math.atan2(a, z * c0 - b * s0) / rad, Math.asin(z * s0 + b * c0) / rad];
  };
  cv._kArc = () => R * rad;
  cv._viewKey = `g${lon0.toFixed(3)},${lat0.toFixed(3)},${R.toFixed(2)},${W},${H}`;
  cv._area = (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= R * R * 0.995 && x >= 0 && x <= W && y >= 0 && y <= H;
  if (!fast) windEnsure(cv);
  cv._winds = windOn() ? [] : tracks.filter(({ r, up }) => !r.here && !r.lost && r.wind != null && Math.abs(r.wind) >= 3 && now() < r.deliverAt && up.every(Boolean)).map(({ r, P }) => {
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, cum, L: cum[cum.length - 1], wind: r.wind, seed: r.deliverAt % 1000 };
  });
  cv._windCol = [col("--green") || "#34c759", col("--orange") || "#ff9500"];
  cv._wx = wxCells(tracks.map(({ r }) => r)); cv._wxText = col("--label-2"); cv._wxHalo = col("--land");
  drawBirds(cv, performance.now());
  $(".mapctl", $layer)?.classList.toggle("moved", !!S.sheet?.gview);
}
/* ---------- moving the map smoothly ---------- */
let mapMotionUntil = 0, mapSettle = 0, mapFastReq = 0, mapGlide = 0;
const mapMoving = () => performance.now() < mapMotionUntil;
// Something moved it: quick frames now, the full map once it's been still a moment.
function nudgeMap(cv) {
  mapMotionUntil = performance.now() + 140;
  if (!mapFastReq) mapFastReq = requestAnimationFrame(() => { mapFastReq = 0; if (S.sheet?.type === "map") fastFrame(cv); });
  clearTimeout(mapSettle);
  mapSettle = setTimeout(function settle() { if (mapMoving()) { mapSettle = setTimeout(settle, 60); return; } redrawMap(); }, 150);
}
function fastFrame(cv) {
  if (!cv._base || !cv._m) return;
  if (globeOn(cv._m)) return drawGlobe(cv, cv._m, cv._cardH, true);
  if (cv._snap?.globe) return redrawMapNow(cv);
  const { W, sy0, view } = mapFrame(cv, cv._m, cv._cardH), ox = W / 2 - view.cx * view.k, oy = sy0 + view.cy * view.k, s0 = cv._snap;
  const a = view.k / s0.k;
  if (a > 3 || a < 0.33) return redrawMapNow(cv);           // too far from the last full picture: draw it again
  drawBirds(cv, performance.now(), { a, bx: ox - s0.ox * a, by: oy - s0.oy * a });
}
function redrawMapNow(cv) { const until = mapMotionUntil; mapMotionUntil = 0; drawMap(cv, cv._m, cv._cardH); mapMotionUntil = until; }
// Glide: run step(e, prev) with e easing 0 → 1 over ms (zoom buttons, double tap, fit, flicks)
function glideMap(step, ms = 300) {
  cancelAnimationFrame(mapGlide);
  if (STILL.matches) { step(1, 0); return; }
  const t0 = performance.now(); let prev = 0;
  const run = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - (1 - p) ** 3; step(e, prev); prev = e; if (p < 1) mapGlide = requestAnimationFrame(run); };
  mapGlide = requestAnimationFrame(run);
}
function zoomMapBy(cv, factor, sx, sy) { const L = Math.log(factor); glideMap((e, prev) => moveMap(cv, Math.exp(L * (e - prev)), sx, sy), 280); }
// Back to the whole route, gliding there
function fitMap(cv) {
  if (globeOn(cv._m)) {
    const { v, fit } = globeFrame(cv, cv._m, cv._cardH); if (!S.sheet.gview) return;
    const dLon = ((fit.lon - v.lon + 540) % 360) - 180;
    glideMap((e) => { S.sheet.gview = e >= 1 ? null : { lon: v.lon + dLon * e, lat: v.lat + (fit.lat - v.lat) * e, s: Math.exp(Math.log(v.s) + (Math.log(fit.s) - Math.log(v.s)) * e) }; e >= 1 ? redrawMap() : nudgeMap(cv); }, 420);
    return;
  }
  const { view, fit } = mapFrame(cv, cv._m, cv._cardH); if (!S.sheet.view) return;
  glideMap((e) => { S.sheet.view = e >= 1 ? null : { cx: view.cx + (fit.cx - view.cx) * e, cy: view.cy + (fit.cy - view.cy) * e, k: Math.exp(Math.log(view.k) + (Math.log(fit.k) - Math.log(view.k)) * e) }; e >= 1 ? redrawMap() : nudgeMap(cv); }, 420);
}
let mapFrameReq = 0;
function redrawMap() {
  if (mapFrameReq) return;
  mapFrameReq = requestAnimationFrame(() => { mapFrameReq = 0; const cv = $(".map", $layer); if (cv && cv._m && S.sheet?.type === "map") drawMap(cv, cv._m, cv._cardH); });
}
// Move the map: zoom by `z` about screen point (sx, sy), then pan by (dx, dy) pixels.
function moveMap(cv, z, sx, sy, dx = 0, dy = 0) {
  if (!cv._m || S.sheet?.type !== "map") return;
  if (globeOn(cv._m)) return moveGlobe(cv, z, dx, dy);
  const { W, sy0, fit, view, kMin, pts } = mapFrame(cv, cv._m, cv._cardH);
  const k = Math.max(kMin, Math.min(MAP_KMAX, view.k * z));
  const wx = view.cx + (sx - W / 2) / view.k, wy = view.cy - (sy - sy0) / view.k;
  let cx = wx - (sx - W / 2) / k - dx / k, cy = wy + (sy - sy0) / k + dy / k;
  const mid = (pts[0].x + pts[pts.length - 1].x) / 2, ymax = mercY(MERC_MAX) - (sy0 / k) * 0.5;
  cx = Math.max(mid - 300, Math.min(mid + 300, cx));
  cy = Math.max(-ymax, Math.min(ymax, cy));
  S.sheet.view = { cx, cy, k };
  if (Math.abs(k - fit.k) < 1e-6 && Math.abs(cx - fit.cx) < 1e-6 && Math.abs(cy - fit.cy) < 1e-6) S.sheet.view = null;
  nudgeMap(cv);
}
// Drag to pan, pinch or scroll to zoom, double-tap to zoom in.
function mapGestures(cv) {
  const pts = new Map(); let last = null, lastTap = 0, trail = [];
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const state = () => { const a = [...pts.values()]; if (a.length === 1) return { x: a[0][0], y: a[0][1], d: 0 };
    return { x: (a[0][0] + a[1][0]) / 2, y: (a[0][1] + a[1][1]) / 2, d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) }; };
  let down = null;
  // the map moves itself (pointer events): a finger on it never scrolls or zooms the page
  // (iPhone ignores touch-action: none, so say it with the touches themselves)
  cv.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  cv.addEventListener("pointerdown", (e) => {
    cancelAnimationFrame(mapGlide);                                // a finger stops a glide or a flick
    for (const el of $layer.querySelectorAll(".windtip, .birdtip")) el.hidden = true;
    cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, local(e)); last = state(); trail = [];
    down = pts.size === 1 ? { at: performance.now(), p: local(e), moved: 0 } : null;
    if (pts.size === 1) { const t = performance.now(); if (t - lastTap < 280) { const [x, y] = local(e); zoomMapBy(cv, 2, x, y); lastTap = 0; } else lastTap = t; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    // every point the finger passed through since the last frame (smoother on fast drags)
    const evs = e.getCoalescedEvents?.(), r = cv.getBoundingClientRect(), p = evs?.length ? evs[evs.length - 1] : e;
    pts.set(e.pointerId, [p.clientX - r.left, p.clientY - r.top]); const s = state();
    if (last && pts.size <= 2) {
      const z = pts.size === 2 && last.d && s.d ? s.d / last.d : 1;
      moveMap(cv, z, last.x, last.y, s.x - last.x, s.y - last.y);
      if (Math.abs(s.x - last.x) + Math.abs(s.y - last.y) > 6) lastTap = 0;
      if (down) down.moved += Math.abs(s.x - last.x) + Math.abs(s.y - last.y);
      if (pts.size === 1) { const t = e.timeStamp; trail.push([t, s.x, s.y]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift(); } else trail = [];
    }
    last = s;
  });
  const up = (e) => {
    pts.delete(e.pointerId); last = pts.size ? state() : null;
    if (pts.size) { trail = []; return; }
    // a flick: it carries on, slowing down
    const t = e.timeStamp, [t0, x0, y0] = trail[0] || [], [t1, x1, y1] = trail[trail.length - 1] || [];
    if (trail.length > 1 && t - t1 < 100 && t1 > t0) {
      let vx = (x1 - x0) / (t1 - t0), vy = (y1 - y0) / (t1 - t0);
      if (Math.hypot(vx, vy) > 0.25 && !STILL.matches) {
        let prevT = 0; cancelAnimationFrame(mapGlide);
        const run = (now2) => {
          const dt = prevT ? Math.min(40, Math.max(0, now2 - prevT)) : 16; prevT = now2;
          const f = Math.exp(-dt / 280); vx *= f; vy *= f;
          moveMap(cv, 1, 0, 0, vx * dt, vy * dt);
          if (Math.hypot(vx, vy) > 0.02) mapGlide = requestAnimationFrame(run);
        };
        mapGlide = requestAnimationFrame(run);
      }
    }
    trail = [];
    // a quick tap that didn't move (and isn't the first half of a double tap): the pigeon, or the wind there
    if (down && down.moved < 8 && performance.now() - down.at < 300) {
      const d = down, tap = lastTap;
      // one of the other ways' names (The Way): that way instead
      const alt = (cv._altHits || []).find((h) => d.p[0] >= h.x0 && d.p[0] <= h.x1 && d.p[1] >= h.y0 && d.p[1] <= h.y1);
      if (alt) { $(`.mapcard [data-act=routeset][data-id="${alt.style}"]`, $layer)?.click(); down = null; return; }
      const bird = (cv._birds || []).find((b) => Math.hypot(b.at[0] - d.p[0], b.at[1] - d.p[1]) < 30);
      setTimeout(() => { if (lastTap !== tap || !tap) return; bird ? birdTip(cv, bird) : windTip(cv, d.p[0], d.p[1]); }, 260);
    }
    down = null;
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  // trackpads and mice: pinch (ctrl + wheel) or scroll to zoom, smoothly
  cv.addEventListener("wheel", (e) => { e.preventDefault(); cancelAnimationFrame(mapGlide); const [x, y] = local(e); moveMap(cv, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), x, y); }, { passive: false });
}

/* ============================================================
   Keys and accounts
   ============================================================ */
// This phone's own public key comes from its private key, never from the
// server: safety numbers and "Your Encryption Key" are built from it, so a
// server that showed friends a different key for you couldn't hide it.
async function useKeys(token, me, privJwk) {
  S.token = token; S.me = me;
  S.secretJwk = privJwk;                          // memory only: lets a new passkey lock its own copy
  S.priv = await E2E.importPriv(privJwk);
  S.myPub = { kty: "EC", crv: "P-256", x: privJwk.x, y: privJwk.y };
  S.fp = await E2E.fingerprint(S.myPub);
  S.pairs = new Map(); S.plain = new Map(); S.msgs = new Map();
  S.pins = (await idb.get("pins:" + me.id)) || {};
  await restorePins();
  checkMyKey(me);
  const saved = await idb.set("session", { token, me, priv: S.priv, pub: S.myPub });
  if (saved === null) console.warn("InFlight: couldn’t save the session on this phone; you’ll sign in again next time.");
}
async function forget() {
  S.photos.forEach((u) => URL.revokeObjectURL(u));
  S.avatars?.forEach((u) => { if (u) URL.revokeObjectURL(u); });
  clearTimeout(cacheTimer);
  // nothing of this account carries on into the next one: sound, the mic, location, drafts, searches, news
  try { S.player?.pause(); } catch (_) {}
  if (rec) recStop(false);
  stopLocWatch(); dropAvatarDraft(); airEl = null;
  try { localStorage.removeItem(LOCK_KEY); localStorage.removeItem("inflight-badges"); localStorage.removeItem("inflight-pushsub"); localStorage.removeItem(OPENED_KEY); } catch (_) {}
  openedFor = null;
  if (S.me?.id) { await idb.del("cache:" + S.me.id).catch(() => {}); await idb.del("outbox:" + S.me.id).catch(() => {});
    if (await idb.get("pinsup:" + S.me.id).catch(() => null)) { await idb.del("pins:" + S.me.id).catch(() => {}); await idb.del("pinsup:" + S.me.id).catch(() => {}); } }
  S.outbox = [];
  S.raw = null; S.chatRaw = new Map(); S.skies = null; S.skiesAt = 0; S.fromCache = false; S.started = false; S.synced = false; S.locked = false;
  Object.assign(S, { token: null, me: null, priv: null, secretJwk: null, myPub: null, keyWarned: false, fp: "", friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [],
    msgs: new Map(), plain: new Map(), notes: new Map(), photos: new Map(), photoGone: new Set(), pairs: new Map(), chat: null, sheet: null, pendingUnlock: null, drafts: new Map(), gevents: new Map(),
    avatars: new Map(), viewedOnce: new Set(), q: "", fq: "", news: null, newsAt: 0, replyTo: null, sched: null, via: null, pick: null, birdPick: null, player: null,
    syncSig: "", chatSigs: new Map(), syncFails: 0, birds: [], hall: [], feathers: 0 });
  clearAttach();
  await idb.del("session");
}
/* ---------- invites: InFlight is invite only ----------
   An account needs a one-time link from the site owner (…/pigeon/#invite=…).
   It's kept for this visit only, checked before the form shows, and used up
   by the account it makes. */
function setInvite(t) {
  S.invite = t || null; S.inviteState = null; S.inviteChecking = null;
  try { if (t) sessionStorage.setItem("inflight-invite", t); else sessionStorage.removeItem("inflight-invite"); } catch (_) {}
}
async function checkInvite() {
  const t = S.invite || null;
  if (S.inviteState || S.inviteChecking === (t || "-")) return;
  S.inviteChecking = t || "-";
  let st;
  try { st = await api("invite-check" + (t ? "?t=" + encodeURIComponent(t) : "")); }
  catch (_) { st = { ok: !!t, open: false }; }          // can't tell: let the server decide at sign-up
  if (S.inviteChecking === (t || "-")) S.inviteChecking = null;
  if ((S.invite || null) !== t) return;                 // the invite changed while this was asked: it's being checked anew
  S.inviteState = st;
  const box = $(".welcome .wcta", $view);
  if (box) box.outerHTML = inviteHtml(); else if (S.view === "welcome" || S.view === "signin") render();
}
// the sky: one canvas behind the screen, under every screen before you're in
const skyCanvas = () => $(".nightsky", root()) || (root().prepend(Object.assign(document.createElement("canvas"), { className: "nightsky", ariaHidden: "true" })), $(".nightsky", root()));
function inviteHtml() {
  const st = S.inviteState, enter = (label) => `<button class="btn wide wglow" data-act="to" data-id="signup">${label}</button>`;
  const signin = `<button class="wquiet" data-act="to" data-id="signin">Sign in</button>`;
  if (!st) { checkInvite(); return `<div class="wcta"><div class="stack">${signin}</div></div>`; }
  if (st.open || st.ok) return `<div class="wcta">${S.invite && !st.open ? `<p class="invited">You’ve been invited.</p>` : ""}<div class="stack">${enter(S.invite && !st.open ? "Enter" : "Begin")}${signin}</div></div>`;
  return `<div class="wcta"><p class="invonly">${S.invite ? esc(st.error || "That invite doesn’t work.") : "By invitation only."}</p><div class="stack">${signin}</div></div>`;
}

/* ---------- the welcome sky ----------
   Night: stars that breathe, now and then a shooting star, a planet's rim of
   light far below, and one pigeon crossing in its own glow, leaving a dashed
   trail that fades behind it. (Still, for anyone who asks for less motion.) */
let skyLoop = 0, skyOn = null;
function nightSky(cv) {
  if (!cv || skyOn === cv) return;            // already flying: it carries on
  cancelAnimationFrame(skyLoop); skyOn = cv;
  const g = cv.getContext("2d"), still = STILL.matches, t0 = performance.now();
  const bird = new Path2D(BIRD);
  let W = 0, H = 0, dpr = 1, stars = [], shoot = null, nextShoot = t0 + 2500;
  const seed = (n) => { let x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const size = () => {
    const w = cv.clientWidth, h = cv.clientHeight; if (w === W && h === H) return;
    W = w; H = h; dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr;
    stars = Array.from({ length: Math.round((W * H) / 2600) }, (_, i) => ({ x: seed(i) * W, y: seed(i + 500) * H * 0.92, r: 0.35 + seed(i + 900) ** 3 * 1.5,
      p: seed(i + 1300) * 6.28, s: 0.4 + seed(i + 1700) * 1.4, b: 0.35 + seed(i + 2100) * 0.65 }));
  };
  // the flight: a long arc, left to right, then a rest, then again
  const FLY = 11000, REST = 2600;
  const at = (u) => { const ax = -0.06 * W, ay = H * 0.86, cx = W * 0.5, cy = H * 0.26, bx = W * 1.08, by = H * 0.62;     // up off the horizon, across the open sky
    const a = (1 - u) ** 2, b = 2 * (1 - u) * u, c = u * u; return [a * ax + b * cx + c * bx, a * ay + b * cy + c * by]; };
  const frame = (now) => {
    if (!cv.isConnected || !document.documentElement.classList.contains("night")) { skyOn = null; return; }
    size();
    const t = now - t0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // stars, breathing, drifting very slowly
    for (const s of stars) {
      const tw = still ? s.b : s.b * (0.55 + 0.45 * Math.sin(s.p + (t / 1000) * s.s));
      const x = (s.x + t * 0.003 * s.r) % W;
      g.globalAlpha = tw; g.fillStyle = "#dfe8ff"; g.beginPath(); g.arc(x, s.y, s.r, 0, 6.29); g.fill();
    }
    g.globalAlpha = 1;
    // the planet's edge, far below
    const R = W * 2.2, py = H + R - H * 0.13;
    const rim = g.createRadialGradient(W / 2, py, R * 0.985, W / 2, py, R * 1.06);
    rim.addColorStop(0, "rgba(70,120,255,0)"); rim.addColorStop(0.24, "rgba(90,150,255,.42)"); rim.addColorStop(0.32, "rgba(60,90,220,.14)"); rim.addColorStop(1, "rgba(20,30,90,0)");
    g.fillStyle = rim; g.beginPath(); g.arc(W / 2, py, R * 1.06, 0, 6.29); g.fill();
    g.fillStyle = "#020309"; g.beginPath(); g.arc(W / 2, py, R, 0, 6.29); g.fill();
    if (!still) {
      // a shooting star, now and then
      if (!shoot && now > nextShoot) shoot = { x: W * (0.2 + Math.random() * 0.7), y: H * (0.05 + Math.random() * 0.3), at: now, a: 2.5 + Math.random() * 0.5 };
      if (shoot) {
        const k = (now - shoot.at) / 900;
        if (k >= 1) { shoot = null; nextShoot = now + 5000 + Math.random() * 7000; }
        else {
          const len = 120 * Math.sin(k * Math.PI), hx = shoot.x - Math.cos(shoot.a) * k * 260, hy = shoot.y + Math.sin(shoot.a) * k * 260 * -1 + k * 120;
          const gr = g.createLinearGradient(hx, hy, hx + Math.cos(shoot.a) * len, hy - Math.sin(shoot.a) * len);
          gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(1, "rgba(255,255,255,0)");
          g.strokeStyle = gr; g.lineWidth = 1.4; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(shoot.a) * len, hy - Math.sin(shoot.a) * len); g.stroke();
        }
      }
    }
    // the pigeon and its trail
    const cyc = t % (FLY + REST), u = still ? 0.62 : Math.min(1, cyc / FLY), fade = still ? 1 : cyc > FLY ? Math.max(0, 1 - (cyc - FLY) / REST) : Math.min(1, cyc / 900);
    const ease = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    g.setLineDash([3, 7]); g.lineWidth = 1.3; g.lineCap = "round";
    const N = 90, upto = Math.max(1, Math.round(N * ease));
    for (let i = 1; i <= upto; i++) {
      const [x0, y0] = at((i - 1) / N), [x1, y1] = at(i / N);
      g.strokeStyle = `rgba(160,190,255,${(0.05 + 0.5 * (i / upto) ** 2) * fade})`;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.setLineDash([]);
    const [bx, by] = at(ease), [nx, ny] = at(Math.min(1, ease + 0.01)), ang = Math.atan2(ny - by, nx - bx);
    const glow = g.createRadialGradient(bx, by, 0, bx, by, 46);
    glow.addColorStop(0, `rgba(120,170,255,${0.45 * fade})`); glow.addColorStop(1, "rgba(120,170,255,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(bx, by, 46, 0, 6.29); g.fill();
    const flap = still ? 1 : 0.78 + 0.22 * Math.sin(t / 95);
    g.save(); g.translate(bx, by); g.rotate(ang * 0.6); g.scale(1.6, 1.6 * flap); g.translate(-12, -12);
    g.shadowColor = "rgba(150,190,255,.9)"; g.shadowBlur = 14; g.globalAlpha = fade; g.fillStyle = "#fff"; g.fill(bird); g.restore();
    g.globalAlpha = 1;
    if (!still) skyLoop = requestAnimationFrame(frame);
  };
  skyLoop = requestAnimationFrame(frame);
}
async function createAccount(v) {
  const { privJwk, pub } = await (onb.id || E2E.newIdentity());
  S.making = 1; if (S.view === "making") render();
  const ready = onb.pw?.pw === v.password ? onb.pw : null, salt = ready ? ready.salt : E2E.newSalt();
  const { lockKey, proof } = await (ready ? ready.p : E2E.fromPassword(v.password, salt));
  const vault = await E2E.lock(lockKey, { ecdh: privJwk });
  S.making = 2; if (S.view === "making") render();
  const r = await api("signup", { method: "POST", body: { name: v.name, handle: v.handle, email: v.email, salt, proof, vault, pub, invite: S.invite || undefined } });
  setInvite(null);
  S.making = 3; if (S.view === "making") render();
  await useKeys(r.token, r.me, privJwk);
  onb.id = onb.pw = null; onb.handleTouched = false;
}
async function signInPassword(email, password) {
  const { salt } = await api("salt", { method: "POST", body: { email } });
  const { lockKey, proof } = await E2E.fromPassword(password, salt);
  const r = await api("login", { method: "POST", body: { email, proof } });
  let ecdh;
  try { ({ ecdh } = await E2E.unlock(lockKey, r.vault)); }
  catch (_) { throw new Error("Signed in, but your password couldn’t unlock your key. Try again."); }
  await useKeys(r.token, r.me, ecdh);
  // an account from before Argon2id: stretched again the new way, now that the password's here
  if (!E2E.isCurrent(salt)) (async () => {
    const ns = E2E.newSalt(), nw = await E2E.fromPassword(password, ns);
    await api("password-upgrade", { method: "POST", body: { oldProof: proof, salt: ns, proof: nw.proof, vault: await E2E.lock(nw.lockKey, { ecdh }) } });
  })().catch((e) => console.warn("upgrade", e));
}
// The password-locked key, fetched with the password itself (its proof is the check)
async function vaultWith(password) {
  const { salt } = await api("salt", { method: "POST", body: { email: S.me.email } });
  const { lockKey, proof } = await E2E.fromPassword(password || "", salt);
  const { vault } = await api("vault", { method: "POST", body: { proof } });
  return { vault, salt, lockKey, proof };
}
// "Confirm it's you": the few things a stolen sign-in mustn't be enough for ask
// for your password (or a passkey) if you haven't shown it in 10 minutes.
// (answered once: if something else takes its place first, it answers "no" so nothing waits for ever)
const asking = (sheet, resolve) => { sheet.resolve = (v) => { if (sheet.done) return; sheet.done = true; resolve(v); }; return sheet; };
function confirmIt() {
  return new Promise((resolve) => { S.sheet = asking({ type: "reauth", back: S.sheet }, resolve); renderSheet(); });
}
async function withFresh(fn) {
  try { return await fn(); }
  catch (e) {
    if (e.field !== "reauth") throw e;
    if (!(await confirmIt())) throw Object.assign(new Error("Cancelled."), { cancelled: true });
    return fn();
  }
}
async function reauthPasskey() {
  const o = await api("passkey-options", { method: "POST", body: { mode: "login" } });
  const a = await navigator.credentials.get({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
    allowCredentials: (S.passkeys || []).map((p) => ({ type: "public-key", id: fromB64url(p.id) })) } });
  await api("reauth", { method: "POST", body: { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
    authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) } });
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
    challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
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
  const { lockKey } = await E2E.fromPassword(password, r.salt);
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
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
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
      const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: o.rpId, userVerification: "required",
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
  return new Promise((resolve) => { S.sheet = asking({ type: "askpw" }, resolve); renderSheet(); });
}

/* ============================================================
   Sync with the server
   ============================================================ */
let syncing = null;
// What the server says (fresh, or the copy kept on this phone): friends,
// groups and each chat's last message, opened with the key on this phone.
async function applySync(d) {
  S.me = d.me; S.friends = d.friends; S.groups = d.groups || []; S.incoming = d.incoming; S.outgoing = d.outgoing; S.blocked = d.blocked || []; S.passkeys = d.passkeys; S.emailOn = !!d.emailOn; S.gifsOn = !!d.gifsOn; S.birds = d.birds?.birds || []; S.hall = d.birds?.hall || []; S.feathers = d.feathers ?? S.feathers ?? 0;
  syncTheme();
  for (const f of S.friends) {
    checkPin(f);
    if (f.last) await decrypt(f.id, f.last);
    // a notice for pigeons that land while the app is open (not for ones already waiting at launch)
    if (f.last && !f.last.flying && !f.last.lost && !S.seenLanded.has(f.last.id)) {
      S.seenLanded.add(f.last.id);
      if (S.started && f.last.from === f.id) S.fresh.set(f.last.id, Date.now());   // it lands in front of you
      if (S.started && f.last.from === f.id && !f.last.readAt && !(S.view === "chat" && S.chat === f.id))
        toast(`<b>${esc(first(f.name))}</b><br>A pigeon just landed.`, "Read", () => go("chat", f.id));
    }
  }
  for (const g of S.groups) {
    for (const p of g.members) if (p.id !== S.me.id) checkPin(p);
    const known = S.pins["g:" + g.id], ids = g.members.map((p) => p.id);
    if (!known) { S.pins["g:" + g.id] = ids; savePins(); }
    g.unseen = known ? ids.filter((id) => !known.includes(id)) : [];
    if (g.last) await decryptGroup(g, g.last);
    const l = g.last;
    if (l && l.from !== S.me.id && !l.flying && !l.lost && !S.seenLanded.has(l.id)) {
      S.seenLanded.add(l.id);
      if (S.started) S.fresh.set(l.id, Date.now());
      if (S.started && !l.readAt && !(S.view === "chat" && S.chat === g.id))
        toast(`<b>${esc(g.name)}</b><br>A pigeon from ${esc(first(member(g, l.from)?.name || "someone"))} just landed.`, "Read", () => go("chat", g.id));
    }
  }
}
// something set off, landed or was called back: the In the air strip catches up now, not 20 s later
function skiesFollow() {
  const sig = [...S.friends, ...S.groups].map((x) => (x.last ? `${x.last.id}:${x.last.flying ? 1 : 0}${x.last.lost ? "l" : ""}` : "")).join(",");
  if (sig === S.skySig) return;
  const first = S.skySig == null; S.skySig = sig;
  if (!first) loadSkies();
}
async function sync() {
  if (!S.token || !S.priv) return;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const tok = S.token, d = await api("sync");
      if (S.token !== tok) return;                // signed out (or in as someone else) meanwhile: not theirs to show
      if (!Number.isFinite(d.now) || !d.me || !Array.isArray(d.friends)) throw new Error("A sync came back incomplete.");
      S.skew = d.now - Date.now();
      checkMyKey(d.me);
      // nothing new since last time: no redraw, no re-saving (an open app asks every 15 s)
      const sig = JSON.stringify({ ...d, now: 0 }), same = sig === S.syncSig && S.synced;
      S.syncSig = sig; S.syncFails = 0; S.lastSync = Date.now();
      if (!same) { S.raw = d; await applySync(d); skiesFollow(); }
      S.started = true;
      if (S.view === "chat" && S.chat && !S.locked) await loadChat(S.chat).catch((e) => console.warn("chat", e.message));     // (locked: nothing is opened, or marked read; a slow chat doesn't hold up the rest)
      if (S.token !== tok) return;
      if ((S.sheet?.type === "map" && S.sheet.id === "skies") || S.view === "messages") loadSkies();
      const wasCache = S.fromCache; S.fromCache = false;
      if (!AUTH_VIEWS.has(S.view) && (!same || wasCache || S.chatChanged)) render();
      S.chatChanged = false;
      S.synced = true;                            // from here on, what changes is news
      if (!same) cacheSave();
      if (S.outbox.length) outboxFlush();
    } catch (e) { if (e.status !== 401) { console.warn("sync", e.message); S.syncFails = (S.syncFails || 0) + 1; } }
    finally { syncing = null; }
  })();
  return syncing;
}
function friend(id) { return S.friends.find((f) => f.id === id); }
// The server should show everyone the key this phone holds. If it ever says otherwise, say so.
function checkMyKey(me) {
  if (!S.myPub || !me?.pub || keyId(me.pub) === keyId(S.myPub)) return;
  if (S.keyWarned) return;
  S.keyWarned = true;
  toast("<b>Your security key doesn’t match</b><br>The server is showing a different key for you than the one on this phone. Don’t send anything private, and sign out and back in.");
}
// First key seen for a friend is remembered on this phone; a later change is flagged.
// Keys this phone trusted before are kept too, so scrolls sealed with them stay readable
// after a friend resets. Only keys this phone has seen are ever tried: a key named by the
// server alone could have been made by the server.
const keyId = (pub) => `${pub.x}.${pub.y}`;
const pubFromId = (k) => { const [x, y] = k.split("."); return { kty: "EC", crv: "P-256", x, y }; };
// The keys you've trusted also go to the server, sealed so only your own key can
// open them: on a new phone (or after this one forgets), they come back, and a
// key the server swapped in while you weren't looking is still caught.
const pinsMeta = () => ({ type: "pins", id: "pins", from: S.me.id, to: S.me.id });
let pinsTimer = 0;
function savePins() {
  if (!S.me) return;
  idb.set("pins:" + S.me.id, S.pins);
  clearTimeout(pinsTimer);
  pinsTimer = setTimeout(async () => {
    try {
      const ct = await E2E.seal(await pairFor(S.myPub), pinsMeta(), { pins: S.pins, at: Date.now() });
      await api("pins", { method: "POST", body: { pins: ct } }); await idb.set("pinsup:" + S.me.id, Date.now());
    } catch (_) {}
  }, 1500);
}
// Nothing trusted on this phone yet (a new phone, a reinstall): bring back what was saved
async function restorePins() {
  if (Object.keys(S.pins).length) return;
  try {
    const r = await api("pins"); if (!r.pins) return;
    const p = await E2E.open(await pairFor(S.myPub), pinsMeta(), r.pins);
    if (p?.pins && typeof p.pins === "object") { S.pins = p.pins; await idb.set("pins:" + S.me.id, S.pins); await idb.set("pinsup:" + S.me.id, Date.now()); }
  } catch (_) {}
}
// Verify in person: your safety number with a friend, as a QR code. Scanning theirs (or
// comparing the digits and saying they match) marks them Verified, kept with the trusted
// keys ("v:" + id: the key that was verified), until their key changes.
const safetyCode = (digits) => `inflight-safety:1:${(digits || []).join("")}`;
const isVerified = (p) => !!p?.pub && !p.keyChanged && S.pins["v:" + p.id] === keyId(p.pub);
const wasVerified = (p) => !!p?.keyChanged && !!S.pins["v:" + p.id];         // verified, and their key has changed since
function setVerified(p, on) { if (on) S.pins["v:" + p.id] = keyId(p.pub); else delete S.pins["v:" + p.id]; savePins(); }
function stopScan() { if (!S.scan) return; S.scan.on = false; S.scan.stream?.getTracks().forEach((t) => t.stop()); S.scan = null; }
async function startScan(p, want) {
  stopScan();
  const v = $(".scanbox video", $layer), say = (t) => { const m = $(".scanmsg", $layer); if (m) m.textContent = t; };
  if (!v) return;
  const scan = S.scan = { on: true, stream: null, sheet: S.sheet };
  try { scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
  catch (_) { S.scan = null; return say("InFlight can’t use the camera here. Compare the 60 digits instead."); }
  if (!scan.on || S.scan !== scan) { scan.stream.getTracks().forEach((t) => t.stop()); return; }     // (closed, or another scan began, while asking)
  v.srcObject = scan.stream; await v.play().catch(() => {});
  // the browser's own reader where there is one (Android), else jsQR (loaded only now)
  let det = null;
  try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) det = new BarcodeDetector({ formats: ["qr_code"] }); } catch (_) {}
  const jsQR = det ? null : (await import("./jsqr.js")).default;
  const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
  const look = async () => {
    if (!scan.on || S.scan !== scan) return;
    let text = null;
    if (v.readyState >= 2 && v.videoWidth) {
      if (det) text = (await det.detect(v).catch(() => []))[0]?.rawValue || null;
      else { const w = c.width = Math.min(640, v.videoWidth), h = c.height = Math.round((w * v.videoHeight) / v.videoWidth); g.drawImage(v, 0, 0, w, h); text = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" })?.data || null; }
    }
    if (text?.startsWith("inflight-safety:")) {
      stopScan();
      if (text === want) { setVerified(p, true); haptic("success"); toast(`Verified. Your safety numbers match, so only you and ${esc(first(p.name))} can read your messages.`); S.sheet = { ...S.sheet.back }; return renderSheet(); }
      haptic("heavy"); S.sheet = { ...S.sheet, bad: true }; return renderSheet();
    }
    setTimeout(look, 150);
  };
  look();
}
function checkPin(f) {
  const k = keyId(f.pub);
  if (!S.pins[f.id]) { S.pins[f.id] = k; savePins(); }
  f.keyChanged = S.pins[f.id] !== k;
}
// a friend, or someone in one of your groups
const personById = (id) => friend(id) || S.groups.map((g) => member(g, id)).find((p) => p && p.id !== S.me.id) || null;
async function trustNewKey(fid) {
  const f = friend(fid) || S.groups.map((g) => member(g, fid)).find(Boolean); if (!f) return;
  const old = S.pins[fid], hist = S.pins["old:" + fid] || [];
  if (old && old !== keyId(f.pub) && !hist.includes(old)) S.pins["old:" + fid] = [...hist, old];
  S.pins[fid] = keyId(f.pub); savePins();
  f.keyChanged = false;
  for (const x of [friend(fid), ...S.groups.map((g) => member(g, fid))]) if (x) x.keyChanged = false;   // the same person, wherever they appear
  for (const [id, p] of S.plain) if (p.unchecked) S.plain.delete(id);     // now they can be opened
  if (friend(fid)?.last) await decrypt(fid, friend(fid).last);
  for (const g of S.groups) if (g.last) await decryptGroup(g, g.last);
  if (S.view === "chat" && (S.chat === fid || group(S.chat))) await loadChat(S.chat).catch(() => {});
  render();
}
function pairFor(pub) {
  const k = keyId(pub);
  if (!S.pairs.has(k)) S.pairs.set(k, E2E.pair(S.priv, pub));
  return S.pairs.get(k);
}
// Sealing to someone uses their key only if it hasn't changed since you last
// checked: everything that's sealed (messages, reactions, stopover copies and
// notes, group keys) goes through here, so nothing slips out to a new key.
function trustedPub(p) {
  if (!p?.pub) throw new Error("They’re not in your friends any more.");
  if (p.keyChanged) throw new Error(`${first(p.name || "Their")}’s security key changed. Check their safety number first.`);
  return p.pub;
}
const base = (fid) => pairFor(trustedPub(friend(fid)));
// Keys to try for someone's messages: theirs now (once checked), then ones this phone pinned before.
// A key the server says changed isn't used until you've checked it.
const keysOf = (p) => [p.keyChanged ? null : keyId(p.pub), S.pins[p.id], ...(S.pins["old:" + p.id] || [])].filter((k, i, a) => k && a.indexOf(k) === i);
// What a decrypted thing must look like, by what it is: a reaction is one of
// the reactions and nothing else; a message (or a stopover's copy) has words.
// Anything else is treated as unreadable, whatever the server sent.
const shapeOK = (kind, o) => !!o && typeof o === "object" && !Array.isArray(o) && (kind === "react"
  ? Object.keys(o).length === 1 && REACTIONS.includes(o.r)
  : typeof o.t === "string" && !("r" in o) && !("k" in o));
// Each id belongs to one conversation (and one kind of thing): if the same id
// turns up somewhere else, neither is shown as the other.
const ctxOf = (kind, m, scope) => `${kind}|${scope}|${m.from}|${m.to || ""}`;
function keepPlain(id, ctx, o) {
  const had = S.pctx.get(id);
  if (had && had !== ctx) { S.plain.set(id, { t: "", bad: true }); return; }
  S.pctx.set(id, ctx); S.plain.set(id, o);
}
const seenPlain = (id, ctx) => S.plain.has(id) && (!S.pctx.has(id) || S.pctx.get(id) === ctx);
async function decrypt(fid, m, kind = m.stopover ? "via" : "msg") {
  const ctx = ctxOf(kind, m, fid);
  if (!m.ct || seenPlain(m.id, ctx)) return;
  const f = friend(fid);
  const tries = keysOf(f);
  for (const k of tries) {
    try {
      const o = await E2E.open(await pairFor(pubFromId(k)), { id: m.id, from: m.from, to: m.to, type: kind }, m.ct);
      return keepPlain(m.id, ctx, shapeOK(kind, o) ? o : { t: "", bad: true });
    } catch (_) {}
  }
  keepPlain(m.id, ctx, { t: "", bad: true, unchecked: !!f.keyChanged });
}
/* ---------- groups ----------
   Everyone in a group gets their own pigeon, flying their own distance, so a
   message lands for each person at a different time. */
function group(id) { return S.groups.find((g) => g.id === id); }
const GROUP_MAX = 12;
const memberKm = (p) => p.lat != null && S.me.lat != null ? haversineKm(S.me.lat, S.me.lon, p.lat, p.lon) : p.km ?? 500;
// how long a group's pigeon takes to one of them (to or from the Moon: a lunar pigeon, whatever the kind)
const memberMs = (p, k) => {
  if (!S.me.moon && !p.onMoon && !p.moon) return flightMs(memberKm(p), mySpeed(k));
  const a = endFor(S.me), b = endFor(p) || { b: worldOf(p), lat: 0, lon: 0 }, sk = spaceKinds(a, b);
  return sk ? spaceMs(sk[0], a, b) : flightMs(memberKm(p), mySpeed(k));
};
const member = (g, id) => g?.members.find((p) => p.id === id);
const others = (g) => g.members.filter((p) => p.id !== S.me.id);
async function decryptGroup(g, m, kind = "msg") {
  const ctx = ctxOf(kind, m, g.id);
  if (!m.body || !m.key || seenPlain(m.id, ctx)) return;
  const from = m.from === S.me.id ? { id: S.me.id, pub: S.myPub || S.me.pub } : member(g, m.from);
  const tries = !from ? [] : from.id === S.me.id ? [keyId(from.pub)] : keysOf(from);
  for (const k of tries) {
    try {
      const w = await E2E.open(await pairFor(pubFromId(k)), { id: m.id, from: m.from, to: S.me.id, type: "wrap" }, m.key);
      // the sender's sealed key vouches for the body (v2); an older body has no hash to check
      if (w.h ? (await E2E.hash(m.body)) !== w.h : JSON.parse(m.body).v !== 1) throw new Error("not the sender’s body");
      const o = await E2E.openGroup({ id: m.id, from: m.from, group: g.id, type: kind }, w.k, m.body);
      return keepPlain(m.id, ctx, shapeOK(kind, o) ? o : { t: "", bad: true });
    } catch (_) {}
  }
  keepPlain(m.id, ctx, { t: "", bad: true, unchecked: !!from?.keyChanged });
}
async function loadGroup(gid) { return loadChat(gid); }
async function loadChat(fid) {
  const g = group(fid), tok = S.token;
  const d = await api(g ? "group-messages?id=" + encodeURIComponent(fid) : "messages?with=" + encodeURIComponent(fid));
  if (S.token !== tok) return;                     // signed out meanwhile
  S.skew = d.now - Date.now();
  // the same as last time: nothing to open, draw or save again
  const sig = JSON.stringify({ ...d, now: 0 }), sigs = (S.chatSigs ||= new Map());
  if (sigs.get(fid) === sig && S.msgs.has(fid)) return;
  sigs.set(fid, sig); S.chatChanged = true;
  S.chatRaw.delete(fid); S.chatRaw.set(fid, d); cacheSave();
  await applyChat(fid, d, true);
}
// One chat's messages, opened. A copy from this phone (live = false) only
// fills in until the fresh one arrives, and never tells the server anything.
// Disappearing messages (functions/_vanish.js): one whose time is up, after it was read
// (in a group, by everyone it flew to). The server wipes it within a minute; this hides
// it at once, even from a copy saved on the phone.
const vanishSay = (ms) => (ms ? `${ms / DAY} day${ms === DAY ? "" : "s"}` : "off");
function vanished(m, t = now()) {
  if (!m?.vanish) return false;
  if (m.flock) { const fl = m.flock.filter((x) => !x.lost); return fl.length > 0 && fl.every((x) => x.readAt) && Math.max(...fl.map((x) => x.readAt)) + m.vanish <= t; }
  return !!m.readAt && m.readAt + m.vanish <= t;
}
async function applyChat(fid, d, live) {
  if (d.messages?.some((m) => vanished(m))) {
    for (const m of d.messages) if (vanished(m)) { S.plain.delete(m.id); S.pctx.delete(m.id); }
    d = { ...d, messages: d.messages.filter((m) => !vanished(m)) };
  }
  const g = group(fid), open = (m, kind) => (g ? decryptGroup(g, m, kind) : decrypt(fid, m, kind));
  if (!g && !friend(fid)) return;
  for (const r of d.reacts || []) await open(r, "react");
  for (const m of d.messages) {
    await open(m);
    if (!g && m.note && m.via) await openNote(m.id, m.via, S.me.id, m.note);
    if (!g && m.stopover && m.mine) await openNote(m.id, S.me.id, m.finalTo, m.mine);
  }
  if (!live && S.msgs.has(fid)) return;            // the fresh copy got here first
  S.msgs.set(fid, d.messages); S.turns.set(fid, d.turn); S.reacts.set(fid, d.reacts || []); if (!g) S.fly.set(fid, d.fly || []);
  if (g) { S.gevents.set(fid, d.events || []); if (live) (S.geventsLive ||= new Set()).add(fid); }
  for (const m of d.messages) {
    const p = S.plain.get(m.id), theirs = g ? m.from !== S.me.id : m.to === S.me.id;
    if (m.photo === 2 && S.photos.has(m.id)) { URL.revokeObjectURL(S.photos.get(m.id)); S.photos.delete(m.id); }
    if (live && m.photo === 1 && (p?.p || p?.v) && !onceP(p) && !S.photos.has(m.id) && !S.photoGone.has(m.id) && !(theirs && (m.flying || m.lost))) loadPhoto(fid, m, p);
  }
  if (!live) return;
  const unread = (m) => (g ? m.from !== S.me.id : m.from === fid && !m.stopover) && !m.flying && !m.lost && !m.readAt;
  if (!S.locked && S.view === "chat" && S.chat === fid && document.visibilityState === "visible" && d.messages.some(unread)) {     // (only a chat you're looking at is read)
    api(g ? "group-read" : "read", { method: "POST", body: g ? { id: fid } : { with: fid } }).catch(() => {});
    for (const m of d.messages) if ((g ? m.from !== S.me.id : m.from === fid) && !m.flying && !m.lost) m.readAt = m.readAt || now();
    const x = g || friend(fid); if (x) x.unread = 0;
  }
}

/* ---------- the last-known state, kept on this phone so InFlight opens at once ----------
   What the server last sent (message contents still sealed; they open with the
   key that's already on this phone) and the last few chats you opened. Shown
   straight away at launch while the fresh copy loads; deleted on sign out. */
const CACHE_V = 1, CACHE_CHATS = 12;
let cacheTimer = 0;
function cacheSave() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    if (!S.me || !S.raw) return;
    idb.set("cache:" + S.me.id, { v: CACHE_V, at: Date.now(), sync: S.raw, skies: S.skies || null, chats: [...S.chatRaw].slice(-CACHE_CHATS) }).catch(() => {});
  }, 600);
}
async function cacheLoad() {
  let c = null; const me = S.me;                   // (who's signed in, from the session: a bad copy mustn't change it)
  try { c = await idb.get("cache:" + S.me.id); } catch (_) {}
  if (!c || c.v !== CACHE_V || !c.sync) return false;
  try {
    S.chatRaw = new Map(Array.isArray(c.chats) ? c.chats : []);
    if (c.skies) S.skies = c.skies;
    S.raw = c.sync;
    await applySync(c.sync);
  }
  catch (e) {
    // a saved copy this version can't read: start from the server instead of not at all
    console.warn("cache", e?.message); S.me = me; idb.del("cache:" + me.id);
    Object.assign(S, { raw: null, friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [], birds: [], hall: [], chatRaw: new Map(), msgs: new Map() });
    return false;
  }
  S.fromCache = true;
  return true;
}
// A stopover's line is sealed between the friend it stopped with and the recipient.
async function openNote(id, from, to, ct) {
  if (S.notes.has(id)) return;
  const other = friend(from === S.me.id ? to : from); if (!other) return;
  // with keys you've trusted (as for messages), never a changed one unchecked
  for (const k of keysOf(other)) {
    try { const o = await E2E.open(await pairFor(pubFromId(k)), { id: id + ":via", from, to, type: "note" }, ct); if (typeof o?.t === "string") S.notes.set(id, o.t); return; } catch (_) {}
  }
}
/* ---------- What's New ----------
   Every release, newest first: tap the version at the foot of Account. */
const RELEASES = [
  { v: "1.2.1", at: Date.UTC(2026, 9, 18), title: "Wherever you go", items: [
    ["up", "indigo", "Pigeons follow you to other worlds", "Leave for the Moon or Mars and the pigeons already on their way come too: one over Europe is handed to a lunar pigeon there and then; one in space gets to where you were and is relayed on by laser."],
    ["moon", "gray", "Eclipses to the minute", "The Moon and the Earth’s shadow are worked out properly now, so a lunar eclipse on a pigeon’s trip is when it really is, shallow ones too."],
    ["shield", "green", "Fixes", "Notifications keep up when lots are flying, pigeons grounded by an unfriending go back in their loft, and wrong passwords elsewhere can’t lock you out."],
  ] },
  { v: "1.2.0", at: Date.UTC(2026, 9, 17), title: "Further out", items: [
    ["up", "red", "Live on Mars", "My Profile → Location → Go to Mars. Only laser pigeons reach it: pulses of light, there in 3 to 22 minutes as the planets go round the Sun."],
    ["globe", "blue", "Orbital pigeons", "Earth to Earth by way of orbit: up 250 miles, round every 92 minutes, and down on the first pass near your friend. Two a day."],
    ["moon", "indigo", "Day and night up there", "A friend on the Moon has a sunrise every month; on Mars, every 24 hours 39 minutes. Their chat says which, and when it changes."],
    ["bell", "orange", "Moments from space", "Halfway to the Moon, behind it, re-entry, into orbit, a lunar eclipse on the way: you hear as it happens."],
    ["map", "teal", "Postmarks out there", "Tranquility Base, Tycho, Olympus Mons, Jezero and more, and Supermoon, Through the Shadow, Red Planet and Orbiter badges."],
    ["share", "green", "Replay and share a trip", "Scrub through any space trip, and share it as a postcard or a story."],
  ] },
  { v: "1.1.0", at: Date.UTC(2026, 9, 16), title: "To the Moon", items: [
    ["moon", "indigo", "Live on the Moon", "My Profile → Location → Go to the Moon. Pick a crater or a sea, near side or far side, and your friends see you there. Your spot on Earth isn’t kept while you’re away."],
    ["bird", "gray", "Lunar pigeons", "Only they fly to the Moon and back: about 3 days, like Apollo, or a day by Lunar Express. The trip is as long as the Moon is far away that day."],
    ["globe", "blue", "Watch the trip", "Earth, the Moon and your pigeon between them: halfway, into the Moon’s pull, behind the far side, re-entry and touchdown."],
    ["pin", "orange", "Across the Moon", "Between two friends on the Moon, pigeons bound over the surface in the low gravity. No air, no wind, no weather."],
    ["map", "teal", "A Moon stamp", "Your passport gets a Moon stamp, there’s a Moonshot badge, and InFlight Live counts the pigeons out in space."],
  ] },
  { v: "1.0.9", at: Date.UTC(2026, 9, 16), title: "Safer by design", items: [
    ["clock", "indigo", "Disappearing messages", "In a chat’s info: messages disappear 1, 7 or 30 days after they’re read, wiped from the server too. The flight stays in your Flight Log."],
    ["shield", "teal", "Verify in person", "Scan each other’s Safety Number code to mark a friend Verified. If their key ever changes, you’ll know."],
    ["key", "orange", "Stronger passwords", "Passwords are stretched with Argon2id, and ones that have turned up in a data breach are refused."],
    ["bell", "red", "New sign-in alerts", "When your account signs in on a new phone, your other phones and your email hear about it."],
    ["loc", "blue", "Approximate Location", "Privacy & Security: keep your spot to about 10 km instead of a mile."],
  ] },
  { v: "1.0.8", at: Date.UTC(2026, 9, 16), title: "A new home, and InFlight Live", items: [
    ["globe", "blue", "A new home", "InFlight now lives at chat.georgefarrowgreen.com. Open it in your browser and you’re signed in already; on the Home Screen, add the new one and sign in once."],
    ["map", "indigo", "InFlight Live", "On a computer, chat.georgefarrowgreen.com/tracker shows every pigeon in the air as rough dots with fading trails, and today’s totals. Never a name or a message."],
    ["shield", "green", "Your pigeons, your choice", "Privacy & Security → Live Tracker keeps your pigeons off it. One only shows if you and your friend both leave it on."],
    ["ship", "teal", "The right sea", "A ship’s voyage is named for the sea it really crosses: the North Atlantic, not the English Channel it sails out by."],
  ] },
  { v: "1.0.7", at: Date.UTC(2026, 9, 16), title: "Coots", items: [
    ["coin", "yellow", "Coots Coins", "Feathers are now Coots Coins, kept at Coots, the bank in Account. Every coin you had is still there."],
  ] },
  { v: "1.0.6", at: Date.UTC(2026, 9, 16), title: "A real passport", items: [
    ["globe", "red", "Your passport, as a passport", "Open it from your Flight Log: a photo page with how far your pigeons have flown, then visa pages filling up with rubber stamps, a journey at a time."],
    ["map", "green", "Every country’s own stamp", "Each in its own ink with the country’s outline inside; seas crossed, and “Arrived by sea” after a voyage."],
    ["loc", "indigo", "Every landmark’s own postmark", "Big Ben is a clock tower, Pisa leans, and Fuji has snow on top: all 69 drawn on their own."],
  ] },
  { v: "1.0.5", at: Date.UTC(2026, 9, 16), title: "Ships on the map, and no ships", items: [
    ["ship", "teal", "The voyage on the map", "The lane a ship sails is drawn in teal with its two ports, and the card says the day the ship gets in."],
    ["bell", "orange", "Boarded, and ashore", "You’re told when a pigeon boards its ship and when it comes ashore, under Mid-air Moments."],
    ["bird", "blue", "In a hurry? No ships", "How It Flies → By Sea: a standard pigeon can fly the ocean itself, days quicker, but a long way with nowhere to land."],
    ["clock", "green", "Quicker to plan", "How It Flies works out every pigeon’s way in a fraction of the time, and a pigeon slowed by a headwind has the forecast all the way."],
  ] },
  { v: "1.0.4", at: Date.UTC(2026, 9, 15), title: "Ships, coasts and surer times", items: [
    ["ship", "teal", "Across oceans by ship", "A standard pigeon can’t fly an ocean, so it rides a ship along the real shipping lanes, then flies on from the port."],
    ["waves", "blue", "Along the coast", "Standard pigeons keep to the coast rather than cross open sea with nowhere to rest."],
    ["map", "green", "Over the mountains", "Turbo and rocket pigeons fly high enough to go straight over all but the highest ranges."],
    ["wind", "indigo", "Cleverer with the wind", "Routes are planned on a finer grid, with the wind as it will be when the pigeon gets there."],
    ["rain", "orange", "Showers, and steadier turns", "Showers in the next two hours are planned for, pigeons don’t swing back and forth between routes, and any pigeon over land waits out storms close ahead."],
    ["clock", "pink", "Surer landing times", "The likely landing time comes from how much many forecasts agree about the wind."],
  ] },
  { v: "1.0.3", at: Date.UTC(2026, 9, 15), title: "A fresh chat, and the Earth itself", items: [
    ["bubble", "blue", "Chats that feel like Messages", "Tails on bubbles, the time over each stretch of a chat, Read under your latest, and big emoji. Tap a message for when it was sent, landed and read."],
    ["volcano", "red", "Volcanoes, wildfires and magnetic storms", "Pigeons fly around volcanic ash and wildfire smoke, and wander a little in magnetic storms, from live NASA and NOAA data."],
    ["map", "teal", "The flight as a story", "Pull up the card on the map: storms dodged, passes, rests, near misses and when it lands, likely give or take a little."],
    ["people", "green", "Flying together", "Two pigeons off the same way at once fly together, each a little quicker for it."],
    ["wind", "indigo", "Cleverer routes", "Rockets ride the jet stream, named pigeons stop for a breather, and The Way shows the other routes faintly."],
    ["once", "pink", "Tidier photos", "Opened and expired photos fold into a small pill, and a view-once photo can’t be opened twice."],
    ["pass", "orange", "Near misses, folded up", "A run of them in a chat folds into one line. Tap it to see each."],
  ] },
  { v: "1.0.2", at: Date.UTC(2026, 8, 1), title: "Safer, steadier, faster", items: [
    ["shield", "green", "Privacy that holds everywhere", "Blocks hold inside groups, and Opened, Updated and lofts follow your privacy switches both ways."],
    ["clock", "blue", "Opens with no signal", "The app starts from a saved copy, never hangs on a slow request, and keeps trying queued pigeons."],
    ["trash", "red", "Deleting means deleting", "Deleting your account removes everything of it."],
  ] },
];

/* ---------- view-once photos ----------
   Downloaded only when tapped, and only once (the server hands it over a
   single time, then deletes it). Shown full screen for at most 15 seconds,
   drawn on a canvas (nothing to save or share), and wiped the moment it
   closes, or the moment you leave the app. */
const ONCE_MS = 15000;
let onceOpen = null;
// The ones you've opened are kept on this phone too (just their ids), so the
// button never comes back: not on a fresh start from the cache, not before the
// server's word arrives.
const OPENED_KEY = "inflight-opened";
let openedFor = null;
function opened() {
  if (S.me && openedFor !== S.me.id) {
    openedFor = S.me.id;
    try { const v = JSON.parse(localStorage.getItem(OPENED_KEY) || "null"); if (v?.uid === S.me.id) for (const id of v.ids || []) S.viewedOnce.add(id); } catch (_) {}
  }
  return S.viewedOnce;
}
const openedOnce = (id) => opened().has(id);
function saveOpened() { try { localStorage.setItem(OPENED_KEY, JSON.stringify({ uid: S.me.id, ids: [...S.viewedOnce].slice(-500) })); } catch (_) {} }
// past its time it's gone, even before the server has tidied it away
const picGone = (m) => m.photo === 2 || S.photoGone.has(m.id) || (m.expiresAt != null && now() >= m.expiresAt);
async function viewOnce(id) {
  const fid = S.chat, g = group(fid), m = (S.msgs.get(fid) || []).find((x) => x.id === id), p = S.plain.get(id);
  if (!m || !onceP(p) || onceOpen || m.viewedAt || opened().has(id) || picGone(m)) return;
  haptic("tick");
  const el = document.createElement("div");
  el.className = "oview"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Photo, view once");
  el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="obar"><span class="oring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/></svg></span><span class="otext">Opening…</span><button type="button" class="oclose" aria-label="Close">${I.x}</button></div>`;
  root().append(el);
  const state = onceOpen = { el, timer: 0, bmp: null };
  const close = () => {
    if (onceOpen !== state) return; onceOpen = null;
    clearTimeout(state.timer); document.removeEventListener("visibilitychange", hide);
    const cv = $("canvas", el); if (cv) { cv.width = cv.height = 0; }
    state.bmp?.close?.(); state.bmp = null;
    el.classList.add("out"); setTimeout(() => el.remove(), 220);
  };
  const hide = () => { if (document.visibilityState !== "visible") close(); };
  document.addEventListener("visibilitychange", hide);
  el.addEventListener("click", close);
  // counted as opened now (no second go), unless it never arrives
  m.viewedAtServer = !!m.viewedAt; m.viewedAt = m.viewedAt || now(); opened().add(id); saveOpened(); render();
  let plain, got = false;
  try {
    const r = await api((g ? "group-photo/" : "photo/") + id, { raw: true }), bytes = await r.arrayBuffer();
    got = true;                                  // handed over: from here it's spent, whatever happens
    plain = await E2E.openPhoto(id, p.p, bytes);
  } catch (e) {
    close();
    // no signal, or the server never answered: it wasn't handed over, so it can still be opened later
    if (!got && (e.offline || !e.status || e.status >= 500)) { opened().delete(id); saveOpened(); if (m.viewedAt && !m.viewedAtServer) delete m.viewedAt; render(); return toast(esc(e.offline ? "You’re offline. The photo is still there to open once you’re back." : "Couldn’t open the photo just now. Try again in a moment.")); }
    if (e.status === 410) toast(esc(e.message || "This photo has already been opened."));
    else toast(esc(e.message || "Couldn’t open this photo."));
    return;
  }
  if (onceOpen !== state) { new Uint8Array(plain.buffer || plain).fill(0); return; }           // closed while it was coming
  try { state.bmp = await createImageBitmap(new Blob([plain], { type: "image/jpeg" })); } catch (_) {}
  new Uint8Array(plain.buffer || plain).fill(0);                                // the decrypted bytes go straight away
  if (!state.bmp || onceOpen !== state) return close();
  const cv = $("canvas", el), dpr = Math.min(3, devicePixelRatio || 1), W = el.clientWidth, H = el.clientHeight;
  const k = Math.min(W / state.bmp.width, H / state.bmp.height), w = Math.round(state.bmp.width * k), h = Math.round(state.bmp.height * k);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  cv.getContext("2d").drawImage(state.bmp, 0, 0, cv.width, cv.height);
  state.bmp.close?.(); state.bmp = null;
  el.classList.add("on"); $(".otext", el).textContent = "View once";
  $(".oring circle", el).style.animationDuration = `${ONCE_MS}ms`;
  state.timer = setTimeout(close, ONCE_MS);
}
async function loadPhoto(fid, m, p) {
  S.photos.set(m.id, "");                         // loading
  try {
    const r = await api((group(fid) ? "group-photo/" : "photo/") + m.id, { raw: true });
    const plain = p.v ? await E2E.openPhoto(m.id, p.v, await r.arrayBuffer(), "voice") : await E2E.openPhoto(m.id, p.p, await r.arrayBuffer());
    S.photos.set(m.id, URL.createObjectURL(new Blob([plain], { type: p.v ? voiceMime(p.v.m) : p.p.m === "image/gif" ? "image/gif" : "image/jpeg" })));
    trimPhotos(fid);
  } catch (e) {
    S.photos.delete(m.id);
    // gone, or it can't be opened on this phone: don't fetch it again every time (no signal: it will be)
    if (e.status === 410 || (!e.offline && !(e.status >= 500))) S.photoGone.add(m.id);
  }
  if (S.view === "chat" && S.chat === fid) render();
}
// opened photos and voice notes are kept for the chats you've been in, up to a point: the oldest from other chats go first
function trimPhotos(fid) {
  const MAX = 80; if (S.photos.size <= MAX) return;
  const here = new Set((S.msgs.get(fid) || []).map((m) => m.id));
  for (const [id, url] of S.photos) {
    if (S.photos.size <= MAX) break;
    if (here.has(id) || !url || S.player?.id === id) continue;
    URL.revokeObjectURL(url); S.photos.delete(id);
  }
}

/* ============================================================
   Rendering
   ============================================================ */
const root = () => $("#screen");
let $view, $compose, $tabbar, $layer, $pop, $toast, $ta;
// No zooming the page (only the map zooms, and it handles its own pinches),
// and no copying. iOS ignores user-scalable=no, so stop its gestures here too.
const inField = (t) => !!t?.closest?.("input, textarea, [contenteditable]");
/* ---------- swiping between the tabs ----------
   Drag Messages, Friends or Account sideways and the next tab comes in beside
   it under your finger, the tab bar's highlight sliding along, from anywhere
   on the screen. Anything that scrolls sideways (the In the air strip, once
   it has more cards than fit) scrolls instead. */
// A swipe between tabs that never finished (the touch was taken away mid-way: a
// screenshot, the app going to the background, a second finger) mustn't leave
// the next tab's preview, or the screen part-way across, behind.
let swipeLive = false;
function clearSwipes() {
  const left = document.querySelectorAll("main.tabpeek");
  if (swipeLive || !left.length) return;                 // (only ever a tab swipe's leftovers: a back swipe in a chat is left alone)
  left.forEach((p) => p.remove());
  root()?.classList.remove("swiping"); $(".tabs", $tabbar)?.classList.remove("paging");
  if ($view?.style.transform && !$view.classList.contains("nav-push") && !$view.classList.contains("nav-pop")) { $view.style.transition = "none"; $view.style.transform = ""; void $view.offsetWidth; $view.style.transition = ""; }
}
let swipeReset = () => {};
const swipeGone = () => { if (!swipeLive) return; swipeLive = false; swipeReset(); clearSwipes(); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") swipeGone(); });
// a new touch anywhere while one is still "swiping" means that one was taken away
document.addEventListener("touchstart", (e) => { if (swipeLive && e.touches.length === 1) swipeGone(); }, { capture: true, passive: true });
function tabSwipe() {
  const r = root(), v = $view; let st = null;
  swipeReset = () => { st = null; };
  const tabs = () => $(".tabs", $tabbar);
  const sideways = (el) => { for (let n = el; n && n !== v; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true; return false; };
  const place = (s) => {
    const side = s.dx < 0 ? 1 : s.dx > 0 ? -1 : 0, j = s.i + side, has = !!side && j >= 0 && j < s.ids.length;
    if (side !== s.side) { s.peek?.remove(); s.peek = has ? tabPeek(s.ids[j], side) : null; s.side = side; }
    const x = s.peek ? s.dx : s.dx * 0.25;                       // no tab that way: just a little give
    v.style.transform = `translateX(${x}px)`;
    if (s.peek) s.peek.style.transform = `translateX(${side * s.w + x}px)`;
    tabs()?.style.setProperty("--tab", String(Math.max(0, Math.min(s.ids.length - 1, s.i - x / s.w))));
  };
  v.addEventListener("touchstart", (e) => {
    st = null;
    const ids = TABS.map(([id]) => id), i = ids.indexOf(S.view), t = e.target;
    if (i < 0 || e.touches.length !== 1 || S.sheet || S.locked || $pop.firstElementChild || v.style.transform) return;
    if (t.closest?.("input:focus, textarea, select, .rail") || sideways(t)) return;   // (a search box you aren't typing in swipes too; the cards in the air never do, even when they all fit)
    const p = e.touches[0];
    st = { ids, i, x: p.clientX, y: p.clientY, lx: p.clientX, ly: p.clientY, lt: performance.now(), vx: 0, vy: 0, dx: 0, w: r.clientWidth, dir: null, side: 0, peek: null };
  }, { passive: true });
  v.addEventListener("touchmove", (e) => {
    if (!st) return;
    if (holding() && !st.dir) { st = null; return; }               // a hold opened a menu: this touch is spent
    const p = e.touches[0], dx = p.clientX - st.x, dy = p.clientY - st.y;
    if (!st.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy)) { st = null; return; }    // up and down: it scrolls
      st.dir = "x"; swipeLive = true; r.classList.add("swiping"); v.style.transition = "none"; tabs()?.classList.add("paging");
    }
    e.preventDefault(); speed(st, p.clientX, p.clientY);
    st.dx = dx; place(st);
  }, { passive: false });
  const end = (cancel) => {
    if (!st) return; const s = st; st = null;
    if (!s.dir) return;
    const side = s.side, j = s.i + side;
    const commit = !cancel && !!s.peek && (Math.abs(s.dx) > s.w * 0.35 || (Math.abs(s.vx) > 0.35 && Math.sign(s.vx) === Math.sign(s.dx) && Math.abs(s.dx) > 20));
    const t = tabs();
    if (t) {                                                       // the highlight glides the rest of the way, its tab lighting up now
      t.classList.remove("paging"); t.style.setProperty("--tab", String(commit ? j : s.i));
      if (commit) { t.dataset.tab = String(j); t.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === s.ids[j]))); }
    }
    settle([[v, commit ? `translateX(${-side * 100}%)` : "translateX(0)"], [s.peek, commit ? "translateX(0)" : `translateX(${side * 100}%)`]], null, commit ? 280 : 220, () => {
      if (commit) { S.navQuiet = true; go(s.ids[j]); }           // the tab drawn for real, just where its preview was
      v.style.transition = "none"; v.style.transform = "";
      s.peek?.remove(); r.classList.remove("swiping"); swipeLive = false;     // (still "live" while it glides home, so nothing tidies it early)
      void v.offsetWidth; v.style.transition = "";
    });
  };
  v.addEventListener("touchend", () => end(false)); v.addEventListener("touchcancel", () => end(true));
}
/* ---------- hold a chat (or a message) for its menu ----------
   Hold a chat in Messages (or right-click it): the row sinks a little, then
   lifts above the blurred screen with a menu of what you'd do to it without
   opening it. Hold a message in a chat: its menu, as a tap gives (as on
   iPhone). The touch that opened the menu isn't also a tap, swipe or pull. */
let heldAt = 0;
const holding = () => Date.now() - heldAt < 30e3 && heldAt > 0;
function holdRows() {
  const v = $view; let sink = 0, timer = 0, row = null, x = 0, y = 0;
  const cancel = () => { clearTimeout(sink); clearTimeout(timer); row?.classList.remove("pressing"); row = null; };
  v.addEventListener("touchstart", (e) => {
    cancel(); heldAt = 0;
    const r = e.target.closest?.(".mlist .mrow, .msgs .b[data-act]"), msg = !!r?.classList.contains("b");
    if (!r || e.touches.length !== 1 || S.view !== (msg ? "chat" : "messages") || S.sheet || $pop.firstElementChild) return;
    if (msg && e.target.closest("button, a, audio, input") !== null && e.target.closest("button") !== r) return;    // a play button or link in it has its own
    row = r; x = e.touches[0].clientX; y = e.touches[0].clientY;
    sink = setTimeout(() => row?.classList.add("pressing"), 140);
    timer = setTimeout(() => { const r2 = row; cancel(); heldAt = Date.now(); if (msg) { haptic("tick"); r2.click(); } else rowMenu(r2); }, msg ? 420 : 480);
  }, { passive: true });
  v.addEventListener("touchmove", (e) => {
    if (holding()) { if (e.cancelable) e.preventDefault(); return; }   // the list stays put under the menu
    if (row && Math.hypot(e.touches[0].clientX - x, e.touches[0].clientY - y) > 8) cancel();
  }, { passive: false });
  v.addEventListener("touchend", (e) => { if (holding() && e.cancelable) e.preventDefault(); cancel(); }, { passive: false });   // (no tap after a hold)
  v.addEventListener("touchcancel", cancel);
  // a right-click, or the menu key on a chat that has focus
  v.addEventListener("contextmenu", (e) => {
    const r = e.target.closest?.(".mlist .mrow, .msgs .b[data-act]"); if (!r) return;
    e.preventDefault();
    if (!$(".menu-pop:not(.closing)", $pop)) { if (r.classList.contains("b")) r.click(); else rowMenu(r); }
  });
}
function rowMenu(r) {
  const id = r.dataset.id, g = group(id), f = g ? null : friend(id);
  if (!g && !f) return;
  haptic("tick");
  openMenu(r, [
    (g || f).unread ? { label: "Mark as Read", icon: I.check, act: "rowread", id } : null,
    g ? { label: g.muted ? "Unmute" : "Mute", icon: I.bell, act: "rowmute", id } : null,
    g ? { label: "Group Info", icon: I.info, act: "groupinfo", id } : { label: "Info", icon: I.info, act: "friendinfo", id },
    g ? { label: "Leave Group", icon: I.minusp, act: "groupleaveask", id, destructive: true } : { label: "Remove Friend", icon: I.minusp, act: "unfriendask", id, destructive: true },
  ].filter(Boolean));
  // the chat itself, lifted clear of the blur (tap it to open the chat)
  const box = root().getBoundingClientRect(), a = r.getBoundingClientRect(), c = r.cloneNode(true);
  c.classList.remove("pressing"); c.classList.add("lifted");
  c.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
  c.style.top = `${a.top - box.top}px`; c.style.left = `${a.left - box.left}px`; c.style.width = `${a.width}px`; c.style.height = `${a.height}px`;
  $(".menu-scrim", $pop)?.classList.add("blur");
  $pop.insertBefore(c, $(".menu-pop", $pop));
}
// The tab beside this one, drawn as it will be (a lifeless copy) to slide in with the swipe.
function tabPeek(id, side) {
  const p = document.createElement("main");
  p.className = `view tabs-pad tabpeek${id === "messages" ? " plain" : ""}`; p.setAttribute("aria-hidden", "true"); p.inert = true;
  p.innerHTML = id === "friends" ? vFriends() : id === "account" ? vAccount() : vMessages();
  const slot = $(".airslot", p);
  if (slot) {
    if (airEl?.classList.contains("has")) { const a = airEl.cloneNode(true); a.querySelectorAll(".enter").forEach((c) => c.classList.remove("enter")); slot.replaceWith(a); }
    else slot.remove();
  }
  p.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
  p.querySelectorAll("[data-eta]").forEach((e) => { e.textContent = fmtDur(+e.dataset.eta - now()); });
  for (const [list, q] of [["m", S.q], ["f", S.fq]]) {
    const term = q.trim().toLowerCase();
    if (term) p.querySelectorAll(`[data-list="${list}"] [data-find]`).forEach((row) => { row.hidden = !row.dataset.find.includes(term); });
  }
  p.style.top = `${$view.offsetTop}px`; p.style.height = `${$view.offsetHeight}px`; p.style.transform = `translateX(${side * 100}%)`;
  $view.after(p);
  setProgress(p);
  return p;
}
/* ---------- pull to refresh (Messages and Friends) ----------
   Pull down from the top: a pigeon drops in, its wings opening as you pull.
   Let go past the line and it flaps while everything syncs. */
const PTR_AT = 70;
// Haptics: a tap of feedback. iPhone's Safari has no vibration API, but
// flipping a switch control gives the system's own tick (iOS 18 and later),
// so a hidden one is flipped; elsewhere, navigator.vibrate. Off in Appearance.
let hapticEl = null;
// The way a pigeon goes (How It Flies → Route), kept on this phone for the next one
const ROUTES = [["fastest", "Fastest", "The quickest way: around storms, riding the wind", I.wind, "blue"],
  ["scenic", "Scenic", "Past up to two landmarks for their postmarks, a little further", I.loc, "green"],
  ["safe", "Safe", "Rests on islands rather than cross long seas, and halves Pigeon Death’s risk", I.shield, "teal"]];
const routeStyle = () => { try { const v = localStorage.getItem("inflight-route"); return ROUTES.some((r) => r[0] === v) ? v : "fastest"; } catch (_) { return "fastest"; } };
const hapticsOn = () => { try { return localStorage.getItem("inflight-haptics") !== "0"; } catch (_) { return true; } };
function haptic(kind = "tick") {
  if (!hapticsOn()) return;
  try {
    if (navigator.vibrate && !/iPhone|iPad/.test(navigator.userAgent)) { navigator.vibrate(kind === "success" ? [10, 70, 16] : kind === "heavy" ? [22, 40, 22] : 8); return; }
    if (!hapticEl) { hapticEl = document.createElement("label"); hapticEl.className = "hapt"; hapticEl.setAttribute("aria-hidden", "true"); hapticEl.innerHTML = '<input type="checkbox" switch tabindex="-1">'; document.body.appendChild(hapticEl); }
    hapticEl.click();
    if (kind === "success" || kind === "heavy") setTimeout(() => hapticEl.click(), kind === "heavy" ? 60 : 110);
  } catch (_) { /* no haptics here */ }
}
function pullToRefresh() {
  const v = $view, ind = $(".ptr", root()), bird = $(".ptrb", ind);
  let y0 = null, x0 = 0, down = false, pull = 0, ready = false, busy = false;
  const can = () => (S.view === "messages" || S.view === "friends") && !S.sheet && !busy;
  const show = (px, anim) => {
    for (const el of [v, ind]) el.classList.toggle("ptr-anim", !!anim);
    v.style.transform = px ? `translateY(${px}px)` : "";
    ind.style.transform = `translateY(${px / 2 - 19}px)`;                 // in the middle of the gap that opens
    ind.style.opacity = String(Math.min(1, px / 40));
    bird.style.setProperty("--w", String(0.35 + 0.65 * Math.min(1, px / PTR_AT)));
    bird.style.setProperty("--r", `${Math.min(1, px / PTR_AT) * -14}deg`);
  };
  v.addEventListener("touchstart", (e) => { y0 = e.touches.length === 1 && v.scrollTop <= 0 && can() ? e.touches[0].clientY : null; x0 = e.touches[0]?.clientX || 0; down = false; pull = 0; ready = false; }, { passive: true });
  v.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    if (holding() && !pull) { y0 = null; return; }
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (!down) {                                          // sideways is a swipe to the next tab, not a pull
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) >= Math.abs(dy)) { y0 = null; return; }
      down = true;
    }
    if (dy <= 0 || v.scrollTop > 0) { if (pull) { pull = 0; show(0); } return; }
    e.preventDefault();                                   // ours, not the page's own bounce
    pull = Math.min(130, dy * 0.5);
    if (!ready && pull >= PTR_AT) { ready = true; ind.classList.add("ready"); haptic("tick"); }
    else if (ready && pull < PTR_AT) { ready = false; ind.classList.remove("ready"); }
    show(pull);
  }, { passive: false });
  const end = async () => {
    if (y0 == null) return; y0 = null;
    ind.classList.remove("ready");
    if (pull < PTR_AT) { show(0, true); return; }
    busy = true; ind.classList.add("busy"); show(PTR_AT - 6, true);
    try { await Promise.all([sync(), new Promise((r) => setTimeout(r, 700))]); } catch (_) {}
    ind.classList.remove("busy"); busy = false; show(0, true);
  };
  v.addEventListener("touchend", end); v.addEventListener("touchcancel", end);
}
/* ---------- getting around by touch ----------
   As on iPhone: swipe in from the left edge to go back (the screen you came
   from shows underneath as you go), swipe a sheet down to close it, swipe a
   photo away, flick a banner up, and tap any empty space to put the keyboard
   away. Escape closes whatever is on top, for a keyboard. */
const EDGE = 28;                                                   // how near the left edge a back swipe starts
const speed = (st, x, y) => { const t = performance.now(), dt = Math.max(1, t - st.lt); st.vx = (x - st.lx) / dt; st.vy = (y - st.ly) / dt; st.lx = x; st.ly = y; st.lt = t; };
const settle = (els, css, ms, then) => {
  const quick = STILL.matches;
  for (const [el, tf, op] of els) { if (!el) continue; el.style.transition = quick ? "none" : `transform ${ms}ms cubic-bezier(.25,.75,.35,1), opacity ${ms}ms ease`; el.style.transform = tf; if (op != null) el.style.opacity = op; }
  setTimeout(then, quick ? 0 : ms + 30);                           // (a beat over, so the last frame has landed)
};
const unstyle = (...els) => { for (const el of els) if (el) { el.style.transition = el.style.transform = el.style.opacity = el.style.animation = ""; } };
// what you'd see behind the screen you're on: the one you came from, as you left it
function underlay() {
  const u = S.under, box = document.createElement("div");
  box.className = `under${u?.plain ? " plain" : ""}`; box.setAttribute("aria-hidden", "true"); box.inert = true;
  if (u) {
    // copies (not re-parsed HTML), so the page's own styling comes along
    const v = u.node.cloneNode(true); v.classList.remove("nav-push", "nav-pop", "nav-fade", "swiped"); v.style.transform = "";
    v.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id")); box.append(v);
    if (u.tabs) { const t = u.tabs.cloneNode(true); t.hidden = false; box.append(t); }
    requestAnimationFrame(() => { v.scrollTop = u.top; });
  }
  const dim = document.createElement("div"); dim.className = "under-dim"; box.append(dim);
  root().prepend(box);
  return box;
}
function edgeBack() {
  const r = root(); let st = null;
  const backBtn = () => (S.sheet || $pop.firstElementChild || S.locked || onceOpen ? null : $(".nb-left .nbtn.back, .nb-left .nbtn[data-act=cancelunlock]", $view));
  const moving = () => [$view, $compose.hidden ? null : $compose];
  const place = (s2, dx) => {
    const p = Math.min(1, dx / s2.w);
    for (const el of moving()) if (el) el.style.transform = `translateX(${dx}px)`;
    s2.box.style.transform = `translateX(${-28 * (1 - p)}%)`; s2.box.lastChild.style.opacity = String(0.14 * (1 - p));
    const past = dx > s2.w * 0.35; if (past !== s2.past) { s2.past = past; if (past) haptic("tick"); }
  };
  r.addEventListener("touchstart", (e) => {
    st = null;
    const t = e.touches[0]; if (e.touches.length !== 1 || t.clientX - r.getBoundingClientRect().left > EDGE) return;
    const b = backBtn(); if (b) st = { b, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, lt: performance.now(), vx: 0, dx: 0, w: r.clientWidth, dir: null };
  }, { passive: true });
  r.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.dir) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (dx <= 0 || Math.abs(dy) > dx) { st = null; return; }
      st.dir = "x"; st.box = underlay(); r.classList.add("swiping");
      for (const el of moving()) if (el) { el.style.transition = "none"; el.classList.add("swiped"); }
    }
    e.preventDefault(); speed(st, t.clientX, t.clientY);
    st.dx = Math.max(0, dx); place(st, st.dx);
  }, { passive: false });
  const end = (cancel) => {
    if (!st) return; const s2 = st; st = null;
    if (!s2.dir) return;
    const go = !cancel && (s2.dx > s2.w * 0.35 || (s2.vx > 0.45 && s2.dx > 24));
    const els = moving();
    const done = () => {
      if (go) { S.navQuiet = true; s2.b.click(); }
      // back in place in one step: the screen's own transition mustn't replay the slide
      for (const el of els) if (el) { el.style.transition = "none"; el.style.transform = el.style.opacity = ""; el.classList.remove("swiped"); }
      s2.box.remove(); r.classList.remove("swiping");
      void $view.offsetWidth;
      for (const el of els) if (el) el.style.transition = "";
    };
    settle([...els.map((el) => [el, go ? "translateX(100%)" : "translateX(0)"]), [s2.box, go ? "translateX(0)" : "translateX(-28%)"], [s2.box.lastChild, null, go ? "0" : "0.14"]], null, go ? 260 : 220, done);
  };
  r.addEventListener("touchend", () => end(false)); r.addEventListener("touchcancel", () => end(true));
}
function sheetDrag() {
  let st = null;
  $layer.addEventListener("touchstart", (e) => {
    st = null;
    const sh = e.target.closest?.(".sheet"), t = e.touches[0];
    if (!sh || sh.classList.contains("closing") || e.touches.length !== 1) return;
    const body = $(".body", sh), head = !!e.target.closest(".grab, .sheet > header");
    // from its top, or anywhere once it's scrolled to the top (not on the map, a field or a list that slides sideways)
    if (!head && (!body || body.classList.contains("flush") || body.scrollTop > 0 || e.target.closest("input, textarea, select, canvas, .gifgrid"))) return;
    st = { sh, body, head, scrim: $(".scrim", $layer), y: t.clientY, x: t.clientX, lx: t.clientX, ly: t.clientY, lt: performance.now(), vy: 0, dy: 0, h: sh.offsetHeight, dir: null };
  }, { passive: true });
  $layer.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.dir) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (dy <= 0 || Math.abs(dx) > dy || (!st.head && st.body.scrollTop > 0)) { st = null; return; }
      st.dir = "y"; st.sh.style.transition = "none"; if (st.scrim) st.scrim.style.transition = "none";
      document.activeElement?.blur?.();
    }
    e.preventDefault(); speed(st, t.clientX, t.clientY);
    st.dy = Math.max(0, dy);
    st.sh.style.transform = `translateY(${st.dy}px)`;
    if (st.scrim) st.scrim.style.opacity = String(Math.max(0, 1 - st.dy / st.h));
  }, { passive: false });
  const end = (cancel) => {
    if (!st) return; const s2 = st; st = null;
    if (!s2.dir) return;
    const go = !cancel && (s2.dy > s2.h * 0.25 || (s2.vy > 0.6 && s2.dy > 40));
    settle([[s2.sh, go ? "translateY(100%)" : "translateY(0)"], [s2.scrim, "", go ? "0" : "1"]], null, go ? 240 : 260, () => {
      if (!go) { unstyle(s2.sh, s2.scrim); return; }
      // already out of sight: closing shouldn't play its own slide again
      s2.sh.style.animation = "none"; if (s2.scrim) s2.scrim.style.animation = "none";
      closeTop();
    });
  };
  $layer.addEventListener("touchend", () => end(false)); $layer.addEventListener("touchcancel", () => end(true));
}
// the photo: swipe it away, up or down
function viewerDrag() {
  let st = null;
  $layer.addEventListener("touchstart", (e) => {
    const v = e.target.closest?.(".viewer"); st = null;
    if (v && e.touches.length === 1) st = { v, img: $("img", v), y: e.touches[0].clientY, x: e.touches[0].clientX, ly: e.touches[0].clientY, lx: e.touches[0].clientX, lt: performance.now(), vy: 0, dy: 0, dir: null };
  }, { passive: true });
  $layer.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.dir) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; if (Math.abs(dx) > Math.abs(dy)) { st = null; return; } st.dir = "y"; st.img.style.transition = st.v.style.transition = "none"; }
    e.preventDefault(); speed(st, t.clientX, t.clientY); st.dy = dy;
    st.img.style.transform = `translateY(${dy}px) scale(${1 - Math.min(0.2, Math.abs(dy) / 1500)})`;
    st.v.style.backgroundColor = `rgba(0,0,0,${Math.max(0.35, 1 - Math.abs(dy) / 500)})`;
  }, { passive: false });
  $layer.addEventListener("touchend", () => {
    if (!st) return; const s2 = st; st = null;
    if (!s2.dir) return;
    if (Math.abs(s2.dy) > 90 || Math.abs(s2.vy) > 0.7) {
      settle([[s2.img, `translateY(${s2.dy > 0 ? "" : "-"}110vh)`]], null, 220, () => { s2.v.style.animation = "none"; s2.v.style.opacity = "0"; S.sheet = null; renderSheet(); });
    } else settle([[s2.img, "translateY(0)"]], null, 220, () => { unstyle(s2.img); s2.v.style.backgroundColor = ""; });
  });
}
// a banner: flick it up and it goes
function toastSwipe() {
  let st = null;
  $toast.addEventListener("touchstart", (e) => {
    const t = e.target.closest?.(".toast"); st = t && e.touches.length === 1 ? { t, y: e.touches[0].clientY, ly: e.touches[0].clientY, lx: 0, lt: performance.now(), vy: 0, dy: 0 } : null;
    if (st) clearTimeout(toastTimer);
  }, { passive: true });
  $toast.addEventListener("touchmove", (e) => {
    if (!st) return;
    const y = e.touches[0].clientY; speed(st, 0, y); st.dy = y - st.y;
    if (Math.abs(st.dy) < 4) return;
    e.preventDefault(); st.t.style.animation = "none"; st.t.style.transition = "none";
    st.t.style.transform = `translateY(${st.dy < 0 ? st.dy : st.dy * 0.2}px)`;
  }, { passive: false });
  $toast.addEventListener("touchend", () => {
    if (!st) return; const s2 = st; st = null;
    if (s2.dy < -24 || s2.vy < -0.4) settle([[s2.t, "translateY(-160%)", "0"]], null, 200, () => s2.t.remove());
    else { settle([[s2.t, "translateY(0)"]], null, 200, () => unstyle(s2.t)); toastTimer = setTimeout(hideToast, 3000); }
  });
}
// close the sheet on top the way its ✕ would (so drafts, questions and Back all behave)
function closeTop() {
  const sc = $(".sheet ~ .scrim, .scrim", $layer);
  if (sc) return sc.click();
  const b = document.createElement("button"); b.hidden = true; b.dataset.act = "close"; root().append(b); b.click(); b.remove();
}
function navGestures() {
  edgeBack(); sheetDrag(); viewerDrag(); toastSwipe();
  // tapping somewhere empty puts the keyboard away
  document.addEventListener("click", (e) => {
    const a = document.activeElement;
    if (a === $ta && performance.now() - focusedAt < 700) return;          // a stray tap as the keyboard arrives isn't "put it away"
    if (!inField(a) || e.target === a || e.target.closest?.("input, textarea, select, button, a, label, [data-act], [contenteditable], .field-wrap, .compose, .fcell, .search")) return;
    a.blur();
  });
  // Escape: the menu or question first, then the sheet, then back
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (onceOpen) { onceOpen.el.click(); return; }   // a view-once photo closes first
    if ($pop.firstElementChild) { closePop(); return; }
    if (S.sheet) { closeTop(); return; }
    if (inField(document.activeElement)) { document.activeElement.blur(); return; }
    $(".nb-left .nbtn.back", $view)?.click();
  });
}
function lockPage() {
  document.addEventListener("touchstart", () => {}, { passive: true });    // lets :active press states show on iPhone
  const stop = (e) => e.preventDefault();
  ["gesturestart", "gesturechange", "gestureend"].forEach((n) => document.addEventListener(n, stop, { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });   // two fingers never zoom the page (the map pinches itself)
  // a quick second tap in the same spot zooms on older iOS: stop that, and only that.
  // (Not after a scroll or a tap somewhere else, and never on anything you can
  // tap: those taps are meant, and touch-action already keeps them from zooming.)
  let last = null, start = null;
  document.addEventListener("touchstart", (e) => { const t = e.touches[0]; start = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true, capture: true });
  document.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0], now = Date.now(), tap = !!start && !!t && Math.hypot(t.clientX - start.x, t.clientY - start.y) < 10;
    if (tap && last && now - last.at < 300 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 30
      && !e.target.closest?.(".map, input, textarea, select, button, label, a, [data-act], [role=button]")) e.preventDefault();
    last = tap && t ? { at: now, x: t.clientX, y: t.clientY } : null;
  }, { passive: false });
  for (const n of ["copy", "cut", "contextmenu", "selectstart", "dragstart"]) document.addEventListener(n, (e) => { if (!inField(e.target)) e.preventDefault(); });
  // if the page ends up zoomed anyway (an older copy allowed it), put it back: text size comes from the phone's own setting instead
  const vv = window.visualViewport, meta = document.querySelector('meta[name="viewport"]');
  if (vv && meta) vv.addEventListener("resize", () => {
    if (vv.scale <= 1.01 || inField(document.activeElement)) return;
    const was = meta.content;
    meta.content = was + ", maximum-scale=1";
    setTimeout(() => { meta.content = was; }, 300);
  });
}
// What you press shows it at once (a little smaller and a shade deeper, .down),
// and long enough to see on a quick tap: the phone's own pressed look comes late,
// or not at all, for a tap that's over in a moment.
function pressFeedback(el) {
  let held = null, at = 0;
  const release = () => { const b = held; if (!b) return; held = null; setTimeout(() => b.classList.remove("down"), Math.max(0, 120 - (performance.now() - at))); };
  el.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled || !el.contains(b)) return;
    release(); held = b; at = performance.now(); b.classList.add("down");
  }, { passive: true });
  for (const n of ["pointerup", "pointercancel"]) el.addEventListener(n, release, { passive: true });
  window.addEventListener("blur", release);
}
// The message box, to the touch: a tap anywhere on it (or just above it) puts
// you in it, even if the finger drifts a little, and a finger that drifts on
// it never drags the screen along. Only a long message scrolls, inside its box.
let focusedAt = 0;
function composeTouch() {
  const TAP = 30;
  let t0 = null;
  $compose.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    t0 = e.touches.length === 1 ? { x: p.clientX, y: p.clientY, at: performance.now(), scrolls: e.target === $ta && $ta.scrollHeight > $ta.clientHeight + 1, far: false, moved: false, select: false } : null;
  }, { passive: true });
  $compose.addEventListener("touchmove", (e) => {
    if (!t0) return;
    const p = e.touches[0], d = Math.hypot(p.clientX - t0.x, p.clientY - t0.y);
    // held still first, then moved in the words: that's choosing text or the caret, leave it be
    if (!t0.moved && d > 8) { t0.moved = true; t0.select = e.target === $ta && document.activeElement === $ta && performance.now() - t0.at > 350; }
    if (d > TAP) t0.far = true;
    if (!t0.scrolls && !t0.select && e.cancelable) e.preventDefault();           // the screen stays where it is
  }, { passive: false });
  $compose.addEventListener("touchend", (e) => {
    const s = t0; t0 = null;
    if (!s || s.far || $ta.disabled || $compose.hidden || !$(".crow", $compose)?.offsetParent) return;
    if (e.target.closest("button, a, input, select, label, .recbar")) return;
    if (e.target === $ta && document.activeElement === $ta) return;        // already typing: the caret goes where you tapped
    // Not yet typing: focus it here, inside the touch (iOS only shows the keyboard for that), and cancel the
    // phone's own tap that would follow. That late tap is hit-tested after the screen has shifted for the
    // keyboard, so it can land on the messages above and put the keyboard straight away again.
    e.preventDefault();
    focusedAt = performance.now();
    $ta.focus(); const n = $ta.value.length; $ta.setSelectionRange(n, n);
  }, { passive: false });
  $compose.addEventListener("touchcancel", () => { t0 = null; }, { passive: true });
  // the press that follows a tap (or a click) around the words never takes the focus out of them
  $compose.addEventListener("mousedown", (e) => {
    if (e.target === $ta || e.target.closest("button, a, input, select, label, .recbar")) return;
    e.preventDefault();
    if (document.activeElement !== $ta && !$ta.disabled && $(".crow", $compose)?.offsetParent) { $ta.focus(); const n = $ta.value.length; $ta.setSelectionRange(n, n); }
  });
  // iOS can leave the page nudged up once the keyboard has gone: put it back
  $ta.addEventListener("blur", () => setTimeout(() => { if (window.scrollY && document.activeElement !== $ta) window.scrollTo(0, 0); }, 80));
}
function mount() {
  lockPage();
  setTimeout(() => { pullToRefresh(); tabSwipe(); holdRows(); navGestures(); });
  root().innerHTML = `
    <div class="offline" hidden>You’re offline. Pigeons will wait.</div>
    <div class="ptr" aria-hidden="true"><span class="ptrb">${I.bird}</span></div>
    <main class="view"></main>
    <form class="compose" hidden data-form="compose">
      <div class="note" hidden></div>
      <div class="wxplan" hidden></div>
      <div class="attach" hidden></div>
      <div class="replybar" hidden></div>
      <div class="crow">
        <button type="button" class="plus" data-act="attachmenu" aria-label="Add a photo">${I.plus}</button>
        <div class="field-wrap">
          <button type="button" class="kind" data-act="flysheet" aria-haspopup="dialog" hidden></button>
          <textarea rows="1" placeholder="Message" aria-label="Message" id="msg" maxlength="2000" enterkeyhint="enter"></textarea>
          <button type="submit" class="send" aria-label="Release the pigeon">${I.up}</button>
          <button type="button" class="mic" data-act="recstart" aria-label="Record a voice pigeon" hidden>${I.mic}</button>
        </div>
      </div>
      <div class="recbar" hidden role="group" aria-label="Recording a voice pigeon">
        <button type="button" class="reccancel" data-act="reccancel" aria-label="Cancel recording">${I.trash}</button>
        <span class="recdot" aria-hidden="true"></span><span class="rectime" aria-live="off">0:00</span>
        <span class="recwave" aria-hidden="true"></span>
        <button type="button" class="send recsend" data-act="recsend" aria-label="Send voice pigeon">${I.up}</button>
      </div>
    </form>
    <nav class="tabbar" aria-label="Sections"></nav>
    <input type="file" accept="image/*" id="file-lib" hidden>
    <input type="file" accept="image/*" id="av-lib" hidden>
    <div class="layer"></div>
    <div class="poplayer"></div>
    <div class="toasts"></div>`;
  $view = $(".view"); $compose = $(".compose"); $tabbar = $(".tabbar"); $layer = $(".layer"); $pop = $(".poplayer"); $toast = $(".toasts"); $ta = $("#msg");
  pressFeedback($compose); composeTouch();
  $view.addEventListener("scroll", () => {
    const y = $view.scrollTop;
    const root = !!$view.querySelector(".navbar.root");      // its title shares the bar's row
    $view.classList.toggle("scrolled", y > (root ? 20 : 4));
    $view.classList.toggle("titled", y > (root ? 26 : 38));
    S.stick = $view.scrollHeight - y - $view.clientHeight < 40;
  }, { passive: true });
  root().addEventListener("click", onClick);
  root().addEventListener("change", onChange);
  root().addEventListener("submit", onSubmit);
  root().addEventListener("input", onInput);
  $ta.addEventListener("input", () => { fitTa(); renderCompose(); });
  // With the keyboard up the home bar is hidden, so drop its spacing and sit the
  // message box right on the keyboard. Touch screens only: there's no keyboard to clear otherwise.
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  const typing = (on) => { if (touch) root().classList.toggle("typing", on); };
  $ta.addEventListener("focus", () => { focusedAt = performance.now(); typing(true); });
  $ta.addEventListener("blur", () => typing(false));
  window.visualViewport?.addEventListener?.("resize", () => {          // keyboard closed without leaving the box
    if (window.innerHeight - window.visualViewport.height < 80 && document.activeElement !== $ta) typing(false);
  });
  fitKeyboard();
}
// iOS doesn't shrink the page for the keyboard: it slides the whole page up
// under it, taking the chat's header and Back off the top of the screen. So
// while the keyboard is up, the app is made exactly as tall as the space above
// it, and the page is put back at the top whenever iOS nudges it; the message
// box then sits right on the keyboard and everything above stays in view.
function fitKeyboard() {
  const vv = window.visualViewport; if (!vv || !matchMedia("(pointer: coarse)").matches) return;
  const doc = document.documentElement;
  let raf = 0, was = false;
  const fit = () => {
    raf = 0;
    const kb = window.innerHeight - vv.height > 80 && inField(document.activeElement);
    if (kb) doc.style.setProperty("--app-h", `${Math.round(vv.height)}px`); else doc.style.removeProperty("--app-h");
    doc.classList.toggle("kbup", kb);
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    // the newest message stays in sight as the keyboard comes up (if that's where you were)
    if (kb && !was && S.view === "chat" && S.stick && $view) $view.scrollTop = $view.scrollHeight;
    was = kb;
  };
  const soon = () => { if (!raf) raf = requestAnimationFrame(fit); };
  vv.addEventListener("resize", soon); vv.addEventListener("scroll", soon);
  window.addEventListener("scroll", soon, { passive: true });
  document.addEventListener("focusin", () => { soon(); setTimeout(fit, 350); });     // (and once the keyboard has finished arriving)
  document.addEventListener("focusout", () => setTimeout(fit, 60));
}
function fitTa() {
  if (!$ta.offsetParent) { $ta.style.height = ""; return; }       // hidden (not in a chat): nothing to measure yet
  // empty: one line, however long the hint ("Lands tomorrow 01:15" mustn't make the box two lines tall)
  $ta.style.height = "auto"; $ta.style.height = $ta.value ? Math.min(120, $ta.scrollHeight) + "px" : "";
}
function renderOffline() { const o = $(".offline"); if (o) o.hidden = !S.offline; }

function go(view, chat) {
  if (view === "reset" && S.view !== "reset") { S.view = view; return loadReset(); }
  const same = view === S.view && chat === S.chat, kind = !same && $view ? navKind(S.view, view) : null;
  if (!same && $view) S.nav = S.navQuiet ? null : kind;
  S.noRise = S.navQuiet; S.navQuiet = false;
  if (!S.locked) ghostView();   // copy the old screen now, before anything about it changes
  // going in: keep a still of this screen, to show under a swipe back, and remember where back goes
  if (kind === "push" && S.view !== "chat") {
    S.under = { from: S.view, node: $view.cloneNode(true), top: $view.scrollTop, plain: root().classList.contains("plain"), tabs: $tabbar.hidden ? null : $tabbar.cloneNode(true) };
    if (view === "chat") S.backTo = ["messages", "friends", "account"].includes(S.view) ? S.view : "messages";
  }
  const backTop = !same && S.under && view === S.under.from && S.view !== view ? S.under.top : null;
  // what you'd typed stays with its chat, for when you come back
  if (!same && $ta && S.view === "chat" && S.chat && !(S.busy && S.sendingTo === S.chat)) { const v = $ta.value; if (v.trim()) S.drafts.set(S.chat, v); else S.drafts.delete(S.chat); }
  if (!same && rec) recStop(false);                // a recording never carries on (or sends) after you leave its chat
  S.chatWas = S.chat;
  S.view = view; S.chat = chat ?? null; S.sheet = null; S.err = ""; S.stick = true;
  if (!same && TABS.some(([id]) => id === view) && S.token && Date.now() - (S.lastSync || 0) > 2000) setTimeout(sync, 0);   // a tab you switch to is up to date
  if (view !== "chat" || chat !== S.chatWas) clearAttach();      // (a photo you'd picked stays with its chat; one being sent goes on)
  if (!same && $ta) $ta.value = (view === "chat" && chat && S.drafts.get(chat)) || "";
  closePop();
  if (!same && $view) { $view.scrollTop = 0; $view.classList.remove("scrolled", "titled"); }
  render();
  if (!same && $ta) fitTa();                                      // (after render: the composer is showing now)
  if (backTop != null) { $view.scrollTop = backTop; S.under = null; }   // back where you were
  if (view === "chat" && chat && !S.msgs.has(chat) && S.chatRaw.has(chat)) applyChat(chat, S.chatRaw.get(chat), false).then(() => { if (S.view === "chat" && S.chat === chat) render(); });
  const shown = view === "chat" && chat && (S.msgs.get(chat) || []).length > 0;
  if (view === "chat" && chat) loadChat(chat).then(() => {
    // from the In the air strip: straight on to the map
    const id = S.mapNext; S.mapNext = null;
    if (id && S.chat === chat && (S.msgs.get(chat) || []).some((x) => x.id === id)) S.sheet = { type: "map", id };
    // (a chat already on screen gets its fresh copy once it has slid in: redrawing it mid-slide made it stutter)
    const wait = shown && !S.sheet ? NAV_MS + 20 - (performance.now() - navAt) : 0;
    if (wait > 0) setTimeout(() => { if (S.view === "chat" && S.chat === chat) render(); }, wait); else render();
  }).catch((e) => { if (!e.offline) toast(esc(e.message)); });    // (offline: the banner says so)
}

// How the screen changes, as on iPhone: a chat pushes in from the side and pops
// back; auth steps push forward (back to the start pops); tabs slide a touch
// toward the one you picked as they cross-fade.
function navKind(from, to) {
  if (!from || from === "loading") return null;
  if (to === "chat") return "push";
  if (from === "chat") return "pop";
  if (AUTH_VIEWS.has(to) && AUTH_VIEWS.has(from)) return to === "welcome" ? "pop" : "push";
  const a = TABS.findIndex(([id]) => id === from), b = TABS.findIndex(([id]) => id === to);
  if (a >= 0 && b >= 0) return b > a ? "tab-r" : "tab-l";
  return "fade";
}
let navAt = -1e9;                                  // when the last push or pop began (styles.css: .5s)
const NAV_MS = 500;
// For a push or pop, the old screen stays for a moment as a lifeless copy: it
// slides aside under a new chat, or slides away to reveal the screen behind.
function ghostView() {
  const tab = S.nav === "tab-r" || S.nav === "tab-l";
  if (S.nav !== "push" && S.nav !== "pop" && !tab) return;
  if (STILL.matches) return;                       // less motion: no copy left sliding (it would only sit there, frozen)
  $(".nav-ghost", root())?.remove();
  // the whole old screen: its list or chat, and the tab bar or composer that belongs to it (a tab: just its list,
  // under the new one as it fades in, the tab bar staying where it is)
  const g = document.createElement("div"), v = $view.cloneNode(true), top = $view.scrollTop;
  g.className = `nav-ghost nav-ghost-${tab ? "tab" : S.nav}${root().classList.contains("plain") ? " plain" : ""}`; g.setAttribute("aria-hidden", "true"); g.inert = true;
  v.classList.remove("nav-push", "nav-pop", "nav-fade", "nav-tab-r", "nav-tab-l"); g.append(v);
  if (!tab && !$compose.hidden) { const c = $compose.cloneNode(true), t = $("textarea", c); if (t && $ta) t.value = $ta.value; g.append(c); }
  if (!tab && !$tabbar.hidden) { const t = $tabbar.cloneNode(true); t.classList.remove("rise"); g.append(t); }
  g.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
  g.style.top = `${$view.offsetTop}px`;
  $view.before(g); v.scrollTop = top;
  g.addEventListener("animationend", (e) => { if (e.target === g) g.remove(); });
  setTimeout(() => g.remove(), 900);
}
function animateNav() {
  const kind = S.nav; S.nav = null;
  if (!kind) return;
  const els = kind === "push" && S.view === "chat" ? [$view, $compose] : [$view];
  if (kind === "push" || kind === "pop") navAt = performance.now();
  for (const el of els) {
    el.classList.remove("nav-push", "nav-pop", "nav-fade", "nav-tab-r", "nav-tab-l"); void el.offsetWidth;
    el.classList.add("nav-" + kind);
    if (kind === "fade" || STILL.matches) continue;                 // (no animation runs, so nothing would ever end it)
    el.addEventListener("animationend", function done(e) { if (e.target === el) { el.classList.remove("nav-" + kind); el.removeEventListener("animationend", done); } });
  }
}
// New bubbles pop in once; if the list redraws mid-animation, carry on from where it was.
function playFresh() {
  const t = Date.now();
  for (const [id, at] of S.fresh) if (t - at > 700) S.fresh.delete(id);
  $view.querySelectorAll("[data-fresh]").forEach((el) => { const at = S.fresh.get(el.dataset.fresh); if (at) el.style.animationDelay = `${at - t}ms`; else el.classList.remove("fresh"); });
}
function render() {
  if (!$view) return;
  clearSwipes();
  const auth = AUTH_VIEWS.has(S.view) || !S.me;
  const chat = !auth && S.view === "chat";
  root().classList.toggle("plain", chat || (!auth && S.view === "messages"));
  $view.classList.toggle("tabs-pad", !auth && !chat);
  if (auth) {
    const night = NIGHT_VIEWS.has(S.view);
    if (document.documentElement.classList.contains("night") !== night) { document.documentElement.classList.toggle("night", night); applyTheme(); }
    if (night) nightSky(skyCanvas());
    const box = S.view === "welcome" && !S.nav && $(".welcome .wcta", $view);
    if (box) { box.outerHTML = inviteHtml(); return; }   // already up: just the words change
    $view.innerHTML = vAuth(); $compose.hidden = true; $tabbar.hidden = true; renderSheet(); animateNav();
    if (S.view === "welcome") S.welcomed = true;
    return;
  }
  if (document.documentElement.classList.contains("night")) { document.documentElement.classList.remove("night"); applyTheme(); }
  if (S.locked) { $view.innerHTML = ""; $compose.hidden = true; $tabbar.hidden = true; $layer.innerHTML = ""; drawLock(); return; }
  drawLock();
  const tabsBack = $tabbar.hidden && !chat;
  $tabbar.hidden = chat;
  // the tab bar rises back in, unless a swipe has already shown it there (a class left
  // on from last time would replay the rise as the bar unhides, so it always comes off)
  if (tabsBack) { $tabbar.classList.remove("rise"); if (!S.noRise) { void $tabbar.offsetWidth; $tabbar.classList.add("rise"); } }
  S.noRise = false;
  const keepTop = $view.scrollTop, switches = S.nav ? null : switchStates($view);
  $view.innerHTML = chat ? vChat() : S.view === "friends" ? vFriends() : S.view === "account" ? vAccount() : vMessages();
  if (chat) $view.querySelectorAll("[data-ar]").forEach((el) => { el.style.aspectRatio = el.dataset.ar; });
  if (chat) $view.querySelectorAll("[data-h]").forEach((el) => { el.style.setProperty("--h", el.dataset.h); });
  if (chat && S.player) voiceShow();
  if (chat && S.stick) $view.scrollTop = $view.scrollHeight; else $view.scrollTop = keepTop;
  if (chat) pinChat();
  if (switches?.size) keepGlides($view, switches);
  if (!chat && S.view === "messages") airMount();
  renderCompose(); renderTabs(); renderSheet(); live(); filterLists(); animateNav(); playFresh();
}

// In a chat, stay at the newest message while anything below grows (a photo
// loading, a reply bar opening), unless you've scrolled up to read.
let pinObs = null;
function pinChat() {
  if (!window.ResizeObserver) return;
  if (!pinObs) pinObs = new ResizeObserver(() => { if (S.view === "chat" && S.stick) $view.scrollTop = $view.scrollHeight; });
  pinObs.disconnect();
  const m = $(".msgs", $view); if (m) pinObs.observe(m);
  pinObs.observe($view);
}

/* ---------- shared bits ---------- */
// root: a tab's top screen, whose large title shares the row with the buttons
const navbar = (title, { left = "", right = "", solid = false, root = false, titleHtml = null } = {}) =>
  `<div class="navbar${solid ? " solid" : ""}${root ? ` root b${(right.match(/class="nbtn/g) || []).length}` : ""}"><div class="nb-left">${left}</div><div class="nb-title one">${titleHtml ?? esc(title)}</div><div class="nb-right">${right}</div></div>`;
// The app's own name where Messages' title would be: its icon and InFlight
const brandMark = () => `<span class="brand"><span class="bicon" aria-hidden="true">${I.bird}</span><span class="bword">InFlight</span></span>`;
const nbtn = (act, icon, label, extra = "") => `<button class="nbtn" data-act="${act}" aria-label="${esc(label)}" ${extra}>${icon}</button>`;
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const backBtn = (act, id, label = "") => `<button class="nbtn back" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ""} aria-label="Back">${I.back}${label ? `<span>${esc(label)}</span>` : ""}</button>`;
const cell = ({ act, id, icon, tile, label, sub, val, chev, cls = "", tag }) => {
  const t = tag || (act ? "button" : "div");
  return `<${t} class="cell${icon ? " has-icon" : ""} ${cls}"${act ? ` data-act="${act}"` : ""}${id ? ` data-id="${esc(id)}"` : ""}${t === "button" ? ' type="button"' : ""}>
    ${icon ? `<span class="tile ${tile || "blue"}">${icon}</span>` : ""}
    <span class="ctext"><span>${label}</span>${sub ? `<span class="csub">${sub}</span>` : ""}</span>
    ${val != null ? `<span class="val">${val}</span>` : ""}${chev ? I.chev.replace('class="ico"', 'class="ico chev"') : ""}</${t}>`;
};
const chevSm = I.chev.replace('class="ico"', 'class="ico chev"');
const pg = (kind, skin) => kind === "mystery" ? `<span class="pg mystery" aria-hidden="true">?</span>` : `<span class="pg ${kind}${skin && SKINS[skin] ? " sk-" + skin : ""}" aria-hidden="true">${I.bird}</span>`;     // a pigeon in its colour (and its look, if rare)
const pgm = (m) => pg(kindOf(m), m?.skin);

const onceP = (p) => !!p?.p && p.p.m !== "image/gif";
const picWord = (p) => (p.v ? "Voice pigeon" : p.p?.m === "image/gif" ? "GIF" : "Photo");
// A pigeon in the air, in a list: yours with its pigeon and when it lands, theirs sealed
const riderIcon = (m) => `<span class="rider k-${kindOf(m)}">${I.bird}</span>`;
const sealedIcon = (m) => `<span class="sealedi k-${kindOf(m)}">${I.lock}</span>`;
function preview(f) {
  const out = S.outbox.filter((o) => o.to === f.id).at(-1);
  if (out) return { html: `<span class="${out.err ? "lostp" : "fl"}">${out.err ? I.warn : I.clock} ${out.err ? "Not sent" : "Waiting for signal"}</span>`, at: out.at };
  const l = f.last;
  if (!l) return { html: "No messages yet", at: 0 };
  if (l.recalled) return { html: `<span class="homing">${I.homing} ${l.from === S.me.id ? "You called your pigeon back" : `${esc(first(f.name))} called their pigeon back`}</span>`, at: l.lostAt };
  if (l.lost) return { html: `<span class="lostp">${I.skull} ${l.from === S.me.id ? "Your pigeon was lost on the way" : "A pigeon was lost on its way"}</span>`, at: l.lostAt };
  if (l.from === S.me.id && l.flying) return { html: `<span class="upp">${riderIcon(l)}In the air · lands ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  if (l.from !== S.me.id && l.flying) return { html: `<span class="upp">${sealedIcon(l)}Sealed · lands ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? (p.unchecked ? "Check their new safety number to read this" : "Couldn’t open this message") : p.v ? `Voice pigeon (${fmtClip(p.v.d)})${l.photo === 2 ? " · expired" : ""}` : p.p ? (l.photo === 2 ? `${picWord(p)} (expired)` : picWord(p)) + (p.t ? ": " + p.t : "") : p.t;
  return { html: (l.from === S.me.id ? "You: " : "") + esc(body), at: l.deliverAt };
}
// how far a flock has got: landed for how many of how many, and how many lost
function flockCount(m) {
  const fl = m.flock || [], landed = fl.filter((x) => !x.flying && !x.lost).length, lost = fl.filter((x) => x.lost && !x.recalled).length, recalled = fl.filter((x) => x.recalled).length;
  const next = fl.filter((x) => x.flying).reduce((a, x) => Math.min(a, x.deliverAt), Infinity);
  return { n: fl.length, landed, lost, recalled, next: next === Infinity ? null : next };
}
function gpreview(g) {
  const out = S.outbox.filter((o) => o.to === g.id).at(-1);
  if (out) return { html: `<span class="${out.err ? "lostp" : "fl"}">${out.err ? I.warn : I.clock} ${out.err ? "Not sent" : "Waiting for signal"}</span>`, at: out.at };
  const l = g.last;
  if (!l) return { html: `${others(g).map((p) => esc(first(p.name))).join(", ")}`, at: g.createdAt };
  const who = l.from === S.me.id ? "You" : esc(first(member(g, l.from)?.name || "Someone"));
  if (l.from === S.me.id && l.recalled && !flockCount(l).landed) return { html: `<span class="homing">${I.homing} You called your pigeons back</span>`, at: l.sentAt };
  if (l.from !== S.me.id && l.recalled) return { html: `<span class="homing">${I.homing} ${who} called their pigeon back</span>`, at: l.lostAt };
  if (l.from === S.me.id && l.lost) return { html: `<span class="lostp">${I.skull} Your pigeons were lost on the way</span>`, at: l.sentAt };
  if (l.from === S.me.id && l.flying) { const c = flockCount(l); return { html: `<span class="upp">${riderIcon(l)}In the air · ${c.landed} of ${c.n} landed</span>`, at: l.sentAt }; }
  if (l.from !== S.me.id && l.lost) return { html: `<span class="lostp">${I.skull} ${who}’s pigeon was lost on its way</span>`, at: l.lostAt };
  if (l.from !== S.me.id && l.flying) return { html: `<span class="upp">${sealedIcon(l)}${who}: sealed · lands ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? "Couldn’t open this message" : p.v ? `Voice pigeon (${fmtClip(p.v.d)})` : p.p ? picWord(p) + (p.t ? ": " + p.t : "") : p.t;
  return { html: `${who}: ${esc(body)}`, at: l.from === S.me.id ? l.sentAt : l.deliverAt };
}
const fmtListTime = (ts) => { if (!ts) return ""; if (sameDay(ts, now())) return fmtTime(ts); if (sameDay(ts, now() - DAY)) return "Yesterday"; const d = new Date(ts); return now() - ts < 6 * DAY ? DOW[d.getDay()] : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };

/* ---------- flight streaks: days in a row with a pigeon between you ---------- */
const STREAK_MIN = 3;
const streakOf = (f) => (f?.streak && f.streak.n >= STREAK_MIN ? f.streak : null);
// alive but nothing sent today, and under six hours to go
const streakRisk = (s) => s && !s.today && s.endsAt - now() < 6 * HOUR;
const streakLeft = (s) => fmtDur(Math.max(MIN, s.endsAt - now()));
const streakBadge = (f) => { const s = streakOf(f); return s ? `<span class="streak${streakRisk(s) ? " risk" : ""}" aria-label="${s.n}-day flight streak${streakRisk(s) ? `, ends in ${esc(streakLeft(s))}` : ""}">${I.flame}${s.n}</span>` : ""; };

// A new season: its look, for anyone, until it ends
function seasonCard() {
  const s = seasonNow(); if (!s || !S.me) return "";
  try { if (localStorage.getItem("inflight-season") === s.key) return ""; } catch (_) { return ""; }
  return `<div class="seasoncard" role="note"><span class="semoji" aria-hidden="true">${s.emoji}</span><span class="stext"><b>${esc(s.words)} pigeons are here</b>
    <span>Give yours the ${esc(s.look)} look until ${esc(fmtDate(s.to - 1))}. Send 10 pigeons by then and it’s yours to keep.</span>
    <span class="sbtns"><button type="button" class="btn small" data-act="seasontry">Try It</button><button type="button" class="btn small plain" data-act="seasonhide">Not Now</button></span></span></div>`;
}

/* ---------- Messages ---------- */
function vMessages() {
  const fr = [
    ...S.friends.map((f) => ({ f, ...preview(f) })).filter((x) => x.f.last || S.outbox.some((o) => o.to === x.f.id)),
    ...S.groups.map((g) => ({ f: g, g, ...gpreview(g) })),
  ].sort((a, b) => b.at - a.at);
  const rows = fr.map(({ f, g, html, at }) => `<button class="mrow${g ? " grow" : ""}" data-act="open" data-id="${esc(f.id)}" data-find="${esc((g ? g.name + " " + g.members.map((p) => p.name).join(" ") : f.name + " " + f.handle).toLowerCase())}">
      ${f.unread ? `<span class="dot" aria-label="Unread"></span>` : ""}
      ${g ? gavatar(g, "m") : avatar(f, "m", true)}
      <span class="mtext">
        <span class="mtop"><span class="mname one">${esc(g ? g.name : first(f.name))}</span>${g ? "" : streakBadge(f)}<time>${fmtListTime(at)}</time>${chevSm}</span>
        <span class="mprev">${S.drafts.get(f.id)?.trim() ? `<span class="draft">Draft:</span> ${esc(S.drafts.get(f.id).trim().replace(/\s+/g, " "))}` : html}</span>
      </span>
    </button>`).join("");
  // nothing on this phone yet and the first sync still on its way: placeholder rows, not "No messages"
  if (!rows && !S.started && !S.fromCache) return `${navbar("Messages", { root: true, titleHtml: brandMark(), right: nbtn("skies", I.globe, "The Skies: every pigeon in the air") + nbtn("newmsg", I.compose, "New message") })}
    <h1 class="large brandh" aria-label="InFlight: Messages">${brandMark()}</h1><div class="mlist skel" aria-busy="true" aria-label="Loading your messages">${'<div class="mrow"><span class="sk av"></span><span class="mtext"><span class="sk l1"></span><span class="sk l2"></span></span></div>'.repeat(4)}</div>`;
  const empty = S.friends.length
    ? `<p class="empty"><b>No messages yet</b>Tap the pencil to send your first pigeon.</p>`
    : S.outgoing.length || S.incoming.length
    ? `<p class="empty"><b>No messages yet</b>Once a friend says yes, send them your first pigeon.<br><button class="btn" data-act="tab" data-id="friends">Friends</button></p>`
    // brand new: the two ways to get a friend, right here
    : `<div class="firstrun"><div class="appicon">${I.bird}</div><h2>Your loft is ready</h2>
        <p>Pigeons fly between friends. Send your link to someone, or add them by their handle.</p>
        <div class="stack"><button class="btn wide" data-act="share">${I.up}Share My Link</button><button class="btn wide plain" data-act="addfriend">Add a Friend by Handle</button></div>
        <p class="me">You’re <b>@${esc(S.me.handle)}</b></p></div>`;
  return `${navbar("Messages", { root: true, titleHtml: brandMark(), right: nbtn("skies", I.globe, "The Skies: every pigeon in the air") + nbtn("newmsg", I.compose, "New message") })}
    <h1 class="large brandh" aria-label="InFlight: Messages">${brandMark()}</h1>
    ${rows ? `<label class="search">${I.search}<input type="search" id="msearch" placeholder="Search" value="${esc(S.q)}" autocomplete="off" aria-label="Search messages"></label>` : ""}
    ${seasonCard()}<div class="airslot"></div>
    <div class="sres" aria-live="polite"></div>
    <div class="mlist" data-list="m">${rows}</div>${rows ? "" : empty}`;
}

/* ---------- friends' news: what their pigeons have been up to ---------- */
let newsLoading = null;
function loadNews(force) {
  if (newsLoading || (!force && S.newsAt && now() - S.newsAt < 60e3)) return newsLoading;
  newsLoading = api("news").then((r) => { S.news = r.news || []; S.newsAt = now(); if (S.view === "friends" || S.sheet?.type === "news") { render(); if (S.sheet?.type === "news") renderSheet(); } })
    .catch(() => {}).finally(() => { newsLoading = null; });
  return newsLoading;
}
const NEWS_ICON = { country: () => I.globe, postmark: (x) => `<svg viewBox="0 0 24 24" class="ico">${x.mark ? pmIco(x.mark) : PM_ICON.monument}</svg>`, rank: () => I.bird, named: () => I.bird, streak: () => I.flame,
  item: (x) => `<span class="nemo">${x.emoji || ""}</span>`, season: (x) => `<span class="nemo">${SEASONS.find((s) => s[0] === x.skin)?.[2] || ""}</span>` };
const NEWS_TINT = { country: "blue", postmark: "red", rank: "orange", named: "orange", streak: "orange", item: "yellow", season: "pink" };
// news comes to the day (its noon, so it's the right day wherever you are)
const newsDay = (at) => { const d = at + DAY / 2; return sameDay(d, now()) ? "Today" : sameDay(d, now() - DAY) ? "Yesterday" : now() - d < 6 * DAY ? DOW_LONG[new Date(d).getDay()] : fmtDate(d); };
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function newsRow(x) {
  const f = friend(x.who.id) || x.who;
  return `<button type="button" class="cell nrow" data-act="open" data-id="${esc(x.who.id)}">${avatar(f, "s")}
    <span class="ctext"><span class="ntext">${esc(x.text)}</span><span class="csub">${esc(newsDay(x.at))}</span></span>
    <span class="nkind ${NEWS_TINT[x.kind] || "gray"}" aria-hidden="true">${(NEWS_ICON[x.kind] || (() => I.bird))(x)}</span></button>`;
}
function newsHtml() {
  if (S.me?.shareNews === false || !S.news?.length) return "";
  return `<div class="ghead">News${S.news.length > 3 ? ` <button type="button" class="link gmore" data-act="newsall">See All</button>` : ""}</div>
    <div class="group news">${S.news.slice(0, 3).map(newsRow).join("")}</div>`;
}

/* ---------- Friends ---------- */
function vFriends() {
  if (S.me) loadNews();
  const fr = [...S.friends].sort((a, b) => a.name.localeCompare(b.name));
  const inc = S.incoming.length, out = S.outgoing.length;
  const rows = fr.map((f) => `<button class="cell" data-act="open" data-id="${esc(f.id)}" data-find="${esc((f.name + " " + f.handle).toLowerCase())}">${avatar(f, "s", true)}
      <span class="ctext"><span class="one">${esc(first(f.name))}</span><span class="csub one">@${esc(f.handle)}${f.place ? ` · ${esc(f.place)}` : ""}${milesAway(f) ? ` · ${milesAway(f)}` : ""}</span></span>${chevSm}</button>`).join("");
  return `${navbar("Friends", { root: true, right: nbtn("share", I.share, "Share your handle") + nbtn("addfriend", I.addp, "Add a friend") })}
    <h1 class="large">Friends</h1>
    ${fr.length ? `<label class="search">${I.search}<input type="search" id="fsearch" placeholder="Search" value="${esc(S.fq)}" autocomplete="off" aria-label="Search friends"></label>` : ""}
    ${inc || out ? `<div class="group">${cell({ act: "requests", icon: I.addp, tile: "red", label: "Friend Requests", sub: inc ? `${inc} waiting for you` : `${out} sent, waiting for a reply`, val: inc ? `<span class="badge-n">${inc}</span>` : "", chev: true })}</div>` : ""}
    ${newsHtml()}
    ${fr.length ? `<div class="ghead">${fr.length} friend${fr.length === 1 ? "" : "s"}</div><div class="group" data-list="f">${rows}</div>
      <div class="gfoot">Your handle is <b>@${esc(S.me.handle)}</b>. Share it so friends can add you.</div>`
      : `<p class="empty"><b>No friends yet</b>Add someone by their handle, or share yours: @${esc(S.me.handle)}.<br><button class="btn" data-act="addfriend">Add a Friend</button></p>`}
    <div class="gap"></div>`;
}

/* ---------- Account ---------- */
function vAccount() {
  const u = S.me;
  // today's pigeons: how many of each are in your loft, and when the next hatches
  const tile = (kind, name, what) => {
    const n = u[kind] || 0, full = n >= KIND[kind].max, next = full ? (kind === "mystery" ? "Ready" : "Full") : n ? `Next in <span data-eta="${u[kind + "NextAt"]}"></span>` : `In <span data-eta="${u[kind + "NextAt"]}"></span>`;
    return `<div class="ltile${n ? "" : " none"}" role="group" aria-label="${name}: ${n} in your loft"><span class="ltop">${pg(kind, kind === "mystery" || SPACE_KINDS.includes(kind) ? null : u.skin)}<b>${n}</b></span>
      <span class="lname">${name}</span><small>${what}</small><small class="lnext">${next}</small></div>`;
  };
  // (the Moon's and Mars's pigeons, once you or a friend are there)
  const on = (b) => worldOf(u) === b || S.friends.some((f) => worldOf(f) === b) || S.groups.some((g) => g.members.some((p) => worldOf(p) === b));
  return `${navbar("Account", { root: true })}
    <h1 class="large">Account</h1>
    <div class="group"><button class="cell me-cell" data-act="profile">${avatar(u, "l")}
      <span class="ctext"><span class="name one">${esc(first(u.name))}</span><span class="csub one">@${esc(u.handle)}${u.place ? ` · ${esc(u.place)}` : ""}</span><span class="csub one">Edit Profile</span></span>${chevSm}</button></div>
    ${NEW_HOME ? `<div class="group">${cell({ act: "moved", icon: I.globe, tile: "blue", label: "InFlight Has Moved", sub: esc(NEW_HOME.replace(/^https?:\/\//, "")), chev: true })}</div>` : ""}
    <div class="ghead">Today’s Pigeons</div>
    <div class="lgrid">${tile("rocket", "Rocket", "9× faster")}${tile("turbo", "Turbo", "3× faster")}${tile("swift", "Swift", "2× faster")}${tile("mystery", "Mystery", "Any pigeon")}</div>
    <div class="gfoot">Every day: 1 rocket, 3 turbo, 9 swift and a mystery pigeon. They fly any time. Standard pigeons are free and fly on your turn.</div>
    <div class="ghead">Space Pigeons</div>
    <div class="lgrid">${tile("orbital", "Orbital", "Round the Earth")}${on("moon") ? tile("lunar", "Lunar", "To the Moon, ~3 days") + tile("lunarx", "Lunar Express", "To the Moon, ~1 day") : ""}${on("mars") ? tile("laser", "Laser", "To Mars, light speed") : ""}</div>
    <div class="gfoot">Orbital pigeons go up into orbit and come down near your friend: 2 a day.${on("moon") ? " Only lunar pigeons reach the Moon." : ""}${on("mars") ? " Only laser pigeons reach Mars." : ""}</div>
    <div class="ghead">Your Loft</div>
    <div class="group">${cell({ act: "birds", icon: I.bird, tile: "orange", label: "Your Pigeons", sub: S.birds.length ? esc(S.birds.map((b) => b.name).join(", ")) : "Name them, and they build careers", chev: true })}
      ${cell({ act: "flightlog", icon: I.dist, tile: "teal", label: "Flight Log", sub: "Miles, passport, badges and looks", chev: true })}
      ${cell({ act: "feathers", icon: I.coin, tile: "yellow", label: "Coots", sub: "Your Coots Coins, for the shop", val: `<span class="fbal">${(S.feathers || 0).toLocaleString("en-GB")}</span>`, chev: true })}</div>
    <div class="ghead">Flying</div>
    <div class="group">${toggleCell({ act: "risky", icon: I.skull, tile: "red", label: "Pigeon Death", sub: "1.25× faster, but 1 in 100 is lost", on: u.risky })}</div>
    <div class="gfoot">Every pigeon you send flies 1.25× faster, but 1 in 100 never arrives. You won’t know until it happens, and then it’s your turn again.</div>
    <div class="ghead">Settings</div>
    <div class="group">
      ${notifyCell(u)}
      ${cell({ act: "securitysheet", icon: I.shield, tile: "green", label: "Privacy &amp; Security", chev: true })}
      ${cell({ act: "appearancesheet", icon: I.contrast, tile: "blue", label: "Appearance", val: THEME_NAMES[theme()], chev: true })}
    </div>
    <p class="aver"><button type="button" class="averbtn" data-act="whatsnew" aria-label="InFlight ${APP_VERSION}: what’s new">InFlight ${APP_VERSION}${chevSm}</button><button type="button" class="alink" data-act="creditsheet">Map &amp; Weather Data</button></p>
    <div class="gap"></div>`;
}
const toggleCell = ({ act, id, icon, tile, label, sub, on, disabled }) => `<button type="button" class="cell has-icon" role="switch" aria-checked="${!!on}" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ""}${disabled ? " disabled" : ""}>
    <span class="tile ${tile}">${icon}</span><span class="ctext"><span>${label}</span>${sub ? `<span class="csub">${sub}</span>` : ""}</span><span class="switch${on ? " on" : ""}" aria-hidden="true"></span></button>`;
// Account shows one row; the settings live in their own sheet, like iOS Settings.
function notifyCell(u) {
  const ps = pushState();
  const on = [ps === "on" && "Push", u.notifyEmail && "Email"].filter(Boolean);
  const val = on.length ? on.join(", ") : ps === "homescreen" ? "Set Up" : "Off";
  return cell({ act: "notifysheet", icon: I.bell, tile: "red", label: "Notifications", val: esc(val), chev: true });
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
    <div class="gfoot">${u.emailOk === false ? `Emails start once you confirm your address: tap the link we sent to ${esc(u.email)}. <button type="button" class="link inl" data-act="confirmsend">Send it again</button>`
      : "Only when a pigeon has waited 10 minutes unread, and at most every half hour. Every email has a link to turn them off."}</div>` : ""}
    <div class="${anyOn ? "" : "dim"}">
    <div class="ghead">Notify Me When</div>
    <div class="group">
      ${t("landed", I.bird, "orange", "A Pigeon Lands")}
      ${t("takeoff", I.up, "teal", "A Pigeon Takes Off", "When a friend sends you one")}
      ${t("rerouted", I.loc, "blue", "A Pigeon Changes Course", "When a friend moves while yours is flying")}
      ${t("lost", I.skull, "red", "A Pigeon Is Lost", "When Pigeon Death takes one of yours")}
      ${t("delays", I.storm, "indigo", "Weather Delays", "When one flies into weather that makes it late")}
      ${t("requests", I.addp, "green", "Friend Requests")}
      ${t("accepted", I.people, "indigo", "Request Accepted")}
      ${t("reactions", I.heart, "pink", "Reactions", "When someone reacts to your message")}
      ${t("moments", I.pass, "teal", "Mid-air Moments", "Near misses, cheers, ships, and friends’ pigeons flying over you")}
      ${t("streaks", I.flame, "orange", "Flight Streaks", "A few hours before a streak with a friend runs out")}
      ${t("weekly", I.globe, "blue", "Your Week in Flight", "Sunday evening: miles flown and badges earned")}
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
  try {
    const r = await api("me", { method: "PATCH", body: { notify: patch } });
    const same = JSON.stringify(r.me.notify) === JSON.stringify(S.me.notify);
    S.me = r.me;
    if (same) return;                 // already showing; redrawing would cut a switch off mid-glide
  } catch (err) { S.me.notify = before; toast(esc(err.message)); }
  render(); renderSheet();
}
function cityOptions() {
  const cur = S.me?.place;
  return `<option value="">Choose a city</option>` +
    [...PLACES].sort((a, b) => a[0].localeCompare(b[0])).map(([n]) => `<option value="${esc(n)}"${n === cur ? " selected" : ""}>${esc(n)}</option>`).join("");
}

/* ---------- Chat ---------- */
// How far away a friend is, once it's a mile or more ("" when you don't know, or they're near)
const milesAway = (f) => {
  if (moonChat(f)) {
    const a = endFor(S.me), b = endFor(f); if (!a || !b) return "";
    return fmtMiles(a.b === b.b ? surfaceKm(a.b, a, b) : a.b === "mars" || b.b === "mars" ? marsKm(now()) : moonKm(now()));
  }
  const km = S.me?.lat != null && f?.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : 0; return km >= 1.61 ? fmtMiles(km) : "";
};
// Under a friend's name: the time where they are (when it isn't yours), where, and how far
function chatSub(f) {
  const bits = [];
  let icon = "";
  // off the Earth: day or night where they are (a lunar day lasts a month; a Martian sol 24h 39m)
  if (f.moon) {
    const site = esc((f.place || "").replace(/, (the Moon|Mars)$/, ""));
    if (f.moon.b === "mars") { const c = marsClock(f.moon.lon, now()); icon = c.day ? I.sun : I.moon; bits.push(`${c.hm} at ${site} · ${c.day ? "sunset" : "sunrise"} in ${fmtDur(c.next - now())}`); }
    else { const d = lunarDay(f.moon.lat, f.moon.lon, now()); icon = d.day ? I.sun : I.moon; bits.push(`${d.day ? "Day" : "Night"} at ${site} · ${d.day ? "sunset" : "sunrise"} in ${fmtDur(d.next - now())}`); }
  } else if (f.tz && f.tz !== MY_TZ) {
    try {
      const h = +dtf({ timeZone: f.tz, hour: "2-digit", hourCycle: "h23" }).format(now());
      icon = h >= 19 || h < 6 ? I.moon : I.sun;
      bits.push(`<span data-clock="${esc(f.tz)}">${esc(clockIn(now(), f.tz))}</span>${f.place ? ` in ${esc(f.place)}` : " there"}`);
    } catch (_) {}
  }
  if (!bits.length && f.place) bits.push(esc(f.place));
  if (milesAway(f)) bits.push(milesAway(f));
  const s = streakOf(f), st = s ? `<span class="streak${streakRisk(s) ? " risk" : ""}">${I.flame}${s.n}${streakRisk(s) ? ` · ends in ${esc(streakLeft(s))}` : ""}</span>` : "";
  return bits.length || st ? `<small class="sub">${st}${bits.length ? `${icon}<span class="one">${bits.join(" · ")}</span>` : ""}</small>` : "";
}
const gchatSub = (g) => { const n = others(g).map((p) => esc(first(p.name))); return n.length ? `<small class="sub"><span class="one">${n.join(", ")}</span></small>` : ""; };
/* ---------- pigeons on their way to you, kept small ---------- */
const flyTrack = (m) => `<span class="ctrack" aria-hidden="true"><i data-from="${esc(m.sentAt)}" data-to="${esc(m.deliverAt)}"><svg viewBox="0 0 24 24" class="cbird"><path d="${BIRD}" transform="matrix(-1 0 0 1 24 0)"/></svg></i></span>`;
const inbound = (m) => m.from !== S.me.id && m.flying && !m.lost && !m.stopover;
// Several on their way at once (a group, or swifts one after another): one card, a row each
function flyRun(run, g) {
  const next = Math.min(...run.map((m) => m.deliverAt)), kinds = [...new Set(run.map((m) => kindOf(m)))];
  const rows = run.map((m) => {
    const who = g ? member(g, m.from) || { id: m.from, name: "Former member" } : null;
    const name = g ? esc(first(who.name)) : kindOf(m) === "standard" ? "Standard" : KIND[kindOf(m)].name;
    return `<button type="button" class="frr" data-act="map" data-id="${esc(m.id)}" aria-label="${name}${g ? "’s pigeon" : " pigeon"}, lands in ${esc(fmtDur(m.deliverAt - now()))}. Watch it on the map.">
      ${g ? avatar(who, "xs") : ""}${pgm(m)}<span class="n one">${name}</span>${flyTrack(m)}<b><span data-eta="${esc(m.deliverAt)}"></span></b></button>`;
  }).join("");
  return `<div class="flyrun" role="group" aria-label="${run.length} pigeons on their way">
    <div class="frh"><span class="stack">${kinds.slice(0, 3).map((k) => pg(k)).join("")}</span><b>${run.length} on their way</b><small><span class="w">next in </span><span data-eta="${esc(next)}"></span></small></div>${rows}</div>`;
}

/* ---------- who has it: your message to a group, member by member ---------- */
const whoState = (x) => (x.recalled ? "back" : x.lost ? "lost" : x.flying ? "fly" : x.readAt ? "read" : "landed");
const whoCls = (x) => "w-" + whoState(x);              // (prefixed: .fly is the incoming pigeon's card)
const whoOrder = (m) => [...(m.flock || [])].sort((a, b) => a.deliverAt - b.deliverAt);
function whoDots(m) {
  const fl = whoOrder(m), more = fl.length > 12 ? fl.length - 11 : 0;
  return `<span class="whodots" aria-hidden="true">${(more ? fl.slice(0, 11) : fl).map((x) => `<i class="${whoCls(x)}"></i>`).join("")}${more ? `<b>+${more}</b>` : ""}</span>`;
}
function whoHasLabel(m) {
  const fl = m.flock || [], n = (s) => fl.filter((x) => whoState(x) === s).length;
  return `Who has it: ${n("read")} read, ${n("landed")} landed, ${n("fly")} still flying${n("lost") ? `, ${n("lost")} lost` : ""}${n("back") ? `, ${n("back")} called back` : ""}. Show who.`;
}

/* ---------- a message ----------
   Its time sits inside it, with two ticks once they've read yours. Yours in
   the air is an outline with its pigeon on a hairline of the way; theirs is
   sealed until it lands. Tap yours in the air for the flight; anything that
   has landed to react, reply or see the flight. */
const atTime = (ts) => (sameDay(ts, now()) ? fmtTime(ts) : sameDay(ts, now() + DAY) ? `tomorrow ${fmtTime(ts)}` : `${DOW[new Date(ts).getDay()]} ${fmtTime(ts)}`);
// the same, where room is short (the message box, a card): "18:40", "Thu 02:20"
const atShort = (ts) => (sameDay(ts, now()) ? fmtTime(ts) : ts - now() < 6 * DAY ? `${DOW[new Date(ts).getDay()]} ${fmtTime(ts)}` : `${new Date(ts).getDate()} ${MON[new Date(ts).getMonth()]} ${fmtTime(ts)}`);
// a duration, roughly: "45m", "2h", "1d 10h"
const durShort = (ms) => (ms < HOUR ? fmtDur(ms) : ms < DAY ? `${Math.round(ms / HOUR)}h` : fmtDur(ms));
const airTrack = (m) => `<span class="trk" aria-hidden="true"><i data-from="${esc(m.sentAt)}" data-to="${esc(m.deliverAt)}">${I.bird}</i></span>`;
function footHtml(m, mine, g) {
  if (mine && m.lost && !g) return `<span class="ft lostft">${I.skull}${m.bird ? `${esc(m.bird.name)} was lost` : "Lost on the way"} · Pigeon Death</span>`;
  if (mine && m.flying && !g) return `<span class="ft">${m.waiting ? I.clock : ""}lands ${atTime(m.deliverAt)}</span>`;
  // landed: no time on the bubble, as in Messages (the time sits in the header above it, and in its menu)
  return "";
}
// in a group, "Landed for all · read by" sits under your latest landed message only (the older ones keep it if something's still to say)
let quietMeta = null;
// one to three emoji on their own: big, with no bubble
const JUMBO_RE = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*\s*){1,3}$/u;
// a header over each stretch of the chat, as in Messages: "Today 17:24", "Yesterday 10:19", "Mon 13 Oct 09:02"
const TIME_GAP = HOUR;
const stampHtml = (at) => `<div class="stamp"><b>${dayLabel(at)}</b> ${fmtTime(at)}</div>`;
// under your latest landed message (one to one): landed, or read, and when
function statusLine(m) {
  return `<div class="meta me rstat">${m.readAt ? `Read ${fmtShort(m.readAt)}` : `Landed ${fmtShort(m.deliverAt)}`}</div>`;
}
function bubble(f, m, gapTop, g) {
  if (m.stopover) return stopCard(f, m);
  const mine = m.from === S.me.id, k = kindOf(m);
  const fresh = S.fresh.has(m.id) ? ` fresh" data-fresh="${esc(m.id)}` : "";
  if (m.recalled && (!mine || !g || !flockCount(m).landed)) return `<div class="lostnote homing${fresh}">${I.homing}<span>${mine ? `You called ${g ? "these pigeons" : "this pigeon"} back.` : `${esc(first(f.name))} called their pigeon back.`}</span></div>`;
  if (!mine && m.lost) return `<div class="lostnote${fresh}">${I.skull}<span>${esc(first(f.name))}’s pigeon was lost on the way.</span></div>`;
  if (!mine && m.flying) {
    // sealed until it lands: when, and its pigeon on the way
    const via = m.via ? ` via ${esc(first(friend(m.via)?.name || "a friend"))}` : "";
    return `<button type="button" class="b up sealed fly k-${k}${gapTop ? " gap-top" : ""}${fresh}" data-act="map" data-id="${esc(m.id)}" aria-label="${k === "standard" ? "A pigeon" : `A ${KIND[k].name.toLowerCase()} pigeon`} from ${esc(first(f.name))}${via}, sealed until it lands ${esc(atTime(m.deliverAt))}. Watch it on the map.">
      <span class="sl">${I.lock}<span>Sealed${via} · lands ${atTime(m.deliverAt)}</span></span>${airTrack(m)}</button>`;
  }
  const p = S.plain.get(m.id) || { t: "" };
  const quote = p.q ? quoteHtml(p.q, g) : "";
  const jumbo = !p.p && !p.v && !p.q && !p.bad && !m.flying && !m.lost && JUMBO_RE.test(p.t || "");
  const text = p.bad ? `<span class="bad-scroll">${p.unchecked ? "Check the new safety number to open this message." : "This message couldn’t be opened on this phone."}</span>` : esc(p.t).replace(/\n/g, "<br>");
  // tap: your pigeon in the air → its flight; anything that's arrived → react, reply or its flight
  const tapAct = mine && m.flying ? ` data-act="flymenu" data-id="${esc(m.id)}"` : !m.flying && !m.lost && !p.bad ? ` data-act="msgmenu" data-id="${esc(m.id)}"` : "";
  const up = mine && m.flying, foot = footHtml(m, mine, g);
  // in the air (one to one): the way so far, then when it lands
  const tail = up && !g ? `<span class="frow">${m.waiting ? "" : airTrack(m)}${foot}</span>` : foot;
  const cls = `${mine ? " me" : ""}${up ? ` up k-${k}` : ""}${m.waiting ? " waiting" : ""}${m.lost ? " lost" : ""}${gapTop ? " gap-top" : ""}${fresh}`;
  let html;
  if (p.v) {
    const gone = m.photo === 2 || S.photoGone.has(m.id);
    html = `<div class="b voicem${cls}" data-mid="${esc(m.id)}"${tapAct}>${quote}${gone ? `<span class="vgone">${I.gone}Voice pigeon expired</span>` : voiceHtml(m.id, p.v, mine)}${tail}</div>`;
  } else if (onceP(p)) {
    // view once: a pill to tap (theirs), what became of it (yours), the words below
    const gone = picGone(m), seen = (m.flock || []).filter((x) => x.viewedAt).length;
    const opened = mine ? (g ? seen > 0 : !!m.viewedAt) : !!(m.viewedAt || openedOnce(m.id));
    const label = mine ? (g && seen ? `Opened by ${seen}` : opened ? "Opened" : gone ? "Photo expired" : "Photo") : opened ? "Opened" : gone ? "Photo expired" : "View photo";
    const can = !mine && !opened && !gone && !m.flying && !m.lost;
    const words = p.t || quote;
    html = can ? `<button type="button" class="b once live${cls}" data-mid="${esc(m.id)}" data-act="viewonce" data-id="${esc(m.id)}" aria-label="View photo, once">${I.once}<b>${label}</b></button>`
      : `<div class="b once${opened || gone ? " done gone" : ""}${cls}" data-mid="${esc(m.id)}"${tapAct}>${I.once}<b>${label}</b>${words ? "" : tail}</div>`;
    if (words) html += `<div class="b ocap${cls}" data-mid="${esc(m.id)}"${tapAct}>${quote}${text}${tail}</div>`;
  } else if (p.p && picGone(m)) {
    // gone: a quiet outline of where it was, the time beside it; its words (if any) in their own bubble below
    const words = p.t || quote;
    html = `<div class="b gone${cls}" data-mid="${esc(m.id)}"${tapAct}><span class="gonel">${I.gone}${picWord(p)} expired</span>${words ? "" : tail}</div>`;
    if (words) html += `<div class="b ocap${cls}" data-mid="${esc(m.id)}"${tapAct}>${quote}${text}${tail}</div>`;
  } else if (p.p) {
    let photo;
    // its real shape, known before it loads, so the chat doesn't jump as photos and GIFs appear
    const ar = p.p.w > 0 && p.p.h > 0 ? ` data-ar="${Math.max(0.4, Math.min(2.5, p.p.w / p.p.h)).toFixed(4)}"` : "";
    if (m.photo === 2 || S.photoGone.has(m.id)) photo = `<div class="ph">${I.gone}<span>${picWord(p)} expired</span></div>`;
    else if (S.photos.get(m.id)) photo = `<img${p.p.m === "image/gif" ? ' class="gif"' : ""}${ar} src="${S.photos.get(m.id)}" alt="${picWord(p)} from ${esc(first(mine ? S.me.name : f.name))}" data-act="view" data-id="${esc(m.id)}">`;
    else photo = `<div class="ph"${ar}>Opening photo…</div>`;
    // the time goes under its words, or over the picture when there are none
    html = `<div class="b pic${cls}" data-mid="${esc(m.id)}"${tapAct}>${photo}${p.t || quote || up ? `<span class="ptxt">${quote}${text}${tail}</span>` : foot.replace('class="ft', 'class="ft over')}</div>`;
  } else html = `<div class="b${jumbo ? " jumbo" : ""}${cls}" data-mid="${esc(m.id)}"${tapAct}>${quote}${text}${tail}</div>`;
  // a line added by the friend it stopped with on the way
  if (m.via && !mine && S.notes.get(m.id)) html += `<div class="vianote"><b>${esc(first(friend(m.via)?.name || "A friend"))} added</b><span>${esc(S.notes.get(m.id))}</span></div>`;
  html += reactsHtml(m, mine);
  html += postmarkHtml(m, mine);
  const meta = [];
  if (g && mine) {
    // a dot for each of them, filling in as their pigeons land (and turning blue once they've read it); tap for who
    const c = flockCount(m), tap = (inner, cls = "") => `<button class="fl flock ${cls}" data-act="whohas" data-id="${esc(m.id)}" aria-label="${esc(whoHasLabel(m))}">${whoDots(m)}${inner}</button>`;
    if (m.flying) meta.push(tap(`${c.landed} of ${c.n} landed${c.lost ? ` · ${c.lost} lost` : ""} · next in <span data-eta="${esc(c.next)}"></span>`, k));
    else if (c.recalled) meta.push(tap(`Landed for ${c.landed} of ${c.n} · <span class="homing">${I.homing} ${c.recalled} called back</span>${c.lost ? ` · ${I.skull} ${c.lost} lost` : ""}`, "done"));
    else if (c.lost === c.n) meta.push(`<button class="fl lostm" data-act="whohas" data-id="${esc(m.id)}">${I.skull} Lost on the way · Pigeon Death</button>`);
    else if (c.lost) meta.push(tap(`Landed for ${c.landed} of ${c.n} · ${I.skull} ${c.lost} lost`, "done"));
    else if (!quietMeta?.has(m.id)) { const r = (m.flock || []).filter((x) => x.readAt).length; meta.push(tap(`${r === c.n ? `Read by all ${c.n}` : r ? `Landed for all ${c.n} · read by ${r}` : `Landed for all ${c.n}`}`, "done")); }
  }
  const onceDone = onceP(p) && (m.viewedAt || openedOnce(m.id) || (m.flock || []).some((x) => x.viewedAt));
  // once everyone who could open it has, there's nothing left to disappear
  const allSeen = onceP(p) && (g ? (m.flock || []).length > 0 && m.flock.every((x) => x.viewedAt) : !!m.viewedAt);
  if (p.p && m.photo === 1 && !m.flying && !picGone(m) && !(onceDone && !mine) && !(mine && allSeen)) meta.push(`<span class="fl exp">${onceP(p) ? (mine ? "View once · " : "Opens once · ") : ""}${picWord(p)} disappears in <span data-eta="${esc(m.expiresAt)}"></span></span>`);
  return html + (meta.length ? `<div class="meta${mine ? " me" : ""}">${meta.join("")}</div>` : "");
}
// A friend's pigeon to someone else, stopping with you on the way: read it, and add a line.
function stopCard(f, m) {
  const to = friend(m.finalTo), toName = esc(first(to?.name || "a friend")), p = S.plain.get(m.id), fresh = S.fresh.has(m.id) ? " fresh" : "";
  if (m.recalled) return `<div class="lostnote homing${fresh}">${I.homing}<span>${esc(first(f.name))} called back their pigeon to ${toName}.</span></div>`;
  if (m.lost) return `<div class="lostnote${fresh}">${I.skull}<span>${esc(first(f.name))}’s pigeon to ${toName} was lost on the way.</span></div>`;
  const t = now(), state = t < m.viaAt ? `Stopping with you on its way to ${toName} · here in <span data-eta="${esc(m.viaAt)}"></span>`
    : t < m.viaOff ? `Resting with you on its way to ${toName} · flies on in <span data-eta="${esc(m.viaOff)}"></span>` : `Stopped with you, then flew on to ${toName}`;
  const text = p && !p.bad ? `<p class="stext">${esc(p.t).replace(/\n/g, "<br>")}${p.ph ? `<span class="hid">${I.photo} A photo only ${toName} can see</span>` : ""}</p>` : p?.bad ? `<p class="stext bad-scroll">This message couldn’t be opened on this phone.</p>` : "";
  const line = S.notes.get(m.id);
  const add = line != null ? `<p class="smine"><b>You added</b>${esc(line)}</p>` : m.resting && to ? `<button type="button" class="btn small" data-act="vianote" data-id="${esc(m.id)}">${I.compose}Add a Line for ${toName}</button>` : "";
  return `<div class="stopcard${fresh}" data-mid="${esc(m.id)}"><span class="st1">${pgm(m)}<span>${state}</span></span>${text}${add}</div>`;
}
/* ---------- share a flight ----------
   A landed pigeon as a picture to post: an airmail postcard (4:5) or a dark
   story (9:16), drawn here on the phone with the app's own map. Only the two
   places, the day and the flight go on it: never the message, and never your
   friend's name (yours only if you leave it on). */
const CARD_FONT = '-apple-system, "SF Pro Display", system-ui, Inter, "Helvetica Neue", Arial, sans-serif';
const STAMP_INK = { rocket: ["#fbe38a", "#d9a21b", "#a87808"], swift: ["#ff8a80", "#ff3b30", "#b8241b"], turbo: ["#5a5a60", "#1c1c1e", "#000000"],
  standard: ["#8ee39f", "#34c759", "#1d7f37"], dumb: ["#d8bf9a", "#a2845e", "#6f5636"],
  lunar: ["#e3e8f3", "#8190b3", "#56607a"], lunarx: ["#b9b8ff", "#5e5ce6", "#3532a8"], laser: ["#ffb3a8", "#e5484d", "#8f1d22"], orbital: ["#9fd0ff", "#0a84ff", "#0b3d91"] };
const STORY_INK = { rocket: "#f0c04a", swift: "#ff6961", turbo: "#f5f5f7", standard: "#30d158", dumb: "#c4a57e", lunar: "#c9d2e6", lunarx: "#8e8cff", laser: "#ff6961", orbital: "#64b5ff" };
const shareable = (m) => !!((m?.route || m?.moon) && !m.flock && !m.lost && !m.recalled && m.km != null && m.deliverAt <= now());
// a space flight's picture, for the cards (the trip as it ended, in its night sky)
function spaceCard(m, cssW, cssH, dpr = 3) {
  const cv = document.createElement("canvas");
  drawTrip(cv, m.moon, m.moon.k === "laser" ? 1 : 0.985, m.deliverAt, { size: { w: cssW, h: cssH, dpr } });
  return cv;
}
// what goes on the card, in the time where it landed
function flightFacts(m, withName) {
  const mine = m.from === S.me.id, other = friend(mine ? m.to : m.from), flew = Math.max(1, m.deliverAt - m.sentAt), k = kindOf(m), w = m.wind;
  const tz = mine ? other?.tz : MY_TZ;
  const at = (o) => { try { return dtf({ timeZone: tz || undefined, ...o }).format(m.deliverAt); } catch (_) { return dtf(o).format(m.deliverAt); } };
  let zone = "";
  try { zone = dtf({ timeZone: tz || undefined, timeZoneName: "short" }).formatToParts(m.deliverAt).find((x) => x.type === "timeZoneName")?.value || ""; } catch (_) {}
  const mph = (kmh) => Math.round(Math.abs(kmh) * 0.621371);
  return {
    k, from: m.fromPlace || "Somewhere", to: m.toPlace || "Somewhere", miles: fmtMiles(m.km + shipKm(m.legs)), longMiles: ((mi) => `${mi.toLocaleString("en-GB")} mile${mi === 1 ? "" : "s"}`)(Math.round((m.km + shipKm(m.legs)) * 0.621371)),
    dur: fmtDur(flew), mph: fmtMph(avgKmh(m)),
    sky: w == null ? [KIND[k].name, "Pigeon"] : Math.abs(w) < 3 ? ["Calm", "Skies"] : [`${mph(w)} mph`, w > 0 ? "Tailwind" : "Headwind"],
    skyLine: w == null ? "" : Math.abs(w) < 3 ? "calm skies" : `${w > 0 ? "tailwind" : "headwind"} ${mph(w)} mph`,
    time: at({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), zone,
    day: at({ day: "numeric", month: "long", year: "numeric" }), dayShort: at({ day: "numeric", month: "short", year: "numeric" }),
    stampDay: at({ day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
    name: withName ? first(S.me.name) : "", by: withName ? `${mine ? "Sent" : "Received"} by ${first(S.me.name)}` : "",
    site: `${location.host}${location.pathname.replace(/\/+$/, "")}`,
  };
}
// The flight on the app's own map, drawn off screen in fixed colours (the
// globe, or flat), cssW × cssH at dpr pixels to each.
async function cardMap(m, ink, globe, cssW, cssH, dpr = 3) {
  const want = globe ? ["50m"] : m.km < 900 ? ["50m", "10m"] : ["50m"];
  for (const res of want) await new Promise((ok) => {               // the coast in the detail the map will want
    const t0 = Date.now();
    (function wait() { world(res); if (typeof WORLD[res] === "object" || WORLD[res] === "failed" || Date.now() - t0 > 5000) ok(); else setTimeout(wait, 60); })();
  });
  const cv = document.createElement("canvas");
  cv.className = `cardmap ink-${ink}`; cv.style.width = `${cssW}px`; cv.style.height = `${cssH}px`; cv._dprFix = dpr; cv._spin = -1;
  document.body.append(cv);
  const keep = S.sheet;
  S.sheet = { type: "cardmap", globe, view: null, gview: null }; mapInk = ink;
  try { drawMap(cv, m, 0); return { cv, frame: globe ? globeFrame(cv, m, 0) : null }; }
  finally { S.sheet = keep; mapInk = null; cv.remove(); }
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// one line as big as it can be (up to size) in maxW
function fitFont(g, s, weight, size, maxW, min = 22) {
  let z = size;
  for (; z > min; z -= 2) { g.font = `${weight} ${z}px ${CARD_FONT}`; if (g.measureText(s).width <= maxW) break; }
  g.font = `${weight} ${z}px ${CARD_FONT}`; return z;
}
// letter-spaced capitals
function spaced(g, s, x, y, gap, align = "left") {
  const ch = [...s], w = ch.reduce((a, c) => a + g.measureText(c).width, 0) + gap * (ch.length - 1);
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  const keep = g.textAlign; g.textAlign = "left";
  for (const c of ch) { g.fillText(c, cx, y); cx += g.measureText(c).width + gap; }
  g.textAlign = keep; return w;
}
function appIcon(g, x, y, sz) {
  const gr = g.createLinearGradient(x, y, x + sz * 0.6, y + sz); gr.addColorStop(0, "#4aa3ff"); gr.addColorStop(1, "#0055d4");
  g.fillStyle = gr; rrect(g, x, y, sz, sz, sz * 0.22); g.fill();
  g.save(); g.translate(x + sz * 0.125, y + sz * 0.137); g.scale(sz / 32, sz / 32); g.fillStyle = "#fff"; g.fill(new Path2D(BIRD)); g.restore();
}
// the airmail stamp, perforated, in the pigeon's colour (as on every pigeon that lands)
function cardStamp(g, x, y, F) {
  const s = document.createElement("canvas"); s.width = 198; s.height = 242; const o = s.getContext("2d");
  o.fillStyle = "#fffdf7"; o.fillRect(0, 0, 198, 242);
  o.globalCompositeOperation = "destination-out";
  const hole = (px, py) => { o.beginPath(); o.arc(px, py, 7, 0, 7); o.fill(); };
  for (let i = 0; i <= 9; i++) { hole(i * 22, 0); hole(i * 22, 242); }
  for (let j = 0; j <= 11; j++) { hole(0, j * 22); hole(198, j * 22); }
  o.globalCompositeOperation = "source-over";
  const [c1, c2, c3] = STAMP_INK[F.k] || STAMP_INK.standard, gr = o.createLinearGradient(60, 20, 140, 222);
  gr.addColorStop(0, c1); gr.addColorStop(0.55, c2); gr.addColorStop(1, c3);
  o.fillStyle = gr; rrect(o, 20, 20, 158, 202, 5); o.fill();
  o.strokeStyle = "rgba(255,255,255,.35)"; o.lineWidth = 2; rrect(o, 21, 21, 156, 200, 5); o.stroke();
  o.save(); o.translate(57, 44); o.scale(3.5, 3.5); o.shadowColor = "rgba(0,0,0,.28)"; o.shadowBlur = 3; o.shadowOffsetY = 1; o.fillStyle = "#fff"; o.fill(new Path2D(BIRD)); o.restore();
  o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "alphabetic";
  o.shadowColor = "rgba(0,0,0,.25)"; o.shadowBlur = 3; o.shadowOffsetY = 1;
  fitFont(o, F.miles, 800, 30, 140, 18); o.fillText(F.miles, 99, 170);
  o.shadowColor = "transparent"; o.font = `700 13px ${CARD_FONT}`; spaced(o, KIND[F.k].name.toUpperCase(), 99, 196, 3, "center");
  g.save(); g.translate(x + 99, y + 121); g.rotate(4 * Math.PI / 180);
  g.shadowColor = "rgba(60,40,0,.24)"; g.shadowBlur = 16; g.shadowOffsetY = 8; g.drawImage(s, -99, -121); g.restore();
}
// struck across the stamp: where and when it landed
function cardPostmark(g, x, y, F) {
  g.save(); g.translate(x, y); g.rotate(-8 * Math.PI / 180); g.globalAlpha = 0.72; g.globalCompositeOperation = "multiply";
  g.strokeStyle = g.fillStyle = "#2b2f45"; g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.arc(0, 0, 100, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 64, 0, 7); g.stroke();
  for (let i = 0; i < 4; i++) {
    const yy = -46 + i * 30, x0 = i === 0 || i === 3 ? 104 : 108;
    g.beginPath(); for (let t = 0; t <= 200; t += 4) { const px = x0 + t, py = yy - 7 * Math.sin((t / 50) * Math.PI); t ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
  }
  // round the ring, centred at the top
  const ring = `${F.to.toUpperCase()} • ${F.stampDay} • LANDED • `, R = 82;
  let z = 22; g.font = `800 ${z}px ${CARD_FONT}`;
  const len = () => [...ring].reduce((a, c) => a + g.measureText(c).width + 4, 0);
  while (len() > 2 * Math.PI * R * 0.97 && z > 12) { z -= 1; g.font = `800 ${z}px ${CARD_FONT}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  let a = -Math.PI / 2 - len() / R / 2;
  for (const c of ring) {
    const w = g.measureText(c).width + 4; a += w / 2 / R;
    g.save(); g.rotate(a); g.translate(0, -R); g.fillText(c, 0, 0); g.restore();
    a += w / 2 / R;
  }
  g.textBaseline = "alphabetic"; g.font = `800 36px ${CARD_FONT}`; g.fillText(F.time, 0, 12);
  g.font = `700 16px ${CARD_FONT}`; spaced(g, F.zone.toUpperCase(), 0, 40, 3, "center");
  g.restore();
}
async function postcardCard(m, withName) {
  const F = flightFacts(m, withName), W = 1080, H = 1350, PAPER = "#fbf7ee", INK = "#1c1c1e", INK2 = "#6e6a62";
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // the airmail edge
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(20, 20, W - 40, H - 40); g.clip("evenodd");
  g.translate(W / 2, H / 2); g.rotate(Math.PI / 4);
  for (let x = -1500; x < 1500; x += 104) { g.fillStyle = "#d8443a"; g.fillRect(x, -1500, 38, 3000); g.fillStyle = "#1f63c9"; g.fillRect(x + 52, -1500, 38, 3000); }
  g.restore();
  g.save(); g.beginPath(); g.rect(20, 20, W - 40, H - 40); g.clip();
  g.textBaseline = "alphabetic";
  // the flight: round the globe if it was a long one (drawn on the paper's own
  // colour, so its labels and air run out onto it), else a flat map like a photo
  const round = !m.moon && m.km >= GLOBE_KM;
  if (m.moon) {
    const cv = spaceCard(m, 474, 158, 2), x = 66, y = 452, w = 948, h = 316;
    g.save(); g.shadowColor = "rgba(60,50,30,.18)"; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = "#fff"; rrect(g, x - 14, y - 14, w + 28, h + 28, 28); g.fill(); g.restore();
    g.save(); rrect(g, x, y, w, h, 16); g.clip(); g.drawImage(cv, x, y, w, h); g.restore();
  } else if (round) {
    const { cv, frame } = await cardMap(m, "light", true, 420, 420), sc = 300 / (frame.R * 3);
    g.drawImage(cv, 404 - frame.cx * 3 * sc, 470 - frame.cy * 3 * sc, cv.width * sc, cv.height * sc);
  } else {
    const { cv } = await cardMap(m, "light", false, 474, 158, 2);
    const x = 66, y = 452, w = 948, h = 316;
    g.save(); g.shadowColor = "rgba(60,50,30,.18)"; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = "#fff"; rrect(g, x - 14, y - 14, w + 28, h + 28, 28); g.fill(); g.restore();
    g.save(); rrect(g, x, y, w, h, 16); g.clip(); g.drawImage(cv, x, y, w, h); g.restore();
  }
  g.font = `800 26px ${CARD_FONT}`; g.fillStyle = "#1f63c9"; spaced(g, "PAR PIGEON", 84, 104, 8);
  g.font = `600 22px ${CARD_FONT}`; g.fillStyle = "#d8443a"; spaced(g, "AIRMAIL", 84, 140, 4.5);
  cardStamp(g, 786, 84, F);
  cardPostmark(g, 772, round ? 362 : 340, F);
  // where from and to
  const arrow = F.k === "turbo" ? "#1f63c9" : (STAMP_INK[F.k] || STAMP_INK.standard)[1], left = 84, maxW = 912;
  let z = fitFont(g, `${F.from} → ${F.to}`, 800, 76, maxW, 56), lines = [[F.from, " → ", F.to]];
  if (g.measureText(`${F.from} → ${F.to}`).width > maxW) { lines = [[F.from, " →", ""], ["", "", F.to]]; z = Math.min(fitFont(g, `${F.from} →`, 800, 64, maxW, 30), fitFont(g, F.to, 800, 64, maxW, 30)); g.font = `800 ${z}px ${CARD_FONT}`; }
  let by = lines.length > 1 ? 856 : 878;
  for (const [a, mid, b] of lines) {
    let x = left;
    for (const [t, col] of [[a, INK], [mid, arrow], [b, INK]]) { if (!t) continue; g.fillStyle = col; g.fillText(t, x, by); x += g.measureText(t).width; }
    by += Math.round(z * 1.06);
  }
  g.fillStyle = INK2; fitFont(g, F.by ? `${F.by} · landed ${F.day}` : `Landed ${F.day}`, 500, 29, maxW);
  g.fillText(F.by ? `${F.by} · landed ${F.day}` : `Landed ${F.day}`, left, by - Math.round(z * 1.06) + 52);
  // the flight in four numbers
  g.strokeStyle = "rgba(110,106,98,.35)"; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(left, 1021); g.lineTo(W - left, 1021); g.stroke(); g.setLineDash([]);
  [[F.miles, "Distance"], [F.dur, "In the air"], [F.mph, "Average"], F.sky].forEach(([v, l], i) => {
    const x = left + i * 228;
    g.fillStyle = INK; fitFont(g, v, 800, 42, 214, 26); g.fillText(v, x, 1088);
    g.fillStyle = INK2; g.font = `600 20px ${CARD_FONT}`; spaced(g, l.toUpperCase(), x, 1122, 2.6);
  });
  // whose it is
  appIcon(g, left, 1214, 64);
  g.fillStyle = INK; g.font = `800 30px ${CARD_FONT}`; g.fillText("InFlight", left + 84, 1243);
  g.fillStyle = INK2; g.font = `500 22px ${CARD_FONT}`; g.fillText("Messages that fly the real distance", left + 84, 1273);
  g.textAlign = "right"; g.font = `600 22px ${CARD_FONT}`; g.fillText(F.site, W - left, 1256); g.textAlign = "left";
  g.restore();
  return c;
}
async function storyCard(m, withName) {
  const F = flightFacts(m, withName), W = 1080, H = 1920, BG = "#111113", ink = STORY_INK[F.k] || STORY_INK.standard;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  const { cv } = m.moon ? { cv: spaceCard(m, 360, 427) } : await cardMap(m, "dark", false, 360, 427);
  g.drawImage(cv, 0, 0, 1080, 1281);
  let gr = g.createLinearGradient(0, 0, 0, 300); gr.addColorStop(0, "rgba(17,17,19,.92)"); gr.addColorStop(1, "rgba(17,17,19,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, 300);
  gr = g.createLinearGradient(0, 900, 0, 1290); gr.addColorStop(0, "rgba(17,17,19,0)"); gr.addColorStop(0.5, "rgba(17,17,19,.86)"); gr.addColorStop(1, BG); g.fillStyle = gr; g.fillRect(0, 900, W, 391);
  g.textBaseline = "alphabetic";
  appIcon(g, 64, 84, 76);
  g.fillStyle = "#fff"; g.font = `800 44px ${CARD_FONT}`; g.fillText("InFlight", 162, 138);
  g.fillStyle = ink; g.font = `800 24px ${CARD_FONT}`; spaced(g, F.name ? `FROM ${F.name.toUpperCase()}` : "AIRMAIL", W - 64, 131, 7, "right");
  g.fillStyle = "#fff"; fitFont(g, F.longMiles, 900, 156, W - 128, 60); g.fillText(F.longMiles, 64, 1275);
  g.fillStyle = ink; fitFont(g, `by ${KIND[F.k].name.toLowerCase()} pigeon`, 700, 52, W - 128); g.fillText(`by ${KIND[F.k].name.toLowerCase()} pigeon`, 64, 1360);
  // the landed card, as in the app
  g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 60; g.shadowOffsetY = 24; g.fillStyle = "#2a2a2e"; rrect(g, 56, 1470, 968, 312, 60); g.fill(); g.restore();
  g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1.5; rrect(g, 56.75, 1470.75, 966.5, 310.5, 60); g.stroke();
  const [c1, c2, c3] = STAMP_INK[F.k] || STAMP_INK.standard; gr = g.createLinearGradient(104, 1514, 150, 1590);
  gr.addColorStop(0, c1); gr.addColorStop(0.55, c2); gr.addColorStop(1, c3);
  g.fillStyle = gr; g.beginPath(); g.arc(142, 1552, 38, 0, 7); g.fill();
  g.strokeStyle = "rgba(255,255,255,.3)"; g.lineWidth = 2; g.stroke();
  g.save(); g.translate(119, 1528); g.scale(1.95, 1.95); g.fillStyle = "#fff"; g.fill(new Path2D(BIRD)); g.restore();
  g.fillStyle = "#fff"; fitFont(g, `Landed in ${F.to}`, 800, 56, 776, 30); g.fillText(`Landed in ${F.to}`, 200, 1572);
  const line = `Flew ${F.dur} · averaged ${F.mph}${F.skyLine ? ` · ${F.skyLine}` : ""}`;
  g.fillStyle = "#a5a5ad"; fitFont(g, line, 500, 32, 872); g.fillText(line, 104, 1636);
  gr = g.createLinearGradient(104, 0, 976, 0); gr.addColorStop(0, "#ff9f0a"); gr.addColorStop(1, "#f0c04a"); g.fillStyle = gr; rrect(g, 104, 1668, 872, 10, 5); g.fill();
  g.fillStyle = "#a5a5ad"; g.font = `500 30px ${CARD_FONT}`; g.textAlign = "right"; g.fillText(F.dayShort, 976, 1736);
  const dw = g.measureText(F.dayShort).width; g.textAlign = "left"; fitFont(g, `${F.from} → ${F.to}`, 500, 30, 872 - dw - 30, 18); g.fillText(`${F.from} → ${F.to}`, 104, 1736);
  g.font = `700 27px ${CARD_FONT}`; const a = F.site, b = " · Messages that fly the real distance", aw = g.measureText(a).width;
  g.font = `600 27px ${CARD_FONT}`; const bw = g.measureText(b).width;
  let x = (W - aw - bw) / 2; g.fillStyle = "#d1d1d6"; g.font = `700 27px ${CARD_FONT}`; g.fillText(a, x, 1866); g.fillStyle = "#8e8e93"; g.font = `600 27px ${CARD_FONT}`; g.fillText(b, x + aw, 1866);
  return c;
}
const cardBlob = (c) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn’t make the picture."))), "image/jpeg", 0.93));
const SHARE_FMTS = [["postcard", "Postcard", "For posts and messages"], ["story", "Story", "For stories"]];
const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([""], "flight.jpg", { type: "image/jpeg" })] }); } catch (_) { return false; } };
const shareNamePref = () => { try { return localStorage.getItem("inflight-share-name") !== "0"; } catch (_) { return true; } };
let shareUrls = [];
function openShare(id) {
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
  if (!shareable(m)) return;
  shareUrls.forEach((u) => URL.revokeObjectURL(u)); shareUrls = [];
  S.sheet = { type: "shareflight", id, chat: S.chat, fmt: "postcard", name: shareNamePref(), urls: {}, blobs: {} };
  renderSheet(); shareRender(S.sheet);
}
// both pictures, drawn one after the other, each shown as soon as it's ready
async function shareRender(s) {
  const gen = (s.gen = (s.gen || 0) + 1), m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id);
  if (!m) return;
  $layer.querySelectorAll(".shimg").forEach((e) => e.classList.add("stale"));
  for (const [fmt, make] of [["postcard", postcardCard], ["story", storyCard]]) {
    let blob;
    try { blob = await cardBlob(await make(m, s.name)); }
    catch (err) { if (S.sheet === s) toast(esc(err.message || "Couldn’t make the picture.")); return; }
    if (S.sheet !== s || s.gen !== gen) return;
    const url = URL.createObjectURL(blob); shareUrls.push(url);
    s.blobs[fmt] = blob; s.urls[fmt] = url;
    const slot = $(`.shopt.${fmt} .shimg`, $layer);
    if (slot) { slot.classList.remove("stale"); slot.innerHTML = `<img src="${url}" alt="">`; }
    const go = $("[data-act=shareimg]", $layer); if (go) go.disabled = !s.urls[s.fmt];
  }
}
async function shareImage() {
  const s = S.sheet, blob = s?.blobs?.[s.fmt], m = (S.msgs.get(s?.chat) || []).find((x) => x.id === s?.id);
  if (!blob || !m) return;
  const name = `InFlight ${m.fromPlace || ""} to ${m.toPlace || ""}`.replace(/[^\w .-]+/g, "").replace(/\s+/g, " ").trim() + ".jpg";
  const file = new File([blob], name, { type: blob.type });
  if (canShareFiles()) {
    try { await navigator.share({ files: [file] }); }
    catch (err) { if (err?.name === "NotAllowedError") toast("Tap Share again to send it."); else if (err?.name !== "AbortError") toast("Couldn’t share the picture."); }
    return;
  }
  // no share sheet here (a computer): saved instead
  const a = document.createElement("a"); a.href = s.urls[s.fmt]; a.download = name; document.body.append(a); a.click(); a.remove();
  toast("Picture saved.");
}

/* ---------- achievements (in the Flight Log) ---------- */
const BADGE_LOOK = { moonshot: ["moon", "indigo"], supermoon: ["moon", "orange"], eclipse: ["moon", "red"], redplanet: ["up", "red"], orbiter: ["globe", "blue"], first: ["bird", "green"], frequent: ["up", "blue"], penpal: ["mail", "indigo"], longhaul: ["dist", "teal"], atlantic: ["map", "blue"],
  world: ["loc", "teal"], rocket: ["bird", "rocket"], tailwind: ["wind", "green"], daredevil: ["skull", "red"], homing: ["homing", "indigo"], flock: ["people", "orange"], fleet: ["bird", "turbo"] , globetrotter: ["globe", "teal"] , stormdodger: ["storm", "indigo"], weathered: ["shield", "gray"], jetstream: ["wind", "teal"], migration: ["blossom", "pink"], summer: ["sun", "yellow"], autumn: ["leaf", "orange"], winter: ["snowflake", "blue"]};
/* ---------- the passport ----------
   Every country and sea your pigeons have flown over (functions/_passport.js),
   newest first: a stamp each, in postal ink, with the day it was first
   stamped. Tap one for how often since. */
const PASSPORT_INK = ["#c8322b", "#2457b8", "#1f7a46", "#a8740f", "#6b3fa0", "#b04a7a", "#127a86"];
const inkOf = (name, sea) => (sea ? "#1d63b0" : PASSPORT_INK[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PASSPORT_INK.length]);
const tiltOf = (name) => (([...name].reduce((h, c) => (h * 17 + c.charCodeAt(0)) >>> 0, 3) % 7) - 3) * 0.8;
/* ---------- landmark postmarks: somewhere famous a pigeon flew past ---------- */
const PM_ICON = {
  tower: `<path d="M6.5 21c2.2-3 3.6-8.5 4.4-14h2.2c.8 5.5 2.2 11 4.4 14M8.6 16h6.8M10.2 11.5h3.6M10.4 21a1.6 1.6 0 0 1 3.2 0M12 7V3"/>`,
  bridge: `<path d="M2 16h20M5 16V7M19 16V7M5 7c3 5 11 5 14 0M2 20h20"/>`,
  monument: `<path d="M6 21V9l6-5 6 5v12M10 21v-6h4v6M4 21h16"/>`,
  castle: `<path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12ZM10 21v-4a2 2 0 0 1 4 0v4"/>`,
  cliff: `<path d="M3 20c2-1 3-6 5-8s4-1 5-4 3-4 5-4v16ZM2 20h20"/>`,
  mountain: `<path d="m2 20 7-13 4 6 2-3 7 10ZM7.5 10.5l1.5 1 1.5-1"/>`,
  dome: `<path d="M5 21v-8a7 7 0 0 1 14 0v8M3 21h18M12 3v3M9 21v-4h6v4"/>`,
  pyramid: `<path d="M2 20 12 4l10 16ZM12 4l-3 16"/>`,
  falls: `<path d="M4 4h16M7 4v7c0 3 2 5 2 9M12 4v16M17 4v7c0 3-2 5-2 9M3 20h18"/>`,
  canyon: `<path d="M2 9h5l2 4h6l2-4h5M2 9v11h20V9M9 13l1 7M15 13l-1 7"/>`,
  wall: `<path d="m2 15 4-2 4 1 4-3 4 1 4-2v5l-4 2-4-1-4 3-4-1-4 2ZM6 13v-2M14 11V9"/>`,
  dunes: `<path d="M2 18c3-4 6-4 9 0s6 4 11-1M2 13c3-3 5-3 7-1M14 12c2-2 5-2 8 0"/>`,
  // off the Earth (pigeon/space.js): a crater, a flag on the Moon, a rover, a lander, a volcano
  crater: `<circle cx="12" cy="13" r="7.5"/><path d="M5.5 10.5c2.5 2 10.5 2 13 0M8 18.5c1.5-1.2 6.5-1.2 8 0"/><circle cx="12" cy="4" r="1"/>`,
  flag: `<path d="M8 21V4M8 4h9l-2 3 2 3H8M3 21h18M15 21c0-2 2-3 3-3"/>`,
  rover: `<path d="M4 15h16v-4H4ZM7 11V8h6v3M15 8h3M16.5 8V5.5"/><circle cx="7" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>`,
  lander: `<path d="M8 13h8l2-4H6ZM12 9V5M10 5h4M8 13l-3 6M16 13l3 6M3 19h4M17 19h4"/>`,
  volcano: `<path d="m2 20 6-11h8l6 11ZM8 9l2 1.5 2-1 2 1.5 2-2M12 6V3"/>`,
};
// and each landmark its own drawing (by its id), so Big Ben isn't the Eiffel Tower; the kind's is the fallback
const pmC = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const WATER = "M2 20.5c2 1 4 1 6 0s4-1 6 0 4 1 6 0";
const VOLCANO = `<path d="M2 20 8 10h8l6 10ZM8 10l2 1.5 2-1 2 1.5 2-2M11 7c-.6-1 .6-2 0-3.2M13.6 7.4c.6-1-.4-2 .4-3.2"/>`;
const PM_MARK = {
  // towers and buildings
  bigben: `<path d="M9 21V9h6v12M8 9h8M9.5 9 12 3.5 14.5 9M12 3.5V2M7 21h10M12 13.6v1.2l.9.6"/>${pmC(12, 14.4, 2)}`,
  eiffel: PM_ICON.tower,
  pisa: `<path d="M8.4 21 10.8 4h4L13.6 21ZM9.2 16.5h4.9M9.8 12h4.6M10.4 7.6h4.4M6 21h10"/>`,
  burjkhalifa: `<path d="M12 2v3M10.9 5h2.2l.7 6h-3.6ZM10.2 11h3.6l.9 10H9.3ZM6.5 21h11M10 16h4"/>`,
  empirestate: `<path d="M12 2v3M11 5h2v3h-2ZM10 8h4v4h-4ZM9 12h6v9H9ZM7 21h10M12 12v9"/>`,
  cntower: `<path d="M12 2v6M11 8h2l.6 13h-3.2ZM8.5 10.5h7l-1.2 2.2H9.7ZM7 21h10"/>`,
  spaceneedle: `<path d="M12 2v3M6 7h12l-2.4 2.2H8.4ZM10.2 9.2 8.2 21M13.8 9.2l2 11.8M9.2 15.5h5.6M6 21h12"/>`,
  petronas: `<path d="M7 21V8l1.5-4L10 8v13M14 21V8l1.5-4L17 8v13M10 12.5h4M5 21h14M8.5 4V2.5M15.5 4V2.5"/>`,
  marinabay: `<path d="M2.5 6.2c3-1.6 16-1.6 19 0l-1 1.4h-17ZM6 7.6V21M12 7.6V21M18 7.6V21M3 21h18"/>`,
  norwichcath: `<path d="M12 2.5 13.8 9h-3.6ZM10.2 9h3.6v12h-3.6ZM4 21v-6.5L10.2 12M20 21v-6.5L13.8 12M3 21h18"/>`,
  yorkminster: `<path d="M5 21V7h4v14M15 21V7h4v14M9 21v-8.5l3-2 3 2V21M5 7l.6-2.5h2.8L9 7M15 7l.6-2.5h2.8L19 7M3 21h18M12 21v-4"/>`,
  sagrada: `<path d="M5 21V10l1.5-5L8 10v11M10.5 21V8L12 2.5 13.5 8v13M16 21V10l1.5-5L19 10v11M3 21h18"/>`,
  belem: `<path d="M8 21V9h8v12M7 9h10M8 9V6.8h2V9M11 9V6.8h2V9M14 9V6.8h2V9M10.6 21v-3.2a1.4 1.4 0 0 1 2.8 0V21M10.5 13h3M4 21h16"/>`,
  marrakech: `<path d="M9 21V7h6v14M10.5 7V4.5h3V7M12 4.5V2.2M9 11h6M11 14.2h2M7 21h10"/>`,
  // monuments
  stonehenge: `<path d="M2 20h20M4.5 20v-7.5M8.5 20v-7.5M3.6 12.5h5.8M15.5 20v-7.5M19.5 20v-7.5M14.6 12.5h5.8M12 20v-4.5"/>`,
  angelnorth: `<path d="M12 7v14M2.5 9.2 12 11l9.5-1.8M2.5 9.2v1.6L12 12.6l9.5-1.8V9.2M9.5 21h5"/>${pmC(12, 5, 1.6)}`,
  colosseum: `<path d="M3 9c0-2.2 4-4 9-4s9 1.8 9 4v9.5c0 1.4-4 2.5-9 2.5s-9-1.1-9-2.5ZM3 9c0 2 4 3.4 9 3.4S21 11 21 9M6.2 13.2v6M9.1 13.8v6.6M12 14v7M14.9 13.8v6.6M17.8 13.2v6"/>`,
  brandenburg: `<path d="M3 8.5h18M4 8.5V6.5h16v2M5 8.5V21M8.5 8.5V21M15.5 8.5V21M19 8.5V21M10.5 8.5V21M13.5 8.5V21M3 21h18M10 6.5l2-2.5 2 2.5"/>`,
  acropolis: `<path d="M3 9 12 4l9 5ZM4 9h16M5.5 9v10M9 9v10M12.5 9v10M16 9v10M19 9v10M3 19h18M2 21h20"/>`,
  atomium: `<path d="m7.2 7.2 3.4 3.4M16.8 7.2l-3.4 3.4M7.2 16.8l3.4-3.4M16.8 16.8l-3.4-3.4M12 21v-6.6"/>${pmC(12, 12, 2)}${pmC(6, 6, 1.7)}${pmC(18, 6, 1.7)}${pmC(6, 18, 1.7)}${pmC(18, 18, 1.7)}`,
  windmills: `<path d="m10 21 1-9h2l1 9M12 12 7 7M12 12l5-5M12 12l-5 5M12 12l5 5M8 21h8M7 7l1.6-.4M17 7l.4 1.6M7 17l-.4-1.6M17 17l-1.6.4"/>`,
  littlemermaid: `<path d="M3 20.5h18M5 20.5c0-2.4 2.4-4 6-4s5 1.6 5 4M11.5 16.5c1.6-2.4 1.6-5.2-.4-7M11.1 9.5c-1.5 1.5-1.8 3.4-1.2 5M12.6 12.4l2.6 1.2"/>${pmC(11.8, 7.3, 1.6)}`,
  petra: `<path d="M4 21V4h16v17M7.5 21v-6h9v6M8 15V9.5h8V15M10 9.5V6.5h4v3M12 6.5V5M3 21h18M10.5 21v-3h3v3"/>`,
  liberty: `<path d="M10 21h4l-.8-9h-2.4ZM12 12V9M12 9l3-4.6M14.4 4.4l.6-1.6 1 1M8 21h8"/>${pmC(12, 7.5, 1.6)}`,
  christ: `<path d="M12 6.5V21M3 8.5h18M10.6 8.5 10 21h4l-.6-12.5M8 21h8"/>${pmC(12, 4.4, 1.5)}`,
  operahouse: `<path d="M2 19h20M4 19c1-5.5 3-8.5 6.5-9.5-1 3-1 6.4 0 9.5M10.5 19c1-6.5 4-9.6 7.5-10.6-1 4.2-1 7.4 0 10.6M18 19c.8-3 2-4.8 3.6-5.6"/>`,
  angkor: `<path d="M3 21h18M5 21v-6h14v6M7 15l1-4h8l1 4M10 11l2-7 2 7M6 15l1-3.4M18 15l-1-3.4M11 21v-3h2v3"/>`,
  rushmore: `<path d="m2 20 4-8 3-2 3 1 3-2 3 2 4 9Z"/>${pmC(8, 14.2, 1)}${pmC(12, 13.4, 1)}${pmC(16, 14.2, 1)}`,
  machupicchu: `<path d="M2 20h20M3 20l2-3h14l2 3M6 17l2-3h8l2 3M13 14l3.2-9 3 5 .8 4"/>`,
  // domes
  hagiasophia: `<path d="M4 21V8.5M20 21V8.5M4 8.5l.5-3 .5 3M19 8.5l.5-3 .5 3M7 21v-6a5 5 0 0 1 10 0v6M12 10V7.8M3 21h18M10.5 21v-3h3v3"/>`,
  redsquare: `<path d="M5 21v-6.5M12 21V10.5M19 21v-6.5M5 14.5c-2-1-2-3 0-5 2 2 2 4 0 5ZM12 10.5c-2.5-1.5-2.5-4 0-6.2 2.5 2.2 2.5 4.7 0 6.2ZM19 14.5c-2-1-2-3 0-5 2 2 2 4 0 5ZM3 21h18M12 4.3V2.8"/>`,
  tajmahal: `<path d="M3 21V9M21 21V9M6 21v-7h12v7M7.8 14c-1-3 1-6 4.2-7.2 3.2 1.2 5.2 4.2 4.2 7.2M12 6.8V4.8M2 21h20M10.6 21v-3.4a1.4 1.4 0 0 1 2.8 0V21"/>`,
  // castles
  edinburgh: `<path d="M2 21c2-3.2 4-5 7-6h6c3 1 5 2.8 7 6M8 15V9.5h1.6V8h1.4v1.5h2V8h1.4v1.5H16V15M11 15v-2.4h2V15"/>`,
  montstmichel: `<path d="M2 20c3-2 5-3 10-3s7 1 10 3M6 17l2-5h8l2 5M10 12l2-9 2 9M9 14.5h6"/>`,
  alhambra: `<path d="M3 21V10h4v11M17 21V10h4v11M7 21v-7h10v7M3 10V8.2h1.3v1h1.4v-1H7V10M17 10V8.2h1.3v1h1.4v-1H21V10M10.6 21v-3a1.4 1.4 0 0 1 2.8 0v3"/>`,
  neuschwanstein: `<path d="M6 21V11M10 21V8.5M14 21V6.5M18 21V11.5M5 11l1-4 1 4ZM9 8.5l1-4.2 1 4.2ZM13 6.5l1-4.3 1 4.3ZM17 11.5l1-3.2 1 3.2ZM4 21h16"/>`,
  prague: `<path d="M2 21h20M3 21v-6h18v6M9 15V8.5l1.5-4.5L12 8.5V15M12.5 15V8.5L14 4l1.5 4.5V15M5.5 15v-2M18.5 15v-2"/>`,
  forbidden: `<path d="M3 21h18M5 21v-6h14v6M2.5 15l2.5-3h14l2.5 3ZM6 12l2-3h8l2 3ZM12 9V7M10.6 21v-3.4h2.8V21"/>`,
  // bridges and water
  towerbridge: `<path d="M2 15h20M6 21V5.5M18 21V5.5M5 5.5l1-2 1 2M17 5.5l1-2 1 2M6 9h12M2 15c2 1 3 3 4 6M22 15c-2 1-3 3-4 6M5 5.5h2M17 5.5h2"/>`,
  goldengate: PM_ICON.bridge,
  venice: `<path d="M3 15c3 2 15 2 18-1M5 15 3.6 12M19 14.3l2.2-3.8M9 11v4.2M7.2 11h3.6M${WATER.slice(1)}"/>`,
  // cliffs and coasts
  dover: `<path d="M3 13.5c2.5-.8 4-3.5 6.5-3.5s3.5 2 6 2 4-1.6 5.5-3M3 13.5V18h18V9M${WATER.slice(1)}"/>`,
  causeway: `<path d="M4 20v-6l2-1 2 1v6M8 20v-9l2-1 2 1v9M12 20v-7.5l2-1 2 1V20M16 20v-5l2-1 2 1v5M2 20h20"/>`,
  santorini: `<path d="M3 20h18M5 20v-5h4v5M10 20v-7h5v7M16 20v-4h3v4M10 13a2.5 2.5 0 0 1 5 0M12.5 10.5V9M12 20v-2.5h1V20"/>`,
  fjords: `<path d="M2 5c2 3 3 8 5.2 12h9.6C19 13 20 8 22 5M7.2 17c2.4 1 7.2 1 9.6 0M10 14.5h4"/>`,
  halong: `<path d="M3 17.5c0-4 1-8.5 3-8.5s2 4.5 2 8.5M9 17.5c0-5 1-10.5 3-10.5s3 5.5 3 10.5M15.5 17.5c0-3 1-6.2 2.8-6.2S21 14.5 21 17.5M${WATER.slice(1)}"/>`,
  milford: `<path d="m3 17.5 4-10 2 4 3-8.5 3 7.5 2-3 4 10M${WATER.slice(1)}"/>`,
  // mountains
  matterhorn: `<path d="M3 20 10 8.5l1.2-4.5 2.3 3.5L21 20ZM10 8.5l2 1.2 1.6-2"/>`,
  vesuvius: VOLCANO, etna: VOLCANO,
  fuji: `<path d="M2 20 9.2 8h5.6L22 20ZM9.2 8l1.4 2.2 1.4-1.6 1.4 1.6L14.8 8M6 20.5h12"/>`,
  tablemtn: `<path d="M2 20l3-9h14l3 9ZM5 11h14M8.5 14l-1 6M15.5 14l1 6"/>`,
  uluru: `<path d="M2 19c1-5 4-7 10-7s9 2 10 7ZM2 19h20M7 14.4l1 4M12 12v6.4M16.6 13l-1.2 5.4"/>`,
  everest: `<path d="m2 20 7-13 3 4 2-2 8 11ZM9 7V3l3 1-3 1M7.4 10l1.6 1.2 1.2-.8"/>`,
  kilimanjaro: `<path d="M2 20c3-5 6-9 8-10h4c2 1 5 5 8 10ZM10 10l1.2 2 1.8-1.4 1 1.4"/>`,
  snowdon: `<path d="m2 20 5-8 3 2 3-6 3 4 6 8ZM13 8l1.4 1.2M7 20l4-4 3 1 3 3"/>`,
  bennevis: `<path d="M2 20c2-6 6-10 10-10 4.4 0 8 4 10 10ZM9 11.6c1.8-.8 4.2-.8 6 0"/>`,
  montblanc: `<path d="m2 20 6-9 2 2 2-5 2 3 2-1 6 10ZM8 11l1.2 2.2L12 8M14 11l2-1"/>`,
  aconcagua: `<path d="m2 20 4-7 2 2 3-8 2 3 2-4 2 5 5 9ZM11 7l.8 2.2L13 10M15 6l.8 1.6"/>`,
  cliffsmoher: `<path d="M3 20V9c2 0 2.5 2 4.5 2S10 7 12 7s2.5 3 4.5 3S19 8.5 21 8.5V20M7.5 11v9M12 7v13M16.5 10v10"/>`,
  iceland: `<path d="M2 5.5h7.5V21M22 5.5h-7.5V21M11 5.5c-.6 4 .6 9 0 13M13 5.5c.6 4-.6 9 0 13M8 20.5c2 1.2 6 1.2 8 0"/>`,
  niagara: `<path d="M3 6.5c3 3 15 3 18 0M5.5 9c-.8 3.5.8 7 0 10M9 10.2c-.8 3.5.8 7 0 10M12 10.6c-.8 3.5.8 7 0 10M15 10.2c-.8 3.5.8 7 0 10M18.5 9c-.8 3.5.8 7 0 10"/>`,
  victoriafalls: `<path d="M2 6.5h20M4 7.5c-.8 3.5.8 7.5 0 11M8 7.5c-.8 3.5.8 7.5 0 11M12 7.5c-.8 3.5.8 7.5 0 11M16 7.5c-.8 3.5.8 7.5 0 11M20 7.5c-.8 3.5.8 7.5 0 11M2 20.5c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>`,
  iguazu: `<path d="M2 6h6M10 4.5h5M17 7h5M4 6c-.6 3 .6 8 0 12M6.5 6c-.6 3 .6 7 0 11M12.5 4.5c-.6 4 .6 9 0 14M19.5 7c-.6 3 .6 7 0 11M2 20.5c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>`,
  // the rest
  pyramids: `<path d="m1.5 20 6-10 6 10M9.5 20l6-12 7 12M1.5 20h21"/>`,
  chichen: `<path d="M3 20h18M4.5 20v-3h15v3M6.5 17v-3h11v3M8.5 14v-3h7v3M10.5 11V8h3v3M11 20v-6h2v6"/>`,
};
const pmIco = (pm) => PM_MARK[pm.id] || PM_ICON[pm.kind] || PM_ICON.monument;
const pmDay = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()].toUpperCase()} ${String(d.getFullYear()).slice(2)}`; };
const pmName = (n) => n.replace(/^the /, "");
// the round postmark itself: a double ring, the landmark, the day, and the cancellation waves
const pmSeal = (pm) => `<span class="pmseal pm-${esc(pm.kind)}" aria-hidden="true"><svg viewBox="0 0 24 24" class="ico">${pmIco(pm)}</svg></span>`;
// under a letter that flew past somewhere famous
function postmarkHtml(m, mine) {
  if (!m.postmarks?.length || m.flying || m.lost) return "";
  return `<div class="pmarks${mine ? " me" : ""}">${m.postmarks.map((pm) => `<button type="button" class="pmark pm-${esc(pm.kind)}" data-act="pmarkinfo" data-id="${esc(m.id)}:${esc(pm.id)}"
      aria-label="Postmark: flew past ${esc(pm.name)}">${pmSeal(pm)}<span class="pmt"><b>${esc(pmName(pm.name))}</b><small>${pmDay(pm.at)}</small></span></button>`).join("")}</div>`;
}
// the Flight Log's collection
function postmarksHtml(pm) {
  if (!pm) return "";
  const list = pm.marks || [], left = Math.max(0, pm.of - list.length);
  const tile = (x) => `<button type="button" class="pmtile pm-${esc(x.kind)}" data-act="pmarkall" data-id="${esc(x.id)}" aria-label="${esc(x.name)}: first flown past ${esc(fmtDate(x.at))}${x.n > 1 ? `, ${x.n} flights` : ""}">${pmSeal(x)}<b>${esc(pmName(x.name))}</b><small>${pmDay(x.at)}</small></button>`;
  return `<div class="ghead">Postmarks <span class="gcount">${list.length} of ${pm.of}</span></div>
    <div class="pmgrid">${list.map(tile).join("")}${Array.from({ length: Math.min(left, list.length ? (3 - (list.length % 3)) % 3 : 3) }, () => `<span class="pmtile unknown" aria-hidden="true"><span class="pmseal"><b>?</b></span><b>Somewhere</b><small>to find</small></span>`).join("")}</div>
    <div class="gfoot">${list.length ? `${left} more to find. ` : ""}A pigeon that flies past somewhere famous, like the Eiffel Tower or Mount Fuji, brings back its postmark on the letter. The ones in your own town don’t count.</div>`;
}
// In the Flight Log: your passport, closed, and what's in it (it opens as a book: passportBook)
function passportHtml(pp) {
  if (!pp) return "";
  const list = pp.places || [], last = list[0], pages = list.length ? passportPages(pp).length : 0, trips = new Set(list.map((p) => p.trip || p.at)).size;
  return `<div class="ghead">Passport <span class="gcount">${pp.countries} countr${pp.countries === 1 ? "y" : "ies"} · ${pp.seas} sea${pp.seas === 1 ? "" : "s"}</span></div>
    <button type="button" class="ppcard" data-act="passport" aria-label="Open your passport"><span class="ppmini" aria-hidden="true">${passportCover()}</span>
      <span class="ppt"><b>${esc(first(S.me.name))}’s Passport</b>${list.length ? `<small>${trips} journey${trips === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"} stamped</small>
      <small>Last stamp: ${esc(last.name.replace(/^the /, ""))}, ${esc(pmDay(last.at).slice(0, -3).replace(/(\w+)$/, (x) => x[0] + x.slice(1).toLowerCase()))}</small>` : `<small>Each country and sea your pigeons fly over gets a stamp, once they’ve landed.</small>`}
      <span class="pill">Open Passport</span></span></button>`;
}
/* ---------- the passport, as a passport ----------
   A book: a photo page (you, and how far your pigeons have flown), then visa
   pages that fill up with rubber stamps in the order your pigeons flew, a
   journey at a time: each country in its own ink with its outline inside
   (pigeon/shapes.js, loaded when the passport opens), each sea crossed, and
   "Arrived by sea" for a journey that came by ship. Swipe to turn the page. */
let SHAPES = null;
const shapesLoad = () => (SHAPES ? Promise.resolve(SHAPES) : import("./shapes.js").then((m) => (SHAPES = m.SHAPES)).catch(() => (SHAPES = {})));
const PP_INK = ["#b3262e", "#1f4fa3", "#5b3a9c", "#1d6b45", "#2a2a2e", "#126e78", "#7a4a1c"];
const ppHash = (x, k = 5) => [...String(x)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, k);
const ppInk = (p) => (p.sea ? "#1f4fa3" : PP_INK[ppHash(p.name) % PP_INK.length]);
const PP_PER = 10;
// The pages: oldest first, a journey's stamps together; a page holds PP_PER, and a journey
// that wouldn't get three on this one starts the next
function passportPages(pp) {
  const list = [...(pp.places || [])].sort((a, b) => a.at - b.at || a.ord - b.ord), pages = [];
  let cur = null, trip;
  for (const p of list) {
    const k = p.trip || `d${Math.floor(p.at / DAY)}`, fresh = k !== trip; trip = k;
    if (!cur || cur.stamps.length >= PP_PER || (fresh && cur.stamps.length > PP_PER - 3)) pages.push(cur = { stamps: [], trips: [] });
    cur.stamps.push(p); if (!cur.trips.some((t) => t.k === k)) cur.trips.push({ k, at: p.at, trip: pp.trips?.[p.trip] || null });
  }
  return pages;
}
// a journey, as the top of the page says it: "16 OCT · LONDON → SYDNEY"
const ppJourney = (t) => [pmDay(t.at).slice(0, -3), t.trip?.from && t.trip?.to ? `${t.trip.from} → ${t.trip.to}` : ""].filter(Boolean).join(" · ").toUpperCase();
const ppBird = `<path transform="translate(-12 -10)" d="${BIRD}"/>`;
const PP_STAMPS = ["rect", "circle", "oval", "hex", "tri"];
// One stamp, drawn in its local box, in its ink (SVG presentation attributes: no inline styles)
function ppStamp(p, kind, code) {
  const cap = p.name.replace(/^the /, "").toUpperCase(), d = pmDay(p.at), sh = !p.sea && SHAPES?.[p.name];
  const fit = (n, w) => (n.length * 9.6 > w ? ` textLength="${w}" lengthAdjust="spacingAndGlyphs"` : "");
  // (the Moon: its disc and a few craters, where a country has its outline)
  const moonMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="11" class="ps"/><circle cx="-3.5" cy="-3" r="3" class="ps"/><circle cx="4" cy="2" r="2.2" class="ps"/><circle cx="-1.5" cy="5.5" r="1.4" class="ps"/><circle cx="5" cy="-5" r="1" class="ps"/></g>`;
  // (Mars: a disc with its polar cap; Low Earth Orbit: the Earth with a ring round it)
  const marsMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="11" class="ps"/><path d="M-6-9a11 11 0 0 1 12 0Z" class="pf"/><path d="M-9 2c4-2 8 2 12 0s5-1 6 0" class="ps"/></g>`;
  const orbitMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="8" class="ps"/><ellipse rx="13" ry="4" transform="rotate(-20)" class="ps"/><circle cx="11" cy="-4" r="1.6" class="pf"/></g>`;
  const land = (x, y, k) => (p.name === "the Moon" ? moonMark(x, y, k) : p.name === "Mars" ? marsMark(x, y, k) : p.name === "Low Earth Orbit" ? orbitMark(x, y, k) : sh ? `<path d="${sh}" transform="translate(${x} ${y}) scale(${k})" class="pf"/>` : `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})" class="pf">${ppBird}</g>`);
  const T = (x, y, cls, txt, w) => `<text x="${x}" y="${y}" class="${cls}"${w ? fit(txt, w) : ""}>${esc(txt)}</text>`;
  const id = `pa${ppHash(p.name + p.at)}`;
  switch (kind) {
    case "rect": return [140, 88, `<rect x="2" y="2" width="136" height="84" rx="10" class="ps"/><rect x="7" y="7" width="126" height="74" rx="6" class="ps pst"/>
      ${T(70, 21, "px pxs", `ENTRY · ${code}`)}${land(13, 29, 0.32)}${T(92, 48, "px pxb", cap, 76)}${T(92, 63, "px", d)}<g transform="translate(92 74) scale(.55)" class="pf">${ppBird}</g>`];
    case "circle": return [100, 100, `<circle cx="50" cy="50" r="47" class="ps"/><circle cx="50" cy="50" r="40" class="ps pst"/>
      <defs><path id="${id}a" d="M14 50a36 36 0 0 1 72 0"/><path id="${id}b" d="M16 52a34 34 0 0 0 68 0"/></defs>
      <text class="px pxb"${fit(cap, 96)}><textPath href="#${id}a" startOffset="50%">${esc(cap)}</textPath></text><text class="px pxs"><textPath href="#${id}b" startOffset="50%">BY PIGEON · ${code}</textPath></text>
      ${land(38, 26, 0.24)}${T(50, 59, "px pxs", d)}`];
    case "oval": return [130, 80, `<ellipse cx="65" cy="40" rx="62" ry="37" class="ps"/><ellipse cx="65" cy="40" rx="55" ry="30" class="ps pst"/>
      ${T(65, 30, "px pxb", cap, 92)}${T(65, 45, "px", pmDay(p.at).replace(/ (\d\d)$/, " 20$1"))}<text x="65" y="56" class="px pxs" textLength="70" lengthAdjust="spacingAndGlyphs">DEPARTED · ${code}</text>`];
    case "hex": return [100, 100, `<path d="M50 2 93 26v48L50 98 7 74V26Z" class="ps"/><path d="M50 9 87 30v40L50 91 13 70V30Z" class="ps pst"/>
      ${land(32, 18, 0.36)}${T(50, 67, "px pxb", cap, 64)}${T(50, 79, "px pxs", d)}`];
    case "tri": return [110, 96, `<path d="M55 4 106 92H4Z" class="ps"/><path d="M55 16 95 85H15Z" class="ps pst"/>
      ${land(41, 34, 0.28)}${T(55, 70, "px pxb pxs2", cap, cap.length * 7.6 > 62 ? 62 : 0)}${T(55, 80, "px pxs", d)}`];
    case "sea": return [130, 66, `<rect x="2" y="2" width="126" height="62" rx="4" class="ps" stroke-dasharray="7 3"/>
      ${T(65, 20, "px pxs", p.ship ? "BY SHIP · CROSSED" : "AT SEA · CROSSED")}${T(65, 36, "px pxb", cap, 112)}${T(65, 50, "px pxs", d)}<path d="M14 56c5-4 8 4 13 0s8 4 13 0M90 56c5-4 8 4 13 0s8 4 13 0" class="ps pst"/>`];
    default: return [136, 74, `<rect x="2" y="2" width="132" height="70" rx="14" class="ps"/><rect x="8" y="8" width="120" height="58" rx="10" class="ps pst"/>
      <path d="M18 44h30l-5 8H23ZM26 44v-12h12l4 12M31 32v-6" class="ps"/>${T(88, 28, "px pxb", cap, 80)}${T(88, 42, "px", d)}${T(88, 55, "px pxs", "ARRIVED BY SEA")}`];
  }
}
// A visa page: its journeys at the top, then the stamps, two to a row, each a little off and askew
function ppVisa(pg, n) {
  const ship = new Map(pg.trips.map((t) => [t.k, !!t.trip?.ship]));
  const lastLand = new Map();
  for (const p of pg.stamps) if (!p.sea) lastLand.set(p.trip || `d${Math.floor(p.at / DAY)}`, p);
  const heads = pg.trips.map(ppJourney), head = heads.length > 2 ? `${heads.slice(0, 2).join(" · ")} · +${heads.length - 2}` : heads.join(" · ");
  const stamps = pg.stamps.map((p, i) => {
    const k = p.trip || `d${Math.floor(p.at / DAY)}`, h = ppHash(p.name + k), sailed = ship.get(k);
    const kind = p.sea ? "sea" : sailed && lastLand.get(k) === p ? "ship" : PP_STAMPS[ppHash(p.name, 9) % PP_STAMPS.length];
    const [w0, h0, body] = ppStamp({ ...p, ship: sailed }, kind, `IF ${100 + (ppHash(k) % 900)}`), K = 0.88, w = w0 * K, hgt = h0 * K;
    const col = i % 2, row = Math.floor(i / 2), cx = (col ? 264 : 94) + ((h % 21) - 10), cy = 104 + row * 89 + ((h >> 5) % 13) - 6, rot = ((h >> 9) % 27) - 13;
    const x = Math.max(4, Math.min(354 - w, cx - w / 2)), y = Math.max(52, Math.min(498 - hgt, cy - hgt / 2));
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${rot} ${w / 2} ${hgt / 2}) scale(${K})" color="${ppInk(p)}" filter="url(#pprough)" data-act="stampinfo" data-id="${esc(p.name)}" role="button" tabindex="0"
      aria-label="${esc(p.name)}: first flown over ${esc(fmtDate(p.at))}${p.n > 1 ? `, ${p.n} flights` : ""}"><g mask="url(#ppwear${h % 3})">${body}</g></g>`;
  }).join("");
  return `<svg viewBox="0 0 358 520" class="ppg" role="group" aria-label="Page ${n}"><rect width="358" height="520" rx="6" class="ppaper"/><rect width="358" height="520" rx="6" fill="url(#ppguil)"/>
    <g transform="translate(179 286) scale(6)" class="ppwm">${ppBird}</g>
    <text x="179" y="26" class="pphd">VISAS · VISAS</text><text x="179" y="42" class="ppjr"${head.length > 58 ? ` textLength="330" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(head)}</text>
    ${stamps}<text x="${n % 2 ? 340 : 18}" y="508" class="pppn">${n}</text></svg>`;
}
// The photo page
function ppData(d) {
  const pp = d.passport || {}, me = S.me, n = (x) => Math.round(x).toLocaleString("en-GB"), up = (x) => esc(String(x || "–").toUpperCase());
  const [given, ...rest] = String(me.name || "").trim().split(/\s+/), sur = rest.join(" ") || given;
  // (the machine-readable lines, as a real passport has them: "<" for every space; escaped, as they're written into the page)
  const mrz = (x) => String(x).toUpperCase().normalize("NFD").replace(/[^A-Z0-9]+/g, "<");
  const line1 = esc(`P<IFL${mrz(sur)}<<${mrz(rest.length ? given : "")}`.padEnd(40, "<").slice(0, 40));
  const line2 = esc(`${String(pp.countries || 0).padStart(4, "0")}IF195<${pp.seas || 0}SEA${Math.round((d.km || 0) * 0.621371)}MI`.padEnd(40, "<").slice(0, 40));
  const birds = S.birds.slice(0, 2).map((b) => b.name).join(" · ");
  const f = (label, val, cls = "") => `<span class="ppf ${cls}"><small>${label}</small><b>${val}</b></span>`;
  return `<div class="ppdata"><div class="pptop"><b>PASSPORT</b><small>PASSEPORT · INFLIGHT</small><em>TYPE P · LOFT</em></div>
    <div class="ppid"><span class="ppphoto">${avatar(me, "xl")}</span><span class="ppfs">${f("Surname / Nom", up(sur))}${f("Given names / Prénoms", up(rest.length ? given : ""))}${f("Home loft / Pigeonnier", up(me.place))}${f("Handle", `@${up(me.handle)}`)}</span></div>
    <div class="ppgrid">${f("Keeping pigeons since", up(d.since ? fmtDate(d.since).replace(/^\d+ /, "") : ""))}${f("Miles flown / Milles", `${n((d.km || 0) * 0.621371)} MI`)}
      ${f("Countries / Pays", `${pp.countries || 0} OF 195`)}${f("Seas / Mers", n(pp.seas || 0))}
      ${f("Furthest flight", d.longest?.place ? `TO ${up(d.longest.place)}` : "–")}${f("Pigeons", birds ? up(birds) : "–")}</div>
    <div class="ppsig"><svg viewBox="0 0 160 30" aria-hidden="true"><path d="M4 20c14-14 22 6 34-4s18-12 28 1 20 4 28-7 14 6 26 4"/></svg><small>Signature of bearer</small></div>
    <div class="ppmrz" aria-label="Machine readable zone">${line1}<br>${line2}</div></div>`;
}
const passportCover = () => `<svg viewBox="0 0 250 350" class="ppcover"><rect width="250" height="350" rx="14" class="ppleather"/><rect x="6" width="5" height="350" fill="rgba(0,0,0,.25)"/>
  <g class="ppgold"><text x="125" y="70" class="ppc1">INFLIGHT</text><circle cx="125" cy="170" r="46"/><circle cx="125" cy="170" r="39" stroke-width="1"/>
  <g transform="translate(125 172) scale(2.9)" class="ppgoldf">${ppBird}</g><path d="M74 205c-14-14-16-38-4-56M176 205c14-14 16-38 4-56M70 196l-8-2M66 184l-8-1M66 171l-8 1M70 159l-7 4M180 196l8-2M184 184l8-1M184 171l8 1M180 159l7 4" stroke-width="1.6"/>
  <text x="125" y="270" class="ppc2">PASSPORT</text><text x="125" y="290" class="ppc3">PASSEPORT · PASAPORTE</text><rect x="111" y="312" width="28" height="18" rx="3" stroke-width="1.4"/><circle cx="125" cy="321" r="4.5" stroke-width="1.2"/></g></svg>`;
// the ink: a little rough at the edges, and worn in places (one set for the whole book)
const PP_DEFS = `<svg width="0" height="0" class="ppdefs" aria-hidden="true"><defs>
  <filter id="pprough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter>
  ${[0, 1, 2].map((i) => `<filter id="ppspk${i}"><feTurbulence type="fractalNoise" baseFrequency="${[0.9, 1.2, 0.7][i]}" numOctaves="2" seed="${i * 7 + 1}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 ${[2.25, 2.4, 2.1][i]}"/></filter>
  <mask id="ppwear${i}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="200" height="160"><rect x="-20" y="-20" width="200" height="160" filter="url(#ppspk${i})"/></mask>`).join("")}
  <pattern id="ppguil" width="60" height="24" patternUnits="userSpaceOnUse"><path d="M0 12c10-10 20-10 30 0s20 10 30 0M0 4c10-10 20-10 30 0s20 10 30 0M0 20c10-10 20-10 30 0s20 10 30 0" class="ppguilp"/></pattern></defs></svg>`;
// The book: the photo page, then each visa page; only those near the one open are drawn
function passportBook(d) {
  const pages = passportPages(d.passport || {});
  return `${PP_DEFS}<div class="ppbook" role="region" aria-label="Your passport">${[`<div class="ppage" data-i="0">${ppData(d)}</div>`, ...pages.map((_, i) => `<div class="ppage" data-i="${i + 1}"></div>`)].join("")}</div>
    <div class="pppager"><button type="button" class="nbtn" data-act="ppturn" data-id="-1" aria-label="Previous page">${I.back}</button><span class="pplbl" aria-live="polite"></span><button type="button" class="nbtn ppnext" data-act="ppturn" data-id="1" aria-label="Next page">${I.back}</button></div>
    ${pages.length ? "" : `<div class="gfoot">Each country and sea your pigeons fly over gets a stamp on the next page, once they’ve landed.</div>`}`;
}
function ppFill(book, d) {
  const pages = passportPages(d.passport || {}), at = Math.round(book.scrollLeft / Math.max(1, book.clientWidth));
  book.querySelectorAll(".ppage").forEach((el) => {
    const i = +el.dataset.i; if (!i) return;
    const near = Math.abs(i - at) <= 1;
    if (near && !el.firstChild) el.innerHTML = ppVisa(pages[i - 1], i);
    else if (!near && el.firstChild) el.innerHTML = "";
  });
  const lbl = $(".pplbl", $layer); if (lbl) lbl.textContent = at ? `Page ${at} of ${pages.length}` : pages.length ? "Photo page · swipe to turn" : "Photo page";
  $layer.querySelectorAll("[data-act=ppturn]").forEach((b) => { b.disabled = +b.dataset.id < 0 ? at <= 0 : at >= pages.length; });
  if (S.sheet?.type === "passport") S.sheet.page = at;
}
async function openPassport(trip) {
  const from = S.sheet?.type === "flightlog" ? S.sheet : null;
  const sh = S.sheet = { type: "passport", data: from?.data || null, back: !!from, trip };
  renderSheet();
  try {
    if (!sh.data) sh.data = await api("flight-log");
    await shapesLoad();
    if (S.sheet !== sh) return;
    if (trip) { const i = passportPages(sh.data.passport || {}).findIndex((pg) => pg.stamps.some((p) => p.trip === trip)); if (i >= 0) sh.page = i + 1; }
    renderSheet();
  } catch (err) { if (S.sheet === sh) { S.sheet = null; renderSheet(); } toast(esc(err.message)); }
}
function badgesHtml(list) {
  if (!list.length) return "";
  // badges earned since this phone last looked get a "New" tag (remembered on this phone only)
  let seen = null; try { seen = JSON.parse(localStorage.getItem("inflight-badges") || "null"); } catch (_) {}
  const earned = list.filter((b) => b.earned).map((b) => b.id);
  try { localStorage.setItem("inflight-badges", JSON.stringify(earned)); } catch (_) {}
  const tile = (b) => {
    const [icon, tint] = BADGE_LOOK[b.id] || ["bird", "gray"], fresh = b.earned && seen && !seen.includes(b.id);
    return `<div class="badge2${b.earned ? " earned" : ""}"><span class="bico tile ${b.earned ? tint : "gray"}">${I[icon] || I.bird}</span>
      <b>${esc(b.name)}${fresh ? ` <i class="newb">New</i>` : ""}</b><small>${esc(b.desc)}</small>
      ${!b.earned && b.of ? `<i class="bprog" data-w="${b.progress.toFixed(3)}"></i><small class="bnum">${b.n.toLocaleString("en-GB")} of ${b.of.toLocaleString("en-GB")}</small>` : ""}</div>`;
  };
  return `<div class="ghead">Achievements <span class="gcount">${earned.length} of ${list.length}</span></div><div class="badges">${[...list].sort((a, b) => b.earned - a.earned).map(tile).join("")}</div>`;
}

// Rare pigeons: pick a look you've unlocked (everyone you send to sees it)
function skinsHtml(list, mine) {
  if (!list.length) return "";
  const tile = (id, name, open, sub) => `<button type="button" class="skin2${open ? "" : " locked"}${(mine || null) === id ? " on" : ""}" ${open ? `data-act="skin" data-id="${id || "usual"}"` : "disabled"} aria-pressed="${(mine || null) === id}">
      <span class="sbig">${pg("standard", id)}</span><b>${esc(name)}</b><small>${sub}</small></button>`;
  const seas = list.filter((k) => k.season), rare = list.filter((k) => !k.season);
  const ssub = (k) => (k.season.kept ? "Yours to keep" : `Until ${esc(fmtDate(k.season.until - 1))} · ${k.season.n} of ${k.season.of} sent to keep it`);
  return `<div class="ghead">Rare Pigeons <span class="gcount">${rare.filter((k) => k.open).length} of ${rare.length}</span></div>
    <div class="badges skins">${tile(null, "Usual", true, "Every pigeon")}${seas.map((k) => tile(k.id, k.name, k.open, ssub(k))).join("")}${rare.map((k) => tile(k.id, k.name, k.open, k.open ? "Unlocked" : `Earn ${esc(SKINS[k.id]?.badge || "its badge")}`)).join("")}</div>
    <div class="gfoot">Your friends see the look on every pigeon you send. Its colour still says what kind it is.</div>`;
}
/* ---------- Coots: the bank, and its Coots Coins (called feathers in the code and the database) ---------- */
async function walletData() { try { const r = await api("feathers"); S.feathers = r.feathers; return r; } catch (err) { if (S.sheet?.type === "feathers") S.sheet.err = err.message; else toast(esc(err.message)); return null; } }
// what a sheet shows when what it needed didn't come (no signal, a hiccup): why, and a way to try again
const loadFail = (msg, act, id) => `<p class="empty"><b>Couldn’t load this</b>${esc(msg || "Try again in a moment.")}</p><div class="stack"><button type="button" class="btn small plain" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ""}>Try Again</button></div>`;
// A friend's loft: their pigeons, badges and kit (fetched each time: it changes as they fly)
async function openLoft(id) {
  S.sheet = { type: "loft", id, data: null }; renderSheet();
  let r; try { r = await api("loft?id=" + encodeURIComponent(id)); } catch (e) { r = { error: e.message || "Try again in a moment." }; }
  if (S.sheet?.type === "loft" && S.sheet.id === id) { S.sheet.data = r; renderSheet(); }
}
async function openFeathers() {
  S.sheet = { type: "feathers", data: null }; renderSheet();
  const r = await walletData(); if (S.sheet?.type !== "feathers") return;
  if (r) { S.sheet.data = r; S.sheet.err = null; renderSheet(); render(); } else renderSheet();
}
// which of your pigeons gets it
function wearItem(item, anchor) {
  if (!S.birds.length) return toast("Name a pigeon in Your Pigeons first.");
  openMenu(anchor, S.birds.map((b) => ({ label: b.name, sub: b.wear === item ? "Wearing it" : b.wear && WEAR[b.wear] ? `Has the ${WEAR[b.wear][0].toLowerCase()} on` : b.rank, act: "wearon", id: `${item}|${b.id}` })));
}
async function putOn(bird, item) {
  try {
    const r = await api("bird-wear", { method: "POST", body: { bird, item } });
    for (const b of S.birds) { if (item && b.wear === item) b.wear = null; if (b.id === bird) b.wear = item; }
    if (S.sheet?.type === "feathers") S.sheet.data = r;
    haptic("success"); renderSheet(); renderCompose();
    const b = S.birds.find((x) => x.id === bird);
    toast(item ? `${WEAR[item][1]} ${esc(b?.name || "Your pigeon")} has the ${esc(WEAR[item][0].toLowerCase())} on.` : `${esc(b?.name || "Your pigeon")} took it off.`);
  } catch (err) { toast(esc(err.message)); }
}
async function setSkin(id) {
  const skin = id === "usual" ? null : id;
  try {
    const r = await api("me", { method: "PATCH", body: { skin } });
    S.me = r.me || { ...S.me, skin };
    $(".kind", $compose).dataset.k = "";          // redrawn with the new look
    $layer.querySelectorAll(".skin2").forEach((b) => { const on = (b.dataset.id || "") === (skin || "usual"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    renderCompose();                              // the chosen tile lights up; no banner over the sheet
  } catch (err) { toast(esc(err.message)); }
}

/* ---------- replies and reactions ---------- */
const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const chatName = (id, g) => (id === S.me.id ? "You" : first((g ? member(g, id) : friend(id))?.name || "Someone"));
// A quote shows what was really said: the original, when it's on this phone
// (its sender and words, not what the reply claims), else the reply's copy.
function quoteHtml(q, g) {
  const o = (S.msgs.get(S.chat) || []).find((x) => x.id === q.id), op = o && S.plain.get(o.id);
  if (o && op && !op.bad) q = { id: q.id, from: o.from, t: String(op.t || "").replace(/\s+/g, " ").slice(0, 90), p: op.v ? "voice" : op.p ? (op.p.m === "image/gif" ? "gif" : "photo") : "" };
  else q = { id: String(q.id || ""), from: String(q.from || ""), t: String(q.t || "").slice(0, 90), p: ["gif", "voice", "photo"].includes(q.p) ? q.p : "" };
  return `<button type="button" class="quote" data-act="jumpto" data-id="${esc(q.id)}"><b>${esc(chatName(q.from, g))}</b><span>${q.p ? `${q.p === "gif" ? "GIF" : q.p === "voice" ? "Voice pigeon" : "Photo"}${q.t ? ": " : ""}` : ""}${esc(q.t || "")}</span></button>`;
}
// The reactions on a message: each once it has landed (yours straight away)
function reactsHtml(m, mine) {
  const list = (S.reacts.get(S.chat) || []).filter((r) => r.msg === m.id && (r.from === S.me.id || !r.flying) && S.plain.get(r.id)?.r);
  if (!list.length) return "";
  const by = new Map();
  for (const r of list) { const e = S.plain.get(r.id).r, x = by.get(e) || { n: 0, me: false, flying: false }; x.n++; if (r.from === S.me.id) { x.me = true; x.flying = r.flying; } by.set(e, x); }
  return `<div class="reacts${mine ? " me" : ""}">${[...by].map(([e, x]) => `<span class="rpill${x.me ? " mine" : ""}${x.flying ? " flying" : ""}" title="${x.flying ? "On its way" : ""}">${esc(e)}${x.n > 1 ? `<b>${x.n}</b>` : ""}</span>`).join("")}</div>`;
}
function openReactMenu(anchor, id) {
  const mineNow = (S.reacts.get(S.chat) || []).find((r) => r.msg === id && r.from === S.me.id);
  const cur = mineNow && S.plain.get(mineNow.id)?.r, m = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
  const flight = m && !m.flying && !m.lost && (m.route || m.moon || m.flock?.some((x) => x.route || x.moon));
  openMenu(anchor, [{ label: "Reply", icon: I.reply, act: "reply", id },
    ...(flight ? [{ label: m.moon ? "Show the Trip" : "Show the Flight", sub: [m.km != null && !m.flock ? fmtMiles(m.km) : "", KIND[kindOf(m)].name, m.bird ? m.bird.name : ""].filter(Boolean).join(" · "), icon: m.moon ? I.moon : I.map, act: "map", id }] : [])]);
  if (m) {
    const g = group(S.chat), mine = m.from === S.me.id, bits = [`Sent ${fmtShort(m.sentAt)}`];
    if (!m.flying && !m.lost) bits.push(`${g && mine ? "First landed" : "Landed"} ${fmtShort(g && mine ? Math.min(...(m.flock || [{ deliverAt: m.deliverAt }]).map((x) => x.deliverAt || Infinity)) : m.deliverAt)}`);
    if (mine && !g && m.readAt) bits.push(`Read ${fmtShort(m.readAt)}`);
    $(".menu-pop", $pop).insertAdjacentHTML("afterbegin", `<div class="mtime" role="none">${bits.join(" · ")}</div>`);
  }
  $(".menu-pop", $pop).insertAdjacentHTML("afterbegin", `<div class="rrow" role="none">${REACTIONS.map((e) => `<button type="button" class="${e === cur ? "on" : ""}" data-act="react" data-id="${esc(id)}" data-e="${esc(e)}" role="menuitem" aria-label="React ${esc(e)}">${e}</button>`).join("")}</div>`);
}
async function sendReact(id, e) {
  haptic("tick");
  const g = group(S.chat), chat = S.chat, list = S.reacts.get(chat) || [];
  const mineNow = list.find((r) => r.msg === id && r.from === S.me.id);
  try {
    if (mineNow && S.plain.get(mineNow.id)?.r === e) {          // the same one again takes it back
      await api("react", { method: "DELETE", body: { msg: id } });
      S.reacts.set(chat, list.filter((r) => r !== mineNow)); return render();
    }
    const m = (S.msgs.get(chat) || []).find((x) => x.id === id); if (!m) return;
    const rid = uuid(), payload = { r: e };
    let body;
    if (g) {
      const { body: sealed, key, h } = await E2E.sealGroup({ id: rid, from: S.me.id, group: g.id, type: "react" }, payload);
      const keys = {};
      for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id: rid, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
      body = { id: rid, msg: id, group: true, body: sealed, keys };
    } else {
      const to = m.from === S.me.id ? m.to : m.from;
      body = { id: rid, msg: id, ct: await E2E.seal(await base(chat), { id: rid, from: S.me.id, to, type: "react" }, payload) };
    }
    const r = await api("react", { method: "POST", body });
    S.plain.set(rid, payload);
    S.reacts.set(chat, [...list.filter((x) => x !== mineNow), r.react]);
    render();
  } catch (err) { toast(esc(err.message)); }
}
// Who joined, left or renamed the group: a quiet line in the chat. Adds by one
// person at one moment read as one line ("George added Mira and Theo").
/* ---------- mid-air moments ----------
   Near misses: two pigeons you can see that passed each other (or one
   overtook the other) in mid-air. Said from this chat's side; tap for the map. */
function momentText(m, n, chatId) {
  const me = S.me.id, nm = (id) => first(personById(id)?.name || "a friend"), o = n.other;
  const mineThis = m.from === me, mineOther = o.from === me, kind = (k) => (KIND[k]?.name || "Standard").toLowerCase();
  const over = n.place && n.place !== "land" ? ` over ${n.place}` : "";
  if (n.kind === "flock") {                                            // flying together
    const same = (mineOther ? o.to : o.from) === chatId, here = mineThis ? "your pigeon" : `${nm(chatId)}’s pigeon`;
    const there = same ? (mineOther ? "yours" : `${nm(chatId)}’s`) : mineOther ? `the one you sent ${nm(o.to)}` : `${nm(o.from)}’s`;
    const both = same && mineThis === mineOther ? `${mineThis ? "Your" : `${nm(chatId)}’s`} pigeons` : `${here[0].toUpperCase() + here.slice(1)} and ${there}`;
    return `${both} flew together${over}`;
  }
  if ((mineOther ? o.to : o.from) === chatId) {                        // both in this chat
    if (n.kind !== "overtake") return mineThis === mineOther ? `Your pigeons passed each other${over}` : `Your pigeon and ${nm(chatId)}’s passed each other${over}`;
    const [lead, back] = n.lead === "other" ? [[mineOther, o.pigeon], [mineThis, m.pigeon]] : [[mineThis, m.pigeon], [mineOther, o.pigeon]];
    if (lead[0] && back[0]) return `Your ${kind(lead[1])} pigeon overtook your ${kind(back[1])} one${over}`;
    if (!lead[0] && !back[0]) return `${nm(chatId)}’s ${kind(lead[1])} pigeon overtook their ${kind(back[1])} one${over}`;
    return `${lead[0] ? "Your" : nm(chatId) + "’s"} pigeon overtook ${back[0] ? "yours" : nm(chatId) + "’s"}${over}`;
  }
  const here = mineThis ? "your pigeon" : `${nm(chatId)}’s pigeon`, there = mineOther ? `your pigeon to ${nm(o.to)}` : `${nm(o.from)}’s pigeon`;
  const [a, b] = n.lead === "other" ? [there, here] : [here, there];
  return `${a[0].toUpperCase() + a.slice(1)} ${n.kind === "overtake" ? "overtook" : "passed"} ${b}${over}`;
}
// "New in your passport: Kazakhstan, Mongolia and 2 more" on the flight that collected them (tap for the passport)
function stampLines(msgs) {
  const and = (a) => (a.length > 3 ? `${a.slice(0, 2).join(", ")} and ${a.length - 2} more` : a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  return (msgs || []).filter((m) => m.from === S.me.id && m.stamps?.length && !m.flying).map((m) => ({ at: m.deliverAt + 1,
    html: `<button type="button" class="sysline stamps" data-act="passport" data-id="${esc(m.id)}">${I.globe}<span>New in your passport: ${esc(and(m.stamps))}</span></button>` }));
}
// this chat's moments, each once (both pigeons may be here), in time order.
// Pigeons sent together meet the same one at the same minute: that reads as
// one line with a count.
const momLine = (x) => `<button type="button" class="sysline moment" data-act="map" data-id="${esc(x.id)}">${x.kind === "flock" ? I.people : I.pass}<span>${esc(x.text)}<span class="t"> · ${fmtTime(x.at)}</span>${x.n > 1 ? `<span class="momx">×${x.n}</span>` : ""}</span></button>`;
function chatMoments(msgs, chatId) {
  const seen = new Set(), same = new Map(), out = [];
  for (const m of msgs || []) for (const n of m.near || []) {
    const key = [m.id, n.other.id].sort().join("|"); if (seen.has(key)) continue; seen.add(key);
    const text = momentText(m, n, chatId), dup = text, was = same.get(dup);
    if (was && Math.abs(was.at - n.at) < 10 * 60e3) { was.mom.n++; continue; }
    const x = { mom: { key, id: m.id, text, at: n.at, kind: n.kind, place: n.place && n.place !== "land" ? n.place : "", n: 1 }, at: n.at };
    same.set(dup, x); out.push(x);
  }
  for (const x of out) x.html = momLine(x.mom);
  out.push(...stampLines(msgs));
  for (const m of msgs || []) if (m.from === S.me.id && m.bird?.up && !m.flying && !m.lost)
    out.push({ at: m.deliverAt, html: `<button type="button" class="sysline rankup" data-act="bird" data-id="${esc(m.bird.id)}">${I.bird}<span>${esc(m.bird.name)} became ${aRank(esc(m.bird.up))} on this flight</span></button>` });
  return out.sort((a, b) => a.at - b.at);
}
// Three or more mid-air moments in a row fold into one line ("5 near misses
// over India and Malaysia"); tap to see each. Stays open across re-renders.
const momOpen = new Set();
function momRun(items) {
  const out = []; let run = [];
  const flush = () => {
    const n = run.reduce((a, x) => a + x.mom.n, 0);
    if (run.length < 2 || n < 3) { out.push(...run.map((x) => x.html)); run = []; return; }
    const ms = run.map((x) => x.mom), key = ms[0].key, open = momOpen.has(key);
    const places = [...new Set(ms.map((x) => x.place).filter(Boolean))];
    const where = places.length > 3 ? ` over ${places.slice(0, 2).join(", ")} and ${places.length - 2} more` : places.length ? ` over ${places.length > 1 ? `${places.slice(0, -1).join(", ")} and ${places.at(-1)}` : places[0]}` : "";
    const what = ms.every((x) => x.kind === "flock") ? "flights together" : ms.some((x) => x.kind === "flock") ? "mid-air moments" : "near misses";
    const t0 = fmtTime(ms[0].at), t1 = fmtTime(ms.at(-1).at), when = t0 === t1 ? t0 : `${t0}–${t1}`;
    out.push(`<div class="momrun${open ? " open" : ""}"><button type="button" class="sysline moment momsum" data-act="momrun" data-id="${esc(key)}" aria-expanded="${open}">${ms.every((x) => x.kind === "flock") ? I.people : I.pass}<span>${n} ${what}${esc(where)}<span class="t"> · ${when}</span></span>${chevSm}</button><div class="momlist"${open ? "" : " hidden"}>${run.map((x) => x.html).join("")}</div></div>`);
    run = [];
  };
  for (const x of items) { if (x.mom) { run.push(x); continue; } flush(); out.push(x.html); }
  flush();
  return out.join("");
}
// Flyovers in a chat with a friend: their pigeon over you (wave while it's
// fresh), yours over them (and whether they waved).
const WAVE_FOR = 12 * HOUR;
let wavedNow = null;                          // the one just waved at, for its little wave
function flyLines(f) {
  return (S.fly.get(f.id) || []).map((x) => {
    const name = esc(first(f.name)), can = !x.mine && !x.waved && now() - x.at < WAVE_FOR;
    const text = x.mine ? (x.waved ? `${name} waved at your pigeon${x.place ? ` over ${esc(x.place)}` : ""}` : `Your pigeon flew over ${name}${x.place ? ` in ${esc(x.place)}` : ""}`)
      : `${name}’s pigeon flew over you${x.waved ? " · you waved" : ""}`;
    return { at: x.at, html: `<div class="sysline fly${wavedNow === x.id ? " just" : ""}">${I.wave}<span>${text}<span class="t"> · ${fmtTime(x.mine && x.waved ? x.waved : x.at)}</span></span>${can ? `<button type="button" class="wavebtn" data-act="wave" data-id="${esc(x.id)}">Wave</button>` : ""}</div>` };
  });
}
// Your pigeon in the air, in a line: who carries it, when it lands, and what's happened on the way
function flySub(m) {
  const k = kindOf(m), c = m.flock ? flockCount(m) : null, bits = [m.bird ? m.bird.name : "", m.mystery ? `Mystery: ${KIND[k].name.toLowerCase()}` : KIND[k].name];
  bits.push(c ? `${c.landed} of ${c.n} landed` : `lands ${atTime(m.deliverAt)}`);
  if (m.via) bits.push(`via ${first(friend(m.via)?.name || "a friend")}`);
  if ((m.legs || []).filter((l) => !l[3]).length > (m.via ? 2 : 0)) bits.push("changed course");
  if (m.cheers) bits.push(`cheered on ×${m.cheers}`);
  const w = wxSay(m, true) || (windWord(m.wind) && windWord(m.wind) !== "calm" ? windWord(m.wind) : "");
  if (w) bits.push(w);
  return bits.filter(Boolean).join(" · ");
}
// On your pigeon's map: who it flew over, and who waved
function flyText(m) {
  const l = m.fly || []; if (!l.length) return "";
  const nm = (x) => first(friend(x.who)?.name || "a friend"), and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  const w = l.filter((x) => x.waved);
  return w.length === 1 ? `${nm(w[0])} waved from ${w[0].place || "below"}` : w.length ? `${and(w.map(nm))} waved from below` : l.length === 1 ? `Flew over ${nm(l[0])}${l[0].place ? ` in ${l[0].place}` : ""}` : `Flew over ${and(l.map(nm))}`;
}
/* ---------- named pigeons ----------
   Up to five of yours, with names and careers (functions/_birds.js). They take
   turns carrying what you send: the one you pick, else the one that has
   rested longest. Miles bring rank and stamina (less rest between flights). */
const BIRDS_MAX = 5;
// feathers buy accessories for your named pigeons: [id, name, emoji]
const WEAR = { satchel: ["Satchel", "👜"], daisy: ["Daisy", "🌼"], ribbon: ["Ribbon", "🎀"], scarf: ["Scarf", "🧣"], goggles: ["Goggles", "🥽"], shades: ["Sunglasses", "🕶️"], tophat: ["Top Hat", "🎩"], crown: ["Crown", "👑"] };
const wearOn = (w) => (w && WEAR[w] ? `<i class="wear" aria-hidden="true">${WEAR[w][1]}</i>` : "");
const wearWord = (w) => (w && WEAR[w] ? ` in ${/^[aeiou]/i.test(WEAR[w][0]) ? "an" : w === "shades" ? "" : "a"} ${WEAR[w][0].toLowerCase()}`.replace("  ", " ") : "");
const RANKS = [["Fledgling", 0], ["Courier", 500], ["Navigator", 2000], ["Veteran", 8000], ["Ace", 20000], ["Legend", 40075]];
const RANK_TILE = { Fledgling: "gray", Courier: "green", Navigator: "blue", Veteran: "indigo", Ace: "orange", Legend: "rocket" };
const aRank = (r) => `${/^[AEIOU]/.test(r) ? "an" : "a"} ${r}`;
const birdReady = (b) => b.state === "ready" || (b.state === "resting" && now() >= (b.busyUntil || 0));
function birdFor() {
  if (S.birdPick === "none" || !S.birds.length) return null;
  const ready = S.birds.filter(birdReady);
  return ready.find((b) => b.id === S.birdPick) || [...ready].sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0))[0] || null;
}
function birdState(b) {
  if (b.state === "flying") return `In the air · lands ${fmtLand(b.landAt)}`;
  if (b.state === "waiting") return "Booked to fly";
  return birdReady(b) ? "Ready" : `Resting · ready in ${fmtDur(b.busyUntil - now())}`;
}
// On a pigeon's map: who's carrying it (and, for yours, how far it has flown in all)
function birdLine(m) {
  const b = m.bird; if (!b) return "";
  const c = m.from === S.me.id && b.id ? [...S.birds, ...S.hall].find((x) => x.id === b.id) : null;
  return `<span class="birdline">${I.bird}Carried by ${esc(b.name)}${esc(wearWord(b.wear))} · ${esc(b.up || b.rank)}${c ? ` · ${fmtMiles(c.km)} in all` : ""}</span>`;
}
// at the top of a chat whose messages disappear
const vanishLine = (v) => (v?.ms ? `<div class="sysline vanishline" role="note">${I.clock}Messages disappear ${vanishSay(v.ms)} after they’re read${v.by ? ` · set by ${v.by === S.me.id ? "you" : esc(first(personById(v.by)?.name || "a friend"))}` : ""}</div>` : "");
function geventLines(list) {
  const nm = (p) => (p.id === S.me.id ? "you" : first(personById(p.id)?.name || p.name || "Someone"));
  const cap = (x) => x[0].toUpperCase() + x.slice(1), and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  let out = "";
  for (let i = 0; i < list.length; i++) {
    const e = list[i], by = cap(nm(e.by));
    let text;
    if (e.kind === "add" || e.kind === "create") {
      const made = e.kind === "create", whos = [];
      let j = made ? i + 1 : i;
      while (j < list.length && list[j].kind === "add" && list[j].by.id === e.by.id && Math.abs(list[j].at - e.at) < 60e3) whos.push(nm(list[j++].who || {}));
      i = Math.max(i, j - 1);
      text = made ? `${by} made the group${whos.length ? ` with ${and(whos)}` : ""}` : `${by} added ${and(whos)}`;
    } else if (e.kind === "leave") text = `${by} left`;
    else if (e.kind === "rename") text = `${by} named the group “${e.name}”`;
    else if (e.kind === "vanish") text = Number(e.name) ? `${by} set messages to disappear ${vanishSay(Number(e.name))} after they’re read` : `${by} turned off disappearing messages`;
    else continue;
    out += `<div class="sysline" role="note">${esc(text)}<span class="t"> · ${fmtTime(e.at)}</span></div>`;
  }
  return out;
}
function vGroupChat(g) {
  const msgs = S.msgs.get(g.id);
  const evs = S.gevents.get(g.id) || [];
  // someone in it now whom no one was seen adding (the server alone says they're here): say so
  const added = new Set(evs.flatMap((e) => [e.who?.id, e.kind === "create" ? e.by?.id : null]).filter(Boolean));
  const told = msgs && S.geventsLive?.has(g.id);       // (only once its history has come from the server, not just this phone's copy)
  const ghosts = told ? (g.unseen || []).filter((id) => !added.has(id)) : [];
  if (told && g.unseen?.length) { S.pins["g:" + g.id] = [...new Set([...(S.pins["g:" + g.id] || []), ...g.members.map((p) => p.id)])]; g.unseen = []; savePins(); }
  if (ghosts.length) g.ghosts = [...new Set([...(g.ghosts || []), ...ghosts])];
  let body = "", lastAt = 0, prevFrom = null, ev = 0;
  const stl = stampLines(msgs).sort((a, b) => a.at - b.at); let si = 0;
  const stampsTo = (at) => { let h = ""; while (si < stl.length && stl[si].at <= at) h += stl[si++].html; return h; };
  // the group's changes up to a moment, as lines
  const evsTo = (at) => { const k = ev; while (ev < evs.length && evs[ev].at <= at) ev++; return ev > k ? geventLines(evs.slice(k, ev)) : ""; };
  if (!msgs) body = `<p class="empty">Opening your messages…</p>`;
  else if (!msgs.length && S.outbox.some((o) => o.to === g.id)) body = "";
  else if (!msgs.length) body = `${evsTo(Infinity)}<p class="empty"><b>Say hello</b>Each message flies to everyone in ${esc(g.name)} at once: one pigeon each, over the real distance to each of them.</p>`;
  const landed = (msgs || []).filter((m) => m.from === S.me.id && !m.flying && !m.lost && !m.waiting && !m.recalled);
  quietMeta = new Set(landed.slice(0, -1).map((m) => m.id));
  if (msgs?.length) for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i], mine = m.from === S.me.id, at = mine || m.flying || m.lost ? m.sentAt : m.deliverAt;
    if (!sameDay(at, lastAt) || at - lastAt > TIME_GAP) { body += stampHtml(at); prevFrom = null; }
    lastAt = at;
    const lines = evsTo(at) + stampsTo(at); if (lines) { body += lines; prevFrom = null; }
    // pigeons still flying to you, one after another: one card between them
    let j = i; while (j < msgs.length && inbound(msgs[j])) j++;
    if (j - i >= 2) { body += flyRun(msgs.slice(i, j), g); i = j - 1; prevFrom = null; continue; }
    const who = member(g, m.from) || { id: m.from, name: "Former member" };
    if (!mine && prevFrom !== m.from && !m.lost) body += `<div class="who">${avatar(who, "xs")}<span>${esc(first(who.name))}</span></div>`;
    body += bubble(who, m, prevFrom !== null && prevFrom !== m.from && (mine || m.lost), g);
    prevFrom = m.from;
  }
  if (msgs?.length) body += evsTo(Infinity) + stampsTo(Infinity);
  const flying = msgs && [...msgs].reverse().find((m) => m.flying && (m.route || m.flock?.some((x) => x.route)));
  const changed = others(g).filter((p) => p.keyChanged);
  const gh = (g.ghosts || []).map((id) => member(g, id)).filter(Boolean);
  const ghostWarn = gh.length ? `<div class="warn"><span>${gh.map((p) => esc(first(p.name))).join(" and ")} ${gh.length > 1 ? "are" : "is"} now in this group, but no one was seen adding them. If that’s unexpected, don’t send anything private and check with the group.</span></div>` : "";
  const warn = ghostWarn + (changed.length ? `<div class="warn"><span>${changed.map((p) => esc(first(p.name))).join(" and ")}’s security key changed. This happens when someone makes a new account or resets their password. Check before you send anything private.</span><button class="btn small" data-act="safety" data-id="${esc(changed[0].id)}">Check</button></div>` : "");
  return `<div class="navbar solid chatnav">
      <div class="nb-left">${backBtn("tab", S.backTo || "messages")}</div>
      <button class="chatwho" data-act="groupinfo" data-id="${esc(g.id)}" aria-label="${esc(g.name)}: details">${gavatar(g, "s")}<span class="wt"><span class="nm"><span>${esc(g.name)}</span>${I.chev}</span>${gchatSub(g)}</span></button>
      <div class="nb-right">${flying ? nbtn("map", I.map, "Watch the pigeons", `data-id="${esc(flying.id)}"`) : ""}${nbtn("groupmenu", I.more, "More")}</div>
    </div>
    <h1 class="sr">${esc(g.name)}</h1>${warn}<div class="msgs">${vanishLine(g.vanish)}${body}${outboxBubbles(g.id)}</div>`;
}
function vChat() {
  if (group(S.chat)) return vGroupChat(group(S.chat));
  const f = friend(S.chat);
  if (!f) return `${navbar("", { left: backBtn("tab", S.backTo || "messages"), solid: true })}<p class="empty"><b>Not in your friends</b>This person isn’t in your friends any more.</p>`;
  const msgs = S.msgs.get(f.id);
  let body = "", lastAt = 0, prevFrom = null;
  const lastLanded = [...(msgs || [])].reverse().find((m) => m.from === S.me.id && !m.flying && !m.lost && !m.waiting && !m.recalled)?.id;
  const moms = [...chatMoments(msgs, f.id), ...flyLines(f)].sort((a, b) => a.at - b.at); let mo = 0;
  const momsTo = (at) => { const h = []; while (mo < moms.length && moms[mo].at <= at) h.push(moms[mo++]); return momRun(h); };
  if (!msgs) body = `<p class="empty">Opening your messages…</p>`;
  else if (!msgs.length && S.outbox.some((o) => o.to === f.id)) body = "";
  else if (!msgs.length) body = `${momsTo(Infinity)}<p class="empty"><b>Say hello</b>Messages to ${esc(first(f.name))} are end-to-end encrypted and fly the real distance between you.</p>`;
  else for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i], at = m.from === S.me.id || m.flying || m.lost ? m.sentAt : m.deliverAt;
    if (!sameDay(at, lastAt) || at - lastAt > TIME_GAP) { body += stampHtml(at); prevFrom = null; }
    lastAt = at;
    const ml = momsTo(at); if (ml) { body += ml; prevFrom = null; }
    let j = i; while (j < msgs.length && inbound(msgs[j])) j++;
    if (j - i >= 2) { body += flyRun(msgs.slice(i, j), null); i = j - 1; prevFrom = null; continue; }
    body += bubble(f, m, prevFrom !== null && prevFrom !== m.from);
    if (m.id === lastLanded) body += statusLine(m);
    prevFrom = m.from;
  }
  if (msgs?.length) body += momsTo(Infinity);
  // a pigeon in the air either way: the map button sits beside the menu
  const flying = msgs && [...msgs].reverse().find((m) => m.flying && !m.waiting && m.route);
  const warn = f.keyChanged ? `<div class="warn${wasVerified(f) ? " strong" : ""}"><span>${wasVerified(f) ? `You verified ${esc(first(f.name))} in person, and their security key has changed since. Verify again, together, before you send anything.` : `${esc(first(f.name))}’s security key changed. This happens when they make a new account or reset their password. Compare safety numbers before you send anything private.`}</span><button class="btn small" data-act="safety" data-id="${esc(f.id)}">Check</button></div>` : "";
  return `<div class="navbar solid chatnav">
      <div class="nb-left">${backBtn("tab", S.backTo || "messages")}</div>
      <button class="chatwho" data-act="friendinfo" data-id="${esc(f.id)}" aria-label="${esc(f.name)}: details">${avatar(f, "s", true)}<span class="wt"><span class="nm"><span>${esc(first(f.name))}</span>${I.chev}</span>${chatSub(f)}</span></button>
      <div class="nb-right">${flying ? nbtn("map", I.map, "Watch the pigeon", `data-id="${esc(flying.id)}"`) : ""}${nbtn("chatmenu", I.more, "More")}</div>
    </div>
    <h1 class="sr">Chat with ${esc(first(f.name))}</h1>${warn}<div class="msgs">${vanishLine(f.vanish)}${body}${outboxBubbles(f.id)}</div>`;
}

/* ---------- sign-up and sign-in ---------- */
function field(name, placeholder, type, ac, prefix) {
  return `<label class="fcell">${prefix ? `<span class="pre">${prefix}</span>` : ""}<input id="f-${name}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" autocomplete="${ac}" aria-label="${esc(placeholder)}"${type === "email" || name === "handle" ? ' autocapitalize="off" spellcheck="false"' : ""}${name === "handle" ? ' maxlength="20"' : ""}>${type === "password" ? `<button type="button" class="peek" data-act="peek" aria-label="Show password">${I.eye}</button>` : ""}</label>`;
}
const ferr = `<p class="gfoot bad ferr" role="alert" hidden></p>`;
// Sign-up's three steps: account, location, passkey (the last only where passkeys work)
const stepDots = (n) => { const of = passkeysSupported() ? 3 : 2; return `<p class="stepn" role="img" aria-label="Step ${n} of ${of}">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</p>`; };
function vAuth() {
  const back = (to) => navbar("", { left: backBtn("to", to) });
  switch (S.view) {
    case "loading": return `<div class="loading">Opening InFlight…</div>`;
    case "welcome": return `<div class="auth welcome night${S.welcomed ? " again" : ""}">
        <div class="wtop">
          <h1 class="wlogo" aria-label="InFlight"><span class="wring" aria-hidden="true"></span><span class="appicon" aria-hidden="true">${I.bird}</span></h1>
        </div>
        ${inviteHtml()}</div>`;
    case "signup": return `<div class="auth night">${back("welcome")}
        ${stepDots(1)}
        <h1 class="large">Create Account</h1>
        <form data-form="signup" novalidate>
          <div class="group">${field("name", "Name", "text", "name")}${field("handle", "handle", "text", "username", "@")}</div>
          <div class="gfoot hstat" aria-live="polite">Friends see your name and find you by your handle.</div>
          <div class="group mt">${field("email", "Email", "email", "email")}${field("password", "Password", "password", "new-password")}</div>
          <div class="gfoot pwstat" aria-live="polite">At least 10 characters. It also locks your encryption key.</div>
          ${ferr}
          <div class="pad"><button class="btn wide">Create Account</button></div>
        </form></div>`;
    case "making": {
      const step = (n, label) => `<li class="${S.making >= n ? "is-ok" : S.making === n - 1 ? "is-now" : ""}">${S.making >= n ? I.ok : S.making === n - 1 ? `<span class="spin"></span>` : I.dot}<span>${label}</span></li>`;
      return `<div class="auth night"><div class="hero"><div class="appicon">${I.bird}</div><h1>Setting Up Your Account</h1><p>Your key is made and locked on this phone.</p></div>
        <ul class="steps">${step(1, "Making your key pair")}${step(2, "Locking it with your password")}${step(3, "Creating your account")}</ul></div>`;
    }
    case "signin": return `<div class="auth night">${back("welcome")}
        <h1 class="large">Sign In</h1>
        <form data-form="signin" novalidate>
          <div class="group">${field("email", "Email", "email", "username webauthn")}${field("password", "Password", "password", "current-password")}</div>
          ${ferr}
          <div class="pad"><button class="btn wide">Sign In</button></div>
        </form>
        <div class="group">${passkeysSupported() ? cell({ act: "pkget", icon: I.key, tile: "indigo", label: "Sign In with a Passkey", cls: "action" }) : ""}${cell({ act: "to", id: "forgot", label: "Forgot Password?", cls: "action" })}</div>
        ${S.inviteState?.open || S.inviteState?.ok ? `<div class="stack"><button class="btn wide plain" data-act="to" data-id="signup">Create Account</button></div>` : ""}
      </div>`;
    case "unlock": return `<div class="auth night">${navbar("", { left: backBtn("cancelunlock") })}
        <h1 class="large">Unlock Messages</h1>
        <p class="sub">Your passkey signed you in. Enter your password once so this phone can unlock your encryption key.</p>
        <form data-form="unlock" novalidate>
          <div class="group mt-s">${field("password", "Password", "password", "current-password")}</div>${ferr}
          <div class="pad"><button class="btn wide">Unlock</button></div>
        </form>
        <div class="group">${cell({ act: "to", id: "forgot", label: "Forgot Password?", cls: "action" })}</div></div>`;
    case "forgot": return `<div class="auth night">${back("signin")}
        <h1 class="large">Reset Password</h1>
        <p class="sub">We’ll email you a link to choose a new password. It works once, for one hour.</p>
        <form data-form="forgot" novalidate>
          <div class="group mt-s">${field("email", "Email", "email", "email")}</div>${ferr}
          <div class="gfoot">With a passkey, a reset keeps your messages. Without one, you start with a new key and older messages can’t be opened.</div>
          <div class="pad"><button class="btn wide">Email Reset Link</button></div>
        </form></div>`;
    case "reset": return vReset();
    case "locpick": return `<div class="auth">${navbar("")}
        ${stepDots(2)}
        <h1 class="large">Where Are You?</h1>
        <p class="sub">Pigeons fly from here, so it sets how long your messages take. It’s rounded to about a mile, and only your friends see it.</p>
        ${S.me?.place ? `<div class="group mt">${cell({ icon: I.check, tile: "green", label: esc(S.me.place), sub: "Your location" })}</div>` : ""}
        <div class="stack locfirst"><button class="btn wide" data-act="locate">${I.loc}${S.me?.place ? "Use My Location Again" : "Use My Location"}</button></div>
        <div class="group">
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City Instead</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
          ${toggleCell({ act: "onbauto", icon: I.loc, tile: "green", label: "Keep It Up to Date", sub: "While InFlight is open, so pigeons find you", on: S.onbAuto !== false })}
        </div>${ferr}
        ${S.me?.place ? `<div class="stack"><button class="btn wide plain" data-act="locdone">Continue</button></div>` : ""}</div>`;
    case "pkoffer": return `<div class="auth">${stepDots(3)}<div class="hero tall"><span class="big-ico">${I.face}</span>
        <h1>Sign In with Face ID</h1><p>Save a passkey to sign in with Face ID or your fingerprint. On most newer phones it can also unlock your messages if you forget your password.</p></div>${ferr}
        <div class="stack"><button class="btn wide" data-act="pkadd" data-next="done">Save a Passkey</button><button class="btn wide plain" data-act="onbdone">Not Now</button></div></div>`;
  }
  return "";
}
function vReset() {
  const info = S.resetInfo, from = S.resetFrom?.me;
  if (!info) return `<div class="loading">Checking your reset link…</div>`;
  if (info.error) return `<div class="auth"><div class="hero tall"><span class="big-ico">${I.warn}</span><h1>This Link Won’t Work</h1><p>${esc(info.error)}</p></div>
      <div class="stack">${from ? `<button class="btn wide" data-act="resetcancel">Back to InFlight</button>` : `<button class="btn wide" data-act="to" data-id="forgot">Get a New Link</button><button class="btn wide plain" data-act="to" data-id="welcome">Back</button>`}</div></div>`;
  const canKeep = info.passkeys.length && passkeysSupported();
  const other = from && from.handle !== info.handle;
  return `<div class="auth">${navbar("", from ? { left: nbtn("resetcancel", I.x, "Cancel and stay signed in") } : {})}
      <h1 class="large">New Password</h1>
      <p class="sub">For ${esc(first(info.name))} (@${esc(info.handle)}, ${esc(info.email)}).</p>
      ${from ? `<div class="warn sheetwarn"><span>${other ? `You’re signed in here as @${esc(from.handle)}. This link is for a different account: only carry on if it’s yours. Setting its password signs @${esc(from.handle)} out of this phone.`
        : "Setting a new password signs you out of your other phones."}</span></div>` : ""}
      <form data-form="reset" novalidate>
        <div class="group mt-s">${field("password", "New password", "password", "new-password")}</div>${ferr}
        <div class="gfoot">${canKeep ? "Use your passkey to keep all your messages readable. Starting fresh" : "Without a passkey, this"} makes a new key: your friends stay, but older messages can’t be opened, and friends see that your key changed.</div>
        <div class="stack">${canKeep ? `<button type="button" class="btn wide" data-act="resetkeep">${I.key}Keep Messages with Passkey</button><button type="button" class="btn wide plain" data-act="resetfresh">Start Fresh Instead</button>`
          : `<button type="button" class="btn wide" data-act="resetfresh">Set New Password</button>`}${from ? `<button type="button" class="btn wide plain" data-act="resetcancel">Cancel</button>` : ""}</div>
      </form></div>`;
}
async function loadReset() {
  S.resetInfo = null; render();
  try { S.resetInfo = await api("reset-check", { method: "POST", body: { token: S.resetToken } }); }
  catch (e) { S.resetInfo = { error: e.message }; }
  if (S.view === "reset") render();
}
// Has this password turned up in a data breach? Asks Pwned Passwords, through InFlight's
// server, with only the first 5 characters of its SHA-1, and checks the answers here:
// neither ever sees the password (k-anonymity). Can't ask: carries on without the check.
async function leakedCount(pw) {
  try {
    const h = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await fetch(`/api/pigeon/pwned?p=${h.slice(0, 5)}`, { cache: "no-store" });
    if (!r.ok) return 0;
    for (const line of (await r.text()).split("\n")) { const [suf, n] = line.trim().split(":"); if (suf === h.slice(5)) return Number(n) || 0; }
  } catch (_) { /* no answer: no check */ }
  return 0;
}
const leakedSay = (n) => `This password has turned up in ${n === 1 ? "a data breach" : `${n.toLocaleString("en-GB")} data breaches`}, so it’s one of the first anyone would try. Choose another.`;
async function resetWith(mode, btn) {
  const pw = $("#f-password")?.value || "";
  if (pw.length < 10) return showErr("Use at least 10 characters.", "password");
  { const n = await leakedCount(pw); if (n) return showErr(leakedSay(n), "password"); }
  await busyBtn(btn, mode === "keep" ? "Waiting for your passkey…" : "Making your new key…", async () => {
    let ecdh, pub;
    if (mode === "keep") {
      const a = await navigator.credentials.get({ publicKey: {
        challenge: rand(32), rpId: RP_ID, userVerification: "required", timeout: 120000,
        allowCredentials: S.resetInfo.passkeys.map((p) => ({ type: "public-key", id: fromB64url(p.id) })),
        extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } });
      const secret = a && prfResult(a), pk = a && S.resetInfo.passkeys.find((p) => p.id === a.id);
      if (!secret || !pk) throw new Error("That passkey couldn’t unlock your key on this phone. You can start fresh instead.");
      try { ({ ecdh } = await E2E.unlock(await E2E.fromSecret(secret), pk.vault)); }
      catch (_) { throw new Error("That passkey couldn’t unlock your key. You can start fresh instead."); }
    } else {
      ({ privJwk: ecdh, pub } = await E2E.newIdentity());
    }
    const salt = E2E.newSalt();
    const { lockKey, proof } = await E2E.fromPassword(pw, salt);
    const vault = await E2E.lock(lockKey, { ecdh });
    const keyProof = pub ? undefined : await E2E.keyProof(await E2E.importPriv(ecdh), S.resetInfo.kx, "reset|" + hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(S.resetToken))));
    const r = await api("reset-complete", { method: "POST", body: { token: S.resetToken, salt, proof, vault, ...(pub ? { pub } : { keyProof }) } });
    S.resetToken = null; S.resetInfo = null;
    const from = S.resetFrom; S.resetFrom = null;
    if (from) {
      // the sign-in that was here: ended (the reset already ended it if it's the same account)
      if (from.me.id !== r.me.id) {
        await fetch("/api/pigeon/logout", { method: "POST", headers: { Authorization: "Bearer " + from.token } }).catch(() => {});
        await idb.del("cache:" + from.me.id).catch(() => {}); await idb.del("outbox:" + from.me.id).catch(() => {});
      }
    }
    await useKeys(r.token, r.me, ecdh);
  });
  await afterSignIn();
  toast(mode === "keep" ? "Password changed. Your messages are safe." : "Password changed. You’re starting fresh with a new key.");
}

/* ---------- composer and tab bar ---------- */
const chatKm = (f) => (S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : 500);
// A landing time chosen for this chat (one to one, not a /dumb pigeon), once it's still ahead
function schedFor(chat, dumb = dumbText()) {
  const sc = S.sched;
  if (!sc || sc.chat !== chat || group(chat) || dumb != null) return null;
  if (sc.at <= now()) { S.sched = null; return null; }
  return sc;
}
// A friend to stop over with on the way (one to one, still a friend, with a location)
function viaFor(chat, dumb = dumbText()) {
  const v = S.via;
  if (!v || v.chat !== chat || group(chat) || dumb != null) return null;
  if (friend(v.id)?.lat == null) { S.via = null; return null; }
  return v;
}
// Friends you and this friend both have (who a pigeon could stop over with), for How It Flies
const mutualsBusy = new Set();
async function loadMutuals(id) {
  if (mutualsBusy.has(id)) return; mutualsBusy.add(id);
  try { const r = await api("mutuals?with=" + encodeURIComponent(id)); S.mutuals = { chat: id, at: now(), ids: r.ids || [] }; if (S.sheet?.type === "flysheet" && S.chat === id) renderSheet(); }
  catch (_) { S.mutuals = { chat: id, at: now(), ids: [] }; }
  finally { mutualsBusy.delete(id); }
}
// Paid pigeons you have, fastest last: what a scheduled pigeon can be
const schedKind = () => (["swift", "turbo", "rocket"].includes(S.pick) && (S.me[S.pick] || 0) > 0 ? S.pick : ["swift", "turbo", "rocket"].find((k) => (S.me[k] || 0) > 0) || null);
// Times worth a tap: this evening, tomorrow morning and evening, Saturday morning
function schedPresets() {
  const at = (days, h) => { const d = new Date(now()); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return +d; };
  const out = [];
  if (at(0, 18) - now() > HOUR) out.push(["This Evening", at(0, 18)]);
  out.push(["Tomorrow Morning", at(1, 8)], ["Tomorrow Evening", at(1, 18)]);
  const sat = (6 - new Date(now()).getDay() + 7) % 7;
  if (sat > 1) out.push(["Saturday Morning", at(sat, 9)]);
  return out;
}
const localInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
/* ---------- plan around the weather ----------
   Before you send: the forecast along the way, now and over the next day. If
   the weather would make it land well late, the composer says so, and when
   the skies clear: a pigeon booked to leave then flies through that hour's
   forecast instead. A strong tailwind gets a word too. */
const planBusy = new Set();
async function planWx(id) {
  const have = S.wxPlan.get(id);
  if (planBusy.has(id) || (have && now() - have.at < 20 * MIN)) return;
  planBusy.add(id);
  try { const d = await api("wx-plan?with=" + encodeURIComponent(id)); S.wxPlan.set(id, { at: now(), d }); if (S.chat === id) renderCompose(); }
  catch (_) { S.wxPlan.set(id, { at: now(), d: null }); }
  finally { planBusy.delete(id); }
}
const PAID = ["swift", "turbo", "rocket"];
function wxAdvice(f, kind) {
  const p = S.wxPlan.get(f.id)?.d; if (!p?.now || f.lat == null) return null;
  const km = chatKm(f), calm = (k) => flightMs(km, mySpeed(k)), late = (x, k) => calm(k) / x.f - calm(k), t = now();
  const d0 = late(p.now, kind);
  if (-d0 >= Math.max(10 * MIN, calm(kind) * 0.08)) return { early: Math.round(-d0 / MIN) * MIN, eta: Math.round(calm(kind) / p.now.f / MIN) * MIN };
  if (d0 < Math.max(20 * MIN, calm(kind) * 0.1)) return null;
  // waiting means booking it to land later, and that takes a swift pigeon or faster
  const sk = PAID.includes(kind) ? kind : schedKind(), k = sk || kind;
  const clear = (p.hours || []).find((h) => h.at >= t + HOUR && h.at <= t + 20 * HOUR && late(h, k) <= Math.max(5 * MIN, late(p.now, k) * 0.25));
  return { late: Math.round(d0 / MIN) * MIN, wx: p.now.wx, clear: clear && { off: clear.at, land: Math.ceil((clear.at + calm(k) / clear.f) / MIN) * MIN, kind: sk } };
}
function wxPlanHtml(a, kind) {
  if (a.early) return `<span class="wxline">${I.wind}<span>A tailwind today: about ${esc(fmtDur(a.early))} sooner than in calm air.</span></span>`;
  const w = a.wx && WX[a.wx.k], c = a.clear, by = (ts) => (sameDay(ts, now()) ? fmtTime(ts) : `${fmtTime(ts)} tomorrow`);
  let text = `${w ? `${w[0][0].toUpperCase()}${w[0].slice(1)} over ${wxWhere(a.wx.lon, a.wx.lat)}` : "Rough weather on the way"}: about ${fmtDur(a.late)} slower than in calm air.`;
  if (!c) text += " No clear skies in the next day.";
  else if (!c.kind) text += ` Clear by ${by(c.off)}, if you’d rather wait.`;
  else text += ` Clear by ${by(c.off)}: ${c.kind === kind ? "leave then and it lands" : `a ${KIND[c.kind].name.toLowerCase()} pigeon leaving then lands`} ${fmtLand(c.land)}.`;
  return `<span class="wxline">${I[w ? w[1] : "wind"]}<span>${esc(text)}</span></span>${c?.kind ? `<button type="button" class="btn small wxwait" data-act="wxwait" data-id="${esc(c.land)}" data-kind="${esc(c.kind)}">${c.kind === kind ? "Leave" : esc(KIND[c.kind].name)} at ${fmtTime(c.off)}</button>` : ""}`;
}
// What can fly from this chat now, and which one will
function composeState() {
  const g = S.chat ? group(S.chat) : null;
  // a group stands in for a friend here: its turn, and any member's changed key
  const f = g ? { id: g.id, turn: g.turn, keyChanged: others(g).some((p) => p.keyChanged) } : friend(S.chat);
  if (!f) return null;
  const t = S.turns.get(f.id) || f.turn;
  // off the Earth: space pigeons only (lunar to the Moon, laser to Mars), any time, straight there
  if (!g && moonChat(f)) {
    const ks = kindsFor(f), can = Object.fromEntries(ks.map((k) => [k, (S.me[k] || 0) > 0]));
    return { g, f, t, dumb: null, sched: null, via: null, can, kind: can[S.pick] ? S.pick : ks.find((k) => can[k]) || null, moon: true, kinds: ks };
  }
  const dumb = dumbText();
  // told when to land: one to one only, and standard pigeons can't wait that long for a turn
  const sched = schedFor(S.chat, dumb), via = viaFor(S.chat, dumb);
  const can = { standard: !!t.free && !sched, swift: (S.me.swift || 0) > 0, turbo: (S.me.turbo || 0) > 0, rocket: (S.me.rocket || 0) > 0, mystery: (S.me.mystery || 0) > 0 && !sched,
    // by orbit: one to one, between two places on Earth, now and straight there
    orbital: !g && !sched && !via && f.lat != null && S.me.lat != null && (S.me.orbital || 0) > 0 };
  // your choice if it can fly now, else the slowest that can
  const kind = dumb != null ? (t.free ? "dumb" : null) : can[S.pick] ? S.pick : KINDS.map(([k]) => k).find((k) => can[k]) || null;
  return { g, f, t, dumb, sched, via, can, kind, moon: !!g && (!!S.me.moon || others(g).some((p) => p.onMoon)), orbit: !g && f.lat != null && S.me.lat != null };
}
// How long a pigeon of this kind takes: to the furthest of a group, or by way of a stopover
function etaMs(c, k) {
  if (!c.g && (c.moon || k === "orbital")) return spaceMs(k, endFor(S.me), endFor(c.f));
  const sp = mySpeed(k);
  if (c.g) return Math.max(0, ...others(c.g).map((p) => memberMs(p, k)));
  if (c.via) { const p = friend(c.via.id); return flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, c.f.lat ?? p.lat, c.f.lon ?? p.lon), sp); }
  return flightMs(chatKm(c.f), sp);
}
// The message box's hint: "Lands 18:40", "Via Nia · lands Thu 06:08", a group's "Lands in 2h" or "2h–1d 10h away"
function landHint(c, k) {
  if (k === "mystery") return "Who knows when?";
  if (c.sched) return `Lands ${atShort(c.sched.at)}`;
  if (c.g) {
    const all = others(c.g).map((p) => memberMs(p, k)).sort((a, b) => a - b), ms = (x) => durShort(x), n = all.length;
    return n ? (ms(all[0]) === ms(all[n - 1]) ? `Lands in ${ms(all[0])}` : `${ms(all[0])}–${ms(all[n - 1])} away`) : "Message";
  }
  return `${c.via ? `Via ${first(friend(c.via.id).name)} · lands` : "Lands"} ${atShort(now() + plannedMs(c, k))}`;
}
/* ---------- the composer: one row ----------
   +, then the message with its pigeon at the start (tap it for How It Flies)
   and when it would land as the hint, then send. A line above it only when
   something stops it flying. */
let planSoon = 0, planFor = "";
function renderCompose() {
  const show = S.view === "chat" && !!S.chat && !!(friend(S.chat) || group(S.chat)) && !!S.me;
  $compose.hidden = !show; if (!show) return;
  const c = composeState(), { g, f, dumb, sched, via, kind } = c;
  const note = $(".note", $compose), btn = $(".send", $compose), pill = $(".kind", $compose);
  const has = (dumb ?? $ta.value).trim() || S.attach;
  S.sendKind = kind;
  const hatch = () => fmtDur(Math.min(...["swiftNextAt", "turboNextAt", "rocketNextAt"].map((x) => S.me[x] || Infinity)) - now());
  let stop = "", blocked = true;
  if (f.keyChanged) stop = "Check the new safety number before sending.";
  else if (S.me.lat == null && !S.me.moon) stop = "Set your location in Account before sending.";
  else if (!kind && c.moon && !g) {
    const ks = c.kinds || [], mars = ks.includes("laser"), next = fmtDur(Math.min(...ks.map((k) => S.me[k + "NextAt"] || Infinity)) - now());
    stop = mars ? `Only a laser pigeon reaches ${worldOf(S.me) === "mars" && worldOf(f) === "mars" ? "across Mars" : "Mars or comes from it"}, and your laser loft is empty. The next one hatches in ${next}.`
      : `Only a lunar pigeon reaches ${S.me.moon && f.moon ? "across the Moon" : S.me.moon ? "Earth from the Moon" : "the Moon"}, and your lunar lofts are empty. The next one hatches in ${next}.`;
  }
  else if (!kind && sched) stop = `Scheduled pigeons are swift or faster, and your lofts are empty. The next one hatches in ${hatch()}.`;
  else if (!kind && dumb != null) stop = "Dumb pigeons wait their turn.";
  else if (!kind) stop = `It isn’t your turn, and your lofts are empty. The next pigeon hatches in ${hatch()}.`;
  else if (sched && sched.at - etaMs(c, kind) < now()) stop = `Too soon for a ${KIND[kind].name.toLowerCase()} pigeon: it takes ${fmtDur(etaMs(c, kind))} to get there. Pick a later time or a faster pigeon.`;
  else blocked = false;
  if (S.err) stop = S.err;
  note.hidden = !stop; note.className = "note stop";
  if (note.textContent !== stop) note.textContent = stop;
  // its pigeon, at the start of the message: the named one carrying it, or its kind
  // (a moment after a chat opens, the planner's times, so the hint says what How It Flies will)
  const planKey = !g && !via && !sched && kind && KIND[kind] && !SPACE_KINDS.includes(kind) && f.lat != null && S.me.lat != null && !(S.routePlan?.key === f.id + ":" + (birdFor()?.id || "") && now() - S.routePlan.at < PLAN_KEEP) ? f.id + ":" + kind : "";
  if (planKey !== planFor) { clearTimeout(planSoon); planSoon = 0; planFor = planKey; }
  if (planKey && !planSoon) planSoon = setTimeout(() => { planSoon = -1; if (S.chat === f.id && S.view === "chat") routePlanFor(f.id, kind); }, 1200);   // (-1: asked, once, until the chat or pigeon changes)
  const here = S.me.lat != null || !!S.me.moon;
  const bd = kind && kind !== "dumb" && !SPACE_KINDS.includes(kind) ? birdFor() : null, hint = kind && !f.keyChanged && here ? landHint(c, kind) : "Message";
  pill.hidden = !!f.keyChanged || !here;
  pill.disabled = dumb != null;
  const pk = JSON.stringify([kind, bd?.id, bd?.name, bd?.wear, !!sched, !!via, S.me.skin]);
  if (pill.dataset.k !== pk) {
    pill.dataset.k = pk; pill.classList.toggle("named", !!bd);
    pill.innerHTML = `${kind ? `<span class="pgw">${pg(kind, S.me.skin)}${wearOn(bd?.wear)}</span>` : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}<span class="kl">${esc(!kind ? "None" : bd ? bd.name : KIND[kind].name)}</span>${sched ? I.clock : via ? I.people : ""}${I.chev}`;
  }
  pill.setAttribute("aria-label", `${kind ? `${KIND[kind].name} pigeon${bd ? `, carried by ${bd.name}` : ""}${kind === "dumb" ? "" : `. ${hint}`}` : "No pigeon can fly yet"}. How it flies`);
  if ($ta.placeholder !== hint) { $ta.placeholder = hint; if (!$ta.value) fitTa(); }
  // the weather along the way, for a pigeon about to leave now (one to one)
  const wp = $(".wxplan", $compose), plan = !g && !c.moon && !blocked && !S.err && !sched && !via && kind && kind !== "dumb" && kind !== "mystery" && kind !== "orbital" && f.lat != null && S.me.lat != null;
  if (plan) planWx(f.id);
  const adv = plan ? wxAdvice(f, kind) : null, wk = adv ? JSON.stringify([adv, kind]) : "";
  if (wp.dataset.k !== wk) { wp.dataset.k = wk; wp.hidden = !adv; wp.classList.toggle("early", !!adv?.early); wp.innerHTML = adv ? wxPlanHtml(adv, kind) : ""; }
  btn.disabled = blocked || !has || S.busy;
  // nothing typed: the send button becomes a microphone (voice pigeons)
  const mic = $(".mic", $compose), showMic = !has && !blocked && voiceOK() && dumb == null;
  mic.hidden = !showMic; btn.hidden = showMic && !S.busy; mic.disabled = !!S.busy;
  // you can always delete a /dumb that can't fly; and the box you're typing in is never switched off under you
  // (iOS puts the keyboard away the moment a focused field is disabled; Send stays off instead)
  const off = blocked && !S.err && dumb == null;
  if (!off || document.activeElement !== $ta) $ta.disabled = off;
  const rb = $(".replybar", $compose), rt = S.replyTo && S.replyTo.chat === S.chat ? S.replyTo : null;
  rb.hidden = !rt;
  if (rt && rb.dataset.for !== rt.id) {
    rb.dataset.for = rt.id;
    rb.innerHTML = `${I.reply}<span class="rtext"><b>Replying to ${esc(chatName(rt.from, g))}</b><span>${rt.p ? (rt.p === "gif" ? "GIF" : rt.p === "voice" ? "Voice pigeon" : "Photo") + (rt.t ? ": " : "") : ""}${esc(rt.t)}</span></span><button type="button" data-act="unreply" aria-label="Cancel reply">${I.x}</button>`;
  }
  if (!rt && rb.dataset.for) { rb.dataset.for = ""; rb.innerHTML = ""; }
  const a = $(".attach", $compose);
  a.hidden = !S.attach;
  if (S.attach?.voice && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<span class="vthumb">${I.mic}</span><span class="ainfo"><b>Voice · ${fmtClip(S.attach.ms)}</b><span class="atext" aria-live="polite">${attachText()}</span><i class="upbar" aria-hidden="true"><b></b></i></span><button type="button" data-act="unattach" aria-label="Remove voice pigeon">${I.x}</button>`;
  } else if (S.attach && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<img src="${S.attach.preview}" alt=""><span class="ainfo"><b>${S.attach.gif ? "GIF" : "Photo"}</b><span class="atext" aria-live="polite">${attachText()}</span><i class="upbar" aria-hidden="true"><b></b></i></span><button type="button" data-act="unattach" aria-label="Remove photo">${I.x}</button>`;
  }
  if (!S.attach && a.dataset.for) { a.dataset.for = ""; a.innerHTML = ""; }
}
const TABS = [["messages", "Messages", "bubble"], ["friends", "Friends", "people"], ["account", "Account", "person"]];
// Built once and then updated, so the highlight can slide between tabs.
function renderTabs() {
  const unread = [...S.friends, ...S.groups].reduce((n, f) => n + (f.unread || 0), 0);
  const cur = S.view === "chat" ? "messages" : S.view;
  const badges = { messages: unread, friends: S.incoming.length, account: 0 };
  let tabs = $(".tabs", $tabbar);
  if (!tabs) {
    $tabbar.innerHTML = `<div class="tabs">${TABS.map(([id, label, icon]) => `<button class="tab" data-act="tab" data-id="${esc(id)}" aria-current="false">${I[icon]}<span>${label}</span></button>`).join("")}</div>`;
    tabs = $(".tabs", $tabbar);
  }
  for (const btn of tabs.querySelectorAll(".tab")) {
    const id = btn.dataset.id, n = badges[id] || 0;
    btn.setAttribute("aria-current", String(cur === id));
    if (String(n) !== (btn.dataset.badge || "0")) {          // a new badge bounces in
      btn.querySelector(".badge")?.remove();
      if (n) btn.insertAdjacentHTML("afterbegin", `<span class="badge">${n}</span>`);
      btn.dataset.badge = String(n);
    }
  }
  const i = TABS.findIndex(([id]) => id === cur), was = tabs.dataset.tab;
  if (String(i) !== was) {
    tabs.style.setProperty("--tab", String(Math.max(0, i)));
    if (was != null && was !== "-1" && i >= 0) { tabs.classList.remove("moving"); void tabs.offsetWidth; tabs.classList.add("moving"); }
    tabs.dataset.tab = String(i);
  }
  document.title = unread ? `(${unread}) InFlight` : "InFlight";
}
function filterLists() {
  const run = (list, q) => { const el = $(`[data-list="${list}"]`); if (!el) return; q = q.trim().toLowerCase(); el.querySelectorAll("[data-find]").forEach((r) => { r.hidden = !!q && !r.dataset.find.includes(q); }); };
  run("m", S.q); run("f", S.fq);
  if (airEl) airEl.classList.toggle("q", !!S.q.trim());
  if (S.view === "messages") searchMessages(S.q);
}
/* ---------- search inside chats ----------
   On the phone only: every message it can open (the chats you've opened,
   and the last ones kept from before), matched without minding case or
   accents. The server never sees what you look for. */
const fold = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
let searchSeq = 0;
async function searchMessages(q) {
  const box = $(".sres", $view); if (!box) return;
  const term = fold(q.trim()), seq = ++searchSeq;
  if (term.length < 2) { box.innerHTML = ""; return; }
  // open the kept chats first (once), so they can be searched too
  for (const [fid, d] of S.chatRaw) if (!S.msgs.has(fid) && (friend(fid) || group(fid))) await applyChat(fid, d, false).catch(() => {});
  if (seq !== searchSeq) return;
  const hits = [], seen = new Set();
  const look = (chat, m) => {
    if (!m || seen.has(m.id)) return; seen.add(m.id);
    const p = S.plain.get(m.id); if (!p || p.bad || typeof p.t !== "string" || !p.t) return;
    const at = fold(p.t).indexOf(term); if (at < 0) return;
    hits.push({ chat, m, p, at, when: m.from === S.me.id ? m.sentAt : m.deliverAt });
  };
  for (const [chat, list] of S.msgs) for (const m of list) look(chat, m);
  for (const f of S.friends) look(f.id, f.last);
  for (const g of S.groups) look(g.id, g.last);
  hits.sort((a, b) => b.when - a.when);
  const snip = (t, at) => {
    const a = Math.max(0, at - 28), b2 = Math.min(t.length, at + term.length + 60);
    return `${a ? "…" : ""}${esc(t.slice(a, at))}<mark>${esc(t.slice(at, at + term.length))}</mark>${esc(t.slice(at + term.length, b2))}${b2 < t.length ? "…" : ""}`;
  };
  const rows = hits.slice(0, 40).map(({ chat, m, p, at }) => {
    const g = group(chat), f = friend(chat), who = g ? gavatar(g, "s") : avatar(f || { name: "?" }, "s");
    const by = m.from === S.me.id ? "You" : g ? first(member(g, m.from)?.name || "Someone") : "";
    return `<button type="button" class="srow" data-act="searchopen" data-id="${esc(chat)}" data-m="${esc(m.id)}">${who}
      <span class="stext"><span class="stop"><b class="one">${esc(g ? g.name : first(f?.name || "Someone"))}</b><time>${fmtListTime(m.from === S.me.id ? m.sentAt : m.deliverAt)}</time></span>
      <span class="sbody">${by ? `<span class="sby">${esc(by)}: </span>` : ""}${snip(p.t.replace(/\s+/g, " "), fold(p.t.replace(/\s+/g, " ")).indexOf(term))}</span></span></button>`;
  }).join("");
  box.innerHTML = hits.length ? `<div class="ghead">Messages${hits.length > 40 ? " · newest 40" : ""}</div><div class="group">${rows}</div>`
    : `<p class="snone">No messages on this phone match “${esc(q.trim())}”.</p>`;
}
let gifTimer = 0;
/* ---------- sign-up, made quick ----------
   While you type: your handle is suggested from your name and checked as you
   go; the password shows how many more characters it needs; and the slow
   parts (making your key pair, stretching your password) start in the
   background, so Create Account is nearly instant. */
const onb = { handleTouched: false, timer: 0, pwTimer: 0, id: null, pw: null };
const handleFrom = (name) => { const p = String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean); return (p.length > 1 ? p[0] + "_" + p[p.length - 1][0] : p[0] || "").replace(/[^a-z0-9_]/g, "").slice(0, 20); };
function onbPrepare() { if (!onb.id) onb.id = E2E.newIdentity().then((x) => (onb.idDone = x)); }
async function onbCheckHandle() {
  const i = $("#f-handle"), st = $(".hstat"); if (!i || !st) return;
  const h = i.value.trim().replace(/^@/, "").toLowerCase();
  if (h.length < 3) { st.className = "gfoot hstat"; st.textContent = "Friends see your name and find you by your handle."; return; }
  try {
    const r = await api("handle-free?h=" + encodeURIComponent(h));
    if (($("#f-handle")?.value || "").trim().replace(/^@/, "").toLowerCase() !== h) return;     // they've typed on
    if (r.free) { st.className = "gfoot hstat ok"; st.innerHTML = `${I.ok}@${esc(h)} is yours.`; }
    else { st.className = "gfoot hstat bad"; st.innerHTML = `${esc(r.reason)}${r.try?.length ? ` Try ${r.try.map((t) => `<button type="button" class="linkbtn" data-act="usehandle" data-id="${esc(t)}">@${esc(t)}</button>`).join(" or ")}.` : ""}`; }
  } catch (_) { /* checked again when you create the account */ }
}
function onbInput(e) {
  const id = e.target.id; onbPrepare();
  if (id === "f-name" && !onb.handleTouched) { const h = $("#f-handle"); if (h) { h.value = handleFrom(e.target.value); clearTimeout(onb.timer); onb.timer = setTimeout(onbCheckHandle, 350); } }
  if (id === "f-handle") { onb.handleTouched = true; clearTimeout(onb.timer); onb.timer = setTimeout(onbCheckHandle, 350); }
  if (id === "f-password") {
    const pw = e.target.value, n = 10 - pw.length, st = $(".pwstat");
    if (st) { st.className = `gfoot pwstat${n <= 0 ? " ok" : ""}`; st.innerHTML = n > 0 ? (pw ? `${n} more character${n === 1 ? "" : "s"}.` : "At least 10 characters. It also locks your encryption key.") : `${I.ok}Good. It also locks your encryption key.`; }
    // stretch the password in the background once it's long enough and you pause
    clearTimeout(onb.pwTimer);
    if (n <= 0) onb.pwTimer = setTimeout(() => { const salt = E2E.newSalt(); onb.pw = { pw, salt, p: E2E.fromPassword(pw, salt) }; }, 450);
  }
}
/* ---------- Add Friend: look them up as you type ---------- */
const myLink = () => `${NEW_HOME ? NEW_HOME + "/" : location.origin + "/pigeon/"}#add=${S.me.handle}`;
let addTimer = 0;
function addLookup() {
  clearTimeout(addTimer);
  const i = $("#add-h", $layer), box = $(".addres", $layer); if (!i || !box) return;
  const h = i.value.trim().replace(/^@/, "").toLowerCase();
  if (h.length < 3) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="group"><div class="cell addrow"><span class="spin"></span><span class="ctext"><span>@${esc(h)}</span><span class="csub">Looking…</span></span></div></div>`;
  addTimer = setTimeout(async () => {
    let r; try { r = await api("friend-status?h=" + encodeURIComponent(h)); } catch (_) { box.innerHTML = ""; return; }
    if (($("#add-h", $layer)?.value || "").trim().replace(/^@/, "").toLowerCase() !== h) return;     // typed on
    const ini = avatar({ name: h }, "s", false, true);
    const row = (sub, btn, cls = "") => `<div class="group"><div class="cell addrow ${cls}">${ini}<span class="ctext"><span>@${esc(r.handle || h)}</span><span class="csub">${sub}</span></span>${btn}</div></div>`;
    box.innerHTML = {
      invalid: `<p class="gfoot bad">Handles use 3 to 20 letters, numbers or underscores.</p>`,
      none: row("No one has that handle yet", `<button type="button" class="btn small gray" data-act="share">Invite</button>`, "dim"),
      self: row("That’s you", ""),
      new: row("On InFlight", `<button type="button" class="btn small" data-act="addgo" data-id="${esc(r.handle)}">Add</button>`),
      sent: row("Request sent · waiting for them", `<button type="button" class="btn small gray" data-act="cancelreq" data-id="${esc(r.id)}">Cancel</button>`),
      incoming: row("Wants to be your friend", `<button type="button" class="btn small" data-act="accept" data-id="${esc(r.id)}">Accept</button>`),
      friends: row("Already friends", `<button type="button" class="btn small gray" data-act="addchat" data-id="${esc(r.id)}">Message</button>`),
      blocked: row("You blocked them", `<button type="button" class="btn small gray" data-act="unblock" data-id="${esc(r.id)}">Unblock</button>`),
    }[r.state] || "";
  }, 300);
}
// Add: the button folds into a circle, a pigeon flies out of it, and it lands as a green tick.
async function addGo(h, btn) {
  const msg = $(".add-msg", $layer), row = $(".addres .addrow", $layer);
  const b = row?.querySelector("[data-act=addgo]") || (btn?.classList.contains("btn") ? btn : null);
  const still = STILL.matches, wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
  if (b) { b.style.width = `${b.offsetWidth}px`; b.disabled = true; void b.offsetWidth; b.classList.add("sending"); b.style.width = ""; b.innerHTML = `<span class="flyb">${I.bird}</span>`; }
  else btn?.classList.add("pulsing");
  let r, err;
  try { [r] = await Promise.all([api("friends", { method: "POST", body: { handle: h } }), wait(700)]); } catch (e) { err = e; }
  btn?.classList.remove("pulsing");
  const ok = r && /^Request sent|joined/.test(r.message);
  if (ok) {
    S.pendingAdd = null;
    if (b) { b.classList.remove("sending"); b.classList.add("sent"); b.innerHTML = I.check; b.setAttribute("aria-label", "Sent"); }
    haptic("success");
    const sub = row?.querySelector(".csub"); if (sub) sub.textContent = /joined/.test(r.message) ? "You’re friends now" : "Request sent";
    if (!b) toast(esc(r.message));
    await sync();
    await wait(1200);
    // ready for the next one (unless they've started typing another already)
    const i = $("#add-h", $layer);
    if (i && i.value.trim().replace(/^@/, "").toLowerCase() === h.toLowerCase()) { i.value = ""; const box = $(".addres", $layer); if (box) box.innerHTML = ""; }
    if (msg) { msg.className = "gfoot add-msg"; msg.textContent = "Add another, or let them scan your code."; }
    if (S.sheet?.type === "addfriend") renderSheet();
    return;
  }
  if (b) { b.classList.remove("sending"); b.disabled = false; b.textContent = "Add"; }
  if (msg) { msg.textContent = err ? err.message : r.message; msg.classList.add("bad"); }
  await sync(); if (S.sheet?.type === "addfriend") { renderSheet(); addLookup(); }
}
function onInput(e) {
  if (e.target.id === "add-h") { const m = $(".add-msg", $layer); if (m) m.classList.remove("bad"); return addLookup(); }
  if (S.view === "signup" && e.target.closest?.("[data-form=signup]")) return onbInput(e);
  if (e.target.id === "gif-q" && S.sheet?.type === "gifs") { clearTimeout(gifTimer); gifTimer = setTimeout(() => { if (S.sheet?.type !== "gifs") return; Object.assign(S.sheet, { q: e.target.value.trim(), list: [], next: 0, busy: false }); loadGifs(); }, 350); return; }
  if (e.target.id === "msearch") { S.q = e.target.value; filterLists(); }
  if (e.target.id === "fsearch") { S.fq = e.target.value; filterLists(); }
}

/* ---------- sheets ---------- */
// header: { left: {label, act}, right: {label, act} | {label, form}, strong }
function sheetHtml(title, body, { left, right = { label: "Done", act: "close" }, flush, plain, name } = {}) {
  const b = (x, cls) => !x ? ""
    : x.form ? `<button type="button" class="nbtn prominent ${cls}" data-act="submit" data-id="${esc(x.form)}" aria-label="${esc(x.label)}">${I.check}</button>`
    : `<button type="button" class="nbtn ${cls}" data-act="${x.act}"${x.id ? ` data-id="${esc(x.id)}"` : ""} aria-label="${esc(x.label)}">${x.act === "close" ? I.x : I.back}</button>`;
  return `<div class="scrim" data-act="close"></div><div class="sheet${plain ? " plainbg" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title || name || "")}"><div class="grab"></div>
    <header><span class="l">${b(left, "l")}</span>${title ? `<h2 tabindex="-1">${esc(title)}</h2>` : `<h2 class="sr" tabindex="-1">${esc(name || "")}</h2>`}<span class="r">${b(right, "r")}</span></header>
    <div class="body${flush ? " flush" : ""}">${body}</div></div>`;
}
let sheetTimer = 0, sheetType = null, sheetUpAt = -1e9, sheetLater = 0, sheetPath = [], sheetOnAt = -1e9;
// A sheet is still coming up (sliding in, its rows growing) for this long after it opens; the slide itself is the
// first SHEET_SLIDE_MS (styles.css: .sheet)
const SHEET_IN_MS = 1100, SHEET_SLIDE_MS = 500, SHEET_ON_MS = 420;
const sheetEntering = () => performance.now() - sheetUpAt < SHEET_IN_MS;
const gliding = new Map();            // switches mid-glide: key → { from, to, at }
const switchKey = (b) => `${b.dataset.act}:${b.dataset.id || ""}`;
// Redrawing replaces a switch, which would snap it to its end. Note where each
// one was before a redraw, then replay any glide from where it had got to.
const switchStates = (el) => new Map([...el.querySelectorAll("[role=switch]")].map((b) => [switchKey(b), b.getAttribute("aria-checked") === "true"]));
// A box that was already ticked stays still when its sheet redraws: only a new tick pops in.
const TICKED = "[aria-checked=true],[aria-pressed=true]";
const tickedKeys = (el) => new Set([...el.querySelectorAll(TICKED)].map(switchKey));
const keepTicks = (el, was) => { for (const b of el.querySelectorAll(TICKED)) if (was.has(switchKey(b))) b.classList.add("kept"); };
function keepGlides(el, before) {
  for (const b of el.querySelectorAll("[role=switch]")) {
    const k = switchKey(b), was = before.get(k), is = b.getAttribute("aria-checked") === "true", sw = $(".switch", b);
    if (!sw || was === undefined) continue;
    const g = gliding.get(k), t = performance.now();       // frame time: unaffected by clock changes
    if (was !== is) gliding.set(k, { from: was, to: is, at: t });
    const run = was !== is ? gliding.get(k) : g && g.to === is && t - g.at < 600 ? g : null;
    if (!run || matchMedia("(prefers-reduced-motion: reduce)").matches) continue;
    // a brand-new switch has nothing for CSS to transition from, so play the
    // glide outright, picking up from wherever it had got to
    const track = (on) => { sw.classList.toggle("on", on); return getComputedStyle(sw).backgroundColor; };
    const [off, onCol] = [track(false), track(true)]; sw.classList.toggle("on", run.to);
    const timing = { duration: 500, delay: run.at - t, easing: cssVar(document.documentElement, "--snappy") || "ease-out", fill: "backwards" };
    sw.animate([{ transform: `translateX(${run.from ? 21 : 0}px)` }, { transform: `translateX(${run.to ? 21 : 0}px)` }], { ...timing, pseudoElement: "::after" });
    sw.animate([{ backgroundColor: run.from ? onCol : off }, { backgroundColor: run.to ? onCol : off }], { ...timing, duration: 300 });
  }
}
// Opening springs the sheet up and settles the screen back behind it; closing
// slides it away. Redrawing an open sheet doesn't replay its entrance, and a
// switch that changed still glides across.
let shownSheet = null;
function renderSheet(refresh) {
  if (S.scan && S.sheet?.type !== "scan") stopScan();
  // a question sheet replaced by anything else (a link, the lock, Back): it's answered "no" once this settles
  if (shownSheet !== S.sheet) { const was = shownSheet; shownSheet = S.sheet; if (S.moonReplay && S.sheet?.id !== S.moonReplay.id) S.moonReplay = null; if (was?.resolve && !was.done) setTimeout(() => was.resolve(was.type === "reauth" ? false : null), 0); }
  const open = $(".sheet, .viewer", $layer), closing = !!open?.classList.contains("closing");
  if (!S.sheet) {
    root().classList.remove("sheeted"); sheetType = null;
    if (!open) { $layer.innerHTML = ""; return; }
    if (closing) return;
    $layer.querySelectorAll(".sheet, .scrim, .viewer").forEach((e) => { e.classList.remove("still"); e.classList.add("closing"); });
    clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { if (!S.sheet) $layer.innerHTML = ""; }, 330);
    return;
  }
  clearTimeout(sheetTimer); clearTimeout(sheetLater);
  // the same sheet redrawn while it slides up (its plan, its friends arriving): that waits until it's up, all in
  // one go. Redrawing is a long moment's work on a phone, and doing it mid-slide made the sheet judder.
  // (and the same for one just gone on to inside it: a friend's loft, say, arriving)
  const slid = performance.now() - sheetUpAt, on = performance.now() - sheetOnAt, wait = Math.max(SHEET_SLIDE_MS - slid, SHEET_ON_MS - on);
  if (open && !closing && sheetType === S.sheet.type && wait > 0) { sheetLater = setTimeout(() => renderSheet(refresh), wait + 20); return; }
  const had = !!open && !closing, swapped = had && sheetType !== S.sheet.type;
  const before = had ? switchStates($layer) : null, ticked = had ? tickedKeys($layer) : null;
  const old = $(".sheet", $layer);
  // the same sheet drawn again (fresh data): it stays where you'd scrolled it, and a field you're typing in keeps its focus and caret
  const same = had && !swapped, top = same ? $(".sheet .body", $layer)?.scrollTop || 0 : 0;
  const fe = same && document.activeElement && $layer.contains(document.activeElement) && document.activeElement.id ? document.activeElement : null;
  const caret = fe && typeof fe.selectionStart === "number" ? [fe.selectionStart, fe.selectionEnd] : null;
  drawSheet(refresh);
  sheetType = S.sheet?.type || null;
  const now = $(".sheet", $layer);
  if (had && now && now !== old && same && sheetEntering()) {
    // redrawn as it comes up (its plan or friends arriving): it carries on from where it had got to, rather than
    // jumping the rest of the way up, and its rows keep growing
    const late = performance.now() - sheetUpAt;
    try { for (const a of $layer.getAnimations({ subtree: true })) if (a.animationName !== "fc-pick") a.currentTime = late; } catch (_) {}
    keepGlides($layer, before); keepTicks($layer, ticked);
    const body = $(".sheet .body", $layer); if (top && body && !body.scrollTop) body.scrollTop = top;
    const back = fe && document.getElementById(fe.id);
    if (back && back !== fe && $layer.contains(back)) { back.focus({ preventScroll: true }); if (caret) try { back.setSelectionRange(...caret); } catch (_) {} }
  } else if (had && now && now !== old) {
    $layer.querySelectorAll(".sheet, .scrim").forEach((e) => e.classList.add("still"));
    if (swapped) {
      // the way you've come through this sheet: one you came from is "back", anything else is "on"
      const i = sheetPath.indexOf(sheetType), back = i >= 0;
      sheetPath = back ? sheetPath.slice(0, i + 1) : [...sheetPath, sheetType];
      now.classList.add(back ? "go-back" : "go-on"); $(".sheet .body", $layer)?.classList.add(back ? "go-back" : "go-on"); sheetOnAt = performance.now();
    }
    keepGlides($layer, before); keepTicks($layer, ticked);
    if (same) {
      const body = $(".sheet .body", $layer); if (top && body && !body.scrollTop) body.scrollTop = top;
      const back = fe && document.getElementById(fe.id);
      if (back && back !== fe && $layer.contains(back)) { back.focus({ preventScroll: true }); if (caret) try { back.setSelectionRange(...caret); } catch (_) {} }
    }
  }
  if (!had && now) { sheetUpAt = performance.now(); sheetPath = [sheetType]; }
  root().classList.toggle("sheeted", !!$(".sheet", $layer));
  // a sheet that has just come up: a screen reader starts in it (not on the screen behind), unless a field has already taken focus
  if (!had && now && !now.contains(document.activeElement)) setTimeout(() => { if ($layer.contains(now) && !now.classList.contains("closing") && !now.contains(document.activeElement)) $("h2", now)?.focus({ preventScroll: true }); }, SHEET_SLIDE_MS);
}
function drawSheet(refresh) {
  const s = S.sheet;
  if (refresh && s?.type !== "profile") return;
  if (!s) { $layer.innerHTML = ""; return; }
  const f = s.id ? friend(s.id) : null;
  switch (s.type) {
    case "map": {
      const mm = s.id === "skies" || s.id === "preview" ? null : (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
      if (mm && moonOf(mm)) return drawMoonFlight(s, mm);
      if (!$(".map", $layer)) $layer.innerHTML = sheetHtml(s.id === "skies" ? "The Skies" : s.id === "preview" ? "The Way" : ((m) => m?.flock ? (m.flying ? "Pigeons in Flight" : "The Flights") : m && !m.flying ? "The Flight" : "Pigeon in Flight")((S.msgs.get(S.chat) || []).find((x) => x.id === s.id)), `<canvas class="map" role="img" aria-label="Map of the pigeon’s route. Drag to move, pinch to zoom."></canvas>
        <div class="mapctl glass"><button type="button" data-act="mapzoom" data-id="in" aria-label="Zoom in">${I.plus}</button><button type="button" data-act="mapzoom" data-id="out" aria-label="Zoom out">${I.minus}</button><button type="button" class="fitbtn" data-act="mapzoom" data-id="fit" aria-label="Show the whole route">${I.loc}</button><button type="button" class="globebtn" data-act="mapglobe" aria-pressed="false" aria-label="Globe or flat map">${I.globe}</button><button type="button" class="layerbtn" data-act="maplayers" aria-pressed="${windOn()}" aria-label="Wind map">${I.layers}</button></div>
        <div class="windtip" hidden></div><div class="birdtip glass" hidden></div>
        <div class="mapcard"></div>`, { flush: true, ...(s.id === "preview" ? { left: { label: "Back", act: "flysheet" } } : {}) });
      if (!$(".map", $layer)._g) { $(".map", $layer)._g = 1; mapGestures($(".map", $layer)); }
      if (!$(".mapcard", $layer)._g) { $(".mapcard", $layer)._g = 1; fcDrag($(".mapcard", $layer)); }
      return tickMap();
    }
    case "shareflight": {
      if ($(".shpick", $layer)) return;                            // already up: its pictures and switch update in place
      const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), mine = m?.from === S.me.id;
      $layer.innerHTML = sheetHtml("Share Flight", `
        <div class="shpick" role="radiogroup" aria-label="Picture">${SHARE_FMTS.map(([f, label, sub]) => `<button type="button" class="shopt ${f}" role="radio" aria-checked="${s.fmt === f}" data-act="sharefmt" data-id="${f}" aria-label="${label}: ${sub}">
          <span class="shimg">${s.urls[f] ? `<img src="${s.urls[f]}" alt="">` : `<span class="shwait" aria-hidden="true">${I.bird}</span>`}</span>
          <span class="shl"><b>${label}</b><small>${sub}</small></span></button>`).join("")}</div>
        <div class="group">${toggleCell({ act: "sharename", icon: I.person, tile: "blue", label: "Show My Name", sub: esc(`“${mine ? "Sent" : "Received"} by ${first(S.me.name)}”`), on: s.name })}</div>
        <div class="gfoot">Only the two places, the day and the flight go on the picture: never the message, and never your friend’s name.</div>
        <div class="sharego"><button type="button" class="btn wide" data-act="shareimg"${s.urls[s.fmt] ? "" : " disabled"}>${I.share}${canShareFiles() ? "Share" : "Save Image"}</button></div>`,
        { left: { label: "Back to the map", act: "shareback" } });
      return;
    }
    case "news":
      $layer.innerHTML = sheetHtml("Friends’ News", S.news?.length ? `<div class="group mt-s news">${S.news.map(newsRow).join("")}</div>
        <div class="gfoot">The last two weeks of your friends’ pigeons: new countries, postmarks, ranks, streaks and more. Never what anyone wrote, or where anyone is.</div>`
        : `<p class="empty"><b>No news yet</b>When your friends’ pigeons reach somewhere new, rise a rank or keep a streak going, it’ll show here.</p>`);
      return;
    case "feathers": {
      const w = s.data;
      if (!w) { $layer.innerHTML = sheetHtml("Coots", s.err ? loadFail(s.err, "feathers") : `<p class="empty">Counting your Coots Coins…</p>`); return; }
      const named = S.birds.length > 0;
      const item = (x) => `<div class="cell has-icon shopi${x.owned ? " owned" : ""}"><span class="tile emo" aria-hidden="true">${x.emoji}</span>
        <span class="ctext"><span>${esc(x.name)}</span><span class="csub">${x.owned ? (x.on ? `On ${esc(x.on.name)}` : "Yours") : `${x.price} Coots Coins`}</span></span>
        ${x.owned ? (named ? `<button type="button" class="btn small plain" data-act="wearitem" data-id="${esc(x.id)}">${x.on ? "Move" : "Put On"}</button>` : "")
          : `<button type="button" class="btn small" data-act="buyitem" data-id="${esc(x.id)}"${w.feathers >= x.price ? "" : " disabled"} aria-label="Buy for ${x.price} Coots Coins">${I.coin}${x.price}</button>`}</div>`;
      $layer.innerHTML = sheetHtml("Coots", `<div class="fhead"><span class="fico">${I.coin}</span><b>${w.feathers.toLocaleString("en-GB")}</b><span>Coots Coin${w.feathers === 1 ? "" : "s"}</span></div>
        <div class="ghead">Shop</div><div class="group">${w.items.map(item).join("")}</div>
        <div class="gfoot">${named ? "Accessories go on your named pigeons, and everyone they fly to sees them." : "Accessories go on your named pigeons. Name one in Your Pigeons first."}</div>
        <div class="ghead">How to Earn Them</div>
        <div class="group">${cell({ icon: I.bird, tile: "orange", label: "A pigeon of yours lands", val: "1–6", sub: "One more for every 250 miles" })}
          ${cell({ icon: I.globe, tile: "blue", label: "A new country or sea", val: "3", sub: "In your passport" })}
          ${cell({ icon: I.pin, tile: "red", label: "A new postmark", val: "10", sub: "Flying past somewhere famous" })}
          ${cell({ icon: I.flame, tile: "orange", label: "A streak reaches 7, 30 or 100 days", val: "10–100", sub: "For you both" })}</div>
        ${w.recent.length ? `<div class="ghead">Lately</div><div class="group">${w.recent.map((r) => `<div class="cell"><span class="ctext"><span>${esc(r.why)}</span><span class="csub">${esc(agoText(r.at))}</span></span><span class="val fdelta${r.n < 0 ? " spent" : ""}">${r.n > 0 ? "+" : "−"}${Math.abs(r.n)}</span></div>`).join("")}</div>` : ""}`);
      return;
    }
    case "birds": {
      const sub = (b) => `${esc(b.rank)} · ${fmtMiles(b.km)} · ${birdState(b)}`;
      const row = (b, hall) => `<button type="button" class="cell has-icon" data-act="bird" data-id="${esc(b.id)}"><span class="tile wtile ${b.lostAt ? "gray" : RANK_TILE[b.rank]}">${b.lostAt ? I.skull : I.bird}${hall ? "" : wearOn(b.wear)}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub">${!hall ? sub(b) : b.lostAt ? `Lost${b.lostPlace ? ` over ${esc(b.lostPlace)}` : ""} · ${fmtDate(b.lostAt)}` : `${esc(b.rank)} · ${fmtMiles(b.km)} · retired ${fmtDate(b.retiredAt)}`}</span></span>${chevSm}</button>`;
      const ranks = RANKS.slice(1).map(([r, km]) => `${r} at ${fmtMiles(km)}`).join(", ");
      $layer.innerHTML = sheetHtml("Your Pigeons", (S.birds.length
        ? `<div class="group mt-s">${S.birds.map((b) => row(b)).join("")}${S.birds.length < BIRDS_MAX ? cell({ act: "birdnew", icon: I.plus, tile: "green", label: "Name a New Pigeon", cls: "action" }) : ""}</div>
          <div class="gfoot">They take turns carrying what you send, and rest between flights. Miles bring rank: ${ranks}, once around the world.</div>`
        : `<div class="birdempty">${I.bird}<b>Name your pigeons</b><span>Give up to ${BIRDS_MAX} of your pigeons names. They take turns carrying what you send, gain miles and stamina, rise from Fledgling to Legend, and retire to your Hall of Fame.</span><button type="button" class="btn" data-act="birdnew">Name a Pigeon</button></div>`)
        + (S.hall.length ? `<div class="ghead">Hall of Fame</div><div class="group">${S.hall.map((b) => row(b, true)).join("")}</div>` : ""));
      return;
    }
    case "bird": {
      const b = [...S.birds, ...S.hall].find((x) => x.id === s.id); if (!b) { S.sheet = { type: "birds" }; return renderSheet(); }
      const active = !b.lostAt && !b.retiredAt, from = RANKS.find((r) => r[0] === b.rank)[1], rest = Math.round((0.5 - (0.4 * b.stamina) / 100) * 100);
      const stat = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
      $layer.innerHTML = sheetHtml("", `<div class="profile-head"><span class="birdbig tile wtile ${b.lostAt ? "gray" : RANK_TILE[b.rank]}">${I.bird}${active ? wearOn(b.wear) : ""}</span><span class="name">${esc(b.name)}</span>
          <span class="sub">${esc(b.rank)}${active ? ` · ${birdState(b)}` : b.lostAt ? " · Lost" : " · Retired"}</span></div>
        <div class="bstats">${stat(fmtMiles(b.km), "Flown")}${stat(b.flights, b.flights === 1 ? "Flight" : "Flights")}${stat(fmtMiles(b.longest), "Longest")}${stat(b.stamina, "Stamina")}</div>
        ${active && b.next ? `<div class="group"><div class="cell brank"><span class="ctext"><span>Next: ${esc(b.next.rank)}</span><span class="csub">${fmtMiles(b.next.km - b.km)} to go</span><i class="bbar" aria-hidden="true"><b></b></i></span></div></div>` : ""}
        <div class="gfoot">${b.lostAt ? `Lost${b.lostPlace ? ` over ${esc(b.lostPlace)}` : ""} on ${fmtDate(b.lostAt)}, to Pigeon Death.` : b.retiredAt ? `Retired to your Hall of Fame on ${fmtDate(b.retiredAt)}.`
          : `Stamina ${b.stamina}: after a flight it rests about ${rest}% as long as it flew. Stamina grows with every mile.`}</div>
        ${active ? `<div class="group mt">${cell({ act: "wearpick", id: b.id, icon: I.feather, tile: "yellow", label: "Wearing", val: b.wear && WEAR[b.wear] ? `${WEAR[b.wear][1]} ${esc(WEAR[b.wear][0])}` : "Nothing", chev: true })}</div>` : ""}
        ${active ? `<div class="group mt">${cell({ act: "birdrename", id: b.id, label: "Rename", cls: "action" })}${b.rank === "Legend" ? cell({ act: "birdretire", id: b.id, label: "Retire to the Hall of Fame", cls: "action" }) : ""}</div>
          ${b.rank === "Legend" ? `<div class="gfoot">${esc(b.name)} has flown once around the world. Retire it to your Hall of Fame to make room for a new pigeon.</div>` : ""}` : ""}`,
        { left: { label: "Back", act: "birds" }, name: b.name });
      const bar = $(".bbar b", $layer); if (bar && b.next) bar.style.width = `${(Math.max(0, Math.min(1, (b.km - from) / (b.next.km - from))) * 100).toFixed(1)}%`;
      return;
    }
    case "birdname": {
      if ($("#f-bname", $layer)) return;
      const b = s.id ? S.birds.find((x) => x.id === s.id) : null;
      $layer.innerHTML = sheetHtml(b ? "Rename" : "Name a Pigeon", `<form id="bname-form" data-form="birdname" novalidate>
          <div class="group mt-s"><label class="fcell"><input id="f-bname" name="name" placeholder="${b ? "New name" : "Biscuit, Captain, Pip…"}" maxlength="20" autocomplete="off" autocapitalize="words" aria-label="Pigeon name"></label></div>
          <div class="gfoot">${b ? "Its career stays as it is." : "It starts as a Fledgling."} Everyone it flies to sees its name.</div>${ferr}</form>`,
        { left: { label: "Back", act: "birdback" }, right: { label: b ? "Save" : "Add", form: "bname-form" } });
      if (b) $("#f-bname", $layer).value = b.name;
      return;
    }
    case "safety": {
      const f = personById(s.id), nm = esc(first(f?.name || "your friend")), ver = isVerified(f);
      $layer.innerHTML = sheetHtml("Safety Number", `
        <div class="profile-head">${avatar(f, "l")}<span class="name">${esc(first(f?.name || ""))}</span>${ver ? `<span class="verified">${I.check}Verified in person</span>` : ""}</div>
        ${f?.keyChanged ? "" : `<div class="safeqr"><div class="qrbox">${qrSvg(safetyCode(s.digits), { title: `Your safety number with ${nm}, as a QR code` })}</div></div>`}
        <div class="group mt-s"><div class="digits">${(s.digits || []).map((d) => `<span>${d}</span>`).join("")}</div></div>
        <div class="gfoot">${f?.keyChanged ? "" : `Together, scan each other’s code, or compare these 60 digits in person or on a call. `}If they match, only the two of you can read your messages. Not even the server could swap in a different key.</div>
        ${!f?.keyChanged ? `<div class="group mt">${ver ? cell({ act: "unverify", id: f.id, label: "Clear Verification", cls: "center destructive" })
          : `${cell({ act: "scansafe", id: f.id, icon: I.camera, tile: "blue", label: "Scan Their Code" })}${cell({ act: "verifyok", id: f.id, icon: I.check, tile: "green", label: "Mark as Verified", sub: "The 60 digits match on both phones" })}`}</div>` : ""}
        ${f?.keyChanged ? `<div class="warn sheetwarn"><span>${wasVerified(f) ? `You verified ${nm} in person, and their key has changed since. Don’t trust it until you’ve verified again, together.` : `${esc(first(f.name))}’s key changed. Only trust it once these digits match on both phones.`}</span></div>
          <div class="group mt">${cell({ act: "trustsafe", id: f.id, label: "They Match: Trust New Key", cls: "center action" })}</div>` : ""}`,
        { left: s.from ? { label: "Back", act: s.from, id: s.backId } : null });
      return;
    }
    case "scan": {
      const p = personById(s.id);
      if (!s.bad && S.scan?.on && S.scan.sheet === s && $(".scanbox video", $layer)) return;   // already scanning: a redraw leaves the camera be
      $layer.innerHTML = sheetHtml("Scan Their Code", `<div class="scanbox"><video playsinline muted autoplay aria-label="Camera"></video><span class="scanframe" aria-hidden="true"></span></div>
        <p class="gfoot scanmsg" aria-live="polite">${s.bad ? `This isn’t the same safety number. Don’t trust this chat with ${esc(first(p?.name || "them"))} until your codes match.` : `Point your camera at ${esc(first(p?.name || "your friend"))}’s code: Safety Number on their phone.`}</p>
        ${s.bad ? `<div class="group mt">${cell({ act: "scansafe", id: s.id, label: "Try Again", cls: "center action" })}</div>` : ""}`, { left: { label: "Back", act: "scanback" } });
      if (!s.bad) startScan(p, safetyCode(s.back?.digits));
      return;
    }
    case "security": {
      const u = S.me;
      $layer.innerHTML = sheetHtml("Privacy & Security", `<div class="group mt-s">
          ${cell({ icon: I.mail, tile: "blue", label: "Email", val: esc(u.email), sub: u.emailOk === false ? '<span class="warnc">Not confirmed yet</span>' : "" })}
          ${u.emailOk === false && S.emailOn ? cell({ act: "confirmsend", label: "Send Confirm Link Again", cls: "action" }) : ""}
          ${cell({ act: "encryptionsheet", icon: I.lock, tile: "green", label: "Encryption", val: "On", chev: true })}
          ${cell({ act: "passkeys", icon: I.key, tile: "indigo", label: "Passkeys", val: S.passkeys.length || (passkeysSupported() ? "Off" : ""), chev: true })}
          ${cell({ act: "changepw", icon: I.lock, tile: "gray", label: "Change Password", chev: true })}
          ${cell({ act: "sessionssheet", icon: I.phone, tile: "blue", label: "Signed-In Phones", chev: true })}
        </div>
        ${passkeysSupported() ? `<div class="ghead">This Phone</div>
        <div class="group">
          ${toggleCell({ act: "applock", icon: I.face, tile: "green", label: "Lock InFlight", sub: "Face ID, Touch ID or your passkey", on: !!lockPrefs() })}
          ${lockPrefs() ? `<label class="cell"><span class="ctext"><span>Lock</span></span><span class="val">${LOCK_AFTER.find(([ms]) => ms === (lockPrefs().after || 0))?.[1] || "Immediately"}</span>${chevSm}
            <select class="overlay" data-act="lockafter" aria-label="When to lock">${LOCK_AFTER.map(([ms, l]) => `<option value="${ms}"${ms === (lockPrefs().after || 0) ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
        </div>
        <div class="gfoot">${lockPrefs() ? "InFlight locks when you leave it, and hides your chats in the app switcher." : "Lock InFlight when you leave it. Unlocking happens on this phone, so it works with no signal too."}</div>` : ""}
        <div class="ghead">Privacy</div>
        <div class="group">
          ${toggleCell({ act: "privacy", id: "showOnline", icon: I.clock, tile: "green", label: "Show When I’m Online", on: u.showOnline !== false })}
          ${toggleCell({ act: "privacy", id: "receipts", icon: I.check, tile: "blue", label: "Read Receipts", on: u.receipts !== false })}
          ${toggleCell({ act: "privacy", id: "shareNews", icon: I.people, tile: "teal", label: "Share My News", sub: "New countries, ranks and streaks, and your loft, with your friends", on: u.shareNews !== false })}
          ${toggleCell({ act: "privacy", id: "approxLocation", icon: I.loc, tile: "blue", label: "Approximate Location", sub: "Keep your spot to about 10 km, not a mile", on: !!u.approxLocation })}
          ${toggleCell({ act: "privacy", id: "shareTracker", icon: I.globe, tile: "indigo", label: "Live Tracker", sub: "Your pigeons on the public map, with no names", on: u.shareTracker !== false })}
          ${cell({ act: "blockedsheet", icon: I.block, tile: "red", label: "Blocked", val: S.blocked.length || "None", chev: true })}
        </div>
        <div class="gfoot">Online, read receipts and news work both ways: turn one off and you won’t see other people’s either.</div>
        <div class="gfoot">The live tracker (chat.georgefarrowgreen.com/tracker, on a computer) shows pigeons in the air as rough dots: never a name, a message, a route, or anywhere near where one set off, stops or lands. A pigeon shows only if both you and your friend leave this on.</div>
        <div class="e2e">${I.lock}<span>End-to-end encrypted</span></div>`);
      return;
    }
    case "encryption":
      $layer.innerHTML = sheetHtml("Encryption", `
        <div class="group mt-s">
          ${cell({ icon: I.lock, tile: "green", label: "Your Encryption Key", sub: `<span class="mono">${S.fp.split(" ").slice(0, 4).join(" ")}<br>${S.fp.split(" ").slice(4).join(" ")}</span>` })}
          ${cell({ act: "safetylist", icon: I.shield, tile: "teal", label: "Safety Numbers", chev: true })}
        </div>
        <div class="e2e">${I.lock}<span>End-to-end encrypted</span></div>`, { left: { label: "Back", act: "securitysheet" } });
      return;
    case "safetylist":
      $layer.innerHTML = sheetHtml("Safety Numbers", S.friends.length
        ? `<div class="ghead">Choose a friend</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="safety" data-id="${esc(x.id)}" data-from="safetylist">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span></span>${chevSm}</button>`).join("")}</div>
          <div class="gfoot">Each friend has a safety number you can compare to check your messages are private.</div>`
        : `<p class="empty"><b>No friends yet</b>Safety numbers appear once you add a friend.</p>`,
        { left: { label: "Back", act: "encryptionsheet" } });
      return;
    case "newmsg":
      $layer.innerHTML = sheetHtml("New Message", S.friends.length
        ? `<div class="group mt-s">${cell({ act: "newgroup", icon: I.people, tile: "green", label: "New Group", cls: "action" })}</div>
          ${S.groups.length ? `<div class="ghead">Groups</div><div class="group">${S.groups.map((g) => `<button class="cell" data-act="open" data-id="${esc(g.id)}">${gavatar(g, "s")}<span class="ctext"><span class="one">${esc(g.name)}</span><span class="csub one">${g.members.length} people</span></span>${chevSm}</button>`).join("")}</div>` : ""}
          <div class="ghead">To</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="open" data-id="${esc(x.id)}">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span><span class="csub one">${esc(x.place || "No location")}${S.me.lat != null && x.lat != null ? ` · ${fmtDur(flightMs(haversineKm(S.me.lat, S.me.lon, x.lat, x.lon)))} by pigeon` : ""}</span></span>${chevSm}</button>`).join("")}</div>`
        : `<p class="empty"><b>No friends yet</b>Add a friend first.<br><button class="btn" data-act="addfriend">Add a Friend</button></p>`,
        { left: { label: "Cancel", act: "close" }, right: null });
      return;
    case "newgroup": case "groupadd": {
      // pick friends with a tick; a new group also gets a name
      const g = s.type === "groupadd" ? group(s.id) : null;
      const pool = S.friends.filter((x) => !g || !member(g, x.id)).sort((a, b) => a.name.localeCompare(b.name));
      const name = $("#f-gname", $layer)?.value ?? s.name ?? "";
      const old = $(".sheet .body", $layer), top = old ? old.scrollTop : 0;
      const rows = pool.map((x) => `<button type="button" class="cell pickrow" role="checkbox" aria-checked="${s.pick.has(x.id)}" data-act="gpick" data-id="${esc(x.id)}">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span><span class="csub one">${esc(x.place || "No location")}</span></span><span class="tickbox" aria-hidden="true">${I.check}</span></button>`).join("");
      const n = s.pick.size + (g ? g.members.length : 1);
      $layer.innerHTML = sheetHtml(g ? "Add People" : "New Group", `<form id="group-form" data-form="${g ? "groupadd" : "newgroup"}" novalidate>
          ${g ? "" : `<div class="group mt-s"><label class="fcell"><input id="f-gname" name="name" placeholder="Group name" maxlength="40" autocomplete="off" aria-label="Group name"></label></div>`}
          ${pool.length ? `<div class="ghead">${g ? "Your friends" : "Who’s in it"}</div><div class="group">${rows}</div>
            <div class="gfoot">${n > GROUP_MAX ? `Groups can have up to ${GROUP_MAX} people.` : `${n} ${n === 1 ? "person" : "people"}, including you. Everyone gets their own pigeon, flying the real distance to them. People in a group see each other’s names, but only friends see where each other are.`}</div>`
            : `<p class="empty"><b>${g ? "Everyone’s already here" : "No friends yet"}</b>${g ? "All your friends are in this group." : "Add a friend first."}</p>`}
          ${ferr}</form>`,
        { left: g ? { label: "Back", act: "groupinfo" } : { label: "Cancel", act: "close" }, right: s.pick.size && n <= GROUP_MAX ? { label: g ? "Add" : "Create", form: "group-form" } : null });
      if ($("#f-gname", $layer)) $("#f-gname", $layer).value = name;
      if (top) $(".sheet .body", $layer).scrollTop = top;
      return;
    }
    case "groupinfo": {
      const g = group(s.id); if (!g) { S.sheet = null; return renderSheet(); }
      const me = { ...S.me, id: S.me.id };
      const row = (p) => {
        const you = p.id === S.me.id, km = you ? null : memberKm(p);
        const sub = you ? "You" : p.friend ? `${esc(p.place || "No location")}${km != null ? ` · ${fmtDur(flightMs(km))} by pigeon` : ""}` : `Friend of ${esc(first(member(g, p.addedBy)?.name || "a member"))} · ${fmtDur(flightMs(km))} by pigeon`;
        // tap anyone for their safety number (friends of friends too)
        return you ? `<div class="cell">${avatar(me, "s")}<span class="ctext"><span class="one">${esc(first(p.name))}</span><span class="csub one">${sub}</span></span></div>`
          : `<button type="button" class="cell" data-act="safety" data-id="${esc(p.id)}" data-from="groupinfo" aria-label="${esc(first(p.name))}: safety number">${avatar(p, "s", p.friend)}<span class="ctext"><span class="one">${esc(first(p.name))}</span><span class="csub one">${p.keyChanged ? `<span class="keyw">${I.warn} Security key changed</span>` : sub}</span></span>${chevSm}</button>`;
      };
      const list = [S.me.id, ...others(g).sort((a, b) => memberKm(a) - memberKm(b)).map((p) => p.id)].map((id) => id === S.me.id ? { id, name: S.me.name } : member(g, id));
      $layer.innerHTML = sheetHtml("", `<div class="profile-head">${gavatar(g, "xl")}<span class="name">${esc(g.name)}</span><span class="sub">${g.members.length} people</span></div>
        <div class="ghead">People</div><div class="group">${list.map(row).join("")}
          ${g.members.length < GROUP_MAX ? cell({ act: "groupadd", id: g.id, icon: I.addp, tile: "green", label: "Add People", cls: "action" }) : ""}</div>
        <div class="gfoot">Only friends see where each other are. Anyone in the group can add their own friends. Tap someone for their safety number.</div>
        <div class="group mt">
          ${toggleCell({ act: "gmute", id: g.id, icon: I.moon, tile: "indigo", label: "Mute Notifications", sub: g.muted ? "No notifications or emails from this group" : "", on: g.muted })}
          ${cell({ act: "grouprename", id: g.id, icon: I.compose, tile: "gray", label: "Group Name", val: esc(g.name), chev: true })}
          ${cell({ act: "vanishask", id: g.id, icon: I.clock, tile: "indigo", label: "Disappearing Messages", val: g.vanish ? vanishSay(g.vanish.ms).replace(/^./, (c) => c.toUpperCase()) : "Off", chev: true })}
        </div>
        <div class="group mt">${cell({ act: "groupleaveask", id: g.id, label: "Leave Group", cls: "center destructive" })}</div>`, { name: `${g.name}: group info` });
      return;
    }
    case "gifs": {
      // built once; searching and loading more only touch the grid
      if (!$("#gif-q", $layer)) {
        $layer.innerHTML = sheetHtml("GIFs", `<label class="search gifsearch">${I.search}<input type="search" id="gif-q" placeholder="Search GIPHY" autocomplete="off" enterkeyhint="search" aria-label="Search GIFs"></label>
          <div class="gifgrid" role="group" aria-label="GIFs"></div><p class="giphy">Powered by GIPHY. Searches go through InFlight, so GIPHY doesn’t see who’s looking. What you send is end-to-end encrypted.</p>`,
          { left: { label: "Cancel", act: "close" }, right: null });
        $("#gif-q", $layer).value = s.q || "";
      }
      drawGifs();
      return;
    }
    case "flightlog": {
      const d = s.data;
      if (!d) { $layer.innerHTML = sheetHtml("Flight Log", `<p class="empty">Opening your flight log…</p>`); return; }
      const mi = d.km * 0.621371, lap = mi / 24901, hrs = d.hours;
      const tile = (val, label, sub = "") => `<div class="lstat"><b>${val}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
      const n = (x) => Math.round(x).toLocaleString("en-GB");
      const kinds = [...KINDS.map(([k]) => k), "dumb"].filter((k) => d.kinds[k]);
      const most = Math.max(1, ...kinds.map((k) => d.kinds[k]));
      $layer.innerHTML = sheetHtml("Flight Log", d.sent ? `
        <div class="loghero"><div class="globe" data-lap="${Math.min(1, lap % 1 || (lap >= 1 ? 1 : 0)).toFixed(3)}"><span>${lap >= 1 ? `${Math.floor(lap)}×` : `${Math.round(lap * 100)}%`}</span></div>
          <div class="ltext"><b>${n(mi)} mi</b><span>flown by your pigeons</span><small>${lap >= 1 ? `That’s ${lap.toFixed(1)} times around the world.` : `${Math.round(lap * 100)}% of the way around the world.`}</small></div></div>
        <div class="lstats">
          ${tile(n(d.sent), "Pigeons sent", d.flying ? `${d.flying} in the air now` : "")}
          ${tile(n(d.received), "Pigeons received")}
          ${tile(hrs >= 48 ? `${n(hrs / 24)} days` : `${n(hrs)} h`, "In the air", "landed pigeons, end to end")}
          ${tile(d.longest ? `${n(d.longest.km * 0.621371)} mi` : "–", "Longest flight", d.longest?.place ? `to ${esc(d.longest.place)}` : "")}
          ${tile(d.fastest ? `${n(d.fastest.kmh * 0.621371)} mph` : "–", "Fastest pigeon", d.fastest ? `a ${esc(KIND[d.fastest.kind]?.name.toLowerCase() || "")} pigeon` : "")}
          ${tile(d.tailwind ? `${n(d.tailwind * 0.621371)} mph` : "–", "Best tailwind")}
          ${tile(n(d.dodged || 0), "Storms dodged", "went around them")}
          ${tile(d.sheltered >= 1 ? `${n(d.sheltered)} h` : d.sheltered ? `${n(d.sheltered * 60)} min` : "–", "Sheltered", d.early ? `best wind: ${esc(fmtDur(d.early))} early` : "from storms")}
        </div>
        ${passportHtml(d.passport)}
        ${postmarksHtml(d.postmarks)}
        ${badgesHtml(d.badges || [])}
        ${skinsHtml(d.skins || [], S.me.skin)}
        ${kinds.length ? `<div class="ghead">By pigeon</div><div class="group">${kinds.map((k) => `<div class="cell has-icon kindrow"><span class="tile ${k === "dumb" ? "gray" : k}">${I.bird}</span><span class="ctext"><span>${KIND[k].name}</span><i class="kbar ${k}" data-w="${(d.kinds[k] / most).toFixed(3)}"></i></span><span class="val">${n(d.kinds[k])}</span></div>`).join("")}</div>` : ""}
        <div class="group mt">${cell({ icon: I.skull, tile: "red", label: "Lost to Pigeon Death", val: n(d.lost) })}${cell({ icon: I.homing, tile: "blue", label: "Called back", val: n(d.recalled) })}</div>
        <div class="gfoot">Since ${fmtDate(d.since)}. Worked out from distances and times only: what you wrote stays between you and your friends.</div>`
        : `<p class="empty"><b>No flights yet</b>Send your first pigeon and its miles start here.</p>${(d.skins || []).some((k) => k.season) ? skinsHtml(d.skins, S.me.skin) : ""}`);
      // sizes set from code (inline style attributes are blocked)
      $layer.querySelectorAll("[data-lap]").forEach((el) => el.style.setProperty("--lap", el.dataset.lap));
      $layer.querySelectorAll(".kbar[data-w], .bprog[data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w));
      return;
    }
    case "vianote": {
      if ($("#f-vianote", $layer)) return;
      const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), to = m && friend(m.finalTo);
      $layer.innerHTML = sheetHtml("Add a Line", `<form id="vianote-form" data-form="vianote" novalidate>
        <div class="group mt-s"><label class="fcell"><textarea id="f-vianote" rows="3" maxlength="200" placeholder="Say something to ${esc(first(to?.name || "them"))}" aria-label="Your line"></textarea></label></div>
        <div class="gfoot">It flies on with the pigeon, end-to-end encrypted: only ${esc(first(to?.name || "they"))} can read it, when it lands. You can add one line.</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Add", form: "vianote-form" } });
      return;
    }
    case "passport": {
      const d = s.data, left = s.back ? { label: "Back", act: "flightlogback" } : undefined;
      if (!d || !SHAPES) { $layer.innerHTML = sheetHtml("Passport", `<p class="empty">Opening your passport…</p>`, { left }); return; }
      if (s.drawn === d && $(".ppbook", $layer)) return ppFill($(".ppbook", $layer), d);          // (already open: just the pages near the one you're on)
      s.drawn = d;
      $layer.innerHTML = sheetHtml("Passport", passportBook(d), { left });
      const book = $(".ppbook", $layer);
      if (s.page) book.scrollLeft = s.page * book.clientWidth;
      ppFill(book, d);
      let tm = 0; book.addEventListener("scroll", () => { clearTimeout(tm); tm = setTimeout(() => ppFill(book, d), 60); }, { passive: true });
      return;
    }
    case "flysheet": {
      // How it flies: when it would land (up top), which pigeon, who carries it,
      // which way (and a picture of it), when it lands and where it stops
      const c = s.chat === S.chat ? composeState() : null;
      if (!c) { S.sheet = null; return renderSheet(); }
      const { g, f, t, sched, via, can, kind } = c, who = esc(first(g ? g.name : f.name));
      if (c.moon && !g) return drawLunarFly(c);
      const turn = g ? "Not your turn" : t.state === "outbound" ? "Yours is still on its way" : t.state === "inbound" ? `${who}’s is on its way` : `${who}’s turn first`;
      const when = (k) => (g ? landHint(c, k).replace(/^Lands/, "lands") : `lands ${atTime(sched ? sched.at : now() + plannedMs(c, k))}`);
      const style = routeStyle(), mapped = !g && !via && !sched && kind && kind !== "mystery" && kind !== "orbital" && f.lat != null && S.me.lat != null;
      const plans = mapped ? routePlanFor(f.id, kind)?.plans : null, plan = plans?.[style];
      // the top: when it lands, how long that is, where to, and the weather on the way
      const landAt = !kind || kind === "mystery" || g ? null : sched ? sched.at : now() + plannedMs(c, kind);
      const big = !kind ? "No pigeon free" : kind === "mystery" ? "Who knows when?" : g ? landHint(c, kind) : `Lands ${atTime(landAt)}`;
      const to = g ? `to ${esc(g.name)} · ${others(g).length + 1} people` : `to ${who}${f.place ? ` in ${esc(f.place)}` : ""}${S.me.lat != null && f.lat != null ? ` · ${plan?.km != null ? milesOf(plan.km, plan.legs) : fmtMiles(chatKm(f))}` : ""}`;      // (flown, and any stretch by ship)
      const adv = !g && kind && kind !== "dumb" && kind !== "orbital" && !sched && !via ? wxAdvice(f, kind) : null, wxNow = !g && S.wxPlan.get(f.id)?.d?.now;
      const sure = landAt ? landRange(landAt, now(), { wind: plan?.wind, legs: plan?.legs, sure: plan?.spread }) : null;          // (how sure that is)
      const wx = kind === "orbital" ? null : adv?.early ? ["early", I.wind, `${fmtDur(adv.early)} early on a tailwind`] : adv?.late ? ["late", I[(adv.wx && WX[adv.wx.k]?.[1]) || "storm"], `${fmtDur(adv.late)} late: ${adv.wx && WX[adv.wx.k] ? WX[adv.wx.k][0] : "rough weather"}`]
        : wxNow ? ["clear", I.sun, "Clear skies"] : null;
      const hero = `<div class="flyhero">${kind ? pg(kind, S.me.skin) : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}
        <span class="fht"><b class="fhbig">${esc(big)}</b><span class="flyto">${landAt && !sched && sure ? `likely ${esc(rangeText(sure))} · ` : ""}${landAt ? `in ${esc(fmtDur(landAt - now()))} · ` : ""}${to}</span>
        ${wx ? `<span class="fhwx ${wx[0]}">${wx[1]}${esc(wx[2])}</span>` : ""}</span></div>`;
      // the pigeons, each with a bar for how long it would take
      const most = Math.max(1, ...KINDS.map(([k]) => plannedMs(c, k) || 0));
      const kinds = KINDS.map(([k, name]) => {
        const left = S.me[k] || 0, next = S.me[k + "NextAt"];
        const sub = k === "standard" ? (sched ? "Can’t be booked ahead" : t.free ? `Free · ${when(k)}` : turn)
          : left ? `${left} left · ${when(k)}` : `None left${next ? ` · next in ${fmtDur(next - now())}` : ""}`;
        return `<button type="button" class="cell kc k-${k}" role="radio" aria-checked="${k === kind}" data-act="pigeon" data-id="${k}"${can[k] ? "" : " disabled"}>${pg(k, S.me.skin)}
          <span class="ctext"><span>${name}</span><span class="csub">${esc(sub)}</span><i class="kdur" data-w="${((plannedMs(c, k) || 0) / most).toFixed(3)}"></i></span><span class="val">${fmtDur(plannedMs(c, k))}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
      }).join("");
      const myLeft = S.me.mystery || 0, myNext = S.me.mysteryNextAt;
      const mystery = `<button type="button" class="cell kc" role="radio" aria-checked="${kind === "mystery"}" data-act="pigeon" data-id="mystery"${can.mystery ? "" : " disabled"}>${pg("mystery")}
          <span class="ctext"><span>Mystery</span><span class="csub">${esc(sched ? "Can’t be booked ahead" : myLeft ? "1 a day · any pigeon, any time" : `Used today${myNext ? ` · next in ${fmtDur(myNext - now())}` : ""}`)}</span></span><span class="val">?</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
      // by orbit: up, round the Earth, and down on the first pass near them (hours, however near or far)
      const orb = c.orbit ? ((ms) => `<button type="button" class="cell kc k-orbital" role="radio" aria-checked="${kind === "orbital"}" data-act="pigeon" data-id="orbital"${can.orbital ? "" : " disabled"}>${pg("orbital")}
          <span class="ctext"><span>Orbital</span><span class="csub">${esc(sched || via ? "Straight there, now" : S.me.orbital ? `${S.me.orbital} left · ${when("orbital")}` : `None left${S.me.orbitalNextAt ? ` · next in ${fmtDur(S.me.orbitalNextAt - now())}` : ""}`)}</span></span><span class="val">${fmtDur(ms)}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`)(etaMs(c, "orbital")) : "";
      const bd = kind ? birdFor() : null, busy = (b) => (b.state === "flying" ? "Flying" : b.state === "waiting" ? "Booked" : "Resting");
      const carriers = S.birds.length && kind ? `<div class="ghead">Carried By<button type="button" class="gmore" data-act="birds">Your Pigeons</button></div><div class="carriers chiprail" role="radiogroup" aria-label="Carried by">${S.birds.map((b) =>
        `<button type="button" class="cc" role="radio" aria-checked="${bd?.id === b.id}" data-act="birdset" data-id="${esc(b.id)}"${birdReady(b) ? "" : " disabled"}><span class="ccav" aria-hidden="true">${esc([...b.name][0] || "?")}</span><span><b>${esc(b.name)}</b><small>${birdReady(b) ? esc(b.rank) : busy(b)}</small></span></button>`).join("")}
        <button type="button" class="cc" role="radio" aria-checked="${!bd}" data-act="birdset" data-id="none"><span class="ccav any" aria-hidden="true">${I.bird}</span><span><b>Any Pigeon</b><small>No name</small></span></button></div>` : "";
      // which way: three to pick from, each with when it would land; then the way itself, as a line with its stops
      const route = via ? "" : `<div class="ghead">Route</div>${routeSeg(style, mapped && plans ? plansNow(now(), kind) : null)}${mapped ? "" : `<div class="gfoot">${esc(ROUTES.find((x) => x[0] === style)[2])}.</div>`}`;
      const way = !mapped ? "" : plan ? wayCard(plan, S.routePlan.data, style) : `<div class="waycard loading"><span class="wayhd"><b>See the Way</b></span><span class="wayline"><i></i></span><span class="waywords">Looking at the sky ahead…</span></div>`;
      // when it lands: as soon as it can, or a time worth a tap that it can make (it waits in your loft and leaves in time to land then), or another
      const chip = (act, id, on, b, small, off, av = "") => `<button type="button" class="cc" role="radio" aria-checked="${on}" data-act="${act}"${id != null ? ` data-id="${esc(String(id))}"` : ""}${off ? " disabled" : ""}>${av}<span><b>${b}</b><small>${small}</small></span></button>`;
      // by sea: a standard pigeon whose way crosses an ocean takes a ship, unless its sender's in a hurry
      const rd = mapped ? S.routePlan?.data : null, alone = rd?.noShip?.[kind]?.[style], shipped = rd?.kinds?.[kind]?.[style];
      const sh = shipped && shipOf(shipped.legs);
      const sea = alone && sh ? `<div class="ghead">By Sea</div><div class="carriers chiprail" role="radiogroup" aria-label="By sea">
          ${chip("shipset", "ship", !noShipOn(), "Take a Ship", `${esc(sh.from)} to ${esc(sh.to)} · ${esc(atTime(shipped.deliverAt + now() - rd.at))}`, false, `<span class="ccav when" aria-hidden="true">${I.ship}</span>`)}
          ${chip("shipset", "fly", noShipOn(), "Fly It All the Way", `No ships · ${esc(atTime(alone.deliverAt + now() - rd.at))}`, false, `<span class="ccav when" aria-hidden="true">${I.bird}</span>`)}</div>
          <div class="gfoot">${noShipOn() ? `In a hurry: it flies across ${esc(sh.sea)} itself, a long way with nowhere to land${S.me.risky ? ", and Pigeon Death’s odds go up" : ""}.` : `Too far to fly across ${esc(sh.sea)}, so it rides a ship. In a hurry? It can fly it all the way.`}</div>` : "";
      let landing = "", stop = "";
      if (!g) {
        const sk = schedKind(), ms = sk ? flightMs(chatKm(f), mySpeed(sk)) : 0, presets = schedPresets(), cur = sched?.at, other = cur && !presets.some(([, at]) => at === cur);
        landing = `<div class="ghead">When It Lands</div><div class="carriers chiprail" role="radiogroup" aria-label="When it lands">
          ${chip("schednow", null, !cur, "Soonest", kind && kind !== "mystery" ? esc(atTime(now() + plannedMs({ ...c, sched: null }, kind))) : "As soon as it can", false, `<span class="ccav when" aria-hidden="true">${I.bird}</span>`)}
          ${sk ? presets.filter(([, at]) => at - ms >= now() || cur === at).map(([label, at]) => chip("schedset", at, cur === at, esc(label), esc(atShort(at)))).join("") : ""}
          ${chip("schedule", null, !!other, other ? esc(atShort(cur)) : "Another Time", other ? "Your time" : sk ? "Pick one" : "Swift or faster", !sk, `<span class="ccav when" aria-hidden="true">${I.clock}</span>`)}</div>`;
        // a stop on the way: straight there, or with a friend you both have (and how much longer that takes)
        const mu = S.mutuals?.chat === f.id ? S.mutuals : null;
        if (!mu || now() - mu.at > 5 * MIN) loadMutuals(f.id);
        const pals = S.me.lat != null && f.lat != null ? (mu?.ids || []).map(friend).filter((p) => p?.lat != null).slice(0, 8) : [];
        if (pals.length || via) {
          const sp = mySpeed(kind && KIND[kind] ? kind : "standard"), direct = flightMs(chatKm(f), sp);
          const extra = (p) => flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, f.lat, f.lon), sp) - direct;
          stop = `<div class="ghead">Stop Over</div><div class="carriers chiprail" role="radiogroup" aria-label="Stop over">
            ${chip("viaclear", null, !via, "Straight There", "No stop", false, `<span class="ccav when" aria-hidden="true">${I.up}</span>`)}
            ${pals.map((p) => chip("viaset", p.id, via?.id === p.id, esc(first(p.name)), `${p.place ? `${esc(p.place)} · ` : ""}+${esc(fmtDur(Math.max(0, extra(p))))}`, false, avatar(p, "xs"))).join("")}</div>`;
        }
      }
      // (it plays in when it opens; redrawn for a new choice, only what changed moves)
      const old = $(".sheet .body", $layer), fresh = !$(".flyhero", $layer), top = old && !fresh ? old.scrollTop : 0;
      const rails = fresh ? [] : [...$layer.querySelectorAll(".sheet .chiprail")].map((r) => r.scrollLeft);
      const was = s.shown || {}, nowKey = { kind, style, land: landAt && Math.round(landAt / MIN) };
      const orbNote = kind === "orbital" ? (() => { const o = spaceFlight("orbital", asSent(endFor(S.me)), asSent(endFor(f)), now()); return `<div class="gfoot">It lifts off into orbit 250 miles up, goes round the Earth every 92 minutes at 17,000 mph, and comes down on the first pass near ${who}: ${((n) => `${n} lap${n === 1 ? "" : "s"}`)(Math.max(1, Math.round(o.laps)))} this time, then a gliding re-entry. Nearer isn’t quicker.</div>`; })() : "";
      $layer.innerHTML = sheetHtml("How It Flies", `${hero}<div class="group kinds" role="radiogroup" aria-label="Pigeon">${kinds}${mystery}${orb}</div>${orbNote}${kind === "orbital" ? "" : `${carriers}${landing}${stop}${route}${way}${sea}`}
        ${!carriers && (S.birds.length || S.hall.length) ? `<div class="group mt">${cell({ act: "birds", icon: I.bird, tile: "orange", label: "Your Pigeons", chev: true })}</div>` : ""}
        ${kind === "mystery" ? `<div class="gfoot">Your mystery pigeon could be anything from a rocket to a dumb one. You’ll find out as it takes off.</div>` : ""}
        ${c.moon && g ? `<div class="gfoot">${S.me.moon ? (worldOf(S.me) === "mars" ? "You’re on Mars, so every pigeon you send here goes as a laser pigeon, at the speed of light." : "You’re on the Moon, so every pigeon you send here goes as a lunar pigeon: about 3 days to Earth.")
          : others(g).filter((p) => p.onMoon).map((p) => `${esc(first(p.name))} is on ${worldOf(p) === "mars" ? "Mars: theirs goes as a laser pigeon, in minutes" : "the Moon: theirs goes as a lunar pigeon, about 3 days"}.`).join(" ")}</div>` : ""}
        ${S.me.risky ? `<div class="gfoot">Pigeon Death is on: 1.25× faster, but 1 in ${plan?.risk ? Math.round(1 / plan.risk.p) : style === "safe" && !via ? 200 : 100} is lost on the way${plan?.risk && riskWhy(plan.risk) ? ` (this way: ${esc(riskWhy(plan.risk))})` : ""}.</div>` : ""}`);
      const body = $(".sheet .body", $layer); body.classList.add("flysheet"); if (top) body.scrollTop = top;
      // the chip just tapped gives a little bounce
      if (S.flyTap) { const k = S.flyTap; S.flyTap = null; body.querySelector(`.chiprail [data-act="${k.dataset.act}"]${k.dataset.id ? `[data-id="${CSS.escape(k.dataset.id)}"]` : ""}`)?.classList.add("picked"); }
      body.querySelectorAll(".chiprail").forEach((r, i) => { r.scrollLeft = rails[i] || 0; const on = $("[aria-checked=true]", r); if (on && fresh) r.scrollLeft = Math.max(0, on.offsetLeft - 16 - (r.clientWidth - on.offsetWidth) / 3); });
      const entering = fresh || sheetEntering();         // (redrawn as it comes up: its rows keep growing, renderSheet keeps their place)
      body.classList.toggle("enter", entering);
      if (!entering && was.land !== nowKey.land) $(".flyhero", body).classList.add("chg");
      if (!entering && (was.style !== style || was.kind !== kind)) $(".waycard", body)?.classList.add("chg");
      s.shown = nowKey;
      flyBits(body, fresh ? null : was.style);
      return;
    }
    case "via": {
      const f = friend(s.chat); if (!f) { S.sheet = null; return renderSheet(); }
      const k = S.sendKind && S.sendKind !== "dumb" ? S.sendKind : "standard", sp = mySpeed(k), cur = S.via?.chat === s.chat ? S.via.id : null;
      const direct = flightMs(chatKm(f), sp);
      const rows = (s.ids || []).map(friend).filter(Boolean).map((p) => {
        const ms = p.lat == null || f.lat == null || S.me.lat == null ? null : flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, f.lat, f.lon), sp);
        return `<button type="button" class="cell${cur === p.id ? " on" : ""}${ms == null ? " dim" : ""}" ${ms == null ? "disabled" : `data-act="viapick" data-id="${esc(p.id)}"`}>${avatar(p, "s")}
          <span class="ctext"><span>${esc(p.name)}</span><span class="csub">${ms == null ? "No location set" : `${esc(p.place || "")}${p.place ? " · " : ""}lands in ${fmtDur(ms)} (+${fmtDur(Math.max(0, ms - direct))})`}</span></span>${cur === p.id ? I.check : ""}</button>`;
      }).join("");
      $layer.innerHTML = sheetHtml("Stop Over", s.ids == null ? (s.err ? loadFail(s.err, "via") : `<p class="empty">Finding friends you share…</p>`)
        : rows ? `<div class="group mt-s">${rows}</div><div class="gfoot">Your pigeon rests with them for an hour on the way. They can read it and add a line for ${esc(first(f.name))}, then it flies on.</div>
          ${cur ? `<div class="stack"><button type="button" class="btn wide plain" data-act="unvia">Fly Straight There</button></div>` : ""}`
        : `<p class="empty"><b>No friends in common</b>A stopover needs a friend you and ${esc(first(f.name))} both have.</p>`,
        { left: { label: "Cancel", act: "close" }, right: null });
      return;
    }
    case "schedule": {
      const f = friend(s.chat); if (!f) { S.sheet = null; return renderSheet(); }
      if ($("#f-landat", $layer)) return;           // built once, so a sync can't undo a half-picked time
      const k = schedKind(), ms = k ? flightMs(chatKm(f), mySpeed(k)) : 0, cur = schedFor(s.chat, null);
      const rows = schedPresets().map(([label, at]) => {
        const soon = !k || at - ms < now();
        return cell({ act: soon ? null : "schedpick", id: String(at), label, sub: soon && k ? `Too soon for a ${KIND[k].name.toLowerCase()} pigeon` : "", val: `${DOW[new Date(at).getDay()]} ${fmtTime(at)}`, cls: soon ? "dim" : cur?.at === at ? "on" : "" });
      }).join("");
      $layer.innerHTML = sheetHtml("When Should It Land?", `<form id="sched-form" data-form="schedule" novalidate>
        <div class="group mt-s">${rows}</div>
        <div class="group"><label class="cell fcell schedat"><span class="ctext"><span>Another Time</span></span><input type="datetime-local" id="f-landat" aria-label="When it lands"></label></div>
        <div class="gfoot">${k ? `It waits in your loft and takes off in time to land then. ${esc(first(f.name))} won’t know it’s coming until it takes off. A ${KIND[k].name.toLowerCase()} pigeon takes ${fmtDur(ms)} to get there.` : "Scheduled pigeons are swift or faster, and your lofts are empty."} Up to 30 days ahead.</div>${ferr}
        ${cur ? `<div class="stack"><button type="button" class="btn wide plain" data-act="unschedule">Send It Now Instead</button></div>` : ""}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Set", form: "sched-form" } });
      const inp = $("#f-landat", $layer);
      inp.min = localInput(now() + ms + MIN); inp.max = localInput(now() + 30 * DAY);
      inp.value = localInput(cur?.at ?? Math.max(now() + ms + HOUR, schedPresets()[0][1]));
      return;
    }
    case "grouprename": {
      const g = group(s.id); if (!g) { S.sheet = null; return renderSheet(); }
      if (!$("#f-gname", $layer)) {
        $layer.innerHTML = sheetHtml("Group Name", `<form id="gname-form" data-form="grouprename" novalidate>
          <div class="group mt-s"><label class="fcell"><input id="f-gname" name="name" placeholder="Group name" maxlength="40" autocomplete="off" aria-label="Group name"></label></div>
          <div class="gfoot">Everyone in the group sees the new name.</div>${ferr}</form>`,
          { left: { label: "Back", act: "groupinfo" }, right: { label: "Save", form: "gname-form" } });
        $("#f-gname", $layer).value = g.name;
      }
      return;
    }
    case "addfriend":
      if (!$("#add-h", $layer)) {
        $layer.innerHTML = sheetHtml("Add Friend", `<form id="add-form" data-form="add" novalidate>
            <div class="group mt-s"><label class="fcell"><span class="pre">@</span><input name="h" id="add-h" placeholder="their handle" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label="Friend’s handle"></label></div>
            <div class="addres" aria-live="polite"></div>
            <p class="gfoot add-msg" role="status">Type a friend’s handle, or let them scan your code.</p></form>
            <div class="addreqs"></div>
            <div class="ghead">Your code</div>
            <div class="mycode"><div class="qrbox">${qrSvg(myLink(), { title: "QR code for your add-a-friend link" })}</div>
              <b>@${esc(S.me.handle)}</b><span>A friend can scan this with their phone’s camera to add you.</span>
              <div class="row2"><button type="button" class="btn small" data-act="share">${I.up}Share Link</button><button type="button" class="btn small gray" data-act="copylink">Copy Link</button></div></div>`,
          { left: { label: "Cancel", act: "close" }, right: { label: "Send", form: "add-form" } });
        const i = $("#add-h", $layer); i.value = S.pendingAdd || ""; if (i.value) addLookup(); setTimeout(() => i.focus(), 300);
      }
      // requests, kept here too (they change as you accept, decline or cancel)
      { const rq = $(".addreqs", $layer), row = (p, inc) => `<div class="reqrow${inc ? " inc" : ""}">${avatar(p, "s")}<span class="ctext">${p.name ? `<span class="one">${esc(first(p.name))}</span><br><span class="csub">@${esc(p.handle)}</span>` : `<span class="one">@${esc(p.handle)}</span><br><span class="csub">Waiting for them to say yes</span>`}</span>
          <span class="acts">${inc ? `<button class="btn small gray" data-act="decline" data-id="${esc(p.id)}">Decline</button><button class="btn small" data-act="accept" data-id="${esc(p.id)}">Accept</button>` : `<button class="btn small gray" data-act="cancelreq" data-id="${esc(p.id)}">Cancel</button>`}</span></div>`;
        if (rq) rq.innerHTML = (S.incoming.length ? `<div class="ghead">Want to be your friend</div><div class="group">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "")
          + (S.outgoing.length ? `<div class="ghead">Sent</div><div class="group">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : ""); }
      return;
    case "whohas": {
      const g = group(S.chat), m = (S.msgs.get(S.chat) || []).find((x) => x.id === S.sheet.id);
      if (!g || !m?.flock) { S.sheet = null; return renderSheet(); }
      const c = flockCount(m), onMap = m.flock.some((x) => x.route);
      const status = (x) => {
        const st = whoState(x);
        return st === "read" ? `<span class="ws w-read">${I.check}Read ${esc(fmtShort(x.readAt))}</span>`
          : st === "landed" ? `<span class="ws w-landed">Landed ${esc(fmtShort(x.deliverAt))}</span>`
          : st === "fly" ? `<span class="ws w-fly"><span data-eta="${esc(x.deliverAt)}">${fmtDur(x.deliverAt - now())}</span> away</span>`
          : st === "lost" ? `<span class="ws w-lost">${I.skull}Lost</span>` : `<span class="ws w-back">${I.homing}Called back</span>`;
      };
      const rows = whoOrder(m).map((x) => { const p = member(g, x.to) || { name: "Someone" };
        return `<div class="cell whorow"><span class="who-av ${whoCls(x)}">${avatar(p, "s")}</span><span class="ctext"><span class="one">${esc(first(p.name))}</span>${x.toPlace ? `<span class="csub one">${esc(x.toPlace)}${x.km ? ` · ${fmtMiles(x.km + shipKm(x.legs))}` : ""}</span>` : ""}</span>${status(x)}</div>`; }).join("");
      const read = m.flock.filter((x) => x.readAt).length;
      $layer.innerHTML = sheetHtml("Who Has It",
        `<div class="whohead">${pgm(m)}<b>${m.flying ? `${c.landed} of ${c.n} landed` : `Landed for ${c.landed} of ${c.n}`}</b><span>${read ? `Read by ${read === c.n ? "everyone" : read}` : "Not read yet"}${m.flying && c.next ? ` · next lands in <span data-eta="${esc(c.next)}">${fmtDur(c.next - now())}</span>` : ""}</span>${whoDots(m)}</div>
        <div class="group">${rows}</div>
        ${onMap || m.flying ? `<div class="group mt">${onMap ? cell({ act: "map", id: m.id, icon: I.map, tile: "blue", label: m.flying ? "Watch on Map" : "See the Flights", chev: true }) : ""}${m.flying ? cell({ act: "recallask", id: m.id, label: "Call Them Back", cls: "center destructive" }) : ""}</div>` : ""}`);
      return;
    }
    case "requests": {
      const row = (p, inc) => `<div class="reqrow${inc ? " inc" : ""}">${avatar(p, "s")}<span class="ctext">${p.name ? `<span class="one">${esc(first(p.name))}</span><br><span class="csub">@${esc(p.handle)}</span>` : `<span class="one">@${esc(p.handle)}</span><br><span class="csub">Waiting for them to say yes</span>`}</span>
        <span class="acts">${inc ? `<button class="btn small gray" data-act="decline" data-id="${esc(p.id)}" aria-label="Decline ${esc(p.name)}">Decline</button><button class="btn small" data-act="accept" data-id="${esc(p.id)}" aria-label="Accept ${esc(p.name)}">Accept</button>`
          : `<button class="btn small gray" data-act="cancelreq" data-id="${esc(p.id)}" aria-label="Cancel request to @${esc(p.handle)}">Cancel</button>`}</span></div>`;
      $layer.innerHTML = sheetHtml("Friend Requests",
        (S.incoming.length ? `<div class="ghead">Waiting for you</div><div class="group">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "") +
        (S.outgoing.length ? `<div class="ghead">Sent</div><div class="group">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : "") +
        (S.incoming.length + S.outgoing.length ? "" : `<p class="empty"><b>All caught up</b>No friend requests right now.</p>`));
      return;
    }
    case "friendinfo": {
      if (!f) { S.sheet = null; return renderSheet(); }
      const km = S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : null;
      $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${esc(first(f.name))}</span><span class="sub">@${esc(f.handle)}</span></div>
        <div class="group mt">${cell({ act: "loft", id: f.id, icon: I.bird, tile: "indigo", label: `Visit ${esc(first(f.name))}’s Loft`, sub: "Their pigeons, badges and kit", chev: true })}</div>
        <div class="group mt">
          ${cell({ icon: f.moon ? I.moon : I.pin, tile: f.moon ? (worldOf(f) === "mars" ? "red" : "indigo") : "blue", label: f.moon ? `On ${BODIES[worldOf(f)].name}` : "Location", val: esc((f.place || "Not set").replace(/, (the Moon|Mars)$/, "")), sub: f.locAt ? `Updated ${agoText(f.locAt)}` : "" })}
          ${km != null ? cell({ icon: I.dist, tile: "teal", label: "Distance", val: fmtMiles(km) }) : ""}
          ${f.streak && (f.streak.n || f.streak.best >= 2) ? cell({ icon: I.flame, tile: "orange", label: "Flight Streak", val: f.streak.n ? `${f.streak.n} day${f.streak.n === 1 ? "" : "s"}` : "None now",
            sub: [f.streak.n && !f.streak.today ? `Send a pigeon in the next ${esc(streakLeft(f.streak))} to keep it` : "", f.streak.best >= 2 ? `Best: ${f.streak.best} days` : ""].filter(Boolean).join(" · ") }) : ""}
          ${f.seenAt ? cell({ icon: I.clock, tile: "green", label: "Last Online", val: isOnline(f) ? '<span class="on-now">Online now</span>' : fmtSeen(f.seenAt) }) : ""}
          ${moonChat(f) ? kindsFor(f).map((k) => cell({ icon: k === "laser" ? I.up : I.moon, tile: k === "laser" ? "red" : "indigo", label: `${KIND[k].name} Pigeon`, val: fmtDur(spaceMs(k, endFor(S.me), endFor(f))) })).join("")
            : km != null ? KINDS.slice().reverse().map(([k, name]) => cell({ icon: I.bird, tile: k, label: `${name} Pigeon`, val: fmtDur(flightMs(km, mySpeed(k))) })).join("") : ""}
        </div>
        <div class="group mt">${cell({ act: "safety", id: f.id, icon: I.shield, tile: "teal", label: "Safety Number", val: isVerified(f) ? "Verified" : "", chev: true })}
          ${cell({ act: "vanishask", id: f.id, icon: I.clock, tile: "indigo", label: "Disappearing Messages", val: f.vanish ? vanishSay(f.vanish.ms).replace(/^./, (c) => c.toUpperCase()) : "Off", chev: true })}</div>
        <div class="group mt">${cell({ act: "unfriendask", id: f.id, label: "Remove Friend", cls: "center destructive" })}${cell({ act: "blockask", id: f.id, label: `Block @${esc(f.handle)}`, cls: "center destructive" })}</div>`, { name: `${f.name}: contact info` });
      return;
    }
    case "loft": {
      if (!f) { S.sheet = null; return renderSheet(); }
      const L = s.data, who = esc(first(f.name)), back = { left: { label: "Back", act: "loftback" }, name: `${f.name}’s loft` };
      if (!L) { $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span></div><p class="empty">Opening the loft…</p>`, back); return; }
      if (L.error || L.private) { $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span></div>
        ${L.private ? `<p class="empty"><b>The loft is closed</b>${L.self ? "You don’t share your news, so lofts stay closed to you too. Turn on Share My News in Privacy &amp; Security to visit." : `${who} doesn’t share their news, so their loft stays private.`}</p>` : loadFail(L.error, "loft", s.id)}`, back); return; }
      const l = L.loft, mon = (t) => `${MON[new Date(t).getMonth()]} ${new Date(t).getFullYear()}`;
      const stat = (v, label) => `<div><b>${v}</b><span>${label}</span></div>`;
      const bird = (b) => `<div class="cell has-icon"><span class="tile wtile ${RANK_TILE[b.rank]}">${I.bird}${wearOn(b.wear)}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub">${esc(b.rank)}${b.wear && WEAR[b.wear] ? ` · wearing the ${esc(WEAR[b.wear][0].toLowerCase())}` : ""} · since ${mon(b.since)}</span></span></div>`;
      const hall = (b) => `<div class="cell has-icon"><span class="tile wtile ${b.lost ? "gray" : RANK_TILE[b.rank]}">${b.lost ? I.skull : I.bird}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub one">${esc(b.rank)} · ${b.lost ? `lost ${fmtDate(b.lost)}` : `retired ${fmtDate(b.retired)}`}</span></span></div>`;
      const badge = (b) => { const [icon, tint] = BADGE_LOOK[b.id] || ["bird", "gray"]; return `<div class="badge2 earned"><span class="bico tile ${tint}">${I[icon] || I.bird}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`; };
      const kit = [...l.kit.map((k) => `<span class="loftkit"><i aria-hidden="true">${k.emoji}</i>${esc(k.name)}</span>`), ...l.looks.map((k) => `<span class="loftkit">${pg("standard", k.id)}${esc(k.name)} look</span>`)];
      $layer.innerHTML = sheetHtml("", `<div class="profile-head lofthead">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span>
          <span class="sub">${l.skin && SKINS[l.skin] ? `${pg("standard", l.skin)} Flies ${esc(SKINS[l.skin].name)} pigeons · ` : ""}${l.since ? `Keeping pigeons since ${mon(l.since)}` : ""}</span></div>
        <div class="bstats">${stat(fmtMiles(l.km), "Flown")}${stat(l.landed.toLocaleString("en-GB"), l.landed === 1 ? "Landing" : "Landings")}${stat(l.countries, l.countries === 1 ? "Country" : "Countries")}${stat(l.postmarks, l.postmarks === 1 ? "Postmark" : "Postmarks")}</div>
        <div class="ghead">Pigeons${l.birds.length ? ` <span class="gcount">${l.birds.length}</span>` : ""}</div>
        ${l.birds.length ? `<div class="group">${l.birds.map(bird).join("")}</div>` : `<div class="gfoot">${who} hasn’t named any pigeons yet.</div>`}
        ${l.hall.length ? `<div class="ghead">Hall of Fame</div><div class="group">${l.hall.map(hall).join("")}</div>` : ""}
        ${l.badges.length ? `<div class="ghead">Achievements <span class="gcount">${l.badges.length}</span></div><div class="badges">${l.badges.map(badge).join("")}</div>` : ""}
        ${kit.length ? `<div class="ghead">Kit</div><div class="loftkits">${kit.join("")}</div>` : ""}
        <div class="gfoot mt">Where ${who}’s pigeons have been stays theirs: countries and postmarks are counted here, never named.</div>`, back);
      return;
    }
    case "sessions": {
      const list = s.list;
      const since = (at) => { const d = new Date(at); return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === new Date(now()).getFullYear() ? "" : ` ${d.getFullYear()}`}`; };
      $layer.innerHTML = sheetHtml("Signed-In Phones", !list ? (s.err ? loadFail(s.err, "sessionssheet") : `<p class="empty">Looking…</p>`) : `<div class="group mt-s">${list.map((x) => `<div class="cell has-icon"><span class="tile ${x.current ? "green" : "blue"}">${/^(Mac|Windows|Linux|Chromebook)/.test(x.label) ? I.laptop : I.phone}</span>
          <span class="ctext"><span>${esc(x.label)}</span><span class="csub">${x.current ? "This phone" : `Active ${esc(agoText(x.seenAt))} · since ${esc(since(x.createdAt))}`}</span></span>
          ${x.current ? "" : `<button class="link danger" data-act="sessend" data-id="${esc(x.id)}" aria-label="Sign out ${esc(x.label)}">Sign Out</button>`}</div>`).join("")}</div>
        ${list.length > 1 ? `<div class="group mt">${cell({ act: "sessothers", label: "Sign Out All Other Phones", cls: "center destructive" })}</div>` : ""}
        <div class="gfoot">If you don’t recognise one, sign it out and change your password.</div>`, { left: { label: "Back", act: "securitysheet" } });
      return;
    }
    case "blocked":
      $layer.innerHTML = sheetHtml("Blocked", S.blocked.length ? `<div class="group mt-s">${S.blocked.map((p) => `<div class="cell has-icon">${avatar({ name: p.name || p.handle }, "s", false, true)}<span class="ctext"><span>${esc(p.name || "@" + p.handle)}</span><span class="csub">@${esc(p.handle)}</span></span><button class="link" data-act="unblock" data-id="${esc(p.id)}" aria-label="Unblock @${esc(p.handle)}">Unblock</button></div>`).join("")}</div>
        <div class="gfoot">They can’t send you friend requests or pigeons, or see your picture or where you are. They aren’t told.</div>`
        : `<p class="empty"><b>No one blocked</b>Block someone from their friend request or their contact info. They aren’t told.</p>`, { left: { label: "Back", act: "securitysheet" } });
      return;
    case "view":
      $layer.innerHTML = `<div class="viewer" data-act="close" role="dialog" aria-label="Photo"><img src="${S.photos.get(s.id) || ""}" alt="Photo"><p>Decrypted on this phone. Tap to close.</p></div>`;
      return;
    case "moved": {
      // InFlight's new address, from its old one: in a browser it's one tap (the sign-in comes
      // too, pigeon/handover.js); a Home Screen app has its own storage, so it's a few steps
      const home = NEW_HOME.replace(/^https?:\/\//, ""), app = standalone(), ios = isIOS();
      const row = ([ic, tile, title, sub], i) => `<div class="wnrow" data-i="${i}"><span class="tile ${tile}" aria-hidden="true">${I[ic]}</span><span class="wnt"><b>${esc(title)}</b><small>${esc(sub)}</small></span></div>`;
      const rows = app ? [
        ["globe", "blue", `1. Open it in ${ios ? "Safari" : "your browser"}`, home],
        ["plus", "green", ios ? "2. Add it to your Home Screen" : "2. Install it", ios ? "Tap Share, then Add to Home Screen." : "From the browser’s menu: Install App, or Add to Home Screen."],
        ["key", "orange", "3. Sign in there", "With Face ID or your password. Your chats and pigeons come with you."],
        ["bell", "red", "4. Turn notifications on there", "Then delete this InFlight from your Home Screen."],
      ] : [
        ["check", "green", "Everything comes with you", "You’ll be signed in, with your chats, pigeons in flight and settings."],
        ["bell", "red", "Notifications move too", "Turn them on again there, from Account."],
      ];
      $layer.innerHTML = sheetHtml("", `<div class="wnhero"><span class="wnlogo" aria-hidden="true">${I.bird}</span><h2>InFlight Has Moved</h2><p>It now lives at <b>${esc(home)}</b></p></div>
        <div class="wnlist">${rows.map(row).join("")}</div>
        <div class="wnfoot stack"><a class="btn wide" href="${esc(NEW_HOME)}/"${app ? ` target="_blank" rel="noopener"` : ""} data-act="movego">${app ? `Open ${esc(home)}` : `Go to ${esc(home)}`}</a>
          ${app ? `<button type="button" class="btn wide plain" data-act="movecopy">Copy the Address</button>` : ""}
          <button type="button" class="btn wide plain" data-act="close">Not Now</button></div>`, { name: "InFlight Has Moved" });
      $layer.querySelectorAll(".wnrow").forEach((el) => el.style.setProperty("--i", el.dataset.i));
      return;
    }
    case "whatsnew": {
      // what's new: every release, newest first
      const list = RELEASES;
      const rows = (r) => `<div class="wnlist">${r.items.map(([ic, tile, title, sub], i) => `<div class="wnrow" data-i="${i}"><span class="tile ${tile}" aria-hidden="true">${I[ic] || I.bird}</span><span class="wnt"><b>${esc(title)}</b><small>${esc(sub)}</small></span></div>`).join("")}</div>`;
      $layer.innerHTML = sheetHtml("", `<div class="wnhero"><span class="wnlogo" aria-hidden="true">${I.bird}</span><h2>What’s New in InFlight</h2><p>Version ${APP_VERSION}</p></div>
        ${list.map((r) => `<div class="ghead">${esc(r.v)} · ${esc(r.title)}</div>${rows(r)}`).join("")}
        <div class="wnfoot"><button type="button" class="btn wide" data-act="close">Done</button></div>`, { name: "What’s New" });
      $layer.querySelectorAll(".wnrow").forEach((el) => el.style.setProperty("--i", el.dataset.i));
      return;
    }
    case "credits": {
      // where the weather, the heights and the maps come from, as their licences ask
      const out = (href, icon, tile, label, sub) => `<a class="cell has-icon" href="${href}" target="_blank" rel="noopener noreferrer"><span class="tile ${tile}">${icon}</span><span class="ctext"><span>${label}</span><span class="csub">${sub}</span></span>${chevSm}</a>`;
      $layer.innerHTML = sheetHtml("Map & Weather Data", `<div class="ghead">Weather</div>
        <div class="group">${out("https://open-meteo.com/", I.wind, "blue", "Open-Meteo", "Forecasts and the wind · CC BY 4.0")}
          ${out("https://api.met.no/", I.sun, "teal", "MET Norway", "When Open-Meteo can’t answer · CC BY 4.0")}</div>
        <div class="gfoot">Weather data by Open-Meteo.com and MET Norway, used under Creative Commons Attribution 4.0.</div>
        <div class="ghead">The Earth</div>
        <div class="group">${out("https://www.swpc.noaa.gov/products/planetary-k-index", I.compass, "indigo", "NOAA Space Weather", "Magnetic storms that put pigeons off course")}
          ${out("https://eonet.gsfc.nasa.gov/", I.volcano, "red", "NASA EONET", "Volcanoes and wildfires to fly around")}</div>
        <div class="gfoot">The planetary K index from NOAA’s Space Weather Prediction Center, and natural events from NASA’s Earth Observatory Natural Event Tracker: both US government data, free to use.</div>
        <div class="ghead">Mountains</div>
        <div class="group">${out("https://registry.opendata.aws/terrain-tiles/", I.dist, "green", "Terrain Tiles", "Heights for mountain passes · Mapzen and AWS")}</div>
        <div class="gfoot">Terrain Tiles bring together ETOPO1 and GMTED2010 (US government, public domain), SRTM (NASA), EU-DEM (produced using Copernicus data and information funded by the European Union) and other national elevation data. <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">All the sources</a></div>
        <div class="ghead">Maps</div>
        <div class="group">${out("https://www.naturalearthdata.com/", I.globe, "orange", "Natural Earth", "Coastlines, countries and places · public domain")}</div>
        <div class="ghead">GIFs</div>
        <div class="group">${out("https://giphy.com/", `<span class="gifico" aria-hidden="true">GIF</span>`, "indigo", "GIPHY", "Search and trending GIFs")}</div>
        <div class="gfoot">The maps and heights are kept on InFlight’s own server, and it asks for the weather, the Earth’s news and GIFs itself, so none of these see who you are.</div>`);
      return;
    }
    case "appearance":
      $layer.innerHTML = sheetHtml("Appearance", `<div class="group mt-s">
        ${THEMES.map((k) => `<button type="button" class="cell" role="radio" aria-checked="${theme() === k}" data-act="theme" data-id="${esc(k)}"><span class="ctext"><span>${THEME_NAMES[k]}</span></span>${theme() === k ? `<span class="val tick">${I.check}</span>` : ""}</button>`).join("")}
        </div>
        <div class="gfoot">${theme() === "auto" ? "Matches your phone’s Light or Dark setting. " : ""}Saved to your account, so it’s the same on every phone you sign in on.</div>
        <div class="group mt">${toggleCell({ act: "haptics", icon: I.bird, tile: "indigo", label: "Haptics", sub: "A tap of feedback when you send, react and switch", on: hapticsOn() })}</div>
        <div class="gfoot">On this phone. iPhone needs iOS 18 or later.</div>`);
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
          : `<p class="empty"><b>Not available</b>This browser can’t save passkeys.</p>`}`, { left: { label: "Back", act: "securitysheet" } });
      return;
    case "reauth":
      if (!$("#reauth-form", $layer)) $layer.innerHTML = sheetHtml("Confirm It’s You", `<p class="gfoot mt-s">For your safety, enter your password to carry on.</p>
        <form id="reauth-form" data-form="reauth" novalidate><div class="group mt-xs">${field("password", "Password", "password", "current-password")}</div>${ferr}</form>
        ${S.passkeys?.length && passkeysSupported() ? `<div class="group mt">${cell({ act: "reauthpk", icon: I.face, tile: "green", label: "Use a Passkey Instead", cls: "action" })}</div>` : ""}`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Confirm", form: "reauth-form" } });
      return;
    case "askpw":
      if (!$("#f-password", $layer)) $layer.innerHTML = sheetHtml("Link Passkey", `<p class="gfoot mt-s">Enter your password once so this passkey can also unlock your messages on a new phone.</p>
        <form id="askpw-form" data-form="askpw" novalidate><div class="group mt-xs">${field("password", "Password", "password", "current-password")}</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Link", form: "askpw-form" } });
      return;
    case "profile": {
      const u = S.me, wait = u.handleNextAt && u.handleNextAt > now() ? u.handleNextAt - now() : 0;
      // unsaved name and handle survive redraws and trips to Notifications or Privacy & Security
      const keep = $("#f-name", $layer) ? { name: $("#f-name", $layer).value, handle: $("#f-handle", $layer).value } : S.profileDraft;
      const old = $(".sheet .body", $layer), top = old && $("#profile-form", $layer) ? old.scrollTop : 0;
      $layer.innerHTML = sheetHtml("My Profile", `
        <div class="profile-head"><button type="button" class="avedit" data-act="avmenu">${S.avatarDraft ? `<span class="av xl" aria-hidden="true"><img src="${S.avatarDraft.url}" alt=""></span>` : avatar(u, "xl")}<span>${S.avatarDraft ? "New Photo" : u.avatarAt ? "Edit Photo" : "Add Photo"}</span></button></div>
        <form id="profile-form" data-form="profile" novalidate>
          <div class="ghead">Name</div><div class="group">${field("name", "Name", "text", "name")}</div>
          <div class="ghead">Handle</div><div class="group">${field("handle", "handle", "text", "username", "@")}</div>
          <div class="gfoot">${wait ? `You can change your handle once a day. Next change in ${fmtDur(wait)}.` : "Friends find you by your handle. You can change it once a day."}</div>${ferr}
        </form>
        <div class="gfoot mt">Your friends, and people you’ve sent a friend request to, can see your photo.</div>
        <div class="ghead">Location</div>
        ${u.moon ? ((w, d) => `<div class="group">
          ${cell({ icon: w === "mars" ? I.up : I.moon, tile: w === "mars" ? "red" : "indigo", label: `On ${BODIES[w].name}`, val: esc((u.place || "").replace(/, (the Moon|Mars)$/, "")), sub: d })}
          ${cell({ act: "moonpick", id: w, icon: I.pin, tile: w === "mars" ? "red" : "indigo", label: `Move on ${BODIES[w].name}`, chev: true })}
          ${cell({ act: "moonpick", id: w === "mars" ? "moon" : "mars", icon: w === "mars" ? I.moon : I.up, tile: w === "mars" ? "indigo" : "red", label: w === "mars" ? "Go to the Moon" : "Go to Mars", chev: true })}
        </div>
        <div class="gfoot">Only ${w === "mars" ? "laser" : "lunar"} pigeons reach you here. Your spot on Earth isn’t kept while you’re away.</div>`)(worldOf(u), worldOf(u) === "mars"
          ? ((c) => `${c.hm} there · ${c.day ? "sunset" : "sunrise"} in ${fmtDur(c.next - now())}`)(marsClock(u.moon.lon, now()))
          : ((d) => `${d.day ? "Daytime" : "Night"} · ${d.day ? "sunset" : "sunrise"} in ${fmtDur(d.next - now())} · ${earthPhase(now()).name} in the sky`)(lunarDay(u.moon.lat, u.moon.lon, now()))) + `
        <div class="ghead">Back to Earth</div>
        <div class="group">
          ${cell({ act: "locate", icon: I.loc, tile: "blue", label: "Use Current Location", cls: "action" })}
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
        </div>` : `<div class="group">
          ${cell({ icon: I.pin, tile: "blue", label: "Location", val: esc(u.place || "Not set"), sub: u.locAt ? `Updated ${agoText(u.locAt)}` : "" })}
          ${cell({ act: "locate", icon: I.loc, tile: "blue", label: "Use Current Location", cls: "action" })}
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
          ${toggleCell({ act: "autoloc", icon: I.loc, tile: "green", label: "Update Automatically", sub: "Every minute while InFlight is open", on: u.autoLocation })}
          ${cell({ act: "moonpick", id: "moon", icon: I.moon, tile: "indigo", label: "Go to the Moon", sub: "Only lunar pigeons fly there", chev: true })}
          ${cell({ act: "moonpick", id: "mars", icon: I.up, tile: "red", label: "Go to Mars", sub: "Only laser pigeons reach it, at the speed of light", chev: true })}
        </div>`}
        <div class="gfoot">${u.moon ? "Choosing somewhere on Earth brings you home." : "Pigeons fly from here, and pigeons already on their way to you follow when you move. Only your friends see it, and only to within about a mile."}</div>
        <div class="group mt">${cell({ act: "signout", label: "Sign Out", cls: "center destructive" })}</div>
        <div class="group mt">${cell({ act: "delask", label: "Delete Account", cls: "center destructive" })}</div>`,
        { left: { label: "Close", act: "close" }, right: { label: "Done", form: "profile-form" } });
      if (top) $(".sheet .body", $layer).scrollTop = top;
      $("#f-name", $layer).value = keep ? keep.name : u.name;
      $("#f-name", $layer).maxLength = 50;
      $("#f-handle", $layer).value = keep ? keep.handle : u.handle;
      if (wait) $("#f-handle", $layer).disabled = true;
      return;
    }
    case "moonpick": {
      // a spot on the Moon (near side or far) or Mars (east or west): tap the map, or pick a named place
      const body = s.body || "moon", mars = body === "mars", mine = worldOf(S.me) === body ? S.me.moon : null;
      const side = s.side || (mars ? (mine && mine.lon < 0 ? "west" : "east") : mine && farSide(mine.lon) ? "far" : "near"), mark = s.mark || mine || null;
      const name = mark ? siteName(mark.lat, mark.lon, body) : null, here = (x) => (mars ? (side === "west") === (x[2] < 0) : (side === "far") === farSide(x[2]));
      const SITES = BODIES[body].sites, world = BODIES[body].name;
      const chip = (act, id, on, b, small) => `<button type="button" class="cc" role="radio" aria-checked="${on}" data-act="${act}" data-id="${esc(id)}"><span><b>${esc(b)}</b><small>${esc(small)}</small></span></button>`;
      const ll = mark ? `${Math.abs(mark.lat).toFixed(1)}° ${mark.lat >= 0 ? "N" : "S"}, ${Math.abs(mark.lon).toFixed(1)}° ${mark.lon >= 0 ? "E" : "W"}` : "";
      const where = !mark ? "" : mars ? `${ll} · ${marsClock(mark.lon, now()).hm} there now` : `${ll} · ${farSide(mark.lon) ? "far side: Earth is never in the sky" : "near side: Earth hangs in the sky"}`;
      const sides = mars ? chip("moonside", "east", side === "east", "East", "Syrtis, Jezero, Hellas") + chip("moonside", "west", side === "west", "West", "Olympus, Valles")
        : chip("moonside", "near", side === "near", "Near Side", "Faces Earth") + chip("moonside", "far", side === "far", "Far Side", "Faces away");
      $layer.innerHTML = sheetHtml(`On ${world}`, `<div class="mpwrap"><canvas class="moonpick" role="img" aria-label="Map of ${world}, ${side} side. Tap where you’d like to be."></canvas>
          <div class="mpside carriers" role="radiogroup" aria-label="Side">${sides}</div></div>
        <div class="mpsel" aria-live="polite">${mark ? `<b>${esc(name)}</b><small>${esc(where)}</small>` : `<b>Tap ${esc(world)}</b><small>or choose a place below</small>`}</div>
        <div class="carriers chiprail" role="radiogroup" aria-label="Places">${SITES.filter(here).map((x) => chip("moonsite", x[0], name === x[0], x[0], ABOUT[x[0]] || (/^(Sea|Ocean)/.test(x[0]) ? "A dark lava plain" : mars ? "A plain" : "A crater"))).join("")}</div>
        <div class="sharego"><button type="button" class="btn wide" data-act="moonland"${mark ? "" : " disabled"}>${mars ? I.up : I.moon}${mine ? "Move Here" : "Land Here"}</button></div>
        <div class="gfoot">Your friends see you on ${esc(world)}, at this spot. While you’re there your spot on Earth isn’t kept, and Update Automatically is off. ${mars ? "Only laser pigeons reach you: at the speed of light, 3 to 22 minutes from Earth as the planets move." : "Only lunar pigeons reach you: about 3 days from Earth, or a day by Lunar Express."}</div>`,
        { left: { label: "Back", act: "profile" }, right: { label: "Close", act: "close" } });
      const cv = $(".moonpick", $layer);
      s.view = drawPick(cv, { body, side, mark, focus: name });
      cv.addEventListener("click", (e) => {
        const r = cv.getBoundingClientRect(), p = pickAt(s.view, e.clientX - r.left, e.clientY - r.top); if (!p) return;
        s.mark = p; haptic("tick"); renderSheet();
      });
      return;
    }
    case "changepw":
      if (!$("#f-current", $layer)) $layer.innerHTML = sheetHtml("Change Password", `<form id="pw-form" data-form="changepw" novalidate>
        <div class="group mt-s">${field("current", "Current password", "password", "current-password")}</div>
        <div class="group mt">${field("password", "New password", "password", "new-password")}</div>
        <div class="gfoot">At least 10 characters. Other phones signed in to your account will be signed out.</div>${ferr}</form>`,
        { left: { label: "Back", act: "securitysheet" }, right: { label: "Change", form: "pw-form" } });
      return;
  }
}
// How It Flies off the Earth: the space pigeons for it (two lunar ones to the Moon, a laser one to Mars),
// how far away it is today (its trip is as long as that), and what it does on the way
function drawLunarFly(c) {
  const { f, kind, can } = c, ks = c.kinds || [], who = esc(first(f.name)), a = endFor(S.me), b = endFor(f), t = now();
  const mars = ks.includes("laser"), same = a?.b === b?.b, ph = moonPhase(t);
  const km = same ? surfaceKm(a.b, a, b) : mars ? marsKm(t) : moonKm(t) - EARTH_R - MOON_R;      // (surface to surface, as the trip is measured)
  const landAt = kind ? t + etaMs(c, kind) : null, most = Math.max(...ks.map((k) => etaMs(c, k)));
  const where = same ? `across ${BODIES[a.b].name}` : !b || b.b === "earth" ? `in ${esc(f.place || "Earth")}` : `on ${BODIES[b.b].name}`;
  const chip = mars ? (same ? "By an orbiter overhead" : `Light takes ${fmtDur(lightMs(km))} to cross`) : same ? "No air, no wind, no weather" : `${ph.name} · ${((nf) => (nf ? nf[0].toUpperCase() + nf.slice(1) : "The Moon today"))(nearFar(moonKm(t)))}`;
  const hero = `<div class="flyhero">${kind ? pg(kind) : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}
    <span class="fht"><b class="fhbig">${kind ? `Lands ${esc(atTime(landAt))}` : "No space pigeon free"}</b><span class="flyto">${landAt ? `in ${esc(fmtDur(landAt - t))} · ` : ""}to ${who} ${where} · ${fmtMiles(km)}</span>
    <span class="fhwx clear">${mars ? I.up : I.moon}${esc(chip)}</span></span></div>`;
  const kinds = ks.map((k) => {
    const left = S.me[k] || 0, next = S.me[k + "NextAt"], ms = etaMs(c, k);
    const sub = left ? `${left} left · lands ${atTime(t + ms)}` : `None left${next ? ` · next in ${fmtDur(next - t)}` : ""}`;
    return `<button type="button" class="cell kc k-${k}" role="radio" aria-checked="${k === kind}" data-act="pigeon" data-id="${k}"${can[k] ? "" : " disabled"}>${pg(k)}
      <span class="ctext"><span>${KIND[k].name}</span><span class="csub">${esc(sub)}</span><i class="kdur" data-w="${(ms / most).toFixed(3)}"></i></span><span class="val">${fmtDur(ms)}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
  }).join("");
  const how = mars
    ? (same ? "There’s no seeing across a planet, so it goes up to an orbiter overhead and back down: there in under a second."
      : `A laser pigeon is a pulse of light: it crosses the ${fmtMiles(km)} between Earth and Mars in ${fmtDur(lightMs(km))}. As the planets go round the Sun that’s anything from 3 to 22 minutes.`)
    : same ? "There’s no air on the Moon to fly in, so it bounds across the surface in the low gravity, straight there."
    : `${b?.b === "moon" ? "It lifts off from Earth" : "It lifts off from the Moon"} and coasts the ${fmtMiles(km)} between, slowing as ${b?.b === "moon" ? "Earth’s pull holds it back, then speeding up as the Moon’s takes over" : "it climbs out of the Moon’s pull, then falling faster and faster towards Earth"}. The Moon swings between about 221,000 and 252,000 miles away over a month, so the trip is longer or shorter with it.`;
  const fresh = !$(".flyhero", $layer);
  $layer.innerHTML = sheetHtml("How It Flies", `${hero}<div class="group kinds" role="radiogroup" aria-label="Pigeon">${kinds}</div>
    <div class="gfoot">Only ${mars ? "laser pigeons reach Mars or leave it" : `lunar pigeons reach ${same ? "across the Moon" : "the Moon or leave it"}`}. They go any time, straight there: no stopovers, no booking ahead and no weather. ${esc(how)}</div>
    ${S.me.risky && !mars ? `<div class="gfoot">Pigeon Death is on: 1.25× faster, but 1 in 100 is lost in space.</div>` : ""}`);
  const body = $(".sheet .body", $layer); body.classList.add("flysheet"); body.classList.toggle("enter", fresh || sheetEntering());
  flyBits(body, null);
}
// each way's plan for a kind of pigeon as if it left now (the same clock as the card's)
function plansNow(t, kind) {
  const d = S.routePlan?.data, plans = kindPlans(d, kind) || d?.plans; if (!plans) return null;
  return Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, { ...p, deliverAt: p.deliverAt + (t - d.at) }]));
}
// The way it would go, before you send: the map, and a card like a flight's,
// with the three ways to switch between (the map redraws for each)
function tickPreview(card, cv) {
  const m = S.preview; if (!m || !card || !cv) return;
  const t = now(), go = (x) => x + (t - m.sentAt), k = kindOf(m);
  // as if it left now
  const live = { ...m, sentAt: t, deliverAt: go(m.deliverAt), legs: (m.legs || []).map((l) => [l[0], l[1], go(l[2]), ...l.slice(3)]) };
  const others = plansNow(t, m.pigeon) || {};
  live.alts = ROUTES.filter(([k]) => k !== m.style && others[k]).map(([k, name]) => ({ style: k, name, route: m.route, sentAt: t, deliverAt: others[k].deliverAt,
    legs: (others[k].legs || []).map((l) => [l[0], l[1], l[2] + (t - S.routePlan.data.at), ...l.slice(3)]) }));
  card.classList.add("fc", "pv");
  const from = esc(m.fromPlace || "?"), to = esc(m.toPlace || "?"), coin = pgm(m);
  const rows = [{ at: t, now: true, coin, title: `Leaves ${from}`, sub: `${milesOf(m.km, live.legs)} · the ${esc((ROUTES.find((x) => x[0] === m.style)?.[1] || "fastest").toLowerCase())} way` }];
  for (const e of fcEvents({ ...live, via: true }, t)) rows.push({ ...e, time: fcAt(e.at, true), title: esc(e.title), sub: esc(e.sub || "") });
  rows.push({ at: live.deliverAt, time: fcAt(live.deliverAt), dot: "end", title: `Lands in ${to}` });
  const name = KIND[k]?.name || "Standard";
  const html = `<span class="fchead"><span class="fccoin lg">${coin}</span><span class="fct"><span class="big">Lands ${esc(clockIn(live.deliverAt, MY_TZ))}</span><span class="fcs">if it left now · ${(() => { const r = landRange(live.deliverAt, t, { wind: m.wind, legs: live.legs }); return r ? `likely ${esc(rangeText(r))}` : `in ${esc(fmtDur(live.deliverAt - t))}`; })()}</span></span></span>
    ${routeSeg(m.style, plansNow(t, m.pigeon))}
    <ol class="fctl" aria-label="The way it would go">${rows.map(fcRow).join("")}</ol>
    <span class="fcwho"><span class="fcav pgk" aria-hidden="true">${coin}</span><span class="fct"><span class="fckind">${/^[AEIOU]/.test(name) ? "An" : "A"} ${esc(name.toLowerCase())} pigeon</span><span class="fcs">${milesOf(m.km, m.legs)}${m.risky ? " · Pigeon Death on" : ""}</span></span>${m.risky ? `<span class="fctags">${m.risk ? riskTag(m.risk).replace('<em class="rk', '<span class="fcchip risk rk').replace("</em>", "</span>") : `<span class="fcchip risk">1.25×</span>`}</span>` : ""}</span>`;
  const body = $(".mcb", card) || (card.innerHTML = `<div class="mcb"></div>`, $(".mcb", card));
  if (body._html !== html) {
    body.innerHTML = html; body._html = html;
    const tl = $(".fctl", card);
    [...tl.children].forEach((li, i) => li.style.setProperty("--i", i));
    fcFades(tl); if (!tl._f) { tl._f = 1; tl.addEventListener("scroll", () => fcFades(tl), { passive: true }); }
    segGlide(card, card._style); card._style = m.style;
  }
  drawMap(cv, live, card.offsetHeight + 14);
  fcAside(card);
}
function tickMap() {
  const s = S.sheet; if (!s || s.type !== "map") return;
  const m = s.id === "skies" || s.id === "preview" ? null : (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
  if (m && moonOf(m)) return tickMoon(m);
  const card = $(".mapcard", $layer), cv = $(".map", $layer);
  // only one pigeon's own card folds (The Skies and a group's flights keep theirs; the way before you send has one like it, unfolding)
  if (card?.classList.contains("fc") && (s.id === "skies" || m?.flock)) { card.classList.remove("fc", "fold", "swap", "pv"); $(".fcfold", card)?.remove(); const b = $(".mcb", card); if (b) b._html = ""; fcAside(card); }
  if (s.id === "skies") return tickSkies(card, cv);
  if (s.id === "preview") return tickPreview(card, cv);
  if (!m || !card || !(m.route || m.flock)) return;
  if (m.flock) return tickFlockMap(m, card, cv);
  // its way changed while the map was open (it turned for the weather, sheltered, or was cheered on): say so
  // (its shape: where it goes, not when; a cheer only speeds it up)
  const way = JSON.stringify((m.legs || []).filter((l) => l[3] !== "c" && l[3] !== "f").map((l) => [l[3], l[0], l[1]]));
  if (s.way != null && s.way !== way && !m.lost && m.deliverAt > now()) { const n = routeNote(m); toast(esc(n ? `Its way just changed: ${n.text[0].toLowerCase()}${n.text.slice(1)}.` : `Its way just changed: it now lands ${atTime(m.deliverAt)}.`)); haptic("tick"); }
  s.way = way;
  const { share, cheer } = cardShell(card), canShare = shareable(m);
  if (share.hidden === canShare) share.hidden = !canShare;
  share.dataset.id = m.id;
  cheerState(cheer, m);
  flightCard(card, m);
  drawMap(cv, m, card.offsetHeight + 14);
  smoothMap(m);
}
/* ---------- a pigeon to, from or across the Moon ----------
   No map of the Earth: the Earth and the Moon (or the Moon's surface) with
   the pigeon on its way, where it is now, and the moments of its trip. */
// its two ends, and the times of the one pigeon shown: { mn, sentAt, deliverAt, lost }
// (one that followed someone to another world: the leg it's on now, and `then`, the one still to come)
function moonOf(m) {
  const one = (mn, deliverAt, x) => { const L = legOf(mn, m.sentAt, deliverAt, now()); return { mn: L.mn, sentAt: L.from, deliverAt: L.to, then: L.then, endAt: deliverAt, lost: x.lost, lostAt: x.lostAt, recalled: !!x.recalled, km: x.km }; };
  if (m.moon) return one(m.moon, m.deliverAt, m);
  const fl = (m.flock || []).filter((x) => x.moon);
  if (!fl.length || fl.length !== (m.flock || []).length) return null;               // (a group's, all of them to or from the Moon)
  const x = fl.find((y) => y.to === S.moonWho?.[m.id]) || fl.find((y) => y.flying) || fl[0];
  return { ...one(x.moon, x.deliverAt, x), to: x.to, many: fl.length > 1 };
}
const MOON_ICON = { up: "up", globe: "globe", dot: "dot", dist: "dist", moon: "moon", check: "check", pin: "pin", fire: "fire" };
const TRIP_LABEL = { surface: "The pigeon bounding across the Moon", trip: "The pigeon on its way between the Earth and the Moon", laser: "A laser pigeon: a pulse of light between the worlds", orbit: "The pigeon’s path round the Earth in orbit" };
function drawMoonFlight(s, m) {
  const o = moonOf(m), mine = m.from === S.me.id, g = m.gid ? group(m.gid) : null;
  const other = g ? (mine ? member(g, o.to) : member(g, m.from)) : friend(mine ? m.to : m.from);
  const nm = (p) => (p?.id === S.me.id ? "You" : esc(first(p?.name || "Someone")));
  const flying = o.deliverAt > now() && !o.lost;
  if (!$(".moonsky", $layer)) {
    $layer.innerHTML = sheetHtml(flying ? "Pigeon in Flight" : "The Flight", `<canvas class="moonsky" role="img" aria-label="${esc(TRIP_LABEL[o.mn.k] || TRIP_LABEL.trip)}"></canvas>
      <div class="mooncard"><div class="mchead">${pg(kindOf(m))}<span class="mct"><b>${mine ? `To ${nm(other)}` : `From ${nm(other)}`}</b><small class="mcwhere"></small></span><span class="mceta"></span></div>
      ${o.many && mine && g ? `<div class="mcwho" role="group" aria-label="Whose pigeon">${m.flock.map((x) => `<button type="button" class="mcw" data-act="moonwho" data-id="${esc(m.id)}|${esc(x.to)}">${esc(first(member(g, x.to)?.name || "Someone"))}</button>`).join("")}</div>` : ""}
      <div class="mcnow"></div><div class="mcbar" aria-hidden="true"><i></i></div>
      <div class="mcplay"><input type="range" class="mcreplay" min="0" max="1000" step="1" aria-label="Replay the trip"><button type="button" class="mclive" data-act="moonlive">Live</button></div>
      <ol class="mcsteps"></ol>
      <div class="mcshare" hidden><button type="button" class="btn wide plain" data-act="shareflight" data-id="${esc(m.id)}">${I.share}Share Flight</button></div></div>`, { flush: true });
    $(".sheet .body", $layer).classList.add("moonbody");
    // scrub through the trip: the picture and where it was then (Live goes back to now)
    $(".mcreplay", $layer).addEventListener("input", (e) => { S.moonReplay = { id: m.id, f: Number(e.target.value) / 1000 }; tickMoon(m); });
  }
  tickMoon(m);
}
const placeOf = (e) => (e?.place ? e.place : e?.b === "moon" ? "the Moon" : e?.b === "mars" ? "Mars" : "Earth");
function tickMoon(m) {
  const cv = $(".moonsky", $layer); if (!cv) return;
  const o = moonOf(m), now0 = now(), end = o.lost ? Math.min(now0, o.lostAt || now0) : now0;
  const live = Math.max(0, Math.min(1, (end - o.sentAt) / (o.deliverAt - o.sentAt)));
  // replaying: any moment up to now (or the whole trip, once it's landed)
  const rp = S.moonReplay?.id === m.id ? Math.min(live, S.moonReplay.f) : null, f = rp ?? live, t = rp == null ? now0 : o.sentAt + f * (o.deliverAt - o.sentAt);
  drawTrip(cv, o.mn, f, t, { lost: o.lost && !o.recalled && rp == null });
  const card = $(".mooncard", $layer), place = (e) => (e?.place ? esc(o.mn.k === "surface" || (o.mn.k === "laser" && o.mn.relay) ? e.place.replace(/, (the Moon|Mars)$/, "") : e.place) : e?.b === "moon" ? "the Moon" : e?.b === "mars" ? "Mars" : "Earth");
  $(".mcwhere", card).innerHTML = `${place(o.mn.from)} to ${place(o.mn.to)}`;
  // a group's: whose is showing (each member's pigeon went its own way)
  if (o.many && m.gid) {
    const g = group(m.gid), mine = m.from === S.me.id;
    if (mine) $(".mct b", card).textContent = `To ${first(member(g, o.to)?.name || "Someone")}`;
    for (const b of card.querySelectorAll(".mcw")) { const on = b.dataset.id.endsWith("|" + o.to); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  }
  const eta = $(".mceta", card), landed = !o.lost && now0 >= o.deliverAt;
  sheetTitle(o.lost || now0 >= o.endAt ? "The Flight" : "Pigeon in Flight");
  eta.innerHTML = rp != null ? `<b>${esc(atShort(t))}</b><small>replay</small>` : o.recalled ? `<b>Called back</b>` : o.lost ? `<b class="lost">Lost</b>` : landed ? `<b>Landed</b><small>${esc(atShort(o.deliverAt))}</small>` : `<b>${esc(airTime(o.endAt - now0))}</b><small>lands ${esc(atShort(o.endAt))}</small>`;
  const nowEl = $(".mcnow", card);
  nowEl.textContent = rp != null ? spaceNow(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth).line
    : o.recalled ? "Called back: it turned for home."
    : o.lost ? (o.mn.k === "laser" ? "The signal was lost: Pigeon Death." : o.mn.k === "orbit" ? "It burnt up coming down: Pigeon Death." : o.mn.k === "trip" && o.mn.to.b === "earth" ? "It burnt up on the way home: Pigeon Death." : "Lost in space: Pigeon Death.")
    : landed ? (o.mn.k === "laser" ? `Crossed ${fmtMiles(Number(o.km || o.mn.dist || 0))} at the speed of light` : o.km ? `${o.mn.k === "surface" ? "Bounded" : "Flew"} ${fmtMiles(Number(o.km))}` : o.mn.k === "surface" ? "Bounded across, and landed." : "Landed safely.")
    : spaceNow(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth).line;
  $(".mcbar i", card).style.width = `${(f * 100).toFixed(2)}%`;
  const slider = $(".mcreplay", card); if (document.activeElement !== slider) slider.value = String(Math.round(f * 1000));
  $(".mclive", card).hidden = rp == null;
  $(".mcshare", card).hidden = !(rp == null && shareable(m));
  const steps = spaceMoments(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth), key = steps.map((x) => +x.done).join("") + (o.lost ? "l" : "") + (o.then ? "r" : "");
  // followed them to another world: where it was handed on, or relayed from, and where it's relayed on to
  const by = (k) => (k === "laser" ? "a laser pigeon" : `a ${KIND[k]?.name.toLowerCase() || "space"} pigeon`);
  if (o.mn.hand) steps.unshift({ at: o.sentAt, done: t >= o.sentAt, icon: "up", text: `${o.mn.rested ? "After its stopover, handed" : "Handed"} to ${by(o.mn.pk)}${o.mn.from?.place ? ` ${o.mn.rested ? "in" : "over"} ${o.mn.from.place}` : ""}: they’d left the Earth` });
  else if (o.mn.prev) steps.unshift({ at: o.sentAt, done: t >= o.sentAt, icon: "up", text: `Relayed on from ${placeOf(o.mn.from)} by ${by(o.mn.pk)}: they’d moved` });
  if (o.then) steps.push({ at: o.deliverAt, done: false, icon: o.then.pk === "laser" ? "up" : "moon", text: `${o.then.pk === "laser" ? "Relayed by laser" : `Handed to a ${KIND[o.then.pk]?.name.toLowerCase() || "space"} pigeon`} to ${placeOf(o.then.to)}, where they are now` });
  const ol = $(".mcsteps", card);
  if (ol.dataset.k !== key) {
    ol.dataset.k = key;
    ol.innerHTML = steps.filter((x) => !o.lost || x.at <= o.lostAt).map((x) => `<li class="${x.done ? "done" : ""}"><span class="mci">${I[MOON_ICON[x.icon]] || I.dot}</span><span class="mcs">${esc(x.text)}</span><time>${esc(atShort(x.at))}</time></li>`).join("");
  }
  clearTimeout(S.moonTimer);
  S.moonTimer = setTimeout(() => { if (S.sheet?.type === "map" && $(".moonsky", $layer)) tickMap(); }, 1000);
}
/* ---------- choosing the way: How It Flies and The Way ----------
   Fastest, Scenic or Safe as one sliding switch (each with when it would
   land), and the way it would go as a line with its stops on it. */
const ROUTE_SHORT = { fastest: "Quickest", scenic: "Landmarks", safe: "Rests on islands" };
function routeSeg(style, plans) {
  const i = ROUTES.findIndex((r) => r[0] === style);
  return `<div class="seg" role="radiogroup" aria-label="Route" data-i="${i}"><i class="segthumb" aria-hidden="true"></i>${ROUTES.map(([k, name, , icon]) =>
    `<button type="button" role="radio" aria-checked="${k === style}" data-act="routeset" data-id="${k}">${icon}<b>${name}</b><small>${plans?.[k] ? esc(k === style || !plans[style] ? atTime(plans[k].deliverAt) : segDelta(plans[k].deliverAt - plans[style].deliverAt)) : ROUTE_SHORT[k]}</small>${S.me.risky && plans?.[k]?.risk ? riskTag(plans[k].risk) : ""}</button>`).join("")}</div>`;
}
// the other ways, against the chosen one: "+12 min", "same time", "−5 min"
const segDelta = (d) => (Math.abs(d) < MIN ? "same time" : `${d > 0 ? "+" : "−"}${fmtDur(Math.abs(d))}`);
// Pigeon Death's odds on a way (with it on): "1 in 140", green when better than usual, red when worse
const riskLevel = (r) => (r.p <= 0.007 ? "lo" : r.p >= 0.013 ? "hi" : "mid");
const riskTag = (r) => `<em class="rk ${riskLevel(r)}">1 in ${Math.round(1 / r.p)}</em>`;
// and why: "a long sea crossing, falcons around the Bosphorus"
function riskWhy(r) {
  const why = [r.sea > 500 ? (r.sea > 1500 ? "a very long sea crossing" : "a long sea crossing") : "", r.storms ? "storms it can’t get around" : "", r.hawk ? `falcons around ${r.hawk}` : ""].filter(Boolean);
  return why.length ? why.join(", ") : "";
}
// the switch's thumb glides from the last choice to this one
function segGlide(root, fromStyle) {
  const seg = $(".seg", root); if (!seg) return;
  const th = $(".segthumb", seg), to = +seg.dataset.i, from = fromStyle ? ROUTES.findIndex((r) => r[0] === fromStyle) : to;
  th.style.setProperty("--i", from < 0 ? to : from);
  if (from < 0 || from === to || STILL.matches) return th.style.setProperty("--i", to);
  void th.offsetWidth; th.classList.add("glide"); th.style.setProperty("--i", to);
}
// See the Way: from here to there, with each storm, wind, pass, island and landmark where it comes
// nothing on the way: what that means for the way picked
const STRAIGHT = { fastest: "Straight there: nothing on the way worth going around", scenic: "Straight there: no landmark near enough to fly past", safe: "Straight there: no long sea to rest on the way across" };
function wayCard(plan, d, style) {
  const t0 = d.at, span = Math.max(1, plan.deliverAt - t0);
  let last = -1;
  const dots = fcEvents({ legs: plan.legs, via: true, near: [] }, t0 - 1).map((e) => {
    const x = Math.max(last + 0.07, Math.min(0.93, Math.max(0.07, (e.at - t0) / span))); last = x;
    return `<span class="waystop ${e.tone || ""}" data-x="${Math.min(0.93, x).toFixed(3)}">${e.icon}</span>`;
  }).join("");
  return `<button type="button" class="waycard" data-act="routepreview">
    <span class="wayhd"><b>See the Way</b><span class="waygo">${I.map}On the map</span></span>
    <span class="wayline" aria-hidden="true"><i class="wayend from"></i>${dots}<i class="wayend to"></i></span>
    <span class="wayends"><span><b>${esc(d.fromPlace || "Here")}</b>now</span><span><b>${esc(d.toPlace || "There")}</b>${esc(atTime(now() + plan.deliverAt - t0))}</span></span>
    <span class="waywords">${esc(wayWords(plan.legs) === "the straight way" ? STRAIGHT[style] || "Straight there" : wayWords(plan.legs).replace(/^./, (x) => x.toUpperCase()))}</span></button>`;
}
// sizes and places set from code (inline style attributes are blocked)
function flyBits(root, fromStyle) {
  root.querySelectorAll(".kdur[data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w));
  root.querySelectorAll(".waystop[data-x]").forEach((el, i) => { el.style.setProperty("--x", el.dataset.x); el.style.setProperty("--i", i); });
  root.querySelectorAll(".kinds .kc").forEach((el, i) => el.style.setProperty("--i", i));
  segGlide(root, fromStyle);
}
// the flight it would be, from the server's plan for that way (for the pigeon picked)
function previewFrom(style) {
  const c = composeState(), d = c?.f && c.kind && KIND[c.kind] ? routePlanFor(c.f.id, c.kind) : null, plan = d?.plans?.[style]; if (!plan) return null;
  return { id: "preview", preview: true, style, from: S.me.id, to: S.chat, pigeon: d.pigeon, skin: S.me.skin, route: [...d.from, ...d.to], legs: plan.legs, km: plan.km,
    sentAt: d.at, deliverAt: plan.deliverAt, fromPlace: d.fromPlace, toPlace: d.toPlace, flying: true, wind: plan.wind, risky: S.me.risky, risk: plan.risk };
}
/* ---------- A pigeon's map card ----------
   Folded, a slim bar over the map: how long it has left, where it is, and a
   cheer. Pulled up, the flight as a timeline: where it took off, what it does
   on the way (storms, wind, islands, passes, landmarks), where it is now, and
   where it lands. Tap or swipe the bar to switch; this phone keeps your choice.
   It springs between the two while the map re-fits around it, the rows rise
   in one after another, and the map's buttons step aside while it's up. */
const mapOpen = () => { try { return localStorage.getItem("inflight-mapcard") === "open"; } catch (_) { return false; } };
function mapFold(open) {
  try { localStorage.setItem("inflight-mapcard", open ? "open" : "fold"); } catch (_) {}
  const card = $(".mapcard.fc", $layer); if (!card) return;
  haptic("tick"); card._tl = 0;
  fcMorph(card, () => tickMap());
}
// redraw the card, then spring its height from the old to the new while the
// map follows it (the new side plays in once; the once-a-second redraws don't replay it)
function fcMorph(card, redraw) {
  const h0 = card.offsetHeight;
  card.classList.remove("swap", "morph"); card.style.height = ""; void card.offsetWidth;
  card.classList.add("swap"); clearTimeout(card._sw);
  redraw();
  const done = () => { card.classList.remove("swap", "morph"); card.style.height = ""; };
  if (STILL.matches) { card._sw = setTimeout(done, 50); return; }
  const h1 = card.offsetHeight;
  card.style.height = h0 + "px"; void card.offsetHeight;
  card.classList.add("morph"); card.style.height = h1 + "px";
  fcFollow(card, 650);
  card._sw = setTimeout(done, 760);
}
// keep the map fitted above the card while it changes size
function fcFollow(card, ms) {
  const cv = $(".map", $layer), end = performance.now() + ms;
  cancelAnimationFrame(fcFollow.raf);
  const step = () => {
    if (!cv?._m || !card.isConnected || S.sheet?.type !== "map") return;
    drawMap(cv, cv._m, card.offsetHeight + 14); fcAside(card);
    if (performance.now() < end) fcFollow.raf = requestAnimationFrame(step);
  };
  fcFollow.raf = requestAnimationFrame(step);
}
// the map's buttons step aside when the card comes up over them (and back when it folds)
function fcAside(card) {
  const top = card?.classList.contains("fc") ? card.offsetTop : Infinity;
  for (const el of $layer.querySelectorAll(".mapctl")) {
    const under = top < el.offsetTop + el.offsetHeight + 10;
    if (el.classList.contains("fcaside") !== under) { el.classList.toggle("fcaside", under); if (el.matches(".mapctl")) el.inert = under; }
  }
}
// drag the card: it follows your finger (stiffly the wrong way), and past a
// little way it opens or folds; let go short of that and it springs back
function fcDrag(card) {
  let st = null;
  card.addEventListener("touchstart", (e) => {
    const tl = e.target.closest(".fctl");
    st = card.classList.contains("fc") && e.touches.length === 1 && !(tl && tl.scrollHeight > tl.clientHeight + 1)
      ? { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now(), v: 0, dy: 0, dir: null } : null;
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dy = t.clientY - st.y, dx = t.clientX - st.x;
    if (!st.dir) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { st = null; return; }
      st.dir = "y"; card.classList.add("drag");
    }
    e.preventDefault();
    const now = performance.now(); st.v = (dy - st.dy) / Math.max(1, now - st.t); st.t = now; st.dy = dy;
    const open = !card.classList.contains("fold"), way = open ? dy > 0 : dy < 0;
    card.style.transform = `translateY(${(way ? dy * 0.5 : dy * 0.15).toFixed(1)}px)`;
  }, { passive: false });
  const end = () => {
    if (!st?.dir) { st = null; return; }
    const s = st; st = null;
    card.classList.remove("drag"); card.style.transform = "";
    const open = !card.classList.contains("fold");
    if (open ? s.dy > 60 || (s.dy > 20 && s.v > 0.5) : s.dy < -30 || (s.dy < -10 && s.v < -0.4)) mapFold(!open);
  };
  card.addEventListener("touchend", end); card.addEventListener("touchcancel", end);
}
const passName = (n) => (!n ? "a pass" : /^a |^[A-Z][\w’']*['’]s /.test(n) ? n : `the ${n}`);
// what happens on the way, in time order: [{ at, icon, tone, title, sub, until }]
function fcEvents(m, t) {
  const ev = [], legs = m.legs || [], tagged = legs.filter((l) => l[3] && l[3] !== "c" && l[3] !== "f"), once = new Set();
  for (let i = 0; i < tagged.length; i++) {
    const l = tagged[i], [tag, n, at] = [l[3], l[4], l[2]], done = at <= t;
    if ((tag === "i" || tag === "h" || tag === "t") && tagged[i + 1]?.[3] === tag && tagged[i + 1][0] === l[0]) {
      const until = tagged[i + 1][2], over = until <= t;
      // a breather: its named pigeon tires on a long flight (fewer, shorter ones as it rises through the ranks)
      if (tag === "t") { ev.push({ at, until, icon: I.bird, tone: "", title: `${over ? "Caught its breath" : done ? "Catching its breath" : "A breather"} ${n || "on the way"}`, sub: `${fmtDur(until - at)} on the ground${m.bird?.name ? ` · ${m.bird.name} needs it` : ""}` }); i++; continue; }
      ev.push(tag === "h" ? { at, until, icon: severeIcon(l[5]?.k), tone: "warn", title: `${over ? "Sheltered" : done ? "Sheltering" : "Shelters"} from ${SEVERE_WORD[l[5]?.k] || "storms"}${n ? ` ${n}` : ""}`, sub: `${over ? "Until" : "Until about"} ${clockIn(until, MY_TZ)}` }
        : { at, until, icon: I.bird, tone: "teal", title: `${over ? "Rested" : done ? "Resting" : "Rests"} on ${n || "an island"}`, sub: `${over ? "Until" : "Until about"} ${clockIn(until, MY_TZ)}` });
      i++; continue;
    }
    // by ship: boarding (and the voyage), then coming ashore; the lane's own points aren't rows
    if (tag === "b") {
      if (once.has("b")) continue; once.add("b");
      const sh = shipOf(legs); if (!sh) continue;
      const sailing = t >= sh.off, ashore = t >= sh.ashore;
      ev.push({ at: sh.board, until: sh.ashore, icon: I.ship, tone: "teal", title: `${ashore || sailing ? "Boarded" : done ? "Waiting for" : "Boards"} a ship at ${sh.from}`, sub: `Across ${sh.sea} · ${fmtDur(sh.ashore - sh.off)} at sea` });
      ev.push({ at: sh.ashore, icon: I.ship, tone: "teal", title: `${ashore ? "Came" : "Comes"} ashore at ${sh.to}`, sub: "And flies on from there" });
      continue;
    }
    // storms and wind once each: the first place it meets them (it may bend around them, or ride the wind, several times)
    if (tag === "s" || tag === "w" || tag === "o") { if (once.has(tag + (tag === "s" ? done : ""))) continue; once.add(tag + (tag === "s" ? done : "")); }
    const say = {
      s: [severeIcon(severeKOf(legs)), "warn", `${done ? "Went" : "Goes"} around ${severeOf(legs)}${n ? ` over ${n}` : ""}`, ""],
      w: [I.wind, "green", done ? "Rode the wind" : "Rides the wind", "A longer way, but quicker"],
      p: [I.map, "", `${done ? "Came through" : "Through"} ${passName(n)}`, "Over the mountains"],
      v: [I.loc, "teal", `${done ? "Flew past" : "Past"} ${n || "a landmark"}`, "For its postmark"],
      o: [I.waves, "teal", `${done ? "Followed" : "Follows"} the coast${n ? ` of ${n}` : ""}`, "Over land, rather than open sea"],
      m: [I.map, "", `${done ? "Flew" : "Flies"} over ${n || "the mountains"}`, "High enough not to need a pass"],
      r: [n === "s" ? severeIcon(l[5]?.k) : I.wind, "warn", n === "s" ? `Turned to keep clear of ${SEVERE_WORD[l[5]?.k] || "storms"}` : "Turned to ride the wind", "Changed course in the air"],
    }[tag];
    if (say) ev.push({ at, tag, icon: say[0], tone: say[1], title: say[2], sub: say[3] });
  }
  // it turned to follow someone who moved
  if (!m.via) for (const l of legs.filter((x) => !x[3])) {
    const who = m.to === S.me.id ? "you" : first(friend(m.to)?.name || "them");
    ev.push({ at: l[2], icon: I.loc, tone: "", title: "Changed course", sub: `To follow ${who}${who === "you" ? ": you moved" : ""}` });
  }
  // near misses, once each (a pair can be stored from both sides): "Passed Reuben's pigeon", "Overtook your pigeon to Nia"
  const met = new Set();
  for (const n of m.near || []) {
    if (met.has(n.other.id)) continue; met.add(n.other.id);
    const o = n.other, nm = (id) => first(personById(id)?.name || "a friend");
    const whose = o.from === S.me.id ? `your pigeon to ${nm(o.to)}` : `${nm(o.from)}’s pigeon`;
    const over = n.place && n.place !== "land" ? `Over ${n.place}` : "In mid-air";
    if (n.kind === "flock") {                                       // (they part where its next "f" point is)
      const parts = legs.find((l) => l[3] === "f" && l[2] > n.at)?.[2] ?? n.at;
      ev.push({ at: n.at, icon: I.people, tone: "teal", cls: "near flock", title: `${n.at > t ? "Flies" : parts > t ? "Flying" : "Flew"} with ${whose}`, sub: `${over} · 10% faster together` }); continue;
    }
    ev.push({ at: n.at, icon: I.pass, tone: "orange", cls: "near", title: n.kind === "overtake" ? (n.lead === "other" ? `Overtaken by ${whose}` : `Overtook ${whose}`) : `Passed ${whose}`, sub: over });
  }
  return ev.sort((a, b) => a.at - b.at);
}
// a row's time: "14:02", or "Mon" under it on another day ("~" when it's still to come)
function fcAt(ts, soon) {
  const c = clockIn(ts, MY_TZ), [, day, hm] = /^(?:(\S+) )?(\d\d:\d\d)$/.exec(c) || [, "", c];
  return `${soon ? "~" : ""}${hm}${day ? `<small>${day}</small>` : ""}`;
}
function fcRow(r) {
  return `<li class="${r.cls || ""}${r.done ? " done" : ""}${r.flown ? " flown" : ""}${r.now ? " now" : ""}">
    <span class="fcat">${r.now ? "Now" : r.time}</span>
    <span class="fcdot ${r.dot || "ev"} ${r.tone || ""}">${r.now ? r.coin : r.dot === "ev" || !r.dot ? r.icon || "" : ""}</span>
    <span class="fcwhat"><span class="fctitle">${r.title}</span>${r.sub ? `<span class="fcs">${r.sub}</span>` : ""}${r.extra || ""}</span></li>`;
}
// the sheet's title follows the flight (it opened "Pigeon in Flight"; once it's down, it's "The Flight")
function sheetTitle(text) { const h = $(".sheet header h2", $layer); if (h && h.textContent !== text) h.textContent = text; }
function flightCard(card, m) {
  const open = mapOpen(), t = m.lost ? m.lostAt : now(), left = m.deliverAt - now(), f = flightAt(m, t), k = kindOf(m);
  const landed = !m.lost && left <= 0, resting = restingOn(m), flew = m.deliverAt - m.sentAt, note = routeNote(m), wx = wxSay(m);
  if (S.sheet?.id === m.id) sheetTitle(m.lost || landed ? "The Flight" : "Pigeon in Flight");
  // the first time: it rises in a beat after the sheet
  if (!card.classList.contains("fc")) { card.classList.add("fc", "enter"); setTimeout(() => card.classList.remove("enter"), 900); }
  card.classList.toggle("fold", !open);
  if (!$(".fcfold", card)) card.insertAdjacentHTML("afterbegin", `<button type="button" class="fcfold" data-act="mapfold"><i></i></button>`);
  const fold = $(".fcfold", card), label = open ? "Fold the card away" : "Show the flight’s details";
  if (fold.getAttribute("aria-label") !== label) { fold.setAttribute("aria-label", label); fold.setAttribute("aria-expanded", String(open)); }
  const coin = m.recalled ? `<span class="homing">${I.homing}</span>` : m.lost ? `<span class="lostp">${I.skull}</span>` : pgm(m), from = esc(m.fromPlace || "?"), to = esc(m.toPlace || "?");
  const where = !m.lost && !landed && !resting ? esc(overWhere(...pigeonLL(m))) : "";
  const big = m.recalled ? "Called back" : m.lost ? "Lost on the way" : landed ? "Landed" : esc(fmtDur(left));
  const lands = landsLine(m).replace(/^Lands/, "lands");
  let html;
  if (!open) {
    // (folded, one line: just when it lands; the card pulled up has the likely range, and their time)
    const peek = `lands ${esc(clockIn(m.deliverAt, MY_TZ))}`;
    const sub = m.lost ? `${from} → ${to}` : landed ? `${from} → ${to} · flew ${esc(fmtDur(flew))}` : resting ? esc(note?.text || "Resting")
      : `${from} → ${to}${where ? ` · over <b>${where}</b>` : ""}`;
    html = `<span class="fcpeek"><span class="fccoin">${coin}</span><span class="fct"><span class="big">${big}${!m.lost && !landed ? `<small> · ${peek}</small>` : ""}</span><span class="fcs">${sub}</span></span></span>
      <span class="fcbar k-${k}${m.lost ? " lost" : ""}"><i></i></span>`;
  } else {
    const pill = m.lost ? "" : landed ? ["ok", `${I.check}Landed`] : resting ? (resting[2] === "h" ? ["warn", "Sheltering"] : resting[2] === "b" ? ["teal", "Waiting for a Ship"] : resting[2] === "sail" ? ["teal", "At Sea"] : resting[2] === "v" ? ["teal", "Stopover"] : ["teal", "Resting"])
      : f.phase === "up" ? ["ok", "Taking Off"] : f.phase === "down" ? ["ok", "Landing"] : ["tint", "In Flight"];
    const head = m.lost ? `${from} → ${to}` : landed ? `in ${to} · ${esc(fmtShort(m.deliverAt))}` : `to ${to} · <span class="lands">${lands}</span>`;
    // the rows: took off, what happens on the way, now, lands
    const rows = [{ at: m.sentAt, time: fcAt(m.sentAt), dot: "end", title: `Took off from ${from}`, sub: `${milesOf(m.km, m.legs)}${m.style ? ` · the ${esc((ROUTES.find((x) => x[0] === m.style)?.[1] || m.style).toLowerCase())} way` : ""}` }];
    for (const e of fcEvents(m, t)) rows.push({ ...e, time: fcAt(e.at, e.at > t), title: esc(e.title), sub: esc(e.sub || ""), now: !!(resting && e.until && e.at <= t && t < e.until) });
    const chips = [];
    if (!resting) chips.push(`<span class="fcchip speed">${esc(fmtMph(f.kmh))}</span>`);
    if (wx && !landed) chips.push(`<span class="fcchip wx ${wx.cls}">${wx.icon}${esc(wx.text)}</span>`);
    else if (m.wind != null && !landed) chips.push(`<span class="fcchip wind ${m.wind >= 3 ? "tail" : m.wind <= -3 ? "head" : ""}">${I.wind}${fmtWind(m.wind)}${Math.abs(m.wind) >= 3 ? ` · ${m.wind > 0 ? "faster" : "slower"} than usual` : ""}</span>`);
    chips.push(`<span class="fcchip dim">${Math.round(flownFrac(m, t) * 100)}% of the way</span>`);
    // (only what it's doing now: a turn for the weather, or a rest; the rest of its way has rows of its own)
    const said = note && /^(Rerouted|Sheltering|Resting on .* until|Waiting for a ship|At sea)/.test(note.text);
    const extra = `<span class="fcchips">${chips.join("")}</span>${said ? `<span class="waynote">${note.icon}${esc(note.text)}</span>` : ""}`;
    if (!m.lost && !landed) {
      const nr = rows.find((r) => r.now);
      if (nr) Object.assign(nr, { coin, extra });
      else rows.push({ at: t, now: true, coin, title: where ? `<span class="over">Over ${where}</span>` : esc(note?.text || "On its way"), extra });
    }
    if (m.recalled) rows.push({ at: t, time: fcAt(t), dot: "ev", icon: I.homing, title: "Called back", sub: m.from === S.me.id ? "You called it home" : "They called it home" });
    else if (m.lost) rows.push({ at: t, time: fcAt(t), dot: "ev", tone: "red", icon: I.skull, title: "Lost on the way", sub: m.risky ? "Pigeon Death was on" : "" });
    else rows.push({ at: m.deliverAt, time: fcAt(m.deliverAt), dot: "end", title: `${landed ? "Landed" : "Lands"} in ${to}`,
      sub: landed ? `Flew ${esc(fmtDur(flew))} · averaged ${esc(fmtMph(avgKmh(m)))}${stillMs(m) > HOUR ? " in the air" : ""}` : "", extra: landed && wx ? `<span class="wx ${wx.cls}">${wx.icon}${esc(wx.text)}</span>` : "" });
    rows.sort((a, b) => a.at - b.at || (a.now ? 1 : 0) - (b.now ? 1 : 0));
    rows.forEach((r, i) => { r.done = r.at <= t && !r.now; r.flown = !!rows[i + 1] && rows[i + 1].at <= t; });
    // anything else worth a line: who it flew over, cheers, the weather watch
    const notes = [flyText(m) ? `<span class="flyover">${I.wave}${esc(flyText(m))}</span>` : "",
      m.cheers ? `<span class="cheers">${I.wind}Cheered on ${m.cheers === 1 ? "once" : m.cheers + " times"} · ${esc(soonerText(m.cheerMs))} sooner</span>` : "",
      !m.lost && left > LIVE_LEFT ? `<span class="checked">${I.eye}Watching the weather ahead · checked ${m.liveAt ? agoText(m.liveAt) : "at take‑off"}</span>` : ""].join("");
    // who carries it (a named pigeon), or what kind of pigeon it is; and how it flies
    const b = m.bird, mine = b && m.from === S.me.id && b.id ? [...S.birds, ...S.hall].find((x) => x.id === b.id) : null;
    const tags = [b && k !== "standard" ? `<span class="fcchip k-${k}">${esc(KIND[k]?.name || k)}</span>` : "",
      m.style && m.style !== "fastest" ? `<span class="fcchip sty">${esc(ROUTES.find((x) => x[0] === m.style)?.[1] || m.style)}</span>` : "",
      m.noShip ? `<span class="fcchip sty">No Ships</span>` : "",
      m.risky ? `<span class="fcchip risk">1.25×</span>` : ""].join("");
    const who = b ? `<span class="fcav" aria-hidden="true">${esc([...b.name][0] || "?")}</span><span class="fct"><span class="birdline">Carried by ${esc(b.name)}${esc(wearWord(b.wear))}</span><span class="fcs">${esc(b.up || b.rank)}${mine?.km >= 1 ? ` · ${fmtMiles(mine.km)} in all` : ""}</span></span>`
      : `<span class="fcav pgk" aria-hidden="true">${coin}</span><span class="fct"><span class="fckind">${m.mystery ? "A mystery pigeon" : `${/^[AEIOU]/.test(KIND[k]?.name || "") ? "An" : "A"} ${esc((KIND[k]?.name || "standard").toLowerCase())} pigeon`}</span><span class="fcs">${milesOf(m.km, m.legs)}${m.risky ? " · Pigeon Death on" : ""}</span></span>`;
    html = `<span class="fchead" data-act="mapfold"><span class="fccoin lg">${coin}</span><span class="fct"><span class="big">${big}</span><span class="fcs">${head}</span></span>${pill ? `<span class="fcpill ${pill[0]}">${pill[1]}</span>` : ""}</span>
      <ol class="fctl" aria-label="The flight, start to finish">${rows.map(fcRow).join("")}</ol>${notes ? `<span class="fcnotes">${notes}</span>` : ""}<span class="fcwho">${who}${tags ? `<span class="fctags">${tags}</span>` : ""}</span>`;
  }
  const body = $(".mcb", card);
  if (body._html !== html) {
    const tl = $(".fctl", card), top = tl ? tl.scrollTop : 0;
    body.innerHTML = html; body._html = html;
    // the timeline keeps its place; opened, it starts at now (with a little of what came before)
    const tl2 = $(".fctl", card), nr = tl2 && $(".now", tl2);
    if (tl2) {
      [...tl2.children].forEach((li, i) => li.style.setProperty("--i", i));        // (each row a beat after the last, as they rise in)
      if (card._tl) tl2.scrollTop = top;
      else { card._tl = 1; if (nr) tl2.scrollTop = Math.max(0, nr.offsetTop - 22); }
      fcFades(tl2); if (!tl2._f) { tl2._f = 1; tl2.addEventListener("scroll", () => fcFades(tl2), { passive: true }); }
    }
  }
  const bar = $(".fcbar i", card); if (bar) bar.style.width = (flownFrac(m, t) * 100).toFixed(2) + "%";
  fcAside(card);
}
// the timeline fades out at an edge with more to scroll to
function fcFades(tl) {
  const up = tl.scrollTop > 2, down = tl.scrollTop + tl.clientHeight < tl.scrollHeight - 2;
  tl.classList.toggle("more-up", up); tl.classList.toggle("more-down", down);
}
/* ---------- In the air: every pigeon flying to or from you, at the top of Messages ----------
   One element that outlives re-renders (the list is redrawn on every sync), so
   cards keep their place, their scroll and their animations. Cards spring in,
   the pigeon on each track flaps along it, and on landing it hops onto a tick
   and the card folds away. */
let airEl = null, airQuiet = false;
const airKey = (r) => String(r.id);
// 4:29 under an hour (it ticks), then 1h 04m, then 2d 3h
function airTime(ms) {
  ms = Math.max(0, ms);
  if (ms >= DAY) return fmtDur(ms);
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h ${pad2(Math.floor((ms % HOUR) / MIN))}m`;
  return `${Math.floor(ms / MIN)}:${pad2(Math.floor((ms % MIN) / 1000))}`;
}
function airMount() {
  const slot = $(".airslot", $view); if (!slot) return;
  if (!airEl) {
    airEl = document.createElement("section");
    airEl.className = "air"; airEl.setAttribute("aria-label", "Pigeons in the air");
    airEl.innerHTML = `<div class="airin"><div class="airhead"><b>In the air<span class="airn"></span></b><span class="airnext"></span></div><div class="rail" role="group" aria-label="Pigeons in the air"></div></div>`;
    // the pigeons already up are simply there when the list first draws: the
    // strip doesn't grow open under it, and the cards don't fly in
    airQuiet = true; airSync(); airQuiet = false;
  }
  const rail = $(".rail", airEl), x = rail.scrollLeft;
  slot.replaceWith(airEl);
  rail.scrollLeft = x;
  airSync();
  if (!S.skiesAt || Date.now() - S.skiesAt > 20e3) loadSkies();
}
function airCard(r) {
  const el = document.createElement("button");
  el.type = "button"; el.className = `acard k-${kindOf(r)}${r.out ? " mine" : ""}`;
  el.dataset.act = "airopen"; el.dataset.id = r.chat; el.dataset.m = String(r.id).split(":")[0]; el.dataset.k = airKey(r);
  el.innerHTML = `<span class="awho">${r.g && !r.who ? gavatar(r.g, "xs") : avatar(r.who || { name: "?" }, "xs")}<span class="one"></span></span>
    <span class="aeta"><span class="acd">${airTime(r.deliverAt - now())}</span><span class="aok">${I.check}Landed</span></span>
    <span class="atrack"><i></i><span class="abird">${I.bird}</span></span>
    <span class="asub"></span>`;
  return airFill(el, r);
}
// what a card says (names arrive with the sync; a rerouted pigeon lands at a new time)
const spaceSub = (mn, from, at) => ((L) => spaceNow(L.mn, L.from, L.to, now(), whereOnEarth))(legOf(mn, from, at, now())).line.replace(/ · (\d[\d,]* mph|at the speed of light)$/, "").replace(/^Over /, "over ");
function airFill(el, r) {
  const who = r.label.split(" · ")[0], wx = wxSay(r, true);
  el.dataset.at = r.deliverAt; el.dataset.from = r.sentAt;
  el.setAttribute("aria-label", `${who}, ${r.out ? "your pigeon" : "on its way to you"}${r.g ? `, in ${r.g.name}` : ""}. Watch it on the map.`);
  $(".awho .one", el).textContent = who;
  const sub = $(".asub", el);
  sub.className = `asub${wx ? (r.delay > 0 ? " late" : " early") : ""}`;
  // yours: when it lands (and where, in a group); theirs: sealed till then
  // (out in space: where it is instead, "142,000 mi from Earth", "over France · lap 3")
  el._space = r.moon || null; el.classList.toggle("space", !!r.moon);
  sub.innerHTML = r.moon ? `${r.out ? "" : I.lock}${esc(spaceSub(r.moon, +el.dataset.from, +el.dataset.at))}` : wx ? esc(wx) : `${r.out ? "" : I.lock}lands ${esc(atShort(r.deliverAt))}`;
  return el;
}
// One card per chat: a group's pigeons, coming and going, share one card.
function airModels() {
  const t = now(), list = (skyRoutes(true) || []).filter((r) => r.deliverAt > t - 1500), out = [], groups = new Map();
  for (const r of list) {
    if (!r.g) { out.push({ k: airKey(r), r, at: r.deliverAt }); continue; }
    let m = groups.get(r.g.id);
    if (!m) { m = { k: "g:" + r.g.id, g: r.g, pts: [] }; groups.set(r.g.id, m); out.push(m); }
    if (r.out) m.out = true;
    m.pts.push({ id: airKey(r), at: r.deliverAt, from: r.sentAt, kind: kindOf(r) });
  }
  // your own pigeons to the group that have already landed still count, and so do the lost (grey, apart)
  for (const m of S.skies?.groups || []) {
    const gm = groups.get(m.gid); if (!gm || m.from !== S.me.id) continue;
    for (const x of m.flock || []) if (!x.flying && !gm.pts.some((p) => p.id === m.id + ":" + x.to))
      gm.pts.push({ id: m.id + ":" + x.to, at: x.lost ? x.lostAt || m.sentAt : x.deliverAt, from: m.sentAt, kind: kindOf(m), ...(x.lost ? { lost: x.recalled ? "back" : "lost", end: x.deliverAt } : {}) });
  }
  for (const m of groups.values()) m.at = airNext(m.pts, t);
  return out;
}
// when a group's next pigeon lands (or, once they all have, when the last did)
const airNext = (pts, t) => { const up = pts.filter((p) => !p.lost && p.at > t).map((p) => p.at); return up.length ? Math.min(...up) : Math.max(...pts.map((p) => p.at)); };
function airGroupCard(m) {
  const el = document.createElement("button");
  el.type = "button"; el.className = `acard grp${m.out ? " mine" : ""}`;
  el.dataset.act = "airopen"; el.dataset.id = m.g.id; el.dataset.m = ""; el.dataset.k = m.k;
  el.innerHTML = `<span class="awho">${gavatar(m.g, "xs")}<span class="one"></span></span>
    <span class="aeta"><span class="acd"></span><span class="aok">${I.check}Landed</span></span>
    <span class="atrack dots"></span>
    <span class="asub"></span>`;
  el._pts = [];
  return airGroupFill(el, m);
}
function airGroupFill(el, m) {
  // a pigeon that has landed and left the sky stays on the card, green
  const t = now(), ids = new Set(m.pts.map((p) => p.id));
  el._pts = [...m.pts, ...el._pts.filter((p) => !ids.has(p.id) && p.at <= t)];
  el.dataset.at = airNext(el._pts, t);
  $(".awho .one", el).textContent = m.g.name;
  return el;
}
// bring the cards in line with what's in the air
function airSync() {
  if (!airEl || S.view !== "messages") return;
  const rail = $(".rail", airEl), list = airModels();
  const want = new Map(list.map((m) => [m.k, m])), have = new Map([...rail.children].map((c) => [c.dataset.k, c]));
  // gone from the sky without landing (called back, or lost): it drops away
  for (const [k, c] of have) if (!want.has(k) && !c.classList.contains("landed") && !c.classList.contains("out")) {
    if (c._pts ? c._pts.every((p) => p.lost || p.at <= now()) && c._pts.some((p) => !p.lost) : +c.dataset.at <= now()) airLand(c); else { c.classList.add("lost"); airFold(c, 700); }
  }
  const atStart = rail.scrollLeft < 8;
  let i = 0;
  for (const m of list) {
    if (have.has(m.k)) { const c = have.get(m.k); if (!c.classList.contains("landed") && !c.classList.contains("out")) m.g ? airGroupFill(c, m) : airFill(c, m.r); continue; }
    if (m.g ? m.pts.every((p) => p.at <= now()) : m.at <= now()) continue;    // landed before we saw it
    const c = m.g ? airGroupCard(m) : airCard(m.r);
    c.style.setProperty("--i", i++);
    if (!airQuiet) {
      c.classList.add("enter");
      c.addEventListener("animationend", (e) => { if (e.animationName === "acard-in") c.classList.remove("enter"); });
    }
    // keep them in landing order
    const after = [...rail.children].find((x) => +x.dataset.at > m.at && !x.classList.contains("out"));
    rail.insertBefore(c, after || null);
  }
  if (atStart && i) rail.scrollLeft = 0;        // (scroll snapping would hold on to the card that was first)
  airTick();
}
// Soonest to land first. When that changes (a fresher copy, a group's next
// pigeon), the cards glide to their new places.
function airOrder(rail) {
  const live = [...rail.children].filter((c) => !c.classList.contains("out"));
  const sorted = [...live].sort((a, b) => +a.dataset.at - +b.dataset.at);
  if (sorted.every((c, i) => c === live[i])) return;
  const atStart = rail.scrollLeft < 8, was = new Map(live.map((c) => [c, c.getBoundingClientRect().left]));
  for (const c of sorted) rail.insertBefore(c, rail.querySelector(".acard.out"));
  if (atStart) rail.scrollLeft = 0;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const c of sorted) {
    const dx = was.get(c) - c.getBoundingClientRect().left;
    if (Math.abs(dx) > 1) c.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(.2,.9,.3,1)" });
  }
}
// A group card: each pigeon a dot along one line (nudged apart when they'd
// overlap), turning green with a pop as it lands.
function airDots(c, t) {
  const pts = c._pts, track = $(".atrack", c), n = pts.length;
  if (track.children.length !== n || [...track.children].some((d, i) => d.dataset.id !== pts[i].id))
    track.innerHTML = pts.map((p) => `<span class="adot ${p.kind}${p.lost ? " lost" : p.at <= t ? " done" : ""}" data-id="${esc(p.id)}"></span>`).join("");
  const gap = Math.min(0.1, 0.9 / Math.max(1, n)), fs = pts.map((p, i) => ({ i, f: Math.min(1, Math.max(0, p.lost ? (p.at - p.from) / Math.max(1, (p.end || p.at) - p.from) : (t - p.from) / Math.max(1, p.at - p.from))) })).sort((a, b) => a.f - b.f);
  fs.forEach((x, j) => { x.x = j ? Math.max(x.f, fs[j - 1].x + gap) : x.f; });
  for (let j = fs.length - 1; j >= 0; j--) fs[j].x = Math.min(fs[j].x, j === fs.length - 1 ? 1 : fs[j + 1].x - gap);
  let done = 0, lost = 0;
  for (const x of fs) {
    const d = track.children[x.i], p = pts[x.i], landed = !p.lost && p.at <= t;
    d.style.left = (Math.max(0, x.x) * 100).toFixed(2) + "%";
    if (p.lost) { lost++; d.classList.add("lost"); d.classList.remove("done"); continue; }
    if (landed) done++;
    if (landed && !d.classList.contains("done")) { d.classList.add("done", "pop"); setTimeout(() => d.classList.remove("pop"), 700); if (S.view === "messages" && !document.hidden) haptic("tick"); }
  }
  return { n, done, lost, back: lost > 0 && pts.every((p) => !p.lost || p.lost === "back"), next: pts.filter((p) => !p.lost && p.at > t).reduce((a, p) => Math.min(a, p.at), Infinity) };
}
function airLand(c) {
  if (c.classList.contains("landed")) return;
  c.classList.add("landed"); c.classList.remove("soon");
  setTimeout(() => c.classList.add("settled"), 1050);   // played once: a re-render mustn’t replay it
  if (S.view === "messages" && !document.hidden) haptic("success");
  airFold(c, 1900);
  setTimeout(() => sync(), 1150);                // the chat below shows what landed (once the tick has played)
}
function airFold(c, after) {
  setTimeout(() => {
    c.style.setProperty("--w", c.offsetWidth + "px");
    c.classList.add("out");
    setTimeout(() => { c.remove(); airTick(); }, 520);
  }, after);
}
// once a second: the countdowns, the pigeons along their tracks, and landings
function airTick() {
  if (!airEl) return;
  const t = now(), cards = [...$(".rail", airEl).children], flying = cards.filter((c) => !c.classList.contains("landed") && !c.classList.contains("out") && !c.classList.contains("lost"));
  let n = 0;
  for (const c of cards) {
    if (c._pts) {                                 // a group
      if (c.classList.contains("landed") || c.classList.contains("lost") || c.classList.contains("out")) continue;
      const g = airDots(c, t);
      const up = g.n - g.done - g.lost, gone = g.lost ? ` · ${g.lost} ${g.back ? "called back" : "lost"}` : "";
      $(".asub", c).textContent = `${g.done} of ${g.n} landed${gone}`;
      c.setAttribute("aria-label", `${$(".awho .one", c).textContent}: ${up} pigeon${up === 1 ? "" : "s"} in the air, ${g.done} landed${g.lost ? `, ${g.lost} ${g.back ? "called back" : "lost"}` : ""}. Open the chat.`);
      if (g.next === Infinity) { if (g.done) airLand(c); else { c.classList.add("lost"); airFold(c, 700); } continue; }
      n += up; c.dataset.at = g.next;
      $(".acd", c).textContent = airTime(g.next - t);
      c.classList.toggle("soon", g.next - t < 10 * MIN);
      continue;
    }
    const at = +c.dataset.at, from = +c.dataset.from, f = Math.min(1, Math.max(0, (t - from) / Math.max(1, at - from)));
    c.style.setProperty("--f", f.toFixed(4));
    if (c.classList.contains("landed") || c.classList.contains("lost")) continue;
    if (at <= t) { airLand(c); continue; }
    n++;
    $(".acd", c).textContent = airTime(at - t);
    if (c._space) { const sub = $(".asub", c), v = spaceSub(c._space, from, at); if (sub.textContent !== v) sub.lastChild ? (sub.lastChild.textContent = v) : (sub.textContent = v); }
    c.classList.toggle("soon", at - t < 10 * MIN);
    c.classList.toggle("final", at - t < MIN);
  }
  airOrder($(".rail", airEl));
  const next = flying.map((c) => +c.dataset.at).filter((x) => x > t).sort((a, b) => a - b)[0];
  airEl.classList.toggle("has", cards.length > 0);
  $(".airn", airEl).textContent = n ? ` · ${n}` : "";
  $(".airnext", airEl).textContent = next ? `Next lands in ${airTime(next - t)}` : cards.length ? "Landed" : "";
}

// The Skies: every pigeon in the air to or from you, from every chat.
let skiesLoading = null;
function loadSkies() { return (skiesLoading ||= loadSkies1().finally(() => { skiesLoading = null; })); }
async function loadSkies1() {
  try { S.skies = await api("skies"); S.skiesAt = Date.now(); if (S.sheet?.id === "skies") tickMap(); airSync(); }
  catch (err) { if (!S.skies && !err.offline) toast(esc(err.message)); S.skiesAt = Date.now(); }        // (tried: not again at once, and no banner on every redraw)
}
function skyRoutes(all) {
  const d = S.skies; if (!d) return null;
  const out = [];
  for (const m of d.pigeons) {
    const other = m.from === S.me.id ? m.to : m.from, f = friend(other);
    out.push({ ...m, chat: other, out: m.from === S.me.id, who: f, label: `${m.from === S.me.id ? "To" : "From"} ${first(f?.name || "a friend")}` });
  }
  for (const m of d.groups) {
    const g = group(m.gid); if (!g) continue;
    if (m.from === S.me.id) for (const x of m.flock || []) {
      if (!x.flying) continue;
      const p = member(g, x.to);
      out.push({ ...x, id: m.id + ":" + x.to, sentAt: m.sentAt, pigeon: m.pigeon, risky: m.risky, skin: m.skin, fromPlace: m.fromPlace, chat: g.id, out: true, who: p, g, label: `To ${first(p?.name || "someone")} · ${g.name}` });
    } else out.push({ ...m, chat: g.id, out: false, who: member(g, m.from), g, label: `From ${first(member(g, m.from)?.name || "someone")} · ${g.name}` });
  }
  return out.filter((r) => (all || r.deliverAt > now()) && !(r.lostAt && r.lostAt <= now())).sort((a, b) => a.deliverAt - b.deliverAt);
}
function tickSkies(card, cv) {
  if (!card || !cv) return;
  const list = skyRoutes();
  if (!list) { card.innerHTML = `<span class="speed">Looking up…</span>`; return; }
  const onMap = list.filter((r) => r.route), n = list.length, key = list.map((r) => r.id).join() || "-";
  if (card.dataset.k !== key) {           // rows only change when the list does (the times tick by themselves)
    card.dataset.k = key;
    const rows = list.map((r) => `<button type="button" class="frow skyrow" data-act="skyopen" data-id="${esc(r.chat)}">${r.g && !r.who ? gavatar(r.g, "xs") : avatar(r.who || { name: "?" }, "xs")}
        ${pgm(r)}<span class="one">${esc(r.label)}${r.route ? "" : ` <span class="hid">· not on map</span>`}</span><b><span data-eta="${esc(r.deliverAt)}">${fmtDur(r.deliverAt - now())}</span></b></button>`).join("");
    card.innerHTML = `<span class="big">${I.globe}<span>${n ? `${n} pigeon${n === 1 ? "" : "s"} in the air` : "Clear skies"}</span></span>
      ${n ? `<span class="speed">${list.filter((r) => r.out).length} yours, ${list.filter((r) => !r.out).length} coming to you</span>` : `<span class="speed">No pigeons are flying to or from you right now.</span>`}
      ${n ? `<span class="frows">${rows}</span>` : ""}`;
  }
  // nothing in the air: just your roost
  const here = S.me.lat != null ? [{ here: true, route: [S.me.lat, S.me.lon, S.me.lat, S.me.lon], sentAt: 0, deliverAt: 1, km: 0, fromPlace: S.me.place, toPlace: S.me.place }] : [];
  const skies = onMap.length ? onMap : here;
  if (skies.length) { drawMap(cv, { skies }, card.offsetHeight + 14); smoothMap({ skies, lost: true }); }
}

// Your message to a group: how far each pigeon has got.
// A map's card: its words (redrawn every tick) and its buttons, kept (one
// redrawn under a finger never gets its tap): cheer it on while it flies, share it once it lands.
function cardShell(card) {
  if (!$(".mcb", card)) card.innerHTML = `<div class="mcb"></div><button type="button" class="btn wide plain cheerbtn" data-act="cheer" hidden>${I.wind}<span></span></button><button type="button" class="btn wide shareflight" data-act="shareflight" hidden>${I.share}Share Flight</button>`;
  return { share: $(".shareflight", card), cheer: $(".cheerbtn", card) };
}
// Cheer it on: each cheer takes a little off the time it has left, up to three
// from each of you (twelve in all). Yours in the air, or the one flying to you.
const CHEER_EACH = 3, CHEER_MAX = 12;
function cheerable(m) {
  const t = now();
  if (m.flock) { const up = m.flock.filter((x) => x.flying && x.deliverAt - t > 60e3 && (x.cheers || 0) < CHEER_MAX); return { flying: m.flying, can: up.length > 0 && (m.cheered || 0) < CHEER_EACH, left: CHEER_EACH - (m.cheered || 0), them: true }; }
  const flying = m.flying && !m.waiting && !m.lost && !m.stopover && !(m.via && t < m.viaOff);
  return { flying, can: flying && m.deliverAt - t > 60e3 && (m.cheered || 0) < CHEER_EACH && (m.cheers || 0) < CHEER_MAX, left: CHEER_EACH - (m.cheered || 0) };
}
function cheerState(btn, m) {
  const c = cheerable(m), label = c.can ? `Cheer ${c.them ? "Them" : "It"} On${c.left < CHEER_EACH ? ` · ${c.left} left` : ""}` : (m.cheered || 0) >= CHEER_EACH ? "Cheered On" : "Nearly There";
  const key = `${c.flying}|${c.can}|${label}|${m.id}`;
  if (btn.dataset.k === key) return;
  btn.dataset.k = key; btn.dataset.id = m.id; btn.hidden = !c.flying; btn.disabled = !c.can; $("span", btn).textContent = label;
}
// "12 minutes", "1h 4m", "a few seconds"
const soonerText = (ms) => (ms < MIN ? "a few seconds" : ms < HOUR ? `${Math.round(ms / MIN)} minute${Math.round(ms / MIN) === 1 ? "" : "s"}` : fmtDur(ms));
function tickFlockMap(m, card, cv) {
  const g = group(S.chat), c = flockCount(m), end = Math.max(...m.flock.map((x) => x.deliverAt));
  const frac = Math.min(1, Math.max(0, (now() - m.sentAt) / Math.max(1, end - m.sentAt)));
  const rows = [...m.flock].sort((a, b) => a.deliverAt - b.deliverAt).map((x) => {
    const p = member(g, x.to), state = x.recalled ? `<span class="homing">${I.homing} Called back</span>` : x.lost ? `<span class="lostp">${I.skull} Lost</span>` : x.flying ? `<span data-eta="${esc(x.deliverAt)}">${fmtDur(x.deliverAt - now())}</span>` : "Landed";
    return `<span class="frow${x.flying ? " flying" : ""}">${avatar(p || { name: "?" }, "xs")}<span class="one">${esc(first(p?.name || "Someone"))}${x.route ? "" : ` <span class="hid">· not on map</span>`}</span><b>${state}</b></span>`;
  }).join("");
  const { share, cheer } = cardShell(card); share.hidden = true; cheerState(cheer, m);
  $(".mcb", card).innerHTML = `<span class="big">${pgm(m)}<span>${c.next ? `${c.landed} of ${c.n} landed` : c.lost === c.n ? "All lost" : `Landed for ${c.landed} of ${c.n}`}</span></span>
    ${c.next ? `<span class="speed">Next lands in ${fmtDur(c.next - now())}</span>` : ""}${birdLine(m)}
    <span class="prog k-${kindOf(m)}"><i>${I.bird}</i></span><span class="frows">${rows}</span>`;
  $(".prog i", card).style.width = (frac * 100).toFixed(2) + "%";
  if (routesOf(m).length) { drawMap(cv, m, card.offsetHeight + 14); smoothMap({ ...m, lost: true }); }
}
// The once-a-second tick is plenty for a slow pigeon, but taking off, landing
// or a fast short hop would judder, so then the map redraws ~30 times a second.
let mapAnim = 0, mapAnimAt = 0;
function smoothMap(m) {
  if (mapAnim || STILL.matches) return;
  const f = flightAt(m), moving = !m.lost && f.phase !== "landed" && !(f.phase === "cruise" && m.deliverAt - m.sentAt > HOUR);
  mapAnim = requestAnimationFrame(function step(ts) {
    mapAnim = 0;
    if (S.sheet?.type !== "map" || document.hidden) return;
    const cv = $(".map", $layer);
    if (ts - mapAnimAt < 30) { mapAnim = requestAnimationFrame(step); return; }
    mapAnimAt = ts;
    if (moving) return tickMap();       // it visibly moves: redraw it all (tickMap calls back here)
    if (!cv?._birds?.some((b) => b.phase !== "landed" && b.phase !== "lost") && !(windOn() && S.windGrid)) return;
    if (mapMoving()) fastFrame(cv); else drawBirds(cv, ts);
    mapAnim = requestAnimationFrame(step);   // just the wings
  });
}
function setProgress(el) {
  el.querySelectorAll("i[data-from]").forEach((e) => { const a = +e.dataset.from, b = +e.dataset.to; e.style.width = (Math.min(1, Math.max(0, (now() - a) / (b - a))) * 100).toFixed(1) + "%"; });
}
function live() {
  if (document.hidden) return;                       // nothing to see: nothing to redraw
  const r = root();
  r.querySelectorAll("[data-eta]").forEach((e) => { const v = fmtDur(+e.dataset.eta - now()); if (e.textContent !== v) e.textContent = v; });
  r.querySelectorAll("[data-clock]").forEach((e) => { const c = clockIn(now(), e.dataset.clock); if (e.textContent !== c) e.textContent = c; });
  setProgress(r);
  if (S.view === "messages") airTick();
  if (S.view === "chat") renderCompose();
  tickMap();
}

/* ---------- menus, action sheets and banners ---------- */
// iOS-style context menu anchored to a button. items: {label, sub, icon, act, id, destructive}
function openMenu(anchor, items) {
  haptic("tick");
  clearTimeout(popTimer);
  const box = root().getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const up = a.top - box.top > box.height * 0.55;
  const right = a.left + a.width / 2 > box.left + box.width / 2;
  $pop.innerHTML = `<div class="menu-scrim" data-act="closepop"></div>
    <div class="menu-pop" role="menu">${items.map((it) =>
      `<button class="mi${it.destructive ? " destructive" : ""}${it.sub ? " two" : ""}" role="menuitem" data-act="${it.act}"${it.id ? ` data-id="${esc(it.id)}"` : ""}><span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</span>${it.icon || ""}</button>`).join("")}</div>`;
  const m = $(".menu-pop", $pop);
  if (up) m.style.bottom = `${box.bottom - a.top + 6}px`; else m.style.top = `${a.bottom - box.top + 6}px`;
  if (right) m.style.right = `${Math.max(8, box.right - a.right)}px`; else m.style.left = `${Math.max(8, a.left - box.left)}px`;
  m.style.setProperty("--origin", `${up ? "bottom" : "top"} ${right ? "right" : "left"}`);
}
function openActions({ title, message, actions }) {
  clearTimeout(popTimer);
  $pop.innerHTML = `<div class="scrim" data-act="closepop"></div><div class="asheet" role="dialog" aria-label="${esc(title || "Confirm")}">
    <div class="grp">${title || message ? `<div class="msg">${title ? `<b>${esc(title)}</b>` : ""}${esc(message || "")}</div>` : ""}${actions.map((x) =>
      `<button class="ab${x.destructive ? " destructive" : ""}" data-act="${x.act}"${x.id ? ` data-id="${esc(x.id)}"` : ""}>${esc(x.label)}</button>`).join("")}</div>
    <button class="cancel" data-act="closepop">Cancel</button></div>`;
}
let popTimer = 0;
function closePop() {
  if (!$pop || !$pop.firstElementChild) return;
  const live = $pop.querySelectorAll(".menu-pop:not(.closing), .asheet:not(.closing)");
  if (!live.length) return;
  $pop.querySelectorAll(".menu-pop, .asheet, .scrim, .menu-scrim, .lifted").forEach((e) => e.classList.add("closing"));
  clearTimeout(popTimer); popTimer = setTimeout(() => { $pop.innerHTML = ""; }, 260);
}
let toastTimer = 0;
function toast(html, btn, fn) {
  if (!$toast || S.locked) return;                 // nothing shows over the lock
  $toast.innerHTML = `<div class="toast" role="status"><span class="ticon">${I.bird}</span><span>${html}</span>${btn ? `<button type="button" class="btn small" data-act="toast">${esc(btn)}</button>` : ""}</div>`;
  S.toastFn = fn;
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  const t = $(".toast", $toast); if (!t) return;
  clearTimeout(toastTimer); t.classList.add("out");
  setTimeout(() => { if (t.isConnected) t.remove(); }, 360);
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
// Buttons that ask the server for something only go once until it has answered
// (a double tap can't accept twice, buy twice or send two emails).
const ONCE_ACTS = new Set(["accept", "declinego", "cancelreq", "unblock", "sessend", "sessothersgo", "confirmsend", "pushtest", "buyitem", "wearon", "birdretirego", "wave", "cheer", "resetkeep", "resetfresh"]);
const acting = new Set();
async function onClick(e) {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  if (ONCE_ACTS.has(t.dataset.act)) {
    const key = `${t.dataset.act}:${t.dataset.id || ""}`;
    if (acting.has(key)) return;
    acting.add(key);
    try { return await onClick1(e, t); } finally { acting.delete(key); }
  }
  return onClick1(e, t);
}
async function onClick1(e, t) {
  const id = t.dataset.id;
  const inPop = !!t.closest(".poplayer") && t.dataset.act !== "closepop";
  if (inPop) closePop();
  if (t.getAttribute("role") === "switch" || t.dataset.act === "pigeon" || t.dataset.act === "schedpick" || t.dataset.act === "viapick") haptic("tick");
  switch (t.dataset.act) {
    case "tab": return go(id);
    case "to": return go(id);
    case "open":
      if (holding() && Date.now() - heldAt < 800 && !inPop) return;   // the end of a hold, not a tap
      return go("chat", id);
    case "shareflight": return openShare(id || t.dataset.id);
    case "birds": S.sheet = { type: "birds" }; return renderSheet();
    case "feathers": return openFeathers();
    case "newsall": S.sheet = { type: "news" }; renderSheet(); return loadNews(true);
    case "loft": return openLoft(id);
    case "loftback": S.sheet = { type: "friendinfo", id: S.sheet?.id }; return renderSheet();
    case "seasonhide": case "seasontry": { const s = seasonNow(); try { if (s) localStorage.setItem("inflight-season", s.key); } catch (_) {} render(); if (t.dataset.act === "seasontry") { haptic("tick"); return openFlightLog("skins"); } return; }
    case "buyitem": {
      const it = S.sheet?.data?.items.find((x) => x.id === id); if (!it) return;
      try { const r = await api("feathers-buy", { method: "POST", body: { item: id } }); S.sheet.data = r; S.feathers = r.feathers; haptic("success"); renderSheet(); render();
        toast(`${it.emoji} The ${esc(it.name.toLowerCase())} is yours.`, S.birds.length ? "Put It On" : null, S.birds.length ? () => wearItem(id, $(`[data-act=wearitem][data-id="${id}"]`, $layer) || $layer) : null); }
      catch (err) { toast(esc(err.message)); }
      return;
    }
    case "wearitem": return wearItem(id, t);
    case "wearon": { const [item, bird] = String(id).split("|"); closePop(); return putOn(bird, item === "none" ? null : item); }
    case "wearpick": {
      const w = await walletData(); if (!w) return;
      const b = S.birds.find((x) => x.id === id), owned = w.items.filter((x) => x.owned);
      if (!owned.length) { S.sheet = { type: "feathers", data: w, back: id }; renderSheet(); return toast("Buy something in the shop first."); }
      return openMenu(t, [...owned.map((x) => ({ label: `${x.emoji} ${x.name}`, sub: x.on && x.on.id !== id ? `On ${x.on.name}` : x.on?.id === id ? "Wearing" : "", act: "wearon", id: `${x.id}|${id}` })),
        ...(b?.wear ? [{ label: "Take It Off", act: "wearon", id: `none|${id}`, destructive: true }] : [])]);
    }
    case "bird": S.sheet = { type: "bird", id }; return renderSheet();
    case "birdnew": S.sheet = { type: "birdname" }; return renderSheet();
    case "birdrename": S.sheet = { type: "birdname", id }; return renderSheet();
    case "birdback": S.sheet = S.sheet?.id ? { type: "bird", id: S.sheet.id } : { type: "birds" }; return renderSheet();
    case "birdretire": { const b = S.birds.find((x) => x.id === id); return b && openMenu(t, [{ label: `Retire ${b.name}`, icon: I.bird, act: "birdretired", id }]); }
    case "birdretired": {
      const b = S.birds.find((x) => x.id === id); if (!b) return;
      try {
        const r = await api("bird-retire", { method: "POST", body: { id } });
        S.birds = r.birds; S.hall = r.hall; haptic("success"); toast(`${esc(b.name)} retires a Legend.`);
        S.sheet = { type: "bird", id }; renderSheet(); render();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "birdset": S.flyTap = t; S.birdPick = id; renderCompose(); if (S.sheet?.type === "flysheet") renderSheet(); return;
    case "momrun": {
      const box = t.closest(".momrun"), list = box?.querySelector(".momlist"); if (!list) return;
      const open = !momOpen.has(id); open ? momOpen.add(id) : momOpen.delete(id);
      haptic(); box.classList.toggle("open", open); t.setAttribute("aria-expanded", open); list.hidden = !open;
      box.classList.toggle("unfold", open); if (open) setTimeout(() => box.classList.remove("unfold"), 600);
      return;
    }
    case "wave": {
      const chat = S.chat, x = (S.fly.get(chat) || []).find((y) => y.id === id && !y.mine); if (!x || x.waved) return;
      t.disabled = true;
      try {
        const r = await api("wave", { method: "POST", body: { id } });
        haptic("success"); x.waved = r.waved; wavedNow = id; setTimeout(() => { if (wavedNow === id) wavedNow = null; }, 1500);
        if (S.chat === chat) render();
        toast(`You waved. ${esc(first(friend(chat)?.name || "They"))} will see it.`);
      } catch (err) { toast(esc(err.message)); t.disabled = false; }
      return;
    }
    case "cheer": {
      const chat = S.chat, m = (S.msgs.get(chat) || []).find((x) => x.id === id); if (!m || !cheerable(m).can) return;
      if (t.classList.contains("cheerbtn")) t.disabled = true;
      try {
        const r = await api(group(chat) ? "group-cheer" : "cheer", { method: "POST", body: { id } });
        haptic("success"); cheerFx = { id, at: performance.now() };
        toast(`A little tailwind: it lands ${esc(soonerText(r.cut))} sooner.`);
        await loadChat(chat); if (S.chat === chat) { render(); tickMap(); }
      } catch (err) { toast(esc(err.message)); if (t.classList.contains("cheerbtn")) { t.dataset.k = ""; tickMap(); } }
      return;
    }
    case "sharefmt": {
      const s = S.sheet; if (s?.type !== "shareflight") return;
      s.fmt = id; $layer.querySelectorAll(".shopt").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
      const go = $("[data-act=shareimg]", $layer); if (go) go.disabled = !s.urls[id];
      return;
    }
    case "sharename": {
      const s = S.sheet; if (s?.type !== "shareflight") return;
      s.name = !s.name; try { localStorage.setItem("inflight-share-name", s.name ? "1" : "0"); } catch (_) {}
      t.setAttribute("aria-checked", String(s.name)); $(".switch", t)?.classList.toggle("on", s.name);
      return shareRender(s);
    }
    case "shareimg": return shareImage();
    case "shareback": { const s = S.sheet; S.sheet = s?.id ? { type: "map", id: s.id } : null; return renderSheet(); }
    case "rowread": {
      const g = group(id), f = friend(id);
      if (g) { g.unread = 0; api("group-read", { method: "POST", body: { id } }).catch(() => {}); }
      else if (f) { f.unread = 0; api("read", { method: "POST", body: { with: id } }).catch(() => {}); }
      return render();
    }
    case "rowmute": {
      const g = group(id); if (!g) return;
      const on = !g.muted; g.muted = on; toast(on ? `${esc(g.name)} is muted.` : `${esc(g.name)} is unmuted.`);
      try { await api("group-mute", { method: "POST", body: { id, muted: on } }); }
      catch (err) { g.muted = !on; toast(esc(err.message)); }
      return;
    }
    case "newmsg": S.sheet = { type: "newmsg" }; return renderSheet();
    case "newgroup": S.sheet = { type: "newgroup", pick: new Set() }; renderSheet(); setTimeout(() => $("#f-gname", $layer)?.focus(), 300); return;
    case "groupadd": S.sheet = { type: "groupadd", id: id || S.sheet?.id, pick: new Set() }; return renderSheet();
    case "gpick": {
      const s = S.sheet; if (!s?.pick) return;
      s.name = $("#f-gname", $layer)?.value; s.pick.has(id) ? s.pick.delete(id) : s.pick.add(id); return renderSheet();
    }
    case "groupinfo": S.sheet = { type: "groupinfo", id: id || S.sheet?.id || S.chat }; return renderSheet();
    case "groupmenu": {
      const g = group(S.chat); if (!g) return;
      return openMenu(t, [
        { label: "Group Info", icon: I.info, act: "groupinfo", id: g.id },
        { label: "Add People", icon: I.addp, act: "groupadd", id: g.id },
        { label: "Leave Group", icon: I.minusp, act: "groupleaveask", id: g.id, destructive: true },
      ]);
    }
    case "groupleaveask": {
      const g = group(id); if (!g) return;
      return openActions({ title: `Leave ${g.name}?`, message: "You’ll stop getting its pigeons, and won’t see anything sent after you leave.", actions: [{ label: "Leave Group", act: "groupleave", id, destructive: true }] });
    }
    case "groupleave":
      try { await api("group-leave", { method: "POST", body: { id } }); S.sheet = null; renderSheet(); await sync(); go("messages"); toast("You left the group."); }
      catch (err) { toast(esc(err.message)); }
      return;
    case "trustm": return trustNewKey(id);
    case "grouprename": S.sheet = { type: "grouprename", id }; return renderSheet();
    case "flightlog": return openFlightLog();
    case "passport": haptic("tick"); return openPassport(id || null);
    case "flightlogback": S.sheet = { type: "flightlog", data: S.sheet?.data || null }; renderSheet(); if (!S.sheet.data) openFlightLog(); return;
    case "ppturn": { const book = $(".ppbook", $layer); if (book) { haptic("tick"); book.scrollBy({ left: +id * book.clientWidth, behavior: STILL.matches ? "auto" : "smooth" }); } return; }
    case "pmarkinfo": {
      const [mid, pid] = String(id).split(":"), m = (S.msgs.get(S.chat) || []).find((x) => x.id === mid), pm = m?.postmarks?.find((x) => x.id === pid); if (!pm) return;
      haptic("tick");
      const mine = m.from === S.me.id, who = mine ? "Your pigeon" : `${esc(first((group(S.chat) ? member(group(S.chat), m.from) : friend(S.chat))?.name || "Their"))}’s pigeon`;
      return toast(`${who} flew past ${esc(pm.name)} on ${esc(fmtDate(pm.at))}.`, mine ? "Postmarks" : null, mine ? () => openFlightLog() : null);
    }
    case "pmarkall": {
      const x = S.sheet?.data?.postmarks?.marks.find((p) => p.id === id); if (!x) return;
      haptic("tick");
      return toast(`${esc(x.name[0].toUpperCase() + x.name.slice(1))}: first flown past ${esc(fmtDate(x.at))}${x.n > 1 ? `, and ${x.n - 1} flight${x.n === 2 ? "" : "s"} since` : ""}.`);
    }
    case "stampinfo": {
      const p = S.sheet?.data?.passport?.places.find((x) => x.name === id); if (!p) return;
      t.classList?.add("pphit"); setTimeout(() => t.classList?.remove("pphit"), 450);
      haptic("tick");
      return toast(`${esc(p.name[0].toUpperCase() + p.name.slice(1))}: first flown over ${esc(fmtDate(p.at))}${p.n > 1 ? `, and ${p.n - 1} flight${p.n === 2 ? "" : "s"} since` : ""}.`);
    }
    case "gifs": S.sheet = { type: "gifs", q: "", list: [], next: 0, busy: false }; renderSheet(); return loadGifs();
    case "gifmore": return loadGifs(true);
    case "gifpick": return pickGif(id, t);
    case "gmute": {
      const g = group(id); if (!g) return;
      const on = !g.muted; g.muted = on; renderSheet();            // the switch moves straight away
      try { await api("group-mute", { method: "POST", body: { id, muted: on } }); }
      catch (err) { g.muted = !on; renderSheet(); toast(esc(err.message)); }
      return;
    }
    case "requests": S.sheet = { type: "requests" }; return renderSheet();
    case "addfriend": S.sheet = { type: "addfriend" }; return renderSheet();
    case "safetylist": S.sheet = { type: "safetylist" }; return renderSheet();
    case "securitysheet": keepProfileDraft(); S.sheet = { type: "security" }; return renderSheet();
    case "encryptionsheet": S.sheet = { type: "encryption" }; return renderSheet();
    case "passkeys": S.sheet = { type: "passkeys" }; return renderSheet();
    case "friendinfo": S.sheet = { type: "friendinfo", id: id || S.chat }; return renderSheet();
    case "close":
      if (S.sheet?.type === "askpw") S.sheet.resolve(null);
      if (S.sheet?.type === "reauth") { const r = S.sheet.resolve; S.sheet = S.sheet.back || null; renderSheet(); return r(false); }
      S.sheet = null; S.profileDraft = null; dropAvatarDraft(); return renderSheet();
    case "closepop": return closePop();
    case "submit": return $("#" + id, $layer)?.requestSubmit();
    case "map": S.sheet = { type: "map", id }; return renderSheet();
    case "skies": S.sheet = { type: "map", id: "skies" }; renderSheet(); return loadSkies();
    case "skyopen": S.sheet = null; renderSheet(); return go("chat", id);
    case "airopen": haptic("tick"); S.mapNext = t.dataset.m; return go("chat", id);
    case "msgmenu": return openReactMenu(t, id);
    case "react": return sendReact(id, t.dataset.e);
    case "reply": {
      const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id), p = m && S.plain.get(id); if (!p) return;
      S.replyTo = { chat: S.chat, id, from: m.from, t: String(p.t || "").replace(/\s+/g, " ").slice(0, 90), p: p.v ? "voice" : p.p ? (p.p.m === "image/gif" ? "gif" : "photo") : "" };
      renderCompose(); $ta.focus(); return;
    }
    case "unreply": S.replyTo = null; return renderCompose();
    case "searchopen": {
      const mid = t.dataset.m; S.q = ""; go("chat", id);
      const jump = () => { const el = $(`[data-mid="${CSS.escape(mid)}"]`, $view); if (!el) return false; S.stick = false; el.scrollIntoView({ block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); return true; };
      if (!jump()) { let n = 0; const iv = setInterval(() => { if (jump() || ++n > 30) clearInterval(iv); }, 150); }
      return;
    }
    case "jumpto": {
      const el = $(`[data-mid="${CSS.escape(id)}"]`, $view); if (!el) return;
      el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); return;
    }
    case "applock": {
      if (lockPrefs()) { setLockPrefs(null); haptic("tick"); toast("InFlight won’t lock."); return renderSheet(); }
      if (!S.passkeys?.length) { toast("Add a passkey first: it’s what unlocks InFlight."); S.sheet = { type: "passkeys" }; return renderSheet(); }
      try { await lockCheck(); } catch (_) { return toast("Couldn’t check it’s you, so InFlight won’t lock yet."); }
      setLockPrefs({ on: true, after: 0 }); haptic("success"); toast("InFlight locks when you leave it."); return renderSheet();
    }
    case "unlock": return unlock();
    case "lockout": return openActions({ message: "Sign out of InFlight on this phone? You’ll need your password or a passkey to sign in again.", actions: [{ label: "Sign Out", act: "signoutgo", destructive: true }] });
    case "reauthpk": {
      try { await busyBtn(t, "Waiting for your passkey…", reauthPasskey); const s = S.sheet; S.sheet = s.back || null; renderSheet(); haptic("success"); s.resolve(true); }
      catch (err) { if (err?.name !== "NotAllowedError") toast(esc(err.message || "That passkey didn’t work.")); }
      return;
    }
    case "recstart": return recStart();
    case "reccancel": return recStop(false);
    case "recsend": return recStop(true);
    case "vplay": return voicePlay(id);
    case "outmenu": {
      const o = S.outbox.find((x) => x.id === id); if (!o) return;
      return openMenu(t, [{ label: o.err ? "Try Again" : "Send Now", icon: I.up, act: "outretry", id }, { label: "Delete", icon: I.trash, act: "outdel", id, destructive: true }]);
    }
    case "outretry": { closePop(); const o = S.outbox.find((x) => x.id === id); if (o) { o.err = null; await outboxSave(); render(); } return outboxFlush(true); }
    case "outdel": { closePop(); S.outbox = S.outbox.filter((x) => x.id !== id); await outboxSave(); haptic("tick"); return render(); }
    case "whohas": haptic("tick"); S.sheet = { type: "whohas", id }; return renderSheet();
    case "flymenu": {
      const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id); if (!m || !m.flying) return;
      if (m.waiting) return openMenu(t, [{ label: "Cancel Pigeon", sub: `${m.bird ? `${m.bird.name} · ` : ""}takes off in ${fmtDur(m.sentAt - now())}`, icon: I.x, act: "recallask", id, destructive: true }]);
      const lunar = !!moonOf(m), onMap = lunar || m.route || m.flock?.some((x) => x.route), c = lunar ? { can: false } : cheerable(m);
      return openMenu(t, [...(onMap ? [{ label: lunar ? "Watch Its Trip" : "Watch on Map", sub: flySub(m), icon: lunar ? I.moon : I.map, act: "map", id }] : []),
        ...(c.can ? [{ label: `Cheer ${c.them ? "Them" : "It"} On`, sub: `${c.them ? "They land" : "It lands"} a little sooner${c.left < CHEER_EACH ? ` · ${c.left} left` : ""}`, icon: I.wind, act: "cheer", id }] : []),
        { label: "Call It Back", icon: I.homing, act: "recallask", id, destructive: true }]);
    }
    case "recallask": {
      const g = group(S.chat), n = S.me.swift || 0, w = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
      if (w?.waiting) return openActions({ title: "Cancel this pigeon?",
        message: `It hasn’t taken off yet, so ${first(friend(S.chat)?.name || "they")} will never know. What it carries is deleted${kindOf(w) === "standard" ? "" : `, and the ${KIND[kindOf(w)].name.toLowerCase()} pigeon goes back in your loft`}.`,
        actions: [{ label: "Cancel Pigeon", act: "recallgo", id, destructive: true }] });
      return openActions({ title: g ? "Call your pigeons back?" : "Call your pigeon back?",
        message: `A swift pigeon flies after ${g ? "them" : "it"} (you have ${n}). ${g ? "Any that haven’t landed turn for home, and whoever already has it keeps it." : "It won’t arrive, and what it carries is deleted."}`,
        actions: [{ label: "Call It Back", act: "recallgo", id, destructive: true }] });
    }
    case "recallgo":
      haptic("heavy");
      try {
        const g = group(S.chat), r = await api(g ? "group-recall" : "recall", { method: "POST", body: { id } });
        const list = S.msgs.get(S.chat) || [], i = list.findIndex((x) => x.id === id);
        if (r.cancelled) {
          if (i >= 0) list.splice(i, 1);
          S.plain.delete(id); S.photos.delete(id); S.me = r.me;
          render(); renderCompose(); toast("Cancelled. It never left."); return sync();
        }
        if (i >= 0) list[i] = r.message;
        if (r.message.recalled && !(r.message.flock || []).some((x) => !x.flying && !x.lost)) S.plain.delete(id);
        if (r.me) S.me = r.me;
        if (S.sheet?.type === "map") S.sheet = null;
        render(); toast(g ? "Your pigeons are flying home." : "Your pigeon is flying home."); await sync();
      } catch (err) { toast(esc(err.message)); }
      return;
    case "mapzoom": {
      const cv = $(".map", $layer); if (!cv || !cv._m) return;
      if (id === "fit") return fitMap(cv);
      return zoomMapBy(cv, id === "in" ? 2 : 0.5, cv.clientWidth / 2, mapFrame(cv, cv._m, cv._cardH).sy0);
    }
    case "view": S.sheet = { type: "view", id }; return renderSheet();
    case "viewonce": return viewOnce(id);
    case "maplayers": {
      const on = !windOn(); try { localStorage.setItem("inflight-windmap", on ? "1" : "0"); } catch (_) {}
      t.setAttribute("aria-pressed", String(on));
      const cv = $(".map", $layer); if (cv) { cv._parts = null; cv._trailKey = null; }
      redrawMap(); return;
    }
    case "mapfold": return mapFold(!mapOpen());
    case "mapglobe": { const cv = $(".map", $layer); if (!cv?._m) return; S.sheet.globe = !globeOn(cv._m); S.sheet.view = S.sheet.gview = null; cv._spin = 0; return redrawMap(); }
    case "safety": {
      const f = personById(id); if (!f) return;
      S.sheet = { type: "safety", id, from: t.dataset.from || (S.sheet?.type === "friendinfo" ? "friendinfo" : S.sheet?.type === "groupinfo" ? "groupinfo" : null), backId: S.sheet?.id, digits: await E2E.safety(S.me.id, S.myPub || S.me.pub, f.id, f.pub) };
      return renderSheet();
    }
    case "vanishask": {
      const g = group(id), who = g ? "everyone in the group" : first(friend(id)?.name || "your friend");
      return openActions({ title: "Disappearing Messages", message: `New messages disappear this long after they’re read, for you and ${who}. The flight stays in your Flight Log.`,
        actions: [[DAY, "1 Day"], [7 * DAY, "7 Days"], [30 * DAY, "30 Days"], [0, "Off"]].map(([ms, label]) => ({ label, act: "vanishset", id: `${id}|${ms}` })) });
    }
    case "vanishset": {
      const [cid, ms] = id.split("|"), g = group(cid);
      try {
        await api(g ? "group-vanish" : "vanish", { method: "POST", body: g ? { id: cid, ms: Number(ms) } : { with: cid, ms: Number(ms) } });
        await sync(); if (S.chat === cid) await loadChat(cid).catch(() => {});
        toast(Number(ms) ? `New messages disappear ${vanishSay(Number(ms))} after they’re read.` : "Disappearing messages are off.");
        if (S.sheet) renderSheet(); render();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "scansafe": { const back = S.sheet?.type === "scan" ? S.sheet.back : S.sheet; S.sheet = { type: "scan", id, back }; return renderSheet(); }
    case "scanback": { stopScan(); S.sheet = S.sheet?.back ? { ...S.sheet.back } : null; return renderSheet(); }
    case "verifyok": { const p = personById(id); if (!p) return; setVerified(p, true); haptic("success"); toast(`${esc(first(p.name))} is verified.`); return renderSheet(); }
    case "unverify": { const p = personById(id); if (!p) return; setVerified(p, false); toast("Verification cleared."); return renderSheet(); }
    case "trustsafe": { await trustNewKey(id); haptic("success"); toast("Trusted. Messages can go to them again."); S.sheet = null; return renderSheet(); }
    case "chatmenu": {
      const f = friend(S.chat); if (!f) return;
      return openMenu(t, [
        { label: "Contact Info", icon: I.info, act: "friendinfo", id: f.id },
        { label: "Safety Number", icon: I.shield, act: "safety", id: f.id },
        { label: "Remove Friend", icon: I.minusp, act: "unfriendask", id: f.id, destructive: true },
        { label: "Block", icon: I.block, act: "blockask", id: f.id, destructive: true },
      ]);
    }
    // The phone's own picker already offers Photo Library, Take Photo and Choose File,
    // so go straight to it rather than putting a menu of ours in front of it.
    case "attachmenu":
      if (!S.gifsOn) { haptic("tick"); return $("#file-lib")?.click(); }
      return openMenu(t, [{ label: "Photo", icon: I.photo, act: "pick", id: "file-lib" }, { label: "GIF", icon: `<span class="gifico" aria-hidden="true">GIF</span>`, act: "gifs" }]);
    case "avmenu":
      if (!S.me.avatarAt && !S.avatarDraft) return $("#av-lib")?.click();
      return openMenu(t, [{ label: "Change Photo", icon: I.photo, act: "pick", id: "av-lib" }, { label: "Remove Photo", icon: I.trash, act: "avdel", destructive: true }]);
    case "pick": return $("#" + id)?.click();
    case "trust": return trustNewKey(id);
    case "decline": {
      const p = S.incoming.find((x) => x.id === id);
      return openActions({ message: `Decline ${p ? "@" + p.handle + "’s" : "this"} request? They aren’t told, and can’t ask again for 30 days.`,
        actions: [{ label: "Decline", act: "declinego", id }, { label: "Decline and Block", act: "blockgo", id, destructive: true }] });
    }
    case "accept": case "declinego":
      await api("friends-respond", { method: "POST", body: { id, accept: t.dataset.act === "accept" } }).catch((err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    case "blockask": {
      const p = personById(id) || S.incoming.find((x) => x.id === id); if (!p) return;
      const shared = S.groups.some((g) => g.members?.some((m) => m.id === id));
      return openActions({ title: `Block @${p.handle}?`, message: `They won’t be able to send you pigeons or friend requests, or see your picture or where you are. They aren’t told.${shared ? " You’ll both still be in the groups you share." : ""}`,
        actions: [{ label: "Block", act: "blockgo", id, destructive: true }] });
    }
    case "blockgo": {
      const p = personById(id) || S.incoming.find((x) => x.id === id);
      try { await api("block", { method: "POST", body: { id } }); haptic("success"); toast(`Blocked${p ? " @" + esc(p.handle) : ""}.`); }
      catch (err) { return toast(esc(err.message)); }
      if (S.chat === id) { S.sheet = null; await sync(); renderSheet(); return go("messages"); }
      if (S.sheet?.type === "friendinfo") S.sheet = null;
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    }
    case "unblock": {
      const p = S.blocked.find((x) => x.id === id);
      await api("block", { method: "DELETE", body: { id } }).then(() => toast(`Unblocked${p ? " @" + esc(p.handle) : ""}.`), (err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    }
    case "blockedsheet": S.sheet = { type: "blocked" }; return renderSheet();
    case "sessionssheet": S.sheet = { type: "sessions" }; renderSheet(); return loadSessions();
    case "sessend":
      try { await api("sessions-end", { method: "POST", body: { id } }); haptic("success"); toast("Signed out."); } catch (err) { toast(esc(err.message)); }
      return loadSessions();
    case "sessothers": return openActions({ message: "Sign out of InFlight everywhere except this phone? They’ll need your password or a passkey to sign in again.", actions: [{ label: "Sign Out Other Phones", act: "sessothersgo", destructive: true }] });
    case "sessothersgo":
      try { await api("sessions-end", { method: "POST", body: { others: true } }); haptic("success"); toast("Your other phones were signed out."); } catch (err) { toast(esc(err.message)); }
      return loadSessions();
    case "confirmsend":
      try { const r = await api("confirm-resend", { method: "POST" }); toast(r.already ? "Your email is already confirmed." : `Sent. Tap the link in the email to ${esc(S.me.email)}.`); if (r.already) { await sync(); renderSheet(); } }
      catch (err) { toast(esc(err.message)); }
      return;
    case "cancelreq":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    case "addgo": return addGo(id, t);
    case "addchat": S.sheet = null; renderSheet(); return go("chat", id);
    case "copylink":
      try { await navigator.clipboard.writeText(myLink()); toast("Link copied."); } catch (_) { toast(esc(myLink())); }
      return;
    case "unfriendask": {
      const f = friend(id); if (!f) return;
      return openActions({ title: `Remove ${first(f.name)}?`, message: "You’ll stop seeing each other’s messages. You can add them again later.", actions: [{ label: "Remove Friend", act: "unfriend", id, destructive: true }] });
    }
    case "unfriend":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      S.sheet = null; await sync(); return go("messages");
    case "share": return shareHandle();
    case "unattach": if (S.busy) return; return clearAttach();
    case "toast": { hideToast(); const fn = S.toastFn; S.toastFn = null; return fn && fn(); }
    case "peek": { const inp = t.parentElement.querySelector("input"); const show = inp.type === "password"; inp.type = show ? "text" : "password"; t.setAttribute("aria-label", show ? "Hide password" : "Show password"); return; }
    case "locate": {
      const found = await locate(t);
      // signing up: keep it fresh (unless switched off), then on to the next step by itself
      if (found && S.view === "locpick") { if (S.onbAuto !== false) setAutoLocation(true); setTimeout(() => { if (S.view === "locpick") onbNext(); }, 650); }
      return;
    }
    case "onbauto": S.onbAuto = S.onbAuto === false; return render();
    case "locdone": return onbNext();
    case "onbdone": return finishOnboarding();
    case "usehandle": { const i = $("#f-handle"); if (i) { i.value = id; onb.handleTouched = true; onbCheckHandle(); } return; }
    case "pkadd":
      try {
        const unlocks = await busyBtn(t, "Waiting for your passkey…", () => withFresh(addPasskey));
        await sync();
        if (t.dataset.next === "done") finishOnboarding(); else if (t.dataset.next) go(t.dataset.next); else renderSheet();
        toast(unlocks ? "Passkey saved. It can sign you in and unlock your messages." : "Passkey saved. On a new phone you’ll also need your password once.");
      } catch (err) { if (!err.cancelled && err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(passkeyError(err)); }
      return;
    case "pkget":
      try { await busyBtn(t, "Waiting for your passkey…", signInPasskey); if (S.priv) afterSignIn(); }
      catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(passkeyError(err)); }
      return;
    case "pkdel":
      try { await withFresh(() => api("passkey", { method: "DELETE", body: { id } })); toast("Passkey removed. You can also delete it from your phone’s Passwords app."); }
      catch (err) { if (!err.cancelled) toast(esc(err.message)); }
      await sync(); return renderSheet();
    case "cancelunlock": S.pendingUnlock = null; return go("welcome");
    case "signout": {
      const waiting = S.outbox.filter((o) => !o.err).length;
      return openActions({ message: `You’ll need your password or a passkey to sign in again.${waiting ? ` ${waiting === 1 ? "One pigeon is" : `${waiting} pigeons are`} still waiting for signal and won’t be sent.` : ""}`, actions: [{ label: "Sign Out", act: "signoutgo", destructive: true }] });
    }
    case "creditsheet": S.sheet = { type: "credits" }; return renderSheet();
    case "whatsnew": S.sheet = { type: "whatsnew" }; return renderSheet();
    case "moved": return movedNote(true);
    case "movego": if (!standalone()) { e?.preventDefault?.(); location.href = `${NEW_HOME}/${S.view === "welcome" ? location.hash : ""}`; } return;
    case "movecopy": try { await navigator.clipboard.writeText(NEW_HOME + "/"); toast("Address copied."); } catch (_) { toast(esc(NEW_HOME.replace(/^https?:\/\//, ""))); } return;
    case "appearancesheet": keepProfileDraft(); S.sheet = { type: "appearance" }; return renderSheet();
    case "theme": setTheme(id); render(); return renderSheet();
    case "pigeon": S.pick = id; renderCompose(); if (S.sheet?.type === "flysheet") renderSheet(); return;
    case "flysheet": haptic("tick"); S.sheet = { type: "flysheet", chat: S.chat }; return renderSheet();
    case "routepreview": {
      // the flight it would be, drawn on the map as if it were in the air
      const p = previewFrom(routeStyle()); if (!p) return;
      S.preview = p; S.sheet = { type: "map", id: "preview" }; return renderSheet();
    }
    case "routeset": {
      if (!ROUTES.some((r) => r[0] === id) || id === routeStyle()) return;
      try { localStorage.setItem("inflight-route", id); } catch (_) {}
      haptic("tick");
      // on The Way: that way instead, the map re-fitted to it and the card springing to its new size
      if (S.sheet?.type === "map" && S.sheet.id === "preview") {
        const p = previewFrom(id), card = $(".mapcard", $layer); if (!p || !card) return;
        S.preview = p; S.sheet.view = S.sheet.gview = null;
        return fcMorph(card, () => tickMap());
      }
      return renderSheet();
    }
    case "haptics": { const on = !hapticsOn(); try { localStorage.setItem("inflight-haptics", on ? "1" : "0"); } catch (_) {} if (on) haptic("success"); return renderSheet(); }
    case "skin": return setSkin(id);
    case "vianote": S.sheet = { type: "vianote", id, chat: S.chat }; return renderSheet();
    case "via": S.sheet = { type: "via", chat: S.chat, ids: null }; renderSheet();
      try { const r = await api("mutuals?with=" + encodeURIComponent(S.chat)); if (S.sheet?.type === "via") { S.sheet.ids = r.ids; renderSheet(); } } catch (err) { if (S.sheet?.type === "via") { S.sheet.err = err.message; renderSheet(); } }
      return;
    case "viapick": S.via = { chat: S.sheet?.chat || S.chat, id }; S.sched = null; S.sheet = null; renderSheet(); return renderCompose();
    case "unvia": S.via = null; S.sheet = null; renderSheet(); return renderCompose();
    case "schedule": S.sheet = { type: "schedule", chat: S.chat }; return renderSheet();
    case "wxwait": S.sched = { chat: S.chat, at: +id }; S.pick = t.dataset.kind; S.via = null; haptic("tick"); return renderCompose();
    case "schedpick": S.sched = { chat: S.sheet?.chat || S.chat, at: +id }; S.via = null; S.sheet = null; renderSheet(); return renderCompose();
    // chosen right on How It Flies (it stays open)
    case "schednow": S.flyTap = t; S.sched = null; haptic("tick"); renderSheet(); return renderCompose();
    case "schedset": S.flyTap = t; S.sched = { chat: S.chat, at: +id }; S.via = null; haptic("tick"); renderSheet(); return renderCompose();
    case "viaset": S.flyTap = t; S.via = { chat: S.chat, id }; S.sched = null; haptic("tick"); renderSheet(); return renderCompose();
    case "viaclear": S.flyTap = t; S.via = null; haptic("tick"); renderSheet(); return renderCompose();
    case "shipset": S.flyTap = t; S.noShip = id === "fly" ? S.chat : null; haptic("tick"); renderSheet(); return renderCompose();
    case "unschedule": S.sched = null; S.sheet = null; renderSheet(); return renderCompose();
    case "autoloc": return setAutoLocation(!S.me.autoLocation, t);
    case "moonpick": haptic("tick"); S.sheet = { type: "moonpick", body: id === "mars" ? "mars" : "moon" }; return renderSheet();
    case "moonside": if (S.sheet?.type === "moonpick") { S.sheet.side = id; renderSheet(); } return;
    case "moonsite": { const x = BODIES[S.sheet?.body || "moon"].sites.find((y) => y[0] === id); if (x && S.sheet?.type === "moonpick") { S.sheet.mark = { lat: x[1], lon: x[2] }; renderSheet(); } return; }
    case "moonlive": S.moonReplay = null; return tickMap();
    case "moonwho": { const [mid, to] = id.split("|"); S.moonWho = { ...(S.moonWho || {}), [mid]: to }; S.moonReplay = null; return tickMap(); }
    case "moonland": {
      const body = S.sheet?.body || "moon", mk = S.sheet?.mark || (worldOf(S.me) === body ? S.me.moon : null); if (!mk) return;
      return busyBtn(t, "Landing…", async () => {
        try { const r = await api("me", { method: "PATCH", body: { moon: { lat: mk.lat, lon: mk.lon, body } } }); S.me = r.me; stopLocWatch(); haptic("success"); toast(`You’re on ${BODIES[body].name}: ${esc(r.me.place.replace(/, (the Moon|Mars)$/, ""))}.`); S.sheet = { type: "profile" }; render(); renderSheet(); return true; }
        catch (err) { toast(esc(err.message)); return false; }
      });
    }
    case "risky": return setRisky(!S.me.risky);
    case "privacy": {
      const on = S.me[id] === false;                                   // switching it back on
      S.me = { ...S.me, [id]: on }; renderSheet();
      try { S.me = (await api("me", { method: "PATCH", body: { [id]: on } })).me; await sync(); }
      catch (err) { S.me = { ...S.me, [id]: !on }; renderSheet(); toast(esc(err.message)); }
      return;
    }
    case "notifysheet": keepProfileDraft(); S.sheet = { type: "notifications" }; return renderSheet();
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
      try { await withFresh(() => api("me", { method: "DELETE" })); await forget(); go("welcome"); toast("Your account was deleted."); }
      catch (err) { if (!err.cancelled) toast(esc(err.message)); }
      return;
    case "changepw": S.sheet = { type: "changepw" }; return renderSheet();
    case "profile": S.sheet = { type: "profile" }; renderSheet(); S.profileDraft = null; return;
    case "avdel":
      if (S.avatarDraft) { dropAvatarDraft(); return renderSheet(true); }   // a photo you haven't saved yet just goes
      try { S.me = (await api("avatar", { method: "DELETE" })).me; renderSheet(true); render(); }
      catch (err) { showErr(err.message); }
      return;
    case "resetcancel": S.resetToken = null; S.resetInfo = null; S.resetFrom = null; return location.reload();
    case "resetkeep": case "resetfresh":
      try { await resetWith(t.dataset.act === "resetkeep" ? "keep" : "fresh", t); }
      catch (err) { if (err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(err.message, err.field); }
      return;
  }
}
const passkeyError = (err) => err.name === "InvalidStateError" ? "This phone already has a passkey for your account." : err.name === "SecurityError" ? "Passkeys only work on georgefarrowgreen.com." : err.message || "The passkey didn’t work. Try again.";

async function onChange(e) {
  const el = e.target;
  if (el.id === "av-lib" && el.files[0]) { const f = el.files[0]; el.value = ""; return setAvatar(f); }
  if (el.id === "file-lib" && el.files[0]) { const f = el.files[0]; el.value = ""; return setAttach(f); }
  if (el.dataset.act === "quiethour") return setNotify({ [el.dataset.id]: Number(el.value) });
  if (el.dataset.act === "lockafter") { const lp = lockPrefs(); if (lp) setLockPrefs({ ...lp, after: Number(el.value) || 0 }); return renderSheet(); }
  if (el.dataset.act === "city" && el.value) {
    const p = PLACES.find((x) => x[0] === el.value);
    if (p) await savePlace(p[1], p[2], p[0]);
    if (p && S.view === "locpick" && S.me?.place) setTimeout(() => { if (S.view === "locpick") onbNext(); }, 650);   // signing up: straight on
  }
}
const agoText = (at) => { const ms = now() - at; return ms < 2 * MIN ? "just now" : `${fmtDur(ms)} ago`; };
// Opt-in: keep your location fresh while InFlight is open (a web page can't
// look in the background), so pigeons on their way can follow you. It never
// asks for permission by itself (only when you turn it on). It checks every
// minute, saves when you've moved to a new square mile, and otherwise just
// notes every few minutes that you're still there.
const AUTO_EVERY = MIN, AUTO_KM = 1, AUTO_FRESH = 3 * MIN;
async function setRisky(on) {
  S.me = { ...S.me, risky: on }; render();             // the switch moves straight away
  try { const r = await api("me", { method: "PATCH", body: { risky: on } }); const same = !!r.me.risky === on; S.me = r.me; if (!same) render(); }
  catch (err) { S.me = { ...S.me, risky: !on }; render(); toast(esc(err.message)); }
}
async function setAutoLocation(on, btn) {
  S.me = { ...S.me, autoLocation: on }; render(); refreshProfile();       // the switch moves straight away
  try { const r = await api("me", { method: "PATCH", body: { autoLocation: on } }); const same = !!r.me.autoLocation === on; S.me = r.me; if (!same) { render(); refreshProfile(); } }
  catch (err) { S.me = { ...S.me, autoLocation: !on }; render(); refreshProfile(); return toast(esc(err.message)); }
  if (on) autoLocate(true); else stopLocWatch();
}
// While InFlight is open (and you've turned it on) the phone watches your
// location: iPhone asks once a session, then reports as you move. The minute
// timer saves what it last heard (a new square mile at once; otherwise a
// "still here" every few minutes), and asks directly if the watch goes quiet.
// (Safari often says permission is only "prompt" even once allowed, so only a
// clear "denied" stops it.)
let locWatch = null, lastFix = null, lastFixAt = 0, lastSave = 0, saving = false;
function stopLocWatch() { if (locWatch != null) { navigator.geolocation.clearWatch(locWatch); locWatch = null; } }
async function autoLocate(ask) {
  if (!S.me?.autoLocation || !navigator.geolocation) return stopLocWatch();
  if (document.visibilityState !== "visible") return;
  if (!ask) { try { if ((await navigator.permissions?.query({ name: "geolocation" }))?.state === "denied") return stopLocWatch(); } catch (_) { /* can't tell: try */ } }
  const opts = { enableHighAccuracy: false, timeout: 30000, maximumAge: 30e3 };
  const fail = (err) => { if (err.code === 1) { stopLocWatch(); if (ask) toast("Location is off for this site. Allow it in your phone’s settings to update automatically."); } };
  if (locWatch == null) locWatch = navigator.geolocation.watchPosition((pos) => { lastFix = pos; lastFixAt = Date.now(); saveFix(); }, fail, opts);
  // quiet for two minutes (or just switched on): ask once directly
  if (ask || Date.now() - lastFixAt > 2 * MIN) navigator.geolocation.getCurrentPosition((pos) => { lastFix = pos; lastFixAt = Date.now(); saveFix(true); }, fail, opts);
  else saveFix();
}
async function saveFix(force) {
  if (!lastFix || !S.me?.autoLocation || S.me.moon || saving) return;
  const { lat, lon } = snapToMile(lastFix.coords.latitude, lastFix.coords.longitude);     // the exact spot never leaves the phone
  const moved = S.me.lat == null || haversineKm(S.me.lat, S.me.lon, lat, lon) >= AUTO_KM;
  if (!moved && now() - (S.me.locAt || 0) < AUTO_FRESH) return;
  if (!force && Date.now() - lastSave < 20e3) return;                                       // a burst of fixes saves once
  // still here: keep the spot (and its name) and just refresh when it was checked
  const body = moved ? { lat, lon, place: nearestPlace(lat, lon) } : { lat: S.me.lat, lon: S.me.lon, place: S.me.place };
  const before = S.me.place;
  saving = true; lastSave = Date.now();
  try {
    const r = await api("me", { method: "PATCH", body }); S.me = r.me; render(); refreshProfile();
    if (moved && r.me.place !== before) toast(`Location updated to ${esc(r.me.place)}.`);
  } catch (_) { /* try again next time */ }
  saving = false;
}
// My Profile holds name and handle (saved with Done) next to settings that save
// as soon as they change (location, notifications, security).
function keepProfileDraft() {
  if (S.sheet?.type === "profile" && $("#f-name", $layer)) S.profileDraft = { name: $("#f-name", $layer).value, handle: $("#f-handle", $layer).value };
}
const refreshProfile = () => { if (S.sheet?.type === "profile") renderSheet(true); };
async function savePlace(lat, lon, place) {
  try { const r = await api("me", { method: "PATCH", body: { lat, lon, place } }); S.me = r.me; render(); refreshProfile(); }
  catch (err) { showErr(err.message); }
}
function locate(btn) {
  if (!navigator.geolocation) return showErr("This browser can’t share your location. Choose a city instead.");
  return busyBtn(btn, "Finding you…", () => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const { lat, lon } = snapToMile(latitude, longitude);     // the exact spot never leaves the phone
      await savePlace(lat, lon, nearestPlace(lat, lon));
      resolve(!!S.me?.place);
    }, (err) => {
      showErr(err.code === 1 ? "Location is off for this site. Choose a city instead, or allow location in your browser settings." : "Couldn’t find your location. Choose a city instead.");
      resolve(false);
    }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * MIN });
  }));
}
async function shareHandle() {
  const url = myLink();
  const text = `Send me a pigeon on InFlight: @${S.me.handle}`;
  try {
    if (navigator.share) await navigator.share({ title: "InFlight", text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied."); }
  } catch (_) { /* share sheet closed */ }
}
async function onSubmit(e) {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form;
  if (kind !== "compose") {
    if (form.dataset.busy) return;                // already on its way (a second Go on the keyboard, a double tap)
    form.dataset.busy = "1";
    try { return await submitForm(e, form, kind); } finally { delete form.dataset.busy; }
  }
  return submitForm(e, form, kind);
}
async function submitForm(e, form, kind) {
  const btn = form.querySelector(".btn") || $(`[data-act=submit][data-id="${esc(form.id)}"]`, $layer);
  if (kind === "compose") return send();
  if (kind === "schedule") {
    const v = $("#f-landat", $layer)?.value, at = v ? +new Date(v) : NaN;
    if (!Number.isFinite(at) || at <= now()) return showErr("Pick a time that’s still to come.");
    if (at > now() + 30 * DAY) return showErr("Pick a time in the next 30 days.");
    S.sched = { chat: S.sheet.chat, at }; S.via = null; S.sheet = null; renderSheet(); return renderCompose();
  }
  if (kind === "vianote") {
    const s = S.sheet, text = String($("#f-vianote", $layer)?.value || "").trim();
    const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), to = m && friend(m.finalTo);
    if (!text) return showErr("Write a line first.");
    if (!m || !to) return showErr("You’re not friends with who it’s going to any more.");
    try {
      await busyBtn(btn, "…", async () => {
        const ct = await E2E.seal(await pairFor(trustedPub(to)), { id: m.id + ":via", from: S.me.id, to: to.id, type: "note" }, { t: text });
        await api("stopover-note", { method: "POST", body: { id: m.id, ct } });
      });
      S.notes.set(m.id, text); m.mine = "sent"; S.sheet = null; renderSheet(); render(); toast(`Added. ${esc(first(to.name))} will see it when it lands.`);
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "birdname") {
    const s = S.sheet, name = String($("#f-bname", $layer)?.value || "").trim();
    if (!name) return showErr("Give your pigeon a name.");
    try {
      const r = await busyBtn(btn, "…", () => api(s.id ? "bird-name" : "birds", { method: "POST", body: s.id ? { id: s.id, name } : { name } }));
      S.birds = r.birds; S.hall = r.hall; haptic("success");
      if (!s.id) toast(`${esc(r.birds.at(-1)?.name || name)} joins your pigeons.`);
      S.sheet = s.id ? { type: "bird", id: s.id } : { type: "birds" }; renderSheet(); render();
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "grouprename") {
    const s = S.sheet;
    try { await busyBtn(btn, "…", () => api("group-name", { method: "POST", body: { id: s.id, name: String($("#f-gname", $layer)?.value || "") } })); await sync(); S.sheet = { type: "groupinfo", id: s.id }; renderSheet(); }
    catch (err) { showErr(err.message, err.field); }
    return;
  }
  if (kind === "newgroup" || kind === "groupadd") {
    const s = S.sheet, name = String($("#f-gname", $layer)?.value || "").trim();
    if (kind === "newgroup" && !name) return showErr("Give the group a name.", "gname");
    try {
      const r = await busyBtn(btn, "…", () => kind === "newgroup"
        ? api("groups", { method: "POST", body: { name, members: [...s.pick] } })
        : api("group-add", { method: "POST", body: { id: s.id, members: [...s.pick] } }));
      await sync();
      if (kind === "newgroup") { S.sheet = null; renderSheet(); go("chat", r.group.id); }
      else { S.sheet = { type: "groupinfo", id: s.id }; renderSheet(); toast(`Added to ${esc(group(s.id)?.name || "the group")}.`); }
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "add") {
    const h = form.h.value.trim().replace(/^@/, ""); if (!h) return;
    return addGo(h, btn);
  }
  const v = Object.fromEntries(new FormData(form));
  if (kind === "signup") {
    v.handle = String(v.handle || "").trim().replace(/^@/, "").toLowerCase();
    v.email = String(v.email || "").trim();
    if (!String(v.name || "").trim()) return showErr("Enter your name.", "name");
    if (!/^[a-z0-9_]{3,20}$/.test(v.handle)) return showErr("Handles use 3 to 20 letters, numbers or underscores.", "handle");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) return showErr("That doesn’t look like an email address.", "email");
    if (String(v.password || "").length < 10) return showErr("Use at least 10 characters for your password.", "password");
    { const n = await leakedCount(v.password); if (n) return showErr(leakedSay(n), "password"); }
    const keep = { ...v };
    S.making = 0;
    const fe = $(".ferr"); if (fe) { fe.hidden = true; fe.textContent = ""; }                  // the last attempt's error goes
    const slow = setTimeout(() => go("making"), 250);              // only if it takes a moment (it usually doesn't: it began while you typed)
    btn?.setAttribute("disabled", ""); if (btn) btn.textContent = "Creating…";
    try { await createAccount(keep); clearTimeout(slow); S.onbAuto = true; go("locpick"); }
    catch (err) {
      clearTimeout(slow); go("signup");
      for (const k of ["name", "handle", "email", "password"]) { const i = $(`#f-${k}`); if (i) i.value = keep[k] || ""; }
      const b2 = $("[data-form=signup] .btn"); if (b2) { b2.disabled = false; b2.textContent = "Create Account"; }
      onb.handleTouched = true;
      if (err.field === "invite") { S.inviteState = { ok: false, open: false, error: err.message }; go("welcome"); return toast(esc(err.message)); }
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
    const photo = !!S.avatarDraft;
    if (!Object.keys(changes).length && !photo) { S.sheet = null; return renderSheet(); }
    try {
      await busyBtn(btn, "Saving…", async () => {
        if (photo) await uploadAvatarDraft();
        if (Object.keys(changes).length) S.me = (await api("me", { method: "PATCH", body: changes })).me;
      });
      S.sheet = null; S.profileDraft = null; renderSheet(); render();
      toast(changes.handle ? `Saved. Friends now find you as @${esc(S.me.handle)}.` : photo && !changes.name ? "Profile photo updated." : "Profile saved.");
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "changepw") {
    if (!v.current) return showErr("Enter your current password.", "current");
    if (String(v.password || "").length < 10) return showErr("Use at least 10 characters for your new password.", "password");
    { const n = await leakedCount(v.password); if (n) return showErr(leakedSay(n), "password"); }
    try {
      await busyBtn(btn, "Changing…", async () => {
        let got;
        try { got = await vaultWith(v.current); } catch (e) { throw e.status === 401 ? Object.assign(new Error("Your current password isn’t right."), { field: "current" }) : e; }
        const { vault } = got, old = { lockKey: got.lockKey, proof: got.proof };
        let ecdh;
        try { ({ ecdh } = await E2E.unlock(old.lockKey, vault)); }
        catch (_) { throw Object.assign(new Error("Your current password isn’t right."), { field: "current" }); }
        const ns = E2E.newSalt(), nw = await E2E.fromPassword(v.password, ns);
        await api("password", { method: "POST", body: { oldProof: old.proof, salt: ns, proof: nw.proof, vault: await E2E.lock(nw.lockKey, { ecdh }) } });
        S.secretJwk = ecdh;
      });
      S.sheet = null; renderSheet();
      toast("Password changed. Any other phones were signed out.");
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "reauth") {
    if (!v.password) return showErr("Enter your password.", "password");
    try {
      await busyBtn(btn, "Checking…", async () => {
        const { salt } = await api("salt", { method: "POST", body: { email: S.me.email } });
        const { proof } = await E2E.fromPassword(v.password, salt);
        await api("reauth", { method: "POST", body: { proof } });
      });
      const s = S.sheet; S.sheet = s.back || null; renderSheet(); haptic("success"); s.resolve(true);
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "askpw") {
    try {
      const jwk = await busyBtn(btn, "Unlocking…", async () => {
        const { vault, lockKey } = await vaultWith(v.password);
        try { return (await E2E.unlock(lockKey, vault)).ecdh; } catch (_) { throw Object.assign(new Error("That password didn’t unlock your key."), { field: "password" }); }
      });
      S.secretJwk = jwk;
      const s = S.sheet; S.sheet = null; renderSheet(); s.resolve(jwk);
    } catch (err) { showErr(err.message, err.field); }
  }
}
// Sign-up's last steps: the passkey offer (where it works), then your first screen
function onbNext() { if (passkeysSupported()) go("pkoffer"); else finishOnboarding(); }
function finishOnboarding() {
  S.started = true;                               // a brand new account: nothing to wait for
  if (S.pendingAdd) { go("friends"); S.sheet = { type: "addfriend" }; return renderSheet(); }   // came from a friend's link
  go("messages");
}
async function afterSignIn() {
  await sync();
  refreshPush(); autoLocate();
  if (S.me.lat == null && !S.me.moon) return go("locpick");
  if (S.pendingAdd) { go("friends"); S.sheet = { type: "addfriend" }; return renderSheet(); }
  go("messages");
  if (S.pendingLink) { const h = S.pendingLink; S.pendingLink = null; openLink(h); }   // the link you came in on
}
// Profile pictures: centre-cropped square, 512px JPEG (which also drops location metadata).
// A ring fills around your photo in My Profile while it uploads.
// A new profile photo is only a preview until you tap Done; then it uploads,
// with a slim bar under it that fills smoothly.
async function uploadAvatarDraft() {
  const d = S.avatarDraft, b = $(".avedit", $layer);
  if (b && !$(".avbar", b)) b.insertAdjacentHTML("beforeend", '<i class="avbar" role="progressbar" aria-label="Uploading photo"><b></b></i>');
  b?.classList.add("uploading");
  const bar = b && $(".avbar b", b);
  const fill = smoothProgress((x) => { if (bar) bar.style.transform = `scaleX(${x})`; });
  fill.set(0.02);
  try {
    const r = await api("avatar", { method: "POST", blob: d.blob, onProgress: (f) => fill.set(f) });
    fill.set(1); await new Promise((res) => setTimeout(res, 300));
    S.me = r.me; S.avatars.set(`${S.me.id}:${S.me.avatarAt}`, d.url); S.avatarDraft = null;
  } finally { fill.stop(); b?.classList.remove("uploading"); b && $(".avbar", b)?.remove(); }
}
function dropAvatarDraft() { if (S.avatarDraft) { URL.revokeObjectURL(S.avatarDraft.url); S.avatarDraft = null; } }
async function setAvatar(file) {
  try {
    const bmp = await loadBitmap(file);
    const side = Math.min(bmp.width, bmp.height), size = Math.min(512, side);
    const c = document.createElement("canvas"); c.width = c.height = size;
    c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
    const jpg = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!jpg) throw new Error("That picture couldn’t be read. Try another one.");
    dropAvatarDraft();
    S.avatarDraft = { blob: jpg, url: URL.createObjectURL(jpg) };   // uploads when you tap Done
    renderSheet(true);
  } catch (err) { showErr(err.message || "That picture couldn’t be read. Try another one."); }
}
// Animated GIFs keep every frame: they're sent as they are (sealed like any
// photo) instead of being redrawn as a still JPEG. Only the picture, its timing
// and looping are kept; comments and other extra blocks, which can carry
// details nobody meant to share, are dropped.
const GIF_MAX = 7 * 1024 * 1024;
function cleanGif(u) {
  const sig = String.fromCharCode(...u.slice(0, 6));
  if (u.length < 14 || (sig !== "GIF89a" && sig !== "GIF87a")) return null;
  const w = u[6] | (u[7] << 8), h = u[8] | (u[9] << 8);
  let i = 13 + (u[10] & 0x80 ? 3 * (2 << (u[10] & 7)) : 0);
  const keep = [u.subarray(0, i)];
  // a run of data sub-blocks ends with an empty one; returns where the next block starts
  const skip = (j) => { while (j < u.length && u[j] !== 0) j += u[j] + 1; return j < u.length ? j + 1 : -1; };
  while (i < u.length) {
    const t = u[i];
    if (t === 0x3b) break;                                         // the end
    let j;
    if (t === 0x2c) {                                              // a frame: descriptor, colours, then its pixels
      if (i + 10 >= u.length) return null;
      j = skip(i + 10 + (u[i + 9] & 0x80 ? 3 * (2 << (u[i + 9] & 7)) : 0) + 1);
      if (j < 0) return null;
      keep.push(u.subarray(i, j));
    } else if (t === 0x21) {                                       // an extension block
      const label = u[i + 1];
      j = skip(i + 2); if (j < 0) return null;
      const app = label === 0xff && u[i + 2] === 11 ? String.fromCharCode(...u.slice(i + 3, i + 14)) : "";
      if (label === 0xf9 || label === 0x01 || app === "NETSCAPE2.0" || app === "ANIMEXTS1.0") keep.push(u.subarray(i, j));   // timing, text, looping
    } else return null;
    i = j;
  }
  keep.push(new Uint8Array([0x3b]));
  const out = new Uint8Array(keep.reduce((n, x) => n + x.length, 0));
  let o = 0; for (const x of keep) { out.set(x, o); o += x.length; }
  return { bytes: out, w, h };
}
async function prepGif(blob) {
  const g = cleanGif(new Uint8Array(await blob.arrayBuffer()));
  if (!g) return prepImage(blob);                                  // not a GIF we can read: send it as a still
  if (g.bytes.length > GIF_MAX) throw Object.assign(new Error("big"), { big: true });
  return { ...g, gif: true, preview: URL.createObjectURL(new Blob([g.bytes], { type: "image/gif" })) };
}
/* ---------- GIF search ----------
   Through InFlight's server (functions/_gifs.js): it asks GIPHY and fetches
   the GIFs, so GIPHY never sees who's looking. The one picked is attached like
   a GIF from the phone: sealed before it leaves. */
const gifPrev = new Map();            // id → blob URL of its little moving preview
async function loadGifs(more) {
  const s = S.sheet; if (!s || s.type !== "gifs" || s.busy || s.next == null) return;
  s.busy = true; drawGifs();
  const q = s.q;
  try {
    const d = await api(`gif-search?q=${encodeURIComponent(q)}&offset=${more ? s.next : 0}`);
    if (S.sheet !== s || s.q !== q) { s.busy = false; return; }
    s.list = more ? [...s.list, ...d.gifs.filter((g) => !s.list.some((x) => x.id === g.id))] : d.gifs; s.next = d.next; s.err = "";
  } catch (err) { s.err = err.message; }
  s.busy = false;
  if (S.sheet === s) drawGifs();
}
function drawGifs() {
  const s = S.sheet, grid = $(".gifgrid", $layer); if (!s || !grid) return;
  const tile = (g) => `<button type="button" class="giftile${s.picking === g.id ? " busy" : ""}" data-act="gifpick" data-id="${esc(g.id)}" aria-label="${esc(g.title || "GIF")}" data-ar="${(g.w / g.h).toFixed(3)}">${gifPrev.get(g.id) ? `<img src="${gifPrev.get(g.id)}" alt="">` : ""}</button>`;
  // two columns, each tile into whichever is shorter, so the grid packs like a wall of photos
  const cols = [[], []], hgt = [0, 0];
  for (const g of s.list) { const c = hgt[0] <= hgt[1] ? 0 : 1; cols[c].push(g); hgt[c] += g.h / g.w; }
  grid.innerHTML = s.list.length ? cols.map((c) => `<div class="gifcol">${c.map(tile).join("")}</div>`).join("")
    : `<p class="empty">${s.err ? esc(s.err) : s.busy ? "Finding GIFs…" : "No GIFs found. Try another word."}</p>`;
  grid.querySelectorAll("[data-ar]").forEach((el) => el.style.setProperty("--ar", el.dataset.ar));   // (inline style attributes are blocked)
  grid.parentElement.querySelector(".gifmore")?.remove();
  if (s.list.length && s.next != null) grid.insertAdjacentHTML("afterend", `<div class="gifmore"><button type="button" class="btn gray" data-act="gifmore"${s.busy ? " disabled" : ""}>${s.busy ? "Loading…" : "More GIFs"}</button></div>`);
  // previews come through the server too, then stay as blob URLs
  for (const g of s.list) if (!gifPrev.has(g.id)) {
    gifPrev.set(g.id, "");
    api(`gif/${encodeURIComponent(g.id)}?s=p`, { raw: true }).then((r) => r.blob()).then((b) => {
      gifPrev.set(g.id, URL.createObjectURL(b));
      const el = $(`.giftile[data-id="${CSS.escape(g.id)}"]`, $layer);
      if (el && !el.querySelector("img")) el.insertAdjacentHTML("afterbegin", `<img src="${gifPrev.get(g.id)}" alt="">`);
    }).catch(() => gifPrev.delete(g.id));
  }
}
async function pickGif(id, el) {
  const s = S.sheet; if (!s || s.picking) return;
  s.picking = id; el?.classList.add("busy");
  try {
    const r = await api(`gif/${encodeURIComponent(id)}?s=f`, { raw: true });
    const blob = await r.blob();
    if (S.sheet !== s) return;
    S.sheet = null; renderSheet();
    await setAttach(blob);
  } catch (err) { s.picking = null; el?.classList.remove("busy"); toast(esc(err.message)); }
}
async function setAttach(blob) {
  clearAttach();
  try {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const gif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;      // "GIF8"
    S.attach = gif ? await prepGif(blob) : await prepImage(blob); S.err = "";
  } catch (e) { S.err = e.big ? `That GIF is too big to send. Choose one under ${GIF_MAX / 1024 / 1024} MB.` : "That file couldn’t be opened as a photo."; }
  renderCompose();
}
function clearAttach() {
  if (S.attach && S.attach === S.sending) { S.attach = null; if ($compose) renderCompose(); return; }    // (send() keeps it, and tidies it)
  if (S.attach) URL.revokeObjectURL(S.attach.preview); S.attach = null; if ($compose) renderCompose();
}
// Upload progress glides: the browser reports progress in uneven jumps, so the
// shown figure eases towards the real one every frame instead of leaping.
function smoothProgress(draw) {
  let target = 0, shown = 0, raf = 0, last = 0;
  const step = (ts) => {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60; last = ts;
    shown += (target - shown) * (1 - Math.exp(-dt * 7));
    if (Math.abs(target - shown) < 0.002) shown = target;
    draw(shown);
    raf = shown === target ? 0 : requestAnimationFrame(step);
  };
  return {
    set(f) { target = Math.max(target, Math.min(1, f)); if (!raf) { last = 0; raf = requestAnimationFrame(step); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
// The photo's upload, shown on its card: only once Send is pressed.
const attachText = () => `${fmtBytes(S.attach.bytes.length)} · End-to-end encrypted`;
let upAnim = null;
function showUpload(stage, f = 0) {
  const a = $(".attach", $compose); if (!a || !S.attach) return;
  const txt = $(".atext", a), bar = $(".upbar b", a);
  a.classList.toggle("uploading", !!stage);
  a.classList.toggle("sealing", stage === "seal");
  if (!stage) { upAnim?.stop(); upAnim = null; bar.style.transform = "scaleX(0)"; txt.textContent = attachText(); return; }
  if (stage === "seal") { txt.textContent = "Encrypting…"; return; }
  if (!upAnim) upAnim = smoothProgress((x) => {
    bar.style.transform = `scaleX(${x})`;
    txt.textContent = x >= 1 ? "Finishing up…" : `Sending… ${Math.floor(x * 100)}%`;
  });
  upAnim.set(f);
}
/* ---------- the app lock ----------
   Optional, per phone: InFlight locks when you leave it (straight away, or
   after a minute, 15 minutes or an hour), and opens with Face ID, Touch ID
   or the phone's passkey. The check is the phone's own (a user-verified
   passkey assertion), so it works with no signal too. While locked nothing
   from your chats is drawn, and it's blurred in the app switcher. */
const LOCK_KEY = "inflight-lock", LOCK_AFTER = [[0, "Immediately"], [60e3, "After 1 Minute"], [15 * 60e3, "After 15 Minutes"], [HOUR, "After 1 Hour"]];
function lockPrefs() { try { const v = JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); return v && S.me && v.uid === S.me.id && v.on ? v : null; } catch (_) { return null; } }
function setLockPrefs(v) { try { if (v) localStorage.setItem(LOCK_KEY, JSON.stringify({ ...v, uid: S.me.id })); else localStorage.removeItem(LOCK_KEY); } catch (_) {} }
// a user-verified passkey check, on this phone
async function lockCheck() {
  const ids = (S.passkeys || []).map((p) => p.id).filter(Boolean);
  const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: RP_ID, userVerification: "required", timeout: 60000,
    allowCredentials: ids.map((id) => ({ type: "public-key", id: fromB64url(id) })) } });
  const ad = a && new Uint8Array(a.response.authenticatorData);
  if (!ad || !(ad[32] & 0x04)) throw new Error("not verified");           // the UV flag: Face ID, Touch ID or the passcode was used
  return true;
}
function drawLock() {
  let el = $(".lockscreen", root());
  if (!S.locked) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("div"); el.className = "lockscreen"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "InFlight is locked");
    el.innerHTML = `<div class="lockin"><div class="appicon">${I.bird}</div><h2>InFlight is locked</h2><p>Unlock with Face ID, Touch ID or your passkey.</p>
      <button type="button" class="btn wide" data-act="unlock">${I.face}Unlock</button><button type="button" class="link" data-act="lockout">Sign Out Instead</button></div>`;
    root().appendChild(el);
  }
}
async function unlock() {
  if (S.unlocking) return; S.unlocking = true;
  try { await lockCheck(); S.locked = false; haptic("success"); drawLock(); render(); sync(); }
  catch (_) { toast("Couldn’t unlock. Try again."); }
  finally { S.unlocking = false; }
}
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  const lp = lockPrefs(); if (!lp) return;
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); root()?.classList.add("veiled"); return; }
  root()?.classList.remove("veiled");
  if (!S.locked && hiddenAt && Date.now() - hiddenAt >= (lp.after || 0)) { S.locked = true; closePop(); S.sheet = null; render(); }
});

/* ---------- voice pigeons ----------
   Tap the microphone (when there's nothing typed) to record, up to 30
   seconds. The recording is sealed like a photo, with its own random key
   (labelled "voice", so it can't pass for a photo), and its shape travels
   inside the sealed scroll as 40 bars for the waveform. Like photos, the
   recording itself is deleted from the server 24 hours after it lands. */
const VOICE_MAX = 30000, VOICE_BARS = 40;
const voiceOK = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const voiceMime = (m) => (/^audio\/(mp4|webm|ogg|aac|mpeg)(;[\w=.,\s-]*)?$/.test(String(m || "")) ? String(m).split(";")[0] : "audio/mp4");
const fmtClip = (ms) => { const s = Math.max(1, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
// 40 bars, each 0–15, as 40 hex digits
const waveOf = (w) => { const s = /^[0-9a-f]{40}$/.test(String(w || "")) ? w : "4".repeat(VOICE_BARS); return [...s].map((c) => parseInt(c, 16) / 15); };
function voiceHtml(id, v, mine) {
  const bars = waveOf(v.w).map((h) => `<i data-h="${(0.18 + 0.82 * h).toFixed(2)}"></i>`).join("");   // (heights set after drawing: no inline styles here)
  const ready = !!S.photos.get(id), playing = S.player?.id === id && !S.player.paused;
  return `<span class="voice${playing ? " playing" : ""}" data-vid="${esc(id)}">
    <button type="button" class="vplay" data-act="vplay" data-id="${esc(id)}" aria-label="${playing ? "Pause" : "Play"} voice pigeon, ${fmtClip(v.d)}"${ready ? "" : " disabled"}>${playing ? I.pause : I.play}</button>
    <span class="vwave" aria-hidden="true">${bars}</span><span class="vdur">${fmtClip(v.d)}</span></span>`;
}
// one player for every voice pigeon; the bars fill in as it plays
function voicePlay(id) {
  const url = S.photos.get(id); if (!url) return;
  const pl = S.player || (S.player = new Audio());
  if (pl.id === id && !pl.paused) { pl.pause(); return voiceShow(); }
  if (pl.id !== id) { pl.pause(); pl.src = url; pl.id = id; }
  pl.onended = () => { pl.currentTime = 0; voiceShow(); };
  pl.play().then(() => { haptic("tick"); voiceShow(); requestAnimationFrame(voiceFrame); }).catch(() => toast("Couldn’t play that voice pigeon on this phone."));
}
function voiceShow() {
  const pl = S.player;
  root().querySelectorAll(".voice[data-vid]").forEach((el) => {
    const on = pl && pl.id === el.dataset.vid, playing = on && !pl.paused, b = $(".vplay", el);
    el.classList.toggle("playing", playing);
    if (b && b.dataset.state !== String(playing)) { b.dataset.state = String(playing); b.innerHTML = playing ? I.pause : I.play; b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/^(Play|Pause)/, playing ? "Pause" : "Play")); }
    const f = on && pl.duration > 0 && isFinite(pl.duration) ? pl.currentTime / pl.duration : 0;
    el.style.setProperty("--p", f.toFixed(4));
    const bars = $(".vwave", el)?.children || [];
    for (let i = 0; i < bars.length; i++) bars[i].classList.toggle("on", on && (i + 0.5) / bars.length <= f);
    const d = $(".vdur", el); if (d && on && (playing || pl.currentTime > 0)) d.textContent = fmtClip(Math.max(0, (pl.duration - pl.currentTime) * 1000));
  });
}
function voiceFrame() { voiceShow(); if (S.player && !S.player.paused) requestAnimationFrame(voiceFrame); }

let rec = null;
let recAsking = false;
async function recStart() {
  if (rec || recAsking || S.busy) return;
  let stream; const chat = S.chat;
  recAsking = true;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { return toast(e?.name === "NotAllowedError" ? "InFlight needs the microphone for voice pigeons. You can allow it in Settings." : "Couldn’t use the microphone."); }
  finally { recAsking = false; }
  if (S.view !== "chat" || S.chat !== chat || S.busy || S.attach) { stream.getTracks().forEach((t) => t.stop()); return; }   // (left, or busy, while it asked)
  const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((m) => window.MediaRecorder.isTypeSupported?.(m)) || "";
  let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined); }
  catch (_) { stream.getTracks().forEach((t) => t.stop()); return toast("Couldn’t record on this phone."); }
  const AC = window.AudioContext || window.webkitAudioContext, ac = AC ? new AC() : null, an = ac ? ac.createAnalyser() : null;
  if (ac) { an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an); }
  rec = { chat: S.chat, stream, mr, ac, an, chunks: [], levels: [], t0: performance.now(), mime: (mr.mimeType || mime || "audio/webm").split(";")[0], buf: an ? new Float32Array(an.fftSize) : null };
  mr.ondataavailable = (e) => { if (e.data?.size) rec?.chunks.push(e.data); };
  mr.start(250);
  haptic("tick");
  $(".crow", $compose).hidden = true; $(".recbar", $compose).hidden = false; $(".recwave", $compose).innerHTML = "";
  requestAnimationFrame(recFrame);
}
function recFrame() {
  if (!rec) return;
  const ms = performance.now() - rec.t0;
  if (rec.an) {
    rec.an.getFloatTimeDomainData(rec.buf);
    let sum = 0; for (const v of rec.buf) sum += v * v;
    rec.levels.push(Math.min(1, Math.sqrt(sum / rec.buf.length) * 4));
  }
  $(".rectime", $compose).textContent = fmtClip(ms);
  // the live waveform: the last few seconds, newest on the right
  const w = $(".recwave", $compose), n = Math.max(12, Math.floor(w.clientWidth / 5)), lv = rec.levels.slice(-n * 3);
  const bars = Array.from({ length: n }, (_, i) => { const a = lv.slice(i * 3, i * 3 + 3); return a.length ? Math.max(...a) : 0; });
  while (w.children.length < n) w.appendChild(document.createElement("i"));
  while (w.children.length > n) w.lastChild.remove();
  bars.forEach((h, i) => w.children[i].style.setProperty("--h", (0.12 + 0.88 * h).toFixed(2)));
  if (ms >= VOICE_MAX) return recStop(true);
  requestAnimationFrame(recFrame);
}
async function recStop(keep) {
  const r = rec; if (!r) return;
  rec = null;
  const ms = Math.min(VOICE_MAX, performance.now() - r.t0);
  await new Promise((res) => { r.mr.onstop = res; try { r.mr.state !== "inactive" ? r.mr.stop() : res(); } catch (_) { res(); } });
  r.stream.getTracks().forEach((t) => t.stop()); r.ac?.close().catch(() => {});
  $(".recbar", $compose).hidden = true; $(".crow", $compose).hidden = false;
  if (keep && (S.view !== "chat" || S.chat !== r.chat)) keep = false;      // its chat isn't open any more: it goes nowhere
  if (!keep) { haptic("tick"); return renderCompose(); }
  if (ms < 800 || !r.chunks.length) { toast("Hold on a little longer to record."); return renderCompose(); }
  const blob = new Blob(r.chunks, { type: r.mime }), bytes = new Uint8Array(await blob.arrayBuffer());
  // the shape: 40 bars over the whole recording, scaled to its loudest
  const lv = r.levels.length ? r.levels : [0.3], step = lv.length / VOICE_BARS, top = Math.max(0.05, ...lv);
  const wave = Array.from({ length: VOICE_BARS }, (_, i) => { const a = lv.slice(Math.floor(i * step), Math.max(Math.floor(i * step) + 1, Math.floor((i + 1) * step))); return Math.round(15 * Math.min(1, Math.max(...a) / top)).toString(16); }).join("");
  S.attach = { voice: true, bytes, mime: r.mime, ms: Math.round(ms), wave, preview: URL.createObjectURL(blob) };
  renderCompose();                                // (now there's something to send)
  await send();
}

/* ---------- the outbox: pigeons waiting for signal ----------
   A message sent with no connection is already sealed; it waits here (in
   IndexedDB, as ciphertext, never as words) and takes off by itself once the
   phone is back online. The server takes each id once, so sending one twice
   is harmless. If the server turns one down (not your turn any more, say) it
   stays, marked, for you to retry or delete. */
const outKey = () => "outbox:" + S.me.id;
async function outboxSave() { try { await idb.set(outKey(), S.outbox.map(({ id, to, path, meta, blob, kind, at, err }) => ({ id, to, path, meta, blob, kind, at, err }))); } catch (_) {} }
async function outboxAdd(o) { S.outbox.push(o); await outboxSave(); }
async function outboxLoad() {
  let list = [];
  try { list = (await idb.get(outKey())) || []; } catch (_) {}
  S.outbox = list.filter((o) => o && o.id);
  for (const o of S.outbox) { try { await outboxOpen(o); } catch (e) { console.warn("outbox", e?.message); o.err = o.err || "This pigeon couldn’t be opened on this phone."; } }
}
// what one says, opened again with this phone's key (after a reload)
async function outboxOpen(o) {
  if (!S.plain.has(o.id)) {
    const g = group(o.to);
    if (g) await decryptGroup(g, { id: o.id, from: S.me.id, body: o.meta.body, key: o.meta.keys[S.me.id] });
    else if (friend(o.to)) await decrypt(o.to, { id: o.id, from: S.me.id, to: o.to, ct: o.meta.ct });
  }
  const p = S.plain.get(o.id);
  if (o.blob && (p?.p || p?.v) && !S.photos.has(o.id)) {
    try {
      const plain = p.v ? await E2E.openPhoto(o.id, p.v, o.blob, "voice") : await E2E.openPhoto(o.id, p.p, o.blob);
      S.photos.set(o.id, URL.createObjectURL(new Blob([plain], { type: p.v ? voiceMime(p.v.m) : p.p.m === "image/gif" ? "image/gif" : "image/jpeg" })));
    } catch (_) {}
  }
}
let flushing = null;
async function outboxFlush(force) {
  if (!S.me || !S.outbox.length || flushing) return flushing;
  if (navigator.onLine === false && !force) return;
  flushing = (async () => {
    let sent = 0;
    for (const o of [...S.outbox]) {
      if (o.err && !force) continue;
      try {
        if (o.blob) {
          const form = new FormData();
          form.append("meta", JSON.stringify(o.meta));
          form.append("photo", new Blob([o.blob], { type: "application/octet-stream" }), "photo.bin");
          await api(o.path, { method: "POST", form });
        } else await api(o.path, { method: "POST", body: o.meta });
        sent++;
      } catch (e) {
        if (e.offline) break;                                   // still no signal: try again later
        // a hiccup (the server busy, too many at once): it stays waiting and goes next time; only a real "no" stops it
        if (!e.status || e.status >= 500 || e.status === 408 || e.status === 429) break;
        if (e.status !== 409 || !/already sent/.test(e.message)) { o.err = e.message; await outboxSave(); continue; }
      }
      S.outbox = S.outbox.filter((x) => x.id !== o.id); await outboxSave();
      S.fresh.set(o.id, Date.now());
    }
    if (sent) { haptic("success"); toast(sent === 1 ? "Your pigeon took off." : `${sent} pigeons took off.`); }
    if (sent || S.outbox.some((o) => o.err)) { for (const id of new Set([S.chat])) if (id && S.view === "chat") await loadChat(id).catch(() => {}); render(); }
  })();
  try { await flushing; } finally { flushing = null; }
}
window.addEventListener("online", () => { S.offline = false; renderOffline(); outboxFlush(); sync(); });
window.addEventListener("offline", () => { S.offline = true; renderOffline(); });
// a waiting pigeon in its chat: your message, with a badge
function outboxBubbles(chat) {
  return S.outbox.filter((o) => o.to === chat).map((o) => {
    const p = S.plain.get(o.id) || { t: "" }, ph = S.photos.get(o.id);
    const pic = p.v ? voiceHtml(o.id, p.v, true) : p.p ? `<div class="ph"${ph ? "" : ' data-empty="1"'}>${ph ? `<img src="${esc(ph)}" alt="${p.p.m === "image/gif" ? "GIF" : "Photo"}">` : `<span>${p.p.m === "image/gif" ? "GIF" : "Photo"}</span>`}</div>` : "";
    return `<div class="b me pending${o.err ? " failed" : ""}" data-mid="${esc(o.id)}">${pic}${esc(p.t || "").replace(/\n/g, "<br>")}</div>
      <div class="meta me"><button type="button" class="fl outq${o.err ? " bad" : ""}" data-act="outmenu" data-id="${esc(o.id)}">${o.err ? `${I.warn} Not sent · ${esc(o.err)}` : `${I.clock} Waiting for signal`}</button></div>`;
  }).join("");
}

async function send() {
  const text = (dumbText() ?? $ta.value).trim();
  if ((!text && !S.attach) || S.busy || $(".send", $compose).disabled) return;
  if (S.sendKind === "standard" && S.outbox.some((o) => o.to === S.chat && o.kind === "standard" && !o.err)) { S.err = "Your pigeon is still waiting for signal. A swift, turbo or rocket can go too."; renderCompose(); return; }
  S.busy = true; S.err = ""; renderCompose();
  // what's being sent belongs to this chat, even if you leave it before it's gone
  const to = S.chat, att = S.attach, here = () => S.view === "chat" && S.chat === to;
  S.sendingTo = to; S.sending = att;
  const tidy = () => {
    if (att) { if (att.preview && !(att.gif || att.voice)) URL.revokeObjectURL(att.preview); if (S.attach === att) S.attach = null; }
    if (here()) { $ta.value = ""; fitTa(); } else S.drafts.delete(to);
  };
  try {
    const mc = !group(to) && moonChat(friend(to)), id = uuid(), sc = !mc && schedFor(to), vi = !mc && !sc && viaFor(to);    // (a lunar pigeon goes straight there, now)
    const payload = { t: text };
    const rt = S.replyTo && S.replyTo.chat === to ? S.replyTo : null;
    if (rt) payload.q = { id: rt.id, from: rt.from, t: rt.t, ...(rt.p ? { p: rt.p } : {}) };      // sealed with the rest
    let blob = null;
    if (att?.voice) {
      showUpload("seal");
      const sealed = await E2E.sealPhoto(id, att.bytes, "voice");
      payload.v = { k: sealed.k, iv: sealed.iv, m: att.mime, d: att.ms, w: att.wave };
      blob = sealed.data;
    } else if (att) {
      showUpload("seal");
      const sealed = await E2E.sealPhoto(id, att.bytes);
      payload.p = { k: sealed.k, iv: sealed.iv, w: att.w, h: att.h, ...(att.gif ? { m: "image/gif" } : {}) };
      blob = sealed.data;
    }
    const once = !!blob && !att?.voice && !att?.gif;            // photos are view-once; GIFs and voice pigeons aren't
    const g = group(to), bd = S.sendKind === "dumb" ? null : birdFor(), carry = { ...(bd ? { bird: bd.id } : {}), ...(blob ? { once } : {}) };
    let meta;
    const route = routeStyle() === "fastest" ? {} : { route: routeStyle() };   // the way it goes
    if (g) {
      // sealed once; its key sealed for each member (and for me, so my other phones can read it)
      const { body, key, h } = await E2E.sealGroup({ id, from: S.me.id, group: g.id, type: "msg" }, payload);
      const keys = {};
      for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
      meta = { id, group: g.id, body, keys, pigeon: S.sendKind, ...carry, ...route };
    } else meta = { id, to, ct: await E2E.seal(await base(to), { id, from: S.me.id, to, type: "msg" }, payload), pigeon: S.sendKind, ...carry, ...(vi ? {} : route), ...(sc ? { landAt: sc.at } : {}),
      ...(!vi && !sc && noShipOn() && S.sendKind === "standard" ? { noShip: true } : {}),
      // a stopover: the friend on the way gets their own sealed copy (words only; photos stay between you two)
      ...(vi ? { via: vi.id, viaCt: await E2E.seal(await base(vi.id), { id, from: S.me.id, to: vi.id, type: "via" }, { t: text, ...(blob ? { ph: 1 } : {}) }) } : {}) };
    const path = g ? "group-messages" : "messages";
    // no signal: it waits on the perch (sealed already) and takes off once there is
    const queue = async () => {
      await outboxAdd({ id, to, path, meta, blob, kind: S.sendKind, at: Date.now() });
      S.plain.set(id, payload);
      if (att && !once) { S.photos.set(id, att.preview); att.preview = null; }
      tidy();
      if (rt) S.replyTo = null;
      if (sc) S.sched = null; if (vi) S.via = null; S.noShip = null;
      S.pick = null; S.stick = true; showUpload(null);
      haptic("tick"); render();
    };
    if (navigator.onLine === false) { await queue(); S.busy = false; renderCompose(); return; }
    let r;
    try {
    if (blob) {
      const form = new FormData();
      form.append("meta", JSON.stringify(meta));
      form.append("photo", new Blob([blob], { type: "application/octet-stream" }), "photo.bin");
      showUpload("send", 0);
      r = await api(path, { method: "POST", form, size: blob?.size ?? blob?.byteLength, onProgress: (f) => showUpload("send", f) });
      showUpload("send", 1); await new Promise((res) => setTimeout(res, 300));   // let the bar finish its glide
      upAnim?.stop(); upAnim = null;
    } else r = await api(path, { method: "POST", body: meta });
    } catch (e) { if (!e.offline) throw e; upAnim?.stop(); upAnim = null; await queue(); S.busy = false; renderCompose(); return; }
    S.pick = null;                    // next time, back to the default
    { const f = friend(to), was = f?.streak, s = r.streak;
      if (f && s) { f.streak = s; if (s.n >= STREAK_MIN && (!was || !was.today || was.n < s.n)) toast(`${I.flame} ${s.n}-day streak with ${esc(first(f.name))}`); } }
    if (r.message.mystery) {
      const k = kindOf(r.message), word = { rocket: "A rocket pigeon!", turbo: "A turbo pigeon!", swift: "A swift pigeon.", standard: "A standard pigeon.", dumb: "A dumb pigeon…" }[k];
      if (r.me) S.me = r.me;
      setTimeout(() => toast(`${pg(k, S.me.skin)} ${word} ${r.message.flock ? "Off it goes." : `It lands ${esc(atTime(r.message.deliverAt))}.`}`), 350);
      if (k === "rocket") haptic("success");
    }
    S.birdPick = null; const flew = r.message.bird?.id && S.birds.find((b) => b.id === r.message.bird.id); if (flew) flew.state = "flying";
    haptic("success");
    if (rt) S.replyTo = null;
    if (sc) { S.sched = null; if (r.me) S.me = r.me; toast(`Scheduled. It lands ${fmtLand(r.message.deliverAt)}.`); }
    S.noShip = null;
    if (vi) { S.via = null; toast(`It’ll stop with ${esc(first(friend(vi.id)?.name || "your friend"))} on the way.`); }
    S.plain.set(id, payload);
    if (att && !once) { S.photos.set(id, att.preview); att.preview = null; }   // keep the preview as our own copy (not of a view-once photo)
    tidy(); S.stick = true;
    const list = S.msgs.get(to) || []; list.push(r.message); S.msgs.set(to, list);
    S.fresh.set(r.message.id, Date.now());
    loadSkies();                      // it's in the air now: ready for the strip on Messages
    render();                         // show it now; on a slow connection the sync below can outlast the pop
    await sync();
    offerNotify();
  } catch (err) {
    // (the browser's own errors, a key it can't use, can come with no words: never a silent nothing)
    const say = err.message || "Couldn’t seal this pigeon. Try again, or check their safety number.";
    if (here()) S.err = say; else toast(esc(say)); showUpload(null);
  }
  if (att?.preview && S.attach !== att) URL.revokeObjectURL(att.preview);     // (left behind when you left its chat, and not kept)
  S.busy = false; S.sendingTo = null; S.sending = null; renderCompose();
}
// Drawn buttons (a passport's stamps: SVG, not <button>) answer Enter and Space too; the passport turns with the arrow keys
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target instanceof SVGElement && e.target.getAttribute("role") === "button" && e.target.dataset.act) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && S.sheet?.type === "passport" && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
    const book = $(".ppbook", $layer); if (book) { e.preventDefault(); book.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * book.clientWidth, behavior: STILL.matches ? "auto" : "smooth" }); }
  }
});
$(".page").addEventListener("keydown", (e) => {
  const f = e.target.closest?.("form[data-form=signup], form[data-form=signin]");
  if (f && e.key === "Enter" && e.target.tagName === "INPUT") {
    const ins = [...f.querySelectorAll("input")], i = ins.indexOf(e.target);
    if (i < ins.length - 1) { e.preventDefault(); ins[i + 1].focus(); return; }
  }
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", document.documentElement.classList.contains("night") ? "#03050c" : dark ? "#1c1c1f" : "#f2f2f7");
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
  // told the server about this one lately (same account, same phone): no need again on every launch
  const mark = `${S.me?.id}|${sub.endpoint}`;
  let last = null; try { last = JSON.parse(localStorage.getItem("inflight-pushsub") || "null"); } catch (_) {}
  if (ask || !last || last.k !== mark || Date.now() - last.at > DAY) {
    await api("push-sub", { method: "POST", body: sub.toJSON() });
    try { localStorage.setItem("inflight-pushsub", JSON.stringify({ k: mark, at: Date.now() })); } catch (_) {}
  }
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
async function loadSessions() {
  try { const { sessions } = await api("sessions"); if (S.sheet?.type === "sessions") { S.sheet.list = sessions; S.sheet.err = null; renderSheet(); } }
  catch (err) { if (S.sheet?.type === "sessions") { S.sheet.err = err.message; renderSheet(); } else toast(esc(err.message)); }
}
async function confirmEmail(token) {
  try {
    const r = await api("confirm-email", { method: "POST", body: { token } });
    haptic("success"); toast(`Email confirmed for @${esc(r.handle)}.`);
    if (S.me && S.me.handle === r.handle) { S.me.emailOk = true; if (S.sheet) renderSheet(); }
  } catch (err) { toast(esc(err.message)); }
}
async function setEmailNotify(on) {
  try { const r = await api("me", { method: "PATCH", body: { notifyEmail: on } }); S.me = r.me; render(); if (S.sheet?.type === "notifications") renderSheet(); toast(!on ? "Emails are off." : S.me.emailOk === false ? `Confirm ${esc(S.me.email)} first: tap the link we emailed you.` : `We’ll email ${esc(S.me.email)} when a pigeon has been waiting a while.`); }
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
async function openFlightLog(at) {
  const sh = S.sheet = { type: "flightlog", data: null }; renderSheet();
  try {
    sh.data = await api("flight-log"); if (S.sheet !== sh) return;
    renderSheet();
    if (at === "skins") setTimeout(() => $(".badges.skins", $layer)?.previousElementSibling?.scrollIntoView({ block: "start", behavior: "smooth" }), 350);     // straight to the looks
  }
  catch (err) { if (S.sheet === sh) { S.sheet = null; renderSheet(); } toast(esc(err.message)); }
}
// Links from notifications and emails: #open=<friend> opens that chat,
// #requests the friend requests, #account the Account tab, #flightlog your
// Flight Log. Opened while signed out, they wait until you've signed in.
function openLink(hash) {
  const o = /#open=([0-9a-f-]{36})/.exec(hash || ""), rq = /#requests/.test(hash || ""), acc = /#account\b/.test(hash || ""), log = /#flightlog\b/.test(hash || "");
  if (!o && !rq && !acc && !log) return false;
  if (location.hash) history.replaceState(null, "", location.pathname);
  if (!S.me) { S.pendingLink = hash; return true; }
  closePop(); S.sheet = null; renderSheet();
  if (log) { go("account"); openFlightLog(); }
  else if (acc) go("account");
  else if (o && (friend(o[1]) || group(o[1]))) go("chat", o[1]);
  else { go("friends"); if (S.incoming.length) { S.sheet = { type: "requests" }; renderSheet(); } }
  return true;
}

/* ============================================================
   Start
   ============================================================ */
// Dynamic Type: iPhones set the reading size in Settings; message text, chat
// rows and the message box follow it (the rest stays put, so nothing breaks)
function textSize() {
  const probe = document.createElement("span"); probe.className = "tsprobe"; probe.textContent = "x"; document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize); probe.remove();
  const ts = px > 0 && CSS.supports?.("font", "-apple-system-body") ? Math.min(1.6, Math.max(0.85, px / 17)) : 1;
  document.documentElement.style.setProperty("--ts", ts.toFixed(3));
}
// A computer: the page says InFlight isn't available (theme.js decided, before
// anything was drawn), with a code to scan that opens this same link on a phone.
// Nothing else runs: no session, no sync, nothing stored.
function notAvailable() {
  const site = $(".na-site"); if (site) site.textContent = NEW_HOME ? NEW_HOME.replace(/^https?:\/\//, "") : HERE();
  const box = $(".na-qr"); if (!box) return;
  const link = /#(add|reset|verify|open|invite)=/.test(location.hash);
  box.innerHTML = `${qrSvg(NEW_HOME ? `${NEW_HOME}/${location.hash}` : location.href, { title: link ? "QR code for this link" : "QR code for InFlight" })}<small>${link ? "Scan with your phone’s camera to open this link there." : "Scan with your phone’s camera to open it there."}</small>`;
  box.hidden = false;
}
// The move to chat.georgefarrowgreen.com: the first time InFlight starts at the new
// address on a phone, it brings over what the phone kept at the old one (the sign-in,
// unsent pigeons, trusted keys, settings) from a hidden page there (pigeon/handover.js),
// so nobody has to sign in again. Once only: signing out here doesn't bring it back.
const OLD_HOME = /^chat\./.test(location.host) ? `${location.protocol}//${location.host.slice(5)}` : null;
async function moveIn() {
  const DONE = "inflight-movedin";
  try { if (!OLD_HOME || localStorage.getItem(DONE) || await idb.get("session")) return; } catch (_) { return; }
  const got = await new Promise((res) => {
    const f = document.createElement("iframe");
    const done = (v) => { clearTimeout(late); removeEventListener("message", on); f.remove(); res(v); };
    const on = (e) => { if (e.origin === OLD_HOME && e.source === f.contentWindow && e.data?.inflight === "handover") done(e.data); };
    const late = setTimeout(() => done(null), 5000);      // (the old address not answering: try again next time)
    addEventListener("message", on);
    f.hidden = true; f.title = "InFlight’s old address"; f.src = new URL("pigeon/handover", OLD_HOME + "/").href;   // (written so: the new address rewrites "/pigeon/…" paths to its root)
    document.body.append(f);
  });
  if (!got) return;
  const kv = got.kv && typeof got.kv === "object" ? got.kv : {}, ls = got.ls && typeof got.ls === "object" ? got.ls : {};
  // signed in there (with the key it signs in with): that sign-in, and all that goes with it
  if (kv.session?.token && kv.session.priv instanceof CryptoKey) for (const [k, v] of Object.entries(kv)) await idb.set(k, v);
  try {
    // (the old address's note of its push subscription is the old address's; this one makes its own)
    for (const [k, v] of Object.entries(ls)) if (/^inflight-[\w-]+$/.test(k) && k !== "inflight-pushsub" && typeof v === "string" && localStorage.getItem(k) == null) localStorage.setItem(k, v);
    localStorage.setItem(DONE, String(Date.now()));
  } catch (_) {}
  applyTheme();
}

// At the old address: say where InFlight went (at most once a day, and from Account any time)
function movedNote(force) {
  if (!NEW_HOME) return;
  try { const last = Number(localStorage.getItem("inflight-movednote") || 0); if (!force && Date.now() - last < DAY) return; localStorage.setItem("inflight-movednote", String(Date.now())); } catch (_) {}
  if (!force && (S.locked || S.sheet)) return;
  S.sheet = { type: "moved" }; renderSheet();
}

async function start() {
  if (document.documentElement.dataset.device === "computer") return notAvailable();
  // at the old address, signed out in a browser: straight to the new one, with whatever link
  // brought you (an invite, a reset); a Home Screen app stays, to say how to move (movedNote)
  if (NEW_HOME && !standalone() && !(await idb.get("session"))?.token) return location.replace(`${NEW_HOME}/${location.hash}`);
  mount();
  textSize(); window.addEventListener("focus", textSize);
  if (/#(open=|requests|account\b|flightlog\b)/.test(location.hash)) { S.pendingLink = location.hash; history.replaceState(null, "", location.pathname); }
  navigator.serviceWorker?.addEventListener?.("message", (e) => { if (e.data?.inflight === "open") openLink(e.data.hash); else if (e.data?.inflight === "sync" && S.me) sync(); });
  const m = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
  if (m) { S.pendingAdd = m[1].toLowerCase(); history.replaceState(null, "", location.pathname); }
  // a confirm-your-email link: works signed in or not, on any phone
  const cf = /#verify=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (cf) { history.replaceState(null, "", location.pathname); confirmEmail(cf[1]); }
  // an invite: kept for this visit (a reload keeps it too), out of the address bar
  const iv = /#invite=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (iv) { setInvite(iv[1]); history.replaceState(null, "", location.pathname); }
  else { try { S.invite = sessionStorage.getItem("inflight-invite") || null; } catch (_) {} }
  // a reset link: take the token out of the address bar straight away
  const rs = /#reset=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (rs) { S.resetToken = rs[1]; history.replaceState(null, "", location.pathname); }
  if (!window.crypto?.subtle || !window.indexedDB) { S.view = "welcome"; render(); return toast("This browser can’t run InFlight’s encryption. Try Safari or Chrome."); }
  await moveIn();
  const saved = await idb.get("session");
  if (S.resetToken) {
    // whoever is signed in here stays signed in until a new password is actually set
    S.resetFrom = saved?.token ? saved : null;
    go("reset");
  } else if (saved?.token && saved.priv) {
    S.token = saved.token; S.me = saved.me; S.priv = saved.priv;
    S.myPub = saved.pub || saved.me.pub;          // sessions saved before this kept the key as it was at sign-in
    if (!saved.pub) idb.set("session", { ...saved, pub: S.myPub });
    S.fp = await E2E.fingerprint(S.myPub);
    S.pins = (await idb.get("pins:" + saved.me.id)) || {};
    if (!Object.keys(S.pins).length) await restorePins();
    else if (!(await idb.get("pinsup:" + saved.me.id).catch(() => null))) savePins();      // trusted before backups: save them now
    S.view = S.pendingAdd ? "friends" : "messages";
    if (lockPrefs()) S.locked = true;               // the app lock: locked before anything is drawn
    await cacheLoad();                             // what you saw last time, at once
    await outboxLoad();
    render();
    // (the app is up by now: anything below going wrong mustn't stop the polling and the rest)
    try {
      // back from an update: the chat you were in (if it was moments ago)
      try { const here = JSON.parse(sessionStorage.getItem("inflight-here") || "null"); sessionStorage.removeItem("inflight-here");
        if (here && Date.now() - here.at < 60e3 && !S.pendingLink && (friend(here.chat) || group(here.chat))) S.pendingLink = "#open=" + here.chat; } catch (_) {}
      // a chat to open (a notification, or the one you were in) that's already on this phone: at once, not after the network
      if (S.pendingLink && !S.locked) { const id = /#open=([\w-]+)/.exec(S.pendingLink)?.[1]; if (id && (friend(id) || group(id))) { const h = S.pendingLink; S.pendingLink = null; openLink(h); } }
      await sync();
      outboxFlush();
      if (S.me && S.me.lat == null && !S.me.moon) go("locpick");
      else if (S.pendingAdd) { S.sheet = { type: "addfriend" }; renderSheet(); }
      else if (S.pendingLink) { const h = S.pendingLink; S.pendingLink = null; openLink(h); }
      refreshPush(); autoLocate(); movedNote();
    } catch (e) { console.error("start", e); }
  } else { go("welcome"); movedNote(); }
  // a reset or add-a-friend link opened while InFlight is already open in this tab
  window.addEventListener("hashchange", async () => {
    if (openLink(location.hash)) return;
    const iv = /#invite=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
    if (iv) { history.replaceState(null, "", location.pathname); setInvite(iv[1]); if (!S.me) { if (S.view === "welcome") render(); else go("welcome"); } else toast("You already have an account, so this invite stays unused."); return; }
    const cf = /#verify=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
    if (cf) { history.replaceState(null, "", location.pathname); return confirmEmail(cf[1]); }
    const r = /#reset=([A-Za-z0-9_-]{40,50})/.exec(location.hash), a = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
    if (!r && !a) return;
    if (r && S.token) return location.reload();     // starts over on the reset screen, still signed in underneath
    history.replaceState(null, "", location.pathname);
    if (r) { S.resetToken = r[1]; S.view = "loading"; go("reset"); }
    else { S.pendingAdd = a[1].toLowerCase(); if (S.me) { go("friends"); S.sheet = { type: "addfriend" }; renderSheet(); } }
  });
  setInterval(() => { if (!AUTH_VIEWS.has(S.view) && $view) live(); flightCheck(); }, 1000);
  // every 15 s while open; after failures, less often (up to every 2 minutes) until one works
  let skipped = 0;
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const every = Math.min(8, 2 ** Math.max(0, (S.syncFails || 0) - 1));
    if (++skipped < every) return;
    skipped = 0; sync();
  }, POLL_MS);
  window.addEventListener("online", () => { S.syncFails = 0; sync(); });
  setInterval(() => { if (document.visibilityState === "visible") autoLocate(); }, AUTO_EVERY);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(); checkUpdate(); autoLocate(); } else { stopLocWatch(); if (rec) recStop(false); } });     // (a recording stops when you leave the app)
  setInterval(checkUpdate, UPDATE_MS);
}

/* ---------------- updates ----------------
   The page carries a fingerprint of the app. When a newer one is live, an open
   copy reloads itself, unless you're in the middle of something, when it asks. */
// (the page's own version: its files' fingerprints, which the server checks before a phone may keep them)
const VERSION = document.querySelector('meta[name="inflight-version"]')?.content || "";
// a reload for a new version comes back to the chat you were in, where you were in it
function reloadHere() {
  try { if (S.me && S.view === "chat" && S.chat) sessionStorage.setItem("inflight-here", JSON.stringify({ chat: S.chat, at: Date.now() })); } catch (_) {}
  location.reload();
}
const UPDATE_MS = 5 * 60 * 1000;
async function checkUpdate() {
  if (!VERSION || document.visibilityState !== "visible") return;
  let live = "";
  try { live = /name="inflight-version" content="([\w-]+)"/.exec(await (await fetch("/pigeon/", { cache: "no-store" })).text())?.[1] || ""; } catch { return; }
  if (!live || live === VERSION) return;
  const busy = S.sheet || S.attach || ($ta && $ta.value.trim()) || (AUTH_VIEWS.has(S.view) && S.view !== "welcome") || $(".asheet, .menu-pop")
    || S.view === "chat" || inField(document.activeElement)               // (never under your fingers: a reload would take the keyboard away)
    || rec || onceOpen || (S.player && !S.player.paused) || S.busy;       // (never mid-recording, mid-photo, mid-voice-note or mid-send)
  if (!busy) return reloadHere();
  toast("A new version of InFlight is ready.", "Update", reloadHere);
}
// When a pigeon you can see lands, fetch it straight away instead of waiting for the next poll.
let nextLanding = 0;
function flightCheck() {
  if (!S.me) return;
  const t = now();
  const lands = [];
  for (const f of S.friends) if (f.last?.flying) lands.push(f.last.deliverAt);
  for (const list of S.msgs.values()) for (const m of list) if (m.flying) lands.push(m.waiting ? m.sentAt : m.deliverAt);
  const due = lands.filter((x) => x <= t);
  if (due.length && Date.now() > nextLanding) { nextLanding = Date.now() + 5000; setTimeout(sync, 1500); }
}
// if starting goes wrong, say so and offer a way out, rather than "Opening InFlight…" for ever
function bootFail(err) {
  console.error("start", err);
  if (S.view !== "loading" && $view?.firstElementChild && !$(".loading", root())) return;
  try { if (S.me?.id) idb.del("cache:" + S.me.id); } catch (_) {}
  const scr = root(); if (!scr) return;
  scr.innerHTML = `<div class="bootfail" role="alert"><div class="appicon">${I.bird}</div><h1>InFlight couldn’t open</h1>
    <p>Something on this phone got in the way. Your messages are safe: they’re on the server, and your key is still here.</p>
    <button type="button" class="btn wide" id="bootretry">Try Again</button></div>`;
  $("#bootretry")?.addEventListener("click", () => location.reload());
}
window.addEventListener("unhandledrejection", (e) => { if (S.view === "loading") bootFail(e.reason); });
// the copy of the app kept for opening with no signal (and notifications) live in the service worker
if ("serviceWorker" in navigator && document.documentElement.dataset.device !== "computer") navigator.serviceWorker.register("/pigeon/sw.js", { scope: "/pigeon/" }).catch(() => {});
start().catch(bootFail);
