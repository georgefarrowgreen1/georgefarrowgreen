// Markets' "Send in Chat" (markets/send.js): a stock's day as a card Chat keeps (pigeon/cards.js normCard), in percent
// only (never a price, a value or any amount), and the address it goes to: Chat's own, with the words first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stockSendCard, chatHash } from "../../../markets/send.js";
import { normCard, readShareHash, chatHash as chatsOwn, SYMBOL } from "../../../pigeon/cards.js";

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
