// Fitness's own API, at fitness.inflite.ai only, and only signed in with the site's account (the site's
// cookie, from Fitness's own pages: functions/_fitness.js has what's kept and how).
//   POST   /api/fitness/routes/generate  bicycle loops from a GPS point, duration and surface
//   GET|PUT|DELETE /api/fitness/routes/plan the account’s planned route and departure
//   GET    /api/fitness/me            who's signed in, your record (numbers, plan, workouts, choices) and your activities' rows
//                                    (?since=<ms>: only those changed since, and every one's id); your rides' times of day
//                                    (times: today and the next 7 days; ?tz=<zone>: the phone's, for which days those are);
//                                    and, only with ?today=1 (sent by this build of Fitness on), InFlite Today's own rides
//                                    among the plans waiting (offers), each with whether a tap kept it
//   PUT    /api/fitness/time          a ride's time of day, set in Fitness (Ride At): { day, start, stop, tz } (functions/
//                                    _fittimes.js) → { time: { day, start, stop, source: "set" } }
//   DELETE /api/fitness/time          and cleared: { day } → { ok: true }
//   PUT    /api/fitness/me            a change to your record, from the version it was made from (409, with the record now,
//                                    where another device has changed it since)
//   POST   /api/fitness/acts          an activity: its figures (meta, as the phone worked them out) and its file, as imported
//   GET    /api/fitness/acts/<id>     an activity's file
//   PUT    /api/fitness/acts/<id>     its file again, made smaller by the phone (as FIT, gzipped): a form, meta ({ type,
//                                    file }) and file
//   PATCH  /api/fitness/acts/<id>     renamed ({ name }), or figures added ({ route, drift, late20, xv })
//   DELETE /api/fitness/acts/<id>
//   GET    /api/fitness/garmin        Garmin Connect (functions/_garmin.js): connected or not, and the activities waiting
//   POST   /api/fitness/garmin        your Personal API key, tried and kept → as GET
//   DELETE /api/fitness/garmin        the key forgotten
//   POST   /api/fitness/garmin/fetch  what's new asked for now (as the app opens; force, for Check now) → as GET
//   POST   /api/fitness/garmin/all    all your history on Garmin, not just six months: walked through, oldest first → as GET
//   GET    /api/fitness/garmin/new/<id>  a waiting activity's file, as Garmin gave it (a zip of its FIT file)
//   DELETE /api/fitness/garmin/new/<id>  read, and not to be kept (one you have already, or that can't be read)
//   GET    /api/fitness/health        Apple Health, by a Shortcut (functions/_health.js): on or not, what it last sent, your nights
//   POST   /api/fitness/health/key    a new key for the Shortcut (any old one stops working), shown this once → as GET, and { key }
//   DELETE /api/fitness/health        off: the key and the nights forgotten
//   POST   /api/fitness/health/<key>  the Shortcut's morning post, its key in the address (or to /health, with the key as
//                                    Authorization: Bearer): not signed in, from the phone's Shortcuts; { hrv, rhr, sleep,
//                                    day? }, as JSON or a form
//   GET    /api/fitness/weather      the week's weather where you ride, hour by hour (functions/_fitwx.js)
//   GET    /api/fitness/push-key     the key push subscriptions are made with
//   POST   /api/fitness/push         the morning notification on this phone: { sub, at, tz, days } (functions/_fitpush.js)
//   POST   /api/fitness/push-move    the browser renewed its subscription: { was, sub } (fitness/sw.js)
//   DELETE /api/fitness/push         and off again: { endpoint }
//   POST   /api/fitness/today        the coming days as this phone has them planned, for InFlite Today: { tz, units, days }
//                                    (functions/_fittoday.js), sent by the app as it opens
//   POST   /api/fitness/offers/<id>  a plan from Chat (GET me's offers: functions/_fitshare.js) answered: { answer: "yes" }
//                                    as it's added to your plan here, or "no"; and one of Today's own rides: "yes" as it's
//                                    added or kept here, "no" as it's undone (from added, too)
//   POST   /api/fitness/garmin-tick   the site's scheduler's turn (workers/ticker), with its secret: Garmin's look for
//                                    what's new, and the morning notifications that are due
//   POST   /api/fitness/handback      signed in on the account's page, for Fitness: its code swapped for the sign-in
//   POST   /api/fitness/account-link  the account's page, opened signed in as you
//   POST   /api/fitness/signout       and the profile (your photo, name and handle), as on every page of the site
import { cleanQuery, generateRoutes, routePlan, saveRoutePlan, dropRoutePlan, ROUTER_URL } from "../../_fitroutes.js";
import { tickHost } from "../../_sites.js";
import { HttpError, db, hex, sha256, limit, randomToken, issueSession, logError, clientNet, UUID_RE, pace } from "../../_pigeon.js";
import { cookieUser, sameOrigin, withCookie, withSession } from "../../_account.js";
import { takeHandback } from "../../_handback.js";
import { accountRoutes, json, body, signedIn } from "../../_accountapi.js";
import { isFitness } from "../../_fitapp.js";
import { tickAuthOk } from "../../_notify.js";
import { connect, disconnect, fetchNew, garminOf, waitingFile, done, garminTick, allHistory, bringingBack } from "../../_garmin.js";
import { pushKey, setMorning, moveMorning, stopMorning, morningTick } from "../../_fitpush.js";
import { newKey as healthKey, forget as healthOff, healthOf, takeNight, keyFirst, readBody as healthBody } from "../../_health.js";
import { rideWeather } from "../../_fitwx.js";
import { setSnapshot } from "../../_fittoday.js";
import { connectUrl, connectBack, fetchStrava, stravaAll, stravaOf, sWaitingFile, sDone, disconnectStrava, hookCheck, hookEvent, stravaTick, stravaShare } from "../../_strava.js";
import { offersFor, answerOffer } from "../../_fitshare.js";
import { timesOf, setTime, dropTime } from "../../_fittimes.js";
import { zoneOk } from "../../../pigeon/cards.js";
import { kept, saveState, cleanState, cleanAct, activities, olderActs, dropFrom, addActivity, activityFile, renameActivity, deleteActivity, replaceFile, addFigures, MAX_FILE } from "../../_fitness.js";

