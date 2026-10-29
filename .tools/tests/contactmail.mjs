// The site's email outside the apps (functions/_email.js): the contact form's message, in the site's look, from
// "Website", a reply going to whoever wrote; the pictures at /mail/, and the old address of them sending there.
import { readFileSync } from 'fs';
const S = process.argv[2], SITE = 'http://localhost:8788';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  — ' + x : ''}`); if (!c) fails++; };
const mails = () => readFileSync(`${S}/mailbox.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).body);

const r = await fetch(`${SITE}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Rowan Hale', email: 'rowan@example.com', message: 'Hello George,\n\nA question about <your> site.' }) });
ok(r.ok, 'the contact form takes a message', `${r.status} ${await r.text()}`);
const m = mails().at(-1) || {};
ok(m.from === 'Website <website@georgefarrowgreen.com>' && m.reply_to === 'rowan@example.com', 'it\'s emailed from the site, a reply going to whoever wrote', `${m.from} · ${m.reply_to}`);
ok(new RegExp(`<img src="${SITE.replace(/[.]/g, '\\.')}/mail/[\\w-]+\\.png"`).test(m.html || ''), 'in the site\'s look, with its own pictures');
ok(/white-space:pre-wrap[^>]*>Hello George,\n\nA question about &lt;your&gt; site\.<\/div>/.test(m.html || ''), 'their words as they wrote them');
ok(m.html?.includes('href="mailto:rowan@example.com?subject=Re%3A%20your%20message"') && /Reply to Rowan/.test(m.html), 'a button to reply');
ok(/^A message from Rowan Hale\n\nrowan@example\.com\n\nHello George,/.test(m.text || ''), 'and a plain-text version', (m.text || '').slice(0, 80));

for (const f of ['website-mail.png', 'weather-sky.png', 'account-shield.png', 'g-inflight-route.png']) {
  const p = await fetch(`${SITE}/mail/${f}`);
  ok(p.ok && p.headers.get('content-type') === 'image/png', `/mail/${f} is there`, `${p.status} ${p.headers.get('content-type')}`);
}
const old = await fetch(`${SITE}/pigeon/mail/v2/account-shield.png`, { redirect: 'manual' });
ok(old.status === 301 && old.headers.get('location') === `${SITE}/mail/account-shield.png`, 'an email sent before still finds its pictures', `${old.status} ${old.headers.get('location')}`);
const v1 = await fetch(`${SITE}/pigeon/mail/mail.png`);
ok(v1.ok, 'and the first emails\' too');
console.log(`FAILS ${fails}`); process.exit(0);
