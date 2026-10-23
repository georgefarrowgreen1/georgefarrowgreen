import { isOnce, serveOnce, drawMystery, MYSTERY,
  HANDLE_EVERY, MAX_AVATAR, DAY, HOUR, PHOTO_TTL, DEFAULT_KM, HttpError, json, b64url, fromB64url, sha256, hex, safeEqual, randomToken,
  db, body, clientIp, limit, serverSecret, issueSession, requireUser, haversineKm, flightMs, turn,
  TRIPS, swiftState, loft, PIGEONS, LUNAR_LOFTS, spendSwift, msgView, wxOf, claimId, idTaken, RISKY_SPEED, RISKY_LOSS, msgSpeed, gcPoint, REROUTE_KM, MIN_FLIGHT, MAX_FLIGHT, MAX_SCHEDULE, LAYOVER, SPEED_KMH, sweepPhotos, rpIdFor, newChallenge, checkClientData, verifyAssertion,
  HANDLE_RE, UUID_RE, cleanPlace, snapApprox, deviceOf, regionOf, createReset, resetUrl, accountPage, adminLog, RESET_TTL_EMAIL, RESET_TTL_ADMIN, requireFresh, holdHandle, OTHERS, othersOf, FRESH } from "../../_pigeon.js";
import { emailReady, emailFrom, sendEmail, emailBody, ukTime, linkOrigin } from "../../_email.js";
import { isAuthed } from "../../_auth.js";
import { GROUP_ROUTES, groupQs, groupsFrom, GROUP_QS, rerouteGroups, removeFromGroups } from "../../_groups.js";
import { GIF_ROUTES, gifsReady } from "../../_gifs.js";
import { windsFor, windsAlong, forecastFor, ensembleFor, spreadOf } from "../../_weather.js";
import { REACT_ROUTES, reactsFor, dropReacts } from "../../_reacts.js";
import { STATS_ROUTES, skinOpen } from "../../_stats.js";
import { SKIES_ROUTES } from "../../_skies.js";
import { WINDMAP_ROUTES } from "../../_windmap.js";
import { findNear, flockUp, dropNear, renear, nearViews, stopsOf, posAt } from "../../_moments.js";
import { CHEER_ROUTES } from "../../_cheers.js";
import { findFly, dropFly, refly, flyViews, flyOnMine, FLY_ROUTES } from "../../_flyover.js";
import { BIRD_ROUTES, birdsFor, claimBird, freeBird } from "../../_birds.js";
import { PASSPORT_ROUTES, newStamps } from "../../_passport.js";
import { bumpStreak, streakBetween, streakView, ensureStreaks } from "../../_streaks.js";
import { marksFor } from "../../_landmarks.js";
import { FEATHER_ROUTES, balanceOf } from "../../_feathers.js";
import { noteSeason, skinNow } from "../../_seasons.js";
import { NEWS_ROUTES } from "../../_news.js";
import { followMe } from "../../_follow.js";
import { removeAccount, avatarKey } from "../../_accounts.js";
import { cookieToken, withSession, withoutSession, cookieUser, sameOrigin, saltFor, passwordUser, passkeyUser, tellSignIn, accountMail } from "../../_account.js";
import { waitText, setName, setHandle, putPhoto, dropPhoto, photoOf } from "../../_profile.js";
// (a session's hash, from its token)
const hashOf = async (token) => hex(await sha256(token));
import { storageReport } from "../../_retention.js";
import { logEvent, providerOf } from "../../_activity.js";
import { insights } from "../../_insights.js";
import { LOFT_ROUTES } from "../../_loft.js";
import { TRACKER_ROUTES } from "../../_tracker.js";
import { VANISH_ROUTES, vanishFor, pairVanish } from "../../_vanish.js";
import { proofHash, proofOk, lockVault, openVault } from "../../_atrest.js";
import { checkNewSecret, handleFree as handleFreeOf } from "../../_join.js";
import { cleanMoon, endOf, isSpace, spaceFlight, spaceKinds, SPACE_NAME, moonView } from "../../_moon.js";
import { planRoute, timeWay, restOf, squeeze, passed, turnsOf, pathKm, round5, hopsFor, styleOf, STYLES, tire, tiredOf, riskOf, ceilingFor } from "../../_route.js";
import { vapid, pushTo, pushEndpointOk, tick, maybeTick, tickAuthOk, friendRequested, friendAccepted, pigeonSent, pigeonRerouted, prefsOf, cleanPrefs } from "../../_notify.js";

// All of InFlight's API lives under /api/pigeon/*. One router keeps the
// auth, error handling and schema setup in one place.

const MAX_CT = 70000;                 // an encrypted scroll (2,000 characters of text is far less)
const MAX_PHOTO = 8 * 1024 * 1024;    // encrypted photo blob

function meView(u, t) {
  const s = swiftState(u, t), tb = loft(u, "turbo", t), rk = loft(u, "rocket", t), my = loft(u, "mystery", t), ln = loft(u, "lunar", t), lx = loft(u, "lunarx", t), lz = loft(u, "laser", t), ob = loft(u, "orbital", t);
  return { id: u.id, handle: u.handle, name: u.name, email: u.email, pub: JSON.parse(u.pub),
    lat: u.lat, lon: u.lon, place: u.place, swift: s.count, swiftNextAt: s.nextAt, turbo: tb.count, turboNextAt: tb.nextAt, rocket: rk.count, rocketNextAt: rk.nextAt, mystery: my.count, mysteryNextAt: my.nextAt, lunar: ln.count, lunarNextAt: ln.nextAt, lunarx: lx.count, lunarxNextAt: lx.nextAt, laser: lz.count, laserNextAt: lz.nextAt, orbital: ob.count, orbitalNextAt: ob.nextAt, moon: moonView(u), avatarAt: u.avatar_at || null, notifyEmail: !!u.notify_email, notify: prefsOf(u), appearance: u.appearance || null, autoLocation: !!u.auto_loc, risky: !!u.risky, locAt: u.loc_at || null, showOnline: !u.hide_online, receipts: !u.no_receipts, shareNews: !u.hide_news, shareTracker: !u.hide_tracker, approxLocation: !!u.loc_approx, skin: u.skin || null,
    handleNextAt: u.handle_at && t - u.handle_at < HANDLE_EVERY ? u.handle_at + HANDLE_EVERY : null, emailOk: !!u.email_ok };
}

/* ---------------- accounts ----------------
   New accounts are made on the account's own page (account.georgefarrowgreen.com: functions/_join.js), with an
   invite; forgotten passwords are reset there too. InFlight signs in to them. (A copy of the app from before that
   still asks here is told where to go.) */
const elsewhere = (what) => async () => { throw new HttpError(410, `${what} at account.georgefarrowgreen.com.`, "moved"); };

// Confirming the email address: a link to it, good for 7 days. Until then it gets
// nothing but this (and password resets, which prove the same thing). The email is the
// account's (from "Account", to its page: functions/_account.js), as it's the account's
// address; InFlight's older #verify= links still work.
const CONFIRM_TTL = 7 * DAY;
async function sendConfirm(env, u, request) {
  if (!emailReady(env)) return false;
  const token = randomToken(32);
  await (await db(env)).prepare("UPDATE pg_users SET email_code = ?, email_sent = ? WHERE id = ?").bind(hex(await sha256(token)), Date.now(), u.id).run();
  return accountMail(env, u, { icon: "mail", title: "Confirm your email", subject: "Confirm your email for your account", to: u.email, pill: ["mail", u.email], rows: [["Link works", "For 7 days"]], when: false,
    line: "tap the button to confirm this is your email address for your account.",
    after: "It’s where password resets, security notes and any notifications you turn on go. If you didn’t ask for this, ignore it: nothing more will be sent.",
    button: { label: "Confirm email", url: `${accountPage(request, env)}/#confirm=${token}` } }, linkOrigin(request));
}
async function confirmEmail({ request, env, waitUntil }) {
  await limit(env, "confirm:" + clientIp(request), 20, 15 * 60e3);
  const token = String((await body(request)).token || "");
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) throw new HttpError(400, "This confirm link isn’t valid.");
  const D = await db(env), u = await D.prepare("SELECT * FROM pg_users WHERE email_code = ?").bind(hex(await sha256(token))).first();
  if (!u) throw new HttpError(400, "This confirm link has already been used, or a newer one was sent.");
  if (Date.now() - (u.email_sent || 0) > CONFIRM_TTL) throw new HttpError(410, "This confirm link has expired. Send a new one from Privacy & Security.");
  await D.prepare("UPDATE pg_users SET email_ok = ?, email_code = NULL WHERE id = ?").bind(Date.now(), u.id).run();
  waitUntil(logEvent(env, u.id, "email-confirmed", request));
  return json({ ok: true, handle: u.handle });
}
async function confirmResend({ request, env }) {
  const u = await requireUser(request, env);
  if (u.email_ok) return json({ ok: true, already: true });
  if (!emailReady(env)) throw new HttpError(503, "Email isn’t switched on yet.");
  await limit(env, "confirmsend:" + u.id, 3, DAY);
  await sendConfirm(env, u, request);
  return json({ ok: true });
}

// The salt is public input to the phone's password stretching. Unknown emails
// get a stable made-up salt, so this can't be used to test who has an account.
async function salt({ request, env }) {
  return json({ salt: await saltFor(env, request, (await body(request)).email) });
}

// (the checks are the site's, the same wherever its account's signed in to: functions/_account.js)
async function login({ request, env, waitUntil }) {
  const u = await passwordUser(env, request, await body(request));
  const token = await issueSession(env, u.id, request);
  waitUntil(tellSignIn(env, u, request, "Password", linkOrigin(request)).catch(() => {}));
  return withSession(json({ token, me: meView(u, Date.now()), vault: await openVault(env, u.id, u.vault) }), request, env, await hashOf(token));
}

async function logout({ request, env }) {
  const u = await requireUser(request, env);
  await (await db(env)).prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.sessionHash).run();
  // (the browser's sign-in for the whole site too, if it's this one: functions/_account.js)
  const c = cookieToken(request, env);
  return c && u.siteHash && (await hashOf(c)) === u.siteHash ? withoutSession(json({ ok: true }), request, env) : json({ ok: true });
}
// Signed in elsewhere on the site, in this browser, and not here (functions/_account.js): who (and the salt for the
// password), to carry on as; then, with the password's proof, this app's own sign-in, on the same session (the cookie's
// moved to it), and the password-locked key, which the password unlocks on the phone. The cookie alone gets no more.
async function resume({ request, env }) {
  sameOrigin(request);
  const u = await cookieUser(request, env, true), b = await body(request).catch(() => ({}));
  if (!u) return json({ signedIn: false });
  if (!b.proof) return json({ signedIn: true, name: u.name, handle: u.handle, salt: u.salt });
  await limit(env, "reauth:" + u.id, 10, 15 * 60e3);
  if (!(await proofOk(env, b.proof, u.proof_hash))) throw new HttpError(401, "That password didn’t unlock your key.", "password");
  const token = await issueSession(env, u.id, request), D = await db(env);
  await D.batch([D.prepare("UPDATE pg_sessions SET site_hash = ? WHERE hash = ?").bind(u.siteHash, await hashOf(token)),
    D.prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.sessionHash)]);
  return json({ token, me: meView(u, Date.now()), vault: await openVault(env, u.id, u.vault) });
}

// The password-locked key, for a signed-in phone that needs to unlock it again
// (after a passkey sign-in on a phone without PRF support).
async function vault({ request, env }) {
  const u = await requireUser(request, env);
  requireFresh(u);
  return json({ vault: await openVault(env, u.id, u.vault), salt: u.salt });
}
// The same, for a phone that has just been given the password (change
// password, linking a passkey): the password's proof is the check.
async function vaultByProof({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "reauth:" + u.id, 10, 15 * 60e3);
  const b = await body(request);
  if (!(await proofOk(env, b.proof, u.proof_hash))) throw new HttpError(401, "That password isn’t right.", "password");
  await (await db(env)).prepare("UPDATE pg_sessions SET auth_at = ? WHERE hash = ?").bind(Date.now(), u.sessionHash).run();
  return json({ vault: await openVault(env, u.id, u.vault), salt: u.salt });
}

