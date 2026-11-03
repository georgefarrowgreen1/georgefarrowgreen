// Today's day, version 2 of the answer (Today First, spec §7.1, §7.2): what GET today/cards?v=2 adds to the four
// cards, worked out by functions/_todaycards.js cardsFor when it's asked with { v: 2 }.
//   dayInputs(env, u, t, tz, cards) → the phase engine's inputs (functions/_todayphase.js phaseOf): { dayStart,
//     eveningAt, rides (today's explicit rides only: functions/_fittimes.js explicitRide), dones (functions/_fitshare.js
//     donesIn) }
//   dayFor(env, u, t, cards, { request, tz }) → { v: 2, phase, since, until, timeline, tops, waiting, upcoming, acts,
//     planning?, ride, quiet, apps }, merged into the answer. Never words of a message (waiting names who and when);
//     never an amount (Markets' cards carry percents). The day's plan (functions/_todayacts.js planDay) runs inside
//     env.waitUntil on the first read after dayStart, never awaited, and the answer says planning: true meanwhile.
// (B0's stub: nothing added, so an answer asked with v=2 is version 1's until batch T1 writes it. The names and
// arguments stay.)
export async function dayInputs(env, u, t, tz, cards) {
  return {};
}
export async function dayFor(env, u, t, cards, opts = {}) {
  return {};
}
