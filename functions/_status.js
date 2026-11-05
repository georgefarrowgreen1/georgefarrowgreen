// status.inflite.ai: whether each of InFlite's apps, its sign-in, its scheduled jobs, what they rely on outside InFlite
// and the home page are working, for anyone to see. Every five minutes the ticker (workers/ticker) asks for each address
// as a phone would and runs each job, then hands what it found to the site here (POST /api/status/report, at the site's
// workers.dev address with the jobs' key). Here it's checked again from inside: Today's, Mail's and the home page's
// Workers over the direct links (service bindings), so a bot check in the ticker's way never reads as an outage; the
// database and storage; and what the apps rely on (the weather provider, market prices, Garmin Connect, email sending).
// Then kept:
//   status_checks   each address's check, two days of them (the open row's 24 hours)
//   status_days     a count per address per day (UK days): checks, slow ones, failed ones (the 90 days of bars)
//   status_now      each address's, job's and outside service's latest, and how many in a row have failed or been fine
//   status_incidents  opened by itself after two failed checks in a row (one incident for what fails together), closed
//                   after two fine ones (kind auto); started from Admin (manual), closed from there; opened by a burst of
//                   one bug code (burst), closed after an hour without it. Kept 120 days
//   status_maint    maintenance planned from Admin: announced on the page; while it lasts, what it covers failing opens
//                   nothing and doesn't count against its uptime
// The owner's told when an incident opens or closes by itself (a notification on their phone, and email), whatever the
// hour (status_alerts, Admin). The apps' shared menu asks /api/status-banner?app=… for a banner while one affects them.
// The page (status/, served at the address's root) reads GET /api/status, an open row GET /api/status/day?svc=…, and
// there's an incident feed (/feed.xml). Nothing of anyone's is in any of it: addresses, times, versions, bug codes.
//   statusRoute(ctx, url) → the answer for /api/status*, /api/status-banner, or null for anything else
//   isStatus(url, env), statusHost(ctx, url): the address and its page
import { HttpError, db, pace, clientIp, fromB64url } from "./_pigeon.js";
import { appsSite, homeSite, tickHost, siteFetch, appOrigin } from "./_sites.js";
import { tickAuthOk, pushTo, pushToSub, pushEndpointOk, vapid } from "./_notify.js";
import { emailReady, sendEmail, emailBody } from "./_email.js";
import { buildOf } from "./_version.js";
import { assets } from "./_min.js";
import { notFound } from "./_app.js";
import { STATUS_SERVICES, STATUS_JOBS, STATUS_DEPS, APP_JOB, APP_SVCS } from "./_statuslist.js";

export const STATUS_HOST = "status.inflite.ai";
// (STATUS_HOST in the environment: tests, on their own names; else status. on the apps' site)
const statusHostOf = (env) => env?.STATUS_HOST || `status.${appsSite(env)}`;
export const isStatus = (url, env) => url.hostname === statusHostOf(env);
// (the page's answers kept at the edge under one address whatever port or scheme they were asked at, so a change from
// Admin can let go of the same copy)
const cacheKey = (env, path) => new Request(`https://${statusHostOf(env)}${path}`);

const S = { ok: 0, warn: 1, down: 2, none: 3 }, NAME = ["ok", "warn", "down", "none"];
const SVC = Object.fromEntries(STATUS_SERVICES.map((s) => [s.id, s])), JOB = Object.fromEntries(STATUS_JOBS.map((j) => [j.id, j]));
const DEP = Object.fromEntries(STATUS_DEPS.map((d) => [d.id, d]));
const OTHER = { db: "Database and storage" };
const nameOf = (id) => SVC[id]?.name || JOB[id]?.name || DEP[id]?.name || OTHER[id] || id;
const known = (id) => !!(SVC[id] || JOB[id] || DEP[id] || OTHER[id]);
const ORDER = [...STATUS_SERVICES, ...STATUS_JOBS, ...STATUS_DEPS].map((x) => x.id).concat(["db"]), byOrder = (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b);
const MIN = 60e3, DAY_MS = 864e5;
// (a day as the UK has it: "2026-11-05")
const ukDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayOf = (t) => ukDay.format(t);
const ukTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
// (the last n UK days, oldest first)
export function lastDays(t, n = 90) {
  const out = new Set();
  for (let i = n + 1; i >= 0; i--) out.add(dayOf(t - i * DAY_MS));
  return [...out].slice(-n);
}
// (a day's bar: down for half an hour or more of failed checks (or half its checks), slow or briefly down, or fine)
export function dayState(r) {
  if (!r || !r.n) return null;
  return { s: r.down >= 6 || r.down * 2 >= r.n ? "down" : r.down > 0 || r.slow >= 6 ? "warn" : "ok", up: Math.round(((r.n - r.down) / r.n) * 10000) / 100 };
}
// (a list of names, "Chat, Weather and Mail")
const and = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const words = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

let ready = null;
const table = (env) => (ready ||= db(env).then(async (D) => {
  await D.batch([
    D.prepare("CREATE TABLE IF NOT EXISTS status_checks (svc TEXT NOT NULL, at INTEGER NOT NULL, s INTEGER NOT NULL, ms INTEGER, PRIMARY KEY (svc, at))"),
    D.prepare("CREATE INDEX IF NOT EXISTS status_checks_at ON status_checks(at)"),
    D.prepare("CREATE TABLE IF NOT EXISTS status_days (day TEXT NOT NULL, svc TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, slow INTEGER NOT NULL DEFAULT 0, down INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, svc))"),
    D.prepare("CREATE TABLE IF NOT EXISTS status_now (svc TEXT PRIMARY KEY, s INTEGER NOT NULL, ms INTEGER, version TEXT, why TEXT, at INTEGER NOT NULL, bad INTEGER NOT NULL DEFAULT 0, good INTEGER NOT NULL DEFAULT 0)"),
    D.prepare("CREATE TABLE IF NOT EXISTS status_incidents (id TEXT PRIMARY KEY, title TEXT NOT NULL, svcs TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER, updates TEXT NOT NULL)"),
    D.prepare("CREATE INDEX IF NOT EXISTS status_incidents_started ON status_incidents(started)"),
    D.prepare("CREATE TABLE IF NOT EXISTS status_maint (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT, svcs TEXT NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL, created INTEGER NOT NULL, cancelled INTEGER)"),
    // (each deploy: the site's Worker as its workflow says (recordDeploy), and any app whose version the checks see change)
    D.prepare("CREATE TABLE IF NOT EXISTS status_deploys (id TEXT PRIMARY KEY, at INTEGER NOT NULL, what TEXT NOT NULL, version TEXT, note TEXT)"),
    D.prepare("CREATE INDEX IF NOT EXISTS status_deploys_at ON status_deploys(at)"),
    // (the Incident Desk's word on a bug code: fixed (at, and it's back if it's seen after), or muted until a time)
    D.prepare("CREATE TABLE IF NOT EXISTS desk_codes (code TEXT PRIMARY KEY, state TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER)"),
    // (anyone's device asking to be told, no account: which apps, whether maintenance too)
    D.prepare("CREATE TABLE IF NOT EXISTS status_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, apps TEXT NOT NULL, maint INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)"),
  ]);
  // (what kind of incident, and a burst's bug code: added to a table made before them; and the Incident Desk's: whether it
  // was a real outage (null: not said), the uptime taken back for one that wasn't, the write-up, the owner's own notes)
  for (const col of ["kind TEXT", "code TEXT", "outage INTEGER", "fixup TEXT", "writeup TEXT", "notes TEXT"]) await D.prepare(`ALTER TABLE status_incidents ADD COLUMN ${col}`).run().catch(() => {});
  return D;
}).catch((e) => { ready = null; throw e; }));

