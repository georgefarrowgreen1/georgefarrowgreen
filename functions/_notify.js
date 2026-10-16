// InFlight notifications: Web Push and email.
//
// Push uses the standard Web Push protocol: payloads are encrypted to each
// device (RFC 8291), so Apple, Google or Mozilla's push service sees only that
// a notification was sent, never its words. The server signs pushes with a
// VAPID key it makes for itself on first use and keeps in D1.
//
// Message text never appears in a notification: the server can't read it.
// A notification says who sent a pigeon and that it has landed.
//
// Landings happen on a timer, not on a request, so a "tick" looks for pigeons
// that have landed since the last one. It runs at most once a minute on the
// back of ordinary API traffic, and from an outside scheduler (see
// .github/workflows/inflight-notify.yml) when nobody is using the app.

import { liveTick } from "./_live.js";
import { stampPassports } from "./_passport.js";
import { MIN, HOUR, DAY, haversineKm, HttpError, b64url, fromB64url, randomToken, db, sendEmail, emailReady, emailBody, sweepPhotos, chunks, serverSecret } from "./_pigeon.js";
import { logFor } from "./_stats.js";
import { settleBirds } from "./_birds.js";
import { streakTick } from "./_streaks.js";

const enc = new TextEncoder();
const EMAIL_EVERY = 30 * MIN;     // at most one email per person per half hour
const EMAIL_AFTER = 10 * MIN;     // give push and the app a head start before emailing
const LOOKBACK = 3 * DAY;         // a pigeon held by quiet hours is still announced, but not forever

/* ---------------- preferences ----------------
   Account-wide (every phone follows them); whether push is on is per phone. */
export const NOTIFY_DEFAULTS = { landed: true, takeoff: false, rerouted: true, lost: true, requests: true, accepted: true, reactions: true, weekly: true, delays: true, moments: true, streaks: true, names: false, quiet: false, quietFrom: 22, quietTo: 7, tz: "UTC" };
export function prefsOf(u) {
  let p = {}; try { p = JSON.parse(u.notify_prefs || "{}") || {}; } catch (_) { /* defaults */ }
  return { ...NOTIFY_DEFAULTS, ...p };
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; } };
// Merge a partial update from the app, keeping only known keys and sane values.
export function cleanPrefs(cur, b) {
  const out = { ...cur };
  for (const k of ["landed", "takeoff", "rerouted", "lost", "requests", "accepted", "reactions", "weekly", "delays", "moments", "streaks", "names", "quiet"]) if (b[k] !== undefined) out[k] = !!b[k];
  for (const k of ["quietFrom", "quietTo"]) if (b[k] !== undefined) { const h = Number(b[k]); if (Number.isInteger(h) && h >= 0 && h < 24) out[k] = h; }
  if (b.tz !== undefined && typeof b.tz === "string" && b.tz.length < 60 && validTz(b.tz)) out.tz = b.tz;
  return out;
}
export function isQuiet(p, t = Date.now()) {
  if (!p.quiet || p.quietFrom === p.quietTo) return false;
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: p.tz, hour: "numeric", hourCycle: "h23" }).format(t));
  return p.quietFrom > p.quietTo ? h >= p.quietFrom || h < p.quietTo : h >= p.quietFrom && h < p.quietTo;
}

