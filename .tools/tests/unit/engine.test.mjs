// Chat's engine (Today First, spec §8.2, §14.2): pigeon/app.js as /chats/?engine=1 in a frame of another page of the
// hub, giving that page window.IFLChat. Its rules are one block of app.js that reads nothing of the page ("the hub's
// rules"), run here on its own: when Chat is the engine (at the hub, asked for, framed by a page of its own site; never
// across sites, without the marker or at the top), the path rule for then= and back= (a path of this site's: no //, no
// :, no \, ≤ 200 characters), IFLChat's keys and nothing more, sendTo refused without a tap on the page, and the
// engine's one sync asking quiet=1. The rest is checked in the source: the engine registers no service worker, starts
// no updater, never pulses, draws no list, and says it's ready on the page it's in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url);
// (app.js, and later.js, the part of it loaded once the first screen is up: the engine loads it before it's ready)
const APP = readFileSync(new URL("pigeon/app.js", ROOT), "utf8") + "\n" + readFileSync(new URL("pigeon/later.js", ROOT), "utf8");
const THEME = readFileSync(new URL("pigeon/theme.js", ROOT), "utf8");
const START = "// ==== the hub's rules (engine.test.mjs runs this block on its own", END = "// ==== end of the hub's rules ====";
const block = (() => {
  const a = APP.indexOf(START), b = APP.indexOf(END);
  assert.ok(a > 0 && b > a, "app.js has the hub's rules block");
  return APP.slice(a, b);
})();
// (the block run with nothing of the page about: no window, no document, no location)
const R = new Function("window", "document", "location", "parent", `"use strict";\n${block}\nreturn { hubPath, hashPath, engineRule, syncPath, makeIFLChat, tappedOn };`)(undefined, undefined, undefined, undefined);

// a window and its parent, as a frame of a page sees them: the parent's origin readable only when it's the same site
const win = (origin) => ({ location: { origin } });
const crossParent = () => ({ get location() { throw new DOMException("Blocked a frame with origin from accessing a cross-origin frame.", "SecurityError"); } });

test("the engine: at the hub, asked for, in a frame of a page of its own site; never otherwise", () => {
  const me = win("https://inflite.ai"), page = win("https://inflite.ai");
  assert.equal(R.engineRule(true, "?engine=1", me, page), true, "a frame of a page of the hub, ?engine=1");
  assert.equal(R.engineRule(true, "?x=1&engine", me, page), true, "?engine with anything beside it");
  assert.equal(R.engineRule(false, "?engine=1", me, page), false, "off without the hub's marker (chat.inflite.ai, chat.localhost)");
  assert.equal(R.engineRule(true, "?engine=1", me, me), false, "off at the top (its parent is itself)");
  assert.equal(R.engineRule(true, "", me, page), false, "off when not asked for");
  assert.equal(R.engineRule(true, "?engines=1", me, page), false, "only engine itself");
  assert.equal(R.engineRule(true, "?engine=1", me, crossParent()), false, "off across sites (the parent's origin can't be read)");
  assert.equal(R.engineRule(true, "?engine=1", me, win("https://evil.example")), false, "off in a frame of another site that can be read");
  assert.equal(R.engineRule(true, "?engine=1", me, win("https://next.inflite.ai")), false, "off framed by the staging hub");
  assert.equal(R.engineRule(true, "?engine=1", me, null), false, "off with no parent");
});

test("the ENGINE line is the rule, as the spec writes it: the marker (IFL.hub.on), ?engine, a parent that isn't itself, its origin", () => {
  assert.match(APP, /const HUB = !!IFL\.hub\?\.on;/);
  assert.match(APP, /const ENGINE = engineRule\(HUB, location\.search, window, window\.parent\);/);
  // (and theme.js's copy, for the first frame's look: the marker, ?engine, framed by its own site)
  assert.match(THEME, /meta\[name="ifl-hub"\]/);
  assert.match(THEME, /window\.parent !== window && window\.parent\.location\.origin === location\.origin\) root\.classList\.add\("engine"\)/);
});

test("then= and back=: a path of this site's only", () => {
  for (const ok of ["/", "/#apps", "/#you", "/weather/#radar", "/markets/#s=TSCO", "/chats/", "/fitness/?a=1#day=2026-11-03", "/" + "x".repeat(199)]) assert.equal(R.hubPath(ok), true, ok);
  for (const no of ["//evil.example/", "///x", "/x:y", "https://evil.example/", "javascript:alert(1)", "\\\\evil", "/a\\b", "/\\evil", "x/", "", " /", "/\n/evil", "/\t/x",
    "/" + "x".repeat(200), null, undefined, 1, ["/"], {}]) assert.equal(R.hubPath(no), false, JSON.stringify(no));
  assert.equal(R.hashPath("#signin-start&then=%2F", "then"), "/");
  assert.equal(R.hashPath("#signin-start&then=%2F%23apps", "then"), "/#apps");
  assert.equal(R.hashPath("#share=Hi&card=abc&back=%2Fweather%2F%23radar", "back"), "/weather/#radar");
  assert.equal(R.hashPath("share=Hi&back=%2F", "back"), "/", "with or without its #");
  for (const bad of ["%2F%2Fevil.example", "https%3A%2F%2Fevil.example%2F", "%2Fa%3Ab", "%2F%5Cx", encodeURIComponent("/" + "y".repeat(205)), "", "relative"])
    assert.equal(R.hashPath(`#share=Hi&back=${bad}`, "back"), null, bad);
  assert.equal(R.hashPath("#share=Hi", "back"), null, "none given");
  assert.equal(R.hashPath(null, "then"), null);
});

