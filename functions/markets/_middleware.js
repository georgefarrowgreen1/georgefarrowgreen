// Markets at georgefarrowgreen.com/markets/: it lives at finance.inflite.ai, its own address, so the site's own address
// sends you there. Preview (*.pages.dev) and local addresses serve it right here, so a branch can be looked at before
// it's live (signed out: signing in is only at the app's own address).
import { serveMarkets, MARKETS_HOST } from "../_mktapp.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (/^(www\.)?georgefarrowgreen\.com$/.test(url.hostname)) return Response.redirect(`https://${MARKETS_HOST}${url.pathname.slice(8) || "/"}${url.search}`, 302);
  if (url.pathname === "/markets") return Response.redirect(`${url.origin}/markets/${url.search}`, 301);
  return serveMarkets(await ctx.next(), url.pathname);
}
