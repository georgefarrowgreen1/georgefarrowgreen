// Signing in to an app, already signed in to the site: straight back, with no page in between. An app sends you to
// auth.<site>/go with what it would have put after the sign-in page's # (signin=<app>, its word for this sign-in: ask,
// where it is: back, and jar=shared from a browser's tab whose sign-in is the site's own). Here, where the site's
// sign-in cookie comes too, the server looks: signed in (and not a sign-in an app handed to this browser, which goes on
// to nothing until it's shown it's you on the page), it makes the app's code (functions/_handback.js: good once, for two
// minutes, and only with the word the app's tab kept) and sends you back with it in the address's #, as the page would
// have once you'd tapped Continue; from a browser's tab, just back, as there's nothing to swap. Anything else (signed
// out, an app that needs more than that, Chat for its key and Mail for a fresh sign-in, or anything not as an app
// sends it) goes on to the page with all of it after the #, so the way in is the page's, as before.
//
// So a page elsewhere gains nothing by sending you here: the code only ever goes to the app's own address (back, if it's
// one of that app's, else the page), and is good only with the word in that app's tab, which no other page has.
import { cookieUser } from "./_account.js";
import { makeHandback } from "./_handback.js";

const FAST = new Set(["today", "weather", "fitness", "markets"]), SHARED = new Set(["weather", "fitness", "markets"]);
const WORD = /^[A-Za-z0-9_-]{43}$/;
// where each app is, on the site this sign-in page is for (as the page's own backFor has it, account/app.js)
const HOMES = { today: (s) => [`${s}/`, `next.${s}/`], weather: (s) => [`weather.${s}/`], fitness: (s) => [`fitness.${s}/`], markets: (s) => [`finance.${s}/`] };

// back, if it's that app's own address (over the same scheme and port as this page), else null
export function backOf(url, app, back) {
  try {
    const u = new URL(back), site = url.hostname.replace(/^auth\./, "");
    const own = (HOMES[app]?.(site) || []).includes(u.hostname + u.pathname);
    return own && u.protocol === url.protocol && u.port === url.port && !u.search && !u.hash && !u.username && !u.password ? u.origin + u.pathname : null;
  } catch (_) { return null; }
}
const go = (to) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
// (the first letter of the name, for the app to draw from its first frame, as the page's faceHint gives)
const initialOf = (u) => [...String(u.name || u.handle || "?").trim()][0]?.toUpperCase() || "?";

export async function fastSignIn(ctx, url) {
  const q = url.searchParams, app = q.get("signin") || "";
  // (signin= first, as the page looks for it there)
  const page = () => go(`${url.origin}/#${app ? new URLSearchParams([["signin", app], ...[...q].filter(([k]) => k !== "signin")]) : q}`);
  if (ctx.request.method !== "GET" || !FAST.has(app) || !WORD.test(q.get("ask") || "")) return page();
  const back = backOf(url, app, q.get("back"));
  if (!back) return page();
  try {
    const u = await cookieUser(ctx.request, ctx.env);
    if (!u || u.handed) return page();
    const f = new URLSearchParams({ f: initialOf(u) });
    if (q.get("jar") === "shared" && SHARED.has(app)) return go(`${back}#signin=shared&${f}`);
    const { code } = await makeHandback(ctx.env, u, { app, ask: q.get("ask") });
    return go(`${back}#signin=${code}&${f}`);
  } catch (_) { return page(); }       // (too many tries, or anything else: the page says what, as it always has)
}
