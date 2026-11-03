// Markets' views and what leaves them (One roof stage 2, spec S2-D6, S2-D9, §2.5, §4.2, §4.7, §9.1 MK; deep review: Send
// and search). On a stand-in DOM (roofkit/fakedom.mjs) with the framework's own ui.js (where the inflite repo is beside):
//   Send: a stock's and the portfolio's packed cards carry exactly v kind from at say snap{name sym pct day} (ref{sym} for
//   a stock only), their words a percent and never a pound, a price or a value; a story's Share is its title and link;
//   search: the connector answers nothing for another user's id and, for the same one, entries without a value; its Find
//   has run and no href, and q is never in an href; a kept copy is never drawn for another user;
//   the module mounts, its three sections, the hooks on every element §4.7/roofhooks name, the add-stock field focused in
//   the same tap that opens it, every sheet of §2.1 drawn without an error, Change Order moving one and saying where.
//   node --test .tools/tests/unit/roofmkviews.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDocument } from "../roofkit/fakedom.mjs";
import { account, memStorage, marketsApi, fakeFw } from "./fixtures/mk.mjs";
import { ROOF, roofSkip } from "./fixtures/roof.mjs";

// ---- the browser bits ----
globalThis.localStorage = memStorage();
const NET = { acc: account(), status: 0 };
const api = marketsApi(NET);
globalThis.fetch = api.fetch;
const doc = fakeDocument();
doc.createElementNS = (ns, t) => doc.createElement(t);
globalThis.document = doc;
globalThis.requestAnimationFrame = () => 0;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.CSS ??= { escape: (s) => String(s) };
globalThis.Event ??= class { constructor(t) { this.type = t; } };
// (what the stand-in DOM lacks and the views touch)
const proto = Object.getPrototypeOf(doc.createElement("div"));
const getters = { childElementCount() { return this.children.length; }, offsetWidth: () => 300, clientWidth: () => 390, scrollLeft: () => 0 };
for (const [k, g] of Object.entries(getters)) if (!(k in proto)) Object.defineProperty(proto, k, { get: g, configurable: true });
const methods = {
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 390, height: 200, right: 390, bottom: 200 }), setPointerCapture() {}, scrollTo() {}, scrollIntoView() {},
  insertBefore(n, r) { this.append(n); if (r) { this.childNodes.splice(this.childNodes.indexOf(n), 1); this.childNodes.splice(this.childNodes.indexOf(r), 0, n); } return n; },
  dispatchEvent(e) { const ev = { type: e.type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }; for (const f of [...(this.listeners[e.type] || [])]) f(ev); return true; },
  setSelectionRange() {},
};
for (const [k, f] of Object.entries(methods)) if (!(k in proto)) Object.defineProperty(proto, k, { value: f, configurable: true, writable: true });

const MK = new URL("../../../markets/", import.meta.url);
const core = await import(new URL("roof/core.js", MK));
const { connector, want } = await import(new URL("roof/connector.js", MK));
const ui = roofSkip ? null : await import(new URL("ui.js", ROOF));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((ok) => setImmediate(ok)); };

