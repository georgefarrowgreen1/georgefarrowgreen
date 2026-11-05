// Mail's card on Today (One roof stage 4, S4-D10, spec §2.5, §6.3): numbers only, asked of Mail's own Worker
// (email.inflite.ai, the inflite repo's email/) with the key the two share, for the site's admin alone. Never a word of
// anyone's mail: how many conversations from people are unread, how many in Updates, and how many are in Later with
// when the next comes back. Off the critical path: 700 ms at most, and anything but a 200 with those numbers is no card
// at all (Mail before 1.49 answers 401: never a stale or an error card).
//   mailCard(env, u, request?) → null, or { state: "ok", href, people, updates, later: { n, next, href } }
//     env.MAIL_KEY: the key (the Pages secret, the same as Mail's Worker's MAIL_KEY); none, no card and nothing asked
//     env.MAIL_VIA: where Mail's Worker is reached, in place of its address (the tests' stand-in)
//     href: Mail's own address (the hub's /mail/ at inflite.ai: IFL.hub.go), and Later's, #later
import { appOrigin, siteFetch } from "./_sites.js";

// (Chat's API, for who the site's admin is: asked for when first needed, not imported here, as Chat's API imports Chat's
// "Send to a friend", which imports Today's cards, which import this: a static import would have it run too early)
const pigeon = () => import("./api/pigeon/[[path]].js");

export const MAIL_CARD_MS = 700;
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
// (a count: a whole number, none below 0, and no more than any inbox has)
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 1e7 ? v : null);
// (a time: ms since 1970, after 2020 and before 2100; or none)
const when = (v) => (v == null ? null : Number.isFinite(v) && v > 1.5e12 && v < 4.1e12 ? v : undefined);

// (where Mail's Worker is asked: its stand-in where the tests set one, else its address)
function mailAt(env, request) {
  const via = typeof env?.MAIL_VIA === "string" && ORIGIN.test(env.MAIL_VIA.replace(/\/+$/, "")) ? env.MAIL_VIA.replace(/\/+$/, "") : null;
  return via || appOrigin("email", env, request);
}

// Mail's answer, { people, updates, later: { n, next } }, as numbers this card can say, or null
export function cardOf(a, own) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const people = count(a.people), updates = count(a.updates), l = a.later;
  if (people == null || updates == null || !l || typeof l !== "object" || Array.isArray(l)) return null;
  const n = count(l.n), next = when(l.next);
  if (n == null || next === undefined) return null;
  return { state: "ok", href: `${own}/`, people, updates, later: { n, next: n ? next : null, href: `${own}/#later` } };
}

// (the whole of it on one clock, from the moment it's asked: who the admin is, then Mail; past MAIL_CARD_MS, no card,
// however slow the database or Mail)
export async function mailCard(env, u, request = null) {
  const key = typeof env?.MAIL_KEY === "string" ? env.MAIL_KEY : "";
  if (!key || !u?.id) return null;
  const until = Date.now() + MAIL_CARD_MS, ac = new AbortController();
  const ask = (async () => {
    const admin = await pigeon().then((m) => m.adminOf(env)).catch(() => null);
    if (!admin || admin.id !== u.id || ac.signal.aborted) return null;
    const own = appOrigin("email", env, request);
    const res = await siteFetch(env, `${mailAt(env, request)}/api/connector/card`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, redirect: "manual",
      signal: AbortSignal.any([ac.signal, AbortSignal.timeout(Math.max(1, until - Date.now()))]),
    });
    if (res.status !== 200 || !/^application\/json\b/i.test(res.headers.get("Content-Type") || "")) { res.body?.cancel?.().catch?.(() => {}); return null; }
    return cardOf(await res.json(), own);
  })();
  // (however it goes, never longer than its time: then what's still asked is called off)
  let timer;
  const late = new Promise((done) => { timer = setTimeout(() => { ac.abort(); done(null); }, Math.max(0, until - Date.now())); });
  try { return await Promise.race([ask.catch(() => null), late]); } finally { clearTimeout(timer); }
}