// Push services InFlight will send to. Subscriptions naming any other host are
// refused, so the server can't be pointed at arbitrary URLs.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];
export function pushEndpointOk(u) {
  try { const x = new URL(u); return x.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(x.hostname)); } catch (_) { return false; }
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
    sub: env.PIGEON_CONTACT ? `mailto:${env.PIGEON_CONTACT}` : "https://georgefarrowgreen.com/pigeon/",
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
// Send one notification to every device the person has turned push on for.
export async function pushTo(env, userId, note) {
  const D = await db(env);
  // a subscription lives only as long as the sign-in that made it
  const { results } = await D.prepare(`SELECT p.endpoint, p.p256dh, p.auth, s.hash IS NULL AS dead FROM pg_push p
    LEFT JOIN pg_sessions s ON s.hash = p.session WHERE p.user_id = ?`).bind(userId).all();
  let sent = 0;
  for (const sub of results) {
    if (sub.dead) { await D.prepare("DELETE FROM pg_push WHERE endpoint = ?").bind(sub.endpoint).run(); continue; }
    try {
      const r = await fetch(env.PIGEON_PUSH_URL || sub.endpoint, {     // PIGEON_PUSH_URL: tests only
        method: "POST",
        headers: { Authorization: await vapidAuth(env, sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
          TTL: String(note.ttl || DAY / 1000), Urgency: "normal", ...(note.tag ? { Topic: await topicFor(env, note.tag, sub.endpoint) } : {}),
          ...(env.PIGEON_PUSH_URL ? { "X-Endpoint": sub.endpoint } : {}) },
        body: await encryptPayload(sub, JSON.stringify({ title: note.title, body: note.body, tag: note.tag, url: note.url })),
      });
      if (r.status === 404 || r.status === 410) await D.prepare("DELETE FROM pg_push WHERE endpoint = ?").bind(sub.endpoint).run();   // device gone
      else if (r.ok) sent++;
      else console.error("pigeon push", r.status, await r.text().catch(() => ""));
    } catch (e) { console.error("pigeon push", e && e.message); }
  }
  return sent;
}

/* ---------------- email ---------------- */
export async function unsubToken(env, userId) {
  const D = await db(env);
  const u = await D.prepare("SELECT unsub FROM pg_users WHERE id = ?").bind(userId).first();
  if (u?.unsub) return u.unsub;
  const t = randomToken(18);
  await D.prepare("UPDATE pg_users SET unsub = ? WHERE id = ? AND unsub IS NULL").bind(t, userId).run();
  return (await D.prepare("SELECT unsub FROM pg_users WHERE id = ?").bind(userId).first()).unsub;
}
async function notifyEmail(env, origin, u, subject, mail) {
  if (!emailReady(env)) return false;
  // only to an address its owner has confirmed (anyone can type anyone's at sign-up)
  if (!(await (await db(env)).prepare("SELECT email_ok FROM pg_users WHERE id = ?").bind(u.id).first())?.email_ok) return false;
  const unsub = `${origin}/api/pigeon/unsubscribe?u=${encodeURIComponent(u.id)}&t=${await unsubToken(env, u.id)}`;
  const { text, html } = emailBody({ ...mail, origin, footer: "You get these because you turned on email notifications in InFlight.", unsub });
  await sendEmail(env, { to: u.email, subject, text, html,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
  await (await db(env)).prepare("UPDATE pg_users SET email_at = ? WHERE id = ?").bind(Date.now(), u.id).run();
  return true;
}

/* ---------------- events ---------------- */
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "Someone";
const userPrefs = async (env, id) => {
  const u = await (await db(env)).prepare("SELECT id, email, notify_email, email_at, notify_prefs FROM pg_users WHERE id = ?").bind(id).first();
  return u ? { u, p: prefsOf(u) } : null;
};
export async function friendRequested(env, origin, from, toId) {
  const r = await userPrefs(env, toId); if (!r || !r.p.requests || isQuiet(r.p)) return;
  await pushTo(env, toId, { title: r.p.names ? "Friend request" : "InFlight", body: r.p.names ? `${firstName(from.name)} (@${from.handle}) wants to be friends on InFlight.` : "You have a new friend request.", tag: "requests", url: "/pigeon/#requests" });
  if (r.u.notify_email && Date.now() - (r.u.email_at || 0) > EMAIL_EVERY)
    await notifyEmail(env, origin, r.u, r.p.names ? `${firstName(from.name)} wants to be friends on InFlight` : "You have a new friend request on InFlight", {
      icon: "friend", title: r.p.names ? `${firstName(from.name)} wants to be friends` : "New friend request",
      preheader: r.p.names ? `@${from.handle} sent you a friend request.` : "Someone sent you a friend request.",
      lines: [r.p.names ? `${firstName(from.name)} sent you a friend request. Accept it to start sending each other pigeons.` : "Someone sent you a friend request. Open InFlight to see who."],
      rows: r.p.names ? [["From", firstName(from.name)], ["Handle", `@${from.handle}`]] : [],
      button: { label: "See Request", url: `${origin}/pigeon/#requests` },
    }).catch(() => {});
}
export async function friendAccepted(env, by, toId) {
  const r = await userPrefs(env, toId); if (!r || !r.p.accepted || isQuiet(r.p)) return;
  await pushTo(env, toId, { title: r.p.names ? "New friend" : "InFlight", body: r.p.names ? `${firstName(by.name)} accepted your friend request. Send them a pigeon!` : "Someone accepted your friend request.", tag: "friend-" + by.id, url: `/pigeon/#open=${by.id}` });
}
// The person you sent a pigeon to moved, so it changed course.
export async function pigeonRerouted(env, senderId, to, deliverAt) {
  const r = await userPrefs(env, senderId); if (!r || !r.p.rerouted || isQuiet(r.p)) return;
  const ms = deliverAt - Date.now(), h = Math.floor(ms / HOUR), m = Math.max(1, Math.round((ms % HOUR) / MIN));
  const eta = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m} min`;
  await pushTo(env, senderId, { title: r.p.names ? `${firstName(to.name)} moved` : "InFlight",
    body: `Your pigeon changed course${r.p.names && to.place ? ` for ${to.place}` : ""}. It now lands in ${eta}.`, tag: "course-" + to.id, url: `/pigeon/#open=${to.id}` });
}
// A friend has just sent you a pigeon (off unless you turn it on).
export async function pigeonSent(env, from, toId, deliverAt, kind = "standard") {
  const r = await userPrefs(env, toId); if (!r || !r.p.takeoff || isQuiet(r.p)) return;
  const ms = deliverAt - Date.now(), h = Math.floor(ms / HOUR), m = Math.max(1, Math.round((ms % HOUR) / MIN));
  const eta = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m} min`;
  await pushTo(env, toId, { title: r.p.names ? firstName(from.name) : "InFlight", body: r.p.names ? `Sent you a ${kind === "standard" ? "" : kind + " "}pigeon. It lands in ${eta}.` : `A ${kind === "standard" ? "" : kind + " "}pigeon is on its way to you. It lands in ${eta}.`,
    tag: "from-" + from.id, url: `/pigeon/#open=${from.id}` });
}

/* ---------- groups: the same events, said with the group's name ---------- */
const etaText = (ms) => { const h = Math.floor(ms / HOUR), m = Math.max(1, Math.round((ms % HOUR) / MIN)); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m} min`; };
const isMuted = async (env, gid, uid) => !!(await (await db(env)).prepare("SELECT muted FROM pg_group_members WHERE group_id = ? AND user_id = ?").bind(gid, uid).first())?.muted;
export async function groupAdded(env, by, ids, g) {
  for (const id of ids) {
    const r = await userPrefs(env, id); if (!r || !r.p.requests || isQuiet(r.p)) continue;
    await pushTo(env, id, { title: r.p.names ? g.name : "InFlight", body: r.p.names ? `${firstName(by.name)} added you to the group.` : "You were added to a group.", tag: "group-" + g.id, url: `/pigeon/#open=${g.id}` });
  }
}
export async function groupSent(env, from, g, dels, kind = "standard") {
  for (const d of dels) {
    const r = await userPrefs(env, d.to); if (!r || !r.p.takeoff || isQuiet(r.p) || await isMuted(env, g.id, d.to)) continue;
    const what = kind === "standard" ? "pigeon" : `${kind} pigeon`, eta = etaText(d.at - Date.now());
    await pushTo(env, d.to, { title: r.p.names ? g.name : "InFlight", body: r.p.names ? `${firstName(from.name)} sent a ${what}. It lands in ${eta}.` : `A ${what} is on its way to you. It lands in ${eta}.`,
      tag: "group-" + g.id, url: `/pigeon/#open=${g.id}` });
  }
}
// Someone cheered on a pigeon you're in on: it lands a little sooner.
export async function cheeredNote(env, toId, by, x) {
  const r = await userPrefs(env, toId); if (!r || !r.p.moments || isQuiet(r.p)) return;
  if (x.group && (await isMuted(env, x.group, toId))) return;
  const who = r.p.names ? firstName(by.name) : "Someone";
  await pushTo(env, toId, { title: "A little tailwind",
    body: `${who} cheered on ${x.mine ? "their pigeon to you" : "your pigeon"}. It lands ${etaText(x.cut)} sooner.`, tag: x.tag, url: `/pigeon/#open=${x.chat}` });
}
// Someone waved at your pigeon as it flew over them.
export async function wavedNote(env, toId, by, x) {
  const r = await userPrefs(env, toId); if (!r || !r.p.moments || isQuiet(r.p)) return;
  const who = firstName(by.name);
  await pushTo(env, toId, { title: r.p.names ? `${who} waved` : "A wave",
    body: r.p.names ? `${who} waved at your pigeon as it flew over${x.place ? " " + x.place : " them"}.` : "A friend waved at your pigeon as it flew over them.", tag: "wave-" + x.id, url: `/pigeon/#open=${by.id}` });
}
export async function groupRerouted(env, senderId, to, gid, deliverAt) {
  const r = await userPrefs(env, senderId); if (!r || !r.p.rerouted || isQuiet(r.p) || await isMuted(env, gid, senderId)) return;
  await pushTo(env, senderId, { title: r.p.names ? `${firstName(to.name)} moved` : "InFlight",
    body: `Your pigeon changed course${r.p.names && to.place ? ` for ${to.place}` : ""}. It now lands in ${etaText(deliverAt - Date.now())}.`, tag: "course-" + to.id, url: `/pigeon/#open=${gid}` });
}
// Group pigeons that landed or were lost since the last tick.
async function groupTick(env, D, t, since) {
  let pushes = 0, landedN = 0, held = 0;
  const { results: due } = await D.prepare(`SELECT d.rowid AS rid, d.user_id, m.sender, m.group_id, g.name AS gname, u.notify_prefs, gm.muted, s.name AS sname
    FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = d.user_id JOIN pg_users s ON s.id = m.sender
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = d.user_id
    WHERE d.notified_at IS NULL AND d.lost_at IS NULL AND d.deliver_at <= ?1 AND d.deliver_at > ?2 LIMIT 500`).bind(t, since).all();
  const ready = due.filter((d) => !isQuiet(prefsOf(d), t));
  held = due.length - ready.length;
  if (ready.length) {
    for (let i = 0; i < ready.length; i += 90) {
      const part = ready.slice(i, i + 90);
      const { results } = await D.prepare(`UPDATE pg_gdeliv SET notified_at = ? WHERE notified_at IS NULL AND rowid IN (${part.map(() => "?").join(",")}) RETURNING rowid AS rid`).bind(t, ...part.map((d) => d.rid)).all();
      const claimed = new Set(results.map((r) => r.rid));
      // one notification per person per group: who sent it, or how many landed
      const by = new Map();
      for (const d of part) {
        if (!claimed.has(d.rid)) continue;
        landedN++;
        if (d.muted || !prefsOf(d).landed) continue;
        const k = d.user_id + "|" + d.group_id, x = by.get(k) || { d, n: 0, from: new Set() };
        x.n++; x.from.add(firstName(d.sname)); by.set(k, x);
      }
      for (const { d, n, from } of by.values()) {
        const names = prefsOf(d).names;
        pushes += await pushTo(env, d.user_id, { title: names ? d.gname : "InFlight",
          body: n > 1 ? `${n} pigeons have landed.` : names ? `${[...from][0]}’s pigeon has landed.` : "A pigeon has landed.", tag: "group-" + d.group_id, url: `/pigeon/#open=${d.group_id}` });
      }
    }
  }
  const { results: lost } = await D.prepare(`SELECT d.rowid AS rid, m.sender, m.group_id, g.name AS gname, u.notify_prefs, r.name, gm.muted
    FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = m.sender JOIN pg_users r ON r.id = d.user_id
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = m.sender
    WHERE d.notified_at IS NULL AND d.lost_at IS NOT NULL AND d.lost_at <= ?1 AND d.lost_at > ?2 LIMIT 200`).bind(t, since).all();
  for (const d of lost) {
    const p = prefsOf(d); if (isQuiet(p, t)) continue;
    const c = await D.prepare("UPDATE pg_gdeliv SET notified_at = ? WHERE rowid = ? AND notified_at IS NULL").bind(t, d.rid).run();
    if (!c.meta.changes || !p.lost || d.muted) continue;
    pushes += await pushTo(env, d.sender, { title: "Pigeon lost", body: p.names ? `Your pigeon to ${firstName(d.name)} in ${d.gname} didn’t make it.` : "One of your pigeons didn’t make it.",
      tag: "lost-" + d.group_id, url: `/pigeon/#open=${d.group_id}` });
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
  const { results: one } = await D.prepare(`SELECT m.id, m.sender, m.recipient, m.wx, m.wx_ms, m.deliver_at, s.name AS sname, r.name AS rname, s.notify_prefs AS sp, r.notify_prefs AS rp FROM pg_msgs m
    JOIN pg_users s ON s.id = m.sender JOIN pg_users r ON r.id = m.recipient
    WHERE m.wx_at IS NOT NULL AND m.wx_told IS NULL AND m.wx_at <= ?1 AND m.wx_at > ?2 AND m.deliver_at > ?1 AND m.sent_at <= ?1 AND m.wx_ms >= ?3
      AND (m.lost_at IS NULL OR m.lost_at > ?1) LIMIT 200`).bind(t, since, WX_MIN).all();
  for (const m of one) {
    const claimed = await D.prepare("UPDATE pg_msgs SET wx_told = ? WHERE id = ? AND wx_told IS NULL").bind(t, m.id).run();
    if (!claimed.meta.changes) continue;
    let k = "bad weather"; try { k = WX_WORDS[JSON.parse(m.wx).k] || k; } catch (_) {}
    const sp = prefsOf({ notify_prefs: m.sp }), rp = prefsOf({ notify_prefs: m.rp });
    if (sp.delays && !isQuiet(sp, t)) pushes += await pushTo(env, m.sender, { title: sp.names ? `To ${firstName(m.rname)}` : "InFlight",
      body: `Your pigeon flew into ${k}. It’ll land ${lateBy(m.wx_ms)} late, ${whenAt(m.deliver_at, sp.tz)}.`, tag: "wx-" + m.id, url: `/pigeon/#open=${m.recipient}` });
    if (rp.delays && !isQuiet(rp, t)) pushes += await pushTo(env, m.recipient, { title: rp.names ? firstName(m.sname) : "InFlight",
      body: `${rp.names ? "Their" : "A"} pigeon to you flew into ${k}. It’ll land ${lateBy(m.wx_ms)} late, ${whenAt(m.deliver_at, rp.tz)}.`, tag: "wx-" + m.id, url: `/pigeon/#open=${m.sender}` });
  }
  const { results: grp } = await D.prepare(`SELECT d.rowid AS rid, d.user_id, d.wx, d.wx_ms, d.deliver_at, g.name AS gname, m.group_id, u.notify_prefs, gm.muted FROM pg_gdeliv d
    JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = d.user_id
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = d.user_id
    WHERE d.wx_at IS NOT NULL AND d.wx_told IS NULL AND d.wx_at <= ?1 AND d.wx_at > ?2 AND d.deliver_at > ?1 AND d.wx_ms >= ?3
      AND (d.lost_at IS NULL OR d.lost_at > ?1) LIMIT 200`).bind(t, since, WX_MIN).all();
  for (const d of grp) {
    const claimed = await D.prepare("UPDATE pg_gdeliv SET wx_told = ? WHERE rowid = ? AND wx_told IS NULL").bind(t, d.rid).run();
    if (!claimed.meta.changes) continue;
    const p = prefsOf(d); if (!p.delays || isQuiet(p, t) || d.muted) continue;
    let k = "bad weather"; try { k = WX_WORDS[JSON.parse(d.wx).k] || k; } catch (_) {}
    pushes += await pushTo(env, d.user_id, { title: p.names ? d.gname : "InFlight",
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
      const g = await D.prepare(`SELECT g.name, u.notify_prefs, gm.muted FROM pg_groups g JOIN pg_users u ON u.id = ?2
        LEFT JOIN pg_group_members gm ON gm.group_id = g.id AND gm.user_id = ?2 WHERE g.id = ?1`).bind(x.r.group_id, x.r.user_id).first();
      const p = g && prefsOf(g); if (!p || !p.delays || isQuiet(p, t) || g.muted) continue;
      pushes += await pushTo(env, x.r.user_id, { title: p.names ? g.name : "InFlight", body: say(p, "A pigeon to you"),
        tag: "wxturn-" + x.r.msg_id, url: `/pigeon/#open=${x.r.group_id}` });
      continue;
    }
    const { results } = await D.prepare("SELECT id, name, notify_prefs FROM pg_users WHERE id IN (?1, ?2)").bind(x.r.sender, x.r.recipient).all();
    const s = results.find((u) => u.id === x.r.sender), r = results.find((u) => u.id === x.r.recipient); if (!s || !r) continue;
    const sp = prefsOf(s), rp = prefsOf(r);
    if (sp.delays && !isQuiet(sp, t)) pushes += await pushTo(env, s.id, { title: sp.names ? `To ${firstName(r.name)}` : "InFlight",
      body: say(sp, "Your pigeon"), tag: "wxturn-" + x.r.id, url: `/pigeon/#open=${r.id}` });
    if (rp.delays && !isQuiet(rp, t)) pushes += await pushTo(env, r.id, { title: rp.names ? firstName(s.name) : "InFlight",
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
async function shipTick(env, D, t, since) {
  let pushes = 0;
  const { results: one } = await D.prepare(`SELECT m.id, m.sender, m.recipient, m.legs, m.deliver_at, m.ship_told, s.name AS sname, r.name AS rname, s.notify_prefs AS sp, r.notify_prefs AS rp FROM pg_msgs m
    JOIN pg_users s ON s.id = m.sender JOIN pg_users r ON r.id = m.recipient
    WHERE m.notified_at IS NULL AND m.deliver_at > ?1 AND m.sent_at <= ?1 AND (m.lost_at IS NULL OR m.lost_at > ?1) AND COALESCE(m.ship_told, 0) < 2 AND m.legs LIKE '%"b"%' LIMIT 200`).bind(t).all();
  for (const m of one) {
    const v = voyageOf(m.legs), ev = v && shipEv(v, t, since, m.ship_told); if (!ev) continue;
    const claimed = await D.prepare("UPDATE pg_msgs SET ship_told = ?1 WHERE id = ?2 AND COALESCE(ship_told, 0) < ?1").bind(ev, m.id).run();
    if (!claimed.meta.changes) continue;
    const sp = prefsOf({ notify_prefs: m.sp }), rp = prefsOf({ notify_prefs: m.rp });
    if (sp.moments && !isQuiet(sp, t)) pushes += await pushTo(env, m.sender, { title: sp.names ? `To ${firstName(m.rname)}` : "InFlight",
      body: shipSay(sp, "Your pigeon", v, ev, m.deliver_at), tag: "ship-" + m.id, url: `/pigeon/#open=${m.recipient}` });
    if (rp.moments && !isQuiet(rp, t)) pushes += await pushTo(env, m.recipient, { title: rp.names ? firstName(m.sname) : "InFlight",
      body: shipSay(rp, `${rp.names ? "Their" : "A"} pigeon to you`, v, ev, m.deliver_at), tag: "ship-" + m.id, url: `/pigeon/#open=${m.sender}` });
  }
  const { results: grp } = await D.prepare(`SELECT d.rowid AS rid, d.user_id, d.legs, d.deliver_at, d.ship_told, g.name AS gname, m.group_id, u.notify_prefs, gm.muted FROM pg_gdeliv d
    JOIN pg_gmsgs m ON m.id = d.msg_id JOIN pg_groups g ON g.id = m.group_id JOIN pg_users u ON u.id = d.user_id
    LEFT JOIN pg_group_members gm ON gm.group_id = m.group_id AND gm.user_id = d.user_id
    WHERE d.notified_at IS NULL AND d.deliver_at > ?1 AND m.sent_at <= ?1 AND (d.lost_at IS NULL OR d.lost_at > ?1) AND COALESCE(d.ship_told, 0) < 2 AND d.legs LIKE '%"b"%' LIMIT 200`).bind(t).all();
  for (const d of grp) {
    const v = voyageOf(d.legs), ev = v && shipEv(v, t, since, d.ship_told); if (!ev) continue;
    const claimed = await D.prepare("UPDATE pg_gdeliv SET ship_told = ?1 WHERE rowid = ?2 AND COALESCE(ship_told, 0) < ?1").bind(ev, d.rid).run();
    if (!claimed.meta.changes) continue;
    const p = prefsOf(d); if (!p.moments || isQuiet(p, t) || d.muted) continue;
    pushes += await pushTo(env, d.user_id, { title: p.names ? d.gname : "InFlight", body: shipSay(p, "A pigeon to you", v, ev, d.deliver_at), tag: "ship-" + d.rid, url: `/pigeon/#open=${d.group_id}` });
  }
  return pushes;
}
async function reactTick(env, D, t, since) {
  let pushes = 0;
  const { results } = await D.prepare(`SELECT r.id, r.sender, r.recipient, r.group_id, u.notify_prefs, s.name AS sname, g.name AS gname, gm.muted
    FROM pg_reacts r JOIN pg_users u ON u.id = r.recipient JOIN pg_users s ON s.id = r.sender
    LEFT JOIN pg_groups g ON g.id = r.group_id LEFT JOIN pg_group_members gm ON gm.group_id = r.group_id AND gm.user_id = r.recipient
    WHERE r.recipient IS NOT NULL AND r.notified_at IS NULL AND r.deliver_at <= ?1 AND r.deliver_at > ?2 LIMIT 200`).bind(t, since).all();
  for (const r of results) {
    const p = prefsOf(r); if (isQuiet(p, t)) continue;                      // held until quiet hours end
    const c = await D.prepare("UPDATE pg_reacts SET notified_at = ? WHERE id = ? AND notified_at IS NULL").bind(t, r.id).run();
    if (!c.meta.changes || !p.reactions || r.muted) continue;
    const chat = r.group_id || r.sender;
    pushes += await pushTo(env, r.recipient, { title: p.names ? (r.gname || firstName(r.sname)) : "InFlight",
      body: p.names ? `${r.gname ? firstName(r.sname) + " r" : "R"}eacted to your message.` : "Someone reacted to your message.", tag: "react-" + chat, url: `/pigeon/#open=${chat}` });
  }
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
      const u = await D.prepare("SELECT id, notify_prefs FROM pg_users WHERE id = ?").bind(v).first(); if (!u) continue;
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
  const { results } = await D.prepare(`SELECT f.*, s.name AS sname, u.notify_prefs, u.lat AS ulat, u.lon AS ulon FROM pg_flyover f
    JOIN pg_users s ON s.id = f.sender JOIN pg_users u ON u.id = f.user_id
    WHERE f.told IS NULL AND f.at <= ?1 AND f.at > ?2 LIMIT 200`).bind(t, since).all();
  for (const r of results) {
    const friends = await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(r.sender, r.user_id).first();
    if (!friends || r.ulat == null || haversineKm(r.ulat, r.ulon, r.lat, r.lon) > 25) { await D.prepare("DELETE FROM pg_flyover WHERE msg_id = ? AND user_id = ? AND told IS NULL").bind(r.msg_id, r.user_id).run(); continue; }
    const claimed = await D.prepare("UPDATE pg_flyover SET told = ? WHERE msg_id = ? AND user_id = ? AND told IS NULL").bind(t, r.msg_id, r.user_id).run();
    if (!claimed.meta.changes) continue;
    const p = prefsOf(r); if (!p.moments || isQuiet(p, t)) continue;
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
async function blurOld(D, t) {
  const last = await D.prepare("SELECT v FROM pg_meta WHERE k = 'blur_at'").first();
  if (last && t - Number(last.v) < HOUR) return;
  await D.batch([
    D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('blur_at', ?)").bind(String(t)),
    D.prepare(`UPDATE pg_msgs SET ${["from_lat", "from_lon", "to_lat", "to_lon"].map(half).join(", ")}, legs = NULL, coarse = 1 WHERE coarse IS NULL AND deliver_at < ?`).bind(t - BLUR_AFTER),
    D.prepare(`UPDATE pg_gdeliv SET ${["to_lat", "to_lon"].map(half).join(", ")}, legs = NULL, coarse = 1 WHERE coarse IS NULL AND deliver_at < ?`).bind(t - BLUR_AFTER),
    D.prepare(`UPDATE pg_gmsgs SET ${["from_lat", "from_lon"].map(half).join(", ")}, coarse = 1 WHERE coarse IS NULL AND sent_at < ?`).bind(t - BLUR_AFTER - 8 * DAY),
    D.prepare(`UPDATE pg_near SET ${["lat", "lon"].map(half).join(", ")}, coarse = 1 WHERE coarse IS NULL AND at < ?`).bind(t - BLUR_AFTER),
    // and none outlives either of its pigeons
    D.prepare("DELETE FROM pg_near WHERE NOT EXISTS (SELECT 1 FROM pg_msgs WHERE id = pg_near.a) OR NOT EXISTS (SELECT 1 FROM pg_msgs WHERE id = pg_near.b)"),
    // a flyover (and where the friend it flew over was) goes after a month, or with its pigeon
    D.prepare(`DELETE FROM pg_flyover WHERE at < ? OR (NOT EXISTS (SELECT 1 FROM pg_msgs WHERE id = pg_flyover.msg_id) AND NOT EXISTS (SELECT 1 FROM pg_gmsgs WHERE id = pg_flyover.msg_id))`).bind(t - BLUR_AFTER),
  ]);
}
// Pigeons that have landed since the last tick: push now; email those who
// asked, once things have been waiting a little while unread. Quiet hours hold
// both until they end. Only landings after notifications went live count.
export async function tick(env, origin) {
  const D = await db(env), t = Date.now();
  await sweepPhotos(env).catch(() => {});     // photos go 24 h after landing, even if no one opens the app
  // old rate-limit windows and ended sessions
  await D.batch([D.prepare("DELETE FROM pg_limits WHERE reset_at < ?").bind(t - DAY),
    D.prepare("DELETE FROM pg_sessions WHERE seen_at < ?").bind(t - 181 * DAY),
    D.prepare("DELETE FROM pg_links WHERE status IN ('pending', 'declined') AND created_at < ?").bind(t - 30 * DAY),
    D.prepare("DELETE FROM pg_wxcache WHERE at < ?").bind(t - HOUR),
    D.prepare("DELETE FROM pg_handles_held WHERE until < ?").bind(t)]).catch(() => {});
  await blurOld(D, t).catch((e) => console.error("pigeon blur", e && e.message));
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('notify_since', ?)").bind(String(t)).run();
  const since = Math.max(Number((await D.prepare("SELECT v FROM pg_meta WHERE k = 'notify_since'").first()).v), t - LOOKBACK);
  const { results: due } = await D.prepare(`SELECT m.id, m.sender, m.recipient, u.notify_prefs FROM pg_msgs m JOIN pg_users u ON u.id = m.recipient
    WHERE m.notified_at IS NULL AND m.lost_at IS NULL AND m.deliver_at <= ?1 AND m.deliver_at > ?2 LIMIT 500`).bind(t, since).all();
  const prefs = new Map(due.map((m) => [m.recipient, prefsOf(m)]));
  const ready = due.filter((m) => !isQuiet(prefs.get(m.recipient), t));       // quiet ones wait
  let landed = [];
  if (ready.length) {
    // claim them first, so two ticks running at once can't both send
    for (const part of chunks(ready)) {
      const { results } = await D.prepare(`UPDATE pg_msgs SET notified_at = ? WHERE notified_at IS NULL AND id IN (${part.map(() => "?").join(",")}) RETURNING sender, recipient`)
        .bind(t, ...part.map((m) => m.id)).all();
      landed.push(...results.filter((m) => prefs.get(m.recipient).landed));
    }
  }
  let pushes = 0, emails = 0;
  // Pigeon Death: tell the sender when one of theirs is lost on the way
  const { results: lost } = await D.prepare(`SELECT m.id, m.sender, m.recipient, u.notify_prefs, r.name FROM pg_msgs m
    JOIN pg_users u ON u.id = m.sender JOIN pg_users r ON r.id = m.recipient
    WHERE m.notified_at IS NULL AND m.lost_at IS NOT NULL AND m.lost_at <= ?1 AND m.lost_at > ?2 LIMIT 200`).bind(t, since).all();
  for (const m of lost) {
    const p = prefsOf(m); if (isQuiet(p, t)) continue;
    const claimed = await D.prepare("UPDATE pg_msgs SET notified_at = ? WHERE id = ? AND notified_at IS NULL").bind(t, m.id).run();
    if (!claimed.meta.changes || !p.lost) continue;
    pushes += await pushTo(env, m.sender, { title: "Pigeon lost", body: p.names ? `Your pigeon to ${firstName(m.name)} didn’t make it. It’s your turn again.` : "One of your pigeons didn’t make it. It’s your turn again.",
      tag: "lost-" + m.recipient, url: `/pigeon/#open=${m.recipient}` });
  }
  if (landed.length) {
    const ids = [...new Set(landed.map((m) => m.sender))], name = new Map();
    for (const part of chunks(ids)) {
      const { results: senders } = await D.prepare(`SELECT id, name FROM pg_users WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all();
      for (const x of senders) name.set(x.id, x.name);
    }
    const pairs = new Map();
    for (const m of landed) { const k = m.recipient + "|" + m.sender; pairs.set(k, (pairs.get(k) || 0) + 1); }
    for (const [k, n] of pairs) {
      const [to, from] = k.split("|"), names = prefs.get(to).names;
      // blocked or unfriended since it took off: it still lands, but no one is told who sent it
      if (!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(to, from).first())) continue;
      pushes += await pushTo(env, to, { title: names ? firstName(name.get(from)) : "InFlight",
        body: n > 1 ? `${n} pigeons have landed.` : "A pigeon has landed.", tag: "from-" + from, url: `/pigeon/#open=${from}` });
    }
  }
  // scheduled pigeons that have just taken off: now their recipient can hear about them
  const { results: off } = await D.prepare(`SELECT m.id, m.sender, m.recipient, m.deliver_at, m.pigeon, u.name FROM pg_msgs m JOIN pg_users u ON u.id = m.sender
    WHERE m.sched = 1 AND m.sent_at <= ?1 LIMIT 200`).bind(t).all();
  for (const m of off) {
    const claimed = await D.prepare("UPDATE pg_msgs SET sched = 2 WHERE id = ? AND sched = 1").bind(m.id).run();
    if (claimed.meta.changes && m.deliver_at > t) { await pigeonSent(env, { id: m.sender, name: m.name }, m.recipient, m.deliver_at, m.pigeon).catch(() => {}); }
  }
  // stopovers: tell the friend it's resting with them, so they can add a line before it flies on
  const { results: rests } = await D.prepare(`SELECT m.id, m.sender, m.recipient, m.via, m.via_off, s.name AS sname, r.name AS rname, v.notify_prefs FROM pg_msgs m
    JOIN pg_users s ON s.id = m.sender JOIN pg_users r ON r.id = m.recipient JOIN pg_users v ON v.id = m.via
    WHERE m.via IS NOT NULL AND m.via_told IS NULL AND m.via_at <= ?1 AND m.via_at > ?2 AND (m.lost_at IS NULL OR m.lost_at > ?1) LIMIT 200`).bind(t, since).all();
  for (const m of rests) {
    const p = prefsOf(m); if (isQuiet(p, t)) continue;
    const claimed = await D.prepare("UPDATE pg_msgs SET via_told = ? WHERE id = ? AND via_told IS NULL").bind(t, m.id).run();
    if (!claimed.meta.changes || !p.landed || m.via_off <= t) continue;
    pushes += await pushTo(env, m.via, { title: p.names ? `${firstName(m.sname)}’s pigeon stopped by` : "A pigeon stopped by",
      body: p.names ? `It’s resting with you on its way to ${firstName(m.rname)}. Add a line before it flies on.` : "It’s resting with you for an hour. Add a line before it flies on.",
      tag: "via-" + m.id, url: `/pigeon/#open=${m.sender}` });
  }
  const live = await liveTick(env, D, t).catch((e) => { console.error("pigeon live", e && e.message); return { turns: [] }; });   // the weather ahead of pigeons in the air
  pushes += await turnNotes(env, D, t, live.turns).catch((e) => { console.error("pigeon live notes", e && e.message); return 0; });
  pushes += await wxTick(env, D, t, since);
  pushes += await nearTick(env, D, t, since);
  pushes += await flyTick(env, D, t, since);
  pushes += await shipTick(env, D, t, since).catch((e) => { console.error("pigeon ships", e && e.message); return 0; });
  pushes += await streakTick(env, D, t).catch((e) => { console.error("pigeon streaks", e && e.message); return 0; });
  await settleBirds(D, t).catch((e) => console.error("pigeon birds", e && e.message));      // named pigeons' careers, as their flights end
  await stampPassports(D, t).catch((e) => console.error("pigeon passport", e && e.message));  // the places flights that landed flew over
  const gt = await groupTick(env, D, t, since);
  pushes += gt.pushes;
  pushes += await reactTick(env, D, t, since);
  const wk = await weeklyTick(env, D, t, origin);
  pushes += wk.pushes;
  if (emailReady(env)) {
    // everything waiting unread: one-to-one pigeons, and group ones (unless that group is muted)
    const { results: waiting } = await D.prepare(`
      WITH inbox AS (
        SELECT recipient AS to_id, sender, sender AS chat, id, read_at, lost_at, deliver_at FROM pg_msgs
        UNION ALL
        SELECT d.user_id, g.sender, g.group_id, d.msg_id, d.read_at, d.lost_at, d.deliver_at FROM pg_gdeliv d JOIN pg_gmsgs g ON g.id = d.msg_id
          JOIN pg_group_members gm ON gm.group_id = g.group_id AND gm.user_id = d.user_id WHERE gm.muted = 0)
      SELECT u.id, u.email, u.notify_prefs, COUNT(m.id) AS n, GROUP_CONCAT(DISTINCT s.name) AS names, GROUP_CONCAT(DISTINCT m.chat) AS senders
      FROM pg_users u JOIN inbox m ON m.to_id = u.id JOIN pg_users s ON s.id = m.sender
      WHERE u.notify_email = 1 AND u.email_ok IS NOT NULL AND COALESCE(u.email_at, 0) < ?1
        AND m.read_at IS NULL AND m.lost_at IS NULL AND m.deliver_at <= ?2 AND m.deliver_at > MAX(COALESCE(u.email_at, 0), ?3)
      GROUP BY u.id LIMIT 50`).bind(t - EMAIL_EVERY, t - EMAIL_AFTER, Math.max(since, t - DAY)).all();
    for (const u of waiting) {
      const p = prefsOf(u); if (!p.landed || isQuiet(p, t)) continue;
      const who = String(u.names || "").split(",").map(firstName);
      const list = who.length > 2 ? `${who.slice(0, -1).join(", ")} and ${who.at(-1)}` : who.join(" and ");
      const subject = !p.names ? (u.n > 1 ? `${u.n} pigeons have landed` : "A pigeon has landed")
        : u.n > 1 ? `${u.n} pigeons have landed` : `A pigeon from ${who[0]} has landed`;
      try {
        await notifyEmail(env, origin, u, subject, {
          icon: "landed", title: u.n > 1 ? `${u.n} pigeons have landed` : p.names ? `A pigeon from ${who[0]} has landed` : "A pigeon has landed",
          preheader: p.names ? `From ${list}. Open InFlight to read ${u.n > 1 ? "them" : "it"}.` : `Open InFlight to read ${u.n > 1 ? "them" : "it"}.`,
          rows: [...(p.names ? [["From", list]] : []), ...(u.n > 1 ? [["Pigeons", String(u.n)]] : [])],
          // one sender: straight into their chat; several: the Messages list
          button: { label: u.n > 1 ? "Read Them" : "Read It", url: `${origin}/pigeon/${String(u.senders || "").includes(",") || !u.senders ? "" : `#open=${u.senders}`}` },
        });
        emails++;
      } catch (e) { console.error("pigeon notify email", e && e.message); }
    }
  }
  return { landed: landed.length + gt.landed, held: due.length - ready.length + gt.held, pushes, emails: emails + wk.emails, weekly: wk.sent };
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
  const { results } = await D.prepare(`SELECT id, name, email, notify_email, email_at, notify_prefs FROM pg_users
    WHERE COALESCE(weekly_at, 0) < ?1 AND (notify_email = 1 OR EXISTS (SELECT 1 FROM pg_push WHERE user_id = pg_users.id)) ORDER BY RANDOM() LIMIT 300`).bind(t - 6 * DAY).all();
  for (const u of results) {
    const p = prefsOf(u);
    if (!weeklyDue(env, p, t)) continue;
    const claimed = await D.prepare("UPDATE pg_users SET weekly_at = ?1 WHERE id = ?2 AND COALESCE(weekly_at, 0) < ?3").bind(t, u.id, t - 6 * DAY).run();
    if (!claimed.meta.changes || !p.weekly) continue;
    const w = await weekOf(D, u.id, t); if (!w) continue;
    out.sent++;
    out.pushes += await pushTo(env, u.id, { title: "Your week in flight", body: w.line, tag: "weekly", url: "/pigeon/#flightlog" });
    if (u.notify_email && emailReady(env)) {
      try {
        if (await notifyEmail(env, origin, u, "Your week in flight", { icon: "bird", title: "Your week in flight", preheader: w.line,
          rows: [...(w.mi ? [["Miles flown", `${w.mi.toLocaleString("en-GB")} mi`]] : []), ["Pigeons sent", String(w.sent)], ["Pigeons received", String(w.got)],
            ...(w.fresh.length ? [["New badges", w.fresh.join(", ")]] : w.next && w.next.progress > 0 ? [["Next badge", `${w.next.name}, ${Math.round(w.next.progress * 100)}% there`]] : [])],
          button: { label: "Open Your Flight Log", url: `${origin}/pigeon/#flightlog` } })) out.emails++;
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
  if (r.meta.changes) await tick(env, origin);
}

export function tickAuthOk(request, env) {
  const m = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (!env.PIGEON_TICK_SECRET) throw new HttpError(404, "Not found.");
  const a = enc.encode(m ? m[1] : ""), b = enc.encode(env.PIGEON_TICK_SECRET);
  let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a[i] ^ b[i];
  if (d) throw new HttpError(401, "Not allowed.");
}
