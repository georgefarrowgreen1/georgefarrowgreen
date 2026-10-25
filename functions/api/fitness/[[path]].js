// Fitness's own API, at fitness.georgefarrowgreen.com only, and only signed in with the site's account (the site's
// cookie, from Fitness's own pages: functions/_fitness.js has what's kept and how).
//   GET    /api/fitness/me            who's signed in, your record (numbers, plan, workouts, choices) and your activities' rows
//   PUT    /api/fitness/me            a change to your record, from the version it was made from (409, with the record now,
//                                    where another device has changed it since)
//   POST   /api/fitness/acts          an activity: its figures (meta, as the phone worked them out) and its file, as imported
//   GET    /api/fitness/acts/<id>     an activity's file
//   PATCH  /api/fitness/acts/<id>     renamed
//   DELETE /api/fitness/acts/<id>
//   GET    /api/fitness/garmin        Garmin Connect (functions/_garmin.js): connected or not, and the activities waiting
//   POST   /api/fitness/garmin        your Personal API key, tried and kept → as GET
//   DELETE /api/fitness/garmin        the key forgotten
//   POST   /api/fitness/garmin/fetch  what's new asked for now (as the app opens; force, for Check now) → as GET
//   GET    /api/fitness/garmin/new/<id>  a waiting activity's file, as Garmin gave it (a zip of its FIT file)
//   DELETE /api/fitness/garmin/new/<id>  read, and not to be kept (one you have already, or that can't be read)
//   POST   /api/fitness/garmin-tick   the site's scheduler's turn (workers/ticker), with its secret
//   POST   /api/fitness/handback      signed in on the account's page, for Fitness: its code swapped for the sign-in
//   POST   /api/fitness/account-link  the account's page, opened signed in as you
//   POST   /api/fitness/signout       and the profile (your photo, name and handle), as on every page of the site
import { HttpError, db, hex, sha256, limit, randomToken, issueSession, logError } from "../../_pigeon.js";
import { cookieUser, sameOrigin, withCookie, withSession } from "../../_account.js";
import { takeHandback } from "../../_handback.js";
import { accountRoutes, json, body, signedIn } from "../../_accountapi.js";
import { isFitness } from "../../_fitapp.js";
import { tickAuthOk } from "../../_notify.js";
import { connect, disconnect, fetchNew, garminOf, waitingFile, done, garminTick } from "../../_garmin.js";
import { kept, saveState, cleanState, cleanAct, activities, addActivity, activityFile, renameActivity, deleteActivity, MAX_FILE } from "../../_fitness.js";

// The account as Fitness shows it: who (the profile), what's kept, and the activities
async function view(env, u) {
  const [k, acts, garmin] = await Promise.all([kept(env, u.id), activities(env, u.id), garminOf(env, u.id).catch(() => ({ on: false }))]);
  return { signedIn: true, id: u.id, name: u.name, handle: u.handle, email: u.email, emailOk: !!u.email_ok, photoAt: u.avatar_at || null, ver: k.ver, data: k.data, acts, garmin };
}
const ID = /^[A-Za-z0-9_-]{1,40}$/;

