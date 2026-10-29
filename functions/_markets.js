// Markets: what's kept with your account (what you own and follow, and your price alerts), and the markets' own data,
// fetched here once for everyone and kept a minute or more, so however many people have the app open, each price is
// asked for once a minute at most.
//
// The data: Yahoo Finance's public chart and search addresses (no key): a symbol's price, its day and its history in
// one answer, and the news about it. (MARKETS_DATA in the environment: another address for them, a test's stand-in.)
// London's prices come in pence (GBp) and are said here in pounds; values are added up in pounds, other currencies
// turned into them at the day's rate.
//
// mk_holdings: what you own (qty > 0) or just follow (qty 0), each with the name it was added as, what you paid for each
//   share (cost, optional, in its own currency), and its place in your list.
// mk_alerts:   a holding you want to hear about when it moves (pct, 3% by default), and the last day it was said.
// mk_push:     each phone Markets can tell you on (its push subscription).
// mk_off:      the account's own choice, from its Notifications page: Markets's alerts off everywhere.
// mk_cache:    the markets' data, as last fetched, with when.
import { HttpError, db, fromB64url } from "./_pigeon.js";
import { pushEndpointOk, pushToSub, prefsOf, isQuiet } from "./_notify.js";

const MIN = 60e3, HOUR = 60 * MIN;
export const MAX_HOLDINGS = 60;
export const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;
export const cleanSymbol = (s) => { const v = String(s || "").trim().toUpperCase(); if (!SYMBOL.test(v)) throw new HttpError(400, "That isn’t a symbol."); return v; };

let ready = null;
export async function mkdb(env) {
  const D = await db(env);
  if (!ready) ready = (async () => {
    await D.batch([
      D.prepare(`CREATE TABLE IF NOT EXISTS mk_holdings (user_id TEXT NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL, qty REAL NOT NULL DEFAULT 0, cost REAL,
        ord INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL, PRIMARY KEY (user_id, symbol))`),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_alerts (user_id TEXT NOT NULL, symbol TEXT NOT NULL, pct REAL NOT NULL DEFAULT 3, fired TEXT, PRIMARY KEY (user_id, symbol))"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, added INTEGER NOT NULL)"),
      D.prepare("CREATE INDEX IF NOT EXISTS mk_push_user ON mk_push (user_id)"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_off (user_id TEXT PRIMARY KEY)"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_cache (k TEXT PRIMARY KEY, at INTEGER NOT NULL, v TEXT NOT NULL)"),
    ]);
  })().catch((e) => { ready = null; throw e; });
  await ready;
  return D;
}

// ---------------- the markets' data ----------------
const base = (env) => String(env.MARKETS_DATA || "https://query1.finance.yahoo.com").replace(/\/$/, "");
const UA = "Mozilla/5.0 (compatible; InFliteMarkets/1.0; +https://finance.inflite.ai)";
async function fetchJson(env, path) {
  let r;
  try { r = await fetch(base(env) + path, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(9000) }); }
  catch (_) { throw new HttpError(502, "Prices aren’t available just now. Try again in a minute."); }
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, "Prices aren’t available just now. Try again in a minute.");
  return r.json();
}

// Kept: in this copy of the server, and in the database for every other; fresh for `ttl`, and an old one given rather
// than nothing where the source can't be reached (said as such: stale)
const memory = new Map();
// (MARKETS_TTL in the environment: how long each is kept, as a part of its usual time; tests, 0, so a price they move is seen at once)
async function cached(env, key, ttl0, make) {
  const ttl = env.MARKETS_TTL != null ? ttl0 * Number(env.MARKETS_TTL) : ttl0, t = Date.now(), m = memory.get(key);
  if (m && t - m.at < ttl) return m.v;
  const D = await mkdb(env);
  const row = m ? null : await D.prepare("SELECT at, v FROM mk_cache WHERE k = ?").bind(key).first().catch(() => null);
  let old = m || (row ? { at: row.at, v: JSON.parse(row.v) } : null);
  if (old && t - old.at < ttl) { memory.set(key, old); return old.v; }
  try {
    const v = await make();
    if (v == null) return null;
    memory.set(key, { at: t, v });
    if (memory.size > 2000) memory.delete(memory.keys().next().value);
    await D.prepare("INSERT OR REPLACE INTO mk_cache (k, at, v) VALUES (?, ?, ?)").bind(key, t, JSON.stringify(v)).run().catch(() => {});
    return v;
  } catch (e) {
    if (old) return Array.isArray(old.v) ? old.v : { ...old.v, stale: true };
    throw e;
  }
}

