// A stand-in for Markets's data (functions/_markets.js: MARKETS_DATA): Yahoo Finance's chart and search answers, for a
// few symbols, made up but shaped as Yahoo's are (London's in pence), each day's line ending at its price now; London's
// and New York's markets open from four hours ago to four from now. POST /mode { bump: { SYMBOL: pct } } moves a price
// (for the app's refresh, and alerts); { reset: true } puts them back. Every request is logged, one JSON line each.
//   node marketsmock.mjs <log file>     (port 8801)
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
const LOG = process.argv[2];
const DAY = 86400;
const START = {
  'RR.L': { name: 'Rolls-Royce Holdings plc', short: 'ROLLS-ROYCE HOLDINGS PLC ORD SH', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 877.4, price: 894, hi: 912, lo: 502, tz: 'Europe/London', divs: [[-160, 6]] },
  'TSCO.L': { name: 'Tesco PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 410.8, price: 412, hi: 421, lo: 331, tz: 'Europe/London', divs: [[-150, 8.25], [-320, 4.1]] },
  'SHEL.L': { name: 'Shell plc', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 2812, price: 2781, hi: 3010, lo: 2420, tz: 'Europe/London', divs: [[-40, 27.1], [-130, 26.8], [-220, 26.5], [-310, 26.2]] },
  'VUSA.L': { name: 'Vanguard S&P 500 UCITS ETF', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'ETF', prev: 9810, price: 9852, hi: 9990, lo: 7710, tz: 'Europe/London', divs: [] },
  AAPL: { name: 'Apple Inc.', cur: 'USD', ex: 'NMS', exd: 'NASDAQ', type: 'EQUITY', prev: 239.74, price: 241.18, hi: 247.1, lo: 169.2, tz: 'America/New_York', divs: [[-30, 0.26], [-120, 0.25], [-210, 0.25], [-300, 0.25]] },
  NVDA: { name: 'NVIDIA Corporation', cur: 'USD', ex: 'NMS', exd: 'NASDAQ', type: 'EQUITY', prev: 184.49, price: 188.92, hi: 189.4, lo: 98.1, tz: 'America/New_York', divs: [] },
  ARM: { name: 'Arm Holdings plc American Depositary Shares', cur: 'USD', ex: 'NMS', exd: 'NASDAQ', type: 'EQUITY', prev: 163.71, price: 160.4, hi: 188.8, lo: 98.4, tz: 'America/New_York', divs: [] },
  'SMT.L': { name: 'Scottish Mortgage Investment Trust PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 1012, price: 1024.5, hi: 1100, lo: 780, tz: 'Europe/London', divs: [[-100, 4.4]] },
  'ALW.L': { name: 'Alliance Witan PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 1240, price: 1236, hi: 1290, lo: 1050, tz: 'Europe/London', divs: [[-60, 6.85], [-150, 6.85]] },
  '^FTSE': { name: 'FTSE 100', cur: 'GBP', ex: 'FGI', exd: 'FTSE Index', type: 'INDEX', prev: 8360.7, price: 8412.6, hi: 8550, lo: 7400, tz: 'Europe/London', divs: [] },
  '^GSPC': { name: 'S&P 500', cur: 'USD', ex: 'SNP', exd: 'SNP', type: 'INDEX', prev: 6188.9, price: 6214.3, hi: 6300, lo: 4980, tz: 'America/New_York', divs: [] },
  'BTC-USD': { name: 'Bitcoin USD', cur: 'USD', ex: 'CCC', exd: 'CCC', type: 'CRYPTOCURRENCY', prev: 94770, price: 97420, hi: 109000, lo: 52000, tz: 'UTC', divs: [] },
  'USDGBP=X': { name: 'USD/GBP', cur: 'GBP', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 0.7734, price: 0.7731, hi: 0.83, lo: 0.74, tz: 'Europe/London', divs: [] },
};
let Q = structuredClone(START);
const log = (o) => { try { appendFileSync(LOG, JSON.stringify({ at: Date.now(), ...o }) + '\n'); } catch (_) {} };
// a smooth, made-up walk from a to b over n points, the same each time for the same symbol
function walk(sym, n, a, b, wiggle = 0.004) {
  let s = [...sym].reduce((x, c) => x * 31 + c.charCodeAt(0), 7) % 233280, v = 0; const out = [];
  for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; v += (s / 233280 - 0.5) * wiggle * 2; out.push(v); }
  return out.map((x, i) => { const f = n > 1 ? i / (n - 1) : 1; return +(a + (b - a) * f + (x - out[n - 1] * f) * a).toFixed(4); });
}
function chart(sym, range) {
  const q = Q[sym];
  if (!q) return null;
  const now = Math.floor(Date.now() / 1000), open = now - 4 * 3600, end = now + 4 * 3600;
  const spec = { '1d': [300, Math.floor((now - open) / 300) + 1, open], '5d': [1800, 5 * 16, now - 5 * DAY], '1mo': [DAY, 22, now - 30 * DAY], '1y': [DAY, 250, now - 365 * DAY], '5y': [7 * DAY, 260, now - 5 * 365 * DAY] }[range] || [300, 48, open];
  const [step, n, from] = spec;
  const ts = Array.from({ length: n }, (_, i) => Math.min(now - 60, from + i * step));
  const first = range === '1d' ? q.prev : range === '5y' ? q.lo * 0.9 : range === '1y' ? q.lo * 1.1 : q.prev * (range === '5d' ? 0.97 : 0.94);
  const close = walk(sym + range, n, first, q.price, range === '1d' ? 0.002 : 0.012);
  const events = range === '1y' && q.divs.length ? { dividends: Object.fromEntries(q.divs.map(([d, amount]) => [String(now + d * DAY), { amount, date: now + d * DAY }])) } : undefined;
  return { chart: { result: [{
    meta: { currency: q.cur, symbol: sym, exchangeName: q.ex, fullExchangeName: q.exd, instrumentType: q.type, regularMarketTime: now - 60, exchangeTimezoneName: q.tz, regularMarketPrice: q.price,
      fiftyTwoWeekHigh: q.hi, fiftyTwoWeekLow: q.lo, regularMarketDayHigh: Math.max(q.price, q.prev) * 1.004, regularMarketDayLow: Math.min(q.price, q.prev) * 0.996,
      longName: q.name, shortName: q.short || q.name, chartPreviousClose: range === '1d' ? q.prev : first, ...(range === '1d' ? { previousClose: q.prev } : {}),
      currentTradingPeriod: { regular: { timezone: 'X', start: open, end, gmtoffset: 0 } }, dataGranularity: '5m', range },
    timestamp: ts, ...(events ? { events } : {}), indicators: { quote: [{ close }] } }], error: null } };
}
function search(q) {
  const k = String(q || '').toLowerCase();
  const quotes = Object.entries(Q).filter(([s, x]) => x.type !== 'CURRENCY' && (s.toLowerCase().includes(k) || x.name.toLowerCase().includes(k)))
    .map(([s, x]) => ({ symbol: s, shortname: x.short || x.name, longname: x.name, exchange: x.ex, exchDisp: x.exd === 'NASDAQ' ? 'NASDAQ' : x.exd, quoteType: x.type, typeDisp: x.type === 'ETF' ? 'ETF' : x.type === 'INDEX' ? 'Index' : 'Equity' }));
  const sym = Object.keys(Q).find((s) => s.toLowerCase() === k);
  const now = Math.floor(Date.now() / 1000);
  const news = sym ? [
    { uuid: `${sym}-1`, title: `${Q[sym].name.split(' ')[0]} shares move after the morning's update`, publisher: 'Reuters', link: `https://example.com/news/${sym}-1`, providerPublishTime: now - 1800, relatedTickers: [sym] },
    { uuid: `${sym}-2`, title: `What analysts say about ${Q[sym].name.split(' ')[0]}`, publisher: 'Bloomberg', link: `https://example.com/news/${sym}-2`, providerPublishTime: now - 7200, relatedTickers: [sym, 'AAPL'] },
  ] : [];
  return { quotes, news };
}
createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'POST' && u.pathname === '/mode') {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      const m = JSON.parse(b || '{}');
      if (m.reset) Q = structuredClone(START);
      for (const [s, p] of Object.entries(m.bump || {})) if (Q[s]) Q[s].price = +(Q[s].prev * (1 + p / 100)).toFixed(4);
      send(200, { ok: true });
    });
    return;
  }
  const c = /^\/v8\/finance\/chart\/([^/]+)$/.exec(u.pathname);
  if (c) { const sym = decodeURIComponent(c[1]), r = u.searchParams.get('range'); log({ kind: 'chart', sym, range: r }); const j = chart(sym, r); return j ? send(200, j) : send(404, { chart: { result: null, error: { code: 'Not Found' } } }); }
  if (u.pathname === '/v1/finance/search') { const q = u.searchParams.get('q'); log({ kind: Number(u.searchParams.get('newsCount')) > 0 ? 'news' : 'search', q }); return send(200, search(q)); }
  send(404, {});
}).listen(8801, '127.0.0.1');
