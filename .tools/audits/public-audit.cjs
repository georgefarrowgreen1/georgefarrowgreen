// Read-only public browser/WCAG audit. Install .tools/tests dependencies first.
// AUDIT_OUTPUT=/tmp/inflite-public.json node .tools/audits/public-audit.cjs
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');
const req = createRequire(resolve(__dirname, '../tests/package.json'));
const { chromium } = req('playwright');
const hosts = ['inflite.ai', 'auth.inflite.ai', 'account.inflite.ai', 'chat.inflite.ai', 'weather.inflite.ai', 'fitness.inflite.ai', 'finance.inflite.ai', 'email.inflite.ai', 'status.inflite.ai'];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const axe = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8'), results = [];
  try {
    for (const width of [390, 1440]) for (const host of hosts) {
      const mobile = width === 390;
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile,
        serviceWorkers: 'block', userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' : undefined });
      const page = await context.newPage(), errors = [], failed = [], httpErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', r => failed.push({ url: r.url(), error: r.failure()?.errorText }));
      page.on('response', r => { if (r.status() >= 400) httpErrors.push({ url: r.url(), status: r.status() }); });
      try {
        const response = await page.goto(`https://${host}/`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(axe);
        const data = await page.evaluate(async () => {
          const audit = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
          const nav = performance.getEntriesByType('navigation')[0];
          return { title: document.title, overflow: document.documentElement.scrollWidth > innerWidth + 1,
            ttfbMs: Math.round(nav.responseStart), domMs: Math.round(nav.domContentLoadedEventEnd),
            bytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, nav.transferSize),
            violations: audit.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })),
            gestureCancelled: ['gesturestart', 'gesturechange', 'gestureend'].some(type => !document.dispatchEvent(new Event(type, { cancelable: true, bubbles: true }))) };
        });
        results.push({ host, width, status: response.status(), finalURL: page.url(), errors, failed, httpErrors, ...data });
      } catch (error) { results.push({ host, width, error: error.message, errors, failed, httpErrors }); }
      await context.close();
      console.log(JSON.stringify(results.at(-1)));
    }
  } finally { await browser.close(); }
  writeFileSync(process.env.AUDIT_OUTPUT || '/tmp/inflite-public.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  if (results.some(r => r.error || r.status !== 200 || r.errors.length || r.failed.length || r.httpErrors.length || r.overflow || r.violations.length || r.gestureCancelled)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
