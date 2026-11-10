// Fitness's module: its entry under InFlite's roof (One roof stage 2, §4.1, §4.3, S2-D4, S2-D12, S2-D17, S2-D18). Loaded by
// the framework with import("/fitness/roof/fitness.js") on first open and kept for the life of the page.
//
// Exports (frozen; roofcontract reads them from this file's text): CONTRACT = 1; BUILD and NEWS = fitness/app.js's;
//   SECTIONS = REGISTRY.fitness.sections = connector.sections; mount(root, fw) → Promise<instance>.
// instance = { show(route, hint), hide(), back() → false, busy(), flush(), sendable(), unmount() }
//   show: the section; key act → Activities and the ride (one not here yet: looked for again once the older ones are in);
//   day=YYYY-MM-DD → Today, looked at there inside the weeks Today shows, else its own sheet; offer=<id> → its sheet;
//   settings[=page] → Fitness Settings; plan → Today (fitness/app.js openTo, 2718-2740).
// What mount builds: one section.fx-sec[data-sec] per section; Today's view is static (todayview.js), Activities' and
// Progress's load through fw.lazy on their first show (a skeleton meanwhile; Try Again on a failure). ctx = { S, core,
// fw, open }, open = §4.7's openers, each loading its file through fw.lazy.
// The header (while shown): title = the section's name; line = today's plan ("Endurance · 1 h 15 at 18:00", "Rest day",
// "Done: 42 km"), on Activities "n this year", on Progress "Fitness 64 · Form +5"; compactTitle "Fitness · <line>";
// acts Add Files (upload) and Fitness Settings (settings).
// Files (S2-D12): Add Files opens a module-made input[type=file][data-k=files] in the tap; a drop on Fitness's screen is
// taken only when it carries Files (Today's day drag never is); while Fitness shows, a file dropped anywhere else on the
// page is refused (document dragover/drop, added on show, removed on hide and unmount). Read by core.importFiles (the
// reader Worker through fw.lazy, ended after the batch), then the Upload sheet (open.upload(got)).
import * as core from "./core.js";
import { connector } from "./connector.js";
import { attach, detach, setPicker, closeSheet, sheetEl } from "./fxui.js";
import { view as todayView, lookAt, sendableToday } from "./todayview.js";
import { openOffer } from "./offers.js";
import { dayStamp, rhythmSaid } from "./fxcalc.js";
import { dur, dist } from "../ui.js";
import { measure, startOfDay, addDays, mondayOf, WORKOUTS } from "../workouts.js";

export const CONTRACT = 1;
export const BUILD = "2.29";
export const NEWS = "A unified neutral design with clearer cards and green controls";
export const SECTIONS = [["today", "Today"], ["activities", "Activities"], ["routes", "Routes"], ["progress", "Progress"]];

