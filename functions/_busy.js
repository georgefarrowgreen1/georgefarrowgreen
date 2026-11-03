// Holding a person's notifications while they ride (Today First, spec §8.7). Only an explicit ride holds anything
// (functions/_fittimes.js: every fx_times row, and an fx_offers row matching EXPLICIT_OFFER), from 10 minutes before its
// start until an activity of theirs since 40 minutes before it (fx_acts, fx_garmin_new, fx_strava_new), or its cap
// (start + the longer of 2 hours and its length + 30 minutes). Its level is the account's holdRide rule (td_rules; no
// row, or no table: do): at do friends and apps are held, at suggest apps only, at quiet nothing. Warnings always pass.
//   busyMap(D, userIds, t) → Map(userId → { until, level, rideStart }), in one statement, for those busy at t
//   busyNow(env, userId, t) → { until, level, rideStart } or null
//   heldCount(env, userId, since) → how many pushes were held for the account since then
//   heldAdd(env, userId, n) → nothing (td_rules.held counted up)
// (B0's stub: nobody is ever busy and nothing is ever held, so every sender behaves as it does now. Batch N writes it;
// the names and arguments stay.)
export async function busyMap(D, userIds, t) {
  return new Map();
}
export async function busyNow(env, userId, t) {
  return null;
}
export async function heldCount(env, userId, since) {
  return 0;
}
export async function heldAdd(env, userId, n) {}
