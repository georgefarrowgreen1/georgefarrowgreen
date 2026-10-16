// InFlight at georgefarrowgreen.com/pigeon/: its files as a phone gets them (functions/_app.js).
import { serveApp } from "../_app.js";

// Cloudflare's preview addresses (*.pages.dev) would be another origin, with its own
// sign-ins and keys: send them home. (chat.georgefarrowgreen.com is InFlight's new
// address, served at its root: functions/_middleware.js.)
const HOME = "https://georgefarrowgreen.com";
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.hostname.endsWith(".pages.dev")) return Response.redirect(HOME + url.pathname + url.search, 301);
  const res = await serveApp(ctx, await ctx.next(), url.pathname, false);
  if (!/^\/pigeon\/handover(\.html)?$/.test(url.pathname)) return res;
  // the handover (pigeon/handover.js): opened, hidden, by the new address and nothing else
  const out = new Response(res.body, res);
  out.headers.delete("X-Frame-Options");
  out.headers.set("Content-Security-Policy", out.headers.get("Content-Security-Policy").replace("frame-ancestors 'none'", `frame-ancestors ${url.protocol}//chat.${url.host}`));
  return out;
}
