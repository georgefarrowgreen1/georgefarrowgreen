// The site's email (functions/_email.js), every app's: each from its own address on the one domain, under its own
// name, with a shared layout and the account and subscription links below the message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { BRANDS, emailFrom, emailBody, sendEmail } from '../../../functions/_email.js';
import { accountMail } from '../../../functions/_account.js';

const ROOT = new URL('../../../', import.meta.url).pathname;

test('each app from its own address: at inflite.ai by Cloudflare where that\'s set up, the home page\'s at georgefarrowgreen.com', () => {
  const CF = { CF_EMAIL_TOKEN: 't', CF_ACCOUNT_ID: 'a' };
  for (const from of ['Chat <noreply@georgefarrowgreen.com>', 'noreply@georgefarrowgreen.com', ' noreply@georgefarrowgreen.com ']) {
    assert.equal(emailFrom({ PIGEON_FROM: from, ...CF }, 'inflight'), 'InFlite Chat <chat@inflite.ai>', from);
    assert.equal(emailFrom({ PIGEON_FROM: from, ...CF }, 'account'), 'InFlite Account <account@inflite.ai>', from);
    assert.equal(emailFrom({ PIGEON_FROM: from }, 'account'), 'InFlite Account <account@georgefarrowgreen.com>', 'without Cloudflare: by Resend, from its domain, as before');
  }
  assert.equal(emailFrom({ PIGEON_FROM: 'noreply@georgefarrowgreen.com', ...CF }, 'weather'), 'InFlite Weather <weather@inflite.ai>');
  assert.equal(emailFrom({ PIGEON_FROM: 'noreply@georgefarrowgreen.com', ...CF }, 'website'), 'Website <website@georgefarrowgreen.com>', 'the bio site\'s own, from its own domain');
  assert.equal(emailFrom({ PIGEON_FROM: 'noreply@georgefarrowgreen.com', CONTACT_FROM: 'Website <noreply@gfg.example>' }, 'website'), 'Website <website@gfg.example>', 'the contact form\'s domain, where it has one of its own');
  assert.equal(emailFrom({ CONTACT_FROM: 'Website <noreply@georgefarrowgreen.com>' }, 'account'), 'InFlite Account <account@georgefarrowgreen.com>');
  assert.equal(emailFrom({ ...CF, APPS_MAIL_DOMAIN: 'mail.example.com' }, 'account'), 'InFlite Account <account@mail.example.com>', 'APPS_MAIL_DOMAIN, to say otherwise');
  assert.equal(emailFrom({}, 'account'), 'InFlite Account <onboarding@resend.dev>', 'Resend\'s test sender until a domain\'s set up (the one address it allows)');
  assert.equal(emailFrom({ PIGEON_FROM: 'Chat <onboarding@resend.dev>' }, 'inflight'), 'InFlite Chat <onboarding@resend.dev>');
  assert.throws(() => emailFrom({}, 'nobody'), /No email brand "nobody"/, 'an app that isn\'t a brand doesn\'t send');
});
test('by Cloudflare: its API, the sender named, a reply-to and the unsubscribe headers; a refusal or a bounce is a failure', async () => {
  const sent = [], was = globalThis.fetch;
  let answer = { success: true, errors: [], result: { delivered: ['rowan@example.com'], permanent_bounces: [], queued: [], message_id: '<test@inflite.ai>' } };
  globalThis.fetch = async (url, init) => { sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) }); return new Response(JSON.stringify(answer), { status: answer.success ? 200 : 403 }); };
  try {
    const env = { RESEND_API_KEY: 'k', PIGEON_FROM: 'noreply@georgefarrowgreen.com', CF_EMAIL_TOKEN: 'cft', CF_ACCOUNT_ID: 'acc' };
    const delivered = await sendEmail(env, { brand: 'account', to: 'rowan@example.com', replyTo: 'help@example.com', subject: 'S', text: 't', html: 'h', headers: { 'List-Unsubscribe': '<https://x/>' } });
    assert.deepEqual(delivered, { service: 'Cloudflare', status: 'delivered', messageId: '<test@inflite.ai>' });
    assert.equal(sent[0].url, 'https://api.cloudflare.com/client/v4/accounts/acc/email/sending/send');
    assert.equal(sent[0].auth, 'Bearer cft');
    assert.deepEqual(sent[0].body.from, { address: 'account@inflite.ai', name: 'InFlite Account' });
    assert.equal(sent[0].body.reply_to, 'help@example.com'); assert.equal(sent[0].body.headers['List-Unsubscribe'], '<https://x/>');
    await sendEmail(env, { brand: 'website', to: 'me@example.com', subject: 'S', text: 't', html: 'h' });
    assert.equal(sent[1].url, 'https://api.resend.com/emails', 'the home page\'s still by Resend');
    assert.equal(sent[1].body.from, 'Website <website@georgefarrowgreen.com>');
    answer = { success: true, errors: [], result: { delivered: [], permanent_bounces: ['x@example.com'], queued: [] } };
    await assert.rejects(sendEmail(env, { brand: 'inflight', to: 'x@example.com', subject: 'S', text: 't', html: 'h' }, { explain: true }), /Cloudflare refused the email: The address bounced/);
    const message = { brand: 'inflight', to: 'x@example.com', subject: 'S', text: 't', html: 'h' };
    answer = { success: true, result: { suppressed_recipients: ['x@example.com'] } };
    await assert.rejects(sendEmail(env, message, { explain: true }), /The address is on the suppression list/);
    answer = { success: true, result: {} };
    await assert.rejects(sendEmail(env, message, { explain: true, requireReceipt: true }), /No sending receipt was returned/);
    answer = { success: true, result: { queued: ['x@example.com'], message_id: '<queued@inflite.ai>' } };
    assert.deepEqual(await sendEmail(env, message, { requireReceipt: true }), { service: 'Cloudflare', status: 'queued', messageId: '<queued@inflite.ai>' });
    answer = { success: false, errors: [{ code: 10102, message: 'email.sending.error.forbidden' }], result: null };
    await assert.rejects(sendEmail(env, { brand: 'inflight', to: 'x@example.com', subject: 'S', text: 't', html: 'h' }, { explain: true }), /Cloudflare refused the email: email\.sending\.error\.forbidden/);
  } finally { globalThis.fetch = was; }
});

