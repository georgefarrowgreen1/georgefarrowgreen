// Markets (functions/_markets.js, markets/): names said as people say them, investment trusts told apart, London's pence in pounds, a chart answer read
// whole (its points, its day, its year, its dividends), the prices kept while their source is down, a sale checked against what was held on its day,
// the evening wrap's day from what traded that day, a story read only where the news gave it (and its redirects each checked), a page that stalls
// or a picture too big given up on without harm, the source asked a few at a time without rounds, and the app's files all kept for offline
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { plainName, readChart, cleanSymbol, kindOf, topicOf, readPreview, marketWide, chart, quotes, pooled, oversold, planBuy, wrapFigures, story, storyKey, storyKeyOk, picture, fewAtATime } from "../../../functions/_markets.js";

test("company names, as people say them", () => {
  assert.equal(plainName("Rolls-Royce Holdings plc"), "Rolls-Royce");
  assert.equal(plainName("ROLLS-ROYCE HOLDINGS PLC ORD SH"), "Rolls-Royce");
  assert.equal(plainName("Arm Holdings plc American Depositary Shares"), "Arm");
  assert.equal(plainName("Apple Inc."), "Apple");
  assert.equal(plainName("Alphabet Inc. Class A"), "Alphabet");
  assert.equal(plainName("BP p.l.c."), "BP");
  assert.equal(plainName("Vanguard S&P 500 UCITS ETF"), "Vanguard S&P 500 UCITS ETF");
  assert.equal(plainName("", "AAPL"), "AAPL");
  assert.equal(plainName("JPMorgan Chase &amp; Co."), "JPMorgan Chase", "Yahoo's &amp; read as &, and one left at the end dropped");
  assert.equal(plainName("Procter &amp; Gamble Company"), "Procter & Gamble");
  assert.equal(plainName("AT&amp;T Inc."), "AT&T");
  assert.equal(plainName("Marks &#38; Spencer Group plc"), "Marks & Spencer");
});

