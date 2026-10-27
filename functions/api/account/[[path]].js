// The account's own API, for its page at account.georgefarrowgreen.com (functions/_acctapp.js), and only there:
//   GET  /api/account/me              who's signed in: the profile, email, passkeys, signed-in devices, preferences, the apps
//   (signing in and out, and the profile: functions/_accountapi.js)
//   POST /api/account/reauth          showing it's you again (password or passkey), for the few things that need it
//   POST /api/account/password/vault  the password-locked key, for the password's proof (to lock it anew with a new one)
//   POST /api/account/password        a new password: its proof, and the key locked with it
//   POST /api/account/password/checked  the password's been checked against data breaches (with its proof), and how it went
//   GET  /api/account/pwned           Pwned Passwords, by the first 5 characters of a hash (as InFlight asks)
//   POST /api/account/passkeys/options, passkeys, passkeys/vault, passkeys/remove, passkeys/rename
//   POST /api/account/devices/end     signing out a device, all the others, or those unused for 90 days
//   GET  /api/account/activity        what's happened to the account in the last 30 days (functions/_activity.js)
//   POST /api/account/email/confirm-send, email/confirm      confirming the email (a link to it)
//   POST /api/account/email/change, email/change-confirm, email/cancel   a new email (a link to it, a word to the old)
//   PUT  /api/account/prefs           appearance and units, for every app on the site that has them; and InFlight's and
//                                     Weather's emails
//   POST /api/account/export          everything kept with the account that can be read, as a file
//   POST /api/account/delete          the account deleted, everywhere, in 7 days unless it's kept
//   POST /api/account/delete/cancel, delete/keep              keeping it (signed in here, or the email's link)
//   POST /api/account/handoff         signed in by a code from InFlight (good once, for a minute): to edit your profile
//   POST /api/account/handback        a sign-in made here for an app that sent you here, handed back to it: a code (good
//                                     once, for two minutes, and only in the tab that asked: functions/_handback.js)
//   POST /api/account/password/upgrade  an account from before Argon2id, signed in to with its password: stretched anew
//   POST /api/account/join            can an account be made (with this invite, or by anyone on a test server)
//   GET  /api/account/handle?h=       is a handle free (and what's near it that is)
//   POST /api/account/signup          a new account: its key pair made, and locked with the password, in the browser
//   POST /api/account/reset/request, reset/check, reset/complete   a forgotten password (a link to the email)
// Accounts are made, signed in to, and forgotten passwords reset, here and only here (functions/_join.js,
// functions/_handback.js): no app does any of them itself.
// It acts only with the site's cookie (functions/_account.js), and only from the page's own address. What could hurt if
// someone had only your sign-in (a passkey added, a device signed out, a new email, your data, the account deleted)
// needs you to have shown it's you in the last 10 minutes, as in InFlight; a new password needs the old one.
import { HttpError, logError, db, limit, clientIp, requireFresh, FRESH, newChallenge, rpIdFor, checkClientData, checkRegistration, verifyAssertion, b64url, fromB64url, deviceOf, EMAIL_RE, randomToken, hex, sha256, DAY, issueSession, OTHERS, othersOf } from "../../_pigeon.js";
import { linkOrigin, emailReady, SITE, ACCOUNT_APP } from "../../_email.js";
import { cookieUser, withCookie, withoutSession, sameOrigin, withSession, withKnown, accountMail } from "../../_account.js";
import { accountRoutes, json, body, signedIn } from "../../_accountapi.js";
import { proofHash, proofOk, lockVault, openVault } from "../../_atrest.js";
import { isAccount } from "../../_acctapp.js";
import { wxdb, devicesOf, unitsForAccount } from "../../_wxpush.js";
import { setMail } from "../../_wxacct.js";
import { logEvent, activityOf, providerOf } from "../../_activity.js";
import { prefsOf, savePrefs } from "../../_notify.js";
import { inviteState, handleFree, makeAccount, requestReset, checkReset, completeReset, checkNewSecret } from "../../_join.js";
import { makeHandback } from "../../_handback.js";
import { avatarKey } from "../../_profile.js";
import { fitnessOf, kept as fitnessKept, activities as fitnessActs, nightsKept as fitnessNights, olderActs as fitnessOlder, saveState as fitnessSave, activityFile as fitnessFile, dropFrom as fitnessDrop, fitdb } from "../../_fitness.js";
import { connect as garminConnect, disconnect as garminOff, garminOf, allHistory as garminAll } from "../../_garmin.js";
import { connectUrl as stravaUrl, disconnectStrava, stravaOf, stravaAll } from "../../_strava.js";
import { newKey as healthKey, forget as healthOff, healthOf } from "../../_health.js";
import { ADMIN_ROUTES, adminOf, setPrivacy } from "../pigeon/[[path]].js";

const STALE = 90 * DAY, GRACE = 7 * DAY, CONFIRM_TTL = 7 * DAY, CHANGE_TTL = 2 * DAY;
const UNITS = { temp: ["c", "f"], wind: ["mph", "kmh", "ms", "kn"], precip: ["mm", "in"], pressure: ["hpa", "inhg", "mmhg"], clock: ["12", "24"] };

// Weather's record for the account: { ver, data } (nothing yet: version 0)
async function weatherOf(env, userId) {
  const r = await (await wxdb(env)).prepare("SELECT data, ver FROM wx_accts WHERE user_id = ?").bind(userId).first().catch(() => null);
  let data = null; try { data = r ? JSON.parse(r.data) : null; } catch (_) {}
  return { ver: r?.ver || 0, data };
}
// Weather's emails: { warn, brief (each on or off), warnFor (the places with warnings on), briefFor (the briefing's place),
// briefAt }
function weatherMail(n) {
  const e = n?.email || {};
  return { warn: !!e.warn, brief: !!e.brief, warnFor: (n?.places || []).filter((p) => p.warn).map((p) => String(p.name || "")).slice(0, 12),
    briefFor: n?.brief ? String(n.brief.name || "") : null, briefAt: n?.briefAt || "07:00" };
}
// What InFlight keeps of yours, as how many (its letters can't be read here, nor anywhere but your own phones): friends,
// groups, pigeons sent (as its log counts them: one to one, each of a group pigeon's, and those whose messages have gone
// after a month), and places in your passport
const SENT = `(SELECT COUNT(*) FROM pg_msgs WHERE sender = ?1) + (SELECT COUNT(*) FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE m.sender = ?1)
  + (SELECT COUNT(*) FROM pg_flights WHERE sender = ?1)`;
// (and had: those that have landed, as its log counts them; ?2 is now)
const HAD = `(SELECT COUNT(*) FROM pg_msgs WHERE recipient = ?1 AND deliver_at <= ?2 AND lost_at IS NULL)
  + (SELECT COUNT(*) FROM pg_gdeliv WHERE user_id = ?1 AND deliver_at <= ?2 AND lost_at IS NULL)
  + (SELECT COUNT(*) FROM pg_flights WHERE recipient = ?1 AND deliver_at <= ?2 AND lost_at IS NULL)`;