test('every app\'s pictures are drawn: its tiles and every symbol, in mail/', () => {
  for (const [brand, B] of Object.entries(BRANDS)) {
    assert.ok(B.tile in B.art.tiles, `${brand}: its usual tile is one of its own`);
    for (const tile of Object.keys(B.art.tiles)) assert.ok(existsSync(`${ROOT}mail/${brand}-${tile}.png`), `${brand}-${tile}.png`);
    for (const sym of ['person', 'at', 'clock', 'pin', 'phone', 'key', 'grid', 'link', 'passkey', 'mail', 'lock', 'bird', 'route', 'star', 'dot'])
      assert.ok(existsSync(`${ROOT}mail/g-${brand}-${sym}.png`), `g-${brand}-${sym}.png`);
    assert.ok(existsSync(`${ROOT}${B.art.badge}`), `${brand}: its icon`);
  }
});

test('every InFlite brand starts with its name and title and supports both colour schemes', () => {
  for (const [brand, name] of [['account', 'Account'], ['inflight', 'Chat'], ['weather', 'Weather'], ['status', 'Status']]) {
    const { html } = emailBody({ brand, title: 'Service update', lines: ['What happened'] });
    assert.match(html, /content="light dark"/);
    assert.match(html, /@media \(prefers-color-scheme:dark\)\{[\s\S]*\.ml-surface\{background:#171b24!important;color:#edf2fa!important/);
    assert.match(html, /src="https:\/\/inflite\.ai\/icon-192\.png" width="27" height="27" alt=""/);
    assert.match(html, new RegExp(`>InFlite ${name}</td>[\\s\\S]*<h1[^>]*>Service update</h1>[\\s\\S]*>What happened</p>`));
    assert.doesNotMatch(html, /linear-gradient|radial-gradient|ml-tile/);
  }
  assert.throws(() => emailBody({ title: 'x', brand: 'nobody' }), /No email brand/);
});

test('sign-in emails keep a single main action, copyable security link and complete plain-text version', () => {
  const url = 'https://inflite.ai/account/#secure=example', first = 'Someone just signed in to your account.';
  const { html, text } = emailBody({ title: 'A new sign-in', brand: 'account', pill: ['phone', 'iPhone · Safari'],
    lines: [first, 'If it wasn’t you, use the link below.'], rows: [['Account', '@rowan'], ['How', 'Password']],
    button: { label: 'This wasn’t me', url } });
  assert.match(html, /<h1[^>]*>A new sign-in<\/h1>[\s\S]*>Someone just signed in to your account\.<\/p>[\s\S]*>iPhone · Safari<\/span>/);
  assert.match(html, /class="ml-panel"[\s\S]*>Account<\/td>[\s\S]*>@rowan<\/td>[\s\S]*>How<\/td>[\s\S]*>Password<\/td>/);
  assert.equal((html.match(/class="ml-action"/g) || []).length, 1);
  assert.match(html, /href="https:\/\/inflite\.ai\/account\/#secure=example"[^>]*>This wasn’t me<\/a>/);
  assert.match(html, /Copyable link<br><a class="ml-link"[^>]*>https:\/\/inflite\.ai\/account\/#secure=example<\/a>/);
  assert.match(html, /About your inflite\.ai account<br><a class="ml-link" href="https:\/\/inflite\.ai\/account\/"[^>]*>Manage your account<\/a>/);
  assert.deepEqual(text.split('\n\n'), ['A new sign-in', 'iPhone · Safari', first, 'If it wasn’t you, use the link below.', 'Account: @rowan', 'How: Password',
    `This wasn’t me: ${url}`, 'About your inflite.ai account\nManage your account: https://inflite.ai/account/']);
});

test('Weather briefings retain temperatures, rain chart and subscription links', () => {
  const { text, html } = emailBody({ brand: 'weather', title: 'Rain this afternoon', notice: { tone: 'yellow', lead: 'Yellow rain warning', text: 'Until 18:00 · Met Office' },
    strip: [['Morning', 'wx-rain', '10°', 'Rain'], ['Afternoon', 'wx-cloudy', '12°', 'Dry']], bar: { levels: [0, 3, 4, 0], labels: ['06:00', '12:00'] },
    button: { label: 'Open Weather', url: 'https://weather.inflite.ai/' }, fallback: false, more: { label: 'Choose which emails', url: 'https://inflite.ai/account/#emails' },
    unsub: 'https://weather.inflite.ai/api/weather/email-off?u=user&t=token&k=brief' });
  assert.match(html, /class="ml-badge ml-yellow"[^>]*>Yellow rain warning<\/span>/);
  assert.match(html, /src="https:\/\/inflite\.ai\/account\/mail\/wx-rain\.png" alt="" width="32" height="32"/);
  assert.match(html, />Rain by time<\/p>[\s\S]*class="ml-rain-4"[\s\S]*>06:00<\/td>[\s\S]*>12:00<\/td>/);
  assert.match(html, /href="https:\/\/weather\.inflite\.ai\/api\/weather\/email-off\?u=user&amp;t=token&amp;k=brief"[^>]*>Turn these emails off<\/a>/);
  assert.doesNotMatch(html, /Copyable link|Manage your account/);
  assert.match(text, /Morning: 10°, Rain\nAfternoon: 12°, Dry/);
  assert.match(text, /Turn these emails off: https:\/\/weather\.inflite\.ai\/api\/weather\/email-off\?u=user&t=token&k=brief$/);
});

test('Chat emails preserve escaped quotes and Status can use a text action', () => {
  const chat = emailBody({ brand: 'inflight', title: 'Your week in flight', quote: 'One line\n<Another line>', rows: [['Pigeons sent', 2]],
    unsub: 'https://georgefarrowgreen.com/u' });
  assert.match(chat.html, /<blockquote class="ml-quote"[^>]*>One line<br>&lt;Another line&gt;<\/blockquote>/);
  assert.match(chat.html, />Pigeons sent<\/td>[\s\S]*>2<\/td>/);
  assert.match(chat.html, /href="https:\/\/georgefarrowgreen\.com\/u"[^>]*>Turn these emails off<\/a>/);
  const status = emailBody({ brand: 'status', title: 'Mail delivery has recovered', button: { label: 'Write it up', url: 'https://inflite.ai/account/#admin=incident:sample', style: 'link' } });
  assert.match(status.html, /class="ml-action-link"[^>]*><a[^>]*href="https:\/\/inflite\.ai\/account\/#admin=incident:sample"[^>]*>Write it up<\/a>/);
  assert.doesNotMatch(status.html, /class="ml-action"|Copyable link/);
  assert.match(status.text, /Write it up: https:\/\/inflite\.ai\/account\/#admin=incident:sample/);
});

test('the home page contact email keeps its artwork and the message as written', () => {
  const site = emailBody({ title: 'A message from Rowan Hale', brand: 'website', pill: ['mail', 'rowan@example.com'], quote: 'Hello <there>,\n\nA second paragraph.',
    rows: [['Sent', '23 Oct 2026, 10:11']], button: { label: 'Reply to Rowan', url: 'mailto:rowan@example.com?subject=Re%3A%20your%20message' } });
  assert.match(site.html, /\/mail\/website-mail\.png" width="112" height="112" alt="Website"/);
  assert.match(site.html, /white-space:pre-wrap[^>]*>Hello &lt;there&gt;,\n\nA second paragraph\.<\/div>/, 'their words, escaped, their lines kept');
  assert.match(site.html, /href="mailto:rowan@example\.com\?subject=Re%3A%20your%20message"/);
  assert.doesNotMatch(site.html, /Paste this link/, 'no address to paste for an email link');
  assert.match(site.html, /From the contact form on georgefarrowgreen\.com/);
  assert.match(site.text, /^A message from Rowan Hale\n\nrowan@example\.com\n\nHello <there>,\n\nA second paragraph\.\n\nSent: 23 Oct 2026, 10:11/);
});

test('the account\'s emails are sent from "InFlite Account"; Chat\'s from "InFlite Chat"; a reply goes where it\'s asked', async () => {
  const sent = [], was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  try {
    const env = { RESEND_API_KEY: 'k', PIGEON_FROM: 'Chat <noreply@georgefarrowgreen.com>' };
    const u = { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', email_ok: 1 };
    assert.equal(await accountMail(env, u, { title: 'Your password was changed', subject: 'Your password was changed', line: 'it was.' }), true);
    assert.equal(await accountMail(env, { ...u, email_ok: 0 }, { title: 'x', subject: 'x', line: 'x' }), false, 'nothing to an email not yet confirmed');
    await sendEmail(env, { brand: 'inflight', to: u.email, subject: 'A pigeon landed', text: 't', html: 'h' });
    await sendEmail(env, { brand: 'website', to: 'me@example.com', replyTo: u.email, subject: 'A message', text: 't', html: 'h' });
    assert.deepEqual(sent.map((s) => s.from), ['InFlite Account <account@georgefarrowgreen.com>', 'InFlite Chat <chat@georgefarrowgreen.com>', 'Website <website@georgefarrowgreen.com>']);
    assert.equal(sent[2].reply_to, 'rowan@example.com');
    assert.equal('reply_to' in sent[1], false);
    assert.match(sent[0].text, /^Your password was changed\n\nHi Rowan, it was\./);
    assert.match(sent[0].text, /About your inflite\.ai account\nManage your account: https:\/\/inflite\.ai\/account\/$/);
  } finally { globalThis.fetch = was; }
});
test('an app\'s email is inflite.ai\'s throughout: its pictures from there; the home page\'s from its own site', () => {
  const app = emailBody({ brand: 'weather', title: 'Rain soon', lines: ['x'] }).html, home = emailBody({ brand: 'website', title: 'A message', lines: ['x'] }).html;
  assert.ok(/src="https:\/\/inflite\.ai\/icon-192\.png/.test(app) && !/georgefarrowgreen\.com\/mail\//.test(app), 'Weather\'s');
  assert.ok(/src="https:\/\/georgefarrowgreen\.com\/mail\//.test(home) && !/inflite\.ai\/mail\//.test(home), 'the contact form\'s');
});
