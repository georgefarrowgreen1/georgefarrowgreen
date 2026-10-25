// The site's one sign-in (functions/_account.js), and Weather's part of the account: putting two devices' places and
// notifications together (weather/account.js), and what's kept made safe (functions/_wxacct.js, _wxpush.js wantOf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePlaces, mergeNotify, mergeSettings, notifyChanges, keyOf, nkeyOf } from "../../../weather/account.js";
import { cookieToken, withCookie, withoutSession } from "../../../functions/_account.js";
import { cleanData } from "../../../functions/_wxacct.js";
import { wantOf, mailWant } from "../../../functions/_wxpush.js";

const P = (name, lat, lon) => ({ name, region: "", lat, lon });
const london = P("London", 51.5072, -0.1276), leeds = P("Leeds", 53.8, -1.55), york = P("York", 53.96, -1.08), bath = P("Bath", 51.38, -2.36);

test("places put together: the account's, less what this device took away since, and what it added", () => {
  // in step from [London, Leeds]; since then, this device took Leeds away and added York, and another added Bath
  const theirs = [london, leeds, bath], mine = [london, york], base = [london, leeds].map(keyOf);
  assert.deepEqual(mergePlaces(theirs, mine, base).map((p) => p.name), ["London", "Bath", "York"]);
  // signed in for the first time (nothing in step before): all of both, the account's first
  assert.deepEqual(mergePlaces([london, bath], [york, london], []).map((p) => p.name), ["London", "Bath", "York"]);
  // taken away elsewhere, and not touched here: gone here too
  assert.deepEqual(mergePlaces([london], [london, leeds], [london, leeds].map(keyOf)).map((p) => p.name), ["London"]);
});

test("settings put together, setting by setting: those changed here since, the rest the account's", () => {
  // (as app.js has canon: an object's keys in order)
  const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
  // in step at °C and the 24-hour clock; since then, the 12-hour clock here, and °F on another device
  const base = { temp: "c", clock: "24" }, mine = { temp: "c", clock: "12" }, theirs = { temp: "f", clock: "24" };
  assert.deepEqual(mergeSettings(theirs, mine, base, ["temp", "clock"], canon), { temp: "f", clock: "12" });
  // (a setting that's an object: the same, its keys in any order, isn't a change)
  assert.deepEqual(mergeSettings({ commute: { on: true, am: "07:30" } }, { commute: { am: "08:00", on: false } }, { commute: { on: false, am: "08:00" } }, ["commute"], canon), { commute: { on: true, am: "07:30" } });
  // nothing kept with the account, nor in step before: all of this device's
  assert.deepEqual(mergeSettings(null, mine, null, ["temp", "clock"], canon), mine);
});

test("notifications put together, place by place: this device's changes since, over the account's", () => {
  const was = { places: [{ ...london, rain: true, warn: false }], brief: null, briefAt: "07:00" };
  // here: London's warnings on too; elsewhere: Leeds's rain on, and a briefing for Leeds
  const mine = { places: [{ ...london, rain: true, warn: true }], brief: null, briefAt: "07:00" };
  const theirs = { places: [{ ...london, rain: true, warn: false }, { ...leeds, rain: true, warn: false }], brief: leeds, briefAt: "06:30" };
  const changed = notifyChanges(mine, was);
  assert.deepEqual(changed, [keyOf(london)]);
  const m = mergeNotify(theirs, mine, changed);
  assert.deepEqual(m.places.map((p) => `${p.name}:${p.rain}${p.warn}`), ["London:truetrue", "Leeds:truefalse"]);
  assert.equal(m.brief.name, "Leeds"); assert.equal(m.briefAt, "06:30");
  // turned off here: off, even though the account still had it on
  const off = { places: [], brief: null, briefAt: "07:00" };
  assert.deepEqual(mergeNotify(theirs, off, notifyChanges(off, was)).places.map((p) => p.name), ["Leeds"]);
  // My Location is one place whichever device it's on, wherever that is
  assert.equal(nkeyOf({ lat: 1, lon: 2, gps: true }), "gps");
  assert.deepEqual(notifyChanges({ places: [{ lat: 51, lon: 0, gps: true, rain: true }] }, { places: [{ lat: 52, lon: 1, gps: true, rain: true }] }), []);
});

