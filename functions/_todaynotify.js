// Notifications, from Today's You (Today First, spec §6.1, §10): the account page's own settings, read and changed
// through Today's routes, so You and the account page always say the same thing.
//   notifyGet(env, u) → notifySettings(env, u), exactly (functions/api/account/[[path]].js)        (GET today/notify)
//   notifyPatch(env, u, body) → setNotify(env, u, body) (its own checks), then notifySettings(env, u)
//     (PATCH today/notify; body as setNotify takes it: { quiet }, { chat }, { weather }, { markets }, today's morning)
// (B0's stub: 501 "Not built yet.", so You hides Notifications by App until batch T2 writes it; the names and arguments
// stay.)
import { HttpError } from "./_http.js";

export async function notifyGet(env, u) {
  throw new HttpError(501, "Not built yet.");
}
export async function notifyPatch(env, u, body) {
  throw new HttpError(501, "Not built yet.");
}
