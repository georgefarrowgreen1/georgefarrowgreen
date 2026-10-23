// Weather and the site's account (functions/_account.js). Signed in anywhere on the site in this browser, Weather is
// too; or it signs in itself, with a passkey or an email and password, checked as everywhere else, and that sign-in is
// the site's. It never holds the session itself: each request carries the site's cookie, and only from Weather's own
// pages.
//
// Your profile is the account's (functions/_profile.js): your photo, name and handle shown here, and changed here as in
// any app on the site, by the same rules; your email (your sign-in) shown as it is.
//
// What it keeps with the account: your saved places, your settings, and which notifications you want for which places
// (and whether the warnings and the briefing come by email too: notify.email) (wx_accts: functions/_wxpush.js), so
// they're the same on every phone and computer you're signed in on. One record with
// a version: a change is sent with the version it was made from, so two devices changing it at once can't lose either's
// (the second is told the first's, merges its own into it and sends again: weather/account.js).

import { HttpError, limit, deviceOf, db, randomToken, hex, sha256, clientNet } from "./_pigeon.js";
import { cookieUser, sameOrigin, withCookie, cookieToken } from "./_account.js";
import { accountRoutes, json, body, signedIn } from "./_accountapi.js";
import { wxdb, wantOf, applyAccount, devicesOf, subscribe, leaveAccount, MAX_PLACES } from "./_wxpush.js";
import { isWeather } from "./_wxapp.js";

const MAX_SAVED = 50, MAX_DATA = 48 * 1024;
const cleanText = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
const num = (v, lim) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? v : null);