const deps = (o = {}) => {
  const calls = [];
  const d = { state: () => "ready", share: (...a) => (calls.push(["share", ...a]), Promise.resolve({ ok: true })), tapped: () => false,
    sendOne: (...a) => (calls.push(["sendOne", ...a]), Promise.resolve({ ok: true, say: "Sent to Pat" })), waiting: (x) => (calls.push(["waiting", x]), Promise.resolve([])),
    since: (...a) => (calls.push(["since", ...a]), Promise.resolve(null)), refresh: () => (calls.push(["refresh"]), Promise.resolve(true)), signOut: () => (calls.push(["signOut"]), Promise.resolve(true)), ...o };
  return { d, calls };
};

test("IFLChat has these keys and no others, and can't be changed", () => {
  const { d } = deps();
  const c = R.makeIFLChat(d);
  assert.deepEqual(Object.keys(c).sort(), ["refresh", "reply", "sendTo", "share", "signOut", "since", "state", "waiting"]);
  assert.ok(Object.isFrozen(c));
  assert.throws(() => { "use strict"; c.sendTo = () => ({ ok: true }); });
  assert.throws(() => { "use strict"; c.extra = 1; });
  // (state is read each time: a key unlocked later makes it ready)
  let st = "key"; const live = R.makeIFLChat({ ...d, state: () => st });
  assert.equal(live.state, "key"); st = "ready"; assert.equal(live.state, "ready");
});

