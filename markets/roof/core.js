// STUB (One roof, stages 2–4, batch j0): the frozen surface of this file (s2/spec.md §4.2, §4.3, §4.7; roof/s24-contracts.md).
// Every export below is final in name and shape; each function throws until its owner ports it. The owner replaces the
// bodies, keeps every export and drops STUB (roofcontract.test skips this file's behaviour cases while STUB is here).
// Owner: MK. Markets' engine: markets/app.js's state and functions under their own names (§4.2 core row): S (app.js:810's
// shape less tab and pushOn), EVENTS, on/emit, start(fw)/stop()/shown(on)/busy(), store (markets:* in localStorage, as
// app.js:812), the formatters and money, the loaders, live (S2-D4), calm; the kept copy carries the account's id (S2-D9);
// a 401 asks fw.session.lost() and stop()s on true; fw.changed() after writes.
import * as account from "../account.js";
export const STUB = true;
export const S = { me: null, list: [], q: {}, fx: { GBP: 1 }, years: {}, news: null, charts: new Map(), alertsOff: false, isa: null, wrap: true, vs: null, paid: null, prange: "1d", mix: "holding", fig: "day",
  inc: null, imode: "coming", goal: 100, add: 0, reinvest: true, buyAmt: 1000, newsTopics: {}, nfilter: "all", newsSince: null };
export const EVENTS = Object.freeze(["me", "quotes", "news", "list", "settings", "loading", "error"]);
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem("markets:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("markets:" + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem("markets:" + k); } catch (_) {} },
};
export const API = account;
export function on(...a) { throw new Error("not yet: on"); }
export function emit(...a) { throw new Error("not yet: emit"); }
export function start(...a) { throw new Error("not yet: start"); }
export function stop(...a) { throw new Error("not yet: stop"); }
export function shown(...a) { throw new Error("not yet: shown"); }
export function busy(...a) { throw new Error("not yet: busy"); }
export function fmt(...a) { throw new Error("not yet: fmt"); }
export function money(...a) { throw new Error("not yet: money"); }
export function signed(...a) { throw new Error("not yet: signed"); }
export function pct(...a) { throw new Error("not yet: pct"); }
export function tone(...a) { throw new Error("not yet: tone"); }
export function priceSaid(...a) { throw new Error("not yet: priceSaid"); }
export function chgSaid(...a) { throw new Error("not yet: chgSaid"); }
export function plainSym(...a) { throw new Error("not yet: plainSym"); }
export function ago(...a) { throw new Error("not yet: ago"); }
export function rate(...a) { throw new Error("not yet: rate"); }
export function owned(...a) { throw new Error("not yet: owned"); }
export function valueOf(...a) { throw new Error("not yet: valueOf"); }
export function dayOf(...a) { throw new Error("not yet: dayOf"); }
export function divsOf(...a) { throw new Error("not yet: divsOf"); }
export function paidFor(...a) { throw new Error("not yet: paidFor"); }
export function unpriced(...a) { throw new Error("not yet: unpriced"); }
export function leftOutSaid(...a) { throw new Error("not yet: leftOutSaid"); }
export function totals(...a) { throw new Error("not yet: totals"); }
export function byAccount(...a) { throw new Error("not yet: byAccount"); }
export function income(...a) { throw new Error("not yet: income"); }
export function growthOf(...a) { throw new Error("not yet: growthOf"); }
export function isaYear(...a) { throw new Error("not yet: isaYear"); }
export function daySeries(...a) { throw new Error("not yet: daySeries"); }
export function marketSaid(...a) { throw new Error("not yet: marketSaid"); }
export function lineSaid(...a) { throw new Error("not yet: lineSaid"); }
export function insights(...a) { throw new Error("not yet: insights"); }
export function take(...a) { throw new Error("not yet: take"); }
export function loadYears(...a) { throw new Error("not yet: loadYears"); }
export function loadPaid(...a) { throw new Error("not yet: loadPaid"); }
export function loadIncome(...a) { throw new Error("not yet: loadIncome"); }
export function refresh(...a) { throw new Error("not yet: refresh"); }
export function loadNews(...a) { throw new Error("not yet: loadNews"); }
export function follow(...a) { throw new Error("not yet: follow"); }
export function removeHolding(...a) { throw new Error("not yet: removeHolding"); }
export function alertSet(...a) { throw new Error("not yet: alertSet"); }
export function recent(...a) { throw new Error("not yet: recent"); }
export function live(...a) { throw new Error("not yet: live"); }
export function calm(...a) { throw new Error("not yet: calm"); }
