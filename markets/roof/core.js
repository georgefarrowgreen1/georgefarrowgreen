import { priceStream } from "../live.js";
import { quoteSession } from "../session.js";
// Markets' state and its sums under InFlite's roof (One roof stage 2, spec §4.1, §4.2, S2-D2, D4, D6, D9, D21): a port of
// markets/app.js's under its own names (roofmkcore.test compares the same-named functions with app.js's on the same
// data). No DOM here at all: views draw from S, and hear of changes through on(evt). The hub's branch of app.js
// throughout: InFlite owns sign-in, notifications, the theme and You, so nothing here subscribes, signs in or out, or
// sets a theme.
//
// S (one object for the page's life, mutated in place; start(fw) rebuilds every account field and stop() drops them):
//   me (the account: id, name, handle, photoAt) · list (your holdings and those you follow, in your order) · q (quotes by
//   symbol) · fx (rates to pounds) · years (each one's year: hi/lo, dividends) · news · charts (Map, kept ten minutes) ·
//   alertsOff · isa · wrap · vs · paid · prange · mix · fig · inc · imode · goal · add · reinvest · buyAmt · newsTopics ·
//   nfilter · newsSince (app.js's S without tab and pushOn); and, as app.js adds them, yearsAt newsAt newsErr pricesAt;
//   loading (your list on its way) and err ({ words, offline }: why it couldn't come, while there's no list to show).
// Events (frozen): on(evt, fn) → off; emit(evt, detail):
//   "me" the account or the whole copy changed · "quotes" prices came in (detail { was: the quotes before }) ·
//   "news" the stories changed · "list" what you hold or follow changed (app.js's render()) · "settings" a choice on
//   this phone changed (the Income plan, a mix) · "loading" (detail boolean) · "error" (detail words or null).
// Lifecycle: start(fw) · stop() · retry() (your list asked for again, after it couldn't come) · shown(on) (polling only
//   between shown(true) and shown(false), and only while the page is visible, S2-D4) · at(section) (which section shows,
//   for News' count) · busy() (S2-D21: !calm()) · flush() → { lost: 1 } while a reorder couldn't be kept · mine(gen):
//   a write's answer is still this account's (gen = P.gen as it was asked: genNow()).
// Kept copy (S2-D9): markets:last = { id, at, me, holdings, quotes, rates, isa }, drawn only when its id is
//   fw.session.user.id. Storage keys are app.js's markets:* (no new key); nothing under today:*.
// Amounts never leave the screen (S2-D6): stockSend/portfolioSend give name, sym, pct and day only, and nothing here
// logs a figure.
import * as A from "../account.js";
import { marked as markDivs, health, taxYearOf, yearDivs, yearOn } from "../income.js";
import { stockSendCard, chatHash } from "../send.js";

export const EVENTS = Object.freeze(["me", "quotes", "news", "list", "settings", "loading", "error"]);
export const S = { me: null, list: [], q: {}, fx: { GBP: 1 }, years: {}, news: null, charts: new Map(), alertsOff: false, isa: null, wrap: true, vs: null, paid: null, prange: "1d", mix: "holding", fig: "day",
  inc: null, imode: "coming", goal: 100, add: 0, reinvest: true, buyAmt: 1000, newsTopics: {}, nfilter: "all", newsSince: null };
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem("markets:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("markets:" + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem("markets:" + k); } catch (_) {} },
};
const subs = new Map(EVENTS.map((e) => [e, new Set()]));
export function on(evt, fn) { const s = subs.get(evt); if (!s) throw new Error(`no event ${evt}`); s.add(fn); return () => s.delete(fn); }
export function emit(evt, detail) { for (const fn of [...(subs.get(evt) || [])]) { try { fn(detail); } catch (e) { console.error(e); } } }

// (what isn't for the views: the page's fw, timers, whether Markets shows and which section, the sheet and a reorder)
const P = { fw: null, on: false, sec: "today", timer: 0, away: 0, offs: [], sheet: false, ordering: 0, orderQ: null, orderLost: false, gen: 0, stock: null };
export const fwOf = () => P.fw;
// which section shows (markets.js, on each show): News' count is none while News itself shows
export function at(sec) { P.sec = sec; }
export const section = () => P.sec;
// a Markets sheet up (mkui.js), a reorder waiting to be kept (holdings.js): the page isn't drawn again behind, and the
// framework's reload waits (busy)
export function sheetIs(v) { P.sheet = !!v; }
export function ordering(n, q) { P.ordering = Math.max(0, P.ordering + n); if (q) P.orderQ = q; }
// reorders still on their way (Change Order stays on while one is: holdings.js)
export const orderingNow = () => P.ordering;
// a reorder that couldn't be kept (true), or one kept since (false): what flush() answers until the next one's kept
export function orderLost(v) { P.orderLost = !!v; }
// what isn't kept yet waited for (a reorder on its way): → { lost } (instance.flush, s24 contracts §4): 1 while the
// last reorder couldn't be kept with your account, so sign-out asks first
export async function flush() { try { await P.orderQ; } catch (_) {} return { lost: P.orderLost ? 1 : 0 }; }
// the account a write was asked for: genNow() as it's asked, mine(that) as its answer comes (false: stopped or another
// account since, so the answer's dropped)
export const genNow = () => P.gen;
export const mine = (g) => g === P.gen && !!P.fw;
// charts kept (S2-D22): each set drops what's older than ten minutes; a stock's own leave with its sheet (stockOpen)
const CHART_KEEP = 600e3;
export function chartSet(k, c) {
  const now = Date.now();
  for (const [key, v] of S.charts) if (now - v.at >= CHART_KEEP) S.charts.delete(key);
  S.charts.set(k, { at: now, c });
}
// the stock whose sheet is open (null: none): the last one's charts let go, but those your portfolio's ranges use
export function stockOpen(sym) {
  const was = P.stock;
  P.stock = sym || null;
  stream.sync();
  if (!was || was === P.stock) return;
  const held = owned().some((x) => x.symbol === was);
  for (const key of [...S.charts.keys()]) if (key.startsWith(was + ":") && !(held && /:(5d|1mo|1y)$/.test(key))) S.charts.delete(key);
}

