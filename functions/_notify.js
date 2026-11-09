// Chat notifications: Web Push and email.
//
// Push uses the standard Web Push protocol: payloads are encrypted to each
// device (RFC 8291), so Apple, Google or Mozilla's push service sees only that
// a notification was sent, never its words. The server signs pushes with a
// VAPID key it makes for itself on first use and keeps in D1.
//
// Message text never appears in a notification: the server can't read it.
// A notification says who sent a message, or a pigeon and that it has landed.
//
// Landings happen on a timer, not on a request, so a "tick" looks for pigeons
// that have landed since the last one. It runs at most once a minute on the
// back of ordinary API traffic, and from an outside scheduler (see
// .github/workflows/inflight-notify.yml) when nobody is using the app.

import { liveTick } from "./_live.js";
import { stampPassports } from "./_passport.js";
import { lockOldSecrets } from "./_atrest.js";
import { vanishSweep } from "./_vanish.js";
import { spaceMoments, legOf } from "../pigeon/space.js";
import { logError, MIN, HOUR, DAY, turn, haversineKm, HttpError, b64url, fromB64url, randomToken, db, sweepPhotos, chunks, serverSecret, appLink, limit } from "./_pigeon.js";
import { sendEmail, emailReady, emailBody, accountLink } from "./_email.js";
import { logFor } from "./_stats.js";
import { settleBirds } from "./_birds.js";
import { housekeeping, WAY_PARTS } from "./_retention.js";
import { streakTick } from "./_streaks.js";
import { pokes, pokesAfter } from "./_pulse.js";
import { busyMap, busyNow, holdsFor, holdsAt, heldAdd } from "./_busy.js";

const enc = new TextEncoder();
const EMAIL_EVERY = 30 * MIN;     // at most one email per person per half hour
const EMAIL_AFTER = 10 * MIN;     // give push and the app a head start before emailing
const LOOKBACK = 3 * DAY;         // a pigeon held by quiet hours is still announced, but not forever

/* ---------------- preferences ----------------
   Account-wide (every phone follows them); whether push is on is per phone. */
export const NOTIFY_DEFAULTS = { messages: true, landed: true, takeoff: false, rerouted: true, lost: true, requests: true, accepted: true, reactions: true, weekly: true, delays: true, moments: true, streaks: true, names: false, quiet: false, quietFrom: 22, quietTo: 7, tz: "UTC",
  // (by email, each kind: Chat's (while its emails are on, notify_email: chatEmails), and the account's word that a
  // problem you reported is fixed. The week in flight's, where it's never been chosen, as its notification is)
  eMessages: true, eLanded: true, eRequests: true, eFixed: true };
export function prefsOf(u) {
  let p = {}; try { p = JSON.parse(u.notify_prefs || "{}") || {}; } catch (_) { /* defaults */ }
  return { ...NOTIFY_DEFAULTS, ...p };
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; } };
// Merge a partial update from the app, keeping only known keys and sane values.
export function cleanPrefs(cur, b) {
  const out = { ...cur };
  for (const k of ["messages", "landed", "takeoff", "rerouted", "lost", "requests", "accepted", "reactions", "weekly", "delays", "moments", "streaks", "names", "quiet", "eMessages", "eLanded", "eRequests", "eWeekly", "eFixed"]) if (b[k] !== undefined) out[k] = !!b[k];
  for (const k of ["quietFrom", "quietTo"]) if (b[k] !== undefined) { const h = Number(b[k]); if (Number.isInteger(h) && h >= 0 && h < 24) out[k] = h; }
  if (b.tz !== undefined && typeof b.tz === "string" && b.tz.length < 60 && validTz(b.tz)) out.tz = b.tz;
  return out;
}
// A partial update kept: merged into what's stored in the one statement (not read, changed and written back whole), so
// two changes made at once both stay
export const savePrefs = (D, id, b) =>
  D.prepare("UPDATE pg_users SET notify_prefs = json_patch(CASE WHEN json_valid(notify_prefs) THEN notify_prefs ELSE '{}' END, ?) WHERE id = ?")
    .bind(JSON.stringify(cleanPrefs({}, b)), id).run();
// Chat's emails, each kind, as they are (the account's Emails page): none while its emails are off (notify_email)
export const EMAIL_KINDS = ["messages", "landed", "requests", "weekly"];
const EKEY = { messages: "eMessages", landed: "eLanded", requests: "eRequests", weekly: "eWeekly" };
export const KIND_SAID = { messages: "new message", landed: "pigeon", requests: "friend request", weekly: "week in flight" };
export function chatEmails(u, p = prefsOf(u)) {
  return Object.fromEntries(EMAIL_KINDS.map((k) => [k, !!u.notify_email && !!(p[EKEY[k]] ?? (k === "weekly" ? p.weekly : true))]));
}
// …some of them changed (on: { kind: true or false }): each kind kept, and Chat's emails on while any is
export async function setChatEmails(D, u, on) {
  const now = { ...chatEmails(u), ...Object.fromEntries(EMAIL_KINDS.filter((k) => typeof on[k] === "boolean").map((k) => [k, on[k]])) };
  await savePrefs(D, u.id, Object.fromEntries(EMAIL_KINDS.map((k) => [EKEY[k], now[k]])));
  const any = EMAIL_KINDS.some((k) => now[k]);
  await D.prepare("UPDATE pg_users SET notify_email = ?, email_at = COALESCE(email_at, ?) WHERE id = ?").bind(any ? 1 : 0, Date.now(), u.id).run();
  return now;
}
export function isQuiet(p, t = Date.now()) {
  if (!p.quiet || p.quietFrom === p.quietTo) return false;
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: p.tz, hour: "numeric", hourCycle: "h23" }).format(t));
  return p.quietFrom > p.quietTo ? h >= p.quietFrom || h < p.quietTo : h >= p.quietFrom && h < p.quietTo;
}

// Push services Chat will send to. Subscriptions naming any other host are
// refused, so the server can't be pointed at arbitrary URLs.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];
export function pushEndpointOk(u) {
  if (typeof u !== "string" || u.length > 1000) return false;
  try { const x = new URL(u); return x.protocol === "https:" && !x.port && !x.username && !x.password && PUSH_HOSTS.some((r) => r.test(x.hostname)); } catch (_) { return false; }
}

