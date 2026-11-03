// InFlite Today's account side (functions/_today.js, functions/_todayapp.js), against a database of its own (Node's own
// SQLite in memory, standing in for D1, with the site's schema): Edit's cards made safe, the morning's settings checked,
// the zone it's sent in, the time it has when first turned on, the devices it goes to (ten at most, each with the
// sign-in that turned it on, moved only by its own account), the day claimed only once and given back only by its
// claim, who has it on for Weather and Fitness to skip theirs, a device named only by its hash; and the routes Today's
// server asks (every one only with Today's Origin, a change never straight from a browser, and none for a sign-in handed
// over that's the account's page's alone). The cards and the morning's words are their own tests' (todaycards,
// todaymorning).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { db, appKey, hex, sha256 } from "../../../functions/_pigeon.js";
import { makeHandback, takeHandback } from "../../../functions/_handback.js";
import { todayOrigin, todayLinks } from "../../../functions/_sites.js";
import * as T from "../../../functions/_today.js";
import { firstMorningAt } from "../../../functions/_todayapp.js";
import { cardsMemo } from "../../../functions/_todaycards.js";
import { wxdb } from "../../../functions/_wxpush.js";
import { setMorningFor } from "../../../functions/_fitpush.js";
import { onRequest } from "../../../functions/api/account/[[path]].js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => s.prepare(sql).get(...val(args)) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...val(args)), meta: {} }),
    run: async () => ({ meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
    now: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? { results: s.prepare(sql).all(...val(args)) } : { meta: { changes: Number(s.prepare(sql).run(...val(args)).changes) } }),
  });
  return { sql: s, prepare: (sql) => st(sql), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const env = { DB: d1(), APPS_SITE: "ifl.test", ACCOUNT_SITE: "gfg.test", ACCOUNT_HOST: "account.ifl.test", AUTH_HOST: "auth.ifl.test" };
const D = await db(env), t0 = Date.now(), ORIGIN = "http://ifl.test:8788";
const one = (q, ...a) => env.DB.sql.prepare(q).get(...a);
const all = (q, ...a) => env.DB.sql.prepare(q).all(...a);
// accounts, and their sign-ins: each with its cookie's token (the site's cookie carries one of its own: site_hash)
async function account(id, x = {}) {
  await D.prepare("INSERT INTO pg_users (id, handle, name, email, pub, salt, proof_hash, vault, swift, swift_at, created_at, notify_prefs) VALUES (?1, ?1, ?2, ?1 || '@example.com', '{}', 's', 'p', 'v', 3, ?3, ?3, ?4)")
    .bind(id, x.name || `${id[0].toUpperCase()}${id.slice(1)} Tester`, t0, x.notify_prefs ?? null).run();
}
async function signIn(user, hash, { handed = false } = {}) {
  const token = randomBytes(24).toString("base64url");
  await D.prepare("INSERT INTO pg_sessions (hash, user_id, created_at, seen_at, auth_at, site_hash, handed) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(hash, user, t0, t0, t0, hex(await sha256(token)), handed ? 1 : null).run();
  return `account=${token}`;
}
for (const id of ["ann", "bo", "cy", "di", "ed"]) await account(id);
await account("fay", { notify_prefs: JSON.stringify({ tz: "America/New_York", quiet: true }) });
const annC = await signIn("ann", "sAnn"), annC2 = await signIn("ann", "sAnn2"), boC = await signIn("bo", "sBo"), cyC = await signIn("cy", "sCy"), handedC = await signIn("di", "sDi", { handed: true });
await signIn("ed", "sEd");

// a device's subscription, as a browser makes one: a P-256 public key and a 16-byte secret
async function device(n, host = "fcm.googleapis.com") {
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { endpoint: `https://${host}/fcm/send/today-${n}`, keys: { p256dh: Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}
// a request to the account's address, as Today's server makes it (its Origin, the browser's cookie), through the
// account's router
async function call(method, path, { cookie, origin = ORIGIN, body, site, host = "account.ifl.test:8788", ip } = {}) {
  const url = `http://${host}/api/account/today/${path}`, data = body === undefined ? undefined : JSON.stringify(body);
  const request = new Request(url, { method, body: data, headers: { ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(site ? { "Sec-Fetch-Site": site } : {}),
    ...(ip ? { "CF-Connecting-IP": ip } : {}), ...(data ? { "Content-Type": "application/json" } : {}) } });
  const later = [], res = await onRequest({ request, env, params: { path: ["today", ...path.split("?")[0].split("/")] }, waitUntil: (p) => later.push(p) });
  await Promise.allSettled(later);
  const type = res.headers.get("Content-Type") || "";
  return { s: res.status, j: type.includes("json") ? await res.json() : null, set: res.headers.get("Set-Cookie") };
}
const err = (status, words) => (e) => e.status === status && (!words || e.message === words);

test("Today's requests are Today's own to the server (appKey), so a sign-in handed over for the account's page alone doesn't open it", () => {
  const key = (p) => appKey(new Request(`https://account.inflite.ai${p}`));
  assert.equal(key("/api/account/today/me"), "today");
  assert.equal(key("/api/account/today/cards"), "today");
  assert.equal(key("/api/account/me"), "account");
  assert.equal(key("/api/account/me/photo"), "account");
  assert.equal(key("/api/account/mail/me"), "mail");
  assert.equal(key("/api/account/todays"), "account", "only under today/");
  assert.equal(key("/api/account/today"), "account");
});

test("Today's address, and the apps' as it links to them", () => {
  const req = new Request("http://account.ifl.test:8788/api/account/today/me");
  assert.equal(todayOrigin({}, req), "https://inflite.ai");
  assert.equal(todayOrigin(env, req), ORIGIN);
  assert.deepEqual(todayLinks(env, req), { chat: "http://chat.ifl.test:8788", weather: "http://weather.ifl.test:8788", fitness: "http://fitness.ifl.test:8788",
    finance: "http://finance.ifl.test:8788", account: "http://account.ifl.test:8788", auth: "http://auth.ifl.test:8788" });
  assert.equal(todayLinks({}, null).auth, "https://auth.inflite.ai");
});

test("a hand-back's tries are counted under the network's address, or under a key of the app's own where it's given one", async () => {
  const word = () => { const w = randomBytes(32).toString("base64url"); return { w, ask: createHash("sha256").update(w).digest("base64url") }; };
  const ann = { id: "ann", sessionHash: "sAnn" }, req = new Request("http://account.ifl.test:8788/api/account/today/handback", { method: "POST", headers: { "CF-Connecting-IP": "10.9.8.7" } });
  let k = word(), { code } = await makeHandback(env, ann, { app: "today", ask: k.ask });
  const got = await takeHandback(env, req, "today", { code, verifier: k.w });
  assert.equal(got.u.id, "ann"); assert.equal(got.row.app, "today");
  assert.equal(one("SELECT count FROM pg_limits WHERE key = 'handback-ip:10.9.8.7'")?.count, 1, "without one: the address's");
  k = word(); ({ code } = await makeHandback(env, ann, { app: "today", ask: k.ask }));
  await takeHandback(env, req, "today", { code, verifier: k.w }, { limitKey: "handback-today", max: 600 });
  assert.equal(one("SELECT count FROM pg_limits WHERE key = 'handback-today'")?.count, 1, "with one: that key");
  assert.equal(one("SELECT count FROM pg_limits WHERE key = 'handback-ip:10.9.8.7'")?.count, 1, "and not the address's as well");
  // (a code made for Today opens nothing else, nor one for Mail Today; and each is good once)
  k = word(); ({ code } = await makeHandback(env, ann, { app: "today", ask: k.ask }));
  await assert.rejects(takeHandback(env, req, "mail", { code, verifier: k.w }), err(400));
  k = word(); ({ code } = await makeHandback(env, ann, { app: "mail", ask: k.ask }));
  await assert.rejects(takeHandback(env, req, "today", { code, verifier: k.w }), err(400));
  await assert.rejects(makeHandback(env, ann, { app: "home", ask: word().ask }), err(400), "\"home\" is the home page's word, never a hand-back's");
});

test("Edit's cards: unknown names left out, missing ones added at the end, hidden only of the four; a bad body refused", async () => {
  assert.deepEqual((await T.todayPrefs(env, "bo")).cards, { order: ["weather", "chat", "fitness", "markets"], hidden: [] }, "none kept: the usual order");
  assert.equal((await T.todayPrefs(env, "bo")).updated, null);
  let r = await T.savePrefs(env, "bo", { order: ["markets", "nope", "weather", "markets"], hidden: ["chat", "x", "chat"] });
  assert.deepEqual(r.cards, { order: ["markets", "weather", "chat", "fitness"], hidden: ["chat"] });
  r = await T.savePrefs(env, "bo", { hidden: [] });
  assert.deepEqual(r.cards, { order: ["markets", "weather", "chat", "fitness"], hidden: [] }, "the order as it was, when only hidden is sent");
  r = await T.savePrefs(env, "bo", { order: ["fitness"] });
  assert.deepEqual(r.cards.order, ["fitness", "weather", "chat", "markets"]);
  for (const bad of [{ order: "weather" }, { order: [1] }, { hidden: {} }, { hidden: Array(21).fill("chat") }, { order: null }])
    await assert.rejects(T.savePrefs(env, "bo", bad), err(400, "Bad request."), JSON.stringify(bad));
  // (a row someone's tampered with: read as the four, in a sane order)
  await D.prepare("UPDATE td_prefs SET cards = '{\"order\":[\"x\",\"chat\"],\"hidden\":\"all\"}' WHERE user_id = 'bo'").run();
  assert.deepEqual((await T.todayPrefs(env, "bo")).cards, { order: ["chat", "weather", "fitness", "markets"], hidden: [] });
  await D.prepare("UPDATE td_prefs SET cards = 'not json' WHERE user_id = 'bo'").run();
  assert.deepEqual((await T.todayPrefs(env, "bo")).cards, { order: ["weather", "chat", "fitness", "markets"], hidden: [] });
});

test("the morning's settings: a time on the five minutes, on and lines as true or false, a zone only if the clocks know it", async () => {
  for (const at of [421, 1440, -5, "420", 7.5, null]) await assert.rejects(T.saveMorning(env, "cy", { at }), err(400, "Choose a time."), String(at));
  for (const b of [{ on: "yes" }, { on: 1 }, { lines: { chat: "no" } }, { lines: [] }, { lines: null }, { lines: "chat" }])
    await assert.rejects(T.saveMorning(env, "cy", b), err(400, "Choose on or off."), JSON.stringify(b));
  assert.equal(one("SELECT COUNT(*) AS n FROM td_prefs WHERE user_id = 'cy'").n, 0, "nothing kept from a refused change");
  let r = await T.saveMorning(env, "cy", { on: true, at: 1435, tz: "Not/AZone" });
  assert.equal(r.m_on, 1); assert.equal(r.m_at, 1435); assert.equal(r.m_tz, null, "a zone the clocks don't know: left out");
  r = await T.saveMorning(env, "cy", { tz: "Asia/Tokyo" });
  assert.equal(r.m_tz, "Asia/Tokyo"); assert.equal(r.m_on, 1); assert.equal(r.m_at, 1435, "the rest as it was");
  r = await T.saveMorning(env, "cy", { tz: "A".repeat(70) });
  assert.equal(r.m_tz, "Asia/Tokyo", "too long: left out");
  r = await T.saveMorning(env, "cy", { lines: { chat: false } });
  r = await T.saveMorning(env, "cy", { lines: { weather: false, nonsense: false } });
  assert.deepEqual(r.m_lines, { weather: false, chat: false });
  r = await T.saveMorning(env, "cy", { lines: { chat: true } });
  assert.deepEqual(r.m_lines, { weather: false }, "a line turned on is one not there");
  assert.equal(one("SELECT m_lines FROM td_prefs WHERE user_id = 'cy'").m_lines, '{"weather":false}');
  r = await T.saveMorning(env, "cy", { on: false, at: 0 });
  assert.equal(r.m_on, 0); assert.equal(r.m_at, 0);
});

test("the morning's zone: the account's own Quiet Hours zone as stored (not Chat's default), else the page's, else London's", () => {
  const row = { m_tz: "Asia/Tokyo" };
  assert.equal(T.morningTz({ id: "x", notify_prefs: JSON.stringify({ tz: "America/New_York" }) }, row), "America/New_York");
  assert.equal(T.morningTz({ id: "x", notify_prefs: JSON.stringify({ quiet: true }) }, row), "Asia/Tokyo", "no zone stored: not the UTC Chat's preferences fill in");
  assert.equal(T.morningTz({ id: "x", notify_prefs: null }, row), "Asia/Tokyo");
  assert.equal(T.morningTz({ id: "x", notify_prefs: "{oops" }, row), "Asia/Tokyo");
  assert.equal(T.morningTz({ id: "x", notify_prefs: JSON.stringify({ tz: "Mars/Olympus" }) }, row), "Asia/Tokyo", "one the clocks don't know: passed over");
  assert.equal(T.morningTz({ id: "x", notify_prefs: JSON.stringify({ tz: "UTC" }) }, row), "UTC", "UTC chosen and stored: kept");
  assert.equal(T.morningTz({ id: "x", notify_prefs: "{}" }, { m_tz: null }), "Europe/London");
  assert.equal(T.morningTz({ id: "x" }, { m_tz: "Nowhere/Land" }), "Europe/London");
});

test("turned on for the first time, at Weather's briefing time, else Fitness's reminder's, else 07:00; after that, as chosen", async () => {
  const W = await wxdb(env), weather = (id, notify) => W.prepare("INSERT OR REPLACE INTO wx_accts (user_id, data, ver, updated) VALUES (?, ?, 1, ?)").bind(id, JSON.stringify({ places: [], settings: {}, notify }), t0).run();
  assert.equal(await firstMorningAt(env, { id: "ed" }), 420, "nothing set anywhere: 07:00");
  await weather("ed", { places: [], brief: null, briefAt: "06:15" });
  await setMorningFor(env, "ed", { on: true, at: 392 });
  assert.equal(await firstMorningAt(env, { id: "ed" }), 390, "the briefing's off: Fitness's reminder, on the five minutes");
  await weather("ed", { places: [], brief: { name: "London", lat: 51.5, lon: -0.12 }, briefAt: "06:47" });
  assert.equal(await firstMorningAt(env, { id: "ed" }), 405, "the briefing's on: its time, on the five minutes");
  await weather("ed", { places: [], brief: { name: "London", lat: 51.5, lon: -0.12 }, briefAt: "06:30" });
  assert.equal(await firstMorningAt(env, { id: "ed" }), 390);
  // (and Today's own route: the first turn-on takes it; a time chosen since is kept when it's turned on again)
  const edC = await signIn("ed", "sEd2");
  cardsMemo.set("ed", { at: Date.now(), tz: "Europe/London", cards: {} });
  await T.savePrefs(env, "ed", { hidden: ["markets"] });
  let r = await call("PUT", "morning", { cookie: edC, body: { on: true, tz: "Europe/London" } });
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.equal(r.j.on, true); assert.equal(r.j.at, 390, "a row Edit made doesn't count as turned on before");
  r = await call("PUT", "morning", { cookie: edC, body: { at: 600, tz: "Europe/London" } });
  r = await call("PUT", "morning", { cookie: edC, body: { on: false, tz: "Europe/London" } });
  r = await call("PUT", "morning", { cookie: edC, body: { on: true, tz: "Europe/London" } });
  assert.equal(r.j.at, 600);
  r = await call("PUT", "morning", { cookie: edC, body: { on: true, at: 427 } });
  assert.equal(r.s, 400); assert.equal(r.j.error, "Choose a time.");
});

test("devices: ten an account (the oldest goes), each with the sign-in that turned it on; moved and taken off only by its own account", async () => {
  const ann = { id: "ann", sessionHash: "sAnn" }, subs = [];
  for (let i = 0; i < 11; i++) {
    subs.push(await device(i));
    const r = await T.addDevice(env, ann, subs[i]);
    assert.deepEqual(r, { ok: true, devices: Math.min(i + 1, 10) });
    await new Promise((ok) => setTimeout(ok, 2));
  }
  const kept = (await T.todayDevices(env, "ann")).map((d) => d.endpoint);
  assert.equal(kept.length, 10); assert.ok(!kept.includes(subs[0].endpoint), "the oldest went"); assert.ok(kept.includes(subs[10].endpoint));
  for (const bad of [null, {}, { ...subs[1], endpoint: "https://evil.example/push" }, { ...subs[1], endpoint: "http://fcm.googleapis.com/x" }, { endpoint: subs[1].endpoint, keys: { p256dh: "AAAA", auth: subs[1].keys.auth } },
    { endpoint: subs[1].endpoint, keys: { p256dh: subs[1].keys.p256dh, auth: "short" } }])
    await assert.rejects(T.addDevice(env, ann, bad), err(400, "That isn’t a push subscription this server can send to."));
  // moved: only this account's, and only to an endpoint no one has
  const fresh = await device("new");
  assert.deepEqual(await T.moveDevice(env, { id: "bo", sessionHash: "sBo" }, { sub: fresh, was: subs[5].endpoint }), { moved: false }, "another account's: not moved");
  assert.deepEqual(await T.moveDevice(env, ann, { sub: { ...fresh, endpoint: subs[6].endpoint }, was: subs[5].endpoint }), { moved: false }, "to one that's taken: not moved");
  assert.deepEqual(await T.moveDevice(env, ann, { sub: fresh, was: subs[5].endpoint }), { moved: true });
  assert.ok(one("SELECT 1 AS y FROM td_push WHERE endpoint = ? AND user_id = 'ann' AND session = 'sAnn'", fresh.endpoint));
  await assert.rejects(T.moveDevice(env, ann, { sub: fresh, was: "" }), err(400));
  // taken off: only by its own account
  assert.equal((await T.removeDevice(env, "bo", subs[6].endpoint)).devices, 0);
  assert.ok(one("SELECT 1 AS y FROM td_push WHERE endpoint = ?", subs[6].endpoint), "bo can't take ann's off");
  assert.deepEqual(await T.removeDevice(env, "ann", subs[6].endpoint), { ok: true, devices: 9 });
  await assert.rejects(T.removeDevice(env, "ann", 42), err(400));
  // a sign-in gone: its devices aren't sent to, and the tick's tidy forgets them
  await T.addDevice(env, { id: "ann", sessionHash: "sAnn2" }, await device("second-sign-in"));
  assert.equal((await T.todayDevices(env, "ann")).length, 10);
  await D.prepare("DELETE FROM pg_sessions WHERE hash = 'sAnn2'").run();
  assert.equal((await T.todayDevices(env, "ann")).length, 9);
  assert.equal(await T.tidyDevices(env), 1);
  assert.equal(one("SELECT COUNT(*) AS n FROM td_push WHERE user_id = 'ann'").n, 9);
});

test("a device that's someone else's now (the same browser, another account or sign-in) moves to them, its failures forgotten", async () => {
  const sub = await device("shared");
  await T.addDevice(env, { id: "bo", sessionHash: "sBo" }, sub);
  await D.prepare("UPDATE td_push SET fails = 3, ok_at = 5 WHERE endpoint = ?").bind(sub.endpoint).run();
  const other = await device("x");
  await T.addDevice(env, { id: "cy", sessionHash: "sCy" }, { endpoint: sub.endpoint, keys: other.keys });
  assert.deepEqual({ ...one("SELECT user_id, session, fails, ok_at, p256dh FROM td_push WHERE endpoint = ?", sub.endpoint) }, { user_id: "cy", session: "sCy", fails: 0, ok_at: null, p256dh: other.keys.p256dh });
  assert.equal((await T.todayDevices(env, "bo")).length, 0);
  // failures: five in a row drop it; one that's taken in between starts them again
  for (let i = 0; i < 4; i++) assert.equal(await T.deviceFailed(env, sub.endpoint), false);
  await T.deviceOk(env, sub.endpoint);
  assert.equal(one("SELECT fails FROM td_push WHERE endpoint = ?", sub.endpoint).fails, 0);
  for (let i = 0; i < 4; i++) assert.equal(await T.deviceFailed(env, sub.endpoint), false);
  assert.equal(await T.deviceFailed(env, sub.endpoint), true, "the fifth");
  assert.equal(one("SELECT COUNT(*) AS n FROM td_push WHERE endpoint = ?", sub.endpoint).n, 0);
  await T.addDevice(env, { id: "cy", sessionHash: "sCy" }, sub);
  await T.deviceGone(env, sub.endpoint);
  assert.equal(one("SELECT COUNT(*) AS n FROM td_push WHERE endpoint = ?", sub.endpoint).n, 0);
});

test("the day's claim: made only against the day it had (was); given back only where it's still that claim's", async () => {
  await T.saveMorning(env, "fay", { on: true, at: 420 });
  assert.equal(await T.claimMorning(env, "fay", "2026-11-02", null), true);
  assert.equal(await T.claimMorning(env, "fay", "2026-11-02", null), false, "a second tick with the row as it was: no");
  assert.equal(await T.claimMorning(env, "fay", "2026-11-03", "2026-11-01"), false, "against a day it didn't have: no");
  assert.equal(await T.claimMorning(env, "fay", "2026-11-03", "2026-11-02"), true);
  await T.releaseMorning(env, "fay", "2026-11-04", "2026-11-02");
  assert.equal((await T.todayPrefs(env, "fay")).m_sent, "2026-11-03", "not its day: untouched");
  await T.releaseMorning(env, "fay", "2026-11-03", "2026-11-02");
  assert.equal((await T.todayPrefs(env, "fay")).m_sent, "2026-11-02", "given back as it was");
  await T.releaseMorning(env, "fay", "2026-11-02", null);
  assert.equal((await T.todayPrefs(env, "fay")).m_sent, null);
  await T.keepLast(env, "fay", { title: "London · 14° / 7°", lines: ["Dry.", "Rest day"], out: ["Markets"], at: 1793602920000 });
  assert.deepEqual((await T.todayPrefs(env, "fay")).m_last, { title: "London · 14° / 7°", lines: ["Dry.", "Rest day"], out: ["Markets"], at: 1793602920000 });
});

test("who has Today's morning (for Weather and Fitness to skip theirs): on, with a device of a sign-in that still lasts", async () => {
  await account("gus"); await signIn("gus", "sGus");
  await T.saveMorning(env, "gus", { on: true });
  assert.ok(!(await T.morningUsers(env)).has("gus"), "on in Account, with no device: Weather's and Fitness's still come");
  assert.ok(!(await T.morningCandidates(env)).some((c) => c.u.id === "gus"));
  const sub = await device("gus");
  await T.addDevice(env, { id: "gus", sessionHash: "sGus" }, sub);
  assert.ok((await T.morningUsers(env)).has("gus"));
  const c = (await T.morningCandidates(env)).find((x) => x.u.id === "gus");
  assert.deepEqual(Object.keys(c.u).sort(), ["id", "notify_prefs", "pigeons"]);
  assert.deepEqual(Object.keys(c.row).sort(), ["cards", "m_at", "m_last", "m_lines", "m_on", "m_sent", "m_tz", "updated"]);
  await T.saveMorning(env, "gus", { on: false });
  assert.ok(!(await T.morningUsers(env)).has("gus"), "off");
  await T.saveMorning(env, "gus", { on: true });
  await D.prepare("UPDATE pg_users SET delete_at = ? WHERE id = 'gus'").bind(t0 + 7 * 864e5).run();
  assert.ok(!(await T.morningCandidates(env)).some((x) => x.u.id === "gus"), "being deleted: not sent");
  await D.prepare("UPDATE pg_users SET delete_at = NULL WHERE id = 'gus'").run();
  await D.prepare("DELETE FROM pg_sessions WHERE hash = 'sGus'").run();
  assert.ok(!(await T.morningUsers(env)).has("gus"), "its sign-in gone");
});

test("a device is named by its hash alone (the first 16 of its SHA-256, b64url), and the Morning section knows this one by it", async () => {
  const ep = "https://fcm.googleapis.com/fcm/send/today-hash";
  assert.equal(await T.deviceHash(ep), createHash("sha256").update(ep).digest("base64url").slice(0, 16));
  assert.match(await T.deviceHash(ep), /^[A-Za-z0-9_-]{16}$/);
  const sub = await device("mine");
  await T.addDevice(env, { id: "bo", sessionHash: "sBo" }, sub);
  cardsMemo.set("bo", { at: Date.now(), tz: "Europe/London", cards: {} });
  let r = await call("GET", `morning?device=${await T.deviceHash(sub.endpoint)}`, { cookie: boC });
  assert.equal(r.s, 200, JSON.stringify(r.j));
  assert.equal(r.j.thisDevice, true); assert.equal(r.j.devices, 1);
  r = await call("GET", `morning?device=${await T.deviceHash(ep)}`, { cookie: boC });
  assert.equal(r.j.thisDevice, false, "another device's");
  r = await call("GET", "morning", { cookie: boC });
  assert.equal(r.j.thisDevice, null, "none said");
  r = await call("GET", `morning?device=${encodeURIComponent(sub.endpoint)}`, { cookie: boC });
  assert.equal(r.j.thisDevice, null, "an address in its place: not a device's name");
  // the view's shape, as morning.json has it
  const want = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../mocks/today/morning.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(r.j).sort(), Object.keys(want).sort());
  assert.deepEqual(Object.keys(r.j.lines), Object.keys(want.lines));
  assert.deepEqual(Object.keys(r.j.replaces).sort(), Object.keys(want.replaces).sort());
  assert.equal(typeof r.j.names, "boolean"); assert.equal(typeof r.j.sentToday, "boolean"); assert.equal(r.j.tz, "Europe/London");
});

test("every route only with Today's Origin; a change never straight from a browser; a handed-over sign-in signed out", async () => {
  let r = await call("GET", "me", { origin: null });
  assert.equal(r.s, 403); assert.equal(r.j.error, "That request didn’t come from Today.");
  r = await call("GET", "me", { origin: "http://chat.ifl.test:8788" });
  assert.equal(r.s, 403);
  r = await call("GET", "me", { origin: "http://account.ifl.test:8788", cookie: annC });
  assert.equal(r.s, 403, "not even the account's own page");
  r = await call("GET", "me");
  assert.deepEqual(r.j, { signedIn: false, links: todayLinks(env, new Request("http://account.ifl.test:8788/")) });
  r = await call("GET", "me", { cookie: annC });
  assert.equal(r.s, 200); assert.equal(r.j.signedIn, true);
  assert.deepEqual(r.j.user, { id: "ann", name: "Ann Tester", first: "Ann", handle: "ann", photoAt: null, appearance: "auto" });
  assert.deepEqual(r.j.prefs, { order: ["weather", "chat", "fitness", "markets"], hidden: [] });
  assert.deepEqual(r.j.morning, { on: false, at: 420, devices: 9 });
  assert.equal(r.j.links.auth, "http://auth.ifl.test:8788");
  assert.match(r.set || "", /^account=[A-Za-z0-9_-]+; Path=\/; Domain=ifl\.test; HttpOnly; SameSite=Lax; Max-Age=\d+$/, "the cookie renewed");
  assert.equal(one("SELECT apps FROM pg_sessions WHERE hash = 'sAnn'").apps.split(",").includes("today"), true, "the sign-in knows it's Today's");
  // (a sign-in handed over from an app to a browser signed in to nothing: the account's page's alone)
  r = await call("GET", "me", { cookie: handedC });
  assert.deepEqual(r.j.signedIn, false);
  for (const [m, p, body] of [["GET", "cards"], ["GET", "morning"], ["PUT", "prefs", { hidden: [] }], ["PUT", "morning", { on: true }], ["POST", "push", { sub: await device("h") }],
    ["POST", "push-move", { sub: await device("h2"), was: "x" }], ["DELETE", "push", { endpoint: "x" }], ["POST", "morning/try", { endpoint: "x" }], ["POST", "account-link", {}], ["GET", "avatar?id=di"]]) {
    r = await call(m, p, { cookie: handedC, body });
    assert.equal(r.s, 401, `${m} ${p}: ${r.s} ${JSON.stringify(r.j)}`); assert.equal(r.j.field, "session");
    r = await call(m, p, { cookie: annC, body, origin: "https://evil.example" });
    assert.equal(r.s, 403, `${m} ${p} from elsewhere`);
  }
  // a change from a browser asking here straight (it says it's from another address): refused, even with Today's Origin
  for (const site of ["same-site", "cross-site", "none"]) {
    r = await call("PUT", "prefs", { cookie: annC, body: { hidden: ["chat"] }, site });
    assert.equal(r.s, 403, site);
  }
  r = await call("PUT", "prefs", { cookie: annC, body: { hidden: ["chat"] } });
  assert.deepEqual(r.j, { prefs: { order: ["weather", "chat", "fitness", "markets"], hidden: ["chat"] } }, "from Today's server");
  r = await call("PUT", "prefs", { cookie: annC, body: { order: "nope" } });
  assert.equal(r.s, 400); assert.equal(r.j.error, "Bad request.");
  // (only at the account's address: not the sign-in page's)
  r = await call("GET", "me", { cookie: annC, host: "auth.ifl.test:8788" });
  assert.equal(r.s, 404);
  r = await call("GET", "push-key");
  assert.match(r.j.key, /^[A-Za-z0-9_-]{80,90}$/, "the site's one push key, for a device to subscribe with");
});

test("the push routes, try, and signing out: a sign-in's devices go with it", async () => {
  const sub = await device("cy-phone");
  let r = await call("POST", "push", { cookie: cyC, body: { sub } });
  assert.deepEqual(r.j, { ok: true, devices: 1 });
  r = await call("POST", "push", { cookie: cyC, body: { sub: { ...sub, endpoint: "https://evil.example/p" } } });
  assert.equal(r.s, 400);
  r = await call("POST", "morning/try", { cookie: cyC, body: { endpoint: "https://fcm.googleapis.com/fcm/send/not-mine" } });
  assert.equal(r.s, 400); assert.equal(r.j.error, "Turn the morning notification on on this device first.");
  const moved = await device("cy-phone-2");
  r = await call("POST", "push-move", { cookie: cyC, body: { sub: moved, was: sub.endpoint } });
  assert.deepEqual(r.j, { moved: true });
  r = await call("DELETE", "push", { cookie: cyC, body: { endpoint: moved.endpoint } });
  assert.deepEqual(r.j, { ok: true, devices: 0 });
  await call("POST", "push", { cookie: cyC, body: { sub } });
  r = await call("POST", "account-link", { cookie: cyC, body: {} });
  assert.match(r.j.code, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(one("SELECT 1 AS y FROM pg_handoff WHERE user_id = 'cy' AND session = 'sCy'"));
  r = await call("POST", "signout", { cookie: cyC, body: {}, site: "cross-site" });
  assert.equal(r.s, 403);
  r = await call("POST", "signout", { cookie: cyC, body: {} });
  assert.equal(r.s, 200); assert.match(r.set || "", /Max-Age=0/);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_sessions WHERE hash = 'sCy'").n, 0);
  assert.equal(one("SELECT COUNT(*) AS n FROM td_push WHERE session = 'sCy'").n, 0, "and its devices");
  r = await call("GET", "me", { cookie: cyC });
  assert.equal(r.j.signedIn, false);
});

test("the account's data has Today's, and the account going takes it", async () => {
  await T.savePrefs(env, "fay", { order: ["chat", "weather"], hidden: ["markets"] });
  await T.saveMorning(env, "fay", { on: true, at: 405, lines: { markets: false } });
  await T.claimMorning(env, "fay", "2026-11-02", null);
  const x = await T.todayExport(env, "fay");
  assert.deepEqual(x, { cards: { order: ["chat", "weather", "fitness", "markets"], hidden: ["markets"] },
    morning: { on: true, at: "06:45", timeZone: "America/New_York", lines: { weather: true, chat: true, fitness: true, markets: false }, lastSent: "2026-11-02" }, devices: 0,
    acts: [], rules: [], planned: [], times: [] }, "Today First's too (what Today did, its rules, the days it planned, times agreed in Chat): none yet");
  await T.addDevice(env, { id: "fay", sessionHash: "sFay" }, await device("fay"));
  await T.dropToday(env, "fay");
  assert.equal(one("SELECT COUNT(*) AS n FROM td_prefs WHERE user_id = 'fay'").n, 0);
  assert.equal(one("SELECT COUNT(*) AS n FROM td_push WHERE user_id = 'fay'").n, 0);
  await T.dropToday({}, "fay");
});

// ---- Today First's routes (spec §6.1): each refused from anywhere but Today's own page, a change never straight from a
// browser, signed out 401, and their answers; the session view's quiet hours, Mail and the hub's push; and the moment
// set by X-Today-At only where the server's TODAY_TEST_AT is "1" ----
const W = { site: "same-origin" };
const UUID0 = "00000000-0000-4000-8000-000000000000";

test("Today First's ten routes: another Origin 403, straight from a browser 403, signed out 401, a handed-over sign-in 401", async () => {
  await account("tfgus");
  const gus = await signIn("tfgus", "sTfGus");
  const writes = [["POST", "act", { id: UUID0 }], ["POST", "act/undo", { id: UUID0 }], ["PUT", "rules", { rule: "moveRide", level: "do" }], ["PATCH", "notify", { quiet: { on: false } }],
    ["POST", "device", { sub: await device("tfgus") }], ["DELETE", "device", { endpoint: "x" }], ["DELETE", "devices", { id: "x" }]];
  const reads = [["GET", "rules"], ["GET", "notify"], ["GET", "devices?device=AbCdEfGhIjKlMnOp"]];
  for (const [m, p, body] of [...writes, ...reads]) {
    let r = await call(m, p, { cookie: gus, body, origin: "https://evil.example", ...W });
    assert.equal(r.s, 403, `${m} ${p}: another Origin`); assert.equal(r.j.error, "That request didn’t come from Today.");
    r = await call(m, p, { cookie: gus, body, origin: "http://account.ifl.test:8788", ...W });
    assert.equal(r.s, 403, `${m} ${p}: the account's page isn't Today`);
    r = await call(m, p, { cookie: gus, body, origin: null, ...W });
    assert.equal(r.s, 403, `${m} ${p}: no Origin`);
    r = await call(m, p, { body, ...W });
    assert.equal(r.s, 401, `${m} ${p}: signed out`);
    r = await call(m, p, { cookie: handedC, body, ...W });
    assert.equal(r.s, 401, `${m} ${p}: a sign-in handed over for the account's page alone`);
  }
  for (const [m, p, body] of writes) for (const site of ["cross-site", "same-site", "none"]) {
    const r = await call(m, p, { cookie: gus, body, site });
    assert.equal(r.s, 403, `${m} ${p}: straight from a browser (${site})`);
  }
});

test("Today First's routes signed in: acts by their id (a bad one 400, none 404), the rules, notifications; devices reach their module", async () => {
  await account("tfhal");
  const hal = await signIn("tfhal", "sTfHal");
  for (const p of ["act", "act/undo"]) {
    let r = await call("POST", p, { cookie: hal, body: { id: "x" }, ...W });
    assert.equal(r.s, 400, p); assert.equal(r.j.error, "Bad request.");
    r = await call("POST", p, { cookie: hal, body: { id: UUID0 }, ...W });
    assert.equal(r.s, 404, p); assert.equal(r.j.error, "Not found.");
  }
  let r = await call("GET", "rules", { cookie: hal });
  assert.equal(r.s, 200);
  assert.deepEqual(r.j.rules.map((x) => [x.rule, x.level, x.setBy, !!x.soon]), [["moveRide", "do", "auto", false], ["addRide", "do", "auto", false], ["holdRide", "do", "auto", false], ["later", "do", "auto", true], ["arrange", "do", "auto", true]]);
  r = await call("PUT", "rules", { cookie: hal, body: { rule: "holdRide", level: "suggest" }, ...W });
  assert.deepEqual(r.j, { rule: "holdRide", level: "suggest", setBy: "you", line: "Held 0" });
  r = await call("PUT", "rules", { cookie: hal, body: { rule: "holdRide", level: "loud" }, ...W });
  assert.equal(r.s, 400); assert.equal(r.j.error, "Choose Do, Suggest or Quiet.");
  r = await call("GET", "notify", { cookie: hal });
  assert.equal(r.s, 200); assert.deepEqual(r.j.quiet, { on: false, from: 22, to: 7, tz: "UTC" });
  r = await call("PATCH", "notify", { cookie: hal, body: { quiet: { on: true, from: 21, to: 6 } }, ...W });
  assert.equal(r.s, 200); assert.deepEqual([r.j.quiet.on, r.j.quiet.from, r.j.quiet.to], [true, 21, 6]);
  r = await call("GET", "me", { cookie: hal });
  assert.deepEqual(r.j.quiet, { on: true, from: 21, to: 6 }, "the session view says the same");
  // (the devices' answers are their own module's, functions/_devices.js, which devices.test.mjs checks; here, only that
  // each gets past every guard to it: B0's stub's 501 "Not built yet.", or the module's own answer, never a guard's 401
  // or 403, and a 404 only as the module's "Not found.")
  for (const [m, p, body] of [["POST", "device", { sub: await device("tfhal") }], ["DELETE", "device", { endpoint: "x" }], ["DELETE", "devices", { id: "x" }], ["GET", "devices?device=AbCdEfGhIjKlMnOp"]]) {
    r = await call(m, p, { cookie: hal, body, ...W });
    const reached = r.s === 501 ? r.j?.error === "Not built yet." : ![401, 403].includes(r.s) && (r.s !== 404 || r.j?.error === "Not found.");
    assert.ok(reached, `${m} ${p}: ${r.s} ${JSON.stringify(r.j)}`);
  }
});

test("the session view: quiet hours as the account has them, Mail for the site's admin alone (and not when that can't be told), the hub's push", async () => {
  await account("tfivy", { notify_prefs: JSON.stringify({ quiet: true, quietFrom: 21, quietTo: 6, tz: "Europe/London" }) });
  await account("tfjo");
  const ivy = await signIn("tfivy", "sTfIvy"), jo = await signIn("tfjo", "sTfJo");
  let r = await call("GET", "me", { cookie: jo });
  assert.deepEqual({ quiet: r.j.quiet, apps: r.j.apps, hubPush: r.j.hubPush }, { quiet: { on: false, from: 22, to: 7 }, apps: { mail: false }, hubPush: false });
  r = await call("GET", "me", { cookie: ivy });
  assert.deepEqual(r.j.quiet, { on: true, from: 21, to: 6 });
  env.HUB_PUSH = "1";
  try { assert.equal((await call("GET", "me", { cookie: jo })).j.hubPush, true); env.HUB_PUSH = "true"; assert.equal((await call("GET", "me", { cookie: jo })).j.hubPush, false, "only \"1\""); }
  finally { delete env.HUB_PUSH; }
  await D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', 'tfivy')").run();
  try {
    assert.deepEqual((await call("GET", "me", { cookie: ivy })).j.apps, { mail: true }, "the admin");
    assert.deepEqual((await call("GET", "me", { cookie: jo })).j.apps, { mail: false }, "anyone else");
    // (who the admin is can't be told just now: no Mail, and the view all the same)
    env.DB.sql.exec("ALTER TABLE pg_passkeys RENAME TO pg_passkeys_away");
    try { r = await call("GET", "me", { cookie: ivy }); assert.equal(r.s, 200); assert.deepEqual(r.j.apps, { mail: false }); }
    finally { env.DB.sql.exec("ALTER TABLE pg_passkeys_away RENAME TO pg_passkeys"); }
  } finally { await D.prepare("DELETE FROM pg_meta WHERE k = 'admin_user'").run(); }
});

test("X-Today-At sets the moment only where TODAY_TEST_AT is \"1\" and it's 13 digits, for the whole day and for only=", async () => {
  await account("tfkit");
  const kit = await signIn("tfkit", "sTfKit"), AT = 1793602800000;
  const at = async (path, header, on) => {
    if (on === undefined) delete env.TODAY_TEST_AT; else env.TODAY_TEST_AT = on;
    try {
      const request = new Request(`http://account.ifl.test:8788/api/account/today/${path}`, { headers: { Origin: ORIGIN, Cookie: kit, "X-Today-At": header } });
      const res = await onRequest({ request, env, params: { path: ["today", ...path.split("?")[0].split("/")] }, waitUntil: () => {} });
      return (await res.json()).at;
    } finally { delete env.TODAY_TEST_AT; }
  };
  const near = (x) => Number.isFinite(x) && Math.abs(x - Date.now()) < 60e3;
  assert.ok(near(await at("cards?v=2", String(AT))), "ignored without TODAY_TEST_AT");
  assert.ok(near(await at("cards?v=2", String(AT), "true")), "ignored unless it's \"1\"");
  assert.ok(near(await at("cards?v=2", "1793602800", "1")), "ignored unless it's 13 digits");
  assert.ok(near(await at("cards?v=2", `${AT}x`, "1")));
  assert.equal(await at("cards?v=2", String(AT), "1"), AT);
  assert.equal(await at("cards", String(AT), "1"), AT, "without v=2 too");
  assert.equal(await at("cards?only=weather", String(AT), "1"), AT, "and for only=");
  assert.ok(near(await at("cards?only=weather", String(AT))), "only= ignores it without TODAY_TEST_AT");
});
