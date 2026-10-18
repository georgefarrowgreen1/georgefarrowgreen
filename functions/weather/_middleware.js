// Weather at georgefarrowgreen.com/weather/: it lives at weather.georgefarrowgreen.com,
// its own address (so its places and settings are kept apart from the rest of the site),
// so the site's own address sends you there. Preview (*.pages.dev) and local addresses
// serve it right here, so a branch can be tried before it's live.
import { serveWeather, WEATHER_HOST } from "../_wxapp.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (/^(www\.)?georgefarrowgreen\.com$/.test(url.hostname)) return Response.redirect(`https://${WEATHER_HOST}${url.pathname.slice(8) || "/"}${url.search}`, 302);
  // its files are found relative to the page, so the page needs its trailing slash
  if (url.pathname === "/weather") return Response.redirect(`${url.origin}/weather/${url.search}`, 301);
  return serveWeather(await ctx.next(), url.pathname);
}