/* ---------------- VAPID ---------------- */
let vapidCache = null;
export async function vapid(env) {
  if (vapidCache) return vapidCache;
  const D = await db(env);
  let row = await D.prepare("SELECT v FROM pg_meta WHERE k = 'vapid'").first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = b64url(await crypto.subtle.exportKey("raw", kp.publicKey));
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
    await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ pub, priv })).run();
    row = await D.prepare("SELECT v FROM pg_meta WHERE k = 'vapid'").first();
  }
  const { pub, priv } = JSON.parse(row.v);
  const key = await crypto.subtle.importKey("jwk", priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return (vapidCache = { pub, key });
}
async function vapidAuth(env, endpoint) {
  const { pub, key } = await vapid(env);
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.PIGEON_CONTACT ? `mailto:${env.PIGEON_CONTACT}` : "https://chat.inflite.ai/",
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${pub}`;
}

/* ---------------- payload encryption (RFC 8291, aes128gcm) ---------------- */
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
async function encryptPayload(sub, text) {
  const uaPub = fromB64url(sub.p256dh), auth = fromB64url(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length;
  return concat(head, asPub, ct);
}

// The Topic header (a newer notice replaces one still waiting with the same topic)
// is read by the push service, so it's a keyed hash, per phone: the same for each
// repeat, but no one can tell from it who it's about, or that two phones share it.
async function topicFor(env, tag, endpoint) {
  const k = await crypto.subtle.importKey("raw", enc.encode(await serverSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`push-topic|${endpoint}|${tag}`)))).slice(0, 32);
}
// Send one notification to every device the person has turned push on for. (Chat's own devices: the note says it's
// Chat's, unless its caller says which app it's from, so a phone getting every app's notifications opens the right one)
export async function pushTo(env, userId, note) {
  note = { ...note, app: note?.app ?? "chat" };
  const D = await db(env);
  // a subscription lives only as long as the sign-in that made it
  const { results } = await D.prepare(`SELECT p.endpoint, p.p256dh, p.auth, s.hash IS NULL AS dead FROM pg_push p
    LEFT JOIN pg_sessions s ON s.hash = p.session WHERE p.user_id = ?`).bind(userId).all();
  // (all of them at once: each can take up to 8 seconds, and a tick has many to send)
  const out = await Promise.all(results.map(async (sub) => {
    if (sub.dead) { await D.prepare("DELETE FROM pg_push WHERE endpoint = ?").bind(sub.endpoint).run(); return 0; }
    const r = await pushToSub(env, sub, note);
    if (r === "gone") await D.prepare("DELETE FROM pg_push WHERE endpoint = ?").bind(sub.endpoint).run();   // device gone
    return r === "sent" ? 1 : 0;
  }));
  return out.reduce((a, b) => a + b, 0);
}
// One notification to one subscription ({ endpoint, p256dh, auth }): "sent", "gone" (the device has
// unsubscribed: forget it) or "error". Weather's notifications go this way too (functions/_wxpush.js). note.app, where
// it's given, goes inside, sealed with the rest: which app it's from ("chat", "weather", "markets", "fitness", "today"),
// for the one service worker that shows every app's (an older one ignores it)
export async function pushToSub(env, sub, note) {
  try {
    const r = await fetch(env.PIGEON_PUSH_URL || sub.endpoint, {     // PIGEON_PUSH_URL: tests only
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000),
      headers: { Authorization: await vapidAuth(env, sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
        TTL: String(note.ttl || DAY / 1000), Urgency: note.urgency || "normal", ...(note.tag ? { Topic: await topicFor(env, note.tag, sub.endpoint) } : {}),
        ...(env.PIGEON_PUSH_URL ? { "X-Endpoint": sub.endpoint } : {}) },
      body: await encryptPayload(sub, JSON.stringify({ title: note.title, body: note.body, tag: note.tag, url: note.url, ...(note.app ? { app: String(note.app) } : {}) })),
    });
    if (r.status === 404 || r.status === 410) return "gone";
    if (r.ok) return "sent";
    r.body?.cancel().catch(() => {});
    console.error("push", r.status);
  } catch (e) { console.error("push", "network"); }
  return "error";
}

// A device Chat tells (pg_push), as Chat's own POST push-sub keeps one (functions/api/pigeon pushSubscribe, its three
// statements): one a sign-in (session: its hash), ten an account, and a push address another account here is still
// signed in with stays theirs. sub: the browser's subscription, { endpoint, keys: { p256dh, auth } }; via: "hub" for one
// InFlite's one device route fanned out (functions/_devices.js), so a rollback can take back exactly those. → whether
// it's this account's now
export async function keepSub(D, userId, session, sub, { via = null } = {}) {
  const endpoint = String(sub?.endpoint || ""), p256dh = String(sub?.keys?.p256dh || ""), auth = String(sub?.keys?.auth || "");
  if (!pushEndpointOk(endpoint)) throw new HttpError(400, "This browser’s push service isn’t supported.");
  let ok = false; try { ok = fromB64url(p256dh).length === 65 && fromB64url(auth).length === 16; } catch (_) { ok = false; }
  if (!ok) throw new HttpError(400, "That push subscription was malformed.");
  if (typeof userId !== "string" || !userId || typeof session !== "string" || !session) throw new HttpError(400, "Bad request.");
  const v = via == null ? null : String(via).slice(0, 16);
  // (one of Chat's own a sign-in, and one of the hub's: neither takes the other's, so Chat's own push on another of the
  // site's pages never undoes Get Every App's Notifications Here)
  await D.prepare("DELETE FROM pg_push WHERE user_id = ? AND session = ? AND endpoint != ? AND via IS ?").bind(userId, session, endpoint, v).run();
  const w = v == null
    ? await D.prepare(`INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(endpoint) DO UPDATE SET user_id = ?2, session = ?3, p256dh = ?4, auth = ?5, created_at = ?6
        WHERE pg_push.user_id = ?2 OR NOT EXISTS (SELECT 1 FROM pg_sessions WHERE hash = pg_push.session)`).bind(endpoint, userId, session, p256dh, auth, Date.now()).run()
    : await D.prepare(`INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at, via) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(endpoint) DO UPDATE SET user_id = ?2, session = ?3, p256dh = ?4, auth = ?5, created_at = ?6, via = ?7
        WHERE pg_push.user_id = ?2 OR NOT EXISTS (SELECT 1 FROM pg_sessions WHERE hash = pg_push.session)`).bind(endpoint, userId, session, p256dh, auth, Date.now(), v).run();
  await D.prepare("DELETE FROM pg_push WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM pg_push WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 10)").bind(userId).run();
  return !!w.meta?.changes;
}

// still friends? (a pigeon from someone you've blocked or unfriended lands silently, and nothing on its way is said)
const pals = async (D, a, b) => !!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(a, b).first());
/* ---------------- email ---------------- */
export async function unsubToken(env, userId) {
  const D = await db(env);
  const u = await D.prepare("SELECT unsub FROM pg_users WHERE id = ?").bind(userId).first();
  if (u?.unsub) return u.unsub;
  const t = randomToken(18);
  await D.prepare("UPDATE pg_users SET unsub = ? WHERE id = ? AND unsub IS NULL").bind(t, userId).run();
  return (await D.prepare("SELECT unsub FROM pg_users WHERE id = ?").bind(userId).first()).unsub;
}
async function notifyEmail(env, origin, u, subject, mail, kind) {
  if (!emailReady(env)) return false;
  // only to an address its owner has confirmed (anyone can type anyone's at sign-up), and not to an account being deleted
  const st = await (await db(env)).prepare("SELECT email_ok, delete_at FROM pg_users WHERE id = ?").bind(u.id).first();
  if (!st?.email_ok || st.delete_at) return false;
  // (its kind's own way off: one tap, or the mail app's Unsubscribe, turns off just these; and every email, on the
  // account's Emails page)
  const unsub = `${origin}/api/pigeon/unsubscribe?u=${encodeURIComponent(u.id)}&t=${await unsubToken(env, u.id)}${kind ? `&k=${kind}` : ""}`;
  const { text, html } = emailBody({ ...mail, brand: "inflight", origin, footer: kind ? `You get these because ${KIND_SAID[kind]} emails are on in Chat.` : "You get these because you turned on email notifications in Chat.", unsub,
    more: { label: "Choose which emails", url: `${accountLink(origin)}/#from=inflight&open=emails` } });
  await sendEmail(env, { brand: "inflight", to: u.email, subject, text, html,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
  await (await db(env)).prepare("UPDATE pg_users SET email_at = ? WHERE id = ?").bind(Date.now(), u.id).run();
  return true;
}

/* ---------------- events ---------------- */
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "Someone";
const userPrefs = async (env, id) => {
  const u = await (await db(env)).prepare("SELECT id, email, notify_email, email_at, notify_prefs, pigeons, open_chat, open_at FROM pg_users WHERE id = ?").bind(id).first();
  return u ? { u, p: prefsOf(u) } : null;
};
// That very chat open on their phone just now (its app says so with every pulse): a message there isn't pushed, it's seen
export const OPEN_FOR = 30e3;
export const openOn = (u, key, t = Date.now()) => !!u && u.open_chat === key && u.open_at != null && t - u.open_at < OPEN_FOR;
// (an open chat holds a message's push back only so long: then the tick claims it as usual, read by then or not)
const OPEN_HOLD = 5 * MIN;

/* ---------- messages (instant): told at once ---------- */
// A friend sending many in a row buzzes you at most once every 10 seconds (per copy of the server, so at worst an extra
// one, never one missing); the next one says how many. Claimed-but-not-pushed rows can't be told from pushed ones, so
// this isn't kept in the database. (exported for the tests, which start each case afresh)
const BURST = 10e3;
export const pushBurst = new Map();
function burstOk(key, t) {
  const was = pushBurst.get(key);
  if (was != null && t - was < BURST) return false;
  pushBurst.set(key, t);
  if (pushBurst.size > 2000) for (const [k, at] of pushBurst) if (t - at >= BURST) pushBurst.delete(k);
  return true;
}
// The words, the count, the urgency and the tag, the same whether it's told as it's sent or by the tick (rode: held while
// they rode, and told now the ride's done: "Sent you 2 messages while you rode.")
async function tellMessage(env, D, toId, from, p, t, rode = false) {
  if (!burstOk(toId + "|" + from.id, t)) return 0;
  const n = Math.max(1, (await D.prepare(`SELECT COUNT(*) AS n FROM pg_msgs WHERE recipient = ?1 AND sender = ?2 AND instant = 1 AND read_at IS NULL AND deliver_at <= ?3
    AND lost_at IS NULL AND gone_at IS NULL`).bind(toId, from.id, t).first())?.n || 0);
  const after = rode ? " while you rode" : "";
  return pushTo(env, toId, { title: p.names ? firstName(from.name) : "Chat",
    body: p.names ? (n > 1 ? `Sent you ${n} messages${after}.` : `Sent you a message${after}.`) : rode ? (n > 1 ? `${n} new messages came while you rode.` : "A new message came while you rode.")
      : n > 1 ? `You have ${n} new messages.` : "You have a new message.",
    tag: "msg-" + from.id, url: `/pigeon/#open=${from.id}`, urgency: "high" });
}
async function tellGroupMessage(env, D, toId, g, from, p, t, rode = false) {
  if (!burstOk(toId + "|" + g.id + "|" + from.id, t)) return 0;
  const n = Math.max(1, (await D.prepare(`SELECT COUNT(*) AS n FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE d.user_id = ?1 AND m.group_id = ?2 AND m.sender = ?3
    AND m.instant = 1 AND d.read_at IS NULL AND d.deliver_at <= ?4 AND d.lost_at IS NULL AND m.gone_at IS NULL`).bind(toId, g.id, from.id, t).first())?.n || 0);
  const first = firstName(from.name), after = rode ? " while you rode" : "";
  return pushTo(env, toId, { title: p.names ? g.name : "Chat",
    body: p.names ? (n > 1 ? `${first} sent ${n} messages${after}.` : `${first} sent a message${after}.`) : rode ? (n > 1 ? `${n} new messages came while you rode.` : "A new message came while you rode.")
      : n > 1 ? `You have ${n} new messages.` : "You have a new message.",
    tag: "gmsg-" + g.id, url: `/pigeon/#open=${g.id}`, urgency: "high" });
}
// Riding (functions/_busy.js): on a ride they planned, with their rule holding friends' notifications (at do). Chat's are
// all friends'. (A failure to tell holds nothing.)
const ridingNow = async (env, uid, t) => holdsFor(await busyNow(env, uid, t).catch(() => null), "friends");
// One just sent (from: who sent it; not one booked for later, which the tick tells when it's sent). Quiet hours, the
// chat open on their phone, or a ride of theirs, leave it unclaimed for the tick; claimed first, so the tick never tells
// it again
export async function messageSent(env, from, toId, msgId) {
  const t = Date.now(), r = await userPrefs(env, toId);
  if (!r || isQuiet(r.p, t) || openOn(r.u, from.id, t)) return;
  if (await ridingNow(env, toId, t)) return;
  const D = await db(env);
  const c = await D.prepare("UPDATE pg_msgs SET notified_at = ? WHERE id = ? AND notified_at IS NULL AND read_at IS NULL").bind(t, msgId).run();
  if (!c.meta.changes || !r.p.messages || !(await pals(D, from.id, toId))) return;
  await tellMessage(env, D, toId, from, r.p, t);
}
// …and in a group, to each member it went to (memberIds: never its sender), as each one's settings say
export async function groupMessageSent(env, from, g, memberIds, msgId) {
  const D = await db(env), busy = await busyMap(env.DB, memberIds, Date.now(), env).catch(() => new Map());
  for (const id of memberIds) {
    const t = Date.now(), r = await userPrefs(env, id);
    if (!r || isQuiet(r.p, t) || openOn(r.u, g.id, t) || holdsFor(busy.get(id), "friends")) continue;
    const c = await D.prepare("UPDATE pg_gdeliv SET notified_at = ? WHERE msg_id = ? AND user_id = ? AND notified_at IS NULL AND read_at IS NULL").bind(t, msgId, id).run();
    if (!c.meta.changes || !r.p.messages || (await isMuted(env, g.id, id))) continue;
    await tellGroupMessage(env, D, id, g, from, r.p, t);
  }
}
// Held by quiet hours, or a ride (a friend request, one accepted, being added to a group: none of them comes with a
// pigeon, so nothing else would bring them up again): kept, and told once they end, if it still stands (heldTick)
const hold = async (env, uid, kind, about, by = null) =>
  (await db(env)).prepare("INSERT OR REPLACE INTO pg_held (user_id, kind, about, by_id, at) VALUES (?, ?, ?, ?, ?)").bind(uid, kind, about, by, Date.now()).run();
export async function friendRequested(env, origin, from, toId) {
  const r = await userPrefs(env, toId); if (!r || !r.p.requests) return;
  if (isQuiet(r.p) || await ridingNow(env, toId, Date.now())) return hold(env, toId, "request", from.id);
  await pushTo(env, toId, { title: r.p.names ? "Friend request" : "Chat", body: r.p.names ? `${firstName(from.name)} (@${from.handle}) wants to be friends on Chat.` : "You have a new friend request.", tag: "requests", url: "/pigeon/#requests" });
  if (chatEmails(r.u, r.p).requests && Date.now() - (r.u.email_at || 0) > EMAIL_EVERY)
    await notifyEmail(env, origin, r.u, r.p.names ? `${firstName(from.name)} wants to be friends on Chat` : "You have a new friend request on Chat", {
      icon: "friend", title: r.p.names ? `${firstName(from.name)} wants to be friends` : "New friend request",
      preheader: r.p.names ? `@${from.handle} sent you a friend request.` : "Someone sent you a friend request.",
      lines: [r.p.names ? `${firstName(from.name)} sent you a friend request. ${r.u.pigeons ? "Accept it to start sending each other pigeons." : "Accept it to start chatting."}` : "Someone sent you a friend request. Open Chat to see who."],
      ...(r.p.names ? { pill: ["at", `@${from.handle}`] } : {}),
      button: { label: "See request", url: appLink(origin, "#requests") },
    }, "requests").catch(() => {});
}
// A request as it's sent: said (friendRequested) the first time in a day one person asks another, and not again, so one
// taken back and sent again, over and over, isn't a push (or an email) each time. (Counted as limit() counts, in one
// statement, so two at once can't both be the first.) → whether it was said
export async function friendAsked(env, origin, from, toId) {
  try { await limit(env, `asked:${from.id}:${toId}`, 1, DAY); } catch (e) { if (e?.status === 429) return false; throw e; }
  await friendRequested(env, origin, from, toId);
  return true;
}
export async function friendAccepted(env, by, toId) {
  const r = await userPrefs(env, toId); if (!r || !r.p.accepted) return;
  if (isQuiet(r.p) || await ridingNow(env, toId, Date.now())) return hold(env, toId, "accepted", by.id);
  await pushTo(env, toId, { title: r.p.names ? "New friend" : "Chat", body: r.p.names ? `${firstName(by.name)} accepted your friend request. ${r.u.pigeons ? "Send them a pigeon!" : "Say hello!"}` : "Someone accepted your friend request.", tag: "friend-" + by.id, url: `/pigeon/#open=${by.id}` });
}
// The person you sent a pigeon to moved, so it changed course.
// (what's said only of pigeons goes only to someone with pigeons on: functions/_notify.js's pigeon-only pushes)
const pigeonsOn = (r) => !!r && r.u.pigeons !== 0;
export async function pigeonRerouted(env, senderId, to, deliverAt) {
  const r = await userPrefs(env, senderId); if (!pigeonsOn(r) || !r.p.rerouted || isQuiet(r.p)) return;
  const eta = etaText(deliverAt - Date.now());
  await pushTo(env, senderId, { title: r.p.names ? `${firstName(to.name)} moved` : "Chat",
    body: `Your pigeon changed course${r.p.names && to.place ? ` for ${to.place}` : ""}. It now lands in ${eta}.`, tag: "course-" + to.id, url: `/pigeon/#open=${to.id}` });
}
// They went to another world (or somewhere new on one), and your pigeon followed: how (functions/_follow.js)
const WORLD = { moon: "the Moon", mars: "Mars", earth: "Earth" };
export async function pigeonFollowed(env, senderId, to, end, x, gid = null) {
  const r = await userPrefs(env, senderId); if (!pigeonsOn(r) || !r.p.rerouted || isQuiet(r.p)) return;
  if (gid && (await isMuted(env, gid, senderId))) return;
  const g = gid ? await (await db(env)).prepare("SELECT name FROM pg_groups WHERE id = ?").bind(gid).first() : null;
  const by = x.moon.pk === "laser" ? "a laser pigeon" : x.moon.pk === "orbital" ? "an orbital pigeon" : "a lunar pigeon", nm = r.p.names && firstName(to.name);
  const gone = end.b === "earth" ? (nm ? `${nm}’s back on Earth` : "they’re back on Earth") : nm ? `${nm}’s gone to ${WORLD[end.b]}` : `they’ve gone to ${WORLD[end.b]}`;
  const at = r.p.names && x.moon.from?.place ? ` ${x.later ? "in" : "over"} ${x.moon.from.place}` : "";
  const say = x.how === "hand" ? (x.later ? `Your pigeon will go on by ${by}${at}: ${gone}.` : `Your pigeon was handed to ${by}${at}: ${gone}.`)
    : x.how === "relay" ? `Your pigeon will be relayed on by ${by.replace(/^an? /, "")}${r.p.names && x.moon.from?.place ? ` from ${x.moon.from.place}` : ""}: ${gone}.`
    : `Your pigeon is heading for ${r.p.names && end.place ? end.place : "their new spot"} instead.`;
  await pushTo(env, senderId, { title: r.p.names ? (g ? g.name : `${firstName(to.name)} moved`) : "Chat", body: `${say} It now lands in ${etaText(x.deliver - Date.now())}.`,
    tag: "course-" + (gid || to.id), url: `/pigeon/#open=${gid || to.id}` });
}
export async function followingYou(env, uid, n, end) {
  const r = await userPrefs(env, uid); if (!pigeonsOn(r) || !r.p.moments || isQuiet(r.p)) return;
  await pushTo(env, uid, { title: "Chat", body: `${n === 1 ? "A pigeon on its way to you is" : `${n} pigeons on their way to you are`} following you to ${WORLD[end.b]}.`, tag: "following", url: "/pigeon/" });
}
// A friend has just sent you a pigeon (off unless you turn it on).
export async function pigeonSent(env, from, toId, deliverAt, kind = "standard") {
  const r = await userPrefs(env, toId); if (!pigeonsOn(r) || !r.p.takeoff || isQuiet(r.p)) return;
  const eta = etaText(deliverAt - Date.now());
  await pushTo(env, toId, { title: r.p.names ? firstName(from.name) : "Chat", body: r.p.names ? `Sent you a ${kind === "standard" ? "" : kind + " "}pigeon. It lands in ${eta}.` : `A ${kind === "standard" ? "" : kind + " "}pigeon is on its way to you. It lands in ${eta}.`,
    tag: "from-" + from.id, url: `/pigeon/#open=${from.id}` });
}

/* ---------- groups: the same events, said with the group's name ---------- */
// (whole minutes first, so never "1h 60m")
function etaText(ms) { const all = Math.max(1, Math.round(ms / MIN)), h = Math.floor(all / 60), m = all % 60; return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m} min`; }
const isMuted = async (env, gid, uid) => !!(await (await db(env)).prepare("SELECT muted FROM pg_group_members WHERE group_id = ? AND user_id = ?").bind(gid, uid).first())?.muted;
export async function groupAdded(env, by, ids, g) {
  const busy = await busyMap(env.DB, ids, Date.now(), env).catch(() => new Map());
  for (const id of ids) {
    const r = await userPrefs(env, id); if (!r || !r.p.requests) continue;
    if (isQuiet(r.p) || holdsFor(busy.get(id), "friends")) { await hold(env, id, "added", g.id, by.id); continue; }
    await pushTo(env, id, { title: r.p.names ? g.name : "Chat", body: r.p.names ? `${firstName(by.name)} added you to the group.` : "You were added to a group.", tag: "group-" + g.id, url: `/pigeon/#open=${g.id}` });
  }
}
export async function groupSent(env, from, g, dels, kind = "standard") {
  for (const d of dels) {
    const r = await userPrefs(env, d.to); if (!pigeonsOn(r) || !r.p.takeoff || isQuiet(r.p) || await isMuted(env, g.id, d.to)) continue;
    const what = kind === "standard" ? "pigeon" : `${kind} pigeon`, eta = etaText(d.at - Date.now());
    await pushTo(env, d.to, { title: r.p.names ? g.name : "Chat", body: r.p.names ? `${firstName(from.name)} sent a ${what}. It lands in ${eta}.` : `A ${what} is on its way to you. It lands in ${eta}.`,
      tag: "group-" + g.id, url: `/pigeon/#open=${g.id}` });
  }
}
// Someone cheered on a pigeon you're in on: it lands a little sooner.
export async function cheeredNote(env, toId, by, x) {
  const r = await userPrefs(env, toId); if (!pigeonsOn(r) || !r.p.moments || isQuiet(r.p)) return;
  if (x.group && (await isMuted(env, x.group, toId))) return;
  const who = r.p.names ? firstName(by.name) : "Someone";
  await pushTo(env, toId, { title: "A little tailwind",
    body: `${who} cheered on ${x.mine ? "their pigeon to you" : "your pigeon"}. It lands ${etaText(x.cut)} sooner.`, tag: x.tag, url: `/pigeon/#open=${x.chat}` });
}
// Someone waved at your pigeon as it flew over them.
export async function wavedNote(env, toId, by, x) {
  const r = await userPrefs(env, toId); if (!pigeonsOn(r) || !r.p.moments || isQuiet(r.p)) return;
  const who = firstName(by.name);
  await pushTo(env, toId, { title: r.p.names ? `${who} waved` : "A wave",
    body: r.p.names ? `${who} waved at your pigeon as it flew over${x.place ? " " + x.place : " them"}.` : "A friend waved at your pigeon as it flew over them.", tag: "wave-" + x.id, url: `/pigeon/#open=${by.id}` });
}
export async function groupRerouted(env, senderId, to, gid, deliverAt) {
  const r = await userPrefs(env, senderId); if (!pigeonsOn(r) || !r.p.rerouted || isQuiet(r.p) || await isMuted(env, gid, senderId)) return;
  await pushTo(env, senderId, { title: r.p.names ? `${firstName(to.name)} moved` : "Chat",
    body: `Your pigeon changed course${r.p.names && to.place ? ` for ${to.place}` : ""}. It now lands in ${etaText(deliverAt - Date.now())}.`, tag: "course-" + gid, url: `/pigeon/#open=${gid}` });
}
// What quiet hours or a ride held (hold), told now they've ended: each once (claimed as it's taken), and only if it still
// stands, a request still waiting, still friends, still in the group (said as it would have been, with whatever they've
// chosen since: off now, it's not said at all). Still quiet, or still riding: it waits; three days on, it goes untold.
// (H: the tick's view of who's riding, functions/_busy.js holdsAt)
export async function heldTick(env, D, t, origin, H = holdsAt(D, t, env)) {
  let told = 0;
  await D.prepare("DELETE FROM pg_held WHERE at < ?").bind(t - LOOKBACK).run();
  const { results } = await allRows(D, `SELECT h.user_id, h.kind, h.about, h.by_id, h.at, u.notify_prefs FROM pg_held h JOIN pg_users u ON u.id = h.user_id WHERE h.at >= ?1`, [t - LOOKBACK], "h", "at");
  await H.load(results.map((h) => h.user_id));
  const rode = new Map(), wasHeld = (h) => H.rode(h.user_id, h.at) && rode.set(h.user_id, (rode.get(h.user_id) || 0) + 1);
  for (const h of results) {
    if (isQuiet(prefsOf(h), t) || H.holds(h.user_id)) continue;
    const c = await D.prepare("DELETE FROM pg_held WHERE user_id = ? AND kind = ? AND about = ? AND at = ?").bind(h.user_id, h.kind, h.about, h.at).run();
    if (!c.meta.changes) continue;
    if (h.kind === "request") {
      const from = await D.prepare("SELECT u.id, u.name, u.handle FROM pg_links l JOIN pg_users u ON u.id = l.a WHERE l.a = ? AND l.b = ? AND l.status = 'pending'").bind(h.about, h.user_id).first();
      if (from) { await friendRequested(env, origin, from, h.user_id); told++; wasHeld(h); }
    } else if (h.kind === "accepted") {
      const by = await D.prepare("SELECT id, name FROM pg_users WHERE id = ?").bind(h.about).first();
      if (by && (await pals(D, by.id, h.user_id))) { await friendAccepted(env, by, h.user_id); told++; wasHeld(h); }
    } else if (h.kind === "added") {
      const g = await D.prepare("SELECT g.id, g.name FROM pg_groups g JOIN pg_group_members m ON m.group_id = g.id AND m.user_id = ? WHERE g.id = ?").bind(h.user_id, h.about).first();
      const by = h.by_id && await D.prepare("SELECT id, name FROM pg_users WHERE id = ?").bind(h.by_id).first();
      if (g && by) { await groupAdded(env, by, [h.user_id], g); told++; wasHeld(h); }
    }
  }
  // (each one a ride held, counted in the hold rule's record)
  for (const [uid, n] of rode) await heldAdd(env, uid, n);
  return told;
}
// Group pigeons that landed or were lost since the last tick.
// Every row a query matches, a page at a time (up to 5,000), in the order of `key` (the column its
// index runs on, so a page is a short walk along it): rows that can't go yet (in someone's quiet
// hours, or with nothing due) never hide the ones behind them. The query's own numbered parameters
// come first; where the page starts is the next two.
async function allRows(D, sql, binds, alias, key, per = 200, pages = 25) {
  const results = []; let k = -Infinity, r = -1;
  const a = binds.length + 1, b = binds.length + 2, col = `${alias}.${key}`;
  for (let i = 0; i < pages; i++) {
    const { results: page } = await D.prepare(`${sql.replace(/^SELECT /, `SELECT ${col} AS _k, ${alias}.rowid AS _rid, `)} AND (${col} > ?${a} OR (${col} = ?${a} AND ${alias}.rowid > ?${b})) ORDER BY ${col}, ${alias}.rowid LIMIT ${per}`)
      .bind(...binds, k === -Infinity ? -1e18 : k, r).all();
    results.push(...page); if (page.length < per) break; ({ _k: k, _rid: r } = page.at(-1));
  }
  return { results };
}
async function groupTick(env, D, t, since, H = holdsAt(D, t, env)) {
  let pushes = 0, landedN = 0, held = 0;
  const { results: due } = await allRows(D, `SELECT d.rowid AS rid, d.user_id, d.deliver_at, d.read_at, m.sender, m.group_id, m.instant, g.name AS gname, u.notify_prefs, u.open_chat, u.open_at,
      COALESCE(gm.muted, 1) AS muted, s.name AS sname
    FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = d.user_id JOIN pg_users s ON s.id = m.sender
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = d.user_id
    WHERE d.notified_at IS NULL AND d.lost_at IS NULL AND d.deliver_at <= ?1 AND d.deliver_at > ?2`, [t, since], "d", "deliver_at");
  // (quiet hours, and a ride, hold both; a message also waits while that group is open on their phone, for 5 minutes at most)
  await H.load(due.map((d) => d.user_id));
  const ready = due.filter((d) => !isQuiet(prefsOf(d), t) && !H.holds(d.user_id) && !(d.instant && openOn(d, d.group_id, t) && d.deliver_at > t - OPEN_HOLD));
  const rodeN = new Map(), rodeKeys = new Set();
  held = due.length - ready.length;
  // (one held still changes the group for both phones as it comes due: poked once, then again when it's told)
  const go = new Set(ready), waits = due.filter((d) => !go.has(d));
  if (waits.length) await D.batch(pokesAfter(D, waits.flatMap((d) => [[d.user_id, d.group_id, d.deliver_at], [d.sender, d.group_id, d.deliver_at]]))).catch(() => {});
  if (ready.length) {
    for (let i = 0; i < ready.length; i += 90) {
      const part = ready.slice(i, i + 90);
      const { results } = await D.prepare(`UPDATE pg_gdeliv SET notified_at = ? WHERE notified_at IS NULL AND rowid IN (${part.map(() => "?").join(",")}) RETURNING rowid AS rid`).bind(t, ...part.map((d) => d.rid)).all();
      const claimed = new Set(results.map((r) => r.rid));
      // (each landing tells its member's and its sender's phones the group changed)
      const told = part.filter((d) => claimed.has(d.rid));
      if (told.length) await D.batch(pokes(D, told.flatMap((d) => [[d.user_id, d.group_id], [d.sender, d.group_id]]))).catch(() => {});
      // one notification per person per group: who sent it, or how many landed (messages: per sender, as they're told
      // when sent)
      // (one a ride held, told now it's done: "while you rode", and counted in the hold rule's record)
      const by = new Map(), msgs = new Map(), rode = (d, k) => { if (!H.rode(d.user_id, d.deliver_at)) return; rodeN.set(d.user_id, (rodeN.get(d.user_id) || 0) + 1); rodeKeys.add(k); };
      for (const d of part) {
        if (!claimed.has(d.rid)) continue;
        landedN++;
        if (d.muted) continue;
        if (d.instant) {
          const k = d.user_id + "|" + d.group_id + "|" + d.sender;
          if (prefsOf(d).messages && !d.read_at) { msgs.set(k, d); rode(d, k); }
          continue;
        }
        if (!prefsOf(d).landed) continue;
        rode(d, d.user_id + "|" + d.group_id);
        const k = d.user_id + "|" + d.group_id, x = by.get(k) || { d, n: 0, from: new Set() };
        x.n++; x.from.add(firstName(d.sname)); by.set(k, x);
      }
      for (const [k, d] of msgs) pushes += await tellGroupMessage(env, D, d.user_id, { id: d.group_id, name: d.gname }, { id: d.sender, name: d.sname }, prefsOf(d), t, rodeKeys.has(k));
      for (const { d, n, from } of by.values()) {
        const names = prefsOf(d).names;
        pushes += await pushTo(env, d.user_id, { title: names ? d.gname : "Chat",
          body: n > 1 ? `${n} pigeons have landed.` : names ? `${[...from][0]}’s pigeon has landed.` : "A pigeon has landed.", tag: "group-" + d.group_id, url: `/pigeon/#open=${d.group_id}` });
      }
    }
  }
  const { results: lost } = await allRows(D, `SELECT d.rowid AS rid, d.msg_id, d.user_id, m.sender, m.group_id, g.name AS gname, u.notify_prefs, r.name, gm.muted
    FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = m.sender JOIN pg_users r ON r.id = d.user_id
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = m.sender
    WHERE d.notified_at IS NULL AND d.lost_at IS NOT NULL AND d.lost_at <= ?1 AND d.lost_at > ?2`, [t, since], "d", "lost_at");
  for (const [uid, n] of rodeN) await heldAdd(env, uid, n);
  const lostBy = new Map();
  await H.load(lost.map((d) => d.sender));
  for (const d of lost) {
    const p = prefsOf(d); if (isQuiet(p, t) || H.holds(d.sender)) continue;
    const c = await D.prepare("UPDATE pg_gdeliv SET notified_at = ? WHERE rowid = ? AND notified_at IS NULL").bind(t, d.rid).run();
    if (!c.meta.changes || !p.lost || d.muted) continue;
    const k = d.sender + "|" + d.group_id, x = lostBy.get(k) || { d, p, names: [], msgs: new Set(), ids: new Set() };
    x.names.push(firstName(d.name)); x.msgs.add(d.msg_id); x.ids.add(d.msg_id + "|" + d.user_id); lostBy.set(k, x);
  }
  // (one push for each of yours, however many of its pigeons were lost this round: they share a tag. A new one
  // replaces the last on the phone, so it names the earlier rounds' too: every pigeon of the same message lost so far)
  for (const { d, p, names, msgs, ids } of lostBy.values()) {
    const m = [...msgs].slice(0, 50), { results: before } = await D.prepare(`SELECT d.msg_id, d.user_id, r.name FROM pg_gdeliv d JOIN pg_users r ON r.id = d.user_id
      WHERE d.msg_id IN (${m.map(() => "?").join(",")}) AND d.lost_at IS NOT NULL AND d.lost_at <= ? AND d.recalled = 0 AND d.notified_at IS NOT NULL AND d.notified_at < ? ORDER BY d.lost_at`)
      .bind(...m, t, t).all().catch(() => ({ results: [] }));
    const earlier = before.filter((b) => !ids.has(b.msg_id + "|" + b.user_id)).map((b) => firstName(b.name));
    names.splice(0, 0, ...earlier);
    const who = names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join(" and ");
    pushes += await pushTo(env, d.sender, { title: "Pigeon lost", body: !p.names ? (names.length > 1 ? `${names.length} of your pigeons didn’t make it.` : "One of your pigeons didn’t make it.")
      : `Your pigeon${names.length > 1 ? "s" : ""} to ${who} in ${d.gname} didn’t make it.`, tag: "lost-" + d.group_id, url: `/pigeon/#open=${d.group_id}` });
  }
  return { pushes, landed: landedN, held };
}

