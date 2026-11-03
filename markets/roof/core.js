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
export function on() { throw new Error("not yet: on"); }
export function emit() { throw new Error("not yet: emit"); }
export function start() { throw new Error("not yet: start"); }
export function stop() { throw new Error("not yet: stop"); }
export function shown() { throw new Error("not yet: shown"); }
export function busy() { throw new Error("not yet: busy"); }
export function fmt() { throw new Error("not yet: fmt"); }
export function money() { throw new Error("not yet: money"); }
export function signed() { throw new Error("not yet: signed"); }
export function pct() { throw new Error("not yet: pct"); }
export function tone() { throw new Error("not yet: tone"); }
export function priceSaid() { throw new Error("not yet: priceSaid"); }
export function chgSaid() { throw new Error("not yet: chgSaid"); }
export function plainSym() { throw new Error("not yet: plainSym"); }
export function ago() { throw new Error("not yet: ago"); }
export function rate() { throw new Error("not yet: rate"); }
export function owned() { throw new Error("not yet: owned"); }
export function valueOf() { throw new Error("not yet: valueOf"); }
export function dayOf() { throw new Error("not yet: dayOf"); }
export function divsOf() { throw new Error("not yet: divsOf"); }
export function paidFor() { throw new Error("not yet: paidFor"); }
export function unpriced() { throw new Error("not yet: unpriced"); }
export function leftOutSaid() { throw new Error("not yet: leftOutSaid"); }
export function totals() { throw new Error("not yet: totals"); }
export function byAccount() { throw new Error("not yet: byAccount"); }
export function income() { throw new Error("not yet: income"); }
export function growthOf() { throw new Error("not yet: growthOf"); }
export function isaYear() { throw new Error("not yet: isaYear"); }
export function daySeries() { throw new Error("not yet: daySeries"); }
export function marketSaid() { throw new Error("not yet: marketSaid"); }
export function lineSaid() { throw new Error("not yet: lineSaid"); }
export function insights() { throw new Error("not yet: insights"); }
export function take() { throw new Error("not yet: take"); }
export function loadYears() { throw new Error("not yet: loadYears"); }
export function loadPaid() { throw new Error("not yet: loadPaid"); }
export function loadIncome() { throw new Error("not yet: loadIncome"); }
export function refresh() { throw new Error("not yet: refresh"); }
export function loadNews() { throw new Error("not yet: loadNews"); }
export function follow() { throw new Error("not yet: follow"); }
export function removeHolding() { throw new Error("not yet: removeHolding"); }
export function alertSet() { throw new Error("not yet: alertSet"); }
export function recent() { throw new Error("not yet: recent"); }
export function live() { throw new Error("not yet: live"); }
export function calm() { throw new Error("not yet: calm"); }