// (a day's key, "YYYY-MM-DD", on a zone's clock; and the days a phone's today and next 7 are, in its zone, or wherever
// they could be on Earth's clocks where it didn't say: twelve hours behind to fourteen ahead)
// (one formatter kept per zone, at most 500 of them: a zone's name may be written any number of ways)
const DAYKEYS = new Map();
const fmtOf = (tz) => { let f = DAYKEYS.get(tz); if (!f) { if (DAYKEYS.size >= 500) DAYKEYS.clear(); f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }); DAYKEYS.set(tz, f); } return f; };
const dayIn = (tz, t) => fmtOf(tz).format(new Date(t));
const WEEK = 7 * 86400e3;
const weekOf = (tz, t) => (zoneOk(tz) ? [dayIn(tz, t), dayIn(tz, t + WEEK)] : [dayIn("UTC", t - 12 * 3600e3), dayIn("UTC", t + 14 * 3600e3 + WEEK)]);
// The account as Fitness shows it: who (the profile), what's kept, and the activities
// (since: the phone has the rest, as of then; only what's changed since, and every id, so it knows what's gone; at: now,
// for next time, a moment early so nothing changing as it's read is missed; offers: plans agreed in Chat, waiting to be
// added here or added, read without changing anything, and, with today, InFlite Today's own rides too, those undone
// (said no to) among them till they're past their time; offersToday: true only then, and only where they were read (one
// that failed answers none, without it, so Fitness changes nothing by them); times: the rides' times of day, today's and
// the next 7 days' (tz: the phone's zone, which says which days those are); t: the route's time)
async function view(env, u, since = null, { today = false, tz = null, t = Date.now() } = {}) {
  const at = t - 2000, [from, to] = weekOf(tz, t);
  const [k, got, garmin, health, strava, offers, times] = await Promise.all([kept(env, u.id), activities(env, u.id, since), garminOf(env, u.id).catch(() => ({ on: false })), healthOf(env, u.id).catch(() => ({ on: false })), stravaOf(env, u.id).catch(() => ({ on: false })),
    (today ? offersFor(env, u.id, { today: true, t, undone: true, strict: true }) : offersFor(env, u.id)).catch(() => null),
    timesOf(env, u.id, from, to).then((rows) => rows.map((r) => ({ day: r.day, start: r.start, stop: r.stop, source: r.source })), () => [])]);
  return { signedIn: true, id: u.id, name: u.name, handle: u.handle, email: u.email, emailOk: !!u.email_ok, photoAt: u.avatar_at || null, ver: k.ver, data: k.data, acts: got.acts, ...(got.more ? { more: true } : {}), ...(got.ids ? { ids: got.ids, since } : {}), at, garmin, health, strava,
    offers: offers || [], ...(today && offers ? { offersToday: true } : {}), times,
    // (the look, as the account has it: its page's Appearance)
    appearance: ["light", "dark"].includes(u.appearance) ? u.appearance : "auto" };
}
const ID = /^[A-Za-z0-9_-]{1,40}$/;

