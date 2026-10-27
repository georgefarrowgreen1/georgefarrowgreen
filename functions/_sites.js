// The two sites. The apps live at inflite.ai: InFlight at chat., Weather at weather., Fitness at fitness., and the
// account they all sign in with at account. (one sign-in there for them all). georgefarrowgreen.com is the home page,
// which signs in with that account too, and where the apps used to be: their old addresses there send you on to the
// new ones (functions/_middleware.js, functions/_hop.js). Passkeys still belong to georgefarrowgreen.com, which says
// inflite.ai's apps may use them (/.well-known/webauthn): so every passkey made before still works, and with it the
// key InFlight unlocks with one.
// (Tests stand in sites of their own, over plain http: ACCOUNT_SITE for the home page's (gfg.test), APPS_SITE for the
// apps' (ifl.test).)
export const HOME_SITE = "georgefarrowgreen.com", APPS_SITE = "inflite.ai";
export const homeSite = (env) => env?.ACCOUNT_SITE || HOME_SITE;
export const appsSite = (env) => env?.APPS_SITE || APPS_SITE;
// the apps, by the names their addresses start with
export const APP_NAMES = ["chat", "weather", "fitness", "account"];
const under = (hostname, site) => hostname === site || hostname.endsWith("." + site);
// which of the two sites an address is on: "apps", "home", or null (a preview's, localhost)
export function siteOf(hostname, env) {
  if (under(hostname, appsSite(env))) return "apps";
  if (under(hostname, homeSite(env))) return "home";
  return null;
}
// the site's own name, for the address's cookie (null where it's neither)
export const siteName = (hostname, env) => ({ apps: appsSite(env), home: homeSite(env) })[siteOf(hostname, env)] || null;
// an app's old address on the home page's site (chat.georgefarrowgreen.com, and so on): which app's
export function oldApp(hostname, env) {
  const h = homeSite(env);
  if (!hostname.endsWith("." + h)) return null;
  const name = hostname.slice(0, -h.length - 1);
  return APP_NAMES.includes(name) ? name : null;
}
// an app's address now: "https://weather.inflite.ai" (or, for a test's stood-in site, its own, with the port it's on)
export function appOrigin(name, env, request) {
  if (env?.APPS_SITE && request) { const u = new URL(typeof request === "string" ? request : request.url); return `${u.protocol}//${name}.${env.APPS_SITE}${u.port ? ":" + u.port : ""}`; }
  return `https://${name}.${appsSite(env)}`;
}
// the home page's address
export function homeOrigin(env, request) {
  if (env?.ACCOUNT_SITE && request) { const u = new URL(typeof request === "string" ? request : request.url); return `${u.protocol}//${env.ACCOUNT_SITE}${u.port ? ":" + u.port : ""}`; }
  return `https://${homeSite(env)}`;
}
