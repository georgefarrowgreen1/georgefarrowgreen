// Markets' own logic, as InFlite Today uses it (functions/_markets.js, for functions/_todaymkt.js), in Markets' own words:
// the next dividend as Markets expects it (worked through markets/app.js income() itself), whether a market's open (as
// markets/app.js marketSaid() says it), the markets shut today (the evening wrap's rule, said only once it's clear: at a
// weekend there, or an hour past its usual open), and a holding's dividends and year read from what's kept only, never
// asked for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextDividend, marketState, shutToday, wrapFigures, dividends, yearOf, dayIn, moneySaid, andSaid } from "../../../functions/_markets.js";
import { yearDivs, marked } from "../../../markets/income.js";

const APP = readFileSync(new URL("../../../markets/app.js", import.meta.url), "utf8");
const fnOf = (name) => { const m = new RegExp(`\\nfunction ${name}\\(\\) \\{[\\s\\S]*?\\n\\}\\n`).exec(APP); assert.ok(m, `markets/app.js ${name}()`); return m[0]; };
// (a clock stopped at T, for the app's own functions: new Date() and Date.now() are then)
const clockAt = (T) => class extends Date { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } };

const MON = Date.UTC(2026, 10, 2, 8, 10);                 // (Monday 2 November 2026, 08:10 in London: the fixtures' moment)
const day = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;     // (a dividend's day, as Yahoo gives it: seconds)
// (Tesco: an interim and a final each year, the last on 6 November 2025)
const TESCO = [[2022, 6, 9, 0.071], [2022, 10, 13, 0.0385], [2023, 6, 8, 0.0775], [2023, 10, 12, 0.039], [2024, 6, 13, 0.0825], [2024, 10, 10, 0.041], [2025, 6, 12, 0.087], [2025, 11, 6, 0.0432]]
  .map(([y, m, d, amount]) => ({ t: day(y, m, d), amount }));
// (once a year, the 5th of November, and a one-off ten times that two days before last year's: the one-off isn't expected again)
const ONEOFF = [...[2022, 2023, 2024, 2025].map((y) => ({ t: day(y, 11, 5), amount: 0.1 })), { t: day(2025, 11, 3), amount: 1 }].sort((a, b) => a.t - b.t);
// (once a year, at the end of October: last year's a year on has been already, so next year's is the one to come)
const OCTOBER = [2022, 2023, 2024, 2025].map((y) => ({ t: day(y, 10, 30), amount: 0.5 }));
// (one that's stopped paying: nothing since 2023)
const STOPPED = [2021, 2022, 2023].map((y) => ({ t: day(y, 3, 1), amount: 0.2 }));

// What markets/app.js income() says is next, for these holdings at T: its own code, run on them
function appNext(list, T) {
  const S = { years: {}, q: {} }, fx = { GBP: 1, USD: 0.78 };
  for (const x of list) { S.years[x.symbol] = { divs: x.divs }; S.q[x.symbol] = { cur: x.cur, price: 10 }; }
  const income = new Function("S", "owned", "yearDivs", "markDivs", "rate", "divHistory", "Date", `${fnOf("income")}\nreturn income();`);
  const I = income(S, () => list, yearDivs, marked, (c) => fx[c], (s) => S.years[s]?.divs || [], clockAt(T)), e = I.events[0];
  return e ? { symbol: e.x.symbol, name: e.x.name, at: +e.at, value: e.v } : null;
}
const itemsOf = (list) => list.map((x) => ({ symbol: x.symbol, name: x.name, qty: x.qty, rate: { GBP: 1, USD: 0.78 }[x.cur], divs: x.divs }));
const near = (a, b) => (a == null || b == null ? a === b : a.symbol === b.symbol && a.name === b.name && a.at === b.at && Math.abs(a.value - b.value) < 1e-9);

