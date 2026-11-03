// Notifications, from Today's You (Today First, spec §6.1, §10): the account page's own settings, read and changed
// through Today's routes, so You and the account page always say the same thing. Nothing of its own: the account page's
// reader and writer (functions/api/account/[[path]].js notifySettings, setNotify), with that page's checks and its
// limit on changes, which the two share (a change from You counts as one from the account page).
//   notifyGet(env, u) → notifySettings(env, u), exactly                                     (GET today/notify)
//   notifyPatch(env, u, body) → setNotify(env, u, body) (its own checks), then notifySettings of the account as it now is
//     (PATCH today/notify; body as setNotify takes it: { quiet }, { chat }, { weather }, { markets }, { fitness },
//     { today }: the morning)
// u: the signed-in account, as the route's signedIn gives it (its pg_users row).
// (The account's router is asked for when first needed, not imported here: it spreads Today's routes into its own,
// and Today's routes import this, so a static import would have it run before Today's routes are there.)
import { HttpError, db, limit } from "./_pigeon.js";

const account = () => import("./api/account/[[path]].js");

export async function notifyGet(env, u) {
  const { notifySettings } = await account();
  return notifySettings(env, u);
}
export async function notifyPatch(env, u, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Bad request.");
  // (the account page's own limit on its changes: You's and that page's together)
  await limit(env, "prefs:" + u.id, 120, 3600e3);
  const { notifySettings, setNotify } = await account();
  await setNotify(env, u, body);
  // (read again: Quiet Hours and Chat's kinds are on the account's row, which setNotify has just changed)
  const now = await (await db(env)).prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  if (!now) throw new HttpError(401, "Not signed in.", "session");
  return notifySettings(env, now);
}
