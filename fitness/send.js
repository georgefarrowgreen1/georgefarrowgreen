// Fitness's "Send to a friend": today's session (or what's done), as a card for Chat (pigeon/cards.js: the same shape,
// made here), and the way to Chat with it. Nothing's asked of a server: the card goes in the address's fragment, which
// never reaches one. Chat makes the share id that lets a friend see whether it got done, as the letter's sent, so a
// card from here carries none (no ref).
// (no page in it: node imports it too, for the tests)

const SPORTS = ["ride", "run", "swim", "walk", "row", "strength"];
const WID = /^[A-Za-z0-9_:-]{1,40}$/;
const DID = { ride: "Rode", run: "Ran", swim: "Swam", walk: "Walked", row: "Rowed" };
const OUT_ON = new Set(["ride", "run", "swim", "walk", "row"]);
const NOUN = { ride: "Ride", run: "Run", swim: "Swim", walk: "Walk", row: "Row", strength: "Strength" };
const pad = (n) => String(n).padStart(2, "0");
const text = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const whole = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null);
// (a zone a browser knows, else none)
function zoneOk(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; }
}
// "1 h 15 min", as Chat's cards say a length
export function durWords(secs) { const m = Math.round(secs / 60), h = Math.floor(m / 60), r = m % 60; return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`; }
// a moment on a clock, "18:30" (in tz, else the phone's)
export function clockAt(ms, tz) {
  try { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(zoneOk(tz) ? { timeZone: tz } : {}) }).format(new Date(ms)); }
  catch (_) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
}
// a day as "2026-11-01": a phone's day (its start, in ms: Fitness's days) on its own calendar, or a key as it is
const dayKey = (day) => {
  if (typeof day === "string") return /^\d{4}-\d\d-\d\d$/.test(day) ? day : null;
  if (!Number.isFinite(day)) return null;
  const d = new Date(day); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The card (pigeon/cards.js §1.2, kind "fitness", from "fitness"):
//   day: the day (its start in ms, as Fitness keeps days, or "YYYY-MM-DD"); tz: the phone's zone
//   w: the session as planned { id, sport, name, kind, secs, tss } (secs and tss as measured for you), or null
//   done: what's done today { sport, name, secs, dist, tss } (each figure only when known), or null
//   best: the best time to go { start, end, dry } (real ms), or null
// → card, or null (nothing a card can say: no day, no sport Chat knows, no name)
export function sessionSendCard({ day, tz, w = null, done = null, best = null, at = Date.now() } = {}) {
  const key = dayKey(day), sport = done ? (SPORTS.includes(done.sport) ? done.sport : null) : SPORTS.includes(w?.sport) ? w.sport : null;
  if (!key || !sport) return null;
  // (the session as planned, where what's done is the same sport, or nothing's done yet)
  const pl = w && w.sport === sport ? w : null;
  // (what's done that wasn't planned goes by its sport, "Run", never its own name: that came from a file, Strava or
  // Garmin, or a rename, and no view of a done card shows it, so it isn't sent)
  const name = pl ? text(pl.name, 60) : done ? NOUN[sport] : "";
  if (!name) return null;
  const snap = { day: key, ...(zoneOk(tz) ? { tz } : {}), sport, name };
  if (pl) {
    const kind = text(pl.kind, 30); if (kind) snap.kind = kind;
    if (typeof pl.id === "string" && WID.test(pl.id)) snap.wid = pl.id;
    const secs = whole(pl.secs, 1, 86400); if (secs) snap.secs = secs;
    const tss = whole(pl.tss, 1, 1000); if (tss) snap.tss = tss;
  }
  const b = !done && best && Number.isFinite(best.start) && Number.isFinite(best.end) && best.end > best.start ? { start: Math.round(best.start), end: Math.round(best.end), dry: best.dry === true } : null;
  snap.best = b;
  snap.done = done ? Object.fromEntries([["secs", whole(done.secs, 0, 86400)], ["dist", whole(done.dist, 0, 2e6)], ["tss", whole(done.tss, 0, 1000)]].filter(([, v]) => v != null)) : null;
  // its words, as Today says them (functions/_todayfit.js)
  let say;
  if (done) say = DID[sport] && pl ? `${DID[sport]} my ${snap.kind ? `${snap.kind.toLowerCase()} ` : ""}session today: ${name}.` : OUT_ON.has(sport) ? `Out on a ${sport} today.` : "Trained today.";
  else say = `Today: ${name}${snap.secs ? `, ${durWords(snap.secs)}` : ""}.${b ? ` Best time to ${sport === "run" ? "run" : "ride"} ${clockAt(b.start, tz)} to ${clockAt(b.end, tz)}.` : ""}`;
  return { v: 1, kind: "fitness", from: "fitness", at: Math.round(at), say: say.slice(0, 200), snap };
}

// ---- to Chat: the same four lines in every app (pigeon/cards.js chatHash), the words first, so an older Chat, which
// reads only those, puts them in its message box as ever ----
const b64url = (s) => { let b = ""; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export function chatHash(words, card) {
  const packed = card ? b64url(JSON.stringify(card)) : "";
  return `#${new URLSearchParams(packed && packed.length <= 6000 ? { share: words, card: packed } : { share: words })}`;
}
// Chat, beside Fitness (fitness. → chat.), ending in "/", for chatPage() + chatHash(…); elsewhere none
export const chatPage = (loc = globalThis.location) => (loc?.hostname?.startsWith("fitness.") ? `${loc.origin.replace("//fitness.", "//chat.")}/` : null);
