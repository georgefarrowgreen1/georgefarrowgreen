// Optional OS adapter: one account-bound Fitness instance, existing editors and opaque real route-file references.
import { readRoutePlan, forgetRoutePlans } from "../routes-account.js";
import { toGPX } from "../routes-geometry.js";
import { measure } from "../workouts.js";
import { dayStamp } from "./fxcalc.js";
import { openRideAt, sendableToday } from "./todayview.js";

const number = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
const fileRef = (route) => ({ id: `fitness:route:${route.id}`, app: "fitness", kind: "file", name: `inflite-${route.id}.gpx`, mime: "application/gpx+xml", routeId: route.id, intent: "export-route" });
const workoutId = (value) => typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : null;
const workoutRef = (w, format = "fit") => ({ id: `fitness:workout:${w.id}:${format}`, objectId: `fitness:workout:${w.id}:${format}`, app: "fitness", name: `${String(w.name || "Workout").replace(/[\u0000-\u001f/\\]/g, " ").slice(0, 170)}.${format}`, mime: format === "fit" ? "application/vnd.ant.fit" : "application/xml", source: "Workout library · Fitness", intent: "view-workout", downloadIntent: `download-workout-${format}` });

export function createWorkspace(root, ctx, { current = () => true } = {}) {
  const { S, core: c, fw } = ctx, api = fw.workspace, owner = fw.session.user.id;
  let dead = false, linked = null, fileGate = null;
  const live = () => !dead && !fw.signal?.aborted && current() && fw.session.user.id === owner;
  const owned = () => live() && S.me?.id === owner;
  const active = () => owned() && api.active() !== false;
  const timeOn = (day) => (S.times || []).find((x) => x.day === day && Number.isSafeInteger(x.start) && Number.isSafeInteger(x.stop) && x.stop > x.start) || null;
  // Preview only what the shared Weather context can represent; keep the account's full scheduled time in snapshots.
  const intervalOn = (day) => {
    const t = timeOn(day), now = Date.now();
    return t && t.start >= now - 864e5 && t.stop <= now + 16 * 864e5 && t.stop - t.start <= 48 * 36e5 ? { start: t.start, end: t.stop } : null;
  };
  const session = () => {
    const id = c.plannedOn(c.TODAY), workout = id && id !== "event" ? c.wkById(id) : null, activity = c.actsOn(c.TODAY)[0] || null;
    return { workout, activity, measured: workout ? measure(workout, c.paceFor(workout.sport)) : null, sum: activity ? c.sumOf(activity) : null };
  };
  const route = () => readRoutePlan(owner, { signal: fw.signal });
  const library = () => (typeof c.allWorkouts === "function" ? c.allWorkouts() : S.mine || []).filter((w) => workoutId(w.id) && w.sport !== "strength" && Array.isArray(w.steps)).slice(0, 80);
  const unavailable = () => ({ status: S.loading ? "loading" : S.error ? "error" : "signin", error: S.error || null, ride: null, route: null, files: [], actions: [] });
  async function files({ query = "", current: asking = () => true } = {}) {
    const permitted = () => owned() && asking();
    if (S.loading || !permitted()) return { status: S.loading ? "loading" : S.error ? "error" : "signin", files: [] };
    // The existing account route and library remain authoritative. No coordinates,
    // activity tracks or generated download URLs enter the workspace index.
    let plan = null, failed = false;
    try { plan = await route(); } catch (_) { failed = true; }
    if (!permitted()) return { status: "signin", files: [] };
    const values = library().flatMap((w) => [workoutRef(w), ...(w.sport === "ride" ? [workoutRef(w, "zwo")] : [])]);
    if (plan) { const ref = fileRef(plan.route); values.unshift({ ...ref, objectId: ref.id, source: "Saved route · Fitness", intent: "view-route", downloadIntent: "export-route", modifiedAt: plan.route.generatedAt }); }
    const words = String(query).slice(0, 160).toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matching = values.filter((f) => words.every((word) => `${f.name} ${f.source}`.toLowerCase().includes(word)));
    return { status: failed ? "error" : "ready", files: matching.slice(0, 100), more: matching.length > 100 };
  }
  async function snapshot() {
    if (!owned()) return unavailable();
    let plan = null, routeError = null;
    try { plan = await route(); } catch (error) { routeError = error.message; }
    if (!owned()) return unavailable();
    const { workout: w, activity: a, measured: m, sum: s } = session(), day = dayStamp(c.TODAY), scheduled = timeOn(day);
    const routeInfo = plan ? { id: plan.route.id, name: plan.route.name, metres: plan.route.metres, ascent: plan.route.ascent, provider: plan.route.provider, schedule: { day: plan.day, time: plan.time, tz: plan.tz } } : null;
    const files = plan ? [fileRef(plan.route)] : [], wx = S.wx?.d;
    const best = w && ["ride", "run"].includes(w.sport) && wx?.hours?.length ? c.BT.bestWindow(wx, { secs: m.secs, sport: w.sport === "run" ? "run" : "ride" }) : null;
    const ride = w || a || scheduled ? { id: `fitness:ride:${day}`, day, title: a?.name || w?.name || "Scheduled ride", sport: a?.sport || w?.sport || scheduled?.sport || "ride", workoutId: w?.id || null, activityId: a?.id || null,
      durationSeconds: number(s?.moving ?? s?.secs ?? m?.secs ?? (scheduled ? (scheduled.stop - scheduled.start) / 1000 : null)), tss: number(s?.tss ?? m?.tss), intensity: number(s?.iF ?? m?.iF),
      scheduled: scheduled ? { start: scheduled.start, stop: scheduled.stop, tz: scheduled.tz, source: scheduled.source } : null,
      bestWindow: best ? { start: best.start, end: best.end, rating: best.rating, dry: best.dry } : null,
      place: wx?.place?.name ? { name: wx.place.name, rough: wx.place.rough === true } : null, route: routeInfo, files } : null;
    const share = sendableToday();
    return { status: "ready", ride, route: routeInfo, routeError, files, actions: [
      { id: "schedule", label: scheduled ? "Change ride time" : "Set ride time", enabled: w?.sport === "ride" || !!scheduled },
      { id: "share", label: "Share ride", enabled: !!share },
      { id: "export-workout", label: "Send workout to device", enabled: !!w && w.sport !== "strength" },
      { id: "view-route", label: "Open route in Fitness", enabled: !!plan },
      { id: "export-route", label: "Download GPX", enabled: !!plan },
      { id: "weather-for-ride", label: "Weather at route start", enabled: !!plan },
    ] };
  }
  async function run(intent, object, { current: presenting = () => true } = {}) {
    const inView = () => live() && presenting() && api.active() !== false;
    const permitted = () => owned() && inView();
    if (!inView()) return { ok: false, error: "Open Fitness to continue." };
    const id = typeof intent === "string" ? intent : intent?.id || intent?.intent;
    const requested = typeof object === "string" ? object : object?.id || intent?.objectId;
    const { workout: w } = session();
    if (id === "import-files") {
      const picker = root.querySelector?.('input[type="file"][data-k="files"]');
      if (!picker) return { ok: false, error: "Open Fitness to add files." };
      const choose = () => { if (!permitted()) return; picker.value = ""; picker.click(); };
      if (owned() && globalThis.navigator?.userActivation?.isActive !== false) choose();
      else {
        fileGate?.close();
        const words = fw.ui.el("p", { role: "status" }), button = fw.ui.btn("Choose files", { disabled: true, run: () => { if (permitted()) { fileGate?.close(); choose(); } } });
        let sheet;
        const gate = { close: () => sheet?.now(), refresh() {
          if (!inView()) return gate.close();
          button.disabled = !owned();
          words.textContent = owned() ? "Add a ride or workout file to Fitness." : S.error ? "Fitness couldn’t load. Close and try again." : "Loading Fitness…";
        } };
        sheet = fw.sheet.open({ sheet: "fitness-files", title: "Add files", body: fw.ui.el("div", { class: "ifs-page" }, words, button), onClose: () => { if (fileGate === gate) fileGate = null; } });
        fileGate = gate; gate.refresh();
      }
      return { ok: true, pending: true };
    }
    if (!permitted()) return { ok: false, error: "Open Fitness to continue." };
    if (["view-workout", "download-workout-fit", "download-workout-zwo"].includes(id)) {
      const match = /^fitness:workout:([\w-]{1,100}):(fit|zwo)$/.exec(requested || ""), available = () => match && library().find((item) => item.id === match[1]);
      const chosen = available();
      if (!chosen || match[2] === "zwo" && chosen.sport !== "ride" || id === "download-workout-fit" && match[2] !== "fit" || id === "download-workout-zwo" && match[2] !== "zwo") return { ok: false, error: "That workout is no longer available. Open Fitness to review it." };
      if (id === "view-workout") {
        const view = await fw.lazy((q) => import("./planview.js" + (q || "")));
        if (!permitted() || !available()) return { ok: false, error: "Open Fitness to continue." };
        view.openWorkout(ctx, chosen.id); return { ok: true, pending: true };
      }
      const formats = await fw.lazy((q) => import("../formats.js" + (q || "")));
      if (!permitted() || !available()) return { ok: false, error: "Open Fitness to continue." };
      const fresh = available(), ref = workoutRef(fresh, match[2]), name = formats.fileName(fresh.name, match[2]);
      const payload = match[2] === "fit" ? formats.fitFromWorkout(fresh, { pace: c.paceFor(fresh.sport) }) : formats.zwoFromWorkout(fresh);
      const file = new File([payload], name, { type: ref.mime });
      if (!permitted()) return { ok: false, error: "Open Fitness to continue." };
      await c.saveFile(name, file);
      return { ok: permitted(), file, ref };
    }
    if (id === "schedule") return { ok: !!openRideAt(ctx), pending: true };
    if (id === "share") { const spec = sendableToday(); return spec ? { ok: !!(await fw.send(spec)) } : { ok: false, error: "There is no session to share today." }; }
    if (id === "export-workout") {
      if (!w || w.sport === "strength") return { ok: false, error: "There is no workout to export today." };
      const opened = await ctx.open.sendDevice(w.id, c.TODAY);
      return { ok: permitted() && opened !== null, pending: true };
    }
    if (!["view-route", "export-route", "weather-for-ride"].includes(id)) return { ok: false, error: "That action is not available." };
    const plan = await route();
    if (!permitted()) return { ok: false, error: "Open Fitness to continue." };
    if (!plan || requested && requested !== plan.route.id && requested !== fileRef(plan.route).id) return { ok: false, error: "That route is no longer the saved route. Open Fitness to review it." };
    if (id === "view-route") { ctx.routeToOpen = plan; fw.nav.section("routes"); return { ok: true, pending: true }; }
    if (id === "weather-for-ride") {
      const interval = intervalOn(plan.day), rideLocation = { name: `Start of ${plan.route.name}`, lat: plan.route.start[1], lon: plan.route.start[0] };
      api.context.update({ location: rideLocation, interval }, { source: "fitness:weather-for-ride" });
      const accepted = api.context.get();
      if (!accepted?.location || Math.abs(accepted.location.lat - rideLocation.lat) > .000001 || Math.abs(accepted.location.lon - rideLocation.lon) > .000001 || (accepted.interval?.start ?? null) !== (interval?.start ?? null) || (accepted.interval?.end ?? null) !== (interval?.end ?? null)) return { ok: false, error: "Weather context could not be updated. Try again." };
      linked = { ...accepted.location, current: api.context.capture?.() || (() => true), day: plan.day, start: interval?.start ?? null, end: interval?.end ?? null };
      return { ok: true };
    }
    const ref = fileRef(plan.route), file = new File([toGPX(plan.route)], ref.name, { type: ref.mime });
    await c.saveFile(ref.name, file);
    return { ok: true, file, ref };
  }
  function changed() {
    if (!live()) return;
    fileGate?.refresh();
    // A link established by the person's Weather action follows a subsequently confirmed Ride At time only.
    const currentPlace = api.context.get()?.location;
    if (owned() && linked?.current() && currentPlace?.lat === linked.lat && currentPlace?.lon === linked.lon) {
      const interval = intervalOn(linked.day), start = interval?.start ?? null, end = interval?.end ?? null;
      if (start !== linked.start || end !== linked.end) { api.context.update({ interval }, { source: "fitness:ride-time" }); linked.start = start; linked.end = end; }
    }
    api.changed();
  }
  const off = api.provide({ snapshot, run, files }), stops = c.EVENTS.map((event) => c.on(event, changed));
  function destroy() {
    if (dead) return;
    dead = true; linked = null; fileGate?.close(); fileGate = null; off(); for (const stop of stops) stop();
    fw.signal?.removeEventListener("abort", destroy); root.classList.remove("fx-workspace"); forgetRoutePlans();
  }
  fw.signal?.addEventListener("abort", destroy, { once: true });
  if (fw.signal?.aborted) destroy();
  return { changed, destroy };
}