// ---- markets, numbers and your money (app.js 794-1134, as they are; insights' pictures and taps named, not drawn) ----
const INDICES = ["^FTSE", "^GSPC", "BTC-USD"];
const INDEX_NAMES = { "^FTSE": "FTSE 100", "^GSPC": "S&P 500", "BTC-USD": "Bitcoin", "^IXIC": "Nasdaq" };
// each exchange's market, to say how a holding did against it (the two the app has prices for anyway)
const MARKET_OF = { London: "^FTSE", Nasdaq: "^GSPC", NYSE: "^GSPC", "NYSE American": "^GSPC", "NYSE Arca": "^GSPC" };
// what your year's set against: London's market, the world's shares and America's, each followed through a fund that
// tracks it (iShares' FTSE 100, Vanguard's All-World, SPDR's S&P 500), so its dividends count as yours do
const BENCHES = [["ISF.L", "FTSE 100"], ["VWRL.L", "the world"], ["SPY", "S&P 500"]];
// the accounts a holding can be held in; and an ISA's allowance, for each tax year (6 April to 5 April)
const ACCOUNTS = [["isa", "ISA"], ["sipp", "Pension"], ["gia", "General"]];
const ACCOUNT_NAME = Object.fromEntries(ACCOUNTS);
// your portfolio, seen over the day, or (as if you'd held what you own now) a week, a month or a year
const PRANGES = [["1d", "1D", "today"], ["5d", "1W", "this week"], ["1mo", "1M", "this month"], ["1y", "1Y", "this year"]];
const RANGES = [["1d", "1D", "today"], ["5d", "1W", "this week"], ["1mo", "1M", "this month"], ["1y", "1Y", "this year"], ["5y", "5Y", "in 5 years"]];

// ---- saying numbers ----
const SYM = { GBP: "£", USD: "$", EUR: "€", JPY: "¥", INR: "₹" };
const fmt = (n, d = 2) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v, cur = "GBP", d = 2) => (v < 0 ? "−" : "") + (SYM[cur] ?? "") + fmt(Math.abs(v), d) + (SYM[cur] || !cur ? "" : " " + cur);
const signed = (v, cur = "GBP", d = 2) => (v >= 0 ? "+" : "−") + (SYM[cur] ?? "") + fmt(Math.abs(v), d) + (SYM[cur] || !cur ? "" : " " + cur);
const pct = (v, d = 2) => (v == null ? "–" : (v >= 0 ? "+" : "−") + fmt(Math.abs(v), d) + "%");
const tone = (v) => (v == null || Math.abs(v) < 0.005 ? "flat-t" : v >= 0 ? "up-t" : "down-t");
const isIndex = (q) => q?.type === "INDEX";
// what kind of thing it is (functions/_markets.js kindOf), and said
const kindOf = (q) => q?.kind || (q?.type === "ETF" || q?.type === "MUTUALFUND" ? "fund" : q?.type === "INDEX" ? "index" : q?.type === "CRYPTOCURRENCY" ? "crypto" : "share");
const KIND_SAID = { share: "Share", trust: "Investment trust", fund: "Fund", index: "Index", crypto: "Crypto", currency: "Currency" };
const KINDS_SAID = { share: "Shares", trust: "Investment trusts", fund: "Funds", crypto: "Crypto" };
// a few well-known investment trusts, to start from
const TRUST_PICKS = [["SMT.L", "Scottish Mortgage"], ["FCIT.L", "F&C"], ["CTY.L", "City of London"], ["ALW.L", "Alliance Witan"], ["PCT.L", "Polar Capital Technology"], ["MNKS.L", "Monks"], ["RCP.L", "RIT Capital Partners"], ["MYI.L", "Murray International"]];
const digits = (v) => (v >= 10000 ? 0 : v >= 1000 ? 1 : v < 1 ? 4 : 2);
// (London's under a pound, in pence, as it's quoted there)
const priceSaid = (q, v = q?.price) => (v == null ? "–" : isIndex(q) ? fmt(v, v >= 1000 ? 1 : 2) : q.cur === "GBP" && Math.abs(v) < 1 ? `${fmt(v * 100, 2)}p` : money(v, q.cur, q.type === "CRYPTOCURRENCY" && v >= 1000 ? 0 : digits(v) === 1 ? 2 : digits(v)));
// (and its day's change likewise: in pence beside a price in pence)
const chgSaid = (q, v = q.chg) => (q.cur === "GBP" && !isIndex(q) && Math.abs(q.price) < 1 ? `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v) * 100, 2)}p` : signed(v, q.cur, q.price < 1 ? 4 : 2));
// A price typed in, in its own currency: London's in pounds, or in pence as its prices are quoted and contract notes
// give them ("52p"). → the number (in pounds), null where nothing's typed, NaN where it isn't one
function priceIn(s, q) {
  const t = s.replace(/[,£$€\s]/g, "");
  if (t === "") return null;
  return q?.cur === "GBP" && /^[\d.]+p$/i.test(t) ? Number(t.slice(0, -1)) / 100 : Number(t);
}
// (pence typed as pounds, by the look of it: twenty times or more today's price, and in reason as pence) → what it may
// have meant, said ("52p"), to ask; else null
function penceMeant(c, q, typed) {
  if (q?.cur !== "GBP" || !q.price || c == null || !Number.isFinite(c) || /p\s*$/i.test(typed) || c < q.price * 20 || c / 100 > q.price * 5) return null;
  return `${+c.toFixed(4)}p`;
}
const nameOf = (sym) => S.list.find((x) => x.symbol === sym)?.name || INDEX_NAMES[sym] || S.q[sym]?.name || sym;
const plainSym = (s) => s.replace(/\.L$/, "").replace(/^\^/, "");
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "now" : m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const and2 = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0] || "");


