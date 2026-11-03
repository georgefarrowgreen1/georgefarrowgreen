// Markets' API stood in for its module on the kit page (One roof stage 2, §9.2 roofmkmount; MK): /api/markets/* as
// functions/api/markets/[[path]].js answers it, for one signed-in account (unit/fixtures/mk.mjs), routed on a Playwright
// context. Every call kept in st.log ({ method, path, query, body }) so a test can see what left the page.
// (mocks/marketsmock.mjs is the Yahoo stand-in behind the real server, untouched; this one stands in for the server.)
//   const st = await routeMarkets(ctx, 'http://kit.test', { now })   → { log, acc, status (set 401 for a lapsed sign-in) }
import { account } from '../unit/fixtures/mk.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

export async function routeMarkets(ctx, base, { now = Date.now() } = {}) {
  const st = { log: [], acc: account(now), status: 0 };
  const j = (r, o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
  const chart = (sym, r) => {
    const q = st.acc.quotes[sym];
    if (!q) return { t: [], c: [] };
    const n = r === '1d' ? 30 : 60, step = { '1d': 600, '5d': 3600 * 2, '1mo': 86400 / 2, '1y': 86400 * 6, '5y': 86400 * 30 }[r] || 3600, t0 = Math.floor(now / 1000) - n * step;
    return { t: Array.from({ length: n }, (_, i) => t0 + i * step), c: Array.from({ length: n }, (_, i) => +(q.prev * (1 + Math.sin(i / 5) / 50 + i / n / 40)).toFixed(4)), prev: q.prev, divs: [] };
  };
  await ctx.route(`${base}/api/markets/**`, async (r) => {
    const req = r.request(), u = new URL(req.url()), p = u.pathname.replace(/^\/api\/markets\//, ''), acc = st.acc;
    st.log.push({ method: req.method(), path: p, query: u.search, body: req.postData() || null });
    if (st.status && p !== 'pic') return j(r, { error: 'Sign in first.' }, st.status);
    const syms = (u.searchParams.get('s') || '').split(',').filter(Boolean);
    switch (p) {
      case 'me': return j(r, acc);
      case 'quotes': return j(r, { quotes: Object.fromEntries(syms.filter((s) => acc.quotes[s]).map((s) => [s, acc.quotes[s]])), rates: acc.rates });
      case 'chart': return j(r, chart(u.searchParams.get('s'), u.searchParams.get('r')));
      case 'years': return j(r, { years: acc.years });
      case 'paid': return j(r, { paid: acc.paid });
      case 'income': return j(r, { income: { 'TSCO.L': { divs: acc.years['TSCO.L'].divs, got: acc.years['TSCO.L'].divs.map((d) => ({ t: d.t, amount: d.amount, qty: 1000 })), from: now - 400 * 864e5 } } });
      case 'news': return j(r, { news: u.searchParams.get('m') === '0' ? acc.news.filter((n) => syms.includes(n.for)) : acc.news, topics: acc.topics });
      case 'story': return j(r, { story: { summary: 'Tesco said sales rose over the summer.', site: 'Reuters', image: null } });
      case 'pic': return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      case 'search': { const q = (u.searchParams.get('q') || '').toLowerCase(); return j(r, { results: [{ symbol: 'BP.L', name: 'BP', ex: 'London', kind: 'share' }, { symbol: 'BARC.L', name: 'Barclays', ex: 'London', kind: 'share' }].filter((x) => x.name.toLowerCase().includes(q) || x.symbol.toLowerCase().startsWith(q)) }); }
      case 'buys': return j(r, { buys: [], made: null });
      case 'divs': return j(r, { divs: [] });
      case 'holding': {
        if (req.method() === 'DELETE') { acc.holdings = acc.holdings.filter((x) => x.symbol !== u.searchParams.get('s')); return j(r, { holdings: acc.holdings }); }
        const b = JSON.parse(req.postData() || '{}'), h = acc.holdings.find((x) => x.symbol === b.symbol);
        if (h) Object.assign(h, b); else acc.holdings.push({ alert: null, account: null, cost: null, ...b });
        return j(r, { holdings: acc.holdings });
      }
      case 'order': { const { symbols } = JSON.parse(req.postData() || '{}'); acc.holdings.sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol)); return j(r, { holdings: acc.holdings }); }
      case 'alert': { const b = JSON.parse(req.postData() || '{}'), h = acc.holdings.find((x) => x.symbol === b.symbol); if (h) h.alert = b.on ? b.pct : null; return j(r, { holdings: acc.holdings }); }
      case 'isa': { const b = JSON.parse(req.postData() || '{}'); acc.isa = { ...acc.isa, paid: b.paid }; return j(r, { isa: acc.isa }); }
      default: return j(r, { error: 'Not found.' }, 404);
    }
  });
  return st;
}
