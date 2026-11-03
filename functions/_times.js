// Times agreed in Chat (Today First, spec §5.1, §6.3, §8.4): a call or a meeting offered or agreed with a friend, each
// person's own td_times row, never any words. The inviter's phone writes a 'pending' row as it sends the invite (with
// the other times it offered, opts); the friend's Yes, from their own phone, writes their own 'yes' row and turns the
// inviter's 'yes' at the chosen time in the same batch. Only 'yes' rows are ever read by Today.
//   timesFor(env, userId, from, to) → [{ id, kind, start, stop, tz, withId, who, role }]: 'yes' rows, until > now
//   timesAround(env, userId, t, ms) → the 'yes' rows within ms of t (Today's clash rule)
//   timesExport(env, userId) → every row of the account's, for its export
//   dropTimes(env, userId) → nothing (the account's rows gone, with the account)
//   addTime(env, u, row) → the caller's own row written ('pending' or 'yes')                (POST time-offer, batch CS)
//   promoteTime(env, inviterId, id, answererId, start, stop) → the inviter's pending row made 'yes' at the chosen time,
//     only for that friend and only at a time the invite offered
// (B0's stub: the reads find nothing and the writes answer 501 "Not built yet." B0's second part writes the table and
// the reads in full, then batch CS addTime and promoteTime; the names and arguments stay.)
import { HttpError } from "./_http.js";

export async function timesFor(env, userId, from, to) {
  return [];
}
export async function timesAround(env, userId, t, ms) {
  return [];
}
export async function timesExport(env, userId) {
  return [];
}
export async function dropTimes(env, userId) {}

export async function addTime(env, u, row) {
  throw new HttpError(501, "Not built yet.");
}
export async function promoteTime(env, inviterId, id, answererId, start, stop) {
  throw new HttpError(501, "Not built yet.");
}
