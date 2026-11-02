// Send to a friend: the card a letter carries, and every word said about it.
//
// A card is what an app's "Send to a friend" hands Chat (in the link's #share=…&card=…), and what then travels sealed
// inside the letter (the payload's c), with a snapshot as it was when sent and a way to look it up again (ref). This
// file is the one place a card is checked (normCard: a strict allow-list, used on every way in: a link, a letter, a
// server's answer), packed for a link, and put into words: what it says, when it lands, how it's changed since, which
// pigeons it'll take. Pure: no page, no network, no Buffer, so Chat, the server (functions/) and the tests share it.
// (Chat's drawing of a card is pigeon/cardview.js; who it suits is pigeon/rank.js.)

export const CARD_V = 1, KINDS = ["weather", "fitness", "markets", "streak"], FROMS = ["weather", "fitness", "markets", "today", "chat"];
export const ASK_KINDS = ["weather", "fitness", "markets"], PLAN_SPORTS = ["ride", "run"];
export const MAX_CARD = 4400 /* UTF-8 bytes */, MAX_PACKED = 6000, MAX_HASH = 8000, LIVE_MS = 48 * 3600e3, MARGIN_MS = 10 * 60e3;
export const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;      // copied from functions/_markets.js:28
export const PAD_BUCKETS = [1024, 4096, 8192];             // then multiples of 4096

const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const SPORTS = ["ride", "run", "swim", "walk", "row", "strength"];
const RATINGS = ["Great", "Good", "Fair"];
const SHARE_ID = /^[A-Za-z0-9_-]{22}$/, WID = /^[A-Za-z0-9_:-]{1,40}$/, DAYKEY = /^\d{4}-\d\d-\d\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EARLIEST = Date.UTC(2020, 0, 1);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const te = new TextEncoder();
export const bytesOf = (s) => te.encode(s).length;
// within MAX_CARD, measured as UTF-8 bytes of its JSON (as a link's base64 measures it)
export const cardFits = (c) => bytesOf(JSON.stringify(c)) <= MAX_CARD;

/* ---------- checking what comes in ---------- */
// control and direction-changing characters (the same class as functions/_fitness.js text()) go; then trimmed and cut
const CTRL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;
const cut = (s, n) => { if (s.length <= n) return s; let o = s.slice(0, n); if (/[\ud800-\udbff]$/.test(o)) o = o.slice(0, -1); return o.trimEnd(); };
const str = (v, n) => (typeof v === "string" ? cut(v.replace(CTRL, " ").replace(/\s+/g, " ").trim(), n) : "");
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v, lo, hi, dp = 1) => { if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) return null; const f = 10 ** dp; return Math.round(v * f) / f; };
const int = (v, lo, hi) => num(v, lo, hi, 0);
// a time: whole ms between 2020 and 400 days from now
const time = (v) => { if (typeof v !== "number" || !Number.isFinite(v)) return null; const t = Math.round(v); return t >= EARLIEST && t <= Date.now() + 400 * DAY ? t : null; };
const zones = new Map();
export function zoneOk(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  if (zones.has(tz)) return zones.get(tz);
  let ok = false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); ok = true; } catch (_) { ok = false; }
  if (zones.size > 500) zones.clear();
  zones.set(tz, ok);
  return ok;
}
const zone = (tz) => (zoneOk(tz) ? tz : null);
const dayOk = (s) => { if (typeof s !== "string" || !DAYKEY.test(s)) return null; const [y, m, d] = s.split("-").map(Number), t = Date.UTC(y, m - 1, d), x = new Date(t); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d && y >= 2020 && y <= 2100 ? s : null; };
const pick = (v, list) => (list.includes(v) ? v : null);
// a 0.05° square's corner (never the exact place)
export const snapCell = (lat, lon) => [Math.round(lat * 20) / 20, Math.round(lon * 20) / 20].map((x) => +x.toFixed(2) + 0);
const span = (o) => { if (!isObj(o)) return null; const start = time(o.start), end = time(o.end); return start != null && end != null && end > start ? { start, end } : null; };

