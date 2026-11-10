// Chats' module: its entry under InFlite's roof (One roof, stage 3: roof/s3/spec.md §2.1, §3, §5.2, S3-D9, S3-D10,
// S3-D13, S3-D14, S3-D17). Loaded by the framework (roof/modules.js) on first open; it never imports service.js: the
// one service (the crypto core in its Worker) is the frame's, handed over by fw.service().
//
// Exports (roofcontract reads them from this file's text, each a literal on one line): CONTRACT = 1; BUILD and NEWS =
// pigeon/app.js's APP_VERSION and APP_NEWS (I raises them together); PROTOCOL = core.js's and service.js's; SECTIONS =
// REGISTRY.chats.sections = connector.sections; mount(root, fw) → Promise<instance>.
// instance = { show(route), hide(), back() → false, busy(), sendable() → null, flush() → Promise<{ lost }>, unmount() }
//
// What mount builds, in root (div.m-chats): the state panel (signin, key, ended, offline, device, error: words and one
// action each, §2.1), the lock screen (lock.js), section.ch-sec[data-sec=chats] (list.js) and [data-sec=friends]
// (friends.js), and the chat host (chat.js), one shown at a time. The views share ctx (frozen) = { fw, svc, store, open }:
// svc the service (null until fw.service() answers; its calls refused till then), store the page's copy of the core's
// topics (store.js), open the bound openers: newChat(), newGroup(), requests(), addFriend(handle) (static); friendInfo(id),
// groupInfo(id), safety(id), view(msgId), hold(target), map(msgId), flightLog(), news(), settings(page), photo(id),
// voice(id), gifs(id), send({ card, words, to }) (lazy, through fw.lazy, UI-B's files).
// Header: the root (tab-screen style: the frame draws your photo and no crumb): title "Chats", line "2 unread · 1 in
// the air", the switcher Chats · Friends, acts New Chat and Chat Settings (none while locked or not ready); a chat:
// chat.js's (Back "Back to Chats", no switcher, Info). The Chats tab's badge: the unread count (fw.tabs.badge).
// While shown and visible: start({ visible, screen: true }) on show, a sync every 15 s (S3-D10); hidden, none.
import { createStore } from "./store.js";
import { view as listView, openNewChat, openNewGroup } from "./list.js";
import { view as friendsView, openRequests, openAddFriend } from "./friends.js";
import { view as chatView } from "./chat.js";
import { view as lockView, watch as lockWatch } from "./lock.js";
import { readShareHash } from "../cards.js";

export const CONTRACT = 1;
export const BUILD = "2.02";
export const NEWS = "Rounded controls, clearer spacing and centred icons";
export const PROTOCOL = 1;
export const SECTIONS = [["chats", "Chats"], ["friends", "Friends"]];

const SYNC_MS = 15e3;
// (never connector.js, as Mail's mail.js: the framework asks for it unstamped, REGISTRY.chats.connector, and an
// import here is stamped as it's sent ("./connector.js?v=…", functions/_app.js), so it was fetched and run twice;
// connector.files names it all the same, to keep it offline)

// (theme.js's rule, as it has it: Chat is for phones and iPads; anything else is a computer, shown "Chats is on your
// phone" with a code, and the core never starts there, S3-D13; roofcontract pins the copy)
export function deviceOf() {
  var ua = navigator.userAgent || "";
  var touched = navigator.maxTouchPoints > 1;
  var mobile = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && touched) || (/Linux/.test(ua) && touched && matchMedia("(pointer: coarse)").matches);
  return mobile ? "phone" : "computer";
}

// (the words of each state, and its one action: §2.1)
const STATE_WORDS = {
  signin: { title: "Sign in to Chats", body: "Your chats are end-to-end encrypted: sign in to open them on this phone.", act: "Sign In", href: "/chats/in/#signin-start&then=%2Fchats%2F" },
  key: { title: "Unlock Chats on this phone", body: "Your messages are locked to your key. Unlock once here, with your passkey or your password.", act: "Unlock Chats", href: "/chats/in/#signin-start&then=%2Fchats%2F" },
  ended: { title: "You’ve been signed out of Chats", body: "This sign-in was ended on another device or by a new password.", act: "Sign In", href: "/chats/in/#signin-start&then=%2Fchats%2F" },
  offline: { title: "No signal", body: "Your chats will show when you’re back online." },
  device: { title: "Chats is on your phone", body: "Scan this with your phone’s camera to open Chats there." },
};

