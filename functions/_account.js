// The site's one account (georgefarrowgreen.com): the same email, password and passkeys in every app on it, and one
// sign-in shared by them all in a browser.
//
// Each app's sign-in starts a session (pg_sessions: functions/_pigeon.js) and gives it to the browser as a cookie for
// the whole site as well: HttpOnly (no page's own script can read it), SameSite=Lax, and Secure. So signing in to one
// app signs you in to the others in that browser, and signing out of any of them ends the session for them all. The
// cookie carries a token of its own for the session (site_hash), not the session's bearer token: it opens nothing of
// InFlight's. An app that keeps its own copy of the session (InFlight's bearer token, for its keys and its messages)
// carries on with that; with none, it can start one from the cookie's session only with the password (resume); one that
// keeps nothing (Weather) asks with the cookie each time, for its own things only, and only from its own pages
// (sameOrigin). The cookie's only given in answer to a sign-in from the app's own pages: a sign-in another site sends
// in your browser (with its own account) can't sign the browser in.
//
// (A web app added to an iPhone's Home Screen keeps cookies of its own, apart from Safari's and from other such apps,
// so there each app is signed in to separately; with a passkey, that's one tap.)
//
// ACCOUNT_SITE in the environment: tests, which stand in a site of their own (gfg.test), over plain http.

import { HttpError, db, sha256, hex, b64url, clientIp, clientNet, limit, serverSecret, sessionUser, checkClientData, verifyAssertion, EMAIL_RE, SESSION_TTL, randomToken,
  deviceOf, regionOf, emailReady, emailBody, sendEmail, ukTime, linkOrigin, accountPage } from "./_pigeon.js";
import { proofOk } from "./_atrest.js";
import { pushTo } from "./_notify.js";
import { logEvent } from "./_activity.js";

const SITE = "georgefarrowgreen.com";
export const siteOf = (env) => env?.ACCOUNT_SITE || SITE;

// The cookie: for the whole site where the address is the site's (production's, or the tests'); for that address
// alone anywhere else (a preview's, localhost)
// (Secure on the site's own addresses whatever the request came over; plain only for local tests over http)
function cookieOf(request, env) {
  const u = new URL(request.url), site = siteOf(env), whole = u.hostname === site || u.hostname.endsWith(`.${site}`);
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
// by InFlight, so a day of it; another app's use keeps the sign-in going without counting as InFlight's)
// An account being deleted (functions/api/account) is signed in only on its own page, to keep it (deleting).
export async function cookieUser(request, env, inflight = false, { deleting = false } = {}) {
  const token = cookieToken(request, env);
  if (!token) return null;
  try { const u = await sessionUser(env, token, inflight, true); u.token = token; return u.delete_at && !deleting ? null : u; }
  catch (e) { if (e instanceof HttpError && e.status === 401) return null; throw e; }
}
// (said only to someone who's shown it's their account)
function refuseDeleting(u) {
  const on = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }).format(u.delete_at);
  throw new HttpError(403, `This account is being deleted on ${on}. To keep it, sign in at account.georgefarrowgreen.com.`, "deleting");
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
  // many addresses at once) holds back the account itself. So guessing elsewhere can't lock you out.
  const em = hex(await sha256(email)).slice(0, 32), D = await db(env), now0 = Date.now();
  const here = "loginacct:" + em + ":" + hex(await sha256(net)).slice(0, 16), acct = "loginacct:" + em;
  for (const [key, max] of [[here, 30], [acct, 300]]) {
    const held = await D.prepare("SELECT count, reset_at FROM pg_limits WHERE key = ?").bind(key).first();
    if (held && held.reset_at > now0 && held.count >= max) throw new HttpError(429, `Too many tries. Wait ${Math.ceil((held.reset_at - now0) / 60e3)} minutes and try again.`);
  }
  const u = await D.prepare("SELECT * FROM pg_users WHERE email = ?").bind(email).first();
  if (!u || !(await proofOk(env, b.proof, u.proof_hash))) {
    await limit(env, here, 30, 60 * 60e3).catch(() => {}); await limit(env, acct, 300, 60 * 60e3).catch(() => {});
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
    lines: [`Hi ${String(u.name).trim().split(/\s+/)[0]}, ${line}`, after ?? "If this wasn’t you, change your password straight away, at account.georgefarrowgreen.com."],
    rows: [["Account", `@${u.handle}`], ...rows, ...(when ? [["When", ukTime(Date.now())]] : [])] });
  await sendEmail(env, { to: to || u.email, subject, text, html, app: "Account" }, opts);
  return true;
}

// "A new sign-in", to the account's phones (in InFlight, as InFlight says it, with where to sign it out) and by email,
// from the account, saying which app it was in
export async function tellSignIn(env, u, request, how, origin, inflight = true) {
  await logEvent(env, u.id, "signin", request, how);
  const device = deviceOf(request) || "a new phone";
  let where = regionOf(request.cf?.country);
  if (/^(United|Netherlands|Philippines|Czech|Bahamas|Gambia|Maldives|Seychelles|Marshall|Solomon|Central African|Dominican)/.test(where)) where = "the " + where;
  const on = `${device}${where ? ` in ${where}` : ""}`, account = inflight ? "Your InFlight account" : "Your account";
  await pushTo(env, u.id, { title: "New sign-in", body: `${account} was signed in on ${on}. Not you? ${inflight ? "Sign it out in Privacy & Security." : "Change your password."}`, tag: "signin", url: "/pigeon/#account" }).catch(() => {});
  const app = inflight ? "InFlight" : new URL(request.url).hostname.startsWith("weather.") ? "Weather" : "Account page";
  // (where it was, once, in the pill: the words and the details don't say it again)
  await accountMail(env, u, { title: "A new sign-in", subject: "A new sign-in to your account", pill: ["phone", [device, where.replace(/^the /, "")].filter(Boolean).join(" · ")],
    line: "someone just signed in to your account. If it was you, there’s nothing to do.",
    after: "If it wasn’t, sign out the devices you don’t know in Signed-in devices and change your password.",
    rows: [["Signed in to", app], ["How", how]],
    button: { label: "Review your account", url: `${accountPage(request, env)}/` } }, origin || linkOrigin(request)).catch(() => {});
}