// ---- your money ----
const rate = (cur) => (cur ? S.fx[cur] ?? null : null);
const owned = () => S.list.filter((x) => x.qty > 0 && S.q[x.symbol]?.price != null && rate(S.q[x.symbol].cur) != null);
const valueOf = (x) => { const q = S.q[x.symbol]; return q?.price != null && rate(q.cur) != null ? q.price * x.qty * rate(q.cur) : null; };
const dayOf = (x) => { const q = S.q[x.symbol]; return q?.price != null && q.prev && rate(q.cur) != null ? (q.price - q.prev) * x.qty * rate(q.cur) : null; };
// what one's paid you in dividends since you bought it, in pounds (null: not known, with no day to count from)
const divsOf = (x) => { const p = S.paid?.v?.[x.symbol], r = rate(S.q[x.symbol]?.cur); return p && r != null ? p.paid * r : null; };
// what one cost you, in pounds
const paidFor = (x) => x.cost * x.qty * rate(S.q[x.symbol].cur);
// what you own that isn't in your total just now (no price for it: one that's stopped trading, or none in pounds), said
const unpriced = () => S.list.filter((x) => x.qty > 0 && valueOf(x) == null);
const leftOutSaid = (xs = unpriced()) => (xs.length ? `${and2(xs.map((x) => x.name))} ${xs.length === 1 ? "isn't" : "aren't"} in this total: no price for ${xs.length === 1 ? "it" : "them"} just now.` : "");
// (gain: in price; divs: the dividends on top, from those with a day to count from; back: the two together, on what you paid)
function totals() {
  const o = owned(), value = o.reduce((a, x) => a + valueOf(x), 0), day = o.reduce((a, x) => a + (dayOf(x) || 0), 0);
  const costed = o.filter((x) => x.cost != null), paid = costed.reduce((a, x) => a + paidFor(x), 0), now = costed.reduce((a, x) => a + valueOf(x), 0);
  const divs = costed.reduce((a, x) => a + (divsOf(x) || 0), 0), gain = costed.length ? now - paid : null;
  return { o, value, day, dayPct: value - day ? (day / (value - day)) * 100 : 0, paid, gain, gainPct: paid ? ((now - paid) / paid) * 100 : null, costed,
    divs, back: gain == null ? null : gain + divs, backPct: paid ? ((gain + divs) / paid) * 100 : null, undated: costed.filter((x) => divsOf(x) == null && S.years[x.symbol]?.div12 > 0) };
}
// your money in each account (and what's in none yet): [{ key, name, o, value, day }], largest first
function byAccount(o = owned()) {
  const out = [...ACCOUNTS, [null, "Not in an account"]].map(([key, name]) => { const xs = o.filter((x) => (x.account || null) === key);
    return { key, name, o: xs, value: xs.reduce((a, x) => a + valueOf(x), 0), day: xs.reduce((a, x) => a + (dayOf(x) || 0), 0) }; });
  return out.filter((a) => a.o.length).sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || b.value - a.value);
}
// Your income: each dividend each holding paid over the last year (a year of its paying, by how often it pays: yearDivs),
// for what you own now, expected again a year on, in the month it went ex-dividend; one-offs (specials) said apart,
// and not expected again. { months: the next twelve, from
// this one ({ d, total, items }), events (to come, soonest first), payers (largest first, with each one's yield and how
// many it pays a year), total (a year's), none (what you own that's paid nothing over the year), specials ({ x, v, at }) }
function income() {
  const now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth();
  const months = Array.from({ length: 12 }, (_, i) => ({ d: new Date(y0, m0 + i, 1), total: 0, items: [] })), events = [], payers = [], none = [], specials = [];
  for (const x of owned()) {
    const yr = S.years[x.symbol], q = S.q[x.symbol];
    if (!yr) continue;
    // (only a year's: one older isn't next year's to expect; from the years it's paid, where they're here)
    const last = yearDivs(divHistory(x.symbol), now / 1000);
    // (one-offs told from the years it's paid, where they're here; else from its last year's)
    const one = new Set(markDivs(divHistory(x.symbol)).filter((d) => d.special).map((d) => d.t));
    let year = 0, n = 0;
    for (const d of last) {
      const v = d.amount * x.qty * rate(q.cur), at = new Date(d.t * 1000);
      if (one.has(d.t)) { specials.push({ x, v, at }); continue; }
      at.setFullYear(at.getFullYear() + 1);
      // (one that's gone this month already comes round again next year, in this month's place)
      let k = (at.getFullYear() - y0) * 12 + at.getMonth() - m0;
      if (k >= 12) k -= 12;
      year += v; n++;
      months[Math.max(0, k)].total += v; months[Math.max(0, k)].items.push({ x, v, at });
      events.push({ x, v, at });
    }
    if (n) payers.push({ x, year, n, yld: q.price ? (year / (x.qty * rate(q.cur)) / q.price) * 100 : null });
    else none.push(x);
  }
  return { months, events: events.filter((e) => e.at > now).sort((a, b) => a.at - b.at), payers: payers.sort((a, b) => b.year - a.year), total: payers.reduce((a, p) => a + p.year, 0), none, specials };
}
// one's dividends over the years (from your income's history, S.inc), else over the last year
const divHistory = (sym) => (S.inc?.v?.[sym]?.divs?.length ? S.inc.v[sym].divs : S.years[sym]?.divs || []);
// every dividend that's paid you (S.inc), in pounds at today's rate, oldest first: [{ x (the holding, or one you've sold
// all of), v, at, qty, amount (a share's, in its currency), cur, special }]
function gotAll() {
  const out = [];
  for (const [sym, g] of Object.entries(S.inc?.v || {})) {
    const q = S.q[sym], r = rate(q?.cur);
    if (r == null) continue;
    const x = S.list.find((y) => y.symbol === sym) || { symbol: sym, name: nameOf(sym), qty: 0 }, one = new Set(markDivs(g.divs).filter((d) => d.special).map((d) => d.t));
    for (const e of g.got) out.push({ x, v: e.amount * e.qty * r, at: new Date(e.t * 1000), qty: e.qty, amount: e.amount, cur: q.cur, special: one.has(e.t) });
  }
  return out.sort((a, b) => a.at - b.at);
}
// What's paid you, month by month over the last twelve, this month last: { months ({ d, total, items }), total (the
// twelve's), since (all of it), from (the first day counted, ms) }
function received() {
  const now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth(), months = Array.from({ length: 12 }, (_, i) => ({ d: new Date(y0, m0 - 11 + i, 1), total: 0, items: [] }));
  let since = 0, from = null;
  for (const e of gotAll()) {
    since += e.v;
    const k = (e.at.getFullYear() - y0) * 12 + e.at.getMonth() - m0 + 11;
    if (k >= 0 && k < 12) { months[k].total += e.v; months[k].items.push(e); }
  }
  for (const g of Object.values(S.inc?.v || {})) if (g.from && (!from || g.from < from)) from = g.from;
  return { months, total: months.reduce((a, m) => a + m.total, 0), since, from };
}
// The tax year's dividends, April to March: what's paid so far, and what's expected for the rest of it. { months ({ d,
// total, paid, items }), paid, coming, name ("2026–27"), outside (paid so far outside an ISA or pension: what counts
// towards the dividend allowance), outsideComing, inside (paid so far in one, tax-free) }
const DIVIDEND_ALLOWANCE = 500;     // (the UK's, a tax year, since April 2024)
function taxMonths(I = income()) {
  const ty = taxYearOf(), now = Date.now(), months = Array.from({ length: 12 }, (_, i) => ({ d: new Date(ty.start, 3 + i, 1), total: 0, paid: 0, items: [] }));
  const at = (d) => (d.getFullYear() - ty.start) * 12 + d.getMonth() - 3, wrapped = (x) => x.account === "isa" || x.account === "sipp";
  const T = { months, paid: 0, coming: 0, name: ty.name, outside: 0, outsideComing: 0, inside: 0 };
  for (const e of gotAll()) {
    const k = at(e.at);
    if (+e.at < ty.from || +e.at > now || k < 0 || k > 11) continue;
    months[k].total += e.v; months[k].paid += e.v; months[k].items.push({ ...e, done: true }); T.paid += e.v;
    if (wrapped(e.x)) T.inside += e.v; else T.outside += e.v;
  }
  for (const e of I.events) {
    const k = at(e.at);
    if (+e.at >= ty.to || k < 0 || k > 11) continue;
    months[k].total += e.v; months[k].items.push(e); T.coming += e.v;
    if (!wrapped(e.x)) T.outsideComing += e.v;
  }
  return T;
}
// how fast your dividends have grown, a year, over five (each payer's, weighted by what it pays you; null where none's
// paid long enough to say), kept between a 5% fall and a 10% rise
function growthOf(I) {
  let w = 0, g = 0;
  for (const p of I.payers) { const r = health(divHistory(p.x.symbol)); if (r?.growth != null) { w += p.year; g += p.year * r.growth; } }
  return w ? Math.max(-0.05, Math.min(0.1, g / w)) : null;
}
const monthSaid = (d, long = false) => d.toLocaleDateString("en-GB", { month: long ? "long" : "short" });
// (a dividend to come, its day ("1 Oct") or month ("October"): with its year where that's this month's a year on, so it
// isn't read as a day that's been: income.js yearOn)
const aroundDay = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(yearOn(d) ? { year: "numeric" } : {}) });
const aroundMonth = (d) => `${monthSaid(d, true)}${yearOn(d) ? ` ${d.getFullYear()}` : ""}`;
// a year of it, a bar a month (the chosen one bright). o: { add: twelve more, drawn on top apart (what a buy would add),
// est (m) → true where it's still to come (drawn outlined) }

