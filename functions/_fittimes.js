// A planned ride's time of day (Today First, spec §5.1, §5.2): fx_times, kept outside fx_state, so an older Fitness
// saving its record whole loses nothing. Every row is one a person chose: Ride At in Fitness (set), Ride Then on Today
// (today), or one of those moved by Today's clash rule (moved). Nothing writes a row here without a tap, so every
// fx_times row counts as an explicit ride. And the one place that says what an explicit ride is: every fx_times row,
// and an fx_offers row with state 'yes' that a person's tap put there (Fitness's Add on an asked or answered offer, or
// Today's Take or Keep on one of its own, taken = 1). An agreed plan still 'new' is a known ride, not an explicit one.
//   timeFor(env, userId, day) → { day, start, stop, tz, sport, source } or null
//   timesOf(env, userId, fromDay, toDay) → [{ day, start, stop, tz, sport, source }]
//   setTime(env, userId, { day, start, stop, tz, sport = "ride", source }) → the row as kept (source set, today or
//     moved; start on the five minutes; 15 minutes to 6 hours long; each write first drops the account's rows that
//     ended over 8 days ago)
//   dropTime(env, userId, day) → nothing
//   EXPLICIT_OFFER: the SQL condition for an explicit offer, written against the alias o
//   explicitRide(row) → whether an fx_times row (the one with source) or an fx_offers row is an explicit ride
// (B0's stub: the reads find nothing and setTime answers 501 "Not built yet."; EXPLICIT_OFFER and explicitRide are
// final. B0's second part writes the table and the rest in full, then batch F owns it; the names and arguments stay.)
import { HttpError } from "./_http.js";

export const EXPLICIT_OFFER = "o.state = 'yes' AND (o.role IN ('asked','answered') OR o.taken = 1)";
export const explicitRide = (r) => r.source != null || (r.state === "yes" && (r.role === "asked" || r.role === "answered" || Number(r.taken) === 1));

export async function timeFor(env, userId, day) {
  return null;
}
export async function timesOf(env, userId, fromDay, toDay) {
  return [];
}
export async function setTime(env, userId, row) {
  throw new HttpError(501, "Not built yet.");
}
export async function dropTime(env, userId, day) {}
