// Markets' "Send in Chat" (markets/send.js): a stock's day as a card Chat keeps (pigeon/cards.js normCard), in percent
// only (never a price, a value or any amount), and the address it goes to: Chat's own, with the words first. At
// InFlite's hub (markets/app.js sendInChat, IFL.hub.on), the same card packed for the hub's IFL.hub.send instead, the
// words in percent too; off the hub, exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stockSendCard, chatHash } from "../../../markets/send.js";
import { normCard, readShareHash, chatHash as chatsOwn, SYMBOL, packCard as chatsPack, unpackCard } from "../../../pigeon/cards.js";

const NOW = Date.UTC(2026, 10, 2, 14, 5);
// (a quote as the page has it in S.q: everything Markets knows of a stock's day, price and all)
const quote = (o = {}) => ({ symbol: "TSCO.L", name: "Tesco", cur: "GBP", price: 3.512, prev: 3.47, chg: 0.042, chgPct: 1.2103746, tz: "Europe/London",
  time: Math.round(NOW / 1000) - 60, dayHi: 3.53, dayLo: 3.45, hi52: 3.9, lo52: 2.8, spark: [3.47, 3.5, 3.512], ...o });
// (Chat's address, as markets/account.js chatPage() gives it: the origin, ending in "/")
const chatPage = (loc) => (loc.hostname.startsWith("finance.") ? `${loc.origin.replace("//finance.", "//chat.")}/` : null);

test("the card passes Chat's checks, with the day's move in percent and nothing else", () => {
  const c = stockSendCard("TSCO.L", "Tesco", quote(), NOW);
  assert.deepEqual(c, { v: 1, kind: "markets", from: "markets", at: NOW, say: "Tesco is up 1.21% today.",
    snap: { name: "Tesco", sym: "TSCO.L", pct: 1.21, day: "2026-11-02" }, ref: { sym: "TSCO.L" } });
  const n = normCard(c);
  assert.ok(n, "normCard keeps it");
  assert.deepEqual(n.snap, c.snap); assert.deepEqual(n.ref, c.ref); assert.equal(n.say, c.say);
  const json = JSON.stringify(c);
  for (const k of ["price", "prev", "chg\"", "value", "cur", "dayHi", "spark", "qty", "units", "cost", "change", "amount", "isa", "dividend", "top"]) assert.ok(!json.includes(k), `no ${k}`);
  for (const v of ["3.512", "3.47", "0.042", "£", "GBP"]) assert.ok(!json.includes(v), `no ${v}`);
});

test("falls: the card says down; the trading day is the exchange's own", () => {
  const c = stockSendCard("AAPL", "Apple", quote({ chgPct: -0.404, tz: "America/New_York", time: Date.UTC(2026, 10, 2, 3, 0) / 1000 }), NOW);
  assert.equal(c.snap.pct, -0.4); assert.equal(c.say, "Apple is down 0.40% today.");
  assert.equal(c.snap.day, "2026-11-01", "New York's day, not London's");
  assert.equal(stockSendCard("^FTSE", "FTSE 100", quote({ chgPct: 0.001 }), NOW).say, "FTSE 100 is unchanged today.");
  assert.ok(normCard(stockSendCard("BTC-USD", "Bitcoin", quote({ chgPct: 3.5 }), NOW)), "Bitcoin's symbol passes too");
});

test("no card where there's no move to send, or a symbol Chat wouldn't take (the words go alone)", () => {
  assert.equal(stockSendCard("TSCO.L", "Tesco", null, NOW), null);
  assert.equal(stockSendCard("TSCO.L", "Tesco", quote({ chgPct: null }), NOW), null);
  assert.equal(stockSendCard("TSCO.L", "Tesco", quote({ chgPct: NaN }), NOW), null);
  assert.equal(stockSendCard("TSCO.L", "Tesco", quote({ chgPct: 5000 }), NOW), null);
  assert.equal(stockSendCard("tsco.l", "Tesco", quote(), NOW), null, "never a card that would read as the portfolio");
  assert.equal(stockSendCard("<b>", "Tesco", quote(), NOW), null);
  assert.equal(stockSendCard(undefined, "Tesco", quote(), NOW), null);
});

