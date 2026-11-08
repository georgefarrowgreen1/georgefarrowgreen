import { test } from "node:test";
import assert from "node:assert/strict";
import { readChart } from "../../../functions/_markets.js";
import { quoteSession } from "../../../markets/session.js";

const regular = { start: 1793975400, end: 1793998800 };
function source(currency = "USD", time = regular.end - 60) {
  return { chart: { result: [{ meta: {
    symbol: "TEST", currency, regularMarketPrice: 100, regularMarketTime: time, previousClose: 98,
    currentTradingPeriod: { pre: { start: regular.start - 3600, end: regular.start }, regular, post: { start: regular.end, end: regular.end + 3600 } },
  }, timestamp: [regular.start - 600, regular.start, regular.end - 60, regular.end, regular.end + 60, regular.end + 120],
  indicators: { quote: [{ close: [99, 98, 100, 101, 102, null] }] } }] } };
}
test("after-hours prices are separate; charts and regular quotes keep their regular-session values", () => {
  const q = readChart(source(), "TEST", true);
  assert.equal(q.price, 100);
  assert.equal(q.prev, 98);
  assert.deepEqual(q.c, [98, 100]);
  assert.deepEqual(q.t, [regular.start, regular.end - 60]);
  assert.equal(q.extended.session, "post");
  assert.equal(q.extended.price, 102);
  assert.equal(q.extended.time, regular.end + 60);
  assert.ok(Math.abs(q.extended.chgPct - 2) < 1e-8);
  const pence = readChart(source("GBp"), "TEST", true);
  assert.equal(pence.price, 1);
  assert.equal(pence.extended.price, 1.02);
});
test("pre-market quote uses the prior close; absent and older extended quotes are not invented", () => {
  const j = source("USD", regular.start - 86400);
  const r = j.chart.result[0];
  r.timestamp = [regular.start - 600]; r.indicators.quote[0].close = [99];
  const q = readChart(j, "TEST", true);
  assert.equal(q.price, 100);
  assert.equal(q.extended.session, "pre");
  assert.equal(q.extended.price, 99);
  assert.deepEqual(q.c, []);
  assert.equal(readChart(j, "TEST").extended, null, "historical ranges do not extract extended quotes");
  r.meta.regularMarketTime = regular.start;
  assert.equal(readChart(j, "TEST", true).extended, null);
  delete r.meta.currentTradingPeriod;
  assert.equal(readChart(j, "TEST", true).extended, null);
});
test("closed, open, delayed and continuously traded prices have truthful labels and quote timestamps", () => {
  const q = { ...readChart(source(), "TEST", true), tz: "America/New_York" };
  const px = (_, p) => `$${p}`, pct = (p) => `${p.toFixed(2)}%`;
  const closed = quoteSession(q, px, pct, (regular.end + 600) * 1000);
  assert.match(closed, /Closed · Last regular-session price/);
  assert.match(closed, /After-hours · \$102 \(2.00% vs close\)/);
  assert.match(closed, /Nov/);
  assert.doesNotMatch(quoteSession(q, px, pct, (regular.start + 600) * 1000), /Closed|After-hours/);
  assert.match(quoteSession({ ...q, stale: true }, px, pct, (regular.end + 86400) * 1000), /Prices delayed/);
  assert.doesNotMatch(quoteSession({ ...q, kind: "crypto" }, px, pct, (regular.end + 86400) * 1000), /Closed|After-hours/);
  assert.match(quoteSession({ ...q, open: null, extended: null }, px, pct), /Last quoted price/);
});
