const { before, after } = require('node:test');
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');
const ROOT = resolve(__dirname, '../..'), HOME = 'https://gallery.test';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#456"/></svg>';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] }); });
after(async () => browser?.close());
async function fixture(assets, { width = 390, reduce = false, back = false, js = true, hash = '', missing = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 740 }, hasTouch: width <= 600, isMobile: width <= 600,
    reducedMotion: reduce ? 'reduce' : 'no-preference', javaScriptEnabled: js });
  if (back) await ctx.addInitScript(() => {
    const entries = performance.getEntriesByType.bind(performance);
    performance.getEntriesByType = type => type === 'navigation' ? [{ type: 'back_forward' }] : entries(type);
  });
  const errors = [];
  await ctx.route(`${HOME}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === missing) return route.abort();
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace('<html lang="en-GB">', '<html lang="en-GB" data-words>') });
    if (path === '/api/me') return route.fulfill({ json: { signedIn: false } });
    if (path === '/api/content') return route.fulfill({ json: { name: 'George Farrow-Green', role: 'Fitness · Outdoors', bio: 'Bikes, fitness, outdoors.' } });
    if (path === '/api/background') return route.fulfill(new URL(route.request().url()).search ? { contentType: 'image/svg+xml', body: SVG } : { json: { images: [] } });
    if (path.startsWith('/apps/')) return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    const min = resolve(ROOT, assets + path.slice(1)), file = assets && /\.(css|js)$/.test(path) && existsSync(min) ? min : resolve(ROOT, path.slice(1));
    if (existsSync(file) && statSync(file).isFile()) return route.fulfill({ body: readFileSync(file), contentType: { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' }[extname(path)] || 'application/octet-stream' });
    return route.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(`${HOME}/?keep=ride${hash}`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => document.fonts.ready);
  return { ctx, p, errors };
}

module.exports = { fixture };
