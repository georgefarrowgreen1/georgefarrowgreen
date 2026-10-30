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
//   share (cost, optional, in its own currency), its place in your list, the account it's held in (account: "isa",
//   "sipp" or "gia", optional), and when you bought it (since, optional: for the dividends it's paid you since).
// mk_alerts:   a holding you want to hear about when it moves (pct, 3% by default), and the last day it was said.
// mk_push:     each phone Markets can tell you on (its push subscription), with the sign-in it was turned on with (gone
//   when that's signed out), and how many sends to it have failed in a row (it's let go after a few).
// mk_off:      the account's own choice, from its Notifications page: Markets's alerts off everywhere.
// mk_buys:     each buy (qty > 0) and sale (qty < 0) of a holding, with the price each and the day: where a holding has
//   them, how many you own and what each cost on average are worked out from them (pooled: a sale takes shares out at
//   the average, and what it made over that is kept as made).
// mk_wrap:     the evening wrap (how your day went, once your markets have closed): off, and the last day it was sent.
// mk_isa:      what you've paid into your ISA this tax year (paid, in pounds, for the year it was said in), for its allowance.
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
        ord INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL, account TEXT, since INTEGER, PRIMARY KEY (user_id, symbol))`),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_alerts (user_id TEXT NOT NULL, symbol TEXT NOT NULL, pct REAL NOT NULL DEFAULT 3, fired TEXT, PRIMARY KEY (user_id, symbol))"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, added INTEGER NOT NULL, session TEXT, fails INTEGER NOT NULL DEFAULT 0)"),
      D.prepare("CREATE INDEX IF NOT EXISTS mk_push_user ON mk_push (user_id)"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_off (user_id TEXT PRIMARY KEY)"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_cache (k TEXT PRIMARY KEY, at INTEGER NOT NULL, v TEXT NOT NULL)"),
      D.prepare("CREATE INDEX IF NOT EXISTS mk_cache_at ON mk_cache (at)"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_isa (user_id TEXT PRIMARY KEY, year TEXT NOT NULL, paid REAL NOT NULL DEFAULT 0)"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_wrap (user_id TEXT PRIMARY KEY, off INTEGER NOT NULL DEFAULT 0, sent TEXT)"),
      D.prepare("CREATE TABLE IF NOT EXISTS mk_buys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, symbol TEXT NOT NULL, qty REAL NOT NULL, price REAL, at INTEGER NOT NULL, added INTEGER NOT NULL)"),
      D.prepare("CREATE INDEX IF NOT EXISTS mk_buys_of ON mk_buys (user_id, symbol)"),
    ]);
    // (the accounts, added to a list kept from before them)
    await D.prepare("ALTER TABLE mk_holdings ADD COLUMN account TEXT").run().catch(() => {});
    // (and when each was bought, likewise)
    await D.prepare("ALTER TABLE mk_holdings ADD COLUMN since INTEGER").run().catch(() => {});
    // (and the phones' sign-ins and failures, added to a list kept from before them)
    await D.prepare("ALTER TABLE mk_push ADD COLUMN session TEXT").run().catch(() => {});
    await D.prepare("ALTER TABLE mk_push ADD COLUMN fails INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
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
    if (v == null) {
      // (nothing there: kept as nothing for an hour at most, so it isn't asked for again on every request)
      const at = t - Math.max(0, ttl - HOUR);
      memory.set(key, { at, v: null });
      await D.prepare("INSERT OR REPLACE INTO mk_cache (k, at, v) VALUES (?, ?, ?)").bind(key, at, "null").run().catch(() => {});
      return null;
    }
    memory.set(key, { at: t, v });
    if (memory.size > 2000) memory.delete(memory.keys().next().value);
    await D.prepare("INSERT OR REPLACE INTO mk_cache (k, at, v) VALUES (?, ?, ?)").bind(key, t, JSON.stringify(v)).run().catch(() => {});
    return v;
  } catch (e) {
    if (old) return old.v == null ? null : Array.isArray(old.v) ? old.v : { ...old.v, stale: true };
    throw e;
  }
}

// prices quoted in a currency's hundredths (London's pence): said in the currency itself
const MINOR = { GBp: ["GBP", 0.01], GBX: ["GBP", 0.01], ZAc: ["ZAR", 0.01], ILA: ["ILS", 0.01] };
// the exchanges, as people know them
const EXCHANGES = { LSE: "London", IOB: "London", NMS: "Nasdaq", NGM: "Nasdaq", NCM: "Nasdaq", NAS: "Nasdaq", NYQ: "NYSE", NYS: "NYSE", ASE: "NYSE American", PCX: "NYSE Arca",
  CCC: "Crypto", CCY: "Currency", GER: "Xetra", PAR: "Paris", AMS: "Amsterdam", MIL: "Milan", EBS: "Swiss", TOR: "Toronto", ASX: "Sydney", JPX: "Tokyo", HKG: "Hong Kong",
  FGI: "FTSE", SNP: "S&P", DJI: "Dow Jones", NIM: "Nasdaq", CXI: "Cboe" };
// A name as written, where Yahoo's has its characters escaped as for a web page ("AT&amp;T" → "AT&T")
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const unescaped = (s) => String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m));
// A company's name, as people say it: "Rolls-Royce Holdings plc" → "Rolls-Royce", "NVIDIA Corporation" → "NVIDIA",
// "JPMorgan Chase &amp; Co." → "JPMorgan Chase"
export function plainName(n, symbol = "") {
  let s = unescaped(n).replace(/\s+/g, " ").trim();
  if (!s) return symbol;
  if (s === s.toUpperCase() && /[A-Z]{4,}/.test(s)) s = s.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  const TAILS = /[,.]?\s+(investment trust|investment company|american depositary shares?|american depositary receipts?|depositary receipts?|sponsored adr|adr|ads|common stock|ordinary shares?|ord sh|ord(inary)?( [0-9.p]+)?|class [a-z]( shares)?|plc|p\.l\.c\.|inc\.?|incorporated|corporation|corp\.?|company|co\.?|limited|ltd\.?|holdings?|group|n\.v\.|s\.a\.|se|ag|sa)$/i;
  // (and an & left on its own at the end, once "Co." is gone)
  for (let i = 0, was = ""; i < 6 && was !== s; i++) { was = s; s = s.replace(TAILS, "").replace(/\s*&$/, "").trim(); }
  return s.replace(/^the\s+/i, "") || symbol;
}
// What kind of thing it is: "share", "trust" (an investment trust: a company listed in London that invests in others, its
// shares bought and sold like any other's), "fund" (an ETF, or a fund bought at its day's price), "index", "crypto" or
// "currency". Trusts are told by their names (Investment Trust, Trust plc, Income Fund), and by the symbols of the
// well-known ones whose names don't say so
const TRUSTS = new Set(["ALW.L", "JGGI.L", "HICL.L", "RCP.L", "LWDB.L", "PSH.L", "UKW.L", "3IN.L", "TRIG.L", "PIN.L", "HVPE.L", "CLDN.L", "FCSS.L", "INPP.L",
  "BSIF.L", "SEQI.L", "HFEL.L", "TFIF.L", "ATST.L", "BRWM.L", "NESF.L", "GCP.L", "HGT.L", "ICGT.L", "SSON.L", "FGT.L", "PNL.L", "CGT.L", "JAM.L", "JEDT.L"]);
export function kindOf(type, name = "", symbol = "") {
  if (type === "INDEX") return "index";
  if (type === "CRYPTOCURRENCY") return "crypto";
  if (type === "CURRENCY") return "currency";
  if (type === "ETF" || type === "MUTUALFUND") return "fund";
  if (/\.L$/.test(symbol) && (TRUSTS.has(symbol) || /\binvestment (trust|company)\b|\btrust\b(?!\s+bank)|\b(income|investment|infrastructure) fund\b/i.test(name))) return "trust";
  return "share";
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
  const qt = r.indicators?.quote?.[0] || {}, ts = r.timestamp || [], cl = qt.close || [], vo = qt.volume || [], op = qt.open || [], hi = qt.high || [], lw = qt.low || [], t = [], c = [], v = [], o = [], h = [], l = [];
  // (each point's close, and its volume, open, high and low: where one's missing, its close stands in)
  for (let i = 0; i < ts.length; i++) if (num(cl[i]) != null) { const x = s(cl[i]); t.push(ts[i]); c.push(x); v.push(num(vo[i]) ?? 0); o.push(s(op[i]) ?? x); h.push(s(hi[i]) ?? x); l.push(s(lw[i]) ?? x); }
  const price = s(m.regularMarketPrice) ?? c.at(-1) ?? null;
  // (one over half the price it went ex-dividend at is taken as said in pence where the price is in pounds: Yahoo's
  // London dividends are, now and then, a hundred times out)
  const at = (tt) => { let v = c[0]; for (let i = 0; i < t.length && t[i] <= tt; i++) v = c[i]; return v; };
  const divs = Object.values(r.events?.dividends || {}).filter((d) => num(d?.amount) != null && num(d?.date) != null).map((d) => ({ t: d.date, amount: s(d.amount) }))
    .map((d) => (c.length && d.amount > at(d.t) * 0.5 ? { ...d, amount: +(d.amount / 100).toPrecision(10) } : d)).sort((a, b) => a.t - b.t);
  const reg = m.currentTradingPeriod?.regular;
  return {
    symbol: m.symbol || symbol, name: m.instrumentType === "CRYPTOCURRENCY" ? String(m.longName || m.shortName || symbol).replace(/\s+(USD|GBP|EUR)$/, "") : plainName(m.longName || m.shortName, symbol), cur, type: m.instrumentType || "", kind: kindOf(m.instrumentType, m.longName || m.shortName, m.symbol || symbol), ex: EXCHANGES[m.exchangeName] || m.fullExchangeName || m.exchangeName || "",
    tz: m.exchangeTimezoneName || "UTC", price, prev: s(m.previousClose ?? m.chartPreviousClose), base: s(m.chartPreviousClose ?? m.previousClose),
    dayHi: s(m.regularMarketDayHigh), dayLo: s(m.regularMarketDayLow), hi52: s(m.fiftyTwoWeekHigh), lo52: s(m.fiftyTwoWeekLow),
    time: num(m.regularMarketTime), open: reg && num(reg.start) && num(reg.end) ? { start: reg.start, end: reg.end } : null, t, c, v, o, h, l, divs,
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
  const { t, c, v, o, h, l, divs, ...rest } = q, step = Math.max(1, Math.ceil(c.length / 48));
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
// A year of a holding, for what's worth knowing: its week, its dividends over the year (each, and all together), and its
// year's high and low
export async function yearOf(env, symbol) {
  const y = await chart(env, symbol, "1y").catch(() => null);
  if (!y || !y.c.length) return null;
  const c = y.c, wk = c.length > 5 ? (c.at(-1) / c[c.length - 6] - 1) * 100 : null, yearAgo = Date.now() / 1000 - 365 * 86400;
  const divs = y.divs.filter((d) => d.t >= yearAgo);
  return { wk, div12: divs.reduce((a, d) => a + d.amount, 0), lastDiv: divs.at(-1) || null, divs, hi52: y.hi52 ?? Math.max(...c), lo52: y.lo52 ?? Math.min(...c), yr: (c.at(-1) / c[0] - 1) * 100,
    first: c[0], last: c.at(-1) };
}
// A symbol's dividends, as far back as they go (for what it's paid you since you bought): [{ t, amount }], kept a day
export async function dividends(env, symbol) {
  return cached(env, `d:${symbol}`, 24 * HOUR, async () => {
    const j = await fetchJson(env, `/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=3mo&events=div`);
    return readChart(j, symbol)?.divs || null;
  });
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
// Finding something to add, by name or symbol: asked for the UK's first (so London's listings come before America's
// namesakes); a London symbol typed as it's said (JAM, for JAM.L) put first, where there is one; and where the words find
// nothing, asked again without the words people add (trust, plc, fund)
const KINDS = new Set(["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY", "MUTUALFUND", "CURRENCY"]);
const FILLER = /\b(investment trust|investment company|trust|plc|fund|shares?|investments?|ltd|limited|the)\b/gi;
export async function search(env, q) {
  const words = String(q || "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (words.length < 1) return [];
  return cached(env, `s4:${words.toLowerCase()}`, 24 * HOUR, async () => {
    const ask = async (w) => {
      const j = await fetchJson(env, `/v1/finance/search?q=${encodeURIComponent(w)}&quotesCount=12&newsCount=0&listsCount=0&enableFuzzyQuery=false&region=GB&lang=en-GB`);
      return (j?.quotes || []).filter((x) => x?.symbol && SYMBOL.test(String(x.symbol).toUpperCase()) && KINDS.has(x.quoteType))
        .map((x) => ({ symbol: String(x.symbol).toUpperCase(), name: plainName(x.longname || x.shortname, x.symbol), ex: x.exchDisp || EXCHANGES[x.exchange] || x.exchange || "", kind: kindOf(x.quoteType, x.longname || x.shortname, String(x.symbol).toUpperCase()) }));
    };
    let out = await ask(words);
    if (!out.length) { const plain = words.replace(FILLER, " ").replace(/\s+/g, " ").trim(); if (plain && plain.toLowerCase() !== words.toLowerCase()) out = await ask(plain); }
    const said = [...new Set(words.toUpperCase().split(" ").filter((w) => /^(?=.*[A-Z])[A-Z0-9]{2,5}$/.test(w)))].slice(0, 2);
    const london = (await Promise.all(said.filter((t) => !out.some((x) => x.symbol === `${t}.L`)).map((t) => chart(env, `${t}.L`, "1d").catch(() => null))))
      .filter((c) => c?.price != null).map((c) => ({ symbol: c.symbol, name: c.name, ex: c.ex, kind: c.kind }));
    // (what was typed as a symbol, first: London's, then elsewhere's)
    const exact = said.flatMap((t) => [`${t}.L`, t]), rank = (x) => (exact.includes(x.symbol) ? exact.indexOf(x.symbol) : exact.length), seen = new Set();
    return [...london, ...out].filter((x) => !seen.has(x.symbol) && seen.add(x.symbol)).map((x, i) => [rank(x), i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((r) => r[2]).slice(0, 8);
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
  const { results } = await D.prepare(`SELECT h.symbol, h.name, h.qty, h.cost, h.added, h.account, h.since, a.pct AS alert,
    (SELECT COUNT(*) FROM mk_buys b WHERE b.user_id = h.user_id AND b.symbol = h.symbol) AS buys FROM mk_holdings h LEFT JOIN mk_alerts a ON a.user_id = h.user_id AND a.symbol = h.symbol
    WHERE h.user_id = ? ORDER BY h.ord, h.added`).bind(userId).all();
  return results.map((r) => ({ symbol: r.symbol, name: unescaped(r.name), qty: r.qty, cost: r.cost ?? null, added: r.added, account: r.account ?? null, since: r.since ?? null, alert: r.alert ?? null, buys: r.buys || 0 }));
}
const cleanText = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const ACCOUNTS = ["isa", "sipp", "gia"];
// Added, or changed (how many, what was paid, the account it's in, when it was bought): { symbol, name?, qty?, cost?, account?, since? }
export async function putHolding(env, userId, b) {
  const D = await mkdb(env), symbol = cleanSymbol(b.symbol);
  const qty = b.qty == null || b.qty === "" ? 0 : Number(b.qty), cost = b.cost == null || b.cost === "" ? null : Number(b.cost);
  if (!Number.isFinite(qty) || qty < 0 || qty > 1e9) throw new HttpError(400, "How many you own should be a number.");
  if (cost != null && (!Number.isFinite(cost) || cost < 0 || cost > 1e9)) throw new HttpError(400, "What you paid should be a number.");
  // (the account: left as it was where none's said; null takes it out of one)
  const account = b.account === undefined ? undefined : b.account == null || b.account === "" ? null : ACCOUNTS.includes(b.account) ? b.account : "bad";
  if (account === "bad") throw new HttpError(400, "That isn’t an account.");
  // (the day it was bought, likewise: left as it was where none's said)
  const since = b.since === undefined ? undefined : b.since == null || b.since === "" ? null : Number(b.since);
  if (since != null && (!Number.isFinite(since) || since > Date.now() + 864e5 || since < Date.UTC(1970, 0, 2))) throw new HttpError(400, "Choose a day that's been.");
  const was = await D.prepare("SELECT name, (SELECT COUNT(*) FROM mk_buys b WHERE b.user_id = ?1 AND b.symbol = ?2) AS buys FROM mk_holdings WHERE user_id = ?1 AND symbol = ?2").bind(userId, symbol).first();
  if (!was) {
    const n = await D.prepare("SELECT COUNT(*) AS n, MAX(ord) AS o FROM mk_holdings WHERE user_id = ?").bind(userId).first();
    if ((n?.n || 0) >= MAX_HOLDINGS) throw new HttpError(400, `You can follow up to ${MAX_HOLDINGS}.`);
    // (it must be a real one, priced: the name sent with it is kept, else the market's)
    const q = await quote(env, symbol);
    if (!q) throw new HttpError(404, "Couldn’t find that one.");
    const name = cleanText(b.name, 60) || q.name;
    await D.prepare("INSERT INTO mk_holdings (user_id, symbol, name, qty, cost, ord, added, account, since) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(userId, symbol, name, qty, cost, (n?.o ?? -1) + 1, Date.now(), account ?? null, since ?? null).run();
  // (one with buys has its shares and cost from them: only its account's changed here)
  } else if (was.buys) { if (account !== undefined) await D.prepare("UPDATE mk_holdings SET account = ? WHERE user_id = ? AND symbol = ?").bind(account, userId, symbol).run(); }
  else {
    const set = [["qty", qty], ["cost", cost], ["account", account], ["since", since]].filter(([, v]) => v !== undefined);
    await D.prepare(`UPDATE mk_holdings SET ${set.map(([k]) => `${k} = ?`).join(", ")} WHERE user_id = ? AND symbol = ?`).bind(...set.map(([, v]) => v), userId, symbol).run();
  }
  return holdings(env, userId);
}
export async function dropHolding(env, userId, symbol) {
  const D = await mkdb(env), s = cleanSymbol(symbol);
  await D.batch([D.prepare("DELETE FROM mk_holdings WHERE user_id = ? AND symbol = ?").bind(userId, s), D.prepare("DELETE FROM mk_alerts WHERE user_id = ? AND symbol = ?").bind(userId, s),
    D.prepare("DELETE FROM mk_buys WHERE user_id = ? AND symbol = ?").bind(userId, s)]);
  return holdings(env, userId);
}
// your list in a new order (the symbols, as you have them)
export async function orderHoldings(env, userId, list) {
  const D = await mkdb(env), syms = (Array.isArray(list) ? list : []).slice(0, MAX_HOLDINGS).map(cleanSymbol);
  if (syms.length) await D.batch(syms.map((s, i) => D.prepare("UPDATE mk_holdings SET ord = ? WHERE user_id = ? AND symbol = ?").bind(i, userId, s)));
  return holdings(env, userId);
}

// ---------------- buys and sales ----------------
// A holding's buys and sales, oldest first, and what they come to: { buys: [{ id, qty, price, at }], qty, cost (the
// average, where every buy's price is known), made (what sales made over the average, where known) }
export function pooled(buys) {
  let qty = 0, total = 0, known = true, made = 0, sold = false;
  for (const b of buys) {
    if (b.qty > 0) { qty += b.qty; if (b.price == null) known = false; else total += b.qty * b.price; continue; }
    const out = Math.min(qty, -b.qty), avg = qty ? total / qty : 0;
    sold = true;
    if (known && b.price != null) made += out * (b.price - avg); else known = false;
    total -= out * avg; qty -= out;
    if (qty <= 1e-9) { qty = 0; total = 0; }
  }
  return { qty: +qty.toFixed(6), cost: known && qty > 0 ? +(total / qty).toPrecision(10) : null, made: sold && known ? +made.toFixed(2) : null };
}
export async function buysOf(env, userId, symbol) {
  const D = await mkdb(env), s = cleanSymbol(symbol);
  const { results } = await D.prepare("SELECT id, qty, price, at FROM mk_buys WHERE user_id = ? AND symbol = ? ORDER BY at, id").bind(userId, s).all();
  return { symbol: s, buys: results, ...pooled(results) };
}
// what the buys come to, kept as the holding's own (so everything else reads it as before)
async function repool(env, userId, symbol) {
  const D = await mkdb(env), b = await buysOf(env, userId, symbol);
  await D.prepare("UPDATE mk_holdings SET qty = ?, cost = ? WHERE user_id = ? AND symbol = ?").bind(b.qty, b.cost, userId, symbol).run();
  return b;
}
// What each holding you own has paid you since you bought it: each of its dividends since, on the shares you had the
// day before it went ex-dividend (from its buys and sales, where it has them; else all of them, from the day you said
// you bought it). { SYMBOL: { paid (a share's, in its own currency, times the shares), n (how many dividends), from (the
// day counted from, ms) } }, for those with a day to count from
export async function paidOf(env, userId) {
  const D = await mkdb(env);
  const [{ results: hs }, { results: bs }] = await Promise.all([
    D.prepare("SELECT symbol, qty, since FROM mk_holdings WHERE user_id = ? AND qty > 0").bind(userId).all(),
    D.prepare("SELECT symbol, qty, at FROM mk_buys WHERE user_id = ? ORDER BY at, id").bind(userId).all()]);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10), out = {};
  const todo = hs.map((x) => ({ ...x, buys: bs.filter((b) => b.symbol === x.symbol) })).filter((x) => x.buys.length || x.since);
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(async (x) => {
    const divs = await dividends(env, x.symbol).catch(() => null);
    if (!divs) return;
    const from = x.buys.length ? x.buys[0].at : x.since;
    let paid = 0, n = 0;
    for (const d of divs) {
      const ex = day(d.t * 1000);
      // (one bought on the ex-dividend day itself is too late for it)
      let had = 0;
      if (x.buys.length) { for (const b of x.buys) if (day(b.at) < ex) had = Math.max(0, had + b.qty); }
      else if (day(from) < ex) had = x.qty;
      if (had > 1e-9) { paid += d.amount * had; n++; }
    }
    out[x.symbol] = { paid: +paid.toFixed(4), n, from };
  }));
  return out;
}
// A buy or a sale: { symbol, qty (how many), price (each, in its own currency), at (the day, ms), sold? }. The first,
// for a holding that already says how many you own, keeps those as where it started (on the day it was bought, where
// that's said, else the day it was added)
export async function addBuy(env, userId, b) {
  const D = await mkdb(env), symbol = cleanSymbol(b.symbol), n = Number(b.qty), price = b.price == null || b.price === "" ? null : Number(b.price), at = Number(b.at) || Date.now();
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw new HttpError(400, "How many should be a number.");
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 1e9)) throw new HttpError(400, "The price should be a number.");
  if (at > Date.now() + 864e5 || at < Date.UTC(1970, 0, 2)) throw new HttpError(400, "Choose a day that's been.");
  const held = await D.prepare("SELECT qty, cost, added, since, (SELECT COUNT(*) FROM mk_buys b WHERE b.user_id = ?1 AND b.symbol = ?2) AS buys FROM mk_holdings WHERE user_id = ?1 AND symbol = ?2").bind(userId, symbol).first();
  if (!held) throw new HttpError(404, "Add it to your list first.");
  if ((held.buys || 0) >= 500) throw new HttpError(400, "That's as many as one holding can keep.");
  const t = Date.now(), add = [];
  if (!held.buys && held.qty > 0) add.push(D.prepare("INSERT INTO mk_buys (user_id, symbol, qty, price, at, added) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, symbol, held.qty, held.cost, Math.min(held.since ?? held.added, at), t));
  if (b.sold) {
    const now = pooled([...(await buysOf(env, userId, symbol)).buys, ...(!held.buys && held.qty > 0 ? [{ qty: held.qty, price: held.cost }] : [])]);
    if (n > now.qty + 1e-9) throw new HttpError(400, `You own ${now.qty} of these, so can't have sold ${n}.`);
  }
  add.push(D.prepare("INSERT INTO mk_buys (user_id, symbol, qty, price, at, added) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, symbol, b.sold ? -n : n, price, at, t));
  await D.batch(add);
  return repool(env, userId, symbol);
}
export async function dropBuy(env, userId, id) {
  const D = await mkdb(env), r = await D.prepare("SELECT symbol FROM mk_buys WHERE id = ? AND user_id = ?").bind(Number(id) || 0, userId).first();
  if (!r) throw new HttpError(404, "That one's gone already.");
  await D.prepare("DELETE FROM mk_buys WHERE id = ? AND user_id = ?").bind(Number(id), userId).run();
  return repool(env, userId, r.symbol);
}

// ---------------- your ISA's allowance ----------------
export const ISA_ALLOWANCE = 20000;
// the UK's tax year a moment's in: "2026/27", from 6 April 2026 to 5 April 2027 (London's days)
export function taxYear(t = Date.now()) {
  const [y, m, d] = dayIn("Europe/London", t).split("-").map(Number), from = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return `${from}/${String((from + 1) % 100).padStart(2, "0")}`;
}
// what you've said you've paid in this tax year (nothing yet, in a new one)
export async function isaOf(env, userId, t = Date.now()) {
  const D = await mkdb(env), year = taxYear(t), r = await D.prepare("SELECT year, paid FROM mk_isa WHERE user_id = ?").bind(userId).first();
  // (said: whether what's been paid in has been said this tax year at all)
  return { year, paid: r?.year === year ? r.paid : 0, said: r?.year === year, allowance: ISA_ALLOWANCE };
}
export async function setIsa(env, userId, paid) {
  const v = Number(paid);
  if (!Number.isFinite(v) || v < 0 || v > 1e7) throw new HttpError(400, "What you've paid in should be a number.");
  const D = await mkdb(env), year = taxYear();
  await D.prepare("INSERT INTO mk_isa (user_id, year, paid) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET year = excluded.year, paid = excluded.paid").bind(userId, year, Math.round(v * 100) / 100).run();
  return isaOf(env, userId);
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
// the account's alerts, for its Notifications page: { on (phones), off (turned off there), wrap (the evening wrap on),
// alerts: [{ symbol, name, pct }] }
export async function alertsOf(env, userId) {
  const D = await mkdb(env);
  const [{ results }, phones, off, wrap] = await Promise.all([
    D.prepare("SELECT a.symbol, a.pct, h.name FROM mk_alerts a JOIN mk_holdings h ON h.user_id = a.user_id AND h.symbol = a.symbol WHERE a.user_id = ? ORDER BY h.ord").bind(userId).all(),
    D.prepare("SELECT COUNT(*) AS n FROM mk_push WHERE user_id = ?").bind(userId).first(),
    D.prepare("SELECT 1 FROM mk_off WHERE user_id = ?").bind(userId).first(),
    D.prepare("SELECT off FROM mk_wrap WHERE user_id = ?").bind(userId).first(),
  ]);
  return { on: phones?.n || 0, off: !!off, wrap: !wrap?.off, alerts: results.map((r) => ({ symbol: r.symbol, name: r.name, pct: r.pct })) };
}
// the evening wrap on or off (on, unless it's been turned off)
export async function setWrap(env, userId, on) {
  const D = await mkdb(env);
  await D.prepare("INSERT INTO mk_wrap (user_id, off) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET off = excluded.off").bind(userId, on ? 0 : 1).run();
  return { wrap: !!on };
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
// A phone to tell, with the sign-in it's turned on with (u: the signed-in user, with its session's hash). A push address
// another account here is still signed in with stays theirs, so one that's somehow learnt can't be taken over; and an
// account keeps its ten newest
export async function addPhone(env, u, sub) {
  const keys = await keysOk(sub);
  if (!sub || !pushEndpointOk(sub.endpoint) || sub.endpoint.length > 1000 || !keys) throw new HttpError(400, "That isn’t a push subscription this server can send to.");
  const D = await mkdb(env);
  await D.prepare(`INSERT INTO mk_push (endpoint, user_id, p256dh, auth, added, session, fails) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = ?2, p256dh = ?3, auth = ?4, added = ?5, session = ?6, fails = 0
    WHERE mk_push.user_id = ?2 OR mk_push.session IS NULL OR NOT EXISTS (SELECT 1 FROM pg_sessions WHERE hash = mk_push.session)`)
    .bind(sub.endpoint, u.id, keys.p256dh, keys.auth, Date.now(), u.sessionHash || null).run();
  await D.prepare("DELETE FROM mk_push WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM mk_push WHERE user_id = ?1 ORDER BY added DESC LIMIT 10)").bind(u.id).run();
  return { on: true };
}
export async function dropPhone(env, userId, endpoint) {
  const D = await mkdb(env);
  await D.prepare("DELETE FROM mk_push WHERE endpoint = ? AND user_id = ?").bind(String(endpoint || ""), userId).run();
}
// the browser renewed its subscription by itself: the alerts move to the new one
export async function movePhone(env, u, b) {
  const keys = await keysOk(b?.sub);
  if (!b?.sub || !pushEndpointOk(b.sub.endpoint) || b.sub.endpoint.length > 1000 || !keys) throw new HttpError(400, "Bad request.");
  const D = await mkdb(env);
  const r = await D.prepare("UPDATE mk_push SET endpoint = ?, p256dh = ?, auth = ?, session = ?, fails = 0 WHERE endpoint = ? AND user_id = ?").bind(b.sub.endpoint, keys.p256dh, keys.auth, u.sessionHash || null, String(b.was || ""), u.id).run();
  return { moved: !!r.meta?.changes };
}
// An account's phones told (those whose sign-in is still there), all at once: one that's unsubscribed is forgotten, and
// one that's failed five times in a row is let go. How many were told
const MAX_FAILS = 5;
async function tell(env, D, userId, note) {
  const { results: phones } = await D.prepare("SELECT endpoint, p256dh, auth, fails FROM mk_push WHERE user_id = ? AND (session IS NULL OR session IN (SELECT hash FROM pg_sessions))").bind(userId).all();
  const outs = await Promise.all(phones.map((p) => pushToSub(env, p, note).catch(() => "error")));
  const later = [];
  outs.forEach((out, i) => {
    const p = phones[i];
    if (out === "gone" || (out === "error" && p.fails + 1 >= MAX_FAILS)) later.push(D.prepare("DELETE FROM mk_push WHERE endpoint = ?").bind(p.endpoint));
    else if (out === "error") later.push(D.prepare("UPDATE mk_push SET fails = fails + 1 WHERE endpoint = ?").bind(p.endpoint));
    else if (p.fails) later.push(D.prepare("UPDATE mk_push SET fails = 0 WHERE endpoint = ?").bind(p.endpoint));
  });
  if (later.length) await D.batch(later);
  return outs.filter((o) => o === "sent").length;
}
// (once a turn: phones whose sign-in has gone, accounts being deleted, and the markets' data no one's asked for in days)
async function tidy(D, t) {
  await D.batch([
    D.prepare("DELETE FROM mk_push WHERE session IS NOT NULL AND session NOT IN (SELECT hash FROM pg_sessions)"),
    D.prepare("DELETE FROM mk_push WHERE user_id IN (SELECT id FROM pg_users WHERE delete_at IS NOT NULL)"),
    D.prepare("DELETE FROM mk_cache WHERE at < ?").bind(t - 3 * 24 * HOUR),
  ]).catch(() => {});
}
// the day where a market is ("2026-10-29")
const dayIn = (tz, t) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)); } catch (_) { return new Date(t).toISOString().slice(0, 10); } };
const money = (v, cur) => `${{ GBP: "£", USD: "$", EUR: "€" }[cur] || ""}${v.toLocaleString("en-GB", { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 })}${{ GBP: 1, USD: 1, EUR: 1 }[cur] ? "" : cur ? " " + cur : ""}`;
// The scheduler's turn (workers/ticker, every five minutes): each alert whose holding has moved as far as asked today
// (from yesterday's close), said once that day, on every phone of the account's; held through its Quiet Hours, and said
// after them if it's still that far
export async function alertTick(env, t = Date.now()) {
  const D = await mkdb(env);
  await tidy(D, t);
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
    const up = x.chgPct >= 0;
    const note = { title: `${r.name} is ${up ? "up" : "down"} ${Math.abs(x.chgPct).toFixed(1)}%`, body: `${money(x.price, x.cur)} now. Tap to see why.`, tag: `mk-${r.symbol}`, url: `./#s=${encodeURIComponent(r.symbol)}`, ttl: 6 * 3600 };
    sent += await tell(env, D, r.user_id, note);
  }
  return { alerts: results.length, sent };
}

