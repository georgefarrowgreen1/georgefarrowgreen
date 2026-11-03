// Notifications, from Today's You (Today First, spec §6.1, §10): the account page's own settings, read and changed
// through Today's routes, so You and the account page always say the same thing. Nothing of its own: the account page's
// reader and writer (functions/api/account/[[path]].js notifySettings, setNotify), with that page's checks and its
// limit on changes, which the two share (a change from You counts as one from the account page).
//   notifyGet(env, u) → notifySettings(env, u), exactly                                     (GET today/notify)
//   notifyPatch(env, u, body) → setNotify(env, u, body) (its own checks), then notifySettings of the account as it now is
//     (PATCH today/notify; body as setNotify takes it: { quiet }, { chat }, { weather }, { markets }, { fitness },
//     { today }: the morning; and Today's own, { mail: { inflite } }: Mail's notifications through InFlite, the site's
//     admin's alone, One roof stage 4, S4-D8, S4-D11)
// Mail's part: mail: { inflite } in the answer for the admin (the account page's mail: {} with it), from the account's
// notify_prefs (mail.inflite, off unless chosen), read by functions/_mailapp.js's mail/notice.
// u: the signed-in account, as the route's signedIn gives it (its pg_users row).
// (The account's router is asked for when first needed, not imported here: it spreads Today's routes into its own,
// and Today's routes import this, so a static import would have it run before Today's routes are there.)
import { HttpError, db, limit } from "./_pigeon.js";
import { prefsOf } from "./_notify.js";

const account = () => import("./api/account/[[path]].js");

// (the settings, with Mail's through-InFlite switch where the account page says Mail's there: its admin's, mail an object)
const withMail = (out, u) => (out && out.mail && typeof out.mail === "object" ? { ...out, mail: { ...out.mail, inflite: prefsOf(u).mail?.inflite === true } } : out);

export async function notifyGet(env, u) {
  const { notifySettings } = await account();
  return withMail(await notifySettings(env, u), u);
}
export async function notifyPatch(env, u, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Bad request.");
  // (the account page's own limit on its changes: You's and that page's together)
  await limit(env, "prefs:" + u.id, 120, 3600e3);
  const { notifySettings, setNotify } = await account();
  const { mail, ...rest } = body;
  if (mail !== undefined) {
    // (Mail's, the admin's alone: checked before anything's changed, so a refusal changes nothing)
    if (!mail || typeof mail !== "object" || Array.isArray(mail) || typeof mail.inflite !== "boolean") throw new HttpError(400, "Choose on or off.");
    const { adminOf } = await import("./api/pigeon/[[path]].js");
    const admin = await adminOf(env).catch(() => null);
    if (!admin || admin.id !== u.id) throw new HttpError(403, "Mail is the site’s admin’s alone.");
  }
  await setNotify(env, u, rest);
  if (mail !== undefined) await (await db(env)).prepare("UPDATE pg_users SET notify_prefs = json_patch(CASE WHEN json_valid(notify_prefs) THEN notify_prefs ELSE '{}' END, ?) WHERE id = ?")
    .bind(JSON.stringify({ mail: { inflite: mail.inflite } }), u.id).run();
  // (read again: Quiet Hours and Chat's kinds are on the account's row, which setNotify has just changed)
  const now = await (await db(env)).prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  if (!now) throw new HttpError(401, "Not signed in.", "session");
  return withMail(await notifySettings(env, now), now);
}
