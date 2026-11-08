import { speed } from "./_vitals.js";
import { DAY, londonOffset } from "./_pigeon.js";
import { table as bugsTable } from "./_bugs.js";
import { API_PROBES, MONITOR_POLICY as P } from "./_monitorlist.js";

const appFor = (app) => app === "hub" ? "today" : app === "chats" ? "chat" : app;
const errorApp = (kind) => ({ pigeon: "chat", chat: "chat", weather: "weather", fitness: "fitness", markets: "markets", account: "account", auth: "auth", today: "today", mail: "mail" })[String(kind).split(/\s/)[0]];

// Existing aggregate histograms only: no new per-visit tracking or per-request writes.
export function performanceChecks(current, baseline) {
  const out = new Map(API_PROBES.map((s) => [s.app, { s: "none", ms: null, why: "Collecting performance samples" }]));
  const old = new Map((baseline?.rows || []).map((r) => [`${r.app}|${r.dev}`, r]));
  for (const row of current?.rows || []) {
    const app = appFor(row.app);
    if (!out.has(app)) continue;
    for (const [metric, [good, poor]] of Object.entries(P.metrics)) {
      const m = row.m?.[metric], b = old.get(`${row.app}|${row.dev}`)?.m?.[metric];
      if (!m || m.n < P.minCurrentSamples || !Number.isFinite(m.p75)) continue;
      const regression = b?.n >= P.minBaselineSamples && b.p75 > 0 && m.p75 > good && m.p75 >= b.p75 * P.regressionRatio && m.p75 - b.p75 >= (metric === "cls" ? 0.05 : 100);
      const device = row.dev === "phone" ? "Phone" : "Computer";
      const label = ({ ttfb: "server response", fcp: "first paint", lcp: "loading", inp: "interactions", cls: "layout stability" })[metric];
      const why = m.p75 >= poor ? `${device} ${label} is poor` : regression ? `${device} ${label} regressed` : null;
      if (why) out.set(app, { s: "warn", ms: metric === "cls" ? null : m.p75, why });
      else if (out.get(app).s === "none") out.set(app, { s: "ok", ms: null, why: "Enough samples; within thresholds" });
    }
  }
  return out;
}

export function apiChecks(reports, errorCounts) {
  const given = new Map((Array.isArray(reports) ? reports : []).filter((r) => r && API_PROBES.some((s) => s.id === r.id)).map((r) => [r.id, r]));
  return API_PROBES.map((s) => {
    const r = given.get(s.id), ms = Number.isFinite(r?.ms) && r.ms >= 0 ? Math.round(Math.min(r.ms, 10000)) : null;
    const errors = errorCounts?.[s.app] || 0;
    let state = ["ok", "warn", "down", "none"].includes(r?.s) ? r.s : "none";
    let why = state === "down" ? "API response contract failed" : state === "none" ? "Waiting for API probe" : null;
    if (state === "ok" && ms > P.apiSlowMs) state = "warn";
    if (state === "warn") why = `API response over ${P.apiSlowMs / 1000} seconds`;
    if (errors >= P.errorCount) { state = "down"; why = `${errors} server errors in ${P.errorWindowMinutes} minutes`; }
    return { svc: s.id, s: state, ms, why, version: null, check: true };
  });
}

export async function monitorChecks(env, D, body, t) {
  const day = Math.floor((t + londonOffset(t)) / DAY);
  const [current, baseline, errors] = await Promise.all([
    speed(D, day, day).catch(() => null), speed(D, day - P.baselineDays, day - 1).catch(() => null),
    bugsTable(env).then((B) => B.prepare(`SELECT kind, COUNT(*) AS n FROM pg_bugs WHERE app = 'server' AND at >= ?1 AND at <= ?2
      AND COALESCE(CASE WHEN json_valid(detail) THEN json_extract(detail, '$.sev') END, 'failed') != 'slow' GROUP BY kind`).bind(t - P.errorWindowMinutes * 60000, t).all()).catch(() => null),
  ]);
  const counts = {};
  for (const r of errors?.results || []) {
    const app = errorApp(r.kind);
    if (app) counts[app] = (counts[app] || 0) + r.n;
  }
  const perf = performanceChecks(current, baseline);
  return [...apiChecks(body?.apis, counts), ...API_PROBES.map((s) => ({ svc: `perf-${s.app}`, ...perf.get(s.app), version: null, check: true }))];
}