const routing = new Set();
const ROUTES = {
  "POST routes/generate": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 1024);
    cleanQuery(b);
    if (!env.ROUTING_APP?.fetch) throw new HttpError(503, "InFlite’s UK router is not ready yet. Please try again shortly.");
    if (routing.has(u.id)) throw new HttpError(409, "A route is already being planned. Please wait.");
    routing.add(u.id);
    try {
      await limit(env, `fxroutes:${u.id}`, 12, 3600e3);
      await limit(env, 'fxroutes:capacity', 600, 3600e3, 9);
      let signal; try { signal = request.signal; } catch {}
      return json(await generateRoutes(b, { endpoint: ROUTER_URL, fetcher: (url, init) => env.ROUTING_APP.fetch(new Request(url, init)), signal }));
    } finally { routing.delete(u.id); }
  },
  "GET routes/plan": async ({ request, env }) => {
    const u = await signedIn(request, env);
    return json({ plan: await routePlan(env, u.id) });
  },
  "PUT routes/plan": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 768 * 1024);
    await pace(env, `fxrouteplan:${u.id}`, 60, 3600e3);
    return json({ plan: await saveRoutePlan(env, u.id, b) });
  },
  "DELETE routes/plan": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 1024);
    if (typeof b.id !== 'string' || !/^r-[a-zA-Z0-9_-]{8,64}$/.test(b.id) || !UUID_RE.test(b.version || '')) throw new HttpError(400, "Choose the route to remove.");
    await pace(env, `fxrouteplan:${u.id}`, 60, 3600e3);
    await dropRoutePlan(env, u.id, { expected: b.id, version: b.version });
    return json({ plan: await routePlan(env, u.id) });
  },
  "GET me": async ({ request, env }) => {
    const u = await cookieUser(request, env);
    if (!u) return json({ signedIn: false });
    const q = new URL(request.url).searchParams, since = Number(q.get("since")), t = Date.now();
    return withCookie(json(await view(env, u, Number.isFinite(since) && since > 0 ? since : null, { today: q.get("today") === "1", tz: q.get("tz"), t })), request, env, u.token);
  },
  // (the rest of your activities, older than one the phone has: a page at a time, after the newest came with me)
  "GET me/older": async ({ request, env }) => {
    const u = await signedIn(request, env), q = new URL(request.url).searchParams, start = Number(q.get("start")), id = q.get("id") || "";
    if (!Number.isFinite(start) || !ID.test(id)) throw new HttpError(400, "Bad request.");
    return json(await olderActs(env, u.id, start, id));
  },
  "PUT me": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 512 * 1024);
    await pace(env, `fxstate:${u.id}`, 600, 3600e3);
    const r = await saveState(env, u.id, Number.isInteger(b.base) ? b.base : -1, cleanState(b.data));
    return json(r, r.conflict ? 409 : 200);
  },
  // (a form: meta, the activity's figures as JSON, and file)
  "POST acts": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    const said = Number(request.headers.get("Content-Length"));
    // (its size said up front, and no more than that: one that doesn't say isn't read)
    if (!(said > 0)) throw new HttpError(411, "Bad request.");
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
    // (and Strava's: s<id>)
    const sv = /^s(\d{1,20})(-\d+)?$/.exec(meta.id);
    if (sv) await sDone(env, u.id, sv[1]);
    return json(r);
  },
  "GET acts/:id": async ({ request, env, id }) => {
    const u = await signedIn(request, env), f = await activityFile(env, u.id, id);
    // (not kept by the browser: a shared computer's next account mustn't find it there; the app keeps its own copy,
    // cleared as you sign out)
    return new Response(f.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  },
  "PUT acts/:id": async ({ request, env, id }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    const said = Number(request.headers.get("Content-Length"));
    if (!(said > 0)) throw new HttpError(411, "Bad request.");
    if (!(said <= MAX_FILE + 16 * 1024)) throw new HttpError(413, "That file is too big to keep (25 MB at most).");
    let form;
    try { form = await request.formData(); } catch (_) { throw new HttpError(400, "Bad request."); }
    const file = form.get("file"), metaText = form.get("meta");
    if (!file || typeof file === "string" || typeof metaText !== "string" || metaText.length > 4096) throw new HttpError(400, "Bad request.");
    let meta; try { meta = JSON.parse(metaText); } catch (_) { throw new HttpError(400, "Bad request."); }
    return json(await replaceFile(env, u.id, id, { type: meta?.type, file: meta?.file }, new Uint8Array(await file.arrayBuffer())));
  },
  "PATCH acts/:id": async ({ request, env, id }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    if (b.name === undefined) await addFigures(env, u.id, id, b);
    else await renameActivity(env, u.id, id, b.name);
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
    // (and, where asked, every activity it brought in)
    const gone = new URL(request.url).searchParams.get("acts") === "1" ? await dropFrom(env, u.id, "g") : 0;
    return json({ on: false, gone });
  },
  "POST garmin/fetch": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    // (all your history coming in: a batch a time, so many more)
    // (the bigger budget only while the server has all your history coming in: not for the asking)
    const all = b.all === true && (await bringingBack(env, u.id));
    if (b.force) await limit(env, all ? `fxgarminallnow:${u.id}` : `fxgarminnow:${u.id}`, all ? 600 : 30, 3600e3);
    return json(await fetchNew(env, u.id, { force: b.force === true }));
  },
  "POST garmin/all": async ({ request, env }) => {
    sameOrigin(request);
    return json(await allHistory(env, (await signedIn(request, env)).id));
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
  // ---- Strava: connected by Strava's own sign-in (functions/_strava.js) ----
  "GET strava": async ({ request, env }) => json(await stravaOf(env, (await signedIn(request, env)).id)),
  "POST strava/connect": async ({ request, env }) => {
    sameOrigin(request);
    return json(await connectUrl(env, (await signedIn(request, env)).id, new URL(request.url).origin));
  },
  // (back from Strava's page, a whole page's visit: to the app, saying how it went)
  "GET strava/back": async ({ request, env }) => {
    const url = new URL(request.url), u = await cookieUser(request, env).catch(() => null);
    const said = u ? await connectBack(env, u.id, url.searchParams) : "error";
    return new Response(null, { status: 302, headers: { Location: `${url.origin}/#strava=${said}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  },
  "DELETE strava": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await disconnectStrava(env, u.id);
    const gone = new URL(request.url).searchParams.get("acts") === "1" ? await dropFrom(env, u.id, "s") : 0;
    return json({ on: false, ready: true, gone });
  },
  "POST strava/fetch": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    if (b.force) await limit(env, `fxstravanow:${u.id}`, 30, 3600e3);
    // (Strava's allowance is the whole app's, not each person's: asks made now take no more than their share of it
    // (functions/_strava.js stravaShare); past that, the scheduler's turns carry on, and the app's told Strava's busy)
    if (b.force === true && !(await stravaShare(env))) return json({ ...(await fetchStrava(env, u.id)), said: "busy" });
    return json(await fetchStrava(env, u.id, { force: b.force === true }));
  },
  "POST strava/all": async ({ request, env }) => {
    sameOrigin(request);
    return json(await stravaAll(env, (await signedIn(request, env)).id));
  },
  "GET strava/new/:id": async ({ request, env, id }) => {
    const u = await signedIn(request, env);
    return new Response(await sWaitingFile(env, u.id, id), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
  },
  "DELETE strava/new/:id": async ({ request, env, id }) => {
    sameOrigin(request);
    await sDone(env, (await signedIn(request, env)).id, id);
    return json({ ok: true });
  },
  // (Strava's word, from Strava: its check as the subscription's made, and each event after; answered at once)
  "GET strava/hook": async ({ request, env }) => json(await hookCheck(env, new URL(request.url).searchParams)),
  "POST strava/hook": async ({ request, env }) => {
    await pace(env, `fxstravahook:${clientNet(request)}`, 300, 3600e3);
    await hookEvent(env, await body(request, 16 * 1024).catch(() => null)).catch((e) => console.error("strava hook", e.message));
    return json({ ok: true });
  },
  "GET health": async ({ request, env }) => json(await healthOf(env, (await signedIn(request, env)).id)),
  "POST health/key": async ({ request, env }) => {
    sameOrigin(request);
    return json(await healthKey(env, (await signedIn(request, env)).id));
  },
  "DELETE health": async ({ request, env }) => {
    sameOrigin(request);
    return json(await healthOff(env, (await signedIn(request, env)).id));
  },
  // (from Shortcuts on the phone, not the page: its key, not the site's cookie, says whose it is)
  "POST health": async ({ request, env }) => { keyFirst(request); return json(await takeNight(env, request, await healthBody(request))); },
  "POST health/:id": async ({ request, env, id }) => { keyFirst(request, id); return json(await takeNight(env, request, await healthBody(request), id)); },
  // (the weather for a ride today: functions/_fitwx.js; none, where it can't be had)
  "GET weather": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await pace(env, `fxwx:${u.id}`, 120, 3600e3);
    try { return json(await rideWeather(env, u.id, request)); } catch (e) { return json({ place: null, error: "The forecast isn’t available right now." }); }
  },
  "GET push-key": async ({ env }) => json({ key: await pushKey(env) }),
  "POST push": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    return json(await setMorning(env, u.id, await body(request, 16 * 1024), u.sessionHash || null));
  },
  "POST push-move": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    return json(await moveMorning(env, u.id, await body(request, 8 * 1024), u.sessionHash || null));
  },
  "DELETE push": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    await stopMorning(env, u.id, b.endpoint);
    return json({ on: false });
  },
  // (the coming days, for InFlite Today: what's planned each, as this phone has it, kept in place of the last)
  "POST today": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await pace(env, `fxtoday:${u.id}`, 120, 3600e3);
    return json(await setSnapshot(env, u.id, await body(request, 32 * 1024)));
  },
  // (a plan from Chat: added to your plan here, so yes, or not wanted, no; the plan itself is the phone's to change. And
  // one of Today's own rides: yes as it's added or kept here (a tap, so it's taken), no as it's undone, from added too)
  "POST offers/:id": async ({ request, env, id }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 4 * 1024), t = Date.now();
    await pace(env, `fxoffer:${u.id}`, 120, 3600e3);
    if (!(await answerOffer(env, u.id, id, b.answer, { t }))) throw new HttpError(404, "That plan isn’t there any more.");
    return json({ ok: true });
  },
  // (a ride's time of day, set here: Ride At on today's session, or any of the coming week's; one a day, in place of
  // any other that day, Today's included; and cleared. functions/_fittimes.js checks the time: five-minute steps, 15
  // minutes to 6 hours, on the day it says in the zone it says)
  "PUT time": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 1024), t = Date.now();
    await pace(env, `fxtime:${u.id}`, 120, 3600e3);
    const row = { day: b?.day, start: b?.start, stop: b?.stop, tz: b?.tz, sport: "ride", source: "set" };
    if (Number.isSafeInteger(row.stop) && row.stop <= t) throw new HttpError(409, "That time has passed.");
    if (Number.isSafeInteger(row.start) && row.start > t + WEEK + 86400e3) throw new HttpError(400, "Choose a time in the coming week.");
    const x = await setTime(env, u.id, row, { t });
    return json({ time: { day: x.day, start: x.start, stop: x.stop, source: x.source } });
  },
  "DELETE time": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request, 1024);
    await pace(env, `fxtime:${u.id}`, 120, 3600e3);
    if (typeof b?.day !== "string" || !/^\d{4}-\d\d-\d\d$/.test(b.day)) throw new HttpError(400, "Bad request.");
    await dropTime(env, u.id, b.day);
    return json({ ok: true });
  },
  "POST garmin-tick": async ({ request, env }) => {
    tickAuthOk(request, env);
    // (the morning's notices first, quick and due now, so a slow Garmin or Strava can't hold them past the tick's time)
    const morning = await morningTick(env).catch(() => null);
    const [garmin, strava] = await Promise.all([garminTick(env), stravaTick(env).catch(() => null)]);
    return json({ ...garmin, morning, strava });
  },
  // Signed in on the account's page, for Fitness (functions/_handback.js): the code it was handed back with, and the
  // word Fitness kept for it; where the browser shares the site's sign-in, it's the one the page just made, and that's
  // all; where it doesn't (a Home Screen app, or a test server's separate addresses), Fitness's own, given to the browser
  // and no fresher than the page's
  // (answered as GET me is: with today: 1 and tz, InFlite Today's own rides and the week's times, by the phone's zone)
  "POST handback": async ({ request, env }) => {
    sameOrigin(request);
    const b = await body(request), t = Date.now(), how = { today: b?.today === 1 || b?.today === true, tz: typeof b?.tz === "string" ? b.tz : null, t };
    const { row, u, authAt } = await takeHandback(env, request, "fitness", b);
    const c = await cookieUser(request, env).catch(() => null);
    if (c && c.sessionHash === row.session) return withCookie(json(await view(env, c, null, how)), request, env, c.token);
    const token = await issueSession(env, u.id, request, authAt);
    return withSession(json(await view(env, u, null, how)), request, env, hex(await sha256(token)), true);
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
    : (parts[0] === "garmin" || parts[0] === "strava") && parts[1] === "new" && parts.length === 3 && /^\d{1,20}$/.test(parts[2]) ? parts[2]
    : parts[0] === "health" && parts.length === 2 && /^fxh_[A-Za-z0-9_-]{20,80}$/.test(parts[1]) ? parts[1]
    : parts[0] === "offers" && parts.length === 2 && UUID_RE.test(parts[1]) ? parts[1] : null;
  const route = ROUTES[`${ctx.request.method} ${id ? parts.slice(0, -1).join("/") + "/:id" : parts.join("/")}`];
  // (only at Fitness's own address; the scheduler's turn at the site's own, as Chat's and Weather's are)
  const tick = parts[0] === "garmin-tick" && tickHost(url.hostname, ctx.env);
  if (!route || !(isFitness(url, ctx.env) || tick)) return json({ error: "Not found." }, 404);
  try { return await route({ ...ctx, id }); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    const code = await logError(ctx.env, "fitness api", e);
    return json({ error: "Something went wrong. Try again in a moment.", code }, 500);
  }
}
