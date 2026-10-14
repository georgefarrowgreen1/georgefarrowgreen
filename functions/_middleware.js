// chat.georgefarrowgreen.com is InFlight's own address: the app at its root,
// its API and its files, and nothing else from the rest of the site, so
// nothing but InFlight ever runs where its keys are kept. Every other host
// goes straight through.
import { isAppHost } from "./_home.js";
import { dress } from "./_inflight.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (!isAppHost(url, ctx.env)) return ctx.next();
  if (url.pathname === "/" || url.pathname === "/index.html") return dress(ctx, await ctx.env.ASSETS.fetch(new URL("/pigeon/", url)), url);
  if (url.pathname.startsWith("/pigeon/") || url.pathname.startsWith("/api/pigeon/")) return ctx.next();
  return Response.redirect(`${url.origin}/`, 301);
}
