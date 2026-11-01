// InFlite Today's Markets card: what you own is worth, and its change today as Markets says it (functions/_markets.js
// wrapFigures: only what traded today, by each exchange's own day; a market shut today named), the next dividend as
// Markets expects it (never a promised date), and what's left of this tax year's ISA allowance. From Markets' own kept
// prices (functions/_markets.js quotes), with what's late given as kept. For the morning's notification (purpose
// "morning"), only what its line says (functions/_todaymorning.js morningLines: the value, the day's change, and a
// market shut): no dividend, ISA or day's line, so a tick's accounts cost the database no more than they need

import { holdings, quotes, rates, isaOf, dividends, yearOf, wrapFigures, dayIn, nextDividend, marketState, shutToday, INDICES } from "./_markets.js";
import { Quiet } from "./_todaycards.js";

// the prices by this long after the card's begun, and the rates a second after (what's late given as kept: quoteBy),
// inside the card's 7 seconds
const QUOTES_BY = 3500, RATES_BY = 4500;
// (the indices whose hours say whether a market's open: functions/_markets.js marketState, all the morning asks for)
const OPEN_BY = ["^FTSE", "^GSPC"];
// (an index, crypto or a currency pays no dividends: their history's never asked for, as yearOf has it)
const PAYS_NONE = /^\^|=X$|-(USD|GBP|EUR)$/;
// at most this many points in the day's line (markets/app.js daySeries, every holding's at each moment)
const SPARK_MAX = 48;
const pence = (v) => Math.round(v * 100) / 100;

// A holding's dividends, as far back as they go, from what Markets has kept (never asked for here: the card can't wait);
// where nothing's kept, its year's, and the whole asked for after the answer's gone, so the next look has it
async function keptDivs(env, symbol) {
  const d = await dividends(env, symbol, { kept: true }).catch(() => null);
  if (Array.isArray(d)) return d;
  const y = await yearOf(env, symbol, { kept: true }).catch(() => null);
  env.waitUntil?.(dividends(env, symbol).catch(() => {}));
  return Array.isArray(y?.divs) ? y.divs : [];
}

