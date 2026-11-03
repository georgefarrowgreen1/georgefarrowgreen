// InFlite Today (inflite.ai): its API, at the account's address. Today is a Worker of its own (the inflite repo's
// today/), not part of this project, so it asks here, passing on what its page sent it: the browser's cookie for the
// site, who it is (the browser's own words for it), and its own Origin, which every route here checks
// (functions/_sites.js todayOrigin), as Mail's do. Signing in is the account's page's, as for every app
// (functions/_handback.js, app "today"). What it keeps is functions/_today.js's; its cards are worked out by
// functions/_todaycards.js, and its morning notification by functions/_todaymorning.js.
// (functions/_pigeon.js appKey knows these as Today's, so a sign-in handed over for the account's page alone doesn't
// open Today.)
//   GET    /api/account/today/me            who the cookie's account is, as Today's page needs it (the session view)
//   POST   /api/account/today/handback      the code Today was handed back with, and its word: the sign-in, as the cookie
//   POST   /api/account/today/signout       the site's sign-in ended (so everywhere it was shared), and this sign-in's devices
//   GET    /api/account/today/cards         the cards (?only=weather,chat), and the Morning section with them (?with=morning)
//   PUT    /api/account/today/prefs         Edit's: the cards' order, and those hidden
//   GET    /api/account/today/morning       the Morning section: its settings, and what it says
//   PUT    /api/account/today/morning       …changed: on or off, its time, its lines
//   POST   /api/account/today/morning/try   one now, to this device ("Show it on this phone")
//   GET    /api/account/today/push-key      the site's push key, for a device to subscribe with
//   POST   /api/account/today/push          a device the morning notification goes to; push-move: renewed by the browser
//   DELETE /api/account/today/push          …and taken off
//   POST   /api/account/today/account-link  a code that signs the account's page in (good once, for a minute)
//   GET    /api/account/today/avatar        a friend's photo, or your own, as Chat would show it
// And Today First's (the one window at inflite.ai: Today, Chats, Apps and You; each handled in its own module, which
// takes plain arguments and gives back a plain answer, sent here as it is):
//   POST   /api/account/today/act           an act taken (Move It, Add Thursday's Ride, Ride Then) or kept (Keep)
//   POST   /api/account/today/act/undo      …undone, where it hasn't been changed by hand since (functions/_todayacts.js)
//   GET    /api/account/today/rules         the rules Today acts by, each with its level and record
//   PUT    /api/account/today/rules         …a level set by hand
//   GET    /api/account/today/notify        the account's notifications, as its own page has them
//   PATCH  /api/account/today/notify        …changed (functions/_todaynotify.js)
//   POST   /api/account/today/device        this device for every app's notifications (after a tap), or moved
//   DELETE /api/account/today/device        …taken off everywhere
//   GET    /api/account/today/devices       the account's other devices getting notifications
//   DELETE /api/account/today/devices       …one stopped there, never signed out (functions/_devices.js)
// (a device is named in an address only by its hash, never its push address: an address ends up in logs)

import { HttpError, db, hex, sha256, issueSession, limit, randomToken, logError } from "./_pigeon.js";
import { cookieUser, withCookie, withSession, withoutSession } from "./_account.js";
import { takeHandback } from "./_handback.js";
import { json, body, signedIn } from "./_accountapi.js";
import { todayOrigin, todayLinks } from "./_sites.js";
import { prefsOf, vapid } from "./_notify.js";
import { todayPrefs, savePrefs, saveMorning, morningTz, deviceHash, todayDevices, addDevice, moveDevice, removeDevice } from "./_today.js";
import { CARD_KEYS, cardsFor, cardsMemo, avatarFor, localDay } from "./_todaycards.js";
import { previewMorning, sendMorningNow } from "./_todaymorning.js";
import { kept as weatherKept } from "./_wxacct.js";
import { devicesOf as weatherDevices } from "./_wxpush.js";
import { morningOf } from "./_fitpush.js";
import { adminOf } from "./api/pigeon/[[path]].js";
import { actTake, actUndo, rulesGet, rulesPut } from "./_todayacts.js";
import { notifyGet, notifyPatch } from "./_todaynotify.js";
import { deviceAdd, deviceDrop, devicesList, devicesStop } from "./_devices.js";