function weatherSnap(s) {
  const place = str(s.place, 60); if (!place) return null;
  const o = { place };
  const tz = zone(s.tz); if (tz) o.tz = tz;
  for (const k of ["temp", "feels", "hi", "lo"]) { const v = num(s[k], -80, 60); if (v != null) o[k] = v; }
  const code = int(s.code, 0, 99); if (code != null) o.code = code;
  if (typeof s.isDay === "boolean") o.isDay = s.isDay;
  const lead = str(s.lead, 140); if (lead) o.lead = lead;
  if (isObj(s.rain)) {
    const r = { now: s.rain.now === true }, at = time(s.rain.at), end = time(s.rain.end);
    if (at != null) r.at = at;
    if (end != null && (at == null || end > at)) r.end = end;
    o.rain = r;
  } else o.rain = null;
  const sp = span(s.spell), act = isObj(s.spell) ? pick(s.spell.act, ["cycle", "run"]) : null, rating = isObj(s.spell) ? pick(s.spell.rating, RATINGS) : null;
  o.spell = sp && act && rating ? { act, start: sp.start, end: sp.end, rating } : null;
  return o;
}
function fitnessSnap(s) {
  const day = dayOk(s.day), sport = pick(s.sport, SPORTS), name = str(s.name, 60);
  if (!day || !sport || !name) return null;
  const o = { day };
  const tz = zone(s.tz); if (tz) o.tz = tz;
  o.sport = sport; o.name = name;
  const kind = str(s.kind, 30); if (kind) o.kind = kind;
  if (typeof s.wid === "string" && WID.test(s.wid)) o.wid = s.wid;
  const secs = int(s.secs, 0, 86400); if (secs != null) o.secs = secs;
  const tss = int(s.tss, 0, 1000); if (tss != null) o.tss = tss;
  const b = span(s.best); o.best = b ? { start: b.start, end: b.end, dry: isObj(s.best) && s.best.dry === true } : null;
  o.done = isObj(s.done) ? doneOf(s.done) : null;
  return o;
}
// a session done: each figure only when known ({} = done, no figures)
export function doneOf(d) {
  const o = {};
  if (!isObj(d)) return o;
  const secs = int(d.secs, 0, 86400), dist = int(d.dist, 0, 2e6), tss = int(d.tss, 0, 1000);
  if (secs != null) o.secs = secs; if (dist != null) o.dist = dist; if (tss != null) o.tss = tss;
  return o;
}
function marketsSnap(s) {
  const pct = num(s.pct, -100, 1000, 2); if (pct == null) return null;
  const sym = typeof s.sym === "string" && SYMBOL.test(s.sym) ? s.sym : null;
  const name = sym ? str(s.name, 60) : "Portfolio"; if (!name) return null;
  const o = { name, sym, pct };
  const day = dayOk(s.day); if (day) o.day = day;
  return o;
}
function streakSnap(s) {
  const who = str(s.who, 40), n = int(s.n, 0, 100000); if (!who || n == null) return null;
  const o = { who, n };
  const best = int(s.best, 0, 100000); if (best != null) o.best = best;
  return o;
}
const SNAPS = { weather: weatherSnap, fitness: fitnessSnap, markets: marketsSnap, streak: streakSnap };

