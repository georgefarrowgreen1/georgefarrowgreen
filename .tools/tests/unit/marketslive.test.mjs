import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { decodePrice, applyTick, priceStream, eligible } from "../../../markets/live.js";

const now = 1794225600000;
const quote = { symbol: "AAPL", ex: "Nasdaq", kind: "share", cur: "USD", price: 100, prev: 98, time: now / 1000 - 60, open: { start: now / 1000 - 3600, end: now / 1000 + 3600 } };
import { frame } from "./fixtures/marketslive.mjs";
const tick = (patch = {}) => ({ symbol: "AAPL", price: 101, currency: "USD", time: now / 1000, hours: 1, ...patch });
test("decode public Yahoo protobuf; malformed, oversized and invalid data fail closed", () => {
  assert.deepEqual(decodePrice(frame(tick())), tick());
  for (const msg of ["bad", "x".repeat(17000), '{"type":"other"}', JSON.stringify({ type: "pricing", message: "Cg0=" }), frame(tick({ price: -1 })), frame(tick({ symbol: "../AAPL" }))]) assert.equal(decodePrice(msg), null);
});
test("fresh regular quote updates values; delayed, old, wrong-currency and London ticks never become live", () => {
  const q = applyTick(quote, tick(), now);
  assert.equal(q.price, 101); assert.equal(q.chg, 3); assert.equal(q.live.source, "Yahoo Finance");
  for (const t of [tick({ time: now / 1000 - 901 }), tick({ time: now / 1000 + 11 }), tick({ currency: "GBP" }), tick({ symbol: "MSFT" }), tick({ price: Infinity })]) assert.equal(applyTick(quote, t, now), quote);
  assert.equal(applyTick(q, tick({ time: now / 1000 - 1 }), now), q);
  assert.equal(eligible({ ...quote, ex: "London", symbol: "TSCO.L" }), false);
  assert.equal(eligible({ ...quote, kind: "index" }), false);
});
test("pre/post ticks never change regular-session values, and pence are normalized exactly once", () => {
  const closed = { ...quote, open: { start: now / 1000 - 7200, end: now / 1000 - 3600 } };
  const q = applyTick(closed, tick({ hours: 2 }), now);
  assert.equal(q.price, 100); assert.equal(q.time, quote.time); assert.equal(q.extended.price, 101);
  assert.equal(q.extended.session, "post"); assert.ok(Math.abs(q.extended.chgPct - 1) < 1e-8);
  assert.equal(applyTick(closed, tick(), now), closed, "regular tick outside known session rejected");
  const crypto = { ...quote, symbol: "BTC-GBP", kind: "crypto", cur: "GBP" };
  assert.equal(applyTick(crypto, tick({ symbol: "BTC-GBP", currency: "GBp", price: 10000 }), now).price, 100);
});
test("one opt-in connection, bounded reconnect, batch updates, HTTP merge, subscriptions and teardown", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now });
  let enabled = false, visible = true, quotes = { AAPL: { ...quote } }, syms = ["AAPL"], batches = 0;
  const sockets = [];
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(s) { this.sent.push(JSON.parse(s)); }
    close() { this.readyState = 3; this.onclose?.(); }
    open() { this.readyState = 1; this.onopen?.(); }
    message(x) { this.onmessage?.({ data: frame(x) }); }
  }
  const feed = priceStream({ quotes: () => quotes, symbols: () => syms, enabled: () => enabled, visible: () => visible, Socket,
    update: (q) => { batches++; Object.assign(quotes, q); } });
  feed.sync(); assert.equal(sockets.length, 0);
  enabled = true; feed.sync(); feed.sync(); assert.equal(sockets.length, 1);
  const ws = sockets[0]; ws.open(); assert.deepEqual(ws.sent[0], { subscribe: ["AAPL"] });
  ws.message(tick()); ws.message(tick({ price: 102 }));
  assert.equal(batches, 0); t.mock.timers.tick(250); assert.equal(batches, 1); assert.equal(quotes.AAPL.price, 102);
  assert.equal(feed.merge({ AAPL: quote }).AAPL.price, 102, "older polling response cannot overwrite stream");
  assert.equal(feed.merge({ AAPL: { ...quote, price: 103, time: now / 1000 + 1 } }).AAPL.price, 103);
  const late = ws.onmessage;
  ws.close(); t.mock.timers.tick(1999); assert.equal(sockets.length, 1); t.mock.timers.tick(1); assert.equal(sockets.length, 2);
  sockets[1].open(); quotes.MSFT = { ...quote, symbol: "MSFT" }; syms = ["MSFT"]; feed.sync(); assert.deepEqual(sockets[1].sent.at(-2), { unsubscribe: ["AAPL"] });
  visible = false; feed.sync(); late({ data: frame(tick({ price: 999 })) }); t.mock.timers.tick(120000);
  assert.equal(sockets.length, 2); assert.equal(quotes.AAPL.price, 102);
  assert.equal(feed.merge({ AAPL: quote }).AAPL.price, 100, "stopped feed holds no account's ticks");
  feed.stop();
});