test("names are cleaned and cut as Chat would; a missing one falls back to the symbol", () => {
  const c = stockSendCard("RR.L", "Rolls‮-Royce\u0000 " + "x".repeat(80), quote(), NOW);
  assert.ok(c.snap.name.length <= 60 && !/[\u0000‮]/.test(c.snap.name));
  assert.equal(normCard(c).snap.name, c.snap.name);
  assert.equal(stockSendCard("RR.L", "", quote(), NOW).snap.name, "RR.L");
  // (a quote with no time: today, on the exchange's clock)
  assert.equal(stockSendCard("RR.L", "Rolls-Royce", quote({ time: null }), NOW).snap.day, "2026-11-02");
});

test("Chat's address with the hash: /#share=, the words first, the card beside them", () => {
  const chat = chatPage({ hostname: "finance.x", origin: "https://finance.x" });
  assert.equal(chat, "https://chat.x/");
  const text = "Tesco (TSCO) is up 1.2% today, at 351.2p.", card = stockSendCard("TSCO.L", "Tesco", quote(), NOW);
  const url = chat + chatHash(text, card);
  assert.ok(url.startsWith("https://chat.x/#share="), url);
  assert.ok(url.includes("/#share=") && !url.includes("/share="), "never without its #");
  assert.ok(url.includes("&card="));
  const hash = new URL(url).hash;
  assert.equal(new URLSearchParams(hash.slice(1)).get("share"), text, "an older Chat finds the words as ever");
  const got = readShareHash(hash);
  assert.equal(got.words, text);
  assert.deepEqual(got.card.snap, card.snap); assert.deepEqual(got.card.ref, { sym: "TSCO.L" });
  // (the very same as Chat's own)
  assert.equal(chatHash(text, card), chatsOwn(text, card));
  assert.equal(chatHash(text, null), chatsOwn(text, null));
  assert.equal(chat + chatHash(text, null), `https://chat.x/#${new URLSearchParams({ share: text })}`, "no card: today's address exactly");
});

