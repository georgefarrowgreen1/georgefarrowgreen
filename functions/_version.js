// Each app's version as it's deployed, for the updater every app shares (InFlite's menu: IFL.updates): GET /version at
// each app's own address → { app, build, min }. build: from the app's own script as it's deployed (its BUILD, or Chat's
// APP_VERSION), the number InFlite's menu shows, raised with every change that goes out; so a copy that's running
// knows it's behind by the number it carries. min: a version every copy is to update to as soon as it's not in your
// way (REQUIRED, below), for a fix that can't wait for a quiet moment. Read once a minute at most, never kept by a
// browser. (Mail, the inflite repo's Worker, answers its own: /api/version.)
const SOURCES = { chat: ["/pigeon/app.js", "APP_VERSION"], weather: ["/weather/app.js", "BUILD"], fitness: ["/fitness/app.js", "BUILD"],
  markets: ["/markets/app.js", "BUILD"], account: ["/account/app.js", "BUILD"] };
// (a version each app's copies must have: { markets: "1.76" }, set with a release that can't wait; none for now)
export const REQUIRED = {};
const memo = new Map();
export async function buildOf(ctx, url, app) {
  const hit = memo.get(app);
  if (hit && Date.now() - hit.at < 60e3) return hit.build;
  const [path, name] = SOURCES[app];
  let build = null;
  try {
    const r = await ctx.env.ASSETS.fetch(new Request(new URL(path, url)));
    if (r.ok) build = new RegExp(`\\bconst ${name} = "([0-9.]+)"`).exec(await r.text())?.[1] || null;
  } catch (_) {}
  if (build) memo.set(app, { build, at: Date.now() });
  return build;
}
export async function versionResponse(ctx, url, app) {
  const build = await buildOf(ctx, url, app);
  return new Response(JSON.stringify({ app, build, min: REQUIRED[app] || null }), { status: build ? 200 : 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" } });
}
