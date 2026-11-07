// Precision Fit Studio at georgefarrowgreen.com/fitting/: it lives at fitting.georgefarrowgreen.com, its own address, so
// the site's own address sends you there. Preview (*.workers.dev) and local addresses serve it right here, behind its
// sign-in as at its own address (functions/_fitstudio.js), so a branch can be looked at before it's live.
import { fitting, FITTING_HOST } from "../_fitstudio.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (/^(www\.)?georgefarrowgreen\.com$/.test(url.hostname)) return Response.redirect(`https://${FITTING_HOST}${url.pathname.slice(8) || "/"}${url.search}`, 302);
  if (url.pathname === "/fitting") return Response.redirect(`${url.origin}/fitting/${url.search}`, 301);
  return fitting(ctx, url, "/fitting");
}
