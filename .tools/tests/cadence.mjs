// Cadence (train/), the training app's demo, in a real browser on a fixed Tuesday: it opens on today's session with
// fitness and form worked out; a workout goes out as each device's file (a FIT workout a Garmin reads, ZWO for Zwift, a
// .plan for an older ELEMNT); files come in, chosen together (a Wahoo's FIT ride, a GPX, a ZWO workout, and a zip as
// Garmin Connect's "Export original" makes it, deflated), and an imported ride goes out again as FIT with every sample;
// imported rides stay after a reload; tired legs on a hard day swap it for an easy one; a built workout is saved; another
// plan can be started; and no screen scrolls sideways on a small phone.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { readFit, writeFit } from '../../train/fit.js';
import { zwoFromWorkout, gpxFromActivity, crc32 } from '../../train/formats.js';
import { workoutById } from '../../train/workouts.js';
import { demo, samples } from '../../train/sample.js';

const [,, S, out = '/tmp/cadence-out'] = process.argv;
const BASE = process.env.TEST_BASE || 'http://localhost:8788';
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
mkdirSync(out, { recursive: true });

// the files to import: a ride as a Wahoo ELEMNT BOLT writes it, the same ride a day on as GPX, a workout as Zwift's, and
// a zip of a ride as Garmin Connect gives it (deflated)
const TUESDAY = new Date(2026, 9, 20, 10, 0, 0).getTime();
const D = demo(TUESDAY), ride = samples(D.history.find((h) => h.workout === 'endurance-90' && !h.indoor));
const t0 = Math.round(TUESDAY / 1000) - 86400 * 2;
const wahoo = writeFit([['fileId', { type: 4, manufacturer: 32, product: 31, serial: 4242, created: t0 }],
  ['deviceInfo', { timestamp: t0, deviceIndex: 0, manufacturer: 32, product: 31, productName: 'ELEMNT BOLT' }],
  ...ride.s.t.map((t, i) => ['record', { timestamp: t0 + t, lat: ride.s.lat[i], lon: ride.s.lon[i], altitude: ride.s.ele[i], heartRate: ride.s.hr[i], cadence: ride.s.cad[i], distance: ride.s.dist[i], speed: ride.s.spd[i], power: ride.s.pwr[i] }]),
  ['session', { timestamp: t0 + ride.s.t.at(-1), startTime: t0, sport: 2, subSport: 7, elapsed: ride.s.t.at(-1), timer: ride.s.t.at(-1) }]]);
const gpx = gpxFromActivity({ ...ride, start: (t0 + 86400) * 1000, name: 'Morning ride' });
const garmin = writeFit([['fileId', { type: 4, manufacturer: 1, product: 3843, serial: 99, created: t0 - 86400 }],
  ...Array.from({ length: 1800 }, (_, i) => ['record', { timestamp: t0 - 86400 + i, heartRate: 130 + (i % 20), power: 180 + (i % 40), cadence: 85 }]),
  ['session', { timestamp: t0 - 86400 + 1799, startTime: t0 - 86400, sport: 2, subSport: 6, elapsed: 1800, timer: 1800 }]]);
const zipOf = (name, data) => {
  const n = Buffer.from(name), packed = deflateRawSync(data), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(packed.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(packed.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + packed.length, 16);
  return Buffer.concat([lh, n, packed, cd, n, end]);
};

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
// (a step that throws still says what the page said first)
process.on('uncaughtException', (e) => { console.log(`FAIL  ${e.message.split('\n')[0]}`); if (errs.length) console.log('page errors: ' + errs.join(' | ')); console.log(`FAILS ${fails + 1}`); process.exit(0); });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const p = await ctx.newPage();
await p.clock.setFixedTime(TUESDAY);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const settle = (ms = 600) => p.waitForTimeout(ms);
const download = async (click) => { const [d] = await Promise.all([p.waitForEvent('download'), click()]); return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) }; };

