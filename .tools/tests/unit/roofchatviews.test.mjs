// Chats' views under InFlite's roof (One roof, stage 3, spec §3.2, §10.1 roofchatviews; UI-A): the module mounted on the
// kit's stand-in DOM (roofkit/fakedom.mjs) with the framework's own ui.js, a stand-in fw and a stand-in service that
// feeds patches as the core would. Proved: store topics → view patches (rows, friends, a chat's messages, the badge, the
// header's line); a null patch deletes a topic and its view's words; clear("chat:") and blanked row lines on locked and
// on unmount; leaving a chat takes its words out of the DOM and the store; every word from data is text (escaped), never
// markup; no style attribute and no inline handler anywhere in what's drawn; each state of §2.1 with its words; an id
// that isn't on this phone → the list and a toast; New Chat / Add Friend / Requests sheets by their names.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { roofSkip, ROOF } from "./fixtures/roof.mjs";
import { fakeDocument, El } from "../roofkit/fakedom.mjs";

const MOD = new URL("../../../pigeon/roof/", import.meta.url);
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 3; i++) { await tick(); await new Promise((r) => setTimeout(r, 20)); } };

// (what the fake DOM lacks that the views ask of a browser: layout and scrolling, numbers only)
if (!("scrollHeight" in El.prototype)) Object.defineProperties(El.prototype, {
  scrollHeight: { get() { return 1000; }, configurable: true },
  clientHeight: { get() { return 400; }, configurable: true },
  scrollTop: { get() { return this._st ?? 0; }, set(v) { this._st = v; }, configurable: true },
  content: { get() { const f = new El("div", this.ownerDocument); f.append(...this.childNodes); return f; }, configurable: true },
});
El.prototype.getBoundingClientRect ??= function () { return { top: 0, bottom: 10 }; };

// ---- a world: two friends, one group, a chat with words that try to be markup ----
const NOW = Date.UTC(2026, 10, 3, 12);
const EVIL = `<img src=x onerror="alert(1)">&"'`;
const WORLD = {
  me: { id: "u-me", name: "Sam Taylor", handle: "sam", avatar: null, pigeons: true, startAs: "instant", death: false, feathers: 0 },
  friends: [
    { id: "f-pat", handle: "pat", name: `Pat ${EVIL}`, avatar: null, online: true, lastSeen: null, keyChanged: false, verified: false, blocked: false },
    { id: "f-lee", handle: "lee", name: "Lee Moss", avatar: null, online: false, lastSeen: NOW - 3600e3, keyChanged: true, verified: false, blocked: false },
  ],
  groups: [{ id: "g-one", name: "Cyclists", members: [{ id: "f-pat", name: "Pat" }, { id: "f-lee", name: "Lee" }], muted: false }],
  requests: [{ id: "r-1", handle: "kim", name: "Kim Ray", at: NOW - 6e4, dir: "in" }],
  rows: [
    { id: "f-pat", kind: "friend", name: `Pat ${EVIL}`, avatar: null, unread: 2, flying: 0, pinned: false, at: NOW - 6e4, keyChanged: false, line: `See you ${EVIL}` },
    { id: "g-one", kind: "group", name: "Cyclists", avatar: null, unread: 0, flying: 1, pinned: true, at: NOW - 864e5, keyChanged: false },
  ],
  air: [{ id: "m-air", chatId: "f-pat", kind: "swift", from: "Pat", to: "me", landsAt: NOW + 12 * 6e4 }],
  outbox: [], keywarn: { mine: false, friends: [] }, unread: 2,
};
const chatOf = (id) => ({ id, kind: id.startsWith("g-") ? "group" : "friend", older: false, msgs: [
  { id: "m1", from: "them", at: NOW - 7200e3, kind: "text", text: `Hello ${EVIL}`, reactions: { "👍": 1 }, read: true, delivered: true, recalled: false },
  { id: "m2", from: "me", at: NOW - 60e3, kind: "text", text: "On my way https://example.com/a.", reactions: {}, mine: undefined, read: false, delivered: true, recalled: false },
] });

