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
  'JAM.L': { name: 'JPMorgan American Investment Trust plc', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 1094, price: 1101, hi: 1150, lo: 860, tz: 'Europe/London', divs: [[-120, 4.5]] },
  'VWRL.L': { name: 'Vanguard FTSE All-World UCITS ETF', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'ETF', prev: 11850, price: 11902, hi: 12100, lo: 9800, tz: 'Europe/London', divs: [[-70, 41.2], [-160, 38.9], [-250, 40.1], [-340, 37.5]] },
  'ISF.L': { name: 'iShares Core FTSE 100 UCITS ETF GBP (Dist)', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'ETF', prev: 846.2, price: 851.4, hi: 862, lo: 760, tz: 'Europe/London', divs: [[-50, 9.8], [-140, 7.1], [-230, 10.4], [-320, 6.6]] },
  SPY: { name: 'SPDR S&P 500 ETF Trust', cur: 'USD', ex: 'PCX', exd: 'NYSEArca', type: 'ETF', prev: 617.4, price: 620.1, hi: 628, lo: 497, tz: 'America/New_York', divs: [[-20, 1.76], [-110, 1.69], [-200, 1.74], [-290, 1.59]] },
  '^FTSE': { name: 'FTSE 100', cur: 'GBP', ex: 'FGI', exd: 'FTSE Index', type: 'INDEX', prev: 8360.7, price: 8412.6, hi: 8550, lo: 7400, tz: 'Europe/London', divs: [] },
  '^GSPC': { name: 'S&P 500', cur: 'USD', ex: 'SNP', exd: 'SNP', type: 'INDEX', prev: 6188.9, price: 6214.3, hi: 6300, lo: 4980, tz: 'America/New_York', divs: [] },
  'BTC-USD': { name: 'Bitcoin USD', cur: 'USD', ex: 'CCC', exd: 'CCC', type: 'CRYPTOCURRENCY', prev: 94770, price: 97420, hi: 109000, lo: 52000, tz: 'UTC', divs: [] },
  'AZN.L': { name: 'AstraZeneca PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 11880, price: 11962, hi: 12900, lo: 10100, tz: 'Europe/London', divs: [[-90, 162], [-250, 104]] },
  'HSBA.L': { name: 'HSBC Holdings plc', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 902.4, price: 897.1, hi: 940, lo: 690, tz: 'Europe/London', divs: [[-70, 8], [-160, 8]] },
  'ULVR.L': { name: 'Unilever PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 4511, price: 4538, hi: 4900, lo: 4300, tz: 'Europe/London', divs: [[-40, 37.4]] },
  'BP.L': { name: 'BP p.l.c.', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 421.6, price: 416.9, hi: 480, lo: 360, tz: 'Europe/London', divs: [[-60, 6.3]] },
  'LLOY.L': { name: 'Lloyds Banking Group plc', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 78.12, price: 78.94, hi: 82, lo: 52, tz: 'Europe/London', divs: [] },
  'VUKE.L': { name: 'Vanguard FTSE 100 UCITS ETF', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'ETF', prev: 3921, price: 3944, hi: 4010, lo: 3480, tz: 'Europe/London', divs: [] },
  'VFEM.L': { name: 'Vanguard FTSE Emerging Markets UCITS ETF', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'ETF', prev: 4870, price: 4851, hi: 5020, lo: 4210, tz: 'Europe/London', divs: [] },
  'FCIT.L': { name: 'F&C Investment Trust PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 1186, price: 1192, hi: 1220, lo: 1010, tz: 'Europe/London', divs: [] },
  'CTY.L': { name: 'City of London Investment Trust plc', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 472, price: 474.5, hi: 490, lo: 410, tz: 'Europe/London', divs: [] },
  'PCT.L': { name: 'Polar Capital Technology Trust plc', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 398, price: 404.2, hi: 420, lo: 280, tz: 'Europe/London', divs: [] },
  'MNKS.L': { name: 'Monks Investment Trust PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 1402, price: 1398, hi: 1450, lo: 1130, tz: 'Europe/London', divs: [] },
  'RCP.L': { name: 'RIT Capital Partners plc', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 1980, price: 1992, hi: 2050, lo: 1760, tz: 'Europe/London', divs: [] },
  'MYI.L': { name: 'Murray International Trust PLC', cur: 'GBp', ex: 'LSE', exd: 'London', type: 'EQUITY', prev: 271, price: 272.5, hi: 280, lo: 238, tz: 'Europe/London', divs: [] },
  MSFT: { name: 'Microsoft Corporation', cur: 'USD', ex: 'NMS', exd: 'NASDAQ', type: 'EQUITY', prev: 512.3, price: 516.8, hi: 530, lo: 380, tz: 'America/New_York', divs: [] },
  GOOGL: { name: 'Alphabet Inc.', cur: 'USD', ex: 'NMS', exd: 'NASDAQ', type: 'EQUITY', prev: 241.6, price: 238.9, hi: 256, lo: 150, tz: 'America/New_York', divs: [] },
  AMZN: { name: 'Amazon.com, Inc.', cur: 'USD', ex: 'NMS', exd: 'NASDAQ', type: 'EQUITY', prev: 226.1, price: 229.4, hi: 242, lo: 170, tz: 'America/New_York', divs: [] },
  META: { name: 'Meta Platforms, Inc.', cur: 'USD', ex: 'NMS', exd: 'NASDAQ', type: 'EQUITY', prev: 736.2, price: 741.9, hi: 790, lo: 480, tz: 'America/New_York', divs: [] },
  '^FTMC': { name: 'FTSE 250', cur: 'GBP', ex: 'FGI', exd: 'FTSE Index', type: 'INDEX', prev: 21480, price: 21562, hi: 22100, lo: 18900, tz: 'Europe/London', divs: [] },
  '^GDAXI': { name: 'DAX PERFORMANCE-INDEX', cur: 'EUR', ex: 'GER', exd: 'XETRA', type: 'INDEX', prev: 23890, price: 24012, hi: 24500, lo: 18800, tz: 'Europe/Berlin', divs: [] },
  '^FCHI': { name: 'CAC 40', cur: 'EUR', ex: 'PAR', exd: 'Paris', type: 'INDEX', prev: 7812, price: 7790, hi: 8250, lo: 7000, tz: 'Europe/Paris', divs: [] },
  '^STOXX50E': { name: 'EURO STOXX 50 I', cur: 'EUR', ex: 'STO', exd: 'STOXX', type: 'INDEX', prev: 5402, price: 5418, hi: 5600, lo: 4600, tz: 'Europe/Berlin', divs: [] },
  '^DJI': { name: 'Dow Jones Industrial Average', cur: 'USD', ex: 'DJI', exd: 'DJI', type: 'INDEX', prev: 44210, price: 44380, hi: 45100, lo: 37600, tz: 'America/New_York', divs: [] },
  '^IXIC': { name: 'NASDAQ Composite', cur: 'USD', ex: 'NIM', exd: 'Nasdaq GIDS', type: 'INDEX', prev: 20410, price: 20532, hi: 20900, lo: 15200, tz: 'America/New_York', divs: [] },
  '^N225': { name: 'Nikkei 225', cur: 'JPY', ex: 'OSA', exd: 'Osaka', type: 'INDEX', prev: 39820, price: 39510, hi: 42400, lo: 31100, tz: 'Asia/Tokyo', divs: [] },
  '^HSI': { name: 'HANG SENG INDEX', cur: 'HKD', ex: 'HKG', exd: 'HKSE', type: 'INDEX', prev: 23410, price: 23690, hi: 24900, lo: 16400, tz: 'Asia/Hong_Kong', divs: [] },
  'GBPUSD=X': { name: 'GBP/USD', cur: 'USD', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 1.2934, price: 1.2951, hi: 1.36, lo: 1.21, tz: 'Europe/London', divs: [] },
  'GBPEUR=X': { name: 'GBP/EUR', cur: 'EUR', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 1.1842, price: 1.1856, hi: 1.21, lo: 1.15, tz: 'Europe/London', divs: [] },
  'EURUSD=X': { name: 'EUR/USD', cur: 'USD', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 1.0922, price: 1.0924, hi: 1.18, lo: 1.02, tz: 'Europe/London', divs: [] },
  'USDJPY=X': { name: 'USD/JPY', cur: 'JPY', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 151.42, price: 150.88, hi: 161.9, lo: 139.6, tz: 'Europe/London', divs: [] },
  'USDCHF=X': { name: 'USD/CHF', cur: 'CHF', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 0.8812, price: 0.8796, hi: 0.92, lo: 0.78, tz: 'Europe/London', divs: [] },
  'EURGBP=X': { name: 'EUR/GBP', cur: 'GBP', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 0.8445, price: 0.8435, hi: 0.87, lo: 0.82, tz: 'Europe/London', divs: [] },
  'JPYGBP=X': { name: 'JPY/GBP', cur: 'GBP', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 0.005107, price: 0.005124, hi: 0.0056, lo: 0.0048, tz: 'Europe/London', divs: [] },
  'CHFGBP=X': { name: 'CHF/GBP', cur: 'GBP', ex: 'CCY', exd: 'CCY', type: 'CURRENCY', prev: 0.8775, price: 0.8780, hi: 0.93, lo: 0.85, tz: 'Europe/London', divs: [] },
  'GC=F': { name: 'Gold Dec 26', cur: 'USD', ex: 'CMX', exd: 'COMEX', type: 'FUTURE', prev: 3342.1, price: 3368.4, hi: 3510, lo: 2560, tz: 'America/New_York', divs: [] },
  'SI=F': { name: 'Silver Dec 26', cur: 'USD', ex: 'CMX', exd: 'COMEX', type: 'FUTURE', prev: 38.42, price: 38.11, hi: 40.1, lo: 28.3, tz: 'America/New_York', divs: [] },
  'BZ=F': { name: 'Brent Crude Oil Last Day Financ', cur: 'USD', ex: 'NYM', exd: 'NY Mercantile', type: 'FUTURE', prev: 66.82, price: 67.41, hi: 82.6, lo: 58.4, tz: 'America/New_York', divs: [] },
  'CL=F': { name: 'Crude Oil Dec 26', cur: 'USD', ex: 'NYM', exd: 'NY Mercantile', type: 'FUTURE', prev: 63.12, price: 63.88, hi: 78.4, lo: 55.1, tz: 'America/New_York', divs: [] },
  'NG=F': { name: 'Natural Gas Dec 26', cur: 'USD', ex: 'NYM', exd: 'NY Mercantile', type: 'FUTURE', prev: 3.412, price: 3.338, hi: 4.9, lo: 2.6, tz: 'America/New_York', divs: [] },
  'HG=F': { name: 'Copper Dec 26', cur: 'USD', ex: 'CMX', exd: 'COMEX', type: 'FUTURE', prev: 4.812, price: 4.861, hi: 5.4, lo: 4.0, tz: 'America/New_York', divs: [] },
  '^IRX': { name: '13 WEEK TREASURY BILL', cur: 'USD', ex: 'CXI', exd: 'Cboe Indices', type: 'INDEX', prev: 4.212, price: 4.205, hi: 5.3, lo: 4.0, tz: 'America/Chicago', divs: [] },
  '^FVX': { name: 'Treasury Yield 5 Years', cur: 'USD', ex: 'CXI', exd: 'Cboe Indices', type: 'INDEX', prev: 3.882, price: 3.914, hi: 4.6, lo: 3.4, tz: 'America/Chicago', divs: [] },
  '^TNX': { name: 'CBOE Interest Rate 10 Year T No', cur: 'USD', ex: 'CXI', exd: 'Cboe Indices', type: 'INDEX', prev: 4.268, price: 4.301, hi: 4.8, lo: 3.6, tz: 'America/Chicago', divs: [] },
  '^TYX': { name: 'Treasury Yield 30 Years', cur: 'USD', ex: 'CXI', exd: 'Cboe Indices', type: 'INDEX', prev: 4.822, price: 4.851, hi: 5.1, lo: 4.1, tz: 'America/Chicago', divs: [] },
  'ETH-USD': { name: 'Ethereum USD', cur: 'USD', ex: 'CCC', exd: 'CCC', type: 'CRYPTOCURRENCY', prev: 3610, price: 3702, hi: 4100, lo: 1500, tz: 'UTC', divs: [] },
  'SOL-USD': { name: 'Solana USD', cur: 'USD', ex: 'CCC', exd: 'CCC', type: 'CRYPTOCURRENCY', prev: 182.4, price: 178.9, hi: 260, lo: 110, tz: 'UTC', divs: [] },
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
// each point's open (near the close before it), high and low (a little either side)
function ohlc(seed, close) {
  const j = walk(seed + 'j', close.length, 1, 1, 0.5).map((x) => Math.abs(x));
  const open = close.map((c, i) => +(i ? close[i - 1] * (1 + (j[i] - 0.5) * 0.004) : c).toFixed(4));
  return { open, high: close.map((c, i) => +(Math.max(c, open[i]) * (1 + j[i] * 0.006)).toFixed(4)), low: close.map((c, i) => +(Math.min(c, open[i]) * (1 - j[(i + 7) % j.length] * 0.006)).toFixed(4)) };
}
function chart(sym, range) {
  const q = Q[sym];
  if (!q) return null;
  const now = Math.floor(Date.now() / 1000), open = now - 4 * 3600, end = now + 4 * 3600;
  const spec = { '1d': [300, Math.floor((now - open) / 300) + 1, open], '5d': [1800, 5 * 16, now - 5 * DAY], '1mo': [DAY, 22, now - 30 * DAY], '1y': [DAY, 250, now - 365 * DAY], '5y': [7 * DAY, 260, now - 5 * 365 * DAY], max: [91 * DAY, 40, now - 10 * 365 * DAY] }[range] || [300, 48, open];
  const [step, n, from] = spec;
  const ts = Array.from({ length: n }, (_, i) => Math.min(now - 60, from + i * step));
  const first = range === '1d' ? q.prev : range === '5y' || range === 'max' ? q.lo * 0.9 : range === '1y' ? q.lo * 1.1 : q.prev * (range === '5d' ? 0.97 : 0.94);
  const close = walk(sym + range, n, first, q.price, range === '1d' ? 0.002 : 0.012);
  // (a year's dividends; and for all of it, the same each year back ten years)
  const divs = range === '1y' ? q.divs : range === 'max' ? Array.from({ length: 10 }, (_, y) => q.divs.map(([d, a]) => [d - y * 365, a])).flat() : [];
  const events = divs.length ? { dividends: Object.fromEntries(divs.map(([d, amount]) => [String(now + d * DAY), { amount, date: now + d * DAY }])) } : undefined;
  return { chart: { result: [{
    meta: { currency: q.cur, symbol: sym, exchangeName: q.ex, fullExchangeName: q.exd, instrumentType: q.type, regularMarketTime: now - 60, exchangeTimezoneName: q.tz, regularMarketPrice: q.price,
      fiftyTwoWeekHigh: q.hi, fiftyTwoWeekLow: q.lo, regularMarketDayHigh: Math.max(q.price, q.prev) * 1.004, regularMarketDayLow: Math.min(q.price, q.prev) * 0.996,
      longName: q.name, shortName: q.short || q.name, chartPreviousClose: range === '1d' ? q.prev : first, ...(range === '1d' ? { previousClose: q.prev } : {}),
      currentTradingPeriod: { regular: { timezone: 'X', start: open, end, gmtoffset: 0 } }, dataGranularity: '5m', range },
    timestamp: ts, ...(events ? { events } : {}), indicators: { quote: [{ close, volume: walk(sym + range + 'v', n, 1, 1, 0.6).map((x) => Math.round(Math.abs(x) * 2e6 + 4e5)), ...ohlc(sym + range, close) }] } }], error: null } };
}
function search(q) {
  const k = String(q || '').toLowerCase();
  const quotes = Object.entries(Q).filter(([s, x]) => x.type !== 'CURRENCY' && (s.toLowerCase().includes(k) || x.name.toLowerCase().includes(k)))
    .map(([s, x]) => ({ symbol: s, shortname: x.short || x.name, longname: x.name, exchange: x.ex, exchDisp: x.exd === 'NASDAQ' ? 'NASDAQ' : x.exd, quoteType: x.type, typeDisp: x.type === 'ETF' ? 'ETF' : x.type === 'INDEX' ? 'Index' : 'Equity' }));
  const sym = Object.keys(Q).find((s) => s.toLowerCase() === k);
  const now = Math.floor(Date.now() / 1000);
  const news = sym ? [
    { uuid: `${sym}-1`, title: `${Q[sym].name.split(' ')[0]} shares move after the morning's update`, publisher: 'Reuters', link: `https://example.com/news/${sym}-1`, providerPublishTime: now - 1800, relatedTickers: [sym],
      thumbnail: { resolutions: [{ url: `https://example.com/thumb/${sym}-1.png`, width: 140, height: 140, tag: '140x140' }, { url: `https://example.com/thumb/${sym}-1-big.png`, width: 4000, height: 3000, tag: 'original' }] } },
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
  // (a story's page, as a publisher writes its head for link previews; and a picture: a tiny PNG)
  if (u.pathname === '/page') {
    const link = u.searchParams.get('u') || '', m = /\/news\/(.+)-(\d)$/.exec(link), sym = m && decodeURIComponent(m[1]), q = sym && Q[sym];
    log({ kind: 'page', link });
    if (!q) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<html><head><title>Not found</title></head></html>'); }
    const first = q.name.split(' ')[0];
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><html><head><title>${first} | Example News</title><meta property="og:site_name" content="Example News"><meta property="og:title" content="${first} shares move after the morning&#39;s update">`
      + `<meta name="description" content="${first} said more about its plans this morning, and its shares moved on it. Here&#39;s what it said, and what it means.">`
      + `<meta property="og:image" content="https://example.com/img/${encodeURIComponent(sym)}.png"><meta property="article:published_time" content="${new Date(Date.now() - 1800e3).toISOString()}"></head><body><p>The story.</p></body></html>`);
  }
  if (u.pathname === '/pic') { log({ kind: 'pic', u: u.searchParams.get('u') }); res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNgYGD4z8DAwMDEwMAAAA0UAQGV0NnCAAAAAElFTkSuQmCC', 'base64')); }
  if (u.pathname === '/v1/finance/search') { const q = u.searchParams.get('q'); log({ kind: Number(u.searchParams.get('newsCount')) > 0 ? 'news' : 'search', q }); return send(200, search(q)); }
  send(404, {});
}).listen(8801, '127.0.0.1');