test("the next dividend, as Markets expects it: a year on from the last, one-offs left out, the soonest still to come", () => {
  const tesco = { symbol: "TSCO.L", name: "Tesco", qty: 1000, cur: "GBP", divs: TESCO };
  const one = nextDividend(itemsOf([tesco]), MON);
  assert.equal(one.symbol, "TSCO.L"); assert.equal(one.name, "Tesco");
  assert.equal(one.at, Date.UTC(2026, 10, 6), "6 November 2025's, a year on"); assert.ok(Math.abs(one.value - 43.2) < 1e-9, String(one.value));
  // (the fixtures' Markets card says just this)
  const card = JSON.parse(readFileSync(new URL("../mocks/today/cards.json", import.meta.url), "utf8")).cards.markets.dividend;
  assert.equal(one.at, card.at); assert.ok(Math.abs(one.value - card.value) < 1e-9);
  // (a one-off, ten times the usual, two days before: not expected again; the usual one, on the 5th, is next)
  const oneoff = { symbol: "AAPL", name: "Apple", qty: 50, cur: "USD", divs: ONEOFF };
  const two = nextDividend(itemsOf([tesco, oneoff]), MON);
  assert.equal(two.symbol, "AAPL"); assert.equal(two.at, Date.UTC(2026, 10, 5), "the 5th, not the one-off's 3rd"); assert.ok(Math.abs(two.value - 0.1 * 50 * 0.78) < 1e-9);
  // (one whose last a year on has been already: the next to come is someone else's)
  const october = { symbol: "OCT.L", name: "October", qty: 10, cur: "GBP", divs: OCTOBER };
  assert.equal(nextDividend(itemsOf([october, tesco]), MON).symbol, "TSCO.L");
  // (nothing to come: one that's stopped paying, one that never has, and nothing held)
  assert.equal(nextDividend(itemsOf([{ symbol: "OLD.L", name: "Old", qty: 10, cur: "GBP", divs: STOPPED }, { symbol: "NONE.L", name: "None", qty: 10, cur: "GBP", divs: [] }]), MON), null);
  assert.equal(nextDividend([], MON), null);
  assert.equal(nextDividend(itemsOf([{ ...tesco, qty: 0 }]), MON), null, "none held: nothing it's worth");
  assert.equal(nextDividend([{ symbol: "X.L", name: "X", qty: 5, rate: undefined, divs: TESCO }], MON), null, "no rate to put it in pounds by");
});

test("the next dividend is what markets/app.js income() itself says is next, at moments through the year", () => {
  const all = [{ symbol: "TSCO.L", name: "Tesco", qty: 1000, cur: "GBP", divs: TESCO }, { symbol: "AAPL", name: "Apple", qty: 50, cur: "USD", divs: ONEOFF },
    { symbol: "OCT.L", name: "October", qty: 10, cur: "GBP", divs: OCTOBER }, { symbol: "OLD.L", name: "Old", qty: 10, cur: "GBP", divs: STOPPED }];
  const moments = [MON, Date.UTC(2026, 10, 4, 12), Date.UTC(2026, 10, 5, 12), Date.UTC(2026, 9, 29, 9), Date.UTC(2026, 5, 1), Date.UTC(2026, 0, 15), Date.UTC(2027, 2, 10)];
  for (const T of moments) for (const list of [all, all.slice(0, 1), all.slice(1), all.slice(2), [all[3]]]) {
    const mine = nextDividend(itemsOf(list), T), app = appNext(list, T);
    assert.ok(near(mine, app), `${new Date(T).toISOString()} ${list.map((x) => x.symbol)}: ${JSON.stringify(mine)} against the app's ${JSON.stringify(app)}`);
  }
});

test("whether a market's open, as Markets says it: London's first, then New York's, else closed", () => {
  const s = MON / 1000, hours = (a, b) => ({ open: { start: s + a * 3600, end: s + b * 3600 } });
  // (London 08:00 to 16:30; New York 14:30 to 21:00, in London's time)
  const q = { "^FTSE": hours(-1 / 6, 8 + 1 / 3), "^GSPC": hours(6 + 1 / 3, 12 + 5 / 6) };
  assert.deepEqual(marketState(q, MON), { open: true, said: "London open · closes in 8h 20m" }, "the fixtures' words");
  assert.deepEqual(marketState(q, MON + (7 * 60 + 25) * 60e3), { open: true, said: "London open · closes in 55m" });
  assert.deepEqual(marketState(q, MON + (8 * 60 + 30) * 60e3), { open: true, said: "New York open · closes in 4h 20m" }, "London shut, New York open");
  assert.deepEqual(marketState(q, MON + (12 * 60 + 10) * 60e3), { open: true, said: "New York open · closes in 40m" });
  assert.deepEqual(marketState(q, MON + 13 * 3600e3), { open: false, said: "Markets closed" });
  assert.deepEqual(marketState(q, MON - 3600e3), { open: false, said: "Markets closed" }, "before London's open");
  assert.deepEqual(marketState({}, MON), { open: false, said: "Markets closed" }, "no quotes at all");
  assert.deepEqual(marketState({ "^FTSE": { open: null }, "^GSPC": {} }, MON), { open: false, said: "Markets closed" });
  // (word for word what markets/app.js marketSaid() says, at every few minutes of the day)
  const said = new Function("S", "Date", `${fnOf("marketSaid")}\nreturn marketSaid();`);
  for (let m = -120; m < 14 * 60; m += 7) {
    const T = MON + m * 60e3, app = said({ q }, clockAt(T));
    assert.deepEqual(marketState(q, T), { open: app.open, said: app.text }, `at ${new Date(T).toISOString()}`);
  }
});