test("the copies stay true: Chat's symbol rule, and send.js among the app's kept files", () => {
  const src = readFileSync(new URL("../../../markets/send.js", import.meta.url), "utf8");
  assert.ok(src.includes(`const SYMBOL = ${SYMBOL};`), "the same symbol rule as Chat's");
  assert.match(readFileSync(new URL("../../../markets/sw.js", import.meta.url), "utf8"), /"send\.js"/);
  const app = readFileSync(new URL("../../../markets/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("chat + chatHash(text, stockSendCard(sym, name, q, Date.now()))"), "Send in Chat sends the card");
});

// ---- at InFlite's hub: markets/app.js sendInChat, run with the hub on and off ----
const APP = readFileSync(new URL("../../../markets/app.js", import.meta.url), "utf8");
const fnOf = (name) => { const m = new RegExp(`\\nfunction ${name}\\(.*\\) \\{\\n[\\s\\S]*?\\n\\}\\n`).exec(APP); assert.ok(m, `markets/app.js ${name}()`); return m[0]; };
// (sendInChat as the page has it, with the hub on or off: what it handed IFL.hub.send, and where it sent the page)
function sender(on, q = quote()) {
  const sent = [], went = [];
  const IFL = { hub: { on, send: (...a) => { sent.push(a); return Promise.resolve(true); } } };
  const A = { chatPage: () => "https://chat.x/" };
  const make = new Function("S", "IFL", "A", "location", "navigator", "toast", "nameOf", "plainSym", "fmt", "priceSaid", "stockSendCard", "chatHash", "Date",
    `${fnOf("packCard")}\n${fnOf("sendInChat")}\nreturn sendInChat;`);
  const send = make({ q: q ? { "TSCO.L": q } : {} }, IFL, A, { assign: (u) => went.push(u) }, {}, () => {}, () => "Tesco", (s) => s.replace(/\.L$/, ""),
    (v, d = 2) => v.toFixed(d), (x) => `${(x.price * 100).toFixed(1)}p`, stockSendCard, chatHash, { now: () => NOW });
  return { send, sent, went };
}

test("at the hub: a stock goes to IFL.hub.send, with the card packed and nothing but name, sym, pct and day in it", () => {
  const { send, sent, went } = sender(true);
  send("TSCO.L", "Tesco");
  assert.equal(went.length, 0, "never to Chat's own address");
  assert.equal(sent.length, 1, "IFL.hub.send, once");
  const [words, packed, opts] = sent[0];
  assert.equal(words, "Tesco (TSCO) is up 1.2% today.", "the words in percent too");
  for (const v of ["351", "3.51", "p.", "£", "GBP"]) assert.ok(!words.includes(v), `no ${v} in the words`);
  assert.equal(opts, undefined, "no friend chosen for you");
  assert.match(packed, /^[A-Za-z0-9_-]+$/);
  const card = unpackCard(packed);
  assert.ok(card, "Chat unpacks it");
  assert.deepEqual(Object.keys(card.snap).sort(), ["day", "name", "pct", "sym"]);
  assert.deepEqual(card.snap, { name: "Tesco", sym: "TSCO.L", pct: 1.21, day: "2026-11-02" });
  assert.deepEqual(card.ref, { sym: "TSCO.L" });
  const json = JSON.stringify(card);
  for (const k of ["price", "prev", "value", "qty", "cost", "amount"]) assert.ok(!json.includes(k), `no ${k}`);
  for (const v of ["3.512", "3.47", "£"]) assert.ok(!json.includes(v), `no ${v}`);
  // (packed as Chat itself packs it)
  const own = stockSendCard("TSCO.L", "Tesco", quote(), NOW);
  assert.deepEqual(unpackCard(packed), unpackCard(chatsPack(own)));
});

test("at the hub with no move to send: the words alone, no card", () => {
  const { send, sent } = sender(true, null);
  send("TSCO.L", "Tesco");
  assert.deepEqual(sent, [["Tesco (TSCO).", null]]);
  const down = sender(true, quote({ chgPct: -0.404 }));
  down.send("TSCO.L", "Tesco");
  assert.equal(down.sent[0][0], "Tesco (TSCO) is down 0.4% today.");
  assert.equal(unpackCard(down.sent[0][1]).snap.pct, -0.4);
});

test("off the hub: nothing handed to the hub, and Chat's own address exactly as before", () => {
  const { send, sent, went } = sender(false);
  send("TSCO.L", "Tesco");
  assert.equal(sent.length, 0);
  const text = "Tesco (TSCO) is up 1.2% today, at 351.2p.";
  assert.deepEqual(went, ["https://chat.x/" + chatHash(text, stockSendCard("TSCO.L", "Tesco", quote(), NOW))]);
  // (and the hub asked before Chat's address is even looked up)
  const src = fnOf("sendInChat");
  assert.ok(src.indexOf("IFL.hub.send(") > 0 && src.indexOf("IFL.hub.send(") < src.indexOf("A.chatPage()"), "IFL.hub.send before A.chatPage()");
});

test("a section asked for by the address: a tab, or a stock by a symbol Markets would take, else nothing", () => {
  const consts = ["SECTIONS", "SYMBOL"].map((k) => new RegExp(`\\nconst ${k} = [^\\n]*\\n`).exec(APP)?.[0]).join("");
  const sectionOf = new Function(`${consts}\n${fnOf("sectionOf")}\nreturn sectionOf;`)();
  assert.deepEqual(sectionOf("#holdings"), { tab: "holdings" });
  assert.deepEqual(sectionOf("#news"), { tab: "news" });
  assert.deepEqual(sectionOf("today"), { tab: "today" });
  assert.deepEqual(sectionOf("#s=TSCO.L"), { sym: "TSCO.L" });
  assert.deepEqual(sectionOf("#s=%5EFTSE"), { sym: "^FTSE" });
  assert.deepEqual(sectionOf("#s=tsco.l"), { sym: "TSCO.L" });
  for (const bad of ["", "#", "#notify", "#signin=abc", "#s=", "#s=%E0%A4%A", "#s=%3Cb%3E", "#s=" + "A".repeat(30), "#holdingsx", "#apps"]) assert.equal(sectionOf(bad), null, bad);
});
