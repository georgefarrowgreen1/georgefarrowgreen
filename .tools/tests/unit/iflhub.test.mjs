// InFlite's hub layer (IFL.hub, in .tools/inflite/menu.js; Today First, spec §3.5, §3.6): the template run in a made-up
// page (window, document, sessionStorage, location), as every app runs its copy. The marker, not the address, turns it
// on; go() maps the apps' own addresses to the hub's paths and is the identity off the hub; href() names an app's
// section; the breadcrumb is written as a page is left for another and read by back(), which never uses history's own
// back; send() goes through Chats' own sheet while there's no engine; signIn() goes through Chats and comes back.
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
  focus() {}
  dispatch(type) { const e = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (let n = this; n; n = n.parentNode) for (const fn of n.listeners[type] || []) fn(e); return e; }
}
function page(href, { marker = null, crumb } = {}) {
  const doc = new Node("#document"), head = new Node("head"), body = new Node("body");
  doc.append(head, body);
  doc.body = body;
  doc.createElement = (t) => new Node(t);
  const meta = marker == null ? null : Object.assign(new Node("meta"), { attrs: { name: "ifl-hub", content: marker } });
  doc.querySelector = (sel) => (sel === 'meta[name="ifl-hub"]' ? meta : null);
  doc.querySelectorAll = () => [];
  const store = new Map(crumb === undefined ? [] : [["ifl-crumb", crumb]]);
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const assigned = [], went = [];
  const at = new URL(href);
  const location = { href: at.href, origin: at.origin, host: at.host, hostname: at.hostname, protocol: at.protocol, pathname: at.pathname, search: at.search, hash: at.hash, assign: (u) => assigned.push(String(u)), replace: (u) => assigned.push(String(u)), reload() {} };
  const history = { back: () => went.push("back"), go: () => went.push("go"), replaceState() {}, pushState() {} };
  const ctx = { document: doc, sessionStorage, location, history, URL, URLSearchParams, Blob, Promise, JSON, Math, Object, Array, String, Number, Set, Map, Date,
    requestAnimationFrame: (fn) => fn(), setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, addEventListener() {}, navigator: {}, innerHeight: 800, innerWidth: 400 };
  ctx.window = ctx;
  const IFL = vm.runInNewContext(`${jsBlock()}\n;IFL`, ctx);
  return { IFL, hub: IFL.hub, doc, store, assigned, went, location };
}

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
  for (const crumb of [undefined, "/weather/", "/weather/#day=2026-11-02", "//evil.example/x", "https://evil.example/", "/x\\y", "weather/", "/" + "x".repeat(200)]) {
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

test("send() goes through Chats' own sheet while there's no engine, and comes back here; signIn() through Chats too", async () => {
  const p = page("https://inflite.ai/weather/#radar", { marker: "/weather/" });
  assert.equal(await p.hub.chat(), null, "no engine yet");
  await p.hub.send("London today: rain from 15:00 & wind", "eyJ2IjoxLCJraW5kIjoid2VhdGhlciJ9");
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
  s.hub.signIn();
  assert.deepEqual(s.assigned, ["/chats/#signin-start&then=%2Fmarkets%2F%23s%3DTSCO"]);
  assert.deepEqual([...p.went, ...s.went], []);
});

test("sent() says it in a toast; closed() and moved() do nothing yet, and say nothing", () => {
  const p = page("https://inflite.ai/", { marker: "/" });
  p.hub.closed();
  p.hub.moved("chat", { off: () => assert.fail("off isn't called") });
  const before = p.doc.body.children.length;
  p.hub.sent("Sent to Pat. You’re still here");
  const toast = p.doc.body.children.find((n) => n.className.includes("ifl-toast"));
  assert.ok(toast, "a toast");
  assert.equal(toast.textContent, "Sent to Pat. You’re still here");
  assert.equal(p.doc.body.children.length, before + 1);
  assert.deepEqual(p.assigned, []);
});
