// STUB (One roof, stages 2–4, batch j0): the frozen surface of this file (s2/spec.md §4.2, §4.3, §4.7; roof/s24-contracts.md).
// Every export below is final in name and shape; each function throws until its owner ports it. The owner replaces the
// bodies, keeps every export and drops STUB (roofcontract.test skips this file's behaviour cases while STUB is here).
// Owner: MK. Markets's module entry under InFlite's roof (s2/spec.md §4.1, §4.2).
// Exports (frozen; roofcontract.test reads them from this file's text, each a literal on one line): CONTRACT = 1; BUILD
// and NEWS = markets/app.js's (I raises both together); SECTIONS = REGISTRY.markets.sections = connector.sections;
// mount(root, fw) → Promise<instance>, instance = { show(route, hint), hide(), back() → boolean, busy() → boolean,
// flush() → Promise<{ lost }>, sendable() → { words, packed, what } | null, unmount() } (s24-contracts §4).
// ctx (frozen) = { S: core.S, core, fw, open }; open = the bound sheet openers of §4.7's table:
//   stock(sym) stock.js · addStock(q = "") the add-stock shell here + edit.js · holding(sym) edit.js · income() isa() vs() money.js · story(id) news.js ·
//   account(name) about() holdings.js
// Every dynamic import sits in fw.lazy((q) => import("./x.js" + q)) with its literal (s24-contracts §7).
// Header (S2-D18): acts [plus: Add a Stock]; compactTitle in percent; badges; a search provider while mounted with
// "Find … in Markets" (s2 §2.5). show(route): the section; key s + arg → open.stock(arg) once S.me; income|isa|vs|about.
import * as core from "./core.js";
import * as ui from "./mkui.js";
import { connector } from "./connector.js";
import { view as todayView } from "./todayview.js";
import * as account from "../account.js";
import * as charts from "../charts.js";
import { stockSendCard } from "../send.js";
export const STUB = true;
export const CONTRACT = 1;
export const BUILD = "1.95";
export const NEWS = "InFlite’s note about its one app shows only on Markets’ own Home Screen icon, never over a page in a small browser";
export const SECTIONS = [["today", "Today"], ["holdings", "Holdings"], ["news", "News"]];

// (the stub: a placeholder in each section, every method there; nothing of the app's runs yet)
export async function mount(root, fw) {
  const doc = root.ownerDocument;
  for (const [id, name] of SECTIONS) {
    const s = doc.createElement("section");
    s.className = "mk-sec";
    s.dataset.sec = id;
    s.setAttribute("aria-label", name);
    s.hidden = true;
    s.append(fw.ui.skeleton("card", 2));
    root.append(s);
  }
  const ctx = { S: core.S, core, fw, open: {} };
  Object.assign(ctx.open, {
    stock: (...a) => fw.lazy((q) => import("./stock.js" + q)).then((m) => m.openStock(ctx, ...a)),
    addStock: (...a) => fw.lazy((q) => import("./edit.js" + q)).then((m) => m.searchView(ctx, ...a)),
    holding: (...a) => fw.lazy((q) => import("./edit.js" + q)).then((m) => m.openHolding(ctx, ...a)),
    income: (...a) => fw.lazy((q) => import("./money.js" + q)).then((m) => m.openIncome(ctx, ...a)),
    isa: (...a) => fw.lazy((q) => import("./money.js" + q)).then((m) => m.openIsa(ctx, ...a)),
    vs: (...a) => fw.lazy((q) => import("./money.js" + q)).then((m) => m.openVs(ctx, ...a)),
    story: (...a) => fw.lazy((q) => import("./news.js" + q)).then((m) => m.openStory(ctx, ...a)),
    account: (...a) => fw.lazy((q) => import("./holdings.js" + q)).then((m) => m.openAccount(ctx, ...a)),
    about: (...a) => fw.lazy((q) => import("./holdings.js" + q)).then((m) => m.openAbout(ctx, ...a)),
  });
  const secOf = (id) => root.querySelector(`section[data-sec="${id}"]`);
  let shown = null;
  return {
    show(route) { if (shown) shown.hidden = true; shown = secOf(route?.section) || secOf(SECTIONS[0][0]); shown.hidden = false; fw.header.set({ title: "Markets" }); return Promise.resolve(); },
    hide() {},
    back: () => false,
    busy: () => false,
    flush: () => Promise.resolve({ lost: 0 }),
    sendable: () => null,
    unmount() { root.replaceChildren(); },
  };
}