async function inflightOf(D, id) {
  const r = await D.prepare(`SELECT
      (SELECT COUNT(*) FROM pg_links WHERE (a = ?1 OR b = ?1) AND status = 'ok') AS friends,
      (SELECT COUNT(*) FROM pg_group_members WHERE user_id = ?1) AS groups,
      ${SENT} AS sent,
      (SELECT COUNT(*) FROM pg_passport WHERE user_id = ?1) AS places`).bind(id).first().catch(() => null);
  return { friends: r?.friends || 0, groups: r?.groups || 0, sent: r?.sent || 0, places: r?.places || 0 };
}
// What each app keeps of yours, in a line, for the site's home page (functions/api/me): InFlight's friends and pigeons
// sent, Weather's places and whether it sends you anything, Fitness's activities and whether you're on a plan (null for
// an app the account hasn't used)
export async function appFigures(env, id) {
  const [inflight, wx, fx] = await Promise.all([inflightOf(await db(env), id), weatherOf(env, id), fitnessOf(env, id)]);
  const places = Array.isArray(wx.data?.places) ? wx.data.places.length : 0, n = wx.data?.notify;
  return {
    inflight: inflight.friends || inflight.sent ? { friends: inflight.friends, sent: inflight.sent } : null,
    weather: places ? { places, alerts: !!((n?.places || []).length || n?.brief) } : null,
    fitness: fx.activities || fx.plan ? { activities: fx.activities, plan: !!fx.plan } : null,
  };
}
// The account as its page shows it (one being deleted: only that, and who)
async function view(env, u) {
  if (u.delete_at) return { signedIn: true, deleting: true, deleteAt: u.delete_at, id: u.id, name: u.name, handle: u.handle, photoAt: u.avatar_at || null };
  const D = await db(env), t = Date.now();
  const [{ results: pks }, { results: ss }, wx, inflight, last, admin, fitness] = await Promise.all([
    D.prepare("SELECT id, label, provider, created_at, used_at, vault IS NOT NULL AS messages FROM pg_passkeys WHERE user_id = ? ORDER BY created_at").bind(u.id).all(),
    D.prepare(`SELECT hash, label, place, apps, home, created_at, MAX(seen_at, COALESCE((SELECT MAX(c.seen_at) FROM pg_sessions c WHERE c.parent = s.hash), 0)) AS seen_at
      FROM pg_sessions s WHERE user_id = ? AND parent IS NULL ORDER BY hash = ? DESC, seen_at DESC`).bind(u.id, u.parent || u.sessionHash).all(),
    weatherOf(env, u.id),
    inflightOf(D, u.id),
    D.prepare("SELECT MAX(at) AS at FROM pg_events WHERE user_id = ?").bind(u.id).first().catch(() => null),
    adminOf(env).catch(() => null),
    fitnessOf(env, u.id),
  ]);
  const s = wx.data?.settings || {}, units = Object.fromEntries(Object.entries(UNITS).filter(([k, ok]) => ok.includes(s[k])).map(([k]) => [k, s[k]]));
  return {
    signedIn: true, id: u.id, name: u.name, handle: u.handle, email: u.email, emailOk: !!u.email_ok, photoAt: u.avatar_at || null, since: u.created_at,
    // (the card's poster: its own larger copy, if one's been sent, and the point of it that stays in view)
    poster: u.avatar_at ? { at: u.poster_at || null, focus: u.poster_focus || "50 50" } : null,
    emailNew: u.email_new && t - (u.email_new_at || 0) < CHANGE_TTL ? u.email_new : null,
    // (when the last confirm link went, so the page says one's on its way rather than offering one: a new one stops it working)
    emailSentAt: u.email_ok ? null : u.email_sent || null,
    fresh: t - (u.authAt || 0) < FRESH, salt: u.salt,
    // (a sign-in an app handed over to this browser, signed in to nothing: this page's alone until it's shown it's you)
    handed: !!u.handed,
    // (setAt: when it was last made, changed or reset; null for one set before that was kept, and not since)
    password: { checkedAt: u.pw_checked_at || null, leaked: u.pw_checked_at ? !!u.pw_leaked : null, setAt: u.pw_at || null },
    // (messages: it has its own locked copy of the key to InFlight's messages, so it opens them on a new phone by itself)
    passkeys: pks.map((p) => ({ id: p.id, label: p.label || "Passkey", provider: p.provider || null, createdAt: p.created_at, usedAt: p.used_at || null, messages: !!p.messages })),
    // (each named by the one app it's used in, where that's so: a Home Screen app on an iPhone is a sign-in of its own;
    // otherwise by its browser (the account's page too, unless it's on the Home Screen); this one being the app's
    // sign-in an account page opened from an app came from)
    devices: ss.map((x) => {
      const here = x.hash === (u.parent || u.sessionHash), [kind, browser] = String(x.label || "").split(" · ");
      const apps = String(x.apps || "").split(",").filter(Boolean), app = apps.length === 1 && (["weather", "inflight", "fitness"].includes(apps[0]) || x.home === apps[0]) ? apps[0] : null;
      return { id: x.hash.slice(0, 16), label: x.label || "A phone or browser", kind: kind || null, browser: browser || null, app, place: x.place || null,
        since: x.created_at, seenAt: x.seen_at, current: here, stale: !here && t - x.seen_at > STALE };
    }),
    prefs: { appearance: ["light", "dark"].includes(u.appearance) ? u.appearance : "auto", units: Object.keys(units).length ? units : null },
    // (the emails each app sends: the account's, about signing in and its security, always; InFlight's, as it has them;
    // Weather's warnings and briefing, each on or off, and for which places and when, as its Notifications have them)
    emails: { inflight: !!u.notify_email, weather: weatherMail(wx.data?.notify) },
    lastActivity: last?.at || null,
    // (the site's admin, on this page: only the linked account, and only with a passkey on it: functions/api/pigeon)
    admin: admin?.id === u.id ? { ready: pks.length > 0 } : null,
    // (what each app keeps of yours, for its sheet: Weather's places (the first few by name) and notifications; InFlight's counts)
    apps: {
      weather: { places: Array.isArray(wx.data?.places) ? wx.data.places.length : 0, placeNames: (wx.data?.places || []).slice(0, 8).map((p) => String(p.name || "")),
        notify: { places: (wx.data?.notify?.places || []).length, brief: !!wx.data?.notify?.brief } },
      inflight,
      fitness,
    },
  };
}
// InFlight's settings that are the account's rather than a phone's, for its page here: which notifications, how they
// read on the lock screen, quiet hours and email; who sees what; and who's blocked (pushes on or off, its lock and the
// like are each phone's, in the app)
async function inflightSettings(env, u) {
  const { results } = await (await db(env)).prepare(`SELECT p.id, p.handle, p.name FROM pg_links l JOIN pg_users p ON p.id = l.b
    WHERE l.a = ? AND l.status = 'blocked' ORDER BY p.name COLLATE NOCASE`).bind(u.id).all();
  return { notify: prefsOf(u), email: !!u.notify_email, emailOk: !!u.email_ok,
    privacy: { showOnline: !u.hide_online, receipts: !u.no_receipts, shareNews: !u.hide_news, approxLocation: !!u.loc_approx, shareTracker: !u.hide_tracker },
    blocked: results.map((p) => ({ id: p.id, handle: p.handle, name: p.name })) };
}
const PRIVACY = ["showOnline", "receipts", "shareNews", "approxLocation", "shareTracker"];
// Fitness's settings that are the account's (as its record has them, functions/_fitness.js): kilometres or miles (none
// chosen: the phone's region's, in the app), and whether it asks how you are each morning
// and where its rides and nights come from (Garmin Connect, Strava, Apple Health), the devices they were recorded on,
// and whether maps show by themselves; each said as the app says it (not its keys, nor its files waiting)
async function fitnessSettings(env, u) {
  const p = (await fitnessKept(env, u.id)).data?.prefs || {}, quiet = (x) => x.catch(() => ({ on: false }));
  const [g, s, hl, dv] = await Promise.all([quiet(garminOf(env, u.id)), quiet(stravaOf(env, u.id)), quiet(healthOf(env, u.id)),
    fitdb(env).then((D) => D.prepare("SELECT device, COUNT(*) AS n FROM fx_acts WHERE user_id = ? AND device IS NOT NULL AND device != '' GROUP BY device ORDER BY n DESC LIMIT 60").bind(u.id).all()).then((r) => r.results, () => [])]);
  const n = (pre) => fitdb(env).then((D) => D.prepare("SELECT COUNT(*) AS n FROM fx_acts WHERE user_id = ? AND id GLOB ?").bind(u.id, `${pre}[0-9]*`).first()).then((r) => r?.n || 0, () => 0);
  const [gn, sn] = await Promise.all([n("g"), n("s")]);
  return { units: p.units === "metric" || p.units === "imperial" ? p.units : null, ask: p.ask !== false, maps: p.maps === "always" ? "always" : "tap",
    garmin: g.on ? { on: true, ok: g.ok, said: g.said, last: g.last, since: g.since, back: !!g.back, n: gn } : { on: false, n: gn },
    strava: s.ready === false ? { ready: false } : s.on ? { on: true, ok: s.ok, said: s.said, last: s.last, since: s.since, name: s.name, back: !!s.back, n: sn } : { on: false, n: sn },
    health: hl.on ? { on: true, last: hl.last, said: hl.said, nights: hl.well?.length || 0 } : { on: false },
    devices: dv.map((d) => [d.device, d.n]) };
}
// (Fitness's own address, beside this page's: where Strava sends you back to, and where the Shortcut sends your nights)
const fitnessOrigin = (request) => { const u = new URL(request.url); u.hostname = u.hostname.replace(/^account\./, "fitness."); return u.origin; };
// (every one of your activities, as the app has them, newest first: a page at a time)
async function allActs(env, id) {
  let { acts, more } = await fitnessActs(env, id);
  while (more && acts.length < 5000) { const last = acts.at(-1), r = await fitnessOlder(env, id, last.start, last.id); acts = acts.concat(r.acts); more = r.more; }
  return acts;
}
// a word to the account's email (from "Account", the same whichever app: functions/_account.js), or to another address (to)
const tell = (env, u, mail, origin) => accountMail(env, u, mail, origin).catch(() => {});
// where the page is, for links in emails (this site's, or a test server's: one standing in a site of its own, or local)
const pageOf = (request, env) => (env.ACCOUNT_SITE || linkOrigin(request) !== SITE ? new URL(request.url).origin : ACCOUNT_APP);
const saltOk = (s) => { const m = /^(a2:)?([A-Za-z0-9_-]{22})$/.exec(String(s || "")); return !!m && fromB64url(m[2]).length === 16; };
const tokenOk = (s) => /^[A-Za-z0-9_-]{40,50}$/.test(String(s || ""));
const hide = (email) => String(email).replace(/^(.)([^@]*)(@.*)$/, (_, a, b, c) => a + "•".repeat(Math.min(6, b.length)) + c);
const cleanLabel = (v) => String(v || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ").slice(0, 40);
const onDay = (t) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }).format(t);