// The card, rebuilt field by field from what's known (never spread from the input). from: "hash" for a card from a
// link, which never keeps a Fitness share id (only the sending Chat puts one in). → card | null
export function normCard(x, { from } = {}) {
  try {
    if (!isObj(x) || !KINDS.includes(x.kind) || !isObj(x.snap)) return null;
    const kind = x.kind, snap = SNAPS[kind](x.snap);
    if (!snap) return null;
    const c = { v: CARD_V, kind, from: pick(x.from, FROMS) || (kind === "streak" ? "chat" : kind) };
    const at = time(x.at); if (at != null) c.at = at;
    c.say = "";
    c.snap = snap;
    const r = isObj(x.ref) ? x.ref : null;
    if (r && kind === "weather" && Array.isArray(r.cell) && r.cell.length === 2) {
      const lat = num(r.cell[0], -90, 90, 6), lon = num(r.cell[1], -180, 180, 6);
      if (lat != null && lon != null) c.ref = { cell: snapCell(lat, lon) };
    } else if (r && kind === "fitness" && from !== "hash" && typeof r.share === "string" && SHARE_ID.test(r.share)) c.ref = { share: r.share };
    else if (r && kind === "markets" && snap.sym && r.sym === snap.sym) c.ref = { sym: snap.sym };
    c.say = str(x.say, 200) || cut(cardWords(c), 200);
    return cardFits(c) ? c : null;
  } catch (_) { return null; }
}
export function normAsk(x, card) { return isObj(x) && ASK_KINDS.includes(x.kind) && card && card.kind === x.kind ? { kind: x.kind } : null; }
export function normRe(x) { return isObj(x) && typeof x.ask === "string" && UUID.test(x.ask) ? { ask: x.ask.toLowerCase() } : null; }
// an invite: whole hours, 1 to 6 of them; at most 3 other times, each as long
export function normPlan(x) {
  try {
    if (!isObj(x)) return null;
    const sport = pick(x.sport, PLAN_SPORTS), name = str(x.name, 60), secs = int(x.secs, 1, 86400), w = span(x);
    if (!sport || !name || secs == null || !w || typeof x.wid !== "string" || !WID.test(x.wid) || /^rh:/.test(x.wid)) return null;
    const len = w.end - w.start;
    if (len % HOUR || len < HOUR || len > 6 * HOUR) return null;
    if (len !== Math.min(6, Math.max(1, Math.ceil(secs / 3600))) * HOUR) return null;   // (the workout's own length, in whole hours)
    const o = { sport, wid: x.wid, name, secs, start: w.start, end: w.end };
    const tz = zone(x.tz); if (tz) o.tz = tz;
    o.opts = [];
    for (const raw of Array.isArray(x.opts) ? x.opts : []) {
      if (o.opts.length >= 3) break;
      const s = span(raw);
      if (!s || s.end - s.start !== len || [w, ...o.opts].some((t) => s.start < t.end && t.start < s.end)) continue;   // (none overlaps the window or another)
      o.opts.push(raw.dry === true ? { ...s, dry: true } : s);   // (each other time dry for both or not, of its own)
    }
    o.dry = x.dry === true; o.far = x.far === true;
    return o;
  } catch (_) { return null; }
}
// A "later" answer's plan: the invite's, at the other time picked (one of its opts), dry only where that time is
// (never the first window's); null when it isn't one of them
export function laterPlan(plan, start) {
  const o = (plan?.opts || []).find((w) => w.start === start);
  return o ? { ...plan, start: o.start, end: o.end, dry: o.dry === true, opts: [] } : null;
}
export function normAns(x) {
  try {
    if (!isObj(x) || typeof x.re !== "string" || !UUID.test(x.re)) return null;
    const a = pick(x.a, ["yes", "later", "no"]); if (!a) return null;
    const plan = normPlan(x.plan);
    if (a !== "no" && !plan) return null;
    return { re: x.re.toLowerCase(), a, ...(plan ? { plan } : {}) };
  } catch (_) { return null; }
}