// a holding, priced, as the card has them: its quote's market, zone and when it last traded
const at = (iso) => Date.parse(iso) / 1000;
const held = (name, ex, tz, time, kind = "share") => ({ name, qty: 10, x: { ex, tz, time, price: 10, prev: 9, cur: "GBP", kind } });
const FRI_LDN = at("2026-10-30T16:35:00Z"), FRI_NY = at("2026-10-30T20:00:00Z"), FRI_TKY = at("2026-10-30T06:00:00Z");
const week = (t) => [held("Shell", "London", "Europe/London", t.ldn ?? FRI_LDN), held("Apple", "Nasdaq", "America/New_York", t.ny ?? FRI_NY), held("Microsoft", "NYSE", "America/New_York", t.ny ?? FRI_NY)];

test("the markets shut today: at a weekend in each one's own zone", () => {
  // (Saturday afternoon: Saturday in London and New York alike)
  const sat = Date.UTC(2026, 9, 31, 19, 40);
  assert.deepEqual(shutToday(week({}), sat), ["London", "New York"]);
  assert.deepEqual(wrapFigures(week({}), { GBP: 1 }, sat).shut, ["London", "New York"], "the wrap's own rule, the same");
  // (one in the morning on Saturday in London: still Friday evening in New York, which traded that day)
  assert.deepEqual(shutToday(week({}), Date.UTC(2026, 9, 31, 1, 0)), ["London"]);
  // (any other market: at its weekend only; crypto never)
  const tokyo = [held("Toyota", "Tokyo", "Asia/Tokyo", FRI_TKY), held("Bitcoin", "Crypto", "UTC", at("2026-10-29T12:00:00Z"), "crypto")];
  assert.deepEqual(shutToday(tokyo, Date.UTC(2026, 9, 31, 1, 0)), ["Tokyo"], "Saturday morning in Tokyo");
  assert.deepEqual(shutToday(tokyo, Date.UTC(2026, 10, 3, 9, 0)), [], "a Tuesday it didn't trade: not said (no calendar to say it's a holiday)");
  // (Sunday 1 November, New York's clocks gone back that morning: Sunday in both)
  assert.deepEqual(shutToday(week({}), Date.UTC(2026, 10, 1, 17, 55)), ["London", "New York"]);
});

test("the markets shut today: on a weekday only once it's clear, an hour past the usual open", () => {
  // (Monday 07:00 in London: nothing's traded yet, nor should it have)
  assert.deepEqual(shutToday(week({}), Date.UTC(2026, 10, 2, 7, 0)), []);
  assert.deepEqual(wrapFigures(week({}), { GBP: 1 }, Date.UTC(2026, 10, 2, 7, 0)).shut, ["London", "New York"], "where the wrap's rule alone would say both");
  // (a weekday 09:30 in London with nothing of London's traded today: shut (a holiday); New York, at 04:30 there, not said)
  assert.deepEqual(shutToday(week({}), Date.UTC(2026, 10, 2, 9, 30)), ["London"]);
  assert.deepEqual(shutToday(week({}), Date.UTC(2026, 10, 2, 8, 59)), [], "not before 09:00");
  assert.deepEqual(shutToday(week({}), Date.UTC(2026, 10, 2, 9, 0)), ["London"], "from 09:00");
  // (London traded today; New York before 10:30 its time: nothing said for it, then shut once it's past)
  const ldnToday = at("2026-11-02T14:00:00Z");
  assert.deepEqual(shutToday(week({ ldn: ldnToday }), Date.UTC(2026, 10, 2, 15, 0)), [], "10:00 in New York");
  assert.deepEqual(shutToday(week({ ldn: ldnToday }), Date.UTC(2026, 10, 2, 15, 29)), [], "10:29 in New York");
  assert.deepEqual(shutToday(week({ ldn: ldnToday }), Date.UTC(2026, 10, 2, 15, 30)), ["New York"], "10:30 in New York (EST, after the clocks went back)");
  // (in June, New York's 10:30 is 14:30 UTC)
  const jun = [held("Apple", "Nasdaq", "America/New_York", at("2026-06-05T20:00:00Z"))];
  assert.deepEqual(shutToday(jun, Date.UTC(2026, 5, 8, 14, 29)), []); assert.deepEqual(shutToday(jun, Date.UTC(2026, 5, 8, 14, 30)), ["New York"]);
  // (everything traded today: nothing shut)
  assert.deepEqual(shutToday(week({ ldn: ldnToday, ny: at("2026-11-02T16:00:00Z") }), Date.UTC(2026, 10, 2, 16, 0)), []);
  // (one suspended, where another of London's traded: not London shut)
  assert.deepEqual(shutToday([held("Shell", "London", "Europe/London", ldnToday), held("Suspended", "London", "Europe/London", FRI_LDN)], Date.UTC(2026, 10, 2, 15, 0)), []);
  assert.deepEqual(shutToday([], MON), []);
});