// The recipient has moved: every pigeon flying to them turns in mid-air and
// heads for the new spot from wherever it is now, at its own speed. The turn
// point is kept so the map can draw the path. A pigeon still can't take
// longer than its 3-day limit from when it was sent. Small moves are added up:
// a pigeon turns once you're more than REROUTE_KM from where it's heading, and
// at most every 10 minutes, so a drive doesn't send it zig-zagging.
const TURN_EVERY = 10 * 60e3;
const FORECAST_AHEAD = 72 * 3600e3;          // a pigeon booked further ahead than this flies whatever it meets
// Off the Earth, or back: everything on its way follows (functions/_follow.js)
async function followAll(env, D, u, end, t, waitUntil) {
  const { results: links } = await D.prepare("SELECT a, b, status FROM pg_links WHERE (a = ?1 OR b = ?1) AND status IN ('ok', 'blocked')").bind(u.id).all();
  const other = (l) => (l.a === u.id ? l.b : l.a);
  const friends = new Set(links.filter((l) => l.status === "ok").map(other)), blocked = new Set(links.filter((l) => l.status === "blocked").map(other));
  await followMe(env, D, u, end, t, waitUntil, friends, blocked).catch((e) => console.error("pigeon follow", e && e.message));
}
async function reroute(env, u, p, t, waitUntil) {
  const D = await db(env);
  const { results } = await D.prepare("SELECT * FROM pg_msgs WHERE recipient = ?1 AND deliver_at > ?2 AND to_lat IS NOT NULL AND (lost_at IS NULL OR lost_at > ?2)").bind(u.id, t).all();
  // only a friend's pigeon follows you: one from someone you've blocked or
  // unfriended lands where it was going, and says nothing of where you went
  const pals = new Map(), pal = async (id) => { if (!pals.has(id)) pals.set(id, await areFriends(D, u.id, id)); return pals.get(id); };
  for (const m of results) {
    if (!(await pal(m.sender))) continue;
    const legs = m.legs ? JSON.parse(m.legs) : [];
    if (haversineKm(m.to_lat, m.to_lon, p.lat, p.lon) <= REROUTE_KM) continue;
    // resting with a friend (or on its way to them): it flies on at the same time, to the new spot
    if (m.via && t < m.via_off && legs.length) {
      const [[vLat, vLon]] = legs, ahead = haversineKm(vLat, vLon, p.lat, p.lon);
      const deliver = m.via_off + Math.round(flightMs(ahead / (m.wind_f || 1), msgSpeed(m)));
      const km = m.km - haversineKm(vLat, vLon, m.to_lat, m.to_lon) + ahead;
      const lostAt = m.lost_at == null || m.lost_at < m.via_off ? m.lost_at : Math.round(m.via_off + ((m.lost_at - m.via_off) / (m.deliver_at - m.via_off)) * (deliver - m.via_off));
      const r = await D.prepare(`UPDATE pg_msgs SET wx = NULL, wx_ms = NULL, wx_at = NULL, to_lat = ?, to_lon = ?, to_place = ?, deliver_at = ?, km = ?, lost_at = ?,
        expires_at = CASE WHEN photo = 1 THEN ? ELSE expires_at END WHERE id = ? AND via_off > ? AND recalled = 0`)
        .bind(p.lat, p.lon, p.place, deliver, km, lostAt, lostAt ?? deliver + PHOTO_TTL, m.id, t).run();
      if (r.meta.changes) { waitUntil(renear(D, m.id, t).catch(() => {})); waitUntil(refly(D, m.id, t).catch(() => {})); }
      if (r.meta.changes) waitUntil(pigeonRerouted(env, m.sender, { ...u, place: p.place }, deliver).catch(() => {}));
      continue;
    }
    // still in its loft: it plans a new take-off so it lands when it was asked to (or as soon as it can)
    if (t < m.sent_at) {
      const plan = await planRoute(env, { from: [m.from_lat, m.from_lon], to: [p.lat, p.lon], weather: false, hop: hopsFor(m.pigeon), style: m.style, ceiling: ceilingFor(m.pigeon), ship: !m.noship }), rest = restOf(plan.way);
      const km = plan.km, flight = Math.round(flightMs(km / (m.wind_f || 1), msgSpeed(m))) + rest;
      const off = Math.max(t, m.deliver_at - flight), deliver = off + flight;
      const way = plan.way.length ? JSON.stringify(timeWay([m.from_lat, m.from_lon], plan.way, [p.lat, p.lon], off, flight - rest).legs) : null;
      const lostAt = m.lost_at == null ? null : Math.round(off + ((m.lost_at - m.sent_at) / (m.deliver_at - m.sent_at)) * flight);
      await D.prepare(`UPDATE pg_msgs SET wx = NULL, wx_ms = NULL, wx_at = NULL, to_lat = ?, to_lon = ?, to_place = ?, km = ?, sent_at = ?, deliver_at = ?, lost_at = ?, legs = ?,
        expires_at = CASE WHEN photo = 1 THEN ? ELSE expires_at END WHERE id = ? AND sent_at > ? AND recalled = 0`)
        .bind(p.lat, p.lon, p.place, km, off, deliver, lostAt, way, lostAt ?? deliver + PHOTO_TTL, m.id, t).run();
      waitUntil(renear(D, m.id, -Infinity).catch(() => {})); waitUntil(refly(D, m.id, -Infinity).catch(() => {}));
      continue;
    }
    const turned = turnsOf(legs).at(-1);                           // (planned bends and cheers aren't turns)
    if (turned && t - turned[2] < TURN_EVERY) continue;
    const speed = msgSpeed(m), latest = m.sent_at + MAX_FLIGHT / speed;
    // on its way by ship (waiting for it, or at sea): the ship sails on, and it turns from where it comes ashore
    const ship = legs.filter((l) => l[3] === "b"), ashore = ship.at(-1);
    let deliver, km;
    if (ashore && ship[0][2] <= t && ashore[2] > t) {
      const keep = legs.filter((l) => l[2] <= ashore[2]), was = pathKm([[ashore[0], ashore[1]], ...legs.filter((l) => l[2] > ashore[2]), [m.to_lat, m.to_lon]]);
      const plan = await planRoute(env, { from: [ashore[0], ashore[1]], to: [p.lat, p.lon], weather: false, hop: hopsFor(m.pigeon), style: m.style, ceiling: ceilingFor(m.pigeon), ship: !m.noship }), rest = restOf(plan.way);
      deliver = ashore[2] + (plan.km / (SPEED_KMH * (m.wind_f || 1))) * 3600e3 / speed + rest;
      km = m.km - was + plan.km;
      legs.length = 0;
      legs.push(...keep, ...timeWay([ashore[0], ashore[1]], plan.way, [p.lat, p.lon], ashore[2], deliver - ashore[2] - rest).legs);
    } else {
      const st = stopsOf(m), [pLat, pLon] = posAt(st, t);                // where it is right now, on the way it was going
      const done = passed(legs, t), flown = pathKm([[m.from_lat, m.from_lon], ...done, [pLat, pLon]]);
      const plan = await planRoute(env, { from: [pLat, pLon], to: [p.lat, p.lon], weather: false, hop: hopsFor(m.pigeon), style: m.style, ceiling: ceilingFor(m.pigeon), ship: !m.noship }), ahead = plan.km, rest = restOf(plan.way);
      const sails = plan.way.some((q) => q.sail);                          // (a voyage on the new way: days more, not a flight's)
      deliver = Math.max(t + MIN_FLIGHT / speed / 5, Math.min(latest + (sails ? 7 * DAY : 0), t + (ahead / (SPEED_KMH * (m.wind_f || 1))) * 3600e3 / speed + rest));
      km = flown + ahead;
      legs.length = 0;
      legs.push(...done, [round5(pLat), round5(pLon), t], ...timeWay([pLat, pLon], plan.way, [p.lat, p.lon], t, deliver - t - rest).legs);
    }
    // a doomed pigeon is still lost before it would land, now on its new course
    const lostAt = m.lost_at == null ? null : m.lost_at < deliver ? m.lost_at : t + (deliver - t) / 2;
    const r = await D.prepare(`UPDATE pg_msgs SET wx = NULL, wx_ms = NULL, wx_at = NULL, to_lat = ?, to_lon = ?, to_place = ?, deliver_at = ?, km = ?, legs = ?, lost_at = ?,
      expires_at = CASE WHEN photo = 1 THEN ? ELSE expires_at END WHERE id = ? AND deliver_at > ? AND recalled = 0`)
      .bind(p.lat, p.lon, p.place, deliver, km, JSON.stringify(legs), lostAt, lostAt ?? deliver + PHOTO_TTL, m.id, t).run();
    if (r.meta.changes) { waitUntil(renear(D, m.id, t).catch(() => {})); waitUntil(refly(D, m.id, t).catch(() => {})); }
    if (r.meta.changes) waitUntil(pigeonRerouted(env, m.sender, { ...u, place: p.place }, deliver).catch(() => {}));
  }
}
async function updateMe({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env), t = Date.now();
  // (the profile's rules are the site's, the same in every app: functions/_profile.js)
  if (b.handle !== undefined) await setHandle(env, u, b.handle);
  if (b.name !== undefined) await setName(env, u, b.name);
  if (b.appearance !== undefined) {
    if (!["light", "dark", "auto"].includes(b.appearance)) throw new HttpError(400, "Choose Light, Dark or Automatic.");
    await D.prepare("UPDATE pg_users SET appearance = ? WHERE id = ?").bind(b.appearance, u.id).run();
  }
  if (b.notify && typeof b.notify === "object")
    await D.prepare("UPDATE pg_users SET notify_prefs = ? WHERE id = ?").bind(JSON.stringify(cleanPrefs(prefsOf(u), b.notify)), u.id).run();
  if (b.notifyEmail !== undefined)
    await D.prepare("UPDATE pg_users SET notify_email = ?, email_at = COALESCE(email_at, ?) WHERE id = ?").bind(b.notifyEmail ? 1 : 0, t, u.id).run();
  if (b.autoLocation !== undefined) await D.prepare("UPDATE pg_users SET auto_loc = ? WHERE id = ?").bind(b.autoLocation ? 1 : 0, u.id).run();
  if (b.risky !== undefined) await D.prepare("UPDATE pg_users SET risky = ? WHERE id = ?").bind(b.risky ? 1 : 0, u.id).run();
  // a rare pigeon: only one whose achievement you've earned (null: back to the usual look)
  if (b.skin !== undefined) {
    if (b.skin !== null && !(await skinOpen(env, u.id, String(b.skin)))) throw new HttpError(403, "Earn its achievement first.");
    await D.prepare("UPDATE pg_users SET skin = ? WHERE id = ?").bind(b.skin, u.id).run();
  }
  if (b.showOnline !== undefined) await D.prepare("UPDATE pg_users SET hide_online = ? WHERE id = ?").bind(b.showOnline ? 0 : 1, u.id).run();
  if (b.receipts !== undefined) await D.prepare("UPDATE pg_users SET no_receipts = ? WHERE id = ?").bind(b.receipts ? 0 : 1, u.id).run();
  if (b.shareNews !== undefined) await D.prepare("UPDATE pg_users SET hide_news = ? WHERE id = ?").bind(b.shareNews ? 0 : 1, u.id).run();
  if (b.shareTracker !== undefined) await D.prepare("UPDATE pg_users SET hide_tracker = ? WHERE id = ?").bind(b.shareTracker ? 0 : 1, u.id).run();
  // Approximate Location: on, the spot already kept becomes approximate at once (off: precise from the next update)
  if (b.approxLocation !== undefined) {
    await D.prepare("UPDATE pg_users SET loc_approx = ? WHERE id = ?").bind(b.approxLocation ? 1 : 0, u.id).run();
    if (b.approxLocation && u.lat != null && b.lat === undefined) { const a = snapApprox(u.lat, u.lon); await D.prepare("UPDATE pg_users SET lat = ?, lon = ? WHERE id = ?").bind(a.lat, a.lon, u.id).run(); }
  }
  // To the Moon: a spot on it, and none on Earth (it isn't kept while you're there); Update
  // Automatically goes off, so the phone doesn't bring you straight back. Setting a place on
  // Earth again (below) brings you home.
  if (b.moon != null && b.lat === undefined) {
    const mn = cleanMoon(b.moon);
    await limit(env, "move:" + u.id, 30, 15 * 60e3);
    await D.prepare("UPDATE pg_users SET moon = ?, lat = NULL, lon = NULL, place = ?, auto_loc = 0, loc_at = ? WHERE id = ?").bind(JSON.stringify(mn.b === "mars" ? { b: "mars", lat: mn.lat, lon: mn.lon } : { lat: mn.lat, lon: mn.lon }), mn.place, t, u.id).run();
    await followAll(env, D, u, endOf({ moon: mn, place: mn.place }), t, waitUntil);    // (what's on its way follows, off the Earth too)
  }
  if (b.lat !== undefined) {
    const p = cleanPlace(b, b.approxLocation ?? !!u.loc_approx);
    if (u.moon) await D.prepare("UPDATE pg_users SET moon = NULL WHERE id = ?").bind(u.id).run();
    const moved = u.lat == null ? Infinity : haversineKm(u.lat, u.lon, p.lat, p.lon);
    if (u.lat != null && moved > 0.1) await limit(env, "move:" + u.id, 30, 15 * 60e3);   // automatic updates check once a minute
    // (the time it was last updated moves only when you do: "still here" every few minutes would say when the app was open)
    await D.prepare("UPDATE pg_users SET lat = ?, lon = ?, place = ?, loc_at = CASE WHEN ?4 THEN ?5 ELSE COALESCE(loc_at, ?5) END WHERE id = ?6").bind(p.lat, p.lon, p.place, moved > REROUTE_KM ? 1 : 0, t, u.id).run();
    if (u.lat != null) { await reroute(env, u, p, t, waitUntil); await rerouteGroups(env, u, p, t, waitUntil); }   // also catches up a turn held back by TURN_EVERY
    // space pigeons on their way follow too (back from the Moon or Mars, or round the Earth by orbit)
    if (u.moon || moved > REROUTE_KM) await followAll(env, D, u, endOf({ lat: p.lat, lon: p.lon, place: p.place }), t, waitUntil);
  }
  const fresh = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ me: meView(fresh, Date.now()) });
}

/* ---------------- profile pictures ----------------
   Not end-to-end encrypted (the server shows them to several people), so
   they're only served to the owner, their friends, people in a group with
   them, and people they've sent a friend request to. Asking to be someone's friend shows you nothing of
   them until they say yes. */
async function putAvatar({ request, env }) {
  const u = await requireUser(request, env), t = await putPhoto(env, u, request);
  return json({ me: meView({ ...u, avatar_at: t }, t) });
}
async function deleteAvatar({ request, env }) {
  const u = await requireUser(request, env);
  await dropPhoto(env, u);
  return json({ me: meView({ ...u, avatar_at: null }, Date.now()) });
}
async function getAvatar({ request, env }, id) {
  const u = await requireUser(request, env);
  id = String(id || "");
  if (id !== u.id) {
    // or someone in a group with you
    const l = await (await db(env)).prepare(`SELECT 1 FROM pg_links WHERE (a = ?2 AND b = ?1 AND status IN ('ok', 'pending')) OR (a = ?1 AND b = ?2 AND status = 'ok')
      UNION ALL SELECT 1 FROM pg_group_members x JOIN pg_group_members y ON y.group_id = x.group_id WHERE x.user_id = ?1 AND y.user_id = ?2
        AND NOT EXISTS (SELECT 1 FROM pg_links k WHERE k.status = 'blocked' AND ((k.a = ?1 AND k.b = ?2) OR (k.a = ?2 AND k.b = ?1))) LIMIT 1`).bind(u.id, id).first();   // (never across a block)
    if (!l) throw new HttpError(404, "No picture.");
  }
  const res = await photoOf(env, id);
  if (!res) throw new HttpError(404, "No picture.");
  return res;
}

async function deleteMe({ request, env }) {
  const u = await requireUser(request, env);
  requireFresh(u);
  await removeAccount(env, u.id);
  return withoutSession(json({ ok: true }), request, env);
}

/* ---------------- passkeys ---------------- */
async function passkeyOptions({ request, env }) {
  const b = await body(request), rpId = rpIdFor(request, env);
  if (b.mode === "register") {
    const u = await requireUser(request, env);
    requireFresh(u);
    const { results } = await (await db(env)).prepare("SELECT id FROM pg_passkeys WHERE user_id = ?").bind(u.id).all();
    return json({ challenge: await newChallenge(env, "register", u.id), rpId,
      user: { id: b64url(new TextEncoder().encode(u.id)), name: u.email, displayName: u.name },
      exclude: results.map((r) => r.id) });
  }
  await limit(env, "pkopt:" + clientIp(request), 60, 15 * 60e3);
  return json({ challenge: await newChallenge(env, "login"), rpId });
}

