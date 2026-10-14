// InFlight's pages under /pigeon/ (functions/_inflight.js dresses them).
import { dress } from "../_inflight.js";
import { isAppHost } from "../_home.js";
import { SITE } from "../_pigeon.js";

// InFlight lives at one address. Cloudflare's preview addresses (*.pages.dev)
// would be a second origin, with its own sign-ins and keys: send them home.
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.hostname.endsWith(".pages.dev")) return Response.redirect(SITE + url.pathname + url.search, 301);
  // at its own address the app is the root, so /pigeon/ is an old link to it (the # comes along)
  if (isAppHost(url, ctx.env) && /^\/pigeon\/(index\.html)?$/.test(url.pathname)) return Response.redirect(`${url.origin}/${url.search}`, 301);
  return dress(ctx, await ctx.next(), url);
}
