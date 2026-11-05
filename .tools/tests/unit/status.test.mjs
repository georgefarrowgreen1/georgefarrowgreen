// status.inflite.ai (functions/_status.js): the ticker's report kept (each address's check, from outside, and from
// inside over the direct links where the outside couldn't tell), a day's bar from its counts, an incident opened by two
// failed checks in a row (what fails together in one) and closed by two fine ones, the page's summary, the open row's
// 24 hours; the report taken only at the workers.dev address with the jobs' key, the page's answers only at its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { keepReport, summary, dayOfChecks, dayState, lastDays, dayOf, statusRoute, isStatus, adminIncidents, openIncidents, noteIncident, NOTE_KINDS, startIncident, planMaint, cancelMaint, adminMaint, burstCheck, bannerFor, alertPrefs, setAlertPrefs, outsideSaw, statusHost } from "../../../functions/_status.js";
import { STATUS_SERVICES, STATUS_JOBS } from "../../../functions/_statuslist.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => { const p = s.prepare(sql); if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } }; const r = p.run(...val(args)); return { results: [], success: true, meta: { changes: Number(r.changes) } }; };
  const st = (sql, args = []) => ({ bind: (...a) => st(sql, a), first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args), raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)), now: () => exec(sql, args) });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
// (Today's and Mail's Workers over their links: answering, or not, as `up` says)
const up = { today: true, mail: true };
const link = (id, body) => ({ fetch: async () => (up[id] ? new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }) : new Response("no", { status: 503 })) });
const DB = d1(), TICK = "inflite-apps.example.workers.dev";
const env = { DB, STATUS_DEPS: "0", PIGEON_TICK_SECRET: "tick", TICK_HOST: TICK, TODAY_APP: link("today", { build: "1.58", min: null }), MAIL_APP: link("mail", { v: "9", build: "abc", app: "1.62" }),
  ASSETS: { fetch: async (r) => new Response(new URL(r.url).pathname === "/pigeon/app.js" ? 'const APP_VERSION = "1.79";' : 'const BUILD = "1.50";') } };
// (a morning after today's, whenever the tests run: the routes' own checks keep reports at the real time, and a report
// older than the last one kept isn't kept)
const T0 = (() => { const d = new Date(Date.now() + 864e5); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0); })();
// (a report: every address fine at 120 ms, but for `over`, and every job run)
const report = (over = {}, jobs = {}) => ({ checks: STATUS_SERVICES.map((s) => ({ id: s.id, s: "ok", ms: 120, ...(over[s.id] || {}) })), jobs: STATUS_JOBS.map((j) => ({ path: j.path, ok: jobs[j.id] ?? true, ms: 800 })) });

test("a day's bar: down for half an hour of checks or more, slow or briefly down, or fine; and the UK's days", () => {
  assert.equal(dayState(null), null);
  assert.deepEqual(dayState({ n: 288, slow: 0, down: 0 }), { s: "ok", up: 100 });
  assert.deepEqual(dayState({ n: 288, slow: 0, down: 2 }), { s: "warn", up: 99.31 });
  assert.equal(dayState({ n: 288, slow: 7, down: 0 }).s, "warn");
  assert.equal(dayState({ n: 288, slow: 0, down: 6 }).s, "down");
  assert.equal(dayState({ n: 2, slow: 0, down: 1 }).s, "down", "half its checks, early in a day");
  assert.equal(dayOf(Date.UTC(2026, 6, 1, 23, 30)), "2026-07-02", "an hour ahead in summer");
  const days = lastDays(Date.UTC(2026, 9, 26, 23, 30));
  assert.equal(days.length, 90); assert.equal(new Set(days).size, 90); assert.equal(days.at(-1), "2026-10-26");
});