// Reactions that have landed: "Mira reacted to your message". (Which reaction
// stays sealed: the server can't read it, so it can't say.)
// Weather: when a pigeon flies into whatever is holding it up (15 minutes or
// more), its sender and recipient hear how late it'll be. In a group only the
// recipient does, so one message can't set off a notification per member.
const WX_WORDS = { storms: "storms", hail: "hail", icing: "icy weather", heat: "fierce heat", cold: "bitter cold", rain: "heavy rain", snow: "snow", fog: "fog", gales: "gales", headwind: "strong headwinds", ash: "volcanic ash", smoke: "wildfire smoke", magnetic: "a magnetic storm" };
const WX_MIN = 15 * MIN;
const lateBy = (ms) => { const m = Math.round(ms / MIN); return m >= 90 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
const clockAt = (ts, tz) => { try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ts); } catch (_) { return ""; } };
// When, as someone in that time zone would say it: "15:00", "tomorrow 07:15", "Sat 22:00", "Sat 25 Oct 22:00"
const DAYS_AHEAD = 6;
function dayClock(ts, tz, t = Date.now()) {
  const clock = clockAt(ts, tz);
  try {
    const day = (x) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
    const n = Math.round((Date.parse(day(ts)) - Date.parse(day(t))) / DAY);
    if (n <= 0) return clock;
    if (n === 1) return `tomorrow ${clock}`;
    const f = (o) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).format(ts);
    return n <= DAYS_AHEAD ? `${f({ weekday: "short" })} ${clock}` : `${f({ weekday: "short" })} ${f({ day: "numeric", month: "short" })} ${clock}`;
  } catch (_) { return clock; }
}
// "at 15:00", "tomorrow at 07:15", "on Sat at 22:00"
const whenAt = (ts, tz) => { const d = dayClock(ts, tz), [w, c] = d.includes(" ") ? [d.slice(0, d.lastIndexOf(" ")), d.slice(d.lastIndexOf(" ") + 1)] : [null, d]; return !w ? `at ${c}` : w === "tomorrow" ? `tomorrow at ${c}` : `on ${w} at ${c}`; };
async function wxTick(env, D, t, since) {
  let pushes = 0;
  const { results: one } = await D.prepare(`SELECT m.id, m.sender, m.recipient, m.wx, m.wx_ms, m.deliver_at, s.name AS sname, r.name AS rname, s.notify_prefs AS sp, r.notify_prefs AS rp, s.pigeons AS spg, r.pigeons AS rpg FROM pg_msgs m
    JOIN pg_users s ON s.id = m.sender JOIN pg_users r ON r.id = m.recipient
    WHERE m.wx_at IS NOT NULL AND m.wx_told IS NULL AND m.wx_at <= ?1 AND m.wx_at > ?2 AND m.deliver_at > ?1 AND m.sent_at <= ?1 AND m.wx_ms >= ?3
      AND (m.lost_at IS NULL OR m.lost_at > ?1) LIMIT 200`).bind(t, since, WX_MIN).all();
  for (const m of one) {
    const claimed = await D.prepare("UPDATE pg_msgs SET wx_told = ? WHERE id = ? AND wx_told IS NULL").bind(t, m.id).run();
    if (!claimed.meta.changes) continue;
    let k = "bad weather"; try { k = WX_WORDS[JSON.parse(m.wx).k] || k; } catch (_) {}
    const sp = prefsOf({ notify_prefs: m.sp }), rp = prefsOf({ notify_prefs: m.rp });
    if (m.spg !== 0 && sp.delays && !isQuiet(sp, t)) pushes += await pushTo(env, m.sender, { title: sp.names ? `To ${firstName(m.rname)}` : "Chat",
      body: `Your pigeon flew into ${k}. It’ll land ${lateBy(m.wx_ms)} late, ${whenAt(m.deliver_at, sp.tz)}.`, tag: "wx-" + m.id, url: `/pigeon/#open=${m.recipient}` });
    if (m.rpg !== 0 && rp.delays && !isQuiet(rp, t) && (await pals(D, m.sender, m.recipient))) pushes += await pushTo(env, m.recipient, { title: rp.names ? firstName(m.sname) : "Chat",
      body: `${rp.names ? "Their" : "A"} pigeon to you flew into ${k}. It’ll land ${lateBy(m.wx_ms)} late, ${whenAt(m.deliver_at, rp.tz)}.`, tag: "wx-" + m.id, url: `/pigeon/#open=${m.sender}` });
  }
  const { results: grp } = await D.prepare(`SELECT d.rowid AS rid, d.user_id, d.wx, d.wx_ms, d.deliver_at, g.name AS gname, m.group_id, u.notify_prefs, u.pigeons, COALESCE(gm.muted, 1) AS muted FROM pg_gdeliv d
    JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = d.user_id
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = d.user_id
    WHERE d.wx_at IS NOT NULL AND d.wx_told IS NULL AND d.wx_at <= ?1 AND d.wx_at > ?2 AND d.deliver_at > ?1 AND d.wx_ms >= ?3
      AND (d.lost_at IS NULL OR d.lost_at > ?1) LIMIT 200`).bind(t, since, WX_MIN).all();
  for (const d of grp) {
    const claimed = await D.prepare("UPDATE pg_gdeliv SET wx_told = ? WHERE rowid = ? AND wx_told IS NULL").bind(t, d.rid).run();
    if (!claimed.meta.changes) continue;
    const p = prefsOf(d); if (d.pigeons === 0 || !p.delays || isQuiet(p, t) || d.muted) continue;
    let k = "bad weather"; try { k = WX_WORDS[JSON.parse(d.wx).k] || k; } catch (_) {}
    pushes += await pushTo(env, d.user_id, { title: p.names ? d.gname : "Chat",
      body: `A pigeon to you flew into ${k}. It’ll land ${lateBy(d.wx_ms)} late, ${whenAt(d.deliver_at, p.tz)}.`, tag: "wx-" + d.rid, url: `/pigeon/#open=${d.group_id}` });
  }
  return pushes;
}
// A pigeon in the air changed course for the weather (_live.js): its sender
// and recipient hear why and when it now lands (in a group, its recipient).
// Where the storms are (or where it's sheltering), only with names on.
const TURN_WHY = { s: (where, k) => `to go around ${WX_WORDS[k] || "storms"}${where ? ` over ${where}` : ""}`, w: () => "to ride the wind" };
async function turnNotes(env, D, t, turns) {
  let pushes = 0;
  for (const x of turns) {
    const why = (p) => (TURN_WHY[x.why] || TURN_WHY.w)(p.names ? x.where : null, x.k);
    // (sheltering: "Your pigeon is sheltering from storms on the Azores until about 16:00. It now lands at 21:40.")
    const say = (p, who) => x.why === "h"
      ? `${who} is sheltering from ${WX_WORDS[x.k] || "storms"}${p.names && x.where ? ` ${x.where}` : ""} until about ${dayClock(x.until, p.tz)}. It now lands ${whenAt(x.deliver, p.tz)}.`
      : `${who} changed course ${why(p)}. It now lands ${whenAt(x.deliver, p.tz)}.`;
    if (x.group) {
      const g = await D.prepare(`SELECT g.name, u.notify_prefs, u.pigeons, COALESCE(gm.muted, 1) AS muted FROM pg_groups g JOIN pg_users u ON u.id = ?2
        LEFT JOIN pg_group_members gm ON gm.group_id = g.id AND gm.user_id = ?2 WHERE g.id = ?1`).bind(x.r.group_id, x.r.user_id).first();
      const p = g && prefsOf(g); if (!p || g.pigeons === 0 || !p.delays || isQuiet(p, t) || g.muted) continue;
      pushes += await pushTo(env, x.r.user_id, { title: p.names ? g.name : "Chat", body: say(p, "A pigeon to you"),
        tag: "wxturn-" + x.r.msg_id, url: `/pigeon/#open=${x.r.group_id}` });
      continue;
    }
    const { results } = await D.prepare("SELECT id, name, notify_prefs, pigeons FROM pg_users WHERE id IN (?1, ?2)").bind(x.r.sender, x.r.recipient).all();
    const s = results.find((u) => u.id === x.r.sender), r = results.find((u) => u.id === x.r.recipient); if (!s || !r) continue;
    const sp = prefsOf(s), rp = prefsOf(r);
    if (s.pigeons !== 0 && sp.delays && !isQuiet(sp, t)) pushes += await pushTo(env, s.id, { title: sp.names ? `To ${firstName(r.name)}` : "Chat",
      body: say(sp, "Your pigeon"), tag: "wxturn-" + x.r.id, url: `/pigeon/#open=${r.id}` });
    if (r.pigeons !== 0 && rp.delays && !isQuiet(rp, t) && (await pals(D, s.id, r.id))) pushes += await pushTo(env, r.id, { title: rp.names ? firstName(s.name) : "Chat",
      body: say(rp, `${rp.names ? "Their" : "A"} pigeon to you`), tag: "wxturn-" + x.r.id, url: `/pigeon/#open=${s.id}` });
  }
  return pushes;
}
// By ship (functions/_route.js): its sender and recipient hear when it boards
// its ship and when it comes ashore (in a group, its recipient), as the other
// moments of a flight. The ports only with names on (they'd say roughly where
// its sender is). Only what happened since the last tick: a tick that missed
// the boarding says just that it's ashore.
const SHIP_BOARD = 1, SHIP_ASHORE = 2;
function voyageOf(legs) {
  let b = []; try { b = JSON.parse(legs || "[]").filter((l) => l[3] === "b"); } catch (_) {}
  return b.length >= 3 ? { from: b[0][4] || null, off: b[1][2], to: b.at(-1)[4] || null, ashore: b.at(-1)[2] } : null;
}
// (and not long ago: one missed for hours goes untold)
const SHIP_STALE = 2 * HOUR;
const shipEv = (v, t, since0, told) => { const since = Math.max(since0, t - SHIP_STALE), ev = v.ashore <= t && v.ashore > since ? SHIP_ASHORE : v.off <= t && v.off > since && v.ashore > t ? SHIP_BOARD : 0; return ev > (told || 0) ? ev : 0; };
const shipSay = (p, who, v, ev, deliver) => (ev === SHIP_BOARD
  ? `${who} boarded a ship${p.names && v.from ? ` at ${v.from}` : ""}. It comes ashore${p.names && v.to ? ` at ${v.to}` : ""} ${whenAt(v.ashore, p.tz)}.`
  : `${who} came ashore${p.names && v.to ? ` at ${v.to}` : ""} and is flying on. It lands ${whenAt(deliver, p.tz)}.`);
