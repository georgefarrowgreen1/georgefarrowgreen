// Who may edit the site's home page: its owner, which is the site's admin account (functions/api/pigeon adminOf), signed
// in on the site as for every app (the cookie for the whole site: functions/_account.js). There's no password of its own
// any more. A change must come from the site's own pages (sameOrigin): another page on the site would send the cookie too.
import { HttpError } from "./_pigeon.js";
import { cookieUser, sameOrigin } from "./_account.js";
import { adminOf, ADMIN_LOOK } from "./api/pigeon/[[path]].js";

// The account the browser's signed in to, and whether it's the owner's: { u, owner } (u null when no one is)
export async function visitor(request, env) {
  const u = await cookieUser(request, env);
  if (!u) return { u: null, owner: false };
  const admin = await adminOf(env).catch(() => null);
  return { u, owner: !!admin && admin.id === u.id };
}
// (a change to the page needs the owner to have shown it's them in the last 12 hours, as Admin's lists do: a phone left
// signed in, or a sign-in handed over from an app, doesn't do. The page sends them to the account's page for it first)
export const ownerFresh = (u) => Date.now() - (u?.authAt || 0) < ADMIN_LOOK;
// The owner, or a 403 (write: a change, which must come from the site's own pages)
export async function requireOwner(request, env, write = true) {
  const { u, owner } = await visitor(request, env);
  if (!owner) throw new HttpError(403, u ? "Only the site’s owner can change this." : "Sign in to change this.");
  if (write) {
    sameOrigin(request);
    if (!ownerFresh(u)) throw new HttpError(403, "Confirm it’s you on your account page first.", "reauth");
  }
  return u;
}
// An answer for an error a request ran into (an HttpError says what; anything else is the server's)
export function failed(e) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  throw e;
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    // (never kept by a cache unless a route says it may: some are the owner's alone)
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}
