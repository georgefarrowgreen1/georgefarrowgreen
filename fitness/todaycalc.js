// Today's figures that are worked out, not drawn (today.js draws them). Pure: no page, no network.

// How ready you are, out of 100: from your form (training stress balance), and the morning's check-in where it's all
// said (feel: { sleep, legs, mood }, each 0 poor, 1 so-so, 2 good). → { v, tone, word }
export function readinessOf(tsb, feel = null) {
  let v = 64 + tsb * 1.1;
  if (feel && ["sleep", "legs", "mood"].every((k) => feel[k] != null)) for (const k of ["sleep", "legs", "mood"]) v += feel[k] === 0 ? -11 : feel[k] === 2 ? 7 : 0;
  v = Math.round(Math.max(15, Math.min(97, v)));
  const tone = v >= 80 ? "good" : v >= 58 ? "steady" : "easy";
  return { v, tone, word: { good: "Ready", steady: "Steady", easy: "Go easy" }[tone] };
}
// A day of the week, as its ring has it: ridden, missed (planned, gone by, not ridden), still to come, or rest. A day
// before the plan (or Rhythm) began wasn't planned. id: what was planned (null for rest); did: activities that day.
export function dayKindOf({ day, today, began = -Infinity, id = null, did = 0 }) {
  const planned = day >= began ? id : null;
  return did ? "did" : planned && day < today ? "missed" : planned ? "plan" : "rest";
}
// A ride's ring in the colour of how hard it is, by its intensity factor: zone 2, 3, 4 or 6
export const toneOfIF = (iF) => (iF >= 0.95 ? "z6" : iF >= 0.84 ? "z4" : iF >= 0.76 ? "z3" : "z2");