export async function mount(root, fw) {
  const ui = fw.ui, el = ui.el, doc = root.ownerDocument;
  root.classList.add("m-chats");
  const store = createStore();
  const ctx = { fw, svc: null, store, open: {} };
  let dead = false, onScreen = false, episode = 0;
  const live = () => !dead && !fw.signal?.aborted;
  const here = (mine) => live() && onScreen && episode === mine;
  // (until the service answers, every call waits for it; a failure says why "offline")
  let svcP = null, svc = null;
  const call = (m, ...a) => !live() ? Promise.reject({ why: "offline" }) : (svc ? svc.call(m, ...a) : (svcP || Promise.reject({ why: "offline" })).then((s) => live() && s ? s.call(m, ...a) : Promise.reject({ why: "offline" })));
  ctx.svc = { call, on: (t, fn) => (live() && svc ? svc.on(t, fn) : () => {}) };

  // ---- the openers ----
  const lazyFail = () => { fw.toast("That needs a connection. Try again when you’re back online."); return null; };
  const L = {
    sheets: () => fw.lazy((q) => import("./sheets.js" + q)),
    flight: () => fw.lazy((q) => import("./flight.js" + q)),
    settings: () => fw.lazy((q) => import("./settings.js" + q)),
    media: () => fw.lazy((q) => import("./media.js" + q)),
    send: () => fw.lazy((q) => import("./send.js" + q)),
  };
  const lz = (file, name) => (...a) => {
    const mine = episode;
    if (!here(mine)) return Promise.resolve(null);
    return L[file]().then((m) => here(mine) ? m[name](ctx, ...a) : null, () => here(mine) ? lazyFail() : null);
  };
  Object.assign(ctx.open, {
    newChat: () => openNewChat(ctx), newGroup: () => openNewGroup(ctx), requests: () => openRequests(ctx), addFriend: (h) => openAddFriend(ctx, h),
    friendInfo: lz("sheets", "openFriendInfo"), groupInfo: lz("sheets", "openGroupInfo"), safety: lz("sheets", "openSafety"),
    view: lz("sheets", "openView"), hold: lz("sheets", "openHold"),
    map: lz("flight", "openMap"), flightLog: lz("flight", "openFlightLog"), news: lz("flight", "openNews"),
    settings: lz("settings", "openChatSettings"),
    photo: lz("media", "pickPhoto"), voice: lz("media", "recordVoice"), gifs: lz("media", "openGifs"),
    send: (o) => { const mine = episode; return here(mine) ? L.send().then((m) => here(mine) ? m.openSend(fw, ctx.svc, o) : null, () => here(mine) ? lazyFail() : null) : Promise.resolve(null); },
  });
  Object.freeze(ctx);

  // ---- what's in root ----
  const panel = el("div", { class: "ch-state", hidden: true });
  const lockBox = el("div", { class: "ch-lockbox" });
  const secs = new Map(), views = new Map();
  for (const [id, name] of SECTIONS) {
    const s = el("section", { class: "ch-sec", data: { sec: id }, aria: { label: name }, hidden: true });
    secs.set(id, s);
  }
  const host = el("div", { class: "ch-host" });
  root.append(panel, lockBox, ...secs.values(), host);
  views.set("chats", listView(secs.get("chats"), ctx));
  views.set("friends", friendsView(secs.get("friends"), ctx));
  const chat = chatView(host, ctx);
  const lock = lockView(lockBox, ctx);
  const unwatch = lockWatch(ctx, root);

  let shown = null, route = null, stateNow = deviceOf() === "computer" ? "device" : null, failed = false, syncT = 0, opening = 0;
  const offs = [];

  // ---- the header ----
  function lineNow() {
    const n = store.get("unread") || 0, air = (store.get("air") || []).length;
    return [n ? `${n} unread` : "", air ? `${air} in the air` : ""].filter(Boolean).join(" · ");
  }
  function header() {
    if (!onScreen || chat.id) return;
    const ready = stateNow === "ready" && !failed;
    fw.header.set({ title: "Chats", compactTitle: "Chats", line: ready ? lineNow() : "", pick: null, sections: ready ? true : false, back: null,
      acts: ready ? [{ icon: "compose", label: "New Chat", run: () => ctx.open.newChat() }, { icon: "settings", label: "Chat Settings", run: () => ctx.open.settings() }] : [] });
  }

  // ---- states (§2.1) ----
  function drawPanel() {
    panel.replaceChildren();
    if (failed) {
      panel.append(el("div", { data: { state: "error" } }, ui.error({ title: "Chats couldn’t open", body: "Something went wrong starting Chats on this phone.",
        acts: [{ label: "Try Again", primary: true, act: "retry", run: () => { failed = false; svcP = null; svc = null; connect(); paint(); } },
          { label: "Open Chats on Its Own", act: "own", href: `${fw.session?.links?.chat || "https://chat.inflite.ai"}/` }] })));
      return;
    }
    // (before the core's first answer: placeholder rows, not an empty screen)
    if (stateNow == null) { panel.append(ui.skeleton("rows", 4)); return; }
    const w = STATE_WORDS[stateNow];
    if (!w) return;
    if (stateNow === "offline") { panel.append(el("div", { data: { state: "offline" } }, ui.empty({ title: "No signal", body: "Your chats will show when you’re back online." }))); return; }
    const box = el("div", { class: `ch-st ch-st-${stateNow}`, data: { state: stateNow } }, el("h2", { text: w.title }), el("p", { text: w.body }));
    if (w.href) box.append(ui.btn(w.act, { primary: true, href: w.href, act: stateNow === "key" ? "unlock" : "signin" }));
    if (stateNow === "device") {
      const code = el("div", { class: "ch-qr", data: { k: "qr" }, aria: { label: "A code to scan" } });
      box.append(code);
      // (the code for this link, drawn by Chat's qr.js: an SVG it writes with everything in it its own)
      fw.lazy((q) => import("../qr.js" + q)).then((m) => {
        if (!live() || !code.isConnected) return;
        const t = doc.createElement("template");
        t.innerHTML = m.qrSvg(new URL("/chats/", globalThis.location?.href || "https://inflite.ai/").href, { title: "QR code for Chats" });
        code.replaceChildren(t.content);
      }, () => {});
    }
    panel.append(box);
  }
  // (what shows: the panel, the lock, a section, or the chat)
  function paint() {
    const ready = stateNow === "ready" && !failed, locked = stateNow === "locked" && !failed;
    panel.hidden = ready || locked;
    if (!panel.hidden) drawPanel();
    if (locked) lock.show(); else lock.hide();
    const want = ready && route ? (route.key === "open" && route.arg ? "chat" : sectionOf(route)) : null;
    for (const [id, s] of secs) s.hidden = want !== id;
    if (onScreen) {
      for (const [id, v] of views) { if (want === id) v.show(route); else v.hide(); }
      if (want !== "chat" && chat.id) leaveChat();
    }
    header();
  }
  const sectionOf = (r) => (SECTIONS.some(([id]) => id === r?.section) ? r.section : "chats");

  // ---- the service ----
  function onState(d) {
    const s = d?.state;
    if (!live() || !s || s === stateNow) return;
    const was = stateNow;
    stateNow = s;
    if (s === "locked" || was === "ready") forgetWords();
    paint();
    if (s === "ready" && onScreen) openRoute(route);
  }
  // (locked, or no longer ready: the chat on screen and every last line let go of, S3-D14)
  function forgetWords() {
    if (chat.id) leaveChat();
    store.clear("chat:");
    store.clear("typing:");
    const rows = store.get("rows");
    if (rows) store.apply("rows", rows.map(({ line, ...r }) => r));
  }
  function connect() {
    if (!live() || stateNow === "device" || svcP) return svcP;
    svcP = fw.service().then((s) => {
      if (!live()) return null;
      svc = s;
      // (every patch into the store; "*" first replays the last value of each topic but chat:* and typing:*)
      offs.push(s.on("*", (p) => store.apply(p)));
      offs.push(store.on("state", onState), store.on("unread", (n) => fw.tabs?.badge?.(Number(n) || 0)),
        ...["unread", "air"].map((k) => store.on(k, header)));
      return s;
    });
    svcP.catch(() => { if (!live()) return; failed = true; svcP = null; paint(); });
    return svcP;
  }

  // ---- the route ----
  async function openRoute(r) {
    if (!live() || !onScreen || !r || stateNow !== "ready") return;
    const my = ++opening;
    if (r.key === "open" && r.arg) {
      for (const v of views.values()) v.hide();
      for (const s of secs.values()) s.hidden = true;
      const ok = await chat.show(r);
      if (my !== opening || !live() || !onScreen) return;
      if (!ok) {
        chat.hide();
        fw.toast("That chat isn’t on this phone");
        fw.nav.go("/chats/", { replace: true });
      }
      return;
    }
    if (chat.id) leaveChat();
    switch (r.key) {
      case "settings": case "account": ctx.open.settings(r.key === "account" ? "account" : null); break;
      case "flightlog": ctx.open.flightLog(); break;
      case "requests": ctx.open.requests(); break;
      case "add": ctx.open.addFriend(r.arg || ""); break;
      case "share": {
        // (the raw hash, read once: the words leave the address as the frame tidies it, S3-D7)
        // (route.hash is the hash less its "#"; cards.js reads "#share=…")
        const h = String(r.hash || "").replace(/^#?/, "#");
        const { words, card } = readShareHash(h);
        const back = new URLSearchParams(h.slice(1)).get("back");
        ctx.open.send({ card, words, to: null }).then((res) => { if (live() && onScreen && my === opening && res && back && /^\/[\w/-]*$/.test(back) && !back.startsWith("//")) fw.nav.go(back, { replace: true }); });
        break;
      }
    }
  }
  function leaveChat() {
    chat.hide();
    call("leave").catch(() => {});
  }
  // (S3-D10: while the screen shows and the page is visible, start and sync every 15 s; else nothing)
  const timers = () => {
    clearInterval(syncT); syncT = 0;
    if (!onScreen || !fw.visible() || stateNow === "device") return;
    call("start", { visible: true, screen: true }).catch(() => {});
    syncT = setInterval(() => { if (stateNow === "ready") call("sync", { quiet: false }).catch(() => {}); }, SYNC_MS);
  };
  offs.push(fw.on("visible", timers), fw.on("hidden", () => { clearInterval(syncT); syncT = 0; }));
  const onLine = () => { if (onScreen && navigator.onLine && stateNow === "offline") call("sync", { quiet: false }).catch(() => {}); };
  globalThis.addEventListener("online", onLine);
  connect();
  paint();

  return {
    async show(r) {
      if (!live()) return;
      episode++;
      route = r || { section: "chats" };
      onScreen = true;
      if (stateNow !== "device") connect();
      paint();
      timers();
      await openRoute(route);
    },
    hide() {
      episode++; onScreen = false;
      opening++;
      clearInterval(syncT); syncT = 0;
      for (const v of views.values()) v.hide();
      if (chat.id) leaveChat();
    },
    back: () => false,
    busy: () => chat.busy(),
    sendable: () => null,
    async flush() { return chat.flush(); },
    unmount() {
      this.hide();
      dead = true;
      for (const f of offs) { try { f?.(); } catch (_) {} }
      offs.length = 0;
      globalThis.removeEventListener("online", onLine);
      unwatch();
      store.clear("chat:");
      store.clear("typing:");
      const rows = store.get("rows");
      if (rows) store.apply("rows", rows.map(({ line, ...x }) => x));
      chat.unmount(); lock.unmount();
      for (const v of views.values()) v.unmount();
      root.replaceChildren();
      root.classList.remove("m-chats");
    },
  };
}
