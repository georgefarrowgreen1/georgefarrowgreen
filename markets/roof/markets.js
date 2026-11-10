import { cashEditor } from "../cashview.js";
import { cashContext, pushSheet } from "./mkui.js";
// Markets' module: its entry under InFlite's roof (One roof stage 2, spec §2.1, §2.5, §2.6, §4.1, §4.2, §4.7, S2-D2–D7,
// D9, D18, D19, D21, D22). Loaded by the framework (roof/modules.js) with import("/markets/roof/markets.js") on first open
// and kept for the life of the page.
//
// Exports (frozen; roofcontract.test reads them from this file's text, each a literal on one line): CONTRACT = 1;
// BUILD and NEWS = markets/app.js's; SECTIONS = REGISTRY.markets.sections = connector.sections; mount(root, fw).
// instance = { show(route, hint), hide(), back() → false, busy(), flush() → Promise<{ lost }>, sendable(), unmount() }.
//   show: the section (route.section); key "s" with an arg → the stock sheet once your list is in; "income", "isa", "vs"
//   → that sheet over Holdings, "about" → About These Prices. A search's Find (connector.want) opens Add a Stock with it.
// What mount builds: one section.mk-sec[data-sec] per section in root (div.m-markets); Today's view at once
// (todayview.js), Holdings' and News' through fw.lazy on their first show (a skeleton meanwhile). ctx = { S, core, fw,
// open }, open (frozen, §4.7) = { stock(sym), addStock(q), holding(sym), income(), isa(), vs(), story(id), account(name),
// about() }, each loading its file through fw.lazy (Add a Stock's sheet and field made here, in the tap: RI9).
// The header (while Markets shows): title the section's label; line the markets' state ("London open · closes in 2h
// 5m"); compactTitle "Markets · +0.8%" (the day's percent, never pounds); acts: Add a Stock (plus); badges { news }.
// The module's search provider (while mounted) replaces Markets' connector provider only (C6): your holdings by name or
// symbol on this phone, Markets' sheets, and Find "…" in Markets (its query leaves the phone only when tapped).
// A section out of sight for five minutes lets go of its DOM and is drawn afresh from core.S on its next show (S2-D22).
import * as core from "./core.js";
import { connector, want } from "./connector.js";
import { h, M, init, release, openSheet, closeSheet, paint, icon, Sheet, topView, topArg } from "./mkui.js";
import { view as todayView } from "./todayview.js";

export const CONTRACT = 1;
export const BUILD = "2.31";
export const NEWS = "Smoother springs, transitions and interrupted motion across InFlite";
export const SECTIONS = [["today", "Today"], ["holdings", "Holdings"], ["news", "News"]];

function cashView(id) { return [cashEditor(cashContext(), id)]; }
cashView.sheet = "cash";
cashView.focus = "#mk-cash-amount";

const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;
const DROP_AFTER = 5 * 60e3;

