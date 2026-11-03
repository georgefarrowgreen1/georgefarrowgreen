// Chats' module entry (One roof, stage 3: roof/s3/spec.md §3.1, §3.4, §5.2; the module contract v1, S1 §5.1).
// B0's stub (frozen exports, the agreed imports), UI-A's to write: mount(root, fw) gets the service only through
// fw.service() (never imports service.js, S3-C2), makes the store and feeds it every patch, builds section.ch-sec[data-sec]
// for each of SECTIONS and the chat host, and gives back an instance with every method. The stub draws placeholders.
//   CONTRACT = 1; BUILD, NEWS = pigeon/app.js's APP_VERSION, APP_NEWS (roofcontract pins them; I raises them together);
//   PROTOCOL = core.js's and service.js's (pinned); SECTIONS = REGISTRY.chats.sections = the connector's.
//   deviceOf(): theme.js's device rule, copied line for line (S3-D13; roofcontract pins the copy): "phone" | "computer".
// Every lazy file only through fw.lazy((q) => import("./x.js" + q)) (D21, s24 §7): send, sheets, flight, media, scan,
// settings.
import { connector } from "./connector.js";
import { createStore } from "./store.js";
import { view as listView, openNewChat, openNewGroup } from "./list.js";
import { view as friendsView, openRequests, openAddFriend } from "./friends.js";
import { view as chatView } from "./chat.js";
import { view as lockView } from "./lock.js";

export const CONTRACT = 1;
export const BUILD = "1.69";
export const NEWS = "In InFlite, Chats follows your phone’s Light or Dark until you choose one";
export const PROTOCOL = 1;
export const SECTIONS = [["chats", "Chats"], ["friends", "Friends"]];
export const STUB = true;

// (theme.js's rule, as it has it: Chat is for phones and iPads; anything else is a computer)
export function deviceOf() {
  var ua = navigator.userAgent || "";
  var touched = navigator.maxTouchPoints > 1;
  var mobile = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && touched) || (/Linux/.test(ua) && touched && matchMedia("(pointer: coarse)").matches);
  return mobile ? "phone" : "computer";
}

// (the lazy files, each through fw.lazy)
const lazyFiles = (fw) => ({
  send: () => fw.lazy((q) => import("./send.js" + q)),
  sheets: () => fw.lazy((q) => import("./sheets.js" + q)),
  flight: () => fw.lazy((q) => import("./flight.js" + q)),
  media: () => fw.lazy((q) => import("./media.js" + q)),
  scan: () => fw.lazy((q) => import("./scan.js" + q)),
  settings: () => fw.lazy((q) => import("./settings.js" + q)),
});

export async function mount(root, fw) {
  const ui = fw.ui, store = createStore(), files = lazyFiles(fw);
  const ctx = { fw, svc: null, store, open: { openNewChat, openNewGroup, openRequests, openAddFriend }, lazy: files };
  let off = null;
  fw.service().then((svc) => { ctx.svc = svc; off = svc?.on?.("*", (p) => store.apply(p)) || null; }, () => {});
  const secs = {}, views = {};
  for (const [id, label] of SECTIONS) {
    const s = ui.el("section", { class: "ch-sec", data: { sec: id }, hidden: true, "aria-label": label }, ui.empty({ title: label, body: "Not built yet." }));
    root.append(s);
    secs[id] = s;
  }
  const host = ui.el("div", { class: "ch-chat", hidden: true }), veil = ui.el("div", { class: "ch-lock", hidden: true });
  root.append(host, veil);
  views.chats = listView(secs.chats, ctx); views.friends = friendsView(secs.friends, ctx);
  views.chat = chatView(host, ctx); views.lock = lockView(veil, ctx);
  void deviceOf; void connector;
  return {
    show(route) {
      for (const [id, s] of Object.entries(secs)) s.hidden = id !== route.section;
      return Promise.resolve();
    },
    hide() {},
    back: () => false,
    busy: () => false,
    flush: () => Promise.resolve({ lost: 0 }),
    sendable: () => null,
    unmount() { off?.(); store.clear(""); for (const v of Object.values(views)) v.unmount(); },
  };
}
