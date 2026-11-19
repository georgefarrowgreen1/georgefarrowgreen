const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./gallery-fixture.cjs');

test('the bio and 404 footers offer Get in touch, the GFG mark and Instagram', async () => {
  const { ctx, p } = await fixture('', { js: false });
  try {
    await ctx.route('**/missing-ride', route => route.fulfill({ status: 404, contentType: 'text/html', path: require.resolve('../../404.html') }));
    for (const path of ['/', '/missing-ride']) {
      await p.goto(new URL(path, p.url()).href);
      const footer = p.locator('footer');
      assert.deepEqual(await footer.locator('.fi-footer :is(a, button)').allTextContents(), ['Get in touch', '', 'Instagram']);
      const mark = footer.getByRole('link', { name: 'Open My details' });
      assert.equal(await mark.getAttribute('href'), path === '/' ? '/details/George-Farrow-Green.vcf' : '/#my-details');
    }
    await p.locator('footer .fi-footer-mark').click();
    assert.ok(await p.locator('.fi-footer-mark').evaluate(el => el.matches(':target') && el.hasAttribute('download')));
  } finally { await ctx.close(); }
});

for (const js of [true, false]) {
  test(`the cottage photograph is fetched by opening its project (JavaScript ${js})`, async () => {
    const { ctx, p } = await fixture('', { js, hash: '#projects' });
    try {
      const cottage = p.locator('.fi-entry').last();
      await cottage.scrollIntoViewIfNeeded();
      await p.waitForLoadState('load');
      assert.equal(await cottage.evaluate(el => el.open), false);
      assert.equal(await p.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.endsWith('/projects/blakeney.webp'))), false);
      const photo = p.waitForResponse(r => new URL(r.url()).pathname === '/projects/blakeney.webp');
      await cottage.locator('summary').focus();
      await p.keyboard.press('Enter');
      assert.equal((await photo).status(), 200);
      assert.equal(await cottage.evaluate(el => el.open), true);
    } finally { await ctx.close(); }
  });
}