export async function mount(root, fw) {
  const S = core.S;
  let mounted = true, onScreen = false, episode = 0;
  const live = () => mounted && !fw.signal?.aborted;
  const here = (mine) => live() && onScreen && episode === mine;
  // the lazy files, each a literal import inside fw.lazy (C4, D21)
  const LAZY = {
    holdings: () => fw.lazy((q) => import("./holdings.js" + q)),
    news: () => fw.lazy((q) => import("./news.js" + q)),
    stock: () => fw.lazy((q) => import("./stock.js" + q)),
    edit: () => fw.lazy((q) => import("./edit.js" + q)),
    money: () => fw.lazy((q) => import("./money.js" + q)),
  };
  const ctx = { S, core, fw, open: {} };
  const failed = (e) => { console.error(e); fw.toast("Couldn’t open that just now. Try again."); return null; };
  const via = (file, method) => (...a) => {
    const mine = episode;
    if (!here(mine)) return Promise.resolve(null);
    return LAZY[file]().then((m) => here(mine) ? m[method](ctx, ...a) : null, (e) => here(mine) ? failed(e) : null);
  };
  Object.assign(ctx.open, {
    stock: via("stock", "openStock"),
    addStock: (q = "") => openAdd(q),
    holding: via("edit", "openHolding"),
    cash: (id) => (Sheet.stack.length ? pushSheet : openSheet)(cashView, id),
    income: via("money", "openIncome"),
    isa: via("money", "openIsa"),
    vs: via("money", "openVs"),
    story: via("news", "openStory"),
    account: via("holdings", "openAccount"),
    about: via("holdings", "openAbout"),
  });
  // (a view pushed from another file, by name)
  const views = {
    stock: () => LAZY.stock().then((m) => m.stockView), holding: () => LAZY.edit().then((m) => m.editView), story: () => LAZY.news().then((m) => m.storyView),
    isa: () => LAZY.money().then((m) => m.isaView), income: () => LAZY.money().then((m) => m.incomeView), vs: () => LAZY.money().then((m) => m.vsView),
  };
  init(fw, root, ctx.open, views, () => { const mine = episode; return () => here(mine); });

  // ---- Add a Stock: its sheet and field made here, in the tap that asks for it, so the keyboard comes up (RI9); its
  // results and recent searches filled by edit.js once that's in
  let edit = null;
  function addView(q = "") {
    const input = h("input", { type: "search", id: "mk-q", "data-k": "find", placeholder: "Company, fund or symbol", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", "aria-label": "Find a company, fund, investment trust or symbol" });
    const results = h("div.results", { "data-el": "results" }, fw.ui.skeleton("rows", 4));
    const give = (m) => { edit = m; if (live() && onScreen && input.isConnected) m.fill(input, results, q); };
    if (edit) queueMicrotask(() => give(edit));
    else LAZY.edit().then(give, () => live() && input.isConnected && results.replaceChildren(h("p.hint", { text: "Couldn’t get the search ready just now. Try again in a moment." })));
    return [h("div.shead", {}, h("h2", { text: "Add a Stock" })), h("button.cash-add", { type: "button", onclick: () => ctx.open.cash() }, "Add cash instead"), h("label.field", {}, icon("search", 18, 2.2), input), results];
  }
  addView.sheet = "add-stock";
  addView.focus = "input[data-k=find]";
  const openAdd = (q = "") => live() && onScreen ? openSheet(addView, String(q || "").slice(0, 40)) : null;

  // ---- the sections
  const doc = root.ownerDocument, secs = new Map(), views2 = new Map(), drops = new Map(), stale = new Set();
  const stub = (id, el) => {
    let real = null, loading = null, dead = false;
    const load = () => (loading ??= LAZY[id]().then((m) => { if (dead || !live()) return null; real = m.view(el, ctx); return real; }, (e) => { loading = null; throw e; }));
    return {
      // (its file fetched ahead, at a quiet moment once Markets shows: its first show then drawn at once, no skeleton)
      warm() { if (!dead && live() && !real) load().catch(() => {}); },
      draw(animate) {
        if (dead || !live()) return;
        if (real) return real.draw(animate);
        el.replaceChildren(fw.ui.skeleton("rows", 6));
        load().then((v) => { if (v && !dead && live() && shown === id && onScreen) v.draw(animate); }, (e) => {
          if (dead || !live()) return;
          console.error(e);
          el.replaceChildren(fw.ui.error({ title: "This part of Markets didn’t open", body: "Try again in a moment.", acts: [{ label: "Try Again", act: "retry", run: () => draw(id) }] }));
        });
      },
      hide() { return real?.hide() || false; },
      destroy() { dead = true; real?.destroy(); real = null; el.replaceChildren(); },
    };
  };
  for (const [id, name] of SECTIONS) {
    const el = doc.createElement("section");
    el.className = "mk-sec";
    el.dataset.sec = id;
    el.setAttribute("aria-label", name);
    el.hidden = true;
    root.append(el);
    secs.set(id, el);
    views2.set(id, id === "today" ? todayView(el, ctx) : stub(id, el));
  }
  let shown = null, opening = 0;
  // (the other sections' files fetched once (not when Save Data is asked for), a moment after Markets first shows, so a first switch to one is instant)
  let warmed = false, warmT = 0;
  const warm = () => { if (warmed || warmT) return; warmT = setTimeout(() => { warmT = 0; if (!onScreen || fw.stale?.() || globalThis.navigator?.connection?.saveData) return; warmed = true; for (const v of views2.values()) v.warm?.(); }, 1200); };
  const draw = (id = shown, animate = false) => {
    if (!onScreen || !id) return;
    stale.delete(id);
    try { views2.get(id)?.draw(animate); } catch (e) { console.error(e); }
  };
  // (out of sight: after five minutes its DOM goes, drawn afresh on its next show; S2-D22)
  const away = (id) => { clearTimeout(drops.get(id)); drops.set(id, setTimeout(() => { if (shown === id && onScreen) return; secs.get(id)?.replaceChildren(); stale.add(id); }, DROP_AFTER)); };
  const back = (id) => { clearTimeout(drops.get(id)); drops.delete(id); };
  const header = () => {
    if (!onScreen) return;
    const T = core.totals(), said = core.lineSaid(), news = shown === "news" ? 0 : core.newsNew().length;
    fw.header.set({
      title: SECTIONS.find((s) => s[0] === shown)?.[1] || "Markets",
      compactTitle: T.o.length ? `Markets · ${core.pct(T.dayPct, 1)}` : "Markets",
      pick: null,
      // (fewer words where the screen is narrow, as app.js did: "London · 2h 5m left", so the time is never what's cut)
      line: S.loading && !S.me ? "Getting your list…" : said.short && (fw.screenEl?.clientWidth || 999) < 400 ? said.short : said.text,
      acts: [{ icon: "plus", label: "Add a Stock", run: () => ctx.open.addStock() }],
      badges: { news },
    });
  };
  // every section but the one showing is drawn afresh when it next shows
  const others = () => { for (const [id] of SECTIONS) if (id !== shown) stale.add(id); };
  // (a section about to be swiped to and never drawn: drawn now, out of sight: Today's swipe.js)
  const peek = (e) => { const id = e.detail; if (onScreen && views2.has(id) && !secs.get(id)?.childElementCount) { try { views2.get(id).draw(false); } catch (x) { console.error(x); } } };
  root.addEventListener("ifl-peek", peek);
  const offs = [
    () => root.removeEventListener("ifl-peek", peek),
    core.on("me", () => { others(); header(); draw(shown, true); }),
    core.on("list", () => { others(); header(); draw(); }),
    core.on("settings", () => { if (shown === "holdings") draw(); else stale.add("holdings"); }),
    // (before your list is in, each section shows where it's got to: on its way, or why it couldn't come, with Try Again:
    // todayview.notIn)
    core.on("loading", () => { header(); if (!S.me) { others(); draw(); } }),
    core.on("error", () => { header(); if (!S.me) { others(); draw(); } }),
    core.on("news", () => { header(); if (shown === "news") draw(); else stale.add("news"); }),
    core.on("quotes", (d) => {
      header();
      for (const n of Sheet.handle?.el?.querySelectorAll("[data-session]") || []) n.textContent = core.quoteSession(S.q[n.dataset.session], core.priceSaid, core.pct);
      if (!d?.was) return;
      for (const s of Object.keys(S.q)) { const a = d.was[s], b = S.q[s]; if (a && b && a.price !== b.price) paint(s, b.price > a.price); }
      if (shown === "today") views2.get("today")?.patch?.(d.was); else stale.add("today");
    }),
  ];
  // your holdings on this phone, Markets' sheets, and Find (connector.search, from what's live here)
  const unprovide = fw.search?.provide?.({
    id: "markets", group: "Markets", order: 30,
    search: (q) => connector.search(q, { userId: fw.session?.user?.id ?? null, kept: S.me ? { id: S.me.id, holdings: S.list, quotes: S.q } : null }),
  }) || (() => {});
  // a search's Find: Add a Stock with what was typed, here if Markets shows, else once it does
  const takeWant = () => { if (!want.q || Date.now() - want.at > 30e3) return false; const q = want.q; want.q = null; openAdd(q); return true; };
  want.open = () => { if (onScreen) takeWant(); else fw.nav.go("/markets/"); };
  // (a stock or a sheet asked for in the address: opened once your list is in, up to 20 s; a later one takes over)
  const whenReady = (my) => new Promise((done) => {
    const t0 = Date.now(), look = () => (my !== opening || !live() || !onScreen ? done(false) : S.me ? done(true) : Date.now() - t0 > 20e3 ? done(false) : setTimeout(look, 150));
    look();
  });
  const openFrom = async (route) => {
    const my = ++opening;
    if (!(await whenReady(my))) return;
    const { key, arg } = route;
    if (key === "s") {
      const sym = String(arg || "").toUpperCase();
      if (SYMBOL.test(sym)) ctx.open.stock(sym); else fw.toast("That isn’t a stock Markets knows.");
    } else if (key === "income" || key === "isa" || key === "vs" || key === "about") ctx.open[key]();
  };
  core.start(fw);

  return {
    async show(route) {
      if (!live()) return;
      episode++; opening++;
      const id = SECTIONS.some((s) => s[0] === route?.section) ? route.section : "today";
      if (shown && shown !== id) {
        try { if (views2.get(shown).hide()) stale.add(shown); } catch (e) { console.error(e); }
        if (shown === "news") core.leftNews();
        away(shown);
      }
      if (id === "news" && shown !== "news") S.newsSince = core.newsSeen();
      for (const [k, el] of secs) el.hidden = k !== id;
      // (a section drawn afresh only when it's new, out of date, or Markets is coming back on screen: switching between
      // Today, Holdings and News leaves each as it was, nothing drawing in again; its entrance only on a first draw)
      // (the entrance plays only as Markets comes on screen, never on a switch between its sections)
      const empty = !secs.get(id).childElementCount, fresh = !onScreen || stale.has(id) || empty, coming = !onScreen;
      shown = id; onScreen = true;
      back(id);
      core.at(id);
      core.shown(true);
      header();
      if (fresh) draw(id, empty && coming);
      if (route?.key && route.key !== id && route.key !== "today") openFrom(route);
      takeWant();
      warm();
    },
    hide() {
      episode++; opening++;
      onScreen = false;
      core.shown(false);
      if (shown) { try { views2.get(shown).hide(); } catch (e) { console.error(e); } away(shown); }
    },
    back: () => false,
    busy: () => core.busy(),
    // (what isn't kept yet: a reorder on its way to your account, waited for)
    flush: () => core.flush(),
    // the open stock (its sheet), else your portfolio's day on Today: name, sym, pct and day only (S2-D6)
    sendable() {
      if (topView()?.sheet === "stock" && typeof topArg() === "string") return core.stockSend(topArg());
      if (shown === "today" && onScreen) return core.portfolioSend();
      return null;
    },
    unmount() {
      mounted = false; episode++; clearTimeout(warmT); opening++;
      onScreen = false;
      want.open = null;
      for (const off of offs) off();
      unprovide();
      for (const t of drops.values()) clearTimeout(t);
      if (Sheet.handle) closeSheet();
      for (const v of views2.values()) { try { v.destroy(); } catch (e) { console.error(e); } }
      for (const el of secs.values()) el.remove();
      secs.clear(); views2.clear(); shown = null;
      core.stop();
      release();
    },
  };
}
