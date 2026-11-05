// The two sites. The apps live at inflite.ai: Chat at chat., Weather at weather., Fitness at fitness., and the
// account they all sign in with at account. (one sign-in there for them all). georgefarrowgreen.com is the home page,
// which signs in with that account too, and where the apps used to be: their old addresses there send you on to the
// new ones (functions/_middleware.js, functions/_hop.js). Passkeys still belong to georgefarrowgreen.com, which says
// inflite.ai's apps may use them (/.well-known/webauthn): so every passkey made before still works, and with it the
// key Chat unlocks with one.
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
// InFlite Today's address: the apps' site itself, "https://inflite.ai" (or a test's stood-in site, with the port it's on)
export function todayOrigin(env, request) {
  if (env?.APPS_SITE && request) { const u = new URL(typeof request === "string" ? request : request.url); return `${u.protocol}//${env.APPS_SITE}${u.port ? ":" + u.port : ""}`; }
  return `https://${appsSite(env)}`;
}
// the apps' addresses, as Today links to them (request: null for production's, as the morning's tick has none)
export function todayLinks(env, request) {
  return Object.fromEntries(["chat", "weather", "fitness", "finance", "account", "auth"].map((name) => [name, appOrigin(name, env, request)]));
}
// InFlite's hub (inflite.ai, Today First): the origins whose pages are this site's apps too, in one window with Today
// (the IFL repo's today/src/hub.js serves them, as the apps, at /chats/, /weather/, …). HUB_ORIGINS in the environment
// (a comma between them: production's https://inflite.ai,https://next.inflite.ai, the tests' http://ifl.test:8788);
// else Today's own address. Each is matched exactly, never as a pattern.
export function hubOrigins(env, request) {
  const list = String(env?.HUB_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
  return list.length ? list : [todayOrigin(env, request)];
}
// Cloudflare's word on where a request came from (country, region, city, latitude, longitude, timezone), for the few
// places that read it (Weather's place, a sign-in's place, a ride's rough place, the health check's zone). Behind
// InFlite's hub a request reaches here from the hub's Worker, whose own request.cf it'd be, so the hub sends the
// browser's alongside (X-Hub-Geo: base64url JSON), and it's taken only where the hub's key said it's the hub's
// (X-Hub-Ok, set by functions/_middleware.js and by nothing a browser sends): those six, in place of this request's own.
const GEO = ["country", "region", "city", "latitude", "longitude", "timezone"];
export function cfOf(request) {
  const cf = request?.cf || {}, headers = request?.headers;
  if (headers?.get?.("X-Hub-Ok") !== "1") return cf;
  // (behind the hub, none of this request's own six: they'd be the hub Worker's place. Only what the hub said, and
  // where it said nothing usable (no X-Hub-Geo, too long, not JSON of an object), nothing)
  const out = { ...cf };
  for (const k of GEO) delete out[k];
  const raw = headers.get("X-Hub-Geo");
  let geo = null;
  if (raw && raw.length <= 2048) {
    try {
      const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
      geo = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    } catch (_) { geo = null; }
  }
  if (!geo || typeof geo !== "object" || Array.isArray(geo)) return out;
  for (const k of GEO) {
    const v = geo[k];
    if ((typeof v === "string" && v.length <= 100) || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

// The site's own address past the custom domains' bot checks, which the scheduled jobs call (GitHub's weather and
// notify ticks, the ticker Worker): the inflite-apps Worker's workers.dev address, its TICK_HOST
// (wrangler.worker.jsonc). Only these routes take a tick there, and nowhere without a TICK_HOST.
export const tickHost = (hostname, env) => !!env?.TICK_HOST && hostname === env.TICK_HOST;

// A request from this Worker to one of InFlite's other Workers, over the direct link between them (a service binding:
// wrangler.worker.jsonc / wrangler.gfg.jsonc) where there is one, in place of out through the internet and back in:
// Mail's (email.inflite.ai, MAIL_APP) and Today's (inflite.ai, TODAY_APP). The same request either way, at the same
// address (each Worker decides what it is by its host); anything else, and anywhere without the link (the tests' stand-
// ins, a local copy), is a plain fetch.
export function siteFetch(env, url, init) {
  const u = new URL(url), host = u.hostname;
  const link = u.protocol !== "https:" ? null : host === "email." + APPS_SITE ? env?.MAIL_APP : host === APPS_SITE ? env?.TODAY_APP : null;
  return typeof link?.fetch === "function" ? link.fetch(new Request(u, init)) : fetch(u, init);
}