// (only from Today's own page: its server passes the page's Origin on, which a page elsewhere can't make Today's)
function fromToday(request, env) {
  if (request.headers.get("Origin") !== todayOrigin(env, request)) throw new HttpError(403, "That request didn’t come from Today.");
}
// (a change, as well: Today's server checks its page sent it (its X-Inflite header, and the browser saying it's from
// the same page), and asks here itself, saying nothing of where from; a browser asking here straight says it's from
// another address)
function changeFromToday(request, env) {
  fromToday(request, env);
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") throw new HttpError(403, "That request didn’t come from Today.");
}
// (what the cards are worked out with: the request's waitUntil, so Markets' prices fetched for everyone are written
// down after the answer's gone, as its own server does)
const withWait = (env, waitUntil) => (waitUntil ? { ...env, waitUntil: (p) => waitUntil(p) } : env);
const DEVICE = /^[A-Za-z0-9_-]{16}$/;
// (the morning's lines, in the order the Morning section has them)
const LINES = ["weather", "fitness", "chat", "markets"];
const firstName = (u) => String(u.name || "").trim().split(/\s+/)[0] || u.handle || "";
// (tests only: the moment Today's day is worked out at, set by the request, where this server's TODAY_TEST_AT is "1"
// and Today's Worker passed the header on (its own TEST_AT); never set in production, where it's always now)
const momentOf = (request, env) => {
  const at = request.headers.get("X-Today-At") || "";
  return env.TODAY_TEST_AT === "1" && /^\d{13}$/.test(at) ? Number(at) : Date.now();
};

// The session view: who, Edit's cards, the morning in a word, and the apps' addresses (functions/_sites.js todayLinks);
// and for Today First's You and Apps: quiet hours (Chat's, the account's for every app), whether Mail's there for you
// (the site's admin alone), and whether every app's notifications can come through InFlite (the Pages var HUB_PUSH)
async function todayView(env, u, request) {
  const [row, devs, admin] = await Promise.all([todayPrefs(env, u.id), todayDevices(env, u.id), adminOf(env).catch(() => null)]);
  const p = prefsOf(u);
  return {
    signedIn: true,
    user: { id: u.id, name: u.name, first: firstName(u), handle: u.handle, photoAt: u.avatar_at || null,
      // (the account's look, for every app on the site: Automatic, Light or Dark)
      appearance: ["light", "dark"].includes(u.appearance) ? u.appearance : "auto" },
    prefs: row.cards,
    morning: { on: !!row.m_on, at: row.m_at, devices: devs.length },
    links: todayLinks(env, request),
    quiet: { on: !!p.quiet, from: p.quietFrom, to: p.quietTo },
    apps: { mail: !!admin && admin.id === u.id },
    hubPush: env.HUB_PUSH === "1",
  };
}