// the ISA's tax year: what's left of its allowance, and how long to use it (it ends on 5 April, London's)
function isaYear() {
  if (!S.isa) return null;
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  const endY = m > 4 || (m === 4 && d >= 6) ? y + 1 : y, days = Math.round((Date.UTC(endY, 3, 5) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
  const left = Math.max(0, S.isa.allowance - S.isa.paid);
  return { ...S.isa, left, days, used: Math.min(1, S.isa.paid / S.isa.allowance) };
}
const tracksIsa = () => !!S.isa && (S.isa.paid > 0 || S.list.some((x) => x.account === "isa"));

// your money through the day: each holding at its price at each moment (its last close before it opened)
function daySeries() {
  const o = owned(), drawn = o.filter((x) => S.q[x.symbol].sparkT?.length > 1);
  if (!drawn.length) return null;
  const T = [...new Set(drawn.flatMap((x) => S.q[x.symbol].sparkT))].sort((a, b) => a - b);
  if (T.length < 2) return null;
  const base = o.reduce((a, x) => a + S.q[x.symbol].prev * x.qty * rate(S.q[x.symbol].cur), 0);
  const vals = T.map((t) => o.reduce((a, x) => {
    const q = S.q[x.symbol]; let p = q.prev, j = -1;
    for (let i = 0; i < (q.sparkT?.length || 0) && q.sparkT[i] <= t; i++) j = i;
    if (j >= 0) p = q.spark[j];
    return a + p * x.qty * rate(q.cur);
  }, 0));
  // (now, at the end: the prices as they are)
  vals[vals.length - 1] = totals().value;
  return { T, vals, base };
}

// ---- the markets, open or shut ----
function marketSaid() {
  const now = Date.now() / 1000, say = (sym, where) => {
    const q = S.q[sym], o = q?.open;
    if (!o) return null;
    if (now >= o.start && now < o.end) { const m = Math.round((o.end - now) / 60), hrs = Math.floor(m / 60), left = `${hrs ? `${hrs}h ` : ""}${m % 60}m`; return { open: true, text: `${where} open · closes in ${left}`, short: `${where} · ${left} left` }; }
    return null;
  };
  return say("^FTSE", "London") || say("^GSPC", "New York") || { open: false, text: "Markets closed" };
}
// How old the prices are, where they're old: not got for a few minutes (this phone's copy, offline, or Markets's prices
// not answering), said as from when they were; or given by Markets from before, its source not answering (stale), said
// as delayed. null while they're fresh
const clock = (t) => { const d = new Date(t); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }); };
function oldSaid() {
  // (not in the moment the app's opening, its account's answer on the way: this phone's copy would be said as old, then
  // not, on nearly every open; S.opening, till when)
  if (Date.now() < (S.opening || 0)) return null;
  if (S.pricesAt && Date.now() - S.pricesAt > 150e3) return `Prices from ${clock(S.pricesAt)}`;
  return [...INDICES, ...owned().map((x) => x.symbol)].some((s) => S.q[s]?.stale) ? "Prices delayed" : null;
}
// what's said along the top: the prices' age where they're old (the dot grey), else the markets, open or shut
function lineSaid() { const old = oldSaid(); return old ? { open: false, text: old } : marketSaid(); }
// (and when the prices were got, for the desk's foot, while they're fresh: once they're old, the line beside it says so)
const pricesAtSaid = () => (oldSaid() ? "" : `Prices at ${clock(S.pricesAt || Date.now())}`);
// said again where it shows, as the prices come in or don't

