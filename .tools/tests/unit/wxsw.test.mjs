// Weather's service worker (weather/sw.js) shares its address with others at InFlite's hub (Today First, spec §3.2,
// §9.2): there, Weather is inflite.ai/weather/, beside Today's own worker (/) and Chats', each keeping copies of its own
// in the one address's caches. Run here with what a browser gives it made up: as a new version starts, it lets go of
// Weather's own old copies (wx-…) alone, never Today's, Chats' or any other app's; and it answers only what's inside its
// own part of the address, so the hub's manifest, Chats' page, Today's and the APIs are each the site's, never kept
// here. At Weather's own address (weather.inflite.ai, all of it Weather's) it answers as it always has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SW = readFileSync(new URL("../../../weather/sw.js", import.meta.url), "utf8");
const CACHE = /const CACHE = "([^"]+)"/.exec(SW)[1], LIBS = /LIBS = "([^"]+)"/.exec(SW)[1], TINT = /const TINT = "([^"]+)"/.exec(SW)[1];

// (the worker at scope, its caches holding names (each a Map), the network answering each address with what net says)
// (a same-origin answer, as a browser's fetch gives one: "basic", which the worker keeps)
const basic = (res) => Object.defineProperty(res, "type", { value: "basic" });
function worker(scope, names = [], net = (url) => basic(new Response(`from the network: ${url}`, { status: 200 }))) {
  const on = {}, stores = new Map(names.map((k) => [k, new Map()])), deleted = [], fetched = [];
  const origin = new URL(scope).origin;
  const self = {
    location: new URL("sw.js", scope),
    registration: { scope, showNotification: async () => {}, pushManager: { getSubscription: async () => null } },
    addEventListener: (k, f) => (on[k] = f),
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (k) => { deleted.push(k); return stores.delete(k); },
    open: async (k) => {
      if (!stores.has(k)) stores.set(k, new Map());
      const m = stores.get(k), key = (r) => new URL(typeof r === "string" ? r : r.url, self.location).href;
      return { match: async (r, o) => { const u = key(r); for (const [k2, v] of m) if (k2 === u || (o?.ignoreSearch && k2.split("?")[0] === u.split("?")[0])) return v.clone(); }, put: async (r, res) => m.set(key(r), res) };
    },
  };
  const fetch = async (r) => { const url = new URL(typeof r === "string" ? r : r.url, self.location).href; fetched.push(url); return net(url); };
  vm.runInNewContext(SW, { self, caches, fetch, URL, Request, Response, Headers, TextDecoder, btoa, atob, crypto, Uint8Array, Promise, JSON, setTimeout, clearTimeout });
  // (an event, as the browser sends it: whether it was answered, with what, and once everything it waited on is done)
  const send = async (k, x = {}) => {
    let answer = null, answered = false;
    const waits = [];
    on[k]({ ...x, respondWith: (p) => { answered = true; answer = Promise.resolve(p); }, waitUntil: (p) => waits.push(p) });
    const res = answer ? await answer : null;
    await Promise.all(waits);
    return { answered, res };
  };
  const get = (path) => send("fetch", { request: new Request(new URL(path, origin).href) });
  // (a page gone to: a navigation, which a Request made here can't say it is)
  const nav = (path) => { const req = new Request(new URL(path, origin).href); Object.defineProperty(req, "mode", { value: "navigate" }); return send("fetch", { request: req }); };
  return { send, get, nav, stores, deleted, fetched, origin };
}

