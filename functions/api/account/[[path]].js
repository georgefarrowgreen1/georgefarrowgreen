// The account's own API, for its page at account.georgefarrowgreen.com (functions/_acctapp.js), and only there:
//   GET  /api/account/me              who's signed in: the profile, passkeys, signed-in devices, and the apps
//   (signing in and out, and the profile: functions/_accountapi.js)
//   POST /api/account/reauth          showing it's you again (password or passkey), for the few things that need it
//   POST /api/account/password/vault  the password-locked key, for the password's proof (to lock it anew with a new one)
//   POST /api/account/password        a new password: its proof, and the key locked with it
//   GET  /api/account/pwned           Pwned Passwords, by the first 5 characters of a hash (as InFlight asks)
//   POST /api/account/passkeys/options, passkeys, passkeys/remove
//   POST /api/account/devices/end     signing out a device, or all the others
//   POST /api/account/delete          the account deleted, everywhere
// It acts only with the site's cookie (functions/_account.js), and only from the page's own address. What could hurt if
// someone had only your sign-in (a passkey added, a device signed out, the account deleted) needs you to have shown it's
// you in the last 10 minutes, as in InFlight; a new password needs the old one.
import { HttpError, db, limit, clientIp, requireFresh, FRESH, newChallenge, rpIdFor, checkClientData, verifyAssertion, b64url, fromB64url,
  linkOrigin, emailReady, emailBody, sendEmail, ukTime, deviceOf } from "../../_pigeon.js";
import { cookieUser, withCookie, withoutSession, sameOrigin } from "../../_account.js";
import { accountRoutes, json, body, signedIn } from "../../_accountapi.js";
import { proofHash, proofOk, lockVault, openVault } from "../../_atrest.js";
import { removeAccount } from "../../_accounts.js";
import { isAccount } from "../../_acctapp.js";
import { wxdb } from "../../_wxpush.js";

// The account as its page shows it
async function view(env, u) {
  const D = await db(env);
  const [{ results: pks }, { results: ss }] = await Promise.all([
    D.prepare("SELECT id, label, created_at, used_at FROM pg_passkeys WHERE user_id = ? ORDER BY created_at").bind(u.id).all(),
    D.prepare("SELECT hash, label, place, created_at, seen_at FROM pg_sessions WHERE user_id = ? ORDER BY hash = ? DESC, seen_at DESC").bind(u.id, u.sessionHash).all(),
  ]);
  // (the apps: what each has of yours, in a word)
  const wx = await (await wxdb(env)).prepare("SELECT data FROM wx_accts WHERE user_id = ?").bind(u.id).first().catch(() => null);
  let places = 0; try { places = wx ? JSON.parse(wx.data).places.length : 0; } catch (_) {}
  return {
    signedIn: true, id: u.id, name: u.name, handle: u.handle, email: u.email, emailOk: !!u.email_ok, photoAt: u.avatar_at || null, since: u.created_at,
    fresh: Date.now() - (u.authAt || 0) < FRESH, salt: u.salt,
    passkeys: pks.map((p) => ({ id: p.id, label: p.label || "Passkey", createdAt: p.created_at, usedAt: p.used_at || null })),
    devices: ss.map((x) => ({ id: x.hash.slice(0, 16), label: x.label || "A phone or browser", place: x.place || null, since: x.created_at, seenAt: x.seen_at, current: x.hash === u.sessionHash })),
    apps: { weather: { places } },
  };
}
// a word to the account's email when its password or passkeys change (as the account's: the same whichever app)
async function tell(env, u, { title, line, subject, rows = [] }, origin) {
  if (!emailReady(env) || !u.email_ok) return;
  const { text, html } = emailBody({ origin, icon: "shield", title, preheader: line,
    lines: [`Hi ${String(u.name).trim().split(/\s+/)[0]}, ${line}`, "If this wasn’t you, change your password straight away, at account.georgefarrowgreen.com."],
    rows: [["Account", `@${u.handle}`], ...rows, ["When", ukTime(Date.now())]] });
  await sendEmail(env, { to: u.email, subject, text, html }).catch(() => {});
}
const saltOk = (s) => { const m = /^(a2:)?([A-Za-z0-9_-]{22})$/.exec(String(s || "")); return !!m && fromB64url(m[2]).length === 16; };

