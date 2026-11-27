// Compare the workout's ordered steps with an imported recording. Device laps
// do not identify the planned steps, so the windows are elapsed/distance
// estimates. Power through pauses and missing pace samples stay unknown.
import { flatten } from "./workouts.js";

const MAX_STEPS = 1200;
const MAX_SAMPLES = 500_000;
const MAX_GAP = 10; // seconds, as in the activity's moving-time calculation
const MIN_COVERAGE = 0.8;
const TARGET_TOLERANCE = 0.06;
const EPSILON = 1e-6;
const positive = (x) => Number.isFinite(x) && x > 0;
const nonnegative = (x) => Number.isFinite(x) && x >= 0;

function planSteps(workout) {
  if (!Array.isArray(workout?.steps) || !workout.steps.length) return null;
  let count = 0;
  for (const step of workout.steps) {
    if (!step || typeof step !== "object") return null;
    if (step.repeat) {
      if (!positive(step.repeat) || !Array.isArray(step.steps) || !step.steps.length) return null;
      count += Math.ceil(step.repeat) * step.steps.length;
      if (count > MAX_STEPS) return null;
      if (step.steps.some((part) => !part || typeof part !== "object" || part.repeat)) return null;
    } else if (++count > MAX_STEPS) return null;
  }
  if (!count) return null;
  const steps = flatten(workout);
  return steps.every((step) => (positive(step.secs) && step.secs <= 86400)
    || (!positive(step.secs) && positive(step.metres) && step.metres <= 1e6)) ? steps : null;
}

function traceOf(recording) {
  const samples = recording?.s;
  const time = samples?.t;
  if ((!Array.isArray(time) && !ArrayBuffer.isView(time)) || !Number.isSafeInteger(time.length) || time.length < 2) {
    return { reason: "missing-recording" };
  }
  if (time.length > MAX_SAMPLES) return { reason: "recording-limit" };
  let prior = -Infinity;
  for (const value of time) {
    if (!nonnegative(value) || value <= prior) return { reason: "invalid-recording" };
    prior = value;
  }
  return { samples, first: time[0], last: prior, reason: null };
}

