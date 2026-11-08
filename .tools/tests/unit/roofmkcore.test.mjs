// Markets' core under the roof keeps in step with Markets' own page (One roof stage 2, spec S2-D1, S2-D2, S2-D4, S2-D9,
// §4.2, §9.1 MK): app.js's sums (formatters, your money, income, the ISA, the day's series, the markets' state, what's
// worth knowing, the news' groups) are taken out of markets/app.js by their own lines and run beside
// markets/roof/core.js's ports on the same account (fixtures/mk.mjs); the 15-second prices run only between shown(true)
// and shown(false), and only while the page is visible; start(A) → stop → start(B) keeps nothing of A; a kept copy is
// drawn only for its own account; a 401 stops Markets only once the framework says the sign-in is gone.
//   node --test .tools/tests/unit/roofmkcore.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { account, stateOf, memStorage, marketsApi, fakeFw } from "./fixtures/mk.mjs";

globalThis.localStorage = memStorage();
const NET = { acc: null, status: 0, down: false };
const api = marketsApi(NET);
globalThis.fetch = api.fetch;

const MK = new URL("../../../markets/", import.meta.url);
const core = await import(new URL("roof/core.js", MK));
const C = await import(new URL("charts.js", MK));
const INC = await import(new URL("income.js", MK));
const { storiesOf } = await import(new URL("stories.js", MK));
const APP = readFileSync(new URL("app.js", MK), "utf8");