// prices quoted in a currency's hundredths (London's pence): said in the currency itself
const MINOR = { GBp: ["GBP", 0.01], GBX: ["GBP", 0.01], ZAc: ["ZAR", 0.01], ILA: ["ILS", 0.01] };
// the exchanges, as people know them
const EXCHANGES = { LSE: "London", IOB: "London", NMS: "Nasdaq", NGM: "Nasdaq", NCM: "Nasdaq", NAS: "Nasdaq", NYQ: "NYSE", NYS: "NYSE", ASE: "NYSE American", PCX: "NYSE Arca",
  CCC: "Crypto", CCY: "Currency", GER: "Xetra", PAR: "Paris", AMS: "Amsterdam", MIL: "Milan", EBS: "Swiss", TOR: "Toronto", ASX: "Sydney", JPX: "Tokyo", HKG: "Hong Kong",
  FGI: "FTSE", SNP: "S&P", DJI: "Dow Jones", NIM: "Nasdaq", CXI: "Cboe" };
// A company's name, as people say it: "Rolls-Royce Holdings plc" → "Rolls-Royce", "NVIDIA Corporation" → "NVIDIA"
export function plainName(n, symbol = "") {
  let s = String(n || "").replace(/\s+/g, " ").trim();
  if (!s) return symbol;
  if (s === s.toUpperCase() && /[A-Z]{4,}/.test(s)) s = s.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  const TAILS = /[,.]?\s+(american depositary shares?|american depositary receipts?|depositary receipts?|sponsored adr|adr|ads|common stock|ordinary shares?|ord sh|ord(inary)?( [0-9.p]+)?|class [a-z]( shares)?|plc|p\.l\.c\.|inc\.?|incorporated|corporation|corp\.?|company|co\.?|limited|ltd\.?|holdings?|group|n\.v\.|s\.a\.|se|ag|sa)$/i;
  for (let i = 0, was = ""; i < 6 && was !== s; i++) { was = s; s = s.replace(TAILS, "").trim(); }
  return s.replace(/^the\s+/i, "") || symbol;
}
const RANGES = {
  "1d": { range: "1d", interval: "5m", ttl: MIN },
  "5d": { range: "5d", interval: "30m", ttl: 5 * MIN },
  "1mo": { range: "1mo", interval: "1d", ttl: 30 * MIN },
  "1y": { range: "1y", interval: "1d", ttl: 6 * HOUR },
  "5y": { range: "5y", interval: "1wk", ttl: 24 * HOUR },
};
export const RANGE_NAMES = Object.keys(RANGES);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
// One answer from the chart address: the quote (price, the day's, the year's) and the points
export function readChart(j, symbol) {
  const r = j?.chart?.result?.[0];
  if (!r?.meta) return null;
  const m = r.meta, [cur, k] = MINOR[m.currency] || [m.currency || "", 1], s = (x) => (num(x) == null ? null : +(x * k).toPrecision(10));
  const ts = r.timestamp || [], cl = r.indicators?.quote?.[0]?.close || [], t = [], c = [];
  for (let i = 0; i < ts.length; i++) if (num(cl[i]) != null) { t.push(ts[i]); c.push(s(cl[i])); }
  const price = s(m.regularMarketPrice) ?? c.at(-1) ?? null;
  const divs = Object.values(r.events?.dividends || {}).filter((d) => num(d?.amount) != null && num(d?.date) != null).map((d) => ({ t: d.date, amount: s(d.amount) })).sort((a, b) => a.t - b.t);
  const reg = m.currentTradingPeriod?.regular;
  return {
    symbol: m.symbol || symbol, name: m.instrumentType === "CRYPTOCURRENCY" ? String(m.longName || m.shortName || symbol).replace(/\s+(USD|GBP|EUR)$/, "") : plainName(m.longName || m.shortName, symbol), cur, type: m.instrumentType || "", ex: EXCHANGES[m.exchangeName] || m.fullExchangeName || m.exchangeName || "",
    tz: m.exchangeTimezoneName || "UTC", price, prev: s(m.previousClose ?? m.chartPreviousClose), base: s(m.chartPreviousClose ?? m.previousClose),
    dayHi: s(m.regularMarketDayHigh), dayLo: s(m.regularMarketDayLow), hi52: s(m.fiftyTwoWeekHigh), lo52: s(m.fiftyTwoWeekLow),
    time: num(m.regularMarketTime), open: reg && num(reg.start) && num(reg.end) ? { start: reg.start, end: reg.end } : null, t, c, divs,
  };
}
// a symbol's chart over a range (1d: every five minutes; 5d: every half hour; 1mo, 1y: daily; 5y: weekly)
export async function chart(env, symbol, range = "1d") {
  const R = RANGES[range] || RANGES["1d"];
  return cached(env, `c:${symbol}:${R.range}`, R.ttl, async () => {
    const j = await fetchJson(env, `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${R.range}&interval=${R.interval}&includePrePost=false${R.range === "1y" ? "&events=div" : ""}`);
    return readChart(j, symbol);
  });
}
// the quote: the day's chart, without its points, plus a few of them for a sparkline
export async function quote(env, symbol) {
  const q = await chart(env, symbol, "1d");
  if (!q) return null;
  const { t, c, divs, ...rest } = q, step = Math.max(1, Math.ceil(c.length / 48));
  const spark = c.filter((_, i) => i % step === 0 || i === c.length - 1), sparkT = t.filter((_, i) => i % step === 0 || i === t.length - 1);
  return { ...rest, chg: rest.price != null && rest.prev ? rest.price - rest.prev : null, chgPct: rest.price != null && rest.prev ? (rest.price / rest.prev - 1) * 100 : null, spark, sparkT };
}
// several at once, six at a time
export async function quotes(env, symbols) {
  const out = {}, list = [...new Set(symbols)];
  for (let i = 0; i < list.length; i += 6) {
    const got = await Promise.all(list.slice(i, i + 6).map((s) => quote(env, s).catch(() => null)));
    got.forEach((q, j) => { if (q) out[list[i + j]] = q; });
  }
  return out;
}
// A year of a holding, for what's worth knowing: its week, its dividends over the year, and its year's high and low
export async function yearOf(env, symbol) {
  const y = await chart(env, symbol, "1y").catch(() => null);
  if (!y || !y.c.length) return null;
  const c = y.c, wk = c.length > 5 ? (c.at(-1) / c[c.length - 6] - 1) * 100 : null, yearAgo = Date.now() / 1000 - 365 * 86400;
  const divs = y.divs.filter((d) => d.t >= yearAgo);
  return { wk, div12: divs.reduce((a, d) => a + d.amount, 0), lastDiv: divs.at(-1) || null, hi52: y.hi52 ?? Math.max(...c), lo52: y.lo52 ?? Math.min(...c), yr: (c.at(-1) / c[0] - 1) * 100 };
}
// What a currency's worth in pounds, today (GBP: 1)
export async function rates(env, curs) {
  const out = { GBP: 1 };
  await Promise.all([...new Set(curs)].filter((c) => c && c !== "GBP" && /^[A-Z]{3}$/.test(c)).map(async (c) => {
    const q = await quote(env, `${c}GBP=X`).catch(() => null);
    if (q?.price) out[c] = q.price;
  }));
  return out;
}
// Finding something to add, by name or symbol
const KINDS = new Set(["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY", "MUTUALFUND", "CURRENCY"]);
export async function search(env, q) {
  const words = String(q || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
  if (words.length < 1) return [];
  return cached(env, `s:${words.toLowerCase()}`, 24 * HOUR, async () => {
    const j = await fetchJson(env, `/v1/finance/search?q=${encodeURIComponent(words)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`);
    return (j?.quotes || []).filter((x) => x?.symbol && SYMBOL.test(String(x.symbol).toUpperCase()) && KINDS.has(x.quoteType))
      .map((x) => ({ symbol: String(x.symbol).toUpperCase(), name: plainName(x.longname || x.shortname, x.symbol), ex: x.exchDisp || EXCHANGES[x.exchange] || x.exchange || "", kind: x.typeDisp || "" })).slice(0, 8);
  });
}
// The news about each of a few symbols, together, newest first
export async function news(env, symbols) {
  const all = await Promise.all(symbols.slice(0, 10).map((s) => cached(env, `n:${s}`, 15 * MIN, async () => {
    const j = await fetchJson(env, `/v1/finance/search?q=${encodeURIComponent(s)}&quotesCount=0&newsCount=8&listsCount=0`);
    return { items: (j?.news || []).filter((n) => n?.title && /^https:\/\//.test(n.link || "") && num(n.providerPublishTime) != null)
      .map((n) => ({ title: String(n.title).slice(0, 240), src: String(n.publisher || "").slice(0, 60), link: n.link, at: n.providerPublishTime * 1000, tickers: (n.relatedTickers || []).map((x) => String(x).toUpperCase()).slice(0, 8) })) };
  }).catch(() => ({ items: [] }))));
  const seen = new Set(), out = [];
  all.forEach((r, i) => (r?.items || []).forEach((n) => {
    const key = n.link.replace(/[?#].*$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...n, for: symbols[i] });
  }));
  return out.sort((a, b) => b.at - a.at).slice(0, 30);
}
// The markets everyone sees: London, New York, Bitcoin (and the pound, for adding up what's in dollars)
export const INDICES = ["^FTSE", "^GSPC", "BTC-USD"];
// each exchange's own index, to say how a holding did against its market
export const INDEX_OF = { London: "^FTSE", Nasdaq: "^IXIC", NYSE: "^GSPC", "NYSE American": "^GSPC", "NYSE Arca": "^GSPC" };

// ---------------- what you own and follow ----------------
export async function holdings(env, userId) {
  const D = await mkdb(env);
  const { results } = await D.prepare(`SELECT h.symbol, h.name, h.qty, h.cost, h.added, a.pct AS alert FROM mk_holdings h LEFT JOIN mk_alerts a ON a.user_id = h.user_id AND a.symbol = h.symbol
    WHERE h.user_id = ? ORDER BY h.ord, h.added`).bind(userId).all();
  return results.map((r) => ({ symbol: r.symbol, name: r.name, qty: r.qty, cost: r.cost ?? null, added: r.added, alert: r.alert ?? null }));
}
const cleanText = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
// Added, or changed (how many, what was paid): { symbol, name?, qty?, cost? }
export async function putHolding(env, userId, b) {
  const D = await mkdb(env), symbol = cleanSymbol(b.symbol);
  const qty = b.qty == null || b.qty === "" ? 0 : Number(b.qty), cost = b.cost == null || b.cost === "" ? null : Number(b.cost);
  if (!Number.isFinite(qty) || qty < 0 || qty > 1e9) throw new HttpError(400, "How many you own should be a number.");
  if (cost != null && (!Number.isFinite(cost) || cost < 0 || cost > 1e9)) throw new HttpError(400, "What you paid should be a number.");
  const was = await D.prepare("SELECT name FROM mk_holdings WHERE user_id = ? AND symbol = ?").bind(userId, symbol).first();
  if (!was) {
    const n = await D.prepare("SELECT COUNT(*) AS n, MAX(ord) AS o FROM mk_holdings WHERE user_id = ?").bind(userId).first();
    if ((n?.n || 0) >= MAX_HOLDINGS) throw new HttpError(400, `You can follow up to ${MAX_HOLDINGS}.`);
    // (its name, as the market has it, where none was sent: and it must be a real one)
    let name = cleanText(b.name, 60);
    if (!name) { const q = await quote(env, symbol).catch(() => null); if (!q) throw new HttpError(404, "Couldn’t find that one."); name = q.name; }
    await D.prepare("INSERT INTO mk_holdings (user_id, symbol, name, qty, cost, ord, added) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(userId, symbol, name, qty, cost, (n?.o ?? -1) + 1, Date.now()).run();
  } else await D.prepare("UPDATE mk_holdings SET qty = ?, cost = ? WHERE user_id = ? AND symbol = ?").bind(qty, cost, userId, symbol).run();
  return holdings(env, userId);
}
export async function dropHolding(env, userId, symbol) {
  const D = await mkdb(env), s = cleanSymbol(symbol);
  await D.batch([D.prepare("DELETE FROM mk_holdings WHERE user_id = ? AND symbol = ?").bind(userId, s), D.prepare("DELETE FROM mk_alerts WHERE user_id = ? AND symbol = ?").bind(userId, s)]);
  return holdings(env, userId);
}
// your list in a new order (the symbols, as you have them)
export async function orderHoldings(env, userId, list) {
  const D = await mkdb(env), syms = (Array.isArray(list) ? list : []).slice(0, MAX_HOLDINGS).map(cleanSymbol);
  if (syms.length) await D.batch(syms.map((s, i) => D.prepare("UPDATE mk_holdings SET ord = ? WHERE user_id = ? AND symbol = ?").bind(i, userId, s)));
  return holdings(env, userId);
}

// ---------------- price alerts ----------------
// on (at pct, 3% by default) or off, for something in your list
export async function setAlert(env, userId, symbol, on, pct = 3) {
  const D = await mkdb(env), s = cleanSymbol(symbol);
  if (!(await D.prepare("SELECT 1 FROM mk_holdings WHERE user_id = ? AND symbol = ?").bind(userId, s).first())) throw new HttpError(404, "Add it to your list first.");
  const p = Number(pct);
  if (on && (!Number.isFinite(p) || p < 0.5 || p > 50)) throw new HttpError(400, "Choose a move between 0.5% and 50%.");
  if (on) await D.prepare("INSERT INTO mk_alerts (user_id, symbol, pct) VALUES (?, ?, ?) ON CONFLICT (user_id, symbol) DO UPDATE SET pct = excluded.pct").bind(userId, s, p).run();
  else await D.prepare("DELETE FROM mk_alerts WHERE user_id = ? AND symbol = ?").bind(userId, s).run();
  return holdings(env, userId);
}
// the account's alerts, for its Notifications page: { on (phones), off (turned off there), alerts: [{ symbol, name, pct }] }
export async function alertsOf(env, userId) {
  const D = await mkdb(env);
  const [{ results }, phones, off] = await Promise.all([
    D.prepare("SELECT a.symbol, a.pct, h.name FROM mk_alerts a JOIN mk_holdings h ON h.user_id = a.user_id AND h.symbol = a.symbol WHERE a.user_id = ? ORDER BY h.ord").bind(userId).all(),
    D.prepare("SELECT COUNT(*) AS n FROM mk_push WHERE user_id = ?").bind(userId).first(),
    D.prepare("SELECT 1 FROM mk_off WHERE user_id = ?").bind(userId).first(),
  ]);
  return { on: phones?.n || 0, off: !!off, alerts: results.map((r) => ({ symbol: r.symbol, name: r.name, pct: r.pct })) };
}
export async function setAlertsOff(env, userId, off) {
  const D = await mkdb(env);
  await (off ? D.prepare("INSERT OR IGNORE INTO mk_off (user_id) VALUES (?)") : D.prepare("DELETE FROM mk_off WHERE user_id = ?")).bind(userId).run();
}
// a phone's keys, as the push standard has them (a P-256 public key, uncompressed, and a 16-byte secret)
const B64U = /^[A-Za-z0-9_-]+={0,2}$/;
async function keysOk(sub) {
  const p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !B64U.test(p256dh) || !B64U.test(auth) || p256dh.length > 120 || auth.length > 40) return null;
  try {
    const pub = fromB64url(p256dh);
    if (pub.length !== 65 || pub[0] !== 4 || fromB64url(auth).length !== 16) return null;
    await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return { p256dh, auth };
  } catch (_) { return null; }
}
export async function addPhone(env, userId, sub) {
  const keys = await keysOk(sub);
  if (!sub || !pushEndpointOk(sub.endpoint) || !keys) throw new HttpError(400, "That isn’t a push subscription this server can send to.");
  const D = await mkdb(env);
  await D.prepare("INSERT INTO mk_push (endpoint, user_id, p256dh, auth, added) VALUES (?, ?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth")
    .bind(sub.endpoint, userId, keys.p256dh, keys.auth, Date.now()).run();
  return { on: true };
}
export async function dropPhone(env, userId, endpoint) {
  const D = await mkdb(env);
  await D.prepare("DELETE FROM mk_push WHERE endpoint = ? AND user_id = ?").bind(String(endpoint || ""), userId).run();
}
// the browser renewed its subscription by itself: the alerts move to the new one
export async function movePhone(env, userId, b) {
  const keys = await keysOk(b?.sub);
  if (!b?.sub || !pushEndpointOk(b.sub.endpoint) || !keys) throw new HttpError(400, "Bad request.");
  const D = await mkdb(env);
  const r = await D.prepare("UPDATE mk_push SET endpoint = ?, p256dh = ?, auth = ? WHERE endpoint = ? AND user_id = ?").bind(b.sub.endpoint, keys.p256dh, keys.auth, String(b.was || ""), userId).run();
  return { moved: !!r.meta?.changes };
}
// the day where a market is ("2026-10-29")
const dayIn = (tz, t) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)); } catch (_) { return new Date(t).toISOString().slice(0, 10); } };
const money = (v, cur) => `${{ GBP: "£", USD: "$", EUR: "€" }[cur] || ""}${v.toLocaleString("en-GB", { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 })}${{ GBP: 1, USD: 1, EUR: 1 }[cur] ? "" : cur ? " " + cur : ""}`;
// The scheduler's turn (workers/ticker, every five minutes): each alert whose holding has moved as far as asked today
// (from yesterday's close), said once that day, on every phone of the account's; held through its Quiet Hours, and said
// after them if it's still that far
export async function alertTick(env, t = Date.now()) {
  const D = await mkdb(env);
  const { results } = await D.prepare(`SELECT a.user_id, a.symbol, a.pct, a.fired, h.name, u.notify_prefs FROM mk_alerts a
    JOIN mk_holdings h ON h.user_id = a.user_id AND h.symbol = a.symbol LEFT JOIN pg_users u ON u.id = a.user_id
    WHERE a.user_id NOT IN (SELECT user_id FROM mk_off) AND a.user_id IN (SELECT user_id FROM mk_push)`).all();
  if (!results.length) return { alerts: 0, sent: 0 };
  const q = await quotes(env, results.map((r) => r.symbol));
  let sent = 0;
  for (const r of results) {
    const x = q[r.symbol];
    if (!x || x.chgPct == null || Math.abs(x.chgPct) < r.pct || !x.time || t / 1000 - x.time > 6 * 3600) continue;
    const day = dayIn(x.tz, x.time * 1000);
    if (r.fired === day || isQuiet(prefsOf({ notify_prefs: r.notify_prefs }), t)) continue;
    const claim = await D.prepare("UPDATE mk_alerts SET fired = ?3 WHERE user_id = ?1 AND symbol = ?2 AND (fired IS NULL OR fired != ?3)").bind(r.user_id, r.symbol, day).run();
    if (!claim.meta?.changes) continue;
    const up = x.chgPct >= 0, { results: phones } = await D.prepare("SELECT endpoint, p256dh, auth FROM mk_push WHERE user_id = ?").bind(r.user_id).all();
    const note = { title: `${r.name} is ${up ? "up" : "down"} ${Math.abs(x.chgPct).toFixed(1)}%`, body: `${money(x.price, x.cur)} now. Tap to see why.`, tag: `mk-${r.symbol}`, url: `./#s=${encodeURIComponent(r.symbol)}`, ttl: 6 * 3600 };
    for (const p of phones) {
      const out = await pushToSub(env, p, note).catch(() => "error");
      if (out === "gone") await D.prepare("DELETE FROM mk_push WHERE endpoint = ?").bind(p.endpoint).run();
      else if (out === "sent") sent++;
    }
  }
  return { alerts: results.length, sent };
}

// ---------------- the account going ----------------
export async function dropMarkets(env, userId) {
  const D = await mkdb(env).catch(() => null);
  if (!D) return;
  await D.batch(["mk_holdings", "mk_alerts", "mk_push", "mk_off"].map((tb) => D.prepare(`DELETE FROM ${tb} WHERE user_id = ?`).bind(userId)));
}
// what's kept, for the account's page: how many you own and follow
export async function marketsOf(env, userId) {
  const D = await mkdb(env).catch(() => null);
  if (!D) return { holdings: 0 };
  const r = await D.prepare("SELECT COUNT(*) AS n, SUM(qty > 0) AS owned FROM mk_holdings WHERE user_id = ?").bind(userId).first().catch(() => null);
  return { holdings: r?.n || 0, owned: r?.owned || 0 };
}