function lowerBound(values, target) {
  let lo = 0, hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Preserve observations on either side of a gap, but stop at a counter
// reset. Joining arbitrary reset distances could put steps in the wrong lap.
function distanceTrace(samples) {
  const time = [], metres = [];
  let last = 0, reset = false;
  for (let i = 0; i < samples.t.length; i++) {
    const value = samples.dist?.[i];
    if (!nonnegative(value)) continue;
    if (value < last - 1) {
      reset = true;
      break;
    }
    last = Math.max(last, value);
    time.push(samples.t[i]);
    metres.push(last);
  }
  return { time, metres, reset };
}

function interpolate(keys, values, at, maxGap, time) {
  const i = lowerBound(keys, at);
  if (i < keys.length && Math.abs(keys[i] - at) <= EPSILON) return values[i];
  if (i === 0 || i === keys.length || time[i] - time[i - 1] > maxGap) return null;
  return values[i - 1] + (values[i] - values[i - 1]) * (at - keys[i - 1]) / (keys[i] - keys[i - 1]);
}

function distanceWindow(trace, start, length, recordedEnd) {
  const distance = interpolate(trace.time, trace.metres, start, MAX_GAP, trace.time);
  if (distance === null) return { end: null, incomplete: false };
  const target = distance + length;
  const end = interpolate(trace.metres, trace.time, target, MAX_GAP, trace.time);
  if (end !== null) return { end, incomplete: false };
  const last = trace.time.length - 1;
  if (!trace.reset && trace.time[last] === recordedEnd && trace.metres[last] < target) {
    return { end: recordedEnd, incomplete: true };
  }
  return { end: null, incomplete: false };
}

function speedBetween(samples, i, gap) {
  const from = samples.dist?.[i], to = samples.dist?.[i + 1];
  return nonnegative(from) && nonnegative(to) && to >= from ? (to - from) / gap : null;
}

// Weight the observed sample spans by their duration. Boundary spans are
// clipped to the interval so a partially overlapping sample is counted once.
function measurement(samples, start, end, metric, pool) {
  let measuredSeconds = 0, total = 0;
  if (metric && samples && end > start) {
    for (let i = Math.max(0, lowerBound(samples.t, start) - 1); i + 1 < samples.t.length && samples.t[i] < end; i++) {
      const gap = samples.t[i + 1] - samples.t[i];
      let value;
      if (gap > MAX_GAP) {
        // A pool length can be recorded only at its turns. Its distance and
        // elapsed time give an average when the whole span is in this step.
        if (!pool || samples.t[i] < start || samples.t[i + 1] > end) continue;
        value = speedBetween(samples, i, gap);
        if (!positive(value)) continue;
      } else if (metric === "power") value = samples.pwr?.[i];
      else value = nonnegative(samples.spd?.[i]) ? samples.spd[i] : speedBetween(samples, i, gap);
      if (!nonnegative(value)) continue;
      const seconds = Math.min(end, samples.t[i + 1]) - Math.max(start, samples.t[i]);
      if (seconds <= 0) continue;
      measuredSeconds += seconds;
      total += value * seconds;
    }
  }
  const average = total / measuredSeconds;
  return { actual: nonnegative(average) ? average : null, measuredSeconds };
}

function targetFor(step, threshold) {
  if (step.kind === "free" || !positive(threshold) || !nonnegative(step.from) || !nonnegative(step.to)) return null;
  const from = step.from * threshold, to = step.to * threshold, average = (from + to) / 2;
  return positive(average) ? { from, to, average } : null;
}

function intervalStatus({ actual, measuredSeconds, recordedSeconds, target, partial }) {
  if (recordedSeconds === null) return "no-data";
  if (recordedSeconds === 0) return "not-recorded";
  if (partial) return "partial";
  if (actual === null || measuredSeconds + EPSILON < recordedSeconds * MIN_COVERAGE) return "no-data";
  if (!target) return "untargeted";
  if (actual < target.average * (1 - TARGET_TOLERANCE)) return "below-target";
  if (actual > target.average * (1 + TARGET_TOLERANCE)) return "above-target";
  return "on-target";
}

// `ftp` is in watts and `thresholdSpeed` in metres per second. The caller
// chooses the historical threshold or explicitly labels a current fallback.
// Pace targets and observations are returned as speeds for the UI formatter.
export function reviewWorkout(workout, recording, { ftp, thresholdSpeed } = {}) {
  const metric = workout?.sport === "ride" ? "power" : ["run", "swim"].includes(workout?.sport) ? "pace" : null;
  const trace = traceOf(recording);
  const recordedSeconds = trace.reason ? null : trace.last - trace.first;
  const empty = (reason) => ({ metric, alignment: null, plannedSeconds: null, recordedSeconds, reason, intervals: [] });
  if (workout?.sport && recording?.sport && recording.sport !== workout.sport) return empty("sport-mismatch");
  if (!metric) return empty(workout ? "unsupported-sport" : "missing-workout");
  const steps = planSteps(workout);
  if (!steps) return empty("invalid-plan");

  const distanceCount = steps.filter((step) => !positive(step.secs)).length;
  const alignment = distanceCount === 0 ? "elapsed" : distanceCount === steps.length ? "distance" : "mixed";
  const distance = distanceCount && trace.samples && distanceTrace(trace.samples);
  const threshold = metric === "power" ? ftp : thresholdSpeed;
  const pool = workout.sport === "swim" && recording?.indoor !== false && !trace.samples?.lat;
  let position = 0, ranOut = false;
  const intervals = steps.map((step, index) => {
    const plannedMetres = positive(step.metres) && !positive(step.secs) ? step.metres : null;
    const target = targetFor(step, threshold);
    const plannedSeconds = plannedMetres === null ? step.secs : metric === "pace" && target ? plannedMetres / target.average : null;
    const start = position;
    let end = null, incomplete = false;
    if (start !== null) {
      if (plannedMetres === null) end = start + step.secs;
      else if (distance) ({ end, incomplete } = distanceWindow(distance, start, plannedMetres, trace.last));
    }
    let observedFrom = 0, observedTo = 0, partial = false;
    let elapsed = trace.samples && ranOut ? 0 : null;
    if (trace.samples && start !== null) {
      if (start >= trace.last) elapsed = 0;
      else if (end !== null) {
        observedFrom = Math.max(start, trace.first);
        observedTo = Math.min(end, trace.last);
        elapsed = Math.max(0, observedTo - observedFrom);
        partial = incomplete || elapsed + EPSILON < end - start;
      }
    }
    const observed = measurement(trace.samples, observedFrom, observedTo, metric, pool);
    const status = intervalStatus({ ...observed, recordedSeconds: elapsed, target, partial });
    ranOut = ranOut || incomplete || (!!trace.samples && start !== null && start >= trace.last);
    position = incomplete ? null : end;
    return {
      index, name: step.name ?? null, kind: step.kind, rep: step.rep, plannedSeconds, plannedMetres,
      start, end: incomplete ? null : end, recordedSeconds: elapsed, ...observed, target, status,
    };
  });
  const plannedSeconds = intervals.every((row) => positive(row.plannedSeconds))
    ? intervals.reduce((total, row) => total + row.plannedSeconds, 0) : null;
  return { metric, alignment, plannedSeconds, recordedSeconds, reason: trace.reason, intervals };
}
