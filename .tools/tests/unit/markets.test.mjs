// Markets (functions/_markets.js, markets/): names said as people say them, London's pence in pounds, a chart answer read
// whole (its points, its day, its year, its dividends), and the app's files all kept for offline
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { plainName, readChart, cleanSymbol } from "../../../functions/_markets.js";

test("company names, as people say them", () => {
  assert.equal(plainName("Rolls-Royce Holdings plc"), "Rolls-Royce");
  assert.equal(plainName("ROLLS-ROYCE HOLDINGS PLC ORD SH"), "Rolls-Royce");
  assert.equal(plainName("Arm Holdings plc American Depositary Shares"), "Arm");
  assert.equal(plainName("Apple Inc."), "Apple");
  assert.equal(plainName("Alphabet Inc. Class A"), "Alphabet");
  assert.equal(plainName("BP p.l.c."), "BP");
  assert.equal(plainName("Vanguard S&P 500 UCITS ETF"), "Vanguard S&P 500 UCITS ETF");
  assert.equal(plainName("", "AAPL"), "AAPL");
});

test("symbols: as markets write them, and nothing else", () => {
  assert.equal(cleanSymbol(" rr.l "), "RR.L");
  assert.equal(cleanSymbol("^FTSE"), "^FTSE");
  assert.equal(cleanSymbol("BTC-USD"), "BTC-USD");
  assert.equal(cleanSymbol("USDGBP=X"), "USDGBP=X");
  for (const bad of ["", "AAPL;DROP", "../x", "A B", "x".repeat(30)]) assert.throws(() => cleanSymbol(bad), /symbol/);
});

test("a chart answer: London's pence in pounds, the day, the year and the dividends", () => {
  const now = 1793300000;
  const j = { chart: { result: [{
    meta: { currency: "GBp", symbol: "RR.L", exchangeName: "LSE", instrumentType: "EQUITY", regularMarketPrice: 894, previousClose: 877.4, chartPreviousClose: 877.4,
      fiftyTwoWeekHigh: 912, fiftyTwoWeekLow: 502, regularMarketDayHigh: 898, regularMarketDayLow: 874, longName: "Rolls-Royce Holdings plc", regularMarketTime: now,
      exchangeTimezoneName: "Europe/London", currentTradingPeriod: { regular: { start: now - 3600, end: now + 3600 } } },
    timestamp: [now - 600, now - 300, now - 1], events: { dividends: { [now - 86400]: { amount: 6, date: now - 86400 } } },
    indicators: { quote: [{ close: [880, null, 893] }] } }] } };
  const c = readChart(j, "RR.L");
  assert.equal(c.cur, "GBP");
  assert.equal(c.name, "Rolls-Royce");
  assert.equal(c.ex, "London");
  assert.equal(c.price, 8.94);
  assert.equal(c.prev, 8.774);
  assert.equal(c.hi52, 9.12);
  assert.equal(c.lo52, 5.02);
  assert.deepEqual(c.c, [8.8, 8.93], "a missing point left out");
  assert.deepEqual(c.t, [now - 600, now - 1]);
  assert.deepEqual(c.divs, [{ t: now - 86400, amount: 0.06 }]);
  assert.deepEqual(c.open, { start: now - 3600, end: now + 3600 });
  assert.equal(readChart({ chart: { result: null, error: { code: "Not Found" } } }, "NOPE"), null);
});

test("Bitcoin is Bitcoin, in dollars", () => {
  const c = readChart({ chart: { result: [{ meta: { currency: "USD", symbol: "BTC-USD", exchangeName: "CCC", instrumentType: "CRYPTOCURRENCY", regularMarketPrice: 97420, previousClose: 94770, longName: "Bitcoin USD" }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }, "BTC-USD");
  assert.equal(c.name, "Bitcoin");
  assert.equal(c.cur, "USD");
  assert.equal(c.price, 97420);
});

test("the service worker keeps every one of the app's files, for offline", () => {
  const dir = new URL("../../../markets/", import.meta.url);
  const kept = new Set(JSON.parse(`[${/const FILES = \[([^\]]*)\]/.exec(readFileSync(new URL("sw.js", dir), "utf8"))[1]}]`));
  for (const f of [...readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "sw.js"), "styles.css", "./", "manifest.webmanifest", "icon.svg", "inflite.svg"]) assert.ok(kept.has(f), `${f} isn't kept by sw.js`);
});
