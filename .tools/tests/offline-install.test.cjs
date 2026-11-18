const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

for (const app of ['fitness', 'markets']) {
  test(app + ' installs a complete shell, shares concurrent renewals, and retains it on a failed update', async () => {
    const source = readFileSync(join(__dirname, '../..', app, 'sw.js'), 'utf8');
    const cacheName = /const SHELL = "([^"]+)"/.exec(source)[1];
    let generation = 1, fail = false, pageRequests = 0;
    const probes = [];
    const server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      if (req.url === '/driver') return res.end('<title>Offline install</title>');
      if (req.url === '/sw.js') return res.setHeader('Content-Type', 'text/javascript').end(source + '\n// ' + generation);
      if (req.url === '/styles.css' && fail) return res.writeHead(503).end();
      if (req.url === '/') pageRequests++;
      if (req.url === '/app.js') {
        res.setHeader('ETag', '"app-1"');
        probes.push([req.method, req.headers['if-none-match']]);
        if (req.method === 'HEAD') return res.writeHead(304).end();
      }
      res.end('generation ' + generation);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:' + server.address().port + '/driver');
      await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      const requests = pageRequests;
      const replies = await page.evaluate(() => Promise.all([1, 2].map(() => new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = e => { channel.port1.close(); resolve(e.data.ifl); };
        navigator.serviceWorker.controller.postMessage({ ifl: 'renew' }, [channel.port2]);
      }))));
      assert.deepEqual(replies, ['renewed', 'renewed']);
      assert.equal(pageRequests, requests + 1);

      probes.length = 0;
      assert.equal(await page.evaluate(async () => (await fetch('/app.js')).text()), 'generation 1');
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000;
        function check() {
          if (probes.length) return resolve();
          if (Date.now() > deadline) return reject(Error('Missing background version check'));
          setTimeout(check, 20);
        }
        check();
      });
      assert.deepEqual(probes, [['HEAD', '"app-1"']]);
      generation++; fail = true;
      const state = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const result = new Promise(resolve => reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker.onstatechange = () => {
            if (['installed', 'redundant'].includes(worker.state)) resolve(worker.state);
          };
        }, { once: true }));
        await reg.update();
        return result;
      });
      assert.equal(state, 'redundant');
      await page.context().setOffline(true);
      assert.equal(await page.evaluate(async name => (await (await caches.open(name)).match('/app.js')).text(), cacheName), 'generation 1');
      assert.equal(await page.evaluate(async () => (await fetch('/app.js')).text()), 'generation 1');
    } finally {
      await browser?.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