// ---- app.js's own sums: its lines from one marker to the next, run with an S of their own ----
function cut(from, to) {
  const a = APP.search(from), b = APP.slice(a + 1).search(to) + a + 1;
  assert.ok(a >= 0 && b > a, `app.js has ${from} … ${to}`);
  return APP.slice(a, b);
}
function appOwn(S) {
  const src = [
    cut(/^const INDICES = /m, /^const \$ = /m),
    cut(/^const store = \{/m, /^\/\/ \(the Income sheet's plan/m),
    cut(/^\/\/ ---- saying numbers ----/m, /^\/\/ said again where it shows/m),
    cut(/^\/\/ ---- what's worth knowing ----/m, /^\/\/ ---- the screens ----/m),
    cut(/^const TOPIC_NAME = /m, /^function newsBrief\(/m),
    cut(/^const newsHidden = /m, /^\/\/ what's new since you last looked/m),
    cut(/^async function rangeSeries\(/m, /^function rangeSaid\(/m),
    cut(/^const dayKey = /m, /^\/\/ Your year against the market: what you own now/m),
  ].join("\n");
  const names = ["INDICES", "INDEX_NAMES", "MARKET_OF", "BENCHES", "ACCOUNTS", "PRANGES", "RANGES", "fmt", "money", "signed", "pct", "tone", "isIndex", "kindOf", "digits", "priceSaid", "chgSaid", "priceIn", "penceMeant",
    "nameOf", "plainSym", "ago", "plural", "and2", "rate", "owned", "valueOf", "dayOf", "divsOf", "paidFor", "unpriced", "leftOutSaid", "totals", "byAccount", "income", "divHistory", "gotAll", "received",
    "taxMonths", "growthOf", "monthSaid", "aroundDay", "aroundMonth", "isaYear", "tracksIsa", "daySeries", "marketSaid", "clock", "oldSaid", "lineSaid", "pricesAtSaid", "insights", "newsKey", "aboutIt",
    "sansStop", "newsSeen", "newsGroups", "rangeSeries", "dayKey"];
  const stub = () => null;
  const f = new Function("S", "C", "A", "h", "markDivs", "health", "project", "taxYearOf", "csv", "yearDivs", "yearOn", "storiesOf", "openSheet", "incomeView", "isaView", "go",
    `${src}\nreturn { ${names.join(", ")} };`);
  return f(S, C, core.A, stub, INC.marked, INC.health, INC.project, INC.taxYearOf, INC.csv, INC.yearDivs, INC.yearOn, storiesOf, stub, stub, stub, stub);
}
// both on the same account: core.S filled in place, app.js's S a copy
function both(acc = account()) {
  const st = stateOf(acc);
  for (const k of Object.keys(core.S)) if (!(k in st)) delete core.S[k];
  Object.assign(core.S, structuredClone({ ...st, charts: null }), { charts: new Map() });
  const S = structuredClone({ ...st, charts: null }); S.charts = new Map(); S.tab = "today";
  return { S, app: appOwn(S) };
}
// (holdings said by their symbols, so the two sides' objects compare)
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === "x" && x?.symbol ? x.symbol : x instanceof Map ? [...x] : x)));

test("formatters, said as app.js says them (prices in pence, indices, crypto, typed prices)", () => {
  const { app } = both();
  const qs = [{ price: 0.523, cur: "GBP" }, { price: 3.12, cur: "GBP" }, { price: 8120.5, cur: "GBP", type: "INDEX" }, { price: 68000, cur: "USD", type: "CRYPTOCURRENCY" }, { price: 1234.5, cur: "EUR" }, { price: 12.5, cur: "JPY" }, { price: 2, cur: "CHF" }];
  for (const q of qs) { assert.equal(core.priceSaid(q), app.priceSaid(q), JSON.stringify(q)); assert.equal(core.chgSaid({ ...q, chg: 0.012 }), app.chgSaid({ ...q, chg: 0.012 })); }
  for (const v of [-12345.678, 0, 0.004, 99.995, 1e6]) { assert.equal(core.money(v), app.money(v)); assert.equal(core.signed(v), app.signed(v)); assert.equal(core.pct(v), app.pct(v)); assert.equal(core.tone(v), app.tone(v)); }
  for (const [s, q] of [["52p", { cur: "GBP" }], ["£1,234.50", { cur: "GBP" }], ["", {}], ["x", {}]]) assert.deepEqual(core.priceIn(s, q), app.priceIn(s, q));
  assert.equal(core.penceMeant(52, { cur: "GBP", price: 0.5 }, "52"), app.penceMeant(52, { cur: "GBP", price: 0.5 }, "52"));
  for (const s of ["TSCO.L", "^FTSE", "AAPL"]) assert.equal(core.plainSym(s), app.plainSym(s));
  assert.equal(core.and2(["a", "b", "c"]), app.and2(["a", "b", "c"]));
});

test("your money: totals, accounts, what's left out, the day's series and the markets' state, as app.js has them", () => {
  const { app } = both();
  assert.deepEqual(plain(core.totals()), plain(app.totals()));
  assert.deepEqual(plain(core.byAccount()), plain(app.byAccount()));
  assert.deepEqual(core.unpriced().map((x) => x.symbol), app.unpriced().map((x) => x.symbol));
  assert.equal(core.leftOutSaid(), app.leftOutSaid());
  assert.match(core.leftOutSaid(), /Gone Ltd isn't in this total/);
  assert.deepEqual(plain(core.daySeries()), plain(app.daySeries()));
  assert.deepEqual(core.marketSaid(), app.marketSaid());
  assert.deepEqual(core.lineSaid(), app.lineSaid());
  assert.deepEqual(core.isaYear(), app.isaYear());
  assert.equal(core.tracksIsa(), app.tracksIsa());
  for (const x of core.S.list) { assert.equal(core.valueOf(x), app.valueOf(x)); assert.equal(core.dayOf(x), app.dayOf(x)); assert.equal(core.divsOf(x), app.divsOf(x)); assert.equal(core.nameOf(x.symbol), app.nameOf(x.symbol)); }
});

test("income, what's paid you, the tax year and how fast it grows, as app.js has them", () => {
  const { app } = both();
  assert.deepEqual(plain(core.income()), plain(app.income()));
  assert.deepEqual(plain(core.received()), plain(app.received()));
  assert.deepEqual(plain(core.taxMonths()), plain(app.taxMonths()));
  assert.equal(core.growthOf(core.income()), app.growthOf(app.income()));
  const d = new Date(Date.now() + 40 * 864e5);
  assert.equal(core.aroundDay(d), app.aroundDay(d));
  assert.equal(core.aroundMonth(d), app.aroundMonth(d));
});

test("what's worth knowing: the same cards in the same order, their pictures and taps named, not drawn", () => {
  const { app } = both();
  const mine = core.insights(), theirs = app.insights();
  assert.ok(mine.length >= 2, `${mine.length} cards`);
  const pick = (c) => ({ rank: c.rank, kick: c.kick, c: c.c, sym: c.sym ?? null, h: c.h, p: c.p, viz: !!c.viz, open: !!c.open });
  assert.deepEqual(mine.map(pick), theirs.map(pick));
  for (const c of mine) {
    if (c.viz) assert.ok(Array.isArray(c.viz) && typeof c.viz[0] === "string", `${c.kick}: a named picture`);
    if (c.open) assert.ok(["income", "isa", "back"].includes(c.open), `${c.kick}: a named tap`);
  }
});

test("the news in groups, and its key, as app.js has them", () => {
  const { app, S } = both();
  const all = core.S.news;
  assert.deepEqual(plain(core.newsGroups(all, storiesOf)), plain(app.newsGroups(S.news)));
  for (const n of all) assert.equal(core.newsKey(n), app.newsKey(n));
  assert.equal(core.storyId(all[0]), "s1");
  assert.equal(core.storyOf("s1"), all[0]);
});

test("a range's series: what you own now through the week, from each holding's chart (kept ten minutes), as app.js has it", async () => {
  const { app, S } = both();
  const t0 = Math.floor(Date.now() / 1000) - 5 * 86400, chart = (p) => ({ t: Array.from({ length: 6 }, (_, i) => t0 + i * 86400), c: Array.from({ length: 6 }, (_, i) => p * (1 + i / 100)) });
  for (const x of core.S.list) { const q = core.S.q[x.symbol]; if (q) { core.S.charts.set(`${x.symbol}:5d`, { at: Date.now(), c: chart(q.price) }); S.charts.set(`${x.symbol}:5d`, { at: Date.now(), c: chart(q.price) }); } }
  assert.deepEqual(plain(await core.rangeSeries("5d")), plain(await app.rangeSeries("5d")));
});

// ---- the life of it: start, shown, stop ----
const tick = () => new Promise((ok) => setImmediate(ok));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await tick(); };
const quotesAsked = () => api.log.filter((c) => c.path === "quotes").length;

test("the 15-second prices only between shown(true) and shown(false), and only while the page is visible (S2-D4)", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  NET.acc = account(); NET.status = 0;
  const fw = fakeFw();
  core.start(fw);
  await settle();
  assert.equal(core.S.me?.id, "u-a-0001");
  api.log.length = 0;
  t.mock.timers.tick(95e3);
  await settle();
  assert.equal(quotesAsked(), 0, "not shown: no prices asked for");
  core.shown(true);
  assert.equal(core.live(), true);
  t.mock.timers.tick(14999); await settle();
  assert.equal(quotesAsked(), 0, "not before 15 seconds");
  t.mock.timers.tick(1); await settle();
  assert.equal(quotesAsked(), 1, "shown: asked at 15 seconds");
  fw.isVisible = false; fw.fire("hidden");
  t.mock.timers.tick(60e3); await settle();
  assert.equal(quotesAsked(), 1, "hidden page: none");
  t.mock.timers.tick(5e3);
  fw.isVisible = true; fw.fire("visible"); await settle();
  assert.equal(quotesAsked(), 2, "back after more than half a minute: once at once");
  core.shown(false);
  assert.equal(core.live(), false);
  t.mock.timers.tick(120e3); await settle();
  assert.equal(quotesAsked(), 2, "shown(false): none");
  assert.equal(fw.subs.visible.size + fw.subs.hidden.size, 0, "its visible/hidden listeners let go");
  core.stop();
});

test("the news whenever Markets shows, at most every fifteen minutes (BI12)", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  NET.acc = account(); NET.status = 0;
  const fw = fakeFw();
  core.start(fw); await settle();
  api.log.length = 0;
  core.shown(true); await settle();
  assert.equal(api.log.filter((c) => c.path === "news").length, 1, "shown: the news asked for");
  core.shown(false); core.shown(true); await settle();
  assert.equal(api.log.filter((c) => c.path === "news").length, 1, "shown again within the quarter hour: not again");
  core.shown(false); t.mock.timers.tick(16 * 60e3); core.shown(true); await settle();
  assert.equal(api.log.filter((c) => c.path === "news").length, 2, "after the quarter hour: again");
  core.stop();
});

test("start(A) → stop → start(B) keeps nothing of A (RI7); a kept copy is drawn only for its own account (S2-D9)", async () => {
  localStorage.clear();
  NET.acc = account(Date.now(), "a"); NET.status = 0;
  core.start(fakeFw({ userId: "u-a-0001" })); await settle();
  assert.equal(core.S.list.length, 6);
  assert.equal(JSON.parse(localStorage.getItem("markets:last")).id, "u-a-0001", "the kept copy carries its account's id");
  core.S.vs = { at: Date.now(), you: 1 }; core.S.charts.set("x", 1); core.S.prange = "1y";
  core.stop();
  for (const [k, v] of Object.entries({ me: null, list: [], q: {}, years: {}, news: null, isa: null, paid: null, inc: null, vs: null, prange: "1d" })) assert.deepEqual(core.S[k], v, `S.${k} dropped`);
  assert.equal(core.S.charts.size, 0);
  // B opens with A's copy still on this phone: none of it drawn, not even for a moment
  NET.acc = account(Date.now(), "b");
  const seen = [];
  const off = core.on("me", () => seen.push(core.S.list.map((x) => x.symbol).join()));
  core.start(fakeFw({ userId: "u-b-0002" }));
  assert.deepEqual(core.S.list, [], "A's kept copy isn't B's");
  await settle();
  off();
  assert.deepEqual(seen, ["AAPL"], "only B's list was ever drawn");
  assert.ok(!core.S.list.some((x) => x.symbol === "TSCO.L"));
  core.stop();
  // and A again: A's copy (written above) is drawn at once, before the account answers
  localStorage.setItem("markets:last", JSON.stringify({ id: "u-a-0001", me: { id: "u-a-0001", name: "Sam" }, holdings: [{ symbol: "TSCO.L", name: "Tesco", qty: 1 }], quotes: {}, rates: {}, at: 1 }));
  NET.acc = account(Date.now(), "a");
  core.start(fakeFw({ userId: "u-a-0001" }));
  assert.deepEqual(core.S.list.map((x) => x.symbol), ["TSCO.L"], "its own copy at once");
  await settle();
  core.stop();
});

test("a 401: Markets stops only when the framework's check says signed out (fw.session.lost() true), never on its own word", async () => {
  NET.acc = account(); NET.status = 0;
  let out = false;
  const fw = fakeFw({ lost: async () => out });
  core.start(fw); await settle();
  assert.ok(core.S.me);
  NET.status = 401;
  await core.refresh(true).catch(() => {}); await core.refresh(); await settle();
  assert.ok(fw.lostCalls >= 1, "the framework was asked");
  assert.ok(core.S.me, "still signed in (lost() said false): nothing dropped");
  out = true;
  await core.refresh(); await settle();
  assert.equal(core.S.me, null, "lost() true: stopped, everything dropped");
  assert.equal(core.fwOf(), null);
  NET.status = 0;
});

test("busy while a Markets sheet is up or a reorder is waiting to be kept (S2-D21); writes tell Today (fw.changed, S2-D11)", async () => {
  NET.acc = account(); NET.status = 0;
  const fw = fakeFw();
  core.start(fw); await settle();
  assert.equal(core.busy(), false);
  core.sheetIs(true); assert.equal(core.busy(), true); core.sheetIs(false);
  core.ordering(1); assert.equal(core.busy(), true); core.ordering(-1);
  assert.equal(core.busy(), false);
  const before = fw.changes;
  const said = await core.alertSet("TSCO.L", 5);
  assert.match(said, /You'll hear when Tesco moves 5% in a day/);
  assert.ok(!/£|\d+\.\d\d/.test(said), "no amount in the words");
  assert.equal(fw.changes, before + 1, "Today told");
  assert.deepEqual(await core.flush(), { lost: 0 });
  core.stop();
});

// ---- review fixes (s24 review mk: B2, I1–I4) ----
test("the portfolio's Send: none on a day nothing you own has traded (a weekend, before London opens), as Today's own card (I1)", async () => {
  localStorage.clear();
  NET.acc = account(); NET.status = 0;
  core.start(fakeFw()); await settle();
  const today = core.portfolioSend();
  assert.ok(today, "traded today: sent");
  assert.match(today.words, /^My portfolio is (up|down) \d+\.\d% today\.$/);
  // three days on, with the same quotes: the last session's move isn't that day's
  assert.equal(core.portfolioSend(Date.now() + 3 * 864e5), null, "nothing traded that day: nothing sent");
  assert.equal(core.tradedToday(core.S.q["TSCO.L"], Date.now() + 3 * 864e5), false);
  // (crypto trades every day)
  assert.equal(core.tradedToday({ kind: "crypto", time: 1 }, Date.now()), true);
  core.stop();
});

test("charts: each one kept ten minutes at most, and an open stock's let go when its sheet closes, but those your ranges use (I2, S2-D22)", async () => {
  localStorage.clear();
  NET.acc = account(); NET.status = 0;
  core.start(fakeFw()); await settle();
  const c = { t: [1, 2], c: [1, 2] };
  core.chartSet("AAPL:1d", c);
  core.S.charts.get("AAPL:1d").at = Date.now() - 11 * 60e3;
  core.chartSet("AAPL:5d", c);
  assert.deepEqual([...core.S.charts.keys()], ["AAPL:5d"], "one older than ten minutes dropped on the next set");
  // NVDA (followed, none owned): all its charts go once another stock opens
  core.stockOpen("NVDA"); core.chartSet("NVDA:1d", c); core.chartSet("NVDA:1y", c);
  core.stockOpen("TSCO.L");
  assert.ok(![...core.S.charts.keys()].some((k) => k.startsWith("NVDA:")), "the last stock's charts let go");
  // TSCO.L (owned): its own day goes with its sheet; its year stays for the portfolio's ranges (rangeSeries, vs)
  core.chartSet("TSCO.L:1d", c); core.chartSet("TSCO.L:1y", c);
  core.stockOpen(null);
  assert.equal(core.S.charts.has("TSCO.L:1d"), false);
  assert.equal(core.S.charts.has("TSCO.L:1y"), true);
  core.stop();
});

test("flush() says a reorder that couldn't be kept is lost, until a later one is kept (I3, j0 §10)", async () => {
  NET.acc = account(); NET.status = 0;
  core.start(fakeFw()); await settle();
  assert.deepEqual(await core.flush(), { lost: 0 });
  core.orderLost(true);
  assert.deepEqual(await core.flush(), { lost: 1 });
  core.orderLost(false);
  assert.deepEqual(await core.flush(), { lost: 0 });
  core.orderLost(true); core.stop();
  assert.deepEqual(await core.flush(), { lost: 0 }, "a stop forgets it with the account");
});

test("a write's answer that comes after stop() → start(B) is dropped: A's list never reaches B's (I4)", async () => {
  localStorage.clear();
  NET.acc = account(Date.now(), "a"); NET.status = 0;
  core.start(fakeFw({ userId: "u-a-0001" })); await settle();
  let go;
  NET.wait = { holding: new Promise((ok) => { go = ok; }) };
  const g = core.genNow();
  const following = core.follow("BP.L", "BP");
  core.stop();
  assert.equal(core.mine(g), false);
  NET.acc = account(Date.now(), "b");
  core.start(fakeFw({ userId: "u-b-0002" })); await settle();
  const before = NET.acc;
  NET.acc = account(Date.now(), "a"); // (the late answer carries A's holdings)
  go(); NET.wait = null;
  assert.equal(await following, false, "the late answer isn't taken");
  NET.acc = before;
  assert.deepEqual(core.S.list.map((x) => x.symbol), ["AAPL"], "B's list as it was");
  await core.refresh(true);
  const last = JSON.parse(localStorage.getItem("markets:last"));
  assert.equal(last.id, "u-b-0002");
  assert.deepEqual(last.holdings.map((x) => x.symbol), ["AAPL"], "nor written into B's kept copy");
  core.stop();
});

test("your list couldn't come: S.err (offline said so), no list, and Try Again (retry) brings it (B2)", async () => {
  localStorage.clear();
  NET.acc = account(); NET.status = 0;
  NET.fail = { me: 503 };
  core.start(fakeFw()); await settle();
  assert.equal(core.S.me, null);
  assert.equal(core.S.loading, false);
  assert.match(core.S.err.words, /Something went wrong \(503\)/);
  assert.equal(core.S.err.offline, false);
  NET.fail = null; NET.down = true;
  await core.retry(); await settle();
  assert.equal(core.S.err.offline, true, "offline: said as offline");
  NET.down = false;
  await core.retry(); await settle();
  assert.ok(core.S.me, "Try Again: the list is in");
  assert.equal(core.S.err, null);
  core.stop();
});