const ACCEPT = ".fit,.gpx,.tcx,.zwo,.erg,.mrc,.zip";
const AWAY = 5 * 60e3;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
const clockOf = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export async function mount(root, fw) {
  const S = core.S, doc = root.ownerDocument;
  const ctx = { S, core, fw, open: {} };
  let mounted = true, onScreen = false, episode = 0;
  const live = () => mounted && !fw.signal?.aborted;
  const here = (mine) => live() && onScreen && episode === mine;
  // Routes are lazy; their stylesheet should not delay every opening of Today.
  let routeCSS = null;
  const routeStyles = () => routeCSS ||= new Promise((resolve, reject) => {
    let link = doc.querySelector('link[href="/fitness/routes.css"]');
    if (link?.sheet) return resolve();
    if (!link) { link = doc.createElement("link"); link.rel = "stylesheet"; link.href = "/fitness/routes.css"; }
    const done = (error) => {
      clearTimeout(timer); link.removeEventListener("load", loaded); link.removeEventListener("error", failed);
      if (error) { link.remove(); reject(error); } else resolve();
    };
    const loaded = () => done(), failed = () => done(new Error("Routes styles could not be loaded"));
    const timer = setTimeout(failed, 5000);
    link.addEventListener("load", loaded, { once: true }); link.addEventListener("error", failed, { once: true });
    if (!link.isConnected) doc.head.append(link);
  }).catch((error) => { routeCSS = null; throw error; });
  // (each lazy file, through fw.lazy; its literal for roofcontract and C4's lazy list)
  const L = {
    acts: () => fw.lazy((q) => import("./actsview.js" + (q || ""))),
    routes: () => Promise.all([routeStyles(), fw.lazy((q) => import("./routesview.js" + (q || "")))]).then(([, module]) => module),
    prog: () => fw.lazy((q) => import("./progview.js" + (q || ""))),
    plan: () => fw.lazy((q) => import("./planview.js" + (q || ""))),
    set: () => fw.lazy((q) => import("./fxsettings.js" + (q || ""))),
  };
  const loaded = {};
  const via = (k, name) => (...a) => {
    const mine = episode;
    if (!here(mine)) return Promise.resolve(null);
    return L[k]().then((m) => { if (!here(mine)) return null; loaded[k] = m; return m[name](ctx, ...a); })
      .catch((e) => { if (here(mine)) { console.error(e); fw.toast("That didn’t open. Try again in a moment."); } return null; });
  };
  Object.assign(ctx.open, {
    act: via("acts", "openAct"), actMap: via("acts", "openActMap"), actShare: via("acts", "openActShare"), rename: via("acts", "openRename"),
    form: via("acts", "openForm"), upload: via("acts", "openUpload"),
    session: via("plan", "openSession"), workout: via("plan", "openWorkout"), day: via("plan", "openDay"), move: via("plan", "openMove"),
    workouts: via("plan", "openWorkouts"), rhythmSetup: via("plan", "openRhythmSetup"), sendDevice: via("plan", "openSendDevice"),
    power: via("prog", "openPower"), training: via("prog", "openTraining"), engine: via("prog", "openEngine"), year: via("prog", "openYear"),
    settings: via("set", "openSettings"),
    offer: (id) => openOffer(ctx, id),
  });
  attach(root, fw);
  core.start(fw);

  // ---- Add Files: the picker, opened in the tap (S2-D12) ----
  const picker = doc.createElement("input");
  Object.assign(picker, { type: "file", multiple: true, accept: ACCEPT, hidden: true });
  picker.dataset.k = "files";
  picker.setAttribute("aria-label", "Add Files");
  root.append(picker);
  let batches = 0, uploads = [], presenting = false;
  const owned = (owner) => live() && S.me?.id === owner && fw.session.user?.id === owner;
  // A parsed file is account data: keep it across section changes and present it once Fitness is visible again.
  const presentUploads = async () => {
    if (presenting || !live() || !onScreen) return;
    uploads = uploads.filter((batch) => owned(batch.owner));
    if (!uploads.length) return;
    presenting = true;
    const batch = uploads[0];
    try {
      const m = loaded.acts || await L.acts();
      if (!owned(batch.owner)) return;
      loaded.acts = m;
      if (!onScreen) return;
      if (await m.openUpload(ctx, batch.got, () => owned(batch.owner) && onScreen)) uploads = uploads.filter((x) => x !== batch);
    } catch (e) {
      if (owned(batch.owner) && onScreen) { console.error(e); fw.toast("Those files are ready. Open Fitness again to review them."); }
    } finally { presenting = false; }
  };
  const take = async (files) => {
    files = [...(files || [])];
    if (!files.length) return;
    // (picked or dropped before the account's in: said, not lost without a word)
    if (!S.me) { fw.toast(S.error && !S.loading ? "Fitness didn’t open, so those files weren’t read. Try again, then add them." : "Fitness is still opening. Add your files in a moment."); return; }
    const owner = S.me.id;
    batches++;
    fw.toast(`Reading ${files.length === 1 ? "1 file" : `${files.length} files`}…`);
    try {
      const got = await core.importFiles(files);
      if (!owned(owner)) return;
      uploads.push({ owner, got });
      await presentUploads();
    } finally { batches--; }
  };
  picker.addEventListener("change", () => { const f = [...picker.files]; picker.value = ""; take(f); });
  const choose = () => { picker.value = ""; picker.click(); };
  setPicker(choose);

  // ---- a drop on Fitness's screen (Files only), and none anywhere else while it shows ----
  const screen = fw.screenEl || root;
  let depth = 0;
  const lit = (v) => root.classList.toggle("fx-drop-on", v);
  const enter = (e) => { if (!hasFiles(e) || !S.me) return; e.preventDefault(); depth++; lit(true); };
  const over = (e) => { if (hasFiles(e)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } };
  const leave = (e) => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; lit(false); } };
  const drop = (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); depth = 0; lit(false); take(e.dataTransfer.files); };
  for (const [t, f] of [["dragenter", enter], ["dragover", over], ["dragleave", leave], ["drop", drop]]) screen.addEventListener(t, f);
  const refuse = (e) => { if (hasFiles(e)) e.preventDefault(); };
  let guarded = false;
  const guard = (v) => {
    if (v === guarded) return;
    guarded = v;
    if (v) { doc.addEventListener("dragover", refuse); doc.addEventListener("drop", refuse); }
    else { doc.removeEventListener("dragover", refuse); doc.removeEventListener("drop", refuse); }
  };

  // ---- the sections ----
  const lazyView = (k, label) => (el, c) => {
    let real = null, loading = null, failed = false, drawn = false, dead = false, generation = 0;
    const go = () => {
      if (dead || !live()) return;
      // (its file in already (fetched ahead, or before a drop): the view made and drawn at once, never a skeleton between)
      if (!real && loaded[k]) real = loaded[k].view(el, c);
      if (real) { if (drawn) real.draw(); return; }
      if (loading) return;
      failed = false;
      el.replaceChildren(fw.ui.skeleton("card", 3));
      const mine = generation;
      loading = L[k]().then((m) => { if (dead || !live() || generation !== mine) return; loaded[k] = m; real = m.view(el, c); loading = null; if (drawn) real.draw(); }).catch((e) => {
        if (dead || !live() || generation !== mine) return;
        console.error(e); loading = null; failed = true; real = null;
        el.replaceChildren(fw.ui.error({ title: `${label} didn’t load`, body: "Check your connection, then try again.", acts: [{ label: "Try Again", act: "retry", run: () => go() }] }));
      });
    };
    return {
      // (its file fetched ahead, at a quiet moment once Fitness shows)
      warm() { const mine = generation; if (!dead && live() && !real && !loading && !loaded[k]) L[k]().then((m) => { if (!dead && live() && generation === mine) loaded[k] = m; }, () => {}); },
      draw() { drawn = true; if (!failed) go(); },
      // (shown again with nothing new to draw: told it's on screen, its DOM left as it is)
      resume() { drawn = true; if (real) real.resume?.(); else if (!loading && !failed) go(); },
      hide() { drawn = false; real?.hide?.(); },
      drop() { generation++; loading = null; failed = false; drawn = false; if (real) { real.destroy?.(); real = null; } el.replaceChildren(); },
      destroy() { dead = true; generation++; loading = null; drawn = false; real?.destroy?.(); real = null; },
    };
  };
  const VIEWS = { today: todayView, activities: lazyView("acts", "Activities"), routes: lazyView("routes", "Routes"), progress: lazyView("prog", "Progress") };
  // Activities/Progress warm after Fitness shows; Routes keeps its geometry lazy until opened.
  let warmed = false, warmT = 0;
  const warm = () => { if (warmed || warmT) return; warmT = setTimeout(() => { warmT = 0; if (!onScreen || fw.stale?.() || globalThis.navigator?.connection?.saveData) return; warmed = true; for (const [section, v] of views) if (section !== "routes") v.warm?.(); }, 1200); };
  const secs = new Map(), views = new Map();
  for (const [id, name] of SECTIONS) {
    const el = doc.createElement("section");
    el.className = "fx-sec"; el.dataset.sec = id; el.setAttribute("aria-label", name); el.hidden = true;
    root.append(el);
    secs.set(id, el);
    views.set(id, VIEWS[id](el, ctx));
  }
  let shown = null, zoomed = false, opening = 0;
  const away = new Map();
  // (Today before the account's in: a skeleton; and what went wrong, with Try Again)
  const state = (el) => {
    if (S.me) return false;
    if (S.error && !S.loading) {
      el.replaceChildren(fw.ui.error({ title: "Fitness didn’t open", body: S.error, acts: [{ label: "Try Again", act: "retry", primary: true, run: () => core.retry() }] }));
      return true;
    }
    el.replaceChildren(fw.ui.skeleton("hero"), fw.ui.skeleton("card", 3));
    return true;
  };
  // (each section drawn again only when what it shows has changed since it was last drawn: going back to one that
  // hasn't leaves it exactly as it was, its charts and rows never drawing in again)
  let ver = 0;
  const drawnAt = new Map();
  const routeHold = Symbol("route-plan");
  let routeKit = null;
  const routePlan = async () => {
    const owner = fw.session.user.id;
    try {
      const kit = routeKit || await fw.lazy((q) => import("../route-plan.js" + (q || "")));
      if (!live() || fw.session.user.id !== owner) return;
      routeKit = kit;
      return await kit.renderRoutePlan(secs.get("today"), { owner, current: () => live() && fw.session.user.id === owner, metric: core.U.metric !== false, onBusy: on => core.hold(routeHold, on), onOpen: plan => { ctx.routeToOpen = plan; fw.nav.section("routes"); } });
    } catch (error) { if (live()) console.error("Planned route unavailable", error); }
  };
  ctx.refreshRoute = () => routePlan();
  const draw = (id = shown, force = false) => {
    if (!onScreen || !id) return;
    if (!force && S.me && drawnAt.get(id) === ver) { try { views.get(id)?.resume?.(); if (id === "today") routePlan(); } catch (e) { console.error(e); } return; }
    const el = secs.get(id);
    try {
      if (state(el)) return;
      views.get(id)?.draw();
      if (id === "today") routePlan();
      drawnAt.set(id, ver);
      if (id === "today" && !zoomed) { const hero = el.querySelector("[data-k=daycard]"); if (hero) { zoomed = true; fw.zoomTarget?.(hero); } }
    } catch (e) { console.error(e); }
  };
  // the header line: today's plan; Activities, this year's; Progress, fitness and form
  const lineOf = (id) => {
    if (!S.me) return S.loading ? "Loading…" : "";
    if (id === "routes") return "Loops from your location";
    if (id === "activities") { const y = new Date().getFullYear(), n = S.acts.filter((a) => new Date(a.start).getFullYear() === y).length; return `${n} this year`; }
    if (id === "progress") { const f = S.acts.length ? core.fitnessSeries().at(-1) : null; return f ? `Fitness ${Math.round(f.ctl)} · Form ${core.signed(f.tsb)}` : "Your fitness, as your rides come in"; }
    const T = core.TODAY, done = core.actsOn(T), pid = core.plannedOn(T), w = pid && pid !== "event" ? core.wkById(pid) : null;
    if (done.length) { const s = core.sumOf(done[0]); return s?.dist > 100 ? `Done: ${dist(s.dist)}` : `Done: ${done[0].name}`; }
    if (pid === "event") return "Event day";
    if (w) { const t = (S.times || []).find((x) => x.day === dayStamp(T)); return `${w.kind || "Ride"} · ${dur(measure(w, core.paceFor(w.sport)).secs)}${t ? ` at ${clockOf(t.start)}` : ""}`; }
    if (pid === null) return "Rest day";
    return core.rhythmOn() ? rhythmSaid() : "";
  };
  const header = () => {
    if (!onScreen) return;
    const name = SECTIONS.find(([k]) => k === shown)?.[1] || "Fitness", line = lineOf(shown);
    fw.header.set({
      title: name, compactTitle: line ? (/^Fitness\b/.test(line) ? line : `Fitness · ${line}`) : "Fitness", pick: null, line,
      acts: [{ icon: "upload", label: "Add Files", run: choose }, { icon: "settings", label: "Fitness Settings", run: () => ctx.open.settings(null) }],
    });
  };
  // (one redraw a frame however many events come; and Activities drawn again only for what it shows, never for the plan,
  // offers, times or how you feel)
  let queued = 0;
  const all = () => { ver++; if (queued) return; queued = requestAnimationFrame(() => { queued = 0; header(); draw(); }); };
  const ACTS_EVENTS = new Set(["me", "acts", "settings", "loading", "error"]);
  // (a section about to be swiped to and never drawn: drawn now, out of sight, then told it's hidden: Today's swipe.js)
  const peek = (e) => { const id = e.detail, v = views.get(id); if (!onScreen || !v || secs.get(id)?.childElementCount) return; try { v.draw(); drawnAt.set(id, ver); v.hide?.(); } catch (x) { console.error(x); } };
  root.addEventListener("ifl-peek", peek);
  const offs = core.EVENTS.map((e) => core.on(e, (d) => { if (S.me && (e === "loading" || e === "error")) { header(); return; } if (d?.patched && shown === "activities") { const fresh = drawnAt.get("activities") === ver; ver++; if (fresh) drawnAt.set("activities", ver); header(); return; } if (shown === "activities" && !ACTS_EVENTS.has(e)) { const fresh = drawnAt.get("activities") === ver; ver++; if (fresh) drawnAt.set("activities", ver); header(); } else all(); }));

  // (the module's search while mounted: Fitness Settings and the like, your activities, the days coming, the library)
  const unprovide = fw.search?.provide?.({
    id: "fitness", group: "Fitness", order: 40,
    search(q) {
      const s = String(q || "").toLowerCase().trim();
      if (!s) return [];
      const out = connector.search(q);
      const acts = S.acts.filter((a) => `${a.name} ${a.sport} ${dayStamp(a.start)}`.toLowerCase().includes(s)).slice(0, 8)
        .map((a) => ({ title: a.name, sub: `${dayStamp(a.start)} · Fitness`, icon: "fitness", href: `/fitness/#act=${encodeURIComponent(a.id)}` }));
      const days = [];
      for (let i = 0; i < 14 && days.length < 4 && S.me; i++) {
        const d = addDays(core.TODAY, i), id = core.plannedOn(d), w = id && id !== "event" ? core.wkById(id) : null;
        if (w && w.name.toLowerCase().includes(s)) days.push({ title: w.name, sub: `${dayStamp(d)} · Fitness`, icon: "fitness", href: `/fitness/#day=${dayStamp(d)}` });
      }
      const lib = [...S.mine, ...WORKOUTS].filter((w) => w.name.toLowerCase().includes(s)).slice(0, 5)
        .map((w) => ({ title: w.name, sub: "Workout · Fitness", icon: "fitness", run: () => ctx.open.workout(w.id) }));
      return [...out, ...acts, ...days, ...lib];
    },
  }) || (() => {});

  // (an address's ride, day or plan: once the account's in, up to 20 s; a later one takes over)
  const whenReady = (my) => new Promise((done) => {
    const t0 = Date.now(), look = () => (my !== opening || !live() || !onScreen ? done(false) : S.me ? done(true) : Date.now() - t0 > 20e3 ? done(false) : setTimeout(look, 150));
    look();
  });
  const dayOfKey = (k) => { const [y, mo, d] = String(k).split("-").map(Number), t = new Date(y, mo - 1, d).getTime(); return Number.isFinite(t) && dayStamp(t) === k ? startOfDay(t) : null; };
  async function openTo(route) {
    const my = ++opening, key = route?.key, arg = route?.arg;
    if (!key || key === "plan") return;
    if (key === "settings") { ctx.open.settings(arg || null); return; }
    if (!(await whenReady(my))) return;
    if (key === "act" && arg) {
      const find = () => S.acts.find((x) => x.id === arg);
      if (find()) ctx.open.act(arg);
      else if (core.older.p || S.me.more) core.older().then(() => { if (my !== opening || !live() || !onScreen) return; if (find()) ctx.open.act(arg); else fw.toast("That activity isn’t here."); });
      else fw.toast("That activity isn’t here.");
    } else if (key === "day" && arg) {
      const d = dayOfKey(arg), lo = addDays(mondayOf(core.TODAY), -7), hi = addDays(mondayOf(core.TODAY), 13);
      if (d == null) return;
      if (d >= lo && d <= hi) { if (sheetEl.open) closeSheet(); lookAt(d); } else ctx.open.day(d, { asDay: true });
    } else if (key === "offer" && arg) {
      if (!openOffer(ctx, arg)) fw.toast("That plan isn’t there any more.");
    }
  }

  return {
    async show(route) {
      if (!live()) return;
      episode++;
      const id = SECTIONS.some(([k]) => k === route?.section) ? route.section : "today";
      if (shown && shown !== id) { try { views.get(shown).hide(); } catch (e) { console.error(e); } away.set(shown, Date.now()); }
      for (const [k, el] of secs) el.hidden = k !== id;
      const coming = !onScreen;
      shown = id; onScreen = true;
      // (a section out of sight 5 minutes: its DOM let go, drawn afresh from S now, S2-D22)
      for (const [k, t] of away) if (k !== id && Date.now() - t > AWAY) { views.get(k)?.drop?.(); if (k === "today") secs.get(k).replaceChildren(); away.delete(k); drawnAt.delete(k); }
      away.delete(id);
      guard(true);
      // (Fitness coming on screen: its account looked at again; a section switch within it isn't a reason to)
      if (coming) core.shown(true);
      header();
      draw(id);
      openTo(route);
      presentUploads();
      warm();
    },
    hide() {
      episode++; opening++;
      onScreen = false;
      guard(false);
      depth = 0; lit(false);
      core.shown(false);
      if (shown) { try { views.get(shown).hide(); } catch (e) { console.error(e); } away.set(shown, Date.now()); }
      for (const [k, el] of secs) if (k !== shown) away.set(k, away.get(k) || Date.now());
    },
    back: () => false,
    busy: () => core.busy() || batches > 0 || !!loaded.acts?.busy?.(),
    // (the save in flight waited for, then what's still unsaved sent; whatever's left after that is what Sign Out loses:
    // F.flush gives this 2 s)
    async flush() {
      for (let i = 0; i < 2 && (core.S.dirty.size || core.inStep.p); i++) await core.inStep().catch(() => {});
      return { lost: core.S.dirty.size ? 1 : 0 };
    },
    sendable() { try { return shown === "today" || !shown ? sendableToday() : null; } catch (e) { console.error(e); return null; } },
    unmount() {
      mounted = false; onScreen = false; uploads = []; opening++; episode++; clearTimeout(warmT);
      guard(false);
      for (const [t, f] of [["dragenter", enter], ["dragover", over], ["dragleave", leave], ["drop", drop]]) screen.removeEventListener(t, f);
      for (const off of offs) off();
      root.removeEventListener("ifl-peek", peek);
      unprovide();
      for (const v of views.values()) { try { v.destroy(); } catch (e) { console.error(e); } }
      for (const el of secs.values()) el.remove();
      secs.clear(); views.clear();
      picker.remove();
      detach();
      routeKit?.forgetRoutePlans();
      core.stop();
    },
  };
}