const ROUTES = {
  "GET me": async ({ request, env }) => {
    const u = await cookieUser(request, env);
    if (!u) return json({ signedIn: false });
    return withCookie(json(await view(env, u)), request, env, u.token);
  },
  ...accountRoutes(view),
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
    await D.prepare("UPDATE pg_sessions SET auth_at = ? WHERE hash = ?").bind(Date.now(), u.sessionHash).run();
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
  // a new password: the old one's proof, the new one's salt and proof, and the key locked with it. Every other sign-in
  // ends (this one stays), as anywhere a password's changed.
  "POST password": async ({ request, env, waitUntil }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    await limit(env, "pwchange:" + u.id, 10, 60 * 60e3);
    if (!(await proofOk(env, b.oldProof, u.proof_hash))) throw new HttpError(401, "Your current password isn’t right.", "current");
    const vault = String(b.vault || "");
    if (!saltOk(b.salt) || fromB64url(b.proof).length !== 32 || vault.length < 20 || vault.length > 4000) throw new HttpError(400, "This page sent an incomplete request. Reload and try again.");
    const D = await db(env);
    await D.batch([
      D.prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ? WHERE id = ?").bind(b.salt, await proofHash(env, b.proof), await lockVault(env, u.id, vault), u.id),
      D.prepare("DELETE FROM pg_sessions WHERE user_id = ? AND hash != ?").bind(u.id, u.sessionHash),
      D.prepare("DELETE FROM pg_resets WHERE user_id = ?").bind(u.id),
    ]);
    waitUntil(tell(env, u, { title: "Your password was changed", line: "the password for your account was just changed.", subject: "Your password was changed" }, linkOrigin(request)));
    return json(await view(env, { ...u, salt: b.salt }));
  },
  // Has a password turned up in a data breach? Only the first 5 characters of its SHA-1 are asked (k-anonymity), padded
  "GET pwned": async ({ request, env }) => {
    await limit(env, "pwned:" + clientIp(request), 40, 15 * 60e3);
    const p = new URL(request.url).searchParams.get("p") || "";
    if (!/^[0-9A-F]{5}$/.test(p)) throw new HttpError(400, "Send the first 5 characters of the hash.");
    const r = await fetch(`${env.PWNED_URL || "https://api.pwnedpasswords.com"}/range/${p}`, { headers: { "Add-Padding": "true", "User-Agent": "georgefarrowgreen.com account" } }).catch(() => null);
    return new Response(r?.ok ? await r.text() : "", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" } });
  },
  // passkeys: a new one (for signing in everywhere on the site), and taking one away
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
    const D = await db(env), label = String(b.label || deviceOf(request) || "Passkey").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 40);
    if (await D.prepare("SELECT 1 FROM pg_passkeys WHERE id = ?").bind(b.id).first()) throw new HttpError(409, "This passkey is already saved.");
    await D.prepare("INSERT INTO pg_passkeys (id, user_id, public_key, alg, label, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(b.id, u.id, String(b.publicKey), b.alg, label, Date.now()).run();
    waitUntil(tell(env, u, { title: "A passkey was added", line: `a new passkey (“${label}”) can now sign in to your account.`, subject: "A passkey was added to your account" }, linkOrigin(request)));
    return json(await view(env, u));
  },
  "POST passkeys/remove": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    requireFresh(u);
    await (await db(env)).prepare("DELETE FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id || ""), u.id).run();
    return json(await view(env, u));
  },
  // signing out a device (by the start of its session's id), or every one but this
  "POST devices/end": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request), D = await db(env);
    requireFresh(u);
    if (b.others) await D.prepare("DELETE FROM pg_sessions WHERE user_id = ? AND hash != ?").bind(u.id, u.sessionHash).run();
    else {
      const id = String(b.id || "");
      if (!/^[0-9a-f]{16}$/.test(id)) throw new HttpError(400, "That sign-in wasn’t found.");
      await D.prepare("DELETE FROM pg_sessions WHERE user_id = ? AND hash != ? AND substr(hash, 1, 16) = ?").bind(u.id, u.sessionHash, id).run();
    }
    return json(await view(env, u));
  },
  // the account deleted: everything, in every app; the browser signed out
  "POST delete": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    requireFresh(u);
    if (String(b.confirm || "").trim().replace(/^@/, "").toLowerCase() !== u.handle) throw new HttpError(400, `Type ${u.handle} to confirm.`, "confirm");
    await removeAccount(env, u.id);
    return withoutSession(json({ ok: true }), request, env);
  },
};

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url), parts = [].concat(ctx.params.path || []), route = ROUTES[`${ctx.request.method} ${parts.join("/")}`];
  // (only at the account's own address)
  if (!route || !isAccount(url, ctx.env)) return json({ error: "Not found." }, 404);
  try { return await route(ctx); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    console.error("account api", e && (e.stack || e.message));
    return json({ error: "Something went wrong. Try again in a moment." }, 500);
  }
}
