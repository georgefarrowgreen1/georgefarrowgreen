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
export const BUILD = "1.69";
export const NEWS = "Progress inside InFlite: Your history, All-time bests and Fitness at its peak look as they do in Fitness";
export const SECTIONS = [["today", "Today"], ["activities", "Activities"], ["progress", "Progress"]];

const ACCEPT = ".fit,.gpx,.tcx,.zwo,.erg,.mrc,.zip";
const AWAY = 5 * 60e3;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
const clockOf = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export async function mount(root, fw) {
  const S = core.S, doc = root.ownerDocument;
  const ctx = { S, core, fw, open: {} };
  // (each lazy file, through fw.lazy; its literal for roofcontract and C4's lazy list)
  const L = {
    acts: () => fw.lazy((q) => import("./actsview.js" + (q || ""))),
    prog: () => fw.lazy((q) => import("./progview.js" + (q || ""))),
    plan: () => fw.lazy((q) => import("./planview.js" + (q || ""))),
    set: () => fw.lazy((q) => import("./fxsettings.js" + (q || ""))),
  };
  const loaded = {};
  const via = (k, name) => (...a) => L[k]().then((m) => { loaded[k] = m; return m[name](ctx, ...a); })
    .catch((e) => { console.error(e); fw.toast("That didn’t open. Try again in a moment."); });
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
  let batches = 0;
  const take = async (files) => {
    files = [...(files || [])];
    if (!files.length) return;
    // (picked or dropped before the account's in: said, not lost without a word)
    if (!S.me) { fw.toast(S.error && !S.loading ? "Fitness didn’t open, so those files weren’t read. Try again, then add them." : "Fitness is still opening. Add your files in a moment."); return; }
    batches++;
    fw.toast(`Reading ${files.length === 1 ? "1 file" : `${files.length} files`}…`);
    try {
      const got = await core.importFiles(files);
      if (!mounted) return;
      await ctx.open.upload(got);
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
    let real = null, loading = null, failed = false, drawn = false;
    const go = () => {
      if (real) { if (drawn) real.draw(); return; }
      if (loading) return;
      failed = false;
      el.replaceChildren(fw.ui.skeleton("card", 3));
      loading = L[k]().then((m) => { loaded[k] = m; real = m.view(el, c); loading = null; if (drawn) real.draw(); }).catch((e) => {
        console.error(e); loading = null; failed = true; real = null;
        el.replaceChildren(fw.ui.error({ title: `${label} didn’t load`, body: "Check your connection, then try again.", acts: [{ label: "Try Again", act: "retry", run: () => go() }] }));
      });
    };
    return {
      draw() { drawn = true; if (!failed) go(); },
      hide() { drawn = false; real?.hide?.(); },
      drop() { if (real) { real.destroy?.(); real = null; } el.replaceChildren(); },
      destroy() { real?.destroy?.(); real = null; },
    };
  };
  const VIEWS = { today: todayView, activities: lazyView("acts", "Activities"), progress: lazyView("prog", "Progress") };
  const secs = new Map(), views = new Map();
  for (const [id, name] of SECTIONS) {
    const el = doc.createElement("section");
    el.className = "fx-sec"; el.dataset.sec = id; el.setAttribute("aria-label", name); el.hidden = true;
    root.append(el);
    secs.set(id, el);
    views.set(id, VIEWS[id](el, ctx));
  }
  let shown = null, onScreen = false, mounted = true, zoomed = false, opening = 0;
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
  const draw = (id = shown) => {
    if (!onScreen || !id) return;
    const el = secs.get(id);
    try {
      if (state(el)) return;
      views.get(id)?.draw();
      if (id === "today" && !zoomed) { const hero = el.querySelector("[data-k=daycard]"); if (hero) { zoomed = true; fw.zoomTarget?.(hero); } }
    } catch (e) { console.error(e); }
  };
  // the header line: today's plan; Activities, this year's; Progress, fitness and form
  const lineOf = (id) => {
    if (!S.me) return S.loading ? "Loading…" : "";
    if (id === "activities") { const y = new Date().getFullYear(), n = S.acts.filter((a) => new Date(a.start).getFullYear() === y).length; return `${n} this year`; }
    if (id === "progress") { const f = S.acts.length ? core.fitnessSeries().at(-1) : null; return f ? `Fitness ${Math.round(f.ctl)} · Form ${core.signed(f.tsb)}` : "Your fitness, as your rides come in"; }
    const T = core.TODAY, done = core.actsOn(T), pid = core.plannedOn(T), w = pid && pid !== "event" ? core.wkById(pid) : null;
    if (done.length) { const s = core.sumOf(done[0]); return s?.dist > 100 ? `Done: ${dist(s.dist)}` : `Done: ${done[0].name}`; }
    if (pid === "event") return "Event day";
    if (w) { const t = (S.times || []).find((x) => x.day === dayStamp(T)); return `${w.name} · ${dur(measure(w, core.paceFor(w.sport)).secs)}${t ? ` at ${clockOf(t.start)}` : ""}`; }
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
  const all = () => { header(); draw(); };
  const offs = core.EVENTS.map((e) => core.on(e, all));

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
    const t0 = Date.now(), look = () => (my !== opening || !mounted ? done(false) : S.me ? done(true) : Date.now() - t0 > 20e3 ? done(false) : setTimeout(look, 150));
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
      else if (core.older.p || S.me.more) core.older().then(() => { if (my !== opening) return; if (find()) ctx.open.act(arg); else fw.toast("That activity isn’t here."); });
      else fw.toast("That activity isn’t here.");
    } else if (key === "day" && arg) {
      const d = dayOfKey(arg), lo = addDays(mondayOf(core.TODAY), -7), hi = addDays(mondayOf(core.TODAY), 13);
      if (d == null) return;
      if (d >= lo && d <= hi) { if (sheetEl.open) closeSheet(); lookAt(d); } else ctx.open.day(d);
    } else if (key === "offer" && arg) {
      if (!openOffer(ctx, arg)) fw.toast("That plan isn’t there any more.");
    }
  }

  return {
    async show(route) {
      const id = SECTIONS.some(([k]) => k === route?.section) ? route.section : "today";
      if (shown && shown !== id) { try { views.get(shown).hide(); } catch (e) { console.error(e); } away.set(shown, Date.now()); }
      for (const [k, el] of secs) el.hidden = k !== id;
      shown = id; onScreen = true;
      // (a section out of sight 5 minutes: its DOM let go, drawn afresh from S now, S2-D22)
      for (const [k, t] of away) if (k !== id && Date.now() - t > AWAY) { views.get(k)?.drop?.(); if (k === "today") secs.get(k).replaceChildren(); away.delete(k); }
      away.delete(id);
      guard(true);
      core.shown(true);
      header();
      draw(id);
      openTo(route);
    },
    hide() {
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
      mounted = false; onScreen = false; opening++;
      guard(false);
      for (const [t, f] of [["dragenter", enter], ["dragover", over], ["dragleave", leave], ["drop", drop]]) screen.removeEventListener(t, f);
      for (const off of offs) off();
      unprovide();
      for (const v of views.values()) { try { v.destroy(); } catch (e) { console.error(e); } }
      for (const el of secs.values()) el.remove();
      secs.clear(); views.clear();
      picker.remove();
      detach();
      core.stop();
    },
  };
}