// Off the Earth (functions/_moon.js): a space pigeon's sender hears its big moments as they happen
// (halfway to the Moon, behind it, re-entry, in orbit, a lunar eclipse on the way), as Mid-air Moments.
// Only the latest one since the last tick, and only if it's fresh: a missed one goes untold.
const SPACE_KIND = { lunar: "lunar pigeon", lunarx: "lunar express pigeon", laser: "laser pigeon", orbital: "orbital pigeon" };
async function spaceTick(env, D, t) {
  let pushes = 0;
  const { results } = await allRows(D, `SELECT m.id, m.sender, m.recipient, m.pigeon, m.moon, m.moon_told, m.sent_at, m.deliver_at, r.name AS rname, s.notify_prefs, s.pigeons FROM pg_msgs m
    JOIN pg_users s ON s.id = m.sender JOIN pg_users r ON r.id = m.recipient
    WHERE m.moon IS NOT NULL AND m.deliver_at > ?1 AND m.sent_at <= ?1 AND (m.lost_at IS NULL OR m.lost_at > ?1)`, [t], "m", "deliver_at");
  for (const m of results) {
    let mn; try { mn = JSON.parse(m.moon); } catch (_) { continue; }
    // (the leg it's on: a pigeon relayed on to another world has two, its moments told as 0-99, then 100 on)
    const L = legOf(mn, m.sent_at, m.deliver_at, t), base = mn.prev && !L.then ? 100 : 0;
    const due = spaceMoments(L.mn, L.from, L.to, t).filter((x) => x.tell && x.done && base + x.i > (m.moon_told ?? -1)).at(-1);
    if (!due) continue;
    const claimed = await D.prepare("UPDATE pg_msgs SET moon_told = ?1 WHERE id = ?2 AND COALESCE(moon_told, -1) < ?1").bind(base + due.i, m.id).run();
    if (!claimed.meta.changes || t - due.at > 2 * HOUR) continue;
    const p = prefsOf(m); if (m.pigeons === 0 || !p.moments || isQuiet(p, t)) continue;
    pushes += await pushTo(env, m.sender, { title: p.names ? `To ${firstName(m.rname)}` : "Chat", body: `Your ${SPACE_KIND[L.mn.pk] || SPACE_KIND[m.pigeon] || "pigeon"}: ${due.text.replace(/^./, (c) => c.toLowerCase())}.`,
      tag: "space-" + m.id, url: `/pigeon/#open=${m.recipient}` });
  }
  return pushes;
}
async function shipTick(env, D, t, since) {
  let pushes = 0;
  const { results: one } = await allRows(D, `SELECT m.id, m.sender, m.recipient, m.legs, m.deliver_at, m.ship_told, s.name AS sname, r.name AS rname, s.notify_prefs AS sp, r.notify_prefs AS rp, s.pigeons AS spg, r.pigeons AS rpg FROM pg_msgs m
    JOIN pg_users s ON s.id = m.sender JOIN pg_users r ON r.id = m.recipient
    WHERE m.notified_at IS NULL AND m.deliver_at > ?1 AND m.sent_at <= ?1 AND (m.lost_at IS NULL OR m.lost_at > ?1) AND COALESCE(m.ship_told, 0) < 2 AND m.legs LIKE '%"b"%'`, [t], "m", "deliver_at");
  for (const m of one) {
    const v = voyageOf(m.legs), ev = v && shipEv(v, t, since, m.ship_told); if (!ev) continue;
    const claimed = await D.prepare("UPDATE pg_msgs SET ship_told = ?1 WHERE id = ?2 AND COALESCE(ship_told, 0) < ?1").bind(ev, m.id).run();
    if (!claimed.meta.changes) continue;
    const sp = prefsOf({ notify_prefs: m.sp }), rp = prefsOf({ notify_prefs: m.rp });
    if (m.spg !== 0 && sp.moments && !isQuiet(sp, t)) pushes += await pushTo(env, m.sender, { title: sp.names ? `To ${firstName(m.rname)}` : "Chat",
      body: shipSay(sp, "Your pigeon", v, ev, m.deliver_at), tag: "ship-" + m.id, url: `/pigeon/#open=${m.recipient}` });
    if (m.rpg !== 0 && rp.moments && !isQuiet(rp, t) && (await pals(D, m.sender, m.recipient))) pushes += await pushTo(env, m.recipient, { title: rp.names ? firstName(m.sname) : "Chat",
      body: shipSay(rp, `${rp.names ? "Their" : "A"} pigeon to you`, v, ev, m.deliver_at), tag: "ship-" + m.id, url: `/pigeon/#open=${m.sender}` });
  }
  const { results: grp } = await allRows(D, `SELECT d.rowid AS rid, d.user_id, d.legs, d.deliver_at, d.ship_told, g.name AS gname, m.group_id, u.notify_prefs, u.pigeons, COALESCE(gm.muted, 1) AS muted FROM pg_gdeliv d
    JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = d.user_id
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = d.user_id
    WHERE d.notified_at IS NULL AND d.deliver_at > ?1 AND m.sent_at <= ?1 AND (d.lost_at IS NULL OR d.lost_at > ?1) AND COALESCE(d.ship_told, 0) < 2 AND d.legs LIKE '%"b"%'`, [t], "d", "deliver_at");
  for (const d of grp) {
    const v = voyageOf(d.legs), ev = v && shipEv(v, t, since, d.ship_told); if (!ev) continue;
    const claimed = await D.prepare("UPDATE pg_gdeliv SET ship_told = ?1 WHERE rowid = ?2 AND COALESCE(ship_told, 0) < ?1").bind(ev, d.rid).run();
    if (!claimed.meta.changes) continue;
    const p = prefsOf(d); if (d.pigeons === 0 || !p.moments || isQuiet(p, t) || d.muted) continue;
    pushes += await pushTo(env, d.user_id, { title: p.names ? d.gname : "Chat", body: shipSay(p, "A pigeon to you", v, ev, d.deliver_at), tag: "ship-" + d.rid, url: `/pigeon/#open=${d.group_id}` });
  }
  return pushes;
}
async function reactTick(env, D, t, since, H = holdsAt(D, t, env)) {
  let pushes = 0, rode = new Map();
  const { results } = await allRows(D, `SELECT r.id, r.sender, r.recipient, r.group_id, r.deliver_at, u.notify_prefs, s.name AS sname, g.name AS gname, CASE WHEN r.group_id IS NOT NULL AND gm.user_id IS NULL THEN 1 ELSE gm.muted END AS muted
    FROM pg_reacts r JOIN pg_users u ON u.id = r.recipient JOIN pg_users s ON s.id = r.sender
    LEFT JOIN pg_groups g ON g.id = r.group_id LEFT JOIN pg_group_members gm ON gm.group_id = r.group_id AND gm.user_id = r.recipient
    WHERE r.recipient IS NOT NULL AND r.notified_at IS NULL AND r.deliver_at <= ?1 AND r.deliver_at > ?2`, [t, since], "r", "deliver_at");
  // (one that flew has landed: its chat poked on both sides, so an open chat shows it now, whether or not quiet hours hold
  // its notification; one that came at once was poked as it was sent, and isn't poked again)
  if (results.length) await D.batch(pokesAfter(D, results.flatMap((r) => [[r.recipient, r.group_id || r.sender, r.deliver_at], [r.sender, r.group_id || r.recipient, r.deliver_at]]))).catch(() => {});
  await H.load(results.map((r) => r.recipient));
  for (const r of results) {
    const p = prefsOf(r); if (isQuiet(p, t) || H.holds(r.recipient)) continue;   // held until quiet hours, or a ride, end
    const c = await D.prepare("UPDATE pg_reacts SET notified_at = ? WHERE id = ? AND notified_at IS NULL").bind(t, r.id).run();
    if (!c.meta.changes || !p.reactions || r.muted) continue;
    if (H.rode(r.recipient, r.deliver_at)) rode.set(r.recipient, (rode.get(r.recipient) || 0) + 1);
    const chat = r.group_id || r.sender;
    pushes += await pushTo(env, r.recipient, { title: p.names ? (r.gname || firstName(r.sname)) : "Chat",
      body: p.names ? `${r.gname ? firstName(r.sname) + " r" : "R"}eacted to your message.` : "Someone reacted to your message.", tag: "react-" + chat, url: `/pigeon/#open=${chat}` });
  }
  for (const [uid, n] of rode) await heldAdd(env, uid, n);
  return pushes;
}

