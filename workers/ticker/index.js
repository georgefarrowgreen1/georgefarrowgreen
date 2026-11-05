// The site's scheduler: Cloudflare runs this every 5 minutes (wrangler.toml's crons) and it asks for Chat's and
// Weather's notification jobs (as GitHub's schedule, .github/workflows, does but can't be relied on to: it runs hours
// late), for Fitness's look at Garmin Connect, Markets' alerts and InFlite Today's morning notification (which only this
// asks for: while it's on, Weather's briefing and Fitness's reminder aren't sent for that account, so it mustn't stop).
// Each job keeps itself to one run at a time, so the two schedulers, and the apps' own traffic, never double up.
// Its secrets are the jobs' own: wrangler secret put INFLIGHT_TICK_SECRET (and WEATHER_TICK_SECRET, if it's different).
// It's status.inflite.ai's checker too: each address asked for as a phone would ask (functions/_statuslist.js), how
// each job went, and the lot handed to the site (/api/status/report, functions/_status.js), which keeps them.
// (the site's address past the custom domains' bot checks: the inflite-apps Worker's workers.dev address, as the
// ticker's TICK_SITE says (wrangler.toml))
import { STATUS_SERVICES, SLOW_MS } from "../../functions/_statuslist.js";

const APPS_SITE = "https://inflite-apps.georgefarrowgreen.workers.dev";

// One address, asked for as a phone would (GET, ten seconds): → { id, s: ok | warn (slow) | down | none (a bot check
// stood in the way, so it couldn't be told), ms, why, version }
export async function probe(svc) {
  const t0 = Date.now();
  try {
    const r = await fetch(svc.probe, { headers: { "User-Agent": "InFlite-Status/1 (+https://status.inflite.ai)", Accept: "application/json, text/html" }, redirect: "manual", signal: AbortSignal.timeout(10000) });
    const ms = Date.now() - t0, type = r.headers.get("content-type") || "";
    if (r.headers.get("cf-mitigated") === "challenge" || (r.status === 403 && type.includes("html"))) { await r.body?.cancel(); return { id: svc.id, s: "none", ms, why: "bot check" }; }
    const fine = r.ok || (r.status >= 300 && r.status < 400);
    let version = null;
    if (r.ok && type.includes("json")) {
      const j = await r.json().catch(() => null), v = (x) => (typeof x === "string" && /^\d{1,3}\.\d{2}$/.test(x) ? x : null);
      version = v(j?.app) || v(j?.build);
    } else await r.body?.cancel();
    return { id: svc.id, s: !fine ? "down" : ms > SLOW_MS ? "warn" : "ok", ms, why: fine ? null : `HTTP ${r.status}`, version };
  } catch (e) {
    return { id: svc.id, s: "down", ms: null, why: e?.name === "TimeoutError" ? "no answer in 10 s" : "unreachable" };
  }
}

export default {
  async scheduled(event, env) {
    const SITE = env.TICK_SITE || APPS_SITE;
    // (each job: { path, ok, ms }, having said why in the log where it didn't go (wrangler.toml's [observability]))
    const ask = async (path, secret) => {
      if (!secret) { console.error(path, "no secret set"); return { path, ok: false, ms: null }; }
      const t0 = Date.now();
      try {
        const r = await fetch(SITE + path, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55000) });
        if (r.ok) return { path, ok: true, ms: Date.now() - t0 };
        console.error(path, r.status, (await r.text()).slice(0, 200));
      } catch (e) { console.error(path, e && e.message); }
      return { path, ok: false, ms: Date.now() - t0 };
    };
    const [jobs, checks] = await Promise.all([
      Promise.all([
        ask("/api/pigeon/notify-tick", env.INFLIGHT_TICK_SECRET),
        ask("/api/weather/tick", env.WEATHER_TICK_SECRET || env.INFLIGHT_TICK_SECRET),
        ask("/api/fitness/garmin-tick", env.INFLIGHT_TICK_SECRET),   // (Fitness's Garmin Connect accounts: what's new)
        ask("/api/markets/tick", env.INFLIGHT_TICK_SECRET),   // (Markets's price alerts)
        ask("/api/today/tick", env.INFLIGHT_TICK_SECRET),   // (Today's morning notification)
      ]),
      Promise.all(STATUS_SERVICES.map(probe)),
    ]);
    const failed = jobs.filter((j) => !j.ok).map((j) => j.path);
    // (status.inflite.ai's: what was found, kept by the site)
    if (env.INFLIGHT_TICK_SECRET) {
      try {
        const r = await fetch(SITE + "/api/status/report", { method: "POST", headers: { Authorization: `Bearer ${env.INFLIGHT_TICK_SECRET}`, "Content-Type": "application/json" },
          body: JSON.stringify({ checks, jobs }), signal: AbortSignal.timeout(20000) });
        if (!r.ok) { console.error("/api/status/report", r.status, (await r.text()).slice(0, 200)); failed.push("/api/status/report"); }
      } catch (e) { console.error("/api/status/report", e && e.message); failed.push("/api/status/report"); }
    }
    // (the run itself marked as failed, if any job did: so it's seen in the Worker's own list of its runs and its errors
    // in Cloudflare's dashboard, not only in its log)
    if (failed.length) throw new Error(`Not done: ${failed.join(", ")}`);
  },
};
