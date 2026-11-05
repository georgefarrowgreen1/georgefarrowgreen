// The Incident Desk (functions/_desk.js, Admin on the account page): a request that runs out of time says how long each
// part took (functions/_todaycards.js stepTimer, kept with its bug code as slow, not failed: functions/_bugs.js); every
// code of the week and every incident in Needs you, Watching or Done (fixed, back again once seen after, muted a day);
// a deploy recorded, and an app's new version seen by the checks recorded as one; an incident that's over answered: not
// an outage takes what it counted out of uptime (put back if that's taken back), a write-up's summary on the status
// page once, reopened it's the owner's to close; the owner's notes never on the status page, its feed or a banner; and
// the ticker's own changes to an incident never wipe what the Desk keeps on it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { keepReport, summary, bannerFor, startIncident, noteIncident, statusTable } from "../../../functions/_status.js";
import { deskView, deskNeeds, codeState, incidentOutage, incidentWriteup, incidentReopen, incidentNote, incidentUnnote, incidentAffects, recordDeploy, titleOf, appOfCode } from "../../../functions/_desk.js";
import { fileServerBug, detailOf } from "../../../functions/_bugs.js";
import { withDeadline, stepTimer, Quiet } from "../../../functions/_todaycards.js";
import { STATUS_SERVICES, STATUS_JOBS } from "../../../functions/_statuslist.js";

function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => { const p = s.prepare(sql); if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } }; const r = p.run(...val(args)); return { results: [], success: true, meta: { changes: Number(r.changes) } }; };
  const st = (sql, args = []) => ({ bind: (...a) => st(sql, a), first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args), raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)), now: () => exec(sql, args) });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
const said = console.error;
console.error = () => {};
test.after(() => { console.error = said; });
const versions = { today: "1.66" };
const link = (id) => ({ fetch: async () => new Response(JSON.stringify({ build: versions[id] || "1.00", min: null }), { headers: { "Content-Type": "application/json" } }) });
const DB = d1();
const env = { DB, STATUS_DEPS: "0", PIGEON_TICK_SECRET: "tick", TODAY_APP: link("today"), MAIL_APP: link("mail") };
const S = DB.sql, one = (q, ...a) => { const r = S.prepare(q).get(...a); return r ? { ...r } : null; };
const T = Date.now(), MIN = 60e3;
const report = (over = {}) => ({ checks: STATUS_SERVICES.map((s) => ({ id: s.id, s: "ok", ms: 120, ...(over[s.id] || {}) })), jobs: STATUS_JOBS.map((j) => ({ path: j.path, ok: true, ms: 800 })) });

test("a day that runs out of time says how long each part took, and is kept as slow (people got their cards), not failed", async () => {
  let now = 0;
  const steps = stepTimer(() => now);
  const slow = new Promise(() => {}), quick = Promise.resolve(1);
  steps.time("Your day’s data", quick);
  steps.time("Ride forecast", slow); steps.time("Ride forecast", Promise.resolve());
  await Promise.resolve(); await Promise.resolve();
  now = 2400;
  const snap = steps.snapshot();
  assert.deepEqual(snap.map((p) => p.name), ["Your day’s data", "Ride forecast"], "one line a part, the longest of a name kept");
  assert.equal(snap[1].ms, 2400); assert.equal(snap[1].done, false, "still going when asked");
  assert.equal(snap[0].done, true);
  const e = await withDeadline(new Promise(() => {}), 5, stepTimer()).catch((x) => x);
  assert.ok(e instanceof Quiet); assert.equal(e.detail.limit, 5); assert.ok(Array.isArray(e.detail.steps));
  const d = detailOf(Object.assign(new Quiet("Too slow."), { detail: { limit: 3000, steps: [{ name: "Ride forecast", ms: 2000.6, done: false }, { name: "a part ".repeat(12), ms: 3 }] } }));
  assert.equal(d.sev, "slow"); assert.equal(d.limit, 3000); assert.deepEqual(d.steps[0], { name: "Ride forecast", ms: 2001, done: false }); assert.equal(d.steps[1].name.length, 40);
  assert.equal(detailOf(new Error("D1_ERROR: no such table")).sev, "failed");
  // (filed with its code, its detail kept beside it)
  const code = await fileServerBug(env, "today day", Object.assign(new Quiet("Too slow."), { detail: { limit: 3000, steps: [{ name: "Mail’s numbers", ms: 700, done: true }] } }));
  assert.match(code, /^IF-S-[0-9A-Z]{5}$/);
  const row = one("SELECT detail FROM pg_bugs WHERE code = ?", code);
  assert.deepEqual(JSON.parse(row.detail), { sev: "slow", limit: 3000, steps: [{ name: "Mail’s numbers", ms: 700, done: true }] });
});