// Near misses as they happen: told to each person who could see both pigeons.
const kindName = (k) => ({ rocket: "rocket", turbo: "turbo", swift: "swift", dumb: "dumb", standard: "standard" }[k] || "standard");
async function nearTick(env, D, t, since) {
  let pushes = 0;
  const { results } = await D.prepare(`SELECT n.*, ma.sender AS a_from, ma.recipient AS a_to, ma.pigeon AS a_kind, mb.sender AS b_from, mb.recipient AS b_to, mb.pigeon AS b_kind
    FROM pg_near n JOIN pg_msgs ma ON ma.id = n.a JOIN pg_msgs mb ON mb.id = n.b
    WHERE n.told IS NULL AND n.at <= ?1 AND n.at > ?2 LIMIT 100`).bind(t, since).all();
  for (const r of results) {
    const claimed = await D.prepare("UPDATE pg_near SET told = ? WHERE a = ? AND b = ? AND told IS NULL").bind(t, r.a, r.b).run();
    if (!claimed.meta.changes) continue;
    for (const v of new Set([r.a_from, r.a_to].filter((x) => x === r.b_from || x === r.b_to))) {
      const u = await D.prepare("SELECT id, notify_prefs, pigeons FROM pg_users WHERE id = ?").bind(v).first(); if (!u || u.pigeons === 0) continue;
      const p = prefsOf(u); if (!p.moments || isQuiet(p, t)) continue;
      // the leader first, if one overtook the other
      const [x, y] = r.lead === r.b ? ["b", "a"] : ["a", "b"];
      const mine = (s) => r[s + "_from"] === v, them = (s) => (mine(s) ? r[s + "_to"] : r[s + "_from"]);
      const names = new Map();
      for (const id of new Set([them(x), them(y)])) names.set(id, firstName((await D.prepare("SELECT name FROM pg_users WHERE id = ?").bind(id).first())?.name));
      const over = r.place && r.place !== "land" ? ` over ${r.place}` : "";
      let body;
      if (r.kind === "flock") {                                     // flying together (functions/_moments.js): a little quicker for it
        const say = (s) => (mine(s) ? `your pigeon to ${names.get(them(s))}` : `${names.get(them(s))}’s pigeon`);
        const both = !p.names ? "Two of your pigeons are" : them(x) === them(y) ? (mine(x) === mine(y) ? "Your pigeons are" : `Your pigeon and ${names.get(them(x))}’s are`)
          : `${say(x)[0].toUpperCase() + say(x).slice(1)} and ${say(y)} are`;
        pushes += await pushTo(env, v, { title: "Flying together", body: `${both} flying together${p.names ? over : ""}: both a little quicker for it.`, tag: `near-${r.a}-${r.b}`, url: `/pigeon/#open=${them(x)}` });
        continue;
      }
      if (!p.names) body = r.kind === "overtake" ? "One of your pigeons just overtook another in mid-air." : "Two of your pigeons just passed each other in mid-air.";
      else if (them(x) === them(y)) {
        const n = names.get(them(x));
        body = r.kind !== "overtake" ? (mine(x) === mine(y) ? `Your pigeons just passed each other${over}.` : `Your pigeon and ${n}’s just passed each other${over}.`)
          : mine(x) && mine(y) ? `Your ${kindName(r[x + "_kind"])} pigeon just overtook your ${kindName(r[y + "_kind"])} one${over}.`
          : !mine(x) && !mine(y) ? `${n}’s ${kindName(r[x + "_kind"])} pigeon just overtook their ${kindName(r[y + "_kind"])} one${over}.`
          : `${mine(x) ? "Your" : n + "’s"} pigeon just overtook ${mine(y) ? "yours" : n + "’s"}${over}.`;
      } else {
        const say = (s) => (mine(s) ? `your pigeon to ${names.get(them(s))}` : `${names.get(them(s))}’s pigeon`);
        const lead = say(x); body = `${lead[0].toUpperCase() + lead.slice(1)} just ${r.kind === "overtake" ? "overtook" : "passed"} ${say(y)}${over}.`;
      }
      pushes += await pushTo(env, v, { title: "Near miss", body, tag: `near-${r.a}-${r.b}`, url: `/pigeon/#open=${them(x)}` });
    }
  }
  return pushes;
}

