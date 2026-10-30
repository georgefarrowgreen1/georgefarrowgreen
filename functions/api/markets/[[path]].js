// Markets's own API, at finance.inflite.ai only, and only signed in with the site's account (the site's cookie, from
// Markets's own pages: functions/_markets.js has what's kept and where the prices come from).
//   GET    /api/markets/me            who's signed in, what you own and follow, their prices, the markets', and the day's rates
//   GET    /api/markets/quotes?s=A,B  prices again (as the app keeps them fresh, each a minute old at most)
//   GET    /api/markets/chart?s=A&r=1d|5d|1mo|1y|5y   a chart over a range
//   GET    /api/markets/years?s=A,B   each one's year: its week, its dividends, its high and low (for what's worth knowing)
//   GET    /api/markets/news?s=A,B    the news about them, newest first
//   GET    /api/markets/search?q=     things to add, by name or symbol
//   PUT    /api/markets/holding       added or changed: { symbol, name?, qty?, cost?, account? } → your list
//   DELETE /api/markets/holding?s=A   taken off your list → your list
//   PUT    /api/markets/order         your list in a new order: { symbols } → your list
//   PUT    /api/markets/alert         an alert on or off: { symbol, on, pct? } → your list
//   PUT    /api/markets/isa           what you've paid into your ISA this tax year: { paid } → { isa }
//   PUT    /api/markets/wrap          the evening wrap on or off: { on } → { wrap }
//   GET    /api/markets/buys?s=A      a holding's buys and sales, and what they come to (how many, the average cost)
//   POST   /api/markets/buy           one more: { symbol, qty, price?, at, sold? } → them, and your list
//   DELETE /api/markets/buy?id=       one taken off → them, and your list
//   GET    /api/markets/push-key      the key push subscriptions are made with
//   POST   /api/markets/push          alerts on this phone: { sub }
//   POST   /api/markets/push-move     the browser renewed its subscription: { was, sub } (markets/sw.js)
//   DELETE /api/markets/push          and off again: { endpoint }
//   POST   /api/markets/tick          the site's scheduler's turn (workers/ticker), with its secret: the alerts that are due,
//                                     and the evening wraps
//   POST   /api/markets/handback      signed in on the account's page, for Markets: its code swapped for the sign-in
//   POST   /api/markets/account-link  the account's page, opened signed in as you
//   POST   /api/markets/signout       and the profile (your photo, name and handle), as on every page of the site
import { HttpError, db, hex, sha256, limit, randomToken, issueSession, logError } from "../../_pigeon.js";
import { cookieUser, sameOrigin, withCookie, withSession } from "../../_account.js";
import { takeHandback } from "../../_handback.js";
import { accountRoutes, json, body, signedIn } from "../../_accountapi.js";
import { isMarkets } from "../../_mktapp.js";
import { tickAuthOk, vapid } from "../../_notify.js";
import { holdings, putHolding, dropHolding, orderHoldings, setAlert, quotes, chart, yearOf, news, search, rates, INDICES, RANGE_NAMES, cleanSymbol, addPhone, dropPhone, movePhone, alertTick, wrapTick, alertsOf, mkdb, isaOf, setIsa, setWrap, buysOf, addBuy, dropBuy, paidOf } from "../../_markets.js";

// The account as Markets shows it: who, what you own and follow, and every price it needs to draw your day
async function view(env, u) {
  const list = await holdings(env, u.id);
  const q = await quotes(env, [...INDICES, ...list.map((h) => h.symbol)]);
  const fx = await rates(env, Object.values(q).map((x) => x.cur));
  const D = await mkdb(env), phone = await D.prepare("SELECT 1 FROM mk_off WHERE user_id = ?").bind(u.id).first(), wrap = await D.prepare("SELECT off FROM mk_wrap WHERE user_id = ?").bind(u.id).first();
  return { signedIn: true, id: u.id, name: u.name, handle: u.handle, photoAt: u.avatar_at || null, holdings: list, quotes: q, rates: fx, indices: INDICES, alertsOff: !!phone, wrap: !wrap?.off, isa: await isaOf(env, u.id), at: Date.now(),
    appearance: ["light", "dark"].includes(u.appearance) ? u.appearance : "auto" };
}
// a few symbols from the address (s=A,B,C)
const symbolsOf = (request, max = 70) => {
  const s = new URL(request.url).searchParams.get("s") || "";
  const list = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (!list.length || list.length > max) throw new HttpError(400, "Bad request.");
  return list.map(cleanSymbol);
};
// (the markets' answers: kept by the browser a little, as they're the same for everyone a minute at a time)
const shared = (o, secs) => { const r = json(o); r.headers.set("Cache-Control", `private, max-age=${secs}`); return r; };