// (the cards worked out now, for the page, and kept a minute for the Morning section's changes: functions/_todaycards.js;
// v: 2 for Today First's day with them, functions/_todayday.js)
async function freshCards(env, u, row, request, t, { v = 1 } = {}) {
  const answer = await cardsFor(env, u, { t, request, tz: morningTz(u, row), links: todayLinks(env, request), v });
  cardsMemo.set(u.id, answer);
  return answer;
}
// The Morning section: its settings; whether this device is one it goes to (device: the device's hash, as its page
// names it); this morning's as it was sent, or the next as it would be now, from the cards given (the page's own, just
// worked out), else those kept from the last minute, else worked out now; and what it comes instead of (Weather's
// briefing, where that's on with a device; Fitness's morning reminder, where that's on on a phone)
async function morningView(env, u, row, { t, device = null, cards = null, request = null }) {
  // (sent: this morning's went out, so it's shown as it came; a day claimed with nothing to send leaves an earlier
  // day's m_last, which isn't this morning's, as previewMorning judges it too)
  const tz = morningTz(u, row), today = localDay(tz, t).day;
  const sent = row.m_sent === today && Number.isFinite(row.m_last?.at) && localDay(tz, row.m_last.at).day === today;
  if (!cards && !sent) cards = cardsMemo.get(u.id)?.answer?.cards || (await freshCards(env, u, row, request, t)).cards;
  const [devs, wx, fm, wxOn, preview] = await Promise.all([
    todayDevices(env, u.id),
    weatherKept(env, u.id).catch(() => null),
    morningOf(env, u.id).catch(() => null),
    weatherDevices(env, u.id).then((d) => d.length, () => 0),
    // (one that can't be said just now leaves the settings to be changed all the same)
    previewMorning(env, u, row, t, { cards: cards || undefined }).catch(async (e) => { if (!(e instanceof HttpError)) await logError(env, "today preview", e); return null; }),
  ]);
  const ok = device && DEVICE.test(device), hashes = ok ? await Promise.all(devs.map((d) => deviceHash(d.endpoint))) : [];
  return {
    on: !!row.m_on, at: row.m_at, tz,
    lines: Object.fromEntries(LINES.map((k) => [k, row.m_lines[k] !== false])),
    // (Chat's own: whether its notifications name who sent a pigeon, which the morning keeps to)
    names: !!prefsOf(u).names,
    devices: devs.length,
    thisDevice: ok ? hashes.includes(device) : null,
    sentToday: sent,
    preview,
    replaces: { weather: !!wx?.data?.notify?.brief && wxOn > 0, fitness: !!fm?.on && (fm?.phones || 0) > 0 },
    place: cards?.weather?.place?.name || wx?.data?.places?.[0]?.name || null,
  };
}
// (the morning never turned on yet: no row, or one only Edit has made)
const firstTime = (row) => row.updated == null || (!row.m_on && row.m_at === 420 && row.m_tz == null && row.m_sent == null && row.m_last == null);

