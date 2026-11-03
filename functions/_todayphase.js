// Today's phase of the day (Today First, spec §7.1): which part of the day it is for an account at t, and the rest of
// its day as a timeline. Pure: it never reads the clock (t is passed in) and asks nothing of anyone; its times are
// walls in the account's zone (tz), worked out with functions/_todaycards.js localDay, offsetAt and dayAfter, which
// handle the clocks changing. The phases, highest first: riding (from the next ride's start until its activity
// arrives, or its cap), preride (40 minutes before a ride), after (90 minutes from an activity's arrival), evening
// (from eveningAt to the next dayStart), morning (dayStart to 11:00), midday (11:00 to eveningAt).
//   phaseOf(t, tz, { dayStart, eveningAt, rides: [{ start, stop, secs, sport, source, withId, who, hold }],
//     dones: [{ start, secs, dist, tss, from }] })
//   → { phase: "morning" | "midday" | "preride" | "riding" | "after" | "evening", since, until (the next boundary
//       known now; null while riding), timeline: [{ phase, at }] }
// (B0's stub: the same safe answer for anyone, so the routes and the page are built against its shape. Batch T1 writes
// it; the name and arguments stay.)
export function phaseOf(t, tz, inputs) {
  return { phase: "midday", since: t, until: null, timeline: [] };
}