// What's kept, made safe: { places: [{ name, region, lat, lon }], settings: {…} (the app checks each when it takes them
// up: weather/app.js loadSettings), notify: { places, brief, briefAt } (functions/_wxpush.js wantOf) }
export function cleanData(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new HttpError(400, "Bad request.");
  const seen = new Set(), places = [];
  for (const p of Array.isArray(d.places) ? d.places : []) {
    const lat = num(p?.lat, 90), lon = num(p?.lon, 180);
    if (lat == null || lon == null) continue;
    const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (seen.has(k)) continue;
    seen.add(k); places.push({ name: cleanText(p.name, 60) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, region: cleanText(p.region, 80), lat, lon });
  }
  if (places.length > MAX_SAVED) throw new HttpError(400, `You can keep ${MAX_SAVED} places at most.`);
  const settings = d.settings && typeof d.settings === "object" && !Array.isArray(d.settings) ? d.settings : {};
  const n = wantOf(d.notify);
  // (where each notification's place is My Location on the device that chose it)
  n.places = n.places.slice(0, MAX_PLACES);
  const out = { places, settings, notify: n };
  if (JSON.stringify(out).length > MAX_DATA) throw new HttpError(413, "That's more than can be kept.");
  return out;
}
const EMPTY = { places: [], settings: null, notify: { places: [], brief: null, briefAt: "07:00", email: { warn: false, brief: false } } };
export async function kept(env, userId) {
  const r = await (await wxdb(env)).prepare("SELECT data, ver FROM wx_accts WHERE user_id = ?").bind(userId).first();
  if (!r) return { ver: 0, data: EMPTY };
  try { return { ver: r.ver, data: JSON.parse(r.data) }; } catch (_) { return { ver: r.ver, data: EMPTY }; }
}
// The account as Weather shows it: who (the profile: name, handle, email, and when the photo was set, if there is one),
// what's kept, and which devices get its notifications
async function view(env, u) {
  const k = await kept(env, u.id);
  return { signedIn: true, id: u.id, name: u.name, handle: u.handle, email: u.email, emailOk: !!u.email_ok, photoAt: u.avatar_at || null, ver: k.ver, data: k.data, devices: await devicesOf(env, u.id) };
}
export const ACCOUNT_ROUTES = {
  // who's signed in (and what's kept), or { signedIn: false }; the cookie's life renewed while it's used
  "GET me": async ({ request, env }) => {
    const u = await cookieUser(request, env);
    if (!u) return json({ signedIn: false });
    return withCookie(json(await view(env, u)), request, env, u.token);
  },
  // a change: { base (the version it was made from), data }; 409 with what's kept now if that's moved on
  "PUT me": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    await limit(env, `wxacct:${u.id}`, 240, 3600e3);
    const data = cleanData(b.data), base = Number.isInteger(b.base) ? b.base : -1, D = await wxdb(env), t = Date.now();
    const was = await kept(env, u.id);
    if (base !== was.ver) return json({ conflict: true, ver: was.ver, data: was.data }, 409);
    const r = base === 0
      ? await D.prepare("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?1, ?2, 1, ?3) ON CONFLICT(user_id) DO NOTHING").bind(u.id, JSON.stringify(data), t).run()
      : await D.prepare("UPDATE wx_accts SET data = ?2, ver = ver + 1, updated = ?3 WHERE user_id = ?1 AND ver = ?4").bind(u.id, JSON.stringify(data), t, base).run();
    if (!r.meta?.changes) { const now = await kept(env, u.id); return json({ conflict: true, ver: now.ver, data: now.data }, 409); }
    // (the notifications, for each of the account's devices and its email, if they've changed, or the units its emails are in)
    if (JSON.stringify(data.notify) !== JSON.stringify(was.data.notify) || unitsChanged(data.settings, was.data.settings)) await applyAccount(env, u.id, data.notify, data.settings);
    return json({ ver: base + 1, data });
  },
  // The account's own page, opened signed in as you (from the account's card): a code good once, for a minute, for this
  // sign-in, which the page swaps for one of its own (functions/api/account handoff), in whichever browser it opens in
  "POST account-link": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), D = await db(env), t = Date.now();
    await limit(env, "handoff:" + u.id, 30, 15 * 60e3);
    const code = randomToken(24);
    await D.batch([D.prepare("DELETE FROM pg_handoff WHERE expires < ?").bind(t),
      D.prepare("INSERT INTO pg_handoff (hash, user_id, session, expires) VALUES (?, ?, ?, ?)").bind(hex(await sha256(code)), u.id, u.sessionHash, t + 60e3)]);
    return json({ code });
  },
  // signing in and out, and the profile, as on every such page on the site (functions/_accountapi.js); signed out
  // here, this device's notifications stay, as its own
  ...accountRoutes(view, { onSignOut: (env, u, b) => (b.endpoint ? leaveAccount(env, b.endpoint, u.id) : null) }),
};
const unitsChanged = (a, b) => ["temp", "wind", "precip", "clock"].some((k) => (a || {})[k] !== (b || {})[k]);
// Weather's emails turned on or off from outside the app (the account's page; an email's own link, all off): change is
// { warn, brief } (either), kept as Weather's own choices are, a new version (so Weather's pages take it up), and sent
// on to its email. → the account's notifications now
export async function setMail(env, userId, change) {
  const D = await wxdb(env);
  for (let i = 0; i < 3; i++) {
    const was = await kept(env, userId), t = Date.now();
    const data = cleanData({ ...was.data, notify: { ...was.data.notify, email: { ...was.data.notify?.email, ...change } } });
    const r = was.ver === 0
      ? await D.prepare("INSERT INTO wx_accts (user_id, data, ver, updated) VALUES (?1, ?2, 1, ?3) ON CONFLICT(user_id) DO NOTHING").bind(userId, JSON.stringify(data), t).run()
      : await D.prepare("UPDATE wx_accts SET data = ?2, ver = ver + 1, updated = ?3 WHERE user_id = ?1 AND ver = ?4").bind(userId, JSON.stringify(data), t, was.ver).run();
    if (r.meta?.changes) { await applyAccount(env, userId, data.notify, data.settings); return data.notify; }
  }
  throw new HttpError(409, "That didn’t save. Try again.");
}
// Turning notifications on (or changing them) on a device: signed in, as the account's choices, and the device one of
// the account's; signed out, as its own
export async function subscribeHere(request, env, b) {
  const u = cookieToken(request, env) && isWeather(new URL(request.url), env) ? await cookieUser(request, env) : null;
  return subscribe(env, b, u, u ? (await kept(env, u.id)).data.notify : null, u ? deviceOf(request) : "", hex(await sha256("wxnet|" + clientNet(request))).slice(0, 24));
}
