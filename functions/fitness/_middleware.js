// Fitness at georgefarrowgreen.com/fitness/: it lives at fitness.inflite.ai, its own address, so the site's
// own address sends you there. Preview (*.pages.dev) and local addresses serve it right here, so a branch can be looked
// at before it's live (signed out: signing in is only at the app's own address).
import { serveFitness, FITNESS_HOST } from "../_fitapp.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (/^(www\.)?georgefarrowgreen\.com$/.test(url.hostname)) return Response.redirect(`https://${FITNESS_HOST}${url.pathname.slice(8) || "/"}${url.search}`, 302);
  // its files are found relative to the page, so the page needs its trailing slash
  if (url.pathname === "/fitness") return Response.redirect(`${url.origin}/fitness/${url.search}`, 301);
  return serveFitness(await ctx.next(), url.pathname);
}
