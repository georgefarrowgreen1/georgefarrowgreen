// Public navigation belongs to InFlite's one origin. Service origins stay in _sites.js.
export const APP_PATHS = Object.freeze({ chat: "/chats", chats: "/chats", weather: "/weather", fitness: "/fitness", finance: "/markets", markets: "/markets", email: "/mail", mail: "/mail", account: "/account", auth: "/auth", status: "/status", os: "" });
export function publicApp(name, env = {}, request) {
  const path = APP_PATHS[name];
  if (path == null) throw new TypeError("Unknown InFlite app");
  let origin = `https://${env.APPS_SITE || "inflite.ai"}`;
  if (env.APPS_SITE && request) {
    const u = new URL(typeof request === "string" ? request : request.url);
    origin = `${u.protocol}//${env.APPS_SITE}${u.port ? ":" + u.port : ""}`;
  }
  return origin + path;
}
// Only human documents move. Existing workers, assets, API requests and keyed
// server requests keep their native origins, so open tabs and service bindings work.
export function canonicalDocument(request, env = {}) {
  const u = new URL(request.url), site = env.APPS_SITE || "inflite.ai";
  const name = u.hostname.endsWith("." + site) ? u.hostname.slice(0, -site.length - 1) : "";
  // Chat keys/outbox, Fitness imports and Markets pending edits can still be
  // local to a legacy origin; Weather also keeps in-flight sign-in words. Preserve those documents as recovery entry points;
  // every newly generated navigation link nevertheless points directly to apex.
  if (name !== "status") return null;
  if (!["GET", "HEAD"].includes(request.method) || (request.headers.has("X-Hub-Key") || request.headers.get("X-Hub-Ok") === "1")) return null;
  if (/^\/(?:api(?:\/|$)|_hub(?:\/|$)|\.well-known(?:\/|$)|version$)/.test(u.pathname)) return null;
  const dest = request.headers.get("Sec-Fetch-Dest");
  if (dest ? dest !== "document" : !/text\/html/i.test(request.headers.get("Accept") || "")) return null;
  let path = u.pathname === "/index.html" ? "/" : u.pathname;
  if (name === "chat" && /^\/pigeon(?:\/|$)/.test(path)) path = path.slice(7) || "/";
  return new Response(null, { status: 308, headers: { Location: publicApp(name, env, request) + path + u.search, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
