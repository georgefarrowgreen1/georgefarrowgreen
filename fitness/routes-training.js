// Use the rider's scheduled workout and recent outdoor pace in both Fitness layouts.
import { measure } from "./workouts.js";

export function routeTraining(core, state) {
  const id = core.plannedOn(core.TODAY);
  const session = id && id !== "event" ? core.wkById(id) : null;
  const workout = session?.sport === "ride" ? {
    name: session.name,
    minutes: Math.round(measure(session, core.paceFor(session.sport)).secs / 60),
    effort: /recovery/i.test(session.name) ? "recovery" : "endurance"
  } : null;
  const speeds = state.acts.filter(activity => activity.sport === "ride" && !activity.indoor)
    .slice(-15).map(activity => {
      const s = core.sumOf(activity);
      return s?.moving > 900 && s.dist > 1000 ? s.dist / s.moving * 3.6 : 0;
    }).filter(speed => speed >= 10 && speed <= 40).sort((a, b) => a - b);
  return { workout, speed: speeds.length ? speeds[Math.floor(speeds.length / 2)] : 22, speedFromHistory: !!speeds.length };
}
