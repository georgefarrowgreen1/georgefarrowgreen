// Fitness's efforts held: a ride's power against the session it was for
import { test } from "node:test";
import assert from "node:assert/strict";
import { efforts, effortsSaid } from "../../../fitness/efforts.js";

const FTP = 250;
// a session: 10 min warm-up, 5 × (3 min at 110%, 2 min at 50%), 5 min cool-down
const steps = [{ kind: "warmup", secs: 600, from: 0.5, to: 0.7 }];
for (let i = 0; i < 5; i++) steps.push({ kind: "work", secs: 180, from: 1.1 }, { kind: "rest", secs: 120, from: 0.5 });
steps.push({ kind: "cooldown", secs: 300, from: 0.6, to: 0.4 });
// a ride of it: `before` seconds of riding first, each effort at `at(i)` of its target, a little noise
function ride(before, at = () => 1.02) {
  const out = Array.from({ length: before }, (_, s) => 140 + (s % 7));
  let k = 0;
  for (const st of steps) {
    const i = st.kind === "work" ? k++ : null;
    for (let s = 0; s < st.secs; s++) {
      const f = st.to != null ? st.from + ((st.to - st.from) * s) / st.secs : st.from;
      // (getting up to it takes a few seconds)
      const ramp = st.kind === "work" && s < 4 ? 0.6 : 1;
      out.push(Math.round(f * FTP * (i != null ? at(i) : 1) * ramp + ((s * 13) % 9) - 4));
    }
  }
  return [...out, ...Array.from({ length: 240 }, () => 120)];
}

test("every effort held, though the ride began 7 minutes before the session", () => {
  const e = efforts(steps, ride(420), FTP);
  assert.equal(e.n, 5); assert.equal(e.held, 5);
  assert.equal(effortsSaid(e), "All 5 efforts held");
  assert.ok(e.each.every((x) => Math.abs(x.got - 281) < 15));
});
test("the last two short: faded", () => {
  const e = efforts(steps, ride(60, (i) => (i >= 3 ? 0.85 : 1.02)), FTP);
  assert.equal(e.held, 3); assert.equal(e.faded, 2);
  assert.equal(effortsSaid(e), "3 of 5 held: faded on the last 2");
});
test("one missed in the middle: not a fade", () => {
  const e = efforts(steps, ride(0, (i) => (i === 1 ? 0.8 : 1.02)), FTP);
  assert.equal(e.held, 4); assert.equal(e.faded, 0);
  assert.equal(effortsSaid(e), "4 of 5 efforts held");
});
test("nothing to say: no hard steps, no power, or a ride much shorter than the session", () => {
  assert.equal(efforts([{ kind: "steady", secs: 3600, from: 0.65 }], ride(0), FTP), null);
  assert.equal(efforts(steps, [], FTP), null);
  assert.equal(efforts(steps, ride(0).slice(0, 900), FTP), null);
});