// (a packed card, unpacked as Chat reads it)
const unpack = (p) => JSON.parse(Buffer.from(String(p).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
// no pound, and no figure of a price, a value or what's held, in words that leave the account
function noAmounts(words, acc) {
  assert.ok(!/£|\$|€/.test(words), `no currency in "${words}"`);
  for (const q of Object.values(acc.quotes)) for (const v of [q.price, q.prev, q.chg]) if (v != null && Math.abs(v) >= 1) assert.ok(!words.includes(v.toFixed(2)) && !(Math.abs(v) >= 10 && words.includes(String(v))), `no ${v} in "${words}"`);
  for (const x of acc.holdings) if (x.qty > 1) assert.ok(!words.includes(String(x.qty)), `no holding size in "${words}"`);
}

test("Send, a stock: the hub's words in percent and a card of exactly v kind from at say snap{name sym pct day} ref{sym} (S2-D6)", () => {
  const acc = account();
  Object.assign(core.S, { list: structuredClone(acc.holdings), q: structuredClone(acc.quotes), fx: { ...acc.rates } });
  const s = core.stockSend("TSCO.L");
  assert.equal(s.words, "Tesco (TSCO) is up 2.3% today.");
  noAmounts(s.words, acc);
  const card = unpack(s.packed);
  assert.deepEqual(Object.keys(card).sort(), ["at", "from", "kind", "ref", "say", "snap", "v"]);
  assert.deepEqual(Object.keys(card.snap).sort(), ["day", "name", "pct", "sym"]);
  assert.deepEqual(card.ref, { sym: "TSCO.L" });
  assert.equal(card.kind, "markets"); assert.equal(card.from, "markets"); assert.equal(card.snap.pct, 2.3);
  assert.match(card.snap.day, /^\d{4}-\d\d-\d\d$/);
  noAmounts(card.say, acc);
  // (never app.js's off-hub words, "… at £3.12")
  assert.ok(!/\bat\b/.test(s.words));
  // an index too, and a stock with no move: words alone, no card
  assert.match(core.stockSend("^FTSE").words, /^FTSE 100 \(FTSE\) is up 0\.4% today\.$/);
  core.S.q.X = { price: 3 };
  assert.deepEqual(core.stockSend("X", "Ex"), { words: "Ex (X).", packed: null, what: "Ex" });
});

test("Send, the portfolio: percent only, the card functions/_todaymkt.js makes ({ name: Portfolio, sym: null, pct, day }, no ref)", () => {
  const acc = account();
  Object.assign(core.S, { list: structuredClone(acc.holdings), q: structuredClone(acc.quotes), fx: { ...acc.rates } });
  const s = core.portfolioSend();
  const pct = Math.round(core.totals().dayPct * 100) / 100;
  assert.equal(s.words, `My portfolio is ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% today.`);
  noAmounts(s.words, acc);
  const card = unpack(s.packed);
  assert.deepEqual(Object.keys(card).sort(), ["at", "from", "kind", "say", "snap", "v"]);
  assert.deepEqual(Object.keys(card.snap).sort(), ["day", "name", "pct", "sym"]);
  assert.equal(card.snap.name, "Portfolio"); assert.equal(card.snap.sym, null); assert.equal(card.snap.pct, pct);
  // flat, and nothing priced
  Object.assign(core.S, { q: Object.fromEntries(Object.entries(structuredClone(acc.quotes)).map(([k, q]) => [k, { ...q, prev: q.price }])) });
  assert.equal(core.portfolioSend().words, "My portfolio is flat today.");
  core.S.list = [];
  assert.equal(core.portfolioSend(), null);
});

test("a story's Share: its title and link, nothing else (no card)", () => {
  const n = account().news[0];
  assert.deepEqual(core.storySend(n), { words: `${n.title}\n${n.link}`, packed: null, what: "this story" });
});

test("search: nothing for another user's id; for the same one names and symbols only, Find with run and no href, q never in an href (C6, RB1c)", () => {
  const acc = account();
  localStorage.setItem("markets:last", JSON.stringify({ id: acc.id, me: { id: acc.id }, holdings: acc.holdings, quotes: acc.quotes, rates: acc.rates, at: 1 }));
  assert.deepEqual(connector.search("tes", { userId: "u-someone-else" }), [], "another user: nothing");
  assert.deepEqual(connector.search("tes", {}), [], "no user: nothing");
  assert.deepEqual(connector.search("tes"), [], "no second argument: nothing");
  const got = connector.search("tes", { userId: acc.id });
  assert.deepEqual(got.find((e) => e.title === "Tesco"), { title: "Tesco", sub: "TSCO · Shares", icon: "markets", href: "/markets/#s=TSCO.L" });
  const find = got.at(-1);
  assert.equal(find.title, "Find “tes” in Markets");
  assert.equal(typeof find.run, "function");
  assert.equal(find.href, undefined, "Find has no href");
  for (const q of ["tes", "smt", "markets inc", "Nv"]) for (const e of connector.search(q, { userId: acc.id })) {
    const said = `${e.title} ${e.sub}`;
    assert.ok(!/£|\d+\.\d\d|\b1000\b|\b200\b/.test(said), `no amount in "${said}"`);
    if (e.href) assert.ok(!e.href.toLowerCase().includes(`q=`) && !(q.length > 2 && e.href.toLowerCase().includes(encodeURIComponent(q.toLowerCase())) && !/^\/markets\/#(s=|income|isa|vs|about)/.test(e.href)), `q not in ${e.href}`);
  }
  assert.ok(connector.search("t", { userId: acc.id }).every((e) => !e.run), "one letter: no Find");
  assert.deepEqual(connector.search("income", { userId: acc.id }).filter((e) => e.href).map((e) => e.href), ["/markets/#income"]);
  assert.equal(connector.search("tesc", { userId: acc.id, kept: { id: "u-x", holdings: acc.holdings } }).length, 0, "a live copy that isn't this user's: nothing");
  // ≤ 8 holdings
  const many = Array.from({ length: 12 }, (_, i) => ({ symbol: `T${i}`, name: `Test ${i}`, qty: 1 }));
  assert.equal(connector.search("test", { userId: "u", kept: { id: "u", holdings: many } }).filter((e) => e.href?.startsWith("/markets/#s=")).length, 8);
  // Find: q kept on this phone for Markets to take, never put in an address
  let opened = 0;
  want.open = () => { opened++; };
  find.run();
  assert.equal(opened, 1);
  assert.equal(want.q, "tes");
  want.open = null; want.q = null;
  localStorage.removeItem("markets:last");
});

test("the connector: ≤ 4 KB, no imports, its words, sections and aliases as REGISTRY's, files ∩ lazy empty", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("roof/connector.js", MK), "utf8");
  assert.ok(Buffer.byteLength(src) <= 4096, `${Buffer.byteLength(src)} bytes`);
  assert.ok(!/^\s*import\b/m.test(src));
  assert.deepEqual(connector.shares, { cards: "How your holdings are doing today", search: "Your holdings, on this phone", notifications: "Price alerts and the evening wrap", actions: "Open a stock or a section; send a stock's day in percent", screens: "Today · Holdings · News" });
  assert.deepEqual(connector.sections, [["today", "Today"], ["holdings", "Holdings"], ["news", "News"]]);
  assert.deepEqual(connector.aliases, { s: "today", income: "holdings", isa: "holdings", vs: "holdings", about: "holdings" });
  assert.equal(connector.files.filter((f) => connector.lazy.includes(f)).length, 0);
  assert.deepEqual(connector.mini({ cards: { markets: { traded: true, pct: 0.8, value: 12345, spark: { vals: [1, 3, 2] } } } }), { kind: "pct-spark", pct: 0.8, spark: [0, 1, 0.5] });
  assert.equal(connector.mini({ cards: { markets: { traded: false, pct: 1 } } }), null);
});

// ---- the module, mounted on the stand-in DOM ----
function frameFw(userId = "u-a-0001") {
  const fw = fakeFw({ userId });
  const sheets = [];
  Object.assign(fw, {
    ui, screenEl: doc.createElement("main"), headers: [], provided: [], went: [], sections: [],
    header: { set: (s) => fw.headers.push(s) },
    nav: { go: (p) => fw.went.push(p), section: (id) => fw.sections.push(id), back() {}, href: (k, a) => `/markets/#${k}${a ? "=" + a : ""}` },
    search: { provide: (p) => { fw.provided.push(p); return () => { fw.provided = fw.provided.filter((x) => x !== p); }; } },
    zoomTarget() {}, fill() {}, theme: () => "dark", motion: () => "full",
    sendButton: (spec) => ui.btn("Send", { act: "send", run: () => fw.send(spec) }),
    sheets,
    sheet: {
      open(spec) {
        const d = doc.createElement("dialog"), head = doc.createElement("header"), h2 = doc.createElement("h2"), back = doc.createElement("button"), body = doc.createElement("div");
        d.className = "ifl-sheet"; d.dataset.sheet = spec.sheet; d.dataset.app = "markets"; head.className = "ifs-head"; back.className = "ifs-btn ifs-back"; body.className = "ifs-body"; h2.textContent = spec.title || "";
        head.append(back, h2); d.append(head, body); doc.body.append(d); d.setAttribute("open", "");
        const hd = { el: d, body, closed: false, close() { if (hd.closed) return; hd.closed = true; d.remove(); spec.onClose?.(); }, push() {}, pop() {}, setBusy() {} };
        if (typeof spec.body === "function") spec.body(body, hd); else if (spec.body) body.append(spec.body);
        sheets.push(hd);
        return hd;
      },
    },
  });
  return fw;
}
const all = (root, sel) => root.querySelectorAll(sel);

test("the module mounts: three sections, the header (percent, never pounds), the hooks, Add a Stock focused in its tap, every sheet drawn", { skip: roofSkip }, async () => {
  localStorage.clear();
  NET.acc = account(); NET.status = 0;
  const { mount, SECTIONS, CONTRACT } = await import(new URL("roof/markets.js", MK));
  assert.equal(CONTRACT, 1);
  const fw = frameFw(), main = fw.screenEl, root = doc.createElement("div");
  root.className = "m-markets"; main.append(root); doc.body.append(main);
  const m = await mount(root, fw);
  await m.show({ kind: "app", app: "markets", section: "today", key: "today", arg: null, query: "" });
  await settle();
  assert.deepEqual(all(root, "section.mk-sec").map((s) => s.dataset.sec), SECTIONS.map((s) => s[0]));
  assert.equal(all(root, "section.mk-sec").filter((s) => !s.hidden).length, 1);
  // the header: the section's name; the compact title a percent; Add a Stock; no amount anywhere in it
  const hd = Object.assign({}, ...fw.headers);
  assert.equal(hd.title, "Today");
  assert.match(hd.compactTitle, /^Markets · [+−]\d+\.\d%$/);
  assert.deepEqual(hd.acts.map((a) => [a.icon, a.label]), [["plus", "Add a Stock"]]);
  assert.ok(!/£/.test(`${hd.title} ${hd.compactTitle} ${hd.line}`));
  assert.equal(typeof hd.badges.news, "number");
  // Today: the portfolio hero with its Send, each row a holding with its symbol
  const today = root.querySelector('section.mk-sec[data-sec="today"]');
  const hero = today.querySelector("[data-k=portfolio]");
  assert.ok(hero, "the portfolio hero (MK_HERO)");
  const send = hero.querySelector("[data-act=send]");
  assert.ok(send, "its Send (MK_PORTFOLIO_SEND)");
  send.click();
  const sent = fw.sent.at(-1);
  assert.match(sent.words, /^My portfolio is (up|down) \d+\.\d% today\.$/);
  noAmounts(sent.words, NET.acc);
  assert.ok(today.querySelector('[data-k=holding][data-sym="TSCO.L"]'), "a holding's row (mkRow)");
  // search, while mounted: Markets' own provider, from what's live, for this user only
  const prov = fw.provided.find((p) => p.id === "markets");
  assert.ok(prov, "a provider with Markets' connector id");
  assert.equal(prov.search("tesco").find((e) => e.title === "Tesco")?.href, "/markets/#s=TSCO.L");
  fw.userId = "u-other"; assert.deepEqual(prov.search("tesco"), [], "another user: nothing"); fw.userId = "u-a-0001";
  // Add a Stock: its sheet and its field made, and the field focused, in the same tap (no await)
  hd.acts[0].run();
  const add = fw.sheets.at(-1);
  assert.equal(add.el.dataset.sheet, "add-stock");
  const field = add.el.querySelector("input[data-k=find]");
  assert.ok(field, "MK_ADD_INPUT");
  assert.equal(doc.activeElement, field, "focused in the tap");
  await settle();
  assert.ok(add.el.querySelector("[data-k=result][data-sym]"), "results to browse (MK_ADD_RESULT)");
  add.close();
  // a stock's sheet: Send, Remove, Alert Me's own number
  await fw.lazy(() => import(new URL("roof/stock.js", MK))).then((s) => s.openStock({ fw }, "TSCO.L"));
  const st = fw.sheets.at(-1);
  assert.equal(st.el.dataset.sheet, "stock");
  assert.ok(st.el.querySelector("[data-act=send]"), "MK_STOCK_SEND");
  assert.ok(st.el.querySelector("[data-k=remove]"), "MK_STOCK_REMOVE");
  assert.equal(st.el.querySelector(".ifs-head h2").textContent, "TSCO · London");
  st.el.querySelector("[data-act=send]").click();
  assert.equal(fw.sent.at(-1).words, "Tesco (TSCO) is up 2.3% today.");
  st.el.querySelector('[data-el="alert"]').click();
  await settle();
  assert.equal(st.el.dataset.sheet, "stock", "Alert Me stays the stock sheet");
  assert.ok(st.el.querySelector("input[data-k=alert]"), "MK_ALERT");
  assert.ok(st.el.classList.contains("pushed"), "‹ shown");
  st.close();
  assert.equal(core.busy(), false, "sheet gone: not busy");
  // every other sheet of §2.1, by its opener, drawn without an error and named by data-sheet
  const L = (f) => import(new URL(`roof/${f}`, MK));
  const opened = [];
  for (const [file, fn, args, name] of [["money.js", "openIncome", [], "income"], ["money.js", "openIsa", [], "isa"], ["money.js", "openVs", [], "vs"], ["holdings.js", "openAccount", ["isa"], "mk-account"],
    ["holdings.js", "openAbout", [], "mk-about"], ["edit.js", "openHolding", ["TSCO.L"], "holding"], ["news.js", "openStory", ["s1"], "story"]]) {
    const mod = await L(file);
    mod[fn]({ fw }, ...args);
    await settle(2);
    const sh = fw.sheets.at(-1);
    opened.push(sh.el.dataset.sheet);
    assert.equal(sh.el.dataset.sheet, name, `${fn}: data-sheet ${name}`);
    assert.ok(sh.body.textContent.length > 10, `${fn}: drawn`);
    if (name === "mk-about") assert.match(sh.body.textContent, /isn't financial advice/);
    sh.close();
  }
  // Holdings: the about link, accounts, Change Order with Move Up/Down and the live line
  await m.show({ kind: "app", app: "markets", section: "holdings", key: "holdings", arg: null, query: "" });
  await settle();
  const hold = root.querySelector('section.mk-sec[data-sec="holdings"]');
  assert.ok(hold.querySelector("[data-k=about]"), "MK_ABOUT");
  assert.ok(hold.querySelector("[data-k=account]"), "MK_ACCOUNT_ROW");
  hold.querySelector("[data-k=edit]").click();
  const down = hold.querySelector('[data-k="move-down"][data-sym="TSCO.L"]');
  assert.ok(down, "mkMove");
  down.click();
  assert.equal(core.busy(), true, "a reorder on its way: busy");
  assert.match(hold.querySelector('[data-el="order-say"]').textContent, /^Tesco: 2 of \d$/);
  await settle();
  assert.equal(core.busy(), false, "kept: not busy");
  const order = api.log.filter((c) => c.path === "order").at(-1);
  assert.equal(JSON.parse(order.body).symbols[1], "TSCO.L");
  // News: stories with their ids
  await m.show({ kind: "app", app: "markets", section: "news", key: "news", arg: null, query: "" });
  await settle();
  const news = root.querySelector('section.mk-sec[data-sec="news"]');
  assert.ok(news.querySelector('[data-k=story][data-id="s1"]'), "mkStory");
  assert.equal(Object.assign({}, ...fw.headers).badges.news, 0, "no count on News itself");
  // a cold link to a stock: opened once the list is in
  await m.show({ kind: "app", app: "markets", section: "today", key: "s", arg: "AAPL", query: "" });
  await settle(12);
  assert.equal(fw.sheets.at(-1).el.dataset.sheet, "stock");
  assert.deepEqual(m.sendable().words, "Apple (AAPL) is down 0.8% today.");
  fw.sheets.at(-1).close();
  // unmount: everything let go
  m.hide();
  m.unmount();
  assert.equal(all(root, "section").length, 0);
  assert.equal(fw.provided.length, 0, "provider let go");
  assert.equal(core.S.me, null);
  // nothing the module wrote under today:*, and markets:last carries its account's id
  assert.ok(!localStorage.keys().some((k) => k.startsWith("today:")));
});