// ---- the stand-in service: patches as the core sends them; calls recorded ----
function fakeService(state = "ready") {
  const subs = new Map(), calls = [];
  const emit = (topic, data) => {
    for (const [k, fns] of subs) {
      if (k === topic) for (const f of [...fns]) f(data);
      else if (k === "*" || (k.endsWith(":") && topic.startsWith(k))) for (const f of [...fns]) f({ topic, data });
    }
  };
  const svc = {
    calls, emit,
    on(t, fn) { if (!subs.has(t)) subs.set(t, new Set()); subs.get(t).add(fn); return () => subs.get(t).delete(fn); },
    async call(m, ...a) {
      calls.push([m, ...a]);
      switch (m) {
        case "start": emit("state", { state }); for (const k of ["me", "friends", "groups", "requests", "rows", "air", "outbox", "keywarn", "unread"]) emit(k, WORLD[k]); return { state };
        case "open": { if (!/^(f-pat|f-lee|g-one)$/.test(a[0])) throw { why: "no" }; const c = chatOf(a[0]); emit(`chat:${a[0]}`, c); return c; }
        case "leave": return { ok: true };
        case "rows": return WORLD.rows;
        case "lock": state = a[0] ? "locked" : "ready"; emit("state", { state }); if (a[0]) { emit("chat:f-pat", null); } return { state };
        default: return { ok: true };
      }
    },
  };
  return svc;
}

