const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium, webkit } = require('playwright');

const ROOT = resolve(__dirname, '../..');
const FRAMEWORK = resolve(process.env.ROOF_IFL || resolve(ROOT, '../inflite'));

test('a recorded Fitness ride can be compared and reviewed without changing the plan', async () => {
  const { serveKit, KIT } = await import('./roofkit/serve.mjs');
  const { UID, meAnswer, rideFit, routeFitness } = await import('./mocks/fitnessmock.mjs');
  const { addDays, startOfDay } = await import('../../fitness/workouts.js');
  const browser = process.env.FITNESS_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({
    executablePath: process.env.CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 850 }, colorScheme: 'dark', reducedMotion: 'reduce',
    timezoneId: 'UTC', serviceWorkers: 'block',
  });

  try {
    const now = Date.now();
    const today = startOfDay(now);
    const day = addDays(today, -1);
    const rideStart = day + 9 * 3600e3;
    const me = meAnswer(now, { today });
    const ride = {
      ...me.acts[0], id: 'a0000000-0000-4000-8000-000000000001', name: 'Workout review ride',
      start: rideStart, file: 'workout-review.fit', gz: false,
      sum: { moving: 2400, secs: 2400, dist: 18000, avgPwr: 210, route: [10, 10, 90, 90], xv: 2 },
    };
    me.acts = [ride];
    me.offers = [];
    me.times = [];
    me.data.prefs = { ...me.data.prefs, onboarded: true, ask: false, examples: false, maps: 'tap' };
    // This day has a plausible suggestion, but the rider recorded a different workout.
    me.data.swaps[day] = 'recovery-45';
    const kitOrigin = new URL(KIT).origin;
    await context.route('**/*', (route) => new URL(route.request().url()).origin === kitOrigin ? route.fallback() : route.abort());
    await serveKit(context, { main: ROOT + '/', ifl: FRAMEWORK + '/' });
    const state = await routeFitness(context, KIT, { me });

    const activityUrl = `${KIT}/api/fitness/acts/${ride.id}`;
    const recording = rideFit(rideStart + 7200e3, { minutes: 40 });
    await context.route(activityUrl, (route) => route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/octet-stream', body: recording })
      : route.fallback());
    const reviewRequests = [];
    let saved = { ver: 0, review: null };
    await context.route(activityUrl + '/review', async (route) => {
      const request = route.request();
      const method = request.method();
      const owner = request.headers()['x-inflite-route-owner'];
      const body = method === 'PUT' ? request.postDataJSON() : undefined;
      reviewRequests.push({ method, owner, body });
      if (owner !== UID) return route.fulfill({ status: 400, json: { error: 'Wrong fixture account.' } });
      if (method === 'GET') return route.fulfill({ json: saved });
      if (method !== 'PUT') return route.fulfill({ status: 405, json: { error: 'Unexpected method.' } });
      if (body.base !== saved.ver) return route.fulfill({ status: 409, json: { conflict: true, ...saved } });
      saved = { ver: saved.ver + 1, review: body.review };
      return route.fulfill({ json: saved });
    });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(KIT + '/?module=/fitness/roof/fitness.js&apps=weather,fitness');
    await page.waitForFunction(() => window.kit?.ready);
    await page.evaluate(() => kit.F.nav.go('/fitness/'));
    await page.getByRole('tab', { name: 'Activities', exact: true }).click();
    await page.locator(`[data-k=act][data-id="${ride.id}"]`).click();
    const sheet = page.locator('dialog[data-sheet=act][open]');
    const entry = sheet.getByRole('button', { name: 'Workout review', exact: true });
    const panel = sheet.locator('[data-page=workout-review] [data-k=workout-review]');
    const selection = panel.locator('select[data-k=review-workout]');
    const effort = panel.locator('select[data-k=review-effort]');
    const notes = panel.locator('textarea[data-k=review-notes]');
    const summary = panel.locator('[data-k=review-intervals]');
    const currentSchedule = () => page.evaluate(async () => {
      const { S } = await import('/fitness/roof/core.js');
      return { swaps: S.swaps, rhythm: S.rhythm, times: S.times };
    });
    const originalSchedule = await currentSchedule();

    await entry.click();
    await panel.getByRole('heading', { name: 'Planned vs. actual', exact: true }).waitFor();
    assert.match(await selection.locator('option[value="recovery-45"]').textContent(), /scheduled that day/i);
    assert.equal(await selection.inputValue(), '', 'the day’s suggested workout must be confirmed');
    assert.equal(await summary.count(), 0);
    assert.deepEqual(reviewRequests.filter((request) => request.method !== 'GET'), []);

    await selection.selectOption({ label: 'My sweet spot' });
    await summary.waitFor();
    assert.equal(await summary.locator('li[data-result]').count(), 3);
    assert.match(await summary.textContent(), /225\s*W/, 'work interval has the planned wattage');
    assert.match(await summary.textContent(), /20[89]\s*W|210\s*W/, 'work interval shows measured ride power');
    assert.equal(await panel.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);

    await effort.selectOption('8');
    await notes.fill('Hard into the wind. Easier to hold power on the second half.');
    await panel.getByRole('button', { name: 'Save review', exact: true }).click();
    await panel.getByText('Review saved.', { exact: true }).waitFor();
    assert.deepEqual(reviewRequests.filter((request) => request.method === 'PUT'), [{
      method: 'PUT', owner: UID, body: {
        base: 0, review: { workoutId: 'mine-1', effort: 8, notes: 'Hard into the wind. Easier to hold power on the second half.' },
      },
    }]);

    await sheet.locator('[data-back]').filter({ visible: true }).click();
    await panel.waitFor({ state: 'hidden' });
    await entry.click();
    await summary.waitFor();
    assert.equal(await selection.inputValue(), 'mine-1');
    assert.equal(await effort.inputValue(), '8');
    assert.equal(await notes.inputValue(), saved.review.notes);
    assert.ok(reviewRequests.filter((request) => request.method === 'GET').length >= 2);
    assert.deepEqual(state.puts, [], 'no training plan write before confirmation');
    assert.deepEqual(state.times, [], 'no schedule write before confirmation');
    assert.deepEqual(state.today, [], 'the review does not silently submit a check-in');
    assert.deepEqual(await currentSchedule(), originalSchedule);
    assert.deepEqual(errors, []);

    const standalone = await context.newPage();
    standalone.on('pageerror', (error) => errors.push(error.message));
    await standalone.route(KIT + '/fitness/', (route) => route.fulfill({
      contentType: 'text/html', body: readFileSync(resolve(ROOT, 'fitness/index.html')),
    }));
    await standalone.goto(KIT + '/fitness/#act=' + ride.id);
    const standaloneSheet = standalone.locator('dialog#sheet[open]');
    await standaloneSheet.getByRole('button', { name: 'Workout review', exact: true }).click();
    const reopened = standaloneSheet.locator('section[data-k=workout-review]');
    await reopened.locator('[data-k=review-intervals]').waitFor();
    assert.equal(await reopened.locator('[data-k=review-workout]').inputValue(), 'mine-1');
    assert.equal(await reopened.locator('[data-k=review-effort]').inputValue(), '8');
    assert.equal(await reopened.locator('[data-k=review-notes]').inputValue(), saved.review.notes);
    assert.equal(reviewRequests.filter((request) => request.method === 'PUT').length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
  }
});
