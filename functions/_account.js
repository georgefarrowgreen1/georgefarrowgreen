// The one account (inflite.ai's, and the home page's at georgefarrowgreen.com): the same email, password and passkeys in every app on it, and one
// sign-in shared by them all in a browser.
//
// You sign in on the account's own page (account.<site>), and only there: each app sends you there to sign in, and is
// handed the sign-in back (functions/_handback.js). A sign-in starts a session (pg_sessions: functions/_pigeon.js) and
// gives it to the browser as a cookie for the whole site as well: HttpOnly (no page's own script can read it),
// SameSite=Lax, and Secure. So signed in for one app, you're signed in to the others in that browser, and signing out
// of any of them ends the session for them all. The cookie carries a token of its own for the session (site_hash), not
// the session's bearer token: it opens nothing of Chat's. An app that keeps its own copy of the session (Chat's
// bearer token, for its keys and its messages) carries on with that; with none, it gets one only from a hand-back,
// which brings what unlocks its key; one that keeps nothing (Weather) asks with the cookie each time, for its own things
// only, and only from its own pages (sameOrigin). The cookie's only given in answer to a sign-in from the site's own
// pages: a sign-in another site sends in your browser (with its own account) can't sign the browser in.
//
// (A web app added to an iPhone's Home Screen keeps cookies of its own, apart from Safari's and from other such apps,
// so there each app is signed in to separately, the account's page opening inside it to do it; with a passkey, that's
// one tap.)
//
// ACCOUNT_SITE in the environment: tests, which stand in a site of their own (gfg.test), over plain http.

import { HttpError, db, sha256, hex, b64url, clientIp, clientNet, limit, waitText, serverSecret, sessionUser, checkClientData, verifyAssertion, EMAIL_RE, SESSION_TTL, SESSION_MAX, randomToken,
  safeEqual, deviceOf, regionOf, accountPage } from "./_pigeon.js";
import { emailReady, emailBody, sendEmail, ukTime, linkOrigin } from "./_email.js";
import { proofOk } from "./_atrest.js";
import { pushTo } from "./_notify.js";
import { siteName } from "./_sites.js";
import { logEvent } from "./_activity.js";