// 1. today
await p.goto(`${BASE}/train/`);
await p.waitForSelector('.fig b', { timeout: 20000 });
ok(await p.locator('.session h2').innerText() === 'Sweet spot 2 × 20', 'Tuesday of week 5: today’s session is the plan’s', await p.locator('.session h2').innerText());
const figs = await p.locator('.fig b').allInnerTexts();
ok(figs.length === 3 && figs.every((f) => /^[−+]?\d+$/.test(f)), 'fitness, fatigue and form, worked out from the rides', figs.join(' / '));
ok((await p.locator('.wday').count()) === 7, 'the week, day by day');
await p.screenshot({ path: `${out}/today.png` });

// 2. a workout out to each device
await p.click('.tab:nth-child(3)'); await settle();
await p.getByRole('button', { name: /^Sweet spot 3 × 12/ }).click(); await settle();
await p.click('.sheet-body .btn'); await settle();
const fit = await download(() => p.getByRole('button', { name: /Edge or watch/ }).click());
const M = readFit(fit.bytes).messages;
ok(fit.name === 'Sweet spot 3 x 12.fit' && M.fileId[0].type === 5 && M.workoutStep.length === 5 && M.workoutStep[3].durationType === 6,
  'Garmin: a FIT workout file, its repeat pointing back to its block', `${fit.name} ${M.workoutStep?.length} steps`);
const zwo = await download(() => p.getByRole('button', { name: /^Zwift/ }).click());
ok(zwo.name.endsWith('.zwo') && /<IntervalsT Repeat="3" OnDuration="720"/.test(zwo.bytes.toString()), 'Zwift: a ZWO file', zwo.name);
const plan = await download(() => p.getByRole('button', { name: /Earlier ELEMNT/ }).click());
ok(plan.name.endsWith('.plan') && /^=HEADER=\nNAME=Sweet spot 3 × 12/.test(plan.bytes.toString()), 'an older ELEMNT: a .plan file', plan.name);
await p.keyboard.press('Escape'); await settle(700);

