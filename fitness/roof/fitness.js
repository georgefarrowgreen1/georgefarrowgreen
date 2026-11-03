// STUB (One roof, stages 2–4, batch j0): the frozen surface of this file (s2/spec.md §4.2, §4.3, §4.7; roof/s24-contracts.md).
// Every export below is final in name and shape; each function throws until its owner ports it. The owner replaces the
// bodies, keeps every export and drops STUB (roofcontract.test skips this file's behaviour cases while STUB is here).
// Owner: FXA. Fitness's module entry under InFlite's roof (s2/spec.md §4.1, §4.3).
// Exports (frozen; roofcontract.test reads them from this file's text, each a literal on one line): CONTRACT = 1; BUILD
// and NEWS = fitness/app.js's (I raises both together); SECTIONS = REGISTRY.fitness.sections = connector.sections;
// mount(root, fw) → Promise<instance>, instance = { show(route, hint), hide(), back() → boolean, busy() → boolean,
// flush() → Promise<{ lost }>, sendable() → { words, packed, what } | null, unmount() } (s24-contracts §4).
// ctx (frozen) = { S: core.S, core, fw, open }; open = the bound sheet openers of §4.7's table:
//   act(id) actMap(id) actShare(id) rename(id) form(id) upload(files) actsview.js · session(day) workout(id, day) day(day) move(day) workouts()
//   rhythmSetup(step) sendDevice(wid, day) planview.js · power() training() engine() year(y) progview.js · offer(id) offers.js ·
//   settings(page) fxsettings.js
// Every dynamic import sits in fw.lazy((q) => import("./x.js" + q)) with its literal (s24-contracts §7).
// Header (S2-D18): acts [upload: Add Files, settings: Fitness Settings]; the file picker in the tap; drop per S2-D12;
// the reader Worker in fw.lazy, ended per batch; show(route) by the openTo rules (§2.6); a search provider while mounted.
import * as core from "./core.js";
import * as ui from "./fxui.js";
import * as X from "./x.js";
import { connector } from "./connector.js";
import { view as todayView } from "./todayview.js";
import { openOffer } from "./offers.js";
export const STUB = true;
export const CONTRACT = 1;
export const BUILD = "1.67";
export const NEWS = "InFlite’s note about its one app shows only on Fitness’s own Home Screen icon, never over a page in a small browser";
export const SECTIONS = [["today", "Today"], ["activities", "Activities"], ["progress", "Progress"]];

// (the stub: a placeholder in each section, every method there; nothing of the app's runs yet)
export async function mount(root, fw) {
  const doc = root.ownerDocument;
  for (const [id, name] of SECTIONS) {
    const s = doc.createElement("section");
    s.className = "fx-sec";
    s.dataset.sec = id;
    s.setAttribute("aria-label", name);
    s.hidden = true;
    s.append(fw.ui.skeleton("card", 2));
    root.append(s);
  }
  const ctx = { S: core.S, core, fw, open: {} };
  Object.assign(ctx.open, {
    act: (...a) => fw.lazy((q) => import("./actsview.js" + q)).then((m) => m.openAct(ctx, ...a)),
    actMap: (...a) => fw.lazy((q) => import("./actsview.js" + q)).then((m) => m.openActMap(ctx, ...a)),
    actShare: (...a) => fw.lazy((q) => import("./actsview.js" + q)).then((m) => m.openActShare(ctx, ...a)),
    rename: (...a) => fw.lazy((q) => import("./actsview.js" + q)).then((m) => m.openRename(ctx, ...a)),
    form: (...a) => fw.lazy((q) => import("./actsview.js" + q)).then((m) => m.openForm(ctx, ...a)),
    upload: (...a) => fw.lazy((q) => import("./actsview.js" + q)).then((m) => m.openUpload(ctx, ...a)),
    session: (...a) => fw.lazy((q) => import("./planview.js" + q)).then((m) => m.openSession(ctx, ...a)),
    workout: (...a) => fw.lazy((q) => import("./planview.js" + q)).then((m) => m.openWorkout(ctx, ...a)),
    day: (...a) => fw.lazy((q) => import("./planview.js" + q)).then((m) => m.openDay(ctx, ...a)),
    move: (...a) => fw.lazy((q) => import("./planview.js" + q)).then((m) => m.openMove(ctx, ...a)),
    workouts: (...a) => fw.lazy((q) => import("./planview.js" + q)).then((m) => m.openWorkouts(ctx, ...a)),
    rhythmSetup: (...a) => fw.lazy((q) => import("./planview.js" + q)).then((m) => m.openRhythmSetup(ctx, ...a)),
    sendDevice: (...a) => fw.lazy((q) => import("./planview.js" + q)).then((m) => m.openSendDevice(ctx, ...a)),
    power: (...a) => fw.lazy((q) => import("./progview.js" + q)).then((m) => m.openPower(ctx, ...a)),
    training: (...a) => fw.lazy((q) => import("./progview.js" + q)).then((m) => m.openTraining(ctx, ...a)),
    engine: (...a) => fw.lazy((q) => import("./progview.js" + q)).then((m) => m.openEngine(ctx, ...a)),
    year: (...a) => fw.lazy((q) => import("./progview.js" + q)).then((m) => m.openYear(ctx, ...a)),
    offer: (id) => openOffer(ctx, id),
    settings: (...a) => fw.lazy((q) => import("./fxsettings.js" + q)).then((m) => m.openSettings(ctx, ...a)),
  });
  const secOf = (id) => root.querySelector(`section[data-sec="${id}"]`);
  let shown = null;
  return {
    show(route) { if (shown) shown.hidden = true; shown = secOf(route?.section) || secOf(SECTIONS[0][0]); shown.hidden = false; fw.header.set({ title: "Fitness" }); return Promise.resolve(); },
    hide() {},
    back: () => false,
    busy: () => false,
    flush: () => Promise.resolve({ lost: 0 }),
    sendable: () => null,
    unmount() { root.replaceChildren(); },
  };
}