test("investment trusts, told from shares and funds", () => {
  assert.equal(kindOf("EQUITY", "Scottish Mortgage Investment Trust PLC", "SMT.L"), "trust");
  assert.equal(kindOf("EQUITY", "Polar Capital Technology Trust PLC", "PCT.L"), "trust");
  assert.equal(kindOf("EQUITY", "Lowland Investment Company plc", "LWI.L"), "trust");
  assert.equal(kindOf("EQUITY", "Bluefield Solar Income Fund Limited", "BSIF.L"), "trust");
  assert.equal(kindOf("EQUITY", "Alliance Witan PLC", "ALW.L"), "trust", "a well-known one whose name doesn't say so");
  assert.equal(kindOf("EQUITY", "Secure Trust Bank PLC", "STB.L"), "share", "a bank with Trust in its name");
  assert.equal(kindOf("EQUITY", "Trustpilot Group plc", "TRST.L"), "share");
  assert.equal(kindOf("EQUITY", "Northern Trust Corporation", "NTRS"), "share", "only London's");
  assert.equal(kindOf("ETF", "Vanguard S&P 500 UCITS ETF", "VUSA.L"), "fund");
  assert.equal(kindOf("MUTUALFUND", "Vanguard LifeStrategy 80% Equity", "0P0000TKZO.L"), "fund");
  assert.equal(kindOf("INDEX", "FTSE 100", "^FTSE"), "index");
  assert.equal(plainName("Scottish Mortgage Investment Trust PLC"), "Scottish Mortgage");
  assert.equal(plainName("The City of London Investment Trust plc"), "City of London");
  assert.equal(plainName("Polar Capital Technology Trust PLC"), "Polar Capital Technology Trust");
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

test("a dividend a hundred times out (pence said as pounds) is put right; a real one's kept", () => {
  const now = 1_760_000_000, j = (amount) => ({ chart: { result: [{ meta: { currency: "GBp", symbol: "ISF.L", regularMarketPrice: 850 },
    timestamp: [now - 200 * 86400, now - 100 * 86400, now], indicators: { quote: [{ close: [800, 820, 850] }] },
    events: { dividends: { a: { amount, date: now - 150 * 86400 } } } }] } });
  assert.deepEqual(readChart(j(980), "ISF.L").divs, [{ t: now - 150 * 86400, amount: 0.098 }], "980 (pence) on a price of 800 is 9.8p");
  assert.deepEqual(readChart(j(9.8), "ISF.L").divs, [{ t: now - 150 * 86400, amount: 0.098 }]);
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

test("a trust's or fund's market, from its name: where its news comes from when nothing's filed under it", () => {
  assert.equal(topicOf("JPMorgan American", "trust"), "US");
  assert.equal(topicOf("Vanguard S&P 500 UCITS ETF", "fund"), "US");
  assert.equal(topicOf("iShares Core FTSE 100 UCITS ETF GBP (Dist)", "fund"), "UK");
  assert.equal(topicOf("City of London", "trust"), "UK");
  assert.equal(topicOf("Vanguard FTSE All-World UCITS ETF", "fund"), "WORLD", "the world's, though FTSE's");
  assert.equal(topicOf("Murray International", "trust"), "WORLD");
  assert.equal(topicOf("Scottish Mortgage", "trust"), null, "nothing in its name to say");
  assert.equal(topicOf("JPMorgan Chase & Co.", "share"), null, "a company's own stories are its own");
});

test("a story's page, as it describes itself for link previews", () => {
  const html = `<html><head><title>Ignored when there's more</title><meta property="og:site_name" content="Barron&#39;s"><meta content="Okta Stock Can Find More Buyers &amp; More" property="og:title">
    <meta name="description" content="Funds that follow the index will need to buy its shares.  Here&rsquo;s why."><meta property="og:image" content="/img/okta.jpg?w=800&amp;h=450">
    <meta property="article:published_time" content="2026-10-30T21:20:00Z"></head><body><meta property="og:title" content="not this one"></body></html>`;
  assert.deepEqual(readPreview(html, "https://www.barrons.com/articles/okta-sp-500-1"), { title: "Okta Stock Can Find More Buyers & More", summary: "Funds that follow the index will need to buy its shares. Here’s why.",
    image: "https://www.barrons.com/img/okta.jpg?w=800&h=450", site: "Barron's", at: Date.parse("2026-10-30T21:20:00Z") });
  const bare = readPreview("<head><title>Just a title</title><meta property='og:image' content='http://insecure.example/a.png'></head>", "https://news.example.co.uk/x");
  assert.deepEqual(bare, { title: "Just a title", summary: null, image: null, site: "news.example.co.uk", at: null }, "a picture over plain http: none");
  const long = readPreview(`<meta name="description" content="${"word ".repeat(200)}">`, "https://a.example/");
  assert.ok(long.summary.length <= 421 && long.summary.endsWith("…") && !/\s…$/.test(long.summary), "a long summary cut at a word");
  assert.equal(readPreview(`<meta property="og:title" content="Same"><meta property="og:description" content="Same">`, "https://a.example/").summary, null, "a summary that's the headline again: none");
});

test("a market's stories about the market: one company's stories left out unless it's yours, or about an index", () => {
  const n = (title, tickers) => ({ title, tickers });
  assert.equal(marketWide(n("Was There Any Sign ADT Stock Would Run?", ["ADT"])), false);
  assert.equal(marketWide(n("Did The Market Read AppLovin Stock Right?", ["APP"])), false);
  assert.equal(marketWide(n("Okta Stock Can Find More Buyers as It Joins the S&P 500", ["OKTA"])), true, "joining the index is the index's news");
  assert.equal(marketWide(n("US stocks fall as chipmakers slide", [])), true);
  assert.equal(marketWide(n("Nvidia and AMD lead chip stocks lower", ["NVDA", "AMD"])), true, "more than one company: the market's");
  assert.equal(marketWide(n("Futures slip ahead of the Fed", ["^GSPC", "ES=F"])), true, "indices aren't companies");
  assert.equal(marketWide(n("Did The Market Read AppLovin Stock Right?", ["APP"]), new Set(["APP"])), true, "yours: kept");
});

test("while the prices' source is down, what's kept is given (said as stale), and it isn't asked again on every request", async () => {
  const stmt = { bind: () => stmt, first: async () => null, run: async () => ({ meta: {} }), all: async () => ({ results: [] }), raw: async () => [] };
  const env = { DB: { prepare: () => stmt, batch: async (l) => l.map(() => ({ results: [], meta: {} })), exec: async () => ({}) }, MARKETS_DATA: "https://data.test" };
  const was = { now: Date.now, fetch: globalThis.fetch };
  let asked = 0, down = false, now = 1_800_000_000_000;
  Date.now = () => now;
  globalThis.fetch = async () => { asked++; if (down) throw new Error("down");
    return new Response(JSON.stringify({ chart: { result: [{ meta: { currency: "USD", symbol: "KEPT", regularMarketPrice: 10, previousClose: 9 }, timestamp: [1, 2], indicators: { quote: [{ close: [9, 10] }] } }] } })); };
  try {
    assert.equal((await chart(env, "KEPT", "1d")).stale, undefined);
    now += 61e3; down = true;
    assert.equal((await chart(env, "KEPT", "1d")).stale, true, "a minute on, the source down: the last one, said as stale");
    now += 5e3;
    const c = await chart(env, "KEPT", "1d");
    assert.equal(c.stale, true); assert.equal(c.price, 10); assert.equal(asked, 2, "and for a minute, given without asking again");
    now += 60e3; await chart(env, "KEPT", "1d");
    assert.equal(asked, 3, "then asked again");
    await assert.rejects(chart(env, "NONE", "1d"), /aren’t available/);
    await assert.rejects(chart(env, "NONE", "1d"), /aren’t available/);
    assert.equal(asked, 4, "nothing kept: the failure kept a few seconds, not asked for on every request");
    now += 61e3;
    const q = await quotes(env, ["KEPT", "NONE"], now - 1);
    assert.deepEqual(Object.keys(q), ["KEPT"]); assert.equal(q.KEPT.stale, true); assert.equal(asked, 4, "a request that's waited long enough: what's kept, without asking");
    down = false; now += 61e3;
    assert.equal((await chart(env, "KEPT", "1d")).stale, undefined, "back: fresh again");
  } finally { Date.now = was.now; globalThis.fetch = was.fetch; }
});

test("a sale, checked against what was held on its day, and every sale after it", () => {
  const JAN = Date.UTC(2026, 0, 10), FEB = Date.UTC(2026, 1, 10), MAR = Date.UTC(2026, 2, 10), held = { qty: 20, cost: 5, since: null, added: MAR, buys: 2 };
  const buys = [{ id: 1, qty: 10, price: 5, at: JAN }, { id: 2, qty: 10, price: 6, at: MAR }];
  // (as it was: 20 owned today, so a sale of 15 in February passed, and only 10 came out)
  assert.equal(pooled([...buys.slice(0, 1), { qty: -15, at: FEB }, buys[1]]).qty, 10);
  const feb = { qty: -15, price: 7, at: FEB }, short = planBuy(buys, held, feb).short;
  assert.equal(short?.b, feb, "15 sold in February, when 10 were held: refused"); assert.equal(short.had, 10);
  assert.equal(planBuy(buys, held, { qty: -10, price: 7, at: FEB }).short, null, "10 then: fine");
  assert.equal(planBuy(buys, held, { qty: -20, price: 7, at: Date.UTC(2026, 3, 1) }).short, null, "and all 20 after March's");
  // (one that would leave a later sale short)
  const sold = [...buys.slice(0, 1), { id: 3, qty: -10, price: 8, at: MAR }], s2 = planBuy(sold, { ...held, qty: 0 }, { qty: -5, price: 7, at: FEB }).short;
  assert.equal(s2?.b, sold[1], "5 sold in February leaves too few for March's 10"); assert.equal(s2.had, 5);
  // (a buy taken off that a later sale needs)
  assert.ok(oversold(sold.filter((b) => b.id !== 1)).short > oversold(sold).short, "January's buy taken off: March's sale short");
  assert.equal(oversold(buys.filter((b) => b.id !== 2)).short, 0, "March's buy, with nothing sold: fine");
  // (a shortfall from before sales were checked is no reason to refuse another that's fine)
  const old = [{ id: 1, qty: 10, at: JAN }, { id: 2, qty: -15, at: FEB }];
  assert.equal(planBuy(old, held, { qty: 5, price: 6, at: MAR }).short, null);
});

test("the first buy recorded keeps the shares already said where they were bought; a sale before then moves them back to its day", () => {
  const MAY24 = Date.UTC(2024, 4, 1), JAN23 = Date.UTC(2023, 0, 1), held = { qty: 100, cost: 2, since: MAY24, added: Date.UTC(2025, 0, 1) };
  const { start } = planBuy([], held, { qty: 50, price: 1.5, at: JAN23 });
  assert.deepEqual(start, { qty: 100, price: 2, at: MAY24 }, "an older buy of 50: the 100 still from May 2024");
  assert.equal(planBuy([], held, { qty: -20, price: 3, at: JAN23 }).start.at, JAN23, "a sale dated before them: they're moved back, so there were some to sell");
  assert.equal(planBuy([], { ...held, since: null }, { qty: 5, price: 3, at: Date.UTC(2026, 0, 1) }).start.at, held.added, "no day said: the day it was added");
  assert.equal(planBuy([], { ...held, qty: 0 }, { qty: 5, price: 3, at: JAN23 }).start, null, "none said: nothing to keep");
});

test("the evening wrap: the day from what traded today; a market shut for its holiday adds nothing, and is said", () => {
  const t = Date.UTC(2026, 10, 26, 17, 0), was = Date.UTC(2026, 10, 25, 21, 0) / 1000, now = Date.UTC(2026, 10, 26, 16, 30) / 1000;   // (Thanksgiving)
  const q = (ex, tz, time, price, prev, extra = {}) => ({ ex, tz, time, price, prev, cur: "GBP", kind: "share", ...extra });
  const held = [{ name: "Shell", qty: 100, x: q("London", "Europe/London", now, 30, 29) }, { name: "Apple", qty: 10, x: q("Nasdaq", "America/New_York", was, 200, 180) },
    { name: "Bitcoin", qty: 0.01, x: q("Crypto", "UTC", now - 60, 60000, 59000, { kind: "crypto" }) }];
  const F = wrapFigures(held, { GBP: 1 }, t);
  assert.equal(F.total, 100 + 10, "Shell's £100 and Bitcoin's £10; not Apple's £200, Wednesday's");
  assert.equal(F.top.name, "Shell"); assert.deepEqual(F.shut, ["New York"]);
  assert.equal(F.value, 3000 + 2000 + 600); assert.ok(Math.abs(F.pct - (110 / (5600 - 110)) * 100) < 1e-9);
  // (one holding that didn't trade, where another there did: not its market shut)
  const sus = [held[0], { name: "Suspended", qty: 10, x: q("London", "Europe/London", was, 5, 4) }];
  assert.deepEqual(wrapFigures(sus, { GBP: 1 }, t).shut, []); assert.equal(wrapFigures(sus, { GBP: 1 }, t).total, 100);
});

test("a story's page read only where Markets's news gave it, its redirects each checked as the first was", async () => {
  // (the server's secret, from pg_meta; nothing else kept)
  const stmt = (sql) => { const st = { bind: () => st, first: async () => (/pg_meta/.test(sql) ? { v: "a-test-secret" } : null), run: async () => ({ meta: {} }), all: async () => ({ results: [] }), raw: async () => [] }; return st; };
  const env = { DB: { prepare: stmt, batch: async (l) => l.map(() => ({ results: [], meta: {} })), exec: async () => ({}) } };
  const link = "https://news.example.com/a?x=1", k = await storyKey(env, link);
  assert.equal(k.length, 32); assert.equal(await storyKeyOk(env, link, k), true);
  assert.equal(await storyKeyOk(env, "https://evil.example.net/", k), false, "another address with it: refused");
  assert.equal(await storyKeyOk(env, link, null), false); assert.equal(await storyKeyOk(env, link, k.replace(/^./, (c) => (c === "A" ? "B" : "A"))), false);
  const was = globalThis.fetch, asked = [];
  const pages = { "https://news.example.com/a": [301, "https://www.example.org/story"], "https://www.example.org/story": [200],
    "https://news.example.com/b": [302, "https://10.0.0.1/inside"], "https://news.example.com/c": [302, "http://www.example.org/story"], "https://news.example.com/d": [302, "https://news.example.com/d"] };
  globalThis.fetch = async (url, init) => {
    asked.push(url); assert.equal(init.redirect, "manual", "never followed by itself");
    const [status, to] = pages[url] || [404];
    return status === 200 ? new Response('<html><head><meta property="og:title" content="It moved"><meta property="og:description" content="What it says."></head>', { headers: { "Content-Type": "text/html" } })
      : new Response(null, { status, headers: to ? { Location: to } : {} });
  };
  try {
    assert.equal((await story(env, "https://news.example.com/a"))?.summary, "What it says.", "a redirect to another https page: followed, and read");
    assert.equal(await story(env, "https://news.example.com/b"), null, "to an address by number: not followed");
    assert.ok(!asked.includes("https://10.0.0.1/inside"));
    assert.equal(await story(env, "https://news.example.com/c"), null, "to plain http: not followed");
    assert.equal(await story(env, "https://news.example.com/d"), null, "round and round: given up on");
    assert.equal(asked.filter((u) => u === "https://news.example.com/d").length, 5);
  } finally { globalThis.fetch = was; }
});

test("a story's page that stalls part way, read for what came; a picture too big, never read whole", async () => {
  const stmt = { bind: () => stmt, first: async () => null, run: async () => ({ meta: {} }), all: async () => ({ results: [] }), raw: async () => [] };
  const env = { DB: { prepare: () => stmt, batch: async (l) => l.map(() => ({ results: [], meta: {} })), exec: async () => ({}) } };
  const enc = new TextEncoder(), was = globalThis.fetch;
  // (a body that gives what it has, then fails, as one cut off by its six seconds does)
  const stalls = (first) => new ReadableStream({ pull(c) { if (first) { c.enqueue(enc.encode(first)); first = null; } else c.error(new Error("The operation was aborted due to timeout")); } });
  let pulled = 0;
  const pages = {
    "https://news.example.com/half": () => new Response(stalls('<html><head><meta property="og:title" content="Half a page"><meta property="og:description" content="What came."><script>'), { headers: { "Content-Type": "text/html" } }),
    "https://news.example.com/none": () => new Response(stalls("<html><he"), { headers: { "Content-Type": "text/html" } }),
    "https://s.yimg.com/said-big.jpg": () => new Response("x", { headers: { "Content-Type": "image/jpeg", "Content-Length": "9000000" } }),
    "https://s.yimg.com/big.jpg": () => new Response(new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(1e6)); } }), { headers: { "Content-Type": "image/jpeg" } }),
    "https://s.yimg.com/small.png": () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }),
  };
  globalThis.fetch = async (url) => (pages[url] || (() => new Response(null, { status: 404 })))();
  try {
    const half = await story(env, "https://news.example.com/half");
    assert.equal(half?.title, "Half a page"); assert.equal(half.summary, "What came.");
    assert.equal(await story(env, "https://news.example.com/none"), null, "nothing came that says anything: nothing (kept as such, not an error)");
    assert.equal(await picture(env, "https://s.yimg.com/said-big.jpg"), null, "one that says it's over 3 MB: refused unread");
    assert.equal(await picture(env, "https://s.yimg.com/big.jpg"), null, "one that's over 3 MB as it comes: given up on");
    assert.ok(pulled <= 5, `read no further than 3 MB (${pulled} MB)`);
    const small = await picture(env, "https://s.yimg.com/small.png");
    assert.equal(small?.type, "image/png"); assert.deepEqual([...new Uint8Array(small.body)], [137, 80, 78, 71]);
  } finally { globalThis.fetch = was; }
});