// A friend's pigeon flying over you, as it does: look up! Only if you're still
// where you were (and still friends); never who it's flying to.
async function flyTick(env, D, t, since) {
  let pushes = 0;
  const { results } = await D.prepare(`SELECT f.*, s.name AS sname, u.notify_prefs, u.pigeons, u.lat AS ulat, u.lon AS ulon FROM pg_flyover f
    JOIN pg_users s ON s.id = f.sender JOIN pg_users u ON u.id = f.user_id
    WHERE f.told IS NULL AND f.at <= ?1 AND f.at > ?2 LIMIT 200`).bind(t, since).all();
  for (const r of results) {
    const friends = await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(r.sender, r.user_id).first();
    if (!friends || r.ulat == null || haversineKm(r.ulat, r.ulon, r.lat, r.lon) > 25) { await D.prepare("DELETE FROM pg_flyover WHERE msg_id = ? AND user_id = ? AND told IS NULL").bind(r.msg_id, r.user_id).run(); continue; }
    const claimed = await D.prepare("UPDATE pg_flyover SET told = ? WHERE msg_id = ? AND user_id = ? AND told IS NULL").bind(t, r.msg_id, r.user_id).run();
    if (!claimed.meta.changes) continue;
    const p = prefsOf(r); if (r.pigeons === 0 || !p.moments || isQuiet(p, t)) continue;
    pushes += await pushTo(env, r.user_id, { title: "Look up!", body: p.names ? `${firstName(r.sname)}’s pigeon just flew over you. Wave hello?` : "A friend’s pigeon just flew over you. Wave hello?",
      tag: "fly-" + r.msg_id, url: `/pigeon/#open=${r.sender}` });
  }
  return pushes;
}

