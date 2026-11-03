// Serving FW's kit page in Playwright (One roof, spec §9.4 FW), for roofkit.mjs and any test that wants a module on
// the framework before Today is on it (WX's roofwxmount.mjs: open KIT + "/?module=/weather/roof/weather.js").
//   await serveKit(context, { main, ifl })   routes everything at http://kit.test:
//     /, /index.html (any query)      roofkit/index.html, with the page's CSP (spec §8.3) and Permissions-Policy
//     /kit/shared.js                  the real shared block, cut from the inflite repo's today/public/app.js between its marks
//     /kit/<file>                     roofkit/<file>
//     /weather/roof/weather.js, connector.js, *.css   the kit's fake module and connector (and empty CSS), unless the
//                                     page asked for the real one (?module=…: kit.js sets the cookie kit-module=real)
//     /weather/<file>                 MAIN's weather/ from disk
//     /chats/, /fitness/, /markets/, /mail/   a stand-in page saying which ("FITNESS STAND-IN")
//     /api/*                          404 unless the test routes it itself (page.route wins over context.route)
//     anything else                   the inflite repo's today/public/ from disk, else 404
//   Returns { log } (every path asked for, in order) .
import { readFileSync, existsSync, statSync } from 'node:fs';
import { JS_START, JS_END } from '../../iflmenu.mjs';

export const KIT = 'http://kit.test';
export const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tilecache.rainviewer.com https://tile.openstreetmap.org https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://api.open-meteo.com https://ensemble-api.open-meteo.com https://air-quality-api.open-meteo.com https://marine-api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com https://previous-runs-api.open-meteo.com https://api.bigdatacloud.net https://nominatim.openstreetmap.org https://api.rainviewer.com https://tiles.openfreemap.org; frame-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const HERE = new URL('./', import.meta.url).pathname;
const TYPES = { js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', html: 'text/html; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', json: 'application/json', webmanifest: 'application/manifest+json', txt: 'text/plain', woff2: 'font/woff2' };
const typeOf = (p) => TYPES[(/\.([a-z0-9]+)$/i.exec(p) || [])[1]?.toLowerCase()] || 'application/octet-stream';
const fileOk = (f) => existsSync(f) && statSync(f).isFile();
export const PAGE_HEADERS = { 'content-security-policy': PAGE_CSP, 'permissions-policy': 'camera=(), microphone=(), geolocation=(self)', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' };

export function sharedBlock(ifl) {
  const app = readFileSync(`${ifl}today/public/app.js`, 'utf8');
  const i = app.indexOf(JS_START), j = app.indexOf(JS_END);
  if (i < 0 || j < i) throw new Error('the shared block’s marks aren’t in today/public/app.js');
  return app.slice(i, j + JS_END.length) + '\n';
}

export async function serveKit(context, { main = new URL('../../../', import.meta.url).pathname, ifl = new URL('../../../../inflite/', import.meta.url).pathname } = {}) {
  const log = [];
  const shared = sharedBlock(ifl);
  const send = (route, body, type, extra = {}) => route.fulfill({ status: 200, body, headers: { 'content-type': type, 'cache-control': 'no-cache', ...extra } });
  const page = (route, body) => route.fulfill({ status: 200, body, headers: { 'content-type': 'text/html; charset=utf-8', ...PAGE_HEADERS } });
  await context.route(`${KIT}/**`, async (route) => {
    const req = route.request(), u = new URL(req.url()), p = decodeURIComponent(u.pathname);
    log.push(p + u.search);
    const real = /(?:^|;\s*)kit-module=real/.test(req.headers().cookie || '');
    if (p === '/' || p === '/index.html') return page(route, readFileSync(`${HERE}index.html`, 'utf8'));
    if (p === '/kit/shared.js') return send(route, shared, 'text/javascript');
    if (p.startsWith('/kit/')) { const f = HERE + p.slice(5); return fileOk(f) && !f.includes('..') ? send(route, readFileSync(f), typeOf(f)) : route.fulfill({ status: 404, body: 'not found' }); }
    if (!real && p === '/weather/roof/weather.js') return send(route, readFileSync(`${HERE}fake-module.js`), 'text/javascript');
    if (!real && p === '/weather/roof/connector.js') return send(route, readFileSync(`${HERE}fake-connector.js`), 'text/javascript');
    if (!real && /^\/weather\/roof\/[\w-]+\.css$/.test(p)) return send(route, '/* the kit: no module CSS */', 'text/css');
    if (p === '/weather/version') return send(route, JSON.stringify({ build: real ? null : '9.99' }), 'application/json');
    if (p.startsWith('/weather/')) { const f = `${main}${p.slice(1)}`; return fileOk(f) && !p.includes('..') ? send(route, readFileSync(f), typeOf(f)) : route.fulfill({ status: 404, body: 'not found' }); }
    const hub = /^\/(chats|fitness|markets|mail)\//.exec(p);
    if (hub) return page(route, `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${hub[1]}</title></head><body><h1>${hub[1].toUpperCase()} STAND-IN</h1></body></html>`);
    if (p.startsWith('/api/')) return route.fulfill({ status: 404, body: '{}', headers: { 'content-type': 'application/json' } });
    const f = `${ifl}today/public${p}`;
    if (!p.includes('..') && fileOk(f)) return send(route, readFileSync(f), typeOf(f));
    return route.fulfill({ status: 404, body: 'not found' });
  });
  return { log };
}