test("a report kept: each address, its version, from outside or (where a bot check stood in the way) from inside; once", async () => {
  const r = await keepReport(env, report({ home: { s: "none", ms: 40, why: "bot check" }, mail: { s: "none" } }), T0);
  assert.equal(r.kept, true);
  assert.equal((await keepReport(env, report(), T0 + 20e3)).kept, false, "the same minute again: a retry, kept once");
  const s = await summary(env, T0 + 60e3);
  const by = Object.fromEntries(s.services.map((x) => [x.id, x]));
  assert.equal(s.at, T0);
  assert.equal(by.chat.s, "ok"); assert.equal(by.chat.ms, 120); assert.equal(by.chat.version, "1.79", "this Worker's own, from its files");
  assert.equal(by.today.version, "1.58"); assert.equal(by.weather.version, "1.50");
  assert.equal(by.mail.s, "ok", "the outside couldn't tell: the inside's word"); assert.equal(by.mail.version, "1.62");
  assert.equal(by.home.s, "none", "no way in from inside: not checked, never down");
  assert.equal(by.home.days.at(-1), null, "and not counted");
  assert.deepEqual(by.chat.days.at(-1), { s: "ok", up: 100 }); assert.equal(by.chat.days.length, 90); assert.equal(by.chat.up90, 100);
  assert.equal(s.jobs.length, STATUS_JOBS.length); assert.ok(s.jobs.every((j) => j.s === "ok" && j.at === T0));
  assert.deepEqual(s.incidents, []);
});

test("two failed checks in a row open an incident (what fails together, one), two fine ones close it", async () => {
  let t = T0 + 5 * 60e3;
  await keepReport(env, report({ chat: { s: "down", ms: null, why: "HTTP 502" } }), t);
  assert.equal((await summary(env, t)).incidents.length, 0, "once isn't enough");
  t += 5 * 60e3;
  // (and from inside: Today's Worker not answering over its link, though the outside saw nothing wrong)
  up.today = false;
  await keepReport(env, report({ chat: { s: "down", ms: null, why: "HTTP 502" } }, { notify: false }), t);
  let s = await summary(env, t);
  assert.equal(s.incidents.length, 1);
  assert.equal(s.incidents[0].title, "Chat not answering"); assert.equal(s.incidents[0].ended, null);
  assert.match(s.incidents[0].updates[0].w, /Chat isn’t answering: two checks in a row failed \(HTTP 502\)/);
  assert.equal(s.services.find((x) => x.id === "today").s, "down", "failing inside is failing");
  t += 5 * 60e3;
  await keepReport(env, report({ chat: { s: "down", ms: null } }, { notify: false }), t);
  s = await summary(env, t);
  assert.equal(s.incidents.length, 1, "Today and Chat notifications join it, within the quarter hour");
  assert.equal(s.incidents[0].title, "Today, Chat and Chat notifications not working");
  assert.deepEqual(s.incidents[0].svcs.sort(), ["chat", "notify", "today"]);
  assert.equal(s.jobs.find((j) => j.id === "notify").s, "down");
  up.today = true;
  for (let i = 0; i < 2; i++) { t += 5 * 60e3; await keepReport(env, report(), t); }
  s = await summary(env, t);
  assert.equal(s.incidents[0].ended, t); assert.equal(s.incidents[0].updates[0].k, "Resolved");
  const chat = s.services.find((x) => x.id === "chat");
  assert.equal(chat.days.at(-1).s, "down", "half its checks failed"); assert.equal(chat.up90, 50, "three of its six checks failed");
  // (the open row's 24 hours: each check, a gap where it was down)
  const d = await dayOfChecks(env, "chat", t);
  assert.equal(d.points.length, 6); assert.deepEqual(d.points[1].slice(1), ["down", null]); assert.deepEqual(d.points[0].slice(1), ["ok", 120]);
  await assert.rejects(dayOfChecks(env, "fitting", t), /Not found/);
});