async function passkeyRegister({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  requireFresh(u);
  const b = await body(request);
  await checkClientData(env, request, b, "webauthn.create", "register", u.id);
  if (b.alg !== -7 && b.alg !== -257) throw new HttpError(400, "This passkey uses a key type InFlight doesn’t support.");
  if (!/^[A-Za-z0-9_-]{16,1400}$/.test(String(b.id || "")) || !/^[A-Za-z0-9_-]{60,1200}$/.test(String(b.publicKey || ""))) throw new HttpError(400, "The passkey response was incomplete.");
  const D = await db(env), provider = providerOf(b.authenticatorData);
  if (await D.prepare("SELECT 1 FROM pg_passkeys WHERE id = ?").bind(b.id).first()) throw new HttpError(409, "This passkey is already saved.");
  await D.prepare("INSERT INTO pg_passkeys (id, user_id, public_key, alg, label, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(b.id, u.id, String(b.publicKey), b.alg, String(b.label || "Passkey").slice(0, 40), provider, Date.now()).run();
  waitUntil(logEvent(env, u.id, "passkey-add", request, provider || String(b.label || "Passkey").slice(0, 40)));
  waitUntil(notifyPasskeyAdded(env, u, String(b.label || "Passkey").slice(0, 40), request).catch(() => {}));
  return json({ ok: true });
}
// Where you're signed in, and signing the others out.
async function sessionsList({ request, env }) {
  const u = await requireUser(request, env);
  // (the account's page opened from an app is part of that app's sign-in, not a phone of its own)
  const { results } = await (await db(env)).prepare(`SELECT hash, label, place, created_at, MAX(seen_at, COALESCE((SELECT MAX(c.seen_at) FROM pg_sessions c WHERE c.parent = s.hash), 0)) AS seen_at
    FROM pg_sessions s WHERE user_id = ? AND parent IS NULL ORDER BY hash = ? DESC, seen_at DESC`).bind(u.id, u.sessionHash).all();
  return json({ sessions: results.map((x) => ({ id: x.hash.slice(0, 16), label: x.label || "A phone or browser", place: x.place || null, createdAt: x.created_at, seenAt: x.seen_at, current: x.hash === u.sessionHash })) });
}
// The keys you've trusted, sealed on your phone to your own key (the server can't
// read or change them): kept so a new phone still notices a key that was swapped.
async function pinsGet({ request, env }) {
  const u = await requireUser(request, env);
  return json({ pins: u.pins || null });
}
async function pinsPut({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "pins:" + u.id, 240, 60 * 60e3);
  const s = String((await body(request)).pins || "");
  if (s.length < 20 || s.length > 200000) throw new HttpError(400, "That was malformed.");
  await (await db(env)).prepare("UPDATE pg_users SET pins = ? WHERE id = ?").bind(s, u.id).run();
  return json({ ok: true });
}
// Your profile (photo, name, handle) is the account's, edited on its own page (account.<site>): InFlight hands its
// sign-in over with a code good once, for a minute, so the page opens signed in as you, in whatever browser it opens in
// (a Home Screen app's links open in the browser, which has its own cookies). The code goes in the address's #, never
// to a server, and the page swaps it straight away (functions/api/account handoff).
async function accountLink({ request, env }) {
  const u = await requireUser(request, env), D = await db(env), t = Date.now();
  await limit(env, "handoff:" + u.id, 30, 15 * 60e3);
  const code = randomToken(24);
  await D.batch([D.prepare("DELETE FROM pg_handoff WHERE expires < ?").bind(t),
    D.prepare("INSERT INTO pg_handoff (hash, user_id, session, expires) VALUES (?, ?, ?, ?)").bind(await hashOf(code), u.id, u.sessionHash, t + 60e3)]);
  return json({ code });
}
async function sessionsEnd({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env);
  requireFresh(u);                 // a stolen sign-in mustn't be able to throw the real one out
  if (b.others) {
    // (and an email change still waiting called off: if a phone here wasn't yours, nor might that be)
    await D.batch([D.prepare(`DELETE FROM pg_sessions WHERE user_id = ? AND ${OTHERS}`).bind(u.id, ...othersOf(u)),
      D.prepare("UPDATE pg_users SET email_new = NULL, email_new_code = NULL, email_new_at = NULL WHERE id = ?").bind(u.id)]);
    waitUntil(logEvent(env, u.id, "signout-others", request));
  }
  else {
    const id = String(b.id || "");
    if (!/^[0-9a-f]{16}$/.test(id)) throw new HttpError(400, "That sign-in wasn’t found.");
    const s = await D.prepare(`SELECT label FROM pg_sessions WHERE user_id = ? AND ${OTHERS} AND substr(hash, 1, 16) = ?`).bind(u.id, ...othersOf(u), id).first();
    await D.prepare(`DELETE FROM pg_sessions WHERE user_id = ? AND ${OTHERS} AND substr(hash, 1, 16) = ?`).bind(u.id, ...othersOf(u), id).run();
    if (s) waitUntil(logEvent(env, u.id, "signout-device", request, s.label || "A phone or browser"));
  }
  return json({ ok: true });
}
// Showing it's you again (password proof, or a passkey) for the few things that need it.
async function reauth({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "reauth:" + u.id, 10, 15 * 60e3);
  const b = await body(request), D = await db(env);
  let ok = false;
  if (b.proof) ok = await proofOk(env, b.proof, u.proof_hash);
  else if (b.authenticatorData) {
    await checkClientData(env, request, b, "webauthn.get", "login");
    const cred = await D.prepare("SELECT * FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id || ""), u.id).first();
    ok = !!cred && await verifyAssertion(cred, request, b, env);
  }
  if (!ok) throw new HttpError(401, b.proof ? "That password isn’t right." : "That passkey didn’t check out.", "password");
  await D.prepare("UPDATE pg_sessions SET auth_at = ? WHERE hash = ?").bind(Date.now(), u.sessionHash).run();
  return json({ ok: true });
}

// A passkey's own copy of the private key, locked with that passkey's PRF secret.
async function passkeyVault({ request, env }) {
  const u = await requireUser(request, env);
  requireFresh(u);
  const b = await body(request);
  const v = String(b.vault || "");
  if (v.length < 20 || v.length > 4000) throw new HttpError(400, "That key copy wasn’t valid.");
  const r = await (await db(env)).prepare("UPDATE pg_passkeys SET vault = ? WHERE id = ? AND user_id = ?").bind(await lockVault(env, u.id, v), String(b.id), u.id).run();
  if (!r.meta.changes) throw new HttpError(404, "That passkey isn’t on your account.");
  return json({ ok: true });
}

async function passkeyLogin({ request, env, waitUntil }) {
  const b = await body(request), { u, cred } = await passkeyUser(env, request, b);
  const token = await issueSession(env, u.id, request);
  waitUntil(tellSignIn(env, u, request, "Passkey", linkOrigin(request)).catch(() => {}));
  return withSession(json({ token, me: meView(u, Date.now()), pkVault: await openVault(env, u.id, cred.vault), vault: await openVault(env, u.id, u.vault), salt: u.salt }), request, env, await hashOf(token));
}

async function passkeyDelete({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  requireFresh(u);
  const b = await body(request), D = await db(env);
  const pk = await D.prepare("SELECT label, provider FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id), u.id).first();
  await D.prepare("DELETE FROM pg_passkeys WHERE id = ? AND user_id = ?").bind(String(b.id), u.id).run();
  if (pk) waitUntil(logEvent(env, u.id, "passkey-remove", request, pk.label || pk.provider || "Passkey"));
  return json({ ok: true });
}

/* ---------------- friends ---------------- */
// Add Friend, as you type: is there someone with this handle, and where do you stand?
// Only the handle comes back (no name or photo until they say yes).
async function friendStatus({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "fstat:" + u.id, 400, 60 * 60e3);
  const h = String(new URL(request.url).searchParams.get("h") || "").trim().replace(/^@/, "").toLowerCase();
  if (!HANDLE_RE.test(h)) return json({ state: "invalid" });
  const D = await db(env), t = await D.prepare("SELECT id, handle FROM pg_users WHERE handle = ?").bind(h).first();
  if (!t) return json({ state: "none", handle: h });
  if (t.id === u.id) return json({ state: "self", handle: h });
  const l = await D.prepare("SELECT * FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(u.id, t.id).first();
  return json({ handle: t.handle, id: t.id, state: linkState(l, u.id) });
}
// Where you stand with someone. A "no" (declined or blocked) never shows to the one
// told it: their request just looks like it's still waiting, or there's none.
const NO = new Set(["declined", "blocked"]);
function linkState(l, me) {
  if (!l) return "new";
  if (l.status === "ok") return "friends";
  if (NO.has(l.status)) return l.a === me ? (l.status === "blocked" ? "blocked" : "new") : l.asked_at ? "sent" : "new";
  return l.a === me ? "sent" : "incoming";
}
const PENDING_MAX = 50;                  // friend requests waiting for one person (older than 30 days go)
async function addFriend({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "friend:" + u.id, 40, 60 * 60e3);
  const handle = String((await body(request)).handle || "").trim().replace(/^@/, "").toLowerCase();
  const D = await db(env);
  const t = await D.prepare("SELECT id, handle FROM pg_users WHERE handle = ?").bind(handle).first();
  if (!t) return json({ message: "No one has that handle. Check the spelling." });
  if (t.id === u.id) return json({ message: "That’s you." });
  const l = await D.prepare("SELECT * FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(u.id, t.id).first();
  if (l?.status === "ok") return json({ message: `@${t.handle} is already in your flock.` });
  if (l && NO.has(l.status)) {
    if (l.a === u.id) {
      if (l.status === "blocked") return json({ message: `You blocked @${t.handle}. Unblock them in Privacy & Security first.` });
      // you said no, then changed your mind: if they still want to, you're friends; if not, it's your request now
      if (l.asked_at) {
        await D.prepare("UPDATE pg_links SET status = 'ok', asked_at = NULL WHERE a = ? AND b = ?").bind(u.id, t.id).run();
        waitUntil(friendAccepted(env, u, t.id).catch(() => {}));
        return json({ message: `@${t.handle} joined your flock.` });
      }
      await D.batch([D.prepare("DELETE FROM pg_links WHERE a = ? AND b = ?").bind(u.id, t.id),
        D.prepare("INSERT INTO pg_links (a, b, status, created_at) VALUES (?, ?, 'pending', ?)").bind(u.id, t.id, Date.now())]);
      waitUntil(friendRequested(env, linkOrigin(request), u, t.id).catch(() => {}));
      return json({ message: `Request sent to @${t.handle}.` });
    }
    // they said no: it looks like any request still waiting, and they hear nothing more
    if (l.asked_at) return json({ message: `Your request to @${t.handle} is still waiting.` });
    await D.prepare("UPDATE pg_links SET asked_at = ? WHERE a = ? AND b = ?").bind(Date.now(), t.id, u.id).run();
    return json({ message: `Request sent to @${t.handle}.` });
  }
  if (l && l.a === u.id) return json({ message: `Your request to @${t.handle} is still waiting.` });
  if (l) {
    await D.prepare("UPDATE pg_links SET status = 'ok' WHERE a = ? AND b = ?").bind(t.id, u.id).run();
    waitUntil(friendAccepted(env, u, t.id).catch(() => {}));
    return json({ message: `@${t.handle} joined your flock.` });
  }
  // a cap on requests waiting for one person, so no one can bury them
  const waiting = await D.prepare("SELECT COUNT(*) AS n FROM pg_links WHERE b = ? AND status = 'pending'").bind(t.id).first();
  if (waiting.n >= PENDING_MAX) return json({ message: `@${t.handle} has a lot of requests waiting. Try again later.` });
  // (only if neither of you has asked in the meantime: two requests crossing make one)
  const ins = await D.prepare("INSERT INTO pg_links (a, b, status, created_at) SELECT ?1, ?2, 'pending', ?3 WHERE NOT EXISTS (SELECT 1 FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(u.id, t.id, Date.now()).run();
  if (!ins.meta.changes) return json({ message: `Something just changed with @${t.handle}. Try again.` });
  waitUntil(friendRequested(env, linkOrigin(request), u, t.id).catch(() => {}));
  return json({ message: `Request sent to @${t.handle}.` });
}
async function respondFriend({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const b = await body(request), D = await db(env);
  if (b.accept) {
    const r = await D.prepare("UPDATE pg_links SET status = 'ok' WHERE a = ? AND b = ? AND status = 'pending'").bind(String(b.id), u.id).run();
    if (r.meta.changes) waitUntil(friendAccepted(env, u, String(b.id)).catch(() => {}));
  }
  // Declining: they aren't told, and can't ask again for 30 days (their request just keeps waiting)
  else await D.batch([
    D.prepare("INSERT OR IGNORE INTO pg_links (a, b, status, created_at, asked_at) SELECT b, a, 'declined', ?3, ?3 FROM pg_links WHERE a = ?1 AND b = ?2 AND status = 'pending'").bind(String(b.id), u.id, Date.now()),
    D.prepare("DELETE FROM pg_links WHERE a = ? AND b = ? AND status = 'pending'").bind(String(b.id), u.id),
  ]);
  return json({ ok: true });
}
async function removeFriend({ request, env }) {
  const u = await requireUser(request, env);
  const id = String((await body(request)).id), D = await db(env);
  await groundPhotos(env, D, u.id, id);
  const res = await D.batch([
    D.prepare("DELETE FROM pg_links WHERE ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)) AND status IN ('ok', 'pending')").bind(u.id, id),
    // cancelling a request they said no to: it goes from your list, but their no stands
    D.prepare("UPDATE pg_links SET asked_at = NULL WHERE a = ?2 AND b = ?1 AND status IN ('declined', 'blocked')").bind(u.id, id),
    D.prepare("DELETE FROM pg_flyover WHERE (sender = ?1 AND user_id = ?2) OR (sender = ?2 AND user_id = ?1)").bind(u.id, id),
    ...grounded(D, u.id, id),
  ]);
  await refundGrounded(D, res);
  return json({ ok: true });
}
// No longer friends: pigeons either of you booked that haven't taken off yet stay home
// (and the photos they were carrying go from storage first: nothing else would find them)
async function groundPhotos(env, D, a, b) {
  const { results } = await D.prepare("SELECT id FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND sched = 1 AND sent_at > ?3 AND photo = 1").bind(a, b, Date.now()).all();
  if (results.length && env.BIO_R2) await env.BIO_R2.delete(results.map((r) => `pigeon/${r.id}`)).catch(() => {});
}
// (the last statement says which stayed home: run refundGrounded on the batch's answer)
const grounded = (D, a, b) => [
  D.prepare("UPDATE pg_birds SET busy_until = ?3 WHERE id IN (SELECT bird FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND sched = 1 AND sent_at > ?3)").bind(a, b, Date.now()),
  D.prepare("DELETE FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND sched = 1 AND sent_at > ?3 RETURNING id, sender, pigeon").bind(a, b, Date.now()),
];
// each one back in its sender's loft, as calling it back would
async function refundGrounded(D, res) {
  const t = Date.now();
  for (const m of res?.at(-1)?.results || []) {
    await dropNear(D, m.id, -Infinity).catch(() => {}); await dropFly(D, m.id, -Infinity).catch(() => {});
    await refundLoft(D, m.sender, m.pigeon, t).catch((e) => console.error("pigeon refund", e && e.message));
  }
}
// Blocking: no friendship, no requests (theirs look like they're still waiting), no
// picture or place. They aren't told. Unblocking just lifts it.
async function block({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "block:" + u.id, 60, 60 * 60e3);
  const id = String((await body(request)).id || ""), D = await db(env);
  if (id === u.id || !(await D.prepare("SELECT 1 FROM pg_users WHERE id = ?").bind(id).first())) throw new HttpError(404, "There’s no one like that to block.");
  const l = await D.prepare("SELECT * FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(u.id, id).first();
  if (l?.status === "blocked" && l.a === id) return json({ ok: true });        // they blocked you first: already apart
  await groundPhotos(env, D, u.id, id);
  const res = await D.batch([
    D.prepare("DELETE FROM pg_links WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(u.id, id),
    D.prepare("INSERT INTO pg_links (a, b, status, created_at, asked_at) VALUES (?, ?, 'blocked', ?, ?)")
      .bind(u.id, id, Date.now(), l && l.status === "pending" && l.a === id ? Date.now() : null),
    ...grounded(D, u.id, id),
  ]);
  await refundGrounded(D, res);
  return json({ ok: true });
}
async function unblock({ request, env }) {
  const u = await requireUser(request, env);
  const id = String((await body(request)).id || "");
  await (await db(env)).prepare("DELETE FROM pg_links WHERE a = ? AND b = ? AND status = 'blocked'").bind(u.id, id).run();
  return json({ ok: true });
}
// Signing up: is this handle free? If not, a few close ones that are.
// (Handles are how friends find each other, so they're not secret.)
async function handleFree({ request, env }) { return json(await handleFreeOf(env, request, new URL(request.url).searchParams.get("h"))); }
// Friends you share with someone: where a pigeon to them could stop over.
async function mutuals({ request, env }) {
  const u = await requireUser(request, env), D = await db(env), other = new URL(request.url).searchParams.get("with") || "";
  if (!(await areFriends(D, u.id, other))) throw new HttpError(403, "You can only send pigeons to your flock.");
  const { results } = await D.prepare(`SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM pg_links WHERE status = 'ok' AND (a = ?1 OR b = ?1)
    INTERSECT SELECT CASE WHEN a = ?2 THEN b ELSE a END FROM pg_links WHERE status = 'ok' AND (a = ?2 OR b = ?2)`).bind(u.id, other).all();
  return json({ ids: results.map((r) => r.id).filter((id) => id !== u.id && id !== other) });
}
async function areFriends(D, a, b) {
  return !!(await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(a, b).first());
}
// (a scheduled pigeon still in its loft isn't part of the conversation yet: it doesn't take a turn)
const lastBetweenQ = (D, a, b, t) => D.prepare(
  "SELECT * FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND sent_at <= ?3 ORDER BY sent_at DESC LIMIT 1").bind(a, b, t);
const lastBetween = (D, a, b, t) => lastBetweenQ(D, a, b, t).first();

// Read receipts go both ways: if either of you has them off, neither sees them.
// read receipts (and a view-once photo's "Opened") go both ways: either of you with them off shows none
const receipts = (me, other, v) => (v.from === me.id && (me.no_receipts || other?.no_receipts) ? { ...v, readAt: null, viewedAt: null } : v);

/* ---------------- sync: everything the home screens need ---------------- */
const SEEN_EVERY = 60e3;
async function sync({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  const D = await db(env), t = Date.now();
  waitUntil(sweepPhotos(env).catch(() => {}));     // photos past their time are deleted promptly (two indexed look-ups)
  await ensureStreaks(D).catch((e) => console.error("pigeon streaks", e && e.message));   // (once per copy of the server)
  // Everything at once, in one trip to the database: an open app asks every 15 s, and each separate
  // question costs a round trip. Your links and everyone on the other end (one query whatever their
  // number: an IN list would overflow D1's 100 parameters), the last pigeon each way with each of them
  // (two index look-ups each, not a read of your whole history), whose turn it is, what's unread,
  // passkeys, streaks, feathers, named pigeons, and your groups (a fixed set of questions however many)
  const res = await D.batch([
    D.prepare("SELECT a, b, status, asked_at FROM pg_links WHERE a = ?1 OR b = ?1").bind(u.id),
    D.prepare(`SELECT p.id, p.handle, p.name, p.pub, p.lat, p.lon, p.place, p.moon, p.loc_at, p.seen_at, p.avatar_at, p.hide_online, p.no_receipts, p.notify_prefs
      FROM pg_links l JOIN pg_users p ON p.id = CASE WHEN l.a = ?1 THEN l.b ELSE l.a END WHERE l.a = ?1 OR l.b = ?1`).bind(u.id),
    D.prepare(`
      WITH o AS (SELECT CASE WHEN a = ?1 THEN b ELSE a END AS o FROM pg_links WHERE a = ?1 OR b = ?1)
      SELECT * FROM pg_msgs WHERE id IN (
        SELECT (SELECT id FROM pg_msgs WHERE sender = ?1 AND recipient = o.o AND sent_at <= ?2 AND gone_at IS NULL ORDER BY sent_at DESC LIMIT 1) FROM o
        UNION ALL SELECT (SELECT id FROM pg_msgs WHERE sender = o.o AND recipient = ?1 AND sent_at <= ?2 AND gone_at IS NULL ORDER BY sent_at DESC LIMIT 1) FROM o)`).bind(u.id, t),
    // whose turn it is: from the last pigeon each way, including any whose words have disappeared (as sending checks it)
    D.prepare(`
      WITH o AS (SELECT CASE WHEN a = ?1 THEN b ELSE a END AS o FROM pg_links WHERE a = ?1 OR b = ?1)
      SELECT id, sender, recipient, sent_at, deliver_at, lost_at, recalled FROM pg_msgs WHERE id IN (
        SELECT (SELECT id FROM pg_msgs WHERE sender = ?1 AND recipient = o.o AND sent_at <= ?2 ORDER BY sent_at DESC LIMIT 1) FROM o
        UNION ALL SELECT (SELECT id FROM pg_msgs WHERE sender = o.o AND recipient = ?1 AND sent_at <= ?2 ORDER BY sent_at DESC LIMIT 1) FROM o)`).bind(u.id, t),
    D.prepare("SELECT sender, COUNT(*) AS n FROM pg_msgs WHERE recipient = ? AND read_at IS NULL AND deliver_at <= ? AND lost_at IS NULL GROUP BY sender").bind(u.id, t),
    D.prepare("SELECT a, b, ms, by, at FROM pg_vanish WHERE (a = ?1 OR b = ?1) AND ms > 0").bind(u.id),
    D.prepare("SELECT id, label, created_at, used_at, vault IS NOT NULL AS unlocks FROM pg_passkeys WHERE user_id = ? ORDER BY created_at").bind(u.id),
    D.prepare("SELECT * FROM pg_streaks WHERE a = ?1 OR b = ?1").bind(u.id),
    D.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM pg_feathers WHERE user_id = ?").bind(u.id),
    D.prepare("SELECT 1 AS x FROM pg_birds WHERE owner = ? LIMIT 1").bind(u.id),
    ...groupQs(D, u, t),
    // an open app syncs every 15 s; note it at most once a minute for Last Online
    ...(t - (u.seen_at || 0) < SEEN_EVERY ? [] : [D.prepare("UPDATE pg_users SET seen_at = ? WHERE id = ?").bind(t, u.id)]),
  ]);
  const [{ results: links }, { results: peopleRows }, { results: lasts }, { results: turnRows }, { results: unread }, { results: vanishRows }, { results: pks }, { results: streakRows }, { results: [bal] }, { results: hasBirds }] = res;
  const other = (l) => (l.a === u.id ? l.b : l.a);
  const people = new Map(peopleRows.map((p) => [p.id, p]));
  const vanishes = new Map(vanishRows.map((r) => [r.a === u.id ? r.b : r.a, { ms: r.ms, by: r.by, at: r.at }]));
  const streaks = new Map(streakRows.map((r) => [r.a === u.id ? r.b : r.a, streakView(r, t)]));
  const lastBy = new Map();
  for (const m of lasts) { const k = m.sender === u.id ? m.recipient : m.sender, had = lastBy.get(k); if (!had || m.sent_at > had.sent_at) lastBy.set(k, m); }
  const turnBy = new Map();
  for (const m of turnRows) { const k = m.sender === u.id ? m.recipient : m.sender, had = turnBy.get(k); if (!had || m.sent_at > had.sent_at) turnBy.set(k, m); }
  const unreadBy = new Map(unread.map((r) => [r.sender, r.n]));
  const brief = (p) => ({ id: p.id, handle: p.handle, name: p.name, avatarAt: p.avatar_at || null });
  const friends = [], incoming = [], outgoing = [], blocked = [];
  for (const l of links) {
    const p = people.get(other(l)); if (!p) continue;
    if (NO.has(l.status)) {
      if (l.b === u.id) { if (l.asked_at) outgoing.push({ id: p.id, handle: p.handle, name: null, avatarAt: null }); }   // looks like it's still waiting
      else if (l.status === "blocked") blocked.push({ id: p.id, handle: p.handle, name: p.name });
      continue;
    }
    if (l.status === "ok") {
      const last = lastBy.get(p.id);
      friends.push({ ...brief(p), pub: JSON.parse(p.pub), lat: p.lat, lon: p.lon, place: p.place, moon: moonView(p), locAt: u.hide_online || p.hide_online ? null : p.loc_at || null,
        seenAt: u.hide_online || p.hide_online ? null : p.seen_at || null,           // hiding yours hides theirs too
        tz: ((z) => (z && z !== "UTC" ? z : null))(prefsOf(p).tz),                    // their phone's time zone: "lands 08:12 their time"
        last: last ? receipts(u, p, msgView(u.id, last, t)) : null, unread: unreadBy.get(p.id) || 0, turn: turn(u.id, turnBy.get(p.id), t), streak: streaks.get(p.id) || null,
        vanish: vanishes.get(p.id) || null });
    } else if (l.b === u.id) incoming.push(brief(p));
    else outgoing.push({ id: p.id, handle: p.handle, name: null, avatarAt: null });   // nothing of them until they say yes
  }
  const groups = groupsFrom(res.slice(10, 10 + GROUP_QS), u, t);
  return json({ now: t, me: { ...meView(u, t), skin: await skinNow(D, u, t) }, feathers: bal.n, friends, groups, incoming, outgoing, blocked,
    birds: hasBirds.length ? await birdsFor(D, u.id, t) : { birds: [], hall: [] }, emailOn: emailReady(env), gifsOn: gifsReady(env),
    passkeys: pks.map((p) => ({ id: p.id, label: p.label, createdAt: p.created_at, usedAt: p.used_at, unlocks: !!p.unlocks })) },
  );
}

/* ---------------- messages ---------------- */
async function listMessages({ request, env }) {
  const u = await requireUser(request, env);
  const other = new URL(request.url).searchParams.get("with") || "";
  const D = await db(env), t = Date.now();
  // (the app asks every 15 s while a chat's open: whether you're friends, their receipts setting, the chat, stopovers
  // with you, and the last pigeon between you (whose turn), in one trip; nothing is sent unless you're friends)
  const [{ results: fr }, { results: [them] }, { results }, { results: stops }, { results: [lastOne] }] = await D.batch([
    D.prepare("SELECT 1 AS x FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(u.id, other),
    D.prepare("SELECT no_receipts FROM pg_users WHERE id = ?").bind(other),
    // yours waiting to take off show (to you only); theirs only once they're in the air
    D.prepare(`SELECT * FROM (SELECT * FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND (sender = ?1 OR sent_at <= ?3) AND gone_at IS NULL
      ORDER BY sent_at DESC LIMIT 300) ORDER BY sent_at`).bind(u.id, other, t),
    D.prepare("SELECT * FROM pg_msgs WHERE via = ?1 AND sender = ?2 AND sent_at <= ?3 AND gone_at IS NULL ORDER BY sent_at DESC LIMIT 50").bind(u.id, other, t),
    lastBetweenQ(D, u.id, other, t),
  ]);
  if (!fr.length) throw new HttpError(403, "You can only read scrolls from your flock.");
  const views = [...results.map((m) => receipts(u, them, msgView(u.id, m, t))), ...stops.map((m) => stopView(u.id, m, t))].sort((a, b) => a.sentAt - b.sentAt);
  const mine = results.filter((m) => m.sender === u.id);
  // the rest at once: each looks up its own things, none waits on another
  const [near, over, stamps, marks, fly, reacts] = await Promise.all([nearViews(D, u.id, results.map((m) => m.id), t),
    flyOnMine(D, u.id, mine.map((m) => m.id)),                                                   // who yours flew over (yours only)
    newStamps(D, u.id, mine.filter((m) => m.deliver_at <= t).map((m) => m.id)),                  // the passport's new stamps (yours only)
    marksFor(D, results.filter((m) => m.deliver_at <= t && m.lost_at == null).map((m) => m.id)),   // postmarks: on the letter, for both of you
    flyViews(D, u.id, other), reactsFor(env, u.id, results.map((m) => m.id))]);
  for (const v of views) {
    if (near.has(v.id)) v.near = near.get(v.id);
    if (over.has(v.id)) v.fly = over.get(v.id);
    if (stamps.has(v.id)) v.stamps = stamps.get(v.id);
    if (marks.has(v.id)) v.postmarks = marks.get(v.id);
  }
  return json({ now: t, messages: views, fly, reacts, turn: turn(u.id, lastOne, t), swift: swiftState(u, t).count, turbo: loft(u, "turbo", t).count, rocket: loft(u, "rocket", t).count });
}

async function sendMessage({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "send:" + u.id, 120, 60 * 60e3);
  let meta, photo = null;
  if (!(Number(request.headers.get("Content-Length")) <= MAX_PHOTO + MAX_CT + 4096)) throw new HttpError(413, "That photo is too large. Try a smaller one.");
  if ((request.headers.get("Content-Type") || "").startsWith("multipart/form-data")) {
    const f = await request.formData();
    try { meta = JSON.parse(f.get("meta")); } catch (_) { throw new HttpError(400, "That scroll was malformed."); }
    const p = f.get("photo");
    if (p && typeof p !== "string") photo = p;
  } else meta = await body(request);
  const id = String(meta.id || ""), to = String(meta.to || ""), ct = String(meta.ct || "");
  if (!UUID_RE.test(id)) throw new HttpError(400, "That scroll was malformed.");
  if (ct.length < 20 || ct.length > MAX_CT) throw new HttpError(400, "That scroll is too long.");
  if (photo && photo.size > MAX_PHOTO) throw new HttpError(413, "That photo is too large. Try a smaller one.");
  if (photo && !env.BIO_R2) throw new HttpError(503, "Photos aren’t set up on this server yet.");
  const D = await db(env), t = Date.now();
  if (await idTaken(D, id)) throw new HttpError(409, "That scroll was already sent.");
  if (u.lat == null && !u.moon) throw new HttpError(409, "Set your roost in the Roost tab before sending pigeons.");
  if (!(await areFriends(D, u.id, to))) throw new HttpError(403, "You can only send pigeons to your flock.");
  const r = await D.prepare("SELECT lat, lon, place, moon FROM pg_users WHERE id = ?").bind(to).first();
  // off the Earth (or round it, by orbit): only a space pigeon goes, and it flies none of the Earth's ways
  if (u.moon || r?.moon || meta.pigeon === "orbital") return sendSpace({ env, waitUntil, D, u, to, r, t, id, ct, photo, meta });
  if (isSpace(meta.pigeon)) throw new HttpError(409, "A lunar pigeon only flies to or from the Moon.");

  // Standard pigeons are free but only fly when it's your turn. Swift (2×),
  // turbo (3×) and rocket (9×) fly any time, and each one sent leaves the loft.
  // A phone that doesn't say which (older versions) sends standard if it can,
  // else swift.
  const last0 = await lastBetween(D, u.id, to, t), tn = turn(u.id, last0, t);
  // Scheduled: told when to land, it waits in the loft and takes off in time.
  // Standard pigeons can't wait for a turn that far ahead, so it's swift or faster.
  const landAt = meta.landAt == null ? null : Number(meta.landAt);
  if (landAt != null && !(Number.isFinite(landAt) && landAt > t && landAt <= t + MAX_SCHEDULE)) throw new HttpError(400, "Pick a time in the next 30 days for it to land.");
  const mystery = meta.pigeon === "mystery";
  if (mystery && landAt != null) throw new HttpError(409, "A mystery pigeon can’t be told when to land.");
  const kind = mystery ? drawMystery() : Object.hasOwn(PIGEONS, meta.pigeon) ? meta.pigeon : tn.free && landAt == null ? "standard" : "swift";
  if (landAt != null && PIGEONS[kind].waits) throw new HttpError(409, "Scheduled pigeons are swift, turbo or rocket pigeons.");
  if (!mystery && PIGEONS[kind].waits && !tn.free) throw new HttpError(409, "It isn’t your turn yet. Send a swift, turbo or rocket pigeon to write now.");
  const swift = PIGEONS[kind].waits ? 0 : 1;
  const hasTo = r && r.lat != null;
  const risky = u.risky ? 1 : 0, speed = PIGEONS[kind].speed * (risky ? RISKY_SPEED : 1);
  const style = styleOf(meta.route);                                         // the way it goes: fastest, scenic or safe
  const noship = meta.noShip === true && hopsFor(kind) ? 1 : 0;              // in a hurry: it flies an ocean itself rather than take a ship
  // A stopover: it rests an hour with a friend you both have, who can read it
  // (their own sealed copy) and add a line for the recipient, then flies on.
  const via = meta.via == null ? null : await stopover(D, u, to, r, String(meta.via), String(meta.viaCt || ""), landAt);
  // a named pigeon carrying it gets tired on a long flight (its stamina, from its miles)
  const carrier = await carrierOf(D, u.id, kind === "dumb" ? null : meta.bird, t);
  let km, w, flight, calm, way = [];
  if (via) {
    const k1 = haversineKm(u.lat, u.lon, via.lat, via.lon), k2 = haversineKm(via.lat, via.lon, r.lat, r.lon);
    const [w1, w2] = await windsAlong(env, [{ path: [[u.lat, u.lon], [via.lat, via.lon]], start: t, kmh: SPEED_KMH * speed },
      { path: [[via.lat, via.lon], [r.lat, r.lon]], start: t + flightMs(k1, speed) + LAYOVER, kmh: SPEED_KMH * speed }]);
    const f1 = Math.round(flightMs(k1 / w1.f, speed)), f2 = Math.round(flightMs(k2 / w2.f, speed));
    Object.assign(via, { at: t + f1, off: t + f1 + LAYOVER });
    km = k1 + k2; flight = f1 + LAYOVER + f2; calm = flightMs(k1, speed) + LAYOVER + flightMs(k2, speed);
    w = { ws: [w1, w2], wind: w1.wind == null || w2.wind == null ? w1.wind ?? w2.wind : (w1.wind * k1 + w2.wind * k2) / Math.max(1, km), f: (k1 / w1.f + k2 / w2.f) ? km / (k1 / w1.f + k2 / w2.f) : 1 };
  } else {
    // its way, planned around the weather it'll meet (the forecast, for when it gets
    // to each stretch); one booked to land later, around the forecast for then
    // (when that's not too far off to know)
    const ahead = landAt != null && hasTo ? Math.max(t, landAt - flightMs(haversineKm(u.lat, u.lon, r.lat, r.lon), speed)) : t;
    const plan = hasTo ? await planRoute(env, { from: [u.lat, u.lon], to: [r.lat, r.lon], weather: ahead - t < FORECAST_AHEAD, hop: hopsFor(kind), style, start: ahead, kmh: SPEED_KMH * speed, ceiling: ceilingFor(kind), ship: !noship }) : null;
    km = plan ? plan.km : DEFAULT_KM; w = plan ? plan.w : { wind: null, f: 1 }; way = plan ? plan.way : [];
    if (plan && carrier) way = tire([u.lat, u.lon], way, [r.lat, r.lon], SPEED_KMH * speed * (w.f || 1), tiredOf(carrier.km));
    const rest = restOf(way);
    flight = Math.round(flightMs(km / w.f, speed)) + rest; calm = flightMs(km, speed) + rest;
  }
  const wx = wxOf(w.ws || [w], calm, flight, via ? [[0, via.at - t], [via.off - t, flight - (via.off - t)]] : undefined);   // what the weather did to it
  const off = landAt == null ? t : Math.round(landAt) - flight;                 // take-off
  if (off < t) throw new HttpError(409, `That’s too soon: a ${kind} pigeon takes ${waitText(flight)} to get there.`);
  const deliver = off + flight;
  const planned = way.length ? timeWay([u.lat, u.lon], way, [r.lat, r.lon], off, flight - restOf(way)).legs : null;    // the way, with its times
  // how sure that landing time is (the ensemble forecast along the way): only for one that leaves now
  const spread = hasTo && !via && landAt == null ? spreadOf(await ensembleFor(env, [[u.lat, u.lon], ...way, [r.lat, r.lon]], flight / HOUR).catch(() => null), off, SPEED_KMH * speed) : null;
  const from = mystery ? "mystery" : PIGEONS[kind].max ? kind : null;      // the loft it leaves: a mystery one comes from its own
  if (from) {
    const p = mystery ? MYSTERY : PIGEONS[kind], l = loft(u, from, t);
    if (l.count <= 0) throw new HttpError(409, `No ${from} pigeons left. The next one hatches in ${waitText(l.nextAt - t)}.`);
    const [n, at] = l.count >= p.max ? [l.count - 1, t] : [l.count - 1, l.at + l.hatched * p.every];
    // only if the loft is still as we read it, so two sends at once can't share a pigeon
    const r = await D.prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ? AND ${p.col} IS ? AND ${p.atCol} IS ?`).bind(n, at, u.id, u[p.col], u[p.atCol]).run();
    if (!r.meta.changes) throw new HttpError(409, "Another pigeon just left. Try again.");
  }
  // Pigeon Death: lost somewhere between 15% and 85% of the way, as often as its way's odds say
  // (1 in 100 as a rule; more over long open sea, through storms it can't avoid, past falcons; half the safe way)
  const roll = crypto.getRandomValues(new Uint32Array(2));
  const odds = hasTo ? riskOf([[u.lat, u.lon], ...(via ? [[via.lat, via.lon]] : way), [r.lat, r.lon]], (w.ws ? w.ws.reduce((a, x) => a + (x.storms || 0), 0) : w.storms) || 0, via ? null : style).p : RISKY_LOSS;
  let lostAt = risky && roll[0] / 2 ** 32 < odds ? Math.round(off + (0.15 + 0.7 * (roll[1] / 2 ** 32)) * (deliver - off)) : null;
  if (via && lostAt != null && lostAt >= via.at && lostAt < via.off) lostAt = via.off + (lostAt - via.at);   // never while resting with a friend
  try {
    await D.batch([claimId(D, id, "m", t), D.prepare(`INSERT INTO pg_msgs (id, sender, recipient, ct, photo, photo_size, swift, pigeon, risky, lost_at, km, sent_at, deliver_at, expires_at,
      from_lat, from_lon, from_place, to_lat, to_lon, to_place, wind, wind_f, sched, skin, via, via_ct, via_at, via_off, via_place, legs, wx, wx_ms, wx_at, spread)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, u.id, to, ct, photo ? 1 : 0, photo ? photo.size : null, swift, kind, risky, lostAt, km, off, deliver, photo ? (lostAt ?? deliver + PHOTO_TTL) : null,
        u.lat, u.lon, u.place, hasTo ? r.lat : null, hasTo ? r.lon : null, hasTo ? r.place : null, w.wind, w.f, landAt == null ? null : 1, await skinNow(D, u, t),
        via?.id ?? null, via?.ct ?? null, via?.at ?? null, via?.off ?? null, via?.place ?? null,
        // the map draws it resting there: two stops at the same spot
        via ? JSON.stringify([[via.lat, via.lon, via.at], [via.lat, via.lon, via.off]]) : planned ? JSON.stringify(planned) : null, wx.wx, wx.ms, wx.reach == null ? null : off + wx.reach, spread)]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "That scroll was already sent.");
    throw e;
  }
  // a pigeon that waits its turn: if another took off between you at the same moment, the first of them goes
  if (PIGEONS[kind].waits && !mystery) {
    const rival = await D.prepare(`SELECT 1 FROM pg_msgs WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND id != ?3 AND id != ?4
      AND sent_at > ?5 AND (sent_at < ?6 OR (sent_at = ?6 AND id < ?3)) LIMIT 1`).bind(u.id, to, id, last0?.id ?? "", last0?.sent_at ?? -1, off).first();
    if (rival) {
      await D.batch([D.prepare("DELETE FROM pg_msgs WHERE id = ?").bind(id), D.prepare("DELETE FROM pg_ids WHERE id = ?").bind(id)]);
      throw new HttpError(409, "Something just changed: it isn’t your turn now. Send a swift, turbo or rocket pigeon to write now.");
    }
  }
  // the photo once the row is ours (so two sends of one id can't overwrite each other's)
  if (photo) {
    try { await env.BIO_R2.put(`pigeon/${id}`, photo.stream(), { httpMetadata: { contentType: "application/octet-stream" } }); }
    catch (e) { await D.batch([D.prepare("DELETE FROM pg_msgs WHERE id = ?").bind(id), D.prepare("DELETE FROM pg_ids WHERE id = ?").bind(id)]); throw e; }
  }
  // one of your named pigeons carries it, if it's free
  const bird = kind === "dumb" ? null : await claimBird(D, u.id, meta.bird, t, flight, deliver);
  if (bird) await D.prepare("UPDATE pg_msgs SET bird = ?, bird_name = ?, bird_rank = ?, bird_wear = ? WHERE id = ?").bind(bird.id, bird.name, bird.rank, bird.wear, id).run();
  if (mystery) await D.prepare("UPDATE pg_msgs SET mystery = 1 WHERE id = ?").bind(id).run();
  const vn = await pairVanish(D, u.id, to); if (vn) await D.prepare("UPDATE pg_msgs SET vanish = ? WHERE id = ?").bind(vn.ms, id).run();
  if (style && !via) await D.prepare("UPDATE pg_msgs SET style = ? WHERE id = ?").bind(style, id).run();
  if (noship && !via) await D.prepare("UPDATE pg_msgs SET noship = 1 WHERE id = ?").bind(id).run();
  // a photo is view-once unless the phone says it isn't (a GIF or a voice pigeon)
  if (photo) await D.prepare("UPDATE pg_msgs SET once = ? WHERE id = ?").bind(meta.once === false ? 0 : 1, id).run();
  // pigeons off the same way at once fly together, quicker for it (before it's shown, so its times are right)
  if (landAt == null && !via) await flockUp(D, { ...(await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first()) }).catch((e) => console.error("pigeon flock", e && e.message));
  const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
  await bumpStreak(D, u.id, to, t).catch((e) => console.error("pigeon streak", e && e.message));   // today counts for your streak
  await noteSeason(D, u.id, t).catch((e) => console.error("pigeon season", e && e.message));       // ten in a season keeps its look
  if (landAt == null) waitUntil(pigeonSent(env, u, to, m.deliver_at, kind).catch(() => {}));      // (as it is now: flying with another may have changed it)       // scheduled: told when it takes off
  waitUntil(findNear(D, m).catch((e) => console.error("pigeon near", e && e.message)));        // the pigeons it will pass
  waitUntil(findFly(D, m).catch((e) => console.error("pigeon flyover", e && e.message)));      // and the friends it will fly over
  const me = landAt == null && !mystery ? null : await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ message: msgView(u.id, m, t), streak: await streakBetween(D, u.id, to, t).catch(() => null), ...(me ? { me: meView(me, t) } : {}) });
}

// A space pigeon (functions/_moon.js): lunar to, from or across the Moon, laser to or from Mars,
// orbital round the Earth; from its own loft, timed by where the Moon or Mars is today (or the
// orbit's passes). No stopovers, no booking ahead, no named pigeons (they're Earth birds), and none
// of the Earth's routes or weather.
const SPACE_ONLY = { laser: "Only a laser pigeon reaches Mars, or comes from it.", lunar: "Only a lunar pigeon can fly to or from the Moon." };
async function sendSpace({ env, waitUntil, D, u, to, r, t, id, ct, photo, meta }) {
  const kind = String(meta.pigeon || ""), from = endOf(u), dest = r && endOf(r);
  if (!from || !dest) throw new HttpError(409, "They haven’t set where they are yet.");
  const can = spaceKinds(from, dest) || ["orbital"];
  if (!can.includes(kind)) throw new HttpError(409, SPACE_ONLY[can[0]] || "An orbital pigeon only flies between two places on Earth.");
  if (meta.landAt != null) throw new HttpError(409, `A ${SPACE_NAME[kind]} pigeon can’t be booked to land at a time.`);
  if (meta.via != null) throw new HttpError(409, `A ${SPACE_NAME[kind]} pigeon can’t stop over on the way.`);
  // (Pigeon Death's speed is for flying: light and orbits don't hurry)
  const risky = u.risky ? 1 : 0, f = spaceFlight(kind, from, dest, t, risky && kind.startsWith("lunar") ? RISKY_SPEED : 1), deliver = t + f.ms;
  const p = LUNAR_LOFTS[kind], l = loft(u, kind, t);
  if (l.count <= 0) throw new HttpError(409, `No ${SPACE_NAME[kind]} pigeons left. The next one hatches in ${waitText(l.nextAt - t)}.`);
  const [n, at] = l.count >= p.max ? [l.count - 1, t] : [l.count - 1, l.at + l.hatched * p.every];
  const took = await D.prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ? AND ${p.col} IS ? AND ${p.atCol} IS ?`).bind(n, at, u.id, u[p.col], u[p.atCol]).run();
  if (!took.meta.changes) throw new HttpError(409, "Another pigeon just left. Try again.");
  // Pigeon Death: 1 in 100 is lost in space (or, from the Moon, burns up coming home)
  const roll = crypto.getRandomValues(new Uint32Array(2));
  const lostAt = risky && roll[0] / 2 ** 32 < RISKY_LOSS ? Math.round(t + (0.15 + 0.7 * (roll[1] / 2 ** 32)) * f.ms) : null;
  const { km: _km, ms: _ms, ...way } = f, moon = JSON.stringify({ ...way, from, to: dest });
  try {
    await D.batch([claimId(D, id, "m", t), D.prepare(`INSERT INTO pg_msgs (id, sender, recipient, ct, photo, photo_size, swift, pigeon, risky, lost_at, km, sent_at, deliver_at, expires_at, from_place, to_place, skin, moon)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, u.id, to, ct, photo ? 1 : 0, photo ? photo.size : null, kind, risky, lostAt, f.km, t, deliver,
        photo ? (lostAt ?? deliver + PHOTO_TTL) : null, from.place, dest.place, await skinNow(D, u, t), moon)]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "That scroll was already sent.");
    throw e;
  }
  if (photo) {
    try { await env.BIO_R2.put(`pigeon/${id}`, photo.stream(), { httpMetadata: { contentType: "application/octet-stream" } }); }
    catch (e) { await D.batch([D.prepare("DELETE FROM pg_msgs WHERE id = ?").bind(id), D.prepare("DELETE FROM pg_ids WHERE id = ?").bind(id)]); throw e; }
    await D.prepare("UPDATE pg_msgs SET once = ? WHERE id = ?").bind(meta.once === false ? 0 : 1, id).run();
  }
  const vn = await pairVanish(D, u.id, to); if (vn) await D.prepare("UPDATE pg_msgs SET vanish = ? WHERE id = ?").bind(vn.ms, id).run();
  const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
  await bumpStreak(D, u.id, to, t).catch((e) => console.error("pigeon streak", e && e.message));
  await noteSeason(D, u.id, t).catch((e) => console.error("pigeon season", e && e.message));
  waitUntil(pigeonSent(env, u, to, deliver, SPACE_NAME[kind]).catch(() => {}));
  const me = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ message: msgView(u.id, m, t), streak: await streakBetween(D, u.id, to, t).catch(() => null), me: meView(me, t) });
}

// Before sending: the weather along the way now, and for the next day hour by
// hour (how much faster or slower a pigeon would fly, and the worst of it), so
// the phone can say whether it's worth waiting for the skies to clear.
async function wxPlan({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "wxplan:" + u.id, 120, 60 * 60e3);
  const other = new URL(request.url).searchParams.get("with") || "", D = await db(env);
  if (!(await areFriends(D, u.id, other))) throw new HttpError(403, "You can only plan pigeons to friends.");
  const r = await D.prepare("SELECT lat, lon FROM pg_users WHERE id = ?").bind(other).first();
  if (u.lat == null || r?.lat == null) return json({ now: null, hours: [] });
  const route = [u.lat, u.lon, r.lat, r.lon], [[now], [fc]] = await Promise.all([windsFor(env, [route]), forecastFor(env, [route])]);
  const view = (x) => ({ f: Math.round(x.f * 1000) / 1000, wx: x.wx ? { k: x.wx.k, lat: x.wx.lat, lon: x.wx.lon } : null });
  return json({ now: view(now), hours: (fc || []).map((x) => ({ at: x.at, ...view(x) })) });
}

// How a pigeon would go if it left now, each way it could be sent (How It
// Flies shows it before you send): for each route style, its way (timed from
// now), how far, and when it would land. Planned as sending would plan it, so
// it's what would happen, weather and all, if nothing changes.
async function routePlan({ request, env }) {
  const u = await requireUser(request, env), q = new URL(request.url).searchParams, t = Date.now();
  await limit(env, "routeplan:" + u.id, 60, 60 * 60e3);
  const other = q.get("with") || "", kind = Object.hasOwn(PIGEONS, q.get("pigeon")) ? q.get("pigeon") : "standard", D = await db(env);
  const carrier = await carrierOf(D, u.id, q.get("bird"), t);              // (the named pigeon that would carry it: its rests)
  if (!(await areFriends(D, u.id, other))) throw new HttpError(403, "You can only plan pigeons to friends.");
  const r = await D.prepare("SELECT lat, lon, place FROM pg_users WHERE id = ?").bind(other).first();
  if (u.lat == null || r?.lat == null) return json({ plans: null });
  const from = [u.lat, u.lon], to = [r.lat, r.lon];
  // every kind of pigeon, each way, so every time How It Flies shows is the planned one
  // (the same sky each time: the forecast is kept a while)
  const kinds = {}, noShip = {}, skies = new Map();          // (the slowest first: its look at the sky reaches far enough for the rest)
  // how sure each landing time is: one look at the ensemble along the straight way, long enough for the slowest
  const ens = await ensembleFor(env, [from, to], flightMs(haversineKm(u.lat, u.lon, r.lat, r.lon), PIGEONS.standard.speed) / HOUR * 1.5).catch(() => null);
  for (const k of ["standard", "swift", "turbo", "rocket"]) {
    const speed = PIGEONS[k].speed * (u.risky ? RISKY_SPEED : 1), plans = (kinds[k] = {});
    const each = async (style, ship) => {
      const plan = await planRoute(env, { from, to, weather: true, hop: hopsFor(k), style: styleOf(style), start: t, kmh: SPEED_KMH * speed, ceiling: ceilingFor(k), skies, ship });
      const way = carrier ? tire(from, plan.way, to, SPEED_KMH * speed * (plan.w.f || 1), tiredOf(carrier.km)) : plan.way;
      const rest = restOf(way), flight = Math.round(flightMs(plan.km / plan.w.f, speed)) + rest;
      return { km: plan.km, deliverAt: t + flight, wind: plan.w.wind, legs: timeWay(from, way, to, t, flight - rest).legs, risk: riskOf([from, ...way, to], plan.w.storms || 0, styleOf(style)), spread: spreadOf(ens, t, SPEED_KMH * speed) };
    };
    for (const style of STYLES) plans[style] = await each(style, true);
    // one that would take a ship: the same ways flown all the way instead, for a sender in a hurry
    if (hopsFor(k) && STYLES.some((s) => plans[s].legs.some((l) => l[3] === "b"))) {
      noShip[k] = {};
      for (const style of STYLES) noShip[k][style] = await each(style, false);
    }
  }
  return json({ at: t, pigeon: kind, from, to, fromPlace: u.place, toPlace: r.place, plans: kinds[kind] || kinds.standard, kinds, noShip });
}

// The named pigeon of yours that would carry it, if it's free to: { km } (its miles), else null
async function carrierOf(D, uid, id, t) {
  if (!id || !UUID_RE.test(String(id))) return null;
  return D.prepare("SELECT km FROM pg_birds WHERE id = ? AND owner = ? AND retired_at IS NULL AND lost_at IS NULL AND COALESCE(busy_until, 0) <= ?").bind(String(id), uid, t).first();
}

// A scheduled pigeon that hasn't taken off yet: it never leaves. No one was
// told about it, so it just goes, and the pigeon goes back in its loft.
// A pigeon that never took off goes back in its loft
async function refundLoft(D, uid, kind, t) {
  const p = PIGEONS[kind] || LUNAR_LOFTS[kind];
  for (let i = 0; p?.max && i < 3; i++) {
    const me = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(uid).first(), l = loft(me, kind, t);
    if (l.count >= p.max) break;                    // a full loft: it's just home (no more than a day's worth, ever)
    // one more in the loft; a full loft stops hatching, so its clock restarts from now
    const at = l.count + 1 >= p.max ? t : l.at + l.hatched * p.every;
    const ok = await D.prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ? AND ${p.col} IS ? AND ${p.atCol} IS ?`).bind(l.count + 1, at, uid, me[p.col], me[p.atCol]).run();
    if (ok.meta.changes) break;
  }
}
async function cancelScheduled(env, D, u, m, t) {
  const r = await D.prepare("DELETE FROM pg_msgs WHERE id = ?1 AND sender = ?2 AND sent_at > ?3").bind(m.id, u.id, t).run();
  if (!r.meta.changes) throw new HttpError(409, "It’s just taken off. Try again to call it back.");
  await dropNear(D, m.id, -Infinity); await dropFly(D, m.id, -Infinity); await freeBird(D, m.bird, t);
  if (m.photo === 1 && env.BIO_R2) await env.BIO_R2.delete(`pigeon/${m.id}`);
  await refundLoft(D, u.id, m.pigeon, t);
  const me = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  return json({ cancelled: m.id, me: meView(me, t) });
}

// Checks a stopover and finds where it is: a friend of you both, with a location.
async function stopover(D, u, to, r, viaId, viaCt, landAt) {
  if (landAt != null) throw new HttpError(400, "A scheduled pigeon can’t make a stopover.");
  if (!UUID_RE.test(viaId) || viaId === to || viaId === u.id) throw new HttpError(400, "Pick a friend for it to stop with.");
  if (viaCt.length < 20 || viaCt.length > MAX_CT) throw new HttpError(400, "That scroll was malformed.");
  if (!(await areFriends(D, u.id, viaId)) || !(await areFriends(D, viaId, to))) throw new HttpError(403, "It can only stop with a friend you both have.");
  const v = await D.prepare("SELECT id, lat, lon, place FROM pg_users WHERE id = ?").bind(viaId).first();
  if (v?.lat == null || r?.lat == null) throw new HttpError(409, "A stopover needs both friends’ locations.");
  return { ...v, ct: viaCt };
}
// The friend it stops with adds a line, sealed for the recipient, while it rests with them.
async function stopoverNote({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "note:" + u.id, 60, 60 * 60e3);
  const b = await body(request), id = String(b.id || ""), ct = String(b.ct || ""), D = await db(env), t = Date.now();
  if (!UUID_RE.test(id) || ct.length < 20 || ct.length > 4000) throw new HttpError(400, "That line was malformed.");
  const m = await D.prepare("SELECT * FROM pg_msgs WHERE id = ? AND via = ?").bind(id, u.id).first();
  if (!m || !(await areFriends(D, u.id, m.recipient))) throw new HttpError(404, "That pigeon isn’t stopping with you.");
  if (t < m.via_at) throw new HttpError(409, "It hasn’t reached you yet.");
  const r = await D.prepare("UPDATE pg_msgs SET via_note = ?1 WHERE id = ?2 AND via = ?3 AND via_note IS NULL AND via_off > ?4 AND (lost_at IS NULL OR lost_at > ?4)").bind(ct, id, u.id, t).run();
  if (!r.meta.changes) throw new HttpError(409, m.via_note ? "You’ve already added a line." : "Too late: it has flown on.");
  return json({ ok: true });
}
// What the friend on the way sees: whose pigeon, to whom, when, and (once it reaches them) what it says.
function stopView(me, m, t) {
  const lost = m.lost_at != null && t >= m.lost_at, here = !lost && t >= m.via_at;
  return { id: m.id, from: m.sender, to: me, stopover: true, finalTo: m.recipient, pigeon: m.pigeon, skin: m.skin || null, risky: !!m.risky,
    sentAt: m.sent_at, viaAt: m.via_at, viaOff: m.via_off, deliverAt: m.via_at, km: null, flying: !lost && t < m.via_at, resting: here && t < m.via_off,
    lost, recalled: lost && !!m.recalled, ct: here || (!lost && t >= m.via_off) ? m.via_ct : null, mine: m.via_note || null, photo: 0 };
}

// Call a pigeon back while it's still in the air: a swift pigeon flies after it.
// It never arrives, what it carried is deleted, and it's the sender's turn again.
async function recallMessage({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "recall:" + u.id, 30, 60 * 60e3);
  const id = String((await body(request)).id || ""), D = await db(env), t = Date.now();
  const m = UUID_RE.test(id) && await D.prepare("SELECT * FROM pg_msgs WHERE id = ? AND sender = ?").bind(id, u.id).first();
  if (!m) throw new HttpError(404, "That pigeon isn’t yours to call back.");
  if (t >= m.deliver_at || (m.lost_at != null && t >= m.lost_at)) throw new HttpError(409, "Too late: that pigeon has already landed.");
  if (t < m.sent_at) return cancelScheduled(env, D, u, m, t);
  await spendSwift(D, u, t);
  // (notified_at: nobody is told it was lost; it wasn't, it came home)
  const r = await D.prepare(`UPDATE pg_msgs SET lost_at = ?1, recalled = 1, notified_at = ?1, ct = '', via_ct = CASE WHEN via IS NULL THEN NULL ELSE '' END, via_note = NULL, photo = CASE WHEN photo = 1 THEN 2 ELSE photo END
    WHERE id = ?2 AND sender = ?3 AND deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)`).bind(t, id, u.id).run();
  if (!r.meta.changes) throw new HttpError(409, "Too late: that pigeon has already landed.");
  await dropNear(D, id, t); await dropFly(D, id, t);
  if (m.photo === 1 && env.BIO_R2) await env.BIO_R2.delete(`pigeon/${id}`);
  const fresh = await D.prepare("SELECT * FROM pg_msgs WHERE id = ?").bind(id).first();
  const me = await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(u.id).first();
  const view = msgView(u.id, fresh, t);
  if (!(await areFriends(D, u.id, m.recipient))) for (const k of ["route", "legs", "toPlace", "viaPlace"]) delete view[k];
  return json({ message: view, me: meView(me, t) });
}

async function markRead({ request, env }) {
  const u = await requireUser(request, env);
  const other = String((await body(request)).with || "");
  await (await db(env)).prepare("UPDATE pg_msgs SET read_at = ?1 WHERE recipient = ?2 AND sender = ?3 AND read_at IS NULL AND deliver_at <= ?1 AND lost_at IS NULL").bind(Date.now(), u.id, other).run();
  return json({ ok: true });
}

async function getPhoto({ request, env }, id) {
  const u = await requireUser(request, env);
  if (!UUID_RE.test(id || "")) throw new HttpError(404, "No such photo.");
  const D = await db(env);
  const m = await D.prepare("SELECT sender, recipient, photo, once, viewed_at, deliver_at, expires_at, lost_at FROM pg_msgs WHERE id = ?").bind(id).first();
  const t = Date.now();
  if (!m || (m.sender !== u.id && m.recipient !== u.id)) throw new HttpError(404, "No such photo.");
  if (m.photo !== 1 || t >= m.expires_at) throw new HttpError(410, "This photo has flown away.");
  if (m.recipient === u.id && m.lost_at != null && t >= m.lost_at) throw new HttpError(410, "This photo was lost with its pigeon.");
  if (m.recipient === u.id && t < m.deliver_at) throw new HttpError(425, "This photo is still in flight.");
  // view once: its sender never downloads it again, its recipient exactly once (claimed first, so two at once can't both)
  if (isOnce(m) && !(m.once == null && m.sender === u.id)) {     // (one sent before view-once, which might be a GIF or a voice pigeon: its sender still has it)
    if (m.recipient !== u.id) throw new HttpError(403, "A view-once photo can only be opened by who it was sent to.");
    const c = await D.prepare("UPDATE pg_msgs SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL").bind(t, id).run();
    if (!c.meta.changes) throw new HttpError(410, "You’ve already opened this photo.");
    return serveOnce(env, `pigeon/${id}`, false);
  }
  const obj = env.BIO_R2 && (await env.BIO_R2.get(`pigeon/${id}`));
  if (!obj) throw new HttpError(410, "This photo has flown away.");
  return new Response(obj.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

/* ---------------- password: change, forgotten, reset ----------------
   The password locks the private key, so a reset can only keep someone's
   scrolls if their phone unlocks the key another way (a passkey with PRF).
   Otherwise the phone makes a new key pair and old scrolls stay sealed. */
// (the account's, so from "Account", pointing at its page: functions/_account.js)
async function notifyPasskeyAdded(env, u, label, request) {
  await accountMail(env, u, { icon: "passkey", title: "A passkey was added", subject: "A passkey was added to your account",
    line: `a new passkey (“${label}”) can now sign in to your account.`,
    after: "If this wasn’t you, remove it in Passkeys and change your password straight away.",
    pill: ["passkey", label], rows: [["Added in", "InFlight"]], button: { label: "Review your passkeys", url: `${accountPage(request, env)}/` } }, linkOrigin(request));
}
async function notifyPasswordChanged(env, u, request) {
  await accountMail(env, u, { icon: "key", title: "Your password was changed", subject: "Your password was changed",
    line: "the password for your account was just changed. Your InFlight messages are still safe.",
    after: "If this wasn’t you, reset your password straight away with Forgot password? at account.georgefarrowgreen.com.",
    rows: [["Changed in", "InFlight"]], button: { label: "Review your account", url: `${accountPage(request, env)}/` } }, linkOrigin(request));
}

// A new sign-in: the account's phones are told at once, and its email too, so a sign-in
// that wasn't you is seen (Account → Privacy & Security → Signed-in Phones signs it out).
// Roughly where from is the country, as Cloudflare has it (the sign-in itself keeps its city too, for Signed-In Phones).
// Has a password turned up in a data breach? Pwned Passwords, asked through here with
// only the first 5 characters of the password's SHA-1 (k-anonymity): the phone checks
// the answers itself, so neither this server nor theirs ever sees the password or its
// hash. Padded, so the answer's size says nothing either. Nothing is kept of the asking.
async function pwned({ request, env }) {
  await limit(env, "pwned:" + clientIp(request), 40, 15 * 60e3);
  const p = new URL(request.url).searchParams.get("p") || "";
  if (!/^[0-9A-F]{5}$/.test(p)) throw new HttpError(400, "Send the first 5 characters of the hash.");
  const r = await fetch(`${env.PWNED_URL || "https://api.pwnedpasswords.com"}/range/${p}`, { headers: { "Add-Padding": "true", "User-Agent": "InFlight (chat.georgefarrowgreen.com)" } }).catch(() => null);
  const text = r?.ok ? await r.text() : "";                 // (not reachable: the phone carries on without the check)
  return new Response(text, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

// An account from before Argon2id, moved on at its next password sign-in: the same
// password, stretched the new way (the phone sends the old proof as the check).
// Not a password change: no email, and no one is signed out.
async function passwordUpgrade({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "pwupgrade:" + u.id, 5, 60 * 60e3);
  const b = await body(request);
  if (String(u.salt).startsWith("a2:")) return json({ ok: true });              // (already)
  if (!(await proofOk(env, b.oldProof, u.proof_hash))) throw new HttpError(401, "That password isn’t right.", "password");
  const vault = checkNewSecret(b);
  if (!String(b.salt).startsWith("a2:")) throw new HttpError(400, "Your app sent an incomplete request. Reload and try again.");
  await (await db(env)).prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ? WHERE id = ? AND salt = ?")
    .bind(b.salt, await proofHash(env, b.proof), await lockVault(env, u.id, vault), u.id, u.salt).run();
  return json({ ok: true });
}

async function changePassword({ request, env, waitUntil }) {
  const u = await requireUser(request, env);
  await limit(env, "pwchange:" + u.id, 10, 60 * 60e3);
  const b = await body(request);
  if (!(await proofOk(env, b.oldProof, u.proof_hash))) throw new HttpError(401, "Your current password isn’t right.", "current");
  const vault = checkNewSecret(b);
  const D = await db(env), t = Date.now();
  await D.batch([
    // (checked against data breaches on the phone first, so none it's found in: the account's page counts it checked)
    D.prepare("UPDATE pg_users SET salt = ?, proof_hash = ?, vault = ?, pw_at = ?, pw_leaked = 0, pw_checked_at = ?, email_new = NULL, email_new_code = NULL, email_new_at = NULL WHERE id = ?").bind(b.salt, await proofHash(env, b.proof), await lockVault(env, u.id, vault), t, t, u.id),
    D.prepare(`DELETE FROM pg_sessions WHERE user_id = ? AND ${OTHERS}`).bind(u.id, ...othersOf(u)),
    D.prepare("DELETE FROM pg_resets WHERE user_id = ?").bind(u.id),
  ]);
  waitUntil(logEvent(env, u.id, "password", request));
  waitUntil(notifyPasswordChanged(env, u, request).catch(() => {}));
  return json({ ok: true });
}

// Always answers the same way, so it can't be used to find out who has an account.
/* ---------------- admin ----------------
   The site's admin is an account, linked once (pg_meta admin_user) from the old dashboard, signed in there as the
   site's owner and as the account in the same browser; from then on Admin is on that account's own page
   (account.<site>, functions/api/account admin/*, the routes below), and the owner's sign-in no longer opens it.
   There, it's that account only, with a passkey on it; looking needs it to have shown it's you (password or
   passkey) in the last 12 hours, a change in the last 10 minutes, from the page itself (its Origin).
   Until one's linked (or if the linked account's gone, or being deleted): the site owner's sign-in, as before (the
   key icon on the home page: password or passkey, an HttpOnly SameSite=Strict cookie), changes needing a custom
   header a form on another site can't send. Either way: account details, never passwords, keys or scrolls. */
const ADMIN_LOOK = 12 * HOUR;
const onAccountPage = (request) => new URL(request.url).pathname.startsWith("/api/account/");
// the linked account (and how many passkeys it has), if there is one and it's still there
async function adminAccount(env) {
  return (await db(env)).prepare(`SELECT u.id, u.name, u.handle, u.email, (SELECT COUNT(*) FROM pg_passkeys p WHERE p.user_id = u.id) AS passkeys
    FROM pg_meta m JOIN pg_users u ON u.id = m.v WHERE m.k = 'admin_user' AND u.delete_at IS NULL`).first();
}
async function requireAdmin(request, env, write) {
  const linked = await adminAccount(env);
  if (onAccountPage(request)) {
    const u = await cookieUser(request, env);
    if (!u || !linked || u.id !== linked.id) throw new HttpError(403, "This account isn’t the site’s admin.");
    if (!linked.passkeys) throw new HttpError(403, "Add a passkey to your account to use Admin.", "passkey");
    if (write) sameOrigin(request);
    if (!(Date.now() - (u.authAt || 0) < (write ? FRESH : ADMIN_LOOK))) throw new HttpError(403, "Confirm it’s you first.", "reauth");
    return u;
  }
  if (linked) throw new HttpError(410, "Admin is on your account’s page now.", "moved");
  if (!(await isAuthed(request, env))) throw new HttpError(401, "Sign in as the site owner first.");
  if (write && request.headers.get("X-InFlight-Admin") !== "1") throw new HttpError(403, "Admin changes must come from the admin page.");
}
async function adminStatus({ request, env }) {
  const authed = await isAuthed(request, env), linked = await adminAccount(env);
  // (linked: it's moved, and where to; not yet: who's signed in to their account in this browser, to link)
  if (linked) return json({ authed, configured: !!env.EDIT_PASSWORD, moved: `${accountPage(request, env)}/#admin` });
  const c = authed ? await cookieUser(request, env) : null;
  const can = c && await (await db(env)).prepare("SELECT COUNT(*) AS n FROM pg_passkeys WHERE user_id = ?").bind(c.id).first();
  return json({ authed, configured: !!env.EDIT_PASSWORD, email: authed ? emailReady(env) : undefined,
    from: authed ? `${emailFrom(env, "inflight")} and ${emailFrom(env, "account")}` : undefined, testTo: authed ? ownerEmail(env) : undefined,
    account: c ? { name: c.name, handle: c.handle, passkeys: can?.n || 0, page: accountPage(request, env) } : authed ? { page: accountPage(request, env) } : undefined });
}
// Linking: the account signed in in this browser becomes the site's admin (signed in here as the owner, too), and
// Admin moves to its page. It needs a passkey on it first. The account's told, by email.
async function adminLink({ request, env, waitUntil }) {
  await requireAdmin(request, env, true);
  const u = await cookieUser(request, env);
  if (!u) throw new HttpError(400, "Sign in to your account in this browser first.");
  const D = await db(env), pk = await D.prepare("SELECT COUNT(*) AS n FROM pg_passkeys WHERE user_id = ?").bind(u.id).first();
  if (!pk?.n) throw new HttpError(400, `Add a passkey to @${u.handle} first, on your account’s page.`);
  await D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('admin_user', ?)").bind(u.id).run();
  await adminLog(env, "linked", u.id, `@${u.handle}`);
  waitUntil(accountMail(env, u, { icon: "shield", title: "Admin is on your account now", subject: "Admin is linked to your account",
    line: "the site’s admin is linked to your account: it’s on your account’s page now, and the owner’s sign-in no longer opens it.",
    after: "If this wasn’t you, change your password and sign out your other devices.", button: { label: "Open Admin", url: `${accountPage(request, env)}/#admin` } },
    linkOrigin(request)).catch((e) => console.error("admin link mail", e.message)));
  return json({ moved: `${accountPage(request, env)}/#admin`, message: `Admin is linked to @${u.handle}.` });
}
// The figures beside each row of the account page's Admin section
async function adminSummary({ request, env }) {
  await requireAdmin(request, env);
  const t = Date.now(), r = await (await db(env)).prepare(`SELECT (SELECT COUNT(*) FROM pg_users) AS accounts,
    (SELECT COUNT(*) FROM pg_users u WHERE MAX(COALESCE(u.seen_at, 0), COALESCE((SELECT MAX(seen_at) FROM pg_sessions s WHERE s.user_id = u.id), 0)) > ?1) AS online,
    (SELECT COUNT(*) FROM pg_invites WHERE used_at IS NULL AND revoked_at IS NULL) AS invites,
    (SELECT MAX(at) FROM pg_admin_log) AS logAt`).bind(t - 150e3).first();
  const on = emailReady(env);
  return json({ ...r, email: on, from: on ? `${emailFrom(env, "inflight")} and ${emailFrom(env, "account")}` : null, testTo: on ? ownerEmail(env) : null });
}
// What's kept, and how much (functions/_retention.js): rows per table, the database's size, files in storage
async function adminStorage({ request, env }) {
  await requireAdmin(request, env);
  return json(await storageReport(env, await db(env), Date.now()));
}
// How InFlight is used, in totals (functions/_insights.js)
async function adminInsights({ request, env }) {
  await requireAdmin(request, env);
  return json(await insights(env, await db(env), Date.now()));
}
async function adminUsers({ request, env }) {
  await requireAdmin(request, env);
  const D = await db(env), t = Date.now();
  const { results } = await D.prepare(`
    SELECT u.id, u.name, u.handle, u.email, u.created_at, u.avatar_at, u.swift, u.swift_at, u.turbo, u.turbo_at, u.rocket, u.rocket_at,
      MAX(COALESCE(u.seen_at, 0), COALESCE((SELECT MAX(seen_at) FROM pg_sessions s WHERE s.user_id = u.id), 0)) AS last_seen,
      (SELECT COUNT(*) FROM pg_sessions s WHERE s.user_id = u.id) AS sessions,
      (SELECT COUNT(*) FROM pg_passkeys p WHERE p.user_id = u.id) AS passkeys,
      (SELECT COUNT(*) FROM pg_passkeys p WHERE p.user_id = u.id AND p.vault IS NOT NULL) AS unlocking,
      (SELECT COUNT(*) FROM pg_links l WHERE l.status = 'ok' AND (l.a = u.id OR l.b = u.id)) AS friends,
      (SELECT COUNT(*) FROM pg_msgs m WHERE m.sender = u.id) + (SELECT COUNT(*) FROM pg_gmsgs m WHERE m.sender = u.id) AS sent,
      (SELECT COUNT(*) FROM pg_group_members g WHERE g.user_id = u.id) AS groups
    FROM pg_users u ORDER BY u.created_at DESC LIMIT 1000`).all();
  // a group message counts once; each of its pigeons still in the air counts as flying
  const totals = await D.prepare(`SELECT (SELECT COUNT(*) FROM pg_msgs) + (SELECT COUNT(*) FROM pg_gmsgs) AS msgs,
    (SELECT COUNT(*) FROM pg_msgs WHERE deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)) + (SELECT COUNT(*) FROM pg_gdeliv WHERE deliver_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)) AS flying,
    (SELECT COUNT(*) FROM pg_groups) AS groups`).bind(t).first();
  const users = results.map(({ swift, swift_at, turbo, turbo_at, rocket, rocket_at, ...u }) => {
    const row = { swift, swift_at, turbo, turbo_at, rocket, rocket_at };
    return { ...u, pigeons: Object.fromEntries(GIFTABLE.map((k) => [k, loft(row, k, t).count])) };
  });
  return json({ now: t, users, totals });
}
async function adminTarget(env, b) {
  const u = await (await db(env)).prepare("SELECT * FROM pg_users WHERE id = ?").bind(String(b.id || "")).first();
  if (!u) throw new HttpError(404, "That account doesn’t exist any more.");
  return u;
}
async function adminReset({ request, env }) {
  await requireAdmin(request, env, true);
  const b = await body(request), u = await adminTarget(env, b);
  if (b.mode === "email") {
    if (!emailReady(env)) throw new HttpError(503, "Email isn’t set up yet. Use “Make a reset link” and send it yourself.");
    const token = await createReset(env, u.id, "admin-email", RESET_TTL_EMAIL);
    await accountMail(env, u, { icon: "key", title: "Reset your password", subject: "Reset your password", to: u.email,
      line: "here’s a link to choose a new password for your account.", after: "If you didn’t ask for this, ignore this email: your password won’t change.",
      pill: ["link", "Works once, for 1 hour"], when: false, button: { label: "Choose a new password", url: resetUrl(request, env, token) } }, linkOrigin(request), { explain: true });
    await adminLog(env, "reset-emailed", u.id, `@${u.handle}`);
    return json({ message: `Reset link emailed to ${u.email}. It works for one hour.` });
  }
  const token = await createReset(env, u.id, "admin-link", RESET_TTL_ADMIN);
  await adminLog(env, "reset-link", u.id, `@${u.handle}`);
  return json({ url: resetUrl(request, env, token), message: `One-time link for @${u.handle}. It works for 24 hours. Send it to them privately.` });
}
// Someone's profile picture, for the admin's account list.
async function adminAvatar({ request, env }, id) {
  await requireAdmin(request, env);
  const obj = env.BIO_R2 && (await env.BIO_R2.get(avatarKey(String(id || ""))));
  if (!obj) throw new HttpError(404, "No picture.");
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
// Give someone extra swift, turbo or rocket pigeons, even past a full loft.
// (Standard and dumb pigeons are unlimited: they just wait their turn.)
const GIFTABLE = ["swift", "turbo", "rocket"], GIFT_CAP = 99;
async function adminPigeons({ request, env }) {
  await requireAdmin(request, env, true);
  const b = await body(request), u = await adminTarget(env, b), t = Date.now();
  const kind = String(b.kind || ""), add = Math.floor(Number(b.add));
  if (!GIFTABLE.includes(kind)) throw new HttpError(400, "Choose swift, turbo or rocket.");
  if (!(add >= 1 && add <= GIFT_CAP)) throw new HttpError(400, `Add between 1 and ${GIFT_CAP}.`);
  const p = PIGEONS[kind], l = loft(u, kind, t), n = Math.min(GIFT_CAP, l.count + add);
  // keep the hatching clock where it was, so a gift doesn't delay the next one
  const at = l.count >= p.max ? t : l.at + l.hatched * p.every;
  await (await db(env)).prepare(`UPDATE pg_users SET ${p.col} = ?, ${p.atCol} = ? WHERE id = ?`).bind(n, at, u.id).run();
  await adminLog(env, "pigeons-added", u.id, `@${u.handle} · +${n - l.count} ${kind} (now ${n})`);
  return json({ count: n, message: n - l.count ? `@${u.handle} now has ${n} ${kind} pigeon${n === 1 ? "" : "s"}.` : `@${u.handle} already has the most ${kind} pigeons (${GIFT_CAP}).` });
}
async function adminSignOut({ request, env }) {
  await requireAdmin(request, env, true);
  const u = await adminTarget(env, await body(request));
  const r = await (await db(env)).prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(u.id).run();
  await adminLog(env, "signed-out", u.id, `@${u.handle} · ${r.meta.changes} device(s)`);
  return json({ message: `@${u.handle} was signed out on ${r.meta.changes} device${r.meta.changes === 1 ? "" : "s"}.` });
}
async function adminDelete({ request, env }) {
  const me = await requireAdmin(request, env, true);
  const b = await body(request), u = await adminTarget(env, b);
  if (me?.id === u.id) throw new HttpError(400, "That’s your own account: delete it from Your data.");
  if (String(b.confirm || "").trim().replace(/^@/, "").toLowerCase() !== u.handle) throw new HttpError(400, `Type ${u.handle} to confirm.`);
  await removeAccount(env, u.id);
  await adminLog(env, "deleted", u.id, `@${u.handle}`);
  return json({ message: `@${u.handle} and their scrolls were deleted.` });
}
// Resend's "first email": proves the key and sender work, to the owner's own inbox.
const ownerEmail = (env) => env.PIGEON_ADMIN_EMAIL || env.CONTACT_TO || "georgefarrowgreen@icloud.com";
async function adminTestEmail({ request, env }) {
  await requireAdmin(request, env, true);
  if (!emailReady(env)) throw new HttpError(503, "Add RESEND_API_KEY in Cloudflare first, then redeploy.");
  const to = ownerEmail(env);
  const { text, html } = emailBody({
    brand: "inflight", origin: linkOrigin(request), icon: "bird", title: "Email is working",
    preheader: "InFlight can send password resets and notifications.",
    lines: ["This is a test from the site’s admin. Password resets and notifications will arrive just like this."],
    pill: ["mail", emailFrom(env, "inflight").replace(/^.*<|>$/g, "")], rows: [["Sent", ukTime(Date.now())]],
    button: { label: "Back to admin", url: onAccountPage(request) ? `${accountPage(request, env)}/#admin` : `${linkOrigin(request)}/pigeon/admin/` },
  });
  await sendEmail(env, { brand: "inflight", to, subject: "InFlight email is working", text, html }, { explain: true });
  await adminLog(env, "test-email", null, to);
  return json({ message: `Test email sent to ${to} from ${emailFrom(env, "inflight")}. Check your inbox.` });
}
async function adminInvite({ request, env }) {
  await requireAdmin(request, env, true);
  const note = String((await body(request)).note || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) || null;
  const token = randomToken(32), D = await db(env), t = Date.now(), hash = hex(await sha256(token));
  await D.prepare("INSERT INTO pg_invites (hash, id, note, created_at) VALUES (?, ?, ?, ?)").bind(hash, hash.slice(0, 16), note, t).run();
  await adminLog(env, "invite-made", null, note || "");
  return json({ url: `${accountPage(request, env)}/#invite=${token}`, message: "Invite link made. Copy it now: it isn’t shown again." });
}
async function adminInvites({ request, env }) {
  await requireAdmin(request, env, false);
  const { results } = await (await db(env)).prepare(`SELECT i.id, i.note, i.created_at, i.used_at, i.revoked_at, u.handle, u.name FROM pg_invites i
    LEFT JOIN pg_users u ON u.id = i.used_by ORDER BY (i.used_at IS NULL AND i.revoked_at IS NULL) DESC, i.created_at DESC LIMIT 200`).all();
  return json({ invites: results.map((r) => ({ id: r.id, note: r.note, createdAt: r.created_at, usedAt: r.used_at, revokedAt: r.revoked_at, by: r.used_at ? { handle: r.handle || null, name: r.name || null } : null })) });
}
async function adminInviteRevoke({ request, env }) {
  await requireAdmin(request, env, true);
  const id = String((await body(request)).id || "");
  const r = await (await db(env)).prepare("UPDATE pg_invites SET revoked_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL").bind(Date.now(), id).run();
  if (!r.meta.changes) throw new HttpError(409, "That invite was already used or cancelled.");
  await adminLog(env, "invite-cancelled", null, id);
  return json({ message: "Invite cancelled. Its link no longer works." });
}
async function adminLogList({ request, env }) {
  await requireAdmin(request, env);
  const { results } = await (await db(env)).prepare("SELECT * FROM pg_admin_log ORDER BY id DESC LIMIT 100").all();
  return json({ log: results });
}

// The same, on the linked account's own page (functions/api/account: admin/…)
export const ADMIN_ROUTES = {
  "GET admin/summary": adminSummary, "GET admin/users": adminUsers, "GET admin/avatar": (ctx) => adminAvatar(ctx, new URL(ctx.request.url).searchParams.get("id")),
  "GET admin/invites": adminInvites, "GET admin/insights": adminInsights, "GET admin/storage": adminStorage, "GET admin/log": adminLogList,
  "POST admin/reset": adminReset, "POST admin/signout": adminSignOut, "POST admin/pigeons": adminPigeons, "POST admin/delete": adminDelete,
  "POST admin/invite": adminInvite, "POST admin/invite-revoke": adminInviteRevoke, "POST admin/test-email": adminTestEmail,
};

/* ---------------- router ---------------- */
/* ---------------- notifications ---------------- */
async function pushKey({ request, env }) {
  await requireUser(request, env);
  return json({ key: (await vapid(env)).pub });
}
async function pushSubscribe({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request), endpoint = String(b.endpoint || ""), p256dh = String(b.keys?.p256dh || ""), auth = String(b.keys?.auth || "");
  if (!pushEndpointOk(endpoint) || endpoint.length > 1000) throw new HttpError(400, "This browser’s push service isn’t supported.");
  if (fromB64url(p256dh).length !== 65 || fromB64url(auth).length !== 16) throw new HttpError(400, "That push subscription was malformed.");
  const D = await db(env);
  await D.prepare("DELETE FROM pg_push WHERE user_id = ? AND session = ? AND endpoint != ?").bind(u.id, u.sessionHash, endpoint).run();
  // (a push address another account here is still signed in with stays theirs: one that's somehow learnt can't be taken over)
  await D.prepare(`INSERT INTO pg_push (endpoint, user_id, session, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = ?2, session = ?3, p256dh = ?4, auth = ?5, created_at = ?6
    WHERE pg_push.user_id = ?2 OR NOT EXISTS (SELECT 1 FROM pg_sessions WHERE hash = pg_push.session)`)
    .bind(endpoint, u.id, u.sessionHash, p256dh, auth, Date.now()).run();
  await D.prepare("DELETE FROM pg_push WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM pg_push WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 10)").bind(u.id).run();
  return json({ ok: true });
}
async function pushUnsubscribe({ request, env }) {
  const u = await requireUser(request, env);
  const endpoint = String((await body(request)).endpoint || "");
  await (await db(env)).prepare("DELETE FROM pg_push WHERE user_id = ? AND (endpoint = ? OR session = ?)").bind(u.id, endpoint, u.sessionHash).run();
  return json({ ok: true });
}
async function pushTest({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "pushtest:" + u.id, 10, 60 * 60e3);
  const n = await pushTo(env, u.id, { title: "InFlight", body: "Notifications are on. You’ll hear when a pigeon lands.", tag: "test", url: "/pigeon/" });
  return json({ sent: n });
}
async function notifyTick({ request, env }) {
  tickAuthOk(request, env);
  return json(await tick(env, linkOrigin(request)));
}
// The link at the bottom of notification emails. GET shows a button (so mail
// scanners that follow links don't unsubscribe anyone); POST turns email off,
// which also serves one-click unsubscribe (RFC 8058).
const unsubPage = (title, msg, form) => new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>InFlight Emails</title>
<style>
  :root{--bg:#f2f2f7;--card:#fff;--label:#1c1c1e;--label-2:#6e6e73;--tint:#0a7aff}
  @media (prefers-color-scheme:dark){:root{--bg:#1c1c1f;--card:#2a2a2e;--label:#f5f5f7;--label-2:#a1a1a6;--tint:#3d9bff}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--label);font:17px/1.35 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:-.41px;-webkit-font-smoothing:antialiased}
  main{width:100%;max-width:380px;display:flex;flex-direction:column;align-items:center;text-align:center}
  img{width:88px;height:88px;border-radius:22px;box-shadow:0 10px 30px -10px rgba(10,111,240,.5);margin-bottom:22px}
  h1{margin:0 0 10px;font-size:28px;line-height:34px;font-weight:700;letter-spacing:.2px}
  p{margin:0 0 26px;color:var(--label-2);font-size:17px;line-height:23px;text-wrap:balance}
  form{width:100%}
  .btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;border:0;border-radius:999px;background:var(--tint);color:#fff;font:600 17px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-decoration:none;cursor:pointer}
  .btn.plain{background:none;color:var(--tint);margin-top:6px}
</style></head>
<body><main><img src="/pigeon/icon-192.png" alt=""><h1>${title}</h1><p>${msg}</p>${form || `<a class="btn" href="/pigeon/">Open InFlight</a>`}</main></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" } });
async function unsubUser(env, request) {
  const q = new URL(request.url).searchParams, id = q.get("u") || "", tok = q.get("t") || "";
  const u = UUID_RE.test(id) && tok ? await (await db(env)).prepare("SELECT id, unsub FROM pg_users WHERE id = ?").bind(id).first() : null;
  return u && u.unsub && safeEqual(u.unsub, tok) ? u : null;
}
async function unsubscribeGet({ request, env }) {
  if (!(await unsubUser(env, request))) return unsubPage("Link expired", "This link doesn’t work any more. You can turn emails off in InFlight, under Account → Notifications.");
  const q = new URL(request.url).search.replace(/"/g, "");
  return unsubPage("Turn off emails?", "You won’t get emails when pigeons land or friends add you. Notifications on your phone aren’t affected.",
    `<form method="post" action="/api/pigeon/unsubscribe${q}"><button class="btn">Turn Off Emails</button></form><a class="btn plain" href="/pigeon/">Keep Them On</a>`);
}
async function unsubscribePost({ request, env }) {
  const u = await unsubUser(env, request);
  if (!u) return unsubPage("Link expired", "This link doesn’t work any more. You can turn emails off in InFlight, under Account → Notifications.");
  await (await db(env)).prepare("UPDATE pg_users SET notify_email = 0 WHERE id = ?").bind(u.id).run();
  return unsubPage("Emails turned off", "InFlight won’t email you any more. You can turn them back on any time in Account → Notifications.");
}

const ROUTES = {
  "POST signup": elsewhere("New accounts are made"), "POST admin-invite": adminInvite, "GET admin-invites": adminInvites, "POST admin-invite-revoke": adminInviteRevoke, "POST confirm-email": confirmEmail, "POST confirm-resend": confirmResend, "GET handle-free": handleFree, "POST salt": salt, "POST login": login, "POST logout": logout, "POST resume": resume, "GET vault": vault, "POST vault": vaultByProof,
  "PATCH me": updateMe, "DELETE me": deleteMe,
  "POST passkey-options": passkeyOptions, "POST passkey-register": passkeyRegister, "POST passkey-vault": passkeyVault,
  "POST passkey-login": passkeyLogin, "DELETE passkey": passkeyDelete, "POST reauth": reauth,
  "GET sessions": sessionsList, "POST sessions-end": sessionsEnd, "POST account-link": accountLink, "GET pins": pinsGet, "POST pins": pinsPut,
  "GET sync": sync,
  "POST friends": addFriend, "GET friend-status": friendStatus, "POST friends-respond": respondFriend, "DELETE friends": removeFriend,
  "POST block": block, "DELETE block": unblock,
  "GET messages": listMessages, "POST messages": sendMessage, "POST read": markRead, "POST recall": recallMessage, "POST stopover-note": stopoverNote, "GET mutuals": mutuals, "GET wx-plan": wxPlan, "GET route-plan": routePlan,
  "GET photo": getPhoto,
  "POST avatar": putAvatar, "DELETE avatar": deleteAvatar, "GET avatar": getAvatar,
  "POST password": changePassword, "POST password-upgrade": passwordUpgrade, "GET pwned": pwned, "POST reset-request": elsewhere("Reset your password"), "POST reset-check": elsewhere("Reset your password"), "POST reset-complete": elsewhere("Reset your password"),
  "GET admin-status": adminStatus, "POST admin-link": adminLink, "GET admin-users": adminUsers, "POST admin-reset": adminReset,
  "POST admin-signout": adminSignOut, "POST admin-pigeons": adminPigeons, "GET admin-avatar": adminAvatar, "POST admin-delete": adminDelete, "GET admin-log": adminLogList,
  "POST admin-test-email": adminTestEmail, "GET admin-storage": adminStorage, "GET admin-insights": adminInsights,
  "GET push-key": pushKey, "POST push-sub": pushSubscribe, "DELETE push-sub": pushUnsubscribe, "POST push-test": pushTest,
  "POST notify-tick": notifyTick, "GET unsubscribe": unsubscribeGet, "POST unsubscribe": unsubscribePost,
  ...GROUP_ROUTES, ...GIF_ROUTES, ...REACT_ROUTES, ...STATS_ROUTES, ...SKIES_ROUTES, ...TRACKER_ROUTES, ...VANISH_ROUTES, ...WINDMAP_ROUTES, ...CHEER_ROUTES, ...FLY_ROUTES, ...BIRD_ROUTES, ...PASSPORT_ROUTES, ...FEATHER_ROUTES, ...NEWS_ROUTES, ...LOFT_ROUTES,
};

const HOSTS = /^(?:(?:www\.|chat\.)?georgefarrowgreen\.com|(?:chat\.)?localhost|127\.0\.0\.1)$/;
// (and the tests' own addresses for the app: CHAT_HOST, functions/_app.js)
// (and the tests' stand-in for the site's own address, where its admin's old dashboard is, as georgefarrowgreen.com is)
const hostOk = (h, env) => HOSTS.test(h) || String(env.CHAT_HOST || "").split(",").includes(h) || (!!env.ACCOUNT_SITE && h === env.ACCOUNT_SITE);
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const parts = url.pathname.replace(/^\/api\/pigeon\/?/, "").split("/");
  // (the scheduled notify job calls the site's .pages.dev address, past the custom domain's bot checks: only that, there)
  if (!hostOk(url.hostname, ctx.env) && !(parts[0] === "notify-tick" && url.hostname === "georgefarrowgreen.pages.dev")) return json({ error: "Not found." }, 404);
  const handler = ROUTES[`${ctx.request.method} ${parts[0]}`];
  // pigeons land on a timer; let ordinary traffic notice them (at most once a minute)
  if (ctx.env.DB && parts[0] !== "notify-tick") ctx.waitUntil(maybeTick(ctx.env, linkOrigin(ctx.request)).catch((e) => console.error("pigeon tick", e && e.message)));
  try {
    if (!handler) throw new HttpError(404, "Not found.");
    const trips0 = TRIPS.n, res = await handler(ctx, parts[1]);
    // signed in here from before the site's sign-in was shared, or since signed out elsewhere with this still going: this
    // sign-in given to the browser for the site too (functions/_account.js), now it's checked
    // (once a session: a browser that won't keep it isn't asked again every sync)
    if (parts[0] === "sync" && res.ok && !cookieToken(ctx.request, ctx.env)) {
      const h = await hashOf(/^Bearer (.+)$/.exec(ctx.request.headers.get("Authorization") || "")[1]);
      if (!(await (await db(ctx.env)).prepare("SELECT site_hash FROM pg_sessions WHERE hash = ?").bind(h).first())?.site_hash) await withSession(res, ctx.request, ctx.env, h, true);
    }
    if (ctx.env.PIGEON_COUNT_DB) try { res.headers.set("X-DB-Trips", String(TRIPS.n - trips0)); } catch (_) {}   // (tests: what it cost)
    return res;
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    console.error("pigeon", e && e.stack || e);
    return json({ error: "Something went wrong on our side. Try again in a moment." }, 500);
  }
}