test("names in words, and the app each is about", () => {
  assert.equal(titleOf("server", "today day", "Too slow."), "Today: building your day");
  assert.equal(titleOf("server", "fitness garmin", "x"), "Fitness: garmin");
  assert.equal(titleOf("weather", "error", "Cannot read properties of null"), "Weather: Cannot read properties of null");
  assert.equal(appOfCode("server", "today day"), "Today"); assert.equal(appOfCode("server", "tick"), "Chat"); assert.equal(appOfCode("auth", "x"), "Signing in");
});

const bug = (code, app, kind, at, more = {}) => S.prepare("INSERT INTO pg_bugs (id, code, app, kind, at, version, words, detail, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
  .run(`${code}-${at}-${Math.random()}`, code, app, kind, at, more.version || null, more.words || "Too slow.", more.detail ? JSON.stringify(more.detail) : null, more.note || null);

test("each code once, in Needs you, Watching or Done; fixed, back again once seen after, muted a day; after which deploy", async () => {
  await statusTable(env);
  await recordDeploy(env, { what: "The site", version: "abc1234", note: "Ride times" }, T - 70 * MIN);
  bug("IF-S-AAAAA", "server", "today day", T - 60 * MIN, { detail: { sev: "slow", limit: 3000, steps: [] }, version: "Today 1.66" });
  bug("IF-S-AAAAA", "server", "today day", T - 50 * MIN);
  bug("IF-W-BBBBB", "weather", "error", T - 30 * MIN, { words: "x is null", note: "It went blank" });
  bug("IF-M-CCCCC", "markets", "error", T - 3 * 864e5);
  let d = await deskView(env, T);
  const by = (id) => d.items.find((x) => x.id === id);
  assert.equal(by("IF-S-AAAAA").bucket, "needs"); assert.equal(by("IF-S-AAAAA").count, 2); assert.equal(by("IF-S-AAAAA").sev, "slow");
  assert.equal(by("IF-S-AAAAA").title, "Today: building your day"); assert.equal(by("IF-S-AAAAA").app, "Today");
  assert.deepEqual(by("IF-S-AAAAA").after && { what: by("IF-S-AAAAA").after.what, mins: by("IF-S-AAAAA").after.mins }, { what: "The site", mins: 10 }, "first seen 10 minutes after the deploy");
  assert.deepEqual(by("IF-W-BBBBB").notes, ["It went blank"]); assert.equal(by("IF-W-BBBBB").sev, "failed");
  assert.equal(by("IF-M-CCCCC").bucket, "done", "nothing for a day, not acted on: Done");
  assert.equal(await deskNeeds(env, T), 3, "these two, and the one the first test filed");
  await codeState(env, { code: "IF-S-AAAAA", state: "fixed" }, T);
  await codeState(env, { code: "IF-W-BBBBB", state: "muted" }, T);
  d = await deskView(env, T + MIN);
  assert.equal(by("IF-S-AAAAA").state, "fixed"); assert.equal(by("IF-S-AAAAA").bucket, "watching");
  assert.equal(by("IF-W-BBBBB").state, "muted"); assert.equal(by("IF-W-BBBBB").bucket, "done");
  assert.equal(await deskNeeds(env, T + MIN), 1, "fixed and muted no longer count");
  bug("IF-S-AAAAA", "server", "today day", T + 2 * MIN);
  d = await deskView(env, T + 3 * MIN);
  assert.equal(by("IF-S-AAAAA").state, "back"); assert.equal(by("IF-S-AAAAA").bucket, "needs", "seen after it was marked fixed: back in Needs you");
  d = await deskView(env, T + 864e5 + 5 * MIN);
  assert.equal(by("IF-W-BBBBB").state, "new", "a day on, muted no more");
  await codeState(env, { code: "IF-S-AAAAA", state: "new" }, T);
  await assert.rejects(codeState(env, { code: "nope", state: "fixed" }), /Which code/);
  await assert.rejects(codeState(env, { code: "IF-S-AAAAA", state: "gone" }), /Fixed, muted or new/);
});

test("an app's new version, as the checks see it, is recorded as a deploy", async () => {
  const at = Math.floor(T / MIN) * MIN + 10 * MIN;
  await keepReport(env, report(), at);
  versions.today = "1.67";
  await keepReport(env, report(), at + 5 * MIN);
  const d = await deskView(env, at + 6 * MIN);
  assert.ok(d.deploys.some((x) => x.what === "Today" && x.version === "1.67"), JSON.stringify(d.deploys));
  assert.ok(!d.deploys.some((x) => x.what === "Today" && x.version === "1.66"), "the first sight of a version isn't a deploy");
});

test("an incident over: not an outage takes it out of uptime (and back), a write-up's summary once, notes never public, reopened it's yours", async () => {
  // (Mail down for two checks, then fine for two: an incident opened and closed by the checks)
  const base = Math.floor(T / MIN) * MIN + 60 * MIN;
  await keepReport(env, report({ mail: { s: "down", why: "HTTP 401" } }), base);
  await keepReport(env, report({ mail: { s: "down", why: "HTTP 401" } }), base + 5 * MIN);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
  const downBefore = one("SELECT down FROM status_days WHERE svc = 'mail' AND day = ?", day).down;
  assert.equal(downBefore, 2);
  // (a note while it's open, kept across the ticker's own changes to it)
  let open = (await deskView(env, base + 6 * MIN)).items.find((x) => x.type === "incident" && !x.ended);
  assert.ok(open, "opened"); assert.equal(open.bucket, "needs"); assert.deepEqual(open.apps, ["Mail"]);
  await incidentNote(env, { id: open.id, text: "401, not 5xx: the check’s sign-in" }, base + 7 * MIN);
  await keepReport(env, report(), base + 10 * MIN);
  await keepReport(env, report(), base + 15 * MIN);
  let x = (await deskView(env, base + 16 * MIN)).items.find((i) => i.id === open.id);
  assert.ok(x.ended, "closed by the checks"); assert.equal(x.bucket, "watching");
  assert.equal(x.notes[0].w, "401, not 5xx: the check’s sign-in", "the ticker closing it kept the note");
  assert.equal(x.downN, 2, "what “not an outage” would take back, shown first");
  // (the note on none of what the public sees)
  const pub = JSON.stringify([await summary(env, base + 16 * MIN), await bannerFor(env, "mail", base + 16 * MIN)]);
  assert.ok(!pub.includes("check’s sign-in"));
  // not an outage, then yes it was, then not again
  await incidentOutage(env, { id: x.id, outage: false, line: "Mail kept working; our check was at fault." }, base + 17 * MIN);
  assert.equal(one("SELECT down FROM status_days WHERE svc = 'mail' AND day = ?", day).down, 0, "taken out of uptime");
  let s = await summary(env, base + 18 * MIN), inc = s.incidents.find((i) => i.id === x.id);
  assert.equal(inc.notOutage, true); assert.equal(inc.updates[0].w, "Mail kept working; our check was at fault.");
  await incidentOutage(env, { id: x.id, outage: true }, base + 19 * MIN);
  assert.equal(one("SELECT down FROM status_days WHERE svc = 'mail' AND day = ?", day).down, 2, "put back");
  await incidentOutage(env, { id: x.id, outage: false, line: "" }, base + 20 * MIN);
  assert.equal(one("SELECT down FROM status_days WHERE svc = 'mail' AND day = ?", day).down, 0);
  // the write-up: its summary on the page once, however often it's written
  await assert.rejects(incidentWriteup(env, { id: x.id, cause: "Bad luck" }), /What caused it/);
  await incidentWriteup(env, { id: x.id, cause: "The check itself", fix: "Mail 1.64", prevent: "statusprobes", summary: "Our check was wrong." }, base + 21 * MIN);
  await incidentWriteup(env, { id: x.id, cause: "The check itself", fix: "Mail 1.64", prevent: "statusprobes", summary: "Our own check was wrong." }, base + 22 * MIN);
  s = await summary(env, base + 23 * MIN); inc = s.incidents.find((i) => i.id === x.id);
  assert.deepEqual(inc.updates.filter((u) => u.k === "Summary").map((u) => u.w), ["Our own check was wrong."]);
  const d = await deskView(env, base + 23 * MIN);
  x = d.items.find((i) => i.id === x.id);
  assert.equal(x.bucket, "done", "both answers in: Done"); assert.equal(x.writeup.cause, "The check itself");
  assert.equal(d.week.notOutages, 1); assert.deepEqual(d.week.causes, [{ cause: "The check itself", n: 1 }]);
  // reopened: the uptime put back, and it's the owner's to close (the checks, fine, don't close it)
  await incidentReopen(env, { id: x.id, text: "Looking again." }, base + 24 * MIN);
  assert.equal(one("SELECT down FROM status_days WHERE svc = 'mail' AND day = ?", day).down, 2);
  await keepReport(env, report(), base + 25 * MIN);
  await keepReport(env, report(), base + 30 * MIN);
  x = (await deskView(env, base + 31 * MIN)).items.find((i) => i.id === x.id);
  assert.equal(x.ended, null, "still open: yours to close"); assert.equal(x.kind, "manual"); assert.equal(x.updates[0].w, "Looking again.");
  // (a public update, taken back within ten minutes; and resolving it)
  const posted = await noteIncident(env, { id: x.id, kind: "Identified", text: "Found it." }, base + 32 * MIN);
  await incidentUnnote(env, { id: x.id, at: posted.updates[0].at }, base + 33 * MIN);
  x = (await deskView(env, base + 33 * MIN)).items.find((i) => i.id === x.id);
  assert.ok(!x.updates.some((u) => u.w === "Found it."));
  await assert.rejects(incidentUnnote(env, { id: x.id, at: base }, base + 34 * MIN), /can’t be taken back/);
  // (what it affects, while it's open)
  const r = await incidentAffects(env, { id: x.id, svcs: ["mail", "today", "nonsense"] });
  assert.deepEqual(r.svcs, ["mail", "today"]);
  await noteIncident(env, { id: x.id, kind: "Resolved", text: "Working." }, base + 35 * MIN);
  await assert.rejects(incidentAffects(env, { id: x.id, svcs: ["mail"] }), /It’s over/);
  // (a note taken back)
  const n = await incidentNote(env, { id: x.id, text: "temp" }, base + 36 * MIN);
  await incidentNote(env, { id: x.id, remove: n.notes[0].at });
  assert.ok(!(await deskView(env, base + 37 * MIN)).items.find((i) => i.id === x.id).notes.some((v) => v.w === "temp"));
});

test("one started by hand: in Needs you, its stage from its latest update", async () => {
  const x = await startIncident(env, { title: "Markets prices are late", text: "Prices are late.", svcs: ["markets"] }, T + 2 * 3600e3);
  await noteIncident(env, { id: x.id, kind: "Identified", text: "Found it." }, T + 2 * 3600e3 + MIN);
  const i = (await deskView(env, T + 2 * 3600e3 + 2 * MIN)).items.find((y) => y.id === x.id);
  assert.equal(i.bucket, "needs"); assert.equal(i.stage, "Identified"); assert.deepEqual(i.apps, ["Markets"]);
  await assert.rejects(incidentOutage(env, { id: x.id, outage: false }), /once it’s over/);
  await assert.rejects(incidentWriteup(env, { id: x.id, cause: "Our code" }), /once it’s over/);
  await assert.rejects(incidentReopen(env, { id: x.id }), /still open/);
  await assert.rejects(incidentNote(env, { id: "nope", text: "x" }), /isn’t there/);
});