test("asked a few at a time: the next as each is done, not in rounds; answers in the list's order", async () => {
  let running = 0, most = 0, done = 0, beforeSlow = null;
  const waits = [150, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  const got = await fewAtATime(waits, async (ms, i) => { running++; most = Math.max(most, running); await new Promise((ok) => setTimeout(ok, ms)); running--; if (i === 0) beforeSlow = done; done++; return i * 2; }, 3);
  assert.deepEqual(got, waits.map((_, i) => i * 2));
  assert.equal(most, 3, "never more than three at once");
  assert.equal(beforeSlow, 9, "the slow one held up none of the others (in rounds, all but two would have waited on it)");
  assert.deepEqual(await fewAtATime([], async () => 1), []);
});

test("a price slow past its request's time: what's kept given meanwhile, and the answer, once it comes, kept for the next", async () => {
  const stmt = { bind: () => stmt, first: async () => null, run: async () => ({ meta: {} }), all: async () => ({ results: [] }), raw: async () => [] };
  const later = [], env = { DB: { prepare: () => stmt, batch: async (l) => l.map(() => ({ results: [], meta: {} })), exec: async () => ({}) }, MARKETS_DATA: "https://data.test", MARKETS_TTL: 0, waitUntil: (p) => later.push(p) };
  const was = globalThis.fetch;
  let slow = 0, price = 10;
  globalThis.fetch = async () => { const p = price; if (slow) await new Promise((ok) => setTimeout(ok, slow));
    return new Response(JSON.stringify({ chart: { result: [{ meta: { currency: "USD", symbol: "SLOW", regularMarketPrice: p, previousClose: 9 }, timestamp: [1, 2], indicators: { quote: [{ close: [9, p] }] } }] } })); };
  try {
    assert.equal((await quotes(env, ["SLOW"])).SLOW.price, 10);
    slow = 80; price = 11;
    const n0 = later.length, q = await quotes(env, ["SLOW"], Date.now() + 20);
    assert.equal(q.SLOW.price, 10); assert.equal(q.SLOW.stale, true, "by its time: the last one, said as stale");
    assert.equal(later.length - n0, 1, "the one still on its way carried on past the answer (waitUntil)");
    await later.at(-1); await Promise.all(later);
    assert.equal((await quotes(env, ["SLOW"], Date.now() - 1)).SLOW.price, 11, "and once it came, kept: the next request's");
  } finally { globalThis.fetch = was; }
});
