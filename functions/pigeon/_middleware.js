// InFlight at georgefarrowgreen.com/pigeon/: its files as a phone gets them (functions/_app.js).
import { serveApp } from "../_app.js";

// Cloudflare's preview addresses (*.pages.dev) would be another origin, with its own
// sign-ins and keys: send them home. (chat.georgefarrowgreen.com is InFlight's new
// address, served at its root: functions/_middleware.js.)
const HOME = "https://georgefarrowgreen.com";
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.hostname.endsWith(".pages.dev")) return Response.redirect(HOME + url.pathname + url.search, 301);
  return serveApp(ctx, await ctx.next(), url.pathname, false);
}
