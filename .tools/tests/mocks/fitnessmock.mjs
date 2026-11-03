// Fitness's API stood in, for the roof's kit tests (One roof stage 2, §9.2: rooffxmount, rooffxsheets): an account, its
// record and rides (unit/fixtures/fx.mjs's, dated from now), the answers fitness/account.js expects at /api/fitness/*, and
// a ride as a FIT file to import (written with fitness/fit.js, as fitness.mjs writes its Wahoo ride).
//   await routeFitness(context, KIT, st)   st collects what's asked: st.puts (PUT me bodies), st.uploads (POST acts metas),
//     st.today (POST today bodies), st.offers ([id, answer]), st.times, st.asked (every path); st.me (an answer to send
//     instead), st.meStatus (e.g. 503)
//   rideFit(now, { minutes }) → Buffer   a ride, two hours before now, with power, heart rate and a route
import { me as fxMe } from '../unit/fixtures/fx.mjs';
import { startOfDay } from '../../../fitness/workouts.js';
import { writeFit } from '../../../fitness/fit.js';

export const UID = 'u-kit-0001';
export const meAnswer = (now = Date.now(), over = {}) => fxMe(UID, { name: 'Sam Taylor', today: startOfDay(now), ...over });

export function rideFit(now = Date.now(), { minutes = 40 } = {}) {
  const t0 = Math.round(now / 1000) - 7200, n = minutes * 60, recs = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    recs.push(['record', { timestamp: t0 + i, lat: 51.45 + 0.02 * Math.sin(a), lon: -2.6 + 0.03 * Math.cos(a), altitude: 50 + 20 * Math.sin(a * 3), heartRate: 130 + (i % 25), cadence: 88, distance: i * 7.5, speed: 7.5, power: 190 + (i % 40) }]);
  }
  return Buffer.from(writeFit([['fileId', { type: 4, manufacturer: 32, product: 31, serial: 4242, created: t0 }],
    ['deviceInfo', { timestamp: t0, deviceIndex: 0, manufacturer: 32, product: 31, productName: 'ELEMNT BOLT' }],
    ...recs, ['session', { timestamp: t0 + n - 1, startTime: t0, sport: 2, subSport: 7, elapsed: n, timer: n }]]));
}

export async function routeFitness(context, KIT, st = {}) {
  Object.assign(st, { puts: [], uploads: [], today: [], offers: [], times: [], asked: [], ver: 7, ...st });
  const j = (r, o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
  await context.route(`${KIT}/api/fitness/**`, async (r) => {
    const req = r.request(), u = new URL(req.url()), p = u.pathname.replace(/^\/api\/fitness\//, ''), m = req.method();
    st.asked.push(`${m} ${p}`);
    if (p === 'me' && m === 'GET') {
      if (st.meStatus) return j(r, { error: 'Try again later.' }, st.meStatus);
      return j(r, st.me || meAnswer(Date.now()));
    }
    if (p === 'me' && m === 'PUT') { const b = JSON.parse(req.postData() || '{}'); st.puts.push(b); st.ver++; return j(r, { ver: st.ver, data: b.data }); }
    if (p === 'me/older') return j(r, { acts: [], more: false });
    if (p === 'acts' && m === 'POST') {
      const body = req.postDataBuffer()?.toString('latin1') || '', meta = /name="meta"\r\n\r\n([^\r]*)/.exec(body)?.[1];
      st.uploads.push(meta ? JSON.parse(meta) : {});
      return j(r, { kept: true });
    }
    if (p.startsWith('acts/')) return j(r, { error: 'Not found' }, 404);
    if (p === 'today' && m === 'POST') { st.today.push(JSON.parse(req.postData() || '{}')); return j(r, { ok: true }); }
    if (p.startsWith('offers/')) { const b = JSON.parse(req.postData() || '{}'); st.offers.push([p.slice(7), b.answer]); return j(r, { ok: true }); }
    if (p === 'time') { st.times.push([m, JSON.parse(req.postData() || 'null')]); return m === 'PUT' ? j(r, { time: { ...JSON.parse(req.postData() || '{}'), source: 'set' } }) : j(r, { ok: true }); }
    if (p === 'weather') return j(r, { error: 'No place' }, 404);
    if (p === 'strava/connect') return j(r, { url: 'https://www.strava.com/oauth/authorize?client_id=1' });
    if (/^(garmin|strava|health)(\/fetch)?$/.test(p)) return j(r, { on: false });
    return j(r, { error: 'Not here' }, 404);
  });
  return st;
}