/* ---------- the link from an app: #share=<words>&card=<packed> ---------- */
const b64url = (s) => { let b = ""; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
// (the apps each keep a copy of these four lines: weather/send.js, fitness/send.js, markets/send.js)
export function chatHash(words, card) {
  const packed = card ? b64url(JSON.stringify(card)) : "";
  return `#${new URLSearchParams(packed && packed.length <= 6000 ? { share: words, card: packed } : { share: words })}`;
}
export function packCard(card) {
  const c = normCard(card);
  if (!c) return null;
  const s = b64url(JSON.stringify(c));
  return s.length <= MAX_PACKED ? s : null;
}
export function unpackCard(s) {
  try {
    if (typeof s !== "string" || !s || s.length > MAX_PACKED || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return normCard(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), { from: "hash" });
  } catch (_) { return null; }
}
// the words cleaned as Chat's openLink has always done (control characters to spaces, trimmed, 500 at most); the card
// only where the whole hash is in bounds. → { words, card }
export function readShareHash(hash) {
  const s = String(hash ?? "");
  if (!/#share=/.test(s)) return { words: null, card: null };
  let q;
  try { q = new URLSearchParams(s.slice(1)); } catch (_) { return { words: null, card: null }; }
  const words = (q.get("share") || "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500);
  return { words: words || null, card: s.length <= MAX_HASH ? unpackCard(q.get("card")) : null };
}

/* ---------- the letter's payload ---------- */
// The card's own sentence, for a letter's words when there are none (and what an older Chat shows)
export function cardWords(card) {
  try {
    const s = card?.snap || {};
    let w = "";
    if (card?.kind === "weather") {
      const lead = typeof s.lead === "string" && s.lead ? s.lead : "";
      w = lead ? `${s.place} today: ${lead[0].toLowerCase()}${lead.slice(1)}` : s.temp != null ? (codeLabel(s.code) ? `${s.place}: ${Math.round(s.temp)}° and ${codeLabel(s.code).toLowerCase()}.` : `${s.place}: ${Math.round(s.temp)}°.`) : `The weather in ${s.place}.`;
      if (!/[.!?…]$/.test(w)) w += ".";
    } else if (card?.kind === "fitness") {
      w = s.done ? `Done today: ${s.name}.` : `Today’s session: ${s.name}${s.secs ? `, ${durWords(s.secs)}` : ""}.`;
    } else if (card?.kind === "markets") {
      const up = s.pct > 0 ? "up" : "down";
      w = !s.sym ? (Math.abs(s.pct) < 0.05 ? "My portfolio’s little changed today." : `My portfolio is ${up} ${Math.abs(s.pct).toFixed(1)}% today.`)
        : Math.abs(s.pct) < 0.005 ? `${s.name} is unchanged today.` : `${s.name} is ${up} ${Math.abs(s.pct).toFixed(2)}% today.`;
    } else if (card?.kind === "streak") w = `My flight streak with ${s.who} is ${s.n} day${s.n === 1 ? "" : "s"}.`;
    return cut(w, 500);
  } catch (_) { return ""; }
}
const has = (v) => v != null;
// What the letter's sealed payload is made of, each part checked on its own: a bad card, request, invite or answer is
// simply left out, never the letter. (z, the padding, is ignored.) Never throws.
export function payloadParts(p) {
  const out = { t: "", card: null, ask: null, re: null, plan: null, ans: null };
  try {
    if (!isObj(p)) return out;
    out.t = typeof p.t === "string" ? p.t : "";
    out.card = has(p.c) ? normCard(p.c) : null;
    out.ask = out.card && has(p.ask) ? normAsk(p.ask, out.card) : null;
    out.re = has(p.re) ? normRe(p.re) : null;
    out.plan = has(p.plan) ? normPlan(p.plan) : null;
    out.ans = has(p.ans) ? normAns(p.ans) : null;
  } catch (_) {}
  return out;
}
// A payload to seal: always words (an older Chat shows only those), then whichever parts are good. Never r, k, p, v,
// bad, unchecked, ph (old meanings) and no sealed type of its own.
export function buildPayload({ t, card, ask, re, plan, ans, q } = {}) {
  const words = typeof t === "string" ? t.trim() : "";
  if (!words) throw new Error("No words");
  const out = { t: words };
  const c = card ? normCard(card) : null;
  if (c) out.c = c;
  const a = c && ask ? normAsk(ask, c) : null; if (a) out.ask = a;
  const r = re ? normRe(re) : null; if (r) out.re = r;
  const pl = plan ? normPlan(plan) : null; if (pl) out.plan = pl;
  const an = ans ? normAns(ans) : null; if (an) out.ans = an;
  if (isObj(q) && typeof q.id === "string" && typeof q.t === "string") out.q = { id: q.id, from: typeof q.from === "string" ? q.from : "", t: q.t, ...(isObj(q.p) ? { p: q.p } : {}) };
  return out;
}
// Spaces in z, so the payload's JSON is exactly 1, 4 or 8 KB (then the next 4 KB): a card letter is the size of any other
const bucketFor = (n) => PAD_BUCKETS.find((b) => b >= n) ?? Math.ceil(n / 4096) * 4096;
export function padPayload(p) {
  const o = {};
  for (const k of Object.keys(p || {})) if (k !== "z") o[k] = p[k];
  const base = bytesOf(JSON.stringify({ ...o, z: "" }));
  return { ...o, z: " ".repeat(bucketFor(base) - base) };
}

/* ---------- live cards ---------- */
// Yours of any kind; a friend's only where it's public: a forecast for a square, or one stock's percent
export function canForward(card, { mine } = {}) {
  if (!card || !KINDS.includes(card.kind)) return false;
  if (mine) return true;
  return card.kind === "weather" || (card.kind === "markets" && !!card.snap?.sym);
}
export function liveKey(card) {
  const r = card?.ref;
  if (!r) return null;
  if (card.kind === "weather" && Array.isArray(r.cell)) return `weather:${r.cell[0].toFixed(2)},${r.cell[1].toFixed(2)}`;
  if (card.kind === "markets" && r.sym) return `markets:${r.sym}`;
  if (card.kind === "fitness" && r.share) return `fitness:${r.share}`;
  return null;
}
// one item for POST card-now (no letter's id: the server's never told which letter)
export function liveItem(card) {
  const k = liveKey(card);
  if (!k) return null;
  return card.kind === "weather" ? { k: "weather", cell: [card.ref.cell[0], card.ref.cell[1]] } : card.kind === "markets" ? { k: "markets", sym: card.ref.sym } : { k: "fitness", share: card.ref.share };
}
// Live for 48 hours from landing (yours from when you sent it, in the air too); only with a way to look it up again
export function isLive(card, { landedAt, mine, now = Date.now() } = {}) {
  if (!liveKey(card)) return false;
  const at = Number.isFinite(landedAt) ? landedAt : null;
  if (mine) { const from = at ?? card.at; return from != null && now - from < LIVE_MS; }
  return at != null && at <= now && now - at < LIVE_MS;
}

/* ---------- clocks and days, in a place's own zone ---------- */
const fmts = new Map();
function fmt(tz) {
  const key = zoneOk(tz) ? tz : "";
  let f = fmts.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { ...(key ? { timeZone: key } : {}), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    if (fmts.size > 200) fmts.clear();
    fmts.set(key, f);
  }
  return f;
}
// the wall clock in tz: { y, m, d, h, mi, s } (a bad zone: the viewer's own)
function parts(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}
const offsetAt = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
const pad2 = (n) => String(n).padStart(2, "0");
export function clockIn(ms, tz) {
  try { if (!Number.isFinite(ms)) return ""; const p = parts(ms, tz); return `${pad2(p.h)}:${pad2(p.mi)}`; } catch (_) { return ""; }
}
// the date in tz, as days since 1970 (for counting days between)
const dayNum = (ms, tz) => { const p = parts(ms, tz); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY); };
const dayKeyIn = (ms, tz) => { const p = parts(ms, tz); return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`; };
const shortDate = (n) => { const d = new Date(n * DAY); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
// "Today", "Tomorrow", "Saturday" (this week), else "Sat 7 Nov", on tz's calendar
export function dayWords(ms, tz, nowMs = Date.now()) {
  try {
    if (!Number.isFinite(ms)) return "";
    const n = dayNum(ms, tz), diff = n - dayNum(Number.isFinite(nowMs) ? nowMs : Date.now(), tz);
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff > 1 && diff < 7 ? DOWL[new Date(n * DAY).getUTCDay()] : shortDate(n);
  } catch (_) { return ""; }
}
// a day key ("2026-11-01") as "Sun 1 Nov"
export const dayKeyWords = (key) => { const k = dayOk(key); return k ? shortDate(Math.round(Date.parse(k + "T00:00:00Z") / DAY)) : ""; };
// mid-sentence: "today", "tomorrow", "Saturday"
const dayIn = (ms, tz, nowMs) => { const w = dayWords(ms, tz, nowMs); return w === "Today" || w === "Tomorrow" ? w.toLowerCase() : w; };
export function aboutSaid(ms) {
  const m = Math.max(0, Math.round((Number(ms) || 0) / MIN));
  if (m < 50) return `about ${Math.max(10, Math.round(m / 10) * 10)} minutes`;
  if (m <= 75) return "about an hour";
  return `about ${Math.max(2, Math.round(m / 60))} hours`;
}
// The first time at or after `after` that tz's clock reads hhmm ("07:30"), day by day, so clock changes come out right
export function nextLocal(tz, hhmm, after) {
  const [hh, mm] = String(hhmm || "07:30").split(":").map(Number), h = Number.isFinite(hh) ? hh : 7, mi = Number.isFinite(mm) ? mm : 30;
  const from = Number.isFinite(after) ? after : Date.now();
  const p0 = parts(from, tz);
  for (let i = 0; i < 4; i++) {
    const wall = Date.UTC(p0.y, p0.m - 1, p0.d + i, h, mi);
    let t = wall - offsetAt(wall, tz);
    t = wall - offsetAt(t, tz);                // (once more, for a day the clocks change)
    if (t >= from) return t;
  }
  return from + DAY;
}

/* ---------- words ---------- */
const durWords = (secs) => { const m = Math.round(secs / 60), h = Math.floor(m / 60), r = m % 60; return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`; };
export { durWords };
// "8m", "2h", "1d 10h", as Chat says a flight's length (pigeon/app.js durShort)
export function durShort(ms) {
  ms = Math.max(0, Number(ms) || 0);
  if (ms >= HOUR && ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : "under a minute";
}
// "A, B and C"
export const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
// the figures of a session done: "1:02 · 30.4 km · stress 48" (only those known)
export function doneFigures(d) {
  if (!d) return "";
  const out = [];
  if (Number.isFinite(d.secs)) { const m = Math.round(d.secs / 60); out.push(`${Math.floor(m / 60)}:${pad2(m % 60)}`); }
  if (Number.isFinite(d.dist)) out.push(`${(d.dist / 1000).toFixed(1)} km`);
  if (Number.isFinite(d.tss)) out.push(`stress ${Math.round(d.tss)}`);
  return out.join(" · ");
}
// "+1.21%", "−0.40%" (a true minus sign)
export const pctText = (p) => (Number.isFinite(p) ? `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(2)}%` : "–");

// WMO codes as the card says them, and the kind each is (for "has it changed?")
export function codeLabel(code) {
  const c = Number.isFinite(code) ? Math.round(code) : -1;
  if (c < 0) return "";
  if (c === 0) return "Clear"; if (c === 1) return "Mostly clear"; if (c === 2) return "Partly cloudy"; if (c <= 44) return "Cloudy";
  if (c <= 50) return "Fog"; if (c <= 59) return "Drizzle"; if (c === 65 || c === 67) return "Heavy rain"; if (c <= 69) return "Rain";
  if (c <= 79) return "Snow"; if (c === 85 || c === 86) return "Snow"; if (c <= 84) return "Showers"; if (c <= 94) return "Showers";
  return "Thunder";
}
export function codeGroup(code) {
  const l = codeLabel(code);
  return { Clear: "clear", "Mostly clear": "clear", "Partly cloudy": "cloud", Cloudy: "cloud", Fog: "fog", Drizzle: "drizzle", Rain: "rain", "Heavy rain": "rain", Showers: "rain", Snow: "snow", Thunder: "thunder" }[l];
}

// Whether what's true now differs from the snapshot, said plainly. now: card-now's answer for this card (or null).
// → { changed, delta, line, big: [as sent, now] }; big[1] is "…" until there's an answer, null where there won't be one.
export function compareNow(card, now, viewAt = Date.now()) {
  const out = { changed: false, delta: "", line: "", big: [bigOf(card), "…"] };
  try {
    if (!card || !isObj(now) || now.quiet) return out;
    if (now.gone) return { ...out, big: [out.big[0], null] };
    const s = card.snap, tz = s.tz;
    let changed = false, line = "", big = "…";
    if (card.kind === "weather") {
      if (!Number.isFinite(now.temp) && !isObj(now.rain) && now.rain !== null) return out;
      const wasWet = s.rain?.now === true, isWetNow = now.rain?.now === true;
      const was = s.rain?.at, will = isObj(now.rain) && !now.rain.now ? now.rain.at : null;
      big = Number.isFinite(now.temp) ? `${Math.round(now.temp)}°` : "–";
      if (!wasWet && isWetNow) { changed = true; line = `Raining in ${s.place} now.`; }
      else if (wasWet && !isWetNow) { changed = true; line = `Dry in ${s.place} now.`; }
      else if (Number.isFinite(was) && Number.isFinite(will) && Math.abs(will - was) >= 30 * MIN) { changed = true; line = `The rain’s now due at ${clockIn(will, tz)}, not ${clockIn(was, tz)}.`; }
      else if (!wasWet && !isWetNow && !Number.isFinite(was) && Number.isFinite(will)) { changed = true; line = `Rain’s now due at ${clockIn(will, tz)}.`; }
      else if (!wasWet && !isWetNow && Number.isFinite(was) && now.rain === null) { changed = true; line = "No rain’s due now."; }
      else if (Number.isFinite(s.temp) && Number.isFinite(now.temp) && Math.abs(Math.round(now.temp - s.temp)) >= 3) {
        const d = Math.round(now.temp - s.temp); changed = true; line = `${Math.abs(d)}° ${d > 0 ? "warmer" : "colder"} than when it was sent.`;
      } else if (Number.isFinite(s.code) && Number.isFinite(now.code) && codeGroup(s.code) !== codeGroup(now.code)) { changed = true; line = `Now: ${codeLabel(now.code)}.`; }
      else line = "As forecast.";
    } else if (card.kind === "fitness") {
      if (typeof now.done !== "boolean") return out;
      if (now.done) {
        const f = doneFigures(now);
        line = f ? `Done: ${f}.` : "Done ✓."; big = "Done ✓"; changed = !s.done;
      } else {
        big = s.done ? "Done ✓" : s.name;
        const over = dayOverAt(s.day, tz, viewAt);
        if (s.done) line = "Done ✓.";
        else if (over) { changed = true; line = "Not done that day."; }
        else line = "Not done yet.";
      }
    } else if (card.kind === "markets") {
      if (!Number.isFinite(now.pct)) return out;
      big = pctText(now.pct);
      const up = (p) => (p >= 0 ? "up" : "down");
      if (now.day && s.day && now.day !== s.day) { changed = true; line = `A new day: ${up(now.pct)} ${Math.abs(now.pct).toFixed(2)}% today.`; }
      else if (Math.abs(now.pct - s.pct) >= 0.25) {
        changed = true;
        line = `${now.pct >= 0 ? "Up" : "Down"} ${Math.abs(now.pct).toFixed(2)}% now, from ${Math.abs(s.pct).toFixed(2)}%${up(s.pct) !== up(now.pct) ? ` ${up(s.pct)}` : ""} when it was sent.`;
      } else line = "No real change.";
      if (now.stale && Number.isFinite(now.at)) line += ` Prices from ${clockIn(now.at)}.`;
    } else return out;
    return { changed, delta: changed ? "Changed since it was sent" : "As it was when sent", line, big: [out.big[0], big] };
  } catch (_) { return out; }
}
// whether a day (its key, on tz's calendar) is over at a time
function dayOverAt(key, tz, at) {
  if (!dayOk(key) || !Number.isFinite(at)) return false;
  return dayKeyIn(at, tz) > key;
}
// the big figure of a card as sent
export function bigOf(card) {
  const s = card?.snap || {};
  switch (card?.kind) {
    case "weather": return Number.isFinite(s.temp) ? `${Math.round(s.temp)}°` : "–";
    case "fitness": return s.done ? "Done ✓" : s.name || "";
    case "markets": return pctText(s.pct);
    case "streak": return `${s.n} day${s.n === 1 ? "" : "s"}`;
    default: return "";
  }
}

// The letter's words for when it lands (editable before it goes): mode "asap" | "before" | "morning"; tz: theirs
export function landWords(card, { mode, landAt, rainAt, tz } = {}) {
  const line = card?.say || cardWords(card);
  if (mode === "before" && Number.isFinite(rainAt) && Number.isFinite(landAt)) return `Rain reaches you in ${aboutSaid(rainAt - landAt)}, at ${clockIn(rainAt, tz)}.`;
  if (mode === "morning") return `Good morning. ${line}`;
  return line;
}
// one friend's line under "When It Lands": "Leo’s lands 14:20", "Mum’s lands 17:30, an hour before the rain",
// "Leo’s lands 07:30 tomorrow, their time". tz: yours; theirTz: theirs.
export function whenLine(name, { mode, landAt, rainAt, tz, theirTz, now = Date.now() } = {}) {
  const who = String(name ?? "");
  if (mode === "before") {
    if (!Number.isFinite(landAt) || !Number.isFinite(rainAt) || landAt >= rainAt) return `Too late to beat the rain to ${who}: it goes now`;
    const gap = rainAt - landAt;
    return `${who}’s lands ${clockIn(landAt, tz)}${dayAfter(landAt, tz, now)}, ${Math.abs(gap - HOUR) < 5 * MIN ? "an hour" : aboutSaid(gap).replace(/^about /, "")} before the rain`;
  }
  if (!Number.isFinite(landAt)) return `${who}’s goes now`;
  if (mode === "morning") {
    const z = zoneOk(theirTz) ? theirTz : tz, theirs = zoneOk(theirTz) && offsetAt(landAt, theirTz) !== offsetAt(landAt, tz);
    return `${who}’s lands ${clockIn(landAt, z)}${dayAfter(landAt, z, now)}${theirs ? ", their time" : ""}`;
  }
  return `${who}’s lands ${clockIn(landAt, tz)}${dayAfter(landAt, tz, now)}`;
}
// " tomorrow", " on Tuesday", " on Sat 7 Nov", or nothing for today
const dayAfter = (ms, tz, now) => { const w = dayWords(ms, tz, now); return w === "Today" ? "" : w === "Tomorrow" ? " tomorrow" : ` on ${w}`; };

// Which pigeon each pick takes, in the order shown: a free turn goes as a standard pigeon (not one timed, nor where a
// standard one already waits); else the slowest paid pigeon still left. null: none left.
export function pigeonsFor(picks, { me } = {}) {
  const left = { swift: Math.max(0, me?.swift || 0), turbo: Math.max(0, me?.turbo || 0), rocket: Math.max(0, me?.rocket || 0) }, out = new Map();
  for (const p of picks || []) {
    if (p.free && !p.waiting && p.landAt == null) { out.set(p.id, "standard"); continue; }
    const k = ["swift", "turbo", "rocket"].find((x) => left[x] > 0) || null;
    if (k) left[k]--;
    out.set(p.id, k);
  }
  return out;
}
// What the picks spend: "Uses your free pigeon to Leo", "Uses 2 swift pigeons", "Uses a swift and a turbo pigeon",
// "Uses your free pigeon to Leo and a swift pigeon". kinds: pigeonsFor's Map (or [kind]); names: Map id → name (or [name]).
export function spendWords(kinds, names) {
  const rows = kinds instanceof Map ? [...kinds].map(([id, k]) => [k, names instanceof Map ? names.get(id) : names?.[id]]) : (kinds || []).map((k, i) => [k, names instanceof Map ? undefined : names?.[i]]);
  const free = rows.filter(([k]) => k === "standard").map(([, n]) => n || "a friend");
  const paid = ["swift", "turbo", "rocket"].map((k) => [k, rows.filter(([x]) => x === k).length]).filter(([, n]) => n);
  const bits = [];
  if (free.length) bits.push(`your free pigeon${free.length > 1 ? "s" : ""} to ${andList(free)}`);
  if (paid.length) {
    const each = paid.map(([k, n]) => `${n === 1 ? "a" : n} ${k}`), last = paid.at(-1)[1];
    bits.push(`${andList(each)} pigeon${paid.length === 1 ? (last > 1 ? "s" : "") : last > 1 ? "s" : ""}`);
  }
  return bits.length ? `Uses ${bits.join(" and ")}` : "";
}
// After sending: "Sent · Leo in 8m, Ade at 07:30" ("and 2 more" past three); a failure: "Couldn’t send to Ade: …".
// list: [{ name, ok, landAt, lands (ms or words), err }]
export function sentToast(list) {
  const xs = list || [], bad = xs.filter((x) => !x.ok), good = xs.filter((x) => x.ok);
  if (bad.length === 1) return `Couldn’t send to ${bad[0].name}${bad[0].err ? `: ${bad[0].err}` : ". Try again."}`;
  if (bad.length > 1) return `Couldn’t send to ${andList(bad.map((x) => x.name))}. Try again.`;
  if (!good.length) return "";
  const one = (x) => (Number.isFinite(x.landAt) ? `${x.name} at ${clockIn(x.landAt)}` : x.lands != null ? `${x.name} in ${typeof x.lands === "number" ? durShort(x.lands) : x.lands}` : x.name);
  const shown = good.slice(0, 3).map(one), more = good.length - 3;
  return `Sent · ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}
export function askWords(words) {
  const w = String(words ?? "").trim();
  return w ? `${w}${/[.!?…”"’)]$/.test(w) ? "" : "."} How’s yours?` : "How’s yours?";
}
// "Saturday 10:00–12:00" on tz's clock
const spanWords = (start, end, tz, now) => `${dayWords(start, tz, now)} ${clockIn(start, tz)}–${clockIn(end, tz)}`;
// An invite's words: "Ride together? Saturday 10:00–12:00, dry for both."
export function planWords(plan, { tz, now = Date.now() } = {}) {
  const z = zoneOk(tz) ? tz : plan?.tz, verb = plan?.sport === "run" ? "Run" : "Ride";
  return `${plan?.far ? `${verb} at the same time?` : `${verb} together?`} ${spanWords(plan?.start, plan?.end, z, now)}${plan?.dry ? ", dry for both" : ""}.`;
}
// An answer's words: "Yes, 10:00 works." (another day: "Yes, Saturday 10:00 works."), "Later suits me better: 13:00?",
// "Can’t make it this time."
export function answerWords(ans, { tz, now = Date.now() } = {}) {
  if (ans?.a === "no" || !ans?.plan) return "Can’t make it this time.";
  const z = zoneOk(tz) ? tz : ans.plan.tz, at = ans.plan.start, d = dayIn(at, z, now), when = `${d === "today" ? "" : `${d} `}${clockIn(at, z)}`;
  return ans.a === "yes" ? `Yes, ${when} works.` : `Later suits me better: ${when}?`;
}
