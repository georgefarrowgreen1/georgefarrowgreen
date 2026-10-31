// The site's scheduler: Cloudflare runs this every 5 minutes (wrangler.toml's crons) and it asks for Chat's and
// Weather's notification jobs (as GitHub's schedule, .github/workflows, does but can't be relied on to: it runs hours
// late), and for Fitness's look at Garmin Connect. Each job keeps itself to one run at a time, so the two schedulers,
// and the apps' own traffic, never double up.
// Its secrets are the jobs' own: wrangler secret put INFLIGHT_TICK_SECRET (and WEATHER_TICK_SECRET, if it's different).
const SITE = "https://georgefarrowgreen.pages.dev";

export default {
  async scheduled(event, env) {
    // (each job: null once it's gone, else its path, having said why in the log (wrangler.toml's [observability]))
    const ask = async (path, secret) => {
      if (!secret) { console.error(path, "no secret set"); return path; }
      try {
        const r = await fetch(SITE + path, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55000) });
        if (r.ok) return null;
        console.error(path, r.status, (await r.text()).slice(0, 200));
      } catch (e) { console.error(path, e && e.message); }
      return path;
    };
    const failed = (await Promise.all([
      ask("/api/pigeon/notify-tick", env.INFLIGHT_TICK_SECRET),
      ask("/api/weather/tick", env.WEATHER_TICK_SECRET || env.INFLIGHT_TICK_SECRET),
      ask("/api/fitness/garmin-tick", env.INFLIGHT_TICK_SECRET),   // (Fitness's Garmin Connect accounts: what's new)
      ask("/api/markets/tick", env.INFLIGHT_TICK_SECRET),   // (Markets's price alerts)
    ])).filter(Boolean);
    // (the run itself marked as failed, if any job did: so it's seen in the Worker's own list of its runs and its errors
    // in Cloudflare's dashboard, not only in its log)
    if (failed.length) throw new Error(`Not done: ${failed.join(", ")}`);
  },
};
