// Mail (email.inflite.ai): the site's own inbox, its admin's alone. Mail is a Worker of its own (the inflite repo's
// email/), not part of this project, so it asks here, at the account's address, passing on what its page sent it: the
// browser's cookie for the site, its Origin, and who it is (the browser's own words for it). Signing in is the
// account's page's, as for every app (functions/_handback.js, app "mail"): Mail sends you there and swaps the code it's
// handed back with for a sign-in here, given to the browser as the site's cookie (Mail's server passes it on).
//   GET  /api/account/mail/me         who the cookie's account is, and whether it may open Mail: the site's admin, with a
//                                     passkey, that's shown it's them in the last 12 hours (as Admin's lists need)
//   POST /api/account/mail/handback   the code Mail was handed back with, and its word: the sign-in, as the cookie
//   POST /api/account/mail/signout    the site's sign-in ended (so everywhere it was shared)
//   POST /api/account/mail/notice     Mail's Worker, server to server with the key the two share (MAIL_KEY), saying new
//                                     mail from people has come, or a conversation's back from Later: { kind: "new" |
//                                     "later", thread }. Answered at once, { on, will, held } (One roof stage 4, S4-D8):
//                                     on, whether the admin has Mail's notifications coming through InFlite (You → Mail
//                                     Notifications, prefs.mail.inflite, off unless chosen); will, how many of InFlite's
//                                     devices it's about to tell; held, whether quiet hours or a ride kept it back. Then
//                                     told, after the answer: "Mail", fixed words and the conversation's id, never a word
//                                     of the mail (the phone asks Mail itself for those). Mail tells its own devices only
//                                     where this says !on, or will 0 and not held.
// (functions/_pigeon.js appKey knows these as Mail's, so a sign-in handed over to a browser signed in to nothing, which is
// the account's page's alone until it's shown it's you there, doesn't open Mail)

import { HttpError, db, hex, sha256, issueSession, safeEqual } from "./_pigeon.js";
import { cookieUser, withCookie, withSession, withoutSession } from "./_account.js";
import { takeHandback } from "./_handback.js";
import { json, body } from "./_accountapi.js";
import { appOrigin, hubOrigins } from "./_sites.js";
import { adminOf, ADMIN_LOOK } from "./api/pigeon/[[path]].js";
import { prefsOf, isQuiet, pushToSub } from "./_notify.js";
import { busyNow, holdsFor, heldAdd } from "./_busy.js";
import { todayDevices, deviceOk, deviceGone, deviceFailed } from "./_today.js";

// (a change, only from Mail's own page: its server passes the browser's Origin on, which a page elsewhere can't make
// Mail's. hub: the hand-back alone also from InFlite's own pages (inflite.ai, next.inflite.ai, a test's: the site's
// HUB_ORIGINS, each exactly), where Mail is a module of the one page and swaps its code from there, One roof stage 4,
// S4-D12)
function fromMail(request, env, { hub = false } = {}) {
  const o = request.headers.get("Origin");
  if (o && o === appOrigin("email", env, request)) return;
  if (hub && o && hubOrigins(env, request).includes(o)) return;
  throw new HttpError(403, "That request didn’t come from Mail.");
}

// (Mail's Worker, and nothing else: its key, in constant time, before anything else is read. No cookie is ever looked at)
async function mailKeyed(request, env) {
  const mine = typeof env?.MAIL_KEY === "string" ? env.MAIL_KEY : "";
  if (!mine) throw new HttpError(503, "Not set up.");
  const said = /^Bearer ([\x21-\x7e]{1,512})$/.exec(request.headers.get("Authorization") || "")?.[1] || "";
  const [a, b] = await Promise.all([sha256(said), sha256(mine)]);
  if (!said || !safeEqual(hex(a), hex(b))) throw new HttpError(401, "Not Mail.");
}

// The notice's words, fixed: only the conversation's id comes from Mail, in the tag and the address, never a word of the
// mail itself (S4-D8, spec §2.6)
export const MAIL_WORDS = { new: "New mail from people", later: "Back from Later" };
const THREAD = /^[\w-]{1,64}$/;
export const mailNote = (kind, thread) => ({ app: "mail", title: "Mail", body: MAIL_WORDS[kind], tag: thread, url: `/mail/#thread=${thread}`, ttl: 6 * 3600 });
const OFF = { on: false, will: 0, held: false };