// The cookie: for the whole of the site the address is on (inflite.ai, for every app; georgefarrowgreen.com, for the
// home page: functions/_sites.js), production's or the tests'; for that address alone anywhere else (a preview's,
// localhost). (The two sites' cookies are two sign-ins: one's carried to the other by a hop, functions/_hop.js)
// (Secure on the sites' own addresses whatever the request came over; plain only for local tests over http)
function cookieOf(request, env) {
  const u = new URL(request.url), site = siteName(u.hostname, env), whole = !!site;
  const secure = u.protocol === "https:" || (whole && !env?.ACCOUNT_SITE);
  return { name: secure ? "__Secure-account" : "account", attrs: `Path=/${whole ? `; Domain=${site}` : ""}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
}
// (two of them, one set by a page elsewhere on the site for a narrower path to fix a sign-in on you: neither's used)
export function cookieToken(request, env) {
  const { name } = cookieOf(request, env), found = [];
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    if (part.slice(0, i).trim() === name) found.push(part.slice(i + 1).trim());
  }
  return found.length === 1 && /^[A-Za-z0-9_-]{20,100}$/.test(found[0]) ? found[0] : null;
}
// A response that signs the browser in to the site: the session (sessionHash) given a cookie token of its own, but only
// in answer to the app's own pages (the browser says where a request's from; sure: known otherwise, as by a bearer token
// a page of another site couldn't send)
export async function withSession(res, request, env, sessionHash, sure = false) {
  if (!sure && request.headers.get("Origin") !== new URL(request.url).origin) return res;
  const token = randomToken(32);
  await (await db(env)).prepare("UPDATE pg_sessions SET site_hash = ? WHERE hash = ?").bind(hex(await sha256(token)), sessionHash).run();
  return withCookie(res, request, env, token);
}
// (the cookie itself, renewed: token, the cookie's own)
export function withCookie(res, request, env, token) {
  const { name, attrs } = cookieOf(request, env);
  res.headers.append("Set-Cookie", `${name}=${token}; ${attrs}; Max-Age=${Math.floor(SESSION_TTL / 1000)}`);
  return res;
}
export function withoutSession(res, request, env) {
  const { name, attrs } = cookieOf(request, env);
  res.headers.append("Set-Cookie", `${name}=; ${attrs}; Max-Age=0`);
  return res;
}
// The account the browser's signed in to on the site, from its cookie (null if none, or if it's ended). (inflight: asked
// by Chat, so a day of it; another app's use keeps the sign-in going without counting as Chat's)
// An account being deleted (functions/api/account) is signed in only on its own page, to keep it (deleting).
export async function cookieUser(request, env, inflight = false, { deleting = false } = {}) {
  const token = cookieToken(request, env);
  if (!token) return null;
  try { const u = await sessionUser(env, token, inflight, true, request); u.token = token; return u.delete_at && !deleting ? null : u; }
  catch (e) { if (e instanceof HttpError && e.status === 401) return null; throw e; }
}
// (said only to someone who's shown it's their account)
function refuseDeleting(u) {
  const on = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }).format(u.delete_at);
  throw new HttpError(403, `This account is being deleted on ${on}. To keep it, sign in at account.inflite.ai.`, "deleting");
}
// A request that acts on the cookie's account must come from the app's own pages (the browser says where from): a
// page elsewhere on the site would send the cookie too
export function sameOrigin(request) {
  const o = request.headers.get("Origin");
  if (!o || o !== new URL(request.url).origin) throw new HttpError(403, "That request didn't come from this app.");
}

// The salt for an email's password (public input to the stretching on the phone). Unknown emails get a stable made-up
// one, so this can't be used to find out who has an account.
export async function saltFor(env, request, email) {
  await limit(env, "salt:" + clientIp(request), 60, 15 * 60e3);
  email = String(email || "").trim().toLowerCase();
  const u = await (await db(env)).prepare("SELECT salt FROM pg_users WHERE email = ?").bind(email).first();
  const fake = await sha256(`${await serverSecret(env)}|salt|${email}`);       // (worked out either way, so the time taken says nothing)
  // (one in eight in the older form, as an account from before Argon2id still has: so that form says nothing either)
  return u ? u.salt : (fake[16] < 32 ? "" : "a2:") + b64url(fake.slice(0, 16));
}
// A device that's signed in to an account on its page before (its password or a passkey) keeps a word saying so: a
// cookie of the page's own address alone, one for each account (named by its email's hash, so signing in to another
// account on the same device doesn't take its place), good only for that account and its password as they are now (the
// email's hash, an id of the device's own, and a MAC of both with the account's id and when its password was set, under
// the server's secret: once the password's changed or reset, or the account's gone, every word given before counts for
// nothing). Its wrong passwords count against it alone, not the account as a whole.
const emailKey = async (email) => hex(await sha256(email)).slice(0, 32);
function knownOf(request, env, em) {
  const secure = cookieOf(request, env).name.startsWith("__Secure-");
  return { name: `${secure ? "__Host-known" : "known"}-${em.slice(0, 8)}`, attrs: `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
}
async function knownMac(env, em, id, u) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(await serverSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`known-device|${em}|${id}|${u.id}|${u.pw_at || ""}`)))).slice(0, 32);
}
// (a response to a sign-in to the account u, its row as it is now, with the word given to the browser: a new one each
// time, kept a year)
export async function withKnown(res, request, env, u) {
  const em = await emailKey(u.email), id = randomToken(12), { name, attrs } = knownOf(request, env, em);
  res.headers.append("Set-Cookie", `${name}=${em}.${id}.${await knownMac(env, em, id, u)}; ${attrs}; Max-Age=${Math.floor(SESSION_MAX / 1000)}`);
  return res;
}
// (the device's id, if the browser has the word for the account u, whose email's hash is em; else null)
async function knownHere(request, env, em, u) {
  const { name } = knownOf(request, env, em);
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    const [e, id, mac] = part.slice(i + 1).trim().split(".");
    if (e === em && /^[A-Za-z0-9_-]{16}$/.test(id || "") && safeEqual(mac || "", await knownMac(env, em, id, u))) return id;
  }
  return null;
}
// The account an email and its password's proof are for, or a 401 (with the same limits wherever it's tried). One being
// deleted only where it can be kept (deleting).
export async function passwordUser(env, request, b, { deleting = false } = {}) {
  const email = String(b.email || "").trim().toLowerCase();
  // (an account's wrong passwords are counted by network, so addresses from one network can't lock its password sign-in)
  const net = clientNet(request);
  await limit(env, "login:" + clientIp(request), 10, 15 * 60e3);
  if (!EMAIL_RE.test(email)) throw new HttpError(401, "That email or password isn’t right.");
  // Only wrong passwords count against an account, and only from where they were tried: 30 an hour
  // from one address holds that address back, and only a spread-out guessing (300 an hour, from
  // many addresses at once) holds back the account itself, and then only on devices that haven't
  // signed in to it before. One that has (its word: withKnown) counts its own wrong tries instead,
  // 10 an hour, so guessing elsewhere can't lock you out there, and a word that's stolen is worth
  // no more than one more network. (A passkey's never held back by any of this.)
  const em = await emailKey(email), D = await db(env), now0 = Date.now();
  // (the account first, as a word's good only for it as it is)
  const u = await D.prepare("SELECT * FROM pg_users WHERE email = ?").bind(email).first();
  const here = "loginacct:" + em + ":" + hex(await sha256(net)).slice(0, 16), acct = "loginacct:" + em, dev = u && await knownHere(request, env, em, u);
  const holds = [[here, 30], dev ? ["loginacct:dev:" + em + ":" + dev, 10] : [acct, 300]];
  for (const [key, max] of holds) {
    const held = await D.prepare("SELECT count, reset_at FROM pg_limits WHERE key = ?").bind(key).first();
    const wait = held && waitText(held.reset_at - now0);
    if (held && held.reset_at > now0 && held.count >= max) throw new HttpError(429, key === acct ? `Too many tries for this account. Try again in ${wait}, or sign in with a passkey.` : `Too many tries. Try again in ${wait}.`);
  }
  if (!u || !(await proofOk(env, b.proof, u.proof_hash))) {
    for (const [key, max] of holds) await limit(env, key, max, 60 * 60e3).catch(() => {});
    throw new HttpError(401, "That email and password don’t match an account.");
  }
  if (u.delete_at && !deleting) refuseDeleting(u);
  return u;
}
// The account a passkey's answer signs in to: { u, cred }, or a 401
export async function passkeyUser(env, request, b, { deleting = false } = {}) {
  await limit(env, "pklogin:" + clientIp(request), 20, 15 * 60e3);
  await checkClientData(env, request, b, "webauthn.get", "login");
  const D = await db(env);
  const cred = await D.prepare("SELECT * FROM pg_passkeys WHERE id = ?").bind(String(b.id || "")).first();
  if (!cred) throw new HttpError(401, "This passkey isn’t linked to an account any more.");
  if (!(await verifyAssertion(cred, request, b, env))) throw new HttpError(401, "The passkey signature didn’t check out.");
  const u = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(cred.user_id).first();
  if (!u) throw new HttpError(401, "This account no longer exists.");
  if (u.delete_at && !deleting) refuseDeleting(u);
  await D.prepare("UPDATE pg_passkeys SET used_at = ? WHERE id = ?").bind(Date.now(), cred.id).run();
  return { u, cred };
}

