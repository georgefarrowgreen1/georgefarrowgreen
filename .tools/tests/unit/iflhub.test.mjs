// InFlite's hub layer (IFL.hub, in .tools/inflite/menu.js; Today First, spec §3.5, §3.6): the template run in a made-up
// page (window, document, sessionStorage, location), as every app runs its copy. The marker, not the address, turns it
// on; go() maps the apps' own addresses to the hub's paths and is the identity off the hub; href() names an app's
// section; the breadcrumb is written as a page is left for another and read by back(), which never uses history's own
// back; send() goes through Chats' own sheet while there's no engine, and through the engine's sheet once it's ready
// (chat(): Chat's own page in a frame, made once, dropped after ten minutes out of sight); sent() and closed() put the
// frame away; signIn() goes through Chats and comes back; a notification tapped while a page is open goes there (the
// root worker's { ifl: "open" }, paths of this site's only); moved() shows its card once, on an old Home Screen icon
// only; degrade() makes a page of the hub link the apps' own addresses. Off the hub (an app at its own address), none of
// them does anything: every app is as it was.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { jsBlock } from "../../iflmenu.mjs";

// ---- a made-up page: just enough of the DOM for the menu's template to run in ----
class Node {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.style = { setProperty() {} }; this._text = ""; this.className = ""; }
  get classList() { const n = this, list = () => n.className.split(/\s+/).filter(Boolean); return { add: (...c) => { n.className = [...new Set([...list(), ...c])].join(" "); }, remove: (...c) => { n.className = list().filter((x) => !c.includes(x)).join(" "); }, toggle: (c, on) => { const has = list().includes(c); if (on ?? !has) n.classList.add(c); else n.classList.remove(c); }, contains: (c) => list().includes(c) }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  get href() { return this.attrs.href ?? ""; }
  set href(v) { this.attrs.href = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...kids) { for (const k of kids) { if (k == null) continue; const n = typeof k === "string" ? Object.assign(new Node("#text"), { _text: k }) : k; n.parentNode?.children.splice(n.parentNode.children.indexOf(n), 1); n.parentNode = this; this.children.push(n); } }
  replaceChildren(...kids) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...kids); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.tagName === "#DOCUMENT"; }
  get textContent() { return this.tagName === "#TEXT" ? this._text : this._text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.replaceChildren(); this._text = String(v); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  closest(sel) { for (let n = this; n; n = n.parentNode) if (sel === "a[href]" && n.tagName === "A" && n.hasAttribute("href")) return n; return null; }
  insertAdjacentHTML() {}
  focus() { let n = this; while (n.parentNode) n = n.parentNode; n.activeElement = this; }
  // (a dialog's: shown modal, in the top layer, or shut, with its close word)
  showModal() { if (!this.isConnected) throw new Error("InvalidStateError: not in the document"); this.open = true; this.modal = true; }
  close() { if (!this.open) return; this.open = false; this.modal = false; for (const fn of this.listeners.close || []) fn({ type: "close" }); }
  dispatch(type) { const e = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (let n = this; n; n = n.parentNode) for (const fn of n.listeners[type] || []) fn(e); return e; }
}
const all = (n, out = []) => { for (const c of n.children) { out.push(c); all(c, out); } return out; };
const textOf = (n) => n.textContent;
// (ua: what the browser says it is; an iPhone, unless said)
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
function page(href, { marker = null, crumb, sent, standalone = false, kept = {}, before = null, ua = IPHONE_UA, touch = 5 } = {}) {
  const doc = new Node("#document"), head = new Node("head"), body = new Node("body");
  doc.append(head, body);
  doc.body = body;
  doc.documentElement = new Node("html");
  doc.visibilityState = "visible";
  doc.createElement = (t) => new Node(t);
  const meta = marker == null ? null : Object.assign(new Node("meta"), { attrs: { name: "ifl-hub", content: marker } });
  doc.querySelector = (sel) => (sel === 'meta[name="ifl-hub"]' ? meta : null);
  doc.querySelectorAll = () => [];
  const store = new Map([...(crumb === undefined ? [] : [["ifl-crumb", crumb]]), ...(sent === undefined ? [] : [["ifl-sent", sent]])]);
  const local = new Map(Object.entries(kept));
  const localStorage = { getItem: (k) => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: (k) => local.delete(k) };
  // (the window's own listeners (ifl-chat-ready), the service worker's (its messages), and timers run when the test says)
  const winL = {}, swL = {}, timers = [], badge = [];   // (badge: what the root worker's told, as plain data)
  const fire = (map, type, e) => { for (const fn of [...(map[type] || [])]) fn(e); };
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const assigned = [], went = [];
  const at = new URL(href);
  const location = { href: at.href, origin: at.origin, host: at.host, hostname: at.hostname, protocol: at.protocol, pathname: at.pathname, search: at.search, hash: at.hash, assign: (u) => assigned.push(String(u)), replace: (u) => assigned.push(String(u)), reload() {} };
  const history = { back: () => went.push("back"), go: () => went.push("go"), replaceState() {}, pushState() {} };
  const ctx = { document: doc, sessionStorage, localStorage, location, history, URL, URLSearchParams, Blob, Promise, JSON, Math, Object, Array, String, Number, Set, Map, Date,
    requestAnimationFrame: (fn) => fn(), setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: (i) => { if (timers[i - 1]) timers[i - 1].fn = () => {}; }, setInterval: () => 0,
    addEventListener: (t, fn) => (winL[t] ||= []).push(fn), removeEventListener: (t, fn) => { winL[t] = (winL[t] || []).filter((f) => f !== fn); },
    navigator: { standalone, userAgent: ua, maxTouchPoints: touch, serviceWorker: { addEventListener: (t, fn) => (swL[t] ||= []).push(fn), getRegistration: (scope) => Promise.resolve({ scope, active: { postMessage: (m) => badge.push([scope, JSON.parse(JSON.stringify(m))]) } }) } },
    matchMedia: () => ({ matches: false }), innerHeight: 800, innerWidth: 400, screen: { width: 400, height: 800 } };
  ctx.window = ctx;
  before?.(ctx);
  const IFL = vm.runInNewContext(`${jsBlock()}\n;IFL`, ctx);
  const run = (ms) => { for (const t of timers.splice(0)) if (ms == null || t.ms === ms) t.fn(); else timers.push(t); };
  const visible = (v) => { doc.visibilityState = v ? "visible" : "hidden"; for (const fn of doc.listeners.visibilitychange || []) fn({ type: "visibilitychange" }); };
  return { IFL, hub: IFL.hub, win: ctx, doc, store, local, assigned, went, location, badge, ready: () => fire(winL, "ifl-chat-ready", { type: "ifl-chat-ready" }),
    message: (data, ports = []) => fire(swL, "message", { data, ports }), run, visible, winL, fire: (type, e) => fire(winL, type, { type, ...e }) };
}
// (the engine's frame, and whether it's showing: its dialog shown modal, and marked on)
const frameOf = (p) => all(p.doc.body).find((n) => n.tagName === "IFRAME");
const showing = (f) => f.parentNode?.open === true && f.parentNode.modal === true && f.parentNode.classList.contains("on");
const putAway = (f) => !f.parentNode?.open && !f.parentNode?.classList.contains("on");