// The evening wrap: once a weekday, when every market you hold that traded today has closed, how your day went: up or
// down, by how much, and what did most of it. Once a day, on every phone of the account's; held through its Quiet Hours
// (and not sent at all if they last till the day's over)
const LONDON = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export async function wrapTick(env, t = Date.now()) {
  const parts = Object.fromEntries(LONDON.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  // (London's weekdays, from when its market's closed)
  if (["Sat", "Sun"].includes(parts.weekday) || Number(parts.hour) * 60 + Number(parts.minute) < 16 * 60 + 35) return { wraps: 0 };
  const D = await mkdb(env), today = dayIn("Europe/London", t);
  const { results } = await D.prepare(`SELECT h.user_id, h.symbol, h.name, h.qty, u.notify_prefs FROM mk_holdings h LEFT JOIN mk_wrap w ON w.user_id = h.user_id LEFT JOIN pg_users u ON u.id = h.user_id
    WHERE h.qty > 0 AND COALESCE(w.off, 0) = 0 AND (w.sent IS NULL OR w.sent != ?) AND h.user_id IN (SELECT user_id FROM mk_push)`).bind(today).all();
  if (!results.length) return { wraps: 0 };
  const q = await quotes(env, results.map((r) => r.symbol)), fx = await rates(env, Object.values(q).map((x) => x.cur));
  const users = new Map();
  for (const r of results) { if (!users.has(r.user_id)) users.set(r.user_id, { prefs: r.notify_prefs, list: [] }); users.get(r.user_id).list.push(r); }
  let wraps = 0;
  for (const [userId, u] of users) {
    const held = u.list.map((r) => ({ ...r, x: q[r.symbol] })).filter((r) => r.x?.price != null && r.x.prev && fx[r.x.cur] != null);
    // (what traded today, by its own market's day; crypto never closes, so isn't waited for)
    const traded = held.filter((r) => r.x.kind !== "crypto" && r.x.time && dayIn(r.x.tz, r.x.time * 1000) === dayIn(r.x.tz, t));
    if (!traded.length || traded.some((r) => r.x.open && r.x.open.end > t / 1000) || isQuiet(prefsOf({ notify_prefs: u.prefs }), t)) continue;
    const day = (r) => (r.x.price - r.x.prev) * r.qty * fx[r.x.cur], value = held.reduce((a, r) => a + r.x.price * r.qty * fx[r.x.cur], 0), total = held.reduce((a, r) => a + day(r), 0);
    const by = [...held].sort((a, b) => day(b) - day(a)), top = by[0], low = by.at(-1), pctDay = value - total ? (total / (value - total)) * 100 : 0;
    const claim = await D.prepare("INSERT INTO mk_wrap (user_id, sent) VALUES (?1, ?2) ON CONFLICT (user_id) DO UPDATE SET sent = ?2 WHERE mk_wrap.sent IS NULL OR mk_wrap.sent != ?2").bind(userId, today).run();
    if (!claim.meta?.changes) continue;
    const pounds = (v) => money(Math.abs(v), "GBP"), flat = Math.abs(total) < 1;
    const note = {
      title: flat ? "A flat day" : `${total >= 0 ? "Up" : "Down"} ${pounds(total)} today`,
      body: flat ? `Your portfolio closed at ${pounds(value)}, little changed.`
        : `Your portfolio is ${total >= 0 ? "up" : "down"} ${Math.abs(pctDay).toFixed(1)}% at ${pounds(value)}. ` + (total >= 0
          ? `${top.name} did most of the work, adding ${pounds(day(top))}.` : `${low.name} took away most, ${pounds(day(low))}.`),
      tag: "mk-wrap", url: "./", ttl: 6 * 3600,
    };
    await tell(env, D, userId, note);
    wraps++;
  }
  return { wraps };
}

// ---------------- the account going ----------------
export async function dropMarkets(env, userId) {
  const D = await mkdb(env).catch(() => null);
  if (!D) return;
  await D.batch(["mk_holdings", "mk_alerts", "mk_push", "mk_off", "mk_isa", "mk_wrap", "mk_buys"].map((tb) => D.prepare(`DELETE FROM ${tb} WHERE user_id = ?`).bind(userId)));
}
// what's kept, for the account's page: how many you own and follow
export async function marketsOf(env, userId) {
  const D = await mkdb(env).catch(() => null);
  if (!D) return { holdings: 0 };
  const r = await D.prepare("SELECT COUNT(*) AS n, SUM(qty > 0) AS owned FROM mk_holdings WHERE user_id = ?").bind(userId).first().catch(() => null);
  return { holdings: r?.n || 0, owned: r?.owned || 0 };
}