const ROUTES = {
  "GET me": async ({ request, env }) => {
    const u = await cookieUser(request, env);
    if (!u) return json({ signedIn: false });
    return withCookie(json(await view(env, u)), request, env, u.token);
  },
  "PUT me": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 512 * 1024);
    await limit(env, `fxstate:${u.id}`, 600, 3600e3);
    const r = await saveState(env, u.id, Number.isInteger(b.base) ? b.base : -1, cleanState(b.data));
    return json(r, r.conflict ? 409 : 200);
  },
  // (a form: meta, the activity's figures as JSON, and file)
  "POST acts": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    const said = Number(request.headers.get("Content-Length"));
    if (!(said <= MAX_FILE + 64 * 1024)) throw new HttpError(413, "That file is too big to keep (25 MB at most).");
    let form;
    try { form = await request.formData(); } catch (_) { throw new HttpError(400, "Bad request."); }
    const file = form.get("file"), metaText = form.get("meta");
    if (!file || typeof file === "string" || typeof metaText !== "string" || metaText.length > 16 * 1024) throw new HttpError(400, "Bad request.");
    let meta; try { meta = cleanAct(JSON.parse(metaText)); } catch (e) { throw e instanceof HttpError ? e : new HttpError(400, "Bad request."); }
    const r = await addActivity(env, u.id, meta, new Uint8Array(await file.arrayBuffer()));
    // (one that was waiting from Garmin: waiting no longer; a multisport file's parts are g<id>-2 and on)
    const g = /^g(\d{1,20})(-\d+)?$/.exec(meta.id);
    if (g) await done(env, u.id, g[1]);
    return json(r);
  },
  "GET acts/:id": async ({ request, env, id }) => {
    const u = await signedIn(request, env), f = await activityFile(env, u.id, id);
    // (the same address only ever has the same file: kept by this browser, for this account's pages alone)
    return new Response(f.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  },
  "PATCH acts/:id": async ({ request, env, id }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    await renameActivity(env, u.id, id, b.name);
    return json({ ok: true });
  },
  "DELETE acts/:id": async ({ request, env, id }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await deleteActivity(env, u.id, id);
    return json({ ok: true });
  },
  "GET garmin": async ({ request, env }) => json(await garminOf(env, (await signedIn(request, env)).id)),
  "POST garmin": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 8 * 1024);
    return json(await connect(env, u.id, b.key));
  },
  "DELETE garmin": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await disconnect(env, u.id);
    return json({ on: false });
  },
  "POST garmin/fetch": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    if (b.force) await limit(env, `fxgarminnow:${u.id}`, 30, 3600e3);
    return json(await fetchNew(env, u.id, { force: b.force === true }));
  },
  "GET garmin/new/:id": async ({ request, env, id }) => {
    const u = await signedIn(request, env);
    return new Response(await waitingFile(env, u.id, id), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  },
  "DELETE garmin/new/:id": async ({ request, env, id }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await done(env, u.id, id);
    return json({ ok: true });
  },
  "POST garmin-tick": async ({ request, env }) => { tickAuthOk(request, env); return json(await garminTick(env)); },
  // Signed in on the account's page, for Fitness (functions/_handback.js): the code it was handed back with, and the
  // word Fitness kept for it; where the browser shares the site's sign-in, it's the one the page just made, and that's
  // all; where it doesn't (a Home Screen app, or a test server's separate addresses), Fitness's own, given to the browser
  // and no fresher than the page's
  "POST handback": async ({ request, env }) => {
    sameOrigin(request);
    const { row, u, authAt } = await takeHandback(env, request, "fitness", await body(request));
    const c = await cookieUser(request, env).catch(() => null);
    if (c && c.sessionHash === row.session) return withCookie(json(await view(env, c)), request, env, c.token);
    const token = await issueSession(env, u.id, request, authAt);
    return withSession(json(await view(env, u)), request, env, hex(await sha256(token)), true);
  },
  // The account's own page, opened signed in as you (Fitness's account card): a code good once, for a minute, for this
  // sign-in, which the page swaps for one of its own, in whichever browser it opens in
  "POST account-link": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), D = await db(env), t = Date.now();
    await limit(env, "handoff:" + u.id, 30, 15 * 60e3);
    const code = randomToken(24);
    await D.batch([D.prepare("DELETE FROM pg_handoff WHERE expires < ?").bind(t),
      D.prepare("INSERT INTO pg_handoff (hash, user_id, session, expires) VALUES (?, ?, ?, ?)").bind(hex(await sha256(code)), u.id, u.sessionHash, t + 60e3)]);
    return json({ code });
  },
  // signing out, and the profile, as on every such page on the site (signing in is the account's page's)
  ...accountRoutes(view, { signIn: false }),
};

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url), parts = [].concat(ctx.params.path || []);
  const id = parts[0] === "acts" && parts.length === 2 && ID.test(parts[1]) ? parts[1]
    : parts[0] === "garmin" && parts[1] === "new" && parts.length === 3 && /^\d{1,20}$/.test(parts[2]) ? parts[2] : null;
  const route = ROUTES[`${ctx.request.method} ${id ? parts.slice(0, -1).join("/") + "/:id" : parts.join("/")}`];
  // (only at Fitness's own address; the scheduler's turn at the site's own, as InFlight's and Weather's are)
  const tick = parts[0] === "garmin-tick" && url.hostname === "georgefarrowgreen.pages.dev";
  if (!route || !(isFitness(url, ctx.env) || tick)) return json({ error: "Not found." }, 404);
  try { return await route({ ...ctx, id }); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    await logError(ctx.env, "fitness api", e);
    return json({ error: "Something went wrong. Try again in a moment." }, 500);
  }
}