test("the report only at the workers.dev address with the jobs' key; the page's answers only at status.inflite.ai", async () => {
  const call = async (method, url, body, auth) => statusRoute({ env, request: new Request(url, { method, body, headers: auth ? { Authorization: `Bearer ${auth}` } : {} }) }, new URL(url));
  const body = JSON.stringify(report());
  assert.equal(await call("POST", "https://chat.inflite.ai/api/status/report", body, "tick"), null, "not here: on to the app");
  assert.equal((await call("POST", `https://${TICK}/api/status/report`, body)).status, 401);
  assert.equal((await call("POST", `https://${TICK}/api/status/report`, body, "nope")).status, 401);
  const ok = await call("POST", `https://${TICK}/api/status/report`, body, "tick");
  assert.equal(ok.status, 200); assert.equal((await ok.json()).ok, true);
  assert.equal((await call("POST", `https://${TICK}/api/status/report`, "x".repeat(40000), "tick")).status, 413);
  assert.equal(await call("GET", "https://chat.inflite.ai/api/status"), null);
  assert.ok(isStatus(new URL("https://status.inflite.ai/"), {})); assert.ok(!isStatus(new URL("https://chat.inflite.ai/"), {}));
  const page = await call("GET", "https://status.inflite.ai/api/status");
  assert.equal(page.status, 200); assert.match(page.headers.get("Cache-Control"), /public, max-age=30/);
  const j = await page.json();
  assert.deepEqual(j.services.map((s) => s.id), STATUS_SERVICES.map((s) => s.id));
  assert.ok(!JSON.stringify(j).includes("fitting"), "Fit Studio isn't on it");
  assert.equal((await call("GET", "https://status.inflite.ai/api/status/day?svc=chat")).status, 200);
  assert.equal((await call("GET", "https://status.inflite.ai/api/status/day?svc=nope")).status, 404);
  assert.equal((await call("POST", "https://status.inflite.ai/api/status")).status, 404);
});

test("Admin's written update on an incident: on the status page at once; Resolved closes one still open", async () => {
  let t = T0 + 3 * 3600e3;
  for (let i = 0; i < 2; i++) { t += 5 * 60e3; await keepReport(env, report({ weather: { s: "down", ms: null } }), t); }
  const open = await openIncidents(env);
  assert.equal(open.length, 1); assert.equal(open[0].title, "Weather not answering");
  const list = await adminIncidents(env, t);
  assert.equal(list[0].id, open[0].id, "the open one first"); assert.ok(list.length >= 2, "and the one resolved before");
  await assert.rejects(noteIncident(env, { id: open[0].id, kind: "Shouting", text: "x" }, t), /Which kind/);
  await assert.rejects(noteIncident(env, { id: open[0].id, kind: "Update", text: "   " }, t), /Write what/);
  await assert.rejects(noteIncident(env, { id: open[0].id, kind: "Update", text: "x".repeat(601) }, t), /600/);
  await assert.rejects(noteIncident(env, { id: "nope", kind: "Update", text: "x" }, t), /isn’t there/);
  await noteIncident(env, { id: open[0].id, kind: "Identified", text: "  The radar   provider is down;\n we’re switching to the backup. " }, t + 1000);
  let s = await summary(env, t + 2000), inc = s.incidents.find((x) => x.id === open[0].id);
  assert.deepEqual(inc.updates[0], { at: t + 1000, k: "Identified", w: "The radar provider is down; we’re switching to the backup.", by: "owner" });
  assert.equal(inc.ended, null);
  await noteIncident(env, { id: open[0].id, kind: "Resolved", text: "Back on the main provider." }, t + 3000);
  s = await summary(env, t + 4000); inc = s.incidents.find((x) => x.id === open[0].id);
  assert.equal(inc.ended, t + 3000); assert.equal(inc.updates[0].k, "Resolved");
  assert.equal((await openIncidents(env)).length, 0);
  assert.deepEqual(NOTE_KINDS, ["Investigating", "Identified", "Update", "Monitoring", "Resolved"]);
});

