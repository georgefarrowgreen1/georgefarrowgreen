// The account's own routes, answered the same way by every page on the site that keeps no session of its own (Weather,
// and the account's page at account.georgefarrowgreen.com): signing in (salt and password, or options and passkey: on
// the account's page only, where every app on the site signs in) and out, and the profile (your photo, name and handle:
// functions/_profile.js). They act only with the site's cookie (functions/_account.js), and only from the page's own
// address (sameOrigin). view(env, u): the account as that page shows it.

import { HttpError, json as pjson, db, issueSession, newChallenge, rpIdFor, limit, clientIp, hex, sha256 } from "./_pigeon.js";
import { linkOrigin } from "./_email.js";
import { cookieUser, sameOrigin, withSession, withoutSession, saltFor, passwordUser, passkeyUser, tellSignIn } from "./_account.js";
import { setName, setHandle, putPhoto, dropPhoto, photoOf, putPoster, setFocus, posterKey, cleanFocus } from "./_profile.js";

// (answers about the account: never kept by anything in between, and for this page's own address alone)
export const json = (o, status = 200) => { const r = pjson(o, status); r.headers.set("Cross-Origin-Resource-Policy", "same-origin"); return r; };
// a small JSON object
export async function body(request, max = 64 * 1024) {
  if (Number(request.headers.get("Content-Length")) > max) throw new HttpError(413, "Too big.");
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Too big.");
  try { const b = JSON.parse(text || "{}"); if (b && typeof b === "object" && !Array.isArray(b)) return b; } catch (_) {}
  throw new HttpError(400, "Bad request.");
}
export async function signedIn(request, env, { deleting = false } = {}) {
  const u = await cookieUser(request, env, false, { deleting });
  if (!u) throw new HttpError(401, "Not signed in.", "session");
  return u;
}

// (deleting: an account being deleted signs in here, to keep it: the account's own page; signIn: false for a page
// that doesn't sign in itself, as every app on the site now signs in on the account's page: functions/_handback.js)
export function accountRoutes(view, { onSignOut = null, deleting = false, signIn = true } = {}) {
  // a sign-in done here: the site's, given to the browser, and said to the account's phones and email as the account's,
  // or as the app's it's for, where an app sent you here to sign in (app: "inflight" or "weather")
  // (the session's own token's never given out here: only the cookie's)
  async function started(request, env, waitUntil, u, how, app) {
    const token = await issueSession(env, u.id, request), hash = hex(await sha256(token));
    waitUntil(tellSignIn(env, u, request, how, linkOrigin(request), app === "inflight", app === "weather" ? "weather" : null).catch(() => {}));
    return withSession(json(await view(env, { ...u, sessionHash: hash, authAt: Date.now() })), request, env, hash);
  }
  const ins = {
    "POST signin/salt": async ({ request, env }) => { sameOrigin(request); return json({ salt: await saltFor(env, request, (await body(request)).email) }); },
    "POST signin/password": async ({ request, env, waitUntil }) => {
      sameOrigin(request);
      const b = await body(request);
      return started(request, env, waitUntil, await passwordUser(env, request, b, { deleting }), "Password", b.app);
    },
    "POST signin/options": async ({ request, env }) => {
      sameOrigin(request);
      await limit(env, "pkopt:" + clientIp(request), 60, 15 * 60e3);
      return json({ challenge: await newChallenge(env, "login"), rpId: rpIdFor(request, env) });
    },
    "POST signin/passkey": async ({ request, env, waitUntil }) => {
      sameOrigin(request);
      const b = await body(request);
      return started(request, env, waitUntil, (await passkeyUser(env, request, b, { deleting })).u, "Passkey", b.app);
    },
  };
  return {
    ...(signIn ? ins : {}),
    // signing out: the site's sign-in ended (so everywhere it was shared)
    "POST signout": async ({ request, env }) => {
      sameOrigin(request);
      const u = await cookieUser(request, env, false, { deleting: true }), b = await body(request);
      if (u) {
        await (await db(env)).prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.sessionHash).run();
        if (onSignOut) await onSignOut(env, u, b);
      }
      return withoutSession(json({ ok: true }), request, env);
    },
    // the profile: your photo (as an image, for this page only), and changes to it, your name and your handle
    "GET me/photo": async ({ request, env }) => {
      const u = await signedIn(request, env), res = await photoOf(env, u.id, { "Cross-Origin-Resource-Policy": "same-origin" });
      return res || json({ error: "No photo." }, 404);
    },
    "PUT me/photo": async ({ request, env }) => {
      sameOrigin(request);
      const u = await signedIn(request, env), t = await putPhoto(env, u, request);
      return json(await view(env, { ...u, avatar_at: t, poster_at: null, poster_focus: null }));
    },
    // (the poster: the same photo larger, for the account's page, and the point of it that stays in view)
    "GET me/poster": async ({ request, env }) => {
      const u = await signedIn(request, env), res = await photoOf(env, u.id, { "Cross-Origin-Resource-Policy": "same-origin" }, posterKey);
      return res || json({ error: "No photo." }, 404);
    },
    "PUT me/poster": async ({ request, env }) => {
      sameOrigin(request);
      const u = await signedIn(request, env), focus = new URL(request.url).searchParams.get("focus");
      const t = await putPoster(env, u, request, focus);
      return json(await view(env, { ...u, poster_at: t, poster_focus: cleanFocus(focus) }));
    },
    "PATCH me/poster": async ({ request, env }) => {
      sameOrigin(request);
      const u = await signedIn(request, env), f = await setFocus(env, u, (await body(request, 1024)).focus);
      return json(await view(env, { ...u, poster_focus: f }));
    },
    "DELETE me/photo": async ({ request, env }) => {
      sameOrigin(request);
      const u = await signedIn(request, env);
      await dropPhoto(env, u);
      return json(await view(env, { ...u, avatar_at: null, poster_at: null, poster_focus: null }));
    },
    "PATCH me/profile": async ({ request, env }) => {
      sameOrigin(request);
      const u = await signedIn(request, env), b = await body(request, 4096), now = { ...u };
      if (b.name !== undefined) now.name = await setName(env, u, b.name);
      if (b.handle !== undefined) now.handle = await setHandle(env, u, b.handle);
      return json(await view(env, now));
    },
  };
}
