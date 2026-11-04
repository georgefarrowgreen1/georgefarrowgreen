// Precision Fit Studio at georgefarrowgreen.com/fitting/: it lives at fitting.georgefarrowgreen.com, its own address, so
// the site's own address sends you there. Preview (*.pages.dev) and local addresses serve it right here, so a branch
// can be looked at before it's live.
import { serveFitting, FITTING_HOST } from "../_fitstudio.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (/^(www\.)?georgefarrowgreen\.com$/.test(url.hostname)) return Response.redirect(`https://${FITTING_HOST}${url.pathname.slice(8) || "/"}${url.search}`, 302);
  if (url.pathname === "/fitting") return Response.redirect(`${url.origin}/fitting/${url.search}`, 301);
  return serveFitting(await ctx.next(), url.pathname);
}
