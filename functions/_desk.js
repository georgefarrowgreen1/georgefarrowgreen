// The Incident Desk (Admin, on the admin's account page: account/admin.js): one place for what's gone wrong. Every bug
// code of the week (the site's own server errors and the reports people sent, functions/_bugs.js), status.inflite.ai's
// incidents (functions/_status.js), the deploys, the scheduled jobs, and the week in figures, each item in one of three
// lists: Needs you, Watching, Done. Codes are marked fixed (back in Needs you if they're seen again after) or muted for a
// day; an incident that's over is finished with two answers, whether it was a real outage (one that wasn't is taken out
// of uptime) and a write-up, and keeps the owner's own notes, which are never shown on the status page.
//   deskView(env, t) → { items, deploys, jobs, week, at }
//   codeState(env, { code, state }) · incidentOutage(env, b) · incidentWriteup(env, b) · incidentReopen(env, b)
//   incidentNote(env, b) (private) · incidentAffects(env, b) · incidentUnnote(env, b) (a public update just posted)
//   recordDeploy(env, { what, version, note }, t) (the site's workflow, after each deploy)
import { HttpError } from "./_pigeon.js";
import { statusTable, parse, nameOf, forgetStatus, jobsNow, STATE, lastDays } from "./_status.js";
import { table as bugsTable } from "./_bugs.js";
import { STATUS_SERVICES, STATUS_JOBS, STATUS_DEPS } from "./_statuslist.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const words = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const json1 = (v, or) => { try { return v ? JSON.parse(v) : or; } catch (_) { return or; } };

// (which app an item's about, as the Desk's strip names them)
export const DESK_APPS = ["Today", "Chat", "Weather", "Fitness", "Markets", "Mail", "Signing in"];
const BY_WORD = { today: "Today", hub: "Today", pigeon: "Chat", chat: "Chat", chats: "Chat", tick: "Chat", sync: "Chat", inflight: "Chat", weather: "Weather", wx: "Weather",
  fitness: "Fitness", garmin: "Fitness", strava: "Fitness", markets: "Markets", finance: "Markets", mkt: "Markets", mail: "Mail", email: "Mail", account: "Signing in", auth: "Signing in" };
const BY_SVC = { today: "Today", morning: "Today", chat: "Chat", notify: "Chat", weather: "Weather", wxtick: "Weather", "dep-weather": "Weather", fitness: "Fitness", garmin: "Fitness",
  "dep-garmin": "Fitness", markets: "Markets", mkttick: "Markets", "dep-prices": "Markets", mail: "Mail", auth: "Signing in", account: "Signing in", "dep-email": "Signing in" };
export const appOfCode = (app, kind) => (app === "server" ? BY_WORD[String(kind || "").split(/\s+/)[0]] || null : BY_WORD[app] || null);
// (a server error's name in words: "Today: building your day")
const SRC = { "today day": "Today: building your day", "today tick": "Today: the morning notification", "today weather": "Today: the weather", "today plan": "Today: your plan",
  "today preview": "Today: the preview", "weather tick": "Weather: the alerts job", "weather api": "Weather", tick: "Chat: the notifications job", "pigeon notify email": "Chat: notification emails",
  "sync plans": "Chat: syncing plans", "sync hold": "Chat: held messages" };
const APPN = { today: "Today", pigeon: "Chat", chat: "Chat", chats: "Chat", weather: "Weather", fitness: "Fitness", markets: "Markets", finance: "Markets", account: "Account", auth: "Signing in",
  mail: "Mail", email: "Mail", sync: "Chat", home: "Home page", hub: "InFlite", server: "The site" };
const upper = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function titleOf(app, kind, words) {
  if (app === "server") {
    if (SRC[kind]) return SRC[kind];
    const w = String(kind || "").split(/\s+/);
    return `${APPN[w[0]] || upper(w[0] || "The site")}${w.length > 1 && w.slice(1).join(" ") !== "api" ? `: ${w.slice(1).join(" ")}` : ""}`;
  }
  return `${APPN[app] || upper(app)}: ${kind === "manual" ? "a problem someone reported" : words ? String(words).slice(0, 60) : "something went wrong"}`;
}
// (what people saw, in a sentence: a slow answer that still gave them what it could, or a failure)
function sawOf(app, kind, sev) {
  if (kind === "today day" && sev === "slow") return "People got their cards straight away, without the day’s lines (next ride, who’s waiting, what’s coming) until the next refresh.";
  if (sev === "slow") return "It took too long, so people got what could be had in time rather than an error.";
  if (app === "server") return "A request failed on the server: what asked for it saw an error or went without.";
  return "Someone saw InFlite’s “Something went wrong” window, and sent it.";
}