// ---- what's worth knowing ----
function insights() {
  const out = [], o = owned(), T = totals(), list = S.list.filter((x) => S.q[x.symbol]?.chgPct != null);
  // an odd one: a holding going the other way from its market, by a fair way
  for (const x of list) {
    const q = S.q[x.symbol], m = S.q[MARKET_OF[q.ex]];
    if (!m || m.chgPct == null) continue;
    if (Math.sign(q.chgPct) !== Math.sign(m.chgPct) && Math.abs(q.chgPct - m.chgPct) > 1.5) {
      out.push({ rank: 5, kick: "An odd one", c: "var(--warn)", sym: x.symbol, h: `${x.name} is ${q.chgPct < 0 ? "falling" : "rising"} while the ${INDEX_NAMES[MARKET_OF[q.ex]]} ${m.chgPct >= 0 ? "rises" : "falls"}`,
        p: `${x.name} is ${q.chgPct < 0 ? "down" : "up"} ${fmt(Math.abs(q.chgPct))}% today; the market's ${m.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(m.chgPct))}%.`,
        viz: ["vbars", [[x.name, q.chgPct], [INDEX_NAMES[MARKET_OF[q.ex]], m.chgPct]]] });
      break;
    }
  }
  // near its year's high or low
  for (const x of list) {
    const q = S.q[x.symbol], y = S.years[x.symbol], hi = q.hi52 ?? y?.hi52, lo = q.lo52 ?? y?.lo52;
    if (!hi || !lo || hi <= lo) continue;
    const at = (q.price - lo) / (hi - lo);
    if (q.price >= hi * 0.98) { out.push({ rank: 4, kick: "Near its high", c: "var(--up)", sym: x.symbol, h: `${x.name} is close to its 52-week high`, p: y?.yr != null ? `It's ${y.yr >= 0 ? "up" : "down"} ${fmt(Math.abs(y.yr), 0)}% on a year ago.` : `${priceSaid(q, hi)} is the highest it's been in a year.`, viz: ["range52", q, lo, hi, at] }); break; }
    if (q.price <= lo * 1.02) { out.push({ rank: 4, kick: "Near its low", c: "var(--down)", sym: x.symbol, h: `${x.name} is close to its 52-week low`, p: `It's ${fmt((1 - q.price / hi) * 100, 0)}% below its high of the year.`, viz: ["range52", q, lo, hi, at] }); break; }
  }
  // a big week
  const wk = list.map((x) => ({ x, w: S.years[x.symbol]?.wk })).filter((a) => a.w != null && Math.abs(a.w) >= 6).sort((a, b) => Math.abs(b.w) - Math.abs(a.w))[0];
  if (wk) out.push({ rank: 3, kick: "This week", c: "var(--blue)", sym: wk.x.symbol, h: `${wk.x.name} is ${wk.w >= 0 ? "up" : "down"} ${fmt(Math.abs(wk.w), 0)}% this week`, p: `Over the last five trading days, against ${pct(S.q[wk.x.symbol].chgPct)} today.`, viz: ["spark", wk.x.symbol] });
  // how much is in one company (or one trust, which spreads it across many itself; a fund's spread is the point of it)
  if (o.length >= 2) {
    const top = [...o].sort((a, b) => valueOf(b) - valueOf(a))[0], share = Math.round((valueOf(top) / T.value) * 100), k = kindOf(S.q[top.symbol]);
    const part = share >= 50 ? "over half" : share >= 34 ? "over a third" : "almost a third";
    if (share >= 30 && (k === "share" || k === "trust")) out.push({ rank: 2, kick: "Your mix", c: "var(--blue)", sym: top.symbol, h: `${share}% of your money is in one ${k === "trust" ? "trust" : "company"}`,
      p: k === "trust" ? `${top.name} is ${part} of what you own. It spreads that across many companies itself, but its days still move your total most.`
        : `${top.name} is ${part} of what you own, so its days move your total more than the market does.`, viz: ["mix", o] });
  }
  // dividends, from what each paid over the last year
  const divs = o.map((x) => ({ x, v: (S.years[x.symbol]?.div12 || 0) * x.qty * rate(S.q[x.symbol].cur) })).filter((a) => a.v > 0.5).sort((a, b) => b.v - a.v);
  if (divs.length) {
    const sum = divs.reduce((a, d) => a + d.v, 0);
    out.push({ rank: 1.5, kick: "Dividends", c: "var(--up)", open: "income", h: `About ${money(sum, "GBP", 0)} a year in dividends`, p: `From ${and2(divs.slice(0, 3).map((d) => d.x.name))}${divs.length > 3 ? " and others" : ""}, at what they paid over the last year.`,
      viz: ["vbars", divs.slice(0, 3).map((d) => [d.x.name, d.v]), "money", divs[0].v] });
  }
  // what's left of the ISA's allowance, in the tax year's last eight weeks
  const iy = isaYear();
  if (iy && tracksIsa() && iy.left > 0 && iy.days <= 56) out.push({ rank: 2.6, kick: "Your ISA", c: "var(--up)", open: "isa", h: `${money(iy.left, "GBP", 0)} of your ISA allowance left`,
    p: `It goes on 5 April, ${plural(iy.days, "day")} from now, and what isn't used doesn't carry over to the next tax year.`, viz: ["allow", iy.used] });
  // since you bought
  // (opening Holdings, each one's figure there how it's done since you bought it)
  if (T.back != null && T.costed.length) out.push({ rank: 1, kick: "Since you bought", c: T.back >= 0 ? "var(--up)" : "var(--down)", open: "back", h: `${T.back >= 0 ? "Up" : "Down"} ${money(Math.abs(T.back), "GBP", 0)} on what you paid`,
    p: `${pct(T.backPct, 1)} across ${plural(T.costed.length, "holding")} you've said what you paid for${T.divs >= 0.5 ? `, ${money(T.divs, "GBP", 0)} of it in dividends` : ""}.` });
  if (!out.length && list.length) {
    const big = [...list].sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0], q = S.q[big.symbol];
    out.push({ rank: 0, kick: "A quiet day", c: "var(--text-2)", sym: big.symbol, h: "Nothing out of the ordinary today", p: `Your biggest mover is ${big.name}, ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct))}%.` });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 4);
}

// what you own now, through a range (app.js 1368-1387, 1844-1845)
// what you own now, through a range: each holding's chart (kept ten minutes), its price carried over when its market's
// shut, at today's exchange rates. { T, vals, base, by: each holding's change over it, in pounds }
async function rangeSeries(r) {
  const o = owned(), charts = {};
  const get = async (sym) => { const k = `${sym}:${r}`, kept = S.charts.get(k); if (kept && Date.now() - kept.at < 600e3) return kept.c; const c = await A.chart(sym, r); chartSet(k, c); return c; };
  for (let i = 0; i < o.length; i += 6) await Promise.all(o.slice(i, i + 6).map((x) => get(x.symbol).then((c) => { charts[x.symbol] = c; }, () => {})));
  const held = o.filter((x) => charts[x.symbol]?.c?.length > 1);
  if (!held.length) return null;
  const key = r === "5d" ? (t) => Math.round(t / 1800) * 1800 : (t) => Date.parse(dayKey(t)) / 1000;
  const T = [...new Set(held.flatMap((x) => charts[x.symbol].t.map(key)))].sort((a, b) => a - b), vals = T.map(() => 0), by = [];
  for (const x of held) {
    const c = charts[x.symbol], m = new Map(c.t.map((t, i) => [key(t), c.c[i]])), k = x.qty * rate(S.q[x.symbol].cur);
    let last = c.c[0];
    T.forEach((t, i) => { if (m.has(t)) last = m.get(t); vals[i] += last * k; });
    by.push({ x, v: (S.q[x.symbol].price - c.c[0]) * k });
  }
  // (ending now: the prices as they are)
  vals[vals.length - 1] = held.reduce((a, x) => a + valueOf(x), 0);
  return { T, vals, base: vals[0], by };
}
// a day's key, for lining up days across markets
const dayKey = (t) => new Date(t * 1000).toISOString().slice(0, 10);

