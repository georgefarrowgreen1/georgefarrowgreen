// chat.georgefarrowgreen.com: InFlight's new address, the app at the site's root.
// Every other address carries straight on (the site, and InFlight at /pigeon/).
import { serveApp, isChat } from "./_app.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (!isChat(url, ctx.env) || url.pathname.startsWith("/api/")) return ctx.next();
  // an old address on the new host (a link from before, a notification): the same place, at the root
  if (url.pathname === "/pigeon" || url.pathname.startsWith("/pigeon/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(7) || "/";
    return Response.redirect(to.href, 301);
  }
  // everything else is the app: /x is /pigeon/x
  const path = "/pigeon" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveApp(ctx, res, path, true);
}
