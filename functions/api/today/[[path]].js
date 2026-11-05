// InFlite Today's turn for the site's scheduler (workers/ticker, every 5 minutes, with its secret): the morning
// notifications that are due (functions/_todaymorning.js morningTick). At the site's own address only, as the other
// apps' scheduled turns are (not under /api/account, whose API answers only at the account's own); and at localhost for
// the tests (APPS_SITE set, as it is only there).
//   POST /api/today/tick
import { tickHost } from "../../_sites.js";
import { json } from "../../_accountapi.js";
import { tickAuthOk } from "../../_notify.js";
import { HttpError, logError } from "../../_pigeon.js";
import { morningTick } from "../../_todaymorning.js";

export async function onRequest(ctx) {
  const { request, env } = ctx, url = new URL(request.url), parts = [].concat(ctx.params?.path || []);
  const here = tickHost(url.hostname, env) || (url.hostname === "localhost" && !!env.APPS_SITE);
  if (!here || request.method !== "POST" || parts.join("/") !== "tick") return json({ error: "Not found." }, 404);
  try {
    tickAuthOk(request, env);
    // (what Markets fetches for everyone is written down after the answer's gone, and the dividends it asks for in the
    // background aren't dropped: its waitUntil, carried with the environment, as Markets' own router does)
    return json(await morningTick({ ...env, waitUntil: (p) => ctx.waitUntil(p) }, Date.now()));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    const code = await logError(env, "today tick", e);
    return json({ error: "Something went wrong on our side. Try again in a moment.", code }, 500);
  }
}