// ---- News, as data (app.js 1962-2017; newsGroups' clustering is news.js's, given storiesOf) ----
const TOPIC_NAME = { UK: "FTSE 100", US: "S&P 500" }, TOPIC_INDEX = { UK: "^FTSE", US: "^GSPC" };
const TOPIC_SAID = { UK: "UK companies", US: "US companies", WORLD: "companies around the world" };
const newsKey = (n) => n.link.replace(/[?#].*$/, "");
const aboutIt = (n, sym) => n.for === sym || n.tickers.includes(sym);
const sansStop = (t) => t.replace(/[.!?]$/, "");
// (when you last looked: stories since are new; set as you leave News, or the app, from it)
const newsSeen = () => store.get("newsSeen", 0);
const newsHidden = () => new Set(store.get("newsHide", []));
const newsRead = () => new Set(store.get("newsRead", []));
// the stories in groups: { kind (holdings, following, markets), x (the holding), topic, stories }, each story once
// (by: news.js passes stories.js's storiesOf, for each group's items; the count needs none)
function newsGroups(all, by = null) {
  const used = new Set(), out = [], newest = (a, b) => b.at - a.at;
  const take = (pred, n) => { const got = all.filter((s) => !used.has(s) && pred(s)).sort(newest).slice(0, n); got.forEach((s) => used.add(s)); return got; };
  for (const x of [...owned()].sort((a, b) => valueOf(b) - valueOf(a))) {
    const t = S.newsTopics?.[x.symbol], mine = take((s) => aboutIt(s, x.symbol), 5), mkt = t ? take((s) => s.topic && (t === "WORLD" || s.topic === t), 3) : [];
    if (mine.length || mkt.length) out.push({ kind: "holdings", x, topic: t, stories: [...mine, ...mkt].sort(newest) });
  }
  for (const x of S.list.filter((y) => !(y.qty > 0))) { const st = take((s) => aboutIt(s, x.symbol), 3); if (st.length) out.push({ kind: "following", x, stories: st }); }
  const mk = take((s) => !!s.topic, 8);
  if (mk.length) out.push({ kind: "markets", stories: mk });
  // (the same story from several publishers, once, the others under it)
  if (by) for (const g of out) g.items = by(g.stories);
  return out;
}
// what's new since you last looked, about what you own (and its markets) or follow, that you haven't read
function newsNew() {
  if (!S.news) return [];
  const seen = P.sec === "news" && S.newsSince != null ? S.newsSince : newsSeen(), read = newsRead(), hidden = newsHidden();
  return newsGroups(S.news.filter((n) => !hidden.has(n.src))).filter((g) => g.kind !== "markets").flatMap((g) => g.stories).filter((n) => n.at > seen && !read.has(newsKey(n)));
}
// a story, by the id the address and the hooks give it (its key from Markets, else its link without the query)
const storyId = (n) => String(n?.k || newsKey(n));
const storyOf = (id) => (S.news || []).find((n) => storyId(n) === String(id)) || null;
// News left (or Markets): what was there, seen
const leftNews = () => store.set("newsSeen", Date.now());
async function loadNews() {
  if (loadNews.busy || !S.me) return;
  loadNews.busy = true;
  const gen = P.gen;
  try {
    const syms = [...S.list].sort((a, b) => (valueOf(b) ?? 0) - (valueOf(a) ?? 0)).slice(0, 10).map((x) => x.symbol);
    const r = syms.length ? await A.news(syms) : { news: [], topics: {} };
    if (gen !== P.gen) return;
    S.news = r.news; S.newsTopics = r.topics || {};
    S.newsAt = Date.now(); S.newsErr = null;
  } catch (e) { if (gen !== P.gen) return; S.newsErr = e.message || "offline"; S.newsAt = Date.now(); } finally { loadNews.busy = false; }
  emit("news");
}

// ---- your list: what you looked at last, following one, taking one off, an alert (app.js 2508-2526, 2667, 2275) ----
const recent = { get: () => store.get("recent", []), add(sym, name) { store.set("recent", [{ s: sym, n: name }, ...recent.get().filter((x) => x.s !== sym)].slice(0, 6)); } };
// following one in a tap: added with none owned → true once it's in (the caller says so); a throw says why not
async function follow(sym, name) {
  if (S.list.some((x) => x.symbol === sym)) return false;
  const g = P.gen, r = await A.putHolding({ symbol: sym, name, qty: 0 });
  if (!mine(g)) return false;
  S.list = r.holdings; S.news = null;
  changed();
  return true;
}
async function removeHolding(sym) {
  const g = P.gen, r = await A.dropHolding(sym);
  if (!mine(g)) return;
  S.list = r.holdings; S.news = null;
  changed();
}
// An alert set (p: how much a move in a day, 0 for none) → the words to say it with (InFlite's notifications, in You)
async function alertSet(sym, p) {
  const g = P.gen, r = await A.setAlert(sym, !!p, p || 3);
  if (!mine(g)) return null;
  const name = S.list.find((x) => x.symbol === sym)?.name || nameOf(sym);
  S.list = r.holdings;
  changed();
  if (!p) return "Alert off";
  if (S.alertsOff) return `You'll hear when ${name} moves ${p}% in a day (alerts are off in your account)`;
  return `You'll hear when ${name} moves ${p}% in a day (notifications for every app are in You)`;
}
// a write that Today's Markets card shows (holding, buy, order, follow, alert, ISA): drawn again here, and Today told
// (S2-D11, C8)
function changed() { emit("list"); try { P.fw?.changed?.(); } catch (_) {} }

// ---- Send (S2-D6): name, sym, pct and day only; never a price, a value or what you hold ----
// (a card packed as Chat reads one from an address, app.js 2735)
function packCard(card) {
  return (card && new URLSearchParams(chatHash("", card).slice(1)).get("card")) || null;
}
// a stock's day: the hub's words (app.js 2722-2725), never the "at <price>" ones → { words, packed, what }
function stockSend(sym, name = nameOf(sym)) {
  const q = S.q[sym];
  const move = typeof q?.chgPct === "number" && Number.isFinite(q.chgPct) ? ` is ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}% today` : "";
  return { words: `${name} (${plainSym(sym)})${move}.`, packed: packCard(stockSendCard(sym, name, q, Date.now())), what: name };
}
// a day, in a market's own zone (functions/_markets.js dayIn); and whether a quote's from today's trading there (crypto
// always: functions/_todaymkt.js tradedToday)
const dayIn = (tz, ms) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); } catch (_) { return null; } };
const tradedToday = (q, now = Date.now()) => kindOf(q) === "crypto" || (!!q?.time && dayIn(q.tz, q.time * 1000) === dayIn(q.tz, now));
// your portfolio's day: the card functions/_todaymkt.js makes ({ name: "Portfolio", sym: null, pct, day }; no ref, as
// Chat keeps one only with a symbol) → { words, packed, what }; null while nothing you own is priced, or nothing you own
// has traded today (a weekend, before London opens: the last session's move isn't today's, as Today's own card has it)
function portfolioSend(now = Date.now()) {
  const T = totals();
  if (!T.o.length || !Number.isFinite(T.dayPct) || !T.o.some((x) => tradedToday(S.q[x.symbol], now))) return null;
  const pct = Math.round(T.dayPct * 100) / 100, p1 = Math.abs(pct).toFixed(1);
  const words = p1 === "0.0" ? "My portfolio is flat today." : `My portfolio is ${pct > 0 ? "up" : "down"} ${p1}% today.`;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  return { words, packed: packCard({ v: 1, kind: "markets", from: "markets", at: Math.round(now), say: words, snap: { name: "Portfolio", sym: null, pct, day } }), what: "your portfolio's day" };
}