// Where pigeons flew from and to is only kept exactly while it matters: a month
// after landing, the ends of each route are rounded to half a degree (about
// 50 km, still right for the map, the miles and the badges) and the points
// where it changed course (where someone moved to) are dropped. Once an hour.
const BLUR_AFTER = 30 * DAY, half = (c) => `${c} = ROUND(${c} * 2) / 2`;
const keptWay = (legs) => WAY_PARTS(legs).map((x, i) => `${["w_dodged", "w_shelter", "w_ship"][i]} = ${x}`).join(", ");
async function blurOld(D, t) {
  const last = await D.prepare("SELECT v FROM pg_meta WHERE k = 'blur_at'").first();
  if (last && t - Number(last.v) < HOUR) return;
  await D.batch([
    D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('blur_at', ?)").bind(String(t)),
    // (what its way said, round storms, sheltering, a ship, is kept first, for the flight log and its line later)
    D.prepare(`UPDATE pg_msgs SET ${["from_lat", "from_lon", "to_lat", "to_lon"].map(half).join(", ")}, ${keptWay("legs")}, legs = NULL, coarse = 1 WHERE coarse IS NULL AND deliver_at < ?1 AND sent_at < ?1`).bind(t - BLUR_AFTER),      // (sent before it landed: so by pg_msgs_sent)
    D.prepare(`UPDATE pg_gdeliv SET ${["to_lat", "to_lon"].map(half).join(", ")}, ${keptWay("legs")}, legs = NULL, coarse = 1 WHERE coarse IS NULL AND deliver_at < ?`).bind(t - BLUR_AFTER),
    D.prepare(`UPDATE pg_gmsgs SET ${["from_lat", "from_lon"].map(half).join(", ")}, coarse = 1 WHERE coarse IS NULL AND sent_at < ?`).bind(t - BLUR_AFTER - 8 * DAY),
    D.prepare(`UPDATE pg_near SET ${["lat", "lon"].map(half).join(", ")}, coarse = 1 WHERE coarse IS NULL AND at < ?`).bind(t - BLUR_AFTER),
    // and none outlives either of its pigeons
    D.prepare("DELETE FROM pg_near WHERE NOT EXISTS (SELECT 1 FROM pg_msgs WHERE id = pg_near.a) OR NOT EXISTS (SELECT 1 FROM pg_msgs WHERE id = pg_near.b)"),
    // a flyover (and where the friend it flew over was) goes after a month, or with its pigeon
    D.prepare(`DELETE FROM pg_flyover WHERE at < ? OR (NOT EXISTS (SELECT 1 FROM pg_msgs WHERE id = pg_flyover.msg_id) AND NOT EXISTS (SELECT 1 FROM pg_gmsgs WHERE id = pg_flyover.msg_id))`).bind(t - BLUR_AFTER),
  ]);
}
// (pg_push's via column, which marks the rows InFlite's one device route fanned out (functions/_devices.js, which makes
// it too): made by the tick as well, once a copy of the server's running, so the rollback's "DELETE FROM pg_push WHERE
// via = 'hub'" (spec §15.4) has it to read on a database no device route has been used on. Its failure (it's there
// already) ignored)
const viaMade = new WeakSet();
// Pigeons that have landed since the last tick: push now; email those who
// asked, once things have been waiting a little while unread. Quiet hours hold
// both until they end. Only landings after notifications went live count.
export async function tick(env, origin) {
  const D = await db(env), t = Date.now();
  if (!viaMade.has(D)) { viaMade.add(D); await D.prepare("ALTER TABLE pg_push ADD COLUMN via TEXT").run().catch(() => {}); }
  await sweepPhotos(env).catch(() => {});     // photos go 24 h after landing, even if no one opens the app
  await lockOldSecrets(D, env).catch((e) => logError(env, "pigeon at rest", e));
  await vanishSweep(env).catch((e) => logError(env, "pigeon vanish", e));          // disappearing messages that are due (functions/_vanish.js)   // (functions/_atrest.js: once PIGEON_PEPPER is set)
  // old rate-limit windows and ended sessions (an account page opened from an app ends with the app's sign-in): once an
  // hour, not every tick (each a read of whole tables)
  const swept = await D.prepare("SELECT v FROM pg_meta WHERE k = 'sweep_at'").first().catch(() => null);
  if (!swept || t - Number(swept.v) >= HOUR) await D.batch([D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('sweep_at', ?)").bind(String(t)),
    D.prepare("DELETE FROM pg_limits WHERE reset_at < ?").bind(t - DAY),
    D.prepare("DELETE FROM pg_sessions WHERE seen_at < ?").bind(t - 181 * DAY),
    D.prepare("DELETE FROM pg_sessions WHERE parent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_sessions p WHERE p.hash = pg_sessions.parent)"),
    D.prepare("DELETE FROM pg_links WHERE status IN ('pending', 'declined') AND created_at < ?").bind(t - 30 * DAY),
    D.prepare("DELETE FROM pg_wxcache WHERE at < ?").bind(t - HOUR),
    D.prepare("DELETE FROM pg_handles_held WHERE until < ?").bind(t),
    D.prepare("DELETE FROM pg_errors WHERE at < ?").bind(t - 14 * DAY),
    // chats' way lines after 30 days, and the change feed after 7 (functions/_pulse.js)
    D.prepare("DELETE FROM pg_wayev WHERE at < ?").bind(t - 30 * DAY),
    D.prepare("DELETE FROM pg_pulse WHERE at < ?").bind(t - 7 * DAY)]).catch(() => {});
  // messages over a month old (their pigeons' lines kept), stray files, accounts unused for a year (functions/_retention.js):
  // before the blur below, which would otherwise clear a month-old flight's way before its line could note what it did
  await housekeeping(env, D, t, origin).catch((e) => logError(env, "pigeon housekeeping", e));
  await blurOld(D, t).catch((e) => logError(env, "pigeon blur", e));
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('notify_since', ?)").bind(String(t)).run();
  const since = Math.max(Number((await D.prepare("SELECT v FROM pg_meta WHERE k = 'notify_since'").first()).v), t - LOOKBACK);
  const { results: due } = await allRows(D, `SELECT m.id, m.sender, m.recipient, m.instant, m.deliver_at, u.notify_prefs, u.open_chat, u.open_at FROM pg_msgs m JOIN pg_users u ON u.id = m.recipient
    WHERE m.notified_at IS NULL AND m.lost_at IS NULL AND m.deliver_at <= ?1 AND m.deliver_at > ?2`, [t, since], "m", "deliver_at");
  const prefs = new Map(due.map((m) => [m.recipient, prefsOf(m)]));
  // quiet ones wait, and so do those for someone on a ride they planned (functions/_busy.js: H, the tick's view of who's
  // riding, for every pass of it); and a message waits while that chat is open on their phone (they're reading it), for
  // 5 minutes at most: an app that went without saying so still gets its push. (since never moves past LOOKBACK, so it's
  // seen again)
  const H = holdsAt(D, t, env);
  await H.load(due.map((m) => m.recipient));
  const ready = due.filter((m) => !isQuiet(prefs.get(m.recipient), t) && !H.holds(m.recipient) && !(m.instant && openOn(m, m.sender, t) && m.deliver_at > t - OPEN_HOLD));
  let landed = [];
  // (one held still changes the chat for both phones as it lands, or as a message booked for now is sent: poked once,
  // when it comes due, and again when it's told; the pulse brings it, not the next full fetch)
  const go = new Set(ready), waits = due.filter((m) => !go.has(m));
  if (waits.length) await D.batch(pokesAfter(D, waits.flatMap((m) => [[m.recipient, m.sender, m.deliver_at], [m.sender, m.recipient, m.deliver_at]]))).catch(() => {});
  if (ready.length) {
    // claim them first, so two ticks running at once can't both send
    for (const part of chunks(ready)) {
      const { results } = await D.prepare(`UPDATE pg_msgs SET notified_at = ? WHERE notified_at IS NULL AND id IN (${part.map(() => "?").join(",")}) RETURNING sender, recipient, read_at, instant, deliver_at`)
        .bind(t, ...part.map((m) => m.id)).all();
      // (both phones told the chat changed: a letter has landed, or a message booked for now has been sent)
      if (results.length) await D.batch(pokes(D, results.flatMap((m) => [[m.recipient, m.sender], [m.sender, m.recipient]]))).catch(() => {});
      landed.push(...results.filter((m) => (m.instant ? prefs.get(m.recipient).messages : prefs.get(m.recipient).landed) && !m.read_at));
    }
  }
  // (those a ride held, told now it's done: "while you rode", each counted in the hold rule's record as it's told, below:
  // how many of each person's from each friend a ride held)
  const rodeIn = new Map();
  for (const m of landed) if (H.rode(m.recipient, m.deliver_at)) { const k = m.recipient + "|" + m.sender + "|" + (m.instant ? 1 : 0); rodeIn.set(k, (rodeIn.get(k) || 0) + 1); }
  let pushes = 0, emails = 0;
  // Pigeon Death: tell the sender when one of theirs is lost on the way
  const { results: lost } = await allRows(D, `SELECT m.id, m.sender, m.recipient, u.notify_prefs, r.name FROM pg_msgs m
    JOIN pg_users u ON u.id = m.sender JOIN pg_users r ON r.id = m.recipient
    WHERE m.notified_at IS NULL AND m.lost_at IS NOT NULL AND m.lost_at <= ?1 AND m.lost_at > ?2`, [t, since], "m", "lost_at");
  await H.load(lost.map((m) => m.sender));
  for (const m of lost) {
    const p = prefsOf(m); if (isQuiet(p, t) || H.holds(m.sender)) continue;
    const claimed = await D.prepare("UPDATE pg_msgs SET notified_at = ? WHERE id = ? AND notified_at IS NULL").bind(t, m.id).run();
    if (claimed.meta.changes) await D.batch(pokes(D, [[m.sender, m.recipient], [m.recipient, m.sender]])).catch(() => {});
    if (!claimed.meta.changes || !p.lost) continue;
    // (letters only take turns)
    const last = await D.prepare("SELECT * FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND sent_at <= ?3 AND instant IS NULL ORDER BY sent_at DESC LIMIT 1").bind(m.sender, m.recipient, t).first();
    const again = turn(m.sender, last, t).free ? " It’s your turn again." : "";      // (not if another of yours, or one of theirs, has flown since)
    pushes += await pushTo(env, m.sender, { title: "Pigeon lost", body: p.names ? `Your pigeon to ${firstName(m.name)} didn’t make it.${again}` : `One of your pigeons didn’t make it.${again}`,
      tag: "lost-" + m.recipient, url: `/pigeon/#open=${m.recipient}` });
  }
  if (landed.length) {
    const ids = [...new Set(landed.map((m) => m.sender))], name = new Map();
    for (const part of chunks(ids)) {
      const { results: senders } = await D.prepare(`SELECT id, name FROM pg_users WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all();
      for (const x of senders) name.set(x.id, x.name);
    }
    // (letters and messages told apart: a message as it's told when sent, its words, count and tag the same, whichever claims it)
    const pairs = new Map();
    for (const m of landed) { const k = m.recipient + "|" + m.sender + "|" + (m.instant ? 1 : 0); pairs.set(k, (pairs.get(k) || 0) + 1); }
    const rodeN = new Map();
    for (const [k, n] of pairs) {
      const [to, from, inst] = k.split("|"), names = prefs.get(to).names;
      // blocked or unfriended since it took off: it still lands, but no one is told who sent it (nor counted as held)
      if (!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(to, from).first())) continue;
      if (rodeIn.has(k)) rodeN.set(to, (rodeN.get(to) || 0) + rodeIn.get(k));
      if (inst === "1") { pushes += await tellMessage(env, D, to, { id: from, name: name.get(from) }, prefs.get(to), t, rodeIn.has(k)); continue; }
      pushes += await pushTo(env, to, { title: names ? firstName(name.get(from)) : "Chat",
        body: n > 1 ? `${n} pigeons have landed.` : "A pigeon has landed.", tag: "from-" + from, url: `/pigeon/#open=${from}` });
    }
    for (const [uid, n] of rodeN) await heldAdd(env, uid, n);
  }
  // friend requests and the like that quiet hours or a ride held, now they've ended for whoever they're for
  await heldTick(env, D, t, origin, H).catch((e) => logError(env, "pigeon held", e));
  // scheduled pigeons that have just taken off: now their recipient can hear about them
  // (a message booked for a time has no take-off to tell: the landing pass above told it as a message)
  const { results: off } = await D.prepare(`SELECT m.id, m.sender, m.recipient, m.deliver_at, m.pigeon, m.instant, u.name FROM pg_msgs m JOIN pg_users u ON u.id = m.sender
    WHERE m.sched = 1 AND m.sent_at <= ?1 LIMIT 200`).bind(t).all();
  for (const m of off) {
    const claimed = await D.prepare("UPDATE pg_msgs SET sched = 2 WHERE id = ? AND sched = 1").bind(m.id).run();
    // (a message booked for a time arrives as it's sent: both phones told, whether or not its notification waits)
    if (claimed.meta.changes) await D.batch(pokes(D, m.instant ? [[m.recipient, m.sender], [m.sender, m.recipient]] : [[m.recipient, m.sender]])).catch(() => {});
    if (claimed.meta.changes && !m.instant && m.deliver_at > t) { await pigeonSent(env, { id: m.sender, name: m.name }, m.recipient, m.deliver_at, m.pigeon).catch(() => {}); }
  }
  // stopovers: tell the friend it's resting with them, so they can add a line before it flies on
  const { results: rests } = await D.prepare(`SELECT m.id, m.sender, m.recipient, m.via, m.via_off, s.name AS sname, r.name AS rname, v.notify_prefs, v.pigeons AS vpigeons FROM pg_msgs m
    JOIN pg_users s ON s.id = m.sender JOIN pg_users r ON r.id = m.recipient JOIN pg_users v ON v.id = m.via
    WHERE m.via IS NOT NULL AND m.via_told IS NULL AND m.via_at <= ?1 AND m.via_at > ?2 AND (m.lost_at IS NULL OR m.lost_at > ?1) LIMIT 200`).bind(t, since).all();
  await H.load(rests.map((m) => m.via));
  for (const m of rests) {
    const p = prefsOf(m); if (isQuiet(p, t) || H.holds(m.via)) continue;
    const claimed = await D.prepare("UPDATE pg_msgs SET via_told = ? WHERE id = ? AND via_told IS NULL").bind(t, m.id).run();
    // (not to a friend with pigeons off: they couldn't add a line, so they aren't asked to)
    if (!claimed.meta.changes || !p.landed || m.via_off <= t || m.vpigeons === 0) continue;
    pushes += await pushTo(env, m.via, { title: p.names ? `${firstName(m.sname)}’s pigeon stopped by` : "A pigeon stopped by",
      body: p.names ? `It’s resting with you on its way to ${firstName(m.rname)}. Add a line before it flies on.` : "It’s resting with you for an hour. Add a line before it flies on.",
      tag: "via-" + m.id, url: `/pigeon/#open=${m.sender}` });
  }
  // (the extras, once the tick has used 20 seconds, wait for the next: what matters most has gone already)
  const spare = () => Date.now() - t < 20e3;
  const live = !spare() ? { turns: [] } : await liveTick(env, D, t).catch((e) => { logError(env, "pigeon live", e); return { turns: [] }; });   // the weather ahead of pigeons in the air
  if (spare()) pushes += await turnNotes(env, D, t, live.turns).catch((e) => { logError(env, "pigeon live notes", e); return 0; });
  if (spare()) pushes += await wxTick(env, D, t, since).catch((e) => { logError(env, "pigeon wx", e); return 0; });
  if (spare()) pushes += await nearTick(env, D, t, since).catch((e) => { logError(env, "pigeon near", e); return 0; });
  if (spare()) pushes += await flyTick(env, D, t, since).catch((e) => { logError(env, "pigeon fly", e); return 0; });
  if (spare()) pushes += await shipTick(env, D, t, since).catch((e) => { logError(env, "pigeon ships", e); return 0; });
  if (spare()) pushes += await spaceTick(env, D, t).catch((e) => { logError(env, "pigeon space", e); return 0; });
  if (spare()) pushes += await streakTick(env, D, t).catch((e) => { logError(env, "pigeon streaks", e); return 0; });
  if (spare()) await settleBirds(D, t).catch((e) => logError(env, "pigeon birds", e));      // named pigeons' careers, as their flights end
  if (spare()) await stampPassports(D, t).catch((e) => logError(env, "pigeon passport", e));  // the places flights that landed flew over
  const gt = await groupTick(env, D, t, since, H).catch((e) => { logError(env, "pigeon groups", e); return { pushes: 0, landed: 0, held: 0 }; });
  pushes += gt.pushes;
  if (spare()) pushes += await reactTick(env, D, t, since, H).catch((e) => { logError(env, "pigeon reacts", e); return 0; });
  const wk = await weeklyTick(env, D, t, origin).catch((e) => { logError(env, "pigeon weekly", e); return { pushes: 0, emails: 0, sent: 0 }; });
  pushes += wk.pushes;
  if (emailReady(env)) {
    // everything waiting unread: one-to-one pigeons, and group ones (unless that group is muted)
    // (each half picks out its unread recent landings first, by index, not every message there is)
    const { results: waiting } = await D.prepare(`
      WITH inbox AS (
        SELECT recipient AS to_id, sender, sender AS chat, id, read_at, lost_at, deliver_at, instant FROM pg_msgs
          WHERE read_at IS NULL AND lost_at IS NULL AND deliver_at <= ?2 AND deliver_at > ?3
          AND EXISTS (SELECT 1 FROM pg_links k WHERE k.status = 'ok' AND ((k.a = recipient AND k.b = sender) OR (k.a = sender AND k.b = recipient)))
        UNION ALL
        SELECT d.user_id, g.sender, g.group_id, d.msg_id, d.read_at, d.lost_at, d.deliver_at, g.instant FROM pg_gdeliv d JOIN pg_gmsgs g ON g.id = d.msg_id
          JOIN pg_group_members gm ON gm.group_id = g.group_id AND gm.user_id = d.user_id WHERE gm.muted = 0
          AND d.read_at IS NULL AND d.lost_at IS NULL AND d.deliver_at <= ?2 AND d.deliver_at > ?3
          AND NOT EXISTS (SELECT 1 FROM pg_links k WHERE k.status = 'blocked' AND ((k.a = d.user_id AND k.b = g.sender) OR (k.a = g.sender AND k.b = d.user_id))))
      SELECT u.id, u.email, u.notify_prefs, u.email_at, COUNT(m.id) AS n, SUM(CASE WHEN m.instant = 1 THEN 1 ELSE 0 END) AS msgs, GROUP_CONCAT(DISTINCT s.name) AS names, GROUP_CONCAT(DISTINCT m.chat) AS senders
      FROM pg_users u JOIN inbox m ON m.to_id = u.id JOIN pg_users s ON s.id = m.sender
      WHERE u.notify_email = 1 AND u.email_ok IS NOT NULL AND COALESCE(u.email_at, 0) < ?1
        AND m.read_at IS NULL AND m.lost_at IS NULL AND m.deliver_at <= ?2 AND m.deliver_at > MAX(COALESCE(u.email_at, 0), ?3)
      GROUP BY u.id LIMIT 50`).bind(t - EMAIL_EVERY, t - EMAIL_AFTER, Math.max(since, t - DAY)).all();
    await H.load(waiting.map((u) => u.id));
    for (const u of waiting) {
      // (letters as landed says, messages as messages does; not while quiet hours or a ride hold them)
      const p = prefsOf(u), msgs = u.msgs || 0, em = chatEmails({ ...u, notify_email: 1 }, p);
      if (!((em.landed && u.n - msgs > 0) || (em.messages && msgs > 0)) || isQuiet(p, t) || H.holds(u.id)) continue;
      const claimed = await D.prepare("UPDATE pg_users SET email_at = ?1 WHERE id = ?2 AND COALESCE(email_at, 0) < ?3").bind(t, u.id, t - EMAIL_EVERY).run();
      if (!claimed.meta.changes) continue;
      const who = String(u.names || "").split(",").map(firstName);
      const list = who.length > 2 ? `${who.slice(0, -1).join(", ")} and ${who.at(-1)}` : who.join(" and ");
      // all letters: as pigeons; all messages: as messages; some of each: both
      const letters = !p.names ? (u.n > 1 ? `${u.n} pigeons have landed` : "A pigeon has landed") : u.n > 1 ? `${u.n} pigeons have landed` : `A pigeon from ${who[0]} has landed`;
      const messages = !p.names ? (u.n > 1 ? `You have ${u.n} new messages on Chat` : "You have a new message on Chat")
        : who.length > 1 ? `${u.n} new messages` : u.n > 1 ? `${u.n} new messages from ${who[0]}` : `${who[0]} sent you a message`;
      const subject = msgs === 0 ? letters : msgs >= u.n ? messages : `${u.n} new messages and letters`;
      try {
        await notifyEmail(env, origin, u, subject, {
          icon: "landed", title: msgs === 0 ? (u.n > 1 ? `${u.n} pigeons have landed` : p.names ? `A pigeon from ${who[0]} has landed` : "A pigeon has landed") : subject,
          preheader: p.names ? `From ${list}. Open Chat to read ${u.n > 1 ? "them" : "it"}.` : `Open Chat to read ${u.n > 1 ? "them" : "it"}.`,
          ...(p.names ? { pill: ["person", `From ${list}`] } : {}),
          lines: [u.n > 1 ? `They’re waiting for you in Chat.` : "It’s waiting for you in Chat."],
          // one sender: straight into their chat; several: the Messages list
          button: { label: u.n > 1 ? "Read them" : "Read it", url: appLink(origin, String(u.senders || "").includes(",") || !u.senders ? "" : `#open=${u.senders}`) },
        }, msgs > 0 && em.messages ? "messages" : "landed");
        emails++;
      } catch (e) {
        // (not sent: the claim given back, so the next tick tries these landings again rather than only later ones)
        await D.prepare("UPDATE pg_users SET email_at = ? WHERE id = ? AND email_at = ?").bind(u.email_at ?? null, u.id, t).run().catch(() => {});
        logError(env, "pigeon notify email", e);
      }
    }
  }
  const res = { landed: landed.length + gt.landed, held: due.length - ready.length + gt.held, pushes, emails: emails + wk.emails, weekly: wk.sent };
  // (when it last ran and how long it took: Admin warns when it hasn't run lately)
  await D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('tick_last', ?)").bind(JSON.stringify({ at: t, ms: Date.now() - t, pushes, emails: res.emails })).run().catch(() => {});
  return res;
}

/* ---------- your week in flight: Sunday evening, wherever you are ---------- */
const WEEK = 7 * DAY;
// Sunday from 6pm in your time zone (quiet hours win). PIGEON_WEEKLY_ANYTIME
// (local testing only) makes any time count.
function weeklyDue(env, p, t) {
  if (env.PIGEON_WEEKLY_ANYTIME === "1") return true;
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: p.tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(t);
  const day = f.find((x) => x.type === "weekday")?.value, h = Number(f.find((x) => x.type === "hour")?.value);
  return day === "Sun" && h >= 18 && !isQuiet(p, t);
}
// What changed in the last seven days, said in a line (null: a quiet week, so nothing is sent)
export async function weekOf(D, uid, t) {
  const [now, then] = [await logFor(D, uid, t), await logFor(D, uid, t - WEEK)];
  const sent = now.sent - then.sent, got = now.received - then.received, mi = Math.round((now.km - then.km) * 0.621371);
  if (!sent && !got) return null;
  const was = new Map(then.badges.map((b) => [b.id, b.earned]));
  const fresh = now.badges.filter((b) => b.earned && !was.get(b.id));
  const next = now.badges.filter((b) => !b.earned).sort((a, b) => b.progress - a.progress)[0];
  const n = (x, one, many = one + "s") => `${x.toLocaleString("en-GB")} ${x === 1 ? one : many}`;
  const head = mi ? `Your pigeons flew ${mi.toLocaleString("en-GB")} mi this week: ${sent} sent, ${got} received.` : `This week: ${n(sent, "pigeon")} sent, ${got} received.`;
  const tail = fresh.length ? ` New badge${fresh.length > 1 ? "s" : ""}: ${fresh.map((b) => b.name).join(", ")}.` : next && next.progress > 0 ? ` You’re ${Math.round(next.progress * 100)}% of the way to ${next.name}.` : "";
  return { sent, got, mi, fresh: fresh.map((b) => b.name), next: next ? { name: next.name, progress: next.progress } : null, line: head + tail };
}
async function weeklyTick(env, D, t, origin) {
  const out = { pushes: 0, emails: 0, sent: 0 };
  // a random slice each minute, so over Sunday evening everyone's turn comes round
  // (your week in flight is a pigeons' note: none with them off)
  const { results } = await D.prepare(`SELECT id, name, email, notify_email, email_at, notify_prefs FROM pg_users
    WHERE COALESCE(weekly_at, 0) < ?1 AND pigeons != 0 AND (notify_email = 1 OR EXISTS (SELECT 1 FROM pg_push WHERE user_id = pg_users.id)) ORDER BY RANDOM() LIMIT 300`).bind(t - 6 * DAY).all();
  for (const u of results) {
    const p = prefsOf(u);
    if (!weeklyDue(env, p, t)) continue;
    const claimed = await D.prepare("UPDATE pg_users SET weekly_at = ?1 WHERE id = ?2 AND COALESCE(weekly_at, 0) < ?3").bind(t, u.id, t - 6 * DAY).run();
    const byMail = !!u.notify_email && chatEmails(u, p).weekly;
    if (!claimed.meta.changes || !(p.weekly || byMail)) continue;
    const w = await weekOf(D, u.id, t); if (!w) continue;
    out.sent++;
    if (p.weekly) out.pushes += await pushTo(env, u.id, { title: "Your week in flight", body: w.line, tag: "weekly", url: "/pigeon/#flightlog" });
    if (byMail && emailReady(env)) {
      try {
        if (await notifyEmail(env, origin, u, "Your week in flight", { icon: "bird", title: "Your week in flight", preheader: w.line,
          rows: [...(w.mi ? [["Miles flown", `${w.mi.toLocaleString("en-GB")} mi`]] : []), ["Pigeons sent", String(w.sent)], ["Pigeons received", String(w.got)],
            ...(w.fresh.length ? [["New badges", w.fresh.join(", ")]] : w.next && w.next.progress > 0 ? [["Next badge", `${w.next.name}, ${Math.round(w.next.progress * 100)}% there`]] : [])],
          button: { label: "Open your flight log", url: appLink(origin, "#flightlog") } }, "weekly")) out.emails++;
      } catch (e) { console.error("pigeon weekly email", e && e.message); }
    }
  }
  return out;
}

// Run a tick at most once a minute, shared across all servers via D1.
let lastLook = 0;
export async function maybeTick(env, origin) {
  const t = Date.now();
  if (t - lastLook < 20e3) return;
  lastLook = t;
  const D = await db(env);
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('tick', '0')").run();
  const r = await D.prepare("UPDATE pg_meta SET v = ?1 WHERE k = 'tick' AND CAST(v AS INTEGER) < ?2").bind(String(t), t - MIN).run();
  if (r.meta.changes) await oneTick(D, () => tick(env, origin));
}
// One tick at a time, whoever asks for it (the site's traffic, above, or the schedulers: notify-tick, from workers/ticker
// and GitHub's), so two never do the same work side by side: a lease, given back at the end, and kept fresh every few
// seconds while the tick runs (for a minute at most), so one left by a tick that died part way (a restart, or one traffic
// asked for, cut off 30 s or so after its request) lapses within 15 s, and the next takes over. wait: how long to wait
// for one already running to finish, to run after it; past that (or with none), { busy: true } and nothing run
const LEASE = 15e3, FRESH = 5e3, LONGEST = 60e3;
// (the schedulers' wait: longer than a lease, so one that's been left is always taken over, and short enough that it and
// a tick of its own fit well inside the ticker's 55 s and GitHub's 60)
export const TICK_WAIT = 20e3;
export async function oneTick(D, run, wait = 0) {
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('tick_run', '0')").run();
  const until = Date.now() + wait;
  let mine;
  for (;;) {
    const t = Date.now(); mine = String(t + LEASE);
    if ((await D.prepare("UPDATE pg_meta SET v = ?1 WHERE k = 'tick_run' AND CAST(v AS INTEGER) < ?2").bind(mine, t).run()).meta.changes) break;
    if (t >= until) return { busy: true };
    await new Promise((r) => setTimeout(r, 500));
  }
  const began = Date.now();
  let fresh = Promise.resolve();
  const keep = setInterval(() => {
    if (Date.now() - began > LONGEST) return;
    fresh = fresh.then(async () => {
      const next = String(Date.now() + LEASE);
      if ((await D.prepare("UPDATE pg_meta SET v = ?1 WHERE k = 'tick_run' AND v = ?2").bind(next, mine).run()).meta.changes) mine = next;
    }).catch(() => {});
  }, FRESH);
  try { return await run(); }
  finally {
    clearInterval(keep); await fresh;
    await D.prepare("UPDATE pg_meta SET v = '0' WHERE k = 'tick_run' AND v = ?").bind(mine).run().catch(() => {});
  }
}

export function tickAuthOk(request, env, secret = env.PIGEON_TICK_SECRET) {
  const m = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (!secret) throw new HttpError(404, "Not found.");
  const a = enc.encode(m ? m[1] : ""), b = enc.encode(secret);
  let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a[i] ^ b[i];
  if (d) throw new HttpError(401, "Not allowed.");
}