test("by email too: a choice of its own, put together like the rest, and only the warnings and the briefing", () => {
  const was = { places: [{ ...london, rain: true, warn: true }], brief: london, briefAt: "07:00" };
  const mine = { ...was, email: { warn: true, brief: false } };
  assert.deepEqual(notifyChanges(mine, was), ["email"]);
  // turned on here: on, whatever the account had; not touched here: the account's
  const theirs = { ...was, briefAt: "06:30", email: { warn: false, brief: true } };
  assert.deepEqual(mergeNotify(theirs, mine, notifyChanges(mine, was)).email, { warn: true, brief: false });
  assert.deepEqual(mergeNotify(theirs, was, []).email, { warn: false, brief: true });
  // kept with the account as it's chosen
  assert.deepEqual(cleanData({ places: [london], notify: { ...mine, email: { warn: 1, brief: 0, extra: "x" } } }).notify.email, { warn: true, brief: false });
  // what the account's email is sent: the places with warnings on (never rain alerts), and the briefing, each if chosen
  const w = wantOf({ places: [{ ...london, rain: true, warn: true }, { ...leeds, rain: true }], brief: york, email: { warn: true, brief: false } });
  assert.deepEqual(mailWant(w), { places: [{ lat: 51.51, lon: -0.13, name: "London", rain: false, warn: true }], brief: null, briefAt: "07:00" });
  assert.deepEqual(mailWant({ ...w, email: { warn: false, brief: true } }).brief.name, "York");
  assert.deepEqual(mailWant({ ...w, email: { warn: false, brief: false } }), { places: [], brief: null, briefAt: "07:00" });
});

test("what's kept with the account, made safe", () => {
  const d = cleanData({ places: [london, { ...london, name: "London again" }, { name: "‮evil", lat: 52, lon: 1 }, { name: "nowhere", lat: 95, lon: 0 }], settings: { temp: "f" },
    notify: { places: [{ ...london, rain: true }, { ...leeds }], brief: london, briefAt: "25:00" } });
  assert.deepEqual(d.places.map((p) => p.name), ["London", "evil"]);
  assert.deepEqual(d.notify.places.map((p) => [p.name, p.lat, p.lon, p.rain, p.warn]), [["London", 51.51, -0.13, true, false]]);
  assert.equal(d.notify.brief.name, "London"); assert.equal(d.notify.briefAt, "07:00");
  assert.throws(() => cleanData({ places: Array.from({ length: 51 }, (_, i) => P(`P${i}`, i, i)) }), /50 places at most/);
  assert.throws(() => cleanData([]), /Bad request/);
});

test("a device's notifications: a place each, and the app from before's one place", () => {
  assert.deepEqual(wantOf({ place: { lat: 51.5072, lon: -0.1276, name: "London" }, rain: true, brief: true, briefAt: "06:15" }),
    { places: [{ lat: 51.51, lon: -0.13, name: "London", rain: true, warn: false }], brief: { lat: 51.51, lon: -0.13, name: "London" }, briefAt: "06:15", email: { warn: false, brief: false } });
  const w = wantOf({ places: [{ ...london, warn: true }, { ...london, rain: true }, { ...leeds }], brief: null });
  assert.deepEqual(w.places.map((p) => [p.name, p.warn]), [["London", true]]);
  assert.throws(() => wantOf({ places: Array.from({ length: 13 }, (_, i) => ({ lat: i, lon: i, rain: true })) }), /12 places at most/);
  assert.throws(() => wantOf({ place: { lat: "x", lon: 0 }, rain: true }), /Bad place/);
});

test("the site's sign-in, as a cookie: the whole site's where the address is the site's, out of any page's reach", () => {
  const req = (url, cookie) => new Request(url, { headers: cookie ? { Cookie: cookie } : {} });
  const set = (url, env = {}) => withCookie(new Response("{}"), req(url), env, "t".repeat(43)).headers.get("Set-Cookie");
  assert.match(set("https://weather.georgefarrowgreen.com/api/weather/me"), /^__Secure-account=t{43}; Path=\/; Domain=georgefarrowgreen\.com; HttpOnly; SameSite=Lax; Secure; Max-Age=15552000$/);
  assert.match(set("https://chat.georgefarrowgreen.com/api/pigeon/login"), /Domain=georgefarrowgreen\.com/);
  // the site's own addresses: Secure whatever the request came over
  assert.match(set("http://weather.georgefarrowgreen.com/api/weather/me"), /^__Secure-account=.*; Secure; /);
  // a preview's address, or this machine's: that address alone, and without Secure over plain http
  assert.doesNotMatch(set("https://abc.georgefarrowgreen.pages.dev/api/weather/me"), /Domain=/);
  assert.match(set("http://localhost:8788/api/pigeon/login"), /^account=t{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age/);
  assert.match(set("http://weather.gfg.test:8788/api/weather/me", { ACCOUNT_SITE: "gfg.test" }), /Domain=gfg\.test/);
  assert.match(withoutSession(new Response("{}"), req("https://chat.georgefarrowgreen.com/"), {}).headers.get("Set-Cookie"), /^__Secure-account=; .*Max-Age=0$/);
  // read back: only its own name (the secure one over https), and only a token's characters
  assert.equal(cookieToken(req("https://weather.georgefarrowgreen.com/", `x=1; __Secure-account=${"a".repeat(43)}`), {}), "a".repeat(43));
  assert.equal(cookieToken(req("https://weather.georgefarrowgreen.com/", `account=${"a".repeat(43)}`), {}), null);
  assert.equal(cookieToken(req("https://weather.georgefarrowgreen.com/", `__Secure-account=bad"value`), {}), null);
});