for (const variant of ['shared', 'reduced', 'different photo']) {
  test(`404 photographs return to the bio gallery: ${variant}`, async () => {
    const { ctx, p, errors } = await fixture('', { reduce: variant === 'reduced', hash: '#fi-photos' });
    try {
      await ctx.route('**/missing-ride', route => route.fulfill({ status: 404, contentType: 'text/html', path: require.resolve('../../404.html') }));
      assert.equal((await p.goto(new URL('/missing-ride', p.url()).href)).status(), 404);
      if (variant === 'different photo') await p.locator('.lost-road img').evaluate(img => { img.src = '/projects/hillside-climb.webp'; });
      await p.locator('.lost-prints img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      await ctx.addInitScript(() => {
        window.arrival = { shared: false, intro: false };
        new MutationObserver(() => {
          window.arrival.intro ||= !!document.querySelector('.photo-wait,.opening-mark,.contact-handoff,.contact-return');
          window.arrival.shared ||= !!document.querySelector('.photo-native,.photo-flight');
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
      });
      await p.locator('.lost-home').click();
      await p.waitForURL(url => url.pathname === '/');
      if (variant === 'shared') await p.waitForFunction(() => window.arrival.shared);
      await p.locator('body.known').waitFor();
      assert.deepEqual(await p.evaluate(() => window.arrival), { shared: variant === 'shared', intro: false });
      await p.waitForFunction(() => !document.querySelector('.photo-native,.photo-flight'));
      assert.equal(await p.locator('.fi-reel [aria-pressed="true"]').count(), 1);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

for (const assets of ['', 'min/']) {
  for (const [link, sheet] of [['#report', '#contact-sheet'], ['.fi-footer-mark', '#details-sheet']]) {
    test(`${assets || 'source/'}404 link to ${sheet} opens after the native page reveal`, async () => {
      const {ctx, p, errors} = await fixture(assets, {hash:'#apps'});
      try {
        await ctx.route('**/missing-ride', route => route.fulfill({status:404, contentType:'text/html', path:require.resolve('../../404.html')}));
        await p.goto(new URL('/missing-ride',p.url()).href);
        await p.locator(link).click();
        await p.locator(sheet+'[open]').waitFor();
        await p.keyboard.press('Escape');
        await p.locator(sheet).waitFor({state:'hidden'});
        const returnFocus = sheet === '#details-sheet' ? '.fi-footer-mark' : '.fi-menubtn';
        await p.waitForFunction(selector => document.activeElement.matches(selector), returnFocus);
        assert.deepEqual(errors,[]);
      } finally { await ctx.close(); }
    });
  }
  for (const options of [{ reduce: true }, { back: true }, { hash: '#apps' }, { js: false }, { missing: '/loader.js' }, { missing: '/app.js' }]) {
    test(`${assets || 'source/'}the photographic page stays usable with ${JSON.stringify(options)}`, async () => {
      const f = await fixture(assets, options);
      try {
        await f.p.locator('#fi-photos').waitFor({state: 'visible'});
        assert.equal(await f.p.locator('.opening-mark, .skip-opening').count(), 0);
        assert.equal(await f.p.locator('#apps a').count(), 4);
        assert.equal(await f.p.locator('#apps a').first().isVisible(), true);
        if (options.js === false || options.missing === '/app.js') {
          await f.ctx.route('**/contact/', route => route.fulfill({contentType:'text/html',path:require.resolve('../../contact/index.html')}));
          if (options.js === false) {
            await f.p.getByRole('link', {name:'Get in touch'}).click();
          } else {
            await f.p.locator('.fi-menubtn').click();
            await f.p.getByRole('link', {name:'Quick message'}).click();
          }
          await f.p.waitForURL(url => url.pathname === '/contact/');
          await f.p.locator('.direct a[href^="mailto:"]').waitFor({state: 'visible'});
        }
        assert.deepEqual(f.errors, []);
      } finally { await f.ctx.close(); }
    });
  }
  for (const missing of ['', '/loader.js']) {
    test(`${assets || 'source/'}a reported link opens and restores focus ${missing ? 'without the menu loader' : 'to the menu'}`, async () => {
      const f = await fixture(assets, { hash: '#contact=%2Fmissing', missing });
      try {
        await f.p.locator('#contact-sheet[open]').waitFor();
        assert.match(await f.p.locator('#c-message').inputValue(), /missing/);
        assert.equal(await f.p.locator('.skip-opening').count(), 0);
        await f.p.keyboard.press('Escape');
        await f.p.waitForFunction(selector => document.activeElement.matches(selector), missing ? '.fi-contact-page' : '.fi-menubtn');
        assert.deepEqual(f.errors, []);
      } finally { await f.ctx.close(); }
    });
  }
}

for (const width of [390, 1440]) {
  test(`gallery at ${width}px reverses from the visible crop and settles to the same geometry`, async () => {
    const f = await fixture('', { width, hash: '#fi-photos' });
    try {
      const page = f.p;
      await page.locator('#fi-photos img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      const result = await page.evaluate(async () => {
        const panels = [...document.querySelectorAll('[data-scene]')];
        const edges = () => panels.flatMap(panel => {
          const a = panel.getBoundingClientRect(), b = panel.querySelector('.fi-window').getBoundingClientRect();
          return [a.left, Math.min(a.right, b.right)];
        });
        const pauseAt = time => {
          for (const animation of document.querySelector('#fi-photos').getAnimations({subtree:true})) {
            animation.pause(); animation.currentTime = time;
          }
        };
        panels[1].click(); pauseAt(210);
        const before = edges();
        panels[2].click(); pauseAt(0);
        const after = edges();
        pauseAt(510);
        const end = edges();
        for (const a of document.querySelector('#fi-photos').getAnimations({subtree:true})) a.finish();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return {before, after, end, resting:edges()};
      });
      for (const [a, b] of [[result.before, result.after], [result.end, result.resting]]) {
        assert.ok(a.every((edge, i) => Math.abs(edge - b[i]) < 1), 'crop edges stay continuous');
      }
      const last = page.locator('[data-scene="2"]');
      await last.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-scene="0"]').getAttribute('aria-pressed'), 'true');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.keyboard.press('End');
      assert.equal(await last.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.fi-reel.switching').count(), 0);
      assert.deepEqual(f.errors, []);
    } finally { await f.ctx.close(); }
  });
}

test('a slow gallery photo cannot overwrite a newer selection', async () => {
  const frame = (src, label) => ({src, label, alt:label, position:'50% 50%'});
  const frames = [frame('/projects/open-road.webp','Road'), frame('/delayed-photo','Delayed'), frame('/projects/hillside-climb.webp','Climb')];
  const f = await fixture('', {hash:'#fi-photos', collection:frames});
  let delayed;
  try {
    const requested = new Promise(resolve => {
      f.p.route('**/delayed-photo', route => { delayed = route; resolve(); });
    });
    const panel = f.p.locator('[data-scene="0"]');
    await panel.click();
    await requested;
    assert.equal(await panel.locator('img').getAttribute('src'), frames[0].src);
    await panel.click();
    await f.p.waitForFunction(() => document.querySelector('[data-scene="0"] img')?.alt === 'Climb');
    await delayed.fulfill({contentType:'image/webp', path:require('node:path').resolve(__dirname, '../../projects/in-the-saddle.webp')});
    await f.p.waitForLoadState('networkidle');
    assert.equal(await panel.locator('img').count(), 1);
    assert.equal(await panel.locator('img').getAttribute('src'), frames[2].src);
    assert.equal(await panel.getAttribute('aria-label'), 'Climb, show next photograph');
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});

test('touch drags follow the finger, settle once, and leave vertical scrolling native', async () => {
  const f = await fixture('', {width:390, hash:'#top'});
  try {
    const page = f.p, reel = page.locator('.fi-reel'), session = await f.ctx.newCDPSession(page);
    await reel.locator('img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
    const bounds = await reel.boundingBox(), x = Math.round(bounds.x + bounds.width * .6), y = Math.round(bounds.y + 100);
    const touch = (type, px, py) => session.send('Input.dispatchTouchEvent', {type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{x:px, y:py, id:1}]});
    const active = () => reel.locator('[aria-pressed="true"]').getAttribute('data-scene');
    const width = () => reel.locator('button').first().evaluate(b => Math.min(b.getBoundingClientRect().right,
      b.querySelector('.fi-window').getBoundingClientRect().right) - b.getBoundingClientRect().left);
    const original = await width();
    await touch('touchStart',x,y); await touch('touchMove',x-40,y);
    const partial = await width();
    assert.ok(partial < original - 15 && partial > original - 55, 'visible edge tracks the drag');
    assert.equal(await active(), '0');
    await touch('touchCancel');
    await page.waitForFunction(() => !document.querySelector('.fi-reel.switching'));
    assert.ok(Math.abs(await width() - original) < 1);
    await touch('touchStart',x,y); await touch('touchMove',x-50,y); await touch('touchMove',x-125,y); await touch('touchEnd');
    await page.waitForFunction(() => !document.querySelector('.fi-reel.switching'));
    assert.equal(await active(), '1');
    // Preview the previous panel, then change direction before lifting.
    await touch('touchStart',x,y); await touch('touchMove',x+45,y); await touch('touchMove',x-115,y);
    await touch('touchEnd'); await page.waitForFunction(() => !document.querySelector('.fi-reel.switching'));
    assert.equal(await active(), '2');
    await reel.locator('[data-scene="1"]').click();
    await page.waitForFunction(() => !document.querySelector('.fi-reel.switching'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await touch('touchStart',x,y); await touch('touchMove',x-100,y);
    assert.equal(await reel.evaluate(el=>el.classList.contains('switching')),false);
    await touch('touchEnd'); assert.equal(await active(),'2');
    await touch('touchStart',x,y+100); await touch('touchMove',x,y+55); await touch('touchMove',x,y-65); await touch('touchEnd');
    await page.waitForFunction(()=>scrollY>30);
    assert.equal(await active(), '2');
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});

for (const width of [390, 432, 1440]) {
  test(`project reveal at ${width}px reverses from its visible pose and restores native focus behaviour`, async () => {
    const f = await fixture('min/', {width, hash:'#projects'});
    try {
      const page = f.p;
      const row = page.locator('.fi-entry').last();
      await page.locator('body.known').waitFor();
      assert.equal(await page.locator('.fi-entry[open]').count(), 0);
      const result = await row.evaluate(entry => {
        const summary = entry.querySelector('summary'), fold = entry.querySelector('.fi-fold');
        const pose = () => [fold.offsetHeight, getComputedStyle(entry.querySelector('.fi-shutter-left')).transform,
          getComputedStyle(entry.querySelector('.fi-story p')).opacity];
        summary.click();
        for (const track of fold.getAnimations({subtree:true})) {
          track.pause();
          track.currentTime = 255;
        }
        const openPose = pose();
        summary.click();
        const closingPose = pose(), inert = fold.inert;
        summary.click();
        return {openPose, closingPose, reopenedPose:pose(), inert};
      });
      assert.deepEqual(result.openPose, result.closingPose);
      assert.deepEqual(result.openPose, result.reopenedPose);
      assert.ok(result.openPose[0] > 0 && +result.openPose[2] > 0 && +result.openPose[2] < 1);
      assert.ok(result.inert);
      await page.waitForFunction(() => !document.querySelector('.project-moving'));
      assert.ok(await row.evaluate(e => e.open && e.querySelector('.fi-fold').offsetHeight > 0));
      await row.locator('a').focus();
      await row.locator('summary').evaluate(el => el.click());
      assert.ok(await row.locator('summary').evaluate(el => el === document.activeElement));
      await page.waitForFunction(() => !document.querySelector('.fi-entry:last-of-type').open);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('.fi-entry:last-of-type').open);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(() => !document.querySelector('.project-moving'));
      await page.keyboard.press('Enter');
      assert.ok(await row.evaluate(e => !e.open && !e.querySelector('.fi-fold').inert));
      assert.equal(await page.locator('.fi-entry[open]').count(), 0);
      assert.deepEqual(f.errors, []);
    } finally { await f.ctx.close(); }
  });
}

for (const width of [390, 1440]) {
  test(`My details at ${width}px opens front-facing, flips, and returns focus to the footer`, async () => {
    const {p, ctx, errors} = await fixture('min/', {width, hash:'#get-in-touch'});
    try {
      const launcher = p.locator('#my-details'), sheet = p.locator('#details-sheet');
      const toggle = sheet.locator('.calling-switch');
      await launcher.click();
      await sheet.waitFor({state:'visible'});
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
      await sheet.locator('.calling-flip').click();
      assert.equal(await toggle.innerText(), 'Show front');
      await toggle.focus();
      await p.keyboard.press('Enter');
      await toggle.click();
      await p.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
      await p.keyboard.press('Escape');
      await sheet.waitFor({state:'hidden'});
      assert.ok(await launcher.evaluate(el => el === document.activeElement));
      await launcher.click();
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
      const download = p.waitForEvent('download');
      await sheet.locator('.calling-save').click();
      assert.equal((await download).suggestedFilename(), 'George-Farrow-Green.vcf');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

for (const width of [390, 1440]) {
  test(`the footer mark departs, lands on the embossing, and reverses the same tracks at ${width}px`, async () => {
    const {p, ctx, errors} = await fixture('min/', {width, hash:'#get-in-touch'});
    try {
      const mark = p.locator('.fi-footer-mark');
      await mark.scrollIntoViewIfNeeded();
      await mark.focus();
      const result = await p.evaluate(async () => {
        const mark = document.querySelector('.fi-footer-mark'), sheet = document.querySelector('#details-sheet');
        const rect = el => {
          const {x, y, width, height} = el.getBoundingClientRect();
          return [x, y, width, height];
        };
        const origin = rect(mark);
        mark.click();
        const flyer = sheet.querySelector('.details-flight'), tracks = sheet.getAnimations({subtree:true})
          .filter(a => a.effect.target === sheet || flyer.contains(a.effect.target));
        const firstPaint = await new Promise(resolve => requestAnimationFrame(() => resolve(rect(flyer))));
        const clock = sheet.getAnimations()[0], duration = clock.effect.getTiming().duration;
        const seek = t => { for (const a of tracks) { a.pause(); a.currentTime = t * duration; } };
        seek(0);
        const start = rect(flyer);
        seek(1);
        const landing = rect(flyer), stamp = rect(sheet.querySelector('.calling-stamp'));
        seek(.43);
        const middle = rect(flyer);
        sheet.querySelector('[data-close]').click();
        return {origin, firstPaint, start, landing, stamp, middle, reverse:rect(flyer),
          sameClock:sheet.getAnimations().includes(clock), sourceHidden:getComputedStyle(mark,'::before').visibility};
      });
      const sameBox = (a,b) => a.every((v,i) => Math.abs(v-b[i]) < 1);
      assert.ok(sameBox(result.firstPaint, result.origin));
      assert.ok(sameBox(result.start, result.origin));
      assert.ok(sameBox(result.landing, result.stamp));
      assert.ok(!sameBox(result.middle, result.origin) && !sameBox(result.middle, result.stamp));
      assert.ok(sameBox(result.middle, result.reverse) && result.sameClock);
      assert.equal(result.sourceHidden, 'hidden');
      await p.locator('#details-sheet').waitFor({state:'hidden'});
      assert.equal(await mark.evaluate(el => el === document.activeElement && getComputedStyle(el,'::before').visibility === 'visible'), true);
      assert.equal(await p.locator('.details-flight').count(), 0);
      await p.emulateMedia({reducedMotion:'reduce'});
      assert.ok(await p.evaluate(async () => {
        document.querySelector('.fi-footer-mark').click();
        document.querySelector('#details-sheet [data-close]').click();
        const next = document.querySelector('.fi-footer-social');
        next.focus();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return document.activeElement === next;
      }));
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('swiping My details scrubs the turn, cancellation restores the face, and the QR settles flat', async () => {
  const {p, ctx, errors} = await fixture('min/', {width:390, hash:'#get-in-touch'});
  try {
    await p.locator('#my-details').click();
    const card = p.locator('.calling-flip'), stock = card.locator('.calling-stock');
    await card.click({trial:true}); // Wait for the opening sheet to settle.
    const box = await card.boundingBox();
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, across) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: across == null ? [] : [
      {x: box.x + across * box.width, y: box.y + box.height * .5}
    ]});
    await touch('touchStart', .85);
    await touch('touchMove', .58);
    await touch('touchMove', .21);
    const angle = await stock.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m11);
    assert.ok(angle < 0 && angle > -1, 'the card follows the drag past its edge before release');
    await touch('touchEnd');
    await p.waitForFunction(() => !document.querySelector('.calling-stock').getAnimations().length);
    assert.equal(await card.getAttribute('aria-pressed'), 'true');
    assert.equal(await stock.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m11), -1);
    await touch('touchStart', .17);
    await touch('touchMove', .7);
    await touch('touchCancel');
    await p.waitForFunction(() => !document.querySelector('.calling-stock').getAnimations().length);
    assert.equal(await card.getAttribute('aria-pressed'), 'true');
    await p.emulateMedia({reducedMotion:'reduce'});
    await touch('touchStart', .13);
    await touch('touchMove', .48);
    assert.equal(await stock.evaluate(el => el.getAnimations().length), 0);
    await touch('touchMove', .86);
    await touch('touchEnd');
    assert.equal(await card.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
