// InFlight's first address, georgefarrowgreen.com/pigeon/: it lives at chat.inflite.ai now, so every page here goes on
// to the same place there, signed in still if the browser was here (functions/_hop.js); its service worker, a stand-in
// that shows the notifications still sent to a phone that hasn't moved yet, and opens them there (functions/_middleware.js).
import { serveApp } from "../_app.js";
import { forwardWorker } from "../_middleware.js";
import { hopTo } from "../_hop.js";
import { cookieToken } from "../_account.js";
import { appOrigin, siteOf } from "../_sites.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  // (anywhere else, a preview's address or a local one, it's InFlight as it always was here)
  if (siteOf(url.hostname, ctx.env) !== "home") return serveApp(ctx, await ctx.next(), url.pathname, false);
  const app = appOrigin("chat", ctx.env, ctx.request);
  if (url.pathname === "/pigeon/sw.js") return forwardWorker("chat", app, "/pigeon/");
  const to = app + (url.pathname.slice(7) || "/") + url.search;
  return Response.redirect(cookieToken(ctx.request, ctx.env) ? hopTo(to, ctx.request, ctx.env) : to, 302);
}