// A confirm link to the account's email (the same one InFlight sends, said as the account's): when it went. One that
// couldn't be sent is said, so the page doesn't say it's on its way, and the link before it (if any) is still the one
// that works.
async function sendConfirm(env, u, request) {
  const token = randomToken(32), code = hex(await sha256(token)), D = await db(env), at = Date.now();
  await D.prepare("UPDATE pg_users SET email_code = ?, email_sent = ? WHERE id = ?").bind(code, at, u.id).run();
  await accountMail(env, u, { icon: "mail", title: "Confirm your email", subject: "Confirm your email for your account", line: "tap the button to confirm this is your email address for your account.",
    after: "It’s where password resets and security notes go. If you didn’t ask for this, ignore it: nothing more will be sent.",
    to: u.email, pill: ["mail", u.email], rows: [["Link works", "For 7 days"]], when: false, button: { label: "Confirm email", url: `${pageOf(request, env)}/#confirm=${token}` } }, linkOrigin(request))
    .catch(async (e) => {
      await D.prepare("UPDATE pg_users SET email_code = ?, email_sent = ? WHERE id = ? AND email_code = ?").bind(u.email_code ?? null, u.email_sent ?? null, u.id, code).run().catch(() => {});
      throw e;
    });
  return at;
}

const ROUTES = {
  // a sign-in handed over from InFlight: the code used up (good once, for a minute, and only while the sign-in it came from
  // lasts), and this browser signed in as that account, as a sign-in of its own (seen in Signed-in devices). It doesn't
  // count as showing it's you: what needs that asks here, as ever. (Already signed in as the same account: just that.)
  // (a code a page elsewhere sent this browser here with can't sign it in unasked: who it's for is shown first, and it's
  // used only once that's said yes to; nor does it ever take the place of a different account's sign-in here. And one
  // that signs in a browser signed in to nothing is this page's alone (handed): the rest of the site, and every app,
  // treat the browser as signed out until it's shown it's you here, as the name said yes to is whatever its owner chose)
  "POST handoff/who": async ({ request, env }) => {
    sameOrigin(request);
    await limit(env, "handoff-ip:" + clientIp(request), 30, 15 * 60e3);
    const D = await db(env), code = String((await body(request)).code || "");
    const h = /^[A-Za-z0-9_-]{20,64}$/.test(code) ? hex(await sha256(code)) : "";
    const row = h && await D.prepare("SELECT user_id, expires FROM pg_handoff WHERE hash = ?").bind(h).first();
    const u = row && row.expires >= Date.now() && await D.prepare("SELECT id, name, handle FROM pg_users WHERE id = ?").bind(row.user_id).first();
    if (!u) throw new HttpError(400, "That link has run out. Sign in here instead.", "handoff");
    return json({ id: u.id, name: u.name, handle: u.handle });
  },
  "POST handoff": async ({ request, env }) => {
    sameOrigin(request);
    await limit(env, "handoff-ip:" + clientIp(request), 30, 15 * 60e3);
    const D = await db(env), t = Date.now(), code = String((await body(request)).code || "");
    const h = /^[A-Za-z0-9_-]{20,64}$/.test(code) ? hex(await sha256(code)) : "";
    const now = await cookieUser(request, env), peek = h && await D.prepare("SELECT user_id FROM pg_handoff WHERE hash = ?").bind(h).first();
    if (now && peek && now.id !== peek.user_id) throw new HttpError(409, `You’re signed in here as @${now.handle}. Sign out first to use another account.`, "handoff");
    const row = h && await D.prepare("DELETE FROM pg_handoff WHERE hash = ? RETURNING user_id, session, expires").bind(h).first();
    const from = row && row.expires >= t && await D.prepare("SELECT 1 FROM pg_sessions WHERE hash = ? AND user_id = ?").bind(row.session, row.user_id).first();
    if (!from) throw new HttpError(400, "That link has run out. Sign in here instead.", "handoff");
    if (now?.id === row.user_id) {
      // (a sign-in here only ever used on this page, as an app's account page from before this was kept is: part of that
      // app's from now on, the last one it opened replaced)
      if (!now.parent && now.sessionHash !== row.session && now.sessionApps.join() === "account" && !now.sessionHome) {
        await D.batch([D.prepare("UPDATE pg_sessions SET parent = ? WHERE hash = ?").bind(row.session, now.sessionHash),
          D.prepare("DELETE FROM pg_sessions WHERE parent = ? AND hash != ?").bind(row.session, now.sessionHash)]);
        now.parent = row.session;
      }
      return withCookie(json(await view(env, now)), request, env, now.token);
    }
    // (part of the app's sign-in it came from: listed with it and ending with it, and the last one it opened replaced)
    const token = await issueSession(env, row.user_id, request), hash = hex(await sha256(token));
    await D.batch([D.prepare("UPDATE pg_sessions SET auth_at = 0, parent = ?, handed = 1 WHERE hash = ?").bind(row.session, hash),          // (never counts as showing it's you)
      D.prepare("DELETE FROM pg_sessions WHERE parent = ? AND hash != ?").bind(row.session, hash)]);
    const u = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(row.user_id).first();
    return withSession(json(await view(env, { ...u, sessionHash: hash, parent: row.session, authAt: 0, handed: true })), request, env, hash);
  },
  // an app that sent you here to sign in, handed the sign-in back (functions/_handback.js): { code }, for the address
  // the page goes back to it with
  "POST handback": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    // (one handed over from an app goes on to none until it's shown it's you here)
    if (u.handed) throw new HttpError(403, "Confirm it’s you first.", "reauth");
    return json(await makeHandback(env, u, await body(request, 8192)));
  },
  // ---- joining: a new account, made here (by invite: functions/_join.js) and signed in at once ----
  // (the invite in the body, never the address: an address ends up in logs)
  "POST join": async ({ request, env }) => { sameOrigin(request); return json(await inviteState(env, request, (await body(request, 4096)).invite)); },
  "GET handle": async ({ request, env }) => json(await handleFree(env, request, new URL(request.url).searchParams.get("h"))),
  "POST signup": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await makeAccount(env, request, await body(request));
    // (the confirm link, sent as it's made, and said in what the page's shown only if it went: one that couldn't be sent,
    // Resend not answering in time among them (functions/_email.js sendEmail), is offered again there, which says why if
    // it still can't)
    const sent = emailReady(env) ? await sendConfirm(env, u, request).catch((e) => { console.error("confirm mail", e.message); return null; }) : null;
    waitUntil(logEvent(env, u.id, "signup", request));
    const token = await issueSession(env, u.id, request), hash = hex(await sha256(token));
    return withKnown(await withSession(json(await view(env, { ...u, email_sent: sent, sessionHash: hash, authAt: Date.now() }), 201), request, env, hash), request, env, u);
  },
  // ---- a forgotten password: a link to the email (good once, for an hour), then a new one, signed in with it ----
  "POST reset/request": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    return json(await requestReset(env, request, (await body(request, 4096)).email, waitUntil, (u, token) => tell(env, u, {
      icon: "key", title: "Reset your password", subject: "Reset your password", to: u.email,
      line: "someone asked to reset the password for your georgefarrowgreen.com account.", after: "If it wasn’t you, ignore this email: your password won’t change.",
      pill: ["link", "Works once, for 1 hour"], when: false, button: { label: "Choose a new password", url: `${pageOf(request, env)}/#reset=${token}` } }, linkOrigin(request))));
  },
  "POST reset/check": async ({ request, env }) => { sameOrigin(request); return json({ ...(await checkReset(env, request, (await body(request, 4096)).token)), rpId: rpIdFor(request, env) }); },
  "POST reset/complete": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const { u, kept } = await completeReset(env, request, await body(request));
    waitUntil(logEvent(env, u.id, "reset", request));
    waitUntil(tell(env, u, { icon: "key", title: "Your password was changed", subject: "Your password was changed", line: "the password for your account was just changed with a reset link.",
      rows: [["Your messages", kept ? "Kept, with your passkey" : "A new key: older messages can’t be opened"], ["Passkeys", "Removed: add one again in Sign-in and security"]] }, linkOrigin(request)));
    const token = await issueSession(env, u.id, request), hash = hex(await sha256(token));
    return withKnown(await withSession(json({ ...(await view(env, { ...u, sessionHash: hash, authAt: Date.now() })), kept }), request, env, hash), request, env, u);
  },
  "GET me": async ({ request, env }) => {
    const u = await cookieUser(request, env, false, { deleting: true });
    if (!u) return json({ signedIn: false });
    return withCookie(json(await view(env, u)), request, env, u.token);
  },
  ...accountRoutes(view, { deleting: true }),
  "POST reauth": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request), D = await db(env);
    await limit(env, "reauth:" + u.id, 10, 15 * 60e3);
    let ok = false;
    if (b.proof) ok = await proofOk(env, b.proof, u.proof_hash);
    else if (b.authenticatorData) {
      await checkClientData(env, request, b, "webauthn.get", "login");
      const cred = await D.prepare("SELECT * FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id || ""), u.id).first();
      ok = !!cred && await verifyAssertion(cred, request, b, env);
    }
    if (!ok) throw new HttpError(401, b.proof ? "That password isn’t right." : "That passkey didn’t check out.", "password");
    // (and one handed over from an app, shown to be yours, is the browser's own from now on)
    await D.prepare("UPDATE pg_sessions SET auth_at = ?, handed = NULL WHERE hash = ?").bind(Date.now(), u.sessionHash).run();
    return json({ ok: true });
  },
  // the password-locked key, for the password itself (its proof is the check): the page unlocks it, to lock it anew
  "POST password/vault": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    await limit(env, "reauth:" + u.id, 10, 15 * 60e3);
    if (!(await proofOk(env, b.proof, u.proof_hash))) throw new HttpError(401, "Your current password isn’t right.", "current");
    await (await db(env)).prepare("UPDATE pg_sessions SET auth_at = ? WHERE hash = ?").bind(Date.now(), u.sessionHash).run();
    return json({ vault: await openVault(env, u.id, u.vault), salt: u.salt });
  },
  // An account from before Argon2id, signed in to here with its password: stretched again the new way (the same
  // password and key, a new salt, and the key locked anew with what it gives), as InFlight did when it signed in itself.
  // Nothing else changes; but as the server can't tell it's the same password, it's noted in Recent activity and
  // emailed, so it's never a quiet way to change one (at most once an account).
  "POST password/upgrade": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    await limit(env, "pwupgrade:" + u.id, 5, 60 * 60e3);
    if (String(u.salt).startsWith("a2:")) return json({ ok: true });              // (already)
    if (!(await proofOk(env, b.oldProof, u.proof_hash))) throw new HttpError(401, "That password isn’t right.", "password");
    const vault = checkNewSecret(b);
    if (!String(b.salt).startsWith("a2:")) throw new HttpError(400, "This page sent an incomplete request. Reload and try again.");
    const r = await (await db(env)).prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ? WHERE id = ? AND salt = ?")
      .bind(b.salt, await proofHash(env, b.proof), await lockVault(env, u.id, vault), u.id, u.salt).run();
    if (r.meta?.changes) {
      waitUntil(logEvent(env, u.id, "upgrade", request));
      waitUntil(tell(env, u, { icon: "key", title: "Your password’s protection was strengthened", subject: "Your password’s protection was strengthened",
        line: "your account’s password is now kept with a stronger kind of protection.",
        // (not "change your password": that needs the password as it is now, which, if it wasn't them, someone else chose)
        after: "If you didn’t just sign in, someone may have set a password of their own: get a reset link with “Forgot password?” at account.georgefarrowgreen.com. A reset signs out every other device." }, linkOrigin(request)));
    }
    return json({ ok: true, salt: b.salt });
  },
  // a new password: the old one's proof, the new one's salt and proof, and the key locked with it. Every other sign-in
  // ends (this one stays), as anywhere a password's changed. (Checked against data breaches on the page as it was typed,
  // and kept as checked only if that got an answer (checked: true): one that didn't is left for the check-up to ask.)
  "POST password": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    await limit(env, "pwchange:" + u.id, 10, 60 * 60e3);
    if (!(await proofOk(env, b.oldProof, u.proof_hash))) throw new HttpError(401, "Your current password isn’t right.", "current");
    const vault = String(b.vault || "");
    if (!saltOk(b.salt) || fromB64url(b.proof).length !== 32 || vault.length < 20 || vault.length > 4000) throw new HttpError(400, "This page sent an incomplete request. Reload and try again.");
    const D = await db(env), t = Date.now(), ck = b.checked === true ? t : null;
    await D.batch([
      D.prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ?, pw_at = ?, pw_leaked = 0, pw_checked_at = ?, email_new = NULL, email_new_code = NULL, email_new_at = NULL WHERE id = ?").bind(b.salt, await proofHash(env, b.proof), await lockVault(env, u.id, vault), t, ck, u.id),
      D.prepare(`DELETE FROM pg_sessions WHERE user_id = ? AND ${OTHERS}`).bind(u.id, ...othersOf(u)),
      D.prepare("DELETE FROM pg_resets WHERE user_id = ?").bind(u.id),
    ]);
    waitUntil(logEvent(env, u.id, "password", request));
    waitUntil(tell(env, u, { icon: "key", title: "Your password was changed", line: "the password for your account was just changed.", subject: "Your password was changed" }, linkOrigin(request)));
    // (and this device, which has just shown it knows the password, given a new word that it's signed in to the account
    // before, as the one it had counts for nothing with the new password: functions/_account.js withKnown)
    const now = { ...u, salt: b.salt, pw_at: t, pw_leaked: 0, pw_checked_at: ck, email_new: null, email_new_at: null };
    return withKnown(json(await view(env, now)), request, env, now);
  },
  // How the password did against data breaches, checked on the page (which has it as you type it): kept with its proof,
  // so only someone who knows it can say. (It's shown it's you, too.)
  "POST password/checked": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request), t = Date.now();
    await limit(env, "reauth:" + u.id, 10, 15 * 60e3);
    if (!(await proofOk(env, b.proof, u.proof_hash))) throw new HttpError(401, "That password isn’t right.", "password");
    const D = await db(env);
    await D.batch([
      D.prepare("UPDATE pg_users SET pw_leaked = ?, pw_checked_at = ? WHERE id = ?").bind(b.leaked ? 1 : 0, t, u.id),
      D.prepare("UPDATE pg_sessions SET auth_at = ? WHERE hash = ?").bind(t, u.sessionHash),
    ]);
    return json(await view(env, { ...u, pw_leaked: b.leaked ? 1 : 0, pw_checked_at: t, authAt: t }));
  },
  // Has a password turned up in a data breach? Only the first 5 characters of its SHA-1 are asked (k-anonymity), padded
  "GET pwned": async ({ request, env }) => {
    await limit(env, "pwned:" + clientIp(request), 40, 15 * 60e3);
    const p = new URL(request.url).searchParams.get("p") || "";
    if (!/^[0-9A-F]{5}$/.test(p)) throw new HttpError(400, "Send the first 5 characters of the hash.");
    const r = await fetch(`${env.PWNED_URL || "https://api.pwnedpasswords.com"}/range/${p}`, { headers: { "Add-Padding": "true", "User-Agent": "georgefarrowgreen.com account" } }).catch(() => null);
    return new Response(r?.ok ? await r.text() : "", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" } });
  },
  // passkeys: a new one (for signing in everywhere on the site, with where it's saved), its name, and taking one away
  "POST passkeys/options": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    requireFresh(u);
    const { results } = await (await db(env)).prepare("SELECT id FROM pg_passkeys WHERE user_id = ?").bind(u.id).all();
    return json({ challenge: await newChallenge(env, "register", u.id), rpId: rpIdFor(request, env),
      user: { id: b64url(new TextEncoder().encode(u.id)), name: u.email, displayName: u.name }, exclude: results.map((r) => r.id) });
  },
  "POST passkeys": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    requireFresh(u);
    await checkClientData(env, request, b, "webauthn.create", "register", u.id);
    if (b.alg !== -7 && b.alg !== -257) throw new HttpError(400, "This passkey uses a key type that isn’t supported.");
    if (!/^[A-Za-z0-9_-]{16,1400}$/.test(String(b.id || "")) || !/^[A-Za-z0-9_-]{60,1200}$/.test(String(b.publicKey || ""))) throw new HttpError(400, "The passkey response was incomplete.");
    const count = await checkRegistration(request, env, b);
    const D = await db(env), label = cleanLabel(b.label) || deviceOf(request) || "Passkey", provider = providerOf(b.authenticatorData);
    if (await D.prepare("SELECT 1 FROM pg_passkeys WHERE id = ?").bind(b.id).first()) throw new HttpError(409, "This passkey is already saved.");
    await D.prepare("INSERT INTO pg_passkeys (id, user_id, public_key, alg, label, provider, created_at, sign_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(b.id, u.id, String(b.publicKey), b.alg, label, provider, Date.now(), count).run();
    waitUntil(logEvent(env, u.id, "passkey-add", request, provider || label));
    waitUntil(tell(env, u, { icon: "passkey", pill: ["passkey", provider || label], title: "A passkey was added", line: `a new passkey (“${provider || label}”) can now sign in to your account.`, subject: "A passkey was added to your account" }, linkOrigin(request)));
    return json(await view(env, u));
  },
  // a passkey's own copy of the key to InFlight's messages, locked with what only that passkey can work out (its PRF
  // secret), made on this page from the password-locked key: so on a new phone it opens them by itself, as one added in
  // InFlight does. (The page sends it locked: the key itself never leaves the device.)
  "POST passkeys/vault": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    requireFresh(u);
    const v = String(b.vault || "");
    if (v.length < 20 || v.length > 4000) throw new HttpError(400, "That key copy wasn’t valid.");
    const r = await (await db(env)).prepare("UPDATE pg_passkeys SET vault = ? WHERE id = ? AND user_id = ?").bind(await lockVault(env, u.id, v), String(b.id || ""), u.id).run();
    if (!r.meta.changes) throw new HttpError(404, "That passkey isn’t on your account.");
    return json(await view(env, u));
  },
  "POST passkeys/remove": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request), D = await db(env);
    requireFresh(u);
    const pk = await D.prepare("SELECT label, provider FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id || ""), u.id).first();
    if (pk) {
      await D.prepare("DELETE FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id || ""), u.id).run();
      waitUntil(logEvent(env, u.id, "passkey-remove", request, pk.label || pk.provider || "Passkey"));
    }
    return json(await view(env, u));
  },
  // (a name of your own for one: nothing's at stake, so no need to show it's you)
  "POST passkeys/rename": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 4096), label = cleanLabel(b.label);
    if (!label) throw new HttpError(400, "Give it a name.", "label");
    await (await db(env)).prepare("UPDATE pg_passkeys SET label = ? WHERE id = ? AND user_id = ?").bind(label, String(b.id || ""), u.id).run();
    return json(await view(env, u));
  },
  // signing out a device (by the start of its session's id), every one but this, or those unused for 90 days
  "POST devices/end": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request), D = await db(env);
    requireFresh(u);
    if (b.others) {
      // (and an email change still waiting called off: if a device here wasn't yours, nor might that be)
      await D.batch([D.prepare(`DELETE FROM pg_sessions WHERE user_id = ? AND ${OTHERS}`).bind(u.id, ...othersOf(u)),
        D.prepare("UPDATE pg_users SET email_new = NULL, email_new_code = NULL, email_new_at = NULL WHERE id = ?").bind(u.id)]);
      waitUntil(logEvent(env, u.id, "signout-others", request));
    } else if (b.stale) {
      // (unused as the list has it: the account page opened from an app counts as the app's)
      const r = await D.prepare(`DELETE FROM pg_sessions WHERE user_id = ? AND ${OTHERS} AND parent IS NULL
        AND MAX(seen_at, COALESCE((SELECT MAX(c.seen_at) FROM pg_sessions c WHERE c.parent = pg_sessions.hash), 0)) < ?`).bind(u.id, ...othersOf(u), Date.now() - STALE).run();
      waitUntil(logEvent(env, u.id, "signout-stale", request, String(r.meta?.changes || 0)));
    } else {
      const id = String(b.id || "");
      if (!/^[0-9a-f]{16}$/.test(id)) throw new HttpError(400, "That sign-in wasn’t found.");
      const s = await D.prepare(`SELECT label FROM pg_sessions WHERE user_id = ? AND ${OTHERS} AND substr(hash, 1, 16) = ?`).bind(u.id, ...othersOf(u), id).first();
      await D.prepare(`DELETE FROM pg_sessions WHERE user_id = ? AND ${OTHERS} AND substr(hash, 1, 16) = ?`).bind(u.id, ...othersOf(u), id).run();
      if (s) waitUntil(logEvent(env, u.id, "signout-device", request, s.label || "A phone or browser"));
    }
    return json(await view(env, b.others ? { ...u, email_new: null, email_new_at: null } : u));
  },
  "GET activity": async ({ request, env }) => {
    const u = await signedIn(request, env);
    return json({ events: await activityOf(env, u.id) });
  },

  // ---- your email ----
  "POST email/confirm-send": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    if (u.email_ok) return json({ ok: true, already: true });
    if (!emailReady(env)) throw new HttpError(503, "Email isn’t switched on yet.");
    await limit(env, "confirmsend:" + u.id, 3, DAY);
    await sendConfirm(env, u, request);
    return json({ ok: true });
  },
  // (the link's token is the proof: no sign-in needed, so it works in whichever browser the email opens it in)
  "POST email/confirm": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    await limit(env, "confirm:" + clientIp(request), 20, 15 * 60e3);
    const token = String((await body(request)).token || "");
    if (!tokenOk(token)) throw new HttpError(400, "This confirm link isn’t valid.");
    const D = await db(env), u = await D.prepare("SELECT * FROM pg_users WHERE email_code = ?").bind(hex(await sha256(token))).first();
    if (!u) throw new HttpError(400, "This confirm link has already been used, or a newer one was sent.");
    if (Date.now() - (u.email_sent || 0) > CONFIRM_TTL) throw new HttpError(410, "This confirm link has expired. Send a new one from your account.");
    await D.prepare("UPDATE pg_users SET email_ok = ?, email_code = NULL WHERE id = ?").bind(Date.now(), u.id).run();
    waitUntil(logEvent(env, u.id, "email-confirmed", request));
    return json({ ok: true, email: u.email });
  },
  // A new email: a link to it (good for 2 days), and a word to the old one. Nothing changes until the link's opened.
  "POST email/change": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 4096);
    requireFresh(u);
    const email = String(b.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "That doesn’t look like an email address.", "email");
    if (email === u.email) throw new HttpError(400, "That’s your email already.", "email");
    if (!emailReady(env)) throw new HttpError(503, "Email isn’t switched on yet.");
    await limit(env, "emailchange:" + u.id, 5, DAY);
    const D = await db(env);
    if (await D.prepare("SELECT 1 FROM pg_users WHERE email = ?").bind(email).first()) throw new HttpError(409, "That email is already used by another account.", "email");
    const token = randomToken(32), t = Date.now(), code = hex(await sha256(token));
    await D.prepare("UPDATE pg_users SET email_new = ?, email_new_code = ?, email_new_at = ? WHERE id = ?").bind(email, code, t, u.id).run();
    const origin = linkOrigin(request);
    // (a link that couldn't be sent is said, and nothing else is done: a change that was waiting before is put back,
    // unless a newer one has taken its place since)
    const sendLink = (...a) => accountMail(...a).catch(async (e) => {
      await D.prepare("UPDATE pg_users SET email_new = ?, email_new_code = ?, email_new_at = ? WHERE id = ? AND email_new_code = ?")
        .bind(u.email_new ?? null, u.email_new_code ?? null, u.email_new_at ?? null, u.id, code).run().catch(() => {});
      throw e;
    });
    await sendLink(env, u, { icon: "mail", pill: ["mail", email], when: false, title: "Confirm your new email", subject: "Confirm your new email", to: email, line: "tap the button to make this your account’s email address.",
      after: "Until you do, nothing changes. If you didn’t ask for this, ignore it.", button: { label: "Confirm new email", url: `${pageOf(request, env)}/#email=${token}` } }, origin);
    // (to the address as it is, confirmed or not, with how to call it off)
    waitUntil(tell(env, u, { icon: "mail", title: "A new email was asked for", subject: "A new email was asked for your account", line: `someone signed in to your account asked to change its email to ${hide(email)}. It changes only if the link sent there is opened.`,
      after: "If this wasn’t you, sign in now and change your password. That calls the change off and signs out every other device.", to: u.email, pill: ["mail", hide(email)] }, origin));
    waitUntil(logEvent(env, u.id, "email-change-asked", request, hide(email)));
    return json(await view(env, { ...u, email_new: email, email_new_at: t }));
  },
  "POST email/change-confirm": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    await limit(env, "confirm:" + clientIp(request), 20, 15 * 60e3);
    const token = String((await body(request)).token || "");
    if (!tokenOk(token)) throw new HttpError(400, "This link isn’t valid.");
    const D = await db(env), u = await D.prepare("SELECT * FROM pg_users WHERE email_new_code = ?").bind(hex(await sha256(token))).first();
    if (!u || !u.email_new) throw new HttpError(400, "This link has already been used, or a newer one was sent.");
    if (Date.now() - (u.email_new_at || 0) > CHANGE_TTL) throw new HttpError(410, "This link has expired. Ask for a new email again from your account.");
    if (await D.prepare("SELECT 1 FROM pg_users WHERE email = ? AND id != ?").bind(u.email_new, u.id).first()) throw new HttpError(409, "That email is now used by another account.");
    try {
      await D.batch([
        D.prepare("UPDATE pg_users SET email = email_new, email_ok = ?, email_new = NULL, email_new_code = NULL, email_new_at = NULL, email_code = NULL WHERE id = ?").bind(Date.now(), u.id),
        D.prepare("DELETE FROM pg_resets WHERE user_id = ?").bind(u.id),
      ]);
    } catch (e) { if (String(e).includes("UNIQUE")) throw new HttpError(409, "That email is now used by another account."); throw e; }
    waitUntil(logEvent(env, u.id, "email-changed", request, hide(u.email_new)));
    // (and what to do if it wasn't them: password sign-ins and resets go by the new address now, so the site's admin)
    waitUntil(tell(env, u, { icon: "mail", title: "Your email was changed", subject: "Your account’s email was changed", line: `your account’s email is now ${hide(u.email_new)}. Emails about it go there from now on.`,
      after: "If this wasn’t you, you can no longer sign in or reset your password with this address. Ask the person who runs the site for a reset link, and you can put your email back.",
      to: u.email, pill: ["mail", hide(u.email_new)] }, linkOrigin(request)));
    // (opened in a browser signed in to the account: its word that it's signed in to it before given anew, for the new
    // address, as the one it had is named by the old: functions/_account.js withKnown)
    const res = json({ ok: true, email: u.email_new });
    return (await cookieUser(request, env).catch(() => null))?.id === u.id ? withKnown(res, request, env, { ...u, email: u.email_new }) : res;
  },
  "POST email/cancel": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await (await db(env)).prepare("UPDATE pg_users SET email_new = NULL, email_new_code = NULL, email_new_at = NULL WHERE id = ?").bind(u.id).run();
    return json(await view(env, { ...u, email_new: null }));
  },

  // ---- preferences, for every app on the site that has them: appearance (InFlight's own, and this page's), and units
  // (Weather's, in its record for the account, which every device it's signed in on takes up) ----
  "PUT prefs": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 4096), now = { ...u };
    await limit(env, "prefs:" + u.id, 120, 3600e3);
    if (b.appearance !== undefined) {
      if (!["auto", "light", "dark"].includes(b.appearance)) throw new HttpError(400, "Choose Automatic, Light or Dark.");
      await (await db(env)).prepare("UPDATE pg_users SET appearance = ? WHERE id = ?").bind(b.appearance, u.id).run();
      now.appearance = b.appearance;
    }
    // InFlight's emails, on or off (as its own Notifications have them: which ones, it says)
    if (b.emails?.inflight !== undefined) {
      if (typeof b.emails.inflight !== "boolean") throw new HttpError(400, "Choose on or off.");
      await (await db(env)).prepare("UPDATE pg_users SET notify_email = ?, email_at = COALESCE(email_at, ?) WHERE id = ?").bind(b.emails.inflight ? 1 : 0, Date.now(), u.id).run();
      now.notify_email = b.emails.inflight ? 1 : 0;
    }
    // Weather's: its warnings, its briefing, each on or off (kept with Weather's own choices: functions/_wxacct.js)
    if (b.emails?.weather !== undefined) {
      const W = b.emails.weather && typeof b.emails.weather === "object" ? b.emails.weather : {}, change = {};
      for (const k of ["warn", "brief"]) if (W[k] !== undefined) { if (typeof W[k] !== "boolean") throw new HttpError(400, "Choose on or off."); change[k] = W[k]; }
      if (Object.keys(change).length) await setMail(env, u.id, change);
    }
    if (b.units !== undefined) {
      const U = b.units && typeof b.units === "object" ? b.units : {}, set = {};
      for (const [k, ok] of Object.entries(UNITS)) if (U[k] !== undefined) { if (!ok.includes(U[k])) throw new HttpError(400, "Choose one of the units shown."); set[k] = U[k]; }
      const D = await wxdb(env);
      for (let i = 0; i < 3; i++) {
        const wx = await weatherOf(env, u.id), data = wx.data || { places: [], settings: {}, notify: { places: [], brief: null, briefAt: "07:00" } };
        data.settings = { ...(data.settings || {}), ...set };
        const r = wx.ver === 0
          ? await D.prepare("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?1, ?2, 1, ?3) ON CONFLICT(user_id) DO NOTHING").bind(u.id, JSON.stringify(data), Date.now()).run()
          : await D.prepare("UPDATE wx_accts SET data = ?2, ver = ver + 1, updated = ?3 WHERE user_id = ?1 AND ver = ?4").bind(u.id, JSON.stringify(data), Date.now(), wx.ver).run();
        if (r.meta?.changes) break;
      }
      const s = (await weatherOf(env, u.id)).data?.settings || {};
      await unitsForAccount(env, u.id, s);
    }
    return json(await view(env, now));
  },

  // ---- InFlight's settings (inflightSettings), as its Settings sends you here for them: each change by the app's own
  // rules (functions/_notify.js cleanPrefs, functions/api/pigeon setPrivacy), and the app takes it up as it next syncs ----
  "GET inflight": async ({ request, env }) => json(await inflightSettings(env, await signedIn(request, env))),
  "PATCH inflight": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 4096), D = await db(env);
    await limit(env, "prefs:" + u.id, 120, 3600e3);
    if (b.notify !== undefined) {
      if (!b.notify || typeof b.notify !== "object") throw new HttpError(400, "Bad request.");
      await savePrefs(D, u.id, b.notify);
    }
    if (b.email !== undefined) {
      if (typeof b.email !== "boolean") throw new HttpError(400, "Choose on or off.");
      await D.prepare("UPDATE pg_users SET notify_email = ?, email_at = COALESCE(email_at, ?) WHERE id = ?").bind(b.email ? 1 : 0, Date.now(), u.id).run();
    }
    if (b.privacy !== undefined) {
      const P = b.privacy && typeof b.privacy === "object" ? b.privacy : {}, set = {};
      for (const k of PRIVACY) if (P[k] !== undefined) { if (typeof P[k] !== "boolean") throw new HttpError(400, "Choose on or off."); set[k] = P[k]; }
      await setPrivacy(D, u, set);
    }
    return json(await inflightSettings(env, await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first()));
  },
  // ---- Fitness's settings (fitnessSettings), as its Settings sends you here for them: a change to its record from the
  // version that's kept (tried again on one made meanwhile on a phone), taken up by the app as it next opens ----
  "GET fitness": async ({ request, env }) => json(await fitnessSettings(env, await signedIn(request, env))),
  "PATCH fitness": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 1024), set = {};
    await limit(env, "prefs:" + u.id, 120, 3600e3);
    if (b.units !== undefined) { if (b.units !== "metric" && b.units !== "imperial") throw new HttpError(400, "Choose kilometres or miles."); set.units = b.units; }
    if (b.ask !== undefined) { if (typeof b.ask !== "boolean") throw new HttpError(400, "Choose on or off."); set.ask = b.ask; }
    if (b.maps !== undefined) { if (b.maps !== "tap" && b.maps !== "always") throw new HttpError(400, "Choose when you tap, or always."); set.maps = b.maps; }
    for (let i = 0; i < 4; i++) {
      const k = await fitnessKept(env, u.id), prefs = { ...(k.data?.prefs || {}), ...set };
      if (prefs.ask !== false) delete prefs.ask;     // (the app keeps it only when it's off)
      if (prefs.maps !== "always") delete prefs.maps;     // (and maps only when they're always shown)
      const r = await fitnessSave(env, u.id, k.ver, { ...(k.data || {}), prefs });
      if (!r.conflict) return json(await fitnessSettings(env, u));
    }
    throw new HttpError(409, "Fitness was changing that on another device. Try again.");
  },
  // ---- where Fitness's rides and nights come from, connected here as in the app (functions/_garmin.js, _strava.js,
  // _health.js); the app reads what each brings in as it next opens ----
  "POST fitness/garmin": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 8 * 1024);
    await garminConnect(env, u.id, b.key);
    return json(await fitnessSettings(env, u));
  },
  "POST fitness/garmin/all": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await garminAll(env, u.id);
    return json(await fitnessSettings(env, u));
  },
  // (acts=1: and every activity it brought in, removed)
  "DELETE fitness/garmin": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), acts = new URL(request.url).searchParams.get("acts") === "1";
    await garminOff(env, u.id);
    const gone = acts ? await fitnessDrop(env, u.id, "g") : 0;
    return json({ ...(await fitnessSettings(env, u)), gone });
  },
  // (Strava's page to say yes on, which sends you back to Fitness: its address is the one Strava knows)
  "POST fitness/strava": async ({ request, env }) => {
    sameOrigin(request);
    return json(await stravaUrl(env, (await signedIn(request, env)).id, fitnessOrigin(request)));
  },
  "POST fitness/strava/all": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await stravaAll(env, u.id);
    return json(await fitnessSettings(env, u));
  },
  "DELETE fitness/strava": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), acts = new URL(request.url).searchParams.get("acts") === "1";
    await disconnectStrava(env, u.id);
    const gone = acts ? await fitnessDrop(env, u.id, "s") : 0;
    return json({ ...(await fitnessSettings(env, u)), gone });
  },
  // (a new key for the Shortcut, shown this once, with the address it goes in: Fitness's)
  "POST fitness/health": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), r = await healthKey(env, u.id);
    return json({ ...(await fitnessSettings(env, u)), key: r.key, address: `${fitnessOrigin(request)}/api/fitness/health/${r.key}` });
  },
  "DELETE fitness/health": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await healthOff(env, u.id);
    return json(await fitnessSettings(env, u));
  },
  // what's needed to export everything: each activity's name and kind, your workouts, and the paces they're drawn at
  "GET fitness/export": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await limit(env, "fxexport:" + u.id, 30, DAY);
    const d = (await fitnessKept(env, u.id)).data || {}, p = d.profile || {};
    const acts = (await allActs(env, u.id)).map((a) => ({ id: a.id, start: a.start, name: a.name, type: a.type, file: a.file }));
    return json({ acts, workouts: Array.isArray(d.workouts) ? d.workouts : [], pace: { run: 1000 / (p.runPace || 330), swim: 100 / (p.css || 120) } });
  },
  // one activity's file, as it came (gzipped, if it was kept so: the page unpacks it)
  "GET fitness/file": async ({ request, env }) => {
    const u = await signedIn(request, env), id = new URL(request.url).searchParams.get("id") || "";
    if (!id || id.length > 200) throw new HttpError(400, "Bad request.");
    const f = await fitnessFile(env, u.id, id);
    return new Response(f.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  },
  // someone blocked in InFlight, unblocked (only lifted: they aren't told, as they weren't told of the block)
  "DELETE inflight/block": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), id = String((await body(request)).id || ""), D = await db(env);
    await D.prepare("DELETE FROM pg_links WHERE a = ? AND b = ? AND status = 'blocked'").bind(u.id, id).run();
    return json(await inflightSettings(env, u));
  },

  // ---- your data: everything kept with the account that can be read (InFlight's letters can't: they're encrypted on
  // the phones, with keys the server never has) ----
  "POST export": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    requireFresh(u);
    await limit(env, "export:" + u.id, 10, DAY);
    const D = await db(env), all = (q, ...a) => D.prepare(q).bind(...a).all().then((r) => r.results).catch(() => []);
    const one = (q, ...a) => D.prepare(q).bind(...a).first().catch(() => null);
    const [pks, ss, events, friends, groups, pigeons, passport, birds, wx, wxDevices, fxKept, fxActs, fxNights] = await Promise.all([
      all("SELECT label, provider, created_at, used_at FROM pg_passkeys WHERE user_id = ?", u.id),
      all("SELECT label, place, created_at, seen_at FROM pg_sessions WHERE user_id = ?", u.id),
      activityOf(env, u.id),
      all("SELECT x.handle, x.name, l.created_at FROM pg_links l JOIN pg_users x ON x.id = CASE WHEN l.a = ?1 THEN l.b ELSE l.a END WHERE (l.a = ?1 OR l.b = ?1) AND l.status = 'ok'", u.id),
      all("SELECT g.name, m.joined_at FROM pg_group_members m JOIN pg_groups g ON g.id = m.group_id WHERE m.user_id = ?", u.id),
      one(`SELECT ${SENT} AS sent, ${HAD} AS received`, u.id, Date.now()),
      all("SELECT place, first_at, n FROM pg_passport WHERE user_id = ?", u.id),
      all("SELECT name, created_at, km FROM pg_birds WHERE owner = ?", u.id),
      weatherOf(env, u.id),
      devicesOf(env, u.id).catch(() => []),
      fitnessKept(env, u.id).catch(() => ({ data: null })),
      allActs(env, u.id).catch(() => []),   // (every one, newest first)
      fitnessNights(env, u.id).catch(() => null),   // (your nights: hrv in ms, rhr in beats a minute, sleep in seconds)
    ]);
    let photo = null;
    if (u.avatar_at && env.BIO_R2) { const o = await env.BIO_R2.get(avatarKey(u.id)).catch(() => null); if (o) { const a = new Uint8Array(await o.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); photo = "data:image/jpeg;base64," + btoa(s); } }
    const iso = (t) => (t ? new Date(t).toISOString() : null);
    const out = {
      about: "Everything kept with your georgefarrowgreen.com account that can be read. InFlight's letters aren't here: they're end-to-end encrypted, with keys only your phones have.",
      exportedAt: iso(Date.now()),
      account: { id: u.id, name: u.name, handle: u.handle, email: u.email, emailConfirmed: !!u.email_ok, createdAt: iso(u.created_at), photo,
        appearance: u.appearance || "auto" },
      signIn: {
        passkeys: pks.map((p) => ({ name: p.label, savedIn: p.provider, createdAt: iso(p.created_at), lastUsedAt: iso(p.used_at) })),
        devices: ss.map((s) => ({ device: s.label, place: s.place, signedInAt: iso(s.created_at), lastActiveAt: iso(s.seen_at) })),
        recentActivity: events.map((e) => ({ ...e, at: iso(e.at) })),
      },
      inflight: {
        place: u.place || null, location: u.lat != null ? { lat: u.lat, lon: u.lon, approximate: !!u.loc_approx } : null,
        friends: friends.map((f) => ({ handle: f.handle, name: f.name, since: iso(f.created_at) })),
        groups: groups.map((g) => ({ name: g.name, joinedAt: iso(g.joined_at) })),
        pigeons: { sent: pigeons?.sent || 0, received: pigeons?.received || 0 },
        passport: passport.map((p) => ({ place: p.place, firstAt: iso(p.first_at), times: p.n })),
        birds: birds.map((x) => ({ name: x.name, hatchedAt: iso(x.created_at), km: Math.round(x.km || 0) })),
        settings: { notifications: prefsOf(u), emailWhenPigeonsLand: !!u.notify_email, showWhenOnline: !u.hide_online, readReceipts: !u.no_receipts,
          shareNews: !u.hide_news, liveTracker: !u.hide_tracker, approximateLocation: !!u.loc_approx },
      },
      weather: { places: wx.data?.places || [], settings: wx.data?.settings || {}, notifications: wx.data?.notify || null, devices: wxDevices.map((d) => d.label) },
      // (each activity's figures; its file, as imported, is in Fitness: Export everything)
      fitness: { ...(fxKept.data || {}), activities: fxActs.map((a) => ({ name: a.name, sport: a.sport, startedAt: iso(a.start), device: a.device, file: a.file, figures: a.sum })), nights: fxNights },
    };
    waitUntil(logEvent(env, u.id, "export", request));
    const res = json(out);
    res.headers.set("Content-Disposition", `attachment; filename="georgefarrowgreen-account-${u.handle}.json"`);
    return res;
  },

  // ---- deleting the account: in 7 days, unless it's kept. Signed out everywhere now; signing in again is only here,
  // to keep it; or the email's link keeps it ----
  "POST delete": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    requireFresh(u);
    if (String(b.confirm || "").trim().replace(/^@/, "").toLowerCase() !== u.handle) throw new HttpError(400, `Type ${u.handle} to confirm.`, "confirm");
    const token = randomToken(32), at = Date.now() + GRACE, D = await db(env);
    await D.batch([
      D.prepare("UPDATE pg_users SET delete_at = ?, delete_code = ? WHERE id = ?").bind(at, hex(await sha256(token)), u.id),
      D.prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(u.id),
    ]);
    waitUntil(logEvent(env, u.id, "delete-asked", request));
    // (only to an address that's been shown to be theirs: its Keep button stops the deletion. Unconfirmed, signing in keeps it)
    waitUntil(tell(env, u, { icon: "trash", title: "Your account will be deleted", subject: `Your account will be deleted on ${onDay(at)}`,
      line: `your account and everything kept with it, in every app on the site, will be deleted on ${onDay(at)}.`,
      after: "Changed your mind? Keep it with the button, or sign in at account.georgefarrowgreen.com before then.",
      pill: ["clock", `On ${onDay(at)}`], when: false, button: { label: "Keep my account", url: `${pageOf(request, env)}/#keep=${token}` } }, linkOrigin(request)));
    return withoutSession(json({ ok: true, deleteAt: at }), request, env);
  },
  "POST delete/cancel": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env, { deleting: true });
    if (u.delete_at) {
      await (await db(env)).prepare("UPDATE pg_users SET delete_at = NULL, delete_code = NULL WHERE id = ?").bind(u.id).run();
      waitUntil(logEvent(env, u.id, "delete-cancelled", request));
    }
    return json(await view(env, { ...u, delete_at: null }));
  },
  "POST delete/keep": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    await limit(env, "confirm:" + clientIp(request), 20, 15 * 60e3);
    const token = String((await body(request)).token || "");
    if (!tokenOk(token)) throw new HttpError(400, "This link isn’t valid.");
    const D = await db(env), u = await D.prepare("SELECT id, handle, delete_at FROM pg_users WHERE delete_code = ?").bind(hex(await sha256(token))).first();
    if (!u) throw new HttpError(400, "This link has already been used, or the account’s gone.");
    await D.prepare("UPDATE pg_users SET delete_at = NULL, delete_code = NULL WHERE id = ?").bind(u.id).run();
    waitUntil(logEvent(env, u.id, "delete-cancelled", request));
    return json({ ok: true, handle: u.handle });
  },
};

