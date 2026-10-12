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

import { MIN, HOUR, DAY, HttpError, b64url, fromB64url, randomToken, db, sendEmail, emailReady, emailBody } from "./_pigeon.js";

const enc = new TextEncoder();
const EMAIL_EVERY = 30 * MIN;     // at most one email per person per half hour
const EMAIL_AFTER = 10 * MIN;     // give push and the app a head start before emailing
const LOOKBACK = 3 * DAY;         // a pigeon held by quiet hours is still announced, but not forever

/* ---------------- preferences ----------------
   Account-wide (every phone follows them); whether push is on is per phone. */
export const NOTIFY_DEFAULTS = { landed: true, takeoff: false, requests: true, accepted: true, names: true, quiet: false, quietFrom: 22, quietTo: 7, tz: "UTC" };
export function prefsOf(u) {
  let p = {}; try { p = JSON.parse(u.notify_prefs || "{}") || {}; } catch (_) { /* defaults */ }
  return { ...NOTIFY_DEFAULTS, ...p };
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (_) { return false; } };
// Merge a partial update from the app, keeping only known keys and sane values.
export function cleanPrefs(cur, b) {
  const out = { ...cur };
  for (const k of ["landed", "takeoff", "requests", "accepted", "names", "quiet"]) if (b[k] !== undefined) out[k] = !!b[k];
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
          TTL: String(note.ttl || DAY / 1000), Urgency: "normal", ...(note.tag ? { Topic: note.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
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
async function notifyEmail(env, origin, u, subject, lines, button) {
  if (!emailReady(env)) return false;
  const unsub = `${origin}/api/pigeon/unsubscribe?u=${encodeURIComponent(u.id)}&t=${await unsubToken(env, u.id)}`;
  const { text, html } = emailBody([...lines], button, { footer: "You get these because you turned on email notifications in InFlight.", unsub });
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
  await pushTo(env, toId, { title: r.p.names ? "Friend request" : "InFlight", body: r.p.names ? `${from.name} (@${from.handle}) wants to be friends on InFlight.` : "You have a new friend request.", tag: "requests", url: "/pigeon/#requests" });
  if (r.u.notify_email && Date.now() - (r.u.email_at || 0) > EMAIL_EVERY)
    await notifyEmail(env, origin, r.u, r.p.names ? `${from.name} wants to be friends on InFlight` : "You have a new friend request on InFlight",
      [r.p.names ? `${from.name} (@${from.handle}) sent you a friend request on InFlight.` : "Someone sent you a friend request on InFlight."], { label: "Open InFlight", url: `${origin}/pigeon/#requests` }).catch(() => {});
}
export async function friendAccepted(env, by, toId) {
  const r = await userPrefs(env, toId); if (!r || !r.p.accepted || isQuiet(r.p)) return;
  await pushTo(env, toId, { title: r.p.names ? "New friend" : "InFlight", body: r.p.names ? `${by.name} accepted your friend request. Send them a pigeon!` : "Someone accepted your friend request.", tag: "friend-" + by.id, url: `/pigeon/#open=${by.id}` });
}
// A friend has just sent you a pigeon (off unless you turn it on).
export async function pigeonSent(env, from, toId, deliverAt) {
  const r = await userPrefs(env, toId); if (!r || !r.p.takeoff || isQuiet(r.p)) return;
  const ms = deliverAt - Date.now(), h = Math.floor(ms / HOUR), m = Math.max(1, Math.round((ms % HOUR) / MIN));
  const eta = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m} min`;
  await pushTo(env, toId, { title: r.p.names ? firstName(from.name) : "InFlight", body: r.p.names ? `Sent you a pigeon. It lands in ${eta}.` : `A pigeon is on its way to you. It lands in ${eta}.`,
    tag: "from-" + from.id, url: `/pigeon/#open=${from.id}` });
}

// Pigeons that have landed since the last tick: push now; email those who
// asked, once things have been waiting a little while unread. Quiet hours hold
// both until they end. Only landings after notifications went live count.
export async function tick(env, origin) {
  const D = await db(env), t = Date.now();
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('notify_since', ?)").bind(String(t)).run();
  const since = Math.max(Number((await D.prepare("SELECT v FROM pg_meta WHERE k = 'notify_since'").first()).v), t - LOOKBACK);
  const { results: due } = await D.prepare(`SELECT m.id, m.sender, m.recipient, u.notify_prefs FROM pg_msgs m JOIN pg_users u ON u.id = m.recipient
    WHERE m.notified_at IS NULL AND m.deliver_at <= ?1 AND m.deliver_at > ?2 LIMIT 500`).bind(t, since).all();
  const prefs = new Map(due.map((m) => [m.recipient, prefsOf(m)]));
  const ready = due.filter((m) => !isQuiet(prefs.get(m.recipient), t));       // quiet ones wait
  let landed = [];
  if (ready.length) {
    // claim them first, so two ticks running at once can't both send
    const { results } = await D.prepare(`UPDATE pg_msgs SET notified_at = ? WHERE notified_at IS NULL AND id IN (${ready.map(() => "?").join(",")}) RETURNING sender, recipient`)
      .bind(t, ...ready.map((m) => m.id)).all();
    landed = results.filter((m) => prefs.get(m.recipient).landed);
  }
  let pushes = 0, emails = 0;
  if (landed.length) {
    const ids = [...new Set(landed.map((m) => m.sender))];
    const { results: senders } = await D.prepare(`SELECT id, name FROM pg_users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    const name = new Map(senders.map((x) => [x.id, x.name]));
    const pairs = new Map();
    for (const m of landed) { const k = m.recipient + "|" + m.sender; pairs.set(k, (pairs.get(k) || 0) + 1); }
    for (const [k, n] of pairs) {
      const [to, from] = k.split("|"), names = prefs.get(to).names;
      pushes += await pushTo(env, to, { title: names ? firstName(name.get(from)) : "InFlight",
        body: n > 1 ? `${n} pigeons have landed.` : "A pigeon has landed.", tag: "from-" + from, url: `/pigeon/#open=${from}` });
    }
  }
  if (emailReady(env)) {
    const { results: waiting } = await D.prepare(`
      SELECT u.id, u.email, u.notify_prefs, COUNT(m.id) AS n, GROUP_CONCAT(DISTINCT s.name) AS names
      FROM pg_users u JOIN pg_msgs m ON m.recipient = u.id JOIN pg_users s ON s.id = m.sender
      WHERE u.notify_email = 1 AND COALESCE(u.email_at, 0) < ?1
        AND m.read_at IS NULL AND m.deliver_at <= ?2 AND m.deliver_at > MAX(COALESCE(u.email_at, 0), ?3)
      GROUP BY u.id LIMIT 50`).bind(t - EMAIL_EVERY, t - EMAIL_AFTER, Math.max(since, t - DAY)).all();
    for (const u of waiting) {
      const p = prefsOf(u); if (!p.landed || isQuiet(p, t)) continue;
      const who = String(u.names || "").split(",").map(firstName);
      const list = who.length > 2 ? `${who.slice(0, -1).join(", ")} and ${who.at(-1)}` : who.join(" and ");
      const subject = !p.names ? (u.n > 1 ? `${u.n} pigeons have landed` : "A pigeon has landed")
        : u.n > 1 ? `${u.n} pigeons have landed` : `A pigeon from ${who[0]} has landed`;
      try {
        await notifyEmail(env, origin, u, subject,
          [`${u.n > 1 ? `${u.n} pigeons have` : "A pigeon has"} landed for you on InFlight${p.names ? `, from ${list}` : ""}.`,
            "Messages are end-to-end encrypted, so open InFlight to read them."], { label: "Open InFlight", url: `${origin}/pigeon/` });
        emails++;
      } catch (e) { console.error("pigeon notify email", e && e.message); }
    }
  }
  return { landed: landed.length, held: due.length - ready.length, pushes, emails };
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
