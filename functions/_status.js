// status.inflite.ai: whether each of InFlite's apps, its sign-in, its scheduled jobs and the home page are working, for
// anyone to see. Every five minutes the ticker (workers/ticker) asks for each address as a phone would and runs each job,
// then hands what it found to the site here (POST /api/status/report, at the site's workers.dev address with the jobs'
// key). Here it's checked again from inside, over the direct links to Today's and Mail's Workers (service bindings), so
// a bot check in the ticker's way never reads as an outage; then kept:
//   status_checks   each check, two days of them (the open row's 24 hours)
//   status_days     a count per address per day (UK days): checks, slow ones, failed ones (the 90 days of bars)
//   status_now      each address's and job's latest, and how many in a row have failed or been fine
//   status_incidents  opened by itself after two failed checks in a row (one incident for what fails together), closed
//                   after two fine ones, kept 120 days
// The page (status/, served at the address's root) reads GET /api/status, and an open row GET /api/status/day?svc=…
// Nothing of anyone's is in any of it: addresses, times, versions, and the bug codes of the week (no words).
//   statusRoute(ctx, url) → the answer for /api/status*, or null for anything else
//   isStatus(url, env), statusHost(ctx, url): the address and its page
import { HttpError, db } from "./_pigeon.js";
import { appsSite, tickHost, siteFetch } from "./_sites.js";
import { tickAuthOk } from "./_notify.js";
import { buildOf } from "./_version.js";
import { assets } from "./_min.js";
import { notFound } from "./_app.js";
import { STATUS_SERVICES, STATUS_JOBS } from "./_statuslist.js";

export const STATUS_HOST = "status.inflite.ai";
// (STATUS_HOST in the environment: tests, on their own names; else status. on the apps' site)
const statusHostOf = (env) => env?.STATUS_HOST || `status.${appsSite(env)}`;
export const isStatus = (url, env) => url.hostname === statusHostOf(env);
// (the page's answers kept at the edge under one address whatever port or scheme they were asked at, so an update
// from Admin can let go of the same copy)
const cacheKey = (env, path) => new Request(`https://${statusHostOf(env)}${path}`);

const S = { ok: 0, warn: 1, down: 2, none: 3 }, NAME = ["ok", "warn", "down", "none"];
const SVC = Object.fromEntries(STATUS_SERVICES.map((s) => [s.id, s])), JOB = Object.fromEntries(STATUS_JOBS.map((j) => [j.id, j]));
const nameOf = (id) => SVC[id]?.name || JOB[id]?.name || id;
const ORDER = [...STATUS_SERVICES, ...STATUS_JOBS].map((x) => x.id), byOrder = (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b);
const MIN = 60e3, DAY_MS = 864e5;
// (a day as the UK has it: "2026-11-05")
const ukDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayOf = (t) => ukDay.format(t);
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

let ready = null;
const table = (env) => (ready ||= db(env).then((D) => D.batch([
  D.prepare("CREATE TABLE IF NOT EXISTS status_checks (svc TEXT NOT NULL, at INTEGER NOT NULL, s INTEGER NOT NULL, ms INTEGER, PRIMARY KEY (svc, at))"),
  D.prepare("CREATE INDEX IF NOT EXISTS status_checks_at ON status_checks(at)"),
  D.prepare("CREATE TABLE IF NOT EXISTS status_days (day TEXT NOT NULL, svc TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, slow INTEGER NOT NULL DEFAULT 0, down INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, svc))"),
  D.prepare("CREATE TABLE IF NOT EXISTS status_now (svc TEXT PRIMARY KEY, s INTEGER NOT NULL, ms INTEGER, version TEXT, why TEXT, at INTEGER NOT NULL, bad INTEGER NOT NULL DEFAULT 0, good INTEGER NOT NULL DEFAULT 0)"),
  D.prepare("CREATE TABLE IF NOT EXISTS status_incidents (id TEXT PRIMARY KEY, title TEXT NOT NULL, svcs TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER, updates TEXT NOT NULL)"),
  D.prepare("CREATE INDEX IF NOT EXISTS status_incidents_started ON status_incidents(started)"),
]).then(() => D)).catch((e) => { ready = null; throw e; }));