// The site's admin (the linked account's, here: functions/api/pigeon), each change noted in its Recent activity too
const ADMIN_DID = { "admin/reset": "Made a password reset", "admin/signout": "Signed an account out", "admin/pigeons": "Gave pigeons",
  "admin/delete": "Deleted an account", "admin/invite": "Made an invite", "admin/invite-revoke": "Cancelled an invite", "admin/test-email": "Sent a test email",
  "admin/message-delete": "Deleted a message" };
for (const [k, fn] of Object.entries(ADMIN_ROUTES)) {
  const did = ADMIN_DID[k.split(" ")[1]];
  ROUTES[k] = did ? async (ctx) => {
    const res = await fn(ctx), u = res.ok && await cookieUser(ctx.request, ctx.env);
    if (u) ctx.waitUntil(logEvent(ctx.env, u.id, "admin", ctx.request, did));
    return res;
  } : fn;
}

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url), parts = [].concat(ctx.params.path || []), route = ROUTES[`${ctx.request.method} ${parts.join("/")}`];
  // (only at the account's own address)
  if (!route || !isAccount(url, ctx.env)) return json({ error: "Not found." }, 404);
  try { return await route(ctx); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    await logError(ctx.env, "account api", e);
    return json({ error: "Something went wrong. Try again in a moment." }, 500);
  }
}