test("sendTo is refused without a tap on the page, and nothing is sent", async () => {
  const { d, calls } = deps({ tapped: () => false });
  const c = R.makeIFLChat(d);
  assert.deepEqual(await c.sendTo("pat-id", "Rain at 3", "eyJ"), { ok: false, why: "tap" });
  assert.equal(calls.length, 0, "no send, no sheet");
  const t = deps({ tapped: () => true }), c2 = R.makeIFLChat(t.d);
  assert.deepEqual(await c2.sendTo("pat-id", "Rain at 3", "eyJ"), { ok: true, say: "Sent to Pat" });
  assert.deepEqual(t.calls, [["sendOne", "pat-id", "Rain at 3", "eyJ"]]);
  // (and the tap is the page's own user activation, read where the engine's frame can: its parent, through the engine's
  // own getters, taken as it starts)
  assert.match(APP, /tapped: \(\) => \{ try \{ return tappedOn\(parent\.navigator, UA_GET, ACTIVE_GET\); \} catch \(_\) \{ return false; \} \}/);
  assert.match(APP, /const UA_GET = \(\(\) => \{ try \{ return Object\.getOwnPropertyDescriptor\(Navigator\.prototype, "userActivation"\)\?\.get/);
  assert.match(APP, /const ACTIVE_GET = \(\(\) => \{ try \{ return Object\.getOwnPropertyDescriptor\(UserActivation\.prototype, "isActive"\)\?\.get/);
  assert.doesNotMatch(APP, /parent\.navigator\.userActivation/, "never the page's own property");
});

test("the page's tap is read through the engine's own getters: nothing the page sets on its navigator counts", () => {
  // (a realm's Navigator and UserActivation, as the engine's frame has them: their getters read the platform's own state)
  const real = new WeakMap();
  class Nav { get userActivation() { return real.get(this) ?? null; } }
  class UA { get isActive() { const s = real.get(this); if (!s) throw new TypeError("Illegal invocation"); return s.active; } }
  const getUA = Object.getOwnPropertyDescriptor(Nav.prototype, "userActivation").get, getActive = Object.getOwnPropertyDescriptor(UA.prototype, "isActive").get;
  const page = (active) => { const n = new Nav(), u = new UA(); real.set(n, u); real.set(u, { active }); return n; };
  assert.equal(R.tappedOn(page(true), getUA, getActive), true, "tapped");
  assert.equal(R.tappedOn(page(false), getUA, getActive), false, "not tapped");
  // the page's own script says it's tapped, on its navigator: not counted
  const lied = page(false);
  Object.defineProperty(lied, "userActivation", { value: { isActive: true, hasBeenActive: true } });
  assert.equal(lied.userActivation.isActive, true, "(as the page itself would read it)");
  assert.equal(R.tappedOn(lied, getUA, getActive), false, "an own property on the page's navigator");
  // nor a navigator that isn't one, nor a getter that isn't there (an older browser: never tapped)
  assert.equal(R.tappedOn({ userActivation: { isActive: true } }, getUA, getActive), false, "a plain object");
  assert.equal(R.tappedOn(page(true), null, getActive), false, "no userActivation getter");
  assert.equal(R.tappedOn(page(true), getUA, null), false, "no isActive getter");
  // (and a page's copy of the prototype changed after the engine took its getters: still the real state)
  const pageUA = Object.getOwnPropertyDescriptor(UA.prototype, "isActive");
  Object.defineProperty(UA.prototype, "isActive", { configurable: true, get: () => true });
  try { assert.equal(R.tappedOn(page(false), getUA, getActive), false, "the prototype patched afterwards"); }
  finally { Object.defineProperty(UA.prototype, "isActive", pageUA); }
});

test("share, waiting, since, refresh and signOut pass straight through, with what's given", async () => {
  const { d, calls } = deps();
  const c = R.makeIFLChat(d);
  await c.share("Weather here", "abc", { to: "leo" });
  await c.share("Weather here", "abc");
  await c.waiting({ ids: ["a", "b"], stocks: [{ sym: "TSCO", name: "Tesco" }] });
  await c.since("a", 123);
  await c.refresh(); await c.signOut();
  assert.deepEqual(calls, [["share", "Weather here", "abc", { to: "leo" }], ["share", "Weather here", "abc", { to: undefined }], ["waiting", { ids: ["a", "b"], stocks: [{ sym: "TSCO", name: "Tesco" }] }],
    ["since", "a", 123], ["refresh"], ["signOut"]]);
});

test("the engine's sync asks quiet=1 (you aren't seen in Chats because Today is open); Chats' own doesn't", () => {
  assert.equal(R.syncPath(true), "sync?quiet=1");
  assert.equal(R.syncPath(false), "sync");
  assert.match(APP, /d = await api\(syncPath\(ENGINE\)\);/, "sync() asks by the rule");
  assert.doesNotMatch(APP, /api\("sync"\)/, "and nothing asks plain sync besides");
  // (refresh is one more of those syncs, never on a timer)
  assert.match(APP, /refresh: \(\) => \(S\.token && S\.priv \? sync\(\)/);
});

test("the engine draws no list or tab bar, never pulses, registers no worker, starts no updater, and says it's ready on its page", () => {
  assert.match(APP, /if \(ENGINE\) \{\n\s+\$view\.innerHTML = ""; drawnView = null; \$compose\.hidden = true; \$tabbar\.hidden = true;/, "render(): nothing of its own");
  assert.match(APP, /function pulseWanted\(\) \{\n\s+const L = S\.live;\n\s+if \(ENGINE \|\|/, "pulseWanted(): false in the engine");
  assert.match(APP, /if \(!ENGINE && "serviceWorker" in navigator/, "no service worker");
  assert.match(APP, /if \(!ENGINE\) IFL\.updates\(/, "no updater (the page's reloads both)");
  assert.match(APP, /if \(ENGINE\) \{ mount\(\); return engineStart\(\); \}/, "its own start: no timers");
  assert.match(APP, /function cacheSave\(\) \{\n\s+if \(ENGINE\) return;/, "keeps nothing");
  assert.match(APP, /window\.IFLChat = makeIFLChat\(/);
  assert.match(APP, /parent\.dispatchEvent\(new parent\.Event\("ifl-chat-ready"\)\)/, "ifl-chat-ready on the page it's in");
  assert.match(APP, /hubParent\(\)\?\.sent\?\.\(say \|\| "Sent"\)/, "Sent: the page says it");
  assert.match(APP, /hubParent\(\)\?\.closed\?\.\(\)/, "Close: the page puts it away");
  assert.match(APP, /const ASK_NOTIFY = IFL\.wantsAllow\(\) && !HUB;/, "no notification prompt at the hub");
  // (the start, in the engine, before anything else: no welcome, no sign-in trip, no location asked for)
  const start = APP.slice(APP.indexOf("async function start() {"), APP.indexOf("async function start() {") + 400);
  assert.match(start, /if \(ENGINE\) \{ mount\(\); return engineStart\(\); \}/);
});

test("waiting reads each named chat's messages since your last, five at most, opened in memory, through digest.js; nothing marked read or kept", () => {
  const w = APP.slice(APP.indexOf("async function waitingItem("), APP.indexOf("async function engineSignOut("));
  assert.match(w, /api\(f \? `messages\?with=\$\{encodeURIComponent\(id\)\}&quiet=1` : `group-messages\?id=\$\{encodeURIComponent\(id\)\}&quiet=1`\)/, "quiet, as the engine's sync");
  assert.match(w, /\.slice\(-5\)/);
  assert.match(w, /\.slice\(0, 6\)/, "six chats at most");
  assert.match(w, /waitingDigest\(items, \{ stocks: S\.stocks \|\| \[\], now: Date\.now\(\) \}\)/);
  assert.doesNotMatch(w, /localStorage|sessionStorage|idb\.|indexedDB|"read"|group-read|POST/, "no storage, no read receipts, no writes");
});