// ---- from inside: Today's and Mail's Workers over the direct links, and this Worker's own apps (it's answering) ----
const verOf = (j) => { const v = (x) => (typeof x === "string" && /^\d{1,3}\.\d{2}$/.test(x) ? x : null); return v(j?.app) || v(j?.build); };
async function inside(env) {
  const out = {}, site = appsSite(env);
  const linked = async (id, link, url) => {
    if (typeof link?.fetch !== "function") return;
    const t0 = Date.now();
    try {
      const r = await siteFetch(env, url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
      out[id] = r.ok ? { s: "ok", ms: Date.now() - t0, version: verOf(await r.json().catch(() => null)) } : { s: "down", ms: null, why: `HTTP ${r.status}` };
    } catch (_) { out[id] = { s: "down", ms: null, why: "no answer" }; }
  };
  await Promise.all([
    linked("today", env.TODAY_APP, `https://${site}/version`),
    linked("mail", env.MAIL_APP, `https://email.${site}/version`),
    ...STATUS_SERVICES.filter((s) => s.app).map(async (s) => {
      const version = env.ASSETS ? await buildOf({ env }, new URL(`https://${s.address}/`), s.app).catch(() => null) : null;
      out[s.id] = { s: "ok", ms: null, version };
    }),
  ]);
  return out;
}

// ---- what the ticker found: kept, and incidents opened and closed by it ----
export async function keepReport(env, body, t = Date.now()) {
  const D = await table(env), at = Math.floor(t / MIN) * MIN;
  const prev = Object.fromEntries(((await D.prepare("SELECT * FROM status_now").all()).results || []).map((r) => [r.svc, r]));
  // (the same report twice, a retry: kept once)
  if (Object.values(prev).some((r) => r.at >= at)) return { kept: false };
  const given = new Map((Array.isArray(body?.checks) ? body.checks : []).filter((c) => c && SVC[c.id]).map((c) => [c.id, c]));
  const ran = new Map((Array.isArray(body?.jobs) ? body.jobs : []).filter((j) => j && typeof j.path === "string").map((j) => [j.path, j]));
  const inner = await inside(env);
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
  const day = dayOf(t), writes = [];
  for (const r of rows) {
    const p = prev[r.svc] || { bad: 0, good: 0 };
    r.bad = r.s === "down" ? p.bad + 1 : r.s === "none" ? p.bad : 0;
    r.good = r.s === "ok" || r.s === "warn" ? p.good + 1 : r.s === "none" ? p.good : 0;
    writes.push(D.prepare("INSERT OR REPLACE INTO status_now (svc, s, ms, version, why, at, bad, good) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(r.svc, S[r.s], r.ms, r.version, r.why, at, r.bad, r.good));
    if (!r.check) continue;
    writes.push(D.prepare("INSERT OR REPLACE INTO status_checks (svc, at, s, ms) VALUES (?, ?, ?, ?)").bind(r.svc, at, S[r.s], r.ms));
    if (r.s !== "none") writes.push(D.prepare("INSERT INTO status_days (day, svc, n, slow, down) VALUES (?, ?, 1, ?, ?) ON CONFLICT(day, svc) DO UPDATE SET n = n + 1, slow = slow + excluded.slow, down = down + excluded.down")
      .bind(day, r.svc, r.s === "warn" ? 1 : 0, r.s === "down" ? 1 : 0));
  }
  writes.push(D.prepare("DELETE FROM status_checks WHERE at < ?").bind(t - 2 * DAY_MS));
  writes.push(D.prepare("DELETE FROM status_days WHERE day < ?").bind(dayOf(t - 120 * DAY_MS)));
  writes.push(D.prepare("DELETE FROM status_incidents WHERE ended IS NOT NULL AND ended < ?").bind(t - 120 * DAY_MS));
  writes.push(...(await incidents(D, rows, t)));
  await D.batch(writes);
  return { kept: true, rows: rows.length };
}

// Incidents, by themselves: two failed checks in a row opens one (or joins one opened in the last quarter of an hour,
// as what fails together is one thing); two fine ones in a row for everything in it closes it
async function incidents(D, rows, t) {
  const open = ((await D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL ORDER BY started DESC").all()).results || [])
    .map((x) => ({ ...x, svcs: JSON.parse(x.svcs || "[]"), updates: JSON.parse(x.updates || "[]"), changed: false }));
  const by = Object.fromEntries(rows.map((r) => [r.svc, r])), inOpen = new Set(open.flatMap((x) => x.svcs));
  for (const r of rows) {
    if (r.bad < 2 || inOpen.has(r.svc)) continue;
    const what = r.check ? "isn’t answering" : "isn’t running";
    let x = open.find((o) => t - o.started < 15 * MIN);
    if (x) { x.svcs.push(r.svc); x.updates.unshift({ at: t, k: "Update", w: `${nameOf(r.svc)} ${what} either.` }); x.changed = true; }
    else {
      x = { id: `i${t.toString(36)}${r.svc}`, svcs: [r.svc], started: t - 5 * MIN, ended: null, updates: [{ at: t, k: "Spotted", w: `${nameOf(r.svc)} ${what}: two checks in a row failed${r.why ? ` (${r.why})` : ""}.` }], changed: true, fresh: true };
      open.unshift(x);
    }
    inOpen.add(r.svc);
  }
  const out = [];
  for (const x of open) {
    x.svcs.sort(byOrder);
    const allJobs = x.svcs.every((id) => JOB[id]), allSvcs = x.svcs.every((id) => SVC[id]);
    x.title = `${and(x.svcs.map(nameOf))} ${allJobs ? "not running" : allSvcs ? "not answering" : "not working"}`;
    if (x.svcs.every((id) => !by[id] ? !SVC[id] && !JOB[id] : by[id].good >= 2)) {
      x.ended = t; x.updates.unshift({ at: t, k: "Resolved", w: x.svcs.length > 1 ? "Everything is working again." : `${nameOf(x.svcs[0])} is working again.` }); x.changed = true;
    }
    if (x.changed) out.push(D.prepare("INSERT OR REPLACE INTO status_incidents (id, title, svcs, started, ended, updates) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(x.id, x.title, JSON.stringify(x.svcs), x.started, x.ended, JSON.stringify(x.updates.slice(0, 20))));
  }
  return out;
}

// ---- for the page ----
export async function summary(env, t = Date.now()) {
  const D = await table(env), days = lastDays(t);
  const [now, counts, incs] = await Promise.all([
    D.prepare("SELECT * FROM status_now").all(),
    D.prepare("SELECT * FROM status_days WHERE day >= ?").bind(days[0]).all(),
    D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL OR started >= ? ORDER BY started DESC LIMIT 10").bind(t - 90 * DAY_MS).all(),
  ]);
  const latest = Object.fromEntries((now.results || []).map((r) => [r.svc, r]));
  const perDay = {};
  for (const r of counts.results || []) (perDay[r.svc] ||= {})[r.day] = r;
  const at = Math.max(0, ...STATUS_SERVICES.map((s) => latest[s.id]?.at || 0)) || null;
  const services = STATUS_SERVICES.map((s) => {
    const l = latest[s.id], d = perDay[s.id] || {};
    let n = 0, down = 0;
    for (const r of Object.values(d)) { n += r.n; down += r.down; }
    return { id: s.id, name: s.name, group: s.group, address: s.address, s: l ? NAME[l.s] : "none", ms: l?.ms ?? null, version: l?.version || null, why: l?.why || null,
      at: l?.at || null, up90: n ? Math.round(((n - down) / n) * 10000) / 100 : null, days: days.map((k) => dayState(d[k])) };
  });
  const jobs = STATUS_JOBS.map((j) => { const l = latest[j.id]; return { id: j.id, name: j.name, s: l ? NAME[l.s] : "none", at: l?.at || null, ms: l?.ms ?? null }; });
  const list = (incs.results || []).map((x) => ({ id: x.id, title: x.title, svcs: JSON.parse(x.svcs || "[]"), started: x.started, ended: x.ended, updates: JSON.parse(x.updates || "[]"), codes: [] }));
  // (the bug codes of the week, and the site's own server errors' codes during each incident: codes alone, no words)
  let bugs = [];
  try {
    const week = await D.prepare("SELECT code, app, COUNT(*) AS n, MAX(issue) AS issue FROM pg_bugs WHERE at >= ? AND app != 'fitting' GROUP BY code, app ORDER BY n DESC, MAX(at) DESC LIMIT 8").bind(t - 7 * DAY_MS).all();
    bugs = (week.results || []).map((b) => ({ code: b.code, app: b.app, n: b.n, filed: !!b.issue }));
    if (list.length) {
      const from = Math.min(...list.map((x) => x.started));
      const srv = await D.prepare("SELECT DISTINCT code, at FROM pg_bugs WHERE app = 'server' AND at >= ? ORDER BY at LIMIT 500").bind(from).all();
      for (const x of list) x.codes = [...new Set((srv.results || []).filter((b) => b.at >= x.started && b.at <= (x.ended || t)).map((b) => b.code))].slice(0, 3);
    }
  } catch (_) {}
  return { at, every: 5, services, jobs, incidents: list, bugs };
}
export async function dayOfChecks(env, svc, t = Date.now()) {
  if (!SVC[svc]) throw new HttpError(404, "Not found.");
  const D = await table(env);
  const { results } = await D.prepare("SELECT at, s, ms FROM status_checks WHERE svc = ? AND at >= ? ORDER BY at").bind(svc, t - DAY_MS).all();
  return { svc, from: t - DAY_MS, to: t, points: (results || []).map((r) => [r.at, NAME[r.s], r.ms]) };
}

// ---- Admin's (functions/api/pigeon admin/status, admin/status-note): the incidents, and a written update on one ----
// (what kind of update: Resolved closes an incident that's still open; it opens again by itself if what's in it is still failing)
export const NOTE_KINDS = ["Investigating", "Identified", "Update", "Monitoring", "Resolved"];
const parse = (x) => ({ id: x.id, title: x.title, svcs: JSON.parse(x.svcs || "[]"), started: x.started, ended: x.ended, updates: JSON.parse(x.updates || "[]") });
export async function adminIncidents(env, t = Date.now()) {
  const D = await table(env);
  const { results } = await D.prepare("SELECT * FROM status_incidents WHERE ended IS NULL OR started >= ? ORDER BY ended IS NOT NULL, started DESC LIMIT 12").bind(t - 30 * DAY_MS).all();
  return (results || []).map(parse);
}
// (the open ones, for Admin's figures: none where there's no table yet)
export async function openIncidents(env) {
  try { const D = await table(env); return ((await D.prepare("SELECT id, title, started FROM status_incidents WHERE ended IS NULL ORDER BY started DESC LIMIT 5").all()).results || []); }
  catch (_) { return []; }
}
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
  try { await globalThis.caches?.default?.delete(cacheKey(env, "/api/status")); } catch (_) {}
  return x;
}

const json = (v, status = 200, cache = "no-store") => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" } });
// (the page's answers kept half a minute at Cloudflare's edge, so however many are looking it's a read every 30 seconds)
async function cached(key, make, secs) {
  const cache = globalThis.caches?.default;
  const hit = cache && (await cache.match(key).catch(() => null));
  if (hit) return hit;
  const res = json(await make(), 200, `public, max-age=${secs}`);
  if (cache) await cache.put(key, res.clone()).catch(() => {});
  return res;
}

export async function statusRoute(ctx, url) {
  const p = url.pathname, env = ctx.env, req = ctx.request;
  if (!/^\/api\/status(\/day|\/report)?$/.test(p)) return null;
  try {
    if (p === "/api/status/report") {
      if (!tickHost(url.hostname, env)) return null;
      if (req.method !== "POST") return json({ error: "Not found." }, 404);
      tickAuthOk(req, env);
      const raw = await req.text();
      if (raw.length > 32000) throw new HttpError(413, "Too long.");
      let body; try { body = JSON.parse(raw || "{}"); } catch (_) { throw new HttpError(400, "Not readable."); }
      return json({ ok: true, ...(await keepReport(env, body)) });
    }
    if (!isStatus(url, env)) return null;
    if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Not found." }, 404);
    if (p === "/api/status") return await cached(cacheKey(env, "/api/status"), () => summary(env), 30);
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
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};
const FILES = /^\/(app\.js|styles\.css|icon\.svg|icon-180\.png)$/;
export async function statusHost(ctx, url) {
  if (url.pathname.startsWith("/api/")) return (await statusRoute(ctx, url)) || json({ error: "Not found." }, 404);
  if (!["GET", "HEAD"].includes(ctx.request.method)) return new Response("Not allowed.", { status: 405 });
  const page = url.pathname === "/" || url.pathname === "/index.html";
  if (!page && !FILES.test(url.pathname)) return notFound();
  const res = page ? await ctx.env.ASSETS.fetch(new Request(new URL("/status/", url))) : await assets(ctx.env).fetch(new Request(new URL("/status" + url.pathname, url), ctx.request));
  if (res.status === 404) return notFound();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  out.headers.set("Cache-Control", /\.(svg|png)$/.test(url.pathname) ? "public, max-age=86400" : "no-cache");
  return out;
}