// ---- the owner's say: how they're told, and whether a burst of one bug code opens an incident (Admin) ----
const PREFS = { push: true, email: true, burst: true };
export async function alertPrefs(env) {
  try { const r = await (await db(env)).prepare("SELECT v FROM pg_meta WHERE k = 'status_alerts'").first(); return { ...PREFS, ...(r?.v ? JSON.parse(r.v) : {}) }; }
  catch (_) { return { ...PREFS }; }
}
export async function setAlertPrefs(env, b) {
  const p = await alertPrefs(env);
  for (const k of Object.keys(PREFS)) if (typeof b?.[k] === "boolean") p[k] = b[k];
  await (await db(env)).prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('status_alerts', ?)").bind(JSON.stringify(p)).run();
  return p;
}
// The owner's email about an incident (from "InFlite Status", status@): opened, what and since when, and the Incident
// Desk's own page for it; closed, how long it lasted and a nudge to write it up
export function incidentMail(env, e) {
  const desk = `${appOrigin("account", env)}/#admin=incident:${encodeURIComponent(e.id)}`, names = and((e.svcs || []).map(nameOf).filter(Boolean));
  const hm = (t) => ukHM.format(t), up = e.title.replace(/ not (answering|running|working)$/, "");
  const { text, html } = e.open
    ? emailBody({ brand: "status", icon: "warn-red", title: e.byHand ? `You started: ${e.title}` : e.title, preheader: `Since ${hm(e.started)}. ${e.text}`,
      notice: { tone: "red", lead: `Since ${hm(e.started)}.`, text: e.text },
      lines: [e.byHand ? "It’s on the status page now, with what you wrote." : "It’s on the status page as an incident. Add the first update, so people know you’re on it."],
      rows: [...(names ? [["What", names, "grid"]] : []), ["Status page", e.byHand ? "Posted" : "Investigating", "link"]], button: { label: "Open in Incident Desk", url: desk } })
    : emailBody({ brand: "status", icon: "check", title: `${up} working again`, preheader: e.text,
      lines: [e.text, "Add a short write-up while it’s fresh: what went wrong, and what’s changed."],
      rows: [["Down for", lasted(e.ended - e.started), "clock"], ["From", `${hm(e.started)} to ${hm(e.ended)}`, "clock"], ["Updates posted", String(e.said || 0), "star"]],
      button: { label: "Write it up", url: desk } });
  return { subject: e.open ? `Down: ${e.title}` : `Resolved: ${up} (down ${lasted(e.ended - e.started)})`, text, html };
}
// (an incident opened or closed: a notification on the owner's phone and an email, whatever the hour; never stops what's kept)
async function tell(env, events) {
  if (!events.length) return;
  try {
    const p = await alertPrefs(env), D = await db(env);
    const admin = p.push ? (await D.prepare("SELECT v FROM pg_meta WHERE k = 'admin_user'").first().catch(() => null))?.v : null;
    const to = p.email && emailReady(env) ? env.PIGEON_ADMIN_EMAIL || env.CONTACT_TO : null, page = `https://${statusHostOf(env)}/`;
    await Promise.allSettled(events.flatMap((e) => [
      // (tapped: straight to that incident on the Incident Desk, account/admin.js open)
      admin && pushTo(env, admin, { title: e.title, body: e.text, tag: `status-${e.id}`, url: `${appOrigin("account", env)}/#admin=incident:${encodeURIComponent(e.id)}`, app: "account", urgency: "high" }),
      to && sendEmail(env, { brand: "status", to, ...incidentMail(env, e) }),
      tellSubscribers(env, { svcs: e.svcs || [], title: e.open ? e.title : `${e.title.replace(/ not (answering|running|working)$/, "")}: working again`, body: e.text, id: e.id }),
    ].filter(Boolean)));
  } catch (e) { console.error("status tell", e && e.message); }
}