test("starting a new version, it lets go of Weather's own old copies alone, never another app's sharing its address", async () => {
  const others = ["today-app-2", "today-app-1", "inflight-shell-1.67", "inflight-shell-1.68", "fx-shell-1.40", "mk-1.61", "mail-3", "workbox-precache", "weather-notes"];
  const w = worker("https://inflite.ai/weather/", [CACHE, LIBS, TINT, "wx-1.10", "wx-1.62", "wx-libs-maplibre-5.0.0-leaflet-1.9.3", ...others]);
  await w.send("activate");
  assert.deepEqual([...w.deleted].sort(), ["wx-1.10", "wx-1.62", "wx-libs-maplibre-5.0.0-leaflet-1.9.3"].sort(), "only Weather's own older copies");
  for (const k of [CACHE, LIBS, TINT, ...others]) assert.ok(w.stores.has(k), `${k} kept`);
  // (its own address too: the same rule, so nothing changes there)
  const own = worker("https://weather.inflite.ai/", [CACHE, LIBS, TINT, "wx-1.60", "today-app-2"]);
  await own.send("activate");
  assert.deepEqual(own.deleted, ["wx-1.60"]);
});

test("at the hub, it answers only what's inside /weather/: the hub's manifest, Chats, Today and the APIs are never its", async () => {
  const w = worker("https://inflite.ai/weather/", [CACHE, LIBS, TINT]);
  for (const path of ["/manifest.webmanifest", "/icon-180.png", "/chats/", "/chats/app.js?v=abc123def456", "/", "/app.js", "/sw.js", "/version", "/api/weather/me", "/api/pigeon/sync",
    "/fitness/app.js", "/markets/", "/weatherish/app.js", "/weather"]) {
    const { answered } = await w.get(path);
    assert.equal(answered, false, `${path}: left to the site`);
  }
  // (a page outside it, gone to: not its either)
  assert.equal((await w.nav("/chats/")).answered, false, "Chats' page");
  assert.equal((await w.nav("/")).answered, false, "Today's page");
  assert.deepEqual(w.fetched, [], "and nothing fetched for any of them");
  for (const k of [CACHE, LIBS, TINT]) assert.equal(w.stores.get(k).size, 0, `nothing kept in ${k}`);
});

test("at the hub, its own files and page are its own, kept as they come; its version check left to the network", async () => {
  const w = worker("https://inflite.ai/weather/", [CACHE, LIBS, TINT]);
  const js = await w.get("/weather/app.js");
  assert.ok(js.answered && js.res.ok, "its script");
  assert.equal(await js.res.text(), "from the network: https://inflite.ai/weather/app.js");
  assert.ok(w.stores.get(CACHE).has("https://inflite.ai/weather/app.js"), "kept with this version");
  const lib = await w.get("/weather/vendor/maplibre-gl.js");
  assert.ok(lib.answered && w.stores.get(LIBS).has("https://inflite.ai/weather/vendor/maplibre-gl.js"), "a library, kept with the libraries");
  const page = await w.nav("/weather/?lat=51.5&lon=-0.12&name=Soho");
  assert.ok(page.answered && page.res.ok, "its page, wherever it's opened on");
  assert.ok(w.stores.get(CACHE).has("https://inflite.ai/weather/"), "kept as its one page");
  // (the second time, from what's kept, not the network)
  const n = w.fetched.length;
  assert.ok((await w.get("/weather/app.js")).answered && w.fetched.length === n, "from what's kept");
  assert.equal((await w.get("/weather/version")).answered, false, "its version: always the network's (IFL.updates)");
});

test("at Weather's own address, all of it Weather's: answered as it always has, the API and the version left alone", async () => {
  const w = worker("https://weather.inflite.ai/", [CACHE, LIBS, TINT]);
  for (const path of ["/app.js", "/styles.css", "/manifest.webmanifest"]) assert.equal((await w.get(path)).answered, true, path);
  assert.equal((await w.nav("/?lat=1&lon=2")).answered, true, "its page");
  for (const path of ["/api/weather/me", "/version"]) assert.equal((await w.get(path)).answered, false, path);
  const away = await w.send("fetch", { request: new Request("https://api.open-meteo.com/v1/forecast?latitude=1") });
  assert.equal(away.answered, false, "another site's: never");
  const post = await w.send("fetch", { request: new Request("https://weather.inflite.ai/app.js", { method: "POST", body: "x" }) });
  assert.equal(post.answered, false, "only GETs");
});