const ROUTES = {
  "GET me": async ({ request, env }) => {
    const u = await cookieUser(request, env);
    if (!u) return json({ signedIn: false });
    return withCookie(json(await view(env, u)), request, env, u.token);
  },
  "GET quotes": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await limit(env, `mkquotes:${u.id}`, 600, 3600e3);
    const q = await quotes(env, symbolsOf(request, 64));
    return shared({ quotes: q, rates: await rates(env, Object.values(q).map((x) => x.cur)), at: Date.now() }, 20);
  },
  "GET chart": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await limit(env, `mkchart:${u.id}`, 600, 3600e3);
    const p = new URL(request.url).searchParams, [s] = symbolsOf(request, 1), r = p.get("r") || "1d";
    if (!RANGE_NAMES.includes(r)) throw new HttpError(400, "Bad request.");
    const c = await chart(env, s, r);
    if (!c) throw new HttpError(404, "Couldn’t find that one.");
    return shared({ symbol: s, range: r, t: c.t, c: c.c, base: c.base, prev: c.prev, price: c.price, cur: c.cur, tz: c.tz, divs: c.divs }, r === "1d" ? 30 : 300);
  },
  "GET years": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await limit(env, `mkyears:${u.id}`, 120, 3600e3);
    const list = symbolsOf(request, 64), out = {};
    for (let i = 0; i < list.length; i += 6) (await Promise.all(list.slice(i, i + 6).map((s) => yearOf(env, s)))).forEach((y, j) => { if (y) out[list[i + j]] = y; });
    return shared({ years: out }, 600);
  },
  "GET news": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await limit(env, `mknews:${u.id}`, 240, 3600e3);
    return shared({ news: await news(env, symbolsOf(request, 12)) }, 120);
  },
  "GET search": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await limit(env, `mksearch:${u.id}`, 300, 3600e3);
    return shared({ results: await search(env, new URL(request.url).searchParams.get("q")) }, 600);
  },
  "PUT holding": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await limit(env, `mkput:${u.id}`, 600, 3600e3);
    return json({ holdings: await putHolding(env, u.id, await body(request)) });
  },
  "DELETE holding": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), [s] = symbolsOf(request, 1);
    return json({ holdings: await dropHolding(env, u.id, s) });
  },
  "PUT order": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    return json({ holdings: await orderHoldings(env, u.id, (await body(request)).symbols) });
  },
  "GET buys": async ({ request, env }) => {
    const u = await signedIn(request, env), [s] = symbolsOf(request, 1);
    return json(await buysOf(env, u.id, s));
  },
  // what each holding's paid you since you bought it (its dividends)
  "GET paid": async ({ request, env }) => {
    const u = await signedIn(request, env);
    await limit(env, `mkpaid:${u.id}`, 120, 3600e3);
    return json({ paid: await paidOf(env, u.id) });
  },
  "POST buy": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await limit(env, `mkbuy:${u.id}`, 300, 3600e3);
    const b = await addBuy(env, u.id, await body(request));
    return json({ ...b, holdings: await holdings(env, u.id) });
  },
  "DELETE buy": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await dropBuy(env, u.id, new URL(request.url).searchParams.get("id"));
    return json({ ...b, holdings: await holdings(env, u.id) });
  },
  "PUT wrap": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    return json(await setWrap(env, u.id, !!(await body(request)).on));
  },
  "PUT isa": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    return json({ isa: await setIsa(env, u.id, (await body(request)).paid) });
  },
  "PUT alert": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), b = await body(request);
    return json({ holdings: await setAlert(env, u.id, b.symbol, !!b.on, b.pct ?? 3) });
  },
  "GET push-key": async ({ env }) => json({ key: (await vapid(env)).pub }),
  "POST push": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await limit(env, `mkpush:${u.id}`, 60, 3600e3);
    return json(await addPhone(env, u, (await body(request)).sub));
  },
  "POST push-move": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    return json(await movePhone(env, u, await body(request)));
  },
  "DELETE push": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env);
    await dropPhone(env, u.id, (await body(request)).endpoint);
    return json({ on: false });
  },
  "GET alerts": async ({ request, env }) => json(await alertsOf(env, (await signedIn(request, env)).id)),
  "POST tick": async ({ request, env }) => {
    tickAuthOk(request, env);
    const a = await alertTick(env), w = await wrapTick(env).catch((e) => ({ wraps: 0, error: String(e?.message || e) }));
    return json({ ...a, ...w });
  },
  // Signed in on the account's page, for Markets (functions/_handback.js): as Fitness's
  "POST handback": async ({ request, env }) => {
    sameOrigin(request);
    const { row, u, authAt } = await takeHandback(env, request, "markets", await body(request));
    const c = await cookieUser(request, env).catch(() => null);
    if (c && c.sessionHash === row.session) return withCookie(json(await view(env, c)), request, env, c.token);
    const token = await issueSession(env, u.id, request, authAt);
    return withSession(json(await view(env, u)), request, env, hex(await sha256(token)), true);
  },
  "POST account-link": async ({ request, env }) => {
    sameOrigin(request);
    const u = await signedIn(request, env), D = await db(env), t = Date.now();
    await limit(env, "handoff:" + u.id, 30, 15 * 60e3);
    const code = randomToken(24);
    await D.batch([D.prepare("DELETE FROM pg_handoff WHERE expires < ?").bind(t),
      D.prepare("INSERT INTO pg_handoff (hash, user_id, session, expires) VALUES (?, ?, ?, ?)").bind(hex(await sha256(code)), u.id, u.sessionHash, t + 60e3)]);
    return json({ code });
  },
  ...accountRoutes(view, { signIn: false }),
};

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url), parts = [].concat(ctx.params.path || []);
  const route = ROUTES[`${ctx.request.method} ${parts.join("/")}`];
  // (only at Markets's own address; the scheduler's turn at the site's own, as the other apps' are)
  const tick = parts[0] === "tick" && url.hostname === "georgefarrowgreen.pages.dev";
  if (!route || !(isMarkets(url, ctx.env) || tick)) return json({ error: "Not found." }, 404);
  try { return await route(ctx); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
    await logError(ctx.env, "markets api", e);
    return json({ error: "Something went wrong. Try again in a moment." }, 500);
  }
}
