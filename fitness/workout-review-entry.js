import * as account from "./account.js";
import { startOfDay, WORKOUTS } from "./workouts.js";
import { reviewWorkout } from "./workout-review.js";
import { suggestWorkoutReviewMove } from "./workout-review-schedule.js";
import { workoutReviewView } from "./workout-review-view.js";

let styles;
function loadStyles(doc) {
  if (styles) return styles;
  const url = new URL("./workout-review.css", import.meta.url);
  url.search = new URL(import.meta.url).search;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = url.href;
  styles = new Promise((resolve) => {
    const done = (loaded) => {
      clearTimeout(timeout);
      link.onload = link.onerror = null;
      if (!loaded) {
        link.remove();
        styles = null;
      }
      resolve();
    };
    const timeout = setTimeout(() => done(false), 3000);
    link.onload = () => done(true);
    link.onerror = () => done(false);
    doc.head.append(link);
  });
  return styles;
}

function workoutTargets(activity, profile) {
  const field = { ride: "ftp", run: "runPace", swim: "css" }[activity.sport];
  const valid = (value) => Number.isFinite(value) && value > 0;
  const recorded = field && activity.sum?.[field];
  const value = valid(recorded) ? recorded : field && profile[field];
  if (!valid(value)) return { options: {}, basis: null };
  const label = field === "ftp" ? "FTP" : field === "css" ? "swim threshold pace" : "run threshold pace";
  return {
    options: field === "ftp" ? { ftp: value } : { thresholdSpeed: (field === "css" ? 100 : 1000) / value },
    basis: `${valid(recorded) ? "Saved" : "Current"} ${label}${field === "ftp" ? ` · ${Math.round(value)} W` : ""}`,
  };
}

export async function openActivityWorkoutReview(activity, recording, {
  trigger, state, profile, metric, current, today, plannedOn, workoutById, rhythm, actsOn, openMove, show,
}) {
  const owner = state.me?.id;
  await loadStyles(trigger.ownerDocument);
  if (!current() || !trigger.isConnected || state.me?.id !== owner) return;
  const recordedWorkout = activity.workout ? workoutById(activity.workout) : null;
  const scheduledId = plannedOn(startOfDay(activity.start));
  const suggestedWorkout = scheduledId && scheduledId !== "event" ? workoutById(scheduledId) : null;
  const workouts = [...(state.mine || []), ...WORKOUTS];
  const writable = owner && !activity.sample;
  const { options, basis } = workoutTargets(activity, profile);
  let view;
  const active = () => current() && state.me?.id === owner && (!view || view.isConnected);
  view = workoutReviewView({
    activity, recordedWorkout, suggestedWorkout, workouts, resolveWorkout: workoutById,
    compare: (workout) => reviewWorkout(workout, recording, options),
    targetBasis: basis, metric, current: active,
    loadReview: writable ? () => account.loadReview(activity.id, owner) : null,
    saveReview: writable ? (review, base) => account.saveReview(activity.id, owner, base, review) : null,
    scheduleSuggestion: writable ? ({ review }) => {
      const move = suggestWorkoutReviewMove({
        activity, effort: review.effort, state, today, days: rhythm()?.days, plannedOn, workoutById, actsOn,
      });
      return move && {
        title: "Review your next hard session",
        detail: move.label,
        open: () => { if (active()) return openMove(move); },
      };
    } : null,
  });
  show(view);
}
