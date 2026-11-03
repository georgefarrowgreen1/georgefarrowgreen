// A ride's weather, for Today's cards (Today First, spec §7.3): the hours across the ride (functions/_fitwx.js hoursAt,
// fitness/besttime.js isWet and hourScore), whether the roads are wet (a wet hour in the three before it starts), a
// jacket (feels-like under the ride's limit, or a 30% chance of rain in its first hour), and the words for it.
//   rideWx(env, u, ride: { start, stop, secs, sport }, t) → { out, roads, jacket, words, hours } or null (no place, no
//     forecast)
// (B0's stub: null, as for a ride with no forecast. Batch T1 writes it; the name and arguments stay.)
export async function rideWx(env, u, ride, t) {
  return null;
}
