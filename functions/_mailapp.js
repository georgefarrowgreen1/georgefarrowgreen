// Mail (email.inflite.ai): the site's own inbox, its admin's alone. Mail is a Worker of its own (the inflite repo's
// email/), not part of this project, so it asks here, at the account's address, passing on what its page sent it: the
// browser's cookie for the site, its Origin, and who it is (the browser's own words for it). Signing in is the
// account's page's, as for every app (functions/_handback.js, app "mail"): Mail sends you there and swaps the code it's
// handed back with for a sign-in here, given to the browser as the site's cookie (Mail's server passes it on).
//   GET  /api/account/mail/me         who the cookie's account is, and whether it may open Mail: the site's admin, with a
//                                     passkey, that's shown it's them in the last 12 hours (as Admin's lists need)
//   POST /api/account/mail/handback   the code Mail was handed back with, and its word: the sign-in, as the cookie
//   POST /api/account/mail/signout    the site's sign-in ended (so everywhere it was shared)
// (functions/_pigeon.js appKey knows these as Mail's, so a sign-in handed over to a browser signed in to nothing, which is
// the account's page's alone until it's shown it's you there, doesn't open Mail)

import { HttpError, db, hex, sha256, issueSession } from "./_pigeon.js";
import { cookieUser, withCookie, withSession, withoutSession } from "./_account.js";
import { takeHandback } from "./_handback.js";
import { json, body } from "./_accountapi.js";
import { appOrigin } from "./_sites.js";
import { adminOf, ADMIN_LOOK } from "./api/pigeon/[[path]].js";

// (a change, only from Mail's own page: its server passes the browser's Origin on, which a page elsewhere can't make
// Mail's)
function fromMail(request, env) {
  if (request.headers.get("Origin") !== appOrigin("email", env, request)) throw new HttpError(403, "That request didn’t come from Mail.");
}

// The account as Mail needs it: whether it's the admin's, with a passkey on it, and shown it's them lately (fresh)
async function mailView(env, u) {
  const admin = await adminOf(env).catch(() => null), isAdmin = !!admin && admin.id === u.id;
  return {
    signedIn: true, admin: isAdmin, passkey: isAdmin && admin.passkeys > 0, fresh: Date.now() - (u.authAt || 0) < ADMIN_LOOK,
    name: u.name, handle: u.handle, email: isAdmin ? u.email : null, photoAt: u.avatar_at || null,
  };
}

export const MAIL_ROUTES = {
  "GET mail/me": async ({ request, env }) => {
    const u = await cookieUser(request, env);
    return json(u ? await mailView(env, u) : { signedIn: false });
  },
  // (as Fitness's: where the browser shares the site's sign-in, it's the one the page just made; where it doesn't (a
  // Home Screen app), one of Mail's own, no fresher than the page's)
  "POST mail/handback": async ({ request, env }) => {
    fromMail(request, env);
    const { row, u, authAt } = await takeHandback(env, request, "mail", await body(request));
    const c = await cookieUser(request, env).catch(() => null);
    if (c && c.sessionHash === row.session) return withCookie(json(await mailView(env, c)), request, env, c.token);
    const token = await issueSession(env, u.id, request, authAt);
    return withSession(json(await mailView(env, { ...u, authAt })), request, env, hex(await sha256(token)), true);
  },
  "POST mail/signout": async ({ request, env }) => {
    fromMail(request, env);
    const u = await cookieUser(request, env, false, { deleting: true });
    if (u) await (await db(env)).prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.sessionHash).run();
    return withoutSession(json({ ok: true }), request, env);
  },
};