// ctx: functions/_todaycards.js cardsFor's
export async function marketsCard(env, u, ctx) {
  const t0 = Date.now(), { t, links } = ctx, href = `${links.finance}/`, at = (s) => `${links.finance}/#s=${encodeURIComponent(s)}`;
  const list = await holdings(env, u.id);
  if (!list.length) return { state: "empty", href, said: "Add what you own in Markets, and Today shows how it’s doing.", action: { label: "Open Markets", href } };
  const mine = list.filter((h) => h.qty > 0), morning = ctx.purpose === "morning";
  // (the database's part begun at once, alongside the prices; none of it for the morning, whose line has neither)
  const isaP = morning ? null : isaOf(env, u.id, t).catch(() => null);
  const divsP = morning ? null : new Map(mine.map((h) => [h.symbol, PAYS_NONE.test(h.symbol) ? Promise.resolve([]) : keptDivs(env, h.symbol)]));
  const q = await quotes(env, [...(morning ? OPEN_BY : INDICES), ...mine.map((h) => h.symbol)], t0 + QUOTES_BY);
  const fx = await rates(env, Object.values(q).map((x) => x.cur), t0 + RATES_BY);
  const held = mine.map((h) => ({ ...h, x: q[h.symbol] })).filter((r) => r.x?.price != null && r.x.prev && fx[r.x.cur] != null);
  // (nothing you own has a price, fresh or kept: the prices couldn't be had)
  if (mine.length && !held.length) throw new Quiet("No prices.");

  // Markets' own logic for the day: only what traded today counts (wrapFigures)
  const F = wrapFigures(held, fx, t);
  const traded = held.some((r) => r.x.kind === "crypto" || (!!r.x.time && dayIn(r.x.tz, r.x.time * 1000) === dayIn(r.x.tz, t)));
  const one = (r) => r && { name: r.name, symbol: r.symbol, change: pence(F.day(r)), href: at(r.symbol) };
  const change = traded ? pence(F.total) : 0, pct = traded ? Math.round(F.pct * 100) / 100 : 0;

  // the ISA's tax year (markets/app.js isaYear, tracksIsa): shown once something's paid in, or something's held in it
  const isa0 = morning ? null : await isaP;
  let isa = null;
  if (isa0 && (isa0.paid > 0 || list.some((h) => h.account === "isa"))) {
    const [y, m, d] = dayIn("Europe/London", t).split("-").map(Number), endY = m > 4 || (m === 4 && d >= 6) ? y + 1 : y;
    const days = Math.round((Date.UTC(endY, 3, 5) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
    isa = { year: isa0.year, paid: isa0.paid, allowance: isa0.allowance, left: Math.max(0, isa0.allowance - isa0.paid), used: Math.min(1, isa0.paid / isa0.allowance), days,
      inIsa: pence(held.filter((r) => r.account === "isa").reduce((a, r) => a + r.x.price * r.qty * fx[r.x.cur], 0)) };
  }

  // the next dividend, as Markets expects it: a year on from each of a year's (an estimate, never a promised date)
  const items = morning ? [] : await Promise.all(held.map(async (r) => ({ symbol: r.symbol, name: r.name, qty: r.qty, rate: fx[r.x.cur], divs: (await divsP.get(r.symbol)) || [] })));
  const nd = items.length ? nextDividend(items, t) : null;
  const dividend = nd ? { name: nd.name, symbol: nd.symbol, at: nd.at < 1e11 ? nd.at * 1000 : nd.at, value: pence(nd.value), href: at(nd.symbol) } : null;

  return {
    state: "ok",
    href,
    owned: mine.length,
    following: list.length - mine.length,
    value: pence(F.value),
    change,
    pct,
    traded,
    market: { ...marketState(q, t), shut: shutToday(held, t) },
    top: traded && F.top && F.day(F.top) > 0 ? one(F.top) : null,
    low: traded && F.low && F.day(F.low) < 0 ? one(F.low) : null,
    spark: traded && !morning ? daySeries(held, fx, F.value) : null,
    dividend,
    isa,
    leftOut: mine.filter((h) => !held.some((r) => r.symbol === h.symbol)).map((h) => h.name),
    stale: held.some((r) => !!r.x.stale),
    share: !traded ? null : Math.abs(change) < 1 || Math.abs(pct).toFixed(1) === "0.0" ? "My portfolio’s little changed today." : `My portfolio is ${change > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% today.`,
  };
}

// Your money through the day: each holding at its price at each moment, its last close before it opened (markets/app.js
// daySeries, over what's priced), the last its value now; at most SPARK_MAX points. → { vals, base } or null
function daySeries(held, fx, value) {
  const drawn = held.filter((r) => r.x.sparkT?.length > 1);
  if (!drawn.length) return null;
  const T = [...new Set(drawn.flatMap((r) => r.x.sparkT))].sort((a, b) => a - b);
  if (T.length < 2) return null;
  const base = held.reduce((a, r) => a + r.x.prev * r.qty * fx[r.x.cur], 0);
  const vals = T.map((tt) => held.reduce((a, r) => {
    let p = r.x.prev, j = -1;
    for (let i = 0; i < (r.x.sparkT?.length || 0) && r.x.sparkT[i] <= tt; i++) j = i;
    if (j >= 0) p = r.x.spark[j];
    return a + p * r.qty * fx[r.x.cur];
  }, 0));
  vals[vals.length - 1] = value;
  const step = Math.max(1, Math.ceil((vals.length - 1) / (SPARK_MAX - 1)));
  return { vals: vals.filter((_, i) => i % step === 0 || i === vals.length - 1).map(pence), base: pence(base) };
}
