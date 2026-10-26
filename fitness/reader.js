// Fitness's files read off the page's thread (a module worker): a file's activities and workouts (formats.js readAny),
// and each activity's figures worked out (load.js summarise and stayingOf, its route's shape), so a year of rides
// coming in from Garmin, or a big upload, never stops the page. The app asks with { id, name, bytes, profile } and
// gets { id, r } (r as readAny's, each activity with its figures as `pre`), or { id, error }.
import { readAny, routeShape } from "./formats.js";
import { summarise, stayingOf } from "./load.js";

self.onmessage = async (e) => {
  const { id, name, bytes, profile } = e.data || {};
  try {
    const r = await readAny(name, bytes);
    for (const a of r.activities) {
      try { const route = routeShape(a.s); a.pre = { ...summarise(a, profile), ...stayingOf(a), ...(route ? { route } : {}) }; } catch (_) { /* (worked out on the page instead) */ }
    }
    self.postMessage({ id, r });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