test("a holding's dividends and its year, from what's kept only: never asked for", async () => {
  const kept = {};
  const stmt = (sql) => { const s = { args: [], bind: (...a) => ((s.args = a), s), first: async () => (/FROM mk_cache/.test(sql) ? kept[s.args[0]] ?? null : null), run: async () => ({ meta: {} }), all: async () => ({ results: [] }) }; return s; };
  const later = [], env = { DB: { prepare: stmt, batch: async (l) => l.map(() => ({ results: [], meta: {} })) }, MARKETS_DATA: "https://data.test", waitUntil: (p) => later.push(p) };
  const was = globalThis.fetch;
  let asked = 0;
  globalThis.fetch = async (url) => { asked++;
    return new Response(JSON.stringify({ chart: { result: [{ meta: { currency: "GBp", symbol: "ASKED.L", regularMarketPrice: 300, previousClose: 299 }, timestamp: [day(2025, 11, 6), day(2026, 10, 30)], indicators: { quote: [{ close: [290, 300] }] }, events: { dividends: { a: { date: day(2025, 11, 6), amount: 4.32 } } } }] } })); };
  try {
    // (nothing kept: nothing, and nothing asked)
    assert.equal(await dividends(env, "NONE1.L", { kept: true }), null);
    assert.equal(await yearOf(env, "NONE1.L", { kept: true }), null);
    assert.equal(asked, 0, "nothing asked for");
    // (kept, long since: given as it was kept, still not asked for again)
    const old = Date.now() - 30 * 86400e3;
    kept["d:KEPT1.L"] = { at: old, v: JSON.stringify(TESCO) };
    kept["c:KEPT1.L:1y"] = { at: old, v: JSON.stringify({ symbol: "KEPT1.L", t: [day(2025, 11, 6), day(2026, 10, 30)], c: [2.9, 3], divs: [{ t: day(2025, 11, 6), amount: 0.0432 }], hi52: 3.1, lo52: 2.5 }) };
    assert.deepEqual(await dividends(env, "KEPT1.L", { kept: true }), TESCO);
    const y = await yearOf(env, "KEPT1.L", { kept: true });
    assert.ok(y && y.divs.length && y.hi52 === 3.1 && y.last === 3, JSON.stringify(y));
    assert.deepEqual(y.divs, yearDivs(TESCO), "its year's dividends, from all those kept");
    assert.equal(asked, 0, "still nothing asked for");
    // (an index or crypto: its history's never asked for at all)
    assert.equal(await yearOf(env, "^FTSE", { kept: true }), null);
    assert.equal(asked, 0);
    // (without kept, the same asks: so the stand-in would have been asked, were it going to be)
    await dividends(env, "ASKED.L");
    assert.equal(asked, 1, "asked for when not kept only");
    await Promise.all(later);
  } finally { globalThis.fetch = was; }
});

test("the wrap's words, shared: money and lists as Markets says them; a market's day", () => {
  assert.equal(andSaid(["London"]), "London"); assert.equal(andSaid(["London", "New York"]), "London and New York"); assert.equal(andSaid(["London", "New York", "Tokyo"]), "London, New York and Tokyo"); assert.equal(andSaid([]), "");
  assert.equal(moneySaid(43.2, "GBP"), "£43.20"); assert.equal(moneySaid(20862.41, "GBP"), "£20,862"); assert.equal(moneySaid(5, "USD"), "$5.00");
  assert.equal(dayIn("America/New_York", Date.UTC(2026, 9, 31, 1, 0)), "2026-10-30"); assert.equal(dayIn("Europe/London", Date.UTC(2026, 9, 31, 1, 0)), "2026-10-31");
});