test("each app's checks: it answers, the database and storage, its job; told when an incident opens and when it closes", async () => {
  let t = T0 + 6 * 3600e3;
  const r1 = await keepReport(env, report(), t);
  assert.equal(r1.told, 0);
  const s = await summary(env, t);
  const chat = s.services.find((x) => x.id === "chat");
  assert.deepEqual(chat.checks.map((c) => c.k), ["Answers", "Database and storage", "Chat notifications"]);
  assert.ok(chat.checks.every((c) => c.s === "ok"));
  assert.deepEqual(s.services.find((x) => x.id === "mail").checks.map((c) => c.k), ["Answers"], "Mail's data is its own Worker's");
  for (let i = 0; i < 2; i++) { t += 5 * 60e3; const r = await keepReport(env, report({ fitness: { s: "down", ms: null } }), t); if (i === 1) assert.equal(r.told, 1, "opened: told"); }
  for (let i = 0; i < 2; i++) { t += 5 * 60e3; const r = await keepReport(env, report(), t); if (i === 1) assert.equal(r.told, 1, "closed: told"); }
});

test("maintenance planned: on the page ahead, and while it's on, what it covers failing opens nothing and isn't counted", async () => {
  let t = T0 + 9 * 3600e3;
  await assert.rejects(planMaint(env, { title: "x", starts: t, ends: t + 60e3 }, t), /title/);
  await assert.rejects(planMaint(env, { title: "Upgrade", starts: t + 60e3, ends: t }, t), /start and end/);
  await assert.rejects(planMaint(env, { title: "Upgrade", starts: t, ends: t + 2 * 864e5 }, t), /a day/);
  const m = await planMaint(env, { title: "Database upgrade", text: "Chat may pause.", svcs: ["markets", "nope"], starts: t + 10 * 60e3, ends: t + 40 * 60e3 }, t);
  assert.deepEqual(m.svcs, ["markets"], "only what's known");
  assert.equal((await summary(env, t)).maint[0].title, "Database upgrade");
  assert.equal((await adminMaint(env, t)).length, 1);
  const before = (await summary(env, t)).services.find((x) => x.id === "markets").up90;
  for (let i = 0; i < 3; i++) { t += 10 * 60e3 + (i ? 0 : 1000); await keepReport(env, report({ markets: { s: "down", ms: null } }), t); }
  const s = await summary(env, t);
  assert.ok(!s.incidents.some((x) => !x.ended && x.svcs.includes("markets")), "no incident while it's on");
  assert.equal(s.services.find((x) => x.id === "markets").up90, before, "and not counted against uptime");
  assert.equal((await bannerFor(env, "markets", t)).banner?.kind, "maint", "Markets says so");
  assert.equal((await bannerFor(env, "weather", t)).banner, null, "Weather doesn't");
  await cancelMaint(env, m.id, t);
  assert.equal((await adminMaint(env, t)).length, 0);
  await assert.rejects(cancelMaint(env, m.id, t), /isn’t there/);
});

test("an incident started by hand stays until it's resolved by hand, and shows a banner in the apps it names", async () => {
  const t = T0 + 12 * 3600e3;
  await assert.rejects(startIncident(env, { title: "Hi", text: "x" }, t), /title/);
  const x = await startIncident(env, { title: "Weather alerts are late", text: "Up to 20 minutes late. Looking into it.", svcs: ["wxtick", "weather"] }, t);
  assert.equal(x.kind, "manual"); assert.deepEqual(x.svcs, ["weather", "wxtick"]);
  for (let i = 1; i <= 3; i++) await keepReport(env, report(), t + i * 5 * 60e3);
  assert.equal((await summary(env, t + 16 * 60e3)).incidents.find((i) => i.id === x.id).ended, null, "not closed by the checks");
  const b = await bannerFor(env, "weather", t + 16 * 60e3);
  assert.equal(b.banner.title, "Weather alerts are late"); assert.match(b.banner.text, /20 minutes/);
  assert.equal((await bannerFor(env, "chat", t)).banner, null);
  assert.equal((await bannerFor(env, "hub", t)).banner?.id, x.id, "the hub: anything");
  await noteIncident(env, { id: x.id, kind: "Resolved", text: "Caught up." }, t + 20 * 60e3);
  assert.equal((await bannerFor(env, "weather", t + 21 * 60e3)).banner, null, "gone once it's resolved");
});

