// What a late pigeon says about why: never "Delayed 10h · a tailwind". A pigeon that sheltered from storms
// (10 hours) and then met a tailwind ahead says it was the storms; one with nothing to go on says bad weather.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, api, sess, openChat, say } = K;
const R = await K.phone('reuben'), M = await K.phone('mira');
await K.signup(R, 'Reuben Tan', 'reuben', 'reuben@example.com', 'London');
await K.signup(M, 'Mira Okafor', 'mira', 'mira@example.com', 'Sydney');
const [rs, ms] = [await sess(R), await sess(M)];
await api(rs.token, 'friends', { handle: ms.me.handle }); await api(ms.token, 'friends-respond', { id: rs.me.id, accept: true });
await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, ms.me.id); await say(R, 'rocket', 'Over the Indian Ocean?');
const m = one(`SELECT id, sent_at, deliver_at, legs FROM pg_msgs WHERE sender = '${rs.me.id}'`)[0];
const mid = m.sent_at + (m.deliver_at - m.sent_at) * 0.4, H = 3600e3;
// it sheltered from storms over India for 10 hours; the latest weather ahead is a tailwind over the Indian Ocean
const legs = `json_array(json_array(20.5, 78.9, ${mid}, 'h', 'in India'), json_array(20.5, 78.9, ${mid + 10 * H}, 'h', 'in India'))`;
one(`UPDATE pg_msgs SET wx = json_object('k', 'tailwind', 'lat', -20, 'lon', 80), wx_ms = ${10 * H}, deliver_at = deliver_at + ${10 * H}, legs = ${legs} WHERE id = '${m.id}'`);
const chip = async () => { await R.p.reload(); await R.p.waitForSelector('.tabs'); await openChat(R, ms.me.id); await R.p.evaluate((id) => { const x = document.createElement('button'); x.hidden = true; x.dataset.act = 'map'; x.dataset.id = id; document.querySelector('#screen').append(x); x.click(); x.remove(); }, m.id);
  await R.p.waitForTimeout(2500);
  return (await R.p.locator('body').innerText()).replace(/\s+/g, ' '); };
const a = await chip();
ok(/Delayed 10h[^·]*· storms over India/.test(a) && !/Delayed[^·]*· a tailwind/.test(a), 'late after sheltering from storms: it says storms, not the tailwind ahead', (a.match(/Delayed[^·]*·[^0-9]*/) || [''])[0]);
await R.p.screenshot({ path: `${out}/late-says-storms.png` });
// nothing on its way to say why: just bad weather
one(`UPDATE pg_msgs SET legs = NULL WHERE id = '${m.id}'`);
const b = await chip();
ok(/Delayed 10h[^·]*· bad weather/.test(b), 'late with nothing to go on: bad weather', (b.match(/Delayed[^·]*·[^0-9]*/) || [''])[0]);
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