// An email about the account (its sign-ins, password, passkeys, email, keeping it): from "Account", in the account's
// look, whichever app it happened in. To the account's email once it's confirmed, or to another address (to). A send
// that fails is said (as to an admin, explain), so callers that don't mind catch it. (when: false, for a link, which
// needs no time it happened: confirming, a reset, keeping it)
export async function accountMail(env, u, { icon = "shield", title, line, after, subject, rows = [], to, button, pill, when = true }, origin, opts) {
  if (!emailReady(env) || (!to && !u.email_ok)) return false;
  const { text, html } = emailBody({ origin, icon, brand: "account", title, preheader: line, button, pill,
    lines: [`Hi ${String(u.name).trim().split(/\s+/)[0]}, ${line}`, after ?? "If this wasn’t you, change your password straight away, at account.inflite.ai."],
    rows: [["Account", `@${u.handle}`], ...rows, ...(when ? [["When", ukTime(Date.now())]] : [])] });
  await sendEmail(env, { to: to || u.email, subject, text, html, brand: "account" }, opts);
  return true;
}

// "A new sign-in", to the account's phones (in Chat, as Chat says it, with where to sign it out) and by email,
// from the account, saying which app it was in (or for, signed in on the account's page for an app: inflight, or
// forApp "weather")
export async function tellSignIn(env, u, request, how, origin, inflight = true, forApp = null) {
  await logEvent(env, u.id, "signin", request, how);
  const device = deviceOf(request) || "a new phone";
  let where = regionOf(request.cf?.country);
  if (/^(United|Netherlands|Philippines|Czech|Bahamas|Gambia|Maldives|Seychelles|Marshall|Solomon|Central African|Dominican)/.test(where)) where = "the " + where;
  const on = `${device}${where ? ` in ${where}` : ""}`, account = inflight ? "Your Chat account" : "Your account";
  await pushTo(env, u.id, { title: "New sign-in", body: `${account} was signed in on ${on}. Not you? ${inflight ? "Sign it out in Privacy & Security." : "Change your password."}`, tag: "signin", url: "/pigeon/#account" }).catch(() => {});
  const host = new URL(request.url).hostname;
  const app = inflight ? "Chat" : forApp === "weather" || host.startsWith("weather.") ? "Weather" : forApp === "fitness" || host.startsWith("fitness.") ? "Fitness" : "Account page";
  // (where it was, once, in the pill: the words and the details don't say it again)
  await accountMail(env, u, { title: "A new sign-in", subject: "A new sign-in to your account", pill: ["phone", [device, where.replace(/^the /, "")].filter(Boolean).join(" · ")],
    line: "someone just signed in to your account. If it was you, there’s nothing to do.",
    after: "If it wasn’t, sign out the devices you don’t know in Signed-in devices and change your password.",
    rows: [["Signed in to", app], ["How", how]],
    button: { label: "Review your account", url: `${accountPage(request, env)}/` } }, origin || linkOrigin(request)).catch(() => {});
}