// ---- the whole Desk ----
export async function deskView(env, t = Date.now()) {
  const D = await statusTable(env);
  await bugsTable(env).catch(() => {});
  const rowsOf = (q) => q.all().then((r) => r.results || [], () => []);
  const [bugs, states, incs, deps, jobs, days] = await Promise.all([
    rowsOf(D.prepare("SELECT code, app, kind, at, version, words, at_where, stack, note, detail, issue FROM pg_bugs WHERE at > ? AND app != 'fitting' ORDER BY at DESC LIMIT 600").bind(t - 7 * DAY)),
    rowsOf(D.prepare("SELECT code, state, at, until FROM desk_codes")),
    rowsOf(D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL OR started >= ? ORDER BY started DESC LIMIT 30").bind(t - 30 * DAY)),
    rowsOf(D.prepare("SELECT at, what, version, note FROM status_deploys WHERE at > ? ORDER BY at DESC LIMIT 60").bind(t - 7 * DAY)),
    jobsNow(env),
    rowsOf(D.prepare("SELECT day, svc, n, down FROM status_days WHERE day >= ?").bind(lastDays(t, 7)[0])),
  ]);
  const said = Object.fromEntries(states.map((s) => [s.code, s]));
  // (each code once: how often, first and last seen, the versions, the latest detail and where, people's notes)
  const codes = new Map();
  for (const b of bugs) {
    let c = codes.get(b.code);
    if (!c) {
      // (one kept before its severity was, this morning's included: slow where it said "Too slow.")
      const d = json1(b.detail, null), sev = d?.sev || (/^too slow\.?$/i.test(String(b.words || "").trim()) ? "slow" : "failed");
      c = { id: b.code, type: "error", code: b.code, app: appOfCode(b.app, b.kind), source: b.app, kind: b.kind, title: titleOf(b.app, b.kind, b.words), words: b.words || "",
        sev, saw: sawOf(b.app, b.kind, sev), last: b.at, first: b.at, count: 0, today: [], versions: [], notes: [], detail: d, where: b.at_where || null, stack: b.stack || null, filed: !!b.issue };
      codes.set(b.code, c);
    }
    c.count++; c.first = Math.min(c.first, b.at);
    if (t - b.at < DAY && c.today.length < 60) c.today.push(b.at);
    if (b.version && !c.versions.includes(b.version) && c.versions.length < 4) c.versions.push(b.version);
    if (b.note && c.notes.length < 5) c.notes.push(words(b.note, 300));
    if (!c.detail?.steps && b.detail) { const d = json1(b.detail, null); if (d) { c.detail = d; c.sev = d.sev || c.sev; c.saw = sawOf(b.app, b.kind, c.sev); } }
  }
  const deployList = deps.map((d) => ({ at: d.at, what: d.what, version: d.version || null, note: d.note || null }));
  const lastDeployBefore = (at) => deployList.find((d) => d.at <= at && at - d.at < 6 * HOUR) || null;
  const items = [];
  for (const c of codes.values()) {
    const s = said[c.code], dep = lastDeployBefore(c.first);
    c.after = dep ? { at: dep.at, what: dep.what, version: dep.version, mins: Math.round((c.first - dep.at) / MIN) } : null;
    if (s?.state === "muted" && s.until > t) { c.state = "muted"; c.until = s.until; c.bucket = "done"; }
    else if (s?.state === "fixed") { c.state = c.last > s.at ? "back" : "fixed"; c.fixedAt = s.at; c.bucket = c.state === "back" ? "needs" : t - s.at < DAY ? "watching" : "done"; }
    else { c.state = "new"; c.bucket = t - c.last < DAY ? "needs" : "done"; }
    items.push(c);
  }
  // (incidents: open, needs you; over, watching until both finishing answers are in or a week's gone by)
  const serverBugs = bugs.filter((b) => b.app === "server");
  for (const row of incs) {
    const x = parse(row), over = !!x.ended, end = x.ended || t;
    const stage = (x.updates.find((u) => ["Investigating", "Identified", "Monitoring"].includes(u.k)) || {}).k || "Investigating";
    const finished = x.outage !== null && !!x.writeup;
    items.push({ id: x.id, type: "incident", kind: x.kind, title: x.title, svcs: x.svcs, apps: [...new Set(x.svcs.map((s) => BY_SVC[s]).filter(Boolean))], app: BY_SVC[x.svcs[0]] || null,
      started: x.started, ended: x.ended, mins: Math.max(1, Math.round((end - x.started) / MIN)), stage, updates: x.updates, notes: x.notes, outage: x.outage, writeup: x.writeup, code: x.code,
      deploys: deployList.filter((d) => d.at >= x.started - HOUR && d.at <= end + 10 * MIN),
      codes: [...new Set(serverBugs.filter((b) => b.at >= x.started && b.at <= end).map((b) => b.code))].slice(0, 4),
      bucket: !over ? "needs" : finished || t - x.ended > 7 * DAY ? "done" : "watching" });
  }
  // (for "Was it a real outage?": the failed checks each one still to be answered counted against uptime, and each
  // address's 90 days, so the answer's effect is shown before it's given)
  for (const x of items) if (x.type === "incident" && x.ended && x.outage === null && x.bucket === "watching")
    x.downN = (await downDuring(D, { svcs: x.svcs, started: x.started, ended: x.ended }).catch(() => [])).reduce((a, f) => a + f.n, 0);
  const u90 = await rowsOf(D.prepare("SELECT svc, SUM(n) AS n, SUM(down) AS down FROM status_days WHERE day >= ? GROUP BY svc").bind(lastDays(t, 90)[0]));
  const uptime90 = Object.fromEntries(u90.map((r) => [r.svc, [r.n, r.down]]));
  const order = { needs: 0, watching: 1, done: 2 };
  items.sort((a, b) => order[a.bucket] - order[b.bucket] || (b.type === "incident" && !b.ended) - (a.type === "incident" && !a.ended) || (b.last || b.ended || b.started) - (a.last || a.ended || a.started));
  return { at: t, items: items.slice(0, 60), deploys: deployList, jobs, week: weekOf(incs.map(parse), days, t), apps: DESK_APPS, uptime90 };
}
// (the week: incidents and how long they typically took, uptime across the addresses with what wasn't an outage taken out,
// and the month's causes from the write-ups)
function weekOf(incs, days, t) {
  const week = incs.filter((x) => x.started >= t - 7 * DAY), done = week.filter((x) => x.ended).map((x) => (x.ended - x.started) / MIN).sort((a, b) => a - b);
  let n = 0, down = 0;
  const ids = new Set(STATUS_SERVICES.map((s) => s.id));
  for (const r of days) if (ids.has(r.svc)) { n += r.n; down += r.down; }
  const causes = {};
  for (const x of incs) if (x.writeup?.cause && x.started >= t - 30 * DAY) causes[x.writeup.cause] = (causes[x.writeup.cause] || 0) + 1;
  return { incidents: week.length, typicalMins: done.length ? Math.round(done[Math.floor(done.length / 2)]) : null, uptime: n ? Math.round(((n - down) / n) * 10000) / 100 : null,
    notOutages: week.filter((x) => x.outage === false).length, causes: Object.entries(causes).map(([cause, n]) => ({ cause, n })).sort((a, b) => b.n - a.n) };
}

// ---- a code: fixed, muted a day, or back to new ----
const CODE = /^IF-[A-Z]-[0-9A-Z]{4,6}$/;
export async function codeState(env, b, t = Date.now()) {
  const code = String(b?.code || ""), state = b?.state;
  if (!CODE.test(code)) throw new HttpError(400, "Which code?");
  const D = await statusTable(env);
  if (state === "new") await D.prepare("DELETE FROM desk_codes WHERE code = ?").bind(code).run();
  else if (state === "fixed") await D.prepare("INSERT OR REPLACE INTO desk_codes (code, state, at, until) VALUES (?, 'fixed', ?, NULL)").bind(code, t).run();
  else if (state === "muted") await D.prepare("INSERT OR REPLACE INTO desk_codes (code, state, at, until) VALUES (?, 'muted', ?, ?)").bind(code, t, t + DAY).run();
  else throw new HttpError(400, "Fixed, muted or new?");
  // (the status page shows where each code stands: its copy let go of, so it says so at once)
  await forgetStatus(env);
  return { ok: true, code, state };
}

// ---- an incident ----
async function incident(D, id) {
  const row = typeof id === "string" && id ? await D.prepare("SELECT * FROM status_incidents WHERE id = ?").bind(id).first() : null;
  if (!row) throw new HttpError(404, "That incident isn’t there any more.");
  return { row, x: { ...parse(row), fixup: json1(row.fixup, null) } };
}
const save = (D, x, cols) => D.prepare(`UPDATE status_incidents SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
  .bind(...cols.map((c) => { const v = x[c]; return c === "outage" ? (v == null ? null : v ? 1 : 0) : typeof v === "object" && v !== null ? JSON.stringify(c === "updates" ? v.slice(0, 40) : v) : v ?? null; }), x.id);
// (the failed checks an incident's addresses had while it lasted, by day: from each check where they're still kept (two
// days), else one failed check every five minutes it lasted)
async function downDuring(D, x) {
  const ids = x.svcs.filter((s) => STATUS_SERVICES.some((v) => v.id === s));
  if (!ids.length) return [];
  const end = x.ended || Date.now();
  const { results } = await D.prepare(`SELECT svc, at FROM status_checks WHERE s = ? AND at >= ? AND at <= ? AND svc IN (${ids.map(() => "?").join(", ")})`).bind(STATE.down, x.started, end, ...ids).all();
  const by = new Map(), day = (at) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  if ((results || []).length) for (const r of results) { const k = `${day(r.at)}|${r.svc}`; by.set(k, (by.get(k) || 0) + 1); }
  else for (const s of ids) by.set(`${day(x.started)}|${s}`, Math.max(1, Math.round((end - x.started) / (5 * MIN))));
  return [...by].map(([k, n]) => { const [d, svc] = k.split("|"); return { day: d, svc, n }; });
}
// Was it a real outage? No: what it counted against uptime taken back (kept, so saying yes after puts it back), and a
// line on the status page saying what happened. Yes: as it was
export async function incidentOutage(env, b, t = Date.now()) {
  const D = await statusTable(env), { x } = await incident(D, b?.id);
  if (!x.ended) throw new HttpError(400, "Say that once it’s over.");
  const no = b?.outage === false, line = words(b?.line, 300), writes = [];
  if (no && x.outage !== false) {
    const fix = await downDuring(D, x);
    for (const f of fix) writes.push(D.prepare("UPDATE status_days SET down = MAX(0, down - ?) WHERE day = ? AND svc = ?").bind(f.n, f.day, f.svc));
    x.fixup = fix; x.outage = false;
    if (line) x.updates.unshift({ at: t, k: "Update", w: line, by: "owner" });
  } else if (!no) {
    for (const f of x.fixup || []) writes.push(D.prepare("UPDATE status_days SET down = down + ? WHERE day = ? AND svc = ?").bind(f.n, f.day, f.svc));
    x.fixup = null; x.outage = true;
  }
  writes.push(save(D, x, ["outage", "fixup", "updates"]));
  await D.batch(writes);
  await forgetStatus(env);
  return { ok: true, outage: x.outage };
}
// The write-up: what caused it, what fixed it, what stops it happening again; and, if it's given, a short summary on
// the status page
export const CAUSES = ["Our code", "A provider", "The check itself", "A deploy", "The database", "Something else"];
export async function incidentWriteup(env, b, t = Date.now()) {
  const D = await statusTable(env), { x } = await incident(D, b?.id);
  if (!x.ended) throw new HttpError(400, "Write it up once it’s over.");
  const cause = CAUSES.includes(b?.cause) ? b.cause : null;
  if (!cause) throw new HttpError(400, "What caused it?");
  const summary = words(b?.summary, 400), had = x.writeup;
  x.writeup = { cause, fix: words(b?.fix, 200), prevent: words(b?.prevent, 600), summary, at: t };
  // (the summary on the status page: once, replaced if it's written again)
  x.updates = x.updates.filter((u) => !(u.k === "Summary" && u.by === "owner"));
  if (summary) x.updates.unshift({ at: t, k: "Summary", w: summary, by: "owner" });
  await save(D, x, ["writeup", "updates"]).run();
  if (summary || had?.summary) await forgetStatus(env);
  return { ok: true, writeup: x.writeup };
}
// Open again: it's yours to close from here (the checks won't close it by themselves), and the status page says so
export async function incidentReopen(env, b, t = Date.now()) {
  const D = await statusTable(env), { x } = await incident(D, b?.id), writes = [];
  if (!x.ended) throw new HttpError(400, "It’s still open.");
  for (const f of x.fixup || []) writes.push(D.prepare("UPDATE status_days SET down = down + ? WHERE day = ? AND svc = ?").bind(f.n, f.day, f.svc));
  x.ended = null; x.kind = "manual"; x.fixup = null; x.outage = null;
  x.updates.unshift({ at: t, k: "Investigating", w: words(b?.text, 600) || "We’re looking at this again.", by: "owner" });
  writes.push(save(D, x, ["ended", "kind", "fixup", "outage", "updates"]));
  await D.batch(writes);
  await forgetStatus(env);
  return { ok: true };
}
// A note for yourself: kept with the incident, never on the status page, its feed or any banner. remove: one taken back
export async function incidentNote(env, b, t = Date.now()) {
  const D = await statusTable(env), { x } = await incident(D, b?.id);
  if (b?.remove != null) x.notes = x.notes.filter((n) => n.at !== Number(b.remove));
  else {
    const w = words(b?.text, 1000);
    if (!w) throw new HttpError(400, "Write the note first.");
    x.notes.unshift({ at: t, w });
  }
  await save(D, x, ["notes"]).run();
  return { ok: true, notes: x.notes.slice(0, 50) };
}
// A public update just posted, taken back (Undo: ten minutes at most, and only one of yours)
export async function incidentUnnote(env, b, t = Date.now()) {
  const D = await statusTable(env), { x } = await incident(D, b?.id), at = Number(b?.at);
  const u = x.updates.find((v) => v.at === at && v.by === "owner");
  if (!u || t - at > 10 * MIN) throw new HttpError(400, "That update can’t be taken back now.");
  x.updates = x.updates.filter((v) => v !== u);
  if (u.k === "Resolved" && x.ended === at) x.ended = null;
  await save(D, x, ["updates", "ended"]).run();
  await forgetStatus(env);
  return { ok: true };
}
// What it affects, changed while it's open (none: everything)
const KNOWN = new Set([...STATUS_SERVICES, ...STATUS_JOBS, ...STATUS_DEPS].map((s) => s.id).concat(["db"]));
export async function incidentAffects(env, b) {
  const D = await statusTable(env), { x } = await incident(D, b?.id);
  if (x.ended) throw new HttpError(400, "It’s over: what it affected stays as it was.");
  x.svcs = [...new Set((Array.isArray(b?.svcs) ? b.svcs : []).filter((s) => typeof s === "string" && KNOWN.has(s)))].slice(0, 20);
  await save(D, x, ["svcs"]).run();
  await forgetStatus(env);
  return { ok: true, svcs: x.svcs, names: x.svcs.map(nameOf) };
}

// ---- a deploy, as the site's workflow says after each one (and warms the Worker up as it asks) ----
export async function recordDeploy(env, b, t = Date.now()) {
  const D = await statusTable(env), what = words(b?.what, 40) || "The site", version = words(b?.version, 40) || null, note = words(b?.note, 120) || null;
  await D.prepare("INSERT OR IGNORE INTO status_deploys (id, at, what, version, note) VALUES (?, ?, ?, ?, ?)").bind(`d${what}${version || t}`, t, what, version, note).run();
  return { ok: true, at: t };
}

// (how many things need you, for Admin's row and its alert: incidents going on, and codes seen in the last day that
// aren't fixed or muted (or are fixed, and seen since); none where the tables aren't there yet)
export async function deskNeeds(env, t = Date.now()) {
  try {
    const D = await statusTable(env);
    const r = await D.prepare(`SELECT (SELECT COUNT(*) FROM status_incidents WHERE ended IS NULL) +
      (SELECT COUNT(DISTINCT b.code) FROM pg_bugs b LEFT JOIN desk_codes d ON d.code = b.code WHERE b.at > ?1 AND b.app != 'fitting'
        AND (d.code IS NULL OR (d.state = 'fixed' AND b.at > d.at) OR (d.state = 'muted' AND d.until <= ?2))) AS n`).bind(t - DAY, t).first();
    return r?.n ?? 0;
  } catch (_) { return null; }
}