// The routes, spread into the account's API beside Mail's: "GET today/me", "POST today/handback", and so on
export const TODAY_ROUTES = {
  // (signed out, or a sign-in handed over that's the account's page's alone, or an account being deleted: signed out
  // here, with the apps' addresses for its links; signed in, the cookie's life renewed while it's used)
  "GET today/me": async ({ request, env }) => {
    fromToday(request, env);
    const u = await cookieUser(request, env);
    if (!u) return json({ signedIn: false, links: todayLinks(env, request) });
    return withCookie(json(await todayView(env, u, request)), request, env, u.token);
  },
  // (as Mail's: where the browser shares the site's sign-in, it's the one the page just made; where it doesn't (a Home
  // Screen app, with cookies of its own), one of Today's own, no fresher than the page's)
  "POST today/handback": async ({ request, env }) => {
    changeFromToday(request, env);
    const { row, u, authAt } = await takeHandback(env, request, "today", await body(request, 8192));
    const c = await cookieUser(request, env).catch(() => null);
    if (c && c.sessionHash === row.session) return withCookie(json(await todayView(env, c, request)), request, env, c.token);
    const token = await issueSession(env, u.id, request, authAt);
    return withSession(json(await todayView(env, { ...u, authAt }, request)), request, env, hex(await sha256(token)), true);
  },
  "POST today/signout": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await cookieUser(request, env, false, { deleting: true });
    if (u) {
      const D = await db(env);
      await D.prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.sessionHash).run();
      // (the devices this sign-in turned the morning on on: gone with it)
      await D.prepare("DELETE FROM td_push WHERE session = ?").bind(u.sessionHash).run().catch(() => {});
    }
    return withoutSession(json({ ok: true }), request, env);
  },
  // The cards (?only=: those asked for, a list; none, all four), and, for them all, the Morning section composed from
  // the same cards (?with=morning, and ?device=: this device's hash); ?v=2: Today First's day with them (its phase, top
  // cards, Waiting for You, Coming Up, acts, ride), where a page that knows it asks
  "GET today/cards": async ({ request, env, waitUntil }) => {
    fromToday(request, env);
    const u = await signedIn(request, env), q = new URL(request.url).searchParams;
    await limit(env, "today:" + u.id, 600, 3600e3);
    const asked = String(q.get("only") || "").split(",").filter((k) => CARD_KEYS.includes(k)), only = asked.length ? [...new Set(asked)] : null;
    const row = await todayPrefs(env, u.id), envW = withWait(env, waitUntil), t = momentOf(request, env), v = q.get("v") === "2" ? 2 : 1;
    if (only) return json(await cardsFor(envW, u, { only, t, request, tz: morningTz(u, row), links: todayLinks(env, request) }));
    const answer = await freshCards(envW, u, row, request, t, { v });
    if (q.get("with") !== "morning") return json(answer);
    return json({ ...answer, morning: await morningView(envW, u, row, { t, device: q.get("device"), cards: answer.cards, request }) });
  },
  // Edit's: { order, hidden } → { prefs: { order, hidden } }
  "PUT today/prefs": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env), b = await body(request, 4096);
    await limit(env, "todayprefs:" + u.id, 240, 3600e3);
    return json({ prefs: (await savePrefs(env, u.id, { order: b.order, hidden: b.hidden })).cards });
  },
  "GET today/morning": async ({ request, env, waitUntil }) => {
    fromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const row = await todayPrefs(env, u.id);
    return json(await morningView(withWait(env, waitUntil), u, row, { t: Date.now(), device: new URL(request.url).searchParams.get("device"), request }));
  },
  // { on?, at?, lines?, tz? (the browser's zone, with every change), device? } → the Morning section. Turned on for the
  // first time, at the time Weather's briefing or Fitness's reminder already comes, unless one's chosen.
  "PUT today/morning": async ({ request, env, waitUntil }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env), b = await body(request, 4096);
    await limit(env, "todayprefs:" + u.id, 240, 3600e3);
    let at = b.at;
    if (b.on === true && at === undefined && firstTime(await todayPrefs(env, u.id))) at = await firstMorningAt(env, u);
    const row = await saveMorning(env, u.id, { on: b.on, at, lines: b.lines, tz: b.tz });
    return json(await morningView(withWait(env, waitUntil), u, row, { t: Date.now(), device: typeof b.device === "string" ? b.device : null, request }));
  },
  // "Show it on this phone": { endpoint } (this device's, which must be one the morning goes to) → { sent }. Never
  // counts as the day's.
  "POST today/morning/try": async ({ request, env, waitUntil }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env), b = await body(request, 4096);
    await limit(env, "todaytry:" + u.id, 10, 3600e3);
    const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
    if (!endpoint || !(await todayDevices(env, u.id)).some((d) => d.endpoint === endpoint)) throw new HttpError(400, "Turn the morning notification on on this device first.");
    const r = await sendMorningNow(withWait(env, waitUntil), u, { endpoint });
    return json({ sent: r?.sent ? 1 : 0 });
  },
  // (the site's one key, as every app's notifications are signed with: functions/_notify.js)
  "GET today/push-key": async ({ request, env }) => {
    fromToday(request, env);
    return json({ key: (await vapid(env)).pub });
  },
  // { sub: the browser's subscription } → { ok, devices }
  "POST today/push": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env), b = await body(request, 8192);
    await limit(env, "todaypush:" + u.id, 60, 3600e3);
    return json(await addDevice(env, u, b.sub));
  },
  // { sub, was: the endpoint before } → { moved }
  "POST today/push-move": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env), b = await body(request, 8192);
    await limit(env, "todaypush:" + u.id, 60, 3600e3);
    return json(await moveDevice(env, u, { sub: b.sub, was: b.was }));
  },
  // { endpoint } → { ok, devices }
  "DELETE today/push": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env), b = await body(request, 4096);
    return json(await removeDevice(env, u.id, b.endpoint));
  },
  // a code that signs the account's page in as this account (good once, for a minute), for the menu's way there from a
  // Home Screen Today, as Markets' is
  "POST today/account-link": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env), D = await db(env), t = Date.now();
    await limit(env, "handoff:" + u.id, 30, 15 * 60e3);
    const code = randomToken(24);
    await D.batch([D.prepare("DELETE FROM pg_handoff WHERE expires < ?").bind(t),
      D.prepare("INSERT INTO pg_handoff (hash, user_id, session, expires) VALUES (?, ?, ?, ?)").bind(hex(await sha256(code)), u.id, u.sessionHash, t + 60e3)]);
    return json({ code });
  },
  // ?id=: your own photo (the header's), or a friend's, as Chat would show it (functions/_todaycards.js avatarFor)
  "GET today/avatar": async ({ request, env }) => {
    fromToday(request, env);
    const u = await signedIn(request, env), id = new URL(request.url).searchParams.get("id") || "";
    await limit(env, "todayav:" + u.id, 1200, 3600e3);
    const res = /^[A-Za-z0-9-]{1,64}$/.test(id) ? await avatarFor(env, u.id, id) : null;
    return res || json({ error: "No picture." }, 404);
  },

  // ---- Today First's (spec §6.1): each checked here as every route above is, then its module's, with plain
  // arguments, its answer sent as it is (an HttpError it throws is the error's answer, as everywhere) ----
  // { id } → { act, rule: { rule, level, line } }: an offered act taken, or a done add kept
  "POST today/act": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const b = await body(request, 8 * 1024), t = Date.now();
    return json(await actTake(env, u, b, { t }));
  },
  // { id } → { act, rule, said }: undone, where nothing's changed it by hand since
  "POST today/act/undo": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const b = await body(request, 8 * 1024), t = Date.now();
    return json(await actUndo(env, u, b, { t }));
  },
  // → { rules: [{ rule, name, level, setBy, record, line, soon? }] }
  "GET today/rules": async ({ request, env }) => {
    fromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const t = Date.now();
    return json(await rulesGet(env, u, { t }));
  },
  // { rule, level } → { rule, level, setBy: "you", line }
  "PUT today/rules": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const b = await body(request, 8 * 1024), t = Date.now();
    return json(await rulesPut(env, u, b, { t }));
  },
  // → the account's notifications, as its own page has them
  "GET today/notify": async ({ request, env }) => {
    fromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    return json(await notifyGet(env, u));
  },
  // a change, as the account's page sends it → the same, after
  "PATCH today/notify": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const b = await body(request, 8 * 1024);
    return json(await notifyPatch(env, u, b));
  },
  // { sub, was?, fan?, tz } → { ok, tables }
  "POST today/device": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const b = await body(request, 8 * 1024);
    return json(await deviceAdd(env, u, b, { request }));
  },
  // { endpoint } → { ok }
  "DELETE today/device": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const b = await body(request, 8 * 1024);
    return json(await deviceDrop(env, u, b));
  },
  // ?device=: this device's hash → { fan, here, devices }
  "GET today/devices": async ({ request, env }) => {
    fromToday(request, env);
    const u = await signedIn(request, env), q = new URL(request.url).searchParams;
    await limit(env, "today:" + u.id, 600, 3600e3);
    return json(await devicesList(env, u, { device: q.get("device") }, { request }));
  },
  // { id } → { ok }
  "DELETE today/devices": async ({ request, env }) => {
    changeFromToday(request, env);
    const u = await signedIn(request, env);
    await limit(env, "today:" + u.id, 600, 3600e3);
    const b = await body(request, 8 * 1024);
    return json(await devicesStop(env, u, b));
  },
};

