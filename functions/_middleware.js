// chat.georgefarrowgreen.com: InFlight's new address, the app at the site's root.
// Every other address carries straight on (the site, and InFlight at /pigeon/).
import { serveApp, isChat, notFound } from "./_app.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (!isChat(url, ctx.env)) return ctx.next();
  // here, only InFlight's own API: the site's (its owner's sign-in, its content) stays on georgefarrowgreen.com
  if (url.pathname.startsWith("/api/")) return url.pathname.startsWith("/api/pigeon/") ? ctx.next() : notFound();
  // InFlight's admin signs in as the site's owner, so it lives on the site's own address
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return Response.redirect(`${url.protocol}//${url.host.replace(/^chat\./, "")}/pigeon${url.pathname}${url.search}`, 302);
  // an old address on the new host (a link from before, a notification): the same place, at the root
  if (url.pathname === "/pigeon" || url.pathname.startsWith("/pigeon/")) {
    const to = new URL(url); to.pathname = url.pathname.slice(7) || "/";
    return Response.redirect(to.href, 301);
  }
  // everything else is the app: /x is /pigeon/x
  if (/^\/handover(\.html)?$/.test(url.pathname)) return notFound();   // (the old address's, not this one's)
  const path = "/pigeon" + (url.pathname === "/index.html" ? "/" : url.pathname);
  const res = await ctx.env.ASSETS.fetch(new Request(new URL(path + url.search, url), ctx.request));
  return serveApp(ctx, res, path, true);
}