test("its whole surface is there, with these names, on the hub and off it", () => {
  for (const p of [page("https://inflite.ai/weather/", { marker: "/weather/" }), page("https://weather.inflite.ai/")]) {
    for (const k of ["go", "href", "tabs", "back", "chat", "send", "sent", "closed", "signIn", "moved"]) assert.equal(typeof p.hub[k], "function", k);
    assert.equal(typeof p.hub.on, "boolean");
    assert.equal(typeof p.hub.base, "string");
  }
  // (Today's own copy, with its own name in its menu, has the same)
  assert.match(jsBlock("today"), /const hub = \{/);
});

test("the server's marker turns it on, never the address", () => {
  let p = page("https://inflite.ai/weather/", { marker: "/weather/" });
  assert.equal(p.hub.on, true);
  assert.equal(p.hub.base, "/weather/");
  assert.equal(page("https://inflite.ai/", { marker: "/" }).hub.base, "/");
  // (an app's own address, a test's, Chat at chat.localhost: no marker, so off, and every app as it was)
  for (const h of ["https://inflite.ai/weather/", "https://chat.inflite.ai/", "http://chat.localhost:8788/", "http://chat.ifl.test:8788/", "https://weather.inflite.ai/"]) {
    p = page(h);
    assert.equal(p.hub.on, false, h);
    assert.equal(p.hub.base, "", h);
  }
});

test("off the hub, go() gives back what it's given, whatever it is", () => {
  const { hub, store } = page("https://weather.inflite.ai/");
  for (const u of ["https://chat.inflite.ai/#share=x", "https://fitness.inflite.ai/#today", "https://inflite.ai/", "./#radar", "https://example.com/", "", "mailto:a@b.c"]) assert.equal(hub.go(u), u, u);
  const o = { toString: () => "https://chat.inflite.ai/" };
  assert.equal(hub.go(o), o, "the very thing it was given");
  assert.equal(store.size, 0, "and no breadcrumb");
});

test("on the hub, go() maps each app's own address to its path at the hub, and leaves the rest as they are", () => {
  const { hub } = page("https://inflite.ai/weather/", { marker: "/weather/" });
  const map = {
    "https://chat.inflite.ai/#open=4f6c8d2e-1a3b-4c5d-8e9f-0a1b2c3d4e5f": "/chats/#open=4f6c8d2e-1a3b-4c5d-8e9f-0a1b2c3d4e5f",
    "https://chat.inflite.ai/": "/chats/",
    "https://weather.inflite.ai/?lat=51.5072&lon=-0.1276&name=London": "/weather/?lat=51.5072&lon=-0.1276&name=London",
    "https://fitness.inflite.ai/#today": "/fitness/#today",
    "https://finance.inflite.ai/#s=TSCO.L": "/markets/#s=TSCO.L",
    "https://email.inflite.ai/": "/mail/",
    "https://inflite.ai/#apps": "/#apps",
    "https://inflite.ai/": "/",
    "/fitness/#activities": "/fitness/#activities",
  };
  for (const [from, to] of Object.entries(map)) assert.equal(hub.go(from), to, from);
  for (const same of ["https://account.inflite.ai/#open=notify", "https://auth.inflite.ai/#signin=inflight", "https://example.com/x", "https://chat.example.com/",
    "https://chat.inflite.ai.example.com/", "https://evilinflite.ai/", "https://user:pw@chat.inflite.ai/", "mailto:a@b.c", "javascript:alert(1)", "data:text/html,x", "https://markets.inflite.ai/"])
    assert.equal(hub.go(same), same, same);
});

test("the same at a test's site (ifl.test, with its port), and at the staging hub (next.)", () => {
  let { hub } = page("http://ifl.test:8788/", { marker: "/" });
  assert.equal(hub.go("http://chat.ifl.test:8788/#x"), "/chats/#x");
  assert.equal(hub.go("http://finance.ifl.test:8788/#holdings"), "/markets/#holdings");
  assert.equal(hub.go("http://weather.ifl.test:8788/"), "/weather/");
  assert.equal(hub.go("http://ifl.test:8788/#you"), "/#you");
  for (const same of ["http://account.ifl.test:8788/", "http://auth.ifl.test:8788/#signin=today", "http://chat.ifl.test:9999/", "https://chat.inflite.ai/"]) assert.equal(hub.go(same), same, same);
  ({ hub } = page("https://next.inflite.ai/", { marker: "/" }));
  assert.equal(hub.go("https://chat.inflite.ai/#open=x"), "/chats/#open=x");
  assert.equal(hub.go("https://inflite.ai/#apps"), "/#apps");
  assert.equal(hub.go("https://next.inflite.ai/weather/"), "/weather/");
});

test("href() names an app at a section", () => {
  const { hub } = page("https://inflite.ai/", { marker: "/" });
  const want = [
    [["weather", "radar"], "/weather/#radar"], [["fitness", "#activities"], "/fitness/#activities"], [["markets", "s=TSCO"], "/markets/#s=TSCO"],
    [["chat", "open=abc"], "/chats/#open=abc"], [["chats"], "/chats/"], [["today"], "/"], [["weather", "?lat=1&lon=2"], "/weather/?lat=1&lon=2"], [["mail"], "/mail/"],
  ];
  for (const [args, to] of want) assert.equal(hub.href(...args), to, args.join(" "));
});

test("the breadcrumb: written as a page is left for another, read by back(), taken as it goes; never history's back", () => {
  // (from a chat, to Weather's radar: the chat is where Back goes)
  let p = page("https://inflite.ai/chats/#open=abc", { marker: "/chats/" });
  p.hub.go("https://weather.inflite.ai/#radar");
  assert.equal(p.store.get("ifl-crumb"), "/chats/#open=abc");
  // (a hash on the same page isn't leaving it)
  p = page("https://inflite.ai/weather/", { marker: "/weather/", crumb: "/#apps" });
  p.hub.go("https://weather.inflite.ai/#radar");
  p.hub.href("weather", "warnings");
  assert.equal(p.store.get("ifl-crumb"), "/#apps");
  // (href to another app, too)
  p = page("https://inflite.ai/", { marker: "/" });
  p.hub.href("fitness", "today");
  assert.equal(p.store.get("ifl-crumb"), "/");
  // Back, on the page that was opened
  p = page("https://inflite.ai/weather/#radar", { marker: "/weather/", crumb: "/chats/#open=abc" });
  p.hub.back();
  assert.deepEqual(p.assigned, ["/chats/#open=abc"]);
  assert.equal(p.store.has("ifl-crumb"), false, "taken as it goes, so it never bounces back");
  assert.deepEqual(p.went, [], "never history.back()");
  // (what a page writes for the page it goes to next isn't its own Back)
  p = page("https://inflite.ai/weather/", { marker: "/weather/", crumb: "/chats/" });
  p.hub.go("https://fitness.inflite.ai/#today");
  assert.equal(p.store.get("ifl-crumb"), "/weather/");
  p.hub.back();
  assert.deepEqual(p.assigned, ["/chats/"]);
  // (none, one naming this very page, or one that isn't a path of this site's: Apps)
  for (const crumb of [undefined, "/weather/", "/weather/#day=2026-11-02", "//evil.example/x", "https://evil.example/", "/x\\y", "weather/", "/" + "x".repeat(200),
    "/\n/evil.example/", "/\t/evil.example/", "/\u0000/x"]) {
    p = page("https://inflite.ai/weather/", { marker: "/weather/", crumb });
    p.hub.back();
    assert.deepEqual(p.assigned, ["/#apps"], String(crumb));
    assert.deepEqual(p.went, []);
  }
  // (a page whose address is too long to be one isn't written)
  p = page(`https://inflite.ai/weather/#${"y".repeat(200)}`, { marker: "/weather/" });
  p.hub.go("https://chat.inflite.ai/");
  assert.equal(p.store.has("ifl-crumb"), false);
});

test("tabs(): Today · Chats · Apps · You as links, the one you're on marked, each to another page leaving the breadcrumb", () => {
  const p = page("https://inflite.ai/chats/", { marker: "/chats/" });
  const nav = p.hub.tabs(p.doc.createElement("nav"), "chats");
  assert.deepEqual(nav.children.map((a) => [a.tagName, a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")]), [
    ["A", "Today", "/", null], ["A", "Chats", "/chats/", "page"], ["A", "Apps", "/#apps", null], ["A", "You", "/#you", null],
  ]);
  assert.ok(nav.classList.contains("ifl-tabs"));
  nav.children[2].dispatch("click");
  assert.equal(p.store.get("ifl-crumb"), "/chats/");
  // (a link to another of the hub's pages, followed, leaves it too; one elsewhere, or on this page, doesn't)
  const q = page("https://inflite.ai/markets/#s=TSCO", { marker: "/markets/" });
  const a = q.doc.createElement("a"); a.setAttribute("href", "https://evil.example/");
  q.doc.body.append(a);
  a.dispatch("click");
  assert.equal(q.store.has("ifl-crumb"), false);
  a.setAttribute("href", "https://inflite.ai/markets/#holdings"); a.dispatch("click");
  assert.equal(q.store.has("ifl-crumb"), false);
  a.setAttribute("href", "https://inflite.ai/fitness/#today"); a.dispatch("click");
  assert.equal(q.store.get("ifl-crumb"), "/markets/#s=TSCO");
});

test("send() goes through Chats' own sheet while there's no engine, and comes back here; signIn() by Today's own trip", async () => {
  const p = page("https://inflite.ai/weather/#radar", { marker: "/weather/" });
  const wait = p.hub.chat();
  p.run(15e3);
  assert.equal(await wait, null, "no engine in 15 seconds");
  assert.equal(await p.hub.send("London today: rain from 15:00 & wind", "eyJ2IjoxLCJraW5kIjoid2VhdGhlciJ9"), true, "gone to Chats'");
  assert.equal(p.assigned[0], "/chats/#share=London%20today%3A%20rain%20from%2015%3A00%20%26%20wind&card=eyJ2IjoxLCJraW5kIjoid2VhdGhlciJ9&back=%2Fweather%2F%23radar");
  const h = new URLSearchParams(p.assigned[0].split("#")[1]);
  assert.deepEqual([h.get("share"), h.get("card"), h.get("back")], ["London today: rain from 15:00 & wind", "eyJ2IjoxLCJraW5kIjoid2VhdGhlciJ9", "/weather/#radar"]);
  // (a card that isn't a packed one goes no further: it can't put a back of its own in first)
  await p.hub.send("Hi", "x&back=//evil.example", { to: "4f6c8d2e-1a3b-4c5d-8e9f-0a1b2c3d4e5f" });
  const h2 = new URLSearchParams(p.assigned[1].split("#")[1]);
  assert.deepEqual([h2.get("share"), h2.get("card"), h2.getAll("back")], ["Hi", null, ["/weather/#radar"]]);
  await p.hub.send("Just words", null);
  assert.equal(p.assigned[2], "/chats/#share=Just%20words&back=%2Fweather%2F%23radar");
  const s = page("https://inflite.ai/markets/#s=TSCO", { marker: "/markets/" });
  assert.equal(s.hub.signIn(), true);
  assert.deepEqual(s.assigned, ["/#signin-today&then=%2Fmarkets%2F%23s%3DTSCO"], "a phone: Today's own trip, never through Chats");
  // (an iPad, calling itself a Mac but touched: the same)
  const ipad = page("https://inflite.ai/markets/", { marker: "/markets/", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" });
  assert.equal(ipad.hub.signIn(), true);
  assert.deepEqual(ipad.assigned, ["/#signin-today&then=%2Fmarkets%2F"]);
  // (a computer: the same, and back to where it was)
  const mac = page("https://inflite.ai/markets/#s=TSCO", { marker: "/markets/", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", touch: 0 });
  assert.equal(mac.hub.signIn(), true);
  assert.deepEqual(mac.assigned, ["/#signin-today&then=%2Fmarkets%2F%23s%3DTSCO"]);
  assert.deepEqual([...p.went, ...s.went], []);
});

test("sent() says it in a toast; closed() says nothing; moved() does nothing at the hub", () => {
  const p = page("https://inflite.ai/", { marker: "/" });
  p.hub.closed();
  assert.equal(p.hub.moved("chat", { off: () => assert.fail("off isn't called") }), false);
  const before = p.doc.body.children.length;
  p.hub.sent("Sent to Pat. You’re still here");
  const toast = p.doc.body.children.find((n) => n.className.includes("ifl-toast"));
  assert.ok(toast, "a toast");
  assert.equal(toast.textContent, "Sent to Pat. You’re still here");
  assert.equal(p.doc.body.children.length, before + 1);
  assert.deepEqual(p.assigned, []);
});

test("off the hub, send, signIn, back, href and tabs do nothing: an app at its own address goes its own way, as it always has", async () => {
  for (const h of ["https://weather.inflite.ai/#radar", "http://chat.localhost:8788/", "http://fitness.ifl.test:8788/#today", "https://inflite.ai/markets/"]) {
    const p = page(h, { crumb: "/chats/#open=abc" });
    assert.equal(await p.hub.send("London today: rain from 15:00", "eyJ2IjoxfQ", { to: "4f6c8d2e-1a3b-4c5d-8e9f-0a1b2c3d4e5f" }), false, `${h}: send says it did nothing`);
    assert.equal(p.hub.signIn(), false, `${h}: signIn`);
    assert.equal(p.hub.back(), false, `${h}: back`);
    for (const [app, section] of [["weather", "radar"], ["chat", "open=abc"], ["today"], ["markets", "s=TSCO"]]) assert.equal(p.hub.href(app, section), null, `${h}: href ${app}`);
    const nav = p.doc.createElement("nav"), mine = p.doc.createElement("a");
    nav.append(mine);
    assert.equal(p.hub.tabs(nav, "chats"), nav, `${h}: tabs gives back its element`);
    assert.deepEqual(nav.children, [mine], `${h}: and leaves it as it was`);
    assert.equal(nav.className, "", h);
    assert.deepEqual(p.assigned, [], `${h}: nowhere gone`);
    assert.deepEqual(p.went, [], h);
    assert.equal(p.store.get("ifl-crumb"), "/chats/#open=abc", `${h}: the breadcrumb neither written nor taken`);
  }
});

test("the hub's look: html.ifl-hub at the hub only", () => {
  assert.ok(page("https://inflite.ai/weather/", { marker: "/weather/" }).doc.documentElement.classList.contains("ifl-hub"));
  assert.ok(!page("https://weather.inflite.ai/").doc.documentElement.classList.contains("ifl-hub"));
});

test("chat(): Chat's own page in a frame, made once, its IFLChat once it says it's ready; send() then opens its sheet over the page, and sent()/closed() put it away", async () => {
  const p = page("https://inflite.ai/", { marker: "/" });
  const asked = [];
  const IFLChat = { state: "ready", share: async (...a) => { asked.push(a); return true; }, sendTo: async () => ({ ok: true, say: "Sent to Leo" }), waiting: async () => [], since: async () => null, refresh: async () => {}, signOut: async () => {} };
  const one = p.hub.chat(), two = p.hub.chat();
  const frames = all(p.doc.body).filter((n) => n.tagName === "IFRAME");
  assert.equal(frames.length, 1, "one frame, however often it's asked for");
  const f = frames[0], box = f.parentNode;
  assert.deepEqual([f.name, f.className, f.src, box.tagName, box.className, box.parentNode === p.doc.body], ["ifl-chat", "ifl-engine", "/chats/?engine=1", "DIALOG", "ifl-engine-box", true],
    "in a dialog of its own, at the foot of the page");
  assert.ok(putAway(f), "unseen until it shows its sheet");
  assert.ok(!f.hidden && !box.hidden && !("hidden" in f.attrs) && !("hidden" in box.attrs), "never [hidden] (a page's own [hidden] rule would take it out of the layout)");
  f.contentWindow = { IFLChat };
  p.ready();
  const c = await one;
  assert.equal(await two, c, "the same engine to both");
  assert.equal(c.state, "ready");
  // (send: through the engine's sheet, the frame shown for it; nowhere gone)
  assert.equal(await p.hub.send("London today: rain from 15:00", "eyJ2IjoxfQ", { to: "4f6c8d2e-1a3b-4c5d-8e9f-0a1b2c3d4e5f" }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(asked)), [["London today: rain from 15:00", "eyJ2IjoxfQ", { to: "4f6c8d2e-1a3b-4c5d-8e9f-0a1b2c3d4e5f" }]]);
  assert.ok(showing(f), "shown for its sheet: its dialog modal, in the top layer");
  assert.deepEqual(p.assigned, []);
  p.hub.sent("Sent to Pat");
  assert.ok(putAway(f), "put away once it's sent");
  const toast = p.doc.body.children.find((n) => n.className.includes("ifl-toast"));
  assert.equal(toast?.textContent, "Sent to Pat. You’re still here");
  await p.hub.send("x", null);
  assert.ok(showing(f));
  p.hub.closed();
  assert.ok(putAway(f), "put away when its sheet's shut");
  // (shut some other way (Escape, with the page's focus): put away too)
  await p.hub.send("x", null);
  box.close();
  assert.ok(putAway(f), "shut by Escape: put away");
  // (sendTo's one tap: sent with no sheet, said, and the frame away; a card refused: away)
  const r = await (await p.hub.chat()).sendTo("4f6c", "Done · 1:15", "eyJ2IjoxfQ");
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true, say: "Sent to Leo" });
  assert.ok(putAway(f));
  assert.equal(p.doc.body.children.find((n) => n.className.includes("ifl-toast"))?.textContent, "Sent to Leo. You’re still here");
  IFLChat.share = async () => false;
  await p.hub.send("x", "y");
  assert.ok(putAway(f), "a card it refused: nothing showing");
});

test("chat() not ready (signed out of Chats, its key not here, locked) or no answer in 15 seconds: null, and send() goes through Chats' own sheet", async () => {
  for (const state of ["signin", "key", "locked"]) {
    const p = page("https://inflite.ai/weather/#radar", { marker: "/weather/" });
    const wait = p.hub.chat();
    all(p.doc.body).find((n) => n.tagName === "IFRAME").contentWindow = { IFLChat: { state, share: () => assert.fail("not ready: never its sheet") } };
    p.ready();
    assert.equal(await wait, null, state);
    assert.equal(await p.hub.send("Hi", "eyJ2IjoxfQ"), true);
    assert.deepEqual(p.assigned, ["/chats/#share=Hi&card=eyJ2IjoxfQ&back=%2Fweather%2F%23radar"], state);
  }
  // (no word from it in 15 seconds: null, the frame dropped, and made again when next asked for)
  const p = page("https://inflite.ai/", { marker: "/" });
  const wait = p.hub.chat();
  p.run(15e3);
  assert.equal(await wait, null);
  assert.equal(all(p.doc.body).filter((n) => n.tagName === "IFRAME").length, 0, "dropped");
  assert.equal(await p.hub.chat(), null, "for two minutes, none asked for: a Send goes through Chats' at once");
  assert.equal(all(p.doc.body).filter((n) => n.tagName === "IFRAME").length, 0);
  p.run(2 * 60e3);
  p.hub.chat();
  assert.equal(all(p.doc.body).filter((n) => n.tagName === "IFRAME").length, 1, "then made again");
  // (off the hub, or degraded: never a frame)
  for (const q of [page("https://weather.inflite.ai/"), (() => { const d = page("https://inflite.ai/", { marker: "/" }); d.hub.degrade(); return d; })()]) {
    assert.equal(await q.hub.chat(), null);
    assert.equal(all(q.doc.body).filter((n) => n.tagName === "IFRAME").length, 0);
  }
});

test("the engine's let go after ten minutes out of sight, and made again when it's next wanted", async () => {
  const p = page("https://inflite.ai/", { marker: "/" });
  const wait = p.hub.chat();
  const f = all(p.doc.body).find((n) => n.tagName === "IFRAME");
  f.contentWindow = { IFLChat: { state: "ready" } };
  p.ready();
  await wait;
  p.visible(false);
  p.run(10 * 60e3);
  assert.equal(f.parentNode.parentNode, null, "dropped, its dialog and all");
  p.visible(true);
  p.hub.chat();
  assert.equal(all(p.doc.body).filter((n) => n.tagName === "IFRAME").length, 1);
  // (back in sight before the ten minutes: kept)
  const q = page("https://inflite.ai/", { marker: "/" });
  q.hub.chat();
  const g = all(q.doc.body).find((n) => n.tagName === "IFRAME");
  q.visible(false); q.visible(true);
  q.run(10 * 60e3);
  assert.ok(g.parentNode.parentNode, "kept");
});

test("a notification tapped while a page is open: the root worker's { ifl: \"open\", url } goes there, a path of this site's only, leaving the breadcrumb", () => {
  let p = page("https://inflite.ai/weather/#radar", { marker: "/weather/" });
  p.message({ ifl: "open", url: "/chats/#open=abc" });
  assert.deepEqual(p.assigned, ["/chats/#open=abc"]);
  assert.equal(p.store.get("ifl-crumb"), "/weather/#radar");
  // (within the same page: there, as a hash change, and no breadcrumb)
  p = page("https://inflite.ai/markets/", { marker: "/markets/" });
  p.message({ ifl: "open", url: "/markets/#s=TSCO" });
  assert.deepEqual(p.assigned, ["/markets/#s=TSCO"]);
  assert.equal(p.store.has("ifl-crumb"), false);
  // (anything else: nowhere)
  for (const data of [{ ifl: "open", url: "//evil.example/x" }, { ifl: "open", url: "https://evil.example/" }, { ifl: "open", url: "/x\\y" }, { ifl: "open", url: "/\n/evil.example" },
    { ifl: "open", url: "javascript:alert(1)" }, { ifl: "open" }, { open: "/chats/" }, { inflight: "sync" }, null, "open"]) {
    p = page("https://inflite.ai/", { marker: "/" });
    p.message(data);
    assert.deepEqual(p.assigned, [], JSON.stringify(data));
  }
  // (off the hub: Chat's and Markets' own listeners, not this one)
  p = page("https://chat.inflite.ai/");
  p.message({ ifl: "open", url: "/chats/#open=abc" });
  assert.deepEqual(p.assigned, []);
});

test("sent from Chats' own sheet and back (sessionStorage ifl-sent): said once as the page opens, then gone", () => {
  const p = page("https://inflite.ai/weather/#radar", { marker: "/weather/", sent: "Sent to Pat" });
  assert.equal(p.doc.body.children.find((n) => n.className.includes("ifl-toast"))?.textContent, "Sent to Pat. You’re still here");
  assert.equal(p.store.has("ifl-sent"), false);
  const q = page("https://weather.inflite.ai/", { sent: "Sent to Pat" });
  assert.equal(q.doc.body.children.find((n) => n.className.includes("ifl-toast")), undefined, "off the hub: not this layer's");
});

test("moved(): an old Home Screen icon (off the hub, standalone) shows its card once; never in a tab, never at the hub", async () => {
  let off = 0;
  const p = page("https://chat.inflite.ai/", { standalone: true });
  assert.equal(p.hub.moved("chat", { off: async () => { off++; } }), true);
  const card = p.doc.body.children.find((n) => n.className.includes("ifl-moved"));
  assert.ok(card, "its card");
  const words = textOf(card);
  for (const w of ["InFlite is one app now", "Today, Chats and every app in one place. Add inflite.ai to your Home Screen.", "How to Add", "Turn Off Notifications Here", "Not Now"]) assert.ok(words.includes(w), w);
  assert.ok(p.local.get("ifl-moved:chat"), "remembered");
  const stop = all(card).find((n) => n.tagName === "BUTTON" && n.textContent === "Turn Off Notifications Here");
  await stop.onclick();
  assert.equal(off, 1, "Turn Off Notifications Here calls off");
  assert.equal(p.hub.moved("chat", { off() {} }), false, "once");
  // (its own once for each app; none without an off of its own to call has no Turn Off)
  assert.equal(p.hub.moved("weather"), true);
  assert.ok(!textOf(p.doc.body.children.filter((n) => n.className.includes("ifl-moved")).at(-1)).includes("Turn Off"));
  // (once already, on an earlier day)
  assert.equal(page("https://fitness.inflite.ai/", { standalone: true, kept: { "ifl-moved:fitness": "1" } }).hub.moved("fitness", { off() {} }), false);
  // (a browser tab, or the hub: never)
  assert.equal(page("https://chat.inflite.ai/").hub.moved("chat", { off() {} }), false);
  assert.equal(page("https://inflite.ai/chats/", { marker: "/chats/", standalone: true }).hub.moved("chat", { off() {} }), false);
});

test("degrade(): a page of the hub whose Worker can't serve the apps yet links their own addresses, sends through chat.<site>, and has no engine", async () => {
  const p = page("https://inflite.ai/", { marker: "/" });
  assert.equal(p.hub.degrade({ chat: "https://chat.inflite.ai", weather: "https://weather.inflite.ai", fitness: "https://fitness.inflite.ai", finance: "https://finance.inflite.ai", email: "javascript:x" }), true);
  assert.equal(p.hub.degraded, true);
  assert.equal(p.hub.on, true);
  const map = { "/weather/#radar": "https://weather.inflite.ai/#radar", "/fitness/#activities": "https://fitness.inflite.ai/#activities", "/markets/#s=TSCO": "https://finance.inflite.ai/#s=TSCO",
    "/chats/#open=abc": "https://chat.inflite.ai/#open=abc", "/mail/": "https://email.inflite.ai/", "/weather/?lat=1&lon=2": "https://weather.inflite.ai/?lat=1&lon=2",
    "https://weather.inflite.ai/#radar": "https://weather.inflite.ai/#radar", "/#apps": "/#apps", "/": "/", "https://account.inflite.ai/": "https://account.inflite.ai/" };
  for (const [from, to] of Object.entries(map)) assert.equal(p.hub.go(from), to, from);
  assert.equal(p.hub.href("weather", "radar"), "https://weather.inflite.ai/#radar");
  assert.equal(p.hub.href("markets", "s=TSCO"), "https://finance.inflite.ai/#s=TSCO");
  const nav = p.hub.tabs(p.doc.createElement("nav"), "today");
  assert.deepEqual(nav.children.map((a) => a.getAttribute("href")), ["/", "https://chat.inflite.ai/", "/#apps", "/#you"]);
  assert.equal(await p.hub.chat(), null);
  assert.equal(await p.hub.send("London today: rain", "eyJ2IjoxfQ"), true);
  assert.deepEqual(p.assigned, ["https://chat.inflite.ai/#share=London%20today%3A%20rain&card=eyJ2IjoxfQ"]);
  assert.equal(p.hub.signIn(), false);
  assert.equal(p.store.has("ifl-crumb"), false, "no breadcrumb for another site's page");
  // (no links given: <app>.<site>, the staging hub's next. taken off, a test's site with its port)
  assert.equal((() => { const q = page("http://ifl.test:8788/", { marker: "/" }); q.hub.degrade(); return q.hub.go("/weather/#radar"); })(), "http://weather.ifl.test:8788/#radar");
  assert.equal((() => { const q = page("https://next.inflite.ai/", { marker: "/" }); q.hub.degrade(); return q.hub.href("chat"); })(), "https://chat.inflite.ai/");
  // (off the hub: nothing to degrade)
  assert.equal(page("https://weather.inflite.ai/").hub.degrade(), false);
});

test("at the hub, the page's IFL is its window's too, so Chat's engine (a frame of the page's) can say sent or closed: parent.IFL.hub.sent()", async () => {
  const p = page("https://inflite.ai/", { marker: "/" });
  assert.equal(p.win.IFL, p.IFL, "window.IFL, the page's own (a const in a module never is)");
  assert.equal(Object.getOwnPropertyDescriptor(p.win, "IFL").configurable, true, "and can be taken back, so a page's own global IFL never clashes");
  // (the engine shows its sheet for a Send, then, as §8.2 has it, ends it itself through its parent's window)
  const asked = [];
  const wait = p.hub.chat(), f = frameOf(p);
  f.contentWindow = { IFLChat: { state: "ready", share: async (...a) => { asked.push(a); p.win.IFL.hub.sent("Sent to Pat"); return { ok: true }; }, sendTo: async () => ({ ok: true }), waiting: async () => [], since: async () => null, refresh: async () => {}, signOut: async () => {} } };
  p.ready();
  await wait;
  await p.hub.send("London today: rain from 15:00", "eyJ2IjoxfQ");
  assert.equal(asked.length, 1);
  assert.ok(putAway(f), "the frame put away by the engine's own word: never left over the page");
  assert.equal(p.doc.body.children.find((n) => n.className.includes("ifl-toast"))?.textContent, "Sent to Pat. You’re still here");
  // (closed(), the same way)
  f.contentWindow.IFLChat.share = async () => { p.win.IFL.hub.closed(); return undefined; };
  await p.hub.send("x", null);
  assert.ok(putAway(f), "and by its closed()");
  // (off the hub: nothing on the window, the app's IFL its own as it always was)
  assert.equal(page("https://weather.inflite.ai/").win.IFL, undefined);
  // (a stand-in put on the window first, that can't be taken back: left as it is, and nothing thrown)
  const stand = { hub: { on: true } };
  const q = page("https://inflite.ai/", { marker: "/", before: (w) => Object.defineProperty(w, "IFL", { get: () => stand, configurable: false }) });
  assert.equal(q.win.IFL, stand);
  assert.equal(q.hub.on, true);
});

test("pages that cross-fade: off the hub every transition's let go as a page is left or opened (pageswap, pagereveal), at the hub never; none is ever left to fail out loud", () => {
  const vt = () => {
    const t = { skipped: 0, caught: [], skipTransition() { this.skipped++; } };
    for (const k of ["ready", "finished", "updateCallbackDone"]) t[k] = { catch: (fn) => { t.caught.push(k); return Promise.resolve(); } };
    return t;
  };
  for (const [h, marker, skips] of [["https://weather.inflite.ai/", null, 1], ["http://chat.localhost:8788/", null, 1], ["https://inflite.ai/weather/", "/weather/", 0], ["https://inflite.ai/", "/", 0]]) {
    const p = page(h, { marker });
    for (const type of ["pageswap", "pagereveal"]) {
      const t = vt();
      p.fire(type, { viewTransition: t });
      assert.equal(t.skipped, skips, `${h} ${type}: ${skips ? "let go" : "kept"}`);
      assert.deepEqual(t.caught, ["ready", "finished", "updateCallbackDone"], `${h} ${type}: each of its promises caught`);
    }
    // (a page left with no transition at all: nothing to do, nothing thrown)
    p.fire("pageswap", { viewTransition: null });
    p.fire("pagereveal", {});
  }
});

test("pages that cross-fade, at the hub: one bound for a page that isn't the hub's is let go as it's left (it would be called off there, out loud); the hub's own pages keep it; the one a page opens with is caught as it starts", () => {
  const vt = () => {
    const t = { skipped: 0, caught: [], skipTransition() { this.skipped++; } };
    for (const k of ["ready", "finished", "updateCallbackDone"]) t[k] = { catch: (fn) => { t.caught.push(k); return Promise.resolve(); } };
    return t;
  };
  for (const [h, marker] of [["https://inflite.ai/", "/"], ["https://inflite.ai/markets/", "/markets/"]]) {
    const p = page(h, { marker });
    for (const [to, skips] of [
      ["https://inflite.ai/api/hub", 1], ["https://inflite.ai/nowhere", 1], ["https://inflite.ai/chats/version", 1], ["https://inflite.ai/apps/weather.png", 1],
      ["https://chat.inflite.ai/", 1], ["not a url", 1],
      ["https://inflite.ai/", 0], ["https://inflite.ai/#apps", 0], ["https://inflite.ai/chats/#open=7", 0], ["https://inflite.ai/weather/?lat=51.5&lon=-0.1", 0],
      ["https://inflite.ai/fitness/#today", 0], ["https://inflite.ai/markets/#s=TSCO.L", 0], ["https://inflite.ai/mail/", 0], ["https://inflite.ai/chats/index.html", 0],
    ]) {
      const t = vt();
      p.fire("pageswap", { viewTransition: t, activation: { entry: { url: to } } });
      assert.equal(t.skipped, skips, `${h} → ${to}: ${skips ? "let go" : "kept"}`);
      assert.deepEqual(t.caught, ["ready", "finished", "updateCallbackDone"], `${h} → ${to}: each of its promises caught`);
    }
    // (where the browser doesn't say where it's going: kept, as before)
    const t = vt();
    p.fire("pageswap", { viewTransition: t, activation: null });
    assert.equal(t.skipped, 0, `${h}: no word of where to: kept`);
    // (pagereveal has no activation to go by: the page it's on is the hub's, kept)
    const r = vt();
    p.fire("pagereveal", { viewTransition: r, activation: { entry: { url: "https://inflite.ai/api/hub" } } });
    assert.equal(r.skipped, 0, `${h}: pagereveal kept`);
  }
  // (the transition a page opens with, caught as the template runs, before pagereveal: at and off the hub; none, nothing)
  for (const [h, marker] of [["https://inflite.ai/weather/", "/weather/"], ["https://weather.inflite.ai/", null]]) {
    const t = vt();
    page(h, { marker, before: (w) => { w.document.activeViewTransition = t; } });
    assert.deepEqual(t.caught, ["ready", "finished", "updateCallbackDone"], `${h}: the opening transition's promises caught at once`);
    assert.equal(t.skipped, 0, `${h}: and not let go there (pagereveal decides)`);
  }
  assert.doesNotThrow(() => page("https://inflite.ai/", { marker: "/", before: (w) => { w.document.activeViewTransition = null; } }));
});

test("moved(): only on the app's own icon, filling the screen: never in iOS's small browser (standalone too, opened from another Home Screen app's link, short of the screen and under its bars), where the card would cover the page", () => {
  // (an iPhone, standalone: upright or on its side; the window's height against the screen's (iOS gives the screen's
  // size upright, whichever way it's held); the top inset a probe at env(safe-area-inset-top) measures: running up
  // behind the status bar, as a Home Screen icon's page does)
  const phone = ({ portrait = true, inner = 844, tall = 844, wide = 390, inset = 0 } = {}) => (w) => {
    w.matchMedia = (q) => ({ matches: /orientation:\s*portrait/.test(q) ? portrait : false });
    w.innerHeight = inner; w.screen = { height: tall, width: wide };
    const make = w.document.createElement;
    w.document.createElement = (t) => { const n = make(t); Object.defineProperty(n, "offsetHeight", { get: () => (/safe-area-inset-top/.test(n.style.cssText || "") ? inset : 0) }); return n; };
  };
  const at = (look) => page("https://finance.inflite.ai/", { standalone: true, before: phone(look) });
  const shown = (p) => !!p.doc.body.children.find((n) => n.className.includes("ifl-moved"));
  for (const [look, yes, why] of [
    [{ inner: 844, tall: 844 }, true, "filling the screen"],
    [{ inner: 797, tall: 844, inset: 47 }, true, "short of it by iOS's slip, but behind the status bar"],
    [{ portrait: false, inner: 390, tall: 844 }, true, "on its side, filling the screen's short side"],
    [{ inner: 760, tall: 844, inset: 0 }, false, "iOS's small browser: short of the screen, no inset"],
    [{ portrait: false, inner: 330, tall: 844, inset: 0 }, false, "iOS's small browser on its side: short of the screen's short side, under its bar (review-i1 I7)"],
  ]) {
    const p = at(look);
    assert.equal(p.hub.moved("markets", { off() {} }), yes, why);
    assert.equal(shown(p), yes, `${why}: the card ${yes ? "shown" : "not shown"}`);
    assert.equal(!!p.local.get("ifl-moved:markets"), yes, `${why}: ${yes ? "remembered" : "not remembered, so the icon itself still shows it, later"}`);
    assert.ok(!p.doc.body.children.some((n) => n.tagName === "DIV" && /safe-area/.test(n.style.cssText || "")), `${why}: the probe taken away`);
  }
  // (the small browser first, then the icon itself: shown then, once)
  const kept = {};
  const small = page("https://finance.inflite.ai/", { standalone: true, kept, before: phone({ inner: 760, tall: 844 }) });
  assert.equal(small.hub.moved("markets"), false);
  assert.equal(page("https://finance.inflite.ai/", { standalone: true, kept: Object.fromEntries(small.local), before: phone() }).hub.moved("markets"), true, "the icon itself, afterwards: shown");
  // (not an iPhone or iPad: no navigator.standalone, the display mode standalone: shown, as before)
  const desk = page("https://finance.inflite.ai/", { before: (w) => { w.matchMedia = (q) => ({ matches: /display-mode:\s*standalone/.test(q) }); w.innerHeight = 500; w.screen = { height: 1200 }; } });
  assert.equal(desk.hub.moved("markets"), true, "an installed app elsewhere: shown");
});

test("a notification tapped while a page is open: heard, it says so on the worker's port; never for one it won't go to, nor off the hub", () => {
  const port = () => { const got = []; return { got, postMessage: (m) => got.push(JSON.parse(JSON.stringify(m))) }; };
  let p = page("https://inflite.ai/weather/", { marker: "/weather/" }), a = port();
  p.message({ ifl: "open", url: "/chats/#open=abc" }, [a]);
  assert.deepEqual(a.got, [{ ifl: "opened" }]);
  assert.deepEqual(p.assigned, ["/chats/#open=abc"]);
  // (degraded: the app's own address, and heard all the same)
  p = page("https://inflite.ai/", { marker: "/" }); p.hub.degrade(); a = port();
  p.message({ ifl: "open", url: "/chats/#open=abc" }, [a]);
  assert.deepEqual(a.got, [{ ifl: "opened" }]);
  assert.deepEqual(p.assigned, ["https://chat.inflite.ai/#open=abc"]);
  // (another site's, or no word for this layer: no answer, so the worker goes its own way)
  for (const data of [{ ifl: "open", url: "//evil.example/" }, { ifl: "open", url: "https://evil.example/" }, { inflight: "sync" }]) {
    p = page("https://inflite.ai/", { marker: "/" }); a = port();
    p.message(data, [a]);
    assert.deepEqual(a.got, [], JSON.stringify(data));
  }
  p = page("https://chat.inflite.ai/"); a = port();
  p.message({ ifl: "open", url: "/chats/#open=abc" }, [a]);
  assert.deepEqual(a.got, [], "off the hub");
  // (with no port to answer on (an older worker): it goes there all the same)
  p = page("https://inflite.ai/", { marker: "/" });
  p.message({ ifl: "open", url: "/#you" });
  assert.deepEqual(p.assigned, ["/#you"]);
});

test("the Home Screen badge: at the hub, the root worker asked to count again as a page opens and each time it's back in sight; never off the hub", async () => {
  const tick = () => new Promise((r) => setImmediate(r));
  const p = page("https://inflite.ai/weather/", { marker: "/weather/" });
  await tick();
  assert.deepEqual(p.badge, [["/", { ifl: "badge" }]], "the root worker's (scope /), as the page opens");
  p.visible(false); await tick();
  assert.equal(p.badge.length, 1, "not as it goes out of sight");
  p.visible(true); await tick();
  assert.equal(p.badge.length, 2, "again back in sight");
  const q = page("https://weather.inflite.ai/");
  q.visible(true); await tick();
  assert.deepEqual(q.badge, [], "off the hub: the app's own worker, as it always was");
});

test("moved()'s card keeps the keys to itself: Tab and Shift-Tab go round its buttons, Escape shuts it", () => {
  const p = page("https://chat.inflite.ai/", { standalone: true });
  p.hub.moved("chat", { off() {} });
  const card = p.doc.body.children.find((n) => n.className.includes("ifl-moved"));
  const btn = (t) => all(card).find((n) => n.tagName === "BUTTON" && n.textContent === t);
  const key = (k, shift = false) => { const e = { key: k, shiftKey: shift, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const fn of p.doc.listeners.keydown || []) fn(e); return e; };
  assert.equal(p.doc.activeElement, btn("How to Add"), "How to Add first");
  assert.ok(key("Tab").defaultPrevented);
  assert.equal(p.doc.activeElement, btn("Turn Off Notifications Here"));
  key("Tab");
  assert.equal(p.doc.activeElement, btn("Not Now"));
  key("Tab");
  assert.equal(p.doc.activeElement, btn("How to Add"), "round again, never behind it");
  key("Tab", true);
  assert.equal(p.doc.activeElement, btn("Not Now"), "Shift-Tab, the other way round");
  btn("Not Now").focus(); p.doc.activeElement = null;
  key("Tab", true);
  assert.equal(p.doc.activeElement, btn("Not Now"), "from outside it: back in, at its end");
  key("Escape");
  assert.ok(!card.classList.contains("on"), "Escape shuts it");
});