// a story: its title and link, nothing else (no card, no amount)
const storySend = (n) => ({ words: `${String(n?.title || "").trim()}\n${String(n?.link || "")}`.trim(), packed: null, what: "this story" });

// ---- signed in: your list and its prices (app.js 2866-2941, the theme and the DOM left out) ----
function take(m) {
  S.me = { id: m.id, name: m.name, handle: m.handle, photoAt: m.photoAt };
  S.list = m.holdings || []; S.q = { ...S.q, ...(m.quotes || {}) }; S.fx = { ...S.fx, ...(m.rates || {}) }; S.alertsOff = !!m.alertsOff; S.isa = m.isa ?? S.isa; S.wrap = m.wrap ?? S.wrap;
}
const keep = () => store.set("last", { id: S.me?.id ?? null, me: S.me, holdings: S.list, quotes: S.q, rates: S.fx, isa: S.isa, at: S.pricesAt });
// your holdings' years (for what's worth knowing), behind: drawn again once they're in
async function loadYears() {
  const old = Date.now() - (S.yearsAt || 0) > 12 * 3600e3, gen = P.gen;
  const syms = [...S.list.map((x) => x.symbol), ...BENCHES.map((b) => b[0])].filter((s, i, a) => a.indexOf(s) === i && (old || !S.years[s]?.divs || S.years[s].first == null));
  if (!syms.length) return;
  try { const r = await A.years(syms.slice(0, 60)); if (gen !== P.gen) return; Object.assign(S.years, r.years); if (old) S.yearsAt = Date.now(); store.set("years", { id: S.me?.id ?? null, at: S.yearsAt || Date.now(), years: S.years }); if (calm()) emit("list"); } catch (_) {}
}
// what each holding's paid you since you bought it (its dividends), behind: kept ten minutes
async function loadPaid(force = false) {
  if (!force && S.paid && Date.now() - S.paid.at < 600e3) return;
  if (!owned().length) return;
  const gen = P.gen;
  try { const v = (await A.paid()).paid; if (gen !== P.gen) return; S.paid = { at: Date.now(), v }; } catch (_) { return; }
  emit("list");
}
// your income's history, for the Income sheet: kept ten minutes; one that couldn't come not asked again by itself for a
// minute (loadIncome.failed), Try Again asks at once
async function loadIncome(force = false) {
  if (loadIncome.busy || (!force && ((S.inc && Date.now() - S.inc.at < 600e3) || Date.now() - (loadIncome.failed || 0) < 60e3)) || !owned().length) return;
  loadIncome.busy = true; loadIncome.failed = 0;
  const gen = P.gen;
  try { const v = (await A.income()).income; if (gen === P.gen) S.inc = { at: Date.now(), v }; } catch (_) { loadIncome.failed = Date.now(); } finally { loadIncome.busy = false; }
  if (gen === P.gen) emit("settings", { keys: ["inc"] });
}
// (drawn again behind only while no Markets sheet is up over it and no reorder is waiting to be kept)
const calm = () => !P.sheet && !P.ordering;
export const busy = () => !calm();
// Prices again: every 15 seconds while Markets shows and the page is in front; each change flashed where it shows
// (mkui.paint, on "quotes")
async function refresh(force = false) {
  if (!S.me || (!force && (refresh.busy || !P.fw?.visible?.()))) return;
  const syms = [...new Set([...INDICES, ...S.list.map((x) => x.symbol), ...(P.stock ? [P.stock] : [])])], gen = P.gen;
  refresh.busy = true;
  try {
    const r = await A.quotes(syms);
    if (gen !== P.gen) return;
    applyPrices(r, force);
    stream.sync();
  } catch (e) {
    // (a 401: signed out only once the framework's own check says so; else offline a moment, said as old once it is)
    if (gen === P.gen && e.status === 401) lost();
    else if (gen === P.gen) emit("quotes", { was: null });
  } finally { refresh.busy = false; }
}
function applyPrices(r, force = false, fromStream = false) {
  const was = { ...S.q }, wasOut = unpriced().map((x) => x.symbol).join();
  Object.assign(S.q, stream.merge(r.quotes)); Object.assign(S.fx, r.rates || {});
  if (!fromStream) S.pricesAt = Date.now();
  keep();
  if (force) return;
  if (unpriced().map((x) => x.symbol).join() !== wasOut && calm()) { emit("list"); return; }
  emit("quotes", { was });
}
export const liveEnabled = () => !!S.me && store.get(`live:${S.me.id}`) === true;
export function setLiveEnabled(on) { if (S.me) store.set(`live:${S.me.id}`, !!on); stream.sync(); }
const stream = priceStream({ quotes: () => S.q, symbols: () => [...INDICES, ...S.list.map((x) => x.symbol), ...(P.stock ? [P.stock] : [])],
  enabled: liveEnabled, visible: () => !!S.me && P.on && !!P.fw?.visible?.(),
  update: (quotes) => applyPrices({ quotes }, false, true) });