test("the same bug five times in ten minutes opens an incident (where that's on), and an hour without it closes it", async () => {
  const t = T0 + 15 * 3600e3;
  DB.sql.exec("CREATE TABLE IF NOT EXISTS pg_bugs (id TEXT PRIMARY KEY, code TEXT NOT NULL, app TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, version TEXT, words TEXT, at_where TEXT, stack TEXT, path TEXT, device TEXT, note TEXT, filed_at INTEGER, issue INTEGER)");
  for (let i = 0; i < 4; i++) DB.sql.prepare("INSERT INTO pg_bugs (id, code, app, kind, at) VALUES (?, 'IF-C-AAAAA', 'chat', 'crash', ?)").run(`b${i}`, t - i * 60e3);
  assert.equal(await burstCheck(env, "IF-C-AAAAA", "chat", t), null, "four isn't a burst");
  DB.sql.prepare("INSERT INTO pg_bugs (id, code, app, kind, at) VALUES ('b9', 'IF-C-AAAAA', 'chat', 'crash', ?)").run(t);
  await setAlertPrefs(env, { burst: false });
  assert.equal(await burstCheck(env, "IF-C-AAAAA", "chat", t), null, "off: nothing");
  assert.equal((await setAlertPrefs(env, { burst: true, nope: 1 })).burst, true);
  assert.deepEqual(Object.keys(await alertPrefs(env)).sort(), ["burst", "email", "push"]);
  const id = await burstCheck(env, "IF-C-AAAAA", "chat", t);
  assert.ok(id); assert.equal(await burstCheck(env, "IF-C-AAAAA", "chat", t), null, "one at a time");
  let x = (await summary(env, t)).incidents.find((i) => i.id === id);
  assert.equal(x.kind, "burst"); assert.deepEqual(x.svcs, ["chat"]); assert.deepEqual(x.codes, ["IF-C-AAAAA"]);
  await keepReport(env, report(), t + 30 * 60e3);
  assert.equal((await summary(env, t + 30 * 60e3)).incidents.find((i) => i.id === id).ended, null);
  await keepReport(env, report(), t + 75 * 60e3);
  assert.ok((await summary(env, t + 75 * 60e3)).incidents.find((i) => i.id === id).ended, "an hour quiet: closed");
});

test("the outside check, the feed, and the banner at every app's address (and Today's and Mail's way to it)", async () => {
  const t = T0 + 18 * 3600e3;
  await keepReport(env, report(), t);
  const o = await outsideSaw(env, t + 60e3);
  assert.equal(o.stale, false); assert.deepEqual(o.down, []);
  assert.equal((await summary(env, t + 60e3)).outside, t + 60e3);
  assert.equal((await outsideSaw(env, t + 30 * 60e3)).stale, true, "no check for 20 minutes: stale");
  const call = async (method, url, auth) => statusRoute({ env, request: new Request(url, { method, headers: auth ? { Authorization: `Bearer ${auth}` } : {} }) }, new URL(url));
  assert.equal((await call("POST", `https://${TICK}/api/status/outside`)).status, 401);
  assert.equal((await call("POST", `https://${TICK}/api/status/outside`, "tick")).status, 200);
  for (const u of ["https://chat.inflite.ai/api/status-banner?app=chat", "https://account.inflite.ai/api/account/status-banner?app=hub"]) {
    const r = await call("GET", u);
    assert.equal(r.status, 200, u); assert.ok("banner" in (await r.json()));
  }
  const f = await statusHost({ env, request: new Request("https://status.inflite.ai/feed.xml") }, new URL("https://status.inflite.ai/feed.xml"));
  assert.equal(f.status, 200); assert.match(f.headers.get("Content-Type"), /atom/);
  const xml = await f.text();
  assert.match(xml, /^<\?xml/); assert.match(xml, /<entry>/); assert.match(xml, /Weather alerts are late/);
});