// ---- from inside: the other Workers over the direct links, the database and storage, and what the apps rely on ----
const verOf = (j) => { const v = (x) => (typeof x === "string" && /^\d{1,3}\.\d{2}$/.test(x) ? x : null); return v(j?.app) || v(j?.build); };
async function timed(fn) {
  const t0 = Date.now();
  try { const r = await fn(); return { ms: Date.now() - t0, ...r }; } catch (e) { return { s: "down", ms: null, why: e?.name === "TimeoutError" ? "no answer" : "unreachable" }; }
}
async function inside(env) {
  const out = {}, site = appsSite(env);
  const linked = async (id, link, url) => {
    if (typeof link?.fetch !== "function") return;
    out[id] = await timed(async () => {
      const r = await siteFetch(env, url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }, link);
      return r.ok ? { s: "ok", version: verOf(await r.json().catch(() => null)) } : { s: "down", why: `HTTP ${r.status}` };
    });
    if (out[id].s === "down") out[id].ms = null;
  };
  await Promise.all([
    linked("today", env.TODAY_APP, `https://${site}/version`),
    linked("mail", env.MAIL_APP, `https://email.${site}/version`),
    linked("home", env.GFG_APP, `https://${homeSite(env)}/`),
    ...STATUS_SERVICES.filter((s) => s.app).map(async (s) => {
      const version = env.ASSETS ? await buildOf({ env }, new URL(`https://${s.address}/`), s.app).catch(() => null) : null;
      out[s.id] = { s: "ok", ms: null, version };
    }),
  ]);
  return out;
}
// (the database answering a read, and storage (the site's KV) answering one)
async function storeCheck(env) {
  return timed(async () => {
    await (await db(env)).prepare("SELECT 1").first();
    if (env.BIO_KV) await env.BIO_KV.get("site:schema_fp");
    return { s: "ok" };
  });
}
// (what the apps rely on: each asked for something small, eight seconds; none where the site has no way to ask (tests))
async function depChecks(env) {
  if (env.STATUS_DEPS === "0") return {};
  const get = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  const slow = (r) => ({ ...r, s: r.s === "ok" && r.ms > 4000 ? "warn" : r.s });
  const [wx, px, gm] = await Promise.all([
    timed(async () => { const r = await get(`${env.WEATHER_URL || "https://api.open-meteo.com"}/v1/forecast?latitude=52.63&longitude=1.30&current=temperature_2m`); return r.ok ? { s: "ok" } : { s: "down", why: `HTTP ${r.status}` }; }),
    timed(async () => { const r = await get(`${String(env.MARKETS_DATA || "https://query1.finance.yahoo.com").replace(/\/$/, "")}/v8/finance/chart/%5EFTSE?range=1d&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; InFliteStatus/1.0; +https://status.inflite.ai)", Accept: "application/json" } }); return r.ok ? { s: "ok" } : { s: "down", why: `HTTP ${r.status}` }; }),
    // (Garmin's: any answer but a server error is it there; it asks for a sign-in for anything more)
    timed(async () => { const r = await get(`${String(env.GARMIN_API || "https://personal.connectapi.garmin.com").replace(/\/$/, "")}/`); await r.body?.cancel(); return r.status < 500 ? { s: "ok" } : { s: "down", why: `HTTP ${r.status}` }; }),
  ]);
  // (email: how the site's own sending has gone lately, as it keeps it (functions/_email.js: two failures in a row is failing))
  let em = { s: "none", ms: null };
  if (emailReady(env)) {
    try {
      const r = await (await db(env)).prepare("SELECT v FROM pg_meta WHERE k = 'mail_fail'").first();
      const f = r?.v ? JSON.parse(r.v) : null;
      em = f?.n >= 2 ? { s: "down", ms: null, why: "sending failed" } : { s: "ok", ms: null };
    } catch (_) { em = { s: "none", ms: null }; }
  }
  return { "dep-weather": slow(wx), "dep-prices": slow(px), "dep-garmin": slow(gm), "dep-email": em };
}
// (maintenance planned and going on now: what it covers (none named: everything))
async function maintNow(D, t) {
  const { results } = await D.prepare("SELECT * FROM status_maint WHERE cancelled IS NULL AND starts <= ? AND ends > ?").bind(t, t).all();
  return (results || []).map((m) => ({ ...m, svcs: JSON.parse(m.svcs || "[]") }));
}
const covers = (maint, id) => maint.some((m) => !m.svcs.length || m.svcs.includes(id));

// ---- what the ticker found: kept, and incidents opened and closed by it ----
export async function keepReport(env, body, t = Date.now()) {
  const D = await table(env), at = Math.floor(t / MIN) * MIN;
  const prev = Object.fromEntries(((await D.prepare("SELECT * FROM status_now").all()).results || []).map((r) => [r.svc, r]));
  // (the same report twice, a retry: kept once)
  if (STATUS_SERVICES.some((s) => prev[s.id]?.at >= at)) return { kept: false };
  const given = new Map((Array.isArray(body?.checks) ? body.checks : []).filter((c) => c && SVC[c.id]).map((c) => [c.id, c]));
  const ran = new Map((Array.isArray(body?.jobs) ? body.jobs : []).filter((j) => j && typeof j.path === "string").map((j) => [j.path, j]));
  const [inner, store, deps, maint] = await Promise.all([inside(env), storeCheck(env), depChecks(env), maintNow(D, t)]);
  const rows = [];
  for (const svc of STATUS_SERVICES) {
    const o = given.get(svc.id), i = inner[svc.id];
    let s = Object.hasOwn(S, o?.s) ? o.s : "none", ms = s !== "none" && Number.isFinite(o?.ms) ? Math.round(o.ms) : null, why = s === "none" ? null : o?.why || null;
    // (failing from inside is failing; where the outside couldn't tell (a bot check, or nothing said), the inside's word)
    if (i?.s === "down") { s = "down"; why = why || i.why || null; }
    else if (s === "none" && i) { s = i.s; ms = i.ms; }
    if (s === "down") ms = null;
    const version = (typeof o?.version === "string" && /^\d{1,3}\.\d{2}$/.test(o.version) ? o.version : null) || i?.version || null;
    rows.push({ svc: svc.id, s, ms, version, why: typeof why === "string" ? why.slice(0, 40) : null, check: true });
  }
  for (const job of STATUS_JOBS) {
    const j = ran.get(job.path);
    if (!j) continue;
    rows.push({ svc: job.id, s: j.ok ? "ok" : "down", ms: Number.isFinite(j.ms) ? Math.round(j.ms) : null, version: null, why: null, check: false });
  }
  rows.push({ svc: "db", s: store.s || "ok", ms: store.ms ?? null, version: null, why: store.why || null, check: false });
  for (const [id, d] of Object.entries(deps)) rows.push({ svc: id, s: d.s || "ok", ms: d.ms ?? null, version: null, why: d.why || null, check: false });
  const day = dayOf(t), writes = [];
  for (const r of rows) {
    const p = prev[r.svc] || { bad: 0, good: 0 };
    // (an app on a new version since the last check: deployed, as far as the Desk's told)
    if (r.version && p.version && r.version !== p.version) writes.push(D.prepare("INSERT OR IGNORE INTO status_deploys (id, at, what, version, note) VALUES (?, ?, ?, ?, NULL)").bind(`v${r.svc}${r.version}`, at, nameOf(r.svc), r.version));
    r.bad = r.s === "down" ? p.bad + 1 : r.s === "none" ? p.bad : 0;
    r.good = r.s === "ok" || r.s === "warn" ? p.good + 1 : r.s === "none" ? p.good : 0;
    r.maint = covers(maint, r.svc);
    writes.push(D.prepare("INSERT OR REPLACE INTO status_now (svc, s, ms, version, why, at, bad, good) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(r.svc, S[r.s], r.ms, r.version, r.why, at, r.bad, r.good));
    if (!r.check) continue;
    writes.push(D.prepare("INSERT OR REPLACE INTO status_checks (svc, at, s, ms) VALUES (?, ?, ?, ?)").bind(r.svc, at, S[r.s], r.ms));
    // (planned maintenance doesn't count against uptime: a check it covers that failed isn't counted)
    if (r.s !== "none" && !(r.maint && r.s === "down")) writes.push(D.prepare("INSERT INTO status_days (day, svc, n, slow, down) VALUES (?, ?, 1, ?, ?) ON CONFLICT(day, svc) DO UPDATE SET n = n + 1, slow = slow + excluded.slow, down = down + excluded.down")
      .bind(day, r.svc, r.s === "warn" ? 1 : 0, r.s === "down" ? 1 : 0));
  }
  writes.push(D.prepare("DELETE FROM status_checks WHERE at < ?").bind(t - 2 * DAY_MS));
  writes.push(D.prepare("DELETE FROM status_days WHERE day < ?").bind(dayOf(t - 120 * DAY_MS)));
  writes.push(D.prepare("DELETE FROM status_incidents WHERE ended IS NOT NULL AND ended < ?").bind(t - 120 * DAY_MS));
  writes.push(D.prepare("DELETE FROM status_maint WHERE ends < ?").bind(t - 30 * DAY_MS));
  writes.push(D.prepare("DELETE FROM status_deploys WHERE at < ?").bind(t - 30 * DAY_MS));
  writes.push(D.prepare("DELETE FROM desk_codes WHERE at < ? AND (until IS NULL OR until < ?)").bind(t - 30 * DAY_MS, t));
  const { writes: incs, events } = await incidents(D, rows, t);
  writes.push(...incs);
  await D.batch(writes);
  if (events.length) await forget(env);
  await tell(env, events);
  return { kept: true, rows: rows.length, told: events.length };
}

// Incidents, by themselves: two failed checks in a row opens one (or joins one opened in the last quarter of an hour,
// as what fails together is one thing); two fine ones in a row for everything in it closes it. What planned maintenance
// covers opens nothing. Started from Admin, they're closed from there; a burst, after an hour without its code
async function incidents(D, rows, t) {
  const open = ((await D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL ORDER BY started DESC").all()).results || [])
    .map((x) => ({ ...x, svcs: JSON.parse(x.svcs || "[]"), updates: JSON.parse(x.updates || "[]"), changed: false }));
  const auto = open.filter((x) => !x.kind || x.kind === "auto");
  const by = Object.fromEntries(rows.map((r) => [r.svc, r])), inOpen = new Set(auto.flatMap((x) => x.svcs)), events = [];
  for (const r of rows) {
    if (r.bad < 2 || inOpen.has(r.svc) || r.maint) continue;
    const what = JOB[r.svc] ? "isn’t running" : "isn’t answering";
    let x = auto.find((o) => t - o.started < 15 * MIN);
    if (x) { x.svcs.push(r.svc); x.updates.unshift({ at: t, k: "Update", w: `${nameOf(r.svc)} ${what} either.` }); x.changed = true; }
    else {
      x = { id: `i${t.toString(36)}${r.svc}`, kind: "auto", svcs: [r.svc], started: t - 5 * MIN, ended: null, updates: [{ at: t, k: "Spotted", w: `${nameOf(r.svc)} ${what}: two checks in a row failed${r.why ? ` (${r.why})` : ""}.` }], changed: true, fresh: true };
      auto.unshift(x); open.unshift(x);
    }
    inOpen.add(r.svc);
  }
  // (a burst's code quiet for an hour: closed)
  const bursts = open.filter((x) => x.kind === "burst" && x.code);
  if (bursts.length) {
    const lastOf = Object.fromEntries(await Promise.all(bursts.map(async (x) => [x.id, (await D.prepare("SELECT MAX(at) AS at FROM pg_bugs WHERE code = ?").bind(x.code).first().catch(() => null))?.at || 0])));
    for (const x of bursts) if (t - Math.max(lastOf[x.id], x.started) > 60 * MIN) { x.ended = t; x.updates.unshift({ at: t, k: "Resolved", w: "No more reports of it for an hour." }); x.changed = true; x.closedNow = true; }
  }
  const out = [];
  for (const x of open) {
    if (!x.kind || x.kind === "auto") {
      x.svcs.sort(byOrder);
      const allJobs = x.svcs.every((id) => JOB[id]), allSvcs = x.svcs.every((id) => !JOB[id]);
      x.title = `${and(x.svcs.map(nameOf))} ${allJobs ? "not running" : allSvcs ? "not answering" : "not working"}`;
      if (x.svcs.every((id) => (!by[id] ? !known(id) : by[id].good >= 2))) {
        x.ended = t; x.updates.unshift({ at: t, k: "Resolved", w: x.svcs.length > 1 ? "Everything is working again." : `${nameOf(x.svcs[0])} is working again.` }); x.changed = true; x.closedNow = true;
      }
    }
    if (x.fresh) events.push({ open: true, id: x.id, title: x.title, svcs: x.svcs, text: x.updates[x.updates.length - 1].w, started: x.started });
    else if (x.closedNow) events.push({ open: false, id: x.id, title: x.title, svcs: x.svcs, text: `${x.updates[0].w} It lasted ${lasted(t - x.started)}.`, started: x.started, ended: t,
      said: x.updates.filter((u) => u.by === "owner").length });
    if (x.changed) out.push(put(D, x));
  }
  return { writes: out, events };
}
const lasted = (ms) => { const m = Math.max(1, Math.round(ms / MIN)); return m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : `${Math.floor(m / 60)} h ${m % 60} min`; };
// (written over in place, so what the Desk keeps on it (outage, write-up, notes) stays)
const put = (D, x) => D.prepare(`INSERT INTO status_incidents (id, title, svcs, started, ended, updates, kind, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, svcs = excluded.svcs, started = excluded.started, ended = excluded.ended, updates = excluded.updates, kind = excluded.kind, code = excluded.code`)
  .bind(x.id, x.title, JSON.stringify(x.svcs), x.started, x.ended ?? null, JSON.stringify(x.updates.slice(0, 40)), x.kind || "auto", x.code || null);
// (the page's copies at this edge, and every app's banner, let go of: so a change shows at once here, elsewhere within a minute)
const forget = async (env) => {
  const paths = ["/api/status", "/feed.xml", ...["hub", ...Object.keys(APP_SVCS)].map((a) => `/api/status-banner?app=${a}`)];
  await Promise.all(paths.map((p) => globalThis.caches?.default?.delete(cacheKey(env, p))?.catch?.(() => {})));
};

// A burst of one bug code (functions/_bugs.js calls this for each report kept): five in ten minutes opens an incident,
// where the owner has it on, and tells them
const BUG_SVC = { chat: "chat", chats: "chat", weather: "weather", fitness: "fitness", markets: "markets", finance: "markets", mail: "mail", email: "mail", account: "account", auth: "auth", today: "today", hub: "today", home: "home" };
export async function burstCheck(env, code, app, t = Date.now()) {
  if (!/^IF-[A-Z]-[0-9A-Z]{4,6}$/.test(String(code || ""))) return null;
  const D = await table(env);
  const n = (await D.prepare("SELECT COUNT(*) AS n FROM pg_bugs WHERE code = ? AND at > ?").bind(code, t - 10 * MIN).first())?.n || 0;
  if (n < 5 || !(await alertPrefs(env)).burst) return null;
  if (await D.prepare("SELECT 1 FROM status_incidents WHERE code = ? AND ended IS NULL").bind(code).first()) return null;
  const svc = BUG_SVC[app], x = { id: `b${t.toString(36)}`, kind: "burst", code, svcs: svc ? [svc] : [], started: t - 10 * MIN, ended: null,
    title: `${svc ? nameOf(svc) : "The site"}: the same error over and over`, updates: [{ at: t, k: "Spotted", w: `${n} reports of the same error (${code}) in ten minutes.` }] };
  await put(D, x).run();
  await forget(env);
  await tell(env, [{ open: true, id: x.id, title: x.title, svcs: x.svcs, text: x.updates[0].w, started: x.started, byHand: true }]);
  return x.id;
}

// ---- for the page ----
export async function summary(env, t = Date.now()) {
  const D = await table(env), days = lastDays(t);
  const [now, counts, incs, mts] = await Promise.all([
    D.prepare("SELECT * FROM status_now").all(),
    D.prepare("SELECT * FROM status_days WHERE day >= ?").bind(days[0]).all(),
    D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL OR started >= ? ORDER BY started DESC LIMIT 10").bind(t - 90 * DAY_MS).all(),
    D.prepare("SELECT * FROM status_maint WHERE cancelled IS NULL AND ends > ? AND starts < ? ORDER BY starts LIMIT 5").bind(t, t + 14 * DAY_MS).all(),
  ]);
  const latest = Object.fromEntries((now.results || []).map((r) => [r.svc, r]));
  const st = (id) => (latest[id] ? NAME[latest[id].s] : "none");
  const perDay = {};
  for (const r of counts.results || []) (perDay[r.svc] ||= {})[r.day] = r;
  const at = Math.max(0, ...STATUS_SERVICES.map((s) => latest[s.id]?.at || 0)) || null;
  const services = STATUS_SERVICES.map((s) => {
    const l = latest[s.id], d = perDay[s.id] || {};
    let n = 0, down = 0;
    for (const r of Object.values(d)) { n += r.n; down += r.down; }
    // (its checks: it answers; where its data is the site's, the database and storage; its job; what it relies on)
    const checks = [{ k: "Answers", s: st(s.id), ms: l?.ms ?? null, why: l?.why || null }];
    if (s.app || s.id === "today") checks.push({ k: nameOf("db"), s: st("db"), ms: latest.db?.ms ?? null });
    if (APP_JOB[s.id]) checks.push({ k: nameOf(APP_JOB[s.id]), s: st(APP_JOB[s.id]), at: latest[APP_JOB[s.id]]?.at || null });
    for (const dep of STATUS_DEPS.filter((x) => x.for.includes(s.id))) if (latest[dep.id]) checks.push({ k: dep.name, s: st(dep.id), ms: latest[dep.id].ms ?? null });
    return { id: s.id, name: s.name, group: s.group, address: s.address, s: st(s.id), ms: l?.ms ?? null, version: l?.version || null, why: l?.why || null,
      at: l?.at || null, up90: n ? Math.round(((n - down) / n) * 10000) / 100 : null, days: days.map((k) => { const x = dayState(d[k]); return x && { ...x, n: d[k].n, slow: d[k].slow, down: d[k].down }; }), checks };
  });
  const jobs = STATUS_JOBS.map((j) => { const l = latest[j.id]; return { id: j.id, name: j.name, s: st(j.id), at: l?.at || null, ms: l?.ms ?? null }; });
  const deps = STATUS_DEPS.map((d) => { const l = latest[d.id]; return { id: d.id, name: d.name, s: st(d.id), at: l?.at || null, ms: l?.ms ?? null, why: l?.why || null }; }).filter((d) => d.at);
  const maint = (mts.results || []).map((m) => ({ id: m.id, title: m.title, text: m.text || "", svcs: JSON.parse(m.svcs || "[]"), starts: m.starts, ends: m.ends }));
  const list = (incs.results || []).map((x) => ({ id: x.id, kind: x.kind || "auto", title: x.title, svcs: JSON.parse(x.svcs || "[]"), started: x.started, ended: x.ended, updates: JSON.parse(x.updates || "[]"), codes: x.code ? [x.code] : [],
    ...(x.outage === 0 ? { notOutage: true } : {}) }));
  // (the bug codes of the week, and the site's own server errors' codes during each incident: codes alone, no words)
  let bugs = [];
  try {
    // (each with where it stands, as the Incident Desk has it: new, fixed, back again since it was fixed, or known
    // (muted there); and its name in words where it's the site's own (functions/_desk.js titleOf), never anyone's words)
    const week = await D.prepare(`SELECT b.code, b.app, MIN(b.kind) AS kind, COUNT(*) AS n, MIN(b.at) AS first, MAX(b.at) AS last, MAX(b.issue) AS issue, d.state, d.at AS said_at, d.until
      FROM pg_bugs b LEFT JOIN desk_codes d ON d.code = b.code WHERE b.at >= ? AND b.app != 'fitting' GROUP BY b.code, b.app ORDER BY MAX(b.at) DESC LIMIT 8`).bind(t - 7 * DAY_MS).all();
    bugs = await Promise.all((week.results || []).map(async (b) => ({ ...(await bugItem(b, t)), filed: !!b.issue })));
    if (list.length) {
      const from = Math.min(...list.map((x) => x.started));
      const srv = await D.prepare("SELECT DISTINCT code, at FROM pg_bugs WHERE app = 'server' AND at >= ? ORDER BY at LIMIT 500").bind(from).all();
      for (const x of list) if (!x.codes.length) x.codes = [...new Set((srv.results || []).filter((b) => b.at >= x.started && b.at <= (x.ended || t)).map((b) => b.code))].slice(0, 3);
    }
  } catch (_) {}
  // (the days, and the first any address was checked on: the page shows bars only from then)
  const first = Math.min(...services.map((x) => x.days.findIndex(Boolean)).filter((i) => i >= 0));
  return { at, every: 5, services, jobs, deps, maint, incidents: list, bugs, outside: latest.outside?.at || null, dayKeys: days, since: Number.isFinite(first) ? days[first] : null };
}
export async function dayOfChecks(env, svc, t = Date.now()) {
  if (!SVC[svc]) throw new HttpError(404, "Not found.");
  const D = await table(env);
  const { results } = await D.prepare("SELECT at, s, ms FROM status_checks WHERE svc = ? AND at >= ? ORDER BY at").bind(svc, t - DAY_MS).all();
  return { svc, from: t - DAY_MS, to: t, points: (results || []).map((r) => [r.at, NAME[r.s], r.ms]) };
}
// (an app's banner, for the shared menu: an incident going on, or maintenance going on, that touches it; the hub, any)
export async function bannerFor(env, app, t = Date.now()) {
  const scope = APP_SVCS[app] || null, D = await table(env);
  // (an incident naming nothing, at the hub alone; maintenance naming nothing covers everything)
  const hits = (svcs, all) => !scope || (all && !svcs.length) || svcs.some((s) => scope.includes(s) || s === "db");
  const { results } = await D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL ORDER BY started DESC LIMIT 10").all();
  const inc = (results || []).map((x) => ({ ...x, svcs: JSON.parse(x.svcs || "[]"), updates: JSON.parse(x.updates || "[]") })).find((x) => hits(x.svcs));
  const page = `https://${statusHostOf(env)}/`;
  if (inc) return { banner: { kind: "incident", id: inc.id, title: inc.title, text: inc.updates[0]?.w || "", since: inc.started, url: page } };
  const m = (await maintNow(D, t)).find((x) => hits(x.svcs, true));
  return { banner: m ? { kind: "maint", id: m.id, title: m.title, text: m.text || "", until: m.ends, url: page } : null };
}

// ---- Admin's (functions/api/pigeon admin/status…): the incidents, an update on one, one started by hand, maintenance,
// and how the owner's told ----
// (what kind of update: Resolved closes an incident that's still open; one the checks opened opens again if it's still failing)
export const NOTE_KINDS = ["Investigating", "Identified", "Update", "Monitoring", "Resolved"];
const json1 = (v, or) => { try { return v ? JSON.parse(v) : or; } catch (_) { return or; } };
export const parse = (x) => ({ id: x.id, kind: x.kind || "auto", title: x.title, svcs: json1(x.svcs, []), started: x.started, ended: x.ended, updates: json1(x.updates, []),
  code: x.code || null, outage: x.outage == null ? null : !!x.outage, writeup: json1(x.writeup, null), notes: json1(x.notes, []) });
// (what can be named as affected: every address, job and outside service, by name)
export const CATALOGUE = [...STATUS_SERVICES, ...STATUS_JOBS, ...STATUS_DEPS].map((x) => ({ id: x.id, name: x.name }));
export async function adminIncidents(env, t = Date.now()) {
  const D = await table(env);
  const { results } = await D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL OR started >= ? ORDER BY ended IS NOT NULL, started DESC LIMIT 12").bind(t - 30 * DAY_MS).all();
  return (results || []).map(parse);
}
export async function adminMaint(env, t = Date.now()) {
  const D = await table(env);
  const { results } = await D.prepare("SELECT * FROM status_maint WHERE cancelled IS NULL AND ends > ? ORDER BY starts LIMIT 12").bind(t).all();
  return (results || []).map((m) => ({ id: m.id, title: m.title, text: m.text || "", svcs: JSON.parse(m.svcs || "[]"), starts: m.starts, ends: m.ends }));
}
// (each scheduled job's latest, for Admin's Server: none where there's no table yet)
export async function jobsNow(env) {
  try {
    const D = await table(env), { results } = await D.prepare(`SELECT * FROM status_now WHERE svc IN (${STATUS_JOBS.map(() => "?").join(", ")})`).bind(...STATUS_JOBS.map((j) => j.id)).all();
    const by = Object.fromEntries((results || []).map((r) => [r.svc, r]));
    return STATUS_JOBS.map((j) => ({ id: j.id, name: j.name, s: by[j.id] ? NAME[by[j.id].s] : "none", at: by[j.id]?.at || null, ms: by[j.id]?.ms ?? null }));
  } catch (_) { return []; }
}
// (the open ones, for Admin's figures: none where there's no table yet)
export async function openIncidents(env) {
  try { const D = await table(env); return ((await D.prepare("SELECT id, title, started FROM status_incidents WHERE ended IS NULL ORDER BY started DESC LIMIT 5").all()).results || []); }
  catch (_) { return []; }
}
export const statusTable = (env) => table(env);
export { nameOf, forget as forgetStatus, S as STATE };
export async function noteIncident(env, b, t = Date.now()) {
  const kind = NOTE_KINDS.includes(b?.kind) ? b.kind : null, text = typeof b?.text === "string" ? b.text.replace(/\s+/g, " ").trim() : "";
  if (!kind) throw new HttpError(400, "Which kind of update is it?");
  if (!text) throw new HttpError(400, "Write what’s happening.");
  if (text.length > 600) throw new HttpError(400, "Keep it under 600 characters.");
  const D = await table(env), row = typeof b.id === "string" ? await D.prepare("SELECT * FROM status_incidents WHERE id = ?").bind(b.id).first() : null;
  if (!row) throw new HttpError(404, "That incident isn’t there any more.");
  const x = parse(row);
  x.updates.unshift({ at: t, k: kind, w: text, by: "owner" });
  if (kind === "Resolved" && !x.ended) x.ended = t;
  await D.prepare("UPDATE status_incidents SET ended = ?, updates = ? WHERE id = ?").bind(x.ended, JSON.stringify(x.updates.slice(0, 40)), x.id).run();
  // (the page's copy at this edge let go of, so it's there at once; elsewhere within half a minute)
  await forget(env);
  await tellSubscribers(env, { svcs: x.svcs, title: kind === "Resolved" ? `${x.title.replace(/ not (answering|running|working)$/, "")}: working again` : x.title, body: text, id: x.id });
  return x;
}
const svcsOf = (v) => [...new Set((Array.isArray(v) ? v : []).filter((id) => typeof id === "string" && known(id)))].sort(byOrder).slice(0, 20);
export async function startIncident(env, b, t = Date.now()) {
  const title = words(b?.title, 100), text = words(b?.text, 600), svcs = svcsOf(b?.svcs);
  if (title.length < 3) throw new HttpError(400, "Give it a title people will understand.");
  if (!text) throw new HttpError(400, "Write what’s happening.");
  const D = await table(env), x = { id: `m${t.toString(36)}`, kind: "manual", title, svcs, started: t, ended: null, updates: [{ at: t, k: "Investigating", w: text, by: "owner" }] };
  await put(D, x).run();
  await forget(env);
  await tellSubscribers(env, { svcs, title, body: text, id: x.id });
  return parse({ ...x, svcs: JSON.stringify(svcs), updates: JSON.stringify(x.updates) });
}
export async function planMaint(env, b, t = Date.now()) {
  const title = words(b?.title, 100), text = words(b?.text, 600), svcs = svcsOf(b?.svcs), starts = Number(b?.starts), ends = Number(b?.ends);
  if (title.length < 3) throw new HttpError(400, "Give it a title people will understand.");
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) throw new HttpError(400, "When does it start and end?");
  if (ends <= t) throw new HttpError(400, "That’s already over.");
  if (ends - starts > DAY_MS) throw new HttpError(400, "Keep it to a day at most.");
  if (starts > t + 60 * DAY_MS) throw new HttpError(400, "Plan it within the next two months.");
  const D = await table(env), id = `p${t.toString(36)}`;
  await D.prepare("INSERT INTO status_maint (id, title, text, svcs, starts, ends, created) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, title, text, JSON.stringify(svcs), Math.round(starts), Math.round(ends), t).run();
  await forget(env);
  await tellSubscribers(env, { svcs, maint: true, title: `Planned maintenance: ${title}`, body: `${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(starts)}, ${ukTime.format(starts)}–${ukTime.format(ends)}${text ? `. ${text}` : ""}`, id });
  return { id, title, text, svcs, starts: Math.round(starts), ends: Math.round(ends) };
}
export async function cancelMaint(env, id, t = Date.now()) {
  const D = await table(env), r = await D.prepare("UPDATE status_maint SET cancelled = ? WHERE id = ? AND cancelled IS NULL").bind(t, String(id || "")).run();
  if (!r.meta?.changes) throw new HttpError(404, "That maintenance isn’t there any more.");
  await forget(env);
  return { ok: true };
}
// (the ticker's outside check's word, from GitHub's servers every hour: that it looked, and what it saw)
export async function outsideSaw(env, t = Date.now()) {
  const D = await table(env);
  await D.prepare("INSERT OR REPLACE INTO status_now (svc, s, ms, version, why, at, bad, good) VALUES ('outside', 0, NULL, NULL, NULL, ?, 0, 0)").bind(t).run();
  const s = await summary(env, t);
  return { at: s.at, stale: !s.at || t - s.at > 20 * MIN, down: [...s.services, ...s.jobs, ...s.deps].filter((x) => x.s === "down").map((x) => x.name) };
}

// ---- for the page: a day's quarter-hours (each check is kept two days), a bug code looked up, and updates without an
// account (the browser's own push, for the apps chosen) ----
const ukHM = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export async function dayHours(env, svc, day, t = Date.now()) {
  if (!SVC[svc] || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) throw new HttpError(404, "Not found.");
  const D = await table(env);
  const { results } = await D.prepare("SELECT at, s, ms FROM status_checks WHERE svc = ? AND at >= ? AND at <= ? ORDER BY at").bind(svc, t - 2 * DAY_MS - DAY_MS, t).all();
  const pts = (results || []).filter((r) => dayOf(r.at) === day);
  if (!pts.length) return { svc, day, kept: false };
  const q = Array(96).fill("none"), rank = { none: -1, ok: 0, warn: 1, down: 2 }, ms = [];
  for (const r of pts) {
    const [h, m] = ukHM.format(r.at).split(":").map(Number), i = Math.min(95, h * 4 + Math.floor(m / 15)), st = NAME[r.s];
    if (st === "none") continue;
    if (rank[st] > rank[q[i]]) q[i] = st;
    if (r.ms != null) ms.push(r.ms);
  }
  ms.sort((a, b) => a - b);
  return { svc, day, kept: true, q, ms: ms.length ? ms[Math.floor(ms.length / 2)] : null };
}
const CODE_RE = /^IF-[A-Z]-[0-9A-Z]{4,6}$/;
export async function codeLookup(env, code, t = Date.now()) {
  const c = String(code || "").toUpperCase();
  if (!CODE_RE.test(c)) throw new HttpError(400, "That doesn’t look like a code.");
  const D = await table(env);
  const r = await D.prepare(`SELECT b.code, b.app, MIN(b.kind) AS kind, COUNT(*) AS n, MIN(b.at) AS first, MAX(b.at) AS last, d.state, d.at AS said_at, d.until
    FROM pg_bugs b LEFT JOIN desk_codes d ON d.code = b.code WHERE b.code = ? AND b.at >= ? GROUP BY b.code, b.app`).bind(c, t - 30 * DAY_MS).first().catch(() => null);
  if (!r) {
    const old = await D.prepare("SELECT MAX(at) AS at FROM pg_bugs WHERE code = ?").bind(c).first().catch(() => null);
    return { code: c, found: false, last: old?.at || null };
  }
  return { found: true, ...(await bugItem(r, t)) };
}
async function bugItem(b, t) {
  const { titleOf } = await import("./_desk.js");
  const state = b.state === "fixed" ? (b.last > b.said_at ? "back" : "fixed") : b.state === "muted" && b.until > t ? "known" : "new";
  return { code: b.code, app: b.app, n: b.n, first: b.first, last: b.last, state, fixedAt: b.state === "fixed" ? b.said_at : null, title: b.app === "server" ? titleOf("server", b.kind, "") : null };
}
// (what each subscribed app covers: its own address, its job, what it relies on)
const SUB_APPS = ["today", "chat", "weather", "fitness", "markets", "mail"];
const COVERS = { today: ["today", "morning", "dep-weather"], chat: ["chat", "notify"], weather: ["weather", "wxtick", "dep-weather"], fitness: ["fitness", "garmin", "dep-garmin"], markets: ["markets", "mkttick", "dep-prices"], mail: ["mail"] };
export async function statusSubscribe(env, b, ip, t = Date.now()) {
  await pace(env, `statsub:${ip}`, 20, 60 * MIN);
  const sub = b?.sub || {}, endpoint = String(sub.endpoint || ""), p256dh = String(sub.keys?.p256dh || ""), auth = String(sub.keys?.auth || "");
  if (!pushEndpointOk(endpoint) || endpoint.length > 1000) throw new HttpError(400, "This browser’s push service isn’t supported.");
  let ok = false; try { ok = fromB64url(p256dh).length === 65 && fromB64url(auth).length === 16; } catch (_) {}
  if (!ok) throw new HttpError(400, "That push subscription was malformed.");
  const apps = [...new Set((Array.isArray(b.apps) ? b.apps : []).filter((a) => SUB_APPS.includes(a)))];
  if (!apps.length) throw new HttpError(400, "Choose at least one app.");
  const D = await table(env);
  await D.prepare(`INSERT INTO status_subs (endpoint, p256dh, auth, apps, maint, created) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, apps = excluded.apps, maint = excluded.maint`).bind(endpoint, p256dh, auth, JSON.stringify(apps), b.maint ? 1 : 0, t).run();
  return { ok: true, apps, maint: !!b.maint };
}
export async function statusUnsubscribe(env, b) {
  const endpoint = String(b?.endpoint || "");
  if (!endpoint) throw new HttpError(400, "Which device?");
  await (await table(env)).prepare("DELETE FROM status_subs WHERE endpoint = ?").bind(endpoint).run();
  return { ok: true };
}
// (told: every device whose apps the incident touches (one naming nothing touches all), or that asked for maintenance;
// a device its push service says is gone, forgotten. Never stops what called it)
export async function tellSubscribers(env, { svcs = [], maint = false, title, body, id }) {
  try {
    const D = await table(env);
    const { results } = await D.prepare("SELECT endpoint, p256dh, auth, apps, maint FROM status_subs LIMIT 2000").all();
    const hit = (apps) => !svcs.length || apps.some((a) => (COVERS[a] || []).some((x) => svcs.includes(x)) || svcs.includes("db"));
    const to = (results || []).filter((r) => { const apps = JSON.parse(r.apps || "[]"); return maint ? r.maint && (hit(apps) || !svcs.length) : hit(apps); });
    const url = `https://${statusHostOf(env)}/#${encodeURIComponent(id || "")}`;
    await Promise.all(to.map(async (r) => {
      const res = await pushToSub(env, r, { title: String(title).slice(0, 120), body: String(body || "").slice(0, 240), tag: `status-${id}`, url, ttl: 6 * 3600 });
      if (res === "gone") await D.prepare("DELETE FROM status_subs WHERE endpoint = ?").bind(r.endpoint).run();
    }));
    return to.length;
  } catch (e) { console.error("status subscribers", e && e.message); return 0; }
}

// ---- the incident feed (Atom), for any news reader ----
const xml = (s) => String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
async function feed(env, t = Date.now()) {
  const s = await summary(env, t), page = `https://${statusHostOf(env)}/`, iso = (x) => new Date(x).toISOString();
  const items = s.incidents.map((x) => {
    const u = x.updates[0] || {}, when = u.at || x.started;
    return `<entry><id>${page}#${xml(x.id)}</id><title>${xml(`${x.ended ? "Resolved" : "Ongoing"}: ${x.title}`)}</title><updated>${iso(when)}</updated><link href="${page}"/>`
      + `<content type="text">${xml(x.updates.map((v) => `${ukTime.format(v.at)} ${v.k}. ${v.w}`).join("\n"))}</content></entry>`;
  }).join("");
  const updated = iso(Math.max(s.at || 0, ...s.incidents.map((x) => x.updates[0]?.at || x.started)) || t);
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>InFlite Status</title><id>${page}</id><link href="${page}"/><link rel="self" href="${page}feed.xml"/><updated>${updated}</updated>${items}</feed>`;
}

const json = (v, status = 200, cache = "no-store") => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" } });
// (the page's answers kept a little while at Cloudflare's edge, so however many are looking it's a read every so often)
async function cached(key, make, secs, wrap = (v) => json(v, 200, `public, max-age=${secs}`)) {
  const cache = globalThis.caches?.default;
  const hit = cache && (await cache.match(key).catch(() => null));
  if (hit) return hit;
  const res = wrap(await make());
  if (cache) await cache.put(key, res.clone()).catch(() => {});
  return res;
}

export async function statusRoute(ctx, url) {
  const p = url.pathname, env = ctx.env, req = ctx.request;
  try {
    // (an app's banner, at every address of this Worker's and asked for by Today's and Mail's: same-origin for each)
    if (p === "/api/status-banner" || p === "/api/account/status-banner") {
      if (req.method !== "GET") return json({ error: "Not found." }, 404);
      const app = String(url.searchParams.get("app") || "hub").slice(0, 20).replace(/[^a-z]/g, "") || "hub";
      // (kept a minute at the edge, never in the browser: a change shows the next time it's asked)
      return await cached(cacheKey(env, `/api/status-banner?app=${app}`), () => bannerFor(env, app), 60, (v) => json(v, 200, "public, max-age=0, s-maxage=60"));
    }
    if (!/^\/api\/status(\/day|\/report|\/outside|\/deploy|\/hours|\/code|\/push-key|\/subscribe|\/unsubscribe)?$/.test(p)) return null;
    if (p === "/api/status/report" || p === "/api/status/outside" || p === "/api/status/deploy") {
      if (!tickHost(url.hostname, env)) return null;
      if (req.method !== "POST") return json({ error: "Not found." }, 404);
      tickAuthOk(req, env);
      if (p === "/api/status/outside") return json({ ok: true, ...(await outsideSaw(env)) });
      // (a deploy, as the site's workflow says just after it: for the Incident Desk, functions/_desk.js)
      if (p === "/api/status/deploy") return json(await (await import("./_desk.js")).recordDeploy(env, await req.json().catch(() => ({}))));
      const raw = await req.text();
      if (raw.length > 32000) throw new HttpError(413, "Too long.");
      let body; try { body = JSON.parse(raw || "{}"); } catch (_) { throw new HttpError(400, "Not readable."); }
      return json({ ok: true, ...(await keepReport(env, body)) });
    }
    if (!isStatus(url, env)) return null;
    // (updates without an account: this device's subscription kept, or forgotten)
    if (p === "/api/status/subscribe" || p === "/api/status/unsubscribe") {
      if (req.method !== "POST") return json({ error: "Not found." }, 404);
      const b = await req.json().catch(() => ({}));
      return json(p === "/api/status/subscribe" ? await statusSubscribe(env, b, clientIp(req)) : await statusUnsubscribe(env, b));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Not found." }, 404);
    if (p === "/api/status") return await cached(cacheKey(env, "/api/status"), () => summary(env), 30);
    if (p === "/api/status/push-key") return json({ key: (await vapid(env)).pub });
    if (p === "/api/status/hours") { const svc = url.searchParams.get("svc") || "", day = url.searchParams.get("day") || ""; return await cached(cacheKey(env, `/api/status/hours?svc=${svc}&day=${day}`), () => dayHours(env, svc, day), 120); }
    if (p === "/api/status/code") return json(await codeLookup(env, url.searchParams.get("c")), 200, "public, max-age=30");
    const svc = url.searchParams.get("svc") || "";
    if (!SVC[svc]) return json({ error: "Not found." }, 404);
    return await cached(cacheKey(env, `/api/status/day?svc=${svc}`), () => dayOfChecks(env, svc), 60);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("status", e && (e.stack || e.message || e));
    return json({ error: "The status checks can’t be read just now." }, 500);
  }
}

// ---- the page: status/, at the address's root ----
const SECURITY = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};
const FILES = /^\/(app\.js|styles\.css|icon\.svg|icon-180\.png|icons\/(today|chat|weather|fitness|markets|mail|account|home)\.svg|sw\.js|manifest\.webmanifest)$/;
export async function statusHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return (await statusRoute(ctx, url)) || json({ error: "Not found." }, 404);
  if (!["GET", "HEAD"].includes(ctx.request.method)) return new Response("Not allowed.", { status: 405 });
  if (url.pathname === "/feed.xml") {
    try { return await cached(cacheKey(ctx.env, "/feed.xml"), () => feed(ctx.env), 120, (x) => new Response(x, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=120", "X-Content-Type-Options": "nosniff" } })); }
    catch (e) { console.error("status feed", e && e.message); return new Response("The feed can’t be read just now.", { status: 503 }); }
  }
  const page = url.pathname === "/" || url.pathname === "/index.html";
  if (!page && !FILES.test(url.pathname)) return notFound();
  const res = page ? await ctx.env.ASSETS.fetch(new Request(new URL("/status/", url))) : await assets(ctx.env).fetch(new Request(new URL("/status" + url.pathname, url), ctx.request));
  if (res.status === 404) return notFound();
  // (the page with what it shows already in it: the checks' answer as it's kept at this edge, for the script to draw at
  // once, rather than "Checking…" while it asks)
  let body = res.body;
  if (page) {
    try {
      const seed = await (await cached(cacheKey(ctx.env, "/api/status"), () => summary(ctx.env), 30)).text();
      body = (await res.text()).replace("</body>", `<script type="application/json" id="seed">${seed.replace(/</g, "\\u003c")}</script>\n</body>`);
    } catch (_) { body = res.body; }
  }
  const out = new Response(body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  out.headers.set("Cache-Control", /\.(svg|png)$/.test(url.pathname) ? "public, max-age=86400" : "no-cache");
  if (url.pathname === "/manifest.webmanifest") out.headers.set("Content-Type", "application/manifest+json");
  if (page) out.headers.delete("Content-Length");
  return out;
}