// (a sign-in Markets was told is gone: the framework asks the session; signed out → stop, kept → nothing)
async function lost() {
  const out = await P.fw?.session?.lost?.().catch(() => false);
  if (out === true) stop();
  return out === true;
}

// ---- starting and stopping (S2-D2, D4, D9) ----
// every account field from scratch (RI7): nothing of the last account's survives a stop
function fresh() {
  Object.assign(S, { me: null, list: [], q: {}, fx: { GBP: 1 }, years: {}, news: null, alertsOff: false, isa: null, wrap: true, vs: null, paid: null, prange: "1d", mix: "holding", fig: "day",
    inc: null, imode: "coming", goal: 100, add: 0, reinvest: true, buyAmt: 1000, newsTopics: {}, nfilter: "all", newsSince: null });
  S.charts = new Map();
  for (const k of ["yearsAt", "newsAt", "newsErr", "pricesAt", "opening", "loading", "err"]) delete S[k];
  loadIncome.failed = 0; loadIncome.busy = false; loadNews.busy = false; refresh.busy = false;
}
// this phone's copy, when it's this account's (its id, or the id of the me inside it, as app.js wrote it)
function keptFor(id) {
  const last = store.get("last");
  return id != null && last?.me && (last.id ?? last.me.id) === id ? last : null;
}
export function start(fw) {
  stop();
  P.fw = fw; P.gen++;
  const gen = P.gen;
  { const p = store.get("plan"); if (p) { S.goal = +p.goal || 100; S.add = +p.add || 0; S.reinvest = p.reinvest !== false; } }
  const id = fw?.session?.user?.id ?? null, last = keptFor(id);
  if (last) {
    take({ ...last.me, holdings: last.holdings, quotes: last.quotes, rates: last.rates, isa: last.isa }); S.pricesAt = last.at || 0;
    const ys = store.get("years"); if (!ys?.id || ys.id === id) { S.years = ys?.years || {}; S.yearsAt = ys?.at || 0; }
    S.opening = Date.now() + 4000;
    emit("me");
  }
  return loadMe(gen);
}
// your list from your account: drawn once it's in; one that couldn't come kept in S.err (with no list to show, the
// views say so, with Try Again: retry)
function loadMe(gen) {
  S.loading = true; S.err = null; emit("loading", true);
  const failed = (words, offline = false) => { S.err = { words, offline }; emit("error", words); };
  return A.me().then(async (m) => {
    if (gen !== P.gen) return;
    if (!m?.signedIn) { S.loading = false; emit("loading", false); if (!(await lost()) && gen === P.gen) failed("Couldn’t get your list just now"); return; }
    if (S.me && S.me.id !== m.id) fresh();
    take(m);
    S.pricesAt = Date.now(); S.opening = 0; S.loading = false; S.err = null;
    keep();
    stream.sync();
    emit("loading", false); emit("error", null); emit("me");
    loadYears(); loadPaid();
    if (P.on && (S.news == null || Date.now() - (S.newsAt || 0) > 15 * 60e3)) loadNews();
  }, async (e) => {
    if (gen !== P.gen) return;
    S.loading = false; S.opening = 0; emit("loading", false);
    if (e.status === 401 && (await lost())) return;
    if (gen === P.gen) failed(e.message || "Couldn’t get your list just now", !!e.offline && !e.slow);
  });
}
// Try Again, after your list couldn't come (the same account, the same start)
export function retry() {
  if (!P.fw || S.loading) return null;
  return loadMe(P.gen);
}
export function stop() {
  stream.stop();
  shown(false);
  for (const f of P.offs.splice(0)) f();
  P.gen++; P.fw = null; P.sheet = false; P.ordering = 0; P.orderLost = false; P.orderQ = null; P.stock = null; P.sec = "today";
  fresh();
}
// Markets shown (true) or not: the 15-second prices only between, while the page is visible; on coming back after
// 15 seconds or more, once; the news whenever it's older than a quarter of an hour (S2-D4)
export function shown(v) {
  v = !!v;
  if (v === P.on) return;
  P.on = v;
  clearInterval(P.timer); P.timer = 0;
  for (const f of P.offs.splice(0)) f();
  if (!v) { stream.stop(); P.away = Date.now(); if (P.sec === "news") leftNews(); return; }
  const fw = P.fw;
  const tick = () => { if (P.on && fw?.visible?.()) refresh(); };
  P.timer = setInterval(tick, 15000);
  stream.sync();
  const news = () => { if (S.me && Date.now() - (S.newsAt || 0) > 15 * 60e3) loadNews(); };
  if (fw?.on) {
    P.offs.push(fw.on("visible", () => { if (!P.on) return; stream.sync(); if (Date.now() - P.away >= 15e3) refresh(); news(); }));
    P.offs.push(fw.on("hidden", () => { stream.stop(); P.away = Date.now(); if (P.on && P.sec === "news") leftNews(); }));
  }
  if (P.away && Date.now() - P.away >= 15e3) refresh();
  news();
}
export const live = () => P.on && !!P.timer;

// (B0's stub names, kept: API = account.js's calls)
export const API = A;
export { A, INDICES, INDEX_NAMES, MARKET_OF, BENCHES, ACCOUNTS, ACCOUNT_NAME, PRANGES, RANGES, SYM, fmt, money, signed, pct, tone, isIndex, kindOf, KIND_SAID, KINDS_SAID, TRUST_PICKS, digits,
  priceSaid, chgSaid, priceIn, penceMeant, nameOf, plainSym, ago, plural, and2, rate, owned, valueOf, dayOf, divsOf, paidFor, unpriced, leftOutSaid, totals, byAccount, income, divHistory, gotAll,
  received, DIVIDEND_ALLOWANCE, taxMonths, growthOf, monthSaid, aroundDay, aroundMonth, isaYear, tracksIsa, daySeries, marketSaid, clock, oldSaid, lineSaid, pricesAtSaid, insights, rangeSeries, dayKey,
  TOPIC_NAME, TOPIC_INDEX, TOPIC_SAID, newsKey, aboutIt, sansStop, newsSeen, newsHidden, newsRead, newsGroups, newsNew, storyId, storyOf, leftNews, loadNews, recent, follow, removeHolding, alertSet,
  changed, packCard, dayIn, tradedToday, stockSend, portfolioSend, storySend, take, loadYears, loadPaid, loadIncome, calm, refresh, lost, markDivs, health, taxYearOf, yearDivs, yearOn };

export { quoteSession };
