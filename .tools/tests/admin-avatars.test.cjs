// Render the real Admin module and Account CSS with synthetic accounts; no signed-in session is needed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const ROOT = resolve(__dirname, '../..');
const app = readFileSync(resolve(ROOT, 'account/app.js'), 'utf8');
const helper = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css"><main></main><script type="module">
import { setup } from '/admin.js';
${helper('function h(spec, props, ...kids)', 'const ICONS =')}
${helper('function photo(src, props = {}, spec = "img")', 'function avatar(')}
const SHOWN = new Set(), still = { matches: true }, ms = () => 0, tok = () => 'linear';
const users = ['portrait', 'landscape', 'initials'].map((id, i) => ({
  id, handle: id, name: 'Test ' + id, email: id + '@example.test',
  avatar_at: i < 2 ? 1 : null, created_at: Date.now(), last_seen: Date.now(),
  passkeys: 1, sessions: 1
}));
const main = document.querySelector('main');
const render = view => main.replaceChildren(...view.body.flat().filter(Boolean));
const admin = setup({ h, photo, API: '/api/account', S: { me: { id: 'admin' } },
  wide: () => innerWidth >= 1100, freshly: fn => Promise.resolve().then(fn),
  call: async () => ({ users }), redraw: () => render(admin.parts['admin/accounts']()),
  pushSheet: view => render(view()), day: () => '8 Nov', icon: () => '',
  patch: () => {}, siteUrl: path => path
});
render(admin.parts['admin/accounts']());
</script>`;
let browser;
before(async () => {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM || existsSync('/usr/bin/chromium')
      ? { executablePath: process.env.CHROMIUM || '/usr/bin/chromium' } : {}),
    args: ['--no-sandbox']
  });
});
after(async () => browser?.close());

for (const assets of ['', 'min/']) {
  for (const [width, theme] of [[390, 'light'], [1099, 'dark'], [1100, 'light'], [1440, 'dark']]) {
    test(`${assets || 'source/'}Admin avatars fill their circles at ${width}px (${theme})`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
      try {
        await context.route('http://account.test/**', route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: fixture });
          if (url.pathname === '/styles.css' || url.pathname === '/admin.js') {
            const name = url.pathname === '/styles.css' ? 'styles.css' : 'admin.js';
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript',
              body: readFileSync(resolve(ROOT, assets + 'account/' + name)) });
          }
          if (url.pathname === '/api/account/admin/avatar') {
            const portrait = url.searchParams.get('id') === 'portrait';
            return route.fulfill({ contentType: 'image/svg+xml', body:
              `<svg xmlns="http://www.w3.org/2000/svg" width="${portrait ? 60 : 180}" height="${portrait ? 180 : 60}"><rect width="100%" height="100%" fill="#234567"/></svg>` });
          }
          return route.fulfill({ status: 404, body: '' });
        });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://account.test/');
        await page.locator('.adm-av').nth(2).waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('.adm-av img')].every(img => img.complete && img.naturalWidth));
        const geometry = () => page.locator('.adm-av').evaluateAll(avatars => avatars.map(avatar => {
          const box = avatar.getBoundingClientRect(), img = avatar.querySelector('img'), image = img?.getBoundingClientRect();
          return { width: box.width, height: box.height, round: getComputedStyle(avatar).borderRadius,
            clipped: getComputedStyle(avatar).overflow, fit: img && getComputedStyle(img).objectFit,
            image: image && { width: image.width, height: image.height, x: image.x - box.x, y: image.y - box.y } };
        }));
        if (process.env.AVATAR_SCREENSHOTS) {
          mkdirSync(process.env.AVATAR_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: `${process.env.AVATAR_SCREENSHOTS}/${assets ? 'min' : 'source'}-${width}.png` });
        }
        const avatars = await geometry();
        assert.equal(avatars.length, 3);
        for (const avatar of avatars) {
          assert.equal(avatar.width, 36); assert.equal(avatar.height, 36);
          assert.equal(avatar.round, '50%'); assert.equal(avatar.clipped, 'hidden');
          if (avatar.image) {
            assert.equal(avatar.fit, 'cover');
            assert.deepEqual(avatar.image, { width: 36, height: 36, x: 0, y: 0 }, 'photo must cover the entire avatar');
          }
        }
        assert.equal(avatars[2].image, undefined, 'accounts without photos keep their initials');
        await page.locator(width >= 1100 ? 'button.at-row' : 'button.row').first().click();
        await page.locator('.adm-av.xl img').waitFor();
        const [detail] = await geometry();
        assert.deepEqual(detail.image, { width: 76, height: 76, x: 0, y: 0 }, 'detail portrait stays full size');
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}
