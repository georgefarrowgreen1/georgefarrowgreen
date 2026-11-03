// InFlite Today's Markets card: what you own is worth, and its change today as Markets says it (functions/_markets.js
// wrapFigures: only what traded today, by each exchange's own day; a market shut today named), the next dividend as
// Markets expects it (never a promised date), and what's left of this tax year's ISA allowance. From Markets' own kept
// prices (functions/_markets.js quotes), with what's late given as kept. For the morning's notification (purpose
// "morning"), only what its line says (functions/_todaymorning.js morningLines: the value, the day's change, and a
// market shut): no dividend, ISA or day's line, so a tick's accounts cost the database no more than they need

import { holdings, quotes, rates, isaOf, dividends, yearOf, wrapFigures, dayIn, nextDividend, marketState, shutToday, INDICES } from "./_markets.js";
import { Quiet, withSend, withForDay } from "./_todaycards.js";
import { packCard } from "../pigeon/cards.js";

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
// (Today First's: the markets whose hours say when the day's prices are in, each with the zone its holdings trade in;
// at most this many holdings on the card, each with its percent and its card)
const HOURS_OF = [["London", "^FTSE", "Europe/London"], ["New York", "^GSPC", "America/New_York"]];
const HOLDINGS_MAX = 20;

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
  const v2 = ctx.v === 2 && !morning;
  const one = (r) => r && (v2 ? { name: r.name, symbol: r.symbol, change: pence(F.day(r)), pct: pctOf(r, t), href: at(r.symbol) } : { name: r.name, symbol: r.symbol, change: pence(F.day(r)), href: at(r.symbol) });
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

  // (Today First's day, asked for with v=2: when the market you hold closes, each holding's percent and its card, and,
  // held apart for the day's cards, each market's hours and the holdings past their alerts)
  const shut = shutToday(held, t), hours = v2 ? hoursOf(q, held, t, shut) : [];
  const rows = v2 ? held.map((r) => ({ sym: r.symbol, name: r.name, pct: pctOf(r, t), alert: Number.isFinite(r.alert) ? r.alert : null, day: dayIn(r.x.tz || "Europe/London", t), where: whereOf(r) })) : [];
  const card = withSend({
    state: "ok",
    href,
    owned: mine.length,
    following: list.length - mine.length,
    value: pence(F.value),
    change,
    pct,
    traded,
    market: { ...marketState(q, t), shut, ...(v2 ? { closesAt: hours[0]?.close ?? null } : {}) },
    top: traded && F.top && F.day(F.top) > 0 ? one(F.top) : null,
    low: traded && F.low && F.day(F.low) < 0 ? one(F.low) : null,
    spark: traded && !morning ? daySeries(held, fx, F.value) : null,
    dividend,
    isa,
    leftOut: mine.filter((h) => !held.some((r) => r.symbol === h.symbol)).map((h) => h.name),
    stale: held.some((r) => !!r.x.stale),
    ...(v2 ? { holdings: holdingsOf(rows, t) } : {}),
    share: !traded ? null : Math.abs(change) < 1 || Math.abs(pct).toFixed(1) === "0.0" ? "My portfolio’s little changed today." : `My portfolio is ${change > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% today.`,
  // (the card for Chat, pigeon/cards.js: the whole portfolio's percent and nothing more, no holding named, no amount)
  }, traded ? { v: 1, kind: "markets", from: "today", at: t, say: Math.abs(pct).toFixed(1) === "0.0" ? "My portfolio’s little changed today." : `My portfolio is ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% today.`,
    snap: { name: "Portfolio", sym: null, pct, day: dayIn("Europe/London", t) } } : null);
  return v2 ? withForDay(card, { hours, held: rows.map(({ alert, ...r }) => r), alerts: alertsPast(rows) }) : card;
}

// ---- Today First's (spec §7.3, §7.4, §7.6): percents only, never an amount ----
// a holding's change today, in percent (2 places): only what traded today, by its own market's day, as wrapFigures has it
const tradedToday = (r, t) => r.x.kind === "crypto" || (!!r.x.time && dayIn(r.x.tz, r.x.time * 1000) === dayIn(r.x.tz, t));
const pctOf = (r, t) => (tradedToday(r, t) && r.x.prev ? Math.round(((r.x.price - r.x.prev) / r.x.prev) * 10000) / 100 : 0);
const whereOf = (r) => HOURS_OF.find(([, , tz]) => tz === r.x.tz)?.[0] || null;
// The hours today of each market you hold (London's, New York's), from its index's trading period, where it trades
// today and isn't shut: [{ where, open, close }] (ms), London first
function hoursOf(q, held, t, shut) {
  return HOURS_OF.filter(([where, , tz]) => held.some((r) => r.x.tz === tz) && !shut.includes(where)).map(([where, sym, tz]) => {
    const o = q?.[sym]?.open;
    return o && Number.isFinite(o.start) && Number.isFinite(o.end) && dayIn(tz, o.start * 1000) === dayIn(tz, t) ? { where, open: o.start * 1000, close: o.end * 1000 } : null;
  }).filter(Boolean);
}
const signed = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
// A stock's card for Chat (pigeon/cards.js): its name, symbol and percent today, and nothing more (no amount, no
// holding's size). finished: said once its market's closed. → the card, unpacked
export function stockSend({ sym, name, pct, day }, t, { finished = false } = {}) {
  const p = Number.isFinite(pct) ? pct : 0, nm = String(name || sym || "").slice(0, 60);
  const say = finished ? `${nm} finished ${p > 0 ? "up " : p < 0 ? "down " : ""}${p ? `${Math.abs(p).toFixed(1)}%` : "level"} today.` : `${nm} ${signed(p)} today.`;
  return { v: 1, kind: "markets", from: "today", at: t, say: say.slice(0, 200), snap: { name: nm, sym, pct: p, day }, ref: { sym } };
}
// Each holding with its percent today and its card, packed for the page: [{ sym, name, pct, sendCard }] (rows: { sym,
// name, pct, day })
export function holdingsOf(rows, t) {
  return (rows || []).slice(0, HOLDINGS_MAX).map((r) => ({ sym: r.sym, name: r.name, pct: r.pct, sendCard: packCard(stockSend(r, t)) }));
}
// The holdings past their alert today (Markets' own rule: a move of at least the alert's percent, either way), computed
// here because mk_alerts.fired is set only for accounts with a Markets phone; the biggest move first.
// rows: [{ sym, name, pct, alert }] → [{ sym, name, pct, alert }]
export function alertsPast(rows) {
  return (rows || []).filter((r) => Number.isFinite(r.alert) && r.alert > 0 && Number.isFinite(r.pct) && Math.abs(r.pct) >= r.alert)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).map((r) => ({ sym: r.sym, name: r.name, pct: r.pct, alert: r.alert }));
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