// 3. files in, chosen together
await p.click('.tab:nth-child(4)'); await settle();
await p.setInputFiles('#files', [
  { name: 'wahoo.fit', mimeType: 'application/octet-stream', buffer: Buffer.from(wahoo) },
  { name: 'ride.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) },
  { name: 'Hills.zwo', mimeType: 'application/xml', buffer: Buffer.from(zwoFromWorkout({ ...workoutById('hill-6x3'), name: 'Hills from Zwift' })) },
  { name: 'activity_123.zip', mimeType: 'application/zip', buffer: zipOf('123_ACTIVITY.fit', Buffer.from(garmin)) },
  { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
]);
await p.waitForSelector('#sheet[open] .sheet-top', { timeout: 10000 }); await settle();
const sub = await p.locator('#sheet .sheet-top .sub').innerText();
ok(/3 activities · 1 workout/.test(sub), 'three rides (one from the zip) and a workout, imported', sub);
ok(await p.locator('#sheet').getByText(/notes\.txt: Cadence reads FIT/).count() === 1, 'a file it can’t read: said, by name, with why');
ok(await p.locator('#sheet').getByText('Wahoo ELEMNT BOLT', { exact: false }).count() >= 1, 'the Wahoo ride says what recorded it');
await p.screenshot({ path: `${out}/imported.png` });
// (an imported ride, and out again as FIT with every sample)
await p.locator('#sheet .row', { hasText: 'Wahoo ELEMNT BOLT' }).first().click(); await settle(1200);
const stats = await p.locator('#sheet .stat').allInnerTexts();
ok(stats.some((s) => /Normalized Power/.test(s)) && stats.some((s) => /Distance/.test(s)), 'its figures: distance, Normalized Power and the rest', stats.length + ' figures');
ok(await p.locator('#sheet .map svg .route').count() > 0, 'its route, drawn');
const back = await download(() => p.locator('#sheet .row', { hasText: /^FIT/ }).click());
ok(readFit(back.bytes).messages.record.length === ride.s.t.length, 'out again as FIT: every sample', `${readFit(back.bytes).messages.record.length} of ${ride.s.t.length}`);
await p.keyboard.press('Escape'); await settle(700);
await p.reload(); await p.waitForSelector('.head h1', { timeout: 20000 }); await settle();
ok(await p.locator('.head h1').innerText() === 'Activities' && await p.getByText('Wahoo ELEMNT BOLT', { exact: false }).count() >= 1, 'after a reload: back on Activities, the imported rides still here');

// 4. tired legs on a hard day
await p.click('.tab:nth-child(1)'); await settle();
for (const [k, v] of [['sleep', 'Poor'], ['legs', 'Heavy'], ['mood', 'Low']]) await p.locator(`.seg[aria-label="${k}"] button`, { hasText: v }).click();
await settle();
ok(await p.getByText('Swap today for something easy').count() === 1, 'tired, on a sweet spot day: an easier session offered');
await p.getByRole('button', { name: 'Swap for a recovery spin' }).click(); await settle();
ok(await p.locator('.session h2').innerText() === 'Recovery spin', 'and swapped in', await p.locator('.session h2').innerText());

// 5. a workout built and saved; another plan started
await p.click('.tab:nth-child(3)'); await settle();
await p.click('.head .round:not(.me)'); await settle(800);
await p.fill('#sheet input.field', 'Tuesday threes');
await p.getByRole('button', { name: /Repeat$/ }).click();
await p.getByRole('button', { name: 'Save' }).click(); await settle(800);
ok(await p.locator('.section', { hasText: 'Yours' }).getByText('Tuesday threes').count() === 1, 'a built workout, saved to yours');
await p.click('.tab:nth-child(2)'); await settle();
await p.getByRole('button', { name: /^FTP builder/ }).click(); await settle();
await p.getByRole('button', { name: /^Start next Monday/ }).click(); await settle(800);
ok(/^FTP builder · starts Mon 26 Oct/.test(await p.locator('.head .sub').innerText()), 'another plan, starting next Monday', await p.locator('.head .sub').innerText());

// 6. only your own rides: the examples off, and a plan to end on your event's day (one too near for all its weeks
// starts partway, the weeks before not missed)
await p.click('.round.me'); await settle(800);
await p.getByRole('button', { name: /Showing example rides/ }).click(); await settle(600);
await p.keyboard.press('Escape'); await settle(700);
await p.click('.tab:nth-child(4)'); await settle();
ok(/^3 activities/.test(await p.locator('.head .sub').innerText()), 'Activities: only the three imported', await p.locator('.head .sub').innerText());
await p.click('.tab:nth-child(1)'); await settle(1200);
ok(await p.locator('.fig b').count() === 3, 'fitness and form, from your own rides alone');
await p.click('.tab:nth-child(2)'); await settle();
await p.getByRole('button', { name: /^Sportive 160 km/ }).click(); await settle();
await p.fill('#plan-end', '2027-01-03'); await settle(300);
const by = await p.locator('#sheet .btn.quiet').innerText();
ok(/^Start at week 6, to end Sun 3 Jan 2027/.test(by), 'an event ten weeks off: the 16-week plan starts at week 6', by);
await p.locator('#sheet .btn.quiet').click(); await settle(800);
ok(/^Sportive 160 km · week 6 of 16/.test(await p.locator('.head .sub').innerText()) && await p.locator('.badge.plan').count() === 0, 'in week 6, nothing before it missed', await p.locator('.head .sub').innerText());

// 7. nothing scrolls sideways on a small phone
await p.setViewportSize({ width: 320, height: 640 }); await settle();
const wide = [];
for (const i of [1, 2, 3, 4]) { await p.click(`.tab:nth-child(${i})`); await settle(400); if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) wide.push(i); }
ok(!wide.length, 'at 320 px wide, no screen scrolls sideways', wide.join(','));
ok(!errs.length, 'no errors on the page', errs.slice(0, 3).join(' | '));

await b.close();
console.log(`FAILS ${fails}`);
process.exit(0);