// The account's word on one notice from Mail → { answer, push }: push, what's left to do once it's answered (nothing,
// or each device told, its health kept as the morning's is). t: now
export async function mailNotice(env, { kind, thread }, t = Date.now()) {
  const admin = await adminOf(env).catch(() => null);
  if (!admin) return { answer: OFF, push: null };
  const row = await (await db(env)).prepare("SELECT id, notify_prefs FROM pg_users WHERE id = ?").bind(admin.id).first();
  const p = row ? prefsOf(row) : null;
  if (!p || p.mail?.inflite !== true) return { answer: OFF, push: null };
  if (isQuiet(p, t)) return { answer: { on: true, will: 0, held: true }, push: null };
  // (a ride holds apps' notifications, Mail's among them: counted in the hold rule's record, as every one held is)
  const busy = await busyNow(env, admin.id, t).catch(() => null);
  if (holdsFor(busy, "apps")) return { answer: { on: true, will: 0, held: true }, push: () => heldAdd(env, admin.id, 1) };
  const devs = await todayDevices(env, admin.id).catch(() => []);
  if (!devs.length) return { answer: { on: true, will: 0, held: false }, push: null };
  const note = mailNote(kind, thread);
  return {
    answer: { on: true, will: devs.length, held: false },
    push: async () => {
      const got = await Promise.all(devs.map((d) => pushToSub(env, d, note).catch(() => "error")));
      for (let i = 0; i < devs.length; i++) {
        const r = got[i], e = devs[i].endpoint;
        await (r === "sent" ? deviceOk(env, e) : r === "gone" ? deviceGone(env, e) : deviceFailed(env, e)).catch(() => {});
      }
    },
  };
}

// The account as Mail needs it: whether it's the admin's, with a passkey on it, and shown it's them lately (fresh); and
// its Appearance, as the other apps have it
async function mailView(env, u) {
  const admin = await adminOf(env).catch(() => null), isAdmin = !!admin && admin.id === u.id;
  return {
    signedIn: true, admin: isAdmin, passkey: isAdmin && admin.passkeys > 0, fresh: Date.now() - (u.authAt || 0) < ADMIN_LOOK,
    name: u.name, handle: u.handle, email: isAdmin ? u.email : null, photoAt: u.avatar_at || null,
    // (the account's look, for every app on the site: Automatic, Light or Dark)
    appearance: ["light", "dark"].includes(u.appearance) ? u.appearance : "auto",
    // (the account's Quiet Hours, every app's, from its Notifications page: Mail keeps new mail's notices to them)
    ...(isAdmin ? { quiet: ((p) => ({ on: !!p.quiet, from: p.quietFrom, to: p.quietTo, tz: p.tz }))(prefsOf(u)) } : {}),
  };
}

export const MAIL_ROUTES = {
  "GET mail/me": async ({ request, env }) => {
    const u = await cookieUser(request, env);
    return json(u ? await mailView(env, u) : { signedIn: false });
  },
  // (as Fitness's: where the browser shares the site's sign-in, it's the one the page just made; where it doesn't (a
  // Home Screen app), one of Mail's own, no fresher than the page's)
  "POST mail/handback": async ({ request, env }) => {
    fromMail(request, env, { hub: true });
    const { row, u, authAt } = await takeHandback(env, request, "mail", await body(request));
    const c = await cookieUser(request, env).catch(() => null);
    if (c && c.sessionHash === row.session) return withCookie(json(await mailView(env, c)), request, env, c.token);
    const token = await issueSession(env, u.id, request, authAt);
    return withSession(json(await mailView(env, { ...u, authAt })), request, env, hex(await sha256(token)), true);
  },
  // (Mail's Worker's word, its key first; answered before anyone's told, the telling left to run after the answer)
  "POST mail/notice": async ({ request, env, waitUntil }) => {
    await mailKeyed(request, env);
    const b = await body(request, 1024);
    if (!Object.hasOwn(MAIL_WORDS, b.kind) || typeof b.thread !== "string" || !THREAD.test(b.thread)) throw new HttpError(400, "Bad request.");
    const { answer, push } = await mailNotice(env, { kind: b.kind, thread: b.thread });
    if (push) {
      const went = Promise.resolve().then(push).catch((e) => console.error("mail notice", e && e.message));
      if (typeof waitUntil === "function") waitUntil(went);
    }
    return json(answer);
  },
  "POST mail/signout": async ({ request, env }) => {
    fromMail(request, env);
    const u = await cookieUser(request, env, false, { deleting: true });
    if (u) await (await db(env)).prepare("DELETE FROM pg_sessions WHERE hash = ?").bind(u.sessionHash).run();
    return withoutSession(json({ ok: true }), request, env);
  },
};
