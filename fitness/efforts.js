// Were the efforts held? A ride against the session it was for: the session's steps laid over the ride's power where
// they fit it best (a ride starts when you press start, not when the session does), then each hard step ("work") said
// held or not, by its average power after the first moments of getting up to it. Pure: no page, no network.

const B = 5;   // (seconds a bucket, for lining them up)

// steps: the session's, in order (workouts.js flatten: { secs, from, to, kind }); pwr: the ride's watts, a second
// each; ftp. → { n, held, each: [{ at, secs, target, got, held }], faded } or null where it can't be said (no hard
// steps, no power, or a ride much shorter than the session)
export function efforts(steps, pwr, ftp) {
  if (!steps?.length || !pwr?.length || !ftp) return null;
  const plan = [];
  let t = 0;
  for (const s of steps) { const secs = Math.round(s.secs || 0); if (secs > 0) plan.push({ start: t, secs, w: (((s.from ?? 0) + (s.to ?? s.from ?? 0)) / 2) * ftp, work: s.kind === "work" }); t += secs; }
  const total = t;
  if (!plan.some((p) => p.work) || pwr.length < total * 0.85) return null;
  // (the plan and the ride, in buckets: the ride's capped, so a sprint doesn't pull the fit about)
  const nb = Math.ceil(total / B), target = new Float64Array(nb);
  for (const p of plan) for (let s = p.start; s < p.start + p.secs; s++) target[Math.floor(s / B)] += p.w / B;
  const na = Math.ceil(pwr.length / B), got = new Float64Array(na), cap = ftp * 1.6;
  for (let s = 0; s < pwr.length; s++) got[Math.floor(s / B)] += Math.min(cap, Math.max(0, pwr[s] || 0)) / B;
  // (where the plan sits in the ride: the offset with the least difference)
  let best = 0, bestD = Infinity;
  for (let o = 0; o + nb <= na; o++) {
    let d = 0;
    for (let i = 0; i < nb && d < bestD; i++) d += Math.abs(got[o + i] - target[i]);
    if (d < bestD) { bestD = d; best = o; }
  }
  const off = best * B;
  const each = plan.filter((p) => p.work).map((p) => {
    // (the first moments of each effort are getting up to it: not counted)
    const lead = Math.min(p.secs * 0.2, p.secs >= 120 ? 30 : 5), from = off + p.start + Math.round(lead), to = off + p.start + p.secs;
    let sum = 0, n = 0;
    for (let s = from; s < to && s < pwr.length; s++) { sum += pwr[s] || 0; n++; }
    const g = n ? sum / n : 0;
    return { at: p.start, secs: p.secs, target: Math.round(p.w), got: Math.round(g), held: g >= p.w * 0.94 };
  });
  const held = each.filter((e) => e.held).length;
  // (the ones missed, at the end: faded, rather than missed here and there)
  let faded = 0;
  for (let i = each.length - 1; i >= 0 && !each[i].held; i--) faded++;
  // (how hard they were, on average, against their targets; and the targets, as watts)
  const ratio = each.reduce((a, e) => a + e.got / e.target, 0) / each.length, aim = each.reduce((a, e) => a + e.target, 0) / each.length;
  return { n: each.length, held, each, faded: held && faded === each.length - held ? faded : 0, ratio, target: aim };
}
// in words: "All 26 efforts held", "24 of 26 held: faded on the last 2", "18 of 26 efforts held"
export function effortsSaid(e) {
  if (!e) return null;
  if (e.held === e.n) return e.n === 1 ? "The effort held" : `All ${e.n} efforts held`;
  if (e.faded) return `${e.held} of ${e.n} held: faded on the last ${e.faded === 1 ? "one" : e.faded}`;
  return `${e.held} of ${e.n} efforts held`;
}