// ---- the stand-in fw, over the framework's own ui.js ----
async function world({ state = "ready", device = false } = {}) {
  const doc = fakeDocument();
  globalThis.document = doc;
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: { userAgent: device ? "Mozilla/5.0 (X11; Linux x86_64)" : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile", maxTouchPoints: device ? 0 : 5, onLine: true } });
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
  const ui = await import(new URL("ui.js", ROOF));
  const svc = fakeService(state);
  const log = { header: [], go: [], toasts: [], sheets: [], badge: [], fill: [], away: [] };
  const ons = {};
  const fw = {
    contract: 1, app: "chats", ui,
    header: { set: (o) => log.header.push(o) },
    nav: { href: (k, a) => `/chats/#${k}=${a}`, go: (p, o) => log.go.push([p, o]), back() {}, depth: () => 1, section() {} },
    sheet: { open: (spec) => { const el = doc.createElement("dialog"); el.dataset.sheet = spec.sheet; const body = doc.createElement("div"); el.append(body);
      if (spec.body?.nodeType) body.append(spec.body); const h = { el, body, closed: false, close() { h.closed = true; spec.onClose?.(); }, setBusy() {}, push() {}, pop() {} }; log.sheets.push([spec.sheet, h, spec]); return h; } },
    toast: (t) => { log.toasts.push(t); return { close() {} }; },
    lazy: () => Promise.reject(new Error("not in this test")),
    service: async () => svc,
    tabs: { away: (v) => log.away.push(v), badge: (n) => log.badge.push(n) },
    fill: (v) => log.fill.push(v),
    visible: () => true,
    on: (e, f) => { (ons[e] ||= new Set()).add(f); return () => ons[e].delete(f); },
    session: { user: { id: "u-me" }, links: { chat: "https://chat.example" } },
  };
  const M = await import(new URL("chats.js", MOD));
  const root = doc.createElement("div");
  doc.body.append(root);
  const inst = await M.mount(root, fw);
  live.add(inst);
  return { doc, root, inst, fw, svc, log, ons, M };
}
const live = new Set();
after(() => { for (const i of live) { try { i.hide(); i.unmount(); } catch (_) {} } });
const html = (n) => n.outerHTML;
// (a click that bubbles, as a browser's does: dispatched on the element and each element above it)
const tap = (n) => { for (let p = n; p && p.nodeType === 1; p = p.parentNode) p.dispatch("click", { target: n }); };
const els = (n) => [n, ...n.querySelectorAll("*")];
const sec = (root, id) => root.querySelector(`section[data-sec=${id}]`);
// (no markup from data: the evil words only ever as escaped text, and nothing with a style or on* attribute)
function clean(root) {
  assert.ok(!els(root).some((n) => n.localName === "img"), "data never becomes markup");
  assert.ok(!html(root).includes("<!--raw-->"), "no raw HTML");
  for (const n of els(root)) for (const k of n.attrs.keys()) assert.ok(k !== "style" && !/^on/.test(k), `no ${k} attribute`);
}

test("the list draws the core's rows, pinned first, escaped; the badge and the header's line follow unread and air", { skip: roofSkip }, async () => {
  const { root, inst, svc, log } = await world();
  await inst.show({ kind: "app", app: "chats", section: "chats", key: null, arg: null });
  await settle();
  const rows = sec(root, "chats").querySelectorAll("a.ch-row");
  assert.deepEqual(rows.map((r) => r.dataset.id), ["g-one", "f-pat"], "pinned first, then newest");
  assert.ok(rows[1].textContent.includes(`See you ${EVIL}`), "the line as text");
  assert.equal(rows[1].getAttribute("href"), "/chats/#open=f-pat");
  clean(root);
  assert.equal(log.badge.at(-1), 2, "the tab's unread count");
  const h = log.header.at(-1);
  assert.equal(h.title, "Chats");
  assert.equal(h.line, "2 unread · 1 in the air");
  assert.deepEqual(h.acts.map((a) => a.label), ["New Chat", "Chat Settings"]);
  assert.ok(svc.calls.some(([m, o]) => m === "start" && o.visible && o.screen), "start({ visible, screen }) on show");
  assert.ok(svc.calls.some(([m]) => m === "rows"), "the lines asked for the rows in sight");
  // (a new rows patch: the list follows; a row whose sig hasn't changed is the same element)
  const keep = rows[0];
  svc.emit("rows", [WORLD.rows[1], { ...WORLD.rows[0], unread: 0, line: "Bye" }, { id: "f-lee", kind: "friend", name: "Lee Moss", avatar: null, unread: 0, flying: 0, pinned: false, at: NOW - 9e6, keyChanged: true }]);
  await settle();
  const again = sec(root, "chats").querySelectorAll("a.ch-row");
  assert.deepEqual(again.map((r) => r.dataset.id), ["g-one", "f-pat", "f-lee"]);
  assert.equal(again[0], keep, "an unchanged row is kept as it was");
  assert.ok(again[2].textContent.includes("Security key changed"));
  // (In the Air)
  assert.ok(sec(root, "chats").querySelector(".ch-air .ch-airp"), "In the Air");
  inst.hide(); inst.unmount();
});

test("Friends: the requests row, friends by name, groups; Add Friend and Requests open their sheets", { skip: roofSkip }, async () => {
  const { root, inst, svc, log } = await world();
  await inst.show({ kind: "app", app: "chats", section: "friends", key: null, arg: null });
  await settle();
  const f = sec(root, "friends");
  assert.equal(f.hidden, false);
  assert.equal(sec(root, "chats").hidden, true);
  assert.deepEqual(f.querySelectorAll(".ch-friends a.ch-row").map((r) => r.dataset.id), ["f-lee", "f-pat"]);
  assert.deepEqual(f.querySelectorAll(".ch-groups a.ch-row").map((r) => r.dataset.id), ["g-one"]);
  assert.ok(f.textContent.includes("Kim Ray wants to be friends"));
  clean(root);
  tap(f.querySelector("[data-act=requests]"));
  assert.equal(log.sheets.at(-1)[0], "requests");
  tap(f.querySelector("[data-act=addfriend]"));
  assert.equal(log.sheets.at(-1)[0], "addfriend");
  void svc;
  inst.hide(); inst.unmount();
});

test("the composer clears the home-bar gap only while the keyboard is up, including an iOS Home Screen viewport", { skip: roofSkip }, async () => {
  const saved = Object.fromEntries(["visualViewport", "innerHeight", "screen", "matchMedia", "getComputedStyle"].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const listeners = new Map();
  const vv = { height: 844, offsetTop: 0, scale: 1,
    addEventListener(k, f) { listeners.set(k, f); }, removeEventListener(k) { listeners.delete(k); } };
  globalThis.visualViewport = vv;
  globalThis.innerHeight = 844;
  globalThis.screen = { width: 390, height: 844 };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "20px" });
  let inst;
  try {
    const w = await world(); inst = w.inst;
    globalThis.matchMedia = () => ({ matches: true });
    await inst.show({ kind: "app", app: "chats", section: "chats", key: "open", arg: "f-pat" });
    const box = w.root.querySelector(".ch-chat"), input = box.querySelector("textarea");
    const keyboard = () => box.classList.contains("ch-kbup");
    input.focus(); input.dispatch("focus");
    assert.equal(keyboard(), false, "focusing alone must not move the composer under a finger");
    assert.equal(box.style.getPropertyValue("--ch-vvh"), "864px", "Home Screen correction remains without a keyboard");
    vv.height = 480; vv.offsetTop = 12; listeners.get("resize")();
    assert.equal(keyboard(), true);
    assert.equal(box.style.getPropertyValue("--ch-vvh"), "480px", "no Home Screen correction over the keyboard");
    assert.equal(box.style.getPropertyValue("--ch-vvtop"), "12px");
    globalThis.innerHeight = 480; listeners.get("resize")();
    assert.equal(keyboard(), true, "iOS can shrink the layout viewport as well");
    vv.scale = 2; listeners.get("resize")();
    assert.equal(keyboard(), false, "pinch zoom is not a keyboard");
    vv.scale = 1; vv.height = globalThis.innerHeight = 844; listeners.get("resize")();
    assert.equal(keyboard(), false, "keyboard dismissal restores the home-bar padding even while focused");
    vv.height = globalThis.innerHeight = 480;
    globalThis.matchMedia = (q) => ({ matches: q.includes("portrait") });
    listeners.get("resize")();
    assert.equal(keyboard(), false, "a short desktop window with a hardware keyboard keeps its normal spacing");
    inst.hide();
    assert.equal(listeners.size, 0, "viewport listeners leave with the conversation");
  } finally {
    inst?.unmount();
    for (const [k, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
    }
  }
});

test("a chat: opened by #open, drawn escaped with links as text, header Back/Info and no switcher, fill and the tab bar away; leaving takes its words away", { skip: roofSkip }, async () => {
  const { root, inst, svc, log } = await world();
  await inst.show({ kind: "app", app: "chats", section: "chats", key: "open", arg: "f-pat" });
  await settle();
  const box = root.querySelector(".ch-chat");
  assert.equal(box.hidden, false);
  assert.equal(sec(root, "chats").hidden, true, "the list is hidden under a chat");
  const bubbles = box.querySelectorAll(".ch-bubble");
  assert.equal(bubbles.length, 2);
  assert.ok(bubbles[0].textContent.includes(`Hello ${EVIL}`));
  assert.equal(bubbles[1].querySelector("a").getAttribute("href"), "https://example.com/a", "an address as a link, its full stop outside");
  assert.ok(box.querySelector(".ch-r").textContent.includes("👍"));
  clean(root);
  const h = log.header.at(-1);
  assert.equal(h.sections, false);
  assert.deepEqual(h.back, { label: "Back to Chats" });
  assert.equal(h.acts[0].icon, "info");
  assert.ok(log.fill.includes(true) && log.away.includes(true));
  // (typing, then the core's null for it)
  svc.emit("typing:f-pat", { on: true });
  await settle();
  assert.equal(box.querySelector(".ch-typing").hidden, false);
  svc.emit("typing:f-pat", null);
  await settle();
  assert.equal(box.querySelector(".ch-typing").hidden, true, "null deletes the topic");
  // (the composer: busy while there are words; sendText on Send)
  const input = box.querySelector("textarea");
  input.value = "Hi there";
  input.dispatch("input");
  assert.equal(inst.busy(), true);
  tap(box.querySelector("[data-act=send]"));
  await settle();
  assert.ok(svc.calls.some(([m, id, t]) => m === "sendText" && id === "f-pat" && t === "Hi there"));
  assert.equal(inst.busy(), false);
  // (leaving: Back to the list)
  await inst.show({ kind: "app", app: "chats", section: "chats", key: null, arg: null });
  await settle();
  assert.equal(box.hidden, true);
  assert.equal(box.querySelectorAll(".ch-bubble").length, 0, "the words left the DOM");
  assert.ok(!html(root).includes("Hello"), "nowhere in the module's DOM");
  assert.ok(svc.calls.some(([m]) => m === "leave"));
  assert.ok(log.fill.at(-1) === false && log.away.at(-1) === false);
  inst.hide(); inst.unmount();
});

test("an id that isn't a chat on this phone: the list and a toast", { skip: roofSkip }, async () => {
  const { inst, log } = await world();
  await inst.show({ kind: "app", app: "chats", section: "chats", key: "open", arg: "nobody" });
  await settle();
  assert.ok(log.toasts.includes("That chat isn’t on this phone"));
  assert.deepEqual(log.go.at(-1), ["/chats/", { replace: true }]);
  inst.hide(); inst.unmount();
});

test("locked: the lock screen, no acts, the chat and every row line let go of; unmount clears chat:* too", { skip: roofSkip }, async () => {
  const { root, inst, svc, log } = await world();
  await inst.show({ kind: "app", app: "chats", section: "chats", key: "open", arg: "f-pat" });
  await settle();
  assert.ok(html(root).includes("Hello"));
  await svc.call("lock", true);
  await settle();
  assert.equal(root.querySelector(".ch-lock").hidden, false, "the lock screen");
  assert.ok(!html(root).includes("Hello") && !html(root).includes("See you"), "no words while locked");
  assert.deepEqual(log.header.at(-1).acts, [], "root header, no acts");
  assert.ok(sec(root, "chats").hidden && root.querySelector(".ch-chat").hidden);
  inst.hide(); inst.unmount();
  assert.equal(root.children.length, 0, "unmount leaves nothing");
});

test("the states of §2.1: each with its words and its one action", { skip: roofSkip }, async () => {
  const WORDS = { signin: ["Sign in to Chats", "Sign In"], key: ["Unlock Chats on this phone", "Unlock Chats"], ended: ["You’ve been signed out of Chats", "Sign In"], offline: ["No signal", null] };
  for (const [st, [title, act]] of Object.entries(WORDS)) {
    const { root, inst } = await world({ state: st });
    await inst.show({ kind: "app", app: "chats", section: "chats", key: null, arg: null });
    await settle();
    const p = root.querySelector(".ch-state");
    assert.equal(p.hidden, false, st);
    assert.ok(p.textContent.includes(title), `${st}: ${title}`);
    if (act) assert.ok(p.querySelector("a.ifl-btn")?.textContent.includes(act), `${st}: ${act}`);
    if (act) assert.ok(p.querySelector("a.ifl-btn").getAttribute("href").startsWith("/chats/in/#signin-start"), `${st}: Chat's own page`);
    assert.equal(sec(root, "chats").hidden, true);
    inst.hide(); inst.unmount();
  }
  const { root, inst, svc } = await world({ device: true });
  await inst.show({ kind: "app", app: "chats", section: "chats", key: null, arg: null });
  await settle();
  assert.ok(root.querySelector(".ch-state").textContent.includes("Chats is on your phone"));
  assert.equal(svc.calls.length, 0, "a computer never starts the core");
  inst.hide(); inst.unmount();
});

test("the store: null deletes, clear(prefix), one call per topic per microtask", async () => {
  const { createStore } = await import(new URL("store.js", MOD));
  const s = createStore(), seen = [];
  s.on("chat:a", (v) => seen.push(v));
  s.apply({ topic: "chat:a", data: { n: 1 } });
  s.apply({ topic: "chat:a", data: { n: 2 } });
  await tick();
  assert.deepEqual(seen, [{ n: 2 }]);
  s.apply({ topic: "chat:b", data: 1 });
  s.clear("chat:");
  await tick();
  assert.equal(s.get("chat:a"), null);
  assert.equal(s.get("chat:b"), null);
  assert.deepEqual(seen.at(-1), null);
  s.apply("x", 1); s.apply("x", null);
  assert.deepEqual(s.topics(), []);
});

test("the module's files: no style attribute, no inline handler, no innerHTML from data, no service.js import", () => {
  for (const f of ["chats.js", "store.js", "list.js", "friends.js", "chat.js", "lock.js", "connector.js"]) {
    const s = readFileSync(new URL(f, MOD), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/style=\\?["']/.test(s) && !/setAttribute\(\s*["'`]style/.test(s), `${f}: style`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(s), `${f}: inline handler`);
    if (f !== "connector.js") assert.ok(!/service\.js/.test(s), `${f}: never service.js`);
    for (const m of s.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) assert.match(m[1], /^(m\.qrSvg|html)\b/, `${f}: innerHTML only from cardview's or qr.js's escaped HTML`);
  }
  assert.ok(readdirSync(MOD).includes("chats.css"));
});