// Today's build as inflite.ai/version has it ("1.01"), for the account page's About sheet: asked of it only then
// (GET apps/today-build), kept ten minutes (a minute, where it didn't answer), given two seconds. → null where it doesn't
// answer
let built = null;
export async function todayBuild(env) {
  const t = Date.now();
  if (built && t - built.at < built.keep) return built.build;
  let build = null;
  try {
    const r = await fetch(`${todayOrigin(env)}/version`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(2000) });
    const j = r.ok ? await r.json() : null;
    if (typeof j?.build === "string" && /^\d{1,3}\.\d{2}$/.test(j.build)) build = j.build;
  } catch (_) {}
  built = { at: t, build, keep: build ? 10 * 60e3 : 60e3 };
  return build;
}

// The time the morning notification has when it's first turned on, in minutes after midnight: Weather's briefing's,
// where that's on, else Fitness's morning reminder's, where it's set, else 07:00 (on the five minutes, as Today's are)
const fives = (m) => Math.min(1435, Math.max(0, Math.floor(m / 5) * 5));
export async function firstMorningAt(env, u) {
  const n = (await weatherKept(env, u.id).catch(() => null))?.data?.notify, hm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(n?.briefAt || "07:00"));
  if (n?.brief && hm) return fives(Number(hm[1]) * 60 + Number(hm[2]));
  const fm = await morningOf(env, u.id).catch(() => null);
  if (Number.isInteger(fm?.at)) return fives(fm.at);
  return 420;
}
